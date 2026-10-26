/**
 * Board inbox — the one-way channel other rooms use to put objects on the
 * whiteboard (chat "send to board", knowledge vault "drop cited notes").
 *
 * THE CONTRACT, for every caller
 * ------------------------------
 * 1. `queueBoardDrop(drop)` puts the drop in a module-level, in-memory queue
 *    (at most QUEUE_MAX entries; older ones fall off) and fires
 *    `BOARD_DROP_EVENT` on `window`.
 * 2. the whiteboard drains the queue with `consumeBoardDrops()` when it is
 *    mounted and its boards have finished loading, and again on every
 *    `BOARD_DROP_EVENT`. a drop queued while the board is not mounted waits in
 *    memory until it is.
 * 3. the queue lives exactly as long as this javascript realm. a full page
 *    load (`window.location.assign`, `location.href =`, a reload, opening the
 *    url in a new tab) throws it away. that is deliberate: boards are stored
 *    encrypted, and a plaintext localStorage staging copy would sit outside
 *    that envelope.
 * 4. therefore the only correct way to show the board after queueing is an
 *    in-app view change, which is what `openBoard()` below does: it dispatches
 *    the dashboard's `aureon:navigate` event with the whiteboard view id.
 *    `queueBoardDrop(...)` followed by `openBoard()` is the whole hand-off.
 *    `window.location.assign("/dashboard?view=whiteboard")` after a queue is a
 *    bug: the board mounts in a fresh realm with an empty queue and the drop
 *    is silently lost.
 * 5. what lands: a "note" becomes one sticky; a "brief" becomes a frame of
 *    stickies (≤8 bullets) or a frame with one note; a "graph" becomes a frame
 *    of labelled boxes (≤28 nodes) joined by bound arrows (≤80 edges); a
 *    "map-pin" becomes a document card showing the coordinates it was given.
 *    a drop that carries nothing renderable is skipped, never an empty card.
 *    see dropToElements.ts.
 *
 * `pendingBoardDropCount()` lets a caller say "1 item waiting for the board".
 */

export type BoardDropKind = "note" | "brief" | "graph" | "map-pin";

export interface BoardGraphNode {
  id: string;
  label: string;
  kind?: string;
}

export interface BoardGraphEdge {
  source: string;
  target: string;
  label?: string;
}

export interface BoardDrop {
  id: string;
  kind: BoardDropKind;
  /** Where it came from — rendered as provenance on the object. */
  source: string;
  title?: string;
  text?: string;
  bullets?: string[];
  nodes?: BoardGraphNode[];
  edges?: BoardGraphEdge[];
  lat?: number;
  lon?: number;
  createdAt: number;
}

export const BOARD_DROP_EVENT = "asherin:whiteboard-drop";

const QUEUE_MAX = 12;
let queue: BoardDrop[] = [];

export function queueBoardDrop(drop: Omit<BoardDrop, "id" | "createdAt">): BoardDrop {
  const entry: BoardDrop = {
    ...drop,
    id: `drop-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: Date.now(),
  };
  queue = [...queue, entry].slice(-QUEUE_MAX);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(BOARD_DROP_EVENT, { detail: entry }));
  }
  return entry;
}

/** Drain the queue. Callers get each drop exactly once. */
export function consumeBoardDrops(): BoardDrop[] {
  const drained = queue;
  queue = [];
  return drained;
}

/** the dashboard view id the whiteboard answers to (src/components/dashboard/types.ts). */
export const WHITEBOARD_VIEW_ID = "whiteboard";

/**
 * Switch the dashboard to the whiteboard without a page load, so a drop queued
 * a moment ago is still in memory when the board mounts. Returns false when
 * there is no window to dispatch on (tests, ssr).
 */
export function openBoard(): boolean {
  if (typeof window === "undefined") return false;
  window.dispatchEvent(new CustomEvent("aureon:navigate", { detail: WHITEBOARD_VIEW_ID }));
  return true;
}

export function pendingBoardDropCount(): number {
  return queue.length;
}

/**
 * Does this operator turn ask for something to be put on the board?
 * Intent must be explicit — an incidental mention of "whiteboard" in prose
 * never hijacks a turn into placing objects.
 */
export function detectBoardDropIntent(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return (
    /\b(drop|put|place|send|add|pin|throw|stick)\b[^.?!]{0,40}\b(on|onto|to|in)\b[^.?!]{0,20}\b(the\s+)?(white ?board|board|canvas)\b/.test(t) ||
    /\b(white ?board|canvas)\b[^.?!]{0,20}\b(this|that|it)\b/.test(t)
  );
}
