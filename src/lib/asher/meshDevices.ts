/**
 * ASHERIN DEVICE MESH — pairing by Google account.
 *
 * The join key is the Google account, not the browser. Every device that runs
 * Asherin under a session whose linked Google accounts overlap with another
 * device's is treated as one operator's fleet: laptop and phone see each other,
 * with battery and live position, without either being "added" by hand.
 *
 * Honesty boundary, stated once: Google exposes no public API for a phone's
 * battery or its live position. Anything claiming otherwise would be a
 * fabrication. So Google supplies *identity* (which devices belong together)
 * and every telemetry number here is measured on the reporting device itself —
 * Battery Status API for charge, Geolocation for position, Network Information
 * for link. A device that cannot measure a field reports null and the UI says
 * so rather than inventing a value.
 */

import { supabase } from "@/integrations/supabase/client";
import { handOverMesh } from "@/lib/sentinel/background";

const DEVICE_KEY = "asherin_device_id";

export interface MeshDevice {
  id: string;
  owner_is_self: boolean;
  device_id: string;
  label: string | null;
  platform: string | null;
  form_factor: string;
  google_emails: string[];
  battery_pct: number | null;
  battery_charging: boolean | null;
  battery_at: string | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  fix_at: string | null;
  link_type: string | null;
  effective_type: string | null;
  last_seen_at: string;
}

/* ── device identity ─────────────────────────────────────────────────────── */

/** Stable, random, per-browser. Shared with the contact-intel vault on purpose
 *  so one physical device is one row everywhere, never two half-populated ones. */
export function meshDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    // Private mode: an ephemeral id still reports truthfully, it just will not
    // survive a reload. Better than refusing to report at all.
    return `ephemeral-${Math.random().toString(36).slice(2)}`;
  }
}

export function meshFormFactor(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent || "";
  if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "tablet";
  if (/iPhone|iPod|Android.+Mobile|Windows Phone/i.test(ua)) return "phone";
  if (/Macintosh|Windows NT|X11|CrOS/i.test(ua)) return "laptop";
  return "unknown";
}

export function meshLabel(): string {
  if (typeof navigator === "undefined") return "Unknown device";
  const ua = navigator.userAgent || "";
  const os =
    /iPhone|iPad|iPod/i.test(ua) ? "iOS"
    : /Android/i.test(ua) ? "Android"
    : /CrOS/i.test(ua) ? "ChromeOS"
    : /Mac OS X/i.test(ua) ? "macOS"
    : /Windows NT/i.test(ua) ? "Windows"
    : /Linux/i.test(ua) ? "Linux"
    : "Device";
  const browser =
    /Edg\//i.test(ua) ? "Edge"
    : /OPR\//i.test(ua) ? "Opera"
    : /Firefox\//i.test(ua) ? "Firefox"
    : /Chrome\//i.test(ua) ? "Chrome"
    : /Safari\//i.test(ua) ? "Safari"
    : "Browser";
  return `${os} · ${browser}`;
}

/* ── measured telemetry ──────────────────────────────────────────────────── */

interface BatteryReading { pct: number | null; charging: boolean | null }

type BatteryManager = EventTarget & { level: number; charging: boolean };

let batteryRef: BatteryManager | null = null;
let batteryBound = false;

async function batteryManager(): Promise<BatteryManager | null> {
  if (batteryRef) return batteryRef;
  const getBattery = (navigator as unknown as { getBattery?: () => Promise<BatteryManager> }).getBattery;
  if (typeof getBattery !== "function") return null;
  try {
    batteryRef = await getBattery.call(navigator);
    return batteryRef;
  } catch {
    // Firefox and Safari removed the API. Null is the honest answer.
    return null;
  }
}

export async function readBattery(): Promise<BatteryReading> {
  const b = await batteryManager();
  if (!b) return { pct: null, charging: null };
  const level = typeof b.level === "number" ? b.level : NaN;
  return {
    pct: Number.isFinite(level) ? Math.max(0, Math.min(100, Math.round(level * 100))) : null,
    charging: typeof b.charging === "boolean" ? b.charging : null,
  };
}

function readLink(): { link_type: string | null; effective_type: string | null } {
  const c = (navigator as unknown as { connection?: { type?: string; effectiveType?: string } }).connection;
  return { link_type: c?.type ?? null, effective_type: c?.effectiveType ?? null };
}

/** Google accounts linked on THIS session. RLS keeps this to the caller. */
async function linkedGoogleEmails(): Promise<string[]> {
  try {
    // The OAuth writer stores "connected"; "expired" and "pending_oauth" are the
    // other states. Filtering on "active" never matched a single row, so the
    // mesh reported zero linked mailboxes while five were live.
    const { data, error } = await supabase
      .from("google_accounts")
      .select("google_email,status")
      .eq("status", "connected");
    if (error) throw error;
    const set = new Set(
      (data ?? [])
        .map((r) => String((r as { google_email: string }).google_email || "").trim().toLowerCase())
        .filter(Boolean),
    );
    return [...set] as string[];
  } catch {
    return [];
  }
}

/* ── reporting ───────────────────────────────────────────────────────────── */

export interface MeshFix { lat: number; lng: number; accuracy?: number | null }

