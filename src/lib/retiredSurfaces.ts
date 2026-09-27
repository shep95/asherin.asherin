import type { DashboardView } from "@/components/dashboard/types";

/** Products removed from sale and access. Keep this list aligned with backend guards. */
export const RETIRED_VIEWS: readonly DashboardView[] = [
  "geospatial",
  "zacoon",
  "zaxin",
  "shepherd",
  "axrlen",
  "zeeion",
  "timeseries",
  "ghost-engine",
  "ide",
];

export function isRetiredView(view: string): boolean {
  return (RETIRED_VIEWS as readonly string[]).includes(view);
}
