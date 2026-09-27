// ═══════════════════════════════════════════════════════════════════════════
// Local device vault — IndexedDB persistence for contact intelligence.
//
// The intelligence the operator builds must survive a refresh, a dropped
// connection, and a Google rate-limit. It lives on the device, keyed per
// authenticated user so two accounts on one machine never read each other's
// dossiers. Nothing here leaves the browser.
//
// IndexedDB is used rather than localStorage because a full roster with
// per-contact histograms exceeds the ~5 MB string quota and because the
// synchronous localStorage API blocks the main thread on write.
// ═══════════════════════════════════════════════════════════════════════════

import type { ContactDossier, IntelSummary, RawMessage } from "./messageIntel";

const DB_NAME = "asherin_contact_vault";
// v2 adds the raw-corpus store. Before it existed the vault held only derived
// dossiers, so every sweep had to re-fetch the whole window from Gmail and
// overwrite the ledger — nothing accumulated across sessions.
const DB_VERSION = 2;
const STORE = "snapshots";
const CORPUS = "corpus";

/**
 * Ceiling on retained messages. Metadata rows run ~350-500 bytes each, so this
 * bounds the device footprint at roughly 3 MB while still holding years of
 * correspondence for a normal mailbox. The oldest rows are shed first.
 */
const CORPUS_CAP = 6000;

