import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { loadTable } from "@/lib/local/db";
import {
  T_EVENTS, T_SPEAKERS, ackAlert, closeGap, fetchAlerts, fetchEvent, fetchSettings, fetchTimeline, forgetSpeakers, ingest,
  logLocation, openGap, purgeTimeline, registerDevice, renameSpeaker, saveSettings,
} from "../sync";
import { matcherFor } from "../phraseRegistry";
import { PRINT_DIMS, l2normalise } from "../voiceprint";

const print = (hot: number): number[] => l2normalise(Array.from({ length: PRINT_DIMS }, (_, i) => (i === hot ? 1 : 0.05)));
const KEY = "lane-test";

describe("the timeline on this device", () => {
  it("writes a turn with its sealed columns and reads it back opened", async () => {
    await registerDevice(KEY, "desk", "web");
    // Real clock: the matcher drops a phrase that has waited too long, which
    // is exactly what a backdated timestamp would look like.
    const startedMs = Date.now() - 3_000;
    const startedAt = new Date(startedMs).toISOString();
    matcherFor(KEY).offerPhrase({ text: "the kettle is on", startedAt: startedMs, endedAt: startedMs + 1_800, confidence: 0.9, lang: "en-US", local: true });
    const r = await ingest(KEY, [{ kind: "speech", startedAt, durationMs: 2_000, embedding: print(2) }]);
    expect(r.events[0].transcript).toBe("the kettle is on");

    const raw = (await loadTable(T_EVENTS)) as { transcript_enc: string; meta_enc: string; transcript?: unknown }[];
    expect(raw[0].transcript).toBeUndefined();
    expect(raw[0].transcript_enc.startsWith("ENC:")).toBe(true);
    expect(raw[0].meta_enc.startsWith("ENC:")).toBe(true);

    const { events, speakers, devices } = await fetchTimeline({ limit: 10 });
    expect(events[0].transcript).toBe("the kettle is on");
    expect(events[0].meta.transcribedBy).toBe("this browser, on this device");
    expect(speakers).toHaveLength(1);
    expect((speakers[0] as { embedding?: unknown }).embedding).toBeUndefined();
    expect(devices.find((d) => d.device_key === KEY)?.label).toBe("desk");
  });

  it("searches opened words, filters by voice and lane, and finds the context around a turn", async () => {
    const { events } = await fetchTimeline({ limit: 10 });
    const hit = await fetchTimeline({ query: "kettle" });
    expect(hit.events).toHaveLength(1);
    const miss = await fetchTimeline({ query: "teapot" });
    expect(miss.events).toHaveLength(0);
    const byVoice = await fetchTimeline({ speakerId: events[0].speaker_id ?? "" });
    expect(byVoice.events).toHaveLength(1);
    const byLane = await fetchTimeline({ deviceId: "nope" });
    expect(byLane.events).toHaveLength(0);

    const around = await fetchEvent(events[0].id, 60);
    expect(around.event?.id).toBe(events[0].id);
    expect(around.context.length).toBeGreaterThanOrEqual(1);
    expect((await fetchEvent("missing")).event).toBeNull();
  });

  it("opens a gap, closes it with its duration, and seals a location row's coordinates", async () => {
    const gapStart = Date.now() - 10 * 60_000;
    const { gapId } = await openGap(KEY, new Date(gapStart).toISOString(), "the tab reloaded");
    expect(gapId).toBeTruthy();
    await closeGap(gapId as string, new Date(gapStart + 5 * 60_000).toISOString());
    const gap = (await fetchEvent(gapId as string, 0)).event;
    expect(gap?.kind).toBe("gap");
    expect(gap?.duration_ms).toBe(5 * 60_000);
    expect(gap?.meta.open).toBe(false);

    await logLocation(KEY, [{ atIso: new Date(gapStart + 6 * 60_000).toISOString(), lat: 51.5, lon: -0.12, accuracyM: 12, source: "gps", place: "somewhere" }]);
    const raw = (await loadTable(T_EVENTS)) as { kind: string; meta_enc: string }[];
    const loc = raw.find((r) => r.kind === "location");
    expect(loc?.meta_enc.includes("51.5")).toBe(false);
    const opened = (await fetchTimeline({ tag: "gps" })).events[0];
    expect(opened.meta.lat).toBe(51.5);
  });

  it("names a voice, acknowledges an alert, and settings round-trip", async () => {
    const { speakers } = await fetchTimeline({ limit: 1 });
    const renamed = await renameSpeaker(speakers[0].id, "  Ada  ");
    expect(renamed.speaker.name).toBe("Ada");
    expect(renamed.speaker.name_source).toBe("named by you");
    const rawSpeakers = (await loadTable(T_SPEAKERS)) as { name_enc: string; name?: unknown }[];
    expect(rawSpeakers[0].name).toBeUndefined();
    expect(rawSpeakers[0].name_enc.startsWith("ENC:")).toBe(true);
    await expect(renameSpeaker(speakers[0].id, "   ")).rejects.toThrow();

    const { alerts } = await fetchAlerts();
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    await ackAlert(alerts[0].id);
    expect((await fetchAlerts()).alerts.find((a) => a.id === alerts[0].id)?.acknowledged_at).toBeTruthy();

    await saveSettings({ transcribe: false, sensitivity: "far" }, 24);
    const s = await fetchSettings();
    expect(s.prefs.transcribe).toBe(false);
    expect(s.prefs.sensitivity).toBe("far");
    expect(s.retentionHours).toBe(24);
  });

  it("deletes the timeline and alerts, keeps voices until they are forgotten", async () => {
    const before = await fetchTimeline({ limit: 100 });
    expect(before.events.length).toBeGreaterThan(0);
    const { deleted } = await purgeTimeline(new Date().toISOString());
    expect(deleted).toBe(before.events.length);
    const after = await fetchTimeline({ limit: 100 });
    expect(after.events).toHaveLength(0);
    expect((await fetchAlerts()).alerts).toHaveLength(0);
    expect(after.speakers).toHaveLength(1);
    expect((await forgetSpeakers()).deleted).toBe(1);
    expect((await fetchTimeline({})).speakers).toHaveLength(0);
  });
});
