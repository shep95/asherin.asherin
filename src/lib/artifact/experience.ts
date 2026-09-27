// experience -> learning.
//
// An artifact run produces a structured experience record. That record is the
// only thing the pattern layer learns from, and it passes through the EXISTING
// learning gate. Nothing here writes a pattern directly, and no model weights
// are touched — adaptation is retrieval, memory and procedure, never training.

import type { IntelligenceSettings, PatternObject, ValidationReport } from "@/lib/intelligence/types";
import { gatePattern } from "@/lib/intelligence/learningGate";
import { readFeedback } from "@/lib/intelligence/creator";
import type { ExperienceRecord, RepairPlan } from "./types";

export interface DerivedPattern {
  pattern: PatternObject;
  gate: ReturnType<typeof gatePattern>;
}

/** turn a completed artifact run into a candidate pattern proposal. */
export function deriveCandidate(record: ExperienceRecord, domain: string): PatternObject | null {
  // an abandoned run with no defects and no repairs teaches nothing.
  if (record.outcome === "unknown" && !record.defects.length && !record.repairs.length) return null;

  const procedure = buildProcedure(record);
  if (!procedure.length) return null;

  const succeeded = record.outcome === "verified";

  return {
    id: "",
    slug: `artifact-${domain}-${Date.now().toString(36)}`,
    name: `${succeeded ? "working" : "attempted"} approach for ${truncate(record.task, 60)}`,
    description: `derived from an artifact run: ${record.actions.length} action(s), ${record.defects.length} defect(s), ${record.repairs.length} repair(s)`,
    domain,
    family: "artifact_construction",
    abstractionLevel: "operational",
    scope: "conversation",
    triggerTerms: triggerTerms(record.task, domain),
    inputs: record.initialModel.contract.requirements.slice(0, 6),
    preconditions: record.initialModel.contract.constraints.slice(0, 6),
    mechanism: procedure.join(" -> "),
    procedure,
    constraints: record.initialModel.contract.constraints.slice(0, 6),
    expectedOutput: record.initialModel.contract.goals[0] ?? record.task.slice(0, 160),
    failureModes: record.defects.slice(0, 5).map((d) => ({
      whenFails: `${d.kind}: ${d.against}`,
      repair: repairFor(d.id, record.repairs),
      observedAt: new Date().toISOString(),
    })),
    evidence: [
      {
        kind: succeeded ? "observation" : "hypothesis",
        note: succeeded
          ? `one artifact run reached verified with ${record.observations.length} observation(s)`
          : `one artifact run ended ${record.outcome}; the approach is unproven`,
        at: new Date().toISOString(),
      },
    ],
    evidenceQuality: succeeded ? "weak" : "none",
    confidence: succeeded ? 0.3 : 0.12,
    successCount: succeeded ? 1 : 0,
    failureCount: succeeded ? 0 : 1,
    contextsUsed: [domain],
    status: "candidate",
    source: record.userFeedback ? "user_feedback" : "experiment",
    version: 1,
  };
}

/** run the derived candidate through the existing gate. never bypassed. */
export function learnFromExperience(
  record: ExperienceRecord,
  domain: string,
  settings: IntelligenceSettings,
): DerivedPattern | null {
  const pattern = deriveCandidate(record, domain);
  if (!pattern) return null;
  const validation: ValidationReport = {
    modality: "code",
    checks: [],
    verdict: record.outcome === "verified" ? "accepted" : record.outcome === "defective" ? "needs_revision" : "unvalidated",
  };
  return { pattern, gate: gatePattern(pattern, { settings, validation }) };
}

/** classify what a piece of feedback is really about, and at what scope. */
export function attributeFeedback(
  text: string,
  record: ExperienceRecord,
): { polarity: "positive" | "negative" | "neutral"; scope: "task" | "conversation" | "project" | "user" | "domain"; target: string } {
  const signal = readFeedback(text);
  const t = text.toLowerCase();
  const scope: "task" | "conversation" | "project" | "user" | "domain" =
    /\b(always|never|from now on|every time|in general)\b/.test(t)
      ? "user"
      : /\b(in this project|this codebase|this repo)\b/.test(t)
        ? "project"
        : /\b(this chat|this conversation)\b/.test(t)
          ? "conversation"
          : "task";

  // trace to the thing that produced the unwanted result, not just the text.
  const target =
    record.patternsUsed[0] ??
    record.repairs[0]?.diagnosis ??
    record.defects[0]?.against ??
    "the construction step that produced this version";

  return { polarity: signal.polarity, scope, target };
}

function buildProcedure(record: ExperienceRecord): string[] {
  const steps = [...record.actions];
  for (const r of record.repairs) steps.push(`when ${r.diagnosis}: repair at ${r.scope} scope — ${r.hypotheses[0] ?? "localise before changing"}`);
  return steps.filter(Boolean).slice(0, 12);
}

function repairFor(defectId: string, repairs: RepairPlan[]): string | undefined {
  const r = repairs.find((x) => x.rerunChecks.includes(defectId));
  return r ? `${r.scope} scope: ${r.hypotheses[0] ?? r.diagnosis}` : undefined;
}

function triggerTerms(task: string, domain: string): string[] {
  return Array.from(
    new Set([
      domain,
      ...task
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 4)
        .slice(0, 6),
    ]),
  );
}

function truncate(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}
