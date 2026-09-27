import { useCallback, useEffect, useState } from "react";
import {
  Plus, Loader2, Trash2, Star, ShieldCheck, AlertTriangle, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useGoogleApi } from "@/hooks/useGoogleApi";
import { useGoogleOAuthCallback } from "@/hooks/useGoogleOAuthCallback";

/**
 * CLOUD INTELLIGENCE — multi-account Google management inside Settings.
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
      "Name, email, profile only.",
    ],
  },
  {
    tier: 2,
    label: "Read",
    grants: [
      "Name, email, profile.",
      "Mail, calendar, contacts, tasks and Drive file list — read-only.",
    ],
  },
  {
    tier: 3,
    label: "Comprehension",
    grants: [
      "Name, email, profile.",
      "Mail, calendar, contacts, tasks and Drive file list — read-only.",
      "Activity, sleep and heart-rate signals for pattern analysis.",
    ],
  },
  {
    tier: 4,
    label: "Agency",
    grants: [
      "Name, email, profile.",
      "Mail, calendar, contacts, tasks and Drive file list — read-only.",
      "Activity, sleep and heart-rate signals for pattern analysis.",
      "Draft into Gmail Drafts. Never sends.",
    ],
  },
  {
    tier: 5,
    label: "Delegated Send",
    grants: [
      "Name, email, profile.",
      "Mail, calendar, contacts, tasks and Drive file list — read-only.",
      "Activity, sleep and heart-rate signals for pattern analysis.",
      "Draft into Gmail Drafts.",
      "Approve a specific draft for sending. One draft at a time.",
    ],
  },
];

const TIER_LABEL: Record<number, string> = {
  1: "Identity", 2: "Read", 3: "Comprehension", 4: "Agency", 5: "Delegated Send",
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
    catch (e) { setErr((e as Error).message); toast.error((e as Error).message.slice(0, 180)); }
    finally { setBusy(null); }
  };

  const remove = async (id: string, email: string) => {
    setBusy(id);
    try {
      await disconnectAccount(id);
      toast.success(`Disconnected ${email}.`);
      setConfirmId(null);
    } catch (e) { toast.error((e as Error).message.slice(0, 180)); }
    finally { setBusy(null); }
  };

  const live = accounts.filter((a) => a.status === "connected");

  return (
    <section className="rounded-2xl border border-border/30 bg-card/20 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-light tracking-wide text-foreground">Cloud Intelligence</h3>
          <p className="text-xs font-extralight text-muted-foreground/70 mt-1 max-w-xl">
            Connect as many Google accounts as you use. Asherin merges them into one
            ledger — a person who mails two of your addresses stays one person.
          </p>
        </div>
        <Button
          variant="ghost" size="sm"
          onClick={() => void fetchAccounts()}
          className="text-xs font-extralight shrink-0"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {err && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-extralight text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {err}
        </div>
      )}

      {/* Access ladder selector */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-extralight mb-2">
          Access level for the next account
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
              <div className="text-xs font-light text-foreground">Tier {t.tier} · {t.label}</div>
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
        Add Google account
      </Button>

      {/* Connected accounts */}
      {live.length === 0 ? (
        <p className="text-xs font-extralight text-muted-foreground/60">
          No Google account connected yet.
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
                    {a.is_primary && <Star className="h-3 w-3 text-foreground/50 shrink-0" aria-label="Primary account" />}
                  </div>
                  <div className="text-[10px] font-extralight text-muted-foreground/60">
                    Tier {a.consent_tier ?? 1} · {TIER_LABEL[a.consent_tier ?? 1] ?? "Identity"}
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
                    {busy === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm"}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-[11px] font-extralight h-7" onClick={() => setConfirmId(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm" variant="ghost"
                  className="text-[11px] font-extralight h-7 shrink-0"
                  onClick={() => setConfirmId(a.id)}
                  aria-label={`Disconnect ${a.google_email}`}
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
        Tokens are stored encrypted and scoped to your account only. Disconnecting removes
        them immediately; nothing is ever sent without your explicit approval of a specific draft.
      </div>
    </section>
  );
};

export default GoogleAccountsSettings;
