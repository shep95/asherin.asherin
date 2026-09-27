// browse the herbal and supplement catalogue by tradition or by the body territory it acts
// on, then check what a person actually takes against their medications before it is added
// to the record. blocking warnings always show before anything else.
import { useMemo, useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { HealthPanelProps } from "@/lib/health/panel";
import { newId } from "@/lib/health/store";
import { TERRITORIES } from "@/lib/health/territory";
import {
  HERBS,
  safetyReview,
  type HerbDef,
  type Tradition,
} from "@/lib/health/herbs";

const TRADITIONS: Tradition[] = [
  "western herbal",
  "ayurveda",
  "traditional chinese",
  "unani",
  "indigenous north american",
  "african traditional",
  "japanese kampo",
];

const EVIDENCE_LABEL: Record<HerbDef["evidence"], string> = {
  "clinical-trials": "clinical trials",
  mixed: "mixed evidence",
  "traditional-only": "traditional use only",
};

type BrowseMode = "tradition" | "territory";

export default function HerbalPanel({ record, persist, onEvent, onHighlights }: HealthPanelProps) {
  const [mode, setMode] = useState<BrowseMode>("tradition");
  const [tradition, setTradition] = useState<Tradition>("western herbal");
  const [territoryKey, setTerritoryKey] = useState("");
  const [conditionsText, setConditionsText] = useState("");
  const [pregnant, setPregnant] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const shown = useMemo(() => {
    if (mode === "tradition") return HERBS.filter((h) => h.tradition === tradition);
    if (!territoryKey) return [];
    return HERBS.filter((h) => h.territoryKeys.includes(territoryKey));
  }, [mode, tradition, territoryKey]);

  const conditions = useMemo(
    () => conditionsText.split(",").map((c) => c.trim()).filter(Boolean),
    [conditionsText],
  );

  const review = useMemo(
    () =>
      safetyReview(record.herbs, {
        medications: record.medications.map((m) => ({ name: m.name, drugKey: m.drugKey })),
        pregnant,
        conditions,
      }),
    [record.herbs, record.medications, pregnant, conditions],
  );

  const previewReview = (herb: HerbDef) =>
    safetyReview([...record.herbs, herb.key].filter((k, i, arr) => arr.indexOf(k) === i), {
      medications: record.medications.map((m) => ({ name: m.name, drugKey: m.drugKey })),
      pregnant,
      conditions,
    });

  const addHerb = (herb: HerbDef) => {
    if (record.herbs.includes(herb.key)) {
      toast.error("already on your list.");
      return;
    }
    const check = previewReview(herb);
    const newBlocking = check.blocking.filter((w) => !review.blocking.some((r) => r.detail === w.detail));
    persist({ ...record, herbs: [...record.herbs, herb.key] });
    onHighlights?.(
      herb.territoryKeys.map((k) => ({
        partIds: [],
        color: "#4f9e86",
        intensity: 0.5,
        label: herb.label,
        reason: herb.mechanism,
        source: `herbal reference · ${herb.latin}`,
      })),
    );
    onEvent?.(`${herb.label} was just added to the herb list. explain its evidence tier and mechanism plainly, and mention any interaction with what is already recorded.`);
    if (newBlocking.length > 0) {
      toast.error(`added — but ${newBlocking[0].detail}`);
    } else {
      toast.success(`${herb.label} added.`);
    }
  };

  const removeHerb = (key: string) => {
    persist({ ...record, herbs: record.herbs.filter((k) => k !== key) });
  };

  return (
    <div className="space-y-5">
      <p className="text-[11px] font-light leading-relaxed text-foreground/50">
        browse the catalogue by tradition or by the part of the body a herb acts on. adding one to your list checks it
        against your medications, conditions and pregnancy status — nothing here is a prescription.
      </p>

      {review.blocking.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-amber-400/40 bg-amber-400/[0.08] p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" /> blocking — review before continuing
          </p>
          {review.blocking.map((w, i) => (
            <p key={`${w.herb}-${i}`} className="text-[11px] font-light leading-relaxed text-amber-200/90">
              {w.detail}
            </p>
          ))}
        </div>
      )}
      {review.cautions.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/35">cautions</p>
          {review.cautions.map((w, i) => (
            <p key={`${w.herb}-${i}`} className="text-[11px] font-light leading-relaxed text-foreground/60">
              {w.detail}
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
        <Input
          placeholder="conditions, comma separated (for safety review only)"
          value={conditionsText}
          onChange={(e) => setConditionsText(e.target.value)}
          className="col-span-2 h-8 rounded-lg border-white/[0.08] bg-white/[0.03] text-[11px] sm:col-span-1"
        />
        <label className="flex items-center gap-1.5 text-[11px] font-light text-foreground/60">
          <input type="checkbox" checked={pregnant} onChange={(e) => setPregnant(e.target.checked)} className="h-3.5 w-3.5" />
          pregnant
        </label>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant={mode === "tradition" ? "default" : "outline"} className="h-7 text-[10px]" onClick={() => setMode("tradition")}>
          by tradition
        </Button>
        <Button size="sm" variant={mode === "territory" ? "default" : "outline"} className="h-7 text-[10px]" onClick={() => setMode("territory")}>
          by body territory
        </Button>
      </div>

      {mode === "tradition" ? (
        <div className="flex flex-wrap gap-1.5">
          {TRADITIONS.map((t) => (
            <button
              key={t}
              onClick={() => setTradition(t)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] font-light capitalize",
                tradition === t ? "border-amber-400/50 bg-amber-400/10 text-amber-200" : "border-white/[0.08] bg-white/[0.02] text-foreground/60",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      ) : (
        <select
          value={territoryKey}
          onChange={(e) => setTerritoryKey(e.target.value)}
          className="h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] text-foreground/80"
        >
          <option value="">choose a territory…</option>
          {TERRITORIES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      )}

      <div className="space-y-2">
        {shown.length === 0 && (
          <p className="text-[11px] font-light text-foreground/40">
            {mode === "territory" && !territoryKey ? "choose a territory to see the herbs that act there." : "nothing in this group."}
          </p>
        )}
        {shown.map((h) => {
          const already = record.herbs.includes(h.key);
          const open = expandedKey === h.key;
          return (
            <div key={h.key} className="space-y-1.5 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
              <button className="flex w-full items-center justify-between text-left" onClick={() => setExpandedKey(open ? null : h.key)}>
                <span className="text-[12px] font-light text-foreground/85">
                  {h.label} <span className="text-foreground/40">· {h.latin}</span>
                </span>
                <span className="text-[9px] uppercase tracking-widest text-foreground/40">{EVIDENCE_LABEL[h.evidence]}</span>
              </button>
              {open && (
                <div className="space-y-1.5 border-t border-white/[0.06] pt-2">
                  <p className="text-[11px] font-light leading-relaxed text-foreground/60">
                    <span className="text-foreground/80">constituents:</span> {h.constituents.join(", ")}
                  </p>
                  <p className="text-[11px] font-light leading-relaxed text-foreground/60">
                    <span className="text-foreground/80">mechanism:</span> {h.mechanism}
                  </p>
                  <p className="text-[11px] font-light leading-relaxed text-foreground/60">
                    <span className="text-foreground/80">evidence:</span> {h.evidenceNote}
                  </p>
                  <p className="text-[11px] font-light leading-relaxed text-foreground/60">
                    <span className="text-foreground/80">typical form:</span> {h.typicalForm}
                  </p>
                  {h.contraindications.length > 0 && (
                    <p className="text-[11px] font-light leading-relaxed text-foreground/60">
                      <span className="text-foreground/80">avoid if:</span> {h.contraindications.join("; ")}
                    </p>
                  )}
                </div>
              )}
              <div className="flex justify-end">
                <Button size="sm" variant={already ? "outline" : "default"} disabled={already} className="h-7 gap-1.5 text-[10px]" onClick={() => addHerb(h)}>
                  <Plus className="h-3 w-3" /> {already ? "on your list" : "add to my list"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {record.herbs.length > 0 && (
        <div className="space-y-2 border-t border-white/[0.06] pt-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/35">on your list</p>
          {record.herbs.map((key) => {
            const h = HERBS.find((x) => x.key === key);
            return (
              <div key={key} className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] p-2">
                <span className="text-[11px] font-light text-foreground/70">{h?.label ?? key}</span>
                <button onClick={() => removeHerb(key)} className="text-foreground/30 hover:text-foreground/70">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
