/**
 * Derived inventory model.
 *
 * products.current_inventory is a CACHE, never mutated directly by the sale
 * flow. It is rebuilt by folding the inventory-movement sources:
 *
 *   - home adjustments (initial count, restock, recount corrections)
 *   - event inventory rows (quantity_brought — stock committed to an event)
 *   - sales (saleItems — units permanently sold at events)
 *   - event-scoped adjustments (damaged / giveaway / found at an event)
 *
 * Semantics:
 *   • While an event is NOT completed, ALL brought stock counts as committed
 *     (out of the house): effect = quantity_brought.
 *   • When an event IS completed, unsold stock has come home:
 *     effect = sold − eventAdjustments (the units that truly left).
 *   • Event remaining (what can still be sold at the event) =
 *     brought + eventAdjustments − sold.
 *
 * The fold is a PURE function of current row state, so retried or duplicate
 * sync operations can never double-decrement anything — the cache is
 * recomputed, never incremented.
 */
import { db } from "@/lib/db/dexie";
import type { EventInventory, MarketEvent } from "@/types";

/** Tables a stock-rebuilding transaction must include. */
export const STOCK_TX_TABLES = [
  db.products,
  db.events,
  db.eventInventory,
  db.sales,
  db.saleItems,
  db.inventoryAdjustments,
];

export interface EventFoldRow {
  quantity_brought: number;
  completed: boolean;
  sold: number;
  /** Signed sum of event-scoped adjustments for this product/event. */
  eventAdjustments: number;
}

/** PURE: available ("on hand") units for one product. */
export function foldStockOnHand(homeAdjustmentTotal: number, eventRows: EventFoldRow[]): number {
  let onHand = homeAdjustmentTotal;
  for (const row of eventRows) {
    if (!row.completed) {
      onHand -= row.quantity_brought;
    } else {
      onHand -= row.sold - row.eventAdjustments;
    }
  }
  return onHand;
}

/** PURE: units still sellable at an event for one product. */
export function foldEventRemaining(
  quantity_brought: number,
  eventAdjustmentTotal: number,
  sold: number,
): number {
  return quantity_brought + eventAdjustmentTotal - sold;
}

/** PURE: effective event status ('completed' is sticky; others derive from dates). */
export function effectiveEventStatus(event: Pick<MarketEvent, "status" | "start_date" | "end_date">, today: string): "upcoming" | "ongoing" | "completed" {
  if (event.status === "completed") return "completed";
  if (today < event.start_date) return "upcoming";
  if (today > event.end_date) return "ongoing"; // past dates but not marked completed yet
  return "ongoing";
}

function isCompleted(event: MarketEvent | undefined, fallbackToday: string): boolean {
  if (!event) return false;
  return effectiveEventStatus(event, fallbackToday) === "completed";
}

/**
 * Compute current available stock for one product. Reads run inside whatever
 * transaction is active (call within STOCK_TX_TABLES transactions for atomic
 * cache updates), or standalone for ad-hoc queries.
 */
export async function computeStockOnHand(productId: string, userId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);

  const adjustments = await db.inventoryAdjustments
    .where("product_id")
    .equals(productId)
    .filter((a) => a.user_id === userId && !a.deleted_at)
    .toArray();

  let homeAdjustmentTotal = 0;
  const eventAdjustments = new Map<string, number>();
  for (const adj of adjustments) {
    if (adj.event_id === null) {
      homeAdjustmentTotal += adj.quantity_change;
    } else {
      eventAdjustments.set(adj.event_id, (eventAdjustments.get(adj.event_id) ?? 0) + adj.quantity_change);
    }
  }

  const inventoryRows = await db.eventInventory
    .where("product_id")
    .equals(productId)
    .filter((row) => row.user_id === userId && !row.deleted_at)
    .toArray();

  const eventRows: EventFoldRow[] = [];
  for (const inv of inventoryRows) {
    const event = await db.events.get(inv.event_id);
    if (!event || event.deleted_at || event.user_id !== userId) continue;
    const sold = await sumSold(inv.event_id, productId, userId);
    eventRows.push({
      quantity_brought: inv.quantity_brought,
      completed: isCompleted(event, today),
      sold,
      eventAdjustments: eventAdjustments.get(inv.event_id) ?? 0,
    });
  }

  return foldStockOnHand(homeAdjustmentTotal, eventRows);
}

async function sumSold(eventId: string, productId: string, userId: string): Promise<number> {
  const items = await db.saleItems
    .where("[event_id+product_id]")
    .equals([eventId, productId])
    .filter((si) => si.user_id === userId && !si.deleted_at)
    .toArray();
  return items.reduce((sum, si) => sum + si.quantity, 0);
}

