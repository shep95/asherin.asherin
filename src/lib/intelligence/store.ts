// persistence. every read and write is owner-scoped by row level security, so
// isolation is enforced by the database rather than by the caller remembering
// to filter. the mapping functions exist so the rest of the system works with
// the domain types, never with raw rows.

import { supabase } from "@/integrations/supabase/client";
import type {
  ConversationState,
  IntelligenceSettings,
  LearningDecision,
  MemoryCandidate,
  MemoryRecord,
  PatternEdge,
  PatternObject,
  PatternOutcome,
  LearningScope,
  AbstractionLevel,
  PatternStatus,
  PatternSource,
  EvidenceQuality,
  MemoryKindId,
} from "./types";

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ---------- settings ----------

export const DEFAULT_SETTINGS: IntelligenceSettings = {
  memoryEnabled: false,
  learningEnabled: true,
  globalContributionEnabled: false,
};

export async function loadSettings(): Promise<IntelligenceSettings> {
  const user = await uid();
  if (!user) return DEFAULT_SETTINGS;
  const { data } = await supabase
    .from("ai_intelligence_settings")
    .select("memory_enabled, learning_enabled, global_contribution_enabled")
    .eq("user_id", user)
    .maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    memoryEnabled: data.memory_enabled,
    learningEnabled: data.learning_enabled,
    globalContributionEnabled: data.global_contribution_enabled,
  };
}

