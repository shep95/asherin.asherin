import { useState, useEffect, useCallback } from "react";
import { Bell, X, Check, CheckCheck, Trash2, Moon, Volume2, VolumeX, BellRing } from "lucide-react";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  read: boolean;
  timestamp: number;
  actionLabel?: string;
  actionView?: string;
}

const STORAGE_KEY = "aureon_notifications";
const DND_KEY = "aureon_dnd";
const SOUND_KEY = "aureon_notif_sound";
const PUSH_KEY = "aureon_push_enabled";

function loadNotifications(): AppNotification[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}

function saveNotifications(notifs: AppNotification[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs.slice(0, 100)));
}

// Sound effect — short, subtle notification tone using Web Audio API
function playNotificationSound() {
  if (localStorage.getItem(SOUND_KEY) === "false") return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch {}
}

// Browser push notification
function sendBrowserNotification(title: string, body: string) {
  if (localStorage.getItem(PUSH_KEY) === "false") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.hasFocus()) return; // Only push when tab not focused
  try {
    new Notification(title, {
      body,
      icon: "/favicon.png",
      badge: "/favicon.png",
      tag: "aureon-notif",
    });
  } catch {}
}

// Request browser notification permission
export async function requestPushPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

// Public API to push notifications
export function pushNotification(notif: Omit<AppNotification, "id" | "read" | "timestamp">) {
  const isDnd = localStorage.getItem(DND_KEY) === "true";
  if (isDnd) return;
  
  const all = loadNotifications();
  // Batch: if same title exists in last 5, increment instead of adding
  const recent = all.slice(0, 5).find(n => n.title === notif.title && !n.read);
  if (recent) {
    recent.message = notif.message;
    recent.timestamp = Date.now();
    saveNotifications(all);
  } else {
    const full: AppNotification = {
      ...notif,
      id: crypto.randomUUID(),
      read: false,
      timestamp: Date.now(),
    };
    saveNotifications([full, ...all]);
  }

  // Sound + browser push
  playNotificationSound();
  sendBrowserNotification(notif.title, notif.message);
  
  window.dispatchEvent(new Event("aureon-notification-update"));
}

interface NotificationInboxProps {
  onNavigate?: (view: string) => void;
}

const NotificationInbox = ({ onNavigate }: NotificationInboxProps) => {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>(loadNotifications);
  const [dnd, setDnd] = useState(() => localStorage.getItem(DND_KEY) === "true");
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem(SOUND_KEY) !== "false");
  const [pushEnabled, setPushEnabled] = useState(() => localStorage.getItem(PUSH_KEY) !== "false");

  const reload = useCallback(() => setNotifications(loadNotifications()), []);

  useEffect(() => {
    window.addEventListener("aureon-notification-update", reload);
    return () => window.removeEventListener("aureon-notification-update", reload);
  }, [reload]);

  // Request push permission on mount if enabled
  useEffect(() => {
    if (pushEnabled && "Notification" in window && Notification.permission === "default") {
      requestPushPermission();
    }
  }, [pushEnabled]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    const snapshot = [...notifications];
    const updated = notifications.map(n => ({ ...n, read: true }));
    setNotifications(updated);
    try {
      saveNotifications(updated);
    } catch {
      // Rollback on failure
      setNotifications(snapshot);
    }
  };

  const markRead = (id: string) => {
    const updated = notifications.map(n => n.id === id ? { ...n, read: true } : n);
    setNotifications(updated);
    saveNotifications(updated);
  };

  const clearAll = () => {
    const snapshot = [...notifications];
    setNotifications([]);
    try {
      saveNotifications([]);
    } catch {
      setNotifications(snapshot);
    }
  };

  const toggleDnd = () => {
    const next = !dnd;
    setDnd(next);
    localStorage.setItem(DND_KEY, String(next));
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem(SOUND_KEY, String(next));
    if (next) playNotificationSound(); // Preview sound
  };

  const togglePush = async () => {
    if (!pushEnabled) {
      const granted = await requestPushPermission();
      if (!granted) return;
    }
    const next = !pushEnabled;
    setPushEnabled(next);
    localStorage.setItem(PUSH_KEY, String(next));
  };

  const typeColors: Record<string, string> = {
    info: "bg-accent/20 text-accent",
    success: "bg-emerald-500/20 text-emerald-400",
    warning: "bg-amber-500/20 text-amber-400",
    error: "bg-red-500/20 text-red-400",
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-lg p-2 text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors"
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent text-[9px] font-medium text-accent-foreground px-1">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-2xl border border-border/30 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/20">
              <h3 className="text-sm font-light text-foreground">Notifications</h3>
              <div className="flex items-center gap-1">
                <button onClick={togglePush} className={`p-1.5 rounded-lg transition-colors ${pushEnabled ? "text-accent bg-accent/10" : "text-muted-foreground hover:text-foreground"}`} title={pushEnabled ? "Browser Push ON" : "Browser Push OFF"}>
                  <BellRing className="h-3.5 w-3.5" />
                </button>
                <button onClick={toggleSound} className={`p-1.5 rounded-lg transition-colors ${soundEnabled ? "text-accent bg-accent/10" : "text-muted-foreground hover:text-foreground"}`} title={soundEnabled ? "Sound ON" : "Sound OFF"}>
                  {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                </button>
                <button onClick={toggleDnd} className={`p-1.5 rounded-lg transition-colors ${dnd ? "text-amber-400 bg-amber-400/10" : "text-muted-foreground hover:text-foreground"}`} title={dnd ? "Do Not Disturb ON" : "Do Not Disturb OFF"}>
                  <Moon className="h-3.5 w-3.5" />
                </button>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors" title="Mark all read">
                    <CheckCheck className="h-3.5 w-3.5" />
                  </button>
                )}
                {notifications.length > 0 && (
                  <button onClick={clearAll} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors" title="Clear all">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell className="h-6 w-6 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-xs font-light text-muted-foreground/40">No notifications</p>
                </div>
              ) : (
                notifications.slice(0, 20).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      markRead(n.id);
                      if (n.actionView && onNavigate) {
                        onNavigate(n.actionView);
                        setOpen(false);
                      }
                    }}
                    className={`w-full text-left px-4 py-3 border-b border-border/10 hover:bg-foreground/5 transition-colors ${!n.read ? "bg-foreground/[0.03]" : ""}`}
                  >
                    <div className="flex items-start gap-2.5">
                      {!n.read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${typeColors[n.type] ?? typeColors.info}`}>{n.type}</span>
                          <span className="text-[10px] text-muted-foreground/40">
                            {formatTime(n.timestamp)}
                          </span>
                        </div>
                        <p className="text-xs font-light text-foreground truncate">{n.title}</p>
                        <p className="text-[10px] text-muted-foreground/60 truncate">{n.message}</p>
                        {n.actionLabel && (
                          <span className="text-[10px] text-accent mt-0.5 inline-block">{n.actionLabel} →</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            {dnd && (
              <div className="px-4 py-2 border-t border-border/20 bg-amber-500/5">
                <p className="text-[10px] text-amber-400/70 flex items-center gap-1.5">
                  <Moon className="h-3 w-3" /> Do Not Disturb is on
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export default NotificationInbox;
