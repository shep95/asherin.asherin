// asherin.sentinel — the timeline, held on this device.
//
// The hosted edition wrote every turn to an account through an edge function.
// The local edition has no account and no server: the timeline is a set of
// tables in this browser's own store (src/lib/local/db.ts), and the columns
// that carry what was said or where you were — a transcript, a place, a
// coordinate, a person's name — are sealed with the device's data-encryption
// key before they are written. Nothing in this file opens a socket.
//
// The export names are kept from the sync client they replace, because other
// rooms read the timeline through `fetchTimeline` and the event types.
//
// Rules this store keeps:
//   • a failure is thrown, never swallowed into "no events today".
//   • a row that cannot be opened (a key that changed, a corrupt cell) is
//     returned with its sealed columns blank and a note in meta, not dropped.
//   • the table is capped; the oldest rows go first, and the cap is printed in
//     the room rather than discovered.

import { loadTable, mutateTable, onTableChange, uuid, type Row } from "@/lib/local/db";
import { getLocalUser } from "@/lib/local/auth";
import { decryptText, encryptText } from "@/lib/encryption";
import type { SegmentPayload } from "./localBuffer";
import {
  applyPhrase, ingestSegments, publicSpeaker,
  type AmbientAlert, type AmbientDevice, type AmbientEvent, type AmbientSpeaker, type IngestResult, type StoredSpeaker,
} from "./ingest";
import { DEFAULT_PUSH_TAGS } from "./soundEvents";
import { matcherFor, type SpokenPhrase } from "./phraseRegistry";

export type { AmbientAlert, AmbientDevice, AmbientEvent, AmbientSpeaker, IngestResult } from "./ingest";

export const T_EVENTS = "sentinel_events";
export const T_SPEAKERS = "sentinel_speakers";
export const T_DEVICES = "sentinel_devices";
export const T_ALERTS = "sentinel_alerts";
export const T_SETTINGS = "sentinel_settings";

/** Rows kept before the oldest are dropped on write. Printed in the room. */
export const MAX_EVENTS = 20_000;
export const MAX_ALERTS = 500;
export const DEFAULT_RETENTION_HOURS = 72;

// ── sealed columns ───────────────────────────────────────────────────────────

const SEALED_NOTE = "this row was written under a key this device no longer holds; its words are unreadable.";

const uid = () => getLocalUser().id;

async function seal(value: unknown): Promise<string> {
  return encryptText(JSON.stringify(value ?? null), uid());
}

const openCache = new Map<string, unknown>();

async function open<T>(cell: unknown, fallback: T): Promise<{ value: T; ok: boolean }> {
  if (typeof cell !== "string") return { value: fallback, ok: true };
  const hit = openCache.get(cell);
  if (hit !== undefined) return { value: hit as T, ok: true };
  try {
    const value = JSON.parse(await decryptText(cell, uid())) as T;
    if (openCache.size > 50_000) openCache.clear();
    openCache.set(cell, value);
    return { value, ok: true };
  } catch {
    return { value: fallback, ok: false };
  }
}

interface EventRow extends Row {
  id: string;
  device_id: string | null;
  speaker_id: string | null;
  kind: AmbientEvent["kind"];
  tag: string | null;
  confidence: number | null;
  started_at: string;
  duration_ms: number | null;
  /** sealed: string | null */
  transcript_enc: string | null;
  /** sealed: Record<string, unknown> */
  meta_enc: string;
}

interface SpeakerRow extends Row {
  id: string;
  label: string;
  /** sealed: string | null */
  name_enc: string | null;
  name_source: string | null;
  sample_count: number;
  confidence: number;
  first_heard_at: string;
  last_heard_at: string;
  embedding: number[];
}

async function toEventRow(ev: AmbientEvent): Promise<EventRow> {
  return {
    id: ev.id,
    device_id: ev.device_id,
    speaker_id: ev.speaker_id,
    kind: ev.kind,
    tag: ev.tag,
    confidence: ev.confidence,
    started_at: ev.started_at,
    duration_ms: ev.duration_ms,
    transcript_enc: ev.transcript === null ? null : await seal(ev.transcript),
    meta_enc: await seal(ev.meta ?? {}),
  };
}

