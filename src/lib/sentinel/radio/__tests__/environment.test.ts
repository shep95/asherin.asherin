import { describe, expect, it } from "vitest";
import {
  advertFingerprint,
  classifyDevice,
  isRandomizedMac,
  rssiToDistance,
  scoreLeakRisk,
  type AdvertPacket,
} from "../leakSurface";
import { BluetoothEnvironment } from "../environment";
import { bestFix, haversineMeters, movementBetween, trilaterateBeacons, type LocationFix } from "@/lib/sentinel/location/geo";
import { attachFix, buildTrail, conflictingFixes } from "@/lib/sentinel/location/trackers";

function packet(over: Partial<AdvertPacket> = {}): AdvertPacket {
  return {
    address: "aa:bb:cc:dd:ee:ff",
    addressIsHardware: true,
    name: null,
    rssi: -70,
    txPower: -59,
    serviceUuids: [],
    manufacturerData: {},
    appearance: null,
    at: 1_000,
    ...over,
  };
}

describe("bluetooth leak surface", () => {
  it("reads address randomization from the locally-administered bit", () => {
    expect(isRandomizedMac("4a:00:00:00:00:01")).toBe(true);
    expect(isRandomizedMac("a8:00:00:00:00:01")).toBe(false);
  });

  it("refuses to judge randomization on a browser session handle", () => {
    expect(isRandomizedMac("some-session-id", false)).toBeNull();
  });

  it("classifies a medical service and scores it high", () => {
    const p = packet({ serviceUuids: ["0000181f-0000-1000-8000-00805f9b34fb"], name: "Dexcom GL" });
    const c = classifyDevice(p);
    expect(c.isMedical).toBe(true);
    const score = scoreLeakRisk(p, c);
    expect(score.riskLevel === "high" || score.riskLevel === "critical").toBe(true);
    expect(score.recommendations.join(" ")).toContain("health device");
  });

  it("keeps the fingerprint stable while the address rotates", () => {
    const a = packet({ address: "4a:11:22:33:44:55", name: "Pixel Buds", manufacturerData: { 0x00e0: [1, 2, 3, 4] } });
    const b = packet({ address: "5e:99:88:77:66:55", name: "Pixel Buds", manufacturerData: { 0x00e0: [1, 2, 3, 4] } });
    expect(advertFingerprint(a)).toBe(advertFingerprint(b));
  });

  it("flags a permanent address as the highest-weight factor", () => {
    const p = packet({ address: "a8:11:22:33:44:55", name: "Asher's iPhone", manufacturerData: { 0x004c: [9, 9] } });
    const score = scoreLeakRisk(p, classifyDevice(p));
    expect(score.factors.some((f) => f.factor === "persistent hardware address")).toBe(true);
    expect(score.totalScore).toBeGreaterThanOrEqual(70);
    expect(score.riskLevel).toBe("critical");
  });

  it("turns rssi into a plausible distance band", () => {
    expect(rssiToDistance(-59)).toBeCloseTo(1, 1);
    expect(rssiToDistance(-90)).toBeGreaterThan(10);
  });
});

describe("environment ledger", () => {
  it("records arrival, departure and return without inventing continuity", () => {
    const seen: string[] = [];
    const ledger = new BluetoothEnvironment({ departAfterMs: 10_000, onEvent: (e) => seen.push(e.kind) });
    ledger.observe(packet({ at: 1_000 }));
    ledger.observe(packet({ at: 3_000 }));
    ledger.sweep(20_000);
    ledger.observe(packet({ at: 21_000 }));
    expect(seen).toEqual(["arrived", "departed", "returned"]);
    expect(ledger.list()[0].visits).toBe(2);
  });

  it("keys rotating session handles by fingerprint so one device is one row", () => {
    const ledger = new BluetoothEnvironment();
    ledger.observe(packet({ address: "s1", addressIsHardware: false, name: "Watch", at: 1_000 }));
    ledger.observe(packet({ address: "s2", addressIsHardware: false, name: "Watch", at: 2_000 }));
    expect(ledger.list()).toHaveLength(1);
  });
});

describe("location honesty", () => {
  const fix = (over: Partial<LocationFix>): LocationFix => ({
    lat: 51.5007,
    lon: -0.1246,
    accuracyM: 10,
    altitudeM: null,
    altitudeAccuracyM: null,
    headingDeg: null,
    speedMps: null,
    source: "gps",
    at: 0,
    note: "",
    ...over,
  });

  it("does not call noise movement", () => {
    const a = fix({ accuracyM: 3000, source: "ip", at: 0 });
    const b = fix({ lat: 51.5011, accuracyM: 3000, source: "ip", at: 60_000 });
    expect(movementBetween(a, b).state).toBe("stationary");
  });

  it("reads a real walk as walking", () => {
    const a = fix({ at: 0 });
    const b = fix({ lat: 51.5016, at: 100_000 });
    const m = movementBetween(a, b);
    expect(m.metres).toBeGreaterThan(80);
    expect(m.state).toBe("walking");
  });

  it("prefers the tighter fix", () => {
    const best = bestFix([fix({ accuracyM: 5000, source: "ip" }), fix({ accuracyM: 8 })]);
    expect(best?.accuracyM).toBe(8);
  });

  it("surfaces two fixes that cannot both be true", () => {
    const clashes = conflictingFixes([fix({}), fix({ lat: 40.7, lon: -74, source: "ip", accuracyM: 5000 })]);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].metres).toBeGreaterThan(5_000_000);
  });

  it("weights beacon anchors and reports honest spread", () => {
    const out = trilaterateBeacons([
      { lat: 51.5, lon: -0.12, meters: 5, label: "desk" },
      { lat: 51.5005, lon: -0.12, meters: 30, label: "hall" },
    ]);
    expect(out?.source).toBe("beacon");
    expect(out!.accuracyM).toBeGreaterThan(10);
  });

  it("refuses to staple a stale fix onto a fresh sighting", () => {
    const s = attachFix({ key: "k", label: "radio", at: 500_000, rssi: -60, meters: 2 }, fix({ at: 0 }), "somewhere");
    expect(s.fix).toBeNull();
    expect(s.place).toBeNull();
  });

  it("only claims 'follows you' with two separate places", () => {
    const near = attachFix({ key: "k", label: "tag", at: 1_000, rssi: -60, meters: 2 }, fix({ at: 1_000 }), "london");
    const far = attachFix({ key: "k", label: "tag", at: 2_000, rssi: -60, meters: 2 }, fix({ lat: 48.85, lon: 2.35, at: 2_000 }), "paris");
    expect(buildTrail("k", "tag", [near]).followsYou).toBe(false);
    const trail = buildTrail("k", "tag", [near, far]);
    expect(trail.followsYou).toBe(true);
    expect(haversineMeters(trail.places[0], trail.places[1])).toBeGreaterThan(300_000);
  });
});
