import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import LandingBackground from "@/components/LandingBackground";
import { BLOG_POSTS, type BlogPost, getArticleDisclosure } from "@/data/blogCatalog";

/**
 * /blog — the reading room.
 *
 * one lead record, the other pinned records under it, then the whole archive
 * as a dated list. no cards, no chips, no glass: hairlines, negative space and
 * thin lowercase type. every /blog/<slug> page is registered in blogCatalog so
 * this page, the header and the sitemap stay in step.
 */

const toIso = (s: string) => (s.includes("T") ? s : `${s}T00:00:00Z`);

const fmtDate = (iso: string) =>
  new Date(toIso(iso))
    .toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })
    .toLowerCase();

const fmtBucket = (iso: string) =>
  new Date(toIso(iso)).toLocaleDateString("en-US", { year: "numeric", month: "long", timeZone: "UTC" }).toLowerCase();

const tagsOf = (posts: BlogPost[]) => Array.from(new Set(posts.map((p) => p.tag))).sort();

const Blog = () => {
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [query, setQuery] = useState<string>("");

  useEffect(() => {
    const id = "blog-index-jsonld";
    let el = document.getElementById(id) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement("script");
      el.id = id;
      el.type = "application/ld+json";
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "Asherin Blog",
      url: "https://asherin.com/blog",
      blogPost: BLOG_POSTS.map((p) => ({
        "@type": "BlogPosting",
        headline: p.title,
        description: p.dek,
        url: `https://asherin.com${p.slug}`,
        datePublished: toIso(p.published),
      })),
    });
    return () => {
      document.getElementById(id)?.remove();
    };
  }, []);

  const tags = useMemo(() => ["all", ...tagsOf(BLOG_POSTS)], []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BLOG_POSTS.filter((p) => (tagFilter === "all" ? true : p.tag === tagFilter))
      .filter((p) => (q ? `${p.title} ${p.dek} ${p.tag} ${getArticleDisclosure(p.slug).statusLabel}`.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        const ta = Date.parse(toIso(a.published));
        const tb = Date.parse(toIso(b.published));
        return sort === "newest" ? tb - ta : ta - tb;
      });
  }, [tagFilter, sort, query]);

  const pinnedPosts = BLOG_POSTS.filter((p) => p.pinned);
  const heroPinned = pinnedPosts.filter((p) => p.tag !== "Live Prediction");
  // one record carries the top of the page. the rest of the pinned set sits
  // under it at a lower weight, so the eye has one place to land.
  const lead = heroPinned[0] ?? null;
  const secondaryPinned = heroPinned.slice(1);

  const isFiltering = tagFilter !== "all" || sort !== "newest" || !!query.trim();
  const pinnedSlugs = new Set(pinnedPosts.map((p) => p.slug));
  const listed = isFiltering ? filtered : filtered.filter((p) => !pinnedSlugs.has(p.slug));

  const buckets = useMemo(() => {
    const map = new Map<string, BlogPost[]>();
    for (const p of listed) {
      const k = fmtBucket(p.published);
      const arr = map.get(k);
      if (arr) arr.push(p);
      else map.set(k, [p]);
    }
    return Array.from(map.entries());
  }, [listed]);

  const resetAll = () => {
    setTagFilter("all");
    setSort("newest");
    setQuery("");
  };

  const meta = (p: BlogPost, extra?: string) => (
    <p className="journal-muted flex flex-wrap items-center gap-x-3 text-[11px] font-light lowercase tracking-[0.04em]">
      {extra && <span className="text-foreground/80">{extra}</span>}
      <span>{p.tag}</span>
      <span aria-hidden className="text-foreground/20">·</span>
      <time dateTime={toIso(p.published)}>{fmtDate(p.published)}</time>
      <span aria-hidden className="text-foreground/20">·</span>
      <span>{p.readTime}</span>
      <span aria-hidden className="text-foreground/20">·</span>
      <span>{getArticleDisclosure(p.slug).statusLabel}</span>
    </p>
  );

  return (
    <LandingBackground overlayOpacity="bg-black/70">
      <div className="journal-surface landing-perf min-h-screen">
        <Header />

        <main className="mx-auto max-w-5xl px-5 pb-28 pt-32 sm:px-8 sm:pt-40">
          {/* masthead — three lines, each arriving a beat after the last */}
          <header className="border-b journal-rule pb-12">
            <p className="arrive arrive-1 journal-muted text-[11px] font-light lowercase tracking-[0.18em]">asherin · notes</p>
            <h1 className="arrive arrive-2 mt-6 max-w-3xl text-4xl font-extralight lowercase leading-[1.05] tracking-[-0.02em] sm:text-6xl">
              public notes.
              <span className="block text-foreground/45">with boundaries.</span>
            </h1>
            <div className="arrive arrive-3 mt-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <p className="journal-muted max-w-md text-sm font-light leading-[1.8]">
                current functions, archived concepts, method notes, and the limits that keep each claim honest.
              </p>
              <p className="journal-muted text-[11px] font-light tabular-nums">{BLOG_POSTS.length} entries</p>
            </div>
          </header>

          {/* lead record */}
          {lead && !isFiltering && (
            <section aria-label="Lead article" className="arrive arrive-4 arrive-slow border-b journal-rule py-12">
              <Link to={lead.slug} className="group block focus-visible:outline-none">
                {meta(lead, "lead record")}
                <h2 className="mt-5 max-w-3xl text-3xl font-extralight lowercase leading-[1.1] tracking-[-0.015em] text-foreground transition-colors duration-[var(--dur-settle)] ease-quiet group-hover:text-foreground/70 sm:text-5xl">
                  {lead.title}
                </h2>
                <p className="journal-muted mt-5 max-w-2xl text-base font-light leading-[1.8]">{lead.dek}</p>
                <span className="mt-7 inline-block text-[12px] font-light lowercase text-foreground/70 transition-colors duration-[var(--dur-quick)] ease-quiet group-hover:text-foreground">
                  read the record →
                </span>
              </Link>
            </section>
          )}

          {/* the other pinned records, at a lower weight */}
          {secondaryPinned.length > 0 && !isFiltering && (
            <section aria-label="Also pinned" className="grid border-b journal-rule sm:grid-cols-2">
              {secondaryPinned.map((p, i) => (
                <Link
                  key={p.slug}
                  to={p.slug}
                  className={`group block py-9 focus-visible:outline-none ${i % 2 === 1 ? "sm:border-l sm:pl-8 journal-rule" : "sm:pr-8"} ${i > 1 ? "border-t journal-rule" : ""}`}
                >
                  {meta(p, "pinned")}
                  <h3 className="mt-4 text-xl font-extralight lowercase leading-snug text-foreground transition-colors duration-[var(--dur-settle)] ease-quiet group-hover:text-foreground/70">
                    {p.title}
                  </h3>
                  <p className="journal-muted mt-3 text-sm font-light leading-relaxed line-clamp-2">{p.dek}</p>
                </Link>
              ))}
            </section>
          )}

          {/* the archive: one line of words to narrow it, nothing else */}
          <section aria-label="Filter articles" className="pt-12">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-baseline sm:justify-between">
              <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
                {tags.map((t) => {
                  const active = tagFilter === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTagFilter(t)}
                      aria-pressed={active}
                      className={`text-[12px] font-light lowercase transition-colors duration-[var(--dur-quick)] ease-quiet ${
                        active ? "text-foreground underline decoration-foreground/40 underline-offset-[6px]" : "text-foreground/45 hover:text-foreground"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-baseline gap-5">
                <button
                  type="button"
                  onClick={() => setSort((s) => (s === "newest" ? "oldest" : "newest"))}
                  className="text-[12px] font-light lowercase text-foreground/45 transition-colors duration-[var(--dur-quick)] ease-quiet hover:text-foreground"
                >
                  {sort === "newest" ? "newest first" : "oldest first"}
                </button>
                <label className="relative">
                  <span className="sr-only">search articles</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="search"
                    className="w-32 border-b border-foreground/15 bg-transparent pb-1 text-[12px] font-light lowercase text-foreground placeholder:text-foreground/35 outline-none transition-colors duration-[var(--dur-settle)] ease-quiet focus:w-48 focus:border-foreground/60 sm:w-40"
                  />
                </label>
              </div>
            </div>
            {isFiltering && (
              <p className="journal-muted mt-4 flex items-baseline gap-4 text-[11px] font-light lowercase tabular-nums">
                <span>{filtered.length} matching</span>
                <button type="button" onClick={resetAll} className="text-foreground/60 transition-colors hover:text-foreground">
                  clear
                </button>
              </p>
            )}
          </section>

          {/* the list */}
          {listed.length > 0 ? (
            <section aria-label="All articles" className="mt-10">
              {buckets.map(([bucket, posts]) => (
                <div key={bucket} className="mb-14 last:mb-0">
                  <h2 className="journal-muted mb-2 text-[11px] font-light lowercase tracking-[0.12em]">{bucket}</h2>
                  <ul className="border-t journal-rule">
                    {posts.map((p) => (
                      <li key={p.slug} className="border-b journal-rule">
                        <Link to={p.slug} className="group grid gap-2 py-7 focus-visible:outline-none sm:grid-cols-[7rem_1fr] sm:gap-8">
                          <time
                            dateTime={toIso(p.published)}
                            className="journal-muted pt-1 text-[11px] font-light lowercase tabular-nums"
                          >
                            {fmtDate(p.published)}
                          </time>
                          <div className="min-w-0">
                            <h3 className="text-xl font-extralight lowercase leading-snug text-foreground transition-colors duration-[var(--dur-settle)] ease-quiet group-hover:text-foreground/65 sm:text-2xl">
                              {p.title}
                            </h3>
                            <p className="journal-muted mt-2 max-w-2xl text-sm font-light leading-relaxed line-clamp-2">{p.dek}</p>
                            <p className="journal-muted mt-3 flex flex-wrap items-center gap-x-3 text-[11px] font-light lowercase">
                              <span>{p.tag}</span>
                              <span aria-hidden className="text-foreground/20">·</span>
                              <span>{p.readTime}</span>
                              <span aria-hidden className="text-foreground/20">·</span>
                              <span>{getArticleDisclosure(p.slug).statusLabel}</span>
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ) : (
            <section className="mt-16 border-t journal-rule pt-10">
              <p className="journal-muted text-sm font-light lowercase">nothing matches those words.</p>
              {isFiltering && (
                <button type="button" onClick={resetAll} className="mt-3 text-[12px] font-light lowercase text-foreground/70 hover:text-foreground">
                  clear
                </button>
              )}
            </section>
          )}
        </main>

        <SiteFooter />
      </div>
    </LandingBackground>
  );
};

export default Blog;
