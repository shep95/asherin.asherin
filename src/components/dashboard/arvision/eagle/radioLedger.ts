// eagle.eye — radio ledger.
//
// the roster in radioScan.ts answers "what is broadcasting right now". this file
// answers the harder question the operator actually asked: "what has each of
// those radios been *doing*, second by second, for as long as this session has
// been open".
//
// the discipline that makes the output admissible rather than theatrical:
//   1. one sample per device per second, timestamped from the wall clock at the
//      moment of the tick, never back-dated and never interpolated. a second in
//      which a device published nothing is a *gap*, not a repeated reading.
//   2. distance is a band derived from a path-loss model, printed in feet
//      because that is what the operator reads a room in. it is an estimate and
//      every surface that prints it says so.
//   3. an address that has the locally-administered bit set is a rotating
//      privacy address. it is tracked in its own lane and never treated as a
//      durable identity — ios and android mint a new one every ~15 minutes.
//   4. movement is read from the *delta*, so the record is "12 ft → 9 ft → 7 ft"
//      rather than a single instantaneous claim.
//   5. presence of a radio is presence of a radio. it is never attribution to a
//      person.

export type MacKind = "randomized" | "public" | "unknown";
export type MovementSignature =
  | "approaching"
  | "receding"
  | "bouncing"
  | "stationary"
  | "settling"
  | "unknown";

export interface LedgerSample {
  /** wall-clock ms of the tick that produced this sample. */
  t: number;
  rssi: number | null;
  feet: number | null;
  /** feet change since the previous sample of the same device, null on the first. */
  deltaFeet: number | null;
}

export interface AbsenceGap {
  lostAt: number;
  returnedAt: number;
  seconds: number;
}

export interface DeviceTrack {
  id: string;
  /** the hardware address when the platform exposes one in the id or name. */
  mac: string | null;
  macKind: MacKind;
  name: string | null;
  vendor: string | null;
  companyId: number | null;
  fingerprint: string;
  firstSeenMs: number;
  lastSeenMs: number;
  /** seconds this device has been inside range across the whole session. */
  dwellSeconds: number;
  feet: number | null;
  /** feet at the previous second, for the "12 → 9" read. */
  previousFeet: number | null;
  rssi: number | null;
  signature: MovementSignature;
  samples: LedgerSample[];
  gaps: AbsenceGap[];
  /** rssi histogram, 12 buckets from -100 dBm to -40 dBm. */
  heat: number[];
  present: boolean;
  packets: number;
}

export interface ClusterEvent {
  at: number;
  ids: string[];
  closestFeet: number | null;
  note: string;
}

export interface LedgerState {
  sessionStartMs: number;
  tracks: Record<string, DeviceTrack>;
  clusters: ClusterEvent[];
  /** flat, append-only log line per device per second. */
  log: LogLine[];
  lastTickMs: number;
}

export interface LogLine {
  t: number;
  id: string;
  mac: string | null;
  macKind: MacKind;
  name: string | null;
  rssi: number | null;
  feet: number | null;
  deltaFeet: number | null;
  signature: MovementSignature;
  dwellSeconds: number;
  event: "sample" | "appeared" | "returned" | "lost" | "cluster";
  detail: string | null;
}

/** what one advertisement roster row has to carry for the ledger to fold it. */
export interface LedgerInput {
  id: string;
  name: string | null;
  vendor: string | null;
  companyId: number | null;
  fingerprint: string;
  rssi: number | null;
  meters: number | null;
  lastSeenMs: number;
  packets: number;
}

export const HEAT_BUCKETS = 12;
const HEAT_MIN = -100;
const HEAT_MAX = -40;
/** a device that has published nothing for this long counts as out of range. */
export const ABSENT_AFTER_MS = 8_000;
/** a return after less than this is jitter, not a reappearance worth flagging. */
export const GAP_FLAG_MS = 20_000;
const MAX_SAMPLES_PER_DEVICE = 3_600; // one hour at one hertz
const MAX_LOG_LINES = 60_000;
const CLUSTER_WINDOW_MS = 12_000;
const CLUSTER_FEET = 40;
const CLUSTER_MIN_DEVICES = 3;

export function feetFromMeters(m: number | null): number | null {
  if (m === null || !Number.isFinite(m)) return null;
  return Math.round(m * 3.28084 * 10) / 10;
}

