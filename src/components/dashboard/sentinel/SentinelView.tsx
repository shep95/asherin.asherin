import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bluetooth, Check, Download, Ear, HardDrive, History, Languages, Loader2, Mic, MicOff, Plus, Radio, Search, Signal, Trash2, Unplug, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { deviceLabel } from "@/lib/sentinel/audio/captureEngine";
import {
  bufferStats, deleteSession, listSessions, payloadsBetween, wipeLocal,
  DEFAULT_RETENTION_HOURS, type RecordingSession,
} from "@/lib/sentinel/audio/localBuffer";
import {
  addChannel, audioInputs, bootChannels, inputTaken, listChannels, refreshInputs,
  removeChannel, renameChannel, setChannelLanguages, setChannelSensitivity, startChannel, stopChannel,
  subscribeChannelIngest, subscribeChannels, type ChannelView,
} from "@/lib/sentinel/audio/channels";
import { AUTO_SOURCE, LANGUAGES, NO_TRANSLATION, languageName } from "@/lib/sentinel/audio/languages";
import { isVadSensitivity, type VadSensitivity } from "@/lib/sentinel/audio/vad";
import { DEFAULT_PUSH_TAGS } from "@/lib/sentinel/audio/soundEvents";
import {
  ackAlert, fetchAlerts, fetchEvent, fetchSettings, fetchTimeline, renameSpeaker, saveSettings, purgeRemote,
  type AmbientAlert, type AmbientDevice, type AmbientEvent, type AmbientSpeaker,
} from "@/lib/sentinel/audio/sync";
import CompanionPanel from "./CompanionPanel";
import EnvironmentPanel from "./EnvironmentPanel";


/**
 * asherin.sentinel — the ambient watch, and the truth about its reach.
 *
 * The watch is no longer one microphone. Each CHANNEL binds one input — the
 * machine's own mic, a bluetooth headset, a usb array — to one named lane with
 * its own language contract, and every lane writes into the same searchable
 * account timeline. A bluetooth channel moves the microphone onto the person,
 * so distance from the machine stops being the limit; the headset's own radio
 * range is.
 *
 * The room states its boundary on its face rather than in a footnote: a browser
 * holds its inputs while this page lives, including behind other tabs and while
 * a desktop screen sleeps. It does NOT hold them after the tab closes or after a
 * phone suspends the browser. Whatever is missed is written into the timeline as
 * a visible gap, never hidden as quiet.
 */

type Tab = "live" | "channels" | "environment" | "timeline" | "speakers" | "alerts" | "history" | "devices";

const card = "rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";
const chip = "rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/55";

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour12: false });
const dayStamp = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