async function fromEventRow(row: EventRow): Promise<AmbientEvent> {
  const transcript = await open<string | null>(row.transcript_enc, null);
  const meta = await open<Record<string, unknown>>(row.meta_enc, {});
  const out: AmbientEvent = {
    id: row.id,
    device_id: row.device_id,
    speaker_id: row.speaker_id,
    kind: row.kind,
    transcript: transcript.value,
    tag: row.tag,
    confidence: row.confidence,
    started_at: row.started_at,
    duration_ms: row.duration_ms,
    meta: meta.value && typeof meta.value === "object" ? meta.value : {},
  };
  if (!transcript.ok || !meta.ok) out.meta = { ...out.meta, unreadable: SEALED_NOTE };
  return out;
}

async function toSpeakerRow(s: StoredSpeaker): Promise<SpeakerRow> {
  return {
    id: s.id,
    label: s.label,
    name_enc: s.name === null ? null : await seal(s.name),
    name_source: s.name_source,
    sample_count: s.sample_count,
    confidence: s.confidence,
    first_heard_at: s.first_heard_at,
    last_heard_at: s.last_heard_at,
    embedding: s.embedding,
  };
}

async function fromSpeakerRow(row: SpeakerRow): Promise<StoredSpeaker> {
  const name = await open<string | null>(row.name_enc, null);
  return {
    id: row.id,
    label: row.label,
    name: name.ok ? name.value : null,
    name_source: row.name_source,
    sample_count: row.sample_count,
    confidence: row.confidence,
    first_heard_at: row.first_heard_at,
    last_heard_at: row.last_heard_at,
    embedding: Array.isArray(row.embedding) ? row.embedding : [],
  };
}

// ── devices (lanes) ──────────────────────────────────────────────────────────

const devices = () => loadTable(T_DEVICES) as Promise<AmbientDevice[]>;

export async function registerDevice(deviceKey: string, label: string, platform: string): Promise<{ device: AmbientDevice }> {
  const nowIso = new Date().toISOString();
  const device = await mutateTable<AmbientDevice>(T_DEVICES, (rows) => {
    const idx = rows.findIndex((r) => r.device_key === deviceKey);
    if (idx >= 0) {
      const next = { ...(rows[idx] as AmbientDevice), label, platform, status: "active", last_seen_at: nowIso };
      rows[idx] = next;
      return { rows, result: next };
    }
    const next: AmbientDevice = { id: uuid(), device_key: deviceKey, label, platform, status: "active", last_seen_at: nowIso, push_prefs: {} };
    rows.push(next);
    return { rows, result: next };
  });
  return { device };
}

export async function heartbeat(deviceKey: string, status: string): Promise<{ ok: true }> {
  const nowIso = new Date().toISOString();
  await mutateTable(T_DEVICES, (rows) => {
    const idx = rows.findIndex((r) => r.device_key === deviceKey);
    if (idx >= 0) rows[idx] = { ...rows[idx], status, last_seen_at: nowIso };
    return { rows, result: null };
  });
  return { ok: true };
}

export async function renameDevice(deviceKey: string, label: string): Promise<{ device: AmbientDevice }> {
  const device = await mutateTable<AmbientDevice | null>(T_DEVICES, (rows) => {
    const idx = rows.findIndex((r) => r.device_key === deviceKey);
    if (idx < 0) return { rows, result: null };
    rows[idx] = { ...rows[idx], label };
    return { rows, result: rows[idx] as AmbientDevice };
  });
  if (!device) return registerDevice(deviceKey, label, "web");
  return { device };
}

export async function setDevicePrefs(deviceKey: string, prefs: { sourceLang?: string }): Promise<{ device: AmbientDevice }> {
  const device = await mutateTable<AmbientDevice | null>(T_DEVICES, (rows) => {
    const idx = rows.findIndex((r) => r.device_key === deviceKey);
    if (idx < 0) return { rows, result: null };
    const row = rows[idx] as AmbientDevice;
    rows[idx] = { ...row, push_prefs: { ...(row.push_prefs ?? {}), ...prefs } };
    return { rows, result: rows[idx] as AmbientDevice };
  });
  if (!device) {
    const made = await registerDevice(deviceKey, "channel", "web");
    return setDevicePrefs(made.device.device_key, prefs);
  }
  return { device };
}

export const fetchDevices = async () => ({ devices: await devices() });

async function deviceByKey(deviceKey: string): Promise<AmbientDevice> {
  const found = (await devices()).find((d) => d.device_key === deviceKey);
  if (found) return found;
  return (await registerDevice(deviceKey, "channel", "web")).device;
}

// ── settings ─────────────────────────────────────────────────────────────────

export interface WatchPrefs {
  transcribe: boolean;
  pushNewSpeaker: boolean;
  sensitivity: string;
  pushTags: string[];
}

