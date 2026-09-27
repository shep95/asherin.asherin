import { useState, useEffect, useMemo } from "react";
import { Bug, Lightbulb, Send, Loader2, Filter, Calendar, Sparkles, Check, Clock, AlertTriangle, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isOwnerEmail } from "@/lib/adminEmail";
interface BugReport {
  id: string;
  user_id: string;
  type: "bug" | "feature";
  title: string;
  description: string;
  severity: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Summary {
  id: string;
  summary: string;
  report_ids: string[];
  bug_count: number;
  feature_count: number;
  created_at: string;
}

type FilterType = "all" | "bug" | "feature";
type FilterDate = "all" | "today" | "week" | "month";
type FilterStatus = "all" | "open" | "in_progress" | "resolved" | "dismissed";

const BugReportsView = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = isOwnerEmail(user?.email);

  // Submit form state
  const [type, setType] = useState<"bug" | "feature">("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [submitting, setSubmitting] = useState(false);

  // Admin state
  const [reports, setReports] = useState<BugReport[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [summarizing, setSummarizing] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterDate, setFilterDate] = useState<FilterDate>("all");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [expandedSummary, setExpandedSummary] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    const { data: reportData } = await supabase
      .from("bug_reports")
      .select("*")
      .order("created_at", { ascending: false });
    if (reportData) setReports(reportData as any);

    if (isAdmin) {
      const { data: summaryData } = await supabase
        .from("bug_report_summaries")
        .select("*")
        .order("created_at", { ascending: false });
      if (summaryData) setSummaries(summaryData as any);
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim() || !user) return;
    setSubmitting(true);
    const { error } = await supabase.from("bug_reports").insert({
      user_id: user.id,
      type,
      title: title.trim(),
      description: description.trim(),
      severity,
    });
    if (error) {
      toast({ title: "Failed to submit", description: error.message, variant: "destructive" });
    } else {
      toast({ title: type === "bug" ? "Bug report submitted" : "Feature request submitted", description: "Thank you — this has been sent privately to the team." });
      setTitle("");
      setDescription("");
      setSeverity("medium");
      loadData();
    }
    setSubmitting(false);
  };

