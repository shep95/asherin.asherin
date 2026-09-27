/**
 * Board exporters — SVG, PNG and JSON.
 *
 * The SVG serialiser is the single source of truth: PNG is that SVG
 * rasterised, so what the operator downloads as a picture and what they
 * download as vector can never drift apart. Nothing here reads the live
 * canvas, so an export is deterministic and independent of the current
 * pan/zoom.
 */

import {
  FONT_STACKS,
  contentBounds,
  getElementBounds,
  normalizeRect,
  resolveArrow,
  type Bounds,
  type WhiteboardBoard,
  type WhiteboardElement,
} from "./types";

const NOTE_FALLBACK = "#fde68a";

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const num = (value: number) => (Number.isFinite(value) ? Number(value.toFixed(2)) : 0);

function textLines(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  fill: string,
  family: string,
  weight: string,
  anchor: "start" | "middle" = "start",
  lineHeight = 1.32,
): string {
  return text
    .split("\n")
    .map(
      (line, index) =>
        `<text x="${num(x)}" y="${num(y + index * fontSize * lineHeight)}" fill="${fill}" font-family="${escapeXml(family)}" font-size="${num(fontSize)}" font-weight="${weight}" text-anchor="${anchor}" xml:space="preserve">${escapeXml(line)}</text>`,
    )
    .join("");
}

function shapeMarkup(element: WhiteboardElement): string {
  const rect = normalizeRect(element.x || 0, element.y || 0, element.w || 0, element.h || 0);
  const stroke = element.color && element.color !== "eraser" ? element.color : "#ffffff";
  const fill = element.fillColor && element.fillColor !== "transparent" && !["marker", "highlighter"].includes(element.fillColor)
    ? element.fillColor
    : "none";
  const strokeWidth = num(element.width || 2);
  const common = `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"`;

  let body = "";
  if (element.type === "rect") {
    body = `<rect x="${num(rect.x)}" y="${num(rect.y)}" width="${num(rect.w)}" height="${num(rect.h)}" rx="${num(Math.min(14, rect.w / 8, rect.h / 8))}" ${common} />`;
  } else if (element.type === "circle") {
    body = `<ellipse cx="${num(rect.x + rect.w / 2)}" cy="${num(rect.y + rect.h / 2)}" rx="${num(rect.w / 2)}" ry="${num(rect.h / 2)}" ${common} />`;
  } else if (element.type === "triangle") {
    body = `<polygon points="${num(rect.x + rect.w / 2)},${num(rect.y)} ${num(rect.x + rect.w)},${num(rect.y + rect.h)} ${num(rect.x)},${num(rect.y + rect.h)}" ${common} />`;
  } else if (element.type === "diamond") {
    body = `<polygon points="${num(rect.x + rect.w / 2)},${num(rect.y)} ${num(rect.x + rect.w)},${num(rect.y + rect.h / 2)} ${num(rect.x + rect.w / 2)},${num(rect.y + rect.h)} ${num(rect.x)},${num(rect.y + rect.h / 2)}" ${common} />`;
  } else if (element.type === "star") {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const outer = Math.min(rect.w, rect.h) / 2;
    const inner = outer * 0.45;
    const points: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      const radius = index % 2 === 0 ? outer : inner;
      const angle = (Math.PI / 5) * index - Math.PI / 2;
      points.push(`${num(cx + radius * Math.cos(angle))},${num(cy + radius * Math.sin(angle))}`);
    }
    body = `<polygon points="${points.join(" ")}" ${common} />`;
  } else if (element.type === "line") {
    body = `<line x1="${num(element.x || 0)}" y1="${num(element.y || 0)}" x2="${num((element.x || 0) + (element.w || 0))}" y2="${num((element.y || 0) + (element.h || 0))}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" />`;
  }

  // Shapes carrying a label (graph nodes dropped from chat / zophiel) render
  // the caption centred inside the box.
  if (element.text && element.type !== "line") {
    const fontSize = element.fontSize || 13;
    const lines = element.text.split("\n");
    const startY = rect.y + rect.h / 2 - ((lines.length - 1) * fontSize * 1.25) / 2 + fontSize * 0.34;
    body += textLines(
      element.text,
      rect.x + rect.w / 2,
      startY,
      fontSize,
      stroke,
      FONT_STACKS[element.fontFamily || "Sans"],
      element.fontWeight || "400",
      "middle",
      1.25,
    );
  }

  return body;
}

