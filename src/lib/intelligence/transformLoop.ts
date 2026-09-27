// the universal transformation loop.
//
// "find the flaws" is not one step. detecting which KIND of flaw exists,
// repairing the model that produced it, and then verifying the repair are three
// different operations, and they run in different directions depending on
// whether the artefact already exists.
//
//   forward  — idea -> intent -> models -> critique -> architecture -> build -> verify
//   reverse  — artefact -> reconstructed models -> difference -> hypotheses -> repair -> verify
//   dialogue — question -> uncertainty -> evidence -> candidate -> contradiction check -> answer
//   creation — request -> intent -> composition model -> produce -> critique against intent
//
// this module is pure. it produces the staged plan; the orchestrator hands the
// plan to the model as procedure text, and the validator checks the output
// against the stages that were supposed to run.

import type { LoopKind } from "./intentRouter";

export interface LoopStage {
  id: string;
  label: string;
  /** the question this stage must actually answer before the next one runs. */
  question: string;
  /** flaw classes this stage is responsible for catching. */
  catches: string[];
}

const FORWARD: LoopStage[] = [
  { id: "intent", label: "intent", question: "what is actually wanted, beneath the wording?", catches: ["misread request"] },
  { id: "narrative", label: "narrative model", question: "what story does this system enact, start to finish?", catches: ["missing actor", "missing step"] },
  { id: "problem", label: "problem model", question: "what breaks today, and for whom?", catches: ["solving the wrong problem"] },
  { id: "goal", label: "goal model", question: "what observable condition means this succeeded?", catches: ["unfalsifiable goal"] },
  { id: "function", label: "function model", question: "what must the system do, as verbs?", catches: ["missing capability"] },
  { id: "boundary", label: "system boundary", question: "what is inside this system and what is someone else's?", catches: ["scope creep", "hidden dependency"] },
  { id: "state", label: "actor and state model", question: "who acts, and what states can each object be in?", catches: ["illegal state", "unowned action"] },
  { id: "workflow", label: "workflow model", question: "what is the order, and what happens when a step fails?", catches: ["no failure path", "ordering fault"] },
  { id: "interfaces", label: "logic, data and interface model", question: "what data moves, in what shape, across which surface?", catches: ["schema drift", "contract mismatch"] },
  { id: "failure", label: "failure model", question: "how does each part fail, and what does it take with it?", catches: ["unhandled failure", "silent catch"] },
  { id: "critique", label: "critique", question: "where is this model weakest?", catches: ["logic", "security", "performance", "ui", "a11y"] },
  { id: "contradiction", label: "contradiction check", question: "do any two requirements conflict?", catches: ["contradiction"] },
  { id: "edges", label: "edge cases", question: "what happens at zero, one, many, and hostile input?", catches: ["boundary fault"] },
  { id: "repaired", label: "repaired model", question: "what does the model look like after those repairs?", catches: ["unrepaired flaw"] },
  { id: "architecture", label: "architecture", question: "what structure carries this model?", catches: ["structural mismatch"] },
  { id: "plan", label: "build plan", question: "what is the smallest ordered set of changes?", catches: ["oversized change"] },
  { id: "implement", label: "implementation", question: "what is the actual change?", catches: ["implementation drift"] },
  { id: "test", label: "test", question: "what evidence shows it works?", catches: ["unverified claim"] },
  { id: "compare", label: "compare against model", question: "did observed behaviour match the model?", catches: ["model error"] },
  { id: "verify", label: "verified result", question: "what remains unproven, stated plainly?", catches: ["overclaim"] },
];

const REVERSE: LoopStage[] = [
  { id: "intent", label: "reconstruct intent", question: "what was this artefact meant to do?", catches: ["assumed intent"] },
  { id: "narrative", label: "reconstruct narrative", question: "what story does it enact now?", catches: ["misread behaviour"] },
  { id: "state", label: "reconstruct state", question: "what states exist, and which are reachable?", catches: ["illegal state"] },
  { id: "workflow", label: "reconstruct workflow", question: "what is the real order of operations?", catches: ["ordering fault"] },
  { id: "data", label: "data flow", question: "where does each value come from and go?", catches: ["stale data", "lost update"] },
  { id: "control", label: "control flow", question: "which branches actually execute?", catches: ["dead branch", "missing guard"] },
  { id: "temporal", label: "temporal flow", question: "what runs concurrently, late, or twice?", catches: ["race", "stale closure", "double submit"] },
  { id: "invariants", label: "invariants", question: "what must always hold?", catches: ["broken invariant"] },
  { id: "expected", label: "expected model", question: "what should happen?", catches: ["unstated expectation"] },
  { id: "observed", label: "observed model", question: "what does happen, by evidence?", catches: ["guessed behaviour"] },
  { id: "difference", label: "difference", question: "exactly where do the two diverge?", catches: ["vague diagnosis"] },
  { id: "hypotheses", label: "hypotheses", question: "what could produce that divergence?", catches: ["single-cause bias"] },
  { id: "discriminate", label: "discriminating test", question: "what test separates those hypotheses?", catches: ["untested fix"] },
  { id: "root", label: "root cause", question: "which cause survived the test?", catches: ["symptom fix"] },
  { id: "model_repair", label: "model repair", question: "what was wrong in the understanding, not the code?", catches: ["recurring bug"] },
  { id: "impl_repair", label: "implementation repair", question: "what is the minimal correct change?", catches: ["collateral change"] },
  { id: "test", label: "test", question: "does the failing case now pass?", catches: ["unverified fix"] },
  { id: "adversarial", label: "adversarial test", question: "what input would still break it?", catches: ["fragile fix"] },
  { id: "regression", label: "regression", question: "what else did this touch?", catches: ["regression"] },
  { id: "verify", label: "verify", question: "what is proven and what is still assumed?", catches: ["overclaim"] },
];

