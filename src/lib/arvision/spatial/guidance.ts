// asherin.arvision — turn by turn guidance
// ported from Services/AudioNavigationService.swift with every constant kept:
// look-ahead targeting, circular-mean heading smoothing, dead reckoning,
// instruction hysteresis, waypoint pass test, off-path recalculation, arrival.

import { NavigationGraph } from "./navData";
import { distance2D, type NavInstruction, type NavigationPOI, type Quat, type Vec3 } from "./types";

const FORWARD_ANGLE_THRESHOLD = 20;
const SLIGHT_TURN_THRESHOLD = 60;
const TURN_AROUND_THRESHOLD = 150;
const WAYPOINT_REACH_DISTANCE = 1.5;
const MAX_OFF_PATH_DISTANCE = 5;
const HYSTERESIS_BUFFER = 10;
const HEADING_HISTORY_SIZE = 5;
const LOOK_AHEAD_WAYPOINT_COUNT = 4;
const LOOK_AHEAD_MAX_DISTANCE = 8;
const MOVEMENT_HEADING_STALENESS_MS = 3000;
const MIN_MOVEMENT_FOR_HEADING = 0.3;
const MIN_MOVEMENT_FOR_VELOCITY = 0.1;
const LATENCY_ESTIMATE_S = 0.1;

export interface GuidanceState {
  isNavigating: boolean;
  destination: NavigationPOI | null;
  instruction: NavInstruction | null;
  remainingDistance: number;
  currentWaypointIndex: number;
  totalWaypoints: number;
  path: number[] | null;
  position: Vec3 | null;
  headingRad: number | null;
}

export interface GuidanceEvents {
  onState?: (state: GuidanceState) => void;
  onInstruction?: (instruction: NavInstruction, force: boolean) => void;
}

export class SpatialGuidance {
  private graph: NavigationGraph;
  private events: GuidanceEvents;

  private navigating = false;
  private destination: NavigationPOI | null = null;
  private instruction: NavInstruction | null = null;
  private remainingDistance = 0;
  private waypointIndex = 0;
  private path: number[] = [];

  private lastPosition: Vec3 | null = null;
  private previousPosition: Vec3 | null = null;
  private lastRotation: Quat | null = null;
  private movementHeadingDeg: number | null = null;
  private lastMovementTime = 0;
  private headingHistory: number[] = [];
  private velocity = { x: 0, z: 0 };
  private lastPositionUpdate = 0;
  private lastInstructionAngle: number | null = null;
  private arrivalTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(graph: NavigationGraph, events: GuidanceEvents = {}) {
    this.graph = graph;
    this.events = events;
  }

  setGraph(graph: NavigationGraph) {
    this.stop();
    this.graph = graph;
  }

  getState(): GuidanceState {
    return {
      isNavigating: this.navigating,
      destination: this.destination,
      instruction: this.instruction,
      remainingDistance: this.remainingDistance,
      currentWaypointIndex: this.waypointIndex,
      totalWaypoints: this.path.length,
      path: this.navigating ? this.path : null,
      position: this.lastPosition,
      headingRad: this.currentHeadingRad(),
    };
  }

  private currentHeadingRad(): number | null {
    if (this.movementHeadingDeg !== null) return (this.movementHeadingDeg * Math.PI) / 180;
    if (!this.lastRotation) return null;
    const r = this.lastRotation;
    const forwardX = 2 * (r.x * r.z + r.w * r.y);
    const forwardZ = 1 - 2 * (r.x * r.x + r.y * r.y);
    return Math.atan2(forwardZ, forwardX);
  }

  private emit() {
    this.events.onState?.(this.getState());
  }

  private say(instruction: NavInstruction, force = false) {
    this.events.onInstruction?.(instruction, force);
  }

  /** Returns a reason string when navigation cannot start, otherwise null. */
  start(poiId: number): string | null {
    const poi = this.graph.getPOI(poiId);
    if (!poi) return "destination not found in this map";
    if (!this.lastPosition) return "no position yet. localize or place yourself on the map first";

    const nearest = this.graph.findNearestWaypoint(this.lastPosition);
    if (!nearest) return "this map has no walkable waypoints";

    const path = this.graph.getPath(nearest.id, poiId);
    if (!path) return "no route exists between here and that destination";

    this.clearArrivalTimer();
    this.path = path.waypointPath;
    this.waypointIndex = 0;
    this.destination = poi;
    this.navigating = true;
    this.remainingDistance = path.totalDistance;
    this.movementHeadingDeg = null;
    this.previousPosition = this.lastPosition;
    this.lastMovementTime = 0;
    this.headingHistory = [];
    this.velocity = { x: 0, z: 0 };
    this.lastPositionUpdate = Date.now();
    this.lastInstructionAngle = null;
    this.instruction = "navigationStarted";

    this.say("navigationStarted", true);
    this.emit();

    this.arrivalTimer = setTimeout(() => {
      if (this.navigating) this.giveInstruction();
    }, 1500);
    return null;
  }

