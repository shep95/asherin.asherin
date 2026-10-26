import { useState, useEffect, useCallback } from "react";
import { Brain, RefreshCw, AlertTriangle } from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";
import { CONNECT_UNAVAILABLE, describeFailure } from "../offline";

// wargame — counterfactual branches from measured inputs.
//
// the previous version shipped two hand-written scenarios ("career change in
// next 6 months", "maintain current trajectory") with a $120,000 salary,
// satisfaction out of ten and a 67% probability, rendered for every operator
// before any account existed. none of those numbers came from anything. the
// desk now shows the three counts it can actually read and says plainly that
// no simulation has been written on top of them.

const ScenarioEngine = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveData, setLiveData] = useState<{ events: number; emails: number; contacts: number } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [calData, gmailStats, contactData] = await Promise.all([
        fetchGoogleData("calendar_events", { maxResults: 50 }),
        fetchGoogleData("gmail_stats"),
        fetchGoogleData("contacts", { pageSize: 1 }),
      ]);
      setLiveData({
        events: calData.totalEvents || 0,
        emails: gmailStats.unread || 0,
        contacts: contactData.totalContacts || 0,
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

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
            <Brain className="h-6 w-6 text-foreground/70" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extralight tracking-wide text-foreground">scenario engine</h2>
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
                ? "the counts a simulation would start from. no branch is simulated yet, so no probability, salary or satisfaction figure is shown — none would be measured."
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

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "events this week", value: liveData ? String(liveData.events) : "—" },
          { label: "unread mail", value: liveData ? String(liveData.emails) : "—" },
          { label: "contacts", value: liveData ? String(liveData.contacts) : "—" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 text-center">
            <p className="text-xl font-extralight text-foreground">{loading ? "…" : s.value}</p>
            <p className="text-[10px] font-light text-muted-foreground/60 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-dashed border-border/30 bg-card/10 p-8 text-center space-y-2">
        <p className="text-sm font-extralight text-muted-foreground/60">no scenario is written on this desk.</p>
        <p className="mx-auto max-w-md text-[11px] font-extralight leading-relaxed text-muted-foreground/50">
          a branch would need a measured baseline — months of calendar load, inbound rate and spend — and a stated model for
          how each decision moves it. until both exist, a probability ring here would be decoration.
        </p>
      </div>
    </div>
  );
};

export default ScenarioEngine;
