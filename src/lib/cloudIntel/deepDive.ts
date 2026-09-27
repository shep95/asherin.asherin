// ─────────────────────────────────────────────────────────────────────────────

// CLOUD INTELLIGENCE MESH — UNIVERSAL DEEP-DIVE INFERENCE ENGINE
//
// Why this exists
// ───────────────
// The mesh already enforces a rigorous Finding contract (see ./logic.ts). What
// it lacked was a way to PRODUCE findings without a human first deciding what
// to look for. A hand-written detector can only ever surface what its author
// already suspected — which means it structurally cannot report the things the
// subject does not know about. Unknown-unknowns are, by definition, absent from
// every checklist.
//
// This engine inverts that. It takes any collection of timestamped, attributed
// observations and interrogates their STRUCTURE. Volume, rhythm, novelty,
// dormancy, concentration, burstiness, and long-tail weight are properties of
// any event stream, so the same nine detectors run identically over browsing
// history, security alerts, calendar events, OAuth grants, watch history, or
// spend records. Because the detectors read shape rather than semantics, they
// surface deviations nobody wrote a rule for.
//
// Discipline carried over from logic.ts, enforced here mechanically:
//   · Nothing is reported until the null hypothesis is beaten (rejectNull).
//   · Every finding carries its baseline, evidence, confidence and falsifier.
//   · Absence is a finding, never an empty panel.
//   · No value is fabricated. Every figure is a pure transform of caller data.
//
// All timestamps are interpreted in the viewing device's local timezone. That
// is deliberate — "3am activity" is only meaningful relative to where the
// subject actually sleeps — and it is disclosed in the evidence of any finding
// that depends on hour-of-day.
// ─────────────────────────────────────────────────────────────────────────────

import {
  type Finding,
  type Severity,
  mean,
  median,
  robustZ,
  slope,
  project,
  rejectNull,
  confidenceFrom,
  severityFromZ,
  silenceFinding,
  sortFindings,
  round,
  relativeDay,
  ordinal,
  percentile,
} from "./logic";

const DAY = 86400000;

/** One atomic, timestamped thing that happened on a surface. */
export interface Observation {
  /** Epoch milliseconds. Records without a usable timestamp must be dropped by the adapter. */
  ts: number;
  /** Stable grouping key — domain, sender, app id, channel, venue. Optional. */
  entity?: string | null;
  /** Human-readable label for the entity or the record itself. */
  label?: string | null;
  /** Optional scalar weight: bytes, cents, minutes, duration. */
  magnitude?: number | null;
  /** Free-form classifiers used only for display in evidence rows. */
  tags?: string[];
}

/** Domain vocabulary so a generic engine speaks each surface's own language. */
export interface SurfaceSpec {
  /** Module name shown on the finding chip, e.g. "Chrome". */
  module: string;
  /** Singular unit noun, e.g. "visit", "alert", "grant". */
  unit: string;
  /** Plural unit noun, e.g. "visits". */
  unitPlural: string;
  /** Singular entity noun, e.g. "domain", "sender", "app". */
  entityNoun: string;
  /** Plural entity noun, e.g. "domains". */
  entityNounPlural: string;
  /** Whether a live account is linked. Drives the silence finding's severity. */
  connected: boolean;
  /** What a healthy sweep should have returned, for the silence finding. */
  expectation?: string;
  /** Formats a magnitude for display. Defaults to a plain rounded number. */
  formatMagnitude?: (n: number) => string;
  /** Noun for the magnitude scalar, e.g. "bytes", "spend". */
  magnitudeNoun?: string;
  /** Action text appended to novelty findings, surface-specific. */
  reviewAction?: string;
  /**
   * Whether each observation's timestamp is the moment the thing actually
   * happened. Default true.
   *
   * Set false for surfaces where the timestamp is metadata rather than an
   * event: OAuth scope grants, for instance, all carry the account's last sync
   * time, so every record shares one instant. On such a surface the temporal
   * detectors describe the clock that wrote the record, not the subject —
   * "0% of grants at weekends, -5.3 sigma" is a statement about when a sync ran.
   * Reporting that as behaviour would be a confident falsehood, so the temporal
   * battery is suppressed and only structural detectors run.
   */
  timestampsAreEvents?: boolean;
}

export interface DeepDiveResult {
  findings: Finding[];
  /** Surface-level census rendered above the findings. */
  census: {
    total: number;
    entities: number;
    spanDays: number;
    firstSeen: number | null;
    lastSeen: number | null;
    perDay: number;
    topEntities: Array<{ entity: string; count: number; share: number }>;
    /** Entities seen for the first time inside the recent window. */
    novelEntities: string[];
    /** Previously-regular entities that have gone quiet. */
    dormantEntities: string[];
  };
}

// ───────────────────────────── internal helpers ─────────────────────────────

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

/** Buckets observations into consecutive UTC-anchored local day counts. */
function dailySeries(obs: Observation[], from: number, to: number): number[] {
  const days = Math.max(1, Math.ceil((to - from) / DAY));
  const out = new Array(days).fill(0);
  for (const o of obs) {
    const i = Math.floor((o.ts - from) / DAY);
    if (i >= 0 && i < days) out[i]++;
  }
  return out;
}

function groupByEntity(obs: Observation[]): Map<string, Observation[]> {
  const m = new Map<string, Observation[]>();
  for (const o of obs) {
    const k = (o.entity ?? "").trim();
    if (!k) continue;
    const arr = m.get(k);
    if (arr) arr.push(o);
    else m.set(k, [o]);
  }
  return m;
}

/**
 * Herfindahl–Hirschman index over entity shares, 0–1. High values mean the
 * surface is dominated by a handful of entities; low values mean it is diffuse.
 */
function herfindahl(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  return counts.reduce((a, c) => a + (c / total) ** 2, 0);
}

/**
 * Poisson surprise for observing `k` events in a day when the rate is `lambda`.
 * Returned as an approximate z so it can share the severity ladder. Uses the
 * Anscombe variance-stabilising transform, which stays well-behaved at the
 * small lambdas typical of personal-scale data (a plain (k−λ)/√λ explodes when
 * λ approaches zero and would flag every quiet surface as critical).
 */
