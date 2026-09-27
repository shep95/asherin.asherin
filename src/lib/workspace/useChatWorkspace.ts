// useChatWorkspace — turns the last completed chat turn into a workspace.
//
// It runs once per user turn, after streaming finishes, and never re-runs for
// a turn it has already resolved. A turn that needs no subsystem produces no
// plan at all, so an ordinary answer stays an ordinary answer.

import { useEffect, useRef, useState } from "react";
import { frameTask } from "@/lib/intelligence/taskFrame";
import { routeIntent } from "@/lib/intelligence/intentRouter";
import { planWorkspace, chooseLane } from "./planner";
import { runLanes } from "./orchestrator";
import { buildRunners } from "./runners";
import { probeCapabilities } from "./adapters";
import { detectNarrowing } from "./state";
import type { SurfaceKind, WorkspacePlan } from "./types";

export interface ChatWorkspaceResult {
  /** plan keyed by the assistant message it belongs under. */
  plans: Record<string, WorkspacePlan>;
  visible: SurfaceKind[];
}

interface TurnLike {
  id: string;
  role: string;
  content: string;
}

export function useChatWorkspace(opts: {
  messages: TurnLike[];
  isStreaming: boolean;
  conversationId: string | null;
  hasResearchProvider: boolean;
  enabled?: boolean;
}): ChatWorkspaceResult {
  const { messages, isStreaming, conversationId, hasResearchProvider, enabled = true } = opts;
  const [plans, setPlans] = useState<Record<string, WorkspacePlan>>({});
  const [visible, setVisible] = useState<SurfaceKind[]>([]);
  const attempted = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || isStreaming) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.content);
    if (!lastAssistant || attempted.current.has(lastAssistant.id)) return;

    const idx = messages.findIndex((m) => m.id === lastAssistant.id);
    const question = [...messages.slice(0, idx)].reverse().find((m) => m.role === "user")?.content?.trim();
    if (!question) return;

    attempted.current.add(lastAssistant.id);

    // a follow-up like "only show the cameras" narrows the current workspace
    // instead of starting a new one.
    const narrowed = detectNarrowing(question);
    if (narrowed) {
      setVisible(narrowed);
      return;
    }

    const task = frameTask(question);
    const route = routeIntent(task, { message: question });
    const capabilities = probeCapabilities({ hasResearchProvider });
    const input = { message: question, route, task, capabilities };

    if (chooseLane(input).lane === "none") return;

    const plan = planWorkspace(input);
    setPlans((p) => ({ ...p, [lastAssistant.id]: plan }));

    // No abort on cleanup: this effect re-runs on every render, and the
    // attempted set already guarantees one run per turn. Aborting here would
    // kill the lanes it just started.
    void runLanes(plan, buildRunners(plan, { message: question, conversationId }))
      .then((resolved) => setPlans((p) => ({ ...p, [lastAssistant.id]: resolved })))
      .catch(() => {
        /* runLanes folds failures into degraded surfaces itself */
      });
  }, [messages, isStreaming, conversationId, hasResearchProvider, enabled]);

  return { plans, visible };
}
