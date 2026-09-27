import { describe, expect, it } from "vitest";
import { distanceToRing, feet, pointInRing, ringArea, ringPerimeter, squareFeet } from "../building";
import { geoToLocal } from "../geo";

// A real 40 x 25 metre footprint drawn in degrees around a downtown los angeles
// anchor, converted the same way the resolver converts overpass geometry.
const anchor = { lat: 34.05823, lon: -118.29826 };
const metresRing = (w: number, h: number, offsetX = 0, offsetZ = 0) => ({
  points: [
    { x: offsetX, y: 0, z: offsetZ },
    { x: offsetX + w, y: 0, z: offsetZ },
    { x: offsetX + w, y: 0, z: offsetZ + h },
    { x: offsetX, y: 0, z: offsetZ + h },
    { x: offsetX, y: 0, z: offsetZ },
  ],
});

describe("building footprint maths", () => {
  it("measures a rectangular footprint in metres and square feet", () => {
    const ring = metresRing(40, 25);
    expect(ringArea(ring)).toBeCloseTo(1000, 6);
    expect(ringPerimeter(ring)).toBeCloseTo(130, 6);
    expect(Math.round(squareFeet(ringArea(ring)))).toBe(10764);
    expect(Math.round(feet(40))).toBe(131);
  });

  it("places a fix inside its own building and outside the one next door", () => {
    const host = metresRing(40, 25, -20, -12);
    const neighbour = metresRing(30, 20, 60, 40);
    const fix = { x: 0, y: 0, z: 0 };
    expect(pointInRing(fix, host)).toBe(true);
    expect(pointInRing(fix, neighbour)).toBe(false);
    expect(distanceToRing(fix, host)).toBeCloseTo(12, 6); // nearest wall is the south one
    expect(distanceToRing(fix, neighbour)).toBeGreaterThan(60);
  });

  it("keeps degree geometry honest once converted to local metres", () => {
    // 0.0002 degrees of latitude is roughly 22 m; the ring must measure as such
    const ring = {
      points: [
        geoToLocal(anchor, anchor.lat, anchor.lon),
        geoToLocal(anchor, anchor.lat, anchor.lon + 0.0004),
        geoToLocal(anchor, anchor.lat + 0.0002, anchor.lon + 0.0004),
        geoToLocal(anchor, anchor.lat + 0.0002, anchor.lon),
        geoToLocal(anchor, anchor.lat, anchor.lon),
      ],
    };
    const area = ringArea(ring);
    expect(area).toBeGreaterThan(700);
    expect(area).toBeLessThan(900);
    const inside = geoToLocal(anchor, anchor.lat + 0.0001, anchor.lon + 0.0002);
    expect(pointInRing(inside, ring)).toBe(true);
    const outside = geoToLocal(anchor, anchor.lat + 0.001, anchor.lon);
    expect(pointInRing(outside, ring)).toBe(false);
  });
});
