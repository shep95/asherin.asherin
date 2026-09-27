// ═══════════════════════════════════════════════════════════════════════════
// ORGANISATIONAL ANCHOR DERIVATION
//
// Why this file exists.
//
// A contact on a corporate address carries their employer inside the address
// itself: sweep "jane@northwind-logistics.com" and the collection incidentally
// pulls the company's registry filing, leadership page, press and staff
// directory, because every one of those documents contains that domain. The
// operator sees a rich dossier and concludes the engine is strong.
//
// A contact on gmail.com carries none of that. The domain belongs to Google,
// not to the subject, so the whole organisational axis silently disappears —
// and the dossier reads thin for a reason that has nothing to do with how
// public the subject actually is. That asymmetry is the entire explanation for
// "one contact got all their company information and none of the others did."
//
// The org axis is not actually missing for freemail contacts. It is present in
// three places the collector was never shown:
//
//   1. The address-book record — `organization` / `jobTitle` fields.
//   2. The mail graph — the corporate domains of the OTHER parties on threads
//      the subject participates in. A three-way thread between you, the
//      subject and two people at @northwind-logistics.com is a strong
//      statement about where the subject sits, and it is observable from
//      metadata alone.
//   3. Their own listed URLs — a personal site or company page on the record.
//
// This module extracts those anchors and ranks them. It asserts nothing: an
// anchor is a *collection lead*, and downstream every fact it produces is
// still graded and banded exactly like any other.
// ═══════════════════════════════════════════════════════════════════════════

import { parseAddressList, type RawMessage } from "@/components/dashboard/google/modules/contactIntel/messageIntel";

/** Provider domains. Their presence says who hosts the mailbox, not who employs the person. */
const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "hotmail.com",
  "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "mac.com",
  "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.net",
  "mail.com", "yandex.com", "yandex.ru", "zoho.com", "fastmail.com",
  "hey.com", "tutanota.com", "duck.com", "qq.com", "163.com", "126.com",
]);

/**
 * Infrastructure and bulk senders. These co-occur on threads for reasons that
 * have nothing to do with employment, so treating them as an org anchor would
 * send the collector after a mailing-list vendor instead of a company.
 */
const NON_ORG = /(^|\.)(amazonses|sendgrid|mailchimp|mailgun|sparkpostmail|postmarkapp|mandrillapp|salesforce|hubspot|intercom|zendesk|calendly|docusign|dropbox|notion|slack|zoom|atlassian|github|google|apple|microsoft|noreply|no-reply)\./i;

export const isFreemailDomain = (domain: string): boolean =>
  FREEMAIL.has(domain.trim().toLowerCase());

/** Lowercased domain of an address, or null when the string is not one. */
const domainOf = (addr: string): string | null => {
  const at = addr.lastIndexOf("@");
  if (at < 1) return null;
  const d = addr.slice(at + 1).trim().toLowerCase();
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null;
};

/** Host of a URL string, stripped of `www.`. Never throws on malformed input. */
const hostOf = (raw: string): string | null => {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
};

const usable = (domain: string | null): domain is string =>
  !!domain && !isFreemailDomain(domain) && !NON_ORG.test(`${domain}.`) && domain.length >= 4;

export interface OrgAnchor {
  /** The employer name or registrable domain handed to the collector. */
  value: string;
  kind: "domain" | "name";
  /** Where the anchor came from — printed so the operator can discount it. */
  basis: string;
  /** Independent observations supporting it. Drives ordering, not truth. */
  weight: number;
}

export interface AnchorInput {
  /** Every address known for the subject. */
  emails: string[];
  /** Address-book employer string, if any. */
  organization?: string;
  /** URLs listed on the contact record. */
  urls?: string[];
  /** Session mail corpus — used for the co-recipient signal. */
  messages?: RawMessage[];
  /** The operator's own addresses; excluded from the co-recipient tally. */
  ownAddresses?: string[];
}

/**
 * Rank the organisational anchors bound to one subject.
 *
 * Ordering is deliberate and reflects binding strength, not convenience:
 *   corporate address on the subject  >  address-book employer
 *   >  dominant corporate co-recipient domain  >  listed URL host.
 *
 * A co-recipient domain must appear on at least two distinct threads before it
 * is offered. One shared thread with a company is an introduction; two is a
 * working relationship, and only the latter is worth spending a collection
 * pass on.
 */
export function deriveOrgAnchors(input: AnchorInput): OrgAnchor[] {
  const subject = new Set(
    (input.emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean),
  );
  const own = new Set(
    (input.ownAddresses ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean),
  );
  const out: OrgAnchor[] = [];
  const seen = new Set<string>();
  const push = (a: OrgAnchor) => {
    const key = a.value.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(a);
  };

  // 1. The subject's own corporate address — the strongest possible binding,
  //    because the organisation issued the mailbox.
  for (const addr of subject) {
    const d = domainOf(addr);
    if (usable(d)) push({ value: d, kind: "domain", basis: `corporate address ${addr}`, weight: 100 });
  }

  // 2. The address-book employer. Asserted by the record, not observed — so it
  //    ranks below an issued mailbox but above anything inferred from traffic.
  const org = (input.organization ?? "").trim();
  if (org.length >= 3 && org.length <= 80) {
    push({ value: org, kind: "name", basis: "address-book employer field", weight: 80 });
  }

  // 3. Co-recipient domains across shared threads. This is the signal the
  //    operator noticed working on one contact: a three-party thread naming a
  //    company binds the subject to it without the subject's address saying so.
  if (input.messages?.length && subject.size) {
    // threads the subject actually appears on, and the corporate domains of
    // every other human party on them.
    const perDomainThreads = new Map<string, Set<string>>();
    for (const m of input.messages) {
      const parties = [
        ...parseAddressList(m.from),
        ...parseAddressList(m.to),
        ...parseAddressList(m.cc),
      ].map((p) => p.email.trim().toLowerCase()).filter(Boolean);
      if (!parties.some((p) => subject.has(p))) continue;
      // A bulk blast is a distribution list, not a working relationship.
      if (m.isBulk) continue;
      const threadId = String(m.threadId ?? m.id ?? "");
      for (const p of parties) {
        if (subject.has(p) || own.has(p)) continue;
        const d = domainOf(p);
        if (!usable(d)) continue;
        (perDomainThreads.get(d) ?? perDomainThreads.set(d, new Set()).get(d)!).add(threadId);
      }
    }
    const ranked = [...perDomainThreads.entries()]
      .map(([domain, threads]) => ({ domain, threads: threads.size }))
      .filter((r) => r.threads >= 2)
      .sort((a, b) => b.threads - a.threads)
      .slice(0, 2);
    for (const r of ranked) {
      push({
        value: r.domain,
        kind: "domain",
        basis: `co-recipient on ${r.threads} shared threads`,
        weight: 40 + Math.min(r.threads, 20),
      });
    }
  }

  // 4. Listed URLs. Weakest — a link on a contact card can be anything — but
  //    still a real lead when nothing stronger exists.
  for (const u of input.urls ?? []) {
    const h = hostOf(u);
    if (usable(h)) push({ value: h, kind: "domain", basis: `URL on contact record ${h}`, weight: 20 });
  }

  return out.sort((a, b) => b.weight - a.weight).slice(0, 3);
}
