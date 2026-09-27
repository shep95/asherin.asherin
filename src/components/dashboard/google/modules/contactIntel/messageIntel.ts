// ═══════════════════════════════════════════════════════════════════════════
// Contact Intelligence — deterministic message-intelligence engine
//
// Provenance: every number produced here derives from Google People API
// address-book records and Gmail metadata (From/To/Cc/Subject/Date/snippet)
// returned by the `google-data` edge function. Nothing is modelled, inferred
// by an LLM, or seeded. Where the corpus is too thin to support a claim, the
// engine returns `null` and the UI says so rather than printing a false zero.
//
// The psycholinguistic layer is a LIWC-style lexical counter operating over
// subject lines and Gmail snippets — a partial view of each message body. It
// is reported as a *marker* profile with an explicit evidence weight, never as
// a clinical or diagnostic judgement.
// ═══════════════════════════════════════════════════════════════════════════

export interface RawMessage {
  id: string;
  threadId?: string | null;
  from?: string;
  to?: string;
  cc?: string;
  subject?: string;
  date?: string;
  internalDate?: number | null;
  inReplyTo?: string | null;
  isBulk?: boolean;
  snippet?: string;
  labelIds?: string[];
  isUnread?: boolean;
  _account?: string;
}

export interface RawContact {
  resourceName?: string | null;
  name: string;
  givenName?: string;
  familyName?: string;
  nickname?: string;
  email?: string;
  emails?: string[];
  phone?: string;
  phones?: string[];
  photo?: string;
  organization?: string;
  jobTitle?: string;
  bio?: string;
  urls?: string[];
  city?: string;
  region?: string;
  country?: string;
  birthday?: string;
  groups?: string[];
  _account?: string;
  _accounts?: string[];
}

export type Channel = "email" | "phone" | "calendar" | "address-book";

export interface TextPatterns {
  /** Number of messages the pattern block was computed from. */
  sampleSize: number;
  avgSubjectChars: number | null;
  avgSnippetChars: number | null;
  questionRate: number;      // share of messages containing '?'
  exclamationRate: number;
  shoutRate: number;         // share containing a >=3-char ALL-CAPS run
  emojiRate: number;
  linkRate: number;
  greetingRate: number;
  signoffRate: number;
  /** 0-23 counts on the account's local clock. */
  hourHistogram: number[];
  /** 0=Sun .. 6=Sat. */
  dayHistogram: number[];
  /** Hour bucket carrying the most traffic, or null when there is no traffic. */
  peakHour: number | null;
  /** Share of traffic landing outside 08:00-18:00 local. */
  afterHoursShare: number;
  topSubjectTokens: { token: string; count: number }[];
}

export interface PsychProfile {
  /** Total lexical tokens the profile was counted over. */
  tokens: number;
  /** "none" | "thin" | "moderate" | "strong" — how much to trust the block. */
  evidence: "none" | "thin" | "moderate" | "strong";
  /** Per-1000-token rates. */
  dimensions: {
    selfFocus: number;      // I, me, my, mine
    groupFocus: number;     // we, us, our
    otherFocus: number;     // you, your
    positiveAffect: number;
    negativeAffect: number;
    anxiety: number;
    anger: number;
    certainty: number;      // definitely, always, must
    tentativeness: number;  // maybe, perhaps, might
    cognitive: number;      // because, therefore, realize
    social: number;         // team, meet, talk, family
    work: number;
    money: number;
    time: number;
    pastFocus: number;
    presentFocus: number;
    futureFocus: number;
    urgency: number;        // asap, urgent, deadline, immediately
    gratitude: number;
    apology: number;
    formality: number;      // regards, sincerely, kindly, pursuant
    informality: number;    // hey, yeah, lol, gonna
  };
  /** Composite readings, each in 0..100, or null when evidence is "none". */
  composites: {
    warmth: number | null;
    assertiveness: number | null;
    formalityIndex: number | null;
    stressLoad: number | null;
    outwardOrientation: number | null;
  };
  /** Short, evidence-bound observations. Empty when nothing is defensible. */
  markers: string[];
}

