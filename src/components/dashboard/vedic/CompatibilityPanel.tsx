import { useEffect, useMemo, useState } from "react";
import { Heart, Loader2, Scale, X } from "lucide-react";
import { compareCharts, chartFromCountry, chartFromSaved, type CompatResult } from "@/lib/vedic/compatibility";
import { COUNTRY_CHARTS } from "@/data/vedic/countryCharts";
import type { SweVedicChart } from "@/lib/vedic/sweChart";

interface SavedChart {
  id: string;
  name: string;
  birth_date: string;
  birth_time: string;
  tz_offset: number;
  latitude: number;
  longitude: number;
  city_label: string | null;
}

interface Props {
  /** "left" chart — typically the user's currently active chart */
  baseChart: SweVedicChart | null;
  baseLabel: string;
  /** Optional saved-chart list so the user can pick another one */
  savedCharts: SavedChart[];
  onClose?: () => void;
}

type Mode = "country" | "saved";

export default function CompatibilityPanel({ baseChart, baseLabel, savedCharts, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("country");
  const [targetCountry, setTargetCountry] = useState<string>("US");
  const [targetSavedId, setTargetSavedId] = useState<string>(savedCharts[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompatResult | null>(null);
  const [otherLabel, setOtherLabel] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const targetSaved = useMemo(() => savedCharts.find((s) => s.id === targetSavedId), [savedCharts, targetSavedId]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!baseChart) return;
      setLoading(true); setErr(null); setResult(null);
      try {
        let other: SweVedicChart | null = null;
        let label = "";
        if (mode === "country") {
          const c = COUNTRY_CHARTS.find((x) => x.code === targetCountry);
          if (!c) throw new Error("Pick a country");
          other = await chartFromCountry(c);
          label = `${c.flag} ${c.name}`;
        } else {
          if (!targetSaved) throw new Error("Pick a saved chart");
          other = await chartFromSaved(targetSaved);
          label = targetSaved.name;
        }
        const r = await compareCharts(baseChart, other);
        if (!cancelled) { setResult(r); setOtherLabel(label); }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Failed to compute");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => { cancelled = true; };
  }, [baseChart, mode, targetCountry, targetSavedId]);

  if (!baseChart) {
    return (
      <div className="rounded-xl border border-border/30 bg-background/40 p-5 text-xs text-muted-foreground">
        Generate or load a chart first to enable compatibility comparison.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-5 space-y-4">
      <div className="flex items-center gap-2 border-b border-border/15 pb-3">
        <Heart className="h-4 w-4 text-foreground/70" />
        <h3 className="text-sm font-light tracking-[0.15em] text-foreground uppercase">Chart Compatibility</h3>
        {onClose && (
          <button onClick={onClose} className="ml-auto p-1 text-muted-foreground hover:text-foreground transition" aria-label="Close compatibility">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-center">
        <div className="rounded-lg border border-border/25 bg-background/30 px-3 py-2">
          <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">Base</div>
          <div className="text-sm text-foreground/95 font-light truncate">{baseLabel}</div>
        </div>
        <Scale className="h-4 w-4 text-muted-foreground/60 mx-auto" />
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            <button onClick={() => setMode("country")} className={`px-2 py-1 rounded uppercase tracking-wider border ${mode === "country" ? "border-foreground/40 text-foreground bg-foreground/[0.06]" : "border-border/25 text-muted-foreground"}`}>Country</button>
            <button onClick={() => setMode("saved")}   className={`px-2 py-1 rounded uppercase tracking-wider border ${mode === "saved" ? "border-foreground/40 text-foreground bg-foreground/[0.06]" : "border-border/25 text-muted-foreground"}`}>Saved</button>
          </div>
          {mode === "country" ? (
            <select value={targetCountry} onChange={(e) => setTargetCountry(e.target.value)} className="w-full rounded-md border border-border/30 bg-background/40 px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-foreground/40">
              {COUNTRY_CHARTS.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
            </select>
          ) : (
            <select value={targetSavedId} onChange={(e) => setTargetSavedId(e.target.value)} className="w-full rounded-md border border-border/30 bg-background/40 px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-foreground/40">
              {savedCharts.length === 0 && <option value="">No saved charts</option>}
              {savedCharts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Computing synastry…</div>
      )}
      {err && <div className="text-xs text-destructive">{err}</div>}

      {result && !loading && (
        <div className="space-y-4">
          {/* SCORE BANNER */}
          <div className="rounded-lg border border-border/25 bg-background/30 p-4 flex items-center gap-4">
            <div className="text-5xl font-extralight text-foreground tabular-nums">{result.pct}<span className="text-lg text-muted-foreground/60">%</span></div>
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-wider text-muted-foreground/70">Compatibility · with {otherLabel}</div>
              <div className="text-sm text-foreground/95 font-light mt-0.5">{result.verdict}</div>
              <div className="text-[11px] text-muted-foreground/80 mt-1">Element bridge: {result.elementA} ↔ {result.elementB} · Total {result.total.toFixed(1)} / 36</div>
            </div>
          </div>

          {/* HIGHLIGHTS */}
          {result.highlights.length > 0 && (
            <div className="space-y-1">
              {result.highlights.map((h, i) => (
                <div key={i} className="text-[11px] text-foreground/80 px-3 py-1.5 rounded border border-border/20 bg-background/20">{h}</div>
              ))}
            </div>
          )}

          {/* BREAKDOWN */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(result.breakdown).map(([k, v]) => {
              const pct = (v.score / v.max) * 100;
              return (
                <div key={k} className="rounded border border-border/20 bg-background/25 p-2.5">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider">
                    <span className="text-muted-foreground/80">{k}</span>
                    <span className="text-foreground/90 tabular-nums">{v.score.toFixed(1)} / {v.max}</span>
                  </div>
                  <div className="mt-1.5 h-1 rounded bg-foreground/10 overflow-hidden">
                    <div className="h-full bg-foreground/55" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 mt-1 italic truncate">{v.note}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
