// asherin.arvision — passive radio device ledger.
//
// Holds what has been heard, associates repeat sightings without claiming to
// know who anyone is, and writes a provenance-stamped line every time something
// about a device changes. Two disciplines govern it:
//
//  1. Association is not identity. Most modern handsets rotate their broadcast
//     address on purpose. This ledger honours that: when the address is
//     resolvable or non-resolvable random, sightings are grouped only by
//     coarse, non-sensitive broadcast characteristics, the record is flagged
//     pseudonymous, and the handle is a local nickname that means nothing
//     outside this session. Nothing here defeats randomization or recovers a
//     hidden identifier.
//  2. Silence is recorded. A device that stops being heard is marked lost with
//     a timeline line, rather than lingering as though it were still present.

import { classifyDevice } from "./classify";
import { localizeDevice, OBSERVATION_STALE_MS } from "./localize";
import type {
  BleAllowlistEntry,
  BleDeviceRecord,
  BleObservation,
  BleScanner,
  BleTimelineEvent,
} from "./types";

const MAX_OBSERVATIONS_PER_DEVICE = 64;
const MAX_TIMELINE = 200;
export const LOST_AFTER_MS = 60_000;

function hash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

const HANDLE_WORDS = [
  "amber", "basalt", "cedar", "dune", "ember", "flint", "garnet", "harbor",
  "ivory", "jasper", "kelp", "larch", "mica", "nimbus", "onyx", "pewter",
  "quartz", "rowan", "slate", "tundra", "umber", "verdant", "willow", "zinc",
];

function handleFor(key: string): string {
  const h = hash(key);
  const word = HANDLE_WORDS[parseInt(h.slice(0, 4), 36) % HANDLE_WORDS.length];
  return `${word}-${h.slice(-3)}`;
}

/**
 * Association key. A stable address is used as-is. A rotating address is
 * grouped only by characteristics the device itself broadcasts to everyone,
 * and only when those characteristics are distinctive enough to be worth
 * grouping at all — otherwise each rotation is treated as a new device, which
 * is the truthful outcome.
 */
export function associationKey(o: BleObservation): { key: string; pseudonymous: boolean } {
  if (o.address && (o.addressType === "public" || o.addressType === "random_static")) {
    return { key: o.address.toUpperCase(), pseudonymous: false };
  }
  const traits = [
    o.localName ?? "",
    [...o.serviceUuids].sort().join(","),
    [...o.manufacturerIds].sort((a, b) => a - b).join(","),
    o.txPower === null ? "" : String(o.txPower),
    o.appearance === null ? "" : String(o.appearance),
  ].join("|");
  const distinctive = Boolean(o.localName) || o.serviceUuids.length > 0 || o.manufacturerIds.length > 0;
  if (!distinctive) {
    return { key: `ephemeral:${(o.address ?? "anon").toUpperCase()}`, pseudonymous: true };
  }
  return { key: `pseudo:${hash(traits)}`, pseudonymous: true };
}

interface Internal {
  record: BleDeviceRecord;
  observations: BleObservation[];
}

export interface BleTrackerOptions {
  /** resolves a site-frame position to a configured zone, when zones exist. */
  zoneAt?: (p: { x: number; y: number; z: number }) => string | null;
  allowlist?: BleAllowlistEntry[];
}

export class BleTracker {
  private devices = new Map<string, Internal>();
  private scanners = new Map<string, BleScanner>();
  private timeline: BleTimelineEvent[] = [];
  private seq = 0;

  constructor(private options: BleTrackerOptions = {}) {}

  setOptions(options: BleTrackerOptions) {
    this.options = { ...this.options, ...options };
  }

  upsertScanner(scanner: BleScanner) {
    this.scanners.set(scanner.id, scanner);
  }

  removeScanner(id: string) {
    this.scanners.delete(id);
  }

  scannerList(): BleScanner[] {
    return [...this.scanners.values()];
  }

