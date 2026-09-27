// intent router — the branch point after the context resolver.
//
// the router does not decide the answer. it decides WHICH transformation the
// turn should run through: a dialogue loop, a forward idea-to-system loop, a
// reverse reconstruct-and-repair loop, or a creation loop. the lane it picks is
// recorded so a later failure can be attributed to routing rather than to
// reasoning.

import type { TaskFrame } from "./types";

export type IntentLane = "conversation" | "coding" | "creation";

export type IntentSpecialisation =
  | "reasoning"
  | "teaching"
  | "research"
  | "planning"
  | "decision"
  | "writing"
  | "analysis"
  | "implementation"
  | "debugging"
  | "image"
  | "design"
  | "vision";

export type LoopKind = "dialogue" | "forward" | "reverse" | "creation";

export interface IntentRoute {
  lane: IntentLane;
  specialisation: IntentSpecialisation;
  loop: LoopKind;
  reasons: string[];
}

/** wording that says an artefact already exists — the loop must run backwards. */
const EXISTING_ARTEFACT =
  /\b(this (code|file|function|component|query|page)|already (built|wrote|have)|existing|current implementation|it (used to|stopped)|regress\w*|why (is|does) (it|this))\b/i;

/** wording that says nothing exists yet — the loop must run forwards. */
const GREENFIELD = /\b(build|create|add|design|implement|make|set ?up|scaffold|new feature)\b/i;

export function routeIntent(
  task: TaskFrame,
  ctx: { message?: string; hasImageInput?: boolean } = {},
): IntentRoute {
  const text = ctx.message ?? task.goal ?? "";
  const reasons: string[] = [];

  const existing = EXISTING_ARTEFACT.test(text);
  const greenfield = GREENFIELD.test(text);

  switch (task.modality) {
    case "debugging":
      reasons.push("failure language — the artefact exists and its model must be reconstructed before repair");
      return { lane: "coding", specialisation: "debugging", loop: "reverse", reasons };

    case "code": {
      if (existing && !greenfield) {
        reasons.push("refers to code that already exists — reconstruct intent before changing it");
        return { lane: "coding", specialisation: "implementation", loop: "reverse", reasons };
      }
      reasons.push("new construction — run the idea-to-system loop before writing anything");
      return { lane: "coding", specialisation: "implementation", loop: "forward", reasons };
    }

    case "image":
      reasons.push("visual artefact requested — composition is modelled before generation");
      return { lane: "creation", specialisation: "image", loop: "creation", reasons };

    case "design":
      reasons.push("design work — intent and composition are modelled before output");
      return { lane: "creation", specialisation: "design", loop: "creation", reasons };

    case "vision":
      reasons.push("an image was supplied — observation comes before interpretation");
      return { lane: "creation", specialisation: "vision", loop: "dialogue", reasons };

    case "planning":
      reasons.push("planning — the system to be built is modelled before steps are ordered");
      return { lane: "conversation", specialisation: "planning", loop: "forward", reasons };

    case "research":
      reasons.push("evidence work — retrieval and corroboration lead");
      return { lane: "conversation", specialisation: "research", loop: "dialogue", reasons };

    case "analysis":
      reasons.push("analysis — observed model is compared against the expected one");
      return { lane: "conversation", specialisation: "analysis", loop: "reverse", reasons };

    case "writing":
      reasons.push("written artefact — intent and shape before prose");
      return { lane: "creation", specialisation: "writing", loop: "creation", reasons };

    case "decision":
      reasons.push("a decision is wanted — options are compared, not narrated");
      return { lane: "conversation", specialisation: "decision", loop: "dialogue", reasons };

    case "teaching":
      reasons.push("explanation requested — depth is chosen deliberately");
      return { lane: "conversation", specialisation: "teaching", loop: "dialogue", reasons };

    case "mixed":
      reasons.push("no single modality dominates — the dialogue loop keeps the ambiguity visible");
      return { lane: "conversation", specialisation: "reasoning", loop: "dialogue", reasons };

    default:
      if (ctx.hasImageInput) {
        reasons.push("an image came with the message");
        return { lane: "creation", specialisation: "vision", loop: "dialogue", reasons };
      }
      reasons.push("ordinary conversation");
      return { lane: "conversation", specialisation: "reasoning", loop: "dialogue", reasons };
  }
}
