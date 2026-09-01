import { describe, expect, it } from "vitest";
import { calcSellThrough, calcSellThroughRows, formatRate } from "./sellThrough";

describe("calcSellThrough", () => {
  it("sold / brought × 100", () => {
    expect(calcSellThrough(15, 20)).toBe(75);
  });
  it("100% when everything sold", () => {
    expect(calcSellThrough(6, 6)).toBe(100);
  });
  it("guard divide-by-zero (brought 0) → null, never NaN", () => {
    expect(calcSellThrough(0, 0)).toBeNull();
    expect(Number.isNaN(calcSellThrough(0, 0) as number)).toBe(false);
  });
  it("negative brought (bad data) → null, never negative-division weirdness", () => {
    expect(calcSellThrough(2, -1)).toBeNull();
  });
});

describe("calcSellThroughRows", () => {
  it("computes rate and remaining per row", () => {
    const rows = calcSellThroughRows([
      { productId: "a", name: "Candles", brought: 10, sold: 4 },
      { productId: "b", name: "Soap", brought: 0, sold: 0 },
    ]);
    expect(rows[0].rate).toBe(40);
    expect(rows[0].remaining).toBe(6);
    expect(rows[1].rate).toBeNull();
    expect(rows[1].remaining).toBe(0);
  });
});

describe("formatRate", () => {
  it("rounds to whole percent", () => {
    expect(formatRate(62.4)).toBe("62%");
  });
  it("em dash for null", () => {
    expect(formatRate(null)).toBe("—");
  });
});
