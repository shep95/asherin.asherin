import { describe, expect, it } from "vitest";
import { needsWorkspaceReload } from "../components/CspScopeGuard";

describe("CSP scope guard", () => {
  it("reloads once when an SPA navigation enters the workspace from a public page", () => {
    expect(needsWorkspaceReload("/", "/dashboard")).toBe(true);
    expect(needsWorkspaceReload("/software", "/dashboard/settings")).toBe(true);
    expect(needsWorkspaceReload("/blog", "/whiteboard")).toBe(true);
  });

  it("leaves pages alone when the document already carries the right policy", () => {
    expect(needsWorkspaceReload("/dashboard", "/dashboard/settings")).toBe(false);
    expect(needsWorkspaceReload("/dashboard", "/")).toBe(false);
    expect(needsWorkspaceReload("/", "/blog")).toBe(false);
    expect(needsWorkspaceReload("/", "/dashboards-are-not-the-workspace")).toBe(false);
  });
});
