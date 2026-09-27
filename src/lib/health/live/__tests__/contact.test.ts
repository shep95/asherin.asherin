import { describe, it, expect } from "vitest";
import { classifyContact, classifyAll, allGoodContact, POOR_CONTACT_FLOOR, GOOD_CONTACT_FLOOR } from "../contact";
import type { AdapterStatus } from "../devices";

function status(overrides: Partial<AdapterStatus>): AdapterStatus {
  return { id: "heart-rate", label: "heart rate", state: "connected", reason: "", signalQuality: null, ...overrides };
}

describe("classifyContact", () => {
  it("reports no-device when not connected", () => {
    const r = classifyContact(status({ state: "not-connected" }));
    expect(r.quality).toBe("no-device");
    expect(r.signalQuality).toBeNull();
  });

  it("reports unsupported reason for unsupported browsers", () => {
    const r = classifyContact(status({ state: "unsupported" }));
    expect(r.quality).toBe("no-device");
    expect(r.detail).toContain("not supported");
  });

  it("reports denied reason distinctly", () => {
    const r = classifyContact(status({ state: "denied" }));
    expect(r.detail).toContain("permission");
  });

  it("reports poor-contact while waiting for enough packets", () => {
    const r = classifyContact(status({ signalQuality: null }));
    expect(r.quality).toBe("poor-contact");
    expect(r.detail).toContain("waiting for enough packets");
  });

  it("classifies quality at or above the good floor as good-contact", () => {
    const r = classifyContact(status({ signalQuality: GOOD_CONTACT_FLOOR }));
    expect(r.quality).toBe("good-contact");
  });

  it("classifies quality between the poor and good floors as marginal poor-contact", () => {
    const r = classifyContact(status({ signalQuality: (POOR_CONTACT_FLOOR + GOOD_CONTACT_FLOOR) / 2 }));
    expect(r.quality).toBe("poor-contact");
    expect(r.detail).toContain("marginal");
  });

  it("classifies quality below the poor floor as weak poor-contact", () => {
    const r = classifyContact(status({ signalQuality: POOR_CONTACT_FLOOR - 0.1 }));
    expect(r.quality).toBe("poor-contact");
    expect(r.detail).toContain("weak");
  });

  it("classifyAll maps every status", () => {
    const results = classifyAll([status({ id: "a" }), status({ id: "b", state: "not-connected" })]);
    expect(results.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("allGoodContact", () => {
  it("is false when nothing is connected", () => {
    expect(allGoodContact([classifyContact(status({ state: "not-connected" }))])).toBe(false);
  });

  it("is false when any connected source is not good", () => {
    const readings = [classifyContact(status({ signalQuality: GOOD_CONTACT_FLOOR })), classifyContact(status({ id: "b", signalQuality: 0.1 }))];
    expect(allGoodContact(readings)).toBe(false);
  });

  it("is true when every connected source is good", () => {
    const readings = [classifyContact(status({ signalQuality: GOOD_CONTACT_FLOOR })), classifyContact(status({ id: "b", signalQuality: 0.9 }))];
    expect(allGoodContact(readings)).toBe(true);
  });
});
