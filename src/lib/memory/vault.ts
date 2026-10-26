// asherin.vault — the device-held memory shepherd builds from conversations.
//
// three tables, all in this device's IndexedDB through the PostgREST shim:
//   organism_vault     one row per thing learned about the operator (knowledge)
//   organism_patterns  one row per way of working worth keeping (patterns)
//   organism_growth    one row: how the vault has grown over time
//
// the writer (distillTurn) runs after a chat turn lands. it asks shepherd for
// a strict, bounded JSON distillation of the turn, refuses anything
// credential-shaped at the door, seals every knowledge row with the device
// key before it touches storage, and never runs unless the operator has
// turned memory on. the reader (composeVaultContext) hands the model a short
// brief of non-private rows with an instruction never to cite them.
//
// nothing in this file calls a server. the only network call is the one the
// operator's own model key already makes for chat.

import { supabase } from "@/integrations/supabase/client";
import { encryptText, decryptText } from "@/lib/encryption";
import { askModel } from "@/lib/ai";
import { extractJson, providerNeedsKey } from "@/lib/local/llm";
import { getActiveModel, hasProviderKey } from "@/lib/local/keys";
import { onTableChange } from "@/lib/local/db";
import { loadSettings } from "@/lib/intelligence/store";
import { guardMemoryContent } from "./memoryKinds";

/* ── tables & shapes ──────────────────────────────────────────────────────── */

export const VAULT_TABLE = "organism_vault";
export const PATTERN_TABLE = "organism_patterns";
export const GROWTH_TABLE = "organism_growth";

export const FACETS = [
  "interest",
  "thinking",
  "work",
  "style",
  "preference",
  "correction",
  "emotion",
  "expertise",
  "goal",
  "secret",
  "context",
  "directive",
] as const;
export type Facet = (typeof FACETS)[number];

/** lowercase, as every word on the screen is. */
export const FACET_LABEL: Record<Facet, string> = {
  interest: "interests",
  thinking: "how you think",
  work: "work",
  style: "style",
  preference: "preferences",
  correction: "corrections",
  emotion: "temperament",
  expertise: "expertise",
  goal: "goals",
  secret: "private",
  context: "context",
  directive: "standing directives",
};

export interface VaultRow {
  id: string;
  facet: Facet;
  label: string;
  /** `ENC:` ciphertext when `encrypted` is true; opened only in the room or for the brief. */
  content: string;
  sensitive: boolean;
  encrypted: boolean;
  confidence: number;
  occurrences: number;
  last_seen: string;
  enabled?: boolean;
  source_conversation_id?: string | null;
}

export interface PatternRow {
  id: string;
  slug: string;
  name: string;
  domain: string;
  trigger: string;
  procedure: string;
  potency: number;
  active: boolean;
}

export interface GrowthRow {
  id?: string;
  sessions: number | null;
  entries: number | null;
  patterns: number | null;
  density: number | null;
  last_note: string | null;
  last_grown_at: string | null;
  last_conversation_id?: string | null;
}

/* ── the contract shepherd must answer with ───────────────────────────────── */

export interface DistilledKnowledge {
  facet: Facet;
  label: string;
  content: string;
  sensitive: boolean;
  confidence: number;
}

export interface DistilledPattern {
  name: string;
  domain: string;
  trigger: string;
  procedure: string;
}

export interface Distillation {
  knowledge: DistilledKnowledge[];
  patterns: DistilledPattern[];
  note: string | null;
  /** items the parser dropped and why — surfaced in tests and the console, never stored. */
  refused: { label: string; reason: string }[];
}

export const LIMITS = {
  knowledgePerTurn: 8,
  patternsPerTurn: 3,
  labelChars: 80,
  contentChars: 400,
  procedureChars: 600,
  noteChars: 200,
  userTextChars: 4000,
  assistantTextChars: 3000,
  minUserTextChars: 40,
  modelTimeoutMs: 20_000,
  modelMaxTokens: 700,
  briefRows: 8,
} as const;

const SENSITIVE_HINT = /\b(health|diagnos|medic|therap|pregnan|salary|income|debt|divorce|affair|sexual|religio|immigra|arrest|addict|mental)\w*/i;

