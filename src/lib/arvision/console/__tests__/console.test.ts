import { describe, expect, it } from "vitest";
import {
  buildCameraRows, buildSiteTree, capabilityBadges, consoleSummary, isEdgeOnly,
} from "../inventory";
import { applyFilter, canTransition, deviceIdOf, sortQueue, toQueueItems, transition, trackIdOf } from "../queue";
import { buildWindow, evidenceForIncident, intervalForIncident, markersFor } from "../timeline";
import type { EvidenceFrameRef } from "../timeline";
import type { QueueItem } from "../types";
import type { AuthorizedDevice, SensorDescriptor, ServiceHealth, SiteZone } from "../../sensors/types";
import type { Incident } from "../../safety/incidents";
import { isForbiddenSignal } from "../../safety/rules";

const NOW = 1_700_000_000_000;

function rgbSensor(over: Partial<SensorDescriptor> = {}): SensorDescriptor {
  return {
    id: "cam-1",
    modality: "rgb",
    label: "usb webcam",
    transport: "browser_media",
    health: "live",
    statusDetail: "",
    calibration: { state: "none", detail: "no reference points", intrinsics: null, atMs: null },
    provenance: { vendor: null, model: null, driver: null, adapter: "browserMedia", topic: "/sensors/rgb" },
    quality: { cadence: null, signal: null, latencyMs: null, note: "" },
    units: { measurement: null, frameFormat: "rgba8" },
    lastSampleMs: NOW - 500,
    declaredFps: 30,
    resolution: { width: 1280, height: 720 },
    measurable: false,
    ...over,
  };
}

const device: AuthorizedDevice = {
  id: "dev-1",
  name: "lobby camera",
  transport: "browser_media",
  modality: "rgb",
  zoneId: "zone-1",
  authorization: { attestedBy: "ops", attestedAtMs: NOW - 1000, basis: "owned" },
  sourceRef: "cam-1",
};

const zone: SiteZone = {
  id: "zone-1", name: "lobby", kind: "entry", note: "", building: "HQ", floor: "1",
};

function services(over: Partial<Record<ServiceHealth["id"], Partial<ServiceHealth>>> = {}): ServiceHealth[] {
  const mk = (id: ServiceHealth["id"]): ServiceHealth => ({
    id, label: id, configured: false, online: false, detail: "", checkedAtMs: NOW, endpointKind: "",
    ...(over[id] ?? {}),
  });
  return ["edge_bridge", "inference", "prediction", "recording", "positioning"].map((i) => mk(i as ServiceHealth["id"]));
}

function rows(over: { sensors?: SensorDescriptor[]; services?: ServiceHealth[]; ack?: number | null } = {}) {
  return buildCameraRows({
    zones: [zone],
    devices: [device],
    sensors: over.sensors ?? [rgbSensor()],
    services: over.services ?? services(),
    acknowledgedAuthorizationAtMs: over.ack === undefined ? NOW - 5000 : over.ack,
    nowMs: NOW,
  });
}

describe("capability truth", () => {
  it("an rgb webcam cannot unlock thermal, depth, nir, swir or lidar", () => {
    const badges = capabilityBadges(device, [rgbSensor()], NOW);
    for (const m of ["thermal_radiometric", "lwir", "nir", "swir", "depth", "lidar"] as const) {
      const b = badges.find((x) => x.modality === m)!;
      expect(b.state).toBe("unsupported");
      expect(b.measurable).toBe(false);
      expect(b.detail).toMatch(/cannot synthesise|adapter/);
    }
    expect(isEdgeOnly("thermal_radiometric")).toBe(true);
    expect(isEdgeOnly("rgb")).toBe(false);
  });

  it("an rgb badge says picture only, never a measurement", () => {
    const rgb = capabilityBadges(device, [rgbSensor()], NOW).find((b) => b.modality === "rgb")!;
    expect(rgb.state).toBe("live");
    expect(rgb.detail).toMatch(/picture only/);
  });

  it("an unsupported modality renders unavailable rather than a fake reading", () => {
    const row = rows()[0];
    const thermal = row.badges.find((b) => b.modality === "thermal_radiometric")!;
    expect(thermal.state).toBe("unsupported");
    expect(String(thermal.detail)).not.toMatch(/\d+\s*°?C/);
  });
});