const DEFAULT_PREFS: WatchPrefs = { transcribe: true, pushNewSpeaker: true, sensitivity: "balanced", pushTags: DEFAULT_PUSH_TAGS };

export async function fetchSettings(): Promise<{ prefs: Record<string, unknown>; retentionHours: number }> {
  const rows = await loadTable(T_SETTINGS);
  const row = rows[0] as { prefs?: Record<string, unknown>; retention_hours?: number } | undefined;
  return {
    prefs: { ...DEFAULT_PREFS, ...(row?.prefs ?? {}) },
    retentionHours: typeof row?.retention_hours === "number" ? row.retention_hours : DEFAULT_RETENTION_HOURS,
  };
}

export async function saveSettings(prefs: Record<string, unknown>, retentionHours: number): Promise<{ ok: true }> {
  await mutateTable(T_SETTINGS, () => ({ rows: [{ id: "watch", prefs: { ...DEFAULT_PREFS, ...prefs }, retention_hours: retentionHours }], result: null }));
  return { ok: true };
}

// ── speakers ─────────────────────────────────────────────────────────────────

async function storedSpeakers(): Promise<StoredSpeaker[]> {
  const rows = (await loadTable(T_SPEAKERS)) as SpeakerRow[];
  const out: StoredSpeaker[] = [];
  for (const r of rows) out.push(await fromSpeakerRow(r));
  return out.sort((a, b) => a.first_heard_at.localeCompare(b.first_heard_at));
}

export const fetchSpeakers = async () => ({ speakers: (await storedSpeakers()).map(publicSpeaker) });

async function upsertSpeakers(list: StoredSpeaker[]): Promise<void> {
  if (!list.length) return;
  const rows = await Promise.all(list.map(toSpeakerRow));
  await mutateTable(T_SPEAKERS, (existing) => {
    for (const row of rows) {
      const idx = existing.findIndex((r) => r.id === row.id);
      if (idx >= 0) existing[idx] = row;
      else existing.push(row);
    }
    return { rows: existing, result: null };
  });
}

export async function renameSpeaker(speakerId: string, name: string): Promise<{ speaker: AmbientSpeaker }> {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new Error("a name cannot be empty.");
  const current = (await storedSpeakers()).find((s) => s.id === speakerId);
  if (!current) throw new Error("that voice is no longer stored on this device.");
  const next: StoredSpeaker = { ...current, name: clean, name_source: "named by you" };
  await upsertSpeakers([next]);
  return { speaker: publicSpeaker(next) };
}

// ── events ───────────────────────────────────────────────────────────────────

async function appendEvents(list: AmbientEvent[]): Promise<void> {
  if (!list.length) return;
  const rows = await Promise.all(list.map(toEventRow));
  await mutateTable(T_EVENTS, (existing) => {
    const next = [...existing, ...rows];
    if (next.length > MAX_EVENTS) next.splice(0, next.length - MAX_EVENTS);
    return { rows: next, result: null };
  });
}

async function updateEvent(id: string, patch: (ev: AmbientEvent) => AmbientEvent): Promise<AmbientEvent | null> {
  const rows = (await loadTable(T_EVENTS)) as EventRow[];
  const row = rows.find((r) => r.id === id);
  if (!row) return null;
  const next = patch(await fromEventRow(row));
  const nextRow = await toEventRow(next);
  await mutateTable(T_EVENTS, (existing) => {
    const idx = existing.findIndex((r) => r.id === id);
    if (idx >= 0) existing[idx] = nextRow;
    return { rows: existing, result: null };
  });
  return next;
}

async function appendAlerts(list: AmbientAlert[]): Promise<void> {
  if (!list.length) return;
  await mutateTable(T_ALERTS, (existing) => {
    const next = [...existing, ...list];
    if (next.length > MAX_ALERTS) next.splice(0, next.length - MAX_ALERTS);
    return { rows: next, result: null };
  });
}

/**
 * A batch of closed turns from one lane. Voices are matched here, words are
 * taken from the recogniser if it already has them, and alerts are raised.
 * Returns what was written so the room can show it without re-reading.
 */
export async function ingest(deviceKey: string, segments: unknown[]): Promise<IngestResult> {
  const device = await deviceByKey(deviceKey);
  const settings = await fetchSettings();
  const prefs = settings.prefs as Partial<WatchPrefs>;
  const matcher = matcherFor(deviceKey);
  const out = ingestSegments({
    device,
    segments: segments as SegmentPayload[],
    speakers: await storedSpeakers(),
    prefs: { pushNewSpeaker: prefs.pushNewSpeaker !== false, pushTags: Array.isArray(prefs.pushTags) ? (prefs.pushTags as string[]) : DEFAULT_PUSH_TAGS },
    phraseFor: (turn) => matcher.offerTurn(turn),
    now: Date.now(),
    makeId: uuid,
  });
  await upsertSpeakers(out.speakers);
  await appendEvents(out.events);
  await appendAlerts(out.alerts);
  return { events: out.events, speakers: out.speakers.map(publicSpeaker), alerts: out.alerts, notes: out.notes };
}

