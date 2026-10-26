// Library ingest + recall — all on this device.
//
// A folder that only stores things is a dump. Every add runs validation and an
// extraction pass so the file becomes findable by its CONTENT, and every add /
// recall writes one Connect trace (filename only — never file contents). The
// blob lives in the local blob store, the row in the local table store; nothing
// here leaves the device.

import { supabase } from "@/integrations/supabase/client";
import { emitPull, maskQuote } from "@/lib/connect/emitPull";
import { validateFile, buildStoragePath, sanitizeDisplayName } from "@/lib/file-security";

export type TextStatus = "pending" | "ok" | "empty" | "unsupported" | "failed" | "too_large";

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

/** one wording for every status, so the library and a project's files tab agree. */
export const TEXT_STATUS_LABEL: Record<TextStatus, string> = {
  pending: "reading…",
  ok: "searchable",
  empty: "no text found — stored, not searchable",
  unsupported: "stored — this format is not read as text",
  failed: "could not be read",
  too_large: "too large to read as text — stored, not searchable",
};

export const LIBRARY_TABLE = "library_files";
export const LIBRARY_BUCKET = "library";
/** rows read per list — the room shows the newest first and says when it is full. */
export const LIBRARY_LIST_LIMIT = 500;
/** most content hits returned per search. */
export const SEARCH_LIMIT = 40;

const SELECT_COLS =
  "id,file_name,file_size,file_type,storage_path,created_at,project_id,text_status,text_chars,folder";

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Newest first, optionally one project only. Throws on a store error so the
 * room can show "could not read the library" instead of a false empty state.
 */
export async function listLibrary(userId: string, projectId?: string | null): Promise<LibraryFile[]> {
  let q = supabase.from(LIBRARY_TABLE).select(SELECT_COLS).eq("user_id", userId);
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(LIBRARY_LIST_LIMIT);
  if (error) throw new Error(lower(error.message));
  return (data ?? []) as unknown as LibraryFile[];
}

export interface IngestResult {
  file: LibraryFile | null;
  error?: string;
}

/**
 * Add one file: validate → store the blob under a uuid path → row → extraction.
 * Extraction runs after the row exists so the file is usable immediately and
 * upgrades to searchable when the pass returns (`onUpdate`).
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
    return { file: null, error: lower(validation.error ?? "file rejected") };
  }

  const path = buildStoragePath(userId, file.name);
  const { error: uploadErr } = await supabase.storage.from(LIBRARY_BUCKET).upload(path, file);
  if (uploadErr) {
    void emitPull({
      organ: "library", capability: "ingest", fromSurface: "library", status: "fail",
      latencyMs: performance.now() - started, quote: displayName,
      meta: { reason: "storage", project_id: projectId ?? "" },
    });
    return { file: null, error: lower(uploadErr.message) };
  }

  const { data: row, error: rowErr } = await supabase.from(LIBRARY_TABLE).insert({
    user_id: userId,
    file_name: displayName,
    file_size: file.size,
    file_type: file.type || "application/octet-stream",
    storage_path: path,
    project_id: projectId,
  } as never).select(SELECT_COLS).single();

  if (rowErr || !row) {
    await supabase.storage.from(LIBRARY_BUCKET).remove([path]);
    return { file: null, error: lower(rowErr?.message ?? "could not record the file") };
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
      const { status, chars } = await extractLocally(created, file);
      onUpdate?.({ ...created, text_status: status, text_chars: chars });
      void emitPull({
        organ: "file-scrapper", capability: "extract", fromSurface: "library",
        status: status === "ok" ? "ok" : "skip",
        quote: displayName, meta: { chars, text_status: status, project_id: projectId ?? "" },
      });
    } catch {
      await markStatus(created.id, "failed", 0);
      onUpdate?.({ ...created, text_status: "failed", text_chars: 0 });
    }
  })();

  return { file: created };
}

/**
 * A row left `pending` is a pass that never finished (the tab closed, the room
 * unmounted mid-read). Called once at mount, it re-reads those rows one at a
 * time so "reading…" is never a permanent state.
 */
export async function resumePendingExtraction(
  files: LibraryFile[],
  onUpdate: (f: LibraryFile) => void,
  isAlive: () => boolean = () => true,
): Promise<number> {
  let done = 0;
  for (const f of files) {
    if (f.text_status !== "pending") continue;
    if (!isAlive()) break;
    const status = await retryExtract(f);
    done++;
    if (isAlive()) onUpdate({ ...f, text_status: status.status, text_chars: status.chars });
  }
  return done;
}

export interface LibraryHit extends LibraryFile {
  /** Matched passage, masked. Null when only the filename matched. */
  snippet: string | null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** split a query into terms; every term must appear (in the name or the text). */
export function searchTerms(query: string): string[] {
  return Array.from(new Set(query.toLowerCase().split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 2))).slice(0, 8);
}