export interface ContactDossier {
  key: string;
  name: string;
  emails: string[];
  phones: string[];
  photo: string;
  organization: string;
  jobTitle: string;
  bio: string;
  location: string;
  birthday: string;
  urls: string[];
  channels: Channel[];
  accounts: string[];
  /** Present in the address book, versus discovered purely from traffic. */
  inAddressBook: boolean;

  inbound: number;
  outbound: number;
  total: number;
  threads: number;
  unread: number;
  bulkShare: number;
  firstSeen: number | null;
  lastSeen: number | null;
  tenureDays: number | null;
  /** Median days between consecutive messages; null under 3 messages. */
  cadenceDays: number | null;
  /** Days since last contact. */
  silenceDays: number | null;
  /** silenceDays / cadenceDays — >2 means overdue against their own rhythm. */
  driftRatio: number | null;
  /** Median hours from their inbound to the user's next same-thread outbound. */
  myReplyLatencyHours: number | null;
  /** Median hours from the user's outbound to their next same-thread inbound. */
  theirReplyLatencyHours: number | null;
  /** outbound / total, 0..1. 0.5 is balanced. */
  reciprocity: number | null;

  patterns: TextPatterns;
  psych: PsychProfile;

  /** 0..100 composite importance. Always defined; 0 for address-book-only. */
  importance: number;
  tier: "inner" | "active" | "periphery" | "dormant" | "archive";
  signals: { label: string; kind: "warn" | "ok" | "info" }[];
}

export interface IntelSummary {
  generatedAt: number;
  contactCount: number;
  correspondentCount: number;
  messageCount: number;
  bulkFiltered: number;
  ownAddresses: string[];
  tiers: Record<ContactDossier["tier"], number>;
  /** Global text pattern read across every human message. */
  patterns: TextPatterns;
  psych: PsychProfile;
}

// ─────────────────────────── lexicon ───────────────────────────
// Deliberately small, explicit, and auditable. Every term below is a literal
// string match on a lowercased word token — no stemming, no fuzzy matching,
// so a count can always be traced back to the exact words that produced it.
const LEX: Record<keyof PsychProfile["dimensions"], string[]> = {
  selfFocus: ["i", "me", "my", "mine", "myself", "i'm", "i've", "i'll", "i'd"],
  groupFocus: ["we", "us", "our", "ours", "ourselves", "we're", "we've", "we'll"],
  otherFocus: ["you", "your", "yours", "yourself", "you're", "you've", "you'll"],
  positiveAffect: ["great", "good", "thanks", "thank", "happy", "excited", "love", "awesome", "excellent", "perfect", "glad", "appreciate", "congrats", "congratulations", "wonderful", "nice", "pleased"],
  negativeAffect: ["bad", "issue", "problem", "sorry", "unfortunately", "fail", "failed", "wrong", "error", "concern", "concerned", "disappointed", "difficult", "trouble", "complaint"],
  anxiety: ["worried", "worry", "anxious", "nervous", "afraid", "stress", "stressed", "panic", "uncertain", "risk", "fear"],
  anger: ["angry", "upset", "frustrated", "frustrating", "unacceptable", "ridiculous", "furious", "annoyed", "outrageous"],
  certainty: ["definitely", "certainly", "always", "never", "must", "will", "absolutely", "guaranteed", "clearly", "obviously", "sure", "confirmed"],
  tentativeness: ["maybe", "perhaps", "might", "possibly", "probably", "seems", "guess", "somewhat", "could", "unsure", "hopefully"],
  cognitive: ["because", "therefore", "think", "realize", "understand", "consider", "reason", "however", "although", "analysis", "conclude"],
  social: ["team", "meeting", "meet", "talk", "call", "family", "friend", "together", "group", "everyone", "colleague", "partner"],
  work: ["project", "deadline", "client", "report", "invoice", "contract", "proposal", "meeting", "task", "review", "deliverable", "office", "business"],
  money: ["payment", "invoice", "price", "cost", "paid", "refund", "billing", "budget", "charge", "fee", "dollars", "$", "subscription", "receipt"],
  time: ["today", "tomorrow", "yesterday", "week", "month", "monday", "tuesday", "wednesday", "thursday", "friday", "morning", "evening", "tonight", "schedule"],
  pastFocus: ["was", "were", "had", "did", "yesterday", "previously", "earlier", "last", "ago", "been"],
  presentFocus: ["is", "am", "are", "now", "today", "currently", "happening", "here"],
  futureFocus: ["will", "tomorrow", "soon", "next", "upcoming", "plan", "planning", "future", "shall", "later"],
  urgency: ["asap", "urgent", "urgently", "immediately", "deadline", "critical", "emergency", "now", "today", "rush", "priority", "overdue"],
  gratitude: ["thanks", "thank", "grateful", "appreciate", "appreciated", "cheers"],
  apology: ["sorry", "apologies", "apologize", "regret", "excuse"],
  formality: ["regards", "sincerely", "kindly", "pursuant", "hereby", "respectfully", "dear", "cordially", "attached", "please", "furthermore"],
  informality: ["hey", "yeah", "yep", "nope", "lol", "gonna", "wanna", "cool", "ok", "okay", "sup", "haha", "btw"],
};

