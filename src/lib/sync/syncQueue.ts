/**
 * syncQueue — the durable outbox of local-first writes.
 *
 * Every repository mutation enqueues an operation in the SAME Dexie transaction
 * as the local write. Entries are device-local only (never synced themselves).
 * One pending entry per entity: re-touching an entity replaces its payload, so
 * the queue never grows unbounded and a create-then-update-then-delete while
 * offline collapses into a single idempotent upsert of the final row state.
 */
import { db } from "@/lib/db/dexie";
import type { EntityType, OperationType, SyncQueueEntry } from "@/types";

export function queueEntryId(entityType: EntityType, entityId: string): string {
  return `${entityType}:${entityId}`;
}

/**
 * Upsert a queue entry. MUST be called inside a Dexie transaction that includes
 * db.syncQueue so enqueue is atomic with the local write.
 */
export async function enqueue(params: {
  entityType: EntityType;
  entityId: string;
  userId: string;
  operation: OperationType;
  payload: Record<string, unknown>;
}): Promise<void> {
  const id = queueEntryId(params.entityType, params.entityId);
  const existing = await db.syncQueue.get(id);
  const entry: SyncQueueEntry = {
    id,
    user_id: params.userId,
    entity_type: params.entityType,
    entity_id: params.entityId,
    // Final intent wins: delete beats everything; a never-synced create stays
    // 'create' against later updates (server never saw the row).
    operation_type:
      params.operation === "delete"
        ? "delete"
        : existing?.operation_type === "create"
          ? "create"
          : params.operation,
    payload: params.payload,
    created_at: existing?.created_at ?? Date.now(),
    retry_count: 0, // fresh change gets a fresh retry budget
    last_error: null,
    status: "pending",
  };
  await db.syncQueue.put(entry);
}

/** Mark an entity's row as synced locally (called by the sync engine after push). */
export async function clearQueueEntry(entityType: EntityType, entityId: string): Promise<void> {
  await db.syncQueue.delete(queueEntryId(entityType, entityId));
}

export async function countPending(userId: string): Promise<number> {
  return db.syncQueue.where("user_id").equals(userId).filter((e) => e.status !== "done").count();
}

export async function listQueue(userId: string): Promise<SyncQueueEntry[]> {
  return db.syncQueue.where("user_id").equals(userId).toArray();
}

/** Debug/diagnostics helper for Settings. */
export async function failingEntries(userId: string, limit = 20): Promise<SyncQueueEntry[]> {
  return db.syncQueue
    .where("user_id")
    .equals(userId)
    .filter((e) => e.status === "error" || (e.retry_count > 0 && e.status === "pending"))
    .limit(limit)
    .toArray();
}
