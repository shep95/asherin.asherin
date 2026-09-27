import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useStepUp } from "@/components/auth/StepUpProvider";
import { reauthenticateWithPassword } from "@/lib/accountAssurance";

import { supabase } from "@/integrations/supabase/client";
import {
  Shield, ShieldCheck, ShieldAlert, Smartphone, Monitor, Tablet,
  MapPin, Clock, Trash2, LogOut, Key, Lock, Eye, EyeOff, AlertTriangle,
  CheckCircle2, XCircle, ChevronRight, RefreshCw, Bell, BellOff,
  Fingerprint, History, Globe, Activity, Settings2, Copy, Check
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import {
  readPushStatus, enableSecurityPush, disableSecurityPush,
  listRegisteredDevices, removeDevice, sendTestPush, reportSecurityEvent,
  type PushStatus, type RegisteredDevice,
} from "@/lib/securityPush";
import VaultItemsPanel from "@/components/dashboard/vault/VaultItemsPanel";
import { useIsV2 } from "@/lib/dashboardUiContext";
import { V2Action, v2ActionClass } from "@/components/dashboard/v2/V2PageShell";

type VaultTab = "overview" | "items" | "watchtower" | "sessions" | "activity" | "mfa" | "alerts" | "password";

interface Session {
  id: string;
  device_type: string;
  browser: string;
  os: string;
  ip_address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  is_current: boolean;
  last_active_at: string;
  created_at: string;
}

interface ActivityEntry {
  id: string;
  event_type: string;
  description: string;
  ip_address: string | null;
  device_info: string | null;
  location: string | null;
  outcome: string;
  created_at: string;
}

interface NotifPrefs {
  new_device_login: boolean;
  failed_login_attempts: boolean;
  password_change: boolean;
  mfa_change: boolean;
  session_revocation: boolean;
  recovery_code_usage: boolean;
  notify_email: boolean;
  notify_push: boolean;
  notify_sms: boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  new_device_login: true,
  failed_login_attempts: true,
  password_change: true,
  mfa_change: true,
  session_revocation: true,
  recovery_code_usage: true,
  notify_email: true,
  notify_push: true,
  notify_sms: false,
};

const TABS: { id: VaultTab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: Shield },
  { id: "items", label: "Items", icon: Lock },
  { id: "watchtower", label: "Watchtower", icon: ShieldAlert },
  { id: "sessions", label: "Active Sessions", icon: Monitor },
  { id: "activity", label: "Audit Trail", icon: History },
  { id: "mfa", label: "MFA", icon: Fingerprint },
  { id: "password", label: "Password", icon: Key },
  { id: "alerts", label: "Notifications", icon: Bell },
];

const deviceIcon = (type: string) => {
  if (type.toLowerCase().includes("mobile") || type.toLowerCase().includes("phone")) return Smartphone;
  if (type.toLowerCase().includes("tablet")) return Tablet;
  return Monitor;
};

const eventIcon = (type: string, outcome: string) => {
  if (outcome === "failure") return XCircle;
  switch (type) {
    case "login": return CheckCircle2;
    case "failed_login": return XCircle;
    case "password_change": return Key;
    case "mfa_setup": case "mfa_disable": return Fingerprint;
    case "session_revoke": return LogOut;
    default: return Activity;
  }
};

