import { useState, useEffect, useCallback, useRef } from "react";
import { Newspaper, Send, RefreshCw, Loader2, AlertTriangle, Eye, Trash2, Settings2, Clock, Download, FileText, Bell, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { emitPull } from "@/lib/connect/emitPull";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import BriefingProfileEditor from "./briefing/BriefingProfileEditor";

interface BriefingReport {
  id: string;
  title: string;
  content: string;
  sources_checked: number;
  critical_items: number;
  significant_items: number;
  monitoring_items: number;
  created_at: string;
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const TIMEZONES = [
  { label: "Local Time", value: "local" },
  { label: "EST (UTC-5)", value: "EST" },
  { label: "CST (UTC-6)", value: "CST" },
  { label: "MST (UTC-7)", value: "MST" },
  { label: "PST (UTC-8)", value: "PST" },
  { label: "GMT (UTC+0)", value: "GMT" },
  { label: "CET (UTC+1)", value: "CET" },
  { label: "IST (UTC+5:30)", value: "IST" },
  { label: "JST (UTC+9)", value: "JST" },
  { label: "AEST (UTC+10)", value: "AEST" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = i.toString().padStart(2, "0");
  const label = i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`;
  return { value: `${h}:00`, label };
});

// Section extraction for tabbed view
function extractSection(content: string, heading: string): string {
  const regex = new RegExp(`## ${heading}[\\s\\S]*?(?=\\n## |\\n---|\$)`, "i");
  const match = content.match(regex);
  if (!match) return "";
  return match[0].replace(new RegExp(`^## ${heading}\\s*`, "i"), "").trim();
}

type ReportTab = "full" | "verified" | "contested" | "perspectives" | "predictions" | "economic" | "humanitarian" | "gaps";

const REPORT_TABS: { id: ReportTab; label: string }[] = [
  { id: "full", label: "Full Report" },
  { id: "verified", label: "Verified" },
  { id: "contested", label: "Contested" },
  { id: "perspectives", label: "Perspectives" },
  { id: "predictions", label: "Predictions" },
  { id: "economic", label: "Economic" },
  { id: "humanitarian", label: "Impact" },
  { id: "gaps", label: "Gaps" },
];

const BriefingView = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [reports, setReports] = useState<BriefingReport[]>([]);
  const [activeReport, setActiveReport] = useState<BriefingReport | null>(null);
  const [reportTab, setReportTab] = useState<ReportTab>("full");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [deliveryTime, setDeliveryTime] = useState("08:00");
  const [timezone, setTimezone] = useState("local");
  const [showEditor, setShowEditor] = useState(false);

  // Chat onboarding state
  const [showSetup, setShowSetup] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); };
  useEffect(() => { scrollToBottom(); }, [chatMessages]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [profileRes, reportsRes] = await Promise.all([
      supabase.from("briefing_profiles").select("*").eq("user_id", user.id).single(),
      supabase.from("briefing_reports").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    ]);
    if (profileRes.data) {
      setHasProfile(true);
      setDeliveryTime(profileRes.data.delivery_time || "08:00");
    } else {
      setShowSetup(true);
    }
    if (reportsRes.data) setReports(reportsRes.data as BriefingReport[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const startOnboarding = useCallback(async () => {
    if (chatMessages.length > 0) return;
    setChatLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("briefing-onboard", {
        body: { messages: [{ role: "user", content: "Hi, I'd like to set up my intelligence briefing profile." }], current_profile: { delivery_time: deliveryTime } },
      });
      if (error) throw error;
      setChatMessages([
        { role: "user", content: "Hi, I'd like to set up my intelligence briefing profile." },
        { role: "assistant", content: data.reply },
      ]);
    } catch {
      setChatMessages([{ role: "assistant", content: "welcome to asherin.briefing. i'll help set up your daily briefing. what is your company name and industry?" }]);
    }
    setChatLoading(false);
  }, [chatMessages.length, deliveryTime]);

  useEffect(() => {
    if (showSetup && chatMessages.length === 0) startOnboarding();
  }, [showSetup, startOnboarding]);

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    const newMessages = [...chatMessages, { role: "user" as const, content: userMsg }];
    setChatMessages(newMessages);
    setChatLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("briefing-onboard", {
        body: { messages: newMessages.map(m => ({ role: m.role, content: m.content })), current_profile: { delivery_time: deliveryTime } },
      });
      if (error) throw error;
      setChatMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
      if (data.profile_saved) {
        setProfileSaved(true);
        setHasProfile(true);
        toast({ title: "Profile saved", description: "Your intelligence briefing profile is ready." });
      }
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Sorry, I had trouble processing that. Could you try again?" }]);
    }
    setChatLoading(false);
  };

  const saveDeliveryTime = async () => {
    if (!user) return;
    const timeValue = timezone === "local" ? deliveryTime : `${deliveryTime} ${timezone}`;
    if (hasProfile) await supabase.from("briefing_profiles").update({ delivery_time: timeValue }).eq("user_id", user.id);
    toast({ title: "Delivery time updated" });
  };

  const generateBriefing = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const started = performance.now();
      const { data, error } = await supabase.functions.invoke("generate-briefing");
      void emitPull({
        organ: "briefings", capability: "generate", fromSurface: "briefings",
        status: error ? "fail" : "ok", latencyMs: performance.now() - started,
        quote: error ? error.message : `${data?.sources_checked ?? 0} sources checked`,
      });
      if (error) throw error;
      if (data?.briefing) {
        toast({ title: "Briefing generated", description: `${data.sources_checked} sources analyzed with cross-validation.` });
        await loadData();
        if (data.report_id) {
          const newReport: BriefingReport = {
            id: data.report_id, title: `Intelligence Brief — ${new Date().toLocaleDateString()}`,
            content: data.briefing, sources_checked: data.sources_checked,
            critical_items: 0, significant_items: 0, monitoring_items: 0, created_at: new Date().toISOString(),
          };
          setActiveReport(newReport);
        }
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setGenerating(false);
  };

  const deleteReport = async (id: string) => {
    const { error } = await supabase.from("briefing_reports").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setReports(prev => prev.filter(r => r.id !== id));
    if (activeReport?.id === id) setActiveReport(null);
    toast({ title: "Report deleted" });
  };

  const deleteProfile = async () => {
    if (!user) return;
    const { error } = await supabase.from("briefing_profiles").delete().eq("user_id", user.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setHasProfile(false);
    setShowSetup(true);
    setChatMessages([]);
    toast({ title: "Profile deleted", description: "You can set up a new briefing profile." });
  };

  const finishSetup = () => {
    saveDeliveryTime();
    setShowSetup(false);
    setChatMessages([]);
    setProfileSaved(false);
    loadData();
  };

  const downloadBriefing = (report: BriefingReport) => {
    const blob = new Blob([report.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.title.replace(/[^a-zA-Z0-9 —-]/g, "")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 text-muted-foreground animate-spin" /></div>;
  }

  // Profile editor view
  if (showEditor) {
    return <BriefingProfileEditor onClose={() => setShowEditor(false)} onSaved={() => { setShowEditor(false); loadData(); }} />;
  }

  // Active report view with tabs
  if (activeReport) {
    const getTabContent = (): string => {
      switch (reportTab) {
        case "verified": return extractSection(activeReport.content, "VERIFIED FACTS") || "No verified facts section found in this report.";
        case "contested": return extractSection(activeReport.content, "CONTESTED CLAIMS") || "No contested claims found — all claims were cross-validated.";
        case "perspectives": {
          const perspectives = extractSection(activeReport.content, "PERSPECTIVE ANALYSIS");
          const mainstream = extractSection(activeReport.content, "Mainstream Narrative");
          const counter = extractSection(activeReport.content, "Counter-Narrative");
          const independent = extractSection(activeReport.content, "Independent Assessment");
          if (perspectives) return `## Perspective Analysis\n\n${perspectives}`;
          if (mainstream || counter || independent) {
            return [
              mainstream ? `### Mainstream Narrative\n${mainstream}` : "",
              counter ? `### Counter-Narrative\n${counter}` : "",
              independent ? `### Independent Assessment\n${independent}` : "",
            ].filter(Boolean).join("\n\n");
          }
          return "No multi-perspective analysis found in this report.";
        }
        case "predictions": {
          const hist = extractSection(activeReport.content, "HISTORICAL CONTEXT") || "";
          const pred = extractSection(activeReport.content, "PREDICTION ENGINE") || "";
          const scenarios = extractSection(activeReport.content, "ALTERNATIVE SCENARIOS") || "";
          const combined = [
            hist ? `## Historical Context\n\n${hist}` : "",
            pred ? `## Prediction Engine\n\n${pred}` : "",
            scenarios ? `## Alternative Scenarios\n\n${scenarios}` : "",
          ].filter(Boolean).join("\n\n");
          return combined || "No predictive intelligence available for this report.";
        }
        case "economic": {
          const econ = extractSection(activeReport.content, "ECONOMIC IMPACT") || "";
          const supply = extractSection(activeReport.content, "SUPPLY CHAIN") || "";
          const market = extractSection(activeReport.content, "MARKET & COMPETITIVE") || "";
          const combined = [
            econ ? `## Economic Impact\n\n${econ}` : "",
            supply ? `## Supply Chain\n\n${supply}` : "",
            market ? `## Market & Competitive Signals\n\n${market}` : "",
          ].filter(Boolean).join("\n\n");
          return combined || "No economic intelligence available for this report.";
        }
        case "humanitarian": {
          const humanitarian = extractSection(activeReport.content, "HUMANITARIAN") || "";
          const legal = extractSection(activeReport.content, "LEGAL") || "";
          const diplomatic = extractSection(activeReport.content, "DIPLOMATIC") || "";
          const regional = extractSection(activeReport.content, "REGIONAL IMPACT") || "";
          const sentiment = extractSection(activeReport.content, "PUBLIC SENTIMENT") || "";
          const cyber = extractSection(activeReport.content, "CYBER") || "";
          const misinfo = extractSection(activeReport.content, "MISINFORMATION") || "";
          const weapons = extractSection(activeReport.content, "WEAPONS") || "";
          const source = extractSection(activeReport.content, "SOURCE CREDIBILITY") || "";
          const confidence = extractSection(activeReport.content, "AI CONFIDENCE") || "";
          const combined = [
            humanitarian ? `## Humanitarian Status\n\n${humanitarian}` : "",
            legal ? `## Legal & Compliance\n\n${legal}` : "",
            diplomatic ? `## Diplomatic Efforts\n\n${diplomatic}` : "",
            regional ? `## Regional Impact\n\n${regional}` : "",
            sentiment ? `## Public Sentiment\n\n${sentiment}` : "",
            cyber ? `## Cyber & Information Warfare\n\n${cyber}` : "",
            misinfo ? `## Misinformation Tracker\n\n${misinfo}` : "",
            weapons ? `## Weapons & Systems\n\n${weapons}` : "",
            source ? `## Source Credibility\n\n${source}` : "",
            confidence ? `## AI Confidence\n\n${confidence}` : "",
          ].filter(Boolean).join("\n\n");
          return combined || "No impact intelligence available for this report.";
        }
        case "gaps": return extractSection(activeReport.content, "INTELLIGENCE GAPS") || "No intelligence gaps identified.";
        default: return activeReport.content;
      }
    };

    return (
      <div className="flex flex-1 flex-col h-full">
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-border/20">
          <button onClick={() => { setActiveReport(null); setReportTab("full"); }} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            ← Back to Briefings
          </button>
          <div className="flex items-center gap-3">
            <button onClick={() => downloadBriefing(activeReport)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors" title="Download">
              <Download className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={async () => {
                try {
                  const { data: nb } = await (supabase.from as any)("notebooks").insert({
                    title: activeReport.title || "Briefing Analysis",
                    description: `Created from briefing on ${new Date(activeReport.created_at).toLocaleDateString()}`,
                    owner_id: user!.id,
                  }).select().single();
                  if (nb) {
                    await (supabase.from as any)("notebook_cells").insert({
                      notebook_id: nb.id, cell_type: "text", position: 0,
                      content: `# ${activeReport.title}\n\n${activeReport.content}`,
                    });
                    toast({ title: "Notebook created", description: `"${nb.title}" with briefing data.` });
                  }
                } catch {
                  toast({ title: "Error", description: "Failed to create notebook.", variant: "destructive" });
                }
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors" title="Open in Notebook"
            >
              <FileText className="h-3.5 w-3.5" /> Notebook
            </button>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>{activeReport.sources_checked} sources</span>
              <span>•</span>
              <span>{new Date(activeReport.created_at).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Report tabs */}
        <div className="flex-shrink-0 border-b border-border/10 px-4">
          <div className="flex items-center gap-1 overflow-x-auto">
            {REPORT_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setReportTab(tab.id)}
                className={`px-3 py-2.5 text-[10px] font-light tracking-wide transition-colors border-b-2 whitespace-nowrap ${
                  reportTab === tab.id
                    ? "border-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground/70"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="max-w-3xl mx-auto p-6">
            <div className="prose prose-invert prose-sm max-w-none [&_h1]:text-lg [&_h1]:font-extralight [&_h1]:tracking-wide [&_h2]:text-sm [&_h2]:font-light [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-xs [&_h3]:font-light [&_h3]:mt-4 [&_h3]:mb-2 [&_p]:text-xs [&_p]:font-extralight [&_p]:leading-relaxed [&_p]:text-foreground/80 [&_li]:text-xs [&_li]:font-extralight [&_a]:text-accent [&_a]:no-underline hover:[&_a]:underline [&_hr]:border-border/20 [&_strong]:text-foreground [&_strong]:font-light">
              <ReactMarkdown>{getTabContent()}</ReactMarkdown>
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Conversational onboarding
  if (showSetup || !hasProfile) {
    return (
      <div className="flex flex-1 flex-col h-full">
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-border/20">
          <div className="flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-light text-foreground">asherin.briefing — setup</h2>
          </div>
          {hasProfile && (
            <button onClick={() => { setShowSetup(false); setChatMessages([]); }} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="max-w-2xl mx-auto p-6 space-y-4">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs font-extralight leading-relaxed ${
                  msg.role === "user"
                    ? "bg-accent text-accent-foreground rounded-br-md"
                    : "bg-card/40 border border-border/20 text-foreground rounded-bl-md"
                }`}>
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-card/40 border border-border/20 rounded-2xl rounded-bl-md px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            {profileSaved && (
              <div className="rounded-xl border border-accent/20 bg-accent/5 p-5 space-y-4 mt-4">
                <p className="text-xs font-light text-foreground">Your profile is ready. Set your preferred briefing delivery time:</p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-accent" />
                    <select value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)}
                      className="rounded-lg border border-border/20 bg-card/30 px-3 py-2 text-xs text-foreground outline-none focus:border-accent/30 appearance-none cursor-pointer">
                      {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
                    </select>
                  </div>
                  <select value={timezone} onChange={(e) => setTimezone(e.target.value)}
                    className="rounded-lg border border-border/20 bg-card/30 px-3 py-2 text-xs text-foreground outline-none focus:border-accent/30 appearance-none cursor-pointer">
                    {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                  </select>
                </div>
                <button onClick={finishSetup}
                  className="w-full rounded-xl bg-accent text-accent-foreground py-3 text-xs font-light tracking-wide hover:bg-accent/90 transition-all flex items-center justify-center gap-2">
                  Activate Briefings
                </button>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </ScrollArea>

        {!profileSaved && (
          <div className="flex-shrink-0 border-t border-border/20 p-4">
            <div className="max-w-2xl mx-auto flex items-center gap-3">
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                placeholder="Tell asherin about your business..."
                className="flex-1 rounded-xl border border-border/20 bg-card/20 px-4 py-3 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-accent/30"
                disabled={chatLoading} />
              <button onClick={sendChatMessage} disabled={chatLoading || !chatInput.trim()}
                className="rounded-xl bg-accent text-accent-foreground p-3 hover:bg-accent/90 transition-all disabled:opacity-50">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Main view — reports list
  return (
    <div className="flex flex-1 flex-col h-full">
      <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-border/20">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-light text-foreground">asherin.briefing</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowEditor(true)} className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors" title="Edit profile">
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={() => { setShowSetup(true); setChatMessages([]); }} className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors" title="Reconfigure via chat">
            <Settings2 className="h-4 w-4" />
          </button>
          <button onClick={() => { if (confirm("Delete your briefing profile and start over?")) deleteProfile(); }} className="rounded-lg p-2 text-muted-foreground hover:text-destructive hover:bg-foreground/5 transition-colors" title="Delete profile & reset">
          </button>
          <button onClick={generateBriefing} disabled={generating}
            className="flex items-center gap-2 rounded-xl bg-accent text-accent-foreground px-4 py-2 text-xs font-light hover:bg-accent/90 transition-all disabled:opacity-50">
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {generating ? "Analyzing…" : "Generate Now"}
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto p-6 space-y-4">
          {/* Delivery time setting */}
          <div className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>Daily at</span>
                <select value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} onBlur={saveDeliveryTime}
                  className="rounded-lg border border-border/20 bg-card/30 px-2 py-1 text-xs text-foreground outline-none focus:border-accent/30 appearance-none cursor-pointer">
                  {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
                </select>
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)} onBlur={saveDeliveryTime}
                  className="rounded-lg border border-border/20 bg-card/30 px-2 py-1 text-xs text-foreground outline-none focus:border-accent/30 appearance-none cursor-pointer">
                  {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </div>
              <button onClick={() => setShowEditor(true)} className="text-[10px] text-accent hover:text-accent/80 transition-colors flex items-center gap-1">
                <Pencil className="h-3 w-3" /> Edit Topics
              </button>
            </div>
          </div>

          {/* Reports list */}
          {reports.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <Newspaper className="h-10 w-10 text-muted-foreground/30 mx-auto" />
              <p className="text-sm font-extralight text-muted-foreground">No briefings generated yet.</p>
              <p className="text-xs font-extralight text-muted-foreground/60">Click "Generate Now" to create your first multi-source intelligence briefing.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {reports.map((report) => (
                <div key={report.id}
                  className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-4 hover:bg-foreground/5 transition-colors cursor-pointer group"
                  onClick={() => setActiveReport(report)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-light text-foreground">{report.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {report.sources_checked} sources • Cross-validated • {new Date(report.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {report.critical_items > 0 && (
                        <span className="flex items-center gap-1 text-[10px] text-destructive">
                          <AlertTriangle className="h-3 w-3" /> {report.critical_items}
                        </span>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); downloadBriefing(report); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-accent transition-all" title="Download">
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteReport(report.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default BriefingView;