/**
 * Words that arrived after their turn was stored. The matcher said which turn;
 * this writes the transcript onto it and binds a self-stated name if there is
 * one. Returns the rows that changed, or null when the turn is gone.
 */
export async function attachPhrase(turnId: string, phrase: SpokenPhrase): Promise<IngestResult | null> {
  const nowIso = new Date().toISOString();
  let changedSpeaker: StoredSpeaker | null = null;
  const speakers = await storedSpeakers();
  const event = await updateEvent(turnId, (ev) => {
    const speaker = ev.speaker_id ? speakers.find((s) => s.id === ev.speaker_id) ?? null : null;
    const applied = applyPhrase(ev, phrase, speaker, nowIso);
    changedSpeaker = applied.speaker;
    return applied.event;
  });
  if (!event) return null;
  if (changedSpeaker) await upsertSpeakers([changedSpeaker]);
  const sp = changedSpeaker as StoredSpeaker | null;
  return {
    events: [event],
    speakers: sp ? [publicSpeaker(sp)] : [],
    alerts: [],
    notes: sp ? [`${sp.name} named themself.`] : [],
  };
}

/** Open a visible hole in the timeline the moment a lane drops. */
export async function openGap(deviceKey: string, startedAtIso: string, reason: string): Promise<{ gapId: string | null }> {
  const device = await deviceByKey(deviceKey);
  const id = uuid();
  await appendEvents([{
    id,
    device_id: device.id,
    speaker_id: null,
    kind: "gap",
    transcript: null,
    tag: reason,
    confidence: null,
    started_at: startedAtIso,
    duration_ms: null,
    meta: { open: true, reason },
  }]);
  return { gapId: id };
}

/** Close the hole once the lane is capturing again. */
export async function closeGap(gapId: string, endedAtIso: string): Promise<{ ok: true }> {
  await updateEvent(gapId, (ev) => ({
    ...ev,
    duration_ms: Math.max(0, Date.parse(endedAtIso) - Date.parse(ev.started_at)),
    meta: { ...ev.meta, open: false, endedAt: endedAtIso },
  }));
  return { ok: true };
}

/** The radio environment, written to the same timeline as speech. */
export const logRadio = async (
  deviceKey: string,
  entries: { atIso: string; summary: string; tag: string; risk: string; source: string; durationMs?: number; meta?: Record<string, unknown> }[],
): Promise<{ ok: true; written: number }> => {
  const device = await deviceByKey(deviceKey);
  await appendEvents(entries.map((e) => ({
    id: uuid(),
    device_id: device.id,
    speaker_id: null,
    kind: "radio" as const,
    transcript: e.summary,
    tag: e.tag,
    confidence: null,
    started_at: e.atIso,
    duration_ms: e.durationMs ?? null,
    meta: { ...(e.meta ?? {}), risk: e.risk, source: e.source },
  })));
  return { ok: true, written: entries.length };
};

/** A place with its provenance attached; the coordinates are sealed. */
export const logLocation = async (
  deviceKey: string,
  fixes: {
    atIso: string; lat: number; lon: number; accuracyM: number; source: string; note?: string; place?: string | null;
    movement?: string; altitudeM?: number | null; speedMps?: number | null; headingDeg?: number | null;
  }[],
): Promise<{ ok: true; written: number }> => {
  const device = await deviceByKey(deviceKey);
  await appendEvents(fixes.map((f) => ({
    id: uuid(),
    device_id: device.id,
    speaker_id: null,
    kind: "location" as const,
    transcript: `${f.source} fix, ±${f.accuracyM} m${f.place ? ` · ${f.place}` : ""}`,
    tag: f.source,
    confidence: null,
    started_at: f.atIso,
    duration_ms: null,
    meta: { lat: f.lat, lon: f.lon, accuracyM: f.accuracyM, note: f.note ?? null, place: f.place ?? null, movement: f.movement ?? null, altitudeM: f.altitudeM ?? null, speedMps: f.speedMps ?? null, headingDeg: f.headingDeg ?? null },
  })));
  return { ok: true, written: fixes.length };
};

