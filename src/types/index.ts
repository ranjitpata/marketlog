/**
 * MarketLog entity types.
 *
 * Conventions (mirrored by the Supabase schema in supabase/migrations):
 *  - Every primary entity carries: id (client-generated UUID v4, created BEFORE any
 *    network call), user_id, created_at, updated_at, deleted_at (soft delete),
 *    plus local-only sync bookkeeping fields (sync_status, local_updated_at,
 *    server_updated_at, version, sync_error).
 *  - All money is stored as INTEGER CENTS. Never floats.
 *  - Timestamps are ISO 8601 strings; plain dates are 'YYYY-MM-DD'.
 *  - Field names are snake_case so local rows map 1:1 onto Postgres columns,
 *    keeping the sync payload identical to the local row (minus local-only fields).
 */

export type SyncStatus = "synced" | "pending" | "error";
export type OperationType = "create" | "update" | "delete";

export type EntityType =
  | "profile"
  | "product"
  | "event"
  | "eventInventory"
  | "sale"
  | "saleItem"
  | "eventExpense"
  | "inventoryAdjustment";

/** Fields that exist ONLY on the device and are stripped before any server push. */
export const LOCAL_ONLY_FIELDS = [
  "sync_status",
  "local_updated_at",
  "server_updated_at",
  "version",
  "sync_error",
] as const;

export interface BaseEntity {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // ---- local-only bookkeeping (never sent to the server) ----
  sync_status: SyncStatus;
  local_updated_at: number;
  server_updated_at: string | null;
  version: number;
  sync_error: string | null;
}

export type BaseEntityInput<T> = Omit<T, keyof BaseEntity>;

export interface Profile extends BaseEntity {
  display_name: string;
  business_name: string | null;
}

export interface Product extends BaseEntity {
  name: string;
  sku: string | null;
  category: string | null;
  description: string | null;
  /** Snapshot cost/price are per-unit values in cents used for NEW event inventory. */
  cost_price: number;
  selling_price: number;
  /**
   * DERIVED CACHE — never mutated directly by the sale flow. Rebuilt by folding
   * inventory movements (see lib/db/inventory.ts). Units available to bring to a
   * future event (excludes stock currently committed to unfinished events).
   */
  current_inventory: number;
  low_stock_threshold: number | null;
}

export type EventStatus = "upcoming" | "ongoing" | "completed";

export interface MarketEvent extends BaseEntity {
  name: string;
  location: string | null;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  /** Booth fee in cents, stored ON the event — never also as an expense row. */
  booth_fee: number;
  /**
   * 'completed' is sticky and user-set (it triggers unsold inventory returning to
   * available stock). 'upcoming'/'ongoing' are derived from dates at read time.
   */
  status: EventStatus;
  notes: string | null;
}

export interface EventInventory extends BaseEntity {
  event_id: string;
  product_id: string;
  /** SNAPSHOTS taken when inventory is prepared — later product edits never
   *  change historical event math. */
  product_name: string;
  selling_price: number;
  cost_price: number;
  quantity_brought: number;
  notes: string | null;
}

export type PaymentMethod = "cash" | "card" | "other";

export interface Sale extends BaseEntity {
  event_id: string;
  sold_at: string; // ISO datetime
  payment_method: PaymentMethod;
  total_amount: number; // cents
  total_cost: number; // cents (COGS snapshot)
  item_count: number;
  notes: string | null;
}

export interface SaleItem extends BaseEntity {
  sale_id: string;
  event_id: string; // denormalized so event/product folds need no joins
  product_id: string;
  /** SNAPSHOTS at time of sale. */
  product_name_snapshot: string;
  unit_price: number; // cents
  unit_cost: number; // cents
  quantity: number;
}

export interface EventExpense extends BaseEntity {
  event_id: string;
  description: string;
  amount: number; // cents
  category: string | null;
  expense_date: string; // YYYY-MM-DD
  notes: string | null;
}

export type AdjustmentReason =
  | "initial" // starting count when a product is created
  | "restock" // new stock made/bought
  | "damaged" // broken at event or at home
  | "giveaway" // gifted, donated, used as samples
  | "correction"; // manual recount fix

export interface InventoryAdjustment extends BaseEntity {
  product_id: string;
  /** null = home/atelier stock change; set = happened at that event. */
  event_id: string | null;
  reason: AdjustmentReason;
  /** Signed unit change (positive = stock in, negative = stock out). */
  quantity_change: number;
  note: string | null;
  adjusted_at: string; // ISO datetime
}

export type QueueStatus = "pending" | "error" | "done";

export interface SyncQueueEntry {
  /** Deterministic id `${entity_type}:${entity_id}` — one pending op per entity. */
  id: string;
  user_id: string;
  entity_type: EntityType;
  entity_id: string;
  operation_type: OperationType;
  payload: Record<string, unknown>;
  created_at: number;
  retry_count: number;
  last_error: string | null;
  status: QueueStatus;
}

export type SyncEngineStatus =
  | "local-only" // no cloud configured — everything stays on this device
  | "synced" // cloud configured, queue empty, last sync succeeded
  | "offline" // cloud configured but unreachable — N changes waiting
  | "syncing" // push/pull in flight
  | "error" // repeated failures — retry offered
  | "session"; // auth session stale — needs re-auth, local data is safe

export interface SyncState {
  status: SyncEngineStatus;
  queueCount: number;
  lastSyncAt: number | null;
  message: string | null;
}
