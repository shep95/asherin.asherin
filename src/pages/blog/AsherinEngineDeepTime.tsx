import { useEffect } from "react";
import ArticleShell from "@/components/seo/ArticleShell";
import {
  ArticleJsonLd,
  BreadcrumbJsonLd,
  FaqJsonLd,
} from "@/components/seo/SeoJsonLd";
import { applySeoHead } from "@/lib/seoHead";

/**
 * /blog/asherin-engine-deep-time
 *
 * Product briefing for the Asherin Engine — the metadata-first search
 * surface inside the dashboard. Covers GHOST HARVEST fan-out,
 * DEEP TIME era-bucket retrieval, DOCUMENT INTELLIGENCE, ORIGIN link
 * forensics, and the IDENTIFIER SWEEP mode.
 */

const URL = "https://asherin.com/blog/asherin-engine-deep-time";
const TITLE =
  "Asherin Engine, metadata-first search, DEEP TIME retrieval & identifier sweeps";
const DEK =
  "The field briefing for the Asherin Engine: a metadata-only search surface that fans a single query into sixteen retrieval legs, walks host lifespans backward through era buckets, extracts document metadata from PDFs, and reduces an email or phone number to a deduplicated 'seen on N surfaces' exposure map.";
const PUBLISHED = "2026-08-02T00:00:00.000Z";

const Box = ({ children }: { children: React.ReactNode }) => (
  <pre className="not-prose my-8 overflow-x-auto rounded-lg border border-border/40 bg-card/40 p-5 text-[12px] leading-[1.55] font-mono text-foreground/85 whitespace-pre">
    {children}
  </pre>
);

