import { useState, useEffect, useRef } from "react";
import { User, Shield, Palette, Loader2, Camera, Download, Trash2, AlertTriangle, FileText, ImageIcon, Check, Keyboard, GitBranch, X, Upload, Lock, Plus, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStepUp } from "@/components/auth/StepUpProvider";

import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { useGitHub } from "@/hooks/useGitHub";
import AIKeysSettings from "./AIKeysSettings";
import GoogleAccountsSettings from "./settings/GoogleAccountsSettings";
import IntelligenceSettings from "./settings/IntelligenceSettings";
import UsageSettings from "./settings/UsageSettings";

import { isAdminEmail } from "@/lib/adminEmail";
import { validateDisplayName } from "@/lib/auth/blockedNames";
import { ALL_WALLPAPERS } from "@/lib/wallpapers";
import DashboardAppearanceControls from "./settings/DashboardAppearanceControls";
import MotionControls from "./settings/MotionControls";
import {
  DASHBOARD_UI_EVENT,
  readDashboardUi,
  writeDashboardUi,
  type DashboardUi,
} from "@/lib/dashboardUi";
import {
  APPEARANCE_EVENT,
  readAppearance,
  writeAppearance,
  type DashboardAppearance,
} from "@/lib/dashboardAppearance";
import { useIsV2 } from "@/lib/dashboardUiContext";
import { V2Action, v2ActionClass } from "@/components/dashboard/v2/V2PageShell";

const WALLPAPERS = ALL_WALLPAPERS;

