// asherin.eye — per-device capability matrix.
//
// This is the file that stops the interface lying. Every control the console
// offers for a device is derived from a cell in this matrix, so a plain usb
// webcam can never be given a temperature readout, a depth measurement, a ptz
// pad or a rewind scrubber: those cells resolve to unsupported, requires_edge
// or not_configured, and the control simply is not rendered.
//
// The only inputs are real: the sensor descriptor the registry actually holds,
// the capability declaration an ONVIF/edge/vendor adapter actually published,
// the service probes, and whether a local on-device model actually loaded.

import type { SensorDescriptor, SensorModality, ServiceHealth } from "../sensors/types";
import type {
  CapabilityCell, CapabilityId, CapabilityState, DeclaredDeviceCapabilities, DeviceMatrixRow,
  EvidenceClass,
} from "./types";

/** Modalities no browser tab can acquire: they need an edge acquisition node. */
const EDGE_ONLY_MODALITIES: SensorModality[] = [
  "nir", "swir", "lwir", "thermal_radiometric", "depth", "lidar",
  "polarization", "event", "hyperspectral",
];

const MODALITY_CAPABILITY: Partial<Record<CapabilityId, SensorModality>> = {
  thermal_lwir: "lwir",
  thermal_radiometric: "thermal_radiometric",
  nir: "nir",
  swir: "swir",
  hyperspectral: "hyperspectral",
  polarization: "polarization",
  depth: "depth",
  lidar: "lidar",
  event_camera: "event",
  gnss: "gnss",
  imu: "imu",
  microphone: "audio",
};

export interface MatrixInput {
  deviceId: string;
  name: string;
  sensor: SensorDescriptor | null;
  declared: DeclaredDeviceCapabilities | null;
  services: ServiceHealth[];
  /** true only when an on-device model object actually finished loading. */
  localInferenceReady: boolean;
  /** true only when the edge bridge adapter reported itself reachable. */
  edgeConnected: boolean;
}

function cell(capability: CapabilityId, state: CapabilityState, reason: string, evidence: EvidenceClass = "observed"): CapabilityCell {
  return { capability, state, reason, evidence };
}

function svc(services: ServiceHealth[], id: ServiceHealth["id"]): ServiceHealth | undefined {
  return services.find((s) => s.id === id);
}

/** Declared booleans are trusted; an absent declaration never becomes a "no". */
function fromDeclared(
  capability: CapabilityId,
  declared: DeclaredDeviceCapabilities | null,
  value: boolean | undefined,
  browserImpossible: boolean,
  edgeConnected: boolean,
): CapabilityCell {
  if (value === true) return cell(capability, "available", "declared by the device's own capability response");
  if (value === false) return cell(capability, "unsupported", "the device answered that it does not support this");
  if (browserImpossible) {
    return cell(
      capability,
      edgeConnected ? "unknown" : "requires_edge",
      edgeConnected
        ? "the edge node has not published a capability answer for this device"
        : "a browser tab cannot ask a camera this; it needs an onvif or edge adapter",
      "unknown",
    );
  }
  if (!declared) return cell(capability, "unknown", "nothing has reported this either way", "unknown");
  return cell(capability, "unknown", "the capability response did not include this field", "unknown");
}

function connectionCell(sensor: SensorDescriptor | null): CapabilityCell {
  if (!sensor) return cell("connection", "unavailable", "no stream is registered for this device");
  switch (sensor.health) {
    case "live": return cell("connection", "available", "frames are arriving now");
    case "opening": return cell("connection", "unavailable", "the stream is still opening");
    case "stale": return cell("connection", "unavailable", "the last sample is older than the freshness budget");
    case "denied": return cell("connection", "unavailable", "permission was refused for this device");
    case "error": return cell("connection", "unavailable", sensor.statusDetail || "the stream reported an error");
    default: return cell("connection", "unavailable", sensor.statusDetail || "the stream is not connected");
  }
}

function modalityCell(
  capability: CapabilityId,
  modality: SensorModality,
  input: MatrixInput,
): CapabilityCell {
  const { sensor, declared, edgeConnected } = input;
  const carried = sensor?.modality === modality || (declared?.modalities ?? []).includes(modality);
  if (carried) {
    if (sensor && sensor.health === "live") {
      return cell(capability, "available", `a ${modality} stream is registered and producing samples`);
    }
    return cell(capability, "unavailable", `the ${modality} stream is registered but not producing samples`);
  }
  if (EDGE_ONLY_MODALITIES.includes(modality)) {
    return edgeConnected
      ? cell(capability, "unsupported", "the connected edge node does not publish this modality for this device")
      : cell(
          capability,
          "requires_edge",
          "this is a separate physical sensor. no colour filter on a visible-light camera can produce it — it needs an edge acquisition node",
        );
  }
  return cell(capability, "unsupported", "this device does not carry that sensor");
}

