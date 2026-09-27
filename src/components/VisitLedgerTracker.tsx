import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { recordView, flushDwell } from "@/lib/analytics/visitLedger";

/**
 * Mounts once. Records one view per route change and closes each view with its
 * dwell time when the visitor leaves, hides the tab, or navigates on.
 * Dashboard rooms are excluded: this ledger is public, so only public surfaces
 * are written to it.
 */
const PRIVATE_PREFIXES = ["/asherin.acatalepsy", "/dashboard", "/whiteboard"];

const VisitLedgerTracker = () => {
  const location = useLocation();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    const path = location.pathname;
    if (PRIVATE_PREFIXES.some((p) => path.startsWith(p))) return;
    if (lastPath.current === path) return;
    lastPath.current = path;
    void recordView(path);
  }, [location.pathname]);

  useEffect(() => {
    const close = () => { void flushDwell(); };
    const onHide = () => { if (document.visibilityState === "hidden") close(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", close);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", close);
      close();
    };
  }, []);

  return null;
};

export default VisitLedgerTracker;
