import { describe, expect, it, vi } from "vitest";
import { ChartInputError, describeChartFailure, validateChartInput } from "@/lib/vedic/chartInput";

const good = { birthDate: "1990-06-15", birthTime: "08:30", tzOffset: "5.5", lat: "28.6139", lon: "77.209" };

describe("validateChartInput", () => {
  it("parses a complete form", () => {
    expect(validateChartInput(good)).toEqual({ latNum: 28.6139, lonNum: 77.209, tz: 5.5 });
  });

  it("names the missing field in lowercase", () => {
    expect(() => validateChartInput({ ...good, birthDate: "" })).toThrow("birth date required");
    expect(() => validateChartInput({ ...good, lat: "" })).toThrow(/latitude and longitude required/);
    expect(() => validateChartInput({ ...good, tzOffset: "" })).toThrow("utc offset required");
  });

  it("refuses coordinates and offsets off the globe", () => {
    expect(() => validateChartInput({ ...good, lat: "91" })).toThrow(ChartInputError);
    expect(() => validateChartInput({ ...good, lon: "-181" })).toThrow(/longitude/);
    expect(() => validateChartInput({ ...good, tzOffset: "15" })).toThrow(/utc offset must/);
  });

  it("keeps a validation message but hides an engine failure behind one plain line", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(describeChartFailure(new ChartInputError("birth date required"))).toBe("birth date required");
    const line = describeChartFailure(new TypeError("WebAssembly.instantiate(): failed"));
    expect(line).not.toMatch(/WebAssembly/);
    expect(line).toMatch(/^the ephemeris could not/);
    expect(warn).toHaveBeenCalledTimes(1); // the raw error still reaches the console for debugging
    warn.mockRestore();
  });
});
