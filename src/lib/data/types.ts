// asherin.data — shared types for the data intelligence platform.

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

export interface DataSourceRow {
  id: string;
  workspace_id: string;
  name: string;
  kind: string;
  connector: string | null;
  config: Record<string, unknown>;
  sync_cadence: string;
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
  storage_path: string | null;
  file_name: string | null;
  mime: string | null;
  byte_size: number;
  row_count: number;
  column_count: number;
  quality: QualityReport | Record<string, never>;
  profile: DatasetProfile | Record<string, never>;
  note: string | null;
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

export type Confidence = "very high" | "high" | "moderate" | "low";

export interface AnswerCitation {
  chunk_id?: string;
  source_id?: string;
  source_name?: string;
  columns?: string[];
  row_range?: [number, number];
  excerpt?: string;
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
  confidence_drivers: {
    completeness: number;
    sample_size: number;
    signal_clarity: number;
    independent_points: number;
  };
  reasoning: {
    domains_activated: string[];
    retrieval: string;
    weighting: string;
    alternatives: string[];
  };
  citations: AnswerCitation[];
  chart: ChartSpec | null;
}
