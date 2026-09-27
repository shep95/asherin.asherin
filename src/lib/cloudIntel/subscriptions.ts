// ─────────────────────────────────────────────────────────────────────────────
// RECURRENCE ENGINE — subscription and spend reconstruction from receipt mail.
//
// The prior module counted emails. Counting emails answers "how much mail did
// billing send me", which nobody asked. The question is: what am I paying, to
// whom, how often, and what renews next. That requires parsing the money out of
// the message, folding messages into merchants, and proving periodicity before
// claiming a subscription exists.
// ─────────────────────────────────────────────────────────────────────────────

import { median, mad, confidenceFrom, relativeDay, fmtMoney, round } from "./logic";

export interface ReceiptMail {
  id: string;
  from?: string;
  subject?: string;
  snippet?: string;
  date?: string;
  internalDate?: number | null;
}

export interface Charge {
  id: string;
  merchant: string;
  domain: string;
  amountCents: number | null;
  currency: string;
  ts: number;
  subject: string;
  /** Which of the receipt shapes matched — kept so any figure is traceable. */
  evidence: string;
}

export type Cadence = "weekly" | "monthly" | "quarterly" | "annual" | "irregular" | "one-off";

export interface MerchantLedger {
  merchant: string;
  domain: string;
  charges: Charge[];
  currency: string;
  /** Typical charge, median so a single annual upgrade cannot skew it. */
  typicalCents: number | null;
  totalObservedCents: number;
  cadence: Cadence;
  /** Median days between charges. */
  intervalDays: number | null;
  /** Jitter in the interval — low jitter is what proves a subscription. */
  intervalJitterDays: number | null;
  firstSeen: number;
  lastSeen: number;
  /** Projected next charge, only emitted for proven periodic merchants. */
  nextChargeAt: number | null;
  monthlyRunRateCents: number | null;
  annualRunRateCents: number | null;
  confidence: number;
  /** True when the last expected charge never arrived. */
  lapsed: boolean;
  /** True when the typical amount stepped up on the most recent charge. */
  priceIncrease: { fromCents: number; toCents: number; at: number } | null;
}

const CURRENCY_SIGNS: Record<string, string> = {
  "$": "USD", "£": "GBP", "€": "EUR", "¥": "JPY", "₹": "INR", "A$": "AUD", "C$": "CAD",
};

// Ordered most-specific first. A receipt states its total in one of a small
// number of shapes; matching them explicitly beats a greedy "any number" grab
// that would happily return an order number or a year.
const AMOUNT_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /(?:total|amount\s*(?:due|paid|charged)?|charged|paid|payment\s*of|you\s*paid|grand\s*total)\D{0,14}([$£€¥₹]|A\$|C\$|USD|GBP|EUR|CAD|AUD)\s?([\d,]+(?:\.\d{2})?)/i, label: "labelled total" },
  { re: /([$£€¥₹]|A\$|C\$)\s?([\d,]+\.\d{2})\b/, label: "currency-prefixed decimal" },
  { re: /\b(USD|GBP|EUR|CAD|AUD)\s?([\d,]+(?:\.\d{2})?)/i, label: "ISO-coded amount" },
];

const NOISE_SUBJECT = /(price\s+drop|deal|sale|% off|newsletter|unsubscribe|survey|welcome to|verify your)/i;

