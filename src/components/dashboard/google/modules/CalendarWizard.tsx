import { useState, useEffect } from "react";
import {
  Calendar, Clock, Users, Zap, TrendingUp, BarChart3, Sun, Moon, RefreshCw,
} from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";

const CalendarWizard = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchGoogleData("calendar_events", { maxResults: 50 });
      setEvents(data.events || []);
      setTotalEvents(data.totalEvents || 0);
    } catch (err) {
      console.error("Failed to fetch calendar:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected) loadData();
  }, [isConnected]);

  const meetingStats = events.length > 0
    ? [
        { label: "This Week", value: String(totalEvents) },
        { label: "Today", value: String(events.filter((e) => {
            const d = new Date(e.start);
            const now = new Date();
            return d.toDateString() === now.toDateString();
          }).length) },
        { label: "All-Day", value: String(events.filter((e) => e.isAllDay).length) },
        { label: "With Others", value: String(events.filter((e) => e.attendees > 1).length) },
      ]
    : [
        { label: "Meetings/Week", value: "—" },
        { label: "Meeting Hours", value: "—" },
        { label: "Avg Duration", value: "—" },
        { label: "No-Meeting Days", value: "—" },
      ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/5">
            <Calendar className="h-6 w-6 text-foreground/70" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extralight tracking-wide text-foreground">Calendar Wizard</h2>
              {isConnected && (
                <button onClick={loadData} disabled={loading} className="flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-all disabled:opacity-50">
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                  Sync
                </button>
              )}
            </div>
            <p className="text-sm font-extralight leading-relaxed text-muted-foreground">
              {isConnected
                ? "Live calendar data connected — analyzing meetings, energy patterns, and scheduling intelligence."
                : "Connect Google to unlock scheduling intelligence based on your energy levels and patterns."}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {meetingStats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 text-center">
            <p className="text-xl font-extralight text-foreground">{loading ? "…" : s.value}</p>
            <p className="text-[10px] font-light text-muted-foreground/60 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Live Events */}
      {events.length > 0 && (
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-4">
          <h3 className="text-sm font-light tracking-wide text-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Upcoming Events (Live)
          </h3>
          <div className="space-y-2">
            {events.slice(0, 10).map((event) => (
              <div key={event.id} className="rounded-xl border border-border/20 bg-foreground/5 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-light text-foreground truncate max-w-[70%]">{event.summary}</span>
                  {event.attendees > 1 && (
                    <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                      <Users className="h-2.5 w-2.5" /> {event.attendees}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
                  <Clock className="h-2.5 w-2.5" />
                  <span>
                    {event.isAllDay
                      ? "All Day"
                      : `${new Date(event.start).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
                  </span>
                  {event.location && <span className="truncate">· {event.location}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Energy Map - static since it's AI-derived */}
      <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
        <h3 className="text-xs font-light tracking-wide text-foreground flex items-center gap-2">
          <Sun className="h-3.5 w-3.5" /> Energy Map (AI-detected)
        </h3>
        <div className="space-y-1.5">
          {[
            { time: "7–9 AM", level: "Medium", best: "Email, planning" },
            { time: "9–11 AM", level: "Peak", best: "Hard problems, coding" },
            { time: "11–12 PM", level: "High", best: "Meetings, brainstorming" },
            { time: "12–2 PM", level: "Low", best: "Light tasks, 1:1s" },
            { time: "2–4 PM", level: "Medium", best: "Reviews, routine work" },
            { time: "4–6 PM", level: "Medium", best: "Planning tomorrow, email" },
          ].map((e) => (
            <div key={e.time} className="flex items-center gap-3 rounded-xl bg-foreground/5 px-4 py-2">
              <span className="text-[10px] font-light text-muted-foreground w-16 shrink-0">{e.time}</span>
              <span className={`text-[10px] font-light w-14 shrink-0 ${
                e.level === "Peak" ? "text-foreground" : e.level === "Low" ? "text-muted-foreground/40" : "text-muted-foreground"
              }`}>{e.level}</span>
              <span className="text-[10px] text-muted-foreground/50 flex-1">{e.best}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CalendarWizard;
