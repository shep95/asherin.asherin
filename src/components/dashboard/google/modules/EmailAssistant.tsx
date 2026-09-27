import { useState, useEffect } from "react";
import {
  Mail, Send, Inbox, Star, Clock, AlertTriangle, CheckCircle2,
  PenTool, BarChart3, Users, Zap, Eye, MessageSquare, RefreshCw,
} from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";

const EmailAssistant = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const [loading, setLoading] = useState(false);
  const [liveStats, setLiveStats] = useState<any>(null);
  const [liveInbox, setLiveInbox] = useState<any[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [stats, inbox] = await Promise.all([
        fetchGoogleData("gmail_stats"),
        fetchGoogleData("gmail_inbox", { maxResults: 10 }),
      ]);
      setLiveStats(stats);
      setLiveInbox(inbox.messages || []);
    } catch (err) {
      console.error("Failed to fetch Gmail data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected) loadData();
  }, [isConnected]);

  const inboxStats = liveStats
    ? [
        { label: "Unread", value: String(liveStats.unread || 0), color: "text-foreground" },
        { label: "Important", value: String(liveStats.important || 0), color: "text-amber-400" },
        { label: "Starred", value: String(liveStats.starred || 0), color: "text-foreground" },
        { label: "Inbox Messages", value: String(liveInbox.length), color: "text-muted-foreground/50" },
      ]
    : [
        { label: "Unread", value: "—", color: "text-foreground" },
        { label: "Important", value: "—", color: "text-amber-400" },
        { label: "Starred", value: "—", color: "text-foreground" },
        { label: "Total", value: "—", color: "text-muted-foreground/50" },
      ];

  const emailPatterns = [
    { icon: Clock, text: "Connect Google to analyze your response patterns" },
    { icon: Mail, text: "Response rate and email volume will appear here" },
    { icon: BarChart3, text: "Busiest email times detected automatically" },
    { icon: Star, text: "Fastest response contacts identified" },
    { icon: Users, text: "Newsletter and recruiter detection" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/5">
            <Mail className="h-6 w-6 text-foreground/70" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extralight tracking-wide text-foreground">AI Email Assistant</h2>
              {isConnected && (
                <button onClick={loadData} disabled={loading} className="flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-all disabled:opacity-50">
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                  Sync
                </button>
              )}
            </div>
            <p className="text-sm font-extralight leading-relaxed text-muted-foreground">
              {isConnected
                ? "Live data connected — analyzing your inbox patterns, writing style, and email intelligence."
                : "Connect Google to unlock inbox intelligence, auto-replies in YOUR voice, and pattern detection."}
            </p>
          </div>
        </div>
      </div>

      {/* Inbox Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {inboxStats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 text-center">
            <p className={`text-xl font-extralight ${s.color}`}>{loading ? "…" : s.value}</p>
            <p className="text-[10px] font-light text-muted-foreground/60 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Live Inbox */}
      {liveInbox.length > 0 && (
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-4">
          <h3 className="text-sm font-light tracking-wide text-foreground flex items-center gap-2">
            <Inbox className="h-4 w-4" /> Recent Emails (Live)
          </h3>
          <div className="space-y-2">
            {liveInbox.map((msg) => (
              <div key={msg.id} className="rounded-xl border border-border/20 bg-foreground/5 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-light text-foreground truncate max-w-[70%]">{msg.subject || "(No Subject)"}</span>
                  {msg.isUnread && <span className="h-2 w-2 rounded-full bg-accent shrink-0" />}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
                  <span className="truncate max-w-[60%]">{msg.from}</span>
                  <span>·</span>
                  <span>{msg.date ? new Date(msg.date).toLocaleDateString() : ""}</span>
                </div>
                <p className="text-[10px] font-extralight text-muted-foreground/60 line-clamp-1">{msg.snippet}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Email Patterns */}
      <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
        <h3 className="text-xs font-light tracking-wide text-foreground flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5" /> Email Patterns
        </h3>
        <div className="space-y-2">
          {emailPatterns.map((p, i) => (
            <div key={i} className="flex items-center gap-2 py-1">
              <p.icon className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              <span className="text-[10px] font-extralight text-muted-foreground">{p.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EmailAssistant;
