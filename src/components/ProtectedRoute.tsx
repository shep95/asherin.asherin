import type { ReactNode } from "react";

/**
 * Local edition: there is nothing to protect a route from. The device is the
 * operator and the dashboard opens directly.
 */
const ProtectedRoute = ({ children }: { children: ReactNode }) => <>{children}</>;

export default ProtectedRoute;
