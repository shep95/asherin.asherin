// asherin.data — validation and profiling.
// Runs before the ai is allowed near the data. The user sees this report first
// and decides: clean it here, re-upload, or proceed with the score attached.

import type {
  ColumnProfile, ColumnType, DataRow, DatasetProfile, PatternDomain, QualityReport, DataCellValue,
} from "./types";

const CURRENCY_RE = /^[-+]?[$£€¥]\s?[\d,]+(\.\d+)?$|^[-+]?[\d,]+(\.\d+)?\s?(usd|eur|gbp|cad|aud)$/i;
const PERCENT_RE = /^[-+]?\d+(\.\d+)?\s?%$/;
const NUMBER_RE = /^[-+]?[\d,]*\.?\d+([eE][-+]?\d+)?$/;
const BOOL_RE = /^(true|false|yes|no|y|n|0|1)$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/;
const LOOSE_DATE_RE = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$|^[a-z]{3,9}\s+\d{1,2},?\s+\d{4}$/i;
const GEO_NAME_RE = /(lat|latitude|lon|lng|longitude|country|city|state|region|postcode|zip|geo|iso_?code)/i;
const ID_NAME_RE = /(^id$|_id$|uuid|guid|^key$|_key$|sku|order_?no|invoice)/i;

export function toNumber(v: DataCellValue): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  const s = String(v).trim().replace(/[$£€¥,%\s]/g, "").replace(/(usd|eur|gbp|cad|aud)$/i, "");
  if (!s || !NUMBER_RE.test(s.replace(/,/g, ""))) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function toDate(v: DataCellValue): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  if (!ISO_DATE_RE.test(s) && !LOOSE_DATE_RE.test(s)) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1] ?? sorted[base];
  return sorted[base] + rest * (next - sorted[base]);
}

function detectType(name: string, values: DataCellValue[]): { type: ColumnType; drift: number } {
  const present = values.filter((v) => v !== null && v !== "");
  if (!present.length) return { type: "text", drift: 0 };
  const counts: Record<string, number> = { number: 0, currency: 0, percent: 0, date: 0, boolean: 0, text: 0 };
  for (const v of present) {
    const s = String(v).trim();
    if (CURRENCY_RE.test(s)) counts.currency++;
    else if (PERCENT_RE.test(s)) counts.percent++;
    else if (typeof v === "number" || NUMBER_RE.test(s.replace(/,/g, ""))) counts.number++;
    else if (BOOL_RE.test(s)) counts.boolean++;
    else if (ISO_DATE_RE.test(s) || LOOSE_DATE_RE.test(s)) counts.date++;
    else counts.text++;
  }
  const [dominant, hits] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const drift = Math.round(((present.length - hits) / present.length) * 100);
  const distinct = new Set(present.map(String)).size;

  let type: ColumnType = dominant as ColumnType;
  if (dominant === "number") {
    const allInt = present.every((v) => Number.isInteger(toNumber(v) ?? 0.5));
    if (ID_NAME_RE.test(name) && distinct / present.length > 0.9) type = "id";
    else type = allInt ? "integer" : "number";
  } else if (dominant === "text") {
    if (GEO_NAME_RE.test(name)) type = "geo";
    else if (ID_NAME_RE.test(name) && distinct / present.length > 0.9) type = "id";
    else if (distinct <= Math.max(20, present.length * 0.05)) type = "category";
    else type = "text";
  }
  if (GEO_NAME_RE.test(name) && (type === "number" || type === "integer")) type = "geo";
  return { type, drift };
}

export function profileColumns(columns: string[], rows: DataRow[]): ColumnProfile[] {
  return columns.map((name) => {
    const values = rows.map((r) => r[name] ?? null);
    const present = values.filter((v) => v !== null && v !== "");
    const { type, drift } = detectType(name, values);
    const freq = new Map<string, number>();
    for (const v of present) {
      const k = String(v);
      freq.set(k, (freq.get(k) ?? 0) + 1);
    }
    const nums = type === "number" || type === "integer" || type === "currency" || type === "percent"
      ? values.map(toNumber).filter((n): n is number => n !== null)
      : [];
    const sorted = [...nums].sort((a, b) => a - b);
    const p25 = quantile(sorted, 0.25);
    const p75 = quantile(sorted, 0.75);
    const iqr = p75 - p25;
    const lo = p25 - 1.5 * iqr;
    const hi = p75 + 1.5 * iqr;
    const outlierRows: number[] = [];
    if (nums.length >= 8 && iqr > 0) {
      rows.forEach((r, i) => {
        const n = toNumber(r[name] ?? null);
        if (n !== null && (n < lo || n > hi)) outlierRows.push(i);
      });
    }
    const mean = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : undefined;
    const stdDev = nums.length && mean !== undefined
      ? Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length)
      : undefined;

    return {
      name,
      type,
      completeness: rows.length ? Math.round((present.length / rows.length) * 100) : 0,
      missing: rows.length - present.length,
      distinct: freq.size,
      typeDrift: drift,
      min: sorted.length ? sorted[0] : undefined,
      max: sorted.length ? sorted[sorted.length - 1] : undefined,
      mean,
      median: sorted.length ? quantile(sorted, 0.5) : undefined,
      stdDev,
      p25: sorted.length ? p25 : undefined,
      p75: sorted.length ? p75 : undefined,
      outlierRows: outlierRows.slice(0, 500),
      topValues: [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([value, count]) => ({ value, count })),
      sample: present.slice(0, 5),
    };
  });
}

