// settings — the controls for this device. every control on this screen is
// read somewhere else in src/ (the file and symbol are named beside each
// block); a control nothing reads is not shown. there is no account: the
// device is the operator.

import { useEffect, useState } from "react";
import { Shield, Palette, Loader2, Download, Trash2, AlertTriangle, FileText, ImageIcon, Check, Keyboard, Send, MonitorSmartphone, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStepUp } from "@/components/auth/StepUpProvider";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import AIKeysSettings from "./AIKeysSettings";
import GoogleAccountsSettings from "./settings/GoogleAccountsSettings";
import IntelligenceSettings from "./settings/IntelligenceSettings";
import UsageSettings from "./settings/UsageSettings";
import DashboardAppearanceControls from "./settings/DashboardAppearanceControls";
import { ALL_WALLPAPERS } from "@/lib/wallpapers";
import { DASHBOARD_UI_EVENT, readDashboardUi, writeDashboardUi, type DashboardUi } from "@/lib/dashboardUi";
import { APPEARANCE_EVENT, readAppearance, writeAppearance, WALLPAPER_KEY, type DashboardAppearance } from "@/lib/dashboardAppearance";
import { useIsV2 } from "@/lib/dashboardUiContext";
import { storageIsMemoryOnly } from "@/lib/local/db";
import { VAULT_EVENT, vaultLockState } from "@/lib/local/keys";
import { KEYBOARD_SHORTCUTS, SETTINGS_TABS, takeTabHint, type SettingsTab } from "./settings/tabs";

// Dashboard.tsx seeds this key on a fresh install and falls back to it when the
// stored key is empty; the picker must agree or the wrong tile reads as active.
const WALLPAPER_DEFAULT_KEY = "aureon";
const SEND_SHAPE_KEY = "aureon_send_btn_shape"; // read by AdaptiveInputBar.tsx
const SEND_SHAPE_EVENT = "aureon-border-color-change"; // the event AdaptiveInputBar listens for

const readWallpaperKey = (): string => {
  try {
    return localStorage.getItem(WALLPAPER_KEY) || WALLPAPER_DEFAULT_KEY;
  } catch {
    return WALLPAPER_DEFAULT_KEY;
  }
};

const readSendShape = (): "circle" | "square" => {
  try {
    return localStorage.getItem(SEND_SHAPE_KEY) === "square" ? "square" : "circle";
  } catch {
    return "circle";
  }
};

const Card = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <section className="space-y-4 rounded-xl border border-border/20 bg-card/20 p-4 backdrop-blur-sm sm:p-5" aria-label={title}>
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground">{icon}</span>
      <h3 className="text-sm font-light text-foreground">{title}</h3>
    </div>
    {children}
  </section>
);

