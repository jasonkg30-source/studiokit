import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { decompressFromEncodedURIComponent } from "lz-string";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Check,
  Bookmark,
  Eye,
  Layers,
  Plus,
  Share2,
  Trash2,
  X,
  Pencil,
  GripVertical,
  Sheet,
  LayoutTemplate,
} from "lucide-react";
import ChartRenderer from "./components/ChartRenderer";
import DataModal from "./components/DataModal";
import LeftPanel from "./components/LeftPanel";
import MultiSelect from "./components/MultiSelect";
import TemplateModal from "./components/TemplateModal";
import { saveTemplate, type SavedTemplate } from "./templates";
import { QuotaError, readJSON, writeJSON } from "./storage";
import RightPanel from "./components/RightPanel";
import ShareModal from "./components/ShareModal";
import { adaptToOrderSchema, dateWindow, orderTrackerSource, sampleDataSource } from "./data";
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
    const parsed = readJSON<Persisted>(STORAGE_KEY);
    if (parsed) {
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
  const [showTemplates, setShowTemplates] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Slice click on a pie/donut narrows every other chart without changing the pie itself.
  const [focus, setFocus] = useState<{ field: string; value: string } | null>(null);
  const quotaWarned = useRef(false);
  const page = currentPage(report);
  const selected = page.charts.find((c) => c.id === selectedChartId) ?? null;

  useEffect(() => {
    if (viewMode) return;
    // Debounced: big imports would otherwise re-serialise on every keystroke.
    const id = window.setTimeout(() => {
      try {
        writeJSON(STORAGE_KEY, { report, source } satisfies Persisted);
      } catch (e) {
        // Keep the layout even when the rows no longer fit the browser quota.
        try {
          writeJSON(STORAGE_KEY, { report, source: null } satisfies Persisted);
          if (e instanceof QuotaError && !quotaWarned.current) {
            quotaWarned.current = true;
            setToast("Data too large to autosave — layout saved");
          }
        } catch {
          setToast("Autosave failed — browser storage is full");
        }
      }
    }, 600);
    return () => window.clearTimeout(id);
  }, [report, source, viewMode]);

  useEffect(() => {
    document.title = `${report.title} · StudioKit`;
  }, [report.title]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(id);
  }, [toast]);

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

  const focusRows = useMemo(() => {
    if (!focus) return filteredRows;
    return filteredRows.filter((r) => String(r[focus.field] ?? "") === focus.value);
  }, [filteredRows, focus]);

  const dimensionValues = useMemo(() => {
    if (!source) return [] as { field: string; values: string[] }[];
    return source.fields
      .filter((f) => f.type === "string" || f.type === "date")
      .map((f) => ({
        field: f.name,
        values: Array.from(new Set(source.rows.map((r) => String(r[f.name] ?? "")))).sort().slice(0, 200),
      }));
  }, [source]);

  /** Fields a filter can be built on: categorical text plus numeric measures. */
  const filterFields = useMemo(() => {
    if (!source) return [] as { name: string; kind: "text" | "number" }[];
    return source.fields.map((f) => ({
      name: f.name,
      kind: f.type === "number" ? ("number" as const) : ("text" as const),
    }));
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
                  try {
                    const entry = saveTemplate(report.title, report, source);
                    setToast(
                      entry.dataOmitted
                        ? "Saved layout only — this data is too large for browser storage"
                        : `Saved “${entry.name}” to Templates`,
                    );
                    setSaved(true);
                    setTimeout(() => setSaved(false), 1800);
                  } catch (e) {
                    setToast(
                      e instanceof QuotaError
                        ? "Save failed — browser storage is full. Delete an old template first."
                        : `Save failed — ${e instanceof Error ? e.message : "unknown error"}`,
                    );
                  }
                }}
                title="Save this dashboard in your templates"
              >
                {saved ? <Check size={14} /> : <Bookmark size={14} />} {saved ? "Saved" : "Save"}
              </button>
              <button className="btn ghost" onClick={() => setShowTemplates(true)} title="Open saved templates">
                <LayoutTemplate size={14} /> Templates
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
                    <MultiSelect
                      options={values}
                      selected={f.values}
                      placeholder="All"
                      onChange={(nextValues) => {
                        const next = [...report.filters];
                        next[i] = { ...f, values: nextValues };
                        dispatch({ type: "setReport", report: { ...report, filters: next } });
                      }}
                    />
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
            {focus && (
              <button
                type="button"
                className="focus-chip"
                onClick={() => setFocus(null)}
                title="Clear the slice selection"
              >
                {focus.field}: <strong>{focus.value || "(blank)"}</strong>
                <X size={12} />
              </button>
            )}
            <span className="row-count">{(focus ? focusRows : filteredRows).length.toLocaleString()} rows in view</span>
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
              {page.charts.map((c, ci) => (
                <ChartCard
                  key={c.id}
                  chart={c}
                  rows={c.type === "pie" || c.type === "donut" ? filteredRows : focusRows}
                  focus={c.type === "pie" || c.type === "donut" ? focus : null}
                  onSliceClick={(value) => {
                    const field = c.dimensions[0];
                    if (!field) return;
                    setFocus((cur) => (cur && cur.field === field && cur.value === value ? null : { field, value }));
                  }}
                  onPatch={(patch) => dispatch({ type: "updateChart", id: c.id, patch })}
                  selected={c.id === selectedChartId}
                  viewMode={viewMode}
                  onSelect={() => dispatch({ type: "selectChart", id: c.id })}
                  onDelete={() => dispatch({ type: "deleteChart", id: c.id })}
                  onResize={(w, h) => dispatch({ type: "updateChart", id: c.id, patch: { width: w, height: h } })}
                  onMoveChart={(draggedId, beforeId) => dispatch({ type: "moveChart", id: draggedId, beforeId })}
                  onMove={(dir) => {
                    const charts = page.charts;
                    const from = charts.findIndex((x) => x.id === c.id);
                    const targetIndex = from + dir;
                    if (targetIndex < 0 || targetIndex >= charts.length) return;
                    const beforeId = dir === -1 ? charts[from - 1]?.id ?? null : charts[from + 2]?.id ?? null;
                    dispatch({ type: "moveChart", id: c.id, beforeId });
                  }}
                  canMoveLeft={ci > 0}
                  canMoveRight={ci < page.charts.length - 1}
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

      {showTemplates && (
        <TemplateModal
          report={report}
          source={source}
          onClose={() => setShowTemplates(false)}
          onApply={(tpl: SavedTemplate) => {
            dispatch({ type: "setSource", source: tpl.source, report: tpl.report });
            setShowTemplates(false);
          }}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

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
  onResize: (width: number, height: number) => void;
  onMoveChart: (draggedId: string, beforeId: string | null) => void;
  onDropField: (name: string) => void;
  focus?: { field: string; value: string } | null;
  onSliceClick: (value: string) => void;
  onPatch: (patch: Partial<Chart>) => void;
  onMove: (dir: -1 | 1) => void;
  canMoveLeft: boolean;
  canMoveRight: boolean;
}

function ChartCard({
  chart,
  rows,
  selected,
  viewMode,
  onSelect,
  onDelete,
  onResize,
  onMoveChart,
  onDropField,
  focus,
  onSliceClick,
  onPatch,
  onMove,
  canMoveLeft,
  canMoveRight,
}: CardProps) {
  const [over, setOver] = useState(false);
  const [draft, setDraft] = useState<{ w: number; h: number } | null>(null);
  const card = useRef<HTMLElement>(null);

  /** Drag the header: drop on another card to take its place, on empty space to go last. */
  const startMove = (e: React.PointerEvent) => {
    if (viewMode) return;
    if ((e.target as HTMLElement).closest("button")) return;
    const cardEl = card.current;
    if (!cardEl) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let hovered: HTMLElement | null = null;

    const clearHint = () => {
      if (hovered) hovered.classList.remove("move-target");
      hovered = null;
    };

    const move = (ev: PointerEvent) => {
      if (!dragging) {
        if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 6) return;
        dragging = true;
        cardEl.classList.add("moving");
        document.body.classList.add("chart-drag");
      }
      const under = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const target = under?.closest(".card") as HTMLElement | null;
      if (target !== hovered) {
        clearHint();
        if (target && target !== cardEl) {
          hovered = target;
          target.classList.add("move-target");
        }
      }
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      cardEl.classList.remove("moving");
      document.body.classList.remove("chart-drag");
      if (!dragging) return;
      const targetId = hovered?.dataset.chartId ?? null;
      clearHint();
      if (targetId !== chart.id) onMoveChart(chart.id, targetId);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /** Drag the bottom-right grip: width snaps to grid columns, height to 10px. */
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const grid = card.current?.parentElement;
    if (!grid) return;
    const cs = getComputedStyle(grid);
    const gap = parseFloat(cs.columnGap || "14") || 14;
    const padL = parseFloat(cs.paddingLeft || "0") || 0;
    const padR = parseFloat(cs.paddingRight || "0") || 0;
    const inner = grid.clientWidth - padL - padR;
    const colW = (inner - gap * 11) / 12;
    const startX = e.clientX;
    const startY = e.clientY;
    const w0 = chart.width;
    const h0 = chart.height;
    let latest = { w: w0, h: h0 };

    const move = (ev: PointerEvent) => {
      const dCols = Math.round((ev.clientX - startX) / (colW + gap));
      const w = Math.min(12, Math.max(1, w0 + dCols));
      const h = Math.min(1600, Math.max(120, Math.round((h0 + ev.clientY - startY) / 10) * 10));
      latest = { w, h };
      setDraft(latest);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDraft(null);
      if (latest.w !== w0 || latest.h !== h0) onResize(latest.w, latest.h);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <section
      ref={card}
      data-chart-id={chart.id}
      className={`card ${selected ? "selected" : ""} ${over ? "drop" : ""} ${draft ? "resizing" : ""}`}
      style={{ gridColumn: `span ${draft?.w ?? chart.width}`, height: draft?.h ?? chart.height }}
      onClick={onSelect}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-chart-id")) {
          e.preventDefault();
          setOver(true);
          return;
        }
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
      <header
        className="card-head"
        onPointerDown={startMove}
        title={viewMode ? undefined : "Drag to move this chart"}
      >
        <div className="card-title">
          <Pencil size={12} className="card-edit-icon" />
          <h3>{chart.title}</h3>
        </div>
        {!viewMode && (
          <div className="card-move">
            <button
              className="icon-btn"
              title="Move chart left"
              aria-label="Move chart left"
              disabled={!canMoveLeft}
              onClick={(e) => {
                e.stopPropagation();
                onMove(-1);
              }}
            >
              <ArrowLeft size={13} />
            </button>
            <button
              className="icon-btn"
              title="Move chart right"
              aria-label="Move chart right"
              disabled={!canMoveRight}
              onClick={(e) => {
                e.stopPropagation();
                onMove(1);
              }}
            >
              <ArrowRight size={13} />
            </button>
          </div>
        )}
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
        <ChartRenderer chart={chart} rows={rows} focus={focus} onSliceClick={onSliceClick} onPatch={onPatch} />
      </div>
      {!viewMode && (
        <span
          className="chart-resize"
          onPointerDown={startResize}
          onClick={(e) => e.stopPropagation()}
          title="Drag to resize"
          role="separator"
          aria-label="Resize chart"
        />
      )}
      {draft && (
        <span className="chart-resize-badge">
          {draft.w}/12 · {draft.h}px
        </span>
      )}
    </section>
  );
}
