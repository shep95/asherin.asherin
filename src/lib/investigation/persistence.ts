/**
 * Durable storage for investigations.
 *
 * Every row is owner-scoped by RLS; the client never passes a user id filter
 * of its own beyond the insert requirement. Reads return a full snapshot so the
 * workspace, the timeline and the chat grounding layer all see one state.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_SNAPSHOT_PARTS,
  type Claim,
  type Contradiction,
  type DocumentRecord,
  type Entity,
  type Evidence,
  type Identifier,
  type Investigation,
  type InvestigationSnapshot,
  type ProviderState,
  type Relationship,
  type ResearchGap,
  type ResearchHop,
  type Source,
  type TimelineEntry,
} from "./types";

type Row = Record<string, any>;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

function toInvestigation(r: Row): Investigation {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    question: r.question,
    status: r.status,
    summary: r.summary,
    conversationId: r.conversation_id,
    providerState: asRecord(r.provider_state) as ProviderState,
    lastHopAt: r.last_hop_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const toEntity = (r: Row): Entity => ({
  id: r.id,
  investigationId: r.investigation_id,
  kind: r.kind,
  label: r.label,
  canonical: r.canonical,
  aliases: r.aliases ?? [],
  attributes: asRecord(r.attributes),
  resolutionState: r.resolution_state,
  mergedInto: r.merged_into,
  confidence: Number(r.confidence ?? 0),
  origin: r.origin,
  firstSeen: r.first_seen,
  lastSeen: r.last_seen,
});

const toIdentifier = (r: Row): Identifier => ({
  id: r.id,
  investigationId: r.investigation_id,
  entityId: r.entity_id,
  kind: r.kind,
  value: r.value,
  sourceId: r.source_id,
  createdAt: r.created_at,
});

const toSource = (r: Row): Source => ({
  id: r.id,
  investigationId: r.investigation_id,
  url: r.url,
  title: r.title,
  sourceType: r.source_type,
  publisher: r.publisher,
  provider: r.provider,
  publishedAt: r.published_at,
  retrievedAt: r.retrieved_at,
  authorityTier: Number(r.authority_tier) as Source["authorityTier"],
  authorityReason: r.authority_reason,
  searchRank: r.search_rank,
  createdAt: r.created_at,
});

const toDocument = (r: Row): DocumentRecord => ({
  id: r.id,
  investigationId: r.investigation_id,
  sourceId: r.source_id,
  filename: r.filename,
  mimeType: r.mime_type,
  byteSize: r.byte_size,
  storagePath: r.storage_path,
  parseStatus: r.parse_status,
  parseError: r.parse_error,
  textExcerpt: r.text_excerpt,
  createdAt: r.created_at,
});

const toClaim = (r: Row): Claim => ({
  id: r.id,
  investigationId: r.investigation_id,
  subjectEntityId: r.subject_entity_id,
  predicate: r.predicate,
  objectEntityId: r.object_entity_id,
  objectValue: r.object_value,
  statement: r.statement,
  claimKind: r.claim_kind,
  status: r.status,
  origin: r.origin,
  validFrom: r.valid_from,
  validTo: r.valid_to,
  volatility: r.volatility,
  confidence: Number(r.confidence ?? 0),
  confidenceReason: r.confidence_reason,
  lastVerifiedAt: r.last_verified_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toEvidence = (r: Row): Evidence => ({
  id: r.id,
  investigationId: r.investigation_id,
  claimId: r.claim_id,
  sourceId: r.source_id,
  documentId: r.document_id,
  stance: r.stance,
  excerpt: r.excerpt,
  locator: r.locator,
  authorityTier: Number(r.authority_tier) as Evidence["authorityTier"],
  retrievedAt: r.retrieved_at,
  notes: r.notes,
  createdAt: r.created_at,
});

const toRelationship = (r: Row): Relationship => ({
  id: r.id,
  investigationId: r.investigation_id,
  fromEntityId: r.from_entity_id,
  toEntityId: r.to_entity_id,
  relationType: r.relation_type,
  claimId: r.claim_id,
  validFrom: r.valid_from,
  validTo: r.valid_to,
  confidence: Number(r.confidence ?? 0),
  status: r.status,
  createdAt: r.created_at,
});

const toTimeline = (r: Row): TimelineEntry => ({
  id: r.id,
  investigationId: r.investigation_id,
  occurredAt: r.occurred_at,
  datePrecision: r.date_precision,
  label: r.label,
  description: r.description,
  entityId: r.entity_id,
  claimId: r.claim_id,
  sourceId: r.source_id,
  origin: r.origin,
  createdAt: r.created_at,
});

const toContradiction = (r: Row): Contradiction => ({
  id: r.id,
  investigationId: r.investigation_id,
  claimA: r.claim_a,
  claimB: r.claim_b,
  dimension: r.dimension,
  resolution: r.resolution,
  resolutionReason: r.resolution_reason,
  resolvedAt: r.resolved_at,
  createdAt: r.created_at,
});

const toGap = (r: Row): ResearchGap => ({
  id: r.id,
  investigationId: r.investigation_id,
  description: r.description,
  gapType: r.gap_type,
  priority: r.priority,
  status: r.status,
  createdAt: r.created_at,
});

const toHop = (r: Row): ResearchHop => ({
  id: r.id,
  investigationId: r.investigation_id,
  hopNumber: r.hop_number,
  phase: r.phase,
  objective: r.objective,
  rationale: r.rationale,
  targetEntityId: r.target_entity_id,
  status: r.status,
  providerState: asRecord(r.provider_state) as ProviderState,
  stats: asRecord(r.stats),
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  createdAt: r.created_at,
});

export async function listInvestigations(limit = 50): Promise<Investigation[]> {
  const { data, error } = await supabase
    .from("osint_investigations")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toInvestigation);
}

export async function createInvestigation(params: {
  title: string;
  question: string;
  conversationId?: string | null;
}): Promise<Investigation> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("sign in required to create an investigation");

  const { data, error } = await supabase
    .from("osint_investigations")
    .insert({
      user_id: userId,
      title: params.title.slice(0, 200),
      question: params.question,
      conversation_id: params.conversationId ?? null,
      status: "active",
    })
    .select("*")
    .single();
  if (error) throw error;
  return toInvestigation(data);
}

export async function updateInvestigation(
  id: string,
  patch: Partial<Pick<Investigation, "title" | "summary" | "status" | "conversationId">>,
): Promise<void> {
  const row: Row = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.summary !== undefined) row.summary = patch.summary;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.conversationId !== undefined) row.conversation_id = patch.conversationId;
  const { error } = await supabase.from("osint_investigations").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteInvestigation(id: string): Promise<void> {
  const { error } = await supabase.from("osint_investigations").delete().eq("id", id);
  if (error) throw error;
}

/** Loads every part of one investigation in parallel. */
export async function loadSnapshot(investigationId: string): Promise<InvestigationSnapshot | null> {
  const { data: head, error: headErr } = await supabase
    .from("osint_investigations")
    .select("*")
    .eq("id", investigationId)
    .maybeSingle();
  if (headErr) throw headErr;
  if (!head) return null;

  const part = (table: string, order?: { column: string; ascending: boolean }) => {
    let q = supabase.from(table as never).select("*").eq("investigation_id", investigationId);
    if (order) q = q.order(order.column, { ascending: order.ascending }) as never;
    return q.limit(2000);
  };

  const [entities, identifiers, sources, documents, claims, evidence, relationships, timeline, contradictions, gaps, hops] =
    await Promise.all([
      part("osint_entities"),
      part("osint_identifiers"),
      part("osint_sources", { column: "authority_tier", ascending: true }),
      part("osint_documents"),
      part("osint_claims"),
      part("osint_evidence"),
      part("osint_relationships"),
      part("osint_events", { column: "occurred_at", ascending: true }),
      part("osint_contradictions"),
      part("osint_gaps", { column: "priority", ascending: true }),
      part("osint_hops", { column: "hop_number", ascending: true }),
    ]);

  const rows = (res: { data: unknown[] | null }) => (res.data ?? []) as Row[];

  return {
    ...EMPTY_SNAPSHOT_PARTS,
    investigation: toInvestigation(head),
    entities: rows(entities as never).map(toEntity),
    identifiers: rows(identifiers as never).map(toIdentifier),
    sources: rows(sources as never).map(toSource),
    documents: rows(documents as never).map(toDocument),
    claims: rows(claims as never).map(toClaim),
    evidence: rows(evidence as never).map(toEvidence),
    relationships: rows(relationships as never).map(toRelationship),
    timeline: rows(timeline as never).map(toTimeline),
    contradictions: rows(contradictions as never).map(toContradiction),
    gaps: rows(gaps as never).map(toGap),
    hops: rows(hops as never).map(toHop),
  };
}

export async function setContradictionResolution(
  id: string,
  resolution: Contradiction["resolution"],
  reason: string,
): Promise<void> {
  const { error } = await supabase
    .from("osint_contradictions")
    .update({
      resolution,
      resolution_reason: reason,
      resolved_at: resolution === "unresolved" ? null : new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function setGapStatus(id: string, status: "open" | "closed"): Promise<void> {
  const { error } = await supabase.from("osint_gaps").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function retractClaim(id: string, reason: string): Promise<void> {
  const { error } = await supabase
    .from("osint_claims")
    .update({ status: "retracted", confidence: 0, confidence_reason: reason, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
