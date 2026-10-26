// asherin.knowledge — rows on this device.
//
// Two tables in the local store: one row per source (name, kind, status,
// counts) and one row per passage (content plus its offsets into the source).
// Everything is scoped to the device identity; nothing here leaves the browser.

import { supabase } from "@/integrations/supabase/client";
import { onTableChange } from "@/lib/local/db";
import { maskCredentials } from "@/lib/library/library";
import { sanitizeDisplayName } from "@/lib/file-security";
import { CHUNK, chunkText, cleanSourceText, type Chunk } from "./chunk";

export const SOURCES = "aureon_vault_sources";
export const CHUNKS = "aureon_vault_chunks";

export type SourceType = "text" | "file" | "url";
export type SourceStatus = "indexed" | "empty" | "failed";

export interface VaultSource {
  id: string;
  user_id: string;
  name: string;
  source_type: SourceType;
  status: SourceStatus;
  /** passages on this device (recounted from the chunks table on read). */
  chunk_count: number;
  char_count: number;
  /** how the text was read: plain text · pdf text layer · pdf ocr · ocr · docx · web page · web reader. */
  method: string | null;
  /** the address for a url source, the file name for a file source. */
  origin: string | null;
  truncated: boolean;
  error_message: string | null;
  created_at: string;
}

export interface VaultChunkRow {
  id: string;
  user_id: string;
  source_id: string;
  chunk_index: number;
  content: string;
  start: number;
  end: number;
  created_at: string;
}

const errText = (e: unknown, fallback: string) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : fallback);

/** sources newest first, with chunk counts recounted from what is on this device. */
export async function listSources(userId: string): Promise<{ sources: VaultSource[]; error: string | null }> {
  if (!userId) return { sources: [], error: "this device has no identity yet — reload the page" };
  const [s, c] = await Promise.all([
    supabase.from(SOURCES).select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from(CHUNKS).select("id,source_id").eq("user_id", userId),
  ]);
  if (s.error) return { sources: [], error: s.error.message };
  const counts = new Map<string, number>();
  for (const row of (c.data ?? []) as Array<{ source_id: string }>) counts.set(row.source_id, (counts.get(row.source_id) ?? 0) + 1);
  const sources = ((s.data ?? []) as Partial<VaultSource>[]).map((r) => normaliseSource(r, counts.get(String(r.id)) ?? 0));
  return { sources, error: null };
}

/** hosted-era rows had other kinds and statuses; they are read, never guessed at. */
export function normaliseSource(r: Partial<VaultSource> & Record<string, unknown>, localChunks: number): VaultSource {
  const kind = r.source_type === "text" || r.source_type === "file" || r.source_type === "url" ? r.source_type : "text";
  const legacy = r.method == null && localChunks === 0;
  let status: SourceStatus = r.status === "indexed" || r.status === "empty" || r.status === "failed" ? r.status : "indexed";
  let error = (r.error_message as string | null) ?? null;
  if (legacy && status === "indexed") {
    status = "failed";
    error = "indexed in the hosted era — its passages are not on this device. remove it and add the source again.";
  }
  return {
    id: String(r.id),
    user_id: String(r.user_id ?? ""),
    name: String(r.name ?? "untitled"),
    source_type: kind,
    status,
    chunk_count: localChunks,
    char_count: Number(r.char_count ?? 0),
    method: (r.method as string | null) ?? null,
    origin: (r.origin as string | null) ?? (typeof r.url === "string" ? r.url : null),
    truncated: r.truncated === true,
    error_message: error,
    created_at: String(r.created_at ?? new Date(0).toISOString()),
  };
}

export interface AddSourceInput {
  name: string;
  sourceType: SourceType;
  /** the text as read; credentials are masked here, before anything is stored. */
  text: string;
  method: string;
  origin?: string | null;
}

export interface AddSourceResult {
  source: VaultSource | null;
  chunks: number;
  error: string | null;
}

/**
 * Store one source and its passages. The text is masked, cleaned and cut on
 * this device; the row is written after the chunks so a half-written source
 * never shows as indexed.
 */
