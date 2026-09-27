/**
 * SEO smoke test — crawl surface, run against the built `dist/` served the way
 * vercel serves it (static file first, then the redirects and rewrites in
 * vercel.json, then a real 404).
 *
 * Build first: `npm run build`. The test skips with a loud message if dist is
 * missing, because a green run against a stale tree would be worse than none.
 */

import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DIST = join(process.cwd(), "dist");
const HAS_DIST = existsSync(join(DIST, "index.html"));

type Rule = { from: string; to: string; status: number };

function loadRules(): Rule[] {
  const file = join(process.cwd(), "vercel.json");
  if (!existsSync(file)) return [];
  const cfg = JSON.parse(readFileSync(file, "utf8")) as {
    redirects?: { source: string; destination: string; permanent?: boolean }[];
    rewrites?: { source: string; destination: string }[];
  };
  const redirects = (cfg.redirects ?? []).map((r) => ({
    from: r.source,
    to: r.destination,
    status: r.permanent === false ? 307 : 308,
  }));
  const rewrites = (cfg.rewrites ?? []).map((r) => ({ from: r.source, to: r.destination, status: 200 }));
  return [...redirects, ...rewrites];
}

/** vercel path syntax: literal, ":slug" one segment, ":path*" the rest. */
function matches(pattern: string, path: string) {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/:[a-zA-Z0-9_]+\*/g, ".*")
    .replace(/:[a-zA-Z0-9_]+/g, "[^/]+");
  return new RegExp(`^${escaped}$`).test(path);
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function resolveFile(path: string): string | null {
  const clean = decodeURIComponent(path.split("?")[0]);
  if (clean.includes("..")) return null;
  const direct = join(DIST, clean);
  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  const asDir = join(DIST, clean, "index.html");
  if (existsSync(asDir)) return asDir;
  return null;
}

let server: Server;
let origin = "";
const rules = HAS_DIST ? loadRules() : [];

beforeAll(async () => {
  if (!HAS_DIST) return;
  server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    let file = resolveFile(path);
    let status = 200;

    if (!file) {
      const rule = rules.find((r) => matches(r.from, path));
      if (rule && rule.status !== 200) {
        res.writeHead(rule.status, { location: rule.to });
        res.end();
        return;
      }
      if (rule) file = resolveFile(rule.to);
      if (!file) {
        const notFound = resolveFile("/404.html");
        res.writeHead(404, { "content-type": notFound ? "text/html; charset=utf-8" : "text/plain" });
        res.end(notFound ? readFileSync(notFound) : "not found");
        return;
      }
    }
    res.writeHead(status, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  origin = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "";
}, 30_000);

afterAll(() => server?.close());

const get = (path: string) => fetch(`${origin}${path}`, { redirect: "manual" });

describe.skipIf(!HAS_DIST)("seo smoke", () => {
  it("1. homepage title and description match the visible page", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    const title = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
    expect(title.toLowerCase()).toContain("asherin");
    expect(html).toContain("look a little closer");
    expect(html).not.toMatch(/Aureon/);
  });

  it("2. /pricing is gone: it redirects, and /software sells nothing", async () => {
    const res = await get("/pricing");
    expect([301, 302, 307, 308]).toContain(res.status);
    const html = await (await get("/software")).text();
    expect(html).not.toContain("$18");
    expect(html).not.toContain("$79");
    expect(html).not.toMatch(/subscri/i);
  });

  it("3. an unknown URL returns HTTP 404, not a homepage clone", async () => {
    const res = await get("/this-missing-seo-9f3");
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).not.toContain("look a little closer");
  });

  it("4. the share image is a real JPEG under 1MB", async () => {
    const res = await get("/asherin-share.jpg");
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 3).toString("hex")).toBe("ffd8ff");
    expect(buf.length).toBeLessThan(1_000_000);
  });

  it("5. robots.txt is short, honest and asherin-branded", async () => {
    const res = await get("/robots.txt");
    expect(res.status).toBe(200);
    const txt = await res.text();
    expect(txt).toContain("Sitemap: https://asherin.com/sitemap.xml");
    expect(txt).toContain("Disallow: /dashboard");
    expect(txt).toContain("Disallow: /whiteboard");
    expect(txt).not.toMatch(/Aureon/i);
    expect(txt).not.toContain("wp-admin");
  });

  it("6. every sitemap URL resolves 200, with no dashboard and no theory copy", async () => {
    const res = await get("/sitemap.xml");
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).not.toContain("Theory 10");
    expect(xml).not.toContain("/dashboard");
    expect(xml).not.toContain("<priority>");
    expect(xml).not.toContain("<changefreq>");

    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(10);
    const broken: string[] = [];
    for (const loc of locs) {
      const path = loc.replace("https://asherin.com", "") || "/";
      const r = await get(path);
      if (r.status !== 200) broken.push(`${path} → ${r.status}`);
    }
    expect(broken).toEqual([]);
  }, 60_000);

  it("7. llms.txt is asherin, no prices, no costume numbers", async () => {
    const res = await get("/llms.txt");
    expect(res.status).toBe(200);
    const txt = await res.text();
    expect(txt.trimStart().startsWith("# asherin")).toBe(true);
    expect(txt).not.toMatch(/Aureon/i);
    expect(txt).not.toContain("$79");
    expect(txt).not.toContain("$399");
    expect(txt).not.toMatch(/14 second/i);
    expect(txt).not.toMatch(/30-source/i);
    expect(txt).not.toMatch(/NOMAD/);
  });

  it("8. /software carries its own canonical, not the homepage's", async () => {
    const html = await (await get("/software")).text();
    const canonicals = [...html.matchAll(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
    expect(canonicals).toEqual(["https://asherin.com/software"]);
  });

  it("9. no clipped crawler-only markup in prerendered HTML", async () => {
    for (const path of ["/", "/software", "/founder", "/blog"]) {
      const html = await (await get(path)).text();
      expect(html, path).not.toContain("data-geo-static");
      expect(html, path).not.toContain("clip-path:inset(50%)");
      expect(html, path).not.toContain("Compared with named alternatives");
    }
  });

  it("10. JSON-LD parses, carries the app, and sells nothing", async () => {
    const html = await (await get("/")).text();
    const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) =>
      JSON.parse(m[1].replace(/\\u003c/g, "<")),
    );
    expect(blocks.length).toBeGreaterThan(0);

    const nodes = blocks.flatMap((b) => (b["@graph"] as Record<string, unknown>[]) ?? [b]);
    const app = nodes.find((n) => n["@type"] === "SoftwareApplication") as { offers?: unknown } | undefined;
    expect(app).toBeTruthy();
    expect(app!.offers).toBeUndefined();

    const asText = JSON.stringify(nodes);
    expect(asText).not.toMatch(/Aureon/i);
    expect(asText).not.toContain("FAQPage");
  });
});
