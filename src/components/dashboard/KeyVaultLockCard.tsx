import { useEffect, useState } from "react";
import { KeyRound, Lock, Unlock, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  VAULT_EVENT,
  disablePassphrase,
  enablePassphrase,
  lockVault,
  unlockVault,
  vaultLockState,
} from "@/lib/local/keys";

/**
 * Where the operator decides how their keys are held on this device.
 *
 * device mode: keys are ciphertext under a non-extractable webcrypto key that
 * never leaves the browser. passphrase mode: the vault key itself only exists
 * wrapped under a passphrase-derived key, so nothing on disk can open a key
 * until the operator unlocks it for the session.
 */
export default function KeyVaultLockCard() {
  const { toast } = useToast();
  const [state, setState] = useState<{ mode: "device" | "passphrase"; unlocked: boolean; keys: number } | null>(null);
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const refresh = () => vaultLockState().then(setState).catch(() => setState({ mode: "device", unlocked: true, keys: 0 }));

  useEffect(() => {
    void refresh();
    window.addEventListener(VAULT_EVENT, refresh);
    return () => window.removeEventListener(VAULT_EVENT, refresh);
  }, []);

  if (!state) return null;

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ title: done });
      setPass("");
      setConfirm("");
      setEditing(false);
    } catch (e) {
      toast({ title: "vault", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const input = (v: string, set: (s: string) => void, label: string) => (
    <input
      type="password"
      value={v}
      onChange={(e) => set(e.target.value)}
      placeholder={label}
      aria-label={label}
      className="w-full rounded-md border border-border/30 bg-background/60 px-3 py-2 text-xs font-light text-foreground outline-none focus:border-foreground/40"
    />
  );

  return (
    <div className="rounded-lg border border-border/15 bg-card/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {state.mode === "passphrase" ? (
            state.unlocked ? <Unlock className="h-4 w-4 text-signal" /> : <Lock className="h-4 w-4 text-foreground/70" />
          ) : (
            <ShieldCheck className="h-4 w-4 text-signal" />
          )}
          <div>
            <p className="text-xs font-light text-foreground">key vault · this device</p>
            <p className="text-[10px] text-muted-foreground/60">
              {state.keys} {state.keys === 1 ? "key" : "keys"} held ·{" "}
              {state.mode === "passphrase"
                ? state.unlocked
                  ? "passphrase lock, unlocked for this session"
                  : "passphrase lock, locked"
                : "encrypted under a device key that cannot be exported"}
            </p>
          </div>
        </div>
        {state.mode === "passphrase" && state.unlocked && (
          <button
            onClick={() => {
              lockVault();
              toast({ title: "vault locked" });
            }}
            className="text-[10px] font-light tracking-[0.18em] uppercase text-muted-foreground hover:text-foreground"
          >
            lock now
          </button>
        )}
      </div>

      {state.mode === "passphrase" && !state.unlocked && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              if (!(await unlockVault(pass))) throw new Error("that passphrase did not open the vault.");
            }, "vault unlocked");
          }}
        >
          {input(pass, setPass, "passphrase")}
          <button disabled={busy || !pass} className="rounded-md bg-foreground px-3 py-2 text-[10px] font-light uppercase tracking-[0.18em] text-background disabled:opacity-50">
            unlock
          </button>
        </form>
      )}

      {state.mode === "device" && !editing && (
        <button onClick={() => setEditing(true)} className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-light tracking-[0.18em] uppercase text-muted-foreground hover:text-foreground">
          <KeyRound className="h-3 w-3" /> add a passphrase lock
        </button>
      )}

      {state.mode === "device" && editing && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (pass !== confirm) {
              toast({ title: "vault", description: "the two passphrases differ.", variant: "destructive" });
              return;
            }
            void run(() => enablePassphrase(pass), "passphrase lock on");
          }}
        >
          {input(pass, setPass, "new passphrase (8+ characters)")}
          {input(confirm, setConfirm, "repeat it")}
          <p className="text-[10px] font-extralight text-muted-foreground/60">
            there is no recovery. lose the passphrase and the saved keys are gone; you would add them again.
          </p>
          <div className="flex gap-2">
            <button disabled={busy || pass.length < 8} className="rounded-md bg-foreground px-3 py-2 text-[10px] font-light uppercase tracking-[0.18em] text-background disabled:opacity-50">
              turn on
            </button>
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-2 text-[10px] font-light uppercase tracking-[0.18em] text-muted-foreground">
              cancel
            </button>
          </div>
        </form>
      )}

      {state.mode === "passphrase" && state.unlocked && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => disablePassphrase(pass), "passphrase lock off");
          }}
        >
          {input(pass, setPass, "passphrase, to remove the lock")}
          <button disabled={busy || !pass} className="rounded-md border border-border/30 px-3 py-2 text-[10px] font-light uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground disabled:opacity-50">
            remove lock
          </button>
        </form>
      )}
    </div>
  );
}
