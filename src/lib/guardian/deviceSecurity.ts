/**
 * guardian vault — device security facts.
 *
 * this room has no account to report on. what it can report, truthfully, is
 * the state of this device: how the key vault is locked, which provider keys
 * it holds (names and dates, never the secrets), what is ciphertext at rest
 * and under which key, and what this device has recorded about itself.
 *
 * every reader here goes to a real module (`@/lib/local/keys`, the local row
 * store through the query shim, the browser's Notification api). nothing is
 * estimated and nothing leaves the device.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  disablePassphrase,
  enablePassphrase,
  listProviderKeys,
  unlockVault,
  vaultLockState,
} from "@/lib/local/keys";
import { isEncrypted } from "@/lib/encryption";

/* ── the key vault ────────────────────────────────────────────────────────── */

export type VaultMode = "device" | "passphrase";

export interface ProviderKeyFact {
  provider: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_used_at?: string;
}

export interface VaultFacts {
  mode: VaultMode;
  unlocked: boolean;
  keys: ProviderKeyFact[];
}

export const EMPTY_VAULT: VaultFacts = { mode: "device", unlocked: true, keys: [] };

export async function readVaultFacts(): Promise<VaultFacts> {
  const [state, keys] = await Promise.all([vaultLockState(), listProviderKeys()]);
  return { mode: state.mode, unlocked: state.unlocked, keys };
}

/** one lowercase sentence for the lock state. pure. */
export function describeLock(facts: Pick<VaultFacts, "mode" | "unlocked">): string {
  if (facts.mode === "passphrase") {
    return facts.unlocked
      ? "passphrase lock, unlocked for this tab session"
      : "passphrase lock, locked — saved keys cannot be read until you unlock";
  }
  return "device key — a non-extractable webcrypto key held in this browser profile";
}

const PROVIDER_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  gemini: "Google Gemini",
  mistral: "Mistral",
  groq: "Groq",
  xai: "xAI",
  deepseek: "DeepSeek",
  openrouter: "OpenRouter",
  perplexity: "Perplexity",
  cohere: "Cohere",
  together: "Together",
  ollama: "Ollama",
};

/** proper names keep their case; unknown ids are shown as written. */
export function providerName(id: string): string {
  return PROVIDER_NAMES[id.toLowerCase()] ?? id;
}

/**
 * change the passphrase without ever leaving the vault openable by nobody.
 * the current passphrase is proven first; the lock is then re-wrapped under
 * the new one. if the second step fails the vault is in device mode and the
 * error says so, so the operator knows to add a lock again.
 */
export async function changePassphrase(current: string, next: string): Promise<void> {
  if (next.length < 8) throw new Error("use at least 8 characters for the new passphrase.");
  if (current === next) throw new Error("the new passphrase is the same as the current one.");
  if (!(await unlockVault(current))) throw new Error("that passphrase did not open the vault.");
  await disablePassphrase(current);
  try {
    await enablePassphrase(next);
  } catch (e) {
    throw new Error(
      `the old lock was removed but the new one could not be set (${(e as Error).message}). the vault is in device mode — add a passphrase lock again.`,
    );
  }
}

/* ── what is ciphertext at rest ───────────────────────────────────────────── */

export interface EncryptionFacts {
  /** chat messages in the local store, and how many carry an ENC: envelope. */
  messagesTotal: number;
  messagesEncrypted: number;
  /** vault items: every row is ciphertext by construction. */
  vaultItems: number;
  /** whiteboards persisted in localStorage: null when none, else whether sealed. */
  whiteboardSealed: boolean | null;
}

export const EMPTY_ENCRYPTION: EncryptionFacts = {
  messagesTotal: 0,
  messagesEncrypted: 0,
  vaultItems: 0,
  whiteboardSealed: null,
};

const WHITEBOARD_PREFIX = "aureon-whiteboards-v3:";

/** read the whiteboard envelope state without parsing it. pure over the store. */
export function whiteboardSealedState(store: Pick<Storage, "length" | "key" | "getItem">): boolean | null {
  let seen = false;
  let sealed = true;
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (!k || !k.startsWith(WHITEBOARD_PREFIX)) continue;
    seen = true;
    const v = store.getItem(k);
    if (!v || !isEncrypted(v)) sealed = false;
  }
  return seen ? sealed : null;
}