export async function saveSettings(next: Partial<IntelligenceSettings>): Promise<IntelligenceSettings> {
  const user = await uid();
  if (!user) throw new Error("sign in required");
  const current = await loadSettings();
  const merged = { ...current, ...next };
  const { error } = await supabase.from("ai_intelligence_settings").upsert(
    {
      user_id: user,
      memory_enabled: merged.memoryEnabled,
      learning_enabled: merged.learningEnabled,
      global_contribution_enabled: merged.globalContributionEnabled,
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
  return merged;
}

// ---------- conversation state ----------

export function emptyConversationState(conversationId: string, projectId?: string | null): ConversationState {
  return {
    conversationId,
    projectId: projectId ?? null,
    decisions: [],
    assumptions: [],
    constraints: [],
    preferencesObserved: [],
    patternsUsed: [],
    patternsCreated: [],
    patternsRejected: [],
    feedback: [],
    artifacts: [],
    unresolvedQuestions: [],
    currentState: "active",
    confidence: 0.5,
  };
}

function toConversationState(row: Record<string, unknown>): ConversationState {
  const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    projectId: (row.project_id as string) ?? null,
    goal: (row.goal as string) ?? undefined,
    activeTopic: (row.active_topic as string) ?? undefined,
    decisions: arr(row.decisions),
    assumptions: arr(row.assumptions),
    constraints: arr(row.constraints),
    preferencesObserved: arr(row.preferences_observed),
    patternsUsed: arr(row.patterns_used),
    patternsCreated: arr(row.patterns_created),
    patternsRejected: arr(row.patterns_rejected),
    feedback: (Array.isArray(row.feedback) ? row.feedback : []) as ConversationState["feedback"],
    artifacts: arr(row.artifacts),
    unresolvedQuestions: arr(row.unresolved_questions),
    currentState: (row.current_state as string) ?? "active",
    confidence: Number(row.confidence ?? 0.5),
  };
}

export async function loadConversationState(
  conversationId: string,
  projectId?: string | null,
): Promise<ConversationState> {
  const user = await uid();
  if (!user) return emptyConversationState(conversationId, projectId);
  const { data } = await supabase
    .from("ai_conversation_state")
    .select("*")
    .eq("user_id", user)
    .eq("conversation_id", conversationId)
    .maybeSingle();
  return data ? toConversationState(data as Record<string, unknown>) : emptyConversationState(conversationId, projectId);
}

export async function saveConversationState(state: ConversationState): Promise<void> {
  const user = await uid();
  if (!user) return;
  const { error } = await supabase.from("ai_conversation_state").upsert(
    {
      user_id: user,
      conversation_id: state.conversationId,
      project_id: state.projectId ?? null,
      goal: state.goal ?? null,
      active_topic: state.activeTopic ?? null,
      decisions: state.decisions,
      assumptions: state.assumptions,
      constraints: state.constraints,
      preferences_observed: state.preferencesObserved,
      patterns_used: state.patternsUsed,
      patterns_created: state.patternsCreated,
      patterns_rejected: state.patternsRejected,
      feedback: state.feedback as unknown as never,
      artifacts: state.artifacts,
      unresolved_questions: state.unresolvedQuestions,
      current_state: state.currentState,
      confidence: state.confidence,
    },
    { onConflict: "user_id,conversation_id" },
  );
  if (error) throw error;
}

// ---------- memory ----------

function toMemory(row: Record<string, unknown>, projectScoped: boolean): MemoryRecord {
  return {
    id: row.id as string,
    kind: (row.kind as MemoryKindId) ?? "general",
    scope: projectScoped ? "project" : ((row.scope as LearningScope) ?? "user"),
    content: row.content as string,
    rationale: (row.rationale as string) ?? undefined,
    confidence: Number(row.confidence ?? 0.5),
    evidenceCount: Number(row.evidence_count ?? 1),
    source: (row.source as string) ?? "conversation",
    sourceConversationId: (row.source_conversation_id as string) ?? null,
    status: ((row.status as string) ?? "active") as MemoryRecord["status"],
    projectId: (row.project_id as string) ?? null,
  };
}

export async function loadUserMemory(): Promise<MemoryRecord[]> {
  const user = await uid();
  if (!user) return [];
  const { data } = await supabase
    .from("ai_user_memory")
    .select("*")
    .eq("user_id", user)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(300);
  return (data ?? []).map((r) => toMemory(r as Record<string, unknown>, false));
}

export async function loadProjectMemory(projectId: string): Promise<MemoryRecord[]> {
  const user = await uid();
  if (!user || !projectId) return [];
  const { data } = await supabase
    .from("ai_project_memory")
    .select("*")
    .eq("user_id", user)
    .eq("project_id", projectId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(300);
  return (data ?? []).map((r) => toMemory(r as Record<string, unknown>, true));
}

export async function insertUserMemory(record: MemoryRecord): Promise<string | null> {
  const user = await uid();
  if (!user) return null;
  const { data, error } = await supabase
    .from("ai_user_memory")
    .insert({
      user_id: user,
      kind: record.kind,
      scope: record.scope,
      content: record.content,
      rationale: record.rationale ?? null,
      confidence: record.confidence,
      evidence_count: record.evidenceCount,
      source: record.source,
      source_conversation_id: record.sourceConversationId ?? null,
      status: record.status,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data?.id ?? null;
}

export async function insertProjectMemory(record: MemoryRecord & { projectId: string }): Promise<string | null> {
  const user = await uid();
  if (!user) return null;
  const { data, error } = await supabase
    .from("ai_project_memory")
    .insert({
      user_id: user,
      project_id: record.projectId,
      kind: record.kind,
      content: record.content,
      rationale: record.rationale ?? null,
      confidence: record.confidence,
      evidence_count: record.evidenceCount,
      source: record.source,
      source_conversation_id: record.sourceConversationId ?? null,
      status: record.status,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data?.id ?? null;
}

export async function deleteMemory(table: "ai_user_memory" | "ai_project_memory", id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}

export async function updateMemoryContent(
  table: "ai_user_memory" | "ai_project_memory",
  id: string,
  content: string,
): Promise<void> {
  const { error } = await supabase.from(table).update({ content }).eq("id", id);
  if (error) throw error;
}

export async function bumpMemoryEvidence(
  table: "ai_user_memory" | "ai_project_memory",
  id: string,
  evidenceCount: number,
  confidence: number,
): Promise<void> {
  await supabase.from(table).update({ evidence_count: evidenceCount, confidence }).eq("id", id);
}

// ---------- memory candidates ----------

export async function insertMemoryCandidate(c: MemoryCandidate): Promise<string | null> {
  const user = await uid();
  if (!user) return null;
  const { data, error } = await supabase
    .from("ai_memory_candidate")
    .insert({
      user_id: user,
      conversation_id: c.conversationId ?? null,
      project_id: c.projectId ?? null,
      proposed_scope: c.proposedScope,
      kind: c.kind,
      content: c.content,
      rationale: c.rationale ?? null,
      evidence: c.evidence as unknown as never,
      confidence: c.confidence,
      status: c.status,
      decision_reason: c.decisionReason ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data?.id ?? null;
}

export async function loadPendingCandidates(): Promise<(MemoryCandidate & { id: string })[]> {
  const user = await uid();
  if (!user) return [];
  const { data } = await supabase
    .from("ai_memory_candidate")
    .select("*")
    .eq("user_id", user)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as string,
      conversationId: (row.conversation_id as string) ?? null,
      projectId: (row.project_id as string) ?? null,
      proposedScope: row.proposed_scope as LearningScope,
      kind: row.kind as MemoryKindId,
      content: row.content as string,
      rationale: (row.rationale as string) ?? undefined,
      evidence: (Array.isArray(row.evidence) ? row.evidence : []) as MemoryCandidate["evidence"],
      confidence: Number(row.confidence ?? 0.3),
      status: row.status as MemoryCandidate["status"],
      decisionReason: (row.decision_reason as string) ?? undefined,
    };
  });
}

export async function resolveCandidate(
  id: string,
  status: MemoryCandidate["status"],
  reason: string,
  promoted?: { to: "user" | "project"; id: string },
): Promise<void> {
  await supabase
    .from("ai_memory_candidate")
    .update({
      status,
      decision_reason: reason,
      promoted_to: promoted?.to ?? null,
      promoted_id: promoted?.id ?? null,
    })
    .eq("id", id);
}

// ---------- patterns ----------

function toPattern(row: Record<string, unknown>): PatternObject {
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    description: (row.description as string) ?? undefined,
    domain: (row.domain as string) ?? "general",
    subdomain: (row.subdomain as string) ?? undefined,
    family: (row.family as string) ?? undefined,
    abstractionLevel: (row.abstraction_level as AbstractionLevel) ?? "concrete",
    scope: (row.scope as LearningScope) ?? "conversation",
    conversationId: (row.conversation_id as string) ?? null,
    projectId: (row.project_id as string) ?? null,
    triggerTerms: arr<string>(row.trigger_terms),
    inputs: arr<string>(row.inputs),
    preconditions: arr<string>(row.preconditions),
    mechanism: (row.mechanism as string) ?? undefined,
    procedure: arr<string>(row.procedure),
    constraints: arr<string>(row.constraints),
    expectedOutput: (row.expected_output as string) ?? undefined,
    failureModes: arr<PatternObject["failureModes"][number]>(row.failure_modes),
    evidence: arr<PatternObject["evidence"][number]>(row.evidence),
    evidenceQuality: (row.evidence_quality as EvidenceQuality) ?? "weak",
    confidence: Number(row.confidence ?? 0.2),
    successCount: Number(row.success_count ?? 0),
    failureCount: Number(row.failure_count ?? 0),
    contextsUsed: arr<string>(row.contexts_used),
    status: (row.status as PatternStatus) ?? "candidate",
    source: (row.source as PatternSource) ?? "conversation",
    version: Number(row.version ?? 1),
    governance:
      row.governance && typeof row.governance === "object" && Object.keys(row.governance as object).length
        ? (row.governance as PatternObject["governance"])
        : undefined,
    createdAt: (row.created_at as string) ?? undefined,
    updatedAt: (row.updated_at as string) ?? undefined,
  };
}

function patternRow(p: PatternObject, user: string) {
  return {
    user_id: user,
    slug: p.slug,
    name: p.name,
    description: p.description ?? null,
    domain: p.domain,
    subdomain: p.subdomain ?? null,
    family: p.family ?? null,
    abstraction_level: p.abstractionLevel,
    scope: p.scope,
    conversation_id: p.conversationId ?? null,
    project_id: p.projectId ?? null,
    trigger_terms: p.triggerTerms,
    inputs: p.inputs as unknown as never,
    preconditions: p.preconditions as unknown as never,
    mechanism: p.mechanism ?? null,
    procedure: p.procedure as unknown as never,
    constraints: p.constraints as unknown as never,
    expected_output: p.expectedOutput ?? null,
    failure_modes: p.failureModes as unknown as never,
    evidence: p.evidence as unknown as never,
    evidence_quality: p.evidenceQuality,
    confidence: p.confidence,
    success_count: p.successCount,
    failure_count: p.failureCount,
    contexts_used: p.contextsUsed as unknown as never,
    status: p.status,
    source: p.source,
    version: p.version,
    governance: (p.governance ?? {}) as unknown as never,
  };
}

export async function loadPatterns(): Promise<PatternObject[]> {
  const user = await uid();
  if (!user) return [];
  const { data } = await supabase.from("ai_pattern").select("*").eq("user_id", user).limit(1000);
  return (data ?? []).map((r) => toPattern(r as Record<string, unknown>));
}

export async function upsertPattern(p: PatternObject): Promise<PatternObject | null> {
  const user = await uid();
  if (!user) return null;
  const { data, error } = await supabase
    .from("ai_pattern")
    .upsert(patternRow(p, user), { onConflict: "user_id,slug" })
    .select("*")
    .single();
  if (error) throw error;
  return data ? toPattern(data as Record<string, unknown>) : null;
}

/** a version snapshot is written before the row changes — history is never lost. */
export async function snapshotPatternVersion(p: PatternObject, reason: string): Promise<void> {
  const user = await uid();
  if (!user || !p.id) return;
  await supabase.from("ai_pattern_version").insert({
    user_id: user,
    pattern_id: p.id,
    version: p.version,
    snapshot: p as unknown as never,
    reason,
  });
}

export async function loadPatternVersions(patternId: string): Promise<{ version: number; reason: string | null; snapshot: unknown; created_at: string }[]> {
  const { data } = await supabase
    .from("ai_pattern_version")
    .select("version, reason, snapshot, created_at")
    .eq("pattern_id", patternId)
    .order("version", { ascending: true });
  return (data ?? []) as never;
}

export async function addPatternEdge(edge: PatternEdge): Promise<void> {
  const user = await uid();
  if (!user) return;
  await supabase.from("ai_pattern_edge").upsert(
    {
      user_id: user,
      from_pattern_id: edge.fromPatternId,
      to_pattern_id: edge.toPatternId,
      relation: edge.relation,
      note: edge.note ?? null,
    },
    { onConflict: "from_pattern_id,to_pattern_id,relation" },
  );
}

export async function loadPatternEdges(): Promise<PatternEdge[]> {
  const user = await uid();
  if (!user) return [];
  const { data } = await supabase.from("ai_pattern_edge").select("*").eq("user_id", user).limit(2000);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as string,
      fromPatternId: row.from_pattern_id as string,
      toPatternId: row.to_pattern_id as string,
      relation: row.relation as PatternEdge["relation"],
      note: (row.note as string) ?? undefined,
    };
  });
}

export async function recordOutcome(outcome: PatternOutcome): Promise<void> {
  const user = await uid();
  if (!user) return;
  await supabase.from("ai_pattern_outcome").insert({
    user_id: user,
    pattern_id: outcome.patternId,
    conversation_id: outcome.conversationId ?? null,
    result: outcome.result,
    signal: outcome.signal ?? null,
    detail: outcome.detail ?? null,
    context: (outcome.context ?? {}) as unknown as never,
  });
}

export async function loadOutcomes(patternId: string): Promise<PatternOutcome[]> {
  const { data } = await supabase
    .from("ai_pattern_outcome")
    .select("*")
    .eq("pattern_id", patternId)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      patternId: row.pattern_id as string,
      conversationId: (row.conversation_id as string) ?? undefined,
      result: row.result as PatternOutcome["result"],
      signal: (row.signal as PatternOutcome["signal"]) ?? undefined,
      detail: (row.detail as string) ?? undefined,
      context: (row.context as Record<string, unknown>) ?? {},
    };
  });
}