describe("feed state truth", () => {
  it("a stale sensor is not reported live", () => {
    const row = rows({ sensors: [rgbSensor({ lastSampleMs: NOW - 60_000 })] })[0];
    expect(row.feed.state).toBe("stale");
    expect(row.feed.detail).toMatch(/last frame/);
  });

  it("a live flag with no frame yet is disconnected, not live", () => {
    const row = rows({ sensors: [rgbSensor({ lastSampleMs: null })] })[0];
    expect(row.feed.state).toBe("disconnected");
  });

  it("denied permission is its own state with a remediation", () => {
    const row = rows({ sensors: [rgbSensor({ health: "denied", statusDetail: "user refused" })] })[0];
    expect(row.feed.state).toBe("denied");
    expect(row.remediation.map((r) => r.id)).toContain("grant_permission");
  });

  it("a missing sensor is not configured, never live", () => {
    const row = rows({ sensors: [] })[0];
    expect(row.feed.state).toBe("not_configured");
    expect(row.remediation.map((r) => r.id)).toContain("connect_camera");
  });
});

describe("feed health is separate from inference and recording health", () => {
  it("a live camera with no model does not report inference live", () => {
    const row = rows()[0];
    expect(row.feed.state).toBe("live");
    expect(row.inference.state).toBe("not_configured");
    expect(row.recording.state).toBe("not_configured");
    expect(row.remediation.map((r) => r.id)).toEqual(expect.arrayContaining(["start_inference", "configure_recording"]));
  });

  it("a configured but unreachable model reports backend offline, not not-configured", () => {
    const row = rows({ services: services({ inference: { configured: true, online: false, detail: "no answer" } }) })[0];
    expect(row.inference.state).toBe("backend_offline");
    expect(row.feed.state).toBe("live");
  });

  it("summary counts feeds, inference and recording independently", () => {
    expect(consoleSummary(rows())).toBe("1/1 feeds live · 0 with inference · 0 with recording");
    expect(consoleSummary([])).toMatch(/no authorized camera/);
  });
});

describe("authorization gating", () => {
  it("an unacknowledged site leaves every camera unauthorized with a fix", () => {
    const row = rows({ ack: null })[0];
    expect(row.authorized).toBe(false);
    expect(row.remediation.map((r) => r.id)).toContain("acknowledge_authorization");
  });

  it("a measurable sensor with no calibration asks for calibration", () => {
    const row = rows({ sensors: [rgbSensor({ modality: "thermal_radiometric", measurable: true })] })[0];
    expect(row.remediation.map((r) => r.id)).toContain("calibrate");
  });
});

describe("site tree", () => {
  it("groups zones by building and floor and keeps unassigned cameras visible", () => {
    const r = rows();
    const tree = buildSiteTree({ siteId: "s", siteName: "hq", companyName: "acme" }, [zone], r);
    expect(tree.buildings[0].building).toBe("HQ");
    expect(tree.buildings[0].floors[0].zones[0].cameraIds).toEqual(["dev-1"]);
    const loose = buildSiteTree({ siteId: "s", siteName: "hq", companyName: "acme" }, [],
      r.map((x) => ({ ...x, zoneId: null })));
    expect(loose.unassignedCameraIds).toEqual(["dev-1"]);
  });

  it("a zone without building or floor is labelled unassigned, not invented", () => {
    const bare: SiteZone = { id: "z2", name: "yard", kind: "perimeter", note: "" };
    const tree = buildSiteTree({ siteId: "s", siteName: "hq", companyName: "acme" }, [bare], []);
    expect(tree.buildings[0].building).toBe("unassigned");
    expect(tree.buildings[0].floors[0].floor).toBe("unassigned");
  });
});

// ---------------------------------------------------------------------------

function incident(over: Partial<Incident> = {}): Incident {
  return {
    id: "inc-1",
    ruleId: "restricted_entry",
    label: "restricted area entry",
    zoneId: "zone-1",
    openedAtMs: NOW - 20_000,
    lastFiringMs: NOW - 10_000,
    firings: [{
      ruleId: "restricted_entry",
      signal: "zone_entry" as never,
      value: 1,
      atMs: NOW - 20_000,
      zoneId: "zone-1",
      provenance: "camera:dev-1 track:t7",
    }],
    severity: { score: 0.6, band: "review", contributions: [], rejected: ["pose confidence below threshold"], statement: "" },
    review: "needs_review",
    reviewedBy: null,
    reviewedAtMs: null,
    notes: [],
    evidenceId: null,
    evidenceState: "unavailable",
    evidenceDetail: "no recording configured",
    detectorId: "vision",
    provenance: "camera:dev-1",
    ...over,
  };
}

