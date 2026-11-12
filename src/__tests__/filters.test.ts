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

  it("keeps month cells that overlap a day-precision range", () => {
    const rows: Row[] = [{ M: "2025-12" }, { M: "2026-01" }, { M: "2026-02" }, { M: "2026-03" }];
    const kept = applyFilters(rows, [range("M", "2026-01-15", "2026-02-10")]);
    expect(kept.map((r) => r.M)).toEqual(["2026-01", "2026-02"]);
  });

  it("matches a single day picked on both ends", () => {
    const rows: Row[] = [{ D: "2026-03-04" }, { D: "2026-03-05" }, { D: "2026-03-06" }];
    expect(applyFilters(rows, [range("D", "2026-03-05", "2026-03-05")])).toHaveLength(1);
  });

  it("filters a whole year when one end is left empty", () => {
    const rows: Row[] = [{ D: "2025-11-02" }, { D: "2026-05-20" }, { D: "2027-01-03" }];
    const kept = applyFilters(rows, [{ field: "D", values: [], min: "2026-01-01" }]);
    expect(kept).toHaveLength(2);
    const until = applyFilters(rows, [{ field: "D", values: [], max: "2026-12-31" }]);
    expect(until).toHaveLength(2);
  });

  it("reads timestamps and long-form dates", () => {
    const rows: Row[] = [{ D: "2026-04-01T09:30:00Z" }, { D: "April 2, 2026" }, { D: "2026-06-01" }];
    const kept = applyFilters(rows, [range("D", "2026-04-01", "2026-04-30")]);
    expect(kept).toHaveLength(2);
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

describe("blank cells", () => {
  const rows: Row[] = [
    { Amt: 100 },
    { Amt: 101 },
    { Amt: 900 },
    ...Array.from({ length: 7 }, () => ({ Amt: "" })),
  ];
  const blankRows: Row[] = Array.from({ length: 7 }, () => ({ Region: "" as string }));

  it("filters on blank rows when the empty value is picked", () => {
    const all: Row[] = [{ Region: "West" }, ...blankRows];
    expect(applyFilters(all, [{ field: "Region", values: [""] }])).toHaveLength(7);
    // Typed as the label it paints, so a chip saved before the label existed
    // still matches.
    expect(applyFilters(all, [{ field: "Region", values: ["(blank)"] }])).toHaveLength(7);
  });

  it("drops blank rows from a range by default", () => {
    expect(applyFilters(rows, [range("Amt", "100", "200")])).toHaveLength(2);
  });

  it("keeps blank rows when the range chip asks for them", () => {
    const kept = applyFilters(rows, [{ field: "Amt", values: [], min: "100", max: "200", blank: true }]);
    expect(kept).toHaveLength(9);
  });

  it("treats the switch alone as rows with no value", () => {
    expect(applyFilters(rows, [{ field: "Amt", values: [], blank: true }])).toHaveLength(7);
    expect(applyFilters(rows, [{ field: "Amt", values: [] }])).toHaveLength(10);
  });

  it("keeps blank cells in a period range when asked", () => {
    const months: Row[] = [{ M: "2026-01" }, { M: "" }, { M: "2025-01" }];
    expect(applyFilters(months, [range("M", "202601", "202612")])).toHaveLength(1);
    expect(applyFilters(months, [{ field: "M", values: [], min: "202601", max: "202612", blank: true }])).toHaveLength(2);
  });

  it("ignores the blank switch on a values chip", () => {
    const all: Row[] = [{ Region: "West" }, ...blankRows];
    // An explicit mode wins: the switch belongs to the range control only.
    expect(
      applyFilters(all, [{ field: "Region", values: ["West"], blank: true, mode: "values" }]),
    ).toHaveLength(1);
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
