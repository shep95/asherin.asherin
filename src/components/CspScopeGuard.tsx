import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * The public pages are served with a CSP that allows https only. The
 * workspace (/dashboard, /whiteboard) is served with one that also allows the
 * local model runtimes on localhost (Ollama, LM Studio, the eng box).
 *
 * A document keeps the policy it was loaded with, so moving from a public page
 * into the workspace inside the SPA would leave the strict policy in force and
 * the local runtimes unreachable. When that happens, reload the same URL once
 * so the workspace's own policy applies.
 */
const WORKSPACE = /^\/(dashboard|whiteboard)(\/|$)/;
const loadedPath = typeof window !== "undefined" ? window.location.pathname : "/";

export function needsWorkspaceReload(loadedPath: string, currentPath: string): boolean {
  return !WORKSPACE.test(loadedPath) && WORKSPACE.test(currentPath);
}

export default function CspScopeGuard() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (window.location.protocol !== "https:") return;
    if (needsWorkspaceReload(loadedPath, pathname)) window.location.replace(window.location.href);
  }, [pathname]);
  return null;
}
