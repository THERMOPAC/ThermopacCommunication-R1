import { lazyWithRetry } from "./lazy-utils";

export const AdministrationPage = lazyWithRetry(() => import("@/pages/admin/administration-page"));
export const UserManagementPage = lazyWithRetry(() => import("@/pages/admin/user-management-page"));
export const AttendanceManagementPage = lazyWithRetry(() => import("@/pages/admin/attendance-management-page"));
export const LeaveManagementPage = lazyWithRetry(() => import("@/pages/admin/leave-management-page"));
export const PayrollManagementPage = lazyWithRetry(() => import("@/pages/admin/payroll-management-new"));
export const IncrementApprovalsPage = lazyWithRetry(() => import("@/pages/admin/increment-approvals-page"));
export const WorkweekPolicyManagementPage = lazyWithRetry(() => import("@/pages/admin/workweek-policy-management-page"));
export const BusinessTripManagementPage = lazyWithRetry(() => import("@/pages/admin/business-trip-management"));
export const VisaManagementPageNew = lazyWithRetry(() => import("@/pages/admin/visa-management-new"));
export const LegalManagementPage = lazyWithRetry(() => import("@/pages/admin/legal-management"));
export const MeetingsManagementPage = lazyWithRetry(() => import("@/pages/admin/meetings-management"));
export const PasswordCompliancePage = lazyWithRetry(() => import("@/pages/password-compliance-page"));
export const WorkLocationsPage = lazyWithRetry(() => import("@/pages/work-locations-page"));
export const SystemSettingsPage = lazyWithRetry(() => import("@/pages/admin/system-settings-page"));
export const TwoFaPolicyPage = lazyWithRetry(() => import("@/pages/admin/two-fa-policy-page"));
export const SecurityEnforcementPage = lazyWithRetry(() => import("@/pages/admin/security-enforcement-page"));
