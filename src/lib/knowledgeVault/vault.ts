// asherin.knowledge — the room's one entry point.
//
// Everything happens on this device: a source is read here (text, a file
// through the same readers asherin.extract uses, or a web page a browser is
// allowed to fetch), cut into passages, ranked lexically, and answered by
// shepherd with numbered citations that open the passage. There is no
// embedding model in this build and no server; the copy never says otherwise.
//
// This is document retrieval. Guardian Vault secrets never travel through here,
// and credential-shaped runs are masked before a passage is stored.

import { emitPull } from "@/lib/connect/emitPull";
import { extractFile, LIMITS as EXTRACT_LIMITS, type ExtractProgress } from "@/components/dashboard/scrapper/extract";
import { tokenize } from "./chunk";
import { LexicalIndex, type IndexedPassage } from "./retrieve";
import { addSource, listChunks, onVaultChange, type AddSourceResult, type VaultChunkRow } from "./store";
import { readWebPage, type WebReadResult } from "./web";
import { answerFromPassages, modelReady, type GroundedAnswer } from "./answer";

export interface VaultPassage {
  /** 1-based citation index — what the interface and the model both quote. */
  n: number;
  chunkId: string;
  chunkIndex: number;
  sourceId: string;
  sourceName: string;
  content: string;
  /** bm25 score relative to the best hit in this result, (0, 1]. */
  relevance: number;
  /** query stems found in the passage. */
  matched: string[];
}

export interface RetrieveResult {
  passages: VaultPassage[];
  /** pairs of citation indices whose claims point opposite ways. */
  contradictions: Array<{ a: number; b: number; reason: string }>;
  /** passages on this device at the time of the search. */
  indexed: number;
  error?: string;
}

/* ───────────────────────── index cache ───────────────────────── */

let cached: { userId: string; index: LexicalIndex } | null = null;
let unsubscribe: (() => void) | null = null;

function watchForChanges() {
  if (unsubscribe) return;
  unsubscribe = onVaultChange(() => { cached = null; });
}

async function loadIndex(userId: string): Promise<{ index: LexicalIndex; error: string | null }> {
  watchForChanges();
  if (cached && cached.userId === userId) return { index: cached.index, error: null };
  const { chunks, error } = await listChunks(userId);
  if (error) return { index: new LexicalIndex([]), error };
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.from("aureon_vault_sources").select("id,name").eq("user_id", userId);
  const names = new Map<string, string>();
  for (const r of (data ?? []) as Array<{ id: string; name: string }>) names.set(String(r.id), String(r.name ?? "untitled"));
  const passages: IndexedPassage[] = chunks.map((c: VaultChunkRow) => ({
    id: c.id,
    sourceId: c.source_id,
    sourceName: names.get(c.source_id) ?? "vault",
    content: c.content,
    chunkIndex: Number(c.chunk_index ?? 0),
  }));
  const index = new LexicalIndex(passages);
  cached = { userId, index };
  return { index, error: null };
}

/** drop the cached index (tests, or after a bulk change). */
export function resetVaultIndex(): void {
  cached = null;
}

/* ───────────────────────── retrieve ───────────────────────── */

/** top-k passages for a question, with a trace that carries titles only. never throws. */
export async function retrieveVault(userId: string, query: string, k = 8): Promise<RetrieveResult> {
  const q = query.trim();
  if (!q) return { passages: [], contradictions: [], indexed: 0 };
  const started = performance.now();
  try {
    const { index, error } = await loadIndex(userId);
    if (error) throw new Error(error);
    const hits = index.search(q, k);
    const passages: VaultPassage[] = hits.map((h, i) => ({
      n: i + 1,
      chunkId: h.id,
      chunkIndex: h.chunkIndex,
      sourceId: h.sourceId,
      sourceName: h.sourceName,
      content: h.content,
      relevance: h.relevance,
      matched: h.matched,
    }));
    void emitPull({
      organ: "knowledge-vault",
      capability: "retrieve",
      fromSurface: "knowledge-vault",
      status: passages.length ? "ok" : "skip",
      latencyMs: performance.now() - started,
      // titles only — passage bodies never leave as trace payload.
      quote: passages.length ? Array.from(new Set(passages.map((p) => p.sourceName))).slice(0, 3).join(", ") : q.slice(0, 60),
      meta: { hits: passages.length, indexed: index.size, ranking: "bm25" },
    });
    return { passages, contradictions: findContradictions(passages), indexed: index.size };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "retrieve failed";
    void emitPull({ organ: "knowledge-vault", capability: "retrieve", fromSurface: "knowledge-vault", status: "fail", latencyMs: performance.now() - started, quote: msg });
    return { passages: [], contradictions: [], indexed: 0, error: msg };
  }
}

