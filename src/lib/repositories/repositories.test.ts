/**
 * Integration test of the LOCAL-FIRST WRITE PATH against fake IndexedDB.
 * Verifies the core contract: every mutation writes locally + enqueues a sync
 * op atomically, and the derived stock cache is an idempotent fold.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/dexie";
import { useAuthStore } from "@/stores/authStore";
import { createProduct, recordAdjustment } from "@/lib/repositories/productRepository";
import { createEvent, markEventCompleted } from "@/lib/repositories/eventRepository";
import { setBroughtQuantity } from "@/lib/repositories/eventInventoryRepository";
import { recordSale, OversellError } from "@/lib/repositories/salesRepository";
import { rebuildStockCache, computeStockOnHand } from "@/lib/db/inventory";

const USER = "test-user-1";

beforeEach(async () => {
  useAuthStore.setState({ userId: USER, mode: "local", ready: true, email: null });
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("local-first write path", () => {
  it("createProduct writes locally, enqueues a sync op, and records the starting count", async () => {
    const product = await createProduct(
      { name: "Beeswax Candle", sku: null, category: "Candles", description: null, cost_price: 600, selling_price: 1500, low_stock_threshold: 5 },
      25,
    );

    // Local write is immediate — no network involved.
    const stored = await db.products.get(product.id);
    expect(stored).toBeDefined();
    expect(stored!.current_inventory).toBe(25);

    // Queue entries: product create + initial adjustment.
    const entries = await db.syncQueue.toArray();
    expect(entries.filter((e) => e.entity_type === "product").length).toBe(1);
    expect(entries.filter((e) => e.entity_type === "inventoryAdjustment").length).toBe(1);

    // The starting count exists as a recorded entry with a reason.
    const adjustments = await db.inventoryAdjustments.where("product_id").equals(product.id).toArray();
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0].reason).toBe("initial");
    expect(adjustments[0].quantity_change).toBe(25);
  });

  it("a sale snapshots price/cost from event inventory, decrements nothing directly, and rebuilds the cache by folding", async () => {
    const product = await createProduct(
      { name: "Soap", sku: null, category: null, description: null, cost_price: 200, selling_price: 500, low_stock_threshold: null },
      10,
    );
    const event = await createEvent({ name: "Spring Market", location: "Town Hall", start_date: "2026-01-01", end_date: "2026-01-02", booth_fee: 2500, notes: null });
    await setBroughtQuantity(event.id, product.id, 6);

    // Prep committed 6 of the 10 → 4 available at home.
    expect((await db.products.get(product.id))!.current_inventory).toBe(4);

    const sale = await recordSale({ eventId: event.id, paymentMethod: "cash", lines: [{ productId: product.id, quantity: 2 }] });
    expect(sale.total_amount).toBe(1000);
    expect(sale.total_cost).toBe(400);
    expect(sale.item_count).toBe(2);

    // Snapshot taken from the event inventory row.
    const items = await db.saleItems.where("sale_id").equals(sale.id).toArray();
    expect(items[0].product_name_snapshot).toBe("Soap");
    expect(items[0].unit_price).toBe(500);
    expect(items[0].unit_cost).toBe(200);

    // Stock cache is a fold — active event still commits ALL brought units.
    expect((await db.products.get(product.id))!.current_inventory).toBe(4);

    // Fold is idempotent: recompute twice changes nothing.
    await rebuildStockCache([product.id], USER);
    await rebuildStockCache([product.id], USER);
    expect((await db.products.get(product.id))!.current_inventory).toBe(4);
    expect(await computeStockOnHand(product.id, USER)).toBe(4);
  });

  it("completing the event returns unsold stock home", async () => {
    const product = await createProduct(
      { name: "Honey Jar", sku: null, category: null, description: null, cost_price: 300, selling_price: 800, low_stock_threshold: null },
      10,
    );
    const event = await createEvent({ name: "Farmers Market", location: null, start_date: "2026-01-01", end_date: "2026-01-01", booth_fee: 0, notes: null });
    await setBroughtQuantity(event.id, product.id, 6);
    await recordSale({ eventId: event.id, paymentMethod: "card", lines: [{ productId: product.id, quantity: 4 }] });

    await markEventCompleted(event.id);
    // brought 6, sold 4 → 2 came home → 10 − 4 = 6 available.
    expect((await db.products.get(product.id))!.current_inventory).toBe(6);
  });

  it("event-scoped damage reduces what comes home, without double counting", async () => {
    const product = await createProduct(
      { name: "Lip Balm", sku: null, category: null, description: null, cost_price: 100, selling_price: 350, low_stock_threshold: null },
      12,
    );
    const event = await createEvent({ name: "Craft Fair", location: null, start_date: "2026-01-01", end_date: "2026-01-01", booth_fee: 0, notes: null });
    await setBroughtQuantity(event.id, product.id, 8);
    await recordSale({ eventId: event.id, paymentMethod: "other", lines: [{ productId: product.id, quantity: 2 }] });
    await recordAdjustment(product.id, { reason: "damaged", quantityChange: -1, note: "dropped", eventId: event.id });

    await markEventCompleted(event.id);
    // effect = sold − adj = 2 − (−1) = 3 → 12 − 3 = 9.
    expect((await db.products.get(product.id))!.current_inventory).toBe(9);
  });

  it("overselling an event is rejected with a friendly error", async () => {
    const product = await createProduct(
      { name: "Mug", sku: null, category: null, description: null, cost_price: 700, selling_price: 1800, low_stock_threshold: null },
      5,
    );
    const event = await createEvent({ name: "Pottery Fair", location: null, start_date: "2026-01-01", end_date: "2026-01-01", booth_fee: 0, notes: null });
    await setBroughtQuantity(event.id, product.id, 3);

    await expect(
      recordSale({ eventId: event.id, paymentMethod: "cash", lines: [{ productId: product.id, quantity: 4 }] }),
    ).rejects.toBeInstanceOf(OversellError);
  });

  it("queue entries are deduped per entity and carry the latest payload", async () => {
    const product = await createProduct(
      { name: "Tote Bag", sku: null, category: null, description: null, cost_price: 400, selling_price: 1200, low_stock_threshold: null },
      5,
    );
    const event = await createEvent({ name: "Market", location: null, start_date: "2026-01-01", end_date: "2026-01-01", booth_fee: 0, notes: null });
    await setBroughtQuantity(event.id, product.id, 2);
    await setBroughtQuantity(event.id, product.id, 4);

    const invEntries = await db.syncQueue.where("entity_type").equals("eventInventory").toArray();
    expect(invEntries).toHaveLength(1);
    expect(invEntries[0].payload["quantity_brought"]).toBe(4);
  });

  it("reducing brought below what's already sold is rejected", async () => {
    const product = await createProduct(
      { name: "Scarf", sku: null, category: null, description: null, cost_price: 900, selling_price: 2500, low_stock_threshold: null },
      5,
    );
    const event = await createEvent({ name: "Winter Market", location: null, start_date: "2026-01-01", end_date: "2026-01-01", booth_fee: 0, notes: null });
    await setBroughtQuantity(event.id, product.id, 5);
    await recordSale({ eventId: event.id, paymentMethod: "cash", lines: [{ productId: product.id, quantity: 3 }] });

    await expect(setBroughtQuantity(event.id, product.id, 2)).rejects.toBeInstanceOf(Error);
  });

  it("soft delete keeps the row (tombstone) and enqueues a delete op — never a hard delete", async () => {
    const { softDeleteProduct } = await import("@/lib/repositories/productRepository");
    const product = await createProduct(
      { name: "Old Item", sku: null, category: null, description: null, cost_price: 100, selling_price: 300, low_stock_threshold: null },
      0,
    );
    await softDeleteProduct(product.id);

    const row = await db.products.get(product.id);
    expect(row).toBeDefined(); // still there
    expect(row!.deleted_at).not.toBeNull();

    const entries = await db.syncQueue.where("entity_id").equals(product.id).toArray();
    expect(entries[0].operation_type).toBe("delete");
  });
});
