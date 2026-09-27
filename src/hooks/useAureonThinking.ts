import { useSyncExternalStore } from "react";

/**
 * useAureonThinking — view-state layer for the Ghost Chain two-phase stream.
 *
 * The transport (`streamChat`) pushes reasoning tokens here; components merely
 * subscribe. No fetch logic, no JSX-side business logic — per the coding rules
 * the display layer never owns the stream.
 */

export type ThinkingPhase = "idle" | "thinking" | "answering" | "done" | "error";

export interface ThinkingStep {
  /** short verb row: Searching / Reading / Editing / Done */
  label: string;
  detail?: string;
  state: "running" | "done" | "error";
  at: number;
}

export interface ThinkingState {
  text: string;
  /** Real tool/kernel events only. Never synthesised from a finished answer. */
  steps: ThinkingStep[];
  phase: ThinkingPhase;
  /** ms spent inside the reasoning pass, filled when it closes */
  durationMs?: number;
  error?: string;
}

const EMPTY: ThinkingState = { text: "", steps: [], phase: "idle" };

const states = new Map<string, ThinkingState>();
const listeners = new Set<() => void>();
const startedAt = new Map<string, number>();

const emit = () => { listeners.forEach((l) => l()); };

const set = (id: string, patch: Partial<ThinkingState>) => {
  const prev = states.get(id) ?? EMPTY;
  states.set(id, { ...prev, ...patch });
  emit();
};

export const thinkingStore = {
  begin(id: string) {
    startedAt.set(id, Date.now());
    states.set(id, { text: "", steps: states.get(id)?.steps ?? [], phase: "thinking" });
    emit();
  },
  append(id: string, chunk: string) {
    if (!chunk) return;
    const prev = states.get(id) ?? EMPTY;
    // Bounded buffer: reasoning is scratch work, never a memory sink.
    const next = (prev.text + chunk).slice(-20000);
    states.set(id, { ...prev, text: next, phase: "thinking" });
    emit();
  },
  /**
   * Record a real tool/kernel event as a row. `label` is the verb the operator
   * sees. Calling it again with the same label+detail closes the running row
   * instead of stacking a duplicate.
   */
  step(id: string, label: string, detail?: string, state: ThinkingStep["state"] = "running") {
    const prev = states.get(id) ?? EMPTY;
    const steps = [...prev.steps];
    const openIdx = steps.findIndex(
      (s) => s.state === "running" && s.label === label && s.detail === detail,
    );
    if (openIdx >= 0) steps[openIdx] = { ...steps[openIdx], state };
    else steps.push({ label, detail, state, at: Date.now() });
    states.set(id, { ...prev, steps: steps.slice(-24) });
    emit();
  },
  /** Reasoning closed; the answer pass is now filling. */
  answering(id: string) {
    const started = startedAt.get(id);
    set(id, { phase: "answering", durationMs: started ? Date.now() - started : undefined });
  },
  finish(id: string) {
    const prev = states.get(id);
    if (!prev) return;
    const started = startedAt.get(id);
    states.set(id, {
      ...prev,
      steps: prev.steps.map((s) => (s.state === "running" ? { ...s, state: "done" as const } : s)),
      phase: "done",
      durationMs: prev.durationMs ?? (started ? Date.now() - started : undefined),
    });
    startedAt.delete(id);
    emit();
  },
  fail(id: string, error: string) {
    set(id, { phase: "error", error });
    startedAt.delete(id);
  },
  clear(id: string) {
    if (!states.delete(id)) return;
    startedAt.delete(id);
    emit();
  },
  snapshot(id: string): ThinkingState {
    return states.get(id) ?? EMPTY;
  },
};

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};

export function useAureonThinking(messageId: string | undefined): ThinkingState {
  return useSyncExternalStore(
    subscribe,
    () => (messageId ? states.get(messageId) ?? EMPTY : EMPTY),
    () => EMPTY,
  );
}
