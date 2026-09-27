// asherin.data — chart surface.
// Renders the chart family the engine chose. Anything the renderer cannot draw
// falls back to a readable table rather than an empty box.

import { memo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, ScatterChart, Scatter,
  PieChart, Pie, Cell, Treemap, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import type { ChartSpec } from "@/lib/data/types";
import { seriesColor } from "@/lib/data/charts";

const axisStyle = { fill: "hsl(var(--data-muted, 0 0% 58%))", fontSize: 11 };
const gridStroke = "hsl(var(--data-grid, 0 0% 18%))";

function tooltipStyle() {
  return {
    background: "hsl(var(--data-surface, 0 0% 6%) / 0.92)",
    border: "1px solid hsl(var(--data-grid, 0 0% 18%))",
    borderRadius: 12,
    color: "hsl(var(--data-ink, 0 0% 92%))",
    fontSize: 12,
  };
}

function FallbackTable({ spec }: { spec: ChartSpec }) {
  const cols = Object.keys(spec.data[0] ?? {});
  return (
    <div className="max-h-64 overflow-auto rounded-xl border border-white/10">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-white/5 backdrop-blur">
          <tr>{cols.map((c) => <th key={c} className="px-3 py-2 font-normal text-white/60">{c}</th>)}</tr>
        </thead>
        <tbody>
          {spec.data.slice(0, 60).map((r, i) => (
            <tr key={i} className="border-t border-white/5">
              {cols.map((c) => <td key={c} className="px-3 py-1.5 text-white/80">{String(r[c] ?? "")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function orderContinuousAxis(spec: ChartSpec): ChartSpec {
  if (!["line", "area", "scatter"].includes(spec.render)) return spec;
  const x = spec.x ?? Object.keys(spec.data[0] ?? {})[0];
  if (!x || spec.data.length < 2) return spec;
  const key = (r: Record<string, unknown>) => {
    const v = r[x];
    if (typeof v === "number") return v;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    const t = Date.parse(String(v ?? ""));
    return Number.isFinite(t) ? t : NaN;
  };
  if (spec.data.some((r) => Number.isNaN(key(r)))) return spec;
  return { ...spec, data: [...spec.data].sort((a, b) => key(a) - key(b)) };
}


function ChartBody({ spec: rawSpec }: { spec: ChartSpec }) {
  // a trend read left-to-right is only honest when the axis runs in order, so
  // continuous axes (years, periods, dates) are sorted ascending before render.
  const spec = orderContinuousAxis(rawSpec);
  const x = spec.x ?? Object.keys(spec.data[0] ?? {})[0];
  const ys = spec.y?.length ? spec.y : Object.keys(spec.data[0] ?? {}).filter((k) => k !== x).slice(0, 2);


  switch (spec.render) {
    case "kpi": {
      const d = spec.data[0] ?? {};
      return (
        <div className="grid grid-cols-3 gap-3">
          {(["total", "average", "count"] as const).map((k) => (
            <div key={k} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[10px] uppercase tracking-widest text-white/45">{k}</div>
              <div className="mt-1 text-2xl font-extralight text-white/90">
                {typeof d[k] === "number" ? Number(d[k]).toLocaleString() : String(d[k] ?? "—")}
              </div>
            </div>
          ))}
        </div>
      );
    }
    case "line":
    case "control":
    case "sparkline":
    case "slope": {
      const values = spec.data.map((r) => Number(r[ys[0]] ?? 0)).filter((n) => Number.isFinite(n));
      const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      return (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={spec.data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey={x} tick={axisStyle} tickLine={false} axisLine={{ stroke: gridStroke }} minTickGap={24} />
            <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={56} />
            <Tooltip contentStyle={tooltipStyle()} />
            {ys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {spec.render === "control" && <ReferenceLine y={mean} stroke={seriesColor(1)} strokeDasharray="4 4" />}
            {ys.map((yk, i) => (
              <Line key={yk} type="monotone" dataKey={yk} stroke={seriesColor(i)} strokeWidth={1.6} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    }
    case "area":
      return (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={spec.data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey={x} tick={axisStyle} tickLine={false} axisLine={{ stroke: gridStroke }} minTickGap={24} />
            <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={56} />
            <Tooltip contentStyle={tooltipStyle()} />
            {ys.map((yk, i) => (
              <Area key={yk} type="monotone" dataKey={yk} stroke={seriesColor(i)} fill={seriesColor(i)} fillOpacity={0.15} isAnimationActive={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      );
    case "scatter":
    case "bubble":
      return (
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="2 4" />
            <XAxis dataKey={x} type="number" tick={axisStyle} tickLine={false} axisLine={{ stroke: gridStroke }} name={x} />
            <YAxis dataKey={ys[0]} type="number" tick={axisStyle} tickLine={false} axisLine={false} width={56} name={ys[0]} />
            <Tooltip contentStyle={tooltipStyle()} cursor={{ strokeDasharray: "3 3" }} />
            <Scatter data={spec.data} fill={seriesColor(0)} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      );
    case "pie":
      return (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Tooltip contentStyle={tooltipStyle()} />
            <Pie data={spec.data} dataKey={ys[0]} nameKey={x} innerRadius={52} outerRadius={92} paddingAngle={2} isAnimationActive={false}>
              {spec.data.map((_, i) => <Cell key={i} fill={seriesColor(i)} stroke="transparent" />)}
            </Pie>
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      );
    case "treemap":
      return (
        <ResponsiveContainer width="100%" height={260}>
          <Treemap
            data={spec.data.map((r, i) => ({ name: String(r[x] ?? ""), size: Number(r[ys[0]] ?? 0), fill: seriesColor(i) }))}
            dataKey="size"
            stroke="hsl(0 0% 8%)"
            isAnimationActive={false}
          >
            <Tooltip contentStyle={tooltipStyle()} />
          </Treemap>
        </ResponsiveContainer>
      );
    case "histogram":
    case "bar":
    case "grouped-bar":
    case "stacked-bar":
    case "waterfall":
    case "funnel":
    case "bullet":
      return (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={spec.data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} layout={spec.data.length > 12 ? "horizontal" : "horizontal"}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey={x} tick={axisStyle} tickLine={false} axisLine={{ stroke: gridStroke }} interval="preserveStartEnd" angle={spec.data.length > 8 ? -25 : 0} height={spec.data.length > 8 ? 56 : 30} textAnchor={spec.data.length > 8 ? "end" : "middle"} />
            <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={56} />
            <Tooltip contentStyle={tooltipStyle()} cursor={{ fill: "hsl(0 0% 100% / 0.04)" }} />
            {ys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {ys.map((yk, i) => (
              <Bar key={yk} dataKey={yk} stackId={spec.render === "stacked-bar" ? "a" : undefined} fill={seriesColor(i)} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    default:
      return <FallbackTable spec={spec} />;
  }
}

function ChartRenderInner({ spec }: { spec: ChartSpec }) {
  if (!spec || spec.render === "none" || !spec.data?.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-sm text-white/50">
        no visual was drawn for this answer — the data did not support one.
      </div>
    );
  }
  return (
    <figure className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
      <figcaption className="mb-3">
        <div className="text-sm text-white/85">{spec.title}</div>
        <div className="text-[11px] text-white/45">{spec.insight}</div>
      </figcaption>
      <ChartBody spec={spec} />
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/5 pt-2 text-[10px] text-white/40">
        <span>{spec.sourceTag}</span>
        {typeof spec.quality === "number" && <span>data quality {spec.quality}/100</span>}
        {spec.confidence && <span>confidence {spec.confidence}</span>}
        <span className="ml-auto">{spec.render}</span>
      </div>
    </figure>
  );
}

export const ChartRender = memo(ChartRenderInner);
export default ChartRender;
