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

export function emptyReport(source: DataSource | null): Report {
  const page: ReportPage = {
    id: crypto.randomUUID(),
    name: "Page 1",
    charts: source
      ? [
          newChart("scorecard", { title: "Total revenue", dimensions: [], metrics: [{ field: "Revenue", agg: "sum" }], width: 3, height: 150 }),
          newChart("scorecard", { title: "Orders", dimensions: [], metrics: [{ field: "Orders", agg: "sum" }], width: 3, height: 150 }),
          newChart("scorecard", { title: "Sessions", dimensions: [], metrics: [{ field: "Sessions", agg: "sum" }], width: 3, height: 150 }),
          newChart("scorecard", { title: "Avg order value", dimensions: [], metrics: [{ field: "Revenue", agg: "avg" }], width: 3, height: 150 }),
          newChart("timeseries", {
            title: "Revenue over time",
            dimensions: ["Date"],
            metrics: [{ field: "Revenue", agg: "sum" }],
            width: 8,
            height: 340,
            sort: "dim_asc",
            limit: 0,
          }),
          newChart("bar", {
            title: "Revenue by channel",
            dimensions: ["Channel"],
            metrics: [{ field: "Revenue", agg: "sum" }],
            width: 4,
            height: 340,
            sort: "metric_desc",
          }),
        ]
      : [],
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
      const chart = newChart(action.chartType, { width: action.chartType === "scorecard" ? 3 : 6, height: action.chartType === "scorecard" ? 150 : 320 });
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