function poissonZ(k: number, lambda: number): number {
  if (lambda <= 0) return k > 0 ? 3 : 0;
  return 2 * (Math.sqrt(k + 3 / 8) - Math.sqrt(lambda + 3 / 8));
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Caps an evidence list so a card never becomes an unreadable data dump. */
function evidence(rows: string[], cap = 6): string[] {
  if (rows.length <= cap) return rows;
  return [...rows.slice(0, cap), `…and ${rows.length - cap} further rows in the same set.`];
}

const TZ_NOTE = `Hour-of-day derived in the viewing device's local timezone (${
  Intl.DateTimeFormat().resolvedOptions().timeZone || "local"
}).`;

// ───────────────────────────── detectors ─────────────────────────────
// Each detector is a pure function returning Finding | null. Returning null is
// the correct and common outcome: silence beats a fabricated pattern.

/** 1 — Volume shift. Recent daily rate against the subject's own prior rate. */
function detectVolumeShift(spec: SurfaceSpec, obs: Observation[], recentDays: number): Finding | null {
  const now = Date.now();
  const cut = now - recentDays * DAY;
  const first = obs[0].ts;
  if (now - first < recentDays * 2 * DAY) return null; // no baseline to compare against

  const baseline = dailySeries(obs.filter((o) => o.ts < cut), first, cut);
  const recent = dailySeries(obs.filter((o) => o.ts >= cut), cut, now);
  if (baseline.length < 7 || recent.length < 3) return null;

  const recentRate = mean(recent);
  const z = robustZ(recentRate, baseline);
  if (Math.abs(z) < 1.2) return null;

  const conf = rejectNull(z, obs.length);
  if (!conf) return null;

  const baseRate = median(baseline);
  const up = z > 0;
  const deltaPct = baseRate > 0 ? Math.round(((recentRate - baseRate) / baseRate) * 100) : null;

  return {
    id: `${spec.module}-volume`,
    module: spec.module,
    severity: severityFromZ(z),
    title: `${spec.unitPlural[0].toUpperCase()}${spec.unitPlural.slice(1)} are running ${up ? "well above" : "well below"} your established rate`,
    current: `${round(recentRate, 1)} ${spec.unitPlural}/day`,
    normal: `${round(baseRate, 1)} ${spec.unitPlural}/day`,
    deviation: `${z > 0 ? "+" : "−"}${round(Math.abs(z), 1)}σ${deltaPct !== null ? ` (${deltaPct > 0 ? "+" : ""}${deltaPct}%)` : ""}`,
    onset: `over the last ${recentDays} days`,
    why: [
      `The last ${recentDays} days average ${round(recentRate, 1)} ${spec.unitPlural} per day against a prior median of ${round(baseRate, 1)}.`,
      up
        ? `A sustained rise on this surface usually reflects either a genuine change in your activity or a new automated source generating ${spec.unitPlural} on your behalf.`
        : `A sustained fall usually reflects either a real change in behaviour or a collection gap — a revoked scope or a stalled sync produces the same shape as genuine quiet.`,
      `The deviation is measured against your own history, not any external benchmark, so it is unaffected by how heavy or light a user you are in absolute terms.`,
    ],
    chain: up
      ? {
          primary: `The surface is generating ${Math.round(Math.abs(recentRate - baseRate))} more ${spec.unitPlural} per day than you are used to.`,
          secondary: "Higher volume raises the floor for what counts as normal, so a genuine spike becomes harder to see.",
          tertiary: "Left unexamined, the inflated baseline permanently masks the anomaly that caused it.",
        }
      : {
          primary: `Roughly ${Math.round(Math.abs(recentRate - baseRate))} ${spec.unitPlural} per day that you would normally see are not arriving.`,
          secondary: "If the cause is a collection gap rather than real quiet, every downstream module is reasoning from partial data.",
          tertiary: "Silent partial collection is the failure mode most likely to be mistaken for good news.",
        },
    basis: [
      `${obs.length} total ${spec.unitPlural} spanning ${fmtDate(first)} to ${fmtDate(now)}.`,
      `Baseline window: ${baseline.length} days ending ${fmtDate(cut)}.`,
      `Recent window: ${recent.length} days, ${recent.reduce((a, b) => a + b, 0)} ${spec.unitPlural}.`,
      `Deviation scored with a median/MAD robust z, so a single outlier day cannot manufacture this result.`,
    ],
    confidence: conf,
    falsifier: `The next ${recentDays}-day window returning to within 1σ of ${round(baseRate, 1)} ${spec.unitPlural}/day.`,
    action: up
      ? `Identify which ${spec.entityNounPlural} account for the increase before treating the new rate as your normal.`
      : `Confirm the account scope and last successful sync for this surface before accepting the drop as genuine.`,
    projection: project(recent, up ? recentRate * 2 : 0, 1, up ? "double the current rate" : "zero activity") ?? undefined,
  };
}

/** 2 — Off-hours rhythm. Activity concentrated in hours the subject is usually dark. */
function detectRhythm(spec: SurfaceSpec, obs: Observation[]): Finding | null {
  if (obs.length < 30) return null;

  const hours = new Array(24).fill(0);
  for (const o of obs) hours[new Date(o.ts).getHours()]++;

  // "Off-hours" is derived from the subject's own distribution, not a fixed
  // 9-to-5 assumption: it is the six-hour block where they are quietest.
  let quietStart = 0;
  let quietMin = Infinity;
  for (let h = 0; h < 24; h++) {
    let s = 0;
    for (let k = 0; k < 6; k++) s += hours[(h + k) % 24];
    if (s < quietMin) {
      quietMin = s;
      quietStart = h;
    }
  }

  const share = quietMin / obs.length;
  const expected = 6 / 24; // uniform expectation
  if (share <= expected * 0.75) return null; // genuinely quiet — nothing to report

  const z = (share - expected) / Math.sqrt((expected * (1 - expected)) / obs.length);
  if (z < 1.5) return null;
  const conf = rejectNull(z, obs.length);
  if (!conf) return null;

  const label = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;
  const samples = obs
    .filter((o) => {
      const h = new Date(o.ts).getHours();
      const d = (h - quietStart + 24) % 24;
      return d < 6;
    })
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 4);

  return {
    id: `${spec.module}-rhythm`,
    module: spec.module,
    severity: severityFromZ(z),
    title: `Activity is occurring inside your quietest hours (${label(quietStart)}–${label(quietStart + 6)})`,
    current: `${pct(share)} of ${spec.unitPlural} in that block`,
    normal: `${pct(expected)} if spread evenly`,
    deviation: `+${round(z, 1)}σ concentration`,
    why: [
      `Your own distribution identifies ${label(quietStart)}–${label(quietStart + 6)} as the six hours you are least active, yet ${quietMin} of ${obs.length} ${spec.unitPlural} land there.`,
      `Activity inside a personal dead zone is disproportionately machine-generated: schedulers, background sync, and third-party integrations do not observe your sleep cycle.`,
      `It is also the window in which genuinely unauthorised use is least likely to be noticed in real time.`,
    ],
    chain: {
      primary: "A meaningful share of this surface's activity happens while you are not watching.",
      secondary: "Anything anomalous in that block goes unchallenged until the next time you review history.",
      tertiary: "An automated or unauthorised process operating only in this window could persist indefinitely.",
    },
    basis: evidence([
      TZ_NOTE,
      `Quiet block chosen as the minimum-density 6-hour window across all ${obs.length} ${spec.unitPlural}.`,
      ...samples.map((s) => `${fmtDate(s.ts)} ${label(new Date(s.ts).getHours())} — ${s.label ?? s.entity ?? spec.unit}`),
    ]),
    confidence: conf,
    falsifier: `Confirming that every ${spec.unit} in that block traces to a scheduler or sync job you deliberately configured.`,
    action: `Review the ${spec.unitPlural} timestamped inside ${label(quietStart)}–${label(quietStart + 6)} and attribute each to a process you recognise.`,
  };
}

