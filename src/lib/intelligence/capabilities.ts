// model capability resolution.
//
// capabilities are declared per model family and checked before a task is
// routed. an unsupported capability is reported as unsupported — never assumed
// and never silently degraded into a text-only answer that pretends otherwise.

import type { ModelCapabilities, TaskModality } from "./types";

const BASE: ModelCapabilities = {
  textInput: true,
  textOutput: true,
  vision: false,
  imageGeneration: false,
  audioInput: false,
  audioOutput: false,
  toolCalling: false,
  structuredOutput: false,
  contextWindow: 8_000,
  codingSuitability: "medium",
};

interface Rule {
  match: RegExp;
  caps: Partial<ModelCapabilities>;
}

const PROVIDER_RULES: Record<string, Rule[]> = {
  google: [
    { match: /gemini-3-pro/i, caps: { vision: true, toolCalling: true, structuredOutput: true, contextWindow: 1_000_000, codingSuitability: "high" } },
    { match: /gemini-3-flash/i, caps: { vision: true, toolCalling: true, structuredOutput: true, contextWindow: 1_000_000, codingSuitability: "high" } },
    { match: /gemini-2\.5-pro/i, caps: { vision: true, toolCalling: true, structuredOutput: true, contextWindow: 1_000_000, codingSuitability: "high" } },
    { match: /gemini-2\.5-flash/i, caps: { vision: true, toolCalling: true, structuredOutput: true, contextWindow: 1_000_000, codingSuitability: "medium" } },
    { match: /gemini-1\.5-pro/i, caps: { vision: true, toolCalling: true, structuredOutput: true, contextWindow: 2_000_000, codingSuitability: "medium" } },
    { match: /gemini/i, caps: { vision: true, contextWindow: 32_000 } },
  ],
  openai: [
    { match: /gpt-5\.5|gpt-5\b/i, caps: { vision: true, toolCalling: true, structuredOutput: true, contextWindow: 400_000, codingSuitability: "high" } },
    { match: /gpt-5-mini/i, caps: { vision: true, toolCalling: true, structuredOutput: true, contextWindow: 400_000, codingSuitability: "medium" } },
    { match: /gpt-4\.1/i, caps: { vision: true, toolCalling: true, structuredOutput: true, contextWindow: 1_000_000, codingSuitability: "high" } },
    { match: /gpt-4o/i, caps: { vision: true, toolCalling: true, structuredOutput: true, contextWindow: 128_000, codingSuitability: "medium" } },
    { match: /gpt-3\.5/i, caps: { toolCalling: true, contextWindow: 16_000, codingSuitability: "low" } },
  ],
  anthropic: [
    { match: /claude-(opus|sonnet)/i, caps: { vision: true, toolCalling: true, structuredOutput: true, contextWindow: 200_000, codingSuitability: "high" } },
    { match: /claude/i, caps: { vision: true, toolCalling: true, contextWindow: 200_000, codingSuitability: "medium" } },
  ],
  mistral: [{ match: /./, caps: { toolCalling: true, contextWindow: 128_000, codingSuitability: "medium" } }],
  venice: [{ match: /./, caps: { contextWindow: 32_000, codingSuitability: "medium" } }],
  groq: [{ match: /./, caps: { toolCalling: true, contextWindow: 128_000, codingSuitability: "medium" } }],
  deepseek: [{ match: /./, caps: { toolCalling: true, contextWindow: 128_000, codingSuitability: "high" } }],
  xai: [{ match: /./, caps: { vision: true, toolCalling: true, contextWindow: 128_000, codingSuitability: "high" } }],
};

export function resolveCapabilities(providerId: string, modelId: string): ModelCapabilities {
  const rules = PROVIDER_RULES[providerId] ?? [];
  const hit = rules.find((r) => r.match.test(modelId));
  return { ...BASE, ...(hit?.caps ?? {}) };
}

export interface CapabilityRequirement {
  capability: keyof ModelCapabilities;
  why: string;
}

export function requirementsFor(modality: TaskModality, hasImageInput: boolean): CapabilityRequirement[] {
  const reqs: CapabilityRequirement[] = [];
  if (hasImageInput) reqs.push({ capability: "vision", why: "an image was attached" });
  if (modality === "image") reqs.push({ capability: "imageGeneration", why: "the task asks for a generated image" });
  if (modality === "vision") reqs.push({ capability: "vision", why: "the task is about reading an image" });
  return reqs;
}

export interface RoutingDecision {
  routable: boolean;
  missing: { capability: string; why: string }[];
  notes: string[];
}

/** route on real capability. missing capability is reported, never assumed. */
export function routeTask(
  caps: ModelCapabilities,
  modality: TaskModality,
  opts: { hasImageInput?: boolean; estimatedTokens?: number } = {},
): RoutingDecision {
  const missing: RoutingDecision["missing"] = [];
  const notes: string[] = [];

  for (const req of requirementsFor(modality, !!opts.hasImageInput)) {
    if (!caps[req.capability]) missing.push({ capability: req.capability, why: req.why });
  }

  if (opts.estimatedTokens && opts.estimatedTokens > caps.contextWindow) {
    missing.push({
      capability: "contextWindow",
      why: `about ${opts.estimatedTokens} tokens needed, the model holds ${caps.contextWindow}`,
    });
  }

  if ((modality === "code" || modality === "debugging") && caps.codingSuitability === "low") {
    notes.push("this model is weak on code — the answer may need more checking than usual");
  }

  return { routable: missing.length === 0, missing, notes };
}
