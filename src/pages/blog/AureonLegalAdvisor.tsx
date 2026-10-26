import ArticleShell from "@/components/seo/ArticleShell";
import RelatedLinks from "@/components/seo/RelatedLinks";
import {
  ArticleJsonLd,
  BreadcrumbJsonLd,
  FaqJsonLd,
} from "@/components/seo/SeoJsonLd";

/**
 * /blog/aureon-legal-advisor-multi-jurisdictional
 *
 * archived note on the July 8, 2026 "LAW mode" composer toggle — a
 * multi-jurisdictional legal-research frame. the toggle (and the NAR pill
 * beside it) is gone from the composer; the frame survives as a prompt.
 */
const URL = "https://asherin.com/blog/aureon-legal-advisor-multi-jurisdictional";
const PUBLISHED = "2026-07-08";

const FAQ = [
  {
    q: "What was LAW mode?",
    a: "a retired per-message composer toggle. it framed a request around the jurisdiction you named, asked for primary authority and conflicts, and required uncertainty and a not-legal-advice notice. the toggle is gone; the same frame can be written into any prompt to shepherd.",
  },
  {
    q: "Does legal research in chat replace a lawyer?",
    a: "No. it is orientation, not advice. a licensed attorney in the relevant jurisdiction is required before acting, and shepherd is asked to say so on every legal answer.",
  },
  {
    q: "How does LAW mode handle older laws that override newer ones?",
    a: "Legal mode asks for older and newer controlling authority and for conflicts to be named. It cannot guarantee complete coverage or enforceability; verify current primary sources and consult licensed counsel.",
  },
  {
    q: "Can LAW mode fabricate case citations?",
    a: "The directive explicitly forbids invented citations. When the model is not certain a case, statute number, or section exists, it must say so and refuse to render a fake citation.",
  },
];

