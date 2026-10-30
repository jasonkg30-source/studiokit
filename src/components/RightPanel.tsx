import { Copy, Maximize2, Palette, Plus, Trash2, X } from "lucide-react";
import type { Action } from "../store";
import { PALETTE } from "../store";
import type { Aggregation, Chart, ChartType, DataSource } from "../types";

const TYPES: { type: ChartType; label: string }[] = [
  { type: "scorecard", label: "Scorecard" },
  { type: "timeseries", label: "Time series" },
  { type: "area", label: "Area" },
  { type: "bar", label: "Bar" },
  { type: "hbar", label: "H-bars" },
  { type: "stacked", label: "Stacked" },
  { type: "pie", label: "Pie" },
  { type: "donut", label: "Donut" },
  { type: "scatter", label: "Scatter" },
  { type: "table", label: "Table" },
];

const AGGS: Aggregation[] = ["sum", "avg", "count", "min", "max", "count_distinct"];

interface Props {
  chart: Chart;
  source: DataSource | null;
  dispatch: (a: Action) => void;
}

export default function RightPanel({ chart, source, dispatch }: Props) {
  const update = (patch: Partial<Chart>) => dispatch({ type: "updateChart", id: chart.id, patch });
  const fields = source?.fields ?? [];
  // Every column can be a dimension; numeric ones just sort first among metrics.
  const dimensions = fields;
  const numerics = [...fields].sort((a, b) => Number(b.type === "number") - Number(a.type === "number"));

  const addDimension = (name: string) => {
    if (name && !chart.dimensions.includes(name)) update({ dimensions: [...chart.dimensions, name] });
  };
  const addMetric = (name: string) => {
    if (name && !chart.metrics.some((m) => m.field === name)) {
      const numeric = fields.find((f) => f.name === name)?.type === "number";
      update({ metrics: [...chart.metrics, { field: name, agg: numeric ? "sum" : "count" }] });
    }
  };
  const canMultiDim = ["table", "hbar", "stacked", "bar"].includes(chart.type);

  return (
    <aside className="right-panel">
      <div className="panel-head">
        <span>Chart settings</span>
        <div className="panel-head-actions">
          <button className="icon-btn" title="Duplicate" onClick={() => dispatch({ type: "duplicateChart", id: chart.id })}>
            <Copy size={14} />
          </button>
          <button className="icon-btn danger" title="Delete" onClick={() => dispatch({ type: "deleteChart", id: chart.id })}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="panel-body">
        <label className="field-label">Title</label>
        <input className="text-input" value={chart.title} onChange={(e) => update({ title: e.target.value })} />

        <label className="field-label">Visualization</label>
        <div className="type-grid">
          {TYPES.map((t) => (
            <button
              key={t.type}
              className={`type-btn ${chart.type === t.type ? "active" : ""}`}
              onClick={() => update({ type: t.type, title: chart.title })}
            >
              <span className={`type-icon t-${t.type}`} aria-hidden />
              {t.label}
            </button>
          ))}
        </div>

        <div className="section-head">
          Dimensions
          <button
            className="link-btn"
            onClick={() => {
              const next = dimensions.find((f) => !chart.dimensions.includes(f.name));
              if (next) addDimension(next.name);
            }}
            disabled={!chart.dimensions.length && !dimensions.length}
          >
            <Plus size={12} /> Add
          </button>
        </div>
        {chart.dimensions.map((d, i) => (
          <div className="token-row" key={`${d}-${i}`}>
            <select
              className="select"
              value={d}
              onChange={(e) => {
                const next = [...chart.dimensions];
                next[i] = e.target.value;
                update({ dimensions: next });
              }}
            >
              {fields.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
            <button className="icon-btn" onClick={() => update({ dimensions: chart.dimensions.filter((_, idx) => idx !== i) })}>
              <X size={13} />
            </button>
          </div>
        ))}
        {!chart.dimensions.length && <p className="hint">Drag a category field here, or pick one below.</p>}
        {dimensions.length > 0 && (
          <div className="chip-row">
            {dimensions
              .filter((f) => !chart.dimensions.includes(f.name))
              .map((f) => (
                <button key={f.name} className="chip" onClick={() => addDimension(f.name)} disabled={!canMultiDim && chart.dimensions.length >= 1}>
                  {f.name}
                </button>
              ))}
          </div>
        )}

        <div className="section-head">
          Metrics
          <button
            className="link-btn"
            onClick={() => {
              const next = numerics.find((f) => !chart.metrics.some((m) => m.field === f.name));
              if (next) addMetric(next.name);
            }}
            disabled={!fields.length}
          >
            <Plus size={12} /> Add
          </button>
        </div>
        {chart.metrics.map((m, i) => (
          <div className="metric-row" key={`${m.field}-${i}`}>
            <select
              className="select"
              value={m.field}
              onChange={(e) => {
                const next = [...chart.metrics];
                next[i] = { ...m, field: e.target.value };
                update({ metrics: next });
              }}
            >
              {numerics.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                  {f.type === "number" ? "" : " (text)"}
                </option>
              ))}
            </select>
            <select
              className="select agg"
              value={m.agg}
              onChange={(e) => {
                const next = [...chart.metrics];
                next[i] = { ...m, agg: e.target.value as Aggregation };
                update({ metrics: next });
              }}
            >
              {AGGS.map((a) => (
                <option key={a} value={a}>
                  {a === "count_distinct" ? "unique" : a}
                </option>
              ))}
            </select>
            <button className="icon-btn" onClick={() => update({ metrics: chart.metrics.filter((_, idx) => idx !== i) })}>
              <X size={13} />
            </button>
          </div>
        ))}
        {numerics.length > 0 && (
          <div className="chip-row">
            {numerics
              .filter((f) => !chart.metrics.some((m) => m.field === f.name))
              .map((f) => (
                <button key={f.name} className="chip" onClick={() => addMetric(f.name)}>
                  {f.name}
                </button>
              ))}
          </div>
        )}

        <div className="section-head">Style</div>
        <div className="two-col">
          <div>
            <label className="field-label">Sort</label>
            <select className="select" value={chart.sort} onChange={(e) => update({ sort: e.target.value as Chart["sort"] })}>
              <option value="none">Default</option>
              <option value="dim_asc">Dimension A→Z</option>
              <option value="dim_desc">Dimension Z→A</option>
              <option value="metric_desc">Metric high→low</option>
              <option value="metric_asc">Metric low→high</option>
            </select>
          </div>
          <div>
            <label className="field-label">Rows</label>
            <input
              className="text-input"
              type="number"
              min={0}
              max={500}
              value={chart.limit}
              onChange={(e) => update({ limit: Number(e.target.value) })}
            />
          </div>
        </div>

        <label className="field-label">
          <Palette size={12} /> Palette
        </label>
        <div className="swatches">
          {PALETTE.map((c, i) => (
            <button
              key={c}
              className="swatch"
              style={{ background: c }}
              title={`Palette ${i + 1}`}
              onClick={() => update({ palette: i === 0 ? PALETTE : PALETTE.slice(i).concat(PALETTE.slice(0, i)) })}
            />
          ))}
        </div>

        <div className="toggle-row">
          <label>
            <input type="checkbox" checked={chart.showLegend} onChange={(e) => update({ showLegend: e.target.checked })} /> Legend
          </label>
          <label>
            <input type="checkbox" checked={chart.showGrid} onChange={(e) => update({ showGrid: e.target.checked })} /> Gridlines
          </label>
        </div>

        <div className="section-head">Size</div>
        <div className="two-col">
          <div>
            <label className="field-label">
              <Maximize2 size={12} /> Width (of 12)
            </label>
            <input
              className="text-input"
              type="number"
              min={2}
              max={12}
              value={chart.width}
              onChange={(e) => update({ width: Math.max(2, Math.min(12, Number(e.target.value))) })}
            />
          </div>
          <div>
            <label className="field-label">Height (px)</label>
            <input
              className="text-input"
              type="number"
              min={120}
              max={800}
              step={10}
              value={chart.height}
              onChange={(e) => update({ height: Math.max(120, Number(e.target.value)) })}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
