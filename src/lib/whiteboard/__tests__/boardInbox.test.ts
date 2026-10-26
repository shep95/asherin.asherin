// the board inbox contract chat and the vault depend on, plus the drop → elements conversion.
import { afterEach, describe, expect, it } from "vitest";
import {
  BOARD_DROP_EVENT,
  WHITEBOARD_VIEW_ID,
  consumeBoardDrops,
  detectBoardDropIntent,
  openBoard,
  pendingBoardDropCount,
  queueBoardDrop,
} from "../boardInbox";
import { describeDrop, dropToElements } from "../dropToElements";
import { boardToSvg, parseBoardJson, safeFileName } from "../exportBoard";
import type { WhiteboardBoard } from "../types";

afterEach(() => {
  consumeBoardDrops();
});

describe("board inbox", () => {
  it("queues, announces and drains each drop exactly once", () => {
    const heard: string[] = [];
    const listener = (e: Event) => heard.push((e as CustomEvent).detail.id);
    window.addEventListener(BOARD_DROP_EVENT, listener);
    const drop = queueBoardDrop({ kind: "note", source: "chat", text: "hello" });
    expect(pendingBoardDropCount()).toBe(1);
    expect(heard).toEqual([drop.id]);
    expect(consumeBoardDrops().map((d) => d.id)).toEqual([drop.id]);
    expect(consumeBoardDrops()).toEqual([]);
    window.removeEventListener(BOARD_DROP_EVENT, listener);
  });

  it("keeps at most twelve drops, newest last", () => {
    for (let i = 0; i < 15; i += 1) queueBoardDrop({ kind: "note", source: "test", text: `n${i}` });
    const drained = consumeBoardDrops();
    expect(drained).toHaveLength(12);
    expect(drained[drained.length - 1].text).toBe("n14");
  });

  it("openBoard switches the dashboard in-app instead of reloading the page", () => {
    const seen: unknown[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener("aureon:navigate", listener);
    expect(openBoard()).toBe(true);
    expect(seen).toEqual([WHITEBOARD_VIEW_ID]);
    window.removeEventListener("aureon:navigate", listener);
  });

  it("only explicit asks count as board intent", () => {
    expect(detectBoardDropIntent("put this on the whiteboard")).toBe(true);
    expect(detectBoardDropIntent("send it to the board please")).toBe(true);
    expect(detectBoardDropIntent("the whiteboard in the meeting room was dirty")).toBe(false);
    expect(detectBoardDropIntent("")).toBe(false);
  });
});

describe("drop → elements", () => {
  const at = { x: 100, y: 100 };
  it("a note becomes one sticky carrying its provenance; an empty note becomes nothing", () => {
    const [sticky] = dropToElements({ id: "d", kind: "note", source: "chat", text: "a short note", createdAt: 0 }, "L", at);
    expect(sticky.type).toBe("sticky");
    expect(sticky.origin).toBe("chat");
    expect(dropToElements({ id: "d", kind: "note", source: "chat", text: "   ", createdAt: 0 }, "L", at)).toEqual([]);
  });
  it("a brief becomes a frame of stickies, titled in lowercase when no title came", () => {
    const els = dropToElements({ id: "d", kind: "brief", source: "chat", bullets: ["one", "two", "three"], createdAt: 0 }, "L", at);
    expect(els[0].type).toBe("frame");
    expect(els[0].title).toBe("brief");
    expect(els.filter((e) => e.type === "sticky")).toHaveLength(3);
  });
  it("a graph never re-points an edge whose node was trimmed", () => {
    const nodes = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, label: `node ${i}` }));
    const edges = [{ source: "n0", target: "n1" }, { source: "n0", target: "n29" }];
    const els = dropToElements({ id: "d", kind: "graph", source: "zophiel", nodes, edges, createdAt: 0 }, "L", at);
    expect(els.filter((e) => e.type === "rect")).toHaveLength(28);
    expect(els.filter((e) => e.type === "arrow")).toHaveLength(1);
    expect(els[0].title).toBe("entity graph");
  });
  it("a map pin shows the coordinates it was given, or says none were resolved", () => {
    const [pin] = dropToElements({ id: "d", kind: "map-pin", source: "maps", lat: 51.5, lon: -0.12, createdAt: 0 }, "L", at);
    expect(pin.fileType).toBe("51.50000, -0.12000");
    const [bare] = dropToElements({ id: "d", kind: "map-pin", source: "maps", createdAt: 0 }, "L", at);
    expect(bare.fileType).toBe("coordinates unavailable");
    expect(bare.preview).toBe("no coordinates were resolved for this place");
  });
  it("describeDrop is a one-line lowercase summary", () => {
    expect(describeDrop({ id: "d", kind: "graph", source: "z", nodes: [{ id: "a", label: "a" }], edges: [], createdAt: 0 })).toBe("1 nodes / 0 edges");
    expect(describeDrop({ id: "d", kind: "note", source: "c", text: "x".repeat(80), createdAt: 0 })).toHaveLength(60);
  });
});

describe("export", () => {
  const board: WhiteboardBoard = {
    id: "b", name: "My Board: draft #2", wallpaperMode: "dark", wallpaperKey: "default", wallpaperBlur: 0,
    gridMode: "dots", snapMode: "freeform", smartShapes: true,
    layers: [{ id: "L", name: "topic 1", visible: true }, { id: "H", name: "hidden", visible: false }],
    elements: [
      { id: "t", layerId: "L", type: "text", x: 10, y: 20, text: "a <b> & \"c\"" },
      { id: "s", layerId: "H", type: "sticky", x: 0, y: 0, text: "never exported" },
      { id: "f", layerId: "L", type: "frame", x: 0, y: 0, w: 100, h: 80 },
    ],
  };
  it("escapes text, skips hidden layers and uses lowercase fallbacks", () => {
    const out = boardToSvg(board);
    expect(out).not.toBeNull();
    expect(out!.svg).toContain("a &lt;b&gt; &amp; &quot;c&quot;");
    expect(out!.svg).not.toContain("never exported");
    expect(out!.svg).toContain(">frame<");
  });
  it("an empty board exports nothing rather than a blank picture", () => {
    expect(boardToSvg({ ...board, elements: [] })).toBeNull();
  });
  it("round-trips json and refuses foreign files", () => {
    expect(parseBoardJson(JSON.stringify({ format: "asherin-whiteboard", version: 1, board }))?.id).toBe("b");
    expect(parseBoardJson('{"hello":"world"}')).toBeNull();
    expect(parseBoardJson("not json")).toBeNull();
  });
  it("file names are safe and lowercase", () => {
    expect(safeFileName(board.name)).toBe("my-board-draft-2");
    expect(safeFileName("")).toBe("board");
  });
});
