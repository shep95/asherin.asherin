import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai", () => ({ askModel: vi.fn() }));

import { askModel } from "@/lib/ai";
import type { ZaliProject } from "./types";
import {
  ANALYSIS_UNREADABLE,
  buildAnalysisPrompt,
  parseModelJson,
  runAnalysis,
  validateEstimate,
  validateManufacturing,
  validateMaterials,
  validateProposals,
} from "./zaliAnalysis";

const project: ZaliProject = {
  id: "p1", name: "Pocket Lens", description: "a loupe", designType: "product", phase: "design", status: "active",
  researchDomains: [], specifications: { materials: ["glass"], components: ["ring"] }, costAnalysis: {}, manufacturing: {}, simulationResults: {},
  createdAt: new Date(0), updatedAt: new Date(0),
};

describe("parseModelJson", () => {
  it("reads fenced, bare and prose-wrapped objects", () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseModelJson('here you go: {"a":{"b":2}} hope it helps')).toEqual({ a: { b: 2 } });
    expect(parseModelJson("no json here")).toBeNull();
    expect(parseModelJson("")).toBeNull();
  });
});

describe("validators", () => {
  it("estimate: keeps metrics and recommendations, coerces status, rejects empties", () => {
    const r = validateEstimate({ status: "nonsense", metrics: { "max stress": 42, unit: "MPa" }, recommendations: ["thicken the rim"], assumptions: ["6061 alloy"] });
    expect(r).toEqual({ status: "issue", metrics: { "max stress": "42", unit: "MPa" }, recommendations: ["thicken the rim"], assumptions: ["6061 alloy"] });
    expect(validateEstimate({ status: "pass" })).toBeNull();
    expect(validateEstimate("x")).toBeNull();
  });

  it("estimate: reads flat metrics when the model skips the metrics key", () => {
    const r = validateEstimate({ status: "pass", maxTemp: "61 °C", recommendations: [] });
    expect(r?.metrics).toEqual({ maxTemp: "61 °C" });
  });

  it("manufacturing: drops unlabeled checks, clamps enums, parses lead days", () => {
    const r = validateManufacturing({
      dfmChecks: [{ label: "wall thickness", status: "weird", detail: "ok" }, { detail: "no label" }],
      certifications: [{ name: "CE", required: "yes", status: "pass" }],
      timeline: [{ week: "w1", task: "tooling" }],
      sourcing: ["optical glass from a lens house"],
      totalCost: "$12 est.",
      maxLeadDays: "21.6",
    });
    expect(r?.dfmChecks).toEqual([{ label: "wall thickness", status: "warn", detail: "ok", cost: undefined, lead: undefined }]);
    expect(r?.certifications[0]).toEqual({ name: "CE", required: false, status: "pass" });
    expect(r?.timeline[0].status).toBe("pending");
    expect(r?.maxLeadDays).toBe(22);
    expect(validateManufacturing({ sourcing: ["x"] })).toBeNull();
  });

  it("proposals: clamps score, keeps only known metric keys, caps at six", () => {
    const designs = Array.from({ length: 8 }, (_, i) => ({ name: `v${i}`, score: 140, cost: { value: "$3", delta: "-10%" }, mystery: { value: "?" } }));
    const r = validateProposals({ designs });
    expect(r?.designs).toHaveLength(6);
    expect(r?.designs[0].score).toBe(100);
    expect(r?.designs[0].metrics).toEqual({ cost: { value: "$3", delta: "-10%" } });
    expect(validateProposals({ designs: [{ score: 3 }] })).toBeNull();
  });

  it("materials: needs at least one alert or substitution", () => {
    expect(validateMaterials({ assumptions: ["a"] })).toBeNull();
    const r = validateMaterials({ substitutions: [{ original: "abs", alternative: "pla", costDelta: "-5%", strengthDelta: "-20%", risk: "brittle" }, { original: "x" }] });
    expect(r?.substitutions).toHaveLength(1);
    expect(r?.failureAlerts).toEqual([]);
  });
});

describe("buildAnalysisPrompt", () => {
  it("carries the project record and the requested shape", () => {
    const p = buildAnalysisPrompt({ kind: "estimate", project, estimateType: "thermal" });
    expect(p).toContain("materials: glass");
    expect(p).toContain("components: ring");
    expect(p).toContain("thermal estimate");
    const m = buildAnalysisPrompt({ kind: "proposals", project, weights: { cost: 40, weight: 60 } });
    expect(m).toContain("cost 40%, weight 60%");
    const lib = buildAnalysisPrompt({ kind: "materials", materials: [{ name: "abs", category: "plastic", avg_cost: 2, top_use: "shells", failure_mode: "uv" }] });
    expect(lib).toContain("- abs (plastic; ~$2/kg; use: shells; known failure: uv)");
  });
});

describe("runAnalysis", () => {
  it("returns the validated shape from shepherd's json", async () => {
    vi.mocked(askModel).mockResolvedValueOnce('```json\n{"status":"pass","metrics":{"safety factor":"2.1"},"recommendations":[],"assumptions":["static load"]}\n```');
    const r = await runAnalysis({ kind: "estimate", project, estimateType: "structural" });
    expect(r.status).toBe("pass");
    expect(r.metrics["safety factor"]).toBe("2.1");
  });

  it("turns an unreadable answer into one readable sentence", async () => {
    vi.mocked(askModel).mockResolvedValueOnce("i cannot do that");
    await expect(runAnalysis({ kind: "manufacturing", project })).rejects.toThrow(ANALYSIS_UNREADABLE);
  });

  it("lets the model-key error through untouched", async () => {
    vi.mocked(askModel).mockRejectedValueOnce(new Error("connect a model key in settings → ai keys to start chatting."));
    await expect(runAnalysis({ kind: "materials", materials: [] })).rejects.toThrow(/connect a model key/);
  });
});
