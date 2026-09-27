// asherin.eye — dependency and integration catalog.
//
// The rule this file enforces: the core console must work with free and open
// standards. Anything paid is an optional adapter, and it is labelled as such
// next to everything else, so nobody can mistake an optional convenience for a
// requirement.
//
// The `state` of each entry is computed from real probes only:
//   - services come from probeServices() (edge bridge, inference, recording…)
//   - adapters come from the sensor registry's own adapter statuses
// An entry whose runtime lives on an edge node stays `contract_only` here,
// because a browser tab can never host it and pretending otherwise would be
// the exact overclaim this module exists to prevent.

import type { AdapterStatus, ServiceHealth } from "../sensors/types";
import type { IntegrationEntry, IntegrationState } from "./types";

interface CatalogSeed {
  id: string;
  label: string;
  role: string;
  licence: IntegrationEntry["licence"];
  runsOn: IntegrationEntry["runsOn"];
  serves: string[];
  wired: boolean;
  /** which real probe decides this entry's state, when one does. */
  boundTo?: { kind: "service"; id: ServiceHealth["id"] } | { kind: "adapter"; id: string };
}

const SEEDS: CatalogSeed[] = [
  {
    id: "browser_mediadevices",
    label: "browser MediaDevices",
    role: "authorized webcams and usb cameras attached to this machine",
    licence: "free_standard",
    runsOn: "browser",
    serves: ["rgb video", "microphone"],
    wired: true,
    boundTo: { kind: "adapter", id: "browser_media" },
  },
  {
    id: "onvif",
    label: "ONVIF",
    role: "discovery, capability query and ptz control for authorized ip cameras",
    licence: "free_standard",
    runsOn: "edge_node",
    serves: ["discovery", "capabilities", "ptz", "events"],
    wired: true,
    boundTo: { kind: "service", id: "edge_bridge" },
  },
  {
    id: "rtsp",
    label: "RTSP",
    role: "authorized camera video transport",
    licence: "free_standard",
    runsOn: "edge_node",
    serves: ["h.264 / h.265 video", "audio"],
    wired: true,
    boundTo: { kind: "service", id: "edge_bridge" },
  },
  {
    id: "mqtt_mosquitto",
    label: "MQTT (Mosquitto)",
    role: "normalized sensor and event messaging between edge nodes and this console",
    licence: "free_open_source",
    runsOn: "edge_node",
    serves: ["observations", "events", "detector health"],
    wired: true,
    boundTo: { kind: "service", id: "edge_bridge" },
  },
  {
    id: "gstreamer",
    label: "GStreamer",
    role: "capture, decode, transform, encode and recording pipelines on the edge node",
    licence: "free_open_source",
    runsOn: "edge_node",
    serves: ["decode", "transcode", "pre-event buffer", "recording"],
    wired: true,
    boundTo: { kind: "service", id: "edge_bridge" },
  },
  {
    id: "opencv",
    label: "OpenCV",
    role: "computer vision and camera calibration on the edge node",
    licence: "free_open_source",
    runsOn: "edge_node",
    serves: ["calibration", "preprocessing", "geometry"],
    wired: true,
    boundTo: { kind: "service", id: "edge_bridge" },
  },
  {
    id: "onnxruntime",
    label: "ONNX Runtime",
    role: "local model inference without a cloud vision api",
    licence: "free_open_source",
    runsOn: "edge_node",
    serves: ["detection", "segmentation", "pose"],
    wired: true,
    boundTo: { kind: "service", id: "inference" },
  },
  {
    id: "tfjs_local",
    label: "on-device models (coco-ssd, movenet)",
    role: "detection and pose in this browser tab, with no server and no key",
    licence: "free_open_source",
    runsOn: "browser",
    serves: ["detection", "pose", "tracking"],
    wired: true,
  },
  {
    id: "frigate",
    label: "Frigate",
    role: "optional local video and event backend; never a hard dependency",
    licence: "free_open_source",
    runsOn: "server",
    serves: ["recording", "event index", "clips"],
    wired: true,
    boundTo: { kind: "service", id: "recording" },
  },
  {
    id: "open3d",
    label: "Open3D",
    role: "point clouds and 3d geometry for depth and lidar streams",
    licence: "free_open_source",
    runsOn: "edge_node",
    serves: ["point clouds", "registration"],
    wired: true,
    boundTo: { kind: "service", id: "edge_bridge" },
  },
  {
    id: "ros2",
    label: "ROS 2",
    role: "optional edge sensor bus for multi sensor nodes",
    licence: "free_open_source",
    runsOn: "edge_node",
    serves: ["sensor transport", "time sync"],
    wired: true,
    boundTo: { kind: "service", id: "edge_bridge" },
  },
  {
    id: "genicam",
    label: "GenICam / GigE Vision / USB3 Vision",
    role: "industrial camera acquisition through the edge node",
    licence: "free_standard",
    runsOn: "edge_node",
    serves: ["industrial rgb", "nir", "swir", "polarization"],
    wired: true,
    boundTo: { kind: "service", id: "edge_bridge" },
  },
  {
    id: "bluez",
    label: "BlueZ",
    role: "linux ble sensing on an authorized scanner",
    licence: "free_open_source",
    runsOn: "edge_node",
    serves: ["ble sightings", "rssi"],
    wired: true,
    boundTo: { kind: "service", id: "edge_bridge" },
  },
  {
    id: "whisper_cpp",
    label: "whisper.cpp",
    role: "local transcription of authorized audio",
    licence: "free_open_source",
    runsOn: "edge_node",
    serves: ["speech events"],
    wired: false,
  },
  {
    id: "postgres_pgvector",
    label: "PostgreSQL + pgvector",
    role: "durable evidence, incident and similarity search storage",
    licence: "free_open_source",
    runsOn: "server",
    serves: ["evidence", "incidents", "search"],
    wired: true,
  },
  {
    id: "openstreetmap",
    label: "OpenStreetMap",
    role: "public map data for site and zone context",
    licence: "free_open_source",
    runsOn: "browser",
    serves: ["maps", "geocoding context"],
    wired: true,
  },
  {
    id: "vendor_sdk",
    label: "vendor camera SDKs",
    role: "adapter slot for hardware that speaks nothing open; used only when the device requires it",
    licence: "optional_paid",
    runsOn: "edge_node",
    serves: ["vendor-specific streams"],
    wired: false,
  },
];

