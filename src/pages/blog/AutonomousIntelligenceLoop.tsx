import { useEffect } from "react";
import ArticleShell from "@/components/seo/ArticleShell";
import {
  ArticleJsonLd,
  BreadcrumbJsonLd,
  FaqJsonLd,
} from "@/components/seo/SeoJsonLd";
import { applySeoHead } from "@/lib/seoHead";

/**
 * /blog/autonomous-intelligence-loop
 *
 * Product briefing for the Autonomous Intelligence Loop — the five-stage
 * pipeline (recall, fan-out, verify, persist, record) plus Ghost Chain
 * reasoning and the adaptive operator router.
 */

const URL = "https://asherin.com/blog/autonomous-intelligence-loop";
const TITLE =
  "The supervised intelligence loop, how Asherin routes research requests";
const DEK =
  "During an active request, Asherin can detect research intent, recall owner-scoped context, query available sources, preserve citations, and show degraded states. It does not run as an unsupervised background agent.";
const PUBLISHED = "2026-08-07T00:00:00.000Z";

const Box = ({ children }: { children: React.ReactNode }) => (
  <pre className="not-prose my-8 overflow-x-auto rounded-lg border border-border/40 bg-card/40 p-5 text-[12px] leading-[1.55] font-mono text-foreground/85 whitespace-pre">
    {children}
  </pre>
);

