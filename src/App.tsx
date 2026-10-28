import { useEffect, useMemo, useReducer, useState } from "react";
import { decompressFromEncodedURIComponent } from "lz-string";
import {
  ChevronDown,
  Check,
  Download,
  Eye,
  Filter,
  Layers,
  Plus,
  Share2,
  Trash2,
  X,
  Pencil,
  GripVertical,
  Sheet,
} from "lucide-react";
import ChartRenderer from "./components/ChartRenderer";
import DataModal from "./components/DataModal";
import LeftPanel from "./components/LeftPanel";
import RightPanel from "./components/RightPanel";
import ShareModal from "./components/ShareModal";
import { adaptToOrderSchema, dateWindow, orderTrackerSource, sampleDataSource } from "./data";
import { downloadReport } from "./save";
import { currentPage, emptyReport, orderReport, reducer, type UIState } from "./store";
import type { Chart, DataSource, Report } from "./types";

const STORAGE_KEY = "studiokit.report.v1";

interface Persisted {
  report: Report;
  source: DataSource | null;
}

function decodeHash(): Persisted | null {
  const m = window.location.hash.match(/^#r=(.+)$/);
  if (!m) return null;
  const token = m[1];
  try {
    let json = decompressFromEncodedURIComponent(token);
    if (!json) {
      const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
      const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      json = new TextDecoder().decode(bytes);
    }
    const parsed = JSON.parse(json);
    return { report: parsed.r, source: parsed.s ?? null };
  } catch {
    return null;
  }
}

function initialState(): UIState {
  const shared = decodeHash();
  if (shared?.report) {
    return {
      report: shared.report,
      source: shared.source,
      selectedChartId: null,
      showAddMenu: false,
      showShare: false,
      showData: false,
      viewMode: true,
    };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: Persisted = JSON.parse(raw);
      if (parsed.report?.pages?.length) {
        return {
          report: parsed.report,
          source: parsed.source ?? null,
          selectedChartId: null,
          showAddMenu: false,
          showShare: false,
          showData: false,
          viewMode: false,
        };
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  const source = null;
  return {
    report: emptyReport(source),
    source,
    selectedChartId: null,
    showAddMenu: false,
    showShare: false,
    showData: true,
    viewMode: false,
  };
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const { report, source, selectedChartId, viewMode } = state;
  const [saved, setSaved] = useState(false);
  const page = currentPage(report);
  const selected = page.charts.find((c) => c.id === selectedChartId) ?? null;

  useEffect(() => {
    if (viewMode) return;
    const payload: Persisted = { report, source };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* storage full — ignore */
    }
  }, [report, source, viewMode]);

  useEffect(() => {
    document.title = `${report.title} · StudioKit`;
  }, [report.title]);

  const filteredRows = useMemo(() => {
    if (!source) return [];
    let rows = report.dateField ? dateWindow(source.rows, report.dateField, report.dateRange) : source.rows;
    for (const f of report.filters) {
      const lo = f.min !== undefined && f.min !== "" ? Number(f.min) : null;
      const hi = f.max !== undefined && f.max !== "" ? Number(f.max) : null;
      if (lo !== null || hi !== null) {
        rows = rows.filter((r) => {
          const raw = r[f.field];
          const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/[$,%\s]/g, ""));
          if (raw === null || raw === undefined || raw === "" || isNaN(n)) return false;
          if (lo !== null && n < lo) return false;
          if (hi !== null && n > hi) return false;
          return true;
        });
        continue;
      }
      if (!f.values.length) continue;
      rows = rows.filter((r) => f.values.includes(String(r[f.field])));
    }
    return rows;
  }, [source, report.dateField, report.dateRange, report.filters]);

  const dimensionValues = useMemo(() => {
    if (!source) return [] as { field: string; values: string[] }[];
    return source.fields
      .filter((f) => f.type === "string")
      .map((f) => ({
        field: f.name,
        values: Array.from(new Set(source.rows.map((r) => String(r[f.name] ?? "")))).sort().slice(0, 200),
      }));
  }, [source]);

  /** Fields a filter can be built on: categorical text plus numeric measures. */
  const filterFields = useMemo(() => {
    if (!source) return [] as { name: string; kind: "text" | "number" }[];
    return source.fields
      .filter((f) => f.type === "string" || f.type === "number")
      .map((f) => ({ name: f.name, kind: f.type === "number" ? "number" as const : "text" as const }));
  }, [source]);

  const loadTemplate = (kind: "marketing" | "order") => {
    const src = kind === "order" ? orderTrackerSource() : sampleDataSource();
    const templateReport = kind === "order" ? orderReport(src) : emptyReport(src);
    dispatch({ type: "setSource", source: src, report: templateReport });
    dispatch({ type: "ui", patch: { showData: false } });
  };

  const addFieldToSelected = (name: string, kind: "dimension" | "metric") => {
    if (!selected) return;
    if (kind === "dimension") {
      dispatch({ type: "updateChart", id: selected.id, patch: { dimensions: [...selected.dimensions, name] } });
    } else {
      dispatch({ type: "updateChart", id: selected.id, patch: { metrics: [...selected.metrics, { field: name, agg: "sum" }] } });
    }
  };

  return (
    <div className={`app ${viewMode ? "view-mode" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <input
            className="report-title"
            value={report.title}
            disabled={viewMode}
            onChange={(e) => dispatch({ type: "setTitle", title: e.target.value })}
            aria-label="Report title"
          />
        </div>

        <nav className="pages">
          {report.pages.map((p) => (
            <button
              key={p.id}
              className={`page-tab ${p.id === page.id ? "active" : ""}`}
              onClick={() => dispatch({ type: "selectPage", id: p.id })}
            >
              {p.name}
              {!viewMode && report.pages.length > 1 && p.id === page.id && (
                <span
                  className="tab-x"
                  role="button"
                  aria-label="Delete page"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: "deletePage", id: p.id });
                  }}
                >
                  <X size={11} />
                </span>
              )}
            </button>
          ))}
          {!viewMode && (
            <button className="icon-btn" title="Add page" onClick={() => dispatch({ type: "addPage" })}>
              <Plus size={14} />
            </button>
          )}
        </nav>

        <div className="top-actions">
          {!viewMode && (
            <>
              <button
                className="btn ghost"
                onClick={() => {
                  downloadReport(report, source);
                  setSaved(true);
                  setTimeout(() => setSaved(false), 1800);
                }}
                title="Download this dashboard as a file you can reopen or send"
              >
                {saved ? <Check size={14} /> : <Download size={14} />} {saved ? "Saved" : "Save"}
              </button>
              <button className="btn ghost" onClick={() => dispatch({ type: "ui", patch: { showData: true } })}>
                <Layers size={14} /> Data
              </button>
            </>
          )}
          <button className="btn ghost" onClick={() => dispatch({ type: "ui", patch: { showShare: true } })}>
            <Share2 size={14} /> Share
          </button>
          <button className="btn primary" onClick={() => dispatch({ type: "toggleView" })}>
            <Eye size={14} /> {viewMode ? "Edit" : "View"}
          </button>
        </div>
      </header>

      <div className="body">
        {!viewMode && <LeftPanel source={source} dispatch={dispatch} onAddField={addFieldToSelected} hasSelection={!!selected} />}

        <main className="canvas-wrap">
          <div className="filterbar">
            <div className="filter-group">
              <Filter size={13} />
              <select
                className="select slim"
                value={report.dateRange}
                onChange={(e) => dispatch({ type: "setDateRange", range: e.target.value as Report["dateRange"] })}
                disabled={!report.dateField}
                title={report.dateField ? `Date field: ${report.dateField}` : "No date field detected"}
              >
                <option value="all">All time</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="365d">Last 365 days</option>
              </select>
            </div>

            {report.filters.map((f, i) => {
              const kind = filterFields.find((d) => d.name === f.field)?.kind ?? "text";
              const values = dimensionValues.find((d) => d.field === f.field)?.values ?? [];
              return (
                <div className="filter-group" key={i}>
                  <select
                    className="select slim"
                    value={f.field}
                    onChange={(e) => {
                      const next = [...report.filters];
                      next[i] = { field: e.target.value, values: [] };
                      dispatch({ type: "setReport", report: { ...report, filters: next } });
                    }}
                  >
                    {filterFields.map((d) => (
                      <option key={d.name} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  {kind === "number" ? (
                    <div className="filter-range">
                      <input
                        className="text-input slim num"
                        type="number"
                        inputMode="decimal"
                        placeholder="min"
                        value={f.min ?? ""}
                        onChange={(e) => {
                          const next = [...report.filters];
                          next[i] = { ...f, min: e.target.value };
                          dispatch({ type: "setReport", report: { ...report, filters: next } });
                        }}
                      />
                      <span className="range-dash">–</span>
                      <input
                        className="text-input slim num"
                        type="number"
                        inputMode="decimal"
                        placeholder="max"
                        value={f.max ?? ""}
                        onChange={(e) => {
                          const next = [...report.filters];
                          next[i] = { ...f, max: e.target.value };
                          dispatch({ type: "setReport", report: { ...report, filters: next } });
                        }}
                      />
                    </div>
                  ) : (
                    <select
                      className="select slim"
                      value={f.values[0] ?? ""}
                      onChange={(e) => {
                        const next = [...report.filters];
                        next[i] = { ...f, values: e.target.value ? [e.target.value] : [] };
                        dispatch({ type: "setReport", report: { ...report, filters: next } });
                      }}
                    >
                      <option value="">All</option>
                      {values.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    className="icon-btn"
                    onClick={() =>
                      dispatch({ type: "setReport", report: { ...report, filters: report.filters.filter((_, idx) => idx !== i) } })
                    }
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}

            {!viewMode && filterFields.length > 0 && (
              <button
                className="btn ghost slim"
                onClick={() =>
                  dispatch({
                    type: "setReport",
                    report: { ...report, filters: [...report.filters, { field: filterFields[0].name, values: [] }] },
                  })
                }
              >
                <Plus size={12} /> Filter
              </button>
            )}

            <div className="filter-spacer" />
            <span className="row-count">{filteredRows.length.toLocaleString()} rows in view</span>
          </div>

          {page.charts.length === 0 ? (
            <div className="empty-canvas">
              <div className="empty-mark">
                <GripVertical size={18} />
              </div>
              <h2>Build your first chart</h2>
              <p>Pick a visualization from the left panel, then drag fields onto the canvas.</p>
              {!viewMode && (
                <div className="empty-actions">
                  <button className="btn primary" onClick={() => dispatch({ type: "addChart", chartType: "scorecard" })}>
                    <Plus size={14} /> Scorecard
                  </button>
                  <button className="btn ghost" onClick={() => dispatch({ type: "addChart", chartType: "timeseries" })}>
                    Time series
                  </button>
                  <button className="btn ghost" onClick={() => loadTemplate("order")}>
                    <Sheet size={14} /> Order tracker
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid">
              {page.charts.map((c) => (
                <ChartCard
                  key={c.id}
                  chart={c}
                  rows={filteredRows}
                  selected={c.id === selectedChartId}
                  viewMode={viewMode}
                  onSelect={() => dispatch({ type: "selectChart", id: c.id })}
                  onDelete={() => dispatch({ type: "deleteChart", id: c.id })}
                  onDropField={(name) => {
                    dispatch({ type: "selectChart", id: c.id });
                    const field = source?.fields.find((f) => f.name === name);
                    if (!field) return;
                    if (field.type === "number") {
                      dispatch({
                        type: "updateChart",
                        id: c.id,
                        patch: { metrics: [...c.metrics, { field: name, agg: "sum" }] },
                      });
                    } else {
                      dispatch({ type: "updateChart", id: c.id, patch: { dimensions: [...c.dimensions, name] } });
                    }
                  }}
                />
              ))}
            </div>
          )}
        </main>

        {!viewMode && selected && <RightPanel chart={selected} source={source} dispatch={dispatch} />}
      </div>

      {state.showData && !viewMode && (
        <DataModal
          onClose={() => dispatch({ type: "ui", patch: { showData: false } })}
          onTemplate={(kind) => loadTemplate(kind)}
          onConnect={(src, template) => {
            const mapped = template === "none" ? null : adaptToOrderSchema(src);
            if (mapped?.usable) {
              const built = orderReport(mapped.source);
              dispatch({ type: "setSource", source: mapped.source, report: { ...built, title: src.name } });
              return null;
            }
            if (template === "order") {
              return "This file needs at least a quantity column and an amount column (Amt / Total / Amount) to build the Order tracker. Add them, or pick “Blank canvas”.";
            }
            const hasCharts = report.pages.some((p) => p.charts.length > 0);
            if (hasCharts) {
              dispatch({ type: "setSource", source: src, report: { ...report, sourceId: src.id, dateField: src.fields.find((f) => f.type === "date")?.name ?? null, filters: [] } });
            } else {
              const fresh = emptyReport(src);
              dispatch({ type: "setSource", source: src, report: { ...fresh, title: report.title } });
            }
            return null;
          }}
        />
      )}
      {state.showShare && (
        <ShareModal
          report={report}
          source={source}
          readOnly={viewMode}
          onClose={() => dispatch({ type: "ui", patch: { showShare: false } })}
          onImport={(data) => {
            dispatch({ type: "setSource", source: data.source, report: data.report });
            dispatch({ type: "ui", patch: { showShare: false, showData: false } });
          }}
        />
      )}
      {state.showAddMenu && !viewMode && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && dispatch({ type: "ui", patch: { showAddMenu: false } })}>
          <div className="modal small">
            <div className="modal-head">
              <h2>Add a visualization</h2>
              <button className="icon-btn" onClick={() => dispatch({ type: "ui", patch: { showAddMenu: false } })}>
                <X size={16} />
              </button>
            </div>
            <div className="type-grid wide">
              {(["scorecard", "timeseries", "area", "bar", "hbar", "stacked", "pie", "donut", "scatter", "table"] as const).map((t) => (
                <button key={t} className="type-btn" onClick={() => dispatch({ type: "addChart", chartType: t })}>
                  <span className={`type-icon t-${t}`} aria-hidden />
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface CardProps {
  chart: Chart;
  rows: import("./types").Row[];
  selected: boolean;
  viewMode: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDropField: (name: string) => void;
}

function ChartCard({ chart, rows, selected, viewMode, onSelect, onDelete, onDropField }: CardProps) {
  const [over, setOver] = useState(false);
  return (
    <section
      className={`card ${selected ? "selected" : ""} ${over ? "drop" : ""}`}
      style={{ gridColumn: `span ${chart.width}`, height: chart.height }}
      onClick={onSelect}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const name = e.dataTransfer.getData("text/plain");
        if (name) onDropField(name);
      }}
    >
      <header className="card-head">
        <div className="card-title">
          <Pencil size={12} className="card-edit-icon" />
          <h3>{chart.title}</h3>
        </div>
        {!viewMode && selected && (
          <button
            className="icon-btn danger"
            title="Delete chart"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 size={13} />
          </button>
        )}
        {viewMode && <ChevronDown size={14} className="muted" />}
      </header>
      <div className="card-body" style={{ height: chart.type === "scorecard" ? "auto" : "calc(100% - 38px)" }}>
        <ChartRenderer chart={chart} rows={rows} />
      </div>
    </section>
  );
}
