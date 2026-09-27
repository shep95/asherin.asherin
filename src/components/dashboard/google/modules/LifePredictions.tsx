import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  Stethoscope, TrendingUp, Sparkles, RefreshCw,
  Calendar, Activity, Users, BarChart3,
  Clock, Mail, CheckCircle2, AlertTriangle, Target, Send,
} from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";
import FindingCard from "../intel/FindingCard";
import { TrendStat } from "../intel/TrendStat";
import {
  augurFindings, augurSynthesis, weekAhead, focusWindows,
  optimalSendWindows, classifyInbound, relationshipDrift,
  type CalEvent, type InboxMessage, type MailboxCounters,
} from "@/lib/cloudIntel/augur";
import { round, signedPct } from "@/lib/cloudIntel/logic";

type TabKey = "schedule" | "health" | "social" | "trends";

// The projection window is only as good as the mail sample behind it, so the
// inbox read is deliberately deeper than a preview list needs.
const INBOX_SAMPLE = 100;

const CLASS_LABEL: Record<string, string> = {
  financial: "Financial",
  legal: "Legal",
  industry: "Industry signal",
  scheduling: "Scheduling",
  security: "Security",
  commercial: "Commercial",
  personal: "Personal",
};

const LifePredictions = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("schedule");
  const [calEvents, setCalEvents] = useState<CalEvent[]>([]);
  const [gmailStats, setGmailStats] = useState<MailboxCounters | null>(null);
  const [emails, setEmails] = useState<InboxMessage[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [totalContacts, setTotalContacts] = useState(0);
  const [fitData, setFitData] = useState<any[]>([]);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const prev = { calEvents, gmailStats, emails, contacts, totalContacts, fitData, driveFiles };
    try {
      const now = new Date();
      const [cal, stats, inbox, contactData, fit, drive] = await Promise.all([
        // A seven-day forward horizon needs a seven-day forward query.
        fetchGoogleData("calendar_events", {
          timeMin: new Date(now.getTime() - 7 * 86400000).toISOString(),
          timeMax: new Date(now.getTime() + 8 * 86400000).toISOString(),
          maxResults: 150,
        }).catch(() => ({ events: [] })),
        fetchGoogleData("gmail_stats").catch(() => null),
        fetchGoogleData("gmail_inbox", { maxResults: INBOX_SAMPLE }).catch(() => ({ messages: [] })),
        fetchGoogleData("contacts", { pageSize: 200 }).catch(() => ({ contacts: [], totalContacts: 0 })),
        fetchGoogleData("fitness", undefined, undefined, false).catch(() => ({ dailyData: [] })),
        fetchGoogleData("drive_files", { pageSize: 25 }).catch(() => ({ files: [] })),
      ]);
      setCalEvents(cal.events || []);
      setGmailStats(stats);
      setEmails(inbox.messages || []);
      setContacts(contactData.contacts || []);
      setTotalContacts(contactData.totalContacts || 0);
      setFitData(fit.dailyData || []);
      setDriveFiles(drive.files || []);
    } catch (err) {
      console.error("Failed to fetch prediction data:", err);
      setCalEvents(prev.calEvents);
      setGmailStats(prev.gmailStats);
      setEmails(prev.emails);
      setContacts(prev.contacts);
      setTotalContacts(prev.totalContacts);
      setFitData(prev.fitData);
      setDriveFiles(prev.driveFiles);
      toast.error("Failed to sync prediction data — showing previous results.");
    } finally {
      setLoading(false);
    }
  }, [fetchGoogleData]);

  useEffect(() => {
    if (isConnected) loadData();
  }, [isConnected]);

  // Rule 16 — an empty calendar is not an empty screen. Augur runs on any
  // surface that returned something, and interprets the ones that did not.
  const hasAnySurface = isConnected && (calEvents.length > 0 || emails.length > 0 || contacts.length > 0 || !!gmailStats);

  const augurInput = useMemo(
    () => ({
      connected: isConnected,
      events: calEvents,
      messages: emails,
      counters: gmailStats,
      contactCount: totalContacts || contacts.length,
      driveFileCount: driveFiles.length,
    }),
    [isConnected, calEvents, emails, gmailStats, totalContacts, contacts.length, driveFiles.length],
  );

  const findings = useMemo(() => augurFindings(augurInput), [augurInput]);
  const synthesis = useMemo(() => augurSynthesis(augurInput), [augurInput]);
  const week = useMemo(() => weekAhead(calEvents, emails), [calEvents, emails]);
  const blocks = useMemo(() => focusWindows(calEvents, emails), [calEvents, emails]);
  const sendWindows = useMemo(() => optimalSendWindows(emails), [emails]);
  const classified = useMemo(() => classifyInbound(emails), [emails]);
  const drift = useMemo(() => relationshipDrift(contacts, emails), [contacts, emails]);

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: "schedule", label: "Schedule", icon: Calendar },
    { key: "health", label: "Health", icon: Activity },
    { key: "social", label: "Social", icon: Users },
    { key: "trends", label: "Trends", icon: BarChart3 },
  ];

  const avgSteps = fitData.length > 0
    ? Math.round(fitData.reduce((a: number, d: any) => a + d.steps, 0) / fitData.length)
    : 0;
  const avgCalories = fitData.length > 0
    ? Math.round(fitData.reduce((a: number, d: any) => a + d.calories, 0) / fitData.length)
    : 0;
  const hrDays = fitData.filter((d: any) => d.heartRate > 0);
  const avgHR = hrDays.length > 0
    ? Math.round(hrDays.reduce((a: number, d: any) => a + d.heartRate, 0) / hrDays.length)
    : 0;

  const renderTab = () => {
    if (!hasAnySurface) {
      return (
        <div className="rounded-2xl border border-dashed border-border/30 bg-card/10 p-10 text-center space-y-3">
          <Sparkles className="h-10 w-10 text-muted-foreground/20 mx-auto" />
          <p className="text-sm font-extralight text-muted-foreground/50">
            {isConnected ? "No surface returned data yet — run a sweep to populate the projection." : "Link a Google account to enable forward projection."}
          </p>
        </div>
      );
    }

    if (activeTab === "schedule") {
      const maxLoad = Math.max(1, ...week.map((d) => Math.max(d.committedHours, d.projectedMail ? d.projectedMail / 6 : 0)));
      return (
        <div className="space-y-5">
          {/* ── Seven-day projection ─────────────────────────────────── */}
          <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-light text-foreground flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" /> Seven-Day Projection
              </h4>
              <span className="text-[9px] tracking-[0.18em] text-muted-foreground/40 font-light">
                COMMITTED HOURS · PROJECTED INBOUND
              </span>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {week.map((d) => (
                <div key={d.ts} className="space-y-1.5">
                  <div className="h-20 flex items-end gap-[3px]" title={`${d.label}: ${d.committedHours}h committed, ~${d.projectedMail ?? "?"} inbound projected`}>
                    <div
                      className="flex-1 rounded-t-[2px] bg-foreground/55"
                      style={{ height: `${Math.max(2, (d.committedHours / maxLoad) * 100)}%` }}
                    />
                    <div
                      className="flex-1 rounded-t-[2px] bg-foreground/20"
                      style={{ height: `${Math.max(2, ((d.projectedMail ?? 0) / 6 / maxLoad) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[8px] text-center text-muted-foreground/40 font-light truncate">
                    {d.label.split(",")[0].replace("day", "")}
                  </p>
                  <p className="text-[9px] text-center text-foreground/70 tabular-nums">{d.committedHours || 0}h</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] font-extralight text-muted-foreground/55 leading-relaxed">
              Solid bars are committed hours read from the calendar — fact. Faint bars are inbound correspondence projected from the
              weekday profile of the {emails.length}-message sample, so a Sunday is never projected from a Tuesday. Days showing
              committed time near zero are not free days; they are unallocated days.
            </p>
          </div>

          {/* ── Focus windows ────────────────────────────────────────── */}
          <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
            <h4 className="text-xs font-light text-foreground flex items-center gap-2">
              <Target className="h-3.5 w-3.5" /> Conflict-Free Focus Windows
            </h4>
            {blocks.length > 0 ? (
              <div className="space-y-1.5">
                {blocks.map((b, i) => (
                  <div key={`${b.ts}-${b.startHour}-${i}`} className="rounded-xl bg-foreground/5 px-4 py-2.5 space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-light text-foreground/80 w-28 shrink-0">{b.label}</span>
                      <span className="text-xs font-light text-foreground tabular-nums">
                        {String(b.startHour).padStart(2, "0")}:00 — {String(b.endHour).padStart(2, "0")}:00
                      </span>
                    </div>
                    <p className="text-[10px] font-extralight text-muted-foreground/60 leading-relaxed">{b.rationale}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] font-extralight text-muted-foreground/60 leading-relaxed">
                No uncontested window of two hours or more exists inside 08:00–18:00 on the next five working days. Every band is
                either committed or fragmented below the minimum useful block. Clearing one commitment is the only way to create one.
              </p>
            )}
          </div>

          {/* ── Optimal send windows (Rule 8: metadata over content) ──── */}
          {sendWindows.length > 0 && (
            <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
              <h4 className="text-xs font-light text-foreground flex items-center gap-2">
                <Send className="h-3.5 w-3.5" /> Optimal Send Windows
              </h4>
              <div className="space-y-1.5">
                {sendWindows.map((w) => (
                  <div key={w.hour} className="rounded-xl bg-foreground/5 px-4 py-2.5 space-y-1">
                    <span className="text-xs font-light text-foreground tabular-nums">{String(w.hour).padStart(2, "0")}:00</span>
                    <p className="text-[10px] font-extralight text-muted-foreground/60 leading-relaxed">{w.rationale}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Classified inbound ───────────────────────────────────── */}
          {classified.length > 0 && (
            <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
              <h4 className="text-xs font-light text-foreground flex items-center gap-2">
                <Mail className="h-3.5 w-3.5" /> Inbound, Classified
              </h4>
              <div className="space-y-1.5">
                {classified.slice(0, 12).map((c, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-xl bg-foreground/5 px-3 py-2">
                    <span className="text-[8px] tracking-[0.14em] text-muted-foreground/45 font-light w-24 shrink-0 pt-0.5">
                      {(CLASS_LABEL[c.cls] || c.cls).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-light text-foreground truncate">{c.subject}</p>
                      <p className="text-[9px] font-extralight text-muted-foreground/45 truncate">
                        {c.from}
                        {c.matched.length > 0 && ` · matched: ${c.matched.slice(0, 3).join(", ")}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] font-extralight text-muted-foreground/50 leading-relaxed">
                Every label above is traceable to the literal terms that produced it. A message with no matched term is filed as
                personal by exclusion, not by inference.
              </p>
            </div>
          )}
        </div>
      );
    }

    if (activeTab === "health") {
      const stepSeries = fitData.map((d: any) => d.steps ?? 0);
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <TrendStat
              label="Steps / day"
              value={avgSteps > 0 ? avgSteps.toLocaleString() : "—"}
              series={stepSeries}
              hint={avgSteps > 0 ? `${signedPct(avgSteps, 8000)} against the 8,000 reference` : "No fitness surface linked"}
              loading={loading}
            />
            <TrendStat
              label="Calories / day"
              value={avgCalories > 0 ? avgCalories.toLocaleString() : "—"}
              series={fitData.map((d: any) => d.calories ?? 0)}
              loading={loading}
            />
            <TrendStat
              label="Heart rate"
              value={avgHR > 0 ? `${avgHR} bpm` : "—"}
              hint={hrDays.length ? `Averaged over ${hrDays.length} days carrying a reading` : "No heart-rate samples in window"}
              loading={loading}
            />
          </div>
          {fitData.length > 0 ? (
            <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
              <h4 className="text-xs font-light text-foreground flex items-center gap-2">
                <Activity className="h-3.5 w-3.5" /> Daily Activity
              </h4>
              <div className="space-y-1.5">
                {fitData.map((d: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl bg-foreground/5 px-4 py-2.5">
                    <span className="text-[10px] font-light text-muted-foreground w-20 shrink-0">{d.date}</span>
                    <div className="flex-1 flex items-center gap-4">
                      <span className="text-[10px] text-foreground tabular-nums">{(d.steps ?? 0).toLocaleString()} steps</span>
                      <span className="text-[10px] text-muted-foreground/60 tabular-nums">{d.calories} cal</span>
                      {d.heartRate > 0 && <span className="text-[10px] text-muted-foreground/40 tabular-nums">{d.heartRate} bpm</span>}
                    </div>
                    <div className="w-20 h-1.5 bg-foreground/10 rounded-full overflow-hidden">
                      <div className="h-full bg-foreground/30 rounded-full" style={{ width: `${Math.min(((d.steps ?? 0) / 10000) * 100, 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/30 bg-card/10 p-8 text-center space-y-2">
              <Stethoscope className="h-8 w-8 text-muted-foreground/20 mx-auto" />
              <p className="text-[11px] text-muted-foreground/60 leading-relaxed max-w-md mx-auto">
                No fitness surface is linked, so physical load cannot be weighed against communication load. Without it, a heavy
                correspondence week and a heavy physical week look identical to the engine — that is a real blind spot, not an empty tab.
              </p>
            </div>
          )}
        </div>
      );
    }

    if (activeTab === "social") {
      const corresponded = new Set(
        emails.map((m) => (m.from || "").match(/[\w.+-]+@[\w.-]+/)?.[0]?.toLowerCase()).filter(Boolean) as string[],
      );
      const active = contacts.filter((c) => c.email && corresponded.has(c.email.toLowerCase()));
      const silentKnown = drift.length;

      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <TrendStat
              label="Known identities"
              value={totalContacts || contacts.length}
              hint={`${active.length} appear in the ${emails.length}-message window`}
              loading={loading}
            />
            <TrendStat
              label="Live correspondents"
              value={active.length}
              hint={contacts.length ? `${Math.round((active.length / Math.max(1, contacts.length)) * 100)}% of the address book carries current traffic` : undefined}
              loading={loading}
            />
            <TrendStat
              label="Drifting"
              value={silentKnown}
              hint="Established correspondents silent beyond 14 days — absence of a relationship is excluded"
              loading={loading}
            />
          </div>

          {drift.length > 0 ? (
            <div className="rounded-2xl border border-amber-500/25 bg-card/20 backdrop-blur-md p-5 space-y-3">
              <h4 className="text-xs font-light text-foreground flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> Relationship Drift
              </h4>
              <div className="space-y-1.5">
                {drift.map((d, i) => (
                  <div key={i} className="rounded-xl bg-foreground/5 px-3 py-2 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-light text-foreground flex-1 truncate">{d.name}</span>
                      <span className="text-[10px] text-amber-400/80 tabular-nums shrink-0">{d.days}d silent</span>
                    </div>
                    <p className="text-[9px] font-extralight text-muted-foreground/50">{d.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-500/20 bg-card/20 backdrop-blur-md p-5 space-y-2">
              <h4 className="text-xs font-light text-foreground flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> No Drift Detected
              </h4>
              <p className="text-[10px] font-extralight text-muted-foreground/60 leading-relaxed">
                Every correspondent with established traffic in the sampled window has been heard from inside fourteen days. This is a
                measurement over {emails.length} messages, not over the whole mailbox — a correspondent outside the sample would not appear here.
              </p>
            </div>
          )}

          {active.length > 0 && (
            <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
              <h4 className="text-xs font-light text-foreground flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5" /> Currently Corresponding
              </h4>
              <div className="space-y-1.5">
                {active.slice(0, 10).map((c, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl bg-foreground/5 px-3 py-2">
                    <div className="h-6 w-6 rounded-full bg-foreground/10 flex items-center justify-center text-[10px] font-light text-foreground overflow-hidden shrink-0">
                      {c.photo ? <img src={c.photo} alt="" className="h-full w-full object-cover rounded-full" referrerPolicy="no-referrer" /> : c.name?.charAt(0)}
                    </div>
                    <span className="text-[11px] font-light text-foreground flex-1 truncate">{c.name}</span>
                    {c.organization && <span className="text-[9px] text-muted-foreground/40 truncate max-w-[35%]">{c.organization}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Trends
    const dayCounts: Record<string, number> = {};
    calEvents.forEach((e) => {
      const day = new Date(e.start).toLocaleDateString("en", { weekday: "short" });
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    });
    const busiest = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];
    const maxDay = Math.max(1, ...Object.values(dayCounts));

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <TrendStat label="Events in window" value={calEvents.length} loading={loading} />
          <TrendStat
            label="Unread"
            value={gmailStats?.unread ?? "—"}
            hint={gmailStats?.inboxTotal ? `of ${gmailStats.inboxTotal} in inbox · ${Math.round(((gmailStats.unread ?? 0) / gmailStats.inboxTotal) * 100)}% backlog` : undefined}
            loading={loading}
          />
          <TrendStat
            label="Outbound share"
            value={gmailStats?.lifetimeReciprocity != null ? `${Math.round(gmailStats.lifetimeReciprocity * 100)}%` : "—"}
            hint={gmailStats?.sentTotal != null ? `${gmailStats.sentTotal} sent lifetime` : undefined}
            loading={loading}
          />
          <TrendStat label="Recent documents" value={driveFiles.length} loading={loading} />
        </div>

        {Object.keys(dayCounts).length > 0 && (
          <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
            <h4 className="text-xs font-light text-foreground flex items-center gap-2">
              <BarChart3 className="h-3.5 w-3.5" /> Commitment Density by Weekday
            </h4>
            <div className="flex gap-2 items-end h-16">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => {
                const count = dayCounts[day] || 0;
                return (
                  <div key={day} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      title={`${day}: ${count} events`}
                      className="w-full rounded-t bg-foreground/25"
                      style={{ height: `${(count / maxDay) * 100}%`, minHeight: count > 0 ? "4px" : "2px" }}
                    />
                    <span className="text-[8px] text-muted-foreground/40">{day}</span>
                  </div>
                );
              })}
            </div>
            {busiest && (
              <p className="text-[10px] font-extralight text-muted-foreground/55 leading-relaxed">
                {busiest[0]} carries {busiest[1]} of {calEvents.length} events — {Math.round((busiest[1] / Math.max(1, calEvents.length)) * 100)}% of
                all commitments in the queried range. Weekdays showing no bar are structurally uncommitted, which makes them the
                cheapest place to move load off {busiest[0]}.
              </p>
            )}
          </div>
        )}

        {driveFiles.length > 0 && (
          <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
            <h4 className="text-xs font-light text-foreground flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5" /> Recent Document Activity
            </h4>
            <div className="space-y-1.5">
              {driveFiles.slice(0, 6).map((f: any, i: number) => (
                <div key={i} className="flex items-center gap-3 rounded-xl bg-foreground/5 px-3 py-2">
                  <span className="text-[11px] font-light text-foreground flex-1 truncate">{f.name}</span>
                  <span className="text-[9px] text-muted-foreground/40 shrink-0">
                    {f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString([], { month: "short", day: "numeric" }) : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-5 flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
          <Sparkles className="h-6 w-6 text-foreground/70" />
        </div>
        <div className="space-y-1 flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-light tracking-wide text-foreground">AUGUR — Predictive Intelligence</h3>
            {isConnected && (
              <button
                onClick={loadData}
                disabled={loading}
                className="flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                Sync
              </button>
            )}
          </div>
          <p className="text-[10px] font-extralight text-muted-foreground">
            {hasAnySurface
              ? `Projecting from ${calEvents.length} calendar records and ${emails.length} timestamped messages. Every projection carries its failure condition.`
              : "Link a Google account to enable forward projection."}
          </p>
        </div>
      </div>

      {/* ── Synthesis and findings sit above the tabs: they are the output. ── */}
      {synthesis && <FindingCard finding={synthesis} defaultOpen />}
      {findings.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-[9px] tracking-[0.22em] text-muted-foreground/40 font-light">STANDING JUDGEMENTS</h4>
          {findings.map((f) => (
            <FindingCard key={f.id} finding={f} defaultOpen={f.severity === "critical"} />
          ))}
        </section>
      )}

      <div className="flex gap-1 rounded-xl bg-card/20 border border-border/20 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            aria-pressed={activeTab === t.key}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-light transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30 ${
              activeTab === t.key
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground/50 hover:text-foreground/70 hover:bg-foreground/5"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {renderTab()}
    </div>
  );
};

export default LifePredictions;
