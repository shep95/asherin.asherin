/**
 * Whole-device export and wipe. The export is every table in the local store
 * plus the list of connected providers (never the keys themselves).
 */
import { loadTable, tableNames, wipeLocalDb } from "./db";
import { listProviderKeys, wipeKeyVault } from "./keys";
import { getLocalUser } from "./auth";

export async function buildExportBundle(): Promise<Blob> {
  const names = await tableNames();
  const tables: Record<string, unknown[]> = {};
  for (const n of names) tables[n] = await loadTable(n);
  const bundle = {
    format: "asherin-local-export",
    version: 1,
    exported_at: new Date().toISOString(),
    device: getLocalUser().id,
    providers: (await listProviderKeys()).map((k) => k.provider),
    tables,
  };
  return new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
}

export async function wipeEverything(): Promise<void> {
  await wipeKeyVault().catch(() => undefined);
  await wipeLocalDb().catch(() => undefined);
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* private mode */
  }
  if ("caches" in window) {
    try {
      for (const k of await caches.keys()) await caches.delete(k);
    } catch {
      /* ignore */
    }
  }
}
