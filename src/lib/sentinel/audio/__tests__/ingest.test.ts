import { describe, expect, it } from "vitest";
import { applyPhrase, ingestSegments, nextSpeakerLabel, selfStatedName, type AmbientDevice, type IngestInput, type StoredSpeaker } from "../ingest";
import type { SegmentPayload } from "../localBuffer";
import { PRINT_DIMS, l2normalise } from "../voiceprint";
import type { SpokenPhrase } from "../transcripts";

const device: AmbientDevice = { id: "dev-1", device_key: "key-1", label: "kitchen", platform: "web", status: "active", last_seen_at: "2026-01-01T00:00:00.000Z", push_prefs: {} };

/** A deterministic print: a one-hot-ish vector so two voices are far apart. */
const print = (hot: number): number[] => l2normalise(Array.from({ length: PRINT_DIMS }, (_, i) => (i === hot ? 1 : 0.05)));

const speech = (over: Partial<SegmentPayload> = {}): SegmentPayload => ({
  kind: "speech",
  startedAt: "2026-01-01T00:00:00.000Z",
  durationMs: 2_000,
  embedding: print(1),
  judgedBy: "energy detector only",
  ...over,
});

let counter = 0;
const base = (over: Partial<IngestInput> = {}): IngestInput => ({
  device,
  segments: [],
  speakers: [],
  prefs: { pushNewSpeaker: true, pushTags: ["impact — glass"] },
  phraseFor: () => null,
  now: Date.parse("2026-01-01T00:00:05.000Z"),
  makeId: () => `id-${++counter}`,
  ...over,
});

describe("ingest on this device", () => {
  it("a first voice becomes a new speaker and raises a new-voice alert", () => {
    const out = ingestSegments(base({ segments: [speech()] }));
    expect(out.events).toHaveLength(1);
    expect(out.speakers).toHaveLength(1);
    expect(out.speakers[0].label).toBe("voice one");
    expect(out.events[0].speaker_id).toBe(out.speakers[0].id);
    expect(out.alerts.map((a) => a.kind)).toEqual(["new voice"]);
    expect(out.alerts[0].event_id).toBe(out.events[0].id);
  });

  it("the same voice heard again is matched, not duplicated, and the alert stays quiet", () => {
    const first = ingestSegments(base({ segments: [speech()] }));
    const stored: StoredSpeaker[] = first.speakers;
    const again = ingestSegments(base({ segments: [speech({ startedAt: "2026-01-01T00:01:00.000Z" })], speakers: stored }));
    expect(again.events[0].speaker_id).toBe(stored[0].id);
    expect(again.speakers[0].sample_count).toBe(2);
    expect(again.alerts).toHaveLength(0);
  });

  it("a different voice is a second speaker; a short sample gets no speaker at all", () => {
    const first = ingestSegments(base({ segments: [speech()] }));
    const second = ingestSegments(base({ segments: [speech({ embedding: print(7) }), speech({ embedding: undefined })], speakers: first.speakers }));
    expect(second.speakers).toHaveLength(1);
    expect(second.speakers[0].label).toBe("voice two");
    expect(second.events[1].speaker_id).toBeNull();
    expect(second.events[1].meta.ambiguousVoice).toBe(false);
  });

  it("a sound in the alert list raises an alert; one outside it does not", () => {
    const out = ingestSegments(base({
      segments: [
        { kind: "sound", startedAt: "2026-01-01T00:00:00.000Z", durationMs: 300, tag: "impact — glass", confidence: 0.7, evidence: { lift: 4 } },
        { kind: "sound", startedAt: "2026-01-01T00:00:01.000Z", durationMs: 300, tag: "door event", confidence: 0.5, evidence: {} },
      ],
    }));
    expect(out.events.map((e) => e.tag)).toEqual(["impact — glass", "door event"]);
    expect(out.alerts).toHaveLength(1);
    expect(out.alerts[0].message).toBe("impact — glass on kitchen");
  });

  it("words already held for the turn land on it, and a self-stated name binds the voice", () => {
    const phrase: SpokenPhrase = { text: "hi, my name is Marcus and I live here", startedAt: 0, endedAt: 2_000, confidence: 0.8, lang: "en-US", local: true };
    const out = ingestSegments(base({ segments: [speech()], phraseFor: () => phrase }));
    expect(out.events[0].transcript).toBe(phrase.text);
    expect(out.events[0].meta.transcribedBy).toBe("this browser, on this device");
    expect(out.events[0].meta.nameBoundFrom).toBe("my name is Marcus");
    expect(out.speakers[0].name).toBe("Marcus");
    expect(out.notes[0]).toContain("Marcus");
  });
});

describe("name binding", () => {
  it("binds only from a self statement", () => {
    expect(selfStatedName("my name is Ada")?.name).toBe("Ada");
    expect(selfStatedName("please call me Ben")?.name).toBe("Ben");
    expect(selfStatedName("i am tired")).toBeNull();
    expect(selfStatedName("this is Ben")).toBeNull();
    expect(selfStatedName("my name is not important")).toBeNull();
    expect(selfStatedName(null)).toBeNull();
  });

  it("does not rename a voice that already has a name", () => {
    const speaker: StoredSpeaker = { id: "s", label: "voice one", name: "Ada", name_source: "named by you", sample_count: 3, confidence: 0.5, first_heard_at: "", last_heard_at: "", embedding: print(1) };
    const ev = { id: "e", device_id: "d", speaker_id: "s", kind: "speech" as const, transcript: null, tag: null, confidence: null, started_at: "", duration_ms: 1000, meta: {} };
    const phrase: SpokenPhrase = { text: "my name is Zed", startedAt: 0, endedAt: 1, confidence: null, lang: "en-US", local: false };
    const applied = applyPhrase(ev, phrase, speaker, "now");
    expect(applied.speaker).toBeNull();
    expect(applied.event.transcript).toBe("my name is Zed");
    expect(applied.event.meta.transcribedBy).toBe("this browser's speech service");
  });

  it("labels voices in order", () => {
    expect(nextSpeakerLabel(0)).toBe("voice one");
    expect(nextSpeakerLabel(11)).toBe("voice twelve");
    expect(nextSpeakerLabel(12)).toBe("voice 13");
  });
});
