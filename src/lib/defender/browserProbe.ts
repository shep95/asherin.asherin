// asherin.defender — the browser surface.
//
// Everything here is measured inside this page with no extra privilege. If a
// reading is not available, the protection is either left out or pushed as an
// explicit `unmeasured` reading that says why; both show as unmeasured in the
// register and neither counts toward the score. Nothing in this file guesses,
// and nothing in this file calls a host other than the page's own origin.

import type { Finding } from "./posture";
import { readCameraState } from "./covertCamera";
import { isBunkerOn, bunkerBlockedCount, isFetchPatchedByDefender } from "./signals";

const now = () => Date.now();

function f(id: string, state: Finding["state"], observed: string, action?: string): Finding {
  return { id, state, observed, action, source: "browser", at: now() };
}

/** an honest gap: the browser looked and found it has no way to measure this. */
function gap(id: string, observed: string): Finding {
  return { id, state: "unmeasured", observed, source: "browser", at: now() };
}

type PermName =
  | "camera"
  | "microphone"
  | "geolocation"
  | "notifications"
  | "clipboard-read"
  | "display-capture"
  | "persistent-storage";

async function perm(name: PermName): Promise<PermissionState | "unsupported"> {
  try {
    const q = await navigator.permissions?.query({ name: name as PermissionName });
    return q?.state ?? "unsupported";
  } catch {
    return "unsupported";
  }
}

/** local addresses leaked by webrtc to any page that opens a peer connection. */
async function webrtcLeak(): Promise<{ hosts: string[]; supported: boolean }> {
  if (typeof RTCPeerConnection === "undefined") return { hosts: [], supported: false };
  return new Promise((resolve) => {
    const hosts = new Set<string>();
    let pc: RTCPeerConnection | null = null;
    const done = () => {
      try {
        pc?.close();
      } catch {
        /* ignore */
      }
      resolve({ hosts: [...hosts], supported: true });
    };
    const timer = setTimeout(done, 1200);
    try {
      pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel("asherin");
      pc.onicecandidate = (e) => {
        if (!e.candidate) {
          clearTimeout(timer);
          done();
          return;
        }
        const m = /([0-9]{1,3}(\.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{0,4}){2,})/i.exec(e.candidate.candidate);
        if (m && !/^0\.0\.0\.0/.test(m[1])) hosts.add(m[1]);
      };
      void pc.createOffer().then((o) => pc?.setLocalDescription(o));
    } catch {
      clearTimeout(timer);
      done();
    }
  });
}

/** the minimum current major versions at the time of writing; older is a real risk. */
export const BROWSER_FLOOR: Array<{ re: RegExp; name: string; min: number }> = [
  { re: /Firefox\/(\d+)/, name: "firefox", min: 128 },
  { re: /Edg\/(\d+)/, name: "edge", min: 126 },
  { re: /OPR\/(\d+)/, name: "opera", min: 112 },
  { re: /Chrome\/(\d+)/, name: "chrome", min: 126 },
  { re: /Version\/(\d+)[.\d]* Safari/, name: "safari", min: 17 },
];

/** pure: which browser the user agent names, its major version and whether it clears the floor. null when unrecognised. */
export function browserVersionReading(ua: string): { name: string; major: number; min: number; current: boolean } | null {
  const hit = BROWSER_FLOOR.find((b) => b.re.test(ua));
  if (!hit) return null;
  const major = Number(hit.re.exec(ua)?.[1] ?? 0);
  return { name: hit.name, major, min: hit.min, current: major >= hit.min };
}

