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

/** Build a data source from a sheet-like 2-D matrix: first non-empty row is treated as the header. */
export function sourceFromMatrix(matrix: unknown[][], name: string, origin: DataSource["origin"]): DataSource {
  const clean = matrix.filter((r) => Array.isArray(r) && r.some((c) => c !== null && c !== undefined && String(c).trim() !== ""));
  if (!clean.length) throw new Error("This sheet has no rows.");
  const headerRow = clean[0].map((c, i) => {
    const label = c === null || c === undefined ? "" : String(c).trim();
    return label || `Column ${i + 1}`;
  });
  const seen = new Map<string, number>();
  const headers = headerRow.map((h) => {
    const n = (seen.get(h) || 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h} (${n})`;
  });

  const body = clean.slice(1);
  const cells: (string | number | null)[][] = body.map((r) =>
    headers.map((_, i) => {
      const v = r[i];
      if (v === null || v === undefined) return null;
      if (v instanceof Date) {
        const pad = (n: number) => String(n).padStart(2, "0");
        const ymd = `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
        const hasTime = v.getHours() || v.getMinutes() || v.getSeconds();
        return hasTime ? `${ymd} ${pad(v.getHours())}:${pad(v.getMinutes())}` : ymd;
      }
      if (typeof v === "number" || typeof v === "string") return v;
      if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
      return String(v);
    }),
  );

  const fields: Field[] = headers.map((h, i) => inferField(h, cells.map((r) => r[i] ?? null)));
  const rows: Row[] = cells.map((r) => {
    const out: Row = {};
    r.forEach((v, i) => {
      out[headers[i]] = coerce(v, fields[i].type);
    });
    return out;
  });

  return { id: crypto.randomUUID(), name, fields, rows, origin };
}

export interface Spreadsheet {
  sheets: string[];
  read: (sheetName: string) => DataSource;
}

/** Parse an .xlsx / .xls / .xlsm workbook in the browser (SheetJS is loaded on demand). */
export async function parseWorkbook(file: File, displayName = "Excel workbook"): Promise<Spreadsheet> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  let wb;
  try {
    wb = XLSX.read(buffer, { type: "array", cellDates: true, dense: false });
  } catch {
    throw new Error("Could not read this workbook. Password-protected or malformed files are not supported.");
  }
  const sheets = wb.SheetNames.filter((s) => wb.Sheets[s]);
  if (!sheets.length) throw new Error("This workbook contains no visible sheets.");

  return {
    sheets,
    read: (sheetName: string) => {
      const ws = wb.Sheets[sheetName];
      if (!ws) throw new Error(`Sheet "${sheetName}" was not found.`);
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
      const name = sheets.length > 1 ? `${displayName} · ${sheetName}` : displayName;
      return sourceFromMatrix(matrix, name, "excel");
    },
  };
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

