// honest capability read-out: what the currently connected hardware actually exposes,
// discovered from real gatt/api responses, never from a device's theoretical spec sheet.
import type { HeartExposure, EegExposure, MotionExposure, AudioExposure } from "./devices";

export interface CapabilityEntry {
  id: string;
  label: string;
  exposed: boolean;
  detail: string;
}

export interface HardwareExposureSnapshot {
  heart: HeartExposure;
  eeg: EegExposure;
  motion: MotionExposure;
  audio: AudioExposure;
}

export function heartCapabilityEntries(exposure: HeartExposure): CapabilityEntry[] {
  if (!exposure.connected) return [];
  const name = exposure.deviceName ?? "connected device";
  return [
    { id: "heart-rate", label: "heart rate", exposed: true, detail: `${name} reports heart rate.` },
    { id: "heart-rr", label: "beat-to-beat intervals (hrv)", exposed: exposure.rrIntervals, detail: exposure.rrIntervals ? `${name} reports rr intervals, so hrv can be computed.` : `${name} reports rate only — no rr intervals, so hrv cannot be computed from this device.` },
    { id: "heart-battery", label: "battery level", exposed: exposure.battery, detail: exposure.battery ? `${name} exposes a battery reading.` : `${name} does not expose a battery service.` },
    { id: "heart-spo2", label: "pulse oximetry", exposed: exposure.spo2, detail: exposure.spo2 ? `${name} exposes spo2.` : `${name} does not expose pulse oximetry.` },
    { id: "heart-temp", label: "temperature", exposed: exposure.temperature, detail: exposure.temperature ? `${name} exposes a temperature reading.` : `${name} does not expose a temperature sensor.` },
  ];
}

export function eegCapabilityEntries(exposure: EegExposure): CapabilityEntry[] {
  if (!exposure.connected) return [];
  const name = exposure.deviceName ?? "connected headband";
  return [
    {
      id: "eeg-channels",
      label: "eeg channels",
      exposed: exposure.channelsSeen.length > 0,
      detail: exposure.channelsSeen.length > 0 ? `${name} is streaming ${exposure.channelsSeen.length} channel(s): ${exposure.channelsSeen.join(", ")}.` : `${name} is connected but no channel has produced a packet yet.`,
    },
  ];
}

export function motionCapabilityEntries(exposure: MotionExposure): CapabilityEntry[] {
  if (!exposure.connected) return [];
  return [
    { id: "motion-accel", label: "acceleration", exposed: true, detail: "this device reports acceleration." },
    { id: "motion-rotation", label: "rotation rate", exposed: exposure.rotationRate, detail: exposure.rotationRate ? "this device also reports rotation rate." : "this device does not report rotation rate, only acceleration." },
  ];
}

export function audioCapabilityEntries(exposure: AudioExposure): CapabilityEntry[] {
  if (!exposure.connected) return [];
  return [
    { id: "audio-spectrum", label: "microphone spectrum", exposed: exposure.sampleRate !== null, detail: exposure.sampleRate !== null ? `sampling at ${exposure.sampleRate} hz.` : "connected, waiting for the first audio frame." },
  ];
}

/** the full honest read-out for whatever is connected right now — empty entries for anything not connected. */
export function capabilityReadout(snapshot: HardwareExposureSnapshot): CapabilityEntry[] {
  return [
    ...heartCapabilityEntries(snapshot.heart),
    ...eegCapabilityEntries(snapshot.eeg),
    ...motionCapabilityEntries(snapshot.motion),
    ...audioCapabilityEntries(snapshot.audio),
  ];
}
