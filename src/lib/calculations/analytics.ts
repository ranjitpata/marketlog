/**
 * Analytics — PURE aggregation functions over sale items / sales.
 * All money integer cents; all functions side-effect free.
 */

import { calcRevenue } from "./profit";

export interface SaleItemLike {
  product_id: string;
  product_name_snapshot: string;
  unit_price: number;
  unit_cost: number;
  quantity: number;
}

export interface SaleLike {
  sold_at: string; // ISO
  payment_method: string;
  total_amount: number;
  total_cost: number;
}

export interface BestSellerRow {
  productId: string;
  name: string;
  units: number;
  revenue: number;
  profit: number;
}

export function bestSellers(
  items: readonly SaleItemLike[],
  opts: { limit?: number } = {},
): BestSellerRow[] {
  const byProduct = new Map<string, BestSellerRow>();
  for (const item of items) {
    const key = item.product_id || item.product_name_snapshot;
    const current =
      byProduct.get(key) ??
      {
        productId: item.product_id,
        name: item.product_name_snapshot,
        units: 0,
        revenue: 0,
        profit: 0,
      };
    current.units += item.quantity;
    current.revenue += item.unit_price * item.quantity;
    current.profit += (item.unit_price - item.unit_cost) * item.quantity;
    byProduct.set(key, current);
  }
  return Array.from(byProduct.values())
    .sort((a, b) => b.revenue - a.revenue || b.units - a.units)
    .slice(0, opts.limit ?? 5);
}

export interface PaymentMix {
  cash: number;
  card: number;
  other: number;
}

export function revenueByPaymentMethod(sales: readonly SaleLike[]): PaymentMix {
  const mix: PaymentMix = { cash: 0, card: 0, other: 0 };
  for (const s of sales) {
    if (s.payment_method === "cash") mix.cash += s.total_amount;
    else if (s.payment_method === "card") mix.card += s.total_amount;
    else mix.other += s.total_amount;
  }
  return mix;
}

export interface HourBucket {
  hour: number; // 0-23
  count: number;
  revenue: number;
}

/** Sales bucketed by hour-of-day (useful "rush" chart for a market day). */
export function salesByHour(sales: readonly SaleLike[]): HourBucket[] {
  const buckets = new Map<number, HourBucket>();
  for (const s of sales) {
    const hour = new Date(s.sold_at).getHours();
    const current = buckets.get(hour) ?? { hour, count: 0, revenue: 0 };
    current.count += 1;
    current.revenue += s.total_amount;
    buckets.set(hour, current);
  }
  return Array.from(buckets.values()).sort((a, b) => a.hour - b.hour);
}

export interface MonthSummary {
  revenue: number;
  cogs: number;
  grossProfit: number;
  saleCount: number;
}

/** Month rollup from sale rows (cost side uses the cached total_cost snapshot). */
export function summarizeMonth(sales: readonly SaleLike[]): MonthSummary {
  const revenue = sales.reduce((sum, s) => sum + s.total_amount, 0);
  const cogs = sales.reduce((sum, s) => sum + s.total_cost, 0);
  return {
    revenue,
    cogs,
    grossProfit: revenue - cogs,
    saleCount: sales.length,
  };
}

/** Items in an ISO month ('YYYY-MM'). */
export function inMonth(iso: string, monthKey: string): boolean {
  return iso.slice(0, 7) === monthKey;
}

export { calcRevenue };
