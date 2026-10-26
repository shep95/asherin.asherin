// asherin.data — deterministic arithmetic.
// every number an answer, an alert or a report states is computed here, on
// this device, from the stored rows. shepherd narrates what this file hands
// it; it never does the sums.

import type {
  Aggregate, ColumnProfile, ComputedTable, DataRow, DataSourceRow, DataVersionRow, DatasetProfile, PlanFilter, QualityReport, QueryPlan,
} from "./types";
import { toDate, toNumber } from "./validate";
import type { AlertRuleRow } from "./store";

export const MAX_PLAN_ROWS = 40;

const round = (n: number, d = 4) => Number(n.toFixed(d));

export interface MeasureStats { column: string; count: number; sum: number; mean: number; min: number; max: number; median: number }

export function measureStats(rows: DataRow[], column: string): MeasureStats | null {
  const nums = rows.map((r) => toNumber(r[column] ?? null)).filter((n): n is number => n !== null);
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = nums.reduce((a, b) => a + b, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { column, count: nums.length, sum: round(sum, 2), mean: round(sum / nums.length, 4), min: sorted[0], max: sorted[sorted.length - 1], median: round(median, 4) };
}

export function dateRange(rows: DataRow[], column: string): { from: string; to: string; days: number } | null {
  let lo: number | null = null;
  let hi: number | null = null;
  for (const r of rows) {
    const d = toDate(r[column] ?? null);
    if (!d) continue;
    const t = d.getTime();
    if (lo === null || t < lo) lo = t;
    if (hi === null || t > hi) hi = t;
  }
  if (lo === null || hi === null) return null;
  return { from: new Date(lo).toISOString().slice(0, 10), to: new Date(hi).toISOString().slice(0, 10), days: Math.round((hi - lo) / 86_400_000) };
}

/* ── filters and aggregation ───────────────────────────────────────────── */

export function applyFilter(rows: DataRow[], filter: PlanFilter | null): DataRow[] {
  if (!filter) return rows;
  const want = filter.value;
  const wantNum = typeof want === "number" ? want : toNumber(String(want));
  const wantStr = String(want).trim().toLowerCase();
  return rows.filter((r) => {
    const v = r[filter.column];
    if (v === null || v === undefined) return filter.op === "neq";
    const n = toNumber(v);
    const s = String(v).trim().toLowerCase();
    switch (filter.op) {
      case "eq": return n !== null && wantNum !== null ? n === wantNum : s === wantStr;
      case "neq": return n !== null && wantNum !== null ? n !== wantNum : s !== wantStr;
      case "gt": return n !== null && wantNum !== null && n > wantNum;
      case "gte": return n !== null && wantNum !== null && n >= wantNum;
      case "lt": return n !== null && wantNum !== null && n < wantNum;
      case "lte": return n !== null && wantNum !== null && n <= wantNum;
      case "contains": return s.includes(wantStr);
      default: return false;
    }
  });
}

function fold(values: number[], how: Aggregate, rowCount: number): number {
  if (how === "count") return rowCount;
  if (!values.length) return 0;
  switch (how) {
    case "sum": return round(values.reduce((a, b) => a + b, 0), 2);
    case "avg": return round(values.reduce((a, b) => a + b, 0) / values.length, 4);
    case "min": return Math.min(...values);
    case "max": return Math.max(...values);
    default: return 0;
  }
}

function periodKey(d: Date, grain: "day" | "month" | "year"): string {
  const iso = d.toISOString();
  return grain === "year" ? iso.slice(0, 4) : grain === "month" ? iso.slice(0, 7) : iso.slice(0, 10);
}

export function groupBy(rows: DataRow[], dimension: string, measure: string | null, how: Aggregate, limit = MAX_PLAN_ROWS): DataRow[] {
  const acc = new Map<string, { values: number[]; n: number }>();
  for (const r of rows) {
    const key = r[dimension] === null || r[dimension] === undefined ? "(blank)" : String(r[dimension]);
    const cur = acc.get(key) ?? { values: [], n: 0 };
    cur.n++;
    if (measure) {
      const v = toNumber(r[measure] ?? null);
      if (v !== null) cur.values.push(v);
    }
    acc.set(key, cur);
  }
  const out = measure ? `${how} of ${measure}` : "count";
  return [...acc.entries()]
    .map(([k, v]) => ({ [dimension]: k, [out]: fold(v.values, measure ? how : "count", v.n) } as DataRow))
    .sort((a, b) => Number(b[out]) - Number(a[out]))
    .slice(0, limit);
}

export function byPeriod(rows: DataRow[], dateColumn: string, grain: "day" | "month" | "year", measure: string | null, how: Aggregate): DataRow[] {
  const acc = new Map<string, { values: number[]; n: number }>();
  for (const r of rows) {
    const d = toDate(r[dateColumn] ?? null);
    if (!d) continue;
    const key = periodKey(d, grain);
    const cur = acc.get(key) ?? { values: [], n: 0 };
    cur.n++;
    if (measure) {
      const v = toNumber(r[measure] ?? null);
      if (v !== null) cur.values.push(v);
    }
    acc.set(key, cur);
  }
  const out = measure ? `${how} of ${measure}` : "count";
  return [...acc.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => ({ [dateColumn]: k, [out]: fold(v.values, measure ? how : "count", v.n) } as DataRow));
}

/** checks a plan against the real columns; anything that does not line up is
 *  dropped, and a plan with nothing left returns null. */
export function validatePlan(raw: unknown, profile: DatasetProfile): QueryPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const names = new Set(profile.columns.map((c) => c.name));
  const measureSet = new Set(profile.measures);
  const dateSet = new Set(profile.dateColumns);
  const col = (v: unknown, allowed?: Set<string>) => (typeof v === "string" && names.has(v) && (!allowed || allowed.has(v)) ? v : null);
  const aggregates: Aggregate[] = ["sum", "avg", "count", "min", "max"];
  const aggregate = aggregates.includes(p.aggregate as Aggregate) ? (p.aggregate as Aggregate) : "sum";
  const measure = col(p.measure, measureSet);
  const dateColumn = col(p.date_column ?? p.dateColumn, dateSet);
  let dimension = col(p.dimension);
  if (dimension && dimension === dateColumn) dimension = null;
  const grains = ["day", "month", "year"] as const;
  const grain = grains.includes(p.grain as typeof grains[number]) ? (p.grain as typeof grains[number]) : dateColumn ? "month" : null;
  let filter: PlanFilter | null = null;
  const f = p.filter as Record<string, unknown> | null | undefined;
  if (f && typeof f === "object") {
    const ops: PlanFilter["op"][] = ["eq", "neq", "gt", "gte", "lt", "lte", "contains"];
    const fc = col(f.column);
    if (fc && ops.includes(f.op as PlanFilter["op"]) && (typeof f.value === "string" || typeof f.value === "number")) {
      filter = { column: fc, op: f.op as PlanFilter["op"], value: f.value };
    }
  }
  const limitRaw = Number(p.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(MAX_PLAN_ROWS, Math.round(limitRaw)) : 12;
  if (!measure && !dimension && !dateColumn && !filter) return null;
  if (!measure && aggregate !== "count" && !dimension && !dateColumn) return null;
  return { aggregate: measure ? aggregate : "count", measure, dimension, dateColumn, grain, filter, limit };
}

export function describePlan(plan: QueryPlan): string {
  const what = plan.measure ? `${plan.aggregate} of ${plan.measure}` : "row count";
  const by = plan.dateColumn ? ` by ${plan.grain ?? "month"} of ${plan.dateColumn}` : plan.dimension ? ` by ${plan.dimension}` : "";
  const where = plan.filter ? ` where ${plan.filter.column} ${plan.filter.op} ${plan.filter.value}` : "";
  const top = plan.dimension && !plan.dateColumn ? ` (top ${plan.limit})` : "";
  return `${what}${by}${where}${top}`;
}

export function runPlan(rows: DataRow[], plan: QueryPlan): ComputedTable {
  const subset = applyFilter(rows, plan.filter);
  const note = describePlan(plan);
  if (plan.dateColumn) {
    const out = byPeriod(subset, plan.dateColumn, plan.grain ?? "month", plan.measure, plan.aggregate);
    return { columns: Object.keys(out[0] ?? {}), rows: out.slice(-MAX_PLAN_ROWS), note, rowsUsed: subset.length };
  }
  if (plan.dimension) {
    const out = groupBy(subset, plan.dimension, plan.measure, plan.aggregate, plan.limit);
    return { columns: Object.keys(out[0] ?? {}), rows: out, note, rowsUsed: subset.length };
  }
  if (plan.measure) {
    const s = measureStats(subset, plan.measure);
    const row: DataRow = s
      ? { measure: plan.measure, count: s.count, sum: s.sum, average: s.mean, min: s.min, max: s.max, median: s.median }
      : { measure: plan.measure, count: 0 };
    return { columns: Object.keys(row), rows: [row], note, rowsUsed: subset.length };
  }
  return { columns: ["rows"], rows: [{ rows: subset.length }], note, rowsUsed: subset.length };
}

/* ── grounding the model is handed ─────────────────────────────────────── */

function fmt(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  return Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : String(round(n, 2));
}

export function describeColumn(c: ColumnProfile, rows: DataRow[]): string {
  const parts = [`${c.name} (${c.type}, ${c.completeness}% filled, ${c.distinct} distinct)`];
  if (c.min !== undefined && c.max !== undefined) parts.push(`min ${fmt(c.min)}, max ${fmt(c.max)}, mean ${fmt(c.mean)}, median ${fmt(c.median)}`);
  if (c.type === "date") {
    const r = dateRange(rows, c.name);
    if (r) parts.push(`from ${r.from} to ${r.to}`);
  }
  if (["category", "text", "geo", "boolean", "id"].includes(c.type) && c.topValues.length) {
    parts.push(`top: ${c.topValues.slice(0, 5).map((t) => `${t.value} (${t.count})`).join(", ")}`);
  }
  return parts.join(" · ");
}

export interface GroundingInput {
  sourceName: string;
  version: number;
  rows: DataRow[];
  profile: DatasetProfile;
  quality: QualityReport;
  definitions?: { column: string; definition: string }[];
  instructions?: string;
  text?: string | null;
  sampleRows?: number;
}

/** the only material shepherd sees: real column names, real stats, real
 *  sample rows, the operator's own definitions and standing directions. */
export function buildGrounding(input: GroundingInput): string {
  const lines: string[] = [];
  lines.push(`source: ${input.sourceName} · version ${input.version} · ${input.rows.length.toLocaleString()} rows · ${input.profile.columns.length} columns · quality ${input.quality.score}/100 (${input.quality.completeness}% complete, ${input.quality.duplicateCount} duplicate rows)`);
  if (input.instructions?.trim()) lines.push(`standing directions from the operator: ${input.instructions.trim().slice(0, 2000)}`);
  if (input.profile.columns.length) {
    lines.push("columns:");
    for (const c of input.profile.columns.slice(0, 60)) {
      const def = input.definitions?.find((d) => d.column === c.name)?.definition?.trim();
      lines.push(`- ${describeColumn(c, input.rows)}${def ? ` · meaning: ${def.slice(0, 200)}` : ""}`);
    }
    const n = Math.min(input.sampleRows ?? 20, input.rows.length);
    if (n) {
      lines.push(`sample rows (${n} of ${input.rows.length.toLocaleString()}):`);
      const cols = input.profile.columns.slice(0, 24).map((c) => c.name);
      lines.push(cols.join(" | "));
      for (const r of input.rows.slice(0, n)) lines.push(cols.map((c) => String(r[c] ?? "").slice(0, 60)).join(" | "));
    }
  }
  if (input.text) lines.push(`document text (first ${Math.min(12_000, input.text.length).toLocaleString()} characters):\n${input.text.slice(0, 12_000)}`);
  return lines.join("\n");
}

export function tableToLines(t: ComputedTable): string {
  const head = t.columns.join(" | ");
  const body = t.rows.map((r) => t.columns.map((c) => String(r[c] ?? "")).join(" | "));
  return [`computed on this device — ${t.note} — from ${t.rowsUsed.toLocaleString()} rows`, head, ...body].join("\n");
}

/* ── alerts ────────────────────────────────────────────────────────────── */

export interface AlertHit { rule: AlertRuleRow; value: number; message: string }

/** evaluates one rule against the latest version's rows (and the previous
 *  version's, for a change rule). returns null when nothing fires. */
export function evaluateRule(rule: AlertRuleRow, latest: DataRow[], previous: DataRow[] | null): AlertHit | null {
  const { metric, aggregate, operator, threshold, sigma } = rule.spec;
  const stats = measureStats(latest, metric);
  if (!stats) return null;
  const value = aggregate === "avg" ? stats.mean : stats.sum;
  if (rule.kind === "threshold") {
    if (operator === ">" && value > threshold) return { rule, value, message: `${aggregate} of ${metric} is ${fmt(value)}, above ${fmt(threshold)}` };
    if (operator === "<" && value < threshold) return { rule, value, message: `${aggregate} of ${metric} is ${fmt(value)}, below ${fmt(threshold)}` };
    return null;
  }
  if (rule.kind === "change") {
    if (!previous) return null;
    const prev = measureStats(previous, metric);
    if (!prev) return null;
    const before = aggregate === "avg" ? prev.mean : prev.sum;
    if (before === 0) return null;
    const pct = ((value - before) / Math.abs(before)) * 100;
    if (operator === "change>" && pct >= threshold) return { rule, value: round(pct, 2), message: `${aggregate} of ${metric} rose ${round(pct, 1)}% between versions (${fmt(before)} → ${fmt(value)})` };
    if (operator === "change<" && pct <= -threshold) return { rule, value: round(pct, 2), message: `${aggregate} of ${metric} fell ${round(-pct, 1)}% between versions (${fmt(before)} → ${fmt(value)})` };
    return null;
  }
  // anomaly: any value outside mean ± sigma·stddev of the column
  const nums = latest.map((r) => toNumber(r[metric] ?? null)).filter((n): n is number => n !== null);
  if (nums.length < 8) return null;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const sd = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length);
  if (sd === 0) return null;
  const k = sigma > 0 ? sigma : 3;
  const outside = nums.filter((n) => Math.abs(n - mean) > k * sd);
  if (!outside.length) return null;
  const worst = outside.reduce((a, b) => (Math.abs(b - mean) > Math.abs(a - mean) ? b : a), outside[0]);
  return { rule, value: worst, message: `${outside.length} value(s) of ${metric} sit more than ${k} standard deviations from the mean of ${fmt(mean)}; the furthest is ${fmt(worst)}` };
}

