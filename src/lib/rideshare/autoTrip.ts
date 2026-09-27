/**
 * AUTO TRIP SENTINEL — the recorder that does not wait to be asked.
 *
 * NARRATIVE
 * A rider who has to open the app, find the tab and press "start" before the
 * car pulls away will, on the ride that actually matters, not have pressed it.
 * The record that exists is the one nobody had to remember. So the arming
 * decision moves off the rider and onto the motion of the phone itself: the
 * sentinel watches location at low power, and when the phone starts behaving
 * like a phone in a moving vehicle it opens a trip on its own; when the vehicle
 * has plainly been parked for a while it closes and analyses it.
 *
 * FLAWS THIS DESIGN IS BUILT AGAINST
 * - Prompt ambush. Auto-arming must never be the thing that first asks for
 *   location, so the sentinel only watches when permission is ALREADY granted.
 * - Walking is not driving. A single 13 mph GPS spike happens to pedestrians
 *   with bad multipath, so arming needs sustained speed AND real displacement
 *   over a real interval, not one sample.
 * - Traffic is not arrival. A red light must not end the ride, so disarming
 *   needs a long stationary window with almost no displacement.
 * - Hijacking the rider. The sentinel may only close a trip IT opened; a
 *   manually started recording belongs to the person who started it.
 * - Silent surprise. Every automatic transition announces itself, and the
 *   whole behaviour is one switch the rider can turn off permanently.
 * - Battery. The idle watch is coarse and throttled; the precise, expensive
 *   sampling only exists inside an actual recording.
 */

import { tripRecorder } from "./tripRecorder";
import { isNativeApp } from "@/lib/native/nativeRuntime";
import { watchSamples, ensureNativePermission, type GeoSample, type GeoHandle } from "@/lib/native/nativeGeo";
import { toast } from "sonner";

const ENABLED_KEY = "asherin.trip.auto.enabled.v1";
const OWNER_KEY = "asherin.trip.auto.owned.v1";

/** Sustained ground speed that separates a vehicle from a walk or a bike. */
const ARM_SPEED_MPS = 6.0;          // ≈ 13.4 mph
/** How long that speed must hold before a trip is opened. */
const ARM_SUSTAIN_MS = 45_000;
/** And how far the phone must actually have travelled in that window. */
const ARM_DISPLACEMENT_M = 350;
/** Below this, the phone is standing still. */
const STILL_SPEED_MPS = 1.2;
/** How long it must stand still before the ride is called over. */
const DISARM_STILL_MS = 300_000;    // 5 minutes — longer than any traffic light
const DISARM_RADIUS_M = 80;
/** A recording this long is a forgotten one; close it rather than run forever. */
const MAX_TRIP_MS = 6 * 3_600_000;
/** Fixes this inaccurate say nothing about motion. */
const MAX_USABLE_ACCURACY_M = 120;

export interface AutoTripState {
  enabled: boolean;
  supported: boolean;
  /** "off" | "no-permission" | "watching" | "arming" | "recording" | "cooldown" */
  phase: "off" | "no-permission" | "watching" | "arming" | "recording";
  lastSpeedMps: number | null;
  armingSinceMs: number | null;
  stillSinceMs: number | null;
  note: string;
}

type Listener = (s: AutoTripState) => void;

interface Sample { t: number; lat: number; lon: number; v: number }

function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const p = Math.PI / 180;
  const dLat = (b.lat - a.lat) * p, dLon = (b.lon - a.lon) * p;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(s)));
}

class AutoTripSentinel {
  private state: AutoTripState = {
    enabled: false,
    supported: typeof navigator !== "undefined" && "geolocation" in navigator,
    phase: "off",
    lastSpeedMps: null,
    armingSinceMs: null,
    stillSinceMs: null,
    note: "Automatic capture has not been started.",
  };
  private listeners = new Set<Listener>();
  private watch: GeoHandle | null = null;
  private window: Sample[] = [];
  private stillAnchor: Sample | null = null;
  private busy = false;
  private started = false;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  getState(): AutoTripState { return this.state; }

