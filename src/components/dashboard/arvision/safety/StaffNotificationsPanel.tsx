// asherin.arvision — staff notification state.
//
// The point of this panel is the per-channel result. A notification that says
// "sent" when nothing was sent is worse than no notification at all, so every
// channel prints what actually happened to it, including "no provider is
// configured", and an operator can see the gap before an incident rather than
// after one.

import { Bell, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NotifierChannelState, NotifyChannel, SafetyNotification } from "@/lib/arvision/safety/notify";

interface Props {
  notifications: SafetyNotification[];
  channels: NotifierChannelState[];
  onChannel: (c: NotifyChannel, on: boolean) => void;
  onRead: (id: string) => void;
  onAcknowledge: (id: string) => void;
}

const StaffNotificationsPanel = ({ notifications, channels, onChannel, onRead, onAcknowledge }: Props) => (
  <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
    <div className="flex items-center gap-2">
      <Bell className="h-3.5 w-3.5 text-white/45" />
      <h2 className="text-[12px] font-light text-white/80">staff notification</h2>
    </div>
    <p className="mt-1 text-[11px] font-light leading-relaxed text-white/40">
      an event reaches a person here. this system never intervenes, dispatches or acts by itself — the whole of its response
      is telling a human what was measured.
    </p>

    <div className="mt-3 space-y-1.5">
      {channels.map((c) => (
        <div key={c.channel} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/8 bg-black/30 px-2.5 py-1.5">
          <label className="flex items-center gap-1.5 text-[11px] font-light text-white/70">
            <input type="checkbox" checked={c.enabled} onChange={(e) => onChannel(c.channel, e.target.checked)} />
            {c.channel.replace(/_/g, " ")}
          </label>
          <span className={`text-[10px] font-light ${c.ready ? "text-emerald-200/70" : "text-amber-200/70"}`}>
            {c.ready ? "ready" : "unavailable"}
          </span>
          <span className="min-w-0 flex-1 text-[10px] font-light text-white/35">{c.detail}</span>
        </div>
      ))}
    </div>

    <h3 className="mt-4 text-[11px] font-light text-white/55">sent</h3>
    {notifications.length === 0 ? (
      <p className="mt-1 text-[11px] font-light text-white/35">no event has notified anyone in this session.</p>
    ) : (
      <ul className="mt-2 space-y-2">
        {notifications.slice(0, 25).map((n) => (
          <li key={n.id} className={`rounded-xl border p-3 ${n.status === "unread" ? "border-sky-400/20 bg-sky-400/[0.04]" : "border-white/8 bg-black/30"}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[11.5px] font-light text-white/85">{n.title}</span>
              <span className="text-[10px] font-light text-white/35">{new Date(n.atMs).toLocaleTimeString()}</span>
            </div>
            <p className="mt-1 text-[11px] font-light leading-relaxed text-white/55">{n.body}</p>
            <p className="mt-1 text-[10px] font-light text-white/35">{n.evidenceState}</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {n.delivery.length === 0 ? (
                <span className="text-[10px] font-light text-white/30">delivery still in progress</span>
              ) : (
                n.delivery.map((d) => (
                  <span
                    key={d.channel}
                    title={d.detail}
                    className={`rounded border px-1.5 py-0.5 text-[9.5px] font-light ${d.ok ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200/80" : "border-white/12 bg-white/5 text-white/40"}`}
                  >
                    {d.channel.replace(/_/g, " ")}: {d.ok ? "delivered" : d.detail}
                  </span>
                ))
              )}
            </div>
            <div className="mt-2 flex gap-2">
              {n.status === "unread" && (
                <Button size="sm" variant="ghost" className="h-6 text-[10.5px] font-light text-white/55" onClick={() => onRead(n.id)}>
                  <Check className="mr-1 h-3 w-3" /> mark read
                </Button>
              )}
              {n.status !== "acknowledged" && (
                <Button size="sm" variant="ghost" className="h-6 text-[10.5px] font-light text-white/55" onClick={() => onAcknowledge(n.id)}>
                  <CheckCheck className="mr-1 h-3 w-3" /> acknowledge
                </Button>
              )}
              {n.status === "acknowledged" && (
                <span className="text-[10px] font-light text-emerald-200/70">acknowledged by this operator</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    )}
  </section>
);

export default StaffNotificationsPanel;
