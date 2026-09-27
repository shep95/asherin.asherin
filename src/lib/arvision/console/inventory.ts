// eagle.eye — camera inventory and site tree.
//
// Every row here is assembled from three independent facts that must not be
// collapsed into one green dot:
//
//   the feed      — is this camera producing frames?
//   the inference — is a model actually running against those frames?
//   the recording — is anything being kept?
//
// A console that shows one status light for all three lies twice: it tells an
// operator that a working camera with no model is "healthy", and that a camera
// with a model but no storage will have evidence afterwards.

import type {
  AuthorizedDevice, SensorDescriptor, SensorModality, ServiceHealth, SiteZone,
} from "../sensors/types";
import { MODALITY_LABEL } from "../sensors/types";
import type {
  CameraRow, CapabilityBadge, ConsoleInputs, ConsoleState, Remediation, SiteTree,
} from "./types";

export const DEFAULT_STALE_AFTER_MS = 15_000;

/** Modalities a browser media device can genuinely deliver on its own. Anything
 * outside this set needs an acquisition adapter at the edge — never a shader. */
const BROWSER_NATIVE: SensorModality[] = ["rgb", "lowlight", "audio", "gnss", "imu"];

/** Modalities that only exist behind dedicated hardware plus an edge adapter. */
export const EDGE_ONLY: SensorModality[] = [
  "nir", "swir", "lwir", "thermal_radiometric", "depth", "lidar", "polarization",
  "event", "hyperspectral",
];

export function isEdgeOnly(m: SensorModality): boolean {
  return EDGE_ONLY.includes(m);
}

const REMEDIATION: Record<Remediation["id"], Omit<Remediation, "id">> = {
  connect_camera: { label: "connect a camera", detail: "attach an authorized camera and open its stream" },
  grant_permission: { label: "grant camera permission", detail: "the browser refused access; allow it for this site" },
  configure_edge_bridge: { label: "configure the edge bridge", detail: "this modality needs a native acquisition adapter; a browser cannot produce it" },
  calibrate: { label: "calibrate this sensor", detail: "no measurement may be derived until reference points exist" },
  start_inference: { label: "start the inference service", detail: "no model is answering, so no detections exist" },
  configure_recording: { label: "configure recording", detail: "no storage is configured, so no evidence can be kept" },
  authorize_device: { label: "record an authorization basis", detail: "this device has no attestation of ownership or written authorization" },
  acknowledge_authorization: { label: "acknowledge the authorization statement", detail: "the site owner statement has not been accepted on this device" },
  none: { label: "", detail: "" },
};

export function remediation(id: Remediation["id"]): Remediation {
  return { id, ...REMEDIATION[id] };
}

function feedState(
  sensor: SensorDescriptor | undefined, nowMs: number, staleAfterMs: number,
): { state: ConsoleState; detail: string; lastSampleMs: number | null } {
  if (!sensor) {
    return { state: "not_configured", detail: "no stream has been opened for this device", lastSampleMs: null };
  }
  if (sensor.health === "denied") return { state: "denied", detail: sensor.statusDetail || "access refused", lastSampleMs: sensor.lastSampleMs };
  if (sensor.health === "unavailable") return { state: "unsupported", detail: sensor.statusDetail || "this source is not available on this hardware", lastSampleMs: sensor.lastSampleMs };
  if (sensor.health === "error") return { state: "disconnected", detail: sensor.statusDetail || "the stream failed", lastSampleMs: sensor.lastSampleMs };
  if (sensor.health === "opening") return { state: "disconnected", detail: "the stream is opening", lastSampleMs: sensor.lastSampleMs };
  if (sensor.health === "stale") return { state: "stale", detail: sensor.statusDetail || "no recent frame", lastSampleMs: sensor.lastSampleMs };
  if (sensor.lastSampleMs == null) {
    return { state: "disconnected", detail: "the stream reports live but has produced no frame yet", lastSampleMs: null };
  }
  const age = nowMs - sensor.lastSampleMs;
  if (age > staleAfterMs) {
    return { state: "stale", detail: `last frame ${Math.round(age / 1000)}s ago`, lastSampleMs: sensor.lastSampleMs };
  }
  return { state: "live", detail: "producing frames", lastSampleMs: sensor.lastSampleMs };
}

function serviceState(
  services: ServiceHealth[], id: ServiceHealth["id"], notConfiguredDetail: string,
): { state: ConsoleState; detail: string } {
  const s = services.find((x) => x.id === id);
  if (!s || !s.configured) return { state: "not_configured", detail: notConfiguredDetail };
  if (!s.online) return { state: "backend_offline", detail: s.detail || "the service is not answering" };
  return { state: "live", detail: s.detail || "online" };
}

/**
 * Badges for one device. A modality is only ever "live" when a registered
 * sensor of that exact modality is producing samples. An RGB webcam can never
 * light a thermal, depth, nir, swir or lidar badge — the badge says
 * "unsupported here" and names the adapter that would be required.
 */
