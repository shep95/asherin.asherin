// asherin.arvision — the safety event engine.
//
// This is the layer that turns "there is a person box at these pixels" into
// "an object has been unattended for ninety seconds and the track that carried
// it is no longer in view". It is deliberately pure: no video element, no
// model, no canvas, no clock of its own. Frames go in, state machines advance,
// events and rule firings come out. That is what makes every machine below
// testable, and it is what stops a rendering trick from ever being called a
// detection.
//
// Four commitments are enforced in the code, not in the copy:
//
//   • a track id is camera-local and dies with the session. it answers "is this
//     the same tracked shape that put the bag down" and nothing else. it is
//     never a person, never a name, never carried between cameras.
//   • when tracking continuity breaks, the association is marked unknown. the
//     engine would rather say "the association was lost" than guess.
//   • confidence is computed from measured evidence — how long a track has been
//     held, whether the pose model scored the joints it needed, whether the
//     crossing geometry actually intersected. it is never a constant and never
//     a flourish.
//   • nothing here reads a face, an expression, clothing, or any trait of a
//     person. every machine measures where bodies and objects are, and how they
//     move.

import {
  bodyDistance,
  boxGapBodies,
  boxIou,
  footPoint,
  normalizeBox,
  unionBox,
  type NormBox,
} from "./geometry";
import {
  pointInPolygon,
  segmentsIntersect,
  sideOfLine,
  validateZones,
  zoneActiveAt,
  type Point,
  type SafetyZone,
  type ZoneProblem,
} from "./zones";
import type { ObservableSignal, RuleFiring } from "../safety/rules";
import {
  DEFAULT_ENGINE_CONFIG,
  type CustodyRecord,
  type VisionEngineConfig,
  type VisionEvent,
  type VisionEventType,
  type VisionFrameInput,
} from "./types";

// ---------------------------------------------------------------------------
// the rule each event type reports into. an operator who deletes a rule stops
// the incident, not the detection: the event still appears on the overlay and
// in the live list, it simply does not open an incident. that is deliberate —
// disabling a rule is a decision about paperwork, not about eyesight.
// ---------------------------------------------------------------------------

interface Reporting {
  ruleId: string;
  signal: ObservableSignal;
  /** the unit the value carries, matched to the rule's own unit. */
  unit: "count" | "seconds";
}

export const EVENT_REPORTING: Record<VisionEventType, Reporting | null> = {
  object_left: { ruleId: "left_object", signal: "object_left_behind", unit: "seconds" },
  object_retrieved_same_track: null,
  object_retrieved_different_track: null,
  object_retrieved_association_unknown: null,
  restricted_entry: { ruleId: "restricted_entry", signal: "restricted_zone_entry", unit: "count" },
  restricted_exit: null,
  barrier_crossing: { ruleId: "barrier_cross", signal: "barrier_crossing", unit: "count" },
  unusual_movement: { ruleId: "unusual_motion", signal: "unusual_movement", unit: "seconds" },
  prolonged_proximity: { ruleId: "prolonged_proximity", signal: "prolonged_proximity", unit: "seconds" },
  contact_impulse: { ruleId: "contact_impulse", signal: "physical_contact_impulse", unit: "count" },
  crowd_formation: { ruleId: "crowd_formation", signal: "crowd_density_exceeded", unit: "count" },
  extended_dwell: { ruleId: "extended_dwell", signal: "zone_dwell_exceeded", unit: "seconds" },
  rapid_approach: { ruleId: "rapid_approach", signal: "rapid_approach", unit: "count" },
  chase_like_trajectory: { ruleId: "chase_like", signal: "chase_like_trajectory", unit: "seconds" },
  person_on_ground: { ruleId: "person_on_ground", signal: "person_on_ground", unit: "seconds" },
};

/** Operator-facing wording. Never states intent, character or danger. */
export const EVENT_LABEL: Record<VisionEventType, string> = {
  object_left: "object left unattended",
  object_retrieved_same_track: "object retrieved by the associated track",
  object_retrieved_different_track: "object retrieved by a different track",
  object_retrieved_association_unknown: "object retrieved, retriever association unknown",
  restricted_entry: "entry into a restricted zone",
  restricted_exit: "exit from a restricted zone",
  barrier_crossing: "crossing over a barrier",
  unusual_movement: "sustained running in a walking-only zone",
  prolonged_proximity: "possible prolonged confrontation",
  contact_impulse: "possible physical contact",
  crowd_formation: "crowd formation above the configured occupancy",
  extended_dwell: "extended dwell",
  rapid_approach: "rapid approach between two tracks",
  chase_like_trajectory: "sustained pursuit-like movement",
  person_on_ground: "person on the ground",
};

// ---------------------------------------------------------------------------
// internal state
// ---------------------------------------------------------------------------

interface Sample {
  atMs: number;
  foot: Point;
  box: NormBox;
  bodySpeed: number;
  verticality: number;
}

interface ZoneMembership {
  enteredAtMs: number;
  /** grace period cleared — only then does presence count. */
  countedFromMs: number | null;
  entryFired: boolean;
  dwellFired: boolean;
}

interface TrackState {
  id: string;
  firstSeenMs: number;
  lastSeenMs: number;
  frames: number;
  missStreak: number;
  box: NormBox;
  foot: Point;
  bodySpeed: number;
  poseUsable: boolean;
  poseQuality: number;
  verticality: number;
  verticalitySource: "pose" | "geometry";
  groundSinceMs: number | null;
  runSinceMs: number | null;
  zones: Map<string, ZoneMembership>;
  barrierSide: Map<string, number>;
  history: Sample[];
  wristSpeed: number;
  lastWrists: Array<{ x: number; y: number; confidence: number }>;
}

interface PairState {
  key: string;
  a: string;
  b: string;
  closeSinceMs: number | null;
  lastDistance: number;
  lastSeenMs: number;
  /** mean absolute change in separation per second while close — the objective motion cue. */
  motionEnergy: number;
  chaseSinceMs: number | null;
}

