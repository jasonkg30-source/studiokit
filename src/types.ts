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
  /**
   * Timeseries bucketing. `month` folds every date in a month into one point —
   * 1/2, 1/15 and 1/25 become a single `2026-01` with the metric summed.
   */
  timeBucket?: "none" | "month";
  /** Overlay the same months of the previous year using rows from before the filters. */
  compareYoY?: boolean;
  /**
   * Where this chart gets its rows. `inherit` (the default, and every board
   * saved before this existed) uses the page's filter chips; `own` ignores them
   * and applies `filters` instead. Cross-filter picks still apply either way, so
   * clicking a bar keeps drilling into every chart.
   */
  filterMode?: "inherit" | "own";
  /** Filters used when `filterMode === "own"`; ignored otherwise. */
  filters?: Filter[];
}

export type FilterMode = "values" | "range";

export interface Filter {
  field: string;
  values: string[];
  /** Inclusive numeric bounds; empty string or undefined means open-ended. */
  min?: string;
  max?: string;
  /**
   * How the chip filters. Missing means "pick from the field type": numbers get
   * a range, everything else a value list. Stored with the report so a shared
   * dashboard opens the same way it was built.
   */
  mode?: FilterMode;
  /**
   * Range chips only: also keep rows whose cell is empty. A column with a few
   * filled cells and a long empty tail is common in exports, and without this
   * the range control silently dropped those rows with no way to ask for them.
   */
  blank?: boolean;
}

export interface ReportPage {
  id: string;
  name: string;
  charts: Chart[];
  /**
   * Filters for this page only. Boards saved before per-page filters have none,
   * so they fall back to `Report.filters` until someone edits the bar here.
   */
  filters?: Filter[];
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