const SettingsView = () => {
  const [tab, setTab] = useState<SettingsTab>(() => takeTabHint(typeof sessionStorage !== "undefined" ? sessionStorage : null));
  const v2 = useIsV2();
  const { user } = useAuth();
  const stepUp = useStepUp();
  const { toast } = useToast();

  const [exporting, setExporting] = useState(false);
  const [showWipe, setShowWipe] = useState(false);
  const [wipeText, setWipeText] = useState("");
  const [wiping, setWiping] = useState(false);
  const [appearance, setAppearance] = useState<DashboardAppearance>(() => readAppearance());
  const [dashboardUi, setDashboardUi] = useState<DashboardUi>(() => readDashboardUi());
  const [wallpaperKey, setWallpaperKey] = useState<string>(() => readWallpaperKey());
  const [sendShape, setSendShape] = useState<"circle" | "square">(() => readSendShape());
  const [vault, setVault] = useState<{ mode: "device" | "passphrase"; unlocked: boolean; keys: number } | null>(null);

  // another surface (or another tab) may change appearance; stay in step.
  useEffect(() => {
    const sync = () => {
      setAppearance(readAppearance());
      setDashboardUi(readDashboardUi());
      setWallpaperKey(readWallpaperKey());
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

  useEffect(() => {
    const refresh = () => void vaultLockState().then(setVault).catch(() => setVault({ mode: "device", unlocked: true, keys: 0 }));
    refresh();
    window.addEventListener(VAULT_EVENT, refresh);
    return () => window.removeEventListener(VAULT_EVENT, refresh);
  }, []);

  // one writer per preference: local storage + live broadcast first (the chrome
  // repaints at once), then the device's settings row, which Dashboard.tsx
  // reads on its next load. an error there never undoes the live change.
  const persistRow = (patch: Record<string, unknown>) => {
    if (!user) return;
    supabase
      .from("user_settings")
      .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" })
      .then(({ error }) => {
        if (error) console.warn("settings row not written:", error.message);
      });
  };

  const applyAppearance = (patch: Partial<DashboardAppearance>) => {
    const next = writeAppearance(patch);
    setAppearance(next);
    persistRow({ dashboard_bg_mode: next.mode, dashboard_bg_color: next.color });
  };

  const applyDashboardUi = (next: DashboardUi) => {
    setDashboardUi(writeDashboardUi(next));
    persistRow({ dashboard_ui: next });
  };

  const pickWallpaper = (key: string, label: string) => {
    try {
      localStorage.setItem(WALLPAPER_KEY, key);
    } catch {
      /* private mode: the live change still happens */
    }
    setWallpaperKey(key);
    window.dispatchEvent(new Event("aureon-wallpaper-change"));
    // picking a photo is itself the exit from colour mode.
    applyAppearance({ mode: "wallpaper" });
    persistRow({ wallpaper: key });
    toast({ title: "wallpaper changed", description: label.toLowerCase() });
  };

  const pickSendShape = (shape: "circle" | "square") => {
    try {
      localStorage.setItem(SEND_SHAPE_KEY, shape);
    } catch {
      /* private mode */
    }
    setSendShape(shape);
    window.dispatchEvent(new Event(SEND_SHAPE_EVENT));
  };

  const exportData = async () => {
    if (!user) return;
    // the bundle is everything this device holds — prove the vault is open now
    if (!(await stepUp("export this device's data"))) return;
    setExporting(true);
    try {
      const { buildExportBundle } = await import("@/lib/local/exportData");
      const blob = await buildExportBundle();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `asherin-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "export saved", description: "one json file, downloaded by your browser." });
    } catch (e) {
      toast({ title: "export failed", description: (e as Error)?.message?.toLowerCase() || "try again.", variant: "destructive" });
    }
    setExporting(false);
  };

  const WIPE_PHRASE = "wipe this device";
  const wipe = async () => {
    if (!user || wipeText.trim().toLowerCase() !== WIPE_PHRASE) return;
    if (!(await stepUp("wipe this device"))) return;
    setWiping(true);
    try {
      const { wipeEverything } = await import("@/lib/local/exportData");
      await wipeEverything();
      window.location.href = "/";
    } catch (e) {
      toast({ title: "wipe failed", description: (e as Error)?.message?.toLowerCase() || "try again.", variant: "destructive" });
      setWiping(false);
    }
  };

  const memoryOnly = storageIsMemoryOnly();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
        {!v2 && (
          <div>
            <h2 className="text-xl font-extralight tracking-wide text-foreground">settings</h2>
            <p className="mt-1 text-sm font-extralight text-muted-foreground">how asherin looks and works on this device.</p>
          </div>
        )}

        <div role="tablist" aria-label="settings sections" className="flex flex-wrap gap-1.5 rounded-xl border border-border/20 bg-card/20 p-1.5 backdrop-blur-sm">
          {SETTINGS_TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-light transition-colors ${
                tab === t.key ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "device" && (
          <>
            <Card icon={<MonitorSmartphone className="h-5 w-5" />} title="this device">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                <dt className="text-muted-foreground">identity</dt>
                <dd className="font-mono text-foreground/80">{user?.id.slice(0, 8) ?? "—"}</dd>
                <dt className="text-muted-foreground">storage</dt>
                <dd className="text-foreground/80">
                  {memoryOnly
                    ? "memory only — this browser refused indexeddb, so nothing survives a reload"
                    : "indexeddb in this browser profile; nothing is synced anywhere"}
                </dd>
                <dt className="text-muted-foreground">key vault</dt>
                <dd className="text-foreground/80">
                  {vault
                    ? `${vault.keys} ${vault.keys === 1 ? "key" : "keys"} · ${
                        vault.mode === "passphrase"
                          ? vault.unlocked
                            ? "passphrase lock, unlocked for this session"
                            : "passphrase lock, locked"
                          : "sealed under a device key that cannot be exported"
                      }`
                    : "reading…"}
                </dd>
              </dl>
              <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                there is no account and no sign-in. the identity above is minted once in this browser and scopes every row asherin writes. to move to another device, export from{" "}
                <button type="button" onClick={() => setTab("privacy")} className="underline underline-offset-4 hover:text-foreground">
                  privacy &amp; data
                </button>
                ; keys are managed under{" "}
                <button type="button" onClick={() => setTab("intelligence")} className="underline underline-offset-4 hover:text-foreground">
                  intelligence
                </button>
                .
              </p>
            </Card>

            <Card icon={<Keyboard className="h-5 w-5" />} title="keyboard shortcuts">
              <div className="space-y-1.5">
                {KEYBOARD_SHORTCUTS.map((s) => (
                  <div key={s.keys} className="flex items-center justify-between gap-3 px-1 py-1.5">
                    <span className="text-xs font-light text-muted-foreground">{s.desc}</span>
                    <kbd className="shrink-0 rounded-md border border-border/20 bg-secondary/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{s.keys}</kbd>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {tab === "look" && (
          <>
            <Card icon={<ImageIcon className="h-5 w-5" />} title="appearance">
              <DashboardAppearanceControls
                appearance={appearance}
                onChange={applyAppearance}
                ui={dashboardUi}
                onUiChange={applyDashboardUi}
                wallpaperLabel={(ALL_WALLPAPERS.find((w) => w.key === wallpaperKey)?.label ?? "photo").toLowerCase()}
              />

              {appearance.mode !== "color" && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="wallpaper">
                  {ALL_WALLPAPERS.map((wp) => {
                    const active = wallpaperKey === wp.key;
                    return (
                      <button
                        key={wp.key}
                        role="radio"
                        aria-checked={active}
                        onClick={() => pickWallpaper(wp.key, wp.label)}
                        className={`group relative aspect-video overflow-hidden rounded-xl border-2 transition-all ${
                          active ? "border-foreground/50 ring-1 ring-foreground/20" : "border-border/20 hover:border-foreground/30"
                        }`}
                      >
                        <img src={wp.thumb} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                        <div className="absolute inset-0 bg-background/60" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                          {active && <Check className="h-4 w-4 text-foreground" />}
                          <span className="text-[10px] font-light text-foreground">{wp.label.toLowerCase()}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card icon={<Palette className="h-5 w-5" />} title="send button">
              <p className="text-[11px] text-muted-foreground/70">the shape of the send button in chat. it changes as you press.</p>
              <div className="flex items-center gap-4" role="radiogroup" aria-label="send button shape">
                {(
                  [
                    { key: "circle", label: "circle", radius: "rounded-full" },
                    { key: "square", label: "rounded square", radius: "rounded-xl" },
                  ] as const
                ).map((s) => {
                  const active = sendShape === s.key;
                  return (
                    <button
                      key={s.key}
                      role="radio"
                      aria-checked={active}
                      onClick={() => pickSendShape(s.key)}
                      className={`flex flex-col items-center gap-2 rounded-xl p-4 transition-all ${active ? "bg-foreground/5 ring-1 ring-foreground/20" : "hover:bg-foreground/[0.03]"}`}
                    >
                      <span className={`flex h-10 w-10 items-center justify-center border border-foreground/30 bg-background ${s.radius}`}>
                        <Send className="h-4 w-4 text-foreground/70" />
                      </span>
                      <span className="text-[10px] font-light text-foreground/70">{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </Card>
          </>
        )}

        {tab === "intelligence" && (
          <>
            <AIKeysSettings />
            <IntelligenceSettings />
          </>
        )}

        {tab === "spend" && <UsageSettings />}

        {tab === "connections" && <GoogleAccountsSettings />}

        {tab === "privacy" && (
          <>
            <Card icon={<Shield className="h-5 w-5" />} title="where your data is">
              <p className="text-xs font-extralight leading-relaxed text-muted-foreground">
                everything asherin holds lives in this browser's storage. the only things that leave the device are the requests you start: a message to the model provider you connected, a tile or lookup a room asks for.{" "}
                <Link to="/privacy" className="text-foreground underline underline-offset-4 transition-colors hover:text-foreground/80">
                  the privacy page
                </Link>{" "}
                says the same at length. what shepherd has learned about you is its own room,{" "}
                <Link to="/dashboard/memory" className="text-foreground underline underline-offset-4 transition-colors hover:text-foreground/80">
                  asherin.vault
                </Link>
                , and the memory switch is under intelligence.
              </p>
            </Card>

            <Card icon={<FileText className="h-5 w-5" />} title="export">
              <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                one json file with every table this device holds — conversations, messages, memory, projects, settings, the pull log — and the names of the providers you connected. the keys themselves are never exported. files kept in the library are not in the bundle.
              </p>
              <button
                onClick={exportData}
                disabled={exporting}
                className="inline-flex items-center gap-2 rounded-lg border border-border/20 bg-foreground/5 px-4 py-2 text-xs font-light text-foreground transition-colors hover:bg-foreground/10 disabled:opacity-50"
              >
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {exporting ? "exporting…" : "export everything"}
              </button>
              {vault?.mode === "passphrase" && <p className="text-[10px] text-muted-foreground/60">the vault passphrase is asked for first.</p>}
            </Card>

            <section className="space-y-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 sm:p-5" aria-label="wipe this device">
              <div className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-destructive" />
                <h3 className="text-sm font-light text-destructive">wipe this device</h3>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                erase everything asherin holds here — conversations, files, memory, keys and settings — then return to the door. irreversible; export first if you want a copy.
              </p>

              {!showWipe ? (
                <button
                  onClick={() => setShowWipe(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 px-4 py-2 text-xs font-light text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  wipe device
                </button>
              ) : (
                <div className="space-y-3 pt-1">
                  <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <p className="text-[11px] leading-relaxed text-destructive">
                      type <strong>{WIPE_PHRASE}</strong> to confirm.
                    </p>
                  </div>
                  <input
                    value={wipeText}
                    onChange={(e) => setWipeText(e.target.value)}
                    placeholder={WIPE_PHRASE}
                    aria-label="confirmation phrase"
                    className="w-full rounded-lg border border-destructive/30 bg-background/50 px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/40"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={wipe}
                      disabled={wipeText.trim().toLowerCase() !== WIPE_PHRASE || wiping}
                      className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-xs font-light text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
                    >
                      {wiping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      {wiping ? "wiping…" : "wipe everything"}
                    </button>
                    <button
                      onClick={() => {
                        setShowWipe(false);
                        setWipeText("");
                      }}
                      className="rounded-lg border border-border/20 px-4 py-2 text-xs font-light text-muted-foreground transition-colors hover:text-foreground"
                    >
                      keep everything
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {tab === "intelligence" && vault?.mode === "passphrase" && !vault.unlocked && (
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
            <KeyRound className="h-3 w-3" /> the key vault is locked; saving or using a key asks for the passphrase.
          </p>
        )}
      </div>
    </div>
  );
};

export default SettingsView;
