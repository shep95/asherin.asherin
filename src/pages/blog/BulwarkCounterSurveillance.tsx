import { useEffect } from "react";
import ArticleShell from "@/components/seo/ArticleShell";
import {
  ArticleJsonLd,
  BreadcrumbJsonLd,
  FaqJsonLd,
} from "@/components/seo/SeoJsonLd";
import { applySeoHead } from "@/lib/seoHead";

/**
 * /blog/bulwark-counter-surveillance
 *
 * Product briefing for BULWARK — counter-surveillance: Bluetooth stalker
 * detection, Wi-Fi sentinel reports, account-compromise forensics, and
 * device legibility probing.
 */

const URL = "https://asherin.com/blog/bulwark-counter-surveillance";
const TITLE =
  "Counter-surveillance research, Bluetooth persistence and browser limits";
const DEK =
  "An archived research note on Bluetooth persistence, network visibility, account evidence, and device legibility. Browser signals can indicate anomalies; they cannot identify a person or continuously monitor a closed device.";
const PUBLISHED = "2026-08-06T00:00:00.000Z";

const Box = ({ children }: { children: React.ReactNode }) => (
  <pre className="not-prose my-8 overflow-x-auto rounded-lg border border-border/40 bg-card/40 p-5 text-[12px] leading-[1.55] font-mono text-foreground/85 whitespace-pre">
    {children}
  </pre>
);

