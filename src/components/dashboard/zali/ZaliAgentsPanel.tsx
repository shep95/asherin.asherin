import { Eye, Beaker, Heart, Factory, DollarSign, Shield } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const AGENTS = [
  {
    id: "optimus",
    name: "OPTIMUS",
    icon: Eye,
    domain: "Optical Engineering",
    description: "Light, optics, electromagnetic phenomena, sensor physics",
    color: "text-blue-400",
    bgColor: "bg-blue-400/10",
  },
  {
    id: "chemix",
    name: "CHEMIX",
    icon: Beaker,
    domain: "Chemistry & Materials",
    description: "Every material on Earth. Molecular design, material science",
    color: "text-emerald-400",
    bgColor: "bg-emerald-400/10",
  },
  {
    id: "biox",
    name: "BIOX",
    icon: Heart,
    domain: "Biology & Medicine",
    description: "Biological systems, pharmacology, digital twin simulation",
    color: "text-pink-400",
    bgColor: "bg-pink-400/10",
  },
  {
    id: "synthia",
    name: "SYNTHIA",
    icon: Factory,
    domain: "Manufacturing",
    description: "Production processes, tolerances, yield, assembly",
    color: "text-amber-400",
    bgColor: "bg-amber-400/10",
  },
  {
    id: "econia",
    name: "ECONIA",
    icon: DollarSign,
    domain: "Economics",
    description: "Markets, costs, pricing, profitability analysis",
    color: "text-cyan-400",
    bgColor: "bg-cyan-400/10",
  },
  {
    id: "ethica",
    name: "ETHICA",
    icon: Shield,
    domain: "Ethics & Safety",
    description: "Safety, legal compliance, environmental impact",
    color: "text-red-400",
    bgColor: "bg-red-400/10",
  },
];

const ZaliAgentsPanel = () => {
  return (
    <ScrollArea className="h-full">
      <div className="p-4 sm:p-6">
        <h3 className="text-xs font-light tracking-[0.15em] text-muted-foreground uppercase mb-3 sm:mb-4">Specialist Agents</h3>
        <p className="text-[10px] text-muted-foreground/50 mb-4 sm:mb-6">
          ZANOEM delegates to specialist agents for deep domain expertise. Reference them in chat: "[OPTIMUS]: analyze the optical system"
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {AGENTS.map((agent) => (
            <div
              key={agent.id}
              className="rounded-xl border border-border/20 bg-card/20 p-3 sm:p-4 hover:bg-card/40 transition-colors group"
            >
              <div className="flex items-center gap-3 mb-2 sm:mb-3">
                <div className={`${agent.bgColor} rounded-lg p-1.5 sm:p-2`}>
                  <agent.icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${agent.color}`} />
                </div>
                <div>
                  <p className="text-[11px] sm:text-xs font-light text-foreground tracking-wider">{agent.name}</p>
                  <p className="text-[9px] text-muted-foreground/50">{agent.domain}</p>
                </div>
              </div>
              <p className="text-[10px] font-extralight text-muted-foreground/60 leading-relaxed">
                {agent.description}
              </p>
              <div className="mt-2 sm:mt-3 flex items-center gap-1">
                <div className="h-1 w-1 rounded-full bg-emerald-500/70" />
                <span className="text-[9px] text-emerald-500/70">Available</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
};

export default ZaliAgentsPanel;