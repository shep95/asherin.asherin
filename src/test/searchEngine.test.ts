import { describe, expect, it } from "vitest";
import { buildQueryPlan, scoreRelevance, finalScore } from "@/lib/local/search/queryPlan";
import { assembleResults, buildWireQuery, parseOperatorGate, passesGate } from "@/lib/local/search/engine";
import { buildSearchResult, checkFreshness, getSourceTier, getTierLabel, truthGraphFor } from "@/lib/local/search/tiering";
import { fuseCorpus } from "@/lib/local/search/fusion";
import { convertUnits, detectInstantAnswerType, evalArithmetic, localInstantAnswer } from "@/lib/local/search/instant";
import { normalizeAnalysis } from "@/lib/local/search/intel";
import { parseReaderJson, parseDirectHtml, normalizeTargetUrl } from "@/lib/local/search/reader";
import { intelFromPage } from "@/lib/local/search/urlIntel";
import { crossValidateSources, toDeepSource } from "@/lib/local/search/deep";
import { toCsv, toMarkdown } from "@/lib/local/search/export";
import type { SearchProvider } from "@/lib/local/search/providers";

const fakeProvider = (id: string, layer = "surface"): SearchProvider => ({ id, label: id, modes: ["web"], layer, run: async () => [] });

describe("query plan and operator gate", () => {
  it("keeps operators off the wire and gates on them locally", () => {
    const plan = buildQueryPlan('site:sec.gov "annual report" acme -site:spam.example filetype:pdf');
    expect(plan.operators.some((o) => o.startsWith("site:sec.gov"))).toBe(true);
    const wire = buildWireQuery(plan, undefined, "-site:other.example filetype:pdf");
    expect(wire).not.toContain("site:");
    expect(wire).not.toContain("filetype:");
    expect(wire).toContain("acme");
    const gate = parseOperatorGate(plan.operators);
    expect(gate.sites).toEqual(["sec.gov"]);
    expect(gate.notSites).toEqual(["spam.example"]);
    expect(gate.exts).toEqual(["pdf"]);
    expect(passesGate({ url: "https://www.sec.gov/Archives/x/report.pdf", title: "t" }, gate)).toBe(true);
    expect(passesGate({ url: "https://sec.gov/x/report.htm", title: "t" }, gate)).toBe(false);
    expect(passesGate({ url: "https://spam.example/a.pdf", title: "t" }, gate)).toBe(false);
  });

  it("filters widen the gate and the wire query", () => {
    const plan = buildQueryPlan("ocean acidification");
    const wire = buildWireQuery(plan, { exactPhrase: "coral reef", includeKeywords: ["ph"] });
    expect(wire.startsWith('"coral reef"')).toBe(true);
    expect(wire).toContain("ph");
    const gate = parseOperatorGate([], { domainInclude: ["noaa.gov"], intitle: "reef" });
    expect(passesGate({ url: "https://www.noaa.gov/x", title: "Reef watch" }, gate)).toBe(true);
    expect(passesGate({ url: "https://www.noaa.gov/x", title: "Other" }, gate)).toBe(false);
  });

  it("ranks the page that names the subject above the one that does not", () => {
    const plan = buildQueryPlan("Ada Lovelace analytical engine");
    const on = scoreRelevance(plan, { title: "Ada Lovelace and the Analytical Engine", url: "https://a", snippet: "notes on babbage" });
    const off = scoreRelevance(plan, { title: "Weather today", url: "https://b", snippet: "sunny" });
    expect(on).toBeGreaterThan(off);
    expect(finalScore({ relevance: on, veracity: 80 })).toBeGreaterThan(finalScore({ relevance: off, veracity: 95 }));
  });
});

