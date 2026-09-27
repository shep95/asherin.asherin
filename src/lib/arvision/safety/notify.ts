// asherin.arvision — staff notification pipeline.
//
// The rule this file exists to keep: a channel is reported as delivered only
// when something actually accepted the message. An in-app notice is delivered
// because it is sitting in a list the operator can open. A push, an email or an
// sms is delivered only when a configured provider returned success — and with
// no provider configured, the channel says exactly that instead of showing a
// hopeful tick.
//
// The operator inbox channel writes into the same notifications the rest of
// asherin already uses, so a safety event reaches the bell the operator is
// already watching rather than a second inbox nobody opens.

import { supabase } from "@/integrations/supabase/client";
import type { VisionEvent } from "../vision/types";
import { EVENT_LABEL } from "../vision/eventEngine";

export type NotifyChannel = "in_app" | "operator_inbox" | "push" | "email" | "sms";

export interface NotifyResult {
  channel: NotifyChannel;
  ok: boolean;
  /** what happened, in the operator's words. printed next to the notification. */
  detail: string;
}

export interface SafetyNotification {
  id: string;
  atMs: number;
  eventId: string;
  eventType: VisionEvent["type"];
  title: string;
  body: string;
  cameraLabel: string;
  zoneLabel: string | null;
  confidence: number;
  incidentId: string | null;
  /** the evidence bundle id, when a capture succeeded. */
  evidenceId: string | null;
  evidenceState: string;
  status: "unread" | "read" | "acknowledged";
  delivery: NotifyResult[];
}

export interface NotificationProvider {
  channel: NotifyChannel;
  /** whether this provider can actually deliver right now, and why not if it cannot. */
  readiness(): { ready: boolean; detail: string };
  send(n: SafetyNotification): Promise<NotifyResult>;
}

function severityFor(confidence: number, type: VisionEvent["type"]): "info" | "notable" | "critical" {
  if (type === "person_on_ground" || type === "contact_impulse") return "critical";
  if (confidence >= 0.7) return "notable";
  return "info";
}

/** Always available: the notification is the list entry. */
class InAppProvider implements NotificationProvider {
  channel: NotifyChannel = "in_app";
  readiness() {
    return { ready: true, detail: "shown in the safety console in this session" };
  }
  async send(): Promise<NotifyResult> {
    return { channel: "in_app", ok: true, detail: "listed in the safety console" };
  }
}

/** Writes into the notifications the operator's bell already reads. */
class OperatorInboxProvider implements NotificationProvider {
  channel: NotifyChannel = "operator_inbox";
  private lastFailure: string | null = null;

  readiness() {
    return this.lastFailure
      ? { ready: false, detail: this.lastFailure }
      : { ready: true, detail: "writes to the notification bell for the signed-in operator" };
  }

  async send(n: SafetyNotification): Promise<NotifyResult> {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) {
        const detail = "no operator is signed in, so there is no inbox to write to";
        this.lastFailure = detail;
        return { channel: "operator_inbox", ok: false, detail };
      }
      const { error } = await supabase.from("intel_notifications").insert({
        user_id: userId,
        kind: "arvision_safety",
        severity: severityFor(n.confidence, n.eventType),
        title: n.title,
        body: n.body,
        source: n.cameraLabel,
        subject_name: n.zoneLabel ?? n.cameraLabel,
        // one row per incident, so a repeating detector cannot flood the bell.
        idempotency_key: `arvision:${n.incidentId ?? n.eventId}`,
        sections: [
          {
            heading: "measurement",
            body: n.body,
          },
          {
            heading: "evidence",
            body: n.evidenceState,
          },
        ],
      });
      if (error) {
        this.lastFailure = `the notification store refused the write: ${error.message}`;
        return { channel: "operator_inbox", ok: false, detail: this.lastFailure };
      }
      this.lastFailure = null;
      return { channel: "operator_inbox", ok: true, detail: "delivered to the operator's notification bell" };
    } catch (e) {
      this.lastFailure = `the notification store could not be reached: ${(e as Error).message}`;
      return { channel: "operator_inbox", ok: false, detail: this.lastFailure };
    }
  }
}

/**
 * Push, email and sms have no provider wired to this console. They exist here
 * as declared, unconfigured channels so the gap is visible in the interface
 * rather than discovered during an incident.
 */
