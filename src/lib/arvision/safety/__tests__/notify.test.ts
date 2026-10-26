import { beforeEach, describe, expect, it } from "vitest";
import { SafetyNotifier } from "../notify";
import type { VisionEvent } from "../../vision/types";

// asherin.arvision → the sidebar bell. the safety console and the inbox the
// operator already reads must be one connection, not two inboxes.
const event = (id: string, type: VisionEvent["type"] = "person_on_ground") =>
  ({
    id,
    type,
    openedAtMs: 1_700_000_000_000,
    cameraLabel: "front door",
    zoneLabel: "porch",
    confidence: 0.82,
    detail: "a person stayed low for 9 s",
  }) as unknown as VisionEvent;

const bell = () => JSON.parse(localStorage.getItem("aureon_notifications") || "[]") as Array<Record<string, unknown>>;

describe("arvision safety alerts reach the one bell", () => {
  beforeEach(() => localStorage.clear());

  it("writes one bell entry that opens asherin.arvision and reports delivery truthfully", async () => {
    const n = await new SafetyNotifier().notify(event("e1"), { incidentId: "inc1", evidenceId: null, evidenceState: "no capture" });
    const inbox = n.delivery.find((d) => d.channel === "operator_inbox");
    expect(inbox?.ok).toBe(true);
    const rows = bell();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actionView: "asherin-arvision", type: "error" });
    expect(String(rows[0].message)).toContain("front door · porch");
  });

  it("does not flood the bell when one incident repeats", async () => {
    const s = new SafetyNotifier();
    await s.notify(event("e1"), { incidentId: "inc1", evidenceId: null, evidenceState: "" });
    await s.notify(event("e2"), { incidentId: "inc1", evidenceId: null, evidenceState: "" });
    expect(bell()).toHaveLength(1);
  });

  it("says so when do-not-disturb held the alert back, instead of claiming delivery", async () => {
    localStorage.setItem("aureon_dnd", "true");
    const n = await new SafetyNotifier().notify(event("e3"), { incidentId: "inc3", evidenceId: null, evidenceState: "" });
    const inbox = n.delivery.find((d) => d.channel === "operator_inbox");
    expect(inbox?.ok).toBe(false);
    expect(inbox?.detail).toMatch(/do not disturb/);
    expect(bell()).toHaveLength(0);
  });

  it("never claims push, email or sms delivery", async () => {
    const n = await new SafetyNotifier().notify(event("e4"), { incidentId: "inc4", evidenceId: null, evidenceState: "" });
    for (const c of ["push", "email", "sms"]) expect(n.delivery.find((d) => d.channel === c)?.ok).toBe(false);
  });
});
