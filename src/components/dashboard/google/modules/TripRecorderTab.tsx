/**
 * TRIP RECORDER — live control and the ride's own record.
 *
 * The UI states are deliberate: idle offers the arm action, recording shows
 * what is being captured *and* what is not (pending upload, stalled sensor,
 * coverage gaps), and an analysed trip is presented with its caveats attached
 * to the findings rather than buried. A rider who reads "speeding on Main St"
 * must be able to see, in the same view, whether a posted limit was actually
 * on record — otherwise the app is manufacturing an accusation.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tripRecorder, type RecorderState } from "@/lib/rideshare/tripRecorder";
import { autoTrip, type AutoTripState } from "@/lib/rideshare/autoTrip";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Route, Square, Circle, Loader2, Trash2, Download, RefreshCw,
  AlertTriangle, Gauge, Clock, MapPin, Activity, WifiOff, Radar,
} from "lucide-react";

interface StreetLeg {
  name: string; seconds: number; metres: number;
  maxSpeedMps: number; avgSpeedMps: number;
  limitMps: number | null; limitLabel: string | null;
  overLimitS: number; peakOverMps: number; samples: number;
}
interface TripEvent {
  kind: string; at: string; endedAt?: string; durationS?: number;
  street?: string | null; detail: string; confidence: number;
  metrics: Record<string, unknown>;
}
interface Trip {
  id: string; platform: string; label: string | null; status: string;
  started_at: string; ended_at: string | null;
  duration_s: number | null; distance_m: number | null;
  max_speed_mps: number | null; avg_speed_mps: number | null;
  moving_s: number | null; stopped_s: number | null; coverage_gap_s: number | null;
  point_count: number;
  streets: StreetLeg[]; events: TripEvent[];
  analysis: {
    summary?: string;
    quality?: { coverage: number; medianAccuracyM: number | null; medianIntervalS: number | null; caveats: string[] };
    roadData?: { source: string; limitsKnownStreets: number; limitsMissingStreets: number; matchedSamples: number; unmatchedSamples: number };
  } | null;
}

const MPH = 2.236936;
const mph = (mps: number | null | undefined) =>
  mps == null ? "—" : `${(mps * MPH).toFixed(0)} mph`;
const miles = (m: number | null | undefined) =>
  m == null ? "—" : `${(m / 1609.344).toFixed(2)} mi`;
const dur = (s: number | null | undefined) => {
  if (s == null) return "—";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${sec}s` : `${sec}s`;
};

const EVENT_LABEL: Record<string, string> = {
  speeding: "Above posted limit",
  harsh_brake: "Harsh braking",
  harsh_accel: "Harsh acceleration",
  swerve: "Lateral out-and-back",
  stop: "Stationary",
  coverage_gap: "No signal",
};

export default function TripRecorderTab() {
  const [rec, setRec] = useState<RecorderState>(tripRecorder.getState());
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => tripRecorder.subscribe(setRec), []);

  const [auto, setAuto] = useState<AutoTripState>(autoTrip.getState());
  useEffect(() => autoTrip.subscribe(setAuto), []);

  const toggleAuto = async (on: boolean) => {
    await autoTrip.setEnabled(on);
    if (on && autoTrip.getState().phase === "no-permission") {
      const ok = await autoTrip.requestPermission();
      if (!ok) toast.error("Location permission is required for automatic capture.");
    }
  };

  const load = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("rideshare-guardian", {
      body: { action: "trip.list" },
    });
    if (!mounted.current) return;
    if (error) toast.error("Could not load recorded trips.");
    else setTrips((data?.trips ?? []) as Trip[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      // A reload mid-ride must resume, not orphan the recording.
      const resumed = await tripRecorder.restore();
      if (resumed) toast.info("Resumed the trip that was already recording on this device.");
      await load();
    })();
  }, [load]);

  const start = async () => {
    setBusy("start");
    await tripRecorder.start({ label: label.trim() || undefined });
    setBusy(null);
    if (tripRecorder.getState().status === "recording") toast.success("Recording. Keep this tab open.");
  };

  const stop = async () => {
    setBusy("stop");
    const id = await tripRecorder.stop(true);
    setBusy(null);
    setLabel("");
    await load();
    if (id) { setOpen(id); toast.success("Trip closed and analysed."); }
  };

  const reanalyse = async (id: string) => {
    setBusy(id);
    const { error } = await supabase.functions.invoke("rideshare-guardian", {
      body: { action: "trip.analyze", trip_id: id },
    });
    setBusy(null);
    if (error) toast.error("Analysis failed. The raw trace is still stored.");
    else { toast.success("Re-analysed against current road data."); await load(); }
  };

  const remove = async (id: string) => {
    setBusy(id);
    await supabase.functions.invoke("rideshare-guardian", { body: { action: "trip.delete", trip_id: id } });
    setBusy(null);
    setTrips((t) => t.filter((x) => x.id !== id));
  };

  const exportGpx = async (t: Trip) => {
    setBusy(t.id);
    const { data, error } = await supabase.functions.invoke("rideshare-guardian", {
      body: { action: "trip.track", trip_id: t.id, format: "gpx" },
    });
    setBusy(null);
    if (error) { toast.error("Export failed."); return; }
    const text = typeof data === "string" ? data : new TextDecoder().decode(data as ArrayBuffer);
    const url = URL.createObjectURL(new Blob([text], { type: "application/gpx+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `asherin-trip-${t.started_at.slice(0, 19).replace(/[:T]/g, "-")}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const elapsed = useTicker(rec.status === "recording");
  const liveSeconds = rec.startedAt ? Math.round((elapsed - rec.startedAt) / 1000) : 0;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 px-5 py-4">
        {/* ── LIVE RECORDER ─────────────────────────────────────────────── */}
        <section className="rounded-lg border border-border/25 bg-card/20 p-4">
          <h3 className="mb-1 text-xs font-light uppercase tracking-[0.18em] text-foreground">
            Ride recorder
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Records your own position trace for the length of the ride, then reconstructs
            the streets taken, the time on each, the speed against posted limits, and any
            harsh braking or out-and-back movement. This is your record — it is not
            supplied by, and does not depend on, the rideshare operator.
          </p>

          {/* ── AUTOMATIC CAPTURE ───────────────────────────────────────── */}
          <div className="mb-4 rounded border border-border/25 bg-muted/10 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Radar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <span className="text-xs font-light uppercase tracking-[0.16em] text-foreground">
                    Automatic capture
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Recording arms itself when the phone sustains vehicle speed for 45 seconds and
                  covers 350 m, and closes after five minutes stationary. You never have to press
                  anything. A trip you start by hand is never closed automatically.
                </p>
                <p className="mt-1.5 text-[11px] text-muted-foreground" aria-live="polite">
                  {auto.note}
                  {auto.lastSpeedMps != null && auto.phase !== "off" && (
                    <span className="ml-1 opacity-70">· {mph(auto.lastSpeedMps)}</span>
                  )}
                </p>
                {auto.phase === "no-permission" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 text-[11px]"
                    onClick={() => void autoTrip.requestPermission()}
                  >
                    Grant location access
                  </Button>
                )}
              </div>
              <Switch
                checked={auto.enabled}
                onCheckedChange={(v) => void toggleAuto(v)}
                aria-label="Automatic trip capture"
              />
            </div>
          </div>

          {rec.status !== "recording" && rec.status !== "stopping" ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <Label htmlFor="trip-label" className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Label (optional)
                </Label>
                <Input
                  id="trip-label"
                  placeholder="Airport run, night shift home…"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={120}
                />
              </div>
              <Button onClick={start} disabled={busy === "start"}>
                {busy === "start"
                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  : <Circle className="mr-1.5 h-3.5 w-3.5 fill-current" />}
                Start recording
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat icon={Clock} label="Elapsed" value={dur(liveSeconds)} />
                <Stat icon={Route} label="Distance" value={miles(rec.liveDistanceM)} />
                <Stat icon={Gauge} label="Peak" value={mph(rec.liveMaxMps)} />
                <Stat icon={Activity} label="Fixes" value={String(rec.fixes)} />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span
                  className="inline-flex items-center gap-1.5"
                  aria-live="polite"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-foreground/40 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-foreground/80" />
                  </span>
                  Recording
                </span>
                {rec.pendingUpload > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <WifiOff className="h-3 w-3" />
                    {rec.pendingUpload} fix{rec.pendingUpload === 1 ? "" : "es"} held on this device
                  </span>
                )}
                {rec.lastFix?.accuracy_m != null && (
                  <span>±{Math.round(rec.lastFix.accuracy_m)} m</span>
                )}
              </div>

              {rec.stalled && (
                <p className="flex items-start gap-2 rounded border border-border/30 bg-muted/20 px-3 py-2 text-xs text-muted-foreground" role="status">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  No new fix for a while. This stretch will be recorded as a coverage gap —
                  nothing will be claimed about it either way.
                </p>
              )}
              {rec.error && (
                <p className="text-xs text-muted-foreground" role="status">{rec.error}</p>
              )}

              <Button variant="outline" onClick={stop} disabled={busy === "stop"}>
                {busy === "stop"
                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  : <Square className="mr-1.5 h-3.5 w-3.5" />}
                End trip and analyse
              </Button>
            </div>
          )}

          {rec.status === "error" && rec.error && (
            <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground" role="alert">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {rec.error}
            </p>
          )}
        </section>

        {/* ── HISTORY ───────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-light uppercase tracking-[0.18em] text-foreground">
              Recorded trips
            </h3>
            <Button size="sm" variant="ghost" onClick={() => void load()} aria-label="Refresh trips">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : trips.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/30 px-4 py-6 text-center text-xs text-muted-foreground">
              No trips recorded yet. Start the recorder when you get in the car;
              end it when you are dropped off.
            </p>
          ) : (
            trips.map((t) => (
              <TripCard
                key={t.id}
                trip={t}
                expanded={open === t.id}
                busy={busy === t.id}
                onToggle={() => setOpen(open === t.id ? null : t.id)}
                onReanalyse={() => void reanalyse(t.id)}
                onExport={() => void exportGpx(t)}
                onDelete={() => void remove(t.id)}
              />
            ))
          )}
        </section>
      </div>
    </ScrollArea>
  );
}

// ── pieces ──────────────────────────────────────────────────────────────────

function useTicker(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function Stat({ icon: Icon, label, value }: {
  icon: typeof Clock; label: string; value: string;
}) {
  return (
    <div className="rounded border border-border/25 bg-background/30 px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />{label}
      </p>
      <p className="font-mono text-sm text-foreground">{value}</p>
    </div>
  );
}

function TripCard({ trip, expanded, busy, onToggle, onReanalyse, onExport, onDelete }: {
  trip: Trip; expanded: boolean; busy: boolean;
  onToggle: () => void; onReanalyse: () => void; onExport: () => void; onDelete: () => void;
}) {
  const events = trip.events ?? [];
  const streets = trip.streets ?? [];
  const caveats = trip.analysis?.quality?.caveats ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [events]);

  return (
    <article className="rounded-lg border border-border/25 bg-card/20">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground">
            {trip.label || `${trip.platform} ride`}
            <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {trip.status}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {new Date(trip.started_at).toLocaleString()} · {miles(trip.distance_m)} ·{" "}
            {dur(trip.duration_s)} · peak {mph(trip.max_speed_mps)}
          </p>
          {trip.analysis?.summary && (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{trip.analysis.summary}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {Object.entries(counts).map(([k, n]) => (
            <span key={k} className="rounded border border-border/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {n}× {EVENT_LABEL[k] ?? k}
            </span>
          ))}
        </div>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-border/20 px-4 py-4">
          {caveats.length > 0 && (
            <div className="rounded border border-border/30 bg-muted/10 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <AlertTriangle className="h-3 w-3" /> What this record cannot tell you
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {caveats.map((c, i) => <li key={i}>· {c}</li>)}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat icon={Clock} label="Moving" value={dur(trip.moving_s)} />
            <Stat icon={Square} label="Stopped" value={dur(trip.stopped_s)} />
            <Stat icon={WifiOff} label="No signal" value={dur(trip.coverage_gap_s)} />
            <Stat icon={Gauge} label="Average" value={mph(trip.avg_speed_mps)} />
          </div>

          {streets.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <MapPin className="h-3 w-3" /> Streets taken, longest first
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="py-1 pr-3 font-normal">Street</th>
                      <th className="py-1 pr-3 font-normal">Time</th>
                      <th className="py-1 pr-3 font-normal">Distance</th>
                      <th className="py-1 pr-3 font-normal">Peak</th>
                      <th className="py-1 pr-3 font-normal">Limit</th>
                      <th className="py-1 font-normal">Over</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    {streets.slice(0, 40).map((s, i) => (
                      <tr key={`${s.name}-${i}`} className="border-t border-border/15">
                        <td className="py-1 pr-3 text-foreground">{s.name}</td>
                        <td className="py-1 pr-3 font-mono">{dur(s.seconds)}</td>
                        <td className="py-1 pr-3 font-mono">{miles(s.metres)}</td>
                        <td className="py-1 pr-3 font-mono">{mph(s.maxSpeedMps)}</td>
                        <td className="py-1 pr-3 font-mono">{s.limitLabel ?? "not on record"}</td>
                        <td className="py-1 font-mono">
                          {s.limitMps == null ? "—" : s.overLimitS > 0 ? `${dur(s.overLimitS)}` : "no"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {events.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                Events, in order
              </p>
              <ul className="space-y-1.5">
                {events.slice(0, 60).map((e, i) => (
                  <li key={i} className="rounded border border-border/20 px-2.5 py-1.5 text-xs">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-foreground">{EVENT_LABEL[e.kind] ?? e.kind}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {new Date(e.at).toLocaleTimeString()}
                        {e.street ? ` · ${e.street}` : ""}
                      </span>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        confidence {(e.confidence * 100).toFixed(0)}%
                        {e.confidence < 0.5 ? " · indicative" : ""}
                      </span>
                    </div>
                    <p className="mt-0.5 text-muted-foreground">{e.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onReanalyse} disabled={busy}>
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              Re-analyse
            </Button>
            <Button size="sm" variant="outline" onClick={onExport} disabled={busy}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export GPX
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete} disabled={busy}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
            </Button>
          </div>

          <p className="text-[10px] leading-relaxed text-muted-foreground/70">
            Speed limits come from OpenStreetMap and can be missing or out of date; where no
            limit is on record this report states the speed and makes no claim about it.
            Harsh-event thresholds follow the usual telematics convention of 0.3 g.
          </p>
        </div>
      )}
    </article>
  );
}
