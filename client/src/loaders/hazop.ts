import { lazyWithRetry } from "./lazy-utils";

export const HazopDashboardPage = lazyWithRetry(() => import("@/pages/hazop/hazop-dashboard"));
