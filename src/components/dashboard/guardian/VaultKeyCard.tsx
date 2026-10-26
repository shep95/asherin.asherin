// guardian vault — the key vault card.
//
// the same four verbs settings → intelligence offers (lock, unlock, add a
// passphrase, remove it) plus change passphrase, which only lives here. every
// verb writes one line to the device trail; a passphrase is never written
// anywhere.

import { useState, type FormEvent } from "react";
import { KeyRound, Lock, Unlock, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { disablePassphrase, enablePassphrase, lockVault, unlockVault } from "@/lib/local/keys";
import { changePassphrase, describeLock, recordTrail, type VaultFacts } from "@/lib/guardian/deviceSecurity";

type Form = "none" | "add" | "remove" | "change";

const inputClass =
  "w-full rounded-lg border border-border/30 bg-background/60 px-3 py-2 text-xs font-light text-foreground placeholder:text-muted-foreground/30 outline-none focus-visible:ring-2 focus-visible:ring-ring";
const primaryClass =
  "rounded-lg bg-foreground px-3 py-2 text-[11px] font-light text-background disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const quietClass =
  "rounded-lg border border-border/30 px-3 py-2 text-[11px] font-light text-muted-foreground hover:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const VaultKeyCard = ({ facts, onChanged }: { facts: VaultFacts; onChanged: () => void }) => {
  const { toast } = useToast();
  const [form, setForm] = useState<Form>("none");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [c, setC] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setA(""); setB(""); setC(""); setError(null); setForm("none"); };

  const run = async (fn: () => Promise<void>, done: string, trail: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await recordTrail(trail, "key_vault");
      toast({ title: done });
      reset();
    } catch (e) {
      setError((e as Error).message || "that did not work.");
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const unlock = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!(await unlockVault(a))) {
        void recordTrail("vault_unlock_failed", "key_vault");
        throw new Error("that passphrase did not open the vault.");
      }
    }, "vault unlocked", "vault_unlocked");
  };

  const lock = () => {
    lockVault();
    void recordTrail("vault_locked", "key_vault");
    toast({ title: "vault locked" });
    onChanged();
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (a !== b) { setError("the two passphrases differ."); return; }
    void run(() => enablePassphrase(a), "passphrase lock on", "passphrase_enabled");
  };

  const remove = (e: FormEvent) => {
    e.preventDefault();
    void run(() => disablePassphrase(a), "passphrase lock removed", "passphrase_disabled");
  };

  const change = (e: FormEvent) => {
    e.preventDefault();
    if (b !== c) { setError("the two new passphrases differ."); return; }
    void run(() => changePassphrase(a, b), "passphrase changed", "passphrase_changed");
  };

  const Icon = facts.mode === "passphrase" ? (facts.unlocked ? Unlock : Lock) : ShieldCheck;

  return (
    <section aria-labelledby="gv-vault-heading" className="rounded-xl border border-border/20 bg-card/10 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <Icon className="h-4 w-4 mt-0.5 text-foreground/70 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="gv-vault-heading" className="text-xs font-light text-foreground">key vault · this device</h2>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
              {facts.keys.length} {facts.keys.length === 1 ? "key" : "keys"} held · {describeLock(facts)}
            </p>
          </div>
        </div>
        {facts.mode === "passphrase" && facts.unlocked && (
          <button type="button" onClick={lock} className={quietClass}>lock now</button>
        )}
      </div>

      {facts.mode === "passphrase" && !facts.unlocked && (
        <form onSubmit={unlock} className="flex gap-2">
          <input type="password" value={a} onChange={(e) => setA(e.target.value)} placeholder="passphrase" aria-label="passphrase" autoComplete="current-password" className={inputClass} />
          <button disabled={busy || !a} className={primaryClass}>unlock</button>
        </form>
      )}

      {facts.mode === "device" && form === "none" && (
        <button type="button" onClick={() => setForm("add")} className="inline-flex items-center gap-1.5 text-[11px] font-light text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
          <KeyRound className="h-3 w-3" aria-hidden="true" /> add a passphrase lock
        </button>
      )}

      {facts.mode === "device" && form === "add" && (
        <form onSubmit={add} className="space-y-2">
          <input type="password" value={a} onChange={(e) => setA(e.target.value)} placeholder="new passphrase (8+ characters)" aria-label="new passphrase" autoComplete="new-password" className={inputClass} />
          <input type="password" value={b} onChange={(e) => setB(e.target.value)} placeholder="repeat it" aria-label="repeat new passphrase" autoComplete="new-password" className={inputClass} />
          <p className="text-[10px] font-extralight text-muted-foreground/60">
            there is no recovery. lose the passphrase and the saved keys are gone; you would add them again.
          </p>
          <div className="flex gap-2">
            <button disabled={busy || a.length < 8} className={primaryClass}>turn on</button>
            <button type="button" onClick={reset} className={quietClass}>cancel</button>
          </div>
        </form>
      )}

      {facts.mode === "passphrase" && facts.unlocked && form === "none" && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setForm("change")} className={quietClass}>change passphrase</button>
          <button type="button" onClick={() => setForm("remove")} className={quietClass}>remove lock</button>
        </div>
      )}

      {facts.mode === "passphrase" && facts.unlocked && form === "change" && (
        <form onSubmit={change} className="space-y-2">
          <input type="password" value={a} onChange={(e) => setA(e.target.value)} placeholder="current passphrase" aria-label="current passphrase" autoComplete="current-password" className={inputClass} />
          <input type="password" value={b} onChange={(e) => setB(e.target.value)} placeholder="new passphrase (8+ characters)" aria-label="new passphrase" autoComplete="new-password" className={inputClass} />
          <input type="password" value={c} onChange={(e) => setC(e.target.value)} placeholder="repeat the new one" aria-label="repeat new passphrase" autoComplete="new-password" className={inputClass} />
          <p className="text-[10px] font-extralight text-muted-foreground/60">
            every saved key is re-sealed under the new passphrase on this device. nothing is sent anywhere.
          </p>
          <div className="flex gap-2">
            <button disabled={busy || !a || b.length < 8} className={primaryClass}>change</button>
            <button type="button" onClick={reset} className={quietClass}>cancel</button>
          </div>
        </form>
      )}

      {facts.mode === "passphrase" && facts.unlocked && form === "remove" && (
        <form onSubmit={remove} className="space-y-2">
          <input type="password" value={a} onChange={(e) => setA(e.target.value)} placeholder="passphrase, to remove the lock" aria-label="passphrase to remove the lock" autoComplete="current-password" className={inputClass} />
          <div className="flex gap-2">
            <button disabled={busy || !a} className={primaryClass}>remove lock</button>
            <button type="button" onClick={reset} className={quietClass}>cancel</button>
          </div>
        </form>
      )}

      {error && <p role="alert" className="text-[11px] text-destructive">{error}</p>}
    </section>
  );
};

export default VaultKeyCard;
