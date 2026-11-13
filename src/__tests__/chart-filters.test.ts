import { describe, expect, it } from "vitest";
import { rowsForChartWithBase, type Focus } from "../crossfilter";
import { applyFilters } from "../filters";
import type { Filter, Row } from "../types";

const rows: Row[] = [
  { Region: "West", Status: "Open", Amt: 10 },
  { Region: "West", Status: "Closed", Amt: 20 },
  { Region: "East", Status: "Open", Amt: 30 },
  { Region: "East", Status: "Closed", Amt: 40 },
];

const pageFilters: Filter[] = [{ field: "Region", values: ["East"] }];

describe("rowsForChartWithBase", () => {
  it("uses the page rows for a card that inherits the chips", () => {
    const chart = { id: "a", filterMode: "inherit" as const };
    expect(rowsForChartWithBase(rows, applyFilters(rows, pageFilters), [], chart)).toHaveLength(2);
  });

  it("gives an own-filter card its own numbers instead of the page ones", () => {
    const chart = {
      id: "a",
      filterMode: "own" as const,
      filters: [{ field: "Status", values: ["Open"] } as Filter],
    };
    // Page chip says East, the card says Open: the card wins and keeps West too.
    const out = rowsForChartWithBase(rows, applyFilters(rows, pageFilters), [], chart);
    expect(out.map((r) => r.Region)).toEqual(["West", "East"]);
    expect(out.map((r) => r.Amt)).toEqual([10, 30]);
  });

  it("still applies a pick made in another chart, so drill-down works", () => {
    const chart = {
      id: "a",
      filterMode: "own" as const,
      filters: [{ field: "Status", values: ["Open"] } as Filter],
    };
    const focuses: Focus[] = [{ field: "Region", values: ["West"], from: "bar" }];
    const out = rowsForChartWithBase(rows, applyFilters(rows, pageFilters), focuses, chart);
    expect(out.map((r) => r.Amt)).toEqual([10]);
  });

  it("keeps its own rows when the pick came from this very chart", () => {
    const chart = {
      id: "a",
      filterMode: "own" as const,
      filters: [{ field: "Status", values: ["Open"] } as Filter],
    };
    const focuses: Focus[] = [{ field: "Region", values: ["West"], from: "a" }];
    expect(rowsForChartWithBase(rows, applyFilters(rows, pageFilters), focuses, chart)).toHaveLength(2);
  });

  it("shows every base row when an own card has no filters yet", () => {
    const chart = { id: "a", filterMode: "own" as const, filters: [] as Filter[] };
    expect(rowsForChartWithBase(rows, applyFilters(rows, pageFilters), [], chart)).toHaveLength(4);
  });

  it("treats a missing mode as inherit, so old boards behave exactly as before", () => {
    const chart = { id: "a" };
    expect(rowsForChartWithBase(rows, applyFilters(rows, pageFilters), [], chart)).toHaveLength(2);
  });
});
