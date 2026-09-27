/**
 * Convert a board drop into whiteboard elements.
 *
 * Pure geometry — no network, no randomness beyond element ids, so the same
 * drop always lands the same way. Nothing here invents content: a graph drop
 * renders exactly the nodes and edges it was handed, and a map pin shows the
 * coordinates it was given rather than pretending to be a map tile.
 */

import type { BoardDrop, BoardGraphEdge, BoardGraphNode } from "./boardInbox";
import type { Point, WhiteboardElement } from "./types";

const uid = () => `el-${Math.random().toString(36).slice(2, 10)}`;

const NODE_COLORS: Record<string, string> = {
  person: "#f9a8d4",
  organization: "#93c5fd",
  location: "#86efac",
  topic: "#fcd34d",
  source: "#c4b5fd",
  event: "#fdba74",
  domain: "#7dd3fc",
  ip: "#a5b4fc",
  email: "#f0abfc",
};

const wrapText = (text: string, perLine: number, maxLines: number): string => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current.length) current = word;
    else if (current.length + word.length + 1 <= perLine) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  const out = lines.slice(0, maxLines);
  if (lines.length >= maxLines && words.join(" ").length > out.join(" ").length) {
    out[out.length - 1] = `${out[out.length - 1].slice(0, Math.max(3, perLine - 1))}…`;
  }
  return out.join("\n");
};

function noteElements(drop: BoardDrop, layerId: string, at: Point): WhiteboardElement[] {
  const body = (drop.text || "").trim();
  if (!body) return [];
  const wrapped = wrapText(body, 30, 12);
  const lineCount = wrapped.split("\n").length;
  return [{
    id: uid(),
    layerId,
    type: "sticky",
    x: at.x,
    y: at.y,
    w: 260,
    h: Math.max(150, 44 + lineCount * 21),
    text: wrapped,
    fontSize: 15,
    fontFamily: "Sans",
    fontWeight: "400",
    noteColor: "#fde68a",
    color: "#111827",
    origin: drop.source,
  }];
}

function briefElements(drop: BoardDrop, layerId: string, at: Point): WhiteboardElement[] {
  const bullets = (drop.bullets || []).map((b) => b.trim()).filter(Boolean).slice(0, 8);
  if (!bullets.length && !drop.text) return [];

  const columns = bullets.length > 4 ? 2 : 1;
  const cardW = 250;
  const cardH = 132;
  const gap = 22;
  const rows = Math.ceil(Math.max(bullets.length, 1) / columns);

  const frameW = columns * cardW + (columns + 1) * gap;
  const frameH = rows * cardH + (rows + 1) * gap;

  const elements: WhiteboardElement[] = [{
    id: uid(),
    layerId,
    type: "frame",
    x: at.x,
    y: at.y,
    w: frameW,
    h: frameH,
    title: drop.title || "Brief",
    color: "rgba(255,255,255,0.3)",
    width: 1.5,
    origin: drop.source,
  }];

  bullets.forEach((bullet, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    elements.push({
      id: uid(),
      layerId,
      type: "sticky",
      x: at.x + gap + col * (cardW + gap),
      y: at.y + gap + row * (cardH + gap),
      w: cardW,
      h: cardH,
      text: wrapText(bullet, 28, 5),
      fontSize: 14,
      fontFamily: "Sans",
      fontWeight: "400",
      noteColor: "#bfdbfe",
      color: "#111827",
      origin: drop.source,
    });
  });

  if (!bullets.length && drop.text) {
    elements.push(...noteElements({ ...drop, kind: "note" }, layerId, { x: at.x + gap, y: at.y + gap }));
  }

  return elements;
}

