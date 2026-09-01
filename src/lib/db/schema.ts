/**
 * Dexie table index definitions (the single source of truth for the local
 * IndexedDB schema). The actual Dexie instance lives in dexie.ts.
 *
 * NOTE: sync_queue is device-local ONLY — it is never synced to the server.
 */
import type {
  EventExpense,
  EventInventory,
  InventoryAdjustment,
  MarketEvent,
  Product,
  Profile,
  Sale,
  SaleItem,
  SyncQueueEntry,
} from "@/types";

export const TABLE = {
  profiles: "profiles",
  products: "products",
  events: "events",
  eventInventory: "eventInventory",
  sales: "sales",
  saleItems: "saleItems",
  eventExpenses: "eventExpenses",
  inventoryAdjustments: "inventoryAdjustments",
  syncQueue: "syncQueue",
} as const;

export const TABLE_INDEXES: Record<string, string> = {
  profiles: "id, user_id, updated_at",
  products: "id, user_id, updated_at, name, deleted_at, sync_status",
  events: "id, user_id, updated_at, start_date, end_date, status, deleted_at",
  eventInventory: "id, user_id, event_id, product_id, updated_at, [event_id+product_id], deleted_at",
  sales: "id, user_id, event_id, sold_at, updated_at, deleted_at",
  saleItems: "id, user_id, sale_id, event_id, product_id, updated_at, deleted_at, [event_id+product_id]",
  eventExpenses: "id, user_id, event_id, expense_date, updated_at, deleted_at",
  inventoryAdjustments:
    "id, user_id, product_id, event_id, adjusted_at, deleted_at, [product_id+event_id], [event_id+product_id]",
  syncQueue: "id, user_id, status, entity_type, entity_id, created_at, [entity_type+status], [user_id+status]",
};

/**
 * Push priority: parents strictly before children. With client-generated stable
 * UUIDs no foreign-key rewriting is ever needed — ordering alone guarantees that
 * referenced rows exist server-side by the time children are pushed.
 */
export const SYNC_PRIORITY: Record<string, number> = {
  profile: 0,
  product: 1,
  event: 2,
  eventInventory: 3,
  inventoryAdjustment: 3,
  sale: 4,
  saleItem: 5,
  eventExpense: 5,
};

/** Local table name ↔ server (Postgres) table name. */
export const SERVER_TABLE: Record<string, string> = {
  profile: "profiles",
  product: "products",
  event: "events",
  eventInventory: "event_inventory",
  inventoryAdjustment: "inventory_adjustments",
  sale: "sales",
  saleItem: "sale_items",
  eventExpense: "event_expenses",
};

/** Entity types whose rows are strictly append-only once written. */
export const APPEND_ONLY: ReadonlySet<string> = new Set(["sale", "saleItem", "inventoryAdjustment"]);

export interface MarketLogTables {
  profiles: Profile;
  products: Product;
  events: MarketEvent;
  eventInventory: EventInventory;
  sales: Sale;
  saleItems: SaleItem;
  eventExpenses: EventExpense;
  inventoryAdjustments: InventoryAdjustment;
  syncQueue: SyncQueueEntry;
}
