import { rankTiles } from "../EagleEyeView";
import { describe, expect, it } from "vitest";
import { IouTracker, toEngineLandmarks } from "../detector";
import { applyColorized, applyEdge, applyLowLight, applyThermal, FILTER_MODES } from "../filters";
import { estimateProximityMeters, proximityBand, type BleLink } from "../cameras";
import { manifestFor, EVIDENCE_DISCLAIMER, type EvidenceRecord } from "../evidence";
import { ARVisionUtils } from "../engine";

// the filter maths is pure pixel work; node has no canvas, so a minimal
// ImageData stand-in lets it be tested without a browser.
if (typeof globalThis.ImageData === "undefined") {
  class ShimImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(a: Uint8ClampedArray | number, b: number, c?: number) {
      if (typeof a === "number") {
        this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4);
      } else {
        this.data = a; this.width = b; this.height = c ?? a.length / 4 / b;
      }
    }
  }
  (globalThis as unknown as { ImageData: unknown }).ImageData = ShimImageData;
}

const box = (x: number, y: number, w = 40, h = 90) => ({ x, y, width: w, height: h });

describe("iou tracker", () => {
  it("keeps a stable id while a person walks across the frame", () => {
    const t = new IouTracker();
    const a = t.step([box(100, 100)], 0);
    const b = t.step([box(112, 102)], 200);
    const c = t.step([box(126, 104)], 400);
    expect(a[0].trackId).toBe(b[0].trackId);
    expect(b[0].trackId).toBe(c[0].trackId);
    expect(c[0].speed).toBeGreaterThan(0);
  });

  it("issues distinct ids to two separated people", () => {
    const t = new IouTracker();
    const out = t.step([box(20, 20), box(600, 30)], 0);
    expect(new Set(out.map((o) => o.trackId)).size).toBe(2);
  });

  it("survives a short occlusion instead of minting a new identity", () => {
    const t = new IouTracker();
    const first = t.step([box(200, 100)], 0)[0].trackId;
    for (let i = 1; i <= 5; i++) t.step([], i * 100);
    const back = t.step([box(205, 100)], 700)[0].trackId;
    expect(back).toBe(first);
  });

  it("retires a track after the miss budget", () => {
    const t = new IouTracker();
    t.step([box(200, 100)], 0);
    for (let i = 1; i <= 20; i++) t.step([], i * 100);
    expect(t.size).toBe(0);
  });
});

describe("pose mapping", () => {
  const kp = (name: string, x: number, y: number, score = 0.9) => ({ name, x, y, score });

  it("returns undefined when no shoulder is confidently seen", () => {
    expect(toEngineLandmarks([kp("left_shoulder", 1, 1, 0.05), kp("right_shoulder", 2, 2, 0.02)])).toBeUndefined();
  });

  it("derives finger points along the forearm direction", () => {
    const lm = toEngineLandmarks([
      kp("left_shoulder", 100, 100), kp("right_shoulder", 140, 100),
      kp("left_elbow", 100, 140), kp("left_wrist", 100, 180),
    ])!;
    expect(lm).toBeDefined();
    expect(lm.leftIndex.y).toBeGreaterThan(lm.leftWrist.y);
    expect(lm.leftPinky.confidence).toBe(lm.leftWrist.confidence);
  });
});

function testImage(w = 8, h = 8): ImageData {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    d[i * 4] = (i * 7) % 256;
    d[i * 4 + 1] = (i * 13) % 256;
    d[i * 4 + 2] = (i * 3) % 256;
    d[i * 4 + 3] = 255;
  }
  return new ImageData(d, w, h);
}

describe("filters", () => {
  it("thermal preserves dimensions and returns opaque pixels", () => {
    const out = applyThermal(testImage());
    expect(out.width).toBe(8);
    expect(out.data[3]).toBe(255);
  });

  it("low light lifts a dark pixel rather than leaving it black", () => {
    const src = new ImageData(new Uint8ClampedArray([20, 20, 20, 255]), 1, 1);
    const out = applyLowLight(src);
    expect(out.data[1]).toBeGreaterThan(20);
  });

  it("edge trace returns a light field with dark boundaries", () => {
    const out = applyEdge(testImage());
    expect(out.data.length).toBe(8 * 8 * 4);
  });
});

