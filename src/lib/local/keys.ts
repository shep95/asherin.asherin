/**
 * Device key vault — the only place a provider API key is ever written.
 *
 * At rest every key is AES-256-GCM ciphertext inside this device's IndexedDB.
 * Two lock modes:
 *
 *   device      the vault key is a NON-EXTRACTABLE WebCrypto key persisted in
 *               IndexedDB. Script on this origin can use it, nothing can read
 *               its bytes, and the ciphertext is useless on any other device.
 *
 *   passphrase  the vault key exists only wrapped (AES-KW under a PBKDF2 key
 *               derived from a passphrase the operator chose, 310k rounds).
 *               Nothing on disk can open a key until the operator unlocks the
 *               vault for this tab session.
 *
 * Keys never appear in localStorage, never in exports, never in logs, and
 * leave the device only inside the request to the provider the operator
 * picked. `user_api_keys` / `user_model_preferences` table calls from the old
 * settings screen are routed here by the query shim, so the UI is unchanged.
 */

import { kvGet, kvSet, kvDel, type Row } from "./db";
import { getLocalUser } from "./auth";

const KV_WRAP = "keyvault:wrap";
const KV_KEYS = "keyvault:keys";
const KV_PREFS = "keyvault:prefs";
const KV_DEK = "keyvault:dek";
const PBKDF2_ROUNDS = 310_000;

export const VAULT_EVENT = "asherin:keyvault-changed";

export class VaultLockedError extends Error {
  code = "VAULT_LOCKED";
  constructor() {
    super("your key vault is locked. unlock it in settings → ai keys to use a saved key.");
    this.name = "VaultLockedError";
  }
}

interface StoredKey {
  provider: string;
  iv: number[];
  ct: number[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface WrapDevice { mode: "device"; key: CryptoKey }
interface WrapPass { mode: "passphrase"; salt: number[]; wrapped: number[]; check: number[]; checkIv: number[] }
type Wrap = WrapDevice | WrapPass;

interface Prefs {
  active_provider: string;
  active_model: string;
  fallback_to_default: boolean;
  updated_at: string;
}

let sessionKey: CryptoKey | null = null;
let wrapCache: Wrap | null | undefined;

function emit() {
  try {
    window.dispatchEvent(new CustomEvent(VAULT_EVENT));
  } catch {
    /* no window */
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

async function readWrap(): Promise<Wrap | null> {
  if (wrapCache !== undefined) return wrapCache;
  wrapCache = (await kvGet<Wrap>(KV_WRAP)) ?? null;
  return wrapCache;
}

async function ensureDeviceKey(): Promise<CryptoKey> {
  const w = await readWrap();
  if (w?.mode === "device") return w.key;
  if (w?.mode === "passphrase") {
    if (sessionKey) return sessionKey;
    throw new VaultLockedError();
  }
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const rec: WrapDevice = { mode: "device", key };
  await kvSet(KV_WRAP, rec);
  wrapCache = rec;
  return key;
}

async function currentKey(): Promise<CryptoKey> {
  return ensureDeviceKey();
}

async function encryptString(key: CryptoKey, text: string): Promise<{ iv: number[]; ct: number[] }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text)));
  return { iv: Array.from(iv), ct: Array.from(ct) };
}

async function decryptString(key: CryptoKey, iv: number[], ct: number[]): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv) }, key, new Uint8Array(ct));
  return dec.decode(pt);
}

async function readKeys(): Promise<StoredKey[]> {
  return (await kvGet<StoredKey[]>(KV_KEYS)) ?? [];
}

async function writeKeys(keys: StoredKey[]) {
  await kvSet(KV_KEYS, keys);
  emit();
}

/* ── public api ─────────────────────────────────────────────────────────── */

export async function listProviderKeys(): Promise<{ provider: string; is_active: boolean; created_at: string; updated_at: string }[]> {
  return (await readKeys()).map(({ provider, is_active, created_at, updated_at }) => ({ provider, is_active, created_at, updated_at }));
}

export async function hasProviderKey(provider: string): Promise<boolean> {
  return (await readKeys()).some((k) => k.provider === provider && k.is_active);
}

export async function getProviderKey(provider: string): Promise<string | null> {
  const row = (await readKeys()).find((k) => k.provider === provider && k.is_active);
  if (!row) return null;
  const key = await currentKey();
  return decryptString(key, row.iv, row.ct);
}

