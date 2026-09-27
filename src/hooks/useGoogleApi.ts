import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GOOGLE_REDIRECT_URI } from "@/lib/googleRedirect";

interface GoogleAccount {
  id: string;
  google_email: string;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
  scopes: string[];
  last_sync_at: string | null;
  data_points_count: number;
  is_primary: boolean;
  consent_tier?: number | null;
}

interface SyncStatus {
  /** ms timestamp of the most recent account change seen on this tab */
  lastUpdateAt: number | null;
  /** true when a realtime update is being processed */
  isLive: boolean;
  /** number of other devices recently seen for this user */
  peerCount: number;
  /** human label for this device */
  thisDeviceLabel: string;
  /** error string if the live channel dropped */
  channelError: string | null;
}

export function useGoogleApi() {
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    lastUpdateAt: null,
    isLive: false,
    peerCount: 0,
    thisDeviceLabel: "this device",
    channelError: null,
  });

  // [Finding #3] — Token refresh promise lock to prevent race conditions
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const callOAuth = useCallback(async (action: string, extra?: Record<string, any>) => {
    // Serialize token-refresh calls
    if (action === "refresh_token") {
      if (refreshPromiseRef.current) return refreshPromiseRef.current;
      const promise = (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");
        const res = await supabase.functions.invoke("google-oauth", {
          body: { action, ...extra },
        });
        if (res.error) throw new Error(res.error.message);
        return res.data;
      })();
      refreshPromiseRef.current = promise.finally(() => { refreshPromiseRef.current = null; }) as any;
      return refreshPromiseRef.current;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const res = await supabase.functions.invoke("google-oauth", {
      body: { action, ...extra },
    });

    if (res.error) throw new Error(res.error.message);
    return res.data;
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await callOAuth("list_accounts");
      setAccounts(data.accounts || []);
      setSyncStatus((s) => ({ ...s, lastUpdateAt: Date.now(), channelError: null }));
      return data.accounts || [];
    } catch (err) {
      console.error("Failed to fetch accounts:", err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [callOAuth]);

  // Announce this device and count peers so the UI can explain cross-device state.
  const refreshPeerCount = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const { deviceId, deviceLabel } = await import("@/components/dashboard/google/modules/contactIntel/remoteVault");
      const { listDevices } = await import("@/components/dashboard/google/modules/contactIntel/remoteVault");
      const devices = await listDevices(session.user.id);
      const selfId = deviceId();
      const peers = devices.filter((d) => d.device_id !== selfId && d.last_seen_at);
      setSyncStatus((s) => ({
        ...s,
        peerCount: peers.length,
        thisDeviceLabel: deviceLabel(),
      }));
    } catch (e) {
      console.warn("[useGoogleApi] peer count refresh failed", e);
    }
  }, []);

  // [Cross-device fix] Realtime subscription: every device signed in as the same
  // user sees account connects/disconnects immediately without a refresh.
  useEffect(() => {
    let mounted = true;

    const startRealtime = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const userId = session.user.id;

      // Reuse a single channel per hook lifetime.
      if (realtimeRef.current) realtimeRef.current.unsubscribe();
      const channel = supabase
        .channel(`google_accounts:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "google_accounts",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            if (!mounted) return;
            setSyncStatus((s) => ({ ...s, isLive: true, lastUpdateAt: Date.now() }));
            void fetchAccounts();
            void refreshPeerCount();
          }
        )
        .subscribe((status, err) => {
          if (!mounted) return;
          setSyncStatus((s) => ({
            ...s,
            isLive: status === "SUBSCRIBED",
            channelError: err ? String(err.message ?? err) : null,
          }));
        });

      realtimeRef.current = channel;
    };

    void startRealtime();

    return () => {
      mounted = false;
      if (realtimeRef.current) {
        realtimeRef.current.unsubscribe();
        realtimeRef.current = null;
      }
    };
  }, [fetchAccounts, refreshPeerCount]);

  // [Cross-device fix] When the user switches back to this tab after connecting
  // on another device, fetch the latest state. Mobile browsers pause JS in background.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void fetchAccounts();
        void refreshPeerCount();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [fetchAccounts, refreshPeerCount]);

  // [Finding #1/#5] Store state for CSRF validation on callback
  const connectGoogle = useCallback(async (tier: number = 3) => {
    setLoading(true);
    try {
      const data = await callOAuth("get_auth_url", {
        redirect_uri: GOOGLE_REDIRECT_URI,
        origin: window.location.origin,
        tier,
      });
      if (data.url) {
        // Store state for validation on return
        if (data.state) sessionStorage.setItem("google_oauth_state", data.state);
        sessionStorage.setItem("google_oauth_return", window.location.pathname);
        // Google will not render consent inside a frame; this escapes it.
        const { openGoogleConsent } = await import("@/lib/googleConsent");
        const result = await openGoogleConsent(data.url);
        if (result.status === "connected") {
          toast.success(`Connected ${result.email || "Google account"}.`);
          await fetchAccounts();
          await refreshPeerCount();
        } else if (result.status === "failed") {
          toast.error(`Failed to connect: ${result.message}`);
        }
        return result;
      }
    } catch (err) {
      console.error("Failed to get auth URL:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [callOAuth, fetchAccounts, refreshPeerCount]);

  // [Finding #1/#5] Pass state for CSRF validation
  const exchangeCode = useCallback(async (code: string, state?: string) => {
    setLoading(true);
    try {
      const data = await callOAuth("exchange_code", {
        code,
        redirect_uri: GOOGLE_REDIRECT_URI,
        state,
      });
      await fetchAccounts();
      await refreshPeerCount();
      return data;
    } catch (err) {
      console.error("Failed to exchange code:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [callOAuth, fetchAccounts, refreshPeerCount]);

  const disconnectAccount = useCallback(async (accountId: string) => {
    await callOAuth("disconnect", { account_id: accountId });
    await fetchAccounts();
    await refreshPeerCount();
  }, [callOAuth, fetchAccounts, refreshPeerCount]);

  const fetchGoogleData = useCallback(async (service: string, params?: Record<string, any>, accountId?: string, aggregate = true) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const res = await supabase.functions.invoke("google-data", {
      body: { service, params, account_id: accountId, aggregate: accountId ? false : aggregate },
    });

    if (res.error) throw new Error(res.error.message);
    if (res.data?.error) throw new Error(res.data.error === "no_account" ? "No Google account connected" : res.data.message || res.data.error);
    return res.data;
  }, []);

  useEffect(() => {
    fetchAccounts();
    refreshPeerCount();
  }, [fetchAccounts, refreshPeerCount]);

  const isConnected = accounts.some((a) => a.status === "connected");

  return {
    loading,
    accounts,
    isConnected,
    syncStatus,
    connectGoogle,
    exchangeCode,
    disconnectAccount,
    fetchAccounts,
    fetchGoogleData,
  };
}