function graphElements(
  nodes: BoardGraphNode[],
  edges: BoardGraphEdge[],
  drop: BoardDrop,
  layerId: string,
  at: Point,
): WhiteboardElement[] {
  const capped = nodes.slice(0, 28);
  if (!capped.length) return [];

  const nodeW = 156;
  const nodeH = 62;
  // Radial layout keeps every node reachable without an overlap solver; the
  // radius grows with population so a 28-node graph does not self-intersect.
  const radius = Math.max(210, capped.length * 26);
  const cx = at.x + radius;
  const cy = at.y + radius;

  const idMap = new Map<string, string>();
  const elements: WhiteboardElement[] = [];

  elements.push({
    id: uid(),
    layerId,
    type: "frame",
    x: cx - radius - nodeW,
    y: cy - radius - nodeH - 24,
    w: (radius + nodeW) * 2,
    h: (radius + nodeH) * 2 + 24,
    title: drop.title || "Entity graph",
    color: "rgba(255,255,255,0.22)",
    width: 1.5,
    origin: drop.source,
  });

  capped.forEach((node, index) => {
    const angle = (index / capped.length) * Math.PI * 2 - Math.PI / 2;
    const x = cx + radius * Math.cos(angle) - nodeW / 2;
    const y = cy + radius * Math.sin(angle) - nodeH / 2;
    const elementId = uid();
    idMap.set(node.id, elementId);
    elements.push({
      id: elementId,
      layerId,
      type: "rect",
      x,
      y,
      w: nodeW,
      h: nodeH,
      color: NODE_COLORS[node.kind || ""] || "#e2e8f0",
      fillColor: "rgba(2,6,23,0.82)",
      width: 1.5,
      text: wrapText(node.label, 20, 2),
      fontSize: 12,
      fontFamily: "Sans",
      fontWeight: "400",
      origin: drop.source,
    });
  });

  for (const edge of edges.slice(0, 80)) {
    const fromId = idMap.get(edge.source);
    const toId = idMap.get(edge.target);
    // An edge whose endpoint was trimmed by the node cap is dropped, never
    // re-pointed at a different node — a re-pointed edge would be a claim
    // the source data never made.
    if (!fromId || !toId || fromId === toId) continue;
    elements.push({
      id: uid(),
      layerId,
      type: "arrow",
      fromId,
      toId,
      color: "rgba(148,163,184,0.75)",
      width: 1.4,
      text: edge.label ? edge.label.slice(0, 26) : undefined,
      origin: drop.source,
    });
  }

  return elements;
}

function mapPinElements(drop: BoardDrop, layerId: string, at: Point): WhiteboardElement[] {
  const hasCoords = typeof drop.lat === "number" && typeof drop.lon === "number";
  return [{
    id: uid(),
    layerId,
    type: "document",
    x: at.x,
    y: at.y,
    w: 300,
    h: 128,
    fileName: drop.title || "Map pin",
    fileType: hasCoords ? `${drop.lat!.toFixed(5)}, ${drop.lon!.toFixed(5)}` : "coordinates unavailable",
    preview: drop.text || (hasCoords ? "Pinned from asherin maps" : "No coordinates were resolved for this place"),
    color: "#86efac",
    origin: drop.source,
  }];
}

/**
 * Materialise a drop. Returns [] when the drop carries nothing renderable —
 * callers trace that as a skip rather than dropping an empty card on the board.
 */
export function dropToElements(drop: BoardDrop, layerId: string, at: Point): WhiteboardElement[] {
  switch (drop.kind) {
    case "note":
      return noteElements(drop, layerId, at);
    case "brief":
      return briefElements(drop, layerId, at);
    case "graph":
      return graphElements(drop.nodes || [], drop.edges || [], drop, layerId, at);
    case "map-pin":
      return mapPinElements(drop, layerId, at);
    default:
      return [];
  }
}

/** One-line human summary used for the Connect trace quote. */
export function describeDrop(drop: BoardDrop): string {
  switch (drop.kind) {
    case "graph":
      return `${drop.nodes?.length || 0} nodes / ${drop.edges?.length || 0} edges`;
    case "brief":
      return drop.title || `brief · ${drop.bullets?.length || 0} points`;
    case "map-pin":
      return drop.title || "map pin";
    default:
      return (drop.text || "note").slice(0, 60);
  }
}
