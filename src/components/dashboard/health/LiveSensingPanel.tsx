// live-sensing panel: connects to real headphone/wearable sensors and shows only what
// they actually report. no value here is synthesised — an absent device means an absent
// read-out, never a placeholder animation.
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Bluetooth, Ear, Mic, Play, Pause, Square, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { newId, type HealthRecord, type LiveSessionRecord } from "@/lib/health/store";
import type { HealthPanelProps } from "@/lib/health/panel";
import { createDeviceRegistry, disconnectAll, type AdapterStatus, type DeviceRegistry } from "@/lib/health/live/devices";
import { analyseEegChannel, analyseEeg, analyseTremor, estimateBreathingRate, estimateNoiseDose, computeHrv, type EegChannelResult, type MotionSample, type AudioSample } from "@/lib/health/live/analysis";
import { LiveSession, type SessionMode, type SessionSnapshot } from "@/lib/health/live/session";
import type { TerritoryHighlight } from "@/lib/health/systems";
import { classifyAll, type ContactReading } from "@/lib/health/live/contact";
import { compareSessionToBaseline, type BaselineComparison } from "@/lib/health/live/baseline";
import { perModeTrend, dayOfWeekPattern, timeOfDayPattern, driftVsBaseline, type PerModeTrend, type BucketedPatternResult, type DriftResult } from "@/lib/health/live/patterns";
import { capabilityReadout, type CapabilityEntry } from "@/lib/health/live/capabilities";

const MODES: { id: SessionMode; label: string }[] = [
  { id: "focus", label: "focus" },
  { id: "rest", label: "rest" },
  { id: "meditation", label: "meditation" },
  { id: "sleep", label: "sleep" },
  { id: "open", label: "open" },
];

function stateBadge(status: AdapterStatus) {
  const tone =
    status.state === "connected"
      ? "border-emerald-400/30 text-emerald-300"
      : status.state === "denied" || status.state === "unsupported"
        ? "border-red-400/25 text-red-300"
        : "border-white/10 text-white/50";
  return (
    <Badge variant="outline" className={cn("rounded-full text-[10px] font-normal lowercase", tone)}>
      {status.state}
    </Badge>
  );
}

interface RailRowProps {
  status: AdapterStatus;
  icon: React.ReactNode;
  onConnect: () => void;
  onDisconnect: () => void;
}

function RailRow({ status, icon, onConnect, onDisconnect }: RailRowProps) {
  const connected = status.state === "connected";
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-white/40">{icon}</span>
          <span className="truncate text-xs text-white/80">{status.label}</span>
        </div>
        {stateBadge(status)}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-white/40">{status.reason}</p>
      {status.signalQuality !== null && (
        <div className="mt-2">
          <Progress value={Math.round(status.signalQuality * 100)} className="h-1" />
        </div>
      )}
      <div className="mt-2">
        {connected ? (
          <Button size="sm" variant="ghost" className="h-7 rounded-full text-[11px] text-white/60 hover:text-white" onClick={onDisconnect}>
            disconnect
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={status.state === "unsupported"}
            className="h-7 rounded-full text-[11px] text-amber-300/80 hover:text-amber-200 disabled:opacity-30"
            onClick={onConnect}
          >
            connect
          </Button>
        )}
      </div>
    </div>
  );
}

