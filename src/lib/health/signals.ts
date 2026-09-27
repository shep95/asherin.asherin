// live biosignal layer. everything here reads a real sensor through a standard browser api
// or reports honestly that the sensor is unavailable. nothing is simulated, and no value is
// shown unless a device actually produced it.
import type { Finding } from "./model";

export type SignalSource = "ble-heart-rate" | "device-motion" | "camera-ppg";

export interface Capability {
  source: SignalSource;
  label: string;
  available: boolean;
  reason: string;
  requiresGesture: boolean;
}

export function detectCapabilities(): Capability[] {
  const secure = typeof window !== "undefined" && window.isSecureContext;
  const ble = typeof navigator !== "undefined" && "bluetooth" in navigator;
  const motion = typeof window !== "undefined" && "DeviceMotionEvent" in window;
  const media = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  return [
    {
      source: "ble-heart-rate",
      label: "bluetooth heart rate strap or earbud",
      available: !!ble && secure,
      reason: !secure
        ? "bluetooth needs a secure connection."
        : ble
          ? "pair any device that exposes the standard heart rate service."
          : "this browser does not expose web bluetooth. chrome or edge on desktop and android do.",
      requiresGesture: true,
    },
    {
      source: "device-motion",
      label: "device motion (tremor and steadiness)",
      available: motion && secure,
      reason: motion
        ? "hold the phone still against the body; motion sampling runs at the device rate."
        : "no motion sensor is exposed by this device or browser.",
      requiresGesture: true,
    },
    {
      source: "camera-ppg",
      label: "camera pulse estimate",
      available: media && secure,
      reason: media
        ? "a camera pulse estimate is coarse and is labelled as an estimate wherever it appears."
        : "no camera access is available in this context.",
      requiresGesture: true,
    },
  ];
}

export interface HeartSample {
  bpm: number;
  /** beat to beat intervals in milliseconds, when the device reports them. */
  rr: number[];
  at: number;
}

export interface HeartMetrics {
  bpm: number;
  /** root mean square of successive differences, the standard short-window hrv measure. */
  rmssd: number | null;
  sdnn: number | null;
  beats: number;
  rrAvailable: boolean;
}

export function computeHeartMetrics(samples: HeartSample[]): HeartMetrics | null {
  if (samples.length === 0) return null;
  const rr = samples.flatMap((s) => s.rr).filter((v) => v > 250 && v < 2200);
  const bpm = Math.round(samples.slice(-5).reduce((a, s) => a + s.bpm, 0) / Math.min(5, samples.length));
  if (rr.length < 8) return { bpm, rmssd: null, sdnn: null, beats: rr.length, rrAvailable: rr.length > 0 };
  let sq = 0;
  for (let i = 1; i < rr.length; i++) sq += (rr[i] - rr[i - 1]) ** 2;
  const rmssd = Math.sqrt(sq / (rr.length - 1));
  const mean = rr.reduce((a, b) => a + b, 0) / rr.length;
  const sdnn = Math.sqrt(rr.reduce((a, b) => a + (b - mean) ** 2, 0) / rr.length);
  return { bpm, rmssd: Math.round(rmssd), sdnn: Math.round(sdnn), beats: rr.length, rrAvailable: true };
}

/** parse the standard bluetooth heart rate measurement characteristic (0x2a37). */
export function parseHeartRateValue(view: DataView): HeartSample {
  const flags = view.getUint8(0);
  const wide = (flags & 0x01) === 1;
  let offset = 1;
  const bpm = wide ? view.getUint16(offset, true) : view.getUint8(offset);
  offset += wide ? 2 : 1;
  if (flags & 0x08) offset += 2; // energy expended
  const rr: number[] = [];
  if (flags & 0x10) {
    for (; offset + 1 < view.byteLength; offset += 2) rr.push((view.getUint16(offset, true) / 1024) * 1000);
  }
  return { bpm, rr, at: Date.now() };
}

export interface BleConnection {
  deviceName: string;
  disconnect: () => void;
}