const GitHubSettings = () => {
  const { connection, loading, isConnected, connect, disconnect } = useGitHub();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [token, setToken] = useState("");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    if (!token || !owner || !repo) return;
    setConnecting(true);
    try {
      await connect(token, owner, repo, branch);
      setShowForm(false);
      setToken("");
      toast({ title: "GitHub connected", description: `${owner}/${repo}` });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    await disconnect();
    toast({ title: "GitHub disconnected" });
  };

  return (
    <div className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-5 space-y-4">
      <div className="flex items-center gap-3">
        <GitBranch className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-sm font-light text-foreground">GitHub</h3>
        {isConnected && <span className="text-[10px] text-emerald-500 flex items-center gap-1 ml-auto"><Check className="h-3 w-3" /> Connected</span>}
      </div>

      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />
      ) : isConnected ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-border/15 bg-card/10 p-3 space-y-1">
            <p className="text-xs font-light text-foreground">{connection?.repo_owner}/{connection?.repo_name}</p>
            <p className="text-[10px] text-muted-foreground/50">Branch: {connection?.branch}</p>
            {connection?.last_sync_at && <p className="text-[10px] text-muted-foreground/40">Last sync: {new Date(connection.last_sync_at).toLocaleString()}</p>}
          </div>
          <button onClick={handleDisconnect} className="inline-flex items-center gap-2 rounded-lg border border-destructive/20 px-3 py-1.5 text-xs font-light text-destructive hover:bg-destructive/10 transition-colors">
            <X className="h-3 w-3" /> Disconnect
          </button>
        </div>
      ) : !showForm ? (
        <div className="space-y-2">
          <p className="text-xs font-extralight text-muted-foreground leading-relaxed">Connect a GitHub repository to import and export code from the IDE.</p>
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-lg border border-border/20 bg-foreground/5 px-4 py-2 text-xs font-light text-foreground hover:bg-foreground/10 transition-colors">
            <GitBranch className="h-3.5 w-3.5" /> Connect GitHub
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <input value={token} onChange={e => setToken(e.target.value)} placeholder="Personal Access Token" type="password" className="w-full bg-background/50 border border-border/20 rounded-lg px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/40" />
          <div className="flex gap-2">
            <input value={owner} onChange={e => setOwner(e.target.value)} placeholder="Owner" className="flex-1 bg-background/50 border border-border/20 rounded-lg px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/40" />
            <input value={repo} onChange={e => setRepo(e.target.value)} placeholder="Repo name" className="flex-1 bg-background/50 border border-border/20 rounded-lg px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/40" />
          </div>
          <input value={branch} onChange={e => setBranch(e.target.value)} placeholder="Branch (main)" className="w-full bg-background/50 border border-border/20 rounded-lg px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/40" />
          <p className="text-[10px] text-muted-foreground/40">Create a Fine-grained PAT at github.com → Settings → Developer settings → Personal access tokens. Grant "Contents" read/write.</p>
          <div className="flex gap-2">
            <button onClick={handleConnect} disabled={!token || !owner || !repo || connecting} className="inline-flex items-center gap-2 rounded-lg bg-foreground/10 px-4 py-2 text-xs font-light text-foreground hover:bg-foreground/15 transition-colors disabled:opacity-30">
              {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Connect
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-border/20 px-4 py-2 text-xs font-light text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

const SETTINGS_TABS = [
  { key: "you", label: "you" },
  { key: "look", label: "look" },
  { key: "intelligence", label: "intelligence" },
  { key: "spend", label: "spend" },
  { key: "connections", label: "connections" },
  { key: "privacy", label: "privacy & data" },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]["key"];

const SettingsView = () => {
  const [tab, setTab] = useState<SettingsTab>("you");
  const v2 = useIsV2();

  const { user } = useAuth();
  const stepUp = useStepUp();

  const { toast } = useToast();
  const [settings, setSettings] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const [customWallpapers, setCustomWallpapers] = useState<{ name: string; url: string }[]>([]);
  const [uploadingWallpaper, setUploadingWallpaper] = useState(false);
  const [hasWallpaperAddon, setHasWallpaperAddon] = useState(false);
  const [appearance, setAppearance] = useState<DashboardAppearance>(() => readAppearance());
  const [dashboardUi, setDashboardUi] = useState<DashboardUi>(() => readDashboardUi());

  // Another surface (or another tab) may change appearance; stay in step.
  useEffect(() => {
    const sync = () => {
      setAppearance(readAppearance());
      setDashboardUi(readDashboardUi());
    };
    window.addEventListener(APPEARANCE_EVENT, sync);
    window.addEventListener(DASHBOARD_UI_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(APPEARANCE_EVENT, sync);
      window.removeEventListener(DASHBOARD_UI_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // One writer: local storage + live broadcast, then the account row so the
  // next device opens on the same surface. Colour mode is free.
  const applyAppearance = (patch: Partial<DashboardAppearance>) => {
    const next = writeAppearance(patch);
    setAppearance(next);
    if (user) {
      supabase
        .from("user_settings")
        .update({ dashboard_bg_mode: next.mode, dashboard_bg_color: next.color })
        .eq("user_id", user.id)
        .then(({ error }) => {
          if (error) console.warn("appearance persist failed", error.message);
        });
    }
  };

  // Same one-writer contract as appearance: local + broadcast first so the
  // chrome swaps instantly, then the account row for the next device.
  const applyDashboardUi = (next: DashboardUi) => {
    setDashboardUi(writeDashboardUi(next));
    if (user) {
      supabase
        .from("user_settings")
        .update({ dashboard_ui: next })
        .eq("user_id", user.id)
        .then(({ error }) => {
          if (error) console.warn("layout persist failed", error.message);
        });
    }
  };

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    ]).then(([settingsRes, profileRes]) => {
      setSettings(settingsRes.data);
      setProfile(profileRes.data);
      setDisplayName(profileRes.data?.display_name ?? user.user_metadata?.name ?? "");
      setAvatarUrl(profileRes.data?.avatar_url ?? null);
      setLoading(false);
    });

    // Load custom wallpapers
    loadCustomWallpapers();
    // Check wallpaper addon status (simplified: check user_subscriptions or granted_subscriptions for addon)
    checkWallpaperAddon();
  }, [user]);

  const loadCustomWallpapers = async () => {
    if (!user) return;
    const { data } = await supabase.storage.from("custom-wallpapers").list(user.id, { limit: 20 });
    if (data && data.length > 0) {
      const wps = await Promise.all(
        data
          .filter((f) => f.name !== ".emptyFolderPlaceholder")
          .map(async (f) => {
            const path = `${user.id}/${f.name}`;
            const { data: urlData } = await supabase.storage
              .from("custom-wallpapers")
              .createSignedUrl(path, 3600);
            return { name: f.name, url: urlData?.signedUrl || "" };
          }),
      );
      setCustomWallpapers(wps);
    }
  };

  const checkWallpaperAddon = async () => {
    // Custom wallpapers are free for every account. Kept as a no-op so the
    // old browser flag (which was spoofable anyway) no longer decides anything.
    setHasWallpaperAddon(true);
    try {
      localStorage.removeItem("aureon_wallpaper_addon");
    } catch {
      /* storage refusal must not break settings */
    }
  };

  const uploadCustomWallpaper = async (file: File) => {
    if (!user) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 10MB", variant: "destructive" });
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Only image files are allowed.", variant: "destructive" });
      return;
    }
    setUploadingWallpaper(true);
    const ext = file.name.split(".").pop();
    const fileName = `${Date.now()}.${ext}`;
    const path = `${user.id}/${fileName}`;
    const { error } = await supabase.storage.from("custom-wallpapers").upload(path, file, { upsert: false });
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } else {
      const { data: urlData } = await supabase.storage
        .from("custom-wallpapers")
        .createSignedUrl(path, 3600);
      setCustomWallpapers(prev => [...prev, { name: fileName, url: urlData?.signedUrl || "" }]);
      toast({ title: "Wallpaper uploaded", description: "You can now select it as your wallpaper." });
    }
    setUploadingWallpaper(false);
  };

  const deleteCustomWallpaper = async (fileName: string) => {
    if (!user) return;
    await supabase.storage.from("custom-wallpapers").remove([`${user.id}/${fileName}`]);
    setCustomWallpapers(prev => prev.filter(w => w.name !== fileName));
    toast({ title: "Wallpaper removed" });
  };

  const selectCustomWallpaper = (url: string) => {
    localStorage.setItem("aureon_wallpaper", "custom");
    localStorage.setItem("aureon_custom_wallpaper_url", url);
    localStorage.setItem("aureon_landing_wallpaper", "custom");
    window.dispatchEvent(new Event("aureon-wallpaper-change"));
    window.dispatchEvent(new Event("wallpaper-change"));
    applyAppearance({ mode: "wallpaper" });
    toast({ title: "Custom wallpaper applied" });
  };

  const updateSetting = async (key: string, value: any) => {
    if (!user) return;
    const { error } = await supabase.from("user_settings").update({ [key]: value }).eq("user_id", user.id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    setSettings((prev: any) => ({ ...prev, [key]: value }));
    toast({ title: "Setting updated" });
  };

  const saveProfile = async () => {
    if (!user || !displayName.trim()) return;
    // Advisory check; public.tg_guard_display_name rejects the write regardless.
    const nameCheck = validateDisplayName(displayName);
    if (nameCheck.ok === false) {
      toast({ title: "Choose a different name", description: nameCheck.reason, variant: "destructive" });
      return;
    }
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim(), updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
    setSavingProfile(false);
    if (error) {
      const reserved = error.message.includes("reserved_display_name");
      toast({
        title: reserved ? "Choose a different name" : "Save failed",
        description: reserved ? "That name is reserved. Please choose another." : error.message,
        variant: "destructive",
      });
    } else {
      setProfile((prev: any) => ({ ...prev, display_name: displayName.trim() }));
      toast({ title: "Profile saved", description: "Your display name has been updated." });
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    setUploadingAvatar(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;
    await supabase.storage.from("avatars").remove([path]);
    const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (uploadErr) {
      toast({ title: "Upload failed", description: uploadErr.message, variant: "destructive" });
      setUploadingAvatar(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
    const { error: updateErr } = await supabase.from("profiles").update({ avatar_url: publicUrl, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    if (updateErr) {
      toast({ title: "Profile update failed", description: updateErr.message, variant: "destructive" });
    } else {
      setAvatarUrl(publicUrl);
      toast({ title: "Profile picture updated" });
    }
    setUploadingAvatar(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "File too large", description: "Max 5MB", variant: "destructive" });
        return;
      }
      uploadAvatar(file);
    }
    e.target.value = "";
  };

  const handleExportData = async () => {
    if (!user) return;
    // The export bundle is the whole account in one file — prove identity now,
    // not "at some point during this session".
    if (!(await stepUp("export your data"))) return;
    setExporting(true);

    try {
      const { buildExportBundle } = await import("@/lib/local/exportData");
      const blob = await buildExportBundle();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aureon-data-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Data exported successfully" });
    } catch {
      toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
    }
    setExporting(false);
  };

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirmText !== "DELETE MY ACCOUNT") return;
    // Irreversible. The typed phrase proves intent; step-up proves identity.
    if (!(await stepUp("delete this account"))) return;
    setDeleting(true);

    try {
      const { wipeEverything } = await import("@/lib/local/exportData");
      await wipeEverything();
      window.location.href = "/";
    } catch {
      toast({ title: "Deletion failed", description: "Please try again.", variant: "destructive" });
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {!v2 && (
          <div>
            <h2 className="text-xl font-extralight tracking-wide text-foreground">Settings</h2>
            <p className="text-sm font-extralight text-muted-foreground mt-1">Configure your asherin experience.</p>
          </div>
        )}

        <nav className="flex flex-wrap gap-1.5 rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-1.5" aria-label="settings sections">
          {SETTINGS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-light lowercase transition-colors ${
                tab === t.key
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Profile */}
        {tab === "you" && (
        <div className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-5 space-y-4">

          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-sm font-light text-foreground">Profile</h3>
          </div>
          <div className="space-y-4">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar} className="relative group shrink-0">
                <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-border/30 bg-card/30">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/50">
                      <User className="h-7 w-7" />
                    </div>
                  )}
                </div>
                <div className="absolute inset-0 rounded-2xl bg-background/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {uploadingAvatar ? <Loader2 className="h-5 w-5 animate-spin text-foreground" /> : <Camera className="h-5 w-5 text-foreground" />}
                </div>
              </button>
              <div>
                <p className="text-xs font-light text-foreground">Profile Picture</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">Click to upload · Max 5MB</p>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Display Name</label>
              <div className="flex gap-2 mt-1">
                <input 
                  value={displayName} 
                  onChange={(e) => setDisplayName(e.target.value)} 
                  onKeyDown={(e) => e.key === "Enter" && saveProfile()}
                  className="flex-1 bg-background/50 border border-border/20 rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/30 transition-colors" 
                />
                <button 
                  onClick={saveProfile} 
                  disabled={savingProfile || !displayName.trim()}
                  className="text-xs bg-foreground text-background px-3 py-2 rounded-lg hover:bg-foreground/90 transition-colors disabled:opacity-50"
                >
                  {savingProfile ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Email</label>
              <p className="text-sm text-foreground/70 mt-1">{user?.email}</p>
            </div>
          </div>
        </div>
        )}


        {/* Wallpaper */}
        {tab === "look" && (
        <div className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-5 space-y-4">

          <div className="flex items-center gap-3">
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-sm font-light text-foreground">Dashboard appearance</h3>
          </div>

          <DashboardAppearanceControls
            appearance={appearance}
            onChange={applyAppearance}
            ui={dashboardUi}
            onUiChange={applyDashboardUi}
            wallpaperLabel={
              WALLPAPERS.find((w) => w.key === (localStorage.getItem("aureon_wallpaper") || "aureon"))?.label ?? "photo"
            }
          />

          <div className={`grid grid-cols-3 gap-3 ${appearance.mode === "color" ? "hidden" : ""}`}>
            {WALLPAPERS.map((wp) => {
              const active = (localStorage.getItem("aureon_wallpaper") || "default") === wp.key;
              return (
                <button
                  key={wp.key}
                  onClick={() => {
                    localStorage.setItem("aureon_wallpaper", wp.key);
                    window.dispatchEvent(new Event("aureon-wallpaper-change"));
                    // Picking a photo is itself the exit from colour mode.
                    applyAppearance({ mode: "wallpaper" });
                    // Persist to DB
                    if (user) {
                      supabase.from("user_settings").update({ wallpaper: wp.key }).eq("user_id", user.id).then();
                    }
                    toast({ title: "Wallpaper updated", description: wp.label });
                  }}
                  className={`relative rounded-xl overflow-hidden border-2 transition-all aspect-video group ${
                    active ? "border-foreground/50 ring-1 ring-foreground/20" : "border-border/20 hover:border-foreground/30"
                  }`}
                >
                  <img src={wp.src} alt={wp.label} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-background/60" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                    {active && <Check className="h-4 w-4 text-foreground" />}
                    <span className="text-[10px] font-light text-foreground">{wp.label}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Custom Wallpapers */}
          <div className={`mt-4 pt-4 border-t border-border/15 space-y-3 ${appearance.mode === "color" ? "hidden" : ""}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="h-3.5 w-3.5 text-muted-foreground/60" />
                <span className="text-xs font-light text-foreground">Custom Wallpapers</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-foreground/[0.06] text-muted-foreground/60 border border-border/20">included</span>
              </div>
            </div>

            {(
              <>
                <div className="grid grid-cols-3 gap-3">
                  {customWallpapers.map((wp) => {
                    const isActive = localStorage.getItem("aureon_wallpaper") === "custom" && localStorage.getItem("aureon_custom_wallpaper_url") === wp.url;
                    return (
                      <div key={wp.name} className="relative group">
                        <button
                          onClick={() => selectCustomWallpaper(wp.url)}
                          className={`relative rounded-xl overflow-hidden border-2 transition-all aspect-video w-full ${
                            isActive ? "border-foreground/50 ring-1 ring-foreground/20" : "border-border/20 hover:border-foreground/30"
                          }`}
                        >
                          <img src={wp.url} alt="Custom" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-background/40" />
                          {isActive && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Check className="h-4 w-4 text-foreground" />
                            </div>
                          )}
                        </button>
                        <button
                          onClick={() => deleteCustomWallpaper(wp.name)}
                          className="absolute top-1 right-1 rounded-md bg-background/80 p-1 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/20"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                  {/* Upload button */}
                  <button
                    onClick={() => wallpaperInputRef.current?.click()}
                    disabled={uploadingWallpaper}
                    className="rounded-xl border-2 border-dashed border-border/30 aspect-video flex flex-col items-center justify-center gap-1 hover:border-foreground/30 transition-colors"
                  >
                    {uploadingWallpaper ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/50" />
                    ) : (
                      <>
                        <Plus className="h-4 w-4 text-muted-foreground/40" />
                        <span className="text-[9px] text-muted-foreground/40">Upload</span>
                      </>
                    )}
                  </button>
                </div>
                <input
                  ref={wallpaperInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadCustomWallpaper(file);
                    e.target.value = "";
                  }}
                />
                <p className="text-[9px] text-muted-foreground/40">Max 10MB · JPG, PNG, WebP</p>
              </>
            )}
          </div>
        </div>
        )}

        {/* Motion */}
        {tab === "look" && <MotionControls />}


        {/* Send Button Border Color */}
        {tab === "look" && (
        <div className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-5 space-y-4">

          <div className="flex items-center gap-3">
            <Palette className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-sm font-light text-foreground">Send Button Border</h3>
          </div>
          <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider mb-2">Standard</p>
          <div className="grid grid-cols-4 gap-4">
            {([
              { key: "default", label: "Aureon", main: "conic-gradient(from 0deg, hsl(275 95% 43%/0.2), hsl(275 80% 65%), hsl(0 0% 75%/0.7), hsl(275 95% 50%), hsl(0 0% 85%/0.5), hsl(260 70% 60%), hsl(275 95% 43%/0.2))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(0 0% 92%/0.6) 20%, transparent 35%, hsl(275 60% 75%/0.5) 55%, transparent 70%, hsl(0 0% 80%/0.4) 85%, transparent 100%)", glow: "hsl(275 95% 43%)" },
              { key: "gold", label: "Gold", main: "conic-gradient(from 0deg, hsl(43 80% 35%/0.2), hsl(43 90% 55%), hsl(35 95% 70%/0.7), hsl(48 85% 60%), hsl(40 80% 50%/0.5), hsl(43 80% 35%/0.2))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(43 90% 70%/0.6) 20%, transparent 35%, hsl(35 80% 60%/0.5) 55%, transparent 70%, hsl(48 85% 55%/0.4) 85%, transparent 100%)", glow: "hsl(43 90% 50%)" },
              { key: "silver", label: "Silver", main: "conic-gradient(from 0deg, hsl(0 0% 45%/0.2), hsl(0 0% 70%), hsl(0 0% 85%/0.7), hsl(210 5% 65%), hsl(0 0% 55%/0.5), hsl(0 0% 45%/0.2))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(0 0% 92%/0.7) 20%, transparent 35%, hsl(210 5% 75%/0.5) 55%, transparent 70%, hsl(0 0% 80%/0.5) 85%, transparent 100%)", glow: "hsl(0 0% 70%)" },
              { key: "bronze", label: "Bronze", main: "conic-gradient(from 0deg, hsl(25 60% 35%/0.2), hsl(30 70% 50%), hsl(20 65% 60%/0.7), hsl(35 55% 45%), hsl(28 60% 40%/0.5), hsl(25 60% 35%/0.2))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(30 65% 60%/0.6) 20%, transparent 35%, hsl(25 55% 50%/0.5) 55%, transparent 70%, hsl(35 60% 55%/0.4) 85%, transparent 100%)", glow: "hsl(30 70% 45%)" },
              { key: "blue", label: "Sapphire", main: "conic-gradient(from 0deg, hsl(220 90% 40%/0.2), hsl(210 85% 55%), hsl(200 80% 65%/0.7), hsl(225 90% 50%), hsl(215 85% 45%/0.5), hsl(220 90% 40%/0.2))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(210 80% 70%/0.6) 20%, transparent 35%, hsl(220 85% 60%/0.5) 55%, transparent 70%, hsl(200 80% 65%/0.4) 85%, transparent 100%)", glow: "hsl(220 90% 50%)" },
              { key: "neon", label: "Neon", main: "conic-gradient(from 0deg, hsl(150 100% 45%/0.3), hsl(180 100% 50%), hsl(280 100% 60%/0.7), hsl(320 100% 50%), hsl(60 100% 50%/0.5), hsl(150 100% 45%/0.3))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(180 100% 60%/0.6) 20%, transparent 35%, hsl(320 100% 55%/0.5) 55%, transparent 70%, hsl(60 100% 55%/0.4) 85%, transparent 100%)", glow: "hsl(150 100% 50%)" },
              { key: "rose", label: "Rose", main: "conic-gradient(from 0deg, hsl(340 80% 45%/0.2), hsl(350 85% 60%), hsl(330 75% 65%/0.7), hsl(345 90% 55%), hsl(335 80% 50%/0.5), hsl(340 80% 45%/0.2))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(350 80% 70%/0.6) 20%, transparent 35%, hsl(340 75% 60%/0.5) 55%, transparent 70%, hsl(330 80% 65%/0.4) 85%, transparent 100%)", glow: "hsl(345 85% 55%)" },
              { key: "ember", label: "Ember", main: "conic-gradient(from 0deg, hsl(15 90% 40%/0.2), hsl(25 95% 55%), hsl(40 90% 60%/0.7), hsl(10 85% 45%), hsl(0 80% 40%/0.5), hsl(15 90% 40%/0.2))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(25 90% 60%/0.6) 20%, transparent 35%, hsl(10 85% 50%/0.5) 55%, transparent 70%, hsl(40 85% 55%/0.4) 85%, transparent 100%)", glow: "hsl(20 90% 45%)" },
              { key: "ice", label: "Ice", main: "conic-gradient(from 0deg, hsl(195 90% 45%/0.2), hsl(185 85% 60%), hsl(200 80% 70%/0.7), hsl(190 90% 55%), hsl(210 75% 50%/0.5), hsl(195 90% 45%/0.2))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(195 85% 70%/0.6) 20%, transparent 35%, hsl(185 80% 60%/0.5) 55%, transparent 70%, hsl(200 80% 65%/0.4) 85%, transparent 100%)", glow: "hsl(195 90% 50%)" },
              { key: "emerald", label: "Emerald", main: "conic-gradient(from 0deg, hsl(155 80% 30%/0.2), hsl(160 75% 45%), hsl(150 70% 55%/0.7), hsl(165 80% 40%), hsl(145 75% 35%/0.5), hsl(155 80% 30%/0.2))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(160 70% 55%/0.6) 20%, transparent 35%, hsl(150 75% 45%/0.5) 55%, transparent 70%, hsl(155 70% 50%/0.4) 85%, transparent 100%)", glow: "hsl(155 80% 40%)" },
              { key: "phantom", label: "Phantom", main: "conic-gradient(from 0deg, hsl(0 0% 15%/0.3), hsl(0 0% 30%), hsl(0 0% 50%/0.7), hsl(0 0% 25%), hsl(0 0% 40%/0.5), hsl(0 0% 15%/0.3))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(0 0% 50%/0.5) 20%, transparent 35%, hsl(0 0% 35%/0.4) 55%, transparent 70%, hsl(0 0% 45%/0.3) 85%, transparent 100%)", glow: "hsl(0 0% 35%)" },
              { key: "rainbow", label: "Rainbow", main: "conic-gradient(from 0deg, hsl(0 85% 55%), hsl(60 85% 55%), hsl(120 85% 45%), hsl(180 85% 50%), hsl(240 85% 55%), hsl(300 85% 55%), hsl(0 85% 55%))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(60 80% 65%/0.5) 15%, transparent 30%, hsl(180 80% 55%/0.4) 50%, transparent 65%, hsl(300 80% 60%/0.4) 80%, transparent 100%)", glow: "hsl(180 80% 50%)" },
              { key: "crimson", label: "Crimson", main: "conic-gradient(from 0deg, hsl(0 75% 35%/0.2), hsl(355 80% 50%), hsl(5 70% 55%/0.7), hsl(350 85% 45%), hsl(0 75% 40%/0.5), hsl(0 75% 35%/0.2))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(355 75% 60%/0.6) 20%, transparent 35%, hsl(0 70% 50%/0.5) 55%, transparent 70%, hsl(5 75% 55%/0.4) 85%, transparent 100%)", glow: "hsl(355 80% 45%)" },
              { key: "amethyst", label: "Amethyst", main: "conic-gradient(from 0deg, hsl(290 60% 35%/0.2), hsl(285 65% 50%), hsl(295 55% 60%/0.7), hsl(280 70% 45%), hsl(300 60% 40%/0.5), hsl(290 60% 35%/0.2))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(285 60% 60%/0.6) 20%, transparent 35%, hsl(295 55% 50%/0.5) 55%, transparent 70%, hsl(280 65% 55%/0.4) 85%, transparent 100%)", glow: "hsl(285 65% 45%)" },
              { key: "arctic", label: "Arctic", main: "conic-gradient(from 0deg, hsl(210 40% 50%/0.2), hsl(200 50% 65%), hsl(190 45% 75%/0.7), hsl(215 55% 60%), hsl(205 40% 55%/0.5), hsl(210 40% 50%/0.2))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(200 45% 75%/0.6) 20%, transparent 35%, hsl(210 50% 65%/0.5) 55%, transparent 70%, hsl(190 40% 70%/0.4) 85%, transparent 100%)", glow: "hsl(205 50% 60%)" },
              { key: "sunset", label: "Sunset", main: "conic-gradient(from 0deg, hsl(15 85% 45%/0.2), hsl(30 90% 55%), hsl(45 85% 60%/0.7), hsl(350 80% 50%), hsl(10 90% 45%/0.5), hsl(15 85% 45%/0.2))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(30 85% 65%/0.6) 20%, transparent 35%, hsl(350 80% 55%/0.5) 55%, transparent 70%, hsl(45 80% 55%/0.4) 85%, transparent 100%)", glow: "hsl(25 90% 50%)" },
            ] as const).map((c) => {
              const active = (localStorage.getItem("aureon_send_border_color") || "default") === c.key;
              return (
                <button key={c.key} onClick={() => { localStorage.setItem("aureon_send_border_color", c.key); window.dispatchEvent(new Event("aureon-border-color-change")); toast({ title: "Border updated", description: c.label }); }}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all ${active ? "bg-foreground/5 ring-1 ring-foreground/20" : "hover:bg-foreground/[0.03]"}`}
                >
                  <div className="relative rounded-full w-10 h-10 flex items-center justify-center">
                    <span className="absolute inset-0 rounded-full animate-[sendBorderSpin_3s_linear_infinite]" style={{ background: c.main }} />
                    <span className="absolute inset-0 rounded-full animate-[sendBorderSpin_5s_linear_infinite_reverse] opacity-30" style={{ background: c.shimmer }} />
                    <span className="absolute inset-[2px] rounded-full bg-background z-[1]" style={{ boxShadow: `inset 0 1px 4px ${c.glow}14, 0 0 12px ${c.glow}10` }} />
                    <span className="absolute inset-[-3px] rounded-full opacity-60 z-0" style={{ background: `radial-gradient(circle, ${c.glow}26 0%, transparent 70%)` }} />
                    <Send className="h-4 w-4 text-foreground/70 z-[2] relative" />
                  </div>
                  <span className="text-[9px] font-light text-foreground/70">{c.label}</span>
                  {active && <span className="text-[8px] text-accent">Active</span>}
                </button>
              );
            })}
          </div>

          {/* Wallpaper-matched themes */}
          <div className="mt-5 pt-4 border-t border-border/15">
            <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider mb-2">Wallpaper Themes</p>
            <div className="grid grid-cols-4 gap-4">
              {([
                { key: "wp-raven", label: "Raven", main: "conic-gradient(from 0deg, hsl(230 30% 20%/0.3), hsl(225 35% 35%), hsl(220 25% 50%/0.7), hsl(235 30% 30%), hsl(210 25% 40%/0.5), hsl(230 30% 20%/0.3))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(225 30% 45%/0.5) 20%, transparent 35%, hsl(220 25% 40%/0.4) 55%, transparent 70%, hsl(230 30% 50%/0.3) 85%, transparent 100%)", glow: "hsl(225 35% 35%)" },
                { key: "wp-eclipse", label: "Eclipse", main: "conic-gradient(from 0deg, hsl(35 80% 40%/0.2), hsl(25 85% 50%), hsl(45 75% 55%/0.7), hsl(15 80% 45%), hsl(40 70% 40%/0.5), hsl(35 80% 40%/0.2))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(35 80% 60%/0.6) 20%, transparent 35%, hsl(25 75% 50%/0.5) 55%, transparent 70%, hsl(45 70% 55%/0.4) 85%, transparent 100%)", glow: "hsl(30 85% 50%)" },
                { key: "wp-glitch", label: "Glitch", main: "conic-gradient(from 0deg, hsl(160 100% 40%/0.3), hsl(320 100% 50%), hsl(180 90% 50%/0.7), hsl(280 100% 55%), hsl(120 100% 45%/0.5), hsl(160 100% 40%/0.3))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(320 100% 55%/0.6) 20%, transparent 35%, hsl(160 100% 50%/0.5) 55%, transparent 70%, hsl(280 90% 55%/0.4) 85%, transparent 100%)", glow: "hsl(160 100% 45%)" },
                { key: "wp-aureon", label: "Aureon ✦", main: "conic-gradient(from 0deg, hsl(270 90% 40%/0.2), hsl(280 85% 55%), hsl(260 80% 65%/0.7), hsl(275 95% 50%), hsl(290 75% 45%/0.5), hsl(270 90% 40%/0.2))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(280 80% 65%/0.6) 20%, transparent 35%, hsl(260 85% 55%/0.5) 55%, transparent 70%, hsl(275 80% 60%/0.4) 85%, transparent 100%)", glow: "hsl(275 90% 50%)" },
                { key: "wp-seraph", label: "Seraph", main: "conic-gradient(from 0deg, hsl(40 70% 50%/0.2), hsl(45 80% 65%), hsl(35 75% 70%/0.7), hsl(50 85% 60%), hsl(30 70% 55%/0.5), hsl(40 70% 50%/0.2))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(45 75% 70%/0.6) 20%, transparent 35%, hsl(40 80% 60%/0.5) 55%, transparent 70%, hsl(50 75% 65%/0.4) 85%, transparent 100%)", glow: "hsl(45 80% 60%)" },
                { key: "wp-prophet", label: "Prophet", main: "conic-gradient(from 0deg, hsl(210 60% 25%/0.2), hsl(200 55% 40%), hsl(220 50% 50%/0.7), hsl(215 60% 35%), hsl(205 55% 30%/0.5), hsl(210 60% 25%/0.2))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(200 50% 50%/0.5) 20%, transparent 35%, hsl(215 55% 40%/0.4) 55%, transparent 70%, hsl(210 50% 45%/0.3) 85%, transparent 100%)", glow: "hsl(210 60% 35%)" },
                { key: "wp-nexus", label: "Nexus", main: "conic-gradient(from 0deg, hsl(180 70% 35%/0.2), hsl(170 65% 45%), hsl(190 60% 55%/0.7), hsl(175 70% 40%), hsl(185 65% 35%/0.5), hsl(180 70% 35%/0.2))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(175 65% 55%/0.6) 20%, transparent 35%, hsl(180 60% 45%/0.5) 55%, transparent 70%, hsl(185 65% 50%/0.4) 85%, transparent 100%)", glow: "hsl(180 70% 42%)" },
                { key: "wp-sentinel", label: "Sentinel", main: "conic-gradient(from 0deg, hsl(200 75% 30%/0.2), hsl(205 70% 42%), hsl(195 65% 52%/0.7), hsl(210 75% 38%), hsl(200 70% 35%/0.5), hsl(200 75% 30%/0.2))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(205 65% 52%/0.6) 20%, transparent 35%, hsl(195 70% 42%/0.5) 55%, transparent 70%, hsl(210 60% 48%/0.4) 85%, transparent 100%)", glow: "hsl(205 70% 40%)" },
                { key: "wp-inferno", label: "Inferno", main: "conic-gradient(from 0deg, hsl(5 90% 35%/0.2), hsl(15 95% 50%), hsl(30 90% 55%/0.7), hsl(0 85% 40%), hsl(10 90% 45%/0.5), hsl(5 90% 35%/0.2))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(15 90% 55%/0.6) 20%, transparent 35%, hsl(0 85% 45%/0.5) 55%, transparent 70%, hsl(30 85% 50%/0.4) 85%, transparent 100%)", glow: "hsl(10 95% 45%)" },
                { key: "wp-sorrow", label: "Sorrow", main: "conic-gradient(from 0deg, hsl(220 30% 30%/0.2), hsl(215 35% 42%), hsl(225 25% 50%/0.7), hsl(210 30% 38%), hsl(220 25% 35%/0.5), hsl(220 30% 30%/0.2))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(215 30% 50%/0.5) 20%, transparent 35%, hsl(220 25% 42%/0.4) 55%, transparent 70%, hsl(225 30% 48%/0.3) 85%, transparent 100%)", glow: "hsl(215 35% 40%)" },
                { key: "wp-silhouette", label: "Silhouette", main: "conic-gradient(from 0deg, hsl(0 0% 10%/0.3), hsl(0 0% 22%), hsl(0 0% 38%/0.7), hsl(0 0% 18%), hsl(0 0% 28%/0.5), hsl(0 0% 10%/0.3))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(0 0% 40%/0.5) 20%, transparent 35%, hsl(0 0% 28%/0.4) 55%, transparent 70%, hsl(0 0% 35%/0.3) 85%, transparent 100%)", glow: "hsl(0 0% 25%)" },
                { key: "wp-abyss", label: "Abyss", main: "conic-gradient(from 0deg, hsl(240 50% 20%/0.3), hsl(235 55% 30%), hsl(245 45% 40%/0.7), hsl(230 50% 25%), hsl(240 45% 32%/0.5), hsl(240 50% 20%/0.3))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(235 50% 40%/0.5) 20%, transparent 35%, hsl(240 45% 30%/0.4) 55%, transparent 70%, hsl(245 50% 35%/0.3) 85%, transparent 100%)", glow: "hsl(238 55% 30%)" },
              ] as const).map((c) => {
                const active = (localStorage.getItem("aureon_send_border_color") || "default") === c.key;
                return (
                  <button key={c.key} onClick={() => { localStorage.setItem("aureon_send_border_color", c.key); window.dispatchEvent(new Event("aureon-border-color-change")); toast({ title: "Border updated", description: c.label }); }}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all ${active ? "bg-foreground/5 ring-1 ring-foreground/20" : "hover:bg-foreground/[0.03]"}`}
                  >
                    <div className="relative rounded-full w-10 h-10 flex items-center justify-center">
                      <span className="absolute inset-0 rounded-full animate-[sendBorderSpin_3s_linear_infinite]" style={{ background: c.main }} />
                      <span className="absolute inset-0 rounded-full animate-[sendBorderSpin_5s_linear_infinite_reverse] opacity-30" style={{ background: c.shimmer }} />
                      <span className="absolute inset-[2px] rounded-full bg-background z-[1]" style={{ boxShadow: `inset 0 1px 4px ${c.glow}14, 0 0 12px ${c.glow}10` }} />
                      <span className="absolute inset-[-3px] rounded-full opacity-60 z-0" style={{ background: `radial-gradient(circle, ${c.glow}26 0%, transparent 70%)` }} />
                      <Send className="h-4 w-4 text-foreground/70 z-[2] relative" />
                    </div>
                    <span className="text-[9px] font-light text-foreground/70">{c.label}</span>
                    {active && <span className="text-[8px] text-accent">Active</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        )}


        {/* Appearance */}
        {tab === "look" && (
        <div className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-5 space-y-4">

          <div className="flex items-center gap-3">
            <Palette className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-sm font-light text-foreground">Response Preferences</h3>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Response Length</label>
              <div className="flex gap-2 mt-2">
                {["concise", "balanced", "detailed"].map((len) => (
                  <button
                    key={len}
                    onClick={() => updateSetting("response_length", len)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors capitalize ${
                      settings?.response_length === len ? "bg-foreground/10 border-foreground/30 text-foreground" : "border-border/20 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {len}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Send Button Shape */}
          <div className="mt-5 pt-4 border-t border-border/15">
            <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider mb-3">Button Shape</p>
            <div className="flex items-center gap-6">
              {([
                { key: "circle", label: "Circle", radius: "rounded-full" },
                { key: "square", label: "Rounded Square", radius: "rounded-xl" },
              ] as const).map((s) => {
                const activeShape = localStorage.getItem("aureon_send_btn_shape") || "circle";
                const isActive = activeShape === s.key;
                const colorKey = localStorage.getItem("aureon_send_border_color") || "default";
                const themeList = [
                  { key: "default", main: "conic-gradient(from 0deg, hsl(275 95% 43%/0.2), hsl(275 80% 65%), hsl(0 0% 75%/0.7), hsl(275 95% 50%), hsl(0 0% 85%/0.5), hsl(260 70% 60%), hsl(275 95% 43%/0.2))", shimmer: "conic-gradient(from 180deg, transparent 0%, hsl(0 0% 92%/0.6) 20%, transparent 35%, hsl(275 60% 75%/0.5) 55%, transparent 70%, hsl(0 0% 80%/0.4) 85%, transparent 100%)", glow: "hsl(275 95% 43%)" },
                ];
                const currentTheme = themeList.find(t => t.key === colorKey) || themeList[0];
                return (
                  <button
                    key={s.key}
                    onClick={() => {
                      localStorage.setItem("aureon_send_btn_shape", s.key);
                      window.dispatchEvent(new Event("aureon-border-color-change"));
                      toast({ title: "Shape updated", description: s.label });
                    }}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-all ${
                      isActive ? "bg-foreground/5 ring-1 ring-foreground/20" : "hover:bg-foreground/[0.03]"
                    }`}
                  >
                    <div className={`relative ${s.radius} w-10 h-10 flex items-center justify-center`}>
                      <span className={`absolute inset-0 ${s.radius} animate-[sendBorderSpin_3s_linear_infinite]`} style={{ background: currentTheme.main }} />
                      <span className={`absolute inset-0 ${s.radius} animate-[sendBorderSpin_5s_linear_infinite_reverse] opacity-30`} style={{ background: currentTheme.shimmer }} />
                      <span className={`absolute inset-[2px] ${s.radius} bg-background z-[1]`} style={{ boxShadow: `inset 0 1px 4px ${currentTheme.glow}14, 0 0 12px ${currentTheme.glow}10` }} />
                      <span className={`absolute inset-[-3px] ${s.radius} opacity-60 z-0`} style={{ background: `radial-gradient(circle, ${currentTheme.glow}26 0%, transparent 70%)` }} />
                      <Send className="h-4 w-4 text-foreground/70 z-[2] relative" />
                    </div>
                    <span className="text-[9px] font-light text-foreground/70">{s.label}</span>
                    {isActive && <span className="text-[8px] text-accent">Active</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        )}


        {/* AI Model Keys (BYOK) */}
        {tab === "intelligence" && <AIKeysSettings />}

        {/* Memory & learning */}
        {tab === "intelligence" && <IntelligenceSettings />}

        {/* Recorded AI spend + per-room off switches */}
        {tab === "spend" && <UsageSettings />}

        {/* GitHub Integration */}
        {tab === "connections" && <GitHubSettings />}

        {/* Google — multi-account cloud intelligence */}
        {tab === "connections" && <GoogleAccountsSettings />}

        {/* Privacy */}
        {tab === "privacy" && (
        <div className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-5 space-y-4">

          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-sm font-light text-foreground">Privacy</h3>
          </div>
          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs text-muted-foreground">Memory enabled</span>
              <button
                onClick={() => updateSetting("memory_enabled", !settings?.memory_enabled)}
                className={`w-10 h-5 rounded-full transition-colors ${settings?.memory_enabled ? "bg-foreground/30" : "bg-border/30"}`}
              >
                <div className={`w-4 h-4 rounded-full bg-foreground transition-transform mx-0.5 ${settings?.memory_enabled ? "translate-x-5" : ""}`} />
              </button>
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs text-muted-foreground">Web search enabled</span>
              <button
                onClick={() => updateSetting("web_search_enabled", !settings?.web_search_enabled)}
                className={`w-10 h-5 rounded-full transition-colors ${settings?.web_search_enabled ? "bg-foreground/30" : "bg-border/30"}`}
              >
                <div className={`w-4 h-4 rounded-full bg-foreground transition-transform mx-0.5 ${settings?.web_search_enabled ? "translate-x-5" : ""}`} />
              </button>
            </label>
          </div>
        </div>
        )}


        {/* Keyboard Shortcuts */}
        {tab === "you" && (
        <div className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-5 space-y-4">

          <div className="flex items-center gap-3">
            <Keyboard className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-sm font-light text-foreground">Keyboard Shortcuts</h3>
          </div>
          <div className="space-y-1.5">
            {[
              { keys: "Ctrl+K", desc: "Open Command Palette" },
              { keys: "Ctrl+N", desc: "New Conversation" },
              { keys: "Enter", desc: "Send Message" },
              { keys: "Shift+Enter", desc: "New Line" },
              { keys: "Tab", desc: "Accept Autocomplete" },
              { keys: "Ctrl+1", desc: "Chat Mode" },
              { keys: "Ctrl+2", desc: "Code Mode" },
              { keys: "Ctrl+3", desc: "Research Mode" },
              { keys: "Ctrl+4", desc: "Truth Mode" },
              { keys: "Esc", desc: "Close Modal / Stop" },
              { keys: "↑ ↓", desc: "Navigate Command Palette" },
            ].map((s) => (
              <div key={s.keys} className="flex items-center justify-between py-1.5 px-1">
                <span className="text-xs font-light text-muted-foreground">{s.desc}</span>
                <kbd className="text-[10px] font-mono bg-secondary/40 border border-border/20 rounded-md px-2 py-0.5 text-muted-foreground">{s.keys}</kbd>
              </div>
            ))}
          </div>
        </div>
        )}


        {/* GDPR / Data Rights */}
        {tab === "privacy" && (
        <div className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-5 space-y-5">

          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-sm font-light text-foreground">Your Data Rights</h3>
          </div>

          <p className="text-xs font-extralight text-muted-foreground leading-relaxed">
            You have full control over your data. Download a copy, correct it, or permanently delete your account at any time.{" "}
            <Link to="/privacy" className="text-foreground underline underline-offset-4 hover:text-foreground/80 transition-colors">
              Read our Privacy Policy
            </Link>
          </p>

          <div className="rounded-lg border border-border/15 bg-card/10 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-light text-foreground">Download My Data</span>
            </div>
            <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
              Export all your data — profile, conversations, memory, files, settings — as a machine-readable JSON file.
            </p>
            <button
              onClick={handleExportData}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-lg border border-border/20 bg-foreground/5 px-4 py-2 text-xs font-light text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-50"
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {exporting ? "Exporting…" : "Export All Data"}
            </button>
          </div>

          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              <span className="text-xs font-light text-destructive">Delete My Account</span>
            </div>
            <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
              Permanently delete your account and ALL associated data. This action is irreversible.
            </p>

            {!showDeleteConfirm ? (
              <button onClick={() => setShowDeleteConfirm(true)} className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 px-4 py-2 text-xs font-light text-destructive hover:bg-destructive/10 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
                Delete Account
              </button>
            ) : (
              <div className="space-y-3 pt-1">
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-[10px] text-destructive leading-relaxed">
                    Type <strong>DELETE MY ACCOUNT</strong> below to confirm.
                  </p>
                </div>
                <input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="Type DELETE MY ACCOUNT" className="w-full bg-background/50 border border-destructive/30 rounded-lg px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/40" />
                <div className="flex gap-2">
                  <button onClick={handleDeleteAccount} disabled={deleteConfirmText !== "DELETE MY ACCOUNT" || deleting} className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-xs font-light text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50">
                    {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    {deleting ? "Deleting…" : "Permanently Delete"}
                  </button>
                  <button onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }} className="rounded-lg border border-border/20 px-4 py-2 text-xs font-light text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
        )}

      </div>
    </div>
  );
};

export default SettingsView;