  private event(kind: BleTimelineEvent["kind"], detail: string, provenance: string, atMs: number): BleTimelineEvent {
    this.seq += 1;
    const ev: BleTimelineEvent = { id: `ble_${atMs.toString(36)}_${this.seq}`, atMs, kind, detail, provenance };
    this.timeline.push(ev);
    if (this.timeline.length > MAX_TIMELINE * 4) this.timeline.splice(0, this.timeline.length - MAX_TIMELINE * 4);
    return ev;
  }

  /** Ingest one real advertisement from an authorized scanner. */
  ingest(o: BleObservation): BleDeviceRecord | null {
    if (!this.scanners.has(o.scannerId)) return null;
    const scanner = this.scanners.get(o.scannerId)!;
    this.scanners.set(o.scannerId, { ...scanner, lastObservationMs: o.receivedAtMs, health: "live" });

    const { key, pseudonymous } = associationKey(o);
    let entry = this.devices.get(key);
    const now = o.receivedAtMs;

    if (!entry) {
      const record: BleDeviceRecord = {
        key,
        pseudonymous,
        handle: handleFor(key),
        addresses: o.address ? [o.address.toUpperCase()] : [],
        addressType: o.addressType,
        classification: classifyDevice([o]),
        localization: localizeDevice([o], this.scanners, now),
        lastRssi: o.rssi,
        firstSeenMs: now,
        lastSeenMs: now,
        observations: 1,
        scannerIds: [o.scannerId],
        zoneId: null,
        knownLabel: this.labelFor(key, o.address),
        timeline: [],
        stale: false,
        clockSkewMs: o.receivedAtMs - o.atMs,
      };
      record.timeline.push(
        this.event(
          "first_seen",
          `first advertisement heard, received strength ${o.rssi} dBm`,
          `${scanner.label} via ${o.provenance}`,
          now,
        ),
      );
      entry = { record, observations: [o] };
      this.devices.set(key, entry);
      this.recompute(entry, now);
      return entry.record;
    }

    const wasLost = entry.record.stale || now - entry.record.lastSeenMs > LOST_AFTER_MS;
    entry.observations.push(o);
    if (entry.observations.length > MAX_OBSERVATIONS_PER_DEVICE) {
      entry.observations.splice(0, entry.observations.length - MAX_OBSERVATIONS_PER_DEVICE);
    }
    const rec = entry.record;
    if (o.address) {
      const addr = o.address.toUpperCase();
      if (!rec.addresses.includes(addr)) {
        rec.addresses.push(addr);
        rec.timeline.push(
          this.event(
            "address_rotated",
            `this device is now broadcasting under a different address, which is normal privacy behaviour`,
            `${scanner.label} via ${o.provenance}`,
            now,
          ),
        );
      }
    }
    if (!rec.scannerIds.includes(o.scannerId)) rec.scannerIds.push(o.scannerId);
    rec.lastRssi = o.rssi;
    rec.lastSeenMs = now;
    rec.observations += 1;
    rec.stale = false;
    rec.clockSkewMs = o.receivedAtMs - o.atMs;
    if (wasLost) {
      rec.timeline.push(this.event("returned", "this device is being heard again after a silence", `${scanner.label} via ${o.provenance}`, now));
    }
    this.recompute(entry, now);
    return rec;
  }

  private labelFor(key: string, address: string | null): string | null {
    const list = this.options.allowlist ?? [];
    const hit = list.find(
      (e) => e.match.toUpperCase() === key.toUpperCase() || (address && e.match.toUpperCase() === address.toUpperCase()),
    );
    return hit ? hit.label : null;
  }

