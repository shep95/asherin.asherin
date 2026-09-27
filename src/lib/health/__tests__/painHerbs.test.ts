import { describe, it, expect } from "vitest";
import { triggeredFlagsExtended, painPattern, type PainReport } from "@/lib/health/pain";
import { safetyReview } from "@/lib/health/herbs";
import { buildClinicalPackage, buildFamilyAtlas } from "@/lib/health/output/clinicalPackage";
import { EMPTY_RECORD, newId, type HealthRecord } from "@/lib/health/store";

function baseReport(overrides: Partial<PainReport> = {}): PainReport {
  return {
    id: newId("pain"),
    territoryKeys: [],
    answers: {},
    createdAt: new Date().toISOString(),
    points: [],
    modifiers: { worse: [], better: [] },
    ...overrides,
  };
}

function baseRecord(overrides: Partial<HealthRecord> = {}): HealthRecord {
  return { ...EMPTY_RECORD, ...overrides };
}

describe("red flags", () => {
  it("flags cauda equina from saddle numbness and bladder loss options", () => {
    const report = baseReport({ answers: { systemic: ["saddle-numbness", "bladder-loss"] } });
    const flags = triggeredFlagsExtended(report);
    expect(flags.some((f) => f.key === "cauda-equina")).toBe(true);
    expect(flags.find((f) => f.key === "cauda-equina")?.urgency).toBe("urgent");
  });

  it("flags a thunderclap headache from sudden onset plus severity 9+", () => {
    const report = baseReport({ answers: { onset: "sudden", severity: 9 } });
    const flags = triggeredFlagsExtended(report);
    expect(flags.some((f) => f.key === "thunderclap")).toBe(true);
  });

  it("catches testicular torsion from structured points rather than free text", () => {
    const report = baseReport({
      onset: "sudden",
      intensityWorst: 9,
      points: [{ id: newId("pt"), territoryKey: "testis", depth: "deep" }],
    });
    const flags = triggeredFlagsExtended(report);
    expect(flags.some((f) => f.key === "testicular-torsion")).toBe(true);
  });

  it("catches keyword-based flags from free text fields", () => {
    const report = baseReport({ modifiers: { worse: [], better: ["fainted before the pain started"] } });
    const flags = triggeredFlagsExtended(report);
    expect(flags.some((f) => f.key === "syncope-with-pain")).toBe(true);
  });

  it("does not raise a flag when nothing concerning is reported", () => {
    const report = baseReport({ answers: { onset: "days", severity: 3 } });
    expect(triggeredFlagsExtended(report)).toHaveLength(0);
  });
});

describe("painPattern ranking", () => {
  it("ranks nerve highest for burning pain radiating in a line", () => {
    const report = baseReport({
      character: ["burning"],
      radiation: [{ id: newId("rad"), fromTerritoryKey: "vertebra", toTerritoryKey: "knee", pattern: "dermatomal" }],
    });
    const ranked = painPattern(report);
    expect(ranked[0].tissue).toBe("nerve");
    expect(ranked[0].confidence).toBeGreaterThan(0);
    expect(ranked[0].wouldChangeWith.length).toBeGreaterThan(0);
  });

  it("ranks joint highest for sharp movement-dependent pain", () => {
    const report = baseReport({
      character: ["sharp-movement"],
      answers: { pattern: "movement" },
    });
    const ranked = painPattern(report);
    expect(ranked[0].tissue).toBe("joint");
  });

  it("falls back to unclear with no usable detail", () => {
    const report = baseReport();
    const ranked = painPattern(report);
    expect(ranked[0].tissue).toBe("unclear");
    expect(ranked[0].confidence).toBe(0);
  });
});

describe("safetyReview blocking", () => {
  it("blocks st john's wort for someone on an ssri due to a serotonergic contraindication match only when named", () => {
    const review = safetyReview(["st-johns-wort"], {
      medications: [{ name: "sertraline" }],
    });
    expect(review.cautions.length).toBeGreaterThan(0);
  });

  it("blocks ashwagandha in pregnancy", () => {
    const review = safetyReview(["ashwagandha"], { medications: [], pregnant: true });
    expect(review.blocking.some((w) => w.herb === "ashwagandha")).toBe(true);
  });

  it("blocks red yeast rice for someone already on a statin", () => {
    const review = safetyReview(["red-yeast-rice"], {
      medications: [{ name: "atorvastatin" }],
      conditions: ["existing statin therapy"],
    });
    expect(review.blocking.some((w) => w.herb === "red yeast rice")).toBe(true);
  });

  it("raises a caution rather than a block for a mild interaction", () => {
    const review = safetyReview(["turmeric"], { medications: [{ name: "warfarin" }] });
    expect(review.cautions.some((w) => w.herb === "turmeric")).toBe(true);
    expect(review.blocking).toHaveLength(0);
  });

  it("returns nothing for a herb with no matching medication or condition", () => {
    const review = safetyReview(["ginger"], { medications: [{ name: "lisinopril" }] });
    expect(review.blocking).toHaveLength(0);
    expect(review.cautions).toHaveLength(0);
  });
});

describe("clinical package assembly", () => {
  it("surfaces red flags first and states what is missing", () => {
    const report = baseReport({ partName: "lower back", answers: { systemic: ["saddle-numbness", "bladder-loss"] } });
    const record = baseRecord({ pain: [report] });
    const md = buildClinicalPackage(record);
    expect(md.indexOf("see a clinician about these first")).toBeLessThan(md.indexOf("### timeline"));
    expect(md).toMatch(/what is missing/);
  });

  it("lists medications, herbs and their interactions", () => {
    const record = baseRecord({
      medications: [{ id: newId("med"), name: "warfarin" }],
      herbs: ["turmeric"],
    });
    const md = buildClinicalPackage(record);
    expect(md).toMatch(/turmeric/);
    expect(md).toMatch(/warfarin/);
    expect(md).toMatch(/caution — /);
  });

  it("lists labs outside reference range", () => {
    const record = baseRecord({ labs: [{ key: "hemoglobin", value: 9 }] });
    const md = buildClinicalPackage(record);
    expect(md).toMatch(/haemoglobin/);
    expect(md).toMatch(/below range/);
  });

  it("honestly reports an empty record", () => {
    const md = buildClinicalPackage(EMPTY_RECORD);
    expect(md).toMatch(/nothing recorded here yet/);
  });

  it("builds a family atlas that flags clustered and early-onset conditions", () => {
    const record = baseRecord({
      family: [
        { id: newId("fam"), condition: "heart attack", relation: "parent", ageAtOnset: 48, territoryKeys: [] },
        { id: newId("fam"), condition: "heart attack", relation: "sibling", territoryKeys: [] },
      ],
    });
    const md = buildFamilyAtlas(record);
    expect(md).toMatch(/more than one relative/);
    expect(md).toMatch(/before age 55/);
  });

  it("is honest when there is no family history at all", () => {
    const md = buildFamilyAtlas(EMPTY_RECORD);
    expect(md).toMatch(/no family history has been recorded/);
  });
});