/* ───────────────────────── contradictions ───────────────────────── */

/** words whose presence flips a claim. cheap, deterministic, no model call. */
const NEGATORS = /\b(not|never|no longer|cannot|can't|isn't|aren't|wasn't|won't|without|denies|denied|false|incorrect|refuted|contradicts)\b/i;

function contentWords(s: string): Set<string> {
  return new Set(tokenize(s).filter((w) => w.length > 3));
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const w of a) if (b.has(w)) hits++;
  return hits / Math.min(a.size, b.size);
}

/**
 * Flag passages from different sources that share a subject but disagree in
 * polarity. Conservative by design: a false "these agree" is worse than a
 * missed flag, so only strong overlap with opposite negation is reported.
 * It is a hint for the operator's eye, not a judgement.
 */
export function findContradictions(passages: VaultPassage[]): RetrieveResult["contradictions"] {
  const out: RetrieveResult["contradictions"] = [];
  for (let i = 0; i < passages.length; i++) {
    for (let j = i + 1; j < passages.length; j++) {
      const a = passages[i];
      const b = passages[j];
      if (a.sourceId === b.sourceId) continue;
      const overlap = overlapRatio(contentWords(a.content), contentWords(b.content));
      if (overlap < 0.35) continue;
      const negA = NEGATORS.test(a.content);
      const negB = NEGATORS.test(b.content);
      if (negA === negB) continue;
      out.push({ a: a.n, b: b.n, reason: `same subject, opposite polarity — ${a.sourceName} vs ${b.sourceName}` });
    }
  }
  return out.slice(0, 6);
}

/* ───────────────────────── highlight ───────────────────────── */

/** split a passage into segments, marking words that share a stem with the question. pure. */
export function highlightSegments(passage: string, query: string): Array<{ text: string; hit: boolean }> {
  const stems = Array.from(new Set(tokenize(query))).filter((s) => s.length >= 2);
  if (!stems.length || !passage) return [{ text: passage, hit: false }];
  const out: Array<{ text: string; hit: boolean }> = [];
  const re = /[A-Za-z0-9À-ɏ]+/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(passage))) {
    const word = m[0];
    const hit = tokenize(word).some((t) => stems.includes(t));
    if (!hit) continue;
    if (m.index > last) out.push({ text: passage.slice(last, m.index), hit: false });
    out.push({ text: word, hit: true });
    last = m.index + word.length;
  }
  if (last < passage.length) out.push({ text: passage.slice(last), hit: false });
  return out.length ? out : [{ text: passage, hit: false }];
}

/* ───────────────────────── ingest ───────────────────────── */

export const INGEST = {
  maxFileBytes: EXTRACT_LIMITS.maxFileBytes,
  maxFileLabel: "100 mb",
  accept: ".txt,.md,.markdown,.csv,.tsv,.json,.log,.html,.htm,.xml,.yaml,.yml,.rtf,.srt,.vtt,.pdf,.docx,.png,.jpg,.jpeg,.webp,.bmp,.gif,.tif,.tiff",
} as const;

function trace(kind: string, status: "ok" | "fail", started: number, quote: string, meta?: Record<string, unknown>) {
  void emitPull({ organ: "knowledge-vault", capability: "ingest", fromSurface: "knowledge-vault", status, latencyMs: performance.now() - started, quote, meta: { kind, ...(meta ?? {}) } });
}

/** pasted text → one source. */
export async function ingestText(userId: string, name: string, text: string): Promise<AddSourceResult> {
  const started = performance.now();
  const r = await addSource(userId, { name, sourceType: "text", text, method: "plain text" });
  trace("text", r.error ? "fail" : "ok", started, r.error ? `${name}: ${r.error}` : name, { chunks: r.chunks });
  return r;
}

/**
 * a file → one source, read with the same on-device readers asherin.extract
 * uses: pdf text layer (scans read optically, 20 pages), docx, photos of text,
 * plain text. the bytes are not kept; only the text and its passages are.
 */
