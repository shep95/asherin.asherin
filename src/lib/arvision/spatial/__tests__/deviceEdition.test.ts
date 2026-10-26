// what the spatial layer may claim on a device with no server behind it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VPS_UNAVAILABLE_MESSAGE, getVpsStatus, localizeFrame } from "../vps";
import { SpatialSession, isDeviceEdition, roomChannelName } from "../session";
import { probeServices } from "../../sensors/services";

describe("camera positioning on the device edition", () => {
  it("is reported as not configured, with the reason, and never as an outage", async () => {
    const status = await getVpsStatus();
    expect(status.configured).toBe(false);
    expect(status.message).toBe(VPS_UNAVAILABLE_MESSAGE);
    expect(status.message).not.toMatch(/unreachable|failed/);
  });
  it("answers unavailable without a pose and without sending the frame", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await localizeFrame({
      imageBase64: "AAAA",
      intrinsics: { fx: 1, fy: 1, px: 0, py: 0, width: 2, height: 2, label: "t" } as never,
    });
    expect(result.unavailable).toBe(true);
    expect(result.poseFound).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  it("the sensors layer repeats the same sentence for the positioning service", async () => {
    const services = await probeServices();
    const positioning = services.find((s) => s.id === "positioning");
    expect(positioning?.online).toBe(false);
    expect(positioning?.detail).toBe(VPS_UNAVAILABLE_MESSAGE);
  });
});

/** a minimal same-realm BroadcastChannel so two sessions can hear each other in jsdom. */
class FakeBroadcastChannel {
  static rooms = new Map<string, Set<FakeBroadcastChannel>>();
  onmessage: ((ev: MessageEvent) => void) | null = null;
  constructor(public name: string) {
    if (!FakeBroadcastChannel.rooms.has(name)) FakeBroadcastChannel.rooms.set(name, new Set());
    FakeBroadcastChannel.rooms.get(name)!.add(this);
  }
  postMessage(data: unknown) {
    for (const peer of FakeBroadcastChannel.rooms.get(this.name) ?? []) {
      if (peer !== this) peer.onmessage?.({ data } as MessageEvent);
    }
  }
  close() {
    FakeBroadcastChannel.rooms.get(this.name)?.delete(this);
  }
}

describe("shared session on the device edition", () => {
  const original = (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
  beforeEach(() => {
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = FakeBroadcastChannel;
  });
  afterEach(() => {
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = original;
    FakeBroadcastChannel.rooms.clear();
  });

  it("recognises the local client by its url", () => {
    expect(isDeviceEdition({ supabaseUrl: "local://asherin" })).toBe(true);
    expect(isDeviceEdition({ supabaseUrl: "https://x.supabase.co" })).toBe(false);
    expect(isDeviceEdition({})).toBe(false);
    expect(roomChannelName("  Ops Room #1 ")).toBe("arvision:opsroom1");
  });

  it("two tabs on one device hear each other's player info and poses, and the status says so", async () => {
    const statusA: string[] = [];
    let peersB: { playerName: string }[] = [];
    const a = new SpatialSession({ onPeers: () => undefined, onStatus: (s) => statusA.push(s) });
    const b = new SpatialSession({ onPeers: (p) => { peersB = p; }, onStatus: () => undefined });
    expect(await a.join("room-1", { playerName: "alpha", colorR: 1, colorG: 0, colorB: 0 })).toBeNull();
    expect(statusA[statusA.length - 1]).toMatch(/this device only/);
    expect(await b.join("room-1", { playerName: "bravo", colorR: 0, colorG: 1, colorB: 0 })).toBeNull();
    // b announced itself; a now sends a pose which b hears
    expect(a.sendPose({ x: 1, y: 2, z: 3, qx: 0, qy: 0, qz: 0, qw: 1 } as never, 10_000)).toBe(true);
    expect(peersB.map((p) => p.playerName)).toEqual(["alpha"]);
    // leaving removes the peer on the other side
    await a.leave();
    expect(peersB).toEqual([]);
    expect(a.isJoined).toBe(false);
    await b.leave();
  });

  it("refuses a room key under three characters", async () => {
    const s = new SpatialSession({ onPeers: () => undefined, onStatus: () => undefined });
    expect(await s.join("ab", { playerName: "x", colorR: 0, colorG: 0, colorB: 0 })).toMatch(/three characters/);
  });
});
