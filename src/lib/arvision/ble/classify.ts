// asherin.arvision — transparent bluetooth classification.
//
// Every conclusion here comes from a fact the device broadcast on its own, and
// every conclusion carries the fact that produced it. There is no model, no
// hidden weighting and no guess dressed as a reading: if nothing matches, the
// answer is unknown, which is a legitimate answer.
//
// Company identifiers are the bluetooth SIG assigned numbers; service uuids are
// the SIG assigned GATT services. Both are public registries.

import type { BleCategory, BleClassification, BleObservation } from "./types";

/** Bluetooth SIG company identifiers. Public registry, no inference. */
export const COMPANY_IDS: Record<number, string> = {
  0x0006: "Microsoft",
  0x004c: "Apple, Inc.",
  0x004f: "Logitech",
  0x0075: "Samsung Electronics",
  0x0087: "Garmin International",
  0x00e0: "Google",
  0x0117: "Sony",
  0x0157: "Anhui Huami",
  0x0171: "Amazon",
  0x01d7: "Bose",
  0x0499: "Ruuvi Innovations",
  0x038f: "Xiaomi",
  0x05a7: "Sonos",
  0x0059: "Nordic Semiconductor",
};

/** SIG assigned service uuids, 16 bit short form, lowercase. */
const SERVICE_CATEGORY: Record<string, { category: BleCategory; label: string }> = {
  "180d": { category: "medical", label: "heart rate service" },
  "1808": { category: "medical", label: "glucose service" },
  "1810": { category: "medical", label: "blood pressure service" },
  "180f": { category: "peripheral", label: "battery service" },
  "1812": { category: "peripheral", label: "human interface device service" },
  "110b": { category: "audio", label: "audio sink service" },
  "fe9f": { category: "beacon", label: "eddystone beacon service" },
  "feaa": { category: "beacon", label: "eddystone beacon service" },
  "fd6f": { category: "phone", label: "exposure notification service" },
  "fe2c": { category: "audio", label: "google fast pair service" },
  "181a": { category: "sensor", label: "environmental sensing service" },
};

const NAME_RULES: Array<{ re: RegExp; category: BleCategory; label: string }> = [
  { re: /\b(airpods|buds|headphone|headset|speaker|soundlink|beats)\b/i, category: "audio", label: "advertised name matches audio hardware" },
  { re: /\b(watch|band|fit|tracker|whoop|garmin|amazfit)\b/i, category: "wearable", label: "advertised name matches a wearable" },
  { re: /\b(iphone|pixel|galaxy|redmi|oneplus)\b/i, category: "phone", label: "advertised name matches a handset" },
  { re: /\b(macbook|thinkpad|surface|desktop|imac)\b/i, category: "computer", label: "advertised name matches a computer" },
  { re: /\b(tile|airtag|smarttag|chipolo)\b/i, category: "tracker_tag", label: "advertised name matches a location tag" },
  { re: /\b(mouse|keyboard|stylus|remote|controller)\b/i, category: "peripheral", label: "advertised name matches an input peripheral" },
  { re: /\b(tesla|ford|bmw|carplay|obd)\b/i, category: "vehicle", label: "advertised name matches vehicle equipment" },
  { re: /\b(beacon|ibeacon|eddystone)\b/i, category: "beacon", label: "advertised name matches a beacon" },
];

/** GAP appearance, high 10 bits are the category. Public assigned numbers. */
const APPEARANCE_CATEGORY: Record<number, { category: BleCategory; label: string }> = {
  1: { category: "phone", label: "gap appearance declares a phone" },
  2: { category: "computer", label: "gap appearance declares a computer" },
  3: { category: "peripheral", label: "gap appearance declares a watch-class peripheral" },
  7: { category: "wearable", label: "gap appearance declares a wearable" },
  15: { category: "peripheral", label: "gap appearance declares a human interface device" },
  10: { category: "medical", label: "gap appearance declares blood pressure equipment" },
  17: { category: "sensor", label: "gap appearance declares a sensor" },
  33: { category: "audio", label: "gap appearance declares audio equipment" },
};

function short(uuid: string): string {
  const u = uuid.toLowerCase();
  const m = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/.exec(u);
  if (m) return m[1];
  return u.length === 4 ? u : u;
}

export const UNKNOWN_CLASSIFICATION: BleClassification = {
  category: "unknown",
  vendor: null,
  confidence: 0,
  evidence: ["the advertisement carried no company identifier, service uuid, appearance value or name that maps to a known device class"],
};

/**
 * Classify from the union of everything a device has broadcast so far.
 * Confidence rises only when independent broadcast facts agree.
 */
export function classifyDevice(observations: BleObservation[]): BleClassification {
  if (observations.length === 0) return UNKNOWN_CLASSIFICATION;

  const evidence: string[] = [];
  const votes = new Map<BleCategory, number>();
  let vendor: string | null = null;

  const companyIds = new Set<number>();
  const uuids = new Set<string>();
  const names = new Set<string>();
  let appearance: number | null = null;
  for (const o of observations) {
    o.manufacturerIds.forEach((id) => companyIds.add(id));
    o.serviceUuids.forEach((u) => uuids.add(short(u)));
    if (o.localName) names.add(o.localName);
    if (typeof o.appearance === "number") appearance = o.appearance;
  }

  for (const id of companyIds) {
    const name = COMPANY_IDS[id];
    if (name) {
      vendor = vendor ?? name;
      evidence.push(`manufacturer field carries bluetooth sig company id 0x${id.toString(16).padStart(4, "0")} (${name})`);
    } else {
      evidence.push(`manufacturer field carries unregistered company id 0x${id.toString(16).padStart(4, "0")}`);
    }
  }

  for (const u of uuids) {
    const hit = SERVICE_CATEGORY[u];
    if (hit) {
      votes.set(hit.category, (votes.get(hit.category) ?? 0) + 1);
      evidence.push(`advertises ${hit.label} (uuid ${u})`);
    } else {
      evidence.push(`advertises service uuid ${u}, which is not in the classification table`);
    }
  }

  for (const n of names) {
    for (const rule of NAME_RULES) {
      if (rule.re.test(n)) {
        votes.set(rule.category, (votes.get(rule.category) ?? 0) + 1);
        evidence.push(`${rule.label}: "${n}"`);
        break;
      }
    }
  }

  if (appearance !== null) {
    const hit = APPEARANCE_CATEGORY[appearance >> 6];
    if (hit) {
      votes.set(hit.category, (votes.get(hit.category) ?? 0) + 1);
      evidence.push(hit.label);
    }
  }

  if (votes.size === 0) {
    return vendor || evidence.length
      ? {
          category: "unknown",
          vendor,
          confidence: vendor ? 0.25 : 0.1,
          evidence: [
            ...evidence,
            "no broadcast fact identified a device class, so the class stays unknown",
          ],
        }
      : UNKNOWN_CLASSIFICATION;
  }

  let best: BleCategory = "unknown";
  let bestVotes = 0;
  let secondVotes = 0;
  for (const [cat, v] of votes) {
    if (v > bestVotes) {
      secondVotes = bestVotes;
      best = cat;
      bestVotes = v;
    } else if (v > secondVotes) secondVotes = v;
  }

  // one agreeing fact is a hint, two is a reading, contested votes cost confidence.
  const agreement = bestVotes / (bestVotes + secondVotes);
  const depth = Math.min(1, bestVotes / 3);
  const confidence = Math.round(Math.min(0.95, 0.35 + 0.45 * depth + 0.2 * (agreement - 0.5) * 2) * 100) / 100;

  return { category: best, vendor, confidence: Math.max(0.1, confidence), evidence };
}
