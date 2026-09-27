import { describe, it, expect } from "vitest";
import { detectGeoIntent } from "@/lib/geoIntent";

describe("detectGeoIntent", () => {
  it("opens the map for a fly request", () => {
    expect(detectGeoIntent("take me to Dallas Texas")).toMatchObject({
      place: "Dallas Texas",
      property: false,
      /* A locality ask frames the city, not a roof. */
      zoom: 12,
    });
  });

  it("marks an occupancy question as a property fly", () => {
    expect(detectGeoIntent("who lives at 1600 Pennsylvania Avenue?")).toMatchObject({
      place: "1600 Pennsylvania Avenue",
      property: true,
      /* An occupancy ask frames the rooftop. */
      zoom: 19,
    });
  });

  it("treats a bare street address as a property fly", () => {
    const got = detectGeoIntent("742 Evergreen Terrace Springfield");
    expect(got?.property).toBe(true);
  });

  it("splits a two-address compare into both places", () => {
    const got = detectGeoIntent("compare 100 Main St Dallas vs 200 Elm St Dallas");
    expect(got?.places).toEqual(["100 Main St Dallas", "200 Elm St Dallas"]);
  });

  it("ignores diagram senses of the word map", () => {
    expect(detectGeoIntent("build me a relationship map of the board")).toBeNull();
    expect(detectGeoIntent("draw an intel map for this org")).toBeNull();
  });

  it("ignores non-geography turns", () => {
    expect(detectGeoIntent("summarize this contract")).toBeNull();
  });
});