function clip(s: unknown, max: number): string {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function clamp01(n: unknown, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(1, v));
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * pure: turn whatever the model answered into a bounded, guarded distillation.
 * garbage in → empty distillation out, never a throw. every refusal is named.
 */
export function parseDistillation(text: string): Distillation {
  const empty: Distillation = { knowledge: [], patterns: [], note: null, refused: [] };
  const raw = extractJson<Record<string, unknown>>(text ?? "");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;

  const out: Distillation = { ...empty, knowledge: [], patterns: [], refused: [] };
  const seen = new Set<string>();

  const kList = Array.isArray(raw.knowledge) ? raw.knowledge : [];
  for (const item of kList) {
    if (out.knowledge.length >= LIMITS.knowledgePerTurn) break;
    if (!item || typeof item !== "object") continue;
    const k = item as Record<string, unknown>;
    const label = clip(k.label, LIMITS.labelChars).toLowerCase();
    const content = clip(k.content, LIMITS.contentChars);
    if (!label || !content) continue;
    const guard = guardMemoryContent(content);
    if (!guard.ok) {
      out.refused.push({ label, reason: guard.reason ?? "refused" });
      continue;
    }
    const facetRaw = String(k.facet ?? "").toLowerCase() as Facet;
    const facet: Facet = (FACETS as readonly string[]).includes(facetRaw) ? facetRaw : "context";
    const key = `${facet}|${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sensitive = facet === "secret" || k.sensitive === true || SENSITIVE_HINT.test(`${label} ${content}`);
    out.knowledge.push({ facet, label, content, sensitive, confidence: clamp01(k.confidence, 0.6) });
  }

  const pList = Array.isArray(raw.patterns) ? raw.patterns : [];
  const pSeen = new Set<string>();
  for (const item of pList) {
    if (out.patterns.length >= LIMITS.patternsPerTurn) break;
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const name = clip(p.name, LIMITS.labelChars).toLowerCase();
    const trigger = clip(p.trigger, LIMITS.contentChars);
    const procedure = clip(p.procedure, LIMITS.procedureChars);
    if (!name || !trigger || !procedure) continue;
    const guard = guardMemoryContent(`${trigger} ${procedure}`.slice(0, 590));
    if (!guard.ok) {
      out.refused.push({ label: name, reason: guard.reason ?? "refused" });
      continue;
    }
    const slug = slugify(name);
    if (!slug || pSeen.has(slug)) continue;
    pSeen.add(slug);
    out.patterns.push({ name, domain: clip(p.domain, 40).toLowerCase() || "general", trigger, procedure });
  }

  const note = clip(raw.note, LIMITS.noteChars).toLowerCase();
  out.note = note || null;
  return out;
}

export const DISTILL_SYSTEM = [
  "you are the memory of a private assistant. you read one exchange between an operator and the assistant and write down only what is durable and about the operator — never about the subject matter of the question.",
  "answer with one json object and nothing else:",
  '{"knowledge":[{"facet":"interest|thinking|work|style|preference|correction|emotion|expertise|goal|secret|context|directive","label":"short lowercase handle (max 80 chars)","content":"one plain sentence (max 400 chars)","sensitive":false,"confidence":0.0}],"patterns":[{"name":"short lowercase name","domain":"one word","trigger":"when this applies","procedure":"how to do it, in a few steps"}],"note":"one short line on what changed, or empty"}',
  "rules: at most 8 knowledge items and 3 patterns. empty arrays when nothing durable was shown. never record passwords, api keys, tokens, card numbers or any credential. mark health, money, relationships and anything the operator would not want seen over their shoulder as sensitive:true. a pattern is a reusable way of working the operator asked for or corrected towards, not a fact. do not invent; low confidence when inferring.",
].join("\n");

export function buildDistillPrompt(userText: string, assistantText: string): string {
  const u = clip(userText, LIMITS.userTextChars);
  const a = clip(assistantText, LIMITS.assistantTextChars);
  return `operator said:\n${u}\n\nassistant answered:\n${a}\n\nwrite the json object now.`;
}

/* ── reading ──────────────────────────────────────────────────────────────── */

export interface VaultSnapshot {
  rows: VaultRow[];
  patterns: PatternRow[];
  growth: GrowthRow | null;
}

export async function loadVault(userId: string): Promise<VaultSnapshot> {
  const [v, p, g] = await Promise.all([
    supabase
      .from(VAULT_TABLE)
      .select("id,facet,label,content,sensitive,encrypted,confidence,occurrences,last_seen,enabled")
      .eq("user_id", userId)
      .order("last_seen", { ascending: false })
      .limit(500),
    supabase
      .from(PATTERN_TABLE)
      .select("id,slug,name,domain,trigger,procedure,potency,active")
      .eq("user_id", userId)
      .order("potency", { ascending: false })
      .limit(200),
    supabase
      .from(GROWTH_TABLE)
      .select("id,sessions,entries,patterns,density,last_note,last_grown_at,last_conversation_id")
      .eq("user_id", userId)
      .limit(1),
  ]);
  if (v.error) throw new Error(v.error.message);
  if (p.error) throw new Error(p.error.message);
  if (g.error) throw new Error(g.error.message);
  return {
    rows: (v.data ?? []) as VaultRow[],
    patterns: (p.data ?? []) as PatternRow[],
    growth: ((g.data ?? [])[0] as GrowthRow | undefined) ?? null,
  };
}

/** open one row's content on this device. throws when the seal cannot be opened. */
export async function openRow(row: Pick<VaultRow, "content" | "encrypted">, userId: string): Promise<string> {
  return row.encrypted ? decryptText(row.content, userId) : row.content;
}

/** fires whenever chat writes to any of the three tables, so the room can refresh itself. */
export function onVaultChange(cb: () => void): () => void {
  const offs = [VAULT_TABLE, PATTERN_TABLE, GROWTH_TABLE].map((t) => onTableChange(t, cb));
  return () => offs.forEach((off) => off());
}

/* ── forgetting ───────────────────────────────────────────────────────────── */

async function countRows(table: string, userId: string): Promise<number> {
  const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId);
  return count ?? 0;
}

async function writeGrowthCounts(userId: string, patch: Partial<GrowthRow>): Promise<void> {
  const { data } = await supabase.from(GROWTH_TABLE).select("id,sessions").eq("user_id", userId).limit(1);
  const existing = (data ?? [])[0] as GrowthRow | undefined;
  const entries = await countRows(VAULT_TABLE, userId);
  const patterns = await countRows(PATTERN_TABLE, userId);
  const sessions = Math.max(0, Number(patch.sessions ?? existing?.sessions ?? 0));
  const row = {
    user_id: userId,
    ...(existing?.id ? { id: existing.id } : {}),
    sessions,
    entries,
    patterns,
    density: Number((entries / Math.max(1, sessions)).toFixed(2)),
    ...patch,
  };
  if (existing?.id) {
    await supabase.from(GROWTH_TABLE).update(row).eq("id", existing.id);
  } else {
    await supabase.from(GROWTH_TABLE).insert({ ...row, last_grown_at: patch.last_grown_at ?? null, last_note: patch.last_note ?? null });
  }
}

/** delete one knowledge row and prove it is gone. resolves false if the row is still there. */
export async function forgetEntry(userId: string, id: string): Promise<boolean> {
  const { error } = await supabase.from(VAULT_TABLE).delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
  const { data } = await supabase.from(VAULT_TABLE).select("id").eq("id", id).limit(1);
  const gone = (data ?? []).length === 0;
  if (gone) await writeGrowthCounts(userId, {});
  return gone;
}

export async function forgetPattern(userId: string, id: string): Promise<boolean> {
  const { error } = await supabase.from(PATTERN_TABLE).delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
  const { data } = await supabase.from(PATTERN_TABLE).select("id").eq("id", id).limit(1);
  const gone = (data ?? []).length === 0;
  if (gone) await writeGrowthCounts(userId, {});
  return gone;
}

export async function setPatternActive(userId: string, id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from(PATTERN_TABLE).update({ active }).eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** everything shepherd has learned, gone — knowledge, patterns and the growth record. */
export async function forgetEverything(userId: string): Promise<boolean> {
  for (const t of [VAULT_TABLE, PATTERN_TABLE, GROWTH_TABLE]) {
    const { error } = await supabase.from(t).delete().eq("user_id", userId);
    if (error) throw new Error(error.message);
  }
  const left = (await countRows(VAULT_TABLE, userId)) + (await countRows(PATTERN_TABLE, userId));
  return left === 0;
}

/* ── writing: the chat-side distiller ─────────────────────────────────────── */

export interface DistillInput {
  conversationId: string;
  userId: string;
  userText: string;
  assistantText: string;
  /** test seam: replaces the model call. */
  ask?: (prompt: string, system: string) => Promise<string>;
}

export interface DistillResult {
  ran: boolean;
  skipped?: "memory off" | "too short" | "no model" | "model failed" | "nothing durable";
  learned: number;
  reinforced: number;
  patterns: number;
  refused: { label: string; reason: string }[];
}

/** true when askModel would answer instead of raising the key dialog. */
async function modelReady(): Promise<boolean> {
  try {
    const active = await getActiveModel();
    if (!active) return false;
    if (!providerNeedsKey(active.provider)) return true;
    return await hasProviderKey(active.provider);
  } catch {
    return false;
  }
}

async function callModel(prompt: string): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), LIMITS.modelTimeoutMs);
  try {
    return await askModel(prompt, { system: DISTILL_SYSTEM, json: true, signal: ctl.signal, maxTokens: LIMITS.modelMaxTokens });
  } finally {
    clearTimeout(timer);
  }
}

export async function distillTurn(input: DistillInput): Promise<DistillResult> {
  const none: DistillResult = { ran: false, learned: 0, reinforced: 0, patterns: 0, refused: [] };
  const { userId, conversationId } = input;
  if (!userId) return { ...none, skipped: "no model" };

  // the operator's switch is the first gate. off means nothing is stored about them.
  const settings = await loadSettings();
  if (!settings.memoryEnabled) return { ...none, skipped: "memory off" };

  if (clip(input.userText, LIMITS.userTextChars).length < LIMITS.minUserTextChars) return { ...none, skipped: "too short" };

  const ask = input.ask ?? (async (prompt: string) => callModel(prompt));
  if (!input.ask && !(await modelReady())) return { ...none, skipped: "no model" };

  let answer: string;
  try {
    answer = await ask(buildDistillPrompt(input.userText, input.assistantText), DISTILL_SYSTEM);
  } catch {
    return { ...none, skipped: "model failed" };
  }

  const d = parseDistillation(answer);
  if (d.knowledge.length === 0 && d.patterns.length === 0) return { ...none, ran: true, skipped: "nothing durable", refused: d.refused };

  const now = new Date().toISOString();
  let learned = 0;
  let reinforced = 0;

  const { data: existingRows } = await supabase
    .from(VAULT_TABLE)
    .select("id,facet,label,confidence,occurrences")
    .eq("user_id", userId)
    .limit(1000);
  const byKey = new Map<string, VaultRow>();
  for (const r of (existingRows ?? []) as VaultRow[]) byKey.set(`${r.facet}|${String(r.label).toLowerCase()}`, r);

  for (const k of d.knowledge) {
    const sealed = await encryptText(k.content, userId);
    const prior = byKey.get(`${k.facet}|${k.label}`);
    if (prior) {
      const { error } = await supabase
        .from(VAULT_TABLE)
        .update({
          content: sealed,
          encrypted: true,
          sensitive: k.sensitive,
          confidence: Math.max(Number(prior.confidence ?? 0), k.confidence),
          occurrences: Number(prior.occurrences ?? 1) + 1,
          last_seen: now,
          source_conversation_id: conversationId,
        })
        .eq("id", prior.id);
      if (!error) reinforced++;
      continue;
    }
    const { error } = await supabase.from(VAULT_TABLE).insert({
      user_id: userId,
      facet: k.facet,
      label: k.label,
      content: sealed,
      encrypted: true,
      sensitive: k.sensitive,
      confidence: k.confidence,
      occurrences: 1,
      enabled: true,
      first_seen: now,
      last_seen: now,
      source_conversation_id: conversationId,
    });
    if (!error) learned++;
  }

  let patterns = 0;
  if (d.patterns.length) {
    const { data: existingP } = await supabase.from(PATTERN_TABLE).select("id,slug,potency").eq("user_id", userId).limit(500);
    const bySlug = new Map<string, PatternRow>();
    for (const p of (existingP ?? []) as PatternRow[]) bySlug.set(p.slug, p);
    for (const p of d.patterns) {
      const slug = slugify(p.name);
      const prior = bySlug.get(slug);
      if (prior) {
        const { error } = await supabase
          .from(PATTERN_TABLE)
          .update({ trigger: p.trigger, procedure: p.procedure, domain: p.domain, potency: Number(prior.potency ?? 1) + 1, last_seen: now })
          .eq("id", prior.id);
        if (!error) patterns++;
      } else {
        const { error } = await supabase.from(PATTERN_TABLE).insert({
          user_id: userId,
          slug,
          name: p.name,
          domain: p.domain,
          trigger: p.trigger,
          procedure: p.procedure,
          potency: 1,
          active: true,
          source_conversation_id: conversationId,
          first_seen: now,
          last_seen: now,
        });
        if (!error) patterns++;
      }
    }
  }

  // growth: a session is a distinct conversation that taught something.
  const { data: gRows } = await supabase.from(GROWTH_TABLE).select("id,sessions,last_conversation_id").eq("user_id", userId).limit(1);
  const g = (gRows ?? [])[0] as GrowthRow | undefined;
  const sessions = Number(g?.sessions ?? 0) + (g?.last_conversation_id === conversationId ? 0 : 1);
  await writeGrowthCounts(userId, {
    sessions,
    last_note: d.note ?? `learned ${learned}, reinforced ${reinforced}, patterns ${patterns}`,
    last_grown_at: now,
    last_conversation_id: conversationId,
  });

  return { ran: true, learned, reinforced, patterns, refused: d.refused };
}

/* ── the brief handed to the model before a turn ──────────────────────────── */

const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "have", "what", "when", "your", "you", "are", "was", "but", "not", "can", "how", "about", "into", "like", "just", "want", "need"]);

function terms(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/**
 * a short brief of what shepherd knows, for the system prompt. private rows
 * never leave the room; directives always ride along; the rest is ranked by
 * overlap with the question. returns "" when there is nothing to say or
 * memory is off.
 */
export async function composeVaultContext(userId: string, query: string, limit = LIMITS.briefRows): Promise<string> {
  if (!userId) return "";
  const settings = await loadSettings();
  if (!settings.memoryEnabled) return "";
  const { data } = await supabase
    .from(VAULT_TABLE)
    .select("id,facet,label,content,sensitive,encrypted,confidence,occurrences,last_seen,enabled")
    .eq("user_id", userId)
    .eq("sensitive", false)
    .order("last_seen", { ascending: false })
    .limit(300);
  const rows = ((data ?? []) as VaultRow[]).filter((r) => r.enabled !== false);
  if (rows.length === 0) return "";

  const q = new Set(terms(query));
  const scored: { row: VaultRow; score: number }[] = [];
  for (const row of rows) {
    const hay = terms(`${row.label} ${row.facet}`);
    let score = hay.reduce((n, w) => n + (q.has(w) ? 1 : 0), 0);
    if (row.facet === "directive") score += 100;
    if (row.facet === "preference" || row.facet === "style") score += 0.5;
    score += Math.min(1, Number(row.occurrences ?? 1) / 5);
    scored.push({ row, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const chosen = scored.filter((s) => s.row.facet === "directive" || s.score >= 1).slice(0, limit);
  if (chosen.length === 0) return "";

  const lines: string[] = [];
  for (const { row } of chosen) {
    try {
      const text = await openRow(row, userId);
      if (text) lines.push(`- ${row.facet}: ${text.slice(0, LIMITS.contentChars)}`);
    } catch {
      /* a row that cannot be opened on this device is left out */
    }
  }
  if (lines.length === 0) return "";
  return [
    "[what shepherd already knows about the operator — use it silently to fit the answer. never quote it, never cite it as a source, never say \"according to my memory\" or list what is known unless asked directly.]",
    ...lines,
  ].join("\n");
}
