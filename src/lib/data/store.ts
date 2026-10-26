// asherin.data — the room's store. everything lives in this device's indexeddb:
// workspaces, sources, versions, the dictionary, the question log, alert rules
// and events, and reports sit in the local tables (src/lib/local/postgrest.ts);
// a version's rows sit as one record in the kv store so a 50,000-row table is
// one write and one read, not fifty thousand.

import { supabase } from "@/integrations/supabase/client";
import { kvDel, kvGet, kvSet } from "@/lib/local/db";
import type {
  AnswerBlocks, DataRow, DataSourceRow, DataVersionRow, DatasetProfile, DictionaryRow, QualityReport,
} from "./types";

export const T = {
  workspaces: "data_workspaces",
  sources: "data_sources",
  versions: "data_versions",
  dictionary: "data_dictionary",
  queries: "data_queries",
  alertRules: "data_alert_rules",
  alertEvents: "data_alert_events",
  reports: "data_reports",
} as const;

export const rowsKey = (versionId: string) => `azplen/rows/${versionId}`;

export interface Workspace {
  id: string;
  owner_id: string;
  name: string;
  instructions: string;
  theme: { id?: string } | null;
  created_at: string;
}

export interface QueryLogRow {
  id: string;
  workspace_id: string;
  source_id: string | null;
  question: string;
  finding: string;
  confidence: string;
  created_at: string;
}

export type AlertKind = "threshold" | "change" | "anomaly";

export interface AlertRuleRow {
  id: string;
  workspace_id: string;
  source_id: string;
  name: string;
  kind: AlertKind;
  spec: { metric: string; aggregate: "sum" | "avg"; operator: ">" | "<" | "change>" | "change<"; threshold: number; sigma: number };
  active: boolean;
  created_at: string;
}

export interface AlertEventRow {
  id: string;
  workspace_id: string;
  rule_id: string;
  version_id: string;
  message: string;
  metric: string;
  value: number;
  created_at: string;
}

export interface ReportRow {
  id: string;
  workspace_id: string;
  source_id: string | null;
  name: string;
  template: string;
  markdown: string;
  created_at: string;
}

type Err = { message?: string } | null;
const msg = (e: Err, fallback: string) => (e?.message ? e.message.replace(/^[A-Z]/, (m) => m.toLowerCase()) : fallback);
const fail = (e: Err, fallback: string): never => { throw new Error(msg(e, fallback)); };

/* ── workspaces ────────────────────────────────────────────────────────── */

export async function listWorkspaces(): Promise<Workspace[]> {
  const { data, error } = await supabase.from(T.workspaces).select("*").order("created_at", { ascending: true });
  if (error) fail(error, "the workspaces could not be read");
  return (data ?? []) as Workspace[];
}

export async function createWorkspace(name: string): Promise<Workspace> {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from(T.workspaces)
    .insert({ owner_id: auth.user?.id ?? "device", name: name.trim().slice(0, 120) || "my workspace", instructions: "", theme: { id: "asherin" } })
    .select("*")
    .single();
  if (error || !data) fail(error, "the workspace could not be created");
  return data as Workspace;
}

export async function updateWorkspace(id: string, patch: Partial<Pick<Workspace, "name" | "instructions" | "theme">>): Promise<void> {
  const { error } = await supabase.from(T.workspaces).update(patch).eq("id", id);
  if (error) fail(error, "the workspace could not be saved");
}

/* ── sources and versions ──────────────────────────────────────────────── */

export async function listSources(workspaceId: string): Promise<DataSourceRow[]> {
  const { data, error } = await supabase.from(T.sources).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
  if (error) fail(error, "the sources could not be read");
  return (data ?? []) as DataSourceRow[];
}

export async function listVersions(sourceId: string): Promise<DataVersionRow[]> {
  const { data, error } = await supabase.from(T.versions).select("*").eq("source_id", sourceId).order("version", { ascending: false });
  if (error) fail(error, "the versions could not be read");
  return (data ?? []) as DataVersionRow[];
}

export async function listWorkspaceVersions(workspaceId: string): Promise<Record<string, DataVersionRow[]>> {
  const { data, error } = await supabase.from(T.versions).select("*").eq("workspace_id", workspaceId).order("version", { ascending: false });
  if (error) fail(error, "the versions could not be read");
  const map: Record<string, DataVersionRow[]> = {};
  for (const v of (data ?? []) as DataVersionRow[]) (map[v.source_id] ??= []).push(v);
  return map;
}

export interface IngestInput {
  workspace_id: string;
  /** new version of an existing source when set */
  source_id?: string;
  source_name?: string;
  kind: "table" | "document";
  file_name?: string | null;
  mime?: string | null;
  byte_size?: number;
  columns: string[];
  rows: DataRow[];
  text?: string;
  quality: QualityReport;
  profile: DatasetProfile;
  note?: string;
  connector?: string | null;
  config?: Record<string, unknown>;
}