/** the masked passage around the first term that appears in `body`, or null. */
export function snippetFor(body: string, terms: string[]): string | null {
  if (!body) return null;
  for (const t of terms) {
    const m = new RegExp(escapeRe(t), "i").exec(body);
    if (m) {
      const start = Math.max(0, m.index - 90);
      return maskQuote(body.slice(start, m.index + 130));
    }
  }
  return null;
}

/**
 * Name + full-text recall, ranked: every term in the name first, then content
 * hits, newest first within each band. The match runs in this process over the
 * device's own rows — the query is never handed to a filter parser as text, so
 * punctuation in a query cannot change what is matched.
 */
export async function searchLibrary(
  userId: string,
  query: string,
  projectId?: string | null,
): Promise<LibraryHit[]> {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const started = performance.now();

  let sel = supabase.from(LIBRARY_TABLE).select(`${SELECT_COLS},extracted_text`).eq("user_id", userId);
  if (projectId) sel = sel.eq("project_id", projectId);
  const { data, error } = await sel.order("created_at", { ascending: false }).limit(LIBRARY_LIST_LIMIT);
  if (error) throw new Error(lower(error.message));

  const res = terms.map((t) => new RegExp(escapeRe(t), "i"));
  const rows = (data ?? []) as unknown as (LibraryFile & { extracted_text: string | null })[];
  const nameHits: LibraryHit[] = [];
  const bodyHits: LibraryHit[] = [];
  for (const r of rows) {
    const { extracted_text, ...rest } = r;
    const body = extracted_text ?? "";
    const inName = res.every((re) => re.test(r.file_name));
    const inBody = !inName && body.length > 0 && res.every((re) => re.test(r.file_name) || re.test(body));
    if (!inName && !inBody) continue;
    const hit: LibraryHit = { ...(rest as LibraryFile), snippet: snippetFor(body, terms) };
    (inName ? nameHits : bodyHits).push(hit);
    if (nameHits.length + bodyHits.length >= SEARCH_LIMIT) break;
  }
  const hits = [...nameHits, ...bodyHits].slice(0, SEARCH_LIMIT);

  void emitPull({
    organ: "library", capability: "retrieve", fromSurface: "library",
    status: hits.length ? "ok" : "skip",
    latencyMs: performance.now() - started,
    quote: hits.length ? hits[0].file_name : query,
    meta: { hits: hits.length, project_id: projectId ?? "" },
  });

  return hits;
}

/** move a file into a project (or out of every project). throws on a store error. */
export async function assignProject(fileId: string, projectId: string | null): Promise<void> {
  const { error } = await supabase.from(LIBRARY_TABLE).update({ project_id: projectId } as never).eq("id", fileId);
  if (error) throw new Error(lower(error.message));
  void emitPull({
    organ: "library", capability: "scope", fromSurface: "library", status: "ok",
    meta: { project_id: projectId ?? "none" },
  });
}

/**
 * Remove a file: the row first (so nothing can list it), then its blob, then a
 * re-read proves the row is gone. throws when the row is still there.
 */
export async function deleteLibraryFile(file: LibraryFile): Promise<void> {
  const { error } = await supabase.from(LIBRARY_TABLE).delete().eq("id", file.id);
  if (error) throw new Error(lower(error.message));
  await supabase.storage.from(LIBRARY_BUCKET).remove([file.storage_path]);
  const { data: still } = await supabase.from(LIBRARY_TABLE).select("id").eq("id", file.id).limit(1);
  if ((still ?? []).length) throw new Error("that file is still here — try again");
  void emitPull({
    organ: "library", capability: "delete", fromSurface: "library", status: "ok",
    quote: file.file_name,
  });
}

export interface OpenedFile {
  /** an object url for this tab only — revoke it when the preview closes. */
  url: string;
  blob: Blob;
  revoke: () => void;
}

/** the stored bytes of a file, as a blob and a tab-local url. null when the blob is missing. */
export async function openLibraryFile(file: LibraryFile): Promise<OpenedFile | null> {
  const { data: blob, error } = await supabase.storage.from(LIBRARY_BUCKET).download(file.storage_path);
  if (error || !blob) return null;
  const typed = blob.type ? blob : new Blob([blob], { type: file.file_type });
  const url = URL.createObjectURL(typed);
  return { url, blob: typed, revoke: () => URL.revokeObjectURL(url) };
}

/** the indexed (masked) text of a file, for the preview. "" when none. */
export async function loadExtractedText(fileId: string): Promise<string> {
  const { data } = await supabase.from(LIBRARY_TABLE).select("extracted_text").eq("id", fileId).maybeSingle();
  return String((data as { extracted_text?: string | null } | null)?.extracted_text ?? "");
}

