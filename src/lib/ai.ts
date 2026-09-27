/**
 * Chat client — local edition.
 *
 * The answer is produced by the model provider the operator connected, called
 * straight from this browser with the key held in the device vault. There is
 * no relay. The system prompt is assembled here (src/lib/local/prompts.ts).
 */
import type { ChatMode, FileAttachment } from "@/components/dashboard/types";
import type { ResponseDepth } from "@/components/dashboard/DepthSelector";
import { detectRelevantSkills, buildSkillInjectionPrompt } from "@/lib/autoSkillInjection";
import { buildSwarmContext } from "@/lib/swarmOrchestrator";
import { buildExactContinuationPrompt, MAX_STREAM_CONTINUATIONS, stitchAiContinuation } from "@/lib/aiContinuation";
import {
  buildThinkingPrompt,
  buildAnswerPromptWithThinking,
  extractThinking,
  stripThinkingTags,
  shouldRunThinkingPass,
} from "@/lib/aureonThinking";
import { getActiveModel, getProviderKey, VaultLockedError } from "@/lib/local/keys";
import { streamLlm, completeLlm, extractJson, LlmError, providerNeedsKey, type LlmMessage, type LlmImage } from "@/lib/local/llm";
import { buildSystemPrompt } from "@/lib/local/prompts";

type Msg = { role: "user" | "assistant"; content: string; attachments?: FileAttachment[] };

export interface UserProfile {
  tone_preference?: string;
  topics_of_interest?: string[];
  inferred_traits?: Record<string, unknown>;
}

export interface BrainContext {
  prompt: string;
  fileContents: { name: string; content: string }[];
}

/* ── provider resolution ────────────────────────────────────────────────── */

export interface ResolvedModel {
  provider: string;
  model: string;
  apiKey: string;
}

async function raiseByok(reason: string): Promise<never> {
  try {
    const { triggerByokRequired } = await import("@/components/ByokRequiredDialog");
    triggerByokRequired({ source: "aureon-chat", reason });
  } catch {
    /* noop */
  }
  throw new Error(reason);
}

/**
 * Which model answers, and with which key. Explicit selection first, then the
 * only saved key, then the legacy localStorage hint. No key → the BYOK dialog.
 */
export async function resolveActiveModel(conversationId?: string | null): Promise<ResolvedModel> {
  let active = await getActiveModel().catch(() => null);
  if (!active) {
    try {
      const cached = JSON.parse(localStorage.getItem("aureon_byok_active") || "null");
      if (cached?.provider && cached.provider !== "aureon" && cached.provider !== "default") {
        active = { provider: cached.provider, model: cached.model || "" };
      }
    } catch {
      /* no hint */
    }
  }
  if (!active) return raiseByok("connect a model key in settings → ai keys to start chatting.");

  // Per-conversation off switch for the global provider.
  if (conversationId) {
    try {
      const all = JSON.parse(localStorage.getItem("aureon_conv_api_toggles") || "{}");
      if (all?.[conversationId]?.[active.provider] === false) {
        return raiseByok(`${active.provider} is switched off for this conversation. turn it back on or pick another provider.`);
      }
    } catch {
      /* respect global */
    }
  }

  let apiKey = "";
  if (providerNeedsKey(active.provider)) {
    try {
      apiKey = (await getProviderKey(active.provider)) ?? "";
    } catch (e) {
      if (e instanceof VaultLockedError) return raiseByok(e.message);
      throw e;
    }
    if (!apiKey) return raiseByok(`no saved key for ${active.provider}. add one in settings → ai keys.`);
  }
  return { provider: active.provider, model: active.model, apiKey };
}

/* ── attachments ────────────────────────────────────────────────────────── */

const TEXT_TYPES = /^(text\/|application\/(json|xml|javascript|x-yaml|yaml|csv|sql))/i;
const MAX_INLINE_TEXT = 120_000;

