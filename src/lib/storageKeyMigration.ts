/**
 * One-time localStorage namespace migration: `asherin_*` → `aureon_*`.
 *
 * The rename shipped without a migration, so returning users read empty values
 * for keys their browser still holds — custom personas, the active
 * conversation, brain/persona selection, wallpaper and sidebar layout all
 * appeared wiped. The old values are still sitting in the origin's storage;
 * this copies them across on boot, before React mounts and before any consumer
 * reads a key.
 *
 * Rules:
 *  - never overwrite an existing `aureon_*` value (post-rename data wins),
 *  - the old key is left in place, so a rollback still finds its data,
 *  - a completion sentinel keeps this O(n) pass to a single run per browser.
 */
const OLD_PREFIX = "asherin_";
const NEW_PREFIX = "aureon_";
const SENTINEL = "aureon_storage_migrated_v1";

export function migrateLegacyStorageKeys(): void {
  let store: Storage;
  try {
    store = window.localStorage;
    if (store.getItem(SENTINEL) === "1") return;
  } catch {
    // Private mode / storage disabled — nothing to migrate.
    return;
  }

  try {
    // Snapshot the key list first: writing while iterating `key(i)` is
    // implementation-defined and can skip entries.
    const legacyKeys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith(OLD_PREFIX)) legacyKeys.push(k);
    }

    for (const oldKey of legacyKeys) {
      const newKey = NEW_PREFIX + oldKey.slice(OLD_PREFIX.length);
      if (store.getItem(newKey) !== null) continue;
      const value = store.getItem(oldKey);
      if (value === null) continue;
      try {
        store.setItem(newKey, value);
      } catch {
        // Quota exhausted — stop rather than half-migrate loudly.
        return;
      }
    }

    store.setItem(SENTINEL, "1");
  } catch {
    /* storage races are non-fatal; the app still boots with defaults */
  }
}