const AsherinEngineDeepTime = () => {
  useEffect(() => {
    applySeoHead({
      title: TITLE,
      description:
        "Asherin Engine product briefing: 16-leg GHOST HARVEST fan-out, DEEP TIME era-bucket retrieval, PDF document metadata extraction, ORIGIN redirect forensics, and IDENTIFIER SWEEP exposure mapping.",
      path: "/blog/asherin-engine-deep-time",
    });
  }, []);

  return (
    <>
      <ArticleJsonLd
        id="asherin-engine-deep-time"
        url={URL}
        headline={TITLE}
        description={DEK}
        datePublished={PUBLISHED}
        author="Asherin R&D"
        keywords={[
          "Asherin Engine",
          "metadata search engine",
          "deep time archive search",
          "identifier sweep",
          "public-index search",
          "PDF metadata extraction",
          "link origin forensics",
        ]}
      />
      <BreadcrumbJsonLd
        id="asherin-engine-deep-time-crumbs"
        items={[
          { name: "Asherin", url: "/" },
          { name: "Journal", url: "/blog" },
          { name: "Asherin Engine, DEEP TIME", url: "/blog/asherin-engine-deep-time" },
        ]}
      />
      <FaqJsonLd
        id="asherin-engine-deep-time-faq"
        items={[
          {
            q: "What is the Asherin Engine?",
            a: "A metadata-first search surface inside the Asherin dashboard. Instead of returning ten blue links, it fans one query into sixteen retrieval legs and returns structured exposure records, surface, first-seen, last-seen, snippet, and source link.",
          },
          {
            q: "What does DEEP TIME do?",
            a: "DEEP TIME splits a query across era buckets (pre-2005, 2005-2010, 2010-2015, 2015-2020, 2020-present) and tracks host lifespan so results from dead or rebranded domains still surface. It is how the engine reaches material that current-index search has aged out.",
          },
          {
            q: "What is IDENTIFIER SWEEP?",
            a: "Paste an email address or phone number and the engine returns a deduplicated 'seen on N surfaces' list with first and last-seen dates plus a context snippet per hit. Surfaces are classified, directory, breach index, corporate filing, academic, social, document.",
          },
          {
            q: "Does the engine store the identities I search?",
            a: "Queries and saved results are isolated to the signed-in owner. Cached records keep their provenance so repeated work can reuse evidence without exposing another user's searches.",
          },
        ]}
      />

      <ArticleShell
        eyebrow="Product Briefing · Asherin Engine"
        title="Asherin Engine, metadata-first search and DEEP TIME retrieval"
        dek={DEK}
        publishedLabel="Aug 2 2026"
        readTime="12 min"
      >
        <h2>1. Why a metadata engine and not another search box</h2>
        <p>
          A conventional search engine answers <em>what pages match these
          words right now</em>. An investigation almost never asks that.
          It asks when an identifier first appeared, which surfaces carried
          it, who published the document, whether the host still exists,
          and what the gap between first-seen and last-seen implies. Those
          are metadata questions, and a ranked link list discards exactly
          the fields required to answer them.
        </p>
        <p>
          The Asherin Engine inverts the shape. A query returns records,
          not pages: surface class, host, host lifespan, first-seen date,
          last-seen date, extracted snippet, and the raw link. Ranking is a
          property of the record set, not a replacement for it.
        </p>

        <h2>2. GHOST HARVEST, sixteen-leg fan-out</h2>
        <Box>{`SINGLE QUERY
     │
     ├─ L01  exact-phrase           ├─ L09  filetype:pdf
     ├─ L02  quoted-token permute   ├─ L10  filetype:xls|csv
     ├─ L03  site-class: directory  ├─ L11  filetype:doc|ppt
     ├─ L04  site-class: gov / edu  ├─ L12  archive mirrors
     ├─ L05  site-class: corporate  ├─ L13  paste / dump surfaces
     ├─ L06  site-class: academic   ├─ L14  cached / snapshot
     ├─ L07  site-class: social     ├─ L15  adjacent-identifier pivot
     └─ L08  site-class: news       └─ L16  novel-synthesis theory
     │
     ▼
 DEDUPE (url-normalized) ─▶ DATE CARVE ─▶ SURFACE CLASSIFY ─▶ RECORD SET`}</Box>
        <p>
          Legs run under a bounded concurrency cap with a per-leg timeout,
          then fan back in through <code>Promise.allSettled</code> so one
          slow surface cannot stall the batch. A leg that returns nothing
          is recorded as an explicit zero-hit result, absence of evidence
          is reported, never silently dropped.
        </p>

        <h2>3. DEEP TIME, reaching material the index aged out</h2>
        <p>
          Current-index search is biased toward recency by construction.
          DEEP TIME counteracts that with era-bucket fan-out: the same
          query is re-issued with era-constrained operators, and each
          bucket keeps its own result pool so a 2007 document is not
          out-competed by a 2026 one.
        </p>
        <Box>{`ERA BUCKETS                       HOST LIFESPAN TRACK
 ┌──────────────┬──────────┐      host: example-ngo.org
 │ pre-2005     │  n hits  │      ├─ first observed  2004-03
 │ 2005, 2010  │  n hits  │      ├─ last observed   2019-11
 │ 2010, 2015  │  n hits  │      ├─ status          dormant
 │ 2015, 2020  │  n hits  │      └─ successor       udayan-x.org
 │ 2020, now   │  n hits  │
 └──────────────┴──────────┘      ▶ dormant hosts still yield records
                                    via snapshot + mirror legs`}</Box>
        <p>
          Dates are carved in multiple passes, structured metadata first,
          then in-URL date paths, then in-body datelines, and each carved
          date carries the method that produced it so an analyst can weigh
          it. A date carved from a URL path is not the same evidence as a
          date read from a document's creation field.
        </p>

        <h2>4. DOCUMENT INTELLIGENCE, the metadata under the PDF</h2>
        <p>
          Documents are the richest metadata surface on the open web and
          the most consistently ignored. Uploading a PDF to the engine, or
          letting a retrieval leg fetch one, extracts the author field, the
          producer and creator software, creation and modification stamps,
          embedded title, and keyword block. Producer strings alone often
          identify the exact organisation and workstation generation that
          created a file.
        </p>
        <Box>{`ORIGIN UPLOAD → PDF
  author      : K. Modi
  producer    : Microsoft® Word 2016
  created     : 2019-06-11T09:14:02Z
  modified    : 2019-06-11T09:41:55Z
  title       : Annual Report, Programme Outcomes
  keywords    : childcare, aftercare, delhi
  ▶ pivots emitted: author-name, org-token, creation-window`}</Box>
        <p>
          Every extracted field becomes a pivot. The author name goes back
          into the sweep, the creation window narrows an era bucket, and
          the keyword block seeds a fresh theory batch.
        </p>

        <h2>5. ORIGIN, walking a link back to its publisher</h2>
        <p>
          ORIGIN takes a URL and follows the redirect chain hop by hop,
          recording each intermediate host, its TLS issuer, and the status
          code that produced the hop. Shorteners, tracking wrappers, and
          CDN edges are unwound until a terminal host is reached. Where the
          endpoint is an image, EXIF is read for camera model, software,
          and timestamp.
        </p>
        <p>
          Acquisition is bounded, a 2&nbsp;MB body cap and a 15-second
          wall clock per hop, so a hostile or infinite redirect loop
          degrades to a partial chain with a recorded reason rather than a
          hung worker.
        </p>

        <h2>6. IDENTIFIER SWEEP, one email, N surfaces</h2>
        <p>
          Sweep mode is the engine's most direct workflow. Paste an email
          address or a phone number; the engine anchors every retrieval leg
          on that hard identifier, dedupes by normalized URL, carves dates,
          and classifies each surviving hit into a surface class.
        </p>
        <Box>{`IDENTIFIER SWEEP, kiran@example.org
 ┌────────────────────┬───────────┬────────────┬────────────┐
 │ SURFACE            │ HITS      │ FIRST SEEN │ LAST SEEN  │
 ├────────────────────┼───────────┼────────────┼────────────┤
 │ academic registry  │     3     │ 2019-06-11 │ 2024-02-08 │
 │ ngo directory      │     4     │ 2020-01-22 │ 2026-08-08 │
 │ corporate filing   │     1     │ 2021-09-03 │ 2021-09-03 │
 │ document (pdf)     │     6     │ 2019-06-11 │ 2025-11-19 │
 │ social             │     2     │ 2022-04-17 │ 2026-05-30 │
 └────────────────────┴───────────┴────────────┴────────────┘
 exposure window: 2019-06-11 → 2026-08-08  (7y 2m)`}</Box>
        <p>
          The exposure window is itself a finding. A seven-year continuous
          footprint across five independent surface classes is strong
          anchoring evidence; a three-week footprint on one surface is a
          collision or a fabrication candidate and gets flagged as such.
        </p>

        <h2>7. Every hit carries its link</h2>
        <p>
          A result the analyst cannot open is not a result. Every record in
          every mode renders as a real link with its host and snippet
          beside it, and the same links are preserved verbatim when the
          engine's output is relayed into Asherin chat. Theories that were
          tested and returned nothing are listed separately under a
          zero-hit heading, so the tested-versus-untested boundary is
          always explicit.
        </p>

        <h2>8. Where the engine sits in the stack</h2>
        <Box>{`ASHERIN
  ├── Asherin Chat        ── conversational operator surface
  ├── Cloud Intelligence  ── email / message / contact dossiers
  ├── Asherin Eye         ── maps + public cameras + routing
  └── ASHERIN ENGINE
        ├── GHOST HARVEST        16-leg fan-out
        ├── DEEP TIME            era buckets + host lifespan
        ├── DOCUMENT INTEL       PDF / office metadata
        ├── ORIGIN               redirect walk + EXIF
        └── IDENTIFIER SWEEP     exposure mapping
              │
              └── feeds Cloud Intelligence contact reports`}</Box>

        <h2>9. FAQ</h2>
        <h3>Is the Asherin Engine included?</h3>
        <p>
          Yes. It ships with the app and runs from your own device on the
          model key you connect.
        </p>
        <h3>Does it index anything itself?</h3>
        <p>
          No. The engine is a retrieval and normalisation layer over public
          surfaces. It holds no crawl of its own; it holds the structure it
          derives from what it retrieves.
        </p>
        <h3>What happens when a surface rate-limits?</h3>
        <p>
          The leg backs off with jitter, honours any retry hint it is
          given, and if it still cannot complete it returns a degraded
          result annotated with the reason. The batch never fails whole
          because one leg was throttled.
        </p>
      </ArticleShell>
    </>
  );
};

export default AsherinEngineDeepTime;
