/**
 * Contradiction detection and authority-based resolution.
 *
 * A conflict is never deleted. When one side rests on a stronger source the
 * favoured claim is marked and the reason recorded, but the losing claim stays
 * in the investigation with its evidence intact. When neither side outranks the
 * other, the conflict stays `unresolved` — the system does not pick.
 */

import type { AuthorityTier, Claim, Contradiction, Evidence } from "./types";
import { strongerTier } from "./authority";

function norm(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Two intervals overlap when neither ends before the other begins. */
export function periodsOverlap(a: Claim, b: Claim): boolean {
  const aFrom = a.validFrom ? Date.parse(a.validFrom) : -Infinity;
  const aTo = a.validTo ? Date.parse(a.validTo) : Infinity;
  const bFrom = b.validFrom ? Date.parse(b.validFrom) : -Infinity;
  const bTo = b.validTo ? Date.parse(b.validTo) : Infinity;
  return aFrom <= bTo && bFrom <= aTo;
}

export interface DetectedContradiction {
  claimA: string;
  claimB: string;
  dimension: "value" | "date" | "existence";
  reason: string;
  /** True when both can be true at once because their periods differ. */
  temporallySeparable: boolean;
}

/**
 * Finds claims about the same subject and predicate whose objects disagree.
 * Claims that differ only because they describe different periods are flagged
 * as separable rather than as a conflict.
 */
export function detectContradictions(claims: Claim[]): DetectedContradiction[] {
  const out: DetectedContradiction[] = [];
  const live = claims.filter((c) => c.status !== "retracted");

  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (a.subjectEntityId !== b.subjectEntityId) continue;
      if (norm(a.predicate) !== norm(b.predicate)) continue;

      const sameObject =
        (a.objectEntityId && a.objectEntityId === b.objectEntityId) ||
        (!a.objectEntityId && !b.objectEntityId && norm(a.objectValue) === norm(b.objectValue));

      if (sameObject) {
        // Same assertion; only a differing start date is a conflict.
        const aFrom = a.validFrom ? a.validFrom.slice(0, 10) : null;
        const bFrom = b.validFrom ? b.validFrom.slice(0, 10) : null;
        if (aFrom && bFrom && aFrom !== bFrom) {
          out.push({
            claimA: a.id,
            claimB: b.id,
            dimension: "date",
            reason: `same assertion dated ${aFrom} and ${bFrom}`,
            temporallySeparable: false,
          });
        }
        continue;
      }

      const separable = !periodsOverlap(a, b) && Boolean(a.validFrom || a.validTo) && Boolean(b.validFrom || b.validTo);
      out.push({
        claimA: a.id,
        claimB: b.id,
        dimension: "value",
        reason: separable
          ? "different objects for non-overlapping periods — both can hold"
          : `conflicting objects for the same period: "${a.objectValue ?? a.objectEntityId}" vs "${b.objectValue ?? b.objectEntityId}"`,
        temporallySeparable: separable,
      });
    }
  }
  return out;
}

export interface ResolutionVerdict {
  resolution: Contradiction["resolution"];
  reason: string;
  favoredClaimId: string | null;
  tierA: AuthorityTier | null;
  tierB: AuthorityTier | null;
}

function bestSupportingTier(claimId: string, evidence: Evidence[]): AuthorityTier | null {
  let best: AuthorityTier | null = null;
  for (const e of evidence) {
    if (e.claimId !== claimId || e.stance !== "supports") continue;
    if (!e.sourceId && !e.documentId) continue; // uncited evidence carries no authority
    best = strongerTier(best, e.authorityTier);
  }
  return best;
}

/**
 * Resolves a conflict by comparing the strongest cited supporting source on
 * each side. Equal authority, or no cited authority at all, stays unresolved.
 */
export function resolveByAuthority(
  a: Claim,
  b: Claim,
  evidence: Evidence[],
  detected?: DetectedContradiction,
): ResolutionVerdict {
  const tierA = bestSupportingTier(a.id, evidence);
  const tierB = bestSupportingTier(b.id, evidence);

  if (detected?.temporallySeparable) {
    return {
      resolution: "both_valid_different_periods",
      reason: "the two claims cover non-overlapping periods, so neither displaces the other",
      favoredClaimId: null,
      tierA,
      tierB,
    };
  }

  if (tierA === null && tierB === null) {
    return {
      resolution: "unresolved",
      reason: "neither claim carries a cited source — nothing to weigh",
      favoredClaimId: null,
      tierA,
      tierB,
    };
  }
  if (tierA !== null && tierB === null) {
    return {
      resolution: "favored_a",
      reason: `only one side is cited (tier ${tierA}); the other remains recorded but unsupported`,
      favoredClaimId: a.id,
      tierA,
      tierB,
    };
  }
  if (tierB !== null && tierA === null) {
    return {
      resolution: "favored_b",
      reason: `only one side is cited (tier ${tierB}); the other remains recorded but unsupported`,
      favoredClaimId: b.id,
      tierA,
      tierB,
    };
  }
  if (tierA! < tierB!) {
    return {
      resolution: "favored_a",
      reason: `tier ${tierA} source outranks tier ${tierB}; the tier ${tierB} claim is preserved as a conflict`,
      favoredClaimId: a.id,
      tierA,
      tierB,
    };
  }
  if (tierB! < tierA!) {
    return {
      resolution: "favored_b",
      reason: `tier ${tierB} source outranks tier ${tierA}; the tier ${tierA} claim is preserved as a conflict`,
      favoredClaimId: b.id,
      tierA,
      tierB,
    };
  }
  return {
    resolution: "unresolved",
    reason: `both sides rest on tier ${tierA} sources — no authoritative resolution exists yet`,
    favoredClaimId: null,
    tierA,
    tierB,
  };
}
