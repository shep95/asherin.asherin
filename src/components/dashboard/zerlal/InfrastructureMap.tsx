import { useState } from "react";
import {
  Globe, Server, Database, Shield, Cloud, GitBranch, Cpu, Lock,
  Wifi, ArrowRight, ExternalLink, Copy, Download, AlertTriangle,
  Monitor, HardDrive, Layers, Radio, Mail, Eye, RefreshCw
} from "lucide-react";
import { toast } from "sonner";

interface InfraComponent {
  id: string;
  type: string;
  name: string;
  provider: string;
  details: string;
  exposed: boolean;
}

interface InfraConnection {
  from: string;
  to: string;
  label: string;
  protocol: string;
  encrypted: boolean;
}

interface DataFlow {
  description: string;
  source: string;
  destination: string;
  data_type: string;
  risk_level: string;
}

interface InfrastructureMapData {
  github_repo: string | null;
  deployment_platform: string;
  ci_cd: string;
  components: InfraComponent[];
  connections: InfraConnection[];
  data_flows: DataFlow[];
}

interface InfrastructureMapProps {
  data: InfrastructureMapData | null;
  domain: string;
  isFallback?: boolean;
  unavailableReason?: string | null;
}

const typeIcons: Record<string, React.ElementType> = {
  "web-server": Globe,
  "app-server": Server,
  "database": Database,
  "cdn": Cloud,
  "load-balancer": Layers,
  "api-gateway": Radio,
  "auth-service": Lock,
  "storage": HardDrive,
  "monitoring": Eye,
  "ci-cd": GitBranch,
  "container-orchestration": Cpu,
  "dns": Wifi,
  "email": Mail,
  "waf": Shield,
  "cache": Monitor,
  "queue": Layers,
  "third-party": Globe,
};

const typeColors: Record<string, string> = {
  "web-server": "border-blue-500/30 bg-blue-500/5",
  "app-server": "border-purple-500/30 bg-purple-500/5",
  "database": "border-green-500/30 bg-green-500/5",
  "cdn": "border-cyan-500/30 bg-cyan-500/5",
  "load-balancer": "border-yellow-500/30 bg-yellow-500/5",
  "api-gateway": "border-orange-500/30 bg-orange-500/5",
  "auth-service": "border-red-500/30 bg-red-500/5",
  "storage": "border-emerald-500/30 bg-emerald-500/5",
  "monitoring": "border-indigo-500/30 bg-indigo-500/5",
  "ci-cd": "border-pink-500/30 bg-pink-500/5",
  "container-orchestration": "border-violet-500/30 bg-violet-500/5",
  "dns": "border-teal-500/30 bg-teal-500/5",
  "email": "border-amber-500/30 bg-amber-500/5",
  "waf": "border-rose-500/30 bg-rose-500/5",
  "cache": "border-lime-500/30 bg-lime-500/5",
  "queue": "border-fuchsia-500/30 bg-fuchsia-500/5",
  "third-party": "border-slate-500/30 bg-slate-500/5",
};

const riskColors: Record<string, string> = {
  high: "text-red-400 bg-red-500/10 border-red-500/20",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  low: "text-green-400 bg-green-500/10 border-green-500/20",
};

// Group components into phases for the visual layout
function groupByPhase(components: InfraComponent[]) {
  const phases: Record<string, InfraComponent[]> = {
    "Phase 1 — Entry Point": [],
    "Phase 2 — Edge & Security": [],
    "Phase 3 — Application Layer": [],
    "Phase 4 — Data & Storage": [],
    "Phase 5 — DevOps & Monitoring": [],
  };

  for (const c of components) {
    switch (c.type) {
      case "dns":
      case "cdn":
      case "load-balancer":
        phases["Phase 1 — Entry Point"].push(c);
        break;
      case "waf":
      case "auth-service":
        phases["Phase 2 — Edge & Security"].push(c);
        break;
      case "web-server":
      case "app-server":
      case "api-gateway":
      case "third-party":
        phases["Phase 3 — Application Layer"].push(c);
        break;
      case "database":
      case "storage":
      case "cache":
      case "queue":
      case "email":
        phases["Phase 4 — Data & Storage"].push(c);
        break;
      case "ci-cd":
      case "monitoring":
      case "container-orchestration":
        phases["Phase 5 — DevOps & Monitoring"].push(c);
        break;
      default:
        phases["Phase 3 — Application Layer"].push(c);
    }
  }

  return Object.entries(phases).filter(([, items]) => items.length > 0);
}