function elementMarkup(element: WhiteboardElement, byId: Map<string, WhiteboardElement>): string {
  switch (element.type) {
    case "path": {
      if (!element.points?.length) return "";
      // The eraser is a compositing operation on the live canvas; an exported
      // vector has no destination to punch out, so it is simply omitted
      // rather than exported as a black smear.
      if (element.color === "eraser") return "";
      const d = element.points
        .map((point, index) => `${index === 0 ? "M" : "L"}${num(point.x)} ${num(point.y)}`)
        .join(" ");
      const opacity = element.opacity ?? (element.fillColor === "highlighter" ? 0.2 : element.fillColor === "marker" ? 0.8 : 1);
      const widthScale = element.fillColor === "highlighter" ? 2.2 : element.fillColor === "marker" ? 1.2 : 1;
      return `<path d="${d}" fill="none" stroke="${element.color || "#ffffff"}" stroke-width="${num((element.width || 2) * widthScale)}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" />`;
    }

    case "text": {
      const fontSize = element.fontSize || 18;
      return textLines(
        element.text || "",
        element.x || 0,
        element.y || 0,
        fontSize,
        element.color || "#ffffff",
        FONT_STACKS[element.fontFamily || "Sans"],
        element.fontWeight || "400",
      );
    }

    case "sticky": {
      const x = element.x || 0;
      const y = element.y || 0;
      const w = element.w || 240;
      const h = element.h || 170;
      const fontSize = element.fontSize || 16;
      return (
        `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" rx="18" fill="${element.noteColor || NOTE_FALLBACK}" stroke="rgba(17,24,39,0.15)" />` +
        textLines(element.text || "", x + 18, y + 32, fontSize, "rgba(17,24,39,0.9)", FONT_STACKS[element.fontFamily || "Sans"], element.fontWeight || "400", "start", 1.28)
      );
    }

    case "image": {
      if (!element.src) return "";
      const w = element.imgWidth || 260;
      const h = element.imgHeight || 180;
      const radius = ((element.borderRadius || 0) / 100) * Math.min(w, h) * 0.5;
      const clipId = `clip-${element.id}`;
      return (
        `<defs><clipPath id="${clipId}"><rect x="${num(element.x || 0)}" y="${num(element.y || 0)}" width="${num(w)}" height="${num(h)}" rx="${num(radius)}" /></clipPath></defs>` +
        `<image clip-path="url(#${clipId})" x="${num(element.x || 0)}" y="${num(element.y || 0)}" width="${num(w)}" height="${num(h)}" href="${escapeXml(element.src)}" preserveAspectRatio="xMidYMid slice" />`
      );
    }

    case "document": {
      const x = element.x || 0;
      const y = element.y || 0;
      const w = element.w || 280;
      const h = element.h || 140;
      return (
        `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" rx="20" fill="rgba(15,23,42,0.88)" stroke="rgba(255,255,255,0.08)" />` +
        textLines(element.fileName || "Imported file", x + 18, y + 30, 14, "rgba(255,255,255,0.92)", FONT_STACKS.Sans, "600") +
        textLines(element.fileType || "Document", x + 18, y + 52, 12, "rgba(255,255,255,0.45)", FONT_STACKS.Mono, "400") +
        textLines((element.preview || "").slice(0, 120), x + 18, y + 84, 12, "rgba(255,255,255,0.7)", FONT_STACKS.Sans, "400")
      );
    }

    case "chart": {
      const x = element.x || 0;
      const y = element.y || 0;
      const w = element.w || 320;
      const h = element.h || 180;
      const series = element.series || [];
      const min = Math.min(...series, 0);
      const max = Math.max(...series, 100);
      const chartX = x + 18;
      const chartY = y + 70;
      const chartW = w - 36;
      const chartH = h - 92;
      const line = series.length > 1
        ? `<polyline fill="none" stroke="${element.color || "#60a5fa"}" stroke-width="2" points="${series
            .map((value, index) => `${num(chartX + (index / Math.max(series.length - 1, 1)) * chartW)},${num(chartY + chartH - ((value - min) / Math.max(max - min, 1)) * chartH)}`)
            .join(" ")}" />`
        : "";
      return (
        `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" rx="22" fill="rgba(2,6,23,0.86)" stroke="rgba(255,255,255,0.08)" />` +
        textLines(element.text || "Sketch series", x + 18, y + 30, 14, "rgba(255,255,255,0.9)", FONT_STACKS.Sans, "600") +
        textLines("hand-entered — not a live feed", x + 18, y + 50, 11, "rgba(255,255,255,0.45)", FONT_STACKS.Mono, "400") +
        `<rect x="${num(chartX)}" y="${num(chartY)}" width="${num(chartW)}" height="${num(chartH)}" fill="none" stroke="rgba(255,255,255,0.08)" />` +
        line
      );
    }

    case "frame": {
      const rect = normalizeRect(element.x || 0, element.y || 0, element.w || 0, element.h || 0);
      return (
        `<rect x="${num(rect.x)}" y="${num(rect.y)}" width="${num(rect.w)}" height="${num(rect.h)}" rx="18" fill="rgba(255,255,255,0.02)" stroke="${element.color || "rgba(255,255,255,0.28)"}" stroke-width="${num(element.width || 1.5)}" />` +
        textLines(element.title || "Frame", rect.x + 4, rect.y - 10, 12, "rgba(255,255,255,0.62)", FONT_STACKS.Mono, "400")
      );
    }

    case "arrow": {
      const { from, to } = resolveArrow(element, byId);
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const head = 12;
      const stroke = element.color || "#ffffff";
      const p1 = `${num(to.x - head * Math.cos(angle - Math.PI / 7))},${num(to.y - head * Math.sin(angle - Math.PI / 7))}`;
      const p2 = `${num(to.x - head * Math.cos(angle + Math.PI / 7))},${num(to.y - head * Math.sin(angle + Math.PI / 7))}`;
      const label = element.text
        ? textLines(element.text, (from.x + to.x) / 2, (from.y + to.y) / 2 - 6, 11, "rgba(255,255,255,0.6)", FONT_STACKS.Mono, "400", "middle")
        : "";
      return (
        `<line x1="${num(from.x)}" y1="${num(from.y)}" x2="${num(to.x)}" y2="${num(to.y)}" stroke="${stroke}" stroke-width="${num(element.width || 2)}" stroke-linecap="round" />` +
        `<polygon points="${num(to.x)},${num(to.y)} ${p1} ${p2}" fill="${stroke}" />` +
        label
      );
    }

    default:
      return shapeMarkup(element);
  }
}