export async function ingestFile(userId: string, file: File, onProgress?: (p: ExtractProgress) => void): Promise<AddSourceResult> {
  const started = performance.now();
  const name = file.name || "file";
  if (file.size > INGEST.maxFileBytes) {
    const error = `this file is ${(file.size / 1_048_576).toFixed(1)} mb and the limit is ${INGEST.maxFileLabel}`;
    trace("file", "fail", started, `${name}: ${error}`);
    return { source: null, chunks: 0, error };
  }
  const read = await extractFile(file, name, { onProgress });
  if (read.status !== "completed") {
    const error = read.error ?? (read.status === "empty" ? "the file held no text" : "the file could not be read here");
    trace("file", "fail", started, `${name}: ${error}`, { status: read.status });
    return { source: null, chunks: 0, error };
  }
  const r = await addSource(userId, { name, sourceType: "file", text: read.text, method: read.method ?? "plain text", origin: name });
  trace("file", r.error ? "fail" : "ok", started, r.error ? `${name}: ${r.error}` : name, { chunks: r.chunks, method: read.method });
  return r;
}

export interface IngestWebResult extends AddSourceResult {
  read: WebReadResult;
}

/** a web page → one source. `viaReader` is the operator's per-page consent to use r.jina.ai. */
export async function ingestWeb(userId: string, name: string, url: string, viaReader: boolean): Promise<IngestWebResult> {
  const started = performance.now();
  const read = await readWebPage(url, viaReader);
  if (!read.ok) {
    trace("url", "fail", started, `${name || url}: ${read.error ?? "could not read"}`, { failure: read.failure, viaReader });
    return { source: null, chunks: 0, error: read.error ?? "the page could not be read", read };
  }
  const title = name.trim() || read.title || url.replace(/^https?:\/\//, "").slice(0, 80);
  const r = await addSource(userId, { name: title, sourceType: "url", text: read.text, method: read.method ?? "web page", origin: url });
  trace("url", r.error ? "fail" : "ok", started, r.error ? `${title}: ${r.error}` : title, { chunks: r.chunks, method: read.method });
  return { ...r, read };
}

/* ───────────────────────── answer ───────────────────────── */

/** retrieve, then ask shepherd to answer from the passages with [n] cites. never throws. */
export async function askVault(userId: string, question: string, k = 8): Promise<{ retrieved: RetrieveResult; answer: GroundedAnswer }> {
  const retrieved = await retrieveVault(userId, question, k);
  if (retrieved.error) return { retrieved, answer: { text: "", cited: [], error: retrieved.error } };
  const started = performance.now();
  const answer = await answerFromPassages(question, retrieved.passages);
  void emitPull({
    organ: "knowledge-vault",
    capability: "answer",
    fromSurface: "knowledge-vault",
    status: answer.error ? (retrieved.passages.length ? "fail" : "skip") : "ok",
    latencyMs: performance.now() - started,
    quote: answer.error ?? `${answer.cited.length} of ${retrieved.passages.length} passages cited`,
    meta: { cited: answer.cited.length, passages: retrieved.passages.length },
  });
  return { retrieved, answer };
}

/**
 * For chat: a short numbered brief of the best passages, or "" when the
 * corpus has nothing relevant. Chat is told to cite as [k1]…[kn] so vault
 * cites never collide with web source numbers. Not wired yet — see the
 * Dashboard.tsx patch in docs/narratives/asherin.knowledge.md.
 */
export async function composeKnowledgeContext(userId: string, query: string, k = 4): Promise<{ brief: string; passages: VaultPassage[] }> {
  const r = await retrieveVault(userId, query, k);
  const strong = r.passages.filter((p) => p.matched.length >= 2 || p.relevance >= 0.6);
  if (r.error || !strong.length) return { brief: "", passages: [] };
  const lines = strong.map((p) => `[k${p.n}] ${p.sourceName}: ${p.content.slice(0, 700)}`);
  const brief = [
    "passages from the operator's own documents (asherin.knowledge). when you use one, cite it as [k<n>] exactly; do not cite what you did not use.",
    ...lines,
  ].join("\n");
  return { brief, passages: strong };
}

export { modelReady, answerFromPassages, type GroundedAnswer };
export { listSources, deleteSource, getPassageContext, onVaultChange, type VaultSource } from "./store";
export type { ExtractProgress };