/** Pull the merchant out of the From header, preferring the display name. */
function merchantOf(from: string): { merchant: string; domain: string } {
  const domain = (from.match(/@([^\s>]+)/)?.[1] || "").toLowerCase().replace(/^(mail|email|no-?reply|billing|receipts?|notifications?)\./, "");
  const display = from.replace(/<.*>/, "").replace(/["']/g, "").trim();
  const root = domain.split(".").slice(-2).join(".");
  const pretty =
    display && !display.includes("@") && display.length > 1
      ? display.replace(/\s*(billing|receipts?|no-?reply|support|team|notifications?)\s*$/i, "").trim()
      : root.split(".")[0];
  return {
    merchant: (pretty || root || "unknown").replace(/\b\w/g, (c) => c.toUpperCase()),
    domain: root || "unknown",
  };
}

export function parseCharge(mail: ReceiptMail): Charge | null {
  const from = mail.from || "";
  const subject = mail.subject || "";
  const text = `${subject} ${mail.snippet || ""}`;
  if (NOISE_SUBJECT.test(subject)) return null;

  const ts = mail.internalDate || (mail.date ? Date.parse(mail.date) : NaN);
  if (!Number.isFinite(ts)) return null;

  let amountCents: number | null = null;
  let currency = "USD";
  let evidence = "no amount located in subject or preview";

  for (const p of AMOUNT_PATTERNS) {
    const m = text.match(p.re);
    if (!m) continue;
    const sign = (m[1] || "").trim();
    const raw = Number((m[2] || "").replace(/,/g, ""));
    if (!Number.isFinite(raw) || raw <= 0 || raw > 1_000_000) continue;
    amountCents = Math.round(raw * 100);
    currency = CURRENCY_SIGNS[sign] || sign.toUpperCase() || "USD";
    evidence = `${p.label}: “${m[0].trim()}”`;
    break;
  }

  const { merchant, domain } = merchantOf(from);
  return { id: mail.id, merchant, domain, amountCents, currency, ts, subject, evidence };
}

function classifyCadence(intervalDays: number | null, jitter: number | null, count: number): Cadence {
  if (count < 2 || intervalDays == null) return "one-off";
  const tolerant = (target: number, slack: number) =>
    Math.abs(intervalDays - target) <= slack && (jitter ?? 0) <= slack;
  if (tolerant(7, 2)) return "weekly";
  if (tolerant(30.4, 5)) return "monthly";
  if (tolerant(91.3, 12)) return "quarterly";
  if (tolerant(365.25, 30)) return "annual";
  return "irregular";
}

export function buildLedgers(mails: ReceiptMail[]): MerchantLedger[] {
  const charges = mails.map(parseCharge).filter((c): c is Charge => !!c);
  const byDomain = new Map<string, Charge[]>();
  for (const c of charges) {
    if (!byDomain.has(c.domain)) byDomain.set(c.domain, []);
    byDomain.get(c.domain)!.push(c);
  }

  const ledgers: MerchantLedger[] = [];
  for (const [domain, list] of byDomain) {
    list.sort((a, b) => a.ts - b.ts);
    const priced = list.filter((c) => c.amountCents != null);
    const amounts = priced.map((c) => c.amountCents!);
    const gaps: number[] = [];
    for (let i = 1; i < list.length; i++) gaps.push((list[i].ts - list[i - 1].ts) / 86400000);

    const intervalDays = gaps.length ? round(median(gaps), 1) : null;
    const jitter = gaps.length > 1 ? round(mad(gaps), 1) : null;
    const cadence = classifyCadence(intervalDays, jitter, list.length);
    const typical = amounts.length ? Math.round(median(amounts)) : null;
    const last = list[list.length - 1];

    const periodic = cadence !== "one-off" && cadence !== "irregular";
    const nextChargeAt = periodic && intervalDays ? last.ts + intervalDays * 86400000 : null;

    // A charge is "lapsed" when the projected date has passed by more than the
    // observed jitter plus a three-day settlement grace.
    const lapsed =
      !!nextChargeAt && Date.now() > nextChargeAt + ((jitter ?? 2) + 3) * 86400000;

    const perMonth =
      typical == null || intervalDays == null || !periodic
        ? null
        : Math.round((typical * 30.44) / intervalDays);

    // Price step detection: the last charge sits materially above the median of
    // everything before it.
    let priceIncrease: MerchantLedger["priceIncrease"] = null;
    if (priced.length >= 3) {
      const prior = priced.slice(0, -1).map((c) => c.amountCents!);
      const priorMedian = median(prior);
      const latest = priced[priced.length - 1].amountCents!;
      if (priorMedian > 0 && latest > priorMedian * 1.08) {
        priceIncrease = { fromCents: Math.round(priorMedian), toCents: latest, at: priced[priced.length - 1].ts };
      }
    }

    const effectZ = jitter != null && intervalDays ? Math.max(0, 3 - (jitter / (intervalDays * 0.12))) : 0.5;

    ledgers.push({
      merchant: list[list.length - 1].merchant,
      domain,
      charges: list,
      currency: priced[0]?.currency || "USD",
      typicalCents: typical,
      totalObservedCents: amounts.reduce((a, b) => a + b, 0),
      cadence,
      intervalDays,
      intervalJitterDays: jitter,
      firstSeen: list[0].ts,
      lastSeen: last.ts,
      nextChargeAt,
      monthlyRunRateCents: perMonth,
      annualRunRateCents: perMonth == null ? null : perMonth * 12,
      confidence: confidenceFrom(list.length, effectZ, periodic ? 92 : 60),
      lapsed,
      priceIncrease,
    });
  }

  return ledgers.sort(
    (a, b) => (b.monthlyRunRateCents ?? 0) - (a.monthlyRunRateCents ?? 0) || b.lastSeen - a.lastSeen
  );
}

export interface SpendSummary {
  monthlyCents: number;
  annualCents: number;
  activeCount: number;
  lapsedCount: number;
  unpricedCount: number;
  currency: string;
  /** Merchants renewing inside the next 30 days, soonest first. */
  upcoming: { ledger: MerchantLedger; inDays: number }[];
}

export function summarizeSpend(ledgers: MerchantLedger[]): SpendSummary {
  const active = ledgers.filter((l) => !l.lapsed && l.monthlyRunRateCents != null);
  const monthly = active.reduce((a, l) => a + (l.monthlyRunRateCents ?? 0), 0);
  const upcoming = ledgers
    .filter((l) => l.nextChargeAt && !l.lapsed)
    .map((l) => ({ ledger: l, inDays: Math.round((l.nextChargeAt! - Date.now()) / 86400000) }))
    .filter((u) => u.inDays >= 0 && u.inDays <= 30)
    .sort((a, b) => a.inDays - b.inDays);

  return {
    monthlyCents: monthly,
    annualCents: monthly * 12,
    activeCount: active.length,
    lapsedCount: ledgers.filter((l) => l.lapsed).length,
    unpricedCount: ledgers.filter((l) => l.typicalCents == null).length,
    currency: ledgers[0]?.currency || "USD",
    upcoming,
  };
}

export const describeLedger = (l: MerchantLedger): string => {
  const price = l.typicalCents != null ? fmtMoney(l.typicalCents, l.currency) : "amount not stated in preview";
  const cadence =
    l.cadence === "one-off"
      ? "single observed charge"
      : `${l.cadence}${l.intervalDays ? ` (~${l.intervalDays}d, ±${l.intervalJitterDays ?? 0}d)` : ""}`;
  return `${price} · ${cadence} · last seen ${relativeDay(l.lastSeen)}`;
};