export async function addSource(userId: string, input: AddSourceInput): Promise<AddSourceResult> {
  if (!userId) return { source: null, chunks: 0, error: "this device has no identity yet — reload the page" };
  const name = sanitizeDisplayName(input.name).slice(0, 120) || "untitled";
  const { text, truncated } = cleanSourceText(maskCredentials(input.text));
  const chunks = text.trim() ? chunkText(text) : [];
  const status: SourceStatus = chunks.length ? "indexed" : "empty";
  const row: Omit<VaultSource, "id" | "created_at"> = {
    user_id: userId,
    name,
    source_type: input.sourceType,
    status,
    chunk_count: chunks.length,
    char_count: text.length,
    method: input.method,
    origin: input.origin ?? null,
    truncated,
    error_message: status === "empty" ? "no text to index — the source was read but held nothing" : null,
  };
  const ins = await supabase.from(SOURCES).insert(row).select("*").single();
  if (ins.error || !ins.data) return { source: null, chunks: 0, error: errText(ins.error, "the source could not be stored") };
  const source = normaliseSource(ins.data as Partial<VaultSource>, chunks.length);
  if (chunks.length) {
    const rows = chunks.map((c: Chunk) => ({
      user_id: userId,
      source_id: source.id,
      chunk_index: c.index,
      content: c.content,
      start: c.start,
      end: c.end,
    }));
    const put = await supabase.from(CHUNKS).insert(rows);
    if (put.error) {
      // nothing half-indexed: take the source row away again and say why.
      await supabase.from(SOURCES).delete().eq("id", source.id);
      return { source: null, chunks: 0, error: errText(put.error, "the passages could not be stored") };
    }
  }
  return { source, chunks: chunks.length, error: null };
}

/** remove a source and every passage of it; proven by a re-read. */
export async function deleteSource(userId: string, sourceId: string): Promise<{ removedChunks: number; error: string | null }> {
  const c = await supabase.from(CHUNKS).delete().eq("user_id", userId).eq("source_id", sourceId).select("id");
  if (c.error) return { removedChunks: 0, error: c.error.message };
  const s = await supabase.from(SOURCES).delete().eq("user_id", userId).eq("id", sourceId);
  if (s.error) return { removedChunks: 0, error: s.error.message };
  const check = await supabase.from(SOURCES).select("id").eq("id", sourceId).limit(1);
  if ((check.data ?? []).length) return { removedChunks: 0, error: "the source is still there — the store refused the delete" };
  return { removedChunks: (c.data ?? []).length, error: null };
}

/** every passage on this device for one identity, in source order. */
export async function listChunks(userId: string): Promise<{ chunks: VaultChunkRow[]; error: string | null }> {
  if (!userId) return { chunks: [], error: null };
  const { data, error } = await supabase.from(CHUNKS).select("*").eq("user_id", userId);
  if (error) return { chunks: [], error: error.message };
  const rows = ((data ?? []) as VaultChunkRow[]).slice();
  rows.sort((a, b) => a.source_id.localeCompare(b.source_id) || a.chunk_index - b.chunk_index);
  return { chunks: rows, error: null };
}

/** one passage with its neighbours, for the "open the passage" view. */
export async function getPassageContext(userId: string, sourceId: string, chunkIndex: number): Promise<{ before: string | null; passage: string | null; after: string | null }> {
  const { data } = await supabase
    .from(CHUNKS)
    .select("chunk_index,content")
    .eq("user_id", userId)
    .eq("source_id", sourceId)
    .in("chunk_index", [chunkIndex - 1, chunkIndex, chunkIndex + 1]);
  const rows = (data ?? []) as Array<{ chunk_index: number; content: string }>;
  const pick = (i: number) => rows.find((r) => Number(r.chunk_index) === i)?.content ?? null;
  return { before: pick(chunkIndex - 1), passage: pick(chunkIndex), after: pick(chunkIndex + 1) };
}

/** fires on any write to either table; used to drop the cached index and refresh lists. */
export function onVaultChange(cb: () => void): () => void {
  const a = onTableChange(SOURCES, cb);
  const b = onTableChange(CHUNKS, cb);
  return () => { a(); b(); };
}

export { CHUNK };
