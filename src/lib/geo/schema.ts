/**
 * Entity schema builders.
 *
 * Pure functions returning schema.org JSON-LD. Shared by the runtime head
 * layer (src/components/RouteSeo.tsx) and the build-time prerender
 * (scripts/seoPrerenderPlugin.ts) so a crawler that executes JS and one that
 * does not see byte-identical structured data.
 *
 * Rule for this file: everything emitted must be true of the live product and
 * visible on the page it describes. No FAQ nodes for FAQs the reader cannot
 * see, no competitor comparison properties, no invented feature counts.
 *
 * No DOM, no browser globals: this file is imported under Node during build.
 */

import { ORIGIN, DEFAULT_OG_IMAGE, type SeoEntry } from "../routeSeoData";

type Json = Record<string, unknown>;

/** Independently resolvable web presences for the asherin entity. */
export const ORG_SAME_AS: string[] = ["https://www.asherin.com"];

export const ORG_ID = `${ORIGIN}/#organization`;
export const SITE_ID = `${ORIGIN}/#website`;
export const APP_ID = `${ORIGIN}/#software`;
export const ACATALEPSY_APP_ID = `${ORIGIN}/asherin.acatalepsy#software`;

export function buildOrganization(): Json {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: "Asherin",
    url: ORIGIN,
    logo: { "@type": "ImageObject", url: `${ORIGIN}/favicon.png` },
    founder: { "@type": "Person", name: "Asher Newton" },
    ...(ORG_SAME_AS.length ? { sameAs: ORG_SAME_AS } : {}),
    description:
      "asherin is a sourced research workspace: chat, asherin.cyber, asherin.defender, asherin.arvision, asherin.eye, notes, files and an encrypted vault, with the option to bring your own model key.",
  };
}

export function buildWebSite(): Json {
  return {
    "@type": "WebSite",
    "@id": SITE_ID,
    name: "Asherin",
    url: ORIGIN,
    publisher: { "@id": ORG_ID },
    inLanguage: "en-US",
  };
}

/**
 * SoftwareApplication. featureList carries only surfaces a signed-in
 * operator can open today.
 */
export function buildSoftwareApplication(): Json {
  return {
    "@type": "SoftwareApplication",
    "@id": APP_ID,
    name: "Asherin",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web browser",
    url: ORIGIN,
    publisher: { "@id": ORG_ID },
    featureList: [
       "Chat",
       "asherin.cyber",
       "asherin.defender",
       "asherin.arvision",
       "asherin.eye",
      "Library",
      "Projects",
      "Memory",
      "Guardian Vault",
      "Whiteboard",
      "Connect",
      "Team",
    ],
  };
}

export function buildAcatalepsyApplication(): Json {
  return {
    "@type": "SoftwareApplication",
    "@id": ACATALEPSY_APP_ID,
    name: "asherin.acatalepsy",
    applicationCategory: "DataVisualizationApplication",
    operatingSystem: "Web browser",
    url: `${ORIGIN}/asherin.acatalepsy`,
    publisher: { "@id": ORG_ID },
    description: "a no-login browser workspace that uses deterministic rules to profile uploaded data and select evidence-supported visualizations without ai processing.",
    featureList: ["Local file parsing", "Deterministic data profiling", "Rule-based visualization selection", "Local chart export", "Session-only data"],
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" },
  };
}

function buildMainEntity(pathname: string, entry: SeoEntry): Json {
  const canonical = `${ORIGIN}${pathname}`;
  const isArticle = entry.ogType === "article" && Boolean(entry.datePublished);
  const dateModified = entry.dateModified ?? entry.datePublished;

  const base: Json = {
    "@id": `${canonical}#page`,
    url: canonical,
    name: entry.title,
    description: entry.description,
    isPartOf: { "@id": SITE_ID },
    publisher: { "@id": ORG_ID },
    inLanguage: "en-US",
    ...(dateModified ? { dateModified } : {}),
  };

  if (isArticle) {
    return {
      ...base,
      "@type": "BlogPosting",
      headline: entry.title,
      datePublished: entry.datePublished,
      author: { "@type": "Person", name: "Asher Newton" },
      image: DEFAULT_OG_IMAGE,
      mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    };
  }

  return { ...base, "@type": "WebPage" };
}

/**
 * Full @graph for a route. The homepage and /pricing carry the
 * SoftwareApplication node with the real offers; every route carries the page
 * node linked to the sitewide Organization and WebSite.
 */
export function buildRouteGraph(pathname: string, entry: SeoEntry): Json {
  const graph: Json[] = [buildMainEntity(pathname, entry)];
  if (pathname === "/" || pathname === "/software") {
    graph.push(buildSoftwareApplication());
  }
  if (pathname === "/asherin.acatalepsy") graph.push(buildAcatalepsyApplication());
  return { "@context": "https://schema.org", "@graph": graph };
}
