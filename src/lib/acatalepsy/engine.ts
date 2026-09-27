import type { ColumnProfile, DataCellValue, DataRow, DatasetProfile, ParsedFile } from "@/lib/data/types";
import { buildDatasetProfile, buildQualityReport, toDate, toNumber } from "@/lib/data/validate";

export type AcatalepsyDomain = "financial" | "cybersecurity" | "behavioral" | "geopolitical" | "health" | "operations" | "geospatial" | "temporal" | "text";
export type AcatalepsyRank = "beginner" | "intermediate" | "senior" | "elite" | "intelligence" | "military";
export type VisualKind = "line" | "bar" | "donut" | "scatter" | "histogram" | "box" | "heatmap" | "candlestick" | "funnel" | "sankey" | "network" | "map" | "kpi";

export interface VisualRule {
  id: string;
  name: string;
  kind: VisualKind;
  domain: AcatalepsyDomain;
  rank: AcatalepsyRank;
  reason: string;
  required: string[];
}

export interface Analysis {
  profile: DatasetProfile;
  quality: ReturnType<typeof buildQualityReport>;
  domains: { domain: AcatalepsyDomain; score: number; evidence: string[] }[];
  rank: AcatalepsyRank;
  rankReason: string;
  visuals: VisualRule[];
  evidence: string[];
}

export interface LocalDataset {
  id: string;
  file: File;
  path: string;
  batch: string;
  status: "queued" | "reading" | "ready" | "error";
  progress: number;
  parsed?: ParsedFile;
  analysis?: Analysis;
  error?: string;
}

const SIGNATURES: Record<AcatalepsyDomain, RegExp> = {
  financial: /(price|revenue|sales|open|high|low|close|volume|amount|profit|margin|currency|asset|ticker|bid|ask|capital|transaction)/i,
  cybersecurity: /(ip|domain|host|port|login|authentication|failed|malware|certificate|cve|vulnerability|traffic|bytes|firewall|device|account|source|destination)/i,
  behavioral: /(user|session|click|survey|response|cohort|retention|engagement|conversion|funnel|post|topic|sentiment|trust|grievance)/i,
  geopolitical: /(country|district|election|vote|conflict|regime|jurisdiction|military|institution|population|narrative|language)/i,
  health: /(patient|symptom|systolic|diastolic|heart|blood|disease|case|gene|protein|metabolite|pathogen|sample|clinical|hospital)/i,
  operations: /(product|category|supplier|shipment|facility|inventory|capacity|status|stage|kpi|delivery|ticket|incident|department|employee)/i,
  geospatial: /(lat|latitude|lon|lng|longitude|country|city|state|region|district|location|origin|destination|geometry)/i,
  temporal: /(date|time|timestamp|month|week|year|period|created|occurred|day|hour)/i,
  text: /(text|message|comment|review|note|body|description|title|transcript|content|narrative)/i,
};

const RANKS: AcatalepsyRank[] = ["beginner", "intermediate", "senior", "elite", "intelligence", "military"];

function headers(profile: DatasetProfile) {
  return profile.columns.map((c) => c.name.toLowerCase());
}

function has(headersList: string[], re: RegExp) {
  return headersList.some((h) => re.test(h));
}

