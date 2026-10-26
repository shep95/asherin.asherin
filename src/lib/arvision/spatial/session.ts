// asherin.arvision — shared session
// The uploaded package shares poses over Apple MultipeerConnectivity on the local
// network, which a browser cannot join. The same message set (playerInfo, poseUpdate)
// is carried at the package's 20 Hz over whatever transport this edition has:
//
// - on the device edition there is no realtime relay. the local client's channel
//   shim reports SUBSCRIBED and drops every message, which would read as a live
//   session nobody can hear. so the device edition uses a BroadcastChannel named
//   after the room key: every open asherin tab on this one device hears it, and
//   nothing leaves the device. the status line says exactly that.
// - with a hosted realtime client the same code path uses the channel.

import { supabase } from "@/integrations/supabase/client";
import type { PeerState, PlayerInfo, PoseUpdate } from "./types";

/** true when the client is the device shim: its channels deliver nothing. */
export function isDeviceEdition(client: unknown = supabase): boolean {
  const url = (client as { supabaseUrl?: unknown })?.supabaseUrl;
  return typeof url === "string" && url.startsWith("local://");
}

type LocalMessage =
  | { event: "playerInfo"; payload: { peerId: string } & PlayerInfo }
  | { event: "poseUpdate"; payload: { peerId: string; pose: PoseUpdate } }
  | { event: "leave"; payload: { peerId: string } };

const POSE_INTERVAL_MS = 50; // 20 Hz, matches the package pose timer
const PEER_TIMEOUT_MS = 8000;

export interface SessionEvents {
  onPeers: (peers: PeerState[]) => void;
  onStatus: (status: string, connected: boolean) => void;
}

/** Vibrant player colour, ported from MultipeerManager.randomVibrantColor(). */
export function randomVibrantColor(): { r: number; g: number; b: number } {
  const hue = Math.random();
  const saturation = 0.6 + Math.random() * 0.4;
  const brightness = 0.7 + Math.random() * 0.3;

  const c = brightness * saturation;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = brightness - c;

  let r = 0;
  let g = 0;
  let b = 0;
  switch (Math.floor(hue * 6) % 6) {
    case 0: r = c; g = x; break;
    case 1: r = x; g = c; break;
    case 2: g = c; b = x; break;
    case 3: g = x; b = c; break;
    case 4: r = x; b = c; break;
    default: r = c; b = x; break;
  }
  return { r: r + m, g: g + m, b: b + m };
}

export function roomChannelName(roomCode: string): string {
  const clean = roomCode.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 48);
  return `arvision:${clean}`;
}

export class SpatialSession {
  private channel: ReturnType<typeof supabase.channel> | null = null;
  private local: BroadcastChannel | null = null;
  private peers = new Map<string, PeerState>();
  private lastSendAt = 0;
  private sweep: ReturnType<typeof setInterval> | null = null;
  private peerId = "";
  private selfInfo: PlayerInfo | null = null;

  constructor(private events: SessionEvents) {}

  get localPeerId() {
    return this.peerId;
  }

  get isJoined() {
    return this.channel !== null || this.local !== null;
  }

