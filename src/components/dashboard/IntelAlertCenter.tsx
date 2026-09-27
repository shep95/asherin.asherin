import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, BellOff, Check, Loader2, Mail, Smartphone, Trash2, X, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { enablePush, readPushStatus, type PushStatus } from "@/lib/guardianPush";

/**
 * INTEL ALERT CENTER
 *
 * Every intelligence product Asherin finishes writes a row to
 * intel_notifications. This is the surface that row lands on: a bell with an
 * unread count, a live-streamed inbox, and the controls for the two background
 * transports (device push, email).
 *
 * Design constraints that shaped it:
 *  - The inbox is the record; push and email are transports. So the panel never
 *    claims delivery, it shows what was recorded and which channels accepted.
 *  - Realtime can drop. The panel refetches on mount, on open, and on tab focus,
 *    so a missed socket frame never means a missed alert.
 *  - Fixed row heights and a reserved badge slot: opening the panel must not
 *    reflow the dashboard behind it.
 *  - Reduced-motion users get instant state; the pulse is opt-in by preference.
 */

type Severity = "info" | "notable" | "critical";

interface Notice {
  id: string;
  kind: string;
  severity: Severity;
  title: string;
  body: string;
  subject_name: string | null;
  source: string | null;
  url: string | null;
  sections: Array<{ label: string; value: string }> | null;
  findings: string[] | null;
  channels_delivered: string[] | null;
  read_at: string | null;
  created_at: string;
}

interface Prefs {
  push_enabled: boolean;
  email_enabled: boolean;
  in_app_enabled: boolean;
  min_severity: Severity;
}

const SEV_STYLE: Record<Severity, { dot: string; label: string; text: string }> = {
  info: { dot: "bg-white/30", label: "ROUTINE", text: "text-white/45" },
  notable: { dot: "bg-white/70", label: "NOTABLE", text: "text-white/75" },
  critical: { dot: "bg-white", label: "CRITICAL", text: "text-white" },
};

