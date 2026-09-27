import { useMemo, useState } from "react";
import { Shield, AlertTriangle, Zap, Target, ChevronDown } from "lucide-react";
import { analyzeSwv, type SwvFinding, type SwvPlanet } from "@/lib/vedic/swvAnalysis";

interface Props {
  ascendant: number;
  planets: SwvPlanet[];
  label?: string; // e.g. "United States" or chart name
}

const KIND_META = {
  strength:      { Icon: Shield,        color: "emerald", title: "Strengths",        desc: "Chart-level assets to lean on" },
  weakness:      { Icon: AlertTriangle, color: "amber",   title: "Weaknesses",       desc: "Friction points to mitigate" },
  vulnerability: { Icon: Zap,           color: "red",     title: "Vulnerabilities",  desc: "Trigger-sensitive risk surfaces" },
} as const;

function FindingRow({ f }: { f: SwvFinding }) {
  return (
    <div className="rounded-md border border-border/20 bg-background/30 p-2.5">
      <div className="flex items-baseline gap-2">
        <span className="text-[12px] text-foreground/95 font-light flex-1">{f.title}</span>
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 whitespace-nowrap">{f.domain}</span>
        <span className="text-[10px] text-foreground/60 tabular-nums">×{f.weight}</span>
      </div>
      <div className="text-[11px] text-muted-foreground/85 italic mt-1 leading-relaxed">{f.detail}</div>
      <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground/55 mt-1">{f.source}</div>
    </div>
  );
}

export default function SwvPanel({ ascendant, planets, label }: Props) {
  const [open, setOpen] = useState(true);
  const report = useMemo(() => analyzeSwv(ascendant, planets), [ascendant, planets]);

  const groups: { key: "strength" | "weakness" | "vulnerability"; rows: SwvFinding[] }[] = [
    { key: "strength",      rows: report.strengths },
    { key: "weakness",      rows: report.weaknesses },
    { key: "vulnerability", rows: report.vulnerabilities },
  ];

  return (
    <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-foreground/[0.02] transition border-b border-border/15">
        <Target className="h-4 w-4 text-foreground/70" />
        <div className="flex-1">
          <div className="text-sm font-light tracking-[0.15em] uppercase text-foreground">Strengths · Weaknesses · Vulnerabilities</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/65 mt-0.5">
            {label ? `${label} · ` : ""}{report.ascSign} Asc · ruled by {report.ascRuler}
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="p-5 space-y-4">
          {/* Score bars */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { k: "Strength",      v: report.scores.strength,      cls: "bg-emerald-500/70" },
              { k: "Weakness",      v: report.scores.weakness,      cls: "bg-amber-500/70" },
              { k: "Vulnerability", v: report.scores.vulnerability, cls: "bg-red-500/70" },
              { k: "Resilience",    v: report.scores.resilience,    cls: "bg-foreground/70" },
            ].map((s) => (
              <div key={s.k} className="rounded-lg border border-border/25 bg-background/30 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{s.k}</div>
                <div className="text-2xl font-extralight text-foreground tabular-nums mt-0.5">
                  {s.v}{s.k === "Resilience" && <span className="text-xs text-muted-foreground/60">/100</span>}
                </div>
                <div className="mt-2 h-1 rounded bg-foreground/10 overflow-hidden">
                  <div className={`h-full ${s.cls}`} style={{ width: `${Math.min(100, s.k === "Resilience" ? s.v : s.v * 4)}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Three columns */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {groups.map(({ key, rows }) => {
              const meta = KIND_META[key];
              const Icon = meta.Icon;
              const borderCls =
                meta.color === "emerald" ? "border-emerald-500/25 bg-emerald-500/[0.04]" :
                meta.color === "amber"   ? "border-amber-500/25 bg-amber-500/[0.04]" :
                                           "border-red-500/25 bg-red-500/[0.04]";
              const iconCls =
                meta.color === "emerald" ? "text-emerald-400/85" :
                meta.color === "amber"   ? "text-amber-400/85" :
                                           "text-red-400/85";
              return (
                <div key={key} className={`rounded-lg border ${borderCls} p-3`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`h-4 w-4 ${iconCls}`} />
                    <span className="text-xs uppercase tracking-[0.18em] text-foreground/85">{meta.title}</span>
                    <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/70">{rows.length}</span>
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-2">{meta.desc}</div>
                  <div className="space-y-2">
                    {rows.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground/60 italic">None detected.</div>
                    ) : rows.map((f, i) => <FindingRow key={i} f={f} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
