// modality router — decides what the runtime can honestly do.
//
// The router never promises execution for something that cannot execute here.
// The only genuine execution environment in this app is the sandboxed browser
// frame (client-side HTML/CSS/JS/TS/React through in-page babel). Everything
// else renders, computes, or is validated as a model only.

import type { ArtifactCapability, ArtifactModality } from "./types";

const SIGNALS: Array<{ modality: ArtifactModality; re: RegExp }> = [
  { modality: "web", re: /\b(game|app|widget|interactive|canvas|simulation of|playable|calculator|component|page|dashboard ui|snake|prototype)\b/i },
  { modality: "data", re: /\b(chart|graph of|plot|dataset|csv|table of|visuali[sz]e|metrics|distribution)\b/i },
  { modality: "document", re: /\b(document|report|write[- ]?up|memo|readme|spec|brief|essay|letter|contract draft)\b/i },
  { modality: "research", re: /\b(research|osint|investigate|sources?|evidence|dossier|background on)\b/i },
  { modality: "design", re: /\b(design|layout|wireframe|mockup|palette|typography|brand)\b/i },
  { modality: "image", re: /\b(image|illustration|logo|picture|render an? (image|art)|poster)\b/i },
  { modality: "simulation", re: /\b(simulate|simulation|model the|monte carlo|projection|what if)\b/i },
  { modality: "plan", re: /\b(plan|roadmap|milestones?|schedule|strategy for|phased)\b/i },
  { modality: "workflow", re: /\b(workflow|pipeline|automation|sequence of steps|process for)\b/i },
];

export function detectModality(text: string): ArtifactModality {
  const t = text || "";
  const hits = SIGNALS.map((s) => ({ modality: s.modality, n: (t.match(new RegExp(s.re.source, "gi")) ?? []).length }))
    .filter((h) => h.n > 0)
    .sort((a, b) => b.n - a.n);
  return hits[0]?.modality ?? "unknown";
}

export interface CapabilityDecision {
  capability: ArtifactCapability;
  reason: string;
}

export interface RuntimeEnvironment {
  /** the sandboxed iframe is usable in this session. */
  browserSandbox: boolean;
  browserSandboxReason?: string;
  /** an image generation path is wired for this user. */
  imageGeneration: boolean;
  imageGenerationReason?: string;
}

export function probeRuntime(overrides: Partial<RuntimeEnvironment> = {}): RuntimeEnvironment {
  const hasDom = typeof document !== "undefined" && typeof HTMLIFrameElement !== "undefined";
  return {
    browserSandbox: overrides.browserSandbox ?? hasDom,
    browserSandboxReason: overrides.browserSandboxReason ?? (hasDom ? undefined : "no browser document in this context"),
    imageGeneration: overrides.imageGeneration ?? false,
    imageGenerationReason:
      overrides.imageGenerationReason ?? "image generation is not wired into the artifact runtime",
  };
}

export function resolveCapability(modality: ArtifactModality, env: RuntimeEnvironment): CapabilityDecision {
  switch (modality) {
    case "web":
      return env.browserSandbox
        ? { capability: "execute", reason: "client-side artifact runs in the sandboxed frame" }
        : { capability: "unavailable", reason: env.browserSandboxReason ?? "no sandbox available" };
    case "simulation":
      return env.browserSandbox
        ? { capability: "execute", reason: "the simulation is client-side and runs in the sandboxed frame" }
        : { capability: "compute", reason: "no sandbox — the simulation is computed in page instead" };
    case "data":
      return { capability: "compute", reason: "the data is transformed and rendered in page, not executed" };
    case "document":
    case "design":
    case "plan":
    case "workflow":
      return { capability: "render", reason: "this artifact is displayed and checked, it does not execute" };
    case "research":
      return { capability: "validate_only", reason: "research output is checked against its contract, not run" };
    case "image":
      return env.imageGeneration
        ? { capability: "render", reason: "a generated image is displayed" }
        : { capability: "unavailable", reason: env.imageGenerationReason ?? "image generation is not available here" };
    default:
      return { capability: "validate_only", reason: "the modality is unclear, so only the model is checked" };
  }
}
