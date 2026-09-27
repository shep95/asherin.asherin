import { useCallback, useMemo } from "react";
import { isAdminEmail } from "@/lib/adminEmail";
import { useAuth } from "@/contexts/AuthContext";
import { isRetiredView } from "@/lib/retiredSurfaces";
import type { DashboardView } from "@/components/dashboard/types";

/**
 * Access is a product boundary, not a paywall. Every signed-in account opens
 * every live room; the only rooms that stay closed are the retired ones.
 * `isAdmin` remains for operator-only surfaces (bug triage, owner tools).
 */
export function useAccess() {
  const { user } = useAuth();
  const isAdmin = isAdminEmail(user?.email);

  const canAccess = useCallback((view: DashboardView): boolean => !isRetiredView(view), []);

  return useMemo(() => ({ canAccess, isAdmin }), [canAccess, isAdmin]);
}
