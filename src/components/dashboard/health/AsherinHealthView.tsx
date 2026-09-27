import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bluetooth,
  Boxes,
  Crosshair,
  Download,
  Eye,
  ClipboardList,
  ImagePlus,
  Layers,
  Leaf,
  Loader2,
  Pill,
  Radar,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { TerritoryHighlight } from "@/lib/health/systems";
import { registerTerritoryDefs, TERRITORIES, territoryLabel } from "@/lib/health/territory";
import { EXTRA_TERRITORIES } from "@/lib/health/territoryExtra";
import { sortFindings, type Finding, type LayerId } from "@/lib/health/model";
import { LAB_DEFS, labDef, labFindings, parseLabText } from "@/lib/health/labs";
import { DRUG_DEFS, drugInteractions, findDrug, medicationFindings } from "@/lib/health/medications";
import { GENE_DEFS, findGene, geneFindings } from "@/lib/health/genetics";
import {
  EXPOSURES,
  FAMILY_PRESETS,
  NUTRIENTS,
  SURGERY_PRESETS,
  exposureFindings,
  familyFindings,
  nutritionFindings,
  surgeryFindings,
} from "@/lib/health/records";
import { painFindings } from "@/lib/health/pain";
import { SYMPTOMS, symptomFindings } from "@/lib/health/symptoms";
import { herbFindings } from "@/lib/health/herbs";
import {
  computeHeartMetrics,
  computeMotionMetrics,
  connectHeartRate,
  detectCapabilities,
  signalFindings,
  type BleConnection,
  type HeartMetrics,
  type HeartSample,
  type MotionMetrics,
} from "@/lib/health/signals";
import { EMPTY_RECORD, clearRecord, exportRecord, importRecord, loadRecord, newId, recordCount, saveRecord, type HealthRecord } from "@/lib/health/store";

import { supabase } from "@/integrations/supabase/client";
import HealthAssistant from "./HealthAssistant";

const DeepAnatomyPanel = lazy(() => import("./DeepAnatomyPanel"));
const IntakePanel = lazy(() => import("./IntakePanel"));
const FunctionalPanel = lazy(() => import("./FunctionalPanel"));
const TimelinePanel = lazy(() => import("./TimelinePanel"));
const LiveSensingPanel = lazy(() => import("./LiveSensingPanel"));
const PainStudioPanel = lazy(() => import("./PainStudioPanel"));
const HerbalPanel = lazy(() => import("./HerbalPanel"));
const SharePanel = lazy(() => import("./SharePanel"));
const PhotoReadPanel = lazy(() => import("./PhotoReadPanel"));

/** the room runs on the person's own model key when they have one, exactly like every other asherin surface. */
async function resolveByok(): Promise<Record<string, string> | undefined> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return undefined;
    const { data: pref } = await supabase
      .from("user_model_preferences" as never)
      .select("active_provider, active_model")
      .eq("user_id", user.id)
      .maybeSingle();
    const provider = (pref as { active_provider?: string } | null)?.active_provider;
    const model = (pref as { active_model?: string } | null)?.active_model;
    if (!provider || provider === "default" || !model || model === "default") return undefined;
    const { data: keyRow } = await supabase
      .from("user_api_keys" as never)
      .select("api_key")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .eq("is_active", true)
      .maybeSingle();
    const apiKey = (keyRow as { api_key?: string } | null)?.api_key;
    return apiKey ? { provider, model, apiKey } : undefined;
  } catch {
    return undefined;
  }
}

type Panel =
  | "deep"
  | "record"
  | "intake"
  | "pain"
  | "herbs"
  | "functional"
  | "timeline"
  | "signals"
  | "share"
  | "photos"
  | "findings";

const PANELS: { id: Panel; label: string; icon: typeof Layers }[] = [
  { id: "record", label: "record", icon: ClipboardList },
  { id: "deep", label: "anatomy", icon: Boxes },
  { id: "intake", label: "intake", icon: Upload },
  { id: "pain", label: "pain", icon: Crosshair },
  { id: "herbs", label: "herbs", icon: Leaf },
  { id: "functional", label: "systems", icon: Activity },
  { id: "timeline", label: "over time", icon: RotateCcw },
  { id: "signals", label: "live", icon: Radar },
  { id: "photos", label: "photos", icon: ImagePlus },
  { id: "share", label: "share", icon: Download },
  { id: "findings", label: "read-out", icon: Eye },
];