describe("evidence manifest", () => {
  const record: EvidenceRecord = {
    recordId: "evd_1", eventId: "evt_1", cameraId: "cam", cameraLabel: "front door",
    trackId: "trk_1", tier: "high", score: 62, patterns: ["loitering"],
    reason: "dwell far above the baseline for this zone",
    context: {
      capturedAtMs: 0, isoUtc: "1970-01-01T00:00:00.000Z", isoLocal: "1970-01-01T00:00:00+00:00",
      timezone: "UTC", utcOffsetMinutes: 0, coords: null, coordsStatus: "denied",
      coordsSource: "location permission was refused for this site",
      ipAddress: null, ipStatus: "unavailable", ipSource: "unavailable",
    },
    variants: [{ key: "clean", label: "clean frame", note: "unmodified", dataUrl: "data:,", sha256: "abc" }],
    radio: [{
      id: "radio-1", name: "phone", connected: true, batteryPercent: 71, services: ["180f"],
      note: "presence only", manufacturer: "acme", model: "x1", firmware: "1.2", serial: null,
      appearance: null, rssi: -62, txPower: -59, proximityMeters: 1.4, advertising: true,
      firstSeenMs: 0, lastSeenMs: 1000,
    }],
    reviewState: "unreviewed", reviewNote: "", reviewedAtMs: null, createdAtMs: 0,
  };

  it("never claims an identity", () => {
    const m = manifestFor(record);
    expect(m.subjectIdentity).toMatch(/no identification/);
    expect(m.limitations).toBe(EVIDENCE_DISCLAIMER);
  });

  it("records refused location honestly instead of a zero coordinate", () => {
    const m = manifestFor(record);
    expect(m.capture.coordinates).toBeNull();
    expect(m.capture.coordinatesStatus).toBe("denied");
    expect(m.capture.ipAddress).toBeNull();
  });

  it("carries a hash for every file", () => {
    expect(manifestFor(record).files.every((f) => f.sha256.length > 0)).toBe(true);
  });

  it("prints the bluetooth radios in range without attributing them to a person", () => {
    const m = manifestFor(record);
    expect(m.radioContacts.devices).toHaveLength(1);
    expect(m.radioContacts.devices[0].manufacturer).toBe("acme");
    expect(m.radioContacts.devices[0].batteryPercent).toBe(71);
    expect(m.radioContacts.attribution).toMatch(/not evidence/);
    expect(m.limitations).toMatch(/presence in range is not proof/i);
  });
});

describe("bluetooth presence", () => {
  it("turns signal strength into a coarse distance and says so", () => {
    const near = estimateProximityMeters(-45, -59);
    const far = estimateProximityMeters(-90, -59);
    expect(near).not.toBeNull();
    expect(far).not.toBeNull();
    expect(far as number).toBeGreaterThan(near as number);
    expect(proximityBand(near)).toMatch(/arm's reach|same room/);
  });

  it("reports an unknown range instead of guessing one", () => {
    expect(estimateProximityMeters(null, null)).toBeNull();
    expect(proximityBand(null)).toMatch(/not reported/);
  });

  it("keeps the roster shape a caller can render", () => {
    const link: Partial<BleLink> = { id: "a", name: "b", rssi: null };
    expect(link.rssi).toBeNull();
  });
});

describe("colorized rendering", () => {
  it("is offered as its own view alongside clean", () => {
    expect(FILTER_MODES.map((f) => f.id)).toContain("colorized");
  });

  it("stretches a flat, dark frame into a legible range without inventing pixels", () => {
    const w = 4, h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const v = 40 + (i % 4) * 3;
      data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
    }
    const out = applyColorized(new ImageData(data, w, h));
    const before = Math.max(...Array.from({ length: w * h }, (_, i) => data[i * 4])) - Math.min(...Array.from({ length: w * h }, (_, i) => data[i * 4]));
    const after = Math.max(...Array.from({ length: w * h }, (_, i) => out.data[i * 4])) - Math.min(...Array.from({ length: w * h }, (_, i) => out.data[i * 4]));
    expect(after).toBeGreaterThan(before);
    expect(out.data.length).toBe(data.length);
  });

  it("leaves an already well-exposed neutral frame roughly where it was", () => {
    const src = new ImageData(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]), 2, 1);
    const out = applyColorized(src);
    expect(out.data[0]).toBeLessThan(20);
    expect(out.data[4]).toBeGreaterThan(235);
  });
});