/* ── reports ───────────────────────────────────────────────────────────── */

export const REPORT_TEMPLATES = ["overview", "quality", "trend", "anomaly"] as const;
export type ReportTemplate = typeof REPORT_TEMPLATES[number];

export interface ReportInput {
  template: ReportTemplate;
  source: DataSourceRow;
  version: DataVersionRow;
  rows: DataRow[];
  profile: DatasetProfile;
  quality: QualityReport;
  previousRows?: DataRow[] | null;
  generatedAt?: Date;
}

const mdTable = (rows: DataRow[], columns: string[]): string[] => [
  `| ${columns.join(" | ")} |`,
  `| ${columns.map(() => "---").join(" | ")} |`,
  ...rows.map((r) => `| ${columns.map((c) => String(r[c] ?? "")).join(" | ")} |`),
];

/** a deterministic markdown report from the stored rows. nothing in it is
 *  guessed; every figure is a computation over this version. */
export function buildReportMarkdown(input: ReportInput): string {
  const { template, source, version, rows, profile, quality } = input;
  const when = (input.generatedAt ?? new Date()).toISOString().slice(0, 16).replace("T", " ");
  const out: string[] = [];
  out.push(`# ${source.name} — ${template} report`);
  out.push("");
  out.push(`generated on this device · ${when} · version ${version.version} · ${rows.length.toLocaleString()} rows · ${profile.columns.length} columns`);
  out.push("");

  if (template === "overview" || template === "quality") {
    out.push("## quality");
    out.push("");
    out.push(`- score ${quality.score}/100 · ${quality.completeness}% complete · type consistency ${quality.typeConsistency}% · ${quality.duplicateCount} duplicate rows · ${quality.outlierCount} out-of-range values`);
    for (const i of quality.issues.slice(0, template === "quality" ? 40 : 8)) out.push(`- ${i.severity}: ${i.message}`);
    out.push("");
  }

  if (template === "overview" || template === "quality") {
    out.push("## columns");
    out.push("");
    out.push(...mdTable(
      profile.columns.map((c) => ({ column: c.name, type: c.type, filled: `${c.completeness}%`, distinct: c.distinct, min: c.min ?? "", max: c.max ?? "", mean: c.mean !== undefined ? round(c.mean, 2) : "" })),
      ["column", "type", "filled", "distinct", "min", "max", "mean"],
    ));
    out.push("");
  }

  if (template === "overview" || template === "trend") {
    const measures = profile.measures.slice(0, 6);
    if (measures.length) {
      out.push("## measures");
      out.push("");
      out.push(...mdTable(
        measures.map((m) => measureStats(rows, m)).filter((s): s is MeasureStats => !!s).map((s) => ({ measure: s.column, count: s.count, sum: s.sum, average: s.mean, min: s.min, max: s.max, median: s.median })),
        ["measure", "count", "sum", "average", "min", "max", "median"],
      ));
      out.push("");
    }
    const dim = profile.dimensions.find((d) => profile.columns.find((c) => c.name === d)?.type === "category") ?? profile.dimensions[0];
    if (dim && measures[0]) {
      const t = groupBy(rows, dim, measures[0], "sum", 12);
      out.push(`## ${measures[0]} by ${dim} (top ${t.length})`);
      out.push("");
      out.push(...mdTable(t, Object.keys(t[0] ?? {})));
      out.push("");
    }
  }

  if (template === "trend") {
    const dc = profile.dateColumns[0];
    if (!dc) {
      out.push("## trend");
      out.push("");
      out.push("no date column was found, so there is no time axis to read a trend from.");
      out.push("");
    } else {
      const r = dateRange(rows, dc);
      const grain = r && r.days > 800 ? "year" : r && r.days > 70 ? "month" : "day";
      for (const m of profile.measures.slice(0, 3)) {
        const t = byPeriod(rows, dc, grain, m, "sum").slice(-36);
        if (!t.length) continue;
        out.push(`## sum of ${m} by ${grain}`);
        out.push("");
        out.push(...mdTable(t, Object.keys(t[0])));
        out.push("");
      }
      const counts = byPeriod(rows, dc, grain, null, "count").slice(-36);
      if (counts.length) {
        out.push(`## rows by ${grain}`);
        out.push("");
        out.push(...mdTable(counts, Object.keys(counts[0])));
        out.push("");
      }
    }
  }

  if (template === "anomaly" || template === "overview") {
    out.push("## out-of-range values");
    out.push("");
    const flagged = profile.columns.filter((c) => c.outlierRows.length);
    if (!flagged.length) out.push("no column has values outside its interquartile range.");
    for (const c of flagged.slice(0, 8)) {
      const vals = c.outlierRows.slice(0, 6).map((i) => String(rows[i]?.[c.name] ?? "")).join(", ");
      out.push(`- ${c.name}: ${c.outlierRows.length} value(s) outside ${fmt(c.p25)}–${fmt(c.p75)} ± 1.5 iqr, e.g. ${vals}`);
    }
    out.push("");
  }

  if (template === "anomaly" && input.previousRows) {
    out.push("## change since the previous version");
    out.push("");
    out.push(...mdTable(
      profile.measures.slice(0, 8).map((m) => {
        const a = measureStats(input.previousRows ?? [], m);
        const b = measureStats(rows, m);
        const pct = a && b && a.sum !== 0 ? round(((b.sum - a.sum) / Math.abs(a.sum)) * 100, 1) : null;
        return { measure: m, "previous sum": a?.sum ?? "", "current sum": b?.sum ?? "", change: pct === null ? "—" : `${pct}%` };
      }),
      ["measure", "previous sum", "current sum", "change"],
    ));
    out.push("");
  }

  out.push("---");
  out.push("every figure above was computed on this device from the stored rows; nothing was estimated by a model.");
  return out.join("\n");
}