  private set(patch: Partial<AutoTripState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  isEnabled(): boolean {
    try {
      const raw = localStorage.getItem(ENABLED_KEY);
      // Default ON: the rider asked for a recorder that does not need asking.
      // It still cannot act without an existing location grant.
      return raw === null ? true : raw === "1";
    } catch { return false; }
  }

  /** True when the trip currently recording was opened by this sentinel. */
  private owns(tripId: string | null): boolean {
    if (!tripId) return false;
    try { return localStorage.getItem(OWNER_KEY) === tripId; } catch { return false; }
  }

  private claim(tripId: string | null) {
    try {
      if (tripId) localStorage.setItem(OWNER_KEY, tripId);
      else localStorage.removeItem(OWNER_KEY);
    } catch { /* storage denied — the sentinel simply will not auto-close */ }
  }

  async setEnabled(on: boolean): Promise<void> {
    try { localStorage.setItem(ENABLED_KEY, on ? "1" : "0"); } catch { /* ignore */ }
    this.set({ enabled: on });
    if (on) await this.arm();
    else this.disarmWatch("Automatic capture is off. Trips must be started by hand.");
  }

  /**
   * Called once at app start. Idempotent: repeated mounts must not stack
   * geolocation watchers, which is how a page with two providers ends up
   * draining a battery twice as fast.
   */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.set({ enabled: this.isEnabled() });
    // A reload mid-ride resumes the recording itself; the sentinel then simply
    // supervises the trip it may already own.
    try { await tripRecorder.restore(); } catch { /* recorder reports its own errors */ }
    if (!this.state.enabled) {
      this.set({ phase: "off", note: "Automatic capture is off." });
      return;
    }
    await this.arm();
  }

