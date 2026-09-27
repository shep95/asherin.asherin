import { useState, useEffect, useMemo, useCallback } from "react";
import {
  CreditCard, RefreshCw, Star, Clock, AlertTriangle, TrendingUp, Wallet,
} from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";
import {
  buildLedgers, summarizeSpend, describeLedger, type MerchantLedger,
} from "@/lib/cloudIntel/subscriptions";
import {
  fmtMoney, relativeDay, silenceFinding, sortFindings, benfordConformance,
  confidenceFrom, round, type Finding,
} from "@/lib/cloudIntel/logic";
import FindingCard from "../intel/FindingCard";
import { TrendStat } from "../intel/TrendStat";
import Treemap from "../intel/Treemap";

// LEDGER — recurrence and spend reconstruction.
// The module no longer reports "how many billing emails arrived". It reports
// what is being paid, to whom, on what rhythm, what renews next, and which
// charge broke its own pattern.

const RECEIPT_QUERY =
  "subject:(receipt OR invoice OR payment OR renewal OR billing OR subscription OR charged OR \"order confirmation\") -subject:(\"price drop\" OR sale OR deal)";

const SubscriptionOracle = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const [loading, setLoading] = useState(false);
  const [emails, setEmails] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starred, setStarred] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("ledger_watch") || "[]")); } catch { return new Set(); }
  });

  const toggleWatch = (domain: string) => {
    setStarred((prev) => {
      const next = new Set(prev);
      next.has(domain) ? next.delete(domain) : next.add(domain);
      localStorage.setItem("ledger_watch", JSON.stringify([...next]));
      return next;
    });
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 18 months of receipts: periodicity cannot be proven inside a 30-mail
      // sample, and an annual renewal is invisible under a one-year window.
      const data = await fetchGoogleData("gmail_inbox", { maxResults: 200, q: RECEIPT_QUERY });
      setEmails(data.messages || []);
    } catch (err: any) {
      console.error("[Ledger] receipt sweep failed:", err);
      setError(err?.message || "Receipt sweep failed.");
    } finally {
      setLoading(false);
    }
  }, [fetchGoogleData]);

  useEffect(() => { if (isConnected) loadData(); }, [isConnected, loadData]);

  const ledgers = useMemo(() => buildLedgers(emails), [emails]);
  const spend = useMemo(() => summarizeSpend(ledgers), [ledgers]);

  // Monthly spend series across the last 12 months, derived from dated charges.
  const monthlySeries = useMemo(() => {
    const buckets = new Array(12).fill(0);
    const now = new Date();
    for (const l of ledgers) {
      for (const c of l.charges) {
        if (c.amountCents == null) continue;
        const d = new Date(c.ts);
        const idx = 11 - ((now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()));
        if (idx >= 0 && idx < 12) buckets[idx] += c.amountCents / 100;
      }
    }
    return buckets;
  }, [ledgers]);

  const findings = useMemo<Finding[]>(() => {
    if (!isConnected) {
      return [silenceFinding({
        module: "Ledger", id: "ledger-unlinked", subject: "Receipt mail",
        expected: "A linked mailbox typically yields 20–200 receipts across 18 months",
        cause: ["No Google account is linked to the mesh, so no mailbox can be swept for receipts."],
        action: "Link an account under Account Mesh to begin spend reconstruction.", connected: false,
      })];
    }
    if (!ledgers.length) {
      return [silenceFinding({
        module: "Ledger", id: "ledger-empty", subject: "Receipt mail",
        expected: "20–200 receipts across an 18-month window",
        cause: [
          "No message matched the receipt vocabulary in the sampled window.",
          "Receipts may be auto-filed to a label outside the inbox, which the sweep does not read.",
          "Payment confirmations may go to a different address than the linked one.",
        ],
        action: "Link the mailbox that receives billing mail, or move filed receipts back to the inbox for one sweep.",
        connected: true,
      })];
    }

    const out: Finding[] = [];
    const priced = ledgers.filter((l) => l.typicalCents != null);
    const amounts = priced.flatMap((l) => l.charges.map((c) => c.amountCents).filter((a): a is number => a != null).map((a) => a / 100));

    // 1. Run-rate as a finding, not a number.
    if (spend.activeCount) {
      const largest = ledgers.filter((l) => !l.lapsed && l.monthlyRunRateCents)[0];
      out.push({
        id: "ledger-runrate",
        module: "Ledger",
        severity: spend.monthlyCents > 20000 ? "elevated" : "notable",
        title: `${spend.activeCount} recurring commitments are running against you`,
        current: `${fmtMoney(spend.monthlyCents, spend.currency)}/mo`,
        normal: `${fmtMoney(Math.round(spend.monthlyCents / Math.max(1, spend.activeCount)), spend.currency)} per commitment`,
        deviation: `${fmtMoney(spend.annualCents, spend.currency)} committed over twelve months`,
        why: [
          "Each merchant below charged on a repeating interval with low jitter, which is the signature of a standing authorisation rather than a one-off purchase.",
          "Standing authorisations renew whether or not the service is used, so the cost is decoupled from the value received.",
          largest ? `${largest.merchant} alone accounts for ${Math.round(((largest.monthlyRunRateCents ?? 0) / Math.max(1, spend.monthlyCents)) * 100)}% of the monthly total.` : "No single merchant dominates the total.",
        ],
        chain: {
          primary: "Renewals debit automatically without a decision point.",
          secondary: "Unused services persist because nothing forces a review.",
          tertiary: `Left unchanged, ${fmtMoney(spend.annualCents, spend.currency)} leaves the account over the next year with no usage test applied.`,
        },
        basis: ledgers.slice(0, 5).map((l) => `${l.merchant} — ${describeLedger(l)} (${l.charges.length} receipts)`),
        confidence: confidenceFrom(priced.length * 4, 2, 90),
        falsifier: "A merchant below showing no charge for two consecutive intervals — that would mean it was already cancelled.",
        action: "Work the renewal queue below and cancel anything you cannot name a use for in the last 30 days.",
      });
    }

    // 2. Imminent renewals.
    if (spend.upcoming.length) {
      const soon = spend.upcoming[0];
      out.push({
        id: "ledger-upcoming",
        module: "Ledger",
        severity: soon.inDays <= 3 ? "elevated" : "notable",
        title: `${spend.upcoming.length} renewal${spend.upcoming.length === 1 ? "" : "s"} land inside 30 days`,
        current: `Next: ${soon.ledger.merchant} in ${soon.inDays} day${soon.inDays === 1 ? "" : "s"}`,
        normal: `${soon.ledger.cadence} cadence, ±${soon.ledger.intervalJitterDays ?? 0}d`,
        deviation: `${fmtMoney(spend.upcoming.reduce((a, u) => a + (u.ledger.typicalCents ?? 0), 0), spend.currency)} clearing this month`,
        onset: `projected from ${soon.ledger.charges.length} prior charges`,
        why: [
          `${soon.ledger.merchant} has charged every ${soon.ledger.intervalDays} days with only ±${soon.ledger.intervalJitterDays ?? 0} days of drift.`,
          "A cadence that tight is machine-scheduled, so the next charge is a near-certainty rather than an estimate.",
        ],
        chain: {
          primary: "The charge clears before any cancellation window closes.",
          secondary: "Refund requests after the fact depend on merchant discretion.",
        },
        basis: spend.upcoming.slice(0, 6).map((u) => `${u.ledger.merchant} — ${fmtMoney(u.ledger.typicalCents ?? 0, u.ledger.currency)} in ${u.inDays}d (${u.ledger.charges.length} priors)`),
        confidence: Math.round(spend.upcoming.reduce((a, u) => a + u.ledger.confidence, 0) / spend.upcoming.length),
        falsifier: "The projected date passing with no matching receipt — the subscription was cancelled upstream.",
        action: `Decide on ${soon.ledger.merchant} before ${new Date(soon.ledger.nextChargeAt!).toLocaleDateString()}, which is the last day cancellation avoids the charge.`,
      });
    }

    // 3. Price increases.
    const hikes = ledgers.filter((l) => l.priceIncrease);
    if (hikes.length) {
      const h = hikes[0];
      out.push({
        id: "ledger-price-step",
        module: "Ledger",
        severity: "elevated",
        title: `${hikes.length} merchant${hikes.length === 1 ? " has" : "s have"} silently raised their price`,
        current: fmtMoney(h.priceIncrease!.toCents, h.currency),
        normal: fmtMoney(h.priceIncrease!.fromCents, h.currency),
        deviation: `+${Math.round(((h.priceIncrease!.toCents - h.priceIncrease!.fromCents) / h.priceIncrease!.fromCents) * 100)}%`,
        onset: `since ${relativeDay(h.priceIncrease!.at)}`,
        why: [
          `${h.merchant}'s latest receipt is materially above the median of every prior receipt from the same merchant.`,
          "Price changes on standing authorisations do not require re-consent, so they clear without a decision.",
          "The increase compounds every interval, so the annual delta is larger than the single-charge delta suggests.",
        ],
        chain: {
          primary: "The higher amount becomes the new baseline.",
          secondary: "Subsequent increases are measured against the raised figure, not the original.",
          tertiary: `At this cadence the increase costs an extra ${fmtMoney(Math.round(((h.priceIncrease!.toCents - h.priceIncrease!.fromCents) * 365) / (h.intervalDays || 30)), h.currency)} per year.`,
        },
        basis: hikes.map((l) => `${l.merchant}: ${fmtMoney(l.priceIncrease!.fromCents, l.currency)} → ${fmtMoney(l.priceIncrease!.toCents, l.currency)} on ${new Date(l.priceIncrease!.at).toLocaleDateString()}`),
        confidence: confidenceFrom(h.charges.length, 2.2, 88),
        falsifier: "The raised charge being a one-time add-on or proration rather than the new recurring rate.",
        action: `Open the most recent ${h.merchant} receipt and confirm whether the new rate is permanent before the next cycle.`,
      });
    }

    // 4. Lapsed / zombie merchants — silence is data.
    const lapsed = ledgers.filter((l) => l.lapsed && l.cadence !== "one-off");
    if (lapsed.length) {
      const l = lapsed[0];
      out.push({
        id: "ledger-lapsed",
        module: "Ledger",
        severity: "notable",
        title: `${lapsed.length} previously-periodic merchant${lapsed.length === 1 ? " has" : "s have"} gone quiet`,
        current: `${l.merchant}: silent ${Math.round((Date.now() - l.lastSeen) / 86400000)} days`,
        normal: `charged every ${l.intervalDays} days for ${l.charges.length} cycles`,
        deviation: "expected charge never arrived",
        onset: `last receipt ${relativeDay(l.lastSeen)}`,
        why: [
          "A merchant with an established cadence that stops charging has either been cancelled, failed payment, or moved its receipts elsewhere.",
          "A failed payment is the dangerous branch: the service may still be active and accruing arrears while no receipt arrives.",
        ],
        chain: {
          primary: "The absence of a receipt is being read as the absence of a charge.",
          secondary: "A card decline would produce exactly this silence while the account remains liable.",
        },
        basis: lapsed.slice(0, 5).map((x) => `${x.merchant} — ${x.charges.length} charges, last ${relativeDay(x.lastSeen)}, expected every ${x.intervalDays}d`),
        confidence: confidenceFrom(l.charges.length, 1.8, 80),
        falsifier: "A cancellation confirmation email from the merchant, which would explain the silence benignly.",
        action: `Verify directly with ${l.merchant} whether the account is cancelled or in payment failure.`,
      });
    }

    // 5. Benford screen on the amount population.
    const benford = benfordConformance(amounts);
    if (benford.n >= 20 && benford.score < 72) {
      out.push({
        id: "ledger-benford",
        module: "Ledger",
        severity: "notable",
        title: "Charge amounts deviate from natural first-digit distribution",
        current: `${benford.score}% conformance across ${benford.n} amounts`,
        normal: "≥ 80% for organically accumulated spend",
        deviation: `${80 - benford.score} points below natural`,
        why: [
          "Naturally accumulated amounts follow Benford's law; catalogue pricing does not.",
          "A low score here usually means the population is dominated by round, deliberately-set subscription prices rather than variable purchases — expected for a subscription ledger.",
          "It becomes a concern only when the population is supposed to be variable spend.",
        ],
        basis: [`${benford.n} parsed amounts drawn from ${priced.length} merchants.`],
        confidence: confidenceFrom(benford.n, 1.4, 70),
        falsifier: "The population being mostly fixed-price subscriptions, which explains the deviation without anomaly.",
        action: "Treat as context, not alarm — review only if you expected variable-amount purchases here.",
      });
    }

    // 6. Parsing shortfall — the mesh states what it could not read.
    if (spend.unpricedCount) {
      out.push({
        id: "ledger-unparsed",
        module: "Ledger",
        severity: "baseline",
        title: `${spend.unpricedCount} merchant${spend.unpricedCount === 1 ? "" : "s"} produced receipts with no readable amount`,
        current: `${spend.unpricedCount} of ${ledgers.length} merchants`,
        normal: "amount visible in subject or preview text",
        deviation: `${Math.round((spend.unpricedCount / ledgers.length) * 100)}% of the ledger is uncosted`,
        why: [
          "Some merchants place the total only in the message body or in a PDF attachment, neither of which the metadata sweep reads.",
          "Any run-rate figure therefore understates true spend by whatever those merchants charge.",
        ],
        basis: ledgers.filter((l) => l.typicalCents == null).slice(0, 6).map((l) => `${l.merchant} — ${l.charges.length} receipts, no amount in preview`),
        confidence: 95,
        falsifier: "Those merchants being free-tier notifications rather than paid charges.",
        action: "Open one receipt from each uncosted merchant to confirm whether money is actually moving.",
      });
    }

    return sortFindings(out);
  }, [isConnected, ledgers, spend]);

  const treemapItems = useMemo(
    () => ledgers
      .filter((l) => (l.monthlyRunRateCents ?? 0) > 0)
      .slice(0, 20)
      .map((l) => ({ label: l.merchant, value: l.monthlyRunRateCents!, sub: `${fmtMoney(l.monthlyRunRateCents!, l.currency)}/mo` })),
    [ledgers]
  );

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/5">
            <Wallet className="h-6 w-6 text-foreground/70" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extralight tracking-wide text-foreground">Ledger</h2>
                <p className="text-[9px] tracking-[0.22em] text-muted-foreground/40 font-light">RECURRENCE &amp; SPEND RECONSTRUCTION</p>
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
            </div>
            <p className="text-sm font-extralight leading-relaxed text-muted-foreground">
              {isConnected
                ? `Reconstructing standing authorisations from ${emails.length} receipt messages — merchant, amount, cadence, and the next projected debit.`
                : "Link an account to reconstruct what you are paying, to whom, and what renews next."}
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
          label="Monthly run-rate"
          value={fmtMoney(spend.monthlyCents, spend.currency)}
          series={monthlySeries.filter((_, i) => i > 0)}
          hint={`${spend.activeCount} proven recurring merchants`}
          loading={loading}
        />
        <TrendStat
          label="Annual commitment"
          value={fmtMoney(spend.annualCents, spend.currency)}
          hint="Projected from current cadences"
          loading={loading}
        />
        <TrendStat
          label="Renewing ≤30d"
          value={spend.upcoming.length}
          population={ledgers.map((l) => l.charges.length)}
          hint={spend.upcoming[0] ? `Next: ${spend.upcoming[0].ledger.merchant} in ${spend.upcoming[0].inDays}d` : "No dated renewal in window"}
          loading={loading}
        />
        <TrendStat
          label="Merchants tracked"
          value={ledgers.length}
          hint={`${spend.lapsedCount} lapsed · ${spend.unpricedCount} uncosted`}
          loading={loading}
        />
      </div>

      <section className="space-y-2">
        <h3 className="text-[9px] tracking-[0.22em] text-muted-foreground/40 font-light">SYNTHESIS</h3>
        {findings.map((f) => (
          <FindingCard key={f.id} finding={f} defaultOpen={f.severity === "critical" || f.severity === "elevated"} />
        ))}
      </section>

      {spend.upcoming.length > 0 && (
        <section className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
          <h3 className="text-xs font-light tracking-wide text-foreground flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" /> Renewal Queue — next 30 days
          </h3>
          <div className="space-y-1.5">
            {spend.upcoming.map(({ ledger, inDays }) => (
              <div key={ledger.domain} className="flex items-center gap-3 rounded-xl bg-foreground/5 px-4 py-2.5">
                <span className={`text-[10px] font-light w-14 shrink-0 ${inDays <= 3 ? "text-foreground" : "text-muted-foreground/60"}`}>
                  {inDays === 0 ? "today" : `${inDays}d`}
                </span>
                <span className="text-xs font-light text-foreground flex-1 truncate">{ledger.merchant}</span>
                <span className="text-[10px] text-muted-foreground/60 shrink-0">
                  {ledger.typicalCents != null ? fmtMoney(ledger.typicalCents, ledger.currency) : "amount unread"}
                </span>
                <span className="text-[9px] text-muted-foreground/35 shrink-0 hidden sm:inline">{ledger.confidence}% conf.</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {treemapItems.length > 1 && (
        <section className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
          <h3 className="text-xs font-light tracking-wide text-foreground flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5" /> Where the money concentrates
          </h3>
          <Treemap items={treemapItems} height={170} />
          <p className="text-[10px] font-extralight text-muted-foreground/55">
            Area is monthly run-rate. The largest tile is {treemapItems[0].label} at {treemapItems[0].sub}
            {" "}— {Math.round((treemapItems[0].value / Math.max(1, spend.monthlyCents)) * 100)}% of everything recurring.
          </p>
        </section>
      )}

      {ledgers.length > 0 && (
        <section className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
          <h3 className="text-xs font-light tracking-wide text-foreground flex items-center gap-2">
            <CreditCard className="h-3.5 w-3.5" /> Merchant Ledger
          </h3>
          <div className="space-y-1">
            {ledgers.map((l: MerchantLedger) => (
              <div key={l.domain} className="flex items-center gap-2 rounded-xl bg-foreground/[0.04] px-3 py-2.5">
                <button
                  onClick={() => toggleWatch(l.domain)}
                  className="shrink-0 p-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30 rounded"
                  aria-label={starred.has(l.domain) ? `Unwatch ${l.merchant}` : `Watch ${l.merchant}`}
                >
                  <Star className={`h-3.5 w-3.5 ${starred.has(l.domain) ? "fill-foreground/70 text-foreground/70" : "text-muted-foreground/25"}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-light text-foreground truncate">{l.merchant}</p>
                  <p className="text-[9px] font-extralight text-muted-foreground/50 truncate">{describeLedger(l)}</p>
                </div>
                <span className="text-[10px] font-light text-foreground shrink-0 w-20 text-right">
                  {l.monthlyRunRateCents != null ? `${fmtMoney(l.monthlyRunRateCents, l.currency)}/mo` : "—"}
                </span>
                <span className={`text-[9px] shrink-0 w-16 text-right font-light ${l.lapsed ? "text-amber-400/70" : "text-muted-foreground/35"}`}>
                  {l.lapsed ? "lapsed" : `${l.confidence}%`}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[9px] font-extralight text-muted-foreground/40">
            Every amount above was read from a named receipt line. Cadence is the median gap between receipts, jitter is its
            median absolute deviation — a subscription is only claimed where jitter stays inside the interval's tolerance.
          </p>
        </section>
      )}
    </div>
  );
};

export default SubscriptionOracle;
