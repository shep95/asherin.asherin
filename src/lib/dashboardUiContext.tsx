// Which dashboard chrome the operator chose, made readable from any view
// without threading a prop through every lazy component boundary.
//
// Views ask `useDashboardUiMode() === "v2"` and drop their own page hero,
// because in v.2 the shell owns the title, the one-line subtitle and the
// single primary-action slot. Current (v.1) keeps every page exactly as it
// was: the context defaults to "current", so an unwrapped tree is unchanged.

import { createContext, useContext } from "react";
import type { DashboardUi } from "@/lib/dashboardUi";

const DashboardUiContext = createContext<DashboardUi>("current");

export const DashboardUiProvider = DashboardUiContext.Provider;

export function useDashboardUiMode(): DashboardUi {
  return useContext(DashboardUiContext);
}

/** Convenience: true only inside a v.2 shell. */
export function useIsV2(): boolean {
  return useContext(DashboardUiContext) === "v2";
}
