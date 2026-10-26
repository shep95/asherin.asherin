// asherin.extract — rows and blobs, all on this device.
//
// Two tables in the local store (`scrapper_sessions`, `scrapper_files`) and
// one blob bucket (`scrapper-uploads`). The hosted edition kept the session
// totals with a database trigger and removed child rows with a cascade; the
// local store has neither, so both are done here, explicitly.

import { supabase } from "@/integrations/supabase/client";
import { uuid } from "@/lib/local/db";
import type { ExtractResult } from "./extract";

export const SESSIONS = "scrapper_sessions";
export const FILES = "scrapper_files";
export const BUCKET = "scrapper-uploads";

export interface ScrapperSession {
  id: string;
  user_id: string;
  name: string;
  total_files: number;
  total_text_length: number;
  created_at: string;
  updated_at: string;
}

/**
 * queued      stored, waiting for the pass (legacy rows say "uploaded")
 * extracting  the pass is running on this device right now
 * completed   text is on the row
 * empty       read fine, held no text
 * unsupported no reader for this kind on a device
 * failed      the reader threw; `error` says why; retry is offered
 */
export type FileStatus = "queued" | "extracting" | "completed" | "empty" | "unsupported" | "failed";

export interface ScrapperFile {
  id: string;
  session_id: string;
  user_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  storage_path: string;
  extracted_text: string | null;
  status: FileStatus;
  method: string | null;
  error: string | null;
  truncated: boolean;
  text_chars: number;
  created_at: string;
}

const msg = (e: { message?: string } | null | undefined, fallback: string) => e?.message || fallback;

/** legacy rows (hosted era) said "uploaded"; a stale "extracting" is a pass a reload interrupted. */
export function normaliseStatus(raw: unknown): FileStatus {
  switch (raw) {
    case "completed":
    case "empty":
    case "unsupported":
    case "failed":
      return raw;
    case "extracting":
      return "extracting";
    default:
      return "queued";
  }
}

function rowToFile(r: Record<string, unknown>): ScrapperFile {
  const text = typeof r.extracted_text === "string" ? r.extracted_text : null;
  return {
    id: String(r.id),
    session_id: String(r.session_id),
    user_id: String(r.user_id ?? ""),
    file_name: String(r.file_name ?? "file"),
    file_size: Number(r.file_size ?? 0),
    file_type: String(r.file_type ?? ""),
    storage_path: String(r.storage_path ?? ""),
    extracted_text: text,
    status: normaliseStatus(r.status),
    method: typeof r.method === "string" ? r.method : null,
    error: typeof r.error === "string" ? r.error : null,
    truncated: r.truncated === true,
    text_chars: typeof r.text_chars === "number" ? r.text_chars : text?.length ?? 0,
    created_at: String(r.created_at ?? new Date(0).toISOString()),
  };
}

function rowToSession(r: Record<string, unknown>): ScrapperSession {
  return {
    id: String(r.id),
    user_id: String(r.user_id ?? ""),
    name: String(r.name ?? "session"),
    total_files: Number(r.total_files ?? 0),
    total_text_length: Number(r.total_text_length ?? 0),
    created_at: String(r.created_at ?? new Date(0).toISOString()),
    updated_at: String(r.updated_at ?? r.created_at ?? new Date(0).toISOString()),
  };
}

/* ───────────────────────── sessions ───────────────────────── */

export async function listSessions(userId: string): Promise<{ sessions: ScrapperSession[]; error: string | null }> {
  const { data, error } = await supabase.from(SESSIONS).select("*").eq("user_id", userId);
  if (error) return { sessions: [], error: msg(error, "the local store could not be read") };
  const sessions = ((data ?? []) as Record<string, unknown>[]).map(rowToSession);
  sessions.sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0));
  return { sessions, error: null };
}

export async function createSession(userId: string, name: string): Promise<{ session: ScrapperSession | null; error: string | null }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(SESSIONS)
    .insert({ user_id: userId, name, total_files: 0, total_text_length: 0, created_at: now, updated_at: now })
    .select()
    .single();
  if (error || !data) return { session: null, error: msg(error, "the session could not be saved") };
  return { session: rowToSession(data as Record<string, unknown>), error: null };
}

export async function renameSession(id: string, name: string): Promise<string | null> {
  const { error } = await supabase.from(SESSIONS).update({ name, updated_at: new Date().toISOString() }).eq("id", id);
  return error ? msg(error, "the name could not be saved") : null;
}

