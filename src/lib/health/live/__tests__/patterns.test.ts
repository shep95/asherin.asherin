import { describe, it, expect } from "vitest";
import { perModeTrend, dayOfWeekPattern, timeOfDayPattern, driftVsBaseline, MIN_SESSIONS_FOR_PATTERN } from "../patterns";
import type { LiveSessionRecord } from "../../store";

function session(id: string, startedAt: string, rmssd: number): LiveSessionRecord {
  return {
    id,
    startedAt,
    endedAt: startedAt,
    mode: "focus",
    sources: ["heart-rate"],
    metrics: { rmssd },
    baseline: {},
    events: [],
    summary: "",
  };
}

describe("perModeTrend", () => {
  it("gates below the session floor", () => {
    const sessions = [session("1", "2024-01-01", 40), session("2", "2024-01-02", 41)];
    const trend = perModeTrend(sessions, "focus", "rmssd");
    expect(trend?.direction).toBe("insufficient-data");
    expect(trend?.sessionCount).toBeLessThan(MIN_SESSIONS_FOR_PATTERN);
  });

  it("detects a rising trend once the floor is met", () => {
    const sessions = [
      session("1", "2024-01-01", 30),
      session("2", "2024-01-02", 30),
      session("3", "2024-01-03", 30),
      session("4", "2024-01-04", 60),
      session("5", "2024-01-05", 60),
    ];
    const trend = perModeTrend(sessions, "focus", "rmssd");
    expect(trend?.direction).toBe("rising");
  });

  it("detects flat when change is under 5%", () => {
    const sessions = [
      session("1", "2024-01-01", 40),
      session("2", "2024-01-02", 40),
      session("3", "2024-01-03", 40.5),
      session("4", "2024-01-04", 40.2),
      session("5", "2024-01-05", 40.1),
    ];
    const trend = perModeTrend(sessions, "focus", "rmssd");
    expect(trend?.direction).toBe("flat");
  });
});

describe("dayOfWeekPattern / timeOfDayPattern", () => {
  it("refuses to claim a pattern below the floor", () => {
    const sessions = [session("1", "2024-01-01T08:00:00.000Z", 40), session("2", "2024-01-02T08:00:00.000Z", 41)];
    const day = dayOfWeekPattern(sessions, "focus", "rmssd");
    const time = timeOfDayPattern(sessions, "focus", "rmssd");
    expect(day.sufficient).toBe(false);
    expect(day.buckets).toEqual([]);
    expect(time.sufficient).toBe(false);
    expect(time.buckets).toEqual([]);
  });

  it("buckets once the floor is met", () => {
    const sessions = Array.from({ length: 5 }, (_, i) => session(String(i), `2024-01-0${i + 1}T08:00:00.000Z`, 40 + i));
    const day = dayOfWeekPattern(sessions, "focus", "rmssd");
    const time = timeOfDayPattern(sessions, "focus", "rmssd");
    expect(day.sufficient).toBe(true);
    expect(day.buckets.length).toBe(7);
    expect(time.sufficient).toBe(true);
    expect(time.buckets.length).toBe(4);
  });
});

describe("driftVsBaseline", () => {
  it("is insufficient below the floor", () => {
    const sessions = [session("1", "2024-01-01", 40), session("2", "2024-01-02", 41)];
    const drift = driftVsBaseline(sessions, "focus", "rmssd");
    expect(drift.sufficient).toBe(false);
    expect(drift.drift).toBeNull();
  });

  it("computes drift of the latest session vs prior baseline once sufficient", () => {
    const sessions = [
      session("1", "2024-01-01", 40),
      session("2", "2024-01-02", 40),
      session("3", "2024-01-03", 40),
      session("4", "2024-01-04", 40),
      session("5", "2024-01-05", 60),
    ];
    const drift = driftVsBaseline(sessions, "focus", "rmssd");
    expect(drift.sufficient).toBe(true);
    expect(drift.baselineMean).toBeCloseTo(40, 5);
    expect(drift.drift).toBeCloseTo(20, 5);
  });

  it("reports the metric as missing when the latest session lacks it", () => {
    const sessions = [
      session("1", "2024-01-01", 40),
      session("2", "2024-01-02", 40),
      session("3", "2024-01-03", 40),
      session("4", "2024-01-04", 40),
      { ...session("5", "2024-01-05", 0), metrics: {} },
    ];
    const drift = driftVsBaseline(sessions, "focus", "rmssd");
    expect(drift.sufficient).toBe(false);
    expect(drift.detail).toContain("did not record");
  });
});