  stop() {
    this.clearArrivalTimer();
    this.navigating = false;
    this.destination = null;
    this.path = [];
    this.waypointIndex = 0;
    this.remainingDistance = 0;
    this.instruction = null;
    this.movementHeadingDeg = null;
    this.previousPosition = null;
    this.headingHistory = [];
    this.velocity = { x: 0, z: 0 };
    this.lastInstructionAngle = null;
    this.emit();
  }

  private clearArrivalTimer() {
    if (this.arrivalTimer) {
      clearTimeout(this.arrivalTimer);
      this.arrivalTimer = null;
    }
  }

  updatePosition(position: Vec3, rotation: Quat, now = Date.now()) {
    if (this.previousPosition) {
      const dx = position.x - this.previousPosition.x;
      const dz = position.z - this.previousPosition.z;
      const moved = Math.sqrt(dx * dx + dz * dz);

      if (moved > MIN_MOVEMENT_FOR_VELOCITY && this.lastPositionUpdate) {
        const dt = (now - this.lastPositionUpdate) / 1000;
        if (dt > 0.01) this.velocity = { x: dx / dt, z: dz / dt };
      }
      if (moved > MIN_MOVEMENT_FOR_HEADING) {
        this.pushHeading((Math.atan2(dz, dx) * 180) / Math.PI);
        this.movementHeadingDeg = this.smoothedHeading();
        this.lastMovementTime = now;
      }
    }

    if (now - this.lastMovementTime > MOVEMENT_HEADING_STALENESS_MS) {
      this.movementHeadingDeg = null;
      this.velocity = { x: 0, z: 0 };
    }

    this.previousPosition = this.lastPosition;
    this.lastPosition = position;
    this.lastRotation = rotation;
    this.lastPositionUpdate = now;

    if (!this.navigating) {
      this.emit();
      return;
    }

    const predicted: Vec3 = {
      x: position.x + this.velocity.x * LATENCY_ESTIMATE_S,
      y: position.y,
      z: position.z + this.velocity.z * LATENCY_ESTIMATE_S,
    };

    if (this.destination) this.remainingDistance = distance2D(predicted, this.destination.position);
    if (this.checkArrival()) return;

    this.updatePathProgress(predicted);
    this.checkOffPath();
    this.giveInstruction(predicted);
    this.emit();
  }

  private pushHeading(heading: number) {
    this.headingHistory.push(heading);
    if (this.headingHistory.length > HEADING_HISTORY_SIZE) this.headingHistory.shift();
  }

  private smoothedHeading(): number {
    if (this.headingHistory.length === 0) return 0;
    let sumSin = 0;
    let sumCos = 0;
    for (const h of this.headingHistory) {
      const r = (h * Math.PI) / 180;
      sumSin += Math.sin(r);
      sumCos += Math.cos(r);
    }
    return (Math.atan2(sumSin, sumCos) * 180) / Math.PI;
  }

  private checkArrival(): boolean {
    if (!this.destination || !this.lastPosition) return false;
    if (distance2D(this.lastPosition, this.destination.position) > this.destination.arrivalRadius) return false;

    this.navigating = false;
    this.instruction = "destinationReached";
    this.say("destinationReached", true);
    this.emit();
    this.clearArrivalTimer();
    this.arrivalTimer = setTimeout(() => this.stop(), 3000);
    return true;
  }

  private updatePathProgress(userPos: Vec3) {
    while (this.waypointIndex < this.path.length - 1) {
      const current = this.graph.getWaypoint(this.path[this.waypointIndex]);
      const next = this.graph.getWaypoint(this.path[this.waypointIndex + 1]);
      if (!current || !next) break;

      const withinReach = distance2D(userPos, current.position) <= WAYPOINT_REACH_DISTANCE;
      const passed = hasPassedWaypoint(userPos, current.position, next.position);
      if (withinReach || passed) this.waypointIndex += 1;
      else break;
    }
  }

  private checkOffPath() {
    if (!this.lastPosition || !this.destination) return;
    if (this.waypointIndex >= this.path.length) return;
    const current = this.graph.getWaypoint(this.path[this.waypointIndex]);
    if (!current) return;
    if (distance2D(this.lastPosition, current.position) <= MAX_OFF_PATH_DISTANCE) return;

    this.say("recalculating", true);
    const nearest = this.graph.findNearestWaypoint(this.lastPosition);
    if (!nearest) return;
    const newPath = this.graph.getPath(nearest.id, this.destination.id);
    if (!newPath) return;
    this.path = newPath.waypointPath;
    this.waypointIndex = 0;
  }

  private giveInstruction(predicted?: Vec3) {
    if (!this.navigating || !this.lastRotation) return;
    const userPos = predicted ?? this.lastPosition;
    if (!userPos) return;

    let target: Vec3;
    if (this.waypointIndex < this.path.length) target = this.lookAheadTarget(userPos);
    else if (this.destination) target = this.destination.position;
    else return;

    const angle = this.angleToTarget(userPos, target);
    const next = this.instructionWithHysteresis(angle);
    if (next !== this.instruction) {
      this.instruction = next;
      this.lastInstructionAngle = angle;
    }
    this.say(next, false);
  }