export async function readEncryptionFacts(userId: string): Promise<EncryptionFacts> {
  const [total, enc, items] = await Promise.all([
    supabase.from("messages").select("id", { count: "exact", head: true }),
    supabase.from("messages").select("id", { count: "exact", head: true }).like("content", "ENC:%"),
    supabase.from("vault_items").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  let whiteboardSealed: boolean | null = null;
  try {
    whiteboardSealed = whiteboardSealedState(window.localStorage);
  } catch {
    whiteboardSealed = null;
  }
  return {
    messagesTotal: total.count ?? 0,
    messagesEncrypted: enc.count ?? 0,
    vaultItems: items.count ?? 0,
    whiteboardSealed,
  };
}

/* ── recommendations ──────────────────────────────────────────────────────── */

export interface Recommendation {
  id: "add-passphrase" | "lock-now" | "plain-messages" | "no-keys" | "all-clear";
  title: string;
  detail: string;
  tone: "amber" | "quiet" | "good";
}

/** what this device could do better, said plainly. pure. */
export function recommend(vault: VaultFacts, enc: EncryptionFacts): Recommendation[] {
  const out: Recommendation[] = [];
  const plain = Math.max(0, enc.messagesTotal - enc.messagesEncrypted);

  if (vault.keys.length > 0 && vault.mode === "device") {
    out.push({
      id: "add-passphrase",
      title: "add a passphrase lock",
      detail: `${vault.keys.length} provider ${vault.keys.length === 1 ? "key is" : "keys are"} usable by anyone who opens this browser profile. a passphrase keeps them wrapped until you unlock. there is no recovery if you forget it.`,
      tone: "amber",
    });
  }
  if (vault.mode === "passphrase" && vault.unlocked) {
    out.push({
      id: "lock-now",
      title: "lock the vault when you step away",
      detail: "unlocked state lasts for this tab until you lock it or close the tab.",
      tone: "quiet",
    });
  }
  if (plain > 0) {
    out.push({
      id: "plain-messages",
      title: `${plain} chat ${plain === 1 ? "message" : "messages"} stored as plain text`,
      detail: "these rows predate encryption on this device and are readable by anything that can read this browser's indexeddb. new messages are sealed with the device data key.",
      tone: "amber",
    });
  }
  if (vault.keys.length === 0) {
    out.push({
      id: "no-keys",
      title: "no provider keys stored",
      detail: "add one in settings → intelligence. it will be encrypted here before it is written.",
      tone: "quiet",
    });
  }
  if (out.every((r) => r.tone !== "amber")) {
    out.unshift({
      id: "all-clear",
      title: "nothing to flag on this device",
      detail: "keys are wrapped, chat is sealed, and nothing here talks to a server.",
      tone: "good",
    });
  }
  return out;
}

/* ── the device trail (shared with asherin.activity) ─────────────────────── */

export interface TrailEntry {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

/** lowercase labels for the actions this room writes. unknown actions are shown as written. */
export const TRAIL_LABEL: Record<string, string> = {
  vault_locked: "vault locked",
  vault_unlocked: "vault unlocked",
  vault_unlock_failed: "unlock attempt failed",
  passphrase_enabled: "passphrase lock turned on",
  passphrase_disabled: "passphrase lock removed",
  passphrase_changed: "passphrase changed",
  item_created: "item stored",
  item_updated: "item updated",
  item_deleted: "item removed",
  exposure_check: "exposure check run",
  notifications_enabled: "notifications allowed",
  notifications_tested: "test notification shown",
};

export function trailLabel(entry: Pick<TrailEntry, "action">): string {
  return TRAIL_LABEL[entry.action] ?? entry.action.replace(/_/g, " ").toLowerCase();
}

export const TRAIL_LIMIT = 200;

export async function readTrail(limit = TRAIL_LIMIT): Promise<TrailEntry[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as TrailEntry[]).filter((e) => typeof e.action === "string");
}

/**
 * write one row to the trail asherin.activity reads. details must never hold
 * a secret: callers pass counts, kinds and outcomes only.
 */
export async function recordTrail(
  action: string,
  resourceType: string,
  details?: Record<string, unknown>,
  resourceId?: string | null,
): Promise<void> {
  try {
    await supabase.from("audit_log").insert({
      action,
      resource_type: resourceType,
      resource_id: resourceId ?? null,
      details: details ?? null,
    });
  } catch {
    /* the trail is a record, not a gate: a failed write never blocks the action */
  }
}

/* ── browser notifications, without a server ──────────────────────────────── */

export type NotifyState = "unsupported" | "denied" | "default" | "granted";

export function readNotifyState(): NotifyState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  const p = Notification.permission;
  return p === "granted" || p === "denied" ? p : "default";
}

export async function requestNotify(): Promise<NotifyState> {
  if (readNotifyState() === "unsupported") return "unsupported";
  try {
    const p = await Notification.requestPermission();
    return p === "granted" || p === "denied" ? p : "default";
  } catch {
    return readNotifyState();
  }
}

/** show one notification from this tab. false when the browser refused. */
export async function showLocalNotification(title: string, body: string): Promise<boolean> {
  if (readNotifyState() !== "granted") return false;
  try {
    if ("serviceWorker" in navigator) {
      const reg = await Promise.race([
        navigator.serviceWorker.getRegistration(),
        new Promise<undefined>((r) => setTimeout(() => r(undefined), 1500)),
      ]);
      if (reg) {
        await reg.showNotification(title, { body });
        return true;
      }
    }
    new Notification(title, { body });
    return true;
  } catch {
    return false;
  }
}

/** one lowercase sentence per permission state. pure. */
export function describeNotify(state: NotifyState): string {
  switch (state) {
    case "unsupported": return "this browser has no notification api.";
    case "denied": return "notifications are blocked for this site in the browser's settings; asherin cannot ask again.";
    case "granted": return "allowed. a notification can be shown while asherin is open in a tab.";
    default: return "not asked yet.";
  }
}
