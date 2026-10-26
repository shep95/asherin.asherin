import { useCallback, useEffect, useState } from "react";
import {
  Plus, Loader2, Trash2, Star, ShieldCheck, AlertTriangle, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useGoogleApi } from "@/hooks/useGoogleApi";
import { useGoogleOAuthCallback } from "@/hooks/useGoogleOAuthCallback";

/**
 * google accounts inside settings → connections.
 *
 * local edition: the oauth exchange ran in the google-oauth edge function and
 * the device has no handler for it, so `connectGoogle` answers with the shim's
 * "kernel offline" error and the list is always empty. the oauth logic below
 * belongs to the asherin.google room and is left as is; only the copy and the
 * error wording are this room's.
 *
 * Design constraints that shaped this surface:
 *  - Connecting a *second* account only works if Google is told to show the
 *    account chooser, so every button here goes through the tiered auth URL
 *    (the server sends prompt="consent select_account").
 *  - Access is a ladder, not a switch: the user picks the smallest tier that
 *    unlocks what they want, and can raise it later without losing anything.
 *  - Nothing is destructive without an explicit second confirmation.
 */

const TIERS: Array<{ tier: number; label: string; grants: string[] }> = [
  {
    tier: 1,
    label: "Identity",
    grants: [
      "name, email, profile only.",
    ],
  },
  {
    tier: 2,
    label: "Read",
    grants: [
      "name, email, profile.",
      "mail, calendar, contacts, tasks and drive file list — read-only.",
    ],
  },
  {
    tier: 3,
    label: "Comprehension",
    grants: [
      "name, email, profile.",
      "mail, calendar, contacts, tasks and drive file list — read-only.",
      "activity, sleep and heart-rate signals for pattern analysis.",
    ],
  },
  {
    tier: 4,
    label: "Agency",
    grants: [
      "name, email, profile.",
      "mail, calendar, contacts, tasks and drive file list — read-only.",
      "activity, sleep and heart-rate signals for pattern analysis.",
      "draft into gmail drafts. never sends.",
    ],
  },
  {
    tier: 5,
    label: "Delegated Send",
    grants: [
      "name, email, profile.",
      "mail, calendar, contacts, tasks and drive file list — read-only.",
      "activity, sleep and heart-rate signals for pattern analysis.",
      "draft into gmail drafts.",
      "approve a specific draft for sending. one draft at a time.",
    ],
  },
];

const TIER_LABEL: Record<number, string> = {
  1: "Identity", 2: "Read", 3: "Comprehension", 4: "Agency", 5: "Delegated Send",
};

/** the shim's "no device handler" answer, in one sentence the operator can act on. */
const describe = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (/kernel offline|needs a server-side organ|LOCAL_ONLY/i.test(msg)) {
    return "the authorization exchange ran on a server asherin no longer has; no browser-only path is wired yet, so no account can be connected from this device.";
  }
  const m = msg.trim();
  if (!m) return "google did not answer.";
  return (m.length > 180 ? `${m.slice(0, 179)}…` : m).replace(/^./, (c) => c.toLowerCase());
};

