import { useEffect } from "react";
import ArticleShell from "@/components/seo/ArticleShell";
import {
  ArticleJsonLd,
  BreadcrumbJsonLd,
  FaqJsonLd,
} from "@/components/seo/SeoJsonLd";
import { applySeoHead } from "@/lib/seoHead";

/**
 * /blog/cloud-intelligence-suite
 *
 * Product briefing for Cloud Intelligence — the Google-account substrate
 * that turns mail, messages, calendar, and contacts into ICD-203-graded
 * intelligence products. Covers POSTMARK, VOICEPRINT, SIGNAL, Meet Vault,
 * and the contact dossier pipeline.
 */

const URL = "https://asherin.com/blog/cloud-intelligence-suite";
const TITLE =
  "Cloud Intelligence, turning your inbox, messages and calls into graded intelligence";
const DEK =
  "Cloud Intelligence works with Google data you explicitly authorize, including supported mail, calendar, contact, and file records. Coverage depends on the permissions and records the connected account exposes.";
const PUBLISHED = "2026-08-03T00:00:00.000Z";

const Box = ({ children }: { children: React.ReactNode }) => (
  <pre className="not-prose my-8 overflow-x-auto rounded-lg border border-border/40 bg-card/40 p-5 text-[12px] leading-[1.55] font-mono text-foreground/85 whitespace-pre">
    {children}
  </pre>
);

