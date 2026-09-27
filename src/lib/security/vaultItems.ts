// Guardian Vault item store.
//
// Storage discipline: the row carries a kind, a label, an optional domain and
// an opaque ciphertext. Everything sensitive (username, password, note body,
// card number, TOTP seed, token) lives inside the ciphertext, sealed with the
// account DEK before it leaves the browser. The server never sees plaintext,
// and no secret ever reaches a Connect trace.

import { supabase } from "@/integrations/supabase/client";
import { encryptText, decryptText } from "@/lib/encryption";

export type VaultKind = "login" | "note" | "card" | "totp" | "token";
export type BreachStatus = "unchecked" | "clear" | "exposed" | "error";

/** Decrypted body. Shape varies by kind; all fields optional by design. */
export interface VaultSecret {
  username?: string;
  password?: string;
  note?: string;
  url?: string;
  cardNumber?: string;
  cardExpiry?: string;
  cardHolder?: string;
  totpSeed?: string;
  token?: string;
}

export interface VaultRow {
  id: string;
  kind: VaultKind;
  label: string;
  domain: string | null;
  payload_cipher: string;
  breach_status: BreachStatus;
  breach_count: number;
  breach_checked_at: string | null;
  rotated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VaultItem extends Omit<VaultRow, "payload_cipher"> {
  /** null when this device could not open the envelope. */
  secret: VaultSecret | null;
  sealed: boolean;
}

export const KIND_LABEL: Record<VaultKind, string> = {
  login: "Login",
  note: "Secure note",
  card: "Card",
  totp: "Authenticator",
  token: "API token",
};

/** Normalise a host from a URL or bare domain. Never throws. */
export function normalizeDomain(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim().toLowerCase();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    const host = new URL(withScheme).hostname.replace(/^www\./, "");
    return host && host.includes(".") ? host.slice(0, 253) : null;
  } catch {
    return null;
  }
}

export async function listVaultItems(userId: string): Promise<VaultItem[]> {
  const { data, error } = await supabase
    .from("vault_items")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as VaultRow[];
  return Promise.all(
    rows.map(async ({ payload_cipher, ...rest }) => {
      try {
        const json = await decryptText(payload_cipher, userId);
        return { ...rest, secret: JSON.parse(json) as VaultSecret, sealed: false };
      } catch {
        // Honest failure: show the item as sealed rather than inventing content.
        return { ...rest, secret: null, sealed: true };
      }
    }),
  );
}

export interface VaultDraft {
  kind: VaultKind;
  label: string;
  domain?: string | null;
  secret: VaultSecret;
}

export async function createVaultItem(userId: string, draft: VaultDraft): Promise<string> {
  const label = draft.label.trim().slice(0, 120);
  if (!label) throw new Error("A label is required");

  const cipher = await encryptText(JSON.stringify(draft.secret), userId);
  const { data, error } = await supabase
    .from("vault_items")
    .insert([{
      user_id: userId,
      kind: draft.kind,
      label,
      domain: normalizeDomain(draft.domain ?? draft.secret.url ?? null),
      payload_cipher: cipher,
      rotated_at: new Date().toISOString(),
    }])
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function updateVaultItem(
  userId: string,
  id: string,
  draft: VaultDraft,
  opts: { markRotated?: boolean } = {},
): Promise<void> {
  const label = draft.label.trim().slice(0, 120);
  if (!label) throw new Error("A label is required");

  const cipher = await encryptText(JSON.stringify(draft.secret), userId);
  const patch: Record<string, unknown> = {
    kind: draft.kind,
    label,
    domain: normalizeDomain(draft.domain ?? draft.secret.url ?? null),
    payload_cipher: cipher,
  };
  // Changing the secret resets the exposure verdict — a stale "clear" lies.
  if (opts.markRotated) {
    patch.rotated_at = new Date().toISOString();
    patch.breach_status = "unchecked";
    patch.breach_count = 0;
    patch.breach_checked_at = null;
  }

  const { error } = await supabase.from("vault_items").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteVaultItem(id: string): Promise<void> {
  const { error } = await supabase.from("vault_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function recordExposure(
  id: string,
  status: BreachStatus,
  count: number,
): Promise<void> {
  const { error } = await supabase
    .from("vault_items")
    .update({
      breach_status: status,
      breach_count: Math.max(0, Math.round(count)),
      breach_checked_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
