import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, Search, X, ExternalLink, AlertTriangle, CheckCircle, Clock, Loader2, Copy, Check, FolderOpen, Download, Eye, RefreshCw, LayoutGrid, List } from "lucide-react";
import { useZerlalFindings, useZerlalProjects, useZerlalScans, useUpdateFinding } from "./useZerlalData";
import type { FindingSeverity, FindingStatus, ZerlalFinding } from "./types";
import { toast } from "sonner";
import BlueprintFindingsTable from "@/components/charts/BlueprintFindingsTable";
import LiveScanNarrative from "./LiveScanNarrative";
import { useActiveScan } from "./scanContext";

interface ProjectViewProps {
  projectId: string | null;
  onSelectProject: (id: string) => void;
  onSelectFinding: (id: string) => void;
  onBack: () => void;
  onRetryScan?: (projectId: string) => void;
}

const generateFindingReport = (f: ZerlalFinding): string => {
  let report = `══════════════════════════════════════════\n`;
  report += `SECURITY FINDING REPORT\n`;
  report += `══════════════════════════════════════════\n\n`;
  report += `Title: ${f.title}\n`;
  report += `Severity: ${f.severity.toUpperCase()} | CVSS: ${f.cvss_score} | CWE: ${f.cwe_id}\n`;
  report += `File: ${f.file_path || "N/A"}:${f.line_number}\n`;
  report += `Category: ${f.category} | Confidence: ${f.confidence}%\n`;
  report += `Status: ${f.status} | Age: ${f.age_days} days\n\n`;

  report += `── WHAT'S WRONG ──────────────────────────\n`;
  report += `${f.description}\n\n`;

  report += `── IMPACT ────────────────────────────────\n`;
  report += `${f.impact}\n\n`;

  if (f.exploitation_steps?.length > 0) {
    report += `── DEFENSIVE VERIFICATION ────────────────\n`;
    f.exploitation_steps.forEach((step, i) => {
      report += `  ${i + 1}. ${step}\n`;
    });
    report += `\n`;
  }

  if (f.code_snippet) {
    report += `── VULNERABLE CODE ───────────────────────\n`;
    report += `${f.code_snippet}\n\n`;
  }

  if (f.suggested_fix) {
    report += `── HOW TO FIX IT ─────────────────────────\n`;
    report += `${f.suggested_fix}\n\n`;
  }

  if (f.compliance_controls?.length > 0) {
    report += `── COMPLIANCE ────────────────────────────\n`;
    report += `${f.compliance_controls.join(", ")}\n\n`;
  }

  if (f.similar_cves?.length > 0) {
    report += `── SIMILAR CVEs ──────────────────────────\n`;
    report += `${f.similar_cves.join(", ")}\n\n`;
  }

  report += `══════════════════════════════════════════\n`;
  return report;
};

const generateFullReport = (projectName: string, findings: ZerlalFinding[]): string => {
  const now = new Date().toLocaleString();
  let report = `╔══════════════════════════════════════════════════════════════╗\n`;
  report += `║         ZERLAL SECURITY FINDINGS REPORT                     ║\n`;
  report += `╚══════════════════════════════════════════════════════════════╝\n\n`;
  report += `Project: ${projectName}\n`;
  report += `Generated: ${now}\n`;
  report += `Total Findings: ${findings.length}\n`;
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  findings.forEach(f => { if (f.severity in counts) counts[f.severity as keyof typeof counts]++; });
  report += `Critical: ${counts.critical} | High: ${counts.high} | Medium: ${counts.medium} | Low: ${counts.low} | Info: ${counts.info}\n\n`;
  report += `${"═".repeat(64)}\n\n`;
  findings.forEach((f, i) => {
    report += `[${i + 1}/${findings.length}] `;
    report += generateFindingReport(f);
    report += `\n`;
  });
  return report;
};

