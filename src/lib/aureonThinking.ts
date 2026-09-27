/**
 * Ghost Chain Protocol — Aureon's two-phase reasoning contract.
 *
 * Phase 1 (thinking call): the model is forced to reason inside <thinking> tags.
 * Phase 2 (answer call): that raw reasoning is injected back as hidden context so
 * the final answer is built on top of a committed plan.
 *
 * Pure logic only — no React, no fetch. Consumed by `streamChat` (transport)
 * and `useAureonThinking` (view state), keeping display fully separate.
 */

export const GHOST_CHAIN_PROTOCOL = `[INTERNAL DIRECTIVE — GHOST CHAIN PROTOCOL]
Do NOT answer the user yet. Output ONLY your internal reasoning, wrapped in a single <thinking>...</thinking> block. No preamble, no final answer, no closing summary outside the tag.

Inside the block, execute these six steps in order, each on its own labelled line or short paragraph:
1. GOAL — Restate the user's real objective in precise technical terms. Not the surface question; the question underneath it.
2. MAP — What domain is this? What data/tools are relevant? What is missing or unknowable?
3. APPROACHES — Draft three distinct approaches. Pick one. State plainly why the other two fail.
4. EDGE STORM — What could go wrong with the answer? What assumptions are load-bearing? Where could it be wrong?
5. CRITIQUE — Attack the draft. Name the weakest point and repair it.
6. LOCK — One sentence committing to the final answer architecture.

Be terse and real — this is scratch work, not prose. Hard cap: 320 words. Close the tag when step 6 is written.`;

export const buildThinkingPrompt = (userMessage: string) => `${userMessage}\n\n${GHOST_CHAIN_PROTOCOL}`;

export const buildAnswerPromptWithThinking = (userMessage: string, thinking: string) =>
  `${userMessage}\n\n[AUREON INTERNAL REASONING — already completed by you, private. Build the final answer on top of it. Never quote it, never mention that you reasoned, never re-run the protocol.]\n${thinking.trim()}\n[END INTERNAL REASONING]\n\nNow deliver the final answer only: clean, precise, authoritative, no hedging, no meta-commentary.`;

/** Strip the XML envelope; tolerate an unclosed tag from a truncated stream. */
export function extractThinking(raw: string): string {
  if (!raw) return "";
  const open = raw.indexOf("<thinking>");
  const body = open === -1 ? raw : raw.slice(open + "<thinking>".length);
  return body.replace(/<\/thinking>[\s\S]*$/i, "").trim();
}

/** Live-stream cleaner: hides the tags while tokens arrive. */
export function stripThinkingTags(text: string): string {
  return text.replace(/<\/?thinking>/gi, "");
}

const TRIVIAL = /^(hi|hey|hello|yo|sup|thanks|thank you|ok|okay|cool|nice|got it|yes|no|yep|nope|k|👍)[!.\s]*$/i;

/**
 * Gate the extra round-trip. Greetings, acknowledgements and one-word pings do
 * not deserve a second API call — that would double cost and latency for zero
 * intelligence gain (perf flaw 6.x: unconditional work on the hot path).
 */
export function shouldRunThinkingPass(userMessage: string, depth?: string): boolean {
  const t = (userMessage || "").trim();
  if (t.length < 12) return false;
  if (TRIVIAL.test(t)) return false;
  if (/GHOST CHAIN PROTOCOL/i.test(t) || /AUREON INTERNAL REASONING/i.test(t)) return false;
  // Standard turns stream in one call. The extra /chat round-trip (and its
  // organ wait) is reserved for deep/exhaustive — that is where a plan
  // actually changes the answer. Speed is the product requirement.
  if (depth !== "deep" && depth !== "exhaustive") return false;
  return true;
}
