import { describe, expect, it } from "vitest";
import {
  EYE_CAPABILITIES,
  FORBIDDEN_CLAIMS,
  capabilityFor,
  chipFor,
  limitationFor,
  stateFor,
} from "../capability";
import { createHealthRegistry, healthLabel, staleAfter } from "../health";
import { buildInspector } from "../inspector";

describe("capability truth model", () => {
  it("calls the iron palette a render, never a thermal sensor", () => {
    const c = capabilityFor("style:falsecolor")!;
    expect(c.origin).toBe("render");
    expect(c.base).toBe("visualization");
    expect(c.label).not.toMatch(/flir|thermal sensor|infrared sensor/i);
    expect(c.limitation).toMatch(/no infrared sensor/);
    expect(stateFor("style:falsecolor")).toBe("visualization");
  });

  it("has no style that claims to be a sensor", () => {
    Object.values(EYE_CAPABILITIES)
      .filter((c) => c.id.startsWith("style:"))
      .forEach((c) => {
        expect(c.origin).toBe("render");
        expect(c.base).toBe("visualization");
      });
  });

  it("describes the track box as a reticle on the operator's own selection", () => {
    const c = capabilityFor("trackbox")!;
    expect(c.origin).toBe("render");
    expect(c.limitation).toMatch(/no object detector/);
    expect(c.label).not.toMatch(/detect/i);
  });

  it("keeps the density grid observational and never says aircraft avoid the area", () => {
    const c = capabilityFor("avoid")!;
    expect(c.base).toBe("derived");
    expect(c.limitation).toMatch(/not evidence that aircraft avoid/);
    expect(c.derivation).toMatch(/recorded/);
  });

  it("keeps coverage gaps away from blackout or intercept language", () => {
    const c = capabilityFor("dark")!;
    expect(c.limitation).toMatch(/never a blackout/);
  });

  it("keeps plate motion as cartography, not a coastline forecast", () => {
    expect(capabilityFor("future")!.base).toBe("visualization");
    expect(capabilityFor("future")!.limitation).toMatch(/not a forecast of future coastlines/);
  });

  it("keeps the weather-weighted route an ordinary road route", () => {
    const c = capabilityFor("route")!;
    expect(c.provider).toBe("osrm + open-meteo");
    expect(c.limitation).toMatch(/no quantum or predictive routing/);
  });

  it("keeps the place dossier to public indexes, not deeds or criminal records", () => {
    const c = capabilityFor("property")!;
    expect(c.limitation).toMatch(/not deeds/);
    expect(c.limitation).toMatch(/not criminal records/);
  });

  it("labels the airframe model as a class stand-in", () => {
    expect(capabilityFor("hangar")!.limitation).toMatch(/never the exact geometry/);
  });

  it("separates google photoreal tiles from locally generated geometry", () => {
    expect(capabilityFor("photorealGoogle")!.base).toBe("requires_key");
    expect(capabilityFor("localGeometry")!.origin).toBe("derived");
    expect(stateFor("photorealGoogle")).toBe("requires_key");
  });

  it("never lets a keyed layer report itself as merely stale", () => {
    expect(stateFor("ships", { status: "stale" })).toBe("requires_key");
    expect(stateFor("traffic", { status: "error" })).toBe("requires_key");
  });

  it("keeps model output out of the coordinate path", () => {
    const c = capabilityFor("intent")!;
    expect(c.origin).toBe("model");
    expect(c.limitation).toMatch(/never from the model/);
  });

  it("reports an unknown id as unavailable rather than inventing a capability", () => {
    expect(capabilityFor("nope")).toBeNull();
    expect(stateFor("nope")).toBe("unavailable");
    expect(limitationFor("nope")).toMatch(/not wired to a source/);
  });

  it("carries no forbidden claim in any capability label or limitation", () => {
    const banned = FORBIDDEN_CLAIMS.filter((w) => !["avoiding", "deed", "intercept"].includes(w));
    Object.values(EYE_CAPABILITIES).forEach((c) => {
      const affirmative = `${c.label}`;
      banned.forEach((w) => expect(affirmative.toLowerCase()).not.toContain(w));
    });
  });
});