// ---------- learning audit ----------

export async function recordLearningDecisions(
  conversationId: string | null,
  decisions: LearningDecision[],
  subjectId?: string,
): Promise<void> {
  const user = await uid();
  if (!user || decisions.length === 0) return;
  await supabase.from("ai_learning_event").insert(
    decisions.map((d) => ({
      user_id: user,
      conversation_id: conversationId,
      stage: d.stage,
      decision: d.decision,
      subject_type: d.subjectType,
      subject_id: subjectId ?? null,
      reason: d.reason,
      detail: (d.detail ?? {}) as unknown as never,
    })),
  );
}

export async function loadLearningEvents(limit = 100) {
  const user = await uid();
  if (!user) return [];
  const { data } = await supabase
    .from("ai_learning_event")
    .select("*")
    .eq("user_id", user)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

// ---------- global registry (read-only from the app) ----------

export async function loadGlobalPatterns() {
  const { data } = await supabase
    .from("ai_global_pattern")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  return data ?? [];
}

export async function loadGlobalManifests() {
  const { data } = await supabase
    .from("ai_global_manifest")
    .select("*")
    .order("period", { ascending: false })
    .limit(24);
  return data ?? [];
}

/** install the shipped built-in patterns for a user exactly once. */
export async function ensureSeedPatterns(seeds: PatternObject[]): Promise<number> {
  const user = await uid();
  if (!user) return 0;
  const { data } = await supabase.from("ai_pattern").select("slug").eq("user_id", user).eq("source", "built_in");
  const have = new Set((data ?? []).map((r) => (r as { slug: string }).slug));
  const missing = seeds.filter((s) => !have.has(s.slug));
  if (missing.length === 0) return 0;
  const { error } = await supabase.from("ai_pattern").insert(missing.map((p) => patternRow(p, user)));
  if (error) throw error;
  return missing.length;
}
