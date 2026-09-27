import { useState, useEffect, useMemo } from "react";
import {
  Network, Mail, Calendar, HardDrive, Heart, Users, Globe,
  CheckCircle2, Clock, Shield, RefreshCw, ChevronRight,
} from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";
import DeepDivePanel from "../intel/DeepDivePanel";
import { scopeObservations, surface } from "@/lib/cloudIntel/googleObservations";


const scopeToApp: Record<string, { name: string; icon: React.ElementType; category: string }> = {
  "gmail.readonly": { name: "Gmail", icon: Mail, category: "Communication" },
  "calendar.readonly": { name: "Google Calendar", icon: Calendar, category: "Productivity" },
  "drive.metadata.readonly": { name: "Google Drive", icon: HardDrive, category: "Storage" },
  "contacts.readonly": { name: "Google Contacts", icon: Users, category: "Social" },
  "fitness.activity.read": { name: "Google Fit (Activity)", icon: Heart, category: "Health" },
  "fitness.heart_rate.read": { name: "Google Fit (Heart Rate)", icon: Heart, category: "Health" },
  "fitness.body.read": { name: "Google Fit (Body)", icon: Heart, category: "Health" },
  "fitness.sleep.read": { name: "Google Fit (Sleep)", icon: Heart, category: "Health" },
  "userinfo.email": { name: "Google Account (Email)", icon: Globe, category: "Identity" },
  "userinfo.profile": { name: "Google Account (Profile)", icon: Globe, category: "Identity" },
};

function parseScopeLabel(scope: string) {
  for (const [key, val] of Object.entries(scopeToApp)) {
    if (scope.includes(key)) return val;
  }
  return null;
}

