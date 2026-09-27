/**
 * AUTO TRIP SENTINEL — motion state-machine tests.
 *
 * These exercise the four decisions that decide whether a rider ends up with a
 * record: a walk must not arm, a real drive must, a red light must not close
 * the ride, and a hand-started trip must never be closed by the machine.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const recorderState = {
  status: "idle" as "idle" | "recording",
  tripId: null as string | null,
  startedAt: null as number | null,
};

const startMock = vi.fn(async () => {
  recorderState.status = "recording";
  recorderState.tripId = "trip-1";
  recorderState.startedAt = Date.now();
});
const stopMock = vi.fn(async () => {
  const id = recorderState.tripId;
  recorderState.status = "idle";
  recorderState.tripId = null;
  return id;
});

vi.mock("@/lib/rideshare/tripRecorder", () => ({
  tripRecorder: {
    getState: () => ({ ...recorderState }),
    start: startMock,
    stop: stopMock,
    restore: vi.fn(async () => false),
  },
}));
vi.mock("@/lib/native/nativeRuntime", () => ({ isNativeApp: () => false }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));

type FixCb = (p: unknown) => void;
let emit: FixCb = () => {};

function fix(t: number, lat: number, lon: number, speed: number | null) {
  return { timestamp: t, coords: { latitude: lat, longitude: lon, accuracy: 12, speed } };
}

/** ~0.0009° latitude ≈ 100 m. */
const latAt = (metres: number) => 40.7 + metres / 111_320;

describe("auto trip sentinel", () => {
  let autoTrip: typeof import("@/lib/rideshare/autoTrip").autoTrip;

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    recorderState.status = "idle";
    recorderState.tripId = null;
    recorderState.startedAt = null;
    startMock.mockClear();
    stopMock.mockClear();

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        geolocation: {
          watchPosition: (cb: FixCb) => { emit = cb; return 1; },
          clearWatch: () => {},
          getCurrentPosition: (cb: FixCb) => cb(fix(0, 40.7, -74, 0)),
        },
        permissions: { query: async () => ({ state: "granted" }) },
      },
    });

    autoTrip = (await import("@/lib/rideshare/autoTrip")).autoTrip;
    await autoTrip.start();
  });

  it("does not arm on a walk", async () => {
    const t0 = Date.now();
    for (let i = 0; i <= 12; i++) {
      emit(fix(t0 + i * 10_000, latAt(i * 14), -74, 1.4)); // 1.4 m/s over two minutes
    }
    await Promise.resolve();
    expect(startMock).not.toHaveBeenCalled();
  });

  it("does not arm on a single GPS speed spike", async () => {
    const t0 = Date.now();
    emit(fix(t0, latAt(0), -74, 0.4));
    emit(fix(t0 + 10_000, latAt(6), -74, 18)); // one bad sample
    emit(fix(t0 + 20_000, latAt(12), -74, 0.5));
    await Promise.resolve();
    expect(startMock).not.toHaveBeenCalled();
  });

  it("arms on sustained vehicle speed with real displacement", async () => {
    const t0 = Date.now();
    for (let i = 0; i <= 7; i++) {
      emit(fix(t0 + i * 10_000, latAt(i * 120), -74, 12)); // 12 m/s for 70 s, 840 m
    }
    await vi.waitFor(() => expect(startMock).toHaveBeenCalledTimes(1));
    expect(recorderState.status).toBe("recording");
  });

  it("does not close the ride at a red light", async () => {
    const t0 = Date.now();
    for (let i = 0; i <= 7; i++) emit(fix(t0 + i * 10_000, latAt(i * 120), -74, 12));
    await vi.waitFor(() => expect(startMock).toHaveBeenCalled());

    const t1 = t0 + 80_000;
    for (let i = 0; i <= 8; i++) emit(fix(t1 + i * 10_000, latAt(840), -74, 0)); // 80 s stopped
    await Promise.resolve();
    expect(stopMock).not.toHaveBeenCalled();
  });

  it("closes the ride after five minutes stationary", async () => {
    const t0 = Date.now();
    for (let i = 0; i <= 7; i++) emit(fix(t0 + i * 10_000, latAt(i * 120), -74, 12));
    await vi.waitFor(() => expect(startMock).toHaveBeenCalled());

    const t1 = t0 + 80_000;
    for (let i = 0; i <= 32; i++) emit(fix(t1 + i * 10_000, latAt(840), -74, 0)); // 320 s stopped
    await vi.waitFor(() => expect(stopMock).toHaveBeenCalledTimes(1));
  });

  it("never closes a trip the rider started by hand", async () => {
    // Hand-started: the recorder is recording but the sentinel never claimed it.
    recorderState.status = "recording";
    recorderState.tripId = "manual-trip";
    recorderState.startedAt = Date.now();

    const t0 = Date.now();
    for (let i = 0; i <= 40; i++) emit(fix(t0 + i * 10_000, latAt(0), -74, 0));
    await Promise.resolve();
    expect(stopMock).not.toHaveBeenCalled();
  });
});
