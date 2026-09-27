import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapPin, RefreshCw, AlertTriangle, Compass, Route, Clock, Building2,
} from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";
import {
  buildVenues, movementProfile, forecastPresence, DAY_NAMES, type Venue,
} from "@/lib/cloudIntel/movement";
import {
  silenceFinding, sortFindings, confidenceFrom, round, relativeDay,
  percentile, ordinal, type Finding,
} from "@/lib/cloudIntel/logic";
import { setPendingVenues } from "@/lib/cloudIntel/mapBridge";
import FindingCard from "../intel/FindingCard";
import { TrendStat, BaselineBar } from "../intel/TrendStat";
import Heatmap, { type HeatCell } from "../intel/Heatmap";

// PROPHET — presence and movement inference.
// A list of addresses is not a prophecy. This module normalises venues, measures
// dwell and revisit cadence, tests each timing pattern against coincidence, and
// only then projects where the subject will be — with a falsifier attached.

const WINDOW_BACK_DAYS = 120;
const WINDOW_FORWARD_DAYS = 30;

const LocationProphet = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const now = Date.now();
      const data = await fetchGoogleData("calendar_events", {
        timeMin: new Date(now - WINDOW_BACK_DAYS * 86400000).toISOString(),
        timeMax: new Date(now + WINDOW_FORWARD_DAYS * 86400000).toISOString(),
        maxResults: 500,
      });
      setEvents(data.events || []);
    } catch (err: any) {
      console.error("[Prophet] presence sweep failed:", err);
      setError(err?.message || "Presence sweep failed.");
    } finally {
      setLoading(false);
    }
  }, [fetchGoogleData]);

  useEffect(() => { if (isConnected) loadData(); }, [isConnected, loadData]);

  const venues = useMemo(() => buildVenues(events), [events]);
  const profile = useMemo(
    () => movementProfile(venues, WINDOW_BACK_DAYS + WINDOW_FORWARD_DAYS),
    [venues]
  );
  const forecasts = useMemo(() => forecastPresence(venues, WINDOW_FORWARD_DAYS), [venues]);

  const heatCells = useMemo<HeatCell[]>(
    () => venues.flatMap((v) => v.visits.map((x) => ({ day: x.day, hour: x.hour, count: 1 }))),
    [venues]
  );

  const locatedCount = venues.reduce((a, v) => a + v.visits.length, 0);
  const unlocated = events.length - locatedCount;

  const findings = useMemo<Finding[]>(() => {
    if (!isConnected) {
      return [silenceFinding({
        module: "Prophet", id: "prophet-unlinked", subject: "Calendar presence",
        expected: "A linked calendar typically yields 20–300 located events across 150 days",
        cause: ["No account is linked, so no calendar geometry exists to model."],
        action: "Link an account under Account Mesh to begin presence modelling.", connected: false,
      })];
    }
    if (!venues.length) {
      return [silenceFinding({
        module: "Prophet", id: "prophet-empty", subject: "Located calendar events",
        expected: "20–300 events carrying a location field",
        cause: [
          `${events.length} events were returned, but none carried a usable location string.`,
          "Presence cannot be inferred from a title alone — the location field is the only geometry the calendar exposes.",
          "Events created by meeting links often omit a physical location entirely.",
        ],
        action: "Add a location to recurring commitments; each one immediately becomes a modellable venue.",
        connected: true,
      })];
    }

    const out: Finding[] = [];
    const dwellPopulation = venues.map((v) => v.totalHours);

    // 1. Anchor concentration.
    const top = venues[0];
    out.push({
      id: "prophet-anchor",
      module: "Prophet",
      severity: profile.concentration > 0.6 ? "elevated" : "notable",
      title: `Your scheduled life concentrates on ${profile.anchors.length || 1} anchor venue${profile.anchors.length === 1 ? "" : "s"}`,
      current: `${top.label} — ${top.totalHours}h across ${top.visits.length} visits`,
      normal: `${round(dwellPopulation.reduce((a, b) => a + b, 0) / venues.length, 1)}h per venue`,
      deviation: `${Math.round(profile.concentration * 100)}% of all scheduled hours in one place`,
      onset: `first observed ${relativeDay(top.firstSeen)}`,
      why: [
        "Total dwell hours per venue is derived from event start/end pairs, not from event counts, so a long day weighs more than three short calls.",
        `${top.label} sits at the ${ordinal(percentile(top.totalHours, dwellPopulation))} percentile of your own venue population.`,
        profile.concentration > 0.6
          ? "A concentration above 60% means your whereabouts are effectively deterministic to anyone who learns this one address."
          : "Concentration is moderate — presence is distributed across several places.",
      ],
      chain: {
        primary: "Whereabouts at any given hour are predictable from a single address.",
        secondary: "A pattern this tight requires no surveillance to reconstruct — the calendar alone suffices.",
        tertiary: "Anyone with historical access to this calendar can forecast your presence weeks ahead.",
      },
      basis: venues.slice(0, 5).map((v) => `${v.label} — ${v.visits.length} visits, ${v.totalHours}h total, median dwell ${v.medianDwellHours}h`),
      confidence: profile.confidence,
      falsifier: "A materially different distribution once unlocated events are geocoded.",
      action: profile.concentration > 0.6
        ? "Vary arrival timing at the anchor venue, or remove its address from calendar entries shared outside your control."
        : "No action required — logged as a mobility baseline.",
    });

    // 2. Proven periodic venues.
    const periodic = venues.filter((v) => v.patternConfidence >= 50 && v.physical);
    if (periodic.length) {
      const p = periodic[0];
      out.push({
        id: "prophet-periodicity",
        module: "Prophet",
        severity: "notable",
        title: `${periodic.length} venue${periodic.length === 1 ? " survives" : "s survive"} the coincidence test`,
        current: `${p.label} every ${p.cadenceDays}d, ${Math.round(p.modalShare * 100)}% on ${DAY_NAMES[p.modalDay ?? 0]}`,
        normal: "14% per weekday under a random schedule",
        deviation: `${Math.round((p.modalShare - 1 / 7) * 100)} points above chance`,
        why: [
          "The null hypothesis tested is that visits fall uniformly across weekdays; these venues reject it.",
          "Rejection requires both a large weekday skew and enough visits for the skew to be meaningful — a two-visit coincidence cannot pass.",
          "Venues that fail the test are excluded from the forecast entirely rather than reported at low confidence.",
        ],
        basis: periodic.slice(0, 6).map((v) => `${v.label} — ${v.visits.length} visits, ${Math.round(v.modalShare * 100)}% on ${DAY_NAMES[v.modalDay ?? 0]}, cadence ${v.cadenceDays}d ±${v.cadenceJitterDays ?? 0}d, ${v.patternConfidence}% rejection`),
        confidence: Math.round(periodic.reduce((a, v) => a + v.patternConfidence, 0) / periodic.length),
        falsifier: "The pattern collapsing next cycle — one missed visit at the modal weekday drops the rejection below threshold.",
        action: "Treat the forecast below as reliable only for the venues listed here.",
      });
    }

    // 3. Tight transitions — schedule collisions.
    if (profile.tightTransitions.length) {
      const t = profile.tightTransitions[0];
      out.push({
        id: "prophet-transitions",
        module: "Prophet",
        severity: t.slackMinutes < 0 ? "critical" : "elevated",
        title: `${profile.tightTransitions.length} venue transition${profile.tightTransitions.length === 1 ? " has" : "s have"} under 30 minutes of slack`,
        current: `${t.slackMinutes} min between ${t.from.label} and ${t.to.label}`,
        normal: profile.medianTransitionHours != null ? `${round(profile.medianTransitionHours * 60)} min typical slack` : "no established transition baseline",
        deviation: t.slackMinutes < 0 ? "overlapping commitments" : `${Math.round((profile.medianTransitionHours ?? 1) * 60) - t.slackMinutes} min below your normal`,
        onset: `next occurrence ${new Date(t.at).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}`,
        why: [
          "Slack is measured between the scheduled end of one located event and the start of the next at a different venue.",
          t.slackMinutes < 0
            ? "A negative value means the two commitments physically overlap — one of them cannot be attended as scheduled."
            : "Under 30 minutes leaves no travel margin for any physical distance between the two venues.",
        ],
        chain: {
          primary: "One of the two commitments starts late or is missed.",
          secondary: "Downstream events in the same day inherit the slip.",
        },
        basis: profile.tightTransitions.map((x) => `${new Date(x.at).toLocaleDateString()} — ${x.from.label} → ${x.to.label}, ${x.slackMinutes} min`),
        confidence: 94,
        falsifier: "Either venue being virtual, or the two addresses resolving to the same building.",
        action: `Rebuild the ${new Date(t.at).toLocaleDateString()} block — move one commitment or convert it to a call.`,
      });
    }

    // 4. Coverage honesty — silence is data.
    if (unlocated > 0) {
      out.push({
        id: "prophet-coverage",
        module: "Prophet",
        severity: unlocated / Math.max(1, events.length) > 0.6 ? "notable" : "baseline",
        title: `${unlocated} of ${events.length} events carry no location`,
        current: `${Math.round((unlocated / Math.max(1, events.length)) * 100)}% of the calendar is geometrically blind`,
        normal: "every physical commitment carries an address",
        deviation: `${locatedCount} located vs ${unlocated} blind`,
        why: [
          "Events without a location field cannot contribute to dwell, cadence, or transition analysis.",
          "Every figure in this module is therefore a lower bound on your actual movement, not a complete picture.",
        ],
        chain: {
          primary: "Presence forecasts omit whatever happens at unlocated events.",
          secondary: "A collision between a located and an unlocated event would go undetected.",
        },
        basis: [`${events.length} events returned across ${WINDOW_BACK_DAYS + WINDOW_FORWARD_DAYS} days; ${locatedCount} carried a usable location string.`],
        confidence: 99,
        falsifier: "The unlocated events being virtual by nature, in which case the coverage gap is not a gap at all.",
        action: "Add addresses to recurring physical commitments to close the geometric blind spot.",
      });
    }

    // 5. Virtual displacement.
    if (profile.virtualShare > 0.35) {
      out.push({
        id: "prophet-virtual",
        module: "Prophet",
        severity: "baseline",
        title: `${Math.round(profile.virtualShare * 100)}% of located hours are virtual, not physical`,
        current: `${Math.round(profile.virtualShare * 100)}% virtual`,
        normal: "physical presence dominates a located calendar",
        deviation: `mobility index ${profile.mobilityIndex} distinct physical venues per week`,
        why: [
          "Location strings containing meeting-platform URLs are classified as virtual and excluded from movement geometry.",
          "A calendar dominated by virtual events describes attention, not whereabouts.",
        ],
        basis: venues.filter((v) => !v.physical).slice(0, 4).map((v) => `${v.label} — ${v.visits.length} sessions, ${v.totalHours}h`),
        confidence: confidenceFrom(venues.length * 3, 1.5, 85),
        falsifier: "Virtual events being attended from varying physical locations, which would restore movement the model cannot see.",
        action: "Use the transition analysis above only for the physical subset.",
      });
    }

    return sortFindings(out);
  }, [isConnected, venues, profile, events.length, locatedCount, unlocated]);

  const maxDwell = Math.max(1, ...venues.map((v) => v.totalHours));

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/5">
            <Compass className="h-6 w-6 text-foreground/70" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extralight tracking-wide text-foreground">Prophet</h2>
                <p className="text-[9px] tracking-[0.22em] text-muted-foreground/40 font-light">PRESENCE &amp; MOVEMENT INFERENCE</p>
              </div>
              {isConnected && (
                <button
                  onClick={loadData}
                  disabled={loading}
                  className="flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                  Sweep
                </button>
              )}
              {isConnected && venues.length > 0 && (
                <button
                  onClick={() => {
                    setPendingVenues(venues);
                    navigate("/dashboard/asherin-eye");
                  }}
                  className="flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-all"
                >
                  <MapPin className="h-3 w-3" /> Plot on map
                </button>
              )}
            </div>
            <p className="text-sm font-extralight leading-relaxed text-muted-foreground">
              {isConnected
                ? `${venues.length} venues resolved from ${events.length} events across ${WINDOW_BACK_DAYS} days back and ${WINDOW_FORWARD_DAYS} forward. Model confidence ${profile.confidence}%.`
                : "Link an account to model dwell time, revisit cadence, and forward presence."}
            </p>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
          <p className="text-[11px] font-extralight text-muted-foreground">{error} — showing the last successful sweep.</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <TrendStat
          label="Physical venues"
          value={profile.physicalVenues.length}
          population={venues.map((v) => v.visits.length)}
          hint={`${profile.mobilityIndex} distinct venues per week`}
          loading={loading}
        />
        <TrendStat
          label="Anchor share"
          value={`${Math.round(profile.concentration * 100)}%`}
          hint={venues[0] ? `${venues[0].label.slice(0, 28)}` : "no anchor established"}
          loading={loading}
        />
        <TrendStat
          label="Proven patterns"
          value={venues.filter((v) => v.patternConfidence >= 50).length}
          hint="Venues that beat the coincidence test"
          loading={loading}
        />
        <TrendStat
          label="Transition slack"
          value={profile.medianTransitionHours != null ? `${Math.round(profile.medianTransitionHours * 60)}m` : "—"}
          hint={`${profile.tightTransitions.length} collisions under 30 min`}
          loading={loading}
        />
      </div>

      <section className="space-y-2">
        <h3 className="text-[9px] tracking-[0.22em] text-muted-foreground/40 font-light">SYNTHESIS</h3>
        {findings.map((f) => (
          <FindingCard key={f.id} finding={f} defaultOpen={f.severity === "critical" || f.severity === "elevated"} />
        ))}
      </section>

      {forecasts.length > 0 && (
        <section className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
          <h3 className="text-xs font-light tracking-wide text-foreground flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" /> Forward Presence — next {WINDOW_FORWARD_DAYS} days
          </h3>
          <div className="space-y-1.5">
            {forecasts.map((f, i) => (
              <div key={`${f.venue.key}-${i}`} className="rounded-xl bg-foreground/[0.04] px-3 py-2.5 space-y-1">
                <div className="flex items-center gap-3">
                  <MapPin className="h-3.5 w-3.5 text-foreground/45 shrink-0" />
                  <span className="text-xs font-light text-foreground flex-1 truncate">{f.venue.label}</span>
                  <span className="text-[10px] text-muted-foreground/60 shrink-0">{f.window}</span>
                  <span className="text-[9px] text-muted-foreground/35 shrink-0 w-10 text-right">{f.confidence}%</span>
                </div>
                <p className="text-[9px] font-extralight text-muted-foreground/50 pl-6 leading-relaxed">
                  {f.basis} Wrong if: {f.falsifier.toLowerCase()}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <Heatmap
        cells={heatCells}
        title="Presence Rhythm — when you are scheduled to be somewhere"
        emptyNote="No located event carries a usable timestamp, so no weekly rhythm can be drawn. Add times and addresses to recurring commitments to populate this grid."
      />

      {venues.length > 0 && (
        <section className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
          <h3 className="text-xs font-light tracking-wide text-foreground flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5" /> Venue Ledger — dwell against your own average
          </h3>
          <div className="space-y-2.5">
            {venues.slice(0, 14).map((v: Venue) => (
              <div key={v.key} className="space-y-1">
                <BaselineBar
                  label={`${v.label}${v.physical ? "" : " (virtual)"}`}
                  value={v.totalHours}
                  baseline={round(venues.reduce((a, x) => a + x.totalHours, 0) / venues.length, 1)}
                  max={maxDwell}
                  suffix="h"
                />
                <p className="text-[9px] font-extralight text-muted-foreground/45">
                  {v.role} · {v.visits.length} visits · median dwell {v.medianDwellHours}h
                  {v.cadenceDays ? ` · returns every ~${v.cadenceDays}d` : " · single visit, no cadence"}
                  {v.patternConfidence ? ` · pattern beats chance at ${v.patternConfidence}%` : " · timing indistinguishable from coincidence"}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {profile.tightTransitions.length > 0 && (
        <section className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
          <h3 className="text-xs font-light tracking-wide text-foreground flex items-center gap-2">
            <Route className="h-3.5 w-3.5" /> Transition Collisions
          </h3>
          <div className="space-y-1.5">
            {profile.tightTransitions.map((t, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl bg-foreground/5 px-4 py-2.5">
                <span className={`text-[10px] font-light w-14 shrink-0 ${t.slackMinutes < 0 ? "text-destructive/80" : "text-amber-400/70"}`}>
                  {t.slackMinutes < 0 ? "overlap" : `${t.slackMinutes}m`}
                </span>
                <span className="text-[11px] font-extralight text-muted-foreground flex-1 truncate">
                  {t.from.label} → {t.to.label}
                </span>
                <span className="text-[9px] text-muted-foreground/40 shrink-0">
                  {new Date(t.at).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default LocationProphet;