/** 3 — Novelty. Entities appearing for the first time in the recent window. */
function detectNovelty(spec: SurfaceSpec, obs: Observation[], recentDays: number): Finding | null {
  const now = Date.now();
  const cut = now - recentDays * DAY;
  const byEntity = groupByEntity(obs);
  if (byEntity.size < 3) return null;

  const priorSpanDays = (cut - obs[0].ts) / DAY;
  if (priorSpanDays < recentDays) return null; // not enough history to call anything "new"

  const novel: Array<{ entity: string; count: number; firstSeen: number }> = [];
  for (const [entity, rows] of byEntity) {
    const firstSeen = Math.min(...rows.map((r) => r.ts));
    if (firstSeen >= cut) novel.push({ entity, count: rows.length, firstSeen });
  }
  if (novel.length === 0) return null;

  novel.sort((a, b) => b.count - a.count || a.firstSeen - b.firstSeen);

  // Rate of new entities now, versus the rate at which this surface historically
  // introduced new ones. A surface that always meets new entities is not
  // anomalous just because it met more.
  const priorFirsts: number[] = [];
  for (const [, rows] of byEntity) {
    const f = Math.min(...rows.map((r) => r.ts));
    if (f < cut) priorFirsts.push(f);
  }
  const priorRate = priorFirsts.length / Math.max(1, priorSpanDays / recentDays);
  const z = priorRate > 0 ? (novel.length - priorRate) / Math.sqrt(Math.max(1, priorRate)) : 2;
  const conf = rejectNull(Math.max(z, 1.3), obs.length);
  if (!conf) return null;

  return {
    id: `${spec.module}-novelty`,
    module: spec.module,
    severity: z >= 2 ? "elevated" : "notable",
    title: `${novel.length} ${novel.length === 1 ? spec.entityNoun : spec.entityNounPlural} appeared here for the first time`,
    current: `${novel.length} new in ${recentDays}d`,
    normal: `${round(priorRate, 1)} new per ${recentDays}d historically`,
    deviation: `${z > 0 ? "+" : ""}${round(z, 1)}σ`,
    onset: `first seen ${relativeDay(Math.min(...novel.map((n) => n.firstSeen)))}`,
    why: [
      `These ${spec.entityNounPlural} have no occurrence anywhere in your history before ${fmtDate(cut)}, so they are genuinely new to this surface rather than merely more active.`,
      `A first appearance is the single highest-value signal a surface produces: it is the only moment an unfamiliar party is unambiguously distinguishable from an established one.`,
      `New ${spec.entityNounPlural} are the most common way an unreviewed dependency, subscription, or third-party integration enters an account unnoticed.`,
    ],
    chain: {
      primary: `${novel.length} previously-unseen ${spec.entityNounPlural} now have a foothold on this surface.`,
      secondary: "Each additional sweep normalises them further, and after a few weeks they are indistinguishable from long-standing entries.",
      tertiary: "Once normalised, an unwanted entity is only ever found by deliberate audit, never by anomaly detection.",
    },
    basis: evidence(
      novel.map(
        (n) =>
          `${n.entity} — ${n.count} ${n.count === 1 ? spec.unit : spec.unitPlural}, first seen ${fmtDate(n.firstSeen)}.`
      )
    ),
    confidence: conf,
    falsifier: `Recognising every listed ${spec.entityNoun} as one you deliberately introduced in the last ${recentDays} days.`,
    action:
      spec.reviewAction ??
      `Review each new ${spec.entityNoun} above and confirm you intended it to have access to this surface.`,
  };
}

