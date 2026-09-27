// artifact engine — the loop, in one place.
//
// context -> intent -> contract -> audit -> model repair -> construction ->
// runtime (execute / render / compute / validate-only / unavailable) ->
// observation -> validation -> diagnosis -> minimal repair -> rerun ->
// outcome record -> learning.
//
// The engine is pure and synchronous. Persistence, the sandbox frame and the
// learning gate are called by the caller with the values the engine returns,
// so every step stays testable without a browser or a database.

import { frameTask } from "@/lib/intelligence/taskFrame";
import type { TaskFrame } from "@/lib/intelligence/types";
import { buildContract } from "./contract";
import { auditModel } from "./audit";
import { detectModality, probeRuntime, resolveCapability, type RuntimeEnvironment } from "./modality";
import { watchableChannels, normalise } from "./observer";
import { validateArtifact } from "./validate";
import { planRepair } from "./repair";
import { nextVersion } from "./versioning";
import {
  canTransition,
  type ArtifactCapability,
  type ArtifactContract,
  type ArtifactFile,
  type ArtifactLifecycle,
  type ArtifactManifest,
  type ArtifactModality,
  type ArtifactValidation,
  type ArtifactVersion,
  type AuditFinding,
  type ExperienceRecord,
  type Observation,
  type RepairPlan,
} from "./types";

/** does this request want a concrete artifact at all? prose stays prose. */
const ARTIFACT_INTENT =
  /\b(build|make|create|generate|write me|draft|design|produce|prototype|simulate|render|plot|chart|implement|turn (this|that) into)\b/i;
const ARTIFACT_OBJECT =
  /\b(game|app|widget|tool|component|page|dashboard|document|report|memo|spec|plan|roadmap|workflow|chart|graph|table|diagram|mockup|simulation|script|calculator|template|checklist)\b/i;

export function wantsArtifact(message: string): boolean {
  const m = message || "";
  return ARTIFACT_INTENT.test(m) && ARTIFACT_OBJECT.test(m);
}

export interface ModelStage {
  task: TaskFrame;
  modality: ArtifactModality;
  capability: ArtifactCapability;
  capabilityReason: string;
  contract: ArtifactContract;
  audit: AuditFinding[];
  /** repairs applied to the MODEL before anything was built. */
  modelRepairs: string[];
  lifecycle: ArtifactLifecycle;
}

export function modelRequest(
  request: string,
  opts: { previousContract?: ArtifactContract | null; env?: RuntimeEnvironment; declaredDependencies?: string[] } = {},
): ModelStage {
  const task = frameTask(request);
  const modality = detectModality(request);
  const env = opts.env ?? probeRuntime();
  const { capability, reason } = resolveCapability(modality, env);
  const behaviourObservable = watchableChannels(capability).length > 0;

  const contract = buildContract({
    request,
    task,
    modality,
    previous: opts.previousContract ?? null,
    behaviourObservable,
  });

  const audit = auditModel({
    contract,
    modality,
    dependencies: opts.declaredDependencies ?? [],
    behaviourObservable,
  });

  // model repair: findings that can be closed before building are closed now.
  const modelRepairs: string[] = [];
  for (const f of audit) {
    if (f.result !== "finding") continue;
    if (f.dimension === "missing_requirement" && !contract.acceptance.length) {
      contract.acceptance.push(`the result satisfies: ${contract.goals[0] ?? request.slice(0, 120)}`);
      contract.testModel.push({
        id: `acc_${contract.testModel.length + 1}`,
        description: contract.acceptance[contract.acceptance.length - 1],
        observable: false,
        why: "derived during model repair, so it is argued rather than observed",
      });
      modelRepairs.push("added an acceptance criterion — the request stated no definition of done");
    }
    if (f.dimension === "dependencies") {
      modelRepairs.push("declared dependencies must be inlined; the sandbox installs nothing");
    }
    if (f.dimension === "edge_cases") {
      contract.invariants.push("empty and boundary inputs do not crash the artifact");
      modelRepairs.push("added a boundary invariant — no empty/invalid case was specified");
    }
  }

  return {
    task,
    modality,
    capability,
    capabilityReason: reason,
    contract,
    audit,
    modelRepairs,
    lifecycle: capability === "unavailable" ? "unavailable" : "modeled",
  };
}

/** pull artifact files out of a generated answer. fenced blocks only —
 *  nothing is invented when the answer contains no artifact. */
