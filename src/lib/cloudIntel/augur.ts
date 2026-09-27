// ─────────────────────────────────────────────────────────────────────────────
// AUGUR — predictive synthesis over the cloud mesh.
//
// Augur owns no data of its own. It reads what Lattice, Archive and the raw
// Google surfaces already returned and answers one question: what does the
// next seven days look like, and what should be done about it today.
//
// Two rules shape every function here:
//   · Silence is data (Rule 16). An empty calendar is not an empty panel — it
//     is an unstructured day, and the correct output is the structure that
//     should occupy it.
//   · A prediction without a failure condition is a horoscope (Rule 18). Every
//     projection below carries the observation that would invalidate it.
// ─────────────────────────────────────────────────────────────────────────────

import {
  type Finding,
  type CrossSignal,
  confidenceFrom,
  mean,
  median,
  rejectNull,
  relativeDay,
  round,
  severityFromZ,
  signedPct,
  silenceFinding,
  slope,
  sortFindings,
  synthesize,
} from "./logic";

const DAY = 86400000;
const HOUR = 3600000;

export interface CalEvent {
  id?: string;
  summary?: string;
  start: string;
  end?: string;
  isAllDay?: boolean;
  attendees?: number;
  location?: string;
}

export interface InboxMessage {
  id?: string;
  subject?: string;
  from?: string;
  date?: string | number;
  internalDate?: string | number;
  snippet?: string;
}

export interface MailboxCounters {
  unread?: number;
  important?: number;
  starred?: number;
  inboxTotal?: number;
  inboxThreads?: number;
  inboxUnread?: number;
  importantTotal?: number;
  sentTotal?: number;
  draftTotal?: number;
  spamTotal?: number;
  trashTotal?: number;
  promotionsTotal?: number;
  socialTotal?: number;
  mailboxTotal?: number;
  lifetimeReciprocity?: number | null;
  source?: string;
}

// ───────────────────────────── time helpers ─────────────────────────────

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const msgTime = (m: InboxMessage): number | null => {
  const raw = m.internalDate ?? m.date;
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (Number.isFinite(n) && n > 1e11) return n; // epoch ms
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : null;
};

export const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ───────────────────────── commitment load model ─────────────────────────

export interface DayLoad {
  ts: number;
  label: string;
  /** Scheduled events landing on this day. */
  events: number;
  /** Hours of the day already claimed by timed events. */
  committedHours: number;
  /** Observed on a past day, projected on a future one. */
  observed: boolean;
  /** Projected inbound correspondence for future days. */
  projectedMail: number | null;
}

/**
 * Seven days forward. Commitment comes from the calendar (fact); correspondence
 * load is projected from the weekday profile of the observed mail window, so a
 * Sunday is never projected from a Tuesday's traffic.
 */
export function weekAhead(events: CalEvent[], messages: InboxMessage[]): DayLoad[] {
  // Weekday profile of observed inbound mail. Falls back to the flat mean when
  // a weekday has no observations rather than projecting zero.
  const byWeekday: number[][] = Array.from({ length: 7 }, () => []);
  const perDay = new Map<number, number>();
  for (const m of messages) {
    const t = msgTime(m);
    if (t == null) continue;
    const d = startOfDay(t);
    perDay.set(d, (perDay.get(d) || 0) + 1);
  }
  for (const [d, n] of perDay) byWeekday[new Date(d).getDay()].push(n);
  const flat = mean([...perDay.values()]);

  const today = startOfDay(Date.now());
  return Array.from({ length: 7 }, (_, i) => {
    const ts = today + i * DAY;
    const dayEvents = events.filter((e) => startOfDay(new Date(e.start).getTime()) === ts);
    // Two meetings booked over the same hour consume one hour of the day, not
    // two. Summing raw durations inflates a double-booked morning into an
    // impossible commitment and would poison every downstream projection, so
    // the intervals are merged before they are measured.
    const timed = dayEvents
      .filter((e) => !e.isAllDay)
      .map((e) => {
        const s = new Date(e.start).getTime();
        return [s, e.end ? new Date(e.end).getTime() : s + HOUR] as [number, number];
      })
      .filter(([s, en]) => en > s)
      .sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const iv of timed) {
      const last = merged[merged.length - 1];
      if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
      else merged.push([...iv] as [number, number]);
    }
    const allDayHours = dayEvents.filter((e) => e.isAllDay).length > 0 ? 8 : 0;
    const timedHours = merged.reduce((sum, [s, en]) => sum + (en - s) / HOUR, 0);
    // An all-day marker and timed meetings inside it are the same day, so the
    // day is capped rather than summed past a plausible working span.
    const committed = Math.min(24, Math.max(allDayHours, timedHours + (allDayHours ? 0 : 0)) || timedHours);

    const samples = byWeekday[new Date(ts).getDay()];
    const projected = samples.length ? median(samples) : flat > 0 ? flat : null;
    return {
      ts,
      label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : new Date(ts).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }),
      events: dayEvents.length,
      committedHours: round(committed, 1),
      observed: i === 0,
      projectedMail: projected != null ? Math.round(projected) : null,
    };
  });
}

