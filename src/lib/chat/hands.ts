/**
 * Hands — the workspaces asherin opens when an organ runs.
 *
 * Chat remains the mouth. Active research surfaces dock beside the thread
 * without creating a second hidden navigation path.
 */

export interface HandOpen {
  surface: "ide" | "ghost" | "whiteboard";
  organ: string;
  focus?: string;
}

const VIEW_OF: Record<HandOpen["surface"], string> = {
  ide: "ide",
  ghost: "ghost-engine",
  whiteboard: "whiteboard",
};

/** Fired so the dashboard can split to a workspace without a full navigation. */
export const HAND_OPEN_EVENT = "asherin:hand-open";

export function isHandOpen(value: unknown): value is HandOpen {
  const v = value as HandOpen | null;
  return Boolean(v && typeof v.surface === "string" && v.surface in VIEW_OF);
}

/**
 * Opens at most one hand per turn. Other hands still navigate — one flip, not three.
 */
export function openHands(hands: unknown[], go: (view: string) => void): HandOpen | null {
  const valid = (hands || []).filter(isHandOpen);
  const hand = valid[0];
  if (!hand) return null;

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(HAND_OPEN_EVENT, { detail: hand }));
  }
  go(VIEW_OF[hand.surface]);
  return hand;
}
