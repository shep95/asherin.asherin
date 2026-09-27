/**
 * Board inbox — the one-way channel other organs use to put objects on the
 * whiteboard (chat "drop this on the board", zophiel "send graph to board").
 *
 * Deliberately in-memory only. Boards are persisted encrypted per user; a
 * plaintext localStorage staging queue would be a soft copy of the same
 * content sitting outside that envelope, so the handoff lives for the length
 * of one SPA navigation and nothing longer. A hard reload drops the queue,
 * which is the honest outcome — nothing is silently resurrected later.
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