class UnconfiguredProvider implements NotificationProvider {
  constructor(
    public channel: NotifyChannel,
    private reason: string,
  ) {}
  readiness() {
    return { ready: false, detail: this.reason };
  }
  async send(): Promise<NotifyResult> {
    return { channel: this.channel, ok: false, detail: `not sent — ${this.reason}` };
  }
}

export interface NotifierChannelState {
  channel: NotifyChannel;
  enabled: boolean;
  ready: boolean;
  detail: string;
}

const ENABLED_KEY = "arvision.safety.channels.v1";

export class SafetyNotifier {
  private providers: NotificationProvider[] = [
    new InAppProvider(),
    new OperatorInboxProvider(),
    new UnconfiguredProvider("push", "no push provider is configured for this console"),
    new UnconfiguredProvider("email", "no email provider is configured for this console"),
    new UnconfiguredProvider("sms", "no sms provider is configured for this console"),
  ];
  private enabled: Record<string, boolean> = { in_app: true, operator_inbox: true, push: false, email: false, sms: false };
  private items: SafetyNotification[] = [];
  private listeners = new Set<(n: SafetyNotification[]) => void>();
  private seq = 0;

  constructor() {
    try {
      const raw = localStorage.getItem(ENABLED_KEY);
      if (raw) this.enabled = { ...this.enabled, ...(JSON.parse(raw) as Record<string, boolean>) };
    } catch {
      /* defaults stand */
    }
  }

  subscribe(fn: (n: SafetyNotification[]) => void): () => void {
    this.listeners.add(fn);
    fn(this.list());
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const snapshot = this.list();
    this.listeners.forEach((l) => l(snapshot));
  }

  list(): SafetyNotification[] {
    return this.items.slice();
  }

  channels(): NotifierChannelState[] {
    return this.providers.map((p) => {
      const r = p.readiness();
      return { channel: p.channel, enabled: Boolean(this.enabled[p.channel]), ready: r.ready, detail: r.detail };
    });
  }

  setChannel(channel: NotifyChannel, on: boolean) {
    this.enabled[channel] = on;
    try {
      localStorage.setItem(ENABLED_KEY, JSON.stringify(this.enabled));
    } catch {
      /* the session still honours it */
    }
    this.emit();
  }

  markRead(id: string) {
    const n = this.items.find((i) => i.id === id);
    if (!n) return;
    n.status = n.status === "unread" ? "read" : n.status;
    this.emit();
  }

  acknowledge(id: string) {
    const n = this.items.find((i) => i.id === id);
    if (!n) return;
    n.status = "acknowledged";
    this.emit();
  }

  unread(): number {
    return this.items.filter((i) => i.status === "unread").length;
  }

  /** Notify staff about one safety event. Returns the per-channel truth. */
  async notify(event: VisionEvent, meta: { incidentId: string | null; evidenceId: string | null; evidenceState: string }): Promise<SafetyNotification> {
    this.seq += 1;
    const notification: SafetyNotification = {
      id: `ntf_${event.openedAtMs.toString(36)}_${this.seq}`,
      atMs: Date.now(),
      eventId: event.id,
      eventType: event.type,
      title: `${EVENT_LABEL[event.type]} — ${event.cameraLabel}`,
      body: event.detail,
      cameraLabel: event.cameraLabel,
      zoneLabel: event.zoneLabel,
      confidence: event.confidence,
      incidentId: meta.incidentId,
      evidenceId: meta.evidenceId,
      evidenceState: meta.evidenceState,
      status: "unread",
      delivery: [],
    };

    this.items = [notification, ...this.items].slice(0, 200);
    this.emit();

    const results = await Promise.all(
      this.providers.map(async (p) => {
        if (!this.enabled[p.channel]) {
          return { channel: p.channel, ok: false, detail: "channel turned off by the operator" } satisfies NotifyResult;
        }
        try {
          return await p.send(notification);
        } catch (e) {
          return { channel: p.channel, ok: false, detail: `delivery failed: ${(e as Error).message}` } satisfies NotifyResult;
        }
      }),
    );
    notification.delivery = results;
    this.emit();
    return notification;
  }

  clear() {
    this.items = [];
    this.emit();
  }
}

let singleton: SafetyNotifier | null = null;
export function safetyNotifier(): SafetyNotifier {
  if (!singleton) singleton = new SafetyNotifier();
  return singleton;
}
