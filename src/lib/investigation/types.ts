/**
 * OSINT investigation domain model.
 *
 * This is the durable shape behind asherin chat research. A research turn does
 * not produce "an answer"; it produces entities, claims, evidence, conflicts
 * and gaps that outlive the turn and can be interrogated later.
 *
 * Three rules are encoded in the types rather than left to discipline:
 *   1. a claim is never a fact by itself — `claimKind` and `status` stay
 *      separate, and promotion is a function of evidence (see confidence.ts).
 *   2. supporting and contradicting evidence are stored as separate rows with
 *      an explicit `stance`, never merged into a score.
 *   3. `origin` keeps public-record research, operator documents and
 *      authorized sensor observations distinguishable forever.
 */

export type InvestigationStatus = "active" | "paused" | "closed";

/** Where an assertion physically came from. Never silently merged. */
export type EvidenceOrigin = "public_record" | "user_document" | "sensor";

/** Epistemic type of a claim — kept apart from how well it is supported. */
export type ClaimKind =
  | "fact"
  | "observation"
  | "interpretation"
  | "hypothesis"
  | "inference"
  | "estimate"
  | "assumption"
  | "unknown";

export type ClaimStatus = "resolved" | "unresolved" | "contradicted" | "weak" | "retracted";

/** How fast the underlying reality can change, which drives staleness. */
export type Volatility = "static" | "slow" | "volatile";

export type EvidenceStance = "supports" | "contradicts" | "context";

export type ResolutionState = "candidate" | "resolved" | "merged" | "rejected";

export type EntityKind =
  | "person"
  | "company"
  | "organization"
  | "location"
  | "document"
  | "domain"
  | "role"
  | "event"
  | "identifier"
  | "other";

/**
 * Relation vocabulary. Extensible on purpose: the union carries the known set
 * for autocomplete and the `(string & {})` arm lets a hop introduce a new
 * predicate without a migration. Unknown types render verbatim.
 */
export type KnownRelationType =
  | "OWNS"
  | "WORKS_AT"
  | "FOUNDED"
  | "DIRECTOR_OF"
  | "PUBLISHED"
  | "MENTIONED_BY"
  | "LOCATED_AT"
  | "RELATED_TO"
  | "SUCCEEDED_BY"
  | "PRECEDED_BY"
  | "CONTRADICTS"
  | "SUPPORTS"
  | "DERIVED_FROM";

// eslint-disable-next-line @typescript-eslint/ban-types
export type RelationType = KnownRelationType | (string & {});

export const KNOWN_RELATION_TYPES: readonly KnownRelationType[] = [
  "OWNS",
  "WORKS_AT",
  "FOUNDED",
  "DIRECTOR_OF",
  "PUBLISHED",
  "MENTIONED_BY",
  "LOCATED_AT",
  "RELATED_TO",
  "SUCCEEDED_BY",
  "PRECEDED_BY",
  "CONTRADICTS",
  "SUPPORTS",
  "DERIVED_FROM",
] as const;

/** Inverse pairs used when a hop asserts one direction of a symmetric fact. */
export const RELATION_INVERSE: Partial<Record<KnownRelationType, KnownRelationType>> = {
  SUCCEEDED_BY: "PRECEDED_BY",
  PRECEDED_BY: "SUCCEEDED_BY",
  RELATED_TO: "RELATED_TO",
  CONTRADICTS: "CONTRADICTS",
};