export interface IngestResult { source_id: string; version_id: string; version: number; rows_stored: number }

/** stores one version: the rows as one kv record, the version row, the source
 *  row (created or touched), and the dictionary entries for new columns. the
 *  rows are written first so a version row never points at nothing. */
export async function ingest(input: IngestInput): Promise<IngestResult> {
  const now = new Date().toISOString();
  let sourceId = input.source_id ?? null;
  const name = (input.source_name ?? input.file_name ?? "source").trim().slice(0, 120) || "source";

  if (!sourceId) {
    const { data, error } = await supabase.from(T.sources).insert({
      workspace_id: input.workspace_id,
      name,
      kind: input.kind,
      connector: input.connector ?? null,
      config: input.config ?? {},
      last_sync_at: null,
      last_sync_error: null,
      status: "ready",
      created_at: now,
    }).select("*").single();
    if (error || !data) fail(error, "the source could not be created");
    sourceId = (data as DataSourceRow).id;
  }

  const existing = await listVersions(sourceId);
  const version = (existing[0]?.version ?? 0) + 1;

  const { data: vrow, error: verr } = await supabase.from(T.versions).insert({
    workspace_id: input.workspace_id,
    source_id: sourceId,
    version,
    file_name: input.file_name ?? null,
    mime: input.mime ?? null,
    byte_size: input.byte_size ?? 0,
    row_count: input.rows.length,
    column_count: input.columns.length,
    columns: input.columns,
    quality: input.quality,
    profile: input.profile,
    note: input.note ?? null,
    text: input.kind === "document" ? (input.text ?? "") : null,
    created_at: now,
  }).select("*").single();
  if (verr || !vrow) fail(verr, "the version could not be recorded");
  const versionId = (vrow as DataVersionRow).id;

  if (input.kind === "table") {
    try {
      await kvSet(rowsKey(versionId), input.rows);
    } catch (e) {
      await supabase.from(T.versions).delete().eq("id", versionId);
      throw new Error(`the rows could not be stored on this device${e instanceof Error && e.message ? ` (${e.message})` : ""}`);
    }
  }

  const { error: serr } = await supabase.from(T.sources).update({
    last_sync_at: now,
    last_sync_error: null,
    status: "ready",
    ...(input.connector ? { connector: input.connector } : {}),
    ...(input.config ? { config: input.config } : {}),
  }).eq("id", sourceId);
  if (serr) fail(serr, "the source could not be updated");

  await syncDictionary(sourceId, input.profile);

  return { source_id: sourceId, version_id: versionId, version, rows_stored: input.rows.length };
}

/** adds dictionary rows for columns that have none; existing definitions are
 *  kept, only the inferred type is refreshed. */
async function syncDictionary(sourceId: string, profile: DatasetProfile): Promise<void> {
  const current = await listDictionary(sourceId);
  const byName = new Map(current.map((d) => [d.column_name, d]));
  const now = new Date().toISOString();
  const inserts: Partial<DictionaryRow>[] = [];
  for (const c of profile.columns) {
    const hit = byName.get(c.name);
    if (hit) {
      if (hit.inferred_type !== c.type) await supabase.from(T.dictionary).update({ inferred_type: c.type }).eq("id", hit.id);
    } else {
      inserts.push({ source_id: sourceId, column_name: c.name, inferred_type: c.type, definition: "", user_edited: false, updated_at: now });
    }
  }
  if (inserts.length) {
    const { error } = await supabase.from(T.dictionary).insert(inserts);
    if (error) fail(error, "the dictionary could not be written");
  }
}

export async function loadVersionRows(versionId: string, limit?: number, offset = 0): Promise<DataRow[]> {
  const rows = await kvGet<DataRow[]>(rowsKey(versionId));
  if (!Array.isArray(rows)) throw new Error("the rows for this version are not on this device any more — upload the file again");
  return limit === undefined ? rows.slice(offset) : rows.slice(offset, offset + limit);
}

export async function renameSource(sourceId: string, name: string): Promise<void> {
  const { error } = await supabase.from(T.sources).update({ name: name.trim().slice(0, 120) }).eq("id", sourceId);
  if (error) fail(error, "the name could not be saved");
}

export async function markSyncError(sourceId: string, message: string): Promise<void> {
  await supabase.from(T.sources).update({ last_sync_error: message.slice(0, 300), status: "error" }).eq("id", sourceId);
}

/** rows first, then versions, dictionary, alert rules and their events, then
 *  the source row — nothing is left orphaned. */
