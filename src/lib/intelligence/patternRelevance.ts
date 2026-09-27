// retrieval. the point is relevant intelligence, not maximum context volume:
// a ranked handful of patterns beats the whole registry pasted into a prompt.

import type { PatternCoverage, PatternObject, RetrievedPattern, TaskFrame } from "./types";
import { scopeVisible } from "./scope";

const STATUS_WEIGHT: Record<string, number> = {
  active: 1,
  validated: 0.85,
  refined: 0.9,
  testing: 0.5,
  candidate: 0.35,
  observed: 0.15,
  failed: 0.05,
  quarantined: 0,
  superseded: 0,
  archived: 0,
};

function tokens(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((t) => t.length > 2);
}

export interface RetrievalContext {
  conversationId: string;
  projectId?: string | null;
  query: string;
  task: TaskFrame;
  limit?: number;
}

export function scorePattern(p: PatternObject, ctx: RetrievalContext): { score: number; why: string[] } {
  const why: string[] = [];
  const text = tokens(`${ctx.query} ${ctx.task.goal} ${ctx.task.domains.join(" ")}`);
  const bag = new Set(text);

  let score = 0;

  let triggerHits = 0;
  for (const term of p.triggerTerms) {
    const t = term.toLowerCase().trim();
    if (!t) continue;
    if (t.includes(" ")) {
      if (`${ctx.query} ${ctx.task.goal}`.toLowerCase().includes(t)) triggerHits += 2;
    } else if (bag.has(t)) {
      triggerHits += 1;
    }
  }
  if (triggerHits > 0) {
    score += Math.min(6, triggerHits) * 0.6;
    why.push(`${triggerHits} trigger match${triggerHits === 1 ? "" : "es"}`);
  }

  if (ctx.task.domains.includes(p.domain)) {
    score += 1.2;
    why.push(`domain ${p.domain}`);
  }
  if (p.domain === "general" || p.abstractionLevel === "meta") {
    score += 0.4;
    why.push("cross-domain applicability");
  }

  const statusWeight = STATUS_WEIGHT[p.status] ?? 0;
  score *= statusWeight;
  if (statusWeight < 1) why.push(`${p.status} pattern (weight ${statusWeight})`);

  score *= 0.5 + p.confidence / 2;

  if (p.scope === "project" && ctx.projectId && p.projectId === ctx.projectId) {
    score += 0.8;
    why.push("project-specific");
  }
  if (p.scope === "conversation" && p.conversationId === ctx.conversationId) {
    score += 0.5;
    why.push("learned in this conversation");
  }

  return { score: Math.round(score * 100) / 100, why };
}

export function retrievePatterns(all: PatternObject[], ctx: RetrievalContext): RetrievedPattern[] {
  const limit = ctx.limit ?? 7;
  return all
    .filter((p) => scopeVisible(p, { conversationId: ctx.conversationId, projectId: ctx.projectId }))
    // quarantined patterns are kept for audit but must never influence an answer.
    .filter((p) => p.status !== "archived" && p.status !== "superseded" && p.status !== "quarantined")
    .map((p) => {
      const { score, why } = scorePattern(p, ctx);
      return { pattern: p, relevance: score, why };
    })
    .filter((r) => r.relevance > 0.35)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit);
}

const COVERED_THRESHOLD = 2.0;
const PARTIAL_THRESHOLD = 0.9;

/**
 * coverage check. when nothing sufficiently applicable exists, the honest answer
 * is unknown — which is what triggers discovery instead of forcing a pattern
 * that does not fit.
 */
export function checkCoverage(retrieved: RetrievedPattern[], task: TaskFrame): PatternCoverage {
  const best = retrieved[0]?.relevance ?? 0;
  const covered = retrieved.filter((r) => r.relevance >= PARTIAL_THRESHOLD);
  const missing: string[] = [];

  const domainsCovered = new Set(covered.map((r) => r.pattern.domain));
  for (const d of task.domains) {
    if (!domainsCovered.has(d) && d !== "general") missing.push(`no pattern for domain ${d}`);
  }
  if (task.unknowns.length > 0 && covered.length === 0) {
    missing.push("open unknowns with no applicable procedure");
  }

  let state: PatternCoverage["state"] = "unknown";
  if (best >= COVERED_THRESHOLD && missing.length === 0) state = "covered";
  else if (best >= PARTIAL_THRESHOLD) state = "partial";

  return { state, bestScore: best, missing };
}