const CloudIntelligenceSuite = () => {
  useEffect(() => {
    applySeoHead({
      title: TITLE,
      description:
        "Cloud Intelligence briefing: POSTMARK email header forensics, VOICEPRINT call metadata, SIGNAL message comprehension, Meet Vault recordings, and contact dossiers built to ICD 203/206 analytic standards.",
      path: "/blog/cloud-intelligence-suite",
    });
  }, []);

  return (
    <>
      <ArticleJsonLd
        id="cloud-intelligence-suite"
        url={URL}
        headline={TITLE}
        description={DEK}
        datePublished={PUBLISHED}
        author="Asherin R&D"
        keywords={[
          "cloud intelligence",
          "email header forensics",
          "email metadata analysis",
          "SMS intelligence",
          "Google Voice metadata",
          "contact intelligence report",
          "ICD 203 analytic standards",
          "OSINT dossier",
        ]}
      />
      <BreadcrumbJsonLd
        id="cloud-intelligence-suite-crumbs"
        items={[
          { name: "Asherin", url: "/" },
          { name: "Journal", url: "/blog" },
          { name: "Cloud Intelligence", url: "/blog/cloud-intelligence-suite" },
        ]}
      />
      <FaqJsonLd
        id="cloud-intelligence-suite-faq"
        items={[
          {
            q: "What does Cloud Intelligence connect to?",
            a: "Your own Google accounts, multiple at once. Mail, Contacts, Calendar, Voice, and Drive-linked Meet recordings. Each account is authorised separately by you and can be revoked independently.",
          },
          {
            q: "What is POSTMARK?",
            a: "POSTMARK is the email metadata forensics module. It reads full message headers, Received chains, SPF/DKIM/DMARC verdicts, originating IP and ASN, mailer fingerprints, and timezone offsets, and turns them into an authenticity and origin assessment rather than a spam score.",
          },
          {
            q: "Does it read the content of my messages?",
            a: "Comprehension works only on records exposed by an account you authorize. Your connected-account results are isolated to your signed-in account, and access can be revoked.",
          },
          {
            q: "What analytic standards does the report follow?",
            a: "Reports are structured as BLUF-first products with an explicit analytic confidence matrix, competing hypotheses adjudication, and ranked priority intelligence requirements, the format used in professional intelligence writing.",
          },
        ]}
      />

      <ArticleShell
        eyebrow="Product Briefing · Cloud Intelligence"
        title="Cloud Intelligence, your own accounts, read like an analyst reads them"
        dek={DEK}
        publishedLabel="Aug 3 2026"
        readTime="13 min"
      >
        <h2>1. The premise</h2>
        <p>
          Every mailbox is already an intelligence archive. It records who
          contacted whom, through which infrastructure, at what hour, with
          what authentication posture, and how that pattern drifted over
          years. Mail clients throw almost all of it away because their job
          is to show you a message. Cloud Intelligence keeps it, because
          its job is to show you a <em>pattern</em>.
        </p>
        <p>
          The suite connects to your own Google accounts, as many as you
          want, and builds five products from them: email forensics, voice
          forensics, message comprehension, a recordings vault, and a
          per-contact dossier that fuses all four with open-source
          collection.
        </p>

        <h2>2. POSTMARK, email metadata forensics</h2>
        <p>
          POSTMARK is header-first. A message body can be written to say
          anything; the envelope that carried it cannot easily lie about
          the path it took.
        </p>
        <Box>{`POSTMARK, message envelope read
 ┌────────────────────────────────────────────────────────────┐
 │ RECEIVED CHAIN     5 hops · 2 continents · 3.4 s total     │
 │   hop 1  mta-out.sender.tld    198.51.100.x   AS64500      │
 │   hop 2  relay.transit.tld     203.0.113.x    AS64511      │
 │   hop 3  inbound.recipient.tld ...                          │
 ├────────────────────────────────────────────────────────────┤
 │ AUTH               SPF pass · DKIM pass (d=sender.tld)     │
 │                    DMARC pass · alignment relaxed          │
 ├────────────────────────────────────────────────────────────┤
 │ MAILER             X-Mailer fingerprint → bulk platform    │
 │ TZ OFFSET          +05:30  (consistent across 41 messages) │
 │ SEND WINDOW        09:12, 18:44 local · weekday-only      │
 └────────────────────────────────────────────────────────────┘
 ASSESSMENT: origin consistent with stated organisation.
             No relay anomaly. No auth downgrade observed.`}</Box>
        <p>
          The value is longitudinal. One header is trivia; forty-one
          headers from the same correspondent produce a send-window
          profile, a timezone claim, and an infrastructure baseline, and
          the first message that violates that baseline becomes a finding
          instead of an unread email.
        </p>

        <h2>3. VOICEPRINT, call and voicemail metadata</h2>
        <p>
          VOICEPRINT does the same work on the voice side: number
          provenance, carrier and line-type, call duration distributions,
          answer-versus-voicemail ratio, hour-of-day density, and burst
          detection. A number that has only ever produced eleven-second
          unanswered calls at 03:00 has a shape, and that shape is
          reportable without ever touching audio.
        </p>

        <h2>4. SIGNAL, unified message comprehension</h2>
        <p>
          Google Voice threads and Android SMS threads are two silos
          describing one relationship. SIGNAL merges them per correspondent
, normalising numbers to E.164, resolving aliases, and stitching
          the thread into a single chronology, then summarises who the
          correspondent is, what the recurring topics are, and where the
          tone or frequency shifted.
        </p>
        <Box>{`SIGNAL, correspondent view
  +1 555 019 8842  ▸ resolved: "M. Rector" (contacts + mail overlap)
  ├─ google voice   118 messages   2024-02 → 2026-07
  ├─ android sms     44 messages   2025-11 → 2026-08
  ├─ merged thread  162 messages   first 2024-02-19
  ├─ cadence shift  2026-05  ×3.1 message rate increase
  └─ topics         scheduling · logistics · payment references`}</Box>

        <h2>5. Meet Vault</h2>
        <p>
          Meetings you recorded live in Drive but are addressed through
          Calendar. Meet Vault reconciles the two: it walks calendar
          history, matches each event to its recording artefact, and gives
          you one list where every past meeting is streamable and
          downloadable with its participants and duration attached.
        </p>

        <h2>6. The contact dossier, where it all converges</h2>
        <p>
          The per-contact report is the suite's headline product. It fuses
          the internal signal above with open-source collection, the
          identifier sweep, the exposure sweep, and archival retrieval
, and then writes the result the way an analyst is trained to
          write it.
        </p>
        <Box>{`CONTACT DOSSIER, structure
 1  BLUF                    the judgement, first, in three lines
 2  ANALYTIC CONFIDENCE     source diversity · corroboration ·
                            anchoring · completeness · deception
                            tolerance  →  banded verdict
 3  IDENTITY ADJUDICATION   H1 genuine · H2 collision · H3 spoof
                            each supported / rejected with reasons
 4  CONTACT & LOCATION      addresses, secondary emails, numbers
                            each with its credibility band
 5  FAMILY & KIN            relatives extracted from directories
                            cross-checked against association ring
 6  CHRONOLOGY              deduped dated sightings, oldest first
 7  IMAGERY                 captured photos with cluster scores
 8  PIR                     ranked next collection steps`}</Box>
        <p>
          Two structural rules keep it honest. First, the confidence matrix
          is computed from the record set, not asserted, four independent
          authoritative surfaces over seven years reads differently from
          nine hits on one aggregator. Second, competing hypotheses are
          always written out and explicitly rejected or sustained, so a
          name collision can never be silently resolved in the narrative.
        </p>

        <h2>7. Automation posture</h2>
        <p>
          Analysis runs when you request it from an authorized connection.
          The interface reports unavailable permissions, empty sources, and
          provider failures instead of implying that collection continued
          while the application was closed.
        </p>

        <h2>8. Consent, scope, and revocation</h2>
        <p>
          Every account is authorised by you and can be disconnected on its
          own without disturbing the others. Derived records remain isolated
          to your signed-in account. Metadata modules are deliberately envelope-only
, they do not need bodies to do their work, so they do not take
          them.
        </p>

        <h2>9. FAQ</h2>
        <h3>Can it profile someone who has only ever emailed me once?</h3>
        <p>
          It will try, and it will say so. A single-contact profile is
          reported with low completeness and low corroboration, and the PIR
          block will list what would be needed to raise it.
        </p>
        <h3>Does it work with more than one Google account?</h3>
        <p>
          Yes, that is the intended configuration. Personal, work, and
          legacy accounts each contribute, and overlap between them is
          itself a corroboration signal.
        </p>
        <h3>Is Cloud Intelligence included?</h3>
        <p>
          Yes. Cloud Intelligence and Asherin Maps ship with the app. Model
          reasoning inside the dossier runs on the key you connect on your
          own device.
        </p>
      </ArticleShell>
    </>
  );
};

export default CloudIntelligenceSuite;
