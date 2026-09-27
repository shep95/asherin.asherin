import { supabase } from "@/integrations/supabase/client";
import type { AiMode } from "./types";

export interface CallAsherCodeArgs {
  mode: AiMode;
  byok?: { provider: string; model: string; apiKey?: string };
  byoks?: Array<{ provider: string; model: string; apiKey?: string }>; // for orchestrate
  // chat
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  // generate
  description?: string;
  language?: string;
  // explain / fix / tests
  code?: string;
  error?: string;
  framework?: string;
  // inline
  before?: string;
  after?: string;
  path?: string;
  // edit_plan
  instruction?: string;
  // shared
  contextFiles?: Array<{ path: string; content: string }>;
  codebase?: Array<{ path: string; content: string }>; // chat mode: full project for relevance ranking
  // orchestrate
  subMode?: AiMode;
  // Aureon brain + persona inheritance (mirrors zali-chat / Aureon Chat)
  brainContext?: { prompt: string; fileContents: Array<{ name: string; content: string }> } | null;
}

export interface CallAsherCodeResult {
  reply?: string;
  provider?: string;
  model?: string;
  keySource?: "request" | "stored" | "admin";
  // orchestrate-only
  responses?: Array<{
    provider: string;
    model: string;
    keySource: string;
    content: string;
    error: string | null;
    latencyMs: number;
  }>;
  ranking?: number[];
  successful?: number;
  timing?: { totalMs: number };
}

export async function callAsherCodeAi(args: CallAsherCodeArgs): Promise<CallAsherCodeResult> {
  const { data, error } = await supabase.functions.invoke("asher-code-ai", { body: args });
  if (error) throw new Error(error.message || "AI call failed");
  if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
  return data as CallAsherCodeResult;
}

// Extract first ```lang...``` block (or all content if none) — used for generate/fix.
export function extractCodeBlock(text: string): string {
  const m = text.match(/```(?:\w+)?\n([\s\S]*?)```/);
  return m ? m[1].trim() : text.trim();
}

// Extract a JSON object from a fenced ```json block (for edit_plan)
export function extractJsonBlock<T = any>(text: string): T | null {
  const m = text.match(/```json\s*\n([\s\S]*?)```/);
  if (!m) {
    // fall back to first {...} block
    const fb = text.match(/\{[\s\S]*\}/);
    if (!fb) return null;
    try { return JSON.parse(fb[0]) as T; } catch { return null; }
  }
  try { return JSON.parse(m[1]) as T; } catch { return null; }
}

// ── Simple line-diff for preview ──────────────────────────────────
export interface DiffLine { type: "add" | "del" | "ctx"; text: string; oldLine?: number; newLine?: number }

export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  // LCS table (simple O(n*m), fine for files <2k lines)
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0, j = 0, oi = 1, ni = 1;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: "ctx", text: a[i], oldLine: oi++, newLine: ni++ }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "del", text: a[i], oldLine: oi++ }); i++; }
    else { out.push({ type: "add", text: b[j], newLine: ni++ }); j++; }
  }
  while (i < n) { out.push({ type: "del", text: a[i++], oldLine: oi++ }); }
  while (j < m) { out.push({ type: "add", text: b[j++], newLine: ni++ }); }
  return out;
}

export interface EditPlanItem { path: string; new_content: string; rationale: string }
export interface EditPlan { summary: string; edits: EditPlanItem[] }
