// pattern governance — provenance, permissions and review.
//
// every pattern must be able to answer: where did you come from, what evidence
// kept you, who changed you, what are you not allowed to do, and when should
// you be reconsidered. a pattern that cannot answer those is quarantined rather
// than trusted.

import type { LearningScope, MemoryRecord, PatternObject, PatternSource } from "./types";

export interface GovernanceAudit {
  at: string;
  event: "created" | "promoted" | "modified" | "quarantined" | "released" | "retired" | "reviewed" | "failed";
  note: string;
}

export interface PatternGovernance {
  provenance: {
    source: PatternSource;
    /** the concrete event that produced it — a correction, a transfer, a seed. */
    creatorEvent: string;
    conversationId?: string | null;
    projectId?: string | null;
    createdAt: string;
  };
  permissions: {
    /** the widest scope this pattern may ever be read into. */
    maxScope: LearningScope;
    /** may an abstracted form be offered to the shared library. */
    shareable: boolean;
  };
  securityConstraints: string[];
  privacyConstraints: string[];
  activationConditions: string[];
  exclusionConditions: string[];
  /** iso date after which the pattern must be re-examined against new outcomes. */
  reviewAfter: string;
  auditTrail: GovernanceAudit[];
}

const DAY = 86_400_000;

function reviewHorizon(scope: LearningScope): number {
  switch (scope) {
    case "ephemeral":
    case "task":
      return 1;
    case "conversation":
      return 7;
    case "project":
      return 30;
    case "user":
      return 60;
    default:
      return 90;
  }
}

export function buildGovernance(
  pattern: PatternObject,
  opts: { creatorEvent: string; conversationId?: string | null; projectId?: string | null; now?: Date },
): PatternGovernance {
  const now = opts.now ?? new Date();
  return {
    provenance: {
      source: pattern.source,
      creatorEvent: opts.creatorEvent,
      conversationId: opts.conversationId ?? null,
      projectId: opts.projectId ?? null,
      createdAt: now.toISOString(),
    },
    permissions: {
      // a pattern may never be read wider than the scope it was learned at.
      maxScope: pattern.scope,
      shareable: pattern.scope !== "user" && pattern.scope !== "project" && pattern.scope !== "conversation",
    },
    securityConstraints: [
      "carries no credential, key, token or personal identifier",
      "does not authorise an action the operator has not authorised",
    ],
    privacyConstraints: [
      "quotes no user text verbatim when shared beyond its own scope",
      "names no file, person or organisation outside its scope",
    ],
    activationConditions: pattern.preconditions.length ? [...pattern.preconditions] : ["no precondition recorded — treat as untested"],
    exclusionConditions: pattern.failureModes.map((f) => f.whenFails),
    reviewAfter: new Date(now.getTime() + reviewHorizon(pattern.scope) * DAY).toISOString(),
    auditTrail: [{ at: now.toISOString(), event: "created", note: opts.creatorEvent }],
  };
}

export function recordAudit(
  governance: PatternGovernance | undefined,
  event: GovernanceAudit["event"],
  note: string,
  now: Date = new Date(),
): PatternGovernance | undefined {
  if (!governance) return governance;
  return {
    ...governance,
    auditTrail: [...governance.auditTrail, { at: now.toISOString(), event, note }].slice(-50),
  };
}

export function isReviewDue(governance: PatternGovernance | undefined, now: Date = new Date()): boolean {
  if (!governance?.reviewAfter) return false;
  return new Date(governance.reviewAfter).getTime() <= now.getTime();
}

export interface QuarantineVerdict {
  quarantine: boolean;
  reasons: string[];
}

/**
 * a pattern is quarantined — kept, but never activated — when it has no
 * traceable origin, when it contradicts a standing rule, or when its own
 * outcome record says it does more harm than good.
 */
export function assessQuarantine(
  pattern: PatternObject,
  ctx: { standingRules?: MemoryRecord[]; now?: Date } = {},
): QuarantineVerdict {
  const reasons: string[] = [];

  if (!pattern.governance?.provenance?.creatorEvent) {
    reasons.push("no recorded origin — a pattern with no provenance cannot be trusted to act");
  }
  if (pattern.failureCount >= 3 && pattern.failureCount > pattern.successCount) {
    reasons.push(`failed ${pattern.failureCount} times against ${pattern.successCount} successes`);
  }
  if (pattern.evidenceQuality === "none" && pattern.status === "active") {
    reasons.push("marked active with no evidence behind it");
  }
  if (isReviewDue(pattern.governance, ctx.now) && pattern.successCount === 0) {
    reasons.push("review date passed without a single recorded success");
  }

  const contradiction = (ctx.standingRules ?? []).find((rule) => contradicts(pattern, rule));
  if (contradiction) {
    reasons.push(`contradicts a standing rule: ${contradiction.content}`);
  }

  return { quarantine: reasons.length > 0, reasons };
}

/** cheap, explicit contradiction test: a "never x" rule against a procedure that does x. */
function contradicts(pattern: PatternObject, rule: MemoryRecord): boolean {
  if (rule.kind !== "never" || rule.status !== "active") return false;
  const forbidden = rule.content
    .toLowerCase()
    .replace(/^(never|don'?t|do not|stop)\s+/, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 4);
  if (forbidden.length === 0) return false;
  const body = [pattern.mechanism ?? "", ...pattern.procedure].join(" ").toLowerCase();
  const hits = forbidden.filter((w) => body.includes(w)).length;
  return hits >= Math.max(2, Math.ceil(forbidden.length * 0.6));
}

/** apply the verdict without losing history. quarantine is reversible. */
export function applyQuarantine(pattern: PatternObject, verdict: QuarantineVerdict, now: Date = new Date()): PatternObject {
  if (!verdict.quarantine) return pattern;
  return {
    ...pattern,
    status: "quarantined",
    governance: recordAudit(pattern.governance, "quarantined", verdict.reasons.join("; "), now),
  };
}