const ConnectedAppsView = () => {
  const { accounts, fetchAccounts, loading } = useGoogleApi();

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  // Deduplicate apps across all accounts
  const allApps = new Map<string, { name: string; icon: React.ElementType; category: string; accounts: string[]; lastSync: string | null }>();

  accounts.forEach((acc) => {
    (acc.scopes || []).forEach((scope) => {
      const app = parseScopeLabel(scope);
      if (app) {
        const existing = allApps.get(app.name);
        if (existing) {
          if (!existing.accounts.includes(acc.google_email)) existing.accounts.push(acc.google_email);
          if (acc.last_sync_at && (!existing.lastSync || acc.last_sync_at > existing.lastSync)) existing.lastSync = acc.last_sync_at;
        } else {
          allApps.set(app.name, { ...app, accounts: [acc.google_email], lastSync: acc.last_sync_at });
        }
      }
    });
  });

  const appList = Array.from(allApps.values());
  const categories = [...new Set(appList.map((a) => a.category))];

  // Grant surface: one observation per (account, scope). Novelty answers "what
  // permission appeared that I did not deliberately approve", and dormancy
  // answers "which account holds live permissions but stopped reporting" — the
  // quieter and more dangerous of the two, since a stale grant is still a grant.
  const grantObs = useMemo(() => scopeObservations(accounts ?? []), [accounts]);
  const grantSpec = useMemo(
    () =>
      surface("Authorised Access", (accounts?.length ?? 0) > 0, {
        unit: "grant",
        unitPlural: "grants",
        entityNoun: "permission",
        entityNounPlural: "permissions",
        // Grants all carry the account's sync time, never a moment of consent.
        timestampsAreEvents: false,
        expectation:
          "Every live permission traces to an account you actively use and a capability you asked for.",
        reviewAction: "Revoke this permission from the Google account security page if it is not in use.",
      }),
    [accounts]
  );



  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/5">
            <Network className="h-6 w-6 text-foreground/70" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extralight tracking-wide text-foreground">Connected Apps & Services</h2>
              <button onClick={() => fetchAccounts()} disabled={loading} className="flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-all disabled:opacity-50">
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
            <p className="text-sm font-extralight leading-relaxed text-muted-foreground">
              {accounts.length} Google account{accounts.length !== 1 ? "s" : ""} connected · {appList.length} apps authorized
            </p>
          </div>
        </div>
      </div>

      <DeepDivePanel spec={grantSpec} observations={grantObs} />


      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 text-center">
          <p className="text-xl font-extralight text-foreground">{accounts.length}</p>
          <p className="text-[10px] font-light text-muted-foreground/60 mt-1">Accounts</p>
        </div>
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 text-center">
          <p className="text-xl font-extralight text-foreground">{appList.length}</p>
          <p className="text-[10px] font-light text-muted-foreground/60 mt-1">Apps Connected</p>
        </div>
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 text-center">
          <p className="text-xl font-extralight text-foreground">{categories.length}</p>
          <p className="text-[10px] font-light text-muted-foreground/60 mt-1">Categories</p>
        </div>
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 text-center">
          <p className="text-xl font-extralight text-foreground">
            {accounts.filter((a) => a.status === "connected").length}
          </p>
          <p className="text-[10px] font-light text-muted-foreground/60 mt-1">Active</p>
        </div>
      </div>

      {/* Account Details */}
      <div className="space-y-3">
        <h3 className="text-sm font-light tracking-wide text-foreground">Account Activity</h3>
        {accounts.map((acc) => {
          const accApps = (acc.scopes || []).map(parseScopeLabel).filter(Boolean);
          const uniqueApps = [...new Map(accApps.map((a) => [a!.name, a])).values()];
          return (
            <div key={acc.id} className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-light text-foreground shrink-0 overflow-hidden">
                  {acc.avatar_url ? (
                    <img src={acc.avatar_url} alt="" className="h-full w-full object-cover rounded-full" />
                  ) : (
                    acc.google_email?.charAt(0)?.toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-light text-foreground truncate">{acc.google_email}</span>
                    <span className={`h-2 w-2 rounded-full shrink-0 ${acc.status === "connected" ? "bg-emerald-500" : "bg-red-400"}`} />
                  </div>
                  <div className="flex gap-4 text-[10px] text-muted-foreground/50 mt-0.5">
                    <span>{acc.display_name || "—"}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      Last sync: {acc.last_sync_at ? new Date(acc.last_sync_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never"}
                    </span>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-1 rounded-lg ${acc.status === "connected" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                  {acc.status}
                </span>
              </div>

              {/* Apps for this account */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-light text-muted-foreground/60">{uniqueApps.length} apps authorized</span>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                  {uniqueApps.map((app) => (
                    <div key={app!.name} className="flex items-center gap-2 rounded-xl bg-foreground/5 px-3 py-2">
                      <app.icon className="h-3.5 w-3.5 text-foreground/50 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-light text-foreground truncate block">{app!.name}</span>
                        <span className="text-[9px] text-muted-foreground/40">{app!.category}</span>
                      </div>
                      <CheckCircle2 className="h-3 w-3 text-emerald-400/60 shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* All Apps by Category */}
      {categories.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-light tracking-wide text-foreground">Apps by Category</h3>
          {categories.map((cat) => {
            const catApps = appList.filter((a) => a.category === cat);
            return (
              <div key={cat} className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 space-y-2">
                <span className="text-xs font-light text-foreground">{cat}</span>
                <div className="space-y-1">
                  {catApps.map((app) => (
                    <div key={app.name} className="flex items-center gap-3 py-1.5">
                      <app.icon className="h-3.5 w-3.5 text-foreground/40 shrink-0" />
                      <span className="text-[11px] font-light text-foreground flex-1">{app.name}</span>
                      <span className="text-[10px] text-muted-foreground/50">{app.accounts.length} account{app.accounts.length > 1 ? "s" : ""}</span>
                      <span className="text-[10px] text-muted-foreground/40">
                        {app.lastSync ? new Date(app.lastSync).toLocaleDateString([], { month: "short", day: "numeric" }) : "No sync"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Security Note */}
      <div className="flex items-start gap-2 rounded-xl bg-foreground/5 px-3 py-2">
        <Shield className="h-3 w-3 text-muted-foreground/40 shrink-0 mt-0.5" />
        <p className="text-[10px] font-extralight text-muted-foreground/40">
          All OAuth tokens are encrypted at rest. You can revoke access to any app from your Google Account security settings.
        </p>
      </div>
    </div>
  );
};

export default ConnectedAppsView;