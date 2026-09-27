import { Beaker, BookOpen, Cpu, DollarSign, Leaf, Microscope, Shield, Wrench } from "lucide-react";
import type { ZaliProject } from "./types";
import { ScrollArea } from "@/components/ui/scroll-area";

const RESEARCH_DOMAINS = [
  { key: "physics", label: "Physics", icon: Cpu, color: "text-blue-400" },
  { key: "chemistry", label: "Chemistry", icon: Beaker, color: "text-emerald-400" },
  { key: "biology", label: "Biology", icon: Microscope, color: "text-pink-400" },
  { key: "engineering", label: "Engineering", icon: Wrench, color: "text-amber-400" },
  { key: "economics", label: "Economics", icon: DollarSign, color: "text-cyan-400" },
  { key: "manufacturing", label: "Manufacturing", icon: BookOpen, color: "text-purple-400" },
  { key: "sustainability", label: "Sustainability", icon: Leaf, color: "text-green-400" },
  { key: "safety", label: "Safety & Ethics", icon: Shield, color: "text-red-400" },
];

interface Props {
  project: ZaliProject | null;
  findings: Array<{ domain: string; title: string; confidence: number }>;
}

const ZaliResearchPanel = ({ project, findings }: Props) => {
  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[10px] text-muted-foreground/40">No active project</p>
      </div>
    );
  }

  // Compute progress per domain from findings
  const domainProgress: Record<string, number> = {};
  findings.forEach((f) => {
    if (!domainProgress[f.domain]) domainProgress[f.domain] = 0;
    domainProgress[f.domain] += 1;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-4 py-3 border-b border-border/20">
        <h3 className="text-xs font-light tracking-[0.15em] text-muted-foreground uppercase">Research</h3>
        <p className="text-[9px] text-muted-foreground/40 mt-0.5">{findings.length} findings</p>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-2">
          {RESEARCH_DOMAINS.map((domain) => {
            const count = domainProgress[domain.key] || 0;
            const progress = Math.min(100, count * 20); // 5 findings = 100%

            return (
              <div key={domain.key} className="rounded-lg border border-border/10 bg-card/20 p-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <domain.icon className={`h-3 w-3 ${domain.color}`} />
                  <span className="text-[10px] font-light text-foreground flex-1">{domain.label}</span>
                  <span className="text-[9px] text-muted-foreground/50">{count}</span>
                </div>
                <div className="h-1 rounded-full bg-border/20 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent/50 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            );
          })}

          {/* Recent findings */}
          {findings.length > 0 && (
            <div className="mt-4">
              <p className="text-[9px] text-muted-foreground/40 tracking-wider uppercase mb-2 px-1">Recent Findings</p>
              <div className="space-y-1">
                {findings.slice(-8).reverse().map((f, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-foreground/5 transition-colors">
                    <div className="h-1 w-1 rounded-full bg-accent/50 mt-1.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-light text-foreground truncate">{f.title}</p>
                      <p className="text-[9px] text-muted-foreground/40">{f.domain} · {Math.round(f.confidence * 100)}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ZaliResearchPanel;