export function extractFiles(answer: string): ArtifactFile[] {
  const files: ArtifactFile[] = [];
  const fence = /```([a-zA-Z0-9]+)?(?:\s+([^\n`]+))?\n([\s\S]*?)```/g;
  let i = 0;
  for (const m of (answer || "").matchAll(fence)) {
    const lang = (m[1] ?? "text").toLowerCase();
    const named = m[2]?.trim();
    const content = m[3] ?? "";
    if (!content.trim()) continue;
    i += 1;
    const path = named && /\.[a-z0-9]{1,5}$/i.test(named) ? named : `artifact-${i}.${extFor(lang)}`;
    files.push({ path, content, language: lang, entry: i === 1 });
  }
  return files;
}

function extFor(lang: string): string {
  switch (lang) {
    case "html": return "html";
    case "css": return "css";
    case "ts": case "typescript": return "ts";
    case "tsx": return "tsx";
    case "js": case "javascript": return "js";
    case "json": return "json";
    case "md": case "markdown": return "md";
    default: return "txt";
  }
}

export function buildManifest(stage: ModelStage, files: ArtifactFile[], title: string): ArtifactManifest {
  return {
    title: title.slice(0, 120),
    modality: stage.modality,
    summary: stage.contract.goals[0] ?? title,
    entry: files.find((f) => f.entry)?.path ?? files[0]?.path,
    dependencies: [],
    requestsNetwork: false,
  };
}

export interface RunResult {
  lifecycle: ArtifactLifecycle;
  lifecycleReason: string;
  validation: ArtifactValidation;
  repair: RepairPlan | null;
}

/** observe -> validate -> diagnose. the caller supplies REAL observations. */
export function evaluateRun(input: {
  stage: ModelStage;
  files: ArtifactFile[];
  rawObservations: Array<{ channel: Observation["channel"]; message: string; source: string; level?: Observation["level"] }>;
  output?: string;
  attempts?: number;
  onlyChecks?: string[];
}): RunResult {
  const { stage } = input;
  if (stage.capability === "unavailable") {
    return {
      lifecycle: "unavailable",
      lifecycleReason: stage.capabilityReason,
      validation: { verdict: "unvalidated", checks: [], defects: [] },
      repair: null,
    };
  }

  const observations = normalise(input.rawObservations, stage.capability);
  const validation = validateArtifact({
    contract: stage.contract,
    capability: stage.capability,
    files: input.files,
    observations,
    output: input.output,
    onlyChecks: input.onlyChecks,
  });

  const repair = validation.verdict === "defective"
    ? planRepair({ validation, files: input.files, attempts: input.attempts ?? 0 })
    : null;

  const lifecycle: ArtifactLifecycle =
    validation.verdict === "verified" ? "verified"
      : validation.verdict === "defective" ? "validation_failed"
        : "validating";

  const reason =
    lifecycle === "verified" ? `${validation.checks.filter((c) => c.result === "pass").length} check(s) passed`
      : lifecycle === "validation_failed" ? repair?.diagnosis ?? "the artifact does not meet its contract"
        : "no check could be evaluated in this environment";

  return { lifecycle, lifecycleReason: reason, validation, repair };
}

export function advance(from: ArtifactLifecycle, to: ArtifactLifecycle): { ok: boolean; lifecycle: ArtifactLifecycle; reason?: string } {
  if (canTransition(from, to)) return { ok: true, lifecycle: to };
  return { ok: false, lifecycle: from, reason: `${from} cannot become ${to}` };
}

export function recordExperience(input: {
  sessionId: string;
  version: ArtifactVersion;
  stage: ModelStage;
  observations: Observation[];
  validation: ArtifactValidation;
  repairs: RepairPlan[];
  actions: string[];
  patternsUsed: string[];
  userFeedback?: string | null;
}): ExperienceRecord {
  return {
    sessionId: input.sessionId,
    version: input.version.version,
    task: input.stage.task.goal,
    context: { modality: input.stage.modality, capability: input.stage.capability, domains: input.stage.task.domains },
    initialModel: { contract: input.stage.contract, audit: input.stage.audit },
    patternsUsed: input.patternsUsed,
    actions: input.actions,
    observations: input.observations,
    defects: input.validation.defects,
    repairs: input.repairs,
    userFeedback: input.userFeedback ?? null,
    outcome: input.validation.verdict === "verified" ? "verified" : input.validation.verdict === "defective" ? "defective" : "unknown",
  };
}

export { nextVersion };
