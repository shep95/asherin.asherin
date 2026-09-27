import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithByokRetry } from "@/lib/byokInvoke";
import { enablePush, readPushStatus, type PushStatus } from "@/lib/guardianPush";
import { pickOne, listPaired } from "@/components/dashboard/zaxin/core/scanner";
import {
  subscribeSentinel, getSentinelState, armSentinel, disarmSentinel, flushSentinel,
  checkAreaNow, grantRadioPermission, ingestAdvert, invalidateSentinelSettings,
  runTradecraftSweep,
  type SentinelState,
} from "@/lib/sentinel/alwaysOn";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import NetworkSentinelTab from "@/components/dashboard/google/modules/NetworkSentinelTab";

import {
  Radar, ShieldAlert, MapPin, Loader2, RefreshCw, EyeOff, UserCheck, FileText, Radio,
  Crosshair, BookOpen, Download, AlertTriangle,
} from "lucide-react";

/**
 * BLUETOOTH & AREA SENTINEL
 *
 * What this is honest about, in the interface, not just in a comment:
 * a browser can only hear Bluetooth advertisements while this page is open and
 * in the foreground. It cannot scan with the phone powered off, and it cannot
 * scan with the tab closed — no web platform can. So the Sentinel runs as a
 * wake-locked foreground watch that auto-resumes the moment you return, and it
 * says exactly that on screen rather than implying a radio it does not own.
 *
 * The detection question it answers is the one that matters in a stalking case:
 * has this same radio been near me across separate times and separate places?
 */

interface Device {
  id: string;
  display_name: string;
  manufacturer: string | null;
  inferred_kind: string;
  encounter_count: number;
  distinct_days: number;
  distinct_places: number;
  sighting_count: number;
  last_rssi: number | null;
  last_distance_m: number | null;
  closest_distance_m: number | null;
  is_self: boolean;
  self_reason: string | null;
  is_ignored: boolean;
  threat_tier: string;
  dossier: Record<string, any> | null;
  first_seen: string;
  last_seen: string;
}

interface GeoEvent {
  id: string;
  place_label: string | null;
  risk_level: string;
  created_at: string;
}

interface TcIndicator {
  code: string;
  title: string;
  school: string;
  severity: "informational" | "notable" | "serious" | "critical";
  confidence: number;
  deviceIds: string[];
  finding: string;
  doctrine: string;
  evidence: string[];
  benign: string;
  watchFor: string[];
}

interface TcAnalysis {
  tier: "none" | "watch" | "probable" | "active";
  score: number;
  headline: string;
  posture: string;
  indicators: TcIndicator[];
  coverage: {
    sessions: number; days: number; places: number; devices: number; sightings: number;
    windowStart: string | null; windowEnd: string | null;
  };
  blindSpots: string[];
}

interface DoctrineEntry {
  code: string; school: string; name: string; how: string; radioSignature: string; counter: string;
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: "border-foreground/70 bg-foreground/10",
  serious: "border-foreground/50 bg-foreground/[0.06]",
  notable: "border-border bg-muted/30",
  informational: "border-border bg-transparent",
};

/** A case file is only useful if it can leave the app. Markdown travels into
 *  an email, a police report and a lawyer's bundle without losing structure. */
