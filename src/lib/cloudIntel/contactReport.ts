// ═══════════════════════════════════════════════════════════════════════════
// ASHERIN — CONTACT INTELLIGENCE REPORT ENGINE (Lattice module)
//
// Ten sections, nine analytic layers, one rule that governs all of them:
// a section either shows evidence or names the reason it cannot. Silence is
// never rendered as a zero, and no figure is emitted that the underlying
// corpus cannot defend.
//
// PROVENANCE AND ITS LIMITS — read before extending this file.
// The corpus is Google People API address-book records plus Gmail *metadata*
// (From / To / Cc / Subject / Date / snippet / labels) returned by the
// `google-data` edge function. That has three consequences the engine is
// built around rather than papering over:
//
//   1. There is no message BODY. Only the ~200-char snippet. Every length
//      figure is therefore reported in snippet characters and labelled as a
//      proxy — never as a word count, which would be a fabricated number.
//   2. There is no User-Agent / X-Mailer header in the metadata read, so the
//      desktop-vs-mobile device split is NOT observable. The section says so.
//   3. Google exposes no call log or SMS log to any API. Phone-channel
//      analysis (call duration, callback rate, voicemail behaviour) has no
//      data source and is declared unavailable rather than invented.
//
// Everything the corpus *does* support — timing, latency, direction, thread
// structure, question/answer balance, lexical signature — is extracted at
// full depth.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  ContactDossier,
  RawMessage,
} from "@/components/dashboard/google/modules/contactIntel/messageIntel";
import { parseAddressList } from "@/components/dashboard/google/modules/contactIntel/messageIntel";
import { median, mean, round, confidenceFrom } from "./logic";

const DAY = 86_400_000;
const HOUR = 3_600_000;

// ─────────────────────────── shared shapes ───────────────────────────

/**
 * A single reported value. `value` is null exactly when the corpus cannot
 * support the claim, in which case `unavailable` states why — the two are
 * mutually exclusive and the renderer relies on that.
 */
export interface Metric {
  label: string;
  value: string | null;
  /** Why the value is absent. Required whenever value is null. */
  unavailable?: string;
  /** What the figure means for the operator. Omitted when it would be filler. */
  read?: string;
}

export interface OceanTrait {
  trait: "Openness" | "Conscientiousness" | "Extraversion" | "Agreeableness" | "Neuroticism";
  /** 0-100, or null when no indicator for this trait had any support. */
  score: number | null;
  /** How many independent indicators contributed. Drives trust, not the score. */
  indicators: number;
  evidence: string[];
}

export interface ThreadIntel {
  threadId: string;
  subject: string;
  lastMessage: number;
  messages: number;
  inbound: number;
  outbound: number;
  /** Questions they asked / substantive statements they made. */
  questionRatio: number | null;
  classification:
    | "DEAL / FINANCIAL"
    | "SOCIAL / MAINTENANCE"
    | "INTELLIGENCE GATHERING"
    | "SCHEDULING / LOGISTICS"
    | "INFLUENCE ATTEMPT"
    | "CRISIS / DISTRESS"
    | "UNRESOLVED / AWAITING YOU"
    | "UNRESOLVED / AWAITING THEM"
    | "UNCLASSIFIED";
  signal: string;
  action: string;
  caution: boolean;
}

export interface RiskFlag {
  severity: "moderate" | "elevated" | "critical";
  title: string;
  detection: string;
  meaning: string;
  distinction: string;
  action: string;
}

export interface ContactReport {
  generatedAt: number;
  /** Days between first and last observed message, or null. */
  windowDays: number | null;
  messagesAnalyzed: number;
  /** 0-100. Falls with corpus thinness — never asserted above the evidence. */
  confidence: number;
  /** Blocking reason when the corpus is too thin to report at all. */
  insufficient: string | null;

  identity: Metric[];
  behavioral: { group: string; rows: Metric[] }[];
  linguistic: { group: string; rows: Metric[] }[];
  ocean: OceanTrait[];
  oceanSummary: string | null;
  power: { rows: Metric[]; assessment: string | null };
  velocity: {
    health: number | null;
    trend: number | null;
    rows: Metric[];
    trajectory: string | null;
  };
  threads: ThreadIntel[];
  engagement: Metric[];
  risks: RiskFlag[];
  /** Channels with no reachable data source, named so absence reads as fact. */
  unavailableChannels: string[];
  summary: {
    who: string;
    position: string;
    actions: string[];
    projection: string | null;
  };
}

// ─────────────────────────── small helpers ───────────────────────────