describe("truth graph tiering", () => {
  it("tiers by domain, inherits on subdomains, flags hostile", () => {
    expect(getSourceTier("reuters.com")).toBe(1);
    expect(getSourceTier("www.nih.gov")).toBe(1);
    expect(getSourceTier("en.wikipedia.org")).toBe(2);
    expect(getSourceTier("physics.mit.edu")).toBe(3);
    expect(getSourceTier("randomblog.net")).toBe(4);
    expect(getSourceTier("abc.onion")).toBe(5);
    expect(getTierLabel(1)).toBe("primary source");
    expect(truthGraphFor("https://infowars.com/x", "").hostileFlag).toBe(true);
    expect(truthGraphFor("https://nature.com/x", "according to the study").provenanceScore).toBeGreaterThanOrEqual(0.95);
  });

  it("builds a result, rejects junk, normalises dates", () => {
    const r = buildSearchResult({ title: "<b>Hi</b>", url: "example.com/a?utm_source=x", snippet: "s &amp; t", publishDate: "2024-01-05T12:00:00Z", engine: "wikipedia", layer: "curated" });
    expect(r?.title).toBe("Hi");
    expect(r?.url).toBe("https://example.com/a?utm_source=x");
    expect(r?.snippet).toBe("s & t");
    expect(r?.publishDate).toBe("2024-01-05");
    expect(r?.engines).toEqual(["wikipedia"]);
    expect(buildSearchResult({ title: "", url: "", snippet: "", engine: "x", layer: "y" })).toBeNull();
    expect(buildSearchResult({ title: "", url: "not a url at all", snippet: "", engine: "x", layer: "y" })).toBeNull();
    for (const bad of ["javascript:alert(1)", "data:text/html,<b>x</b>", "mailto:a@b.co", "ftp://files.example/x"]) {
      expect(buildSearchResult({ title: "t", url: bad, snippet: "", engine: "x", layer: "y" })).toBeNull();
    }
    expect(buildSearchResult({ title: "t", url: "host.example:8080/a", snippet: "", engine: "x", layer: "y" })?.url).toBe("https://host.example:8080/a");
  });

  it("freshness alerts follow the query's domain", () => {
    const old = new Date(Date.now() - 400 * 86400000).toISOString();
    expect(checkFreshness("bitcoin price", old)?.severity).toBe("warning");
    expect(checkFreshness("poetry", old)).toBeNull();
    expect(checkFreshness("latest news", undefined)).toBeNull();
  });
});

describe("assembling results across engines", () => {
  it("dedupes the same page from two engines, merges engines, ranks and groups", () => {
    const plan = buildQueryPlan("rayleigh scattering");
    const a = fakeProvider("wikipedia", "curated");
    const b = fakeProvider("jina");
    const rows = assembleResults(
      [
        { provider: a, hits: [{ title: "Rayleigh scattering", url: "https://en.wikipedia.org/wiki/Rayleigh_scattering", snippet: "why the sky is blue" }] },
        {
          provider: b,
          hits: [
            { title: "Rayleigh scattering - Wikipedia", url: "https://en.wikipedia.org/wiki/Rayleigh_scattering?utm_source=jina", snippet: "scattering of light by particles much smaller than the wavelength, why the sky is blue" },
            { title: "Cat pictures", url: "https://cats.example/", snippet: "meow" },
          ],
        },
      ],
      plan,
      parseOperatorGate([]),
    );
    expect(rows).toHaveLength(2);
    const wiki = rows.find((r) => r.url.includes("wikipedia"))!;
    expect(wiki.engines).toEqual(["wikipedia", "jina"]);
    expect(wiki.snippet).toContain("wavelength");
    expect(rows[0].url).toBe(wiki.url);
    expect(rows[0].rank).toBe(1);
    expect(rows.every((r) => typeof r.score === "number")).toBe(true);
  });

  it("drops results outside a date range only when the date is known", () => {
    const plan = buildQueryPlan("test");
    const p = fakeProvider("x");
    const rows = assembleResults(
      [{ provider: p, hits: [{ title: "old", url: "https://a.example/1", snippet: "", publishDate: "2001-01-01" }, { title: "undated", url: "https://a.example/2", snippet: "" }] }],
      plan,
      parseOperatorGate([]),
      { dateRange: "year" },
    );
    expect(rows.map((r) => r.title)).toEqual(["undated"]);
  });
});

describe("fusion layer runs in the browser", () => {
  it("produces claims, clusters and centrality from a small corpus", () => {
    const docs = [
      { url: "https://a.example/1", title: "Acme Corp raises $40 million", snippet: "Acme Corp raised $40 million in a round led by Jane Doe on 2024-03-01.", domain: "a.example", tier: 4 },
      { url: "https://b.example/2", title: "Acme Corp funding", snippet: "Acme Corp raised $45 million, Jane Doe said on 2024-03-02.", domain: "b.example", tier: 2 },
      { url: "https://c.example/3", title: "Unrelated weather", snippet: "Rain expected across the region this weekend.", domain: "c.example", tier: 4 },
    ];
    const f = fuseCorpus("Acme Corp", docs);
    expect(f.intel.entities.length).toBeGreaterThan(1);
    expect(f.centrality.length).toBeGreaterThan(0);
    expect(f.clusters.length).toBeGreaterThan(0);
    expect(Object.keys(f.dataTypes)).toHaveLength(3);
    expect(f.anomalies.benford).toBeDefined();
  });
});

