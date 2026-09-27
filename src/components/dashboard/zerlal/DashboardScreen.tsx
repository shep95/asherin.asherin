import { useMemo, useState } from "react";
import { TrendingDown, TrendingUp, AlertTriangle, ArrowRight, User, Loader2, FolderPlus, Trash2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { useZerlalProjects, useZerlalFindings } from "./useZerlalData";
import type { ZerlalScreen } from "./types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import IdeDeleteConfirm from "@/components/dashboard/ide/IdeDeleteConfirm";

interface DashboardScreenProps {
  onNavigate: (screen: ZerlalScreen) => void;
  onSelectProject: (id: string) => void;
  onSelectFinding: (id: string) => void;
  onOpenScan: () => void;
}

const severityColors: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  info: "#6b7280",
};

const categoryLabels: Record<string, string> = {
  "memory-safety": "Memory Safety",
  injection: "Injection",
  secrets: "Secrets",
  dependencies: "Dependencies",
  logic: "Logic",
  crypto: "Crypto",
  auth: "Auth",
  config: "Config",
  "supply-chain": "Supply Chain",
  "ai-security": "AI Security",
  "zero-trust": "Zero Trust",
  "ot-ics": "OT/ICS",
  "cross-domain": "Cross-Domain / Redirect",
  concealment: "Concealment / Anti-Analysis",
  other: "Other",
};

