import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveBirthTimezone } from "@/lib/vedic/timezoneLookup";

afterEach(() => { vi.unstubAllGlobals(); });

describe("resolveBirthTimezone", () => {
  it("falls back to a longitude estimate, and says so, when the zone service is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    const r = await resolveBirthTimezone(28.6139, 77.209, "1990-06-15", "08:30");
    expect(r.source).toBe("longitude-fallback");
    expect(r.ianaName).toBeNull();
    expect(r.offsetHours).toBe(5.25); // 77.2° / 15 rounded to the quarter hour
  });

  it("computes the historical offset from the resolved zone, dst included", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ timeZone: "America/New_York" }), { status: 200 }))));
    const summer = await resolveBirthTimezone(40.71, -74.0, "1990-07-04", "12:00");
    expect(summer.source).toBe("timeapi");
    expect(summer.offsetHours).toBe(-4);
    const winter = await resolveBirthTimezone(40.71, -74.0, "1990-01-04", "12:00");
    expect(winter.offsetHours).toBe(-5);
  });

  it("ignores a zone name Intl cannot resolve instead of caching a lie", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ timeZone: "Mars/Olympus" }), { status: 200 }))));
    const r = await resolveBirthTimezone(10.0, 30.0, "2000-01-01", "00:00");
    expect(r.source).toBe("longitude-fallback");
    expect(r.offsetHours).toBe(2);
  });
});
