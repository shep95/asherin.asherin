import { describe, expect, it } from "vitest";
import {
  parseArxiv,
  parseCrossref,
  parseEdgar,
  parseGdelt,
  parseGitHubCode,
  parseGitHubRepos,
  parseGoogleBooks,
  parseHackerNews,
  parseJinaSearch,
  parseNvd,
  parseOpenAlex,
  parseOpenLibrary,
  parseStackExchange,
  parseWayback,
  parseWikipedia,
} from "@/lib/local/search/providers/open";
import { parseBrave, parseExa, parseFirecrawl, parseSerper, parseTavily } from "@/lib/local/search/providers/keyed";

describe("open index parsers read the real response shapes", () => {
  it("wikipedia search api", () => {
    const hits = parseWikipedia({ query: { search: [{ title: "Rayleigh scattering", snippet: 'The <span class="searchmatch">sky</span> is blue', timestamp: "2024-05-01T10:00:00Z" }] } });
    expect(hits).toEqual([{ title: "Rayleigh scattering", url: "https://en.wikipedia.org/wiki/Rayleigh_scattering", snippet: "The sky is blue", publishDate: "2024-05-01T10:00:00Z" }]);
  });

  it("hacker news algolia", () => {
    const hits = parseHackerNews({ hits: [{ title: "Show HN: thing", url: "https://example.com/t", points: 120, num_comments: 40, author: "pg", objectID: "1", created_at: "2024-01-02T00:00:00Z" }, { story_title: "Ask HN", objectID: "2", points: 3 }] });
    expect(hits[0].url).toBe("https://example.com/t");
    expect(hits[0].snippet).toContain("120 points");
    expect(hits[1].url).toBe("https://news.ycombinator.com/item?id=2");
    expect(hits[1].title).toBe("Ask HN");
  });

  it("github repositories and code", () => {
    const repos = parseGitHubRepos({ items: [{ full_name: "shep95/asherin", html_url: "https://github.com/shep95/asherin", description: null, stargazers_count: 7, language: "TypeScript", updated_at: "2024-09-01T00:00:00Z" }] });
    expect(repos[0].snippet).toBe("7★ · TypeScript");
    const code = parseGitHubCode({ items: [{ path: "src/a.ts", html_url: "https://github.com/x/y/blob/main/src/a.ts", repository: { full_name: "x/y" }, text_matches: [{ fragment: "const a = 1;" }] }] });
    expect(code[0].title).toBe("x/y · src/a.ts");
    expect(code[0].snippet).toBe("const a = 1;");
  });

  it("stack exchange", () => {
    const hits = parseStackExchange({ items: [{ title: "How do I x?", link: "https://stackoverflow.com/q/1", score: 12, answer_count: 3, is_answered: true, tags: ["ts"], creation_date: 1700000000 }] });
    expect(hits[0].snippet).toBe("12 votes · 3 answers · accepted · ts");
    expect(hits[0].publishDate).toBe("2023-11-14T22:13:20.000Z");
  });

  it("arxiv atom feed", () => {
    const xml = `<?xml version="1.0"?><feed><entry><id>http://arxiv.org/abs/2401.00001v1</id><published>2024-01-01T00:00:00Z</published><title>A
      Title</title><summary>  Some summary text. </summary></entry><entry><id></id><title>no id</title></entry></feed>`;
    const hits = parseArxiv(xml);
    expect(hits).toHaveLength(1);
    // ids arrive as http://; the parser upgrades them so they can be read under the page policy
    expect(hits[0]).toMatchObject({ title: "A Title", url: "https://arxiv.org/abs/2401.00001v1", snippet: "Some summary text.", publishDate: "2024-01-01T00:00:00Z" });
  });

  it("crossref works", () => {
    const hits = parseCrossref({ message: { items: [{ DOI: "10.1/x", title: ["Paper"], author: [{ family: "Doe", given: "J" }], "container-title": ["Nature"], abstract: "<jats:p>Abs</jats:p>", URL: "https://doi.org/10.1/x", "published-print": { "date-parts": [[2021, 3]] } }] } });
    expect(hits[0]).toEqual({ title: "Paper", url: "https://doi.org/10.1/x", snippet: "Doe J · Nature · Abs", publishDate: "2021-03-01" });
  });

  it("openalex works", () => {
    const hits = parseOpenAlex({ results: [{ id: "https://openalex.org/W1", title: "Work", doi: "https://doi.org/10.2/y", authorships: [{ author: { display_name: "A. Person" } }], cited_by_count: 5, primary_location: { source: { display_name: "Journal" } }, publication_date: "2020-02-02" }] });
    expect(hits[0]).toEqual({ title: "Work", url: "https://doi.org/10.2/y", snippet: "A. Person · cited 5× · Journal", publishDate: "2020-02-02" });
  });

  it("google books and open library", () => {
    const gb = parseGoogleBooks({ items: [{ id: "abc", volumeInfo: { title: "Book", subtitle: "Sub", authors: ["Au"], publisher: "Pub", publishedDate: "1999", description: "Desc", infoLink: "https://books.google.com/books?id=abc" } }] });
    expect(gb[0].title).toBe("Book: Sub");
    expect(gb[0].publishDate).toBe("1999");
    const ol = parseOpenLibrary({ docs: [{ key: "/works/OL1W", title: "Old Book", author_name: ["Someone"], first_publish_year: 1950, subject: ["history"] }] });
    expect(ol[0].url).toBe("https://openlibrary.org/works/OL1W");
    expect(ol[0].publishDate).toBe("1950-01-01");
  });

  it("gdelt article list", () => {
    const hits = parseGdelt({ articles: [{ url: "https://news.example/a", title: "Headline", domain: "news.example", sourcecountry: "France", language: "English", seendate: "20240102T120000Z" }] });
    expect(hits[0].publishDate).toBe("2024-01-02");
    expect(hits[0].snippet).toBe("news.example · France · English");
  });

  it("wayback cdx rows", () => {
    const rows = [["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"], ["com,example)/", "20200101000000", "http://example.com/", "text/html", "200", "X", "1"]];
    const hits = parseWayback(rows);
    expect(hits[0].url).toBe("https://web.archive.org/web/20200101000000/http://example.com/");
    expect(hits[0].publishDate).toBe("2020-01-01");
    expect(parseWayback([["only-header"]])).toEqual([]);
  });

  it("nvd cve 2.0", () => {
    const hits = parseNvd({ vulnerabilities: [{ cve: { id: "CVE-2024-1234", published: "2024-02-02T00:00:00", descriptions: [{ lang: "es", value: "x" }, { lang: "en", value: "English description" }], metrics: { cvssMetricV31: [{ cvssData: { baseScore: 9.8 } }] } } }] });
    expect(hits[0].title).toBe("CVE-2024-1234 · critical (9.8)");
    expect(hits[0].url).toBe("https://nvd.nist.gov/vuln/detail/CVE-2024-1234");
    expect(hits[0].snippet).toBe("English description");
  });

  it("sec edgar full-text search", () => {
    const hits = parseEdgar({ hits: { hits: [{ _id: "0001234567-24-000001:doc.htm", _source: { adsh: "0001234567-24-000001", ciks: ["0001234567"], display_names: ["Acme Corp (ACME)"], form: "10-K", file_date: "2024-03-01", file_description: "Annual report" } }] } }, "acme");
    expect(hits[0].url).toBe("https://www.sec.gov/Archives/edgar/data/1234567/000123456724000001/doc.htm");
    expect(hits[0].title).toBe("Acme Corp (ACME) · 10-K · 2024-03-01");
  });

  it("jina web search envelope", () => {
    const hits = parseJinaSearch({ code: 200, data: [{ title: "T", url: "https://example.com", description: "D", content: "long content" }] });
    expect(hits[0]).toEqual({ title: "T", url: "https://example.com", snippet: "D", publishDate: undefined });
  });
});

