import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithByokRetry } from "@/lib/byokInvoke";
import { enablePush, disablePush, readPushStatus, type PushStatus } from "@/lib/guardianPush";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Car, MessageSquare, ShieldAlert, Loader2, Trash2, Download, RefreshCw, Route, Plane } from "lucide-react";
import TripRecorderTab from "./TripRecorderTab";
import TransitTab from "./TransitTab";

/**
 * GUARDIAN — rideshare driver assessment and phone-message analysis.
 *
 * The interface is deliberately unhurried in language and immediate in action:
 * a rider reading this may be standing at a curb with a car pulling up.
 */

type Verdict = "CLEAR" | "THIN" | "WATCH" | "AVOID";

const VERDICT_STYLE: Record<Verdict, string> = {
  CLEAR: "border-foreground/25 bg-foreground/[0.04] text-foreground/80",
  THIN: "border-border/40 bg-muted/20 text-muted-foreground",
  WATCH: "border-foreground/50 bg-foreground/[0.09] text-foreground",
  AVOID: "border-foreground bg-foreground text-background",
};

interface Report {
  id: string;
  phase: "fast" | "deep";
  verdict: Verdict;
  confidence: number;
  headline: string | null;
  payload: Record<string, any>;
  delivered_channels: string[];
  created_at: string;
}

interface Ride {
  id: string;
  platform: string;
  driver_name: string | null;
  plate: string | null;
  vehicle: string | null;
  city: string | null;
  pickup_label: string | null;
  status: string;
  verdict: Verdict | null;
  confidence: number | null;
  created_at: string;
  rideshare_reports: Report[];
}

interface MessageSource {
  id: string;
  channel: string;
  counterparty: string | null;
  parsed: Record<string, any>;
  report: string | null;
  created_at: string;
}

/** Resolve the caller's own AI key when they have one; the server falls back safely otherwise. */
async function resolveByok(): Promise<Record<string, string> | undefined> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return undefined;
    const { data: pref } = await supabase
      .from("user_model_preferences" as any)
      .select("active_provider, active_model")
      .eq("user_id", user.id)
      .maybeSingle();
    const provider = (pref as any)?.active_provider;
    const model = (pref as any)?.active_model;
    if (!provider || provider === "default" || !model || model === "default") return undefined;
    const { data: keyRow } = await supabase
      .from("user_api_keys" as any)
      .select("api_key")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .eq("is_active", true)
      .maybeSingle();
    const apiKey = (keyRow as any)?.api_key;
    return apiKey ? { provider, model, apiKey } : undefined;
  } catch {
    return undefined;
  }
}

const VerdictChip = ({ verdict }: { verdict: Verdict | null }) => (
  <span
    className={`inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.22em] ${
      verdict ? VERDICT_STYLE[verdict] : "border-border/40 text-muted-foreground"
    }`}
  >
    {verdict ?? "pending"}
  </span>
);

