// artifact persistence — owner-scoped. row level security enforces isolation;
// nothing here relies on the caller remembering to filter.

import { supabase } from "@/integrations/supabase/client";
type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
import type {
  ArtifactContract,
  ArtifactSession,
  ArtifactValidation,
  ArtifactVersion,
  ExperienceRecord,
  Observation,
  RepairPlan,
} from "./types";

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

type Row = Record<string, unknown>;

/** serialise a domain value into the json column shape. */
const j = (v: unknown): Json => JSON.parse(JSON.stringify(v ?? null)) as Json;

function toSession(r: Row): ArtifactSession {
  return {
    id: String(r.id),
    conversationId: (r.conversation_id as string) ?? null,
    projectId: (r.project_id as string) ?? null,
    title: String(r.title ?? "untitled artifact"),
    modality: r.modality as ArtifactSession["modality"],
    capability: r.capability as ArtifactSession["capability"],
    capabilityReason: (r.capability_reason as string) ?? null,
    lifecycle: r.lifecycle as ArtifactSession["lifecycle"],
    lifecycleReason: (r.lifecycle_reason as string) ?? null,
    activeVersion: Number(r.active_version ?? 0),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function createSession(input: {
  conversationId: string | null;
  projectId?: string | null;
  title: string;
  modality: ArtifactSession["modality"];
  capability: ArtifactSession["capability"];
  capabilityReason: string;
}): Promise<ArtifactSession | null> {
  const user = await uid();
  if (!user) return null;
  const { data, error } = await supabase
    .from("artifact_session")
    .insert({
      user_id: user,
      conversation_id: input.conversationId,
      project_id: input.projectId ?? null,
      title: input.title.slice(0, 160),
      modality: input.modality,
      capability: input.capability,
      capability_reason: input.capabilityReason,
      lifecycle: "draft",
    })
    .select()
    .maybeSingle();
  if (error || !data) return null;
  return toSession(data as Row);
}

export async function updateSession(
  id: string,
  patch: Partial<Pick<ArtifactSession, "lifecycle" | "lifecycleReason" | "activeVersion" | "title" | "capability" | "capabilityReason">>,
): Promise<void> {
  const row: Row = {};
  if (patch.lifecycle) row.lifecycle = patch.lifecycle;
  if (patch.lifecycleReason !== undefined) row.lifecycle_reason = patch.lifecycleReason;
  if (patch.activeVersion !== undefined) row.active_version = patch.activeVersion;
  if (patch.title) row.title = patch.title;
  if (patch.capability) row.capability = patch.capability;
  if (patch.capabilityReason !== undefined) row.capability_reason = patch.capabilityReason;
  if (!Object.keys(row).length) return;
  await supabase.from("artifact_session").update(row).eq("id", id);
}

export async function listSessions(conversationId: string | null): Promise<ArtifactSession[]> {
  let q = supabase.from("artifact_session").select("*").order("updated_at", { ascending: false }).limit(20);
  if (conversationId) q = q.eq("conversation_id", conversationId);
  const { data } = await q;
  return (data ?? []).map((r) => toSession(r as Row));
}

export async function saveContract(sessionId: string, version: number, contract: ArtifactContract, audit: unknown[]): Promise<void> {
  const user = await uid();
  if (!user) return;
  await supabase.from("artifact_contract").insert({
    user_id: user,
    session_id: sessionId,
    version,
    goals: j(contract.goals),
    requirements: j(contract.requirements),
    expected_behavior: j(contract.expectedBehavior),
    interface: j(contract.interface),
    constraints: j(contract.constraints),
    invariants: j(contract.invariants),
    acceptance: j(contract.acceptance),
    test_model: j(contract.testModel),
    audit: j(audit),
  });
}

export async function saveVersion(sessionId: string, version: ArtifactVersion): Promise<void> {
  const user = await uid();
  if (!user) return;
  await supabase.from("artifact_version").insert({
    user_id: user,
    session_id: sessionId,
    version: version.version,
    parent_version: version.parentVersion,
    manifest: j(version.manifest),
    files: j(version.files),
    dependencies: j(version.dependencies),
    runtime_meta: j(version.runtimeMeta),
    change_summary: version.changeSummary,
    reason: version.reason,
    feedback_source: version.feedbackSource,
  });
}

export async function listVersions(sessionId: string): Promise<ArtifactVersion[]> {
  const { data } = await supabase
    .from("artifact_version")
    .select("*")
    .eq("session_id", sessionId)
    .order("version", { ascending: true });
  return (data ?? []).map((r) => {
    const row = r as Row;
    return {
      version: Number(row.version),
      parentVersion: (row.parent_version as number) ?? null,
      manifest: row.manifest as ArtifactVersion["manifest"],
      files: (row.files ?? []) as ArtifactVersion["files"],
      dependencies: (row.dependencies ?? []) as string[],
      runtimeMeta: (row.runtime_meta ?? {}) as Record<string, unknown>,
      changeSummary: String(row.change_summary ?? ""),
      reason: String(row.reason ?? ""),
      feedbackSource: (row.feedback_source as string) ?? null,
      createdAt: String(row.created_at),
    };
  });
}

export async function saveObservations(sessionId: string, version: number, observations: Observation[]): Promise<void> {
  const user = await uid();
  if (!user || !observations.length) return;
  await supabase.from("artifact_observation").insert(
    observations.slice(0, 100).map((o) => ({
      user_id: user,
      session_id: sessionId,
      version,
      channel: o.channel,
      source: o.source,
      level: o.level,
      message: o.message.slice(0, 2000),
      detail: j(o.detail ?? {}),
      observed_at: o.observedAt,
    })),
  );
}

export async function saveValidation(sessionId: string, version: number, validation: ArtifactValidation): Promise<void> {
  const user = await uid();
  if (!user) return;
  await supabase.from("artifact_validation").insert({
    user_id: user,
    session_id: sessionId,
    version,
    verdict: validation.verdict,
    checks: j(validation.checks),
    defects: j(validation.defects),
  });
}

export async function saveRepair(sessionId: string, fromVersion: number, plan: RepairPlan, toVersion: number | null): Promise<void> {
  const user = await uid();
  if (!user) return;
  await supabase.from("artifact_repair").insert({
    user_id: user,
    session_id: sessionId,
    from_version: fromVersion,
    to_version: toVersion,
    scope: plan.scope,
    diagnosis: plan.diagnosis,
    hypotheses: j(plan.hypotheses),
    change_set: j(plan.targets),
  });
}

export async function saveExperience(record: ExperienceRecord, extra: { patternId?: string | null; learningEventId?: string | null } = {}): Promise<void> {
  const user = await uid();
  if (!user) return;
  await supabase.from("artifact_experience").insert({
    user_id: user,
    session_id: record.sessionId,
    version: record.version,
    task: record.task.slice(0, 2000),
    context: j(record.context),
    initial_model: j(record.initialModel),
    patterns_used: j(record.patternsUsed),
    actions: j(record.actions),
    observations: j(record.observations),
    defects: j(record.defects),
    repairs: j(record.repairs),
    user_feedback: record.userFeedback,
    outcome: record.outcome,
    pattern_id: extra.patternId ?? null,
    learning_event_id: extra.learningEventId ?? null,
  });
}
