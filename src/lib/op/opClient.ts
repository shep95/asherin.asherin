// ═══════════════════════════════════════════════════════════════════════════
// OP LAYER — CLIENT
//
// The seam between this device and the account's shared brain. Enrolment is
// idempotent, reporting is bounded, and directives handed back by the server
// are executed here — but only ever the reversible, device-scoped ones, and
// every execution reports its outcome back so the audit trail closes.
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from "@/integrations/supabase/client";
import { opDeviceId, opFingerprint, opFormFactor, opLabel, opPlatform } from "./opIdentity";
import { runTier1, type CollectedSignal } from "./opCollectors";
import { toast } from "sonner";

export type ConsentLevel = "identity" | "read" | "comprehension";
const CONSENT_KEY = "asherin.op.consent";

/** Tiered and explicit, per device. A device is a sensor only to the depth the
 *  operator knowingly enrolled it at — the same identity/read/comprehension
 *  ladder the Google mesh already uses, pointed at network and radio instead
 *  of mail and calendar. */
export function opConsent(): ConsentLevel {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "read" || v === "comprehension" ? v : "identity";
  } catch {
    return "identity";
  }
}

export function setOpConsent(level: ConsentLevel): void {
  try { localStorage.setItem(CONSENT_KEY, level); } catch { /* noop */ }
}

async function call<T = any>(body: Record<string, unknown>): Promise<T | null> {
  try {
    const { data, error } = await supabase.functions.invoke("op-layer", { body });
    if (error) throw error;
    return data as T;
  } catch (e) {
    console.warn("[op] call failed", body.action, String(e));
    return null;
  }
}

let enrolled = false;

export async function opEnroll(): Promise<{ inherited: any } | null> {
  const res = await call({
    action: "enroll",
    deviceId: opDeviceId(),
    label: opLabel(),
    platform: opPlatform(),
    appVersion: (import.meta.env.VITE_APP_VERSION as string) || "web",
    formFactor: opFormFactor(),
    fingerprint: opFingerprint(),
    consentLevel: opConsent(),
    expectedIntervalMinutes: 30,
  });
  if (res) enrolled = true;
  return res;
}

/**
 * Executes a directive the correlation layer earned the right to issue. Every
 * one is reversible and confined to this device: the layer may protect you, it
 * may not lock you out of your own account from a reading it made itself.
 */
async function execute(directive: { id: string; action: string; rationale: any }): Promise<void> {
  let outcome: "executed" | "declined" | "failed" = "executed";
  try {
    switch (directive.action) {
      case "engage_vpn_profile":
        toast.warning("Network countermeasure", {
          description: "Corroborated hostile network conditions. Engage your VPN before signing into anything on this connection.",
          duration: 15000,
        });
        break;
      case "force_credential_rotation":
        toast.error("Credential rotation required", {
          description: "A credential tied to this account is exposed and an unfamiliar device is active. Rotate it and revoke old sessions now.",
          duration: 20000,
        });
        break;
      case "lock_session":
        toast.error("Session locked on this device", {
          description: "Two devices reported positions the same person cannot occupy. Signing out here as a precaution.",
          duration: 12000,
        });
        await supabase.auth.signOut({ scope: "local" });
        break;
      default:
        outcome = "declined";
    }
  } catch {
    outcome = "failed";
  }
  await call({ action: "action-outcome", actionId: directive.id, outcome });
}

export interface OpReportResult {
  posture: { score: number; label: string; covered: number; silent: number };
  findings: any[];
}

export async function opReport(tier: "foreground" | "background" = "foreground"): Promise<OpReportResult | null> {
  if (!enrolled) await opEnroll();
  if (opConsent() === "identity") {
    // Enrolled but not yet a sensor. Presence only — and the roster will say so
    // rather than pretending this device is covered.
    await call({ action: "report", deviceId: opDeviceId(), tier, signals: [] });
    return null;
  }

  const { signals, network } = await runTier1();
  const payload: CollectedSignal[] = opConsent() === "comprehension" ? signals : signals.filter((s) => s.type !== "geo");

  const res = await call<{ posture: any; findings: any[]; directives: any[] }>({
    action: "report",
    deviceId: opDeviceId(),
    tier,
    network: network ? { key: network.key, label: network.label ?? null, org: network.org ?? null, country: network.country ?? null } : undefined,
    signals: payload.map((s) => ({
      type: s.type,
      verdict: s.verdict,
      confidence: s.confidence,
      networkKey: s.networkKey ?? null,
      lat: s.lat ?? null,
      lng: s.lng ?? null,
      accuracy: s.accuracy ?? null,
      evidence: s.evidence,
      observedAt: new Date().toISOString(),
    })),
  });
  if (!res) return null;

  for (const d of res.directives ?? []) await execute(d);
  return { posture: res.posture, findings: res.findings ?? [] };
}

export async function opState(sweep = false) {
  return call({ action: sweep ? "sweep" : "state" });
}

export const opTrustDevice = (deviceId: string, trusted = true) => call({ action: "trust", deviceId, trusted });
export const opRevokeDevice = (deviceId: string) => call({ action: "revoke", deviceId });
export const opAcknowledge = (findingId: string) => call({ action: "acknowledge", findingId });
export const opSettings = (s: { enabled?: boolean; autoResponse?: boolean; intervalMinutes?: number }) => call({ action: "settings", ...s });
export const opCurrentDeviceId = opDeviceId;
