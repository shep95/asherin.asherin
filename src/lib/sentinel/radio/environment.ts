// asherin.sentinel — the bluetooth environment ledger.
//
// A scan back-end hands over packets. This turns a stream of packets into a
// record of an environment over time: who is resident, who arrived, who left,
// who followed, and what each of them is disclosing while they do it.
//
// It holds no opinion on where the packets came from — web scan, native radio,
// or the desktop companion — so one ledger serves all three and the timeline
// never has to care which receiver was on.

import {
  advertFingerprint,
  classifyDevice,
  isRandomizedMac,
  rssiToDistance,
  scoreLeakRisk,
  type AdvertPacket,
  type DeviceClassification,
  type LeakScore,
} from "./leakSurface";

export type PresenceState = "present" | "fading" | "departed";

export interface RadioRecord {
  key: string;
  address: string;
  addressIsHardware: boolean;
  randomized: boolean | null;
  fingerprint: string;
  name: string | null;
  classification: DeviceClassification;
  leak: LeakScore;
  rssi: number | null;
  meters: number | null;
  firstSeen: number;
  lastSeen: number;
  sightings: number;
  /** rolling rssi window, newest last, capped. */
  rssiWindow: number[];
  presence: PresenceState;
  /** total ms the radio has been within range across this session. */
  dwellMs: number;
  /** how many separate arrivals — a radio that keeps coming back. */
  visits: number;
  packet: AdvertPacket;
}

export type EnvironmentEventKind = "arrived" | "departed" | "returned" | "risk";

export interface EnvironmentEvent {
  kind: EnvironmentEventKind;
  at: number;
  record: RadioRecord;
  note: string;
}

const RSSI_WINDOW = 24;
/** No packet for this long and the radio is treated as gone rather than quiet. */
const DEPART_MS = 45_000;
const FADE_MS = 15_000;

export interface LedgerOptions {
  departAfterMs?: number;
  fadeAfterMs?: number;
  /** Called for every state change worth writing to the master timeline. */
  onEvent?: (event: EnvironmentEvent) => void;
  now?: () => number;
}

export class BluetoothEnvironment {
  private records = new Map<string, RadioRecord>();
  private opts: Required<Omit<LedgerOptions, "onEvent">> & { onEvent?: (e: EnvironmentEvent) => void };

  constructor(options: LedgerOptions = {}) {
    this.opts = {
      departAfterMs: options.departAfterMs ?? DEPART_MS,
      fadeAfterMs: options.fadeAfterMs ?? FADE_MS,
      now: options.now ?? (() => Date.now()),
      onEvent: options.onEvent,
    };
  }

  /**
   * Key on the hardware address when we have one, else on the fingerprint — so
   * a browser session handle that rotates does not spawn a new "device" every
   * fifteen minutes and inflate the roster with ghosts.
   */
  private keyFor(packet: AdvertPacket, fingerprint: string): string {
    return packet.addressIsHardware ? packet.address.toLowerCase() : `fp:${fingerprint}`;
  }