describe("keyed engine parsers", () => {
  it("tavily, exa, firecrawl, serper, brave", () => {
    expect(parseTavily({ results: [{ title: "t", url: "https://a", content: "c", published_date: "2024-01-01" }] })[0].snippet).toBe("c");
    expect(parseExa({ results: [{ title: "t", url: "https://a", highlights: ["h1"], publishedDate: "2024-01-01" }] })[0].snippet).toBe("h1");
    expect(parseFirecrawl({ success: true, data: { web: [{ url: "https://a", title: "t", description: "d" }] } })[0].title).toBe("t");
    expect(parseFirecrawl({ data: [{ url: "https://b", metadata: { title: "mt" }, markdown: "md" }] })[0].title).toBe("mt");
    expect(parseSerper({ organic: [{ title: "o", link: "https://o", snippet: "s" }], news: [{ title: "n", link: "https://n", snippet: "ns", date: "1 day ago" }] })).toHaveLength(2);
    expect(parseBrave({ web: { results: [{ title: "w", url: "https://w", description: "<strong>d</strong>", page_age: "2024-01-01" }] } })[0].snippet).toBe("d");
  });

  it("tolerates garbage without throwing", () => {
    for (const p of [parseTavily, parseExa, parseFirecrawl, parseSerper, parseBrave, parseWikipedia, parseHackerNews, parseNvd, parseEdgar, parseGdelt]) {
      expect(p(null)).toEqual([]);
      expect(p("nope")).toEqual([]);
      expect(p({ results: "x", hits: 3, items: {} })).toEqual([]);
    }
    expect(parseArxiv("not xml")).toEqual([]);
    expect(parseWayback(null)).toEqual([]);
  });
});
