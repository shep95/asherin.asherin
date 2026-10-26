import { useEffect } from "react";
import { X, Globe, AlertTriangle } from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";
import { toast } from "sonner";
import { BROWSER_PATH_NEEDS, NO_ACCOUNT_PATH, describeFailure } from "./offline";

/**
 * the connection card on the station overview.
 *
 * it used to carry "add account" and "connect google account" buttons, a live
 * sync badge, a cross-account toggle nothing read, and a note about tokens
 * encrypted at rest. on this device none of those had anything behind them:
 * the oauth exchange ran on an edge function that no longer exists, so the
 * buttons failed, the badge reported a channel to nowhere, and no token has
 * ever been stored. the card now states the gap and what would close it.
 */
const MultiAccountManager = () => {
  const { accounts, fetchAccounts, disconnectAccount } = useGoogleApi();

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  const handleDisconnect = async (id: string) => {
    try {
      await disconnectAccount(id);
      toast.success("account disconnected");
    } catch (err) {
      toast.error(describeFailure(err, "google account organ"));
    }
  };

  return (
    <section className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-5 space-y-4" aria-labelledby="google-connection">
      <h3 id="google-connection" className="flex items-center gap-2 text-sm font-light tracking-wide text-foreground">
        <Globe className="h-4 w-4" aria-hidden /> google accounts
      </h3>

      {accounts.length === 0 ? (
        <div className="space-y-3 rounded-xl border border-dashed border-border/20 bg-foreground/5 p-4">
          <p className="flex items-start gap-2 text-xs font-light leading-relaxed text-foreground/85">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/60" aria-hidden />
            <span>{NO_ACCOUNT_PATH}</span>
          </p>
          <p className="text-[11px] font-extralight leading-relaxed text-muted-foreground">
            every desk in this room therefore reads nothing. a browser-only path would need:
          </p>
          <ul className="space-y-1 pl-4 text-[11px] font-extralight leading-relaxed text-muted-foreground list-disc">
            {BROWSER_PATH_NEEDS.map((need) => (
              <li key={need}>{need}</li>
            ))}
          </ul>
          <p className="text-[11px] font-extralight leading-relaxed text-muted-foreground/70">
            until then there is no button here, because a button that fails quietly is worse than none.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex items-center gap-3 rounded-xl border border-border/20 bg-foreground/5 px-4 py-3"
            >
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-foreground/10 flex items-center justify-center text-xs font-light text-foreground">
                {account.avatar_url ? (
                  <img src={account.avatar_url} alt="" className="h-full w-full rounded-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  account.google_email?.charAt(0)?.toLowerCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-light text-foreground">{account.google_email}</span>
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      account.status === "connected" ? "bg-emerald-500" : account.status === "expired" ? "bg-red-400" : "bg-amber-500/60"
                    }`}
                    aria-label={`status ${account.status}`}
                  />
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground/50">
                  <span>{account.display_name || "—"}</span>
                  <span>scopes {account.scopes?.length || "—"}</span>
                  <span>last read {account.last_sync_at ? new Date(account.last_sync_at).toLocaleDateString() : "never"}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDisconnect(account.id)}
                aria-label={`disconnect ${account.google_email}`}
                className="p-1 text-muted-foreground/30 transition-colors hover:text-red-400 focus-visible:outline focus-visible:outline-1 focus-visible:outline-foreground/40"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default MultiAccountManager;
