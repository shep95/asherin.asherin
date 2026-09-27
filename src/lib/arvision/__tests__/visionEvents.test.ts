// Deterministic tests for the camera event layer.
//
// Every scenario here is a scripted sequence of frames with fixed timestamps —
// no randomness, no wall clock, no camera. The point is that the same movement
// always produces the same event, and, just as importantly, that movement which
// only looks alarming produces nothing at all.

import { describe, expect, it, beforeEach } from "vitest";
import { VisionEventEngine } from "../vision/eventEngine";
import { newZone, pointInPolygon, segmentsIntersect, zoneActiveAt, type SafetyZone } from "../vision/zones";
import { toPoseSummary } from "../vision/adapt";
import type { VisionFrameInput, VisionTrackInput } from "../vision/types";

const W = 1000;
const H = 1000;
const T0 = 1_700_000_000_000;

/** An upright body: shoulders high, hips mid, ankles at the feet of the box. */
function uprightPose(box: { x: number; y: number; width: number; height: number }) {
  return {
    quality: 0.9,
    shoulderY: (box.y + box.height * 0.2) / H,
    hipY: (box.y + box.height * 0.55) / H,
    ankleY: (box.y + box.height * 0.98) / H,
    wrists: [
      { x: (box.x + 4) / W, y: (box.y + box.height * 0.5) / H, confidence: 0.8 },
      { x: (box.x + box.width - 4) / W, y: (box.y + box.height * 0.5) / H, confidence: 0.8 },
    ],
    usable: true,
  };
}

/** A body on the ground: the trunk is horizontal, so shoulders sit near ankles. */
function groundPose(box: { x: number; y: number; width: number; height: number }) {
  return {
    quality: 0.9,
    shoulderY: (box.y + box.height * 0.6) / H,
    hipY: (box.y + box.height * 0.7) / H,
    ankleY: (box.y + box.height * 0.8) / H,
    wrists: [
      { x: box.x / W, y: (box.y + box.height * 0.6) / H, confidence: 0.7 },
      { x: (box.x + box.width) / W, y: (box.y + box.height * 0.6) / H, confidence: 0.7 },
    ],
    usable: true,
  };
}

function person(
  trackId: string,
  x: number,
  y: number,
  opts: { width?: number; height?: number; speed?: number; onGround?: boolean } = {},
): VisionTrackInput {
  const box = { x, y, width: opts.width ?? 80, height: opts.height ?? 200 };
  return {
    trackId,
    box,
    speedPxPerSec: opts.speed ?? 0,
    pose: opts.onGround ? groundPose(box) : uprightPose(box),
  };
}

function frame(atMs: number, tracks: VisionTrackInput[], objects: VisionFrameInput["objects"] = []): VisionFrameInput {
  return { atMs, cameraId: "cam1", cameraLabel: "front door", frameWidth: W, frameHeight: H, tracks, objects };
}

/** Run a scripted sequence and return every event type that fired. */
function run(engine: VisionEventEngine, frames: VisionFrameInput[]): string[] {
  const fired: string[] = [];
  for (const f of frames) {
    const out = engine.step(f);
    for (const x of out.firings) fired.push(x.event.type);
  }
  return fired;
}

/** Warm the engine past its minimum track history without moving anything. */
function settle(engine: VisionEventEngine, tracks: VisionTrackInput[], startMs = T0, frames = 8) {
  for (let i = 0; i < frames; i += 1) engine.step(frame(startMs + i * 200, tracks));
  return startMs + frames * 200;
}

