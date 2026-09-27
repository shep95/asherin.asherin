import { describe, it, expect } from "vitest";
import { createLedger, tickLedger, classifyMac, extractMac, feetFromMeters, ledgerToCsv, ledgerToJson, movementTrail } from "@/components/dashboard/arvision/eagle/radioLedger";

const dev = (id: string, meters: number, t: number) => ({ id, name: id, vendor: null, companyId: null, fingerprint: "f", rssi: -50, meters, lastSeenMs: t, packets: 1 });

describe("radio ledger", () => {
  it("classifies randomized vs hardware macs", () => {
    expect(classifyMac("5A:6B:2F:FE:11:22")).toBe("randomized");
    expect(classifyMac("7E:D4:D2:36:11:22")).toBe("randomized");
    expect(classifyMac("D8:20:1C:9F:11:22")).toBe("public");
    expect(extractMac("Unknown (7d:5c:d2:31:aa:bb)")).toBe("7D:5C:D2:31:AA:BB");
  });

  it("logs per-second movement in feet with deltas", () => {
    let s = createLedger(0);
    let t = 0;
    for (const m of [4, 3.5, 3, 2.4, 2, 1.6]) { t += 1000; s = tickLedger(s, [dev("a", m, t)], t); }
    const tr = s.tracks["a"];
    expect(tr.dwellSeconds).toBe(6);
    expect(tr.feet).toBe(feetFromMeters(1.6));
    expect(tr.signature).toBe("approaching");
    expect(tr.samples.at(-1)!.deltaFeet).toBeLessThan(0);
    expect(movementTrail(tr)).toContain("→");
    expect(s.log.filter((l) => l.event === "sample" || l.event === "appeared").length).toBe(6);
  });

  it("flags loss, reappearance and group arrivals", () => {
    let s = createLedger(0);
    s = tickLedger(s, [dev("a", 3, 1000)], 1000);
    s = tickLedger(s, [], 40_000);
    expect(s.tracks["a"].present).toBe(false);
    expect(s.log.some((l) => l.event === "lost")).toBe(true);
    s = tickLedger(s, [dev("a", 3, 80_000)], 80_000);
    expect(s.tracks["a"].gaps.length).toBe(1);
    expect(s.log.some((l) => l.event === "returned")).toBe(true);
    s = tickLedger(s, [dev("a", 3, 81_000), dev("b", 4, 81_000), dev("c", 5, 81_000), dev("d", 6, 81_000)], 81_000);
    expect(s.clusters.length).toBe(1);
  });

  it("reads stationary and bouncing apart, and exports", () => {
    let s = createLedger(0); let t = 0;
    for (let i = 0; i < 8; i++) { t += 1000; s = tickLedger(s, [dev("still", 3, t)], t); }
    expect(s.tracks["still"].signature).toBe("stationary");
    let b = createLedger(0); t = 0;
    for (const m of [10, 4, 10, 4, 10, 4, 10, 4]) { t += 1000; b = tickLedger(b, [dev("pass", m, t)], t); }
    expect(b.tracks["pass"].signature).toBe("bouncing");
    expect(ledgerToCsv(s).split("\n").length).toBe(9);
    expect(JSON.parse(ledgerToJson(s)).devices[0].dwell_seconds).toBe(8);
  });
});
