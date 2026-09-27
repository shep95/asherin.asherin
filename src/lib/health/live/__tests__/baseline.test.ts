import { describe, it, expect } from "vitest";
import { computeRollingBaseline, compareToBaseline, compareSessionToBaseline, MIN_SESSIONS_FOR_BASELINE } from "../baseline";
import type { LiveSessionRecord } from "../../store";

function session(overrides: Partial<LiveSessionRecord>): LiveSessionRecord {
  return {
    id: overrides.id ?? "s",
    startedAt: overrides.startedAt ?? "2024-01-01T00:00:00.000Z",
    endedAt: overrides.endedAt ?? "2024-01-01T00:10:00.000Z",
    mode: overrides.mode ?? "focus",
    sources: overrides.sources ?? ["heart-rate"],
    metrics: overrides.metrics ?? {},
    baseline: overrides.baseline ?? {},
    events: overrides.events ?? [],
    summary: overrides.summary ?? "",
  };
}

describe("computeRollingBaseline", () => {
  it("returns null below the minimum session floor", () => {
    const prior = [session({ id: "1", metrics: { rmssd: 40 } }), session({ id: "2", metrics: { rmssd: 42 } })];
    expect(prior.length).toBeLessThan(MIN_SESSIONS_FOR_BASELINE);
    expect(computeRollingBaseline(prior, "focus", "rmssd")).toBeNull();
  });

  it("computes mean/stddev once the floor is met", () => {
    const prior = [
      session({ id: "1", metrics: { rmssd: 40 } }),
      session({ id: "2", metrics: { rmssd: 44 } }),
      session({ id: "3", metrics: { rmssd: 42 } }),
    ];
    const baseline = computeRollingBaseline(prior, "focus", "rmssd");
    expect(baseline).not.toBeNull();
    expect(baseline?.mean).toBeCloseTo(42, 5);
    expect(baseline?.sessionCount).toBe(3);
  });

  it("excludes the current session id and other modes", () => {
    const prior = [
      session({ id: "1", metrics: { rmssd: 40 } }),
      session({ id: "2", metrics: { rmssd: 44 } }),
      session({ id: "3", metrics: { rmssd: 42 } }),
      session({ id: "current", metrics: { rmssd: 999 } }),
      session({ id: "4", mode: "rest", metrics: { rmssd: 10 } }),
    ];
    const baseline = computeRollingBaseline(prior, "focus", "rmssd", "current");
    expect(baseline?.sessionCount).toBe(3);
    expect(baseline?.mean).toBeCloseTo(42, 5);
  });
});

describe("compareToBaseline", () => {
  const prior = [
    session({ id: "1", metrics: { rmssd: 40 } }),
    session({ id: "2", metrics: { rmssd: 44 } }),
    session({ id: "3", metrics: { rmssd: 42 } }),
  ];

  it("returns insufficient-history when there isn't enough prior data", () => {
    const current = session({ id: "current", metrics: { rmssd: 50 } });
    const result = compareToBaseline(current, [session({ id: "1", metrics: { rmssd: 40 } })], "rmssd");
    expect(result?.status).toBe("insufficient-history");
    expect(result?.baselineMean).toBeNull();
  });

  it("returns null when the session did not record the metric", () => {
    const current = session({ id: "current", metrics: {} });
    expect(compareToBaseline(current, prior, "rmssd")).toBeNull();
  });

  it("classifies within-baseline for small deviations", () => {
    const current = session({ id: "current", metrics: { rmssd: 42.5 } });
    const result = compareToBaseline(current, prior, "rmssd");
    expect(result?.status).toBe("within-baseline");
  });

  it("classifies above-baseline past the 0.75 sd threshold", () => {
    const current = session({ id: "current", metrics: { rmssd: 200 } });
    const result = compareToBaseline(current, prior, "rmssd");
    expect(result?.status).toBe("above-baseline");
    expect(result?.deltaSd).toBeGreaterThan(0.75);
  });

  it("classifies below-baseline past the -0.75 sd threshold", () => {
    const current = session({ id: "current", metrics: { rmssd: 0 } });
    const result = compareToBaseline(current, prior, "rmssd");
    expect(result?.status).toBe("below-baseline");
  });

  it("handles a flat baseline with zero stddev", () => {
    const flat = [
      session({ id: "1", metrics: { rmssd: 42 } }),
      session({ id: "2", metrics: { rmssd: 42 } }),
      session({ id: "3", metrics: { rmssd: 42 } }),
    ];
    const current = session({ id: "current", metrics: { rmssd: 42 } });
    const result = compareToBaseline(current, flat, "rmssd");
    expect(result?.status).toBe("within-baseline");
    expect(result?.deltaSd).toBe(0);
  });
});

describe("compareSessionToBaseline", () => {
  it("runs across every metric present on the finished session", () => {
    const prior = [
      session({ id: "1", metrics: { rmssd: 40, meanBpm: 60 } }),
      session({ id: "2", metrics: { rmssd: 44, meanBpm: 62 } }),
      session({ id: "3", metrics: { rmssd: 42, meanBpm: 61 } }),
    ];
    const current = session({ id: "current", metrics: { rmssd: 42, meanBpm: 61 } });
    const results = compareSessionToBaseline(current, prior);
    expect(results.map((r) => r.metric).sort()).toEqual(["meanBpm", "rmssd"]);
  });
});
