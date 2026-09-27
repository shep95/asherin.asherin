// ═══════════════════════════════════════════════════════════════════════════
// CONTACT OSINT ANNEX — external collection layer for the contact report
//
// The contact report's first generation was a closed system: it read Gmail
// metadata and the address book and nothing else. That is *communications
// analysis*, not intelligence. It could describe how a subject writes to you
// and when — but not who they are, what is publicly on record about them, or
// who else they are attached to. When someone new emails you, that is exactly
// the question that matters.
//
// This module attaches the open-source leg. It calls the Vault's dossier
// engine (mesh-vault → jurisdictional substrate → Zophiel web collection),
// which resolves identity fields against public records, press, registries and
// the open web, and returns every value with the URLs that assert it.
//
// TRADECRAFT RULES ENFORCED HERE (the reason this is a module and not a fetch):
//
//  · ICD 206 — SOURCING. Every source carries an Admiralty reliability grade
//    (A–F, derived from the class of the publisher) and every fact carries an
//    information-credibility grade (1–6, derived from how many INDEPENDENT
//    domains assert it). A single-source fact can never grade above 3.
//  · ICD 203 — ANALYTIC STANDARDS. Judgments use the standard likelihood
//    lexicon, state their confidence separately from their likelihood, and
//    name the evidence they rest on. Confidence describes the evidence; the
//    likelihood word describes the event. They are never conflated.
//  · ABSENCE IS REPORTED. A gap is a collection requirement, not an empty
//    field. Nothing is inferred to fill a hole.
//  · NO MODEL SPECULATION. Every value here is a pure transform of what the
//    collection returned. This module never invents, extrapolates or rounds a
//    fact into existence.
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────── wire shapes ───────────────────────────

interface WireFact {
  value: string;
  confidence: string;
  independentDomains: number;
  authoritative: boolean;
  sources: Array<{ domain: string; url: string }>;
}

interface WireNode {
  label: string;
  kind: string;
  confidence: string;
  independentDomains: number;
  via?: string;
  sources: Array<{ domain: string; url: string }>;
}

interface WireDoc {
  subject?: { name?: string; email?: string | null; domainHint?: string | null };
  builtAt?: string;
  identity?: Record<string, WireFact[]>;
  candidates?: Record<string, WireFact[]>;
  hop1?: WireNode[];
  hop2?: WireNode[];
  hop3?: Array<{ node: string; viaA: string; viaB: string; strength: number }>;
  sources?: Array<{ domain: string; url: string; title: string; bucket: string }>;
  metrics?: Record<string, number>;
  gaps?: string[];
  jurisdiction?: string;
  channel?: string | null;
  reverse?: { identifier: string; factsAdded: number; hits: number; timedOut?: boolean; error?: string } | null;
  imagery?: Array<{ url: string; attributedTo: string; clusterScore: number }>;
  kin?: string[];
}

// ─────────────────────────── annex shapes ───────────────────────────

/** Admiralty source reliability. F is reserved for demonstrably hostile hosts. */
export type Reliability = "A" | "B" | "C" | "D" | "E" | "F";
/** Admiralty information credibility. 6 = cannot be judged. */
export type Credibility = 1 | 2 | 3 | 4 | 5 | 6;

export interface OsintSource {
  domain: string;
  url: string;
  title: string;
  bucket: string;
  reliability: Reliability;
  reliabilityNote: string;
}

export interface OsintFact {
  field: string;
  value: string;
  /**
   * `confirmed` — the subject was positively matched inside the source
   * document. `candidate` — the document names the subject but did not clear
   * strong identity matching, so the value is reported and never relied on.
   */
  band: "confirmed" | "candidate";
  credibility: Credibility;
  credibilityNote: string;
  independentDomains: number;
  authoritative: boolean;
  sources: Array<{ domain: string; url: string }>;
}


export interface OsintAssociation {
  label: string;
  kind: string;
  hop: 1 | 2 | 3;
  via: string | null;
  independentDomains: number;
  sources: Array<{ domain: string; url: string }>;
}

