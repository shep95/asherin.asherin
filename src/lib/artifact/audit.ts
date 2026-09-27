// universal model audit — challenge the model before building anything.
//
// Every dimension answers. Silence is not evidence: a dimension that does not
// apply says so, with the reason.

import type { ArtifactContract, ArtifactModality, AuditDimension, AuditFinding } from "./types";

const DIMENSIONS: AuditDimension[] = [
  "contradiction",
  "missing_requirement",
  "ambiguity",
  "assumptions",
  "dependencies",
  "state_coverage",
  "edge_cases",
  "failure_modes",
  "data_flow",
  "control_flow",
  "temporal_flow",
  "security_privacy",
  "performance",
  "usability_accessibility",
  "scalability",
  "evidence",
  "counterexamples",
];

const AMBIGUOUS = /\b(some|several|nice|good|fast|modern|clean|etc\.?|and so on|appropriate|as needed)\b/i;
const NEGATION = /\b(never|not|no|without)\b/i;
const RUNTIME_MODALITIES: ArtifactModality[] = ["web", "simulation"];

export interface AuditInput {
  contract: ArtifactContract;
  modality: ArtifactModality;
  /** dependency names the artifact declares. */
  dependencies: string[];
  /** whether behaviour can actually be observed at run time. */
  behaviourObservable: boolean;
}

export function auditModel(input: AuditInput): AuditFinding[] {
  const { contract, modality, dependencies, behaviourObservable } = input;
  const out: AuditFinding[] = [];
  const say = (dimension: AuditDimension, result: AuditFinding["result"], note: string) =>
    out.push({ dimension, result, note });

  // contradiction: a requirement that asserts and forbids the same subject.
  const contradictions: string[] = [];
  for (const a of contract.requirements) {
    for (const b of contract.requirements) {
      if (a === b) continue;
      const subject = keyOf(a);
      if (!subject || subject !== keyOf(b)) continue;
      if (NEGATION.test(a) !== NEGATION.test(b)) contradictions.push(`"${a}" vs "${b}"`);
    }
  }
  say("contradiction", contradictions.length ? "finding" : "clear",
    contradictions.length ? `conflicting requirements: ${unique(contradictions).slice(0, 3).join("; ")}` : "no requirement asserts and forbids the same subject");

  say("missing_requirement", contract.acceptance.length ? "clear" : "finding",
    contract.acceptance.length ? `${contract.acceptance.length} acceptance criteria stated` : "nothing states when this artifact is done");

  const vague = contract.requirements.filter((r) => AMBIGUOUS.test(r));
  say("ambiguity", vague.length ? "finding" : "clear",
    vague.length ? `unquantified wording in: ${vague.slice(0, 3).join("; ")}` : "requirements are concrete enough to test");

  const assumptions = impliedAssumptions(contract, modality);
  say("assumptions", assumptions.length ? "finding" : "clear",
    assumptions.length ? assumptions.join("; ") : "no unstated assumption detected");

  say("dependencies", dependencies.length ? "finding" : "clear",
    dependencies.length
      ? `declares ${dependencies.join(", ")} — the sandbox installs nothing, so each must be inlined or dropped`
      : "no external dependency declared");

  const hasStates = contract.expectedBehavior.length > 0;
  say("state_coverage", hasStates ? "clear" : "finding",
    hasStates ? `${contract.expectedBehavior.length} behaviour(s) describe state changes` : "no state transitions are described");

  const edges = contract.requirements.filter((r) => /\b(empty|zero|none|max|first|last|invalid|error)\b/i.test(r));
  say("edge_cases", edges.length ? "clear" : "finding",
    edges.length ? `boundary conditions named: ${edges.slice(0, 2).join("; ")}` : "no empty / boundary / invalid case is specified");

  say("failure_modes", contract.invariants.length ? "clear" : "finding",
    contract.invariants.length ? `${contract.invariants.length} invariant(s) define failure` : "nothing defines what failure looks like");

  say("data_flow", contract.interface.length ? "clear" : "finding",
    contract.interface.length ? `inputs/outputs named: ${contract.interface.slice(0, 3).join("; ")}` : "the inputs and outputs are not named");

  say("control_flow", hasStates ? "clear" : "n/a",
    hasStates ? "behaviour statements imply the control path" : "no interactive control path in this artifact");

  const temporal = contract.expectedBehavior.some((b) => /\b(after|then|while|until|interval|tick|delay|timer)\b/i.test(b));
  say("temporal_flow", RUNTIME_MODALITIES.includes(modality) ? (temporal ? "clear" : "finding") : "n/a",
    RUNTIME_MODALITIES.includes(modality)
      ? temporal ? "timing behaviour is described" : "a running artifact with no timing rule — loop and tick behaviour is undefined"
      : "this artifact does not run over time");

  const touchesUser = contract.requirements.some((r) => /\b(user data|email|password|token|api key|upload|account)\b/i.test(r));
  say("security_privacy", touchesUser ? "finding" : "clear",
    touchesUser
      ? "the artifact references user data — it runs sandboxed with no credentials and no same-origin access"
      : "no credential or personal data enters the artifact");

  say("performance", RUNTIME_MODALITIES.includes(modality) ? "finding" : "n/a",
    RUNTIME_MODALITIES.includes(modality)
      ? "runs on the main thread of a sandboxed frame — keep per-frame work small"
      : "no runtime loop to profile");

  say("usability_accessibility", contract.interface.length ? "finding" : "n/a",
    contract.interface.length
      ? "keyboard reachability and contrast are not stated and are not auto-verified here"
      : "no interface surface to assess");

  say("scalability", modality === "data" ? "finding" : "n/a",
    modality === "data" ? "row volume is unbounded in the contract — large inputs are not paged" : "single-instance artifact, no scaling dimension");

  say("evidence", modality === "research" ? (contract.requirements.some((r) => /source|cite|verif/i.test(r)) ? "clear" : "finding") : "n/a",
    modality === "research"
      ? "sourcing requirement " + (contract.requirements.some((r) => /source|cite|verif/i.test(r)) ? "stated" : "absent — claims could go uncited")
      : "not an evidence-bearing artifact");

  say("counterexamples", behaviourObservable ? "clear" : "finding",
    behaviourObservable
      ? "the runtime can produce a counterexample by running the artifact"
      : "no runtime observation, so a failing case cannot be demonstrated — only argued");

  return DIMENSIONS.map((d) => out.find((o) => o.dimension === d) ?? { dimension: d, result: "n/a", note: "not assessed" });
}

function impliedAssumptions(contract: ArtifactContract, modality: ArtifactModality): string[] {
  const a: string[] = [];
  if (modality === "web" && !contract.interface.length) a.push("assumes a default interface nobody specified");
  if (contract.goals.length > 1) a.push("more than one goal is stated — priority between them is assumed");
  if (!contract.constraints.length) a.push("assumes no constraints on size, style, or dependencies");
  return a;
}

function keyOf(sentence: string): string | null {
  const m = sentence.toLowerCase().match(/\b([a-z]{4,})\b(?!.*\b([a-z]{4,})\b)/);
  return m?.[1] ?? null;
}

function unique(list: string[]): string[] {
  return Array.from(new Set(list));
}
