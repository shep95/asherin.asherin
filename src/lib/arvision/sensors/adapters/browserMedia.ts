// asherin.arvision — browser media adapter.
//
// What a browser can honestly reach: video and audio inputs the operating
// system already exposes, plus geolocation and device orientation. That is the
// whole list. A browser cannot open a GigE Vision camera, cannot pull an RTSP
// stream, cannot read a Y16 radiometric array, cannot bind a lidar driver and
// cannot receive an event camera's asynchronous stream. Those live behind the
// edge bridge adapter, and this file never pretends otherwise.
//
// Modality is inferred only from what the platform actually tells us: the
// device label, and — once a track is open — its real settings. A device whose
// label says nothing keeps modality "rgb", because visible light is what an
// ordinary camera produces.

import type {
  AdapterStatus,
  SensorDescriptor,
  SensorModality,
  SensorTransport,
} from "../types";
import { MODALITY_TOPIC } from "../types";

const ADAPTER_ID = "browser_media";

const THERMAL_HINTS = [
  "thermal", "therm", "flir", "boson", "lepton", "seek", "infiray", "topdon",
  "hikmicro", "xtherm", "guide sensmart", "lwir", "infrared", "ircam",
];
const RADIOMETRIC_HINTS = ["radiometric", "y16", "tlinear"];
const NIR_HINTS = ["nir", "ir camera", "infrared led", "night vision", "940nm", "850nm"];
const DEPTH_HINTS = ["depth", "realsense", "tof", "structure", "zed", "oak-d", "kinect", "stereo"];
const EVENT_HINTS = ["prophesee", "dvs", "event camera", "inivation"];
const POLAR_HINTS = ["polar", "polarization", "polarisation"];
const SWIR_HINTS = ["swir", "ingaas"];
const SPECTRAL_HINTS = ["hyperspectral", "multispectral", "specim", "ximea xispec"];

function hit(label: string, hints: string[]): boolean {
  const l = label.toLowerCase();
  return hints.some((h) => l.includes(h));
}

/** Modality from a device label only. Never a guess dressed as a reading. */
export function modalityFromLabel(label: string): SensorModality {
  if (hit(label, RADIOMETRIC_HINTS)) return "thermal_radiometric";
  if (hit(label, THERMAL_HINTS)) return "lwir";
  if (hit(label, SPECTRAL_HINTS)) return "hyperspectral";
  if (hit(label, SWIR_HINTS)) return "swir";
  if (hit(label, POLAR_HINTS)) return "polarization";
  if (hit(label, EVENT_HINTS)) return "event";
  if (hit(label, DEPTH_HINTS)) return "depth";
  if (hit(label, NIR_HINTS)) return "nir";
  return "rgb";
}

function descriptor(params: {
  id: string;
  label: string;
  modality: SensorModality;
  transport: SensorTransport;
  health: SensorDescriptor["health"];
  statusDetail: string;
  measurable: boolean;
  vendor?: string | null;
}): SensorDescriptor {
  return {
    id: params.id,
    modality: params.modality,
    label: params.label,
    transport: params.transport,
    health: params.health,
    statusDetail: params.statusDetail,
    calibration: {
      state: "none",
      detail: "no calibration has been applied to this stream",
      intrinsics: null,
      atMs: null,
    },
    provenance: {
      vendor: params.vendor ?? null,
      model: null,
      driver: "browser media devices",
      adapter: ADAPTER_ID,
      topic: MODALITY_TOPIC[params.modality],
    },
    quality: { cadence: null, signal: null, latencyMs: null, note: "no frames measured yet" },
    units: { measurement: null, frameFormat: null },
    lastSampleMs: null,
    declaredFps: null,
    resolution: null,
    stream: null,
    measurable: params.measurable,
  };
}

export interface BrowserDiscovery {
  status: AdapterStatus;
  sensors: SensorDescriptor[];
}

