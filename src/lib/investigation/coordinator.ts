/**
 * Research coordinator.
 *
 * Plans hops, calls the real retrieval backend, then reconciles the stored
 * investigation: every claim is re-scored from its evidence, conflicts are
 * detected and resolved by source authority, and gaps are refreshed.
 *
 * The reconcile pass is deliberately client-side and deterministic — the same
 * functions the tests exercise are the ones that decide what the UI calls
 * resolved. Nothing here writes a claim status the evidence does not justify.
 */

import { supabase } from "@/integrations/supabase/client";
import { assessClaim } from "./confidence";
import { detectContradictions, resolveByAuthority } from "./contradictions";
import { detectGaps, nextBestHops, shouldContinueLoop, type HopProposal } from "./hops";
import { loadSnapshot } from "./persistence";
import type { InvestigationSnapshot, ProviderState } from "./types";

export interface HopResult {
  ok: boolean;
  hopId?: string;
  providers: ProviderState;
  stats?: { sources: number; entities: number; claims: number };
  reason?: string;
  error?: string;
}

/** Adapters the coordinator can route to, and how to read their state. */
export const RESEARCH_ADAPTERS = [
  { id: "surface_web", label: "public web", description: "independent open web indexes" },
  { id: "corporate_registry", label: "corporate registry", description: "sec edgar filings" },
  { id: "extraction", label: "entity/claim extraction", description: "structured extraction from retrieved snippets" },
] as const;

export function adapterLabel(id: string): string {
  return RESEARCH_ADAPTERS.find((a) => a.id === id)?.label ?? id;
}

/** Runs one retrieval hop against the backend. Never throws. */
export async function runHop(params: {
  investigationId: string;
  query: string;
  phase?: HopProposal["phase"];
  objective?: string;
  targetEntityId?: string | null;
}): Promise<HopResult> {
  try {
    const { data, error } = await supabase.functions.invoke("osint-investigate", {
      body: {
        investigationId: params.investigationId,
        query: params.query,
        phase: params.phase ?? "discover",
        objective: params.objective ?? params.query,
        targetEntityId: params.targetEntityId ?? null,
      },
    });
    if (error) {
      return { ok: false, providers: {}, error: error.message || "research backend unreachable" };
    }
    return {
      ok: Boolean(data?.ok),
      hopId: data?.hopId,
      providers: (data?.providers ?? {}) as ProviderState,
      stats: data?.stats,
      reason: data?.reason,
      error: data?.error,
    };
  } catch (e) {
    return { ok: false, providers: {}, error: (e as Error).message || "research backend unreachable" };
  }
}

export interface ReconcileSummary {
  claimsRescored: number;
  contradictionsFound: number;
  gapsOpened: number;
}

/**
 * Re-derives every downstream judgement from stored evidence. Idempotent: run
 * it after a hop, or any time evidence changes.
 */
export async function reconcile(investigationId: string): Promise<{ snapshot: InvestigationSnapshot; summary: ReconcileSummary } | null> {
  const snap = await loadSnapshot(investigationId);
  if (!snap) return null;
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return { snapshot: snap, summary: { claimsRescored: 0, contradictionsFound: 0, gapsOpened: 0 } };

  let claimsRescored = 0;
  for (const claim of snap.claims) {
    if (claim.status === "retracted") continue;
    const a = assessClaim({ claim, evidence: snap.evidence, sources: snap.sources });
    if (a.status === claim.status && Math.abs(a.confidence - claim.confidence) < 0.01 && claim.confidenceReason === a.reason) {
      continue;
    }
    await supabase
      .from("osint_claims")
      .update({
        status: a.status,
        confidence: a.confidence,
        confidence_reason: a.reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", claim.id);
    claim.status = a.status;
    claim.confidence = a.confidence;
    claim.confidenceReason = a.reason;
    claimsRescored++;
  }

  const detected = detectContradictions(snap.claims);
  const existingKeys = new Set(snap.contradictions.map((c) => [c.claimA, c.claimB].sort().join("::")));
  let contradictionsFound = 0;
  for (const d of detected) {
    const key = [d.claimA, d.claimB].sort().join("::");
    if (existingKeys.has(key)) continue;
    const a = snap.claims.find((c) => c.id === d.claimA)!;
    const b = snap.claims.find((c) => c.id === d.claimB)!;
    const verdict = resolveByAuthority(a, b, snap.evidence, d);
    await supabase.from("osint_contradictions").insert({
      user_id: userId,
      investigation_id: investigationId,
      claim_a: d.claimA,
      claim_b: d.claimB,
      dimension: d.dimension,
      resolution: verdict.resolution,
      resolution_reason: `${d.reason} — ${verdict.reason}`,
      resolved_at: verdict.resolution === "unresolved" ? null : new Date().toISOString(),
    });
    existingKeys.add(key);
    contradictionsFound++;
  }

  const fresh = await loadSnapshot(investigationId);
  const working = fresh ?? snap;

  const gaps = detectGaps({
    entities: working.entities,
    identifiers: working.identifiers,
    claims: working.claims,
    evidence: working.evidence,
    sources: working.sources,
    contradictions: working.contradictions,
  });
  const openDescriptions = new Set(working.gaps.filter((g) => g.status === "open").map((g) => g.description));
  const newGaps = gaps.filter((g) => !openDescriptions.has(g.description)).slice(0, 25);
  if (newGaps.length) {
    await supabase.from("osint_gaps").insert(
      newGaps.map((g) => ({
        user_id: userId,
        investigation_id: investigationId,
        description: g.description,
        gap_type: g.gapType,
        priority: g.priority,
        status: "open",
      })),
    );
  }

  const final = (await loadSnapshot(investigationId)) ?? working;
  return {
    snapshot: final,
    summary: { claimsRescored, contradictionsFound, gapsOpened: newGaps.length },
  };
}

/**
 * One full loop iteration: pick the next hop, run it, reconcile, and report
 * whether another hop is worth running.
 */
export async function advanceLoop(investigationId: string): Promise<{
  snapshot: InvestigationSnapshot | null;
  hop: HopProposal | null;
  result: HopResult | null;
  next: { proceed: boolean; reason: string };
}> {
  const snap = await loadSnapshot(investigationId);
  if (!snap) return { snapshot: null, hop: null, result: null, next: { proceed: false, reason: "investigation not found" } };

  const [proposal] = nextBestHops(snap, 1);
  if (!proposal) {
    return { snapshot: snap, hop: null, result: null, next: shouldContinueLoop(snap) };
  }

  const result = await runHop({
    investigationId,
    query: proposal.query,
    phase: proposal.phase,
    objective: proposal.objective,
    targetEntityId: proposal.targetEntityId,
  });

  const reconciled = await reconcile(investigationId);
  const snapshot = reconciled?.snapshot ?? snap;
  return { snapshot, hop: proposal, result, next: shouldContinueLoop(snapshot) };
}

export { nextBestHops, shouldContinueLoop };