export async function saveProviderKey(provider: string, apiKey: string): Promise<void> {
  const clean = apiKey.trim();
  if (!clean) throw new Error("empty key");
  const key = await currentKey();
  const { iv, ct } = await encryptString(key, clean);
  const now = new Date().toISOString();
  const keys = await readKeys();
  const idx = keys.findIndex((k) => k.provider === provider);
  const rec: StoredKey = { provider, iv, ct, is_active: true, created_at: idx >= 0 ? keys[idx].created_at : now, updated_at: now };
  if (idx >= 0) keys[idx] = rec;
  else keys.push(rec);
  await writeKeys(keys);
}

export async function deleteProviderKey(provider: string): Promise<void> {
  await writeKeys((await readKeys()).filter((k) => k.provider !== provider));
}

export async function setProviderActive(provider: string, active: boolean): Promise<void> {
  const keys = await readKeys();
  const row = keys.find((k) => k.provider === provider);
  if (row) {
    row.is_active = active;
    row.updated_at = new Date().toISOString();
    await writeKeys(keys);
  }
}

export async function getPrefs(): Promise<Prefs> {
  return (
    (await kvGet<Prefs>(KV_PREFS)) ?? { active_provider: "default", active_model: "default", fallback_to_default: false, updated_at: new Date(0).toISOString() }
  );
}

export async function setPrefs(patch: Partial<Prefs>): Promise<Prefs> {
  const next = { ...(await getPrefs()), ...patch, updated_at: new Date().toISOString() };
  await kvSet(KV_PREFS, next);
  try {
    if (next.active_provider && next.active_provider !== "default") {
      localStorage.setItem("aureon_byok_active", JSON.stringify({ provider: next.active_provider, model: next.active_model }));
    } else {
      localStorage.removeItem("aureon_byok_active");
    }
  } catch {
    /* private mode */
  }
  emit();
  return next;
}

/** The provider + model chat should use, or null when nothing is connected. */
export async function getActiveModel(): Promise<{ provider: string; model: string } | null> {
  const p = await getPrefs();
  if (p.active_provider && p.active_provider !== "default" && p.active_provider !== "aureon") {
    return { provider: p.active_provider, model: p.active_model && p.active_model !== "default" ? p.active_model : "" };
  }
  // No explicit choice: the single saved key wins.
  const keys = (await readKeys()).filter((k) => k.is_active);
  if (keys.length === 1) return { provider: keys[0].provider, model: "" };
  return null;
}

export async function wipeKeyVault(): Promise<void> {
  sessionKey = null;
  wrapCache = undefined;
  await kvDel(KV_KEYS);
  await kvDel(KV_PREFS);
  await kvDel(KV_WRAP);
  try {
    localStorage.removeItem("aureon_byok_active");
  } catch {
    /* ignore */
  }
  emit();
}

/* ── lock modes ─────────────────────────────────────────────────────────── */

export async function vaultLockState(): Promise<{ mode: "device" | "passphrase"; unlocked: boolean; keys: number }> {
  const w = await readWrap();
  const keys = (await readKeys()).length;
  if (w?.mode === "passphrase") return { mode: "passphrase", unlocked: !!sessionKey, keys };
  return { mode: "device", unlocked: true, keys };
}

async function kekFromPassphrase(pass: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: PBKDF2_ROUNDS, hash: "SHA-256" },
    base,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

/** Re-encrypt every stored key under `to`. */
async function rekey(from: CryptoKey, to: CryptoKey) {
  const keys = await readKeys();
  for (const k of keys) {
    const plain = await decryptString(from, k.iv, k.ct);
    const { iv, ct } = await encryptString(to, plain);
    k.iv = iv;
    k.ct = ct;
  }
  await writeKeys(keys);
}