interface ObjectState {
  objectId: string;
  label: string;
  box: NormBox;
  firstSeenMs: number;
  lastSeenMs: number;
  missStreak: number;
  ownerTrackId: string | null;
  ownerSinceMs: number | null;
  ownerFrames: number;
  associationCertain: boolean;
  /** set once the associated track stopped being continuously observable. */
  ownerContinuityLost: boolean;
  separatedSinceMs: number | null;
  unattendedSinceMs: number | null;
  leftEventId: string | null;
  outcome: CustodyRecord["outcome"];
}

export interface SuppressedEvent {
  type: VisionEventType;
  atMs: number;
  confidence: number;
  reason: string;
}

export interface VisionStepResult {
  /** events created or resolved during this step. */
  changed: VisionEvent[];
  /** firings the caller should hand to the safety hub. */
  firings: Array<{ event: VisionEvent; firing: RuleFiring }>;
  /** every event currently open, for the overlay. */
  active: VisionEvent[];
  suppressed: SuppressedEvent[];
  zoneProblems: ZoneProblem[];
}

const HISTORY_LIMIT = 80;
const TRACK_DROP_MISSES = 45;
/** misses after which an object's association to a track can no longer be asserted. */
const CONTINUITY_BREAK_MISSES = 8;
const OBJECT_DROP_MISSES = 30;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

interface EvidencePart {
  label: string;
  /** 0..1 measurement. */
  value: number;
  weight: number;
}

/** Confidence is the weighted mean of measured parts, and each part is printed. */
function weighEvidence(parts: EvidencePart[]): { confidence: number; evidence: string[] } {
  const total = parts.reduce((s, p) => s + p.weight, 0) || 1;
  const confidence = clamp01(parts.reduce((s, p) => s + clamp01(p.value) * p.weight, 0) / total);
  return {
    confidence: Math.round(confidence * 100) / 100,
    evidence: parts.map((p) => `${p.label}: ${Math.round(clamp01(p.value) * 100)}%`),
  };
}