export interface SvgExport {
  svg: string;
  bounds: Bounds;
}

/** Serialise the visible layers of a board to standalone SVG. */
export function boardToSvg(board: WhiteboardBoard): SvgExport | null {
  const visibleLayers = new Set(board.layers.filter((layer) => layer.visible).map((layer) => layer.id));
  const elements = board.elements.filter((element) => visibleLayers.has(element.layerId));
  const bounds = contentBounds(elements);
  if (!bounds) return null;

  const byId = new Map(elements.map((element) => [element.id, element]));
  // Frames sit behind everything so their fill never covers their contents.
  const ordered = [
    ...elements.filter((element) => element.type === "frame"),
    ...elements.filter((element) => element.type !== "frame"),
  ];

  const body = ordered.map((element) => elementMarkup(element, byId)).join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(bounds.w)}" height="${num(bounds.h)}" viewBox="${num(bounds.x)} ${num(bounds.y)} ${num(bounds.w)} ${num(bounds.h)}">` +
    `<rect x="${num(bounds.x)}" y="${num(bounds.y)}" width="${num(bounds.w)}" height="${num(bounds.h)}" fill="#08080a" />` +
    body +
    `</svg>`;

  return { svg, bounds };
}

/** JSON round-trip payload. Import reads exactly this shape. */
export function boardToJson(board: WhiteboardBoard): string {
  return JSON.stringify({ format: "asherin-whiteboard", version: 1, board }, null, 2);
}

export function parseBoardJson(raw: string): WhiteboardBoard | null {
  try {
    const parsed = JSON.parse(raw) as { format?: string; board?: WhiteboardBoard };
    const board = parsed?.board;
    if (!board || !Array.isArray(board.elements) || !Array.isArray(board.layers)) return null;
    return board;
  } catch {
    return null;
  }
}

/**
 * Rasterise an SVG string. Runs the image through a blob URL rather than a
 * data URI so large boards do not blow the URL length limit, and always
 * revokes the URL — a leaked object URL pins the whole bitmap in memory.
 */
export async function svgToPngBlob(svg: string, width: number, height: number, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("board could not be rasterised"));
      img.src = url;
    });

    // Cap the raster so a huge board cannot allocate a canvas the browser
    // refuses to back (Safari fails silently above ~16k px on a side).
    const safeScale = Math.min(scale, 8192 / Math.max(width, height, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * safeScale));
    canvas.height = Math.max(1, Math.round(height * safeScale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.fillStyle = "#08080a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("png encode failed"))), "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Trigger a download without leaving a dangling object URL behind. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeFileName = (name: string) =>
  (name || "board").replace(/[^a-zA-Z0-9 _-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "board";

export { getElementBounds };
