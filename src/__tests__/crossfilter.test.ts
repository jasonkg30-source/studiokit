import { describe, expect, it } from "vitest";
import { matchesFocus, rowsForChart, toggleFocus, type Focus } from "../crossfilter";
import type { Row } from "../types";

const rows: Row[] = [
  { Customer: "Acme", Region: "West", Amount: 100 },
  { Customer: "Acme", Region: "East", Amount: 50 },
  { Customer: "Bolt", Region: "West", Amount: 70 },
  { Customer: "Cyan", Region: "East", Amount: 20 },
];

const table = { id: "chart-table" };
const bar = { id: "chart-bar" };
const other = { id: "chart-other" };

const pick = (field: string, value: string, from: string, additive = false): Focus[] =>
  toggleFocus([], field, value, { from, additive });

describe("cross-filter from a table", () => {
  it("filters other charts that share the same dimension", () => {
    // The regression: a bar chart on Customer used to sit unfiltered because it
    // shares the field with the table the click came from.
    const focuses = pick("Customer", "Acme", table.id);
    expect(rowsForChart(rows, focuses, bar).map((r) => r.Customer)).toEqual(["Acme", "Acme"]);
  });

  it("keeps every row in the chart the click came from, so a second value can be picked", () => {
    const focuses = pick("Customer", "Acme", table.id);
    expect(rowsForChart(rows, focuses, table)).toHaveLength(rows.length);
  });

  it("filters charts that use another field too", () => {
    const focuses = pick("Customer", "Acme", table.id);
    expect(rowsForChart(rows, focuses, other)).toHaveLength(2);
  });

  it("accumulates values when a second row is picked", () => {
    let focuses = pick("Customer", "Acme", table.id, true);
    focuses = toggleFocus(focuses, "Customer", "Bolt", { from: table.id, additive: true });
    expect(focuses[0].values).toEqual(["Acme", "Bolt"]);
    expect(rowsForChart(rows, focuses, bar).map((r) => r.Customer)).toEqual(["Acme", "Acme", "Bolt"]);
    expect(rowsForChart(rows, focuses, table)).toHaveLength(rows.length);
  });

  it("removes a value that is picked a second time", () => {
    let focuses = pick("Customer", "Acme", table.id, true);
    focuses = toggleFocus(focuses, "Customer", "Acme", { from: table.id, additive: true });
    expect(focuses).toHaveLength(0);
  });

  it("moves the unfiltered view to the chart that was clicked last", () => {
    let focuses = pick("Customer", "Acme", table.id);
    focuses = toggleFocus(focuses, "Customer", "Bolt", { from: bar.id });
    expect(rowsForChart(rows, focuses, bar)).toHaveLength(rows.length);
    expect(rowsForChart(rows, focuses, table).map((r) => r.Customer)).toEqual(["Bolt"]);
  });

  it("stacks filters from two different fields", () => {
    let focuses = pick("Customer", "Acme", table.id);
    focuses = toggleFocus(focuses, "Region", "West", { from: other.id });
    expect(rowsForChart(rows, focuses, bar)).toEqual([rows[0]]);
  });

  it("matches values regardless of case and spacing", () => {
    const focuses: Focus[] = [{ field: "Customer", values: ["  acme "], from: bar.id }];
    expect(rowsForChart(rows, focuses, table)).toHaveLength(2);
    expect(matchesFocus(rows[0], focuses[0])).toBe(true);
  });

  it("treats a blank value as the empty string", () => {
    const withBlank: Row[] = [{ Customer: "" }, { Customer: "Acme" }];
    const focuses: Focus[] = [{ field: "Customer", values: [""], from: bar.id }];
    expect(rowsForChart(withBlank, focuses, table)).toEqual([{ Customer: "" }]);
  });
});
