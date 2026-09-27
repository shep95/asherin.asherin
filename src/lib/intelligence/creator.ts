// adaptive pattern creator.
//
// when coverage says unknown, the system does not force a nearby pattern and it
// does not pretend it knows one. it decomposes the problem, looks for a
// mechanism (including in distant domains), synthesises a candidate, and keeps
// that candidate a hypothesis until outcomes say otherwise.

import type {
  PatternCoverage,
  PatternObject,
  RetrievedPattern,
  TaskFrame,
  FeedbackSignal,
  LearningScope,
} from "./types";
import { compose, transferAcrossDomains } from "./forge";
import { classifyScope } from "./scope";

export type DiscoveryTrigger = "no_coverage" | "partial_coverage" | "repeated_failure" | "user_feedback";

export interface Decomposition {
  primitives: string[];
  states: string[];
  constraints: string[];
  goals: string[];
  causalLinks: string[];
  transformations: string[];
}

/** decompose the problem into primitives before reaching for any analogy. */
export function decompose(task: TaskFrame): Decomposition {
  return {
    primitives: task.domains.map((d) => `${d}: what actually changes state here`),
    states: ["state before the action", "state after the action", "state when it fails"],
    constraints: task.constraints.length ? task.constraints : ["no explicit constraint stated"],
    goals: [task.goal],
    causalLinks: task.unknowns.map((u) => `unresolved: ${u}`),
    transformations: ["gather evidence", "form hypotheses", "discriminate between them", "act", "verify"],
  };
}

export interface DiscoveryResult {
  trigger: DiscoveryTrigger;
  decomposition: Decomposition;
  analogies: { fromPattern: string; fromDomain: string; mechanism: string }[];
  candidate: PatternObject | null;
  testPlan: string[];
  notes: string[];
}

/** decide whether discovery should run at all. unknown is a real state. */
export function needsDiscovery(coverage: PatternCoverage): DiscoveryTrigger | null {
  if (coverage.state === "unknown") return "no_coverage";
  if (coverage.state === "partial" && coverage.missing.length > 0) return "partial_coverage";
  return null;
}

/**
 * synthesise a candidate pattern for an uncovered problem. cross-domain search
 * is preferred over inventing from nothing: a mechanism that already works
 * somewhere is better evidence than a fresh guess.
 */
export function discover(
  task: TaskFrame,
  retrieved: RetrievedPattern[],
  allPatterns: PatternObject[],
  trigger: DiscoveryTrigger,
): DiscoveryResult {
  const notes: string[] = [];
  const decomposition = decompose(task);

  // look for mechanisms in OTHER domains — that is where transfer value lives.
  const foreign = allPatterns
    .filter((p) => !task.domains.includes(p.domain))
    .filter((p) => p.status === "active" || p.status === "validated" || p.status === "refined")
    .filter((p) => !!p.mechanism || p.procedure.length > 0)
    .slice(0, 5);

  const analogies = foreign.map((p) => ({
    fromPattern: p.slug,
    fromDomain: p.domain,
    mechanism: p.mechanism ?? p.procedure.join("; "),
  }));

  let candidate: PatternObject | null = null;
  let testPlan: string[] = [];

  if (foreign.length > 0) {
    const transfer = transferAcrossDomains(foreign[0], {
      domain: task.domains[0] ?? "general",
      functionGoal: task.goal,
      constraints: task.constraints,
    });
    if ("error" in transfer) {
      notes.push(transfer.error);
    } else {
      candidate = transfer.candidate;
      testPlan = transfer.testPlan;
      notes.push(`mechanism borrowed from the ${foreign[0].domain} domain and marked untested here`);
    }
  }

  if (!candidate && retrieved.length >= 2) {
    const result = compose("combine", [retrieved[0].pattern, retrieved[1].pattern], {
      name: `composed approach for ${task.domains[0] ?? "this task"}`,
      targetDomain: task.domains[0],
    });
    if ("error" in result) notes.push(result.error);
    else {
      candidate = result.pattern;
      testPlan = ["apply once", "record the outcome", "keep as candidate until three distinct successes"];
      notes.push("no single pattern fit — two partial matches were combined into a hypothesis");
    }
  }

  if (!candidate) {
    // nothing to borrow, nothing to combine: build from primitives, honestly weak.
    candidate = {
      id: "",
      slug: `discovered-${Date.now().toString(36)}`,
      name: `approach for ${task.domains[0] ?? "this problem"}`,
      description: `synthesised from primitives because no applicable pattern existed`,
      domain: task.domains[0] ?? "general",
      abstractionLevel: "operational",
      scope: "conversation",
      triggerTerms: Array.from(new Set(task.domains.concat(task.goal.toLowerCase().split(/\W+/).filter((w) => w.length > 4).slice(0, 5)))),
      inputs: [],
      preconditions: decomposition.constraints,
      mechanism: decomposition.transformations.join(" -> "),
      procedure: decomposition.transformations,
      constraints: task.constraints,
      expectedOutput: task.goal,
      failureModes: [],
      evidence: [{ kind: "hypothesis", note: "synthesised from problem primitives; no prior success", at: new Date().toISOString() }],
      evidenceQuality: "none",
      confidence: 0.15,
      successCount: 0,
      failureCount: 0,
      contextsUsed: [],
      status: "candidate",
      source: "experiment",
      version: 1,
    };
    testPlan = ["apply once and record the outcome", "revise the procedure at the step that failed"];
    notes.push("no analogy and no partial match — built from primitives, confidence intentionally low");
  }

  return { trigger, decomposition, analogies, candidate, testPlan, notes };
}