const DashboardScreen = ({ onNavigate, onSelectProject, onSelectFinding, onOpenScan }: DashboardScreenProps) => {
  const { projects, loading: pLoading, refetch: refetchProjects } = useZerlalProjects();
  const { findings, loading: fLoading } = useZerlalFindings();
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("zerlal_projects").delete().eq("id", pendingDelete.id);
      if (error) throw error;
      toast.success(`Deleted "${pendingDelete.name}"`);
      setPendingDelete(null);
      await refetchProjects();
    } catch (e: any) {
      toast.error("Delete failed: " + (e?.message ?? "unknown"));
    } finally {
      setDeleting(false);
    }
  };

  const stats = useMemo(() => {
    const s = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    findings.forEach(f => {
      if (f.status !== "resolved" && f.status !== "waived") {
        if (f.severity in s) s[f.severity as keyof typeof s]++;
      }
    });
    return s;
  }, [findings]);

  const severityData = [
    { name: "Critical", value: stats.critical, color: severityColors.critical },
    { name: "High", value: stats.high, color: severityColors.high },
    { name: "Medium", value: stats.medium, color: severityColors.medium },
    { name: "Low", value: stats.low, color: severityColors.low },
    { name: "Info", value: stats.info, color: severityColors.info },
  ];

  const categoryData = useMemo(() => {
    const cats: Record<string, number> = {};
    findings.forEach(f => {
      if (f.status !== "resolved") cats[f.category] = (cats[f.category] || 0) + 1;
    });
    const colors = ["#ef4444", "#f97316", "#eab308", "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#6b7280"];
    return Object.entries(cats).map(([k, v], i) => ({
      name: categoryLabels[k] || k,
      value: v,
      color: colors[i % colors.length],
    }));
  }, [findings]);

  const topFindings = useMemo(() => {
    return findings
      .filter(f => f.status === "open")
      .sort((a, b) => b.cvss_score - a.cvss_score)
      .slice(0, 5);
  }, [findings]);

  const loading = pLoading || fLoading;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 text-muted-foreground/20 animate-spin" />
      </div>
    );
  }

  const totalOpen = stats.critical + stats.high + stats.medium + stats.low + stats.info;

  if (projects.length === 0 && findings.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-foreground/[0.03] border border-border/[0.06] flex items-center justify-center mx-auto">
            <FolderPlus className="h-6 w-6 text-muted-foreground/20" />
          </div>
          <div>
            <h3 className="text-sm text-foreground/60 font-light">No Projects Yet</h3>
            <p className="text-[10px] text-muted-foreground/30 mt-1 max-w-xs">
              Upload a codebase, ZIP file, or connect a GitHub repository to start scanning for vulnerabilities.
            </p>
          </div>
          <button
            onClick={onOpenScan}
            className="px-4 py-2 rounded-lg bg-foreground/[0.06] text-[10px] text-foreground/60 hover:bg-foreground/[0.1] transition-colors"
          >
            + Start First Scan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-5 space-y-5 max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-light tracking-[0.1em] text-foreground/80 uppercase">Security Posture</h2>
            <p className="text-[10px] text-muted-foreground/35 mt-0.5">
              {totalOpen} open vulnerabilities across {projects.length} project{projects.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-5 gap-3">
          {severityData.map((s) => (
            <div key={s.name} className="rounded-xl border border-border/[0.06] bg-card/20 backdrop-blur-sm p-3">
              <div className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">{s.name}</div>
              <div className="text-2xl font-extralight mt-1" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-2 gap-4">
          {severityData.some(s => s.value > 0) && (
            <div className="rounded-xl border border-border/[0.06] bg-card/20 backdrop-blur-sm p-4">
              <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">By Severity</span>
              <div className="h-36 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={severityData.filter(s => s.value > 0)} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={2} dataKey="value">
                      {severityData.filter(s => s.value > 0).map((entry, i) => (
                        <Cell key={i} fill={entry.color} opacity={0.8} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(0 0% 6%)", border: "1px solid hsl(0 0% 14%)", borderRadius: "8px", fontSize: "10px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                {severityData.filter(s => s.value > 0).map(s => (
                  <div key={s.name} className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-[9px] text-muted-foreground/40">{s.name} ({s.value})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {categoryData.length > 0 && (
            <div className="rounded-xl border border-border/[0.06] bg-card/20 backdrop-blur-sm p-4">
              <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">By Category</span>
              <div className="h-36 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={2} dataKey="value">
                      {categoryData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} opacity={0.8} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(0 0% 6%)", border: "1px solid hsl(0 0% 14%)", borderRadius: "8px", fontSize: "10px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                {categoryData.map(c => (
                  <div key={c.name} className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="text-[9px] text-muted-foreground/40">{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Projects + Action Required */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 rounded-xl border border-border/[0.06] bg-card/20 backdrop-blur-sm">
            <div className="px-4 py-3 border-b border-border/[0.06] flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Projects</span>
              <button onClick={() => onNavigate("project")} className="text-[9px] text-muted-foreground/30 hover:text-foreground/50 flex items-center gap-1">
                View all <ArrowRight className="h-2.5 w-2.5" />
              </button>
            </div>
            <div className="divide-y divide-border/[0.04]">
              {projects.map(p => (
                <div
                  key={p.id}
                  className="group w-full px-4 py-3 flex items-center gap-4 hover:bg-foreground/[0.02] transition-colors text-left"
                >
                  <button
                    onClick={() => onSelectProject(p.id)}
                    className="flex items-center gap-4 flex-1 min-w-0 text-left"
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-medium ${
                      p.risk_grade === "A" ? "bg-emerald-500/10 text-emerald-400" :
                      p.risk_grade === "B" ? "bg-blue-500/10 text-blue-400" :
                      p.risk_grade === "C" ? "bg-yellow-500/10 text-yellow-400" :
                      p.risk_grade === "D" ? "bg-orange-500/10 text-orange-400" :
                      "bg-red-500/10 text-red-400"
                    }`}>
                      {p.risk_grade}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-foreground/70 truncate">{p.name}</div>
                      <div className="text-[9px] text-muted-foreground/30">{p.language} • {p.source_type}</div>
                    </div>
                    <div className="flex items-center gap-2 text-[9px]">
                      {p.critical_count > 0 && <span className="text-red-400">{p.critical_count}C</span>}
                      {p.high_count > 0 && <span className="text-orange-400">{p.high_count}H</span>}
                      <span className="text-muted-foreground/25">{p.medium_count + p.low_count + p.info_count} other</span>
                    </div>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setPendingDelete({ id: p.id, name: p.name }); }}
                    title="Delete project"
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/5 transition-all"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {projects.length === 0 && (
                <div className="px-4 py-8 text-center text-[10px] text-muted-foreground/25">No projects yet</div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border/[0.06] bg-card/20 backdrop-blur-sm">
            <div className="px-4 py-3 border-b border-border/[0.06]">
              <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 text-red-400/60" />
                Action Required
              </span>
            </div>
            <div className="divide-y divide-border/[0.04]">
              {topFindings.map(f => (
                <button
                  key={f.id}
                  onClick={() => onSelectFinding(f.id)}
                  className="w-full px-4 py-3 text-left hover:bg-foreground/[0.02] transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <div className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                      f.severity === "critical" ? "bg-red-400" :
                      f.severity === "high" ? "bg-orange-400" : "bg-yellow-400"
                    }`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] text-foreground/60 line-clamp-1">{f.title}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[8px] text-muted-foreground/25">{f.file_path?.split("/").pop()}</span>
                        <span className="text-[8px] text-muted-foreground/20">{f.age_days}d old</span>
                        <span className="text-[8px] text-muted-foreground/20">CVSS {f.cvss_score}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
              {topFindings.length === 0 && (
                <div className="px-4 py-8 text-center text-[10px] text-muted-foreground/25">No open findings</div>
              )}
            </div>
          </div>
        </div>
      </div>
      <IdeDeleteConfirm
        open={!!pendingDelete}
        fileName={pendingDelete?.name ?? ""}
        onConfirm={handleDelete}
        onCancel={() => !deleting && setPendingDelete(null)}
      />
    </div>
  );
};

export default DashboardScreen;
