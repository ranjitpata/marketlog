/**
 * Generic local-first write path — applied to EVERY mutation, no exceptions:
 *
 *   User action → write immediately to IndexedDB (same transaction also
 *   enqueues the sync op) → UI updates immediately via liveQuery (the write is
 *   already committed locally — optimistic by construction, not "pending") →
 *   background sync attempt fires if we're online; if offline the queue waits.
 *
 * UI components call repositories. Repositories NEVER import the supabase
 * client directly — only the sync engine does.
 */
import { db } from "@/lib/db/dexie";
import { TABLE } from "@/lib/db/schema";
import { enqueue } from "@/lib/sync/syncQueue";
import { notifyLocalChange } from "@/lib/sync/syncEvents";
import { newId } from "@/lib/uuid";
import { nowIso } from "@/lib/format";
import { currentUserId } from "@/stores/authStore";
import { LOCAL_ONLY_FIELDS, type BaseEntity, type BaseEntityInput, type EntityType } from "@/types";
import type { Table } from "dexie";

type EntityTable = Table<BaseEntity, string>;

export const TABLE_BY_TYPE: Record<EntityType, EntityTable> = {
  profile: db.profiles as unknown as EntityTable,
  product: db.products as unknown as EntityTable,
  event: db.events as unknown as EntityTable,
  eventInventory: db.eventInventory as unknown as EntityTable,
  sale: db.sales as unknown as EntityTable,
  saleItem: db.saleItems as unknown as EntityTable,
  eventExpense: db.eventExpenses as unknown as EntityTable,
  inventoryAdjustment: db.inventoryAdjustments as unknown as EntityTable,
};

export const TABLE_NAME_BY_TYPE: Record<EntityType, string> = {
  profile: TABLE.profiles,
  product: TABLE.products,
  event: TABLE.events,
  eventInventory: TABLE.eventInventory,
  sale: TABLE.sales,
  saleItem: TABLE.saleItems,
  eventExpense: TABLE.eventExpenses,
  inventoryAdjustment: TABLE.inventoryAdjustments,
};

/** Remove local-only bookkeeping fields before a row is pushed to the server. */
export function stripLocalFields<T extends BaseEntity>(row: T): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!(LOCAL_ONLY_FIELDS as readonly string[]).includes(k)) payload[k] = v;
  }
  return payload;
}

function baseFields(userId: string): BaseEntity {
  const now = nowIso();
  return {
    id: newId(),
    user_id: userId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    sync_status: "pending",
    local_updated_at: Date.now(),
    server_updated_at: null,
    version: 1,
    sync_error: null,
  };
}

/**
 * Create an entity: local write + queue enqueue in ONE transaction.
 * The id is generated BEFORE any network call (there is no network call here).
 */
export async function createEntity<E extends BaseEntity>(
  entityType: EntityType,
  input: BaseEntityInput<E>,
): Promise<E> {
  const userId = currentUserId();
  const table = TABLE_BY_TYPE[entityType];
  const entity = { ...baseFields(userId), ...input } as E;

  await db.transaction("rw", table, db.syncQueue, async () => {
    await table.add(entity);
    await enqueue({
      entityType,
      entityId: entity.id,
      userId,
      operation: "create",
      payload: stripLocalFields(entity),
    });
  });
  notifyLocalChange();
  return entity;
}

/** Update an entity: merge patch, bump version, re-enqueue latest row state. */
export async function updateEntity<E extends BaseEntity>(
  entityType: EntityType,
  id: string,
  patch: Partial<BaseEntityInput<E>>,
): Promise<E | null> {
  const userId = currentUserId();
  const table = TABLE_BY_TYPE[entityType];
  let updated: E | null = null;

  await db.transaction("rw", table, db.syncQueue, async () => {
    const existing = (await table.get(id)) as E | undefined;
    if (!existing || existing.deleted_at) return;
    updated = {
      ...existing,
      ...patch,
      updated_at: nowIso(),
      local_updated_at: Date.now(),
      version: existing.version + 1,
      sync_status: "pending",
      sync_error: null,
    };
    await table.put(updated);
    await enqueue({
      entityType,
      entityId: id,
      userId,
      operation: "update",
      payload: stripLocalFields(updated),
    });
  });
  notifyLocalChange();
  return updated;
}

/**
 * Soft delete: the row is kept (deleted_at set) so it can still be synced as a
 * tombstone; the sync engine NEVER hard-deletes rows, and never removes local
 * data on a sync error.
 */
export async function softDeleteEntity(entityType: EntityType, id: string): Promise<void> {
  const userId = currentUserId();
  const table = TABLE_BY_TYPE[entityType];

  await db.transaction("rw", table, db.syncQueue, async () => {
    const existing = await table.get(id);
    if (!existing || existing.deleted_at) return;
    const tombstoned = {
      ...existing,
      deleted_at: nowIso(),
      updated_at: nowIso(),
      local_updated_at: Date.now(),
      version: existing.version + 1,
      sync_status: "pending" as const,
      sync_error: null,
    };
    await table.put(tombstoned);
    await enqueue({
      entityType,
      entityId: id,
      userId,
      operation: "delete",
      payload: stripLocalFields(tombstoned),
    });
  });
  notifyLocalChange();
}

/**
 * Mark a row as synced (used by the sync engine after a successful push).
 * `expectedVersion` guards against a mid-flight local edit: if the row's
 * version moved on, the row stays "pending" and its queue entry remains.
 */
export async function markRowSynced(
  entityType: EntityType,
  id: string,
  serverUpdatedAt: string,
  expectedVersion?: number,
): Promise<void> {
  const table = TABLE_BY_TYPE[entityType];
  await db.transaction("rw", table, async () => {
    const existing = await table.get(id);
    if (!existing) return;
    if (expectedVersion !== undefined && existing.version !== expectedVersion) return;
    await table.put({
      ...existing,
      sync_status: "synced",
      server_updated_at: serverUpdatedAt,
      sync_error: null,
    });
  });
}

/** Flag a row with a sync error (row data itself is untouched and safe). */
export async function markRowSyncError(
  entityType: EntityType,
  id: string,
  error: string,
): Promise<void> {
  const table = TABLE_BY_TYPE[entityType];
  await db.transaction("rw", table, async () => {
    const existing = await table.get(id);
    if (!existing) return;
    await table.put({ ...existing, sync_status: "error", sync_error: error });
  });
}