const AutonomousIntelligenceLoop = () => {
  useEffect(() => {
    applySeoHead({
      title: TITLE,
      description:
        "Briefing on the Autonomous Intelligence Loop in Asherin: research-intent detection, memory-graph recall, multi-surface fan-out, cross-verification, persistence, and Ghost Chain visible reasoning.",
      path: "/blog/autonomous-intelligence-loop",
    });
  }, []);

  return (
    <>
      <ArticleJsonLd
        id="autonomous-intelligence-loop"
        url={URL}
        headline={TITLE}
        description={DEK}
        datePublished={PUBLISHED}
        author="Asherin R&D"
        keywords={[
          "autonomous AI research agent",
          "AI intelligence loop",
          "memory graph AI",
          "multi model consensus",
          "AI reasoning transparency",
          "adaptive intent routing",
          "AI OSINT automation",
        ]}
      />
      <BreadcrumbJsonLd
        id="autonomous-intelligence-loop-crumbs"
        items={[
          { name: "Asherin", url: "/" },
          { name: "Journal", url: "/blog" },
          {
            name: "Autonomous Intelligence Loop",
            url: "/blog/autonomous-intelligence-loop",
          },
        ]}
      />
      <FaqJsonLd
        id="autonomous-intelligence-loop-faq"
        items={[
          {
            q: "What triggers the loop?",
            a: "Intent detection, not a button. When a message looks like a research task rather than a conversational one, the loop arms itself and runs the pipeline before composing an answer.",
          },
          {
            q: "What is the memory graph?",
            a: "A persistent, per-operator store of entities, identifiers, relationships, and the sources that established them. Later sessions recall it, so a second question about the same subject starts from what was already verified rather than from zero.",
          },
          {
            q: "Why is the reasoning shown?",
            a: "Ghost Chain replaces the generic thinking spinner with the actual chain, which surfaces are being queried, what came back, what was rejected. It makes the wait informative and the output auditable.",
          },
          {
            q: "Does the loop invent sources?",
            a: "No. Verification is a separate stage from generation: claims that cannot be tied to a retrieved record are stripped before the product is written, and links are preserved verbatim through relay.",
          },
        ]}
      />

      <ArticleShell
         eyebrow="Product Briefing · Supervised Research"
         title="The supervised intelligence loop"
        dek={DEK}
        publishedLabel="Aug 7 2026"
        readTime="12 min"
      >
        <h2>1. The problem with tool pickers</h2>
        <p>
          Assistants that expose a menu of tools push the hardest part of
          the job onto the user: knowing which instrument answers the
          question. The operator must already understand the collection
          architecture to use it, which is precisely the expertise the
          product was supposed to supply. The loop removes the menu.
        </p>

        <h2>2. Intent detection</h2>
        <p>
          Every incoming message is classified before it is answered. Most
          traffic is conversational and routes straight through. A subset
          carries research shape, a hard identifier, an entity plus a
          question of fact, a request for provenance, a temporal query
          and that subset arms the pipeline.
        </p>
        <Box>{`INTENT CLASSIFY
  "what do you think about X"        → conversational  · direct
  "who owns example-corp.tld"        → research        · LOOP
  "trace this link"                  → research        · LOOP + ORIGIN
  "is this statute still in force"   → research        · LOOP + LAW
  "summarise this thread"            → comprehension   · direct + context`}</Box>
        <p>
          Detection is deliberately conservative in one direction: a
          misclassified conversational message costs latency, while a
          missed research message costs an unsourced answer. The threshold
          is tuned to prefer the former.
        </p>

        <h2>3. Stage one, recall</h2>
        <p>
          Before anything is collected, the memory graph is queried. If the
          subject has been researched before, the loop starts with the
          entities, identifiers, and verified relationships already on
          record, along with the sources that established them and when.
        </p>
        <Box>{`MEMORY GRAPH, recall
  entity   "example-corp.tld"
   ├── identifier  registrant email      verified 2026-06-14  · 3 srcs
   ├── identifier  registered address    verified 2026-06-14  · 2 srcs
   ├── relation    officer → "A. N."     verified 2026-07-02  · 2 srcs
   ├── relation    successor-of          unverified           · 1 src
   └── gap         no filings after 2024 → open PIR
  ▶ recall reduces this run's fan-out by 6 legs`}</Box>
        <p>
          Recall is not a cache of answers; it is a cache of established
          facts with their provenance. Unverified edges stay marked
          unverified and are re-tested rather than trusted.
        </p>

        <h2>4. Stage two, fan-out</h2>
        <p>
          What recall could not supply is collected in parallel. The router
          selects surfaces by the shape of the gap: identifier gaps go to
          the sweep, document gaps to document intelligence, temporal gaps
          to era-bucket retrieval, relational gaps to the association
          engine, and structural gaps to the exposure sweep. Legs run
          under a concurrency cap with per-leg timeouts and fan back in
          through settled promises, so a dead surface degrades the run
          instead of failing it.
        </p>

        <h2>5. Stage three, verify</h2>
        <p>
          This is the stage that separates a research product from a
          confident paragraph. Verification runs after collection and
          before writing, and it is adversarial by design: every candidate
          claim must be tied to a retrieved record, single-source claims
          are labelled as such, records that disagree are surfaced as
          disagreement rather than averaged, and anything with no
          supporting record is discarded before the answer is composed.
        </p>
        <Box>{`VERIFY
  claim  "registrant address is <X>"
    ├─ record A  registry snapshot 2024-11   supports
    ├─ record B  filing PDF        2023-06   supports
    └─ record C  directory listing 2026-02   CONFLICTS (<Y>)
  ▶ emitted as: contested, two historical sources vs one current.
    Both values reported. Recency does not automatically win.`}</Box>

        <h2>6. Stage four, persist</h2>
        <p>
          Everything verified is written back into the memory graph with
          its sources and timestamp. This is what makes the loop compound:
          the tenth question about a subject is cheaper and sharper than
          the first, and gaps identified in one session become the standing
          collection requirements of the next.
        </p>

        <h2>7. Stage five, record</h2>
        <p>
          The product is written last, from verified material only, in the
          register the operator asked for. Links are preserved verbatim
          a rule enforced at the prompt boundary, because an assistant that
          paraphrases a URL out of existence destroys the auditability the
          previous four stages bought.
        </p>

        <h2>8. Ghost Chain, showing the work</h2>
        <p>
          While the loop runs, the interface renders the chain rather than
          a spinner: which surfaces are open, what has returned, what was
          rejected and why, and which stage is active. Two benefits follow.
          The wait becomes informative, and the output becomes auditable
          before it is even finished, an operator who watches a leg return
          nothing already knows how to read the confidence band that lands
          at the end.
        </p>
        <Box>{`GHOST CHAIN
  ▸ recall        graph hit · 4 established facts, 1 open gap
  ▸ fan-out       12 legs armed · 9 returned · 2 empty · 1 timeout
  ▸ verify        23 candidate claims → 17 supported, 4 single-source,
                                        1 contested, 1 discarded
  ▸ persist       6 new edges written
  ▸ record        composing product…`}</Box>

        <h2>9. Adaptive routing, register, not just content</h2>
        <p>
          A correct answer in the wrong register is a failed answer. The
          adaptive router reads what the operator is actually doing
          quick factual check, deep investigation, legal research, code
          work, map task, and shapes the response accordingly:
          terse and direct where speed is the point, structured and cited
          where rigour is the point, and jurisdiction-strict when legal
          mode is engaged. The router also decides how much of the loop to
          run; a quick check does not deserve a twelve-leg fan-out.
        </p>

        <h2>10. Speed</h2>
        <p>
          A research loop that adds unnecessary delay is not useful. Three
          mechanisms hold the latency down: relevance
          gating prunes surfaces that cannot contribute before they are
          queried, a warm brain cache keeps assembled context resident
          across turns, and recall removes work entirely when the graph
          already holds the answer. The loop gets faster the more it is
          used on the same territory.
        </p>

        <h2>11. FAQ</h2>
        <h3>Does the memory graph leak between conversations?</h3>
        <p>
          The graph is per-operator and deliberately walled from
          conversational carry-over: a fresh chat starts with no prior
          assumptions about the subject and must recall explicitly from the
          graph, with the recall shown in the chain.
        </p>
        <h3>Can I still call a tool directly?</h3>
        <p>
          Yes. Explicit instructions always override the router, the loop
          is a default, not a cage.
        </p>
        <h3>What happens when every surface fails?</h3>
        <p>
          The answer says so. A run with no supported claims returns a
          stated collection failure with the legs that were attempted, not
          a fluent guess.
        </p>
      </ArticleShell>
    </>
  );
};

export default AutonomousIntelligenceLoop;