const DIALOGUE: LoopStage[] = [
  { id: "uncertainty", label: "classify uncertainty", question: "is this known, uncertain, or unknown to me?", catches: ["confident guess"] },
  { id: "evidence", label: "retrieve evidence", question: "what do i actually have that bears on this?", catches: ["unsupported claim"] },
  { id: "candidate", label: "candidate answer", question: "what is the direct answer?", catches: ["evasion", "padding"] },
  { id: "contradiction", label: "contradiction check", question: "does it conflict with a standing rule or a stated fact?", catches: ["contradiction", "rule violation"] },
  { id: "depth", label: "depth selection", question: "how much explanation does this actually need?", catches: ["over-explanation", "under-explanation"] },
  { id: "answer", label: "answer", question: "conclusion first, evidence attached, unknowns named", catches: ["buried conclusion"] },
];

const CREATION: LoopStage[] = [
  { id: "intent", label: "intent", question: "what is this artefact for, and who sees it?", catches: ["misread brief"] },
  { id: "narrative", label: "creative narrative", question: "what should it say without words?", catches: ["generic output"] },
  { id: "composition", label: "composition model", question: "what structure, weight and emphasis carries that?", catches: ["symmetry by default", "visual noise"] },
  { id: "constraints", label: "constraints", question: "what has the operator ruled in or out?", catches: ["ignored preference"] },
  { id: "produce", label: "produce", question: "make it", catches: ["unattempted work"] },
  { id: "critique", label: "critique against intent", question: "does the result serve the intent, honestly?", catches: ["self-flattery"] },
  { id: "adjust", label: "adjust", question: "what one change improves it most?", catches: ["unbounded iteration"] },
];

export interface TransformPlan {
  kind: LoopKind;
  stages: LoopStage[];
  /** stages that cannot be run because the required evidence is absent. */
  blocked: { id: string; reason: string }[];
}

export function selectLoop(kind: LoopKind, ctx: { hasArtefact?: boolean; canRunTests?: boolean } = {}): TransformPlan {
  const stages = kind === "forward" ? FORWARD : kind === "reverse" ? REVERSE : kind === "creation" ? CREATION : DIALOGUE;
  const blocked: TransformPlan["blocked"] = [];

  // honesty: a stage that needs something this runtime does not have is marked
  // blocked rather than quietly narrated as if it had run.
  if (kind === "reverse" && ctx.hasArtefact === false) {
    blocked.push({ id: "observed", reason: "no artefact or trace supplied — observed behaviour cannot be established" });
  }
  if (ctx.canRunTests === false) {
    for (const id of ["test", "adversarial", "regression", "discriminate"]) {
      if (stages.some((s) => s.id === id)) {
        blocked.push({ id, reason: "no execution surface here — say what test would decide it instead of claiming it passed" });
      }
    }
  }
  return { kind, stages, blocked };
}

/** render the plan as procedure text for the model brief. */
export function renderLoop(plan: TransformPlan): string {
  const lines = plan.stages.map((s, i) => `${i + 1}. ${s.label} — ${s.question}`);
  const blocked = plan.blocked.length
    ? `\nstages that cannot be completed here: ${plan.blocked.map((b) => `${b.id} (${b.reason})`).join("; ")}`
    : "";
  return `transformation loop (${plan.kind}) — run these in order, silently, and answer from the result:\n${lines.join("\n")}${blocked}`;
}

/** flaw classes the selected loop is responsible for catching this turn. */
export function loopFlawClasses(plan: TransformPlan): string[] {
  return Array.from(new Set(plan.stages.flatMap((s) => s.catches)));
}
