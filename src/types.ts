export type FieldType = "string" | "number" | "date";

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
  origin: "sample" | "csv" | "sheets" | "paste";
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
}

export interface Filter {
  field: string;
  values: string[];
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
