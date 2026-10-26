/**
 * asherin.agents — what the room keeps and where.
 *
 * two tables in this device's IndexedDB, through the query shim:
 *   zahten_agents   one row per agent the operator is forging
 *   zahten_runs     one row per run (manual, interval, or from a published tab)
 * publishing writes a row into `asher_agents` (status "published"), which is
 * the table the dashboard reads to list "agent:<id>" tabs. nothing here ever
 * leaves the device.
 */

import { supabase } from "@/integrations/supabase/client";
import { buildTabHtml, extractCode, parseNeeds, parseWorkflowSteps, type Trigger, type WorkflowStep } from "./parse";

export interface Pass {
  n: number;
  status: "running" | "refining" | "complete" | "error";
  text: string;
  started_at: number;
  ended_at?: number;
}

export type AgentStatus = "draft" | "built" | "published";

export interface ZahtenAgent {
  id: string;
  user_id?: string;
  name: string;
  objective: string;
  status: AgentStatus;
  trigger: Trigger;
  /** the latest full pass shepherd wrote: spec, workflow, code, test plan. */
  spec_text: string;
  passes: Pass[];
  /** the input every run starts from: pasted once, reused by "run now" and by interval runs. */
  standing_input: string;
  /** operator-edited page for the published tab; null means "the default page". */
  tab_html: string | null;
  /** row id in asher_agents while the tab is published. */
  published_id: string | null;
  example: boolean;
  created_at: string;
  updated_at: string;
}

export type RunSource = "manual" | "interval" | "tab";

export interface ZahtenRun {
  id: string;
  user_id?: string;
  agent_id: string;
  source: RunSource;
  status: "running" | "ok" | "failed";
  input: string;
  log: string[];
  output: string;
  error: string | null;
  started_at: string;
  ended_at: string | null;
}

export const AGENTS_TABLE = "zahten_agents";
export const RUNS_TABLE = "zahten_runs";
export const PUBLISHED_TABLE = "asher_agents";
export const RUNS_CHANGED_EVENT = "zahten:runs-changed";
export const AGENTS_CHANGED_EVENT = "zahten:agents-changed";
/** the dashboard listens for this to refresh its "agent:<id>" tabs. */
export const PUBLISHED_CHANGED_EVENT = "asher-agents-updated";

export const MAX_RUNS_PER_AGENT = 50;
export const MAX_PASSES_KEPT = 8;

const LEGACY_AGENTS_KEY = "zahten.agents.v1";
const LEGACY_ACTIVE_KEY = "zahten.activeAgentId.v1";
const LEGACY_STARTER_IDS = new Set(["agent-001", "agent-002", "agent-003"]);

function emit(name: string, detail?: unknown) {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    /* no window in tests */
  }
}

const now = () => new Date().toISOString();

/** two clearly marked examples, so a first visit is not an empty list. both removable. */
export function exampleAgents(): Omit<ZahtenAgent, "id" | "created_at" | "updated_at">[] {
  return [
    {
      name: "release notes digest",
      objective: "take pasted release notes or a changelog and produce a short digest: what changed, what might break, what to tell customers. keep each line under twenty words.",
      status: "draft",
      trigger: { kind: "manual" },
      spec_text: "",
      passes: [],
      standing_input: "",
      tab_html: null,
      published_id: null,
      example: true,
    },
    {
      name: "meeting notes to actions",
      objective: "turn pasted meeting notes into a list of action items with an owner, a due date if one was said, and the sentence it came from.",
      status: "draft",
      trigger: { kind: "manual" },
      spec_text: "",
      passes: [],
      standing_input: "",
      tab_html: null,
      published_id: null,
      example: true,
    },
  ];
}

interface LegacyRecord {
  id?: string;
  name?: string;
  objective?: string;
  passes?: { n?: number; status?: string; text?: string; startedAt?: number; endedAt?: number }[];
  publishedAgentId?: string;
}

/** the earlier build kept agents in localStorage; bring the operator's own ones across once. */
export function migrateLegacy(raw: string | null): Omit<ZahtenAgent, "id" | "created_at" | "updated_at">[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: Omit<ZahtenAgent, "id" | "created_at" | "updated_at">[] = [];
  for (const r of parsed as LegacyRecord[]) {
    if (!r || typeof r !== "object") continue;
    if (r.id && LEGACY_STARTER_IDS.has(r.id)) continue;
    const objective = (r.objective || "").trim();
    const passes = Array.isArray(r.passes) ? r.passes.filter((p) => p && typeof p.text === "string" && p.text.trim()) : [];
    if (!objective && !passes.length) continue;
    const last = passes[passes.length - 1];
    out.push({
      name: (r.name || "untitled agent").toString().slice(0, 64),
      objective,
      status: last ? "built" : "draft",
      trigger: { kind: "manual" },
      spec_text: last?.text || "",
      passes: passes.slice(-MAX_PASSES_KEPT).map((p, i) => ({
        n: typeof p.n === "number" ? p.n : i + 1,
        status: p.status === "error" ? "error" : "complete",
        text: p.text || "",
        started_at: p.startedAt || Date.now(),
        ended_at: p.endedAt,
      })),
      standing_input: "",
      tab_html: null,
      published_id: null,
      example: false,
    });
  }
  return out;
}