export function capabilityBadges(
  device: AuthorizedDevice,
  sensors: SensorDescriptor[],
  nowMs: number,
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
): CapabilityBadge[] {
  const own = sensors.filter((s) => s.id === device.sourceRef || s.id === device.id);
  const badges: CapabilityBadge[] = own.map((s) => {
    const f = feedState(s, nowMs, staleAfterMs);
    return {
      modality: s.modality,
      label: MODALITY_LABEL[s.modality],
      measurable: s.measurable,
      state: f.state,
      detail: s.measurable
        ? `${f.detail} · measurements carry ${s.units.measurement ?? "no declared unit"}`
        : `${f.detail} · picture only, no measurement is derived from this stream`,
    };
  });
  const present = new Set(badges.map((b) => b.modality));
  for (const m of EDGE_ONLY) {
    if (present.has(m)) continue;
    badges.push({
      modality: m,
      label: MODALITY_LABEL[m],
      measurable: false,
      state: "unsupported",
      detail: `no ${MODALITY_LABEL[m]} sensor is registered for this device; a browser cannot synthesise one — this needs an ${device.transport === "browser_media" ? "edge acquisition adapter" : "adapter on the bridge"}`,
    });
  }
  return badges;
}

export function buildCameraRows(input: ConsoleInputs): CameraRow[] {
  const stale = input.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const zoneById = new Map(input.zones.map((z) => [z.id, z]));
  const inference = serviceState(input.services, "inference", "no inference service is configured, so no detections exist for this camera");
  const recording = serviceState(input.services, "recording", "no recording service is configured, so evidence capture is unavailable");

  return input.devices.map((d) => {
    const sensor = input.sensors.find((s) => s.id === d.sourceRef || s.id === d.id);
    const feed = feedState(sensor, input.nowMs, stale);
    const zone = d.zoneId ? zoneById.get(d.zoneId) ?? null : null;
    const fixes: Remediation[] = [];
    if (!input.acknowledgedAuthorizationAtMs) fixes.push(remediation("acknowledge_authorization"));
    if (!d.authorization) fixes.push(remediation("authorize_device"));
    if (feed.state === "denied") fixes.push(remediation("grant_permission"));
    if (feed.state === "not_configured" || feed.state === "disconnected") fixes.push(remediation("connect_camera"));
    if (feed.state === "unsupported" && isEdgeOnly(d.modality)) fixes.push(remediation("configure_edge_bridge"));
    if (sensor && sensor.measurable && sensor.calibration.state === "none") fixes.push(remediation("calibrate"));
    if (inference.state !== "live") fixes.push(remediation("start_inference"));
    if (recording.state !== "live") fixes.push(remediation("configure_recording"));

    return {
      deviceId: d.id,
      name: d.name,
      zoneId: d.zoneId,
      zoneName: zone?.name ?? null,
      building: (zone?.building ?? "").trim() || "unassigned",
      floor: (zone?.floor ?? "").trim() || "unassigned",
      authorized: !!d.authorization && !!input.acknowledgedAuthorizationAtMs,
      authorizationBasis: d.authorization?.basis ?? null,
      feed,
      inference,
      recording,
      badges: capabilityBadges(d, input.sensors, input.nowMs, stale),
      remediation: fixes,
      sensorId: sensor?.id ?? null,
    };
  });
}

export function buildSiteTree(
  meta: { siteId: string; siteName: string; companyName: string },
  zones: SiteZone[],
  rows: CameraRow[],
): SiteTree {
  const buildings = new Map<string, Map<string, Array<SiteZone & { cameraIds: string[] }>>>();
  for (const z of zones) {
    const b = (z.building ?? "").trim() || "unassigned";
    const f = (z.floor ?? "").trim() || "unassigned";
    if (!buildings.has(b)) buildings.set(b, new Map());
    const floors = buildings.get(b)!;
    if (!floors.has(f)) floors.set(f, []);
    floors.get(f)!.push({ ...z, cameraIds: rows.filter((r) => r.zoneId === z.id).map((r) => r.deviceId) });
  }
  return {
    siteId: meta.siteId,
    siteName: meta.siteName,
    companyName: meta.companyName,
    buildings: [...buildings.entries()].map(([building, floors]) => ({
      building,
      floors: [...floors.entries()].map(([floor, zs]) => ({ floor, zones: zs })),
    })),
    unassignedCameraIds: rows.filter((r) => !r.zoneId).map((r) => r.deviceId),
  };
}

/** A one-line honest summary of what this console can currently do. */
export function consoleSummary(rows: CameraRow[]): string {
  if (rows.length === 0) return "no authorized camera is configured on this device";
  const live = rows.filter((r) => r.feed.state === "live").length;
  const inferring = rows.filter((r) => r.inference.state === "live").length;
  const recording = rows.filter((r) => r.recording.state === "live").length;
  return `${live}/${rows.length} feeds live · ${inferring} with inference · ${recording} with recording`;
}
