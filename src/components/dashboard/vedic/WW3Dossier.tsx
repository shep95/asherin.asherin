import { useState } from "react";
import { Skull, Eye, ChevronDown, Crown, Swords, Moon, Zap } from "lucide-react";
import { WW3_DOSSIER } from "@/data/vedic/globalPredictions";

export default function WW3Dossier() {
  const [open, setOpen] = useState(true);
  const d = WW3_DOSSIER;

  return (
    <div className="rounded-xl border border-red-500/30 bg-gradient-to-br from-red-500/[0.05] via-background/60 to-background/40 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-foreground/[0.02] transition border-b border-border/15">
        <Skull className="h-5 w-5 text-red-500/80" />
        <div className="flex-1">
          <div className="text-sm font-light tracking-[0.15em] uppercase text-foreground">WW3 Dossier · Detailed Forecast</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-red-400/70 mt-0.5">{d.classification}</div>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="p-5 space-y-4">
          {/* Key milestones */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { t: "Start", c: d.start.date,   d: d.start.detail,   sub: `Trigger · ${d.start.trigger}`, locus: d.start.locus, color: "border-amber-500/30 bg-amber-500/[0.04]" },
              { t: "Ignition", c: d.ignition.date, d: d.ignition.detail, sub: "", locus: "", color: "border-orange-500/30 bg-orange-500/[0.04]" },
              { t: "Peak", c: d.peak.date,     d: d.peak.detail,    sub: `Casualties · ${d.peak.casualties}`, locus: "", color: "border-red-500/30 bg-red-500/[0.05]" },
              { t: "Turning", c: d.turning.date, d: d.turning.detail, sub: "", locus: "", color: "border-violet-500/30 bg-violet-500/[0.04]" },
              { t: "End", c: d.end.date,       d: d.end.detail,     sub: "", locus: "", color: "border-emerald-500/30 bg-emerald-500/[0.04]" },
            ].map((m) => (
              <div key={m.t} className={`rounded-lg border ${m.color} p-3`}>
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-foreground/70">
                  <span>{m.t}</span><span className="tabular-nums">{m.c}</span>
                </div>
                <div className="text-[12px] text-foreground/90 mt-1.5 leading-relaxed">{m.d}</div>
                {m.locus && <div className="text-[11px] text-muted-foreground/80 italic mt-1">Locus · {m.locus}</div>}
                {m.sub && <div className="text-[11px] text-muted-foreground/80 italic mt-1">{m.sub}</div>}
              </div>
            ))}
          </div>

          {/* Phases */}
          <div className="rounded-lg border border-border/25 bg-background/30 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Swords className="h-4 w-4 text-foreground/70" />
              <span className="text-xs font-light tracking-[0.18em] uppercase text-foreground/85">7 Phases</span>
            </div>
            <div className="space-y-2">
              {d.phases.map((p, i) => (
                <div key={i} className="grid grid-cols-[140px_1fr] gap-3 rounded border border-border/20 bg-background/30 p-2.5">
                  <div>
                    <div className="text-[11px] tabular-nums text-foreground/90">{p.window}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mt-0.5">{p.phase}</div>
                  </div>
                  <div>
                    <div className="text-[12px] text-foreground/90">{p.detail}</div>
                    <div className="text-[11px] text-muted-foreground/80 italic mt-1">Trigger · {p.trigger}</div>
                    <div className="text-[10px] uppercase tracking-wider text-amber-400/80 mt-1">Vedic · {p.vedic}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Eclipses */}
          <div className="rounded-lg border border-violet-500/25 bg-violet-500/[0.03] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Moon className="h-4 w-4 text-violet-400/80" />
              <span className="text-xs font-light tracking-[0.18em] uppercase text-foreground/85">Solar / Lunar Eclipse Triggers</span>
            </div>
            <div className="space-y-2">
              {d.eclipses.map((e, i) => (
                <div key={i} className="rounded border border-border/20 bg-background/30 p-2.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] tabular-nums text-foreground/90">{e.date}</span>
                    <span className="text-[11px] text-foreground/85">{e.type}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground/80 mt-0.5">Path · {e.path}</div>
                  <div className="text-[12px] text-foreground/90 italic mt-1">{e.effect}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Fronts */}
          <div className="rounded-lg border border-border/25 bg-background/30 p-4">
            <div className="text-xs font-light tracking-[0.18em] uppercase text-foreground/85 mb-3">Theatres & Outcomes</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-muted-foreground/70 uppercase tracking-wider">
                    <th className="pb-2 pr-3 font-light">Theatre</th>
                    <th className="pb-2 pr-3 font-light">Combatants</th>
                    <th className="pb-2 font-light">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/10">
                  {d.fronts.map((f, i) => (
                    <tr key={i} className="text-foreground/85">
                      <td className="py-2 pr-3 whitespace-nowrap">{f.theatre}</td>
                      <td className="py-2 pr-3">{f.combatants}</td>
                      <td className="py-2 italic text-foreground/80">{f.outcome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Victors / Defeated */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] p-4">
              <div className="flex items-center gap-2 mb-2"><Crown className="h-4 w-4 text-emerald-400/80" /><span className="text-xs uppercase tracking-[0.18em] text-foreground/85">Victors</span></div>
              <ul className="space-y-1.5 text-[12px] text-foreground/90">
                {d.victors.map((v, i) => <li key={i} className="leading-relaxed">{v}</li>)}
              </ul>
            </div>
            <div className="rounded-lg border border-red-500/25 bg-red-500/[0.04] p-4">
              <div className="flex items-center gap-2 mb-2"><Skull className="h-4 w-4 text-red-400/80" /><span className="text-xs uppercase tracking-[0.18em] text-foreground/85">Defeated</span></div>
              <ul className="space-y-1.5 text-[12px] text-foreground/90">
                {d.defeated.map((v, i) => <li key={i} className="leading-relaxed">{v}</li>)}
              </ul>
            </div>
          </div>

          {/* Postwar ranking */}
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.04] p-4">
            <div className="flex items-center gap-2 mb-3"><Crown className="h-4 w-4 text-amber-400/80" /><span className="text-xs uppercase tracking-[0.18em] text-foreground/85">Post-War Top 6 (2032+)</span></div>
            <div className="space-y-1.5">
              {d.postwar_top.map((p) => (
                <div key={p.rank} className="grid grid-cols-[40px_1fr] gap-3 items-baseline">
                  <div className="text-xl font-extralight text-foreground/45 tabular-nums">#{p.rank}</div>
                  <div>
                    <div className="text-[13px] text-foreground/95"><span className="mr-1.5">{p.flag}</span>{p.country}</div>
                    <div className="text-[11px] text-muted-foreground/80 italic">{p.note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Black Swans */}
          <div className="rounded-lg border border-border/25 bg-background/30 p-4">
            <div className="flex items-center gap-2 mb-2"><Zap className="h-4 w-4 text-amber-400/80" /><span className="text-xs uppercase tracking-[0.18em] text-foreground/85">Black-Swan Triggers</span></div>
            <ul className="space-y-1 text-[11px] text-foreground/85 list-disc list-inside marker:text-foreground/40">
              {d.blackswans.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </div>

          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 pt-1 border-t border-border/15">
            <Eye className="h-3 w-3" /> Mundane forecast · synthesized from Sanghatta, Pancha Vedha, Shoola, Eclipse Totality protocols
          </div>
        </div>
      )}
    </div>
  );
}
