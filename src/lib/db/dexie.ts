/**
 * The Dexie/IndexedDB database — the PRIMARY data store for the running app.
 * Every read and write in the UI goes through this db (or the repository layer
 * built on top of it). The UI must never block on a network request.
 */
import Dexie, { type Table } from "dexie";
import { TABLE_INDEXES } from "./schema";
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

export class MarketLogDB extends Dexie {
  profiles!: Table<Profile, string>;
  products!: Table<Product, string>;
  events!: Table<MarketEvent, string>;
  eventInventory!: Table<EventInventory, string>;
  sales!: Table<Sale, string>;
  saleItems!: Table<SaleItem, string>;
  eventExpenses!: Table<EventExpense, string>;
  inventoryAdjustments!: Table<InventoryAdjustment, string>;
  syncQueue!: Table<SyncQueueEntry, string>;

  constructor() {
    super("marketlog");
    this.version(1).stores(TABLE_INDEXES);
  }
}

export const db = new MarketLogDB();
