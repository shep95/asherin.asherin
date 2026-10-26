import { useState, useEffect, useCallback } from "react";
import {
  Clock, BarChart3, Target, Users, Zap,
  Brain, AlertTriangle, CheckCircle2, RefreshCw,
} from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";
import { CONNECT_UNAVAILABLE, describeFailure } from "../offline";

// cadence — meeting distribution and inbox load, read on request.

const ProductivityIntelligence = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [gmailStats, setGmailStats] = useState<any>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [calData, emailStats] = await Promise.all([
        fetchGoogleData("calendar_events", { maxResults: 100 }),
        fetchGoogleData("gmail_stats"),
      ]);
      setEvents(calData.events || []);
      setGmailStats(emailStats);
    } catch (err) {
      setError(describeFailure(err, "google data organ"));
    } finally {
      setLoading(false);
    }
  }, [fetchGoogleData]);

  useEffect(() => {
    if (isConnected) void loadData();
  }, [isConnected, loadData]);

  const hasLive = events.length > 0 || gmailStats;

  // Compute meeting stats from live calendar data
  const todayEvents = events.filter((e) => {
    const d = new Date(e.start);
    return d.toDateString() === new Date().toDateString();
  });
  const meetingsWithOthers = events.filter((e) => e.attendees > 1);
  const allDayEvents = events.filter((e) => e.isAllDay);

  const stats = hasLive
    ? [
        { label: "events this week", value: String(events.length), trend: "" },
        { label: "today", value: String(todayEvents.length), trend: "" },
        { label: "with others", value: String(meetingsWithOthers.length), trend: "" },
        { label: "unread mail", value: String(gmailStats?.unread || 0), trend: "" },
      ]
    : [
        { label: "events this week", value: "—", trend: "" },
        { label: "today", value: "—", trend: "" },
        { label: "with others", value: "—", trend: "" },
        { label: "unread mail", value: "—", trend: "" },
      ];

  // Group events by hour for timeline
  const hourCounts = new Array(12).fill(0);
  events.forEach((e) => {
    if (!e.isAllDay) {
      const h = new Date(e.start).getHours();
      if (h >= 6 && h < 18) hourCounts[h - 6]++;
    }
  });
  const maxHourCount = Math.max(...hourCounts, 1);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/5">
            <BarChart3 className="h-6 w-6 text-foreground/70" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extralight tracking-wide text-foreground">attention ledger</h2>
              {isConnected && (
                <button type="button" onClick={() => void loadData()} disabled={loading} className="flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-all disabled:opacity-50">
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
                  read again
                </button>
              )}
            </div>
            <p className="text-sm font-extralight leading-relaxed text-muted-foreground">
              {isConnected
                ? "a hundred events and the inbox counters, read on request — meeting distribution by hour, today's schedule and mail load."
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
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-4 space-y-1">
            <span className="text-[10px] font-extralight text-muted-foreground">{s.label}</span>
            <span className="text-lg font-light text-foreground block">{loading ? "…" : s.value}</span>
          </div>
        ))}
      </div>

      {/* Meeting Distribution */}
      {hasLive && (
        <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-5 space-y-3">
          <h3 className="text-sm font-light tracking-wide text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" aria-hidden /> meeting distribution
          </h3>
          <div className="flex gap-1 items-end h-20">
            {hourCounts.map((count, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-md bg-foreground/20 transition-all hover:bg-foreground/40"
                  style={{ height: `${(count / maxHourCount) * 100}%`, minHeight: count > 0 ? "4px" : "0" }}
                />
                <span className="text-[8px] text-muted-foreground/50">{6 + i}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] font-extralight text-muted-foreground/60">
            events by hour (6am–6pm) · {meetingsWithOthers.length} with others this week
          </p>
        </div>
      )}

      {/* Today's Schedule */}
      {todayEvents.length > 0 && (
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
          <h3 className="text-sm font-light tracking-wide text-foreground flex items-center gap-2">
            <Target className="h-4 w-4" aria-hidden /> today's schedule
          </h3>
          <div className="space-y-1.5">
            {todayEvents.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-xl bg-foreground/5 px-4 py-2.5">
                <Clock className="h-3.5 w-3.5 text-foreground/50 shrink-0" />
                <span className="text-[10px] font-light text-muted-foreground w-16 shrink-0">
                  {e.isAllDay ? "all day" : new Date(e.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="text-xs font-light text-foreground flex-1 truncate">{e.summary}</span>
                {e.attendees > 1 && (
                  <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                    <Users className="h-2.5 w-2.5" /> {e.attendees}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Energy Map – derived from live calendar + email activity */}
      {hasLive && (() => {
        const timeBlocks = [
          { range: "7–9 AM", start: 7, end: 9 },
          { range: "9–11 AM", start: 9, end: 11 },
          { range: "11 AM–12 PM", start: 11, end: 12 },
          { range: "12–2 PM", start: 12, end: 14 },
          { range: "2–4 PM", start: 14, end: 16 },
          { range: "4–6 PM", start: 16, end: 18 },
          { range: "6–9 PM", start: 18, end: 21 },
        ];

        const blockData = timeBlocks.map((block) => {
          const blockEvents = todayEvents.filter((e) => {
            if (e.isAllDay) return false;
            const h = new Date(e.start).getHours();
            return h >= block.start && h < block.end;
          });
          const meetingCount = blockEvents.length;
          const collabCount = blockEvents.filter((e) => e.attendees > 1).length;
          const hasFocus = meetingCount === 0;

          let level: string;
          let activity: string;
          if (meetingCount >= 3) { level = "peak"; activity = blockEvents.map(e => e.summary).join(", "); }
          else if (meetingCount === 2 || collabCount > 0) { level = "high"; activity = blockEvents.map(e => e.summary).join(", "); }
          else if (meetingCount === 1) { level = "medium"; activity = blockEvents[0]?.summary || "scheduled event"; }
          else if (hasFocus) { level = "open"; activity = "no event in this band"; }
          else { level = "medium"; activity = "light activity"; }

          return { ...block, level, activity, meetingCount };
        });

        return (
          <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-5 space-y-3">
            <h3 className="text-sm font-light tracking-wide text-foreground flex items-center gap-2">
              <Zap className="h-4 w-4" aria-hidden /> today by band
            </h3>
            <div className="space-y-1">
              {blockData.map((b, i) => (
                <div key={i} className="flex items-center gap-4 rounded-xl bg-foreground/5 px-4 py-2.5">
                  <span className="text-[11px] font-light text-muted-foreground w-24 shrink-0">{b.range}</span>
                  <span className={`text-[11px] font-light w-14 shrink-0 ${
                    b.level === "peak" ? "text-foreground" :
                    b.level === "high" ? "text-foreground/80" :
                    b.level === "medium" ? "text-muted-foreground" :
                    "text-muted-foreground/50"
                  }`}>{b.level}</span>
                  <span className="text-[11px] font-extralight text-muted-foreground/70 truncate flex-1">{b.activity}</span>
                </div>
              ))}
            </div>
            <p className="text-[9px] font-extralight text-muted-foreground/40">
              event count per band from {todayEvents.length} calendar event{todayEvents.length !== 1 ? "s" : ""} today · {gmailStats?.unread || 0} unread. this is load, not energy — nothing physiological is read here.
            </p>
          </div>
        );
      })()}

      {/* AI Insights */}
      {hasLive && (
        <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-5 space-y-3">
          <h3 className="text-sm font-light tracking-wide text-foreground flex items-center gap-2">
            <Brain className="h-4 w-4" aria-hidden /> what the counts say
          </h3>
          <div className="space-y-2">
            {[
              { type: "strength", text: `${events.length} events this week — ${meetingsWithOthers.length} with more than one attendee` },
              { type: "strength", text: `${allDayEvents.length} all-day events` },
              { type: gmailStats?.unread > 20 ? "warning" : "strength", text: `${gmailStats?.unread || 0} unread — ${gmailStats?.unread > 20 ? "above twenty" : "twenty or fewer"}` },
              todayEvents.length > 5
                ? { type: "warning", text: `${todayEvents.length} events today — more than five` }
                : { type: "strength", text: `${todayEvents.length} events today — five or fewer` },
            ].map((ins, i) => (
              <div key={i} className="flex items-start gap-2 py-1">
                {ins.type === "strength" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                )}
                <span className="text-[11px] font-extralight text-muted-foreground">{ins.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasLive && isConnected && !loading && !error && (
        <div className="rounded-2xl border border-dashed border-border/30 bg-card/10 p-10 text-center space-y-3">
          <BarChart3 className="h-10 w-10 text-muted-foreground/20 mx-auto" aria-hidden />
          <p className="text-sm font-extralight text-muted-foreground/50">
            the calendar and the inbox both returned nothing for the window asked.
          </p>
        </div>
      )}
    </div>
  );
};

export default ProductivityIntelligence;
