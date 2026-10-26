import { useState, useEffect, useCallback } from "react";
import { Mail, Inbox, RefreshCw, AlertTriangle } from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";
import { CONNECT_UNAVAILABLE, describeFailure } from "../offline";

// courier — inbox counters and the ten most recent messages.
//
// the "email patterns" list that promised response-rate analysis, busiest
// hours and fastest-reply contacts is gone: nothing here computes any of it.

interface InboxMessage {
  id: string;
  subject?: string;
  from?: string;
  date?: string;
  snippet?: string;
  isUnread?: boolean;
}

interface Stats { unread?: number; important?: number; starred?: number }

const EmailAssistant = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveStats, setLiveStats] = useState<Stats | null>(null);
  const [liveInbox, setLiveInbox] = useState<InboxMessage[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stats, inbox] = await Promise.all([
        fetchGoogleData("gmail_stats"),
        fetchGoogleData("gmail_inbox", { maxResults: 10 }),
      ]);
      setLiveStats(stats);
      setLiveInbox(inbox.messages || []);
    } catch (err) {
      setError(describeFailure(err, "mail organ"));
    } finally {
      setLoading(false);
    }
  }, [fetchGoogleData]);

  useEffect(() => {
    if (isConnected) void loadData();
  }, [isConnected, loadData]);

  const inboxStats = [
    { label: "unread", value: liveStats ? String(liveStats.unread || 0) : "—" },
    { label: "important", value: liveStats ? String(liveStats.important || 0) : "—" },
    { label: "starred", value: liveStats ? String(liveStats.starred || 0) : "—" },
    { label: "read here", value: liveStats ? String(liveInbox.length) : "—" },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
            <Mail className="h-6 w-6 text-foreground/70" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extralight tracking-wide text-foreground">correspondence desk</h2>
              {isConnected && (
                <button
                  type="button"
                  onClick={() => void loadData()}
                  disabled={loading}
                  className="flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
                  read again
                </button>
              )}
            </div>
            <p className="text-sm font-extralight leading-relaxed text-muted-foreground">
              {isConnected
                ? "inbox counters and the ten most recent messages from the connected mailbox. subjects, senders and snippets only — no body is fetched."
                : CONNECT_UNAVAILABLE}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-border/25 bg-card/20 px-4 py-3 text-[11px] font-extralight text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {error}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {inboxStats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 text-center">
            <p className="text-xl font-extralight text-foreground">{loading ? "…" : s.value}</p>
            <p className="text-[10px] font-light text-muted-foreground/60 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {liveInbox.length > 0 && (
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-4">
          <h3 className="text-sm font-light tracking-wide text-foreground flex items-center gap-2">
            <Inbox className="h-4 w-4" aria-hidden /> recent mail
          </h3>
          <div className="space-y-2">
            {liveInbox.map((msg) => (
              <div key={msg.id} className="rounded-xl border border-border/20 bg-foreground/5 p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs font-light text-foreground">{msg.subject || "(no subject)"}</span>
                  {msg.isUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="unread" />}
                </div>
                <div className="flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground/50">
                  <span className="min-w-0 truncate">{msg.from}</span>
                  <span aria-hidden>·</span>
                  <span className="shrink-0">{msg.date ? new Date(msg.date).toLocaleDateString() : ""}</span>
                </div>
                <p className="text-[10px] font-extralight text-muted-foreground/60 line-clamp-1">{msg.snippet}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {isConnected && !loading && !error && liveStats && liveInbox.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border/30 bg-card/10 p-10 text-center">
          <p className="text-sm font-extralight text-muted-foreground/50">the mailbox returned no messages.</p>
        </div>
      )}
    </div>
  );
};

export default EmailAssistant;