describe("feed health", () => {
  it("starts unloaded and never claims a freshness it does not have", () => {
    const h = createHealthRegistry();
    const s = h.snapshot("flights", 1_000);
    expect(s.freshness).toBe("never");
    expect(s.ageMs).toBeNull();
    expect(healthLabel(s)).toBe("not loaded");
  });

  it("goes fresh then stale as the clock moves past the layer window", () => {
    const h = createHealthRegistry();
    h.begin("flights");
    h.ok("flights", { rows: 12, at: 1_000 });
    expect(h.snapshot("flights", 2_000).freshness).toBe("fresh");
    const stale = h.snapshot("flights", 1_000 + staleAfter("flights") + 1);
    expect(stale.freshness).toBe("stale");
    expect(stale.status).toBe("stale");
    expect(stateFor("flights", stale)).toBe("stale");
    expect(healthLabel(stale)).toMatch(/stale/);
  });

  it("surfaces a failure as degraded instead of swallowing it", () => {
    const h = createHealthRegistry();
    h.ok("quakes", { rows: 5, at: 1_000 });
    h.fail("quakes", new Error("upstream 503"), 2_000);
    const s = h.snapshot("quakes", 2_100);
    expect(s.freshness).toBe("error");
    expect(s.lastError).toBe("upstream 503");
    expect(stateFor("quakes", s)).toBe("degraded");
    expect(healthLabel(s)).toMatch(/upstream 503/);
  });

  it("keeps counting retries while a feed stays down and clears on recovery", () => {
    const h = createHealthRegistry();
    h.fail("cameras", "boom", 1);
    h.begin("cameras");
    expect(h.get("cameras").status).toBe("error");
    h.fail("cameras", "boom", 2);
    expect(h.get("cameras").fails).toBe(2);
    h.ok("cameras", { rows: 3, at: 3 });
    expect(h.get("cameras").fails).toBe(0);
    expect(h.snapshot("cameras", 4).freshness).toBe("fresh");
  });

  it("marks a derived layer derived and a fetched layer live when both are healthy", () => {
    const h = createHealthRegistry();
    h.ok("flights", { rows: 1, at: 10 });
    h.ok("avoid", { rows: 1, at: 10 });
    expect(stateFor("flights", h.snapshot("flights", 20))).toBe("live");
    expect(stateFor("avoid", h.snapshot("avoid", 20))).toBe("derived");
  });

  it("shows the recorder as degraded when a write fails rather than reporting success", () => {
    const h = createHealthRegistry();
    h.ok("recorder", { rows: 4, at: 1 });
    h.fail("recorder", "row-level security", 2);
    expect(stateFor("recorder", h.snapshot("recorder", 3))).toBe("degraded");
    expect(chipFor("recorder", h.snapshot("recorder", 3))).toMatch(/degraded/);
  });
});

describe("selected-entity inspector", () => {
  it("shows only the aircraft fields the feed delivered", () => {
    const m = buildInspector(
      { kind: "flights", label: "swr22", lat: 47.1, lon: 8.2, alt: 10500, speed: 431, hex: "4b1815" },
      { historyPoints: 6, canFly: true },
    );
    const keys = m.fields.map((f) => f.k);
    expect(keys).toContain("altitude");
    expect(keys).toContain("icao hex");
    expect(m.fields.find((f) => f.k === "type")?.unknown).toBe(true);
    expect(keys).not.toContain("registration");
    expect(keys).not.toContain("operator");
  });

  it("enables history only once a second fix exists this session", () => {
    const none = buildInspector({ kind: "flights", lat: 1, lon: 1 }, { historyPoints: 1 });
    expect(none.actions.find((a) => a.id === "history")!.enabled).toBe(false);
    expect(none.actions.find((a) => a.id === "history")!.reason).toMatch(/no second fix/);
    const some = buildInspector({ kind: "flights", lat: 1, lon: 1 }, { historyPoints: 4 });
    expect(some.actions.find((a) => a.id === "history")!.enabled).toBe(true);
  });

  it("disables camera modes for static entities and says why", () => {
    const q = buildInspector({ kind: "quakes", lat: 1, lon: 1, mag: 5.2, depth: 10 });
    const track = q.actions.find((a) => a.id === "track")!;
    expect(track.enabled).toBe(false);
    expect(track.reason).toMatch(/moving contacts/);
  });

  it("separates a tle epoch from the propagated position, and admits when there is none", () => {
    const withEpoch = buildInspector({ kind: "sats", epoch: "2026-09-01T00:00:00Z", lat: 0, lon: 0 });
    expect(withEpoch.fields.find((f) => f.k === "shown position")!.v).toMatch(/propagated/);
    const without = buildInspector({ kind: "sats", lat: 0, lon: 0 });
    expect(without.fields.find((f) => f.k === "tle epoch")!.unknown).toBe(true);
  });

  it("refuses to offer a source link the feed never published", () => {
    const m = buildInspector({ kind: "cameras", lat: 1, lon: 1, credit: "caltrans" });
    const a = m.actions.find((x) => x.id === "source")!;
    expect(a.enabled).toBe(false);
    expect(a.reason).toMatch(/published no link/);
  });

  it("carries the layer limitation and the degraded chip into the inspector", () => {
    const h = createHealthRegistry();
    h.fail("flights", "opensky timeout", 5);
    const m = buildInspector({ kind: "flights", lat: 1, lon: 1 }, { health: h.snapshot("flights", 6) });
    expect(m.state).toBe("degraded");
    expect(m.chip).toMatch(/degraded/);
    expect(m.limitation).toMatch(/unheard, not empty sky/);
  });

  it("labels a derived cell as derived rather than as an observation of intent", () => {
    const m = buildInspector({ kind: "avoid", lat: 1, lon: 1, samples: 3 });
    expect(m.kindLabel).toMatch(/derived/);
    expect(m.limitation).toMatch(/not evidence that aircraft avoid/);
  });
});
