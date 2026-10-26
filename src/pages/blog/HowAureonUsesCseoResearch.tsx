import ArticleShell from "@/components/seo/ArticleShell";
import {
  ArticleJsonLd,
  BreadcrumbJsonLd,
  FaqJsonLd,
} from "@/components/seo/SeoJsonLd";
import RelatedLinks from "@/components/seo/RelatedLinks";

const URL = "https://asherin.com/blog/how-aureon-uses-c-seo-research";
const TITLE = "How Asherin Uses C-SEO Research, Practicing What the Paper Recommends";
const PUBLISHED = "2026-06-19";

const HowAureonUsesCseoResearch = () => (
  <ArticleShell
    eyebrow="archived · publishing method"
    title="how asherin used C-SEO research"
    dek="C-SEO (conversational SEO) is the academic name for the discipline of ranking inside AI answers. this note described how asherin's llms.txt, structured markup and crawler policy followed the C-SEO Bench findings. the crawler policy has since reversed, so it is kept as a method note."
    publishedLabel="Jun 19 2026"
    readTime="10 min"
  >
    <ArticleJsonLd
      id="how-aureon-uses-c-seo-research"
      url={URL}
      headline={TITLE}
      description="A meta-article on how Asherin implements the recommendations of the C-SEO Bench research paper, llms.txt, structural summaries, FAQ schema, AI-crawler allowlist, and verification."
      datePublished={PUBLISHED}
      keywords={[
        "c-seo",
        "conversational seo",
        "ai search engine optimization",
        "llms.txt",
        "ai search ranking",
      ]}
    />
    <BreadcrumbJsonLd
      id="how-aureon-uses-c-seo-research"
      items={[
        { name: "Asherin", url: "/" },
        { name: "blog", url: "/blog" },
        { name: "How Asherin Uses C-SEO Research", url: "/blog/how-aureon-uses-c-seo-research" },
      ]}
    />
    <p>
      <strong>status.</strong> archived publishing note. asherin's robots.txt
      now refuses ai-training and bulk crawlers, and the glossary cluster
      this note pointed at no longer exists. llms.txt and the article, faq
      and breadcrumb json-ld still ship. what follows is kept for the
      method, not as a description of the current site.
    </p>

    <h2>What C-SEO is, in one paragraph</h2>
    <p>
      C-SEO, conversational SEO, is the discipline of being cited
      inside AI-generated answers. Where classical SEO optimizes for a
      ranked link in a search results page, C-SEO optimizes for a
      verbatim citation inside an AI assistant's response. The academic
      name was formalized by the C-SEO Bench paper (June 2025), the
      first peer-reviewed benchmark of techniques that move citation
      rate inside LLM answers.
    </p>

    <h2>The C-SEO Bench findings, summarized</h2>
    <p>
      The paper identified several techniques that materially shift
      citation rate inside AI answers, and several that don't.
      Techniques that work:
    </p>
    <ul>
      <li>
        <strong>Structural summaries</strong> at the top of a page,
        formatted for machine parsing (lists, dl/dt/dd pairs, named
        facts).
      </li>
      <li>
        <strong>FAQ schema</strong>, under-deployed (~4% of sites)
        and cited at roughly 3x the rate of plain pages in AI answers.
      </li>
      <li>
        <strong>Explicit confidence calibration</strong>, language
        bound to numeric probabilities, named limitations, citation-able
        claims.
      </li>
      <li>
        <strong>llms.txt</strong> at the well-known path, a
        Markdown-native sitemap for LLM crawlers, distinct from
        sitemap.xml.
      </li>
    </ul>
    <p>
      Techniques that don't move citation rate: keyword stuffing,
      excessive internal linking, generic AI-generated content. The
      AI layer rewards specificity and machine-readability.
    </p>

    <h2>how asherin applied these recommendations, and what changed</h2>
    <ol>
      <li>
        <strong>llms.txt at /llms.txt.</strong> still published. it
        lists the public pages with one-line descriptions and states the
        honest limits of each room. the glossary cluster it once pointed
        at (sovereign-ai, uncensored-ai, byok-ai, digital-gnostic) was
        removed; those paths now redirect to the blog.
      </li>
      <li>
        <strong>a status column, not a guidance header.</strong> the
        visible summary block this note proposed became the status
        column every article carries: current, archived, research or
        reference, with three boundary lines. it states limits before
        claims.
      </li>
      <li>
        <strong>triple JSON-LD on every article.</strong>{" "}
        Article + FAQPage + BreadcrumbList still ship from each record.
      </li>
      <li>
        <strong>crawler policy, reversed.</strong> this note once argued
        for an ai-crawler allowlist. robots.txt now disallows GPTBot,
        ClaudeBot, PerplexityBot, OAI-SearchBot, CCBot and the rest, and
        the edge answers them with a 403. search engines may read the
        public pages; model trainers and bulk scrapers may not. the
        trade was made knowingly: being cited inside an answer engine
        was not worth feeding the corpus.
      </li>
      <li>
        <strong>confidence-calibrated language.</strong> a claim is a
        specific number or a named limitation. the same{" "}
        <a href="/blog/how-ai-predictive-forecasting-works">
          calibration discipline used in forecasting
        </a>{" "}
        is applied to the public copy.
      </li>
    </ol>

    <h2>one thing the paper didn't recommend</h2>
    <p>
      public verification. the C-SEO Bench paper didn't propose
      publishing a hit-or-miss record on a platform's own forecasts and
      claims. this note proposed it; no such ledger was ever published,
      and the forecasting room that would have fed it is retired. what
      survives is the rule: a forecast carries a verification plan, a
      report carries a named limitation.
    </p>

    <h2>a named limitation</h2>
    <p>
      C-SEO is an emerging discipline, and the citation-rate
      measurements in the literature are observational, not causal. no
      longitudinal evaluation of this site was ever run, and with the
      crawler policy reversed none will be. the method is kept here
      because the structural half of it, machine-readable summaries and
      honest limits, is good practice for human readers too.
    </p>

    <FaqJsonLd
      id="how-aureon-uses-c-seo-research"
      items={[
        {
          q: "What is C-SEO?",
          a: "C-SEO (conversational SEO) is the discipline of being cited inside AI-generated answers. The term was formalized by the C-SEO Bench paper in June 2025, the first peer-reviewed benchmark of techniques that move citation rate inside LLM responses.",
        },
        {
          q: "What is llms.txt?",
          a: "A Markdown-native sitemap for LLM crawlers, published at the well-known path /llms.txt. It lists the site's pages with one-sentence descriptions and points to cluster spines. Distinct from sitemap.xml, which targets classical search crawlers.",
        },
        {
          q: "Which JSON-LD schemas matter most for AI search?",
          a: "Article, FAQPage, and BreadcrumbList in combination. FAQPage in particular is under-adopted (~4% of sites) and cited at roughly 3x the rate of plain pages inside AI answers, per the C-SEO Bench paper.",
        },
        {
          q: "Should I block AI crawlers in robots.txt?",
          a: "only if being cited inside AI answers matters less to you than keeping your copy out of training corpora. asherin made that trade: robots.txt now disallows GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot and the rest, while search engines may still read the public pages.",
        },
      ]}
    />

    <RelatedLinks
      links={[
        {
          to: "/blog/how-ai-predictive-forecasting-works",
          label: "how AI predictive forecasting works",
          description: "the same calibration discipline applied to predictions instead of copy.",
        },
        {
          to: "/blog/how-we-make-aureon-sound-human",
          label: "how we make shepherd sound human",
          description: "the voice the public copy is written in.",
        },
      ]}
    />
  </ArticleShell>
);

export default HowAureonUsesCseoResearch;
