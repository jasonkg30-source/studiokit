export type FieldType = "string" | "number" | "date";

export type DataSourceOrigin = "sample" | "csv" | "sheets" | "paste" | "excel";

export interface Field {
  name: string;
  type: FieldType;
}

export type Row = Record<string, string | number | null>;

export interface DataSource {
  id: string;
  name: string;
  fields: Field[];
  rows: Row[];
  origin: DataSourceOrigin;
}

export type Aggregation = "sum" | "avg" | "count" | "min" | "max" | "count_distinct";

export interface Metric {
  field: string;
  agg: Aggregation;
}

export type ChartType =
  | "table"
  | "scorecard"
  | "timeseries"
  | "area"
  | "bar"
  | "hbar"
  | "stacked"
  | "pie"
  | "donut"
  | "scatter";

export interface Chart {
  id: string;
  type: ChartType;
  title: string;
  dimensions: string[];
  metrics: Metric[];
  width: number; // grid units, 12-col
  height: number; // px
  showLegend: boolean;
  showGrid: boolean;
  palette: string[];
  sort: "none" | "dim_asc" | "dim_desc" | "metric_desc" | "metric_asc";
  limit: number;
  /** User-arranged table column order, keyed as "d:<index>" (dimension) or "m:<field>" (metric). */
  columnOrder?: string[];
}

export interface Filter {
  field: string;
  values: string[];
  /** Inclusive numeric bounds; empty string or undefined means open-ended. */
  min?: string;
  max?: string;
}

export interface ReportPage {
  id: string;
  name: string;
  charts: Chart[];
}

export interface Report {
  id: string;
  title: string;
  sourceId: string | null;
  pages: ReportPage[];
  activePageId: string;
  dateField: string | null;
  dateRange: "all" | "7d" | "30d" | "90d" | "365d";
  filters: Filter[];
  theme: "light" | "dark";
}