const InfrastructureMap = ({ data, domain, isFallback = false, unavailableReason }: InfrastructureMapProps) => {
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [showDataFlows, setShowDataFlows] = useState(false);

  if (!data) {
    return (
      <div className="rounded-xl border border-border/[0.06] bg-foreground/[0.015] p-8 text-center space-y-2">
        <Server className="h-6 w-6 text-muted-foreground/20 mx-auto" />
        <p className="text-[10px] text-foreground/45">Infrastructure map could not be generated for this scan.</p>
        {unavailableReason && (
          <p className="text-[9px] text-muted-foreground/30 max-w-lg mx-auto leading-relaxed">{unavailableReason}</p>
        )}
      </div>
    );
  }

  const phases = groupByPhase(data.components || []);
  const selectedComp = data.components?.find(c => c.id === selectedComponent);
  const relatedConnections = data.connections?.filter(c => c.from === selectedComponent || c.to === selectedComponent) || [];
  const relatedFlows = data.data_flows?.filter(f => f.source === selectedComponent || f.destination === selectedComponent) || [];

  const handleCloneRepo = () => {
    if (data.github_repo) {
      navigator.clipboard.writeText(`git clone ${data.github_repo}`);
      toast.success("Git clone command copied to clipboard");
    }
  };

  const exportMap = () => {
    const text = `ZERLAL INFRASTRUCTURE MAP\nDomain: ${domain}\nDate: ${new Date().toISOString()}\n\nGitHub: ${data.github_repo || "Not detected"}\nDeployment: ${data.deployment_platform}\nCI/CD: ${data.ci_cd}\n\n${"=".repeat(60)}\n\nCOMPONENTS (${data.components?.length || 0}):\n${(data.components || []).map(c => `  [${c.type.toUpperCase()}] ${c.name} — ${c.provider}\n    ${c.details}\n    Exposed: ${c.exposed ? "YES ⚠️" : "No"}`).join("\n\n")}\n\nCONNECTIONS (${data.connections?.length || 0}):\n${(data.connections || []).map(c => `  ${c.from} → ${c.to} (${c.protocol}) ${c.encrypted ? "🔒" : "⚠️ UNENCRYPTED"}\n    ${c.label}`).join("\n")}\n\nDATA FLOWS (${data.data_flows?.length || 0}):\n${(data.data_flows || []).map(f => `  [${f.risk_level.toUpperCase()}] ${f.source} → ${f.destination}\n    ${f.description} (${f.data_type})`).join("\n")}`;

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zerlal-infra-map-${domain.replace(/[^a-z0-9]/gi, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Infrastructure map exported");
  };

  return (
    <div className="space-y-4">
      {isFallback && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <div className="flex items-center gap-2 mb-1">
            <RefreshCw className="h-3.5 w-3.5 text-amber-400/70" />
            <span className="text-[9px] uppercase tracking-wider text-amber-400/70">Reconstructed map</span>
          </div>
          <p className="text-[9px] text-foreground/55 leading-relaxed">
            ZERLAL rebuilt this architecture map from detected hosting, security layers, domain intelligence, and finding evidence because the scan did not return a full native topology payload.
          </p>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-foreground/50" />
          <span className="text-[11px] text-foreground/70 tracking-wide">Infrastructure Architecture Map</span>
          <span className="text-[8px] px-2 py-0.5 rounded-full bg-foreground/[0.04] text-muted-foreground/40">
            {data.components?.length || 0} components
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowDataFlows(!showDataFlows)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[9px] transition-colors ${
              showDataFlows ? "bg-foreground/[0.08] text-foreground/70" : "bg-foreground/[0.04] text-foreground/50 hover:bg-foreground/[0.07]"
            }`}
          >
            <ArrowRight className="h-2.5 w-2.5" /> Data Flows
          </button>
          <button onClick={exportMap} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-foreground/[0.04] text-[9px] text-foreground/50 hover:bg-foreground/[0.07] transition-colors">
            <Download className="h-2.5 w-2.5" /> Export
          </button>
        </div>
      </div>

      {/* GitHub Repo & Deployment Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className={`rounded-lg border p-3 ${data.github_repo ? "border-green-500/20 bg-green-500/5" : "border-border/[0.06] bg-foreground/[0.02]"}`}>
          <div className="flex items-center gap-2 mb-1.5">
            <GitBranch className={`h-3.5 w-3.5 ${data.github_repo ? "text-green-400" : "text-muted-foreground/30"}`} />
            <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">GitHub Repository</span>
          </div>
          {data.github_repo ? (
            <div className="space-y-1.5">
              <a
                href={data.github_repo}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 break-all"
              >
                {data.github_repo} <ExternalLink className="h-2.5 w-2.5 shrink-0" />
              </a>
              <button
                onClick={handleCloneRepo}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-foreground/[0.06] text-[8px] text-foreground/60 hover:bg-foreground/[0.1] transition-colors"
              >
                <Copy className="h-2.5 w-2.5" /> Clone Repository
              </button>
            </div>
          ) : (
            <p className="text-[9px] text-muted-foreground/30">Not detected</p>
          )}
        </div>

        <div className="rounded-lg border border-border/[0.06] bg-foreground/[0.02] p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Cloud className="h-3.5 w-3.5 text-muted-foreground/40" />
            <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Deployment Platform</span>
          </div>
          <p className="text-[10px] text-foreground/70">{data.deployment_platform || "Unknown"}</p>
        </div>

        <div className="rounded-lg border border-border/[0.06] bg-foreground/[0.02] p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <GitBranch className="h-3.5 w-3.5 text-muted-foreground/40" />
            <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">CI/CD Pipeline</span>
          </div>
          <p className="text-[10px] text-foreground/70">{data.ci_cd || "Unknown"}</p>
        </div>
      </div>

      {/* Visual Architecture Map — Phase-based layout */}
      <div className="rounded-xl border border-border/[0.06] bg-foreground/[0.015] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/[0.06] flex items-center justify-between">
          <span className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">Architecture Topology</span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-400/60" />
              <span className="text-[7px] text-muted-foreground/30">Secure</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-400/60" />
              <span className="text-[7px] text-muted-foreground/30">Exposed</span>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* User entry point */}
          <div className="flex justify-center mb-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-foreground/[0.04] border border-border/[0.08]">
              <Monitor className="h-3 w-3 text-foreground/40" />
              <span className="text-[9px] text-foreground/50">User / Client</span>
            </div>
          </div>
          <div className="flex justify-center">
            <div className="w-px h-4 bg-foreground/10" />
          </div>

          {phases.map(([phaseName, components], pi) => (
            <div key={phaseName}>
              <div className="rounded-lg border border-border/[0.06] bg-foreground/[0.02] p-3">
                <div className="text-[8px] text-muted-foreground/30 uppercase tracking-wider mb-2">{phaseName}</div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {components.map(comp => {
                    const Icon = typeIcons[comp.type] || Globe;
                    const colorClass = typeColors[comp.type] || "border-border/[0.08] bg-foreground/[0.03]";
                    const isSelected = selectedComponent === comp.id;

                    return (
                      <button
                        key={comp.id}
                        onClick={() => setSelectedComponent(isSelected ? null : comp.id)}
                        className={`relative flex flex-col items-center gap-1 px-3 py-2 rounded-lg border transition-all ${colorClass} ${
                          isSelected ? "ring-1 ring-foreground/20 scale-105" : "hover:scale-[1.02]"
                        }`}
                      >
                        {comp.exposed && (
                          <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-400/80 border border-background" />
                        )}
                        <Icon className="h-4 w-4 text-foreground/50" />
                        <span className="text-[8px] text-foreground/70 font-medium text-center max-w-[80px] truncate">{comp.name}</span>
                        <span className="text-[7px] text-muted-foreground/30">{comp.provider}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {pi < phases.length - 1 && (
                <div className="flex justify-center py-1">
                  <div className="flex items-center gap-1">
                    <div className="w-px h-3 bg-foreground/10" />
                    <ArrowRight className="h-2.5 w-2.5 text-foreground/10 rotate-90" />
                    <div className="w-px h-3 bg-foreground/10" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Selected Component Detail */}
      {selectedComp && (
        <div className="rounded-xl border border-border/[0.06] bg-foreground/[0.02] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(() => { const Icon = typeIcons[selectedComp.type] || Globe; return <Icon className="h-4 w-4 text-foreground/50" />; })()}
              <span className="text-[11px] text-foreground/80">{selectedComp.name}</span>
              {selectedComp.exposed && (
                <span className="text-[7px] px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400">EXPOSED</span>
              )}
            </div>
            <span className="text-[8px] px-2 py-0.5 rounded-full bg-foreground/[0.04] text-muted-foreground/40">{selectedComp.type}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[9px]">
            <div><span className="text-muted-foreground/30">Provider:</span> <span className="text-foreground/60">{selectedComp.provider}</span></div>
            <div><span className="text-muted-foreground/30">Type:</span> <span className="text-foreground/60">{selectedComp.type}</span></div>
          </div>

          <p className="text-[9px] text-foreground/50 leading-relaxed">{selectedComp.details}</p>

          {relatedConnections.length > 0 && (
            <div>
              <span className="text-[8px] text-muted-foreground/30 uppercase tracking-wider">Connections ({relatedConnections.length})</span>
              <div className="mt-1 space-y-1">
                {relatedConnections.map((conn, i) => (
                  <div key={i} className="flex items-center gap-2 text-[8px] px-2 py-1 rounded bg-foreground/[0.03]">
                    <span className="text-foreground/50">{conn.from}</span>
                    <ArrowRight className="h-2 w-2 text-muted-foreground/30" />
                    <span className="text-foreground/50">{conn.to}</span>
                    <span className="text-muted-foreground/25">({conn.protocol})</span>
                    {conn.encrypted ? (
                      <Lock className="h-2 w-2 text-green-400/60" />
                    ) : (
                      <AlertTriangle className="h-2 w-2 text-red-400/60" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {relatedFlows.length > 0 && (
            <div>
              <span className="text-[8px] text-muted-foreground/30 uppercase tracking-wider">Data Flows ({relatedFlows.length})</span>
              <div className="mt-1 space-y-1">
                {relatedFlows.map((flow, i) => (
                  <div key={i} className={`flex items-center gap-2 text-[8px] px-2 py-1 rounded border ${riskColors[flow.risk_level] || riskColors.low}`}>
                    <span className="uppercase tracking-wider">{flow.risk_level}</span>
                    <span className="text-foreground/50">{flow.description}</span>
                    <span className="text-muted-foreground/30">({flow.data_type})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Data Flows Panel */}
      {showDataFlows && data.data_flows && data.data_flows.length > 0 && (
        <div className="rounded-xl border border-border/[0.06] bg-foreground/[0.015] p-4">
          <div className="flex items-center gap-2 mb-3">
            <ArrowRight className="h-3.5 w-3.5 text-foreground/40" />
            <span className="text-[10px] text-foreground/70 tracking-wide">All Data Flows ({data.data_flows.length})</span>
          </div>
          <div className="space-y-1.5">
            {data.data_flows.map((flow, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-foreground/[0.02] border border-border/[0.04]">
                <span className={`shrink-0 text-[7px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${riskColors[flow.risk_level] || riskColors.low}`}>
                  {flow.risk_level}
                </span>
                <span className="text-[9px] text-foreground/50">{flow.source}</span>
                <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/20 shrink-0" />
                <span className="text-[9px] text-foreground/50">{flow.destination}</span>
                <span className="text-[8px] text-muted-foreground/30 flex-1 truncate">{flow.description}</span>
                <span className="text-[7px] px-1.5 py-0.5 rounded bg-foreground/[0.04] text-muted-foreground/40 shrink-0">{flow.data_type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connections List */}
      {data.connections && data.connections.length > 0 && (
        <div className="rounded-xl border border-border/[0.06] bg-foreground/[0.015] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wifi className="h-3.5 w-3.5 text-foreground/40" />
            <span className="text-[10px] text-foreground/70 tracking-wide">Network Connections ({data.connections.length})</span>
          </div>
          <div className="space-y-1">
            {data.connections.map((conn, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-1.5 rounded bg-foreground/[0.02] text-[8px]">
                <span className="text-foreground/50 min-w-[80px]">{conn.from}</span>
                <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/20" />
                <span className="text-foreground/50 min-w-[80px]">{conn.to}</span>
                <span className="text-muted-foreground/30 flex-1">{conn.label}</span>
                <span className="text-[7px] px-1.5 py-0.5 rounded bg-foreground/[0.04] text-muted-foreground/40">{conn.protocol}</span>
                {conn.encrypted ? (
                  <Lock className="h-2.5 w-2.5 text-green-400/50" />
                ) : (
                  <AlertTriangle className="h-2.5 w-2.5 text-red-400/50" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default InfrastructureMap;
