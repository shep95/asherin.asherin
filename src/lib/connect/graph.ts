// connect — the graph is derived, never drawn by hand.
//
// nodes are the rooms the rail actually lists (src/lib/navIntents.ts) plus any
// organ id the pull log holds that no room claims. edges exist only where a
// pull row says one surface reached into another organ (from_surface → organ).
// a node is lit only because a row says something ran. nothing here invents
// a pull, an edge or a room.

import { NAV_INTENTS, type NavIntent, type IntentGroup } from "@/lib/navIntents";

export type PullStatus = "ok" | "fail" | "skip" | "stale";

export interface PullLike {
  id: string;
  ts: string;
  organ: string;
  capability: string;
  from_surface: string;
  status: PullStatus;
  latency_ms: number | null;
  quote_masked: string | null;
}

export type NodeState = "ok" | "stale" | "fail" | "never";

export interface GraphNode {
  /** room view id, or the raw organ id when no room claims it */
  id: string;
  label: string;
  group: IntentGroup | "other";
  state: NodeState;
  rows: PullLike[];
  lastTs: string | null;
  x: number;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  count: number;
  lastTs: string;
  lastStatus: PullStatus;
  /** true when a pull on this edge succeeded inside the live window */
  lit: boolean;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  counts: Record<NodeState, number>;
}

/** a pull counts as "live" for this long after it ran */
export const LIVE_MS = 5 * 60 * 1000;

/**
 * organ ids and from_surface values that writers use (grep `emitPull({` under
 * src/) mapped to the room that owns them. an id missing here is shown under
 * its own name rather than guessed into a room.
 */
export const ORGAN_ROOM: Record<string, string> = {
  chat: "chat",
  google: "google",
  "google-mesh": "google",
  "google-station": "google",
  vault: "guardian-vault",
  "guardian-vault": "guardian-vault",
  zahten: "zahten",
  "asherin.agents": "zahten",
  briefings: "briefing",
  briefing: "briefing",
  notebooks: "notebooks",
  "knowledge-vault": "knowledge-vault",
  library: "library",
  whiteboard: "whiteboard",
  ghost: "ghost-engine",
  "asherinx-eng": "ghost-engine",
  "ghost-engine": "ghost-engine",
  "file-scrapper": "file-scrapper",
  connect: "api-keys",
  "api-keys": "api-keys",
  defender: "asherin-defender",
  "asherin-defender": "asherin-defender",
  arvision: "asherin-arvision",
  "asherin-arvision": "asherin-arvision",
  projects: "projects",
  memory: "memory",
  snippets: "snippets",
  zali: "zali",
  zerlal: "zerlal",
  azplen: "azplen",
  search: "search",
  sentinel: "asherin-sentinel",
  "asherin-sentinel": "asherin-sentinel",
  health: "asherin-health",
  "asherin-health": "asherin-health",
  adam: "asherin-adam",
  "asherin-adam": "asherin-adam",
  vedic: "vedic-astrology",
  "vedic-astrology": "vedic-astrology",
  pages: "pdf-generator",
  "pdf-generator": "pdf-generator",
};

/** labels for ids that no rail entry carries */
const EXTRA_LABELS: Record<string, string> = {
  "ghost-engine": "asherinx.eng",
  maps: "geocoder",
  "published tab": "published tab",
  unknown: "unknown surface",
};

/** rooms that never pull anything and would only add noise to the map */
const HIDDEN_ROOMS = new Set(["settings"]);

export function roomFor(id: string | null | undefined): string {
  const raw = String(id ?? "").trim();
  if (!raw) return "unknown";
  return ORGAN_ROOM[raw] ?? raw;
}

export function labelFor(roomId: string, nav: NavIntent[] = NAV_INTENTS): string {
  const hit = nav.find((n) => n.view === roomId);
  if (hit) return hit.label.toLowerCase();
  return EXTRA_LABELS[roomId] ?? roomId;
}

/**
 * state from the newest row that actually ran. skip rows (a surface opened,
 * nothing was pulled) never light or fail a node; they only appear in the log.
 */