describe("alert queue", () => {
  it("derives signals, missing inputs, device and track from real firing data", () => {
    const [item] = toQueueItems([incident()]);
    expect(item.signals[0]).toMatch(/zone_entry = 1/);
    expect(item.missing).toEqual(["pose confidence below threshold"]);
    expect(item.deviceId).toBe("dev-1");
    expect(item.trackIds).toEqual(["t7"]);
    expect(item.status).toBe("new");
    expect(deviceIdOf(null)).toBeNull();
    expect(trackIdOf("no ids here")).toBeNull();
  });

  it("an unrecorded incident reports evidence unavailable, never stored", () => {
    const [item] = toQueueItems([incident()]);
    expect(item.evidenceState).toBe("unavailable");
    expect(item.evidenceId).toBeNull();
  });

  it("acknowledgement needs a person and follows the state machine", () => {
    const [item] = toQueueItems([incident()]);
    expect(transition(item, "acknowledged", "  ", NOW).changed).toBe(false);
    const ack = transition(item, "acknowledged", "ops", NOW);
    expect(ack.changed).toBe(true);
    expect(ack.item.actor).toBe("ops");
    expect(transition(ack.item, "escalated", "ops", NOW).changed).toBe(true);
    expect(canTransition("new", "escalated")).toBe(false);
    expect(canTransition("resolved", "new")).toBe(false);
  });

  it("filters compose and an unscored item never passes a quality floor", () => {
    const items = toQueueItems([incident(), incident({ id: "inc-2", ruleId: "crowd", label: "crowd", severity: undefined as never })]);
    expect(applyFilter(items, {}).length).toBe(2);
    expect(applyFilter(items, { eventTypes: ["crowd"] }).length).toBe(1);
    expect(applyFilter(items, { minQuality: 0.5 }).map((i) => i.incidentId)).toEqual(["inc-1"]);
    expect(applyFilter(items, { deviceIds: ["other"] }).length).toBe(0);
    expect(applyFilter(items, { statuses: ["resolved"] }).length).toBe(0);
    expect(sortQueue(items)[0].status).toBe("new");
  });

  it("no forbidden person-level signal is allowed into a card", () => {
    for (const s of ["emotion", "gaze", "body_language", "ethnicity", "criminality", "threat_of_person"]) {
      expect(isForbiddenSignal(s)).toBe(true);
    }
  });
});

describe("timeline and evidence", () => {
  const items: QueueItem[] = toQueueItems([incident()]);

  it("with no recording configured there is no media and the reason is stated", () => {
    const w = buildWindow(items, NOW - 60_000, NOW, null, false);
    expect(w.media).toBeNull();
    expect(w.mediaUnavailableReason).toMatch(/no recording path is configured/);
    expect(w.markers.length).toBe(1);
  });

  it("with recording configured but nothing stored it says so instead of showing frames", () => {
    const w = buildWindow(items, NOW - 60_000, NOW, [], true);
    expect(w.media).toEqual([]);
    expect(w.mediaUnavailableReason).toMatch(/nothing was stored/);
  });

  it("evidence references keep source, timestamp, storage and provenance", () => {
    const frames: EvidenceFrameRef[] = [
      { id: "f2", incidentId: "inc-1", atMs: NOW - 19_000, storage: "indexeddb", role: "trigger", annotations: [{ kind: "box", box: { x: 0, y: 0, w: 1, h: 1 }, note: "track t7" }], sourceDeviceId: "dev-1", provenance: "camera:dev-1" },
      { id: "f1", incidentId: "inc-1", atMs: NOW - 21_000, storage: "indexeddb", role: "pre", annotations: [], sourceDeviceId: "dev-1", provenance: "camera:dev-1" },
      { id: "f3", incidentId: "other", atMs: NOW, storage: "memory", role: "trigger", annotations: [], sourceDeviceId: null, provenance: "" },
    ];
    const seq = evidenceForIncident(frames, "inc-1");
    expect(seq.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(seq.every((f) => f.sourceDeviceId === "dev-1" && f.atMs > 0 && f.storage === "indexeddb")).toBe(true);
    const w = buildWindow(items, NOW - 60_000, NOW, frames, true);
    expect(w.media?.length).toBe(3);
  });

  it("jumping to an incident produces its exact interval with a margin", () => {
    const { fromMs, toMs } = intervalForIncident(items[0], 5000);
    expect(fromMs).toBe(items[0].openedAtMs - 5000);
    expect(toMs).toBe(items[0].lastFiringMs + 5000);
    expect(markersFor(items)[0].hasEvidence).toBe(false);
  });
});
