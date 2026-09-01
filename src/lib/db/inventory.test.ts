import { describe, expect, it } from "vitest";
import { effectiveEventStatus, foldEventRemaining, foldStockOnHand } from "./inventory";

describe("foldStockOnHand", () => {
  it("initial stock sits on hand", () => {
    expect(foldStockOnHand(10, [])).toBe(10);
  });

  it("active event commits brought stock (out of the house)", () => {
    expect(
      foldStockOnHand(10, [{ quantity_brought: 6, completed: false, sold: 4, eventAdjustments: 0 }]),
    ).toBe(4);
  });

  it("completed event: only sold stock left the house, leftovers returned", () => {
    // brought 6, sold 4 → effect 4 → 10 − 4 = 6 home.
    expect(
      foldStockOnHand(10, [{ quantity_brought: 6, completed: true, sold: 4, eventAdjustments: 0 }]),
    ).toBe(6);
  });

  it("event-scoped damage reduces what returns home (not double-counted)", () => {
    // brought 6, sold 2, damaged 1 → effect = sold − adj = 2 − (−1) = 3 → 10 − 3 = 7.
    expect(
      foldStockOnHand(10, [{ quantity_brought: 6, completed: true, sold: 2, eventAdjustments: -1 }]),
    ).toBe(7);
  });

  it("folds multiple events", () => {
    expect(
      foldStockOnHand(20, [
        { quantity_brought: 5, completed: true, sold: 5, eventAdjustments: 0 }, // fully sold
        { quantity_brought: 4, completed: false, sold: 0, eventAdjustments: 0 }, // still out
        { quantity_brought: 3, completed: true, sold: 1, eventAdjustments: 0 }, // 2 returned
      ]),
    ).toBe(20 - 5 - 4 - 1);
  });

  it("is a pure recompute — folding the same inputs twice changes nothing", () => {
    const rows = [{ quantity_brought: 6, completed: true, sold: 4, eventAdjustments: 0 }];
    expect(foldStockOnHand(10, rows)).toBe(foldStockOnHand(10, rows));
  });
});

describe("foldEventRemaining", () => {
  it("brought − sold", () => {
    expect(foldEventRemaining(10, 0, 4)).toBe(6);
  });
  it("event adjustments add (restock) or subtract (damage) sellable units", () => {
    expect(foldEventRemaining(10, 2, 4)).toBe(8); // found 2 extra in the crate
    expect(foldEventRemaining(10, -3, 4)).toBe(3); // 3 damaged → can't sell them
  });
});

describe("effectiveEventStatus", () => {
  it("completed is sticky regardless of dates", () => {
    expect(
      effectiveEventStatus({ status: "completed", start_date: "2026-01-01", end_date: "2026-01-02" }, "2026-09-01"),
    ).toBe("completed");
  });
  it("derives upcoming before start date", () => {
    expect(
      effectiveEventStatus({ status: "upcoming", start_date: "2026-09-05", end_date: "2026-09-06" }, "2026-09-01"),
    ).toBe("upcoming");
  });
  it("derives ongoing between (and after) the dates until marked completed", () => {
    expect(
      effectiveEventStatus({ status: "upcoming", start_date: "2026-08-30", end_date: "2026-09-02" }, "2026-09-01"),
    ).toBe("ongoing");
    expect(
      effectiveEventStatus({ status: "upcoming", start_date: "2026-08-30", end_date: "2026-08-31" }, "2026-09-01"),
    ).toBe("ongoing");
  });
});