  async join(roomCode: string, info: PlayerInfo): Promise<string | null> {
    const clean = roomCode.trim();
    if (clean.length < 3) return "room code needs at least three characters";
    if (this.isJoined) await this.leave();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return "this device has no identity yet — reload the page";
    this.peerId = `${auth.user.id.slice(0, 8)}-${Math.random().toString(36).slice(2, 6)}`;
    this.selfInfo = info;

    this.events.onStatus("joining session", false);

    if (isDeviceEdition()) {
      if (typeof BroadcastChannel === "undefined") {
        this.events.onStatus("not connected", false);
        return "this browser cannot share a session between its own tabs, and this edition has no relay between devices";
      }
      const local = new BroadcastChannel(roomChannelName(clean));
      local.onmessage = (ev: MessageEvent<LocalMessage>) => {
        const message = ev.data;
        if (!message || typeof message !== "object") return;
        if (message.event === "playerInfo") {
          // a tab that joined after us has never heard our name: answer once
          // so it does not label us "peer" until our next playerInfo.
          const known = this.peers.has(message.payload.peerId);
          this.mergePeer(message.payload, null);
          if (!known && this.selfInfo) this.post({ event: "playerInfo", payload: { peerId: this.peerId, ...this.selfInfo } });
        } else if (message.event === "poseUpdate") {
          if (!message.payload?.peerId || !message.payload.pose) return;
          this.mergePeer({ peerId: message.payload.peerId, playerName: "", colorR: 0.8, colorG: 0.8, colorB: 0.8 }, message.payload.pose);
        } else if (message.event === "leave") {
          this.peers.delete(message.payload.peerId);
          this.emitPeers();
        }
      };
      this.local = local;
      this.post({ event: "playerInfo", payload: { peerId: this.peerId, ...info } });
      this.sweep = setInterval(() => this.dropStalePeers(), 2000);
      this.events.onStatus("session live — other asherin tabs on this device only", true);
      return null;
    }
    const channel = supabase.channel(roomChannelName(clean), {
      config: { broadcast: { self: false }, presence: { key: this.peerId } },
    });

    channel.on("broadcast", { event: "playerInfo" }, ({ payload }) => {
      this.mergePeer(payload as { peerId: string } & PlayerInfo, null);
    });
    channel.on("broadcast", { event: "poseUpdate" }, ({ payload }) => {
      const body = payload as { peerId: string; pose: PoseUpdate };
      if (!body?.peerId || !body.pose) return;
      this.mergePeer({ peerId: body.peerId, playerName: "", colorR: 0.8, colorG: 0.8, colorB: 0.8 }, body.pose);
    });
    channel.on("presence", { event: "leave" }, ({ leftPresences }) => {
      for (const presence of leftPresences as { key?: string }[]) {
        if (presence?.key) this.peers.delete(presence.key);
      }
      this.emitPeers();
    });

    const status = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve("TIMED_OUT"), 10000);
      channel.subscribe((state) => {
        if (state === "SUBSCRIBED" || state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
          clearTimeout(timer);
          resolve(state);
        }
      });
    });

    if (status !== "SUBSCRIBED") {
      try {
        await supabase.removeChannel(channel);
      } catch {
        /* channel already gone */
      }
      this.events.onStatus(`session unavailable (${status.toLowerCase()})`, false);
      return `could not join the session channel (${status.toLowerCase()})`;
    }

    this.channel = channel;
    await channel.track({ peerId: this.peerId, name: info.playerName });
    await channel.send({ type: "broadcast", event: "playerInfo", payload: { peerId: this.peerId, ...info } });

    this.sweep = setInterval(() => this.dropStalePeers(), 2000);
    this.events.onStatus("session live", true);
    return null;
  }

  private post(message: LocalMessage) {
    try {
      this.local?.postMessage(message);
    } catch {
      /* a closed channel drops the message; the peer sweep removes us on the other side */
    }
  }

  async leave() {
    if (this.sweep) {
      clearInterval(this.sweep);
      this.sweep = null;
    }
    if (this.local) {
      this.post({ event: "leave", payload: { peerId: this.peerId } });
      this.local.close();
      this.local = null;
    }
    if (this.channel) {
      try {
        await supabase.removeChannel(this.channel);
      } catch {
        /* channel already gone */
      }
      this.channel = null;
    }
    this.peers.clear();
    this.emitPeers();
    this.events.onStatus("not connected", false);
  }

  /** Throttled to the package's 20 Hz pose rate. Returns true when actually sent. */
  sendPose(pose: PoseUpdate, now = Date.now()): boolean {
    if (!this.isJoined) return false;
    if (now - this.lastSendAt < POSE_INTERVAL_MS) return false;
    this.lastSendAt = now;
    if (this.local) {
      this.post({ event: "poseUpdate", payload: { peerId: this.peerId, pose } });
      return true;
    }
    void this.channel?.send({
      type: "broadcast",
      event: "poseUpdate",
      payload: { peerId: this.peerId, pose },
    });
    return true;
  }

  sendPlayerInfo(info: PlayerInfo) {
    if (!this.isJoined) return;
    if (this.local) {
      this.post({ event: "playerInfo", payload: { peerId: this.peerId, ...info } });
      return;
    }
    void this.channel?.send({ type: "broadcast", event: "playerInfo", payload: { peerId: this.peerId, ...info } });
  }

  private mergePeer(info: { peerId: string } & PlayerInfo, pose: PoseUpdate | null) {
    if (!info.peerId || info.peerId === this.peerId) return;
    const existing = this.peers.get(info.peerId);
    this.peers.set(info.peerId, {
      peerId: info.peerId,
      playerName: info.playerName || existing?.playerName || "peer",
      colorR: info.playerName ? info.colorR : existing?.colorR ?? info.colorR,
      colorG: info.playerName ? info.colorG : existing?.colorG ?? info.colorG,
      colorB: info.playerName ? info.colorB : existing?.colorB ?? info.colorB,
      pose: pose ?? existing?.pose ?? null,
      lastSeen: Date.now(),
    });
    this.emitPeers();
  }

  private dropStalePeers() {
    const cutoff = Date.now() - PEER_TIMEOUT_MS;
    let changed = false;
    for (const [id, peer] of this.peers) {
      if (peer.lastSeen < cutoff) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.emitPeers();
  }

  private emitPeers() {
    this.events.onPeers([...this.peers.values()].sort((a, b) => a.playerName.localeCompare(b.playerName)));
  }
}

export const SESSION_CONSTANTS = { POSE_INTERVAL_MS, PEER_TIMEOUT_MS };
