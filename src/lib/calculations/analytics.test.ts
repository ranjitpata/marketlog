import { describe, expect, it } from "vitest";
import { bestSellers, inMonth, revenueByPaymentMethod, salesByHour, summarizeMonth } from "./analytics";

const items = [
  { product_id: "p1", product_name_snapshot: "Candle", unit_price: 1500, unit_cost: 600, quantity: 2 },
  { product_id: "p1", product_name_snapshot: "Candle", unit_price: 1500, unit_cost: 600, quantity: 1 },
  { product_id: "p2", product_name_snapshot: "Soap", unit_price: 500, unit_cost: 200, quantity: 4 },
];

describe("bestSellers", () => {
  it("aggregates by product (units, revenue, profit) and sorts by revenue", () => {
    const rows = bestSellers(items);
    expect(rows[0]).toEqual({
      productId: "p1",
      name: "Candle",
      units: 3,
      revenue: 4500,
      profit: 2700,
    });
    expect(rows[1].name).toBe("Soap");
    expect(rows[1].revenue).toBe(2000);
  });
  it("honours the limit", () => {
    expect(bestSellers(items, { limit: 1 }).length).toBe(1);
  });
});

describe("revenueByPaymentMethod", () => {
  it("buckets totals by payment method", () => {
    const mix = revenueByPaymentMethod([
      { sold_at: "2026-05-01T10:00:00Z", payment_method: "cash", total_amount: 1000, total_cost: 400 },
      { sold_at: "2026-05-01T11:00:00Z", payment_method: "cash", total_amount: 500, total_cost: 200 },
      { sold_at: "2026-05-01T12:00:00Z", payment_method: "card", total_amount: 2000, total_cost: 900 },
    ]);
    expect(mix).toEqual({ cash: 1500, card: 2000, other: 0 });
  });
});

describe("salesByHour", () => {
  it("buckets by local hour and sorts ascending", () => {
    const buckets = salesByHour([
      { sold_at: "2026-05-01T14:30:00Z", payment_method: "cash", total_amount: 1000, total_cost: 400 },
      { sold_at: "2026-05-01T14:59:00Z", payment_method: "card", total_amount: 500, total_cost: 200 },
      { sold_at: "2026-05-01T09:05:00Z", payment_method: "other", total_amount: 2000, total_cost: 900 },
    ]);
    expect(buckets.map((b) => b.hour)).toEqual([new Date("2026-05-01T09:05:00Z").getHours(), 14]);
    const hour14 = buckets.find((b) => b.hour === 14)!;
    expect(hour14.count).toBe(2);
    expect(hour14.revenue).toBe(1500);
  });
});

describe("summarizeMonth", () => {
  it("rolls up revenue/cogs/grossProfit/saleCount", () => {
    const s = summarizeMonth([
      { sold_at: "2026-05-01T10:00:00Z", payment_method: "cash", total_amount: 1000, total_cost: 400 },
      { sold_at: "2026-05-02T10:00:00Z", payment_method: "card", total_amount: 2500, total_cost: 1000 },
    ]);
    expect(s).toEqual({ revenue: 3500, cogs: 1400, grossProfit: 2100, saleCount: 2 });
  });
});

describe("inMonth", () => {
  it("matches YYYY-MM prefix", () => {
    expect(inMonth("2026-05-14T08:00:00Z", "2026-05")).toBe(true);
    expect(inMonth("2026-06-01T08:00:00Z", "2026-05")).toBe(false);
  });
});
