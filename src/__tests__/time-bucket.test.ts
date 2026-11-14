import { describe, expect, it } from "vitest";
import { buildSeries } from "../data";
import type { Chart } from "../types";

const chart = (extra: Partial<Chart> = {}): Chart =>
  ({
    id: "t",
    type: "timeseries",
    title: "Trend",
    dimensions: ["Date"],
    metrics: [{ field: "Amt", agg: "sum" }],
    width: 6,
    height: 240,
    showLegend: false,
    showGrid: false,
    palette: ["#2563eb"],
    sort: "none",
    limit: 0,
    ...extra,
  }) as Chart;

const rows = [
  { Date: "1/2/2026", Amt: 10 },
  { Date: "1/15/2026", Amt: 20 },
  { Date: "1/25/2026", Amt: 30 },
  { Date: "2/3/2026", Amt: 40 },
];

describe("buildSeries month bucketing", () => {
  it("keeps one point per date when the toggle is off", () => {
    expect(buildSeries(rows, chart())).toHaveLength(4);
  });

  it("folds three January dates into one point that holds their sum", () => {
    const out = buildSeries(rows, chart({ timeBucket: "month" }));
    expect(out.map((d) => d.key)).toEqual(["2026-01", "2026-02"]);
    expect(out[0].Amt).toBe(60);
    expect(out[1].Amt).toBe(40);
  });

  it("sorts months chronologically even when the rows are shuffled", () => {
    const shuffled = [rows[3], rows[0], rows[2], rows[1]];
    const out = buildSeries(shuffled, chart({ timeBucket: "month" }));
    expect(out.map((d) => d.key)).toEqual(["2026-01", "2026-02"]);
  });

  it("reads ISO and compact month keys", () => {
    const out = buildSeries(
      [
        { Date: "2026-01-02", Amt: 5 },
        { Date: "20260115", Amt: 5 },
      ],
      chart({ timeBucket: "month" }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("2026-01");
    expect(out[0].Amt).toBe(10);
  });

  it("leaves a non-date dimension alone", () => {
    const out = buildSeries(
      [
        { Date: "North", Amt: 1 },
        { Date: "South", Amt: 2 },
      ],
      chart({ timeBucket: "month" }),
    );
    expect(out.map((d) => d.key)).toEqual(["North", "South"]);
  });
});
