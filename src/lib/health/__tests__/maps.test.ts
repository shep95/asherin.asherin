// coverage for the functional-map catalogue: every entry has to be honest about where it
// comes from and what geometry it can (or cannot) claim on the reference mesh.
import { describe, expect, it } from "vitest";
import {
  DERMATOMES,
  FUNCTIONAL_MAPS,
  MAP_KIND_ORDER,
  REFERRED_PAIN_PATTERNS,
  findMap,
  mapsByKind,
  mapsForTerritory,
  referredPatternsFor,
  searchMaps,
} from "../maps";

describe("functional map catalogue", () => {
  it("carries every kind and no empty kind", () => {
    for (const kind of MAP_KIND_ORDER) {
      expect(mapsByKind(kind).length, `kind ${kind} is empty`).toBeGreaterThan(0);
    }
  });

  it("gives every entry a key, source convention and geometry note", () => {
    for (const entry of FUNCTIONAL_MAPS) {
      expect(entry.key).toMatch(/\S/);
      expect(entry.label).toMatch(/\S/);
      expect(entry.description.length).toBeGreaterThan(10);
      expect(entry.source).toMatch(/\S/);
      expect(entry.geometryNote).toMatch(/\S/);
    }
  });

  it("keeps keys unique", () => {
    const seen = new Set<string>();
    for (const entry of FUNCTIONAL_MAPS) {
      expect(seen.has(entry.key), `duplicate key ${entry.key}`).toBe(false);
      seen.add(entry.key);
    }
  });

  it("covers the spinal dermatome column", () => {
    const labels = DERMATOMES.map((d) => d.label.toLowerCase()).join(" ");
    for (const level of ["c5", "t4", "t10", "l4", "s1"]) {
      expect(labels, `missing ${level}`).toContain(level);
    }
    expect(DERMATOMES.length).toBeGreaterThanOrEqual(28);
  });

  it("resolves maps by territory and returns referred patterns only for referral entries", () => {
    const withTerritory = FUNCTIONAL_MAPS.find((m) => m.territoryKeys.length > 0);
    expect(withTerritory).toBeTruthy();
    const key = withTerritory!.territoryKeys[0];
    expect(mapsForTerritory(key).some((m) => m.key === withTerritory!.key)).toBe(true);

    const referral = REFERRED_PAIN_PATTERNS[0];
    const hits = referredPatternsFor(referral.territoryKeys[0]);
    expect(hits.every((h) => h.kind === referral.kind)).toBe(true);
  });

  it("finds and searches without matching everything", () => {
    const first = FUNCTIONAL_MAPS[0];
    expect(findMap(first.key)?.key).toBe(first.key);
    expect(findMap("not-a-real-map-key")).toBeUndefined();
    expect(searchMaps(FUNCTIONAL_MAPS, "zzzznotathing")).toHaveLength(0);
    expect(searchMaps(FUNCTIONAL_MAPS, "").length).toBe(FUNCTIONAL_MAPS.length);
  });
});
