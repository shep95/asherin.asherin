// Deterministic checks on the shared fabric's truth boundaries.
//
// These are not tests that the code runs. They are tests that the code REFUSES
// in the situations where refusing is the whole point: a radio that no evidence
// can attach to a person, a single receiver that cannot become a place, two
// sensors whose clocks disagree too much to call anything simultaneous, and a
// modality with nothing alive that must read unavailable rather than quiet.

import { describe, expect, it, beforeEach } from "vitest";
import { SensorFabric } from "../fabric";
import { provenance, syncWindowMs, skewOf, clockUntrusted, MAX_TRUSTED_SKEW_MS } from "../clock";
import { assertHumanLink, correlateRadioToTracks, correlateTemporal } from "../correlate";
import type {
  AudioEventObservation,
  FabricSensor,
  RadioRegionObservation,
  RadioSightingObservation,
  VisualTrackObservation,
} from "../types";

const T = 1_700_000_000_000;

const sensor = (over: Partial<FabricSensor> & Pick<FabricSensor, "id" | "modality">): FabricSensor => ({
  label: over.id,
  subsystem: "arvision",
  capabilities: [],
  limitations: [],
  authorization: "owned",
  health: "live",
  healthDetail: "",
  siteId: null,
  zoneId: null,
  lastObservationMs: null,
  spatiallyRegistered: false,
  ...over,
} as FabricSensor);

const mic = (atMs: number, zoneId: string | null, skewMs = 0): AudioEventObservation => ({
  id: `a_${atMs}`,
  type: "audio_event",
  modality: "audio",
  atMs,
  siteId: null,
  zoneId,
  zoneLabel: zoneId,
  channelId: "lane-1",
  tag: "impact — glass",
  durationMs: 400,
  evidence: { peakDb: -12 },
  confidence: { value: 0.6, basis: "classifier score" },
  summary: "impact — glass",
  provenance: provenance({
    sensorId: "mic-1",
    sensorLabel: "lobby microphone",
    subsystem: "sentinel",
    adapter: "sentinel/audio",
    kind: "model_inference",
    sourceClockMs: atMs + skewMs,
    receivedAtMs: atMs,
    note: "one lane heard this",
  }),
});

const track = (
  atMs: number,
  zoneId: string | null,
  worldPoint: { x: number; y: number; z: number } | null = null,
  id = `t_${atMs}`,
): VisualTrackObservation => ({
  id,
  type: "visual_track",
  modality: "vision",
  atMs,
  siteId: null,
  zoneId,
  zoneLabel: zoneId,
  cameraId: "cam-2",
  trackId: "track-a",
  box: { x: 0.1, y: 0.2, width: 0.1, height: 0.3 },
  worldPoint,
  trackState: "tracking",
  confidence: { value: 0.8, basis: "detector score" },
  summary: "one tracked shape",
  provenance: provenance({
    sensorId: "cam-2",
    sensorLabel: "west lobby camera",
    subsystem: "arvision",
    adapter: "arvision/vision",
    kind: "model_inference",
    sourceClockMs: atMs,
    receivedAtMs: atMs,
    note: "camera-local temporary track",
  }),
});

const region = (method: RadioRegionObservation["region"]["method"], centre: { x: number; y: number; z: number } | null, radiusM: number | null): RadioRegionObservation => ({
  id: "r_1",
  type: "radio_region",
  modality: "radio",
  atMs: T,
  siteId: null,
  zoneId: "lobby",
  zoneLabel: "lobby",
  deviceKey: "pseudo-1",
  handle: "radio-7f",
  region: { method, centre, radiusM, receiverIds: ["rx-a", "rx-b", "rx-c"], evidence: [], limitation: "region, not a point" },
  confidence: { value: null, basis: "no positioning service reported a quality figure" },
  summary: "radio-7f uncertainty region",
  provenance: provenance({
    sensorId: "rx-a",
    sensorLabel: "receiver a",
    subsystem: "arvision",
    adapter: "arvision/ble",
    kind: "derived_estimate",
    sourceClockMs: T,
    receivedAtMs: T,
    note: "solved from three receivers",
  }),
});

const sighting = (): RadioSightingObservation => ({
  id: "s_1",
  type: "radio_sighting",
  modality: "radio",
  atMs: T,
  siteId: null,
  zoneId: "lobby",
  zoneLabel: "lobby",
  receiverId: "rx-a",
  deviceKey: "pseudo-1",
  handle: "radio-7f",
  rssi: -54,
  estimatedRangeM: 4.2,
  addressRandomized: true,
  vendor: null,
  category: null,
  confidence: { value: null, basis: "rssi is not a distance measurement" },
  summary: "radio-7f heard at receiver a",
  provenance: provenance({
    sensorId: "rx-a",
    sensorLabel: "receiver a",
    subsystem: "arvision",
    adapter: "arvision/ble",
    kind: "raw_observation",
    sourceClockMs: T,
    receivedAtMs: T,
    note: "a broadcast packet, not a person",
  }),
});

