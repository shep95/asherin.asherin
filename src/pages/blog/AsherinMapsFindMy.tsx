import { useEffect } from "react";
import ArticleShell from "@/components/seo/ArticleShell";
import {
  ArticleJsonLd,
  BreadcrumbJsonLd,
  FaqJsonLd,
} from "@/components/seo/SeoJsonLd";
import { applySeoHead } from "@/lib/seoHead";

/**
 * /blog/asherin-maps-find-my
 *
 * Product briefing for Asherin Maps — satellite-first mapping with live
 * DOT camera layers, OSRM Fast Lane routing, resizable layer tree,
 * opt-in device self-reporting, and Bluetooth BLE recovery rings.
 */

const URL = "https://asherin.com/blog/asherin-maps-find-my";
const TITLE =
  "Asherin Maps, satellite-first mapping, live traffic cameras, Fast Lane routing & Bluetooth recovery";
const DEK =
  "Asherin Maps replaces the property-map panel with a satellite-default mapping surface: a resizable layer tree, 2,700+ live DOT traffic cameras, OSRM Fast Lane routing, self-reporting device telemetry from the browsers you sign in on, and Bluetooth recovery rings for hardware that cannot report.";
const PUBLISHED = "2026-08-04T00:00:00.000Z";

const Box = ({ children }: { children: React.ReactNode }) => (
  <pre className="not-prose my-8 overflow-x-auto rounded-lg border border-border/40 bg-card/40 p-5 text-[12px] leading-[1.55] font-mono text-foreground/85 whitespace-pre">
    {children}
  </pre>
);