const pct = (x: number) => `${Math.round(x * 100)}%`;
const hrs = (h: number | null) =>
  h === null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${round(h, 1)} h` : `${round(h / 24, 1)} d`;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Contiguous run of the busiest hours around the peak, as a human window. */
function activeWindow(hist: number[]): string | null {
  const total = hist.reduce((a, b) => a + b, 0);
  if (total < 6) return null;
  let best = 0, bestSum = -1;
  // Three-hour sliding window over a circular clock.
  for (let h = 0; h < 24; h++) {
    const s = hist[h] + hist[(h + 1) % 24] + hist[(h + 2) % 24];
    if (s > bestSum) { bestSum = s; best = h; }
  }
  if (bestSum / total < 0.2) return null; // no window actually dominates
  return `${String(best).padStart(2, "0")}:00–${String((best + 3) % 24).padStart(2, "0")}:00`;
}

function tsOf(m: RawMessage): number | null {
  if (typeof m.internalDate === "number" && Number.isFinite(m.internalDate)) return m.internalDate;
  if (m.internalDate) {
    const n = Number(m.internalDate);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (m.date) {
    const p = Date.parse(m.date);
    if (Number.isFinite(p)) return p;
  }
  return null;
}

const MINIMIZERS = ["just", "quick", "quickly", "small", "tiny", "briefly", "simply", "only"];
const QUALIFIERS = ["honestly", "frankly", "to be fair", "actually", "basically", "literally", "i just wanted"];
const URGENCY = ["asap", "urgent", "urgently", "immediately", "today", "eod", "deadline", "right away", "time sensitive"];
const DEAL = ["invoice", "payment", "contract", "term sheet", "termsheet", "agreement", "wire", "equity", "investment", "proposal", "quote", "budget", "pricing", "invoice", "deal", "funding", "royalty", "valuation"];
const SOCIAL = ["dinner", "lunch", "coffee", "birthday", "congrats", "congratulations", "family", "weekend", "holiday", "checking in", "check in", "catch up", "hope you", "how are you"];
const SCHEDULE = ["meeting", "call", "reschedule", "calendar", "invite", "availability", "schedule", "zoom", "meet", "appointment"];
const DISTRESS = ["urgent", "emergency", "asap", "problem", "issue", "failed", "help", "concerned", "worried", "sorry", "unfortunately", "delay"];
const FLATTERY = ["impressed", "amazing", "brilliant", "genius", "incredible", "honored", "admire", "huge fan", "love what"];

const countHits = (text: string, terms: string[]) =>
  terms.reduce((n, t) => (text.includes(t) ? n + 1 : n), 0);

/** Text surface available per message: subject + snippet, lowercased. */
const surfaceOf = (m: RawMessage) => `${m.subject || ""} ${m.snippet || ""}`.toLowerCase();

// ─────────────────────────── main build ───────────────────────────

export interface ReportInput {
  dossier: ContactDossier;
  /** Full corpus. The engine selects this contact's traffic itself. */
  messages: RawMessage[];
  ownAddresses: string[];
  /** Peer dossiers, used to place this contact against the operator's own norm. */
  peers?: ContactDossier[];
}

export function buildContactReport({ dossier: d, messages, ownAddresses, peers = [] }: ReportInput): ContactReport {
  const own = new Set(ownAddresses.map((a) => a.toLowerCase().trim()).filter(Boolean));
  const mine = new Set(d.emails.map((e) => e.toLowerCase()));

  // ── Select this contact's traffic. A message counts when they are the
  // sender, or when they appear anywhere in To/Cc on something the user sent.
  type Tagged = { m: RawMessage; ts: number; out: boolean; ccCount: number; toCount: number };
  const mail: Tagged[] = [];
  for (const m of messages) {
    const ts = tsOf(m);
    if (ts === null) continue;
    const from = parseAddressList(m.from)[0];
    if (!from) continue;
    const tos = parseAddressList(m.to);
    const ccs = parseAddressList(m.cc);
    const out = own.has(from.email);
    const involved = out
      ? [...tos, ...ccs].some((p) => mine.has(p.email))
      : mine.has(from.email);
    if (!involved) continue;
    mail.push({ m, ts, out, ccCount: ccs.length, toCount: tos.length });
  }
  mail.sort((a, b) => a.ts - b.ts);

  const now = Date.now();
  const first = mail[0]?.ts ?? d.firstSeen;
  const last = mail[mail.length - 1]?.ts ?? d.lastSeen;
  const windowDays = first !== null && last !== null ? Math.max(0, Math.round((last - first) / DAY)) : null;

  const inbound = mail.filter((x) => !x.out);
  const outbound = mail.filter((x) => x.out);

  // A report on three messages is noise wearing a report's clothes. The floor
  // is stated rather than silently producing confident-looking emptiness.
  const insufficient =
    mail.length < 4
      ? `Only ${mail.length} message${mail.length === 1 ? "" : "s"} with this contact are inside the current sweep window. Behavioural and linguistic layers need at least 4 before any pattern can be separated from coincidence. Widen the sweep depth or wait for more traffic.`
      : null;

  // ═══════════════ LAYER 0 — IDENTITY ═══════════════
  const domains = Array.from(new Set(d.emails.map((e) => e.split("@")[1]).filter(Boolean)));
  const freeMail = new Set(["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "proton.me", "protonmail.com", "aol.com", "me.com"]);
  const corpDomains = domains.filter((x) => !freeMail.has(x));
  const originator = mail[0] ? (mail[0].out ? "You reached out first" : "They reached out first — inbound origin") : null;

  const identity: Metric[] = [
    { label: "Full name", value: d.name || null, unavailable: "No display name on any address-book record or mail header." },
    { label: "Email addresses", value: d.emails.length ? d.emails.join(", ") : null, unavailable: "No email address on record." },
    {
      label: "Phone numbers",
      value: d.phones.length ? d.phones.join(", ") : null,
      unavailable: "No phone number in the address-book record for this contact.",
    },
    {
      label: "Domain",
      value: corpDomains.length ? corpDomains.join(", ") : domains.length ? `${domains.join(", ")} (consumer mail — no employer inferable)` : null,
      unavailable: "No email domain to read an affiliation from.",
      read: corpDomains.length ? "Organisational affiliation is inferable from the mail domain." : undefined,
    },
    { label: "Organisation", value: [d.jobTitle, d.organization].filter(Boolean).join(" @ ") || null, unavailable: "Not present on the address-book record." },
    {
      label: "First contact",
      value: first !== null ? `${new Date(first).toISOString().slice(0, 10)}${originator ? ` — ${originator}` : ""}` : null,
      unavailable: "No dated message inside the sweep window.",
      read: mail[0] && !mail[0].out ? "Inbound origin. They opened the relationship, which is itself an investment signal." : undefined,
    },
    {
      label: "Total messages",
      value: mail.length ? `${mail.length} in window (${inbound.length} received / ${outbound.length} sent) across ${d.threads} threads` : null,
      unavailable: "No traffic inside the sweep window.",
    },
    {
      label: "Last active",
      value: last !== null ? `${new Date(last).toISOString().replace("T", " ").slice(0, 16)} UTC · ${Math.round((now - last) / DAY)}d ago` : null,
      unavailable: "No dated message on record.",
    },
    {
      label: "Channels on record",
      value: d.channels.length ? d.channels.join(", ") : null,
      unavailable: "No channel evidence.",
    },
  ];

  // ═══════════════ LAYER 1 — BEHAVIOURAL METADATA ═══════════════
  const inHours = new Array(24).fill(0);
  const inDays = new Array(7).fill(0);
  for (const x of inbound) {
    const dt = new Date(x.ts);
    inHours[dt.getHours()]++;
    inDays[dt.getDay()]++;
  }
  const window3 = activeWindow(inHours);
  const weekendShare = inbound.length ? (inDays[0] + inDays[6]) / inbound.length : 0;
  const afterHours = inbound.length
    ? inbound.filter((x) => { const h = new Date(x.ts).getHours(); return h < 8 || h >= 18; }).length / inbound.length
    : 0;

  const theirLen = inbound.map((x) => (x.m.snippet || "").length).filter((n) => n > 0);
  const myLen = outbound.map((x) => (x.m.snippet || "").length).filter((n) => n > 0);
  const theirLenMed = median(theirLen);
  const myLenMed = median(myLen);

  // Thread initiation: earliest message per thread decides who opened it.
  const byThread = new Map<string, Tagged[]>();
  for (const x of mail) {
    const id = x.m.threadId || x.m.id;
    const list = byThread.get(id) ?? [];
    list.push(x);
    byThread.set(id, list);
  }
  let theyOpened = 0, iOpened = 0;
  for (const list of byThread.values()) {
    list.sort((a, b) => a.ts - b.ts);
    if (list[0].out) iOpened++; else theyOpened++;
  }
  const initTotal = theyOpened + iOpened;

  // Follow-up behaviour: consecutive inbound with no outbound between them.
  let chases = 0;
  for (const list of byThread.values()) {
    for (let i = 1; i < list.length; i++) if (!list[i].out && !list[i - 1].out) chases++;
  }

  const ccBreadth = mean(inbound.map((x) => x.ccCount + Math.max(0, x.toCount - 1)));
  const soloShare = inbound.length
    ? inbound.filter((x) => x.ccCount + Math.max(0, x.toCount - 1) === 0).length / inbound.length
    : 0;

  const behavioral: { group: string; rows: Metric[] }[] = [
    {
      group: "Send window",
      rows: [
        {
          label: "Peak activity",
          value: window3,
          unavailable: "Under 6 inbound messages, or traffic spread too evenly for any window to dominate.",
          read: window3 ? "Their densest three-hour band. Mail landing inside it is routine; mail landing far outside it is deliberate." : undefined,
        },
        {
          label: "Busiest day",
          value: inbound.length >= 5 ? `${DAYS[inDays.indexOf(Math.max(...inDays))]} (${Math.max(...inDays)} of ${inbound.length})` : null,
          unavailable: "Under 5 inbound messages — a weekday peak would be an artefact.",
        },
        {
          label: "Weekend traffic",
          value: inbound.length >= 5 ? pct(weekendShare) : null,
          unavailable: "Under 5 inbound messages.",
          read: weekendShare >= 0.25 ? "They work through the weekend, so weekend silence from them is meaningful rather than structural." : weekendShare === 0 ? "Hard weekday boundary. A weekend message from them would be an exception worth reading." : undefined,
        },
        {
          label: "After-hours share",
          value: inbound.length >= 5 ? pct(afterHours) : null,
          unavailable: "Under 5 inbound messages.",
          read: afterHours >= 0.4 ? "A large share arrives outside 08:00–18:00 — this correspondence is not confined to their working day." : undefined,
        },
      ],
    },
    {
      group: "Reply latency",
      rows: [
        {
          label: "Their reply to you",
          value: d.theirReplyLatencyHours !== null ? hrs(d.theirReplyLatencyHours) : null,
          unavailable: "No thread contains their reply following your message.",
        },
        {
          label: "Your reply to them",
          value: d.myReplyLatencyHours !== null ? hrs(d.myReplyLatencyHours) : null,
          unavailable: "No thread contains your reply following their message.",
        },
        (() => {
          const t = d.theirReplyLatencyHours, m = d.myReplyLatencyHours;
          if (t === null || m === null) {
            return { label: "Latency delta", value: null, unavailable: "Both directions need a measured reply before a gap can be stated." };
          }
          const ratio = m / Math.max(0.05, t);
          return {
            label: "Latency delta",
            value: ratio >= 1 ? `You are ${round(ratio, 1)}× slower` : `They are ${round(1 / ratio, 1)}× slower`,
            read:
              ratio >= 3 ? "They respond materially faster than you do. In latency terms you are the scarce party."
              : ratio <= 0.33 ? "You respond materially faster than they do. You are spending more urgency on this relationship than they are."
              : "Reply speeds are broadly matched — no latency-based power gap.",
          };
        })(),
      ],
    },
    {
      group: "Message structure",
      rows: [
        {
          label: "Their length (proxy)",
          value: theirLenMed !== null ? `${Math.round(theirLenMed)} snippet chars` : null,
          unavailable: "No snippet text on their messages.",
          read: "Gmail metadata exposes only the opening snippet, so this is an opening-length proxy, not a body word count.",
        },
        {
          label: "Your length (proxy)",
          value: myLenMed !== null ? `${Math.round(myLenMed)} snippet chars` : null,
          unavailable: "No snippet text on your messages.",
        },
        {
          label: "Device split",
          value: null,
          unavailable: "Not observable. The Gmail metadata read returns no User-Agent or X-Mailer header, so desktop-versus-mobile origin cannot be established for any message.",
        },
        {
          label: "Audience breadth",
          value: inbound.length >= 4 ? `${round(ccBreadth ?? 0, 1)} other recipients per message · ${pct(soloShare)} sent to you alone` : null,
          unavailable: "Under 4 inbound messages.",
          read: soloShare >= 0.8 ? "Overwhelmingly one-to-one. This is a direct channel, not a distribution list." : ccBreadth !== null && ccBreadth >= 2 ? "They routinely loop others in — their organisational surface is visible in the Cc line." : undefined,
        },
      ],
    },
    {
      group: "Initiation",
      rows: [
        {
          label: "Thread initiation",
          value: initTotal >= 3 ? `${Math.round((theyOpened / initTotal) * 100)}% them / ${Math.round((iOpened / initTotal) * 100)}% you (${initTotal} threads)` : null,
          unavailable: "Under 3 distinct threads — an initiation ratio would not be stable.",
          read:
            initTotal >= 3 && theyOpened / initTotal >= 0.62 ? "They are the pursuer. Initiation is the clearest single investment signal in the corpus."
            : initTotal >= 3 && theyOpened / initTotal <= 0.38 ? "You are the pursuer. You are carrying the cost of keeping this relationship alive."
            : undefined,
        },
        {
          label: "Follow-up pressure",
          value: mail.length >= 6 ? `${chases} unanswered follow-up${chases === 1 ? "" : "s"} from them` : null,
          unavailable: "Under 6 messages.",
          read: chases >= 2 ? "They chase rather than wait. A message from you resolves a queue, not a single item." : chases === 0 ? "They do not chase. Silence from you produces silence from them, so nothing recovers on its own." : undefined,
        },
      ],
    },
  ];

  // ═══════════════ LAYER 2 — LINGUISTIC FINGERPRINT ═══════════════
  const theirText = inbound.map((x) => surfaceOf(x.m)).join(" ");
  const theirTokens = theirText.split(/\W+/).filter(Boolean);
  const tokenN = theirTokens.length;
  const rate = (terms: string[]) => {
    if (!tokenN) return null;
    const n = theirTokens.filter((t) => terms.includes(t)).length;
    return round((n / tokenN) * 1000, 1);
  };
  const iRate = rate(["i", "me", "my", "mine", "myself"]);
  const weRate = rate(["we", "us", "our", "ours"]);
  const youRate = rate(["you", "your", "yours"]);
  const minRate = rate(MINIMIZERS);
  const qualHits = countHits(theirText, QUALIFIERS);
  const questionShare = inbound.length ? inbound.filter((x) => surfaceOf(x.m).includes("?")).length / inbound.length : 0;
  const exclShare = inbound.length ? inbound.filter((x) => (x.m.snippet || "").includes("!")).length / inbound.length : 0;
  const emojiShare = inbound.length ? inbound.filter((x) => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(x.m.snippet || "")).length / inbound.length : 0;
  const lowerSubjects = inbound.filter((x) => x.m.subject && x.m.subject === x.m.subject.toLowerCase()).length;
  const subjWords = inbound.map((x) => (x.m.subject || "").replace(/^(re|fwd):\s*/i, "").split(/\s+/).filter(Boolean).length).filter((n) => n > 0);
  const subjMed = median(subjWords);
  const lenVariance = theirLen.length >= 5 && theirLenMed
    ? round(Math.sqrt(theirLen.reduce((s, v) => s + (v - (mean(theirLen) ?? 0)) ** 2, 0) / theirLen.length) / theirLenMed, 2)
    : null;

  const thin = tokenN < 60;
  const linguistic: { group: string; rows: Metric[] }[] = [
    {
      group: "Function-word signature",
      rows: [
        {
          label: "First-person singular",
          value: thin ? null : `${iRate}/1000 tokens`,
          unavailable: thin ? `Only ${tokenN} lexical tokens available from subjects and snippets — under the 60-token floor for a stable rate.` : undefined,
          read: !thin && iRate !== null && weRate !== null && iRate > weRate * 2 ? "Self-referential framing dominates. They reason from their own position outward." : undefined,
        },
        {
          label: "Collective pronouns",
          value: thin ? null : `${weRate}/1000 tokens`,
          unavailable: thin ? "Corpus under the 60-token floor." : undefined,
          read: !thin && weRate !== null && iRate !== null && weRate > iRate ? "Inclusion framing exceeds self-reference — they habitually pull you into a shared narrative." : undefined,
        },
        {
          label: "Second-person focus",
          value: thin ? null : `${youRate}/1000 tokens`,
          unavailable: thin ? "Corpus under the 60-token floor." : undefined,
          read: !thin && youRate !== null && iRate !== null && youRate > iRate * 1.5 ? "Consistently oriented toward you rather than themselves — either genuine attentiveness or a practised technique." : undefined,
        },
        {
          label: "Minimising language",
          value: thin ? null : `${minRate}/1000 tokens ("just", "quick", "small")`,
          unavailable: thin ? "Corpus under the 60-token floor." : undefined,
          read: !thin && minRate !== null && minRate >= 12 ? "Heavy minimisers. They downplay the weight of their asks — read past the framing to the actual request." : undefined,
        },
      ],
    },
    {
      group: "Register and style",
      rows: [
        {
          label: "Question rate",
          value: inbound.length >= 4 ? `${pct(questionShare)} of their messages contain a question` : null,
          unavailable: "Under 4 inbound messages.",
        },
        {
          label: "Punctuation",
          value: inbound.length >= 4 ? `${pct(exclShare)} exclamation · ${pct(emojiShare)} emoji` : null,
          unavailable: "Under 4 inbound messages.",
          read: emojiShare === 0 && exclShare < 0.1 && inbound.length >= 6 ? "Zero emoji, near-zero exclamation. A controlled, analytical register — warmth here will be carried by content, not by decoration." : undefined,
        },
        {
          label: "Subject-line style",
          value: subjMed !== null ? `${Math.round(subjMed)} words median${lowerSubjects >= inbound.length * 0.5 && inbound.length >= 4 ? ", lowercase-dominant" : ""}` : null,
          unavailable: "No subject lines on their messages.",
          read: subjMed !== null && subjMed <= 4 ? "Short, noun-first subjects. Mirror that form — a long descriptive subject line reads as friction to this correspondent." : undefined,
        },
        {
          label: "Length variance",
          value: lenVariance !== null ? `${lenVariance}× coefficient of variation` : null,
          unavailable: "Under 5 measurable message openings.",
          read: lenVariance !== null && lenVariance >= 0.5 ? "High variance — openings range from terse to expansive, which is the signature of unrehearsed writing." : lenVariance !== null && lenVariance <= 0.2 ? "Low variance — near-uniform openings, consistent with templated or heavily-habitual composition." : undefined,
        },
        {
          label: "Qualifier pre-loading",
          value: tokenN ? `${qualHits} occurrence${qualHits === 1 ? "" : "s"} of "honestly" / "frankly" / "to be fair"` : null,
          unavailable: "No text surface to count over.",
          read: qualHits >= 4 ? "Elevated. Truth-asserting qualifiers cluster where a speaker anticipates doubt — worth watching, not yet a flag." : "Within normal range. Not a deception indicator.",
        },
      ],
    },
  ];

  // ═══════════════ LAYER 3 — OCEAN ═══════════════
  // Each trait is scored from behavioural indicators, not vibes. A trait with
  // zero supported indicators scores null rather than defaulting to 50, which
  // would be an invented centre.
  const p = d.psych;
  const dim = p.dimensions;
  const psychReady = p.evidence !== "none" && tokenN >= 40;

  const trait = (
    name: OceanTrait["trait"],
    parts: { on: boolean; delta: number; why: string }[],
  ): OceanTrait => {
    const live = parts.filter((x) => x.on);
    if (!live.length) return { trait: name, score: null, indicators: 0, evidence: [] };
    const score = Math.max(0, Math.min(100, Math.round(50 + live.reduce((s, x) => s + x.delta, 0))));
    return { trait: name, score, indicators: live.length, evidence: live.map((x) => x.why) };
  };

  const topicSpread = d.patterns.topSubjectTokens.length;
  const vocabRichness = tokenN >= 40 ? new Set(theirTokens).size / tokenN : null;

  const ocean: OceanTrait[] = [
    trait("Openness", [
      { on: topicSpread >= 5, delta: 14, why: `${topicSpread} distinct recurring subject themes — they range across topics rather than staying on one track.` },
      { on: vocabRichness !== null && vocabRichness >= 0.62, delta: 12, why: `Type-token ratio ${round((vocabRichness ?? 0) * 100, 0)}% — varied vocabulary rather than a repeated core phrase set.` },
      { on: vocabRichness !== null && vocabRichness < 0.45, delta: -14, why: `Type-token ratio ${round((vocabRichness ?? 0) * 100, 0)}% — a narrow, repeating lexicon.` },
      { on: psychReady && dim.cognitive >= 6, delta: 10, why: `Causal-reasoning vocabulary at ${dim.cognitive}/1000 — they explain their thinking rather than only stating conclusions.` },
      { on: psychReady && dim.futureFocus > dim.pastFocus * 1.5, delta: 8, why: "Forward-looking language outweighs retrospective language." },
    ]),
    trait("Conscientiousness", [
      { on: d.theirReplyLatencyHours !== null && d.theirReplyLatencyHours <= 6, delta: 16, why: `Median reply ${hrs(d.theirReplyLatencyHours)} — they close loops quickly and consistently.` },
      { on: d.theirReplyLatencyHours !== null && d.theirReplyLatencyHours > 72, delta: -14, why: `Median reply ${hrs(d.theirReplyLatencyHours)} — replies lag well past a working cycle.` },
      { on: d.cadenceDays !== null && d.cadenceDays <= 14 && (d.driftRatio ?? 9) <= 1.5, delta: 12, why: `Contact rhythm of ${d.cadenceDays}d has been sustained without slippage.` },
      { on: window3 !== null, delta: 8, why: `Traffic concentrates in a stable ${window3} band rather than scattering across the clock.` },
      { on: psychReady && dim.formality >= 8, delta: 8, why: `Structured correspondence conventions — salutations and closings present at ${dim.formality}/1000.` },
      { on: chases >= 2, delta: 8, why: `${chases} self-initiated follow-ups — they carry their own open items forward.` },
    ]),
    trait("Extraversion", [
      { on: initTotal >= 3 && theyOpened / initTotal >= 0.6, delta: 15, why: `They open ${Math.round((theyOpened / initTotal) * 100)}% of threads — initiation is the dominant extraversion behaviour available in mail.` },
      { on: initTotal >= 3 && theyOpened / initTotal <= 0.3, delta: -15, why: `They open only ${Math.round((theyOpened / initTotal) * 100)}% of threads — responsive rather than initiating.` },
      { on: psychReady && dim.social >= 8, delta: 10, why: `Social vocabulary at ${dim.social}/1000 — meetings, calls and people are frequent referents.` },
      { on: theirLenMed !== null && myLenMed !== null && theirLenMed > myLenMed * 1.25, delta: 8, why: "Their message openings run longer than yours — expansive rather than clipped." },
      { on: soloShare >= 0.9 && inbound.length >= 6, delta: -8, why: "Almost exclusively one-to-one; they avoid multi-party threads." },
    ]),
    trait("Agreeableness", [
      { on: psychReady && dim.gratitude >= 6, delta: 12, why: `Gratitude terms at ${dim.gratitude}/1000 — they acknowledge routinely.` },
      { on: psychReady && dim.tentativeness >= 8, delta: 10, why: `Softeners at ${dim.tentativeness}/1000 ("maybe", "might", "could") — they hedge rather than assert.` },
      { on: psychReady && dim.certainty >= 12 && dim.tentativeness < 5, delta: -12, why: `High certainty (${dim.certainty}/1000) with minimal hedging — they state positions directly.` },
      { on: psychReady && dim.apology >= 4, delta: 8, why: `Apology language present at ${dim.apology}/1000.` },
      { on: psychReady && dim.anger >= 3, delta: -14, why: `Frustration vocabulary present at ${dim.anger}/1000 — friction surfaces in the text.` },
    ]),
    trait("Neuroticism", [
      { on: psychReady && dim.anxiety >= 5, delta: 16, why: `Anxiety vocabulary at ${dim.anxiety}/1000 — worry language is a persistent feature.` },
      { on: psychReady && dim.anxiety < 2 && dim.negativeAffect < 6, delta: -16, why: "Anxiety and negative-affect vocabulary are both near floor across the corpus." },
      { on: psychReady && dim.urgency >= 8, delta: 12, why: `Urgency terms at ${dim.urgency}/1000 — time pressure is habitually foregrounded.` },
      { on: chases >= 3, delta: 10, why: `${chases} unanswered follow-ups — silence from you produces repeated re-contact.` },
      { on: afterHours >= 0.45 && inbound.length >= 6, delta: 8, why: `${pct(afterHours)} of their traffic lands outside working hours — poor separation between work and rest.` },
      { on: lenVariance !== null && lenVariance <= 0.25, delta: -8, why: "Message length is highly stable across the window — low volatility in output." },
    ]),
  ];

  const scored = ocean.filter((t) => t.score !== null);
  const oceanSummary = scored.length >= 3 ? buildOceanSummary(d.name, ocean) : null;

  // ═══════════════ LAYER 4 — POWER DYNAMICS ═══════════════
  const wordEdge = theirLenMed !== null && myLenMed !== null && theirLenMed > 0
    ? (myLenMed - theirLenMed) / theirLenMed
    : null;
  const latRatio = d.theirReplyLatencyHours !== null && d.myReplyLatencyHours !== null
    ? d.myReplyLatencyHours / Math.max(0.05, d.theirReplyLatencyHours)
    : null;

  // Frame score: positive means the operator holds the frame.
  let frame = 0, frameBasis = 0;
  if (initTotal >= 3) { frame += (theyOpened / initTotal - 0.5) * 2; frameBasis++; }
  if (latRatio !== null) { frame += Math.max(-1, Math.min(1, Math.log(latRatio) / Math.log(4))); frameBasis++; }
  if (wordEdge !== null) { frame += Math.max(-1, Math.min(1, -wordEdge)); frameBasis++; }
  const frameScore = frameBasis ? frame / frameBasis : null;

  const power = {
    rows: [
      {
        label: "Investment (length)",
        value: wordEdge !== null ? `You write ${wordEdge >= 0 ? "+" : ""}${Math.round(wordEdge * 100)}% versus their openings` : null,
        unavailable: "Both sides need measurable snippet text before an investment ratio means anything.",
        read: wordEdge !== null && wordEdge >= 0.3 ? "You are carrying more explanatory labour per exchange. That establishes a frame where you justify and they evaluate." : wordEdge !== null && wordEdge <= -0.3 ? "They elaborate more than you do. You are the party being persuaded." : undefined,
      },
      {
        label: "Initiation",
        value: initTotal >= 3 ? `${Math.round((theyOpened / initTotal) * 100)}% them / ${Math.round((iOpened / initTotal) * 100)}% you` : null,
        unavailable: "Under 3 threads.",
      },
      {
        label: "Latency delta",
        value: latRatio !== null ? (latRatio >= 1 ? `You are ${round(latRatio, 1)}× slower` : `They are ${round(1 / latRatio, 1)}× slower`) : null,
        unavailable: "Reply latency is unmeasured in at least one direction.",
      },
      {
        label: "Thread abandonment",
        value: mail.length >= 6
          ? `${[...byThread.values()].filter((l) => !l[l.length - 1].out).length} thread(s) end on their message · ${[...byThread.values()].filter((l) => l[l.length - 1].out).length} end on yours`
          : null,
        unavailable: "Under 6 messages.",
        read: "The party whose message ends a thread more often is the party comfortable leaving the other waiting.",
      },
    ] as Metric[],
    assessment:
      frameScore === null || frameBasis < 2
        ? null
        : frameScore >= 0.25
          ? `You hold the frame. Across ${frameBasis} independent measures — initiation, reply speed and message length — the traffic shows them investing more than you. If your behaviour toward this contact feels deferential, it is not matching the data. Recommended calibration: shorten replies and let them close the distance.`
          : frameScore <= -0.25
            ? `They hold the frame. Across ${frameBasis} independent measures you initiate more, reply faster, or write longer. You are the more invested party, which prices your asks higher than theirs. Recommended calibration: reduce reply length, delay non-urgent responses to their own median, and stop opening threads that could wait.`
            : `Frame is broadly balanced across ${frameBasis} measures. Neither party is meaningfully carrying the relationship, which is the healthiest reading available from metadata alone.`,
  };

  // ═══════════════ LAYER 5 — RELATIONSHIP VELOCITY ═══════════════
  const half = first !== null && last !== null ? first + (last - first) / 2 : null;
  const early = half !== null ? mail.filter((x) => x.ts < half) : [];
  const late = half !== null ? mail.filter((x) => x.ts >= half) : [];
  const warmthOf = (set: Tagged[]) => {
    const txt = set.filter((x) => !x.out).map((x) => surfaceOf(x.m)).join(" ");
    const toks = txt.split(/\W+/).filter(Boolean);
    if (toks.length < 25) return null;
    const warm = countHits(txt, SOCIAL) + toks.filter((t) => ["thanks", "thank", "great", "appreciate", "glad", "happy", "congrats"].includes(t)).length;
    return round((warm / toks.length) * 1000, 1);
  };
  const warmEarly = warmthOf(early), warmLate = warmthOf(late);
  const volEarly = early.length, volLate = late.length;

  // Health: reciprocity, recency against own cadence, two-way traffic, tenure.
  let health: number | null = null;
  if (mail.length >= 4) {
    const recip = d.reciprocity === null ? 0 : (1 - Math.abs(0.5 - d.reciprocity) * 2) * 30;
    const drift = d.driftRatio === null ? 12 : Math.max(0, 1 - d.driftRatio / 3) * 25;
    const twoWay = inbound.length > 0 && outbound.length > 0 ? 20 : 0;
    const depth = Math.min(1, byThread.size / 6) * 15;
    const warmthBump = warmEarly !== null && warmLate !== null ? Math.max(-10, Math.min(10, (warmLate - warmEarly) * 1.5)) : 0;
    health = Math.max(0, Math.min(100, Math.round(recip + drift + twoWay + depth + warmthBump)));
  }
  const trend = warmEarly !== null && warmLate !== null ? round(warmLate - warmEarly, 1) : null;

  const velocity = {
    health,
    trend,
    rows: [
      {
        label: "Warmth trajectory",
        value: warmEarly !== null && warmLate !== null ? `${warmEarly} → ${warmLate} per 1000 tokens` : null,
        unavailable: "Each half of the window needs 25+ inbound tokens before a trajectory can be drawn.",
        read: trend !== null && trend > 1 ? "Warming. Relational language is a larger share of their writing now than at the start of the window." : trend !== null && trend < -1 ? "Cooling. Relational language is receding toward pure transaction." : trend !== null ? "Flat. Tone is holding its register." : undefined,
      },
      {
        label: "Engagement velocity",
        value: volEarly + volLate >= 6 ? `${volEarly} → ${volLate} messages per half-window` : null,
        unavailable: "Under 6 messages.",
        read: volLate > volEarly * 1.4 ? "Accelerating — exchange frequency is rising." : volLate * 1.4 < volEarly ? "Decelerating — exchange frequency is falling and drift risk is real." : undefined,
      },
      {
        label: "Reciprocity balance",
        value: d.reciprocity !== null ? `${pct(d.reciprocity)} of traffic is outbound from you` : null,
        unavailable: "No traffic on record.",
        read: d.reciprocity !== null && d.reciprocity >= 0.7 ? "You are generating most of the volume. Sustainable short-term, corrosive long-term." : d.reciprocity !== null && d.reciprocity <= 0.3 ? "They generate most of the volume. You are receiving more than you return." : undefined,
      },
      {
        label: "Drift risk",
        value: d.silenceDays !== null
          ? d.driftRatio === null
            ? `${d.silenceDays}d silent — no rhythm established to measure against`
            : d.driftRatio >= 3 ? `HIGH — ${d.silenceDays}d silent against a ${d.cadenceDays}d rhythm (${d.driftRatio}×)`
            : d.driftRatio >= 1.8 ? `ELEVATED — ${d.silenceDays}d silent against a ${d.cadenceDays}d rhythm (${d.driftRatio}×)`
            : `LOW — ${d.silenceDays}d silent, inside the ${d.cadenceDays}d rhythm`
          : null,
        unavailable: "No dated traffic.",
      },
    ] as Metric[],
    trajectory:
      health === null ? null
      : health >= 70 && (trend ?? 0) >= 0 ? "Stable with upward pressure. Nothing in the metadata argues for intervention."
      : health >= 70 ? "Healthy but cooling. The structure is intact while the tone recedes — worth a non-transactional message."
      : health >= 45 ? "Functional but unbalanced. One of reciprocity, rhythm or warmth is carrying a deficit the others are covering for."
      : "Degraded. Traffic is one-way, overdue against its own rhythm, or both. This relationship survives on inertia.",
  };

  // ═══════════════ LAYER 6 — INTENT CLASSIFICATION ═══════════════
  const threads: ThreadIntel[] = [...byThread.entries()]
    .map(([threadId, list]) => {
      list.sort((a, b) => a.ts - b.ts);
      const theirs = list.filter((x) => !x.out);
      const text = theirs.map((x) => surfaceOf(x.m)).join(" ");
      const subject = (list[0].m.subject || "(no subject)").replace(/^(re|fwd):\s*/i, "");
      const q = (text.match(/\?/g) || []).length;
      const statements = theirs.reduce((n, x) => n + ((x.m.snippet || "").split(/[.!]/).filter((s) => s.trim().length > 12).length), 0);
      const qRatio = theirs.length && statements + q > 0 ? round(q / Math.max(1, statements), 2) : null;

      const dealHits = countHits(text, DEAL);
      const socialHits = countHits(text, SOCIAL);
      const schedHits = countHits(text, SCHEDULE);
      const distressHits = countHits(text, DISTRESS);
      const flatteryHits = countHits(text, FLATTERY);
      const urgencyHits = countHits(text, URGENCY);
      const lastOut = list[list.length - 1].out;

      let classification: ThreadIntel["classification"] = "UNCLASSIFIED";
      let signal = "No dominant lexical or structural signal in this thread.";
      let action = "No action indicated by the metadata.";
      let caution = false;

      if (qRatio !== null && qRatio >= 2 && q >= 3) {
        classification = "INTELLIGENCE GATHERING";
        signal = `${q} questions asked against ${statements} substantive statements offered — a ${qRatio}:1 extraction ratio.`;
        action = "Rebalance the next reply: answer one question fully, then ask two back. Restore information parity before the next substantive exchange.";
        caution = true;
      } else if (flatteryHits >= 2 && (dealHits >= 1 || urgencyHits >= 1)) {
        classification = "INFLUENCE ATTEMPT";
        signal = `Praise vocabulary (${flatteryHits} hits) co-occurring with a transactional or time-pressured ask.`;
        action = "Separate the compliment from the request and evaluate the request alone. Do not answer inside the same emotional frame it arrived in.";
        caution = true;
      } else if (distressHits >= 3 && urgencyHits >= 1) {
        classification = "CRISIS / DISTRESS";
        signal = `Elevated problem and urgency vocabulary (${distressHits} distress, ${urgencyHits} urgency markers) concentrated in one thread.`;
        action = "Respond on the fastest channel available. Delay here is read as abandonment, not composure.";
      } else if (dealHits >= 2) {
        classification = "DEAL / FINANCIAL";
        signal = `${dealHits} transactional terms across ${theirs.length} of their messages in this thread.`;
        action = lastOut
          ? "Ball is with them. Do not follow up before their median reply time has elapsed — a premature chase prices your position down."
          : "Ball is with you. This is the highest-consequence open thread with this contact.";
      } else if (schedHits >= 2 && socialHits < 2) {
        classification = "SCHEDULING / LOGISTICS";
        signal = `${schedHits} scheduling terms — coordination rather than substance.`;
        action = "Close with a specific proposed time rather than an open availability question. Open-ended replies extend logistics threads indefinitely.";
      } else if (socialHits >= 2) {
        classification = "SOCIAL / MAINTENANCE";
        signal = `${socialHits} relational terms with no transactional ask detected — pure relationship investment.`;
        action = "Reply warmly and briefly, same day but not instantly. Matching their register matters more than speed here.";
      } else if (!lastOut) {
        classification = "UNRESOLVED / AWAITING YOU";
        signal = `Thread ends on their message, ${Math.round((now - list[list.length - 1].ts) / DAY)}d ago, with no reply from you.`;
        action = "Close it or kill it. An open thread with no reply is a standing negative signal about your reliability.";
      } else {
        classification = "UNRESOLVED / AWAITING THEM";
        signal = `Thread ends on your message, ${Math.round((now - list[list.length - 1].ts) / DAY)}d ago, with no reply from them.`;
        action = "Hold. Follow up only once their median reply window has passed twice over.";
      }

      return {
        threadId,
        subject,
        lastMessage: list[list.length - 1].ts,
        messages: list.length,
        inbound: theirs.length,
        outbound: list.length - theirs.length,
        questionRatio: qRatio,
        classification,
        signal,
        action,
        caution,
      };
    })
    .sort((a, b) => Number(b.caution) - Number(a.caution) || b.lastMessage - a.lastMessage)
    .slice(0, 8);

  // ═══════════════ LAYER 7 — ENGAGEMENT PROTOCOL ═══════════════
  // Their best window is where THEIR traffic peaks, on the reasoning that a
  // correspondent is most reachable inside the band they already occupy.
  const bestDayIdx = inbound.length >= 6 ? inDays.indexOf(Math.max(...inDays)) : -1;
  // Quietest weekday (Sat/Sun excluded — weekend silence is structural, not
  // a preference, and naming it as a dead window would be a false insight).
  const weekdayCounts = inDays.slice(1, 6);
  const quietWeekday = inbound.length >= 8 ? DAYS[1 + weekdayCounts.indexOf(Math.min(...weekdayCounts))] : null;


  const lever =
    !psychReady ? null
    : dim.money >= 6 || countHits(theirText, DEAL) >= 3 ? "EVIDENCE AND NUMBERS — their vocabulary is transactional. Specific figures and named references move them; adjectives do not."
    : dim.social >= 8 ? "SOCIAL PROOF AND RELATIONSHIP — people and meetings dominate their referents. Who else is involved matters more to them than the mechanics."
    : dim.cognitive >= 6 ? "REASONING — they explain their thinking and expect the same. Show the logic chain, not just the conclusion."
    : dim.urgency >= 8 ? "TIME AND SEQUENCE — they operate on deadlines. Anchor asks to a date, not to importance."
    : null;

  const engagement: Metric[] = [
    {
      label: "Best send window",
      value: window3 && bestDayIdx >= 0 ? `${DAYS[bestDayIdx]}, ${window3}` : window3 || null,
      unavailable: "Under 6 inbound messages, or no window carries enough traffic to call a peak.",
      read: "This is when they are demonstrably at the mailbox — measured from their own send times, not from generic advice.",
    },
    {
      label: "Avoid",
      value: inbound.length >= 8
        ? [
            weekendShare < 0.05 && "weekends (zero observed traffic)",
            afterHours < 0.15 && "outside 08:00–18:00",
            quietWeekday && `${quietWeekday} (their quietest weekday)`,
          ].filter(Boolean).join(", ") || "No dead window is observable — their traffic is broadly distributed."
        : null,

      unavailable: "Under 8 inbound messages — a dead window would be an artefact of a small sample.",
    },
    {
      label: "Optimal length",
      value: theirLenMed !== null ? `Match ~${Math.round(theirLenMed)} snippet chars in your opening (±20%)` : null,
      unavailable: "No measurable openings from them to mirror.",
      read: "Register-matching reduces friction. Openings materially longer than theirs reliably return shorter replies.",
    },
    {
      label: "Subject-line form",
      value: subjMed !== null ? `${Math.round(subjMed)}-word ${subjMed <= 4 ? "noun-first" : "descriptive"} subjects${lowerSubjects >= inbound.length * 0.5 && inbound.length >= 4 ? ", lowercase" : ""}` : null,
      unavailable: "No subject lines to mirror.",
      read: "Mirror their own construction. Their subject grammar is the cheapest available rapport signal.",
    },
    {
      label: "Tone calibration",
      value: psychReady
        ? p.composites.formalityIndex !== null && p.composites.formalityIndex >= 60 ? "Formal — salutation, full sentences, explicit close."
          : p.composites.formalityIndex !== null && p.composites.formalityIndex <= 30 ? "Casual — no salutation needed, contractions fine, short close."
          : "Neutral-professional — light salutation, direct body."
        : null,
      unavailable: "Lexical corpus too thin to read a register.",
    },
    {
      label: "Escalation trigger",
      value: byThread.size >= 3
        ? (() => {
            const long = [...byThread.values()].filter((l) => l.length >= 5).length;
            return long ? `${long} thread(s) exceeded 5 exchanges without resolution — that depth is the point where this correspondence historically stalls.` : "No thread has exceeded 5 exchanges. Email is resolving matters on its own with this contact.";
          })()
        : null,
      unavailable: "Under 3 threads.",
      read: "When a thread passes its historical stall depth, move channel rather than sending another message into it.",
    },
    {
      label: "Influence lever",
      value: lever,
      unavailable: "Lexical corpus too thin to identify what this contact responds to. Do not guess — a mis-read lever is worse than none.",
    },
  ];

  // ═══════════════ LAYER 8 — RISK FLAGS ═══════════════
  const risks: RiskFlag[] = [];

  const extracting = threads.filter((t) => t.classification === "INTELLIGENCE GATHERING");
  if (extracting.length) {
    risks.push({
      severity: extracting.length >= 2 ? "elevated" : "moderate",
      title: "Information extraction pattern",
      detection: `${extracting.length} thread(s) show a question-to-statement ratio at or above 2:1 — ${extracting.map((t) => `"${t.subject}" (${t.questionRatio}:1)`).join(", ")}.`,
      meaning: "They are drawing more information out of this channel than they are putting into it. That is standard behaviour in a due-diligence or pre-commitment phase, and it is also what building an information asymmetry looks like from the outside. The metadata cannot distinguish the two.",
      distinction: "This is NOT a deception marker and NOT a manipulation marker. No claim is being made about intent — only about balance.",
      action: "Restore parity across the next two exchanges. If the ratio stays above 2:1 after a deliberate rebalance, the imbalance is a choice rather than a phase, and should be treated accordingly.",
    });
  }

  const influence = threads.filter((t) => t.classification === "INFLUENCE ATTEMPT");
  if (influence.length) {
    risks.push({
      severity: "elevated",
      title: "Praise-then-ask sequencing",
      detection: `${influence.length} thread(s) pair praise vocabulary with a transactional or time-pressured request inside the same exchange.`,
      meaning: "Warmth immediately preceding an ask is the most common compliance-engineering structure in correspondence. It may be entirely sincere — warmth and requests co-occur naturally between people who like each other.",
      distinction: "Sequence alone is not intent. This flag exists so the sequence is visible, not so it is condemned.",
      action: "Evaluate the request with the praise removed. If it still stands on its merits, the warmth was real.",
    });
  }

  if (minRate !== null && minRate >= 14 && tokenN >= 80) {
    risks.push({
      severity: "moderate",
      title: "Systematic minimisation of asks",
      detection: `Minimising terms at ${minRate}/1000 tokens across ${tokenN} tokens — well above the ~6/1000 seen in ordinary correspondence.`,
      meaning: `"Just a quick thought" and "small favour" reduce the apparent cost of a request before it is stated. Sustained use means the stated weight of their asks is systematically below the real weight.`,
      distinction: "This is a framing habit, not evidence of deception. Many high-agreeableness communicators do it unconsciously.",
      action: "Before agreeing to anything from this contact, restate their ask to yourself without the minimiser and price it again.",
    });
  }

  if (d.driftRatio !== null && d.driftRatio >= 3 && d.importance >= 40) {
    risks.push({
      severity: d.driftRatio >= 5 ? "elevated" : "moderate",
      title: "Silence beyond established rhythm",
      detection: `${d.silenceDays}d silent against a ${d.cadenceDays}d median cadence — ${d.driftRatio}× overdue.`,
      meaning: "A contact who kept a stable rhythm for the length of the window and then stopped has changed something. Silence following an established pattern is data, not absence.",
      distinction: "Ordinary causes — travel, workload, a changed address — outnumber adversarial ones. This flag establishes the fact, not the cause.",
      action: `Send a short, non-transactional message. If it goes unanswered past ${Math.round((d.cadenceDays ?? 7) * 2)}d, treat the relationship as lapsed rather than paused.`,
    });
  }

  if (warmEarly !== null && warmLate !== null && warmLate - warmEarly >= 8 && countHits(late.filter((x) => !x.out).map((x) => surfaceOf(x.m)).join(" "), DEAL) >= 2) {
    risks.push({
      severity: "moderate",
      title: "Warmth spike preceding transactional volume",
      detection: `Relational vocabulary rose from ${warmEarly} to ${warmLate} per 1000 tokens in the second half of the window, while transactional terms appeared in the same period.`,
      meaning: "Rising warmth alongside rising deal language is the shape of a relationship being warmed before a request — and it is equally the shape of a working relationship becoming a real one.",
      distinction: "Genuinely ambiguous. The flag exists to make the coincidence visible before the ask lands, not to attribute motive.",
      action: "Note the current state of the relationship now, in writing. If a large request arrives within thirty days, compare it against this baseline rather than against how the relationship feels at that moment.",
    });
  }

  if (inbound.length > 0 && outbound.length === 0) {
    risks.push({
      severity: "moderate",
      title: "Fully unreciprocated inbound",
      detection: `${inbound.length} received, zero sent, across ${windowDays ?? "?"}d.`,
      meaning: "They have addressed you repeatedly with no reply on record. Either this is a broadcast source misclassified as a person, or a real correspondent who is being ignored.",
      distinction: "Bulk share for this contact is " + pct(d.bulkShare) + " — above ~60% argues for automation rather than a person.",
      action: d.bulkShare >= 0.6 ? "Treat as a distribution source and suppress it from the roster." : "This is a person you have not answered. Decide deliberately whether that is the intended posture.",
    });
  }

  // ═══════════════ CONFIDENCE ═══════════════
  const supported = [
    identity.filter((r) => r.value).length,
    behavioral.flatMap((g) => g.rows).filter((r) => r.value).length,
    linguistic.flatMap((g) => g.rows).filter((r) => r.value).length,
    scored.length,
  ].reduce((a, b) => a + b, 0);
  const confidence = insufficient
    ? Math.min(25, supported * 2)
    : Math.min(92, Math.round(confidenceFrom(mail.length, 1.2, 92) * 0.55 + Math.min(40, supported * 1.6)));

  // ═══════════════ SECTION 10 — EXECUTIVE SUMMARY ═══════════════
  const who = buildWho(d, ocean, velocity, mail.length, windowDays);
  const position = power.assessment ?? "Frame cannot be assessed — fewer than two of the three power measures (initiation, latency, length) have enough traffic behind them.";

  const actions: string[] = [];
  for (const t of threads.filter((x) => x.caution).slice(0, 2)) actions.push(`${t.subject} — ${t.action}`);
  const awaitingYou = threads.filter((t) => t.classification === "UNRESOLVED / AWAITING YOU");
  if (awaitingYou.length) actions.push(`${awaitingYou.length} thread(s) are sitting on your reply. Oldest: "${awaitingYou[awaitingYou.length - 1].subject}".`);
  if (frameScore !== null && frameScore <= -0.25 && wordEdge !== null && wordEdge > 0.2) actions.push(`Cut your next reply to this contact by roughly ${Math.min(50, Math.round(wordEdge * 100))}% — you are consistently out-writing them.`);
  if (d.driftRatio !== null && d.driftRatio >= 2.5) actions.push(`Re-open contact. ${d.silenceDays}d of silence against a ${d.cadenceDays}d rhythm is past the point where a message reads as natural.`);
  if (d.unread >= 2) actions.push(`${d.unread} messages from this contact are still unread.`);
  if (!actions.length) actions.push("No corrective action indicated. Current posture is consistent with the observed dynamic.");

  const projection =
    health === null || windowDays === null || windowDays < 14
      ? null
      : `On the ${windowDays}d of traffic observed, exchange frequency runs at ${round(mail.length / Math.max(1, windowDays / 7), 1)} messages per week. If the current trajectory holds, the next contact falls around ${new Date(now + (d.cadenceDays ?? 7) * DAY).toISOString().slice(0, 10)}. Wrong if: the cadence figure is drawn from fewer than three intervals, or the sweep window truncated older traffic.`;

  return {
    generatedAt: now,
    windowDays,
    messagesAnalyzed: mail.length,
    confidence,
    insufficient,
    identity,
    behavioral,
    linguistic,
    ocean,
    oceanSummary,
    power,
    velocity,
    threads,
    engagement,
    risks,
    unavailableChannels: [
      "Voice calls — no Google API exposes a call log. Duration, callback rate and voicemail behaviour have no data source and are not estimated.",
      "SMS — no Google API exposes message content or delivery records for the operator's device.",
      "Document access events — Drive activity for files this contact opened is outside the scopes this module holds.",
    ],
    summary: { who, position, actions, projection },
  };
}

// ─────────────────────────── narrative builders ───────────────────────────

function buildOceanSummary(name: string, ocean: OceanTrait[]): string {
  const g = (t: OceanTrait["trait"]) => ocean.find((x) => x.trait === t)?.score ?? null;
  const o = g("Openness"), c = g("Conscientiousness"), e = g("Extraversion"), a = g("Agreeableness"), n = g("Neuroticism");
  const bits: string[] = [];
  if (o !== null) bits.push(o >= 65 ? "intellectually wide-ranging" : o <= 35 ? "narrow and consistent in focus" : "moderately curious");
  if (c !== null) bits.push(c >= 65 ? "reliable in closing loops" : c <= 35 ? "loose with follow-through" : "adequately organised");
  if (e !== null) bits.push(e >= 65 ? "outward-reaching" : e <= 35 ? "responsive rather than initiating" : "ambiverted");
  if (a !== null) bits.push(a >= 65 ? "accommodating" : a <= 35 ? "self-directed and direct" : "cooperative without deference");
  if (n !== null) bits.push(n >= 65 ? "reactive under pressure" : n <= 35 ? "emotionally steady" : "ordinarily resilient");
  return `${name} reads as ${bits.join(", ")}. Every figure above is derived from observable behaviour — reply timing, initiation, thread structure and lexical rates — not from any clinical instrument. Treat this as a communication-style model, not a psychological assessment of the person.`;
}

function buildWho(
  d: ContactDossier,
  ocean: OceanTrait[],
  velocity: ContactReport["velocity"],
  msgs: number,
  windowDays: number | null,
): string {
  const tierWord: Record<ContactDossier["tier"], string> = {
    inner: "an inner-circle correspondent",
    active: "an active working contact",
    periphery: "a peripheral contact",
    dormant: "a dormant contact",
    archive: "an address-book record with no traffic in the window",
  };
  const scored = ocean.filter((t) => t.score !== null);
  const dominant = scored.slice().sort((a, b) => Math.abs((b.score ?? 50) - 50) - Math.abs((a.score ?? 50) - 50))[0];
  const trait = dominant
    ? ` The strongest single reading is ${dominant.trait} at ${dominant.score}/100, carried by ${dominant.indicators} independent indicator${dominant.indicators === 1 ? "" : "s"}.`
    : " No personality dimension had enough supporting behaviour to score.";
  const health = velocity.health !== null ? ` Relationship health scores ${velocity.health}/100 — ${velocity.trajectory}` : "";
  return `${d.name} is ${tierWord[d.tier]}, importance ${d.importance}/100, observed across ${msgs} message${msgs === 1 ? "" : "s"}${windowDays !== null ? ` over ${windowDays}d` : ""}.${trait}${health}`;
}