export interface KeyJudgment {
  /** Standard ICD 203 likelihood expression. */
  likelihood:
    | "almost certainly"
    | "very likely"
    | "likely"
    | "roughly even chance"
    | "unlikely"
    | "very unlikely"
    | "almost certainly not";
  /** Analytic confidence in the evidence base — separate from likelihood. */
  confidence: "High" | "Moderate" | "Low";
  text: string;
  basis: string;
}

export type OsintStatus = "ready" | "building" | "queued" | "failed" | "absent" | "error" | "unauthenticated";

export interface OsintAnnex {
  status: OsintStatus;
  /** Why the annex is not `ready`. Null exactly when it is. */
  blocker: string | null;
  subjectName: string;
  subjectEmail: string | null;
  builtAt: number | null;
  jurisdiction: string;
  /** 0-100 evidence-density score computed server-side. */
  collectionConfidence: number;
  facts: OsintFact[];
  associations: OsintAssociation[];
  crossLinks: Array<{ node: string; viaA: string; viaB: string; strength: number }>;
  sources: OsintSource[];
  metrics: {
    documentsParsed: number;
    totalHits: number;
    queriesRun: number;
    independentDomains: number;
    authoritativeSources: number;
    rejectedIdentityHits: number;
    elapsedMs: number;
  };
  keyJudgments: KeyJudgment[];
  gaps: string[];
  reverse: WireDoc["reverse"];
  /**
   * Where the contact's hard identifiers are confirmed to appear. The vault
   * dossier answers "who is this"; the sweep answers "where is this address or
   * number actually carried, and since when" — a different question, and the
   * one that exposes paste-site and breach-index circulation.
   */
  identifierSweeps: IdentifierSweepSummary[];
  /**
   * Face imagery attributed to a resolved identity cluster. URLs only; the
   * viewer fetches them through the SSRF-guarded intel-avatar proxy so the
   * report never hot-links a third-party host from the operator's browser.
   */
  imagery: Array<{ url: string; attributedTo: string; clusterScore: number }>;
  /** Claimed relatives from the cluster's people-directory documents. */
  kin: string[];
  /**
   * Fourth collection leg. Text sightings confirm that a NAME appears on a
   * surface; they cannot confirm that the same PERSON appears on two of them.
   * The visual leg harvests independent portraits and asks whether they carry
   * the same face — the only corroboration axis the other three legs cannot
   * reach. Null when the leg was not run; never silently omitted.
   */
  photo: PhotoCorroboration | null;
  /**
   * The re-sweep policy this product was served under. A dossier read today
   * may have been collected a fortnight ago; the cache decision was real and
   * invisible, so it is now stated with the report rather than inferred.
   */
  staleness: SweepPolicy | null;
}

/** Visual corroboration verdict folded down for report rendering. */
export interface PhotoCorroboration {
  verdict: "same_person" | "likely_same" | "inconclusive" | "conflict" | "unavailable";
  confidence: number;
  independentSources: number;
  reasoning: string;
  observations: string[];
  /** What observation would overturn the verdict — Rule 18, enforced. */
  falsifier: string;
  frames: Array<{ url: string | null; sourceHost: string; sourceUrl: string; sourceTitle: string }>;
  /** Null when the leg ran clean; otherwise why it is thin. */
  blocker: string | null;
}

/** Cache/refresh posture surfaced from the vault. */
export interface SweepPolicy {
  source: "cache" | "fresh" | "unknown";
  ageDays: number | null;
  maxAgeDays: number;
  nextAutoSweepDays: number;
  fresh: boolean;
  forced: boolean;
  note: string;

}

/** A per-identifier exposure register, folded down for report rendering. */
export interface IdentifierSweepSummary {
  identifier: string;
  kind: string;
  surfaces: number;
  confirmed: number;
  firstSeen: string | null;
  lastSeen: string | null;
  /** Paste sites and breach indexes — the surfaces that mean circulation. */
  exposed: Array<{ host: string; surfaceClass: string; lastSeen: string | null }>;
  top: Array<{ host: string; surfaceClass: string; sightings: number; lastSeen: string | null }>;
  /** Null when the leg ran clean; otherwise why it is thin. */
  blocker: string | null;
}

