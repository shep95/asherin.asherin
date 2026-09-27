// feedback analyzer — attribution before adaptation.
//
// a correction is not an instruction to obey once. it is an observation about
// which part of the system produced the wrong result. this module answers three
// questions and nothing else:
//
//   what behaviour was the operator reacting to?
//   which layer caused it?            (reasoning, workflow, communication, …)
//   how deep should the change go?    (this response, a pattern, the workflow)
//
// it never decides to store anything. the learning gate does that.

import type { FeedbackSignal, LearningScope, TaskModality } from "./types";
import { classifyScope } from "./scope";

export type CauseType =
  | "reasoning"
  | "workflow"
  | "communication"
  | "coding"
  | "design"
  | "security"
  | "retrieval"
  | "data"
  | "user_preference"
  | "task_condition"
  | "unattributed";

/** how deep an adaptation is allowed to go. the third level is the important one. */
export type AdaptationLevel = "response" | "pattern" | "architecture";

interface Rule {
  cause: CauseType;
  re: RegExp;
  behaviour: string;
}

const RULES: Rule[] = [
  {
    cause: "communication",
    re: /\b(too (much|long|verbose|wordy)|shorter|less explanation|stop explaining|get to the point|rambl\w*|padding|preamble|too short|more detail|explain more)\b/i,
    behaviour: "response depth selection",
  },
  {
    cause: "reasoning",
    re: /\b(wrong|incorrect|that'?s not (right|true)|made (that )?up|hallucinat\w*|contradict\w*|doesn'?t follow|bad logic)\b/i,
    behaviour: "conclusion drawn from insufficient or conflicting evidence",
  },
  {
    cause: "workflow",
    re: /\b(again|same (bug|issue|error|thing)|still (broken|failing)|didn'?t fix|keep(s)? (breaking|happening)|every time you)\b/i,
    behaviour: "the order of operations used to solve this class of task",
  },
  {
    cause: "coding",
    re: /\b(doesn'?t (compile|build|run)|type error|lint|syntax|undefined is not|crash\w*|throws?|test(s)? fail)\b/i,
    behaviour: "the implementation approach",
  },
  {
    cause: "design",
    re: /\b(symmetr\w*|composition|layout|palette|colou?r|font|typograph\w*|too busy|cluttered|spacing|ugly|centered)\b/i,
    behaviour: "composition and visual emphasis",
  },
  {
    cause: "security",
    re: /\b(leak\w*|exposed?|secret|api key|credential|token|permission|public(ly)? readable|injection)\b/i,
    behaviour: "handling of sensitive material and access boundaries",
  },
  {
    cause: "retrieval",
    re: /\b(you didn'?t (read|look|check|search)|missed the (file|doc|source)|wrong (file|source|page)|not what i (uploaded|linked))\b/i,
    behaviour: "what evidence was gathered before answering",
  },
  {
    cause: "data",
    re: /\b(outdated|stale|old (data|number|price)|wrong (number|figure|date|total)|out of date)\b/i,
    behaviour: "freshness and provenance of the values used",
  },
  {
    cause: "user_preference",
    re: /\b(i (prefer|like|want|hate)|from now on|always|never do|stop (doing|adding|using))\b/i,
    behaviour: "a standing preference about how work is delivered",
  },
  {
    cause: "task_condition",
    re: /\b(for (this|the current) (task|one|file|project)|in this case|just here|only for)\b/i,
    behaviour: "a condition specific to this task",
  },
];

export interface FeedbackAnalysis {
  causeType: CauseType;
  affectedBehaviour: string;
  adaptationLevel: AdaptationLevel;
  scope: LearningScope;
  confidence: number;
  reasons: string[];
  /** true when the signal is real but its cause cannot honestly be identified. */
  needsClarification: boolean;
}

export interface AnalyzerContext {
  hasProject: boolean;
  /** how many negative signals this conversation has already carried. */
  repeatCount?: number;
  modality?: TaskModality;
}

/** causes where a repeat means the WORKFLOW is wrong, not just the output. */
const ARCHITECTURAL_CAUSES: CauseType[] = ["workflow", "retrieval", "reasoning", "data", "security"];

export function analyzeFeedback(signal: FeedbackSignal, ctx: AnalyzerContext): FeedbackAnalysis {
  const reasons: string[] = [];
  const text = (signal.text || "").trim();
  const repeats = Math.max(1, ctx.repeatCount ?? 1);

  if (signal.polarity !== "negative" || !text) {
    return {
      causeType: "unattributed",
      affectedBehaviour: "",
      adaptationLevel: "response",
      scope: "ephemeral",
      confidence: 0,
      reasons: ["not a corrective signal"],
      needsClarification: false,
    };
  }

  const matched = RULES.filter((r) => r.re.test(text));
  const primary = matched[0];

  const causeType: CauseType = primary?.cause ?? "unattributed";
  const affectedBehaviour = primary?.behaviour ?? "unclear — the correction does not identify what produced it";
  if (primary) reasons.push(`wording points at ${causeType}: ${affectedBehaviour}`);
  else reasons.push("negative signal with no identifiable cause — recorded, not acted on as a rule");

  if (matched.length > 1) {
    reasons.push(`also consistent with ${matched.slice(1).map((m) => m.cause).join(", ")} — primary chosen by specificity order`);
  }

  // scope comes from the wording, never from the cause type. "for this file"
  // stays task-scoped even when it is a security correction.
  const scopeResult = classifyScope(text, { hasProject: ctx.hasProject, repeatCount: repeats });
  reasons.push(...scopeResult.reasons);
  const scope: LearningScope = causeType === "task_condition" ? "task" : scopeResult.scope;

  // depth of adaptation. one signal changes this answer. a repeat changes the
  // reusable pattern. a repeat on a causal layer changes the workflow itself.
  let adaptationLevel: AdaptationLevel = "response";
  if (repeats >= 3 && ARCHITECTURAL_CAUSES.includes(causeType)) {
    adaptationLevel = "architecture";
    reasons.push(`${repeats} corrections on a ${causeType} cause — the workflow is at fault, not the wording`);
  } else if (repeats >= 2 && causeType !== "unattributed") {
    adaptationLevel = "pattern";
    reasons.push("repeated — worth a reusable pattern rather than a one-off fix");
  } else {
    reasons.push("first observation — applies to this answer only until it repeats");
  }

  const confidence = primary
    ? Math.min(0.9, 0.35 + 0.15 * repeats + (matched.length === 1 ? 0.1 : 0))
    : 0.15;

  return {
    causeType,
    affectedBehaviour,
    adaptationLevel,
    scope,
    confidence,
    reasons,
    needsClarification: !primary,
  };
}

/** the corrective procedure a pattern built from this analysis should carry. */
export function repairProcedure(analysis: FeedbackAnalysis): string[] {
  switch (analysis.causeType) {
    case "communication":
      return [
        "decide the answer first, then decide how much of it needs saying",
        "when the task is straightforward: conclusion, the evidence that supports it, nothing else",
        "expand only when ambiguity is material, depth was asked for, or a decision hinges on it",
      ];
    case "reasoning":
      return [
        "separate what is observed from what is inferred before answering",
        "state the confidence and what would change it",
        "when evidence conflicts, present the conflict instead of resolving it silently",
      ];
    case "workflow":
      return [
        "reconstruct the failure before changing anything",
        "form at least two hypotheses and name the test that separates them",
        "verify the repair against the original failing case, then check what else it touched",
      ];
    case "retrieval":
      return [
        "gather the named sources before reasoning, not after",
        "if a referenced source was not read, say so rather than answering around it",
      ];
    case "data":
      return ["carry the timestamp and origin of every figure used", "flag a value as stale rather than presenting it as current"];
    case "security":
      return ["never place credentials or secrets into stored context", "state the access boundary being crossed before crossing it"];
    case "coding":
      return ["make the smallest change that fixes the named failure", "check the change compiles and the failing case passes before reporting"];
    case "design":
      return ["model the composition before generating", "avoid the default centred, symmetrical arrangement unless it was asked for"];
    case "user_preference":
      return ["check the standing rules before choosing a delivery format", "when a rule conflicts with the request, name the conflict"];
    default:
      return ["record the correction and ask what specifically was wrong before changing behaviour"];
  }
}
