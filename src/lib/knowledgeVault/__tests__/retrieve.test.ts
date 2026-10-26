// asherin.knowledge — bm25 ranking on this device.
import { describe, expect, it } from "vitest";
import { LexicalIndex, searchPassages, type IndexedPassage } from "../retrieve";

const P = (id: string, content: string, sourceName = "notes", sourceId = "s1", chunkIndex = 0): IndexedPassage => ({ id, sourceId, sourceName, content, chunkIndex });

const corpus: IndexedPassage[] = [
  P("a", "the backup runs nightly at two and keeps thirty days of snapshots.", "ops runbook", "s1", 0),
  P("b", "snapshots older than thirty days are pruned by the retention job.", "ops runbook", "s1", 1),
  P("c", "the kitchen rota changes every monday; whoever cooks does not wash up.", "house rules", "s2", 0),
  P("d", "backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup backup.", "noise", "s3", 0),
  P("e", "retention of logs is ninety days; the backup retention is separate.", "ops runbook", "s1", 2),
];

describe("LexicalIndex.search", () => {
  it("returns nothing for an empty question or an empty index", () => {
    expect(new LexicalIndex(corpus).search("   ")).toEqual([]);
    expect(new LexicalIndex([]).search("backup")).toEqual([]);
    expect(new LexicalIndex(corpus).search("the of and")).toEqual([]);
  });

  it("ranks the passage that covers more of the question first and reports which stems matched", () => {
    const hits = searchPassages(corpus, "how long are backup snapshots kept");
    expect(hits[0].id).toBe("a");
    expect(hits[0].matched).toEqual(expect.arrayContaining(["backup", "snapshot"]));
    expect(hits.map((h) => h.id)).not.toContain("c");
  });

  it("saturates term frequency: a passage that only repeats one word does not beat one that answers", () => {
    const hits = searchPassages(corpus, "backup retention days");
    expect(hits[0].id).toBe("e");
    expect(hits.findIndex((h) => h.id === "d")).toBeGreaterThan(0);
  });

  it("gives relevance as a fraction of the best hit, best first, and respects k", () => {
    const hits = searchPassages(corpus, "backup snapshots retention", 2);
    expect(hits).toHaveLength(2);
    expect(hits[0].relevance).toBe(1);
    expect(hits[1].relevance).toBeLessThanOrEqual(1);
    expect(hits[1].relevance).toBeGreaterThan(0);
    expect(hits[0].score).toBeGreaterThanOrEqual(hits[1].score);
  });

  it("matches stems across word forms", () => {
    const hits = searchPassages(corpus, "pruning snapshot");
    expect(hits[0].id).toBe("b");
  });

  it("adds a small bonus when the question names the source", () => {
    const hits = searchPassages(corpus, "rota rules house");
    expect(hits[0].id).toBe("c");
    expect(hits[0].sourceName).toBe("house rules");
  });

  it("is deterministic for ties", () => {
    const twin = [P("x", "same words here", "n", "s1", 0), P("y", "same words here", "n", "s2", 0)];
    expect(searchPassages(twin, "same words").map((h) => h.id)).toEqual(["x", "y"]);
  });
});
