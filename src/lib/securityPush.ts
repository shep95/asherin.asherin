import { supabase } from "@/integrations/supabase/client";

/**
 * Device alerts for account-security events (laptop + phone).
 *
 * Enrolment previously lived only inside Rideshare Guardian, so a user who
 * never opened that panel had zero registered devices — email worked, nothing
 * else could. This module is the general-purpose enrolment surface: it talks
 * to `security-notify`, which is also the sender, so the browser that grants
 * permission is the browser that receives the alert.
 *
 * Nothing here throws. Every failure mode (unsupported browser, denied
 * permission, no service worker, unconfigured server key) is a reason string.
 */

export type PushState = "unsupported" | "denied" | "prompt" | "enabled" | "error";

export interface PushStatus {
  state: PushState;
  endpoint?: string;
  reason?: string;
}

export interface RegisteredDevice {
  id: string;
  endpoint: string;
  label: string | null;
  platform: string | null;
  user_agent: string | null;
  created_at: string;
  last_used_at: string | null;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function supported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

/** A human label so "Chrome · macOS" is distinguishable from "Safari · iPhone". */
export function describeThisDevice(): { label: string; platform: string } {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : /Firefox\//.test(ua) ? "Firefox"
    : "Browser";
  const platform = /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Windows/.test(ua) ? "Windows"
    : /Linux/.test(ua) ? "Linux"
    : "Unknown";
  return { label: `${browser} · ${platform}`, platform };
}

/**
 * Service-worker readiness must be raced against a timeout: `.ready` never
 * rejects, it simply hangs forever when no worker will ever activate (private
 * windows, blocked registration), and a hanging promise reads to the user as a
 * dead button.
 */
async function readyRegistration(timeoutMs = 6000): Promise<ServiceWorkerRegistration | null> {
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch {
    return null;
  }
}

export async function readPushStatus(): Promise<PushStatus> {
  if (!supported()) return { state: "unsupported", reason: "This browser cannot receive background alerts." };
  if (Notification.permission === "denied") {
    return { state: "denied", reason: "Notifications are blocked for this site in your browser settings." };
  }
  const reg = await readyRegistration();
  if (!reg) return { state: "error", reason: "Background service is not active in this browser context." };
  try {
    const sub = await reg.pushManager.getSubscription();
    if (sub) return { state: "enabled", endpoint: sub.endpoint };
    return { state: "prompt" };
  } catch (e) {
    return { state: "error", reason: e instanceof Error ? e.message : "Alert state unreadable." };
  }
}

export async function enableSecurityPush(): Promise<PushStatus> {
  if (!supported()) return { state: "unsupported", reason: "This browser cannot receive background alerts." };
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return {
        state: permission === "denied" ? "denied" : "prompt",
        reason: "Permission was not granted, so this device cannot be alerted.",
      };
    }

    const { data: keyRes, error: keyErr } = await supabase.functions.invoke("security-notify", {
      body: { action: "vapid" },
    });
    if (keyErr || !keyRes?.publicKey) {
      return { state: "error", reason: "Alert service is not configured yet." };
    }

    const reg = await readyRegistration();
    if (!reg) return { state: "error", reason: "Background service is not active in this browser context." };

    const existing = await reg.pushManager.getSubscription();
    // A stale subscription minted under a rotated VAPID key can never be
    // delivered to. Re-subscribing with the current key is the only repair.
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey) as BufferSource,
    });

    const json = sub.toJSON() as { keys?: { p256dh?: string; auth?: string } };
    const { label, platform } = describeThisDevice();
    const { error } = await supabase.functions.invoke("security-notify", {
      body: {
        action: "push.subscribe",
        subscription: { endpoint: sub.endpoint, keys: json.keys },
        userAgent: navigator.userAgent,
        label,
        platform,
      },
    });
    if (error) return { state: "error", reason: "This device could not be registered." };

    return { state: "enabled", endpoint: sub.endpoint };
  } catch (e) {
    return { state: "error", reason: e instanceof Error ? e.message : "Enrolment failed." };
  }
}

export async function disableSecurityPush(): Promise<PushStatus> {
  if (!supported()) return { state: "unsupported" };
  try {
    const reg = await readyRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await supabase.functions.invoke("security-notify", {
        body: { action: "push.unsubscribe", endpoint: sub.endpoint },
      });
      await sub.unsubscribe().catch(() => {});
    }
    return { state: "prompt" };
  } catch (e) {
    return { state: "error", reason: e instanceof Error ? e.message : "Could not disable alerts." };
  }
}

export async function listRegisteredDevices(): Promise<RegisteredDevice[]> {
  const { data, error } = await supabase.functions.invoke("security-notify", {
    body: { action: "push.list" },
  });
  if (error || !data?.devices) return [];
  return data.devices as RegisteredDevice[];
}

export async function removeDevice(endpoint: string): Promise<boolean> {
  const { error } = await supabase.functions.invoke("security-notify", {
    body: { action: "push.unsubscribe", endpoint },
  });
  return !error;
}

export async function sendTestPush(): Promise<{ ok: boolean; delivered: number; reason?: string }> {
  const { data, error } = await supabase.functions.invoke("security-notify", {
    body: { action: "push.test" },
  });
  if (error) return { ok: false, delivered: 0, reason: "Test could not be sent." };
  return {
    ok: Boolean(data?.ok),
    delivered: Number(data?.delivered ?? 0),
    reason: data?.reason === "no_devices"
      ? "No devices are registered yet."
      : (data?.errors?.[0] as string | undefined),
  };
}

/**
 * Report a security event. Fire-and-forget by design: an alert transport must
 * never block the security action that produced it (a password change has
 * already happened by the time this runs).
 */
export function reportSecurityEvent(input: {
  type: "new_device_login" | "failed_login" | "password_change" | "mfa_setup" | "mfa_disable" | "session_revoke" | "recovery_code_used";
  description?: string;
  outcome?: "success" | "failure";
  location?: string;
  device?: string;
}): void {
  const { label } = describeThisDevice();
  void supabase.functions
    .invoke("security-notify", {
      body: { action: "event", device: label, ...input },
    })
    .catch(() => {/* the audit row is written server-side; UI must not break */});
}
