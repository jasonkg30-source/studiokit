import { describe, expect, it } from "vitest";
import { applyFilters, scaleOf, toScale } from "../filters";
import type { Filter, Row } from "../types";

const range = (field: string, min: string, max: string): Filter => ({ field, min, max, values: [] });

describe("numeric range filters", () => {
  it("compares YYYY-MM cells against YYYYMM bounds instead of dropping them", () => {
    const rows: Row[] = [
      { "Order Month": "2026-01" },
      { "Order Month": "2026-11" },
      { "Order Month": "2025-12" },
    ];
    const kept = applyFilters(rows, [range("Order Month", "202601", "202612")]);
    expect(kept.map((r) => r["Order Month"])).toEqual(["2026-01", "2026-11"]);
  });

  it("accepts bounds written like the cells", () => {
    const rows: Row[] = [{ "Order Month": "2026-03" }, { "Order Month": "2027-01" }];
    const kept = applyFilters(rows, [range("Order Month", "2026-01", "2026-12")]);
    expect(kept).toHaveLength(1);
  });

  it("keeps plain numeric columns working", () => {
    const rows: Row[] = [{ Amt: 1500 }, { Amt: 500 }, { Amt: 2500 }];
    const kept = applyFilters(rows, [range("Amt", "1000", "2000")]);
    expect(kept.map((r) => r.Amt)).toEqual([1500]);
  });

  it("reads money strings as numbers", () => {
    const rows: Row[] = [{ Amt: "$1,234.50" }, { Amt: "$2,500.00" }];
    expect(applyFilters(rows, [range("Amt", "1000", "2000")])).toHaveLength(1);
  });

  it("compares full dates on a day scale", () => {
    const rows: Row[] = [{ D: "2026-05-04" }, { D: "2027-01-01" }];
    expect(applyFilters(rows, [range("D", "20260101", "20261231")])).toHaveLength(1);
  });

  it("treats a bare year bound as a year", () => {
    const rows: Row[] = [{ Y: "2026-02-01" }, { Y: "2025-02-01" }];
    expect(applyFilters(rows, [range("Y", "2026", "2026")])).toHaveLength(1);
  });

  it("drops cells it cannot compare", () => {
    const rows: Row[] = [{ M: "n/a" }, { M: "2026-04" }];
    expect(applyFilters(rows, [range("M", "202601", "202612")])).toHaveLength(1);
  });

  it("still handles value filters and the skip hook", () => {
    const rows: Row[] = [
      { C: "A", Amt: 100 },
      { C: "B", Amt: 300 },
    ];
    const values: Filter = { field: "C", values: ["A"] };
    expect(applyFilters(rows, [values])).toHaveLength(1);
    const dateSkip = (f: string) => f === "M";
    expect(applyFilters(rows, [range("M", "202601", "202612")], dateSkip)).toHaveLength(2);
  });
});

describe("scales", () => {
  it("derives the scale from the bounds' shape", () => {
    expect(scaleOf("202601", "202612")).toBe(6);
    expect(scaleOf("2026-01", "2026-12")).toBe(6);
    expect(scaleOf("2026-01-15", "2026-12-31")).toBe(8);
    expect(scaleOf("2026", "2026")).toBe(4);
    expect(scaleOf("1000", "2000")).toBe(0);
  });

  it("maps cells onto the requested scale", () => {
    expect(toScale("2026-01", 6)).toBe(202601);
    expect(toScale("2026-01-15", 6)).toBe(202601);
    expect(toScale(20260115, 6)).toBe(202601);
    expect(toScale("2026-01-15", 8)).toBe(20260115);
    expect(toScale("2026-01", 4)).toBe(2026);
  });
});
