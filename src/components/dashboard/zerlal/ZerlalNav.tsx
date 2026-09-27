import { Shield, FolderSearch, FileWarning, FileText, Plug, Settings, Users, Landmark, Package, Atom, Brain, Lock, Siren, Crosshair, Scale, Server, GraduationCap, Cpu, Globe, UserSearch, FileCheck, BarChart3, Sword, Smartphone, Radar, ScanSearch, BookOpen, Rss, ScrollText, Award, Code2, Wifi, Clock, Eye, Ghost, Route } from "lucide-react";
import type { ZerlalScreen } from "./types";

interface ZerlalNavProps {
  activeScreen: ZerlalScreen;
  onNavigate: (screen: ZerlalScreen) => void;
  criticalCount: number;
}

const mainNav: { id: ZerlalScreen; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: Shield },
  { id: "path-map", label: "Path Map", icon: Route },
  { id: "domain-recon", label: "Domain Recon", icon: ScanSearch },
  { id: "ghostchain", label: "GhostChain", icon: Ghost },
  { id: "project", label: "Projects", icon: FolderSearch },
  { id: "finding", label: "Findings", icon: FileWarning },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "integrations", label: "Integrations", icon: Plug },
];

const categoryNav: { id: ZerlalScreen; label: string; icon: React.ElementType }[] = [
  { id: "compliance", label: "Compliance", icon: Landmark },
  { id: "supply-chain", label: "Supply Chain", icon: Package },
  { id: "quantum", label: "Post-Quantum", icon: Atom },
  { id: "ai-security", label: "AI Security", icon: Brain },
  { id: "zero-trust", label: "Zero Trust", icon: Lock },
  { id: "ot-ics", label: "OT/ICS", icon: Cpu },
  { id: "incident", label: "Incident Response", icon: Siren },
  { id: "threat-intel", label: "Threat Intel", icon: Crosshair },
  { id: "dark-web", label: "Dark Web Intel", icon: Globe },
  { id: "ueba", label: "Insider Threat / UEBA", icon: UserSearch },
  { id: "red-team", label: "Red Team Agent", icon: Sword },
  { id: "exec-risk", label: "Executive Risk Score", icon: BarChart3 },
  { id: "cvd-pipeline", label: "CVD Pipeline", icon: FileCheck },
  { id: "device-security", label: "Device Security", icon: Smartphone },
  { id: "pattern-engine", label: "Pattern Engine", icon: Radar },
  { id: "sigma-rules", label: "SIGMA Rules", icon: BookOpen },
  { id: "stix-feed", label: "Threat Feed", icon: Rss },
  { id: "log-correlation", label: "Log Correlator", icon: ScrollText },
  { id: "cert-transparency", label: "Cert Monitor", icon: Award },
  { id: "code-scanner", label: "Code Scanner", icon: Code2 },
  { id: "port-scanner", label: "Port Scanner", icon: Wifi },
  { id: "whois-timeline", label: "WHOIS Timeline", icon: Clock },
  { id: "tor-checker", label: "Tor/VPN Checker", icon: Eye },
  { id: "governance", label: "Governance", icon: Scale },
  { id: "deployment", label: "Deployment", icon: Server },
  { id: "workforce", label: "Workforce", icon: GraduationCap },
];

const ZerlalNav = ({ activeScreen, onNavigate, criticalCount }: ZerlalNavProps) => {
  return (
    <div className="w-52 shrink-0 border-r border-border/[0.06] bg-background/60 backdrop-blur-md flex flex-col overflow-y-auto">
      <div className="px-4 py-4 border-b border-border/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-foreground/[0.04] border border-border/[0.08] flex items-center justify-center">
            <Shield className="h-3.5 w-3.5 text-foreground/60" />
          </div>
          <div>
            <span className="text-[11px] font-light tracking-[0.15em] text-foreground/90 uppercase">Zerlal</span>
            <p className="text-[7px] text-muted-foreground/30 tracking-[0.2em] uppercase">Cyber Intelligence Engine</p>
          </div>
        </div>
      </div>

      <div className="flex-1 py-2 px-2 space-y-0.5">
        {mainNav.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] tracking-wide transition-all ${
              activeScreen === item.id
                ? "bg-foreground/[0.06] text-foreground/90"
                : "text-muted-foreground/50 hover:text-foreground/70 hover:bg-foreground/[0.02]"
            }`}
          >
            <item.icon className="h-3 w-3" />
            <span>{item.label}</span>
            {item.id === "finding" && criticalCount > 0 && (
              <span className="ml-auto text-[8px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-medium">
                {criticalCount}
              </span>
            )}
          </button>
        ))}

        <div className="pt-2 pb-1 px-2.5">
          <span className="text-[8px] text-muted-foreground/25 uppercase tracking-[0.2em]">Intelligence Modules</span>
        </div>

        {categoryNav.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] tracking-wide transition-all ${
              activeScreen === item.id
                ? "bg-foreground/[0.06] text-foreground/90"
                : "text-muted-foreground/40 hover:text-foreground/60 hover:bg-foreground/[0.02]"
            }`}
          >
            <item.icon className="h-3 w-3" />
            <span>{item.label}</span>
          </button>
        ))}

        <div className="pt-2">
          {[
            { id: "settings" as ZerlalScreen, label: "Settings", icon: Settings },
            { id: "team" as ZerlalScreen, label: "Team", icon: Users },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] tracking-wide transition-all ${
                activeScreen === item.id
                  ? "bg-foreground/[0.06] text-foreground/90"
                  : "text-muted-foreground/40 hover:text-foreground/60 hover:bg-foreground/[0.02]"
              }`}
            >
              <item.icon className="h-3 w-3" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 py-2 border-t border-border/[0.06]">
        <div className="text-[8px] text-muted-foreground/20 tracking-wider uppercase text-center">
          Powered by AUREON
        </div>
      </div>
    </div>
  );
};

export default ZerlalNav;