let lastReportAt = 0;
let lastEmailsAt = 0;
let cachedEmails: string[] = [];
/** Serialises overlapping reports so a battery event and a GPS tick landing in
 *  the same millisecond cannot race into a lost update. */
let inflight: Promise<void> = Promise.resolve();

async function emails(): Promise<string[]> {
  const now = Date.now();
  if (now - lastEmailsAt < 10 * 60_000 && cachedEmails.length) return cachedEmails;
  cachedEmails = await linkedGoogleEmails();
  lastEmailsAt = now;
  return cachedEmails;
}

async function writeReport(fix: MeshFix | null, source: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return;

  const battery = await readBattery();
  const link = readLink();
  const nowIso = new Date().toISOString();

  const row: Record<string, unknown> = {
    user_id: user.id,
    device_id: meshDeviceId(),
    label: meshLabel(),
    platform: (navigator as unknown as { platform?: string }).platform ?? null,
    form_factor: meshFormFactor(),
    google_emails: await emails(),
    battery_pct: battery.pct,
    battery_charging: battery.charging,
    battery_at: battery.pct === null ? null : nowIso,
    link_type: link.link_type,
    effective_type: link.effective_type,
    last_source: source,
    last_seen_at: nowIso,
    updated_at: nowIso,
  };

  // A report without a fix must never blank a good one: omit the columns.
  if (fix && Number.isFinite(fix.lat) && Number.isFinite(fix.lng)) {
    row.lat = fix.lat;
    row.lng = fix.lng;
    row.accuracy = Number.isFinite(Number(fix.accuracy)) ? Number(fix.accuracy) : null;
    row.fix_at = nowIso;
  }

  const { error } = await supabase
    .from("mesh_devices")
    .upsert(row as never, { onConflict: "user_id,device_id" });
  if (error) throw error;

  // Leave the last true reading with the background worker, which cannot read
  // the Battery Status API itself, so the fleet keeps updating after this tab
  // is closed.
  handOverMesh({
    deviceId: String(row.device_id),
    batteryPct: battery.pct,
    charging: battery.charging,
  });
}

/** Idempotent, throttled, never throws into a caller's render path. */
export async function reportMeshDevice(
  fix: MeshFix | null = null,
  opts: { source?: string; force?: boolean } = {},
): Promise<void> {
  const source = opts.source || "web";
  if (!opts.force && Date.now() - lastReportAt < 45_000 && !fix) return;
  lastReportAt = Date.now();
  inflight = inflight
    .catch(() => {})
    .then(() => writeReport(fix, source))
    .catch((e) => console.warn("[mesh] report failed", e instanceof Error ? e.message : e));
  return inflight;
}

/** Battery is event-driven: a level change is the only moment the number is
 *  new, so polling it on a timer would either lag or waste writes. */
export async function bindBatteryReporting(): Promise<() => void> {
  if (batteryBound) return () => {};
  const b = await batteryManager();
  if (!b) return () => {};
  batteryBound = true;
  const onChange = () => void reportMeshDevice(null, { source: "battery", force: true });
  b.addEventListener("levelchange", onChange);
  b.addEventListener("chargingchange", onChange);
  return () => {
    b.removeEventListener("levelchange", onChange);
    b.removeEventListener("chargingchange", onChange);
    batteryBound = false;
  };
}

/* ── reading the fleet ───────────────────────────────────────────────────── */

export async function fetchMeshRoster(): Promise<MeshDevice[]> {
  const { data, error } = await supabase.rpc("mesh_roster");
  if (error) throw error;
  return (data ?? []) as MeshDevice[];
}

export async function forgetMeshDevice(deviceId: string): Promise<void> {
  const { error } = await supabase.from("mesh_devices").delete().eq("device_id", deviceId);
  if (error) throw error;
}

/* ── presentation helpers ────────────────────────────────────────────────── */

export function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60_000));
}

export function fmtAgo(iso: string | null): string {
  const m = minutesSince(iso);
  if (m === null) return "never";
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export type MeshLiveness = "live" | "recent" | "stale" | "dark";

export function liveness(d: MeshDevice): MeshLiveness {
  const m = minutesSince(d.last_seen_at);
  if (m === null) return "dark";
  if (m <= 5) return "live";
  if (m <= 60) return "recent";
  if (m <= 24 * 60) return "stale";
  return "dark";
}

export const LIVENESS_COLOR: Record<MeshLiveness, string> = {
  live: "#3fb950",
  recent: "#c98b3a",
  stale: "#8b8b8b",
  dark: "#5a5a5a",
};

export function batteryLabel(d: MeshDevice): string {
  if (d.battery_pct === null || d.battery_pct === undefined) return "Battery n/a";
  return `${d.battery_pct}%${d.battery_charging ? " ⚡" : ""}`;
}

/** Never claim a pin tighter than the device's own reported error. */
export function fixCaption(d: MeshDevice): string {
  if (d.lat === null || d.lng === null) return "No position reported by this device";
  const acc = d.accuracy && d.accuracy > 0 ? Math.round(d.accuracy) : null;
  return acc
    ? `Within ~${acc} m · fix ${fmtAgo(d.fix_at)}`
    : `Position reported · fix ${fmtAgo(d.fix_at)}`;
}
