// asherin.sentinel — what happens to a closed turn, on this device.
//
// The hosted edition did this on a server: match the voiceprint against the
// account's known voices, bind a name when someone states their own, raise an
// alert when a threshold is met. Every one of those decisions is a pure
// function of the turn and the stored voices, so the local edition runs them
// here, in this tab, and the store (sync.ts) only persists what comes out.
//
// Rules carried over unchanged, because they are the honesty of the room:
//   • two stored voices that match too closely are reported as ambiguous, not
//     guessed between.
//   • a sample too short to characterise a person gets no voiceprint and no
//     speaker, rather than a noisy print that pollutes a centroid forever.
//   • a name binds itself only when a person states it about themselves, in
//     words the recogniser heard; nothing infers a name from context.

import type { SegmentPayload } from "./localBuffer";
import { identityConfidence, matchSpeaker, mergeCentroid, type KnownSpeaker } from "./voiceprint";
import type { SpokenPhrase, TurnWindow } from "./transcripts";

export type AmbientDevice = {
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

/** A speaker as stored: the public row plus the centroid it is matched on. */
export interface StoredSpeaker extends AmbientSpeaker {
  embedding: number[];
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

export type AmbientAlert = {
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

export interface IngestPrefs {
  pushNewSpeaker: boolean;
  pushTags: string[];
}

export interface IngestInput {
  device: AmbientDevice;
  segments: SegmentPayload[];
  speakers: StoredSpeaker[];
  prefs: IngestPrefs;
  /** the words for a turn, if the recogniser already produced them */
  phraseFor: (turn: TurnWindow) => SpokenPhrase | null;
  now: number;
  makeId: () => string;
}

export interface IngestOutput {
  events: AmbientEvent[];
  /** every speaker row that was created or changed */
  speakers: StoredSpeaker[];
  alerts: AmbientAlert[];
  notes: string[];
}

const ORDINALS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

export const publicSpeaker = (s: StoredSpeaker): AmbientSpeaker => {
  const { embedding: _embedding, ...rest } = s;
  return rest;
};

export function nextSpeakerLabel(count: number): string {
  return `voice ${ORDINALS[count] ?? count + 1}`;
}

// ── name binding ─────────────────────────────────────────────────────────────

const NOT_NAMES = new Set(["not", "the", "a", "an", "no", "sorry", "just", "still", "also", "actually", "really", "here", "there", "what", "who"]);

/**
 * Only a self-statement binds: "my name is …" or "call me …". "i am tired"
 * must never name someone tired, so the looser forms are deliberately absent.
 */
export function selfStatedName(transcript: string | null): { name: string; phrase: string } | null {
  if (!transcript) return null;
  const m = /\b(my name is|call me)\s+([\p{L}][\p{L}'’-]{1,30})/iu.exec(transcript);
  if (!m) return null;
  const name = m[2].replace(/[’']s$/u, "");
  if (NOT_NAMES.has(name.toLowerCase())) return null;
  return { name, phrase: m[0] };
}

/** Attach words to a stored speech turn. Pure: returns the new rows. */
export function applyPhrase(
  event: AmbientEvent,
  phrase: SpokenPhrase,
  speaker: StoredSpeaker | null,
  nowIso: string,
): { event: AmbientEvent; speaker: StoredSpeaker | null } {
  const bound = speaker && !speaker.name ? selfStatedName(phrase.text) : null;
  const next: AmbientEvent = {
    ...event,
    transcript: phrase.text,
    meta: {
      ...event.meta,
      transcribedBy: phrase.local ? "this browser, on this device" : "this browser's speech service",
      recognitionConfidence: phrase.confidence,
      lang: phrase.lang,
      nameBoundFrom: bound ? bound.phrase : (event.meta.nameBoundFrom ?? null),
    },
  };
  const nextSpeaker = bound && speaker
    ? { ...speaker, name: bound.name, name_source: `said "${bound.phrase}" at ${nowIso}`, last_heard_at: nowIso }
    : null;
  return { event: next, speaker: nextSpeaker };
}

// ── the turn ─────────────────────────────────────────────────────────────────

export function ingestSegments(input: IngestInput): IngestOutput {
  const nowIso = new Date(input.now).toISOString();
  const events: AmbientEvent[] = [];
  const alerts: AmbientAlert[] = [];
  const notes: string[] = [];
  const changed = new Map<string, StoredSpeaker>();
  // Matching reads the live roster, which grows inside this batch.
  const roster: StoredSpeaker[] = input.speakers.map((s) => ({ ...s }));

  const known = (): KnownSpeaker[] => roster.map((s) => ({ id: s.id, label: s.label, name: s.name, embedding: s.embedding, sampleCount: s.sample_count }));

  for (const seg of input.segments) {
    const startedMs = Date.parse(seg.startedAt) || input.now;
    const id = input.makeId();

    if (seg.kind === "sound") {
      const tag = seg.tag ?? "unclassified impact";
      events.push({
        id,
        device_id: input.device.id,
        speaker_id: null,
        kind: "sound",
        transcript: null,
        tag,
        confidence: typeof seg.confidence === "number" ? seg.confidence : null,
        started_at: new Date(startedMs).toISOString(),
        duration_ms: seg.durationMs,
        meta: { evidence: seg.evidence ?? {} },
      });
      if (input.prefs.pushTags.includes(tag)) {
        alerts.push({ id: input.makeId(), kind: "sound", message: `${tag} on ${input.device.label}`, created_at: nowIso, acknowledged_at: null, event_id: id });
      }
      continue;
    }

    // speech
    let speakerId: string | null = null;
    let confidence: number | null = null;
    let ambiguous = false;
    let fresh: StoredSpeaker | null = null;

    if (seg.embedding && seg.embedding.length) {
      const verdict = matchSpeaker(seg.embedding, known());
      if (verdict.kind === "match") {
        const s = roster.find((x) => x.id === verdict.speaker.id);
        if (s) {
          s.embedding = mergeCentroid(s.embedding, seg.embedding, s.sample_count);
          s.sample_count += 1;
          s.confidence = identityConfidence(s.sample_count, verdict.similarity);
          s.last_heard_at = nowIso;
          changed.set(s.id, s);
          speakerId = s.id;
          confidence = Number(verdict.similarity.toFixed(3));
        }
      } else if (verdict.kind === "unsure") {
        ambiguous = true;
      } else {
        fresh = {
          id: input.makeId(),
          label: nextSpeakerLabel(roster.length),
          name: null,
          name_source: null,
          sample_count: 1,
          confidence: identityConfidence(1, 0),
          first_heard_at: nowIso,
          last_heard_at: nowIso,
          embedding: seg.embedding.slice(),
        };
        roster.push(fresh);
        changed.set(fresh.id, fresh);
        speakerId = fresh.id;
        confidence = null;
      }
    }

    let event: AmbientEvent = {
      id,
      device_id: input.device.id,
      speaker_id: speakerId,
      kind: "speech",
      transcript: null,
      tag: null,
      confidence,
      started_at: new Date(startedMs).toISOString(),
      duration_ms: seg.durationMs,
      meta: {
        ambiguousVoice: ambiguous,
        judgedBy: seg.judgedBy ?? null,
        speechRatio: seg.speechRatio ?? null,
        peakRms: seg.peakRms ?? null,
      },
    };

    const phrase = input.phraseFor({ id, startedAt: startedMs, endedAt: startedMs + seg.durationMs });
    if (phrase) {
      const speaker = speakerId ? roster.find((x) => x.id === speakerId) ?? null : null;
      const applied = applyPhrase(event, phrase, speaker, nowIso);
      event = applied.event;
      if (applied.speaker) {
        const idx = roster.findIndex((x) => x.id === applied.speaker!.id);
        if (idx >= 0) roster[idx] = applied.speaker;
        changed.set(applied.speaker.id, applied.speaker);
        notes.push(`${applied.speaker.name} named themself on ${input.device.label}.`);
      }
    }
    events.push(event);

    if (fresh && input.prefs.pushNewSpeaker) {
      alerts.push({
        id: input.makeId(),
        kind: "new voice",
        message: `a new voice (${fresh.label}) was heard on ${input.device.label}`,
        created_at: nowIso,
        acknowledged_at: null,
        event_id: id,
      });
    }
  }

  return { events, speakers: [...changed.values()], alerts, notes };
}
