// orchestrator — one turn, end to end.
//
// order matters and is fixed: frame the task, retrieve within budget, compose,
// call the model, validate the output, then run the learning gate. learning is
// always last and always gated: the model proposes, this file decides, and the
// database records why.
//
// the turn is split into two phases so the live streaming chat path can use it:
//   prepareTurn  — everything before the model call (load, frame, retrieve,
//                  discover, compose). returns a PreparedTurn handle.
//   completeTurn — everything after the model answered (validate, feedback,
//                  gates, outcomes, conversation state, audit).
// runTurn composes both for non-streaming callers and tests.

import {
  loadSettings,
  loadConversationState,
  saveConversationState,
  loadUserMemory,
  loadProjectMemory,
  loadPatterns,
  insertMemoryCandidate,
  upsertPattern,
  snapshotPatternVersion,
  recordOutcome,
  recordLearningDecisions,
  bumpMemoryEvidence,
} from "./store";
import { frameTask } from "./taskFrame";
import { resolveContext, composeModelContext } from "./contextResolver";
import { resolveBinding, invokeModel } from "./modelGateway";
import { validate } from "./validator";
import { needsDiscovery, discover, readFeedback, adaptFromFeedback } from "./creator";
import { gateMemory, gatePattern } from "./learningGate";
import { recordSuccess, recordFailure } from "./patternLifecycle";
import { routeIntent, type IntentRoute } from "./intentRouter";
import { selectLoop, renderLoop, type TransformPlan } from "./transformLoop";
import { analyzeFeedback, repairProcedure, type FeedbackAnalysis } from "./feedbackAnalyzer";
import { buildGovernance, assessQuarantine, applyQuarantine, recordAudit } from "./governance";
import type {
  ConversationState,
  IntelligenceSettings,
  LearningDecision,
  MemoryRecord,
  PatternObject,
  RuntimeContext,
  TaskFrame,
  ValidationReport,
} from "./types";

export interface TurnInput {
  conversationId: string;
  projectId?: string | null;
  message: string;
  hasImageInput?: boolean;
  /** when true, nothing is sent to a model — used by tests and dry runs. */
  dryRun?: boolean;
}

export interface TurnResult {
  ok: boolean;
  text: string;
  unavailableReason?: string;
  context: RuntimeContext;
  composed: string;
  validation?: ValidationReport;
  decisions: LearningDecision[];
  discoveryRan: boolean;
  patternsUsed: string[];
  candidateCreated: string | null;
  route: IntentRoute;
  loop: TransformPlan;
  /** present only when this turn carried a correction. */
  feedback?: FeedbackAnalysis;
}

/** everything completeTurn needs to finish the turn, captured before the model ran. */
export interface PreparedTurn {
  input: TurnInput;
  settings: IntelligenceSettings;
  conversation: ConversationState;
  task: TaskFrame;
  context: RuntimeContext;
  userMemory: MemoryRecord[];
  projectMemory: MemoryRecord[];
  decisions: LearningDecision[];
  discoveryRan: boolean;
  candidate: PatternObject | null;
  /** which lane this turn was routed into, and why. */
  route: IntentRoute;
  /** the transformation loop the answer must be produced through. */
  loop: TransformPlan;
  /** the bounded brief that may be handed to a model — never contains credentials. */
  composed: string;
}

