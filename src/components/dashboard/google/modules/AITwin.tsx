import { useState, useEffect } from "react";
import {
  Brain, Cpu, Zap, Shield, Eye, MessageSquare, Target,
  Clock, CheckCircle2, Sparkles, RefreshCw,
} from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";

const AITwin = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ emails: number; events: number; contacts: number; steps: number }>({
    emails: 0, events: 0, contacts: 0, steps: 0,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [gmailStats, calData, contactData, fitData] = await Promise.all([
        fetchGoogleData("gmail_stats").catch(() => ({ unread: 0 })),
        fetchGoogleData("calendar_events", { maxResults: 50 }).catch(() => ({ totalEvents: 0 })),
        fetchGoogleData("contacts", { pageSize: 1 }).catch(() => ({ totalContacts: 0 })),
        fetchGoogleData("fitness").catch(() => ({ dailyData: [] })),
      ]);
      const avgSteps = (fitData.dailyData || []).length > 0
        ? Math.round((fitData.dailyData || []).reduce((a: number, d: any) => a + d.steps, 0) / fitData.dailyData.length)
        : 0;
      setData({
        emails: gmailStats.unread || 0,
        events: calData.totalEvents || 0,
        contacts: contactData.totalContacts || 0,
        steps: avgSteps,
      });
    } catch (err) {
      console.error("Failed to fetch twin data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected) loadData();
  }, [isConnected]);

  const hasLive = isConnected && (data.emails > 0 || data.events > 0 || data.contacts > 0);

  const twinStats = hasLive
    ? [
        { label: "Unread Emails", value: String(data.emails) },
        { label: "Week Events", value: String(data.events) },
        { label: "Contacts", value: String(data.contacts) },
        { label: "Avg Steps/Day", value: data.steps > 0 ? data.steps.toLocaleString() : "—" },
      ]
    : [
        { label: "Data Points", value: "—" },
        { label: "Accuracy", value: "—" },
        { label: "Automations", value: "—" },
        { label: "Hours Saved/Wk", value: "—" },
      ];

  const twinCapabilities = [
    { icon: MessageSquare, label: "Communication Style", desc: "Writes emails, messages, and replies in YOUR voice" },
    { icon: Target, label: "Decision Making", desc: "Predicts your choices based on historical patterns" },
    { icon: Clock, label: "Schedule Management", desc: "Knows your routines, energy levels, and optimal work patterns" },
    { icon: Eye, label: "Preference Engine", desc: "Understands your food, entertainment, travel, and shopping preferences" },
    { icon: Shield, label: "Privacy Guardian", desc: "Monitors your digital footprint and alerts on exposure risks" },
    { icon: Sparkles, label: "Life Automator", desc: "Handles tasks before you even think about them" },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/5">
            <Brain className="h-6 w-6 text-foreground/70" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extralight tracking-wide text-foreground">AI Digital Twin</h2>
              {isConnected && (
                <button onClick={loadData} disabled={loading} className="flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-all disabled:opacity-50">
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                  Sync
                </button>
              )}
            </div>
            <p className="text-sm font-extralight leading-relaxed text-muted-foreground">
              {isConnected
                ? "Live data connected — your digital twin is learning from your email, calendar, contacts, and fitness data."
                : "Connect Google to create your complete digital replica."}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {twinStats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 text-center">
            <p className="text-xl font-extralight text-foreground">{loading ? "…" : s.value}</p>
            <p className="text-[10px] font-light text-muted-foreground/60 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {twinCapabilities.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 space-y-2">
            <div className="flex items-center gap-2">
              <c.icon className="h-4 w-4 text-foreground/50" />
              <span className="text-xs font-light text-foreground">{c.label}</span>
            </div>
            <p className="text-[10px] font-extralight text-muted-foreground leading-relaxed">{c.desc}</p>
          </div>
        ))}
      </div>

      {hasLive && (
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
          <h3 className="text-sm font-light tracking-wide text-foreground flex items-center gap-2">
            <Cpu className="h-4 w-4" /> Live Data Sources
          </h3>
          <div className="space-y-1.5">
            {[
              { label: "Gmail", detail: `${data.emails} unread emails being analyzed`, active: data.emails > 0 },
              { label: "Calendar", detail: `${data.events} events this week mapped`, active: data.events > 0 },
              { label: "Contacts", detail: `${data.contacts} contacts in social graph`, active: data.contacts > 0 },
              { label: "Fitness", detail: data.steps > 0 ? `${data.steps.toLocaleString()} avg steps/day tracked` : "No fitness data yet", active: data.steps > 0 },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-3 rounded-xl bg-foreground/5 px-4 py-2.5">
                <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${s.active ? "text-emerald-400" : "text-muted-foreground/30"}`} />
                <span className="text-xs font-light text-foreground w-20 shrink-0">{s.label}</span>
                <span className="text-[10px] text-muted-foreground/50">{s.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasLive && isConnected && !loading && (
        <div className="rounded-2xl border border-dashed border-border/30 bg-card/10 p-10 text-center space-y-3">
          <Brain className="h-10 w-10 text-muted-foreground/20 mx-auto" />
          <p className="text-sm font-extralight text-muted-foreground/50">
            No data available yet — your digital twin needs more activity to learn from.
          </p>
        </div>
      )}

      {!isConnected && (
        <div className="rounded-2xl border border-dashed border-border/30 bg-card/10 p-10 text-center space-y-3">
          <Brain className="h-10 w-10 text-muted-foreground/20 mx-auto" />
          <p className="text-sm font-extralight text-muted-foreground/50">
            Connect Google to create your complete digital replica.
          </p>
        </div>
      )}
    </div>
  );
};

export default AITwin;
