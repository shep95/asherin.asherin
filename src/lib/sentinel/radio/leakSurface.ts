// asherin.sentinel — the bluetooth leak surface.
//
// A bluetooth radio in a room is not silent. It shouts, unprompted, several
// times a second, to anybody with a receiver. This module is the reading of
// that shout: what a packet discloses, how identifying it is, and what the
// owner can actually do about it.
//
// Two honesty rules are load-bearing here, because breaking either turns a
// privacy tool into a surveillance tool with a nicer font:
//
//   1. Everything below is read from a *broadcast*. Nothing connects, pairs,
//      queries, or handshakes. A device that advertises has already published
//      these fields to the whole room.
//   2. A radio near you is a radio near you. It is never a person, never an
//      identity, never attribution. The scoring calls out fingerprintability;
//      it never claims to know whose pocket the radio is in.
//
// The scoring is deliberately conservative in one direction only: it would
// rather tell an owner their own device leaks than tell them it is safe when
// it is not.

/** One advertising packet as observed, normalized across scan back-ends. */
export interface AdvertPacket {
  /** MAC where the platform exposes it (companion), else a session handle. */
  address: string;
  /** true when `address` is a real hardware/BLE address rather than a browser
   *  session id — a session id can say nothing about randomization. */
  addressIsHardware: boolean;
  /** complete or shortened local name, exactly as advertised. */
  name: string | null;
  rssi: number | null;
  txPower: number | null;
  /** advertised service uuids, lowercased, full or short form. */
  serviceUuids: string[];
  /** assigned company identifier → raw payload bytes. */
  manufacturerData: Record<number, number[]>;
  /** service data keyed by uuid, when the back-end exposes it. */
  serviceData?: Record<string, number[]>;
  /** BLE appearance code. */
  appearance: number | null;
  /** classic bluetooth class-of-device, when the back-end exposes it. */
  deviceClass?: number | null;
  /** ms epoch the packet was received. */
  at: number;
}

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface LeakFactor {
  factor: string;
  risk: "low" | "medium" | "high";
  detail: string;
}

export interface DeviceClassification {
  brand: string;
  category: string;
  isMedical: boolean;
  isAudio: boolean;
  isInput: boolean;
  isPhone: boolean;
  isWearable: boolean;
  isTracker: boolean;
  ecosystem: string;
  services: string[];
}

export interface LeakScore {
  totalScore: number;
  riskLevel: RiskLevel;
  factors: LeakFactor[];
  recommendations: string[];
}

// ── bluetooth SIG assigned company identifiers ───────────────────────────────
// Only vendors a room actually meets. Anything unlisted prints its raw id — a
// guessed brand in an evidence record is worse than an honest hex number.
export const MANUFACTURER_IDS: Record<number, string> = {
  0x0006: "microsoft",
  0x000f: "broadcom",
  0x0016: "texas instruments",
  0x002d: "sennheiser",
  0x004c: "apple",
  0x004f: "logitech",
  0x0059: "nordic semiconductor",
  0x0075: "samsung",
  0x0078: "nike",
  0x0087: "garmin",
  0x008a: "jabra",
  0x00c4: "lg electronics",
  0x00e0: "google",
  0x0117: "sony",
  0x0131: "cypress",
  0x0157: "anhui huami (amazfit)",
  0x0171: "amazon",
  0x01d7: "fitbit",
  0x0224: "bose",
  0x02d0: "tile",
  0x038f: "xiaomi",
  0x0499: "ruuvi",
  0x05a7: "sonos",
  0x0644: "chipolo",
};

/** Sixteen-bit service uuids, in the short form a packet carries them. */
export const SERVICE_UUID_MAP: Record<string, string> = {
  "1802": "immediate_alert",
  "1803": "link_loss",
  "1804": "tx_power",
  "180a": "device_information",
  "180d": "heart_rate_monitor",
  "180f": "battery_service",
  "1810": "blood_pressure",
  "1812": "human_interface_device",
  "1816": "cycling_speed",
  "1818": "cycling_power",
  "181a": "environmental_sensing",
  "181b": "body_composition",
  "181c": "user_data",
  "181d": "weight_scale",
  "181f": "continuous_glucose_monitor",
  "1826": "fitness_machine",
  "183a": "insulin_delivery",
  "fd5a": "samsung_quick_share",
  "fd44": "apple_continuity",
  "fd6f": "exposure_notification",
  "fe2c": "google_fast_pair",
  "fe9f": "google_fast_pair_legacy",
  "feed": "tile_tracker",
  "fe59": "nordic_dfu_update_mode",
  "fd82": "sony_headphones",
  "110b": "audio_sink",
  "111e": "handsfree",
};