export function findDuplicateRows(columns: string[], rows: DataRow[]): number[] {
  const seen = new Map<string, number>();
  const dupes: number[] = [];
  rows.forEach((r, i) => {
    const key = columns.map((c) => String(r[c] ?? "")).join("\u0001");
    if (seen.has(key)) dupes.push(i);
    else seen.set(key, i);
  });
  return dupes;
}

export function buildQualityReport(columns: string[], rows: DataRow[], profiles: ColumnProfile[]): QualityReport {
  const duplicateRows = findDuplicateRows(columns, rows);
  const completeness = profiles.length
    ? profiles.reduce((a, c) => a + c.completeness, 0) / profiles.length
    : 0;
  const typeConsistency = profiles.length
    ? 100 - profiles.reduce((a, c) => a + c.typeDrift, 0) / profiles.length
    : 100;
  const outlierCount = profiles.reduce((a, c) => a + c.outlierRows.length, 0);
  const dupePenalty = rows.length ? (duplicateRows.length / rows.length) * 100 : 0;
  const outlierPenalty = rows.length ? Math.min(10, (outlierCount / rows.length) * 100) : 0;

  const score = Math.max(0, Math.min(100, Math.round(
    completeness * 0.45 + typeConsistency * 0.35 + (100 - dupePenalty) * 0.15 + (100 - outlierPenalty * 10) * 0.05,
  )));

  const issues: QualityReport["issues"] = [];
  for (const c of profiles) {
    if (c.completeness < 60) issues.push({ severity: "high", column: c.name, message: `${c.name} is only ${c.completeness}% filled in` });
    else if (c.completeness < 90) issues.push({ severity: "medium", column: c.name, message: `${c.name} is missing ${c.missing} value(s)` });
    if (c.typeDrift > 10) issues.push({ severity: "medium", column: c.name, message: `${c.typeDrift}% of ${c.name} does not match the ${c.type} pattern the rest of the column follows` });
    if (c.outlierRows.length > 0) issues.push({ severity: "low", column: c.name, message: `${c.outlierRows.length} value(s) in ${c.name} sit outside the normal range` });
  }
  if (duplicateRows.length) {
    issues.unshift({ severity: duplicateRows.length > rows.length * 0.05 ? "high" : "medium", message: `${duplicateRows.length} duplicate row(s)` });
  }
  if (!rows.length) issues.push({ severity: "high", message: "there are no rows in this file" });

  return {
    score,
    rowCount: rows.length,
    columnCount: columns.length,
    duplicateRows: duplicateRows.slice(0, 2000),
    duplicateCount: duplicateRows.length,
    completeness: Math.round(completeness),
    typeConsistency: Math.round(typeConsistency),
    outlierCount,
    issues: issues.slice(0, 40),
  };
}

const FINANCIAL_RE = /(revenue|sales|price|cost|amount|profit|margin|invoice|payment|balance|spend|budget|arr|mrr|churn_?value|ltv|cac|gross|net|tax|fee|usd|currency|open|high|low|close|volume)/i;
const BEHAVIORAL_RE = /(user|customer|session|click|visit|signup|login|retention|cohort|engagement|conversion|funnel|event|action|churn|active|subscriber|referral)/i;
const TEXT_RE = /(comment|review|feedback|description|message|note|text|body|title|summary|transcript|content)/i;
const OPERATIONAL_RE = /(status|stage|queue|ticket|sla|uptime|latency|error|throughput|inventory|stock|capacity|shift|task|defect|incident)/i;

export function detectDomains(profiles: ColumnProfile[], documentText: string): PatternDomain[] {
  const domains = new Set<PatternDomain>();
  for (const c of profiles) {
    if (FINANCIAL_RE.test(c.name) || c.type === "currency") domains.add("financial");
    if (BEHAVIORAL_RE.test(c.name)) domains.add("behavioral");
    if (TEXT_RE.test(c.name) || c.type === "text") domains.add("text");
    if (OPERATIONAL_RE.test(c.name)) domains.add("operational");
    if (c.type === "date") domains.add("temporal");
    if (c.type === "geo") domains.add("geographic");
  }
  if (!profiles.length && documentText.trim()) domains.add("text");
  if (!domains.size) domains.add("operational");
  return [...domains];
}

export function buildDatasetProfile(columns: string[], rows: DataRow[], documentText = ""): DatasetProfile {
  const profiles = profileColumns(columns, rows);
  const measures = profiles
    .filter((c) => ["number", "integer", "currency", "percent"].includes(c.type) && c.type !== "id")
    .map((c) => c.name);
  const dimensions = profiles.filter((c) => ["category", "text", "boolean", "geo", "id"].includes(c.type)).map((c) => c.name);
  const dateColumns = profiles.filter((c) => c.type === "date").map((c) => c.name);
  return {
    columns: profiles,
    domains: detectDomains(profiles, documentText),
    measures,
    dimensions,
    dateColumns,
    rowCount: rows.length,
  };
}

export const DOMAIN_PATTERNS: Record<PatternDomain, string[]> = {
  financial: ["financial pattern recognition", "market cycle detection", "volatility and trend analysis", "time series decomposition"],
  behavioral: ["behavioral pattern recognition", "psychological pattern analysis", "cohort behaviour tracking", "intent signal detection"],
  text: ["linguistic pattern recognition", "sentiment analysis", "deception morphology", "narrative structure analysis", "topic modelling"],
  operational: ["temporal cycle pattern recognition", "anomaly detection", "trend decomposition", "leading and lagging indicator identification"],
  temporal: ["temporal cycle pattern recognition", "seasonality decomposition", "lag structure analysis"],
  geographic: ["geospatial clustering", "flow analysis", "territorial pattern recognition"],
};
