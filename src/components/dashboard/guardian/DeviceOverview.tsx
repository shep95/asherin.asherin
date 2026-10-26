// guardian vault — overview. four facts read from real modules, the vault
// card, the keys this device holds (names and dates only), what is ciphertext
// at rest, what to do next, and the last few lines of the device trail.

import { Lock, Unlock, ShieldCheck, KeyRound, Database, Fingerprint, ChevronRight, AlertTriangle, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  providerName, recommend, trailLabel,
  type EncryptionFacts, type TrailEntry, type VaultFacts,
} from "@/lib/guardian/deviceSecurity";

interface Props {
  vault: VaultFacts;
  /** set when the key vault could not be read: vault tiles then say so instead of showing defaults. */
  vaultError: string | null;
  encryption: EncryptionFacts;
  trail: TrailEntry[];
  deviceId: string;
  deviceCreated: string | null;
  onShowTrail: () => void;
  children: React.ReactNode;
}

const since = (iso: string | null | undefined): string => {
  if (!iso) return "unknown";
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) || t.getTime() === 0 ? "unknown" : formatDistanceToNow(t, { addSuffix: true });
};

const openSettings = () => {
  try { sessionStorage.setItem("asherin:settings-tab", "privacy"); } catch { /* the first tab then */ }
  window.dispatchEvent(new CustomEvent("aureon:navigate", { detail: "settings" }));
};