const LAYER_LABEL: Record<LayerId, string> = {
  lab: "bloodwork",
  medication: "medication",
  gene: "genetics",
  nutrition: "nutrition",
  exposure: "exposure",
  surgery: "surgical history",
  family: "family history",
  pain: "pain",
  symptom: "symptom",
  herb: "herbal",
  inflammation: "inflammation",
  stress: "stress",
  circadian: "circadian",
  aging: "ageing",
  live: "live sensor",
};

interface Props {
  userId?: string | null;
}

export default function AsherinHealthView({ userId = null }: Props) {
  const [panel, setPanel] = useState<Panel>("record");
  const [record, setRecord] = useState<HealthRecord>(EMPTY_RECORD);
  const [assistantTrigger, setAssistantTrigger] = useState<string | null>(null);
  const [panelHighlights, setPanelHighlights] = useState<TerritoryHighlight[]>([]);
  /** the territories the person is looking at right now, by label. */
  const [focus, setFocus] = useState<string[]>([]);
  const painCount = useRef<number | null>(null);
  const [activeLayers, setActiveLayers] = useState<LayerId[]>([
    "lab",
    "medication",
    "gene",
    "nutrition",
    "exposure",
    "surgery",
    "family",
    "pain",
    "symptom",
    "herb",
    "live",
  ]);

  // live sensors
  const [heart, setHeart] = useState<HeartMetrics | null>(null);
  const [motion, setMotion] = useState<MotionMetrics | null>(null);
  const [bleName, setBleName] = useState<string | null>(null);
  const [bleBusy, setBleBusy] = useState(false);
  const [motionRunning, setMotionRunning] = useState(false);
  const heartSamples = useRef<HeartSample[]>([]);
  const bleRef = useRef<BleConnection | null>(null);
  const motionSeries = useRef<{ t: number; a: number }[]>([]);
  const capabilities = useMemo(() => detectCapabilities(), []);

  useEffect(() => {
    setRecord(loadRecord(userId));
  }, [userId]);

  const persist = useCallback(
    (next: HealthRecord) => {
      setRecord(next);
      if (!saveRecord(userId, next)) toast.error("this device is blocking local storage, so the record stays in memory only.");
    },
    [userId],
  );

  useEffect(
    () => () => {
      bleRef.current?.disconnect();
    },
    [],
  );

  useEffect(() => {
    // the extended catalogue has to be registered before any panel asks for a label.
    registerTerritoryDefs(EXTRA_TERRITORIES);
  }, []);

  const findings: Finding[] = useMemo(() => {
    const all = [
      ...labFindings(record.labs),
      ...medicationFindings(record.medications),
      ...geneFindings(record.genes),
      ...nutritionFindings(record.nutrition),
      ...exposureFindings(record.exposures),
      ...surgeryFindings(record.surgeries),
      ...familyFindings(record.family),
      ...painFindings(record.pain),
      ...symptomFindings(record.symptoms),
      ...herbFindings(record.herbs),
      ...signalFindings(heart, motion),
    ];
    return sortFindings(all.filter((f) => activeLayers.includes(f.layer)));
  }, [record, heart, motion, activeLayers]);

  /** every finding that names one of these territories. */
  const findingsForTerritories = useCallback(
    (keys: string[]) => findings.filter((f) => f.territoryKeys.some((k) => keys.includes(k))),
    [findings],
  );

  /** one way for any panel to ask the room to look somewhere: the territory is
   *  named, what the record says about it is read, and the assistant is asked. */
  const focusTerritories = useCallback(
    (keys: string[]) => {
      const labels = Array.from(new Set(keys.map((k) => territoryLabel(k))));
      if (labels.length === 0) return;
      setFocus(labels);
      const related = findingsForTerritories(keys);
      setAssistantTrigger(
        `i am looking at ${labels.join(", ")}.` +
          (related.length
            ? ` my record already points here: ${related.map((f) => f.label).join(", ")}. what does that mean together?`
            : " nothing in my record points here yet — what does this region carry, and what would make it matter?"),
      );
    },
    [findingsForTerritories],
  );

  const redFlags = useMemo(() => findings.filter((f) => f.redFlag), [findings]);

  // the assistant sees a compact reading of the same record the room is drawing
  // from — nothing else, so it can never answer from something invented.
  const assistantContext = useMemo(() => {
    const lines: string[] = [];
    if (record.pain.length) {
      lines.push(
        "pain reports: " +
          record.pain
            .slice(-6)
            .map((p) => `${p.partName ?? "unspecified region"} — ${Object.entries(p.answers).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join("/") : v}`).join(", ")}`)
            .join("; "),
      );
    }
    if (record.labs.length) lines.push("bloodwork: " + record.labs.map((l) => `${l.key} ${l.value}`).join(", "));
    if (record.medications.length) lines.push("medications: " + record.medications.map((m) => m.name).join(", "));
    if (record.symptoms.length) lines.push("symptoms: " + record.symptoms.map((x) => `${x.symptomKey} ${x.severity}/10`).join(", "));
    if (record.herbs.length) lines.push("herbs in use: " + record.herbs.join(", "));
    if (heart) lines.push(`live heart: ${Math.round(heart.bpm)} bpm`);
    if (findings.length) lines.push("current read-out: " + findings.slice(0, 12).map((f) => `${f.label} — ${f.detail}`).join("; "));
    if (panelHighlights.length) {
      lines.push("the room is pointing at: " + panelHighlights.slice(0, 8).map((h) => `${h.label} (${h.reason})`).join("; "));
    }
    if (focus.length) lines.push("currently looking at: " + focus.join(", "));
    return lines.join("\n");
  }, [record, heart, findings, panelHighlights, focus]);

  // a new pain report speaks for itself: the assistant is raised without asking.
  useEffect(() => {
    // the first pass only takes a reading of what was already saved: loading a
    // stored record is not the person reporting something new.
    if (painCount.current === null) {
      painCount.current = record.pain.length;
      return;
    }
    if (record.pain.length > painCount.current) {
      const latest = record.pain[record.pain.length - 1];
      const answers = Object.entries(latest?.answers ?? {})
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join("/") : v}`)
        .join(", ");
      setAssistantTrigger(
        `i just recorded pain in ${latest?.partName ?? "an unspecified region"}${answers ? ` — ${answers}` : ""}. ` +
          "tell me what that region carries, what tends to make it worse or better, and what would make this urgent.",
      );
    }
    painCount.current = record.pain.length;
  }, [record.pain]);

  const startHeart = async () => {
    setBleBusy(true);
    try {
      heartSamples.current = [];
      const connection = await connectHeartRate(
        (sample) => {
          heartSamples.current = [...heartSamples.current.slice(-600), sample];
          setHeart(computeHeartMetrics(heartSamples.current));
        },
        () => {
          setBleName(null);
          bleRef.current = null;
          toast.message("the heart rate device disconnected.");
        },
      );
      bleRef.current = connection;
      setBleName(connection.deviceName);
    } catch (e) {
      const message = e instanceof Error ? e.message : "the device could not be paired.";
      if (!/cancel/i.test(message)) toast.error(message);
    } finally {
      setBleBusy(false);
    }
  };

  const stopHeart = () => {
    bleRef.current?.disconnect();
    bleRef.current = null;
    setBleName(null);
  };

  const startMotion = async () => {
    const anyMotion = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
    try {
      if (typeof anyMotion.requestPermission === "function") {
        const outcome = await anyMotion.requestPermission();
        if (outcome !== "granted") {
          toast.error("motion access was declined, so steadiness cannot be measured.");
          return;
        }
      }
    } catch {
      toast.error("this device did not allow motion access.");
      return;
    }
    motionSeries.current = [];
    setMotionRunning(true);
    const handler = (event: DeviceMotionEvent) => {
      const a = event.accelerationIncludingGravity;
      if (!a) return;
      motionSeries.current.push({ t: performance.now(), a: Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0) });
    };
    window.addEventListener("devicemotion", handler);
    window.setTimeout(() => {
      window.removeEventListener("devicemotion", handler);
      setMotionRunning(false);
      const metrics = computeMotionMetrics(motionSeries.current);
      setMotion(metrics);
      if (!metrics) toast.error("not enough motion samples arrived to measure steadiness on this device.");
    }, 12000);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden text-sm text-foreground/85">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-extralight tracking-[0.2em] text-foreground/70">asherin.health</span>
          <Badge variant="outline" className="border-white/10 text-[10px] font-light text-foreground/50">
            personal record
          </Badge>
        </div>
        <p className="ml-auto text-[11px] font-light text-foreground/40">
          {recordCount(record)} entries · held on this device only
        </p>
      </header>

      {redFlags.length > 0 && (
        <div className="flex items-start gap-3 border-b border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300/80" />
          <div className="space-y-1">
            <p className="text-xs font-light text-amber-100/90">something here needs a clinician rather than a viewer.</p>
            {redFlags.slice(0, 3).map((f) => (
              <p key={f.id} className="text-[11px] font-light leading-relaxed text-amber-100/70">
                {f.label} — {f.nextStep}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-[64px] shrink-0 flex-col items-center gap-1 border-r border-white/[0.06] py-3">
          {PANELS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPanel(p.id)}
              className={cn(
                "flex w-[52px] flex-col items-center gap-1 rounded-xl px-1 py-2 text-[9px] tracking-wide transition-colors",
                panel === p.id ? "bg-white/[0.07] text-foreground/90" : "text-foreground/45 hover:bg-white/[0.04]",
              )}
            >
              <p.icon className="h-4 w-4" />
              {p.label}
            </button>
          ))}
        </nav>

        <section className="flex min-w-0 flex-1 flex-col">
          <ScrollArea className="flex-1">
            <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
              {panel === "record" && <RecordPanel record={record} persist={persist} />}
              {panel !== "record" && panel !== "findings" && panel !== "photos" && (
                <Suspense
                  fallback={
                    <p className="flex items-center gap-2 text-[11px] font-light text-foreground/45">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> opening this layer
                    </p>
                  }
                >
                  {panel === "deep" && (
                    <DeepAnatomyPanel
                      record={record}
                      persist={persist}
                      onEvent={setAssistantTrigger}
                      onSelectTerritories={focusTerritories}
                    />
                  )}
                  {panel === "intake" && (
                    <IntakePanel record={record} persist={persist} onEvent={setAssistantTrigger} resolveByok={resolveByok} />
                  )}
                  {panel === "pain" && (
                    <PainStudioPanel
                      record={record}
                      persist={persist}
                      onEvent={setAssistantTrigger}
                      onHighlights={setPanelHighlights}
                    />
                  )}
                  {panel === "herbs" && (
                    <HerbalPanel
                      record={record}
                      persist={persist}
                      onEvent={setAssistantTrigger}
                      onHighlights={setPanelHighlights}
                    />
                  )}
                  {panel === "functional" && (
                    <FunctionalPanel
                      record={record}
                      persist={persist}
                      onHighlights={setPanelHighlights}
                      onSelectTerritories={focusTerritories}
                    />
                  )}
                  {panel === "timeline" && <TimelinePanel record={record} persist={persist} onEvent={setAssistantTrigger} />}
                  {panel === "signals" && (
                    <div className="space-y-4">
                      <LiveSensingPanel
                        record={record}
                        persist={persist}
                        onEvent={setAssistantTrigger}
                        onHighlights={setPanelHighlights}
                      />
                      <Separator className="bg-white/[0.06]" />
                      <SignalPanel
                        capabilities={capabilities}
                        heart={heart}
                        motion={motion}
                        bleName={bleName}
                        bleBusy={bleBusy}
                        motionRunning={motionRunning}
                        startHeart={startHeart}
                        stopHeart={stopHeart}
                        startMotion={startMotion}
                      />
                    </div>
                  )}
                  {panel === "share" && <SharePanel record={record} persist={persist} onEvent={setAssistantTrigger} />}
                </Suspense>
              )}
              {panel === "photos" && (
                <Suspense
                  fallback={
                    <p className="flex items-center gap-2 text-[11px] font-light text-foreground/45">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> opening the photo reader
                    </p>
                  }
                >
                  <PhotoReadPanel
                    record={record}
                    persist={persist}
                    resolveByok={resolveByok}
                    onAsk={setAssistantTrigger}
                  />
                </Suspense>
              )}
              {panel === "findings" && (
                <FindingsPanel
                  findings={findings}
                  activeLayers={activeLayers}
                  setActiveLayers={setActiveLayers}
                  onFocus={focusTerritories}
                />
              )}
            </div>
          </ScrollArea>
        </section>

        <aside className="hidden w-[380px] shrink-0 flex-col gap-3 border-l border-white/[0.06] p-3 xl:flex">
          <div className="h-[58%] min-h-[280px] shrink-0">
            <HealthAssistant
              context={assistantContext}
              trigger={assistantTrigger}
              onTriggerHandled={() => setAssistantTrigger(null)}
              resolveByok={resolveByok}
            />
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-4 pr-2">
              <SectionTitle>looking at</SectionTitle>
              {focus.length === 0 && panelHighlights.length === 0 ? (
                <p className="text-[11px] font-light leading-relaxed text-foreground/45">
                  choose a region from any layer, and what your record says about it is read here and put to the assistant.
                </p>
              ) : (
                <>
                  {focus.length > 0 && (
                    <div className="space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-light text-foreground/85">{focus.join(", ")}</p>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setFocus([])}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                  {panelHighlights.slice(0, 12).map((h, i) => (
                    <div key={`${h.label}-${i}`} className="space-y-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                      <p className="text-[11px] font-light text-foreground/80">{h.label}</p>
                      <p className="text-[10px] font-light leading-relaxed text-foreground/50">{h.reason}</p>
                      <p className="text-[9px] font-light text-foreground/30">{h.source}</p>
                    </div>
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        </aside>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/35">{children}</p>;
}

function RecordPanel({ record, persist }: { record: HealthRecord; persist: (r: HealthRecord) => void }) {
  const [labText, setLabText] = useState("");
  const [medName, setMedName] = useState("");
  const [geneName, setGeneName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const applyLabs = () => {
    const { values, unrecognised } = parseLabText(labText);
    if (values.length === 0) {
      toast.error("no recognised analytes were found in that text.");
      return;
    }
    const merged = [...record.labs.filter((l) => !values.some((v) => v.key === l.key)), ...values];
    persist({ ...record, labs: merged });
    setLabText("");
    toast.success(
      `${values.length} value${values.length === 1 ? "" : "s"} read${unrecognised.length ? `, ${unrecognised.length} line${unrecognised.length === 1 ? "" : "s"} not recognised` : ""}.`,
    );
  };

  const addMedication = () => {
    const name = medName.trim();
    if (!name) return;
    const def = findDrug(name);
    persist({ ...record, medications: [...record.medications, { id: newId("med"), name, drugKey: def?.key }] });
    setMedName("");
    if (!def) toast.message("recorded. that medication is not in the built-in reference, so no territory is claimed for it.");
  };

  const addGene = () => {
    const name = geneName.trim();
    if (!name) return;
    const def = findGene(name);
    persist({ ...record, genes: [...record.genes, { id: newId("gene"), name, geneKey: def?.key }] });
    setGeneName("");
  };

  const interactions = drugInteractions(record.medications);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <SectionTitle>bloodwork</SectionTitle>
        <Textarea
          value={labText}
          onChange={(e) => setLabText(e.target.value)}
          placeholder={"paste results, one per line\nhaemoglobin 13.1 g/dL\nferritin 18\nhba1c 5.9"}
          className="min-h-[92px] rounded-xl border-white/[0.08] bg-white/[0.03] text-xs"
        />
        <Button size="sm" className="h-8 w-full text-[11px]" onClick={applyLabs}>
          read these values
        </Button>
        <div className="flex flex-wrap gap-1">
          {record.labs.map((l) => {
            const def = labDef(l.key);
            if (!def) return null;
            const out = l.value > def.high || l.value < def.low;
            return (
              <button
                key={l.key}
                onClick={() => persist({ ...record, labs: record.labs.filter((x) => x.key !== l.key) })}
                className={cn(
                  "rounded-lg border px-2 py-1 text-[10px] font-light",
                  out ? "border-amber-300/25 bg-amber-300/[0.07] text-amber-100/80" : "border-white/[0.07] text-foreground/50",
                )}
              >
                {def.label} {l.value}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] font-light text-foreground/30">
          {LAB_DEFS.length} analytes are recognised. anything else is left alone rather than guessed.
        </p>
      </div>

      <Separator className="bg-white/[0.06]" />

      <div className="space-y-2">
        <SectionTitle>medication</SectionTitle>
        <div className="flex gap-2">
          <Input
            value={medName}
            onChange={(e) => setMedName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addMedication()}
            placeholder="name of a medicine"
            list="health-drug-list"
            className="h-8 rounded-xl border-white/[0.08] bg-white/[0.03] text-xs"
          />
          <datalist id="health-drug-list">
            {DRUG_DEFS.map((d) => (
              <option key={d.key} value={d.label} />
            ))}
          </datalist>
          <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={addMedication}>
            add
          </Button>
        </div>
        {record.medications.map((m) => (
          <button
            key={m.id}
            onClick={() => persist({ ...record, medications: record.medications.filter((x) => x.id !== m.id) })}
            className="flex w-full items-center gap-2 rounded-lg border border-white/[0.07] px-2 py-1.5 text-left text-[11px] font-light text-foreground/70"
          >
            <Pill className="h-3 w-3 text-foreground/40" /> {m.name}
          </button>
        ))}
        {interactions.map((i) => (
          <p
            key={`${i.a}-${i.b}`}
            className={cn(
              "rounded-lg border px-2 py-1.5 text-[10px] font-light leading-relaxed",
              i.severity === "serious" ? "border-amber-300/25 bg-amber-300/[0.06] text-amber-100/80" : "border-white/[0.08] text-foreground/55",
            )}
          >
            {i.a} + {i.b}: {i.detail}
          </p>
        ))}
      </div>

      <Separator className="bg-white/[0.06]" />

      <div className="space-y-2">
        <SectionTitle>genetics</SectionTitle>
        <div className="flex gap-2">
          <Input
            value={geneName}
            onChange={(e) => setGeneName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addGene()}
            placeholder="variant or gene"
            list="health-gene-list"
            className="h-8 rounded-xl border-white/[0.08] bg-white/[0.03] text-xs"
          />
          <datalist id="health-gene-list">
            {GENE_DEFS.map((g) => (
              <option key={g.key} value={g.label} />
            ))}
          </datalist>
          <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={addGene}>
            add
          </Button>
        </div>
        {record.genes.map((g) => (
          <button
            key={g.id}
            onClick={() => persist({ ...record, genes: record.genes.filter((x) => x.id !== g.id) })}
            className="w-full rounded-lg border border-white/[0.07] px-2 py-1.5 text-left text-[11px] font-light text-foreground/70"
          >
            {g.name}
          </button>
        ))}
      </div>

      <Separator className="bg-white/[0.06]" />

      <ChipSection
        title="nutrition"
        options={NUTRIENTS.map((n) => ({ value: n.key, label: n.label }))}
        active={record.nutrition.filter((n) => n.status === "low").map((n) => n.nutrientKey)}
        onToggle={(key, on) =>
          persist({
            ...record,
            nutrition: on
              ? [...record.nutrition, { id: newId("nut"), nutrientKey: key, status: "low" }]
              : record.nutrition.filter((n) => n.nutrientKey !== key),
          })
        }
        hint="mark anything you know is low or hard to get in your diet."
      />

      <ChipSection
        title="exposures"
        options={EXPOSURES.map((e) => ({ value: e.key, label: e.label }))}
        active={record.exposures.map((e) => e.exposureKey)}
        onToggle={(key, on) =>
          persist({
            ...record,
            exposures: on
              ? [...record.exposures, { id: newId("exp"), exposureKey: key, intensity: "current-low" }]
              : record.exposures.filter((e) => e.exposureKey !== key),
          })
        }
        hint="what your body has been living inside, past or present."
      />

      <ChipSection
        title="surgical history"
        options={SURGERY_PRESETS.map((s) => ({ value: s.label, label: s.label }))}
        active={record.surgeries.map((s) => s.label)}
        onToggle={(key, on) =>
          persist({
            ...record,
            surgeries: on
              ? [...record.surgeries, { id: newId("surg"), label: key, territoryKeys: [] }]
              : record.surgeries.filter((s) => s.label !== key),
          })
        }
        hint="anything removed, replaced or rebuilt."
      />

      <ChipSection
        title="family history"
        options={FAMILY_PRESETS.map((f) => ({ value: f.condition, label: f.condition }))}
        active={record.family.map((f) => f.condition)}
        onToggle={(key, on) =>
          persist({
            ...record,
            family: on
              ? [...record.family, { id: newId("fam"), condition: key, relation: "parent", territoryKeys: [] }]
              : record.family.filter((f) => f.condition !== key),
          })
        }
        hint="conditions in a parent or sibling."
      />

      <ChipSection
        title="symptoms"
        options={SYMPTOMS.map((s) => ({ value: s.key, label: s.label }))}
        active={record.symptoms.map((s) => s.symptomKey)}
        onToggle={(key, on) =>
          persist({
            ...record,
            symptoms: on
              ? [...record.symptoms, { id: newId("sym"), symptomKey: key, severity: 5 }]
              : record.symptoms.filter((s) => s.symptomKey !== key),
          })
        }
        hint="what you are noticing, aside from pain."
      />

      <Separator className="bg-white/[0.06]" />

      <div className="space-y-2">
        <SectionTitle>this record</SectionTitle>
        <p className="text-[10px] font-light leading-relaxed text-foreground/40">
          {recordCount(record)} entries, held on this device only. nothing here is uploaded by this room.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-[11px]"
            onClick={() => {
              const blob = new Blob([exportRecord(record)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "asherin-health-record.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-3 w-3" /> export
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[11px]" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3 w-3" /> import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const { record: imported, error } = importRecord(await file.text());
              if (error || !imported) {
                toast.error(error ?? "that file could not be read.");
                return;
              }
              persist(imported);
              toast.success("record restored from your file.");
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-[11px] text-foreground/50"
            onClick={() => {
              clearRecord(null);
              persist(EMPTY_RECORD);
              toast.success("record cleared from this device.");
            }}
          >
            <Trash2 className="h-3 w-3" /> erase
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChipSection({
  title,
  options,
  active,
  onToggle,
  hint,
}: {
  title: string;
  options: { value: string; label: string }[];
  active: string[];
  onToggle: (value: string, on: boolean) => void;
  hint: string;
}) {
  return (
    <div className="space-y-2">
      <SectionTitle>{title}</SectionTitle>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = active.includes(o.value);
          return (
            <button
              key={o.value}
              onClick={() => onToggle(o.value, !on)}
              className={cn(
                "rounded-lg border px-2 py-1 text-[10px] font-light transition-colors",
                on ? "border-white/15 bg-white/[0.07] text-foreground/80" : "border-white/[0.06] text-foreground/40 hover:text-foreground/60",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] font-light text-foreground/30">{hint}</p>
    </div>
  );
}

function SignalPanel(props: {
  capabilities: ReturnType<typeof detectCapabilities>;
  heart: HeartMetrics | null;
  motion: MotionMetrics | null;
  bleName: string | null;
  bleBusy: boolean;
  motionRunning: boolean;
  startHeart: () => void;
  stopHeart: () => void;
  startMotion: () => void;
}) {
  const ble = props.capabilities.find((c) => c.source === "ble-heart-rate");
  const motionCap = props.capabilities.find((c) => c.source === "device-motion");
  return (
    <div className="space-y-4">
      <SectionTitle>live sensors</SectionTitle>
      <div className="space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
        <div className="flex items-center gap-2">
          <Bluetooth className="h-3.5 w-3.5 text-foreground/45" />
          <p className="text-[11px] font-light text-foreground/80">{ble?.label}</p>
        </div>
        <p className="text-[10px] font-light leading-relaxed text-foreground/45">{ble?.reason}</p>
        {props.heart ? (
          <div className="space-y-1 border-t border-white/[0.06] pt-2">
            <p className="text-lg font-extralight text-foreground/90">{props.heart.bpm} bpm</p>
            <p className="text-[10px] font-light text-foreground/50">
              {props.heart.rmssd !== null
                ? `rmssd ${props.heart.rmssd} ms · sdnn ${props.heart.sdnn} ms · ${props.heart.beats} intervals`
                : "this device reports rate only, so hrv is not computed."}
            </p>
          </div>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full text-[11px]"
          disabled={!ble?.available || props.bleBusy}
          onClick={props.bleName ? props.stopHeart : props.startHeart}
        >
          {props.bleBusy ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
          {props.bleName ? `disconnect ${props.bleName}` : "pair a heart rate device"}
        </Button>
      </div>

      <div className="space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-foreground/45" />
          <p className="text-[11px] font-light text-foreground/80">{motionCap?.label}</p>
        </div>
        <p className="text-[10px] font-light leading-relaxed text-foreground/45">{motionCap?.reason}</p>
        {props.motion && (
          <p className="text-[10px] font-light text-foreground/60">
            {props.motion.tremorRms.toFixed(3)} m/s² · dominant {props.motion.dominantHz} hz · {props.motion.sampleRateHz} hz sampling
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full text-[11px]"
          disabled={!motionCap?.available || props.motionRunning}
          onClick={props.startMotion}
        >
          {props.motionRunning ? "hold still · 12 seconds" : "measure steadiness"}
        </Button>
      </div>

      <p className="text-[10px] font-light leading-relaxed text-foreground/35">
        readings come from a real device or they do not appear. nothing on this panel is generated.
      </p>
    </div>
  );
}

function FindingsPanel({
  findings,
  activeLayers,
  setActiveLayers,
  onFocus,
}: {
  findings: Finding[];
  activeLayers: LayerId[];
  setActiveLayers: (l: LayerId[]) => void;
  onFocus: (keys: string[]) => void;
}) {
  const layers = Object.keys(LAYER_LABEL) as LayerId[];

  return (
    <div className="space-y-4">
      <SectionTitle>layers</SectionTitle>
      <div className="flex flex-wrap gap-1.5">
        {layers
          .filter((l) => findings.some((f) => f.layer === l) || activeLayers.includes(l))
          .map((l) => {
            const on = activeLayers.includes(l);
            return (
              <button
                key={l}
                onClick={() => setActiveLayers(on ? activeLayers.filter((x) => x !== l) : [...activeLayers, l])}
                className={cn(
                  "rounded-lg border px-2 py-1 text-[10px] font-light",
                  on ? "border-white/15 bg-white/[0.07] text-foreground/80" : "border-white/[0.06] text-foreground/35",
                )}
              >
                {LAYER_LABEL[l]}
              </button>
            );
          })}
      </div>

      {findings.length === 0 ? (
        <p className="text-[11px] font-light leading-relaxed text-foreground/45">
          nothing to read yet. add bloodwork, medication or a pain report and this becomes the summary of what your body is carrying.
        </p>
      ) : (
        findings.map((f) => (
          <div
            key={f.id}
            className={cn(
              "space-y-1.5 rounded-xl border p-3",
              f.redFlag ? "border-amber-300/25 bg-amber-300/[0.05]" : "border-white/[0.07] bg-white/[0.02]",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-light text-foreground/85">{f.label}</p>
              <span className="text-[9px] uppercase tracking-[0.16em] text-foreground/30">{LAYER_LABEL[f.layer]}</span>
            </div>
            <p className="text-[10px] font-light leading-relaxed text-foreground/55">{f.detail}</p>
            <p className="text-[10px] font-light leading-relaxed text-foreground/45">{f.mechanism}</p>
            <p className="text-[10px] font-light leading-relaxed text-foreground/65">{f.nextStep}</p>
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[9px] font-light text-foreground/30">{f.source}</span>
              {f.territoryKeys.length > 0 && (
                <button onClick={() => onFocus(f.territoryKeys)} className="text-[10px] font-light text-foreground/55 hover:text-foreground/80">
                  look here
                </button>
              )}
            </div>
          </div>
        ))
      )}

      <p className="text-[10px] font-light leading-relaxed text-foreground/30">
        {TERRITORIES.length} anatomical territories are mapped. this room explains and orients — it does not diagnose, and it does not replace a clinician.
      </p>
    </div>
  );
}