describe("engine scoring stays reachable through the adapter", () => {
  it("maps a score to a tier", () => {
    expect(ARVisionUtils.scoreToTier(0, 0, 0)).toBe("observation");
    expect(ARVisionUtils.scoreToTier(0.9, 0, 1)).toBe("critical");
  });
});

describe("spectral filter parity with the optical hud", () => {
  it("is offered as a mode and repaints the frame", async () => {
    const { FILTER_MODES, applyFilter } = await import("../filters");
    expect(FILTER_MODES.map((m) => m.id)).toContain("spectral");
    const src = new ImageData(4, 4);
    for (let p = 0; p < src.data.length; p += 4) {
      src.data[p] = 200; src.data[p + 1] = 90; src.data[p + 2] = 70; src.data[p + 3] = 255;
    }
    const out = applyFilter(src, "spectral");
    expect(out.width).toBe(4);
    // a warm, tissue-like ratio must not come back as the untouched pixel
    expect([out.data[0], out.data[1], out.data[2]]).not.toEqual([200, 90, 70]);
  });
});

describe("thermal path", () => {
  it("names a thermal imager from its device label and not an ordinary webcam", async () => {
    const { looksThermal } = await import("../thermal");
    expect(looksThermal("FLIR ONE Pro")).toBe(true);
    expect(looksThermal("InfiRay P2 Pro Thermal")).toBe(true);
    expect(looksThermal("Integrated RGB Webcam")).toBe(false);
  });

  it("routes a monochrome sensor stream to the sensor path and a coloured one to the imager palette", async () => {
    const { frameStats, resolvePath } = await import("../thermal");
    const mono = new ImageData(8, 8);
    for (let p = 0; p < mono.data.length; p += 4) {
      const v = 30 + ((p / 4) % 200);
      mono.data[p] = v; mono.data[p + 1] = v; mono.data[p + 2] = v; mono.data[p + 3] = 255;
    }
    expect(resolvePath(true, frameStats(mono))).toBe("sensor");

    const colour = new ImageData(8, 8);
    for (let p = 0; p < colour.data.length; p += 4) {
      colour.data[p] = 240; colour.data[p + 1] = 40; colour.data[p + 2] = 10; colour.data[p + 3] = 255;
    }
    expect(resolvePath(true, frameStats(colour))).toBe("palettized");
    // an ordinary camera can never claim a sensor path
    expect(resolvePath(false, frameStats(mono))).toBe("estimate");
  });

  it("turns raw magnitude into celsius through the two references, and withholds numbers without them", async () => {
    const { rawToTemp, calibrationUsable, renderSensorThermal } = await import("../thermal");
    const cal = { rawLow: 50, tempLow: 20, rawHigh: 200, tempHigh: 35 };
    expect(calibrationUsable(cal)).toBe(true);
    expect(rawToTemp(50, cal)).toBe(20);
    expect(rawToTemp(200, cal)).toBe(35);
    expect(rawToTemp(125, cal)).toBe(27.5);
    expect(calibrationUsable({ rawLow: 100, tempLow: 20, rawHigh: 100, tempHigh: 35 })).toBe(false);

    const frame = new ImageData(4, 4);
    for (let p = 0; p < frame.data.length; p += 4) {
      frame.data[p] = 120; frame.data[p + 1] = 120; frame.data[p + 2] = 120; frame.data[p + 3] = 255;
    }
    expect(renderSensorThermal(frame, null).maxTemp).toBeNull();
    expect(renderSensorThermal(frame, cal).maxTemp).toBeCloseTo(27, 0);
  });
});