describe("zone geometry", () => {
  it("puts a point inside a polygon and keeps an outside point out", () => {
    const square = [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.8, y: 0.8 },
      { x: 0.2, y: 0.8 },
    ];
    expect(pointInPolygon({ x: 0.5, y: 0.5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 0.1, y: 0.5 }, square)).toBe(false);
  });

  it("does not call walking around the end of a barrier a crossing", () => {
    const a = { x: 0.4, y: 0.2 };
    const b = { x: 0.4, y: 0.5 };
    // path crosses the line's extension, but below the segment's end.
    expect(segmentsIntersect({ x: 0.2, y: 0.8 }, { x: 0.6, y: 0.8 }, a, b)).toBe(false);
    // path crosses the segment itself.
    expect(segmentsIntersect({ x: 0.2, y: 0.35 }, { x: 0.6, y: 0.35 }, a, b)).toBe(true);
  });

  it("honours a schedule that wraps past midnight", () => {
    const zone: SafetyZone = {
      ...newZone("cam1", "restricted", [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.9, y: 0.9 },
      ]),
      schedule: { days: [], startMinute: 22 * 60, endMinute: 6 * 60 },
    };
    const night = new Date(2024, 0, 1, 23, 30);
    const noon = new Date(2024, 0, 1, 12, 0);
    expect(zoneActiveAt(zone, night)).toBe(true);
    expect(zoneActiveAt(zone, noon)).toBe(false);
  });
});

describe("restricted zones", () => {
  const polygon = [
    { x: 0.6, y: 0.0 },
    { x: 1.0, y: 0.0 },
    { x: 1.0, y: 1.0 },
    { x: 0.6, y: 1.0 },
  ];

  let engine: VisionEventEngine;
  beforeEach(() => {
    engine = new VisionEventEngine();
  });

  it("reports entry only after the grace period has elapsed", () => {
    engine.setZones([{ ...newZone("cam1", "restricted", polygon), gracePeriodMs: 3000 }]);
    // outside first, so there is a history and a real crossing.
    let t = settle(engine, [person("t1", 100, 700)]);
    // step inside; grace has not elapsed yet.
    const early = run(engine, [1, 2].map((i) => frame(t + i * 500, [person("t1", 700, 700)])));
    expect(early).not.toContain("restricted_entry");
    // still inside past the grace period.
    const late = run(engine, [8, 10].map((i) => frame(t + i * 500, [person("t1", 700, 700)])));
    expect(late).toContain("restricted_entry");
  });

  it("stays silent for a track that never enters", () => {
    engine.setZones([newZone("cam1", "restricted", polygon)]);
    const t = settle(engine, [person("t1", 100, 700)]);
    const fired = run(engine, Array.from({ length: 20 }, (_, i) => frame(t + i * 500, [person("t1", 100 + i, 700)])));
    expect(fired).not.toContain("restricted_entry");
  });

  it("stays silent while the zone's schedule says it is inactive", () => {
    const now = new Date(T0);
    // a one-minute window that ended an hour ago, in local time.
    const past = (now.getHours() * 60 + now.getMinutes() - 120 + 1440) % 1440;
    engine.setZones([
      { ...newZone("cam1", "restricted", polygon), gracePeriodMs: 0, schedule: { days: [], startMinute: past, endMinute: past + 1 } },
    ]);
    const t = settle(engine, [person("t1", 100, 700)]);
    const fired = run(engine, Array.from({ length: 10 }, (_, i) => frame(t + i * 500, [person("t1", 700, 700)])));
    expect(fired).not.toContain("restricted_entry");
  });

  it("reports extended dwell against the zone's own threshold", () => {
    engine.setZones([{ ...newZone("cam1", "monitored", polygon), gracePeriodMs: 0, dwellThresholdMs: 5000 }]);
    let t = settle(engine, [person("t1", 700, 700)]);
    const fired = run(engine, Array.from({ length: 24 }, (_, i) => frame(t + i * 500, [person("t1", 700, 700)])));
    expect(fired).toContain("extended_dwell");
  });

  it("reports crowd formation only when the configured count is exceeded", () => {
    engine.setZones([{ ...newZone("cam1", "occupancy", polygon), gracePeriodMs: 0, occupancyThreshold: 4, dwellThresholdMs: 10 ** 7 }]);
    const three = [person("a", 650, 100), person("b", 700, 300), person("c", 750, 500)];
    const withThree = run(engine, Array.from({ length: 10 }, (_, i) => frame(T0 + i * 300, three)));
    expect(withThree).not.toContain("crowd_formation");
    const four = [...three, person("d", 800, 700)];
    const withFour = run(engine, Array.from({ length: 10 }, (_, i) => frame(T0 + 3000 + i * 300, four)));
    expect(withFour).toContain("crowd_formation");
  });
});

