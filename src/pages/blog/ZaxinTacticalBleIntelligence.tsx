import ArticleShell from "@/components/seo/ArticleShell";
import { ArticleJsonLd, BreadcrumbJsonLd, FaqJsonLd } from "@/components/seo/SeoJsonLd";

const URL = "https://asherin.com/blog/zaxin-tactical-ble-intelligence";
const TITLE = "archived bluetooth signal research, what a browser can actually observe";
const PUBLISHED = "2026-06-26T00:00:00.000Z";

const ZaxinTacticalBleIntelligence = () => (
  <ArticleShell
    eyebrow="archived research · bluetooth"
    title="bluetooth signals are proximity evidence, not a tactical map"
    dek="this retired concept is preserved as a technical boundary note. compatible browsers can request nearby bluetooth devices with permission and observe coarse signal strength. they cannot silently scan every device, identify a person, or produce precise location."
    publishedLabel="jun 26 2026"
    readTime="6 min"
  >
    <ArticleJsonLd
      id="zaxin-tactical-ble-intelligence"
      url={URL}
      headline={TITLE}
      description="an archived asherin note on browser bluetooth permissions, coarse signal strength, camera overlays, and the limits of proximity inference."
      datePublished={PUBLISHED}
      keywords={["web bluetooth", "bluetooth proximity", "browser permissions", "signal strength"]}
    />
    <BreadcrumbJsonLd
      id="zaxin-tactical-ble-intelligence"
      items={[
        { name: "asherin", url: "/" },
        { name: "journal", url: "/blog" },
        { name: "archived bluetooth research", url: "/blog/zaxin-tactical-ble-intelligence" },
      ]}
    />
    <FaqJsonLd
      id="zaxin-tactical-ble-intelligence-faq"
      items={[
        { q: "is zaxin still available?", a: "no. zaxin is retired and is not sold or available as a current asherin room." },
        { q: "can a website silently scan nearby bluetooth devices?", a: "no. web bluetooth support varies and normally requires compatible hardware, browser support, user permission, and an operating-system device chooser." },
        { q: "can signal strength locate a device precisely?", a: "no. rssi changes with walls, bodies, antenna orientation, interference, and device power. it supports only a rough proximity estimate with uncertainty." },
      ]}
    />

    <h2>why this page remains public</h2>
    <p>
      the former zaxin concept explored bluetooth observations, camera overlays, and map context. the standalone product is retired. this page remains because the technical limits are useful and because old links should resolve to an honest record rather than a false product claim.
    </p>

    <h2>what web bluetooth permits</h2>
    <p>
      on supported hardware and browsers, a user gesture can open an operating-system chooser for compatible devices. approved devices may expose names, advertised services, and connection data. availability differs by browser and device, and no web application can bypass the permission flow.
    </p>

    <h2>what signal strength means</h2>
    <p>
      received signal strength can support a coarse near-versus-far estimate. it is not distance measurement. walls, people, radio interference, device power, and antenna orientation can move the estimate by several metres or more. a responsible interface shows a range and confidence, never a pinpoint.
    </p>

    <h2>what camera and map overlays do not prove</h2>
    <p>
      a bluetooth observation and a person visible in a camera frame are separate observations. placing them near each other does not establish that the person owns the device. similarly, placing a rough signal ring on a map does not create gps coordinates.
    </p>

    <h2>current asherin surfaces</h2>
    <p>
      current visual and spatial work lives in asherin.eye and asherin.arvision. those rooms expose their available sensors and degraded states directly. neither inherits the retired product claims on this page.
    </p>
  </ArticleShell>
);

export default ZaxinTacticalBleIntelligence;
