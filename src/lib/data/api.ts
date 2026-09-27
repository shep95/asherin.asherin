// asherin.data — client access layer.
// Every call is authenticated through the user's session; the workspace id is
// always sent and always re-checked on the server.

import { supabase } from "@/integrations/supabase/client";
import type {
  AnswerBlocks, DataRow, DataSourceRow, DataVersionRow, DictionaryRow, DatasetProfile, QualityReport,
} from "./types";

export interface Workspace {
  id: string;
  owner_id: string;
  name: string;
  instructions: string;
  theme: { id?: string } | null;
  memory: Record<string, unknown> | null;
  api_key_hash: string | null;
  created_at: string;
}

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    // Supabase surfaces the function's json body on a non-2xx as context.
    const ctx = (error as { context?: { body?: unknown } }).context?.body;
    let detail = "";
    if (typeof ctx === "string") {
      try { detail = JSON.parse(ctx)?.error ?? ""; } catch { detail = ctx; }
    }
    throw new Error(detail || error.message || "the request did not go through");
  }
  const payload = data as { error?: string } | null;
  if (payload && typeof payload === "object" && payload.error) throw new Error(payload.error);
  return data as T;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const { data, error } = await supabase
    .from("data_workspaces")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Workspace[];
}

export async function createWorkspace(name: string): Promise<Workspace> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("sign in first");
  const { data, error } = await supabase
    .from("data_workspaces")
    .insert({ owner_id: auth.user.id, name: name.trim().slice(0, 120) || "my workspace" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as Workspace;
}

export async function updateWorkspace(id: string, patch: Partial<Pick<Workspace, "name" | "instructions" | "theme" | "memory">>): Promise<void> {
  const { error } = await supabase.from("data_workspaces").update(patch as never).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listSources(workspaceId: string): Promise<DataSourceRow[]> {
  const { data, error } = await supabase
    .from("data_sources").select("*").eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DataSourceRow[];
}

export async function listVersions(sourceId: string): Promise<DataVersionRow[]> {
  const { data, error } = await supabase
    .from("data_versions").select("*").eq("source_id", sourceId)
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DataVersionRow[];
}

export async function listDictionary(sourceId: string): Promise<DictionaryRow[]> {
  const { data, error } = await supabase
    .from("data_dictionary").select("*").eq("source_id", sourceId).order("column_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DictionaryRow[];
}

export async function saveDefinition(id: string, definition: string): Promise<void> {
  const { error } = await supabase
    .from("data_dictionary")
    .update({ definition: definition.slice(0, 1000), user_edited: true, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function loadVersionRows(versionId: string, limit = 500, offset = 0): Promise<DataRow[]> {
  const { data, error } = await supabase
    .from("data_records").select("row").eq("version_id", versionId)
    .order("idx", { ascending: true }).range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => (d.row ?? {}) as DataRow);
}

export async function deleteSource(sourceId: string): Promise<void> {
  const { error } = await supabase.from("data_sources").delete().eq("id", sourceId);
  if (error) throw new Error(error.message);
}

export interface IngestResult {
  source_id: string;
  version_id: string;
  version: number;
  rows_stored: number;
  chunks: number;
  retrieval: "ready" | "unavailable";
  retrieval_note: string | null;
}

export function ingest(payload: {
  workspace_id: string;
  source_id?: string;
  source_name?: string;
  kind?: string;
  file_name?: string | null;
  mime?: string | null;
  byte_size?: number;
  storage_path?: string | null;
  columns: string[];
  rows: DataRow[];
  text?: string;
  quality?: QualityReport;
  profile?: DatasetProfile;
  note?: string;
  connector?: string | null;
}): Promise<IngestResult> {
  return invoke<IngestResult>("asherin-data-ingest", payload);
}

export function ask(workspaceId: string, question: string, sourceIds?: string[]): Promise<AnswerBlocks & { id: string | null; sampling: string }> {
  return invoke("asherin-data-ask", { workspace_id: workspaceId, question, source_ids: sourceIds });
}

export function runAlerts(workspaceId: string, ruleId?: string) {
  return invoke<{ evaluated: number; fired: number; events: { id: string; message: string; metric: string; value: number; created_at: string; rule: string }[] }>(
    "asherin-data-alerts", { workspace_id: workspaceId, rule_id: ruleId },
  );
}

export function generateReport(workspaceId: string, template: string, name?: string, schedule?: string, recipients?: string[]) {
  return invoke<{ report: { id: string; name: string; template: string; schedule: string; last_generated_at: string }; markdown: string }>(
    "asherin-data-report", { workspace_id: workspaceId, template, name, schedule, recipients },
  );
}

export interface ConnectorInfo { id: string; label: string; available: boolean; reason?: string; needs: string[] }

export function pullConnector(payload: {
  workspace_id: string; connector: string; config?: Record<string, unknown>; secret?: string;
  source_id?: string; name?: string; cadence?: string;
}) {
  return invoke<{ source_id: string; connector: string; columns: string[]; rows: DataRow[]; pulled_at: string }>(
    "asherin-data-sync", payload,
  );
}

export async function uploadOriginal(workspaceId: string, file: File): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `${auth.user.id}/${workspaceId}/${Date.now()}_${safe}`;
  const { error } = await supabase.storage.from("data-uploads").upload(path, file, { upsert: false });
  if (error) return null;
  return path;
}
