import { Beaker, Cpu, DollarSign, Factory, Leaf, Microscope, Shield, Wrench } from "lucide-react";
import type { ZaliProject } from "./types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RESEARCH_DOMAINS, type ResearchDomainKey, type ResearchFinding } from "./zaliPrompt";

const DOMAIN_META: Record<ResearchDomainKey, { label: string; icon: typeof Cpu; color: string }> = {
  physics: { label: "physics", icon: Cpu, color: "text-blue-400" },
  chemistry: { label: "chemistry", icon: Beaker, color: "text-emerald-400" },
  biology: { label: "biology", icon: Microscope, color: "text-pink-400" },
  engineering: { label: "engineering", icon: Wrench, color: "text-amber-400" },
  economics: { label: "economics", icon: DollarSign, color: "text-cyan-400" },
  manufacturing: { label: "manufacturing", icon: Factory, color: "text-purple-400" },
  sustainability: { label: "sustainability", icon: Leaf, color: "text-green-400" },
  safety: { label: "safety & ethics", icon: Shield, color: "text-red-400" },
};

interface Props {
  project: ZaliProject | null;
  findings: ResearchFinding[];
}

const ZaliResearchPanel = ({ project, findings }: Props) => {
  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[10px] text-muted-foreground/40">no project selected</p>
      </div>
    );
  }

  const counts: Partial<Record<ResearchDomainKey, number>> = {};
  for (const f of findings) counts[f.domain] = (counts[f.domain] ?? 0) + 1;
  const max = Math.max(1, ...Object.values(counts).map((n) => n ?? 0));

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-4 py-3 border-b border-border/20">
        <h3 className="text-xs font-light tracking-[0.15em] text-muted-foreground">research</h3>
        <p className="text-[9px] text-muted-foreground/40 mt-0.5">
          {findings.length} finding{findings.length === 1 ? "" : "s"} · lines shepherd tagged [RESEARCH: domain] while answering
        </p>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-2">
          {RESEARCH_DOMAINS.map((key) => {
            const meta = DOMAIN_META[key];
            const count = counts[key] ?? 0;
            return (
              <div key={key} className="rounded-lg border border-border/10 bg-card/20 p-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <meta.icon className={`h-3 w-3 ${meta.color}`} />
                  <span className="text-[10px] font-light text-foreground flex-1">{meta.label}</span>
                  <span className="text-[9px] text-muted-foreground/50">{count}</span>
                </div>
                <div className="h-1 rounded-full bg-border/20 overflow-hidden" aria-hidden="true">
                  <div className="h-full rounded-full bg-accent/50 transition-all duration-500" style={{ width: `${Math.round((count / max) * 100)}%` }} />
                </div>
              </div>
            );
          })}

          {findings.length === 0 ? (
            <p className="text-[9px] text-muted-foreground/40 text-center py-4 px-2 leading-relaxed">
              no findings yet. when shepherd states a domain fact it tags the line, and the line lands here.
            </p>
          ) : (
            <div className="mt-4">
              <p className="text-[9px] text-muted-foreground/40 tracking-wider mb-2 px-1">latest</p>
              <ul className="space-y-1 list-none m-0 p-0">
                {findings.slice(-12).reverse().map((f, i) => (
                  <li key={`${f.domain}-${i}`} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-foreground/5 transition-colors">
                    <div className="h-1 w-1 rounded-full bg-accent/50 mt-1.5 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-light text-foreground">{f.title}</p>
                      <p className="text-[9px] text-muted-foreground/40">{DOMAIN_META[f.domain]?.label ?? f.domain}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ZaliResearchPanel;