describe("barrier crossing", () => {
  it("reports a crossing of the drawn line and its measured value is one event", () => {
    const engine = new VisionEventEngine();
    engine.setZones([newZone("cam1", "barrier", [{ x: 0.5, y: 0.0 }, { x: 0.5, y: 1.0 }])]);
    const t = settle(engine, [person("t1", 100, 600)]);
    let fired: Array<{ type: string; value: number }> = [];
    for (const f of [frame(t + 500, [person("t1", 700, 600, { speed: 600 })])]) {
      for (const x of engine.step(f).firings) fired.push({ type: x.event.type, value: x.firing.value });
    }
    expect(fired.map((f) => f.type)).toContain("barrier_crossing");
    expect(fired.find((f) => f.type === "barrier_crossing")?.value).toBe(1);
  });

  it("does not report anyone who stays on one side", () => {
    const engine = new VisionEventEngine();
    engine.setZones([newZone("cam1", "barrier", [{ x: 0.5, y: 0.0 }, { x: 0.5, y: 1.0 }])]);
    const t = settle(engine, [person("t1", 100, 600)]);
    const fired = run(engine, Array.from({ length: 10 }, (_, i) => frame(t + i * 400, [person("t1", 100 + i * 10, 600)])));
    expect(fired).not.toContain("barrier_crossing");
  });
});

describe("object custody", () => {
  const bag = (x: number, y: number) => [{ objectId: "obj1", label: "backpack", box: { x, y, width: 60, height: 60 } }];

  it("reports an object left behind only after the configured dwell", () => {
    const engine = new VisionEventEngine({ abandonDwellMs: 5000 });
    // owner stands with the bag long enough to own it.
    let t = T0;
    for (let i = 0; i < 10; i += 1) engine.step(frame(t + i * 500, [person("t1", 100, 400)], bag(120, 560)));
    t += 5000;
    // owner walks away and stays away.
    const fired: string[] = [];
    for (let i = 0; i < 30; i += 1) {
      const out = engine.step(frame(t + i * 500, [person("t1", 100 + i * 40, 400)], bag(120, 560)));
      out.firings.forEach((f) => fired.push(f.event.type));
    }
    expect(fired).toContain("object_left");
  });

  it("does not report a bag whose owner stays beside it", () => {
    const engine = new VisionEventEngine({ abandonDwellMs: 5000 });
    const fired: string[] = [];
    for (let i = 0; i < 60; i += 1) {
      const out = engine.step(frame(T0 + i * 500, [person("t1", 100, 400)], bag(120, 560)));
      out.firings.forEach((f) => fired.push(f.event.type));
    }
    expect(fired).not.toContain("object_left");
  });

  it("distinguishes retrieval by the owner from retrieval by someone else", () => {
    const engine = new VisionEventEngine({ abandonDwellMs: 3000 });
    let t = T0;
    for (let i = 0; i < 10; i += 1) engine.step(frame(t + i * 400, [person("owner", 100, 400)], bag(120, 560)));
    t += 4000;
    for (let i = 0; i < 20; i += 1) engine.step(frame(t + i * 400, [person("owner", 900, 400)], bag(120, 560)));
    t += 8000;
    // a different track walks up to the bag.
    const types: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const out = engine.step(frame(t + i * 400, [person("owner", 900, 400), person("stranger", 110, 400)], bag(120, 560)));
      out.changed.forEach((e) => types.push(e.type));
    }
    expect(types).toContain("object_retrieved_different_track");
    expect(types).not.toContain("object_retrieved_same_track");
  });
});

