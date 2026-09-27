import { describe, expect, it } from "vitest";
import { computeHrv, analyseEegChannel, detectEegArtefact, EEG_BAND_RANGES } from "../analysis";
import { LiveSession } from "../session";

describe("hrv", () => {
  it("returns null metrics with too few beats", () => {
    const r = computeHrv([800, 810]);
    expect(r.rmssd).toBeNull();
    expect(r.confidence).toBe(0);
  });
  it("computes rmssd/sdnn on a plausible rr series", () => {
    const rr = Array.from({ length: 40 }, (_, i) => 800 + 20 * Math.sin(i / 3));
    const r = computeHrv(rr);
    expect(r.rmssd).not.toBeNull();
    expect(r.sdnn).not.toBeNull();
    expect(r.beats).toBe(40);
    expect(r.confidence).toBeGreaterThan(0);
  });
  it("computes lf/hf once beat count is sufficient", () => {
    const rr = Array.from({ length: 60 }, (_, i) => 800 + 30 * Math.sin(i / 5));
    const r = computeHrv(rr);
    expect(r.lfHfRatio).not.toBeNull();
  });
});

describe("eeg", () => {
  it("flags amplitude artefacts", () => {
    expect(detectEegArtefact([10, 15, 400, 12])).toBe(true);
    expect(detectEegArtefact([10, 12, 11, 9])).toBe(false);
  });
  it("extracts band power on a synthetic alpha-dominant window", () => {
    const rate = 256;
    const samples = Array.from({ length: 256 }, (_, i) => 20 * Math.sin((2 * Math.PI * 10 * i) / rate));
    const result = analyseEegChannel("TP9", samples, rate);
    expect(result.artefact).toBe(false);
    expect(result.bandPower.alpha).toBeGreaterThan(0);
    expect(Object.keys(EEG_BAND_RANGES)).toEqual(["delta", "theta", "alpha", "beta", "gamma"]);
  });
});

describe("session finalisation", () => {
  it("reports no sources when nothing was captured", () => {
    const session = new LiveSession();
    session.beginContactCheck("open");
    session.start();
    const record = session.finaliseSession();
    expect(record.sources.length).toBe(0);
    expect(record.summary).toContain("no device");
  });
  it("finalises with real pushed heart data", () => {
    const session = new LiveSession();
    session.beginContactCheck("focus");
    session.start();
    for (let i = 0; i < 10; i++) session.pushHeart(70 + i, [800, 810, 790, 805]);
    const record = session.finaliseSession();
    expect(record.sources).toContain("heart-rate");
    expect(record.metrics.meanBpm).toBeDefined();
    expect(record.mode).toBe("focus");
  });
});