  const handleSummarize = async () => {
    setSummarizing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/summarize-bug-reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({}),
      });
      const result = await resp.json();
      if (result.error) {
        toast({ title: "Summarization failed", description: result.error, variant: "destructive" });
      } else {
        toast({ title: "Summary generated", description: `${result.bugCount || 0} bugs, ${result.featureCount || 0} features summarized.` });
        loadData();
      }
    } catch (e) {
      toast({ title: "Error", description: "Failed to summarize reports", variant: "destructive" });
    }
    setSummarizing(false);
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("bug_reports").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };

  const filteredReports = useMemo(() => {
    let filtered = reports;
    if (filterType !== "all") filtered = filtered.filter(r => r.type === filterType);
    if (filterStatus !== "all") filtered = filtered.filter(r => r.status === filterStatus);
    if (filterDate !== "all") {
      const now = new Date();
      const cutoff = new Date();
      if (filterDate === "today") cutoff.setHours(0, 0, 0, 0);
      else if (filterDate === "week") cutoff.setDate(now.getDate() - 7);
      else if (filterDate === "month") cutoff.setMonth(now.getMonth() - 1);
      filtered = filtered.filter(r => new Date(r.created_at) >= cutoff);
    }
    return filtered;
  }, [reports, filterType, filterDate, filterStatus]);

  const severityColor = (s: string) => {
    switch (s) {
      case "critical": return "text-red-400 bg-red-500/10";
      case "high": return "text-orange-400 bg-orange-500/10";
      case "medium": return "text-amber-400 bg-amber-500/10";
      default: return "text-muted-foreground bg-muted/30";
    }
  };

  const statusIcon = (s: string) => {
    switch (s) {
      case "resolved": return <Check className="h-3 w-3 text-emerald-400" />;
      case "in_progress": return <Clock className="h-3 w-3 text-amber-400" />;
      case "dismissed": return <AlertTriangle className="h-3 w-3 text-muted-foreground" />;
      default: return <div className="h-2 w-2 rounded-full bg-accent" />;
    }
  };

  if (loading) return <div className="flex justify-center items-center h-full"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 p-6 border-b border-border/20">
        <h1 className="text-xl font-extralight tracking-wide text-foreground">Bug Reports & Feature Requests</h1>
        <p className="text-xs font-extralight text-muted-foreground mt-1">
          {isAdmin ? "Review all submissions — generate AI summaries for action." : "Submit reports privately — only the admin team can see them."}
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <Tabs defaultValue={isAdmin ? "reports" : "submit"} className="flex flex-col h-full">
          <div className="flex-shrink-0 px-6 pt-4">
            <TabsList className="bg-card/30 border border-border/20">
              <TabsTrigger value="submit" className="text-xs font-light data-[state=active]:bg-foreground/10">Submit</TabsTrigger>
              {isAdmin && <TabsTrigger value="reports" className="text-xs font-light data-[state=active]:bg-foreground/10">All Reports ({reports.length})</TabsTrigger>}
              {isAdmin && <TabsTrigger value="summaries" className="text-xs font-light data-[state=active]:bg-foreground/10">AI Summaries ({summaries.length})</TabsTrigger>}
              {!isAdmin && <TabsTrigger value="my-reports" className="text-xs font-light data-[state=active]:bg-foreground/10">My Reports</TabsTrigger>}
            </TabsList>
          </div>

          {/* Submit Tab */}
          <TabsContent value="submit" className="flex-1 min-h-0 overflow-auto">
            <div className="max-w-xl mx-auto p-6 space-y-5">
              <div className="flex gap-2">
                <button onClick={() => setType("bug")} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-light transition-colors ${type === "bug" ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-card/20 text-muted-foreground border border-border/20 hover:bg-foreground/5"}`}>
                  <Bug className="h-3.5 w-3.5" /> Bug Report
                </button>
                <button onClick={() => setType("feature")} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-light transition-colors ${type === "feature" ? "bg-accent/10 text-accent border border-accent/20" : "bg-card/20 text-muted-foreground border border-border/20 hover:bg-foreground/5"}`}>
                  <Lightbulb className="h-3.5 w-3.5" /> Feature Request
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Title</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder={type === "bug" ? "e.g. Chat messages not loading after refresh" : "e.g. Add dark mode toggle to settings"} className="w-full bg-card/30 border border-border/20 rounded-xl px-4 py-3 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-accent/30 transition-colors" />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={6} placeholder={type === "bug" ? "Steps to reproduce, expected vs actual behavior, browser/device info…" : "Describe the feature, why it would be useful, and any examples…"} className="w-full bg-card/30 border border-border/20 rounded-xl px-4 py-3 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-accent/30 transition-colors resize-none" />
              </div>

              {type === "bug" && (
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Severity</label>
                  <div className="flex gap-2">
                    {["low", "medium", "high", "critical"].map(s => (
                      <button key={s} onClick={() => setSeverity(s)} className={`rounded-lg px-3 py-1.5 text-[10px] font-light capitalize transition-colors ${severity === s ? severityColor(s) + " border border-current/20" : "bg-card/20 text-muted-foreground border border-border/20 hover:bg-foreground/5"}`}>{s}</button>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={handleSubmit} disabled={!title.trim() || !description.trim() || submitting} className="inline-flex items-center gap-2 rounded-xl bg-accent/10 border border-accent/20 text-accent px-5 py-3 text-xs font-light hover:bg-accent/15 transition-colors disabled:opacity-40">
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Submit {type === "bug" ? "Bug Report" : "Feature Request"}
              </button>
            </div>
          </TabsContent>

          {/* My Reports (non-admin) */}
          {!isAdmin && (
            <TabsContent value="my-reports" className="flex-1 min-h-0">
              <ScrollArea className="h-full">
                <div className="p-6 space-y-2">
                  {reports.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-10">No reports submitted yet.</p>
                  ) : reports.map(r => (
                    <div key={r.id} className="rounded-xl border border-border/20 bg-card/20 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        {r.type === "bug" ? <Bug className="h-3.5 w-3.5 text-red-400" /> : <Lightbulb className="h-3.5 w-3.5 text-accent" />}
                        <span className="text-sm font-light text-foreground">{r.title}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] ${severityColor(r.severity)}`}>{r.severity}</span>
                      </div>
                      <p className="text-xs text-muted-foreground/70 leading-relaxed">{r.description}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
                        {statusIcon(r.status)}
                        <span className="capitalize">{r.status.replace("_", " ")}</span>
                        <span>·</span>
                        <span>{new Date(r.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          )}

          {/* Admin: All Reports */}
          {isAdmin && (
            <TabsContent value="reports" className="flex-1 min-h-0 flex flex-col">
              <div className="flex-shrink-0 px-6 py-3 flex flex-wrap items-center gap-2 border-b border-border/10">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <select value={filterType} onChange={e => setFilterType(e.target.value as FilterType)} className="bg-card/30 border border-border/20 rounded-lg px-2 py-1 text-[10px] text-foreground outline-none">
                  <option value="all">All Types</option>
                  <option value="bug">Bugs</option>
                  <option value="feature">Features</option>
                </select>
                <select value={filterDate} onChange={e => setFilterDate(e.target.value as FilterDate)} className="bg-card/30 border border-border/20 rounded-lg px-2 py-1 text-[10px] text-foreground outline-none">
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                </select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as FilterStatus)} className="bg-card/30 border border-border/20 rounded-lg px-2 py-1 text-[10px] text-foreground outline-none">
                  <option value="all">All Status</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Dismissed</option>
                </select>
                <div className="ml-auto">
                  <button onClick={handleSummarize} disabled={summarizing} className="inline-flex items-center gap-1.5 rounded-xl bg-accent/10 border border-accent/20 text-accent px-3 py-1.5 text-[10px] font-light hover:bg-accent/15 transition-colors disabled:opacity-40">
                    {summarizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    Generate AI Summary
                  </button>
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-6 space-y-2">
                  {filteredReports.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-10">No reports match filters.</p>
                  ) : filteredReports.map(r => (
                    <div key={r.id} className="rounded-xl border border-border/20 bg-card/20 p-4 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {r.type === "bug" ? <Bug className="h-3.5 w-3.5 text-red-400" /> : <Lightbulb className="h-3.5 w-3.5 text-accent" />}
                        <span className="text-sm font-light text-foreground">{r.title}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] ${severityColor(r.severity)}`}>{r.severity}</span>
                        <span className="text-[9px] text-muted-foreground/50 ml-auto">{new Date(r.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-xs text-muted-foreground/70 leading-relaxed">{r.description}</p>
                      <div className="flex items-center gap-2">
                        <select value={r.status} onChange={e => updateStatus(r.id, e.target.value)} className="bg-card/30 border border-border/20 rounded-lg px-2 py-1 text-[10px] text-foreground outline-none">
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                          <option value="dismissed">Dismissed</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          )}

          {/* Admin: AI Summaries */}
          {isAdmin && (
            <TabsContent value="summaries" className="flex-1 min-h-0">
              <ScrollArea className="h-full">
                <div className="p-6 space-y-3">
                  {summaries.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-10">No summaries generated yet. Go to Reports → Generate AI Summary.</p>
                  ) : summaries.map(s => (
                    <div key={s.id} className="rounded-xl border border-border/20 bg-card/20 overflow-hidden">
                      <button onClick={() => setExpandedSummary(expandedSummary === s.id ? null : s.id)} className="w-full flex items-center justify-between p-4 hover:bg-foreground/5 transition-colors text-left">
                        <div className="flex items-center gap-3">
                          <Sparkles className="h-4 w-4 text-accent" />
                          <div>
                            <span className="text-xs font-light text-foreground">{new Date(s.created_at).toLocaleDateString()} — {new Date(s.created_at).toLocaleTimeString()}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-red-400">{s.bug_count} bugs</span>
                              <span className="text-[10px] text-accent">{s.feature_count} features</span>
                              <span className="text-[10px] text-muted-foreground/50">{s.report_ids?.length || 0} reports</span>
                            </div>
                          </div>
                        </div>
                        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expandedSummary === s.id ? "rotate-180" : ""}`} />
                      </button>
                      {expandedSummary === s.id && (
                        <div className="px-4 pb-4 border-t border-border/10 pt-3">
                          <div className="prose prose-invert prose-xs max-w-none text-xs text-muted-foreground/80 leading-relaxed whitespace-pre-wrap">{s.summary}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
};

export default BugReportsView;