// ───────────────────────────── focus windows ─────────────────────────────

export interface FocusBlock {
  ts: number;
  label: string;
  startHour: number;
  endHour: number;
  /** Why this window and not another. */
  rationale: string;
}

/**
 * Deep-work windows are carved out of the *actual* busy intervals for each day
 * inside the working band, then ranked against the hours the subject is
 * historically least interrupted by inbound mail.
 */
export function focusWindows(
  events: CalEvent[],
  messages: InboxMessage[],
  opts: { bandStart?: number; bandEnd?: number; minHours?: number; days?: number } = {}
): FocusBlock[] {
  const bandStart = opts.bandStart ?? 8;
  const bandEnd = opts.bandEnd ?? 18;
  const minHours = opts.minHours ?? 2;
  const days = opts.days ?? 5;

  // Inbound pressure by hour — the quietest hours make the best blocks.
  const hourLoad = new Array(24).fill(0);
  for (const m of messages) {
    const t = msgTime(m);
    if (t != null) hourLoad[new Date(t).getHours()]++;
  }
  const loadMean = mean(hourLoad);

  const today = startOfDay(Date.now());
  const blocks: FocusBlock[] = [];

  for (let i = 0; i < days; i++) {
    const ts = today + i * DAY;
    const dow = new Date(ts).getDay();
    if (dow === 0 || dow === 6) continue; // weekends are not scheduled against

    const busy: Array<[number, number]> = events
      .filter((e) => startOfDay(new Date(e.start).getTime()) === ts && !e.isAllDay)
      .map((e) => {
        const s = new Date(e.start).getTime();
        const en = e.end ? new Date(e.end).getTime() : s + HOUR;
        return [(s - ts) / HOUR, (en - ts) / HOUR] as [number, number];
      })
      .sort((a, b) => a[0] - b[0]);

    // Merge overlaps so back-to-back meetings do not manufacture phantom gaps.
    const merged: Array<[number, number]> = [];
    for (const iv of busy) {
      const last = merged[merged.length - 1];
      if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
      else merged.push([...iv] as [number, number]);
    }

    let cursor = bandStart;
    const gaps: Array<[number, number]> = [];
    for (const [s, e] of merged) {
      if (s > cursor) gaps.push([cursor, Math.min(s, bandEnd)]);
      cursor = Math.max(cursor, e);
    }
    if (cursor < bandEnd) gaps.push([cursor, bandEnd]);

    for (const [s, e] of gaps) {
      const span = e - s;
      if (span < minHours) continue;
      // Score the window by how far below mean inbound pressure it sits.
      const hours = Array.from({ length: Math.floor(span) }, (_, k) => hourLoad[Math.floor(s) + k] ?? 0);
      const quiet = loadMean > 0 ? (loadMean - mean(hours)) / loadMean : 0;
      blocks.push({
        ts,
        label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : new Date(ts).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }),
        startHour: Math.round(s),
        endHour: Math.round(Math.min(e, s + 4)),
        rationale:
          merged.length === 0
            ? "No commitments recorded on this day — the whole working band is uncontested."
            : quiet > 0.2
              ? `${round(span, 1)}h gap between commitments, and inbound mail runs ${Math.round(quiet * 100)}% below your hourly average here.`
              : `${round(span, 1)}h gap between commitments; inbound pressure is near your hourly average, so protect it explicitly.`,
      });
    }
  }

  return blocks.sort((a, b) => a.ts - b.ts || a.startHour - b.startHour).slice(0, 8);
}

// ───────────────────────── correspondent rhythm ─────────────────────────

export interface SendWindow {
  hour: number;
  share: number;
  rationale: string;
}