export function buildDeviceMatrix(input: MatrixInput): DeviceMatrixRow {
  const { sensor, declared, services, localInferenceReady, edgeConnected } = input;
  const browserOnly = !sensor || sensor.transport === "browser_media" || sensor.transport === "browser_sensor";
  const live = sensor?.health === "live";
  const visual = sensor ? sensor.modality !== "audio" && sensor.modality !== "gnss" && sensor.modality !== "imu" : false;

  const cells: CapabilityCell[] = [connectionCell(sensor)];

  cells.push(
    visual
      ? cell("video", live ? "available" : "unavailable", live ? "video frames are arriving" : "the video stream is not producing frames")
      : cell("video", "unsupported", "this device is not a video source"),
  );

  const codecs = (declared?.codecs ?? []).map((c) => c.toLowerCase());
  const codecCell = (id: CapabilityId, needle: string) => {
    if (codecs.length === 0) {
      return browserOnly
        ? cell(id, "unknown", "a browser hands over decoded frames and never reveals the wire codec", "unknown")
        : fromDeclared(id, declared, undefined, true, edgeConnected);
    }
    return codecs.some((c) => c.includes(needle))
      ? cell(id, "available", "listed in the device's own codec response")
      : cell(id, "unsupported", "not listed in the device's codec response");
  };
  cells.push(codecCell("codec_h264", "264"), codecCell("codec_h265", "265"));

  cells.push(fromDeclared("ptz", declared, declared?.ptz, browserOnly, edgeConnected));
  cells.push(
    sensor?.modality === "audio"
      ? cell("audio", live ? "available" : "unavailable", live ? "audio samples are arriving" : "the audio stream is not producing samples")
      : fromDeclared("audio", declared, declared?.audio, browserOnly, edgeConnected),
  );
  cells.push(fromDeclared("camera_metadata", declared, declared?.metadataStream, browserOnly, edgeConnected));
  cells.push(
    fromDeclared(
      "motion_tamper",
      declared,
      declared?.motionEvents === undefined && declared?.tamperEvents === undefined
        ? undefined
        : Boolean(declared?.motionEvents || declared?.tamperEvents),
      browserOnly,
      edgeConnected,
    ),
  );
  cells.push(fromDeclared("edge_recording", declared, declared?.edgeRecording, browserOnly, edgeConnected));
  cells.push(
    declared?.onvifProfile
      ? cell("onvif", "available", `onvif profile ${declared.onvifProfile}`)
      : fromDeclared("onvif", declared, undefined, browserOnly, edgeConnected),
  );

  for (const [capability, modality] of Object.entries(MODALITY_CAPABILITY) as Array<[CapabilityId, SensorModality]>) {
    cells.push(modalityCell(capability, modality, input));
  }
  // radar has no modality in the sensor contract: it can only arrive over an edge bridge.
  cells.push(
    edgeConnected
      ? cell("radar", "unsupported", "the connected edge node publishes no radar stream for this device", "unknown")
      : cell("radar", "requires_edge", "radar is an edge-node stream; nothing in a browser tab can produce it"),
  );

  const inference = svc(services, "inference");
  if (localInferenceReady) {
    cells.push(cell("inference", "available", "an on-device model is loaded in this tab — no cloud api and no key"));
  } else if (inference?.online) {
    cells.push(cell("inference", "available", "the inference service answered its health check"));
  } else if (inference?.configured) {
    cells.push(cell("inference", "unavailable", inference.detail));
  } else {
    cells.push(cell("inference", "not_configured", "no model is loaded here and no inference service is configured"));
  }
  const inferenceOk = cells[cells.length - 1].state === "available";
  cells.push(
    cell(
      "tracking",
      inferenceOk && live ? "available" : inferenceOk ? "unavailable" : "not_configured",
      inferenceOk && live
        ? "temporary anonymous track ids are assigned from real detections"
        : inferenceOk
          ? "tracking needs a live stream"
          : "tracking needs detections; none are being produced",
    ),
  );
  cells.push(
    cell(
      "event_detection",
      inferenceOk && live ? "available" : "not_configured",
      inferenceOk && live
        ? "the deterministic event engine runs on real tracks in this tab"
        : "the event engine has no observations to run on",
    ),
  );

  const recording = svc(services, "recording");
  if (recording?.online) {
    cells.push(cell("recording", "available", recording.detail));
    cells.push(cell("historical_search", "available", "the recording and index service answers search"));
  } else if (recording?.configured) {
    cells.push(cell("recording", "unavailable", recording.detail));
    cells.push(cell("historical_search", "unavailable", "the index service is configured but not answering, so rewind and search are unavailable"));
  } else if (declared?.edgeRecording) {
    cells.push(cell("recording", "not_configured", "the camera records on board, but no retrieval service is configured here"));
    cells.push(cell("historical_search", "not_configured", "no index service is configured, so there is nothing to search"));
  } else {
    cells.push(cell("recording", "not_configured", "no recording service is configured; evidence beyond in-memory frames is unavailable"));
    cells.push(cell("historical_search", "not_configured", "no index service is configured, so rewind and search are unavailable"));
  }

  const cal = sensor?.calibration.state ?? "none";
  cells.push(
    cal === "operator" || cal === "verified" || cal === "factory"
      ? cell("calibration", "available", sensor?.calibration.detail ?? "calibrated")
      : cal === "assumed"
        ? cell("calibration", "unknown", "values are assumed, not measured, so no metric claim may be derived", "unknown")
        : cell("calibration", "not_configured", "this stream is uncalibrated: pictures only, no measurements"),
  );
  const intrinsics = sensor?.calibration.intrinsics ?? null;
  cells.push(
    intrinsics && (cal === "operator" || cal === "verified")
      ? cell("spatial_registration", "available", "intrinsics and an operator reference exist, so image points map to the site frame")
      : cell("spatial_registration", "not_configured", "without intrinsics and a site reference, two cameras cannot be said to share coordinates"),
  );
  cells.push(
    declared?.timeSync
      ? cell("time_sync", "available", `${declared.timeSync.source}${declared.timeSync.offsetMs == null ? "" : `, offset ${declared.timeSync.offsetMs} ms`}`)
      : cell("time_sync", "unknown", "frames are stamped by this machine's clock; no external time source has reported", "unknown"),
  );

  return {
    deviceId: input.deviceId,
    name: input.name,
    modality: sensor?.modality ?? null,
    transport: sensor?.transport ?? "unregistered",
    cells,
  };
}

