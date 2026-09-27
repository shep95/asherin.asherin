// ─────────────────────────────────────────────────────────────────────────────
// MOVEMENT ENGINE — location inference from calendar geometry.
//
// The prior module listed event locations and called it a prophecy. Listing is
// not prediction. Prediction requires: normalising place strings into venues,
// measuring dwell time and revisit cadence per venue, testing whether a
// weekday/hour pattern beats coincidence, and only then stating where the
// subject will be — with a confidence and a falsifier attached.
// ─────────────────────────────────────────────────────────────────────────────

import { median, mad, rejectNull, confidenceFrom, round, fmtDays } from "./logic";

export interface CalEvent {
  id: string;
  summary?: string;
  start?: string;
  end?: string;
  location?: string;
  attendees?: number;
  attendeeEmails?: string[];
  isAllDay?: boolean;
}

export interface Visit {
  eventId: string;
  venueKey: string;
  startTs: number;
  endTs: number;
  durationHours: number;
  day: number;   // 0–6
  hour: number;  // 0–23
  attendees: number;
  summary: string;
}

export interface Venue {
  key: string;
  label: string;
  /** True when the string looks like a physical place rather than a meeting link. */
  physical: boolean;
  visits: Visit[];
  totalHours: number;
  medianDwellHours: number;
  firstSeen: number;
  lastSeen: number;
  /** Median days between visits. */
  cadenceDays: number | null;
  cadenceJitterDays: number | null;
  /** Modal weekday and hour, with the share of visits that land on it. */
  modalDay: number | null;
  modalHour: number | null;
  modalShare: number;
  /** Rejection confidence for "this venue's timing is coincidence". */
  patternConfidence: number;
  nextExpectedAt: number | null;
  role: "anchor" | "orbit" | "transient" | "virtual";
}

const VIRTUAL = /(zoom\.|meet\.google|teams\.microsoft|webex|hangout|https?:\/\/|phone|call in|dial)/i;
const NOISE = /^\s*(tbd|tba|n\/a|online|virtual|remote)\s*$/i;