/** blobs first, then file rows, then the session row — nothing is left orphaned. */
export async function deleteSession(id: string): Promise<{ removedFiles: number; error: string | null }> {
  const { data: rows, error: listErr } = await supabase.from(FILES).select("storage_path").eq("session_id", id);
  if (listErr) return { removedFiles: 0, error: msg(listErr, "the session's files could not be listed") };
  const paths = ((rows ?? []) as { storage_path?: string }[]).map((r) => r.storage_path).filter((p): p is string => !!p);
  if (paths.length) {
    const { error: blobErr } = await supabase.storage.from(BUCKET).remove(paths);
    if (blobErr) return { removedFiles: 0, error: msg(blobErr, "the stored files could not be removed") };
  }
  const { error: filesErr } = await supabase.from(FILES).delete().eq("session_id", id);
  if (filesErr) return { removedFiles: 0, error: msg(filesErr, "the file rows could not be removed") };
  const { error } = await supabase.from(SESSIONS).delete().eq("id", id);
  if (error) return { removedFiles: 0, error: msg(error, "the session could not be removed") };
  return { removedFiles: paths.length, error: null };
}

/** totals the list shows: files in the session and characters extracted so far. */
export async function recomputeTotals(sessionId: string): Promise<ScrapperSession | null> {
  const { data } = await supabase.from(FILES).select("text_chars,extracted_text").eq("session_id", sessionId);
  const rows = (data ?? []) as { text_chars?: number; extracted_text?: string | null }[];
  const total_text_length = rows.reduce((n, r) => n + (typeof r.text_chars === "number" ? r.text_chars : r.extracted_text?.length ?? 0), 0);
  const patch = { total_files: rows.length, total_text_length, updated_at: new Date().toISOString() };
  const { data: updated } = await supabase.from(SESSIONS).update(patch).eq("id", sessionId).select().single();
  return updated ? rowToSession(updated as Record<string, unknown>) : null;
}

/* ───────────────────────── files ───────────────────────── */

export async function listFiles(sessionId: string): Promise<{ files: ScrapperFile[]; error: string | null }> {
  const { data, error } = await supabase.from(FILES).select("*").eq("session_id", sessionId).order("created_at", { ascending: true });
  if (error) return { files: [], error: msg(error, "the session's files could not be read") };
  return { files: ((data ?? []) as Record<string, unknown>[]).map(rowToFile), error: null };
}

export async function getFile(fileId: string): Promise<ScrapperFile | null> {
  const { data } = await supabase.from(FILES).select("*").eq("id", fileId).maybeSingle();
  return data ? rowToFile(data as Record<string, unknown>) : null;
}

/**
 * Store the bytes under a random path, then the row; the original name lives
 * on the row only. A kind no reader handles gets a row and a reason but no
 * blob, so a stray video never fills the store.
 */
export async function addFile(
  userId: string,
  sessionId: string,
  file: File,
  opts: { unsupported?: string } = {},
): Promise<{ file: ScrapperFile | null; error: string | null }> {
  let path = "";
  if (!opts.unsupported) {
    path = `${userId}/${sessionId}/${uuid()}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (upErr) return { file: null, error: msg(upErr, "the file could not be stored on this device") };
  }
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(FILES)
    .insert({
      user_id: userId,
      session_id: sessionId,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type || "application/octet-stream",
      storage_path: path,
      status: opts.unsupported ? "unsupported" : "queued",
      extracted_text: null,
      method: null,
      error: opts.unsupported ?? null,
      truncated: false,
      text_chars: 0,
      created_at: now,
    })
    .select()
    .single();
  if (error || !data) {
    if (path) await supabase.storage.from(BUCKET).remove([path]);
    return { file: null, error: msg(error, "the file row could not be saved") };
  }
  return { file: rowToFile(data as Record<string, unknown>), error: null };
}

export async function loadBlob(file: ScrapperFile): Promise<File | null> {
  if (!file.storage_path) return null;
  const { data } = await supabase.storage.from(BUCKET).download(file.storage_path);
  if (!data) return null;
  return new File([data], file.file_name, { type: file.file_type || data.type });
}

export async function markExtracting(fileId: string): Promise<void> {
  await supabase.from(FILES).update({ status: "extracting", error: null }).eq("id", fileId);
}

export async function saveExtraction(fileId: string, res: ExtractResult): Promise<ScrapperFile | null> {
  const patch = {
    status: res.status,
    extracted_text: res.status === "completed" ? res.text : null,
    text_chars: res.status === "completed" ? res.text.length : 0,
    method: res.method,
    error: res.error,
    truncated: res.truncated,
  };
  const { data } = await supabase.from(FILES).update(patch).eq("id", fileId).select().single();
  return data ? rowToFile(data as Record<string, unknown>) : null;
}

export async function deleteFile(file: ScrapperFile): Promise<string | null> {
  if (file.storage_path) {
    const { error: blobErr } = await supabase.storage.from(BUCKET).remove([file.storage_path]);
    if (blobErr) return msg(blobErr, "the stored file could not be removed");
  }
  const { error } = await supabase.from(FILES).delete().eq("id", file.id);
  return error ? msg(error, "the file row could not be removed") : null;
}