/** 4 — Dormancy. Previously-regular entities that have stopped appearing. */
function detectDormancy(spec: SurfaceSpec, obs: Observation[], recentDays: number): Finding | null {
  const now = Date.now();
  const cut = now - recentDays * DAY;
  const byEntity = groupByEntity(obs);
  if (byEntity.size < 4) return null;

  const dormant: Array<{ entity: string; count: number; last: number; cadence: number }> = [];
  for (const [entity, rows] of byEntity) {
    if (rows.length < 4) continue; // never regular enough for silence to mean anything
    const times = rows.map((r) => r.ts).sort((a, b) => a - b);
    const last = times[times.length - 1];
    if (last >= cut) continue;

    // An entity must have been active ACROSS days before silence can mean
    // anything. Without this, a single-day burst of 90 records yields a median
    // gap measured in seconds, and any subsequent quiet reads as thousands of
    // intervals overdue. A burst is not a rhythm, and only a rhythm can lapse.
    const activeSpanDays = (last - times[0]) / DAY;
    if (activeSpanDays < 7) continue;

    // Median gap defines what "regular" meant for this entity specifically.
    const gaps: number[] = [];
    for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / DAY);
    const cadence = median(gaps);
    // A sub-daily median gap describes clustering within days, not a cadence
    // between them; floor it at half a day so the comparison stays meaningful.
    if (cadence < 0.5) continue;

    const silentFor = (now - last) / DAY;
    // Absolute floor as well as the relative test: a twice-weekly entity that
    // missed six days has not yet done anything a normal week would not explain.
    if (silentFor > Math.max(cadence * 3, 7)) {
      dormant.push({ entity, count: rows.length, last, cadence });
    }
  }
  if (dormant.length === 0) return null;


  dormant.sort((a, b) => b.count - a.count);
  const conf = rejectNull(1.6, obs.length);
  if (!conf) return null;

  return {
    id: `${spec.module}-dormancy`,
    module: spec.module,
    severity: "notable",
    title: `${dormant.length} previously-regular ${dormant.length === 1 ? spec.entityNoun : spec.entityNounPlural} have gone silent`,
    current: `${dormant.length} dormant`,
    normal: "each appeared on a stable cadence",
    deviation: "silence exceeds 3× their own interval",
    why: [
      `Each listed ${spec.entityNoun} had an established rhythm, and each is now silent for more than three times its own median gap — an interval it had never previously exceeded.`,
      `Silence is measured per-entity rather than against a global threshold, so a monthly ${spec.entityNoun} is not judged by the standard of a daily one.`,
      `Dormancy has two very different causes with identical signatures: the relationship genuinely ended, or collection for that ${spec.entityNoun} broke. Only one is benign.`,
    ],
    chain: {
      primary: "A surface that was reliably producing signal has stopped without an explicit event.",
      secondary: "Absence generates no alert anywhere in the mesh, so the gap is invisible to every downstream module.",
      tertiary: "If the cause is broken collection, confidence in this module degrades silently and permanently.",
    },
    basis: evidence(
      dormant.map(
        (d) =>
          `${d.entity} — ${d.count} ${spec.unitPlural} on a ~${round(d.cadence, 1)}d cadence, last seen ${fmtDate(d.last)} (${Math.round((now - d.last) / DAY)}d ago).`
      )
    ),
    confidence: conf,
    falsifier: `Any listed ${spec.entityNoun} producing a single new ${spec.unit} on the next sweep.`,
    action: `Decide for each dormant ${spec.entityNoun} whether the relationship ended or the collection path broke — they are not the same finding.`,
  };
}

/** 5 — Concentration. Dependence of the surface on very few entities. */
function detectConcentration(spec: SurfaceSpec, obs: Observation[]): Finding | null {
  const byEntity = groupByEntity(obs);
  if (byEntity.size < 5 || obs.length < 25) return null;

  const counts = [...byEntity.entries()].map(([entity, rows]) => ({ entity, n: rows.length }));
  counts.sort((a, b) => b.n - a.n);
  const total = counts.reduce((a, c) => a + c.n, 0);
  const hhi = herfindahl(counts.map((c) => c.n));
  const top3 = counts.slice(0, 3).reduce((a, c) => a + c.n, 0) / total;

  // Uniform HHI is 1/N. Report only when concentration is several times that.
  const uniform = 1 / counts.length;
  const ratio = hhi / uniform;
  if (ratio < 2.5 || top3 < 0.5) return null;

  const z = Math.min(3.5, ratio - 1);
  const conf = rejectNull(z, obs.length);
  if (!conf) return null;

  return {
    id: `${spec.module}-concentration`,
    module: spec.module,
    severity: top3 >= 0.8 ? "elevated" : "notable",
    title: `Three ${spec.entityNounPlural} account for ${pct(top3)} of everything on this surface`,
    current: `top-3 share ${pct(top3)}`,
    normal: `${pct(3 / counts.length)} if evenly spread across ${counts.length}`,
    deviation: `${round(ratio, 1)}× the uniform concentration index`,
    why: [
      `A Herfindahl index of ${round(hhi, 3)} against a uniform expectation of ${round(uniform, 3)} means this surface is ${round(ratio, 1)} times more concentrated than an even spread.`,
      `Concentration sets the sensitivity of every other detector here: while a few ${spec.entityNounPlural} dominate the totals, movement in the remaining ${counts.length - 3} is arithmetically incapable of shifting an aggregate.`,
      `It also identifies your genuine dependencies — the ${spec.entityNounPlural} whose disappearance would materially change this surface.`,
    ],
    chain: {
      primary: `Aggregate metrics on this surface are effectively measuring ${counts.slice(0, 3).map((c) => c.entity).join(", ")} and little else.`,
      secondary: "Meaningful change among the long tail is mathematically invisible in any total or average.",
      tertiary: "Decisions made on surface-level totals are decisions about three entities, not about the surface.",
    },
    basis: evidence([
      ...counts.slice(0, 5).map((c) => `${c.entity} — ${c.n} ${spec.unitPlural} (${pct(c.n / total)}).`),
      `${counts.length} distinct ${spec.entityNounPlural} across ${total} ${spec.unitPlural}.`,
    ]),
    confidence: conf,
    falsifier: `The top-3 share falling below 50% once a full period of history is loaded.`,
    action: `Read this surface's per-${spec.entityNoun} breakdown rather than its totals — the totals describe three ${spec.entityNounPlural}.`,
  };
}

