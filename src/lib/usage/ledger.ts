// asherin usage ledger — owner-scoped record of AI calls the app actually made.
//
// Truth rules:
//  - a row exists only because a call was attempted; nothing is back-filled.
//  - token counts are stored only when the provider/edge function reported them.
//    when they are absent the row keeps null and the UI shows a call count, not
//    an invented number of tokens.
//  - money is always an ESTIMATE derived from published provider list prices
//    and recorded tokens. it is never presented as a bill.
//  - per-tool switches are enforced before a call leaves the client, so turning
//    a tool off actually stops the spend instead of just hiding it.

import { supabase } from "@/integrations/supabase/client";

export interface AiCallRecord {
  tool: string;
  provider?: string | null;
  model?: string | null;
  functionName?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  status?: "ok" | "error" | "blocked";
}

export interface UsageEvent {
  id: string;
  tool: string;
  provider: string | null;
  model: string | null;
  function_name: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  status: string;
  created_at: string;
}

export interface ToolSwitch {
  tool: string;
  enabled: boolean;
  monthly_budget_usd: number | null;
}

/** USD per 1M tokens, published list prices. Input/output blended per provider
 *  family; deliberately coarse because a blended rate is honest about being an
 *  estimate while a fake per-model table would not be. */
const RATE_PER_MTOK: Record<string, { in: number; out: number }> = {
  openai: { in: 2.5, out: 10 },
  anthropic: { in: 3, out: 15 },
  google: { in: 1.25, out: 5 },
  gemini: { in: 1.25, out: 5 },
  mistral: { in: 0.4, out: 2 },
  venice: { in: 0.7, out: 2.8 },
  groq: { in: 0.1, out: 0.3 },
  deepseek: { in: 0.27, out: 1.1 },
  xai: { in: 3, out: 15 },
  openrouter: { in: 1, out: 3 },
};

export function estimateCostUsd(
  provider: string | null | undefined,
  promptTokens: number | null | undefined,
  completionTokens: number | null | undefined,
): number | null {
  const rate = RATE_PER_MTOK[(provider || "").toLowerCase()];
  if (!rate) return null;
  const pt = Number(promptTokens) || 0;
  const ct = Number(completionTokens) || 0;
  if (pt === 0 && ct === 0) return null;
  return (pt / 1_000_000) * rate.in + (ct / 1_000_000) * rate.out;
}

export function hasKnownRate(provider: string | null | undefined): boolean {
  return Boolean(RATE_PER_MTOK[(provider || "").toLowerCase()]);
}

/* ------------------------------ recording ------------------------------ */

export async function recordAiCall(rec: AiCallRecord): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return; // no owner, no row — never write orphaned usage
    const pt = rec.promptTokens ?? null;
    const ct = rec.completionTokens ?? null;
    const total = pt === null && ct === null ? null : (pt ?? 0) + (ct ?? 0);
    await (supabase.from as any)("ai_usage_events").insert({
      user_id: uid,
      tool: rec.tool,
      provider: rec.provider ?? null,
      model: rec.model ?? null,
      function_name: rec.functionName ?? null,
      prompt_tokens: pt,
      completion_tokens: ct,
      total_tokens: total,
      estimated_cost_usd: estimateCostUsd(rec.provider, pt, ct),
      status: rec.status ?? "ok",
    });
  } catch {
    // usage accounting must never break the feature it is measuring
  }
}

/** Pull token usage out of whatever shape an edge function answered with. */
export function readUsage(payload: unknown): { prompt: number | null; completion: number | null; model: string | null } {
  const p = payload as any;
  const u = p?.usage || p?.tokenUsage || p?.data?.usage;
  const prompt = Number(u?.prompt_tokens ?? u?.promptTokens ?? u?.input_tokens);
  const completion = Number(u?.completion_tokens ?? u?.completionTokens ?? u?.output_tokens);
  return {
    prompt: Number.isFinite(prompt) ? prompt : null,
    completion: Number.isFinite(completion) ? completion : null,
    model: typeof p?.model === "string" ? p.model : null,
  };
}

