// Knowledge Vault — client-side RAG helpers.
//
// Discipline borrowed from the notebook-class tools: every answer that leans
// on the vault must be able to point at the exact passage it came from, and a
// passage that contradicts another passage is shown twice, not silently
// merged. Web reach stays an explicit second tool — never a silent mix.
//
// This is document RAG. Guardian Vault secrets never travel through here.

import { supabase } from "@/integrations/supabase/client";
import { emitPull } from "@/lib/connect/emitPull";

export type VaultMode = "isolated" | "hybrid";

const MODE_KEY = "asherin_vault_mode";

/** Isolated is the honest default: answer from the corpus or say unsure. */
export function getVaultMode(): VaultMode {
  if (typeof window === "undefined") return "isolated";
  return localStorage.getItem(MODE_KEY) === "hybrid" ? "hybrid" : "isolated";
}

export function setVaultMode(mode: VaultMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(MODE_KEY, mode);
  window.dispatchEvent(new CustomEvent("asherin:vault-mode", { detail: mode }));
}

export interface VaultPassage {
  /** 1-based citation index — what the UI and the model both quote. */
  n: number;
  sourceId: string;
  sourceName: string;
  content: string;
  similarity: number;
}

export interface RetrieveResult {
  passages: VaultPassage[];
  /** Pairs of citation indices whose claims point opposite ways. */
  contradictions: Array<{ a: number; b: number; reason: string }>;
  error?: string;
}

/** Words whose presence flips a claim. Cheap, deterministic, no model call. */
const NEGATORS = /\b(not|never|no longer|cannot|can't|isn't|aren't|wasn't|won't|without|denies|denied|false|incorrect|refuted|contradicts)\b/i;

function contentWords(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 4),
  );
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const w of a) if (b.has(w)) hits++;
  return hits / Math.min(a.size, b.size);
}

/**
 * Flag passages that talk about the same thing but disagree in polarity.
 * Conservative by design: a false "these agree" is worse than a missed flag,
 * so only strong topical overlap with opposite negation is reported.
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
      out.push({
        a: a.n,
        b: b.n,
        reason: `same subject, opposite claim — ${a.sourceName} vs ${b.sourceName}`,
      });
    }
  }
  return out.slice(0, 6);
}

/** Retrieve top-K passages and trace the pull. Never throws. */
export async function retrieveVault(query: string, k = 6): Promise<RetrieveResult> {
  const q = query.trim();
  if (!q) return { passages: [], contradictions: [] };
  const started = performance.now();
  try {
    const { data, error } = await supabase.functions.invoke("vault-retrieve", {
      body: { query: q, k },
    });
    if (error) throw error;
    const raw = (data as { matches?: Array<{ sourceId: string; sourceName: string; content: string; similarity: number }> })?.matches ?? [];
    const passages: VaultPassage[] = raw.map((m, i) => ({
      n: i + 1,
      sourceId: m.sourceId,
      sourceName: m.sourceName || "vault",
      content: m.content ?? "",
      similarity: typeof m.similarity === "number" ? m.similarity : 0,
    }));
    void emitPull({
      organ: "knowledge-vault",
      capability: "retrieve",
      fromSurface: "knowledge-vault",
      status: passages.length ? "ok" : "skip",
      latencyMs: performance.now() - started,
      // Titles only — passage bodies never leave as trace payload.
      quote: passages.length ? passages.map((p) => p.sourceName).slice(0, 3).join(", ") : q.slice(0, 60),
      meta: { hits: passages.length, mode: getVaultMode() },
    });
    return { passages, contradictions: findContradictions(passages) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "retrieve failed";
    void emitPull({
      organ: "knowledge-vault",
      capability: "retrieve",
      fromSurface: "knowledge-vault",
      status: "fail",
      latencyMs: performance.now() - started,
      quote: msg,
    });
    return { passages: [], contradictions: [], error: msg };
  }
}

export interface IngestPayload {
  name: string;
  sourceType: "text" | "file" | "api" | "url" | "youtube";
  content?: string;
  url?: string;
  apiUrl?: string;
  apiHeaders?: Record<string, string>;
  sourceId?: string;
}

export interface IngestResult {
  ok: boolean;
  sourceId?: string;
  chunkCount?: number;
  error?: string;
}

/** Ingest one document and trace it. Title is the only thing quoted. */
export async function ingestVault(payload: IngestPayload): Promise<IngestResult> {
  const started = performance.now();
  try {
    const { data, error } = await supabase.functions.invoke("vault-ingest", { body: payload });
    if (error) throw error;
    const r = data as { sourceId?: string; chunkCount?: number; error?: string } | null;
    if (r?.error) throw new Error(r.error);
    void emitPull({
      organ: "knowledge-vault",
      capability: "ingest",
      fromSurface: "knowledge-vault",
      status: "ok",
      latencyMs: performance.now() - started,
      quote: payload.name,
      meta: { kind: payload.sourceType, chunks: r?.chunkCount ?? 0 },
    });
    return { ok: true, sourceId: r?.sourceId, chunkCount: r?.chunkCount ?? 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ingest failed";
    void emitPull({
      organ: "knowledge-vault",
      capability: "ingest",
      fromSurface: "knowledge-vault",
      status: "fail",
      latencyMs: performance.now() - started,
      quote: `${payload.name}: ${msg}`,
      meta: { kind: payload.sourceType },
    });
    return { ok: false, error: msg };
  }
}

/** Highlight query terms inside a passage — pure, used for jump-to display. */
export function highlightSegments(passage: string, query: string): Array<{ text: string; hit: boolean }> {
  const terms = Array.from(contentWords(query));
  if (!terms.length) return [{ text: passage, hit: false }];
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = passage.split(re);
  // `re` carries the /g flag, so lastIndex-stateful re.test() is avoided here.
  const termSet = new Set(terms);
  return parts.filter((p) => p !== "").map((p) => ({ text: p, hit: termSet.has(p.toLowerCase()) }));
}