export function cellFor(row: DeviceMatrixRow, capability: CapabilityId): CapabilityCell {
  return (
    row.cells.find((c) => c.capability === capability) ??
    cell(capability, "unknown", "this capability was not evaluated for this device", "unknown")
  );
}

/** Controls the UI is allowed to render for a device. Anything absent must not
 * be drawn at all — a disabled-looking control still advertises a capability. */
export type ControlId =
  | "open_stream" | "ptz_pad" | "listen_audio" | "temperature_readout" | "depth_measure"
  | "point_cloud" | "track_overlay" | "event_rules" | "rewind" | "search_history" | "calibrate";

export function controlsFor(row: DeviceMatrixRow): ControlId[] {
  const on = (c: CapabilityId) => cellFor(row, c).state === "available";
  const out: ControlId[] = [];
  if (on("video") || on("audio")) out.push("open_stream");
  if (on("ptz")) out.push("ptz_pad");
  if (on("audio")) out.push("listen_audio");
  if (on("thermal_radiometric")) out.push("temperature_readout");
  if (on("depth") || on("lidar")) out.push("depth_measure");
  if (on("lidar") || on("depth")) out.push("point_cloud");
  if (on("tracking")) out.push("track_overlay");
  if (on("event_detection")) out.push("event_rules");
  if (on("recording")) out.push("rewind");
  if (on("historical_search")) out.push("search_history");
  if (cellFor(row, "calibration").state !== "available" && on("video")) out.push("calibrate");
  return out;
}

export function matrixSummary(row: DeviceMatrixRow): string {
  const n = (s: CapabilityState) => row.cells.filter((c) => c.state === s).length;
  return `${n("available")} available · ${n("unsupported")} unsupported · ${n("requires_edge")} need an edge node · ${n("not_configured")} not configured · ${n("unknown")} unknown`;
}