export async function prepareTurn(input: TurnInput): Promise<PreparedTurn> {
  const decisions: LearningDecision[] = [];

  const [settings, conversation, userMemory, patterns] = await Promise.all([
    loadSettings(),
    loadConversationState(input.conversationId, input.projectId),
    loadUserMemory(),
    loadPatterns(),
  ]);
  const projectMemory = input.projectId ? await loadProjectMemory(input.projectId) : [];

  const task = frameTask(input.message, {
    priorGoal: conversation.goal,
  });

  const context = resolveContext({
    conversation,
    task,
    query: input.message,
    settings,
    userMemory,
    projectMemory,
    patterns,
  });

  // ---- intent routing and the transformation loop ----
  // the router picks the lane; the loop decides which direction the reasoning
  // runs and which flaw classes this turn is responsible for catching.
  const route = routeIntent(task, { message: input.message, hasImageInput: input.hasImageInput });
  const loop = selectLoop(route.loop, {
    hasArtefact: /```|\.tsx?\b|\.sql\b|error|stack/i.test(input.message),
    // this runtime cannot execute the operator's code, so test stages are
    // marked blocked rather than narrated as if they had run.
    canRunTests: false,
  });
  decisions.push({
    stage: "classify",
    decision: "recorded",
    subjectType: "outcome",
    reason: `routed to ${route.lane}/${route.specialisation} on the ${route.loop} loop: ${route.reasons.join("; ")}`,
    detail: { lane: route.lane, specialisation: route.specialisation, loop: route.loop },
  });

  // ---- discovery: only when retrieval genuinely failed to cover the task ----
  let discoveryRan = false;
  let candidate: PatternObject | null = null;
  const trigger = needsDiscovery(context.coverage);
  if (trigger) {
    const result = discover(task, context.patterns, patterns, trigger);
    discoveryRan = true;
    // a discovered candidate is born with provenance, not anonymously.
    candidate = result.candidate
      ? {
          ...result.candidate,
          governance: buildGovernance(result.candidate, {
            creatorEvent: `discovery (${trigger}) during a ${route.lane} turn`,
            conversationId: input.conversationId,
            projectId: input.projectId ?? null,
          }),
        }
      : null;
    decisions.push({
      stage: "observe",
      decision: "recorded",
      subjectType: "pattern",
      reason: `discovery ran (${trigger}): ${result.notes.join("; ") || "no transferable mechanism found"}`,
    });
  }

  return {
    input,
    settings,
    conversation,
    task,
    context,
    userMemory,
    projectMemory,
    decisions,
    discoveryRan,
    candidate,
    route,
    loop,
    composed: `${composeModelContext(context)}\n\n${renderLoop(loop)}`,
  };
}

export interface TurnOutcome {
  ok: boolean;
  text?: string;
  unavailableReason?: string;
}

export async function completeTurn(prepared: PreparedTurn, outcome: TurnOutcome): Promise<TurnResult> {
  const { input, settings, conversation, task, context, userMemory, projectMemory } = prepared;
  const decisions = prepared.decisions;
  const text = outcome.text ?? "";
  const ok = outcome.ok;
  const unavailableReason = outcome.unavailableReason;

  // ---- validation ----
  const validation =
    ok && !input.dryRun
      ? validate({ task, output: text, activeRules: context.userMemory.map((m) => m.content) })
      : undefined;

  // ---- feedback signal from this message ----
  const signal = readFeedback(input.message);
  let candidateCreated: string | null = null;
  let analysis: FeedbackAnalysis | undefined;

  if (signal.polarity === "negative") {
    const repeatCount = conversation.feedback.filter((f) => f.polarity === "negative").length + 1;

    // attribution first: which layer produced the wrong result, and how deep
    // does the change belong. obeying the sentence is the shallowest option.
    analysis = analyzeFeedback(signal, {
      hasProject: !!input.projectId,
      repeatCount,
      modality: task.modality,
    });
    decisions.push({
      stage: "classify",
      decision: "recorded",
      subjectType: "outcome",
      reason: `cause ${analysis.causeType} → ${analysis.adaptationLevel} adaptation at ${analysis.scope} scope: ${analysis.reasons.join("; ")}`,
      detail: {
        cause: analysis.causeType,
        adaptationLevel: analysis.adaptationLevel,
        behaviour: analysis.affectedBehaviour,
        confidence: analysis.confidence,
      },
    });

    const adaptation = adaptFromFeedback(signal, {
      hasProject: !!input.projectId,
      repeatCount,
      conversationId: input.conversationId,
    });

    // a "response" level adaptation changes this answer only — nothing durable
    // is written from a single, unattributed complaint.
    const durable = analysis.adaptationLevel !== "response" && !analysis.needsClarification;
    if (adaptation.candidate && durable) {
      const repaired: PatternObject = {
        ...adaptation.candidate,
        scope: analysis.scope,
        name: `${analysis.causeType}: ${analysis.affectedBehaviour}`.slice(0, 110),
        description:
          analysis.adaptationLevel === "architecture"
            ? "workflow-level repair — changes how this class of task is approached, not just the wording"
            : "reusable repair derived from a repeated correction",
        abstractionLevel: analysis.adaptationLevel === "architecture" ? "meta" : "operational",
        mechanism: `when a ${task.modality} task touches ${analysis.affectedBehaviour}, run this before answering`,
        procedure: repairProcedure(analysis),
        confidence: analysis.confidence,
      };
      repaired.governance = buildGovernance(repaired, {
        creatorEvent: `${analysis.adaptationLevel} adaptation after ${repeatCount} correction(s) attributed to ${analysis.causeType}`,
        conversationId: input.conversationId,
        projectId: input.projectId ?? null,
      });

      const gated = gatePattern(repaired, { settings, validation });
      decisions.push(...gated.decisions);
      if (gated.value && settings.learningEnabled) {
        // governance runs last: a pattern that contradicts a standing rule or
        // has no provenance is kept but never activated.
        const verdict = assessQuarantine(gated.value, { standingRules: userMemory });
        const finalPattern = verdict.quarantine
          ? applyQuarantine(gated.value, verdict)
          : { ...gated.value, governance: recordAudit(gated.value.governance, "promoted", "passed the learning gate") };
        if (verdict.quarantine) {
          decisions.push({
            stage: "validate",
            decision: "held",
            subjectType: "pattern",
            reason: `quarantined: ${verdict.reasons.join("; ")}`,
          });
        }
        const saved = await upsertPattern(finalPattern);
        if (saved?.id) {
          candidateCreated = saved.id;
          await snapshotPatternVersion(saved, `created from a ${analysis.causeType} correction`);
        }
      }
    } else if (adaptation.candidate) {
      decisions.push({
        stage: "policy",
        decision: "held",
        subjectType: "pattern",
        reason: analysis.needsClarification
          ? "correction recorded but its cause could not be identified — nothing durable written"
          : "first observation — applied to this answer only, not stored as a pattern",
      });
    }

    // the correction is also a memory proposal, judged on its own terms.
    const memGate = gateMemory(
      { content: signal.text, kind: "never", conversationId: input.conversationId, projectId: input.projectId ?? null },
      { settings, hasProject: !!input.projectId, existing: [...userMemory, ...projectMemory] },
    );
    decisions.push(...memGate.decisions);
    if (memGate.value && settings.learningEnabled && settings.memoryEnabled) {
      await insertMemoryCandidate({ ...memGate.value, conversationId: input.conversationId });
    }
    // a repeat of an existing rule strengthens it rather than duplicating it.
    const dup = [...userMemory, ...projectMemory].find(
      (m) => m.content.trim().toLowerCase() === signal.text.trim().toLowerCase(),
    );
    if (dup?.id) {
      await bumpMemoryEvidence(
        dup.projectId ? "ai_project_memory" : "ai_user_memory",
        dup.id,
        dup.evidenceCount + 1,
        Math.min(0.95, dup.confidence + 0.1),
      );
    }
  }

  // ---- outcomes for every pattern actually used ----
  if (!input.dryRun && settings.learningEnabled) {
    for (const r of context.patterns) {
      if (!r.pattern.id) continue;
      const result = !ok ? "unknown" : validation?.verdict === "needs_revision" ? "failure" : "success";
      await recordOutcome({
        patternId: r.pattern.id,
        conversationId: input.conversationId,
        result,
        signal: "validator",
        detail: validation?.verdict ?? unavailableReason ?? "",
        context: { modality: task.modality, domain: task.domains[0] ?? "general" },
      });
      if (result === "success") {
        await upsertPattern(recordSuccess(r.pattern, task.domains[0] ?? "general"));
      } else if (result === "failure") {
        await upsertPattern(recordFailure(r.pattern, `validation flagged the output for ${task.modality}`));
      }
    }
  }

  // ---- conversation state ----
  const nextState: ConversationState = {
    ...conversation,
    goal: conversation.goal ?? task.goal,
    activeTopic: task.domains[0] ?? conversation.activeTopic,
    constraints: Array.from(new Set([...conversation.constraints, ...task.constraints])).slice(-30),
    unresolvedQuestions: Array.from(new Set([...conversation.unresolvedQuestions, ...task.unknowns])).slice(-20),
    patternsUsed: Array.from(new Set([...conversation.patternsUsed, ...context.patterns.map((r) => r.pattern.slug)])).slice(-40),
    patternsCreated: prepared.candidate
      ? Array.from(new Set([...conversation.patternsCreated, prepared.candidate.slug]))
      : conversation.patternsCreated,
    feedback: [...conversation.feedback, signal].slice(-30),
    confidence: ok ? Math.min(0.95, conversation.confidence + 0.05) : Math.max(0.1, conversation.confidence - 0.1),
  };
  await saveConversationState(nextState);
  await recordLearningDecisions(input.conversationId, decisions);

  return {
    ok,
    text,
    unavailableReason,
    context,
    composed: prepared.composed,
    validation,
    decisions,
    discoveryRan: prepared.discoveryRan,
    patternsUsed: context.patterns.map((r) => r.pattern.slug),
    candidateCreated,
    route: prepared.route,
    loop: prepared.loop,
    feedback: analysis,
  };
}

/** non-streaming composition: prepare, invoke the model through the gateway, complete. */
export async function runTurn(input: TurnInput): Promise<TurnResult> {
  const prepared = await prepareTurn(input);

  if (input.dryRun) {
    return completeTurn(prepared, { ok: true, text: "" });
  }

  const binding = await resolveBinding();
  const response = await invokeModel(binding, {
    systemContext: prepared.composed,
    message: input.message,
    conversationId: input.conversationId,
    modality: prepared.task.modality,
    hasImageInput: input.hasImageInput,
  });

  if (response.ok === true) {
    return completeTurn(prepared, { ok: true, text: response.text });
  }
  return completeTurn(prepared, { ok: false, unavailableReason: response.reason });
}