const MEDICAL_SERVICES = new Set([
  "heart_rate_monitor",
  "blood_pressure",
  "continuous_glucose_monitor",
  "insulin_delivery",
  "body_composition",
  "weight_scale",
]);

const AUDIO_SERVICES = new Set(["audio_sink", "handsfree", "sony_headphones"]);
const TRACKER_SERVICES = new Set(["tile_tracker", "immediate_alert", "link_loss"]);

/**
 * Randomized BLE addresses are locally administered: bit 1 of the first octet
 * is set. A device handing us a browser session id instead of a MAC tells us
 * nothing about randomization at all, and saying "randomized ✓" there would be
 * a comforting lie — so this returns null rather than false.
 */
export function isRandomizedMac(address: string, addressIsHardware = true): boolean | null {
  if (!addressIsHardware) return null;
  const first = address.split(/[:\-]/)[0];
  const octet = Number.parseInt(first, 16);
  if (!Number.isFinite(octet)) return null;
  return Boolean(octet & 0x02);
}

/** Short 16-bit form of a uuid in any of the shapes a back-end may hand over. */
export function shortUuid(uuid: string): string {
  const u = uuid.toLowerCase().replace(/[{}]/g, "");
  if (u.length === 36 && u.startsWith("0000")) return u.slice(4, 8);
  if (u.length === 4) return u;
  if (u.length === 8 && u.startsWith("0000")) return u.slice(4, 8);
  return u.slice(0, 8);
}

/** Log-distance path loss. A band, never a fix — walls, bodies and pockets all
 *  move this by metres, which is why the caller labels it "approximate". */
export function rssiToDistance(rssi: number, txPowerAt1m = -59, pathLossExponent = 2.7): number {
  const d = Math.pow(10, (txPowerAt1m - rssi) / (10 * pathLossExponent));
  return Math.round(d * 10) / 10;
}

