import { lazyWithRetry } from "./lazy-utils";

export const HazopDashboardPage = lazyWithRetry(() => import("@/pages/hazop/hazop-dashboard"));
export const HazopProcessBuilderPage = lazyWithRetry(() => import("@/pages/hazop/hazop-process-builder"));
export const HazopNodesPage = lazyWithRetry(() => import("@/pages/hazop/hazop-nodes"));
export const HazopWorksheetPage = lazyWithRetry(() => import("@/pages/hazop/hazop-worksheet"));
export const HazopActionsPage = lazyWithRetry(() => import("@/pages/hazop/hazop-actions"));
