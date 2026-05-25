import { lazyWithRetry } from "./lazy-utils";

export const HazopDashboardPage = lazyWithRetry(() => import("@/pages/hazop/hazop-dashboard"));
export const HazopProcessBuilderPage = lazyWithRetry(() => import("@/pages/hazop/hazop-process-builder"));
export const HazopNodesPage = lazyWithRetry(() => import("@/pages/hazop/hazop-nodes"));
export const HazopWorksheetPage = lazyWithRetry(() => import("@/pages/hazop/hazop-worksheet"));
export const HazopActionsPage = lazyWithRetry(() => import("@/pages/hazop/hazop-actions"));
export const HazopEventGroupsPage = lazyWithRetry(() => import("@/pages/hazop/hazop-event-groups"));
export const HazopResponseGroupsPage = lazyWithRetry(() => import("@/pages/hazop/hazop-response-groups"));
export const HazopScenariosPage = lazyWithRetry(() => import("@/pages/hazop/hazop-scenarios"));
export const HazopCeMatrixPage = lazyWithRetry(() => import("@/pages/hazop/hazop-ce-matrix"));
export const HazopSafetyFunctionsPage = lazyWithRetry(() => import("@/pages/hazop/hazop-safety-functions"));
export const HazopInterlocksPage = lazyWithRetry(() => import("@/pages/hazop/hazop-interlocks"));
export const HazopAlarmTripsPage = lazyWithRetry(() => import("@/pages/hazop/hazop-alarm-trips"));
export const HazopSafetyCriticalElementsPage = lazyWithRetry(() => import("@/pages/hazop/hazop-safety-critical-elements"));
export const HazopLopaPage = lazyWithRetry(() => import("@/pages/hazop/hazop-lopa"));
export const HazopLopaDetailPage = lazyWithRetry(() => import("@/pages/hazop/hazop-lopa-detail"));
export const HazopSrsPage = lazyWithRetry(() => import("@/pages/hazop/hazop-srs"));
export const HazopSrsDetailPage = lazyWithRetry(() => import("@/pages/hazop/hazop-srs-detail"));