export async function deleteSource(sourceId: string): Promise<void> {
  const versions = await listVersions(sourceId);
  for (const v of versions) await kvDel(rowsKey(v.id)).catch(() => undefined);
  const { error: verr } = await supabase.from(T.versions).delete().eq("source_id", sourceId);
  if (verr) fail(verr, "the versions could not be removed");
  await supabase.from(T.dictionary).delete().eq("source_id", sourceId);
  const { data: rules } = await supabase.from(T.alertRules).select("id").eq("source_id", sourceId);
  for (const r of (rules ?? []) as { id: string }[]) await supabase.from(T.alertEvents).delete().eq("rule_id", r.id);
  await supabase.from(T.alertRules).delete().eq("source_id", sourceId);
  const { error } = await supabase.from(T.sources).delete().eq("id", sourceId);
  if (error) fail(error, "the source could not be removed");
}

/* ── dictionary ────────────────────────────────────────────────────────── */

export async function listDictionary(sourceId: string): Promise<DictionaryRow[]> {
  const { data, error } = await supabase.from(T.dictionary).select("*").eq("source_id", sourceId).order("column_name");
  if (error) fail(error, "the dictionary could not be read");
  return (data ?? []) as DictionaryRow[];
}

export async function saveDefinition(id: string, definition: string): Promise<void> {
  const { error } = await supabase
    .from(T.dictionary)
    .update({ definition: definition.trim().slice(0, 1000), user_edited: true, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) fail(error, "the definition could not be saved");
}

/* ── question log ──────────────────────────────────────────────────────── */

export async function logQuery(workspaceId: string, sourceId: string | null, question: string, answer: AnswerBlocks): Promise<void> {
  await supabase.from(T.queries).insert({
    workspace_id: workspaceId,
    source_id: sourceId,
    question: question.slice(0, 1000),
    finding: answer.finding.slice(0, 2000),
    confidence: answer.confidence,
  });
}

export async function listQueries(workspaceId: string, limit = 15): Promise<QueryLogRow[]> {
  const { data, error } = await supabase.from(T.queries).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(limit);
  if (error) fail(error, "the question log could not be read");
  return (data ?? []) as QueryLogRow[];
}

/* ── alerts ────────────────────────────────────────────────────────────── */

export async function listAlertRules(workspaceId: string): Promise<AlertRuleRow[]> {
  const { data, error } = await supabase.from(T.alertRules).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
  if (error) fail(error, "the alert rules could not be read");
  return (data ?? []) as AlertRuleRow[];
}

export async function createAlertRule(rule: Omit<AlertRuleRow, "id" | "created_at" | "active">): Promise<AlertRuleRow> {
  const { data, error } = await supabase.from(T.alertRules).insert({ ...rule, active: true }).select("*").single();
  if (error || !data) fail(error, "the rule could not be saved");
  return data as AlertRuleRow;
}

export async function setAlertActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from(T.alertRules).update({ active }).eq("id", id);
  if (error) fail(error, "the rule could not be updated");
}

export async function deleteAlertRule(id: string): Promise<void> {
  await supabase.from(T.alertEvents).delete().eq("rule_id", id);
  const { error } = await supabase.from(T.alertRules).delete().eq("id", id);
  if (error) fail(error, "the rule could not be removed");
}

export async function listAlertEvents(workspaceId: string, limit = 25): Promise<AlertEventRow[]> {
  const { data, error } = await supabase.from(T.alertEvents).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(limit);
  if (error) fail(error, "the alert events could not be read");
  return (data ?? []) as AlertEventRow[];
}

/** one event per rule per version: checking twice never fires twice. */
export async function recordAlertEvent(ev: Omit<AlertEventRow, "id" | "created_at">): Promise<boolean> {
  const { data } = await supabase.from(T.alertEvents).select("id").eq("rule_id", ev.rule_id).eq("version_id", ev.version_id).limit(1);
  if ((data ?? []).length) return false;
  const { error } = await supabase.from(T.alertEvents).insert(ev);
  if (error) fail(error, "the alert could not be recorded");
  return true;
}

/* ── reports ───────────────────────────────────────────────────────────── */

export async function listReports(workspaceId: string, limit = 20): Promise<ReportRow[]> {
  const { data, error } = await supabase.from(T.reports).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(limit);
  if (error) fail(error, "the reports could not be read");
  return (data ?? []) as ReportRow[];
}

export async function saveReport(report: Omit<ReportRow, "id" | "created_at">): Promise<ReportRow> {
  const { data, error } = await supabase.from(T.reports).insert(report).select("*").single();
  if (error || !data) fail(error, "the report could not be saved");
  return data as ReportRow;
}

export async function deleteReport(id: string): Promise<void> {
  const { error } = await supabase.from(T.reports).delete().eq("id", id);
  if (error) fail(error, "the report could not be removed");
}