/** Normalise a free-text location into a stable venue key. */
export function venueKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\b(suite|ste|apt|unit|floor|fl|room|rm)\s*#?\s*\w+/g, "")
    .replace(/[^a-z0-9, ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(",")
    .slice(0, 2)          // street + city is identity; the rest is postal noise
    .join(",")
    .trim();
}

export function buildVenues(events: CalEvent[]): Venue[] {
  const visits = new Map<string, Visit[]>();
  const labels = new Map<string, string>();

  for (const e of events) {
    const loc = (e.location || "").trim();
    if (!loc || NOISE.test(loc)) continue;
    const startTs = e.start ? Date.parse(e.start) : NaN;
    const endTs = e.end ? Date.parse(e.end) : NaN;
    if (!Number.isFinite(startTs)) continue;

    const key = venueKey(loc);
    if (!key) continue;
    if (!labels.has(key)) labels.set(key, loc);

    const d = new Date(startTs);
    const durationHours =
      Number.isFinite(endTs) && endTs > startTs ? (endTs - startTs) / 3600000 : e.isAllDay ? 8 : 1;

    const v: Visit = {
      eventId: e.id,
      venueKey: key,
      startTs,
      endTs: Number.isFinite(endTs) ? endTs : startTs + durationHours * 3600000,
      durationHours,
      day: d.getDay(),
      hour: d.getHours(),
      attendees: e.attendees ?? 0,
      summary: e.summary || "Untitled",
    };
    if (!visits.has(key)) visits.set(key, []);
    visits.get(key)!.push(v);
  }

  const venues: Venue[] = [];
  for (const [key, list] of visits) {
    list.sort((a, b) => a.startTs - b.startTs);
    const label = labels.get(key) || key;
    const physical = !VIRTUAL.test(label);

    const gaps: number[] = [];
    for (let i = 1; i < list.length; i++) gaps.push((list[i].startTs - list[i - 1].startTs) / 86400000);
    const cadenceDays = gaps.length ? round(median(gaps), 1) : null;
    const cadenceJitter = gaps.length > 1 ? round(mad(gaps), 1) : null;

    // Modal timing. A venue visited "sometimes" is not predictive; a venue
    // visited on the same weekday 70% of the time is.
    const dayCount = new Array(7).fill(0);
    const hourCount = new Array(24).fill(0);
    list.forEach((v) => { dayCount[v.day]++; hourCount[v.hour]++; });
    const modalDay = list.length ? dayCount.indexOf(Math.max(...dayCount)) : null;
    const modalHour = list.length ? hourCount.indexOf(Math.max(...hourCount)) : null;
    const modalShare = list.length ? Math.max(...dayCount) / list.length : 0;

    // Null hypothesis: visits are uniformly spread across weekdays (1/7 each).
    const expected = 1 / 7;
    const effect = list.length >= 3 ? (modalShare - expected) / Math.sqrt((expected * (1 - expected)) / list.length) : 0;
    const patternConfidence = rejectNull(effect, list.length);

    const totalHours = list.reduce((a, v) => a + v.durationHours, 0);
    const last = list[list.length - 1];
    const nextExpectedAt =
      patternConfidence && cadenceDays ? last.startTs + cadenceDays * 86400000 : null;

    const role: Venue["role"] = !physical
      ? "virtual"
      : totalHours >= 20 && list.length >= 4
      ? "anchor"
      : list.length >= 2
      ? "orbit"
      : "transient";

    venues.push({
      key,
      label,
      physical,
      visits: list,
      totalHours: round(totalHours, 1),
      medianDwellHours: round(median(list.map((v) => v.durationHours)), 1),
      firstSeen: list[0].startTs,
      lastSeen: last.startTs,
      cadenceDays,
      cadenceJitterDays: cadenceJitter,
      modalDay,
      modalHour,
      modalShare,
      patternConfidence,
      nextExpectedAt,
      role,
    });
  }

  return venues.sort((a, b) => b.totalHours - a.totalHours || b.visits.length - a.visits.length);
}

export interface MovementProfile {
  venues: Venue[];
  physicalVenues: Venue[];
  anchors: Venue[];
  /** Share of scheduled hours spent at the single most-used venue. */
  concentration: number;
  /** Distinct physical venues per week. */
  mobilityIndex: number;
  /** Median hours between the end of one located event and the start of the next at a different venue. */
  medianTransitionHours: number | null;
  /** Transitions with under 30 minutes of slack — schedule collisions. */
  tightTransitions: { from: Venue; to: Venue; at: number; slackMinutes: number }[];
  virtualShare: number;
  confidence: number;
}

export function movementProfile(venues: Venue[], windowDays: number): MovementProfile {
  const physical = venues.filter((v) => v.physical);
  const totalHours = venues.reduce((a, v) => a + v.totalHours, 0) || 1;
  const anchors = physical.filter((v) => v.role === "anchor");

  // Flatten every physical visit into a timeline to measure transitions.
  const timeline = physical
    .flatMap((v) => v.visits.map((visit) => ({ visit, venue: v })))
    .sort((a, b) => a.visit.startTs - b.visit.startTs);

  const slacks: number[] = [];
  const tight: MovementProfile["tightTransitions"] = [];
  for (let i = 1; i < timeline.length; i++) {
    const prev = timeline[i - 1];
    const cur = timeline[i];
    if (prev.venue.key === cur.venue.key) continue;
    const slackMinutes = (cur.visit.startTs - prev.visit.endTs) / 60000;
    if (slackMinutes < -60 || slackMinutes > 24 * 60) continue;
    slacks.push(slackMinutes / 60);
    if (slackMinutes < 30) {
      tight.push({ from: prev.venue, to: cur.venue, at: cur.visit.startTs, slackMinutes: Math.round(slackMinutes) });
    }
  }

  const weeks = Math.max(1, windowDays / 7);
  return {
    venues,
    physicalVenues: physical,
    anchors,
    concentration: venues.length ? round((venues[0]?.totalHours ?? 0) / totalHours, 3) : 0,
    mobilityIndex: round(physical.length / weeks, 2),
    medianTransitionHours: slacks.length ? round(median(slacks), 2) : null,
    tightTransitions: tight.sort((a, b) => a.at - b.at).slice(0, 8),
    virtualShare: round(1 - physical.reduce((a, v) => a + v.totalHours, 0) / totalHours, 3),
    confidence: confidenceFrom(venues.reduce((a, v) => a + v.visits.length, 0), 1.6, 88),
  };
}

export interface Forecast {
  venue: Venue;
  at: number;
  window: string;
  confidence: number;
  basis: string;
  falsifier: string;
}

/** Forward projection for the next `days` days, strongest pattern first. */
export function forecastPresence(venues: Venue[], days = 14): Forecast[] {
  const out: Forecast[] = [];
  const horizon = Date.now() + days * 86400000;

  for (const v of venues) {
    if (!v.patternConfidence || !v.cadenceDays || v.modalHour == null) continue;
    let at = v.lastSeen + v.cadenceDays * 86400000;
    let guard = 0;
    while (at < Date.now() && guard++ < 60) at += v.cadenceDays * 86400000;
    while (at <= horizon && guard++ < 90) {
      const d = new Date(at);
      const slack = Math.max(1, Math.round(v.cadenceJitterDays ?? 1));
      out.push({
        venue: v,
        at,
        window: `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} ±${slack}d, around ${String(v.modalHour).padStart(2, "0")}:00`,
        confidence: v.patternConfidence,
        basis: `${v.visits.length} prior visits, median cadence ${fmtDays(v.cadenceDays)}, ${Math.round(v.modalShare * 100)}% land on the same weekday.`,
        falsifier: `No event at ${v.label} within ${slack + 1} days of the projected date.`,
      });
      at += v.cadenceDays * 86400000;
    }
  }

  return out.sort((a, b) => a.at - b.at || b.confidence - a.confidence).slice(0, 12);
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
