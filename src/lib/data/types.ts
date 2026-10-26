// asherin.data — shared types.
// everything here describes data that lives on this device: parsed files,
// their profiles, the stored versions, and the shape of an answer.

export type DataCellValue = string | number | boolean | null;
export type DataRow = Record<string, DataCellValue>;

export type ColumnType = "number" | "integer" | "currency" | "percent" | "date" | "boolean" | "category" | "text" | "id" | "geo";

export interface ColumnProfile {
  name: string;
  type: ColumnType;
  /** 0-100, share of rows carrying a usable value. */
  completeness: number;
  missing: number;
  distinct: number;
  /** Share of non-empty values that do not parse as the dominant type (0-100). */
  typeDrift: number;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  stdDev?: number;
  p25?: number;
  p75?: number;
  /** Row indexes flagged by the interquartile-range rule. */
  outlierRows: number[];
  topValues: { value: string; count: number }[];
  sample: DataCellValue[];
}

export interface QualityReport {
  /** 0-100 composite. */
  score: number;
  rowCount: number;
  columnCount: number;
  duplicateRows: number[];
  duplicateCount: number;
  completeness: number;
  typeConsistency: number;
  outlierCount: number;
  issues: { severity: "high" | "medium" | "low"; message: string; column?: string }[];
}

export type PatternDomain =
  | "financial"
  | "behavioral"
  | "text"
  | "operational"
  | "temporal"
  | "geographic";

export interface DatasetProfile {
  columns: ColumnProfile[];
  domains: PatternDomain[];
  /** Columns the profiler believes carry the primary measures. */
  measures: string[];
  dimensions: string[];
  dateColumns: string[];
  rowCount: number;
}

export type ParsedKind = "table" | "document";

export interface ParsedFile {
  kind: ParsedKind;
  columns: string[];
  rows: DataRow[];
  /** Text extracted from documents, or a flattened rendering of the table. */
  text: string;
  /** Rows dropped or truncated during parsing, with the reason. */
  warnings: string[];
  method: string;
  truncated: boolean;
}

/* ── stored rows (indexeddb, this device only) ─────────────────────────── */

export interface DataSourceRow {
  id: string;
  workspace_id: string;
  name: string;
  kind: string;
  /** "url" for a public csv/json url the browser polls; null for a file. */
  connector: string | null;
  config: Record<string, unknown>;
  last_sync_at: string | null;
  last_sync_error: string | null;
  status: string;
  created_at: string;
}

export interface DataVersionRow {
  id: string;
  workspace_id: string;
  source_id: string;
  version: number;
  file_name: string | null;
  mime: string | null;
  byte_size: number;
  row_count: number;
  column_count: number;
  columns: string[];
  quality: QualityReport | Record<string, never>;
  profile: DatasetProfile | Record<string, never>;
  note: string | null;
  /** document sources keep their text here; tables keep rows in the kv store */
  text: string | null;
  created_at: string;
}

export interface DictionaryRow {
  id: string;
  source_id: string;
  column_name: string;
  inferred_type: string;
  definition: string;
  user_edited: boolean;
  updated_at: string;
}

export type Confidence = "high" | "moderate" | "low";

/* ── the question pipeline ─────────────────────────────────────────────── */

export type Aggregate = "sum" | "avg" | "count" | "min" | "max";

export interface PlanFilter {
  column: string;
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains";
  value: string | number;
}

/** a computation shepherd asks for; every field is checked against the real
 *  columns before it runs, and the arithmetic runs on this device. */
export interface QueryPlan {
  aggregate: Aggregate;
  measure: string | null;
  dimension: string | null;
  dateColumn: string | null;
  grain: "day" | "month" | "year" | null;
  filter: PlanFilter | null;
  limit: number;
}

export interface ComputedTable {
  columns: string[];
  rows: DataRow[];
  /** plain-english record of what was computed, e.g. "sum of revenue by region (top 12)" */
  note: string;
  /** rows that went into the computation after the filter */
  rowsUsed: number;
}

export interface ChartSpec {
  /** The renderable family the chart engine resolves to. */
  render:
    | "bar"
    | "grouped-bar"
    | "stacked-bar"
    | "line"
    | "area"
    | "scatter"
    | "bubble"
    | "pie"
    | "treemap"
    | "radar"
    | "histogram"
    | "box"
    | "heatmap"
    | "waterfall"
    | "funnel"
    | "sankey"
    | "kpi"
    | "gauge"
    | "sparkline"
    | "control"
    | "candlestick"
    | "slope"
    | "bullet"
    | "none";
  /** The analytical intent the chart serves; drives the render choice. */
  intent:
    | "comparison"
    | "trend"
    | "distribution"
    | "relationship"
    | "part-to-whole"
    | "flow"
    | "geographic"
    | "anomaly"
    | "model"
    | "summary";
  title: string;
  insight: string;
  sourceTag: string;
  quality?: number;
  confidence?: Confidence;
  x?: string;
  y?: string[];
  series?: string;
  data: Record<string, DataCellValue>[];
  /** Named token keys, resolved through the theme at render time. */
  colorRoles?: string[];
  /** Per-series colour overrides keyed by series name. */
  overrides?: Record<string, string>;
}

export interface AnswerBlocks {
  finding: string;
  evidence: string[];
  pattern: { name: string; domain: PatternDomain | string; explanation: string } | null;
  projection: string | null;
  clarification: string | null;
  confidence: Confidence;
  /** computed on this device, not reported by the model */
  confidence_drivers: {
    completeness: number;
    rows: number;
    computed: boolean;
    structured: boolean;
  };
  reasoning: {
    plan: string;
    grounding: string;
    model: string;
  };
  /** the deterministic table the answer was narrated from, if a plan ran */
  computed: ComputedTable | null;
  chart: ChartSpec | null;
}