function b64ToText(b64: string): string {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function toLlmMessage(m: Msg): LlmMessage {
  const images: LlmImage[] = [];
  let content = m.content ?? "";
  for (const a of m.attachments ?? []) {
    if (!a?.base64) continue;
    if (a.type?.startsWith("image/")) {
      images.push({ mime: a.type, base64: a.base64 });
    } else if (TEXT_TYPES.test(a.type || "") || /\.(md|txt|csv|json|ts|tsx|js|py|sql|yaml|yml|xml|html|css)$/i.test(a.name || "")) {
      const text = b64ToText(a.base64).slice(0, MAX_INLINE_TEXT);
      if (text) content += `\n\n[attached file: ${a.name}]\n\`\`\`\n${text}\n\`\`\``;
    } else {
      content += `\n\n[attached file: ${a.name} (${a.type || "binary"}, ${Math.round((a.size || 0) / 1024)} kb) — binary contents not inlined]`;
    }
  }
  return { role: m.role, content, images: images.length ? images : undefined };
}

/* ── streaming chat ─────────────────────────────────────────────────────── */

export async function streamChat({
  messages,
  mode,
  depth,
  userProfile,
  brainContext,
  intelligenceContext,
  conversationId,
  turnId: _turnId,
  signal,
  onDelta,
  onReplace,
  onDone,
  onTools,
  onHands: _onHands,
  onThinkingStart,
  onThinkingDelta,
  onThinkingDone,
}: {
  messages: Msg[];
  mode: ChatMode;
  depth?: ResponseDepth;
  userProfile?: UserProfile | null;
  brainContext?: BrainContext | null;
  intelligenceContext?: string;
  conversationId?: string | null;
  turnId?: string | null;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
  onReplace?: (text: string) => void;
  onDone: () => void;
  onTools?: (rows: Array<{ label: string; detail?: string }>) => void;
  onHands?: (hands: Array<{ surface: string; organ: string; focus?: string }>) => void;
  onThinkingStart?: () => void;
  onThinkingDelta?: (text: string) => void;
  onThinkingDone?: (fullThinking: string) => void;
}) {
  const resolved = await resolveActiveModel(conversationId);

  const apiMessages = messages.map(toLlmMessage);
  const lastUserIdx = (() => {
    for (let i = apiMessages.length - 1; i >= 0; i--) if (apiMessages[i].role === "user") return i;
    return -1;
  })();
  const lastUserContent = lastUserIdx >= 0 ? apiMessages[lastUserIdx].content : "";
  const hasImage = apiMessages.some((m) => m.images?.length);

  const plain = messages.map((m) => ({ role: m.role, content: m.content }));
  const skillInjection = buildSkillInjectionPrompt(detectRelevantSkills(plain));
  const swarm = buildSwarmContext(plain);

  const numberedFormat = (() => {
    try {
      const m = JSON.parse(localStorage.getItem("aureon_numbered_format_off") || "{}");
      return !(conversationId && m[conversationId] === true);
    } catch {
      return true;
    }
  })();

  const brainText = brainContext
    ? [brainContext.prompt, ...(brainContext.fileContents ?? []).map((f) => `### ${f.name}\n${f.content.slice(0, 40_000)}`)]
        .filter(Boolean)
        .join("\n\n")
    : "";
  const profileText = userProfile
    ? `operator preferences: tone=${userProfile.tone_preference ?? "unspecified"}; topics=${(userProfile.topics_of_interest ?? []).join(", ") || "none"}.`
    : "";

  const system = buildSystemPrompt({
    mode,
    depth,
    numberedFormat,
    lastUserText: lastUserContent,
    hasImage,
    brainContext: [profileText, brainText].filter(Boolean).join("\n\n"),
    intelligenceContext,
    skillInjection,
    swarmInjection: swarm.swarmPrompt,
    activeAgentId: swarm.activeAgent.id,
  });

  onTools?.([{ label: `${resolved.provider}${resolved.model ? " · " + resolved.model : ""}`, detail: "direct from this device" }]);

  let assistantAccum = "";
  const wrappedDelta = (t: string) => {
    assistantAccum += t;
    onDelta(t);
  };
  const outputLimitMarker = /\n?\n?\[GENERATION_INCOMPLETE:[^\]]+\]/gi;

  const looksIncomplete = (text: string, latestChunk = text) => {
    if (!text) return false;
    if (/GENERATION_INCOMPLETE|stopped at the output-token limit|finish_reason\s*[:=]\s*(?:length|max_tokens)/i.test(latestChunk)) return true;
    if ((text.match(/```/g) || []).length % 2 === 1) return true;
    if (/\{\s*"files"\s*:\s*\[/i.test(text) && !/\]\s*}\s*```?\s*$/s.test(text.trim())) return true;
    return false;
  };

  const runPass = async (requestMessages: LlmMessage[], onText?: (text: string) => void) => {
    const ATTEMPTS = 3;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      let passText = "";
      let passIncomplete = false;
      try {
        await streamLlm({
          provider: resolved.provider,
          model: resolved.model,
          apiKey: resolved.apiKey,
          messages: [{ role: "system", content: system }, ...requestMessages],
          signal,
          onDelta: (chunk) => {
            const cleaned = chunk.replace(outputLimitMarker, () => {
              passIncomplete = true;
              return "";
            });
            if (!cleaned) return;
            passText += cleaned;
            onText?.(cleaned);
          },
        });
        return { text: passText, incompleteSignal: passIncomplete };
      } catch (e) {
        if ((e as Error)?.name === "AbortError") throw e;
        if (e instanceof LlmError) {
          const transient = e.code === "RATE_LIMIT" || e.code === "UPSTREAM_BUSY";
          if (transient && !passText && attempt < ATTEMPTS - 1 && !signal?.aborted) {
            await new Promise((r) => setTimeout(r, (e.retryAfterMs ?? 1500) * (attempt + 1) + Math.random() * 400));
            continue;
          }
          if (e.code === "AUTH") return raiseByok(`${resolved.provider} rejected the key: ${e.message}`);
          throw new Error(e.message);
        }
        throw e;
      }
    }
    throw new Error("the model provider is busy right now. send it again in a moment.");
  };

  // ── phase 1: thinking (fail-soft) ─────────────────────────────────────
  let thinkingText = "";
  if (onThinkingDelta && lastUserIdx >= 0 && shouldRunThinkingPass(lastUserContent, depth)) {
    onThinkingStart?.();
    try {
      const thinkingMessages = apiMessages.map((m, i) => (i === lastUserIdx ? { ...m, content: buildThinkingPrompt(lastUserContent) } : m));
      let raw = "";
      let closed = false;
      const pass = await runPass(thinkingMessages, (chunk) => {
        raw += chunk;
        if (closed) return;
        if (/<\/thinking>/i.test(raw)) closed = true;
        const visible = stripThinkingTags(extractThinking(raw));
        const delta = visible.slice(thinkingText.length);
        if (delta) {
          thinkingText = visible;
          onThinkingDelta(delta);
        }
      });
      const finalThinking = extractThinking(raw || pass.text);
      if (finalThinking.length > thinkingText.length) onThinkingDelta(finalThinking.slice(thinkingText.length));
      thinkingText = finalThinking;
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") throw e;
      thinkingText = "";
    }
    onThinkingDone?.(thinkingText);
  }

  // ── phase 2: the answer ───────────────────────────────────────────────
  if (thinkingText && lastUserIdx >= 0) {
    apiMessages[lastUserIdx] = { ...apiMessages[lastUserIdx], content: buildAnswerPromptWithThinking(lastUserContent, thinkingText) };
  }

  let requestMessages = apiMessages;
  for (let attempt = 0; attempt <= MAX_STREAM_CONTINUATIONS; attempt++) {
    const before = assistantAccum.length;
    const pass = await runPass(requestMessages, attempt === 0 ? wrappedDelta : undefined);
    if (attempt > 0) {
      const stitched = stitchAiContinuation(assistantAccum, pass.text);
      assistantAccum = stitched.text;
      if (stitched.strategy === "restart-replace" && onReplace) onReplace(stitched.text);
      else if (stitched.delta) onDelta(stitched.delta);
    }
    const latestChunk = assistantAccum.slice(before);
    const mustContinue = pass.incompleteSignal || looksIncomplete(assistantAccum, latestChunk);
    if (!mustContinue || (assistantAccum.length === before && !pass.text)) break;
    requestMessages = [
      ...apiMessages,
      { role: "assistant" as const, content: assistantAccum },
      { role: "user" as const, content: buildExactContinuationPrompt(assistantAccum) },
    ];
  }

  onDone();
}

/* ── one-shot helpers used by other rooms ───────────────────────────────── */

/** A single non-streamed answer from the connected model. */
export async function askModel(prompt: string, opts?: { system?: string; json?: boolean; signal?: AbortSignal; maxTokens?: number }): Promise<string> {
  const r = await resolveActiveModel();
  return completeLlm({
    provider: r.provider,
    model: r.model,
    apiKey: r.apiKey,
    json: opts?.json,
    signal: opts?.signal,
    maxTokens: opts?.maxTokens,
    messages: [
      { role: "system", content: opts?.system ?? buildSystemPrompt({ mode: "chat", depth: "standard", lastUserText: prompt }) },
      { role: "user", content: prompt },
    ],
  });
}

/* ── multi-model consensus ──────────────────────────────────────────────── */

export interface ConsensusModel {
  provider: string;
  model: string;
}

export interface ConsensusResponse {
  provider: string;
  model: string;
  content: string;
  error: string | null;
  latencyMs: number;
}

export interface ConsensusResult {
  consensus: boolean;
  confidence: {
    overallConfidence: number;
    level: "high" | "medium" | "low" | "critical_divergence";
    needsHumanReview: boolean;
    reasons: string[];
    jaccardSimilarity: number;
  };
  crossValidation: {
    provider: string;
    model: string;
    totalClaims: number;
    validatedClaims: number;
    unvalidatedClaims: string[];
    validationRate: number;
  }[];
  ensemble: {
    agreedFacts: string[];
    contestedFacts: string[];
    agreementRatio: number;
  };
  verdict: { index: number; provider: string; model: string } | null;
  responses: ConsensusResponse[];
  timing: { parallelMs: number; totalMs: number };
  similarity?: number;
  modelCount?: number;
  successCount?: number;
}

const tokens = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
const jaccard = (a: Set<string>, b: Set<string>) => {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter || 1);
};
const claims = (s: string) =>
  s
    .split(/(?<=[.!?])\s+|\n+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 20 && !x.startsWith("#") && !x.startsWith("```"))
    .slice(0, 40);

