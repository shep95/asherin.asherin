// asherin.knowledge — a grounded answer from shepherd.
//
// The model sees only the retrieved passages, numbered, and is told to cite
// them as [n] and to say plainly when they do not cover the question. The
// answer is parsed back into text plus the citation numbers it actually used;
// a number the model invents (outside 1..k) is dropped, never shown.

import { askModel } from "@/lib/ai";
import { getActiveModel, hasProviderKey } from "@/lib/local/keys";
import { providerNeedsKey } from "@/lib/local/llm";
import type { VaultPassage } from "./vault";

export const ANSWER = {
  /** characters of each passage shown to the model. */
  passageChars: 1_400,
  /** passages sent at most. */
  maxPassages: 8,
  maxTokens: 700,
  timeoutMs: 60_000,
} as const;

export const ANSWER_SYSTEM = [
  "you are shepherd, answering from the operator's own documents.",
  "use only the numbered passages given. every claim you make must end with the citation of the passage it came from, written exactly as [n].",
  "if the passages do not cover the question, say so in one plain sentence and do not guess. never invent a citation number.",
  "write in lowercase except proper names. be brief: a short paragraph, or a few lines, no preamble.",
].join(" ");

export function buildAnswerPrompt(question: string, passages: VaultPassage[]): string {
  const block = passages
    .slice(0, ANSWER.maxPassages)
    .map((p) => `[${p.n}] ${p.sourceName}\n${p.content.slice(0, ANSWER.passageChars)}`)
    .join("\n\n");
  return `passages:\n\n${block}\n\nquestion: ${question.trim().slice(0, 2_000)}\n\nanswer with [n] citations.`;
}

/** [n] markers in the answer that point at a passage the model was given. */
export function parseCitations(answer: string, k: number): number[] {
  const seen = new Set<number>();
  const re = /\[(\d{1,2})\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(answer))) {
    const n = Number(m[1]);
    if (n >= 1 && n <= k) seen.add(n);
  }
  return Array.from(seen).sort((a, b) => a - b);
}

/** drop [n] markers that point outside the passages given. */
export function stripBadCitations(answer: string, k: number): string {
  return answer.replace(/\s?\[(\d{1,2})\]/g, (whole, d) => (Number(d) >= 1 && Number(d) <= k ? whole : "")).trim();
}

/** true when a model can be asked without raising the key dialog. */
export async function modelReady(): Promise<boolean> {
  try {
    const active = await getActiveModel();
    if (!active) return false;
    if (!providerNeedsKey(active.provider)) return true;
    return await hasProviderKey(active.provider);
  } catch {
    return false;
  }
}

export interface GroundedAnswer {
  text: string;
  cited: number[];
  error: string | null;
}

export type Ask = (prompt: string, system: string, signal: AbortSignal) => Promise<string>;

const defaultAsk: Ask = (prompt, system, signal) => askModel(prompt, { system, signal, maxTokens: ANSWER.maxTokens });

/** answer a question from passages already retrieved. never throws. */
export async function answerFromPassages(question: string, passages: VaultPassage[], ask: Ask = defaultAsk): Promise<GroundedAnswer> {
  if (!passages.length) return { text: "", cited: [], error: "no passage in the corpus covers that — nothing to answer from" };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ANSWER.timeoutMs);
  try {
    const raw = await ask(buildAnswerPrompt(question, passages), ANSWER_SYSTEM, ctl.signal);
    const k = Math.min(passages.length, ANSWER.maxPassages);
    const text = stripBadCitations(raw, k);
    if (!text) return { text: "", cited: [], error: "shepherd returned nothing" };
    return { text, cited: parseCitations(raw, k), error: null };
  } catch (e) {
    if (ctl.signal.aborted) return { text: "", cited: [], error: "shepherd did not answer within 60 seconds" };
    const msg = e instanceof Error ? e.message : "shepherd could not answer";
    return { text: "", cited: [], error: msg.charAt(0).toLowerCase() + msg.slice(1) };
  } finally {
    clearTimeout(timer);
  }
}