const downloadTextFile = (content: string, filename: string) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const severityBadge: Record<string, string> = {
  critical: "bg-red-500/15 text-red-400 border-red-500/20",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  low: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  info: "bg-muted/40 text-muted-foreground/60 border-border/20",
};
const statusBadge: Record<string, string> = {
  open: "bg-red-500/10 text-red-400",
  "in-progress": "bg-yellow-500/10 text-yellow-400",
  resolved: "bg-emerald-500/10 text-emerald-400",
  waived: "bg-muted/30 text-muted-foreground/50",
};

const ProjectView = ({ projectId, onSelectProject, onSelectFinding, onBack, onRetryScan }: ProjectViewProps) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"findings" | "history" | "sbom">("findings");
  const [tableMode, setTableMode] = useState<"blueprint" | "classic">("blueprint");

  const { projects } = useZerlalProjects();
  const { findings, loading: fLoading, refetch } = useZerlalFindings(projectId);
  const { scans, loading: sLoading } = useZerlalScans(projectId);
  const { markFalsePositive, waiveFinding, resolveFinding, assignFinding } = useUpdateFinding();
  const { active: activeScan } = useActiveScan();
  const isLiveForThisProject = activeScan && activeScan.projectId === projectId;

  // Refetch findings + project once the live scan completes
  const lastStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isLiveForThisProject) return;
    if (activeScan!.status === "complete" && lastStatusRef.current !== "complete") {
      lastStatusRef.current = "complete";
      refetch();
    } else {
      lastStatusRef.current = activeScan!.status;
    }
  }, [isLiveForThisProject, activeScan, refetch]);

  const project = projects.find(p => p.id === projectId);
  const displayProjectName = project?.name || (isLiveForThisProject ? activeScan.projectName : "Project");
  const displaySourceType = project?.source_type || (isLiveForThisProject ? activeScan.input.sourceType : "scan");

  const filtered = useMemo(() => {
    let f = [...findings];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      f = f.filter(fi => fi.title.toLowerCase().includes(q) || (fi.file_path || "").toLowerCase().includes(q));
    }
    if (severityFilter.length > 0) f = f.filter(fi => severityFilter.includes(fi.severity));
    if (statusFilter.length > 0) f = f.filter(fi => statusFilter.includes(fi.status));
    return f.sort((a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4));
  }, [findings, searchQuery, severityFilter, statusFilter]);

  const gradeColor = !project ? "text-muted-foreground/30" :
    project.risk_grade === "A" ? "text-emerald-400" : project.risk_grade === "B" ? "text-blue-400" :
    project.risk_grade === "C" ? "text-yellow-400" : project.risk_grade === "D" ? "text-orange-400" : "text-red-400";

  // While a live scan is running for this project, render even if findings are loading
  if (fLoading && !isLiveForThisProject) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground/20" /></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-5 max-w-[1200px] mx-auto space-y-4">
        {isLiveForThisProject && (
          <LiveScanNarrative projectId={projectId!} onSelectFinding={onSelectFinding} />
        )}
        {/* Header */}
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-[10px] text-muted-foreground/30 hover:text-foreground/50">← Back</button>
          
          {/* Project Dropdown Switcher */}
          {projects.length > 1 && (
            <div className="relative group">
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-foreground/[0.04] border border-border/[0.08] hover:bg-foreground/[0.07] transition-colors">
                <FolderOpen className="h-3 w-3 text-muted-foreground/40" />
                <span className="text-[10px] text-foreground/70 max-w-[160px] truncate">{project?.name || "Select Project"}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground/30" />
              </button>
              <div className="absolute top-full left-0 mt-1 w-64 rounded-xl border border-border/[0.08] bg-background/95 backdrop-blur-xl shadow-xl z-50 py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150">
                {projects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => onSelectProject(p.id)}
                    className={`w-full text-left px-3 py-2 hover:bg-foreground/[0.04] transition-colors flex items-center justify-between ${p.id === projectId ? "bg-foreground/[0.03]" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] text-foreground/70 truncate">{p.name}</p>
                      <p className="text-[8px] text-muted-foreground/30">{p.source_type} · {p.critical_count + p.high_count} issues</p>
                    </div>
                    <span className={`text-[10px] font-extralight shrink-0 ml-2 ${
                      p.risk_grade === "A" ? "text-emerald-400" : p.risk_grade === "B" ? "text-blue-400" :
                      p.risk_grade === "C" ? "text-yellow-400" : p.risk_grade === "D" ? "text-orange-400" : "text-red-400"
                    }`}>{p.risk_grade}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(project || isLiveForThisProject) && (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                {projects.length <= 1 && <h2 className="text-sm font-light tracking-wide text-foreground/80">{displayProjectName}</h2>}
                {project ? (
                  <span className={`text-lg font-extralight ${gradeColor}`}>{project.risk_grade}</span>
                ) : (
                  <span className="text-[9px] px-2 py-0.5 rounded-md border border-border/[0.08] bg-foreground/[0.03] text-muted-foreground/50 uppercase tracking-[0.15em]">intake live</span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-0.5">
                <span className="text-[9px] text-muted-foreground/30 flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" /> Last scan: {project?.last_scan_at ? new Date(project.last_scan_at).toLocaleDateString() : "Starting now"}
                </span>
                <span className="text-[9px] text-muted-foreground/30">{project?.language || "Queued"} • {displaySourceType}</span>
              </div>
            </div>
          )}
        </div>

        {/* Tabs + Report Actions */}
        <div className="flex items-center justify-between border-b border-border/[0.06]">
          <div className="flex gap-0">
            {(["findings", "history", "sbom"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-[10px] tracking-wider uppercase border-b-2 transition-all ${
                  activeTab === tab ? "border-foreground/30 text-foreground/70" : "border-transparent text-muted-foreground/30 hover:text-foreground/50"
                }`}
              >
                {tab === "findings" ? `Findings (${filtered.length})` : tab === "history" ? `Scan History (${scans.length})` : "SBOM"}
              </button>
            ))}
          </div>
          {activeTab === "findings" && filtered.length > 0 && (
            <div className="flex items-center gap-1.5 pb-1">
              <button
                onClick={() => {
                  const report = generateFullReport(project?.name || "Unknown", filtered);
                  setPreviewContent(report);
                  setPreviewOpen(true);
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-foreground/[0.04] text-[9px] text-muted-foreground/40 hover:text-foreground/60 hover:bg-foreground/[0.07] transition-colors"
              >
                <Eye className="h-3 w-3" /> Preview
              </button>
              <button
                onClick={() => {
                  const report = generateFullReport(project?.name || "Unknown", filtered);
                  navigator.clipboard.writeText(report);
                  toast.success("Full report copied to clipboard");
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-foreground/[0.04] text-[9px] text-muted-foreground/40 hover:text-foreground/60 hover:bg-foreground/[0.07] transition-colors"
              >
                <Copy className="h-3 w-3" /> Copy All
              </button>
              <button
                onClick={() => {
                  const report = generateFullReport(project?.name || "Unknown", filtered);
                  const safeName = (project?.name || "report").replace(/[^a-zA-Z0-9-_]/g, "_");
                  downloadTextFile(report, `zerlal-report-${safeName}.txt`);
                  toast.success("Report downloaded");
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-foreground/[0.06] text-[9px] text-foreground/60 hover:bg-foreground/[0.1] transition-colors"
              >
                <Download className="h-3 w-3" /> Download .txt
              </button>
            </div>
          )}
        </div>

        {activeTab === "findings" && (
          <>
            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/25" />
                <input type="text" placeholder="Search title or file..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-7 pr-3 py-1.5 rounded-lg bg-foreground/[0.03] border border-border/[0.06] text-[10px] text-foreground/70 placeholder:text-muted-foreground/20 focus:outline-none focus:border-foreground/10" />
              </div>
              <div className="flex gap-1">
                {["critical", "high", "medium", "low", "info"].map(s => (
                  <button key={s} onClick={() => setSeverityFilter(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                    className={`px-2 py-1 rounded-md text-[9px] uppercase tracking-wider border transition-all ${
                      severityFilter.includes(s) ? severityBadge[s] : "border-border/[0.06] text-muted-foreground/25"
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
              {(severityFilter.length > 0 || statusFilter.length > 0) && (
                <button onClick={() => { setSeverityFilter([]); setStatusFilter([]); }} className="text-[9px] text-muted-foreground/30 flex items-center gap-0.5">
                  <X className="h-2.5 w-2.5" /> Clear
                </button>
              )}
            </div>

            {/* Table Mode Toggle */}
            <div className="flex items-center justify-end gap-1">
              <span className="text-[8px] text-muted-foreground/25 uppercase tracking-wider mr-1">View</span>
              <button
                onClick={() => setTableMode("blueprint")}
                className={`p-1.5 rounded-md transition-colors ${tableMode === "blueprint" ? "bg-foreground/[0.08] text-foreground/60" : "text-muted-foreground/25 hover:text-foreground/40"}`}
                title="Blueprint table (sortable, resizable)"
              >
                <LayoutGrid className="h-3 w-3" />
              </button>
              <button
                onClick={() => setTableMode("classic")}
                className={`p-1.5 rounded-md transition-colors ${tableMode === "classic" ? "bg-foreground/[0.08] text-foreground/60" : "text-muted-foreground/25 hover:text-foreground/40"}`}
                title="Classic expandable view"
              >
                <List className="h-3 w-3" />
              </button>
            </div>

            {/* Blueprint table mode */}
            {tableMode === "blueprint" && (
              <BlueprintFindingsTable
                findings={filtered}
                onSelectFinding={onSelectFinding}
                onExpandFinding={(id) => setExpandedId(expandedId === id ? null : id)}
              />
            )}

            {/* Classic Expandable Table Mode */}
            {tableMode === "classic" && (
            <div className="rounded-xl border border-border/[0.06] bg-card/20 backdrop-blur-sm overflow-hidden">
              <div className="grid grid-cols-[80px_1fr_180px_80px_50px_50px_70px_70px] gap-2 px-4 py-2 border-b border-border/[0.06] text-[9px] text-muted-foreground/30 uppercase tracking-wider">
                <span>Severity</span><span>Title</span><span>File & Line</span><span>Category</span><span>Conf.</span><span>Age</span><span>CVSS</span><span>Status</span>
              </div>

              {filtered.map(f => (
                <div key={f.id}>
                  <button
                    onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
                    className="w-full grid grid-cols-[80px_1fr_180px_80px_50px_50px_70px_70px] gap-2 px-4 py-2 hover:bg-foreground/[0.02] transition-colors text-left items-center border-b border-border/[0.03]"
                  >
                    <span className={`text-[9px] px-2 py-0.5 rounded-md border text-center ${severityBadge[f.severity] || severityBadge.info}`}>
                      {f.severity.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-foreground/60 truncate flex items-center gap-1">
                      {expandedId === f.id ? <ChevronDown className="h-2.5 w-2.5 shrink-0" /> : <ChevronRight className="h-2.5 w-2.5 shrink-0" />}
                      {f.title}
                    </span>
                    <span className="text-[9px] text-muted-foreground/30 truncate font-mono">{f.file_path}:{f.line_number}</span>
                    <span className="text-[9px] text-muted-foreground/40">{f.category}</span>
                    <span className="text-[9px] text-muted-foreground/40">{f.confidence}%</span>
                    <span className="text-[9px] text-muted-foreground/30">{f.age_days}d</span>
                    <span className="text-[9px] text-muted-foreground/40">{f.cvss_score}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded text-center ${statusBadge[f.status] || ""}`}>{f.status}</span>
                  </button>

                  {expandedId === f.id && (
                    <div className="px-6 py-4 bg-foreground/[0.01] border-b border-border/[0.06] space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div>
                        <h4 className="text-[9px] text-muted-foreground/30 uppercase tracking-wider mb-1">What's happening</h4>
                        <p className="text-[11px] text-foreground/60 leading-relaxed">{f.description}</p>
                      </div>
                      <div>
                        <h4 className="text-[9px] text-muted-foreground/30 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <AlertTriangle className="h-2.5 w-2.5 text-red-400/50" /> What an attacker would do
                        </h4>
                        <p className="text-[11px] text-foreground/50 leading-relaxed">{f.impact}</p>
                      </div>

                      {/* Defensive verification, not reproduction */}
                      {f.exploitation_steps && f.exploitation_steps.length > 0 && (
                        <div>
                          <h4 className="text-[9px] text-foreground/50 uppercase tracking-wider mb-1">Defensive Verification</h4>
                          <ol className="space-y-1">
                            {f.exploitation_steps.map((step, i) => (
                              <li key={i} className="text-[10px] text-foreground/50 flex gap-2">
                                <span className="text-red-400/40 font-mono shrink-0">{i + 1}.</span>
                                <span>{step}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}

                      {f.code_snippet && (
                        <div>
                          <h4 className="text-[9px] text-muted-foreground/30 uppercase tracking-wider mb-1">Vulnerable Code</h4>
                          <pre className="text-[10px] font-mono bg-background/60 rounded-lg p-3 border border-red-500/10 text-red-300/70 overflow-x-auto whitespace-pre-wrap leading-5">{f.code_snippet}</pre>
                        </div>
                      )}
                      {f.suggested_fix && (
                        <div>
                          <h4 className="text-[9px] text-muted-foreground/30 uppercase tracking-wider mb-1 flex items-center gap-1">
                            <CheckCircle className="h-2.5 w-2.5 text-emerald-400/50" /> Suggested Fix
                          </h4>
                          <pre className="text-[10px] font-mono bg-background/60 rounded-lg p-3 border border-emerald-500/10 text-emerald-300/70 overflow-x-auto whitespace-pre-wrap leading-5">{f.suggested_fix}</pre>
                        </div>
                      )}

                      {/* Compliance */}
                      {f.compliance_controls && f.compliance_controls.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {f.compliance_controls.map(c => (
                            <span key={c} className="text-[8px] px-1.5 py-0.5 rounded bg-foreground/[0.03] border border-border/[0.06] text-muted-foreground/40">{c}</span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-2 border-t border-border/[0.04]">
                        <button
                          onClick={async () => {
                            const report = generateFindingReport(f);
                            await navigator.clipboard.writeText(report);
                            setCopiedId(f.id);
                            toast.success("Detailed report copied to clipboard");
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-foreground/[0.06] text-[9px] text-foreground/60 hover:bg-foreground/[0.1] flex items-center gap-1"
                        >
                          {copiedId === f.id ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
                          {copiedId === f.id ? "Copied!" : "Copy Report"}
                        </button>
                        <button className="px-3 py-1.5 rounded-lg bg-foreground/[0.06] text-[9px] text-foreground/60 hover:bg-foreground/[0.1]">Create PR with fix</button>
                        <button onClick={async () => { const name = prompt("Assign to (name/email):"); if (name) { await assignFinding(f.id, name); refetch(); } }} className="px-3 py-1.5 rounded-lg bg-foreground/[0.03] text-[9px] text-muted-foreground/40 hover:text-foreground/60">Assign</button>
                        <button onClick={async () => { await markFalsePositive(f.id); refetch(); }} className="px-3 py-1.5 rounded-lg bg-foreground/[0.03] text-[9px] text-muted-foreground/40 hover:text-foreground/60">False positive</button>
                        <button onClick={async () => { const reason = prompt("Waiver reason:"); if (reason) { await waiveFinding(f.id, reason); refetch(); } }} className="px-3 py-1.5 rounded-lg bg-foreground/[0.03] text-[9px] text-muted-foreground/40 hover:text-foreground/60">Waive</button>
                        <button onClick={async () => { await resolveFinding(f.id); refetch(); }} className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-[9px] text-emerald-400/60 hover:bg-emerald-500/20">Resolve</button>
                        <button onClick={() => onSelectFinding(f.id)} className="ml-auto px-3 py-1.5 rounded-lg text-[9px] text-muted-foreground/30 hover:text-foreground/50 flex items-center gap-1">
                          Full detail <ExternalLink className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {filtered.length === 0 && (
                <div className="py-12 text-center">
                  <CheckCircle className="h-6 w-6 text-emerald-400/30 mx-auto mb-2" />
                  <p className="text-[11px] text-muted-foreground/30">{findings.length === 0 ? "No vulnerabilities found yet. Run a scan." : "No findings match your filters"}</p>
                </div>
              )}
            </div>
            )}

            {/* Count indicator */}
            {filtered.length > 0 && (
              <div className="text-[9px] text-muted-foreground/25 text-center">
                Showing all {filtered.length} findings — no limit applied
              </div>
            )}
          </>
        )}

        {activeTab === "history" && (
          <div className="rounded-xl border border-border/[0.06] bg-card/20 backdrop-blur-sm overflow-hidden">
            <div className="grid grid-cols-[1fr_120px_80px_80px_80px_80px_100px_60px] gap-2 px-4 py-2 border-b border-border/[0.06] text-[9px] text-muted-foreground/30 uppercase tracking-wider">
              <span>Profile</span><span>Status</span><span>Findings</span><span>Critical</span><span>High</span><span>Duration</span><span>Date</span><span></span>
            </div>
            {scans.map(s => (
              <div key={s.id} className="grid grid-cols-[1fr_120px_80px_80px_80px_80px_100px_60px] gap-2 px-4 py-2.5 border-b border-border/[0.03] text-[10px] items-center">
                <span className="text-foreground/60">{s.scan_profile}</span>
                <span className={s.status === "complete" ? "text-emerald-400" : s.status === "running" ? "text-yellow-400" : "text-red-400"}>{s.status}</span>
                <span className="text-foreground/50">{s.findings_count}</span>
                <span className="text-red-400">{s.critical_count}</span>
                <span className="text-orange-400">{s.high_count}</span>
                <span className="text-muted-foreground/40">{s.duration ? `${s.duration}s` : "—"}</span>
                <span className="text-muted-foreground/30">{new Date(s.created_at).toLocaleDateString()}</span>
                <span>
                  {s.status === "failed" && onRetryScan && projectId && (
                    <button
                      onClick={() => onRetryScan(projectId)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md bg-foreground/[0.05] text-[9px] text-muted-foreground/50 hover:text-foreground/70 hover:bg-foreground/[0.08] transition-colors"
                      title="Retry scan"
                    >
                      <RefreshCw className="h-3 w-3" /> Retry
                    </button>
                  )}
                </span>
              </div>
            ))}
            {scans.length === 0 && (
              <div className="py-8 text-center text-[10px] text-muted-foreground/25">No scan history</div>
            )}
          </div>
        )}

        {activeTab === "sbom" && (
          <div className="rounded-xl border border-border/[0.06] bg-card/20 backdrop-blur-sm p-12 text-center">
            <p className="text-[11px] text-muted-foreground/30">SBOM data will be generated during compliance scans</p>
          </div>
        )}
      </div>

      {/* Report Preview Modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-200">
          <div className="flex items-center justify-between px-6 py-3 border-b border-border/[0.08]">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-foreground/60" />
              <span className="text-[11px] font-light tracking-wider text-foreground/80 uppercase">Report Preview</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(previewContent);
                  toast.success("Copied to clipboard");
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-foreground/[0.06] text-[10px] text-foreground/60 hover:bg-foreground/[0.1] transition-colors"
              >
                <Copy className="h-3 w-3" /> Copy
              </button>
              <button
                onClick={() => {
                  const safeName = (project?.name || "report").replace(/[^a-zA-Z0-9-_]/g, "_");
                  downloadTextFile(previewContent, `zerlal-report-${safeName}.txt`);
                  toast.success("Downloaded");
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-foreground/[0.06] text-[10px] text-foreground/60 hover:bg-foreground/[0.1] transition-colors"
              >
                <Download className="h-3 w-3" /> Download
              </button>
              <button
                onClick={() => setPreviewOpen(false)}
                className="p-2 rounded-lg text-muted-foreground/40 hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <pre className="max-w-4xl mx-auto text-[11px] font-mono text-foreground/70 leading-6 whitespace-pre-wrap">{previewContent}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectView;
