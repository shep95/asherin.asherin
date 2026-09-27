import { useState } from "react";
import { ChevronDown, AlertTriangle, TrendingUp, Info, CheckCircle2, Target } from "lucide-react";
import type { Finding, Severity } from "@/lib/cloudIntel/logic";

// A finding is never rendered as a bare number. The card is structurally
// incapable of hiding the baseline, the deviation, the evidence, or the
// falsifier — those are required props of the model it renders.

const SEVERITY_STYLE: Record<Severity, { ring: string; dot: string; label: string; Icon: any }> = {
  critical: { ring: "border-destructive/40", dot: "bg-destructive", label: "CRITICAL", Icon: AlertTriangle },
  elevated: { ring: "border-amber-500/30", dot: "bg-amber-400", label: "ELEVATED", Icon: TrendingUp },
  notable: { ring: "border-border/30", dot: "bg-foreground/50", label: "NOTABLE", Icon: Info },
  baseline: { ring: "border-border/20", dot: "bg-muted-foreground/40", label: "BASELINE", Icon: Info },
  positive: { ring: "border-emerald-500/25", dot: "bg-emerald-400", label: "NOMINAL", Icon: CheckCircle2 },
};

const FindingCard = ({ finding, defaultOpen = false }: { finding: Finding; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  const s = SEVERITY_STYLE[finding.severity];

  return (
    <div className={`rounded-2xl border ${s.ring} bg-card/25 backdrop-blur-md overflow-hidden`}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full text-left p-4 flex items-start gap-3 hover:bg-foreground/[0.03] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30"
      >
        <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${s.dot}`} aria-hidden />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] tracking-[0.2em] text-muted-foreground/50 font-light">{s.label}</span>
            <span className="text-[9px] tracking-[0.2em] text-muted-foreground/30 font-light">· {finding.module.toUpperCase()}</span>
            {finding.onset && (
              <span className="text-[9px] text-muted-foreground/40 font-light">· {finding.onset}</span>
            )}
          </div>
          <p className="text-sm font-light text-foreground leading-snug">{finding.title}</p>

          {/* Rule 1: never a number without its baseline and consequence. */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div>
              <p className="text-[9px] text-muted-foreground/40 font-light">OBSERVED</p>
              <p className="text-xs font-light text-foreground truncate" title={finding.current}>{finding.current}</p>
            </div>
            <div>
              <p className="text-[9px] text-muted-foreground/40 font-light">YOUR NORMAL</p>
              <p className="text-xs font-extralight text-muted-foreground truncate" title={finding.normal}>{finding.normal}</p>
            </div>
            <div>
              <p className="text-[9px] text-muted-foreground/40 font-light">DEVIATION</p>
              <p className="text-xs font-light text-foreground truncate" title={finding.deviation}>{finding.deviation}</p>
            </div>
          </div>
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground/40 shrink-0 mt-1 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border/10">
          {/* Rule 3 — root cause ladder. */}
          <section>
            <p className="text-[9px] tracking-[0.2em] text-muted-foreground/40 font-light mb-1.5">ROOT CAUSE</p>
            <ol className="space-y-1">
              {finding.why.map((w, i) => (
                <li key={i} className="flex gap-2 text-[11px] font-extralight text-muted-foreground leading-relaxed">
                  <span className="text-muted-foreground/30 shrink-0">{i + 1}.</span>
                  <span>{w}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* Rule 4 — threat chain. */}
          {finding.chain && (
            <section>
              <p className="text-[9px] tracking-[0.2em] text-muted-foreground/40 font-light mb-1.5">CONSEQUENCE CHAIN</p>
              <div className="space-y-1">
                {[finding.chain.primary, finding.chain.secondary, finding.chain.tertiary]
                  .filter(Boolean)
                  .map((c, i) => (
                    <div key={i} className="flex gap-2 text-[11px] font-extralight text-muted-foreground leading-relaxed">
                      <span className="text-muted-foreground/30 shrink-0">{["→", "⇢", "⇒"][i]}</span>
                      <span>{c}</span>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {finding.projection && (
            <section>
              <p className="text-[9px] tracking-[0.2em] text-muted-foreground/40 font-light mb-1.5">PROJECTION</p>
              <p className="text-[11px] font-extralight text-muted-foreground leading-relaxed">{finding.projection}</p>
            </section>
          )}

          {/* Rule 5 — auditable basis. */}
          <section>
            <p className="text-[9px] tracking-[0.2em] text-muted-foreground/40 font-light mb-1.5">EVIDENCE</p>
            <ul className="space-y-1">
              {finding.basis.map((b, i) => (
                <li key={i} className="text-[11px] font-extralight text-muted-foreground/80 leading-relaxed">· {b}</li>
              ))}
            </ul>
          </section>

          <div className="flex items-start gap-4 flex-wrap pt-1">
            <div className="min-w-[120px]">
              <p className="text-[9px] tracking-[0.2em] text-muted-foreground/40 font-light">CONFIDENCE</p>
              <div className="flex items-center gap-2 mt-1">
                <div className="h-1 w-16 rounded-full bg-foreground/10 overflow-hidden">
                  <div className="h-full bg-foreground/50 rounded-full" style={{ width: `${finding.confidence}%` }} />
                </div>
                <span className="text-[10px] font-light text-foreground">{finding.confidence}%</span>
              </div>
            </div>
            <div className="flex-1 min-w-[180px]">
              <p className="text-[9px] tracking-[0.2em] text-muted-foreground/40 font-light">WRONG IF</p>
              <p className="text-[11px] font-extralight text-muted-foreground mt-1 leading-relaxed">{finding.falsifier}</p>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl bg-foreground/5 px-3 py-2.5">
            <Target className="h-3 w-3 text-foreground/50 shrink-0 mt-0.5" />
            <p className="text-[11px] font-light text-foreground leading-relaxed">{finding.action}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FindingCard;