const AureonLegalAdvisor = () => {
  return (
    <>
      <ArticleJsonLd
        id="legal-advisor"
        url={URL}
        headline="law mode, an archived composer toggle for legal research"
        description="an archived note on the retired law mode toggle: jurisdiction-specific research, source verification, uncertainty, and the boundary between research support and legal advice."
        datePublished={PUBLISHED}
        keywords={[
          "asherin legal advisor",
          "ai legal research",
          "multi-jurisdictional law ai",
          "older laws superseding newer",
          "law mode asherin",
          "asher legal ai",
        ]}
      />
      <BreadcrumbJsonLd
        id="legal-advisor"
        items={[
          { name: "asherin", url: "/" },
          { name: "blog", url: "/blog" },
          { name: "law mode, archived", url: URL },
        ]}
      />
      <FaqJsonLd id="legal-advisor" items={FAQ} />

      <ArticleShell
        eyebrow="archived · composer mode"
        publishedLabel="Jul 8 2026"
        readTime="8 min"
        title="law mode, an archived composer toggle for legal research"
        dek="a retired per-message setting that framed a request around the named jurisdiction, asked for primary authority and conflicts, preserved uncertainty and required a not-legal-advice notice. the toggle is gone; the frame survives as a prompt you can write yourself."
      >
        <p>
          <strong>status.</strong> archived. the LAW pill and the NAR pill
          beside it were removed from the composer when asherin became a
          local app; there is no legal mode in the code today. the
          research frame they applied is reproduced below so you can write
          it into a prompt to shepherd yourself. nothing on this page is
          legal advice.
        </p>

        <h2>Why LAW mode existed</h2>
        <p>
          Legal answers fail quietly. A model that quotes the newest
          statute and stops there is confident, fast, and often wrong
          because in most legal systems there is an older instrument
          that continues to control. Colonial-era acts still bind former
          Commonwealth jurisdictions. Uncodified common law overrides
          statute in narrow but decisive slices. Constitutional
          carve-outs can strip a modern law of effect the moment it is
          challenged. Legal mode asks the model to inspect that hierarchy
          and state what it could not verify before it answers.
        </p>

        <h2>How the reflex works</h2>
        <p>
          a single toggle in the composer, the <strong>LAW</strong>{" "}
          pill, sitting next to <strong>NAR</strong>, flipped the send
          path. when it was on, your prompt was wrapped in a legal-research
          frame before it reached the selected model. retrieval quality
          still depended on the model and the sources available for the
          request. the frame was five steps:
        </p>
        <ol>
          <li>
            <strong>Extract jurisdiction.</strong> Country, state or
            province, and city when the user names one. If jurisdiction
            is ambiguous, the answer opens by naming the ambiguity
            rather than guessing.
          </li>
          <li>
            <strong>Enumerate sources.</strong> Constitution, primary
            legislation, delegated legislation, judicial precedent,
            uncodified common law, colonial carryovers, and any
            supranational instruments (EU directives, ECOWAS protocols,
            African Union, OAS, etc.) that bind the jurisdiction.
          </li>
          <li>
            <strong>Detect possible conflicts.</strong> When retrieved
            instruments speak to the same question, legal mode asks the
            model to name both and explain the possible hierarchy while
            marking anything it could not verify.
          </li>
          <li>
            <strong>Refuse fabricated citations.</strong> The directive
            forbids invented case numbers, statute sections, and article
            numbers. Where the model is not certain, it says so on the
            record.
          </li>
          <li>
            <strong>Ship the disclaimer.</strong> Every output ends with
            a mandatory notice: this is intelligence, not legal advice;
            engage a licensed attorney in the relevant jurisdiction
            before acting.
          </li>
        </ol>

        <h2>Older laws that quietly override newer ones</h2>
        <p>
          The most common failure mode of general-purpose AI on legal
          questions is confidently citing the newest statute while an
          older instrument still controls. LAW mode targets exactly
          this. A few live examples of the pattern the reflex was built
          to catch:
        </p>
        <ul>
          <li>
            Commonwealth jurisdictions that never repealed a colonial
            criminal code section, so the modern penal act appears to
            govern but the older section still supplies the operative
            definition.
          </li>
          <li>
            US states where a nineteenth-century statute of frauds
            survives modernization and quietly voids a contract that
            would otherwise be valid under the newest commercial code.
          </li>
          <li>
            Civil-law countries where a Napoleonic-era article of the
            civil code was never fully displaced by a specialized modern
            statute, so the older article decides the edge case.
          </li>
          <li>
            Constitutional carve-outs that make a modern statute
            unenforceable against a protected class of speech, worship,
            or property.
          </li>
        </ul>
        <p>
          Missing one of these is not a rounding error, it is the
          difference between the answer being useful and the answer
          being wrong.
        </p>

        <h2>Where LAW mode sat in the composer</h2>
        <p>
          LAW mode sat beside one other toggle, both now removed:
        </p>
        <ul>
          <li>
            <strong>NAR</strong>, converts a raw prompt into a
            structured narrative before sending, so the model sees
            intent, context, and flaw analysis instead of a wall of
            text. Use for planning, briefing, and multi-step reasoning.
          </li>
          <li>
            <strong>LAW</strong>, wraps a prompt in the
            legal-research directive above. Use whenever you are asking
            a jurisdictional question, running a compliance sweep, or
            trying to understand the enforceable law in a foreign
            country.
          </li>
        </ul>
        <p>
          The two toggles are independent. Turn on both when you want a
          structured narrative frame <em>and</em> full legal enumeration
, for example, a due-diligence memo on operating in a new
          jurisdiction.
        </p>

        <h2>What LAW mode is not</h2>
        <p>
          LAW mode is <strong>not</strong> a replacement for a licensed
          attorney. It is not a substitute for a jurisdiction-local
          research service where the stakes justify one. It cannot see
          sealed dockets, private counsel opinions, or unpublished
          agency guidance. It will not draft a filing or sign an
          engagement letter. The disclaimer at the bottom of every LAW
          output is the honest boundary of what the reflex can do.
        </p>

        <h2>How to get the same frame today</h2>
        <ol>
          <li>
            Open <a href="/dashboard">chat</a> with shepherd.
          </li>
          <li>
            name the jurisdiction yourself and ask for the five steps
            above: controlling authority old and new, conflicts named,
            nothing invented, uncertainty marked, and a closing note that
            this is research, not advice.
          </li>
          <li>
            ask a jurisdictional question, for example, <em>"What are
            the current employer notice requirements before terminating
            an at-will employee in Montana, and does any older statute
            override the modern rule?"</em>
          </li>
          <li>
            read the structured output, then verify every citation against
            the primary source before relying on it.
          </li>
        </ol>

        <RelatedLinks
          links={[
            {
              to: "/dashboard",
              label: "chat with shepherd",
              description: "where the frame above is written into a prompt today.",
            },
            {
              to: "/blog/ai-without-restrictions",
              label: "AI with operator choice, the practical workflow",
              description: "model choice and prompt discipline for long sessions.",
            },
            {
              to: "/blog/what-is-ai-osint",
              label: "what is AI OSINT?",
              description: "the collection and cross-validation discipline legal research borrows.",
            },
          ]}
        />
      </ArticleShell>
    </>
  );
};

export default AureonLegalAdvisor;