/**
 * When mail actually lands tells you when the correspondent pool is awake.
 * The optimal send window is the hour immediately *before* their peak receive
 * hour — arriving at the top of an active queue rather than the bottom of a
 * dormant one.
 */
export function optimalSendWindows(messages: InboxMessage[]): SendWindow[] {
  const hours = new Array(24).fill(0);
  let n = 0;
  for (const m of messages) {
    const t = msgTime(m);
    if (t == null) continue;
    hours[new Date(t).getHours()]++;
    n++;
  }
  if (n < 8) return [];
  return hours
    .map((count, hour) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(({ hour, count }) => {
      const target = (hour + 23) % 24;
      return {
        hour: target,
        share: count / n,
        rationale: `${Math.round((count / n) * 100)}% of observed traffic lands at ${String(hour).padStart(2, "0")}:00 — sending at ${String(target).padStart(2, "0")}:00 puts you at the top of that queue.`,
      };
    });
}

// ─────────────────────── inbound subject classification ───────────────────────

export type SignalClass =
  | "financial"
  | "legal"
  | "industry"
  | "scheduling"
  | "security"
  | "commercial"
  | "personal";

const CLASS_TERMS: Record<SignalClass, string[]> = {
  financial: ["invoice", "payment", "receipt", "billing", "wire", "funding", "investor", "valuation", "equity", "payout", "refund", "subscription", "charge"],
  legal: ["agreement", "contract", "nda", "terms", "counsel", "governance", "compliance", "royalty", "litigation", "clause"],
  industry: ["ai", "launch", "acquisition", "hiring", "raised", "startup", "report", "market", "announces", "walked away", "research"],
  scheduling: ["meeting", "invite", "reschedule", "calendar", "call", "availability", "confirm", "rsvp", "agenda"],
  security: ["security alert", "sign-in", "verification", "password", "2fa", "suspicious", "breach", "recovery", "unauthorized"],
  commercial: ["sale", "offer", "discount", "deal", "% off", "upgrade", "trial", "newsletter", "unsubscribe", "webinar"],
  personal: ["family", "birthday", "dinner", "photos", "thanks", "congrats"],
};

export interface ClassifiedSubject {
  subject: string;
  from: string;
  cls: SignalClass;
  /** The literal terms that produced the label — Rule 17, no black boxes. */
  matched: string[];
  ts: number | null;
}

export function classifyInbound(messages: InboxMessage[]): ClassifiedSubject[] {
  return messages.map((m) => {
    const subject = (m.subject || "(no subject)").trim();
    const hay = `${subject} ${m.snippet || ""}`.toLowerCase();
    let best: SignalClass = "personal";
    let bestHits: string[] = [];
    (Object.keys(CLASS_TERMS) as SignalClass[]).forEach((cls) => {
      const hits = CLASS_TERMS[cls].filter((t) => hay.includes(t));
      if (hits.length > bestHits.length) {
        best = cls;
        bestHits = hits;
      }
    });
    return {
      subject,
      from: (m.from || "").split("<")[0].trim() || (m.from || "unknown"),
      cls: bestHits.length ? best : "personal",
      matched: bestHits,
      ts: msgTime(m),
    };
  });
}

// ───────────────────────────── the finding set ─────────────────────────────

export interface AugurInput {
  connected: boolean;
  events: CalEvent[];
  messages: InboxMessage[];
  counters: MailboxCounters | null;
  contactCount: number;
  driveFileCount: number;
  /** Names of the highest-volume correspondents, if Lattice has run. */
  topCorrespondents?: string[];
}

export function augurFindings(input: AugurInput): Finding[] {
  const { connected, events, messages, counters } = input;
  const out: Finding[] = [];
  const now = Date.now();

  const week = weekAhead(events, messages);
  const scheduledHours = week.reduce((s, d) => s + d.committedHours, 0);
  const totalEvents = week.reduce((s, d) => s + d.events, 0);
  const projectedMail = week.reduce((s, d) => s + (d.projectedMail ?? 0), 0);

  // ── 1. Structure. An empty calendar is a finding, not a blank panel. ──
  if (totalEvents === 0) {
    if (!connected || messages.length === 0) {
      out.push(
        silenceFinding({
          module: "Augur",
          id: "augur-cold",
          subject: "Forward schedule",
          expected: "At least one commitment across a seven-day horizon",
          cause: [
            connected
              ? "The calendar query returned an empty window, and no mail was sampled to project against it."
              : "No account is linked, so neither calendar nor mail could be read.",
            "Without either surface, load cannot be projected and no window can be recommended.",
          ],
          action: connected ? "Run a sweep to populate the mail window Augur projects from." : "Link a Google account to enable forward projection.",
          connected,
        })
      );
    } else {
      // Silence *with* mail traffic is the important case: unstructured time
      // under live load is where reactive drift happens.
      const blocks = focusWindows(events, messages);
      const dailyMail = projectedMail / 7;
      out.push({
        id: "augur-unstructured",
        module: "Augur",
        severity: dailyMail >= 20 ? "elevated" : "notable",
        title: "Seven days carry no scheduled commitments while inbound traffic continues",
        current: `0 events · ${Math.round(scheduledHours)}h committed · ~${Math.round(dailyMail)} inbound/day projected`,
        normal: "A working week normally carries structured blocks that absorb inbound load",
        deviation: "100% of the horizon is unallocated",
        onset: `as of ${relativeDay(now)}`,
        why: [
          "No timed events exist in the seven-day window read from the calendar.",
          `Correspondence has not stopped — the weekday profile of the sampled window projects roughly ${Math.round(dailyMail)} inbound messages per day.`,
          "Unallocated time under live inbound load is claimed by whatever arrives first, not by what matters most.",
        ],
        chain: {
          primary: "Every hour is available, so every hour is interruptible.",
          secondary: "Work is selected by arrival order rather than priority — reactive mode.",
          tertiary: "Long-horizon commitments slip silently because nothing on the calendar defends them.",
        },
        basis: [
          `Calendar window: ${events.length} events returned across the queried range, ${totalEvents} landing in the next seven days.`,
          `Mail window: ${messages.length} sampled messages used to build the weekday projection.`,
          blocks.length
            ? `${blocks.length} uncontested windows of two hours or more exist inside 08:00–18:00 this week.`
            : "No qualifying uncontested window of two hours or more was found inside the working band.",
        ],
        confidence: confidenceFrom(messages.length, dailyMail >= 20 ? 2.2 : 1.4),
        falsifier: "A calendar event appearing in the next seven days, which converts unallocated time into a commitment.",
        action: blocks.length
          ? `Block ${blocks[0].label} ${String(blocks[0].startHour).padStart(2, "0")}:00–${String(blocks[0].endHour).padStart(2, "0")}:00 as protected focus time before the window is claimed.`
          : "Create two two-hour focus blocks inside the working band this week.",
      });
    }
  } else {
    // Load is present — the finding is its shape, not its existence.
    const loads = week.map((d) => d.committedHours);
    const k = slope(loads);
    const peak = week.reduce((a, b) => (b.committedHours > a.committedHours ? b : a));
    out.push({
      id: "augur-load",
      module: "Augur",
      severity: peak.committedHours >= 6 ? "elevated" : "baseline",
      title: `Committed time peaks at ${round(peak.committedHours, 1)}h on ${peak.label}`,
      current: `${round(scheduledHours, 1)}h across ${totalEvents} events`,
      normal: `${round(mean(loads), 1)}h/day average across this horizon`,
      deviation: signedPct(peak.committedHours, Math.max(0.1, mean(loads))),
      why: [
        `${totalEvents} timed commitments fall inside the seven-day window.`,
        k > 0.15 ? "Daily committed hours are trending upward across the horizon." : k < -0.15 ? "Daily committed hours are trending downward across the horizon." : "Committed hours are flat across the horizon.",
        peak.committedHours >= 6 ? "A day above six committed hours leaves under two working hours for unscheduled work and inbound response." : "No single day exceeds the six-hour commitment ceiling.",
      ],
      chain: {
        primary: `${peak.label} has ${round(Math.max(0, 10 - peak.committedHours), 1)}h of uncommitted working time.`,
        secondary: `Projected inbound of roughly ${peak.projectedMail ?? "—"} messages must be absorbed inside that remainder.`,
        tertiary: "Overflow migrates to evenings or to the following day, compounding the next peak.",
      },
      basis: [
        `Event durations were summed from start/end pairs; all-day events count as eight hours.`,
        `Weekday mail profile built from ${messages.length} timestamped messages.`,
      ],
      confidence: confidenceFrom(totalEvents * 6, peak.committedHours >= 6 ? 2 : 1),
      falsifier: `${peak.label} clearing to under three committed hours through cancellation.`,
      action: peak.committedHours >= 6
        ? `Move one commitment off ${peak.label} into an adjacent lighter day.`
        : "Hold the current distribution; no day is over the commitment ceiling.",
    });
  }

  // ── 2. Mailbox classification audit (Rule 17). ──
  if (counters) {
    const unread = counters.unread ?? 0;
    const important = counters.important ?? 0;
    const starred = counters.starred ?? 0;
    const identical = unread > 0 && unread === important && important === starred;
    const backlogShare = counters.inboxTotal ? unread / counters.inboxTotal : 0;

    if (identical) {
      out.push({
        id: "augur-counter-integrity",
        module: "Augur",
        severity: "critical",
        title: "Unread, important and starred are reporting the same figure",
        current: `${unread} / ${important} / ${starred}`,
        normal: "Three independent labels produce three independent counts",
        deviation: "zero variance across independent classifiers",
        why: [
          "Three separately-maintained Gmail labels cannot legitimately hold identical totals at this scale.",
          "The reading is being produced by a page-size estimate rather than the label counters.",
          `Reported source: ${counters.source || "unknown"}.`,
        ],
        basis: [`Counter source declared as "${counters.source || "unknown"}".`, "Values compared field-by-field on the current response."],
        confidence: 96,
        falsifier: "The next sweep returning three distinct values.",
        action: "Re-sync. If the figures remain identical, the mailbox counter source is degraded and downstream classification should be treated as unreliable.",
        chain: {
          primary: "Prioritisation signals cannot be distinguished from raw volume.",
          secondary: "Every downstream projection weights unimportant mail as important.",
          tertiary: "Operator trust in the classification layer is lost entirely.",
        },
      });
    } else if (backlogShare > 0.4 && (counters.inboxTotal ?? 0) > 50) {
      const replyable = Math.max(0, unread - (counters.promotionsTotal ?? 0) - (counters.socialTotal ?? 0));
      out.push({
        id: "augur-backlog",
        module: "Augur",
        severity: backlogShare > 0.7 ? "elevated" : "notable",
        title: `${Math.round(backlogShare * 100)}% of the inbox is unread`,
        current: `${unread} unread of ${counters.inboxTotal} in inbox`,
        normal: "A worked inbox holds unread below roughly 20% of its total",
        deviation: signedPct(backlogShare * 100, 20),
        why: [
          `${unread} messages carry the UNREAD label against an inbox of ${counters.inboxTotal}.`,
          `${(counters.promotionsTotal ?? 0) + (counters.socialTotal ?? 0)} of the mailbox sits in promotions and social categories, which inflate the backlog without demanding a reply.`,
          `Roughly ${replyable} unread messages plausibly require a human response.`,
        ],
        chain: {
          primary: "Genuinely actionable mail is hidden inside categorised bulk.",
          secondary: "Response latency to real correspondents rises without any single message being ignored deliberately.",
          tertiary: "Relationship drift begins in the highest-value threads first, because those are the least frequent.",
        },
        basis: [
          `Exact label counters: UNREAD ${unread}, IMPORTANT ${important}, STARRED ${starred}, PROMOTIONS ${counters.promotionsTotal ?? 0}, SOCIAL ${counters.socialTotal ?? 0}.`,
          `Lifetime reciprocity: ${counters.lifetimeReciprocity != null ? `${Math.round(counters.lifetimeReciprocity * 100)}% of mailbox volume is outbound` : "not computable"}.`,
        ],
        confidence: confidenceFrom(counters.inboxTotal ?? 0, backlogShare * 3),
        falsifier: "Unread falling below 20% of inbox total on a subsequent sweep.",
        action: `Filter promotions and social out of the working view, then clear the ~${replyable} messages that can actually generate a reply.`,
      });
    }

    // Reciprocity — a mailbox that only receives is a mailbox that is drifting.
    if (counters.lifetimeReciprocity != null && (counters.mailboxTotal ?? 0) > 200) {
      const r = counters.lifetimeReciprocity;
      if (r < 0.15) {
        out.push({
          id: "augur-reciprocity",
          module: "Augur",
          severity: "notable",
          title: `Only ${Math.round(r * 100)}% of mailbox volume is outbound`,
          current: `${counters.sentTotal ?? 0} sent against ${counters.inboxTotal ?? 0} received`,
          normal: "An actively-worked mailbox runs 25–40% outbound",
          deviation: signedPct(r * 100, 30),
          why: [
            "Send volume is a small fraction of receive volume across the mailbox lifetime.",
            "Low outbound share is consistent with a consumption inbox rather than a working correspondence channel.",
            "Inbound-dominant mailboxes generate relationship decay without producing any visible error.",
          ],
          basis: [`SENT ${counters.sentTotal ?? 0}, INBOX ${counters.inboxTotal ?? 0}, DRAFTS ${counters.draftTotal ?? 0}, mailbox total ${counters.mailboxTotal ?? 0}.`],
          confidence: confidenceFrom(counters.mailboxTotal ?? 0, 1.6),
          falsifier: "Outbound share rising above 25% over the next thirty days.",
          action: `Clear the ${counters.draftTotal ?? 0} standing drafts — unsent drafts are the cheapest available outbound volume.`,
          chain: {
            primary: "Correspondents receive less than they send.",
            secondary: "Reply expectation decays on their side before it registers on yours.",
            tertiary: "Threads terminate without a visible ending event.",
          },
        });
      }
    }
  } else {
    out.push(
      silenceFinding({
        module: "Augur",
        id: "augur-no-counters",
        subject: "Mailbox counters",
        expected: "Exact per-label totals from the connected mailbox",
        cause: [
          "The mailbox counter read failed or was not attempted on this sweep.",
          "Without exact label totals, backlog and reciprocity cannot be benchmarked.",
        ],
        action: "Re-sync to fetch mailbox label counters.",
        connected,
      })
    );
  }

  // ── 3. Inbound composition — what the traffic is actually about. ──
  const classified = classifyInbound(messages);
  if (classified.length >= 5) {
    const tally = new Map<SignalClass, ClassifiedSubject[]>();
    classified.forEach((c) => {
      const arr = tally.get(c.cls) || [];
      arr.push(c);
      tally.set(c.cls, arr);
    });
    const ranked = [...tally.entries()].sort((a, b) => b[1].length - a[1].length);
    const [topClass, topItems] = ranked[0];
    const share = topItems.length / classified.length;
    if (share >= 0.3 && topClass !== "personal") {
      out.push({
        id: "augur-composition",
        module: "Augur",
        severity: topClass === "security" ? "elevated" : "notable",
        title: `${Math.round(share * 100)}% of sampled inbound is ${topClass} traffic`,
        current: `${topItems.length} of ${classified.length} messages`,
        normal: "No single theme dominates a mixed inbox beyond roughly 30%",
        deviation: signedPct(share * 100, 30),
        why: [
          `Term matching over subjects and snippets placed ${topItems.length} messages in the ${topClass} class.`,
          `Second theme: ${ranked[1] ? `${ranked[1][0]} (${ranked[1][1].length})` : "none"}.`,
          "A dominant theme means the week's real workload is concentrated, regardless of what the calendar says.",
        ],
        basis: topItems.slice(0, 4).map((i) => `"${i.subject.slice(0, 70)}" — matched: ${i.matched.join(", ") || "no term"}`),
        confidence: confidenceFrom(classified.length, share * 3),
        falsifier: `${topClass} traffic dropping below 30% of the sample on the next sweep.`,
        action: topClass === "security"
          ? "Open the security-classified messages first — authentication traffic is time-boxed."
          : `Allocate the next focus block to ${topClass} work; that is where the inbound is actually pointing.`,
      });
    }
  }

  return sortFindings(out);
}

// ───────────────────── cross-module synthesis (Rule 10) ─────────────────────

export function augurSynthesis(input: AugurInput): Finding | null {
  const { events, messages, counters, contactCount, driveFileCount } = input;
  const week = weekAhead(events, messages);
  const totalEvents = week.reduce((s, d) => s + d.events, 0);
  const unread = counters?.unread ?? 0;
  const inboxTotal = counters?.inboxTotal ?? 0;
  const backlogShare = inboxTotal ? unread / inboxTotal : 0;

  const signals: CrossSignal[] = [];

  if (totalEvents === 0 && messages.length > 0) {
    signals.push({
      module: "Augur",
      label: "Unstructured horizon",
      z: 2.1,
      detail: "no scheduled commitments across seven days while mail continues to arrive",
    });
  }
  if (backlogShare > 0.4) {
    signals.push({
      module: "Lattice",
      label: "Inbox backlog",
      z: Math.min(3, backlogShare * 3),
      detail: `${unread} unread of ${inboxTotal} — ${Math.round(backlogShare * 100)}% of the inbox`,
    });
  }
  if (driveFileCount > 0 && contactCount > 0) {
    const ratio = driveFileCount / Math.max(1, contactCount);
    if (ratio > 0.5) {
      signals.push({
        module: "Archive",
        label: "Document-to-correspondent ratio",
        z: Math.min(3, ratio * 2),
        detail: `${driveFileCount} recent documents against ${contactCount} known identities`,
      });
    }
  }
  if (counters?.lifetimeReciprocity != null && counters.lifetimeReciprocity < 0.15) {
    signals.push({
      module: "Lattice",
      label: "Outbound deficit",
      z: 1.8,
      detail: `${Math.round(counters.lifetimeReciprocity * 100)}% of lifetime mailbox volume is outbound`,
    });
  }

  // The theme must match the evidence. A backlog under a *busy* week is an
  // absorption problem, not a structure problem, and calling it "unstructured"
  // when the calendar is full would be a false narrative built on true signals.
  const unstructured = signals.some((s) => s.label === "Unstructured horizon");

  return synthesize(
    signals,
    unstructured
      ? {
          id: "augur-reactive-mode",
          title: "High inbound load against an unstructured week — reactive-mode risk",
          why: [
            "Commitment structure and inbound volume are moving in opposite directions.",
            "Unallocated time under live load is consumed by arrival order rather than priority.",
            "The pattern is self-reinforcing: unworked backlog raises tomorrow's inbound, which further crowds out structure.",
          ],
          chain: {
            primary: "Working hours are allocated by whatever arrives first.",
            secondary: "Deep work is displaced by correspondence triage.",
            tertiary: "Commitments with no calendar footprint slip without generating any alert.",
          },
          action: "Place two two-hour focus blocks on the calendar today, then triage the backlog inside a single bounded window rather than continuously.",
          falsifier: "Either a scheduled commitment appearing in the horizon, or unread falling below 20% of inbox total.",
        }
      : {
          id: "augur-absorption",
          title: "Correspondence backlog is accumulating against an already-committed week",
          why: [
            "The calendar is carrying commitments, so the hours available to absorb inbound are already reduced.",
            "Backlog and outbound deficit are rising in the same window, which means arriving mail is not being converted into replies.",
            "Structure is present; absorption capacity is not. This is a throughput problem, not a planning one.",
          ],
          chain: {
            primary: "Inbound accumulates faster than committed days can clear it.",
            secondary: "Reply latency rises uniformly, including on the highest-value threads.",
            tertiary: "Correspondents re-route around you rather than escalate, and the loss is invisible in every counter.",
          },
          action: "Convert one committed hour on the heaviest day into a bounded triage window rather than adding a new block to an already-full week.",
          falsifier: "Unread falling below 20% of inbox total, or outbound share rising above 25%, on a subsequent sweep.",
        }
  );
}


// ───────────────────────── relationship drift (Rule 3) ─────────────────────────

export interface DriftWarning {
  name: string;
  days: number;
  detail: string;
}

/**
 * Silence against a *known* correspondent is the signal. Contacts that never
 * corresponded are excluded — absence of a relationship is not decay of one.
 */
export function relationshipDrift(
  contacts: Array<{ name?: string; email?: string; organization?: string }>,
  messages: InboxMessage[],
  thresholdDays = 14
): DriftWarning[] {
  const lastSeen = new Map<string, number>();
  for (const m of messages) {
    const t = msgTime(m);
    const addr = (m.from || "").match(/[\w.+-]+@[\w.-]+/)?.[0]?.toLowerCase();
    if (!t || !addr) continue;
    lastSeen.set(addr, Math.max(lastSeen.get(addr) || 0, t));
  }
  const now = Date.now();
  return contacts
    .map((c) => {
      const addr = c.email?.toLowerCase();
      if (!addr) return null;
      const t = lastSeen.get(addr);
      if (!t) return null; // never corresponded inside the window — not drift
      const days = Math.floor((now - t) / DAY);
      if (days < thresholdDays) return null;
      return {
        name: c.name || addr,
        days,
        detail: `Last inbound ${days} days ago${c.organization ? ` · ${c.organization}` : ""}. Threshold is ${thresholdDays} days of silence from a correspondent with established traffic.`,
      };
    })
    .filter((d): d is DriftWarning => d !== null)
    .sort((a, b) => b.days - a.days)
    .slice(0, 8);
}