/**
 * Rebuild the current_inventory cache for the given products. Safe to run any
 * time (idempotent); called after sales, adjustments, inventory prep edits and
 * event completion. Runs in its own transaction — must NOT be nested inside
 * another transaction (Dexie limitation); repositories therefore call
 * computeStockOnHand INSIDE their transaction instead and write the cache there.
 */
export async function rebuildStockCache(productIds: string[], userId: string): Promise<void> {
  const unique = Array.from(new Set(productIds));
  if (unique.length === 0) return;
  await db.transaction("rw", STOCK_TX_TABLES, async () => {
    for (const pid of unique) {
      const product = await db.products.get(pid);
      if (!product || product.deleted_at) continue;
      const onHand = await computeStockOnHand(pid, userId);
      if (product.current_inventory !== onHand) {
        await db.products.update(pid, { current_inventory: onHand });
      }
    }
  });
}

export interface EventInventoryStatus {
  inventory: EventInventory;
  sold: number;
  eventAdjustmentTotal: number;
  remaining: number;
}

/**
 * Per-product status for one event's inventory (used by prep, Quick Sale grid
 * and the event Inventory tab).
 */
export async function computeEventInventoryStatus(
  eventId: string,
  userId: string,
): Promise<EventInventoryStatus[]> {
  const rows = await db.eventInventory
    .where("event_id")
    .equals(eventId)
    .filter((row) => row.user_id === userId && !row.deleted_at)
    .toArray();

  const adjustments = await db.inventoryAdjustments
    .where("event_id")
    .equals(eventId)
    .filter((a) => a.user_id === userId && !a.deleted_at)
    .toArray();

  const eventAdj = new Map<string, number>();
  for (const adj of adjustments) {
    if (adj.user_id !== userId || adj.deleted_at) continue;
    eventAdj.set(adj.product_id, (eventAdj.get(adj.product_id) ?? 0) + adj.quantity_change);
  }

  const saleItems = await db.saleItems
    .where("event_id")
    .equals(eventId)
    .filter((si) => si.user_id === userId && !si.deleted_at)
    .toArray();
  const sold = new Map<string, number>();
  for (const si of saleItems) {
    sold.set(si.product_id, (sold.get(si.product_id) ?? 0) + si.quantity);
  }

  return rows
    .map((inventory) => {
      const s = sold.get(inventory.product_id) ?? 0;
      const adj = eventAdj.get(inventory.product_id) ?? 0;
      return {
        inventory,
        sold: s,
        eventAdjustmentTotal: adj,
        remaining: foldEventRemaining(inventory.quantity_brought, adj, s),
      };
    })
    .sort((a, b) => a.inventory.product_name.localeCompare(b.inventory.product_name));
}

/**
 * Full movement ledger for one product (Products detail screen): every
 * adjustment, every event commitment, in chronological order.
 */
export type StockMovement =
  | { kind: "adjustment"; at: string; label: string; delta: number; note: string | null }
  | { kind: "event"; at: string; label: string; delta: number; note: string | null };

const REASON_LABELS: Record<string, string> = {
  initial: "Starting count",
  restock: "Restock",
  damaged: "Damaged",
  giveaway: "Given away",
  correction: "Count correction",
};

export async function getStockMovements(productId: string, userId: string): Promise<StockMovement[]> {
  const today = new Date().toISOString().slice(0, 10);
  const movements: StockMovement[] = [];

  const adjustments = await db.inventoryAdjustments
    .where("product_id")
    .equals(productId)
    .filter((a) => a.user_id === userId && !a.deleted_at)
    .toArray();
  for (const adj of adjustments) {
    movements.push({
      kind: "adjustment",
      at: adj.adjusted_at,
      label: REASON_LABELS[adj.reason] ?? adj.reason,
      delta: adj.quantity_change,
      note: adj.note,
    });
  }

  const inventoryRows = await db.eventInventory
    .where("product_id")
    .equals(productId)
    .filter((row) => row.user_id === userId && !row.deleted_at)
    .toArray();
  for (const inv of inventoryRows) {
    const event = await db.events.get(inv.event_id);
    if (!event || event.deleted_at) continue;
    const completed = isCompleted(event, today);
    const sold = await sumSold(inv.event_id, productId, userId);
    const eventAdj = adjustments
      .filter((a) => a.event_id === inv.event_id)
      .reduce((sum, a) => sum + a.quantity_change, 0);
    const delta = completed ? -(sold - eventAdj) : -inv.quantity_brought;
    movements.push({
      kind: "event",
      at: completed ? event.updated_at : inv.created_at,
      label: completed ? `${event.name} — sold & returned leftovers` : `${event.name} — stock at event`,
      delta,
      note: completed ? `${sold} sold` : `${inv.quantity_brought} brought`,
    });
  }

  return movements.sort((a, b) => a.at.localeCompare(b.at));
}

