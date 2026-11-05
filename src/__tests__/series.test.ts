import { describe, expect, it } from "vitest";
import { MAX_GROUPS, buildSeries } from "../data";
import type { Chart, Row } from "../types";

function makeChart(patch: Partial<Chart> = {}): Chart {
  return {
    id: "c1",
    type: "bar",
    title: "Test",
    dimensions: ["Customer"],
    metrics: [{ field: "Amount", agg: "sum" }],
    width: 6,
    height: 320,
    showLegend: false,
    showGrid: true,
    palette: [],
    sort: "none",
    limit: 0,
    ...patch,
  };
}

function rows(count: number, customers = 500): Row[] {
  const out: Row[] = [];
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const amount = (i % 100) + 1;
    total += amount;
    out.push({ Customer: `Customer ${i % customers}`, Amount: amount, Month: `2025-${(i % 12) + 1}`.padStart(7, "0") });
  }
  return out;
}

describe("buildSeries on large sources", () => {
  it("aggregates 100k rows without changing the totals", () => {
    const data = rows(100_000, 400);
    const series = buildSeries(data, makeChart());
    const sum = series.reduce((acc, d) => acc + Number(d.Amount), 0);
    const expected = data.reduce((acc, r) => acc + Number(r.Amount), 0);
    expect(series).toHaveLength(400);
    expect(Math.round(sum)).toBe(Math.round(expected));
  });

  it("caps runaway dimensions and folds the rest into Other", () => {
    // Every row has its own customer: without the cap this is 50k bars.
    const data = rows(50_000, 50_000);
    const series = buildSeries(data, makeChart({ dimensions: ["Customer"] }));
    expect(series.length).toBe(MAX_GROUPS + 1);
    expect(series[series.length - 1].key).toBe("Other");
    const sum = series.reduce((acc, d) => acc + Number(d.Amount), 0);
    const expected = data.reduce((acc, r) => acc + Number(r.Amount), 0);
    expect(Math.round(sum)).toBe(Math.round(expected));
  });

  it("keeps avg, min, max, count and count_distinct exact", () => {
    const data: Row[] = [
      { Customer: "A", Amount: 10, Units: 1, Qty: 1 },
      { Customer: "A", Amount: 30, Units: 3, Qty: 1 },
      { Customer: "B", Amount: 5, Units: 1, Qty: 1 },
    ];
    const valueFor = (agg: "avg" | "min" | "max" | "count" | "count_distinct", field: string, key: string) =>
      buildSeries(data, makeChart({ metrics: [{ field, agg }] })).find((d) => d.key === key)?.[field];

    expect(valueFor("avg", "Amount", "A")).toBe(20);
    expect(valueFor("min", "Amount", "A")).toBe(10);
    expect(valueFor("max", "Amount", "A")).toBe(30);
    expect(valueFor("count", "Amount", "A")).toBe(2);
    expect(valueFor("count_distinct", "Units", "A")).toBe(2);
    expect(valueFor("avg", "Amount", "B")).toBe(5);
  });

  it("returns nothing for a chart without metrics instead of scanning rows", () => {
    expect(buildSeries(rows(1000), makeChart({ metrics: [] }))).toEqual([]);
  });
});
