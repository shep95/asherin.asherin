// ═══════════════════════════════════════════════════════════════════════════
// Remote vault — the cross-device mirror for contact intelligence.
//
// The device vault (IndexedDB) is fast and offline-safe but it is an island:
// a sweep run on the laptop is invisible to the phone. This module makes the
// newest snapshot authoritative across every device the operator signs in on.
//
// Reconciliation rule: last-write-wins on `savedAt`, with a strict monotonic
// guard — a push is refused when the server already holds a newer snapshot, so
// a stale tab waking from sleep can never overwrite a fresher sweep.
// Every read and write is scoped by RLS to the authenticated user.
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from "@/integrations/supabase/client";
import type { ContactDossier, IntelSummary } from "./messageIntel";
import type { VaultSnapshot } from "./localVault";

const KIND = "contact_intel";
const DEVICE_KEY = "asherin_device_id";
/** jsonb tolerates far more, but a multi-megabyte round trip on mobile data is
 *  a worse outcome than a trimmed roster. Dossiers are sorted by importance, so
 *  trimming removes the least significant identities first. */
const MAX_BYTES = 3_000_000;

export interface RemoteMeta {
  savedAt: number;
  deviceId: string;
  deviceLabel: string | null;
  bytes: number;
}

export interface DeviceRow {
  device_id: string;
  label: string | null;
  platform: string | null;
  last_seen_at: string;
  last_push_at: string | null;
}

/** A stable per-browser identifier. Random, not fingerprinted — it exists only
 *  so the operator can tell "laptop" from "phone" in the device list. */
export function deviceId(): string {
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
    return "ephemeral";
  }
}

/** Human label derived from the UA. Coarse by design — no fingerprint surface. */
export function deviceLabel(): string {
  if (typeof navigator === "undefined") return "Unknown device";
  const ua = navigator.userAgent || "";
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const os = /Windows/i.test(ua)
    ? "Windows"
    : /Macintosh|Mac OS/i.test(ua)
    ? "macOS"
    : /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
    ? "iOS"
    : /Linux/i.test(ua)
    ? "Linux"
    : "Unknown";
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /OPR\//i.test(ua)
    ? "Opera"
    : /Chrome\//i.test(ua)
    ? "Chrome"
    : /Safari\//i.test(ua)
    ? "Safari"
    : /Firefox\//i.test(ua)
    ? "Firefox"
    : "Browser";
  return `${os} ${mobile ? "mobile" : "desktop"} · ${browser}`;
}

function sizeOf(value: unknown): number {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return 0;
  }
}

/** Announce this device so the operator can see which endpoints feed the mesh. */
export async function touchDevice(userId: string, pushed = false): Promise<void> {
  if (!userId) return;
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    user_id: userId,
    device_id: deviceId(),
    label: deviceLabel(),
    platform: typeof navigator !== "undefined" ? navigator.platform || null : null,
    last_seen_at: now,
  };
  if (pushed) row.last_push_at = now;
  const { error } = await supabase
    .from("google_intel_devices")
    .upsert(row as never, { onConflict: "user_id,device_id" });
  if (error) console.warn("[remote-vault] device touch failed:", error.message);
}

export async function listDevices(userId: string): Promise<DeviceRow[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("google_intel_devices")
    .select("device_id, label, platform, last_seen_at, last_push_at")
    .eq("user_id", userId)
    .order("last_seen_at", { ascending: false })
    .limit(25);
  if (error) {
    console.warn("[remote-vault] device list failed:", error.message);
    return [];
  }
  return (data ?? []) as DeviceRow[];
}

/** Read the mirror without paying for the payload — used to decide direction. */
export async function fetchRemoteMeta(userId: string): Promise<RemoteMeta | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("google_intel_snapshots")
    .select("saved_at, device_id, device_label, bytes")
    .eq("user_id", userId)
    .eq("kind", KIND)
    .maybeSingle();
  if (error || !data) return null;
  return {
    savedAt: new Date(data.saved_at as string).getTime(),
    deviceId: String(data.device_id ?? ""),
    deviceLabel: (data.device_label as string) ?? null,
    bytes: Number(data.bytes ?? 0),
  };
}

/** Pull the authoritative snapshot. Shape is validated before it reaches state. */
export async function pullRemote(userId: string): Promise<VaultSnapshot | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("google_intel_snapshots")
    .select("saved_at, payload")
    .eq("user_id", userId)
    .eq("kind", KIND)
    .maybeSingle();
  if (error || !data?.payload) return null;
  const payload = data.payload as { summary?: IntelSummary; dossiers?: ContactDossier[] };
  if (!payload.summary || !Array.isArray(payload.dossiers)) return null;
  return {
    id: userId,
    savedAt: new Date(data.saved_at as string).getTime(),
    summary: payload.summary,
    dossiers: payload.dossiers,
  };
}

/**
 * Push a snapshot to the mirror.
 * Returns `"pushed"`, `"stale"` (server already newer — nothing written), or
 * `"failed"`. Never throws: a mirror failure must not void a good local sweep.
 */
export async function pushRemote(
  userId: string,
  snapshot: VaultSnapshot,
): Promise<"pushed" | "stale" | "failed"> {
  if (!userId || !snapshot.summary) return "failed";
  try {
    const remote = await fetchRemoteMeta(userId);
    // Monotonic guard: equal timestamps are treated as already-mirrored.
    if (remote && remote.savedAt >= snapshot.savedAt) return "stale";

    let dossiers = snapshot.dossiers;
    let payload = { summary: snapshot.summary, dossiers };
    let bytes = sizeOf(payload);
    // Trim from the tail (least important identities) until it fits.
    while (bytes > MAX_BYTES && dossiers.length > 50) {
      dossiers = dossiers.slice(0, Math.max(50, Math.floor(dossiers.length * 0.7)));
      payload = { summary: snapshot.summary, dossiers };
      bytes = sizeOf(payload);
    }

    const { error } = await supabase.from("google_intel_snapshots").upsert(
      {
        user_id: userId,
        kind: KIND,
        saved_at: new Date(snapshot.savedAt).toISOString(),
        device_id: deviceId(),
        device_label: deviceLabel(),
        bytes,
        payload: payload as never,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "user_id,kind" },
    );
    if (error) {
      console.warn("[remote-vault] push failed:", error.message);
      return "failed";
    }
    void touchDevice(userId, true);
    return "pushed";
  } catch (e) {
    console.warn("[remote-vault] push threw:", (e as Error).message);
    return "failed";
  }
}
