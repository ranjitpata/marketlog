/**
 * Product repository. All writes are local-first: IndexedDB write + sync queue
 * enqueue in one transaction, then a non-blocking background sync attempt.
 *
 * Snapshot rule: product edits NEVER cascade into event inventory or sale items.
 */
import { db } from "@/lib/db/dexie";
import { computeStockOnHand, STOCK_TX_TABLES } from "@/lib/db/inventory";
import { createEntity, softDeleteEntity, updateEntity } from "./baseRepository";
import { enqueue } from "@/lib/sync/syncQueue";
import { notifyLocalChange } from "@/lib/sync/syncEvents";
import { newId } from "@/lib/uuid";
import { nowIso } from "@/lib/format";
import { currentUserId } from "@/stores/authStore";
import type { AdjustmentReason, InventoryAdjustment, Product } from "@/types";

export interface ProductInput {
  name: string;
  sku: string | null;
  category: string | null;
  description: string | null;
  cost_price: number; // cents
  selling_price: number; // cents
  low_stock_threshold: number | null;
}

/** Create a product. `initialStock` becomes a recorded "Starting count" movement. */
export async function createProduct(input: ProductInput, initialStock: number): Promise<Product> {
  const userId = currentUserId();
  const product = await createEntity("product", {
    ...input,
    current_inventory: 0, // cache — rebuilt immediately below
  });

  // Record the starting count as its own entry (never a silent overwrite).
  if (initialStock !== 0) {
    await recordAdjustment(product.id, {
      reason: "initial",
      quantityChange: initialStock,
      note: "Starting count when the product was created",
    });
  } else {
    await refreshCache(product.id, userId);
  }
  return (await db.products.get(product.id))!;
}

export async function updateProduct(
  id: string,
  patch: Partial<Pick<Product, "name" | "sku" | "category" | "description" | "cost_price" | "selling_price" | "low_stock_threshold">>,
): Promise<Product | null> {
  // Deliberately does NOT touch existing eventInventory/saleItems snapshots.
  return updateEntity("product", id, patch);
}

export async function softDeleteProduct(id: string): Promise<void> {
  await softDeleteEntity("product", id);
}

/**
 * Record an inventory adjustment (restock / damaged / giveaway / recount).
 * Adjustments are their own recorded entries with a reason — the stock cache
 * is then rebuilt by folding all movements (idempotent by construction).
 */
export async function recordAdjustment(
  productId: string,
  input: {
    reason: AdjustmentReason;
    quantityChange: number;
    note: string | null;
    eventId?: string | null;
  },
): Promise<InventoryAdjustment> {
  const userId = currentUserId();
  const now = nowIso();
  const adjustment: InventoryAdjustment = {
    id: newId(),
    user_id: userId,
    product_id: productId,
    event_id: input.eventId ?? null,
    reason: input.reason,
    quantity_change: input.quantityChange,
    note: input.note,
    adjusted_at: now,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    sync_status: "pending",
    local_updated_at: Date.now(),
    server_updated_at: null,
    version: 1,
    sync_error: null,
  };

  await db.transaction("rw", [...STOCK_TX_TABLES, db.syncQueue], async () => {
    await db.inventoryAdjustments.add(adjustment);
    await enqueue({
      entityType: "inventoryAdjustment",
      entityId: adjustment.id,
      userId,
      operation: "create",
      payload: { ...adjustment },
    });
    await writeStockCache(productId, userId);
  });
  notifyLocalChange();
  return adjustment;
}

/** Internal: recompute + persist the cache for one product inside the active tx. */
async function writeStockCache(productId: string, userId: string): Promise<void> {
  const product = await db.products.get(productId);
  if (!product || product.deleted_at) return;
  const onHand = await computeStockOnHand(productId, userId);
  if (product.current_inventory !== onHand) {
    await db.products.update(productId, { current_inventory: onHand });
  }
}

async function refreshCache(productId: string, userId: string): Promise<void> {
  await db.transaction("rw", STOCK_TX_TABLES, async () => {
    await writeStockCache(productId, userId);
  });
}

export async function getProduct(id: string): Promise<Product | undefined> {
  return db.products.get(id);
}

export async function listProducts(userId: string): Promise<Product[]> {
  return db.products
    .where("user_id")
    .equals(userId)
    .filter((p) => !p.deleted_at)
    .toArray();
}
