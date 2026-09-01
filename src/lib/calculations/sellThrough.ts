/**
 * Sell-through — PURE. Percentage of brought stock that sold.
 *
 *   Sell-Through Rate = quantity_sold / quantity_brought × 100
 *   (null when brought = 0 — guard divide-by-zero, never NaN)
 */

export function calcSellThrough(quantitySold: number, quantityBrought: number): number | null {
  if (quantityBrought <= 0) return null;
  return (quantitySold / quantityBrought) * 100;
}

export interface SellThroughRow {
  productId: string;
  name: string;
  brought: number;
  sold: number;
}

export interface SellThroughResult extends SellThroughRow {
  rate: number | null;
  remaining: number;
}

export function calcSellThroughRows(rows: readonly SellThroughRow[]): SellThroughResult[] {
  return rows.map((r) => ({
    ...r,
    rate: calcSellThrough(r.sold, r.brought),
    remaining: r.brought - r.sold,
  }));
}

/** Human label for a rate value (e.g. "62%" or "—"). */
export function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate)}%`;
}
