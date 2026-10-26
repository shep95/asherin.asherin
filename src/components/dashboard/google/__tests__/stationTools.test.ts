import { describe, expect, it } from "vitest";
import { planStationCall, stationLabel } from "../stationTools";

describe("planStationCall — the analyst's tool table", () => {
  it("returns nothing for an empty prompt", () => {
    expect(planStationCall("", "overview")).toBeNull();
    expect(planStationCall("   ", "email")).toBeNull();
  });

  it("an explicit mail search wins over the module default and carries the subject", () => {
    const call = planStationCall("search my mail for the lease renewal", "location");
    expect(call?.action).toBe("search_mail");
    expect(call?.payload.query).toBe("the lease renewal");
  });

  it("a verb in the prompt picks its action regardless of the open desk", () => {
    expect(planStationCall("brief me", "contacts")?.action).toBe("daily_digest");
    expect(planStationCall("who is going quiet?", "overview")?.action).toBe("relationship_graph");
    expect(planStationCall("where is my phone", "email")?.action).toBe("location_signals");
    expect(planStationCall("which accounts are connected?", "email")?.action).toBe("status");
  });

  it("falls back to the desk's default read, and to nothing when the desk has none", () => {
    expect(planStationCall("analyse this", "overview")?.action).toBe("status");
    expect(planStationCall("analyse this", "contacts")?.action).toBe("relationship_graph");
    expect(planStationCall("analyse this", "scenarios")).toBeNull();
  });

  it("a mail-search fallback strips anything but word characters, @, dots and dashes", () => {
    const call = planStationCall("invoice from acme <script>", "email");
    expect(call?.action).toBe("search_mail");
    expect(call?.payload.query).toBe("invoice from acme  script");
  });

  it("bounds the prompt it reads so a long paste cannot run away", () => {
    const long = "x".repeat(5000) + " brief me";
    // the verb sits past the 2000-char window, so only the desk default applies
    expect(planStationCall(long, "twin")?.action).toBe("daily_digest");
    expect(planStationCall(long, "scenarios")).toBeNull();
  });

  it("labels are lowercase and prefixed with the organ", () => {
    expect(stationLabel("status")).toBe("google · accounts");
    for (const a of ["harvest", "search_mail", "audit_log"] as const) {
      expect(stationLabel(a)).toBe(stationLabel(a).toLowerCase());
      expect(stationLabel(a).startsWith("google · ")).toBe(true);
    }
  });
});