export async function fetchConsensus({ messages, models, mode }: { messages: Msg[]; models: ConsensusModel[]; mode: ChatMode }): Promise<ConsensusResult> {
  const t0 = Date.now();
  const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const system = buildSystemPrompt({ mode, depth: "standard", lastUserText: last });
  const llmMessages = messages.map(toLlmMessage);

  const responses: ConsensusResponse[] = await Promise.all(
    models.map(async (m) => {
      const start = Date.now();
      try {
        let apiKey = "";
        if (providerNeedsKey(m.provider)) {
          apiKey = (await getProviderKey(m.provider)) ?? "";
          if (!apiKey) throw new Error(`no saved key for ${m.provider}`);
        }
        const content = await completeLlm({ provider: m.provider, model: m.model, apiKey, messages: [{ role: "system", content: system }, ...llmMessages] });
        return { provider: m.provider, model: m.model, content, error: null, latencyMs: Date.now() - start };
      } catch (e) {
        return { provider: m.provider, model: m.model, content: "", error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - start };
      }
    }),
  );
  const parallelMs = Date.now() - t0;
  const okResponses = responses.filter((r) => !r.error && r.content);
  const sets = okResponses.map((r) => tokens(r.content));
  let pairs = 0, sum = 0;
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) { sum += jaccard(sets[i], sets[j]); pairs++; }
  const sim = pairs ? sum / pairs : okResponses.length === 1 ? 1 : 0;
  const level: ConsensusResult["confidence"]["level"] = sim >= 0.45 ? "high" : sim >= 0.28 ? "medium" : sim >= 0.15 ? "low" : "critical_divergence";

  const crossValidation = okResponses.map((r, i) => {
    const mine = claims(r.content);
    const others = okResponses.filter((_, j) => j !== i).map((o) => tokens(o.content));
    const validated = mine.filter((c) => others.some((o) => jaccard(tokens(c), o) > 0.12));
    return {
      provider: r.provider,
      model: r.model,
      totalClaims: mine.length,
      validatedClaims: validated.length,
      unvalidatedClaims: mine.filter((c) => !validated.includes(c)).slice(0, 8),
      validationRate: mine.length ? validated.length / mine.length : 0,
    };
  });
  const agreed = crossValidation.flatMap((c) => claims(okResponses.find((r) => r.provider === c.provider && r.model === c.model)?.content ?? "").filter((x) => !c.unvalidatedClaims.includes(x))).slice(0, 10);
  const contested = crossValidation.flatMap((c) => c.unvalidatedClaims).slice(0, 10);
  let verdict: ConsensusResult["verdict"] = null;
  if (okResponses.length) {
    const best = crossValidation.reduce((a, b) => (b.validationRate > a.validationRate ? b : a), crossValidation[0]);
    const idx = responses.findIndex((r) => r.provider === best.provider && r.model === best.model);
    verdict = { index: idx, provider: best.provider, model: best.model };
  }
  return {
    consensus: okResponses.length > 1 && sim >= 0.28,
    confidence: {
      overallConfidence: Math.round(sim * 100),
      level,
      needsHumanReview: level === "low" || level === "critical_divergence",
      reasons: okResponses.length < 2 ? ["fewer than two models answered"] : sim < 0.28 ? ["models diverge on wording or substance"] : [],
      jaccardSimilarity: sim,
    },
    crossValidation,
    ensemble: { agreedFacts: agreed, contestedFacts: contested, agreementRatio: sim },
    verdict,
    responses,
    timing: { parallelMs, totalMs: Date.now() - t0 },
    similarity: sim,
    modelCount: models.length,
    successCount: okResponses.length,
  };
}

/* ── follow-up suggestions ──────────────────────────────────────────────── */

export async function fetchSuggestions(lastMessage: string): Promise<string[]> {
  try {
    const r = await resolveActiveModel();
    const text = await completeLlm({
      provider: r.provider,
      model: r.model,
      apiKey: r.apiKey,
      json: true,
      maxTokens: 300,
      messages: [
        { role: "system", content: 'return only json: {"suggestions": ["…","…","…"]} — three short lowercase follow-up questions a reader might ask next. no prose.' },
        { role: "user", content: lastMessage.slice(0, 4000) },
      ],
    });
    const j = extractJson<{ suggestions?: unknown }>(text);
    return Array.isArray(j?.suggestions) ? (j!.suggestions as unknown[]).map(String).filter(Boolean).slice(0, 3) : [];
  } catch {
    return [];
  }
}