const GoogleAccountsSettings = () => {
  const { accounts, fetchAccounts, connectGoogle, disconnectAccount, loading } = useGoogleApi();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [tier, setTier] = useState(3);
  const [err, setErr] = useState<string | null>(null);

  // Consent returns to /dashboard; this shares one exchange lock with every
  // other Google surface so the code is never spent twice.
  useGoogleOAuthCallback(useCallback(() => { void fetchAccounts(); }, [fetchAccounts]));

  useEffect(() => { void fetchAccounts(); }, [fetchAccounts]);

  const add = async () => {
    setBusy("add"); setErr(null);
    try { await connectGoogle(tier); }
    catch (e) { setErr(describe(e)); }
    finally { setBusy(null); }
  };

  const remove = async (id: string, email: string) => {
    setBusy(id);
    try {
      await disconnectAccount(id);
      toast.success(`disconnected ${email}.`);
      setConfirmId(null);
    } catch (e) { toast.error(describe(e)); }
    finally { setBusy(null); }
  };

  const live = accounts.filter((a) => a.status === "connected");

  return (
    <section className="rounded-2xl border border-border/30 bg-card/20 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-light tracking-wide text-foreground">google accounts</h3>
          <p className="text-xs font-extralight text-muted-foreground/70 mt-1 max-w-xl">
            the accounts asherin.google reads on request. on a device the authorization exchange has no
            server to run on yet, so connecting answers with a plain refusal rather than a chooser.
          </p>
        </div>
        <Button
          variant="ghost" size="sm"
          onClick={() => void fetchAccounts()}
          className="text-xs font-extralight shrink-0"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> refresh
        </Button>
      </div>

      {err && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-border/30 bg-card/20 px-3 py-2 text-xs font-extralight text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" /> <span className="min-w-0 break-words">{err}</span>
        </div>
      )}

      {/* Access ladder selector */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-extralight mb-2">
          access level for the next account
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {TIERS.map((t) => (
            <button
              key={t.tier}
              type="button"
              onClick={() => setTier(t.tier)}
              aria-pressed={tier === t.tier}
              className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${
                tier === t.tier
                  ? "border-foreground/30 bg-foreground/10"
                  : "border-border/20 bg-background/30 hover:border-border/40"
              }`}
            >
              <div className="text-xs font-light text-foreground">tier {t.tier} · {t.label.toLowerCase()}</div>
              <ul className="mt-1 space-y-0.5">
                {t.grants.map((g, i) => (
                  <li key={i} className="text-[10px] font-extralight text-muted-foreground/60">
                    {g}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      </div>

      <Button
        size="sm"
        className="text-xs font-extralight"
        disabled={busy === "add" || loading}
        onClick={() => void add()}
      >
        {busy === "add"
          ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          : <Plus className="h-3.5 w-3.5 mr-1.5" />}
        add a google account
      </Button>

      {/* Connected accounts */}
      {live.length === 0 ? (
        <p className="text-xs font-extralight text-muted-foreground/60">
          no google account is connected on this device.
        </p>
      ) : (
        <div className="space-y-2">
          {live.map((a) => (
            <div
              key={a.id}
              className="rounded-xl border border-border/20 bg-background/30 px-3 py-2.5 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex items-center gap-2.5">
                {a.avatar_url
                  ? <img src={a.avatar_url} alt="" width={28} height={28} loading="lazy" className="h-7 w-7 rounded-full object-cover shrink-0 grayscale" />
                  : <div className="h-7 w-7 rounded-full bg-foreground/10 shrink-0" aria-hidden />}
                <div className="min-w-0">
                  <div className="text-xs font-light text-foreground truncate flex items-center gap-1.5">
                    {a.google_email}
                    {a.is_primary && <Star className="h-3 w-3 text-foreground/50 shrink-0" aria-label="primary account" />}
                  </div>
                  <div className="text-[10px] font-extralight text-muted-foreground/60">
                    tier {a.consent_tier ?? 1} · {(TIER_LABEL[a.consent_tier ?? 1] ?? "Identity").toLowerCase()}
                    {a.last_sync_at ? ` · synced ${new Date(a.last_sync_at).toLocaleDateString()}` : ""}
                  </div>
                </div>
              </div>

              {confirmId === a.id ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm" variant="destructive" className="text-[11px] font-extralight h-7"
                    disabled={busy === a.id}
                    onClick={() => void remove(a.id, a.google_email)}
                  >
                    {busy === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "confirm"}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-[11px] font-extralight h-7" onClick={() => setConfirmId(null)}>
                    cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm" variant="ghost"
                  className="text-[11px] font-extralight h-7 shrink-0"
                  onClick={() => setConfirmId(a.id)}
                  aria-label={`disconnect ${a.google_email}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 text-[10px] font-extralight text-muted-foreground/50 leading-relaxed">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-px" />
        tokens, when there are any, are held on this device only. disconnecting removes them at once;
        nothing is ever sent without your explicit approval of a specific draft.
      </div>
    </section>
  );
};

export default GoogleAccountsSettings;
