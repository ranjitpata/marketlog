import { describe, expect, it } from "vitest";
import {
  calcCogs,
  calcEventSummary,
  calcProfit,
  calcProfitMargin,
  calcRevenue,
  calcTotalExpenses,
} from "./profit";

const items = [
  { unit_price: 1500, unit_cost: 600, quantity: 2 },
  { unit_price: 250, unit_cost: 100, quantity: 4 },
];

describe("calcRevenue", () => {
  it("sums unit_price × quantity", () => {
    expect(calcRevenue(items)).toBe(1500 * 2 + 250 * 4);
  });
  it("returns 0 for no items", () => {
    expect(calcRevenue([])).toBe(0);
  });
});

describe("calcCogs", () => {
  it("sums unit_cost × quantity", () => {
    expect(calcCogs(items)).toBe(600 * 2 + 100 * 4);
  });
});

describe("calcTotalExpenses", () => {
  it("adds booth fee ONCE plus expense rows (no double count)", () => {
    const event = { booth_fee: 5000 };
    const expenses = [{ amount: 1200 }, { amount: 800 }];
    expect(calcTotalExpenses(event, expenses)).toBe(5000 + 1200 + 800);
  });
  it("booth fee alone with zero rows", () => {
    expect(calcTotalExpenses({ booth_fee: 2500 }, [])).toBe(2500);
  });
});

describe("calcProfit", () => {
  it("revenue − cogs − expenses", () => {
    expect(calcProfit(10000, 4000, 2500)).toBe(3500);
  });
  it("can be negative (loss)", () => {
    expect(calcProfit(1000, 4000, 2500)).toBe(-5500);
  });
});

describe("calcProfitMargin", () => {
  it("percentage of revenue", () => {
    expect(calcProfitMargin(2500, 10000)).toBe(25);
  });
  it("guard divide-by-zero → null, never NaN", () => {
    expect(calcProfitMargin(0, 0)).toBeNull();
    expect(Number.isNaN(calcProfitMargin(0, 0) as number)).toBe(false);
  });
});

describe("calcEventSummary", () => {
  it("composes all of the above", () => {
    const summary = calcEventSummary({ booth_fee: 1000 }, items, [{ amount: 500 }]);
    // revenue = 4000, cogs = 1600, expenses = 1500 → profit = 900
    expect(summary).toEqual({
      revenue: 4000,
      cogs: 1600,
      expenses: 1500,
      profit: 900,
      margin: 22.5,
    });
  });
  it("margin is null when nothing sold", () => {
    const summary = calcEventSummary({ booth_fee: 1000 }, [], []);
    expect(summary.margin).toBeNull();
    expect(summary.profit).toBe(-1000);
  });
});