export function classifyDevice(packet: AdvertPacket): DeviceClassification {
  const c: DeviceClassification = {
    brand: "unknown",
    category: "unknown",
    isMedical: false,
    isAudio: false,
    isInput: false,
    isPhone: false,
    isWearable: false,
    isTracker: false,
    ecosystem: "unknown",
    services: [],
  };

  for (const key of Object.keys(packet.manufacturerData)) {
    const id = Number(key);
    const brand = MANUFACTURER_IDS[id];
    if (brand) {
      c.brand = brand;
      c.ecosystem = brand;
      break;
    }
  }

  for (const uuid of packet.serviceUuids) {
    const service = SERVICE_UUID_MAP[shortUuid(uuid)];
    if (!service) continue;
    c.services.push(service);
    if (MEDICAL_SERVICES.has(service)) {
      c.isMedical = true;
      c.category = "medical device";
    }
    if (AUDIO_SERVICES.has(service)) {
      c.isAudio = true;
      if (c.category === "unknown") c.category = "audio";
    }
    if (TRACKER_SERVICES.has(service)) c.isTracker = true;
    if (service === "human_interface_device") {
      c.isInput = true;
      if (c.category === "unknown") c.category = "keyboard or mouse";
    }
    if (service === "google_fast_pair" || service === "google_fast_pair_legacy") {
      if (c.ecosystem === "unknown") c.ecosystem = "google";
    }
  }

  // Appearance is the device's own statement of what it is. It outranks a
  // service guess, because a watch that also advertises heart rate is a watch.
  const a = packet.appearance ?? 0;
  if (a) {
    if (a >= 0x0040 && a <= 0x004f) {
      c.category = "phone";
      c.isPhone = true;
    } else if (a >= 0x0080 && a <= 0x008f) {
      c.category = "display";
    } else if (a >= 0x00c0 && a <= 0x00cf) {
      c.category = "watch";
      c.isWearable = true;
    } else if (a >= 0x0300 && a <= 0x030f) {
      c.category = "thermometer";
      c.isMedical = true;
    } else if (a >= 0x0340 && a <= 0x034f) {
      c.category = "heart rate sensor";
      c.isMedical = true;
      c.isWearable = true;
    } else if (a >= 0x0380 && a <= 0x038f) {
      c.category = "blood pressure monitor";
      c.isMedical = true;
    } else if (a >= 0x03c0 && a <= 0x03cf) {
      c.category = "keyboard or mouse";
      c.isInput = true;
    } else if (a >= 0x0440 && a <= 0x044f) {
      c.category = "glucose meter";
      c.isMedical = true;
    } else if (a >= 0x0c40 && a <= 0x0c4f) {
      c.category = "insulin pump";
      c.isMedical = true;
    } else if (a >= 0x0340 && a <= 0x037f) {
      c.category = "fitness tracker";
      c.isWearable = true;
    }
  }

  // Classic class-of-device, when a companion scan supplies it.
  const cod = packet.deviceClass ?? 0;
  if (cod) {
    const major = (cod >> 8) & 0x1f;
    const byMajor: Record<number, string> = {
      1: "computer",
      2: "phone",
      3: "network access point",
      4: "audio",
      5: "keyboard or mouse",
      6: "imaging device",
      7: "wearable",
      8: "toy",
      9: "health device",
    };
    if (byMajor[major] && c.category === "unknown") c.category = byMajor[major];
    if (major === 2) c.isPhone = true;
    if (major === 4) c.isAudio = true;
    if (major === 5) c.isInput = true;
    if (major === 7) c.isWearable = true;
    if (major === 9) {
      c.isMedical = true;
      c.category = "health device";
    }
  }

  if (c.category === "unknown" && c.brand !== "unknown") c.category = `${c.brand} device`;
  return c;
}

const PERSONAL_NAME_HINTS = ["'s ", "’s ", "iphone", "ipad", "galaxy", "pixel", "airpods", "macbook", "watch"];

/**
 * The fingerprint. Randomizing a MAC only helps if the rest of the broadcast is
 * not itself unique — and for most devices it is. This is the same trait set an
 * adversary would join on, computed so the owner can see their own exposure.
 * Deliberately excludes the address, so a rotated address produces the same
 * fingerprint and the "randomization did not save you" case becomes visible.
 */
