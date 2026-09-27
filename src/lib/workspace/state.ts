// workspace state — what the conversation is currently looking at.
//
// Follow-up turns ("only show the cameras", "narrow to 2–3pm") mutate this
// rather than starting over, and the resolved state is fed back into the next
// turn's context so the model knows what is on screen.

import type { LaneKind, SurfaceKind, WorkspacePlan } from "./types";

export interface WorkspaceSelection {
  cardId?: string;
  entityId?: string;
  cameraId?: string;
  trackId?: string;
  evidenceId?: string;
}

export interface WorkspaceState {
  investigationId: string | null;
  lane: LaneKind;
  plan: WorkspacePlan | null;
  /** surfaces the operator explicitly narrowed to. empty = show everything ready. */
  visibleSurfaces: SurfaceKind[];
  timeWindow: { fromMs: number; toMs: number } | null;
  selection: WorkspaceSelection;
  viewport: { lat: number; lng: number; zoom: number } | null;
  hypotheses: string[];
  history: string[];
}

export const initialWorkspaceState: WorkspaceState = {
  investigationId: null,
  lane: "none",
  plan: null,
  visibleSurfaces: [],
  timeWindow: null,
  selection: {},
  viewport: null,
  hypotheses: [],
  history: [],
};

export type WorkspaceAction =
  | { type: "plan"; plan: WorkspacePlan; question: string }
  | { type: "select"; selection: WorkspaceSelection }
  | { type: "clearSelection" }
  | { type: "narrow"; surfaces: SurfaceKind[] }
  | { type: "showAll" }
  | { type: "timeWindow"; window: { fromMs: number; toMs: number } | null }
  | { type: "viewport"; viewport: { lat: number; lng: number; zoom: number } }
  | { type: "investigation"; id: string | null }
  | { type: "hypothesis"; text: string }
  | { type: "reset" };

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "plan":
      return {
        ...state,
        plan: action.plan,
        lane: action.plan.lane,
        // a new turn keeps the operator's narrowing and time window; it is a
        // continuation of the same workspace, not a fresh screen.
        history: [...state.history, action.question].slice(-20),
      };
    case "select":
      return { ...state, selection: { ...state.selection, ...action.selection } };
    case "clearSelection":
      return { ...state, selection: {} };
    case "narrow":
      return { ...state, visibleSurfaces: action.surfaces };
    case "showAll":
      return { ...state, visibleSurfaces: [] };
    case "timeWindow":
      return { ...state, timeWindow: action.window };
    case "viewport":
      return { ...state, viewport: action.viewport };
    case "investigation":
      return { ...state, investigationId: action.id };
    case "hypothesis":
      return { ...state, hypotheses: [...state.hypotheses, action.text].slice(-10) };
    case "reset":
      return initialWorkspaceState;
    default:
      return state;
  }
}

/** which surfaces the UI should actually render, given ready state + narrowing. */
export function visibleSurfacesOf(state: WorkspaceState): SurfaceKind[] {
  if (!state.plan) return [];
  const all = state.plan.surfaces.map((s) => s.kind);
  if (!state.visibleSurfaces.length) return all;
  return all.filter((k) => state.visibleSurfaces.includes(k));
}

const NARROW_PATTERNS: Array<[RegExp, SurfaceKind]> = [
  [/\bonly (show |view )?(the )?cameras?\b/i, "cameras"],
  [/\bonly (show |view )?(the )?map\b/i, "map"],
  [/\bonly (show |view )?(the )?timeline\b/i, "timeline"],
  [/\bonly (show |view )?(the )?evidence\b/i, "evidence"],
  [/\bonly (show |view )?(the )?cards?\b/i, "cards"],
  [/\bonly (show |view )?(the )?(graph|relationships?)\b/i, "graph"],
];

/** a follow-up that narrows the workspace instead of asking a new question. */
export function detectNarrowing(message: string): SurfaceKind[] | null {
  const hits = NARROW_PATTERNS.filter(([re]) => re.test(message)).map(([, k]) => k);
  if (!hits.length) return /\bshow (me )?everything\b/i.test(message) ? [] : null;
  return hits;
}

/** compact description of the workspace, handed to the model as context. */
export function describeWorkspace(state: WorkspaceState): string {
  if (!state.plan) return "";
  const parts: string[] = [`workspace lane: ${state.lane}`];
  const ready = state.plan.surfaces.filter((s) => s.state === "ready").map((s) => s.kind);
  const missing = state.plan.surfaces.filter((s) => s.state !== "ready");
  if (ready.length) parts.push(`surfaces on screen: ${ready.join(", ")}`);
  if (missing.length) {
    parts.push(`surfaces unavailable:\n- ${missing.map((s) => `${s.kind}: ${s.reason}`).join("\n- ")}`);
  }
  if (state.timeWindow) {
    parts.push(
      `time window: ${new Date(state.timeWindow.fromMs).toISOString()} to ${new Date(state.timeWindow.toMs).toISOString()}`,
    );
  }
  const sel = Object.entries(state.selection).filter(([, v]) => v);
  if (sel.length) parts.push(`selected: ${sel.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  return parts.join("\n");
}