export function nodeState(rows: PullLike[], now: number = Date.now()): NodeState {
  const ran = rows.filter((r) => r.status === "ok" || r.status === "fail" || r.status === "stale");
  if (!ran.length) return "never";
  const last = ran.reduce((a, b) => (Date.parse(b.ts) > Date.parse(a.ts) ? b : a));
  if (last.status === "fail") return "fail";
  const age = now - Date.parse(last.ts);
  return Number.isFinite(age) && age >= 0 && age < LIVE_MS ? "ok" : "stale";
}

export function relTime(ts: string, now: number = Date.now()): string {
  const diff = now - Date.parse(ts);
  if (!Number.isFinite(diff) || diff < 0) return "just now";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const GROUP_ORDER: Array<IntentGroup | "other"> = ["watch", "find", "understand", "make", "keep", "account", "other", "talk"];

/**
 * deterministic layout: chat at the centre, every other node on a ring in
 * group order, alternating two radii so neighbouring labels do not collide.
 * coordinates are 0..100 (svg viewBox units).
 */
function layout(nodes: Omit<GraphNode, "x" | "y">[]): GraphNode[] {
  const centre = nodes.find((n) => n.id === "chat");
  const ring = nodes
    .filter((n) => n.id !== "chat")
    .sort((a, b) => {
      const g = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
      return g !== 0 ? g : a.label.localeCompare(b.label);
    });
  const out: GraphNode[] = [];
  if (centre) out.push({ ...centre, x: 50, y: 50 });
  const n = ring.length;
  ring.forEach((node, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
    const r = n > 12 ? (i % 2 === 0 ? 30 : 41) : 36;
    out.push({
      ...node,
      x: Math.round((50 + r * Math.cos(angle)) * 10) / 10,
      y: Math.round((50 + r * Math.sin(angle)) * 10) / 10,
    });
  });
  return out;
}

export function buildGraph(pulls: PullLike[], nav: NavIntent[] = NAV_INTENTS, now: number = Date.now()): Graph {
  const byRoom = new Map<string, PullLike[]>();
  for (const p of pulls) {
    const room = roomFor(p.organ);
    const arr = byRoom.get(room);
    if (arr) arr.push(p);
    else byRoom.set(room, [p]);
  }

  const seen = new Set<string>();
  const bare: Omit<GraphNode, "x" | "y">[] = [];
  const push = (id: string, group: IntentGroup | "other") => {
    if (seen.has(id)) return;
    seen.add(id);
    const rows = (byRoom.get(id) ?? []).slice().sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
    bare.push({ id, label: labelFor(id, nav), group, state: nodeState(rows, now), rows, lastTs: rows[0]?.ts ?? null });
  };

  for (const intent of nav) {
    if (!intent.view || HIDDEN_ROOMS.has(intent.view)) continue;
    push(intent.view, intent.group);
  }
  // organs and surfaces the log names that no rail entry claims
  for (const p of pulls) {
    push(roomFor(p.organ), "other");
    push(roomFor(p.from_surface), "other");
  }

  const edgeMap = new Map<string, GraphEdge>();
  for (const p of pulls) {
    const from = roomFor(p.from_surface);
    const to = roomFor(p.organ);
    if (from === to) continue;
    const key = `${from}->${to}`;
    const live = p.status === "ok" && now - Date.parse(p.ts) < LIVE_MS;
    const cur = edgeMap.get(key);
    if (!cur) {
      edgeMap.set(key, { from, to, count: 1, lastTs: p.ts, lastStatus: p.status, lit: live });
    } else {
      cur.count += 1;
      cur.lit = cur.lit || live;
      if (Date.parse(p.ts) > Date.parse(cur.lastTs)) {
        cur.lastTs = p.ts;
        cur.lastStatus = p.status;
      }
    }
  }

  const nodes = layout(bare);
  const counts: Record<NodeState, number> = { ok: 0, stale: 0, fail: 0, never: 0 };
  for (const n of nodes) counts[n.state] += 1;
  return { nodes, edges: [...edgeMap.values()], counts };
}

export const STATE_LABEL: Record<NodeState, string> = {
  ok: "ran in the last five minutes",
  stale: "last ran a while ago",
  fail: "last run failed",
  never: "nothing has run",
};
