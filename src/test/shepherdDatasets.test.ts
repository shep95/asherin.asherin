import { describe, expect, it } from "vitest";
import {
  AESTHETIC_DATASET,
  ARCHITECTURE_DATASET,
  datasetSections,
  parseAestheticRecords,
  parseArchitectureSections,
} from "@/lib/local/prompt/shepherdDatasets";
import { retrieveDoctrine, retrievedDoctrineBlock } from "@/lib/local/prompt/shepherdBrain";

describe("shepherd reference datasets", () => {
  it("parses one section per aesthetic record and keeps every line", () => {
    const recs = parseAestheticRecords();
    const records = recs.filter((r) => r.title.startsWith("aesthetic record "));
    expect(records.length).toBe(58);
    expect(records[0].title).toBe("aesthetic record 001 — foundations — aesthetic judgment");
    expect(records[0].body).toContain("DESIGN APPLICATION / RULE");
    const joined = recs.map((r) => r.body).join("\n");
    for (const line of AESTHETIC_DATASET.split("\n").filter((l) => l.trim() && !/^RECORD \d+ \|/.test(l.trim()))) {
      expect(joined).toContain(line.trim());
    }
  });

  it("parses the architecture dataset by its upper-case headings", () => {
    const secs = parseArchitectureSections();
    const titles = secs.map((s) => s.title);
    expect(titles).toContain("part ii — whole-architecture repair taxonomy · twelve core repair domains");
    expect(titles.some((t) => t.includes("antipattern family: frontend and interface defects"))).toBe(true);
    const anti = secs.find((s) => s.title.includes("antipattern family: frontend and interface defects"));
    expect(anti?.body).toContain("VC-065");
    const joined = secs.map((s) => s.body).join("\n");
    expect(joined).toContain("Discover -> model -> diagnose -> trace -> repair -> verify -> record.");
    expect(ARCHITECTURE_DATASET.length).toBeGreaterThan(30000);
  });

  it("is retrievable by what was asked, in the datasets' own words", () => {
    expect(datasetSections().length).toBeGreaterThan(70);
    const hits = retrieveDoctrine("the hover state is barely visible and the success indication is too subtle");
    expect(hits.some((h) => h.title.includes("weber fraction"))).toBe(true);
    const block = retrievedDoctrineBlock("our controls look interactive but are not, and the animation distracts");
    expect(block).toContain("misleading affordances");
  });
});