// ───────────────────── Admiralty grading (ICD 206) ─────────────────────

const HOSTILE = /^(infowars|naturalnews|beforeitsnews|globalresearch|zerohedge)\./i;

const TIER_A =
  /(^|\.)(sec\.gov|courtlistener\.com|pacer\.gov|uspto\.gov|patents\.google\.com|opencorporates\.com|companieshouse\.gov\.uk)$/i;

const TIER_B_PRESS =
  /(^|\.)(reuters|apnews|bbc|nytimes|washingtonpost|wsj|ft|bloomberg|theguardian|economist|npr|propublica|politico|cnbc)\.(com|org|co\.uk)$/i;

const TIER_D_SOCIAL =
  /(^|\.)(facebook|instagram|tiktok|x|twitter|reddit|quora|pinterest|threads|vk)\.com$/i;

/**
 * Grade the PUBLISHER, never the claim. Reliability is a property of who is
 * speaking; credibility (below) is a property of how many independent voices
 * say the same thing. Collapsing the two is the classic sourcing error.
 */
export function gradeReliability(domain: string): { grade: Reliability; note: string } {
  const d = (domain || "").replace(/^www\./i, "").toLowerCase();
  if (!d) return { grade: "F", note: "no publisher recorded — treat as unusable." };
  if (HOSTILE.test(`${d}.`)) return { grade: "F", note: "publisher on the manipulation watchlist." };
  if (/\.onion$/i.test(d)) return { grade: "E", note: "hidden-service host; provenance unverifiable." };
  if (TIER_A.test(d) || /(^|\.)gov$/i.test(d) || /\.gov(\.[a-z]{2})?$/i.test(d) || /\.mil$/i.test(d)) {
    return { grade: "A", note: "official registry or court of record." };
  }
  if (/\.(edu|ac\.[a-z]{2})$/i.test(d)) return { grade: "B", note: "academic institution of record." };
  if (TIER_B_PRESS.test(d)) return { grade: "B", note: "established newsroom with a corrections process." };
  if (TIER_D_SOCIAL.test(d)) return { grade: "D", note: "self-published platform; subject-controlled content." };
  if (/(^|\.)(linkedin|crunchbase|bloomberg|zoominfo|apollo)\.(com|io)$/i.test(d)) {
    return { grade: "C", note: "commercial aggregator; partially subject-supplied." };
  }
  return { grade: "C", note: "general web publisher; no editorial record established." };
}

/**
 * Credibility is corroboration, full stop. One domain can never exceed 3 no
 * matter how authoritative it is — an uncorroborated official record is still
 * an uncorroborated record.
 */
export function gradeCredibility(independentDomains: number, authoritative: boolean): { grade: Credibility; note: string } {
  if (independentDomains >= 4) return { grade: 1, note: `confirmed by ${independentDomains} independent domains.` };
  if (independentDomains === 3) return { grade: 2, note: "corroborated by three independent domains." };
  if (independentDomains === 2) {
    return { grade: authoritative ? 2 : 3, note: "corroborated by two independent domains." };
  }
  if (independentDomains === 1) {
    return {
      grade: authoritative ? 3 : 4,
      note: authoritative
        ? "single authoritative source; uncorroborated."
        : "single non-authoritative source; uncorroborated.",
    };
  }
  return { grade: 6, note: "no independent domain count recorded — credibility cannot be judged." };
}

// ───────────────────── judgment synthesis (ICD 203) ─────────────────────

const LIKELIHOOD_BY_CREDIBILITY: Record<Credibility, KeyJudgment["likelihood"]> = {
  1: "almost certainly",
  2: "very likely",
  3: "likely",
  4: "roughly even chance",
  5: "unlikely",
  6: "roughly even chance",
};

function confidenceFor(best: Credibility, corroborating: number): KeyJudgment["confidence"] {
  if (best <= 2 && corroborating >= 2) return "High";
  if (best <= 3) return "Moderate";
  return "Low";
}

