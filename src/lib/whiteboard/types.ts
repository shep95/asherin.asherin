/**
 * Whiteboard element model — shared by the canvas, the exporters and the
 * drop bridge (chat / zophiel → board).
 *
 * The board itself is persisted encrypted per user. Nothing in this module
 * touches storage; these are pure shapes so exporters and converters can be
 * reasoned about (and unit tested) without mounting the canvas.
 */

export type GridMode = "freeform" | "dots" | "square";
export type FontFamilyKey = "Sans" | "Serif" | "Mono";
export type FontWeightKey = "300" | "400" | "500" | "700";
export type WallpaperMode = "dark" | "current" | "wallpaper";

export type ElementType =
  | "path"
  | "text"
  | "sticky"
  | "image"
  | "document"
  | "chart"
  | "frame"
  | "arrow"
  | "rect"
  | "circle"
  | "triangle"
  | "diamond"
  | "star"
  | "line";

export interface Point {
  x: number;
  y: number;
  p?: number;
}

export interface WhiteboardLayer {
  id: string;
  name: string;
  visible: boolean;
}

export interface WhiteboardElement {
  id: string;
  layerId: string;
  type: ElementType;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  points?: Point[];
  color?: string;
  fillColor?: string;
  width?: number;
  opacity?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: FontFamilyKey;
  fontWeight?: FontWeightKey;
  src?: string;
  imgWidth?: number;
  imgHeight?: number;
  borderRadius?: number;
  noteColor?: string;
  fileName?: string;
  fileType?: string;
  preview?: string;
  chartType?: "line" | "bar";
  series?: number[];
  /**
   * Legacy field from the old "auto-updating" sparkline. Charts on the board
   * are hand-entered sketch series, never a live feed, so nothing reads this
   * to animate any more — it is kept so old encrypted boards still parse.
   */
  live?: boolean;
  /** Frame caption. */
  title?: string;
  /** Arrow binding — resolved to element edges at draw time. */
  fromId?: string;
  toId?: string;
  /** Provenance for objects placed by chat / zophiel rather than by hand. */
  origin?: string;
}

export interface WhiteboardBoard {
  id: string;
  name: string;
  wallpaperMode: WallpaperMode;
  wallpaperKey: string;
  wallpaperBlur: number;
  gridMode: GridMode;
  snapMode: GridMode;
  smartShapes: boolean;
  layers: WhiteboardLayer[];
  elements: WhiteboardElement[];
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FONT_STACKS: Record<FontFamilyKey, string> = {
  Sans: "ui-sans-serif, system-ui, sans-serif",
  Serif: "ui-serif, Georgia, serif",
  Mono: "ui-monospace, SFMono-Regular, monospace",
};

export const SHAPE_TYPES: ElementType[] = ["rect", "circle", "triangle", "diamond", "star", "line"];

export const isShapeType = (type: ElementType) => SHAPE_TYPES.includes(type);

/** Axis-aligned bounds for any element. Pure — the exporters depend on it. */
export function getElementBounds(element: WhiteboardElement): Bounds {
  if (element.type === "path" && element.points?.length) {
    const xs = element.points.map((point) => point.x);
    const ys = element.points.map((point) => point.y);
    const stroke = (element.width || 2) * 2;
    return {
      x: Math.min(...xs) - stroke,
      y: Math.min(...ys) - stroke,
      w: Math.max(...xs) - Math.min(...xs) + stroke * 2,
      h: Math.max(...ys) - Math.min(...ys) + stroke * 2,
    };
  }

  if (element.type === "text") {
    const lines = (element.text || "").split("\n");
    const fontSize = element.fontSize || 18;
    const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
    return {
      x: element.x || 0,
      y: (element.y || 0) - fontSize,
      w: Math.max(80, longest * fontSize * 0.62),
      h: Math.max(fontSize * 1.4, lines.length * fontSize * 1.3),
    };
  }

  if (element.type === "sticky") {
    return { x: element.x || 0, y: element.y || 0, w: element.w || 220, h: element.h || 160 };
  }

  if (element.type === "image") {
    return { x: element.x || 0, y: element.y || 0, w: element.imgWidth || 260, h: element.imgHeight || 180 };
  }

  if (element.type === "arrow" || element.type === "line") {
    const x1 = element.x || 0;
    const y1 = element.y || 0;
    const x2 = x1 + (element.w || 0);
    const y2 = y1 + (element.h || 0);
    return {
      x: Math.min(x1, x2) - 6,
      y: Math.min(y1, y2) - 6,
      w: Math.abs(x2 - x1) + 12,
      h: Math.abs(y2 - y1) + 12,
    };
  }

  return { x: element.x || 0, y: element.y || 0, w: element.w || 220, h: element.h || 140 };
}

/** Union of every visible element's bounds, padded. Empty board → null. */
export function contentBounds(elements: WhiteboardElement[], padding = 48): Bounds | null {
  if (!elements.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const element of elements) {
    const bounds = getElementBounds(element);
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.w);
    maxY = Math.max(maxY, bounds.y + bounds.h);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return {
    x: minX - padding,
    y: minY - padding,
    w: Math.max(1, maxX - minX + padding * 2),
    h: Math.max(1, maxY - minY + padding * 2),
  };
}

/**
 * Where a straight run from `towards` enters `bounds`. Used so a bound arrow
 * touches the edge of the node it points at instead of burying its head in
 * the middle of the box.
 */
export function edgePoint(bounds: Bounds, towards: Point): Point {
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  const dx = towards.x - cx;
  const dy = towards.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const halfW = bounds.w / 2;
  const halfH = bounds.h / 2;
  const scaleX = dx === 0 ? Infinity : halfW / Math.abs(dx);
  const scaleY = dy === 0 ? Infinity : halfH / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/**
 * Resolve an arrow's on-screen endpoints. A bound end follows its element;
 * an unbound end keeps the coordinates the operator drew.
 */
export function resolveArrow(
  arrow: WhiteboardElement,
  byId: Map<string, WhiteboardElement>,
): { from: Point; to: Point } {
  const rawFrom: Point = { x: arrow.x || 0, y: arrow.y || 0 };
  const rawTo: Point = { x: (arrow.x || 0) + (arrow.w || 0), y: (arrow.y || 0) + (arrow.h || 0) };

  const fromEl = arrow.fromId ? byId.get(arrow.fromId) : undefined;
  const toEl = arrow.toId ? byId.get(arrow.toId) : undefined;
  if (!fromEl && !toEl) return { from: rawFrom, to: rawTo };

  const fromBounds = fromEl ? getElementBounds(fromEl) : null;
  const toBounds = toEl ? getElementBounds(toEl) : null;

  const fromCenter = fromBounds
    ? { x: fromBounds.x + fromBounds.w / 2, y: fromBounds.y + fromBounds.h / 2 }
    : rawFrom;
  const toCenter = toBounds
    ? { x: toBounds.x + toBounds.w / 2, y: toBounds.y + toBounds.h / 2 }
    : rawTo;

  return {
    from: fromBounds ? edgePoint(fromBounds, toCenter) : rawFrom,
    to: toBounds ? edgePoint(toBounds, fromCenter) : rawTo,
  };
}

/** Rect with negative width/height normalised to a top-left origin. */
export function normalizeRect(x: number, y: number, w: number, h: number): Bounds {
  return { x: Math.min(x, x + w), y: Math.min(y, y + h), w: Math.abs(w), h: Math.abs(h) };
}