function stateFor(seed: CatalogSeed, services: ServiceHealth[], adapters: AdapterStatus[]): { state: IntegrationState; detail: string } {
  if (!seed.boundTo) {
    if (seed.runsOn === "browser") return { state: "in_browser", detail: "runs in this tab, no server and no key" };
    if (!seed.wired) return { state: "not_configured", detail: "adapter slot exists; nothing is connected to it" };
    return { state: "connected", detail: "in use by this project" };
  }
  if (seed.boundTo.kind === "adapter") {
    const a = adapters.find((x) => x.id === seed.boundTo!.id);
    if (!a) return { state: "not_configured", detail: "the adapter has not reported yet" };
    return a.reachable
      ? { state: "in_browser", detail: a.detail }
      : { state: "not_configured", detail: a.detail };
  }
  const svc = services.find((s) => s.id === seed.boundTo!.id);
  if (!svc || !svc.configured) {
    return {
      state: "contract_only",
      detail: `${seed.label} runs on an edge node or server. the adapter contract exists in this codebase; no endpoint is configured, so it is unavailable rather than simulated`,
    };
  }
  if (!svc.online) return { state: "configured_offline", detail: svc.detail };
  return { state: "connected", detail: svc.detail };
}

export function buildIntegrationCatalog(services: ServiceHealth[], adapters: AdapterStatus[]): IntegrationEntry[] {
  return SEEDS.map((seed) => {
    const { state, detail } = stateFor(seed, services, adapters);
    return {
      id: seed.id,
      label: seed.label,
      role: seed.role,
      licence: seed.licence,
      runsOn: seed.runsOn,
      serves: seed.serves,
      wired: seed.wired,
      state,
      detail,
    };
  });
}

/** True when nothing the core console needs is behind a paid dependency. */
export function coreIsFree(entries: IntegrationEntry[]): boolean {
  return entries.filter((e) => e.licence === "optional_paid").every((e) => e.state !== "connected" || !e.wired);
}
