import { lazyWithRetry } from "./lazy-utils";

export const OiDashboardPage    = lazyWithRetry(() => import("@/pages/oi/oi-dashboard"));
export const OiIssueRegister    = lazyWithRetry(() => import("@/pages/oi/oi-issue-register"));
export const OiIssueCapture     = lazyWithRetry(() => import("@/pages/oi/oi-issue-capture"));
export const OiIssueDetail      = lazyWithRetry(() => import("@/pages/oi/oi-issue-detail"));
export const OiIssueClassify    = lazyWithRetry(() => import("@/pages/oi/oi-issue-classify"));
export const OiConfigPage       = lazyWithRetry(() => import("@/pages/oi/oi-config"));
export const OiRcaPage          = lazyWithRetry(() => import("@/pages/oi/oi-rca-page"));
export const OiCapaRegisterPage = lazyWithRetry(() => import("@/pages/oi/oi-capa-register"));
export const OiCapaDetailPage   = lazyWithRetry(() => import("@/pages/oi/oi-capa-detail"));
export const OiSopRegisterPage  = lazyWithRetry(() => import("@/pages/oi/oi-sop-register"));
export const OiSopDetailPage    = lazyWithRetry(() => import("@/pages/oi/oi-sop-detail"));