  observe(packet: AdvertPacket): RadioRecord {
    const at = packet.at || this.opts.now();
    const fingerprint = advertFingerprint(packet);
    const key = this.keyFor(packet, fingerprint);
    const existing = this.records.get(key);
    const classification = classifyDevice(packet);
    const randomized = isRandomizedMac(packet.address, packet.addressIsHardware);

    if (!existing) {
      const record: RadioRecord = {
        key,
        address: packet.address,
        addressIsHardware: packet.addressIsHardware,
        randomized,
        fingerprint,
        name: packet.name,
        classification,
        leak: scoreLeakRisk(packet, classification, { sightings: 1, randomized }),
        rssi: packet.rssi,
        meters: typeof packet.rssi === "number" ? rssiToDistance(packet.rssi, packet.txPower ?? -59) : null,
        firstSeen: at,
        lastSeen: at,
        sightings: 1,
        rssiWindow: typeof packet.rssi === "number" ? [packet.rssi] : [],
        presence: "present",
        dwellMs: 0,
        visits: 1,
        packet,
      };
      this.records.set(key, record);
      this.emit({ kind: "arrived", at, record, note: describe(record) });
      return record;
    }

    const gap = at - existing.lastSeen;
    const wasGone = existing.presence === "departed" || gap > this.opts.departAfterMs;

    existing.address = packet.address;
    existing.addressIsHardware = packet.addressIsHardware;
    existing.randomized = randomized;
    existing.fingerprint = fingerprint;
    if (packet.name) existing.name = packet.name;
    existing.classification = classification;
    existing.rssi = packet.rssi;
    existing.meters = typeof packet.rssi === "number" ? rssiToDistance(packet.rssi, packet.txPower ?? -59) : existing.meters;
    if (typeof packet.rssi === "number") {
      existing.rssiWindow.push(packet.rssi);
      if (existing.rssiWindow.length > RSSI_WINDOW) existing.rssiWindow.shift();
    }
    if (!wasGone) existing.dwellMs += Math.max(0, gap);
    existing.lastSeen = at;
    existing.sightings += 1;
    existing.packet = packet;
    existing.presence = "present";

    const previousRisk = existing.leak.riskLevel;
    existing.leak = scoreLeakRisk(packet, classification, { sightings: existing.sightings, randomized });

    if (wasGone) {
      existing.visits += 1;
      this.emit({
        kind: "returned",
        at,
        record: existing,
        note: `${label(existing)} is back in range after ${Math.round(gap / 1000)}s away — visit ${existing.visits}.`,
      });
    } else if (previousRisk !== existing.leak.riskLevel && rank(existing.leak.riskLevel) > rank(previousRisk)) {
      this.emit({
        kind: "risk",
        at,
        record: existing,
        note: `${label(existing)} now reads ${existing.leak.riskLevel} exposure: ${existing.leak.factors[0]?.factor ?? "new disclosure"}.`,
      });
    }

    return existing;
  }

  /** Ages the roster. Call on a timer; a radio that stops advertising leaves no
   *  packet to trigger this on its own, and silently keeping it "present" would
   *  be the exact false continuity the timeline must not show. */
  sweep(now = this.opts.now()): void {
    for (const record of this.records.values()) {
      const idle = now - record.lastSeen;
      if (record.presence !== "departed" && idle > this.opts.departAfterMs) {
        record.presence = "departed";
        this.emit({
          kind: "departed",
          at: now,
          record,
          note: `${label(record)} left range after ${Math.round((record.lastSeen - record.firstSeen) / 1000)}s in the room.`,
        });
      } else if (record.presence === "present" && idle > this.opts.fadeAfterMs) {
        record.presence = "fading";
      }
    }
  }

  list(): RadioRecord[] {
    return [...this.records.values()].sort((a, b) => {
      if (a.presence !== b.presence) return a.presence === "present" ? -1 : b.presence === "present" ? 1 : 0;
      return (b.rssi ?? -999) - (a.rssi ?? -999);
    });
  }

  get(key: string): RadioRecord | undefined {
    return this.records.get(key);
  }

  /** Radios seen in more than one place — the follow question, answered only
   *  where a location fix existed for each sighting. */
  clear(): void {
    this.records.clear();
  }

  private emit(event: EnvironmentEvent) {
    try {
      this.opts.onEvent?.(event);
    } catch {
      // A consumer throwing must never stop the scan.
    }
  }
}

function rank(level: string): number {
  return level === "critical" ? 4 : level === "high" ? 3 : level === "medium" ? 2 : 1;
}

export function label(record: RadioRecord): string {
  return record.name || `${record.classification.brand} ${record.classification.category}`.trim() || record.address;
}

function describe(record: RadioRecord): string {
  const distance = record.meters != null ? `~${record.meters}m` : "range unknown";
  return `${label(record)} entered range (${distance}, ${record.leak.riskLevel} exposure).`;
}