/** connect to a standard heart rate service. throws with a plain-language reason. */
export async function connectHeartRate(
  onSample: (sample: HeartSample) => void,
  onDisconnect: () => void,
): Promise<BleConnection> {
  const bluetooth = (navigator as Navigator & { bluetooth?: any }).bluetooth;
  if (!bluetooth) throw new Error("web bluetooth is not available in this browser.");
  const device = await bluetooth.requestDevice({ filters: [{ services: ["heart_rate"] }], optionalServices: ["battery_service"] });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService("heart_rate");
  const characteristic = await service.getCharacteristic("heart_rate_measurement");
  const handler = (event: Event) => {
    const value = (event.target as unknown as { value: DataView }).value;
    if (value) onSample(parseHeartRateValue(value));
  };
  characteristic.addEventListener("characteristicvaluechanged", handler);
  await characteristic.startNotifications();
  device.addEventListener("gattserverdisconnected", onDisconnect);
  return {
    deviceName: device.name || "heart rate device",
    disconnect: () => {
      try {
        characteristic.removeEventListener("characteristicvaluechanged", handler);
        device.removeEventListener("gattserverdisconnected", onDisconnect);
        if (device.gatt?.connected) device.gatt.disconnect();
      } catch {
        /* the device may already be gone; nothing to report. */
      }
    },
  };
}

export interface MotionMetrics {
  /** rms acceleration in the 4–12 hz tremor band, m/s². */
  tremorRms: number;
  /** dominant frequency in that band, hz. */
  dominantHz: number;
  samples: number;
  sampleRateHz: number;
}

/** goertzel magnitude at one frequency — cheaper and steadier than a full fft here. */
function goertzel(data: number[], freq: number, rate: number): number {
  const k = (2 * Math.PI * freq) / rate;
  const coeff = 2 * Math.cos(k);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (const x of data) {
    s0 = x + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2) / (data.length / 2);
}

export function computeMotionMetrics(series: { t: number; a: number }[]): MotionMetrics | null {
  if (series.length < 64) return null;
  const duration = (series[series.length - 1].t - series[0].t) / 1000;
  if (duration <= 0) return null;
  const rate = series.length / duration;
  const mean = series.reduce((a, s) => a + s.a, 0) / series.length;
  const centred = series.map((s) => s.a - mean);
  let best = { hz: 0, mag: 0 };
  for (let hz = 4; hz <= Math.min(12, rate / 2 - 0.5); hz += 0.5) {
    const mag = goertzel(centred, hz, rate);
    if (mag > best.mag) best = { hz, mag };
  }
  const rms = Math.sqrt(centred.reduce((a, v) => a + v * v, 0) / centred.length);
  return { tremorRms: Number(rms.toFixed(3)), dominantHz: best.hz, samples: series.length, sampleRateHz: Number(rate.toFixed(1)) };
}

export function signalFindings(heart: HeartMetrics | null, motion: MotionMetrics | null): Finding[] {
  const out: Finding[] = [];
  if (heart) {
    out.push({
      id: "live:heart",
      layer: "live",
      label: `heart rate ${heart.bpm} bpm`,
      detail: heart.rmssd !== null ? `rmssd ${heart.rmssd} ms over ${heart.beats} intervals.` : "this device reports rate but not beat-to-beat intervals, so hrv cannot be computed.",
      mechanism:
        "rate is set by the sinus node under vagal and sympathetic balance. rmssd is dominated by the vagal component, which is why it drops with stress, illness and alcohol.",
      nextStep: "a single reading means little; the trend across matched conditions is the signal.",
      territoryKeys: ["heart", "vagus", "sympathetic-chain"],
      direction: "active",
      weight: 0.5,
      source: "live bluetooth sensor",
    });
  }
  if (motion) {
    out.push({
      id: "live:motion",
      layer: "live",
      label: `steadiness ${motion.tremorRms.toFixed(2)} m/s² at ${motion.dominantHz} hz`,
      detail: `measured over ${motion.samples} samples at about ${motion.sampleRateHz} hz.`,
      mechanism:
        "physiological tremor sits around 8–12 hz; slower dominant frequencies with higher amplitude are worth tracking rather than interpreting here.",
      nextStep: "repeat under the same conditions — posture and caffeine both move this number.",
      territoryKeys: ["muscle", "cerebellum", "basal-ganglia"],
      direction: "active",
      weight: 0.4,
      source: "device motion sensor",
    });
  }
  return out;
}
