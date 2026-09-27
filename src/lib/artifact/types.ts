// asherin artifact runtime — the contracts.
//
// An artifact is a concrete, inspectable result: an interactive web piece, a
// document, a data view, a research output, a design brief, a simulation, a
// plan, a workflow. It is NOT limited to code, and asherin is not an IDE.
//
// Truth rule carried from the workspace stack: a stage is never reported as
// done unless it actually ran. Anything not observed is `unobserved` with a
// reason; any capability that does not exist is `unavailable` with a reason.

/** what the runtime can honestly do with this artifact. */
export type ArtifactCapability =
  | "execute"       // runs in the sandboxed browser frame
  | "render"        // markup / document / chart / image is displayed
  | "compute"       // deterministic transform or simulation step, in page
  | "validate_only" // no runtime exists; only the model is checked
  | "unavailable";  // nothing can be done, and we say why

export type ArtifactModality =
  | "web"
  | "document"
  | "data"
  | "research"
  | "design"
  | "image"
  | "simulation"
  | "plan"
  | "workflow"
  | "unknown";

export type ArtifactLifecycle =
  | "draft"
  | "modeled"
  | "building"
  | "built"
  | "starting"
  | "running"
  | "rendered"
  | "validating"
  | "verified"
  | "build_failed"
  | "runtime_failed"
  | "validation_failed"
  | "repairing"
  | "unavailable";

export const TERMINAL_FAILURES: ArtifactLifecycle[] = [
  "build_failed",
  "runtime_failed",
  "validation_failed",
];

/** allowed transitions. an artifact cannot teleport to verified. */
export const LIFECYCLE_TRANSITIONS: Record<ArtifactLifecycle, ArtifactLifecycle[]> = {
  draft: ["modeled", "unavailable"],
  modeled: ["building", "rendered", "validating", "unavailable"],
  building: ["built", "build_failed"],
  built: ["starting", "validating"],
  starting: ["running", "runtime_failed"],
  running: ["validating", "runtime_failed"],
  rendered: ["validating", "runtime_failed"],
  validating: ["verified", "validation_failed"],
  verified: ["modeled", "repairing"],
  build_failed: ["repairing", "modeled"],
  runtime_failed: ["repairing", "modeled"],
  validation_failed: ["repairing", "modeled"],
  repairing: ["building", "rendered", "validating", "modeled"],
  unavailable: ["modeled", "draft"],
};

export function canTransition(from: ArtifactLifecycle, to: ArtifactLifecycle): boolean {
  return (LIFECYCLE_TRANSITIONS[from] ?? []).includes(to);
}

export interface ArtifactFile {
  path: string;
  content: string;
  language?: string;
  /** true when the file is the entry point for the runtime. */
  entry?: boolean;
}

export interface ArtifactManifest {
  title: string;
  modality: ArtifactModality;
  summary: string;
  entry?: string;
  /** declared, not inferred: the artifact says what it needs. */
  dependencies: string[];
  /** does the artifact ask for network access from inside the sandbox. */
  requestsNetwork?: boolean;
}

export interface ArtifactContract {
  goals: string[];
  requirements: string[];
  expectedBehavior: string[];
  /** outputs / interface the artifact must present. */
  interface: string[];
  constraints: string[];
  invariants: string[];
  acceptance: string[];
  /** the test model: named checks the validator will try to run. */
  testModel: Array<{ id: string; description: string; observable: boolean; why?: string }>;
}

/** one audit dimension. silence is not evidence: every dimension answers. */
export interface AuditFinding {
  dimension: AuditDimension;
  result: "finding" | "clear" | "n/a";
  note: string;
}

export type AuditDimension =
  | "contradiction"
  | "missing_requirement"
  | "ambiguity"
  | "assumptions"
  | "dependencies"
  | "state_coverage"
  | "edge_cases"
  | "failure_modes"
  | "data_flow"
  | "control_flow"
  | "temporal_flow"
  | "security_privacy"
  | "performance"
  | "usability_accessibility"
  | "scalability"
  | "evidence"
  | "counterexamples";

export type ObservationChannel =
  | "runtime_error"
  | "console"
  | "network"
  | "state"
  | "interaction"
  | "test"
  | "performance"
  | "render";

export interface Observation {
  channel: ObservationChannel;
  /** who reported it. never invented. */
  source: string;
  level: "info" | "warn" | "error";
  message: string;
  detail?: Record<string, unknown>;
  observedAt: string;
}

/** a channel that produced nothing because it could not be watched. */
export interface UnobservedChannel {
  channel: ObservationChannel;
  reason: string;
}

export interface ObservationSet {
  observations: Observation[];
  unobserved: UnobservedChannel[];
}

export type DefectKind =
  | "missing"
  | "wrong_value"
  | "wrong_behavior"
  | "crash"
  | "contract_violation"
  | "unobservable";

export interface Defect {
  id: string;
  kind: DefectKind;
  /** which contract item it violates. */
  against: string;
  expected: string;
  actual: string;
  evidence: string[];
}

export interface ArtifactCheck {
  id: string;
  label: string;
  result: "pass" | "fail" | "unavailable";
  detail: string;
}

export interface ArtifactValidation {
  verdict: "verified" | "defective" | "unvalidated";
  checks: ArtifactCheck[];
  defects: Defect[];
}

export type RepairScope =
  | "property"
  | "component"
  | "module"
  | "subsystem"
  | "architecture"
  | "whole";

export interface RepairPlan {
  scope: RepairScope;
  diagnosis: string;
  hypotheses: string[];
  /** files the repair is allowed to touch. empty means model-only repair. */
  targets: string[];
  /** which validation checks must be rerun. never "all" by reflex. */
  rerunChecks: string[];
  reason: string;
}

export interface ArtifactVersion {
  version: number;
  parentVersion: number | null;
  manifest: ArtifactManifest;
  files: ArtifactFile[];
  dependencies: string[];
  runtimeMeta: Record<string, unknown>;
  changeSummary: string;
  reason: string;
  feedbackSource: string | null;
  createdAt: string;
}

export interface ArtifactSession {
  id: string;
  conversationId: string | null;
  projectId: string | null;
  title: string;
  modality: ArtifactModality;
  capability: ArtifactCapability;
  capabilityReason: string | null;
  lifecycle: ArtifactLifecycle;
  lifecycleReason: string | null;
  activeVersion: number;
  createdAt?: string;
  updatedAt?: string;
}

/** the structured experience record handed to the existing learning gate. */
export interface ExperienceRecord {
  sessionId: string;
  version: number;
  task: string;
  context: Record<string, unknown>;
  initialModel: { contract: ArtifactContract; audit: AuditFinding[] };
  patternsUsed: string[];
  actions: string[];
  observations: Observation[];
  defects: Defect[];
  repairs: RepairPlan[];
  userFeedback: string | null;
  outcome: "verified" | "defective" | "abandoned" | "unknown";
}
