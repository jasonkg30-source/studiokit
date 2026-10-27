import { useReducer, type Dispatch } from "react";
import type { Chart, ChartType, DataSource, Report, ReportPage } from "./types";

export const PALETTE = ["#2563eb", "#0ea5e9", "#14b8a6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#64748b"];

export function newChart(type: ChartType, partial: Partial<Chart> = {}): Chart {
  const base: Chart = {
    id: crypto.randomUUID(),
    type,
    title: defaultTitle(type),
    dimensions: [],
    metrics: [],
    width: 6,
    height: 320,
    showLegend: true,
    showGrid: true,
    palette: PALETTE,
    sort: "none",
    limit: type === "table" ? 20 : 12,
  };
  return { ...base, ...partial };
}

function defaultTitle(type: ChartType): string {
  return (
    {
      table: "Table",
      scorecard: "Scorecard",
      timeseries: "Time series",
      area: "Area chart",
      bar: "Bar chart",
      hbar: "Horizontal bars",
      stacked: "Stacked bars",
      pie: "Pie chart",
      donut: "Donut chart",
      scatter: "Scatter",
    } as Record<ChartType, string>
  )[type];
}

/** Build a first page that only references fields that actually exist in the source. */
function starterCharts(source: DataSource): Chart[] {
  const numeric = source.fields.filter((f) => f.type === "number");
  const dates = source.fields.filter((f) => f.type === "date");
  const strings = source.fields.filter((f) => f.type === "string");
  const primary = numeric[0]?.name;
  const secondary = numeric[1]?.name;
  const label = strings[0]?.name;
  const dateField = dates[0]?.name;

  const cards: Chart[] = [];
  if (primary) {
    cards.push(
      newChart("scorecard", {
        title: `Total ${primary.toLowerCase()}`,
        metrics: [{ field: primary, agg: "sum" }],
        width: 3,
        height: 150,
      }),
    );
  }
  cards.push(
    newChart("scorecard", {
      title: "Rows",
      metrics: [{ field: primary ?? source.fields[0].name, agg: "count" }],
      width: 3,
      height: 150,
    }),
  );
  if (secondary) {
    cards.push(
      newChart("scorecard", {
        title: `Total ${secondary.toLowerCase()}`,
        metrics: [{ field: secondary, agg: "sum" }],
        width: 3,
        height: 150,
      }),
    );
  }
  if (label) {
    cards.push(
      newChart("scorecard", {
        title: `Distinct ${label.toLowerCase()}`,
        metrics: [{ field: label, agg: "count_distinct" }],
        width: 3,
        height: 150,
      }),
    );
  }
  const cardWidth = cards.length ? Math.max(3, Math.floor(12 / cards.length)) : 3;
  cards.forEach((c) => (c.width = cardWidth));

  const charts: Chart[] = [...cards];
  if (dateField && primary) {
    charts.push(
      newChart("timeseries", {
        title: `${primary} over time`,
        dimensions: [dateField],
        metrics: [{ field: primary, agg: "sum" }],
        width: 8,
        height: 340,
        sort: "dim_asc",
        limit: 0,
      }),
    );
  }
  if (label && primary) {
    charts.push(
      newChart("bar", {
        title: `${primary} by ${label.toLowerCase()}`,
        dimensions: [label],
        metrics: [{ field: primary, agg: "sum" }],
        width: charts.length > cards.length ? 4 : 12,
        height: 340,
        sort: "metric_desc",
      }),
    );
  }
  return charts;
}

/** Sensible first selection for a newly added chart, based on the connected source. */
export function autofill(source: DataSource | null, type: ChartType): Partial<Chart> {
  if (!source) return {};
  const numeric = source.fields.filter((f) => f.type === "number");
  const label = source.fields.find((f) => f.type === "string")?.name;
  const date = source.fields.find((f) => f.type === "date")?.name;
  const primary = numeric[0]?.name;
  const secondary = numeric[1]?.name;

  switch (type) {
    case "scorecard":
      return primary ? { metrics: [{ field: primary, agg: "sum" }], title: `Total ${primary.toLowerCase()}` } : {};
    case "timeseries":
    case "area":
      return date && primary
        ? { dimensions: [date], metrics: [{ field: primary, agg: "sum" }], sort: "dim_asc", limit: 0, title: `${primary} over time` }
        : {};
    case "table":
      return {
        dimensions: label ? [label] : date ? [date] : [],
        metrics: primary ? [{ field: primary, agg: "sum" }] : [],
        limit: 20,
        title: label ? `${label} detail` : "Table",
      };
    case "scatter":
      return primary && secondary
        ? { dimensions: [primary], metrics: [{ field: secondary, agg: "sum" }], title: `${secondary} vs ${primary}` }
        : {};
    default:
      return label && primary
        ? { dimensions: [label], metrics: [{ field: primary, agg: "sum" }], sort: "metric_desc", title: `${primary} by ${label.toLowerCase()}` }
        : {};
  }
}

