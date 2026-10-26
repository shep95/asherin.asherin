// guardian vault — notifications, limited to what this browser can do on its
// own. there is no server, so nothing can be pushed to this device while
// asherin is closed; the room says that instead of offering channel toggles
// that would be written and never read.

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  describeNotify, readNotifyState, recordTrail, requestNotify, showLocalNotification,
  type NotifyState,
} from "@/lib/guardian/deviceSecurity";

const DeviceNotifications = () => {
  const { toast } = useToast();
  const [state, setState] = useState<NotifyState>(() => readNotifyState());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // permission can change in the browser's own ui while this tab is open.
    const onFocus = () => setState(readNotifyState());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const allow = async () => {
    setBusy(true);
    const next = await requestNotify();
    setState(next);
    setBusy(false);
    if (next === "granted") void recordTrail("notifications_enabled", "notifications");
    toast({ title: next === "granted" ? "notifications allowed" : "notifications not allowed", description: describeNotify(next) });
  };

  const test = async () => {
    setBusy(true);
    const ok = await showLocalNotification("asherin", "this is what a notification from this device looks like.");
    setBusy(false);
    if (ok) void recordTrail("notifications_tested", "notifications");
    toast(ok ? { title: "test notification shown" } : { title: "the browser did not show it", description: describeNotify(readNotifyState()), variant: "destructive" });
  };

  const Icon = state === "granted" ? Bell : BellOff;

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <h2 className="text-sm font-extralight tracking-wide text-foreground">notifications</h2>
        <p className="text-[10px] text-muted-foreground/50 mt-0.5">what this browser can show on its own, without a server.</p>
      </div>

      <div className="rounded-xl border border-border/20 bg-card/10 px-4 py-3 flex items-center gap-3">
        <Icon className={`h-4 w-4 shrink-0 ${state === "granted" ? "text-emerald-400/70" : "text-muted-foreground/40"}`} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-light text-foreground">this browser</p>
          <p className="text-[10px] text-muted-foreground/40 mt-0.5" aria-live="polite">{describeNotify(state)}</p>
        </div>
        {state === "default" && (
          <button type="button" onClick={() => void allow()} disabled={busy} className="text-[10px] font-light px-3 py-1.5 rounded-lg border border-border/30 text-foreground hover:border-border/60 transition-colors disabled:opacity-30 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            allow
          </button>
        )}
        {state === "granted" && (
          <button type="button" onClick={() => void test()} disabled={busy} className="text-[10px] font-light px-3 py-1.5 rounded-lg border border-border/30 text-foreground hover:border-border/60 transition-colors disabled:opacity-30 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            show a test
          </button>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground/40 px-1">
        nothing can reach this device while asherin is closed: there is no server to send a push, and no account whose events would be pushed. the vault does not lock on a timer, so there is nothing to be told about yet.
      </p>
    </div>
  );
};

export default DeviceNotifications;
