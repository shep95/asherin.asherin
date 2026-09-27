// artifact contract — what "correct" means for this artifact, written down
// before anything is built, so the validator has something to compare against.

import type { TaskFrame } from "@/lib/intelligence/types";
import type { ArtifactContract, ArtifactModality } from "./types";

const REQUIREMENT_SPLIT = /(?:\n+|(?<=[.;])\s+|,\s+(?=(?:with|and|plus|including)\b))/i;

const BEHAVIOR_HINT =
  /\b(should|must|when|after|on (click|press|start|load)|arrow keys?|score|restart|game over|until|each time)\b/i;
const INTERFACE_HINT =
  /\b(button|input|field|screen|panel|list|table|chart|header|title|output|report|export|download|section)\b/i;

function sentences(text: string): string[] {
  return (text || "")
    .split(REQUIREMENT_SPLIT)
    .map((s) => s.trim().replace(/^[-*\d.)\s]+/, ""))
    .filter((s) => s.length > 2);
}

export interface ContractInput {
  request: string;
  task: TaskFrame;
  modality: ArtifactModality;
  /** for follow-ups: the contract being amended. */
  previous?: ArtifactContract | null;
  /** whether the runtime can actually observe behaviour for this artifact. */
  behaviourObservable: boolean;
}

export function buildContract(input: ContractInput): ArtifactContract {
  const parts = sentences(input.request);
  const requirements = parts.filter((p) => p.length > 4);
  const expectedBehavior = parts.filter((p) => BEHAVIOR_HINT.test(p));
  const iface = parts.filter((p) => INTERFACE_HINT.test(p));

  const goals = [input.task.goal || input.request.slice(0, 200)].filter(Boolean);
  const constraints = [...input.task.constraints];

  const invariants = deriveInvariants(input.modality, requirements);

  const acceptance = [
    ...expectedBehavior.map((b) => `observable: ${b}`),
    ...(expectedBehavior.length === 0 ? [`the result satisfies: ${goals[0] ?? input.request.slice(0, 120)}`] : []),
  ];

  const testModel = acceptance.map((a, i) => ({
    id: `acc_${i + 1}`,
    description: a,
    observable: input.behaviourObservable && a.startsWith("observable:"),
    why: input.behaviourObservable ? undefined : "no runtime observation channel for this modality",
  }));

  const merged: ArtifactContract = {
    goals: dedupe([...(input.previous?.goals ?? []), ...goals]),
    requirements: dedupe([...(input.previous?.requirements ?? []), ...requirements]),
    expectedBehavior: dedupe([...(input.previous?.expectedBehavior ?? []), ...expectedBehavior]),
    interface: dedupe([...(input.previous?.interface ?? []), ...iface]),
    constraints: dedupe([...(input.previous?.constraints ?? []), ...constraints]),
    invariants: dedupe([...(input.previous?.invariants ?? []), ...invariants]),
    acceptance: dedupe([...(input.previous?.acceptance ?? []), ...acceptance]),
    testModel: [],
  };
  // test model is rebuilt from the merged acceptance so a follow-up never
  // leaves stale checks behind.
  merged.testModel = merged.acceptance.map((a, i) => ({
    id: `acc_${i + 1}`,
    description: a,
    observable: input.behaviourObservable && a.startsWith("observable:"),
    why: input.behaviourObservable ? undefined : "no runtime observation channel for this modality",
  })).concat(testModel.filter((t) => !merged.acceptance.includes(t.description)));

  return merged;
}

function deriveInvariants(modality: ArtifactModality, requirements: string[]): string[] {
  const inv: string[] = [];
  if (modality === "web" || modality === "simulation") {
    inv.push("the artifact loads without an uncaught error");
    inv.push("no state update happens after the artifact is torn down");
  }
  if (modality === "data") inv.push("every rendered value traces to a supplied input row");
  if (modality === "research") inv.push("every claim carries a source or is marked unresolved");
  if (modality === "document" || modality === "plan" || modality === "workflow") {
    inv.push("no placeholder or TODO text survives into the result");
  }
  if (requirements.some((r) => /\bnever\b/i.test(r))) inv.push("stated prohibitions are not violated");
  return inv;
}

function dedupe(list: string[]): string[] {
  return Array.from(new Set(list.map((s) => s.trim()).filter(Boolean)));
}

/** a follow-up instruction amends the contract instead of replacing it. */
export function amendContract(previous: ArtifactContract, instruction: string, task: TaskFrame, modality: ArtifactModality, behaviourObservable: boolean): ArtifactContract {
  return buildContract({ request: instruction, task, modality, previous, behaviourObservable });
}
