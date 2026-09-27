import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { ORIGIN, DEFAULT_OG_IMAGE, ROUTE_SEO as SEO, SKIP_PREFIXES, type SeoEntry } from "@/lib/routeSeoData";
import { buildRouteGraph } from "@/lib/geo/schema";

/**
 * Centralized per-route SEO (runtime layer).
 * Updates <title>, meta description, canonical, og:* on every route change.
 * The same map is baked into static HTML at build time by scripts/seoPrerenderPlugin.ts.
 */

const JSONLD_ID = "route-seo-jsonld";

function upsertMeta(selector: string, attr: string, value: string, build: () => HTMLElement) {
  let el = document.head.querySelector(selector) as HTMLElement | null;
  if (!el) {
    el = build();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

function removeMeta(selector: string) {
  document.head.querySelector(selector)?.remove();
}

function applySeo(entry: SeoEntry, path: string) {
  document.title = entry.title;

  upsertMeta('meta[name="description"]', "content", entry.description, () => {
    const m = document.createElement("meta");
    m.setAttribute("name", "description");
    return m;
  });

  const canonical = `${ORIGIN}${path}`;
  upsertMeta('link[rel="canonical"]', "href", canonical, () => {
    const l = document.createElement("link");
    l.setAttribute("rel", "canonical");
    return l;
  });

  upsertMeta('meta[property="og:title"]', "content", entry.title, () => {
    const m = document.createElement("meta");
    m.setAttribute("property", "og:title");
    return m;
  });
  upsertMeta('meta[property="og:description"]', "content", entry.description, () => {
    const m = document.createElement("meta");
    m.setAttribute("property", "og:description");
    return m;
  });
  upsertMeta('meta[property="og:url"]', "content", canonical, () => {
    const m = document.createElement("meta");
    m.setAttribute("property", "og:url");
    return m;
  });
  upsertMeta('meta[property="og:type"]', "content", entry.ogType ?? "website", () => {
    const m = document.createElement("meta");
    m.setAttribute("property", "og:type");
    return m;
  });

  // Twitter
  upsertMeta('meta[name="twitter:card"]', "content", "summary_large_image", () => {
    const m = document.createElement("meta");
    m.setAttribute("name", "twitter:card");
    return m;
  });
  upsertMeta('meta[name="twitter:title"]', "content", entry.title, () => {
    const m = document.createElement("meta");
    m.setAttribute("name", "twitter:title");
    return m;
  });
  upsertMeta('meta[name="twitter:description"]', "content", entry.description, () => {
    const m = document.createElement("meta");
    m.setAttribute("name", "twitter:description");
    return m;
  });

  // og:image + twitter:image — parity with index.html landing page
  upsertMeta('meta[property="og:image"]', "content", DEFAULT_OG_IMAGE, () => {
    const m = document.createElement("meta");
    m.setAttribute("property", "og:image");
    return m;
  });
  upsertMeta('meta[property="og:image:type"]', "content", "image/png", () => {
    const m = document.createElement("meta");
    m.setAttribute("property", "og:image:type");
    return m;
  });
  upsertMeta('meta[property="og:image:width"]', "content", "1200", () => {
    const m = document.createElement("meta");
    m.setAttribute("property", "og:image:width");
    return m;
  });
  upsertMeta('meta[property="og:image:height"]', "content", "630", () => {
    const m = document.createElement("meta");
    m.setAttribute("property", "og:image:height");
    return m;
  });
  upsertMeta('meta[name="twitter:image"]', "content", DEFAULT_OG_IMAGE, () => {
    const m = document.createElement("meta");
    m.setAttribute("name", "twitter:image");
    return m;
  });

  // Per-route entity graph: WebPage/Article + BreadcrumbList + FAQPage +
  // SoftwareApplication, all connected to the sitewide Organization/WebSite
  // nodes declared in index.html. Identical to the build-time output.
  let ld = document.getElementById(JSONLD_ID) as HTMLScriptElement | null;
  if (!ld) {
    ld = document.createElement("script");
    ld.id = JSONLD_ID;
    ld.type = "application/ld+json";
    document.head.appendChild(ld);
  }
  ld.textContent = JSON.stringify(buildRouteGraph(path, entry));

  if (entry.noindex) {
    upsertMeta('meta[name="robots"]', "content", "noindex,nofollow", () => {
      const m = document.createElement("meta");
      m.setAttribute("name", "robots");
      return m;
    });
  } else {
    removeMeta('meta[name="robots"]');
  }
}

export default function RouteSeo() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      applySeo(
        {
          title: "asherin",
          description: "signed-in asherin workspace. not for search indexes.",
          noindex: true,
        },
        pathname,
      );
      return;
    }
    const entry = SEO[pathname];
    if (!entry) return; // Unknown route → leave existing head intact.
    applySeo(entry, pathname);
  }, [pathname]);

  return null;
}