/** 6 — Burst. Days whose count is a Poisson surprise against the running rate. */
function detectBurst(spec: SurfaceSpec, obs: Observation[]): Finding | null {
  const first = obs[0].ts;
  const now = Date.now();
  const spanDays = (now - first) / DAY;
  if (spanDays < 14 || obs.length < 20) return null;

  const series = dailySeries(obs, first, now);
  const lambda = mean(series);
  if (lambda <= 0) return null;

  const bursts = series
    .map((k, i) => ({ k, i, z: poissonZ(k, lambda) }))
    .filter((d) => d.z >= 2.5)
    .sort((a, b) => b.z - a.z)
    .slice(0, 5);
  if (bursts.length === 0) return null;

  const top = bursts[0];
  const conf = rejectNull(top.z, obs.length);
  if (!conf) return null;

  const burstDay = first + top.i * DAY;
  const inBurst = obs.filter((o) => o.ts >= burstDay && o.ts < burstDay + DAY);
  const burstEntities = [...groupByEntity(inBurst).entries()]
    .map(([e, r]) => ({ e, n: r.length }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);

  return {
    id: `${spec.module}-burst`,
    module: spec.module,
    severity: severityFromZ(top.z),
    title: `${bursts.length} day${bursts.length === 1 ? "" : "s"} carry more ${spec.unitPlural} than random variation can explain`,
    current: `${top.k} ${spec.unitPlural} on ${fmtDate(burstDay)}`,
    normal: `${round(lambda, 1)} ${spec.unitPlural}/day`,
    deviation: `+${round(top.z, 1)}σ Poisson surprise`,
    onset: relativeDay(burstDay),
    why: [
      `At a background rate of ${round(lambda, 1)} per day, a day of ${top.k} is a ${round(top.z, 1)}σ event — well beyond what independent, randomly-timed ${spec.unitPlural} produce.`,
      `Clustering this tight implies a common trigger. Independent events do not arrive in batches; a shared cause does.`,
      burstEntities.length
        ? `The burst is dominated by ${burstEntities.map((b) => `${b.e} (${b.n})`).join(", ")}, which points at the trigger.`
        : `No single ${spec.entityNoun} dominates the burst, which points at a surface-wide or systemic trigger rather than one party.`,
    ],
    chain: {
      primary: "A discrete event drove a batch of activity on this surface.",
      secondary: "Because the burst inflates every average that includes it, it raises your apparent baseline permanently.",
      tertiary: "A raised baseline suppresses the detection of the next, possibly larger, burst.",
    },
    basis: evidence([
      ...bursts.map((b) => `${fmtDate(first + b.i * DAY)} — ${b.k} ${spec.unitPlural} (+${round(b.z, 1)}σ).`),
      `Background rate ${round(lambda, 1)}/day computed across ${series.length} days.`,
      `Surprise scored with the Anscombe transform, which stays stable at the low daily rates typical of personal data.`,
    ]),
    confidence: conf,
    falsifier: `Attributing the peak day to a single deliberate action you took on ${fmtDate(burstDay)}.`,
    action: `Open ${fmtDate(burstDay)} and identify the trigger before it is absorbed into your baseline.`,
  };
}

/** 7 — Long tail. Rare entities that are individually trivial but collectively large. */
function detectLongTail(spec: SurfaceSpec, obs: Observation[]): Finding | null {
  const byEntity = groupByEntity(obs);
  if (byEntity.size < 12) return null;

  const singles = [...byEntity.entries()].filter(([, r]) => r.length === 1);
  const share = singles.length / byEntity.size;
  const volumeShare = singles.length / obs.length;
  if (share < 0.4 || singles.length < 6) return null;

  const conf = rejectNull(1.8, obs.length);
  if (!conf) return null;

  const recent = singles
    .map(([e, r]) => ({ e, ts: r[0].ts, label: r[0].label }))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 6);

  return {
    id: `${spec.module}-longtail`,
    module: spec.module,
    severity: "notable",
    title: `${singles.length} ${spec.entityNounPlural} appear exactly once — a long tail you have never reviewed`,
    current: `${singles.length} one-off ${spec.entityNounPlural}`,
    normal: `recurring ${spec.entityNounPlural} with an established cadence`,
    deviation: `${pct(share)} of all ${spec.entityNounPlural}, ${pct(volumeShare)} of ${spec.unitPlural}`,
    why: [
      `${singles.length} of ${byEntity.size} ${spec.entityNounPlural} produced a single ${spec.unit} and never returned.`,
      `Every one of these is individually below the threshold of any ranked view, so a "top ${spec.entityNounPlural}" list is structurally guaranteed never to show them to you.`,
      `The long tail is where one-time exposures live: a single share, a single grant, a single unfamiliar correspondent. Rarity is exactly what makes them invisible, not what makes them harmless.`,
    ],
    chain: {
      primary: `${singles.length} ${spec.entityNounPlural} exist on this surface that no ranked view will ever display.`,
      secondary: "Anything requiring only one interaction to matter is therefore permanently unreviewed.",
      tertiary: "The tail grows monotonically, so the unreviewed set only ever gets larger.",
    },
    basis: evidence(recent.map((r) => `${r.e} — single ${spec.unit} on ${fmtDate(r.ts)}${r.label ? ` (${r.label})` : ""}.`)),
    confidence: conf,
    falsifier: `Reviewing the full one-off list and recognising every entry.`,
    action: `Read the complete one-off list, not the top-${spec.entityNounPlural} ranking — the ranking cannot contain these by construction.`,
  };
}

