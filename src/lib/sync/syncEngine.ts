/**
 * syncEngine — background push/pull orchestrator.
 *
 * Contract:
 *  • Never blocks the UI. Runs entirely in the background.
 *  • Push order respects dependencies: profile → products → events →
 *    eventInventory/adjustments → sales → saleItems → expenses (client UUIDs
 *    mean no FK rewriting is needed — only ordering).
 *  • Exponential backoff on repeated failures; local data is NEVER wiped on
 *    sync errors.
 *  • Auth expiry is surfaced as a distinct "session" state ("Your session needs
 *    refreshing to sync — your data is safe on this device") — separate from a
 *    generic sync issue, and never discards queued operations.
 *  • Pull merges with conflictResolution.resolveRow; only soft deletes, never
 *    hard deletes.
 */
import { db } from "@/lib/db/dexie";
import { APPEND_ONLY, SERVER_TABLE, SYNC_PRIORITY } from "@/lib/db/schema";
import { TABLE_BY_TYPE, markRowSynced, markRowSyncError, stripLocalFields } from "@/lib/repositories/baseRepository";
import { clearQueueEntry, countPending, enqueue } from "./syncQueue";
import { checkReachability, backoffDelayMs } from "./connectivity";
import { resolveRow, serverIsNewer } from "./conflictResolution";
import { onLocalChange } from "./syncEvents";
import { rebuildStockCache } from "@/lib/db/inventory";
import { supabase, supabaseConfigured } from "@/lib/supabase/client";
import { useSyncStore } from "@/stores/syncStore";
import { useAuthStore } from "@/stores/authStore";
import type { BaseEntity, EntityType, SyncQueueEntry } from "@/types";

const PULL_ORDER: EntityType[] = [
  "profile",
  "product",
  "event",
  "eventInventory",
  "inventoryAdjustment",
  "sale",
  "saleItem",
  "eventExpense",
];

const IDLE_TICK_MS = 30_000;
const DEBOUNCE_MS = 400;

function lastPullKey(userId: string): string {
  return `marketlog.lastPull.${userId}`;
}

function readLastPull(userId: string): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(lastPullKey(userId)) ?? "{}");
  } catch {
    return {};
  }
}

function writeLastPull(userId: string, map: Record<string, string>): void {
  window.localStorage.setItem(lastPullKey(userId), JSON.stringify(map));
}

export function resetPullState(userId: string): void {
  window.localStorage.removeItem(lastPullKey(userId));
}

class SyncEngine {
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveFailures = 0;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;

    if (!supabaseConfigured) {
      useSyncStore.getState().setLocalOnly();
      return;
    }

    // Wake on local writes (debounced)…
    onLocalChange(() => {
      void this.refreshQueueCount();
      this.schedule(DEBOUNCE_MS);
    });

    // …on browser "online" hints (still verified by a real probe)…
    window.addEventListener("online", () => this.schedule(1000));
    window.addEventListener("offline", () => this.refreshQueueCount());

