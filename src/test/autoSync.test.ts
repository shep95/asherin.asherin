import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAutoSync } from "@/hooks/useAutoSync";

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("useAutoSync", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("sweeps as soon as the surface is opened", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useAutoSync({ key: "t1", run, enabled: true }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  });

  it("stays idle while disabled, then sweeps the moment it is enabled", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ on }: { on: boolean }) => useAutoSync({ key: "t2", run, enabled: on }),
      { initialProps: { on: false } },
    );
    await flush();
    expect(run).not.toHaveBeenCalled();
    rerender({ on: true });
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  });

  it("records the run and reports a next scheduled attempt", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSync({ key: "t3", run, enabled: true }));
    await waitFor(() => expect(result.current.lastRunAt).not.toBeNull());
    expect(result.current.syncing).toBe(false);
    expect(result.current.lastError).toBeNull();
    expect(result.current.nextRunAt).toBeGreaterThan(Date.now());
  });

  it("yields to a sibling tab that already swept inside the gap window", async () => {
    // A live stamp stands in for another tab having just completed a sweep.
    localStorage.setItem("asherin_autosync_stamp:shared", String(Date.now()));
    const run = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useAutoSync({ key: "shared", run, enabled: true, minGapMs: 60_000 }));
    await flush();
    expect(run).not.toHaveBeenCalled();
  });

  it("lets an operator force a sweep through the gap", async () => {
    localStorage.setItem("asherin_autosync_stamp:forced", String(Date.now()));
    const run = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAutoSync({ key: "forced", run, enabled: true, minGapMs: 60_000 }),
    );
    await flush();
    expect(run).not.toHaveBeenCalled();
    await act(async () => { await result.current.syncNow(); });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("collapses overlapping triggers into a single in-flight sweep", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const run = vi.fn().mockImplementation(() => gate);
    const { result } = renderHook(() =>
      useAutoSync({ key: "single", run, enabled: true, minGapMs: 0 }),
    );
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
    await act(async () => {
      void result.current.syncNow();
      void result.current.syncNow();
      await Promise.resolve();
    });
    expect(run).toHaveBeenCalledTimes(1);
    await act(async () => { release(); await gate; });
  });

  it("surfaces a failure and widens the cadence instead of retrying immediately", async () => {
    const run = vi.fn().mockRejectedValue(new Error("token revoked"));
    const { result } = renderHook(() =>
      useAutoSync({ key: "fail", run, enabled: true, intervalMs: 10_000 }),
    );
    await waitFor(() => expect(result.current.lastError).toBe("token revoked"));
    expect(result.current.lastRunAt).toBeNull();
    // First failure doubles the base cadence; the next attempt is not immediate.
    expect(result.current.nextRunAt! - Date.now()).toBeGreaterThan(10_000);
  });

  it("catches up when the tab is brought back into view", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useAutoSync({ key: "vis", run, enabled: true, minGapMs: 0 }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  });

  it("schedules nothing once the surface unmounts", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const { unmount } = renderHook(() =>
      useAutoSync({ key: "unmount", run, enabled: true, intervalMs: 20, minGapMs: 0 }),
    );
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    unmount();
    const after = run.mock.calls.length;
    await new Promise((r) => setTimeout(r, 120));
    expect(run.mock.calls.length).toBe(after);
  });
});
