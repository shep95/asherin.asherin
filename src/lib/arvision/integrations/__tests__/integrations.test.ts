// asherin.eye — capability truth tests.
//
// These exist to make one class of regression impossible: a plain visible-light
// camera acquiring, through some UI convenience, a thermal, depth, lidar, nir or
// swir claim. Every assertion below is about what the console is allowed to say.

import { describe, expect, it } from "vitest";
import { buildDeviceMatrix, cellFor, controlsFor, matrixSummary } from "../matrix";
import { buildIntegrationCatalog, coreIsFree } from "../catalog";
import type { SensorDescriptor, ServiceHealth } from "../../sensors/types";

function rgbWebcam(overrides: Partial<SensorDescriptor> = {}): SensorDescriptor {
  return {
    id: "cam-a",
    modality: "rgb",
    label: "usb webcam",
    transport: "browser_media",
    health: "live",
    statusDetail: "",
    calibration: { state: "none", detail: "uncalibrated", intrinsics: null, atMs: null },
    provenance: { vendor: null, model: null, driver: null, adapter: "browser_media", topic: "/sensors/rgb" },
    quality: { cadence: 0.9, signal: 0.7, latencyMs: null, note: "measured" },
    units: { measurement: null, frameFormat: "rgba8" },
    lastSampleMs: Date.now(),
    declaredFps: 30,
    resolution: { width: 1280, height: 720 },
    measurable: false,
    ...overrides,
  };
}

function services(over: Partial<Record<ServiceHealth["id"], Partial<ServiceHealth>>> = {}): ServiceHealth[] {
  const ids: ServiceHealth["id"][] = ["edge_bridge", "inference", "prediction", "recording", "positioning"];
  return ids.map((id) => ({
    id,
    label: id,
    configured: false,
    online: false,
    detail: "not configured",
    checkedAtMs: Date.now(),
    endpointKind: "test",
    ...(over[id] ?? {}),
  }));
}

const base = {
  deviceId: "cam-a",
  name: "usb webcam",
  declared: null,
  services: services(),
  localInferenceReady: false,
  edgeConnected: false,
};

describe("capability matrix — physical modalities", () => {
  const row = buildDeviceMatrix({ ...base, sensor: rgbWebcam() });

  it("an rgb webcam never reports thermal, radiometric, nir, swir, depth or lidar as available", () => {
    for (const c of ["thermal_lwir", "thermal_radiometric", "nir", "swir", "depth", "lidar", "hyperspectral", "polarization", "event_camera"] as const) {
      expect(cellFor(row, c).state).not.toBe("available");
    }
  });

  it("edge-only modalities say they need an edge node rather than being called unsupported guesses", () => {
    expect(cellFor(row, "thermal_radiometric").state).toBe("requires_edge");
    expect(cellFor(row, "lidar").state).toBe("requires_edge");
    expect(cellFor(row, "radar").state).toBe("requires_edge");
  });

  it("a registered live thermal stream does report radiometric temperature", () => {
    const thermal = buildDeviceMatrix({
      ...base,
      deviceId: "cam-t",
      name: "radiometric core",
      sensor: rgbWebcam({ id: "cam-t", modality: "thermal_radiometric", transport: "edge_bridge", measurable: true }),
      edgeConnected: true,
    });
    expect(cellFor(thermal, "thermal_radiometric").state).toBe("available");
    expect(controlsFor(thermal)).toContain("temperature_readout");
  });

  it("a registered but stalled thermal stream is unavailable, not available", () => {
    const stalled = buildDeviceMatrix({
      ...base,
      sensor: rgbWebcam({ modality: "thermal_radiometric", transport: "edge_bridge", health: "stale" }),
      edgeConnected: true,
    });
    expect(cellFor(stalled, "thermal_radiometric").state).toBe("unavailable");
    expect(cellFor(stalled, "connection").state).toBe("unavailable");
  });
});

describe("capability matrix — declared device capabilities", () => {
  it("an absent declaration stays unknown and never becomes a yes", () => {
    const row = buildDeviceMatrix({ ...base, sensor: rgbWebcam() });
    expect(cellFor(row, "ptz").state).toBe("requires_edge");
    expect(cellFor(row, "codec_h265").evidence).toBe("unknown");
    expect(controlsFor(row)).not.toContain("ptz_pad");
  });

  it("an explicit false from the device is unsupported", () => {
    const row = buildDeviceMatrix({
      ...base,
      sensor: rgbWebcam({ transport: "rtsp" }),
      declared: { ptz: false, codecs: ["H.264"], onvifProfile: "S", audio: true },
      edgeConnected: true,
    });
    expect(cellFor(row, "ptz").state).toBe("unsupported");
    expect(cellFor(row, "codec_h264").state).toBe("available");
    expect(cellFor(row, "codec_h265").state).toBe("unsupported");
    expect(cellFor(row, "onvif").state).toBe("available");
  });
});

