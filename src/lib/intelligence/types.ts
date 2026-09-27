// asherin intelligence — the contracts.
//
// nothing in this file is a persona. every type here describes a piece of
// infrastructure that lives outside the model: what a conversation knows, what
// the user vault holds, what a pattern is, and what the learning gate decides.
// the model is a replaceable reasoning capability, never the database.

/** where a learned item is allowed to apply. never auto-converted upward.
 *  "ephemeral" lives for one response, "global" is the system-wide scope. */
export type LearningScope =
  | "ephemeral"
  | "task"
  | "conversation"
  | "project"
  | "user"
  | "domain"
  | "global";

/** epistemic state of any knowledge item. unknown is a real state. */
export type KnowledgeState =
  | "known"
  | "unknown"
  | "uncertain"
  | "candidate"
  | "experimental"
  | "validated"
  | "active"
  | "failed"
  | "archived"
  | "superseded";

/** pattern lifecycle. a generated pattern is never born active. */
export type PatternStatus =
  | "observed"
  | "candidate"
  | "testing"
  | "validated"
  | "active"
  | "refined"
  | "quarantined"
  | "superseded"
  | "failed"
  | "archived";

/** provenance. never lost, never inferred after the fact. */
export type PatternSource =
  | "built_in"
  | "user_feedback"
  | "conversation"
  | "project_observation"
  | "research"
  | "experiment"
  | "pattern_composition"
  | "cross_domain_transfer"
  | "global";

export type PatternRelation =
  | "derived_from"
  | "analogous_to"
  | "compatible_with"
  | "conflicts_with"
  | "specializes"
  | "generalizes"
  | "repairs"
  | "supersedes"
  | "tested_by"
  | "fails_under"
  | "transfers_to";

export type AbstractionLevel = "concrete" | "operational" | "abstract" | "meta";

export type EvidenceQuality = "none" | "weak" | "moderate" | "strong";

/** the pattern object. a pattern is a reusable problem-solving structure —
 *  reasoning, debugging, writing, planning, research, design, analysis. it is
 *  not a saved prompt and not limited to software design patterns. */
export interface PatternObject {
  id: string;
  slug: string;
  name: string;
  description?: string;

  domain: string;
  subdomain?: string;
  family?: string;
  abstractionLevel: AbstractionLevel;

  scope: LearningScope;
  conversationId?: string | null;
  projectId?: string | null;

  triggerTerms: string[];
  inputs: string[];
  preconditions: string[];

  mechanism?: string;
  procedure: string[];
  constraints: string[];
  expectedOutput?: string;

  failureModes: PatternFailureMode[];
  evidence: PatternEvidence[];
  evidenceQuality: EvidenceQuality;
  confidence: number;

  successCount: number;
  failureCount: number;
  contextsUsed: string[];

  status: PatternStatus;
  source: PatternSource;
  version: number;

  /** provenance, permissions, review date and audit trail. see governance.ts. */
  governance?: import("./governance").PatternGovernance;

  createdAt?: string;
  updatedAt?: string;
}

export interface PatternFailureMode {
  /** the condition under which the pattern stopped working. */
  whenFails: string;
  /** what to do instead, when known. */
  repair?: string;
  observedAt?: string;
}

export interface PatternEvidence {
  kind: "observation" | "interpretation" | "hypothesis" | "inference" | "estimate" | "fact" | "assumption";
  note: string;
  conversationId?: string;
  at?: string;
}

export interface PatternEdge {
  id?: string;
  fromPatternId: string;
  toPatternId: string;
  relation: PatternRelation;
  note?: string;
}

/** per-use outcome, the raw signal confidence is computed from. */
export interface PatternOutcome {
  patternId: string;
  conversationId?: string;
  result: "success" | "failure" | "mixed" | "unknown";
  signal?: "explicit_feedback" | "validator" | "user_accepted" | "user_rejected" | "inferred";
  detail?: string;
  context?: Record<string, unknown>;
}

// ---------- conversation intelligence ----------

export interface ConversationState {
  id?: string;
  conversationId: string;
  projectId?: string | null;
  goal?: string;
  activeTopic?: string;
  decisions: string[];
  assumptions: string[];
  constraints: string[];
  preferencesObserved: string[];
  patternsUsed: string[];
  patternsCreated: string[];
  patternsRejected: string[];
  feedback: FeedbackSignal[];
  artifacts: string[];
  unresolvedQuestions: string[];
  currentState: string;
  confidence: number;
}

