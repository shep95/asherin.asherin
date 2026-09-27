import { useState, useEffect, useCallback } from "react";
import {
  Plus, X, RefreshCw, Link2, Unlink, Shield, CheckCircle2,
  AlertTriangle, Globe, Zap, Radio, Smartphone, Monitor,
} from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";
import { toast } from "sonner";
import { useGoogleOAuthCallback } from "@/hooks/useGoogleOAuthCallback";

const MultiAccountManager = () => {
  const { accounts, loading, syncStatus, connectGoogle, disconnectAccount, fetchAccounts, isConnected } = useGoogleApi();
  const [crossCorrelation, setCrossCorrelation] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // OAuth return is handled by a shared, locked hook so that multiple mounted
  // Google surfaces cannot race to spend the same authorization code.
  useGoogleOAuthCallback(useCallback(() => { void fetchAccounts(); }, [fetchAccounts]));

  // Announce this device as part of the mesh whenever the account list changes.
  useEffect(() => {
    const announce = async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { touchDevice } = await import("./modules/contactIntel/remoteVault");
      await touchDevice(session.user.id, accounts.length > 0);
    };
    void announce();
  }, [accounts.length]);

  const handleConnect = async () => {
    try {
      await connectGoogle();
    } catch (err: any) {
      toast.error(`Failed to start connection: ${err.message}`);
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await disconnectAccount(id);
      toast.success("Account disconnected");
    } catch (err: any) {
      toast.error(`Failed to disconnect: ${err.message}`);
    }
  };

  const liveAgo = syncStatus.lastUpdateAt
    ? `${Math.max(0, Math.round((Date.now() - syncStatus.lastUpdateAt) / 1000))}s`
    : "—";

  return (
    <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-light tracking-wide text-foreground flex items-center gap-2">
          <Globe className="h-4 w-4" /> Connected Google Accounts
        </h3>
        <button
          onClick={handleConnect}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-all disabled:opacity-50"
        >
          {loading ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          {loading ? "Connecting…" : "Add Account"}
        </button>
      </div>

      {/* Cross-device sync status — explains why the phone may look different. */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/20 bg-foreground/5 px-3 py-2">
        <div className="flex items-center gap-1.5 text-[10px] font-extralight text-muted-foreground/70">
          <Radio className={`h-3 w-3 shrink-0 ${syncStatus.isLive ? "text-emerald-500" : "text-amber-500/60"}`} />
          {syncStatus.isLive ? "Live sync on" : "Live sync connecting…"}
        </div>
        <div className="text-[10px] font-extralight text-muted-foreground/50">
          updated {liveAgo} ago
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-[10px] font-extralight text-muted-foreground/60">
          <Monitor className="h-3 w-3" />
          <span className="truncate max-w-[120px]">{syncStatus.thisDeviceLabel}</span>
          {syncStatus.peerCount > 0 && (
            <span className="flex items-center gap-1 text-emerald-500/80">
              <Smartphone className="h-3 w-3" />
              +{syncStatus.peerCount} device{syncStatus.peerCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {syncStatus.channelError && (
          <div className="w-full flex items-center gap-1.5 text-[10px] font-extralight text-amber-500/80">
            <AlertTriangle className="h-3 w-3" />
            Sync channel paused: {syncStatus.channelError}
          </div>
        )}
      </div>

      {/* Account List */}
      <div className="space-y-2">
        {accounts.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/20 bg-foreground/5 p-6 text-center">
            <p className="text-xs font-extralight text-muted-foreground/50">No Google accounts connected yet</p>
            <p className="text-[10px] font-extralight text-muted-foreground/40 mt-1">
              Accounts are tied to your Asherin identity. Sign in with the same account on every device to keep them in sync.
            </p>
            <button onClick={handleConnect} disabled={loading} className="mt-3 rounded-xl bg-foreground/10 px-4 py-2 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-all">
              Connect Google Account
            </button>
          </div>
        )}
        {accounts.map((account) => (
          <div
            key={account.id}
            className="flex items-center gap-3 rounded-xl border border-border/20 bg-foreground/5 px-4 py-3"
          >
            <div className="h-9 w-9 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-light text-foreground shrink-0 overflow-hidden">
              {account.avatar_url ? (
                <img src={account.avatar_url} alt="" className="h-full w-full object-cover rounded-full" />
              ) : (
                account.google_email?.charAt(0)?.toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-light text-foreground truncate">{account.google_email}</span>
                <span
                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                    account.status === "connected"
                      ? "bg-emerald-500"
                      : account.status === "expired"
                      ? "bg-red-400"
                      : "bg-amber-500/60"
                  }`}
                />
              </div>
              <div className="flex gap-3 text-[10px] text-muted-foreground/50 mt-0.5">
                <span>{account.display_name || "—"}</span>
                <span>Scopes: {account.scopes?.length || "—"}</span>
                <span>Sync: {account.last_sync_at ? new Date(account.last_sync_at).toLocaleDateString() : "Never"}</span>
                <span>Data: {account.data_points_count || "—"}</span>
              </div>
            </div>
            <button
              onClick={() => handleDisconnect(account.id)}
              className="text-muted-foreground/30 hover:text-red-400 transition-colors p-1"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Cross-Account Correlation */}
      {accounts.length > 1 && (
        <div className="rounded-xl border border-border/20 bg-foreground/5 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="h-3.5 w-3.5 text-foreground/50" />
              <span className="text-xs font-light text-foreground">Cross-Account Correlation</span>
            </div>
            <button
              onClick={() => setCrossCorrelation(!crossCorrelation)}
              className={`rounded-lg px-3 py-1 text-[10px] font-light transition-all ${
                crossCorrelation
                  ? "bg-foreground/10 text-foreground"
                  : "bg-foreground/5 text-muted-foreground"
              }`}
            >
              {crossCorrelation ? "Enabled" : "Enable"}
            </button>
          </div>
          <p className="text-[10px] font-extralight text-muted-foreground/50">
            Merge intelligence across all linked accounts — unified contact graph, 
            combined calendar analysis, cross-account email patterns, and shared location history.
          </p>
          {crossCorrelation && (
            <div className="space-y-1 pt-1">
              {[
                "Unified contact deduplication across accounts",
                "Merged calendar for complete schedule intelligence",
                "Cross-account email thread correlation",
                "Combined location history for fuller picture",
                "Shared subscription detection (paying twice?)",
              ].map((feat, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5">
                  <CheckCircle2 className="h-3 w-3 text-foreground/30 shrink-0" />
                  <span className="text-[10px] font-extralight text-muted-foreground">{feat}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Security Note */}
      <div className="flex items-start gap-2 rounded-xl bg-foreground/5 px-3 py-2">
        <Shield className="h-3 w-3 text-muted-foreground/40 shrink-0 mt-0.5" />
        <p className="text-[10px] font-extralight text-muted-foreground/40">
          All tokens encrypted at rest (AES-256). Refresh tokens stored in isolated vault.
          Each account can be revoked independently at any time.
        </p>
      </div>
    </div>
  );
};

export default MultiAccountManager;

