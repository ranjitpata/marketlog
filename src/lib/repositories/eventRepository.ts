/**
 * Event repository. `booth_fee` lives on the event row only — it is never also
 * an expense row, so event cost math can never double count it.
 */
import { db } from "@/lib/db/dexie";
import { computeStockOnHand, rebuildStockCache, STOCK_TX_TABLES } from "@/lib/db/inventory";
import { createEntity, updateEntity } from "./baseRepository";
import { enqueue } from "@/lib/sync/syncQueue";
import { notifyLocalChange } from "@/lib/sync/syncEvents";
import { nowIso } from "@/lib/format";
import { currentUserId } from "@/stores/authStore";
import type { EventStatus, MarketEvent } from "@/types";

export interface EventInput {
  name: string;
  location: string | null;
  start_date: string;
  end_date: string;
  booth_fee: number; // cents
  notes: string | null;
}

export async function createEvent(input: EventInput): Promise<MarketEvent> {
  return createEntity("event", { ...input, status: "upcoming" as EventStatus });
}

export async function updateEvent(
  id: string,
  patch: Partial<Pick<MarketEvent, "name" | "location" | "start_date" | "end_date" | "booth_fee" | "notes">>,
): Promise<MarketEvent | null> {
  return updateEntity("event", id, patch);
}

/**
 * Mark an event completed. This is the moment unsold event inventory is treated
 * as returned home, so the stock cache for every product at the event is
 * rebuilt in the same transaction.
 */
export async function markEventCompleted(id: string): Promise<void> {
  const userId = currentUserId();
  await db.transaction("rw", [...STOCK_TX_TABLES, db.syncQueue], async () => {
    const event = await db.events.get(id);
    if (!event || event.deleted_at || event.status === "completed") return;
    const completed: MarketEvent = {
      ...event,
      status: "completed",
      updated_at: nowIso(),
      local_updated_at: Date.now(),
      version: event.version + 1,
      sync_status: "pending",
      sync_error: null,
    };
    await db.events.put(completed);
    await enqueue({
      entityType: "event",
      entityId: id,
      userId,
      operation: "update",
      payload: { ...completed },
    });

    const inventoryRows = await db.eventInventory
      .where("event_id")
      .equals(id)
      .filter((row) => row.user_id === userId && !row.deleted_at)
      .toArray();
    for (const row of inventoryRows) {
      const product = await db.products.get(row.product_id);
      if (!product || product.deleted_at) continue;
      const onHand = await computeStockOnHand(row.product_id, userId);
      if (product.current_inventory !== onHand) {
        await db.products.update(row.product_id, { current_inventory: onHand });
      }
    }
  });
  notifyLocalChange();
}

/** Reopen a completed event (its committed stock counts as out of the house again). */
export async function reopenEvent(id: string): Promise<void> {
  const userId = currentUserId();
  await updateEntity("event", id, { status: "upcoming" });
  const rows = await db.eventInventory
    .where("event_id")
    .equals(id)
    .filter((r) => r.user_id === userId && !r.deleted_at)
    .toArray();
  await rebuildStockCache(
    rows.map((r) => r.product_id),
    userId,
  );
  notifyLocalChange();
}

/**
 * Soft-delete an event. Its inventory rows and adjustments stop counting toward
 * available stock (committed stock "comes back").
 */
export async function softDeleteEvent(id: string): Promise<void> {
  const userId = currentUserId();
  const rows = await db.eventInventory
    .where("event_id")
    .equals(id)
    .filter((r) => r.user_id === userId && !r.deleted_at)
    .toArray();

  // Tombstone the event and its child rows, then rebuild affected stock caches.
  await db.transaction("rw", [...STOCK_TX_TABLES, db.syncQueue], async () => {
    const now = nowIso();
    const event = await db.events.get(id);
    if (!event || event.deleted_at) return;
    const tombstoned: MarketEvent = {
      ...event,
      deleted_at: now,
      updated_at: now,
      local_updated_at: Date.now(),
      version: event.version + 1,
      sync_status: "pending",
      sync_error: null,
    };
    await db.events.put(tombstoned);
    await enqueue({
      entityType: "event",
      entityId: id,
      userId,
      operation: "delete",
      payload: { ...tombstoned },
    });

    // Child rows keep existing (soft-deleted) so server copies match.
    const childRows = await db.eventInventory.where("event_id").equals(id).toArray();
    for (const row of childRows) {
      if (row.deleted_at) continue;
      const dead = {
        ...row,
        deleted_at: now,
        updated_at: now,
        local_updated_at: Date.now(),
        version: row.version + 1,
        sync_status: "pending" as const,
        sync_error: null,
      };
      await db.eventInventory.put(dead);
      await enqueue({
        entityType: "eventInventory",
        entityId: row.id,
        userId,
        operation: "delete",
        payload: { ...dead },
      });
    }

    for (const row of rows) {
      const product = await db.products.get(row.product_id);
      if (!product || product.deleted_at) continue;
      const onHand = await computeStockOnHand(row.product_id, userId);
      if (product.current_inventory !== onHand) {
        await db.products.update(row.product_id, { current_inventory: onHand });
      }
    }
  });
  notifyLocalChange();
}

export async function getEvent(id: string): Promise<MarketEvent | undefined> {
  return db.events.get(id);
}

export async function listEvents(userId: string): Promise<MarketEvent[]> {
  return db.events
    .where("user_id")
    .equals(userId)
    .filter((e) => !e.deleted_at)
    .toArray();
}