describe("movement and posture", () => {
  it("reports sustained running in a walking-only zone and ignores a brief burst", () => {
    const engine = new VisionEventEngine({ runSustainMs: 1500 });
    engine.setZones([{ ...newZone("cam1", "walking_only", [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
    ]), gracePeriodMs: 0, dwellThresholdMs: 10 ** 7 }]);
    let t = settle(engine, [person("t1", 100, 400)]);

    const burst = run(engine, [frame(t + 300, [person("t1", 200, 400, { speed: 600 })])]);
    expect(burst).not.toContain("unusual_movement");

    const sustained = run(
      engine,
      Array.from({ length: 12 }, (_, i) => frame(t + 600 + i * 300, [person("t1", 200 + i * 180, 400, { speed: 600 })])),
    );
    expect(sustained).toContain("unusual_movement");
  });

  it("confirms a person on the ground only after the hold period", () => {
    const engine = new VisionEventEngine({ groundConfirmMs: 4000 });
    let t = settle(engine, [person("t1", 300, 300)]);
    const down = person("t1", 300, 780, { width: 200, height: 70, onGround: true });
    const early = run(engine, [frame(t + 500, [down]), frame(t + 1000, [down])]);
    expect(early).not.toContain("person_on_ground");
    const held = run(engine, Array.from({ length: 12 }, (_, i) => frame(t + 1500 + i * 500, [down])));
    expect(held).toContain("person_on_ground");
  });

  it("does not call a crouching upright person a fall", () => {
    const engine = new VisionEventEngine({ groundConfirmMs: 2000 });
    let t = settle(engine, [person("t1", 300, 300)]);
    const crouch = person("t1", 300, 700, { width: 80, height: 120 });
    const fired = run(engine, Array.from({ length: 20 }, (_, i) => frame(t + i * 500, [crouch])));
    expect(fired).not.toContain("person_on_ground");
  });

  it("reports prolonged close proximity between two tracks, not a brief pass", () => {
    const engine = new VisionEventEngine({ proximityDurationMs: 5000 });
    const apart = [person("a", 100, 400), person("b", 800, 400)];
    let t = settle(engine, apart);
    const passing = run(engine, [frame(t + 400, [person("a", 400, 400), person("b", 470, 400)])]);
    expect(passing).not.toContain("prolonged_proximity");
    // held close, but the gap between them keeps changing — the engine requires
    // measured movement, not two stationary shapes standing near each other.
    const held = run(
      engine,
      Array.from({ length: 24 }, (_, i) =>
        frame(t + 800 + i * 500, [person("a", 400, 400), person("b", i % 2 === 0 ? 460 : 520, 400)]),
      ),
    );
    expect(held).toContain("prolonged_proximity");
  });
});

describe("suppression and lifecycle", () => {
  it("keeps one event open rather than firing on every frame", () => {
    const engine = new VisionEventEngine();
    engine.setZones([{ ...newZone("cam1", "restricted", [
      { x: 0.5, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0.5, y: 1 },
    ]), gracePeriodMs: 0 }]);
    let t = settle(engine, [person("t1", 100, 400)]);
    const fired = run(engine, Array.from({ length: 40 }, (_, i) => frame(t + i * 400, [person("t1", 700, 400)])));
    expect(fired.filter((f) => f === "restricted_entry").length).toBe(1);
    expect(engine.activeEvents().filter((e) => e.type === "restricted_entry").length).toBe(1);
  });

  it("carries a measured value and a unit on every event it raises", () => {
    const engine = new VisionEventEngine({ groundConfirmMs: 2000 });
    let t = settle(engine, [person("t1", 300, 300)]);
    const down = person("t1", 300, 780, { width: 200, height: 70, onGround: true });
    for (let i = 0; i < 20; i += 1) engine.step(frame(t + i * 400, [down]));
    const ev = engine.allEvents().find((e) => e.type === "person_on_ground");
    expect(ev).toBeTruthy();
    expect(ev!.valueUnit).toBe("seconds");
    expect(ev!.value).toBeGreaterThan(0);
    expect(ev!.evidence.length).toBeGreaterThan(0);
  });

  it("resets to a clean state", () => {
    const engine = new VisionEventEngine();
    settle(engine, [person("t1", 100, 400)]);
    engine.reset();
    expect(engine.activeEvents()).toEqual([]);
    expect(engine.custody()).toEqual([]);
  });
});

