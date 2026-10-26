// asherin.activity — what this device recorded about its own use.
//
// the hosted era kept a `usage_stats` row that a server trigger filled. on a
// device nothing writes that row (the chat loop only updates a row that already
// exists), so the counters would read zero forever. the honest source is the
// chat store itself: every prompt is a `messages` row with role "user", and
// every conversation carries the mode it was opened in. only `role`,
// `created_at` and `conversation_id` are read — message content is ciphertext
// and this room never opens it.

import { supabase } from "@/integrations/supabase/client";

export interface PromptRow {
  role: string;
  created_at: string;
  conversation_id: string | null;
}

export interface ConversationRow {
  id: string;
  mode?: string | null;
}

export const MODES = ["chat", "research", "code", "truth"] as const;

export interface ModeCount {
  mode: string;
  n: number;
}

export interface UsageFacts {
  /** messages with role "user" */
  prompts: number;
  /** messages with role "assistant" */
  replies: number;
  conversations: number;
  /** prompts per chat mode, fixed order, plus "unknown" for prompts whose conversation is gone */
  byMode: ModeCount[];
  /** distinct local calendar days with at least one prompt */
  activeDays: number;
  /** consecutive days with a prompt, counted back from today (or yesterday, if today is quiet) */
  streakDays: number;
  firstAt: string | null;
  lastAt: string | null;
}

export const EMPTY_USAGE: UsageFacts = {
  prompts: 0,
  replies: 0,
  conversations: 0,
  byMode: MODES.map((mode) => ({ mode, n: 0 })),
  activeDays: 0,
  streakDays: 0,
  firstAt: null,
  lastAt: null,
};

/** local calendar day key — the operator's day, not utc's. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDay(d: Date, delta: number): Date {
  const n = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  n.setDate(n.getDate() + delta);
  return n;
}

/** consecutive days ending today or yesterday. a quiet today does not break the chain; a quiet yesterday does. */
export function streakFrom(days: Set<string>, now: Date): number {
  let cursor = shiftDay(now, 0);
  if (!days.has(dayKey(cursor))) {
    cursor = shiftDay(cursor, -1);
    if (!days.has(dayKey(cursor))) return 0;
  }
  let n = 0;
  while (days.has(dayKey(cursor))) {
    n += 1;
    cursor = shiftDay(cursor, -1);
  }
  return n;
}

/** pure: facts from rows. rows with an unparsable date are counted but do not touch the day maths. */
export function summarizeUsage(messages: PromptRow[], conversations: ConversationRow[], now: Date = new Date()): UsageFacts {
  const modeOf = new Map<string, string>();
  for (const c of conversations) {
    const m = typeof c.mode === "string" && (MODES as readonly string[]).includes(c.mode) ? c.mode : "unknown";
    modeOf.set(c.id, m);
  }
  const byMode = new Map<string, number>(MODES.map((m) => [m, 0]));
  const days = new Set<string>();
  let prompts = 0;
  let replies = 0;
  let first: number | null = null;
  let last: number | null = null;

  for (const row of messages) {
    if (row.role === "assistant") {
      replies += 1;
      continue;
    }
    if (row.role !== "user") continue;
    prompts += 1;
    const mode = (row.conversation_id && modeOf.get(row.conversation_id)) || "unknown";
    byMode.set(mode, (byMode.get(mode) ?? 0) + 1);
    const t = new Date(row.created_at).getTime();
    if (Number.isNaN(t)) continue;
    days.add(dayKey(new Date(t)));
    if (first === null || t < first) first = t;
    if (last === null || t > last) last = t;
  }

  const modes: ModeCount[] = MODES.map((mode) => ({ mode, n: byMode.get(mode) ?? 0 }));
  const unknown = byMode.get("unknown") ?? 0;
  if (unknown > 0) modes.push({ mode: "unknown", n: unknown });

  return {
    prompts,
    replies,
    conversations: conversations.length,
    byMode: modes,
    activeDays: days.size,
    streakDays: streakFrom(days, now),
    firstAt: first === null ? null : new Date(first).toISOString(),
    lastAt: last === null ? null : new Date(last).toISOString(),
  };
}

/** share of prompts per mode, as whole percentages that sum to 100 when prompts > 0 (largest remainder). */
export function modeShares(byMode: ModeCount[], prompts: number): { mode: string; n: number; pct: number }[] {
  if (prompts <= 0) return byMode.map((m) => ({ ...m, pct: 0 }));
  const raw = byMode.map((m) => ({ ...m, exact: (m.n / prompts) * 100 }));
  const floored = raw.map((m) => ({ mode: m.mode, n: m.n, pct: Math.floor(m.exact), rem: m.exact - Math.floor(m.exact) }));
  let left = 100 - floored.reduce((s, m) => s + m.pct, 0);
  const order = [...floored].sort((a, b) => b.rem - a.rem);
  for (const m of order) {
    if (left <= 0) break;
    if (m.n === 0) continue;
    m.pct += 1;
    left -= 1;
  }
  return floored.map(({ mode, n, pct }) => ({ mode, n, pct }));
}

/** read the two tables this device holds and reduce them. throws with the shim's message on a read error. */
export async function readUsage(userId: string, now: Date = new Date()): Promise<UsageFacts> {
  const [msgs, convs] = await Promise.all([
    supabase.from("messages").select("role, created_at, conversation_id").eq("user_id", userId),
    supabase.from("conversations").select("id, mode").eq("user_id", userId),
  ]);
  if (msgs.error) throw new Error(msgs.error.message);
  if (convs.error) throw new Error(convs.error.message);
  return summarizeUsage((msgs.data ?? []) as PromptRow[], (convs.data ?? []) as ConversationRow[], now);
}