  /** Explicit permission request, used by the UI's "turn on" affordance. */
  async requestPermission(): Promise<boolean> {
    if (!this.state.supported) return false;
    // On native the grant belongs to the app, not the WebView; asking the
    // browser there prompts the wrong permission and can silently fail.
    if (isNativeApp()) {
      const granted = await ensureNativePermission();
      if (granted) await this.arm();
      else this.set({ phase: "no-permission", note: "Location permission was refused, so trips cannot arm themselves." });
      return granted;
    }
    const ok = await new Promise<boolean>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        () => resolve(false),
        { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
      );
    });
    if (ok) await this.arm();
    else this.set({ phase: "no-permission", note: "Location permission was refused, so trips cannot arm themselves." });
    return ok;
  }

  private async permissionGranted(): Promise<boolean> {
    // On native the app holds its own grant and the Permissions API is unreliable.
    if (isNativeApp()) return true;
    try {
      const p = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
      return p?.state === "granted";
    } catch {
      return false;
    }
  }

  private async arm(): Promise<void> {
    if (!this.state.supported) {
      this.set({ phase: "off", note: "This device exposes no location sensor." });
      return;
    }
    if (!(await this.permissionGranted())) {
      this.set({
        phase: "no-permission",
        note: "Automatic capture is ready but location has not been granted on this device yet.",
      });
      return;
    }
    if (this.watch) return;
    // The OS-level watch: a phone that locks in a pocket is the normal case for
    // a ride, and a WebView watch is suspended there, so a browser-only watch
    // would arm on the walk to the kerb and then go blind for the drive.
    this.watch = watchSamples(
      (s) => this.onFix(s),
      (kind) => {
        if (kind === "denied") {
          this.disarmWatch("Location permission was refused, so trips cannot arm themselves.");
          this.set({ phase: "no-permission" });
        }
        // transient unavailability is not a state change
      },
      // Coarse and cached: this watch only has to notice that a car is moving.
      { highAccuracy: false, maximumAge: 20_000, timeout: 60_000 },
    );
    this.set({
      phase: tripRecorder.getState().status === "recording" ? "recording" : "watching",
      note: "Watching for vehicle motion. A drive starts recording on its own.",
    });
  }

  private disarmWatch(note: string) {
    if (this.watch) { this.watch.stop(); this.watch = null; }
    this.window = [];
    this.stillAnchor = null;
    this.set({ phase: "off", armingSinceMs: null, stillSinceMs: null, note });
  }

  private onFix(s: GeoSample) {
    const acc = s.accuracy_m;
    if (acc != null && acc > MAX_USABLE_ACCURACY_M) return;

    const now = s.t;
    const lat = s.lat, lon = s.lon;
    const prev = this.window[this.window.length - 1];

    // Prefer the sensor's own Doppler speed; derive it only when absent, since a
    // derived speed inherits every metre of GPS jitter.
    let v = s.speed_mps ?? 0;
    if (s.speed_mps == null && prev) {
      const dt = (now - prev.t) / 1000;
      if (dt > 0.5) v = Math.min(60, haversineM(prev, { lat, lon }) / dt);
    }

    const sample: Sample = { t: now, lat, lon, v };
    this.window.push(sample);
    // Keep only the window the decisions need.
    const horizon = now - Math.max(ARM_SUSTAIN_MS, DISARM_STILL_MS) - 30_000;
    while (this.window.length > 2 && this.window[0].t < horizon) this.window.shift();
    this.set({ lastSpeedMps: Math.round(v * 100) / 100 });

    const rec = tripRecorder.getState();
    if (rec.status === "recording") this.evaluateStop(sample, rec.tripId, rec.startedAt);
    else if (rec.status === "idle") this.evaluateStart(sample);
  }

  private evaluateStart(sample: Sample) {
    if (this.busy) return;
    if (sample.v < ARM_SPEED_MPS) {
      if (this.state.armingSinceMs) this.set({ armingSinceMs: null, phase: "watching" });
      return;
    }
    const since = this.state.armingSinceMs ?? sample.t;
    if (!this.state.armingSinceMs) {
      this.set({ armingSinceMs: since, phase: "arming", note: "Vehicle-speed motion detected — confirming before recording." });
      return;
    }
    if (sample.t - since < ARM_SUSTAIN_MS) return;

    // Sustained speed alone can be a GPS artefact; require the phone to have
    // genuinely covered ground in the same window.
    const first = this.window.find((s) => s.t >= since) ?? this.window[0];
    if (haversineM(first, sample) < ARM_DISPLACEMENT_M) return;

    void this.autoStart();
  }

  private async autoStart() {
    this.busy = true;
    try {
      await tripRecorder.start({ label: "Auto-captured drive", platform: "uber" });
      const st = tripRecorder.getState();
      if (st.status === "recording") {
        this.claim(st.tripId);
        this.stillAnchor = null;
        this.set({ phase: "recording", armingSinceMs: null, stillSinceMs: null, note: "Recording automatically — this drive is being captured." });
        toast.success("Trip recording started automatically.", { description: "Asherin detected vehicle motion and opened the black box." });
      } else {
        this.set({ phase: "watching", armingSinceMs: null, note: st.error || "Could not open a trip record; will retry on the next drive." });
      }
    } finally {
      this.busy = false;
    }
  }

  private evaluateStop(sample: Sample, tripId: string | null, startedAt: number | null) {
    if (this.busy) return;
    if (this.state.phase !== "recording") this.set({ phase: "recording" });

    if (startedAt && Date.now() - startedAt > MAX_TRIP_MS && this.owns(tripId)) {
      void this.autoStop("Recording ran past six hours and was closed automatically.");
      return;
    }
    if (!this.owns(tripId)) return; // a hand-started trip is the rider's to end

    if (sample.v > STILL_SPEED_MPS) {
      if (this.state.stillSinceMs) this.set({ stillSinceMs: null });
      this.stillAnchor = null;
      return;
    }
    if (!this.stillAnchor || !this.state.stillSinceMs) {
      this.stillAnchor = sample;
      this.set({ stillSinceMs: sample.t });
      return;
    }
    // Any real movement away from the anchor means the car is still in the ride.
    if (haversineM(this.stillAnchor, sample) > DISARM_RADIUS_M) {
      this.stillAnchor = sample;
      this.set({ stillSinceMs: sample.t });
      return;
    }
    if (sample.t - this.state.stillSinceMs >= DISARM_STILL_MS) {
      void this.autoStop("Stationary for five minutes — the drive was closed and sent for analysis.");
    }
  }

  private async autoStop(reason: string) {
    this.busy = true;
    try {
      const id = await tripRecorder.stop(true);
      this.claim(null);
      this.stillAnchor = null;
      this.set({ phase: "watching", stillSinceMs: null, armingSinceMs: null, note: reason });
      if (id) toast.info("Trip recording closed automatically.", { description: reason });
    } finally {
      this.busy = false;
    }
  }
}

export const autoTrip = new AutoTripSentinel();