describe("camera wall ordering", () => {
  const tiles = [
    { deviceId: "a", status: "live" },
    { deviceId: "b", status: "live" },
    { deviceId: "c", status: "failed" },
    { deviceId: "d", status: "live" },
  ];

  it("floats the worst flagged camera to the top and keeps the rest running below", () => {
    const out = rankTiles(tiles, {
      b: { tier: "elevated", score: 40, at: 5 },
      d: { tier: "critical", score: 10, at: 1 },
    });
    expect(out.map((t) => t.deviceId)).toEqual(["d", "b", "a", "c"]);
  });

  it("breaks a tier tie on score, then on recency", () => {
    const out = rankTiles(tiles, {
      a: { tier: "high", score: 50, at: 9 },
      b: { tier: "high", score: 80, at: 1 },
      d: { tier: "high", score: 50, at: 99 },
    });
    expect(out.map((t) => t.deviceId)).toEqual(["b", "d", "a", "c"]);
  });

  it("drops an acknowledged camera out of the flagged band", () => {
    expect(rankTiles(tiles, {}).map((t) => t.deviceId)).toEqual(["a", "b", "d", "c"]);
  });
});

// ---------------------------------------------------------------------------
// passive radio observation — advertisements only, no connection anywhere
// ---------------------------------------------------------------------------
import {
  mergeSighting, motionFromHistory, radioFingerprint, readAdvertisement,
  pruneSightings, vendorForCompanyId, displayName, metersFromRssi,
} from "../radioScan";

describe("passive radio scan", () => {
  const adv = (over: Record<string, unknown> = {}) =>
    readAdvertisement({
      device: { id: "abc123", name: "Pixel 8" },
      rssi: -55,
      txPower: -12,
      uuids: ["0000180f-0000-1000-8000-00805f9b34fb"],
      manufacturerData: new Map([[0x00e0, new DataView(new ArrayBuffer(2))]]),
      ...over,
    } as never, 1_000);

  it("reads a name, id and vendor straight off the advertisement", () => {
    const r = adv();
    expect(r.id).toBe("abc123");
    expect(r.name).toBe("Pixel 8");
    expect(vendorForCompanyId(r.companyId)).toBe("Google");
  });

  it("names an unnamed radio by vendor rather than inventing one", () => {
    const s = mergeSighting(undefined, { ...adv({ device: { id: "x" }, name: null }), name: null });
    expect(displayName(s)).toContain("Google");
  });

  it("estimates a distance band from signal strength, never a fix", () => {
    expect(metersFromRssi(-59, -59)).toBe(1);
    expect(metersFromRssi(null, null)).toBeNull();
  });

  it("keeps one entry per radio and counts its packets", () => {
    let s = mergeSighting(undefined, adv());
    s = mergeSighting(s, adv({ rssi: -57 }));
    expect(s.packets).toBe(2);
    expect(s.firstSeenMs).toBe(1_000);
  });

  it("calls a flat signal set down, and a rising one closing", () => {
    expect(motionFromHistory([-60, -60, -61, -60, -60, -60])).toBe("stationary");
    expect(motionFromHistory([-80, -78, -70, -62, -58, -55])).toBe("approaching");
    expect(motionFromHistory([-55])).toBe("unknown");
  });

  it("gives matching published traits the same hint and different traits a different one", () => {
    const a = radioFingerprint({ name: "Pixel 8", companyId: 0x00e0, services: ["a", "b"], appearance: 1 });
    const b = radioFingerprint({ name: "Pixel 8", companyId: 0x00e0, services: ["b", "a"], appearance: 1 });
    const c = radioFingerprint({ name: "Tile", companyId: 0x01d7, services: [], appearance: null });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("ages a radio out when it stops advertising instead of holding it on screen", () => {
    const s = mergeSighting(undefined, adv());
    expect(pruneSightings([s], 1_000 + 10_000)).toHaveLength(1);
    expect(pruneSightings([s], 1_000 + 60_000)).toHaveLength(0);
  });
});