export function scoreDomains(profile: DatasetProfile): Analysis["domains"] {
  const names = headers(profile);
  return (Object.entries(SIGNATURES) as [AcatalepsyDomain, RegExp][])
    .map(([domain, re]) => {
      const matches = names.filter((name) => re.test(name));
      let score = Math.min(92, matches.length * 18);
      if (domain === "geospatial" && profile.columns.some((c) => c.type === "geo")) score += 18;
      if (domain === "temporal" && profile.dateColumns.length) score += 28;
      if (domain === "text" && profile.columns.some((c) => c.type === "text")) score += 18;
      return { domain, score: Math.min(100, score), evidence: matches.slice(0, 4) };
    })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function assignRank(profile: DatasetProfile, fileCount = 1): { rank: AcatalepsyRank; reason: string } {
  const complexity = Math.min(5,
    (profile.rowCount >= 25 ? 1 : 0) +
    (profile.rowCount >= 250 ? 1 : 0) +
    (profile.measures.length >= 3 && profile.dimensions.length >= 2 ? 1 : 0) +
    (fileCount >= 2 ? 1 : 0) +
    (profile.rowCount >= 2_000 && profile.columns.length >= 10 ? 1 : 0));
  const rank = RANKS[complexity];
  return { rank, reason: `${profile.rowCount.toLocaleString()} rows, ${profile.columns.length} columns, ${profile.measures.length} measures, ${profile.dateColumns.length} date fields and ${fileCount} local file${fileCount === 1 ? "" : "s"}` };
}

export function chooseVisuals(profile: DatasetProfile, domains: Analysis["domains"], rank: AcatalepsyRank): VisualRule[] {
  const h = headers(profile);
  const primary = domains[0]?.domain ?? "operations";
  const out: VisualRule[] = [];
  const add = (kind: VisualKind, name: string, reason: string, required: string[], domain = primary, atRank: AcatalepsyRank = rank) => {
    if (!out.some((v) => v.kind === kind)) out.push({ id: `${kind}-${out.length}`, kind, name, reason, required, domain, rank: atRank });
  };
  if (has(h, /^(open|o)$/i) && has(h, /^(high|h)$/i) && has(h, /^(low|l)$/i) && has(h, /^(close|c)$/i)) {
    add("candlestick", "ohlc price structure", "open, high, low and close fields form complete candles", ["open", "high", "low", "close"], "financial", "intermediate");
  }
  if (profile.dateColumns.length && profile.measures.length) add("line", primary === "health" ? "vital or clinical trend" : "change over time", "a date field and numeric measure support an ordered trend", [profile.dateColumns[0], profile.measures[0]], primary, "beginner");
  if (profile.dimensions.length && profile.measures.length) add("bar", primary === "cybersecurity" ? "event count by entity" : "category comparison", "a categorical dimension can be grouped against a numeric measure", [profile.dimensions[0], profile.measures[0]], primary, "beginner");
  if (profile.dimensions.length) add("donut", "composition", "a low-cardinality field can show part-to-whole share", [profile.dimensions[0]], primary, "beginner");
  if (profile.measures.length) {
    add("histogram", "distribution", "numeric observations can be binned without assumptions", [profile.measures[0]], primary, "beginner");
    add("box", "range and outliers", "quartiles and the interquartile rule expose spread and outliers", [profile.measures[0]], primary, "intermediate");
    add("kpi", "measured summary", "count, total, mean and completeness are directly computable", [profile.measures[0]], primary, "intermediate");
  }
  if (profile.measures.length >= 2) add("scatter", "measure relationship", "two numeric fields support a point-by-point relationship view", profile.measures.slice(0, 2), primary, "intermediate");
  if (profile.measures.length >= 3) add("heatmap", "correlation matrix", "three or more numeric fields support pairwise Pearson correlation", profile.measures.slice(0, 8), primary, "senior");
  if (has(h, /^(lat|latitude)$/i) && has(h, /^(lon|lng|longitude)$/i)) add("map", "coordinate field map", "latitude and longitude fields can be projected locally", [h.find((x) => /^(lat|latitude)$/.test(x)) ?? "latitude", h.find((x) => /^(lon|lng|longitude)$/.test(x)) ?? "longitude"], "geospatial", "intermediate");
  if (has(h, /(source|origin|from)/i) && has(h, /(target|destination|to)/i)) {
    add("sankey", "flow topology", "source and destination fields define directed flow", ["source", "target"], primary, "senior");
    add("network", "relationship graph", "source and destination values define nodes and edges", ["source", "target"], primary, "senior");
  }
  if (has(h, /(step|stage)/i)) add("funnel", "stage passage", "ordered stage labels can reveal drop-off", [h.find((x) => /(step|stage)/.test(x)) ?? "stage"], "behavioral", "intermediate");
  return out.slice(0, 12);
}

function quotedEvidence(rows: DataRow[], columns: ColumnProfile[]) {
  const evidence: string[] = [];
  for (const column of columns.slice(0, 4)) {
    const value = rows.find((r) => r[column.name] !== null)?.[column.name];
    if (value !== undefined) evidence.push(`“${column.name}” contains “${String(value).slice(0, 80)}” and was typed as ${column.type}`);
  }
  return evidence;
}

export function analyzeParsed(parsed: ParsedFile, fileCount = 1): Analysis {
  const profile = buildDatasetProfile(parsed.columns, parsed.rows, parsed.text);
  const quality = buildQualityReport(parsed.columns, parsed.rows, profile.columns);
  const domains = scoreDomains(profile);
  const { rank, reason } = assignRank(profile, fileCount);
  return { profile, quality, domains, rank, rankReason: reason, visuals: chooseVisuals(profile, domains, rank), evidence: quotedEvidence(parsed.rows, profile.columns) };
}

export function pearson(rows: DataRow[], a: string, b: string): number {
  const pairs = rows.map((r) => [toNumber(r[a] ?? null), toNumber(r[b] ?? null)]).filter((p): p is [number, number] => p[0] !== null && p[1] !== null);
  if (pairs.length < 3) return 0;
  const ma = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
  const mb = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
  const top = pairs.reduce((s, p) => s + (p[0] - ma) * (p[1] - mb), 0);
  const bottom = Math.sqrt(pairs.reduce((s, p) => s + (p[0] - ma) ** 2, 0) * pairs.reduce((s, p) => s + (p[1] - mb) ** 2, 0));
  return bottom ? top / bottom : 0;
}

export function filterRows(rows: DataRow[], query: string, category?: { column: string; value: string }, range?: { column: string; min: number; max: number }) {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (q && !Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(q))) return false;
    if (category && String(row[category.column] ?? "") !== category.value) return false;
    if (range) {
      const value = toNumber(row[range.column] ?? null);
      if (value === null || value < range.min || value > range.max) return false;
    }
    return true;
  });
}

export function findMergeKeys(left: Analysis, right: Analysis) {
  return left.profile.columns.flatMap((a) => right.profile.columns
    .filter((b) => a.name.toLowerCase() === b.name.toLowerCase() && a.type === b.type)
    .map((b) => ({ left: a.name, right: b.name, type: a.type })));
}

export function safeCell(value: DataCellValue) {
  return value === null ? "—" : String(value);
}

export function dateExtent(rows: DataRow[], column: string) {
  const times = rows.map((r) => toDate(r[column] ?? null)?.getTime()).filter((n): n is number => typeof n === "number");
  return times.length ? [Math.min(...times), Math.max(...times)] as const : null;
}