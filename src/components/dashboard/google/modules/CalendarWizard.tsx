import { useState, useEffect, useCallback } from "react";
import { Calendar, Clock, Users, RefreshCw, AlertTriangle } from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";
import { CONNECT_UNAVAILABLE, describeFailure } from "../offline";

// horizon — the connected calendar, read on request.
//
// the static "energy map (ai-detected)" that used to sit under the event list
// is gone: it was a hand-typed table (7–9 am medium, 9–11 am peak …) that
// rendered for every operator whether or not a calendar existed. a desk may
// only show what it measured.

interface CalEvent {
  id: string;
  summary?: string;
  start: string;
  isAllDay?: boolean;
  attendees?: number;
  location?: string;
}

const CalendarWizard = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGoogleData("calendar_events", { maxResults: 50 });
      setEvents(data.events || []);
      setTotalEvents(data.totalEvents || 0);
    } catch (err) {
      setError(describeFailure(err, "calendar organ"));
    } finally {
      setLoading(false);
    }
  }, [fetchGoogleData]);

  useEffect(() => {
    if (isConnected) void loadData();
  }, [isConnected, loadData]);

  const today = new Date().toDateString();
  const meetingStats = events.length > 0
    ? [
        { label: "this week", value: String(totalEvents) },
        { label: "today", value: String(events.filter((e) => new Date(e.start).toDateString() === today).length) },
        { label: "all-day", value: String(events.filter((e) => e.isAllDay).length) },
        { label: "with others", value: String(events.filter((e) => (e.attendees ?? 0) > 1).length) },
      ]
    : [
        { label: "this week", value: "—" },
        { label: "today", value: "—" },
        { label: "all-day", value: "—" },
        { label: "with others", value: "—" },
      ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
            <Calendar className="h-6 w-6 text-foreground/70" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extralight tracking-wide text-foreground">schedule engine</h2>
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
                ? "the next fifty events on the connected calendar — count, attendees and all-day load. nothing is inferred from them."
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
        {meetingStats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 text-center">
            <p className="text-xl font-extralight text-foreground">{loading ? "…" : s.value}</p>
            <p className="text-[10px] font-light text-muted-foreground/60 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {events.length > 0 && (
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-4">
          <h3 className="text-sm font-light tracking-wide text-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4" aria-hidden /> upcoming events
          </h3>
          <div className="space-y-2">
            {events.slice(0, 10).map((event) => (
              <div key={event.id} className="rounded-xl border border-border/20 bg-foreground/5 p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs font-light text-foreground">{event.summary || "(untitled)"}</span>
                  {(event.attendees ?? 0) > 1 && (
                    <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground/50">
                      <Users className="h-2.5 w-2.5" aria-hidden /> {event.attendees}
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground/50">
                  <Clock className="h-2.5 w-2.5 shrink-0" aria-hidden />
                  <span className="shrink-0">
                    {event.isAllDay
                      ? "all day"
                      : new Date(event.start).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {event.location && <span className="min-w-0 truncate">· {event.location}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isConnected && !loading && !error && events.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border/30 bg-card/10 p-10 text-center">
          <p className="text-sm font-extralight text-muted-foreground/50">the calendar returned no events for the window asked.</p>
        </div>
      )}
    </div>
  );
};

export default CalendarWizard;
