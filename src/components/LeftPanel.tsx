import { BarChart3, Database, Hash, Type as TypeIcon, Calendar, Plus } from "lucide-react";
import type { Action } from "../store";
import type { ChartType, DataSource } from "../types";

const QUICK: { type: ChartType; label: string }[] = [
  { type: "scorecard", label: "Scorecard" },
  { type: "timeseries", label: "Time series" },
  { type: "bar", label: "Bar" },
  { type: "donut", label: "Donut" },
  { type: "table", label: "Table" },
];

interface Props {
  source: DataSource | null;
  dispatch: (a: Action) => void;
  onAddField: (name: string, kind: "dimension" | "metric") => void;
  hasSelection: boolean;
}

export default function LeftPanel({ source, dispatch, onAddField, hasSelection }: Props) {
  return (
    <aside className="left-panel">
      <button className="btn primary wide" onClick={() => dispatch({ type: "ui", patch: { showData: true } })}>
        <Database size={14} /> Add data
      </button>

      {source ? (
        <>
          <div className="source-card">
            <div className="source-icon">
              <Database size={14} />
            </div>
            <div className="source-meta">
              <span className="source-name" title={source.name}>
                {source.name}
              </span>
              <span className="source-sub">
                {source.rows.length.toLocaleString()} rows · {source.fields.length} fields
              </span>
            </div>
          </div>

          <div className="panel-section-title">Fields</div>
          <div className="field-list">
            {source.fields.map((f) => {
              const Icon = f.type === "number" ? Hash : f.type === "date" ? Calendar : TypeIcon;
              return (
                <div
                  key={f.name}
                  className={`field-item t-${f.type}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", f.name);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => onAddField(f.name, f.type === "number" ? "metric" : "dimension")}
                  title={hasSelection ? "Click to add to selected chart" : "Select a chart first"}
                >
                  <Icon size={13} />
                  <span className="field-name">{f.name}</span>
                  <span className="field-type">{f.type}</span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="hint pad">Connect a data source to unlock the field list.</p>
      )}

      <div className="panel-section-title">
        <BarChart3 size={12} /> Quick charts
      </div>
      <div className="quick-grid">
        {QUICK.map((q) => (
          <button key={q.type} className="quick-btn" onClick={() => dispatch({ type: "addChart", chartType: q.type })}>
            <span className={`type-icon t-${q.type}`} aria-hidden />
            {q.label}
          </button>
        ))}
      </div>
      <button className="btn ghost wide" onClick={() => dispatch({ type: "ui", patch: { showAddMenu: true } })}>
        <Plus size={14} /> More visualizations
      </button>

      <div className="left-footer">
        <span>StudioKit · v1</span>
      </div>
    </aside>
  );
}
