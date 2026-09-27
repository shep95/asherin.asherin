// asherin.arvision — shared session
// The uploaded package shares poses over Apple MultipeerConnectivity on the local
// network, which a browser cannot join. The same message set (playerInfo, poseUpdate)
// is carried over an authenticated realtime channel instead, at the package's 20 Hz.
// Only signed-in accounts can join, and the room key never leaves the channel name.

import { supabase } from "@/integrations/supabase/client";
import type { PeerState, PlayerInfo, PoseUpdate } from "./types";

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
  private peers = new Map<string, PeerState>();
  private lastSendAt = 0;
  private sweep: ReturnType<typeof setInterval> | null = null;
  private peerId = "";

  constructor(private events: SessionEvents) {}

  get localPeerId() {
    return this.peerId;
  }

  get isJoined() {
    return this.channel !== null;
  }

  async join(roomCode: string, info: PlayerInfo): Promise<string | null> {
    const clean = roomCode.trim();
    if (clean.length < 3) return "room code needs at least three characters";
    if (this.channel) await this.leave();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return "sign in before joining a shared session";
    this.peerId = `${auth.user.id.slice(0, 8)}-${Math.random().toString(36).slice(2, 6)}`;

    this.events.onStatus("joining session", false);
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

  async leave() {
    if (this.sweep) {
      clearInterval(this.sweep);
      this.sweep = null;
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
    if (!this.channel) return false;
    if (now - this.lastSendAt < POSE_INTERVAL_MS) return false;
    this.lastSendAt = now;
    void this.channel.send({
      type: "broadcast",
      event: "poseUpdate",
      payload: { peerId: this.peerId, pose },
    });
    return true;
  }

  sendPlayerInfo(info: PlayerInfo) {
    if (!this.channel) return;
    void this.channel.send({ type: "broadcast", event: "playerInfo", payload: { peerId: this.peerId, ...info } });
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
