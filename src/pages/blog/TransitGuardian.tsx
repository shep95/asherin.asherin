import { useEffect } from "react";
import ArticleShell from "@/components/seo/ArticleShell";
import {
  ArticleJsonLd,
  BreadcrumbJsonLd,
  FaqJsonLd,
} from "@/components/seo/SeoJsonLd";
import { applySeoHead } from "@/lib/seoHead";

/**
 * /blog/transit-guardian
 *
 * Product briefing for Transit Guardian — rideshare and multi-modal
 * travel safety: plate-anchored driver identity, full-trip telemetry,
 * and expansion from cars to rail, air, bus, and sea.
 */

const URL = "https://asherin.com/blog/transit-guardian";
const TITLE =
  "Trip safety research, what browser telemetry can and cannot establish";
const DEK =
  "An archived research note on plate checks, phone motion signals, route deviation, and evidence preservation. It is not a current Asherin room, a driver identity service, or a safety guarantee.";
const PUBLISHED = "2026-08-05T00:00:00.000Z";

const Box = ({ children }: { children: React.ReactNode }) => (
  <pre className="not-prose my-8 overflow-x-auto rounded-lg border border-border/40 bg-card/40 p-5 text-[12px] leading-[1.55] font-mono text-foreground/85 whitespace-pre">
    {children}
  </pre>
);