export function emptyReport(source: DataSource | null): Report {
  const page: ReportPage = {
    id: crypto.randomUUID(),
    name: "Page 1",
    charts: source ? starterCharts(source) : [],
  };
  return {
    id: crypto.randomUUID(),
    title: "Marketing overview",
    sourceId: source?.id ?? null,
    pages: [page],
    activePageId: page.id,
    dateField: source?.fields.find((f) => f.type === "date")?.name ?? null,
    dateRange: "all",
    filters: [],
    theme: "light",
  };
}

export interface UIState {
  report: Report;
  source: DataSource | null;
  selectedChartId: string | null;
  showAddMenu: boolean;
  showShare: boolean;
  showData: boolean;
  viewMode: boolean;
}

export type Action =
  | { type: "setReport"; report: Report }
  | { type: "setSource"; source: DataSource | null; report?: Report }
  | { type: "setTitle"; title: string }
  | { type: "addChart"; chartType: ChartType }
  | { type: "updateChart"; id: string; patch: Partial<Chart> }
  | { type: "deleteChart"; id: string }
  | { type: "duplicateChart"; id: string }
  | { type: "selectChart"; id: string | null }
  | { type: "addPage" }
  | { type: "selectPage"; id: string }
  | { type: "renamePage"; id: string; name: string }
  | { type: "deletePage"; id: string }
  | { type: "setDateRange"; range: Report["dateRange"] }
  | { type: "toggleView" }
  | { type: "ui"; patch: Partial<Pick<UIState, "showAddMenu" | "showShare" | "showData">> };

export function currentPage(report: Report): ReportPage {
  return report.pages.find((p) => p.id === report.activePageId) || report.pages[0];
}

export function reducer(state: UIState, action: Action): UIState {
  switch (action.type) {
    case "setReport":
      return { ...state, report: action.report, selectedChartId: null };
    case "setSource":
      return {
        ...state,
        source: action.source,
        report: action.report ?? { ...state.report, sourceId: action.source?.id ?? null },
        selectedChartId: null,
      };
    case "setTitle":
      return { ...state, report: { ...state.report, title: action.title } };
    case "addChart": {
      const page = currentPage(state.report);
      const chart = newChart(action.chartType, {
        width: action.chartType === "scorecard" ? 3 : 6,
        height: action.chartType === "scorecard" ? 150 : 320,
        ...autofill(state.source, action.chartType),
      });
      const report = {
        ...state.report,
        pages: state.report.pages.map((p) => (p.id === page.id ? { ...p, charts: [...p.charts, chart] } : p)),
      };
      return { ...state, report, selectedChartId: chart.id, showAddMenu: false };
    }
    case "updateChart": {
      const page = currentPage(state.report);
      const report = {
        ...state.report,
        pages: state.report.pages.map((p) =>
          p.id === page.id ? { ...p, charts: p.charts.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)) } : p,
        ),
      };
      return { ...state, report };
    }
    case "deleteChart": {
      const page = currentPage(state.report);
      return {
        ...state,
        selectedChartId: null,
        report: {
          ...state.report,
          pages: state.report.pages.map((p) => (p.id === page.id ? { ...p, charts: p.charts.filter((c) => c.id !== action.id) } : p)),
        },
      };
    }
    case "duplicateChart": {
      const page = currentPage(state.report);
      const original = page.charts.find((c) => c.id === action.id);
      if (!original) return state;
      const copy = { ...original, id: crypto.randomUUID(), title: original.title + " copy" };
      return {
        ...state,
        selectedChartId: copy.id,
        report: {
          ...state.report,
          pages: state.report.pages.map((p) => (p.id === page.id ? { ...p, charts: [...p.charts, copy] } : p)),
        },
      };
    }
    case "selectChart":
      return { ...state, selectedChartId: action.id };
    case "addPage": {
      const page: ReportPage = { id: crypto.randomUUID(), name: `Page ${state.report.pages.length + 1}`, charts: [] };
      return { ...state, report: { ...state.report, pages: [...state.report.pages, page], activePageId: page.id }, selectedChartId: null };
    }
    case "selectPage":
      return { ...state, report: { ...state.report, activePageId: action.id }, selectedChartId: null };
    case "renamePage":
      return {
        ...state,
        report: { ...state.report, pages: state.report.pages.map((p) => (p.id === action.id ? { ...p, name: action.name } : p)) },
      };
    case "deletePage": {
      if (state.report.pages.length === 1) return state;
      const pages = state.report.pages.filter((p) => p.id !== action.id);
      return { ...state, report: { ...state.report, pages, activePageId: pages[0].id }, selectedChartId: null };
    }
    case "setDateRange":
      return { ...state, report: { ...state.report, dateRange: action.range } };
    case "toggleView":
      return { ...state, viewMode: !state.viewMode, selectedChartId: null, showAddMenu: false };
    case "ui":
      return { ...state, ...action.patch };
    default:
      return state;
  }
}

export function useReportStore(): [UIState, Dispatch<Action>] {
  return useReducer(reducer, undefined as unknown as UIState);
}
