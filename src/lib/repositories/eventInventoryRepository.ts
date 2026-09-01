/**
 * Event inventory repository — the "prep" flow.
 *
 * eventInventory SNAPSHOT rule: product_name, selling_price and cost_price are
 * copied from the product at the moment inventory is prepared. Later product
 * edits never change historical event math. Editing the brought quantity later
 * keeps the original snapshot.
 */
import { db } from "@/lib/db/dexie";
import { computeStockOnHand, foldEventRemaining, STOCK_TX_TABLES } from "@/lib/db/inventory";
import { enqueue } from "@/lib/sync/syncQueue";
import { notifyLocalChange } from "@/lib/sync/syncEvents";
import { newId } from "@/lib/uuid";
import { nowIso } from "@/lib/format";
import { currentUserId } from "@/stores/authStore";
import type { EventInventory, Product } from "@/types";

export class InsufficientStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientStockError";
  }
}

/**
 * Set how many units of a product to bring to an event. Creates the inventory
 * row (snapshotting the product) or updates quantity_brought. Validates that
 * the event can never oversell: brought + adjustments − sold must stay >= 0.
 */
export async function setBroughtQuantity(eventId: string, productId: string, quantity: number): Promise<void> {
  if (quantity < 0) throw new InsufficientStockError("Quantity can't be negative.");
  const userId = currentUserId();

  await db.transaction("rw", [...STOCK_TX_TABLES, db.syncQueue], async () => {
    const existing = await db.eventInventory.where("[event_id+product_id]").equals([eventId, productId]).first();
    const product = await db.products.get(productId);
    if (!product || product.deleted_at) throw new InsufficientStockError("Product not found.");

    const event = await db.events.get(eventId);
    if (!event || event.deleted_at) throw new InsufficientStockError("Event not found.");

    // Sold units and negative event adjustments must remain covered.
    const sold = await sumSold(eventId, productId, userId);
    const adj = await sumEventAdjustments(eventId, productId, userId);
    if (foldEventRemaining(quantity, adj, sold) < 0) {
      throw new InsufficientStockError(
        `Can't reduce below what's already accounted for (${sold} sold or adjusted at this event).`,
      );
    }

    const now = nowIso();
    if (existing && !existing.deleted_at) {
      const updated: EventInventory = {
        ...existing,
        quantity_brought: quantity,
        updated_at: now,
        local_updated_at: Date.now(),
        version: existing.version + 1,
        sync_status: "pending",
        sync_error: null,
      };
      await db.eventInventory.put(updated);
      await enqueue({
        entityType: "eventInventory",
        entityId: updated.id,
        userId,
        operation: "update",
        payload: { ...updated },
      });
    } else {
      const row: EventInventory = {
        id: newId(),
        user_id: userId,
        event_id: eventId,
        product_id: productId,
        // ---- snapshots at prep time ----
        product_name: product.name,
        selling_price: product.selling_price,
        cost_price: product.cost_price,
        // --------------------------------
        quantity_brought: quantity,
        notes: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        sync_status: "pending",
        local_updated_at: Date.now(),
        server_updated_at: null,
        version: 1,
        sync_error: null,
      };
      await db.eventInventory.add(row);
      await enqueue({
        entityType: "eventInventory",
        entityId: row.id,
        userId,
        operation: "create",
        payload: { ...row },
      });
    }

    // Stock cache: brought quantity changed what's committed.
    const onHand = await computeStockOnHand(productId, userId);
    if (product.current_inventory !== onHand) {
      await db.products.update(productId, { current_inventory: onHand });
    }
  });
  notifyLocalChange();
}

/** Remove an inventory row from an event (soft delete; stock un-commits). */
export async function removeEventInventory(rowId: string): Promise<void> {
  const userId = currentUserId();
  await db.transaction("rw", [...STOCK_TX_TABLES, db.syncQueue], async () => {
    const row = await db.eventInventory.get(rowId);
    if (!row || row.deleted_at) return;
    const now = nowIso();
    const dead: EventInventory = {
      ...row,
      deleted_at: now,
      updated_at: now,
      local_updated_at: Date.now(),
      version: row.version + 1,
      sync_status: "pending",
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
    const product = await db.products.get(row.product_id);
    if (product && !product.deleted_at) {
      const onHand = await computeStockOnHand(row.product_id, userId);
      if (product.current_inventory !== onHand) {
        await db.products.update(row.product_id, { current_inventory: onHand });
      }
    }
  });
  notifyLocalChange();
}

export async function getEventInventoryRow(eventId: string, productId: string): Promise<EventInventory | undefined> {
  return db.eventInventory.where("[event_id+product_id]").equals([eventId, productId]).first();
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

export type { Product };