const DeviceOverview = ({ vault, vaultError, encryption, trail, deviceId, deviceCreated, onShowTrail, children }: Props) => {
  const plain = Math.max(0, encryption.messagesTotal - encryption.messagesEncrypted);
  const LockIcon = vault.mode === "passphrase" ? (vault.unlocked ? Unlock : Lock) : ShieldCheck;
  const unreadable = vaultError !== null;
  const tiles = [
    {
      label: "key vault",
      value: unreadable ? "—" : vault.mode === "passphrase" ? (vault.unlocked ? "unlocked" : "locked") : "device key",
      note: unreadable ? "could not be read" : vault.mode === "passphrase" ? "passphrase mode" : "no passphrase",
      icon: LockIcon,
      alert: unreadable || (vault.mode === "device" && vault.keys.length > 0),
    },
    {
      label: "provider keys",
      value: unreadable ? "—" : String(vault.keys.length),
      note: unreadable ? "could not be read" : vault.keys.length === 0 ? "none stored" : `${vault.keys.filter((k) => k.is_active).length} active`,
      icon: KeyRound,
      alert: unreadable,
    },
    {
      label: "chat sealed",
      value: encryption.messagesTotal === 0 ? "—" : `${encryption.messagesEncrypted}/${encryption.messagesTotal}`,
      note: encryption.messagesTotal === 0 ? "no messages yet" : plain > 0 ? `${plain} plain` : "every message",
      icon: Database,
      alert: plain > 0,
    },
    {
      label: "this device",
      value: deviceId.slice(0, 8),
      note: `identity minted ${since(deviceCreated)}`,
      icon: Fingerprint,
      alert: false,
    },
  ];
  const recs = unreadable ? [] : recommend(vault, encryption);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-4 space-y-1.5">
            <div className="flex items-center gap-2">
              <t.icon className={`h-4 w-4 ${t.alert ? "text-amber-400" : "text-muted-foreground/50"}`} aria-hidden="true" />
              <span className="text-[10px] font-light tracking-wider text-muted-foreground/60">{t.label}</span>
            </div>
            <p className={`text-lg font-extralight tabular-nums ${t.alert ? "text-amber-400" : "text-foreground"}`}>{t.value}</p>
            <p className="text-[10px] text-muted-foreground/40">{t.note}</p>
          </div>
        ))}
      </div>

      {children}

      <section aria-labelledby="gv-keys-heading" className="space-y-2">
        <h2 id="gv-keys-heading" className="text-xs font-light tracking-wider text-muted-foreground/60">provider keys on this device</h2>
        {unreadable ? (
          <p className="text-[11px] text-muted-foreground/40 px-1">the key vault could not be read, so nothing is listed.</p>
        ) : vault.keys.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/40 px-1">
            none stored. keys are added in settings → intelligence and are encrypted here before they are written.
          </p>
        ) : (
          <ul className="space-y-1">
            {vault.keys.map((k) => (
              <li key={k.provider} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-card/10">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" aria-hidden="true" />
                <span className="flex-1 text-[11px] font-light text-foreground/90 truncate">{providerName(k.provider)}</span>
                <span className="text-[10px] text-muted-foreground/50">{k.is_active ? "active" : "paused"}</span>
                <span className="text-[10px] text-muted-foreground/40 whitespace-nowrap">{k.last_used_at ? `used ${since(k.last_used_at)}` : `saved ${since(k.updated_at)}`}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] text-muted-foreground/35 px-1">
          the secret itself is never shown here or anywhere. it leaves this device only inside a request to that provider. when it was last used is not recorded.
        </p>
      </section>

      <section aria-labelledby="gv-rest-heading" className="space-y-2">
        <h2 id="gv-rest-heading" className="text-xs font-light tracking-wider text-muted-foreground/60">at rest on this device</h2>
        <ul className="space-y-1 text-[11px] font-light">
          {([
            [`provider keys · ${unreadable ? "?" : vault.keys.length}`, `aes-256-gcm under the vault key (${vault.mode === "passphrase" ? "wrapped by your passphrase, pbkdf2 310k rounds" : "device key, non-extractable"})`],
            [`vault items · ${encryption.vaultItems}`, "aes-256-gcm under the device data key; the row holds a label, a kind and ciphertext"],
            [`chat messages · ${encryption.messagesEncrypted} of ${encryption.messagesTotal}`, `aes-256-gcm under the device data key${plain > 0 ? ` · ${plain} older rows are plain text` : ""}`],
            ["whiteboards", encryption.whiteboardSealed === null ? "none saved" : encryption.whiteboardSealed ? "sealed under the device data key, in localstorage" : "a saved board is not sealed"],
            ["everything else", "library, projects, memory, notebooks and settings are plain rows in this browser's indexeddb. the browser profile is the boundary."],
          ] as [string, string][]).map(([what, how]) => (
            <li key={what} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 rounded-lg px-3 py-2 bg-card/10">
              <span className="sm:flex-1 text-foreground/90">{what}</span>
              <span className="text-muted-foreground/50 sm:text-right sm:max-w-[60%]">{how}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="gv-recs-heading" className="space-y-2">
        <h2 id="gv-recs-heading" className="text-xs font-light tracking-wider text-muted-foreground/60">what to do next</h2>
        {unreadable && <p className="text-[11px] text-muted-foreground/40 px-1">nothing can be recommended until the key vault reads.</p>}
        <div className="space-y-1.5">
          {recs.map((r) => (
            <div
              key={r.id}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
                r.tone === "amber" ? "border-amber-500/20 bg-amber-500/5" : r.tone === "good" ? "border-emerald-500/20 bg-emerald-500/5" : "border-border/20 bg-card/10"
              }`}
            >
              {r.tone === "amber"
                ? <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                : <ShieldCheck className={`h-4 w-4 shrink-0 mt-0.5 ${r.tone === "good" ? "text-emerald-400" : "text-muted-foreground/50"}`} aria-hidden="true" />}
              <div className="min-w-0">
                <p className="text-xs font-light text-foreground">{r.title}</p>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">{r.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="gv-recent-heading" className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 id="gv-recent-heading" className="text-xs font-light tracking-wider text-muted-foreground/60">recent on this device</h2>
          <button type="button" onClick={onShowTrail} className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
            full trail
          </button>
        </div>
        {trail.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/40 px-1">nothing recorded yet. locking, unlocking and vault edits are written here.</p>
        ) : (
          <ul className="space-y-1">
            {trail.slice(0, 5).map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-card/10">
                <span className="flex-1 text-[11px] font-light text-foreground/80 truncate">{trailLabel(e)}</span>
                <span className="text-[10px] text-muted-foreground/40 whitespace-nowrap">{since(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="gv-wipe-heading" className="space-y-2">
        <h2 id="gv-wipe-heading" className="text-xs font-light tracking-wider text-muted-foreground/60">leaving this device</h2>
        <button
          type="button"
          onClick={openSettings}
          className="w-full flex items-center gap-3 rounded-xl border border-border/20 bg-card/10 px-4 py-3 text-left transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Trash2 className="h-4 w-4 text-muted-foreground/50 shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-light text-foreground">wipe this device</span>
            <span className="block text-[10px] text-muted-foreground/50 mt-0.5">lives in settings → privacy. it removes every key, every row and every cached file; the export sits beside it.</span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground/30" aria-hidden="true" />
        </button>
      </section>
    </div>
  );
};

export default DeviceOverview;
