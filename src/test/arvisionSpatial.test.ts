import { describe, expect, it } from "vitest";
import { NavigationGraph } from "@/lib/arvision/spatial/navData";
import { MapTransform, headingFromMovement, headingFromRotation } from "@/lib/arvision/spatial/mapTransform";
import { SpatialGuidance, hasPassedWaypoint, instructionForAngle } from "@/lib/arvision/spatial/guidance";
import { GuidanceVoice } from "@/lib/arvision/spatial/voice";
import { evaluateOcclusion, projectPoint, worldToCamera } from "@/lib/arvision/spatial/projection";
import { CALIBRATED_FULL, focalFromFov, intrinsicsForFov } from "@/lib/arvision/spatial/intrinsics";
import { randomVibrantColor, roomChannelName } from "@/lib/arvision/spatial/session";
import { isNavigationData, type NavigationData, type Quat } from "@/lib/arvision/spatial/types";
import referenceMap from "@/lib/arvision/spatial/referenceMap.json";

const map = referenceMap as NavigationData;
const graph = new NavigationGraph(map);

function yaw(deg: number): Quat {
  const r = (deg * Math.PI) / 180;
  return { x: 0, y: Math.sin(r / 2), z: 0, w: Math.cos(r / 2) };
}

describe("reference map", () => {
  it("is a valid navigation export", () => {
    expect(isNavigationData(map)).toBe(true);
    expect(map.waypoints.length).toBeGreaterThan(10);
    expect(map.pois.length).toBeGreaterThan(0);
  });
});

describe("navigation graph", () => {
  it("returns a precomputed path when one exists", () => {
    const sample = map.paths[0];
    const path = graph.getPath(sample.fromWaypointId, sample.toPoiId);
    expect(path?.waypointPath).toEqual(sample.waypointPath);
  });

  it("falls back to a star when the export has no precomputed route", () => {
    const trimmed: NavigationData = { ...map, paths: [] };
    const bare = new NavigationGraph(trimmed);
    // the export's waypoint graph is fragmented, so start from a waypoint the
    // precomputed set proves is connected to this destination
    const sample = map.paths[0];
    const poi = map.pois.find((p) => p.id === sample.toPoiId) as NonNullable<(typeof map.pois)[number]>;
    const start = { id: sample.fromWaypointId };
    const path = bare.getPath(start.id, poi.id);
    expect(path).toBeDefined();
    expect(path?.waypointPath[0]).toBe(start.id);
    expect(path?.waypointPath.at(-1)).toBe(poi.nearestWaypointId);
    expect(path?.totalDistance).toBeGreaterThan(0);
  });

  it("finds the nearest waypoint to an arbitrary point", () => {
    const target = map.waypoints[5];
    const nearest = graph.findNearestWaypoint({ x: target.position.x + 0.05, y: 0, z: target.position.z - 0.05 });
    expect(nearest?.id).toBe(target.id);
  });
});

describe("map transform", () => {
  const transform = new MapTransform(map.bounds, { width: 400, height: 300 }, 20);

  it("round trips a world point through screen space", () => {
    const point = { x: -3, y: 0, z: 2 };
    const back = transform.toMap(transform.toScreen(point));
    expect(back.x).toBeCloseTo(point.x, 4);
    expect(back.z).toBeCloseTo(point.z, 4);
  });

  it("draws forward as up", () => {
    const near = transform.toScreen({ x: 0, y: 0, z: 0 });
    const far = transform.toScreen({ x: 0, y: 0, z: 4 });
    expect(far.y).toBeLessThan(near.y);
  });

  it("reads heading from a quaternion and from movement", () => {
    expect(headingFromRotation(yaw(0))).toBeCloseTo(0, 5);
    expect(headingFromMovement({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0.02 })).toBeNull();
    expect(headingFromMovement({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 3 })).toBeCloseTo(0, 5);
  });
});

