/**
 * Research gap detection and next-best hop generation.
 *
 * The 3-hop loop only continues while there is something useful left to do.
 * If nothing here scores, the investigation says so rather than spending
 * another round of retrieval on noise.
 */

import { assessClaim } from "./confidence";
import type {
  Claim,
  Contradiction,
  Entity,
  Evidence,
  HopPhase,
  Identifier,
  InvestigationSnapshot,
  ResearchGap,
  Source,
} from "./types";

export interface GapProposal {
  description: string;
  gapType: "missing_evidence" | "unresolved_conflict" | "unidentified_entity" | "stale_claim" | "no_primary_source";
  priority: number;
}

export interface HopProposal {
  phase: HopPhase;
  objective: string;
  rationale: string;
  targetEntityId: string | null;
  /** Suggested retrieval query the orchestrator can run verbatim. */
  query: string;
  priority: number;
}

interface GapInput {
  entities: Entity[];
  identifiers: Identifier[];
  claims: Claim[];
  evidence: Evidence[];
  sources: Source[];
  contradictions: Contradiction[];
  now?: number;
}

/** Everything the investigation knows it does not know. */
export function detectGaps(input: GapInput): GapProposal[] {
  const { entities, identifiers, claims, evidence, sources, contradictions, now = Date.now() } = input;
  const out: GapProposal[] = [];

  for (const c of contradictions) {
    if (c.resolution === "unresolved") {
      out.push({
        description: "a conflict between two claims has no authoritative resolution",
        gapType: "unresolved_conflict",
        priority: 1,
      });
    }
  }

  for (const claim of claims) {
    if (claim.status === "retracted") continue;
    const a = assessClaim({ claim, evidence, sources, now });
    if (a.status === "weak") {
      out.push({
        description: `"${claim.statement}" carries no cited source`,
        gapType: "missing_evidence",
        priority: 1,
      });
    } else if (a.status === "unresolved" && (a.bestSupportingTier ?? 5) >= 3) {
      out.push({
        description: `"${claim.statement}" rests only on reported or self-published sources`,
        gapType: "no_primary_source",
        priority: 2,
      });
    }
    if (a.stale) {
      out.push({
        description: `"${claim.statement}" — ${a.staleReason}`,
        gapType: "stale_claim",
        priority: 3,
      });
    }
  }

  for (const entity of entities) {
    if (entity.resolutionState !== "candidate") continue;
    const hasId = identifiers.some((i) => i.entityId === entity.id);
    if (!hasId && (entity.kind === "company" || entity.kind === "organization" || entity.kind === "person")) {
      out.push({
        description: `${entity.label} has no registry identifier, so it cannot be resolved against official records`,
        gapType: "unidentified_entity",
        priority: 2,
      });
    }
  }

  return dedupe(out, (g) => `${g.gapType}::${g.description}`).sort((a, b) => a.priority - b.priority);
}