function normalise(row: Record<string, unknown>): ZahtenAgent {
  const t = row.trigger as Trigger | undefined;
  return {
    id: String(row.id),
    user_id: row.user_id as string | undefined,
    name: String(row.name ?? "untitled agent"),
    objective: String(row.objective ?? ""),
    status: (row.status as AgentStatus) ?? "draft",
    trigger: t && t.kind === "interval" ? { kind: "interval", minutes: Number(t.minutes) || 30 } : { kind: "manual" },
    spec_text: String(row.spec_text ?? ""),
    passes: Array.isArray(row.passes) ? (row.passes as Pass[]) : [],
    standing_input: String(row.standing_input ?? ""),
    tab_html: typeof row.tab_html === "string" ? row.tab_html : null,
    published_id: typeof row.published_id === "string" ? row.published_id : null,
    example: row.example === true,
    created_at: String(row.created_at ?? now()),
    updated_at: String(row.updated_at ?? now()),
  };
}

export async function listAgents(): Promise<ZahtenAgent[]> {
  const { data, error } = await supabase.from(AGENTS_TABLE as never).select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) || []).map(normalise);
}

/** first open: carry legacy agents across, else seed the examples. */
export async function ensureSeeded(): Promise<ZahtenAgent[]> {
  const existing = await listAgents();
  if (existing.length) return existing;
  let legacy: string | null = null;
  try {
    legacy = localStorage.getItem(LEGACY_AGENTS_KEY);
  } catch {
    /* private mode */
  }
  const imported = migrateLegacy(legacy);
  const seed = imported.length ? imported : exampleAgents();
  const stamp = now();
  const rows = seed.map((a, i) => ({ ...a, created_at: new Date(Date.parse(stamp) - i * 1000).toISOString(), updated_at: stamp }));
  const { error } = await supabase.from(AGENTS_TABLE as never).insert(rows as never);
  if (error) throw new Error(error.message);
  try {
    localStorage.removeItem(LEGACY_AGENTS_KEY);
    localStorage.removeItem(LEGACY_ACTIVE_KEY);
  } catch {
    /* private mode */
  }
  return listAgents();
}

export async function createAgent(partial?: Partial<ZahtenAgent>): Promise<ZahtenAgent> {
  const stamp = now();
  const row = {
    name: partial?.name ?? "untitled agent",
    objective: partial?.objective ?? "",
    status: "draft" as AgentStatus,
    trigger: partial?.trigger ?? { kind: "manual" },
    spec_text: "",
    passes: [],
    standing_input: "",
    tab_html: null,
    published_id: null,
    example: false,
    created_at: stamp,
    updated_at: stamp,
  };
  const { data, error } = await supabase.from(AGENTS_TABLE as never).insert(row as never).select("*").single();
  if (error) throw new Error(error.message);
  emit(AGENTS_CHANGED_EVENT);
  return normalise(data as Record<string, unknown>);
}

export async function updateAgent(id: string, patch: Partial<ZahtenAgent>): Promise<ZahtenAgent> {
  const { data, error } = await supabase
    .from(AGENTS_TABLE as never)
    .update({ ...patch, updated_at: now() } as never)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  emit(AGENTS_CHANGED_EVENT);
  return normalise(data as Record<string, unknown>);
}

export async function deleteAgent(id: string): Promise<void> {
  const { data } = await supabase.from(AGENTS_TABLE as never).select("published_id").eq("id", id).maybeSingle();
  const pub = (data as { published_id?: string | null } | null)?.published_id;
  if (pub) await unpublishAgent(id, pub);
  await supabase.from(RUNS_TABLE as never).delete().eq("agent_id", id);
  const { error } = await supabase.from(AGENTS_TABLE as never).delete().eq("id", id);
  if (error) throw new Error(error.message);
  emit(AGENTS_CHANGED_EVENT);
}

/* ── derived ─────────────────────────────────────────────────────────────── */

export function derive(a: Pick<ZahtenAgent, "spec_text">): { steps: WorkflowStep[]; code: string; needs: string[] } {
  return { steps: parseWorkflowSteps(a.spec_text), code: extractCode(a.spec_text), needs: parseNeeds(a.spec_text) };
}

