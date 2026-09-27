// Dashboard chrome layout — the operator chooses the shell, asherin does not
// choose it for them. "current" is the dashboard they already know; "v2" is a
// quieter conversation-first rail. Default is always "current" so nobody's
// muscle memory is taken away by a deploy.
//
// Same write → broadcast → repaint contract as dashboardAppearance.ts, so the
// live dashboard swaps chrome without a reload and without remounting chat.

export type DashboardUi = "current" | "v2";

export const DASHBOARD_UI_KEY = "asherin_dashboard_ui";
export const DASHBOARD_UI_EVENT = "asherin-dashboard-ui";

export const DEFAULT_DASHBOARD_UI: DashboardUi = "current";

function coerce(value: string | null | undefined): DashboardUi | null {
  return value === "v2" ? "v2" : value === "current" ? "current" : null;
}

export function readDashboardUi(): DashboardUi {
  try {
    return coerce(localStorage.getItem(DASHBOARD_UI_KEY)) ?? DEFAULT_DASHBOARD_UI;
  } catch {
    return DEFAULT_DASHBOARD_UI;
  }
}

export function broadcastDashboardUi(): void {
  window.dispatchEvent(new Event(DASHBOARD_UI_EVENT));
}

export function writeDashboardUi(next: DashboardUi): DashboardUi {
  const value = coerce(next) ?? DEFAULT_DASHBOARD_UI;
  try {
    localStorage.setItem(DASHBOARD_UI_KEY, value);
  } catch {
    /* private-mode storage refusal must not block the live swap */
  }
  broadcastDashboardUi();
  return value;
}

/** Account row wins on a new device; an unknown/absent value leaves local alone. */
export function hydrateDashboardUiFromDb(value: string | null | undefined): DashboardUi {
  const parsed = coerce(value);
  if (!parsed) return readDashboardUi();
  return writeDashboardUi(parsed);
}
