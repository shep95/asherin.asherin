// asherin.sentinel — layer 4b, the sync client.
//
// One narrow surface to the account's own backend. Every call is authenticated
// with the caller's session (the edge function derives the user id from the
// verified token, never from the body), every call is time-boxed, and a failure
// is returned rather than swallowed — a silent catch here would look like "no
// events today" when the truth is "the network is down".

import { supabase } from "@/integrations/supabase/client";

export interface AmbientDevice {
  id: string;
  device_key: string;
  label: string;
  platform: string;
  status: string;
  last_seen_at: string;
  push_prefs: Record<string, unknown>;
}

export interface AmbientSpeaker {
  id: string;
  label: string;
  name: string | null;
  name_source: string | null;
  sample_count: number;
  confidence: number;
  first_heard_at: string;
  last_heard_at: string;
}

export interface AmbientEvent {
  id: string;
  device_id: string | null;
  speaker_id: string | null;
  kind: "speech" | "sound" | "gap" | "radio" | "location";
  transcript: string | null;
  tag: string | null;
  confidence: number | null;
  started_at: string;
  duration_ms: number | null;
  meta: Record<string, unknown>;
}


export interface AmbientAlert {
  id: string;
  kind: string;
  message: string;
  created_at: string;
  acknowledged_at: string | null;
  event_id: string | null;
}

export interface IngestResult {
  events: AmbientEvent[];
  speakers: AmbientSpeaker[];
  alerts: AmbientAlert[];
  notes: string[];
}

async function call<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("asherin-sentinel", { body: { action, ...body } });
  if (error) {
    // supabase-js hides the response body on non-2xx; surface what it gives.
    throw new Error(error.message || `sentinel ${action} failed`);
  }
  const payload = data as { error?: string; message?: string } & T;
  if (payload && typeof payload === "object" && "error" in payload && payload.error) {
    throw new Error(payload.message || String(payload.error));
  }
  return payload as T;
}

export const registerDevice = (deviceKey: string, label: string, platform: string) =>
  call<{ device: AmbientDevice }>("register", { deviceKey, label, platform });

export const heartbeat = (deviceKey: string, status: string) => call<{ ok: true }>("heartbeat", { deviceKey, status });

export const ingest = (deviceKey: string, segments: unknown[]) =>
  call<IngestResult>("ingest", { deviceKey, segments });

// ── channels: one bluetooth input, one account device row ────────────────────

/** Rename the lane a device writes into. The timeline reads by this name later,
 *  so it is the operator's word, not the browser's device string. */
export const renameDevice = (deviceKey: string, label: string) =>
  call<{ device: AmbientDevice }>("rename-device", { deviceKey, label });

/** The per-channel language contract. `sourceLang` is a hint for the
 *  transcriber ("auto" lets it detect); `translateTo` is the render language,
 *  empty meaning the channel stays in whatever language was spoken. */
export const setDevicePrefs = (deviceKey: string, prefs: { sourceLang?: string; translateTo?: string }) =>
  call<{ device: AmbientDevice }>("device-prefs", { deviceKey, prefs });

/** Open a visible hole in the timeline. Called the moment a channel drops, so
 *  the record shows what was NOT captured instead of implying continuity. */
export const openGap = (deviceKey: string, startedAtIso: string, reason: string) =>
  call<{ gapId: string | null }>("gap", { deviceKey, startedAtIso, reason });

/** Close a hole once the channel is capturing again. */
export const closeGap = (gapId: string, endedAtIso: string) =>
  call<{ ok: true }>("gap", { gapId, endedAtIso });


/** The radio environment, written to the same timeline as speech. Every entry
 *  came from a broadcast packet — nothing pairs, connects or queries. */
export const logRadio = (
  deviceKey: string,
  entries: {
    atIso: string;
    summary: string;
    tag: string;
    risk: string;
    source: string;
    durationMs?: number;
    meta?: Record<string, unknown>;
  }[],
) => call<{ ok: true; written: number }>("radio", { deviceKey, entries });

/** A place with its provenance attached. Accuracy and source travel with the
 *  fix so the timeline can never present a city-level guess as a street fix. */
export const logLocation = (
  deviceKey: string,
  fixes: {
    atIso: string;
    lat: number;
    lon: number;
    accuracyM: number;
    source: string;
    note?: string;
    place?: string | null;
    movement?: string;
    altitudeM?: number | null;
    speedMps?: number | null;
    headingDeg?: number | null;
  }[],
) => call<{ ok: true; written: number }>("location", { deviceKey, fixes });

export const fetchTimeline = (filters: {
  sinceIso?: string;
  untilIso?: string;
  speakerId?: string;
  deviceId?: string;
  tag?: string;
  query?: string;
  limit?: number;
}) => call<{ events: AmbientEvent[]; speakers: AmbientSpeaker[]; devices: AmbientDevice[] }>("timeline", filters);

/**
 * The turn behind an alert, plus the turns immediately around it. An alert with
 * no readable body is the failure this fixes: the operator was told something
 * happened and given no way to read what was said.
 */
export const fetchEvent = (eventId: string, contextSeconds = 90) =>
  call<{ event: AmbientEvent | null; context: AmbientEvent[]; speakers: AmbientSpeaker[] }>("event", {
    eventId,
    contextSeconds,
  });

export const fetchSpeakers = () => call<{ speakers: AmbientSpeaker[] }>("speakers");
export const renameSpeaker = (speakerId: string, name: string) =>
  call<{ speaker: AmbientSpeaker }>("rename-speaker", { speakerId, name });
export const fetchAlerts = () => call<{ alerts: AmbientAlert[] }>("alerts");
export const ackAlert = (alertId: string) => call<{ ok: true }>("ack-alert", { alertId });
export const fetchDevices = () => call<{ devices: AmbientDevice[] }>("devices");
export const saveSettings = (prefs: Record<string, unknown>, retentionHours: number) =>
  call<{ ok: true }>("settings", { prefs, retentionHours });
export const fetchSettings = () =>
  call<{ prefs: Record<string, unknown>; retentionHours: number }>("get-settings");
export const purgeRemote = (beforeIso: string) => call<{ deleted: number }>("purge", { beforeIso });

// ── desktop companion pairing ────────────────────────────────────────────────
export interface CompanionRow {
  id: string;
  device_key: string;
  label: string;
  platform: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export const createPairingCode = () => call<{ code: string; expiresAt: string }>("pair-code");
export const fetchCompanions = () => call<{ companions: CompanionRow[] }>("companion-devices");
export const revokeCompanion = (companionId: string) =>
  call<{ ok: true; revoked: boolean }>("revoke-companion", { companionId });
