import { useState, useEffect, useCallback } from "react";
import { Brain, Cpu, CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";
import { CONNECT_UNAVAILABLE, describeFailure } from "../offline";

// effigy — what the connected account holds, counted.
//
// the capability cards that promised "writes emails in your voice",
// "predicts your choices" and "handles tasks before you think about them"
// are gone: nothing in this file writes, predicts or handles anything. it
// reads four counters and shows them.

interface Counts { emails: number; events: number; contacts: number; steps: number }

const AITwin = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Counts | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [gmailStats, calData, contactData, fitData] = await Promise.all([
        fetchGoogleData("gmail_stats").catch(() => ({ unread: 0 })),
        fetchGoogleData("calendar_events", { maxResults: 50 }).catch(() => ({ totalEvents: 0 })),
        fetchGoogleData("contacts", { pageSize: 1 }).catch(() => ({ totalContacts: 0 })),
        fetchGoogleData("fitness").catch(() => ({ dailyData: [] })),
      ]);
      const days: Array<{ steps?: number }> = fitData.dailyData || [];
      const avgSteps = days.length > 0 ? Math.round(days.reduce((a, d) => a + (d.steps ?? 0), 0) / days.length) : 0;
      setData({
        emails: gmailStats.unread || 0,
        events: calData.totalEvents || 0,
        contacts: contactData.totalContacts || 0,
        steps: avgSteps,
      });
    } catch (err) {
      setError(describeFailure(err, "google data organ"));
    } finally {
      setLoading(false);
    }
  }, [fetchGoogleData]);

  useEffect(() => {
    if (isConnected) void loadData();
  }, [isConnected, loadData]);

  const hasLive = isConnected && !!data && (data.emails > 0 || data.events > 0 || data.contacts > 0);

  const twinStats = [
    { label: "unread mail", value: data ? String(data.emails) : "—" },
    { label: "events this week", value: data ? String(data.events) : "—" },
    { label: "contacts", value: data ? String(data.contacts) : "—" },
    { label: "avg steps / day", value: data && data.steps > 0 ? data.steps.toLocaleString() : "—" },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
            <Brain className="h-6 w-6 text-foreground/70" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extralight tracking-wide text-foreground">behavioural twin</h2>
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
                ? "four counters from the connected account. a twin would be built from observed choices; none are observed yet, so nothing is modelled or predicted here."
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
        {twinStats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 text-center">
            <p className="text-xl font-extralight text-foreground">{loading ? "…" : s.value}</p>
            <p className="text-[10px] font-light text-muted-foreground/60 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {hasLive && data && (
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
          <h3 className="text-sm font-light tracking-wide text-foreground flex items-center gap-2">
            <Cpu className="h-4 w-4" aria-hidden /> sources read
          </h3>
          <div className="space-y-1.5">
            {[
              { label: "gmail", detail: `${data.emails} unread`, active: data.emails > 0 },
              { label: "calendar", detail: `${data.events} events this week`, active: data.events > 0 },
              { label: "contacts", detail: `${data.contacts} contacts`, active: data.contacts > 0 },
              { label: "fitness", detail: data.steps > 0 ? `${data.steps.toLocaleString()} avg steps/day` : "no fitness data", active: data.steps > 0 },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-3 rounded-xl bg-foreground/5 px-4 py-2.5">
                <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${s.active ? "text-emerald-400" : "text-muted-foreground/30"}`} aria-hidden />
                <span className="w-20 shrink-0 text-xs font-light text-foreground">{s.label}</span>
                <span className="min-w-0 truncate text-[10px] text-muted-foreground/50">{s.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isConnected && !loading && !error && data && !hasLive && (
        <div className="rounded-2xl border border-dashed border-border/30 bg-card/10 p-10 text-center">
          <p className="text-sm font-extralight text-muted-foreground/50">every counter came back zero — the account returned nothing to count.</p>
        </div>
      )}
    </div>
  );
};

export default AITwin;