/* ------------------------------ switches ------------------------------ */

let switchCache: Map<string, ToolSwitch> | null = null;

export async function loadToolSwitches(force = false): Promise<Map<string, ToolSwitch>> {
  if (switchCache && !force) return switchCache;
  const map = new Map<string, ToolSwitch>();
  try {
    const { data } = await (supabase.from as any)("tool_api_switches").select("*");
    for (const row of (data as ToolSwitch[] | null) ?? []) {
      map.set(row.tool, { tool: row.tool, enabled: row.enabled, monthly_budget_usd: row.monthly_budget_usd ?? null });
    }
  } catch {
    // unreadable switches must not silently disable tools
  }
  switchCache = map;
  return map;
}

export function invalidateToolSwitches() {
  switchCache = null;
}

/** Tools are on unless the owner turned them off. */
export async function isToolApiEnabled(tool: string): Promise<boolean> {
  const map = await loadToolSwitches();
  const row = map.get(tool);
  return row ? row.enabled : true;
}

export async function setToolApiEnabled(tool: string, enabled: boolean): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error("sign in to change this");
  await (supabase.from as any)("tool_api_switches").upsert(
    { user_id: uid, tool, enabled, updated_at: new Date().toISOString() },
    { onConflict: "user_id,tool" },
  );
  invalidateToolSwitches();
}

export async function setToolBudget(tool: string, monthly: number | null): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error("sign in to change this");
  await (supabase.from as any)("tool_api_switches").upsert(
    { user_id: uid, tool, enabled: (await isToolApiEnabled(tool)), monthly_budget_usd: monthly, updated_at: new Date().toISOString() },
    { onConflict: "user_id,tool" },
  );
  invalidateToolSwitches();
}

/* ------------------------------ reading ------------------------------ */

export interface UsageBucket {
  key: string;
  calls: number;
  tokens: number;
  tokensKnown: boolean;
  estimatedUsd: number;
  costKnown: boolean;
}

export function bucketBy(events: UsageEvent[], field: "tool" | "provider" | "day"): UsageBucket[] {
  const out = new Map<string, UsageBucket>();
  for (const e of events) {
    const key =
      field === "day" ? e.created_at.slice(0, 10) : (field === "tool" ? e.tool : e.provider) || "unknown";
    const b = out.get(key) || { key, calls: 0, tokens: 0, tokensKnown: false, estimatedUsd: 0, costKnown: false };
    b.calls += 1;
    if (e.total_tokens !== null) {
      b.tokens += e.total_tokens;
      b.tokensKnown = true;
    }
    if (e.estimated_cost_usd !== null) {
      b.estimatedUsd += Number(e.estimated_cost_usd);
      b.costKnown = true;
    }
    out.set(key, b);
  }
  return [...out.values()].sort((a, b) =>
    field === "day" ? a.key.localeCompare(b.key) : b.calls - a.calls,
  );
}

export async function fetchUsageEvents(sinceDays = 30): Promise<UsageEvent[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const { data } = await (supabase.from as any)("ai_usage_events")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);
  return ((data as UsageEvent[] | null) ?? []).map((e) => ({
    ...e,
    estimated_cost_usd: e.estimated_cost_usd === null ? null : Number(e.estimated_cost_usd),
  }));
}

/** Month-to-date estimated spend for one tool, from recorded calls only. */
export function monthToDateUsd(events: UsageEvent[], tool?: string): number {
  const start = new Date();
  const monthStart = new Date(start.getFullYear(), start.getMonth(), 1).toISOString();
  return events
    .filter((e) => e.created_at >= monthStart && (!tool || e.tool === tool))
    .reduce((sum, e) => sum + (e.estimated_cost_usd ?? 0), 0);
}

export function budgetState(spentUsd: number, budgetUsd: number | null): "none" | "ok" | "warn" | "over" {
  if (!budgetUsd || budgetUsd <= 0) return "none";
  if (spentUsd >= budgetUsd) return "over";
  if (spentUsd >= budgetUsd * 0.8) return "warn";
  return "ok";
}