const SentinelView = () => {
  const { toast } = useToast();
  const [channels, setChannels] = useState<ChannelView[]>([]);
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [labelsUnlocked, setLabelsUnlocked] = useState(false);
  const [tab, setTab] = useState<Tab>("live");
  const [events, setEvents] = useState<AmbientEvent[]>([]);

  const [speakers, setSpeakers] = useState<AmbientSpeaker[]>([]);
  const [devices, setDevices] = useState<AmbientDevice[]>([]);
  const [alerts, setAlerts] = useState<AmbientAlert[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [exporting, setExporting] = useState<string | null>(null);
  const [openAlert, setOpenAlert] = useState<string | null>(null);
  const [incident, setIncident] = useState<{ alertId: string; loading: boolean; error: string | null; event: AmbientEvent | null; context: AmbientEvent[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [speakerFilter, setSpeakerFilter] = useState<string>("");
  const [laneFilter, setLaneFilter] = useState<string>("");

  const [buffer, setBuffer] = useState({ total: 0, pending: 0, oldestAt: null as number | null });
  const [transcribeOn, setTranscribeOn] = useState(true);
  const [pushNewSpeaker, setPushNewSpeaker] = useState(true);
  const [retention, setRetention] = useState(DEFAULT_RETENTION_HOURS);
  const [sensitivity, setSensitivity] = useState<VadSensitivity>("balanced");
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const pushNote = useCallback((note: string) => {
    setNotes((prev) => (prev.includes(note) ? prev : [note, ...prev].slice(0, 6)));
  }, []);

  // Channels live at module scope, so leaving this room — or any other
  // navigation inside the app — no longer ends a watch. This view subscribes to
  // the roster and unsubscribes on unmount; the capture itself is untouched.
  useEffect(() => {
    bootChannels();
    const sync = () => {
      setChannels(listChannels());
      setInputs(audioInputs());
    };
    sync();
    const offRoster = subscribeChannels(sync);
    const offIngest = subscribeChannelIngest((_id, result) => {
      if (result.events?.length) setEvents((prev) => [...result.events, ...prev].slice(0, 400));
      if (result.speakers?.length) {
        setSpeakers((prev) => {
          const map = new Map(prev.map((s) => [s.id, s]));
          for (const s of result.speakers) map.set(s.id, s);
          return [...map.values()].sort((a, b) => a.first_heard_at.localeCompare(b.first_heard_at));
        });
      }
      if (result.alerts?.length) setAlerts((prev) => [...result.alerts, ...prev].slice(0, 100));
      if (result.notes?.length) result.notes.forEach((n) => pushNote(n));
    });
    void refreshInputs().then((list) => {
      setInputs(list);
      // A browser withholds input names until microphone permission has been
      // granted once. An unnamed roster is unusable for choosing a headset, so
      // the room says so instead of showing "audioinput 2".
      setLabelsUnlocked(list.length === 0 || list.some((d) => Boolean(d.label)));
    });
    return () => { offRoster(); offIngest(); };
  }, [pushNote]);


  const reload = useCallback(async () => {
    setLoadError(null);
    try {
      const [timeline, alertList, settings] = await Promise.all([
        fetchTimeline({ limit: 200, query: query.trim() || undefined, speakerId: speakerFilter || undefined, deviceId: laneFilter || undefined }),
        fetchAlerts(),
        fetchSettings(),
      ]);
      setEvents(timeline.events);
      setSpeakers(timeline.speakers);
      setDevices(timeline.devices);
      setAlerts(alertList.alerts);
      const prefs = settings.prefs as { transcribe?: boolean; pushNewSpeaker?: boolean; sensitivity?: unknown };
      setTranscribeOn(prefs.transcribe !== false);
      setPushNewSpeaker(prefs.pushNewSpeaker !== false);
      setRetention(settings.retentionHours || DEFAULT_RETENTION_HOURS);
      const sens: VadSensitivity = isVadSensitivity(prefs.sensitivity) ? prefs.sensitivity : "balanced";
      setSensitivity(sens);
      setChannelSensitivity(sens);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "the account timeline could not be read.");
    } finally {
      setLoading(false);
    }
  }, [query, speakerFilter, laneFilter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const tick = window.setInterval(() => void bufferStats().then(setBuffer), 4000);
    void bufferStats().then(setBuffer);
    return () => window.clearInterval(tick);
  }, []);

  // The watch is deliberately NOT stopped on unmount. Stopping here was the
  // bug: opening another room killed a capture the operator had explicitly
  // started. It ends only on a stop control or when the tab itself dies.
  useEffect(() => { void listSessions().then(setSessions); }, [tab]);

  const listening = channels.some((c) => c.listening);
  const liveCount = channels.filter((c) => c.listening).length;
  /** The loudest live channel drives the header meter: a header showing a dead
   *  lane's level while another lane is capturing would read as silence. */
  const lead = useMemo(
    () => channels.filter((c) => c.listening).sort((a, b) => (b.status?.level ?? 0) - (a.status?.level ?? 0))[0] ?? channels[0] ?? null,
    [channels],
  );
  const status = lead?.status ?? null;
  const channelNotes = useMemo(() => [...new Set(channels.flatMap((c) => c.notes))].slice(0, 6), [channels]);

  /** Start every channel that is not already running, or stop all of them.
   *  Partial failures are named per channel rather than collapsed into one
   *  "the watch did not start", which hid which headset was off. */
  const toggle = async () => {
    setBusy(true);
    try {
      if (listening) {
        await Promise.all(channels.filter((c) => c.listening).map((c) => stopChannel(c.config.id)));
      } else {
        const results = await Promise.all(
          channels.map(async (c) => ({ label: c.config.label, ok: await startChannel(c.config.id).catch(() => false) })),
        );
        const failed = results.filter((r) => !r.ok);
        if (failed.length === results.length) {
          toast({ title: "the watch did not start", description: failed.map((f) => f.label).join(", "), variant: "destructive" });
        } else if (failed.length) {
          toast({ title: `${failed.length} channel${failed.length === 1 ? "" : "s"} did not start`, description: `${failed.map((f) => f.label).join(", ")} — check the device is powered on and connected.` });
        }
      }
    } finally {
      setBusy(false);
    }
  };


  const persistSettings = async (patch: { transcribe?: boolean; pushNewSpeaker?: boolean; retentionHours?: number; sensitivity?: VadSensitivity }) => {
    const next = {
      transcribe: patch.transcribe ?? transcribeOn,
      pushNewSpeaker: patch.pushNewSpeaker ?? pushNewSpeaker,
      sensitivity: patch.sensitivity ?? sensitivity,
      pushTags: DEFAULT_PUSH_TAGS,
    };
    setTranscribeOn(next.transcribe);
    setPushNewSpeaker(next.pushNewSpeaker);
    setSensitivity(next.sensitivity);
    setChannelSensitivity(next.sensitivity);
    const hours = patch.retentionHours ?? retention;
    setRetention(hours);
    try {
      await saveSettings(next, hours);
    } catch (e) {
      pushNote(e instanceof Error ? e.message : "settings could not be saved.");
    }
  };

  /** Opens the turn an alert was raised about. An alert without an event id
   *  refers to a device or account condition, not a recorded turn — that is
   *  said plainly instead of spinning on an empty fetch. */
  const openIncident = async (alert: AmbientAlert) => {
    if (openAlert === alert.id) { setOpenAlert(null); return; }
    setOpenAlert(alert.id);
    if (!alert.event_id) {
      setIncident({ alertId: alert.id, loading: false, error: "this alert was raised about the watch itself, not about a recorded turn.", event: null, context: [] });
      return;
    }
    setIncident({ alertId: alert.id, loading: true, error: null, event: null, context: [] });
    try {
      const res = await fetchEvent(alert.event_id);
      if (res.speakers?.length) {
        setSpeakers((prev) => {
          const map = new Map(prev.map((x) => [x.id, x]));
          for (const sp of res.speakers) map.set(sp.id, sp);
          return [...map.values()];
        });
      }
      setIncident({
        alertId: alert.id,
        loading: false,
        error: res.event ? null : "that turn is no longer in the account timeline — it was purged or aged out.",
        event: res.event,
        context: res.context ?? [],
      });
    } catch (e) {
      setIncident({ alertId: alert.id, loading: false, error: e instanceof Error ? e.message : "the transcript could not be read.", event: null, context: [] });
    }
  };

  /** A session download is assembled from two independent records: the account
   *  timeline (transcripts) and this device's still-retained encrypted audio.
   *  Either can legitimately be empty by the time it is asked for, and the
   *  archive says which rather than pretending to be complete. */
  const exportSession = async (session: RecordingSession) => {
    setExporting(session.id);
    try {
      const endedAt = session.endedAt ?? Date.now();
      const [{ default: JSZip }, timeline, clips] = await Promise.all([
        import("jszip"),
        fetchTimeline({
          sinceIso: new Date(session.startedAt - 1000).toISOString(),
          untilIso: new Date(endedAt + 1000).toISOString(),
          limit: 500,
        }).catch(() => ({ events: [] as AmbientEvent[], speakers: [] as AmbientSpeaker[], devices: [] as AmbientDevice[] })),
        payloadsBetween(session.startedAt - 1000, endedAt + 1000),
      ]);
      const ordered = [...timeline.events].sort((a, b) => a.started_at.localeCompare(b.started_at));
      const nameOf = (id: string | null) => {
        const sp = timeline.speakers.find((x) => x.id === id);
        return sp?.name || sp?.label || (id ? "unknown voice" : "unattributed voice");
      };
      const lines = ordered.map((ev) =>
        ev.kind === "sound"
          ? `[${clock(ev.started_at)}] (sound: ${ev.tag ?? "unclassified"})`
          : `[${clock(ev.started_at)}] ${nameOf(ev.speaker_id)}: ${ev.transcript || "(no transcript)"}`,
      );
      const zip = new JSZip();
      zip.file(
        "transcript.txt",
        [
          `asherin.sentinel session`,
          `device: ${session.deviceLabel}`,
          `started: ${new Date(session.startedAt).toLocaleString()}`,
          `ended: ${session.endedAt ? new Date(session.endedAt).toLocaleString() : "still running"}`,
          `turns in the account timeline for this window: ${ordered.length}`,
          `audio clips still held on this device: ${clips.length}`,
          "",
          ...(lines.length ? lines : ["no turn was recorded in this window, or the timeline for it has been purged."]),
        ].join("\n"),
      );
      zip.file("timeline.json", JSON.stringify({ session, events: ordered, speakers: timeline.speakers }, null, 2));
      let written = 0;
      for (const clip of clips) {
        if (!clip.payload.audio) continue;
        const stamp = new Date(clip.at).toISOString().replace(/[:.]/g, "-");
        zip.file(`audio/${stamp}-${clip.payload.kind}.wav`, clip.payload.audio, { base64: true });
        written += 1;
      }
      if (!written) {
        zip.file("audio/README.txt", "no audio from this session is still on this device: it passed the retention window set in watch settings, or it was wiped.");
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `asherin-sentinel-${new Date(session.startedAt).toISOString().slice(0, 19).replace(/[:T]/g, "-")}.zip`;
      a.click();
      // Revoked on the next frame: revoking synchronously can cancel the
      // download in some browsers before it has read the blob.
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast({ title: "session downloaded", description: `${ordered.length} turns · ${written} audio clips` });
    } catch (e) {
      pushNote(e instanceof Error ? e.message : "the session could not be packaged.");
    } finally {
      setExporting(null);
    }
  };

  const speakerName = (id: string | null) => {
    if (!id) return "unattributed voice";
    const s = speakers.find((x) => x.id === id);
    return s?.name || s?.label || "unknown voice";
  };

  /** Which lane a turn came in on. Unknown is said plainly: a turn whose device
   *  row was deleted must not be silently attributed to the machine's own mic. */
  const laneName = (id: string | null) => devices.find((d) => d.id === id)?.label ?? (id ? "a channel no longer registered" : "unassigned channel");


  const tabs: Array<{ key: Tab; label: string; icon: typeof Ear }> = [
    { key: "live", label: "live", icon: Radio },
    { key: "channels", label: "channels", icon: Bluetooth },
    { key: "environment", label: "environment", icon: Signal },
    { key: "timeline", label: "timeline", icon: Activity },
    { key: "speakers", label: "speakers", icon: Users },
    { key: "alerts", label: "alerts", icon: AlertTriangle },
    { key: "history", label: "history", icon: History },
    { key: "devices", label: "devices", icon: HardDrive },
  ];


  const meterWidth = Math.min(100, Math.round((status?.level ?? 0) * 900));

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      <header className={`${card} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[240px]">
            <h1 className="font-light tracking-tight text-2xl text-white/90">asherin.sentinel</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/50">
              an ambient watch across as many inputs as you connect. each channel is its own named lane with its own
              language, and every lane lands in one searchable account timeline.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-[11px] leading-tight text-white/40">
              <div>{deviceLabel()}</div>
              <div>{liveCount} of {channels.length} channel{channels.length === 1 ? "" : "s"} live</div>
              <div>{buffer.pending} buffered · {buffer.total} on device</div>
            </div>
            <Button
              onClick={toggle}
              disabled={busy || !channels.length}
              className={`h-11 rounded-xl border px-5 font-light ${listening ? "border-white/20 bg-white/[0.08] text-white/90" : "border-white/15 bg-white/[0.05] text-white/70"}`}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : listening ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
              {listening ? "stop every channel" : "start every channel"}
            </Button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/15 bg-white/[0.05] p-3">
          <p className="text-xs leading-relaxed text-white/70">
            <span className="font-medium text-white/90">truth boundary:</span> a running channel keeps capturing while you move between rooms in this dashboard, while this tab sits behind other tabs or apps, and while a desktop screen locks. it does not survive this tab closing, the browser quitting, the phone sleeping the browser, or the device powering off — and when any of that happens the missing stretch is written into the timeline as a visible gap rather than shown as quiet. a bluetooth channel follows the person wearing it, so distance from this machine stops mattering; its own radio range is the limit. to keep listening with no browser open, pair the desktop companion under devices. the account timeline is the authoritative record.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className={chip}>{listening ? `${liveCount} listening` : status?.state ?? "idle"}</span>
          {listening && <span className={chip}>{lead?.config.label}</span>}
          {listening && <span className={chip}>{status?.speaking ? "voice" : "ambient"}</span>}
          {listening && <span className={chip}>floor {(status?.noiseFloor ?? 0).toFixed(4)}</span>}
          {listening && <span className={chip}>{status?.sampleRate ?? 0} hz</span>}
          {channels.some((c) => c.gapOpen) && <span className={chip}>gap open</span>}
          <div className="h-1.5 min-w-[120px] flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-white/40 transition-[width] duration-150" style={{ width: `${meterWidth}%` }} />
          </div>
        </div>

        {status?.message && (
          <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/60">{status.message}</p>
        )}
        {(notes.length > 0 || channelNotes.length > 0) && (
          <ul className="mt-3 space-y-1">
            {[...new Set([...notes, ...channelNotes])].slice(0, 8).map((n) => (
              <li key={n} className="text-[11px] text-white/45">— {n}</li>
            ))}
          </ul>
        )}
      </header>


      <nav className="flex flex-wrap gap-2">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-light tracking-wide transition-colors ${
              tab === key ? "border-white/20 bg-white/[0.08] text-white/90" : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/75"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {key === "alerts" && alerts.some((a) => !a.acknowledged_at) && (
              <span className="ml-1 h-1.5 w-1.5 rounded-full bg-white/70" />
            )}
          </button>
        ))}
      </nav>

      {loadError && (
        <div className={`${card} flex items-center justify-between gap-3 p-4 text-sm text-white/60`}>
          <span>{loadError}</span>
          <Button variant="ghost" className="h-8 rounded-lg text-xs text-white/70" onClick={() => void reload()}>retry</Button>
        </div>
      )}

      {loading ? (
        <div className={`${card} flex items-center gap-3 p-6 text-sm text-white/50`}>
          <Loader2 className="h-4 w-4 animate-spin" /> reading the account timeline
        </div>
      ) : tab === "live" ? (
        <section className={`${card} p-5`}>
          <h2 className="mb-3 text-sm font-light tracking-wide text-white/70">live feed</h2>
          {!listening && (
            <p className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-white/55">
              the watch is not running. when you start it, this device asks for the microphone once, keeps every captured
              turn encrypted here first, and uploads it to your account. recording other people may require their consent
              where you are; that is your call to make, not the software's.
            </p>
          )}
          <div className="space-y-2">
            {events.slice(0, 40).map((ev) => (
              <EventRow key={ev.id} ev={ev} name={speakerName(ev.speaker_id)} lane={laneName(ev.device_id)} />
            ))}
            {!events.length && (
              <p className="py-8 text-center text-sm text-white/40">
                nothing captured yet. start a channel and speak — a turn appears here the moment it closes and syncs.
              </p>
            )}
          </div>
        </section>
      ) : tab === "channels" ? (
        <ChannelsPanel
          channels={channels}
          inputs={inputs}
          labelsUnlocked={labelsUnlocked}
          onUnlockLabels={async () => {
            const { unlockInputLabels } = await import("@/lib/sentinel/audio/channels");
            const ok = await unlockInputLabels();
            setLabelsUnlocked(ok);
            setInputs(audioInputs());
            if (!ok) pushNote("the microphone was refused, so this browser will not name your inputs.");
          }}
          onNote={pushNote}
        />
      ) : tab === "environment" ? (
        <EnvironmentPanel />
      ) : tab === "timeline" ? (

        <section className={`${card} p-5`}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="search what was said"
                className="h-10 rounded-xl border-white/10 bg-white/[0.04] pl-9 text-sm text-white/80 placeholder:text-white/30"
              />
            </div>
            <select
              value={speakerFilter}
              onChange={(e) => setSpeakerFilter(e.target.value)}
              className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white/70"
            >
              <option value="">every voice</option>
              {speakers.map((s) => (
                <option key={s.id} value={s.id}>{s.name || s.label}</option>
              ))}
            </select>
            <select
              value={laneFilter}
              onChange={(e) => setLaneFilter(e.target.value)}
              className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white/70"
            >
              <option value="">every channel</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
            <Button variant="ghost" className="h-10 rounded-xl text-xs text-white/60" onClick={() => void reload()}>refresh</Button>
          </div>
          <div className="space-y-2">
            {events.map((ev) => (
              <EventRow key={ev.id} ev={ev} name={speakerName(ev.speaker_id)} lane={laneName(ev.device_id)} showDay />
            ))}
            {!events.length && <p className="py-8 text-center text-sm text-white/40">no turn matches that.</p>}

          </div>
        </section>
      ) : tab === "speakers" ? (
        <section className={`${card} p-5`}>
          <h2 className="mb-1 text-sm font-light tracking-wide text-white/70">speakers</h2>
          <p className="mb-4 text-xs leading-relaxed text-white/45">
            identity here is acoustic similarity across this account's own samples — pitch register, resonance, cadence.
            it is not forensic voice verification, and the confidence shown is a similarity margin, not a probability of
            identity. a name only binds itself when someone states it about themselves; you can rename anyone.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {speakers.map((s) => (
              <div key={s.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white/85">{s.name || s.label}</div>
                    <div className="mt-1 text-[11px] text-white/40">
                      {s.sample_count} sample{s.sample_count === 1 ? "" : "s"} · confidence {s.confidence.toFixed(2)}
                    </div>
                    {s.name_source && <div className="mt-1 text-[11px] italic text-white/35">{s.name_source}</div>}
                  </div>
                  <Button
                    variant="ghost"
                    className="h-7 rounded-lg px-2 text-[11px] text-white/55"
                    onClick={() => setRenaming({ id: s.id, value: s.name || "" })}
                  >
                    rename
                  </Button>
                </div>
                {renaming?.id === s.id && (
                  <div className="mt-3 flex gap-2">
                    <Input
                      value={renaming.value}
                      onChange={(e) => setRenaming({ id: s.id, value: e.target.value })}
                      className="h-9 rounded-lg border-white/10 bg-white/[0.05] text-sm text-white/80"
                      placeholder="their name"
                    />
                    <Button
                      className="h-9 rounded-lg border border-white/15 bg-white/[0.06] text-xs text-white/80"
                      onClick={async () => {
                        const name = renaming.value.trim();
                        if (!name) return;
                        try {
                          const { speaker } = await renameSpeaker(s.id, name);
                          setSpeakers((prev) => prev.map((x) => (x.id === speaker.id ? speaker : x)));
                          setRenaming(null);
                        } catch (e) {
                          pushNote(e instanceof Error ? e.message : "the rename did not save.");
                        }
                      }}
                    >
                      save
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {!speakers.length && <p className="py-8 text-center text-sm text-white/40">no voice has been heard yet.</p>}
          </div>
        </section>
      ) : tab === "alerts" ? (
        <section className={`${card} p-5`}>
          <h2 className="mb-4 text-sm font-light tracking-wide text-white/70">alerts</h2>
          <div className="space-y-2">
            {alerts.map((a) => (
              <div key={a.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between gap-3">
                <button className="min-w-0 flex-1 text-left" onClick={() => void openIncident(a)}>
                  <div className="truncate text-sm text-white/80">{a.message}</div>
                  <div className="text-[11px] text-white/40">
                    {dayStamp(a.created_at)} {clock(a.created_at)} · {a.kind} · {openAlert === a.id ? "hide the transcript" : "read the transcript"}
                  </div>
                </button>
                {a.acknowledged_at ? (
                  <Check className="h-4 w-4 shrink-0 text-white/35" />
                ) : (
                  <Button
                    variant="ghost"
                    className="h-8 shrink-0 rounded-lg text-[11px] text-white/60"
                    onClick={async () => {
                      try {
                        await ackAlert(a.id);
                        setAlerts((prev) => prev.map((x) => (x.id === a.id ? { ...x, acknowledged_at: new Date().toISOString() } : x)));
                      } catch { pushNote("the alert could not be acknowledged."); }
                    }}
                  >
                    acknowledge
                  </Button>
                )}
              </div>
              {openAlert === a.id && (
                <div className="mt-3 border-t border-white/10 pt-3">
                  {incident?.alertId !== a.id || incident.loading ? (
                    <div className="flex items-center gap-2 text-xs text-white/45"><Loader2 className="h-3.5 w-3.5 animate-spin" /> reading the turn behind this alert</div>
                  ) : incident.error ? (
                    <p className="text-xs text-white/45">{incident.error}</p>
                  ) : (
                    <div className="space-y-2">
                      {(incident.context.length ? incident.context : incident.event ? [incident.event] : []).map((ev) => (
                        <div key={ev.id} className={ev.id === incident.event?.id ? "rounded-xl border border-white/20 bg-white/[0.05]" : ""}>
                          <EventRow ev={ev} name={speakerName(ev.speaker_id)} lane={laneName(ev.device_id)} />
                        </div>
                      ))}
                      <p className="text-[11px] text-white/35">the highlighted turn is the one that raised this alert; the rest is what was said around it.</p>
                    </div>
                  )}
                </div>
              )}
              </div>
            ))}
            {!alerts.length && <p className="py-8 text-center text-sm text-white/40">nothing has met an alert threshold.</p>}
          </div>
        </section>
      ) : tab === "history" ? (
        <section className={`${card} p-5`}>
          <h2 className="mb-1 text-sm font-light tracking-wide text-white/70">recording history</h2>
          <p className="mb-4 max-w-3xl text-xs leading-relaxed text-white/45">
            every stretch between start and stop on this device. a download packages the transcripts for that window from
            your account timeline together with whatever audio is still held here — audio ages out on the retention you
            set under devices, so an older session may come back as transcript only, and the archive says so on its face.
          </p>
          <div className="space-y-2">
            {sessions.map((sess) => {
              const running = sess.endedAt === null;
              const mins = Math.max(1, Math.round(((sess.endedAt ?? Date.now()) - sess.startedAt) / 60_000));
              return (
                <div key={sess.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white/80">
                      {new Date(sess.startedAt).toLocaleString()} {running && <span className={`${chip} ml-2`}>running</span>}
                    </div>
                    <div className="text-[11px] text-white/40">
                      {mins} min · {sess.speechSegments} speech · {sess.soundSegments} sound · {sess.deviceLabel}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="ghost"
                      disabled={exporting === sess.id}
                      className="h-8 rounded-lg border border-white/10 text-[11px] text-white/65"
                      onClick={() => void exportSession(sess)}
                    >
                      {exporting === sess.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
                      download
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-8 rounded-lg text-[11px] text-white/40"
                      onClick={async () => { await deleteSession(sess.id); setSessions((prev) => prev.filter((x) => x.id !== sess.id)); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {!sessions.length && (
              <p className="py-8 text-center text-sm text-white/40">no session yet. history begins with the first time you start the watch on this device.</p>
            )}
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          <div className={`${card} p-5`}>
            <h2 className="mb-4 text-sm font-light tracking-wide text-white/70">devices</h2>
            <div className="space-y-2">
              {devices.map((d) => {
                const stale = Date.now() - Date.parse(d.last_seen_at) > 5 * 60_000;
                return (
                  <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-white/80">{d.label}</div>
                      <div className="text-[11px] text-white/40">{d.platform} · last seen {clock(d.last_seen_at)} {dayStamp(d.last_seen_at)}</div>
                    </div>
                    <span className={chip}>{stale ? "offline" : d.status}</span>
                  </div>
                );
              })}
              {!devices.length && <p className="py-6 text-center text-sm text-white/40">no device has registered yet.</p>}
            </div>
          </div>

          <CompanionPanel />

          <div className={`${card} space-y-4 p-5`}>
            <h2 className="text-sm font-light tracking-wide text-white/70">watch settings</h2>
            <label className="flex items-center justify-between gap-4">
              <span className="text-sm text-white/65">transcribe speech turns</span>
              <Switch checked={transcribeOn} onCheckedChange={(v) => void persistSettings({ transcribe: v })} />
            </label>
            <label className="flex items-center justify-between gap-4">
              <span className="text-sm text-white/65">alert when a new voice appears</span>
              <Switch checked={pushNewSpeaker} onCheckedChange={(v) => void persistSettings({ pushNewSpeaker: v })} />
            </label>
            <label className="flex items-center justify-between gap-4">
              <span className="text-sm text-white/65">pickup sensitivity</span>
              <select
                value={sensitivity}
                onChange={(e) => void persistSettings({ sensitivity: e.target.value as VadSensitivity })}
                className="h-9 rounded-lg border border-white/10 bg-white/[0.05] px-2 text-sm text-white/75"
              >
                <option value="near">near — speaker beside the device</option>
                <option value="balanced">balanced — across a desk</option>
                <option value="far">far — across a room</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-4">
              <span className="text-sm text-white/65">keep on this device for</span>
              <select
                value={retention}
                onChange={(e) => void persistSettings({ retentionHours: Number(e.target.value) })}
                className="h-9 rounded-lg border border-white/10 bg-white/[0.05] px-2 text-sm text-white/75"
              >
                {[12, 24, 72, 168].map((h) => (
                  <option key={h} value={h}>{h} hours</option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                variant="ghost"
                className="h-9 rounded-lg border border-white/10 text-xs text-white/60"
                onClick={async () => { await wipeLocal(); setBuffer({ total: 0, pending: 0, oldestAt: null }); pushNote("the local buffer on this device was wiped."); }}
              >
                wipe this device's buffer
              </Button>
              <Button
                variant="ghost"
                className="h-9 rounded-lg border border-white/10 text-xs text-white/60"
                onClick={async () => {
                  try {
                    const { deleted } = await purgeRemote(new Date().toISOString());
                    setEvents([]);
                    pushNote(`${deleted} stored turns were deleted from the account.`);
                  } catch (e) { pushNote(e instanceof Error ? e.message : "the purge did not run."); }
                }}
              >
                delete the account timeline
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

const EventRow = ({ ev, name, lane, showDay }: { ev: AmbientEvent; name: string; lane: string; showDay?: boolean }) => {
  const meta = ev.meta as {
    ambiguousVoice?: boolean;
    nameBoundFrom?: string | null;
    translated?: boolean;
    translateTo?: string | null;
    sourceLang?: string | null;
    sourceTranscript?: string | null;
    reason?: string;
    open?: boolean;
  };
  const sound = ev.kind === "sound";
  const gap = ev.kind === "gap";
  const mins = ev.duration_ms ? Math.max(1, Math.round(ev.duration_ms / 60_000)) : null;

  // A gap is the one row that describes what is NOT here. It reads differently
  // on purpose: a dashed frame, no speaker, and the reason capture ended.
  if (gap) {
    return (
      <div className="flex gap-3 rounded-xl border border-dashed border-white/20 bg-white/[0.015] p-3">
        <div className="w-[86px] shrink-0 font-mono text-[11px] leading-5 text-white/35">
          {showDay && <div>{dayStamp(ev.started_at)}</div>}
          {clock(ev.started_at)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/50">
            <Unplug className="h-3 w-3" />
            capture gap · {lane}
            <span className="text-white/35">{meta?.open ? "still open" : mins ? `${mins} min not captured` : "closed"}</span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-white/60">
            {meta?.reason || "this channel stopped capturing."} nothing from this stretch was recorded.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="w-[86px] shrink-0 font-mono text-[11px] leading-5 text-white/35">
        {showDay && <div>{dayStamp(ev.started_at)}</div>}
        {clock(ev.started_at)}
      </div>
      <div className="min-w-0 flex-1">
        {sound ? (
          <div className="text-sm text-white/60">
            <span className="mr-2 rounded-md border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] uppercase tracking-wider text-white/55">
              {ev.tag}
            </span>
            <span className="mr-2 text-[11px] text-white/35">{lane}</span>
            {ev.confidence !== null && <span className="text-[11px] text-white/35">confidence {ev.confidence.toFixed(2)}</span>}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/45">
              <Ear className="h-3 w-3" />
              <span className="text-white/70">{name}</span>
              <span className="text-white/35">· {lane}</span>
              {meta?.translated && (
                <span className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white/50">
                  {languageName(meta.sourceLang)} → {languageName(meta.translateTo)}
                </span>
              )}
              {meta?.ambiguousVoice && <span className="text-white/35">— two stored voices matched too closely to separate</span>}
              {meta?.nameBoundFrom && <span className="text-white/35">— named from “{meta.nameBoundFrom}”</span>}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-white/80">
              {ev.transcript || <span className="text-white/35">no transcript for this turn</span>}
            </p>
            {meta?.translated && meta.sourceTranscript && (
              <p className="mt-1 border-l border-white/10 pl-2 text-[12px] leading-relaxed text-white/40">
                as spoken: {meta.sourceTranscript}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

/**
 * The channel roster. One card per input, responsive from a phone to a wide
 * desktop, each carrying its own name, its own language contract, its own
 * start/stop, and its own honest state — including "this input is not connected
 * right now", which is the failure a silent headset used to hide.
 */
const ChannelsPanel = ({
  channels, inputs, labelsUnlocked, onUnlockLabels, onNote,
}: {
  channels: ChannelView[];
  inputs: MediaDeviceInfo[];
  labelsUnlocked: boolean;
  onUnlockLabels: () => Promise<void>;
  onNote: (n: string) => void;
}) => {
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState("");
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const free = inputs.filter((d) => !inputTaken(d.deviceId));

  return (
    <section className="space-y-4">
      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-light tracking-wide text-white/70">channels</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/45">
              one input, one lane, one language. connect a bluetooth headset in your operating system first, then add it
              here — the browser can only open inputs the system has already paired. each lane starts and stops on its
              own, and anything it misses is written into the timeline as a gap.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="h-9 rounded-lg border border-white/10 text-xs text-white/60"
              onClick={() => void refreshInputs()}
            >
              rescan inputs
            </Button>
            <Button
              className="h-9 rounded-lg border border-white/15 bg-white/[0.06] text-xs text-white/80"
              onClick={() => setAdding((v) => !v)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> add a channel
            </Button>
          </div>
        </div>

        {adding && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            {!labelsUnlocked && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-3">
                <span className="text-xs text-white/60">this browser hides input names until the microphone has been allowed once.</span>
                <Button variant="ghost" className="h-8 rounded-lg border border-white/10 text-[11px] text-white/70" onClick={() => void onUnlockLabels()}>
                  show my inputs
                </Button>
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white/75"
              >
                <option value="">choose an input</option>
                {free.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || "unnamed input"}</option>
                ))}
              </select>
              <Button
                disabled={!pick}
                className="h-10 rounded-xl border border-white/15 bg-white/[0.06] text-xs text-white/80"
                onClick={() => {
                  const input = inputs.find((d) => d.deviceId === pick);
                  if (!input) return;
                  addChannel({ inputDeviceId: input.deviceId, inputLabel: input.label || "unnamed input" });
                  setPick("");
                  setAdding(false);
                }}
              >
                add
              </Button>
            </div>
            {!free.length && (
              <p className="mt-3 text-xs text-white/45">
                every input this browser can see is already a channel. pair another bluetooth device in your operating
                system, then press rescan.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {channels.map((c) => {
          const s = c.status;
          const meter = Math.min(100, Math.round((s?.level ?? 0) * 900));
          return (
            <div key={c.config.id} className={`${card} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {editing?.id === c.config.id ? (
                    <div className="flex gap-2">
                      <Input
                        value={editing.value}
                        autoFocus
                        onChange={(e) => setEditing({ id: c.config.id, value: e.target.value })}
                        className="h-9 rounded-lg border-white/10 bg-white/[0.05] text-sm text-white/85"
                        placeholder="the room, the person, the context"
                      />
                      <Button
                        className="h-9 rounded-lg border border-white/15 bg-white/[0.06] text-xs text-white/80"
                        onClick={async () => {
                          await renameChannel(c.config.id, editing.value);
                          setEditing(null);
                        }}
                      >
                        save
                      </Button>
                    </div>
                  ) : (
                    <button className="text-left" onClick={() => setEditing({ id: c.config.id, value: c.config.label })}>
                      <div className="truncate text-sm text-white/85">{c.config.label}</div>
                      <div className="truncate text-[11px] text-white/40">{c.config.inputLabel || "system default input"} · tap to rename</div>
                    </button>
                  )}
                </div>
                <Button
                  disabled={busy === c.config.id}
                  onClick={async () => {
                    setBusy(c.config.id);
                    try {
                      if (c.listening) await stopChannel(c.config.id);
                      else {
                        const ok = await startChannel(c.config.id);
                        if (!ok) onNote(`${c.config.label} did not start — power the device on, reconnect it, then try again.`);
                      }
                    } finally {
                      setBusy(null);
                    }
                  }}
                  className={`h-9 shrink-0 rounded-lg border px-3 text-xs ${c.listening ? "border-white/20 bg-white/[0.08] text-white/90" : "border-white/15 bg-white/[0.05] text-white/70"}`}
                >
                  {busy === c.config.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : c.listening ? <MicOff className="mr-1.5 h-3.5 w-3.5" /> : <Mic className="mr-1.5 h-3.5 w-3.5" />}
                  {c.listening ? "stop" : "start"}
                </Button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={chip}>{s?.state ?? "idle"}</span>
                {!c.inputPresent && <span className={chip}>input not connected</span>}
                {c.gapOpen && <span className={chip}>gap open</span>}
                {c.listening && <span className={chip}>{s?.speaking ? "voice" : "ambient"}</span>}
                <div className="h-1.5 min-w-[80px] flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-white/40 transition-[width] duration-150" style={{ width: `${meter}%` }} />
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-[0.16em] text-white/40">spoken language</span>
                  <select
                    value={c.config.sourceLang}
                    onChange={(e) => void setChannelLanguages(c.config.id, { sourceLang: e.target.value })}
                    className="h-9 rounded-lg border border-white/10 bg-white/[0.05] px-2 text-sm text-white/75"
                  >
                    <option value={AUTO_SOURCE}>auto-detect</option>
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="flex items-center gap-1 text-[11px] uppercase tracking-[0.16em] text-white/40">
                    <Languages className="h-3 w-3" /> render as
                  </span>
                  <select
                    value={c.config.translateTo}
                    onChange={(e) => void setChannelLanguages(c.config.id, { translateTo: e.target.value })}
                    className="h-9 rounded-lg border border-white/10 bg-white/[0.05] px-2 text-sm text-white/75"
                  >
                    <option value={NO_TRANSLATION}>no translation — keep what was said</option>
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              {!c.config.translateTo && (
                <p className="mt-2 text-[11px] text-white/35">
                  this lane has no translation target, so its turns land in whatever language was spoken.
                </p>
              )}
              {s?.message && <p className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-2 text-[11px] text-white/55">{s.message}</p>}

              {/* The ear model, stated rather than implied: what this lane is
                  doing to the signal before anything is judged or sent. */}
              {s?.pipeline && (
                <p className="mt-2 rounded-lg border border-white/[0.07] bg-white/[0.02] p-2 font-mono text-[10px] leading-relaxed text-white/40">
                  {s.pipeline}
                </p>
              )}
              {c.listening && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/40">
                  <span>gate open {Math.round((s?.gateOpen ?? 1) * 100)}% of the last half second</span>
                  <span className="text-white/25">·</span>
                  <span>{s?.modelJudging ? "on-device speech model judging turns" : "energy detector only"}</span>
                  {(s?.discardedByModel ?? 0) > 0 && (
                    <>
                      <span className="text-white/25">·</span>
                      <span>{s?.discardedByModel} turns dropped as room noise</span>
                    </>
                  )}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-[11px] text-white/35">
                  {s?.segmentsCaptured ?? 0} turns · {s?.pendingUploads ?? 0} waiting to sync
                </span>

                {channels.length > 1 && (
                  <Button
                    variant="ghost"
                    className="h-8 rounded-lg text-[11px] text-white/40"
                    onClick={async () => {
                      await removeChannel(c.config.id);
                      onNote(`${c.config.label} was removed from this device. its turns stay in the account timeline.`);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default SentinelView;