const AsherinMapsFindMy = () => {
  useEffect(() => {
    applySeoHead({
      title: TITLE,
      description:
        "Asherin Maps briefing: satellite-default imagery, resizable layer tree, 2,700+ live DOT traffic cameras, OSRM Fast Lane routing, self-reported battery and location from the browsers you sign in on, and Bluetooth recovery rings.",
      path: "/blog/asherin-maps-find-my",
    });
  }, []);

  return (
    <>
      <ArticleJsonLd
        id="asherin-maps-find-my"
        url={URL}
        headline={TITLE}
        description={DEK}
        datePublished={PUBLISHED}
        author="Asherin R&D"
        keywords={[
          "Asherin Maps",
          "satellite mapping dashboard",
          "live traffic cameras map",
          "DOT camera feeds",
          "OSRM fastest route",
          "find my bluetooth device",
          "opt-in device reporting",
          "map intelligence",
        ]}
      />
      <BreadcrumbJsonLd
        id="asherin-maps-find-my-crumbs"
        items={[
          { name: "Asherin", url: "/" },
          { name: "Journal", url: "/blog" },
          { name: "Asherin Maps", url: "/blog/asherin-maps-find-my" },
        ]}
      />
      <FaqJsonLd
        id="asherin-maps-find-my-faq"
        items={[
          {
            q: "What is Asherin Maps?",
            a: "The map surface of the Asherin dashboard. It defaults to satellite imagery, supports a layer tree, displays available public roadway camera feeds, and computes routes when the routing service responds.",
          },
          {
            q: "Where do the traffic cameras come from?",
            a: "Public state and municipal Department of Transportation camera feeds, over 2,700 of them, published by the agencies themselves. They are plotted as map layers and opened in place, with no private or residential camera access.",
          },
          {
            q: "How does Bluetooth recovery locate a lost device?",
            a: "Devices report their own position and battery only from a browser where you signed in and granted permission, there is no remote locating of a phone that never reported. For Bluetooth hardware that cannot self-report, Asherin fuses the last-seen RSSI observations from your own reporting browsers into a probability ring showing where it was last within range.",
          },
          {
            q: "Can the assistant drive the map?",
            a: "Yes. The map exposes tool functions to the Asherin assistant, so a natural-language instruction can move the view, drop markers, draw a route, or locate a device without touching the controls.",
          },
        ]}
      />

      <ArticleShell
        eyebrow="Product Briefing · Asherin Maps"
        title="Asherin Maps, satellite-first, camera-aware, assistant-driven"
        dek={DEK}
        publishedLabel="Aug 4 2026"
        readTime="10 min"
      >
        <h2>1. Satellite by default</h2>
        <p>
          A street-line basemap is a diagram; satellite imagery is
          evidence. Asherin Maps opens on imagery because almost every
          question asked of an operational map, what is actually on that
          lot, how many vehicles fit in that yard, where does that track
          run, is answered by pixels rather than by labels. Vector overlay
          remains available on top; it is simply no longer the default
          frame.
        </p>

        <h2>2. A layer tree that behaves like a tool</h2>
        <p>
          The old panel had a fixed-width list. The new tree is resizable
          and scalable: drag it wider when you are managing twenty layers,
          collapse it to a rail when you want the imagery. Groups nest,
          state persists between sessions, and layer toggles do not force a
          re-render of the whole canvas, visibility flips are cheap
          because the layer objects are memoised and keyed independently.
        </p>
        <Box>{`LAYER TREE
 ▸ Imagery
     ● Satellite (default)     ○ Hybrid labels
 ▸ Live feeds
     ● DOT cameras  (2,7xx)    ○ Incidents
 ▸ Mesh
     ● My devices              ● Recovery rings
 ▸ Routing
     ● Fast Lane path          ○ Alternates
 ▸ Analysis
     ○ Markers / annotations   ○ Draw + measure`}</Box>

        <h2>3. Live camera layer</h2>
        <p>
          State and municipal transport agencies publish thousands of
          roadway cameras as a public service. Asherin Maps aggregates over
          2,700 of them into a single plotted layer, so a camera nearest a
          point of interest is one click rather than a hunt across a dozen
          agency websites. Feeds open in place beside the map. These are
          public roadway feeds only, nothing residential, nothing private,
          nothing accessed without the publisher's own open endpoint.
        </p>

        <h2>4. Fast Lane routing</h2>
        <p>
          Routing is backed by an OSRM engine and optimised for time rather
          than distance. The route request is issued with an abort
          controller and a hard timeout; if the engine is slow or
          unreachable, the map falls back to a straight-line bearing
          estimate clearly labelled as an estimate rather than silently
          drawing a wrong path.
        </p>
        <Box>{`FAST LANE
 origin ──▶ OSRM profile: driving-fastest
        ├─ duration      27 min
        ├─ distance      19.4 km
        ├─ geometry      polyline → map layer
        └─ camera pass   4 DOT cameras along path → auto-pinned`}</Box>
        <p>
          Cameras that fall along the computed route are automatically
          pinned, which turns a route into a corridor you can actually look
          at before you commit to it.
        </p>

        <h2>5. Device roster, the browsers that report in</h2>
        <p>
          A compatible device joins the roster when you open Asherin on it,
          sign in, and grant available permissions in that browser. It then
          reports its own position and battery on an interval, and the map
          renders each reporter with its last-report timestamp so a stale
          position is visibly stale rather than quietly wrong. This is
          self-reporting, not remote locating: Google publishes no Find Hub
          or device-location API to third parties, so a phone that has never
          opened Asherin and granted permission cannot be placed on this map
          at all.
        </p>

        <h2>6. Bluetooth recovery, hardware that cannot speak</h2>
        <p>
          A laptop running Asherin can report its own coordinates. A pair of
          earbuds cannot. The recovery view handles the second case by fusing
          signal-strength observations: whenever one of your reporting
          browsers has seen the missing hardware over Web Bluetooth, that
          sighting carries a rough range and a position. Several sightings
          intersect into a probability ring. It is an estimate from your own
          scans, not a network of strangers' phones.
        </p>

        <Box>{`BLUETOOTH RECOVERY, "AirPods Pro"
  last self-report      none (passive device)
  observations          3 sightings, 2 devices
    ├─ phone   18:41  RSSI -67  → ~4 m radius
    ├─ phone   18:44  RSSI -81  → ~14 m radius
    └─ laptop  18:52  RSSI -74  → ~8 m radius
  fused ring            centre 40.7xxx / -73.9xxx  · r ≈ 11 m
  confidence            moderate (2 independent observers)`}</Box>
        <p>
          The ring is honest about its uncertainty. RSSI-to-distance is a
          noisy inference, so the output is a radius with a confidence band
, never a false pinpoint.
        </p>

        <h2>7. Assistant control</h2>
        <p>
          The map registers tool functions with the Asherin assistant, so
          the natural-language path and the manual path reach the same
          state machine. Ask it to centre on a location, drop a marker,
          draw the fastest route between two points, or locate a device,
          and it calls the function directly rather than describing what
          you should click.
        </p>

        <h2>8. Performance posture</h2>
        <p>
          Tiles are cached and pre-warmed at adjacent zoom levels to remove
          the grey-tile flash. Camera markers are clustered above a density
          threshold so a national view does not paint thousands of DOM
          nodes. Layer visibility, marker sets, and route geometry are held
          in separate memoised stores so toggling one never re-renders the
          others. Animations are transform-and-opacity only and collapse to
          instant state when the operator prefers reduced motion.
        </p>

        <h2>9. FAQ</h2>
        <h3>Is Asherin Maps included?</h3>
        <p>
          Yes. Every room ships with the app, and the app runs on your own
          device. There are no tiers.
        </p>
        <h3>Is any of the camera access private or unauthorised?</h3>
        <p>
          No. Every feed is a publicly published transport-agency roadway
          camera served from the agency's own endpoint.
        </p>
        <h3>What if a device has not reported in hours?</h3>
        <p>
          It renders dimmed with its last-report age shown. The map never
          presents a stale coordinate as a live one.
        </p>
      </ArticleShell>
    </>
  );
};

export default AsherinMapsFindMy;
