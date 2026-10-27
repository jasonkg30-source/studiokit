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
import type { Chart, Row } from "../types";
import { buildSeries, formatNumber, metricLabel } from "../data";

interface Props {
  chart: Chart;
  rows: Row[];
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

export default function ChartRenderer({ chart, rows }: Props) {
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
      return (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {chart.dimensions.map((d) => (
                  <th key={d}>{d}</th>
                ))}
                {metrics.map((m) => (
                  <th key={m.field} className="num">
                    {metricLabel(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={String(row.key)}>
                  {chart.dimensions.map((d, i) => (
                    <td key={d}>{String(row.key).split(" / ")[i]}</td>
                  ))}
                  {metrics.map((m) => (
                    <td key={m.field} className="num">
                      {formatNumber(Number(row[m.field] ?? 0))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
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
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    case "pie":
    case "donut": {
      const m = metrics[0];
      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip {...tooltipStyle()} formatter={(v) => formatNumber(Number(v))} />
            {chart.showLegend && <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />}
            <Pie
              data={data}
              dataKey={m.field}
              nameKey="key"
              innerRadius={chart.type === "donut" ? "52%" : 0}
              outerRadius="78%"
              paddingAngle={1}
              stroke="#fff"
              strokeWidth={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
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
            <Scatter data={data} fill={colors[0]} />
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
