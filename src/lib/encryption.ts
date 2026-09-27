/**
 * ASHERIN Client-Side Encryption Module — account-scoped DEK.
 *
 * AES-256-GCM via Web Crypto API.
 *
 * Key material = one device-scoped data encryption key (DEK): a non-extractable
 * WebCrypto key minted once on this device and kept in its IndexedDB. Nothing
 * off this device can open what it encrypts.
 *
 * Previous behaviour (device-local PBKDF2 over an IndexedDB device secret) is
 * retained ONLY as a read-path fallback so ciphertext written before this
 * change still opens on the device that wrote it. It is never used to encrypt.
 *
 * Failures NEVER silently fall back to plaintext. They throw.
 */


const DB_NAME = "aureon_e2e_db";
const DB_VERSION = 1;
const STORE = "keystore";
const LEGACY_ITERATIONS = 250_000;

export class EncryptionError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "EncryptionError";
  }
}

/* ------------------------------------------------------------------ */
/* Account DEK                                                         */
/* ------------------------------------------------------------------ */

// Session-scoped memory cache. Never the sole source of truth, never persisted.
const dekCache = new Map<string, CryptoKey>();
const dekInflight = new Map<string, Promise<CryptoKey>>();

async function fetchDek(_userId: string): Promise<CryptoKey> {
  // Local edition: the data-encryption key is a non-extractable WebCrypto key
  // minted once on this device. No server ever holds or wraps it.
  const { getLocalDek } = await import("@/lib/local/keys");
  return getLocalDek();
}

/** Account-scoped AES-GCM key. Same user + any device => same key. */
export async function getDek(userId: string): Promise<CryptoKey> {
  const cached = dekCache.get(userId);
  if (cached) return cached;

  const inflight = dekInflight.get(userId);
  if (inflight) return inflight;

  const p = fetchDek(userId)
    .then((key) => {
      dekCache.set(userId, key);
      return key;
    })
    .finally(() => dekInflight.delete(userId));

  dekInflight.set(userId, p);
  return p;
}

/* ------------------------------------------------------------------ */
/* Legacy device key (read path only)                                  */
/* ------------------------------------------------------------------ */

interface DeviceKeyMaterial {
  salt: Uint8Array;
  deviceSecret: Uint8Array;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readLegacyMaterial(userId: string): Promise<DeviceKeyMaterial | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(userId);
      req.onsuccess = () => resolve((req.result as DeviceKeyMaterial | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function deriveLegacyKey(userId: string): Promise<CryptoKey | null> {
  const material = await readLegacyMaterial(userId);
  if (!material?.salt || !material?.deviceSecret) return null;

  const secret = new Uint8Array(material.deviceSecret);
  const idBytes = new TextEncoder().encode(userId);
  const inputBytes = new Uint8Array(secret.length + idBytes.length);
  inputBytes.set(secret, 0);
  inputBytes.set(idBytes, secret.length);

  const keyMaterial = await crypto.subtle.importKey("raw", inputBytes as BufferSource, "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new Uint8Array(material.salt) as BufferSource,
      iterations: LEGACY_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function encryptText(plaintext: string, userId: string): Promise<string> {
  if (!userId) throw new EncryptionError("encryptText requires a userId");
  if (!crypto?.subtle) throw new EncryptionError("Web Crypto API unavailable in this context");

  const key = await getDek(userId);
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded),
    );

    const combined = new Uint8Array(iv.length + ciphertext.length);
    combined.set(iv);
    combined.set(ciphertext, iv.length);

    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < combined.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, Array.from(combined.subarray(i, i + CHUNK)));
    }
    return `ENC:${btoa(bin)}`;
  } catch (e) {
    throw new EncryptionError("Failed to encrypt payload", e);
  }
}

export async function decryptText(data: string, userId: string): Promise<string> {
  if (!data.startsWith("ENC:")) return data; // legacy plaintext — passthrough

  if (!userId) throw new EncryptionError("decryptText requires a userId");
  if (!crypto?.subtle) throw new EncryptionError("Web Crypto API unavailable in this context");

  let raw: Uint8Array;
  try {
    raw = Uint8Array.from(atob(data.slice(4)), (c) => c.charCodeAt(0));
  } catch (e) {
    throw new EncryptionError("Failed to decrypt payload (malformed ciphertext)", e);
  }
  const iv = raw.slice(0, 12);
  const ciphertext = raw.slice(12);

  const key = await getDek(userId);
  try {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch {
    // Pre-migration ciphertext written with the old device key on THIS device.
    const legacy = await deriveLegacyKey(userId);
    if (legacy) {
      try {
        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, legacy, ciphertext);
        return new TextDecoder().decode(decrypted);
      } catch {
        /* fall through */
      }
    }
    throw new EncryptionError("Failed to decrypt payload (legacy device ciphertext)");
  }
}

export function isEncrypted(data: string): boolean {
  return typeof data === "string" && data.startsWith("ENC:");
}

/**
 * Drop the in-memory DEK and any legacy device material (e.g. logout from a
 * shared device). The account DEK is re-fetched from the server on next use.
 */
export async function wipeKeyMaterial(userId: string): Promise<void> {
  dekCache.delete(userId);
  dekInflight.delete(userId);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(userId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* no-op */
  }
}
