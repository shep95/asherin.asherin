// asherin.knowledge — shaping, chunking and the tokenizer.
import { describe, expect, it } from "vitest";
import { CHUNK, chunkText, cleanSourceText, stem, tokenize } from "../chunk";

const para = (n: number, word = "alpha") => Array.from({ length: n }, (_, i) => `${word} sentence number ${i + 1} says something useful.`).join(" ");

describe("cleanSourceText", () => {
  it("drops nul bytes, unifies line endings, collapses blank runs and cuts at the cap", () => {
    const { text, truncated } = cleanSourceText("a\u0000b\r\nc\r\n\r\n\r\n\r\nd   \n");
    expect(text).toBe("ab\nc\n\nd\n");
    expect(truncated).toBe(false);
    const big = cleanSourceText("x".repeat(CHUNK.maxSourceChars + 10));
    expect(big.text.length).toBe(CHUNK.maxSourceChars);
    expect(big.truncated).toBe(true);
  });
});

describe("chunkText", () => {
  it("keeps short paragraphs together and never exceeds the hard cap", () => {
    const text = [para(2, "one"), para(2, "two"), para(2, "three")].join("\n\n");
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("one sentence");
    expect(chunks[0].content).toContain("three sentence");
  });

  it("cuts a long document into passages whose offsets point at their own text", () => {
    const text = Array.from({ length: 12 }, (_, i) => para(6, `topic${i}`)).join("\n\n");
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) {
      expect(c.content.length).toBeLessThanOrEqual(CHUNK.max);
      expect(text.slice(c.start, c.end)).toBe(c.content);
    }
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });

  it("carries an overlap so a sentence at a boundary is findable in both neighbours", () => {
    const text = Array.from({ length: 8 }, (_, i) => para(5, `block${i}`)).join("\n\n");
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1].start).toBeLessThan(chunks[0].end);
    expect(chunks[0].end - chunks[1].start).toBeLessThanOrEqual(CHUNK.overlap + 1);
  });

  it("splits one enormous paragraph at sentence ends, then hard-cuts a run with no sentences", () => {
    const sentences = chunkText(para(60, "long"));
    expect(sentences.length).toBeGreaterThan(2);
    for (const c of sentences) expect(c.content.length).toBeLessThanOrEqual(CHUNK.max);
    const run = chunkText("word ".repeat(1_000).trim());
    expect(run.length).toBeGreaterThan(2);
    for (const c of run) expect(c.content.length).toBeLessThanOrEqual(CHUNK.max);
  });

  it("is deterministic and empty on blank input", () => {
    const text = [para(4, "a"), para(4, "b")].join("\n\n");
    expect(chunkText(text)).toEqual(chunkText(text));
    expect(chunkText("   \n\n  ")).toEqual([]);
  });
});

describe("tokenize", () => {
  it("lowercases, strips accents and punctuation, drops stop words and stems", () => {
    expect(tokenize("The Cats were running, quickly — to Zürich!")).toEqual(["cat", "runn", "quick", "zurich"]);
    expect(tokenize("a an the of to")).toEqual([]);
  });

  it("stems plurals and common suffixes without touching short words", () => {
    expect(stem("policies")).toBe("policy");
    expect(stem("classes")).toBe("class");
    expect(stem("indexed")).toBe("index");
    expect(stem("passages")).toBe("passag");
    expect(stem("bus")).toBe("bus");
    expect(stem("glass")).toBe("glass");
  });
});
