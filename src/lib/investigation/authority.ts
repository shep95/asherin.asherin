/**
 * Source authority ranking.
 *
 * Authority is a property of the publisher, not of where a result landed in a
 * search. Search rank is stored on the source row for display and is never
 * read here — that separation is the whole point of this module.
 *
 * Tier 1 official record  · a filing, registry entry, court docket, regulator
 * Tier 2 primary-adjacent · the subject's own official publication, academia,
 *                           an archived capture of a tier 1/2 page
 * Tier 3 reported         · established news, trade press, encyclopedias
 * Tier 4 self-published   · blogs, forums, social accounts, aggregators
 * Tier 5 unattributed     · no identifiable publisher
 */

import type { AuthorityTier, Source, SourceType } from "./types";

interface HostRule {
  test: RegExp;
  tier: AuthorityTier;
  type: SourceType;
  reason: string;
}

/** Ordered: the first match wins, so specific rules precede generic suffixes. */
const HOST_RULES: HostRule[] = [
  {
    test: /(^|\.)sec\.gov$/i,
    tier: 1,
    type: "official_filing",
    reason: "sec edgar — statutory filing by the company itself",
  },
  {
    test: /(^|\.)companieshouse\.gov\.uk$|(^|\.)find-and-update\.company-information\.service\.gov\.uk$/i,
    tier: 1,
    type: "government_registry",
    reason: "companies house — statutory uk company register",
  },
  {
    test: /(^|\.)courtlistener\.com$|(^|\.)pacer\.gov$|(^|\.)uscourts\.gov$/i,
    tier: 1,
    type: "court_record",
    reason: "court docket record",
  },
  {
    test: /(^|\.)europa\.eu$|(^|\.)eur-lex\.europa\.eu$/i,
    tier: 1,
    type: "regulatory",
    reason: "eu institutional publication",
  },
  { test: /\.gov$|\.gov\.[a-z]{2}$|\.mil$/i, tier: 1, type: "government_registry", reason: "government domain" },
  { test: /(^|\.)opencorporates\.com$/i, tier: 2, type: "government_registry", reason: "registry mirror — derived from official filings, not the filing itself" },
  { test: /(^|\.)archive\.org$|(^|\.)web\.archive\.org$/i, tier: 2, type: "archive", reason: "archived capture — authority follows the captured page" },
  { test: /\.edu$|(^|\.)doi\.org$|(^|\.)arxiv\.org$|(^|\.)pubmed\.ncbi\.nlm\.nih\.gov$/i, tier: 2, type: "academic", reason: "academic publication" },
  { test: /(^|\.)wikipedia\.org$|(^|\.)wikidata\.org$/i, tier: 3, type: "encyclopedia", reason: "encyclopedia — secondary summary, cites elsewhere" },
  {
    test: /(^|\.)(reuters|apnews|bloomberg|ft|wsj|nytimes|bbc|theguardian|economist|cnbc|axios|politico)\.com$|(^|\.)bbc\.co\.uk$/i,
    tier: 3,
    type: "news",
    reason: "established newsroom with a corrections policy",
  },
  { test: /(^|\.)(techcrunch|theverge|wired|arstechnica|crunchbase|pitchbook)\.com$/i, tier: 3, type: "trade_press", reason: "trade press" },
  { test: /(^|\.)(x|twitter|facebook|instagram|tiktok|linkedin|threads)\.com$/i, tier: 4, type: "social_media", reason: "social account — self-published, unverified" },
  { test: /(^|\.)(reddit|quora|ycombinator|4chan|discord)\.com$|news\.ycombinator\.com$/i, tier: 4, type: "forum", reason: "forum post — unverified" },
  { test: /(^|\.)(medium|substack|blogspot|wordpress|tumblr)\.com$/i, tier: 4, type: "blog", reason: "self-published blog" },
];

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

export interface AuthorityVerdict {
  tier: AuthorityTier;
  sourceType: SourceType;
  reason: string;
}

/**
 * Classifies a source from its url alone. `subjectDomains` lets the caller say
 * "this host is the subject's own site", which is primary for what the subject
 * asserts about itself and nothing more.
 */
export function classifySource(url: string | null, subjectDomains: string[] = []): AuthorityVerdict {
  const host = hostOf(url);
  if (!host) {
    return { tier: 5, sourceType: "unknown", reason: "no resolvable publisher for this reference" };
  }
  for (const rule of HOST_RULES) {
    if (rule.test.test(host)) return { tier: rule.tier, sourceType: rule.type, reason: rule.reason };
  }
  const owned = subjectDomains.some((d) => {
    const dh = d.replace(/^www\./i, "").toLowerCase();
    return dh && (host === dh || host.endsWith(`.${dh}`));
  });
  if (owned) {
    return {
      tier: 2,
      sourceType: "company_official",
      reason: "the subject's own site — primary for self-description, not for third-party claims",
    };
  }
  return { tier: 4, sourceType: "web_page", reason: "general web page — publisher not independently established" };
}

/** A user-supplied document is primary for its own contents and nothing else. */
export function documentAuthority(): AuthorityVerdict {
  return {
    tier: 2,
    sourceType: "user_document",
    reason: "operator-supplied document — primary for what the document says",
  };
}

export const TIER_LABEL: Record<AuthorityTier, string> = {
  1: "official record",
  2: "primary-adjacent",
  3: "reported",
  4: "self-published",
  5: "unattributed",
};

/** Lower tier number wins. Returns the stronger of two tiers. */
export function strongerTier(a: AuthorityTier | null, b: AuthorityTier | null): AuthorityTier | null {
  if (a === null) return b;
  if (b === null) return a;
  return (a <= b ? a : b) as AuthorityTier;
}

export function sortByAuthority<T extends { authorityTier: AuthorityTier }>(rows: T[]): T[] {
  return [...rows].sort((x, y) => x.authorityTier - y.authorityTier);
}

/** Two sources count as independent when their publishers differ. */
export function countIndependentPublishers(sources: Source[]): number {
  const keys = new Set<string>();
  for (const s of sources) {
    keys.add(hostOf(s.url) ?? (s.publisher || s.title || s.id).toLowerCase());
  }
  return keys.size;
}