const BulwarkCounterSurveillance = () => {
  useEffect(() => {
    applySeoHead({
      title: TITLE,
      description:
        "BULWARK briefing: persistent-follower Bluetooth detection, Wi-Fi sentinel network audits, account-compromise forensics with origin and VPN assessment, and device legibility probing inside Asherin.",
      path: "/blog/bulwark-counter-surveillance",
    });
  }, []);

  return (
    <>
      <ArticleJsonLd
        id="bulwark-counter-surveillance"
        url={URL}
        headline={TITLE}
        description={DEK}
        datePublished={PUBLISHED}
        author="Asherin R&D"
        keywords={[
          "counter surveillance app",
          "bluetooth stalker detection",
          "airtag tracker detection",
          "wifi network security audit",
          "account compromise forensics",
          "VPN detection",
          "device fingerprint exposure",
        ]}
      />
      <BreadcrumbJsonLd
        id="bulwark-counter-surveillance-crumbs"
        items={[
          { name: "Asherin", url: "/" },
          { name: "Journal", url: "/blog" },
          { name: "BULWARK", url: "/blog/bulwark-counter-surveillance" },
        ]}
      />
      <FaqJsonLd
        id="bulwark-counter-surveillance-faq"
        items={[
          {
            q: "How does BULWARK detect that something is following me?",
            a: "It logs Bluetooth identifiers with time and coarse position, then looks for persistence across disjoint locations. An identifier seen at your home, then a shop three kilometres away, then a car park later that day is a follower, a single strong reading is not.",
          },
          {
            q: "What does the Wi-Fi sentinel report contain?",
            a: "For a network you are joined to: registered operator and address range for the public address, other devices visible on the segment, encryption posture, captive-portal behaviour, and whether the network profile matches a known-good baseline you have joined before.",
          },
          {
            q: "What does compromise forensics reconstruct?",
            a: "When a credential changes, BULWARK assembles the method used, the originating address and its ASN, whether that origin shows the physical characteristics of a VPN or hosting range, the device and client fingerprint, and the timeline of events around the change.",
          },
          {
            q: "Does BULWARK need special hardware?",
            a: "No. It runs on the browser and companion app APIs already available on your devices, and gets stronger the more of your own devices are enrolled, because each one becomes an independent observer.",
          },
        ]}
      />

      <ArticleShell
        eyebrow="Archived Research · Counter-Surveillance"
        title="Counter-surveillance starts with limits"
        dek={DEK}
        publishedLabel="Aug 6 2026"
        readTime="11 min"
      >
        <h2>1. The inversion</h2>
        <p>
          Surveillance works because devices broadcast. Phones, earbuds,
          watches, tags, and car head units emit identifiers continuously,
          and anyone who can log those identifiers over time can build a
          movement profile. BULWARK runs that machine backwards: it logs
          what is broadcasting near <em>you</em>, over time, and asks which
          of those identifiers keeps appearing in places that share nothing
          but your presence.
        </p>

        <h2>2. Persistence, not proximity</h2>
        <p>
          The naïve version of tracker detection alarms on any strong
          nearby signal, which means it alarms constantly in a café and
          never in a car park. The correct signal is co-travel: the same
          identifier observed across locations that are geographically
          disjoint and temporally separated.
        </p>
        <Box>{`FOLLOWER SCORING
  identifier  ••:••:••:4F:2A
  ├─ 08:12  home cluster        rssi -71
  ├─ 09:40  transit corridor    rssi -66      Δ 3.1 km
  ├─ 12:05  retail cluster      rssi -74      Δ 4.8 km
  └─ 18:52  home cluster        rssi -69
  ─────────────────────────────────────────────────────
  disjoint locations   3        temporal spread  10h 40m
  co-travel score      0.86     band  PERSISTENT FOLLOWER
  known-device match   none     ▶ escalate to alert`}</Box>
        <p>
          Devices you own, and devices you have marked as expected, a
          partner's watch, a work laptop, are baselined out. What remains
          is the set of unowned identifiers that behave like they are
          attached to you.
        </p>

        <h2>3. Every device is an observer</h2>
        <p>
          A single phone is one sensor with one noisy antenna. Three
          enrolled devices are three independent observers, and an
          identifier confirmed by two of them at different moments is
          dramatically stronger evidence than one confirmed by one.
          Observations are fused with per-observer weighting, and the
          resulting confidence band is reported alongside the finding
          rather than hidden inside it.
        </p>

        <h2>4. Wi-Fi sentinel</h2>
        <p>
          Joining a network is an act of trust that people perform dozens
          of times a week with no information at all. The sentinel report
          supplies the information.
        </p>
        <Box>{`WI-FI SENTINEL, "GuestNet-5G"
  public address     198.51.100.x
  registered to      <hosting / ISP operator>   ASN 64500
  address class      commercial ISP  (not hosting, not VPN range)
  encryption         WPA2-PSK        ▲ WPA3 available on this hardware
  captive portal     yes · credential-harvest pattern: none observed
  segment neighbours 14 devices visible
                     ├─  9  consumer phones / laptops
                     ├─  3  printers / IoT (2 with open admin ports)
                     └─  2  unidentified
  baseline match     first join, no prior profile
  ─────────────────────────────────────────────────────────────
  ASSESSMENT   usable · avoid credential entry · IoT hygiene poor`}</Box>
        <p>
          Once a network has been joined before, the report also diffs
          against the stored profile. A familiar SSID that has quietly
          changed its operator, its encryption, or its portal behaviour is
          the classic shape of an impersonation network, and the diff
          catches it.
        </p>

        <h2>5. Compromise forensics</h2>
        <p>
          When a password or recovery method changes on a connected
          account, the interesting question is never "was it changed", the
          notification already said so. It is <em>how</em>, and <em>from
          where</em>.
        </p>
        <Box>{`CREDENTIAL CHANGE, reconstruction
  event            password reset via recovery email
  origin           203.0.113.x   ASN 64511
  address class    hosting range  ▲ not a consumer ISP
  claimed geo      Lisbon
  latency probe    RTT inconsistent with Lisbon by ~62 ms
                   ▶ physics-based VPN / relay likelihood: HIGH
  client           headless-capable browser fingerprint
  session          new device, no prior appearance in 180 d
  timeline         recovery mail read 14:02 → reset 14:04
                   → session created 14:04 → mail rule added 14:07
  ─────────────────────────────────────────────────────────────
  ASSESSMENT   hostile takeover pattern. Mail rule is exfiltration
               persistence. Recommend: revoke sessions, remove rule,
               rotate recovery channel.`}</Box>
        <p>
          The VPN assessment deserves a note. Blocklists of known exit
          ranges go stale within days. BULWARK's primary test is physical:
          round-trip latency has a floor set by the speed of light in
          fibre, so a connection claiming a city it cannot possibly reach
          in the observed time is relaying, regardless of what any list
          says.
        </p>

        <h2>6. Device legibility probe</h2>
        <p>
          The last module answers a question most people never ask: how
          identifiable is my own device right now? The probe enumerates the
          fingerprint surface your browser and OS actually expose
          rendering characteristics, font and codec sets, timezone and
          locale, hardware concurrency, and the stability of the resulting
          hash across sessions, and reports how uniquely that combination
          identifies you.
        </p>

        <h2>7. Notification pipeline</h2>
        <p>
          Findings are useless in a tab you are not looking at. BULWARK
          alerts route through a unified pipeline: email for the record,
          and push notifications to laptop and phone for immediacy.
          Severity gates the channel, an IoT hygiene note stays in the
          report, a persistent-follower escalation pushes to every enrolled
          device.
        </p>

        <h2>8. Operating posture</h2>
        <p>
          Browser visibility stops when permissions, operating-system
          policy, or the page lifecycle stops it. Bluetooth discovery and
          network inspection must be initiated where the device requires
          consent. This archived design therefore treats every inactive or
          unavailable sensor as an explicit gap rather than pretending that
          monitoring continues in the background.
        </p>

        <h2>9. FAQ</h2>
        <h3>Will it detect a commercial tracking tag?</h3>
        <p>
          It detects persistence, which is what a tag attached to you
          produces regardless of brand. Identifier rotation reduces
          confidence but rarely eliminates it, because rotation schedules
          themselves leave a pattern across observers.
        </p>
        <h3>Does it store the identifiers of strangers?</h3>
        <p>
          A privacy-preserving implementation scopes observations to the
          signed-in owner, ages them out, and avoids any cross-user device
          directory. This note does not claim that a public device registry
          exists.
        </p>
        <h3>Can it tell me who is following me?</h3>
        <p>
          It tells you that something is, with what confidence, since when,
          and where it was observed. Attribution beyond that is an
          investigative step you take with that evidence, BULWARK is
          careful not to assert an owner it cannot prove.
        </p>
      </ArticleShell>
    </>
  );
};

export default BulwarkCounterSurveillance;
