// pattern lifecycle. a pattern the system just invented is a hypothesis; it is
// not allowed to present itself as established knowledge until evidence says so.

import type { EvidenceQuality, PatternObject, PatternStatus } from "./types";

// quarantine is reachable from every live state and is reversible only back to
// candidate — a quarantined pattern must re-earn its evidence, never resume as active.
const ALLOWED: Record<PatternStatus, PatternStatus[]> = {
  observed: ["candidate", "quarantined", "archived"],
  candidate: ["testing", "failed", "quarantined", "archived"],
  testing: ["validated", "failed", "candidate", "quarantined"],
  validated: ["active", "failed", "quarantined", "archived"],
  active: ["refined", "superseded", "failed", "quarantined", "archived"],
  refined: ["active", "superseded", "failed", "quarantined", "archived"],
  quarantined: ["candidate", "failed", "archived"],
  superseded: ["archived"],
  failed: ["candidate", "archived"],
  archived: [],
};

export function canTransition(from: PatternStatus, to: PatternStatus): boolean {
  return (ALLOWED[from] ?? []).includes(to);
}

export function transition(
  pattern: PatternObject,
  to: PatternStatus,
  reason: string,
): { ok: true; pattern: PatternObject } | { ok: false; reason: string } {
  if (!canTransition(pattern.status, to)) {
    return { ok: false, reason: `cannot move a ${pattern.status} pattern to ${to}` };
  }
  const next: PatternObject = { ...pattern, status: to };
  next.evidence = [
    ...pattern.evidence,
    { kind: "observation", note: `status ${pattern.status} -> ${to}: ${reason}`, at: new Date().toISOString() },
  ];
  return { ok: true, pattern: next };
}

/** minimum bar to leave hypothesis territory. deliberately not one success. */
export const ACTIVATION_POLICY = {
  minSuccesses: 3,
  minConfidence: 0.6,
  maxFailureRatio: 0.34,
  minEvidenceQuality: "moderate" as EvidenceQuality,
};

const QUALITY_RANK: Record<EvidenceQuality, number> = { none: 0, weak: 1, moderate: 2, strong: 3 };

export interface ActivationCheck {
  eligible: boolean;
  blockers: string[];
}

export function checkActivation(p: PatternObject): ActivationCheck {
  const blockers: string[] = [];
  const total = p.successCount + p.failureCount;
  if (p.successCount < ACTIVATION_POLICY.minSuccesses) {
    blockers.push(`needs ${ACTIVATION_POLICY.minSuccesses} successful uses, has ${p.successCount}`);
  }
  if (p.confidence < ACTIVATION_POLICY.minConfidence) {
    blockers.push(`confidence ${p.confidence.toFixed(2)} below ${ACTIVATION_POLICY.minConfidence}`);
  }
  if (total > 0 && p.failureCount / total > ACTIVATION_POLICY.maxFailureRatio) {
    blockers.push("failure rate too high");
  }
  if (QUALITY_RANK[p.evidenceQuality] < QUALITY_RANK[ACTIVATION_POLICY.minEvidenceQuality]) {
    blockers.push(`evidence is ${p.evidenceQuality}`);
  }
  return { eligible: blockers.length === 0, blockers };
}

/**
 * confidence from observed outcomes. laplace-smoothed so a single success does
 * not read as certainty, and a single failure does not erase a good record.
 */
export function recomputeConfidence(successCount: number, failureCount: number): number {
  const value = (successCount + 1) / (successCount + failureCount + 2);
  return Math.round(value * 100) / 100;
}

export function evidenceQualityFor(successCount: number, distinctContexts: number): EvidenceQuality {
  if (successCount === 0) return "none";
  if (successCount >= 5 && distinctContexts >= 3) return "strong";
  if (successCount >= 3 && distinctContexts >= 2) return "moderate";
  return "weak";
}

/** a failed pattern keeps its failure knowledge — that is the useful part. */
export function recordFailure(p: PatternObject, whenFails: string, repair?: string): PatternObject {
  return {
    ...p,
    failureCount: p.failureCount + 1,
    failureModes: [...p.failureModes, { whenFails, repair, observedAt: new Date().toISOString() }],
    confidence: recomputeConfidence(p.successCount, p.failureCount + 1),
  };
}

export function recordSuccess(p: PatternObject, context: string): PatternObject {
  const contexts = p.contextsUsed.includes(context) ? p.contextsUsed : [...p.contextsUsed, context];
  const successCount = p.successCount + 1;
  return {
    ...p,
    successCount,
    contextsUsed: contexts,
    confidence: recomputeConfidence(successCount, p.failureCount),
    evidenceQuality: evidenceQualityFor(successCount, contexts.length),
  };
}

/** a new version never overwrites: it supersedes, and the old one is retained. */
export function nextVersion(p: PatternObject, changes: Partial<PatternObject>, reason: string): PatternObject {
  return {
    ...p,
    ...changes,
    version: p.version + 1,
    status: "refined",
    evidence: [
      ...p.evidence,
      { kind: "observation", note: `v${p.version} -> v${p.version + 1}: ${reason}`, at: new Date().toISOString() },
    ],
  };
}
