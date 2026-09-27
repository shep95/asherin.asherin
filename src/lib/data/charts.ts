// asherin.data — chart selection.
// The intent drives the chart, not the other way round. If nothing in the data
// supports a visual, the engine returns "none" rather than drawing decoration.

import type { ChartSpec, DataRow, DatasetProfile } from "./types";
import { toNumber, toDate } from "./validate";

export const CHART_TOKENS = [
  "--data-series-1", "--data-series-2", "--data-series-3", "--data-series-4",
  "--data-series-5", "--data-series-6", "--data-series-7", "--data-series-8",
];

export function seriesColor(index: number): string {
  return `hsl(var(${CHART_TOKENS[index % CHART_TOKENS.length]}))`;
}

/** Maps an analytical intent to the chart family that reads fastest for it. */
export function renderForIntent(
  intent: ChartSpec["intent"],
  opts: { seriesCount: number; categories: number; hasDate: boolean },
): ChartSpec["render"] {
  switch (intent) {
    case "trend":
      return opts.seriesCount > 1 ? "line" : opts.categories > 40 ? "area" : "line";
    case "comparison":
      if (opts.seriesCount > 1) return "grouped-bar";
      return opts.categories > 25 ? "bar" : "bar";
    case "part-to-whole":
      return opts.categories <= 6 ? "pie" : opts.categories <= 40 ? "treemap" : "stacked-bar";
    case "distribution":
      return opts.seriesCount > 1 ? "box" : "histogram";
    case "relationship":
      return opts.seriesCount > 2 ? "bubble" : "scatter";
    case "anomaly":
      return opts.hasDate ? "control" : "scatter";
    case "flow":
      return "sankey";
    case "geographic":
      return "scatter";
    case "summary":
      return "kpi";
    default:
      return "bar";
  }
}

function aggregate(rows: DataRow[], dim: string, measure: string, how: "sum" | "avg" = "sum") {
  const acc = new Map<string, { total: number; n: number }>();
  for (const r of rows) {
    const key = r[dim] === null || r[dim] === undefined ? "(blank)" : String(r[dim]);
    const v = toNumber(r[measure] ?? null);
    if (v === null) continue;
    const cur = acc.get(key) ?? { total: 0, n: 0 };
    cur.total += v; cur.n += 1;
    acc.set(key, cur);
  }
  return [...acc.entries()].map(([k, v]) => ({ [dim]: k, [measure]: how === "sum" ? Number(v.total.toFixed(4)) : Number((v.total / v.n).toFixed(4)) }));
}

function byDate(rows: DataRow[], dateCol: string, measure: string) {
  const acc = new Map<string, number>();
  for (const r of rows) {
    const d = toDate(r[dateCol] ?? null);
    const v = toNumber(r[measure] ?? null);
    if (!d || v === null) continue;
    const key = d.toISOString().slice(0, 10);
    acc.set(key, (acc.get(key) ?? 0) + v);
  }
  return [...acc.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => ({ [dateCol]: k, [measure]: Number(v.toFixed(4)) }));
}

function histogram(rows: DataRow[], measure: string, bins = 16) {
  const nums = rows.map((r) => toNumber(r[measure] ?? null)).filter((n): n is number => n !== null);
  if (nums.length < 5) return [];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (min === max) return [{ bucket: String(min), count: nums.length }];
  const width = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const n of nums) counts[Math.min(bins - 1, Math.floor((n - min) / width))]++;
  return counts.map((count, i) => ({
    bucket: (min + i * width).toFixed(min > 1000 ? 0 : 2),
    count,
  }));
}

/** Builds a chart from a resolved spec request against real rows.
 *  Returns null when the requested fields are not usable. */
export function buildChart(
  request: { intent: ChartSpec["intent"]; x?: string; y?: string[]; title: string; insight: string; sourceTag: string; render?: ChartSpec["render"] },
  rows: DataRow[],
  profile: DatasetProfile,
): ChartSpec | null {
  const measures = (request.y ?? []).filter((m) => profile.columns.some((c) => c.name === m));
  const dimension = request.x && profile.columns.some((c) => c.name === request.x) ? request.x : undefined;
  const dateCol = dimension && profile.dateColumns.includes(dimension) ? dimension : undefined;

  let data: Record<string, unknown>[] = [];
  let render = request.render;

  if (request.intent === "distribution" && measures[0]) {
    data = histogram(rows, measures[0]);
    render = render ?? "histogram";
    return data.length ? { ...request, render, x: "bucket", y: ["count"], data: data as ChartSpec["data"] } : null;
  }
  if (request.intent === "relationship" && measures.length >= 2) {
    data = rows
      .map((r) => ({ [measures[0]]: toNumber(r[measures[0]] ?? null), [measures[1]]: toNumber(r[measures[1]] ?? null) }))
      .filter((d) => d[measures[0]] !== null && d[measures[1]] !== null)
      .slice(0, 2000);
    render = render ?? "scatter";
    return data.length >= 3 ? { ...request, render, x: measures[0], y: [measures[1]], data: data as ChartSpec["data"] } : null;
  }
  if (request.intent === "summary" && measures[0]) {
    const nums = rows.map((r) => toNumber(r[measures[0]] ?? null)).filter((n): n is number => n !== null);
    if (!nums.length) return null;
    const total = nums.reduce((a, b) => a + b, 0);
    return {
      ...request,
      render: "kpi",
      y: measures,
      data: [{ label: measures[0], total: Number(total.toFixed(2)), average: Number((total / nums.length).toFixed(2)), count: nums.length }],
    };
  }
  if (dateCol && measures[0]) {
    data = byDate(rows, dateCol, measures[0]);
    render = render ?? renderForIntent("trend", { seriesCount: 1, categories: data.length, hasDate: true });
    return data.length >= 2 ? { ...request, render, x: dateCol, y: [measures[0]], data: data as ChartSpec["data"] } : null;
  }
  if (dimension && measures[0]) {
    data = aggregate(rows, dimension, measures[0]).sort((a, b) => Number(b[measures[0]]) - Number(a[measures[0]])).slice(0, 40);
    render = render ?? renderForIntent(request.intent, { seriesCount: measures.length, categories: data.length, hasDate: false });
    if (render === "pie" && data.length > 8) render = "treemap";
    return data.length ? { ...request, render, x: dimension, y: [measures[0]], data: data as ChartSpec["data"] } : null;
  }
  if (dimension && !measures.length) {
    const acc = new Map<string, number>();
    for (const r of rows) {
      const k = r[dimension] === null || r[dimension] === undefined ? "(blank)" : String(r[dimension]);
      acc.set(k, (acc.get(k) ?? 0) + 1);
    }
    data = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, count]) => ({ [dimension]: k, count }));
    render = render ?? "bar";
    return data.length ? { ...request, render, x: dimension, y: ["count"], data: data as ChartSpec["data"] } : null;
  }
  return null;
}
