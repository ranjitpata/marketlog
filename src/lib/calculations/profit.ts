/**
 * Profit math — PURE functions, integer cents in/out, no network, no db.
 *
 *   Revenue        = Σ sale item totals
 *   COGS           = Σ (unit_cost × quantity)
 *   Total Expenses = booth_fee + Σ eventExpenses   (booth fee counted ONCE)
 *   Profit         = Revenue − COGS − Total Expenses
 *   Profit Margin  = Profit / Revenue × 100        (null when Revenue = 0)
 */

export interface LineLike {
  unit_price: number;
  unit_cost: number;
  quantity: number;
}

export interface ExpenseLike {
  amount: number;
}

export interface EventLike {
  booth_fee: number;
}

export function calcRevenue(items: readonly LineLike[]): number {
  return items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
}

export function calcCogs(items: readonly LineLike[]): number {
  return items.reduce((sum, i) => sum + i.unit_cost * i.quantity, 0);
}

/** booth_fee + expense rows — the booth fee is never an expense row, so no double count. */
export function calcTotalExpenses(event: EventLike, expenses: readonly ExpenseLike[]): number {
  return event.booth_fee + expenses.reduce((sum, e) => sum + e.amount, 0);
}

export function calcProfit(revenue: number, cogs: number, totalExpenses: number): number {
  return revenue - cogs - totalExpenses;
}

/** Percentage (0-100+). Returns null when revenue is 0 — never NaN. */
export function calcProfitMargin(profit: number, revenue: number): number | null {
  if (revenue === 0) return null;
  return (profit / revenue) * 100;
}

export interface EventProfitSummary {
  revenue: number;
  cogs: number;
  expenses: number;
  profit: number;
  margin: number | null;
}

export function calcEventSummary(
  event: EventLike,
  items: readonly LineLike[],
  expenses: readonly ExpenseLike[],
): EventProfitSummary {
  const revenue = calcRevenue(items);
  const cogs = calcCogs(items);
  const totalExpenses = calcTotalExpenses(event, expenses);
  const profit = calcProfit(revenue, cogs, totalExpenses);
  return {
    revenue,
    cogs,
    expenses: totalExpenses,
    profit,
    margin: calcProfitMargin(profit, revenue),
  };
}