function dedupe<T>(rows: T[], key: (row: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const k = key(row);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out;
}

const REGISTRY_TERMS: Record<string, string> = {
  OWNS: "ownership filing shareholder register",
  DIRECTOR_OF: "director appointment filing",
  FOUNDED: "incorporation record founder",
  WORKS_AT: "official appointment announcement",
};

/**
 * Produces the next hops in priority order.
 *
 * discover -> a target with nothing attached yet
 * connect  -> a resolved entity whose relationships are unexplored
 * verify   -> a claim or conflict that needs a higher-authority source
 */
export function nextBestHops(snapshot: InvestigationSnapshot, limit = 5): HopProposal[] {
  const { investigation, entities, identifiers, claims, evidence, sources, contradictions, relationships } = snapshot;
  const proposals: HopProposal[] = [];
  const entityById = new Map(entities.map((e) => [e.id, e]));

  if (!entities.length) {
    return [
      {
        phase: "discover",
        objective: `identify the entities named in: ${investigation.question}`,
        rationale: "the investigation has no entities yet, so the first hop is discovery",
        targetEntityId: null,
        query: investigation.question,
        priority: 0,
      },
    ];
  }

  // VERIFY — conflicts first: an unresolved conflict blocks every conclusion
  // that depends on it.
  for (const conflict of contradictions) {
    if (conflict.resolution !== "unresolved") continue;
    const a = claims.find((c) => c.id === conflict.claimA);
    const b = claims.find((c) => c.id === conflict.claimB);
    if (!a || !b) continue;
    const subject = a.subjectEntityId ? entityById.get(a.subjectEntityId) : null;
    proposals.push({
      phase: "verify",
      objective: `find an official record that settles "${a.statement}" against "${b.statement}"`,
      rationale: "both sides rest on sources of comparable authority",
      targetEntityId: a.subjectEntityId,
      query: `${subject?.label ?? ""} ${REGISTRY_TERMS[a.predicate] ?? a.predicate.toLowerCase().replace(/_/g, " ")} filing`.trim(),
      priority: 1,
    });
  }

  // VERIFY — claims that only reported or self-published sources support.
  for (const claim of claims) {
    if (claim.status === "retracted") continue;
    const a = assessClaim({ claim, evidence, sources });
    if (a.status === "resolved" && !a.stale) continue;
    const subject = claim.subjectEntityId ? entityById.get(claim.subjectEntityId) : null;
    proposals.push({
      phase: "verify",
      objective: a.stale
        ? `re-check whether "${claim.statement}" still holds`
        : `corroborate "${claim.statement}" against a higher-authority source`,
      rationale: a.reason,
      targetEntityId: claim.subjectEntityId,
      query: `${subject?.label ?? ""} ${REGISTRY_TERMS[claim.predicate] ?? claim.predicate.toLowerCase().replace(/_/g, " ")} ${
        claim.objectValue ?? ""
      }`.replace(/\s+/g, " ").trim(),
      priority: a.status === "weak" ? 1 : 2,
    });
  }

  // CONNECT — entities that appear in the graph but have no edges yet.
  for (const entity of entities) {
    if (entity.resolutionState === "merged" || entity.resolutionState === "rejected") continue;
    const degree = relationships.filter((r) => r.fromEntityId === entity.id || r.toEntityId === entity.id).length;
    if (degree > 0) continue;
    proposals.push({
      phase: "connect",
      objective: `map who and what ${entity.label} is connected to`,
      rationale: "this entity was discovered but has no recorded relationships",
      targetEntityId: entity.id,
      query:
        entity.kind === "company" || entity.kind === "organization"
          ? `"${entity.label}" owner OR parent OR director OR shareholder`
          : `"${entity.label}" role OR company OR appointment`,
      priority: 3,
    });
  }

  // DISCOVER — entities lacking a registry identifier cannot reach tier 1.
  for (const entity of entities) {
    if (entity.kind !== "company" && entity.kind !== "organization") continue;
    if (identifiers.some((i) => i.entityId === entity.id)) continue;
    proposals.push({
      phase: "discover",
      objective: `find the registry identifier for ${entity.label}`,
      rationale: "without a company number or cik, official filings cannot be pulled for this entity",
      targetEntityId: entity.id,
      query: `"${entity.label}" company number OR cik OR registration filing`,
      priority: 2,
    });
  }

  return dedupe(proposals, (p) => `${p.phase}::${p.objective}`)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, limit);
}

/**
 * The loop's stop condition. Continues only while an unfinished hop has
 * something concrete to fetch.
 */
export function shouldContinueLoop(
  snapshot: InvestigationSnapshot,
  opts: { maxHops?: number } = {},
): { proceed: boolean; reason: string } {
  const maxHops = opts.maxHops ?? 3;
  const done = snapshot.hops.filter((h) => h.status === "done").length;
  if (done >= maxHops) {
    return { proceed: false, reason: `hop budget reached (${done}/${maxHops}); ask to continue for another pass` };
  }
  const hops = nextBestHops(snapshot, 1);
  if (!hops.length) {
    return { proceed: false, reason: "no hop has a concrete target left — every claim is either resolved or blocked on a gap" };
  }
  return { proceed: true, reason: hops[0].objective };
}

export function gapToRow(gap: GapProposal): Pick<ResearchGap, "description" | "gapType" | "priority" | "status"> {
  return { description: gap.description, gapType: gap.gapType, priority: gap.priority, status: "open" };
}
