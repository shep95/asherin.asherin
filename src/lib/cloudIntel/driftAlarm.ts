// ═══════════════════════════════════════════════════════════════════════════
// POSTMARK DRIFT ALARM — sender-behaviour baselines and break detection
//
// THE PROBLEM
//
// POSTMARK read every inbound header and graded each message on its own. That
// catches a forged envelope, but it is blind to the single most diagnostic
// signal in mail forensics: a sender who has always come from one network,
// one country and one platform suddenly arriving from somewhere else.
//
// A message from a compromised-but-legitimate account passes SPF, passes DKIM
// and passes DMARC — it IS the real domain — so per-message grading calls it
// clean. What gives it away is that this domain has sent the operator 214
// messages from AS15169 in the United States via Google Workspace, and this
// one came from a residential ASN in another country. That is only visible
// against a baseline, and nothing was keeping one.
//
// WHAT THIS DOES
//
// Builds and maintains a per-sender-domain baseline (networks, countries,
// platforms, mail software, authentication pass rate) and, on every sweep,
// compares the observed traffic against it. A break pushes an alert through
// the existing intel-notify pipeline — the same transport as every other
// Asherin alarm, so it reaches the phone, not just the tab.
//
// DOCTRINE
//   · A baseline needs evidence before it can be broken. Under MIN_SAMPLE
//     messages the domain is in OBSERVATION and can only widen the baseline,
//     never raise an alarm. Alerting on the second-ever message from a sender
//     is how a drift alarm trains its operator to ignore it.
//   · Severity is a function of what broke. A new platform is notable; an
//     authentication downgrade on an established domain is critical.
//   · Every alert carries the baseline it broke, in numbers. "Unusual" is not
//     a finding; "214 prior messages, all AS15169/US, this one AS201814/RU" is.
//   · Idempotent. The alert key is (domain, break-kind, observed-value), so a
//     re-run of the same sweep does not re-notify.
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from "@/integrations/supabase/client";

export interface DriftMessage {
  id: string;
  fromDomain: string | null;
  esp: string | null;
  mailerFamily: string | null;
  spf: string;
  dkim: string;
  dmarc: string;
  originGeo?: { countryCode: string | null; asn: string | null; org: string | null } | null;
  subject?: string;
  date?: string | null;
}

export type BreakKind = "new-network" | "new-country" | "new-platform" | "new-mailer" | "auth-downgrade";

export interface DriftBreak {
  domain: string;
  kind: BreakKind;
  severity: "info" | "notable" | "critical";
  observed: string;
  baseline: string;
  sampleSize: number;
  /** Message ids in this sweep that exhibited the break. */
  messageIds: string[];
  /** One-sentence operator-facing statement, numbers included. */
  statement: string;
}

export interface DriftResult {
  breaks: DriftBreak[];
  domainsTracked: number;
  domainsInObservation: number;
  notified: number;
  error: string | null;
}

/**
 * Messages required before a domain's baseline may raise an alarm.
 *
 * Eight is the point at which "this domain always uses one network" stops
 * being an accident of a small sample. Below it, the baseline still LEARNS —
 * it just cannot accuse.
 */
const MIN_SAMPLE = 8;

/** Baselines older than this are re-established rather than defended. */
const BASELINE_MAX_AGE_DAYS = 180;

interface Baseline {
  domain: string;
  asns: string[];
  countries: string[];
  esps: string[];
  mailers: string[];
  authPassRate: number;
  sampleSize: number;
  establishedAt: string;
}

const uniq = (xs: (string | null | undefined)[]) =>
  [...new Set(xs.map((x) => String(x ?? "").trim()).filter(Boolean))];

const SEVERITY: Record<BreakKind, DriftBreak["severity"]> = {
  "auth-downgrade": "critical",
  "new-network": "critical",
  "new-country": "notable",
  "new-platform": "notable",
  "new-mailer": "info",
};

/**
 * Compare this sweep against stored baselines, raise breaks, then fold the
 * sweep into the baselines.
 *
 * Order matters: comparison happens BEFORE the update, or every observation
 * would instantly become part of its own baseline and nothing could ever
 * break. This is the classic self-erasing-anomaly bug and it is the reason
 * the fold is at the bottom of this function, not inside the loop.
 */