    // …and on a slow idle tick (also catches data changed on another device).
    window.setInterval(() => this.schedule(IDLE_TICK_MS), IDLE_TICK_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.schedule(500);
    });

    // Manual retry from the UI.
    useSyncStore.subscribe((state, prev) => {
      if (state.retryNonce !== prev.retryNonce) {
        this.consecutiveFailures = 0;
        this.schedule(100);
      }
    });

    this.schedule(1500);
  }

  requestRetry(): void {
    useSyncStore.getState().requestRetry();
  }

  private schedule(delayMs: number): void {
    if (!supabaseConfigured) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.attempt();
    }, delayMs);
  }

  private store() {
    return useSyncStore.getState();
  }

  private userId(): string | null {
    const auth = useAuthStore.getState();
    if (!auth.userId) return null;
    // Only cloud accounts sync; guest identity stays purely local.
    return auth.mode === "supabase" ? auth.userId : null;
  }

  private async refreshQueueCount(): Promise<void> {
    const uid = this.userId();
    if (!uid) return;
    const n = await countPending(uid);
    const s = this.store();
    if (s.status === "offline" || s.status === "error" || s.status === "synced" || s.status === "local-only") {
      s.setQueueCount(n);
    }
  }

  private async attempt(): Promise<void> {
    if (this.running) return;
    const uid = this.userId();
    if (!uid) {
      this.store().setLocalOnly();
      return;
    }
    this.running = true;
    const store = this.store();
    store.setSyncing();

    try {
      // 1) Real reachability check (never trust navigator.onLine alone).
      const reach = await checkReachability();
      if (reach !== "online") {
        this.consecutiveFailures += 1;
        const pending = await countPending(uid);
        store.setOffline(pending);
        this.schedule(backoffDelayMs(this.consecutiveFailures));
        return;
      }

      // 2) Session check — silent refresh happens inside getSession().
      //    An expired session is NOT a data problem; local writes stay queued.
      const { data } = await supabase!.auth.getSession();
      if (!data.session) {
        store.setSession("Your session needs refreshing to sync — your data is safe on this device.");
        this.schedule(60_000);
        return;
      }

      // 3) Push the outbox (dependency order), then pull server changes.
      const pushOk = await this.push(uid);
      if (!pushOk) return; // state already set (offline/session) + backoff scheduled
      await this.pull(uid);

      // 4) Success.
      this.consecutiveFailures = 0;
      const pending = await countPending(uid);
      if (pending === 0) {
        store.setSynced(0);
      } else {
        // Rows that failed content validation (e.g. RLS mismatch) stay flagged.
        store.setError("Some changes couldn't sync — Retry", pending);
        this.schedule(backoffDelayMs(2));
      }
    } catch (err) {
      this.consecutiveFailures += 1;
      const pending = await countPending(uid);
      store.setError(describeError(err), pending);
      this.schedule(backoffDelayMs(this.consecutiveFailures));
    } finally {
      this.running = false;
    }
  }

  /** Returns false when the cycle must stop (offline / stale session). */
  private async push(uid: string): Promise<boolean> {
    const store = this.store();
    const entries = await db.syncQueue
      .where("user_id")
      .equals(uid)
      .filter((e) => e.status !== "done")
      .toArray();

    entries.sort((a, b) => {
      const pa = SYNC_PRIORITY[a.entity_type] ?? 99;
      const pb = SYNC_PRIORITY[b.entity_type] ?? 99;
      return pa !== pb ? pa - pb : a.created_at - b.created_at;
    });

    for (const entry of entries) {
      if (entry.retry_count >= 5 && entry.status === "error") {
        // Auto-retries exhausted — needs a manual Retry (data is safe).
        continue;
      }
      const ok = await this.pushEntry(entry);
      if (ok === "offline" || ok === "session") {
        const pending = await countPending(uid);
        if (ok === "session") {
          store.setSession("Your session needs refreshing to sync — your data is safe on this device.");
        } else {
          this.consecutiveFailures += 1;
          store.setOffline(pending);
          this.schedule(backoffDelayMs(this.consecutiveFailures));
        }
        return false;
      }
    }
    return true;
  }

  private async pushEntry(entry: SyncQueueEntry): Promise<"done" | "offline" | "session" | "failed"> {
    const table = TABLE_BY_TYPE[entry.entity_type];
    const serverTable = SERVER_TABLE[entry.entity_type];

    // Row vanished locally (shouldn't happen with soft deletes) — drop the op.
    const row = await table.get(entry.entity_id);
    if (!row) {
      await clearQueueEntry(entry.entity_type, entry.entity_id);
      return "done";
    }

    // Always push the CURRENT row state (payload kept fresh by enqueue).
    const payload = stripLocalFields(row);
    const pushedVersion = row.version;

    const { data, error, status } = await supabase!
      .from(serverTable)
      .upsert(payload)
      .select()
      .single();

    if (error) {
      if (status === 401 || status === 403) return "session";
      const offlineish = status === 0 || status === 429 || status >= 500 || status === undefined;
      if (offlineish) return "offline";

      // Content problem (validation/RLS/shape): flag the row, keep the data,
      // continue with the rest of the queue.
      await db.syncQueue.update(entry.id, {
        retry_count: entry.retry_count + 1,
        last_error: error.message,
        status: entry.retry_count + 1 >= 5 ? "error" : "pending",
      });
      await markRowSyncError(entry.entity_type, entry.entity_id, error.message);
      return "failed";
    }

    // Success: de-queue and stamp the local row as synced — UNLESS the user
    // edited the row while the request was in flight (payload moved). In that
    // case the queue entry keeps the newer change for the next cycle.
    const freshEntry = await db.syncQueue.get(entry.id);
    const entryStillMatches =
      freshEntry !== undefined && JSON.stringify(freshEntry.payload) === JSON.stringify(payload);
    if (entryStillMatches) {
      await clearQueueEntry(entry.entity_type, entry.entity_id);
      const serverStamp = (data as BaseEntity | null)?.updated_at ?? new Date().toISOString();
      await markRowSynced(entry.entity_type, entry.entity_id, serverStamp, pushedVersion);
    }
    return "done";
  }

  private async pull(uid: string): Promise<void> {
    const lastPull = readLastPull(uid);
    const touchedProducts = new Set<string>();
    let pulled = 0;

    for (const entityType of PULL_ORDER) {
      const serverTable = SERVER_TABLE[entityType];
      const table = TABLE_BY_TYPE[entityType];
      const since = lastPull[serverTable] ?? "1970-01-01T00:00:00.000Z";
      const appendOnly = APPEND_ONLY.has(entityType);

      let cursor = since;
      for (let page = 0; page < 20; page++) {
        const { data, error, status } = await supabase!
          .from(serverTable)
          .select("*")
          .gt("updated_at", cursor)
          .order("updated_at", { ascending: true })
          .limit(500);

        if (error || !data) {
          if (status === 401 || status === 403) {
            this.store().setSession("Your session needs refreshing to sync — your data is safe on this device.");
            return;
          }
          return; // transient — next cycle retries
        }
        if (data.length === 0) break;

        for (const serverRow of data as BaseEntity[]) {
          cursor = serverRow.updated_at > cursor ? serverRow.updated_at : cursor;
          const local = await table.get(serverRow.id);
          const queued = await db.syncQueue.get(`${entityType}:${serverRow.id}`);
          const decision = resolveRow(
            local ? { id: local.id, updated_at: local.updated_at, deleted_at: local.deleted_at } : undefined,
            // Compare against the last server stamp we saw (not the client
            // clock) so clock skew can't misorder merges.
            serverIsNewer(serverRow.updated_at, local?.server_updated_at ?? local?.updated_at ?? ""),
            Boolean(queued && queued.status !== "done"),
            appendOnly,
          );
          if (decision !== "take-server") continue;

          const merged: BaseEntity = {
            ...serverRow,
            sync_status: "synced",
            local_updated_at: Date.now(),
            server_updated_at: serverRow.updated_at,
            version: 1,
            sync_error: null,
          };
          await db.transaction("rw", table, async () => {
            await table.put(merged);
          });

          pulled += 1;
          collectProductRef(entityType, merged, touchedProducts);
        }

        if (data.length < 500) break;
      }
      lastPull[serverTable] = cursor;
    }

    writeLastPull(uid, lastPull);
    if (pulled > 0) {
      // Derived caches may have shifted (sales/adjustments from another device).
      await rebuildStockCache(Array.from(touchedProducts), uid);
    }
  }
}