export async function retryExtract(file: LibraryFile): Promise<{ status: TextStatus; chars: number }> {
  try {
    const { data: blob, error } = await supabase.storage.from(LIBRARY_BUCKET).download(file.storage_path);
    if (error || !blob) {
      await markStatus(file.id, "failed", 0);
      return { status: "failed", chars: 0 };
    }
    const result = await extractLocally(file, new File([blob], file.file_name, { type: file.file_type }));
    void emitPull({
      organ: "file-scrapper", capability: "extract", fromSurface: "library",
      status: result.status === "ok" ? "ok" : "skip", quote: file.file_name,
      meta: { chars: result.chars, text_status: result.status },
    });
    return result;
  } catch {
    await markStatus(file.id, "failed", 0);
    return { status: "failed", chars: 0 };
  }
}

/* ───────────────────────── on-device text extraction ───────────────────────── */

const TEXT_EXT = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "yaml", "yml", "xml", "html", "htm", "svg", "log",
  "js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "java", "kt", "c", "h", "cpp", "hpp", "cs",
  "sh", "bash", "zsh", "ps1", "sql", "toml", "ini", "cfg", "conf", "env", "properties", "rtf", "srt", "vtt", "ics",
]);

/** the most text indexed per file; the rest of the file is stored but not searched. */
export const MAX_TEXT_CHARS = 400_000;
/** bytes read from a text-like file: enough for MAX_TEXT_CHARS of utf-8, never the whole 500 mb. */
export const MAX_TEXT_BYTES = 2 * 1024 * 1024;
/** a pdf above this is stored but not parsed — pdf.js needs the whole buffer in memory. */
export const MAX_PDF_BYTES = 64 * 1024 * 1024;

/** read a blob as text; falls back to FileReader where Blob.text() is missing (older safari, jsdom). */
export function blobText(blob: Blob): Promise<string> {
  if (typeof (blob as Blob & { text?: unknown }).text === "function") return blob.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsText(blob);
  });
}

/** read a blob as bytes; same fallback as blobText. */
export function blobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof (blob as Blob & { arrayBuffer?: unknown }).arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsArrayBuffer(blob);
  });
}

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} b`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kb`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} mb`;
};

/** credential-shaped runs are masked before anything is indexed, so a pasted key never becomes searchable. */
export function maskCredentials(text: string): string {
  return text
    .replace(/\b(sk|rk|pk|gsk|xai|ghp|gho|glpat|xoxb|xoxp|AKIA)[-_][A-Za-z0-9_-]{16,}\b/g, "[masked key]")
    .replace(/\bAIza[0-9A-Za-z_-]{30,}\b/g, "[masked key]")
    .replace(/\b(bearer|token|api[_-]?key|secret|password|passwd)\s*[:=]\s*["']?[^\s"']{8,}/gi, "$1: [masked]")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[masked token]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[masked private key]");
}

async function pdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: await blobBytes(file) }).promise;
  const pages: string[] = [];
  let length = 0;
  for (let i = 1; i <= doc.numPages && length < MAX_TEXT_CHARS; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
    pages.push(text);
    length += text.length;
  }
  return pages.join("\n\n");
}

/** which reader a file gets, from its name and declared type. */
export function extractionKind(fileName: string, mime: string): "pdf" | "text" | "none" {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  const m = mime.toLowerCase();
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (m.startsWith("text/") || TEXT_EXT.has(ext) || m === "application/json" || m.endsWith("+json") || m.endsWith("+xml")) return "text";
  return "none";
}

/**
 * Read a file's text on this device, bounded. Text-like files are read from
 * their first MAX_TEXT_BYTES; pdfs up to MAX_PDF_BYTES are parsed in pdf.js's
 * worker; images, audio, video and binary formats are "unsupported" rather than
 * guessed at. Pure apart from the pdf.js import — the store is not touched.
 */
export async function readFileText(
  file: File,
  fileName = file.name,
  deps: { pdf?: (f: File) => Promise<string> } = {},
): Promise<{ status: TextStatus; text: string }> {
  const kind = extractionKind(fileName, file.type || "");
  if (kind === "none") return { status: "unsupported", text: "" };
  if (kind === "pdf" && file.size > MAX_PDF_BYTES) return { status: "too_large", text: "" };
  let text = "";
  try {
    text = kind === "pdf" ? await (deps.pdf ?? pdfText)(file) : await blobText(file.slice(0, MAX_TEXT_BYTES));
  } catch {
    return { status: "failed", text: "" };
  }
  text = maskCredentials(text).split("\u0000").join("").slice(0, MAX_TEXT_CHARS);
  if (!text.trim()) return { status: "empty", text: "" };
  return { status: "ok", text };
}

async function markStatus(id: string, status: TextStatus, chars: number, text: string | null = null): Promise<void> {
  await supabase
    .from(LIBRARY_TABLE)
    .update({ extracted_text: text, text_status: status, text_chars: chars } as never)
    .eq("id", id);
}

/** read the file's text and store it on the row so the library can find it by content. */
async function extractLocally(row: LibraryFile, file: File): Promise<{ status: TextStatus; chars: number }> {
  const { status, text } = await readFileText(file, row.file_name);
  const chars = status === "ok" ? text.length : 0;
  await markStatus(row.id, status, chars, status === "ok" ? text : null);
  return { status, chars };
}
