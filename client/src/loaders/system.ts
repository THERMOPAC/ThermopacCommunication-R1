import { lazyWithRetry } from "./lazy-utils";

export const EmailsPage = lazyWithRetry(() => import("@/pages/emails-page"));
export const MessagesPage = lazyWithRetry(() => import("@/pages/messages-page"));
export const ActiveAlertsPage = lazyWithRetry(() => import("@/pages/active-alerts-page"));
export const AlertsPage = lazyWithRetry(() => import("@/pages/alerts-page"));
export const TemplateManagementPage = lazyWithRetry(() => import("@/pages/template-management-page"));
export const ModulePermissionsPage = lazyWithRetry(() => import("@/pages/module-permissions-page"));
export const DiagnosticsPage = lazyWithRetry(() => import("@/pages/diagnostics-page"));
export const GcsDiagnosticPage = lazyWithRetry(() => import("@/pages/gcs-diagnostic-page"));
export const GcsTestPage = lazyWithRetry(() => import("@/pages/gcs-test-page"));
export const SpecialFixesPage = lazyWithRetry(() => import("@/pages/special-fixes-page"));
export const UsageTrackerPage = lazyWithRetry(() => import("@/pages/usage-tracker-page"));
