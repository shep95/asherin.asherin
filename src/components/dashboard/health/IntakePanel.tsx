// intake subsystem: genetics files, wearable exports, pasted/scanned bloodwork, and richer
// history entry. every save writes through persist() to the device-local record only.
import { useMemo, useRef, useState } from "react";
import { Dna, FileText, History, Loader2, Trash2, Upload, Watch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { invokeWithByokRetry } from "@/lib/byokInvoke";
import type { HealthPanelProps } from "@/lib/health/panel";
import { newId } from "@/lib/health/store";
import { GENE_DEFS, type GeneEntry } from "@/lib/health/genetics";
import { parseGeneticsFile } from "@/lib/health/import/geneticsFile";
import { parseWearableFile, rollingBaseline, trendDirection } from "@/lib/health/import/wearables";
import { normaliseLabDocument } from "@/lib/health/import/labsDocument";
import { labDef, type LabValue } from "@/lib/health/labs";
import {
  EXPOSURES,
  FAMILY_PRESETS,
  NUTRIENTS,
  SURGERY_PRESETS,
  type ExposureEntry,
  type FamilyEntry,
  type NutritionEntry,
  type SurgeryEntry,
} from "@/lib/health/records";

type Tab = "genetics" | "wearables" | "bloodwork" | "history";

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("that file could not be read."));
    reader.readAsText(file);
  });
}

function readFileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("that file could not be read."));
    reader.readAsDataURL(file);
  });
}

function splitDataUrl(dataUrl: string): { mime: string; b64: string } {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "application/octet-stream";
  return { mime, b64: b64 ?? "" };
}

export default function IntakePanel({ record, persist, onEvent, resolveByok }: HealthPanelProps) {
  const [tab, setTab] = useState<Tab>("genetics");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-1.5">
        {([
          ["genetics", "genetics", Dna],
          ["wearables", "wearables", Watch],
          ["bloodwork", "bloodwork", FileText],
          ["history", "history", History],
        ] as [Tab, string, typeof Dna][]).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[10px] font-light transition-colors",
              tab === id
                ? "border-amber-400/30 bg-amber-400/[0.06] text-amber-100/90"
                : "border-white/[0.06] bg-white/[0.02] text-foreground/50 hover:bg-white/[0.04]",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "genetics" && <GeneticsTab record={record} persist={persist} onEvent={onEvent} />}
      {tab === "wearables" && <WearablesTab record={record} persist={persist} onEvent={onEvent} />}
      {tab === "bloodwork" && <BloodworkTab record={record} persist={persist} onEvent={onEvent} resolveByok={resolveByok} />}
      {tab === "history" && <HistoryTab record={record} persist={persist} onEvent={onEvent} />}
    </div>
  );
}

// ───────────────────────────── genetics ─────────────────────────────

