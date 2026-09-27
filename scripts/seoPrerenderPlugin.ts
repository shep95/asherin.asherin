/**
 * Build-time head prerender.
 *
 * This app is a client-rendered SPA: every URL is served the same index.html,
 * so crawlers that do not execute JS (social previews, plain HTTP fetchers,
 * most SEO scanners) see one title, one description, and one canonical for
 * every route. RouteSeo.tsx fixes that only after hydration.
 *
 * After the bundle is written, this plugin emits one static HTML file per known
 * route with the correct <title>, description, canonical, og:*, twitter:*, and
 * JSON-LD baked into the markup. The runtime layer still runs and produces the
 * identical values, so client navigation and first load agree.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Plugin } from "vite";
import { ORIGIN, ROUTE_SEO, type SeoEntry } from "../src/lib/routeSeoData";
import { buildRouteGraph } from "../src/lib/geo/schema";

/** Hard ceiling so route growth can never push the build past publish limits. */
const MAX_PRERENDER_PAGES = 2000;

function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Replace an existing tag matched by `pattern`, or append `tag` to <head>. */
function upsertTag(html: string, pattern: RegExp, tag: string) {
  // Patterns are built per-call and used once, so no lastIndex state to carry.
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `  ${tag}\n</head>`);
}

function metaPattern(attr: "name" | "property", key: string) {
  return new RegExp(`<meta[^>]*${attr}=["']${key}["'][^>]*>`, "i");
}

function buildJsonLd(path: string, entry: SeoEntry) {
  // </script> inside JSON would close the tag early; JSON-LD escapes it as <\/script>.
  return `<script type="application/ld+json" id="route-seo-jsonld">${JSON.stringify(
    buildRouteGraph(path, entry),
  ).replace(/</g, "\\u003c")}</script>`;
}

function renderRouteHtml(template: string, path: string, entry: SeoEntry) {
  const canonical = `${ORIGIN}${path}`;
  const title = escapeAttr(entry.title);
  const description = escapeAttr(entry.description);

  let html = template;

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  html = upsertTag(html, metaPattern("name", "description"), `<meta name="description" content="${description}" />`);
  html = upsertTag(html, /<link[^>]*rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${canonical}" />`);
  html = upsertTag(html, metaPattern("property", "og:title"), `<meta property="og:title" content="${title}" />`);
  html = upsertTag(
    html,
    metaPattern("property", "og:description"),
    `<meta property="og:description" content="${description}" />`,
  );
  html = upsertTag(html, metaPattern("property", "og:url"), `<meta property="og:url" content="${canonical}" />`);
  html = upsertTag(
    html,
    metaPattern("property", "og:type"),
    `<meta property="og:type" content="${entry.ogType ?? "website"}" />`,
  );
  html = upsertTag(html, metaPattern("name", "twitter:title"), `<meta name="twitter:title" content="${title}" />`);
  html = upsertTag(html, metaPattern("property", "og:image:alt"), `<meta property="og:image:alt" content="${title}" />`);
  html = upsertTag(
    html,
    metaPattern("name", "twitter:description"),
    `<meta name="twitter:description" content="${description}" />`,
  );

  // Private routes must not be indexed even when fetched without JS.
  const robots = entry.noindex
    ? "noindex,nofollow"
    : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
  html = upsertTag(html, metaPattern("name", "robots"), `<meta name="robots" content="${robots}" />`);
  if (entry.noindex) {
    html = upsertTag(html, metaPattern("name", "googlebot"), `<meta name="googlebot" content="noindex,nofollow" />`);
  }

  html = html.replace("</head>", `  ${buildJsonLd(path, entry)}\n</head>`);
  return html;
}

export function seoPrerenderPlugin(): Plugin {
  return {
    name: "asherin-seo-prerender",
    apply: "build",
    enforce: "post",
    writeBundle(options) {
      const outDir = options.dir ?? resolve(process.cwd(), "dist");
      const indexPath = join(outDir, "index.html");

      let template: string;
      try {
        template = readFileSync(indexPath, "utf8");
      } catch {
        // Non-HTML builds (SSR/library passes) have no index.html to extend.
        return;
      }

      const routes = Object.entries(ROUTE_SEO).slice(0, MAX_PRERENDER_PAGES);
      let written = 0;

      for (const [path, entry] of routes) {
        if (!path.startsWith("/")) continue;
        // A prerendered document IS a public page: the file exists on disk, so
        // the host serves it with a real 200 and a real <title> even when the
        // React router only redirects or gates that path. Anything marked
        // noindex must therefore never get a physical head file — otherwise a
        // scanner reads the stale marketing title of a retired surface.
        if (entry.noindex) continue;
        const html = renderRouteHtml(template, path, entry);
        const target = path === "/" ? indexPath : join(outDir, path.replace(/^\//, ""), "index.html");
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, html);
        written += 1;
      }

      // A dedicated 404 document. The host serves it with a real 404 status
      // (see public/_redirects), so unknown URLs never answer as a 200 clone
      // of the homepage. noindex, and no canonical pointing at "/".
      const notFound = renderRouteHtml(template, "/404", {
        title: "not found | asherin",
        description: "this is not a page on asherin.",
        noindex: true,
      }).replace(/<link[^>]*rel=["']canonical["'][^>]*>/i, "");
      writeFileSync(join(outDir, "404.html"), notFound);

      const skipped = Object.keys(ROUTE_SEO).length - routes.length;
      console.log(
        `seo-prerender: wrote ${written} route head(s)` +
          (skipped > 0 ? ` (${skipped} skipped by MAX_PRERENDER_PAGES)` : ""),
      );
    },
  };
}