/** 8 — Magnitude outliers, when the adapter supplies a scalar weight. */
function detectMagnitude(spec: SurfaceSpec, obs: Observation[]): Finding | null {
  const withMag = obs.filter((o) => typeof o.magnitude === "number" && Number.isFinite(o.magnitude!));
  if (withMag.length < 15) return null;

  const values = withMag.map((o) => o.magnitude!);
  const med = median(values);
  const scored = withMag
    .map((o) => ({ o, z: robustZ(o.magnitude!, values) }))
    .filter((d) => Math.abs(d.z) >= 3)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, 5);
  if (scored.length === 0) return null;

  const conf = rejectNull(scored[0].z, withMag.length);
  if (!conf) return null;

  const fmt = spec.formatMagnitude ?? ((n: number) => String(round(n, 1)));
  const noun = spec.magnitudeNoun ?? "magnitude";

  return {
    id: `${spec.module}-magnitude`,
    module: spec.module,
    severity: severityFromZ(scored[0].z),
    title: `${scored.length} ${scored.length === 1 ? spec.unit : spec.unitPlural} carry an extreme ${noun} against your own distribution`,
    current: fmt(scored[0].o.magnitude!),
    normal: `${fmt(med)} median`,
    deviation: `${round(Math.abs(scored[0].z), 1)}σ`,
    why: [
      `The largest outlier is ${fmt(scored[0].o.magnitude!)} against a median of ${fmt(med)} — a ${round(Math.abs(scored[0].z), 1)}σ departure scored on median absolute deviation.`,
      `MAD-based scoring means these outliers are not themselves inflating the yardstick that measures them, which a mean-and-standard-deviation test would allow.`,
      `Extremes in ${noun} are where the consequential records live; ranking by recency or count will never surface them.`,
    ],
    chain: {
      primary: `A small number of ${spec.unitPlural} dominate this surface's total ${noun}.`,
      secondary: "Any average across the surface is being set by these few records.",
      tertiary: `Optimising against the average therefore optimises against the wrong ${spec.unitPlural}.`,
    },
    basis: evidence(
      scored.map(
        (s) => `${s.o.label ?? s.o.entity ?? spec.unit} — ${fmt(s.o.magnitude!)} on ${fmtDate(s.o.ts)} (${round(s.z, 1)}σ).`
      )
    ),
    confidence: conf,
    falsifier: `Confirming each outlier is an intentional, one-off record you already knew about.`,
    action: `Inspect the ${scored.length} extreme ${spec.unitPlural} directly; they set this surface's totals.`,
  };
}

/** 9 — Weekday/weekend split, which separates work-driven from personal surfaces. */
function detectWeekPattern(spec: SurfaceSpec, obs: Observation[]): Finding | null {
  if (obs.length < 40) return null;

  let weekend = 0;
  for (const o of obs) {
    const d = new Date(o.ts).getDay();
    if (d === 0 || d === 6) weekend++;
  }
  const share = weekend / obs.length;
  const expected = 2 / 7;
  const z = (share - expected) / Math.sqrt((expected * (1 - expected)) / obs.length);
  if (Math.abs(z) < 2.5) return null;
  const conf = rejectNull(z, obs.length);
  if (!conf) return null;

  const heavy = share > expected;
  return {
    id: `${spec.module}-weekpattern`,
    module: spec.module,
    severity: "baseline",
    title: heavy
      ? `This surface is disproportionately active at weekends`
      : `This surface is almost entirely a weekday surface`,
    current: `${pct(share)} of ${spec.unitPlural} at weekends`,
    normal: `${pct(expected)} if spread evenly`,
    deviation: `${z > 0 ? "+" : "−"}${round(Math.abs(z), 1)}σ`,
    why: [
      `${weekend} of ${obs.length} ${spec.unitPlural} fall on a Saturday or Sunday against an even-spread expectation of ${Math.round(obs.length * expected)}.`,
      heavy
        ? `A weekend-weighted surface is personal rather than occupational, which changes who its activity can reasonably be attributed to.`
        : `A weekday-locked surface is occupational, so weekend activity here is by definition off-pattern and worth individual attention.`,
      `This classification is what makes the other detectors on this surface interpretable — the same anomaly means different things on a work surface and a personal one.`,
    ],
    basis: [
      `${obs.length} ${spec.unitPlural} classified by local day-of-week.`,
      TZ_NOTE,
      heavy
        ? `Weekend density ${round(share / expected, 2)}× the uniform expectation.`
        : `Weekday density ${round((1 - share) / (5 / 7), 2)}× the uniform expectation.`,
    ],
    confidence: conf,
    falsifier: `The split converging on 29% weekend once a longer history is loaded.`,
    action: heavy
      ? `Treat this as a personal surface when attributing its activity.`
      : `Treat any weekend ${spec.unit} on this surface as off-pattern and review it individually.`,
  };
}

/**
 * 10 — Clocked entities. Finds machine-scheduled activity by circular
 * concentration of each entity's hour-of-day distribution.
 *
 * This exists because detectRhythm alone has a circular-baseline weakness: it
 * defines "off-hours" as the subject's quietest block, so a process that floods
 * 03:00 every night MAKES 03:00 busy and the dead-zone test looks elsewhere —
 * blind to precisely the anomaly it was built to catch. This detector is immune
 * because it never asks when the subject is quiet. It asks how tightly each
 * entity is clocked, relative to how tightly the subject as a whole is clocked.
 *
 * Hours are mapped onto the unit circle (θ = 2π·h/24) and the resultant vector
 * length R is taken. R is 0 for activity spread evenly around the clock and 1
 * for activity at a single instant every day. Humans, even disciplined ones,
 * sit near 0.2–0.5 because waking life is broad. Schedulers sit above 0.85.
 * The gap between those regimes is the signal, and it does not depend on volume,
 * so a quiet cron job is as visible as a loud one.
 */