function collectProductRef(entityType: EntityType, row: BaseEntity, set: Set<string>): void {
  const withProduct = row as BaseEntity & { product_id?: string };
  if (withProduct.product_id) set.add(withProduct.product_id);
  // sale rows don't carry product ids; their items do and arrive in the same pull.
  void entityType;
}

function describeError(err: unknown): string {
  if (err instanceof Error && /fetch|network|timeout/i.test(err.message)) {
    return "We couldn't reach the cloud just now — your changes are saved on this device.";
  }
  return "Sync hit a problem — your data is safe. Retry in a moment.";
}

export const syncEngine = new SyncEngine();

// Push helper used after a NEW local identity is bound (sign-in) so the local
// profile row exists server-side before children reference it.
export async function pushProfileBootstrap(userId: string, displayName: string): Promise<void> {
  if (!supabaseConfigured) return;
  const existing = await db.profiles.get(userId);
  if (existing) return;
  const now = new Date().toISOString();
  const profile = {
    id: userId,
    user_id: userId,
    display_name: displayName,
    business_name: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    sync_status: "pending" as const,
    local_updated_at: Date.now(),
    server_updated_at: null,
    version: 1,
    sync_error: null,
  };
  await db.transaction("rw", db.profiles, db.syncQueue, async () => {
    await db.profiles.put(profile);
    await enqueue({
      entityType: "profile",
      entityId: userId,
      userId,
      operation: "create",
      payload: { ...profile },
    });
  });
  syncEngine.requestRetry();
}

