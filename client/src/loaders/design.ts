import { lazyWithRetry } from "./lazy-utils";

export const DesignDashboardPage = lazyWithRetry(() => import("@/pages/design-management/design-dashboard"));
export const DesignProjectsPage = lazyWithRetry(() => import("@/pages/design-management/design-projects"));
export const DrawingRegistryPage = lazyWithRetry(() => import("@/pages/design-management/drawing-registry"));
export const ReviewApprovalPage = lazyWithRetry(() => import("@/pages/design-management/design-reviews"));
export const TransmittalsPage = lazyWithRetry(() => import("@/pages/design-management/transmittals"));
export const StandardsTemplatesPage = lazyWithRetry(() => import("@/pages/design-management/standards-templates"));
export const ReportsAnalyticsPage = lazyWithRetry(() => import("@/pages/design-management/reports-analytics"));
export const DesignToolsPage = lazyWithRetry(() => import("@/pages/design-tools-page"));
export const DesignManagementPage = lazyWithRetry(() => import("@/pages/design-management-page"));
export const DrawingVerificationPage = lazyWithRetry(() => import("@/pages/design-management/drawing-verification"));
