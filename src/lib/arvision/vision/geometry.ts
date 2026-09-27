// asherin.arvision — frame geometry helpers shared by the zone editor, the
// event engine and the overlay.
//
// One rule holds everything together: inside this subsystem a coordinate is
// always normalized to the frame, 0..1 on both axes. Pixels enter at the edge
// and leave at the edge, never in the middle.

import type { Point } from "./zones";

export interface NormBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function normalizeBox(
  box: { x: number; y: number; width: number; height: number },
  frameWidth: number,
  frameHeight: number,
): NormBox {
  const w = frameWidth || 1;
  const h = frameHeight || 1;
  return { x: box.x / w, y: box.y / h, width: box.width / w, height: box.height / h };
}

export function denormalizeBox(box: NormBox, frameWidth: number, frameHeight: number) {
  return {
    x: box.x * frameWidth,
    y: box.y * frameHeight,
    width: box.width * frameWidth,
    height: box.height * frameHeight,
  };
}

export function boxCentre(box: NormBox): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * The point a person actually stands on. Zone membership uses this rather than
 * the centroid, because a tall person leaning over a line is not standing over
 * it.
 */
export function footPoint(box: NormBox): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Distance expressed in multiples of a body height — perspective tolerant. */
export function bodyDistance(a: NormBox, b: NormBox): number {
  const scale = Math.max(0.02, (a.height + b.height) / 2);
  return distance(boxCentre(a), boxCentre(b)) / scale;
}

/** Gap between two boxes as body heights, zero when they overlap. */
export function boxGapBodies(a: NormBox, b: NormBox, scaleBox: NormBox): number {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)));
  const scale = Math.max(0.02, scaleBox.height);
  return Math.hypot(dx, dy) / scale;
}

export function boxIou(a: NormBox, b: NormBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union <= 0 ? 0 : inter / union;
}

export function unionBox(boxes: NormBox[]): NormBox | null {
  if (boxes.length === 0) return null;
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.width));
  const y2 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