const GuardianVaultView = () => {
  const v2 = useIsV2();
  const { user, signOut } = useAuth();
  const stepUp = useStepUp();

  const { toast } = useToast();
  const [tab, setTab] = useState<VaultTab>("overview");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [activityFilter, setActivityFilter] = useState<string>("all");
  const [passwordForm, setPasswordForm] = useState({ current: "", new_: "", confirm: "" });
  const [showPasswords, setShowPasswords] = useState({ current: false, new_: false, confirm: false });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [mfaFactors, setMfaFactors] = useState<any[]>([]);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpVerifyCode, setTotpVerifyCode] = useState("");
  const [enrollingTotp, setEnrollingTotp] = useState(false);
  const [enrolledFactorId, setEnrolledFactorId] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushStatus>({ state: "prompt" });
  const [pushBusy, setPushBusy] = useState(false);
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [sessRes, actRes, prefRes] = await Promise.all([
        supabase.from("user_sessions").select("*").eq("user_id", user.id).is("revoked_at", null).order("last_active_at", { ascending: false }),
        supabase.from("account_activity_log").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
        supabase.from("security_notification_prefs").select("*").eq("user_id", user.id).maybeSingle(),
      ]);

      if (sessRes.data) setSessions(sessRes.data as Session[]);
      if (actRes.data) setActivity(actRes.data as ActivityEntry[]);
      if (prefRes.data) {
        const { id, user_id, created_at, updated_at, ...prefs } = prefRes.data as any;
        setNotifPrefs(prefs);
      }

      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      if (factorsData) setMfaFactors(factorsData.totp || []);
    } catch (e) {
      console.error("Guardian Vault load error:", e);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // Device-alert state is read separately from the security rows: it lives in
  // the browser (permission + subscription) and only then in the database, so
  // a stale toggle would lie about whether this laptop can actually be reached.
  const loadDevices = useCallback(async () => {
    if (!user) return;
    const [status, list] = await Promise.all([readPushStatus(), listRegisteredDevices()]);
    setPushStatus(status);
    setDevices(list);
  }, [user]);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  const toggleDeviceAlerts = async () => {
    setPushBusy(true);
    const next = pushStatus.state === "enabled" ? await disableSecurityPush() : await enableSecurityPush();
    setPushStatus(next);
    setDevices(await listRegisteredDevices());
    setPushBusy(false);
    if (next.state === "enabled") toast({ title: "This device will now receive security alerts" });
    else if (next.reason) toast({ title: "Device alerts unavailable", description: next.reason, variant: "destructive" });
  };

  const testDeviceAlerts = async () => {
    setPushBusy(true);
    const res = await sendTestPush();
    setPushBusy(false);
    setDevices(await listRegisteredDevices());
    toast(res.ok
      ? { title: `Test alert sent to ${res.delivered} device${res.delivered === 1 ? "" : "s"}` }
      : { title: "Test alert not delivered", description: res.reason ?? "No device accepted the alert.", variant: "destructive" });
  };

  const forgetDevice = async (endpoint: string) => {
    const ok = await removeDevice(endpoint);
    if (!ok) { toast({ title: "Could not remove device", variant: "destructive" }); return; }
    setDevices(prev => prev.filter(d => d.endpoint !== endpoint));
    setPushStatus(await readPushStatus());
  };

  useEffect(() => {
    if (!user) return;
    const logVisit = async () => {
      await supabase.from("account_activity_log").insert({
        user_id: user.id,
        event_type: "security_review",
        description: "Accessed Guardian Vault security center",
        outcome: "success",
      });
    };
    logVisit();
  }, [user]);

  /**
   * Revocation is only real if the refresh token dies with the row.
   *
   * GoTrue exposes exactly one revocation verb to a normal user:
   * signOut({ scope: "others" }) — it invalidates every OTHER session's
   * refresh token and keeps this one. There is no per-row API, so revoking a
   * single device also ends the rest, and the UI says that instead of
   * pretending a row-level kill happened. The local heartbeat on each other
   * device also sees revoked_at and clears its key material within a minute,
   * which closes the window while their access token is still inside its TTL.
   */
  const killOtherSessions = async (): Promise<boolean> => {
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) {
      toast({
        title: "Could not end other sessions",
        description: error.message,
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const revokeSession = async (sessionId: string) => {
    if (!user) return;
    const target = sessions.find((s) => s.id === sessionId);
    if (target?.is_current) {
      if (!(await stepUp("sign out this device"))) return;
      await supabase.from("user_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", sessionId);
      await signOut();
      return;
    }
    if (!(await stepUp("sign out other devices"))) return;
    if (!(await killOtherSessions())) return;
    const now = new Date().toISOString();
    await supabase
      .from("user_sessions")
      .update({ revoked_at: now })
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .eq("is_current", false);
    await supabase.from("account_activity_log").insert({
      user_id: user.id,
      event_type: "session_revoke",
      description: "Signed out every other device (refresh tokens invalidated)",
      outcome: "success",
    });
    reportSecurityEvent({ type: "session_revoke", description: "Every other session was signed out from Guardian Vault." });
    setSessions(prev => prev.filter(s => s.is_current));
    toast({
      title: "Other devices signed out",
      description: "Sign-out applies to every other device — the platform has no single-device revoke.",
    });
  };

  const revokeAllOther = async () => {
    if (!user) return;
    if (!(await stepUp("sign out other devices"))) return;
    if (!(await killOtherSessions())) return;
    const otherSessions = sessions.filter(s => !s.is_current);
    await supabase
      .from("user_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .eq("is_current", false);
    await supabase.from("account_activity_log").insert({
      user_id: user.id,
      event_type: "session_revoke",
      description: `Signed out ${otherSessions.length} other session(s) — refresh tokens invalidated`,
      outcome: "success",
    });
    reportSecurityEvent({ type: "session_revoke", description: "Every other session was signed out from Guardian Vault." });
    setSessions(prev => prev.filter(s => s.is_current));
    toast({ title: `${otherSessions.length} other session(s) signed out` });
  };

  const calcStrength = (pw: string) => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return Math.min(score, 5);
  };

  useEffect(() => {
    setPasswordStrength(calcStrength(passwordForm.new_));
  }, [passwordForm.new_]);

  const changePassword = async () => {
    if (passwordForm.new_ !== passwordForm.confirm) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (passwordForm.new_.length < 12) {
      toast({ title: "Password must be at least 12 characters", variant: "destructive" });
      return;
    }
    if (passwordStrength < 4) {
      toast({ title: "Password too weak — use uppercase, lowercase, numbers, and special characters", variant: "destructive" });
      return;
    }
    // updateUser({ password }) accepts whoever holds the session. A borrowed
    // tab is exactly that, so the current password is verified first.
    if (user?.email && passwordForm.current) {
      const reason = await reauthenticateWithPassword(user.email, passwordForm.current);
      if (reason) {
        toast({ title: reason, variant: "destructive" });
        return;
      }
    } else if (!(await stepUp("change your password"))) {
      return;
    }
    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordForm.new_ });
      if (error) throw error;
      await supabase.from("account_activity_log").insert({
        user_id: user!.id,
        event_type: "password_change",
        description: "Password changed successfully",
        outcome: "success",
      });
      reportSecurityEvent({ type: "password_change", description: "Your account password was changed." });
      // A password change that leaves old devices signed in is theatre.
      await killOtherSessions();
      await supabase
        .from("user_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", user!.id)
        .is("revoked_at", null)
        .eq("is_current", false);
      setSessions(prev => prev.filter(s => s.is_current));
      setPasswordForm({ current: "", new_: "", confirm: "" });
      toast({ title: "Password updated", description: "Every other device was signed out." });
    } catch (e: any) {
      toast({ title: "Failed to update password", description: e.message, variant: "destructive" });
    }
    setPasswordLoading(false);
  };


  const saveNotifPrefs = async (updated: NotifPrefs) => {
    if (!user) return;
    setNotifPrefs(updated);
    const { error } = await supabase.from("security_notification_prefs").upsert({
      user_id: user.id,
      ...updated,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) toast({ title: "Failed to save preferences", variant: "destructive" });
  };

  const startTotpEnroll = async () => {
    setMfaLoading(true);
    try {
      // Check for existing unverified factors first
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const existingUnverified = (factorsData?.totp || []).find((f: any) => f.status === "unverified");

      if (existingUnverified) {
        // Unenroll the stale unverified factor, then enroll fresh
        await supabase.auth.mfa.unenroll({ factorId: existingUnverified.id });
      }

      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;
      if (data) {
        setTotpUri(data.totp?.uri || null);
        setTotpSecret(data.totp?.secret || null);
        setEnrolledFactorId(data.id);
        setEnrollingTotp(true);
      }
    } catch (e: any) {
      toast({ title: "MFA enrollment failed", description: e.message, variant: "destructive" });
    }
    setMfaLoading(false);
  };

  const verifyTotpEnroll = async () => {
    if (!totpVerifyCode || totpVerifyCode.length !== 6) {
      toast({ title: "Enter a 6-digit code", variant: "destructive" });
      return;
    }
    setMfaLoading(true);
    try {
      const factorId = enrolledFactorId;
      if (!factorId) {
        // Fallback: try to find unverified factor from list
        const factors = await supabase.auth.mfa.listFactors();
        const unverified = (factors.data?.totp || []).find((f: any) => f.status === "unverified");
        if (!unverified) throw new Error("No pending factor found. Please start MFA setup again.");
        const { error } = await supabase.auth.mfa.challengeAndVerify({
          factorId: unverified.id,
          code: totpVerifyCode,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.mfa.challengeAndVerify({
          factorId,
          code: totpVerifyCode,
        });
        if (error) throw error;
      }
      await supabase.from("account_activity_log").insert({
        user_id: user!.id,
        event_type: "mfa_setup",
        description: "TOTP authenticator app enabled",
        outcome: "success",
      });
      reportSecurityEvent({ type: "mfa_setup", description: "Two-factor authentication was enabled on your account." });
      setEnrollingTotp(false);
      setTotpUri(null);
      setTotpSecret(null);
      setTotpVerifyCode("");
      setEnrolledFactorId(null);
      toast({ title: "TOTP MFA enabled" });
      loadData();
    } catch (e: any) {
      toast({ title: "Verification failed", description: e.message, variant: "destructive" });
    }
    setMfaLoading(false);
  };

  const unenrollFactor = async (factorId: string) => {
    setMfaLoading(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      await supabase.from("account_activity_log").insert({
        user_id: user!.id,
        event_type: "mfa_disable",
        description: "MFA factor removed",
        outcome: "success",
      });
      reportSecurityEvent({ type: "mfa_disable", description: "Two-factor authentication was removed from your account." });
      toast({ title: "MFA factor removed" });
      loadData();
    } catch (e: any) {
      toast({ title: "Failed to remove factor", description: e.message, variant: "destructive" });
    }
    setMfaLoading(false);
  };

  const filteredActivity = activityFilter === "all"
    ? activity
    : activity.filter(a => a.event_type === activityFilter);

  const strengthLabel = ["Very Weak", "Weak", "Fair", "Good", "Strong", "Very Strong"][passwordStrength];
  const strengthColor = ["bg-red-500", "bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-emerald-400", "bg-emerald-500"][passwordStrength];

  const totalSessions = sessions.length;
  const recentLogins = activity.filter(a => a.event_type === "login").length;
  const failedLogins = activity.filter(a => a.event_type === "failed_login" || a.outcome === "failure").length;
  const mfaEnabled = mfaFactors.some((f: any) => f.status === "verified");

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden bg-background/30">
      <div className={`flex-shrink-0 px-6 border-b border-border/20 bg-card/10 backdrop-blur-sm ${v2 ? "py-2.5" : "py-5"}`}>
        {v2 ? (
          <V2Action>
            <button onClick={loadData} className={v2ActionClass} title="Refresh">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> refresh
            </button>
          </V2Action>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-foreground/70" />
              <div>
                <h1 className="text-base font-extralight tracking-[0.15em] text-foreground">GUARDIAN VAULT</h1>
                <p className="text-[10px] font-extralight tracking-wider text-muted-foreground/50 mt-0.5">Account Security Command Center</p>
              </div>
            </div>
            <button onClick={loadData} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors" title="Refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        )}

        <div className={`flex gap-1 overflow-x-auto scrollbar-hide ${v2 ? "" : "mt-4"}`}>
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-light tracking-wide whitespace-nowrap transition-all ${
                  tab === t.id
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/5"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6 space-y-6 max-w-4xl">
          {tab === "overview" && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Active Sessions", value: String(totalSessions), icon: Monitor, alert: totalSessions > 5 },
                  { label: "Recent Logins", value: String(recentLogins), icon: CheckCircle2 },
                  { label: "Failed Attempts", value: String(failedLogins), icon: XCircle, alert: failedLogins > 0 },
                  { label: "MFA Status", value: mfaEnabled ? "Enabled" : "Disabled", icon: Fingerprint, alert: !mfaEnabled },
                ].map((stat, i) => (
                  <div key={i} className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <stat.icon className={`h-4 w-4 ${stat.alert ? "text-amber-400" : "text-muted-foreground/50"}`} />
                      <span className="text-[10px] font-light tracking-wider text-muted-foreground/60 uppercase">{stat.label}</span>
                    </div>
                    <p className={`text-lg font-extralight ${stat.alert ? "text-amber-400" : "text-foreground"}`}>{stat.value}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-light tracking-wider text-muted-foreground/60 uppercase">Recommendations</h3>
                <div className="space-y-1.5">
                  {!mfaEnabled && (
                    <button onClick={() => setTab("mfa")} className="w-full flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-left transition-colors hover:bg-amber-500/10">
                      <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-light text-foreground">Enable Multi-Factor Authentication</p>
                        <p className="text-[10px] text-muted-foreground/50 mt-0.5">Add an extra layer of protection to your account</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                    </button>
                  )}
                  {totalSessions > 3 && (
                    <button onClick={() => setTab("sessions")} className="w-full flex items-center gap-3 rounded-xl border border-border/20 bg-card/10 px-4 py-3 text-left transition-colors hover:bg-foreground/5">
                      <Monitor className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-light text-foreground">Review Active Sessions ({totalSessions})</p>
                        <p className="text-[10px] text-muted-foreground/50 mt-0.5">You have multiple active sessions — review for unauthorized access</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                    </button>
                  )}
                  {mfaEnabled && totalSessions <= 3 && failedLogins === 0 && (
                    <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                      <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                      <p className="text-xs font-light text-foreground">Your account security is in good standing</p>
                    </div>
                  )}
                </div>
              </div>

              {activity.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-light tracking-wider text-muted-foreground/60 uppercase">Recent Activity</h3>
                    <button onClick={() => setTab("activity")} className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                      View All
                    </button>
                  </div>
                  <div className="space-y-1">
                    {activity.slice(0, 5).map(a => {
                      const Icon = eventIcon(a.event_type, a.outcome);
                      return (
                        <div key={a.id} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-card/10">
                          <Icon className={`h-3.5 w-3.5 shrink-0 ${a.outcome === "failure" ? "text-red-400" : "text-muted-foreground/50"}`} />
                          <span className="flex-1 text-[11px] font-light text-foreground/80 truncate">{a.description}</span>
                          <span className="text-[10px] text-muted-foreground/40 whitespace-nowrap">
                            {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "items" && <VaultItemsPanel mode="items" />}

          {tab === "watchtower" && <VaultItemsPanel mode="watchtower" />}


          {tab === "sessions" && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-extralight tracking-wide text-foreground">Active Sessions</h2>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">{sessions.length} session{sessions.length !== 1 ? "s" : ""} detected</p>
                </div>
                {sessions.filter(s => !s.is_current).length > 0 && (
                  <button
                    onClick={revokeAllOther}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-light text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Revoke All Others
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {sessions.length === 0 && (
                  <p className="text-xs text-muted-foreground/40 text-center py-8">No session data recorded yet. Sessions will appear as they are logged.</p>
                )}
                {sessions.map(s => {
                  const DevIcon = deviceIcon(s.device_type);
                  const locationParts = [s.city, s.region, s.country].filter(Boolean);
                  return (
                    <div key={s.id} className={`rounded-xl border px-4 py-3 transition-all ${
                      s.is_current ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/20 bg-card/10"
                    }`}>
                      <div className="flex items-start gap-3">
                        <DevIcon className="h-5 w-5 text-muted-foreground/50 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-light text-foreground">{s.browser} on {s.os}</span>
                            {s.is_current && (
                              <span className="text-[9px] tracking-wider uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">This Device</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground/50">
                            {s.ip_address && (
                              <span className="font-mono">{s.ip_address}</span>
                            )}
                            {locationParts.length > 0 && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {locationParts.join(", ")}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground/40">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Last active {formatDistanceToNow(new Date(s.last_active_at), { addSuffix: true })}
                            </span>
                            <span>Created {format(new Date(s.created_at), "MMM d, yyyy HH:mm")}</span>
                          </div>
                        </div>
                        {!s.is_current && (
                          <button
                            onClick={() => revokeSession(s.id)}
                            className="p-2 rounded-lg text-muted-foreground/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Revoke session"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === "activity" && (
            <>
              <div>
                <h2 className="text-sm font-extralight tracking-wide text-foreground">Audit Trail</h2>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">Chronological record of security-relevant account events</p>
              </div>

              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                {["all", "login", "failed_login", "password_change", "mfa_setup", "mfa_disable", "session_revoke", "security_review"].map(f => (
                  <button
                    key={f}
                    onClick={() => setActivityFilter(f)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-light tracking-wide whitespace-nowrap transition-colors ${
                      activityFilter === f
                        ? "bg-foreground/10 text-foreground"
                        : "text-muted-foreground/40 hover:text-muted-foreground"
                    }`}
                  >
                    {f === "all" ? "All" : f.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                  </button>
                ))}
              </div>

              <div className="space-y-1">
                {filteredActivity.length === 0 && (
                  <p className="text-xs text-muted-foreground/40 text-center py-8">No activity recorded yet.</p>
                )}
                {filteredActivity.map(a => {
                  const Icon = eventIcon(a.event_type, a.outcome);
                  return (
                    <div key={a.id} className="flex items-start gap-3 rounded-xl border border-border/10 bg-card/10 px-4 py-3">
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${a.outcome === "failure" ? "text-red-400" : "text-muted-foreground/50"}`} />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-light text-foreground">{a.description}</span>
                          <span className={`text-[9px] tracking-wider uppercase px-1.5 py-0.5 rounded ${
                            a.outcome === "success" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                          }`}>
                            {a.outcome}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground/40">
                          <span>{format(new Date(a.created_at), "MMM d, yyyy HH:mm:ss")}</span>
                          {a.ip_address && <span className="font-mono">{a.ip_address}</span>}
                          {a.location && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{a.location}</span>}
                          {a.device_info && <span>{a.device_info}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === "mfa" && (
            <>
              <div>
                <h2 className="text-sm font-extralight tracking-wide text-foreground">Multi-Factor Authentication</h2>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                  Once a factor is verified, sign-in stops at the challenge screen — the dashboard does not open until the code is accepted, and password change, data export, account deletion and provider-key writes ask again.
                </p>
              </div>

              <div className="rounded-xl border border-border/20 bg-card/10 px-4 py-3">
                <p className="text-[10px] font-light text-muted-foreground/70">
                  Authenticator app (TOTP) is the second factor this account supports today. Passkeys and hardware security keys are not enabled on this platform — nothing here pretends otherwise.
                </p>
              </div>


              {mfaFactors.filter((f: any) => f.status === "verified").length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-light tracking-wider text-muted-foreground/60 uppercase">Active Factors</h3>
                  {mfaFactors.filter((f: any) => f.status === "verified").map((f: any) => (
                    <div key={f.id} className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                      <Fingerprint className="h-4 w-4 text-emerald-400" />
                      <div className="flex-1">
                        <p className="text-xs font-light text-foreground">Authenticator App (TOTP)</p>
                        <p className="text-[10px] text-muted-foreground/50">Added {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}</p>
                      </div>
                      <button
                        onClick={() => unenrollFactor(f.id)}
                        disabled={mfaLoading}
                        className="px-3 py-1.5 rounded-lg text-[11px] text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {!enrollingTotp && mfaFactors.filter((f: any) => f.status === "verified").length === 0 && (
                <div className="rounded-xl border border-border/20 bg-card/10 p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-foreground/5">
                      <Fingerprint className="h-5 w-5 text-foreground/60" />
                    </div>
                    <div>
                      <h3 className="text-xs font-light text-foreground">Authenticator App</h3>
                      <p className="text-[10px] text-muted-foreground/50">Use Google Authenticator, Authy, or similar</p>
                    </div>
                  </div>
                  <button
                    onClick={startTotpEnroll}
                    disabled={mfaLoading}
                    className="w-full py-2.5 rounded-xl bg-foreground/10 text-xs font-light text-foreground hover:bg-foreground/15 transition-colors disabled:opacity-50"
                  >
                    {mfaLoading ? "Setting up..." : "Setup Authenticator"}
                  </button>
                </div>
              )}

              {enrollingTotp && totpSecret && (
                <div className="rounded-xl border border-border/20 bg-card/10 p-5 space-y-4">
                  <h3 className="text-xs font-light text-foreground">Setup Authenticator App</h3>
                  <p className="text-[10px] text-muted-foreground/50">
                    Scan the QR code below with your authenticator app, or manually enter the secret key.
                  </p>

                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="w-48 h-48 rounded-xl border border-border/20 bg-white flex items-center justify-center">
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(totpUri || "")}`} alt="TOTP QR Code" className="rounded" />
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-[11px] font-mono text-muted-foreground bg-foreground/5 px-3 py-1.5 rounded-lg select-all">
                        {totpSecret}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(totpSecret);
                          setCopiedSecret(true);
                          setTimeout(() => setCopiedSecret(false), 2000);
                        }}
                        className="p-1.5 rounded-lg hover:bg-foreground/10 transition-colors"
                      >
                        {copiedSecret ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground/50" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-light tracking-wider text-muted-foreground/60 uppercase">Enter 6-digit code from your app</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={totpVerifyCode}
                      onChange={e => setTotpVerifyCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="000000"
                      className="w-full px-4 py-2.5 rounded-xl border border-border/20 bg-background/50 text-foreground text-center text-lg font-mono tracking-[0.5em] placeholder:text-muted-foreground/20 outline-none focus:border-foreground/30"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        // Abandoning setup must not leave a half-enrolled row
                        // behind: that row is what used to raise a second-factor
                        // wall at the next login with nothing to verify.
                        if (enrolledFactorId) {
                          void supabase.auth.mfa.unenroll({ factorId: enrolledFactorId }).catch(() => undefined);
                        }
                        setEnrolledFactorId(null);
                        setEnrollingTotp(false); setTotpUri(null); setTotpSecret(null); setTotpVerifyCode("");
                      }}
                      className="flex-1 py-2.5 rounded-xl border border-border/20 text-xs font-light text-muted-foreground hover:bg-foreground/5 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={verifyTotpEnroll}
                      disabled={mfaLoading || totpVerifyCode.length !== 6}
                      className="flex-1 py-2.5 rounded-xl bg-foreground/10 text-xs font-light text-foreground hover:bg-foreground/15 transition-colors disabled:opacity-50"
                    >
                      {mfaLoading ? "Verifying..." : "Verify & Enable"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "password" && (
            <>
              <div>
                <h2 className="text-sm font-extralight tracking-wide text-foreground">Password Management</h2>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">Update your password — minimum 12 characters with mixed types</p>
              </div>

              <div className="rounded-xl border border-border/20 bg-card/10 p-5 space-y-4 max-w-md">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-light tracking-wider text-muted-foreground/60 uppercase">New Password</label>
                  <div className="relative">
                    <input
                      type={showPasswords.new_ ? "text" : "password"}
                      value={passwordForm.new_}
                      onChange={e => setPasswordForm(p => ({ ...p, new_: e.target.value }))}
                      className="w-full px-4 py-2.5 pr-10 rounded-xl border border-border/20 bg-background/50 text-foreground text-xs outline-none focus:border-foreground/30"
                      placeholder="Enter new password"
                    />
                    <button onClick={() => setShowPasswords(p => ({ ...p, new_: !p.new_ }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/30 hover:text-muted-foreground">
                      {showPasswords.new_ ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordForm.new_ && (
                    <div className="space-y-1">
                      <div className="flex gap-1">
                        {[0, 1, 2, 3, 4].map(i => (
                          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < passwordStrength ? strengthColor : "bg-foreground/10"}`} />
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground/50">{strengthLabel}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-light tracking-wider text-muted-foreground/60 uppercase">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showPasswords.confirm ? "text" : "password"}
                      value={passwordForm.confirm}
                      onChange={e => setPasswordForm(p => ({ ...p, confirm: e.target.value }))}
                      className="w-full px-4 py-2.5 pr-10 rounded-xl border border-border/20 bg-background/50 text-foreground text-xs outline-none focus:border-foreground/30"
                      placeholder="Confirm new password"
                    />
                    <button onClick={() => setShowPasswords(p => ({ ...p, confirm: !p.confirm }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/30 hover:text-muted-foreground">
                      {showPasswords.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordForm.confirm && passwordForm.new_ !== passwordForm.confirm && (
                    <p className="text-[10px] text-red-400">Passwords do not match</p>
                  )}
                </div>

                <button
                  onClick={changePassword}
                  disabled={passwordLoading || !passwordForm.new_ || passwordForm.new_ !== passwordForm.confirm || passwordStrength < 4}
                  className="w-full py-2.5 rounded-xl bg-foreground/10 text-xs font-light text-foreground hover:bg-foreground/15 transition-colors disabled:opacity-50"
                >
                  {passwordLoading ? "Updating..." : "Update Password"}
                </button>

                <div className="border-t border-border/10 pt-3 space-y-1.5">
                  <h4 className="text-[10px] font-light tracking-wider text-muted-foreground/60 uppercase">Requirements</h4>
                  <div className="space-y-1">
                    {[
                      { check: passwordForm.new_.length >= 12, label: "At least 12 characters" },
                      { check: /[A-Z]/.test(passwordForm.new_), label: "One uppercase letter" },
                      { check: /[a-z]/.test(passwordForm.new_), label: "One lowercase letter" },
                      { check: /[0-9]/.test(passwordForm.new_), label: "One number" },
                      { check: /[^A-Za-z0-9]/.test(passwordForm.new_), label: "One special character" },
                    ].map((req, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px]">
                        {req.check
                          ? <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                          : <XCircle className="h-3 w-3 text-muted-foreground/20" />
                        }
                        <span className={req.check ? "text-muted-foreground/60" : "text-muted-foreground/30"}>{req.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === "alerts" && (
            <>
              <div>
                <h2 className="text-sm font-extralight tracking-wide text-foreground">Security Notifications</h2>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">Choose which security events trigger alerts</p>
              </div>

              <div className="space-y-3 max-w-md">
                <h3 className="text-xs font-light tracking-wider text-muted-foreground/60 uppercase">Events</h3>
                {([
                  { key: "new_device_login", label: "New Device / Location Login", desc: "Alert when your account is accessed from an unrecognized device or location" },
                  { key: "failed_login_attempts", label: "Failed Login Attempts", desc: "Alert after multiple failed password attempts" },
                  { key: "password_change", label: "Password Changed", desc: "Confirm when your password is successfully updated" },
                  { key: "mfa_change", label: "MFA Setup / Removal", desc: "Alert when multi-factor authentication is modified" },
                  { key: "session_revocation", label: "Session Revoked", desc: "Alert when an active session is terminated" },
                  { key: "recovery_code_usage", label: "Recovery Code Used", desc: "Alert when a recovery code is consumed" },
                ] as { key: keyof NotifPrefs; label: string; desc: string }[]).map(item => (
                  <div key={item.key} className="flex items-start gap-3 rounded-xl border border-border/20 bg-card/10 px-4 py-3">
                    <button
                      onClick={() => saveNotifPrefs({ ...notifPrefs, [item.key]: !notifPrefs[item.key] })}
                      className={`mt-0.5 w-8 h-4 rounded-full transition-colors flex-shrink-0 relative ${
                        notifPrefs[item.key] ? "bg-emerald-500/40" : "bg-foreground/10"
                      }`}
                    >
                      <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${
                        notifPrefs[item.key] ? "left-4 bg-emerald-400" : "left-0.5 bg-muted-foreground/30"
                      }`} />
                    </button>
                    <div>
                      <p className="text-xs font-light text-foreground">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground/40 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}

                <div className="border-t border-border/10 pt-3 space-y-2">
                  <h3 className="text-xs font-light tracking-wider text-muted-foreground/60 uppercase">Channels</h3>
                  {([
                    { key: "notify_email", label: "Email Notifications", icon: Globe },
                    { key: "notify_push", label: "Device Notifications (laptop & phone)", icon: Monitor },
                    // No SMS sender is wired to this account, so the toggle is
                    // not offered — a switch that changes nothing is a lie.

                  ] as { key: keyof NotifPrefs; label: string; icon: React.ElementType }[]).map(ch => (
                    <div key={ch.key} className="flex items-center gap-3 rounded-xl border border-border/20 bg-card/10 px-4 py-3">
                      <button
                        onClick={() => saveNotifPrefs({ ...notifPrefs, [ch.key]: !notifPrefs[ch.key] })}
                        aria-pressed={notifPrefs[ch.key]}
                        aria-label={`${notifPrefs[ch.key] ? "Disable" : "Enable"} ${ch.label}`}
                        className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          notifPrefs[ch.key] ? "bg-emerald-500/40" : "bg-foreground/10"
                        }`}
                      >
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${
                          notifPrefs[ch.key] ? "left-4 bg-emerald-400" : "left-0.5 bg-muted-foreground/30"
                        }`} />
                      </button>
                      <ch.icon className="h-4 w-4 text-muted-foreground/50" />
                      <span className="text-xs font-light text-foreground">{ch.label}</span>
                    </div>
                  ))}
                </div>

                {/* ── Device enrolment ──────────────────────────────────────
                    A channel switch is only a wish: the alert cannot land
                    until this browser has granted permission and registered
                    an endpoint. This block shows the real state of that. */}
                <div className="border-t border-border/10 pt-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xs font-light tracking-wider text-muted-foreground/60 uppercase">Alert Devices</h3>
                    <button
                      onClick={testDeviceAlerts}
                      disabled={pushBusy || devices.length === 0}
                      className="text-[10px] font-light tracking-wide px-2.5 py-1 rounded-lg border border-border/30 text-muted-foreground/70 hover:text-foreground hover:border-border/60 transition-colors disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Send test alert
                    </button>
                  </div>

                  <div className="rounded-xl border border-border/20 bg-card/10 px-4 py-3 space-y-2">
                    <div className="flex items-center gap-3">
                      {pushStatus.state === "enabled"
                        ? <Bell className="h-4 w-4 text-emerald-400/70" />
                        : <BellOff className="h-4 w-4 text-muted-foreground/40" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-light text-foreground">This device</p>
                        <p className="text-[10px] text-muted-foreground/40 mt-0.5" aria-live="polite">
                          {pushStatus.state === "enabled"
                            ? "Registered — security alerts will appear here even with Asherin closed."
                            : pushStatus.reason ?? "Not registered. Enable to receive alerts on this device."}
                        </p>
                      </div>
                      <button
                        onClick={toggleDeviceAlerts}
                        disabled={pushBusy || pushStatus.state === "unsupported"}
                        className="text-[10px] font-light tracking-wide px-3 py-1.5 rounded-lg border border-border/30 text-foreground hover:border-border/60 transition-colors disabled:opacity-30 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {pushBusy ? "Working…" : pushStatus.state === "enabled" ? "Turn off" : "Enable"}
                      </button>
                    </div>
                  </div>

                  {devices.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground/30 px-1">
                      No devices registered yet. Enable alerts on each laptop and phone you want notified.
                    </p>
                  ) : devices.map(d => (
                    <div key={d.id} className="flex items-center gap-3 rounded-xl border border-border/15 bg-card/5 px-4 py-2.5">
                      {d.platform === "iOS" || d.platform === "Android"
                        ? <Smartphone className="h-3.5 w-3.5 text-muted-foreground/40" />
                        : <Monitor className="h-3.5 w-3.5 text-muted-foreground/40" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-light text-foreground truncate">{d.label ?? "Registered device"}</p>
                        <p className="text-[10px] text-muted-foreground/35">
                          Added {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                          {pushStatus.endpoint === d.endpoint ? " · this device" : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => forgetDevice(d.endpoint)}
                        aria-label={`Remove ${d.label ?? "device"} from alerts`}
                        className="text-muted-foreground/30 hover:text-destructive transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default GuardianVaultView;