describe("guidance rules", () => {
  it("maps angles to the package instruction set", () => {
    expect(instructionForAngle(5)).toBe("moveForward");
    expect(instructionForAngle(40)).toBe("slightLeft");
    expect(instructionForAngle(-40)).toBe("slightRight");
    expect(instructionForAngle(90)).toBe("turnLeft");
    expect(instructionForAngle(-90)).toBe("turnRight");
    expect(instructionForAngle(170)).toBe("turnAround");
  });

  it("detects a passed waypoint only when close to the path line", () => {
    const wp = { x: 0, y: 0, z: 0 };
    const next = { x: 0, y: 0, z: 5 };
    expect(hasPassedWaypoint({ x: 0, y: 0, z: 1 }, wp, next)).toBe(true);
    expect(hasPassedWaypoint({ x: 0, y: 0, z: -1 }, wp, next)).toBe(false);
    expect(hasPassedWaypoint({ x: 6, y: 0, z: 1 }, wp, next)).toBe(false);
  });

  it("refuses to start a route before a position exists, then runs one", () => {
    const spoken: string[] = [];
    const engine = new SpatialGuidance(graph, { onInstruction: (i) => spoken.push(i) });
    const poi = map.pois.find((p) => p.id === map.paths[0].toPoiId) as NonNullable<(typeof map.pois)[number]>;

    expect(engine.start(poi.id)).toMatch(/no position/);

    const routed = map.paths[0];
    const startWp = graph.getWaypoint(routed.fromWaypointId) as NonNullable<ReturnType<typeof graph.getWaypoint>>;
    engine.updatePosition(startWp.position, yaw(0));
    expect(engine.start(poi.id)).toBeNull();

    const state = engine.getState();
    expect(state.isNavigating).toBe(true);
    expect(state.totalWaypoints).toBeGreaterThan(0);
    expect(spoken[0]).toBe("navigationStarted");

    engine.updatePosition(poi.position, yaw(0));
    expect(engine.getState().instruction).toBe("destinationReached");
    engine.stop();
  });
});

describe("spoken guidance", () => {
  it("holds a repeat inside the cooldown and lets a forced cue through", () => {
    const voice = new GuidanceVoice(4000);
    expect(voice.play("moveForward", false, 1000)).toBe("move forward");
    expect(voice.play("moveForward", false, 2000)).toBeNull();
    expect(voice.play("moveForward", true, 2000)).toBe("move forward");
    voice.setEnabled(false);
    expect(voice.play("turnLeft", true, 9000)).toBeNull();
  });
});

describe("see through layer", () => {
  it("projects a point straight ahead to the image centre", () => {
    const projected = projectPoint({ x: 0, y: 0, z: 0 }, yaw(0), { x: 0, y: 0, z: 5 }, CALIBRATED_FULL);
    expect(projected.depth).toBeCloseTo(5, 4);
    expect(projected.u).toBeCloseTo(CALIBRATED_FULL.px / CALIBRATED_FULL.width, 4);
    expect(projected.inFrame).toBe(true);
  });

  it("marks a point behind the viewer as out of frame", () => {
    const projected = projectPoint({ x: 0, y: 0, z: 0 }, yaw(0), { x: 0, y: 0, z: -5 }, CALIBRATED_FULL);
    expect(projected.inFrame).toBe(false);
    expect(projected.depth).toBeLessThan(0);
  });

  it("keeps the camera transform length preserving", () => {
    const cam = worldToCamera({ x: 1, y: 2, z: 3 }, yaw(37));
    expect(Math.hypot(cam.x, cam.y, cam.z)).toBeCloseTo(Math.hypot(1, 2, 3), 5);
  });

  it("calls a peer clear along the corridor and hidden well outside it", () => {
    const a = map.waypoints[0].position;
    const neighbourId = map.waypoints[0].connectedWaypoints[0];
    const b = graph.getWaypoint(neighbourId)?.position ?? a;
    expect(evaluateOcclusion(graph, a, b).occluded).toBe(false);

    const far = { x: a.x + 60, y: a.y, z: a.z + 60 };
    expect(evaluateOcclusion(graph, a, far).occluded).toBe(true);
    expect(evaluateOcclusion(null, a, far).method).toBe("no-map");
  });
});

describe("intrinsics and session helpers", () => {
  it("derives focal length from field of view", () => {
    expect(focalFromFov(90, 1000)).toBeCloseTo(500, 3);
    const i = intrinsicsForFov(800, 600, 64, "test");
    expect(i.px).toBe(400);
    expect(i.py).toBe(300);
    expect(i.fx).toBe(i.fy);
  });

  it("sanitises a room key into a channel name", () => {
    expect(roomChannelName("  Ops Room #1 ")).toBe("arvision:opsroom1");
  });

  it("produces a colour inside the unit range", () => {
    for (let i = 0; i < 25; i += 1) {
      const c = randomVibrantColor();
      for (const v of [c.r, c.g, c.b]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});
