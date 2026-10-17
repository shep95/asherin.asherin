import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SHEPHERD_DOCTRINE, doctrineSections, parseSections, retrieveDoctrine, shepherdCore } from "@/lib/local/prompt/shepherdBrain";

describe("shepherd doctrine on device", () => {
  it("ships the whole document, byte for byte apart from line endings", () => {
    const onDisk = readFileSync(resolve(process.cwd(), "src/lib/local/prompt/shepherd.txt"), "utf8").replace(/\r\n?/g, "\n");
    expect(SHEPHERD_DOCTRINE).toBe(onDisk);
    expect(SHEPHERD_DOCTRINE).not.toContain("\r");
    expect(SHEPHERD_DOCTRINE.length).toBeGreaterThan(200_000);
    expect(SHEPHERD_DOCTRINE.startsWith('"shepherd - quantum artificial intelligence algorithmic"')).toBe(true);
  });

  it("splits into its own headings and loses no text", () => {
    const sections = doctrineSections();
    expect(sections.length).toBeGreaterThan(150);
    const titles = sections.map((s) => s.title);
    for (const t of ["how you answer", "what you never do", "the prediction protocol", "hacker taxonomy: how they think, map, and move", "real code vs. fake code", "the software build directive"]) {
      expect(titles).toContain(t);
    }
    const joined = sections.map((s) => s.body).join("\n").replace(/\s+/g, " ").trim().length;
    const original = SHEPHERD_DOCTRINE.replace(/\s+/g, " ").trim().length;
    // every line is in a body or is a title; nothing else is dropped
    const titleChars = titles.slice(1).join(" ").length;
    expect(joined + titleChars).toBeGreaterThan(original * 0.99);
  });

  it("parser is honest about what a heading is", () => {
    const s = parseSections("intro line.\n\nmy heading\n\nbody one.\nbody two.\n\nnot a heading because it ends with a period.\n\nsecond heading\n\nmore.");
    expect(s.map((x) => x.title)).toEqual(["shepherd", "my heading", "second heading"]);
    expect(s[1].body).toContain("not a heading because it ends with a period.");
  });

  it("retrieves by what was asked, ranked, within budget", () => {
    const hits = retrieveDoctrine("how does a nation-state apt attacker map a network before moving", 14_000);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((h) => h.title).join(" | ")).toMatch(/nation-state|hacker taxonomy|APT/i);
    expect(hits.reduce((n, h) => n + h.body.length, 0)).toBeLessThanOrEqual(14_000);
    expect(retrieveDoctrine("hey")).toEqual([]);
    const ui = retrieveDoctrine("design the interface for a cooking app with the right domain color semantics");
    expect(ui.map((h) => h.title).join(" | ")).toMatch(/domain|interface|visual language/i);
  });

  it("core carries identity, conduct, architecture, protocol and law, verbatim", () => {
    const core = shepherdCore();
    for (const line of [
      "you are a pattern-reading assistant.",
      "always lowercase, unless giving a proper name or entity.",
      "you never perform.",
      "pride: do not elevate your answer above its function",
      "signal classification — what domain is this actually in",
      "stage 7: self-correction loop",
      "negative space is the primary material.",
      "the finding is never missing from reality. it is only missing from the current read.",
    ]) {
      expect(core).toContain(line);
    }
  });
});
