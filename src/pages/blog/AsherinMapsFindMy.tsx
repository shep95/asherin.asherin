import ArticleShell from "@/components/seo/ArticleShell";
import {
  ArticleJsonLd,
  BreadcrumbJsonLd,
  FaqJsonLd,
} from "@/components/seo/SeoJsonLd";

/**
 * /blog/asherin-maps-find-my
 *
 * archived design note for "Asherin Maps" — satellite-first mapping with
 * DOT camera layers, OSRM routing, a device roster and bluetooth recovery
 * rings. only the routing shipped (asherin.search's location panel,
 * src/lib/asher/directions.ts); the globe is asherin.adam.
 */

const URL = "https://asherin.com/blog/asherin-maps-find-my";
const TITLE =
  "asherin maps, an archived design for a satellite-first map";
const DEK =
  "an archived design note: a satellite-default map with a layer tree, public DOT camera feeds, OSRM routing, self-reported device telemetry and bluetooth recovery rings. only the routing shipped, inside asherin.search; the globe is asherin.adam. nothing here locates a phone.";
const PUBLISHED = "2026-08-04T00:00:00.000Z";

const Box = ({ children }: { children: React.ReactNode }) => (
  <pre className="not-prose my-8 overflow-x-auto rounded-lg border border-border/40 bg-card/40 p-5 text-[12px] leading-[1.55] font-mono text-foreground/85 whitespace-pre">
    {children}
  </pre>
);

const AsherinMapsFindMy = () => {
  return (
    <>
      <ArticleJsonLd
        id="asherin-maps-find-my"
        url={URL}
        headline={TITLE}
        description={DEK}
        datePublished={PUBLISHED}
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
          { name: "blog", url: "/blog" },
          { name: "Asherin Maps", url: "/blog/asherin-maps-find-my" },
        ]}
      />
      <FaqJsonLd
        id="asherin-maps-find-my-faq"
        items={[
          {
            q: "What is Asherin Maps?",
            a: "an archived design for a satellite-first map surface. what shipped: osrm routing inside asherin.search's location panel, and the live globe asherin.adam. the camera layer, device roster and recovery rings were not built.",
          },
          {
            q: "Where would the traffic cameras have come from?",
            a: "public state and municipal department of transportation feeds, published by the agencies themselves, plotted as a layer and opened in place. the layer was designed, not built; no private or residential camera was ever in scope.",
          },
          {
            q: "How would Bluetooth recovery have located a lost device?",
            a: "a device would report its own position only from a browser where you granted permission; there is no remote locating of a phone that never reported. for hardware that cannot self-report, the design fused last-seen RSSI observations from your own browsers into a probability ring. the roster needed a server to relay between browsers, which the local edition does not have, so it was not built.",
          },
          {
            q: "Can shepherd drive the map?",
            a: "the location panel in asherin.search opens from a place-shaped query and computes a route when osrm answers. the full tool surface this design described, markers, layers, device lookup, was not built.",
          },
        ]}
      />

      <ArticleShell
        eyebrow="archived · design note"
        title="asherin maps, an archived design for a satellite-first map"
        dek={DEK}
        publishedLabel="Aug 4 2026"
        readTime="10 min"
      >
        <p>
          <strong>status.</strong> archived design note. of what follows, the
          routing shipped: asherin.search opens a location panel for a
          place-shaped query and asks a public osrm engine for driving,
          cycling and walking routes, reporting a degraded state when the
          graph does not answer. the live globe is{" "}
          <a href="/dashboard/asherin-adam">asherin.adam</a>. the camera
          layer, the device roster and the recovery rings needed a server to
          relay between your browsers, and the local edition has no server,
          so they were not built. nothing here locates a phone.
        </p>

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
          as designed, a device would join the roster when you opened
          asherin on it and granted permission in that browser, then report
          its own position and battery on an interval, each reporter drawn
          with its last-report timestamp so a stale position is visibly
          stale. this is self-reporting, not remote locating: Google
          publishes no Find Hub or device-location API to third parties, so
          a phone that never opened asherin and granted permission could not
          be placed on this map at all. relaying reports between browsers
          needs a server, which is why the roster was not built.
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
          the design registered tool functions with shepherd so the
          natural-language path and the manual path reached the same state
          machine: centre on a location, drop a marker, draw the fastest
          route, locate a device. what shipped is narrower: a place-shaped
          query in asherin.search opens the location panel.
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
          as a room, no. the routing lives inside asherin.search and the
          globe is asherin.adam; both ship with the app, which runs on your
          own device. there are no tiers and no account.
        </p>
        <h3>Was any of the camera access private or unauthorised?</h3>
        <p>
          No. the design only ever named publicly published transport-agency
          roadway cameras served from the agency's own endpoint, and the
          layer was not built.
        </p>
        <h3>What if a device has not reported in hours?</h3>
        <p>
          the design rendered it dimmed with its last-report age shown, so a
          stale coordinate never read as a live one. the roster was not
          built.
        </p>
      </ArticleShell>
    </>
  );
};

export default AsherinMapsFindMy;