const MAC_RE = /\b([0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/i;

/** pull an address out of whatever the platform handed us. chrome on android
 * puts it in the chooser label; desktop chrome hands back an opaque id and we
 * say so rather than inventing one. */
export function extractMac(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    if (!c) continue;
    const m = c.match(MAC_RE);
    if (m) return m[0].toUpperCase().replace(/-/g, ":");
  }
  return null;
}

/** bit 1 of the first octet is the locally-administered flag. ios and android
 * set it on the rotating privacy addresses they mint every few minutes, which
 * is exactly what the 5A:, 7E:, 7D: prefixes in the operator's screenshot are. */
export function classifyMac(mac: string | null): MacKind {
  if (!mac) return "unknown";
  const first = parseInt(mac.slice(0, 2), 16);
  if (!Number.isFinite(first)) return "unknown";
  return (first & 0b10) !== 0 ? "randomized" : "public";
}

export function heatBucket(rssi: number | null): number | null {
  if (rssi === null || !Number.isFinite(rssi)) return null;
  const clamped = Math.min(HEAT_MAX, Math.max(HEAT_MIN, rssi));
  const span = (HEAT_MAX - HEAT_MIN) / HEAT_BUCKETS;
  return Math.min(HEAT_BUCKETS - 1, Math.floor((clamped - HEAT_MIN) / span));
}

/** the movement signature is read off the feet series, not one reading, so a
 * person walking past never reads the same as a device left on a shelf. */
export function signatureFromSamples(samples: LedgerSample[]): MovementSignature {
  const feet = samples.slice(-20).map((s) => s.feet).filter((f): f is number => f !== null);
  if (feet.length < 4) return "unknown";
  const spread = Math.max(...feet) - Math.min(...feet);
  if (spread <= 1.5) return "stationary";
  const net = feet[feet.length - 1] - feet[0];
  let flips = 0;
  let dir = 0;
  for (let i = 1; i < feet.length; i++) {
    const d = feet[i] - feet[i - 1];
    if (Math.abs(d) < 0.6) continue;
    const nd = d > 0 ? 1 : -1;
    if (dir !== 0 && nd !== dir) flips++;
    dir = nd;
  }
  if (flips >= 3) return "bouncing";
  if (net <= -3) return "approaching";
  if (net >= 3) return "receding";
  // drifting, but converging on one band — a device being set down.
  const tail = feet.slice(-6);
  const tailSpread = Math.max(...tail) - Math.min(...tail);
  return tailSpread <= 2 ? "settling" : "bouncing";
}

export function signatureLabel(s: MovementSignature): string {
  switch (s) {
    case "approaching": return "closing — distance shrinking across the window";
    case "receding": return "opening — distance growing across the window";
    case "bouncing": return "passing — distance reversing repeatedly, consistent with someone walking by";
    case "stationary": return "fixed — distance flat, consistent with a device set down or parked";
    case "settling": return "settling — moved, then held one band";
    default: return "not enough seconds observed to read movement";
  }
}

export function createLedger(now = Date.now()): LedgerState {
  return { sessionStartMs: now, tracks: {}, clusters: [], log: [], lastTickMs: now };
}

function pushLog(state: LedgerState, line: LogLine) {
  state.log.push(line);
  if (state.log.length > MAX_LOG_LINES) state.log.splice(0, state.log.length - MAX_LOG_LINES);
}

/**
 * fold one second of roster into the ledger. pure with respect to the caller:
 * a new state object is returned, so react sees the change.
 */
export function tickLedger(prev: LedgerState, roster: LedgerInput[], now = Date.now()): LedgerState {
  const state: LedgerState = {
    sessionStartMs: prev.sessionStartMs,
    tracks: { ...prev.tracks },
    clusters: [...prev.clusters],
    log: [...prev.log],
    lastTickMs: now,
  };

  const seenThisTick = new Set<string>();
  const appeared: DeviceTrack[] = [];

  for (const r of roster) {
    const fresh = now - r.lastSeenMs <= ABSENT_AFTER_MS;
    if (!fresh) continue;
    seenThisTick.add(r.id);

    const before = state.tracks[r.id];
    const mac = extractMac(r.id, r.name) ?? before?.mac ?? null;
    const feet = feetFromMeters(r.meters);
    const previousFeet = before?.feet ?? null;
    const deltaFeet = feet !== null && previousFeet !== null ? Math.round((feet - previousFeet) * 10) / 10 : null;

    const sample: LedgerSample = { t: now, rssi: r.rssi, feet, deltaFeet };
    const samples = [...(before?.samples ?? []), sample].slice(-MAX_SAMPLES_PER_DEVICE);
    const heat = before ? [...before.heat] : new Array(HEAT_BUCKETS).fill(0);
    const b = heatBucket(r.rssi);
    if (b !== null) heat[b] += 1;

    const gaps = [...(before?.gaps ?? [])];
    let event: LogLine["event"] = "sample";
    let detail: string | null = null;

    if (!before) {
      event = "appeared";
      detail = "first advertisement of this session";
    } else if (!before.present) {
      const away = now - before.lastSeenMs;
      if (away >= GAP_FLAG_MS) {
        gaps.push({ lostAt: before.lastSeenMs, returnedAt: now, seconds: Math.round(away / 1000) });
        event = "returned";
        detail = `back after ${Math.round(away / 1000)}s out of range`;
      }
    }

    const track: DeviceTrack = {
      id: r.id,
      mac,
      macKind: classifyMac(mac),
      name: r.name ?? before?.name ?? null,
      vendor: r.vendor ?? before?.vendor ?? null,
      companyId: r.companyId ?? before?.companyId ?? null,
      fingerprint: r.fingerprint,
      firstSeenMs: before?.firstSeenMs ?? now,
      lastSeenMs: now,
      dwellSeconds: (before?.dwellSeconds ?? 0) + 1,
      feet,
      previousFeet,
      rssi: r.rssi,
      signature: signatureFromSamples(samples),
      samples,
      gaps,
      heat,
      present: true,
      packets: r.packets,
    };
    state.tracks[r.id] = track;
    if (event === "appeared") appeared.push(track);

    pushLog(state, {
      t: now,
      id: track.id,
      mac: track.mac,
      macKind: track.macKind,
      name: track.name,
      rssi: track.rssi,
      feet: track.feet,
      deltaFeet,
      signature: track.signature,
      dwellSeconds: track.dwellSeconds,
      event,
      detail,
    });
  }

  // anything that was present last tick and published nothing this tick has
  // left range, been switched off, or rotated its address. all three are the
  // same observation from outside: it stopped broadcasting.
  for (const id of Object.keys(state.tracks)) {
    const t = state.tracks[id];
    if (seenThisTick.has(id) || !t.present) continue;
    if (now - t.lastSeenMs <= ABSENT_AFTER_MS) continue;
    state.tracks[id] = { ...t, present: false };
    pushLog(state, {
      t: now,
      id: t.id,
      mac: t.mac,
      macKind: t.macKind,
      name: t.name,
      rssi: null,
      feet: null,
      deltaFeet: null,
      signature: t.signature,
      dwellSeconds: t.dwellSeconds,
      event: "lost",
      detail: "stopped advertising — out of range, powered off, or address rotated",
    });
  }

  // a group arriving together is a different event from three unrelated radios
  // drifting in over ten minutes, so only a tight window counts.
  if (appeared.length >= CLUSTER_MIN_DEVICES) {
    const near = appeared.filter((t) => t.feet === null || t.feet <= CLUSTER_FEET);
    if (near.length >= CLUSTER_MIN_DEVICES) {
      const closest = near.reduce<number | null>((m, t) => (t.feet === null ? m : m === null ? t.feet : Math.min(m, t.feet)), null);
      const ev: ClusterEvent = {
        at: now,
        ids: near.map((t) => t.id),
        closestFeet: closest,
        note: `${near.length} radios began advertising within the same second inside ${CLUSTER_FEET} ft`,
      };
      state.clusters.push(ev);
      pushLog(state, {
        t: now, id: "—", mac: null, macKind: "unknown", name: `group of ${near.length}`,
        rssi: null, feet: closest, deltaFeet: null, signature: "unknown",
        dwellSeconds: 0, event: "cluster", detail: ev.note,
      });
    }
  } else {
    // a slower arrival still counts when several first-seen stamps land inside
    // the window, which is what a group walking in actually looks like.
    const recent = Object.values(state.tracks).filter(
      (t) => t.present && now - t.firstSeenMs <= CLUSTER_WINDOW_MS && (t.feet === null || t.feet <= CLUSTER_FEET),
    );
    const alreadyFlagged = state.clusters.some((c) => now - c.at < CLUSTER_WINDOW_MS);
    if (recent.length >= CLUSTER_MIN_DEVICES && !alreadyFlagged) {
      const closest = recent.reduce<number | null>((m, t) => (t.feet === null ? m : m === null ? t.feet : Math.min(m, t.feet)), null);
      const ev: ClusterEvent = {
        at: now,
        ids: recent.map((t) => t.id),
        closestFeet: closest,
        note: `${recent.length} radios entered range within ${Math.round(CLUSTER_WINDOW_MS / 1000)}s of each other inside ${CLUSTER_FEET} ft`,
      };
      state.clusters.push(ev);
      pushLog(state, {
        t: now, id: "—", mac: null, macKind: "unknown", name: `group of ${recent.length}`,
        rssi: null, feet: closest, deltaFeet: null, signature: "unknown",
        dwellSeconds: 0, event: "cluster", detail: ev.note,
      });
    }
  }

  return state;
}

/** "12 ft → 9 ft → 7 ft" for the last few seconds of a track. */
export function movementTrail(track: DeviceTrack, points = 4): string {
  const feet = track.samples.map((s) => s.feet).filter((f): f is number => f !== null).slice(-points);
  if (feet.length === 0) return "range not reported";
  if (feet.length === 1) return `${feet[0]} ft`;
  return feet.map((f) => `${f} ft`).join(" → ");
}

export function trackLabel(t: DeviceTrack): string {
  if (t.name) return t.name;
  if (t.vendor) return `${t.vendor} radio`;
  if (t.mac) return t.mac;
  return "unnamed radio";
}

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------

const CSV_COLUMNS = [
  "timestamp_iso", "epoch_ms", "device_id", "mac", "mac_kind", "name",
  "rssi_dbm", "distance_ft", "delta_ft", "movement_signature", "dwell_seconds", "event", "detail",
];

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ledgerToCsv(state: LedgerState): string {
  const rows = [CSV_COLUMNS.join(",")];
  for (const l of state.log) {
    rows.push([
      new Date(l.t).toISOString(), l.t, l.id, l.mac, l.macKind, l.name,
      l.rssi, l.feet, l.deltaFeet, l.signature, l.dwellSeconds, l.event, l.detail,
    ].map(csvCell).join(","));
  }
  return rows.join("\n");
}

export function ledgerToJson(state: LedgerState): string {
  return JSON.stringify({
    schema: "asherin.eagle.radio-ledger/1",
    session_start: new Date(state.sessionStartMs).toISOString(),
    exported_at: new Date().toISOString(),
    method: "passive bluetooth low energy advertisement observation. no device was connected to. distance is an estimate from log-distance path loss, not a measurement. presence of a radio is not attribution to a person.",
    devices: Object.values(state.tracks).map((t) => ({
      id: t.id,
      mac: t.mac,
      mac_kind: t.macKind,
      name: t.name,
      vendor: t.vendor,
      company_id: t.companyId,
      fingerprint: t.fingerprint,
      first_seen: new Date(t.firstSeenMs).toISOString(),
      last_seen: new Date(t.lastSeenMs).toISOString(),
      dwell_seconds: t.dwellSeconds,
      movement_signature: t.signature,
      rssi_histogram: t.heat,
      absence_gaps: t.gaps.map((g) => ({
        lost_at: new Date(g.lostAt).toISOString(),
        returned_at: new Date(g.returnedAt).toISOString(),
        seconds: g.seconds,
      })),
      samples: t.samples.map((s) => ({ at: new Date(s.t).toISOString(), rssi: s.rssi, feet: s.feet, delta_ft: s.deltaFeet })),
    })),
    group_events: state.clusters.map((c) => ({ at: new Date(c.at).toISOString(), device_ids: c.ids, closest_ft: c.closestFeet, note: c.note })),
    log: state.log,
  }, null, 2);
}

// ---------------------------------------------------------------------------
// persistence — the log survives a reload, because a session that vanishes on
// a refresh is not a log.
// ---------------------------------------------------------------------------

const STORE_KEY = "asherin.eagle.radioLedger.v1";

export function persistLedger(state: LedgerState) {
  if (typeof localStorage === "undefined") return;
  try {
    // samples dominate the payload; the flat log already holds every second, so
    // only the tail of each track's series is kept for the graphs.
    const slim: LedgerState = {
      ...state,
      tracks: Object.fromEntries(
        Object.entries(state.tracks).map(([k, t]) => [k, { ...t, samples: t.samples.slice(-600) }]),
      ),
      log: state.log.slice(-8_000),
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(slim));
  } catch {
    // quota is the only realistic failure here and losing the cache is not
    // worth breaking the live scan over.
  }
}

export function restoreLedger(): LedgerState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LedgerState;
    if (!parsed || typeof parsed !== "object" || !parsed.tracks) return null;
    // nothing restored is "present" — presence is a live claim only.
    parsed.tracks = Object.fromEntries(
      Object.entries(parsed.tracks).map(([k, t]) => [k, { ...t, present: false }]),
    );
    return parsed;
  } catch {
    return null;
  }
}

export function clearPersistedLedger() {
  try { localStorage.removeItem(STORE_KEY); } catch { /* nothing to clear */ }
}