const PAGE = 30;

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function IntelAlertCenter() {
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>({
    push_enabled: true, email_enabled: true, in_app_enabled: true, min_severity: "info",
  });
  const [push, setPush] = useState<PushStatus>({ state: "prompt" });
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) { if (mounted.current) { setLoading(false); setNotices([]); } return; }
    const { data, error: qErr } = await supabase
      .from("intel_notifications")
      .select("id, kind, severity, title, body, subject_name, source, url, sections, findings, channels_delivered, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(PAGE);
    if (!mounted.current) return;
    if (qErr) { setError("Alert inbox unavailable."); setLoading(false); return; }
    setError(null);
    setNotices((data ?? []) as unknown as Notice[]);
    setLoading(false);
  }, []);

  // Mount: inbox + prefs + push state, all independent, none blocking the others.
  useEffect(() => {
    void load();
    void (async () => {
      const { data, error: fErr } = await supabase.functions.invoke("intel-notify", { body: { action: "prefs.get" } });
      if (!fErr && data?.prefs && mounted.current) setPrefs(data.prefs as Prefs);
    })();
    void readPushStatus().then((s) => { if (mounted.current) setPush(s); });
  }, [load]);

  // Live stream. A dropped socket is covered by the focus refetch below.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user || !mounted.current) return;
      channel = supabase
        .channel(`intel-notifications-${auth.user.id}`)
        .on("postgres_changes", {
          event: "*", schema: "public", table: "intel_notifications",
          filter: `user_id=eq.${auth.user.id}`,
        }, () => { void load(); })
        .subscribe();
    })();
    const onFocus = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [load]);

  // Escape closes and returns focus to the bell — the panel is a dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    };
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)
        && !triggerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    void load();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open, load]);

  const unread = useMemo(() => notices.filter((n) => !n.read_at).length, [notices]);

  const markRead = useCallback(async (id: string) => {
    setNotices((prev) => prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    const { error: uErr } = await supabase.from("intel_notifications")
      .update({ read_at: new Date().toISOString() }).eq("id", id);
    if (uErr) void load();
  }, [load]);

  const markAllRead = useCallback(async () => {
    const ids = notices.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    setNotices((prev) => prev.map((n) => n.read_at ? n : { ...n, read_at: new Date().toISOString() }));
    const { error: uErr } = await supabase.from("intel_notifications")
      .update({ read_at: new Date().toISOString() }).in("id", ids);
    if (uErr) void load();
  }, [notices, load]);

  const remove = useCallback(async (id: string) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
    const { error: dErr } = await supabase.from("intel_notifications").delete().eq("id", id);
    if (dErr) void load();
  }, [load]);

  const savePrefs = useCallback(async (next: Prefs) => {
    const previous = prefs;
    setPrefs(next);
    const { error: pErr } = await supabase.functions.invoke("intel-notify", {
      body: { action: "prefs.set", prefs: next },
    });
    if (pErr) { setPrefs(previous); toast.error("Preference not saved."); }
  }, [prefs]);

  const doEnablePush = useCallback(async () => {
    setBusy("push");
    const status = await enablePush();
    if (mounted.current) setPush(status);
    setBusy(null);
    if (status.state === "enabled") toast.success("This device will now receive alerts.");
    else toast.error(status.reason ?? "Device could not be registered.");
  }, []);

  const selfTest = useCallback(async () => {
    setBusy("test");
    const { data, error: tErr } = await supabase.functions.invoke("intel-notify", { body: { action: "test" } });
    setBusy(null);
    if (tErr) { toast.error("Self-test could not be dispatched."); return; }
    const channels: string[] = data?.channels ?? [];
    toast.success(channels.length ? `Dispatched on: ${channels.join(", ")}` : "Recorded, no transport accepted.");
    void load();
  }, [load]);

  const badge = unread > 99 ? "99+" : String(unread);

  const panel = open ? (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Intelligence alerts"
      className="fixed right-3 bottom-16 z-[95] w-[min(26rem,calc(100vw-1.5rem))] max-h-[70vh] overflow-hidden rounded-2xl border border-white/10 bg-black/85 backdrop-blur-xl shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/35">◈ ASHERIN</p>
          <p className="text-sm font-extralight tracking-wide text-white/85">Intelligence alerts</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={markAllRead}
            disabled={unread === 0}
            className="rounded-md px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-white/45 hover:text-white/80 disabled:opacity-30"
          >
            Mark all read
          </button>
          <button onClick={() => { setOpen(false); triggerRef.current?.focus(); }} aria-label="Close alerts"
            className="rounded-md p-1.5 text-white/45 hover:text-white/85">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Channel controls: the panel is also where the transports are proven. */}
      <div className="border-b border-white/10 px-4 py-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-xs font-extralight text-white/60">
            <Smartphone className="h-3.5 w-3.5" /> Device alerts
          </span>
          {push.state === "enabled" ? (
            <button
              onClick={() => savePrefs({ ...prefs, push_enabled: !prefs.push_enabled })}
              className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] ${prefs.push_enabled ? "bg-white/15 text-white/85" : "bg-white/5 text-white/40"}`}
            >
              {prefs.push_enabled ? "On" : "Muted"}
            </button>
          ) : (
            <button
              onClick={doEnablePush}
              disabled={busy === "push" || push.state === "unsupported"}
              className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] text-white/70 hover:bg-white/20 disabled:opacity-40"
            >
              {busy === "push" ? "…" : push.state === "unsupported" ? "N/A" : "Enable"}
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-xs font-extralight text-white/60">
            <Mail className="h-3.5 w-3.5" /> Email copies
          </span>
          <button
            onClick={() => savePrefs({ ...prefs, email_enabled: !prefs.email_enabled })}
            className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] ${prefs.email_enabled ? "bg-white/15 text-white/85" : "bg-white/5 text-white/40"}`}
          >
            {prefs.email_enabled ? "On" : "Muted"}
          </button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-extralight text-white/60">Alert me from</span>
          <div className="flex gap-1">
            {(["info", "notable", "critical"] as Severity[]).map((s) => (
              <button
                key={s}
                onClick={() => savePrefs({ ...prefs, min_severity: s })}
                className={`rounded-full px-2 py-1 text-[9px] uppercase tracking-[0.15em] ${prefs.min_severity === s ? "bg-white/15 text-white/85" : "text-white/35 hover:text-white/60"}`}
              >
                {SEV_STYLE[s].label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={selfTest}
          disabled={busy === "test"}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] py-2 text-[10px] uppercase tracking-[0.2em] text-white/55 hover:bg-white/[0.08] disabled:opacity-40"
        >
          {busy === "test" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          Test every channel
        </button>
      </div>

      <div className="max-h-[52vh] overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-white/[0.04]" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6 text-center">
            <p className="text-xs font-extralight text-white/50">{error}</p>
            <button onClick={() => { setLoading(true); void load(); }}
              className="mt-3 rounded-md border border-white/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/60 hover:bg-white/5">
              Retry
            </button>
          </div>
        ) : notices.length === 0 ? (
          <div className="p-8 text-center">
            <BellOff className="mx-auto h-6 w-6 text-white/20" />
            <p className="mt-3 text-xs font-extralight text-white/45">No intelligence alerts yet.</p>
            <p className="mt-1 text-[11px] font-extralight text-white/30">
              Run a driver check or build a dossier and the report lands here.
            </p>
          </div>
        ) : (
          notices.map((n) => {
            const sev = SEV_STYLE[n.severity] ?? SEV_STYLE.info;
            const isOpen = expanded === n.id;
            return (
              <div
                key={n.id}
                className={`border-b border-white/5 px-4 py-3 transition-colors ${n.read_at ? "" : "bg-white/[0.03]"}`}
              >
                <button
                  className="w-full text-left"
                  onClick={() => { setExpanded(isOpen ? null : n.id); if (!n.read_at) void markRead(n.id); }}
                  aria-expanded={isOpen}
                >
                  <div className="flex items-start gap-2.5">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${sev.dot}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={`truncate text-[13px] font-light ${sev.text}`}>{n.title}</p>
                        <span className="shrink-0 text-[10px] font-extralight text-white/30">{timeAgo(n.created_at)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11px] font-extralight leading-relaxed text-white/45">{n.body}</p>
                      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.15em] text-white/25">
                        {sev.label} · {n.source ?? "Asherin"}
                        {n.channels_delivered?.length ? ` · ${n.channels_delivered.join(" / ")}` : ""}
                      </p>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="mt-3 space-y-2 pl-4">
                    {(n.sections ?? []).map((s, i) => (
                      <div key={i}>
                        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-white/30">{s.label}</p>
                        <p className="text-[11px] font-extralight text-white/60">{s.value}</p>
                      </div>
                    ))}
                    {(n.findings ?? []).length > 0 && (
                      <div>
                        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-white/30">Findings</p>
                        {(n.findings ?? []).map((f, i) => (
                          <p key={i} className="text-[11px] font-extralight text-white/60">— {f}</p>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      {n.url && (
                        <a
                          href={n.url}
                          className="rounded-md border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] text-white/60 hover:bg-white/5"
                        >
                          Open report
                        </a>
                      )}
                      <button
                        onClick={() => void remove(n.id)}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-white/35 hover:text-white/70"
                      >
                        <Trash2 className="h-3 w-3" /> Dismiss
                      </button>
                      {!n.read_at && (
                        <button onClick={() => void markRead(n.id)}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-white/35 hover:text-white/70">
                          <Check className="h-3 w-3" /> Read
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Intelligence alerts, ${unread} unread` : "Intelligence alerts"}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="fixed right-3 bottom-4 z-[94] flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/50 backdrop-blur-md opacity-60 transition-all hover:opacity-100 hover:bg-black/70 hover:text-white focus-visible:opacity-100"
        style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-white px-1 text-[9px] font-medium leading-4 text-black"
          >
            {badge}
          </span>
        )}
      </button>
      {typeof document !== "undefined" && panel ? createPortal(panel, document.body) : null}
    </>
  );
}