/** How much this track can be trusted at all, from age and unbroken continuity. */
function trackQuality(t: TrackState, cfg: VisionEngineConfig): EvidencePart[] {
  return [
    {
      label: `track held for ${t.frames} frames`,
      value: Math.min(1, t.frames / Math.max(1, cfg.minTrackFrames * 3)),
      weight: 1,
    },
    {
      label: t.missStreak === 0 ? "unbroken tracking" : `tracking missed ${t.missStreak} frames`,
      value: t.missStreak === 0 ? 1 : Math.max(0, 1 - t.missStreak * 0.2),
      weight: 1,
    },
  ];
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// ---------------------------------------------------------------------------

export class VisionEventEngine {
  private config: VisionEngineConfig;
  private zones: SafetyZone[] = [];
  private zoneProblems: ZoneProblem[] = [];
  private tracks = new Map<string, TrackState>();
  private objects = new Map<string, ObjectState>();
  private pairs = new Map<string, PairState>();
  private events = new Map<string, VisionEvent>();
  /** last time an event key fired, for the cooldown. */
  private lastFired = new Map<string, number>();
  private seq = 0;

  constructor(config: Partial<VisionEngineConfig> = {}) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
  }

  setConfig(patch: Partial<VisionEngineConfig>) {
    this.config = { ...this.config, ...patch };
  }

  getConfig(): VisionEngineConfig {
    return { ...this.config };
  }

  setZones(zones: SafetyZone[]) {
    const { zones: ok, problems } = validateZones(zones);
    this.zones = ok;
    this.zoneProblems = problems;
  }

  getZones(): SafetyZone[] {
    return this.zones.slice();
  }

  activeEvents(): VisionEvent[] {
    return [...this.events.values()].filter((e) => e.state === "open");
  }

  allEvents(): VisionEvent[] {
    return [...this.events.values()];
  }

  custody(): CustodyRecord[] {
    return [...this.objects.values()].map((o) => ({
      objectId: o.objectId,
      label: o.label,
      firstSeenAtMs: o.firstSeenMs,
      lastSeenAtMs: o.lastSeenMs,
      ownerTrackId: o.ownerTrackId,
      ownerSinceMs: o.ownerSinceMs,
      associationCertain: o.associationCertain,
      unattendedSinceMs: o.unattendedSinceMs,
      present: o.missStreak === 0,
      outcome: o.outcome,
      box: o.box,
    }));
  }

  attachIncident(eventId: string, incidentId: string) {
    for (const e of this.events.values()) {
      if (e.id === eventId) {
        e.incidentId = incidentId;
        return;
      }
    }
  }

  reset() {
    this.tracks.clear();
    this.objects.clear();
    this.pairs.clear();
    this.events.clear();
    this.lastFired.clear();
  }

  // -------------------------------------------------------------------------

  step(frame: VisionFrameInput): VisionStepResult {
    const changed: VisionEvent[] = [];
    const suppressed: SuppressedEvent[] = [];
    const ctx: StepContext = { frame, changed, suppressed };

    this.updateTracks(frame);
    this.updateObjects(frame);
    this.evaluateZones(ctx);
    this.evaluateCustody(ctx);
    this.evaluatePairs(ctx);
    this.evaluateGround(ctx);
    this.evaluateCrowd(ctx);
    this.expire(frame.atMs, ctx);

    const firings: VisionStepResult["firings"] = [];
    for (const event of changed) {
      if (event.state !== "open") continue;
      const firing = this.toFiring(event, frame);
      if (firing) firings.push({ event, firing });
    }

    return {
      changed,
      firings,
      active: this.activeEvents(),
      suppressed,
      zoneProblems: this.zoneProblems,
    };
  }

  private toFiring(event: VisionEvent, frame: VisionFrameInput): RuleFiring | null {
    const reporting = EVENT_REPORTING[event.type];
    if (!reporting) return null;
    return {
      ruleId: reporting.ruleId,
      signal: reporting.signal,
      // the measurement itself, in the rule's own unit. a rule compares against
      // this, so an event that has only just opened reports what it measured
      // rather than how long it has been open.
      value: event.value,
      atMs: event.openedAtMs,
      zoneId: event.zoneId,
      provenance: `${frame.cameraLabel} · on-device detection`,
    };
  }

  // ---- track bookkeeping --------------------------------------------------

  private updateTracks(frame: VisionFrameInput) {
    const seen = new Set<string>();
    for (const input of frame.tracks) {
      const box = normalizeBox(input.box, frame.frameWidth, frame.frameHeight);
      const foot = footPoint(box);
      // body heights per second: perspective tolerant, so a threshold set for a
      // near camera still means the same thing at the far end of a corridor.
      const bodySpeed = input.speedPxPerSec / Math.max(1, input.box.height);
      const pose = input.pose;
      let verticality: number;
      let verticalitySource: TrackState["verticalitySource"];
      if (pose?.usable && box.height > 0) {
        // upright: ankles well below shoulders relative to the body's own extent.
        verticality = clamp01((pose.ankleY - pose.shoulderY) / box.height);
        verticalitySource = "pose";
      } else {
        // geometry fallback: a standing body's box is roughly twice as tall as wide.
        verticality = clamp01(box.height / Math.max(1e-6, box.width) / 2);
        verticalitySource = "geometry";
      }

      const prior = this.tracks.get(input.trackId);
      const state: TrackState = prior ?? {
        id: input.trackId,
        firstSeenMs: frame.atMs,
        lastSeenMs: frame.atMs,
        frames: 0,
        missStreak: 0,
        box,
        foot,
        bodySpeed,
        poseUsable: false,
        poseQuality: 0,
        verticality,
        verticalitySource,
        groundSinceMs: null,
        runSinceMs: null,
        zones: new Map(),
        barrierSide: new Map(),
        history: [],
        wristSpeed: 0,
        lastWrists: [],
      };

      // wrist impulse: the change in wrist position per second, in body heights.
      // used only as an objective motion cue for possible contact — it is never
      // read as a gesture, and it never describes a person.
      if (prior && pose?.usable && pose.wrists.length && prior.lastWrists.length) {
        const dt = Math.max(0.001, (frame.atMs - prior.lastSeenMs) / 1000);
        const moved = pose.wrists.map((w, i) => {
          const p = prior.lastWrists[i];
          return p ? Math.hypot(w.x - p.x, w.y - p.y) : 0;
        });
        state.wristSpeed = Math.max(...moved, 0) / Math.max(0.02, box.height) / dt;
      } else if (!pose?.usable) {
        state.wristSpeed = 0;
      }

      state.lastWrists = pose?.usable ? pose.wrists : [];
      state.poseUsable = Boolean(pose?.usable);
      state.poseQuality = pose?.quality ?? 0;
      state.box = box;
      state.foot = foot;
      state.bodySpeed = bodySpeed;
      state.verticality = verticality;
      state.verticalitySource = verticalitySource;
      state.lastSeenMs = frame.atMs;
      state.missStreak = 0;
      state.frames += 1;
      state.history.push({ atMs: frame.atMs, foot, box, bodySpeed, verticality });
      if (state.history.length > HISTORY_LIMIT) state.history.shift();

      this.tracks.set(input.trackId, state);
      seen.add(input.trackId);
    }

    for (const [id, t] of this.tracks) {
      if (seen.has(id)) continue;
      t.missStreak += 1;
      if (t.missStreak > TRACK_DROP_MISSES) this.tracks.delete(id);
    }
  }

  private updateObjects(frame: VisionFrameInput) {
    const seen = new Set<string>();
    for (const input of frame.objects) {
      const box = normalizeBox(input.box, frame.frameWidth, frame.frameHeight);
      const prior = this.objects.get(input.objectId);
      if (prior) {
        prior.box = box;
        prior.lastSeenMs = frame.atMs;
        prior.missStreak = 0;
      } else {
        this.objects.set(input.objectId, {
          objectId: input.objectId,
          label: input.label,
          box,
          firstSeenMs: frame.atMs,
          lastSeenMs: frame.atMs,
          missStreak: 0,
          ownerTrackId: null,
          ownerSinceMs: null,
          ownerFrames: 0,
          associationCertain: false,
          ownerContinuityLost: false,
          separatedSinceMs: null,
          unattendedSinceMs: null,
          leftEventId: null,
          outcome: "attended",
        });
      }
      seen.add(input.objectId);
    }
    for (const [id, o] of this.objects) {
      if (seen.has(id)) continue;
      o.missStreak += 1;
      if (o.missStreak > OBJECT_DROP_MISSES) {
        if (o.unattendedSinceMs !== null && o.outcome === "unattended") {
          o.outcome = "removed_unknown";
        }
        this.objects.delete(id);
      }
    }
  }

  // ---- zone machines ------------------------------------------------------

  private zonesFor(cameraId: string): SafetyZone[] {
    return this.zones.filter((z) => z.enabled && (z.cameraId === cameraId || z.cameraId === "*"));
  }

  private evaluateZones(ctx: StepContext) {
    const { frame } = ctx;
    const at = new Date(frame.atMs);
    const zones = this.zonesFor(frame.cameraId);

    for (const t of this.tracks.values()) {
      if (t.missStreak > 0) continue;
      for (const zone of zones) {
        if (zone.kind === "barrier") {
          this.evaluateBarrier(ctx, t, zone);
          continue;
        }
        const inside = pointInPolygon(t.foot, zone.polygon);
        const active = zoneActiveAt(zone, at);
        const member = t.zones.get(zone.id);

        if (!inside) {
          if (member) {
            // exit is measured, not inferred: the same foot point that put the
            // track inside the polygon is now outside it.
            if (zone.kind === "restricted" && member.entryFired) {
              const heldMs = frame.atMs - (member.countedFromMs ?? member.enteredAtMs);
              this.resolveKey(`restricted:${zone.id}:${t.id}`, frame.atMs, ctx, "the track's foot point left the polygon");
              this.raise(ctx, {
                type: "restricted_exit",
                value: Math.round(heldMs / 1000),
                valueUnit: "seconds",
                key: `restricted_exit:${zone.id}:${t.id}:${frame.atMs}`,
                zone,
                trackIds: [t.id],
                box: t.box,
                associationCertain: true,
                detail: `track ${t.id.slice(0, 10)} left "${zone.label}" after ${Math.round(heldMs / 1000)}s inside it. exit closes the entry event for the same temporary track; it says nothing about where the track went next.`,
                parts: [
                  ...trackQuality(t, this.config),
                  { label: "foot position measured outside the drawn polygon", value: 1, weight: 2 },
                ],
              });
            }
            t.zones.delete(zone.id);
          }
          continue;
        }
        if (!member) {
          t.zones.set(zone.id, {
            enteredAtMs: frame.atMs,
            countedFromMs: zone.gracePeriodMs === 0 ? frame.atMs : null,
            entryFired: false,
            dwellFired: false,
          });
          continue;
        }
        if (member.countedFromMs === null) {
          if (frame.atMs - member.enteredAtMs < zone.gracePeriodMs) continue;
          member.countedFromMs = frame.atMs;
        }

        if (zone.kind === "restricted" && active && !member.entryFired) {
          member.entryFired = true;
          this.raise(ctx, {
            type: "restricted_entry",
            value: 1,
            valueUnit: "count",
            key: `restricted:${zone.id}:${t.id}`,
            zone,
            trackIds: [t.id],
            box: t.box,
            associationCertain: true,
            detail: `track ${t.id.slice(0, 10)} is standing inside "${zone.label}" while that zone is closed. entry was first measured at ${new Date(member.enteredAtMs).toLocaleTimeString()} and counted after the configured ${Math.round(zone.gracePeriodMs / 1000)}s grace.`,
            parts: [
              ...trackQuality(t, this.config),
              { label: "foot position inside the drawn polygon", value: 1, weight: 2 },
              { label: "zone schedule active at this instant", value: 1, weight: 1 },
            ],
          });
        }

        const dwellMs = frame.atMs - (member.countedFromMs ?? member.enteredAtMs);
        if (!member.dwellFired && dwellMs >= zone.dwellThresholdMs) {
          member.dwellFired = true;
          this.raise(ctx, {
            type: "extended_dwell",
            value: Math.round(dwellMs / 1000),
            valueUnit: "seconds",
            key: `dwell:${zone.id}:${t.id}`,
            zone,
            trackIds: [t.id],
            box: t.box,
            associationCertain: true,
            detail: `track ${t.id.slice(0, 10)} has remained inside "${zone.label}" for ${Math.round(dwellMs / 1000)}s against a configured threshold of ${Math.round(zone.dwellThresholdMs / 1000)}s. extended dwell is a measurement of time in a place; it is not an assumption about why.`,
            parts: [
              ...trackQuality(t, this.config),
              { label: "continuous presence measured against the zone threshold", value: Math.min(1, dwellMs / Math.max(1, zone.dwellThresholdMs)), weight: 2 },
            ],
          });
        }

        if (zone.kind === "walking_only") {
          this.evaluateRunning(ctx, t, zone);
        }
      }
    }
  }

  private evaluateRunning(ctx: StepContext, t: TrackState, zone: SafetyZone) {
    const { frame } = ctx;
    const cfg = this.config;
    if (t.bodySpeed < cfg.runBodySpeed) {
      t.runSinceMs = null;
      return;
    }
    if (t.runSinceMs === null) {
      t.runSinceMs = frame.atMs;
      return;
    }
    const sustained = frame.atMs - t.runSinceMs;
    if (sustained < cfg.runSustainMs) return;
    this.raise(ctx, {
      type: "unusual_movement",
      value: Math.round(sustained / 1000),
      valueUnit: "seconds",
      key: `run:${zone.id}:${t.id}`,
      zone,
      trackIds: [t.id],
      box: t.box,
      associationCertain: true,
      detail: `track ${t.id.slice(0, 10)} has moved at ${t.bodySpeed.toFixed(1)} body heights per second for ${Math.round(sustained / 1000)}s inside "${zone.label}", which the site configures as walking-only at up to ${cfg.runBodySpeed} body heights per second.`,
      parts: [
        ...trackQuality(t, this.config),
        { label: "measured speed against the site rule", value: Math.min(1, t.bodySpeed / (cfg.runBodySpeed * 2)), weight: 2 },
        { label: "duration held above the rule", value: Math.min(1, sustained / (cfg.runSustainMs * 2)), weight: 1 },
      ],
    });
  }

  private evaluateBarrier(ctx: StepContext, t: TrackState, zone: SafetyZone) {
    const { frame } = ctx;
    const [a, b] = zone.polygon;
    const side = sideOfLine(t.foot, a, b);
    const prior = t.barrierSide.get(zone.id);
    t.barrierSide.set(zone.id, side);
    if (prior === undefined || side === 0 || prior === 0 || side === prior) return;

    const previous = t.history[t.history.length - 2];
    if (!previous) return;
    // a side flip alone can happen past the ends of the line. require the path
    // the feet actually travelled to intersect the drawn segment.
    if (!segmentsIntersect(previous.foot, t.foot, a, b)) return;

    // walking through an open gate and climbing over it both cross the line.
    // the thing that separates them is that a climb lifts the feet: the foot
    // line rises well above the baseline it held while walking up to the gate.
    const window = t.history.slice(-24);
    const baseline = Math.max(...window.map((s) => s.foot.y));
    const peak = Math.min(...window.map((s) => s.foot.y));
    const bodyHeight = Math.max(0.02, t.box.height);
    const rise = (baseline - peak) / bodyHeight;
    const poseClimb = t.poseUsable
      ? window.some((s) => s.verticality < 0.7) && t.verticalitySource === "pose"
      : false;

    const parts: EvidencePart[] = [
      ...trackQuality(t, this.config),
      { label: "the tracked path intersected the drawn barrier", value: 1, weight: 2 },
      { label: `the foot line rose ${(rise * 100).toFixed(0)}% of a body height above its approach baseline`, value: Math.min(1, rise / 0.35), weight: 3 },
      {
        label: t.poseUsable
          ? poseClimb
            ? "the joint model measured a non-upright body during the crossing"
            : "the joint model measured an upright body throughout the crossing"
          : "no joint model reading was available for this crossing",
        value: t.poseUsable ? (poseClimb ? 1 : 0.15) : 0,
        weight: t.poseUsable ? 2 : 1,
      },
    ];

    this.raise(ctx, {
      type: "barrier_crossing",
      value: 1,
      valueUnit: "count",
      key: `barrier:${zone.id}:${t.id}`,
      zone,
      trackIds: [t.id],
      box: t.box,
      associationCertain: true,
      detail: `track ${t.id.slice(0, 10)} crossed "${zone.label}". ${
        rise >= 0.2
          ? `the foot line rose ${(rise * 100).toFixed(0)}% of a body height on the way over, which walking through a gap does not produce.`
          : "the feet stayed near their walking baseline, so this reads far more like passing through than climbing over."
      }${t.poseUsable ? "" : " no joint reading was available, so the crossing rests on the trajectory alone."}`,
      parts,
      suppressionNote:
        "the crossing geometry is certain but the climbing evidence is not. a crossing without a measured lift is recorded here rather than raised, because walking through an open gate looks exactly like this.",
    });
  }

  // ---- custody and abandonment -------------------------------------------

  private evaluateCustody(ctx: StepContext) {
    const { frame } = ctx;
    const cfg = this.config;
    const live = [...this.tracks.values()].filter((t) => t.missStreak === 0);

    for (const obj of this.objects.values()) {
      if (obj.missStreak > 0) continue;

      // nearest track, measured edge to edge in the object's own scale.
      let nearest: { track: TrackState; gap: number } | null = null;
      for (const t of live) {
        const gap = boxGapBodies(obj.box, t.box, t.box);
        const overlapping = boxIou(obj.box, t.box) > 0.02;
        const effective = overlapping ? 0 : gap;
        if (!nearest || effective < nearest.gap) nearest = { track: t, gap: effective };
      }

      // ---- association: only while the tracking evidence supports it ------
      if (nearest && nearest.gap <= cfg.retrievalSeparationBodies) {
        if (obj.ownerTrackId === nearest.track.id) {
          obj.ownerFrames += 1;
          obj.associationCertain = obj.ownerFrames >= cfg.minTrackFrames;
        } else if (obj.ownerTrackId === null) {
          obj.ownerTrackId = nearest.track.id;
          obj.ownerSinceMs = frame.atMs;
          obj.ownerFrames = 1;
          obj.associationCertain = false;
        }
      }

      const owner = obj.ownerTrackId ? this.tracks.get(obj.ownerTrackId) : null;
      const ownerGone = obj.ownerTrackId !== null && (!owner || owner.missStreak > 0);
      if (ownerGone) {
        // the association survives as a record of what was measured, but it
        // stops being certain the moment continuity breaks.
        obj.associationCertain = false;
        // continuity is only "broken" once the associated track has been out of
        // sight long enough that re-identifying it is guesswork. a one or two
        // frame occlusion is not that.
        if (!owner || owner.missStreak >= CONTINUITY_BREAK_MISSES) obj.ownerContinuityLost = true;
      }

      const separation = owner && owner.missStreak === 0 ? boxGapBodies(obj.box, owner.box, owner.box) : Infinity;
      const anyoneClose = nearest !== null && nearest.gap <= cfg.abandonSeparationBodies;

      // ---- retrieval closes an open "left" event ---------------------------
      if (obj.leftEventId && nearest && nearest.gap <= cfg.retrievalSeparationBodies) {
        const sameTrack = nearest.track.id === obj.ownerTrackId;
        // continuity: when the associated track was dropped entirely, or nothing
        // was ever associated, the engine cannot say whether this is the same
        // shape returning. it says so instead of guessing.
        const unknownAssociation = !sameTrack && (obj.ownerTrackId === null || obj.ownerContinuityLost);
        const type: VisionEventType = unknownAssociation
          ? "object_retrieved_association_unknown"
          : sameTrack
            ? "object_retrieved_same_track"
            : "object_retrieved_different_track";
        obj.outcome = unknownAssociation
          ? "retrieved_unknown"
          : sameTrack
            ? "retrieved_same"
            : "retrieved_different";
        this.resolveById(obj.leftEventId, frame.atMs, ctx, unknownAssociation
          ? "a tracked shape came within retrieval distance, with no continuous association to compare it against"
          : sameTrack
            ? "the associated track returned and came back within retrieval distance"
            : "a different tracked shape came within retrieval distance");
        this.raise(ctx, {
          type,
          key: `retrieved:${obj.objectId}:${frame.atMs}`,
          value: 1,
          valueUnit: "count",
          zone: null,
          trackIds: [nearest.track.id],
          objectId: obj.objectId,
          box: obj.box,
          associationCertain: unknownAssociation ? false : sameTrack ? obj.associationCertain : true,
          detail: unknownAssociation
            ? `the ${obj.label} was picked up by track ${nearest.track.id.slice(0, 10)}. ${obj.ownerTrackId ? `the track it was associated with (${obj.ownerTrackId.slice(0, 10)}) was lost before this, so continuity is broken` : "nothing was ever associated with it while it sat there"} — the retriever association is unknown, not different and not the same.`
            : sameTrack
              ? `the ${obj.label} was picked up by track ${nearest.track.id.slice(0, 10)}, the same temporary track it was associated with when it was set down.${obj.associationCertain ? "" : " that association was already marked uncertain because tracking continuity broke earlier, so treat this as the most likely reading rather than a fact."}`
              : `the ${obj.label} was picked up by track ${nearest.track.id.slice(0, 10)}, which is not the track it was associated with (${obj.ownerTrackId ? obj.ownerTrackId.slice(0, 10) : "none recorded"}). different temporary tracks may or may not be different people — this camera cannot tell, and does not try.`,
          parts: [
            ...trackQuality(nearest.track, cfg),
            { label: "retrieval distance measured against the configured threshold", value: 1, weight: 2 },
            {
              label: unknownAssociation
                ? "tracking continuity was broken, so no identity comparison was possible"
                : sameTrack
                  ? "track identity matched the recorded association"
                  : "track identity differed from the recorded association",
              value: unknownAssociation ? 0.4 : sameTrack ? (obj.associationCertain ? 1 : 0.5) : 1,
              weight: 2,
            },
          ],
        });
        obj.leftEventId = null;
        obj.unattendedSinceMs = null;
        obj.separatedSinceMs = null;
        continue;
      }

      // ---- separation and the "left" event --------------------------------
      const separated = !anyoneClose && (separation > cfg.abandonSeparationBodies || ownerGone);
      if (!separated) {
        obj.separatedSinceMs = null;
        if (!obj.leftEventId) {
          obj.unattendedSinceMs = null;
          obj.outcome = "attended";
        }
        continue;
      }

      if (obj.separatedSinceMs === null) obj.separatedSinceMs = frame.atMs;
      const separatedMs = frame.atMs - obj.separatedSinceMs;
      if (separatedMs < cfg.abandonDwellMs || obj.leftEventId) continue;
      if (obj.ownerTrackId === null && obj.firstSeenMs === obj.separatedSinceMs) {
        // it was never seen with anybody: it may simply be furniture. it is
        // still tracked, but a thing that was always alone is not an event.
        continue;
      }

      obj.unattendedSinceMs = obj.separatedSinceMs;
      obj.outcome = "unattended";
      const ev = this.raise(ctx, {
        type: "object_left",
        value: Math.round(separatedMs / 1000),
        valueUnit: "seconds",
        key: `left:${obj.objectId}`,
        zone: this.zoneAtPoint(frame.cameraId, footPoint(obj.box)),
        trackIds: obj.ownerTrackId ? [obj.ownerTrackId] : [],
        objectId: obj.objectId,
        box: obj.box,
        associationCertain: obj.associationCertain,
        detail: `a ${obj.label} has been more than ${cfg.abandonSeparationBodies} body heights from any tracked shape for ${Math.round(separatedMs / 1000)}s. ${
          obj.ownerTrackId
            ? obj.associationCertain
              ? `it was carried in by track ${obj.ownerTrackId.slice(0, 10)}, which ${ownerGone ? "is no longer in view" : "is still in view but away from it"}.`
              : `it was near track ${obj.ownerTrackId.slice(0, 10)} for a while, but tracking continuity broke, so that association is marked unknown rather than asserted.`
            : "no tracked shape was ever measured holding it, so it has no association at all."
        }`,
        parts: [
          { label: "separation held past the configured dwell", value: Math.min(1, separatedMs / (cfg.abandonDwellMs * 2)), weight: 3 },
          { label: "the object was detected in every recent frame", value: obj.missStreak === 0 ? 1 : 0.4, weight: 1 },
          {
            label: obj.associationCertain
              ? "custody was measured over enough frames to be relied on"
              : "custody association is uncertain or absent",
            value: obj.associationCertain ? 1 : 0.4,
            weight: 2,
          },
        ],
      });
      if (ev) obj.leftEventId = ev.id;
    }
  }

  private zoneAtPoint(cameraId: string, p: Point): SafetyZone | null {
    return this.zonesFor(cameraId).find((z) => z.kind !== "barrier" && pointInPolygon(p, z.polygon)) ?? null;
  }

  // ---- pairs: proximity, approach, pursuit, contact -----------------------

  private evaluatePairs(ctx: StepContext) {
    const { frame } = ctx;
    const cfg = this.config;
    const live = [...this.tracks.values()].filter((t) => t.missStreak === 0 && t.frames >= cfg.minTrackFrames);

    const seen = new Set<string>();
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const b = live[j];
        const key = pairKey(a.id, b.id);
        seen.add(key);
        const dist = bodyDistance(a.box, b.box);
        const prior = this.pairs.get(key);
        const dt = prior ? Math.max(0.001, (frame.atMs - prior.lastSeenMs) / 1000) : 0;
        const closingRate = prior ? (prior.lastDistance - dist) / dt : 0;

        const pair: PairState = prior ?? {
          key,
          a: a.id,
          b: b.id,
          closeSinceMs: null,
          lastDistance: dist,
          lastSeenMs: frame.atMs,
          motionEnergy: 0,
          chaseSinceMs: null,
        };
        if (prior) {
          pair.motionEnergy = pair.motionEnergy * 0.7 + Math.abs(closingRate) * 0.3;
        }
        pair.lastDistance = dist;
        pair.lastSeenMs = frame.atMs;
        this.pairs.set(key, pair);

        // --- rapid approach ------------------------------------------------
        if (prior && closingRate >= cfg.rapidApproachBodySpeed && dist <= cfg.proximityBodies * 1.6) {
          this.raise(ctx, {
            type: "rapid_approach",
            value: 1,
            valueUnit: "count",
            key: `approach:${key}`,
            zone: this.zoneAtPoint(frame.cameraId, a.foot),
            trackIds: [a.id, b.id],
            box: unionBox([a.box, b.box]),
            associationCertain: true,
            detail: `two tracks closed on each other at ${closingRate.toFixed(1)} body heights per second and are now ${dist.toFixed(1)} apart. this is a measurement of how two shapes moved, not a claim about what either intends.`,
            parts: [
              ...trackQuality(a, cfg),
              ...trackQuality(b, cfg),
              { label: "closing rate against the configured threshold", value: Math.min(1, closingRate / (cfg.rapidApproachBodySpeed * 2)), weight: 3 },
            ],
          });
        }

        // --- prolonged close proximity with objective motion ---------------
        if (dist <= cfg.proximityBodies) {
          if (pair.closeSinceMs === null) pair.closeSinceMs = frame.atMs;
          const held = frame.atMs - pair.closeSinceMs;
          if (held >= cfg.proximityDurationMs && pair.motionEnergy > 0.25) {
            this.raise(ctx, {
              type: "prolonged_proximity",
              value: Math.round(held / 1000),
              valueUnit: "seconds",
              key: `proximity:${key}`,
              zone: this.zoneAtPoint(frame.cameraId, a.foot),
              trackIds: [a.id, b.id],
              box: unionBox([a.box, b.box]),
              associationCertain: true,
              detail: `two tracks have stayed within ${cfg.proximityBodies} body heights of each other for ${Math.round(held / 1000)}s while the distance between them kept changing at ${pair.motionEnergy.toFixed(2)} body heights per second. that pattern is what a prolonged confrontation looks like from above — and it is also what an animated conversation looks like. it is flagged as possible, and a person decides.`,
              parts: [
                ...trackQuality(a, cfg),
                ...trackQuality(b, cfg),
                { label: "duration held at close range", value: Math.min(1, held / (cfg.proximityDurationMs * 2)), weight: 2 },
                { label: "measured movement between the two while close", value: Math.min(1, pair.motionEnergy / 0.8), weight: 2 },
              ],
            });
          }

          // --- possible physical contact -----------------------------------
          const impulse = Math.max(a.wristSpeed, b.wristSpeed);
          const poseBacked = a.poseUsable || b.poseUsable;
          if (poseBacked && impulse >= cfg.contactImpulse && dist <= cfg.proximityBodies * 0.8) {
            this.raise(ctx, {
              type: "contact_impulse",
              value: 1,
              valueUnit: "count",
              key: `contact:${key}`,
              zone: this.zoneAtPoint(frame.cameraId, a.foot),
              trackIds: [a.id, b.id],
              box: unionBox([a.box, b.box]),
              associationCertain: true,
              detail: `at ${dist.toFixed(1)} body heights apart, a wrist point moved ${impulse.toFixed(1)} body heights per second — a sharp, short motion at contact range. that is an observation of speed and distance. it does not establish that contact occurred, who moved first, or that anyone was harmed.`,
              parts: [
                ...trackQuality(a, cfg),
                ...trackQuality(b, cfg),
                { label: "joint model quality on the moving track", value: Math.max(a.poseQuality, b.poseQuality), weight: 2 },
                { label: "wrist speed against the configured impulse", value: Math.min(1, impulse / (cfg.contactImpulse * 2)), weight: 3 },
                { label: "separation at the moment of the impulse", value: clamp01(1 - dist / cfg.proximityBodies), weight: 1 },
              ],
            });
          }
        } else {
          pair.closeSinceMs = null;
        }

        // --- pursuit-like movement -----------------------------------------
        const bothFast = a.bodySpeed >= cfg.runBodySpeed && b.bodySpeed >= cfg.runBodySpeed;
        const heldStation = Math.abs(closingRate) < cfg.runBodySpeed * 0.5;
        if (bothFast && heldStation && dist <= cfg.proximityBodies * 3) {
          if (pair.chaseSinceMs === null) pair.chaseSinceMs = frame.atMs;
          const held = frame.atMs - pair.chaseSinceMs;
          if (held >= cfg.chaseSustainMs) {
            this.raise(ctx, {
              type: "chase_like_trajectory",
              value: Math.round(held / 1000),
              valueUnit: "seconds",
              key: `chase:${key}`,
              zone: this.zoneAtPoint(frame.cameraId, a.foot),
              trackIds: [a.id, b.id],
              box: unionBox([a.box, b.box]),
              associationCertain: true,
              detail: `two tracks have both moved above the site's running speed for ${Math.round(held / 1000)}s while holding their separation at roughly ${dist.toFixed(1)} body heights. two people running together and one person following another produce the same measurement; this says which measurement was taken, not which of those it was.`,
              parts: [
                ...trackQuality(a, cfg),
                ...trackQuality(b, cfg),
                { label: "both tracks above the running threshold", value: Math.min(1, Math.min(a.bodySpeed, b.bodySpeed) / (cfg.runBodySpeed * 1.6)), weight: 2 },
                { label: "separation held constant while both moved", value: clamp01(1 - Math.abs(closingRate) / cfg.runBodySpeed), weight: 2 },
                { label: "duration sustained", value: Math.min(1, held / (cfg.chaseSustainMs * 2)), weight: 1 },
              ],
            });
          }
        } else {
          pair.chaseSinceMs = null;
        }
      }
    }

    for (const [key, pair] of this.pairs) {
      if (seen.has(key)) continue;
      if (frame.atMs - pair.lastSeenMs > 30_000) this.pairs.delete(key);
    }
  }

  // ---- a person on the ground --------------------------------------------

  private evaluateGround(ctx: StepContext) {
    const { frame } = ctx;
    const cfg = this.config;
    for (const t of this.tracks.values()) {
      if (t.missStreak > 0) {
        t.groundSinceMs = null;
        continue;
      }
      if (t.frames < cfg.minTrackFrames) continue;
      if (t.verticality >= cfg.groundVerticality) {
        t.groundSinceMs = null;
        continue;
      }
      if (t.groundSinceMs === null) {
        t.groundSinceMs = frame.atMs;
        continue;
      }
      const held = frame.atMs - t.groundSinceMs;
      if (held < cfg.groundConfirmMs) continue;

      // a fall usually leaves a trace: the body's own extent collapsed rather
      // than always having been low. that separates a person on the floor from
      // someone crouching at the far end of the room, whose box is small but
      // whose shape never changed.
      const window = t.history.slice(-40);
      const earlier = window.slice(0, Math.max(1, Math.floor(window.length / 2)));
      const priorVerticality = earlier.length ? Math.max(...earlier.map((s) => s.verticality)) : t.verticality;
      const collapse = clamp01((priorVerticality - t.verticality) / Math.max(0.05, priorVerticality));

      this.raise(ctx, {
        type: "person_on_ground",
        value: Math.round(held / 1000),
        valueUnit: "seconds",
        key: `ground:${t.id}`,
        zone: this.zoneAtPoint(frame.cameraId, t.foot),
        trackIds: [t.id],
        box: t.box,
        associationCertain: true,
        detail: `track ${t.id.slice(0, 10)} has held a horizontal body geometry for ${Math.round(held / 1000)}s, past the configured ${Math.round(cfg.groundConfirmMs / 1000)}s confirmation window. ${
          t.verticalitySource === "pose"
            ? "the reading comes from the joint model."
            : "no joint reading was available, so this rests on the shape of the detection box alone and is far weaker."
        } someone may need help; the camera cannot tell whether they do.`,
        parts: [
          ...trackQuality(t, cfg),
          { label: "how horizontal the body geometry is", value: clamp01(1 - t.verticality / cfg.groundVerticality), weight: 3 },
          { label: "the body's own extent collapsed from its earlier posture in frame", value: collapse, weight: 2 },
          {
            label: t.verticalitySource === "pose" ? "measured by the joint model" : "measured from the detection box only",
            value: t.verticalitySource === "pose" ? Math.max(0.5, t.poseQuality) : 0.2,
            weight: 3,
          },
          { label: "duration held past the confirmation window", value: Math.min(1, held / (cfg.groundConfirmMs * 2)), weight: 1 },
        ],
      });
    }
  }

  // ---- crowd formation ----------------------------------------------------

  private evaluateCrowd(ctx: StepContext) {
    const { frame } = ctx;
    for (const zone of this.zonesFor(frame.cameraId)) {
      if (zone.kind === "barrier") continue;
      const inside = [...this.tracks.values()].filter(
        (t) => t.missStreak === 0 && t.frames >= this.config.minTrackFrames && pointInPolygon(t.foot, zone.polygon),
      );
      if (inside.length < zone.occupancyThreshold) continue;
      const boxes = unionBox(inside.map((t) => t.box));
      this.raise(ctx, {
        type: "crowd_formation",
        value: inside.length,
        valueUnit: "count",
        key: `crowd:${zone.id}`,
        zone,
        trackIds: inside.map((t) => t.id),
        box: boxes,
        associationCertain: true,
        detail: `${inside.length} tracked shapes are inside "${zone.label}" against a configured occupancy of ${zone.occupancyThreshold}. this counts shapes in a place. it does not identify anyone, and a shape is not necessarily one person.`,
        parts: [
          { label: "occupancy against the configured threshold", value: Math.min(1, inside.length / Math.max(1, zone.occupancyThreshold * 2)), weight: 3 },
          {
            label: "mean tracking quality across the counted shapes",
            value: inside.reduce((s, t) => s + Math.min(1, t.frames / (this.config.minTrackFrames * 3)), 0) / inside.length,
            weight: 2,
          },
        ],
      });
    }
  }

  // ---- event lifecycle ----------------------------------------------------

  private raise(ctx: StepContext, spec: RaiseSpec): VisionEvent | null {
    const { frame } = ctx;
    const { confidence, evidence } = weighEvidence(spec.parts);

    if (confidence < this.config.minConfidence) {
      ctx.suppressed.push({
        type: spec.type,
        atMs: frame.atMs,
        confidence,
        reason:
          spec.suppressionNote ??
          `${EVENT_LABEL[spec.type]} reached only ${Math.round(confidence * 100)}% confidence against the configured floor of ${Math.round(this.config.minConfidence * 100)}%. it was measured and discarded rather than shown as a finding.`,
      });
      return null;
    }

    const existing = this.events.get(spec.key);
    if (existing && existing.state === "open") {
      existing.updatedAtMs = frame.atMs;
      existing.confidence = confidence;
      existing.evidence = evidence;
      existing.detail = spec.detail;
      existing.box = spec.box;
      existing.trackIds = spec.trackIds;
      existing.associationCertain = spec.associationCertain;
      return null;
    }

    const lastFired = this.lastFired.get(spec.key) ?? 0;
    if (frame.atMs - lastFired < this.config.cooldownMs) {
      ctx.suppressed.push({
        type: spec.type,
        atMs: frame.atMs,
        confidence,
        reason: `${EVENT_LABEL[spec.type]} repeated within the ${Math.round(this.config.cooldownMs / 1000)}s cooldown for this subject and was collapsed into the earlier event instead of opening a second one.`,
      });
      return null;
    }

    this.seq += 1;
    const event: VisionEvent = {
      id: `vev_${frame.atMs.toString(36)}_${this.seq}`,
      type: spec.type,
      state: "open",
      cameraId: frame.cameraId,
      cameraLabel: frame.cameraLabel,
      zoneId: spec.zone?.id ?? null,
      zoneLabel: spec.zone?.label ?? null,
      trackIds: spec.trackIds,
      objectId: spec.objectId ?? null,
      openedAtMs: frame.atMs,
      updatedAtMs: frame.atMs,
      resolvedAtMs: null,
      confidence,
      evidence,
      detail: spec.detail,
      box: spec.box,
      associationCertain: spec.associationCertain,
      value: spec.value,
      valueUnit: spec.valueUnit,
      incidentId: null,
    };
    this.events.set(spec.key, event);
    this.lastFired.set(spec.key, frame.atMs);
    ctx.changed.push(event);
    return event;
  }

  private resolveKey(key: string, atMs: number, ctx: StepContext, reason: string) {
    const e = this.events.get(key);
    if (!e || e.state !== "open") return;
    this.resolveById(e.id, atMs, ctx, reason);
  }

  private resolveById(eventId: string, atMs: number, ctx: StepContext, reason: string) {
    for (const [key, e] of this.events) {
      if (e.id !== eventId || e.state !== "open") continue;
      e.state = "resolved";
      e.resolvedAtMs = atMs;
      e.detail = `${e.detail} — resolved: ${reason}.`;
      ctx.changed.push(e);
      this.events.delete(key);
      this.events.set(`${key}:resolved:${atMs}`, e);
      return;
    }
  }

  /** Close events whose subject has left the frame for good. */
  private expire(nowMs: number, ctx: StepContext) {
    for (const [key, e] of this.events) {
      if (e.state !== "open") continue;
      if (e.type === "object_left") continue; // stays open until retrieval or removal
      const subjectsGone = e.trackIds.length > 0 && e.trackIds.every((id) => {
        const t = this.tracks.get(id);
        return !t || t.missStreak > 6;
      });
      const stale = nowMs - e.updatedAtMs > 30_000;
      if (!subjectsGone && !stale) continue;
      e.state = "resolved";
      e.resolvedAtMs = nowMs;
      e.detail = `${e.detail} — resolved: ${subjectsGone ? "the tracked subject left the view" : "no further measurement in thirty seconds"}.`;
      ctx.changed.push(e);
      this.events.delete(key);
      this.events.set(`${key}:resolved:${nowMs}`, e);
    }
    // keep the resolved tail bounded
    const resolved = [...this.events.entries()].filter(([, e]) => e.state === "resolved");
    if (resolved.length > 60) {
      resolved
        .sort((a, b) => (a[1].resolvedAtMs ?? 0) - (b[1].resolvedAtMs ?? 0))
        .slice(0, resolved.length - 60)
        .forEach(([k]) => this.events.delete(k));
    }
  }
}

interface StepContext {
  frame: VisionFrameInput;
  changed: VisionEvent[];
  suppressed: SuppressedEvent[];
}

interface RaiseSpec {
  type: VisionEventType;
  key: string;
  zone: SafetyZone | null;
  trackIds: string[];
  objectId?: string | null;
  box: NormBox | null;
  associationCertain: boolean;
  detail: string;
  /** the measurement that triggered this, in `valueUnit`. */
  value: number;
  valueUnit: "count" | "seconds";
  parts: EvidencePart[];
  /** printed instead of the generic line when the event is below the confidence floor. */
  suppressionNote?: string;
}