export async function runDriftAlarm(messages: DriftMessage[]): Promise<DriftResult> {
  const empty: DriftResult = { breaks: [], domainsTracked: 0, domainsInObservation: 0, notified: 0, error: null };
  if (!messages.length) return empty;

  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return { ...empty, error: "not_authenticated" };

    // ── Group this sweep by sending domain ────────────────────────────────
    type Observed = {
      asns: Set<string>; countries: Set<string>; esps: Set<string>; mailers: Set<string>;
      authed: number; total: number; ids: string[];
      byAsn: Map<string, string[]>; byCountry: Map<string, string[]>;
      byEsp: Map<string, string[]>; byMailer: Map<string, string[]>;
      unauthedIds: string[];
    };
    const observed = new Map<string, Observed>();

    for (const m of messages) {
      const domain = (m.fromDomain ?? "").toLowerCase().trim();
      if (!domain || domain.length < 4) continue;
      let o = observed.get(domain);
      if (!o) {
        o = {
          asns: new Set(), countries: new Set(), esps: new Set(), mailers: new Set(),
          authed: 0, total: 0, ids: [],
          byAsn: new Map(), byCountry: new Map(), byEsp: new Map(), byMailer: new Map(),
          unauthedIds: [],
        };
        observed.set(domain, o);
      }
      o.total++;
      o.ids.push(m.id);
      const push = (map: Map<string, string[]>, k: string) => {
        const arr = map.get(k) ?? [];
        arr.push(m.id);
        map.set(k, arr);
      };
      const asn = m.originGeo?.asn ?? null;
      const cc = m.originGeo?.countryCode ?? null;
      if (asn) { o.asns.add(asn); push(o.byAsn, asn); }
      if (cc) { o.countries.add(cc); push(o.byCountry, cc); }
      if (m.esp) { o.esps.add(m.esp); push(o.byEsp, m.esp); }
      if (m.mailerFamily) { o.mailers.add(m.mailerFamily); push(o.byMailer, m.mailerFamily); }
      const fully = m.spf === "pass" && m.dkim === "pass" && m.dmarc === "pass";
      if (fully) o.authed++; else o.unauthedIds.push(m.id);
    }

    if (!observed.size) return empty;

    // ── Load stored baselines ─────────────────────────────────────────────
    const domains = [...observed.keys()];
    const { data: rows, error: readErr } = await supabase
      .from("postmark_baselines")
      .select("*")
      .eq("user_id", userId)
      .in("domain", domains);

    if (readErr) return { ...empty, error: readErr.message };

    const baselines = new Map<string, Baseline>();
    for (const r of rows ?? []) {
      baselines.set(r.domain, {
        domain: r.domain,
        asns: Array.isArray(r.asns) ? (r.asns as string[]) : [],
        countries: Array.isArray(r.countries) ? (r.countries as string[]) : [],
        esps: Array.isArray(r.esps) ? (r.esps as string[]) : [],
        mailers: Array.isArray(r.mailers) ? (r.mailers as string[]) : [],
        authPassRate: Number(r.auth_pass_rate ?? 0),
        sampleSize: Number(r.sample_size ?? 0),
        establishedAt: r.established_at,
      });
    }

    // ── Compare ───────────────────────────────────────────────────────────
    const breaks: DriftBreak[] = [];
    let inObservation = 0;

    for (const [domain, o] of observed) {
      const b = baselines.get(domain);
      if (!b || b.sampleSize < MIN_SAMPLE) { inObservation++; continue; }

      const ageDays = (Date.now() - new Date(b.establishedAt).getTime()) / 86_400_000;
      if (ageDays > BASELINE_MAX_AGE_DAYS) { inObservation++; continue; }

      const record = (
        kind: BreakKind,
        value: string,
        baselineText: string,
        ids: string[],
        statement: string,
      ) => {
        breaks.push({
          domain, kind, severity: SEVERITY[kind], observed: value,
          baseline: baselineText, sampleSize: b.sampleSize,
          messageIds: ids.slice(0, 10), statement,
        });
      };

      for (const asn of o.asns) {
        if (b.asns.includes(asn)) continue;
        const ids = o.byAsn.get(asn) ?? [];
        record("new-network", asn, b.asns.join(", ") || "none recorded", ids,
          `${domain} has sent ${b.sampleSize} messages, every one of them from ${b.asns.join(", ") || "an unrecorded network"}. ` +
          `${ids.length} message${ids.length === 1 ? "" : "s"} in this sweep originated on ${asn} instead. Mail that authenticates correctly but ` +
          `arrives from a network the domain has never used before is the signature of a compromised sending account, not of a forgery.`);
      }

      for (const cc of o.countries) {
        if (b.countries.includes(cc)) continue;
        const ids = o.byCountry.get(cc) ?? [];
        record("new-country", cc, b.countries.join(", ") || "none recorded", ids,
          `${domain} has only ever originated in ${b.countries.join(", ") || "an unrecorded country"} across ${b.sampleSize} messages. ` +
          `${ids.length} message${ids.length === 1 ? "" : "s"} in this sweep originated in ${cc}. Travel explains this; so does account takeover — ` +
          `the two are distinguished by whether the platform and network moved with it.`);
      }

      for (const esp of o.esps) {
        if (b.esps.includes(esp)) continue;
        const ids = o.byEsp.get(esp) ?? [];
        record("new-platform", esp, b.esps.join(", ") || "none recorded", ids,
          `${domain} has sent through ${b.esps.join(", ") || "an unrecorded platform"} for its whole recorded history (${b.sampleSize} messages). ` +
          `${ids.length} arrived through ${esp}. A platform change is normally a deliberate migration and will persist; a one-off is not.`);
      }

      for (const mailer of o.mailers) {
        if (b.mailers.includes(mailer)) continue;
        const ids = o.byMailer.get(mailer) ?? [];
        record("new-mailer", mailer, b.mailers.join(", ") || "none recorded", ids,
          `${domain} normally composes with ${b.mailers.join(", ") || "unrecorded software"}; ${ids.length} message${ids.length === 1 ? "" : "s"} ` +
          `in this sweep were composed with ${mailer}. Weak on its own — corroborating only.`);
      }

      // Authentication downgrade. Only meaningful when the baseline was high:
      // a domain that never authenticated cannot downgrade.
      const rate = o.total ? o.authed / o.total : 0;
      if (b.authPassRate >= 0.9 && rate < 0.6 && o.total >= 2) {
        record("auth-downgrade", `${Math.round(rate * 100)}%`, `${Math.round(b.authPassRate * 100)}%`, o.unauthedIds,
          `${domain} authenticated fully on ${Math.round(b.authPassRate * 100)}% of ${b.sampleSize} prior messages. In this sweep only ` +
          `${Math.round(rate * 100)}% of ${o.total} did. An established sender losing SPF/DKIM/DMARC alignment is either a misconfigured ` +
          `migration or somebody sending as them — and the two look identical in the body of the mail.`);
      }
    }

    // ── Fold the sweep into the baselines ─────────────────────────────────
    // Deliberately after the comparison. Weighted mean keeps the pass rate a
    // property of the whole history rather than of the latest batch.
    const now = new Date().toISOString();
    const upserts = [...observed.entries()].map(([domain, o]) => {
      const b = baselines.get(domain);
      const priorN = b?.sampleSize ?? 0;
      const nextN = priorN + o.total;
      const nextRate = nextN
        ? ((b?.authPassRate ?? 0) * priorN + o.authed) / nextN
        : 0;
      return {
        user_id: userId,
        domain,
        asns: uniq([...(b?.asns ?? []), ...o.asns]).slice(0, 40),
        countries: uniq([...(b?.countries ?? []), ...o.countries]).slice(0, 40),
        esps: uniq([...(b?.esps ?? []), ...o.esps]).slice(0, 20),
        mailers: uniq([...(b?.mailers ?? []), ...o.mailers]).slice(0, 20),
        auth_pass_rate: Number(nextRate.toFixed(4)),
        sample_size: Math.min(nextN, 100_000),
        last_confirmed_at: now,
      };
    });

    if (upserts.length) {
      const { error: upErr } = await supabase
        .from("postmark_baselines")
        .upsert(upserts, { onConflict: "user_id,domain" });
      if (upErr) console.warn("[driftAlarm] baseline upsert failed", upErr.message);
    }

    // ── Notify ────────────────────────────────────────────────────────────
    // Only critical and notable breaks reach the device. Informational drift
    // stays on the screen: an alarm that fires on mail-client changes is an
    // alarm the operator turns off, and then the real one never lands.
    const alertable = breaks
      .filter((x) => x.severity !== "info")
      .sort((a, b) => (a.severity === "critical" ? -1 : 1) - (b.severity === "critical" ? -1 : 1))
      .slice(0, 6);

    let notified = 0;
    for (const brk of alertable) {
      try {
        const { error } = await supabase.functions.invoke("intel-notify", {
          body: {
            action: "emit",
            kind: "postmark-drift",
            severity: brk.severity,
            title: `POSTMARK drift — ${brk.domain} (${brk.kind.replace(/-/g, " ")})`,
            body: brk.statement,
            subject_name: brk.domain,
            source: "POSTMARK baseline",
            sections: [
              { label: "Baseline", value: `${brk.baseline} across ${brk.sampleSize} prior messages` },
              { label: "Observed now", value: brk.observed },
              { label: "Messages affected", value: String(brk.messageIds.length) },
            ],
            findings: [brk.statement],
            // Stable across re-runs of the same sweep: the same break on the
            // same domain with the same observed value is one event.
            idempotency_key: `postmark-drift:${brk.domain}:${brk.kind}:${brk.observed}`,
          },
        });
        if (!error) notified++;
      } catch (e) {
        console.warn("[driftAlarm] notify failed", e instanceof Error ? e.message : String(e));
      }
    }

    return {
      breaks: breaks.sort((a, b) =>
        ({ critical: 0, notable: 1, info: 2 })[a.severity] - ({ critical: 0, notable: 1, info: 2 })[b.severity]),
      domainsTracked: observed.size,
      domainsInObservation: inObservation,
      notified,
      error: null,
    };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }
}