export async function discoverBrowserSensors(): Promise<BrowserDiscovery> {
  const sensors: SensorDescriptor[] = [];
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.enumerateDevices;

  if (!supported) {
    return {
      status: {
        id: ADAPTER_ID,
        label: "browser media devices",
        reachable: false,
        detail: "this browser does not expose media devices",
        modalities: ["rgb", "audio"],
      },
      sensors,
    };
  }

  let devices: MediaDeviceInfo[] = [];
  let detail = "";
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch (e) {
    detail = e instanceof Error ? e.message : "device enumeration failed";
  }

  const unlabelled = devices.some((d) => (d.kind === "videoinput" || d.kind === "audioinput") && !d.label);

  for (const d of devices) {
    if (d.kind === "videoinput") {
      const label = d.label || "camera (name hidden until permission is granted)";
      const modality = d.label ? modalityFromLabel(d.label) : "rgb";
      sensors.push(
        descriptor({
          id: `browser:video:${d.deviceId}`,
          label,
          modality,
          transport: "browser_media",
          health: "unavailable",
          statusDetail: "connected, not opened",
          // a browser hands back decoded 8-bit frames; nothing here is measurable
          // until an edge bridge supplies the raw stream.
          measurable: false,
        }),
      );
    } else if (d.kind === "audioinput") {
      sensors.push(
        descriptor({
          id: `browser:audio:${d.deviceId}`,
          label: d.label || "microphone (name hidden until permission is granted)",
          modality: "audio",
          transport: "browser_media",
          health: "unavailable",
          statusDetail: "connected, not opened",
          measurable: false,
        }),
      );
    }
  }

  if (typeof navigator !== "undefined" && "geolocation" in navigator) {
    sensors.push(
      descriptor({
        id: "browser:gnss",
        label: "device position",
        modality: "gnss",
        transport: "browser_sensor",
        health: "unavailable",
        statusDetail: "available, not started",
        measurable: true,
      }),
    );
  }

  if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
    sensors.push(
      descriptor({
        id: "browser:imu",
        label: "device orientation",
        modality: "imu",
        transport: "browser_sensor",
        health: "unavailable",
        statusDetail: "available, not started",
        measurable: true,
      }),
    );
  }

  return {
    status: {
      id: ADAPTER_ID,
      label: "browser media devices",
      reachable: true,
      detail:
        detail ||
        (unlabelled
          ? "device names stay hidden until one camera permission is granted"
          : `${sensors.length} local source${sensors.length === 1 ? "" : "s"} enumerated`),
      modalities: ["rgb", "nir", "lwir", "depth", "audio", "gnss", "imu"],
    },
    sensors,
  };
}

/** Open a browser video source and fold its real track settings into the record. */
export async function openBrowserVideo(sensor: SensorDescriptor): Promise<SensorDescriptor> {
  const deviceId = sensor.id.split(":")[2] ?? "";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    const track = stream.getVideoTracks()[0];
    const s = track?.getSettings?.() ?? {};
    const label = track?.label || sensor.label;
    return {
      ...sensor,
      label,
      modality: sensor.modality === "rgb" ? modalityFromLabel(label) : sensor.modality,
      stream,
      health: "live",
      statusDetail: "",
      lastSampleMs: Date.now(),
      declaredFps: typeof s.frameRate === "number" ? s.frameRate : null,
      resolution: s.width && s.height ? { width: s.width, height: s.height } : null,
      units: { measurement: null, frameFormat: "decoded 8-bit rgb frames" },
      quality: {
        cadence: null,
        signal: null,
        latencyMs: null,
        note: "cadence and signal are measured from delivered frames",
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "the camera could not be opened";
    return {
      ...sensor,
      stream: null,
      health: /denied|permission/i.test(message) ? "denied" : "error",
      statusDetail: message,
    };
  }
}

export function closeBrowserVideo(sensor: SensorDescriptor): SensorDescriptor {
  sensor.stream?.getTracks().forEach((t) => t.stop());
  return { ...sensor, stream: null, health: "unavailable", statusDetail: "closed by the operator" };
}
