// scope classification and the isolation rules that hold the architecture apart.
//
// the single most common way an "adaptive ai" turns into a privacy incident is
// letting one scope silently become another: a task-specific hack becomes a
// user preference, a project detail becomes global knowledge. every promotion
// here is explicit and one step at a time.

import type { LearningScope } from "./types";

const ORDER: LearningScope[] = ["ephemeral", "task", "conversation", "project", "user", "domain", "global"];

export function scopeRank(scope: LearningScope): number {
  return ORDER.indexOf(scope);
}

/** a scope may only be widened one step, and never straight into global. */
export function canPromoteScope(from: LearningScope, to: LearningScope): boolean {
  const a = scopeRank(from);
  const b = scopeRank(to);
  if (a < 0 || b < 0) return false;
  if (b <= a) return false;
  if (to === "global") return false; // global only via the abstraction gateway
  return b - a === 1;
}

/** is a stored item allowed to be read into this runtime context? */
export function scopeVisible(
  item: { scope: LearningScope; conversationId?: string | null; projectId?: string | null },
  ctx: { conversationId: string; projectId?: string | null },
): boolean {
  switch (item.scope) {
    case "ephemeral":
      return false; // one response only — never read back
    case "task":
      return false; // task scope never survives its own turn
    case "conversation":
      return !!item.conversationId && item.conversationId === ctx.conversationId;
    case "project":
      return !!item.projectId && !!ctx.projectId && item.projectId === ctx.projectId;
    case "user":
    case "domain":
      return true;
    case "global":
      return true;
    default:
      return false;
  }
}

const PROJECT_SIGNALS = [
  /\bthis (repo|repository|codebase|project|app)\b/i,
  /\buses? (supabase|postgres|react|vite|tailwind|deno|next\.?js|django|rails)\b/i,
  /\bour (schema|stack|pipeline|deployment|convention)\b/i,
  /\bin this (file|module|service|folder)\b/i,
];

const USER_SIGNALS = [
  /\bi (prefer|like|want|hate|always|never)\b/i,
  /\bstop (doing|creating|adding|writing)\b/i,
  /\bdon'?t (ever )?(do|add|create|use)\b/i,
  /\bfrom now on\b/i,
  /\bevery time\b/i,
];

const TASK_SIGNALS = [
  /\bfor (this|the current) (task|one|fix|turn|message)\b/i,
  /\bjust (this|for now)\b/i,
  /\btemporar(y|ily)\b/i,
  /\bone[- ]off\b/i,
];

const MECHANISM_SIGNALS = [
  /\bwhen .{3,60} (then|prefer|first|before)\b/i,
  /\btrace .{3,40} before\b/i,
  /\breproduce (it|the (bug|issue|failure))\b/i,
];

export interface ScopeClassification {
  scope: LearningScope;
  confidence: number;
  reasons: string[];
}

/**
 * classify the scope of a candidate learning item from its own wording plus the
 * context it arrived in. deliberately conservative: an ambiguous item stays at
 * conversation scope rather than being upgraded into the user vault.
 */
export function classifyScope(
  content: string,
  ctx: { hasProject: boolean; repeatCount?: number } = { hasProject: false },
): ScopeClassification {
  const reasons: string[] = [];
  const text = content.trim();
  if (!text) return { scope: "task", confidence: 0, reasons: ["empty"] };

  if (TASK_SIGNALS.some((re) => re.test(text))) {
    reasons.push("explicitly framed as temporary");
    return { scope: "task", confidence: 0.8, reasons };
  }

  const projectHit = PROJECT_SIGNALS.some((re) => re.test(text));
  const userHit = USER_SIGNALS.some((re) => re.test(text));
  const mechanismHit = MECHANISM_SIGNALS.some((re) => re.test(text));

  if (projectHit && ctx.hasProject) {
    reasons.push("describes this project's stack or conventions");
    return { scope: "project", confidence: 0.7, reasons };
  }
  if (projectHit && !ctx.hasProject) {
    reasons.push("project-shaped but no project is active");
    return { scope: "conversation", confidence: 0.4, reasons };
  }
  if (userHit) {
    reasons.push("stated as a standing preference");
    const repeats = ctx.repeatCount ?? 1;
    return { scope: "user", confidence: repeats > 1 ? 0.8 : 0.55, reasons };
  }
  if (mechanismHit) {
    reasons.push("reads as a reusable mechanism, not a personal fact");
    return { scope: "domain", confidence: 0.45, reasons };
  }

  reasons.push("no widening signal — held at conversation scope");
  return { scope: "conversation", confidence: 0.3, reasons };
}