function GeneticsTab({ record, persist, onEvent }: Pick<HealthPanelProps, "record" | "persist" | "onEvent">) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ entries: GeneEntry[]; variantsRead: number; mapped: number; unmapped: number; knownButUncatalogued: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const text = await readFileText(file);
      const result = await parseGeneticsFile(file.name, text);
      if (result.error) {
        setError(result.error);
        return;
      }
      setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "that file could not be parsed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = () => {
    if (!preview || preview.entries.length === 0) return;
    const existing = new Set(record.genes.map((g) => g.geneKey ?? g.name));
    const additions = preview.entries.filter((e) => !existing.has(e.geneKey ?? e.name));
    if (additions.length === 0) {
      toast.info("every mapped variant here is already in your record.");
      return;
    }
    persist({ ...record, genes: [...record.genes, ...additions] });
    onEvent?.(
      `${additions.length} new genetic variant${additions.length === 1 ? "" : "s"} were just imported and mapped to your gene record. ` +
        `explain what each of these means for the body, and where the uncertainty is.`,
    );
    toast.success(`${additions.length} variant${additions.length === 1 ? "" : "s"} saved.`);
    setPreview(null);
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-light leading-relaxed text-foreground/50">
        import a 23andme or ancestrydna raw data export, or a simple vcf file. rsids are mapped against a fixed catalogue —
        anything not recognised is reported rather than guessed at.
      </p>
      <input ref={fileRef} type="file" accept=".txt,.tsv,.csv,.vcf" className="hidden" onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
      <Button variant="outline" size="sm" className="h-8 w-full gap-2 text-[11px]" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {busy ? "reading file" : "choose genetics file"}
      </Button>

      {error && <p className="text-[11px] font-light text-red-300/80">{error}</p>}

      {preview && (
        <div className="space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/35">preview</p>
          <p className="text-[11px] font-light text-foreground/60">
            {preview.variantsRead} variants read · {preview.mapped} mapped to the catalogue · {preview.knownButUncatalogued} known but
            not yet catalogued · {preview.unmapped} unrecognised
          </p>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {preview.entries.map((e) => (
              <p key={e.id} className="text-[11px] font-light text-foreground/75">
                {e.name} <span className="text-foreground/40">· {e.genotype}</span>
              </p>
            ))}
            {preview.entries.length === 0 && <p className="text-[11px] font-light text-foreground/40">no rsids matched the catalogue.</p>}
          </div>
          <Button size="sm" className="h-8 w-full text-[11px]" disabled={preview.entries.length === 0} onClick={save}>
            save {preview.entries.length} mapped variant{preview.entries.length === 1 ? "" : "s"}
          </Button>
        </div>
      )}

      {record.genes.length > 0 && (
        <div className="space-y-1.5 border-t border-white/[0.06] pt-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/35">saved ({record.genes.length})</p>
          {record.genes.map((g) => (
            <div key={g.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.015] px-2 py-1.5">
              <p className="text-[11px] font-light text-foreground/75">
                {g.name} {g.genotype && <span className="text-foreground/40">· {g.genotype}</span>}
              </p>
              <button
                onClick={() => persist({ ...record, genes: record.genes.filter((x) => x.id !== g.id) })}
                className="text-foreground/30 hover:text-red-300/80"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] font-light text-foreground/30">{GENE_DEFS.length} gene entries are in the reference catalogue.</p>
    </div>
  );
}

// ───────────────────────────── wearables ─────────────────────────────

function WearablesTab({ record, persist, onEvent }: Pick<HealthPanelProps, "record" | "persist" | "onEvent">) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setSkipped([]);
    try {
      const text = await readFileText(file);
      const result = await parseWearableFile(file.name, text);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSkipped(result.skipped);
      persist({ ...record, wearables: [...record.wearables, ...result.series] });
      const range = result.series
        .map((s) => `${s.kind} (${s.points.length} points)`)
        .join(", ");
      onEvent?.(
        `${result.series.length} wearable series were just imported: ${range}. explain what these mean and whether anything sits outside a healthy range for a device series like this.`,
      );
      toast.success(`${result.series.length} series imported.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "that file could not be parsed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-light leading-relaxed text-foreground/50">
        import apple health xml exports, oura/whoop csv, dexcom/libre cgm csv, or a generic timestamp + value csv.
        long series are downsampled to daily min/max/mean so nothing freezes.
      </p>
      <input ref={fileRef} type="file" accept=".csv,.tsv,.xml,.txt" className="hidden" onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
      <Button variant="outline" size="sm" className="h-8 w-full gap-2 text-[11px]" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {busy ? "reading file" : "choose wearable/cgm export"}
      </Button>
      {error && <p className="text-[11px] font-light text-red-300/80">{error}</p>}
      {skipped.length > 0 && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-foreground/35">not imported</p>
          {skipped.slice(0, 8).map((s, i) => (
            <p key={i} className="text-[10px] font-light text-foreground/45">{s}</p>
          ))}
        </div>
      )}

      {record.wearables.length > 0 && (
        <div className="space-y-2 border-t border-white/[0.06] pt-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/35">saved series ({record.wearables.length})</p>
          {record.wearables.map((s) => {
            const baseline = rollingBaseline(s);
            const trend = trendDirection(s);
            const from = s.points[0]?.t?.slice(0, 10);
            const to = s.points[s.points.length - 1]?.t?.slice(0, 10);
            return (
              <div key={s.id} className="space-y-1 rounded-lg border border-white/[0.06] bg-white/[0.015] p-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-light text-foreground/75">
                    {s.kind} <span className="text-foreground/40">· {s.source}</span>
                  </p>
                  <button
                    onClick={() => persist({ ...record, wearables: record.wearables.filter((x) => x.id !== s.id) })}
                    className="text-foreground/30 hover:text-red-300/80"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-[10px] font-light text-foreground/40">
                  {s.points.length} points · {from} → {to} · baseline {baseline.mean}{s.unit ? ` ${s.unit}` : ""} (n={baseline.n}) · trend {trend}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── bloodwork ─────────────────────────────

interface LabsReadValue {
  key: string;
  label: string;
  value: number;
  unit?: string;
  refLow?: number;
  refHigh?: number;
  collectedAt?: string;
}

function BloodworkTab({
  record,
  persist,
  onEvent,
  resolveByok,
}: Pick<HealthPanelProps, "record" | "persist" | "onEvent" | "resolveByok">) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof normaliseLabDocument> | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanValues, setScanValues] = useState<LabsReadValue[]>([]);
  const [unreadable, setUnreadable] = useState<string[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const runParse = () => {
    if (!text.trim()) return;
    setPreview(normaliseLabDocument(text));
  };

  const saveText = () => {
    if (!preview || preview.values.length === 0) return;
    const additions: LabValue[] = preview.values.map((v) => ({ key: v.key, value: v.value, takenAt: preview.collectedAt ?? undefined }));
    persist({ ...record, labs: [...record.labs, ...additions] });
    onEvent?.(
      `${additions.length} lab value${additions.length === 1 ? "" : "s"} were just entered from a pasted report. ` +
        `explain what stands out against reference ranges and what territory each implicates.`,
    );
    toast.success(`${additions.length} value${additions.length === 1 ? "" : "s"} saved.`);
    setPreview(null);
    setText("");
  };

  const onScanFile = async (file: File | null) => {
    if (!file) return;
    setScanBusy(true);
    setScanError(null);
    setScanValues([]);
    setUnreadable([]);
    try {
      const dataUrl = await readFileDataUrl(file);
      const { mime, b64 } = splitDataUrl(dataUrl);
      const byok = resolveByok ? await resolveByok() : undefined;
      const data = await invokeWithByokRetry<{ values?: LabsReadValue[]; unreadable?: string[]; error?: string }>("asherin-health-ai", {
        body: { action: "labs.read", document: { mime, b64 }, ...(byok ? { byok } : {}) },
      });
      if (data?.error) throw new Error(data.error);
      setScanValues(data?.values ?? []);
      setUnreadable(data?.unreadable ?? []);
      if (!data?.values || data.values.length === 0) throw new Error("nothing readable came back from that document.");
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "that document could not be read.");
    } finally {
      setScanBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const saveScan = () => {
    const recognised = scanValues.filter((v) => labDef(v.key));
    if (recognised.length === 0) {
      toast.info("none of the read values matched the reference catalogue by key.");
      return;
    }
    const additions: LabValue[] = recognised.map((v) => ({ key: v.key, value: v.value, takenAt: v.collectedAt }));
    persist({ ...record, labs: [...record.labs, ...additions] });
    onEvent?.(
      `${additions.length} lab value${additions.length === 1 ? "" : "s"} were just read from a photographed or scanned report. ` +
        `explain what stands out and what to bring to a clinician.`,
    );
    toast.success(`${additions.length} value${additions.length === 1 ? "" : "s"} saved.`);
    setScanValues([]);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-[11px] font-light leading-relaxed text-foreground/50">
          paste a lab report as text. units are converted where the analyte and unit are both recognised (e.g. mmol/L to mg/dL).
        </p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="paste the report text here…"
          className="min-h-24 rounded-lg border-white/[0.08] bg-white/[0.03] text-[11px]"
        />
        <Button size="sm" variant="outline" className="h-8 w-full text-[11px]" disabled={!text.trim()} onClick={runParse}>
          parse text
        </Button>
        {preview && (
          <div className="space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/35">preview</p>
            <p className="text-[11px] font-light text-foreground/60">
              {preview.values.length} recognised · {preview.unrecognised.length} unrecognised line{preview.unrecognised.length === 1 ? "" : "s"}
              {preview.collectedAt ? ` · collected ${preview.collectedAt.slice(0, 10)}` : ""}
            </p>
            {preview.values.map((v, i) => {
              const def = labDef(v.key);
              return (
                <p key={i} className="text-[11px] font-light text-foreground/75">
                  {def?.label ?? v.key}: {v.value} {def?.unit}
                  {v.rawUnit && <span className="text-foreground/40"> (converted from {v.rawValue} {v.rawUnit})</span>}
                  {v.refLow !== undefined && <span className="text-foreground/40"> · ref {v.refLow}–{v.refHigh}</span>}
                </p>
              );
            })}
            {preview.unrecognised.length > 0 && (
              <div className="border-t border-white/[0.06] pt-1.5">
                {preview.unrecognised.slice(0, 6).map((u, i) => (
                  <p key={i} className="truncate text-[10px] font-light text-foreground/35">{u}</p>
                ))}
              </div>
            )}
            <Button size="sm" className="h-8 w-full text-[11px]" disabled={preview.values.length === 0} onClick={saveText}>
              save {preview.values.length} value{preview.values.length === 1 ? "" : "s"}
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-white/[0.06] pt-4">
        <p className="text-[11px] font-light leading-relaxed text-foreground/50">
          or send a photo or pdf of a report to be read by the assistant's vision model. this leaves the device only for this one read.
        </p>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => void onScanFile(e.target.files?.[0] ?? null)} />
        <Button variant="outline" size="sm" className="h-8 w-full gap-2 text-[11px]" disabled={scanBusy} onClick={() => fileRef.current?.click()}>
          {scanBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {scanBusy ? "reading document" : "scan a lab report"}
        </Button>
        {scanError && <p className="text-[11px] font-light text-red-300/80">{scanError}</p>}
        {scanValues.length > 0 && (
          <div className="space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/35">read from document</p>
            {scanValues.map((v, i) => (
              <p key={i} className="text-[11px] font-light text-foreground/75">
                {v.label} ({v.key}): {v.value} {v.unit ?? ""}
                {v.refLow !== undefined && <span className="text-foreground/40"> · ref {v.refLow}–{v.refHigh}</span>}
                {!labDef(v.key) && <span className="text-amber-200/60"> · not in reference catalogue</span>}
              </p>
            ))}
            {unreadable.length > 0 && (
              <div className="border-t border-white/[0.06] pt-1.5">
                {unreadable.map((u, i) => (
                  <p key={i} className="text-[10px] font-light text-foreground/35">{u}</p>
                ))}
              </div>
            )}
            <Button size="sm" className="h-8 w-full text-[11px]" onClick={saveScan}>
              save recognised values
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────── history ─────────────────────────────

function HistoryTab({ record, persist, onEvent }: Pick<HealthPanelProps, "record" | "persist" | "onEvent">) {
  const [nutrientKey, setNutrientKey] = useState(NUTRIENTS[0]?.key ?? "");
  const [nutrientStatus, setNutrientStatus] = useState<NutritionEntry["status"]>("low");
  const [nutrientNote, setNutrientNote] = useState("");

  const [exposureKey, setExposureKey] = useState(EXPOSURES[0]?.key ?? "");
  const [exposureIntensity, setExposureIntensity] = useState<ExposureEntry["intensity"]>("past");
  const [exposureYears, setExposureYears] = useState("");

  const [surgeryLabel, setSurgeryLabel] = useState("");
  const [surgeryYear, setSurgeryYear] = useState("");

  const [familyCondition, setFamilyCondition] = useState(FAMILY_PRESETS[0]?.condition ?? "");
  const [familyRelation, setFamilyRelation] = useState<FamilyEntry["relation"]>("parent");
  const [familyAge, setFamilyAge] = useState("");

  const addNutrition = () => {
    const entry: NutritionEntry = { id: newId("nutrition"), nutrientKey, status: nutrientStatus, note: nutrientNote.trim() || undefined };
    persist({ ...record, nutrition: [...record.nutrition, entry] });
    onEvent?.(`a nutrition entry (${nutrientKey}, ${nutrientStatus}) was just added. explain what this means and what to check.`);
    setNutrientNote("");
    toast.success("nutrition entry saved.");
  };

  const addExposure = () => {
    const entry: ExposureEntry = {
      id: newId("exposure"),
      exposureKey,
      intensity: exposureIntensity,
      years: exposureYears ? Number(exposureYears) : undefined,
    };
    persist({ ...record, exposures: [...record.exposures, entry] });
    onEvent?.(`an exposure entry (${exposureKey}, ${exposureIntensity}) was just added. explain the mechanism and territory involved.`);
    setExposureYears("");
    toast.success("exposure entry saved.");
  };

  const addSurgery = () => {
    const label = surgeryLabel.trim();
    if (!label) return;
    const preset = SURGERY_PRESETS.find((p) => p.label === label.toLowerCase());
    const entry: SurgeryEntry = {
      id: newId("surgery"),
      label,
      year: surgeryYear ? Number(surgeryYear) : undefined,
      territoryKeys: preset?.territoryKeys ?? [],
    };
    persist({ ...record, surgeries: [...record.surgeries, entry] });
    onEvent?.(`a surgical history entry (${label}) was just added. explain how this changes the reference anatomy.`);
    setSurgeryLabel("");
    setSurgeryYear("");
    toast.success("surgery entry saved.");
  };

  const addFamily = () => {
    const preset = FAMILY_PRESETS.find((p) => p.condition === familyCondition.toLowerCase());
    const entry: FamilyEntry = {
      id: newId("family"),
      condition: familyCondition,
      relation: familyRelation,
      ageAtOnset: familyAge ? Number(familyAge) : undefined,
      territoryKeys: preset?.territoryKeys ?? [],
    };
    persist({ ...record, family: [...record.family, entry] });
    onEvent?.(`a family history entry (${familyCondition}, ${familyRelation}) was just added. explain what it should shift in screening.`);
    setFamilyAge("");
    toast.success("family history entry saved.");
  };

  return (
    <div className="space-y-5">
      <HistorySection title="nutrition">
        <select value={nutrientKey} onChange={(e) => setNutrientKey(e.target.value)} className="h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] text-foreground/80">
          {NUTRIENTS.map((n) => (
            <option key={n.key} value={n.key}>{n.label}</option>
          ))}
        </select>
        <select value={nutrientStatus} onChange={(e) => setNutrientStatus(e.target.value as NutritionEntry["status"])} className="h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] text-foreground/80">
          <option value="low">low</option>
          <option value="adequate">adequate</option>
          <option value="high">high</option>
        </select>
        <Input value={nutrientNote} onChange={(e) => setNutrientNote(e.target.value)} placeholder="note (optional)" className="h-8 rounded-lg border-white/[0.08] bg-white/[0.03] text-[11px]" />
        <Button size="sm" className="h-8 w-full text-[11px]" onClick={addNutrition}>add nutrition entry</Button>
        {record.nutrition.map((e) => (
          <EntryRow key={e.id} label={`${e.nutrientKey} · ${e.status}${e.note ? ` · ${e.note}` : ""}`} onDelete={() => persist({ ...record, nutrition: record.nutrition.filter((x) => x.id !== e.id) })} />
        ))}
      </HistorySection>

      <HistorySection title="exposures">
        <select value={exposureKey} onChange={(e) => setExposureKey(e.target.value)} className="h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] text-foreground/80">
          {EXPOSURES.map((x) => (
            <option key={x.key} value={x.key}>{x.label}</option>
          ))}
        </select>
        <select value={exposureIntensity} onChange={(e) => setExposureIntensity(e.target.value as ExposureEntry["intensity"])} className="h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] text-foreground/80">
          <option value="past">past</option>
          <option value="current-low">current — low</option>
          <option value="current-high">current — high</option>
        </select>
        <Input type="number" value={exposureYears} onChange={(e) => setExposureYears(e.target.value)} placeholder="years (optional)" className="h-8 rounded-lg border-white/[0.08] bg-white/[0.03] text-[11px]" />
        <Button size="sm" className="h-8 w-full text-[11px]" onClick={addExposure}>add exposure entry</Button>
        {record.exposures.map((e) => (
          <EntryRow key={e.id} label={`${e.exposureKey} · ${e.intensity}${e.years ? ` · ${e.years}y` : ""}`} onDelete={() => persist({ ...record, exposures: record.exposures.filter((x) => x.id !== e.id) })} />
        ))}
      </HistorySection>

      <HistorySection title="surgeries">
        <Input value={surgeryLabel} onChange={(e) => setSurgeryLabel(e.target.value)} placeholder="procedure (e.g. cholecystectomy)" list="surgery-presets" className="h-8 rounded-lg border-white/[0.08] bg-white/[0.03] text-[11px]" />
        <datalist id="surgery-presets">
          {SURGERY_PRESETS.map((p) => (
            <option key={p.label} value={p.label} />
          ))}
        </datalist>
        <Input type="number" value={surgeryYear} onChange={(e) => setSurgeryYear(e.target.value)} placeholder="year (optional)" className="h-8 rounded-lg border-white/[0.08] bg-white/[0.03] text-[11px]" />
        <Button size="sm" className="h-8 w-full text-[11px]" onClick={addSurgery}>add surgery entry</Button>
        {record.surgeries.map((e) => (
          <EntryRow key={e.id} label={`${e.label}${e.year ? ` · ${e.year}` : ""}`} onDelete={() => persist({ ...record, surgeries: record.surgeries.filter((x) => x.id !== e.id) })} />
        ))}
      </HistorySection>

      <HistorySection title="family history">
        <Input value={familyCondition} onChange={(e) => setFamilyCondition(e.target.value)} placeholder="condition" list="family-presets" className="h-8 rounded-lg border-white/[0.08] bg-white/[0.03] text-[11px]" />
        <datalist id="family-presets">
          {FAMILY_PRESETS.map((p) => (
            <option key={p.condition} value={p.condition} />
          ))}
        </datalist>
        <select value={familyRelation} onChange={(e) => setFamilyRelation(e.target.value as FamilyEntry["relation"])} className="h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] text-foreground/80">
          <option value="parent">parent</option>
          <option value="sibling">sibling</option>
          <option value="grandparent">grandparent</option>
          <option value="child">child</option>
          <option value="other">other</option>
        </select>
        <Input type="number" value={familyAge} onChange={(e) => setFamilyAge(e.target.value)} placeholder="age at onset (optional)" className="h-8 rounded-lg border-white/[0.08] bg-white/[0.03] text-[11px]" />
        <Button size="sm" className="h-8 w-full text-[11px]" disabled={!familyCondition.trim()} onClick={addFamily}>add family history entry</Button>
        {record.family.map((e) => (
          <EntryRow key={e.id} label={`${e.condition} · ${e.relation}${e.ageAtOnset ? ` · onset ${e.ageAtOnset}` : ""}`} onDelete={() => persist({ ...record, family: record.family.filter((x) => x.id !== e.id) })} />
        ))}
      </HistorySection>
    </div>
  );
}

function HistorySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/35">{title}</p>
      {children}
    </div>
  );
}

function EntryRow({ label, onDelete }: { label: string; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.015] px-2 py-1.5">
      <p className="text-[11px] font-light text-foreground/75">{label}</p>
      <button onClick={onDelete} className="text-foreground/30 hover:text-red-300/80">
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