/** Turn on passphrase locking. Requires the vault to be openable right now. */
export async function enablePassphrase(pass: string): Promise<void> {
  if (pass.length < 8) throw new Error("use at least 8 characters.");
  const old = await currentKey();
  const fresh = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kek = await kekFromPassphrase(pass, salt);
  const wrapped = new Uint8Array(await crypto.subtle.wrapKey("raw", fresh, kek, "AES-KW"));
  const check = await encryptString(fresh, "asherin-vault-ok");
  await rekey(old, fresh);
  const rec: WrapPass = { mode: "passphrase", salt: Array.from(salt), wrapped: Array.from(wrapped), check: check.ct, checkIv: check.iv };
  await kvSet(KV_WRAP, rec);
  wrapCache = rec;
  // Keep an unextractable handle for this session only.
  sessionKey = await crypto.subtle.unwrapKey("raw", wrapped, kek, "AES-KW", { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  emit();
}

export async function unlockVault(pass: string): Promise<boolean> {
  const w = await readWrap();
  if (!w || w.mode !== "passphrase") return true;
  try {
    const kek = await kekFromPassphrase(pass, new Uint8Array(w.salt));
    const key = await crypto.subtle.unwrapKey("raw", new Uint8Array(w.wrapped), kek, "AES-KW", { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const probe = await decryptString(key, w.checkIv, w.check);
    if (probe !== "asherin-vault-ok") return false;
    sessionKey = key;
    emit();
    return true;
  } catch {
    return false;
  }
}

export function lockVault() {
  sessionKey = null;
  emit();
}

/** Drop the passphrase: vault goes back to device mode. Needs it unlocked. */
export async function disablePassphrase(pass: string): Promise<void> {
  const w = await readWrap();
  if (!w || w.mode !== "passphrase") return;
  if (!sessionKey && !(await unlockVault(pass))) throw new Error("wrong passphrase.");
  const from = sessionKey as CryptoKey;
  const device = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await rekey(from, device);
  const rec: WrapDevice = { mode: "device", key: device };
  await kvSet(KV_WRAP, rec);
  wrapCache = rec;
  sessionKey = null;
  emit();
}

/* ── local data-encryption key for vault items / messages ───────────────── */

/**
 * The account DEK the hosted build fetched from a server now lives here: a
 * non-extractable AES-GCM key stored once in IndexedDB. Same trust boundary
 * as everything else on this device.
 */
export async function getLocalDek(): Promise<CryptoKey> {
  const existing = await kvGet<CryptoKey>(KV_DEK);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await kvSet(KV_DEK, key);
  return key;
}

/* ── table routing for the query shim ───────────────────────────────────── */

type VaultOp = { op: "select" | "insert" | "update" | "upsert" | "delete"; values: Row[]; filters: { col: string; op: string; val: unknown; negate?: boolean }[] };

/**
 * `user_api_keys` and `user_model_preferences` never touch the row store.
 * Returns the rows the caller may see (the api_key column is never present).
 */
export function keyVaultTable(table: string): ((q: VaultOp) => Promise<Row[]>) | null {
  if (table === "user_api_keys") {
    return async (q) => {
      const user = getLocalUser();
      const filterProvider = q.filters.find((f) => f.col === "provider" && f.op === "eq")?.val as string | undefined;
      switch (q.op) {
        case "insert":
        case "upsert":
          for (const v of q.values) {
            const provider = String(v.provider ?? "");
            const apiKey = typeof v.api_key === "string" ? v.api_key : "";
            if (provider && apiKey) await saveProviderKey(provider, apiKey);
            if (provider && v.is_active === false) await setProviderActive(provider, false);
            if (provider && v.is_active === true && !apiKey) await setProviderActive(provider, true);
          }
          break;
        case "update":
          if (filterProvider) {
            const v = q.values[0] ?? {};
            if (typeof v.api_key === "string" && v.api_key) await saveProviderKey(filterProvider, v.api_key);
            if (typeof v.is_active === "boolean") await setProviderActive(filterProvider, v.is_active);
          }
          break;
        case "delete":
          if (filterProvider) await deleteProviderKey(filterProvider);
          else await writeKeys([]);
          break;
        default:
          break;
      }
      const rows = await listProviderKeys();
      return rows.map((r) => ({ id: `${user.id}:${r.provider}`, user_id: user.id, ...r, api_key: undefined }));
    };
  }
  if (table === "user_model_preferences") {
    return async (q) => {
      const user = getLocalUser();
      if (q.op === "insert" || q.op === "upsert" || q.op === "update") {
        const v = q.values[0] ?? {};
        const patch: Partial<Prefs> = {};
        if (typeof v.active_provider === "string") patch.active_provider = v.active_provider;
        if (typeof v.active_model === "string") patch.active_model = v.active_model;
        if (typeof v.fallback_to_default === "boolean") patch.fallback_to_default = v.fallback_to_default;
        await setPrefs(patch);
      }
      if (q.op === "delete") await kvDel(KV_PREFS);
      const p = await getPrefs();
      return [{ id: user.id, user_id: user.id, ...p, created_at: p.updated_at }];
    };
  }
  return null;
}
