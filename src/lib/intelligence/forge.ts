// pattern forge — composition and cross-domain transfer.
//
// forge sits ABOVE the model: it decides how a task should be approached, then
// the model executes that approach. it never asks the model what pattern to use
// and then trusts the answer as fact.

import type { AbstractionLevel, PatternObject, TaskFrame } from "./types";

export type CompositionOperation =
  | "combine"
  | "sequence"
  | "nest"
  | "mutate"
  | "generalize"
  | "specialize"
  | "domain_swap"
  | "introduce_feedback"
  | "add_redundancy"
  | "decentralize";

let counter = 0;
function slugify(name: string): string {
  counter += 1;
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${base}-${Date.now().toString(36)}${counter.toString(36)}`;
}

function blank(name: string, domain: string, level: AbstractionLevel): PatternObject {
  return {
    id: "",
    slug: slugify(name),
    name,
    domain,
    abstractionLevel: level,
    scope: "conversation",
    triggerTerms: [],
    inputs: [],
    preconditions: [],
    procedure: [],
    constraints: [],
    failureModes: [],
    evidence: [],
    evidenceQuality: "none",
    confidence: 0.2,
    successCount: 0,
    failureCount: 0,
    contextsUsed: [],
    status: "candidate",
    source: "pattern_composition",
    version: 1,
  };
}

function uniq(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

export interface CompositionResult {
  pattern: PatternObject;
  derivedFrom: string[];
  operation: CompositionOperation;
  rationale: string;
}

/**
 * compose a new candidate from existing patterns. the result is a hypothesis:
 * status candidate, confidence low, provenance recorded as composition.
 */
export function compose(
  operation: CompositionOperation,
  parents: PatternObject[],
  options: { name?: string; constraint?: string; targetDomain?: string } = {},
): CompositionResult | { error: string } {
  if (parents.length === 0) return { error: "composition needs at least one parent pattern" };
  if ((operation === "combine" || operation === "sequence" || operation === "nest") && parents.length < 2) {
    return { error: `${operation} needs at least two parent patterns` };
  }

  const domain = options.targetDomain || parents[0].domain;
  const name = options.name || `${operation}: ${parents.map((p) => p.name).join(" + ")}`.slice(0, 120);
  const level: AbstractionLevel =
    operation === "generalize" ? "abstract" : operation === "specialize" ? "concrete" : parents[0].abstractionLevel;

  const next = blank(name, domain, level);
  next.triggerTerms = uniq(parents.flatMap((p) => p.triggerTerms));
  next.preconditions = uniq(parents.flatMap((p) => p.preconditions));
  next.constraints = uniq([...parents.flatMap((p) => p.constraints), options.constraint ?? ""]);
  next.failureModes = parents.flatMap((p) => p.failureModes);

  switch (operation) {
    case "sequence":
      next.procedure = parents.flatMap((p) => p.procedure);
      next.mechanism = `run ${parents.map((p) => p.name).join(" then ")} in order`;
      break;
    case "nest":
      next.procedure = [
        ...parents[0].procedure.slice(0, 1),
        ...parents.slice(1).flatMap((p) => p.procedure.map((s) => `  ${s}`)),
        ...parents[0].procedure.slice(1),
      ];
      next.mechanism = `run ${parents.slice(1).map((p) => p.name).join(", ")} inside ${parents[0].name}`;
      break;
    case "combine":
      next.procedure = uniq(parents.flatMap((p) => p.procedure));
      next.mechanism = `merge the mechanisms of ${parents.map((p) => p.name).join(" and ")}`;
      break;
    case "generalize":
      next.procedure = parents[0].procedure.map((s) => s.replace(/\b(this|the current)\b/gi, "the"));
      next.mechanism = parents[0].mechanism ? `generalized: ${parents[0].mechanism}` : "generalized mechanism";
      next.triggerTerms = uniq(next.triggerTerms).slice(0, 12);
      break;
    case "specialize":
      next.procedure = [...parents[0].procedure];
      if (options.constraint) next.procedure.push(`hold the constraint: ${options.constraint}`);
      next.mechanism = parents[0].mechanism ? `specialized: ${parents[0].mechanism}` : "specialized mechanism";
      break;
    case "domain_swap":
      next.procedure = parents[0].procedure.map((s) =>
        s.replace(new RegExp(`\\b${parents[0].domain}\\b`, "gi"), domain),
      );
      next.mechanism = `${parents[0].mechanism ?? parents[0].name} carried into ${domain}`;
      break;
    case "mutate":
      next.procedure = [...parents[0].procedure];
      if (options.constraint) next.procedure.unshift(options.constraint);
      next.mechanism = parents[0].mechanism;
      break;
    case "introduce_feedback":
      next.procedure = [
        ...parents[0].procedure,
        "observe the result against the stated goal",
        "feed the observation back into the earlier step that produced it",
      ];
      next.mechanism = `${parents[0].mechanism ?? parents[0].name} with a closed feedback loop`;
      break;
    case "add_redundancy":
      next.procedure = [
        ...parents[0].procedure,
        "confirm the result through a second independent route before accepting it",
      ];
      next.mechanism = `${parents[0].mechanism ?? parents[0].name} with independent confirmation`;
      break;
    case "decentralize":
      next.procedure = [
        "split the work into parts that can be evaluated independently",
        ...parents[0].procedure,
        "reconcile the independent results and keep unresolved disagreement visible",
      ];
      next.mechanism = `${parents[0].mechanism ?? parents[0].name} run in parallel and reconciled`;
      break;
  }

  next.constraints = uniq(next.constraints);
  next.evidence = [
    {
      kind: "hypothesis",
      note: `composed via ${operation} from ${parents.map((p) => p.slug).join(", ")}`,
      at: new Date().toISOString(),
    },
  ];

  return {
    pattern: next,
    derivedFrom: parents.map((p) => p.id).filter(Boolean),
    operation,
    rationale: next.mechanism || operation,
  };
}

// ---------- cross-domain transfer ----------

export interface TransferPipeline {
  sourcePattern: string;
  fn: string;
  mechanism: string;
  invariant: string;
  abstractPattern: string;
  targetFunction: string;
  targetConstraints: string[];
  candidate: PatternObject;
  testPlan: string[];
}

/**
 * transfer the mechanism, not the surface implementation. the pipeline is
 * source -> function -> mechanism -> invariant -> abstract -> target -> test.
 */
export function transferAcrossDomains(
  source: PatternObject,
  target: { domain: string; functionGoal: string; constraints: string[] },
): TransferPipeline | { error: string } {
  if (!source.mechanism && source.procedure.length === 0) {
    return { error: "source pattern has no mechanism or procedure to transfer" };
  }
  const mechanism = source.mechanism ?? source.procedure.join("; ");
  const invariant = source.constraints[0] ?? "the ordering of evidence before commitment";
  const abstractName = `abstract: ${source.name}`;

  const candidate = blank(`${source.name} → ${target.domain}`, target.domain, "operational");
  candidate.source = "cross_domain_transfer";
  candidate.mechanism = mechanism;
  candidate.procedure = source.procedure.map((s) => s.replace(new RegExp(`\\b${source.domain}\\b`, "gi"), target.domain));
  candidate.constraints = uniq([...source.constraints, ...target.constraints]);
  candidate.triggerTerms = uniq([...source.triggerTerms, target.domain]);
  candidate.expectedOutput = target.functionGoal;
  candidate.evidence = [
    {
      kind: "hypothesis",
      note: `mechanism transferred from ${source.domain} pattern ${source.slug}; untested in ${target.domain}`,
      at: new Date().toISOString(),
    },
  ];

  return {
    sourcePattern: source.slug,
    fn: source.expectedOutput ?? source.name,
    mechanism,
    invariant,
    abstractPattern: abstractName,
    targetFunction: target.functionGoal,
    targetConstraints: target.constraints,
    candidate,
    testPlan: [
      `apply the transferred procedure to one ${target.domain} case`,
      `check the invariant still holds: ${invariant}`,
      "record the outcome; keep the pattern a candidate until it succeeds in three distinct contexts",
    ],
  };
}

/** the forge's per-task strategy: which patterns, in what order, with what checks. */
export interface ForgeStrategy {
  approach: string;
  steps: string[];
  patternsApplied: string[];
  contrastConsidered: string | null;
  openUnknowns: string[];
}

export function buildStrategy(task: TaskFrame, patterns: PatternObject[]): ForgeStrategy {
  const applied = patterns.slice(0, 5);
  const steps: string[] = [];
  for (const p of applied) {
    for (const s of p.procedure) steps.push(s);
  }
  if (steps.length === 0) {
    steps.push(
      "translate the ask into a narrative: actors, state, goal, constraints",
      "name what is unknown before answering",
      "answer from evidence and mark what is unsure",
    );
  }
  // deliberately consider one contrasting or failure pattern on nontrivial work
  const contrast = patterns.find((p) => p.failureModes.length > 0);
  return {
    approach: applied.length ? applied.map((p) => p.name).join(" + ") : "no established pattern — reason from primitives",
    steps: Array.from(new Set(steps)),
    patternsApplied: applied.map((p) => p.slug),
    contrastConsidered: contrast ? `${contrast.name} fails when: ${contrast.failureModes[0].whenFails}` : null,
    openUnknowns: task.unknowns,
  };
}
