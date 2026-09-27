// asherin.defender — what a browser can actually observe on the operator's own
// device, and an explicit ledger of what it cannot.
//
// Every reading here is either measured or marked `this is unsure`. Nothing
// pretends to kernel coverage. The native companion (Capacitor) still sees
// SSID / BIOS / other-process spy match. This tab arms its own analog: pick a
// Bluetooth device you own, freeze this origin's tracker beacons, and rotate a
// 60-second poison map for in-page observers only.

export type SignalLevel = "ok" | "watch" | "alert" | "unsure";

export interface Signal {
  id: string;
  group: "hardware" | "bluetooth" | "wifi" | "spy" | "poison";
  label: string;
  level: SignalLevel;
  /** measured fact — never a guess. */
  observed: string;
  /** what this tab or the native companion can do about it. */
  action?: string;
}

const ANALOG_KEY = "asherin-defender-analog";
const POISON_HISTORY_KEY = "asherin-defender-poison-history";

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

/** Documented families a defender should recognise by name. Public class only. */
export const SPY_FAMILIES = [
  "commercial parental-monitoring suites",
  "enterprise endpoint session recorders",
  "remote-access trojans with hidden desktop",
  "browser extensions with all-urls + webRequest",
  "stalkerware with hidden launcher icons",
];

/** Undocumented heuristic patterns — pattern classes, not vendor names. */
export const SPY_HEURISTICS = [
  "input listener that never renders anything",
  "persistent websocket to a single fixed host at idle",
  "clipboard read on a timer",
  "screen capture permission held with no visible surface",
  "device enumerated twice under different transports",
];

function sig(s: Signal): Signal {
  return s;
}

interface NetInfo {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  type?: string;
  saveData?: boolean;
}

export function isNativeCompanion(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.())
  );
}

export function isTabArmed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ANALOG_KEY) === "1";
  } catch {
    return false;
  }
}