const RideshareGuardian = () => {
  const [rides, setRides] = useState<Ride[]>([]);
  const [sources, setSources] = useState<MessageSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [sweeping, setSweeping] = useState<string | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [push, setPush] = useState<PushStatus>({ state: "prompt" });
  const [scanning, setScanning] = useState(false);
  const [settings, setSettings] = useState({
    alert_threshold: "WATCH" as Verdict,
    push_enabled: true,
    email_enabled: true,
    auto_from_email: true,
    autopilot_enabled: false,
    lookback_hours: 24,
    last_scan_at: null as string | null,
    last_scan_status: null as string | null,
    last_scan_detail: null as string | null,
  });


  const [form, setForm] = useState({
    trip_url: "", driver_name: "", plate: "", vehicle: "", city: "", pickup_label: "",
  });
  const [thread, setThread] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [r, m, s] = await Promise.all([
        supabase.functions.invoke("rideshare-guardian", { body: { action: "ride.list" } }),
        supabase.functions.invoke("rideshare-guardian", { body: { action: "message.list" } }),
        supabase.functions.invoke("rideshare-guardian", { body: { action: "settings.get" } }),
      ]);
      if (r.error) throw r.error;
      setRides((r.data?.rides || []) as Ride[]);
      setSources((m.data?.sources || []) as MessageSource[]);
      if (s.data?.settings) setSettings(s.data.settings);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Guardian could not be reached.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void readPushStatus().then(setPush);
  }, [load]);

  const runSweep = useCallback(async (rideId: string) => {
    setSweeping(rideId);
    try {
      const byok = await resolveByok();
      await invokeWithByokRetry("rideshare-guardian", {
        body: { action: "ride.sweep", ride_id: rideId, ...(byok ? { byok } : {}) },
        tool: "asherin-sentinel",
      });
      toast.success("Deep assessment complete");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Deep assessment failed");
    } finally {
      setSweeping(null);
    }
  }, [load]);

  const capture = async () => {
    if (!form.trip_url && !form.driver_name && !form.plate) {
      toast.error("Add a trip link, a driver name, or a plate.");
      return;
    }
    setCapturing(true);
    try {
      const { data, error } = await supabase.functions.invoke("rideshare-guardian", {
        body: { action: "ride.capture", platform: "uber", ...form },
      });
      if (error) throw error;
      if (data?.link_note) toast.message(data.link_note);
      toast.success("Ride card captured — running deep check");
      setForm({ trip_url: "", driver_name: "", plate: "", vehicle: "", city: "", pickup_label: "" });
      await load();
      if (data?.ride?.id) void runSweep(data.ride.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Capture failed");
    } finally {
      setCapturing(false);
    }
  };

  const analyseThread = async () => {
    if (thread.trim().length < 20) {
      toast.error("Paste more of the conversation — at least a few messages.");
      return;
    }
    setAnalysing(true);
    try {
      const byok = await resolveByok();
      await invokeWithByokRetry("rideshare-guardian", {
        body: { action: "message.ingest", raw: thread, channel: "sms_paste", ...(byok ? { byok } : {}) },
        tool: "asherin-sentinel",
      });
      toast.success("Thread analysed");
      setThread("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalysing(false);
    }
  };

  const saveSettings = async (next: typeof settings) => {
    setSettings(next);
    await supabase.functions.invoke("rideshare-guardian", { body: { action: "settings.set", settings: next } });
  };

  /** Manual trigger for the same sweeper the scheduler runs — scoped by the
   *  server to the caller's own mailbox. */
  const runScanNow = async () => {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("rideshare-autopilot", { body: {} });
      if (error) throw error;
      const r = (data?.results?.[0] ?? {}) as { found?: number; swept?: number; status?: string };
      toast.success(
        r.swept ? `${r.swept} ride${r.swept === 1 ? "" : "s"} assessed` : "Mailbox read",
        {
          description: r.swept
            ? "The dossier is in your inbox and on your device."
            : r.status === "no_rides"
              ? "No Uber or Lyft trip mail in the window."
              : `Scan finished (${r.status ?? "ok"}).`,
        },
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The mailbox could not be read.");

    } finally {
      setScanning(false);
    }
  };


  const removeRide = async (id: string) => {
    setRides((prev) => prev.filter((r) => r.id !== id));
    await supabase.functions.invoke("rideshare-guardian", { body: { action: "ride.delete", ride_id: id } });
  };

  const downloadReport = (ride: Ride) => {
    const deep = ride.rideshare_reports?.find((r) => r.phase === "deep");
    const p = deep?.payload || {};
    const lines = [
      "ASHERIN · RIDESHARE GUARDIAN",
      "RESTRICTED · RIDER EYES ONLY",
      "",
      `VERDICT: ${deep?.verdict || ride.verdict || "PENDING"}`,
      `IDENTITY CONFIDENCE: ${Math.round((deep?.confidence || 0) * 100)}%`,
      `GENERATED: ${new Date(deep?.created_at || ride.created_at).toUTCString()}`,
      "",
      "RIDE CARD",
      `  Platform ......... ${ride.platform}`,
      `  Driver ........... ${ride.driver_name || "not captured"}`,
      `  Plate ............ ${ride.plate || "not captured"}`,
      `  Vehicle .......... ${ride.vehicle || "not captured"}`,
      `  City ............. ${ride.city || "not captured"}`,
      "",
      "ASSESSMENT",
      `  ${p.narrative || deep?.headline || "No deep assessment recorded."}`,
      "",
      "ACTION",
      `  ${p.recommended_action || "Verify the plate and driver photo against the app before boarding."}`,
      "",
      "LIMITS",
      `  ${p.limits || "Open sources only. Absence of record is not a clearance."}`,
      "",
      "#houseofasher",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `guardian-${(ride.driver_name || "driver").replace(/\W+/g, "-").toLowerCase()}-${ride.id.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/20 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-extralight uppercase tracking-[0.2em] text-foreground">Guardian</h2>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
              Driver assessment · Message forensics
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
            Alerts: {push.state === "enabled" ? "device armed" : push.state}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => setPush(push.state === "enabled" ? await disablePush() : await enablePush())}
          >
            {push.state === "enabled" ? "Disarm device" : "Arm device"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void load()} aria-label="Refresh Guardian">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {push.reason && push.state !== "enabled" && (
        <p className="border-b border-border/20 px-5 py-2 text-xs text-muted-foreground" role="status">
          {push.reason} Email alerts still work.
        </p>
      )}

      <Tabs defaultValue="rides" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="mx-5 mt-3 w-fit">
          <TabsTrigger value="rides"><Car className="mr-1.5 h-3.5 w-3.5" />Rides</TabsTrigger>
          <TabsTrigger value="transit"><Plane className="mr-1.5 h-3.5 w-3.5" />Transit</TabsTrigger>
          <TabsTrigger value="recorder"><Route className="mr-1.5 h-3.5 w-3.5" />Trip recorder</TabsTrigger>
          <TabsTrigger value="messages"><MessageSquare className="mr-1.5 h-3.5 w-3.5" />Phone messages</TabsTrigger>
          <TabsTrigger value="settings">Alerting</TabsTrigger>
        </TabsList>

        {/* ── TRANSIT (air · rail · coach · ferry · rotor) ───────────────── */}
        <TabsContent value="transit" className="flex-1 overflow-hidden">
          <TransitTab />
        </TabsContent>

        {/* ── TRIP RECORDER ─────────────────────────────────────────────── */}
        <TabsContent value="recorder" className="flex-1 overflow-hidden">
          <TripRecorderTab />
        </TabsContent>


        {/* ── RIDES ─────────────────────────────────────────────────────── */}
        <TabsContent value="rides" className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="space-y-5 px-5 py-4">
              <section className="rounded-lg border border-border/25 bg-card/20 p-4">
                <h3 className="mb-1 text-xs font-light uppercase tracking-[0.18em] text-foreground">Capture the ride</h3>
                <p className="mb-3 text-xs text-muted-foreground">
                  Paste the trip-share link from your rideshare app, or type what the card shows.
                  Guardian reads the card first, then runs the public-record check.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="g-trip" className="text-[11px] uppercase tracking-wider text-muted-foreground">Trip share link</Label>
                    <Input id="g-trip" inputMode="url" placeholder="https://t.uber.com/…"
                      value={form.trip_url} onChange={(e) => setForm({ ...form, trip_url: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="g-name" className="text-[11px] uppercase tracking-wider text-muted-foreground">Driver name</Label>
                    <Input id="g-name" value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="g-plate" className="text-[11px] uppercase tracking-wider text-muted-foreground">Plate</Label>
                    <Input id="g-plate" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })} />
                  </div>
                  <div>
                    <Label htmlFor="g-vehicle" className="text-[11px] uppercase tracking-wider text-muted-foreground">Vehicle</Label>
                    <Input id="g-vehicle" value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="g-city" className="text-[11px] uppercase tracking-wider text-muted-foreground">Pickup city</Label>
                    <Input id="g-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                  </div>
                </div>
                <Button className="mt-3" onClick={capture} disabled={capturing}>
                  {capturing ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Capturing</> : "Run driver check"}
                </Button>
              </section>

              {loading ? (
                <div className="space-y-3" aria-live="polite">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : loadError ? (
                <div className="rounded-lg border border-border/30 p-5 text-sm" role="alert">
                  <p className="text-foreground">Guardian could not load your rides.</p>
                  <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => void load()}>Retry</Button>
                </div>
              ) : rides.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/30 p-6 text-center text-xs text-muted-foreground">
                  No rides checked yet. Capture your next ride above and Guardian will assess the driver before you board.
                </p>
              ) : (
                rides.map((ride) => {
                  const deep = ride.rideshare_reports?.find((r) => r.phase === "deep");
                  const fast = ride.rideshare_reports?.find((r) => r.phase === "fast");
                  const p = deep?.payload || {};
                  return (
                    <article key={ride.id} className="rounded-lg border border-border/25 bg-card/20 p-4">
                      <header className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <VerdictChip verdict={deep?.verdict ?? ride.verdict} />
                            <span className="text-sm text-foreground">{ride.driver_name || "Unnamed driver"}</span>
                          </div>
                          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
                            {[ride.plate, ride.vehicle, ride.city].filter(Boolean).join(" · ") || "no card detail"}
                            {" · "}{new Date(ride.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => runSweep(ride.id)} disabled={sweeping === ride.id}>
                            {sweeping === ride.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Re-run"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => downloadReport(ride)} aria-label="Download report">
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => removeRide(ride.id)} aria-label="Delete ride">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </header>

                      <p className="mt-3 text-sm text-foreground/85">{deep?.headline || fast?.headline}</p>
                      {p.narrative && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{p.narrative}</p>}

                      {p.recommended_action && (
                        <p className="mt-3 rounded-sm border border-border/30 bg-muted/10 px-3 py-2 text-xs text-foreground">
                          <span className="font-mono uppercase tracking-[0.18em] text-muted-foreground/70">Do now · </span>
                          {p.recommended_action}
                        </p>
                      )}

                      {Array.isArray(p.flags) && p.flags.length > 0 && (
                        <ul className="mt-3 space-y-1.5">
                          {p.flags.map((f: any, i: number) => (
                            <li key={i} className="text-xs text-muted-foreground">
                              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/70">
                                [{String(f.severity || "info")}]
                              </span>{" "}
                              {f.detail} <span className="opacity-70">— {f.evidence}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {Array.isArray(p.candidates) && p.candidates.length > 0 && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {p.candidates.map((c: any, i: number) => (
                            <div key={i} className="rounded-sm border border-border/25 px-3 py-2">
                              <p className="text-xs text-foreground">{c.name || "unnamed"}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {c.locality || "locality unknown"} · match {Math.round((c.match_confidence || 0) * 100)}%
                              </p>
                              {c.basis && <p className="mt-1 text-[11px] text-muted-foreground/80">{c.basis}</p>}
                            </div>
                          ))}
                        </div>
                      )}

                      {Array.isArray(p.plate_candidates) && p.plate_candidates.length > 0 && (
                        <div className="mt-3 rounded-sm border border-border/25 bg-muted/5 p-3">
                          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                            Plate-anchored identity reconstruction
                            {typeof p.unresolved_mass === "number" &&
                              ` · unresolved ${Math.round(p.unresolved_mass * 100)}%`}
                          </p>
                          <ul className="mt-2 space-y-2">
                            {p.plate_candidates.map((c: any, i: number) => (
                              <li key={i} className="text-xs">
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-foreground">
                                    {c.name}
                                    {c.plate_anchored && (
                                      <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.18em] text-foreground/60">
                                        plate-anchored
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-mono text-[11px] text-muted-foreground">
                                    {Math.round((c.posterior || 0) * 100)}%
                                  </span>
                                </div>
                                {/* Weight bar: transform-free width so it cannot shift layout. */}
                                <div className="mt-1 h-1 w-full rounded-full bg-muted/30">
                                  <div
                                    className="h-1 rounded-full bg-foreground/50"
                                    style={{ width: `${Math.min(100, Math.round((c.posterior || 0) * 100))}%` }}
                                  />
                                </div>
                                {Array.isArray(c.reasons) && (
                                  <p className="mt-1 text-[11px] text-muted-foreground/80">{c.reasons.join(" · ")}</p>
                                )}
                                {Array.isArray(c.sources) && c.sources.length > 0 && (
                                  <p className="text-[10px] text-muted-foreground/60">{c.sources.join(", ")}</p>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {typeof p.collection_note === "string" && p.collection_note && (
                        <p className="mt-3 text-[11px] text-muted-foreground/70">{p.collection_note}</p>
                      )}

                      <footer className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/50">
                        {deep
                          ? `identity ${Math.round((deep.confidence || 0) * 100)}%${p.clamped_to_thin ? " · held at THIN, identity unbound" : ""}${deep.delivered_channels?.length ? ` · alerted via ${deep.delivered_channels.join(", ")}` : ""}`
                          : "fast pass only — deep check not yet run"}
                      </footer>
                    </article>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── MESSAGES ──────────────────────────────────────────────────── */}
        <TabsContent value="messages" className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="space-y-5 px-5 py-4">
              <section className="rounded-lg border border-border/25 bg-card/20 p-4">
                <h3 className="mb-1 text-xs font-light uppercase tracking-[0.18em] text-foreground">Message thread analysis</h3>
                <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                  Phones do not let any website read your text messages — that door is closed by the
                  operating system, not by Asherin. Paste or forward a thread here and Guardian will
                  read it the same way it reads any other source: participants, intent, pressure
                  tactics, and what to do next.
                </p>
                <Label htmlFor="g-thread" className="sr-only">Message thread</Label>
                <Textarea
                  id="g-thread"
                  rows={7}
                  placeholder={"Paste the conversation, one message per line…"}
                  value={thread}
                  onChange={(e) => setThread(e.target.value)}
                />
                <Button className="mt-3" onClick={analyseThread} disabled={analysing}>
                  {analysing ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Reading</> : "Analyse thread"}
                </Button>
              </section>

              {loading ? (
                <Skeleton className="h-24 w-full" />
              ) : sources.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/30 p-6 text-center text-xs text-muted-foreground">
                  No threads analysed yet.
                </p>
              ) : (
                sources.map((s) => (
                  <article key={s.id} className="rounded-lg border border-border/25 bg-card/20 p-4">
                    <header className="flex items-center justify-between gap-3">
                      <span className="text-sm text-foreground">{s.counterparty || "Unknown counterparty"}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
                        risk {String(s.parsed?.risk || "unrated")} · {new Date(s.created_at).toLocaleDateString()}
                      </span>
                    </header>
                    {s.parsed?.summary && <p className="mt-2 text-xs text-muted-foreground">{s.parsed.summary}</p>}
                    {Array.isArray(s.parsed?.tactics) && s.parsed.tactics.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {s.parsed.tactics.map((t: any, i: number) => (
                          <li key={i} className="text-xs text-muted-foreground">
                            <span className="text-foreground/80">{t.name}</span> — {t.evidence}
                          </li>
                        ))}
                      </ul>
                    )}
                    {s.parsed?.recommended_action && (
                      <p className="mt-2 rounded-sm border border-border/30 bg-muted/10 px-3 py-2 text-xs text-foreground">
                        {s.parsed.recommended_action}
                      </p>
                    )}
                  </article>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── SETTINGS ──────────────────────────────────────────────────── */}
        <TabsContent value="settings" className="flex-1 overflow-hidden">
          <div className="space-y-4 px-5 py-4">
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Alert me at or above</Label>
              <div className="mt-2 flex gap-2">
                {(["THIN", "WATCH", "AVOID"] as Verdict[]).map((v) => (
                  <Button
                    key={v}
                    size="sm"
                    variant={settings.alert_threshold === v ? "default" : "outline"}
                    onClick={() => saveSettings({ ...settings, alert_threshold: v })}
                  >
                    {v}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/25 px-4 py-3">
              <div className="pr-4">
                <p className="text-sm text-foreground">Autopilot — read rides from my mail</p>
                <p className="text-xs text-muted-foreground">
                  Scans your connected Google mailbox every 15 minutes for Uber and Lyft trip mail,
                  rebuilds the ride card, and runs the full dossier without you pasting anything.
                </p>
              </div>
              <Switch
                checked={settings.autopilot_enabled}
                onCheckedChange={(v) => saveSettings({ ...settings, autopilot_enabled: v })}
              />
            </div>
            {settings.autopilot_enabled && (
              <div className="flex items-center justify-between rounded-lg border border-border/25 px-4 py-3">
                <div>
                  <p className="text-sm text-foreground">Run a scan now</p>
                  <p className="text-xs text-muted-foreground">
                    {settings.last_scan_at
                      ? `Last read ${new Date(settings.last_scan_at).toLocaleString()} — ${settings.last_scan_detail || settings.last_scan_status || "no detail"}`
                      : "Your mailbox has not been read yet."}
                  </p>
                </div>
                <Button size="sm" variant="outline" disabled={scanning} onClick={runScanNow}>
                  {scanning ? "Scanning…" : "Scan mailbox"}
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg border border-border/25 px-4 py-3">
              <div>
                <p className="text-sm text-foreground">Device notifications</p>
                <p className="text-xs text-muted-foreground">Arrives even when Asherin is closed.</p>
              </div>
              <Switch checked={settings.push_enabled} onCheckedChange={(v) => saveSettings({ ...settings, push_enabled: v })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/25 px-4 py-3">
              <div>
                <p className="text-sm text-foreground">Email the full report</p>
                <p className="text-xs text-muted-foreground">Branded dossier sent to your account address.</p>
              </div>
              <Switch checked={settings.email_enabled} onCheckedChange={(v) => saveSettings({ ...settings, email_enabled: v })} />
            </div>
          </div>

        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RideshareGuardian;