export default function LiveSensingPanel({ record, persist, onEvent, onHighlights }: HealthPanelProps) {
  const registryRef = useRef<DeviceRegistry | null>(null);
  if (!registryRef.current) registryRef.current = createDeviceRegistry();
  const registry = registryRef.current;
  const sessionRef = useRef<LiveSession>(new LiveSession());

  const [heartStatus, setHeartStatus] = useState<AdapterStatus>(registry.heart.getStatus());
  const [eegStatus, setEegStatus] = useState<AdapterStatus>(registry.eeg.getStatus());
  const [motionStatus, setMotionStatus] = useState<AdapterStatus>(registry.motion.getStatus());
  const [audioStatus, setAudioStatus] = useState<AdapterStatus>(registry.audio.getStatus());

  const [mode, setMode] = useState<SessionMode>("open");
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(sessionRef.current.getSnapshot());
  const [view, setView] = useState<"detail" | "immersive">("detail");

  const [bpm, setBpm] = useState<number | null>(null);
  const [rrAll, setRrAll] = useState<number[]>([]);
  const [eegChannels, setEegChannels] = useState<Record<string, EegChannelResult>>({});
  const [breathing, setBreathing] = useState<{ breathsPerMinute: number; confidence: number } | null>(null);
  const [noiseDbA, setNoiseDbA] = useState<number | null>(null);
  const [tremorHz, setTremorHz] = useState<number | null>(null);
  const [lastBeatAt, setLastBeatAt] = useState<number | null>(null);
  const [timeline, setTimeline] = useState<{ at: number; label: string }[]>([]);
  const [lastBaselineComparison, setLastBaselineComparison] = useState<BaselineComparison[] | null>(null);
  const [lastFinishedMode, setLastFinishedMode] = useState<SessionMode | null>(null);

  const motionBufferRef = useRef<MotionSample[]>([]);
  const audioEnvelopeRef = useRef<AudioSample[]>([]);
  const eegSampleBufferRef = useRef<Record<string, number[]>>({});

  const running = snapshot.state === "recording";

  useEffect(() => {
    const unsubs = [
      registry.heart.onStatus.subscribe(setHeartStatus),
      registry.eeg.onStatus.subscribe(setEegStatus),
      registry.motion.onStatus.subscribe(setMotionStatus),
      registry.audio.onStatus.subscribe(setAudioStatus),
      registry.heart.onHeart.subscribe((frame) => {
        setBpm(frame.bpm);
        setLastBeatAt(frame.at);
        sessionRef.current.pushHeart(frame.bpm, frame.rr);
        sessionRef.current.updateContact("heart-rate", true, registry.heart.getStatus().signalQuality);
        if (frame.rr.length) setRrAll((prev) => [...prev, ...frame.rr].slice(-400));
        setTimeline((prev) => [...prev.slice(-60), { at: frame.at, label: `heart ${frame.bpm} bpm` }]);
        setSnapshot(sessionRef.current.getSnapshot());
      }),
      registry.motion.onFrame.subscribe((frame) => {
        motionBufferRef.current = [...motionBufferRef.current, { t: frame.at, ax: frame.ax, ay: frame.ay, az: frame.az }].slice(-256);
        sessionRef.current.updateContact("motion", true, registry.motion.getStatus().signalQuality);
        const tremor = analyseTremor(motionBufferRef.current);
        if (tremor && tremor.inTremorBand) {
          setTremorHz(tremor.dominantHz);
          sessionRef.current.pushTremor(tremor.dominantHz);
        }
        setSnapshot(sessionRef.current.getSnapshot());
      }),
      registry.audio.onFrame.subscribe((frame) => {
        const rms = Math.sqrt(frame.timeDomain.reduce((a, v) => a + v * v, 0) / frame.timeDomain.length);
        audioEnvelopeRef.current = [...audioEnvelopeRef.current, { t: frame.at, rms }].slice(-300);
        sessionRef.current.updateContact("audio", true, registry.audio.getStatus().signalQuality);
        const breath = estimateBreathingRate(audioEnvelopeRef.current);
        if (breath && breath.confidence > 0.15) {
          setBreathing(breath);
          sessionRef.current.pushBreath(breath.breathsPerMinute);
        }
        setNoiseDbA(estimateNoiseDose(frame.frequencyDb).approxDbA);
        setSnapshot(sessionRef.current.getSnapshot());
      }),
      registry.eeg.onPacket.subscribe((packet) => {
        const buf = [...(eegSampleBufferRef.current[packet.channelName] ?? []), ...packet.samples].slice(-256);
        eegSampleBufferRef.current[packet.channelName] = buf;
        sessionRef.current.updateContact("eeg", true, registry.eeg.getStatus().signalQuality);
        if (buf.length >= 128) {
          const result = analyseEegChannel(packet.channelName, buf, 256);
          setEegChannels((prev) => {
            const next = { ...prev, [packet.channelName]: result };
            const summary = analyseEeg(Object.values(next));
            if (summary.states[0]) sessionRef.current.pushEegState(summary.states[0].label);
            return next;
          });
        }
        setSnapshot(sessionRef.current.getSnapshot());
      }),
    ];
    return () => {
      unsubs.forEach((u) => u());
      disconnectAll(registry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hrv = useMemo(() => (rrAll.length >= 4 ? computeHrv(rrAll) : null), [rrAll]);
  const eegSummary = useMemo(() => analyseEeg(Object.values(eegChannels)), [eegChannels]);

  useEffect(() => {
    if (!running || !onHighlights) return;
    const highlights: TerritoryHighlight[] = [];
    if (bpm !== null) highlights.push({ partIds: [], color: "#c9622f", intensity: 0.5, label: "heart", reason: `live ${bpm} bpm`, source: "live sensing" });
    if (hrv?.rmssd !== null && hrv) highlights.push({ partIds: [], color: "#4f83b3", intensity: 0.4, label: "vagus", reason: `rmssd ${hrv.rmssd} ms`, source: "live sensing" });
    if (eegSummary.states.some((s) => s.label.includes("alert"))) highlights.push({ partIds: [], color: "#b39348", intensity: 0.4, label: "brainstem", reason: "beta-dominant eeg proxy", source: "live sensing" });
    if (motionStatus.state === "connected" && tremorHz !== null) highlights.push({ partIds: [], color: "#7b7f86", intensity: 0.3, label: "jaw muscles", reason: `motion at ${tremorHz} hz`, source: "live sensing" });
    onHighlights(highlights);
  }, [running, bpm, hrv, eegSummary, tremorHz, motionStatus.state, onHighlights]);

  function startSession(): void {
    const session = sessionRef.current;
    session.beginContactCheck(mode);
    session.beginBaseline();
    session.start();
    setSnapshot(session.getSnapshot());
  }
  function pauseSession(): void {
    sessionRef.current.pause();
    setSnapshot(sessionRef.current.getSnapshot());
  }
  function resumeSession(): void {
    sessionRef.current.resume();
    setSnapshot(sessionRef.current.getSnapshot());
  }
  function endSession(): void {
    const finished: LiveSessionRecord = sessionRef.current.finaliseSession();
    const priorSessions = record.sessions;
    const next: HealthRecord = { ...record, sessions: [...priorSessions, finished] };
    persist(next);
    onEvent?.(`a ${finished.mode} live-sensing session just ended. ${finished.summary} what should i watch for next time?`);
    setLastBaselineComparison(compareSessionToBaseline(finished, priorSessions));
    setLastFinishedMode(finished.mode);
    sessionRef.current = new LiveSession();
    setSnapshot(sessionRef.current.getSnapshot());
    setRrAll([]);
    setEegChannels({});
    setBreathing(null);
    setTremorHz(null);
  }

  const previousSessions = record.sessions;

  const contactReadings: ContactReading[] = useMemo(
    () => classifyAll([heartStatus, eegStatus, motionStatus, audioStatus]),
    [heartStatus, eegStatus, motionStatus, audioStatus],
  );

  const capabilities: CapabilityEntry[] = useMemo(
    () =>
      capabilityReadout({
        heart: registry.heart.getExposure(),
        eeg: registry.eeg.getExposure(),
        motion: registry.motion.getExposure(),
        audio: registry.audio.getExposure(),
      }),
    [heartStatus, eegStatus, motionStatus, audioStatus, registry],
  );

  const PATTERN_METRICS = ["rmssd", "meanBpm", "breathsPerMinute"];
  const patternMode = lastFinishedMode ?? mode;
  const trends: PerModeTrend[] = useMemo(
    () => PATTERN_METRICS.map((m) => perModeTrend(previousSessions, patternMode, m)).filter((t): t is PerModeTrend => t !== null),
    [previousSessions, patternMode],
  );
  const dayPatterns: BucketedPatternResult[] = useMemo(
    () => PATTERN_METRICS.map((m) => dayOfWeekPattern(previousSessions, patternMode, m)),
    [previousSessions, patternMode],
  );
  const timePatterns: BucketedPatternResult[] = useMemo(
    () => PATTERN_METRICS.map((m) => timeOfDayPattern(previousSessions, patternMode, m)),
    [previousSessions, patternMode],
  );
  const drifts: DriftResult[] = useMemo(
    () => PATTERN_METRICS.map((m) => driftVsBaseline(previousSessions, patternMode, m)),
    [previousSessions, patternMode],
  );

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-1 text-white/90">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-light tracking-wide text-white/90">live sensing</h2>
          <p className="text-[11px] text-white/40">headphone and wearable devices, read directly — nothing here is simulated.</p>
        </div>
        <div className="flex gap-1 rounded-full border border-white/[0.06] bg-white/[0.03] p-0.5">
          <button
            className={cn("rounded-full px-3 py-1 text-[11px]", view === "detail" ? "bg-white/10 text-white" : "text-white/40")}
            onClick={() => setView("detail")}
          >
            detail
          </button>
          <button
            className={cn("rounded-full px-3 py-1 text-[11px]", view === "immersive" ? "bg-white/10 text-white" : "text-white/40")}
            onClick={() => setView("immersive")}
          >
            immersive
          </button>
        </div>
      </div>

      {view === "detail" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <RailRow status={heartStatus} icon={<Bluetooth size={14} />} onConnect={() => void registry.heart.connect()} onDisconnect={() => registry.heart.disconnect()} />
            <RailRow status={eegStatus} icon={<Ear size={14} />} onConnect={() => void registry.eeg.connect()} onDisconnect={() => registry.eeg.disconnect()} />
            <RailRow status={motionStatus} icon={<Activity size={14} />} onConnect={() => void registry.motion.connect()} onDisconnect={() => registry.motion.disconnect()} />
            <RailRow status={audioStatus} icon={<Mic size={14} />} onConnect={() => void registry.audio.connect()} onDisconnect={() => registry.audio.disconnect()} />
          </div>

          <ContactBadgeRow readings={contactReadings} />

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wide text-white/40">session</span>
              <Select value={mode} onValueChange={(v) => setMode(v as SessionMode)} disabled={running}>
                <SelectTrigger className="h-7 w-32 rounded-full border-white/10 bg-white/[0.03] text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs lowercase">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              {snapshot.state === "idle" || snapshot.state === "ended" ? (
                <Button size="sm" className="h-7 rounded-full bg-amber-400/20 text-[11px] text-amber-200 hover:bg-amber-400/30" onClick={startSession}>
                  <Play size={12} className="mr-1" /> start
                </Button>
              ) : snapshot.state === "paused" ? (
                <Button size="sm" variant="ghost" className="h-7 rounded-full text-[11px]" onClick={resumeSession}>
                  <Play size={12} className="mr-1" /> resume
                </Button>
              ) : (
                <Button size="sm" variant="ghost" className="h-7 rounded-full text-[11px]" onClick={pauseSession}>
                  <Pause size={12} className="mr-1" /> pause
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 rounded-full text-[11px] text-white/50" onClick={endSession} disabled={snapshot.state === "idle"}>
                <Square size={12} className="mr-1" /> end
              </Button>
              <span className="ml-auto self-center text-[11px] text-white/40">{snapshot.state}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <Metric label="heart rate" value={bpm !== null ? `${bpm} bpm` : null} source="ble heart rate" confidence={heartStatus.signalQuality} />
            <Metric label="rmssd" value={hrv?.rmssd !== null && hrv ? `${hrv.rmssd} ms` : null} source="rr intervals" confidence={hrv?.confidence ?? null} />
            <Metric label="breathing" value={breathing ? `${breathing.breathsPerMinute}/min` : null} source="microphone envelope" confidence={breathing?.confidence ?? null} />
            <Metric label="ambient noise" value={noiseDbA !== null ? `~${noiseDbA} dba` : null} source="uncalibrated mic estimate" confidence={audioStatus.signalQuality} />
            <Metric label="tremor" value={tremorHz !== null ? `${tremorHz} hz` : null} source="device motion" confidence={motionStatus.signalQuality} />
            <Metric label="eeg state" value={eegSummary.states[0]?.confidence ? eegSummary.states[0].label : null} source="eeg band ratio" confidence={eegSummary.states[0]?.confidence ?? null} />
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
            <span className="text-[11px] uppercase tracking-wide text-white/40">timeline</span>
            <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
              {timeline.length === 0 && <span className="text-[11px] text-white/30">no live events yet.</span>}
              {timeline.map((e, i) => (
                <span key={i} className="whitespace-nowrap rounded-full border border-white/[0.06] px-2 py-0.5 text-[10px] text-white/50">
                  {e.label}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
            <span className="text-[11px] uppercase tracking-wide text-white/40">session history</span>
            {previousSessions.length === 0 ? (
              <p className="mt-1 text-[11px] text-white/40">no sessions recorded yet.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {previousSessions
                  .slice(-6)
                  .reverse()
                  .map((s) => (
                    <li key={s.id} className="rounded-xl border border-white/[0.05] p-2 text-[11px] text-white/60">
                      <div className="flex justify-between">
                        <span>{s.mode}</span>
                        <span className="text-white/30">{new Date(s.startedAt).toLocaleString()}</span>
                      </div>
                      <p className="mt-1 text-white/40">{s.summary}</p>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <BaselineComparisonCard comparisons={lastBaselineComparison} mode={lastFinishedMode} />

          <PatternSummaryCard mode={patternMode} trends={trends} dayPatterns={dayPatterns} timePatterns={timePatterns} drifts={drifts} />

          <CapabilityReadoutCard entries={capabilities} anyConnected={heartStatus.state === "connected" || eegStatus.state === "connected" || motionStatus.state === "connected" || audioStatus.state === "connected"} />
        </>
      ) : (
        <ImmersiveView
          bpm={bpm}
          lastBeatAt={lastBeatAt}
          breathing={breathing}
          eegSummary={eegSummary}
          hrv={hrv}
          heartConnected={heartStatus.state === "connected"}
          eegConnected={eegStatus.state === "connected"}
          audioConnected={audioStatus.state === "connected"}
        />
      )}

      <p className="mt-auto text-[10px] leading-snug text-white/30">
        these read-outs are probabilistic proxies drawn from real sensor data, not a diagnosis. eeg states, hrv balance and sleep staging are labelled
        confidence and are not clinical measurements. this device's data stays on this device.
      </p>
    </div>
  );
}

function Metric({ label, value, source, confidence }: { label: string; value: string | null; source: string; confidence: number | null }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-2.5">
      <div className="text-white/40">{label}</div>
      {value ? (
        <>
          <div className="mt-0.5 text-sm font-light text-white/90">{value}</div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-white/30">
            <span>{source}</span>
            {confidence !== null && <span>{Math.round(confidence * 100)}%</span>}
          </div>
        </>
      ) : (
        <div className="mt-0.5 text-[11px] text-white/25">no device</div>
      )}
    </div>
  );
}

interface ImmersiveProps {
  bpm: number | null;
  lastBeatAt: number | null;
  breathing: { breathsPerMinute: number; confidence: number } | null;
  eegSummary: ReturnType<typeof analyseEeg>;
  hrv: ReturnType<typeof computeHrv> | null;
  heartConnected: boolean;
  eegConnected: boolean;
  audioConnected: boolean;
}

function ImmersiveView({ bpm, lastBeatAt, breathing, eegSummary, hrv, heartConnected, eegConnected, audioConnected }: ImmersiveProps) {
  const [pulsePhase, setPulsePhase] = useState(0);
  useEffect(() => {
    if (!lastBeatAt) return;
    setPulsePhase(1);
    const id = window.setTimeout(() => setPulsePhase(0), 250);
    return () => window.clearTimeout(id);
  }, [lastBeatAt]);

  const bands = eegSummary.channels.length
    ? (["delta", "theta", "alpha", "beta", "gamma"] as const).map((band) => ({
        band,
        value: eegSummary.channels.reduce((a, c) => a + c.bandPower[band], 0) / eegSummary.channels.length,
      }))
    : [];
  const maxBand = Math.max(0.001, ...bands.map((b) => b.value));
  const lfHf = hrv?.lfHfRatio ?? null;

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-8 rounded-2xl border border-white/[0.06] bg-black/40 p-6">
      <div className="flex items-center gap-10">
        {heartConnected && bpm !== null ? (
          <div className="relative flex h-28 w-28 items-center justify-center rounded-full border border-amber-400/20">
            <div
              className="absolute inset-0 rounded-full bg-amber-400/10 transition-transform duration-200"
              style={{ transform: `scale(${1 + pulsePhase * 0.25})` }}
            />
            <span className="relative text-lg font-light text-amber-200/90">{bpm}</span>
          </div>
        ) : (
          <div className="flex h-28 w-28 items-center justify-center rounded-full border border-white/[0.06] text-[11px] text-white/25">no device</div>
        )}

        {audioConnected && breathing ? (
          <div
            className="flex h-28 w-28 items-center justify-center rounded-full border border-sky-300/20 transition-all"
            style={{ animation: `pulse ${Math.max(2, 60 / breathing.breathsPerMinute)}s ease-in-out infinite` }}
          >
            <span className="text-[11px] text-sky-200/80">{breathing.breathsPerMinute}/min</span>
          </div>
        ) : (
          <div className="flex h-28 w-28 items-center justify-center rounded-full border border-white/[0.06] text-[11px] text-white/25">no breath signal</div>
        )}
      </div>

      {eegConnected && bands.length > 0 ? (
        <div className="flex items-end gap-2">
          {bands.map((b) => (
            <div key={b.band} className="flex flex-col items-center gap-1">
              <div className="w-4 rounded-t bg-amber-300/40" style={{ height: `${8 + (b.value / maxBand) * 60}px` }} />
              <span className="text-[9px] text-white/30">{b.band}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-1 text-[11px] text-white/25">
          <Waves size={12} /> no eeg device
        </div>
      )}

      <div className="w-full max-w-xs">
        <div className="mb-1 flex justify-between text-[10px] text-white/30">
          <span>parasympathetic</span>
          <span>sympathetic</span>
        </div>
        {lfHf !== null ? (
          <div className="relative h-2 rounded-full bg-white/[0.06]">
            <div
              className="absolute top-0 h-2 rounded-full bg-amber-300/50"
              style={{ left: "50%", width: `${Math.min(50, Math.abs(Math.log2(lfHf)) * 15)}%`, transform: lfHf < 1 ? "translateX(-100%)" : undefined }}
            />
          </div>
        ) : (
          <div className="h-2 rounded-full bg-white/[0.04]" />
        )}
        {lfHf === null && <p className="mt-1 text-[10px] text-white/25">not enough beats captured for autonomic balance.</p>}
      </div>
    </div>
  );
}

function contactTone(quality: ContactReading["quality"]): string {
  if (quality === "good-contact") return "border-emerald-400/30 text-emerald-300";
  if (quality === "poor-contact") return "border-amber-400/25 text-amber-300";
  return "border-white/10 text-white/40";
}

function ContactBadgeRow({ readings }: { readings: ContactReading[] }) {
  const known = readings.filter((r) => r.quality !== "no-device");
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
      <span className="text-[11px] uppercase tracking-wide text-white/40">contact quality</span>
      {known.length === 0 ? (
        <p className="mt-1 text-[11px] text-white/40">no device is connected — contact quality is not available.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {readings.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-full border border-white/[0.06] px-2.5 py-1">
              <Badge variant="outline" className={cn("rounded-full text-[10px] font-normal lowercase", contactTone(r.quality))}>
                {r.quality}
              </Badge>
              <span className="text-[10px] text-white/40">{r.label}</span>
            </div>
          ))}
        </div>
      )}
      <ul className="mt-2 space-y-1">
        {readings.map((r) => (
          <li key={r.id} className="text-[10px] text-white/30">
            {r.label}: {r.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}

function baselineTone(status: BaselineComparison["status"]): string {
  if (status === "above-baseline") return "text-amber-300";
  if (status === "below-baseline") return "text-sky-300";
  if (status === "within-baseline") return "text-emerald-300";
  return "text-white/40";
}

function BaselineComparisonCard({ comparisons, mode }: { comparisons: BaselineComparison[] | null; mode: SessionMode | null }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
      <span className="text-[11px] uppercase tracking-wide text-white/40">pre/post session baseline{mode ? ` — ${mode}` : ""}</span>
      {comparisons === null ? (
        <p className="mt-1 text-[11px] text-white/40">end a session to compare it against this person's own baseline.</p>
      ) : comparisons.length === 0 ? (
        <p className="mt-1 text-[11px] text-white/40">that session did not record any metric that can be compared to a baseline.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {comparisons.map((c) => (
            <li key={c.metric} className="rounded-xl border border-white/[0.05] p-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-white/70">{c.metric}</span>
                <span className={baselineTone(c.status)}>{c.status}</span>
              </div>
              <p className="mt-1 text-white/40">{c.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PatternSummaryCard({
  mode,
  trends,
  dayPatterns,
  timePatterns,
  drifts,
}: {
  mode: SessionMode;
  trends: PerModeTrend[];
  dayPatterns: BucketedPatternResult[];
  timePatterns: BucketedPatternResult[];
  drifts: DriftResult[];
}) {
  const anySufficientTrend = trends.some((t) => t.direction !== "insufficient-data");
  const anySufficientBucket = [...dayPatterns, ...timePatterns].some((p) => p.sufficient);
  const anySufficientDrift = drifts.some((d) => d.sufficient);
  const nothingYet = !anySufficientTrend && !anySufficientBucket && !anySufficientDrift;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
      <span className="text-[11px] uppercase tracking-wide text-white/40">longitudinal patterns — {mode}</span>
      {nothingYet ? (
        <p className="mt-1 text-[11px] text-white/40">not enough saved {mode} sessions yet to claim a pattern.</p>
      ) : (
        <div className="mt-2 space-y-3">
          {trends.filter((t) => t.direction !== "insufficient-data").length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-wide text-white/30">trend</span>
              <ul className="mt-1 space-y-1">
                {trends
                  .filter((t) => t.direction !== "insufficient-data")
                  .map((t) => (
                    <li key={t.metric} className="text-[11px] text-white/50">
                      {t.detail}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {drifts.filter((d) => d.sufficient).length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-wide text-white/30">drift vs baseline</span>
              <ul className="mt-1 space-y-1">
                {drifts
                  .filter((d) => d.sufficient)
                  .map((d) => (
                    <li key={d.metric} className="text-[11px] text-white/50">
                      {d.detail}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {[...dayPatterns, ...timePatterns].filter((p) => p.sufficient).length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-wide text-white/30">time patterns</span>
              <ul className="mt-1 space-y-1">
                {[...dayPatterns, ...timePatterns]
                  .filter((p) => p.sufficient)
                  .map((p) => (
                    <li key={`${p.kind}-${p.metric}`} className="text-[11px] text-white/50">
                      {p.detail}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CapabilityReadoutCard({ entries, anyConnected }: { entries: CapabilityEntry[]; anyConnected: boolean }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
      <span className="text-[11px] uppercase tracking-wide text-white/40">connected device capabilities</span>
      {!anyConnected ? (
        <p className="mt-1 text-[11px] text-white/40">no device is connected — capabilities are not available.</p>
      ) : entries.length === 0 ? (
        <p className="mt-1 text-[11px] text-white/40">connected, but nothing has reported a capability yet.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className={e.exposed ? "text-white/70" : "text-white/30"}>{e.label}</span>
              <span className={e.exposed ? "text-emerald-300" : "text-white/25"}>{e.exposed ? "available" : "not exposed"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