function caseToMarkdown(a: TcAnalysis, file: Record<string, any>): string {
  const L: string[] = [];
  L.push(`# ${file.case_reference || "Sentinel case file"}`);
  L.push(`_Generated ${new Date().toISOString()} · Asherin Bluetooth Sentinel_`);
  L.push(`\n**Tier:** ${a.tier} · **Score:** ${a.score}/100 · **Posture:** ${a.posture}`);
  L.push(`\n## Executive summary\n${file.executive_summary || a.headline}`);
  if (file.pattern_of_conduct) L.push(`\n## Pattern of conduct\n${file.pattern_of_conduct}`);
  if (file.adversary_assessment) {
    L.push(`\n## Adversary assessment\n- Posture: ${file.adversary_assessment.posture}\n- Sophistication: ${file.adversary_assessment.sophistication}\n- Reasoning: ${file.adversary_assessment.reasoning}`);
  }
  L.push(`\n## Coverage of the log\n- Scan sessions: ${a.coverage.sessions}\n- Days: ${a.coverage.days}\n- Locations: ${a.coverage.places}\n- Radios tracked: ${a.coverage.devices}\n- Sightings: ${a.coverage.sightings}\n- Window: ${a.coverage.windowStart || "n/a"} → ${a.coverage.windowEnd || "n/a"}`);
  L.push(`\n## Indicators`);
  for (const i of a.indicators) {
    L.push(`\n### [${i.code}] ${i.title}\n- Severity: ${i.severity} (confidence ${(i.confidence * 100).toFixed(0)}%)\n- Finding: ${i.finding}\n- Doctrine: ${i.doctrine}\n- Evidence:\n${i.evidence.map((e) => `  - ${e}`).join("\n")}\n- Innocent explanation: ${i.benign}\n- Watch for:\n${i.watchFor.map((w) => `  - ${w}`).join("\n")}`);
  }
  for (const [heading, key] of [
    ["Exhibits", "exhibits"], ["Timeline", "timeline"], ["Next 24 hours", "next_24_hours"],
    ["Evidence preservation", "evidence_preservation"], ["Reporting package", "reporting_package"],
    ["Alternative explanations", "alternative_explanations"], ["Watch for", "watch_for"],
  ] as const) {
    const v = file[key];
    if (!Array.isArray(v) || !v.length) continue;
    L.push(`\n## ${heading}`);
    for (const item of v) {
      if (typeof item === "string") L.push(`- ${item}`);
      else if (item?.exhibit) L.push(`- **Exhibit ${item.exhibit}** — ${item.device}: ${item.why_it_matters}`);
      else if (item?.when) L.push(`- ${item.when} — ${item.what}`);
      else L.push(`- ${JSON.stringify(item)}`);
    }
  }
  L.push(`\n## Blind spots\n${a.blindSpots.map((b) => `- ${b}`).join("\n")}`);
  if (file.limits) L.push(`\n## Limits\n${file.limits}`);
  L.push(`\n---\nThis file records the behaviour of Bluetooth hardware. It does not identify any person and is not proof of who is responsible.`);
  return L.join("\n");
}



const TIER_STYLE: Record<string, string> = {
  breach: "border-foreground/60 bg-foreground/10 text-foreground",
  priority: "border-foreground/40 bg-foreground/[0.06] text-foreground/90",
  unknown: "border-border bg-muted/40 text-muted-foreground",
  known: "border-border bg-muted/20 text-muted-foreground",
  friendly: "border-border bg-transparent text-muted-foreground",
};

const feet = (m: number | null) => (m == null ? "—" : `${Math.round(m * 3.28084)} ft`);

async function resolveByok(): Promise<Record<string, string> | undefined> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return undefined;
    const { data: pref } = await supabase
      .from("user_model_preferences" as any)
      .select("active_provider, active_model").eq("user_id", user.id).maybeSingle();
    const provider = (pref as any)?.active_provider;
    const model = (pref as any)?.active_model;
    if (!provider || provider === "default" || !model || model === "default") return undefined;
    const { data: keyRow } = await supabase
      .from("user_api_keys" as any)
      .select("api_key").eq("user_id", user.id).eq("provider", provider).eq("is_active", true).maybeSingle();
    const apiKey = (keyRow as any)?.api_key;
    return apiKey ? { provider, model, apiKey } : undefined;
  } catch {
    return undefined;
  }
}