describe("instant answers", () => {
  it("evaluates arithmetic without eval and converts units", () => {
    expect(detectInstantAnswerType("12 * (3 + 4)")).toBe("math");
    expect(evalArithmetic("12 * (3 + 4)")).toBe(84);
    expect(evalArithmetic("2 ^ 10")).toBe(1024);
    expect(evalArithmetic("-3 + 5")).toBe(2);
    expect(evalArithmetic("1 / 0")).toBeNull();
    expect(evalArithmetic("(1 + 2")).toBeNull();
    expect(convertUnits("10 km to miles")?.value).toBeCloseTo(6.2137, 3);
    expect(convertUnits("100 c to f")?.value).toBe(212);
    expect(convertUnits("3 kg to liters")).toBeNull();
    expect(localInstantAnswer("5 miles in km")?.value).toBe("8.04672 km");
    expect(localInstantAnswer("what is rayleigh scattering")).toBeNull();
    expect(detectInstantAnswerType("define entropy")).toBe("definition");
  });
});

describe("intel analysis normalisation", () => {
  it("fills every shape the panels render, even from a sparse or odd reply", () => {
    const t = normalizeAnalysis("temporal", { timeline: [{ headline: "h", importance: "70" }] }) as { timeline: { date: string; keyFacts: string[]; importance: number }[]; narrativeShifts: unknown[]; predictedDevelopments: unknown[] };
    expect(t.timeline[0]).toMatchObject({ date: "undated", keyFacts: [], importance: 70 });
    expect(t.narrativeShifts).toEqual([]);
    const f = normalizeAnalysis("factcheck", { claims: [{ claim: "c", verdict: "nonsense" }] }) as { claims: { verdict: string; supportingSources: string[] }[]; contradictions: unknown[] };
    expect(f.claims[0].verdict).toBe("unverifiable");
    expect(f.claims[0].supportingSources).toEqual([]);
    const n = normalizeAnalysis("narrative", {}) as { sentimentDistribution: { positive: number }; frames: unknown[] };
    expect(n.sentimentDistribution.positive).toBe(0);
    expect(n.frames).toEqual([]);
    const i = normalizeAnalysis("investigative", { gaps: [{ urgency: "critical", difficulty: "weird" }] }) as { gaps: { urgency: string; difficulty: string }[]; overallConfidence: number };
    expect(i.gaps[0]).toMatchObject({ urgency: "critical", difficulty: "moderate" });
    expect(i.overallConfidence).toBe(50);
    const c = normalizeAnalysis("credibility", { sources: [{ source: "a.example", credibilityScore: 88, hasFactChecking: "yes" }] }) as { sources: { ownership: string; hasFactChecking: boolean }[] };
    expect(c.sources[0]).toMatchObject({ ownership: "unknown", hasFactChecking: true });
  });
});

