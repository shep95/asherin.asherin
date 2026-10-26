import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsError } from "@/lib/local/functions";
import { describeFailure, isLocalOnlyError, offlineNote, NO_ACCOUNT_PATH, CONNECT_UNAVAILABLE, BROWSER_PATH_NEEDS } from "../offline";

// every function the google room calls. none has a device handler in
// src/lib/local/functions.ts, which is the fact the room's copy rests on.
const ROOM_FUNCTIONS = [
  "google-oauth", "google-data", "google-mesh", "google-substrate", "mesh-vault",
  "meet-vault", "ghost-engine", "phone-messages", "rideshare-guardian", "rideshare-autopilot",
  "transit-guardian", "sentinel-ble", "wifi-sentinel", "op-layer", "organism",
];

describe("asherin.google on a device — the shim's answer is recognised", () => {
  it.each(ROOM_FUNCTIONS)("%s has no device handler and reads as local-only", async (name) => {
    const { data, error } = await supabase.functions.invoke(name, { body: { action: "status" } });
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(FunctionsError);
    expect(isLocalOnlyError(error)).toBe(true);
  });

  it("recognises the shim's error by code, by message, and after being rewrapped", () => {
    const shim = new FunctionsError("google-data needs a server-side organ and asherin is running locally on this device — kernel offline for this tool.");
    expect(isLocalOnlyError(shim)).toBe(true);
    // modules often rethrow only the message
    expect(isLocalOnlyError(new Error(shim.message))).toBe(true);
    expect(isLocalOnlyError(shim.message)).toBe(true);
    expect(isLocalOnlyError({ code: "LOCAL_ONLY" })).toBe(true);
  });

  it("does not mistake an ordinary failure for the shim", () => {
    expect(isLocalOnlyError(new Error("network timeout"))).toBe(false);
    expect(isLocalOnlyError(null)).toBe(false);
    expect(isLocalOnlyError(undefined)).toBe(false);
    expect(isLocalOnlyError({ message: 42 })).toBe(false);
  });
});

describe("describeFailure", () => {
  it("turns the shim's answer into the one lowercase offline sentence", () => {
    const shim = new FunctionsError("google-mesh needs a server-side organ … kernel offline for this tool.");
    expect(describeFailure(shim, "mesh organ")).toBe(offlineNote("mesh organ"));
    expect(describeFailure(shim, "mesh organ")).not.toMatch(/kernel offline/);
    expect(offlineNote("mesh organ")).toBe(offlineNote("mesh organ").toLowerCase());
  });

  it("keeps another error's own words, lowercases the first letter and bounds the length", () => {
    expect(describeFailure(new Error("Google rejected the request"), "x")).toBe("google rejected the request");
    const long = "A".repeat(400);
    const out = describeFailure(new Error(long), "x");
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith("…")).toBe(true);
  });

  it("never returns an empty line for an empty or non-error value", () => {
    expect(describeFailure(null, "mesh organ")).toBe("the mesh organ did not answer.");
    expect(describeFailure(new Error(""), "mesh organ")).toBe("the mesh organ did not answer.");
    expect(describeFailure({}, "mesh organ")).toBe("the mesh organ did not answer.");
  });
});

describe("the room's standing copy", () => {
  it("is lowercase and names no server, button or tier", () => {
    for (const s of [NO_ACCOUNT_PATH, CONNECT_UNAVAILABLE, ...BROWSER_PATH_NEEDS]) {
      expect(s).toBe(s.toLowerCase());
      expect(s).not.toMatch(/available on|maximum tier|sign in/i);
    }
    expect(BROWSER_PATH_NEEDS).toHaveLength(3);
  });
});
