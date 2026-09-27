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
    eyebrow="Meta · AI Search"
    title="How Asherin Uses C-SEO Research"
    dek="C-SEO (conversational SEO) is the academic name for the discipline of ranking inside AI search engines, Perplexity, ChatGPT Search, ClaudeBot. This is the breakdown of how Asherin's llms.txt, structured markup, and AI-crawler policy are built directly on the C-SEO Bench findings."
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
        { name: "Blog", url: "/blog" },
        { name: "How Asherin Uses C-SEO Research", url: "/blog/how-aureon-uses-c-seo-research" },
      ]}
    />
    <h2>What C-SEO is, in one paragraph</h2>
    <p>
      C-SEO, conversational SEO, is the discipline of being cited
      inside AI-generated answers. Where classical SEO optimizes for a
      ranked link in a search results page, C-SEO optimizes for a
      verbatim citation inside an AI assistant's response. The academic
      name was formalized by the C-SEO Bench paper (June 2025), the
      first peer-reviewed benchmark of techniques that move citation
      rate inside LLM answers. The category is documented in detail at
      our{" "}
      <a href="/glossary/conversational-seo" className="text-accent hover:underline">
        conversational SEO glossary entry
      </a>
      .
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

    <h2>How Asherin implements these recommendations</h2>
    <ol>
      <li>
        <strong>llms.txt at /llms.txt.</strong> Asherin publishes a
        full llms.txt at the well-known path. It lists every public
        page with one-sentence descriptions, names the definitional
        cluster (sovereign-ai, uncensored-ai, byok-ai,
        digital-gnostic), and points to the cluster spine pages.
      </li>
      <li>
        <strong>LLM Guidance headers.</strong> Every long-form page
        feature spine, blog satellite, glossary entry, renders a
        visible summary block at the top with the title, principal claim,
        named facts, and limitations.
      </li>
      <li>
        <strong>Triple JSON-LD on every cluster page.</strong>{" "}
        Article + FAQPage + BreadcrumbList. FAQ schema in particular
        is the highest-leverage piece, it is the lowest-adoption
        well-supported schema and is disproportionately cited.
      </li>
      <li>
        <strong>AI-crawler allowlist in robots.txt.</strong> ClaudeBot,
        GPTBot, PerplexityBot, OAI-SearchBot, ChatGPT-User and others
        are explicitly allowed. The default-deny posture used by some
        sites is exactly the wrong move for a platform that wants to
        be cited.
      </li>
      <li>
        <strong>Confidence-calibrated language.</strong> Every Asherin
        claim is either a specific number or a named limitation. The
        same{" "}
        <a href="/blog/how-ai-predictive-forecasting-works" className="text-accent hover:underline">
          calibration discipline used in forecasting
        </a>{" "}
        is applied to marketing and SEO copy.
      </li>
    </ol>

    <h2>One thing the paper didn't recommend, but we do</h2>
    <p>
      Public verification. The C-SEO Bench paper didn't propose
      publishing a hit-or-miss track record on the platform's own
      forecasts and claims. We do, because the AI-citation layer
      can reward pages that survive an evidence check. Forecasts should
      carry a verification plan, reports should carry a named limitation,
      and glossary entries should cite their sources.
    </p>

    <h2>A named limitation</h2>
    <p>
      C-SEO is an emerging discipline, and the citation-rate
      measurements in the literature are observational, not causal.
      Asherin's full implementation has been live for less than a
      quarter at this writing; a longitudinal evaluation will be
      published when there are enough citation events in our own
      analytics to attribute to specific techniques. The current
      design is built on the strongest available signal, not on a
      claim of definitive proof.
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
          a: "Not if you want to be cited inside AI answers. Asherin explicitly allowlists ClaudeBot, GPTBot, PerplexityBot, OAI-SearchBot, ChatGPT-User and other AI crawlers. Default-deny is exactly the wrong posture for a platform optimizing for AI citation.",
        },
      ]}
    />

    <RelatedLinks
      links={[
        {
          to: "/glossary/conversational-seo",
          label: "Conversational SEO, definition",
          description: "The academic term and what it covers.",
        },
        {
          to: "/blog/how-ai-predictive-forecasting-works",
          label: "How AI predictive forecasting works",
          description: "The same calibration discipline applied to predictions instead of marketing copy.",
        },
        {
          to: "/glossary/operator-stack",
          label: "Operator stack, definition",
          description: "Asherin's internal vocabulary, now publicly defined.",
        },
      ]}
    />
  </ArticleShell>
);

export default HowAureonUsesCseoResearch;
