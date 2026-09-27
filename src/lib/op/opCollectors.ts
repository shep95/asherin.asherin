// ═══════════════════════════════════════════════════════════════════════════
// OP LAYER — TIER 1 COLLECTORS
//
// These run in the operator's own tab while the app is in the foreground. Each
// one answers a narrow question with an observation, never a guess, and each
// one is allowed to fail: a collector that cannot run returns `unknown` and
// says why, because "we could not check" and "we checked and it was fine" are
// different facts and the OP layer refuses to conflate them.
//
// Every collector is bounded by its own timeout. Nothing here may hang the
// daemon, and nothing here may block the UI thread for long enough to be felt.
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from "@/integrations/supabase/client";

export type Verdict = "clean" | "anomalous" | "hostile" | "unknown";

export interface CollectedSignal {
  type: "dns" | "tls" | "webrtc" | "geodrift" | "egress" | "geo" | "ble" | "credential" | "posture";
  verdict: Verdict;
  confidence: number;
  networkKey?: string | null;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  evidence: Record<string, unknown>;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<null>((res) => { timer = window.setTimeout(() => res(null), ms); }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── DNS INTEGRITY ──────────────────────────────────────────────────────────
// A browser cannot issue a raw DNS query, so the honest test is a cross-check:
// ask two independent DoH resolvers for the same name over HTTPS and compare.
// If the network is rewriting answers it must either break the encrypted
// lookups (which is itself a finding) or disagree with them.
const DOH = [
  { name: "cloudflare", url: "https://cloudflare-dns.com/dns-query?type=A&name=" },
  { name: "google", url: "https://dns.google/resolve?type=A&name=" },
];
const CANARY = "asherin.com";

export async function collectDns(): Promise<CollectedSignal> {
  const answers: Record<string, string[]> = {};
  const failures: string[] = [];

  await Promise.all(
    DOH.map(async (r) => {
      const res = await withTimeout(
        fetch(`${r.url}${CANARY}`, { headers: { accept: "application/dns-json" }, cache: "no-store" }),
        4000,
      );
      if (!res || !res.ok) { failures.push(r.name); return; }
      try {
        const body = await res.json();
        answers[r.name] = (body?.Answer ?? []).filter((a: any) => a.type === 1).map((a: any) => a.data).sort();
      } catch {
        failures.push(r.name);
      }
    }),
  );

  const sets = Object.values(answers).filter((a) => a.length);
  if (!sets.length) {
    return {
      type: "dns", verdict: failures.length === DOH.length ? "anomalous" : "unknown", confidence: 0.4,
      evidence: { canary: CANARY, failedResolvers: failures, note: "Every encrypted resolver was unreachable. A network that blocks DoH is a network that wants to see your lookups." },
    };
  }
  if (sets.length === 1) {
    return { type: "dns", verdict: "unknown", confidence: 0.3, evidence: { canary: CANARY, answers, failedResolvers: failures, note: "Only one resolver answered — no cross-check was possible." } };
  }

  const agree = sets.every((s) => s.join(",") === sets[0].join(","));
  return {
    type: "dns",
    verdict: agree ? "clean" : "hostile",
    confidence: agree ? 0.6 : 0.7,
    evidence: { canary: CANARY, answers, failedResolvers: failures, note: agree ? "Independent resolvers agree." : "Independent resolvers disagree on the same name. Something on this path is answering for them." },
  };
}

// ── TLS / INTERCEPTION CANARY ──────────────────────────────────────────────
// A page cannot read the certificate chain. What it CAN do is request a
// control endpoint whose exact response shape is known and see whether it came
// back intact. A captive portal or intercepting proxy substitutes HTML.
export async function collectTls(): Promise<CollectedSignal> {
  const target = `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`;
  const res = await withTimeout(fetch(target, { cache: "no-store", headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string } }), 5000);
  if (!res) {
    return { type: "tls", verdict: "unknown", confidence: 0.3, evidence: { target, note: "Control endpoint unreachable — offline or blocked; not asserted as interception." } };
  }
  const ctype = res.headers.get("content-type") ?? "";
  const intercepted = res.status >= 300 && res.status < 400;
  const wrongType = res.ok && !ctype.includes("json");
  if (intercepted || wrongType) {
    return {
      type: "tls", verdict: "hostile", confidence: 0.65,
      evidence: { target, status: res.status, contentType: ctype, note: "The control endpoint answered with something it does not serve. Traffic is being terminated or redirected before it arrives." },
    };
  }
  return { type: "tls", verdict: res.ok ? "clean" : "anomalous", confidence: res.ok ? 0.55 : 0.4, evidence: { target, status: res.status, contentType: ctype } };
}

// ── WEBRTC HOST-CANDIDATE LEAK ─────────────────────────────────────────────
export async function collectWebrtc(): Promise<CollectedSignal> {
  if (typeof RTCPeerConnection === "undefined") {
    return { type: "webrtc", verdict: "clean", confidence: 0.5, evidence: { note: "WebRTC is unavailable in this runtime — no candidate surface to leak." } };
  }
  const found = new Set<string>();
  const publicV4: string[] = [];
  await withTimeout(
    new Promise<void>((resolve) => {
      let pc: RTCPeerConnection | null = null;
      try {
        pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        pc.createDataChannel("op");
        pc.onicecandidate = (e) => {
          if (!e.candidate) { resolve(); return; }
          const m = /([0-9]{1,3}(?:\.[0-9]{1,3}){3})/.exec(e.candidate.candidate);
          if (!m) return;
          found.add(m[1]);
          const ip = m[1];
          const priv = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
          if (!priv && !publicV4.includes(ip)) publicV4.push(ip);
        };
        void pc.createOffer().then((o) => pc?.setLocalDescription(o));
      } catch {
        resolve();
      } finally {
        setTimeout(() => { try { pc?.close(); } catch { /* noop */ } resolve(); }, 2500);
      }
    }),
    3000,
  );

  if (publicV4.length) {
    return {
      type: "webrtc", verdict: "hostile", confidence: 0.6,
      evidence: { publicCandidates: publicV4, allCandidates: [...found].slice(0, 8), note: "A public host candidate is being offered to any page that asks. This bypasses a tunnel entirely." },
    };
  }
  if (found.size) {
    return { type: "webrtc", verdict: "anomalous", confidence: 0.4, evidence: { candidates: [...found].slice(0, 8), note: "Private host candidates are exposed — enough to fingerprint the LAN, not enough to locate you." } };
  }
  return { type: "webrtc", verdict: "clean", confidence: 0.5, evidence: { note: "No host candidates offered." } };
}

// ── EGRESS ATTRIBUTION ─────────────────────────────────────────────────────
// The server sees the true public egress; the tab does not. This is the one
// collector that must ask the backend, and it deliberately asks the existing
// Wi-Fi Sentinel uplink path rather than growing a second attribution engine.
export async function collectEgress(): Promise<{ signal: CollectedSignal; network: { key: string; label?: string; org?: string; country?: string } | null }> {
  try {
    const { data, error } = await supabase.functions.invoke("wifi-sentinel", { body: { action: "uplink" } });
    if (error || !data?.ok || !data?.network) {
      return {
        signal: { type: "egress", verdict: "unknown", confidence: 0.3, evidence: { note: "Egress could not be attributed from this connection." } },
        network: null,
      };
    }
    const n = data.network;
    const key = n.publicIp || n.bssid || "unattributed";
    const level = String(n.riskLevel ?? "").toLowerCase();
    const verdict: Verdict = level === "high" || level === "critical" ? "hostile" : level === "elevated" || level === "medium" ? "anomalous" : "clean";
    return {
      signal: {
        type: "egress", verdict, confidence: 0.55, networkKey: key,
        evidence: { operator: n.operator, publicIp: n.publicIp, linkType: n.linkType, riskScore: n.riskScore, findings: (n.findings ?? []).slice(0, 4) },
      },
      network: { key, label: n.ssid ?? n.operator ?? key, org: n.operator ?? undefined },
    };
  } catch {
    return { signal: { type: "egress", verdict: "unknown", confidence: 0.25, evidence: { note: "Attribution request failed." } }, network: null };
  }
}

// ── POSITION ───────────────────────────────────────────────────────────────
// Position is collected only so the roster can catch two devices claiming
// mutually exclusive places. A denial is a normal outcome, never an error.
export async function collectGeo(): Promise<CollectedSignal | null> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return null;
  const perm = await navigator.permissions?.query({ name: "geolocation" as PermissionName }).catch(() => null);
  if (perm && perm.state === "denied") return null;
  const fix = await withTimeout(
    new Promise<GeolocationPosition | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: false, maximumAge: 300_000, timeout: 8000 });
    }),
    9000,
  );
  if (!fix) return null;
  return {
    type: "geo", verdict: "clean", confidence: 0.5,
    lat: fix.coords.latitude, lng: fix.coords.longitude, accuracy: fix.coords.accuracy,
    evidence: { source: "device", at: new Date(fix.timestamp).toISOString() },
  };
}

/** The full tier-1 battery. Independent, bounded, and individually survivable:
 *  one collector throwing must not cost the account the other five. */
export async function runTier1(): Promise<{ signals: CollectedSignal[]; network: { key: string; label?: string; org?: string; country?: string } | null }> {
  const [dns, tls, rtc, egress, geo] = await Promise.all([
    collectDns().catch(() => null),
    collectTls().catch(() => null),
    collectWebrtc().catch(() => null),
    collectEgress().catch(() => ({ signal: null, network: null })),
    collectGeo().catch(() => null),
  ]);
  const signals = [dns, tls, rtc, (egress as any).signal, geo].filter(Boolean) as CollectedSignal[];
  return { signals, network: (egress as any).network ?? null };
}
