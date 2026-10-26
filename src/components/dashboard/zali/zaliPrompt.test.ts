import { describe, expect, it } from "vitest";
import type { ZaliMessage, ZaliProject } from "./types";
import {
  attachToSpec,
  buildDesignDirective,
  buildProjectExport,
  extractResearchFindings,
  hasDesignData,
  isSoftwareProject,
  normalizeDomain,
  parseQuestionOptions,
  slugify,
  specList,
} from "./zaliPrompt";

const project = (over: Partial<ZaliProject> = {}): ZaliProject => ({
  id: "p1",
  name: "Pocket Lens",
  description: "",
  designType: "product",
  phase: "understanding",
  status: "active",
  researchDomains: [],
  specifications: {},
  costAnalysis: {},
  manufacturing: {},
  simulationResults: {},
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  ...over,
});

describe("extractResearchFindings", () => {
  it("reads tagged lines, normalises aliases and drops unknown domains", () => {
    const text = [
      "some prose",
      "[RESEARCH: physics] thin lenses lose about 4% per uncoated surface",
      "[RESEARCH: optics]: **coatings** bring that under 1%",
      "[RESEARCH: astrology] mercury is in retrograde",
      "[RESEARCH: Safety & Ethics] shutter edge must not pinch",
    ].join("\n");
    expect(extractResearchFindings(text)).toEqual([
      { domain: "physics", title: "thin lenses lose about 4% per uncoated surface" },
      { domain: "physics", title: "coatings bring that under 1%" },
      { domain: "safety", title: "shutter edge must not pinch" },
    ]);
  });

  it("de-duplicates identical findings and caps the title", () => {
    const line = "[RESEARCH: chemistry] " + "x".repeat(400);
    const out = extractResearchFindings(`${line}\n${line}`);
    expect(out).toHaveLength(1);
    expect(out[0].title).toHaveLength(160);
  });

  it("normalizeDomain maps aliases and rejects noise", () => {
    expect(normalizeDomain("Electrical")).toBe("engineering");
    expect(normalizeDomain("cost")).toBe("economics");
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("vibes")).toBeNull();
  });
});

describe("attachToSpec / specList", () => {
  it("appends once, case-insensitively, and never mutates the input", () => {
    const specs = { materials: ["Aluminium 6061"] };
    const a = attachToSpec(specs, "materials", "aluminium 6061");
    expect(a.added).toBe(false);
    const b = attachToSpec(specs, "materials", " Mycelium ");
    expect(b.added).toBe(true);
    expect(b.specs.materials).toEqual(["Aluminium 6061", "Mycelium"]);
    expect(specs.materials).toEqual(["Aluminium 6061"]);
    const c = attachToSpec(specs, "components", "ESP32");
    expect(c.specs.components).toEqual(["ESP32"]);
    expect(attachToSpec(specs, "components", "   ").added).toBe(false);
  });

  it("specList tolerates junk", () => {
    expect(specList({ materials: "steel" }, "materials")).toEqual([]);
    expect(specList({ materials: [1, " steel ", null, ""] }, "materials")).toEqual(["1", "steel"]);
    expect(specList(undefined, "materials")).toEqual([]);
  });

  it("hasDesignData is false for an empty record", () => {
    expect(hasDesignData(project())).toBe(false);
    expect(hasDesignData(project({ costAnalysis: { estimated_unit_cost: "$4" } }))).toBe(true);
    expect(hasDesignData(null)).toBe(false);
  });
});

describe("isSoftwareProject", () => {
  it("matches whole tokens only", () => {
    expect(isSoftwareProject(project({ designType: "software" }))).toBe(true);
    expect(isSoftwareProject(project({ name: "full-stack notes" }))).toBe(true);
    expect(isSoftwareProject(project({ name: "appetite for botany" }))).toBe(false);
    expect(isSoftwareProject(null)).toBe(false);
  });
});

describe("buildDesignDirective", () => {
  it("names the fences shepherd must use and carries the record", () => {
    const d = buildDesignDirective(project({ specifications: { materials: ["glass"] } }), { materials: ["glass", "brass"], components: [] });
    expect(d).toContain("```design_output");
    expect(d).toContain("```options");
    expect(d).toContain("[RESEARCH: <domain>]");
    expect(d).toContain('"materials":["glass"]');
    expect(d).toContain("glass, brass");
    expect(d).not.toContain("code_output");
  });

  it("adds the code contract for software projects and truncates a huge spec", () => {
    const big = { notes: "n".repeat(10_000) };
    const d = buildDesignDirective(project({ designType: "software", specifications: big }));
    expect(d).toContain("```code_output");
    expect(d).toContain("(truncated)");
    expect(d.length).toBeLessThan(9_000);
  });
});

describe("buildProjectExport", () => {
  it("writes one markdown file with the record and the conversation", () => {
    const messages: ZaliMessage[] = [
      { id: "m1", projectId: "p1", role: "user", content: "design a lens", metadata: {}, createdAt: new Date("2026-01-02T00:00:00Z") },
      { id: "m2", projectId: "p1", role: "assistant", content: "which focal length?", metadata: {}, createdAt: new Date("2026-01-02T00:00:01Z") },
    ];
    const { filename, markdown } = buildProjectExport(project({ specifications: { materials: ["glass"], key_features: ["f/2"] } }), messages);
    expect(filename).toBe("asherin-design-pocket-lens.md");
    expect(markdown).toContain("# Pocket Lens");
    expect(markdown).toContain("- materials: glass");
    expect(markdown).toContain("## specifications");
    expect(markdown).toContain('"materials"');
    expect(markdown).toContain("_nothing recorded yet_");
    expect(markdown).toContain("**operator**");
    expect(markdown).toContain("**shepherd**");
    expect(markdown).not.toMatch(/\n{3,}/);
  });

  it("slugify never yields an empty name", () => {
    expect(slugify("  ")).toBe("project");
    expect(slugify("Ünïcode / Lamp!")).toBe("n-code-lamp");
  });
});

describe("parseQuestionOptions", () => {
  it("lifts the options fence out of the reply and strips design_output", () => {
    const content = [
      "two ways to go.",
      "```design_output",
      '{"phase":"design"}',
      "```",
      "```options",
      "[RECOMMENDED] glass — scratch resistant",
      "acrylic — lighter and cheaper",
      "```",
    ].join("\n");
    const { cleanContent, options } = parseQuestionOptions(content);
    expect(cleanContent).toBe("two ways to go.");
    expect(options).toEqual([
      { text: "glass", description: "scratch resistant", isRecommended: true },
      { text: "acrylic", description: "lighter and cheaper", isRecommended: false },
    ]);
  });

  it("tolerates a language suffix and crlf, and returns no options when there is no fence", () => {
    const { options } = parseQuestionOptions("```options json\r\nsteel\r\n```");
    expect(options).toEqual([{ text: "steel", description: "", isRecommended: false }]);
    expect(parseQuestionOptions("plain answer").options).toEqual([]);
  });
});