  private recompute(entry: Internal, now: number) {
    const rec = entry.record;
    const provenance = `scanners ${rec.scannerIds.join(", ")}`;

    const nextClass = classifyDevice(entry.observations);
    if (nextClass.category !== rec.classification.category || nextClass.vendor !== rec.classification.vendor) {
      rec.timeline.push(
        this.event(
          "classification_changed",
          `classified as ${nextClass.category}${nextClass.vendor ? ` (${nextClass.vendor})` : ""} at confidence ${nextClass.confidence}`,
          provenance,
          now,
        ),
      );
    } else if (Math.abs(nextClass.confidence - rec.classification.confidence) >= 0.15) {
      rec.timeline.push(
        this.event("confidence_changed", `classification confidence moved to ${nextClass.confidence}`, provenance, now),
      );
    }
    rec.classification = nextClass;

    const prev = rec.localization;
    const next = localizeDevice(entry.observations, this.scanners, now);
    const movedEnough =
      prev.mode !== next.mode ||
      (next.position && prev.position
        ? Math.hypot(next.position.x - prev.position.x, next.position.y - prev.position.y, next.position.z - prev.position.z) >
          Math.max(0.5, (next.uncertaintyM ?? 1) * 0.5)
        : false) ||
      (next.rangeM !== null && prev.rangeM !== null && Math.abs(next.rangeM - prev.rangeM) > Math.max(0.5, (next.uncertaintyM ?? 1) * 0.5));
    if (movedEnough) {
      rec.timeline.push(
        this.event(
          "localization_changed",
          next.mode === "multilateration" && next.position
            ? `position estimate ${next.position.x.toFixed(1)}, ${next.position.y.toFixed(1)}, ${next.position.z.toFixed(1)} m ±${next.uncertaintyM}m from ${next.scannerCount} scanners`
            : next.mode === "range_only"
              ? `range estimate ${next.rangeM}m ±${next.uncertaintyM}m, direction unknown`
              : "no location can be established from the available receivers",
          provenance,
          now,
        ),
      );
    }
    rec.localization = next;

    const zone = next.position && this.options.zoneAt ? this.options.zoneAt(next.position) : null;
    if (zone !== rec.zoneId) {
      if (rec.zoneId) rec.timeline.push(this.event("zone_left", `left monitored zone ${rec.zoneId}`, provenance, now));
      if (zone) rec.timeline.push(this.event("zone_entered", `entered monitored zone ${zone}`, provenance, now));
      rec.zoneId = zone;
    }

    rec.knownLabel = this.labelFor(rec.key, rec.addresses[rec.addresses.length - 1] ?? null);
    if (rec.timeline.length > MAX_TIMELINE) rec.timeline.splice(0, rec.timeline.length - MAX_TIMELINE);
  }

  /** Age silent devices and silent scanners. Call on a timer. */
  sweep(now: number = Date.now()): void {
    for (const entry of this.devices.values()) {
      const rec = entry.record;
      const silent = now - rec.lastSeenMs;
      if (!rec.stale && silent > OBSERVATION_STALE_MS) {
        rec.stale = true;
        rec.localization = localizeDevice(entry.observations, this.scanners, now);
      }
      if (silent > LOST_AFTER_MS && rec.timeline[rec.timeline.length - 1]?.kind !== "lost") {
        rec.timeline.push(
          this.event("lost", `no advertisement for ${Math.round(silent / 1000)}s`, `scanners ${rec.scannerIds.join(", ")}`, now),
        );
      }
    }
    for (const [id, s] of this.scanners) {
      if (s.lastObservationMs && now - s.lastObservationMs > OBSERVATION_STALE_MS && s.health === "live") {
        this.scanners.set(id, { ...s, health: "stale" });
      }
    }
  }

  devicesList(): BleDeviceRecord[] {
    return [...this.devices.values()].map((e) => e.record).sort((a, b) => b.lastSeenMs - a.lastSeenMs);
  }

  observationsFor(key: string): BleObservation[] {
    return this.devices.get(key)?.observations.slice() ?? [];
  }

  timelineList(): BleTimelineEvent[] {
    return this.timeline.slice(-MAX_TIMELINE).reverse();
  }

  clear() {
    this.devices.clear();
    this.timeline = [];
  }
}