/**
 * Judgments are derived, not written. Each one names the field family it came
 * from, the grade of its best evidence, and how many independent domains stand
 * behind it — so a reader can reject the judgment without rejecting the report.
 */
function synthesizeJudgments(facts: OsintFact[], assoc: OsintAssociation[], metrics: OsintAnnex["metrics"]): KeyJudgment[] {
  const out: KeyJudgment[] = [];
  const byField = new Map<string, OsintFact[]>();
  // Judgments rest on confirmed matches only. Candidate values are reported in
  // the body of the annex but are never allowed to carry a judgment.
  for (const f of facts.filter((x) => x.band === "confirmed")) {
    const arr = byField.get(f.field) ?? [];
    arr.push(f);
    byField.set(f.field, arr);
  }
  const candidateCount = facts.filter((x) => x.band === "candidate").length;
  if (candidateCount) {
    out.push({
      likelihood: "roughly even chance",
      confidence: "Low",
      text: `${candidateCount} identity value${candidateCount === 1 ? "" : "s"} extracted from documents naming the subject did not clear strong identity matching and are carried as candidates only.`,
      basis: "Possible-band extraction; name present in source but insufficient corroborating identifiers to bind the value to this subject.",
    });
  }


  for (const [field, group] of byField) {
    const best = group.reduce((a, b) => (b.credibility < a.credibility ? b : a));
    const corroborated = group.filter((g) => g.independentDomains >= 2).length;
    out.push({
      likelihood: LIKELIHOOD_BY_CREDIBILITY[best.credibility],
      confidence: confidenceFor(best.credibility, corroborated),
      text: `${field} of record for the subject ${group.length > 1 ? `includes ${group.length} distinct values, best supported being` : "resolves to"} "${best.value}".`,
      basis: `${best.independentDomains} independent domain${best.independentDomains === 1 ? "" : "s"}; Admiralty ${best.credibility}; ${best.authoritative ? "authoritative registry in the set" : "no authoritative registry in the set"}.`,
    });
  }

  const hop1 = assoc.filter((a) => a.hop === 1).length;
  if (hop1) {
    const corroborated = assoc.filter((a) => a.hop === 1 && a.independentDomains >= 2).length;
    out.push({
      likelihood: corroborated >= 2 ? "very likely" : "likely",
      confidence: corroborated >= 2 ? "Moderate" : "Low",
      text: `The subject is publicly associated with ${hop1} first-ring entit${hop1 === 1 ? "y" : "ies"}, of which ${corroborated} ${corroborated === 1 ? "is" : "are"} multi-source.`,
      basis: "Association ring built from co-occurrence in collected documents; single-source links are not treated as confirmed relationships.",
    });
  }

  if (metrics.totalHits > 0 && facts.length === 0) {
    out.push({
      likelihood: "roughly even chance",
      confidence: "Low",
      text: "Collection returned documents but none survived identity matching — the subject is either low-footprint or shares a common name with a higher-footprint individual.",
      basis: `${metrics.totalHits} hits collected, ${metrics.rejectedIdentityHits} rejected at the identity gate.`,
    });
  }

  if (metrics.totalHits === 0) {
    out.push({
      likelihood: "likely",
      confidence: "Low",
      text: "The subject has no resolvable open-source footprint under the identifiers supplied.",
      basis: "Zero documents returned across the query plan. Absence of collection is not evidence of absence of record.",
    });
  }

  return out.slice(0, 12);
}

// ───────────────────────────── transform ─────────────────────────────