/** Deterministic order-management sample that mirrors the Order Tracker sketch (ST PO#, customer PO, ETA, port). */
export function orderTrackerSource(): DataSource {
  let seed = 20261027;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

  const customers = ["Northwind Traders", "Ace Distribution", "Blue Harbor Supply", "Summit Retail Group"];
  const regions = ["West", "East", "Central"];
  const ports = ["LAX", "Long Beach", "Newark", "Savannah"];
  const catalog = [
    { sku: "AP-1001", item: "Cotton crew tee", type: "Apparel", price: 9.5 },
    { sku: "AP-1002", item: "Fleece hoodie", type: "Apparel", price: 21.0 },
    { sku: "AP-1007", item: "Canvas tote", type: "Apparel", price: 4.25 },
    { sku: "HM-2011", item: "Ceramic mug set", type: "Home", price: 12.8 },
    { sku: "HM-2014", item: "Linen throw", type: "Home", price: 24.5 },
    { sku: "HM-2020", item: "Glass storage jar", type: "Home", price: 7.4 },
    { sku: "EL-3005", item: "USB-C hub", type: "Electronics", price: 32.0 },
    { sku: "EL-3009", item: "Bluetooth speaker", type: "Electronics", price: 41.5 },
    { sku: "EL-3014", item: "Power bank 20k", type: "Electronics", price: 27.75 },
    { sku: "OD-4002", item: "Camp chair", type: "Outdoor", price: 38.0 },
    { sku: "OD-4006", item: "Insulated bottle", type: "Outdoor", price: 14.2 },
    { sku: "OD-4011", item: "Trail backpack", type: "Outdoor", price: 56.0 },
  ];

  const rows: Row[] = [];
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  let orderNo = 10240;

  for (let i = 0; i < 64; i++) {
    orderNo += 1 + Math.floor(rand() * 3);
    const daysAgo = Math.floor(rand() * 380);
    const orderDate = new Date(today.getTime() - daysAgo * 86400000);
    const eta = new Date(orderDate.getTime() + (26 + Math.floor(rand() * 22)) * 86400000);
    const customer = pick(customers);
    const region = pick(regions);
    const port = pick(ports);
    const status = daysAgo > 120 ? "Closed" : rand() < 0.12 ? "Cancelled" : eta < today ? "Shipped" : "Open";
    const stPo = `ST-PO-${orderNo}`;
    const customerPo = `PO-${88000 + Math.floor(rand() * 9000)}`;
    const lineCount = 1 + Math.floor(rand() * 4);

    for (let l = 0; l < lineCount; l++) {
      const product = pick(catalog);
      const qty = Math.round((80 + rand() * 2400) / 10) * 10;
      const amt = Math.round(qty * product.price * (0.92 + rand() * 0.16) * 100) / 100;
      rows.push({
        "ST PO#": stPo,
        "Customer PO": customerPo,
        Customer: customer,
        Type: product.type,
        Region: region,
        Port: port,
        SKU: product.sku,
        Item: product.item,
        Qty: qty,
        Amt: amt,
        "Order Date": iso(orderDate),
        "Order Month": iso(orderDate).slice(0, 7),
        ETA: iso(eta),
        Status: status,
      });
    }
  }

  return {
    id: crypto.randomUUID(),
    name: "Order tracker sample",
    origin: "sample",
    fields: [
      { name: "ST PO#", type: "string" },
      { name: "Customer PO", type: "string" },
      { name: "Customer", type: "string" },
      { name: "Type", type: "string" },
      { name: "Region", type: "string" },
      { name: "Port", type: "string" },
      { name: "SKU", type: "string" },
      { name: "Item", type: "string" },
      { name: "Qty", type: "number" },
      { name: "Amt", type: "number" },
      { name: "Order Date", type: "date" },
      { name: "Order Month", type: "string" },
      { name: "ETA", type: "date" },
      { name: "Status", type: "string" },
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

/**
 * Canonical Order Tracker fields, keyed by the aliases real order exports use.
 * Header matching is done on a normalised header (lowercase, alphanumerics only).
 */
const ORDER_SCHEMA: { name: string; type: FieldType; aliases: string[] }[] = [
  { name: "ST PO#", type: "string", aliases: ["stpo", "stpo#", "stpono", "stponum", "stponumber", "storderno", "orderno", "orderid", "sono", "sonumber", "salesorder"] },
  { name: "Customer PO", type: "string", aliases: ["customerpo", "custpo", "custpono", "ponumber", "pono", "po"] },
  { name: "Customer", type: "string", aliases: ["customer", "customername", "account", "accountname", "buyer", "client"] },
  { name: "Type", type: "string", aliases: ["type", "producttype", "category", "productcategory", "itemtype"] },
  { name: "Region", type: "string", aliases: ["region", "territory", "area", "salesregion"] },
  { name: "Port", type: "string", aliases: ["port", "portofloading", "destinationport"] },
  { name: "SKU", type: "string", aliases: ["sku", "skucode", "itemno", "itemnum", "itemnumber", "itemcode", "partno", "partnumber", "style"] },
  { name: "Item", type: "string", aliases: ["item", "itemname", "itemdesc", "itemdescription", "product", "productname", "description", "desc"] },
  { name: "Qty", type: "number", aliases: ["qty", "quantity", "units", "ttlqty", "totalqty"] },
  { name: "Amt", type: "number", aliases: ["amt", "amount", "total", "totalamount", "totalamt", "ordervalue", "ordertotal", "extendedprice", "value", "revenue"] },
  { name: "Order Date", type: "date", aliases: ["orderdate", "podate", "date", "orderedon", "orderdt"] },
  { name: "Order Month", type: "string", aliases: ["ordermonth", "orderperiod", "month", "period", "yyyymm"] },
  { name: "ETA", type: "date", aliases: ["eta", "shipdate", "deliverydate", "duedate"] },
  { name: "Status", type: "string", aliases: ["status", "orderstatus", "state"] },
];

export const ORDER_REQUIRED = ["Amt", "Qty"];

export interface OrderMapping {
  source: DataSource;
  matched: Record<string, string>;
  missing: string[];
  /** True when the file had enough order columns to build the template. */
  usable: boolean;
}

const normaliseHeader = (name: string) => name.toLowerCase().replace(/[^a-z0-9#]/g, "");

/**
 * Re-labels an uploaded file's columns to the Order Tracker schema so the
 * template report, filters and charts can run against it unchanged.
 */
export function adaptToOrderSchema(input: DataSource): OrderMapping {
  const matched: Record<string, string> = {};
  const used = new Set<string>();
  const headers = input.fields.map((f) => f.name);
  const normalised = new Map(headers.map((h) => [h, normaliseHeader(h)]));

  for (const target of ORDER_SCHEMA) {
    const exact = headers.find((h) => !used.has(h) && normalised.get(h) === normaliseHeader(target.name));
    if (exact) {
      matched[target.name] = exact;
      used.add(exact);
    }
  }
  for (const target of ORDER_SCHEMA) {
    if (matched[target.name]) continue;
    const hit = headers.find(
      (h) => !used.has(h) && target.aliases.some((alias) => normalised.get(h) === normaliseHeader(alias)),
    );
    if (hit) {
      matched[target.name] = hit;
      used.add(hit);
    }
  }

  const fields: Field[] = ORDER_SCHEMA.filter((t) => matched[t.name]).map((t) => ({ name: t.name, type: t.type }));
  const missing = ORDER_SCHEMA.filter((t) => !matched[t.name]).map((t) => t.name);

  const monthFromDate = (value: string | number | null): string => {
    const text = String(value ?? "");
    return /^\d{4}-\d{2}/.test(text) ? text.slice(0, 7) : "";
  };
  const dateFromMonth = (value: string | number | null): string => {
    const text = String(value ?? "").trim();
    if (/^\d{4}-\d{2}$/.test(text)) return `${text}-01`;
    const parsed = Date.parse(text);
    if (isNaN(parsed)) return "";
    return new Date(parsed).toISOString().slice(0, 10);
  };

  const rows: Row[] = input.rows.map((row) => {
    const out: Row = {};
    for (const field of fields) {
      const header = matched[field.name];
      const value = row[header];
      out[field.name] = field.type === "number" ? coerce(value, "number") : String(value ?? "");
    }
    if (fields.some((f) => f.name === "Order Month") && !out["Order Month"]) {
      out["Order Month"] = monthFromDate(matched["Order Date"] ? row[matched["Order Date"]] : null);
    }
    if (fields.some((f) => f.name === "Order Date") && !out["Order Date"]) {
      out["Order Date"] = dateFromMonth(out["Order Month"] ?? null);
    }
    return out;
  });

  return {
    source: {
      id: crypto.randomUUID(),
      name: input.name,
      origin: input.origin,
      fields,
      rows,
    },
    matched,
    missing,
    usable: ORDER_REQUIRED.every((name) => !!matched[name]),
  };
}


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