export function advertFingerprint(packet: AdvertPacket): string {
  const parts = [
    packet.name ?? "",
    [...packet.serviceUuids].map(shortUuid).sort().join(","),
    Object.keys(packet.manufacturerData)
      .map((k) => `${k}:${(packet.manufacturerData[Number(k)] ?? []).slice(0, 4).join("-")}`)
      .sort()
      .join("|"),
    packet.appearance ?? "",
    packet.txPower ?? "",
  ].join("~");
  // FNV-1a: short, stable, and no crypto promise implied by the name.
  let h = 0x811c9dc5;
  for (let i = 0; i < parts.length; i++) {
    h ^= parts.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** How many independent traits this broadcast carries. Two or more is where
 *  joining becomes reliable regardless of address rotation. */
export function fingerprintTraitCount(packet: AdvertPacket): number {
  let n = 0;
  if (packet.name) n++;
  if (packet.serviceUuids.length) n++;
  if (Object.keys(packet.manufacturerData).length) n++;
  if (packet.appearance) n++;
  if (typeof packet.txPower === "number") n++;
  return n;
}

export function scoreLeakRisk(
  packet: AdvertPacket,
  classification: DeviceClassification,
  opts: { sightings?: number; randomized?: boolean | null } = {},
): LeakScore {
  const factors: LeakFactor[] = [];
  let score = 0;

  const randomized = opts.randomized ?? isRandomizedMac(packet.address, packet.addressIsHardware);

  if (randomized === false) {
    score += 40;
    factors.push({
      factor: "persistent hardware address",
      risk: "high",
      detail:
        "this radio broadcasts a permanent unique address. anyone scanning, anywhere, can recognise the same device again — across days and across locations — with no connection and no consent.",
    });
  } else if (randomized === null) {
    factors.push({
      factor: "address randomization unknown",
      risk: "low",
      detail:
        "this scan back-end hands over a session handle rather than the real address, so whether the device rotates its address cannot be read from here. run the desktop companion for the true address.",
    });
  }

  const name = (packet.name ?? "").toLowerCase();
  if (name && PERSONAL_NAME_HINTS.some((hint) => name.includes(hint))) {
    score += 20;
    factors.push({
      factor: "identifying device name",
      risk: "medium",
      detail: `the name "${packet.name}" is broadcast in the clear and reveals the brand, often the model, and sometimes the owner's own name.`,
    });
  }

  if (classification.isMedical) {
    score += 30;
    factors.push({
      factor: "medical or health service advertised",
      risk: "high",
      detail:
        "this device publishes a health service identifier. a passer-by with a scanner can infer medical device use without ever connecting to it.",
    });
  }

  if (Object.keys(packet.manufacturerData).length) {
    score += 15;
    factors.push({
      factor: "manufacturer payload present",
      risk: "medium",
      detail:
        classification.brand === "apple"
          ? "an apple proximity payload is being broadcast. it carries ecosystem and device-state hints that fingerprint this device even while the address rotates."
          : "a manufacturer-specific payload is being broadcast. it fingerprints this device even while the address rotates.",
    });
  }

  if (classification.isTracker) {
    score += 20;
    factors.push({
      factor: "item-tracker behaviour",
      risk: "high",
      detail:
        "this radio advertises a tracker or link-loss service. if it is not yours, treat an unfamiliar tracker that follows you between locations as the thing it looks like.",
    });
  }

  const traits = fingerprintTraitCount(packet);
  if (randomized === true && traits >= 3) {
    score += 15;
    factors.push({
      factor: "fingerprintable despite randomization",
      risk: "medium",
      detail: `the address rotates, but ${traits} other broadcast traits stay constant. joined together they identify this device more reliably than the address ever did.`,
    });
  }

  if (typeof packet.rssi === "number" && packet.rssi > -60) {
    score += 10;
    factors.push({
      factor: "strong signal",
      risk: "low",
      detail: `${packet.rssi} dbm puts this radio within a few metres — close enough that every field above is being read cleanly by anything else in the room.`,
    });
  }

  if ((opts.sightings ?? 1) >= 20) {
    factors.push({
      factor: "persistent presence",
      risk: "low",
      detail: `seen ${opts.sightings} times in this session — a resident radio rather than something passing by.`,
    });
  }

  const riskLevel: RiskLevel = score >= 70 ? "critical" : score >= 45 ? "high" : score >= 25 ? "medium" : "low";

  return { totalScore: score, riskLevel, factors, recommendations: recommend(packet, classification, randomized) };
}

function recommend(packet: AdvertPacket, c: DeviceClassification, randomized: boolean | null): string[] {
  const out: string[] = [];

  if (randomized === false) {
    out.push(
      "turn on bluetooth address randomization for this device. on iphone and ipad it is settings → privacy & security → bluetooth (and 'private wi-fi address' per network). on android it lives in bluetooth settings or developer options depending on the maker. many headphones and speakers cannot do it at all — for those, switching bluetooth off when unused is the only real control.",
    );
  }

  const name = packet.name ?? "";
  if (name && PERSONAL_NAME_HINTS.some((h) => name.toLowerCase().includes(h))) {
    out.push(`rename this device away from "${name}" to something that names neither you nor the model.`);
  }

  if (c.isMedical) {
    out.push(
      "switch bluetooth off on this health device between syncs where the device allows it. the service identifier it advertises discloses medical use to any scanner in range, and that disclosure happens before any pairing.",
    );
  }

  if (Object.keys(packet.manufacturerData).length) {
    out.push(
      "the manufacturer payload cannot be switched off on most devices. treat crowded places as places where this device is recognisable, and power bluetooth down when you need to not be.",
    );
  }

  if (c.isTracker) {
    out.push(
      "if this tracker is not yours, use the maker's own scan app to make it play a sound, then remove it. do not carry it home first.",
    );
  }

  if (!out.length) {
    out.push("nothing actionable on this device from what it is broadcasting right now.");
  }
  return out;
}
