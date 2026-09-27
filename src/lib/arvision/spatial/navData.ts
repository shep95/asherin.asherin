// asherin.arvision — navigation graph
// ported from Services/NavigationDataService.swift: indexed lookups, precomputed
// path preference, A* fallback over the waypoint graph, nearest-waypoint search.

import {
  distance2D,
  type NavigationData,
  type NavigationPOI,
  type NavigationPath,
  type NavigationWaypoint,
  type Vec3,
} from "./types";

export class NavigationGraph {
  readonly data: NavigationData;
  private readonly poiById = new Map<number, NavigationPOI>();
  private readonly waypointById = new Map<number, NavigationWaypoint>();
  private readonly pathByKey = new Map<string, NavigationPath>();

  constructor(data: NavigationData) {
    this.data = data;
    for (const p of data.pois) this.poiById.set(p.id, p);
    for (const w of data.waypoints) this.waypointById.set(w.id, w);
    for (const path of data.paths) {
      this.pathByKey.set(`${path.fromWaypointId}:${path.toPoiId}`, path);
    }
  }

  get mapCode(): string {
    return this.data.mapCode;
  }

  getPOIs(): NavigationPOI[] {
    return this.data.pois;
  }

  getPOI(id: number): NavigationPOI | undefined {
    return this.poiById.get(id);
  }

  getWaypoint(id: number): NavigationWaypoint | undefined {
    return this.waypointById.get(id);
  }

  findNearestWaypoint(position: Vec3): NavigationWaypoint | undefined {
    let best: NavigationWaypoint | undefined;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const w of this.data.waypoints) {
      const d = distance2D(position, w.position);
      if (d < bestDist) {
        bestDist = d;
        best = w;
      }
    }
    return best;
  }

  /** Precomputed path when the export has one, otherwise A* over the graph. */
  getPath(fromWaypointId: number, toPoiId: number): NavigationPath | undefined {
    const precomputed = this.pathByKey.get(`${fromWaypointId}:${toPoiId}`);
    if (precomputed && precomputed.waypointPath.length > 0) return precomputed;

    const poi = this.poiById.get(toPoiId);
    if (!poi) return undefined;
    const goalId = poi.nearestWaypointId;
    const route = this.astar(fromWaypointId, goalId);
    if (!route) return undefined;

    let total = 0;
    for (let i = 1; i < route.length; i += 1) {
      const a = this.waypointById.get(route[i - 1]);
      const b = this.waypointById.get(route[i]);
      if (a && b) total += distance2D(a.position, b.position);
    }
    const tail = this.waypointById.get(route[route.length - 1]);
    if (tail) total += distance2D(tail.position, poi.position);

    return { fromWaypointId, toPoiId, waypointPath: route, totalDistance: total };
  }

  /** A* with a 2D euclidean heuristic. Bounded by the graph size, so it always terminates. */
  private astar(startId: number, goalId: number): number[] | undefined {
    const start = this.waypointById.get(startId);
    const goal = this.waypointById.get(goalId);
    if (!start || !goal) return undefined;
    if (startId === goalId) return [startId];

    const open = new Set<number>([startId]);
    const cameFrom = new Map<number, number>();
    const g = new Map<number, number>([[startId, 0]]);
    const f = new Map<number, number>([[startId, distance2D(start.position, goal.position)]]);

    while (open.size > 0) {
      let current = -1;
      let bestF = Number.POSITIVE_INFINITY;
      for (const id of open) {
        const score = f.get(id) ?? Number.POSITIVE_INFINITY;
        if (score < bestF) {
          bestF = score;
          current = id;
        }
      }
      if (current === -1) break;
      if (current === goalId) {
        const route = [current];
        let cursor = current;
        while (cameFrom.has(cursor)) {
          cursor = cameFrom.get(cursor) as number;
          route.unshift(cursor);
        }
        return route;
      }

      open.delete(current);
      const node = this.waypointById.get(current);
      if (!node) continue;

      for (const neighborId of node.connectedWaypoints) {
        const neighbor = this.waypointById.get(neighborId);
        if (!neighbor) continue;
        const tentative = (g.get(current) ?? Number.POSITIVE_INFINITY) + distance2D(node.position, neighbor.position);
        if (tentative < (g.get(neighborId) ?? Number.POSITIVE_INFINITY)) {
          cameFrom.set(neighborId, current);
          g.set(neighborId, tentative);
          f.set(neighborId, tentative + distance2D(neighbor.position, goal.position));
          open.add(neighborId);
        }
      }
    }

    return undefined;
  }
}