function toAnnex(
  doc: WireDoc,
  meta: { status: OsintStatus; blocker: string | null; confidence: number; name: string; email: string | null },
): OsintAnnex {
  const facts: OsintFact[] = [];
  const ingest = (src: Record<string, WireFact[]> | undefined, band: OsintFact["band"]) => {
    for (const [field, list] of Object.entries(src ?? {})) {
      for (const f of list ?? []) {
        const { grade, note } = gradeCredibility(f.independentDomains ?? 0, Boolean(f.authoritative));
        // A candidate can never grade better than "possibly true": corroboration
        // across domains raises how often a claim is repeated, not whether the
        // claim is about this person.
        const credibility: Credibility = band === "candidate" ? (Math.max(grade, 3) as Credibility) : grade;
        facts.push({
          field,
          value: f.value,
          band,
          credibility,
          credibilityNote:
            band === "candidate"
              ? `${note} Identity match is POSSIBLE, not strong — corroborate before acting.`
              : note,
          independentDomains: f.independentDomains ?? 0,
          authoritative: Boolean(f.authoritative),
          sources: (f.sources ?? []).slice(0, 4),
        });
      }
    }
  };
  ingest(doc.identity, "confirmed");
  ingest(doc.candidates, "candidate");
  // Confirmed always outranks candidate regardless of grade — band is the
  // primary sort key so the reader never meets an unverified value first.
  facts.sort((a, b) =>
    (a.band === b.band ? 0 : a.band === "confirmed" ? -1 : 1) ||
    a.credibility - b.credibility ||
    b.independentDomains - a.independentDomains);


  const associations: OsintAssociation[] = [
    ...(doc.hop1 ?? []).map((n) => ({ ...n, hop: 1 as const })),
    ...(doc.hop2 ?? []).map((n) => ({ ...n, hop: 2 as const })),
  ].map((n) => ({
    label: n.label,
    kind: n.kind,
    hop: n.hop,
    via: n.via ?? null,
    independentDomains: n.independentDomains ?? 0,
    sources: (n.sources ?? []).slice(0, 3),
  }));

  const sources: OsintSource[] = (doc.sources ?? []).slice(0, 60).map((s) => {
    const { grade, note } = gradeReliability(s.domain);
    return { ...s, reliability: grade, reliabilityNote: note };
  });

  const m = doc.metrics ?? {};
  const metrics: OsintAnnex["metrics"] = {
    documentsParsed: Number(m.documentsParsed ?? 0),
    totalHits: Number(m.totalHits ?? 0),
    queriesRun: Number(m.queriesRun ?? 0),
    independentDomains: Number(m.independentDomains ?? 0),
    authoritativeSources: Number(m.authoritativeSources ?? 0),
    rejectedIdentityHits: Number(m.rejectedIdentityHits ?? 0),
    elapsedMs: Number(m.elapsedMs ?? 0),
  };

  const builtAtMs = doc.builtAt ? Date.parse(doc.builtAt) : NaN;

  return {
    status: meta.status,
    blocker: meta.blocker,
    subjectName: doc.subject?.name || meta.name,
    subjectEmail: doc.subject?.email ?? meta.email,
    builtAt: Number.isFinite(builtAtMs) ? builtAtMs : null,
    jurisdiction: doc.jurisdiction || "not determined",
    collectionConfidence: Math.max(0, Math.min(100, Math.round(meta.confidence))),
    facts,
    associations,
    crossLinks: doc.hop3 ?? [],
    sources,
    metrics,
    keyJudgments: synthesizeJudgments(facts, associations, metrics),
    gaps: doc.gaps ?? [],
    reverse: doc.reverse ?? null,
    // Filled by the parallel sweep leg in collectContactOsint; the vault
    // dossier itself has no view of identifier circulation.
    identifierSweeps: [],
    imagery: (doc.imagery ?? []).filter((i) => /^https:\/\//i.test(i?.url ?? "")).slice(0, 8),
    kin: (doc.kin ?? []).slice(0, 24),
    // Both are filled by legs that run outside the vault dossier.
    photo: null,
    staleness: null,

  };
}

// ─────────────────── identifier exposure leg (Asherin Engine) ───────────────

interface RawSurface {
  host: string;
  surfaceClass: string;
  sightings: unknown[];
  firstSeen: string | null;
  lastSeen: string | null;
}

const EXPOSED_CLASSES = new Set(["paste", "breach-index"]);

/**
 * Sweep one hard identifier through the Asherin Engine and fold the register
 * down to what a background report needs.
 *
 * Never throws and never propagates its own abort: a background check that
 * dies because one exposure leg timed out is worse than one that reports the
 * leg as thin. Each identifier carries its own deadline so a slow sweep cannot
 * hold the whole contact report hostage.
 */
async function sweepIdentifierLeg(
  identifier: string,
  signal?: AbortSignal,
): Promise<IdentifierSweepSummary | null> {
  const base: IdentifierSweepSummary = {
    identifier, kind: "unknown", surfaces: 0, confirmed: 0,
    firstSeen: null, lastSeen: null, exposed: [], top: [], blocker: null,
  };
  try {
    const { data, error } = await supabase.functions.invoke("ghost-engine", {
      body: { action: "identifier", query: identifier, budgetMs: 70_000, limit: 24, maxLeads: 140 },
    });
    if (signal?.aborted) return null;
    if (error) {
      let detail = error.message ?? "unknown error";
      const ctx = (error as { context?: { text?: () => Promise<string> } }).context;
      if (ctx?.text) {
        try { detail = (await ctx.text()).slice(0, 200) || detail; } catch { /* consumed */ }
      }
      return { ...base, blocker: `Exposure sweep unavailable: ${detail}` };
    }

    const report = (data as { report?: {
      identity?: { kind?: string };
      surfaces?: RawSurface[];
      confirmed?: number;
      firstSeen?: string | null;
      lastSeen?: string | null;
      notes?: string[];
    } } | null)?.report;
    if (!report) return { ...base, blocker: "Exposure sweep returned no register." };

    const surfaces = Array.isArray(report.surfaces) ? report.surfaces : [];
    return {
      identifier,
      kind: report.identity?.kind ?? "unknown",
      surfaces: surfaces.length,
      confirmed: Number(report.confirmed ?? 0),
      firstSeen: report.firstSeen ?? null,
      lastSeen: report.lastSeen ?? null,
      exposed: surfaces
        .filter((s) => EXPOSED_CLASSES.has(s.surfaceClass))
        .slice(0, 8)
        .map((s) => ({ host: s.host, surfaceClass: s.surfaceClass, lastSeen: s.lastSeen })),
      top: surfaces
        .slice()
        .sort((a, b) => (b.sightings?.length ?? 0) - (a.sightings?.length ?? 0))
        .slice(0, 6)
        .map((s) => ({
          host: s.host,
          surfaceClass: s.surfaceClass,
          sightings: s.sightings?.length ?? 0,
          lastSeen: s.lastSeen,
        })),
      blocker: surfaces.length === 0
        ? "No surface confirmed to carry this identifier on the reachable public web."
        : null,
    };
  } catch (e) {
    return { ...base, blocker: `Exposure sweep aborted: ${(e as Error).message.slice(0, 160)}` };
  }
}

/** An annex that reports its own failure rather than being silently omitted. */
export function emptyAnnex(status: OsintStatus, blocker: string, name: string, email: string | null): OsintAnnex {
  return {
    status,
    blocker,
    subjectName: name,
    subjectEmail: email,
    builtAt: null,
    jurisdiction: "not determined",
    collectionConfidence: 0,
    facts: [],
    associations: [],
    crossLinks: [],
    sources: [],
    metrics: {
      documentsParsed: 0, totalHits: 0, queriesRun: 0, independentDomains: 0,
      authoritativeSources: 0, rejectedIdentityHits: 0, elapsedMs: 0,
    },
    keyJudgments: [],
    gaps: [],
    reverse: null,
    identifierSweeps: [],
    imagery: [],
    kin: [],
    photo: null,
    staleness: null,

  };
}

// ───────────────────────────── collection ─────────────────────────────

export interface OsintRequest {
  name: string;
  email: string | null;
  /** Extra hard identifiers (phones, alternate addresses) to seed reverse lookup. */
  identifiers?: string[];
  locationHint?: string | null;
  /**
   * Employer names / corporate domains bound to the subject. Without these a
   * freemail contact loses the entire organisational axis — see orgAnchor.ts.
   */
  orgAnchors?: string[];
  /** Force a fresh sweep even when a cached dossier is inside its half-life. */
  force?: boolean;
  signal?: AbortSignal;
}

/**
 * Run (or reuse) the open-source sweep for one contact.
 *
 * Never throws. A collection failure is intelligence about the collection, so
 * it is returned as an annex with a stated blocker rather than as an exception
 * that would delete the annex from the report entirely.
 */
/**
 * Fourth collection leg — visual corroboration.
 *
 * The other three legs all read text. Text can only establish that a NAME is
 * present on a surface, which is exactly the failure mode that lets two people
 * with one name collapse into a single false dossier. Harvesting independent
 * portraits and asking whether they carry the same face is the only axis that
 * can break that tie, so it runs as a peer of the other legs rather than as an
 * optional enrichment.
 *
 * Never throws. A visual leg that dies must degrade the report to "no visual
 * corroboration" — a stated gap — not take the background check down with it.
 */
async function photoCorroborationLeg(
  subject: string,
  hint: string | null,
  signal?: AbortSignal,
): Promise<PhotoCorroboration | null> {
  // A single token ("Bruno", "support") is not a face-matchable identity; the
  // harvest would return strangers and the verdict would be noise dressed as
  // evidence. Two name parts is the floor.
  if (subject.trim().split(/\s+/).filter((p) => p.length > 1).length < 2) return null;

  const unavailable = (blocker: string): PhotoCorroboration => ({
    verdict: "unavailable",
    confidence: 0,
    independentSources: 0,
    reasoning: "n/a — no comparable portrait was retrieved, so no visual claim is made.",
    observations: [],
    falsifier: "Supply a known portrait of the subject and re-run the cross-match.",
    frames: [],
    blocker,
  });

  try {
    const { data, error } = await supabase.functions.invoke("intel-photo-match", {
      body: { subject: subject.slice(0, 120), hint: (hint ?? "").slice(0, 80) },
    });
    if (signal?.aborted) return null;
    if (error) {
      let detail = error.message ?? "unknown error";
      const ctx = (error as { context?: { text?: () => Promise<string> } }).context;
      if (ctx?.text) {
        try { detail = (await ctx.text()).slice(0, 200) || detail; } catch { /* consumed */ }
      }
      return unavailable(`Visual cross-match unavailable: ${detail}`);
    }

    const payload = data as {
      photos?: Array<{ url?: string | null; sourceHost?: string; sourceUrl?: string; sourceTitle?: string }>;
      match?: {
        verdict?: string; confidence?: number; independentSources?: number;
        reasoning?: string; observations?: string[]; falsifier?: string;
      } | null;
    } | null;

    const m = payload?.match;
    if (!m) return unavailable("Visual cross-match returned no verdict.");

    const frames = (payload?.photos ?? [])
      .filter((p) => typeof p?.sourceUrl === "string")
      .slice(0, 8)
      .map((p) => ({
        url: p.url ?? null,
        sourceHost: p.sourceHost ?? "unknown",
        sourceUrl: p.sourceUrl as string,
        sourceTitle: (p.sourceTitle ?? "").slice(0, 160),
      }));

    const allowed = new Set(["same_person", "likely_same", "inconclusive", "conflict", "unavailable"]);
    const verdict = allowed.has(String(m.verdict))
      ? (m.verdict as PhotoCorroboration["verdict"])
      : "inconclusive";

    return {
      verdict,
      confidence: Math.max(0, Math.min(100, Math.round(Number(m.confidence ?? 0)))),
      independentSources: Math.max(0, Number(m.independentSources ?? frames.length)),
      reasoning: String(m.reasoning ?? "").slice(0, 900),
      observations: (m.observations ?? []).slice(0, 8).map((o) => String(o).slice(0, 240)),
      falsifier: String(m.falsifier ?? "Locate a dated portrait from a source independent of the ones above."),
      frames,
      blocker: frames.length === 0 ? "No portrait passed the face gate on the reachable public web." : null,
    };
  } catch (e) {
    if (signal?.aborted) return null;
    return unavailable(`Visual cross-match aborted: ${(e as Error).message.slice(0, 160)}`);
  }
}

/** Fold the vault's stated cache posture into the annex. */
function readPolicy(raw: unknown, source: string | undefined): SweepPolicy | null {
  const p = raw as Partial<SweepPolicy> | null | undefined;
  if (!p || typeof p !== "object") return null;
  const maxAgeDays = Number(p.maxAgeDays ?? 14);
  return {
    source: source === "cache" || source === "fresh" ? source : "unknown",
    ageDays: p.ageDays === null || p.ageDays === undefined ? null : Number(p.ageDays),
    maxAgeDays,
    nextAutoSweepDays: Math.max(0, Number(p.nextAutoSweepDays ?? 0)),
    fresh: p.fresh === true,
    forced: p.forced === true,
    note: String(p.note ?? "").slice(0, 400),
  };
}

export async function collectContactOsint(req: OsintRequest): Promise<OsintAnnex> {

  const name = (req.name || "").trim();
  const email = (req.email || "").trim().toLowerCase() || null;
  if (!name && !email) {
    return emptyAnnex("absent", "No name or address on the contact record to collect against.", name, email);
  }

  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session) {
      return emptyAnnex("unauthenticated", "Not signed in — the open-source leg requires an authenticated session.", name, email);
    }

    // The hard identifiers on the contact record — the address it wrote from
    // and any number attached to it. Deduplicated so a phone listed twice is
    // not swept twice, and capped so a contact with a dozen aliases cannot
    // fan out into a dozen concurrent sweeps.
    const hardIdentifiers = Array.from(new Set(
      [email, ...(req.identifiers ?? [])]
        .map((v) => (v ?? "").trim())
        .filter((v) => v.length >= 5 && (v.includes("@") || /\d{7,}/.test(v.replace(/\D/g, "")))),
    )).slice(0, 5);

    // The dossier leg, the exposure legs and the visual
    // cross-match answer different questions and share no state, so they run
    // together. Sequencing them would add each leg's wall clock to every
    // contact report for no benefit.
    const [vaultResult, sweepResults, photo] = await Promise.all([
      supabase.functions.invoke("mesh-vault", {
        body: {
          action: "vault_for_contact",
          name,
          email,
          identifiers: (req.identifiers ?? []).slice(0, 8),
          org_anchors: (req.orgAnchors ?? []).slice(0, 2),
          location_hint: req.locationHint ?? null,
          force: req.force === true,
        },
      }),
      Promise.all(hardIdentifiers.map((id) => sweepIdentifierLeg(id, req.signal))),
      photoCorroborationLeg(name, req.locationHint ?? null, req.signal),
    ]);

    const identifierSweeps = sweepResults.filter(
      (r): r is IdentifierSweepSummary => r !== null,
    );
    const { data, error } = vaultResult;

    if (error) {
      // functions.invoke collapses every non-2xx into one opaque message; the
      // real reason is in the response body, so it is read out explicitly.
      let detail = error.message ?? "unknown error";
      const ctx = (error as { context?: { text?: () => Promise<string> } }).context;
      if (ctx?.text) {
        try { detail = (await ctx.text()).slice(0, 300) || detail; } catch { /* body already consumed */ }
      }
      // The dossier failed, but a confirmed exposure register is still
      // intelligence — it is carried onto the failure annex rather than
      // discarded alongside the leg that did fail.
      return { ...emptyAnnex("error", `Collection call failed: ${detail}`, name, email), identifierSweeps, photo };
    }

    const payload = data as {
      status?: string; dossier?: WireDoc | null; confidence?: number; message?: string;
      source?: string; policy?: unknown;
    } | null;
    const staleness = readPolicy(payload?.policy, payload?.source);

    if (!payload?.dossier) {
      return {
        ...emptyAnnex(
          (payload?.status as OsintStatus) || "absent",
          payload?.message || "No dossier was produced for this subject.",
          name,
          email,
        ),
        identifierSweeps,
        photo,
        staleness,
      };
    }

    return {
      ...toAnnex(payload.dossier, {
        status: "ready",
        blocker: null,
        confidence: Number(payload.confidence ?? 0),
        name,
        email,
      }),
      identifierSweeps,
      photo,
      staleness,
    };


  } catch (e) {
    return emptyAnnex("error", `Collection aborted: ${(e as Error).message.slice(0, 200)}`, name, email);
  }
}