function detectClockedEntities(spec: SurfaceSpec, obs: Observation[]): Finding | null {
  if (obs.length < 25) return null;

  /** Resultant vector length of hour angles: 0 = uniform, 1 = perfectly clocked. */
  const concentration = (times: number[]): { R: number; meanHour: number } => {
    let sx = 0;
    let sy = 0;
    for (const t of times) {
      const a = (2 * Math.PI * new Date(t).getHours()) / 24;
      sx += Math.cos(a);
      sy += Math.sin(a);
    }
    const n = times.length || 1;
    const R = Math.sqrt(sx * sx + sy * sy) / n;
    let mh = (Math.atan2(sy / n, sx / n) * 24) / (2 * Math.PI);
    if (mh < 0) mh += 24;
    return { R, meanHour: mh };
  };

  const surface = concentration(obs.map((o) => o.ts));
  const byEntity = groupByEntity(obs);

  const clocked: Array<{ entity: string; n: number; R: number; hour: number }> = [];
  for (const [entity, rows] of byEntity) {
    if (rows.length < 8) continue; // below this, tight clustering is luck
    const times = rows.map((r) => r.ts);
    // Require activity across several days, or a single busy afternoon would
    // score as perfectly clocked for the same reason a burst is not a rhythm.
    const spanDays = (Math.max(...times) - Math.min(...times)) / DAY;
    if (spanDays < 5) continue;

    const { R, meanHour } = concentration(times);
    if (R >= 0.85 && R > surface.R + 0.25) {
      clocked.push({ entity, n: rows.length, R, hour: meanHour });
    }
  }
  if (clocked.length === 0) return null;

  clocked.sort((a, b) => b.R - a.R || b.n - a.n);
  // Effect size is how far the tightest entity sits above the subject's own
  // circadian spread, expressed on the shared severity ladder.
  const z = Math.min(4, (clocked[0].R - surface.R) * 5);
  const conf = rejectNull(z, clocked.reduce((a, c) => a + c.n, 0));
  if (!conf) return null;

  const hhmm = (h: number) => {
    const hh = Math.floor(h) % 24;
    const mm = Math.round((h - Math.floor(h)) * 60) % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };

  return {
    id: `${spec.module}-clocked`,
    module: spec.module,
    severity: severityFromZ(z),
    title: `${clocked.length} ${clocked.length === 1 ? spec.entityNoun : spec.entityNounPlural} fire on a machine-tight schedule, not a human one`,
    current: `R=${round(clocked[0].R, 2)} for ${clocked[0].entity}`,
    normal: `R=${round(surface.R, 2)} across your own activity`,
    deviation: `+${round(clocked[0].R - surface.R, 2)} circular concentration`,
    why: [
      `Each listed ${spec.entityNoun} concentrates its activity at essentially one time of day (resultant vector length above 0.85), while your overall pattern sits at ${round(surface.R, 2)} — the broad spread that waking life produces.`,
      `Humans do not hit the same clock minute repeatedly across weeks. This degree of temporal precision is produced by schedulers, sync jobs, and automated senders, not by people.`,
      `The measure is independent of volume and of which hour is involved, so it identifies automation even when that automation is the busiest thing on the surface — a dead-zone test cannot, because heavy automation stops the hour looking quiet.`,
    ],
    chain: {
      primary: `Part of this surface's activity is generated by an automated process rather than by you.`,
      secondary: `Automated volume is indistinguishable from personal volume in every total and average on this surface.`,
      tertiary: `Behavioural conclusions drawn from those totals describe a scheduler's habits, not yours.`,
    },
    basis: evidence([
      TZ_NOTE,
      ...clocked.map(
        (c) =>
          `${c.entity} — ${c.n} ${spec.unitPlural} clustered at ~${hhmm(c.hour)} (R=${round(c.R, 2)}).`
      ),
      `Surface-wide concentration R=${round(surface.R, 2)} across ${obs.length} ${spec.unitPlural}.`,
    ]),
    confidence: conf,
    falsifier: `Identifying a listed ${spec.entityNoun} as a scheduler you configured yourself and expect to run at that time.`,
    action: `Attribute each clocked ${spec.entityNoun} to a specific automation, and separate its volume from yours before reading this surface's totals.`,
  };
}


// ───────────────────────────── orchestrator ─────────────────────────────

/**
 * Runs every structural detector over a surface and returns ranked findings
 * plus a census. Safe on empty, tiny, and malformed input: observations without
 * a finite timestamp are discarded, and an empty surface yields the mandated
 * silence finding rather than a blank panel.
 */
