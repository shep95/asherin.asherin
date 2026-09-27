import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Loader2, KeyRound } from "lucide-react";
import { unlockVault, vaultLockState } from "@/lib/local/keys";

/**
 * Step-up gate for dangerous actions (saving a provider key, wiping data).
 *
 * Local edition: when the key vault is passphrase-locked, the operator proves
 * they hold the passphrase; otherwise the device itself is the proof and the
 * action proceeds. Nothing is cached across actions.
 */
type StepUpFn = (purpose: string) => Promise<boolean>;

const StepUpContext = createContext<StepUpFn>(async () => true);

export const useStepUp = () => useContext(StepUpContext);

interface Pending {
  purpose: string;
  resolve: (ok: boolean) => void;
}

export const StepUpProvider = ({ children }: { children: ReactNode }) => {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = useCallback((ok: boolean) => {
    setPending((p) => {
      p?.resolve(ok);
      return null;
    });
    setValue("");
    setError(null);
    setBusy(false);
  }, []);

  const stepUp = useCallback<StepUpFn>(async (purpose) => {
    const state = await vaultLockState().catch(() => ({ mode: "device" as const, unlocked: true, keys: 0 }));
    if (state.mode !== "passphrase" || state.unlocked) return true;
    return new Promise<boolean>((resolve) => setPending({ purpose, resolve }));
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const ok = await unlockVault(value);
    if (ok) close(true);
    else {
      setBusy(false);
      setError("that passphrase did not open the vault.");
    }
  };

  return (
    <StepUpContext.Provider value={stepUp}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/80 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl border border-border/30 bg-background p-6 shadow-2xl">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-foreground/70" />
              <p className="text-sm font-light text-foreground">unlock your key vault</p>
            </div>
            <p className="mt-2 text-xs font-extralight text-muted-foreground">to {pending.purpose}, enter the vault passphrase for this device.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              className="mt-4 space-y-3"
            >
              <input
                type="password"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full rounded-lg border border-border/30 bg-background/60 px-3 py-2 text-sm font-light text-foreground outline-none focus:border-foreground/40"
                aria-label="vault passphrase"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => close(false)} className="rounded-lg px-3 py-2 text-xs font-light text-muted-foreground hover:text-foreground">
                  cancel
                </button>
                <button type="submit" disabled={busy || !value} className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-xs font-light text-background disabled:opacity-50">
                  {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                  unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </StepUpContext.Provider>
  );
};