describe("reader and url intel", () => {
  it("parses the relay envelope and a direct html page", () => {
    const page = parseReaderJson({ code: 200, data: { title: "Page", url: "https://ex.example/p", description: "d", content: "# Heading\n\nHello world from the page. Contact a@b.co and @handle #tag https://other.example/x", links: { other: "https://other.example/x" } } }, "https://ex.example/p");
    expect(page?.via).toBe("reader");
    expect(page?.wordCount).toBeGreaterThan(5);
    expect(page?.links).toEqual([{ text: "other", url: "https://other.example/x" }]);
    const direct = parseDirectHtml('<html lang="en"><head><title>T</title><meta name="description" content="D"></head><body><p>First paragraph with enough words to count.</p><a href="/in">in</a><a href="https://out.example/o">out</a><p>subscribe to continue</p></body></html>', "https://ex.example/", 200);
    expect(direct.title).toBe("T");
    expect(direct.description).toBe("D");
    expect(direct.isPaywalled).toBe(true);
    expect(direct.links.map((l) => l.url)).toEqual(["https://ex.example/in", "https://out.example/o"]);
    expect(normalizeTargetUrl("x.com/MonaBets")).toBe("https://x.com/MonaBets");
    expect(normalizeTargetUrl("localhost:3000")).toBeNull();
    expect(normalizeTargetUrl("192.168.1.1")).toBeNull();
  });

  it("maps a page's connections deterministically", () => {
    const page = parseReaderJson({ data: { title: "Profile", url: "https://x.com/someone", content: "## About\nI am @someone and friends with @other. Reach me at me@example.com or 555-123-4567. #osint #maps https://github.com/someone https://instagram.com/someone", links: { github: "https://github.com/someone" } } }, "https://x.com/someone");
    const intel = intelFromPage("https://x.com/someone", page, null);
    expect(intel.domain).toBe("x.com");
    expect(intel.handles).toContain("@other");
    expect(intel.emails).toEqual(["me@example.com"]);
    expect(intel.hashtags).toEqual(["#osint", "#maps"]);
    expect(intel.socials["github.com"]).toEqual(["someone"]);
    expect(intel.socials["instagram.com"]).toEqual(["someone"]);
    expect(intel.headings).toEqual(["About"]);
    expect(intel.stats.outboundLinks).toBeGreaterThanOrEqual(2);
    const failed = intelFromPage("https://x.com/someone", null, "timed out");
    expect(failed.scrapeError).toBe("timed out");
    expect(failed.stats.words).toBe(0);
  });
});

describe("deep search validation and export", () => {
  it("grades consensus from the tiers present", () => {
    const mk = (url: string, content?: string) => toDeepSource({ title: "t", url, snippet: "s", source: "", tier: 4, tierLabel: "", category: "general" }, content);
    expect(crossValidateSources([]).consensusStrength).toBe("insufficient");
    expect(crossValidateSources([mk("https://a.example"), mk("https://b.example")]).consensusStrength).toBe("weak");
    expect(crossValidateSources([mk("https://reuters.com/a"), mk("https://b.example"), mk("https://c.example")]).consensusStrength).toBe("moderate");
    const strong = crossValidateSources([mk("https://reuters.com/a", "body"), mk("https://apnews.com/b", "body"), mk("https://c.example"), mk("https://d.example"), mk("https://e.example")]);
    expect(strong.consensusStrength).toBe("strong");
    expect(strong.readCount).toBe(2);
  });

  it("csv and markdown exports escape and list every item", () => {
    const csv = toCsv([{ title: 'He said "hi"', url: "https://a", snippet: "x,y" }]);
    expect(csv.split("\n")[1]).toBe('"He said ""hi""","https://a","","","","x,y"');
    const md = toMarkdown("report", [{ title: "One", url: "https://a", source: "a", tier: 1 }], { query: "q" });
    expect(md).toContain("## 1. One");
    expect(md).toContain("- query: q");
  });
});

describe("intel suite cache key", () => {
  it("is stable for the same corpus and differs by type, query or results", async () => {
    const { corpusKey } = await import("@/components/dashboard/search/intel/useIntelAnalysis");
    const rs = [{ title: "a", url: "https://a.example", snippet: "", source: "", tier: 4 as const, tierLabel: "", category: "general" as const }];
    expect(corpusKey("temporal", "Q ", rs)).toBe(corpusKey("temporal", "q", rs));
    expect(corpusKey("temporal", "q", rs)).not.toBe(corpusKey("credibility", "q", rs));
    expect(corpusKey("temporal", "q", rs)).not.toBe(corpusKey("temporal", "q", []));
  });
});

describe("social embeds respect the page's frame policy", () => {
  it("only youtube and vimeo render a player; others are link cards", async () => {
    const { render } = await import("@testing-library/react");
    const { createElement } = await import("react");
    const SocialPostEmbed = (await import("@/components/dashboard/search/SocialPostEmbed")).default;
    const yt = render(createElement(SocialPostEmbed, { url: "https://www.youtube.com/watch?v=abc123" }));
    expect(yt.container.querySelector("iframe")?.getAttribute("src")).toContain("youtube-nocookie.com/embed/abc123");
    yt.unmount();
    const x = render(createElement(SocialPostEmbed, { url: "https://x.com/someone/status/12345" }));
    expect(x.container.querySelector("iframe")).toBeNull();
    expect(x.container.textContent).toMatch(/open on/i);
    x.unmount();
  });
});