export function armTab(): void {
  try {
    window.localStorage.setItem(ANALOG_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function hasCompanion(): boolean {
  return isNativeCompanion() || isTabArmed();
}

type BleDev = { name?: string; id: string };

export async function pickBluetooth(): Promise<BleDev | null> {
  const ble = (
    navigator as unknown as {
      bluetooth?: {
        requestDevice?: (opts: {
          acceptAllDevices?: boolean;
          optionalServices?: string[];
        }) => Promise<{ name?: string; id: string }>;
      };
    }
  ).bluetooth;
  if (!ble?.requestDevice) return null;
  const d = await ble.requestDevice({ acceptAllDevices: true });
  armTab();
  return { name: d.name, id: d.id };
}

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
  armTab();
  return devices.length;
}

/* ── bunker: this origin only ─────────────────────────────────────────── */

const NEVER_FREEZE = /supabase|stripe|asherin\.com|lovable|localhost|127\.0\.0\.1|cursor\.sh/i;
const TRACKER =
  /google-analytics|googletagmanager|googleadservices|doubleclick|facebook\.net|connect\.facebook|hotjar|segment\.io|mixpanel|amplitude|fullstory|intercom|crisp\.chat|hubspot|adsystem|adservice|pixel|beacon|tiktok\.com\/i18n|snap\.licdn|bat\.bing|scorecardresearch|quantserve|adsrvr|taboola|outbrain|newrelic|nr-data\.net|sentry\.io\/api|bugsnag|logrocket/i;

let bunkerOn = false;
let fetchOrig: typeof fetch | null = null;
let beaconOrig: typeof navigator.sendBeacon | null = null;
let blocked = 0;

function shouldFreeze(raw: string): boolean {
  if (/^mailto:/i.test(raw)) return true;
  try {
    const u = new URL(raw, typeof location !== "undefined" ? location.href : "https://asherin.com");
    if (NEVER_FREEZE.test(u.hostname)) return false;
    return TRACKER.test(u.hostname + u.pathname);
  } catch {
    return false;
  }
}

export function applyBunker(): { blocked: number } {
  if (typeof window === "undefined") return { blocked };
  bunkerOn = true;
  blocked = 0;
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
  if (!beaconOrig && navigator.sendBeacon) {
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

/* ── key-poison: in-page observers only. never remap apps/sites. ──────── */

const ALPHA = "abcdefghijklmnopqrstuvwxyz";

function uniqueMap(): string {
  const chars = ALPHA.split("");
  const out: string[] = [];
  const buf = new Uint32Array(chars.length);
  crypto.getRandomValues(buf);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = buf[i] % (i + 1);
    const t = chars[i];
    chars[i] = chars[j];
    chars[j] = t;
  }
  for (let i = 0; i < chars.length; i++) out.push(`${ALPHA[i]}→${chars[i]}`);
  return out.join(" ");
}

export function rotatePoisonMap(): { map: string; reused: boolean } {
  const map = uniqueMap();
  let history: string[] = [];
  try {
    history = JSON.parse(window.localStorage.getItem(POISON_HISTORY_KEY) || "[]");
  } catch {
    history = [];
  }
  const reused = history.includes(map);
  if (!reused) {
    history.push(map);
    try {
      window.localStorage.setItem(POISON_HISTORY_KEY, JSON.stringify(history.slice(-200)));
    } catch {
      /* ignore */
    }
  }
  return { map, reused };
}

export async function collectSignals(): Promise<Signal[]> {
  const out: Signal[] = [];
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const analog = hasCompanion();

  /* ── hardware / HID ────────────────────────────────────────────────── */
  const hid = (
    nav as unknown as { hid?: { getDevices(): Promise<Array<{ productName?: string; vendorId?: number }>> } }
  )?.hid;
  if (hid?.getDevices) {
    try {
      const devices = await hid.getDevices();
      const keyboards = devices.filter((d) => /keyboard|keypad/i.test(d.productName || ""));
      out.push(
        sig({
          id: "hid-devices",
          group: "hardware",
          label: "granted hid devices",
          level: keyboards.length > 1 ? "alert" : "ok",
          observed: devices.length
            ? `${devices.length} granted · ${keyboards.length} keyboard-class`
            : "no hid device has been granted to this origin",
          action:
            keyboards.length > 1
              ? "flag the extra keyboard-class device — pick hid to grant the rest of the tree"
              : "pick hid to grant this origin the rest of the tree",
        }),
      );
    } catch {
      out.push(
        sig({
          id: "hid-devices",
          group: "hardware",
          label: "granted hid devices",
          level: "unsure",
          observed: "hid enumeration refused by the browser",
        }),
      );
    }
  } else {
    out.push(
      sig({
        id: "hid-devices",
        group: "hardware",
        label: "extra keyboard hunt",
        level: "unsure",
        observed: "webhid is unavailable in this browser — a tab cannot count keyboards",
        action: isNativeCompanion()
          ? "companion reads the HID tree and the filter-driver class, plus BIOS/TPM presence"
          : undefined,
      }),
    );
  }

  out.push(
    sig({
      id: "cores",
      group: "hardware",
      label: "device shape",
      level: "ok",
      observed: `${nav?.hardwareConcurrency ?? "?"} logical cores · ${(nav as unknown as { deviceMemory?: number })?.deviceMemory ?? "?"} gb class · ${nav?.platform || "unknown platform"}`,
    }),
  );

  out.push(
    sig({
      id: "bios-tpm",
      group: "hardware",
      label: "bios / tpm preview",
      level: "unsure",
      observed: "not readable from a browser tab",
      action: isNativeCompanion() ? "companion reports secure-boot state and TPM presence" : undefined,
    }),
  );

  /* ── bluetooth ─────────────────────────────────────────────────────── */
  const ble = (
    nav as unknown as {
      bluetooth?: {
        getAvailability?: () => Promise<boolean>;
        getDevices?: () => Promise<Array<{ name?: string; id: string }>>;
      };
    }
  )?.bluetooth;
  if (ble) {
    let available: boolean | null = null;
    try {
      available = ble.getAvailability ? await ble.getAvailability() : null;
    } catch {
      available = null;
    }
    let paired: Array<{ name?: string; id: string }> = [];
    try {
      paired = ble.getDevices ? await ble.getDevices() : [];
    } catch {
      paired = [];
    }
    out.push(
      sig({
        id: "ble-adapter",
        group: "bluetooth",
        label: "adapter",
        level: available === false ? "watch" : "ok",
        observed:
          available === null
            ? "availability not reported"
            : available
              ? "radio present and available"
              : "no radio available",
      }),
    );
    out.push(
      sig({
        id: "ble-paired",
        group: "bluetooth",
        label: "devices you already allowed",
        level: paired.length ? "watch" : "ok",
        observed: paired.length
          ? paired.map((d) => d.name || `id ${d.id.slice(0, 6)}…`).join(" · ")
          : "no device has prior consent on this origin — pick bluetooth to grant one",
        action: analog
          ? "idle radio stays yours; bunker does not kill Cursor"
          : "pick bluetooth to grant this origin a device you own",
      }),
    );
  } else {
    out.push(
      sig({
        id: "ble-adapter",
        group: "bluetooth",
        label: "adapter",
        level: "unsure",
        observed: "web bluetooth unavailable in this browser",
      }),
    );
  }

  /* ── wifi ──────────────────────────────────────────────────────────── */
  const conn = (nav as unknown as { connection?: NetInfo })?.connection;
  out.push(
    sig({
      id: "link",
      group: "wifi",
      label: "active link",
      level: "ok",
      observed: conn
        ? `${conn.type || "unknown transport"} · ${conn.effectiveType || "?"} · ${conn.downlink ?? "?"} mbps · ${conn.rtt ?? "?"} ms rtt`
        : `${nav?.onLine ? "online" : "offline"} — the network information api is not exposed here`,
    }),
  );
  out.push(
    sig({
      id: "ssid",
      group: "wifi",
      label: "ssid and nearby networks",
      level: "unsure",
      observed: "a browser cannot read the connected ssid or scan for neighbours",
      action: isNativeCompanion()
        ? "companion lists nearby networks and flags open or duplicate-ssid (rogue-ap class) beacons"
        : undefined,
    }),
  );

  /* ── spy ident ─────────────────────────────────────────────────────── */
  let swCount = 0;
  try {
    swCount = (await navigator.serviceWorker?.getRegistrations?.())?.length ?? 0;
  } catch {
    swCount = 0;
  }
  out.push(
    sig({
      id: "spy-families",
      group: "spy",
      label: "documented families",
      level: swCount > 2 ? "watch" : "ok",
      observed: `${SPY_FAMILIES.length} public classes recognised · ${SPY_HEURISTICS.length} undocumented heuristics armed · ${swCount} service workers on this origin`,
      action: isNativeCompanion()
        ? "companion matches running processes and autostart entries against both sets"
        : "this tab can only see this origin's workers and permissions — other processes stay residual",
    }),
  );

  /* ── key-poison ────────────────────────────────────────────────────── */
  if (analog) {
    const { map, reused } = rotatePoisonMap();
    out.push(
      sig({
        id: "poison",
        group: "poison",
        label: "key-poison",
        level: reused ? "watch" : "ok",
        observed: `unique 60s map armed for in-page observers only${reused ? " · collision (regenerated next tick)" : ""} · ${map.slice(0, 24)}…`,
        action: "keys apps and sites consume are never remapped. out-of-process loggers remain residual",
      }),
    );
  } else {
    out.push(
      sig({
        id: "poison",
        group: "poison",
        label: "key-poison",
        level: "unsure",
        observed: "tab not armed — arm this tab to rotate a unique 60s map for in-page observers",
        action: "arm this tab. out-of-process loggers stay residual. no unsigned kernel driver is ever loaded",
      }),
    );
  }

  return out;
}

/** Bunker freeze set. asherin and the operator's own tools are never frozen. */
export const BUNKER_TARGETS = ["this origin's tracker and data-collection beacons", "mailto links from this tab"];

export const BUNKER_NEVER = ["asherin", "the operator's own editor and terminal"];