export interface Investigation {
  id: string;
  userId: string;
  title: string;
  question: string;
  status: InvestigationStatus;
  summary: string | null;
  conversationId: string | null;
  /** Which research adapters were live/absent on the last hop. */
  providerState: ProviderState;
  lastHopAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Per-adapter availability, reported honestly rather than assumed. */
export interface ProviderState {
  [adapterId: string]:
    | {
        status: "live" | "unavailable" | "not_configured" | "error";
        detail?: string;
        checkedAt?: string;
      }
    | undefined;
}

export interface Entity {
  id: string;
  investigationId: string;
  kind: EntityKind | string;
  label: string;
  canonical: string;
  aliases: string[];
  attributes: Record<string, unknown>;
  resolutionState: ResolutionState;
  mergedInto: string | null;
  confidence: number;
  origin: EvidenceOrigin;
  firstSeen: string;
  lastSeen: string;
}

export interface Identifier {
  id: string;
  investigationId: string;
  entityId: string;
  kind: string;
  value: string;
  sourceId: string | null;
  createdAt: string;
}

export interface Source {
  id: string;
  investigationId: string;
  url: string | null;
  title: string;
  sourceType: SourceType;
  publisher: string | null;
  provider: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  /** 1 = official record … 5 = anonymous/unattributed. Never search rank. */
  authorityTier: AuthorityTier;
  authorityReason: string | null;
  /** Kept only for display; deliberately never feeds authority. */
  searchRank: number | null;
  createdAt: string;
}

export type SourceType =
  | "official_filing"
  | "government_registry"
  | "court_record"
  | "regulatory"
  | "company_official"
  | "news"
  | "trade_press"
  | "academic"
  | "archive"
  | "encyclopedia"
  | "social_media"
  | "forum"
  | "blog"
  | "web_page"
  | "user_document"
  | "unknown";

export type AuthorityTier = 1 | 2 | 3 | 4 | 5;

export interface DocumentRecord {
  id: string;
  investigationId: string;
  sourceId: string | null;
  filename: string;
  mimeType: string | null;
  byteSize: number | null;
  storagePath: string | null;
  parseStatus: "parsed" | "unparsed" | "failed" | "unsupported";
  parseError: string | null;
  textExcerpt: string | null;
  createdAt: string;
}

export interface Claim {
  id: string;
  investigationId: string;
  subjectEntityId: string | null;
  predicate: RelationType;
  objectEntityId: string | null;
  objectValue: string | null;
  statement: string;
  claimKind: ClaimKind;
  status: ClaimStatus;
  origin: EvidenceOrigin;
  validFrom: string | null;
  validTo: string | null;
  volatility: Volatility;
  confidence: number;
  confidenceReason: string | null;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Evidence {
  id: string;
  investigationId: string;
  claimId: string;
  sourceId: string | null;
  documentId: string | null;
  stance: EvidenceStance;
  excerpt: string | null;
  locator: string | null;
  authorityTier: AuthorityTier;
  retrievedAt: string;
  notes: string | null;
  createdAt: string;
}

export interface Relationship {
  id: string;
  investigationId: string;
  fromEntityId: string;
  toEntityId: string;
  relationType: RelationType;
  claimId: string | null;
  validFrom: string | null;
  validTo: string | null;
  confidence: number;
  status: ClaimStatus;
  createdAt: string;
}

export interface TimelineEntry {
  id: string;
  investigationId: string;
  occurredAt: string | null;
  datePrecision: "exact" | "day" | "month" | "year" | "unknown";
  label: string;
  description: string | null;
  entityId: string | null;
  claimId: string | null;
  sourceId: string | null;
  origin: EvidenceOrigin;
  createdAt: string;
}

/** An event is a timeline entry; the alias keeps the domain vocabulary intact. */
export type InvestigationEvent = TimelineEntry;

export interface Contradiction {
  id: string;
  investigationId: string;
  claimA: string;
  claimB: string;
  dimension: string;
  resolution: "unresolved" | "favored_a" | "favored_b" | "both_valid_different_periods";
  resolutionReason: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ResearchGap {
  id: string;
  investigationId: string;
  description: string;
  gapType: string;
  priority: number;
  status: "open" | "closed";
  createdAt: string;
}

export type HopPhase = "discover" | "connect" | "verify";

export interface ResearchHop {
  id: string;
  investigationId: string;
  hopNumber: number;
  phase: HopPhase;
  objective: string;
  rationale: string | null;
  targetEntityId: string | null;
  status: "proposed" | "running" | "done" | "failed" | "unavailable" | "skipped";
  providerState: ProviderState;
  stats: Record<string, unknown>;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

/** Explainable confidence — never a bare number in the UI. */
export interface Assessment {
  confidence: number;
  status: ClaimStatus;
  reason: string;
  supportingCount: number;
  contradictingCount: number;
  bestSupportingTier: AuthorityTier | null;
  bestContradictingTier: AuthorityTier | null;
  independentSources: number;
  stale: boolean;
  staleReason: string | null;
}

/** Everything the workspace and the chat grounding layer read from. */
export interface InvestigationSnapshot {
  investigation: Investigation;
  entities: Entity[];
  identifiers: Identifier[];
  sources: Source[];
  documents: DocumentRecord[];
  claims: Claim[];
  evidence: Evidence[];
  relationships: Relationship[];
  timeline: TimelineEntry[];
  contradictions: Contradiction[];
  gaps: ResearchGap[];
  hops: ResearchHop[];
}

export const EMPTY_SNAPSHOT_PARTS = {
  entities: [] as Entity[],
  identifiers: [] as Identifier[],
  sources: [] as Source[],
  documents: [] as DocumentRecord[],
  claims: [] as Claim[],
  evidence: [] as Evidence[],
  relationships: [] as Relationship[],
  timeline: [] as TimelineEntry[],
  contradictions: [] as Contradiction[],
  gaps: [] as ResearchGap[],
  hops: [] as ResearchHop[],
};