export interface TimelineFilters {
  sinceIso?: string;
  untilIso?: string;
  speakerId?: string;
  deviceId?: string;
  tag?: string;
  query?: string;
  limit?: number;
}

/** Newest first. A text query is matched against opened transcripts only. */
export async function fetchTimeline(filters: TimelineFilters): Promise<{ events: AmbientEvent[]; speakers: AmbientSpeaker[]; devices: AmbientDevice[] }> {
  const rows = (await loadTable(T_EVENTS)) as EventRow[];
  const since = filters.sinceIso ? Date.parse(filters.sinceIso) : -Infinity;
  const until = filters.untilIso ? Date.parse(filters.untilIso) : Infinity;
  const q = filters.query?.trim().toLowerCase() || null;
  const limit = Math.max(1, Math.min(2000, filters.limit ?? 200));
  const picked: AmbientEvent[] = [];
  const ordered = [...rows].sort((a, b) => b.started_at.localeCompare(a.started_at));
  for (const row of ordered) {
    const at = Date.parse(row.started_at);
    if (at < since || at > until) continue;
    if (filters.speakerId && row.speaker_id !== filters.speakerId) continue;
    if (filters.deviceId && row.device_id !== filters.deviceId) continue;
    if (filters.tag && row.tag !== filters.tag) continue;
    const ev = await fromEventRow(row);
    if (q && !(ev.transcript ?? "").toLowerCase().includes(q) && !(ev.tag ?? "").toLowerCase().includes(q)) continue;
    picked.push(ev);
    if (picked.length >= limit) break;
  }
  return { events: picked, speakers: (await storedSpeakers()).map(publicSpeaker), devices: await devices() };
}

/** The turn behind an alert plus the turns around it, oldest first. */
export async function fetchEvent(eventId: string, contextSeconds = 90): Promise<{ event: AmbientEvent | null; context: AmbientEvent[]; speakers: AmbientSpeaker[] }> {
  const rows = (await loadTable(T_EVENTS)) as EventRow[];
  const row = rows.find((r) => r.id === eventId);
  const speakers = (await storedSpeakers()).map(publicSpeaker);
  if (!row) return { event: null, context: [], speakers };
  const event = await fromEventRow(row);
  const at = Date.parse(event.started_at);
  const around = rows
    .filter((r) => Math.abs(Date.parse(r.started_at) - at) <= contextSeconds * 1000)
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
  const context: AmbientEvent[] = [];
  for (const r of around) context.push(await fromEventRow(r));
  return { event, context, speakers };
}

// ── alerts ───────────────────────────────────────────────────────────────────

export const fetchAlerts = async (): Promise<{ alerts: AmbientAlert[] }> => {
  const rows = (await loadTable(T_ALERTS)) as AmbientAlert[];
  return { alerts: [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)) };
};

export async function ackAlert(alertId: string): Promise<{ ok: true }> {
  const nowIso = new Date().toISOString();
  await mutateTable(T_ALERTS, (rows) => {
    const idx = rows.findIndex((r) => r.id === alertId);
    if (idx >= 0) rows[idx] = { ...rows[idx], acknowledged_at: nowIso };
    return { rows, result: null };
  });
  return { ok: true };
}

// ── purge ────────────────────────────────────────────────────────────────────

/** Delete stored turns and alerts up to a moment. Learned voices stay. */
export async function purgeTimeline(beforeIso: string): Promise<{ deleted: number }> {
  const cut = Date.parse(beforeIso);
  const deleted = await mutateTable<number>(T_EVENTS, (rows) => {
    const keep = rows.filter((r) => Date.parse(String(r.started_at)) > cut);
    return { rows: keep, result: rows.length - keep.length };
  });
  await mutateTable(T_ALERTS, (rows) => ({ rows: rows.filter((r) => Date.parse(String(r.created_at)) > cut), result: null }));
  openCache.clear();
  return { deleted };
}

/** Forget every learned voice. Turns keep their speaker ids and read as "unknown voice". */
export async function forgetSpeakers(): Promise<{ deleted: number }> {
  const deleted = await mutateTable<number>(T_SPEAKERS, (rows) => ({ rows: [], result: rows.length }));
  return { deleted };
}

/** Fires on any write to the timeline tables, so a room can re-read. */
export function subscribeTimeline(fn: () => void): () => void {
  const offs = [onTableChange(T_EVENTS, fn), onTableChange(T_ALERTS, fn), onTableChange(T_SPEAKERS, fn)];
  return () => offs.forEach((off) => off());
}