const TransitGuardian = () => {
  useEffect(() => {
    applySeoHead({
      title: TITLE,
      description:
        "Archived trip-safety research on user-recorded ride details, browser telemetry, route deviation, and evidence limits.",
      path: "/blog/transit-guardian",
    });
  }, []);

  return (
    <>
      <ArticleJsonLd
        id="transit-guardian"
        url={URL}
        headline={TITLE}
        description={DEK}
        datePublished={PUBLISHED}
        author="Asherin R&D"
        keywords={[
          "rideshare safety",
          "uber driver check",
          "lyft driver check",
          "licence plate lookup",
          "trip telemetry",
          "route deviation alert",
          "travel safety app",
          "multi-modal transit tracking",
        ]}
      />
      <BreadcrumbJsonLd
        id="transit-guardian-crumbs"
        items={[
          { name: "Asherin", url: "/" },
          { name: "Journal", url: "/blog" },
          { name: "Transit Guardian", url: "/blog/transit-guardian" },
        ]}
      />
      <FaqJsonLd
        id="transit-guardian-faq"
        items={[
          {
            q: "What does Transit Guardian do before a ride starts?",
            a: "The retired concept proposed recording the plate, displayed driver name, and visible vehicle description. Those observations could flag a mismatch but could not certify identity or safety.",
          },
          {
            q: "What telemetry does it capture during the trip?",
            a: "A compatible browser may expose location and motion signals after permission. Posted speed limits, lateral movement, and transport data require separate sources and may be unavailable or imprecise.",
          },
          {
            q: "Does it work for anything other than cars?",
            a: "The research considered other transport modes, but this archived concept is not a current tracking service and makes no coverage promise.",
          },
          {
            q: "Who can see my trip record?",
            a: "The proposed design isolated records to the signed-in owner and explicit shares. Transit Guardian itself is not a current Asherin room.",
          },
        ]}
      />

      <ArticleShell
        eyebrow="Archived Research · Trip Safety"
        title="The ride can leave evidence, not certainty"
        dek={DEK}
        publishedLabel="Aug 5 2026"
        readTime="11 min"
      >
        <h2>1. The gap this closes</h2>
        <p>
          A rideshare app shows you a name, a photo, a plate, and a star
          rating for about forty seconds, and then that information ceases
          to exist for you. If anything goes wrong, the only record of the
          journey belongs to the platform. Transit Guardian gives the
          passenger a parallel record, one they own, one that survives the
          trip, and one that is anchored to identifiers a stranger cannot
          casually fake.
        </p>

        <h2>2. Pre-ride, plate-anchored identity</h2>
        <p>
          A plate and the driver name shown by a rideshare service can be
          recorded as observations. Public registration access varies by
          jurisdiction, so those observations cannot certify an identity.
          A useful check reports visible mismatches and the source of every
          corroborating record instead of presenting a safety verdict.
        </p>
        <Box>{`PRE-RIDE CHECK
  plate         7XYZ123        app-stated vehicle: silver sedan
  observed      silver sedan   ✓ match
  driver name   "D. K."        ✓ consistent across 2 surfaces
  ─────────────────────────────────────────────────────────
  FLAGS         none
  CONFIDENCE    moderate, 2 corroborating surfaces
  GUIDANCE      proceed; live trip sharing armed`}</Box>
        <p>
          A mismatch is not a verdict, it is a prompt. A plate that does
          not match the described vehicle class is the single most useful
          pre-ride signal there is, and Guardian surfaces it in the seconds
          you actually have to act on it.
        </p>

        <h2>3. In-trip, the telemetry the platform keeps for itself</h2>
        <p>
          Rideshare operators already derive driver-behaviour scores from
          phone sensors. Guardian derives the same class of signal for the
          passenger, on the passenger's device.
        </p>
        <Box>{`TRIP TELEMETRY, 27 min · 19.4 km
 ┌───────────────────────┬───────────────────────────────────┐
 │ speed vs posted limit │ 3 exceedances · max +18 km/h      │
 │ harsh braking         │ 2 events (>0.45 g)                │
 │ harsh acceleration    │ 1 event                           │
 │ lateral swerve        │ 4 events · clustered 11-13 min    │
 │ stop duration         │ 1 unscheduled stop · 2 m 40 s     │
 │ corridor deviation    │ none beyond tolerance             │
 │ night / weather       │ night · wet surface               │
 └───────────────────────┴───────────────────────────────────┘
 SAFETY SCORE  72 / 100   band: acceptable-with-notes
 NOTE          swerve cluster coincides with speed exceedance`}</Box>
        <p>
          Sampling is adaptive: dense while the vehicle is moving and
          changing state, sparse when it is stationary, which keeps battery
          cost proportionate to information gained. Everything is
          checkpointed continuously, so a phone that dies mid-trip still
          leaves a complete record up to the last checkpoint.
        </p>

        <h2>4. Route deviation, done correctly</h2>
        <p>
          Naïve deviation alerts compare the vehicle against a single
          planned polyline and fire constantly on legitimate detours.
          Guardian compares against an expected <em>corridor</em>, a
          tolerance band derived from the route, widened around
          interchanges and known congestion, narrowed on limited-access
          segments. An alert fires when the vehicle leaves the corridor and
          keeps leaving it, not when it takes a parallel street.
        </p>

        <h2>5. From cars to everything else</h2>
        <p>
          The research model is mode-agnostic: an observed identifier, an
          expected corridor, a telemetry stream, and stated anomaly rules.
          Real coverage depends on the transport operator and public data
          available for that mode.
        </p>
        <Box>{`MODE COVERAGE
  ROAD   car / rideshare   anchor: plate + driver name
                            corridor: routed road network
  RAIL   train / metro      anchor: service number + operator
                            corridor: line geometry + timetable
  BUS    coach / transit    anchor: route + fleet number
                            corridor: published route + stops
  AIR    scheduled flight   anchor: flight number + tail
                            corridor: filed route + altitude band
  SEA    ferry / vessel     anchor: vessel name + operator
                            corridor: published crossing lane`}</Box>
        <p>
          A delayed train, a flight that holds outside its filed corridor,
          and a car that stops for three minutes in an unlit industrial
          block are the same shape of event to the engine: observed state
          diverging from expected state, above tolerance, for a sustained
          window.
        </p>

        <h2>6. Post-trip, the audit</h2>
        <p>
          Every journey closes with a written audit: the identity check as
          it stood at departure, the telemetry summary, every anomaly with
          its timestamp, and a behaviour score with the reasoning that
          produced it. Audits accumulate, so a rider building a history
          across dozens of trips gets a baseline, and an outlier trip
          becomes visible against it rather than judged in isolation.
        </p>

        <h2>7. Privacy posture</h2>
        <p>
          A privacy-preserving implementation keeps each trip private to
          its owner, requires an explicit choice before sharing, and avoids
          pooling observations into profiles of drivers. This archived
          article describes that design standard, not a currently available
          sharing service.
        </p>

        <h2>8. FAQ</h2>
        <h3>Does it need the rideshare app's data?</h3>
        <p>
          No. It works from what you can see: the plate, the name, and your
          own device's sensors. That independence is the point, the record
          is not derived from the platform being audited.
        </p>
        <h3>Will it drain my battery?</h3>
        <p>
          Sampling scales with motion and state change, and the stream is
          checkpointed rather than held in memory. A typical thirty-minute
          urban ride is a small fraction of a charge.
        </p>
        <h3>Can I share a trip live?</h3>
        <p>
          Yes. Arming live sharing issues a revocable link that shows
          position, mode, and anomaly state to whoever you send it to.
        </p>
      </ArticleShell>
    </>
  );
};

export default TransitGuardian;