  private lookAheadTarget(userPos: Vec3): Vec3 {
    if (this.waypointIndex >= this.path.length) return this.destination?.position ?? userPos;

    const points: Vec3[] = [];
    let cumulative = 0;
    let prev = userPos;
    const endIdx = Math.min(this.path.length, this.waypointIndex + LOOK_AHEAD_WAYPOINT_COUNT);

    for (let i = this.waypointIndex; i < endIdx; i += 1) {
      const wp = this.graph.getWaypoint(this.path[i]);
      if (!wp) continue;
      cumulative += distance2D(prev, wp.position);
      if (cumulative > LOOK_AHEAD_MAX_DISTANCE && points.length > 0) break;
      points.push(wp.position);
      prev = wp.position;
    }

    if (endIdx >= this.path.length - 1 && this.destination) points.push(this.destination.position);
    if (points.length < 2) return points[0] ?? this.destination?.position ?? userPos;

    let wx = 0;
    let wz = 0;
    let totalWeight = 0;
    points.forEach((p, i) => {
      const weight = 1 / (i + 1);
      const dx = p.x - userPos.x;
      const dz = p.z - userPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 0.001) {
        wx += (dx / dist) * weight;
        wz += (dz / dist) * weight;
        totalWeight += weight;
      }
    });
    if (totalWeight <= 0) return points[0];

    const avgX = wx / totalWeight;
    const avgZ = wz / totalWeight;
    const mag = Math.sqrt(avgX * avgX + avgZ * avgZ);
    if (mag <= 0.001) return points[0];

    const projection = Math.max(distance2D(userPos, points[0]), 2);
    return {
      x: userPos.x + (avgX / mag) * projection,
      y: userPos.y,
      z: userPos.z + (avgZ / mag) * projection,
    };
  }

  private angleToTarget(userPos: Vec3, target: Vec3): number {
    const dirX = target.x - userPos.x;
    const dirZ = target.z - userPos.z;
    const mag = Math.sqrt(dirX * dirX + dirZ * dirZ);
    if (mag <= 0.001) return 0;

    const targetAngle = (Math.atan2(dirZ / mag, dirX / mag) * 180) / Math.PI;

    let userHeading: number;
    if (this.movementHeadingDeg !== null) {
      userHeading = this.movementHeadingDeg;
    } else {
      const r = this.lastRotation as Quat;
      const forwardX = 2 * (r.x * r.z + r.w * r.y);
      const forwardZ = 1 - 2 * (r.x * r.x + r.y * r.y);
      userHeading = (Math.atan2(forwardZ, forwardX) * 180) / Math.PI;
    }

    let diff = targetAngle - userHeading;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return diff;
  }

  private instructionWithHysteresis(angle: number): NavInstruction {
    const next = instructionForAngle(angle);
    if (this.lastInstructionAngle === null || !this.instruction) return next;
    if (next !== this.instruction) {
      const delta = Math.abs(Math.abs(angle) - Math.abs(this.lastInstructionAngle));
      if (delta < HYSTERESIS_BUFFER) return this.instruction;
    }
    return next;
  }
}

export function instructionForAngle(angle: number): NavInstruction {
  const abs = Math.abs(angle);
  if (abs < FORWARD_ANGLE_THRESHOLD) return "moveForward";
  if (abs < SLIGHT_TURN_THRESHOLD) return angle > 0 ? "slightLeft" : "slightRight";
  if (abs >= TURN_AROUND_THRESHOLD) return "turnAround";
  return angle > 0 ? "turnLeft" : "turnRight";
}

export function hasPassedWaypoint(userPosition: Vec3, waypoint: Vec3, nextWaypoint: Vec3): boolean {
  const pathDirX = nextWaypoint.x - waypoint.x;
  const pathDirZ = nextWaypoint.z - waypoint.z;
  const toUserX = userPosition.x - waypoint.x;
  const toUserZ = userPosition.z - waypoint.z;

  const dot = pathDirX * toUserX + pathDirZ * toUserZ;
  const pathLength = Math.sqrt(pathDirX * pathDirX + pathDirZ * pathDirZ);
  if (pathLength <= 0.001) return false;

  const cross = Math.abs(pathDirX * toUserZ - pathDirZ * toUserX);
  const perpendicular = cross / pathLength;
  return dot > 0 && perpendicular < 3;
}

export const GUIDANCE_CONSTANTS = {
  FORWARD_ANGLE_THRESHOLD,
  SLIGHT_TURN_THRESHOLD,
  TURN_AROUND_THRESHOLD,
  WAYPOINT_REACH_DISTANCE,
  MAX_OFF_PATH_DISTANCE,
  HYSTERESIS_BUFFER,
};