export interface FeedbackSignal {
  text: string;
  polarity: "negative" | "positive" | "neutral";
  at: string;
  /** what the user appeared to be reacting to, when identifiable. */
  target?: string;
}

// ---------- memory ----------

export type MemoryKindId = "prefer" | "never" | "process" | "output" | "scope" | "fact" | "goal" | "general";

export interface MemoryRecord {
  id?: string;
  kind: MemoryKindId;
  scope: LearningScope;
  content: string;
  rationale?: string;
  confidence: number;
  evidenceCount: number;
  source: string;
  sourceConversationId?: string | null;
  status: "active" | "archived";
  projectId?: string | null;
}

export interface MemoryCandidate {
  id?: string;
  conversationId?: string | null;
  projectId?: string | null;
  proposedScope: LearningScope;
  kind: MemoryKindId;
  content: string;
  rationale?: string;
  evidence: PatternEvidence[];
  confidence: number;
  status: "pending" | "promoted" | "rejected" | "held";
  decisionReason?: string;
}

export interface IntelligenceSettings {
  memoryEnabled: boolean;
  learningEnabled: boolean;
  globalContributionEnabled: boolean;
}

// ---------- runtime context ----------

export type TaskModality =
  | "conversation"
  | "code"
  | "debugging"
  | "research"
  | "writing"
  | "planning"
  | "decision"
  | "analysis"
  | "design"
  | "image"
  | "vision"
  | "teaching"
  | "mixed";

export interface TaskFrame {
  modality: TaskModality;
  goal: string;
  /** narrative model: actors/objects/state/constraints extracted from the ask. */
  actors: string[];
  constraints: string[];
  unknowns: string[];
  domains: string[];
}

export interface RuntimeContext {
  conversation: ConversationState;
  task: TaskFrame;
  userMemory: MemoryRecord[];
  projectMemory: MemoryRecord[];
  patterns: RetrievedPattern[];
  coverage: PatternCoverage;
  /** hard budget so retrieval never becomes a context dump. */
  budget: { maxMemories: number; maxPatterns: number };
  notes: string[];
}

export interface RetrievedPattern {
  pattern: PatternObject;
  relevance: number;
  why: string[];
}

export interface PatternCoverage {
  state: "covered" | "partial" | "unknown";
  bestScore: number;
  missing: string[];
}

// ---------- model gateway ----------

export interface ModelCapabilities {
  textInput: boolean;
  textOutput: boolean;
  vision: boolean;
  imageGeneration: boolean;
  audioInput: boolean;
  audioOutput: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
  contextWindow: number;
  codingSuitability: "low" | "medium" | "high";
}

export interface ModelBinding {
  /** provider id only — never a key, never key material. */
  providerId: string;
  providerName: string;
  modelId: string;
  /** opaque reference; the raw credential stays server-side. */
  credentialRef: string | null;
  capabilities: ModelCapabilities;
  available: boolean;
  unavailableReason?: string;
}

// ---------- validation ----------

export interface ValidationCheck {
  id: string;
  label: string;
  result: "pass" | "fail" | "unavailable";
  detail: string;
}

export interface ValidationReport {
  modality: TaskModality;
  checks: ValidationCheck[];
  verdict: "accepted" | "needs_revision" | "unvalidated";
}

// ---------- learning ----------

export interface LearningDecision {
  stage: "observe" | "classify" | "candidate" | "policy" | "validate" | "promote";
  decision: "accepted" | "rejected" | "held" | "recorded";
  subjectType: "memory" | "pattern" | "outcome" | "global";
  reason: string;
  detail?: Record<string, unknown>;
}

// ---------- global learning ----------

export interface GlobalCandidate {
  fingerprint: string;
  name: string;
  domain: string;
  abstractionLevel: AbstractionLevel;
  mechanism: string;
  procedure: string[];
  constraints: string[];
  failureModes: string[];
  independentSources: number;
  evidenceScore: number;
  privacyChecked: boolean;
  status: "quarantined" | "eligible" | "rejected" | "promoted" | "merged";
  reviewNotes: string[];
  period?: string;
}

export interface GlobalEvaluationScore {
  correctness: number;
  evidence: number;
  reproducibility: number;
  generalizability: number;
  robustness: number;
  transferability: number;
  utility: number;
  simplicity: number;
  explainability: number;
  failureTolerance: number;
  reversibility: number;
  safety: number;
  privacyCompatibility: number;
}

export type GlobalDecision = "canonical" | "experimental" | "refine" | "reject" | "retire";
