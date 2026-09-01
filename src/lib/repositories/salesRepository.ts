/**
 * Sales repository — the Quick Sale write path.
 *
 * One atomic Dexie transaction writes the sale + its saleItems + sync queue
 * entries and rebuilds the derived stock cache. Price/cost are SNAPSHOTTED from
 * the event inventory row (itself a prep-time snapshot), so historical math is
 * stable no matter what happens to products later.
 */
import { db } from "@/lib/db/dexie";
import { computeStockOnHand, foldEventRemaining, STOCK_TX_TABLES } from "@/lib/db/inventory";
import { enqueue } from "@/lib/sync/syncQueue";
import { notifyLocalChange } from "@/lib/sync/syncEvents";
import { newId } from "@/lib/uuid";
import { nowIso } from "@/lib/format";
import { currentUserId } from "@/stores/authStore";
import type { PaymentMethod, Sale, SaleItem } from "@/types";

export class OversellError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OversellError";
  }
}

export interface CartLine {
  productId: string;
  quantity: number;
}

export async function recordSale(input: {
  eventId: string;
  paymentMethod: PaymentMethod;
  lines: CartLine[];
  notes?: string | null;
  soldAt?: string;
}): Promise<Sale> {
  const userId = currentUserId();
  const lines = input.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) throw new OversellError("Add at least one item to the sale.");

  const now = input.soldAt ?? nowIso();
  let createdSale: Sale | null = null;

  await db.transaction("rw", [...STOCK_TX_TABLES, db.syncQueue], async () => {
    const event = await db.events.get(input.eventId);
    if (!event || event.deleted_at) throw new OversellError("Event not found.");
    if (event.status === "completed") throw new OversellError("This event is marked completed.");

    // Resolve every line against its event inventory row (source of snapshots).
    interface ResolvedLine {
      inventoryId: string;
      productId: string;
      name: string;
      unit_price: number;
      unit_cost: number;
      quantity: number;
    }
    const resolved: ResolvedLine[] = [];
    for (const line of lines) {
      const inv = await db.eventInventory
        .where("[event_id+product_id]")
        .equals([input.eventId, line.productId])
        .filter((r) => r.user_id === userId && !r.deleted_at)
        .first();
      if (!inv) throw new OversellError("One of the items isn't in this event's inventory.");

      const sold = await sumSold(input.eventId, line.productId, userId);
      const adj = await sumEventAdjustments(input.eventId, line.productId, userId);
      const remaining = foldEventRemaining(inv.quantity_brought, adj, sold);
      if (line.quantity > remaining) {
        throw new OversellError(`Only ${remaining} left of ${inv.product_name} at this event.`);
      }
      resolved.push({
        inventoryId: inv.id,
        productId: line.productId,
        name: inv.product_name,
        unit_price: inv.selling_price,
        unit_cost: inv.cost_price,
        quantity: line.quantity,
      });
    }

    // Build the sale with cached totals (snapshot arithmetic, integer cents).
    const totalAmount = resolved.reduce((sum, l) => sum + l.unit_price * l.quantity, 0);
    const totalCost = resolved.reduce((sum, l) => sum + l.unit_cost * l.quantity, 0);
    const itemCount = resolved.reduce((sum, l) => sum + l.quantity, 0);

    const saleId = newId();
    const sale: Sale = {
      id: saleId,
      user_id: userId,
      event_id: input.eventId,
      sold_at: now,
      payment_method: input.paymentMethod,
      total_amount: totalAmount,
      total_cost: totalCost,
      item_count: itemCount,
      notes: input.notes ?? null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      sync_status: "pending",
      local_updated_at: Date.now(),
      server_updated_at: null,
      version: 1,
      sync_error: null,
    };
    await db.sales.add(sale);
    await enqueue({
      entityType: "sale",
      entityId: saleId,
      userId,
      operation: "create",
      payload: { ...sale },
    });

    for (const line of resolved) {
      const item: SaleItem = {
        id: newId(),
        user_id: userId,
        sale_id: saleId,
        event_id: input.eventId,
        product_id: line.productId,
        product_name_snapshot: line.name,
        unit_price: line.unit_price,
        unit_cost: line.unit_cost,
        quantity: line.quantity,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        sync_status: "pending",
        local_updated_at: Date.now(),
        server_updated_at: null,
        version: 1,
        sync_error: null,
      };
      await db.saleItems.add(item);
      await enqueue({
        entityType: "saleItem",
        entityId: item.id,
        userId,
        operation: "create",
        payload: { ...item },
      });
    }

    // Rebuild derived stock caches for affected products (idempotent fold).
    for (const line of resolved) {
      const product = await db.products.get(line.productId);
      if (!product || product.deleted_at) continue;
      const onHand = await computeStockOnHand(line.productId, userId);
      if (product.current_inventory !== onHand) {
        await db.products.update(line.productId, { current_inventory: onHand });
      }
    }

    createdSale = sale;
  });

  notifyLocalChange();
  return createdSale!;
}

export async function listSalesForEvent(eventId: string, userId: string): Promise<Sale[]> {
  return db.sales
    .where("event_id")
    .equals(eventId)
    .filter((s) => s.user_id === userId && !s.deleted_at)
    .sortBy("sold_at");
}

export async function listSaleItemsForEvent(eventId: string, userId: string): Promise<SaleItem[]> {
  return db.saleItems
    .where("event_id")
    .equals(eventId)
    .filter((si) => si.user_id === userId && !si.deleted_at)
    .toArray();
}

async function sumSold(eventId: string, productId: string, userId: string): Promise<number> {
  const items = await db.saleItems
    .where("[event_id+product_id]")
    .equals([eventId, productId])
    .filter((si) => si.user_id === userId && !si.deleted_at)
    .toArray();
  return items.reduce((sum, si) => sum + si.quantity, 0);
}

async function sumEventAdjustments(eventId: string, productId: string, userId: string): Promise<number> {
  const rows = await db.inventoryAdjustments
    .where("[event_id+product_id]")
    .equals([eventId, productId])
    .filter((a) => a.user_id === userId && !a.deleted_at)
    .toArray();
  return rows.reduce((sum, a) => sum + a.quantity_change, 0);
}
