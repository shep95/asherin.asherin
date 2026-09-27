import { supabase } from "@/integrations/supabase/client";

/**
 * Web Push enrolment for Rideshare Guardian.
 *
 * Every step can legitimately fail (unsupported browser, denied permission,
 * no service worker in this context) and none of them are exceptional enough
 * to throw at the caller — the UI needs a reason string, not a stack trace.
 */

export type PushState = "unsupported" | "denied" | "prompt" | "enabled" | "error";

export interface PushStatus {
  state: PushState;
  endpoint?: string;
  reason?: string;
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

export async function readPushStatus(): Promise<PushStatus> {
  if (!supported()) return { state: "unsupported", reason: "This browser cannot receive background alerts." };
  if (Notification.permission === "denied") {
    return { state: "denied", reason: "Notifications are blocked for this site in browser settings." };
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) return { state: "enabled", endpoint: sub.endpoint };
    return { state: "prompt" };
  } catch (e) {
    return { state: "error", reason: e instanceof Error ? e.message : "Push state unreadable." };
  }
}

export async function enablePush(): Promise<PushStatus> {
  if (!supported()) return { state: "unsupported", reason: "This browser cannot receive background alerts." };
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { state: permission === "denied" ? "denied" : "prompt", reason: "Permission not granted." };
    }

    const { data: keyRes, error: keyErr } = await supabase.functions.invoke("rideshare-guardian", {
      body: { action: "vapid" },
    });
    if (keyErr || !keyRes?.publicKey) {
      return { state: "error", reason: "Alert service is not configured yet." };
    }

    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey) as BufferSource,
    });

    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    const { error } = await supabase.functions.invoke("rideshare-guardian", {
      body: {
        action: "push.subscribe",
        subscription: { endpoint: sub.endpoint, keys: json.keys },
        userAgent: navigator.userAgent,
      },
    });
    if (error) return { state: "error", reason: "Device could not be registered." };

    return { state: "enabled", endpoint: sub.endpoint };
  } catch (e) {
    return { state: "error", reason: e instanceof Error ? e.message : "Enrolment failed." };
  }
}

export async function disablePush(): Promise<PushStatus> {
  if (!supported()) return { state: "unsupported" };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await supabase.functions.invoke("rideshare-guardian", {
        body: { action: "push.unsubscribe", endpoint: sub.endpoint },
      });
      await sub.unsubscribe().catch(() => {});
    }
    return { state: "prompt" };
  } catch (e) {
    return { state: "error", reason: e instanceof Error ? e.message : "Could not disable alerts." };
  }
}