// ---------- feedback as a learning signal ----------

const NEGATIVE = /\b(stop|don'?t|no more|too much|wrong|bad|hate|annoying|again\?|why did you|quit)\b/i;
const POSITIVE = /\b(perfect|exactly|great|thanks|that works|nice|good call|yes that)\b/i;

export function readFeedback(text: string): FeedbackSignal {
  const t = (text || "").trim();
  const polarity: FeedbackSignal["polarity"] = NEGATIVE.test(t) ? "negative" : POSITIVE.test(t) ? "positive" : "neutral";
  return { text: t.slice(0, 300), polarity, at: new Date().toISOString() };
}

export interface FeedbackAdaptation {
  disliked: string;
  suspectedBehaviour: string;
  scope: LearningScope;
  scopeConfidence: number;
  candidate: PatternObject | null;
  /** true when one signal is not enough to justify changing anything durable. */
  heldForMoreEvidence: boolean;
  reason: string;
}

/**
 * turn feedback into a scoped candidate — never into universal truth. one
 * complaint is one observation; the pattern stays a candidate until repeated.
 */
export function adaptFromFeedback(
  signal: FeedbackSignal,
  ctx: { hasProject: boolean; repeatCount?: number; conversationId: string },
): FeedbackAdaptation {
  if (signal.polarity !== "negative") {
    return {
      disliked: "",
      suspectedBehaviour: "",
      scope: "task",
      scopeConfidence: 0,
      candidate: null,
      heldForMoreEvidence: false,
      reason: "not a corrective signal",
    };
  }

  const scopeResult = classifyScope(signal.text, { hasProject: ctx.hasProject, repeatCount: ctx.repeatCount });
  const disliked = signal.text;
  const suspectedBehaviour = signal.text.replace(/^(stop|don'?t|no more)\s+/i, "").slice(0, 160);

  const candidate: PatternObject = {
    id: "",
    slug: `feedback-${Date.now().toString(36)}`,
    name: `avoid: ${suspectedBehaviour}`.slice(0, 110),
    description: "derived from a correction the user gave",
    domain: "general",
    abstractionLevel: "operational",
    scope: scopeResult.scope,
    conversationId: scopeResult.scope === "conversation" ? ctx.conversationId : null,
    triggerTerms: suspectedBehaviour.toLowerCase().split(/\W+/).filter((w) => w.length > 3).slice(0, 6),
    inputs: [],
    preconditions: [],
    mechanism: `before acting, check whether the planned move is the one the user rejected: ${suspectedBehaviour}`,
    procedure: [
      "identify the move about to be made",
      `compare it against the rejected behaviour: ${suspectedBehaviour}`,
      "if it matches, choose the smallest alternative that still meets the goal",
    ],
    constraints: [],
    failureModes: [],
    evidence: [{ kind: "observation", note: `user said: ${disliked}`, conversationId: ctx.conversationId, at: signal.at }],
    evidenceQuality: "weak",
    confidence: 0.25,
    successCount: 0,
    failureCount: 0,
    contextsUsed: [],
    status: "candidate",
    source: "user_feedback",
    version: 1,
  };

  const repeats = ctx.repeatCount ?? 1;
  return {
    disliked,
    suspectedBehaviour,
    scope: scopeResult.scope,
    scopeConfidence: scopeResult.confidence,
    candidate,
    heldForMoreEvidence: repeats < 2 && scopeResult.scope === "user",
    reason:
      repeats < 2 && scopeResult.scope === "user"
        ? "one correction is one observation — held as a candidate rather than written to the vault"
        : scopeResult.reasons.join("; "),
  };
}
