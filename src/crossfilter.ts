import { blankKey } from "./data";
import type { Chart, Row } from "./types";

/**
 * A cross-filter picked in one chart. `from` is the id of the chart the click
 * came from: that chart keeps its own rows on screen (dimmed) so more values
 * can be picked from it, while every other chart is filtered by it.
 */
export interface Focus {
  field: string;
  values: string[];
  from?: string;
}

export function matchesFocus(row: Row, focus: Focus): boolean {
  const value = blankKey(row[focus.field]);
  return focus.values.some((v) => blankKey(v) === value);
}

/**
 * Rows a chart should draw.
 *
 * Every focus applies, except a focus that was picked in this very chart — a
 * table or bar must keep its own values visible, otherwise the second value
 * could never be clicked. Charts that merely share the same dimension are NOT
 * exempt: only the chart the click came from keeps its rows.
 */
export function rowsForChart(rows: Row[], focuses: Focus[], chart: Pick<Chart, "id">): Row[] {
  const applying = focuses.filter((f) => !f.from || f.from !== chart.id);
  if (!applying.length) return rows;
  return rows.filter((row) => applying.every((f) => matchesFocus(row, f)));
}

/** Adds or removes one value; `additive` keeps the values already picked. */
export function toggleFocus(
  prev: Focus[],
  field: string,
  value: string,
  opts: { additive?: boolean; from?: string } = {},
): Focus[] {
  const index = prev.findIndex((f) => f.field === field);
  const current = index >= 0 ? prev[index] : null;
  const from = opts.from ?? current?.from;

  if (!current) return [...prev, { field, values: [value], from }];

  if (!opts.additive) {
    const same = current.values.length === 1 && blankKey(current.values[0]) === blankKey(value);
    if (same) return prev.filter((_, i) => i !== index);
    return prev.map((f, i) => (i === index ? { field, values: [value], from } : f));
  }

  const exists = current.values.some((v) => blankKey(v) === blankKey(value));
  const values = exists
    ? current.values.filter((v) => blankKey(v) !== blankKey(value))
    : [...current.values, value];
  if (!values.length) return prev.filter((_, i) => i !== index);
  return prev.map((f, i) => (i === index ? { field, values, from } : f));
}
