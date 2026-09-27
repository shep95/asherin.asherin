// context resolver — the runtime assembly step.
//
// this is where relevance-based retrieval replaces prompt stuffing. it pulls
// conversation state, the relevant slice of memory, the relevant slice of
// project knowledge and a ranked handful of patterns, then composes a bounded
// context. what does not fit the budget is left out, not truncated mid-thought.

import type {
  ConversationState,
  IntelligenceSettings,
  MemoryRecord,
  PatternObject,
  RuntimeContext,
  TaskFrame,
} from "./types";
import { retrievePatterns, checkCoverage } from "./patternRelevance";
import { buildStrategy } from "./forge";

const DEFAULT_BUDGET = { maxMemories: 8, maxPatterns: 7 };

function tokenize(text: string): Set<string> {
  return new Set(
    (text || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 3),
  );
}

export function rankMemories(memories: MemoryRecord[], query: string, limit: number): MemoryRecord[] {
  const bag = tokenize(query);
  return memories
    .map((m) => {
      const words = tokenize(m.content);
      let overlap = 0;
      words.forEach((w) => {
        if (bag.has(w)) overlap += 1;
      });
      // standing rules ("never", "prefer", output style) apply broadly; every
      // other memory must actually touch the question, or it is noise.
      const alwaysOn = m.kind === "never" || m.kind === "prefer" || m.kind === "output";
      if (overlap === 0 && !alwaysOn) return { m, score: 0 };
      const score = overlap + (alwaysOn ? 1.5 : 0) + m.confidence;
      return { m, score };
    })
    .filter((r) => r.score > 0.6)

    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.m);
}

export interface ResolveInput {
  conversation: ConversationState;
  task: TaskFrame;
  query: string;
  settings: IntelligenceSettings;
  userMemory: MemoryRecord[];
  projectMemory: MemoryRecord[];
  patterns: PatternObject[];
  budget?: { maxMemories: number; maxPatterns: number };
}

export function resolveContext(input: ResolveInput): RuntimeContext {
  const budget = input.budget ?? DEFAULT_BUDGET;
  const notes: string[] = [];

  // memory OFF is a real boundary: durable memory is not read, and nothing
  // durable will be written later either. conversation state still applies.
  const userMemory = input.settings.memoryEnabled
    ? rankMemories(input.userMemory, input.query, budget.maxMemories)
    : [];
  const projectMemory = input.settings.memoryEnabled
    ? rankMemories(input.projectMemory, input.query, Math.max(2, Math.floor(budget.maxMemories / 2)))
    : [];

  if (!input.settings.memoryEnabled) notes.push("memory is off — this turn uses conversation context only");

  const retrieved = retrievePatterns(input.patterns, {
    conversationId: input.conversation.conversationId,
    projectId: input.conversation.projectId,
    query: input.query,
    task: input.task,
    limit: budget.maxPatterns,
  });

  const coverage = checkCoverage(retrieved, input.task);
  if (coverage.state === "unknown") notes.push("no applicable pattern — this turn enters discovery");

  return {
    conversation: input.conversation,
    task: input.task,
    userMemory,
    projectMemory,
    patterns: retrieved,
    coverage,
    budget,
    notes,
  };
}

/**
 * compose the text handed to the model. it carries procedures and rules, never
 * credentials, never the whole registry, never hidden chain-of-thought demands.
 */
export function composeModelContext(ctx: RuntimeContext): string {
  const parts: string[] = [];
  const strategy = buildStrategy(ctx.task, ctx.patterns.map((p) => p.pattern));

  parts.push(`task modality: ${ctx.task.modality}`);
  if (ctx.conversation.goal) parts.push(`conversation goal: ${ctx.conversation.goal}`);
  if (ctx.task.constraints.length) parts.push(`stated constraints:\n- ${ctx.task.constraints.join("\n- ")}`);
  if (ctx.task.unknowns.length) parts.push(`open unknowns:\n- ${ctx.task.unknowns.join("\n- ")}`);

  if (ctx.conversation.decisions.length) {
    parts.push(`decisions already made in this conversation:\n- ${ctx.conversation.decisions.slice(-6).join("\n- ")}`);
  }
  if (ctx.conversation.constraints.length) {
    parts.push(`constraints carried in this conversation:\n- ${ctx.conversation.constraints.slice(-6).join("\n- ")}`);
  }
  if (ctx.conversation.unresolvedQuestions.length) {
    parts.push(`still unresolved:\n- ${ctx.conversation.unresolvedQuestions.slice(-4).join("\n- ")}`);
  }

  if (ctx.userMemory.length) {
    parts.push(`standing rules from the operator:\n- ${ctx.userMemory.map((m) => `${m.kind}: ${m.content}`).join("\n- ")}`);
  }
  if (ctx.projectMemory.length) {
    parts.push(`project knowledge:\n- ${ctx.projectMemory.map((m) => m.content).join("\n- ")}`);
  }

  if (ctx.patterns.length) {
    const lines = ctx.patterns.map((r) => {
      const p = r.pattern;
      const hypothesis = p.status !== "active" ? ` [${p.status} — treat as a hypothesis]` : "";
      return `${p.name}${hypothesis}\n  ${p.procedure.join("\n  ")}`;
    });
    parts.push(`procedures to follow this turn:\n${lines.join("\n")}`);
  } else {
    parts.push("no established procedure applies — reason from primitives and say plainly where you are uncertain");
  }

  if (strategy.contrastConsidered) parts.push(`known failure to watch: ${strategy.contrastConsidered}`);
  if (ctx.coverage.state !== "covered") {
    parts.push(`coverage is ${ctx.coverage.state}${ctx.coverage.missing.length ? `: ${ctx.coverage.missing.join("; ")}` : ""}`);
  }

  return parts.join("\n\n");
}