describe("clock synchronization metadata", () => {
  it("keeps the source and receive clocks separate instead of correcting them", () => {
    const p = provenance({
      sensorId: "x",
      sensorLabel: "x",
      subsystem: "sentinel",
      adapter: "t",
      kind: "raw_observation",
      sourceClockMs: T + 900,
      receivedAtMs: T,
      note: "",
    });
    expect(p.clockSkewMs).toBe(900);
    expect(skewOf(null, T)).toBeNull();
  });

  it("widens the coincidence window by the skew that was actually measured", () => {
    const tight = provenance({ sensorId: "a", sensorLabel: "a", subsystem: "sentinel", adapter: "t", kind: "raw_observation", sourceClockMs: T, receivedAtMs: T, note: "" });
    const loose = provenance({ sensorId: "b", sensorLabel: "b", subsystem: "arvision", adapter: "t", kind: "raw_observation", sourceClockMs: T + 4_000, receivedAtMs: T, note: "" });
    expect(syncWindowMs(loose, tight)).toBeGreaterThan(syncWindowMs(tight, tight));
  });

  it("marks a wildly drifted clock as untrusted", () => {
    const bad = provenance({ sensorId: "b", sensorLabel: "b", subsystem: "arvision", adapter: "t", kind: "raw_observation", sourceClockMs: T + MAX_TRUSTED_SKEW_MS + 1, receivedAtMs: T, note: "" });
    expect(clockUntrusted(bad)).toBe(true);
  });
});

describe("temporal correlation", () => {
  it("links a sentinel sound and an arvision track that share a configured zone", () => {
    const out = correlateTemporal(mic(T, "lobby"), [track(T + 1_200, "lobby")]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("temporal_zone_coincidence");
    expect(out[0].attribution).toBe("not_attributed");
    expect(out[0].sensorIds).toContain("mic-1");
    expect(out[0].sensorIds).toContain("cam-2");
  });

  it("refuses to link when either side has no configured zone", () => {
    expect(correlateTemporal(mic(T, null), [track(T, "lobby")])).toHaveLength(0);
    expect(correlateTemporal(mic(T, "lobby"), [track(T, null)])).toHaveLength(0);
  });

  it("refuses to link across an untrusted clock", () => {
    expect(correlateTemporal(mic(T, "lobby", MAX_TRUSTED_SKEW_MS + 5_000), [track(T, "lobby")])).toHaveLength(0);
  });

  it("refuses to link observations far apart in time", () => {
    expect(correlateTemporal(mic(T, "lobby"), [track(T + 60_000, "lobby")])).toHaveLength(0);
  });
});

describe("radio never becomes a person", () => {
  it("draws no overlap for a single-receiver range", () => {
    expect(correlateRadioToTracks(region("single_receiver_range", null, 6), [track(T, "lobby", { x: 1, y: 1, z: 0 })])).toHaveLength(0);
  });

  it("draws no overlap when the camera has no world coordinates", () => {
    expect(correlateRadioToTracks(region("multilateration", { x: 1, y: 1, z: 0 }, 5), [track(T, "lobby", null)])).toHaveLength(0);
  });

  it("reports every candidate and chooses none when several tracks fit", () => {
    const tracks = [
      track(T, "lobby", { x: 1, y: 1, z: 0 }, "t1"),
      track(T, "lobby", { x: 1.5, y: 1, z: 0 }, "t2"),
      track(T, "lobby", { x: 2, y: 1, z: 0 }, "t3"),
    ];
    const out = correlateRadioToTracks(region("multilateration", { x: 1.5, y: 1, z: 0 }, 3), tracks);
    expect(out).toHaveLength(1);
    expect(out[0].candidateCount).toBe(3);
    expect(out[0].attribution).toBe("not_attributed");
  });

  it("attributes only when a named human asserts the link", () => {
    const link = assertHumanLink([sighting(), track(T, "lobby")], "operator 12ab", "badge handover witnessed at the desk");
    expect(link.attribution).toBe("human_asserted");
    expect(link.assertedBy).toBe("operator 12ab");
  });
});

describe("the fabric store", () => {
  let fabric: SensorFabric;
  beforeEach(() => {
    fabric = new SensorFabric();
  });

  it("reports a modality with no live sensor as unavailable, not quiet", () => {
    const snap = fabric.snapshot();
    expect(snap.unavailable.map((u) => u.modality)).toEqual(expect.arrayContaining(["vision", "radio", "audio", "location"]));
  });

  it("stops calling vision unavailable once a camera is live", () => {
    fabric.upsertSensor(sensor({ id: "cam-2", modality: "vision", health: "live" }));
    expect(fabric.snapshot().unavailable.map((u) => u.modality)).not.toContain("vision");
  });

  it("keeps both independent observations when only one modality is present", () => {
    fabric.upsertSensor(sensor({ id: "mic-1", modality: "audio", subsystem: "sentinel" }));
    fabric.publish(mic(T, "lobby"));
    const snap = fabric.snapshot();
    expect(snap.observations).toHaveLength(1);
    expect(snap.correlations).toHaveLength(0);
    expect(snap.unavailable.map((u) => u.modality)).toContain("vision");
  });

  it("correlates a sound and a track published through the store", () => {
    fabric.upsertSensor(sensor({ id: "mic-1", modality: "audio", subsystem: "sentinel" }));
    fabric.upsertSensor(sensor({ id: "cam-2", modality: "vision" }));
    fabric.publish(track(T, "lobby"));
    const drawn = fabric.publish(mic(T + 800, "lobby"));
    expect(drawn).toHaveLength(1);
    expect(drawn[0].attribution).toBe("not_attributed");
  });

  it("marks the publishing sensor live and records when it last spoke", () => {
    fabric.upsertSensor(sensor({ id: "rx-a", modality: "radio" }));
    fabric.publish(sighting());
    expect(fabric.sensor("rx-a")?.lastObservationMs).toBe(T);
  });

  it("never turns one receiver's rssi into a position", () => {
    fabric.upsertSensor(sensor({ id: "rx-a", modality: "radio" }));
    fabric.publish(sighting());
    const held = fabric.observationList()[0];
    expect(held.type).toBe("radio_sighting");
    expect(Object.keys(held)).not.toContain("worldPoint");
    expect(fabric.correlationList()).toHaveLength(0);
  });
});
