// asherin.defender — what this page can actually control on the operator's own
// device, and an explicit ledger of what it cannot.
//
// Everything here is either measured or stated as out of reach. Nothing
// pretends to kernel coverage. There is no device agent and no native
// companion: the room is one browser tab, and it says so.

const ORIGIN_RE = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

/** Surfaces a browser tab fundamentally cannot inspect. Stated, never hidden. */
export const RESIDUAL_BLIND_SPOTS = [
  "GetAsyncKeyState-class polling by another process",
  "raw-input / HID-level capture",
  "kernel drivers and signed filter drivers",
  "usb hardware keyloggers inline with the keyboard",
  "TEMPEST / electromagnetic emanation capture",
  "ssid / nearby wifi beacons (a tab cannot scan the nic)",
  "bios / tpm / secure-boot state",
  "phone calls and messenger apps running outside this origin",
];

type BleDev = { name?: string; id: string };

/**
 * Ask the browser to grant this origin one bluetooth device. The grant is the
 * only way `bluetooth.getDevices()` can later report anything, so this is a
 * measuring action, not a protection in itself. Returns null when the api is
 * not exposed; rejects when the operator cancels the picker.
 */
export async function pickBluetooth(): Promise<BleDev | null> {
  const ble = (
    navigator as unknown as {
      bluetooth?: {
        requestDevice?: (opts: { acceptAllDevices?: boolean; optionalServices?: string[] }) => Promise<BleDev>;
      };
    }
  ).bluetooth;
  if (!ble?.requestDevice) return null;
  const d = await ble.requestDevice({ acceptAllDevices: true });
  return { name: d.name, id: d.id };
}

/** Same for webhid: a granted device is what makes the duplicate-keyboard check measurable. */
export async function pickHid(): Promise<number> {
  const hid = (
    navigator as unknown as {
      hid?: {
        requestDevice?: (opts: { filters: Array<{ usagePage?: number }> }) => Promise<Array<{ productName?: string }>>;
      };
    }
  ).hid;
  if (!hid?.requestDevice) return 0;
  const devices = await hid.requestDevice({ filters: [{ usagePage: 0x01 }] });
  return devices.length;
}

/* ── bunker: this origin only ─────────────────────────────────────────── */

const TRACKER =
  /google-analytics|googletagmanager|googleadservices|doubleclick|facebook\.net|connect\.facebook|hotjar|segment\.io|mixpanel|amplitude|fullstory|intercom|crisp\.chat|hubspot|adsystem|adservice|pixel|beacon|tiktok\.com\/i18n|snap\.licdn|bat\.bing|scorecardresearch|quantserve|adsrvr|taboola|outbrain|newrelic|nr-data\.net|sentry\.io\/api|bugsnag|logrocket/i;

let bunkerOn = false;
let fetchOrig: typeof fetch | null = null;
let beaconOrig: typeof navigator.sendBeacon | null = null;
let blocked = 0;

/**
 * Whether one request would be frozen. The page's own origin and loopback are
 * never frozen, so asherin's own calls (the model provider the operator chose,
 * local runtimes) cannot be caught by the tracker pattern. Pure: safe to test.
 */
export function shouldFreeze(raw: string, ownHost = typeof location !== "undefined" ? location.hostname : ""): boolean {
  try {
    const u = new URL(raw, typeof location !== "undefined" ? location.href : "http://localhost/");
    if (!/^https?:$/.test(u.protocol)) return false;
    if (ownHost && u.hostname === ownHost) return false;
    if (ORIGIN_RE.test(u.hostname)) return false;
    return TRACKER.test(u.hostname + u.pathname);
  } catch {
    return false;
  }
}

/**
 * Install the fetch/sendBeacon wrapper once and switch it on. The wrapper is
 * never removed for the life of the tab — `restoreBunker` switches it off and
 * every call passes straight through to the browser's own fetch. Anything the
 * wrapper rejects gets a TypeError, the same shape a network failure has.
 */
export function applyBunker(): { blocked: number } {
  if (typeof window === "undefined") return { blocked };
  bunkerOn = true;
  if (!fetchOrig) {
    fetchOrig = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (bunkerOn && shouldFreeze(url)) {
        blocked += 1;
        return Promise.reject(new TypeError("asherin.defender bunker: tracker frozen"));
      }
      return fetchOrig!(input, init);
    };
  }
  if (!beaconOrig && typeof navigator !== "undefined" && navigator.sendBeacon) {
    beaconOrig = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
      const href = typeof url === "string" ? url : url.href;
      if (bunkerOn && shouldFreeze(href)) {
        blocked += 1;
        return false;
      }
      return beaconOrig!(url, data);
    };
  }
  return { blocked };
}

export function restoreBunker(): void {
  bunkerOn = false;
}

export function bunkerBlockedCount(): number {
  return blocked;
}

export function isBunkerOn(): boolean {
  return bunkerOn;
}

/** true once defender has replaced window.fetch, whether or not the bunker is on right now. */
export function isFetchPatchedByDefender(): boolean {
  return fetchOrig !== null;
}

/** test seam: put the page's fetch back exactly as it was. */
export function __resetBunkerForTests(): void {
  if (typeof window !== "undefined" && fetchOrig) window.fetch = fetchOrig;
  if (typeof navigator !== "undefined" && beaconOrig) navigator.sendBeacon = beaconOrig;
  fetchOrig = null;
  beaconOrig = null;
  bunkerOn = false;
  blocked = 0;
}

/** What the bunker freezes, in the operator's words. asherin itself sends no beacons. */
export const BUNKER_TARGETS = ["analytics, ad and session-recording beacons that an extension or an injected script tries to send from this page"];

export const BUNKER_NEVER = ["asherin's own origin", "localhost runtimes"];
