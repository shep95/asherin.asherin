import { describe, it, expect } from "vitest";
import { EMPTY_RECORD, type HealthRecord } from "../../store";
import { computeInflammation } from "../inflammation";
import { propagate } from "../interdependency";
import { buildCausalChains, reverseSymptomMap } from "../causal";
import { snapshotRecord, compareSnapshots, buildTimeline } from "../../temporal/timeline";
import { buildTrajectories, whatIf } from "../../temporal/trajectory";

function baseRecord(overrides: Partial<HealthRecord> = {}): HealthRecord {
  return { ...EMPTY_RECORD, ...overrides };
}

describe("inflammation propagation", () => {
  it("returns nothing when the record is empty", () => {
    const { territories, findings } = computeInflammation(baseRecord());
    expect(territories).toHaveLength(0);
    expect(findings).toHaveLength(0);
  });

  it("raises liver/peripheral-arteries/lymph-nodes load from an elevated crp", () => {
    const record = baseRecord({ labs: [{ key: "crp", value: 12 }] });
    const { territories, findings } = computeInflammation(record);
    expect(territories.some((t) => t.territoryKey === "liver")).toBe(true);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].detail).toContain("c-reactive protein");
  });

  it("combines multiple inputs on the same territory and raises confidence", () => {
    const record = baseRecord({
      labs: [{ key: "crp", value: 15 }],
      symptoms: [{ id: "s1", symptomKey: "joint-stiffness", severity: 7 }],
    });
    const { territories } = computeInflammation(record);
    expect(territories.length).toBeGreaterThan(0);
    expect(territories[0].confidence).toBeGreaterThan(0.2);
  });
});

describe("interdependency propagation", () => {
  it("propagates from adrenal outward with decaying strength", () => {
    const result = propagate(["adrenal"]);
    const seed = result.find((r) => r.nodeId === "adrenal");
    expect(seed?.distance).toBe(0);
    const heart = result.find((r) => r.nodeId === "heart");
    expect(heart).toBeDefined();
    expect(heart!.strength).toBeLessThan(1);
  });

  it("returns nothing for an unmapped territory", () => {
    expect(propagate(["not-a-real-territory"])).toHaveLength(0);
  });
});

describe("causal chains", () => {
  it("builds a direct chain when a lab maps straight onto the seed territory", () => {
    const record = baseRecord({ labs: [{ key: "crp", value: 20 }] });
    const chains = buildCausalChains(record, "liver");
    expect(chains.length).toBeGreaterThan(0);
    expect(chains[0].steps[0].label).toContain("c-reactive protein");
    expect(chains[0].conclusion).toContain("liver");
  });

  it("builds a mediated chain through the interdependency network", () => {
    const record = baseRecord({
      exposures: [{ id: "e1", exposureKey: "shift-work", intensity: "current-high" }],
    });
    const chains = buildCausalChains(record, "adrenal");
    expect(chains.some((c) => c.steps.length >= 1)).toBe(true);
  });

  it("returns an empty array with no supporting record data", () => {
    expect(buildCausalChains(baseRecord(), "heart")).toHaveLength(0);
  });

  it("reverse-maps a symptom to its reference territories and ranks by support", () => {
    const record = baseRecord({ labs: [{ key: "crp", value: 10 }] });
    const { candidates, note } = reverseSymptomMap("fatigue", record);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]).toHaveProperty("likelihood");
    expect(typeof note).toBe("string");
  });

  it("says a symptom outside the reference set has no candidates", () => {
    const { candidates, note } = reverseSymptomMap("not-a-symptom", baseRecord());
    expect(candidates).toHaveLength(0);
    expect(note).toContain("not in the reference set");
  });
});

describe("timeline and snapshot diffing", () => {
  it("orders dated elements chronologically", () => {
    const record = baseRecord({
      pain: [{ id: "p1", territoryKeys: ["knee"], answers: { severity: 4 }, createdAt: "2024-01-01T00:00:00.000Z" }],
      surgeries: [{ id: "su1", label: "appendicectomy", year: 2020, territoryKeys: ["colon"] }],
    });
    const events = buildTimeline(record);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(new Date(events[0].at).getTime()).toBeLessThanOrEqual(new Date(events[events.length - 1].at).getTime());
  });

  it("diffs two snapshots: added, resolved, worsened, improved", () => {
    const before = baseRecord({ labs: [{ key: "crp", value: 15 }] });
    const snapA = snapshotRecord(before, "before");
    const after = baseRecord({
      labs: [{ key: "crp", value: 25 }],
      symptoms: [{ id: "s1", symptomKey: "fatigue", severity: 6 }],
    });
    const snapB = snapshotRecord(after, "after");
    const diff = compareSnapshots(snapA, snapB);
    expect(diff.added.length).toBeGreaterThan(0);
    expect(diff.metricChanges.some((m) => m.key === "symptoms")).toBe(true);
  });

  it("shows a resolved finding when a symptom is removed", () => {
    const before = baseRecord({ symptoms: [{ id: "s1", symptomKey: "fatigue", severity: 8 }] });
    const snapA = snapshotRecord(before, "before");
    const snapB = snapshotRecord(baseRecord(), "after");
    const diff = compareSnapshots(snapA, snapB);
    expect(diff.resolved.length).toBeGreaterThan(0);
  });
});

describe("trajectory projection", () => {
  it("produces no projections without enough history", () => {
    expect(buildTrajectories(baseRecord())).toHaveLength(0);
  });

  it("projects a wearable trend across 3/6/12 months with a widening band", () => {
    const record = baseRecord({
      wearables: [
        {
          id: "w1",
          kind: "hrv",
          source: "test",
          unit: "ms",
          importedAt: new Date().toISOString(),
          points: [
            { t: "2024-01-01T00:00:00.000Z", v: 60 },
            { t: "2024-01-08T00:00:00.000Z", v: 58 },
            { t: "2024-01-15T00:00:00.000Z", v: 55 },
            { t: "2024-01-22T00:00:00.000Z", v: 52 },
            { t: "2024-01-29T00:00:00.000Z", v: 50 },
          ],
        },
      ],
    });
    const trajectories = buildTrajectories(record);
    expect(trajectories.length).toBe(1);
    const [p3, p6, p12] = trajectories[0].points;
    expect(p12.high - p12.low).toBeGreaterThanOrEqual(p3.high - p3.low);
    expect(trajectories[0].direction).toBe("falling");
  });

  it("returns modelled directions from whatIf without touching the record", () => {
    const { estimates, caveat } = whatIf({ sleepHours: 5, smokingStopped: true, alcoholUnits: 20 });
    expect(estimates.length).toBe(3);
    expect(estimates.every((e) => e.direction)).toBe(true);
    expect(caveat).toContain("not a prediction");
  });
});
