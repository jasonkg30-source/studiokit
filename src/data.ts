import Papa from "papaparse";
import type { Aggregation, Chart, DataSource, Field, FieldType, Row } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;

export function inferField(name: string, values: (string | number | null)[]): Field {
  const sample = values.filter((v) => v !== null && v !== "").slice(0, 200) as (string | number)[];
  if (!sample.length) return { name, type: "string" };
  const nameHint = /date|day|month|year|time|created|updated/i.test(name);
  if (sample.every((v) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))))) {
    return { name, type: "number" };
  }
  if (sample.every((v) => typeof v === "string" && DATE_RE.test(v.trim()))) {
    return { name, type: "date" };
  }
  if (nameHint && sample.some((v) => !isNaN(Date.parse(String(v))))) {
    return { name, type: "date" };
  }
  return { name, type: "string" };
}

function coerce(value: string | number | null, type: FieldType): string | number | null {
  if (value === null || value === "") return null;
  if (type === "number") {
    const n = Number(String(value).replace(/[$,%\s]/g, ""));
    return isNaN(n) ? null : n;
  }
  return String(value);
}

export function parseCsv(text: string, name: string, origin: DataSource["origin"] = "csv"): DataSource {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  const headers = (parsed.meta.fields || []).filter(Boolean);
  const rawRows = parsed.data as Record<string, string>[];
  const fields: Field[] = headers.map((h) => inferField(h, rawRows.map((r) => r[h] ?? null)));
  const byName = new Map(fields.map((f) => [f.name, f.type]));
  const rows: Row[] = rawRows.map((r) => {
    const out: Row = {};
    for (const h of headers) out[h] = coerce(r[h] ?? null, byName.get(h) || "string");
    return out;
  });
  return { id: crypto.randomUUID(), name, fields, rows, origin };
}

export function sampleDataSource(): DataSource {
  const rows: Row[] = [];
  const now = new Date();
  const regions = ["North America", "Europe", "APAC", "LATAM"];
  const channels = ["Organic", "Paid Search", "Social", "Email", "Referral"];
  const products = ["Starter", "Pro", "Team", "Enterprise"];
  for (let d = 179; d >= 0; d--) {
    const day = new Date(now.getTime() - d * 86400000);
    const iso = day.toISOString().slice(0, 10);
    const trend = 1 + (180 - d) / 260;
    const weekday = [0, 6].includes(day.getDay()) ? 0.72 : 1;
    for (const region of regions) {
      for (const channel of channels) {
        const base = { "North America": 1.35, Europe: 1.0, APAC: 0.85, LATAM: 0.55 }[region] || 1;
        const ch = { Organic: 1.2, "Paid Search": 0.8, Social: 0.65, Referral: 0.45 }[channel] || 1;
        const noise = 0.75 + Math.random() * 0.5;
        const sessions = Math.round(420 * base * ch * trend * weekday * noise);
        const orders = Math.round(sessions * (0.021 + Math.random() * 0.018));
        const product = products[Math.floor(Math.random() * products.length)];
        const aov = product === "Enterprise" ? 480 : product === "Team" ? 190 : product === "Pro" ? 79 : 29;
        rows.push({
          Date: iso,
          Region: region,
          Channel: channel,
          Product: product,
          Sessions: sessions,
          Orders: orders,
          Revenue: Math.round(orders * aov * (0.9 + Math.random() * 0.2)),
          Refunds: Math.round(orders * Math.random() * 0.04),
        });
      }
    }
  }
  return {
    id: crypto.randomUUID(),
    name: "Marketing sample",
    origin: "sample",
    fields: [
      { name: "Date", type: "date" },
      { name: "Region", type: "string" },
      { name: "Channel", type: "string" },
      { name: "Product", type: "string" },
      { name: "Sessions", type: "number" },
      { name: "Orders", type: "number" },
      { name: "Revenue", type: "number" },
      { name: "Refunds", type: "number" },
    ],
    rows,
  };
}

export const AGG_LABEL: Record<Aggregation, string> = {
  sum: "SUM",
  avg: "AVG",
  count: "COUNT",
  min: "MIN",
  max: "MAX",
  count_distinct: "COUNT DISTINCT",
};

export function aggregateValue(rows: Row[], field: string, agg: Aggregation): number {
  if (agg === "count") return rows.length;
  if (agg === "count_distinct") return new Set(rows.map((r) => String(r[field] ?? ""))).size;
  const nums = rows
    .map((r) => r[field])
    .filter((v): v is number => typeof v === "number" && !isNaN(v));
  if (!nums.length) return 0;
  switch (agg) {
    case "sum":
      return nums.reduce((a, b) => a + b, 0);
    case "avg":
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    case "min":
      return Math.min(...nums);
    case "max":
      return Math.max(...nums);
    default:
      return 0;
  }
}

export interface ChartDatum {
  key: string;
  [metric: string]: string | number;
}

export function metricLabel(m: { field: string; agg: Aggregation }): string {
  return m.agg === "count" ? "COUNT" : `${AGG_LABEL[m.agg]} of ${m.field}`.replace("SUM of ", "").replace("AVG of ", "Avg ").replace("MIN of ", "Min ").replace("MAX of ", "Max ");
}

export function buildSeries(rows: Row[], chart: Chart): ChartDatum[] {
  const dims = chart.dimensions.filter(Boolean);
  const metrics = chart.metrics.filter((m) => m.field);
  if (!metrics.length) return [];

  const groups = new Map<string, Row[]>();
  if (!dims.length) {
    groups.set("All", rows);
  } else {
    for (const row of rows) {
      const key = dims.map((d) => String(row[d] ?? "(blank)")).join(" / ");
      const bucket = groups.get(key);
      if (bucket) bucket.push(row);
      else groups.set(key, [row]);
    }
  }

  let data: ChartDatum[] = Array.from(groups.entries()).map(([key, bucket]) => {
    const datum: ChartDatum = { key };
    for (const m of metrics) datum[m.field] = round(aggregateValue(bucket, m.field, m.agg));
    return datum;
  });

  if (chart.sort === "dim_asc") data.sort((a, b) => a.key.localeCompare(b.key));
  if (chart.sort === "dim_desc") data.sort((a, b) => b.key.localeCompare(a.key));
  if (chart.sort === "metric_desc" || chart.sort === "metric_asc") {
    const f = metrics[0].field;
    data.sort((a, b) => (chart.sort === "metric_asc" ? 1 : -1) * (Number(a[f]) - Number(b[f])));
  }
  if (chart.limit > 0 && data.length > chart.limit) data = data.slice(0, chart.limit);
  return data;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatNumber(n: number, compact = true): string {
  if (!isFinite(n)) return "–";
  const abs = Math.abs(n);
  if (compact && abs >= 1_000_000) return (n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (compact && abs >= 10_000) return (n / 1_000).toFixed(0) + "K";
  if (Number.isInteger(n)) return n.toLocaleString("en-US");
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function dateWindow(rows: Row[], field: string, range: string): Row[] {
  if (range === "all" || !field) return rows;
  const days = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 }[range as "7d"] ?? 0;
  if (!days) return rows;
  const dates = rows
    .map((r) => Date.parse(String(r[field])))
    .filter((t) => !isNaN(t)) as number[];
  if (!dates.length) return rows;
  const max = Math.max(...dates);
  const cutoff = max - (days - 1) * 86400000;
  return rows.filter((r) => {
    const t = Date.parse(String(r[field]));
    return isNaN(t) ? true : t >= cutoff;
  });
}