export function defaultTabHtml(a: ZahtenAgent): string {
  const d = derive(a);
  return buildTabHtml({ agentId: a.id, name: a.name, objective: a.objective, steps: d.steps, code: d.code, trigger: a.trigger, needs: d.needs });
}

/* ── publishing ──────────────────────────────────────────────────────────── */

export interface PublishedRow {
  id: string;
  name: string;
  entry_html: string;
  status: string;
  metadata?: { zahten_agent_id?: string; spec_text?: string; objective?: string; trigger?: Trigger };
}

/** write (or rewrite) the tab row the dashboard lists; returns the tab id. */
export async function publishAgent(a: ZahtenAgent, html: string): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const d = derive(a);
  const payload = {
    owner_id: auth?.user?.id ?? null,
    name: a.name.trim() || "agent",
    description: a.objective.slice(0, 280),
    icon: "◈",
    category: "zahten",
    runtime: "iframe",
    entry_html: html,
    source_tsx: d.code || null,
    visibility: "private",
    status: "published",
    metadata: { zahten_agent_id: a.id, spec_text: a.spec_text.slice(0, 40_000), objective: a.objective, trigger: a.trigger, workflow_steps: d.steps },
  };
  let id = a.published_id;
  if (id) {
    const { data, error } = await supabase.from(PUBLISHED_TABLE as never).update(payload as never).eq("id", id).select("id");
    if (error) throw new Error(error.message);
    if (!Array.isArray(data) || !data.length) id = null; // the row is gone; insert a fresh one
  }
  if (!id) {
    const { data, error } = await supabase.from(PUBLISHED_TABLE as never).insert(payload as never).select("id").single();
    if (error) throw new Error(error.message);
    id = String((data as { id: string }).id);
  }
  await updateAgent(a.id, { published_id: id, status: "published", tab_html: html });
  emit(PUBLISHED_CHANGED_EVENT, { id, name: payload.name, entry_html: html });
  return id;
}

export async function unpublishAgent(agentId: string, publishedId: string): Promise<void> {
  const { error } = await supabase.from(PUBLISHED_TABLE as never).delete().eq("id", publishedId);
  if (error) throw new Error(error.message);
  await supabase.from(AGENTS_TABLE as never).update({ published_id: null, status: "built", updated_at: now() } as never).eq("id", agentId);
  emit(AGENTS_CHANGED_EVENT);
  emit(PUBLISHED_CHANGED_EVENT);
}

export async function readPublished(publishedId: string): Promise<PublishedRow | null> {
  const { data } = await supabase.from(PUBLISHED_TABLE as never).select("id,name,entry_html,status,metadata").eq("id", publishedId).maybeSingle();
  return (data as PublishedRow | null) ?? null;
}

/* ── runs ────────────────────────────────────────────────────────────────── */

export async function listRuns(agentId: string, limit = MAX_RUNS_PER_AGENT): Promise<ZahtenRun[]> {
  const { data } = await supabase
    .from(RUNS_TABLE as never)
    .select("*")
    .eq("agent_id", agentId)
    .order("started_at", { ascending: false })
    .limit(limit);
  return ((data as ZahtenRun[]) || []).map((r) => ({ ...r, log: Array.isArray(r.log) ? r.log : [] }));
}

export async function insertRun(run: Omit<ZahtenRun, "id">): Promise<ZahtenRun> {
  const { data, error } = await supabase.from(RUNS_TABLE as never).insert(run as never).select("*").single();
  if (error) throw new Error(error.message);
  emit(RUNS_CHANGED_EVENT, { agent_id: run.agent_id });
  return data as ZahtenRun;
}

export async function finishRun(id: string, patch: Partial<ZahtenRun>): Promise<void> {
  await supabase.from(RUNS_TABLE as never).update(patch as never).eq("id", id);
  emit(RUNS_CHANGED_EVENT, { agent_id: patch.agent_id });
}

/** keep the newest MAX_RUNS_PER_AGENT rows; the rest are deleted. */
export async function trimRuns(agentId: string): Promise<void> {
  const all = await listRuns(agentId, 10_000);
  const stale = all.slice(MAX_RUNS_PER_AGENT);
  if (!stale.length) return;
  await supabase.from(RUNS_TABLE as never).delete().in("id", stale.map((r) => r.id));
}

/** which runs would be deleted by a trim — pure, for tests. */
export function runsToTrim<T extends { started_at: string }>(runs: T[], keep = MAX_RUNS_PER_AGENT): T[] {
  return [...runs].sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(keep);
}
