import { describe, expect, it } from "vitest";
import { buildGraph, labelFor, LIVE_MS, nodeState, relTime, roomFor, type PullLike } from "../graph";
import { NAV_INTENTS } from "@/lib/navIntents";

const NOW = Date.parse("2026-10-25T12:00:00Z");

const row = (p: Partial<PullLike>): PullLike => ({
  id: Math.random().toString(36).slice(2),
  ts: new Date(NOW - 1000).toISOString(),
  organ: "chat",
  capability: "x",
  from_surface: "chat",
  status: "ok",
  latency_ms: null,
  quote_masked: null,
  ...p,
});

describe("connect graph — ids", () => {
  it("maps every organ and surface a writer uses onto the room that owns it", () => {
    expect(roomFor("vault")).toBe("guardian-vault");
    expect(roomFor("briefings")).toBe("briefing");
    expect(roomFor("google-station")).toBe("google");
    expect(roomFor("asherinx-eng")).toBe("ghost-engine");
    expect(roomFor("connect")).toBe("api-keys");
    expect(roomFor("asherin.agents")).toBe("zahten");
  });

  it("keeps an unclaimed id under its own name instead of guessing a room", () => {
    expect(roomFor("maps")).toBe("maps");
    expect(roomFor("published tab")).toBe("published tab");
    expect(roomFor("")).toBe("unknown");
    expect(roomFor(null)).toBe("unknown");
  });

  it("labels rooms with the rail's own lowercase label", () => {
    expect(labelFor("guardian-vault")).toBe("guardian vault");
    expect(labelFor("zahten")).toBe("asherin.agents");
    expect(labelFor("ghost-engine")).toBe("asherinx.eng");
    expect(labelFor("maps")).toBe("geocoder");
    expect(labelFor("something-new")).toBe("something-new");
  });
});

describe("connect graph — node state", () => {
  it("is never when nothing ran, and a skip row never lights or fails a node", () => {
    expect(nodeState([], NOW)).toBe("never");
    expect(nodeState([row({ status: "skip" })], NOW)).toBe("never");
  });

  it("is ok only inside the live window, stale after it, fail on the newest failure", () => {
    expect(nodeState([row({})], NOW)).toBe("ok");
    expect(nodeState([row({ ts: new Date(NOW - LIVE_MS - 1).toISOString() })], NOW)).toBe("stale");
    expect(nodeState([row({ ts: new Date(NOW - 10 * 60 * 1000).toISOString() })], NOW)).toBe("stale");
    const older = row({ status: "fail", ts: new Date(NOW - 60_000).toISOString() });
    const newer = row({ status: "ok", ts: new Date(NOW - 1000).toISOString() });
    expect(nodeState([older, newer], NOW)).toBe("ok");
    expect(nodeState([newer, row({ status: "fail", ts: new Date(NOW).toISOString() })], NOW)).toBe("fail");
  });

  it("relative time never goes negative", () => {
    expect(relTime(new Date(NOW + 5000).toISOString(), NOW)).toBe("just now");
    expect(relTime(new Date(NOW - 3 * 60_000).toISOString(), NOW)).toBe("3m ago");
    expect(relTime(new Date(NOW - 26 * 3_600_000).toISOString(), NOW)).toBe("1d ago");
  });
});

describe("connect graph — derivation", () => {
  it("has one node per rail room (settings excepted), chat at the centre, everything inside the box", () => {
    const g = buildGraph([], NAV_INTENTS, NOW);
    const rooms = NAV_INTENTS.filter((n) => n.view && n.view !== "settings").map((n) => n.view);
    expect(g.nodes.map((n) => n.id).sort()).toEqual([...new Set(rooms)].sort());
    const chat = g.nodes.find((n) => n.id === "chat");
    expect(chat).toMatchObject({ x: 50, y: 50 });
    for (const n of g.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(100);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(100);
    }
    expect(g.edges).toEqual([]);
    expect(g.counts.never).toBe(g.nodes.length);
  });

  it("draws an edge only where a row says one surface reached another organ", () => {
    const pulls = [
      row({ organ: "file-scrapper", from_surface: "library", capability: "extract" }),
      row({ organ: "file-scrapper", from_surface: "library", capability: "extract", status: "fail" }),
      row({ organ: "library", from_surface: "library", capability: "ingest" }), // same room: no edge
      row({ organ: "maps", from_surface: "chat", capability: "property", ts: new Date(NOW - LIVE_MS * 2).toISOString() }),
    ];
    const g = buildGraph(pulls, NAV_INTENTS, NOW);
    expect(g.edges.map((e) => `${e.from}->${e.to}`).sort()).toEqual(["chat->maps", "library->file-scrapper"]);
    const lib = g.edges.find((e) => e.to === "file-scrapper")!;
    expect(lib.count).toBe(2);
    expect(lib.lit).toBe(true);
    const maps = g.edges.find((e) => e.to === "maps")!;
    expect(maps.lit).toBe(false);
  });

  it("adds a node for an organ the log names that no room claims, and counts states from rows", () => {
    const g = buildGraph([row({ organ: "maps", from_surface: "chat" })], NAV_INTENTS, NOW);
    const maps = g.nodes.find((n) => n.id === "maps");
    expect(maps).toBeDefined();
    expect(maps!.group).toBe("other");
    expect(maps!.state).toBe("ok");
    expect(g.counts.ok).toBe(1);
    // the surface (chat) opened nothing of its own: the row lights the organ, not the caller
    expect(g.nodes.find((n) => n.id === "chat")!.state).toBe("never");
  });

  it("the connect mount skip row appears in the room's rows but lights nothing", () => {
    const g = buildGraph([row({ organ: "connect", from_surface: "connect", capability: "mount", status: "skip" })], NAV_INTENTS, NOW);
    const connect = g.nodes.find((n) => n.id === "api-keys")!;
    expect(connect.rows).toHaveLength(1);
    expect(connect.state).toBe("never");
    expect(g.counts.ok).toBe(0);
  });
});