export interface VaultSnapshot {
  /** `${userId}` — one live snapshot per user, overwritten on each sweep. */
  id: string;
  savedAt: number;
  summary: IntelSummary;
  dossiers: ContactDossier[];
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let settled = false;
    const done = (v: IDBDatabase | null) => { if (!settled) { settled = true; resolve(v); } };
    // Private-mode Safari and some hardened browsers stall the open request
    // forever instead of erroring. Cap the wait so the UI never hangs on it.
    const timer = setTimeout(() => done(null), 4000);
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        // Additive only: an existing v1 vault keeps its snapshots untouched and
        // simply gains the corpus store alongside them.
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
        if (!db.objectStoreNames.contains(CORPUS)) db.createObjectStore(CORPUS, { keyPath: "id" });
      };
      req.onsuccess = () => { clearTimeout(timer); done(req.result); };
      req.onerror = () => { clearTimeout(timer); done(null); };
      req.onblocked = () => { clearTimeout(timer); done(null); };
    } catch {
      clearTimeout(timer);
      done(null);
    }
  });
  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  storeName: string = STORE,
): Promise<T | null> {
  return openDb().then((db) => {
    if (!db) return null;
    if (!db.objectStoreNames.contains(storeName)) return null;
    return new Promise<T | null>((resolve) => {
      try {
        const t = db.transaction(storeName, mode);
        const req = run(t.objectStore(storeName));
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
        t.onabort = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  });
}

/** Persist the latest sweep. Failures are non-fatal — the UI still has state. */
export async function saveVault(userId: string, summary: IntelSummary, dossiers: ContactDossier[]): Promise<boolean> {
  if (!userId) return false;
  const snapshot: VaultSnapshot = { id: userId, savedAt: Date.now(), summary, dossiers };
  const res = await tx("readwrite", (s) => s.put(snapshot) as IDBRequest<any>);
  return res !== null;
}

export async function loadVault(userId: string): Promise<VaultSnapshot | null> {
  if (!userId) return null;
  const res = await tx<VaultSnapshot>("readonly", (s) => s.get(userId) as IDBRequest<VaultSnapshot>);
  return res ?? null;
}

export async function clearVault(userId: string): Promise<void> {
  if (!userId) return;
  await tx("readwrite", (s) => s.delete(userId) as IDBRequest<any>);
  await tx("readwrite", (s) => s.delete(userId) as IDBRequest<any>, CORPUS);
}

// ═══════════════════════════════════════════════════════════════════════════
// Raw corpus — the accumulating source of truth.
//
// Dossiers are a projection; the corpus is the record. Persisting only the
// projection meant each sweep rebuilt the world from whatever 100-message
// keyhole Gmail happened to return, and anything that had scrolled out of that
// window was gone for good. The corpus fixes that: messages are merged in on
// their Google-issued id and never replaced wholesale, so coverage only ever
// grows, and the stored cursor lets the next sweep ask Gmail for the delta
// instead of re-downloading history it already holds.
// ═══════════════════════════════════════════════════════════════════════════

export interface CorpusRecord {
  id: string;
  messages: RawMessage[];
  /** Epoch ms of the last fully successful harvest. null = never swept. */
  cursor: number | null;
  updatedAt: number;
  /** Total messages shed to stay under the cap, cumulative. */
  evicted: number;
}

const tsOf = (m: RawMessage): number => {
  if (typeof m.internalDate === "number" && Number.isFinite(m.internalDate)) return m.internalDate;
  const parsed = Date.parse(m.date || "");
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Folds a harvest into the retained corpus.
 *
 * Dedupe is on the Gmail message id, which is stable for the life of the
 * message — never on a timestamp or an array position, either of which would
 * mint a fresh row on every sweep. The incoming copy wins on collision because
 * it carries the newer mutable state (read flags, labels).
 */
export function mergeCorpus(
  prev: RawMessage[],
  incoming: RawMessage[],
  cap: number = CORPUS_CAP,
): { messages: RawMessage[]; added: number; evicted: number } {
  const byId = new Map<string, RawMessage>();
  for (const m of prev) if (m?.id) byId.set(m.id, m);
  let added = 0;
  for (const m of incoming) {
    if (!m?.id) continue;
    if (!byId.has(m.id)) added += 1;
    byId.set(m.id, m);
  }
  const all = [...byId.values()].sort((a, b) => tsOf(b) - tsOf(a));
  const evicted = Math.max(0, all.length - cap);
  return { messages: evicted ? all.slice(0, cap) : all, added, evicted };
}

export async function loadCorpus(userId: string): Promise<CorpusRecord | null> {
  if (!userId) return null;
  const res = await tx<CorpusRecord>("readonly", (s) => s.get(userId) as IDBRequest<CorpusRecord>, CORPUS);
  if (!res) return null;
  // Defend against a partially-written record from an interrupted transaction.
  return { ...res, messages: Array.isArray(res.messages) ? res.messages : [] };
}

export async function saveCorpus(
  userId: string,
  messages: RawMessage[],
  cursor: number | null,
  evicted: number,
): Promise<boolean> {
  if (!userId) return false;
  const rec: CorpusRecord = { id: userId, messages, cursor, updatedAt: Date.now(), evicted };
  const res = await tx("readwrite", (s) => s.put(rec) as IDBRequest<any>, CORPUS);
  return res !== null;
}

/** Approximate on-device footprint of the snapshot, in bytes. */
export function vaultBytes(snapshot: VaultSnapshot | null): number {
  if (!snapshot) return 0;
  try { return new Blob([JSON.stringify(snapshot)]).size; } catch { return 0; }
}

/** Branded plaintext export — House of Asher intelligence report format. */
export function exportVaultText(snapshot: VaultSnapshot): string {
  const { summary, dossiers } = snapshot;
  const L: string[] = [];
  const rule = "═".repeat(72);
  const stamp = new Date(snapshot.savedAt).toISOString();

  L.push(rule);
  L.push("CONTACT INTELLIGENCE — DEEP DOSSIER LEDGER");
  L.push("#houseofasher  #zia");
  L.push(rule);
  L.push(`Generated ...... ${stamp}`);
  L.push(`Identities ..... ${summary.contactCount} (${summary.correspondentCount} with traffic)`);
  L.push(`Messages ....... ${summary.messageCount} analyzed, ${summary.bulkFiltered} bulk excluded from language profiling`);
  L.push(`Accounts ....... ${summary.ownAddresses.join(", ") || "—"}`);
  L.push(`Tiers .......... inner ${summary.tiers.inner} · active ${summary.tiers.active} · periphery ${summary.tiers.periphery} · dormant ${summary.tiers.dormant} · archive ${summary.tiers.archive}`);
  L.push("");
  L.push("SOURCE: Google People API address-book records and Gmail message");
  L.push("metadata (From/To/Cc/Subject/Date/snippet). No modelled or inferred");
  L.push("values appear in this report. Absent evidence is printed as '—'.");
  L.push("");

  const c = summary.psych.composites;
  L.push("── OPERATOR LANGUAGE BASELINE " + "─".repeat(43));
  L.push(`Evidence ....... ${summary.psych.evidence} (${summary.psych.tokens} lexical tokens)`);
  L.push(`Warmth ......... ${c.warmth ?? "—"}   Assertiveness .. ${c.assertiveness ?? "—"}`);
  L.push(`Formality ...... ${c.formalityIndex ?? "—"}   Stress load .... ${c.stressLoad ?? "—"}`);
  L.push(`Peak hour ...... ${summary.patterns.peakHour ?? "—"}:00   After hours .... ${Math.round(summary.patterns.afterHoursShare * 100)}%`);
  L.push("");

  for (const d of dossiers) {
    L.push("─".repeat(72));
    L.push(`${d.name}   [${d.tier.toUpperCase()} · ${d.importance}/100]`);
    if (d.jobTitle || d.organization) L.push(`  Role ......... ${[d.jobTitle, d.organization].filter(Boolean).join(" @ ")}`);
    if (d.emails.length) L.push(`  Email ........ ${d.emails.join(", ")}`);
    if (d.phones.length) L.push(`  Phone ........ ${d.phones.join(", ")}`);
    if (d.location) L.push(`  Location ..... ${d.location}`);
    if (d.birthday) L.push(`  Birthday ..... ${d.birthday}`);
    if (d.urls.length) L.push(`  Links ........ ${d.urls.join(", ")}`);
    L.push(`  Channels ..... ${d.channels.join(", ") || "—"}`);
    L.push(`  Traffic ...... ${d.total} msgs (${d.inbound} in / ${d.outbound} out) across ${d.threads} threads`);
    L.push(`  Rhythm ....... cadence ${d.cadenceDays ?? "—"}d · silent ${d.silenceDays ?? "—"}d · drift ${d.driftRatio ?? "—"}×`);
    L.push(`  Latency ...... you ${d.myReplyLatencyHours ?? "—"}h · them ${d.theirReplyLatencyHours ?? "—"}h`);
    if (d.psych.evidence !== "none") {
      const p = d.psych.composites;
      L.push(`  Language ..... warmth ${p.warmth ?? "—"} · assert ${p.assertiveness ?? "—"} · formal ${p.formalityIndex ?? "—"} · stress ${p.stressLoad ?? "—"} (${d.psych.evidence})`);
    }
    if (d.patterns.topSubjectTokens.length)
      L.push(`  Themes ....... ${d.patterns.topSubjectTokens.map((t) => `${t.token}(${t.count})`).join(", ")}`);
    for (const s of d.signals) L.push(`  • ${s.label}`);
  }

  L.push("");
  L.push(rule);
  L.push("END OF LEDGER · #houseofasher #zia");
  L.push(rule);
  return L.join("\n");
}

export function downloadText(filename: string, body: string) {
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next frame so Safari has committed the navigation first.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
