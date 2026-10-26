/**
 * asherin.agents — running an agent on this device.
 *
 * a run is shepherd following the agent's workflow over the input the
 * operator gave. one request leaves the device: the model call, carrying the
 * key the operator saved in settings → intelligence. the result is written to
 * zahten_runs and traced into connect as "agent run".
 */

import { askModel } from "@/lib/ai";
import { emitPull } from "@/lib/connect/emitPull";
import { parseRunReply } from "./parse";
import { finishRun, insertRun, listRuns, trimRuns, type RunSource, type ZahtenRun } from "./store";
import { runSystem } from "./prompts";

export interface RunnableAgent {
  id: string;
  name: string;
  spec_text: string;
}

const MAX_INPUT_CHARS = 60_000;
const MAX_SPEC_CHARS = 24_000;

const inflight = new Set<string>();

export function isRunning(agentId: string): boolean {
  return inflight.has(agentId);
}

/** one run, start to finish. resolves with the finished row; never throws for a model failure — the row says "failed". */
export async function runAgent(agent: RunnableAgent, input: string, source: RunSource, signal?: AbortSignal): Promise<ZahtenRun> {
  if (inflight.has(agent.id)) throw new Error("this agent is already running. wait for it to finish.");
  if (!agent.spec_text.trim()) throw new Error("build the agent first — there is no spec to run.");
  inflight.add(agent.id);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const row = await insertRun({
    agent_id: agent.id,
    source,
    status: "running",
    input: input.slice(0, MAX_INPUT_CHARS),
    log: [],
    output: "",
    error: null,
    started_at: startedAt,
    ended_at: null,
  });
  try {
    const prompt = `AGENT SPEC AND WORKFLOW:\n${agent.spec_text.slice(0, MAX_SPEC_CHARS)}\n\nINPUT:\n${input.trim() ? input.slice(0, MAX_INPUT_CHARS) : "(none given)"}`;
    const reply = await askModel(prompt, { system: runSystem(agent.name), signal, maxTokens: 4000 });
    const parsed = parseRunReply(reply);
    const patch: Partial<ZahtenRun> = { agent_id: agent.id, status: "ok", log: parsed.log, output: parsed.output, ended_at: new Date().toISOString() };
    await finishRun(row.id, patch);
    void emitPull({ organ: "zahten", capability: "agent run", fromSurface: source === "tab" ? "published tab" : "asherin.agents", status: "ok", latencyMs: Date.now() - started, quote: agent.name });
    void trimRuns(agent.id).catch(() => undefined);
    return { ...row, ...patch } as ZahtenRun;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const patch: Partial<ZahtenRun> = { agent_id: agent.id, status: "failed", error: message, ended_at: new Date().toISOString() };
    await finishRun(row.id, patch);
    void emitPull({ organ: "zahten", capability: "agent run", fromSurface: source === "tab" ? "published tab" : "asherin.agents", status: "fail", latencyMs: Date.now() - started, quote: agent.name });
    return { ...row, ...patch } as ZahtenRun;
  } finally {
    inflight.delete(agent.id);
  }
}

export { listRuns };

/** the agent behind a tab: the forge row if it still exists, else the spec the tab was published with. */
export async function resolveRunnable(agentId: string): Promise<RunnableAgent | null> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { AGENTS_TABLE, PUBLISHED_TABLE } = await import("./store");
  const own = await supabase.from(AGENTS_TABLE as never).select("id,name,spec_text").eq("id", agentId).maybeSingle();
  const row = own.data as { id: string; name: string; spec_text: string } | null;
  if (row && typeof row.spec_text === "string" && row.spec_text.trim()) return { id: row.id, name: row.name, spec_text: row.spec_text };
  const pub = await supabase.from(PUBLISHED_TABLE as never).select("id,name,metadata").eq("metadata->>zahten_agent_id", agentId).limit(1);
  const p = (pub.data as { id: string; name: string; metadata?: { spec_text?: string } }[] | null)?.[0];
  if (p && p.metadata?.spec_text) return { id: agentId, name: p.name, spec_text: p.metadata.spec_text };
  return null;
}