describe("pose translation", () => {
  it("returns nothing when there are no landmarks", () => {
    expect(toPoseSummary(undefined, W, H)).toBeNull();
  });

  it("marks a low-confidence skeleton unusable rather than guessing", () => {
    const weak = {
      leftShoulder: { x: 10, y: 10, confidence: 0.05 },
      rightShoulder: { x: 20, y: 10, confidence: 0.05 },
      leftHip: { x: 10, y: 50, confidence: 0.05 },
      rightHip: { x: 20, y: 50, confidence: 0.05 },
      leftAnkle: { x: 10, y: 90, confidence: 0.05 },
      rightAnkle: { x: 20, y: 90, confidence: 0.05 },
      leftWrist: { x: 5, y: 40, confidence: 0.05 },
      rightWrist: { x: 25, y: 40, confidence: 0.05 },
    } as never;
    const summary = toPoseSummary(weak, W, H);
    expect(summary?.usable).toBe(false);
  });
});

describe("restricted zone exit", () => {
  const polygon = [
    { x: 0.6, y: 0.0 },
    { x: 1.0, y: 0.0 },
    { x: 1.0, y: 1.0 },
    { x: 0.6, y: 1.0 },
  ];

  it("closes the entry event and records an exit when the foot point leaves the polygon", () => {
    const engine = new VisionEventEngine();
    engine.setZones([{ ...newZone("cam1", "restricted", polygon), gracePeriodMs: 0 }]);
    let t = settle(engine, [person("t1", 100, 700)]);
    const inside = run(engine, Array.from({ length: 8 }, (_, i) => frame(t + i * 500, [person("t1", 700, 700)])));
    expect(inside).toContain("restricted_entry");
    t += 4000;

    const types: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const out = engine.step(frame(t + i * 500, [person("t1", 100, 700)]));
      out.changed.forEach((e) => types.push(e.type));
    }
    expect(types).toContain("restricted_exit");
    expect(engine.activeEvents().filter((e) => e.type === "restricted_entry").length).toBe(0);
  });

  it("does not report an exit for a track that never entered", () => {
    const engine = new VisionEventEngine();
    engine.setZones([{ ...newZone("cam1", "restricted", polygon), gracePeriodMs: 0 }]);
    const t = settle(engine, [person("t1", 100, 700)]);
    const fired = run(engine, Array.from({ length: 10 }, (_, i) => frame(t + i * 500, [person("t1", 100 + i, 700)])));
    expect(fired).not.toContain("restricted_exit");
  });
});

describe("retrieval after track loss", () => {
  const bag = (x: number, y: number) => [{ objectId: "obj1", label: "backpack", box: { x, y, width: 60, height: 60 } }];

  it("records the retriever association as unknown once the associated track was dropped", () => {
    const engine = new VisionEventEngine({ abandonDwellMs: 3000 });
    let t = T0;
    for (let i = 0; i < 10; i += 1) engine.step(frame(t + i * 400, [person("owner", 100, 400)], bag(120, 560)));
    t += 4000;
    // the owner leaves the frame entirely — every frame below has no tracks at
    // all, so the tracker drops it and continuity is gone.
    for (let i = 0; i < 20; i += 1) engine.step(frame(t + i * 400, [], bag(120, 560)));
    t += 8000;

    const types: string[] = [];
    let detail = "";
    for (let i = 0; i < 10; i += 1) {
      const out = engine.step(frame(t + i * 400, [person("later", 110, 400)], bag(120, 560)));
      out.changed.forEach((e) => {
        types.push(e.type);
        if (e.type === "object_retrieved_association_unknown") detail = e.detail;
      });
    }
    expect(types).toContain("object_retrieved_association_unknown");
    expect(types).not.toContain("object_retrieved_different_track");
    expect(detail).toContain("unknown");
    // once someone is standing with it again the object is attended, but the
    // association is still not something the engine can assert.
    const record = engine.custody().find((c) => c.objectId === "obj1");
    expect(record?.present).toBe(true);
    expect(record?.associationCertain).toBe(false);
  });
});
