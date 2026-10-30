import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Filter } from "lucide-react";
import type { Chart, Row } from "../types";
import { buildSeries, formatNumber, metricLabel } from "../data";

interface Props {
  chart: Chart;
  rows: Row[];
  /** Active cross-filter coming from a pie/donut slice. */
  focus?: { field: string; value: string } | null;
  onSliceClick?: (value: string) => void;
  onPatch?: (patch: Partial<Chart>) => void;
}

type SortState = { col: string; dir: "asc" | "desc" } | null;

interface ColFilter {
  values?: string[];
  min?: string;
  max?: string;
}

/** Table where every column can be sorted and filtered from its header. */
function SortableTable({
  chart,
  data,
  metrics,
  onPatch,
}: {
  chart: Chart;
  data: Row[];
  metrics: Chart["metrics"];
  onPatch?: (patch: Partial<Chart>) => void;
}) {
  const [sort, setSort] = useState<SortState>(null);
  const [filters, setFilters] = useState<Record<string, ColFilter>>({});
  const [openCol, setOpenCol] = useState<string | null>(null);
  const [popAt, setPopAt] = useState<{ left: number; top: number } | null>(null);
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const dims = chart.dimensions;

  const valueOf = (row: Row, col: string): string | number => {
    if (col.startsWith("d:")) return String(row.key).split(" / ")[Number(col.slice(2))] ?? "";
    return Number(row[col.slice(2)] ?? 0);
  };

  const columns = useMemo(() => {
    const base = [
      ...dims.map((d, i) => ({ col: `d:${i}`, label: d, numeric: false })),
      ...metrics.map((m) => ({ col: `m:${m.field}`, label: metricLabel(m), numeric: true })),
    ];
    const order = chart.columnOrder ?? [];
    if (!order.length) return base;
    const rank = (col: string) => {
      const i = order.indexOf(col);
      return i < 0 ? order.length + base.findIndex((c) => c.col === col) : i;
    };
    return [...base].sort((a, b) => rank(a.col) - rank(b.col));
  }, [dims, metrics, chart.columnOrder]);

  const moveColumn = (from: string, to: string) => {
    if (!onPatch || from === to) return;
    const order = columns.map((c) => c.col).filter((c) => c !== from);
    const at = order.indexOf(to);
    order.splice(at < 0 ? order.length : at, 0, from);
    onPatch({ columnOrder: order });
  };

  const cell = (row: Row, col: string) =>
    col.startsWith("d:") ? (
      <>{String(row.key).split(" / ")[Number(col.slice(2))]}</>
    ) : (
      <>{formatNumber(Number(row[col.slice(2)] ?? 0))}</>
    );

  /** Distinct values per text column, for the header filter list. */
  const distinct = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const c of columns) {
      if (c.numeric) continue;
      map[c.col] = Array.from(new Set(data.map((row) => String(valueOf(row, c.col))))).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
      );
    }
    return map;
  }, [columns, data]);

  const rows = useMemo(() => {
    const active = Object.entries(filters).filter(([, f]) => f && ((f.values?.length ?? 0) > 0 || f.min || f.max));
    let out = active.length
      ? data.filter((row) =>
          active.every(([col, f]) => {
            if (f.values?.length) return f.values.includes(String(valueOf(row, col)));
            const v = Number(valueOf(row, col));
            if (!Number.isFinite(v)) return false;
            if (f.min && v < Number(f.min)) return false;
            if (f.max && v > Number(f.max)) return false;
            return true;
          }),
        )
      : data;
    if (sort) {
      const sign = sort.dir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) => {
        const av = valueOf(a, sort.col);
        const bv = valueOf(b, sort.col);
        const an = Number(av);
        const bn = Number(bv);
        if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * sign;
        return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * sign;
      });
    }
    return out;
  }, [data, filters, sort]);

  const toggleSort = (col: string) =>
    setSort((cur) => {
      if (!cur || cur.col !== col) return { col, dir: "asc" };
      if (cur.dir === "asc") return { col, dir: "desc" };
      return null;
    });

  const setFilter = (col: string, next: ColFilter) => {
    setFilters((cur) => {
      const copy = { ...cur };
      const empty = !(next.values?.length) && !next.min && !next.max;
      if (empty) delete copy[col];
      else copy[col] = next;
      return copy;
    });
  };

  const activeCount = Object.keys(filters).length;

  const icon = (col: string) => {
    if (sort?.col !== col) return <ChevronsUpDown size={11} className="sort-idle" />;
    return sort.dir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />;
  };

  return (
    <div className="table-wrap" onScroll={() => openCol && setOpenCol(null)}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => {
              const f = filters[c.col];
              const has = !!f;
              return (
                <th
                  key={c.col}
                  draggable={!!onPatch}
                  onDragStart={(e) => {
                    setDragCol(c.col);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", c.col);
                  }}
                  onDragOver={(e) => {
                    if (!dragCol || dragCol === c.col) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setOverCol(c.col);
                  }}
                  onDragLeave={() => setOverCol((cur) => (cur === c.col ? null : cur))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = dragCol ?? e.dataTransfer.getData("text/plain");
                    setOverCol(null);
                    setDragCol(null);
                    if (from) moveColumn(from, c.col);
                  }}
                  onDragEnd={() => {
                    setDragCol(null);
                    setOverCol(null);
                  }}
                  className={`${c.numeric ? "num" : ""} ${sort?.col === c.col ? "sorted" : ""} ${openCol === c.col ? "menu-open" : ""} ${
                    dragCol === c.col ? "dragging" : ""
                  } ${overCol === c.col ? "drop-target" : ""}`}
                  title={onPatch ? "Drag to reorder this column" : undefined}
                >
                  <div className="th-row">
                    <button type="button" className="th-sort" onClick={() => toggleSort(c.col)} title={`Sort by ${c.label}`}>
                      <span>{c.label}</span>
                      {icon(c.col)}
                    </button>
                    <button
                      type="button"
                      className={`th-filter ${has ? "on" : ""}`}
                      onClick={(e) => {
                        if (openCol === c.col) {
                          setOpenCol(null);
                          return;
                        }
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const panelH = 300;
                        const top = Math.max(8, Math.min(r.bottom + 4, window.innerHeight - panelH - 8));
                        setPopAt({ left: Math.min(Math.max(8, r.left), window.innerWidth - 232), top });
                        setOpenCol(c.col);
                      }}
                      title={`Filter ${c.label}`}
                      aria-label={`Filter ${c.label}`}
                    >
                      <Filter size={11} />
                    </button>
                  </div>

                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="table-empty">
                No rows match these column filters
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={String(row.key)}>
              {columns.map((c) => (
                <td key={c.col} className={c.numeric ? "num" : undefined}>
                  {cell(row, c.col)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {openCol && popAt && (() => {
        const c = columns.find((x) => x.col === openCol);
        if (!c) return null;
        const f = filters[c.col];
        return (
          <div className="th-pop th-pop-fixed" style={{ left: popAt.left, top: popAt.top }} onClick={(e) => e.stopPropagation()}>
            {c.numeric ? (
              <div className="th-pop-body">
                <div className="th-pop-row">
                  <input
                    className="text-input slim num"
                    type="number"
                    placeholder="min"
                    value={f?.min ?? ""}
                    onChange={(e) => setFilter(c.col, { ...f, min: e.target.value })}
                  />
                  <span className="range-dash">–</span>
                  <input
                    className="text-input slim num"
                    type="number"
                    placeholder="max"
                    value={f?.max ?? ""}
                    onChange={(e) => setFilter(c.col, { ...f, max: e.target.value })}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="th-pop-head">{(distinct[c.col] ?? []).length} values</div>
                <div className="th-pop-list">
                  {(distinct[c.col] ?? []).map((v) => {
                    const on = f?.values?.includes(v) ?? false;
                    return (
                      <label key={v} className={`th-pop-item ${on ? "on" : ""}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setFilter(c.col, {
                              values: on ? (f?.values ?? []).filter((x) => x !== v) : [...(f?.values ?? []), v],
                            })
                          }
                        />
                        <span>{v || "(blank)"}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
            <div className="th-pop-foot">
              <button type="button" className="link-btn" onClick={() => setFilter(c.col, {})}>
                Clear
              </button>
              <button type="button" className="link-btn" onClick={() => setOpenCol(null)}>
                Done
              </button>
            </div>
          </div>
        );
      })()}

      {activeCount > 0 && (
        <button type="button" className="table-filter-reset" onClick={() => setFilters({})}>
          Clear {activeCount} column filter{activeCount > 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}

function tooltipStyle() {
  return {
    contentStyle: {
      border: "1px solid #e2e8f0",
      borderRadius: 10,
      boxShadow: "0 8px 24px rgba(15,23,42,.10)",
      fontSize: 12,
      padding: "8px 10px",
    },
    labelStyle: { color: "#0f172a", fontWeight: 600, marginBottom: 4 },
  } as const;
}

export default function ChartRenderer({ chart, rows, focus, onSliceClick, onPatch }: Props) {
  const data = buildSeries(rows, chart);
  const metrics = chart.metrics.filter((m) => m.field);
  const colors = chart.palette?.length ? chart.palette : ["#2563eb"];

  if (!metrics.length) {
    return <Empty hint="Add a metric to render this chart" />;
  }
  if (!data.length) {
    return <Empty hint="No rows match the current filters" />;
  }

  const axis = {
    stroke: "#94a3b8",
    fontSize: 11,
    tickLine: false,
    axisLine: false,
  } as const;

  switch (chart.type) {
    case "scorecard": {
      const m = metrics[0];
      const value = Number(data[0][m.field] ?? 0);
      return (
        <div className="scorecard">
          <div className="scorecard-value" style={{ color: colors[0] }}>
            {formatNumber(value)}
          </div>
          <div className="scorecard-label">{m.agg === "count" ? "Count" : `${m.agg.toUpperCase()} · ${m.field}`}</div>
        </div>
      );
    }
    case "table":
      return <SortableTable chart={chart} data={data} metrics={metrics} onPatch={onPatch} />;
    case "timeseries":
    case "area":
      return (
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === "area" ? (
            <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              {chart.showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />}
              <XAxis dataKey="key" {...axis} minTickGap={24} />
              <YAxis {...axis} tickFormatter={(v) => formatNumber(Number(v))} width={52} />
              <Tooltip {...tooltipStyle()} formatter={(v) => formatNumber(Number(v))} />
              {chart.showLegend && <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />}
              {metrics.map((m, i) => (
                <Area
                  key={m.field}
                  type="monotone"
                  dataKey={m.field}
                  name={metricLabel(m)}
                  stroke={colors[i % colors.length]}
                  fill={colors[i % colors.length]}
                  isAnimationActive={false}
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          ) : (
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              {chart.showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />}
              <XAxis dataKey="key" {...axis} minTickGap={24} />
              <YAxis {...axis} tickFormatter={(v) => formatNumber(Number(v))} width={52} />
              <Tooltip {...tooltipStyle()} formatter={(v) => formatNumber(Number(v))} />
              {chart.showLegend && <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />}
              {metrics.map((m, i) => (
                <Line
                  key={m.field}
                  type="monotone"
                  dataKey={m.field}
                  name={metricLabel(m)}
                  stroke={colors[i % colors.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      );
    case "bar":
    case "stacked":
    case "hbar":
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout={chart.type === "hbar" ? "vertical" : "horizontal"}
            margin={{ top: 8, right: 12, bottom: 0, left: chart.type === "hbar" ? 8 : -8 }}
          >
            {chart.showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={chart.type === "hbar"} horizontal={chart.type !== "hbar"} />}
            {chart.type === "hbar" ? (
              <>
                <XAxis type="number" {...axis} tickFormatter={(v) => formatNumber(Number(v))} />
                <YAxis type="category" dataKey="key" {...axis} width={90} />
              </>
            ) : (
              <>
                <XAxis dataKey="key" {...axis} interval={0} angle={data.length > 6 ? -20 : 0} textAnchor={data.length > 6 ? "end" : "middle"} height={data.length > 6 ? 52 : 30} />
                <YAxis {...axis} tickFormatter={(v) => formatNumber(Number(v))} width={52} />
              </>
            )}
            <Tooltip {...tooltipStyle()} formatter={(v) => formatNumber(Number(v))} />
            {chart.showLegend && <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />}
            {metrics.map((m, i) => (
              <Bar
                key={m.field}
                dataKey={m.field}
                name={metricLabel(m)}
                fill={colors[i % colors.length]}
                radius={chart.type === "hbar" ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                stackId={chart.type === "stacked" ? "a" : undefined}
                maxBarSize={48}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    case "pie":
    case "donut": {
      const m = metrics[0];
      const total = data.reduce((a, d) => a + Number(d[m.field] || 0), 0);
      const legendPayload = data.map((d, i) => ({
        id: String(d.key),
        value: total
          ? `${d.key} · ${Math.round((Number(d[m.field] || 0) / total) * 100)}%`
          : String(d.key),
        type: "circle" as const,
        color: colors[i % colors.length],
      }));
      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip {...tooltipStyle()} formatter={(v) => formatNumber(Number(v))} />
            {chart.showLegend && (
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 11, cursor: onSliceClick ? "pointer" : undefined }}
                payload={legendPayload}
                onClick={
                  onSliceClick
                    ? (entry: { value?: string }) => {
                        const value = String(entry?.value ?? "").split(" · ")[0];
                        if (value) onSliceClick(value);
                      }
                    : undefined
                }
              />
            )}
            <Pie
              data={data}
              dataKey={m.field}
              nameKey="key"
              innerRadius={chart.type === "donut" ? "52%" : 0}
              outerRadius="78%"
              paddingAngle={1}
              stroke="#fff"
              strokeWidth={2}
              isAnimationActive={false}
              cursor={onSliceClick ? "pointer" : undefined}
            >
              {data.map((d, i) => {
                const dimmed = !!focus && String(d.key) !== focus.value;
                return (
                  <Cell
                    key={i}
                    fill={colors[i % colors.length]}
                    fillOpacity={dimmed ? 0.28 : 1}
                    style={onSliceClick ? { cursor: "pointer" } : undefined}
                    onClick={onSliceClick ? () => onSliceClick(String(d.key)) : undefined}
                  />
                );
              })}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      );
    }
    case "scatter": {
      const x = metrics[0].field;
      const y = (metrics[1] || metrics[0]).field;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            {chart.showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />}
            <XAxis type="number" dataKey={x} name={metricLabel(metrics[0])} {...axis} tickFormatter={(v) => formatNumber(Number(v))} />
            <YAxis type="number" dataKey={y} name={metricLabel(metrics[1] || metrics[0])} {...axis} tickFormatter={(v) => formatNumber(Number(v))} width={52} />
            <Tooltip {...tooltipStyle()} formatter={(v) => formatNumber(Number(v))} />
            <Scatter data={data} fill={colors[0]} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      );
    }
    default:
      return <Empty hint="Unsupported chart" />;
  }
}

function Empty({ hint }: { hint: string }) {
  return (
    <div className="chart-empty">
      <div className="chart-empty-icon">◔</div>
      <span>{hint}</span>
    </div>
  );
}
