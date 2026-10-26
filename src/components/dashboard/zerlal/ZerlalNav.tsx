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

const footNav: { id: ZerlalScreen; label: string; icon: React.ElementType }[] = [
  { id: "settings", label: "Settings", icon: Settings },
  { id: "team", label: "Team", icon: Users },
];

const ZerlalNav = ({ activeScreen, onNavigate, criticalCount }: ZerlalNavProps) => {
  return (
    <>
    {/* phone: one compact picker above the screen, so the screen keeps the width */}
    <div className="md:hidden shrink-0 border-b border-border/[0.06] px-3 py-2">
      <label className="flex items-center gap-2">
        <Shield className="h-3.5 w-3.5 shrink-0 text-foreground/60" aria-hidden />
        <span className="shrink-0 text-[11px] font-light tracking-[0.12em] text-foreground/85 lowercase">asherin.cyber</span>
        <select
          aria-label="asherin.cyber section"
          value={activeScreen}
          onChange={(e) => onNavigate(e.target.value as ZerlalScreen)}
          className="min-w-0 flex-1 rounded-lg border border-border/20 bg-background/80 px-2.5 py-2 text-xs font-light lowercase text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <optgroup label="asherin.cyber">
            {mainNav.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label.toLowerCase()}{i.id === "finding" && criticalCount > 0 ? ` · ${criticalCount} critical` : ""}
              </option>
            ))}
          </optgroup>
          <optgroup label="intelligence modules">
            {categoryNav.map((i) => <option key={i.id} value={i.id}>{i.label.toLowerCase()}</option>)}
          </optgroup>
          <optgroup label="room">
            {footNav.map((i) => <option key={i.id} value={i.id}>{i.label.toLowerCase()}</option>)}
          </optgroup>
        </select>
      </label>
    </div>
    <nav aria-label="asherin.cyber sections" className="hidden md:flex w-52 shrink-0 border-r border-border/[0.06] bg-background/60 backdrop-blur-md flex-col overflow-y-auto">
      <div className="px-4 py-4 border-b border-border/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-foreground/[0.04] border border-border/[0.08] flex items-center justify-center">
            <Shield className="h-3.5 w-3.5 text-foreground/60" />
          </div>
          <div>
            <span className="text-[11px] font-light tracking-[0.15em] text-foreground/90 lowercase">asherin.cyber</span>
            <p className="text-[9px] text-muted-foreground/55 tracking-[0.12em] lowercase">domain + infrastructure context</p>
          </div>
        </div>
      </div>

      <div className="flex-1 py-2 px-2 space-y-0.5">
        {mainNav.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            aria-current={activeScreen === item.id ? "page" : undefined}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] tracking-wide transition-all ${
              activeScreen === item.id
                ? "bg-foreground/[0.06] text-foreground/90"
                : "text-muted-foreground/65 hover:text-foreground/85 hover:bg-foreground/[0.02]"
            }`}
          >
            <item.icon className="h-3 w-3" />
            <span className="lowercase">{item.label}</span>
            {item.id === "finding" && criticalCount > 0 && (
              <span className="ml-auto text-[8px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-medium">
                {criticalCount}
              </span>
            )}
          </button>
        ))}

        <div className="pt-2 pb-1 px-2.5">
          <span className="text-[9px] text-muted-foreground/45 lowercase tracking-[0.2em]">intelligence modules</span>
        </div>

        {categoryNav.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            aria-current={activeScreen === item.id ? "page" : undefined}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] tracking-wide transition-all ${
              activeScreen === item.id
                ? "bg-foreground/[0.06] text-foreground/90"
                : "text-muted-foreground/60 hover:text-foreground/80 hover:bg-foreground/[0.02]"
            }`}
          >
            <item.icon className="h-3 w-3" />
            <span className="lowercase">{item.label}</span>
          </button>
        ))}

        <div className="pt-2">
          {footNav.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] tracking-wide transition-all ${
                activeScreen === item.id
                  ? "bg-foreground/[0.06] text-foreground/90"
                  : "text-muted-foreground/60 hover:text-foreground/80 hover:bg-foreground/[0.02]"
              }`}
            >
              <item.icon className="h-3 w-3" />
              <span className="lowercase">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 py-2 border-t border-border/[0.06]">
        <div className="text-[9px] text-muted-foreground/45 tracking-wider lowercase text-center">local edition · on this device</div>
      </div>
    </nav>
    </>
  );
};

export default ZerlalNav;
