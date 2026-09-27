// contact/seal-quality model. every reading here is derived from characteristics an adapter
// already measured from real packets — dropped/irregular timing, rr-interval plausibility,
// motion-artefact saturation, microphone noise floor. never a synthesised confidence number.
import type { AdapterStatus } from "./devices";

export type ContactQuality = "no-device" | "poor-contact" | "good-contact";

export interface ContactReading {
  id: string;
  label: string;
  quality: ContactQuality;
  detail: string;
  /** the underlying 0..1 figure the adapter computed from real signal characteristics. */
  signalQuality: number | null;
}

/** below this, contact is almost certainly bad (packet gaps, implausible rr, saturation, noise floor). */
export const POOR_CONTACT_FLOOR = 0.35;
/** at or above this, contact is good enough that the read-outs above it should be trusted. */
export const GOOD_CONTACT_FLOOR = 0.65;

export function classifyContact(status: AdapterStatus): ContactReading {
  if (status.state !== "connected") {
    const detail =
      status.state === "unsupported"
        ? "not supported by this browser or device."
        : status.state === "denied"
          ? "permission was not granted."
          : "no device is connected.";
    return { id: status.id, label: status.label, quality: "no-device", detail, signalQuality: null };
  }
  const q = status.signalQuality;
  if (q === null) {
    return { id: status.id, label: status.label, quality: "poor-contact", detail: "connected — waiting for enough packets to judge contact quality.", signalQuality: null };
  }
  if (q >= GOOD_CONTACT_FLOOR) {
    return { id: status.id, label: status.label, quality: "good-contact", detail: `stable signal, ${Math.round(q * 100)}% quality from packet timing and plausibility checks.`, signalQuality: q };
  }
  if (q >= POOR_CONTACT_FLOOR) {
    return { id: status.id, label: status.label, quality: "poor-contact", detail: `marginal signal, ${Math.round(q * 100)}% quality — check fit or placement.`, signalQuality: q };
  }
  return { id: status.id, label: status.label, quality: "poor-contact", detail: `weak signal, ${Math.round(q * 100)}% quality — readings from this sensor are unreliable right now.`, signalQuality: q };
}

export function classifyAll(statuses: AdapterStatus[]): ContactReading[] {
  return statuses.map(classifyContact);
}

/** true only when every connected source currently reads good — the gate a session summary should use before trusting its numbers. */
export function allGoodContact(readings: ContactReading[]): boolean {
  const connected = readings.filter((r) => r.quality !== "no-device");
  return connected.length > 0 && connected.every((r) => r.quality === "good-contact");
}
