// Library ingest + recall.
//
// A folder that only stores things is a dump. Every add runs metadata capture
// and an extraction pass so the file becomes findable by its CONTENT, and every
// add / recall writes one Connect trace (filename only — never file contents).

import { supabase } from "@/integrations/supabase/client";
import { emitPull, maskQuote } from "@/lib/connect/emitPull";
import { validateFile, buildStoragePath, sanitizeDisplayName } from "@/lib/file-security";

export type TextStatus = "pending" | "ok" | "empty" | "unsupported" | "failed";

export interface LibraryFile {
  id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  storage_path: string;
  created_at: string;
  project_id: string | null;
  text_status: TextStatus;
  text_chars: number;
  extracted_text?: string | null;
  folder?: string | null;
}

const SELECT_COLS =
  "id,file_name,file_size,file_type,storage_path,created_at,project_id,text_status,text_chars,folder";

export async function listLibrary(userId: string, projectId?: string | null): Promise<LibraryFile[]> {
  let q = supabase.from("library_files").select(SELECT_COLS).eq("user_id", userId);
  if (projectId) q = q.eq("project_id", projectId);
  const { data } = await q.order("created_at", { ascending: false }).limit(500);
  return (data ?? []) as unknown as LibraryFile[];
}

export interface IngestResult {
  file: LibraryFile | null;
  error?: string;
}

/**
 * Upload one file: validate → store under a uuid path → row → extraction.
 * Extraction runs after the row exists so the file is usable immediately and
 * upgrades to searchable when the pass returns.
 */
export async function ingestFile(
  userId: string,
  file: File,
  projectId: string | null,
  onUpdate?: (f: LibraryFile) => void,
): Promise<IngestResult> {
  const started = performance.now();
  const displayName = sanitizeDisplayName(file.name);

  const validation = await validateFile(file);
  if (!validation.valid) {
    void emitPull({
      organ: "library", capability: "ingest", fromSurface: "library", status: "fail",
      latencyMs: performance.now() - started, quote: displayName,
      meta: { reason: validation.error ?? "rejected", project_id: projectId ?? "" },
    });
    return { file: null, error: validation.error ?? "File rejected" };
  }

  const path = buildStoragePath(userId, file.name);
  const { error: uploadErr } = await supabase.storage.from("library").upload(path, file);
  if (uploadErr) {
    void emitPull({
      organ: "library", capability: "ingest", fromSurface: "library", status: "fail",
      latencyMs: performance.now() - started, quote: displayName,
      meta: { reason: "storage", project_id: projectId ?? "" },
    });
    return { file: null, error: uploadErr.message };
  }

  const { data: row, error: rowErr } = await supabase.from("library_files").insert({
    user_id: userId,
    file_name: displayName,
    file_size: file.size,
    file_type: file.type || "application/octet-stream",
    storage_path: path,
    project_id: projectId,
  } as never).select(SELECT_COLS).single();

  if (rowErr || !row) {
    await supabase.storage.from("library").remove([path]);
    return { file: null, error: rowErr?.message ?? "Could not record file" };
  }

  const created = row as unknown as LibraryFile;

  void emitPull({
    organ: "library", capability: "ingest", fromSurface: "library", status: "ok",
    latencyMs: performance.now() - started, quote: displayName,
    meta: { bytes: file.size, mime: created.file_type, project_id: projectId ?? "" },
  });

  // Extraction is a follow-on pass — a failure here never fails the upload.
  void (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("library-extract", {
        body: { fileId: created.id },
      });
      const status = (error ? "failed" : (data?.status as TextStatus)) ?? "failed";
      const chars = Number(data?.chars ?? 0);
      onUpdate?.({ ...created, text_status: status, text_chars: chars });
      void emitPull({
        organ: "file-scrapper", capability: "extract", fromSurface: "library",
        status: status === "ok" ? "ok" : "skip",
        quote: displayName, meta: { chars, text_status: status, project_id: projectId ?? "" },
      });
    } catch {
      onUpdate?.({ ...created, text_status: "failed", text_chars: 0 });
    }
  })();

  return { file: created };
}

export interface LibraryHit extends LibraryFile {
  /** Matched passage, masked. Null when only the filename matched. */
  snippet: string | null;
}

/** Name + full-text recall. Returns a jump-to passage for content hits. */
export async function searchLibrary(
  userId: string,
  query: string,
  projectId?: string | null,
): Promise<LibraryHit[]> {
  const q = query.trim();
  if (!q) return [];
  const started = performance.now();

  let sel = supabase
    .from("library_files")
    .select(`${SELECT_COLS},extracted_text`)
    .eq("user_id", userId)
    .or(`file_name.ilike.%${q.replace(/[%,]/g, "")}%,extracted_text.ilike.%${q.replace(/[%,]/g, "")}%`)
    .limit(40);
  if (projectId) sel = sel.eq("project_id", projectId);

  const { data, error } = await sel;

  const rows = (data ?? []) as unknown as (LibraryFile & { extracted_text: string | null })[];
  const hits: LibraryHit[] = rows.map((r) => {
    const body = r.extracted_text ?? "";
    const idx = body.toLowerCase().indexOf(q.toLowerCase());
    const snippet = idx >= 0
      ? maskQuote(body.slice(Math.max(0, idx - 90), idx + 130))
      : null;
    const { extracted_text: _drop, ...rest } = r;
    return { ...(rest as LibraryFile), snippet };
  });

  void emitPull({
    organ: "library", capability: "retrieve", fromSurface: "library",
    status: error ? "fail" : hits.length ? "ok" : "skip",
    latencyMs: performance.now() - started,
    quote: hits.length ? hits[0].file_name : q,
    meta: { hits: hits.length, project_id: projectId ?? "" },
  });

  return hits;
}

export async function assignProject(fileId: string, projectId: string | null): Promise<void> {
  await supabase.from("library_files").update({ project_id: projectId } as never).eq("id", fileId);
  void emitPull({
    organ: "library", capability: "scope", fromSurface: "library", status: "ok",
    meta: { project_id: projectId ?? "none" },
  });
}

export async function deleteLibraryFile(file: LibraryFile): Promise<void> {
  await supabase.storage.from("library").remove([file.storage_path]);
  await supabase.from("library_files").delete().eq("id", file.id);
  void emitPull({
    organ: "library", capability: "delete", fromSurface: "library", status: "ok",
    quote: file.file_name,
  });
}

export async function retryExtract(file: LibraryFile): Promise<TextStatus> {
  try {
    const { data, error } = await supabase.functions.invoke("library-extract", {
      body: { fileId: file.id },
    });
    const status = (error ? "failed" : (data?.status as TextStatus)) ?? "failed";
    void emitPull({
      organ: "file-scrapper", capability: "extract", fromSurface: "library",
      status: status === "ok" ? "ok" : "skip", quote: file.file_name,
      meta: { chars: Number(data?.chars ?? 0), text_status: status },
    });
    return status;
  } catch {
    return "failed";
  }
}
