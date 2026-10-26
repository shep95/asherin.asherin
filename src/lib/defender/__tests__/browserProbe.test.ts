import { describe, expect, it } from "vitest";
import { browserVersionReading } from "../browserProbe";
import { buildPosture, scorePosture } from "../posture";
import { PROTECTION_COUNT } from "../protections";

describe("browserVersionReading", () => {
  it("reads the major version and compares it to the floor", () => {
    const old = browserVersionReading("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36");
    expect(old).toEqual({ name: "chrome", major: 100, min: 126, current: false });
    const fresh = browserVersionReading("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0");
    expect(fresh?.name).toBe("firefox");
    expect(fresh?.current).toBe(true);
  });

  it("prefers the edge token over the chrome token it also carries", () => {
    const edge = browserVersionReading("Mozilla/5.0 AppleWebKit/537.36 Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0");
    expect(edge?.name).toBe("edge");
  });

  it("returns null for a user agent it does not recognise, so the protection stays unmeasured", () => {
    expect(browserVersionReading("curl/8.0")).toBeNull();
  });
});

describe("explicit gaps from the probe", () => {
  it("an unmeasured browser reading explains itself but never counts toward the score or coverage", () => {
    const rows = buildPosture([
      { id: "net.captive-portal", state: "unmeasured", source: "browser", observed: "not probed — this room calls no third-party host" },
      { id: "br.secure-context", state: "pass", source: "browser", observed: "https" },
    ]);
    const portal = rows.find((r) => r.id === "net.captive-portal")!;
    expect(portal.finding.state).toBe("unmeasured");
    expect(portal.finding.observed).toMatch(/not probed/);
    const score = scorePosture(rows);
    expect(score.measured).toBe(1);
    expect(score.unmeasured).toBe(PROTECTION_COUNT - 1);
    expect(score.score).toBe(1000);
  });

  it("a real reading replaces an explicit gap for the same protection", () => {
    const rows = buildPosture(
      [{ id: "net.link-quality", state: "unmeasured", source: "browser", observed: "api not exposed" }],
      [{ id: "net.link-quality", state: "pass", source: "browser", observed: "wifi · 4g" }],
    );
    expect(rows.find((r) => r.id === "net.link-quality")!.finding.state).toBe("pass");
  });
});