const BluetoothSentinel = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [events, setEvents] = useState<GeoEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sent, setSent] = useState<SentinelState>(getSentinelState());
  const [dossierFor, setDossierFor] = useState<string | null>(null);
  const [push, setPush] = useState<PushStatus>({ state: "prompt" });
  const [analysis, setAnalysis] = useState<TcAnalysis | null>(null);
  const [doctrine, setDoctrine] = useState<DoctrineEntry[]>([]);
  const [analysing, setAnalysing] = useState(false);
  const [caseFile, setCaseFile] = useState<Record<string, any> | null>(null);
  const [buildingCase, setBuildingCase] = useState(false);
  const [caseNote, setCaseNote] = useState("");
  const [settings, setSettings] = useState({
    recurrence_threshold: 3,
    recurrence_window_hours: 2,
    ignore_audio: true,
    min_rssi: -80,
    ble_enabled: true,
    geo_enabled: true,
    push_enabled: true,
    email_enabled: true,
  });

  // Everything below is a projection of daemon state — no local radio, no local
  // timers, so unmounting this tab cannot silence the watch.
  const watching = sent.armed;
  const liveCount = sent.liveCount;
  const flushing = sent.flushing;
  const areaState = sent.area;
  const checkingArea = sent.checkingArea;
  const mode = sent.mode;
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [d, g, s] = await Promise.all([
        supabase.functions.invoke("sentinel-ble", { body: { action: "ble.list" } }),
        supabase.functions.invoke("sentinel-ble", { body: { action: "geo.list" } }),
        supabase.functions.invoke("sentinel-ble", { body: { action: "settings.get" } }),
      ]);
      if (d.error) throw d.error;
      setDevices((d.data?.devices || []) as Device[]);
      setEvents((g.data?.events || []) as GeoEvent[]);
      if (s.data?.settings) setSettings((prev) => ({ ...prev, ...s.data.settings }));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Sentinel could not be reached.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    void readPushStatus().then(setPush);
    return () => { mounted.current = false; };
  }, [load]);

  // The scan itself lives in the always-on daemon (src/lib/sentinel/alwaysOn.ts),
  // which is armed at app boot. This view is a window onto it — it never opens a
  // second radio stream, which would double-count sightings and corrupt the
  // recurrence maths every stalking judgement depends on.
  useEffect(() => subscribeSentinel(setSent), []);

  // Any daemon ingest (background flush, area alert) refreshes the tables.
  useEffect(() => {
    const onIngest = () => { void load(); };
    window.addEventListener("asherin-sentinel-ingest", onIngest);
    return () => window.removeEventListener("asherin-sentinel-ingest", onIngest);
  }, [load]);

  const captureOnce = async () => {
    try {
      if (mode === "continuous" || mode === "native") {
        const paired = await listPaired();
        for (const a of paired) ingestAdvert(a);
      }
      await pickOne((a) => ingestAdvert(a));
      await flushSentinel(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No device selected");
    }
  };

  const mark = async (id: string, patch: { is_self?: boolean; is_ignored?: boolean }) => {
    await supabase.functions.invoke("sentinel-ble", { body: { action: "ble.mark", deviceId: id, ...patch } });
    await load();
  };

  const buildDossier = async (id: string) => {
    setDossierFor(id);
    try {
      const byok = await resolveByok();
      await invokeWithByokRetry("sentinel-ble", { body: { action: "ble.dossier", deviceId: id, ...(byok ? { byok } : {}) }, tool: "asherin-sentinel" });
      toast.success("Dossier built");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dossier failed");
    } finally {
      setDossierFor(null);
    }
  };

  // ── Tradecraft: deterministic, so it runs without a model key ────────────
  // The daemon re-scores every 15 minutes whether or not anyone is looking, and
  // escalations alert on their own. This view renders the latest score and can
  // force a fresh pass, but nothing here is a prerequisite for the analysis.
  const runTradecraft = useCallback(async (silent = true) => {
    setAnalysing(true);
    try {
      const data = await runTradecraftSweep(silent);
      if (data) {
        setAnalysis((data?.analysis || null) as TcAnalysis | null);
        setDoctrine((data?.doctrine || []) as DoctrineEntry[]);
        if (!silent) toast.success("Tradecraft analysis complete");
      }
    } finally {
      setAnalysing(false);
    }
  }, []);

  useEffect(() => {
    void runTradecraft(true);
    const onSweep = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (!data) return;
      setAnalysis((data.analysis || null) as TcAnalysis | null);
      setDoctrine((data.doctrine || []) as DoctrineEntry[]);
      void load();
    };
    window.addEventListener("asherin-tradecraft-updated", onSweep);
    return () => window.removeEventListener("asherin-tradecraft-updated", onSweep);
  }, [runTradecraft, load]);

  const buildCase = async () => {
    setBuildingCase(true);
    try {
      const byok = await resolveByok();
      const data = await invokeWithByokRetry<any>("sentinel-ble", {
        body: { action: "ble.case", note: caseNote.slice(0, 2000), ...(byok ? { byok } : {}) },
        silent: true,
      });
      if (data?.analysis) setAnalysis(data.analysis as TcAnalysis);
      setCaseFile(data?.caseFile || null);
      toast.success("Case file built");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Case file failed");
    } finally {
      setBuildingCase(false);
    }
  };

  const downloadCase = () => {
    if (!analysis || !caseFile) return;
    const blob = new Blob([caseToMarkdown(analysis, caseFile)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${caseFile.case_reference || "sentinel-case"}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke on the next frame so Safari has committed the navigation.
    requestAnimationFrame(() => URL.revokeObjectURL(url));
  };


  const saveSettings = async (next: Partial<typeof settings>) => {
    const merged = { ...settings, ...next };
    setSettings(merged);
    await supabase.functions.invoke("sentinel-ble", { body: { action: "settings.set", settings: merged } });
    // The daemon caches these — tell it to re-read rather than run a stale policy.
    invalidateSentinelSettings();
  };

  const flagged = devices.filter((d) => !d.is_self && !d.is_ignored && ["priority", "breach"].includes(d.threat_tier));
  const rest = devices.filter((d) => !flagged.includes(d));

  const DeviceCard = ({ d }: { d: Device }) => (
    <div className={`rounded-lg border p-3 space-y-2 ${TIER_STYLE[d.threat_tier] || TIER_STYLE.unknown}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{d.display_name}</p>
          <p className="text-[11px] text-muted-foreground">
            {d.inferred_kind} · {d.manufacturer || "maker not advertised"} · closest {feet(d.closest_distance_m)}
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-wider border rounded px-1.5 py-0.5 shrink-0">{d.threat_tier}</span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {d.encounter_count} session{d.encounter_count === 1 ? "" : "s"} · {d.distinct_days} day{d.distinct_days === 1 ? "" : "s"} · {d.distinct_places} place{d.distinct_places === 1 ? "" : "s"} · last {new Date(d.last_seen).toLocaleString()}
      </p>
      {d.is_self && <p className="text-[11px] italic text-muted-foreground">{d.self_reason || "Your own hardware."}</p>}
      {d.dossier && (
        <div className="rounded border border-border/60 bg-background/40 p-2 space-y-1">
          <p className="text-xs font-medium">{String(d.dossier.headline || "")}</p>
          <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{String(d.dossier.assessment || "")}</p>
          {Array.isArray(d.dossier.actions) && d.dossier.actions.length > 0 && (
            <ul className="text-[11px] text-muted-foreground list-disc pl-4">
              {d.dossier.actions.slice(0, 5).map((a: string, i: number) => <li key={i}>{a}</li>)}
            </ul>
          )}
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Grade {String(d.dossier.grade || "THIN")}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={dossierFor === d.id} onClick={() => buildDossier(d.id)}>
          {dossierFor === d.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
          {d.dossier ? "Rebuild dossier" : "Build dossier"}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => mark(d.id, { is_self: !d.is_self })}>
          <UserCheck className="h-3 w-3 mr-1" />{d.is_self ? "Not mine" : "This is mine"}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => mark(d.id, { is_ignored: !d.is_ignored })}>
          <EyeOff className="h-3 w-3 mr-1" />{d.is_ignored ? "Unmute" : "Mute"}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Radar className="h-4 w-4" /> Bluetooth & Area Sentinel</h2>
          <p className="text-xs text-muted-foreground">
            Logs every nearby radio, flags the ones that follow you across separate times and places, and warns you when you enter an area with reported risk.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {watching ? (
            <Button size="sm" variant="ghost" onClick={() => void disarmSentinel()}>Disarm</Button>
          ) : (
            <Button size="sm" onClick={() => void armSentinel()}>
              <Radio className="h-3.5 w-3.5 mr-1" /> Arm sentinel
            </Button>
          )}
        </div>
      </div>

      {/*
        SILENT-DEAF BANNER.

        The most dangerous state this panel can render is "Armed" over a radio
        that has never produced a single sample: the operator reads it as
        protection and waits for alerts that are arithmetically impossible,
        because recurrence needs sightings and there are none. Desktop Chrome
        exposes only the one-shot picker — no passive advertisement scanning —
        so on that runtime the log stays empty forever and nothing here is
        broken, it simply cannot hear. Say that loudly, above the fold, instead
        of leaving it to a muted line further down.
      */}
      {watching && !loading && devices.length === 0 && liveCount === 0 &&
        (mode === "picker" || mode === "unsupported") && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-1.5">
          <p className="flex items-center gap-2 font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            No radio has ever been heard on this device — stalking alerts cannot fire here.
          </p>
          <p className="text-muted-foreground">
            {mode === "picker"
              ? "This browser only exposes the one-shot Bluetooth picker. It cannot listen passively, so no advertisements are ever logged, so recurrence can never be computed. Area-risk and network legs are unaffected and still running."
              : "Web Bluetooth is unavailable in this browser, so the radio leg never starts. Area-risk and network legs are unaffected and still running."}
          </p>
          <p className="text-muted-foreground">
            Continuous sweeps need the Asherin companion app, or Chrome on Android with experimental
            web platform features enabled. Use <strong className="text-foreground">Capture</strong> below
            for a manual one-shot reading in the meantime.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-[11px] text-muted-foreground space-y-1">
        <p>
          <strong className="text-foreground">
            {watching ? "Armed — running by itself." : "Disarmed."}
          </strong>{" "}
          {watching
            ? "The sentinel starts on its own whenever Asherin is open. You never have to press start; disarming is the only thing that stops it."
            : "You turned the watch off. Nothing is being logged and no area alerts will fire until you arm it again."}
        </p>
        <p>
          <strong className="text-foreground">Radio reality:</strong>{" "}
          {mode === "native"
            ? "Companion app detected — the radio keeps listening while the app is in the background and while the screen is off."
            : mode === "continuous"
              ? "Continuous advertisement scanning is available on this device."
              : mode === "picker"
                ? "This browser only exposes the one-shot Bluetooth picker — use Capture once, install the Asherin companion app, or use Chrome on Android with experimental web platform features."
                : "Web Bluetooth is unavailable in this browser. Install the Asherin companion app, or use Chrome on Android."}
        </p>
        <p>
          {mode === "native"
            ? "Background and screen-off sweeps run natively. No phone can listen while it is fully powered down — the radio has no power then — so the log resumes the moment the handset boots."
            : "A web page can only listen while Asherin is open somewhere. The watch is wake-locked, supervised every minute, and re-arms itself the moment you return; alerts it has already raised still reach you by push and email anywhere."}
        </p>
        {watching && sent.blocked && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-foreground/80">{sent.blocked}</span>
            {(mode === "continuous" || mode === "native") && (
              <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => void grantRadioPermission()}>
                Grant radio access
              </Button>
            )}
          </div>
        )}
        {watching && (
          <p className="text-foreground">
            {sent.scanning ? "Radio watching" : "Radio idle"} · {sent.positioned ? "position locked" : "waiting for position"} · {liveCount} radio{liveCount === 1 ? "" : "s"} buffered {flushing && "· syncing"}
          </p>
        )}
      </div>


      <Tabs defaultValue="devices">
        <TabsList>
          <TabsTrigger value="devices">Devices {flagged.length > 0 && `(${flagged.length})`}</TabsTrigger>
          <TabsTrigger value="tradecraft">
            Tradecraft {analysis && analysis.indicators.length > 0 && `(${analysis.indicators.length})`}
          </TabsTrigger>
          <TabsTrigger value="area">Area risk</TabsTrigger>
          <TabsTrigger value="network">Network</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="network">
          <NetworkSentinelTab />
        </TabsContent>

        <TabsContent value="devices" className="space-y-3">

          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={captureOnce}>Capture once</Button>
            <Button size="sm" variant="ghost" onClick={() => flushSentinel(false)} disabled={flushing}>Sync buffer</Button>
          </div>
          {loading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : loadError ? (
            <div className="rounded border border-border p-4 text-sm">
              <p className="text-muted-foreground">{loadError}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => load()}>Retry</Button>
            </div>
          ) : devices.length === 0 ? (
            <div className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No radios logged yet. Start the watch and walk your normal route — recurrence only means something once you have moved.
            </div>
          ) : (
            <ScrollArea className="h-[520px] pr-3">
              <div className="space-y-3">
                {flagged.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" /> Following pattern detected
                    </p>
                    {flagged.map((d) => <DeviceCard key={d.id} d={d} />)}
                  </div>
                )}
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Logged radios</p>
                {rest.map((d) => <DeviceCard key={d.id} d={d} />)}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="tradecraft" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => runTradecraft(false)} disabled={analysing}>
              {analysing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Crosshair className="h-3.5 w-3.5 mr-1" />}
              Re-run analysis
            </Button>
            <Button size="sm" onClick={buildCase} disabled={buildingCase || !analysis}>
              {buildingCase ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <FileText className="h-3.5 w-3.5 mr-1" />}
              Build case file
            </Button>
            {caseFile && (
              <Button size="sm" variant="ghost" onClick={downloadCase}>
                <Download className="h-3.5 w-3.5 mr-1" /> Export markdown
              </Button>
            )}
          </div>

          {analysing && !analysis ? (
            <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          ) : !analysis ? (
            <p className="text-xs text-muted-foreground">Analysis unavailable. Run the watch first, then re-run.</p>
          ) : (
            <>
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{analysis.headline}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Posture reads {analysis.posture} · {analysis.coverage.sessions} sessions · {analysis.coverage.days} days · {analysis.coverage.places} locations · {analysis.coverage.devices} radios
                    </p>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider border rounded px-1.5 py-0.5 shrink-0">
                    {analysis.tier} · {analysis.score}/100
                  </span>
                </div>
                {/* Progress bar is a plain div so it can never animate on a
                    reduced-motion preference. */}
                <div className="h-1 w-full rounded bg-muted overflow-hidden" role="img" aria-label={`Tradecraft score ${analysis.score} of 100`}>
                  <div className="h-full bg-foreground/70" style={{ width: `${analysis.score}%` }} />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3" /> Tradecraft indicators
                </p>
                {analysis.indicators.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No indicator matched documented stalking or surveillance methodology in the current log. That is not the same as being safe — see the blind spots below.
                  </p>
                ) : (
                  analysis.indicators.map((i) => (
                    <div key={`${i.code}-${i.deviceIds.join("-")}`} className={`rounded-lg border p-3 space-y-2 ${SEVERITY_STYLE[i.severity]}`}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium">{i.title}</p>
                        <span className="text-[10px] uppercase tracking-wider border rounded px-1.5 py-0.5 shrink-0">
                          {i.severity} · {(i.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{i.finding}</p>
                      <p className="text-[11px]"><span className="text-muted-foreground">Method matched: </span>{i.doctrine}</p>
                      <details className="text-[11px] text-muted-foreground">
                        <summary className="cursor-pointer select-none">Evidence &amp; innocent explanation</summary>
                        <ul className="list-disc pl-4 mt-1">
                          {i.evidence.map((e, n) => <li key={n}>{e}</li>)}
                        </ul>
                        <p className="mt-1 italic">Most likely innocent reading: {i.benign}</p>
                      </details>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">What to watch for</p>
                        <ul className="text-[11px] text-muted-foreground list-disc pl-4">
                          {i.watchFor.map((w, n) => <li key={n}>{w}</li>)}
                        </ul>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">What this method cannot see</p>
                <ul className="text-[11px] text-muted-foreground list-disc pl-4">
                  {analysis.blindSpots.map((b, n) => <li key={n}>{b}</li>)}
                </ul>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Case note (optional)</Label>
                <p className="text-[11px] text-muted-foreground">
                  Anything you personally observed — a car, a time, a message. It is recorded as your statement, kept separate from the machine analysis, and never used to name anyone.
                </p>
                <textarea
                  value={caseNote}
                  maxLength={2000}
                  onChange={(e) => setCaseNote(e.target.value)}
                  rows={3}
                  className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                  placeholder="e.g. Same silver estate parked opposite the entrance on Tuesday and Thursday around 23:00."
                />
              </div>

              {caseFile && (
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-sm font-semibold">{String(caseFile.case_reference || "Case file")}</p>
                  <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{String(caseFile.executive_summary || "")}</p>
                  {Array.isArray(caseFile.next_24_hours) && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Next 24 hours</p>
                      <ol className="text-[11px] text-muted-foreground list-decimal pl-4">
                        {caseFile.next_24_hours.map((s: string, n: number) => <li key={n}>{s}</li>)}
                      </ol>
                    </div>
                  )}
                  {Array.isArray(caseFile.evidence_preservation) && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Evidence preservation</p>
                      <ul className="text-[11px] text-muted-foreground list-disc pl-4">
                        {caseFile.evidence_preservation.map((s: string, n: number) => <li key={n}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {Array.isArray(caseFile.reporting_package) && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Hand to police / advocate</p>
                      <ul className="text-[11px] text-muted-foreground list-disc pl-4">
                        {caseFile.reporting_package.map((s: string, n: number) => <li key={n}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {caseFile.narration_note && <p className="text-[10px] italic text-muted-foreground">{String(caseFile.narration_note)}</p>}
                </div>
              )}

              {doctrine.length > 0 && (
                <details className="rounded-lg border border-border/60 p-3">
                  <summary className="text-[11px] uppercase tracking-wider text-muted-foreground cursor-pointer select-none flex items-center gap-1">
                    <BookOpen className="h-3 w-3" /> How following is actually run — the methods this engine tests for
                  </summary>
                  <div className="mt-2 space-y-3">
                    {doctrine.map((d) => (
                      <div key={d.code} className="space-y-1">
                        <p className="text-xs font-medium">{d.name} <span className="text-[10px] uppercase tracking-wider text-muted-foreground">· {d.school}</span></p>
                        <p className="text-[11px] text-muted-foreground">{d.how}</p>
                        <p className="text-[11px] text-muted-foreground"><span className="text-foreground/70">Radio signature: </span>{d.radioSignature}</p>
                        <p className="text-[11px] text-muted-foreground"><span className="text-foreground/70">Counter: </span>{d.counter}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="area" className="space-y-3">
          <div className="flex gap-2">
            <Button size="sm" onClick={() => checkAreaNow(false)} disabled={checkingArea}>
              {checkingArea ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <MapPin className="h-3.5 w-3.5 mr-1" />}
              Assess where I am
            </Button>
          </div>
          {areaState && (
            <div className="rounded-lg border border-border p-3 space-y-1">
              <p className="text-sm font-semibold">{areaState.level} · {areaState.label}</p>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{areaState.summary}</p>
            </div>
          )}
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Recent area alerts</p>
          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground">No area alerts yet.</p>
          ) : (
            <div className="space-y-2">
              {events.map((e) => (
                <div key={e.id} className="rounded border border-border/60 p-2">
                  <p className="text-xs font-medium">{e.risk_level} · {e.place_label || "unlabelled area"}</p>
                  <p className="text-[11px] text-muted-foreground">{new Date(e.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Alert after this many strikes</Label>
              <p className="text-[11px] text-muted-foreground">
                A strike is a sighting of the same unknown radio at least 5 minutes after the last one.
              </p>
            </div>
            <input
              type="number" min={2} max={20} value={settings.recurrence_threshold}
              onChange={(e) => saveSettings({ recurrence_threshold: Number(e.target.value) })}
              className="w-16 rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Strike window (hours)</Label>
              <p className="text-[11px] text-muted-foreground">
                Hit the strike count inside this many hours and you are alerted. Strikes across locations 500 m apart, or three inside 30 minutes, escalate to critical.
              </p>
            </div>
            <input
              type="number" min={1} max={168} value={settings.recurrence_window_hours}
              onChange={(e) => saveSettings({ recurrence_window_hours: Number(e.target.value) })}
              className="w-16 rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Strike signal floor (dBm)</Label>
              <p className="text-[11px] text-muted-foreground">
                Weaker samples are still logged but never count as a strike. −80 dBm is roughly 10 metres.
              </p>
            </div>
            <input
              type="number" min={-110} max={-40} step={5} value={settings.min_rssi}
              onChange={(e) => saveSettings({ min_rssi: Number(e.target.value) })}
              className="w-20 rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </div>


          {[
            ["ignore_audio", "Ignore headphones & speakers", "Audio accessories repeat constantly and carry no stalking signal. Still logged."],
            ["geo_enabled", "Area risk alerts", "Assess the neighbourhood you enter against reported crime and documented activity."],
            ["push_enabled", "Push alerts", "Delivered to every registered device, app closed."],
            ["email_enabled", "Email alerts", "Full branded intelligence report."],
          ].map(([key, label, hint]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm">{label}</Label>
                <p className="text-[11px] text-muted-foreground">{hint}</p>
              </div>
              <Switch
                checked={(settings as any)[key]}
                onCheckedChange={(v) => saveSettings({ [key]: v } as any)}
              />
            </div>
          ))}
          {push.state !== "enabled" && (
            <Button size="sm" variant="outline" onClick={async () => setPush(await enablePush())}>
              Enable device push
            </Button>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BluetoothSentinel;
