// guided pain interview: point at the body, answer adaptive questions, see red flags
// first, and leave with a copyable non-diagnostic package.
import { useMemo, useState } from "react";
import { AlertTriangle, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { HealthPanelProps } from "@/lib/health/panel";
import { newId } from "@/lib/health/store";
import { TERRITORIES } from "@/lib/health/territory";
import {
  nextQuestions,
  painOutput,
  painPattern,
  rankFlags,
  triggeredFlagsExtended,
  type BodySide,
  type PainDepth,
  type PainPoint,
  type PainReport,
} from "@/lib/health/pain";

const DEPTHS: { value: PainDepth; label: string }[] = [
  { value: "surface", label: "surface / skin" },
  { value: "deep", label: "deep tissue" },
  { value: "boney", label: "boney" },
  { value: "visceral", label: "deep / visceral" },
];

const SIDES: { value: BodySide; label: string }[] = [
  { value: "left", label: "left" },
  { value: "right", label: "right" },
  { value: "midline", label: "midline" },
];

function emptyReport(): PainReport {
  return { id: newId("pain"), territoryKeys: [], answers: {}, createdAt: new Date().toISOString(), points: [], modifiers: { worse: [], better: [] } };
}

export default function PainStudioPanel({ record, persist, onEvent, onHighlights }: HealthPanelProps) {
  const [draft, setDraft] = useState<PainReport>(emptyReport());
  const [region, setRegion] = useState("");
  const [side, setSide] = useState<BodySide>("midline");
  const [depth, setDepth] = useState<PainDepth>("surface");
  const [editingId, setEditingId] = useState<string | null>(null);

  const flags = useMemo(() => rankFlags(triggeredFlagsExtended(draft)), [draft]);
  const pattern = useMemo(() => painPattern(draft), [draft]);
  const questions = useMemo(() => nextQuestions(draft), [draft]);

  const addPoint = () => {
    const territory = TERRITORIES.find((t) => t.key === region);
    if (!territory) {
      toast.error("choose a region first.");
      return;
    }
    const point: PainPoint = { id: newId("pt"), territoryKey: territory.key, territoryLabel: territory.label, side, depth };
    setDraft((d) => ({ ...d, points: [...(d.points ?? []), point], territoryKeys: [...new Set([...d.territoryKeys, territory.key])], partName: territory.label }));
  };

  const removePoint = (id: string) => {
    setDraft((d) => ({ ...d, points: (d.points ?? []).filter((p) => p.id !== id) }));
  };

  const setAnswer = (id: string, value: string | string[] | number) => {
    setDraft((d) => ({ ...d, answers: { ...d.answers, [id]: value } }));
  };

  const toggleMulti = (id: string, value: string) => {
    setDraft((d) => {
      const cur = (d.answers[id] as string[] | undefined) ?? [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      return { ...d, answers: { ...d.answers, [id]: next } };
    });
  };

  const save = () => {
    if ((draft.points ?? []).length === 0 && !draft.partName) {
      toast.error("add at least one point on the body first.");
      return;
    }
    const existing = record.pain.some((p) => p.id === draft.id);
    const nextPain = existing ? record.pain.map((p) => (p.id === draft.id ? draft : p)) : [...record.pain, draft];
    persist({ ...record, pain: nextPain });
    onHighlights?.(
      (draft.points ?? []).map((p) => ({
        partIds: [],
        color: (draft.intensityWorst ?? Number(draft.answers.severity ?? 5)) >= 6 ? "#e0402a" : "#e78a2e",
        intensity: Math.max(0.4, Math.min(1, (draft.intensityWorst ?? Number(draft.answers.severity ?? 5)) / 10)),
        label: `pain · ${p.territoryLabel ?? p.territoryKey}`,
        reason: pattern[0]?.reasoning[0] ?? "reported pain",
        source: "your pain report",
      })),
    );
    onEvent?.(`a pain report for ${draft.partName ?? "an area"} was just saved. read the pattern and flags and explain them plainly.`);
    toast.success("pain report saved.");
    setDraft(emptyReport());
    setEditingId(null);
  };

  const edit = (r: PainReport) => {
    setDraft(r);
    setEditingId(r.id);
  };

  const remove = (id: string) => {
    persist({ ...record, pain: record.pain.filter((p) => p.id !== id) });
  };

  const output = painOutput(draft);

  const copy = async () => {
    await navigator.clipboard.writeText(output.markdown);
    toast.success("copied.");
  };

  return (
    <div className="space-y-5">
      <p className="text-[11px] font-light leading-relaxed text-foreground/50">
        point at where it hurts, describe it, and this builds a written package you can bring to a clinician. it never
        names a disease.
      </p>

      {flags.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-amber-400/40 bg-amber-400/[0.08] p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" /> see a clinician
          </p>
          {flags.map((f) => (
            <p key={f.key} className="text-[11px] font-light leading-relaxed text-amber-200/90">
              <span className="uppercase text-[9px] tracking-widest text-amber-300/80">{f.urgency}</span> — {f.label}. {f.action}
            </p>
          ))}
        </div>
      )}

      <div className="space-y-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
        <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/35">where does it hurt</p>
        <div className="grid grid-cols-3 gap-2">
          <select value={region} onChange={(e) => setRegion(e.target.value)} className="col-span-3 h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] text-foreground/80 sm:col-span-1">
            <option value="">region…</option>
            {TERRITORIES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <select value={side} onChange={(e) => setSide(e.target.value as BodySide)} className="h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] text-foreground/80">
            {SIDES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select value={depth} onChange={(e) => setDepth(e.target.value as PainDepth)} className="h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] text-foreground/80">
            {DEPTHS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[10px]" onClick={addPoint}>
          <Plus className="h-3 w-3" /> add point
        </Button>
        <div className="flex flex-wrap gap-1.5">
          {(draft.points ?? []).map((p) => (
            <span key={p.id} className="flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] text-foreground/70">
              {p.territoryLabel ?? p.territoryKey} · {p.side} · {p.depth}
              <button onClick={() => removePoint(p.id)} className="text-foreground/40 hover:text-foreground/80">
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
        <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/35">next questions</p>
        {questions.map((q) => (
          <div key={q.id} className="space-y-1.5">
            <p className="text-[11px] font-light text-foreground/70">{q.prompt}</p>
            {q.type === "scale" ? (
              <Slider
                min={0}
                max={10}
                step={1}
                value={[Number(draft.answers[q.id] ?? draft.intensityWorst ?? 5)]}
                onValueChange={([v]) => {
                  setAnswer(q.id, v);
                  setDraft((d) => ({ ...d, intensityWorst: v }));
                }}
              />
            ) : q.type === "text" ? (
              <Input
                defaultValue={String(draft.answers[q.id] ?? "")}
                onBlur={(e) => setAnswer(q.id, e.target.value)}
                className="h-8 rounded-lg border-white/[0.08] bg-white/[0.03] text-[11px]"
                placeholder={q.id === "duration" ? "e.g. three weeks" : undefined}
              />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(q.options ?? []).map((o) => {
                  const chosen = q.type === "multi" ? ((draft.answers[q.id] as string[] | undefined) ?? []).includes(o.value) : draft.answers[q.id] === o.value;
                  return (
                    <button
                      key={o.value}
                      onClick={() => (q.type === "multi" ? toggleMulti(q.id, o.value) : setAnswer(q.id, o.value))}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[10px] font-light",
                        chosen ? "border-amber-400/50 bg-amber-400/10 text-amber-200" : "border-white/[0.08] bg-white/[0.02] text-foreground/60",
                      )}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(["intensityNow", "intensityWorst", "intensityLeast"] as const).map((k) => (
          <div key={k} className="space-y-1">
            <p className="text-[9px] uppercase tracking-widest text-foreground/35">{k.replace("intensity", "").toLowerCase()}</p>
            <Slider min={0} max={10} step={1} value={[draft[k] ?? 0]} onValueChange={([v]) => setDraft((d) => ({ ...d, [k]: v }))} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Textarea
          placeholder="what makes it worse (comma separated)"
          defaultValue={(draft.modifiers?.worse ?? []).join(", ")}
          onBlur={(e) => setDraft((d) => ({ ...d, modifiers: { worse: e.target.value.split(",").map((s) => s.trim()).filter(Boolean), better: d.modifiers?.better ?? [] } }))}
          className="h-16 rounded-lg border-white/[0.08] bg-white/[0.03] text-[11px]"
        />
        <Textarea
          placeholder="what makes it better (comma separated)"
          defaultValue={(draft.modifiers?.better ?? []).join(", ")}
          onBlur={(e) => setDraft((d) => ({ ...d, modifiers: { better: e.target.value.split(",").map((s) => s.trim()).filter(Boolean), worse: d.modifiers?.worse ?? [] } }))}
          className="h-16 rounded-lg border-white/[0.08] bg-white/[0.03] text-[11px]"
        />
      </div>

      <div className="space-y-1.5 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
        <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/35">ranked read (not a diagnosis)</p>
        {pattern.map((c) => (
          <p key={c.tissue} className="text-[11px] font-light leading-relaxed text-foreground/60">
            <span className="text-foreground/85">{c.label}</span> — {Math.round(c.confidence * 100)}%. {c.reasoning[0]}
          </p>
        ))}
      </div>

      <div className="flex gap-2">
        <Button size="sm" className="h-8 flex-1 text-[11px]" onClick={save}>
          {editingId ? "update report" : "save report"}
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[11px]" onClick={copy}>
          <Copy className="h-3.5 w-3.5" /> copy
        </Button>
      </div>

      {record.pain.length > 0 && (
        <div className="space-y-2 border-t border-white/[0.06] pt-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/35">saved reports</p>
          {record.pain.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] p-2">
              <button className="text-left text-[11px] font-light text-foreground/70" onClick={() => edit(r)}>
                {r.partName ?? "unlocated"} · {new Date(r.createdAt).toLocaleDateString()}
              </button>
              <button onClick={() => remove(r.id)} className="text-foreground/30 hover:text-foreground/70">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