describe("capability matrix — software and backend", () => {
  it("inference is not configured when no model is loaded and no service exists", () => {
    const row = buildDeviceMatrix({ ...base, sensor: rgbWebcam() });
    expect(cellFor(row, "inference").state).toBe("not_configured");
    expect(cellFor(row, "tracking").state).toBe("not_configured");
    expect(controlsFor(row)).not.toContain("track_overlay");
  });

  it("a loaded on-device model enables tracking and event detection without any cloud key", () => {
    const row = buildDeviceMatrix({ ...base, sensor: rgbWebcam(), localInferenceReady: true });
    expect(cellFor(row, "inference").state).toBe("available");
    expect(cellFor(row, "tracking").state).toBe("available");
    expect(controlsFor(row)).toEqual(expect.arrayContaining(["track_overlay", "event_rules"]));
  });

  it("a configured but dead inference service is unavailable, not available", () => {
    const row = buildDeviceMatrix({
      ...base,
      sensor: rgbWebcam(),
      services: services({ inference: { configured: true, online: false, detail: "the service is unreachable" } }),
    });
    expect(cellFor(row, "inference").state).toBe("unavailable");
  });

  it("without a recording service, rewind and history are not configured and their controls disappear", () => {
    const row = buildDeviceMatrix({ ...base, sensor: rgbWebcam() });
    expect(cellFor(row, "recording").state).toBe("not_configured");
    expect(cellFor(row, "historical_search").state).toBe("not_configured");
    expect(controlsFor(row)).not.toContain("rewind");
    expect(controlsFor(row)).not.toContain("search_history");
  });

  it("a live recording service enables rewind and search", () => {
    const row = buildDeviceMatrix({
      ...base,
      sensor: rgbWebcam(),
      services: services({ recording: { configured: true, online: true, detail: "online" } }),
    });
    expect(controlsFor(row)).toEqual(expect.arrayContaining(["rewind", "search_history"]));
  });
});

describe("capability matrix — calibration and registration", () => {
  it("an uncalibrated stream may not claim spatial registration", () => {
    const row = buildDeviceMatrix({ ...base, sensor: rgbWebcam() });
    expect(cellFor(row, "calibration").state).toBe("not_configured");
    expect(cellFor(row, "spatial_registration").state).toBe("not_configured");
    expect(controlsFor(row)).toContain("calibrate");
  });

  it("intrinsics plus an operator reference do register the camera into the site frame", () => {
    const row = buildDeviceMatrix({
      ...base,
      sensor: rgbWebcam({
        calibration: {
          state: "operator",
          detail: "two operator reference points",
          intrinsics: { fx: 900, fy: 900, px: 640, py: 360, width: 1280, height: 720 },
          atMs: Date.now(),
        },
      }),
    });
    expect(cellFor(row, "spatial_registration").state).toBe("available");
  });

  it("time synchronisation is unknown until an external clock reports", () => {
    const row = buildDeviceMatrix({ ...base, sensor: rgbWebcam() });
    expect(cellFor(row, "time_sync").state).toBe("unknown");
    const synced = buildDeviceMatrix({
      ...base,
      sensor: rgbWebcam(),
      declared: { timeSync: { source: "ptp grandmaster", offsetMs: 2 } },
    });
    expect(cellFor(synced, "time_sync").state).toBe("available");
  });
});

describe("capability matrix — unregistered device", () => {
  const row = buildDeviceMatrix({ ...base, deviceId: "cam-z", name: "authorized, not connected", sensor: null });

  it("reports no connection and offers no stream control", () => {
    expect(cellFor(row, "connection").state).toBe("unavailable");
    expect(cellFor(row, "video").state).toBe("unsupported");
    expect(controlsFor(row)).toHaveLength(0);
  });

  it("summarises honestly", () => {
    expect(matrixSummary(row)).toContain("available");
  });
});

describe("integration catalog", () => {
  const entries = buildIntegrationCatalog(services(), [
    { id: "browser_media", label: "browser media", reachable: true, detail: "camera permission granted", modalities: ["rgb"] },
  ]);

  it("marks every open standard and open source dependency as free", () => {
    for (const id of ["onvif", "rtsp", "mqtt_mosquitto", "gstreamer", "opencv", "onnxruntime", "frigate", "open3d", "ros2", "bluez", "postgres_pgvector", "openstreetmap"]) {
      const e = entries.find((x) => x.id === id);
      expect(e, id).toBeTruthy();
      expect(["free_open_source", "free_standard"]).toContain(e!.licence);
    }
  });

  it("keeps edge-node software as a contract until an endpoint is configured", () => {
    expect(entries.find((e) => e.id === "gstreamer")!.state).toBe("contract_only");
    expect(entries.find((e) => e.id === "frigate")!.state).toBe("contract_only");
  });

  it("reports a configured but dead service as offline rather than connected", () => {
    const withDead = buildIntegrationCatalog(
      services({ recording: { configured: true, online: false, detail: "the service is unreachable" } }),
      [],
    );
    expect(withDead.find((e) => e.id === "frigate")!.state).toBe("configured_offline");
  });

  it("shows the browser adapter as running in this tab when it reported reachable", () => {
    expect(entries.find((e) => e.id === "browser_mediadevices")!.state).toBe("in_browser");
  });

  it("needs no paid dependency for the core console", () => {
    expect(coreIsFree(entries)).toBe(true);
    expect(entries.find((e) => e.id === "vendor_sdk")!.licence).toBe("optional_paid");
  });
});