const DIM_KEYS = Object.keys(LEX) as (keyof PsychProfile["dimensions"])[];

const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with", "at", "by",
  "from", "re", "fwd", "your", "you", "is", "are", "it", "this", "that", "we", "i", "my",
  "our", "be", "as", "was", "has", "have", "will", "can", "not", "no", "if", "so", "do",
  "new", "get", "now", "all", "out", "up", "about", "please", "thanks", "hi", "hello",
]);

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
const SHOUT = /\b[A-Z]{3,}\b/;
const GREETING = /^\s*(hi|hey|hello|dear|good\s+(morning|afternoon|evening)|greetings)\b/i;
const SIGNOFF = /\b(regards|sincerely|cheers|best|thanks again|talk soon|sent from)\b/i;
const LINK = /https?:\/\//i;

// ─────────────────────────── parsing ───────────────────────────

/** Extract every `name <addr>` / bare-addr pair from an RFC 5322 header list. */
export function parseAddressList(header?: string): { name: string; email: string }[] {
  if (!header) return [];
  const out: { name: string; email: string }[] = [];
  // Split on commas that are not inside quotes — quoted display names legally
  // contain commas ("Newton, Asher" <a@b.c>) and naively splitting corrupts them.
  const parts: string[] = [];
  let buf = "";
  let quoted = false;
  for (const ch of header) {
    if (ch === '"') quoted = !quoted;
    if (ch === "," && !quoted) { parts.push(buf); buf = ""; continue; }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf);

  for (const part of parts) {
    const angled = part.match(/<([^>]+)>/);
    const email = (angled ? angled[1] : part).trim().replace(/^["']|["']$/g, "").toLowerCase();
    if (!email.includes("@")) continue;
    const name = angled
      ? part.slice(0, angled.index).trim().replace(/^["']|["']$/g, "")
      : "";
    out.push({ name: name || email.split("@")[0], email });
  }
  return out;
}

function tsOf(m: RawMessage): number | null {
  if (typeof m.internalDate === "number" && m.internalDate > 0) return m.internalDate;
  const parsed = Date.parse(m.date || "");
  return Number.isFinite(parsed) ? parsed : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function round(n: number, places = 1): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function normPhone(p: string): string {
  return String(p).replace(/\D/g, "").slice(-10);
}

// ─────────────────────── pattern + psych counters ───────────────────────

interface Accum {
  n: number;
  subjectChars: number;
  snippetChars: number;
  question: number;
  exclam: number;
  shout: number;
  emoji: number;
  link: number;
  greeting: number;
  signoff: number;
  hours: number[];
  days: number[];
  afterHours: number;
  tokenCounts: Map<string, number>;
  dims: Record<string, number>;
  tokens: number;
}

function newAccum(): Accum {
  return {
    n: 0, subjectChars: 0, snippetChars: 0, question: 0, exclam: 0, shout: 0,
    emoji: 0, link: 0, greeting: 0, signoff: 0,
    hours: new Array(24).fill(0), days: new Array(7).fill(0), afterHours: 0,
    tokenCounts: new Map(), dims: Object.fromEntries(DIM_KEYS.map((k) => [k, 0])), tokens: 0,
  };
}

function feed(acc: Accum, m: RawMessage) {
  const subject = m.subject || "";
  const snippet = m.snippet || "";
  const text = `${subject} ${snippet}`;
  acc.n++;
  acc.subjectChars += subject.length;
  acc.snippetChars += snippet.length;
  if (text.includes("?")) acc.question++;
  if (text.includes("!")) acc.exclam++;
  if (SHOUT.test(text)) acc.shout++;
  if (EMOJI.test(text)) acc.emoji++;
  if (LINK.test(text)) acc.link++;
  if (GREETING.test(snippet)) acc.greeting++;
  if (SIGNOFF.test(snippet)) acc.signoff++;

  const ts = tsOf(m);
  if (ts !== null) {
    const d = new Date(ts);
    const h = d.getHours();
    acc.hours[h]++;
    acc.days[d.getDay()]++;
    if (h < 8 || h >= 18) acc.afterHours++;
  }

  // Lexical pass. Apostrophes are kept so "i'm" and "you've" stay countable.
  const words = text.toLowerCase().match(/[a-z$][a-z'$]*/g) || [];
  acc.tokens += words.length;
  const wordSet = words;
  for (const key of DIM_KEYS) {
    const list = LEX[key];
    let hits = 0;
    for (const w of wordSet) if (list.includes(w)) hits++;
    acc.dims[key] += hits;
  }

  for (const w of (subject.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || [])) {
    if (STOP.has(w)) continue;
    acc.tokenCounts.set(w, (acc.tokenCounts.get(w) || 0) + 1);
  }
}

function toPatterns(acc: Accum): TextPatterns {
  const n = acc.n;
  const rate = (x: number) => (n ? round(x / n, 3) : 0);
  const peak = n ? acc.hours.indexOf(Math.max(...acc.hours)) : -1;
  return {
    sampleSize: n,
    avgSubjectChars: n ? round(acc.subjectChars / n, 0) : null,
    avgSnippetChars: n ? round(acc.snippetChars / n, 0) : null,
    questionRate: rate(acc.question),
    exclamationRate: rate(acc.exclam),
    shoutRate: rate(acc.shout),
    emojiRate: rate(acc.emoji),
    linkRate: rate(acc.link),
    greetingRate: rate(acc.greeting),
    signoffRate: rate(acc.signoff),
    hourHistogram: acc.hours,
    dayHistogram: acc.days,
    peakHour: peak >= 0 && acc.hours[peak] > 0 ? peak : null,
    afterHoursShare: rate(acc.afterHours),
    topSubjectTokens: [...acc.tokenCounts.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([token, count]) => ({ token, count })),
  };
}

function toPsych(acc: Accum): PsychProfile {
  const t = acc.tokens;
  const per1k = (x: number) => (t ? round((x / t) * 1000, 1) : 0);
  const dims = Object.fromEntries(
    DIM_KEYS.map((k) => [k, per1k(acc.dims[k])]),
  ) as PsychProfile["dimensions"];

  const evidence: PsychProfile["evidence"] =
    t === 0 ? "none" : t < 120 ? "thin" : t < 600 ? "moderate" : "strong";

  // Composites are ratios of counted rates, clamped to 0..100. They are only
  // emitted once there is any lexical mass at all; below that they are null
  // rather than a misleading 50.
  const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
  const ratio = (a: number, b: number) => (a + b === 0 ? null : a / (a + b));

  const warmthR = ratio(dims.positiveAffect + dims.gratitude, dims.negativeAffect + dims.anger);
  const assertR = ratio(dims.certainty, dims.tentativeness);
  const formalR = ratio(dims.formality, dims.informality);
  const stressR = ratio(dims.anxiety + dims.urgency + dims.anger, dims.positiveAffect + dims.certainty);
  const outwardR = ratio(dims.otherFocus + dims.groupFocus, dims.selfFocus);

  const composites = {
    warmth: evidence === "none" || warmthR === null ? null : clamp(warmthR * 100),
    assertiveness: evidence === "none" || assertR === null ? null : clamp(assertR * 100),
    formalityIndex: evidence === "none" || formalR === null ? null : clamp(formalR * 100),
    stressLoad: evidence === "none" || stressR === null ? null : clamp(stressR * 100),
    outwardOrientation: evidence === "none" || outwardR === null ? null : clamp(outwardR * 100),
  };

  const markers: string[] = [];
  if (evidence !== "none" && evidence !== "thin") {
    if (composites.stressLoad !== null && composites.stressLoad >= 65)
      markers.push(`Elevated pressure vocabulary — urgency/anxiety terms outweigh positive and certainty terms (${composites.stressLoad}/100).`);
    if (composites.warmth !== null && composites.warmth >= 75)
      markers.push(`Warm register — gratitude and positive affect dominate the lexicon (${composites.warmth}/100).`);
    if (composites.warmth !== null && composites.warmth <= 30)
      markers.push(`Cool or transactional register — negative and problem-framing terms lead (${composites.warmth}/100).`);
    if (composites.assertiveness !== null && composites.assertiveness >= 75)
      markers.push(`High-certainty phrasing — commits in absolutes rather than hedges (${composites.assertiveness}/100).`);
    if (composites.assertiveness !== null && composites.assertiveness <= 30)
      markers.push(`Hedged phrasing — leans on tentative language over commitment (${composites.assertiveness}/100).`);
    if (composites.formalityIndex !== null && composites.formalityIndex >= 75)
      markers.push(`Formal correspondence style — salutations and closings are consistently present.`);
    if (composites.formalityIndex !== null && composites.formalityIndex <= 25)
      markers.push(`Casual correspondence style — conversational register throughout.`);
    if (composites.outwardOrientation !== null && composites.outwardOrientation <= 30)
      markers.push(`Self-referential focus — first-person singular outweighs second-person and collective pronouns.`);
    if (dims.money >= 8) markers.push(`Financial vocabulary is a persistent thread in this correspondence.`);
    if (dims.futureFocus > dims.pastFocus * 1.6) markers.push(`Forward-oriented — planning language exceeds retrospective language.`);
    else if (dims.pastFocus > dims.futureFocus * 1.6) markers.push(`Retrospective — recounting language exceeds planning language.`);
  }

  return { tokens: t, evidence, dimensions: dims, composites, markers };
}

// ─────────────────────────── main build ───────────────────────────

export interface BuildInput {
  contacts: RawContact[];
  messages: RawMessage[];
  /** Every address the user owns, so direction can be resolved truthfully. */
  ownAddresses: string[];
  /** Attendee emails harvested from calendar, to mark a calendar channel. */
  calendarAttendees?: string[];
}

export function buildContactIntel(input: BuildInput): { dossiers: ContactDossier[]; summary: IntelSummary } {
  const own = new Set(input.ownAddresses.map((a) => a.toLowerCase().trim()).filter(Boolean));
  const calAttendees = new Set((input.calendarAttendees || []).map((a) => a.toLowerCase().trim()));

  // ── index: address -> dossier key, so one human with three addresses is
  // one dossier and never three. Address-book records seed the index first
  // so traffic folds into a known identity rather than minting a new one.
  const keyOf = new Map<string, string>();
  const records = new Map<string, ContactDossier>();
  const accums = new Map<string, Accum>();
  // Per-key thread ledger for latency: threadId -> ordered [dir, ts] events.
  const threadLog = new Map<string, Map<string, { dir: "in" | "out"; ts: number }[]>>();
  const stampLog = new Map<string, number[]>();

  const blank = (key: string, name: string): ContactDossier => ({
    key, name, emails: [], phones: [], photo: "", organization: "", jobTitle: "",
    bio: "", location: "", birthday: "", urls: [], channels: [], accounts: [],
    inAddressBook: false,
    inbound: 0, outbound: 0, total: 0, threads: 0, unread: 0, bulkShare: 0,
    firstSeen: null, lastSeen: null, tenureDays: null, cadenceDays: null,
    silenceDays: null, driftRatio: null, myReplyLatencyHours: null,
    theirReplyLatencyHours: null, reciprocity: null,
    patterns: toPatterns(newAccum()), psych: toPsych(newAccum()),
    importance: 0, tier: "archive", signals: [],
  });

  // 1. Seed from the address book. Every contact matters — none are dropped
  //    for lack of traffic; they land in the "archive" tier with their
  //    channels intact and are still searchable and exportable.
  for (const c of input.contacts) {
    const emails = Array.from(new Set([...(c.emails || []), c.email].filter(Boolean).map((e) => String(e).toLowerCase().trim())));
    const phones = Array.from(new Set([...(c.phones || []), c.phone].filter(Boolean).map(String)));
    const key = emails[0] ? `e:${emails[0]}` : phones[0] ? `p:${normPhone(phones[0])}` : `n:${c.resourceName || c.name}`;
    const d = records.get(key) ?? blank(key, c.name || emails[0] || phones[0] || "Unknown");
    d.name = c.name && c.name !== "Unknown" ? c.name : d.name;
    d.emails = Array.from(new Set([...d.emails, ...emails]));
    d.phones = Array.from(new Set([...d.phones, ...phones]));
    d.photo ||= c.photo || "";
    d.organization ||= c.organization || "";
    d.jobTitle ||= c.jobTitle || "";
    d.bio ||= c.bio || "";
    d.birthday ||= c.birthday || "";
    d.location ||= [c.city, c.region, c.country].filter(Boolean).join(", ");
    d.urls = Array.from(new Set([...d.urls, ...(c.urls || [])]));
    d.accounts = Array.from(new Set([...d.accounts, ...(c._accounts || (c._account ? [c._account] : []))]));
    d.inAddressBook = true;
    records.set(key, d);
    for (const e of emails) keyOf.set(e, key);
  }

  // 2. Fold traffic. Direction is decided by whether the From address is one
  //    the user owns — not by inbox labels, which lie on self-sent threads.
  let bulkFiltered = 0;
  const seenThreadsPerKey = new Map<string, Set<string>>();

  for (const m of input.messages) {
    const ts = tsOf(m);
    const froms = parseAddressList(m.from);
    const tos = [...parseAddressList(m.to), ...parseAddressList(m.cc)];
    const sender = froms[0];
    if (!sender) continue;

    const outbound = own.has(sender.email);
    // Counterparties: on an outbound message the recipients are the humans;
    // on an inbound message the sender is. Recipients that are the user's own
    // addresses are dropped so the user never becomes their own contact.
    const parties = (outbound ? tos : [sender]).filter((p) => !own.has(p.email));
    if (!parties.length) continue;
    if (m.isBulk) bulkFiltered++;

    for (const p of parties) {
      const key = keyOf.get(p.email) ?? `e:${p.email}`;
      keyOf.set(p.email, key);
      const d = records.get(key) ?? blank(key, p.name || p.email);
      if (!records.has(key)) records.set(key, d);
      if (!d.emails.includes(p.email)) d.emails.push(p.email);
      if ((d.name === "Unknown" || d.name === p.email) && p.name) d.name = p.name;
      if (m._account && !d.accounts.includes(m._account)) d.accounts.push(m._account);

      d.total++;
      if (outbound) d.outbound++; else d.inbound++;
      if (m.isUnread && !outbound) d.unread++;
      if (m.isBulk) d.bulkShare++;

      if (ts !== null) {
        d.firstSeen = d.firstSeen === null ? ts : Math.min(d.firstSeen, ts);
        d.lastSeen = d.lastSeen === null ? ts : Math.max(d.lastSeen, ts);
        const stamps = stampLog.get(key) ?? [];
        stamps.push(ts);
        stampLog.set(key, stamps);

        if (m.threadId) {
          const perKey = threadLog.get(key) ?? new Map();
          const evs = perKey.get(m.threadId) ?? [];
          evs.push({ dir: outbound ? "out" : "in", ts });
          perKey.set(m.threadId, evs);
          threadLog.set(key, perKey);
          const seen = seenThreadsPerKey.get(key) ?? new Set();
          seen.add(m.threadId);
          seenThreadsPerKey.set(key, seen);
        }
      }

      // Bulk mail is excluded from the psycholinguistic corpus: a newsletter's
      // vocabulary is the marketer's, not the correspondent's, and including
      // it would swamp a real human's profile with template language.
      if (!m.isBulk) {
        const acc = accums.get(key) ?? newAccum();
        feed(acc, m);
        accums.set(key, acc);
      }
    }
  }

  // 3. Derive per-contact metrics.
  const now = Date.now();
  const DAY = 86_400_000;

  for (const [key, d] of records) {
    const acc = accums.get(key) ?? newAccum();
    d.patterns = toPatterns(acc);
    d.psych = toPsych(acc);
    d.threads = seenThreadsPerKey.get(key)?.size ?? 0;
    d.bulkShare = d.total ? round(d.bulkShare / d.total, 2) : 0;
    d.reciprocity = d.total ? round(d.outbound / d.total, 2) : null;

    if (d.firstSeen !== null && d.lastSeen !== null) {
      d.tenureDays = Math.max(0, Math.round((d.lastSeen - d.firstSeen) / DAY));
      d.silenceDays = Math.max(0, Math.round((now - d.lastSeen) / DAY));
    }

    const stamps = (stampLog.get(key) ?? []).sort((a, b) => a - b);
    if (stamps.length >= 3) {
      const gaps: number[] = [];
      for (let i = 1; i < stamps.length; i++) gaps.push((stamps[i] - stamps[i - 1]) / DAY);
      const med = median(gaps);
      d.cadenceDays = med === null ? null : round(med, 1);
      if (d.cadenceDays !== null && d.cadenceDays > 0 && d.silenceDays !== null) {
        d.driftRatio = round(d.silenceDays / d.cadenceDays, 2);
      }
    }

    // Reply latency, measured only inside a shared thread. A reply that never
    // came is not counted as a huge latency — it is simply absent, and the
    // silence shows up in driftRatio instead.
    const mine: number[] = [];
    const theirs: number[] = [];
    for (const evs of (threadLog.get(key) ?? new Map()).values()) {
      evs.sort((a, b) => a.ts - b.ts);
      for (let i = 1; i < evs.length; i++) {
        const prev = evs[i - 1], cur = evs[i];
        if (prev.dir === cur.dir) continue;
        const hours = (cur.ts - prev.ts) / 3_600_000;
        if (hours < 0 || hours > 24 * 30) continue; // ignore thread necromancy
        if (cur.dir === "out") mine.push(hours); else theirs.push(hours);
      }
    }
    const mm = median(mine), tm = median(theirs);
    d.myReplyLatencyHours = mm === null ? null : round(mm, 1);
    d.theirReplyLatencyHours = tm === null ? null : round(tm, 1);

    // Channels present, in evidence order.
    const ch: Channel[] = [];
    if (d.total > 0) ch.push("email");
    if (d.phones.length) ch.push("phone");
    if (d.emails.some((e) => calAttendees.has(e))) ch.push("calendar");
    if (d.inAddressBook) ch.push("address-book");
    d.channels = ch;

    // ── Importance. Weighted so that scarce, reciprocal, recent, multi-channel
    // contact outranks raw volume — a hundred one-way notifications must never
    // outrank ten real exchanges.
    const volume = Math.min(1, d.total / 25) * 22;
    const twoWay = d.inbound > 0 && d.outbound > 0 ? 20 : d.total > 0 ? 6 : 0;
    const balance = d.reciprocity === null ? 0 : (1 - Math.abs(0.5 - d.reciprocity) * 2) * 12;
    const recency = d.silenceDays === null ? 0 : Math.max(0, 1 - d.silenceDays / 180) * 18;
    const threadDepth = Math.min(1, d.threads / 8) * 10;
    const multi = Math.min(3, ch.length) / 3 * 10;
    const identity = (d.inAddressBook ? 4 : 0) + (d.organization ? 2 : 0) + (d.phones.length ? 2 : 0);
    const bulkPenalty = d.bulkShare * 18;
    d.importance = Math.max(0, Math.min(100, Math.round(
      volume + twoWay + balance + recency + threadDepth + multi + identity - bulkPenalty,
    )));

    d.tier =
      d.importance >= 70 ? "inner"
      : d.importance >= 45 ? "active"
      : d.importance >= 22 ? "periphery"
      : d.total > 0 ? "dormant"
      : "archive";

    // ── Signals: each one is a statement the data can defend.
    const sig = d.signals;
    if (d.driftRatio !== null && d.driftRatio >= 2.5 && d.importance >= 40)
      sig.push({ label: `Overdue — ${d.silenceDays}d silent against a ${d.cadenceDays}d rhythm.`, kind: "warn" });
    if (d.inbound > 0 && d.outbound === 0 && !d.bulkShare)
      sig.push({ label: `One-way inbound — ${d.inbound} received, none sent.`, kind: "warn" });
    if (d.outbound > 0 && d.inbound === 0)
      sig.push({ label: `One-way outbound — ${d.outbound} sent, no reply on record.`, kind: "warn" });
    if (d.unread >= 3) sig.push({ label: `${d.unread} unread from this contact.`, kind: "warn" });
    if (d.theirReplyLatencyHours !== null && d.myReplyLatencyHours !== null) {
      if (d.myReplyLatencyHours > d.theirReplyLatencyHours * 2.5)
        sig.push({ label: `You reply ${round(d.myReplyLatencyHours / Math.max(0.1, d.theirReplyLatencyHours), 1)}× slower than they do.`, kind: "info" });
      else if (d.theirReplyLatencyHours > d.myReplyLatencyHours * 2.5)
        sig.push({ label: `They reply ${round(d.theirReplyLatencyHours / Math.max(0.1, d.myReplyLatencyHours), 1)}× slower than you do.`, kind: "info" });
    }
    if (d.patterns.afterHoursShare >= 0.5 && d.patterns.sampleSize >= 4)
      sig.push({ label: `${Math.round(d.patterns.afterHoursShare * 100)}% of this thread lands outside working hours.`, kind: "info" });
    if (d.bulkShare >= 0.6)
      sig.push({ label: `Predominantly bulk/list mail — excluded from language profiling.`, kind: "info" });
    if (d.tier === "inner" && d.silenceDays !== null && d.silenceDays <= 7)
      sig.push({ label: `Inner circle, currently active.`, kind: "ok" });
    for (const marker of d.psych.markers.slice(0, 2)) sig.push({ label: marker, kind: "info" });
  }

  const dossiers = [...records.values()].sort((a, b) =>
    b.importance - a.importance || (b.lastSeen ?? 0) - (a.lastSeen ?? 0) || a.name.localeCompare(b.name),
  );

  // Global read across every non-bulk human message.
  const globalAcc = newAccum();
  for (const m of input.messages) if (!m.isBulk) feed(globalAcc, m);

  const tiers: Record<ContactDossier["tier"], number> = {
    inner: 0, active: 0, periphery: 0, dormant: 0, archive: 0,
  };
  for (const d of dossiers) tiers[d.tier]++;

  return {
    dossiers,
    summary: {
      generatedAt: now,
      contactCount: dossiers.length,
      correspondentCount: dossiers.filter((d) => d.total > 0).length,
      messageCount: input.messages.length,
      bulkFiltered,
      ownAddresses: [...own],
      tiers,
      patterns: toPatterns(globalAcc),
      psych: toPsych(globalAcc),
    },
  };
}
