// guardian vault — device security, held on this device.
//
// there is no account here, so there are no sessions, logins, factors or
// passwords to show. what the room shows instead is true of this device: how
// the key vault is locked, which provider keys it holds (never the secrets),
// what is ciphertext at rest and under which key, the items it stores, the
// watchtower review of those items, the trail of what it did to itself, and
// what this browser can notify about on its own.

import { useCallback, useEffect, useState } from "react";
import { Shield, Lock, ShieldAlert, History, Bell, RefreshCw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { useIsV2 } from "@/lib/dashboardUiContext";
import { V2Action, v2ActionClass } from "@/components/dashboard/v2/V2PageShell";
import { VAULT_EVENT } from "@/lib/local/keys";
import { onTableChange } from "@/lib/local/db";
import {
  EMPTY_ENCRYPTION, EMPTY_VAULT, readEncryptionFacts, readTrail, readVaultFacts,
  type EncryptionFacts, type TrailEntry, type VaultFacts,
} from "@/lib/guardian/deviceSecurity";
import VaultItemsPanel from "@/components/dashboard/vault/VaultItemsPanel";
import VaultKeyCard from "@/components/dashboard/guardian/VaultKeyCard";
import DeviceOverview from "@/components/dashboard/guardian/DeviceOverview";
import DeviceTrail from "@/components/dashboard/guardian/DeviceTrail";
import DeviceNotifications from "@/components/dashboard/guardian/DeviceNotifications";

type VaultTab = "overview" | "items" | "watchtower" | "trail" | "notifications";

const TABS: { id: VaultTab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "overview", icon: Shield },
  { id: "items", label: "items", icon: Lock },
  { id: "watchtower", label: "watchtower", icon: ShieldAlert },
  { id: "trail", label: "trail", icon: History },
  { id: "notifications", label: "notifications", icon: Bell },
];

const readDeviceCreated = (): string | null => {
  try {
    return localStorage.getItem("asherin_device_id_created");
  } catch {
    return null;
  }
};

const GuardianVaultView = () => {
  const v2 = useIsV2();
  const { user } = useAuth();
  const [tab, setTab] = useState<VaultTab>("overview");
  const [vault, setVault] = useState<VaultFacts>(EMPTY_VAULT);
  const [encryption, setEncryption] = useState<EncryptionFacts>(EMPTY_ENCRYPTION);
  const [trail, setTrail] = useState<TrailEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [factsError, setFactsError] = useState<string | null>(null);
  const [trailError, setTrailError] = useState<string | null>(null);

  const loadVault = useCallback(async () => {
    try {
      setVault(await readVaultFacts());
      setFactsError(null);
    } catch (e) {
      setFactsError(e instanceof Error ? e.message : "the key vault could not be read.");
    }
  }, []);

  const loadEncryption = useCallback(async () => {
    if (!user?.id) return;
    try {
      setEncryption(await readEncryptionFacts(user.id));
    } catch {
      setEncryption(EMPTY_ENCRYPTION);
    }
  }, [user?.id]);

  const loadTrail = useCallback(async () => {
    try {
      setTrail(await readTrail());
      setTrailError(null);
    } catch (e) {
      setTrailError(e instanceof Error ? e.message : "the trail could not be read.");
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadVault(), loadEncryption(), loadTrail()]);
    setLoading(false);
  }, [loadVault, loadEncryption, loadTrail]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // the vault emits on every lock, unlock and key write; the trail table
  // notifies on every row. both are cheap reads of a cached table.
  useEffect(() => {
    const onVault = () => { void loadVault(); };
    window.addEventListener(VAULT_EVENT, onVault);
    const offTrail = onTableChange("audit_log", () => { void loadTrail(); });
    const offItems = onTableChange("vault_items", () => { void loadEncryption(); });
    return () => {
      window.removeEventListener(VAULT_EVENT, onVault);
      offTrail();
      offItems();
    };
  }, [loadVault, loadTrail, loadEncryption]);

  if (!user) return null;

  const refresh = (
    <button type="button" onClick={() => void loadAll()} className={v2 ? v2ActionClass : "p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"} aria-label="refresh">
      <RefreshCw className={`${v2 ? "h-3.5 w-3.5" : "h-4 w-4"} ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
      {v2 ? " refresh" : null}
    </button>
  );

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden bg-background/30">
      <div className={`flex-shrink-0 px-4 sm:px-6 border-b border-border/20 bg-card/10 backdrop-blur-sm ${v2 ? "py-2.5" : "py-5"}`}>
        {v2 ? (
          <V2Action>{refresh}</V2Action>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-foreground/70" aria-hidden="true" />
              <div>
                <h1 className="text-base font-extralight tracking-[0.15em] text-foreground">guardian vault</h1>
                <p className="text-[10px] font-extralight tracking-wider text-muted-foreground/50 mt-0.5">device security, held on this device</p>
              </div>
            </div>
            {refresh}
          </div>
        )}

        <div className={`flex gap-1 overflow-x-auto scrollbar-hide ${v2 ? "" : "mt-4"}`} role="tablist" aria-label="guardian vault sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-light tracking-wide whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                tab === t.id ? "bg-foreground/10 text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/5"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div role="tabpanel" aria-label={tab} className="p-4 sm:p-6 space-y-6 max-w-4xl">
          {tab === "overview" && (
            loading ? (
              <div className="space-y-3" aria-busy="true" aria-label="reading this device">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl border border-border/15 bg-card/5 animate-pulse" />)}
                </div>
                <div className="h-20 rounded-xl border border-border/15 bg-card/5 animate-pulse" />
              </div>
            ) : (
              <DeviceOverview
                vault={vault}
                vaultError={factsError}
                encryption={encryption}
                trail={trail}
                deviceId={user.id}
                deviceCreated={readDeviceCreated()}
                onShowTrail={() => setTab("trail")}
              >
                {factsError ? (
                  <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 space-y-2">
                    <p className="text-xs font-light text-foreground">the key vault could not be read.</p>
                    <p className="text-[10px] text-muted-foreground/50">{factsError}</p>
                    <button type="button" onClick={() => void loadVault()} className="text-[10px] px-2.5 py-1 rounded-lg border border-border/30 hover:border-border/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      try again
                    </button>
                  </div>
                ) : (
                  <VaultKeyCard facts={vault} onChanged={() => void loadVault()} />
                )}
              </DeviceOverview>
            )
          )}

          {tab === "items" && <VaultItemsPanel mode="items" />}
          {tab === "watchtower" && <VaultItemsPanel mode="watchtower" />}
          {tab === "trail" && <DeviceTrail trail={trail} loading={loading} error={trailError} onRetry={() => void loadTrail()} />}
          {tab === "notifications" && <DeviceNotifications />}
        </div>
      </ScrollArea>
    </div>
  );
};

export default GuardianVaultView;
