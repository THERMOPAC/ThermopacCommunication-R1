import { lazyWithRetry } from "./lazy-utils";

export const AttendancePage = lazyWithRetry(() => import("@/pages/attendance-page"));
export const AttendanceRegularizationPage = lazyWithRetry(() => import("@/pages/attendance-regularization-page"));
export const DwarPage = lazyWithRetry(() => import("@/pages/dwar-page"));
export const LeaveRequestPage = lazyWithRetry(() => import("@/pages/leave-request-page"));
export const EmployeeAppraisalsPage = lazyWithRetry(() => import("@/pages/employee-appraisals-page"));
export const LoansAdvancesPage = lazyWithRetry(() => import("@/pages/loans-advances-page"));
export const LeaderboardPage = lazyWithRetry(() => import("@/pages/leaderboard-page"));
export const RecurringTasksPage = lazyWithRetry(() => import("@/pages/recurring-tasks-page"));
export const ProfilePage = lazyWithRetry(() => import("@/pages/profile-page"));
export const GoogleCalendarSettingsPage = lazyWithRetry(() => import("@/pages/google-calendar-settings"));