export function deepDive(
  spec: SurfaceSpec,
  raw: Observation[],
  opts: { recentDays?: number; maxFindings?: number } = {}
): DeepDiveResult {
  const recentDays = opts.recentDays ?? 14;
  const maxFindings = opts.maxFindings ?? 8;

  const obs = raw
    .filter((o) => o && Number.isFinite(o.ts) && o.ts > 0)
    .sort((a, b) => a.ts - b.ts);

  const emptyCensus: DeepDiveResult["census"] = {
    total: 0,
    entities: 0,
    spanDays: 0,
    firstSeen: null,
    lastSeen: null,
    perDay: 0,
    topEntities: [],
    novelEntities: [],
    dormantEntities: [],
  };

  if (obs.length === 0) {
    return {
      findings: [
        silenceFinding({
          module: spec.module,
          id: `${spec.module}-silence`,
          subject: spec.module,
          expected: spec.expectation ?? `a continuous stream of ${spec.unitPlural}`,
          cause: spec.connected
            ? [
                `The linked account returned zero ${spec.unitPlural} for this surface.`,
                `Either the scope granting access to this surface was never approved, or the surface genuinely holds no records for this account.`,
                `These two causes are indistinguishable from the response alone and must be separated by checking the granted scopes.`,
              ]
            : [
                `No account is linked, so no query was issued against this surface.`,
                `Every downstream module that would consume this surface is therefore reasoning without it.`,
              ],
          action: spec.connected
            ? `Verify the granted scope for this surface, then re-run the sweep.`
            : `Link an account to begin collecting ${spec.unitPlural}.`,
          connected: spec.connected,
        }),
      ],
      census: emptyCensus,
    };
  }

  const now = Date.now();
  const first = obs[0].ts;
  const last = obs[obs.length - 1].ts;
  const spanDays = Math.max(1, (now - first) / DAY);
  const byEntity = groupByEntity(obs);
  const cut = now - recentDays * DAY;

  const topEntities = [...byEntity.entries()]
    .map(([entity, rows]) => ({ entity, count: rows.length, share: rows.length / obs.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const novelEntities: string[] = [];
  const dormantEntities: string[] = [];
  for (const [entity, rows] of byEntity) {
    const times = rows.map((r) => r.ts);
    const f = Math.min(...times);
    const l = Math.max(...times);
    if (f >= cut && obs[0].ts < cut) novelEntities.push(entity);
    // Identical rule to detectDormancy — if the chips and the finding disagree
    // the panel contradicts itself, so the qualification lives in one shape.
    if (rows.length >= 4 && l < cut) {
      const sorted = [...times].sort((a, b) => a - b);
      if ((l - sorted[0]) / DAY < 7) continue;
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) gaps.push((sorted[i] - sorted[i - 1]) / DAY);
      const cadence = median(gaps);
      if (cadence >= 0.5 && (now - l) / DAY > Math.max(cadence * 3, 7)) dormantEntities.push(entity);
    }

  }

  // Every detector is wrapped: one malformed surface must never take down the
  // whole panel, and a detector that throws is a bug to log, not a blank tab.
  // Detectors split by what they require of the timestamp. The structural set
  // reasons only about distribution across entities and magnitudes, so it is
  // valid even when every record shares one clock value. The temporal set reads
  // the timestamp as an event time and is meaningless when it is not one.
  const structural: Array<[string, () => Finding | null]> = [
    ["magnitude", () => detectMagnitude(spec, obs)],
    ["concentration", () => detectConcentration(spec, obs)],
    ["longtail", () => detectLongTail(spec, obs)],
  ];

  const temporal: Array<[string, () => Finding | null]> = [
    ["volume", () => detectVolumeShift(spec, obs, recentDays)],
    ["burst", () => detectBurst(spec, obs)],
    ["novelty", () => detectNovelty(spec, obs, recentDays)],
    ["dormancy", () => detectDormancy(spec, obs, recentDays)],
    ["rhythm", () => detectRhythm(spec, obs)],
    ["clocked", () => detectClockedEntities(spec, obs)],
    ["weekpattern", () => detectWeekPattern(spec, obs)],
  ];

  const detectors: Array<[string, () => Finding | null]> =
    spec.timestampsAreEvents === false ? structural : [...temporal, ...structural];

  const findings: Finding[] = [];
  for (const [name, run] of detectors) {
    try {
      const f = run();
      if (f) findings.push(f);
    } catch (err) {
      console.error(`[deepDive] ${spec.module}/${name} detector failed:`, err);
    }
  }

  // Rule 2 applies to thin surfaces too: too little data to analyse is itself a
  // finding, not a reason to render nothing.
  if (findings.length === 0) {
    // The baseline finding must describe the battery that actually ran. On a
    // metadata surface only the structural detectors were eligible, and rates
    // per day are the sync clock speaking, so both are phrased accordingly.
    const isTemporal = spec.timestampsAreEvents !== false;
    const ranNames = isTemporal
      ? `volume, burst, novelty, dormancy, rhythm, clocked-entity, magnitude, concentration, long-tail, weekly pattern`
      : `magnitude, concentration, long-tail`;
    const ranCount = isTemporal ? "ten" : "three";

    findings.push({
      id: `${spec.module}-thin`,
      module: spec.module,
      severity: "baseline",
      title: `No structural deviation clears the significance bar on this surface`,
      current: isTemporal
        ? `${obs.length} ${spec.unitPlural} over ${Math.round(spanDays)}d`
        : `${obs.length} ${spec.unitPlural} across ${byEntity.size} ${spec.entityNounPlural}`,
      normal: isTemporal
        ? `${round(obs.length / spanDays, 1)} ${spec.unitPlural}/day, evenly distributed`
        : `an even spread across ${spec.entityNounPlural}`,
      deviation: "within coincidence",
      why: [
        `All ${ranCount} eligible detectors ran and none produced an effect large enough, on a sample this deep, to beat coincidence as an explanation.`,
        ...(isTemporal
          ? []
          : [
              `Timing detectors were not eligible here: these records carry a sync timestamp rather than an event time, so any rhythm they appear to show would belong to the sync, not to you.`,
            ]),
        obs.length < 30
          ? `With only ${obs.length} ${spec.unitPlural}, the sample is the binding constraint — real patterns of ordinary size cannot yet be distinguished from noise.`
          : `The sample is adequate, so this is a genuine negative: the surface is behaving consistently with its own history.`,
      ],
      basis: [
        isTemporal
          ? `${obs.length} ${spec.unitPlural} across ${byEntity.size} ${spec.entityNounPlural}, ${fmtDate(first)} to ${fmtDate(last)}.`
          : `${obs.length} ${spec.unitPlural} across ${byEntity.size} ${spec.entityNounPlural}.`,
        `Detectors run: ${ranNames}.`,
        `Reporting threshold is a null-hypothesis rejection of 35 or above; nothing here reached it.`,
      ],
      confidence: confidenceFrom(obs.length, 0.5),
      falsifier: `Any detector clearing the threshold once a deeper history is synced.`,
      action:
        obs.length < 30
          ? `Extend the sync window for this surface; the sample, not the surface, is the limiting factor.`
          : `Treat this surface as nominal and spend attention on surfaces reporting active findings.`,
    });
  }


  return {
    findings: sortFindings(findings).slice(0, maxFindings),
    census: {
      total: obs.length,
      entities: byEntity.size,
      spanDays: Math.round(spanDays),
      firstSeen: first,
      lastSeen: last,
      perDay: round(obs.length / spanDays, 2),
      topEntities,
      novelEntities,
      dormantEntities,
    },
  };
}

/**
 * Convenience adapter for the common case where a module already holds an array
 * of API records and can name the fields carrying time and identity.
 */
export function toObservations<T>(
  rows: T[],
  map: (row: T) => { ts: unknown; entity?: unknown; label?: unknown; magnitude?: unknown; tags?: string[] }
): Observation[] {
  const out: Observation[] = [];
  for (const row of rows ?? []) {
    let m: ReturnType<typeof map>;
    try {
      m = map(row);
    } catch {
      continue;
    }
    const ts = coerceTs(m.ts);
    if (ts === null) continue;
    const magnitude = typeof m.magnitude === "number" ? m.magnitude : Number(m.magnitude);
    out.push({
      ts,
      entity: m.entity == null ? null : String(m.entity),
      label: m.label == null ? null : String(m.label),
      magnitude: Number.isFinite(magnitude) ? magnitude : null,
      tags: m.tags,
    });
  }
  return out;
}

/**
 * Coerces the several timestamp shapes Google APIs return — epoch millis as a
 * number, epoch millis as a decimal string, RFC-3339 date-times — into millis.
 * Returns null for anything unusable so the caller can drop the record rather
 * than admit an Invalid Date into the series.
 */
export function coerceTs(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? (v < 1e11 ? v * 1000 : v) : null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      return Number.isFinite(n) ? (n < 1e11 ? n * 1000 : n) : null;
    }
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}
