// the learning gate — the hard architectural boundary.
//
// the model may PROPOSE learning. it may not write memory or patterns. every
// proposal passes through classification, policy and validation here, and every
// decision is recorded so the reasoning is auditable later.

import type {
  IntelligenceSettings,
  LearningDecision,
  MemoryCandidate,
  MemoryRecord,
  PatternObject,
  ValidationReport,
} from "./types";
import { classifyScope, canPromoteScope } from "./scope";
import { checkActivation } from "./patternLifecycle";
import { guardMemoryContent } from "@/lib/memory/memoryKinds";

export interface ProposedMemory {
  content: string;
  kind: MemoryCandidate["kind"];
  rationale?: string;
  conversationId: string;
  projectId?: string | null;
}

export interface GateContext {
  settings: IntelligenceSettings;
  hasProject: boolean;
  /** how many times an equivalent item has already been observed. */
  repeatCount?: number;
  existing?: MemoryRecord[];
}

export interface GateResult<T> {
  outcome: "promoted" | "candidate" | "rejected" | "held";
  value: T | null;
  decisions: LearningDecision[];
}

const MIN_LEN = 8;
const MAX_LEN = 600;

/** promotion policy for memory. content-shaped rules, not model discretion. */
export function gateMemory(proposal: ProposedMemory, ctx: GateContext): GateResult<MemoryCandidate> {
  const decisions: LearningDecision[] = [];
  const content = proposal.content.trim();

  const reject = (reason: string): GateResult<MemoryCandidate> => {
    decisions.push({ stage: "policy", decision: "rejected", subjectType: "memory", reason });
    return { outcome: "rejected", value: null, decisions };
  };

  if (content.length < MIN_LEN) return reject("too short to be a durable rule");
  if (content.length > MAX_LEN) return reject("too long — memory holds rules, not transcripts");

  // credentials never enter memory. this is not negotiable and runs first.
  const guard = guardMemoryContent(content);
  if (!guard.ok) return reject(guard.reason ?? "refused by the memory guard");

  const scopeResult = classifyScope(content, { hasProject: ctx.hasProject, repeatCount: ctx.repeatCount });
  decisions.push({
    stage: "classify",
    decision: "recorded",
    subjectType: "memory",
    reason: `scope ${scopeResult.scope}: ${scopeResult.reasons.join("; ")}`,
    detail: { scope: scopeResult.scope, confidence: scopeResult.confidence },
  });

  if (scopeResult.scope === "task") return reject("explicitly temporary — belongs to this turn only");

  const duplicate = (ctx.existing ?? []).find(
    (m) => m.content.trim().toLowerCase() === content.toLowerCase(),
  );
  if (duplicate) {
    decisions.push({
      stage: "policy",
      decision: "held",
      subjectType: "memory",
      reason: "already stored — evidence count increased instead of a duplicate row",
    });
    return { outcome: "held", value: null, decisions };
  }

  const candidate: MemoryCandidate = {
    conversationId: proposal.conversationId,
    projectId: proposal.projectId ?? null,
    proposedScope: scopeResult.scope,
    kind: proposal.kind,
    content,
    rationale: proposal.rationale,
    evidence: [{ kind: "observation", note: "proposed during a conversation turn", conversationId: proposal.conversationId }],
    confidence: scopeResult.confidence,
    status: "pending",
  };

  // memory OFF: candidates are still classified so the current conversation can
  // use them, but nothing durable is written. that is the whole boundary.
  if (!ctx.settings.memoryEnabled) {
    decisions.push({
      stage: "policy",
      decision: "held",
      subjectType: "memory",
      reason: "memory is off — nothing persisted beyond this conversation",
    });
    return { outcome: "held", value: candidate, decisions };
  }

  if (!ctx.settings.learningEnabled) {
    decisions.push({ stage: "policy", decision: "held", subjectType: "memory", reason: "learning is off" });
    return { outcome: "held", value: candidate, decisions };
  }

  const repeats = ctx.repeatCount ?? 1;
  const needsRepeat = scopeResult.scope === "user" || scopeResult.scope === "domain";
  if (needsRepeat && repeats < 2 && scopeResult.confidence < 0.7) {
    candidate.status = "pending";
    candidate.decisionReason = "one observation is not enough evidence for a standing rule";
    decisions.push({
      stage: "policy",
      decision: "held",
      subjectType: "memory",
      reason: candidate.decisionReason,
    });
    return { outcome: "candidate", value: candidate, decisions };
  }

  candidate.status = "promoted";
  decisions.push({
    stage: "promote",
    decision: "accepted",
    subjectType: "memory",
    reason: `promoted to ${scopeResult.scope} memory`,
  });
  return { outcome: "promoted", value: candidate, decisions };
}

/** a candidate widening its own scope must go one step, with fresh evidence. */
export function gateScopeWidening(
  candidate: MemoryCandidate,
  to: MemoryCandidate["proposedScope"],
  evidenceCount: number,
): GateResult<MemoryCandidate> {
  const decisions: LearningDecision[] = [];
  if (!canPromoteScope(candidate.proposedScope, to)) {
    decisions.push({
      stage: "policy",
      decision: "rejected",
      subjectType: "memory",
      reason: `${candidate.proposedScope} cannot widen straight to ${to}`,
    });
    return { outcome: "rejected", value: null, decisions };
  }
  if (evidenceCount < 3) {
    decisions.push({
      stage: "policy",
      decision: "held",
      subjectType: "memory",
      reason: `widening to ${to} needs three independent observations, has ${evidenceCount}`,
    });
    return { outcome: "held", value: candidate, decisions };
  }
  decisions.push({ stage: "promote", decision: "accepted", subjectType: "memory", reason: `widened to ${to}` });
  return { outcome: "promoted", value: { ...candidate, proposedScope: to }, decisions };
}

/** pattern promotion. generation is not validation. */
export function gatePattern(
  pattern: PatternObject,
  ctx: { settings: IntelligenceSettings; validation?: ValidationReport },
): GateResult<PatternObject> {
  const decisions: LearningDecision[] = [];

  if (!ctx.settings.learningEnabled) {
    decisions.push({ stage: "policy", decision: "held", subjectType: "pattern", reason: "learning is off" });
    return { outcome: "held", value: pattern, decisions };
  }

  if (pattern.procedure.length === 0 && !pattern.mechanism) {
    decisions.push({
      stage: "policy",
      decision: "rejected",
      subjectType: "pattern",
      reason: "a pattern with no mechanism and no procedure is not a pattern",
    });
    return { outcome: "rejected", value: null, decisions };
  }

  const activation = checkActivation(pattern);
  if (!activation.eligible) {
    decisions.push({
      stage: "validate",
      decision: "held",
      subjectType: "pattern",
      reason: `stays a hypothesis: ${activation.blockers.join("; ")}`,
    });
    return { outcome: "candidate", value: { ...pattern, status: pattern.status === "observed" ? "candidate" : pattern.status }, decisions };
  }

  if (ctx.validation && ctx.validation.verdict === "needs_revision") {
    decisions.push({
      stage: "validate",
      decision: "held",
      subjectType: "pattern",
      reason: "the run that would have promoted it failed validation",
    });
    return { outcome: "candidate", value: pattern, decisions };
  }

  decisions.push({ stage: "promote", decision: "accepted", subjectType: "pattern", reason: "evidence bar met" });
  return { outcome: "promoted", value: { ...pattern, status: "active" }, decisions };
}