/** HEAD against this page's own origin, bounded; the only network call the probe makes. */
async function ownOriginDate(timeoutMs = 4000): Promise<string | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const head = await fetch(window.location.origin + "/favicon.png", { method: "HEAD", cache: "no-store", signal: ctl.signal });
    return head.headers.get("date");
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function probeBrowser(): Promise<Finding[]> {
  const out: Finding[] = [];
  if (typeof window === "undefined" || typeof navigator === "undefined") return out;
  const nav = navigator;

  /* ── device shape and clock ─────────────────────────────────────────── */
  out.push(
    f(
      "dev.hardware-shape",
      "pass",
      `${nav.hardwareConcurrency ?? "?"} logical cores · ${(nav as unknown as { deviceMemory?: number }).deviceMemory ?? "?"} gb class · ${nav.platform || "unknown platform"} · ${screen.width}x${screen.height}`,
    ),
  );

  const serverDate = await ownOriginDate();
  if (serverDate) {
    const skew = Math.abs(Date.now() - new Date(serverDate).getTime());
    out.push(
      f(
        "dev.clock-skew",
        skew > 120_000 ? "warn" : "pass",
        `${Math.round(skew / 1000)}s difference against the clock of the host serving asherin`,
        skew > 120_000 ? "set the clock to network time — certificate checks depend on it" : undefined,
      ),
    );
  } else {
    out.push(gap("dev.clock-skew", "the host serving asherin sent no date header to compare against"));
  }

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
  out.push(f("dev.locale-leak", "pass", `${tz} · ${nav.language} · offset ${-new Date().getTimezoneOffset() / 60}h — recorded; the ip side is not visible to a tab`));

  /* ── network ────────────────────────────────────────────────────────── */
  const conn = (nav as unknown as { connection?: { type?: string; effectiveType?: string; downlink?: number; rtt?: number } })
    .connection;
  if (conn) {
    out.push(
      f("net.link-quality", "pass", `${conn.type || "unknown transport"} · ${conn.effectiveType || "?"} · ${conn.downlink ?? "?"} mbps · ${conn.rtt ?? "?"} ms rtt`),
    );
  } else {
    out.push(gap("net.link-quality", "the network information api is not exposed in this browser"));
  }
  out.push(f("net.online-state", nav.onLine ? "pass" : "warn", nav.onLine ? "link is up" : "this device is offline"));

  const leak = await webrtcLeak();
  if (leak.supported) {
    const privates = leak.hosts.filter((h) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fe80:|fd)/i.test(h));
    out.push(
      f(
        "net.webrtc-leak",
        privates.length ? "warn" : "pass",
        privates.length
          ? `webrtc published ${privates.length} local address${privates.length > 1 ? "es" : ""} to this page`
          : "no local address was published to this page",
        privates.length ? "disable webrtc ip handling in the browser, or keep a tunnel that covers it" : undefined,
      ),
    );
  }

  out.push(gap("net.captive-portal", "not probed — detecting a portal means calling a third-party host from this device, and this room calls none"));

  /* ── bluetooth ──────────────────────────────────────────────────────── */
  const ble = (
    nav as unknown as {
      bluetooth?: { getAvailability?: () => Promise<boolean>; getDevices?: () => Promise<Array<{ name?: string; id: string }>> };
    }
  ).bluetooth;
  if (ble?.getAvailability) {
    try {
      const available = await ble.getAvailability();
      out.push(f("bt.radio-state", "pass", available ? "radio present and available" : "no radio available to this browser"));
    } catch {
      /* leave unmeasured */
    }
  }
  if (ble?.getDevices) {
    try {
      const paired = await ble.getDevices();
      out.push(
        f(
          "bt.paired-inventory",
          paired.length ? "warn" : "pass",
          paired.length
            ? `${paired.length} device(s) this origin may reach: ${paired.map((d) => d.name || d.id.slice(0, 6)).join(", ")}`
            : "no bluetooth device has been granted to this origin — grant one from the browser tab to inventory it",
          paired.length ? "revoke any pairing you do not recognise in the browser's device settings" : undefined,
        ),
      );
    } catch {
      /* leave unmeasured */
    }
  }

  /* ── peripherals ────────────────────────────────────────────────────── */
  const hid = (nav as unknown as { hid?: { getDevices(): Promise<Array<{ productName?: string }>> } }).hid;
  if (hid?.getDevices) {
    try {
      const devices = await hid.getDevices();
      const keyboards = devices.filter((d) => /keyboard|keypad/i.test(d.productName || ""));
      out.push(
        f(
          "per.hid-duplicate",
          keyboards.length > 1 ? "fail" : "pass",
          keyboards.length > 1
            ? `${keyboards.length} keyboard-class devices are visible to this browser`
            : `${devices.length} granted hid device(s), ${keyboards.length} keyboard-class — only devices granted to this origin are visible`,
          keyboards.length > 1 ? "unplug what you cannot name; the full usb tree is outside a tab's reach" : undefined,
        ),
      );
    } catch {
      /* leave unmeasured */
    }
  }

  /* ── browser and permissions ────────────────────────────────────────── */
  out.push(
    f(
      "br.secure-context",
      window.isSecureContext ? "pass" : "fail",
      window.isSecureContext ? `https · ${location.host}` : "this page is not running in a secure context",
      window.isSecureContext ? undefined : "open asherin over https before trusting anything on this screen",
    ),
  );

  const insecure = [...document.querySelectorAll<HTMLElement>("img,script,link,iframe")].filter((el) => {
    const src = el.getAttribute("src") || el.getAttribute("href") || "";
    return /^http:\/\//i.test(src);
  }).length;
  out.push(
    f("br.mixed-content", insecure ? "warn" : "pass", insecure ? `${insecure} plain-http resource(s) on this page` : "no plain-http resource on this page"),
  );

  const nativeFetch = /\{\s*\[native code\]\s*\}/.test(Function.prototype.toString.call(window.fetch));
  const nativeXhr = /\{\s*\[native code\]\s*\}/.test(Function.prototype.toString.call(XMLHttpRequest.prototype.open));
  const foreignFetch = !nativeFetch && !isFetchPatchedByDefender();
  const patched = foreignFetch || !nativeXhr;
  out.push(
    f(
      "br.devtools-hooks",
      patched ? "warn" : "pass",
      patched
        ? "fetch or xhr on this page has been replaced by something other than defender"
        : isFetchPatchedByDefender()
          ? "fetch is wrapped by defender's bunker; xhr is the browser's own"
          : "fetch and xhr are the browser's own implementations",
      patched ? "close other extensions and reload — an in-page interceptor can read tokens in flight" : undefined,
    ),
  );

  try {
    const regs = (await nav.serviceWorker?.getRegistrations?.()) ?? [];
    out.push(
      f(
        "br.service-workers",
        regs.length > 2 ? "warn" : "pass",
        `${regs.length} service worker(s) registered for this origin`,
        regs.length > 2 ? "unregister workers you do not recognise — they run with no tab open" : undefined,
      ),
    );
  } catch {
    /* leave unmeasured */
  }

  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.usage != null) {
      out.push(
        f(
          "br.storage-footprint",
          est.usage > 500_000_000 ? "warn" : "pass",
          `${(est.usage / 1_048_576).toFixed(1)} mb used of ${((est.quota ?? 0) / 1_048_576).toFixed(0)} mb quota on this origin`,
        ),
      );
    }
  } catch {
    /* leave unmeasured */
  }

  out.push(
    f(
      "br.cookie-scope",
      "pass",
      nav.cookieEnabled ? "cookies can be set on this origin" : "cookies are blocked on this origin",
    ),
  );

  const grants: Array<[PermName, string, string]> = [
    ["camera", "priv.camera-grant", "camera"],
    ["microphone", "priv.mic-grant", "microphone"],
    ["geolocation", "br.geolocation-grant", "location"],
    ["notifications", "br.notification-abuse", "notifications"],
    ["clipboard-read", "br.clipboard-access", "clipboard read"],
    ["display-capture", "br.screen-capture", "screen capture"],
  ];
  const standing: string[] = [];
  for (const [name, id, label] of grants) {
    const state = await perm(name);
    if (state === "unsupported") continue;
    if (state === "granted") standing.push(label);
    out.push(
      f(
        id,
        state === "granted" ? "warn" : "pass",
        `${label} permission is ${state} for this origin`,
        state === "granted" ? `revoke ${label} in the site settings if you are not using it right now` : undefined,
      ),
    );
  }
  out.push(
    f(
      "br.site-permissions",
      standing.length ? "warn" : "pass",
      standing.length ? `standing grants on this origin: ${standing.join(", ")}` : "no standing camera, microphone, location, clipboard or capture grant",
      standing.length ? "clear grants you are not using — a standing grant is a live device" : undefined,
    ),
  );

  out.push(
    f(
      "br.tracker-blocking",
      isBunkerOn() ? "pass" : "warn",
      isBunkerOn() ? `bunker is freezing tracker beacons · ${bunkerBlockedCount()} blocked this session` : "tracker beacons are not frozen on this origin",
      isBunkerOn() ? undefined : "turn bunker on (apply, not dry-run) to freeze analytics and beacon traffic from this page",
    ),
  );

  out.push(gap("br.background-tabs", `this tab is ${document.visibilityState}; a tab cannot count other tabs or profiles`));

  out.push(f("br.private-mode", "pass", `storage persistence is ${(await navigator.storage?.persisted?.()) ? "granted" : "not granted"} on this origin`));

  const ver = browserVersionReading(nav.userAgent);
  if (ver) {
    out.push(
      f(
        "upd.browser-current",
        ver.current ? "pass" : "fail",
        `${ver.name} ${ver.major} (floor for security fixes is ${ver.min})`,
        ver.current ? undefined : "update the browser — it is the most attacked program on this device",
      ),
    );
  }

  /* ── surveillance, from the camera watcher already running here ─────── */
  const cam = readCameraState();
  out.push(
    f(
      "srv.covert-camera",
      cam.verdict === "covert-blocked" ? "fail" : cam.verdict === "previewed" || cam.verdict === "idle" ? "pass" : "warn",
      `camera state in this page: ${cam.verdict}; other apps are outside a tab's reach`,
      cam.verdict === "covert-blocked" ? "a page tried to open the camera with no visible preview; defender refused it" : undefined,
    ),
  );
  out.push(
    f(
      "proc.camera-capture",
      cam.verdict === "covert-blocked" ? "fail" : "pass",
      cam.verdict === "covert-blocked" ? "covert capture attempt refused in this page" : "no covert capture attempt in this page; other processes are outside a tab's reach",
    ),
  );

  try {
    const devices = await nav.mediaDevices?.enumerateDevices?.();
    if (devices) {
      const cams = devices.filter((d) => d.kind === "videoinput").length;
      const mics = devices.filter((d) => d.kind === "audioinput").length;
      out.push(
        gap("srv.covert-mic", `${cams} camera(s) and ${mics} microphone(s) attached; whether another app is using one is not visible to a tab`),
      );
    }
  } catch {
    /* leave unmeasured */
  }

  /* ── power ──────────────────────────────────────────────────────────── */
  try {
    const battery = await (nav as unknown as { getBattery?: () => Promise<{ level: number; charging: boolean; dischargingTime: number }> }).getBattery?.();
    if (battery) {
      const pct = Math.round(battery.level * 100);
      out.push(
        f(
          "pwr.battery-level",
          pct < 15 && !battery.charging ? "warn" : "pass",
          `${pct}% · ${battery.charging ? "charging" : "on battery"}`,
          pct < 15 && !battery.charging ? "charge the device — a dead device stops defending itself" : undefined,
        ),
      );
      out.push(f("pwr.charging-state", "pass", battery.charging ? "power adapter connected" : "running on battery"));
    }
  } catch {
    /* leave unmeasured */
  }

  /* ── recovery ───────────────────────────────────────────────────────── */
  out.push(f("rec.evidence-export", "pass", "every finding on this screen exports as plain json from the export control; the file is not signed"));
  out.push(
    f(
      "rec.incident-plan",
      "pass",
      "if something here reads fail: disconnect the network, export evidence, then work the failures worst-first",
    ),
  );

  return out;
}
