/**
 * Explainable confidence and claim promotion.
 *
 * The rule that matters: a claim is only promoted to `resolved` by evidence,
 * never by wording, model fluency or similarity. A claim with no cited source
 * stays `weak` at low confidence forever, no matter how confidently it was
 * phrased.
 */

import { countIndependentPublishers, strongerTier } from "./authority";
import type { Assessment, AuthorityTier, Claim, Evidence, Source } from "./types";

const DAY = 86_400_000;

/** How long a claim of each volatility stays fresh once verified. */
export const STALENESS_DAYS: Record<Claim["volatility"], number | null> = {
  static: null,
  slow: 365,
  volatile: 90,
};

export interface AssessInput {
  claim: Claim;
  evidence: Evidence[];
  sources: Source[];
  now?: number;
}

function sourcesFor(evidence: Evidence[], sources: Source[]): Source[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const out: Source[] = [];
  for (const e of evidence) {
    const s = e.sourceId ? byId.get(e.sourceId) : undefined;
    if (s) out.push(s);
  }
  return out;
}

function bestTier(evidence: Evidence[]): AuthorityTier | null {
  let best: AuthorityTier | null = null;
  for (const e of evidence) best = strongerTier(best, e.authorityTier);
  return best;
}

/**
 * Freshness is measured from the last verification, falling back to the newest
 * retrieval. A claim that has never been verified against anything is stale by
 * definition when its subject can change.
 */
export function assessStaleness(
  claim: Claim,
  evidence: Evidence[],
  now = Date.now(),
): { stale: boolean; reason: string | null; ageDays: number | null } {
  const window = STALENESS_DAYS[claim.volatility];
  if (window === null) return { stale: false, reason: null, ageDays: null };

  const stamps = [claim.lastVerifiedAt, ...evidence.map((e) => e.retrievedAt)]
    .filter(Boolean)
    .map((s) => Date.parse(String(s)))
    .filter((n) => Number.isFinite(n));

  if (!stamps.length) {
    return { stale: true, reason: "never verified against a retrieved source", ageDays: null };
  }
  const newest = Math.max(...stamps);
  const ageDays = Math.floor((now - newest) / DAY);
  if (ageDays > window) {
    return {
      stale: true,
      reason: `last checked ${ageDays} days ago; a ${claim.volatility} claim goes stale after ${window}`,
      ageDays,
    };
  }
  return { stale: false, reason: null, ageDays };
}

/**
 * Scores a claim from its evidence alone.
 *
 * Promotion ladder:
 *   resolved     one tier ≤2 supporting source, or two independent tier ≤3
 *                sources, with no contradicting evidence of equal-or-better tier
 *   contradicted contradicting evidence strictly stronger than the support
 *   unresolved   support and contradiction of comparable authority
 *   weak         no cited supporting evidence at all
 */
export function assessClaim({ claim, evidence, sources, now = Date.now() }: AssessInput): Assessment {
  const mine = evidence.filter((e) => e.claimId === claim.id);
  const supporting = mine.filter((e) => e.stance === "supports");
  const contradicting = mine.filter((e) => e.stance === "contradicts");

  const supTier = bestTier(supporting);
  const conTier = bestTier(contradicting);
  const independent = countIndependentPublishers(sourcesFor(supporting, sources));
  const staleness = assessStaleness(claim, mine, now);

  const base: Omit<Assessment, "confidence" | "status" | "reason"> = {
    supportingCount: supporting.length,
    contradictingCount: contradicting.length,
    bestSupportingTier: supTier,
    bestContradictingTier: conTier,
    independentSources: independent,
    stale: staleness.stale,
    staleReason: staleness.reason,
  };

  if (claim.status === "retracted") {
    return { ...base, confidence: 0, status: "retracted", reason: "retracted by the operator" };
  }

  const cited = supporting.filter((e) => e.sourceId || e.documentId);
  if (!cited.length) {
    return {
      ...base,
      confidence: 0.1,
      status: "weak",
      reason:
        contradicting.length > 0
          ? "no cited supporting evidence, and contradicting evidence exists"
          : "no cited supporting evidence — held as an uncited lead, not a finding",
    };
  }

  // Hypotheses and assumptions are never promoted by evidence volume alone;
  // they are promoted only when restated as an observation or fact by a hop.
  if (claim.claimKind === "hypothesis" || claim.claimKind === "assumption") {
    return {
      ...base,
      confidence: Math.min(0.45, 0.2 + 0.05 * cited.length),
      status: "unresolved",
      reason: `${claim.claimKind} with ${cited.length} supporting reference(s) — an ${claim.claimKind} is not resolved by corroboration alone`,
    };
  }

  const strongSupport = supTier !== null && supTier <= 2;
  const corroborated = independent >= 2 && supTier !== null && supTier <= 3;

  if (conTier !== null && supTier !== null && conTier < supTier) {
    return {
      ...base,
      confidence: 0.2,
      status: "contradicted",
      reason: `contradicting evidence is higher authority (tier ${conTier}) than the support (tier ${supTier})`,
    };
  }

  if (contradicting.length && conTier !== null && supTier !== null && conTier === supTier) {
    return {
      ...base,
      confidence: 0.35,
      status: "unresolved",
      reason: `support and contradiction sit at the same authority tier (${supTier}) — kept unresolved rather than picked`,
    };
  }

  if (strongSupport) {
    return {
      ...base,
      confidence: staleness.stale ? 0.7 : Math.min(0.95, 0.75 + 0.05 * Math.min(independent, 3)),
      status: "resolved",
      reason: `tier ${supTier} source (${TIERWORD[supTier as AuthorityTier]}) supports it${
        contradicting.length ? `, outranking ${contradicting.length} weaker contradiction(s)` : ""
      }${staleness.stale ? `; ${staleness.reason}` : ""}`,
    };
  }

  if (corroborated) {
    return {
      ...base,
      confidence: staleness.stale ? 0.5 : 0.65,
      status: "resolved",
      reason: `${independent} independent tier ${supTier} sources agree${staleness.stale ? `; ${staleness.reason}` : ""}`,
    };
  }

  return {
    ...base,
    confidence: 0.3,
    status: "unresolved",
    reason: `single ${supTier !== null ? `tier ${supTier}` : "unranked"} source — one report is not corroboration`,
  };
}

const TIERWORD: Record<AuthorityTier, string> = {
  1: "official record",
  2: "primary-adjacent",
  3: "reported",
  4: "self-published",
  5: "unattributed",
};

/** Guard used before anything is displayed as an established finding. */
export function isPromotableToFact(assessment: Assessment): boolean {
  return assessment.status === "resolved" && assessment.supportingCount > 0 && !!assessment.bestSupportingTier;
}
