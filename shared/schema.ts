import { pgTable, text, serial, integer, bigint, boolean, jsonb, timestamp, date, decimal, varchar, foreignKey, primaryKey, doublePrecision, uuid, time, numeric, uniqueIndex, real, check, pgEnum, index, smallint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { roles } from "./roles";
import { relations, sql } from "drizzle-orm";

// Available system modules
export const modules = [
  "Administration",
  "Legal Management",
  "Digital Marketing",
  "Sales and Marketing",
  "Finance",
  "Project Management",
  "Task Management",
  "Emails",
  "Meetings & Commitments",
  "Procurement Management", 
  "Production Management", 
  "Quality Management",
  "Design Management",
  "Project Commissioning",
  "Dispatch & Shipping",
  "After-Sales",
  "SAP B1 Integration",
  "SAP Purchasing",
  "Employee Appraisal",
  "GCS Dashboard",
  "Usage Tracker",
  "EPC Assignment Control",
  "HAZOP"
] as const;

export type Module = typeof modules[number];

// Lead status values
export const leadStatuses = [
  "New",
  "Contacted",
  "Qualified",
  "Proposal",
  "Negotiation",
  "Won",
  "Lost"
] as const;

export type LeadStatus = typeof leadStatuses[number];

// Invoice status values
export const invoiceStatuses = [
  "Pending",
  "Paid",
  "Partially Paid",
  "Overdue",
  "Cancelled",
  "Credited"
] as const;

export type InvoiceStatus = typeof invoiceStatuses[number];

// Payment methods
export const paymentMethods = [
  "Bank Transfer",
  "Wire Transfer",
  "Cash",
  "Check",
  "Credit Card",
  "Online Payment",
  "Other"
] as const;

export type PaymentMethod = typeof paymentMethods[number];

// Campaign status values
export const campaignStatuses = [
  "Planned",
  "Active",
  "Completed", 
  "Cancelled"
] as const;

export type CampaignStatus = typeof campaignStatuses[number];

// Lead source definitions
export const leadSources = [
  "Google Ads",
  "Website",
  "Referral",
  "Exhibition",
  "Direct Contact"
] as const;

export type LeadSource = typeof leadSources[number];

// Meeting priority levels
export const meetingPriorities = [
  "Low",
  "Medium", 
  "High",
  "Critical"
] as const;

export type MeetingPriority = typeof meetingPriorities[number];

// Meeting types
export const meetingTypes = [
  "Team Meeting",
  "Client Meeting",
  "Board Meeting",
  "Project Review",
  "Strategy Session",
  "Training Session",
  "Performance Review",
  "Planning Meeting",
  "Status Update",
  "Other"
] as const;

export type MeetingType = typeof meetingTypes[number];

// Material Types
export const materialTypes = [
  "Bars",
  "Flanges", 
  "Nut Bolts",
  "Pipe Fittings",
  "Pipes",
  "Plates",
  "Sheets",
  "Structural Materials",
  "Valves",
  "Others"
] as const;

export type MaterialType = typeof materialTypes[number];

// Commitment status values
export const commitmentStatuses = [
  "Pending",
  "In Progress", 
  "Completed",
  "Overdue",
  "Cancelled",
  "On Hold"
] as const;

export type CommitmentStatus = typeof commitmentStatuses[number];

// Commitment priority levels
export const commitmentPriorities = [
  "Low",
  "Medium",
  "High", 
  "Critical"
] as const;

export type CommitmentPriority = typeof commitmentPriorities[number];

// Work Location Management
export const workLocations = pgTable('work_locations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  state: text('state').notNull(),
  pincode: text('pincode').notNull(),
  country: text('country').notNull().default('India'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  radiusMeters: integer('radius_meters').default(100),
  ipRestrictions: text('ip_restrictions').array(),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  // Attendance Security — Phase 1
  locationCountryCode: varchar('location_country_code', { length: 5 }),
  // Audit tracking
  createdBy: integer('created_by'),
  updatedBy: integer('updated_by'),
});

export const workLocationAuditLog = pgTable('work_location_audit_log', {
  id: serial('id').primaryKey(),
  workLocationId: integer('work_location_id'),
  action: text('action').notNull(),
  changedBy: integer('changed_by'),
  changedAt: timestamp('changed_at').notNull().defaultNow(),
  previousValues: jsonb('previous_values'),
  newValues: jsonb('new_values'),
});

// Attendance Records table
export const attendanceRecords = pgTable('attendance_records', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workLocationId: integer('work_location_id').references(() => workLocations.id, { onDelete: 'set null' }),
  date: date('date').notNull(),
  
  // Check-in details
  checkInTime: timestamp('check_in_time'),
  checkInLatitude: doublePrecision('check_in_latitude'),
  checkInLongitude: doublePrecision('check_in_longitude'),
  checkInAddress: text('check_in_address'),
  checkInIpAddress: varchar('check_in_ip_address', { length: 45 }),
  checkInDeviceInfo: jsonb('check_in_device_info'),
  
  // Check-out details
  checkOutTime: timestamp('check_out_time'),
  checkOutLatitude: doublePrecision('check_out_latitude'),
  checkOutLongitude: doublePrecision('check_out_longitude'),
  checkOutAddress: text('check_out_address'),
  checkOutIpAddress: varchar('check_out_ip_address', { length: 45 }),
  checkOutDeviceInfo: jsonb('check_out_device_info'),
  
  // Calculated fields
  workingHours: decimal('working_hours', { precision: 5, scale: 2 }),
  netWorkingHours: decimal('net_working_hours', { precision: 5, scale: 2 }),
  overtimeHours: decimal('overtime_hours', { precision: 5, scale: 2 }).default('0'),
  
  // Status and validation
  status: varchar('status', { length: 30 }).notNull().default('present'),
  statusSource: varchar('status_source', { length: 40 }),
  isLocationVerified: boolean('is_location_verified').default(false),
  isIpVerified: boolean('is_ip_verified').default(false),
  isLateArrival: boolean('is_late_arrival').default(false),
  isEarlyDeparture: boolean('is_early_departure').default(false),

  // Per-user threshold audit (populated for dates >= 2026-05-01)
  minimumDailyHoursUsed: decimal('minimum_daily_hours_used', { precision: 4, scale: 2 }),
  halfDayMinimumHoursUsed: decimal('half_day_minimum_hours_used', { precision: 4, scale: 2 }),
  workTimePolicyUsed: varchar('work_time_policy_used', { length: 20 }),
  netWorkingSecondsUsed: integer('net_working_seconds_used'),
  toleranceApplied: boolean('tolerance_applied').default(false),
  
  // Incomplete attendance tracking
  isIncomplete: boolean('is_incomplete').default(false),
  incompleteReason: text('incomplete_reason'),
  flaggedAt: timestamp('flagged_at'),
  requiresApproval: boolean('requires_approval').default(false),
  approvedBy: integer('approved_by').references(() => users.id),
  approvalDate: timestamp('approval_date'),
  approvalNotes: text('approval_notes'),
  
  // Admin adjustments
  adminAdjustment: jsonb('admin_adjustment'),
  adjustedBy: integer('adjusted_by').references(() => users.id),
  adjustmentReason: text('adjustment_reason'),
  adjustmentDate: timestamp('adjustment_date'),
  originalPunchData: jsonb('original_punch_data'),
  
  // Source of attendance data
  source: varchar('source', { length: 30 }).default('biometric'),

  // Attendance Security — Phase 1 (all nullable; no enforcement until Phase 5)
  checkInGpsAccuracyMeters: doublePrecision('check_in_gps_accuracy_meters'),
  checkOutGpsAccuracyMeters: doublePrecision('check_out_gps_accuracy_meters'),
  checkInMode: varchar('check_in_mode', { length: 20 }),
  attendancePolicyMode: varchar('attendance_policy_mode', { length: 20 }),

  // Notes and remarks
  employeeNotes: text('employee_notes'),
  adminNotes: text('admin_notes'),
  
  // Tracking
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uq_attendance_user_date').on(table.userId, table.date),
]);

// Attendance Override Log — immutable audit trail for admin overrides
export const attendanceOverrideLog = pgTable('attendance_override_log', {
  id: serial('id').primaryKey(),
  recordId: integer('record_id').notNull().references(() => attendanceRecords.id, { onDelete: 'cascade' }),
  employeeId: integer('employee_id').notNull().references(() => users.id),
  date: text('date').notNull(),
  action: varchar('action', { length: 20 }).notNull(), // 'apply' | 'revert'
  beforeValues: jsonb('before_values').notNull(),
  afterValues: jsonb('after_values').notNull(),
  reason: text('reason').notNull(),
  changedBy: integer('changed_by').notNull().references(() => users.id),
  changedAt: timestamp('changed_at').notNull().defaultNow(),
  payrollPeriodWasLocked: boolean('payroll_period_was_locked').default(false),
  requiresPayrollRecalculation: boolean('requires_payroll_recalculation').default(false),
});

export type AttendanceOverrideLog = typeof attendanceOverrideLog.$inferSelect;
export type InsertAttendanceOverrideLog = typeof attendanceOverrideLog.$inferInsert;

// Attendance Settings table
export const attendanceSettings = pgTable('attendance_settings', {
  id: serial('id').primaryKey(),
  workLocationId: integer('work_location_id').references(() => workLocations.id, { onDelete: 'cascade' }),
  
  // Working hours
  standardWorkingHours: decimal('standard_working_hours', { precision: 3, scale: 1 }).notNull().default('8.0'),
  overtimeThreshold: decimal('overtime_threshold', { precision: 3, scale: 1 }).notNull().default('8.0'),
  
  // Time slots
  earliestCheckIn: varchar('earliest_check_in', { length: 8 }).notNull().default('06:00:00'),
  latestCheckOut: varchar('latest_check_out', { length: 8 }).notNull().default('22:00:00'),
  lateThreshold: integer('late_threshold_minutes').notNull().default(15), // Minutes after standard time
  
  // Break settings
  lunchBreakDuration: integer('lunch_break_duration_minutes').default(60),
  automaticBreakDeduction: boolean('automatic_break_deduction').default(true),
  
  // Location verification
  requireLocationVerification: boolean('require_location_verification').default(true),
  requireIpVerification: boolean('require_ip_verification').default(false),
  allowOfflineCheckIn: boolean('allow_offline_check_in').default(false),
  
  // Tracking
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Attendance Issues table for tracking incomplete attendance and requiring management attention
export const attendanceIssues = pgTable('attendance_issues', {
  id: serial('id').primaryKey(),
  attendanceRecordId: integer('attendance_record_id').notNull().references(() => attendanceRecords.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Issue details
  issueType: varchar('issue_type', { length: 50 }).notNull(), // 'incomplete_checkout', 'no_dwar', 'late_arrival', 'early_departure'
  description: text('description').notNull(),
  severity: varchar('severity', { length: 20 }).notNull().default('medium'), // 'low', 'medium', 'high'
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending', 'resolved', 'escalated'
  
  // Timeline
  detectedAt: timestamp('detected_at').notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at'),
  resolvedBy: integer('resolved_by').references(() => users.id),
  resolutionNotes: text('resolution_notes'),
  
  // Notifications
  managerNotified: boolean('manager_notified').default(false),
  hrNotified: boolean('hr_notified').default(false),
  
  // Tracking
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Daily Work Activity Reports (DWAR) table
export const dailyWorkReports = pgTable('daily_work_reports', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reportDate: date('report_date').notNull(),
  
  // Work summary
  tasksCompleted: integer('tasks_completed').notNull().default(0),
  tasksInProgress: integer('tasks_in_progress').notNull().default(0),
  hoursWorked: decimal('hours_worked', { precision: 4, scale: 2 }).notNull().default('0'),
  productivityScore: decimal('productivity_score', { precision: 5, scale: 2 }).default('0'), // Auto-calculated
  
  // Detailed activities (JSON array of activity objects)
  activities: jsonb('activities').notNull().default([]), // [{type, description, timeSpent, plannedHours, priority, status, taskId, blockedReason}]
  
  // Issues and challenges
  challenges: text('challenges'),
  issuesEncountered: text('issues_encountered'),
  supportRequired: text('support_required'),
  
  // Next day planning
  tomorrowPlans: text('tomorrow_plans'),
  priorityTasks: jsonb('priority_tasks').default([]), // Array of task objects
  
  // KPI tracking (auto-calculated from activities and attendance)
  qualityScore: decimal('quality_score', { precision: 5, scale: 2 }).default('0'),
  efficiencyRating: decimal('efficiency_rating', { precision: 5, scale: 2 }).default('0'),
  collaborationScore: decimal('collaboration_score', { precision: 5, scale: 2 }).default('0'),
  planFollowThroughScore: decimal('plan_follow_through_score', { precision: 5, scale: 2 }).default('0'),
  planFollowThroughDetails: jsonb('plan_follow_through_details').default(null),
  
  // Status and approvals
  status: varchar('status', { length: 20 }).notNull().default('draft'), // draft, submitted, approved, rejected
  submittedAt: timestamp('submitted_at'),
  approvedBy: integer('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  
  // Manager feedback
  managerFeedback: text('manager_feedback'),
  managerRating: integer('manager_rating'), // 1-5 scale
  
  // Satisfaction and challenge ratings
  satisfactionRating: integer('satisfaction_rating'), // 1-5 scale for daily satisfaction
  challengeLevel: integer('challenge_level'), // 1-5 scale for difficulty level
  blockedTasks: integer('blocked_tasks').default(0), // Number of blocked tasks
  
  // Tracking
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  
  // Ensure one report per user per date
  // Commented out due to unique constraint conflicts during development
  // UNIQUE(user_id, report_date)
});

// Monthly KPI Summary table (auto-generated from DWAR and attendance data)
export const monthlyKpiSummary = pgTable('monthly_kpi_summary', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  month: integer('month').notNull(), // 1-12
  year: integer('year').notNull(),
  
  // Attendance KPIs
  totalWorkingDays: integer('total_working_days').notNull().default(0),
  daysPresent: integer('days_present').notNull().default(0),
  daysAbsent: integer('days_absent').notNull().default(0),
  daysLate: integer('days_late').notNull().default(0),
  totalHoursWorked: decimal('total_hours_worked', { precision: 6, scale: 2 }).default('0'),
  overtimeHours: decimal('overtime_hours', { precision: 6, scale: 2 }).default('0'),
  attendancePercentage: decimal('attendance_percentage', { precision: 5, scale: 2 }).default('0'),
  
  // Performance KPIs from DWAR
  totalTasksCompleted: integer('total_tasks_completed').default(0),
  averageProductivityScore: decimal('average_productivity_score', { precision: 5, scale: 2 }).default('0'),
  averageQualityScore: decimal('average_quality_score', { precision: 5, scale: 2 }).default('0'),
  averageEfficiencyRating: decimal('average_efficiency_rating', { precision: 5, scale: 2 }).default('0'),
  averageCollaborationScore: decimal('average_collaboration_score', { precision: 5, scale: 2 }).default('0'),
  dwarSubmissionRate: decimal('dwar_submission_rate', { precision: 5, scale: 2 }).default('0'), // Percentage of days with DWAR
  
  // Manager evaluation KPIs
  averageManagerRating: decimal('average_manager_rating', { precision: 3, scale: 2 }).default('0'),
  totalApprovedReports: integer('total_approved_reports').default(0),
  totalRejectedReports: integer('total_rejected_reports').default(0),
  
  // Overall performance score (calculated from all KPIs)
  overallPerformanceScore: decimal('overall_performance_score', { precision: 5, scale: 2 }).default('0'),
  performanceGrade: varchar('performance_grade', { length: 2 }).default('C'), // A+, A, B+, B, C+, C, D
  
  // Tracking
  calculatedAt: timestamp('calculated_at').notNull().defaultNow(),
  lastUpdated: timestamp('last_updated').notNull().defaultNow(),
  
  // One summary per user per month
  // Commented out due to unique constraint conflicts during development
  // UNIQUE(user_id, month, year)
});

// DWAR Audit Log - persistent, queryable audit trail for all DWAR/KPI operations
export const dwarAuditLog = pgTable('dwar_audit_log', {
  id: serial('id').primaryKey(),
  event: varchar('event', { length: 100 }).notNull(),
  actorId: integer('actor_id').references(() => users.id),
  actorType: varchar('actor_type', { length: 20 }).notNull().default('user'),
  targetUserId: integer('target_user_id').references(() => users.id),
  reportId: integer('report_id'),
  year: integer('year'),
  month: integer('month'),
  details: jsonb('details').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  integrityHash: varchar('integrity_hash', { length: 64 }),
});

export type DwarAuditLog = typeof dwarAuditLog.$inferSelect;
export type InsertDwarAuditLog = typeof dwarAuditLog.$inferInsert;

// Leave Management Tables
export const leaveTypes = pgTable('leave_types', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  description: text('description'),
  maxDaysPerYear: decimal('max_days_per_year', { precision: 5, scale: 2 }).default('0'),
  carryoverAllowed: boolean('carryover_allowed').default(false),
  maxCarryoverDays: decimal('max_carryover_days', { precision: 5, scale: 2 }).default('0'),
  isPaid: boolean('is_paid').default(true),
  requiresApproval: boolean('requires_approval').default(true),
  noticeDaysRequired: integer('notice_days_required').default(1),
  canBeHalfDay: boolean('can_be_half_day').default(true),
  sandwichApplicable: boolean('sandwich_applicable').default(false),
  colorCode: varchar('color_code', { length: 7 }).default('#3B82F6'),
  isActive: boolean('is_active').default(true),
  // Accrual configuration (CL accrues 1.25/month; others are 'manual')
  accrualType: varchar('accrual_type', { length: 20 }).default('manual'), // 'manual' | 'monthly'
  monthlyAccrualRate: decimal('monthly_accrual_rate', { precision: 5, scale: 2 }).default('0'),
  accrualDayOfMonth: integer('accrual_day_of_month').default(1),
  accrualProRate: boolean('accrual_pro_rate').default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const leaveBalances = pgTable('leave_balances', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  leaveTypeId: integer('leave_type_id').notNull().references(() => leaveTypes.id, { onDelete: 'cascade' }),
  year: integer('year').notNull(),
  allocatedDays: decimal('allocated_days', { precision: 5, scale: 2 }).notNull().default('0'),
  usedDays: decimal('used_days', { precision: 5, scale: 2 }).notNull().default('0'),
  pendingDays: decimal('pending_days', { precision: 5, scale: 2 }).notNull().default('0'),
  carryoverDays: decimal('carryover_days', { precision: 5, scale: 2 }).notNull().default('0'),
  adjustmentDays: decimal('adjustment_days', { precision: 6, scale: 2 }).notNull().default('0'),
  lastUpdated: timestamp('last_updated').notNull().defaultNow(),
  updatedBy: integer('updated_by').references(() => users.id),
});

export const leaveRequests = pgTable('leave_requests', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  leaveTypeId: integer('leave_type_id').notNull().references(() => leaveTypes.id, { onDelete: 'restrict' }),
  
  // Leave period
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  totalDays: decimal('total_days', { precision: 5, scale: 2 }).notNull(),
  isHalfDay: boolean('is_half_day').default(false),
  halfDayPeriod: varchar('half_day_period', { length: 10 }),
  
  // Request details
  reason: text('reason').notNull(),
  emergencyContact: text('emergency_contact'),
  workHandoverNotes: text('work_handover_notes'),
  attachmentUrl: text('attachment_url'),
  
  // Status and approval
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  appliedDate: timestamp('applied_date').notNull().defaultNow(),
  
  // First level approval (Direct Manager)
  managerId: integer('manager_id').references(() => users.id),
  managerApprovalStatus: varchar('manager_approval_status', { length: 20 }),
  managerApprovalDate: timestamp('manager_approval_date'),
  managerComments: text('manager_comments'),
  
  // Second level approval (HR)
  hrApprovalId: integer('hr_approval_id').references(() => users.id),
  hrApprovalStatus: varchar('hr_approval_status', { length: 20 }),
  hrApprovalDate: timestamp('hr_approval_date'),
  hrComments: text('hr_comments'),
  
  // Final status
  approvedBy: integer('approved_by').references(() => users.id),
  approvedDate: timestamp('approved_date'),
  rejectionReason: text('rejection_reason'),
  
  // Tracking
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const leaveApprovals = pgTable('leave_approvals', {
  id: serial('id').primaryKey(),
  leaveRequestId: integer('leave_request_id').notNull().references(() => leaveRequests.id, { onDelete: 'cascade' }),
  approverId: integer('approver_id').notNull().references(() => users.id),
  approvalLevel: integer('approval_level').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  comments: text('comments'),
  approvedDate: timestamp('approved_date'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const companyHolidays = pgTable('company_holidays', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  date: date('date').notNull(),
  isOptional: boolean('is_optional').default(false),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  createdBy: integer('created_by').references(() => users.id),
});

export const leavePolicies = pgTable('leave_policies', {
  id: serial('id').primaryKey(),
  policyName: varchar('policy_name', { length: 100 }).notNull().unique(),
  policyValue: text('policy_value').notNull(),
  dataType: varchar('data_type', { length: 20 }).notNull().default('string'),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  updatedBy: integer('updated_by').references(() => users.id),
});

// ============================================================================
// LEAVE MANAGEMENT CORRECTION PLAN — NEW TABLES (Baseline v1.0)
// ============================================================================

// Sandwich deduction records — one row per enclosed off-day per leave request
export const leaveDeductions = pgTable('leave_deductions', {
  id: serial('id').primaryKey(),
  leaveRequestId: integer('leave_request_id').notNull().references(() => leaveRequests.id, { onDelete: 'cascade' }),
  employeeId: integer('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  leaveTypeId: integer('leave_type_id').notNull().references(() => leaveTypes.id),
  deductionDate: date('deduction_date').notNull(),
  days: decimal('days', { precision: 4, scale: 2 }).notNull().default('1'),
  deductionType: varchar('deduction_type', { length: 30 }).notNull().default('sandwich'), // 'sandwich'
  reason: text('reason'),
  // Lifecycle: pending_approval → approved | voided | revoked
  status: varchar('status', { length: 20 }).notNull().default('approved'),
  voidedBy: integer('voided_by').references(() => users.id),
  voidedAt: timestamp('voided_at'),
  voidReason: text('void_reason'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Leave accrual log — one row per monthly accrual run per user
export const leaveAccrualLog = pgTable('leave_accrual_log', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  leaveTypeId: integer('leave_type_id').notNull().references(() => leaveTypes.id),
  accrualMonth: varchar('accrual_month', { length: 7 }).notNull(), // YYYY-MM
  daysAccrued: decimal('days_accrued', { precision: 5, scale: 2 }).notNull(),
  balanceAfter: decimal('balance_after', { precision: 5, scale: 2 }),
  runBy: integer('run_by').references(() => users.id), // null = system cron
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Manual leave balance adjustment ledger (audit trail for all direct balance corrections)
export const leaveBalanceAdjustments = pgTable('leave_balance_adjustments', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  leaveTypeId: integer('leave_type_id').notNull().references(() => leaveTypes.id, { onDelete: 'cascade' }),
  year: integer('year').notNull(),
  adjustmentDays: decimal('adjustment_days', { precision: 6, scale: 2 }).notNull(),
  reason: text('reason').notNull(),
  adjustedBy: integer('adjusted_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
export const insertLeaveBalanceAdjustmentSchema = createInsertSchema(leaveBalanceAdjustments).omit({ id: true, createdAt: true });
export type LeaveBalanceAdjustment = typeof leaveBalanceAdjustments.$inferSelect;

// LWP / LOP exemption audit log
export const lwpExemptionAuditLog = pgTable('lwp_exemption_audit_log', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  action: varchar('action', { length: 20 }).notNull(), // 'granted' | 'revoked' | 'auto_policy'
  grantedBy: integer('granted_by').references(() => users.id),
  reason: text('reason'),
  effectiveFrom: date('effective_from'),
  nextReview: date('next_review'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Year-end leave carryover idempotency log
// Mirrors leave_accrual_log but for the annual FY→FY carryover run.
// Unique on (from_year, to_year) — prevents double carryover for the same FY transition.
export const leaveCarryoverLog = pgTable('leave_carryover_log', {
  id: serial('id').primaryKey(),
  fromYear: integer('from_year').notNull(),          // FY closing calendar year (e.g. 2025 for FY 2025-26)
  toYear: integer('to_year').notNull(),              // FY opening calendar year (e.g. 2026 for FY 2026-27)
  runAt: timestamp('run_at').notNull().defaultNow(),
  runBy: integer('run_by').references(() => users.id), // null = system/payroll trigger
  processed: integer('processed').notNull().default(0),
  skipped: integer('skipped').notNull().default(0),
  errors: text('errors').array(),
  notes: text('notes'),
});

// ============================================================================
// LEAVE MANAGEMENT CORRECTION PLAN — INSERT SCHEMAS & TYPES
// ============================================================================

export const insertLeaveCarryoverLogSchema = createInsertSchema(leaveCarryoverLog)
  .omit({ id: true, runAt: true });
export type LeaveCarryoverLog = typeof leaveCarryoverLog.$inferSelect;

export const insertLeaveDeductionSchema = createInsertSchema(leaveDeductions)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type LeaveDeduction = typeof leaveDeductions.$inferSelect;
export type InsertLeaveDeduction = z.infer<typeof insertLeaveDeductionSchema>;

export const insertLeaveAccrualLogSchema = createInsertSchema(leaveAccrualLog)
  .omit({ id: true, createdAt: true });
export type LeaveAccrualLog = typeof leaveAccrualLog.$inferSelect;

export const insertLwpExemptionAuditLogSchema = createInsertSchema(lwpExemptionAuditLog)
  .omit({ id: true, createdAt: true });
export type LwpExemptionAuditLog = typeof lwpExemptionAuditLog.$inferSelect;

// Sales and Marketing tables
export const leadSourcesTable = pgTable('lead_sources', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const leadStatusesTable = pgTable('lead_statuses', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  displayOrder: integer('display_order').notNull(),
  color: text('color').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const leads = pgTable('leads', {
  id: serial('id').primaryKey(),
  companyName: text('company_name').notNull(),
  industry: text('industry'),
  website: text('website'),
  currency: text('currency'),
  expectedRevenue: decimal('expected_revenue', { precision: 15, scale: 2 }),
  
  // Main contact information
  contactName: text('contact_name').notNull(),
  contactTitle: text('contact_title'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  countryCode: text('country_code'),
  
  // Lead management fields
  sourceId: integer('source_id').references(() => leadSourcesTable.id),
  statusId: integer('status_id').references(() => leadStatusesTable.id),
  assignedTo: integer('assigned_to').references(() => users.id),
  
  // Location information
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city: text('city'),
  state: text('state'),
  postalCode: text('postal_code'),
  country: text('country'),
  
  // Lead details
  notes: text('notes'),
  requirements: text('requirements'),
  potentialValue: decimal('potential_value', { precision: 15, scale: 2 }),
  probability: integer('probability'),
  
  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  lastContactedAt: timestamp('last_contacted_at'),
  expectedCloseDate: date('expected_close_date'),
  
  // If converted to customer, link to customer record
  isConverted: boolean('is_converted').default(false),
  customerId: integer('customer_id').references(() => customers.id)
});

export const leadActivities = pgTable('lead_activities', {
  id: serial('id').primaryKey(),
  leadId: integer('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  activityType: text('activity_type').notNull(), // email, call, meeting, note
  title: text('title').notNull(),
  description: text('description'),
  activityDate: timestamp('activity_date').notNull().defaultNow(),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const marketingCampaigns = pgTable('marketing_campaigns', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  objective: text('objective'),
  channelId: integer('channel_id').references(() => campaignChannels.id),
  startDate: date('start_date'),
  endDate: date('end_date'),
  budget: decimal('budget', { precision: 15, scale: 2 }),
  actualCost: decimal('actual_cost', { precision: 15, scale: 2 }),
  status: text('status', { enum: campaignStatuses }).notNull(),
  goals: text('goals'),
  targetAudience: text('target_audience'),
  // Performance metrics
  ctr: decimal('ctr', { precision: 10, scale: 2 }),
  cpc: decimal('cpc', { precision: 10, scale: 2 }),
  conversions: integer('conversions'),
  conversionRate: decimal('conversion_rate', { precision: 10, scale: 2 }),
  cpa: decimal('cpa', { precision: 10, scale: 2 }),
  impressions: integer('impressions'),
  qualityScore: decimal('quality_score', { precision: 5, scale: 2 }),
  roas: decimal('roas', { precision: 10, scale: 2 }),
  impressionShare: decimal('impression_share', { precision: 10, scale: 2 }),
  bounceRate: decimal('bounce_rate', { precision: 10, scale: 2 }),
  expectedLeadCount: integer('expected_lead_count'),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const campaignChannels = pgTable('campaign_channels', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description')
});

export const campaignActivities = pgTable('campaign_activities', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').notNull().references(() => marketingCampaigns.id, { onDelete: 'cascade' }),
  channelId: integer('channel_id').notNull().references(() => campaignChannels.id),
  name: text('name').notNull(),
  description: text('description'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  status: text('status').notNull(), // planned, active, completed, cancelled
  budget: decimal('budget', { precision: 15, scale: 2 }),
  actualCost: decimal('actual_cost', { precision: 15, scale: 2 }),
  metrics: jsonb('metrics').default({}), // Store metrics like clicks, impressions, conversions
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const campaignLeads = pgTable('campaign_leads', {
  campaignId: integer('campaign_id').notNull().references(() => marketingCampaigns.id, { onDelete: 'cascade' }),
  leadId: integer('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.campaignId, t.leadId] })
}));

// Define relations
export const leadsRelations = relations(leads, ({ one, many }) => ({
  source: one(leadSourcesTable, {
    fields: [leads.sourceId],
    references: [leadSourcesTable.id]
  }),
  status: one(leadStatusesTable, {
    fields: [leads.statusId],
    references: [leadStatusesTable.id]
  }),
  assignedUser: one(users, {
    fields: [leads.assignedTo],
    references: [users.id]
  }),
  customer: one(customers, {
    fields: [leads.customerId],
    references: [customers.id]
  }),
  activities: many(leadActivities)
}));

export const leadActivitiesRelations = relations(leadActivities, ({ one }) => ({
  lead: one(leads, {
    fields: [leadActivities.leadId],
    references: [leads.id]
  }),
  createdByUser: one(users, {
    fields: [leadActivities.createdBy],
    references: [users.id]
  })
}));

export const marketingCampaignsRelations = relations(marketingCampaigns, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [marketingCampaigns.createdBy],
    references: [users.id]
  }),
  channel: one(campaignChannels, {
    fields: [marketingCampaigns.channelId],
    references: [campaignChannels.id]
  }),
  activities: many(campaignActivities),
  leads: many(campaignLeads)
}));

export const campaignActivitiesRelations = relations(campaignActivities, ({ one }) => ({
  campaign: one(marketingCampaigns, {
    fields: [campaignActivities.campaignId],
    references: [marketingCampaigns.id]
  }),
  channel: one(campaignChannels, {
    fields: [campaignActivities.channelId],
    references: [campaignChannels.id]
  })
}));

export const campaignLeadsRelations = relations(campaignLeads, ({ one }) => ({
  campaign: one(marketingCampaigns, {
    fields: [campaignLeads.campaignId],
    references: [marketingCampaigns.id]
  }),
  lead: one(leads, {
    fields: [campaignLeads.leadId],
    references: [leads.id]
  })
}));

// Create insert schemas
export const insertLeadSourceSchema = createInsertSchema(leadSourcesTable);
export const insertLeadStatusSchema = createInsertSchema(leadStatusesTable);
export const insertLeadSchema = createInsertSchema(leads, {
  probability: z.number().min(0).max(100).optional(),
  potentialValue: z.number().optional(),
  annualRevenue: z.number().optional()
}).omit({ createdAt: true, updatedAt: true });

export const insertLeadActivitySchema = createInsertSchema(leadActivities).omit({ createdAt: true, updatedAt: true });
export const insertMarketingCampaignSchema = createInsertSchema(marketingCampaigns).omit({ createdAt: true, updatedAt: true });
export const insertCampaignChannelSchema = createInsertSchema(campaignChannels);
export const insertCampaignActivitySchema = createInsertSchema(campaignActivities).omit({ createdAt: true, updatedAt: true });
export const insertCampaignLeadSchema = createInsertSchema(campaignLeads).omit({ createdAt: true });

// Create types
export type LeadSourceInsert = z.infer<typeof insertLeadSourceSchema>;
export type LeadStatusInsert = z.infer<typeof insertLeadStatusSchema>;
export type LeadInsert = z.infer<typeof insertLeadSchema>;
export type LeadActivityInsert = z.infer<typeof insertLeadActivitySchema>;
export type MarketingCampaignInsert = z.infer<typeof insertMarketingCampaignSchema>;
export type CampaignChannelInsert = z.infer<typeof insertCampaignChannelSchema>;
export type CampaignActivityInsert = z.infer<typeof insertCampaignActivitySchema>;
export type CampaignLeadInsert = z.infer<typeof insertCampaignLeadSchema>;

export type LeadSourceSelect = typeof leadSourcesTable.$inferSelect;
export type LeadStatusSelect = typeof leadStatusesTable.$inferSelect;
export type LeadSelect = typeof leads.$inferSelect;
export type LeadActivitySelect = typeof leadActivities.$inferSelect;
export type MarketingCampaignSelect = typeof marketingCampaigns.$inferSelect;
export type CampaignChannelSelect = typeof campaignChannels.$inferSelect;
export type CampaignActivitySelect = typeof campaignActivities.$inferSelect;
export type CampaignLeadSelect = typeof campaignLeads.$inferSelect;

export type Module = typeof modules[number];

export const departments = [
  "Accounts",
  "Administration",
  "After Sales",
  "Design",
  "Marketing",
  "Production",
  "Projects",
  "Purchase",
  "Quality Control",
  "Stores",
] as const;

export type Department = (typeof departments)[number];

export const epcPageKeys = [
  "project-dashboard",
  "projects",
  "item-master",
  "execution-control",
  "drawing-controls",
  "buy-packages",
  "buy-list-control",
  "bom-controls",
  "purchase-orders",
  "work-orders",
  "planning-control",
  "procurement-production",
  "procurement-list-control",
  "quality-inspection",
  "dispatch-logistics",
  "commissioning-handover",
  "invoices",
  "epc-risks",
  "permission-control",
] as const;

export type EpcPageKey = (typeof epcPageKeys)[number];

export const employeeTypes = [
  'PERMANENT',
  'TEMPORARY',
  'CONTRACT',
  'PROBATION',
  'INTERN',
  'PART_TIME',
  'DAILY_WAGE',
  'CONSULTANT',
  'APPRENTICE',
] as const;

export type EmployeeType = typeof employeeTypes[number];

export const employeeTypeLabels: Record<EmployeeType, string> = {
  PERMANENT: 'Permanent (Full-Time)',
  TEMPORARY: 'Temporary',
  CONTRACT: 'Contract',
  PROBATION: 'Probation',
  INTERN: 'Intern / Trainee',
  PART_TIME: 'Part-Time',
  DAILY_WAGE: 'Daily Wage',
  CONSULTANT: 'Consultant / Freelancer',
  APPRENTICE: 'Apprentice',
};

// Helper function to convert string dates to Date objects
const dateStringToDate = (dateStr: string | undefined | null) => {
  if (!dateStr) return undefined;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? undefined : date;
};

// Define the base user schema structure first
const userSchema = {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  email: text('email').notNull().unique(),
  mobileNumber: text('mobile_number').notNull(),
  countryCode: text('country_code').notNull(),
  role: text('role', { enum: roles }).notNull(),
  employeeType: text('employee_type', { enum: employeeTypes }).default('PERMANENT'),
  
  // Extended fields for Administration Module
  firstName: text('first_name'),
  middleName: text('middle_name'),
  lastName: text('last_name'),
  jobTitle: text('job_title'),
  department: text('department'),
  branch: text('branch'),
  employeeCode: text('employee_code').unique(),
  phone: text('phone'),
  fax: text('fax'),
  linkedVendor: text('linked_vendor'),
  epfNo: text('epf_no'),
  dateOfBirth: date('date_of_birth'),
  esicNo: text('esic_no'),
  stdCode: text('std_code'),
  panNumber: text('pan_number'),
  cardCode: text('card_code'),
  cardName: text('card_name'),
  loanCardCode: text('loan_card_code'),
  loanCardName: text('loan_card_name'),
  dateOfJoining: text('date_of_joining'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  
  // Google Calendar Integration
  googleCalendarConnected: boolean('google_calendar_connected').default(false),
  googleAccessToken: text('google_access_token'),
  googleRefreshToken: text('google_refresh_token'),
  googleTokenExpiresAt: timestamp('google_token_expires_at'),
  googleEmail: text('google_email'),
  googleCalendarSyncEnabled: boolean('google_calendar_sync_enabled').default(true),
  
  // Password Security Enhancement
  passwordNeedsUpdate: boolean('password_needs_update').default(false),
  passwordHistory: jsonb('password_history').default([]),
  lastPasswordChange: timestamp('last_password_change'),
  
  // Password Reset Functionality
  resetToken: varchar('reset_token', { length: 255 }),
  resetTokenExpiresAt: timestamp('reset_token_expires_at'),

  // Two-Factor Authentication
  twoFactorEnabled: boolean('two_factor_enabled').default(false),
  twoFactorSecret: text('two_factor_secret'),
  twoFactorBackupCodes: jsonb('two_factor_backup_codes').default('[]'),
  twoFactorFailedAttempts: integer('two_factor_failed_attempts').default(0),
  twoFactorLockedUntil: timestamp('two_factor_locked_until'),
  twoFactorChallengeNonce: text('two_factor_challenge_nonce'),
  
  // Weekly Off Days for Payroll (JSON array of day numbers: 0=Sunday, 1=Monday, etc.)
  // Default is Saturday(6) and Sunday(0) off
  userType: text('user_type').default('system_user'),
  salaryType: varchar('salary_type', { length: 20 }).default('monthly'),
  otApplicable: varchar('ot_applicable', { length: 10 }).default('no'),
  weeklyOffDays: jsonb('weekly_off_days').default('[0,6]'),
  
  // Duty Schedule fields for attendance status calculation
  dutyTimeIn: text('duty_time_in').default('09:00'), // HH:mm format
  dutyTimeOut: text('duty_time_out').default('18:00'), // HH:mm format
  allowedLateMinutes: integer('allowed_late_minutes').default(15), // Minutes allowed after duty time in
  earlyExitMinutes: integer('early_exit_minutes').default(15), // Minutes allowed before duty time out
  
  // Work Time Policy: Fixed or Flexible
  // Fixed: Uses duty time in/out with late/early rules
  // Flexible: Uses minimum daily work hours only (no late/early rules)
  workTimePolicy: text('work_time_policy').default('Fixed'), // 'Fixed' or 'Flexible'
  minimumDailyHours: doublePrecision('minimum_daily_hours').default(8), // Minimum hours for Present status (Flexible policy)
  halfDayMinimumHours: doublePrecision('half_day_minimum_hours').default(4), // Minimum hours for Half Day status (Flexible policy)

  // LWP / LOP Exemption — Superuser, GM, SM are exempt by policy; others by grant
  lwpExempt: boolean('lwp_exempt').default(false),
  lwpExemptReason: text('lwp_exempt_reason'),
  lwpExemptGrantedBy: integer('lwp_exempt_granted_by'),
  lwpExemptGrantedAt: timestamp('lwp_exempt_granted_at'),
  lwpExemptNextReview: date('lwp_exempt_next_review'),

  // Login Security — Phase 1 (all nullable; no enforcement until Phase 2)
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until'),
  lastLoginAt: timestamp('last_login_at'),
  lastLoginIp: varchar('last_login_ip', { length: 45 }),
  lastLoginDevice: text('last_login_device'),
};

// Create the users table with self-reference after definition
export const users = pgTable('users', {
  ...userSchema,
  reportingManagerId: integer('reporting_manager_id'),
  workLocationId: integer('work_location_id').references(() => workLocations.id),
});

// Google Calendar Sync Log table
export const googleCalendarSyncLog = pgTable('google_calendar_sync_log', {
  id: serial('id').primaryKey(),
  meetingId: integer('meeting_id').references(() => businessMeetings.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  action: varchar('action', { length: 50 }).notNull(), // 'create', 'update', 'delete', 'sync_error'
  googleEventId: text('google_event_id'),
  status: varchar('status', { length: 20 }).notNull(), // 'success', 'error', 'pending'
  errorMessage: text('error_message'),
  syncDetails: jsonb('sync_details'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Recurring patterns table for task templates
export const recurringPatterns = pgTable('recurring_patterns', {
  id: serial('id').primaryKey(),
  
  // Who created this recurring pattern
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  
  // User who owns this recurring pattern (for queries)
  userId: integer('user_id').notNull().references(() => users.id),
  
  // Recurrence fields
  pattern: text('pattern').notNull(), // 'daily', 'weekly', 'monthly', 'yearly'
  interval: integer('interval').default(1).notNull(), // Every X days/weeks/months/years
  daysOfWeek: text('days_of_week'), // JSON string array for weekly pattern: ["MON","WED","FRI"]
  dayOfMonth: integer('day_of_month'), // For monthly pattern
  monthOfYear: integer('month_of_year'), // For yearly pattern
  
  // Controls
  startDate: text('start_date').notNull(),
  endDate: text('end_date'), // Optional end date
  maxOccurrences: integer('max_occurrences'), // Optional limit
  
  // Template fields for new tasks
  templateTitle: text('template_title').notNull(),
  templateDescription: text('template_description').notNull(),
  templatePriority: text('template_priority').notNull(),
  templateAssignedTo: integer('template_assigned_to').references(() => users.id),
  templateCategory: text('template_category'),
  
  // Duration in days (used to calculate finishDate when generating new tasks)
  templateDurationDays: integer('template_duration_days').default(1).notNull(),
  
  // Planned hours for each task occurrence
  templatePlannedHours: real('template_planned_hours').default(0),
  
  // When was the last instance generated
  lastGeneratedDate: text('last_generated_date'),
  nextGenerationDate: text('next_generation_date'),
  
  // Counter for generated instances
  generatedCount: integer('generated_count').default(0).notNull(),
  
  // Status of the recurring pattern
  isActive: boolean('is_active').default(true).notNull(),
});

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  status: text('status').notNull().default('pending'),
  priority: text('priority').notNull().default('Medium'),
  startDate: text('start_date').notNull(),
  finishDate: text('finish_date').notNull(),
  dueDate: text('due_date'), // Due date for the task (optional to avoid data loss with existing records)
  assignedTo: integer('assigned_to').references(() => users.id),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: text('created_at').notNull(),
  completedAt: text('completed_at'),
  category: text('category'), // Optional category for task classification
  
  // Meeting integration fields
  sourceType: text('source_type'), // 'manual', 'meeting_commitment', 'recurring'
  sourceId: integer('source_id'), // ID of the source record (meeting commitment ID if sourceType is 'meeting_commitment')
  sourceAgent: text('source_agent'), // Which agent created this task (e.g. 'communicator', 'finance_control')
  completionRejectionReason: text('completion_rejection_reason'),
  isArchived: boolean('is_archived').notNull().default(false),
  archivedAt: timestamp('archived_at'),
});

// Separate table for instances of recurring tasks
export const recurringTasks = pgTable('recurring_tasks', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  status: text('status').notNull().default('pending'),
  priority: text('priority').notNull().default('Medium'),
  startDate: text('start_date').notNull(),
  finishDate: text('finish_date').notNull(),
  assignedTo: integer('assigned_to').references(() => users.id),
  completedAt: text('completed_at'),
  category: text('category'),
  
  // References
  recurringPatternId: integer('recurring_pattern_id').notNull().references(() => recurringPatterns.id),
  createdAt: text('created_at').notNull(),
  
  // Occurrence number for this instance
  occurrenceNumber: integer('occurrence_number').notNull(),
  
  // Due date - when this task must be completed
  dueDate: text('due_date').notNull(),
  
  // Planned hours for this task occurrence
  plannedHours: real('planned_hours').default(0),
});

// Track task history for workflow analysis
export const taskHistory = pgTable('task_history', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').notNull().references(() => tasks.id),
  userId: integer('user_id').notNull().references(() => users.id),
  action: text('action').notNull(), // e.g., 'created', 'updated', 'completed', 'forwarded'
  timestamp: text('timestamp').notNull(),
  oldValue: jsonb('old_value'), // For tracking changes
  newValue: jsonb('new_value'), // For tracking changes
});

// Store workflow recommendations
export const workflowRecommendations = pgTable('workflow_recommendations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  description: text('description').notNull(),
  category: text('category'),
  recommendationType: text('recommendation_type').notNull(), // e.g., 'task_assignment', 'priority_adjustment', 'follow_up'
  recommendationData: jsonb('recommendation_data'), // Additional recommendation details
  status: text('status').notNull().default('pending'), // 'pending', 'accepted', 'rejected'
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at'),
  isRead: boolean('is_read').notNull().default(false),
});

// Define achievement types
export const achievements = pgTable('achievements', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description').notNull(),
  category: text('category').notNull(), // 'task', 'productivity', 'collaboration', 'leadership'
  icon: text('icon').notNull(), // Icon identifier for frontend display
  threshold: integer('threshold').notNull(), // Value needed to earn this achievement
  points: integer('points').notNull(), // Points awarded for earning this achievement
  createdAt: text('created_at').notNull(),
});

// Track user earned achievements
export const userAchievements = pgTable('user_achievements', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  achievementId: integer('achievement_id').notNull().references(() => achievements.id),
  earnedAt: text('earned_at').notNull(),
  level: integer('level').notNull().default(1), // For leveled achievements
});

// Store productivity metrics
export const productivityMetrics = pgTable('productivity_metrics', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  tasksCompleted: integer('tasks_completed').notNull().default(0),
  tasksCreated: integer('tasks_created').notNull().default(0),
  recommendationsAccepted: integer('recommendations_accepted').notNull().default(0),
  averageCompletionTime: integer('average_completion_time').notNull().default(0), // in hours
  onTimeCompletion: integer('on_time_completion').notNull().default(0), // number of tasks completed on time
  lastUpdated: text('last_updated').notNull(),
  weeklyScore: integer('weekly_score').notNull().default(0),
  monthlyScore: integer('monthly_score').notNull().default(0),
  totalPoints: integer('total_points').notNull().default(0),
});

// Plant Costs Configuration
export const plantCosts = pgTable('plant_costs', {
  id: serial('id').primaryKey(),
  capacity: integer('capacity').notNull().unique(), // LPH capacity
  priceUSD: decimal('price_usd', { precision: 12, scale: 2 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdBy: integer('created_by').notNull().references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
});

// Tank Prices Configuration for ROI Calculator
export const tankPrices = pgTable('tank_prices', {
  id: serial('id').primaryKey(),
  capacity: integer('capacity').notNull().unique(), // Tank capacity in KL
  priceUSD: decimal('price_usd', { precision: 10, scale: 2 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdBy: integer('created_by').notNull().references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
});

// Password validation schema with enhanced security rules
export const passwordValidationSchema = z.string()
  .min(12, "Password must be at least 12 characters long")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/\d/, "Password must contain at least one number")
  .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, "Password must contain at least one special character");

export const insertUserSchema = createInsertSchema(users).extend({
  role: z.enum(roles),
  reportingManagerId: z.number({ required_error: "Reporting Manager is required" }),
  password: passwordValidationSchema,
  email: z.string().email(),
  mobileNumber: z.string().min(10),
  countryCode: z.string(),
});

// Schema for password change
export const passwordChangeSchema = z.object({
  currentPassword: z.string().optional(), // Optional for forced password resets
  newPassword: passwordValidationSchema,
  confirmPassword: z.string()
}).refine(
  (data) => data.newPassword === data.confirmPassword,
  {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  }
);

// Plant Costs Schema
export const insertPlantCostSchema = createInsertSchema(plantCosts).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertPlantCost = z.infer<typeof insertPlantCostSchema>;
export type PlantCost = typeof plantCosts.$inferSelect;

export const insertTaskSchema = createInsertSchema(tasks).extend({
  priority: z.enum(['Low', 'Medium', 'High']),
  startDate: z.string(),
  finishDate: z.string().min(1, "Due date is required"),
  dueDate: z.string().min(1, "Due date is required"),
  sourceType: z.enum(['manual', 'meeting_commitment', 'recurring', 'llm_insight']).optional(),
  sourceId: z.number().optional()
});

// Create insert schemas for new tables
export const insertTaskHistorySchema = createInsertSchema(taskHistory);
export const insertWorkflowRecommendationSchema = createInsertSchema(workflowRecommendations).extend({
  recommendationType: z.enum(['task_assignment', 'priority_adjustment', 'follow_up', 'team_collaboration', 'deadline_reminder']),
  status: z.enum(['pending', 'accepted', 'rejected']).default('pending'),
});

// Define insert schemas for new achievement-related tables
export const insertAchievementSchema = createInsertSchema(achievements).extend({
  category: z.enum(['task', 'productivity', 'collaboration', 'leadership']),
});

export const insertUserAchievementSchema = createInsertSchema(userAchievements);

export const insertProductivityMetricSchema = createInsertSchema(productivityMetrics);

// Dispatch & Shipping tables
export const dispatchRecords = pgTable('dispatch_records', {
  id: serial('id').primaryKey(),
  project_id: integer('project_id').references(() => projects.id).notNull(),
  dispatch_number: text('dispatch_number').notNull(),
  dispatch_date: timestamp('dispatch_date').notNull(),
  transporter_name: text('transporter_name'),
  transporter_contact: text('transporter_contact'),
  vehicle_number: text('vehicle_number'),
  gate_pass_number: text('gate_pass_number'),
  delivery_status: text('delivery_status').notNull().default('Pending'),
  estimated_delivery_date: timestamp('estimated_delivery_date'),
  actual_delivery_date: timestamp('actual_delivery_date'),
  notes: text('notes'),
  created_by: integer('created_by').references(() => users.id).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export const dispatchItems = pgTable('dispatch_items', {
  id: serial('id').primaryKey(),
  dispatch_id: integer('dispatch_id').references(() => dispatchRecords.id).notNull(),
  item_id: integer('item_id').references(() => masterItems.id).notNull(),
  quantity: text('quantity').notNull(),
  unit: text('unit').notNull(),
  quality_approved: boolean('quality_approved').notNull().default(false),
  quality_approval_date: timestamp('quality_approval_date'),
  quality_approved_by: integer('quality_approved_by').references(() => users.id),
  notes: text('notes'),
});

// Project Key Stage Completion
export const projectKeyStages = pgTable('project_key_stages', {
  id: serial('id').primaryKey(),
  project_id: integer('project_id').references(() => projects.id).notNull(),
  stage_number: integer('stage_number').notNull(),
  stage_name: text('stage_name').notNull(),
  phase: text('phase').notNull(),
  description: text('description'),
  is_completed: boolean('is_completed').notNull().default(false),
  completed_date: timestamp('completed_date'),
  completed_by: integer('completed_by').references(() => users.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export const dispatchDocuments = pgTable('dispatch_documents', {
  id: serial('id').primaryKey(),
  dispatch_id: integer('dispatch_id').references(() => dispatchRecords.id).notNull(),
  document_type: text('document_type').notNull(),
  document_name: text('document_name').notNull(),
  document_path: text('document_path').notNull(),
  uploaded_by: integer('uploaded_by').references(() => users.id).notNull(),
  uploaded_at: timestamp('uploaded_at').defaultNow().notNull(),
  storage_path: text('storage_path'),
  storage_url: text('storage_url'),
  storage_url_expiry: timestamp('storage_url_expiry'),
});

export const transporters = pgTable('transporters', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  contact_person: text('contact_person'),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  gst_number: text('gst_number'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Engineering Change Request and Engineering Change Notice tables
export const engineeringChangeRequests = pgTable('engineering_change_requests', {
  id: serial('id').primaryKey(),
  document_number: text('document_number').notNull(),
  item_id: integer('item_id').references(() => masterItems.id).notNull(),
  description: text('description').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('Draft'),
  requested_by: integer('requested_by').references(() => users.id).notNull(),
  requested_date: timestamp('requested_date').defaultNow().notNull(),
  approved_by: integer('approved_by').references(() => users.id),
  approved_date: timestamp('approved_date'),
  notes: text('notes'),
  project_id: integer('project_id').references(() => projects.id),
  project_item_id: integer('project_item_id').references(() => projectItems.id),
  drawing_control_id: integer('drawing_control_id').references(() => epcDrawingControls.id, { onDelete: 'set null' }),
  item_code: text('item_code'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export const engineeringChangeNotices = pgTable('engineering_change_notices', {
  id: serial('id').primaryKey(),
  document_number: text('document_number').notNull(),
  ecr_id: integer('ecr_id').references(() => engineeringChangeRequests.id),
  item_id: integer('item_id').references(() => masterItems.id).notNull(),
  description: text('description').notNull(),
  implementation_details: text('implementation_details').notNull(),
  status: text('status').notNull().default('Draft'),
  issued_by: integer('issued_by').references(() => users.id).notNull(),
  issued_date: timestamp('issued_date').defaultNow().notNull(),
  implementation_date: timestamp('implementation_date'),
  implemented_by: integer('implemented_by').references(() => users.id),
  notes: text('notes'),
  project_id: integer('project_id').references(() => projects.id),
  project_item_id: integer('project_item_id').references(() => projectItems.id),
  drawing_control_id: integer('drawing_control_id').references(() => epcDrawingControls.id, { onDelete: 'set null' }),
  resulting_revision: text('resulting_revision'),
  item_code: text('item_code'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export const changeDocuments = pgTable('change_documents', {
  id: serial('id').primaryKey(),
  ecr_id: integer('ecr_id').references(() => engineeringChangeRequests.id),
  ecn_id: integer('ecn_id').references(() => engineeringChangeNotices.id),
  document_type: text('document_type').notNull(),
  document_name: text('document_name').notNull(),
  document_path: text('document_path').notNull(),
  uploaded_by: integer('uploaded_by').references(() => users.id).notNull(),
  uploaded_at: timestamp('uploaded_at').defaultNow().notNull(),
  storage_path: text('storage_path'),
  storage_url: text('storage_url'),
  storage_url_expiry: timestamp('storage_url_expiry'),
  gcs_object_path: text('gcs_object_path'),
  checksum_sha256: text('checksum_sha256'),
  file_size: integer('file_size'),
});

// Insert schemas for Dispatch & Shipping
export const insertDispatchRecordSchema = createInsertSchema(dispatchRecords);
export const insertDispatchItemSchema = createInsertSchema(dispatchItems);
export const insertDispatchDocumentSchema = createInsertSchema(dispatchDocuments);
export const insertTransporterSchema = createInsertSchema(transporters);
export const insertProjectKeyStageSchema = createInsertSchema(projectKeyStages, {
  stage_name: z.string(),
  phase: z.enum(["Design", "Procurement", "Manufacturing", "Shipping & Commissioning"])
}).extend({
  // Add any other field validations or transformations here
  completedDate: z.date().optional(),
  description: z.string().optional(),
});

// Insert schemas for Engineering Change documents
export const insertEcrSchema = createInsertSchema(engineeringChangeRequests).extend({
  status: z.enum(['Draft', 'Submitted', 'Approved', 'Rejected']).default('Draft'),
});
export const insertEcnSchema = createInsertSchema(engineeringChangeNotices).extend({
  status: z.enum(['Draft', 'Issued', 'Implemented', 'Closed']).default('Draft'),
});
export const insertChangeDocumentSchema = createInsertSchema(changeDocuments);

// Insert schema for recurring tasks
export const insertRecurringTaskSchema = createInsertSchema(recurringTasks).extend({
  priority: z.enum(['Low', 'Medium', 'High']),
  startDate: z.string(),
  finishDate: z.string(),
  dueDate: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'canceled']).default('pending'),
});

// Recurring pattern insert schema
export const insertRecurringPatternSchema = createInsertSchema(recurringPatterns, {
  pattern: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'half_yearly', 'yearly']),
  interval: z.number().min(1),
  daysOfWeek: z.string().optional(),
  dayOfMonth: z.number().optional(),
  monthOfYear: z.number().optional(),
  startDate: z.string(),
  endDate: z.string().nullable().optional(),
  templateTitle: z.string().min(3, { message: "Title must be at least 3 characters" }),
  templateDescription: z.string().min(5, { message: "Description must be at least 5 characters" }),
  templatePriority: z.enum(['Low', 'Medium', 'High']),
  templateCategory: z.string().optional(),
  templateAssignedTo: z.number().optional(),
  templateDurationDays: z.number().min(1),
  templatePlannedHours: z.number().min(0).optional().default(0),
  userId: z.number(),
  isActive: z.boolean().optional().default(true),
  maxOccurrences: z.number().nullable().optional(),
}).omit({ id: true });

// Module permissions tables
export const modulePermissions = pgTable('module_permissions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  moduleName: text('module_name', { enum: modules }).notNull(),
  canView: boolean('can_view').default(false).notNull(),
  canCreate: boolean('can_create').default(false).notNull(),
  canEdit: boolean('can_edit').default(false).notNull(),
  canDelete: boolean('can_delete').default(false).notNull(),
  canUpload: boolean('can_upload').default(false).notNull(),
  canDownload: boolean('can_download').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Role-based default module permissions
export const roleModulePermissions = pgTable('role_module_permissions', {
  id: serial('id').primaryKey(),
  role: text('role', { enum: roles }).notNull(),
  moduleName: text('module_name', { enum: modules }).notNull(),
  canView: boolean('can_view').default(false).notNull(),
  canCreate: boolean('can_create').default(false).notNull(),
  canEdit: boolean('can_edit').default(false).notNull(),
  canDelete: boolean('can_delete').default(false).notNull(),
  canUpload: boolean('can_upload').default(false).notNull(),
  canDownload: boolean('can_download').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Create insert schemas for the new tables
export const insertModulePermissionSchema = createInsertSchema(modulePermissions, {
  moduleName: z.enum(modules),
});

export const insertRoleModulePermissionSchema = createInsertSchema(roleModulePermissions, {
  role: z.enum(roles),
  moduleName: z.enum(modules),
});

export const departmentPagePermissions = pgTable('department_page_permissions', {
  id: serial('id').primaryKey(),
  department: text('department').notNull(),
  pageKey: text('page_key').notNull(),
  moduleName: text('module_name').notNull(),
  canView: boolean('can_view').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const pagePermissions = pgTable('page_permissions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  pageKey: text('page_key').notNull(),
  moduleName: text('module_name').notNull(),
  canView: boolean('can_view').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertDepartmentPagePermissionSchema = createInsertSchema(departmentPagePermissions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPagePermissionSchema = createInsertSchema(pagePermissions).omit({ id: true, createdAt: true, updatedAt: true });

export type DepartmentPagePermission = typeof departmentPagePermissions.$inferSelect;
export type InsertDepartmentPagePermission = z.infer<typeof insertDepartmentPagePermissionSchema>;
export type PagePermission = typeof pagePermissions.$inferSelect;
export type InsertPagePermission = z.infer<typeof insertPagePermissionSchema>;

export const permissionChangeRequests = pgTable('permission_change_requests', {
  id: serial('id').primaryKey(),
  batchId: text('batch_id'),
  requestType: text('request_type').notNull(),
  targetEntity: text('target_entity').notNull(),
  targetId: text('target_id').notNull(),
  pageKey: text('page_key'),
  actionId: text('action_id'),
  currentValue: jsonb('current_value'),
  requestedValue: jsonb('requested_value'),
  requestedBy: integer('requested_by').notNull(),
  requestedAt: timestamp('requested_at').defaultNow().notNull(),
  status: text('status').notNull().default('pending'),
  approvedBy: integer('approved_by'),
  approvedAt: timestamp('approved_at'),
  rejectionReason: text('rejection_reason'),
  appliedAt: timestamp('applied_at'),
  emergencyOverride: boolean('emergency_override').default(false),
  emergencyReason: text('emergency_reason'),
});

export const permissionSnapshots = pgTable('permission_snapshots', {
  id: serial('id').primaryKey(),
  snapshotType: text('snapshot_type').notNull(),
  snapshotData: jsonb('snapshot_data').notNull(),
  createdBy: integer('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  description: text('description'),
});

export const permissionAuditLog = pgTable('permission_audit_log', {
  id: serial('id').primaryKey(),
  action: text('action').notNull(),
  changeRequestId: integer('change_request_id'),
  snapshotId: integer('snapshot_id'),
  batchId: text('batch_id'),
  userId: integer('user_id').notNull(),
  username: text('username').notNull(),
  role: text('role').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  details: jsonb('details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const insertPermissionChangeRequestSchema = createInsertSchema(permissionChangeRequests).omit({ id: true, requestedAt: true, approvedAt: true, appliedAt: true });
export const insertPermissionSnapshotSchema = createInsertSchema(permissionSnapshots).omit({ id: true, createdAt: true });
export const insertPermissionAuditLogSchema = createInsertSchema(permissionAuditLog).omit({ id: true, createdAt: true });

export type PermissionChangeRequest = typeof permissionChangeRequests.$inferSelect;
export type InsertPermissionChangeRequest = z.infer<typeof insertPermissionChangeRequestSchema>;
export type PermissionSnapshot = typeof permissionSnapshots.$inferSelect;
export type InsertPermissionSnapshot = z.infer<typeof insertPermissionSnapshotSchema>;
export type PermissionAuditLogEntry = typeof permissionAuditLog.$inferSelect;
export type InsertPermissionAuditLogEntry = z.infer<typeof insertPermissionAuditLogSchema>;

// Define types for all tables
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type ModulePermission = typeof modulePermissions.$inferSelect;
export type InsertModulePermission = z.infer<typeof insertModulePermissionSchema>;
export type RoleModulePermission = typeof roleModulePermissions.$inferSelect;
export type InsertRoleModulePermission = z.infer<typeof insertRoleModulePermissionSchema>;
export type TaskHistory = typeof taskHistory.$inferSelect;
export type InsertTaskHistory = z.infer<typeof insertTaskHistorySchema>;
export type WorkflowRecommendation = typeof workflowRecommendations.$inferSelect;
export type InsertWorkflowRecommendation = z.infer<typeof insertWorkflowRecommendationSchema>;
export type Achievement = typeof achievements.$inferSelect;
export type InsertAchievement = z.infer<typeof insertAchievementSchema>;
export type UserAchievement = typeof userAchievements.$inferSelect;
export type InsertUserAchievement = z.infer<typeof insertUserAchievementSchema>;
export type ProductivityMetric = typeof productivityMetrics.$inferSelect;
export type InsertProductivityMetric = z.infer<typeof insertProductivityMetricSchema>;
export type RecurringPattern = typeof recurringPatterns.$inferSelect;
export type InsertRecurringPattern = z.infer<typeof insertRecurringPatternSchema>;
export type RecurringTask = typeof recurringTasks.$inferSelect;
export type InsertRecurringTask = z.infer<typeof insertRecurringTaskSchema>;

// Gmail integration tables
export const gmailTokens = pgTable('gmail_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  tokenExpiry: timestamp('token_expiry'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const gmailMessages = pgTable('gmail_messages', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  messageId: text('message_id').notNull(),
  threadId: text('thread_id'),
  from: text('from_address').notNull(),
  to: text('to_address').notNull(),
  subject: text('subject'),
  snippet: text('snippet'),
  body: text('body'),
  receivedAt: timestamp('received_at'),
  isRead: boolean('is_read').default(false),
  isImportant: boolean('is_important').default(false),
  labels: text('labels').array(),
  priority: varchar('priority', { length: 10 }),
  priorityScore: integer('priority_score'),
  classificationReason: text('classification_reason'),
  classificationSignals: jsonb('classification_signals').$type<{
    hardRules?: string[];
    aiScore?: number;
    confidence?: number;
    factors?: string[];
  }>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const gmailSettings = pgTable('gmail_settings', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  autoSyncEnabled: boolean('auto_sync_enabled').default(true),
  syncFrequencyMinutes: integer('sync_frequency_minutes').default(30),
  autoForwardRules: jsonb('auto_forward_rules').$type<{
    senderPattern?: string;
    subjectPattern?: string;
    bodyPattern?: string;
    forwardToUserId: number;
  }[]>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Gmail schema types & insert schemas
export const insertGmailTokenSchema = createInsertSchema(gmailTokens, {
  refreshToken: z.string().optional()
});

export const insertGmailMessageSchema = createInsertSchema(gmailMessages, {
  threadId: z.string().optional(),
  subject: z.string().optional(),
  snippet: z.string().optional(),
  body: z.string().optional(),
  receivedAt: z.date().optional(),
  labels: z.array(z.string()).optional(),
  priority: z.string().optional(),
  priorityScore: z.number().optional(),
  classificationReason: z.string().optional(),
  classificationSignals: z.any().optional()
});

export const insertGmailSettingsSchema = createInsertSchema(gmailSettings);

// Email AI Analysis results table
export const emailAnalysis = pgTable('email_analysis', {
  id: serial('id').primaryKey(),
  messageId: integer('message_id').notNull().references(() => gmailMessages.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),
  keyPoints: jsonb('key_points').notNull(),
  urgency: text('urgency').notNull(),
  category: text('category').notNull(),
  actionItems: jsonb('action_items').notNull(),
  sentiment: text('sentiment').notNull(),
  analyzedAt: timestamp('analyzed_at').defaultNow().notNull(),
});

// Email AI Generated Replies table
export const emailReplies = pgTable('email_replies', {
  id: serial('id').primaryKey(),
  messageId: integer('message_id').notNull().references(() => gmailMessages.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  professionalReply: text('professional_reply').notNull(),
  briefReply: text('brief_reply').notNull(),
  detailedReply: text('detailed_reply').notNull(),
  context: text('context'),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
});

// Email Analysis schema types & insert schemas
export const insertEmailAnalysisSchema = createInsertSchema(emailAnalysis);
export const insertEmailRepliesSchema = createInsertSchema(emailReplies, {
  context: z.string().optional()
});

export type GmailToken = typeof gmailTokens.$inferSelect;
export type InsertGmailToken = z.infer<typeof insertGmailTokenSchema>;
export type GmailMessage = typeof gmailMessages.$inferSelect;
export type InsertGmailMessage = z.infer<typeof insertGmailMessageSchema>;
export type GmailSettings = typeof gmailSettings.$inferSelect;
export type InsertGmailSettings = z.infer<typeof insertGmailSettingsSchema>;
export type EmailAnalysis = typeof emailAnalysis.$inferSelect;
export type InsertEmailAnalysis = z.infer<typeof insertEmailAnalysisSchema>;
export type EmailReplies = typeof emailReplies.$inferSelect;
export type InsertEmailReplies = z.infer<typeof insertEmailRepliesSchema>;

// Internal messages table for in-system communication
export const internalMessages = pgTable('internal_messages', {
  id: serial('id').primaryKey(),
  senderId: integer('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  senderName: text('sender_name').notNull(),
  recipientId: integer('recipient_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  recipientName: text('recipient_name').notNull(),
  subject: text('subject').notNull(),
  content: text('content').notNull(),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Internal messages schema & types
export const insertInternalMessageSchema = createInsertSchema(internalMessages, {
  senderName: z.string().optional(),
  recipientName: z.string().optional(),
  isRead: z.boolean().optional()
});

export type InternalMessage = typeof internalMessages.$inferSelect;
export type InsertInternalMessage = z.infer<typeof insertInternalMessageSchema>;

// ==================== PROJECT MANAGEMENT MODULE ====================

// Customers table
export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  bpCode: text('bp_code').notNull().unique(),
  bpName: text('bp_name').notNull(),
  contactPerson: text('contact_person'),
  contactPosition: text('contact_position'),
  email: text('email'),
  phone1: text('phone1'),
  contact2Name: text('contact2_name'),
  contact2Position: text('contact2_position'),
  contact2Email: text('contact2_email'),
  contact2Phone: text('contact2_phone'),
  contact3Name: text('contact3_name'),
  contact3Position: text('contact3_position'),
  contact3Email: text('contact3_email'),
  contact3Phone: text('contact3_phone'),
  cardType: text('card_type').default('C'),
  glblLocNum: text('glbl_loc_num').default('NA'),
  uStateSupply: text('u_state_supply').default('MH'),
  uBpGstType: text('u_bp_gst_type').default('G'),
  billToAddress: text('bill_to_address'),
  shipToAddress: text('ship_to_address'),
  billAddrLine1: text('bill_addr_line1'),
  billAddrLine2: text('bill_addr_line2'),
  billAddrBlock: text('bill_addr_block'),
  billAddrBuilding: text('bill_addr_building'),
  billAddrCity: text('bill_addr_city'),
  shipAddrLine1: text('ship_addr_line1'),
  shipAddrLine2: text('ship_addr_line2'),
  shipAddrBlock: text('ship_addr_block'),
  shipAddrBuilding: text('ship_addr_building'),
  shipAddrCity: text('ship_addr_city'),
  currency: text('currency').default('USD'),
  continent: text('continent'),
  countryName: text('country_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  
  // SAP B1 Integration fields
  sapCardCode: text('sap_card_code').unique(),
  sapCardName: text('sap_card_name'),
  sapCardType: text('sap_card_type'),
  sapPhone1: text('sap_phone1'),
  sapPhone2: text('sap_phone2'),
  sapFax: text('sap_fax'),
  sapEmail: text('sap_email'),
  sapMailAddress: text('sap_mail_address'),
  sapMailCity: text('sap_mail_city'),
  sapMailCountry: text('sap_mail_country'),
  sapMailZipCode: text('sap_mail_zip_code'),
  sapCurrency: text('sap_currency'),
  sapCreditLine: decimal('sap_credit_line', { precision: 15, scale: 2 }),
  sapBalance: decimal('sap_balance', { precision: 15, scale: 2 }),
  sapGroupCode: integer('sap_group_code'),
  sapLicenseNumber: text('sap_license_number'),
  sapVatRegNumber: text('sap_vat_reg_number'),
  sapSyncedAt: timestamp('sap_synced_at'),
  sapLastModified: timestamp('sap_last_modified'),
  sapSyncStatus: text('sap_sync_status').default('pending'), // pending, synced, failed
  sapSyncError: text('sap_sync_error'),
  shortCode: varchar('short_code', { length: 5 }).notNull().unique(),
  continentCode: varchar('continent_code', { length: 2 }),
  countryCode: varchar('country_code', { length: 2 }),
  panNumber: text('pan_number'),
});

// Projects table
export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  code: text('code').notNull().unique(), // Project code for easy reference
  projectType: text('project_type'), // CPS System, Equipment, Grease Plant, Lube Blending Plant, Re-refining Plant, Spares
  status: text('status').notNull().default('planning'), // planning, active, completed, on_hold, canceled
  priority: text('priority').notNull().default('Medium'), // Low, Medium, High
  financialYear: text('financial_year').notNull(), // e.g., "FY25-26"
  
  // Customer reference
  customerId: integer('customer_id').references(() => customers.id),
  
  // Client information (legacy fields, will be replaced by customer reference)
  clientName: text('client_name'),
  clientContact: text('client_contact'),
  clientEmail: text('client_email'),
  
  // Dates
  startDate: text('start_date').notNull(),
  targetEndDate: text('target_end_date').notNull(),
  actualEndDate: text('actual_end_date'),
  
  // Budget and finances
  estimatedBudget: decimal('estimated_budget', { precision: 12, scale: 2 }),
  actualCost: decimal('actual_cost', { precision: 12, scale: 2 }),
  currency: text('currency').default('INR'),
  
  // Progress tracking
  progress: integer('progress').default(0), // 0-100%
  
  // Ownership
  managerId: integer('manager_id').notNull().references(() => users.id),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  
  // Additional details
  notes: text('notes'),
  tags: text('tags').array(),

  // EPC Coding System
  continentCode: varchar('continent_code', { length: 2 }).notNull(),
  countryCode: varchar('country_code', { length: 2 }).notNull(),
  fyCode: varchar('fy_code', { length: 4 }).notNull(),
  projectSeq: varchar('project_seq', { length: 3 }).notNull(),
  legacyCode: varchar('legacy_code', { length: 20 }),

  sourceOfferId: integer('source_offer_id').references(() => offers.id).unique(),
  sourceOfferRevision: integer('source_offer_revision'),
  sourceOrderNumber: varchar('source_order_number', { length: 15 }),
  sourceConversionId: uuid('source_conversion_id'),
  projectOrigin: varchar('project_origin', { length: 20 }),

  automationMode: varchar('automation_mode', { length: 20 }).default('manual'),
  automationRunId: uuid('automation_run_id'),
  automationCompletedAt: timestamp('automation_completed_at'),

  // EPC discipline code for all project items (e.g. ME, EE, CV)
  disciplineCode: varchar('discipline_code', { length: 30 }),

  // MDMT (Minimum Design Metal Temperature)
  mdmt: varchar('mdmt', { length: 20 }),

  // Project-level inspection & electrical defaults (used in Design Data Sheets)
  inspectionBy: varchar('inspection_by', { length: 80 }),
  voltageFrequency: varchar('voltage_frequency', { length: 20 }),

  // Structured electrical standards — used for PPPC buy-list auto-override
  electricalVoltage: varchar('electrical_voltage', { length: 10 }),
  electricalFrequency: varchar('electrical_frequency', { length: 5 }),
  electricalPhase: varchar('electrical_phase', { length: 5 }),

  // Commercial / pricing layer
  sellingCurrency: varchar('selling_currency', { length: 10 }).default('USD'),
  exchangeRate: numeric('exchange_rate', { precision: 14, scale: 6 }),
  exchangeRateFrozenAt: timestamp('exchange_rate_frozen_at'),
  totalSellingPriceInr: numeric('total_selling_price_inr', { precision: 15, scale: 2 }),
  totalSellingPrice: numeric('total_selling_price', { precision: 15, scale: 2 }),
  incoterms: varchar('incoterms', { length: 20 }),
  paymentTerms: text('payment_terms'),
  deliveryTerms: text('delivery_terms'),
  offerValidityDays: integer('offer_validity_days').default(30),
  defaultMarginPercent: numeric('default_margin_percent', { precision: 6, scale: 2 }),

  // Cost lock / approval workflow
  costLockStatus: varchar('cost_lock_status', { length: 20 }).default('unlocked'),
  costLockSubmittedBy: integer('cost_lock_submitted_by').references(() => users.id),
  costLockSubmittedAt: timestamp('cost_lock_submitted_at'),
  costLockReviewedBy: integer('cost_lock_reviewed_by').references(() => users.id),
  costLockReviewedAt: timestamp('cost_lock_reviewed_at'),
  costLockNote: text('cost_lock_note'),

  // Test data flag — hides from normal views; only visible to Superuser with toggle
  isTest: boolean('is_test').default(false).notNull(),

  // EPC Project Naming Governance v2 — canonical display name
  // Format: {project_code} — {customer_name} — {offer_subject}
  // e.g.  : 2627-018 — Industria Petroquimica Apollo — Used Engine Oil Refinery
  offerSubject: text('offer_subject').notNull().default(''),
  customerName: text('customer_name').notNull().default(''),
  projectDisplayName: text('project_display_name').notNull().default(''),
});

// Project phases table (Design, Procurement, Manufacturing, Quality)
export const projectPhases = pgTable('project_phases', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // Design, Procurement, Manufacturing, Quality
  description: text('description').notNull(),
  
  // Ordering
  order: integer('order').notNull(), // 1-based sequence for display
  
  // Dates
  startDate: text('start_date').notNull(),
  targetEndDate: text('target_end_date').notNull(),
  actualEndDate: text('actual_end_date'),
  
  // Status
  status: text('status').notNull().default('pending'), // pending, in_progress, completed, blocked
  progress: integer('progress').default(0), // 0-100%
  
  // Ownership
  phaseLeadId: integer('phase_lead_id').references(() => users.id),
  
  // Additional details
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Project members (team assignment)
export const projectMembers = pgTable('project_members', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id),
  
  // Role within the project (not the same as system role)
  role: text('role').notNull(), // project_manager, phase_lead, team_member, consultant
  
  // Specific phases this member is assigned to (can be null for project-wide roles)
  phaseId: integer('phase_id').references(() => projectPhases.id),
  
  // Assignment details
  assignedDate: timestamp('assigned_date').defaultNow().notNull(),
  hourlyRate: decimal('hourly_rate', { precision: 10, scale: 2 }),
  estimatedHours: integer('estimated_hours'),
  actualHours: integer('actual_hours').default(0),
  
  // Assignment status
  isActive: boolean('is_active').default(true).notNull(),
  
  visibilityScope: varchar('visibility_scope', { length: 20 }).notNull().default('department_records'),
  
  // Additional details
  notes: text('notes'),
});

// Project phase deliverables
export const deliverables = pgTable('deliverables', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  phaseId: integer('phase_id').notNull().references(() => projectPhases.id, { onDelete: 'cascade' }),
  
  // Deliverable details
  name: text('name').notNull(),
  description: text('description').notNull(),
  
  // Dates
  dueDate: text('due_date').notNull(),
  submittedDate: text('submitted_date'),
  
  // Status
  status: text('status').notNull().default('pending'), // pending, in_progress, submitted, approved, rejected
  
  // Ownership
  assignedTo: integer('assigned_to').references(() => users.id),
  reviewedBy: integer('reviewed_by').references(() => users.id),
  
  // Additional details
  notes: text('notes'),
  attachments: jsonb('attachments').$type<{
    name: string;
    url: string;
    type: string;
    size: number;
    uploadedBy: number;
    uploadedAt: string;
  }[]>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Link tasks to project phases
export const projectTasks = pgTable('project_tasks', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').notNull().references(() => projects.id),
  phaseId: integer('phase_id').references(() => projectPhases.id),
  deliverableId: integer('deliverable_id').references(() => deliverables.id),
  
  // Additional metadata specific to project task relationship
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Phase approvals
export const phaseApprovals = pgTable('phase_approvals', {
  id: serial('id').primaryKey(),
  phaseId: integer('phase_id').notNull().references(() => projectPhases.id, { onDelete: 'cascade' }),
  
  // Who needs to approve
  approverId: integer('approver_id').notNull().references(() => users.id),
  
  // Approval status
  status: text('status').notNull().default('pending'), // pending, approved, rejected
  
  // Approval details
  requestedAt: timestamp('requested_at').defaultNow().notNull(),
  respondedAt: timestamp('responded_at'),
  comments: text('comments'),
  
  // Additional details
  requirementsMet: boolean('requirements_met').default(false),
  deliverablesFulfilled: boolean('deliverables_fulfilled').default(false),
});

// Project documents
export const projectDocuments = pgTable('project_documents', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  phaseId: integer('phase_id').references(() => projectPhases.id),
  
  // Document details
  name: text('name').notNull(),
  description: text('description'),
  type: text('type').notNull(), // contract, specification, drawing, report, invoice
  url: text('url').notNull(),
  
  // Version control
  version: text('version').notNull().default('1.0'),
  
  // Ownership
  uploadedBy: integer('uploaded_by').notNull().references(() => users.id),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
  
  // Additional details
  size: integer('size'), // in bytes
  format: text('format'), // pdf, docx, xlsx, etc.
  isPublic: boolean('is_public').default(false), // whether client can see this document
  tags: text('tags').array(),
  
  // GCS Storage details
  storagePath: text('storage_path'), // The GCS path where the file is stored
  storageUrl: text('storage_url'), // The generated signed URL (for temporary access)
  storageUrlExpiry: timestamp('storage_url_expiry'), // When the signed URL expires
});

// Directory Templates for standard directory structure
export const directoryTemplates = pgTable('directory_templates', {
  id: serial('id').primaryKey(),
  
  // Template structure
  department: text('department').notNull(),
  subDirectory: text('sub_directory'),
  
  // EPC DocType mapping
  docTypeCode: text('doc_type_code'),
  documentTitle: text('document_title'),
  allowedExtensions: text('allowed_extensions').array(),
  uploadMode: text('upload_mode'),
  
  // Access control
  isPublic: boolean('is_public').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Google Cloud Storage file directory structure for custom directories and file tracking
export const gcsDirectories = pgTable('gcs_directories', {
  id: serial('id').primaryKey(),
  
  // Directory structure
  financialYear: text('financial_year').notNull(), // e.g., "2526"
  projectCode: text('project_code').notNull(), // e.g., "2526-1"
  department: text('department').notNull(), // e.g., "design", "procurement", "manufacturing", "quality"
  subDirectory: text('sub_directory'), // e.g., "1_Pre_Order_Communication"
  
  // Full path in GCS
  fullPath: text('full_path').notNull().unique(),
  
  // Access control
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  isPublic: boolean('is_public').default(false),
});

// Project items table for storing up to 50 items per project
// Master items catalog
export const masterItems = pgTable('master_items', {
  id: serial('id').primaryKey(),
  
  // Item details
  itemCode: text('item_code').notNull().unique(), // Item code (required and unique)
  description: text('description').notNull(),
  specification: text('specification'),
  uom: text('uom').notNull(), // Unit of Measurement (e.g., Nos, Kg, Meter)
  makeOrBuy: text('make_or_buy'), // Whether this item is made in-house or purchased
  drawingNo: text('drawing_no'), // Drawing Number reference
  
  // Drawing revision tracking
  latestRevision: integer('latest_revision').default(0), // Track the latest drawing revision

  // Catalog BUY item identity (used for SAP Item Code generation)
  // item_type: 'project' (default, existing) | 'catalog' (BUY catalog items)
  itemType:       text('item_type').default('project'),
  buyGroupId:     integer('buy_group_id'),     // FK → buy_groups.id (no Drizzle ref — buyGroups defined later in file)
  buySubgroupId:  integer('buy_subgroup_id'),  // FK → buy_subgroups.id
  catalogMake:    text('catalog_make'),
  catalogModel:   text('catalog_model'),

  // Additional details
  standardCost: decimal('standard_cost', { precision: 12, scale: 2 }),
  supplier: text('supplier'),
  notes: text('notes'),
  
  // Procurement information
  preferredVendorId: integer('preferred_vendor_id').references(() => vendors.id),
  estimatedCost: decimal('estimated_cost', { precision: 12, scale: 2 }),
  unit: text('unit'), // Unit for procurement (can differ from UOM)
  
  // Tracking
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Project-specific items (linking projects to master items)
export const projectItems = pgTable('project_items', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectCode: text('project_code').notNull(),
  itemId: integer('item_id').references(() => masterItems.id),
  itemCode: text('item_code').unique(),
  description: text('description'),
  uom: text('uom'),
  makeOrBuy: text('make_or_buy'),
  
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
  estimatedCost: decimal('estimated_cost', { precision: 12, scale: 2 }),
  actualCost: decimal('actual_cost', { precision: 12, scale: 2 }),
  rolledUpCost: decimal('rolled_up_cost', { precision: 14, scale: 2 }),
  rolledUpAt: timestamp('rolled_up_at'),
  marginPercent: numeric('margin_percent', { precision: 6, scale: 2 }),
  sellingPriceInr: numeric('selling_price_inr', { precision: 15, scale: 2 }),
  sellingPrice: numeric('selling_price', { precision: 15, scale: 2 }),
  pricingLockedAt: timestamp('pricing_locked_at'),
  notes: text('notes'),
  
  status: text('status').default('Not Started'),
  
  parentProjectItemId: integer('parent_project_item_id'),
  sourceBomHeaderId: integer('source_bom_header_id'),
  sourceBomLineId: integer('source_bom_line_id'),
  source: varchar('source', { length: 30 }),
  requiredQuantity: decimal('required_quantity', { precision: 12, scale: 2 }),
  tagNo: varchar('tag_no', { length: 80 }),

  sourceOfferId: integer('source_offer_id'),
  sourceOfferItemId: integer('source_offer_item_id'),
  sourceOrderNumber: varchar('source_order_number', { length: 15 }),
  
  bpCode: text('bp_code'),
  productCode: text('product_code'),
  inheritedMasterRevision: text('inherited_master_revision'),
  deviationNotes: text('deviation_notes'),

  codeBars: varchar('code_bars', { length: 16 }),
  sapSynced: boolean('sap_synced').default(false),
  sapSyncedAt: timestamp('sap_synced_at'),
  sapSyncError: text('sap_sync_error'),
  sapSyncStatus: varchar('sap_sync_status', { length: 20 }).default('not_synced'),
  sapItemCode: varchar('sap_item_code', { length: 50 }),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const projectItemDrawings = pgTable('project_item_drawings', {
  id: serial('id').primaryKey(),
  projectItemId: integer('project_item_id').notNull().references(() => projectItems.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  drawingNumber: varchar('drawing_number', { length: 80 }).notNull(),
  title: text('title').notNull(),
  revision: varchar('revision', { length: 10 }).notNull().default('00'),
  revisionDate: timestamp('revision_date').defaultNow().notNull(),
  status: varchar('status', { length: 30 }).notNull().default('Draft'),
  format: varchar('format', { length: 10 }),
  sheetSize: varchar('sheet_size', { length: 10 }),
  scale: varchar('scale', { length: 20 }),
  gcsObjectPath: text('gcs_object_path'),
  checksumSha256: text('checksum_sha256'),
  fileSize: integer('file_size'),
  fileName: text('file_name'),
  mimeType: varchar('mime_type', { length: 100 }),
  supersededById: integer('superseded_by_id'),
  notes: text('notes'),
  uploadedBy: integer('uploaded_by').references(() => users.id),
  itemCode: varchar('item_code', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const itemPlanningRecords = pgTable('item_planning_records', {
  id: serial('id').primaryKey(),
  planningNumber: varchar('planning_number', { length: 35 }).unique(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectItemId: integer('project_item_id').notNull().references(() => projectItems.id, { onDelete: 'cascade' }),
  masterItemId: integer('master_item_id').notNull().references(() => masterItems.id),
  planningType: varchar('planning_type', { length: 30 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('draft'),
  classificationSnapshot: varchar('classification_snapshot', { length: 20 }),
  supersededBy: integer('superseded_by'),
  supersededAt: timestamp('superseded_at'),
  supersessionReason: text('supersession_reason'),
  linkedTaskId: integer('linked_task_id').references(() => tasks.id),
  assignedTo: integer('assigned_to').references(() => users.id),
  notes: text('notes'),
  createdBy: integer('created_by').references(() => users.id),
  reviewedBy: integer('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  reviewNote: text('review_note'),
  releasedBy: integer('released_by').references(() => users.id),
  releasedAt: timestamp('released_at'),
  releaseNote: text('release_note'),
  cancelledBy: integer('cancelled_by').references(() => users.id),
  cancelledAt: timestamp('cancelled_at'),
  cancelReason: text('cancel_reason'),
  source: varchar('source', { length: 30 }),
  sourceBomHeaderId: integer('source_bom_header_id'),
  sourceBomLineId: integer('source_bom_line_id'),
  sourceBuyListHeaderId: integer('source_buy_list_header_id'),
  sourceBuyListLineId: integer('source_buy_list_line_id'),
  parentProjectItemId: integer('parent_project_item_id'),
  quantity: decimal('quantity', { precision: 12, scale: 2 }),
  itemCode: varchar('item_code', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertItemPlanningRecordSchema = createInsertSchema(itemPlanningRecords).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertItemPlanningRecord = z.infer<typeof insertItemPlanningRecordSchema>;
export type ItemPlanningRecord = typeof itemPlanningRecords.$inferSelect;

export const procurementExecutionRecords = pgTable('procurement_execution_records', {
  id: serial('id').primaryKey(),
  procurementNumber: varchar('procurement_number', { length: 35 }).unique(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectItemId: integer('project_item_id').notNull().references(() => projectItems.id, { onDelete: 'cascade' }),
  planningRecordId: integer('planning_record_id').notNull().references(() => itemPlanningRecords.id),
  masterItemId: integer('master_item_id').notNull().references(() => masterItems.id),
  itemCode: varchar('item_code', { length: 100 }),
  itemDescription: text('item_description'),
  itemSpecification: text('item_specification'),
  uom: varchar('uom', { length: 30 }),
  drawingNo: varchar('drawing_no', { length: 100 }),
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
  estimatedUnitCost: decimal('estimated_unit_cost', { precision: 12, scale: 2 }),
  estimatedTotalCost: decimal('estimated_total_cost', { precision: 14, scale: 2 }),
  preferredVendorId: integer('preferred_vendor_id').references(() => vendors.id),
  preferredVendorName: varchar('preferred_vendor_name', { length: 255 }),
  procurementNotes: text('procurement_notes'),
  status: varchar('status', { length: 30 }).notNull().default('draft'),
  preparedBy: integer('prepared_by').references(() => users.id),
  preparedAt: timestamp('prepared_at'),
  preparationNote: text('preparation_note'),
  supersededBy: integer('superseded_by'),
  supersededAt: timestamp('superseded_at'),
  supersessionReason: text('supersession_reason'),
  cancelledBy: integer('cancelled_by').references(() => users.id),
  cancelledAt: timestamp('cancelled_at'),
  cancelReason: text('cancel_reason'),
  createdBy: integer('created_by').references(() => users.id),
  assignedTo: integer('assigned_to').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertProcurementExecutionRecordSchema = createInsertSchema(procurementExecutionRecords).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProcurementExecutionRecord = z.infer<typeof insertProcurementExecutionRecordSchema>;
export type ProcurementExecutionRecord = typeof procurementExecutionRecords.$inferSelect;

export const productionExecutionRecords = pgTable('production_execution_records', {
  id: serial('id').primaryKey(),
  productionNumber: varchar('production_number', { length: 35 }).unique(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectItemId: integer('project_item_id').notNull().references(() => projectItems.id, { onDelete: 'cascade' }),
  planningRecordId: integer('planning_record_id').notNull().references(() => itemPlanningRecords.id),
  masterItemId: integer('master_item_id').notNull().references(() => masterItems.id),
  itemCode: varchar('item_code', { length: 100 }),
  itemDescription: text('item_description'),
  itemSpecification: text('item_specification'),
  uom: varchar('uom', { length: 30 }),
  drawingNo: varchar('drawing_no', { length: 100 }),
  drawingRevision: integer('drawing_revision'),
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
  estimatedUnitCost: decimal('estimated_unit_cost', { precision: 12, scale: 2 }),
  estimatedTotalCost: decimal('estimated_total_cost', { precision: 14, scale: 2 }),
  makeClassification: varchar('make_classification', { length: 30 }),
  manufacturingNotes: text('manufacturing_notes'),
  status: varchar('status', { length: 30 }).notNull().default('draft'),
  preparedBy: integer('prepared_by').references(() => users.id),
  preparedAt: timestamp('prepared_at'),
  preparationNote: text('preparation_note'),
  supersededBy: integer('superseded_by'),
  supersededAt: timestamp('superseded_at'),
  supersessionReason: text('supersession_reason'),
  cancelledBy: integer('cancelled_by').references(() => users.id),
  cancelledAt: timestamp('cancelled_at'),
  cancelReason: text('cancel_reason'),
  createdBy: integer('created_by').references(() => users.id),
  assignedTo: integer('assigned_to').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertProductionExecutionRecordSchema = createInsertSchema(productionExecutionRecords).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProductionExecutionRecord = z.infer<typeof insertProductionExecutionRecordSchema>;
export type ProductionExecutionRecord = typeof productionExecutionRecords.$inferSelect;

export const qualityPlanningRecords = pgTable('quality_planning_records', {
  id: serial('id').primaryKey(),
  qualityPlanNumber: varchar('quality_plan_number', { length: 35 }).unique(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectItemId: integer('project_item_id').notNull().references(() => projectItems.id, { onDelete: 'cascade' }),
  masterItemId: integer('master_item_id').notNull().references(() => masterItems.id),
  sourceContext: varchar('source_context', { length: 30 }).notNull(),
  procurementExecId: integer('procurement_exec_id').references(() => procurementExecutionRecords.id),
  productionExecId: integer('production_exec_id').references(() => productionExecutionRecords.id),
  planningRecordId: integer('planning_record_id').references(() => itemPlanningRecords.id),
  itemCode: varchar('item_code', { length: 100 }),
  itemDescription: text('item_description'),
  itemSpecification: text('item_specification'),
  uom: varchar('uom', { length: 30 }),
  drawingNo: varchar('drawing_no', { length: 100 }),
  drawingRevision: integer('drawing_revision'),
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
  qualityRequirementType: varchar('quality_requirement_type', { length: 50 }).notNull(),
  qualityNotes: text('quality_notes'),
  status: varchar('status', { length: 30 }).notNull().default('draft'),
  preparedBy: integer('prepared_by').references(() => users.id),
  preparedAt: timestamp('prepared_at'),
  preparationNote: text('preparation_note'),
  supersededBy: integer('superseded_by'),
  supersededAt: timestamp('superseded_at'),
  supersessionReason: text('supersession_reason'),
  cancelledBy: integer('cancelled_by').references(() => users.id),
  cancelledAt: timestamp('cancelled_at'),
  cancelReason: text('cancel_reason'),
  createdBy: integer('created_by').references(() => users.id),
  assignedTo: integer('assigned_to').references(() => users.id),
  createdSourceType: varchar('created_source_type', { length: 20 }).default('manual'),
  createdSourceRef: varchar('created_source_ref', { length: 100 }),
  automationRunId: uuid('automation_run_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertQualityPlanningRecordSchema = createInsertSchema(qualityPlanningRecords).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertQualityPlanningRecord = z.infer<typeof insertQualityPlanningRecordSchema>;
export type QualityPlanningRecord = typeof qualityPlanningRecords.$inferSelect;

export const poPreparationRecords = pgTable('po_preparation_records', {
  id: serial('id').primaryKey(),
  poPrepNumber: varchar('po_prep_number', { length: 35 }).unique(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectItemId: integer('project_item_id').notNull().references(() => projectItems.id, { onDelete: 'cascade' }),
  planningRecordId: integer('planning_record_id').notNull().references(() => itemPlanningRecords.id),
  executionRecordId: integer('execution_record_id').notNull().references(() => procurementExecutionRecords.id),
  qualityPlanId: integer('quality_plan_id').references(() => qualityPlanningRecords.id),
  masterItemId: integer('master_item_id').notNull().references(() => masterItems.id),
  itemCode: varchar('item_code', { length: 100 }),
  itemDescription: text('item_description'),
  itemSpecification: text('item_specification'),
  uom: varchar('uom', { length: 30 }),
  drawingNo: varchar('drawing_no', { length: 100 }),
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
  estimatedUnitCost: decimal('estimated_unit_cost', { precision: 12, scale: 2 }),
  estimatedTotalCost: decimal('estimated_total_cost', { precision: 14, scale: 2 }),
  preferredVendorId: integer('preferred_vendor_id').references(() => vendors.id),
  preferredVendorName: varchar('preferred_vendor_name', { length: 255 }),
  procurementNotes: text('procurement_notes'),
  reviewNotes: text('review_notes'),
  status: varchar('status', { length: 30 }).notNull().default('draft'),
  reviewedBy: integer('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  readyBy: integer('ready_by').references(() => users.id),
  readyAt: timestamp('ready_at'),
  supersededBy: integer('superseded_by'),
  supersededAt: timestamp('superseded_at'),
  supersessionReason: text('supersession_reason'),
  cancelledBy: integer('cancelled_by').references(() => users.id),
  cancelledAt: timestamp('cancelled_at'),
  cancelReason: text('cancel_reason'),
  createdBy: integer('created_by').references(() => users.id),
  assignedTo: integer('assigned_to').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertPoPreparationRecordSchema = createInsertSchema(poPreparationRecords).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPoPreparationRecord = z.infer<typeof insertPoPreparationRecordSchema>;
export type PoPreparationRecord = typeof poPreparationRecords.$inferSelect;

export const woPreparationRecords = pgTable('wo_preparation_records', {
  id: serial('id').primaryKey(),
  woPrepNumber: varchar('wo_prep_number', { length: 35 }).unique(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectItemId: integer('project_item_id').notNull().references(() => projectItems.id, { onDelete: 'cascade' }),
  planningRecordId: integer('planning_record_id').notNull().references(() => itemPlanningRecords.id),
  executionRecordId: integer('execution_record_id').notNull().references(() => productionExecutionRecords.id),
  qualityPlanId: integer('quality_plan_id').references(() => qualityPlanningRecords.id),
  masterItemId: integer('master_item_id').notNull().references(() => masterItems.id),
  itemCode: varchar('item_code', { length: 100 }),
  itemDescription: text('item_description'),
  itemSpecification: text('item_specification'),
  uom: varchar('uom', { length: 30 }),
  drawingNo: varchar('drawing_no', { length: 100 }),
  drawingRevision: integer('drawing_revision'),
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
  estimatedUnitCost: decimal('estimated_unit_cost', { precision: 12, scale: 2 }),
  estimatedTotalCost: decimal('estimated_total_cost', { precision: 14, scale: 2 }),
  makeClassification: varchar('make_classification', { length: 30 }),
  manufacturingNotes: text('manufacturing_notes'),
  reviewNotes: text('review_notes'),
  status: varchar('status', { length: 30 }).notNull().default('draft'),
  reviewedBy: integer('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  readyBy: integer('ready_by').references(() => users.id),
  readyAt: timestamp('ready_at'),
  supersededBy: integer('superseded_by'),
  supersededAt: timestamp('superseded_at'),
  supersessionReason: text('supersession_reason'),
  cancelledBy: integer('cancelled_by').references(() => users.id),
  cancelledAt: timestamp('cancelled_at'),
  cancelReason: text('cancel_reason'),
  createdBy: integer('created_by').references(() => users.id),
  assignedTo: integer('assigned_to').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertWoPreparationRecordSchema = createInsertSchema(woPreparationRecords).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWoPreparationRecord = z.infer<typeof insertWoPreparationRecordSchema>;
export type WoPreparationRecord = typeof woPreparationRecords.$inferSelect;

export const inspectionExecutionRecords = pgTable('inspection_execution_records', {
  id: serial('id').primaryKey(),
  inspectionNumber: varchar('inspection_number', { length: 35 }).unique(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectItemId: integer('project_item_id').notNull().references(() => projectItems.id, { onDelete: 'cascade' }),
  planningRecordId: integer('planning_record_id').references(() => itemPlanningRecords.id),
  executionRecordId: integer('execution_record_id'),
  qualityPlanId: integer('quality_plan_id').notNull().references(() => qualityPlanningRecords.id),
  masterItemId: integer('master_item_id').notNull().references(() => masterItems.id),
  sourceContext: varchar('source_context', { length: 30 }).notNull(),
  inspectionType: varchar('inspection_type', { length: 50 }).notNull(),
  itemCode: varchar('item_code', { length: 100 }),
  itemDescription: text('item_description'),
  itemSpecification: text('item_specification'),
  uom: varchar('uom', { length: 30 }),
  drawingNo: varchar('drawing_no', { length: 100 }),
  drawingRevision: integer('drawing_revision'),
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
  inspectionNotes: text('inspection_notes'),
  resultNotes: text('result_notes'),
  status: varchar('status', { length: 30 }).notNull().default('draft'),
  scheduledBy: integer('scheduled_by').references(() => users.id),
  scheduledAt: timestamp('scheduled_at'),
  startedBy: integer('started_by').references(() => users.id),
  startedAt: timestamp('started_at'),
  completedBy: integer('completed_by').references(() => users.id),
  completedAt: timestamp('completed_at'),
  failedBy: integer('failed_by').references(() => users.id),
  failedAt: timestamp('failed_at'),
  failureReason: text('failure_reason'),
  supersededBy: integer('superseded_by'),
  supersededAt: timestamp('superseded_at'),
  supersessionReason: text('supersession_reason'),
  cancelledBy: integer('cancelled_by').references(() => users.id),
  cancelledAt: timestamp('cancelled_at'),
  cancelReason: text('cancel_reason'),
  createdBy: integer('created_by').references(() => users.id),
  assignedTo: integer('assigned_to').references(() => users.id),
  createdSourceType: varchar('created_source_type', { length: 20 }).default('manual'),
  createdSourceRef: varchar('created_source_ref', { length: 100 }),
  automationRunId: uuid('automation_run_id'),
  plcLineId: integer('plc_line_id'), // FK to procurement_list_lines — nullable; added Phase 1
  grnRecordId: integer('grn_record_id'), // FK to plc_grn_records — nullable; added Phase 1
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertInspectionExecutionRecordSchema = createInsertSchema(inspectionExecutionRecords).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInspectionExecutionRecord = z.infer<typeof insertInspectionExecutionRecordSchema>;
export type InspectionExecutionRecord = typeof inspectionExecutionRecords.$inferSelect;

// Create insert schemas for project management tables
export const insertCustomerSchema = createInsertSchema(customers);

// Master item insert schema
export const insertMasterItemSchema = createInsertSchema(masterItems, {
  itemCode: z.string().min(1),
  description: z.string().min(1),
  uom: z.string().min(1),
  makeOrBuy: z.enum(['Make', 'Buy', 'Service']).nullable().optional().transform(v => v === null ? undefined : v),
  drawingNo: z.string().nullable().optional().transform(v => v === null ? undefined : v),
  standardCost: z.number().nullable().optional().transform(v => v === null ? undefined : v),
  supplier: z.string().nullable().optional().transform(v => v === null ? '' : v),
  notes: z.string().nullable().optional().transform(v => v === null ? '' : v),
  specification: z.string().nullable().optional().transform(v => v === null ? '' : v),
});

export const insertProjectSchema = createInsertSchema(projects, {
  tags: z.array(z.string()).optional(),
  estimatedBudget: z.number().optional(),
  actualCost: z.number().optional(),
  startDate: z.string(),
  targetEndDate: z.string(),
  actualEndDate: z.string().optional(),
  status: z.enum(['planning', 'active', 'completed', 'on_hold', 'canceled']),
  priority: z.enum(['Low', 'Medium', 'High']),
  currency: z.enum(['USD', 'EUR', 'INR']).default('USD'),
});

export const insertProjectPhaseSchema = createInsertSchema(projectPhases, {
  startDate: z.string(),
  targetEndDate: z.string(),
  actualEndDate: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'blocked']),
  name: z.string().min(1),
});

export const insertProjectMemberSchema = createInsertSchema(projectMembers, {
  role: z.enum(['project_manager', 'phase_lead', 'team_member', 'consultant']),
  phaseId: z.number().optional(),
  hourlyRate: z.number().optional(),
  estimatedHours: z.number().optional(),
  actualHours: z.number().optional(),
});

export const insertDeliverableSchema = createInsertSchema(deliverables, {
  dueDate: z.string(),
  submittedDate: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'submitted', 'approved', 'rejected']),
  attachments: z.array(z.object({
    name: z.string(),
    url: z.string(),
    type: z.string(),
    size: z.number(),
    uploadedBy: z.number(),
    uploadedAt: z.string(),
  })).optional(),
});

export const insertProjectTaskSchema = createInsertSchema(projectTasks);

export const insertPhaseApprovalSchema = createInsertSchema(phaseApprovals, {
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
});

export const insertProjectDocumentSchema = createInsertSchema(projectDocuments, {
  tags: z.array(z.string()).optional(),
  type: z.enum(['contract', 'specification', 'drawing', 'report', 'invoice']),
  version: z.string().default('1.0'),
  storagePath: z.string().optional(),
  storageUrl: z.string().optional(),
  storageUrlExpiry: z.date().optional(),
});

// GCS directories insert schema
export const insertGcsDirectorySchema = createInsertSchema(gcsDirectories, {
  financialYear: z.string().min(4),
  projectCode: z.string().min(1),
  department: z.string().min(1),
  subDirectory: z.string().optional(),
  fullPath: z.string().min(1),
  isPublic: z.boolean().default(false),
});

// Project item insert schema
export const insertProjectItemSchema = createInsertSchema(projectItems, {
  itemId: z.number().positive(),
  quantity: z.number().positive(),
  estimatedCost: z.number().nullable().optional().transform(v => v === null ? undefined : v),
  actualCost: z.number().nullable().optional().transform(v => v === null ? undefined : v),
  notes: z.string().nullable().optional().transform(v => v === null ? '' : v),
  status: z.enum(['Not Started', 'Drawing Received', 'Material Received', 'Under Construction', 'Completed', 'On Hold', 'Cancelled']).default('Not Started'),
});

// Define types for project management tables
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type MasterItem = typeof masterItems.$inferSelect;
export type InsertMasterItem = z.infer<typeof insertMasterItemSchema>;
export type ProjectItem = typeof projectItems.$inferSelect;
export type InsertProjectItem = z.infer<typeof insertProjectItemSchema>;

export type ProjectPhase = typeof projectPhases.$inferSelect;
export type InsertProjectPhase = z.infer<typeof insertProjectPhaseSchema>;

export type ProjectMember = typeof projectMembers.$inferSelect;
export type InsertProjectMember = z.infer<typeof insertProjectMemberSchema>;

export type Deliverable = typeof deliverables.$inferSelect;
export type InsertDeliverable = z.infer<typeof insertDeliverableSchema>;

export type ProjectTask = typeof projectTasks.$inferSelect;
export type InsertProjectTask = z.infer<typeof insertProjectTaskSchema>;

// Item components for sub-assemblies
export const itemComponents = pgTable('item_components', {
  id: serial('id').primaryKey(),
  parentItemId: integer('parent_item_id').notNull().references(() => masterItems.id),
  componentItemId: integer('component_item_id').notNull().references(() => masterItems.id),
  quantity: decimal('quantity').notNull().default('1'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Create insert schema for item components
export const insertItemComponentSchema = createInsertSchema(itemComponents);

// Types for item components
export type ItemComponent = typeof itemComponents.$inferSelect;
export type InsertItemComponent = z.infer<typeof insertItemComponentSchema>;

export type PhaseApproval = typeof phaseApprovals.$inferSelect;
export type InsertPhaseApproval = z.infer<typeof insertPhaseApprovalSchema>;

export type ProjectDocument = typeof projectDocuments.$inferSelect;
export type InsertProjectDocument = z.infer<typeof insertProjectDocumentSchema>;

export type ProjectKeyStage = typeof projectKeyStages.$inferSelect;
export type InsertProjectKeyStage = z.infer<typeof insertProjectKeyStageSchema>;

// ==================== PROCUREMENT MANAGEMENT MODULE ====================

// Vendors table
export const vendors = pgTable('vendors', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  displayName: text('display_name'),
  sapCardCode: varchar('sap_card_code', { length: 50 }).unique(),
  vendorType: varchar('vendor_type', { length: 1 }),   // R P M I V E B — from SAP UDF U_ERP_Group
  sapGroupCode: integer('sap_group_code'),              // SAP BusinessPartner GroupCode
  sapGroupName: text('sap_group_name'),                 // SAP BusinessPartner GroupName
  sapSyncStatus: varchar('sap_sync_status', { length: 20 }), // 'synced' | 'inactive'
  lastSyncedAt: timestamp('last_synced_at'),            // timestamp of last SAP sync
  contactPerson: text('contact_person'),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  country: text('country'),
  postalCode: text('postal_code'),
  taxId: text('tax_id'),
  paymentTerms: text('payment_terms'),
  deliveryTerms: text('delivery_terms'),
  performanceRating: integer('performance_rating'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  isActive: boolean('is_active').default(true).notNull(),
});

// Purchase Orders table
export const purchaseOrders = pgTable('purchase_orders', {
  id: serial('id').primaryKey(),
  purchaseOrderNumber: text('purchase_order_number').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  projectId: integer('project_id').references(() => projects.id).notNull(),
  vendorId: integer('vendor_id').references(() => vendors.id).notNull(),
  status: text('status').notNull().default('draft'), // draft, submitted, approved, ordered, shipped, received, on_hold, cancelled
  priority: text('priority').notNull().default('Medium'), // Low, Medium, High
  requestedDate: timestamp('requested_date').notNull(),
  requiredByDate: timestamp('required_by_date').notNull(),
  estimatedDeliveryDate: timestamp('estimated_delivery_date'),
  actualDeliveryDate: timestamp('actual_delivery_date'),
  paymentTerms: text('payment_terms'),
  shippingTerms: text('shipping_terms'),
  totalAmount: decimal('total_amount', { precision: 12, scale: 2 }),
  currency: text('currency').default('INR'),
  trackingNumber: text('tracking_number'),
  notes: text('notes'),
  createdBy: integer('created_by').references(() => users.id).notNull(),
  approvedBy: integer('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Purchase Order Items table
export const purchaseOrderItems = pgTable('purchase_order_items', {
  id: serial('id').primaryKey(),
  purchaseOrderId: integer('purchase_order_id').references(() => purchaseOrders.id, { onDelete: 'cascade' }).notNull(),
  itemId: integer('item_id').references(() => masterItems.id).notNull(),
  projectItemId: integer('project_item_id').references(() => projectItems.id),
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
  unit: text('unit').notNull(),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal('total_price', { precision: 12, scale: 2 }).notNull(),
  description: text('description'),
  deliveryStatus: text('delivery_status').default('pending'), // pending, partial, complete
  receivedQuantity: decimal('received_quantity', { precision: 10, scale: 2 }).default('0'),
  qualityStatus: text('quality_status'), // pending, passed, failed, conditional
  lineNumber: integer('line_number').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Purchase Order Documents table
export const purchaseOrderDocuments = pgTable('purchase_order_documents', {
  id: serial('id').primaryKey(),
  purchaseOrderId: integer('purchase_order_id').references(() => purchaseOrders.id, { onDelete: 'cascade' }).notNull(),
  documentType: text('document_type').notNull(), // quote, po, invoice, receipt, shipping, quality
  documentName: text('document_name').notNull(),
  documentPath: text('document_path').notNull(),
  uploadedBy: integer('uploaded_by').references(() => users.id).notNull(),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
  storagePath: text('storage_path'),
  storageUrl: text('storage_url'),
  storageUrlExpiry: timestamp('storage_url_expiry'),
});

// Purchase Order History table
export const purchaseOrderHistory = pgTable('purchase_order_history', {
  id: serial('id').primaryKey(),
  purchaseOrderId: integer('purchase_order_id').references(() => purchaseOrders.id, { onDelete: 'cascade' }).notNull(),
  status: text('status').notNull(),
  comments: text('comments'),
  changedBy: integer('changed_by').references(() => users.id).notNull(),
  changedAt: timestamp('changed_at').defaultNow().notNull(),
  additionalData: jsonb('additional_data'),
});

// Define insert schemas for procurement tables
export const insertVendorSchema = createInsertSchema(vendors);
export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).extend({
  priority: z.enum(['Low', 'Medium', 'High']),
  status: z.enum(['draft', 'submitted', 'approved', 'ordered', 'shipped', 'received', 'on_hold', 'canceled']),
});
export const insertPurchaseOrderItemSchema = createInsertSchema(purchaseOrderItems);
export const insertPurchaseOrderDocumentSchema = createInsertSchema(purchaseOrderDocuments);
export const insertPurchaseOrderHistorySchema = createInsertSchema(purchaseOrderHistory);

// Export procurement types
export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = z.infer<typeof insertVendorSchema>;

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;

export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type InsertPurchaseOrderItem = z.infer<typeof insertPurchaseOrderItemSchema>;

export type PurchaseOrderDocument = typeof purchaseOrderDocuments.$inferSelect;
export type InsertPurchaseOrderDocument = z.infer<typeof insertPurchaseOrderDocumentSchema>;

export type PurchaseOrderHistory = typeof purchaseOrderHistory.$inferSelect;
export type InsertPurchaseOrderHistory = z.infer<typeof insertPurchaseOrderHistorySchema>;

// ==================== PRODUCTION MANAGEMENT MODULE ====================

// Work Orders table
export const workOrders = pgTable('work_orders', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectCode: text('project_code').notNull(),
  workOrderNumber: text('work_order_number').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('planned'), // planned, in_progress, on_hold, completed, cancelled
  priority: text('priority').notNull().default('Medium'), // Low, Medium, High
  
  // Dates and scheduling
  plannedStartDate: timestamp('planned_start_date').notNull(),
  plannedEndDate: timestamp('planned_end_date').notNull(),
  actualStartDate: timestamp('actual_start_date'),
  actualEndDate: timestamp('actual_end_date'),
  
  // Production details
  productionLine: text('production_line'),
  batchNumber: text('batch_number'), // Used to store drawing numbers
  quantity: integer('quantity').notNull().default(1),
  
  // Resources and costs
  estimatedHours: integer('estimated_hours'),
  actualHours: integer('actual_hours'),
  estimatedCost: decimal('estimated_cost', { precision: 12, scale: 2 }),
  actualCost: decimal('actual_cost', { precision: 12, scale: 2 }),
  
  // Ownership and creation details
  supervisorId: integer('supervisor_id').notNull().references(() => users.id),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Work Order Items table (linking work orders to project items)
export const workOrderItems = pgTable('work_order_items', {
  id: serial('id').primaryKey(),
  workOrderId: integer('work_order_id').notNull().references(() => workOrders.id, { onDelete: 'cascade' }),
  projectItemId: integer('project_item_id').notNull().references(() => projectItems.id, { onDelete: 'cascade' }),
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
  
  // Production details for this specific item
  status: text('status').notNull().default('pending'), // pending, in_progress, complete
  sequenceNumber: integer('sequence_number').notNull(), // order of production
  notes: text('notes'),
  unit: text('unit'), // Unit of measurement (e.g., EA, KG, LTR)
  itemCode: varchar('item_code', { length: 100 }),
  
  // Tracking
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Resource Assignments table (tracking who's working on what)
export const resourceAssignments = pgTable('resource_assignments', {
  id: serial('id').primaryKey(),
  workOrderId: integer('work_order_id').notNull().references(() => workOrders.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id),
  
  // Assignment details
  role: text('role').notNull(), // operator, inspector, supervisor, helper
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date'),
  hoursAllocated: decimal('hours_allocated', { precision: 8, scale: 2 }),
  hoursSpent: decimal('hours_spent', { precision: 8, scale: 2 }).default('0'),
  
  // Status
  status: text('status').notNull().default('assigned'), // assigned, in_progress, completed, reassigned
  
  // Tracking
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Work Order History table (tracking all changes to work orders)
export const workOrderHistory = pgTable('work_order_history', {
  id: serial('id').primaryKey(),
  workOrderId: integer('work_order_id').notNull().references(() => workOrders.id, { onDelete: 'cascade' }),
  
  // Who made the change
  userId: integer('user_id').notNull().references(() => users.id),
  username: text('username').notNull(), // Denormalized for history records
  
  // What changed
  changeType: text('change_type').notNull(), // 'created', 'updated', 'status_change', 'comment', etc.
  fieldName: text('field_name'), // Which field was changed (if applicable)
  oldValue: text('old_value'), // Previous value (serialized if needed)
  newValue: text('new_value'), // New value (serialized if needed)
  
  // Change details
  changeDescription: text('change_description').notNull(), // Human-readable description of what changed
  comment: text('comment'), // Optional comment added by the user
  
  // When it happened
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Production Records table (daily production entry)
export const productionRecords = pgTable('production_records', {
  id: serial('id').primaryKey(),
  workOrderId: integer('work_order_id').notNull().references(() => workOrders.id, { onDelete: 'cascade' }),
  workOrderItemId: integer('work_order_item_id').references(() => workOrderItems.id, { onDelete: 'cascade' }),
  
  // Production metrics
  date: date('date').notNull(),
  shift: text('shift').notNull(), // morning, afternoon, night
  quantityProduced: integer('quantity_produced').notNull(),
  quantityRejected: integer('quantity_rejected').notNull().default(0),
  hoursWorked: decimal('hours_worked', { precision: 8, scale: 2 }).notNull(),
  
  // Quality and issues
  issuesEncountered: text('issues_encountered'),
  
  // Ownership
  recordedBy: integer('recorded_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Material Consumption table
export const materialConsumption = pgTable('material_consumption', {
  id: serial('id').primaryKey(),
  workOrderId: integer('work_order_id').notNull().references(() => workOrders.id, { onDelete: 'cascade' }),
  componentItemId: integer('component_item_id').notNull().references(() => masterItems.id),
  
  // Consumption details
  quantityRequired: decimal('quantity_required', { precision: 10, scale: 2 }).notNull(),
  quantityConsumed: decimal('quantity_consumed', { precision: 10, scale: 2 }).notNull().default('0'),
  
  // Tracking and status
  status: text('status').notNull().default('allocated'), // allocated, partially_consumed, fully_consumed
  recordedBy: integer('recorded_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Machine Allocation table
export const machineAllocations = pgTable('machine_allocations', {
  id: serial('id').primaryKey(),
  workOrderId: integer('work_order_id').notNull().references(() => workOrders.id, { onDelete: 'cascade' }),
  
  // Machine details
  machineName: text('machine_name').notNull(),
  machineCode: text('machine_code'),
  
  // Allocation details
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time'),
  setupTimeMinutes: integer('setup_time_minutes').notNull().default(0),
  downtimeMinutes: integer('downtime_minutes').notNull().default(0),
  
  // Status and tracking
  status: text('status').notNull().default('scheduled'), // scheduled, active, completed, maintenance
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Team Leader Configuration table
export const teamLeaderConfig = pgTable('team_leader_config', {
  teamNumber: integer('team_number').primaryKey(),
  leaderName: varchar('leader_name', { length: 100 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  updatedBy: integer('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ==================== QUALITY MANAGEMENT MODULE ====================

// Welders table - simplified version without qualification details
export const welders = pgTable('welders', {
  id: serial('id').primaryKey(),
  welderId: varchar('welderId', { length: 10 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  trade: varchar('trade', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('Active'),
  remarks: text('remarks'),
  // Personal information fields
  photoPath: varchar('photo_path', { length: 255 }),
  dateOfBirth: date('date_of_birth'),
  contactNumber: varchar('contact_number', { length: 20 }),
  hireDate: date('hire_date'),
  identificationType: varchar('identification_type', { length: 50 }),
  identificationNumber: varchar('identification_number', { length: 50 }),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow()
});

// Welder Certificates table
export const welderCertificates = pgTable('welder_certificates', {
  id: serial('id').primaryKey(),
  welderId: integer('welder_id').notNull().references(() => welders.id, { onDelete: 'cascade' }),
  certificateNo: varchar('certificate_no', { length: 30 }).notNull(),
  certificateType: varchar('certificate_type', { length: 50 }).notNull(),
  description: text('description'),
  issueDate: date('issue_date').notNull(),
  expiryDate: date('expiry_date').notNull(),
  filePath: varchar('file_path', { length: 255 }).notNull(),
  fileUrl: varchar('file_url', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().default('Active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: integer('created_by').references(() => users.id),
});

// Inspection Reports table
export const inspectionReports = pgTable('inspection_reports', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectCode: text('project_code').notNull(),
  workOrderId: integer('work_order_id').references(() => workOrders.id, { onDelete: 'set null' }),
  
  // Report identification
  reportNumber: text('report_number').notNull().unique(),
  reportType: text('report_type').notNull(), // incoming, in-process, final, customer
  title: text('title').notNull(),
  
  // Inspection details
  inspectionDate: timestamp('inspection_date').notNull(),
  location: text('location').notNull(),
  inspectorId: integer('inspector_id').notNull().references(() => users.id),
  
  // Results
  status: text('status').notNull().default('pending'), // pending, passed, failed, conditionally_passed
  findings: text('findings'),
  recommendations: text('recommendations'),
  
  // Related items
  projectItemId: integer('project_item_id').references(() => projectItems.id, { onDelete: 'set null' }),
  batchNumber: text('batch_number'),
  quantityInspected: integer('quantity_inspected').notNull(),
  quantityAccepted: integer('quantity_accepted').notNull().default(0),
  quantityRejected: integer('quantity_rejected').notNull().default(0),
  
  // Document references
  referenceDocuments: text('reference_documents').array(),
  
  // Approvals
  approvedBy: integer('approved_by').references(() => users.id),
  approvedDate: timestamp('approved_date'),
  
  // Tracking
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Non-Conformance Reports (NCRs) table
export const nonConformanceReports = pgTable('non_conformance_reports', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectCode: text('project_code').notNull(),
  inspectionReportId: integer('inspection_report_id').references(() => inspectionReports.id, { onDelete: 'set null' }),
  
  // NCR identification
  ncrNumber: text('ncr_number').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  
  // Classification
  severity: text('severity').notNull(), // critical, major, minor
  category: text('category').notNull(), // dimensional, material, workmanship, documentation, other
  
  // Details
  identifiedDate: timestamp('identified_date').notNull(),
  identifiedBy: integer('identified_by').notNull().references(() => users.id),
  location: text('location'),
  
  // Related items
  projectItemId: integer('project_item_id').references(() => projectItems.id, { onDelete: 'set null' }),
  workOrderId: integer('work_order_id').references(() => workOrders.id, { onDelete: 'set null' }),
  batchNumber: text('batch_number'),
  plcLineId: integer('plc_line_id'), // FK to procurement_list_lines — nullable; added Phase 1
  grnRecordId: integer('grn_record_id'), // FK to plc_grn_records — nullable; added Phase 1
  quantityAffected: integer('quantity_affected').notNull(),
  
  // Resolution
  status: text('status').notNull().default('open'), // open, in_review, corrective_action, closed, waived
  disposition: text('disposition'), // rework, repair, use_as_is, scrap, return_to_vendor
  rootCause: text('root_cause'),
  correctiveAction: text('corrective_action'),
  preventiveAction: text('preventive_action'),
  
  // Approvals
  reviewedBy: integer('reviewed_by').references(() => users.id),
  reviewedDate: timestamp('reviewed_date'),
  approvedBy: integer('approved_by').references(() => users.id),
  approvedDate: timestamp('approved_date'),
  closedBy: integer('closed_by').references(() => users.id),
  closedDate: timestamp('closed_date'),
  
  // Tracking
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Quality Checklists table
export const qualityChecklists = pgTable('quality_checklists', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectCode: text('project_code').notNull(),
  
  // Checklist identification
  checklistNumber: text('checklist_number').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  
  // Scope and applicability
  checklistType: text('checklist_type').notNull(), // incoming, in-process, final, customer
  applicableItems: text('applicable_items').array(), // Array of item codes this checklist applies to
  
  // Version control
  version: text('version').notNull().default('1.0'),
  status: text('status').notNull().default('draft'), // draft, active, deprecated
  
  // Ownership
  preparedBy: integer('prepared_by').notNull().references(() => users.id),
  approvedBy: integer('approved_by').references(() => users.id),
  approvalDate: timestamp('approval_date'),
  
  // Tracking
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Checklist Items table (individual checks within a checklist)
export const checklistItems = pgTable('checklist_items', {
  id: serial('id').primaryKey(),
  checklistId: integer('checklist_id').notNull().references(() => qualityChecklists.id, { onDelete: 'cascade' }),
  
  // Check details
  sequenceNumber: integer('sequence_number').notNull(),
  description: text('description').notNull(),
  requirement: text('requirement').notNull(),
  acceptanceCriteria: text('acceptance_criteria').notNull(),
  inspectionMethod: text('inspection_method').notNull(), // visual, measurement, test, documentation
  
  // Configuration
  isCritical: boolean('is_critical').notNull().default(false),
  requiresEvidence: boolean('requires_evidence').notNull().default(false),
  referenceDocument: text('reference_document'),
  
  // Tracking
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Checklist Executions table (instances of completed checklists)
export const checklistExecutions = pgTable('checklist_executions', {
  id: serial('id').primaryKey(),
  checklistId: integer('checklist_id').notNull().references(() => qualityChecklists.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectCode: text('project_code').notNull(),
  workOrderId: integer('work_order_id').references(() => workOrders.id, { onDelete: 'set null' }),
  
  // Execution details
  executionDate: timestamp('execution_date').notNull(),
  executedBy: integer('executed_by').notNull().references(() => users.id),
  
  // Results
  status: text('status').notNull().default('in_progress'), // in_progress, completed, failed
  overallResult: text('overall_result'), // pass, fail, conditional_pass
  comments: text('comments'),
  
  // Related info
  batchNumber: text('batch_number'),
  referenceDocuments: text('reference_documents').array(),
  
  // Approvals
  verifiedBy: integer('verified_by').references(() => users.id),
  verifiedDate: timestamp('verified_date'),
  
  // Tracking
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Checklist Item Results table (results for individual checks in an execution)
export const checklistItemResults = pgTable('checklist_item_results', {
  id: serial('id').primaryKey(),
  executionId: integer('execution_id').notNull().references(() => checklistExecutions.id, { onDelete: 'cascade' }),
  checklistItemId: integer('checklist_item_id').notNull().references(() => checklistItems.id, { onDelete: 'cascade' }),
  
  // Result details
  result: text('result').notNull(), // pass, fail, n/a
  measuredValue: text('measured_value'),
  observation: text('observation'),
  
  // Evidence
  evidenceFilePath: text('evidence_file_path'),
  
  // Tracking
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

// Add DirectoryTemplate insert schema
export const insertDirectoryTemplateSchema = createInsertSchema(directoryTemplates, {
  department: z.string().min(1),
  subDirectory: z.string().optional(),
  isPublic: z.boolean().default(false),
});

// GCS directory types
export type GcsDirectory = typeof gcsDirectories.$inferSelect;
export type InsertGcsDirectory = z.infer<typeof insertGcsDirectorySchema>;

// Directory template types
export type DirectoryTemplate = typeof directoryTemplates.$inferSelect;
export type InsertDirectoryTemplate = z.infer<typeof insertDirectoryTemplateSchema>;

// ==================== PRODUCTION MANAGEMENT TYPES ====================
export const insertWorkOrderSchema = createInsertSchema(workOrders, {
  projectId: z.number().positive(),
  projectCode: z.string().min(1),
  workOrderNumber: z.string().min(1),
  title: z.string().min(1),
  plannedStartDate: z.date().or(z.string()),
  plannedEndDate: z.date().or(z.string()),
  supervisorId: z.number().positive(),
  quantity: z.number().positive().optional(),
});

export const insertWorkOrderItemSchema = createInsertSchema(workOrderItems, {
  workOrderId: z.number().positive(),
  projectItemId: z.number().positive(),
  quantity: z.number().positive(),
  sequenceNumber: z.number().positive(),
  status: z.string().optional(),
});

export const insertResourceAssignmentSchema = createInsertSchema(resourceAssignments, {
  workOrderId: z.number().positive(),
  userId: z.number().positive(),
  role: z.string().min(1),
  startDate: z.date().or(z.string()),
  endDate: z.date().or(z.string()).optional(),
  hoursAllocated: z.number().optional(),
});

export const insertProductionRecordSchema = createInsertSchema(productionRecords, {
  workOrderId: z.number().positive(),
  workOrderItemId: z.number().optional(),
  date: z.date().or(z.string()),
  shift: z.string().min(1),
  quantityProduced: z.number().positive(),
  quantityRejected: z.number().optional(),
  hoursWorked: z.number().positive(),
  recordedBy: z.number().positive(),
});

export const insertMaterialConsumptionSchema = createInsertSchema(materialConsumption, {
  workOrderId: z.number().positive(),
  componentItemId: z.number().positive(),
  quantityRequired: z.number().positive(),
  quantityConsumed: z.number().optional(),
  recordedBy: z.number().positive(),
});

export const insertMachineAllocationSchema = createInsertSchema(machineAllocations, {
  workOrderId: z.number().positive(),
  machineName: z.string().min(1),
  machineCode: z.string().optional(),
  startTime: z.date().or(z.string()),
  endTime: z.date().or(z.string()).optional(),
  setupTimeMinutes: z.number().optional(),
  downtimeMinutes: z.number().optional(),
});

export const insertTeamLeaderConfigSchema = createInsertSchema(teamLeaderConfig, {
  teamNumber: z.number().positive(),
  leaderName: z.string().min(1),
  updatedBy: z.number().positive().optional(),
});

// Production Management types
export type WorkOrder = typeof workOrders.$inferSelect;
export type InsertWorkOrder = z.infer<typeof insertWorkOrderSchema>;

export type WorkOrderItem = typeof workOrderItems.$inferSelect;
export type InsertWorkOrderItem = z.infer<typeof insertWorkOrderItemSchema>;

export type ResourceAssignment = typeof resourceAssignments.$inferSelect;
export type InsertResourceAssignment = z.infer<typeof insertResourceAssignmentSchema>;

// Work Order History schemas
export const insertWorkOrderHistorySchema = createInsertSchema(workOrderHistory).omit({ id: true });
export type WorkOrderHistory = typeof workOrderHistory.$inferSelect;
export type InsertWorkOrderHistory = z.infer<typeof insertWorkOrderHistorySchema>;

export type ProductionRecord = typeof productionRecords.$inferSelect;
export type InsertProductionRecord = z.infer<typeof insertProductionRecordSchema>;

export type MaterialConsumption = typeof materialConsumption.$inferSelect;
export type InsertMaterialConsumption = z.infer<typeof insertMaterialConsumptionSchema>;

export type MachineAllocation = typeof machineAllocations.$inferSelect;
export type InsertMachineAllocation = z.infer<typeof insertMachineAllocationSchema>;

export type TeamLeaderConfig = typeof teamLeaderConfig.$inferSelect;
export type InsertTeamLeaderConfig = z.infer<typeof insertTeamLeaderConfigSchema>;

// ==================== QUALITY MANAGEMENT TYPES ====================
export const insertInspectionReportSchema = createInsertSchema(inspectionReports, {
  projectId: z.number().positive(),
  projectCode: z.string().min(1),
  workOrderId: z.number().positive().optional(),
  reportNumber: z.string().min(1),
  reportType: z.string().min(1),
  title: z.string().min(1),
  inspectionDate: z.date().or(z.string()),
  location: z.string().min(1),
  inspectorId: z.number().positive(),
  quantityInspected: z.number().positive(),
  status: z.string().optional(),
});

export const insertNonConformanceReportSchema = createInsertSchema(nonConformanceReports, {
  projectId: z.number().positive(),
  projectCode: z.string().min(1),
  inspectionReportId: z.number().positive().optional(),
  ncrNumber: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  severity: z.string().min(1),
  category: z.string().min(1),
  identifiedDate: z.date().or(z.string()),
  identifiedBy: z.number().positive(),
  quantityAffected: z.number().positive(),
});

export const insertQualityChecklistSchema = createInsertSchema(qualityChecklists, {
  projectId: z.number().positive(),
  projectCode: z.string().min(1),
  checklistNumber: z.string().min(1),
  title: z.string().min(1),
  checklistType: z.string().min(1),
  preparedBy: z.number().positive(),
});

export const insertChecklistItemSchema = createInsertSchema(checklistItems, {
  checklistId: z.number().positive(),
  sequenceNumber: z.number().positive(),
  description: z.string().min(1),
  requirement: z.string().min(1),
  acceptanceCriteria: z.string().min(1),
  inspectionMethod: z.string().min(1),
  isCritical: z.boolean().optional(),
  requiresEvidence: z.boolean().optional(),
});

export const insertChecklistExecutionSchema = createInsertSchema(checklistExecutions, {
  checklistId: z.number().positive(),
  projectId: z.number().positive(),
  projectCode: z.string().min(1),
  workOrderId: z.number().positive().optional(),
  executionDate: z.date().or(z.string()),
  executedBy: z.number().positive(),
});

export const insertChecklistItemResultSchema = createInsertSchema(checklistItemResults, {
  executionId: z.number().positive(),
  checklistItemId: z.number().positive(),
  result: z.string().min(1),
  measuredValue: z.string().optional(),
  observation: z.string().optional(),
});

// Quality Management types
export type InspectionReport = typeof inspectionReports.$inferSelect;
export type InsertInspectionReport = z.infer<typeof insertInspectionReportSchema>;

export type NonConformanceReport = typeof nonConformanceReports.$inferSelect;
export type InsertNonConformanceReport = z.infer<typeof insertNonConformanceReportSchema>;

export type QualityChecklist = typeof qualityChecklists.$inferSelect;
export type InsertQualityChecklist = z.infer<typeof insertQualityChecklistSchema>;

export type ChecklistItem = typeof checklistItems.$inferSelect;
export type InsertChecklistItem = z.infer<typeof insertChecklistItemSchema>;

export type ChecklistExecution = typeof checklistExecutions.$inferSelect;
export type InsertChecklistExecution = z.infer<typeof insertChecklistExecutionSchema>;

export type ChecklistItemResult = typeof checklistItemResults.$inferSelect;
export type InsertChecklistItemResult = z.infer<typeof insertChecklistItemResultSchema>;

// Dispatch & Shipping types
export type DispatchRecord = typeof dispatchRecords.$inferSelect;
export type InsertDispatchRecord = z.infer<typeof insertDispatchRecordSchema>;

export type DispatchItem = typeof dispatchItems.$inferSelect;
export type InsertDispatchItem = z.infer<typeof insertDispatchItemSchema>;

export type DispatchDocument = typeof dispatchDocuments.$inferSelect;
export type InsertDispatchDocument = z.infer<typeof insertDispatchDocumentSchema>;

export type Transporter = typeof transporters.$inferSelect;
export type InsertTransporter = z.infer<typeof insertTransporterSchema>;

// After-Sales Module Types
export const serviceRequests = pgTable('service_requests', {
  id: serial('id').primaryKey(),
  customer_id: integer('customer_id').notNull().references(() => customers.id),
  project_id: integer('project_id').references(() => projects.id),
  request_type: text('request_type').notNull(),
  subject: text('subject').notNull(),
  description: text('description'),
  priority: text('priority').notNull().default('Medium'),
  status: text('status').notNull().default('New'),
  created_by: integer('created_by').notNull().references(() => users.id),
  assigned_to: integer('assigned_to').references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const serviceActivities = pgTable('service_activities', {
  id: serial('id').primaryKey(),
  service_request_id: integer('service_request_id').notNull().references(() => serviceRequests.id),
  activity_type: text('activity_type').notNull(),
  scheduled_date: date('scheduled_date'),
  actual_date: date('actual_date'),
  description: text('description'),
  outcome: text('outcome'),
  status: text('status').notNull().default('Scheduled'),
  performed_by: integer('performed_by').references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const serviceParts = pgTable('service_parts', {
  id: serial('id').primaryKey(),
  service_activity_id: integer('service_activity_id').notNull().references(() => serviceActivities.id),
  item_id: integer('item_id').notNull().references(() => masterItems.id),
  quantity: integer('quantity').notNull(),
  unit_price: decimal('unit_price', { precision: 10, scale: 2 }),
  is_billable: boolean('is_billable').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const customerFollowups = pgTable('customer_followups', {
  id: serial('id').primaryKey(),
  customer_id: integer('customer_id').notNull().references(() => customers.id),
  followup_type: text('followup_type').notNull(),
  subject: text('subject').notNull(),
  description: text('description'),
  scheduled_date: date('scheduled_date').notNull(),
  completed_date: date('completed_date'),
  outcome: text('outcome'),
  status: text('status').notNull().default('Scheduled'),
  created_by: integer('created_by').notNull().references(() => users.id),
  assigned_to: integer('assigned_to').notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const businessOpportunities = pgTable('business_opportunities', {
  id: serial('id').primaryKey(),
  customer_id: integer('customer_id').notNull().references(() => customers.id),
  opportunity_name: text('opportunity_name').notNull(),
  description: text('description'),
  estimated_value: decimal('estimated_value', { precision: 12, scale: 2 }),
  probability: integer('probability').notNull().default(0),
  status: text('status').notNull().default('New'),
  expected_close_date: date('expected_close_date'),
  actual_close_date: date('actual_close_date'),
  outcome: text('outcome'),
  created_by: integer('created_by').notNull().references(() => users.id),
  assigned_to: integer('assigned_to').notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const serviceContracts = pgTable('service_contracts', {
  id: serial('id').primaryKey(),
  customer_id: integer('customer_id').notNull().references(() => customers.id),
  project_id: integer('project_id').references(() => projects.id),
  contract_number: text('contract_number').notNull().unique(),
  description: text('description'),
  start_date: date('start_date').notNull(),
  end_date: date('end_date').notNull(),
  contract_value: decimal('contract_value', { precision: 12, scale: 2 }).notNull(),
  status: text('status').notNull().default('Active'),
  created_by: integer('created_by').notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const contractServices = pgTable('contract_services', {
  id: serial('id').primaryKey(),
  contract_id: integer('contract_id').notNull().references(() => serviceContracts.id),
  service_type: text('service_type').notNull(),
  frequency: text('frequency'),
  description: text('description'),
  quantity: integer('quantity').notNull(),
  unit_price: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const contractDeliveries = pgTable('contract_deliveries', {
  id: serial('id').primaryKey(),
  contract_id: integer('contract_id').notNull().references(() => serviceContracts.id),
  service_id: integer('service_id').notNull().references(() => contractServices.id),
  scheduled_date: date('scheduled_date').notNull(),
  actual_date: date('actual_date'),
  status: text('status').notNull().default('Scheduled'),
  notes: text('notes'),
  performed_by: integer('performed_by').references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// After-Sales Module Schema Definitions
export const insertServiceRequestSchema = createInsertSchema(serviceRequests, {
  description: z.string().optional(),
  assigned_to: z.number().optional()
});

export const insertServiceActivitySchema = createInsertSchema(serviceActivities, {
  description: z.string().optional(),
  outcome: z.string().optional(),
  scheduled_date: z.string().optional().transform(dateStringToDate),
  actual_date: z.string().optional().transform(dateStringToDate),
  performed_by: z.number().optional()
});

export const insertServicePartSchema = createInsertSchema(serviceParts, {
  unit_price: z.string().optional().transform((val) => val ? parseFloat(val) : null)
});

export const insertCustomerFollowupSchema = createInsertSchema(customerFollowups, {
  description: z.string().optional(),
  outcome: z.string().optional(),
  scheduled_date: z.string().transform(dateStringToDate),
  completed_date: z.string().optional().transform(dateStringToDate)
});

export const insertBusinessOpportunitySchema = createInsertSchema(businessOpportunities, {
  description: z.string().optional(),
  estimated_value: z.string().optional().transform((val) => val ? parseFloat(val) : null),
  expected_close_date: z.string().optional().transform(dateStringToDate),
  actual_close_date: z.string().optional().transform(dateStringToDate),
  outcome: z.string().optional()
});

export const insertServiceContractSchema = createInsertSchema(serviceContracts, {
  description: z.string().optional(),
  start_date: z.string().transform(dateStringToDate),
  end_date: z.string().transform(dateStringToDate),
  contract_value: z.string().transform((val) => parseFloat(val))
});

export const insertContractServiceSchema = createInsertSchema(contractServices, {
  description: z.string().optional(),
  frequency: z.string().optional(),
  unit_price: z.string().transform((val) => parseFloat(val))
});

export const insertContractDeliverySchema = createInsertSchema(contractDeliveries, {
  notes: z.string().optional(),
  scheduled_date: z.string().transform(dateStringToDate),
  actual_date: z.string().optional().transform(dateStringToDate),
  performed_by: z.number().optional()
});

// After-Sales Module Type Definitions
export type ServiceRequest = typeof serviceRequests.$inferSelect;
export type InsertServiceRequest = z.infer<typeof insertServiceRequestSchema>;

export type ServiceActivity = typeof serviceActivities.$inferSelect;
export type InsertServiceActivity = z.infer<typeof insertServiceActivitySchema>;

export type ServicePart = typeof serviceParts.$inferSelect;
export type InsertServicePart = z.infer<typeof insertServicePartSchema>;

export type CustomerFollowup = typeof customerFollowups.$inferSelect;
export type InsertCustomerFollowup = z.infer<typeof insertCustomerFollowupSchema>;

export type BusinessOpportunity = typeof businessOpportunities.$inferSelect;
export type InsertBusinessOpportunity = z.infer<typeof insertBusinessOpportunitySchema>;

export type ServiceContract = typeof serviceContracts.$inferSelect;
export type InsertServiceContract = z.infer<typeof insertServiceContractSchema>;

export type ContractService = typeof contractServices.$inferSelect;
export type InsertContractService = z.infer<typeof insertContractServiceSchema>;

export type ContractDelivery = typeof contractDeliveries.$inferSelect;
export type InsertContractDelivery = z.infer<typeof insertContractDeliverySchema>;

// Define relations between tables
export const dispatchRecordsRelations = relations(dispatchRecords, ({ one }) => ({
  project: one(projects, {
    fields: [dispatchRecords.project_id],
    references: [projects.id],
  }),
}));

export const dispatchItemsRelations = relations(dispatchItems, ({ one }) => ({
  dispatchRecord: one(dispatchRecords, {
    fields: [dispatchItems.dispatch_id],
    references: [dispatchRecords.id],
  }),
}));

// After-Sales Module Relations
export const serviceRequestsRelations = relations(serviceRequests, ({ one, many }) => ({
  customer: one(customers, {
    fields: [serviceRequests.customer_id],
    references: [customers.id],
  }),
  project: one(projects, {
    fields: [serviceRequests.project_id],
    references: [projects.id],
  }),
  createdBy: one(users, {
    fields: [serviceRequests.created_by],
    references: [users.id],
  }),
  assignedTo: one(users, {
    fields: [serviceRequests.assigned_to],
    references: [users.id],
  }),
  activities: many(serviceActivities),
}));

export const serviceActivitiesRelations = relations(serviceActivities, ({ one, many }) => ({
  serviceRequest: one(serviceRequests, {
    fields: [serviceActivities.service_request_id],
    references: [serviceRequests.id],
  }),
  performedBy: one(users, {
    fields: [serviceActivities.performed_by],
    references: [users.id],
  }),
  parts: many(serviceParts),
}));

export const servicePartsRelations = relations(serviceParts, ({ one }) => ({
  activity: one(serviceActivities, {
    fields: [serviceParts.service_activity_id],
    references: [serviceActivities.id],
  }),
  item: one(masterItems, {
    fields: [serviceParts.item_id],
    references: [masterItems.id],
  }),
}));

export const customerFollowupsRelations = relations(customerFollowups, ({ one }) => ({
  customer: one(customers, {
    fields: [customerFollowups.customer_id],
    references: [customers.id],
  }),
  createdBy: one(users, {
    fields: [customerFollowups.created_by],
    references: [users.id],
  }),
  assignedTo: one(users, {
    fields: [customerFollowups.assigned_to],
    references: [users.id],
  }),
}));

export const businessOpportunitiesRelations = relations(businessOpportunities, ({ one }) => ({
  customer: one(customers, {
    fields: [businessOpportunities.customer_id],
    references: [customers.id],
  }),
  createdBy: one(users, {
    fields: [businessOpportunities.created_by],
    references: [users.id],
  }),
  assignedTo: one(users, {
    fields: [businessOpportunities.assigned_to],
    references: [users.id],
  }),
}));

export const serviceContractsRelations = relations(serviceContracts, ({ one, many }) => ({
  customer: one(customers, {
    fields: [serviceContracts.customer_id],
    references: [customers.id],
  }),
  project: one(projects, {
    fields: [serviceContracts.project_id],
    references: [projects.id],
  }),
  createdBy: one(users, {
    fields: [serviceContracts.created_by],
    references: [users.id],
  }),
  services: many(contractServices),
  deliveries: many(contractDeliveries),
}));

export const contractServicesRelations = relations(contractServices, ({ one }) => ({
  contract: one(serviceContracts, {
    fields: [contractServices.contract_id],
    references: [serviceContracts.id],
  }),
}));

export const contractDeliveriesRelations = relations(contractDeliveries, ({ one }) => ({
  contract: one(serviceContracts, {
    fields: [contractDeliveries.contract_id],
    references: [serviceContracts.id],
  }),
  service: one(contractServices, {
    fields: [contractDeliveries.service_id],
    references: [contractServices.id],
  }),
  performedBy: one(users, {
    fields: [contractDeliveries.performed_by],
    references: [users.id],
  }),
}));

// ==================== QUALITY MANAGEMENT - QAP GENERATION ====================

// QAP Templates
export const qapTemplates = pgTable('qap_templates', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  content: text('content').notNull(), // HTML/JSON template content
  version: varchar('version', { length: 50 }).notNull(),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Generated QAPs
export const generatedQaps = pgTable('generated_qaps', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  templateId: integer('template_id').notNull().references(() => qapTemplates.id, { onDelete: 'restrict' }),
  title: varchar('title', { length: 255 }).notNull(),
  clientName: varchar('client_name', { length: 255 }).notNull(),
  equipmentType: varchar('equipment_type', { length: 255 }).notNull(),
  standards: text('standards'), // Could be comma-separated list or JSON array
  revision: varchar('revision', { length: 50 }).notNull().default('0'),
  preparedBy: integer('prepared_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  approvedBy: integer('approved_by').references(() => users.id, { onDelete: 'restrict' }),
  itpReferences: text('itp_references'), // Optional references to ITPs
  content: text('content').notNull(), // The filled template content
  status: varchar('status', { length: 50 }).notNull().default('draft'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// QAP Versions (History)
export const qapVersions = pgTable('qap_versions', {
  id: serial('id').primaryKey(),
  qapId: integer('qap_id').notNull().references(() => generatedQaps.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  content: text('content').notNull(),
  revision: varchar('revision', { length: 50 }).notNull(),
  createdBy: integer('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Define relationships
export const qapTemplatesRelations = relations(qapTemplates, ({ one, many }) => ({
  creator: one(users, {
    fields: [qapTemplates.createdBy],
    references: [users.id],
  }),
  generatedQaps: many(generatedQaps),
}));

export const generatedQapsRelations = relations(generatedQaps, ({ one, many }) => ({
  project: one(projects, {
    fields: [generatedQaps.projectId],
    references: [projects.id],
  }),
  template: one(qapTemplates, {
    fields: [generatedQaps.templateId],
    references: [qapTemplates.id],
  }),
  preparedByUser: one(users, {
    fields: [generatedQaps.preparedBy],
    references: [users.id],
  }),
  approvedByUser: one(users, {
    fields: [generatedQaps.approvedBy],
    references: [users.id],
  }),
  versions: many(qapVersions),
  itps: many(itps), // Adding relation to ITPs
}));

export const qapVersionsRelations = relations(qapVersions, ({ one }) => ({
  qap: one(generatedQaps, {
    fields: [qapVersions.qapId],
    references: [generatedQaps.id],
  }),
  createdByUser: one(users, {
    fields: [qapVersions.createdBy],
    references: [users.id],
  }),
}));

// Create Zod schemas for data validation
export const insertQapTemplateSchema = createInsertSchema(qapTemplates)
  .omit({ id: true, createdAt: true, updatedAt: true });

export const insertGeneratedQapSchema = createInsertSchema(generatedQaps)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    standards: z.string().optional(),
    itpReferences: z.string().optional(),
    approvedBy: z.number().optional(),
  });

export const insertQapVersionSchema = createInsertSchema(qapVersions)
  .omit({ id: true, createdAt: true });

// Export types
export type QapTemplate = typeof qapTemplates.$inferSelect;
export type InsertQapTemplate = z.infer<typeof insertQapTemplateSchema>;

export type GeneratedQap = typeof generatedQaps.$inferSelect;
export type InsertGeneratedQap = z.infer<typeof insertGeneratedQapSchema>;

export type QapVersion = typeof qapVersions.$inferSelect;
export type InsertQapVersion = z.infer<typeof insertQapVersionSchema>;

// ==================== QUALITY MANAGEMENT - ITP GENERATION ====================

// ITP Templates
export const itpTemplates = pgTable('itp_templates', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  content: text('content').notNull(), // HTML/JSON template content
  placeholders: jsonb('placeholders'), // Available placeholders in template
  version: varchar('version', { length: 50 }).notNull(),
  category: varchar('category', { length: 100 }),
  tags: text('tags').array(),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ITPs (Inspection Test Plans)
export const itps = pgTable('itps', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  qapId: integer('qap_id').references(() => generatedQaps.id, { onDelete: 'cascade' }),
  templateId: integer('template_id').references(() => itpTemplates.id), // Added field for template reference
  equipmentName: varchar('equipment_name', { length: 255 }).notNull(),
  drawingNumber: varchar('drawing_number', { length: 255 }),
  revision: varchar('revision', { length: 50 }).notNull().default('A'),
  version: integer('version').notNull().default(1),
  status: varchar('status', { length: 50 }).notNull().default('draft'),
  notifiedBody: varchar('notified_body', { length: 255 }),
  hazardLevel: varchar('hazard_level', { length: 50 }),
  preparedBy: integer('prepared_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  approvedBy: integer('approved_by').references(() => users.id, { onDelete: 'restrict' }),
  content: jsonb('content').notNull(), // The filled template content in JSON format
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ITP Versions (History)
export const itpVersions = pgTable('itp_versions', {
  id: serial('id').primaryKey(),
  itpId: integer('itp_id').notNull().references(() => itps.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  revision: varchar('revision', { length: 50 }).notNull(),
  content: jsonb('content').notNull(),
  createdBy: integer('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ITP Activities
export const itpActivities = pgTable('itp_activities', {
  id: serial('id').primaryKey(),
  itpId: integer('itp_id').notNull().references(() => itps.id, { onDelete: 'cascade' }),
  sequenceNumber: integer('sequence_number').notNull(),
  activityName: varchar('activity_name', { length: 255 }).notNull(),
  characteristics: varchar('characteristics', { length: 255 }),
  referenceDocuments: text('reference_documents'),
  acceptanceCriteria: text('acceptance_criteria'),
  recordFormat: varchar('record_format', { length: 255 }),
  inspectionBy: jsonb('inspection_by'), // Stores who needs to inspect (Manufacturer, Third-party, etc.)
  remarks: text('remarks'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Define relationships
export const itpTemplatesRelations = relations(itpTemplates, ({ one, many }) => ({
  creator: one(users, {
    fields: [itpTemplates.createdBy],
    references: [users.id],
  }),
  itps: many(itps),
}));

export const itpsRelations = relations(itps, ({ one, many }) => ({
  project: one(projects, {
    fields: [itps.projectId],
    references: [projects.id],
  }),
  qap: one(generatedQaps, {
    fields: [itps.qapId],
    references: [generatedQaps.id],
  }),
  template: one(itpTemplates, {
    fields: [itps.templateId],
    references: [itpTemplates.id],
  }),
  preparedByUser: one(users, {
    fields: [itps.preparedBy],
    references: [users.id],
  }),
  approvedByUser: one(users, {
    fields: [itps.approvedBy],
    references: [users.id],
  }),
  versions: many(itpVersions),
  activities: many(itpActivities),
}));

export const itpVersionsRelations = relations(itpVersions, ({ one }) => ({
  itp: one(itps, {
    fields: [itpVersions.itpId],
    references: [itps.id],
  }),
  createdByUser: one(users, {
    fields: [itpVersions.createdBy],
    references: [users.id],
  }),
}));

export const itpActivitiesRelations = relations(itpActivities, ({ one }) => ({
  itp: one(itps, {
    fields: [itpActivities.itpId],
    references: [itps.id],
  }),
}));

// Note: We update the existing QAP relations by searching for it and updating it
// instead of redefining it.

// Create Zod schemas for data validation
export const insertItpTemplateSchema = createInsertSchema(itpTemplates)
  .omit({ id: true, createdAt: true, updatedAt: true });

export const insertItpSchema = createInsertSchema(itps)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    templateId: z.number().optional(),
    approvedBy: z.number().optional(),
    notifiedBody: z.string().optional(),
    hazardLevel: z.string().optional(),
    drawingNumber: z.string().optional(),
  });

export const insertItpVersionSchema = createInsertSchema(itpVersions)
  .omit({ id: true, createdAt: true });

export const insertItpActivitySchema = createInsertSchema(itpActivities)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    characteristics: z.string().optional(),
    referenceDocuments: z.string().optional(),
    acceptanceCriteria: z.string().optional(),
    recordFormat: z.string().optional(),
    inspectionBy: z.any().optional(),
    remarks: z.string().optional(),
  });

// Export types
export type ItpTemplate = typeof itpTemplates.$inferSelect;
export type InsertItpTemplate = z.infer<typeof insertItpTemplateSchema>;

// ==================== VISA MANAGEMENT ====================

// Visa Status
export const visaStatuses = [
  "Active",
  "Expiring Soon", 
  "Expired",
  "Cancelled"
] as const;

export type VisaStatus = typeof visaStatuses[number];

// Visa Types
export const visaTypes = [
  "B1/B2 Business/Tourist",
  "Standard Visitor",
  "Schengen Business",
  "Business Visa",
  "Business Visitor", 
  "Temporary Resident",
  "Work Visa",
  "Tourist Visa",
  "Transit Visa"
] as const;

export type VisaType = typeof visaTypes[number];

// Alert Types
export const alertTypes = [
  "60_days",
  "30_days",
  "7_days"
] as const;

export type AlertType = typeof alertTypes[number];

// Visa Records table
export const visaRecords = pgTable('visa_records', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  visaType: varchar('visa_type', { length: 100 }).notNull(),
  country: varchar('country', { length: 100 }).notNull(),
  visaNumber: varchar('visa_number', { length: 100 }).notNull().unique(),
  issueDate: date('issue_date').notNull(),
  expiryDate: date('expiry_date').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('Active'),
  quotaReference: varchar('quota_reference', { length: 100 }),
  filePath: text('file_path'),
  fileUrl: text('file_url'),
  notes: text('notes'),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Visa Alerts table
export const visaAlerts = pgTable('visa_alerts', {
  id: serial('id').primaryKey(),
  visaRecordId: integer('visa_record_id').notNull().references(() => visaRecords.id, { onDelete: 'cascade' }),
  alertType: varchar('alert_type', { length: 20 }).notNull(),
  alertDate: date('alert_date').notNull(),
  isSent: boolean('is_sent').notNull().default(false),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

// Visa Quota Settings table
export const visaQuotaSettings = pgTable('visa_quota_settings', {
  id: serial('id').primaryKey(),
  country: varchar('country', { length: 100 }).notNull().unique(),
  visaType: varchar('visa_type', { length: 100 }).notNull(),
  totalQuota: integer('total_quota').notNull().default(0),
  usedQuota: integer('used_quota').notNull().default(0),
  financialYear: varchar('financial_year', { length: 10 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Visa Records Relations
export const visaRecordsRelations = relations(visaRecords, ({ one, many }) => ({
  employee: one(users, {
    fields: [visaRecords.employeeId],
    references: [users.id],
  }),
  createdByUser: one(users, {
    fields: [visaRecords.createdBy],
    references: [users.id],
  }),
  alerts: many(visaAlerts),
}));

export const visaAlertsRelations = relations(visaAlerts, ({ one }) => ({
  visaRecord: one(visaRecords, {
    fields: [visaAlerts.visaRecordId],
    references: [visaRecords.id],
  }),
}));

// Visa Management Zod Schemas
export const insertVisaRecordSchema = createInsertSchema(visaRecords)
  .omit({ id: true, createdAt: true, updatedAt: true, status: true, createdBy: true })
  .extend({
    employeeId: z.coerce.number().min(1, "Please select an employee"),
    visaType: z.string().min(1, "Please select a visa type"),
    country: z.string().min(1, "Please select a country"),
    visaNumber: z.string().min(1, "Visa number is required"),
    issueDate: z.string().min(1, "Issue date is required"),
    expiryDate: z.string().min(1, "Expiry date is required"),
    filePath: z.string().optional(),
    fileUrl: z.string().optional(),
    notes: z.string().optional(),
    quotaReference: z.string().optional(),
  });

export const insertVisaAlertSchema = createInsertSchema(visaAlerts)
  .omit({ id: true, createdAt: true });

export const insertVisaQuotaSettingSchema = createInsertSchema(visaQuotaSettings)
  .omit({ id: true, createdAt: true, updatedAt: true });

// Visa Management Types
export type VisaRecord = typeof visaRecords.$inferSelect;
export type InsertVisaRecord = z.infer<typeof insertVisaRecordSchema>;
export type VisaAlert = typeof visaAlerts.$inferSelect;
export type InsertVisaAlert = z.infer<typeof insertVisaAlertSchema>;
export type VisaQuotaSetting = typeof visaQuotaSettings.$inferSelect;
export type InsertVisaQuotaSetting = z.infer<typeof insertVisaQuotaSettingSchema>;

// ==================== SCHENGEN TRAVEL TRACKING ====================

// Schengen Countries
export const schengenCountries = [
  "Austria", "Belgium", "Croatia", "Czech Republic", "Denmark", "Estonia",
  "Finland", "France", "Germany", "Greece", "Hungary", "Iceland", "Italy",
  "Latvia", "Liechtenstein", "Lithuania", "Luxembourg", "Malta", "Netherlands",
  "Norway", "Poland", "Portugal", "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland"
] as const;

export type SchengenCountry = typeof schengenCountries[number];

// Alert Types for Schengen
export const schengenAlertTypes = [
  "warning_60", // 60 days used
  "warning_80", // 80 days used
  "exceeded_90"  // Over 90 days
] as const;

export type SchengenAlertType = typeof schengenAlertTypes[number];

// Schengen Travel Log table
export const schengenTravelLog = pgTable('schengen_travel_log', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  country: varchar('country', { length: 100 }).notNull(),
  entryDate: date('entry_date').notNull(),
  exitDate: date('exit_date'),
  purpose: varchar('purpose', { length: 200 }),
  notes: text('notes'),
  isBusinessTrip: boolean('is_business_trip').notNull().default(false),
  source: varchar('source', { length: 100 }).default('Manual Entry'), // Track entry source
  businessTripId: integer('business_trip_id').references(() => businessTrips.id, { onDelete: 'set null' }), // Link to business trip
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Schengen Alerts table
export const schengenAlerts = pgTable('schengen_alerts', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  alertType: varchar('alert_type', { length: 50 }).notNull(),
  daysUsed: integer('days_used').notNull(),
  calculationDate: date('calculation_date').notNull(),
  isAcknowledged: boolean('is_acknowledged').notNull().default(false),
  acknowledgedBy: integer('acknowledged_by').references(() => users.id),
  acknowledgedAt: timestamp('acknowledged_at'),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

// Schengen Relations
export const schengenTravelLogRelations = relations(schengenTravelLog, ({ one }) => ({
  employee: one(users, {
    fields: [schengenTravelLog.employeeId],
    references: [users.id],
  }),
  createdByUser: one(users, {
    fields: [schengenTravelLog.createdBy],
    references: [users.id],
  }),
}));

export const schengenAlertsRelations = relations(schengenAlerts, ({ one }) => ({
  employee: one(users, {
    fields: [schengenAlerts.employeeId],
    references: [users.id],
  }),
  acknowledgedByUser: one(users, {
    fields: [schengenAlerts.acknowledgedBy],
    references: [users.id],
  }),
}));

// Schengen Zod Schemas
export const insertSchengenTravelLogSchema = createInsertSchema(schengenTravelLog)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    entryDate: z.string().transform(dateStringToDate),
    exitDate: z.string().optional().transform(dateStringToDate),
    purpose: z.string().optional(),
    notes: z.string().optional(),
    source: z.string().optional(),
    businessTripId: z.number().optional(),
  });

export const insertSchengenAlertSchema = createInsertSchema(schengenAlerts)
  .omit({ id: true, createdAt: true });

// Schengen Types
export type SchengenTravelLog = typeof schengenTravelLog.$inferSelect;
export type InsertSchengenTravelLog = z.infer<typeof insertSchengenTravelLogSchema>;
export type SchengenAlert = typeof schengenAlerts.$inferSelect;
export type InsertSchengenAlert = z.infer<typeof insertSchengenAlertSchema>;

// ==================== BUSINESS TRIP MANAGEMENT ====================

// Business Trip Status
export const tripStatuses = [
  "draft",
  "submitted", 
  "manager_approved",
  "final_approved",
  "rejected",
  "concluded"
] as const;

export type TripStatus = typeof tripStatuses[number];

// Approval Types
export const approvalTypes = [
  "manager",
  "admin", 
  "finance"
] as const;

export type ApprovalType = typeof approvalTypes[number];

// Approval Status
export const approvalStatuses = [
  "pending",
  "approved",
  "rejected"
] as const;

export type ApprovalStatus = typeof approvalStatuses[number];

// Booking Types
export const bookingTypes = [
  "flight",
  "hotel",
  "transport",
  "visa"
] as const;

export type BookingType = typeof bookingTypes[number];

// Expense Categories
export const expenseCategories = [
  "travel",
  "meals",
  "stay",
  "misc"
] as const;

export type ExpenseCategory = typeof expenseCategories[number];

// Reimbursement Status
export const reimbursementStatuses = [
  "pending",
  "approved",
  "processed",
  "settled"
] as const;

export type ReimbursementStatus = typeof reimbursementStatuses[number];

// Main business trips table
export const businessTrips = pgTable('business_trips', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull().references(() => users.id),
  tripTitle: varchar('trip_title', { length: 255 }).notNull(),
  purpose: text('purpose').notNull(),
  destination: varchar('destination', { length: 255 }).notNull(),
  fromDate: date('from_date').notNull(),
  toDate: date('to_date').notNull(),
  estimatedTravelCost: decimal('estimated_travel_cost', { precision: 10, scale: 2 }).default('0'),
  estimatedAccommodationCost: decimal('estimated_accommodation_cost', { precision: 10, scale: 2 }).default('0'),
  estimatedMiscCost: decimal('estimated_misc_cost', { precision: 10, scale: 2 }).default('0'),
  advanceRequested: decimal('advance_requested', { precision: 10, scale: 2 }).default('0'),
  supportingDocumentUrl: text('supporting_document_url'),
  status: varchar('status', { length: 50 }).notNull().default('draft'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Trip approvals table (for workflow tracking)
export const tripApprovals = pgTable('trip_approvals', {
  id: serial('id').primaryKey(),
  tripId: integer('trip_id').notNull().references(() => businessTrips.id, { onDelete: 'cascade' }),
  approverId: integer('approver_id').notNull().references(() => users.id),
  approvalType: varchar('approval_type', { length: 50 }).notNull(),
  status: varchar('status', { length: 50 }).notNull(),
  comments: text('comments'),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

// Trip bookings table (admin managed)
export const tripBookings = pgTable('trip_bookings', {
  id: serial('id').primaryKey(),
  tripId: integer('trip_id').notNull().references(() => businessTrips.id, { onDelete: 'cascade' }),
  bookingType: varchar('booking_type', { length: 50 }).notNull(),
  bookingDetails: text('booking_details'),
  pnrReference: varchar('pnr_reference', { length: 255 }),
  hotelName: varchar('hotel_name', { length: 255 }),
  visaStatus: varchar('visa_status', { length: 100 }),
  bookingDocumentUrl: text('booking_document_url'),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Trip expenses table (employee submitted post-trip)
export const tripExpenses = pgTable('trip_expenses', {
  id: serial('id').primaryKey(),
  tripId: integer('trip_id').notNull().references(() => businessTrips.id, { onDelete: 'cascade' }),
  category: varchar('category', { length: 50 }).notNull(),
  description: text('description'),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  receiptUrl: text('receipt_url'),
  expenseDate: date('expense_date').notNull(),
  submittedBy: integer('submitted_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

// Trip reimbursements table (finance processed)
export const tripReimbursements = pgTable('trip_reimbursements', {
  id: serial('id').primaryKey(),
  tripId: integer('trip_id').notNull().references(() => businessTrips.id, { onDelete: 'cascade' }),
  totalExpenses: decimal('total_expenses', { precision: 10, scale: 2 }).notNull(),
  advanceGiven: decimal('advance_given', { precision: 10, scale: 2 }).default('0'),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  processedBy: integer('processed_by').references(() => users.id),
  processedAt: timestamp('processed_at'),
  paymentReference: varchar('payment_reference', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

// Business Trip Relations
export const businessTripsRelations = relations(businessTrips, ({ one, many }) => ({
  employee: one(users, {
    fields: [businessTrips.employeeId],
    references: [users.id],
  }),
  approvals: many(tripApprovals),
  bookings: many(tripBookings),
  expenses: many(tripExpenses),
  reimbursement: one(tripReimbursements),
}));

export const tripApprovalsRelations = relations(tripApprovals, ({ one }) => ({
  trip: one(businessTrips, {
    fields: [tripApprovals.tripId],
    references: [businessTrips.id],
  }),
  approver: one(users, {
    fields: [tripApprovals.approverId],
    references: [users.id],
  }),
}));

export const tripBookingsRelations = relations(tripBookings, ({ one }) => ({
  trip: one(businessTrips, {
    fields: [tripBookings.tripId],
    references: [businessTrips.id],
  }),
  createdByUser: one(users, {
    fields: [tripBookings.createdBy],
    references: [users.id],
  }),
}));

export const tripExpensesRelations = relations(tripExpenses, ({ one }) => ({
  trip: one(businessTrips, {
    fields: [tripExpenses.tripId],
    references: [businessTrips.id],
  }),
  submittedByUser: one(users, {
    fields: [tripExpenses.submittedBy],
    references: [users.id],
  }),
}));

export const tripReimbursementsRelations = relations(tripReimbursements, ({ one }) => ({
  trip: one(businessTrips, {
    fields: [tripReimbursements.tripId],
    references: [businessTrips.id],
  }),
  processedByUser: one(users, {
    fields: [tripReimbursements.processedBy],
    references: [users.id],
  }),
}));

// Business Trip Zod Schemas
export const insertBusinessTripSchema = createInsertSchema(businessTrips)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    supportingDocumentUrl: z.string().optional(),
  });

export const insertTripApprovalSchema = createInsertSchema(tripApprovals)
  .omit({ id: true, createdAt: true })
  .extend({
    comments: z.string().optional(),
    approvedAt: z.date().optional(),
  });

export const insertTripBookingSchema = createInsertSchema(tripBookings)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    bookingDetails: z.string().optional(),
    pnrReference: z.string().optional(),
    hotelName: z.string().optional(),
    visaStatus: z.string().optional(),
    bookingDocumentUrl: z.string().optional(),
  });

export const insertTripExpenseSchema = createInsertSchema(tripExpenses)
  .omit({ id: true, createdAt: true })
  .extend({
    description: z.string().optional(),
    receiptUrl: z.string().optional(),
  });

export const insertTripReimbursementSchema = createInsertSchema(tripReimbursements)
  .omit({ id: true, createdAt: true })
  .extend({
    processedBy: z.number().optional(),
    processedAt: z.date().optional(),
    paymentReference: z.string().optional(),
  });

// Business Trip Types
export type BusinessTrip = typeof businessTrips.$inferSelect;
export type InsertBusinessTrip = z.infer<typeof insertBusinessTripSchema>;

export type TripApproval = typeof tripApprovals.$inferSelect;
export type InsertTripApproval = z.infer<typeof insertTripApprovalSchema>;

export type TripBooking = typeof tripBookings.$inferSelect;
export type InsertTripBooking = z.infer<typeof insertTripBookingSchema>;

export type TripExpense = typeof tripExpenses.$inferSelect;
export type InsertTripExpense = z.infer<typeof insertTripExpenseSchema>;

export type TripReimbursement = typeof tripReimbursements.$inferSelect;
export type InsertTripReimbursement = z.infer<typeof insertTripReimbursementSchema>;

// Trip documents table for file uploads
export const tripDocuments = pgTable('trip_documents', {
  id: serial('id').primaryKey(),
  tripId: integer('trip_id').notNull().references(() => businessTrips.id, { onDelete: 'cascade' }),
  documentType: varchar('document_type', { length: 100 }).notNull(),
  documentName: varchar('document_name', { length: 500 }).notNull(),
  filePath: text('file_path').notNull(), // GCS path: Business_Trips/{BusinessYear}/{EmployeeName}/{Destination}/{FromDate}/{DocumentType}/filename
  fileUrl: text('file_url'), // Signed URL for access
  fileSize: integer('file_size'), // File size in bytes
  fileType: varchar('file_type', { length: 100 }), // MIME type
  description: text('description'),
  uploadedBy: integer('uploaded_by').notNull().references(() => users.id),
  uploadedAt: timestamp('uploaded_at').notNull().defaultNow(),
  isActive: boolean('is_active').notNull().default(true), // For soft delete
});

// Document Types
export const documentTypes = [
  "travel_booking",
  "hotel_confirmation", 
  "meeting_invitation",
  "visa_documents",
  "advance_payment_request",
  "correspondence",
  "expense_receipt",
  "trip_report"
] as const;

export type DocumentType = typeof documentTypes[number];

// Trip Documents Relations
export const tripDocumentsRelations = relations(tripDocuments, ({ one }) => ({
  trip: one(businessTrips, {
    fields: [tripDocuments.tripId],
    references: [businessTrips.id],
  }),
  uploadedByUser: one(users, {
    fields: [tripDocuments.uploadedBy],
    references: [users.id],
  }),
}));

// Trip Documents Zod Schema
export const insertTripDocumentSchema = createInsertSchema(tripDocuments)
  .omit({ id: true, uploadedAt: true })
  .extend({
    fileUrl: z.string().optional(),
    fileSize: z.number().optional(),
    fileType: z.string().optional(),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
  });

export type TripDocument = typeof tripDocuments.$inferSelect;
export type InsertTripDocument = z.infer<typeof insertTripDocumentSchema>;

// ==================== SAP B1 PURCHASE MODULE ====================

// SAP Purchase Orders table
export const sapPurchaseOrders = pgTable('sap_purchase_orders', {
  id: serial('id').primaryKey(),
  docEntry: integer('doc_entry').unique().notNull(),
  docNum: varchar('doc_num', { length: 50 }).notNull(),
  docType: varchar('doc_type', { length: 10 }).default('PO'),
  series: integer('series'),
  docDate: date('doc_date').notNull(),
  docDueDate: date('doc_due_date'),
  taxDate: date('tax_date'),
  
  // Vendor Information
  vendorCode: varchar('vendor_code', { length: 50 }).notNull(),
  vendorName: varchar('vendor_name', { length: 255 }),
  contactPerson: varchar('contact_person', { length: 100 }),
  
  // Financial Information
  docTotal: decimal('doc_total', { precision: 15, scale: 2 }).default('0'),
  vatSum: decimal('vat_sum', { precision: 15, scale: 2 }).default('0'),
  docTotalFc: decimal('doc_total_fc', { precision: 15, scale: 2 }).default('0'),
  docCurrency: varchar('doc_currency', { length: 10 }).default('INR'),
  docRate: decimal('doc_rate', { precision: 10, scale: 4 }).default('1'),
  
  // Status Information
  docStatus: varchar('doc_status', { length: 10 }).default('O'),
  cancelled: varchar('cancelled', { length: 1 }).default('N'),
  
  // Additional Information
  comments: text('comments'),
  reference1: varchar('reference_1', { length: 100 }),
  reference2: varchar('reference_2', { length: 100 }),
  projectCode: varchar('project_code', { length: 50 }),
  
  // Sync Information
  sapSyncedAt: timestamp('sap_synced_at'),
  sapLastModified: timestamp('sap_last_modified'),
  sapSyncStatus: varchar('sap_sync_status', { length: 20 }).default('pending'),
  
  // Audit Information
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdBy: integer('created_by'),
  updatedBy: integer('updated_by'),
});

// SAP Purchase Order Items table with Enhanced GST Tracking
export const sapPurchaseOrderItems = pgTable('sap_purchase_order_items', {
  id: serial('id').primaryKey(),
  docEntry: integer('doc_entry').notNull(),
  lineNum: integer('line_num').notNull(),
  
  // Item Information
  itemCode: varchar('item_code', { length: 50 }).notNull(),
  itemDescription: varchar('item_description', { length: 255 }),
  
  // Quantity and Pricing
  quantity: decimal('quantity', { precision: 15, scale: 4 }).default('0'),
  openQty: decimal('open_qty', { precision: 15, scale: 4 }).default('0'),
  unitPrice: decimal('unit_price', { precision: 15, scale: 4 }).default('0'),
  priceAfterVat: decimal('price_after_vat', { precision: 15, scale: 4 }).default('0'),
  lineTotal: decimal('line_total', { precision: 15, scale: 2 }).default('0'),
  
  // Tax Information (Legacy)
  taxCode: varchar('tax_code', { length: 20 }),
  taxRate: decimal('tax_rate', { precision: 5, scale: 2 }).default('0'),
  taxSum: decimal('tax_sum', { precision: 15, scale: 2 }).default('0'),
  
  // Enhanced GST Tracking Fields
  gstType: varchar('gst_type', { length: 20 }).default('IGST'), // 'IGST' or 'CGST+SGST'
  gstTreatment: varchar('gst_treatment', { length: 30 }).default('taxable'), // 'taxable', 'exempt', 'nil_rated', 'non_gst'
  placeOfSupply: varchar('place_of_supply', { length: 50 }),
  vendorState: varchar('vendor_state', { length: 50 }),
  buyerState: varchar('buyer_state', { length: 50 }),
  
  // CGST (Central GST) fields
  cgstRate: decimal('cgst_rate', { precision: 5, scale: 2 }).default('0'),
  cgstAmount: decimal('cgst_amount', { precision: 15, scale: 2 }).default('0'),
  
  // SGST (State GST) fields
  sgstRate: decimal('sgst_rate', { precision: 5, scale: 2 }).default('0'),
  sgstAmount: decimal('sgst_amount', { precision: 15, scale: 2 }).default('0'),
  
  // IGST (Integrated GST) fields
  igstRate: decimal('igst_rate', { precision: 5, scale: 2 }).default('0'),
  igstAmount: decimal('igst_amount', { precision: 15, scale: 2 }).default('0'),
  
  // Total GST amount (sum of all GST components)
  totalGstAmount: decimal('total_gst_amount', { precision: 15, scale: 2 }).default('0'),
  
  // Input Tax Credit eligibility
  itcEligible: boolean('itc_eligible').default(true),
  itcClaimAmount: decimal('itc_claim_amount', { precision: 15, scale: 2 }).default('0'),
  
  // CapEx/OpEx classification (for GST segregation from asset/operational calculations)
  expenditureType: varchar('expenditure_type', { length: 20 }).default('OpEx'), // 'CapEx' or 'OpEx'
  lineTotalBeforeGst: decimal('line_total_before_gst', { precision: 15, scale: 2 }).default('0'),
  lineTotalAfterGst: decimal('line_total_after_gst', { precision: 15, scale: 2 }).default('0'),
  
  // HSN/SAC Code for GST compliance
  hsnSacCode: varchar('hsn_sac_code', { length: 20 }),
  commodityDescription: varchar('commodity_description', { length: 255 }),
  
  // Financial Year tracking for annual GST reporting
  financialYear: varchar('financial_year', { length: 20 }),
  
  // Warehouse Information
  warehouseCode: varchar('warehouse_code', { length: 20 }),
  
  // Additional Information
  uom: varchar('uom', { length: 20 }),
  uomCode: varchar('uom_code', { length: 20 }),
  costCenter: varchar('cost_center', { length: 50 }),
  projectCode: varchar('project_code', { length: 50 }),
  
  // Delivery Information
  shipDate: date('ship_date'),
  deliveryDate: date('delivery_date'),
  
  // Line Status (from SAP — bost_Open or bost_Close)
  lineStatus: varchar('line_status', { length: 10 }).default('bost_Open'),
  
  // Sync Information
  sapSyncedAt: timestamp('sap_synced_at'),
  sapLastModified: timestamp('sap_last_modified'),
  sapSyncStatus: varchar('sap_sync_status', { length: 20 }).default('pending'),
  
  // Audit Information
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// SAP Purchase Requisitions table
export const sapPurchaseRequisitions = pgTable('sap_purchase_requisitions', {
  id: serial('id').primaryKey(),
  docEntry: integer('doc_entry').unique().notNull(),
  docNum: varchar('doc_num', { length: 50 }).notNull(),
  docType: varchar('doc_type', { length: 10 }).default('PR'),
  series: integer('series'),
  docDate: date('doc_date').notNull(),
  dueDate: date('due_date'),
  
  // Requester Information
  requesterCode: varchar('requester_code', { length: 50 }),
  requesterName: varchar('requester_name', { length: 255 }),
  
  // Status Information
  docStatus: varchar('doc_status', { length: 10 }).default('O'),
  priority: varchar('priority', { length: 10 }).default('Normal'),
  
  // Additional Information
  comments: text('comments'),
  reference1: varchar('reference_1', { length: 100 }),
  department: varchar('department', { length: 50 }),
  
  // Sync Information
  sapSyncedAt: timestamp('sap_synced_at'),
  sapLastModified: timestamp('sap_last_modified'),
  sapSyncStatus: varchar('sap_sync_status', { length: 20 }).default('pending'),
  
  // Audit Information
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdBy: integer('created_by'),
  updatedBy: integer('updated_by'),
});

// SAP Goods Receipt PO table
export const sapGoodsReceiptPo = pgTable('sap_goods_receipt_po', {
  id: serial('id').primaryKey(),
  docEntry: integer('doc_entry').unique().notNull(),
  docNum: varchar('doc_num', { length: 50 }).notNull(),
  docType: varchar('doc_type', { length: 10 }).default('GR'),
  series: integer('series'),
  docDate: date('doc_date').notNull(),
  postingDate: date('posting_date'),
  
  // Vendor Information
  vendorCode: varchar('vendor_code', { length: 50 }).notNull(),
  vendorName: varchar('vendor_name', { length: 255 }),
  
  // Reference Information
  baseDocType: varchar('base_doc_type', { length: 10 }),
  baseDocEntry: integer('base_doc_entry'),
  baseDocNum: varchar('base_doc_num', { length: 50 }),
  
  // Financial Information
  docTotal: decimal('doc_total', { precision: 15, scale: 2 }).default('0'),
  vatSum: decimal('vat_sum', { precision: 15, scale: 2 }).default('0'),
  docCurrency: varchar('doc_currency', { length: 10 }).default('INR'),
  
  // Status Information
  docStatus: varchar('doc_status', { length: 10 }).default('O'),
  cancelled: varchar('cancelled', { length: 1 }).default('N'),
  
  // Additional Information
  comments: text('comments'),
  reference1: varchar('reference_1', { length: 100 }),
  
  // Sync Information
  sapSyncedAt: timestamp('sap_synced_at'),
  sapLastModified: timestamp('sap_last_modified'),
  sapSyncStatus: varchar('sap_sync_status', { length: 20 }).default('pending'),
  
  // Audit Information
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdBy: integer('created_by'),
  updatedBy: integer('updated_by'),
});

// SAP Purchase Invoices table
export const sapPurchaseInvoices = pgTable('sap_purchase_invoices', {
  id: serial('id').primaryKey(),
  docEntry: integer('doc_entry').unique().notNull(),
  docNum: varchar('doc_num', { length: 50 }).notNull(),
  docType: varchar('doc_type', { length: 10 }).default('PI'),
  series: integer('series'),
  docDate: date('doc_date').notNull(),
  docDueDate: date('doc_due_date'),
  taxDate: date('tax_date'),
  
  // Vendor Information
  vendorCode: varchar('vendor_code', { length: 50 }).notNull(),
  vendorName: varchar('vendor_name', { length: 255 }),
  
  // Reference Information
  baseDocType: varchar('base_doc_type', { length: 10 }),
  baseDocEntry: integer('base_doc_entry'),
  baseDocNum: varchar('base_doc_num', { length: 50 }),
  
  // Financial Information
  docTotal: decimal('doc_total', { precision: 15, scale: 2 }).default('0'),
  vatSum: decimal('vat_sum', { precision: 15, scale: 2 }).default('0'),
  paidSum: decimal('paid_sum', { precision: 15, scale: 2 }).default('0'),
  docTotalFc: decimal('doc_total_fc', { precision: 15, scale: 2 }).default('0'),
  docCurrency: varchar('doc_currency', { length: 10 }).default('INR'),
  docRate: decimal('doc_rate', { precision: 10, scale: 4 }).default('1'),
  
  // Status Information
  docStatus: varchar('doc_status', { length: 10 }).default('O'),
  cancelled: varchar('cancelled', { length: 1 }).default('N'),
  
  // Additional Information
  comments: text('comments'),
  reference1: varchar('reference_1', { length: 100 }),
  reference2: varchar('reference_2', { length: 100 }),
  
  // Sync Information
  sapSyncedAt: timestamp('sap_synced_at'),
  sapLastModified: timestamp('sap_last_modified'),
  sapSyncStatus: varchar('sap_sync_status', { length: 20 }).default('pending'),
  
  // Audit Information
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdBy: integer('created_by'),
  updatedBy: integer('updated_by'),
});

// SAP Purchase Relations
export const sapPurchaseOrdersRelations = relations(sapPurchaseOrders, ({ one, many }) => ({
  items: many(sapPurchaseOrderItems),
  createdByUser: one(users, {
    fields: [sapPurchaseOrders.createdBy],
    references: [users.id],
  }),
  updatedByUser: one(users, {
    fields: [sapPurchaseOrders.updatedBy],
    references: [users.id],
  }),
}));

export const sapPurchaseOrderItemsRelations = relations(sapPurchaseOrderItems, ({ one }) => ({
  purchaseOrder: one(sapPurchaseOrders, {
    fields: [sapPurchaseOrderItems.docEntry],
    references: [sapPurchaseOrders.docEntry],
  }),
}));

export const sapPurchaseRequisitionsRelations = relations(sapPurchaseRequisitions, ({ one }) => ({
  createdByUser: one(users, {
    fields: [sapPurchaseRequisitions.createdBy],
    references: [users.id],
  }),
  updatedByUser: one(users, {
    fields: [sapPurchaseRequisitions.updatedBy],
    references: [users.id],
  }),
}));

export const sapGoodsReceiptPoRelations = relations(sapGoodsReceiptPo, ({ one }) => ({
  createdByUser: one(users, {
    fields: [sapGoodsReceiptPo.createdBy],
    references: [users.id],
  }),
  updatedByUser: one(users, {
    fields: [sapGoodsReceiptPo.updatedBy],
    references: [users.id],
  }),
}));

export const sapPurchaseInvoicesRelations = relations(sapPurchaseInvoices, ({ one }) => ({
  createdByUser: one(users, {
    fields: [sapPurchaseInvoices.createdBy],
    references: [users.id],
  }),
  updatedByUser: one(users, {
    fields: [sapPurchaseInvoices.updatedBy],
    references: [users.id],
  }),
}));

// Design Project Backups table
export const designProjectBackups = pgTable('design_project_backups', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  
  // Backup Classification
  backupType: varchar('backup_type', { length: 100 }).notNull(), // 3D Model, PLC Program, SCADA
  
  // File Details
  fileName: varchar('file_name', { length: 255 }).notNull(),
  originalFileName: varchar('original_file_name', { length: 255 }),
  revision: varchar('revision', { length: 50 }).default('R1'),
  description: text('description'),
  
  // Storage Information
  filePath: text('file_path').notNull(),
  fileUrl: text('file_url'),
  fileSize: integer('file_size'),
  fileType: varchar('file_type', { length: 50 }),
  
  // Revision Control
  status: varchar('status', { length: 50 }).notNull().default('current'), // current, superseded, archived
  isRevision: boolean('is_revision').notNull().default(false),
  revisionOf: integer('revision_of').references(() => designProjectBackups.id, { onDelete: 'set null' }),
  revisionReason: text('revision_reason'),
  supersededAt: timestamp('superseded_at'),
  supersededBy: integer('superseded_by').references(() => users.id, { onDelete: 'set null' }),
  
  // Upload Information
  uploadedBy: integer('uploaded_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  uploadedAt: timestamp('uploaded_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Design Project Backups Relations
export const designProjectBackupsRelations = relations(designProjectBackups, ({ one }) => ({
  project: one(projects, {
    fields: [designProjectBackups.projectId],
    references: [projects.id],
  }),
  uploadedByUser: one(users, {
    fields: [designProjectBackups.uploadedBy],
    references: [users.id],
  }),
  supersededByUser: one(users, {
    fields: [designProjectBackups.supersededBy],
    references: [users.id],
  }),
  parentBackup: one(designProjectBackups, {
    fields: [designProjectBackups.revisionOf],
    references: [designProjectBackups.id],
    relationName: "backup_revisions"
  }),
}));

// Design Project Backups Zod Schemas
export const insertDesignProjectBackupSchema = createInsertSchema(designProjectBackups)
  .omit({ id: true, uploadedAt: true, updatedAt: true })
  .extend({
    projectId: z.number().min(1, "Project ID is required"),
    backupType: z.string().min(1, "Backup type is required"),
    fileName: z.string().min(1, "File name is required"),
    originalFileName: z.string().optional(),
    revision: z.string().default('R1'),
    description: z.string().optional(),
    filePath: z.string().min(1, "File path is required"),
    fileUrl: z.string().optional(),
    fileSize: z.number().optional(),
    fileType: z.string().optional(),
    status: z.string().default('current'),
    isRevision: z.boolean().default(false),
    revisionOf: z.number().optional(),
    revisionReason: z.string().optional(),
    supersededAt: z.date().optional(),
    supersededBy: z.number().optional(),
    uploadedBy: z.number().min(1, "Uploaded by user ID is required"),
  });

export type InsertDesignProjectBackup = z.infer<typeof insertDesignProjectBackupSchema>;
export type SelectDesignProjectBackup = typeof designProjectBackups.$inferSelect;

// Test Procedures table for NDT testing standards and procedures
export const testProcedures = pgTable('test_procedures', {
  id: serial('id').primaryKey(),
  
  // Procedure Identification
  procedureNumber: varchar('procedure_number', { length: 100 }).notNull().unique(),
  procedureName: varchar('procedure_name', { length: 255 }).notNull(),
  ndtMethod: varchar('ndt_method', { length: 50 }).notNull(), // LPT, MPT, RT, PT, UT, MT
  
  // Standard and Specification
  applicableStandard: varchar('applicable_standard', { length: 255 }), // ASME SEC V, ASTM, EN ISO, etc.
  procedureRevision: varchar('procedure_revision', { length: 20 }).default('R1'),
  
  // Technical Details
  scope: text('scope'), // Application scope
  technique: varchar('technique', { length: 255 }), // Specific technique within method
  sensitivity: varchar('sensitivity', { length: 100 }), // Sensitivity requirements
  
  // Procedure Steps
  preparation: text('preparation'), // Surface preparation requirements
  procedureSteps: text('procedure_steps'), // Detailed testing steps
  evaluation: text('evaluation'), // Evaluation criteria
  documentation: text('documentation'), // Documentation requirements
  
  // Quality Requirements
  personnelQualification: varchar('personnel_qualification', { length: 255 }), // Required personnel level
  acceptanceCriteria: text('acceptance_criteria'), // Pass/fail criteria
  
  // Limitations and Notes
  limitations: text('limitations'), // Method limitations
  environmentalConditions: text('environmental_conditions'), // Temperature, humidity, etc.
  
  // Status and Approval
  status: varchar('status', { length: 50 }).notNull().default('Draft'), // Draft, Under Review, Approved, Superseded
  approvalLevel: varchar('approval_level', { length: 50 }), // Level 1, Level 2, Level 3
  approvedBy: integer('approved_by').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at'),
  
  // Revision Control
  isRevision: boolean('is_revision').notNull().default(false),
  revisionOf: integer('revision_of').references(() => testProcedures.id, { onDelete: 'set null' }),
  revisionReason: text('revision_reason'),
  supersededAt: timestamp('superseded_at'),
  supersededBy: integer('superseded_by').references(() => users.id, { onDelete: 'set null' }),
  
  // Metadata
  remarks: text('remarks'),
  tags: text('tags'), // Searchable tags
  attachments: jsonb('attachments'), // File attachments metadata
  
  // Audit Trail
  createdBy: integer('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Test Procedures Relations
export const testProceduresRelations = relations(testProcedures, ({ one }) => ({
  createdByUser: one(users, {
    fields: [testProcedures.createdBy],
    references: [users.id],
    relationName: "test_procedure_creator"
  }),
  updatedByUser: one(users, {
    fields: [testProcedures.updatedBy],
    references: [users.id],
    relationName: "test_procedure_updater"
  }),
  approvedByUser: one(users, {
    fields: [testProcedures.approvedBy],
    references: [users.id],
    relationName: "test_procedure_approver"
  }),
  supersededByUser: one(users, {
    fields: [testProcedures.supersededBy],
    references: [users.id],
    relationName: "test_procedure_superseder"
  }),
  parentProcedure: one(testProcedures, {
    fields: [testProcedures.revisionOf],
    references: [testProcedures.id],
    relationName: "procedure_revisions"
  }),
}));

// Test Procedures Zod Schemas - all fields mandatory except remarks
export const insertTestProcedureSchema = createInsertSchema(testProcedures)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    procedureNumber: z.string().min(1, "Procedure number is required"),
    procedureName: z.string().min(1, "Procedure name is required"),
    ndtMethod: z.enum(['HT', 'PNT', 'RT', 'PT', 'UT', 'MT'], {
      errorMap: () => ({ message: "NDT method must be one of: HT, PNT, RT, PT, UT, MT" })
    }),
    applicableStandard: z.string().min(1, "Applicable standard is required"),
    procedureRevision: z.string().min(1, "Procedure revision is required").default('R1'),
    scope: z.string().min(1, "Scope is required"),
    technique: z.string().min(1, "Technique is required"),
    sensitivity: z.string().min(1, "Sensitivity is required"),
    preparation: z.string().min(1, "Preparation is required"),
    procedureSteps: z.string().min(1, "Procedure steps are required"),
    evaluation: z.string().min(1, "Evaluation is required"),
    documentation: z.string().min(1, "Documentation is required"),
    personnelQualification: z.string().min(1, "Personnel qualification is required"),
    acceptanceCriteria: z.string().min(1, "Acceptance criteria is required"),
    limitations: z.string().min(1, "Limitations are required"),
    environmentalConditions: z.string().min(1, "Environmental conditions are required"),
    status: z.enum(['Draft', 'Under Review', 'Approved', 'Superseded']).default('Draft'),
    approvalLevel: z.enum(['Level 1', 'Level 2', 'Level 3'], {
      errorMap: () => ({ message: "Approval level is required" })
    }),
    approvedBy: z.number().optional(),
    approvedAt: z.date().optional(),
    isRevision: z.boolean().default(false),
    revisionOf: z.number().optional(),
    revisionReason: z.string().optional(),
    supersededAt: z.date().optional(),
    supersededBy: z.number().optional(),
    remarks: z.string().optional(), // Only field that remains optional
    tags: z.string().min(1, "Tags are required"),
    attachments: z.any().optional(),
    createdBy: z.number().min(1, "Created by user ID is required"),
    updatedBy: z.number().optional(),
  });

export type InsertTestProcedure = z.infer<typeof insertTestProcedureSchema>;
export type SelectTestProcedure = typeof testProcedures.$inferSelect;

// SAP Purchase Zod Schemas
export const insertSapPurchaseOrderSchema = createInsertSchema(sapPurchaseOrders)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    docDueDate: z.string().optional().transform(dateStringToDate),
    taxDate: z.string().optional().transform(dateStringToDate),
    comments: z.string().optional(),
    reference1: z.string().optional(),
    reference2: z.string().optional(),
    projectCode: z.string().optional(),
    sapSyncedAt: z.date().optional(),
    sapLastModified: z.date().optional(),
    createdBy: z.number().optional(),
    updatedBy: z.number().optional(),
  });

export const insertSapPurchaseOrderItemSchema = createInsertSchema(sapPurchaseOrderItems)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    itemDescription: z.string().optional(),
    taxCode: z.string().optional(),
    warehouseCode: z.string().optional(),
    uom: z.string().optional(),
    uomCode: z.string().optional(),
    costCenter: z.string().optional(),
    projectCode: z.string().optional(),
    shipDate: z.string().optional().transform(dateStringToDate),
    deliveryDate: z.string().optional().transform(dateStringToDate),
    sapSyncedAt: z.date().optional(),
    sapLastModified: z.date().optional(),
    
    // Enhanced GST Tracking Fields
    gstType: z.enum(['IGST', 'CGST+SGST']).optional(),
    gstTreatment: z.enum(['taxable', 'exempt', 'nil_rated', 'non_gst']).optional(),
    placeOfSupply: z.string().optional(),
    vendorState: z.string().optional(),
    buyerState: z.string().optional(),
    
    // GST Component Rates and Amounts
    cgstRate: z.number().optional(),
    cgstAmount: z.number().optional(),
    sgstRate: z.number().optional(),
    sgstAmount: z.number().optional(),
    igstRate: z.number().optional(),
    igstAmount: z.number().optional(),
    totalGstAmount: z.number().optional(),
    
    // ITC Eligibility
    itcEligible: z.boolean().optional(),
    itcClaimAmount: z.number().optional(),
    
    // CapEx/OpEx Classification
    expenditureType: z.enum(['CapEx', 'OpEx']).optional(),
    lineTotalBeforeGst: z.number().optional(),
    lineTotalAfterGst: z.number().optional(),
    
    // HSN/SAC and Financial Year
    hsnSacCode: z.string().optional(),
    commodityDescription: z.string().optional(),
    financialYear: z.string().optional(),
  });

export const insertSapPurchaseRequisitionSchema = createInsertSchema(sapPurchaseRequisitions)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    dueDate: z.string().optional().transform(dateStringToDate),
    requesterCode: z.string().optional(),
    requesterName: z.string().optional(),
    comments: z.string().optional(),
    reference1: z.string().optional(),
    department: z.string().optional(),
    sapSyncedAt: z.date().optional(),
    sapLastModified: z.date().optional(),
    createdBy: z.number().optional(),
    updatedBy: z.number().optional(),
  });

export const insertSapGoodsReceiptPoSchema = createInsertSchema(sapGoodsReceiptPo)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    postingDate: z.string().optional().transform(dateStringToDate),
    vendorName: z.string().optional(),
    baseDocType: z.string().optional(),
    baseDocEntry: z.number().optional(),
    baseDocNum: z.string().optional(),
    comments: z.string().optional(),
    reference1: z.string().optional(),
    sapSyncedAt: z.date().optional(),
    sapLastModified: z.date().optional(),
    createdBy: z.number().optional(),
    updatedBy: z.number().optional(),
  });

export const insertSapPurchaseInvoiceSchema = createInsertSchema(sapPurchaseInvoices)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    docDueDate: z.string().optional().transform(dateStringToDate),
    taxDate: z.string().optional().transform(dateStringToDate),
    vendorName: z.string().optional(),
    baseDocType: z.string().optional(),
    baseDocEntry: z.number().optional(),
    baseDocNum: z.string().optional(),
    comments: z.string().optional(),
    reference1: z.string().optional(),
    reference2: z.string().optional(),
    sapSyncedAt: z.date().optional(),
    sapLastModified: z.date().optional(),
    createdBy: z.number().optional(),
    updatedBy: z.number().optional(),
  });

// SAP Purchase Types
export type SapPurchaseOrder = typeof sapPurchaseOrders.$inferSelect;
export type InsertSapPurchaseOrder = z.infer<typeof insertSapPurchaseOrderSchema>;

export type SapPurchaseOrderItem = typeof sapPurchaseOrderItems.$inferSelect;
export type InsertSapPurchaseOrderItem = z.infer<typeof insertSapPurchaseOrderItemSchema>;

export type SapPurchaseRequisition = typeof sapPurchaseRequisitions.$inferSelect;
export type InsertSapPurchaseRequisition = z.infer<typeof insertSapPurchaseRequisitionSchema>;

export type SapGoodsReceiptPo = typeof sapGoodsReceiptPo.$inferSelect;
export type InsertSapGoodsReceiptPo = z.infer<typeof insertSapGoodsReceiptPoSchema>;

export type SapPurchaseInvoice = typeof sapPurchaseInvoices.$inferSelect;
export type InsertSapPurchaseInvoice = z.infer<typeof insertSapPurchaseInvoiceSchema>;

export type Itp = typeof itps.$inferSelect;
export type InsertItp = z.infer<typeof insertItpSchema>;

export type ItpVersion = typeof itpVersions.$inferSelect;
export type InsertItpVersion = z.infer<typeof insertItpVersionSchema>;

export type ItpActivity = typeof itpActivities.$inferSelect;
export type InsertItpActivity = z.infer<typeof insertItpActivitySchema>;

// Inspection Orders
export const inspectionOrders = pgTable('inspection_orders', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectCode: text('project_code').notNull(),
  
  // Order identifiers
  inspectionOrderNumber: text('inspection_order_number').notNull().unique(),
  title: text('title').notNull(),
  
  // Related items
  itemId: integer('item_id').references(() => projectItems.id, { onDelete: 'set null' }),
  itemCode: text('item_code'),
  description: text('description').notNull(),
  drawingNo: text('drawing_no'), // Added drawing number field
  workOrderId: integer('work_order_id').references(() => workOrders.id, { onDelete: 'set null' }),
  epcWorkOrderId: integer('epc_work_order_id').references(() => epcWorkOrders.id as any, { onDelete: 'set null' }),
  
  // Order details
  status: text('status').notNull().default('pending'), // pending, in_progress, completed, cancelled
  inspectionType: text('inspection_type').notNull(), // incoming, in-process, final, dimensional, visual
  quantity: integer('quantity').notNull().default(1),
  unit: text('unit').notNull().default('Nos'),
  makeOrBuy: text('make_or_buy'),
  parentInspectionOrderId: integer('parent_inspection_order_id').references(() => inspectionOrders.id, { onDelete: 'set null' }),
  sequenceNumber: integer('sequence_number').notNull(),
  
  // NDT data - stored as JSON string
  ndtData: text('ndt_data'),
  
  // Visual Inspection data - stored as JSON string
  visualData: text('visual_data'),
  
  // Welding & Weld Maps data - stored as JSON string
  weldData: text('weld_data'),
  
  // Hydrotest data - stored as JSON string
  hydrotestData: text('hydrotest_data'),
  
  // Non-Conformance data - stored as JSON string
  ncrData: text('ncr_data'),
  
  // Approved Drawing data - stored as JSON string
  approvedDrawingData: text('approved_drawing_data'),
  
  // DVR (Design Verification Records) data - stored as JSON string
  dvrData: text('dvr_data'),
  
  // ITP (Inspection Test Plan) data - stored as JSON string
  itpData: text('itp_data'),
  
  // PMA (Particular Material Appraisal) data - stored as JSON string
  pmaData: text('pma_data'),
  
  // Procedures/Test Procedures data - stored as JSON string
  procedureData: text('procedure_data'),
  
  // Shop Inspection data - stored as JSON string
  shopData: text('shop_data'),
  
  // Material Traceability data - stored as JSON string
  materialTraceabilityData: text('material_traceability_data'),
  
  // Timing
  plannedDate: timestamp('planned_date'),
  completedDate: timestamp('completed_date'),
  
  // Tracking
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Inspection Order Items
export const inspectionOrderItems = pgTable('inspection_order_items', {
  id: serial('id').primaryKey(),
  inspectionOrderId: integer('inspection_order_id').notNull().references(() => inspectionOrders.id, { onDelete: 'cascade' }),
  
  // Related items
  itemId: integer('item_id').references(() => projectItems.id, { onDelete: 'set null' }),
  itemCode: text('item_code'),
  description: text('description').notNull(),
  workOrderItemId: integer('work_order_item_id').references(() => workOrderItems.id, { onDelete: 'set null' }),
  
  // Item details
  quantity: integer('quantity').notNull().default(1),
  unit: text('unit').notNull().default('Nos'),
  makeOrBuy: text('make_or_buy'),
  sequenceNumber: integer('sequence_number').notNull(),
  
  // Tracking
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Define relations for inspection orders
export const inspectionOrdersRelations = relations(inspectionOrders, ({ one, many }) => ({
  project: one(projects, {
    fields: [inspectionOrders.projectId],
    references: [projects.id],
  }),
  workOrder: one(workOrders, {
    fields: [inspectionOrders.workOrderId],
    references: [workOrders.id],
  }),
  parentInspectionOrder: one(inspectionOrders, {
    fields: [inspectionOrders.parentInspectionOrderId],
    references: [inspectionOrders.id],
  }),
  items: many(inspectionOrderItems),
  creator: one(users, {
    fields: [inspectionOrders.createdBy],
    references: [users.id],
  }),
}));

// Define relations for inspection order items
export const inspectionOrderItemsRelations = relations(inspectionOrderItems, ({ one }) => ({
  inspectionOrder: one(inspectionOrders, {
    fields: [inspectionOrderItems.inspectionOrderId],
    references: [inspectionOrders.id],
  }),
  workOrderItem: one(workOrderItems, {
    fields: [inspectionOrderItems.workOrderItemId],
    references: [workOrderItems.id],
  }),
}));

// Create Zod schemas for data validation
export const insertInspectionOrderSchema = createInsertSchema(inspectionOrders)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    status: z.enum(['pending', 'in_progress', 'completed', 'canceled']),
    inspectionType: z.enum(['incoming', 'in-process', 'final', 'dimensional', 'visual']),
    makeOrBuy: z.enum(['Make', 'Buy', 'Service']).optional(),
    plannedDate: z.string().optional().transform(dateStringToDate),
    completedDate: z.string().optional().transform(dateStringToDate),
    ndtData: z.string().optional(),
    visualData: z.string().optional(),
    weldData: z.string().optional(),
    hydrotestData: z.string().optional(),
    ncrData: z.string().optional(),
    approvedDrawingData: z.string().optional(),
    dvrData: z.string().optional(),
    itpData: z.string().optional(),
  });

export const insertInspectionOrderItemSchema = createInsertSchema(inspectionOrderItems)
  .omit({ id: true, createdAt: true, updatedAt: true });

// Daily Buddha Quotes Table
export const dailyQuotes = pgTable('daily_quotes', {
  id: serial('id').primaryKey(),
  dayOfYear: integer('day_of_year').notNull().unique(),
  quoteText: text('quote_text').notNull(),
  attribution: varchar('attribution', { length: 100 }).default('Buddha'),
  source: varchar('source', { length: 200 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Payroll Management Tables

// Employee salary information (Enhanced for Administration Module)
export const employeeSalaries = pgTable('employee_salaries', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  baseSalary: decimal('base_salary', { precision: 12, scale: 2 }).notNull(),
  salaryStartDate: date('salary_start_date').notNull(),
  basicSalary: decimal('basic_salary', { precision: 12, scale: 2 }).notNull(),
  houseRentAllowance: decimal('house_rent_allowance', { precision: 10, scale: 2 }).default('0'),
  conveyance: decimal('conveyance', { precision: 10, scale: 2 }).default('0'),
  lta: decimal('lta', { precision: 10, scale: 2 }).default('0'),
  specialAllowance: decimal('special_allowance', { precision: 10, scale: 2 }).default('0'),
  supplementaryAllowance: decimal('supplementary_allowance', { precision: 10, scale: 2 }).default('0'),
  bonus: decimal('bonus', { precision: 10, scale: 2 }).default('0'),
  gratuityCost: decimal('gratuity_cost', { precision: 10, scale: 2 }).default('0'),
  kgpAllowance: decimal('kgp_allowance', { precision: 10, scale: 2 }).default('0'),
  kpiPercent: decimal('kpi_percent', { precision: 5, scale: 2 }).default('0'),
  
  // PF & ESIC Contributions
  employeePfContribution: decimal('employee_pf_contribution', { precision: 10, scale: 2 }).default('0'),
  employerPfContribution: decimal('employer_pf_contribution', { precision: 10, scale: 2 }).default('0'),
  employeeEsicContribution: decimal('employee_esic_contribution', { precision: 10, scale: 2 }).default('0'),
  employerEsicContribution: decimal('employer_esic_contribution', { precision: 10, scale: 2 }).default('0'),
  groupInsurance: decimal('group_insurance', { precision: 10, scale: 2 }).default('0'),
  professionalTax: decimal('professional_tax', { precision: 10, scale: 2 }).default('0'),
  pfApplicable: boolean('pf_applicable').default(true),
  lwpExempt: boolean('lwp_exempt').default(false),
  
  // Bank Details
  bankName: text('bank_name'),
  bankAccountNo: text('bank_account_no'),
  debitAccount: text('debit_account'),
  
  // Salary Configuration
  salaryType: varchar('salary_type', { length: 20 }).default('monthly'),
  hourlyRate: decimal('hourly_rate', { precision: 10, scale: 2 }),
  actualDays: integer('actual_days').default(30),
  workingHoursPerDay: integer('working_hours_per_day').default(8),
  overtimeHours: decimal('overtime_hours', { precision: 5, scale: 2 }).default('0'),
  otRate: decimal('ot_rate', { precision: 3, scale: 1 }).default('1.0'),
  
  // Attendance-linked fields (optional integration)
  presentDays: integer('present_days').default(0),
  paidDays: integer('paid_days').default(0),
  weekOff: integer('week_off').default(0),
  holidays: integer('holidays').default(0),
  otHours: decimal('ot_hours', { precision: 5, scale: 2 }).default('0'),
  otMultiplier: decimal('ot_multiplier', { precision: 3, scale: 2 }).default('1.5'),
  otAmount: decimal('ot_amount', { precision: 10, scale: 2 }).default('0'),
  absence: integer('absence').default(0),
  clBalance: integer('cl_balance').default(0),
  
  // Calculated fields
  takeHomeSalary: decimal('take_home_salary', { precision: 12, scale: 2 }),
  actualSalaryForMonth: decimal('actual_salary_for_month', { precision: 12, scale: 2 }),
  ctcMonthly: decimal('ctc_monthly', { precision: 12, scale: 2 }),
  ctcYearly: decimal('ctc_yearly', { precision: 12, scale: 2 }),
  
  // Legacy fields for compatibility
  currency: varchar('currency', { length: 3 }).default('INR'),
  payFrequency: varchar('pay_frequency', { length: 20 }).default('monthly'),
  effectiveDate: date('effective_date').notNull(),
  endDate: date('end_date'),
  salaryGrade: varchar('salary_grade', { length: 10 }),
  department: varchar('department', { length: 100 }),
  position: varchar('position', { length: 100 }),
  
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdBy: integer('created_by').references(() => users.id),
});

// Salary increment proposals
export const salaryIncrementProposals = pgTable('salary_increment_proposals', {
  id: serial('id').primaryKey(),
  employeeSalaryId: integer('employee_salary_id').notNull().references(() => employeeSalaries.id, { onDelete: 'cascade' }),
  employeeId: integer('employee_id').notNull().references(() => users.id),
  incrementPercentage: decimal('increment_percentage', { precision: 5, scale: 2 }).notNull(),
  oldBasicSalary: decimal('old_basic_salary', { precision: 15, scale: 2 }).notNull(),
  proposedBasicSalary: decimal('proposed_basic_salary', { precision: 15, scale: 2 }).notNull(),
  oldCtc: decimal('old_ctc', { precision: 15, scale: 2 }),
  proposedCtc: decimal('proposed_ctc', { precision: 15, scale: 2 }),
  effectiveDate: date('effective_date').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  remarks: text('remarks').default('Yearly Increment'),
  proposedBy: integer('proposed_by').notNull().references(() => users.id),
  proposedAt: timestamp('proposed_at').notNull().defaultNow(),
  approvedBy: integer('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  rejectedBy: integer('rejected_by').references(() => users.id),
  rejectedAt: timestamp('rejected_at'),
  rejectionReason: text('rejection_reason'),
  appliedAt: timestamp('applied_at'),
  appliedBy: integer('applied_by').references(() => users.id),
  // Appraisal-driven fields
  appraisalId: integer('appraisal_id'),
  appraisalFinalScore: decimal('appraisal_final_score', { precision: 5, scale: 2 }),
  appraisalRating: varchar('appraisal_rating', { length: 30 }),
  systemSuggestedIncrementPct: decimal('system_suggested_increment_pct', { precision: 5, scale: 2 }),
  minIncrementPct: decimal('min_increment_pct', { precision: 5, scale: 2 }),
  maxIncrementPct: decimal('max_increment_pct', { precision: 5, scale: 2 }),
  finalProposedIncrementPct: decimal('final_proposed_increment_pct', { precision: 5, scale: 2 }),
  editedBy: integer('edited_by').references(() => users.id),
  editedAt: timestamp('edited_at'),
});

export type SalaryIncrementProposal = typeof salaryIncrementProposals.$inferSelect;
export type InsertSalaryIncrementProposal = typeof salaryIncrementProposals.$inferInsert;

// Salary increment audit log
export const salaryIncrementAuditLog = pgTable('salary_increment_audit_log', {
  id: serial('id').primaryKey(),
  proposalId: integer('proposal_id').notNull().references(() => salaryIncrementProposals.id, { onDelete: 'cascade' }),
  employeeSalaryId: integer('employee_salary_id').notNull(),
  employeeId: integer('employee_id').notNull(),
  action: varchar('action', { length: 20 }).notNull(),
  actorId: integer('actor_id').notNull(),
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  remarks: text('remarks'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type SalaryIncrementAuditLog = typeof salaryIncrementAuditLog.$inferSelect;

// Payroll periods
export const payrollPeriods = pgTable('payroll_periods', {
  id: serial('id').primaryKey(),
  periodName: varchar('period_name', { length: 50 }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  payDate: date('pay_date').notNull(),
  status: varchar('status', { length: 20 }).default('draft'),
  currentRunNumber: integer('current_run_number').default(0),
  finalizedRunNumber: integer('finalized_run_number'),
  isLocked: boolean('is_locked').default(false),
  totalEmployees: integer('total_employees').default(0),
  totalGrossPay: decimal('total_gross_pay', { precision: 15, scale: 2 }).default('0'),
  totalDeductions: decimal('total_deductions', { precision: 15, scale: 2 }).default('0'),
  totalNetPay: decimal('total_net_pay', { precision: 15, scale: 2 }).default('0'),
  createdAt: timestamp('created_at').defaultNow(),
  processedAt: timestamp('processed_at'),
  processedBy: integer('processed_by').references(() => users.id),
  reviewedBy: integer('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  approvedAt: timestamp('approved_at'),
  paidAt: timestamp('paid_at'),
  paidBy: integer('paid_by').references(() => users.id),
  lockedAt: timestamp('locked_at'),
  lockedBy: integer('locked_by').references(() => users.id),
});

// Individual payroll records
export const payrollRecords = pgTable('payroll_records', {
  id: serial('id').primaryKey(),
  periodId: integer('period_id').notNull().references(() => payrollPeriods.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  runNumber: integer('run_number'),
  baseSalary: decimal('base_salary', { precision: 12, scale: 2 }).notNull(),
  
  // Attendance snapshot fields
  workingDays: integer('working_days'),
  paidDays: decimal('paid_days', { precision: 5, scale: 2 }),
  lopDays: decimal('lop_days', { precision: 5, scale: 2 }),
  presentDays: decimal('present_days', { precision: 5, scale: 2 }),
  paidLeaveDays: decimal('paid_leave_days', { precision: 5, scale: 2 }),
  unpaidLeaveDays: decimal('unpaid_leave_days', { precision: 5, scale: 2 }),
  
  // KPI-based bonuses from DWAR
  productivityBonus: decimal('productivity_bonus', { precision: 10, scale: 2 }).default('0'),
  attendanceBonus: decimal('attendance_bonus', { precision: 10, scale: 2 }).default('0'),
  taskCompletionBonus: decimal('task_completion_bonus', { precision: 10, scale: 2 }).default('0'),
  satisfactionBonus: decimal('satisfaction_bonus', { precision: 10, scale: 2 }).default('0'),
  
  // Individual allowances for salary slip
  hra: decimal('hra', { precision: 10, scale: 2 }).default('0'),
  conveyanceAllowance: decimal('conveyance_allowance', { precision: 10, scale: 2 }).default('0'),
  ltaAllowance: decimal('lta_allowance', { precision: 10, scale: 2 }).default('0'),
  specialAllowance: decimal('special_allowance', { precision: 10, scale: 2 }).default('0'),
  supplementaryAllowance: decimal('supplementary_allowance', { precision: 10, scale: 2 }).default('0'),
  kgpAllowance: decimal('kgp_allowance', { precision: 10, scale: 2 }).default('0'),
  bonus: decimal('bonus', { precision: 10, scale: 2 }).default('0'),
  
  // Other allowances
  overtimeHours: decimal('overtime_hours', { precision: 5, scale: 2 }).default('0'),
  overtimePay: decimal('overtime_pay', { precision: 10, scale: 2 }).default('0'),
  otherAllowances: decimal('other_allowances', { precision: 10, scale: 2 }).default('0'),
  
  // Total gross
  grossPay: decimal('gross_pay', { precision: 12, scale: 2 }).notNull(),
  
  // Deductions
  incomeTax: decimal('income_tax', { precision: 10, scale: 2 }).default('0'),
  professionalTax: decimal('professional_tax', { precision: 10, scale: 2 }).default('0'),
  providentFund: decimal('provident_fund', { precision: 10, scale: 2 }).default('0'),
  esiDeduction: decimal('esi_deduction', { precision: 10, scale: 2 }).default('0'),
  esic: decimal('esic', { precision: 10, scale: 2 }).default('0'),
  groupInsurance: decimal('group_insurance', { precision: 10, scale: 2 }).default('0'),
  otherDeductions: decimal('other_deductions', { precision: 10, scale: 2 }).default('0'),
  totalDeductions: decimal('total_deductions', { precision: 10, scale: 2 }).default('0'),
  
  employeePf: decimal('employee_pf', { precision: 10, scale: 2 }).default('0'),
  employeeEsic: decimal('employee_esic', { precision: 10, scale: 2 }).default('0'),
  employerPf: decimal('employer_pf', { precision: 10, scale: 2 }).default('0'),
  employerEsic: decimal('employer_esic', { precision: 10, scale: 2 }).default('0'),
  gratuity: decimal('gratuity', { precision: 10, scale: 2 }).default('0'),

  // Loan & Advance deductions (reduce net pay only, not totalDeductions)
  loanDeductions: decimal('loan_deductions', { precision: 10, scale: 2 }).default('0'),
  advanceDeductions: decimal('advance_deductions', { precision: 10, scale: 2 }).default('0'),
  reimbursements: decimal('reimbursements', { precision: 10, scale: 2 }).default('0'),

  // TDS
  tdsAmount: decimal('tds_amount', { precision: 10, scale: 2 }).default('0'),

  // Net pay
  netPay: decimal('net_pay', { precision: 12, scale: 2 }).notNull(),
  
  // Calculation audit snapshot
  calculationSnapshot: jsonb('calculation_snapshot'),
  
  // KPI metrics for reference
  dwarProductivityScore: decimal('dwar_productivity_score', { precision: 5, scale: 2 }),
  attendancePercentage: decimal('attendance_percentage', { precision: 5, scale: 2 }),
  tasksCompleted: integer('tasks_completed').default(0),
  averageSatisfactionRating: decimal('average_satisfaction_rating', { precision: 3, scale: 2 }),
  
  status: varchar('status', { length: 20 }).default('generated'),
  paymentReference: varchar('payment_reference', { length: 100 }),
  paymentDate: date('payment_date'),

  verifiedBy: integer('verified_by').references(() => users.id),
  verifiedAt: timestamp('verified_at'),
  heldReason: text('held_reason'),
  heldBy: integer('held_by').references(() => users.id),
  heldAt: timestamp('held_at'),
  statusHistory: jsonb('status_history').default([]),

  sapDocEntry: integer('sap_doc_entry'),
  sapJeNumber: text('sap_je_number'),
  sapPostedAt: timestamp('sap_posted_at'),
  sapPostingStatus: varchar('sap_posting_status', { length: 20 }),
  sapErrorMessage: text('sap_error_message'),
  sapPayloadStatus: varchar('sap_payload_status', { length: 20 }).default('not_ready'),
  sapRequestLog: jsonb('sap_request_log'),
  sapResponseLog: jsonb('sap_response_log'),

  reversalSapDocEntry: integer('reversal_sap_doc_entry'),
  reversalSapJeNumber: text('reversal_sap_je_number'),
  reversalSapPostedAt: timestamp('reversal_sap_posted_at'),
  reversedBy: integer('reversed_by').references(() => users.id),
  reversedAt: timestamp('reversed_at'),
  reversalMemo: text('reversal_memo'),

  recordType: varchar('record_type', { length: 10 }).notNull().default('official'),
  trialRunNo: integer('trial_run_no'),
  trialStatus: varchar('trial_status', { length: 15 }),
  calculationEngineVersion: varchar('calculation_engine_version', { length: 20 }).notNull().default('legacy'),

  salarySource: varchar('salary_source', { length: 20 }).default('payroll_engine'),
  workerType: varchar('worker_type', { length: 20 }).default('regular'),
  manualSalaryEntryId: integer('manual_salary_entry_id'),

  verificationStatus: varchar('verification_status', { length: 20 }).default('pending'),
  verificationRunAt: timestamp('verification_run_at'),
  verificationRunBy: integer('verification_run_by').references(() => users.id),
  verificationDetails: jsonb('verification_details'),
  verificationOverrideReason: text('verification_override_reason'),
  verificationOverrideBy: integer('verification_override_by').references(() => users.id),
  verificationOverrideAt: timestamp('verification_override_at'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Manual Salary Entries for Contract Workers
export const manualSalaryEntries = pgTable('manual_salary_entries', {
  id: serial('id').primaryKey(),
  periodId: integer('period_id').notNull().references(() => payrollPeriods.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  payrollRecordId: integer('payroll_record_id').references(() => payrollRecords.id),

  entryType: varchar('entry_type', { length: 20 }).default('daily'),
  daysWorked: decimal('days_worked', { precision: 5, scale: 2 }).default('0'),
  hoursWorked: decimal('hours_worked', { precision: 6, scale: 2 }).default('0'),
  quantity: decimal('quantity', { precision: 10, scale: 2 }).default('0'),
  baseRate: decimal('base_rate', { precision: 12, scale: 2 }).notNull(),

  overtimeHours: decimal('overtime_hours', { precision: 6, scale: 2 }).default('0'),
  overtimeRateMultiplier: decimal('overtime_rate_multiplier', { precision: 3, scale: 2 }).default('1.5'),
  overtimeEarned: decimal('overtime_earned', { precision: 12, scale: 2 }).default('0'),

  baseEarnings: decimal('base_earnings', { precision: 12, scale: 2 }).default('0'),
  grossEarnings: decimal('gross_earnings', { precision: 12, scale: 2 }).default('0'),

  pfAmount: decimal('pf_amount', { precision: 10, scale: 2 }).default('0'),
  ptAmount: decimal('pt_amount', { precision: 10, scale: 2 }).default('0'),
  esicAmount: decimal('esic_amount', { precision: 10, scale: 2 }).default('0'),
  tdsAmount: decimal('tds_amount', { precision: 10, scale: 2 }).default('0'),
  tdsSection: varchar('tds_section', { length: 10 }).default('194C'),
  totalDeductions: decimal('total_deductions', { precision: 10, scale: 2 }).default('0'),
  netPay: decimal('net_pay', { precision: 12, scale: 2 }).default('0'),

  entryPurpose: varchar('entry_purpose', { length: 30 }).default('full_salary'),
  remarks: text('remarks'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertManualSalaryEntrySchema = createInsertSchema(manualSalaryEntries).omit({ id: true, createdAt: true, updatedAt: true });
export type ManualSalaryEntry = typeof manualSalaryEntries.$inferSelect;
export type InsertManualSalaryEntry = z.infer<typeof insertManualSalaryEntrySchema>;

// Payroll settings
export const payrollSettings = pgTable('payroll_settings', {
  id: serial('id').primaryKey(),
  settingName: varchar('setting_name', { length: 100 }).notNull().unique(),
  settingValue: text('setting_value').notNull(),
  dataType: varchar('data_type', { length: 20 }).default('string'),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedBy: integer('updated_by').references(() => users.id),
});

// Employee Loans
export const employeeLoans = pgTable('employee_loans', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull().references(() => users.id),
  loanType: varchar('loan_type', { length: 30 }).notNull(), // personal, housing, vehicle, emergency, other
  loanReference: varchar('loan_reference', { length: 50 }).notNull().unique(),
  approvedRequestReference: varchar('approved_request_reference', { length: 100 }),
  principalAmount: decimal('principal_amount', { precision: 12, scale: 2 }).notNull(),
  interestRate: decimal('interest_rate', { precision: 5, scale: 2 }).default('0'),
  emiAmount: decimal('emi_amount', { precision: 10, scale: 2 }).notNull(),
  tenureMonths: integer('tenure_months').notNull(),
  disbursementDate: text('disbursement_date').notNull(),
  startDeductionDate: text('start_deduction_date').notNull(),
  totalRepaid: decimal('total_repaid', { precision: 12, scale: 2 }).default('0'),
  outstandingBalance: decimal('outstanding_balance', { precision: 12, scale: 2 }).notNull(),
  installmentsPaid: integer('installments_paid').default(0),
  status: varchar('status', { length: 20 }).default('active'), // active, paused, closed, written_off
  remarks: text('remarks'),
  approvedBy: integer('approved_by').references(() => users.id),
  createdBy: integer('created_by').references(() => users.id),
  sapDocEntry: integer('sap_doc_entry'),
  sapJeNumber: varchar('sap_je_number', { length: 50 }),
  sapPostingStatus: varchar('sap_posting_status', { length: 20 }).default('not_posted'),
  sapPostedAt: timestamp('sap_posted_at'),
  sapErrorMessage: text('sap_error_message'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Employee Loan Repayments
export const employeeLoanRepayments = pgTable('employee_loan_repayments', {
  id: serial('id').primaryKey(),
  loanId: integer('loan_id').notNull().references(() => employeeLoans.id),
  employeeId: integer('employee_id').notNull().references(() => users.id),
  installmentNumber: integer('installment_number').notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  repaymentDate: text('repayment_date'),
  payrollRecordId: integer('payroll_record_id').references(() => payrollRecords.id),
  payrollPeriodId: integer('payroll_period_id').references(() => payrollPeriods.id),
  runNumber: integer('run_number'),
  balanceAfter: decimal('balance_after', { precision: 12, scale: 2 }),
  status: varchar('status', { length: 20 }).default('pending'), // deducted, reversed, pending, partial, skipped
  reversedAt: timestamp('reversed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Employee Advances
export const employeeAdvances = pgTable('employee_advances', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull().references(() => users.id),
  advanceReference: varchar('advance_reference', { length: 50 }).notNull().unique(),
  approvedRequestReference: varchar('approved_request_reference', { length: 100 }),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  recoveryType: varchar('recovery_type', { length: 20 }).notNull(), // lump_sum, installment
  recoveryAmount: decimal('recovery_amount', { precision: 10, scale: 2 }),
  recoveryMonths: integer('recovery_months'),
  advanceDate: text('advance_date').notNull(),
  startRecoveryDate: text('start_recovery_date').notNull(),
  totalRecovered: decimal('total_recovered', { precision: 12, scale: 2 }).default('0'),
  outstandingBalance: decimal('outstanding_balance', { precision: 12, scale: 2 }).notNull(),
  installmentsRecovered: integer('installments_recovered').default(0),
  status: varchar('status', { length: 20 }).default('active'), // active, paused, closed, written_off
  reason: text('reason'),
  approvedBy: integer('approved_by').references(() => users.id),
  createdBy: integer('created_by').references(() => users.id),
  sapDocEntry: integer('sap_doc_entry'),
  sapJeNumber: varchar('sap_je_number', { length: 50 }),
  sapPostingStatus: varchar('sap_posting_status', { length: 20 }).default('not_posted'),
  sapPostedAt: timestamp('sap_posted_at'),
  sapErrorMessage: text('sap_error_message'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Employee Advance Recoveries
export const employeeAdvanceRecoveries = pgTable('employee_advance_recoveries', {
  id: serial('id').primaryKey(),
  advanceId: integer('advance_id').notNull().references(() => employeeAdvances.id),
  employeeId: integer('employee_id').notNull().references(() => users.id),
  installmentNumber: integer('installment_number').notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  recoveryDate: text('recovery_date'),
  payrollRecordId: integer('payroll_record_id').references(() => payrollRecords.id),
  payrollPeriodId: integer('payroll_period_id').references(() => payrollPeriods.id),
  runNumber: integer('run_number'),
  balanceAfter: decimal('balance_after', { precision: 12, scale: 2 }),
  status: varchar('status', { length: 20 }).default('pending'), // deducted, reversed, pending, partial, skipped
  reversedAt: timestamp('reversed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertEmployeeLoanSchema = createInsertSchema(employeeLoans).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEmployeeLoanRepaymentSchema = createInsertSchema(employeeLoanRepayments).omit({ id: true, createdAt: true });
export const insertEmployeeAdvanceSchema = createInsertSchema(employeeAdvances).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEmployeeAdvanceRecoverySchema = createInsertSchema(employeeAdvanceRecoveries).omit({ id: true, createdAt: true });

export type EmployeeLoan = typeof employeeLoans.$inferSelect;
export type InsertEmployeeLoan = z.infer<typeof insertEmployeeLoanSchema>;
export type EmployeeLoanRepayment = typeof employeeLoanRepayments.$inferSelect;
export type EmployeeAdvance = typeof employeeAdvances.$inferSelect;
export type InsertEmployeeAdvance = z.infer<typeof insertEmployeeAdvanceSchema>;
export type EmployeeAdvanceRecovery = typeof employeeAdvanceRecoveries.$inferSelect;

// Bonus calculation rules
export const bonusRules = pgTable('bonus_rules', {
  id: serial('id').primaryKey(),
  ruleName: varchar('rule_name', { length: 100 }).notNull(),
  ruleType: varchar('rule_type', { length: 30 }).notNull(),
  minThreshold: decimal('min_threshold', { precision: 5, scale: 2 }).notNull(),
  maxThreshold: decimal('max_threshold', { precision: 5, scale: 2 }),
  bonusPercentage: decimal('bonus_percentage', { precision: 5, scale: 2 }),
  fixedAmount: decimal('fixed_amount', { precision: 10, scale: 2 }),
  isPercentage: boolean('is_percentage').default(true),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});



// Payroll approval workflow
export const payrollApprovals = pgTable('payroll_approvals', {
  id: serial('id').primaryKey(),
  periodId: integer('period_id').notNull().references(() => payrollPeriods.id, { onDelete: 'cascade' }),
  approvedBy: integer('approved_by').notNull().references(() => users.id),
  approvalLevel: integer('approval_level').default(1),
  approvalStatus: varchar('approval_status', { length: 20 }).default('pending'),
  approvalComments: text('approval_comments'),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Payroll Run Log - step-by-step execution audit trail
export const payrollRunLog = pgTable('payroll_run_log', {
  id: serial('id').primaryKey(),
  periodId: integer('period_id').notNull().references(() => payrollPeriods.id, { onDelete: 'cascade' }),
  runNumber: integer('run_number').notNull(),
  step: varchar('step', { length: 30 }).notNull(),
  attemptNumber: integer('attempt_number').notNull().default(1),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  executedBy: integer('executed_by').references(() => users.id),
  employeesProcessed: integer('employees_processed').default(0),
  employeesSkipped: integer('employees_skipped').default(0),
  errorCount: integer('error_count').default(0),
  summary: jsonb('summary').default({}),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Payroll Exceptions - structured exception records from pipeline steps
export const payrollExceptions = pgTable('payroll_exceptions', {
  id: serial('id').primaryKey(),
  periodId: integer('period_id').notNull().references(() => payrollPeriods.id, { onDelete: 'cascade' }),
  runNumber: integer('run_number').notNull(),
  step: varchar('step', { length: 30 }).notNull(),
  userId: integer('user_id').references(() => users.id),
  exceptionType: varchar('exception_type', { length: 30 }).notNull(),
  severity: varchar('severity', { length: 10 }).notNull().default('warning'),
  title: varchar('title', { length: 200 }).notNull(),
  details: text('details'),
  dataSnapshot: jsonb('data_snapshot'),
  resolution: varchar('resolution', { length: 20 }).default('unresolved'),
  resolvedBy: integer('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at'),
  resolutionNotes: text('resolution_notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Payroll Locks - period + module-level locking with audit trail
export const payrollLocks = pgTable('payroll_locks', {
  id: serial('id').primaryKey(),
  periodId: integer('period_id').notNull().references(() => payrollPeriods.id, { onDelete: 'cascade' }),
  lockType: varchar('lock_type', { length: 20 }).notNull(),
  isLocked: boolean('is_locked').notNull().default(true),
  lockedAt: timestamp('locked_at').defaultNow().notNull(),
  lockedBy: integer('locked_by').notNull().references(() => users.id),
  lockReason: text('lock_reason'),
  unlockedAt: timestamp('unlocked_at'),
  unlockedBy: integer('unlocked_by').references(() => users.id),
  unlockReason: text('unlock_reason'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Payroll Lock Exceptions - employee-specific unlock with audit
export const payrollLockExceptions = pgTable('payroll_lock_exceptions', {
  id: serial('id').primaryKey(),
  lockId: integer('lock_id').notNull().references(() => payrollLocks.id, { onDelete: 'cascade' }),
  periodId: integer('period_id').notNull().references(() => payrollPeriods.id, { onDelete: 'cascade' }),
  requestedBy: integer('requested_by').references(() => users.id),
  requestReason: text('request_reason').notNull(),
  status: varchar('status', { length: 20 }).default('pending'),
  approvedBy: integer('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  rejectionReason: text('rejection_reason'),
  changesDescription: text('changes_description'),
  closedAt: timestamp('closed_at'),
  closedBy: integer('closed_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});

// Payroll Attendance Snapshot - frozen attendance data for audit
export const payrollAttendanceSnapshot = pgTable('payroll_attendance_snapshot', {
  id: serial('id').primaryKey(),
  periodId: integer('period_id').notNull().references(() => payrollPeriods.id, { onDelete: 'cascade' }),
  runNumber: integer('run_number').notNull(),
  userId: integer('user_id').notNull().references(() => users.id),
  totalWorkingDays: integer('total_working_days').notNull(),
  presentDays: decimal('present_days', { precision: 5, scale: 2 }).notNull(),
  absentDays: decimal('absent_days', { precision: 5, scale: 2 }).notNull(),
  halfDays: decimal('half_days', { precision: 5, scale: 2 }).default('0'),
  lateDays: integer('late_days').default(0),
  paidLeaveDays: decimal('paid_leave_days', { precision: 5, scale: 2 }).default('0'),
  unpaidLeaveDays: decimal('unpaid_leave_days', { precision: 5, scale: 2 }).default('0'),
  lopDays: decimal('lop_days', { precision: 5, scale: 2 }).default('0'),
  overtimeHours: decimal('overtime_hours', { precision: 6, scale: 2 }).default('0'),
  companyHolidays: integer('company_holidays').default(0),
  weeklyOffs: integer('weekly_offs').default(0),
  paidDays: decimal('paid_days', { precision: 5, scale: 2 }).notNull(),
  autoLeaveApplied: jsonb('auto_leave_applied').default([]),
  dailyBreakdown: jsonb('daily_breakdown'),
  // Sandwich deduction tracking
  sandwichPaidDays: decimal('sandwich_paid_days', { precision: 5, scale: 2 }).default('0'),
  sandwichLwpDays: decimal('sandwich_lwp_days', { precision: 5, scale: 2 }).default('0'),
  // LOP confirmation gate — salary step blocked until HR confirms
  lopDaysComputed: decimal('lop_days_computed', { precision: 5, scale: 2 }),
  lopDaysConfirmed: decimal('lop_days_confirmed', { precision: 5, scale: 2 }),
  lopConfirmedBy: integer('lop_confirmed_by'),
  lopConfirmedAt: timestamp('lop_confirmed_at'),
  lopOverrideNotes: text('lop_override_notes'),
  // LWP exemption applied flag
  lwpExemptApplied: boolean('lwp_exempt_applied').default(false),
  // Days of leave balance auto-cover applied by engine (set in stepLeaveConsolidation,
  // consumed as an actual DB deduction in stepSalaryCalculation for official runs)
  balanceCoveredDays: decimal('balance_covered_days', { precision: 5, scale: 2 }).default('0'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  uniquePerRunUser: uniqueIndex('payroll_att_snap_period_run_user').on(table.periodId, table.runNumber, table.userId),
}));

// Payroll Leave Auto-Cover Log — one row per official payroll run per (user × leave_type)
// Created by stepSalaryCalculation when available paid-leave balance is applied to cover LOP.
// Reversed automatically when the payroll record is voided or SAP-reversed.
export const payrollLeaveAutocover = pgTable('payroll_leave_autocover', {
  id: serial('id').primaryKey(),
  payrollRecordId: integer('payroll_record_id').notNull().references(() => payrollRecords.id, { onDelete: 'cascade' }),
  periodId: integer('period_id').notNull().references(() => payrollPeriods.id),
  runNumber: integer('run_number').notNull(),
  userId: integer('user_id').notNull().references(() => users.id),
  leaveTypeId: integer('leave_type_id').notNull().references(() => leaveTypes.id),
  daysDeducted: decimal('days_deducted', { precision: 5, scale: 2 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('applied'), // 'applied' | 'reversed'
  appliedAt: timestamp('applied_at').notNull().defaultNow(),
  reversedBy: integer('reversed_by').references(() => users.id),
  reversedAt: timestamp('reversed_at'),
  notes: text('notes'),
}, (table) => ({
  uniquePerRunUserType: uniqueIndex('payroll_autocover_run_user_type').on(table.periodId, table.runNumber, table.userId, table.leaveTypeId),
}));

export const insertPayrollLeaveAutocoverSchema = createInsertSchema(payrollLeaveAutocover)
  .omit({ id: true, appliedAt: true });
export type PayrollLeaveAutocover = typeof payrollLeaveAutocover.$inferSelect;

// Payroll Salary Snapshot - frozen salary master for audit
export const payrollSalarySnapshot = pgTable('payroll_salary_snapshot', {
  id: serial('id').primaryKey(),
  periodId: integer('period_id').notNull().references(() => payrollPeriods.id, { onDelete: 'cascade' }),
  runNumber: integer('run_number').notNull(),
  userId: integer('user_id').notNull().references(() => users.id),
  salaryRecordId: integer('salary_record_id').notNull().references(() => employeeSalaries.id),
  baseSalary: decimal('base_salary', { precision: 12, scale: 2 }).notNull(),
  basicSalary: decimal('basic_salary', { precision: 12, scale: 2 }),
  houseRentAllowance: decimal('house_rent_allowance', { precision: 10, scale: 2 }),
  conveyance: decimal('conveyance', { precision: 10, scale: 2 }),
  lta: decimal('lta', { precision: 10, scale: 2 }),
  specialAllowance: decimal('special_allowance', { precision: 10, scale: 2 }),
  supplementaryAllowance: decimal('supplementary_allowance', { precision: 10, scale: 2 }),
  kgpAllowance: decimal('kgp_allowance', { precision: 10, scale: 2 }),
  bonus: decimal('bonus', { precision: 10, scale: 2 }),
  salaryType: varchar('salary_type', { length: 20 }),
  workingHoursPerDay: integer('working_hours_per_day'),
  otRate: decimal('ot_rate', { precision: 10, scale: 2 }),
  otMultiplier: decimal('ot_multiplier', { precision: 5, scale: 2 }),
  employeePfContribution: decimal('employee_pf_contribution', { precision: 10, scale: 2 }),
  employerPfContribution: decimal('employer_pf_contribution', { precision: 10, scale: 2 }),
  employeeEsicContribution: decimal('employee_esic_contribution', { precision: 10, scale: 2 }),
  employerEsicContribution: decimal('employer_esic_contribution', { precision: 10, scale: 2 }),
  groupInsurance: decimal('group_insurance', { precision: 10, scale: 2 }),
  professionalTax: decimal('professional_tax', { precision: 10, scale: 2 }),
  takeHomeSalary: decimal('take_home_salary', { precision: 12, scale: 2 }),
  ctcMonthly: decimal('ctc_monthly', { precision: 12, scale: 2 }),
  ctcYearly: decimal('ctc_yearly', { precision: 12, scale: 2 }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  uniquePerRunUser: uniqueIndex('payroll_sal_snap_period_run_user').on(table.periodId, table.runNumber, table.userId),
}));

// ============================================================================
// INCOME TAX / TDS ENGINE (Phase 2)
// ============================================================================

export const taxSlabs = pgTable('tax_slabs', {
  id: serial('id').primaryKey(),
  regime: varchar('regime', { length: 10 }).notNull(),
  financialYear: varchar('financial_year', { length: 10 }).notNull(),
  slabOrder: integer('slab_order').notNull(),
  minIncome: decimal('min_income', { precision: 15, scale: 2 }).notNull(),
  maxIncome: decimal('max_income', { precision: 15, scale: 2 }),
  rate: decimal('rate', { precision: 5, scale: 2 }).notNull(),
  cessRate: decimal('cess_rate', { precision: 5, scale: 2 }).default('4.00'),
  surchargeRate: decimal('surcharge_rate', { precision: 5, scale: 2 }).default('0'),
  surchargeThreshold: decimal('surcharge_threshold', { precision: 15, scale: 2 }),
  standardDeduction: decimal('standard_deduction', { precision: 10, scale: 2 }).default('50000'),
  section87aRebateLimit: decimal('section87a_rebate_limit', { precision: 10, scale: 2 }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const employeeTaxDeclarations = pgTable('employee_tax_declarations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  financialYear: varchar('financial_year', { length: 10 }).notNull(),
  regime: varchar('regime', { length: 10 }).notNull().default('new'),
  regimeLocked: boolean('regime_locked').default(false),

  monthlyRentPaid: decimal('monthly_rent_paid', { precision: 10, scale: 2 }).default('0'),
  isMetroCity: boolean('is_metro_city').default(false),

  section80c: decimal('section80c', { precision: 10, scale: 2 }).default('0'),
  section80ccd1b: decimal('section80ccd1b', { precision: 10, scale: 2 }).default('0'),
  section80d: decimal('section80d', { precision: 10, scale: 2 }).default('0'),
  section80dParents: decimal('section80d_parents', { precision: 10, scale: 2 }).default('0'),
  section80e: decimal('section80e', { precision: 10, scale: 2 }).default('0'),
  section80g: decimal('section80g', { precision: 10, scale: 2 }).default('0'),
  section80tta: decimal('section80tta', { precision: 10, scale: 2 }).default('0'),
  section24b: decimal('section24b', { precision: 10, scale: 2 }).default('0'),
  otherDeductions: decimal('other_deductions', { precision: 10, scale: 2 }).default('0'),
  otherDeductionsDescription: text('other_deductions_description'),

  previousEmployerIncome: decimal('previous_employer_income', { precision: 12, scale: 2 }).default('0'),
  previousEmployerTds: decimal('previous_employer_tds', { precision: 10, scale: 2 }).default('0'),
  otherIncome: decimal('other_income', { precision: 12, scale: 2 }).default('0'),

  status: varchar('status', { length: 20 }).default('draft'),
  submittedAt: timestamp('submitted_at'),
  approvedBy: integer('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  remarks: text('remarks'),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  uniqueUserYear: uniqueIndex('emp_tax_decl_user_fy').on(table.userId, table.financialYear),
}));

export const employeeInvestmentProofs = pgTable('employee_investment_proofs', {
  id: serial('id').primaryKey(),
  declarationId: integer('declaration_id').notNull().references(() => employeeTaxDeclarations.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  section: varchar('section', { length: 20 }).notNull(),
  description: text('description').notNull(),
  declaredAmount: decimal('declared_amount', { precision: 10, scale: 2 }).notNull(),
  proofAmount: decimal('proof_amount', { precision: 10, scale: 2 }),
  proofStatus: varchar('proof_status', { length: 20 }).default('pending'),
  proofDocumentKey: text('proof_document_key'),
  verifiedBy: integer('verified_by').references(() => users.id),
  verifiedAt: timestamp('verified_at'),
  verificationNotes: text('verification_notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const tdsMonthlyRecords = pgTable('tds_monthly_records', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  periodId: integer('period_id').references(() => payrollPeriods.id, { onDelete: 'cascade' }),
  financialYear: varchar('financial_year', { length: 10 }).notNull(),
  month: integer('month').notNull(),
  year: integer('year').notNull(),

  grossSalaryMonthly: decimal('gross_salary_monthly', { precision: 12, scale: 2 }).notNull(),
  grossSalaryYtd: decimal('gross_salary_ytd', { precision: 12, scale: 2 }).notNull(),
  grossSalaryProjected: decimal('gross_salary_projected', { precision: 15, scale: 2 }).notNull(),

  standardDeduction: decimal('standard_deduction', { precision: 10, scale: 2 }).default('50000'),
  hraExemption: decimal('hra_exemption', { precision: 10, scale: 2 }).default('0'),
  section80cDeduction: decimal('section80c_deduction', { precision: 10, scale: 2 }).default('0'),
  section80dDeduction: decimal('section80d_deduction', { precision: 10, scale: 2 }).default('0'),
  otherChapter6aDeductions: decimal('other_chapter6a_deductions', { precision: 10, scale: 2 }).default('0'),
  section24bDeduction: decimal('section24b_deduction', { precision: 10, scale: 2 }).default('0'),
  totalDeductions: decimal('total_deductions', { precision: 12, scale: 2 }).default('0'),

  taxableIncomeProjected: decimal('taxable_income_projected', { precision: 15, scale: 2 }).notNull(),
  taxOnProjectedIncome: decimal('tax_on_projected_income', { precision: 12, scale: 2 }).notNull(),
  cessAmount: decimal('cess_amount', { precision: 10, scale: 2 }).default('0'),
  surchargeAmount: decimal('surcharge_amount', { precision: 10, scale: 2 }).default('0'),
  section87aRebate: decimal('section87a_rebate', { precision: 10, scale: 2 }).default('0'),
  totalTaxLiabilityAnnual: decimal('total_tax_liability_annual', { precision: 12, scale: 2 }).notNull(),

  tdsDeductedYtd: decimal('tds_deducted_ytd', { precision: 12, scale: 2 }).default('0'),
  previousEmployerTds: decimal('previous_employer_tds', { precision: 10, scale: 2 }).default('0'),
  tdsRequiredMonthly: decimal('tds_required_monthly', { precision: 10, scale: 2 }).notNull(),
  catchUpAdjustment: decimal('catch_up_adjustment', { precision: 10, scale: 2 }).default('0'),
  tdsActualMonthly: decimal('tds_actual_monthly', { precision: 10, scale: 2 }).notNull(),

  regime: varchar('regime', { length: 10 }).notNull(),
  calculationSnapshot: jsonb('calculation_snapshot'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  uniqueUserPeriod: uniqueIndex('tds_monthly_user_period').on(table.userId, table.periodId),
}));

// Material Inspection Links - for traceability
export const materialInspectionLinks = pgTable('material_inspection_links', {
  id: serial('id').primaryKey(),
  inspectionOrderId: integer('inspection_order_id').notNull().references(() => inspectionOrders.id, { onDelete: 'cascade' }),
  materialId: integer('material_id').notNull().references(() => materialIdentification.id, { onDelete: 'cascade' }),
  materialIdentificationId: text('material_identification_id').notNull(),
  materialCertificateNumber: text('material_certificate_number'),
  heatNumber: text('heat_number'),
  materialGrade: text('material_grade'),
  materialSpecification: text('material_specification'),
  allocatedQuantity: text('allocated_quantity'),
  quantityUnit: text('quantity_unit'),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Relations for material inspection links
export const materialInspectionLinksRelations = relations(materialInspectionLinks, ({ one }) => ({
  inspectionOrder: one(inspectionOrders, {
    fields: [materialInspectionLinks.inspectionOrderId],
    references: [inspectionOrders.id],
  }),
  material: one(materialIdentification, {
    fields: [materialInspectionLinks.materialId],
    references: [materialIdentification.id],
  }),
}));

// Schemas for material inspection links
export const insertMaterialInspectionLinkSchema = createInsertSchema(materialInspectionLinks)
  .omit({ id: true, createdAt: true, updatedAt: true });

// ROI Project Steps table for step-by-step saving
export const roiProjectSteps = pgTable('roi_project_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  roiProjectId: uuid('roi_project_id').notNull(),
  stepNumber: integer('step_number').notNull(),
  stepData: jsonb('step_data').notNull(),
  updatedBy: integer('updated_by').notNull().references(() => users.id),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ROI Project Steps relations
export const roiProjectStepsRelations = relations(roiProjectSteps, ({ one }) => ({
  updater: one(users, {
    fields: [roiProjectSteps.updatedBy],
    references: [users.id],
  }),
}));

// ROI Project Steps schema for validation
export const insertRoiProjectStepSchema = createInsertSchema(roiProjectSteps)
  .omit({ id: true, updatedAt: true })
  .extend({
    roiProjectId: z.string().uuid(),
    stepNumber: z.number().int().min(1).max(7),
    stepData: z.record(z.any()),
    updatedBy: z.number().int().positive(),
  });

// Export ROI Project Steps types
export type RoiProjectStep = typeof roiProjectSteps.$inferSelect;
export type InsertRoiProjectStep = z.infer<typeof insertRoiProjectStepSchema>;

// Export types
export type InspectionOrder = typeof inspectionOrders.$inferSelect;
export type InsertInspectionOrder = z.infer<typeof insertInspectionOrderSchema>;

export type InspectionOrderItem = typeof inspectionOrderItems.$inferSelect;
export type InsertInspectionOrderItem = z.infer<typeof insertInspectionOrderItemSchema>;

export type MaterialInspectionLink = typeof materialInspectionLinks.$inferSelect;
export type InsertMaterialInspectionLink = z.infer<typeof insertMaterialInspectionLinkSchema>;

// WPS Documents schema
export const wpsDocuments = pgTable('wps_documents', {
  id: serial('id').primaryKey(),
  wpsId: varchar('wps_id', { length: 50 }).notNull().unique(),
  pqrId: varchar('pqr_id', { length: 50 }).notNull().unique(),
  revisionNo: varchar('revision_no', { length: 10 }).notNull().default('0'),
  welderProcess: varchar('welder_process', { length: 50 }).notNull(),
  baseMetalGrade: varchar('base_metal_grade', { length: 100 }).notNull(),
  baseMetalThickness: varchar('base_metal_thickness', { length: 50 }).notNull(),
  fillerMaterial: varchar('filler_material', { length: 100 }).notNull(),
  jointType: varchar('joint_type', { length: 50 }).notNull(),
  weldPosition: varchar('weld_position', { length: 50 }).notNull(),
  preheatingTemp: varchar('preheating_temp', { length: 50 }),
  postWeldHeatTreatment: varchar('post_weld_heat_treatment', { length: 100 }),
  electricalParameters: jsonb('electrical_parameters'),
  shieldingGas: varchar('shielding_gas', { length: 100 }),
  documentFilePath: varchar('document_file_path', { length: 255 }),
  documentUrl: text('document_url'),
  combinedDocumentFilePath: varchar('combined_document_file_path', { length: 255 }),
  combinedDocumentUrl: text('combined_document_url'),
  status: varchar('status', { length: 20 }).notNull().default('Draft'),
  remarks: text('remarks'),
  approvedBy: integer('approved_by').references(() => users.id),
  approvalDate: timestamp('approval_date'),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// New simplified WPQR Documents schema
export const wpqrDocuments = pgTable('wpqr_documents', {
  id: serial('id').primaryKey(),
  documentId: varchar('document_id', { length: 50 }).notNull().unique(),
  title: varchar('title', { length: 100 }).notNull(),
  description: text('description'),
  welderProcess: varchar('welder_process', { length: 50 }).notNull(),
  baseMetalGrade: varchar('base_metal_grade', { length: 100 }).notNull(),
  jointType: varchar('joint_type', { length: 50 }).notNull(),
  certificateNo: varchar('certificate_no', { length: 100 }),
  inspectionAuthority: varchar('inspection_authority', { length: 50 }),
  filePath: varchar('file_path', { length: 255 }),
  fileUrl: text('file_url'),
  status: varchar('status', { length: 20 }).notNull().default('Active'),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// WPQR-Welder junction table for many-to-many relationship
export const wpqrWelders = pgTable('wpqr_welders', {
  id: serial('id').primaryKey(),
  wpqrDocumentId: integer('wpqr_document_id').notNull().references(() => wpqrDocuments.id),
  welderId: integer('welder_id').notNull().references(() => welders.id),
  linkedAt: timestamp('linked_at').notNull().defaultNow(),
  linkedBy: integer('linked_by').notNull().references(() => users.id),
});

// WPQR Documents relations
export const wpqrDocumentsRelations = relations(wpqrDocuments, ({ one, many }) => ({
  creator: one(users, {
    fields: [wpqrDocuments.createdBy],
    references: [users.id],
  }),
  wpqrWelders: many(wpqrWelders),
}));

// WPQR-Welder junction table relations
export const wpqrWeldersRelations = relations(wpqrWelders, ({ one }) => ({
  wpqrDocument: one(wpqrDocuments, {
    fields: [wpqrWelders.wpqrDocumentId],
    references: [wpqrDocuments.id],
  }),
  welder: one(welders, {
    fields: [wpqrWelders.welderId],
    references: [welders.id],
  }),
  linkedByUser: one(users, {
    fields: [wpqrWelders.linkedBy],
    references: [users.id],
  }),
}));

// WPQR Document schema for validation
export const wpqrDocumentSchema = createInsertSchema(wpqrDocuments)
  .omit({ id: true, createdAt: true, updatedAt: true, fileUrl: true, filePath: true })
  .extend({
    welderProcess: z.enum([
      'SMAW', 
      'GMAW', 
      'GTAW', 
      'FCAW', 
      'SAW',
      'GTAW (141) + SMAW (111)',
      'GTAW (141) + GMAW (135)',
      'GTAW (141) + FCAW (136/137)',
      'SMAW (111) + GMAW (135)',
      'SMAW (111) + FCAW (136/137)',
      'SMAW (111) + SAW (121)',
      'GTAW (141) + SAW (121)',
      'GMAW (135) + FCAW (136/137)',
      'GMAW (135) + SAW (121)'
    ]),
    inspectionAuthority: z.enum(['TUV NORD', 'SGS']).optional(),
    certificateNo: z.string().optional(),
    status: z.enum(['Active', 'Obsolete']).default('Active'),
  });

// Export WPQR document types
export type WpqrDocument = typeof wpqrDocuments.$inferSelect;
export type InsertWpqrDocument = z.infer<typeof wpqrDocumentSchema>;

// Export WPQR-Welder junction table types
export type WpqrWelder = typeof wpqrWelders.$inferSelect;
export type InsertWpqrWelder = typeof wpqrWelders.$inferInsert;



// Welders relations
export const weldersRelations = relations(welders, ({ many }) => ({
  wpqrWelders: many(wpqrWelders),
}));



// Export Welder types
export type Welder = typeof welders.$inferSelect;
export type InsertWelder = typeof welders.$inferInsert;

// WPS Documents relations
export const wpsDocumentsRelations = relations(wpsDocuments, ({ one }) => ({
  creator: one(users, {
    fields: [wpsDocuments.createdBy],
    references: [users.id],
  }),
  approver: one(users, {
    fields: [wpsDocuments.approvedBy],
    references: [users.id],
  }),
}));

// WPS Document schema for validation
export const wpsDocumentSchema = createInsertSchema(wpsDocuments)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    welderProcess: z.enum([
      'SMAW', 
      'GMAW', 
      'GTAW', 
      'FCAW', 
      'SAW',
      'GTAW (141) + SMAW (111)',
      'GTAW (141) + GMAW (135)',
      'GTAW (141) + FCAW (136/137)',
      'SMAW (111) + GMAW (135)',
      'SMAW (111) + FCAW (136/137)',
      'SMAW (111) + SAW (121)',
      'GTAW (141) + SAW (121)',
      'GMAW (135) + FCAW (136/137)',
      'GMAW (135) + SAW (121)'
    ]),
    status: z.enum(['Draft', 'Pending Approval', 'Approved', 'Obsolete']).default('Draft'),
  });

// Export WPS document types
export type WpsDocument = typeof wpsDocuments.$inferSelect;

// Exchange Rate Settings table for unified currency conversion
export const exchangeRateSettings = pgTable('exchange_rate_settings', {
  id: serial('id').primaryKey(),
  fromCurrency: varchar('from_currency', { length: 3 }).notNull().default('USD'),
  toCurrency: varchar('to_currency', { length: 3 }).notNull().default('INR'),
  exchangeRate: decimal('exchange_rate', { precision: 10, scale: 4 }).notNull(),
  source: varchar('source', { length: 50 }).notNull().default('manual'), // 'api' or 'manual'
  apiLastUpdated: timestamp('api_last_updated'),
  isActive: boolean('is_active').notNull().default(true),
  updatedBy: integer('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Exchange Rate Settings relations
export const exchangeRateSettingsRelations = relations(exchangeRateSettings, ({ one }) => ({
  updatedByUser: one(users, {
    fields: [exchangeRateSettings.updatedBy],
    references: [users.id],
  }),
}));

// Exchange Rate Settings schema for validation
export const exchangeRateSettingSchema = createInsertSchema(exchangeRateSettings)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    fromCurrency: z.string().length(3).toUpperCase(),
    toCurrency: z.string().length(3).toUpperCase(),
    exchangeRate: z.number().positive(),
    source: z.enum(['api', 'manual']),
    isActive: z.boolean().default(true),
  });

// Export Exchange Rate Setting types
export type ExchangeRateSetting = typeof exchangeRateSettings.$inferSelect;
export type InsertExchangeRateSetting = z.infer<typeof exchangeRateSettingSchema>;

// Material Identification tables
export const materialIdentification = pgTable('material_identification', {
  id: serial('id').primaryKey(),
  materialIdentificationId: varchar('material_identification_id', { length: 255 }).notNull().unique(),
  projectId: integer('project_id').notNull().references(() => projects.id),
  projectNumber: varchar('project_number', { length: 255 }),
  projectName: varchar('project_name', { length: 255 }),
  inspectionOrderNumber: varchar('inspection_order_number', { length: 255 }),
  
  // Material Identification details
  materialType: varchar('material_type', { length: 255 }),
  materialDescription: text('material_description').notNull(),
  materialCode: varchar('material_code', { length: 255 }).notNull(),
  specification: varchar('specification', { length: 255 }).notNull(),
  materialGrade: varchar('material_grade', { length: 255 }).notNull(),
  heatNumber: varchar('heat_number', { length: 255 }).notNull(),
  batchNumber: varchar('batch_number', { length: 255 }),
  millName: varchar('mill_name', { length: 255 }).notNull(),
  millTestCertificateNumber: varchar('mill_test_certificate_number', { length: 255 }).notNull(),
  quantity: varchar('quantity', { length: 255 }).notNull(),
  unit: varchar('unit', { length: 50 }).notNull(),
  dimensions: varchar('dimensions', { length: 255 }).notNull(),
  materialStatus: varchar('material_status', { length: 255 }).notNull(),
  
  // Inspection details
  inspectorName: varchar('inspector_name', { length: 255 }).notNull(),
  inspectionDate: date('inspection_date').notNull(),
  remarks: text('remarks'),
  
  // Tracking and metadata
  createdBy: integer('created_by').notNull().references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Counter table for MI ID sequence numbers
export const materialIdentificationCounter = pgTable('material_identification_counter', {
  year: integer('year').primaryKey(),
  sequenceNumber: integer('sequence_number').notNull().default(0),
});



// Insert schemas for Material Identification
export const insertMaterialIdentificationSchema = createInsertSchema(materialIdentification)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    materialStatus: z.enum(['Accepted', 'Rejected', 'Hold']),
  });

export const insertMaterialIdentificationCounterSchema = createInsertSchema(materialIdentificationCounter);

// Export Material Identification types
export type MaterialIdentification = typeof materialIdentification.$inferSelect;
export type InsertMaterialIdentification = z.infer<typeof insertMaterialIdentificationSchema>;
export type InsertWpsDocument = z.infer<typeof wpsDocumentSchema>;

// PMA (Particular Material Appraisal) Documents schema
export const pmaDocuments = pgTable('pma_documents', {
  id: serial('id').primaryKey(),
  pmaNumber: varchar('pma_number', { length: 50 }).notNull().unique(),
  specification: varchar('specification', { length: 100 }).notNull(),
  grade: varchar('grade', { length: 100 }).notNull(),
  certifiedBy: varchar('certified_by', { length: 100 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('Draft'),
  remarks: text('remarks'),
  issueDate: date('issue_date').notNull(),
  expiryDate: date('expiry_date').notNull(),
  filePath: varchar('file_path', { length: 255 }),
  fileUrl: text('file_url'),
  originalFileName: varchar('original_file_name', { length: 255 }),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});



// PMA Documents relations
export const pmaDocumentsRelations = relations(pmaDocuments, ({ one }) => ({
  creator: one(users, {
    fields: [pmaDocuments.createdBy],
    references: [users.id],
  }),
}));



// Material Identification relations
export const materialIdentificationRelations = relations(materialIdentification, ({ one }) => ({
  project: one(projects, {
    fields: [materialIdentification.projectId],
    references: [projects.id],
  }),
  creator: one(users, {
    fields: [materialIdentification.createdBy],
    references: [users.id],
  }),
  updater: one(users, {
    fields: [materialIdentification.updatedBy],
    references: [users.id],
  }),
}));

// PMA Document schema for validation
export const pmaDocumentSchema = createInsertSchema(pmaDocuments)
  .omit({ id: true, createdAt: true, updatedAt: true, fileUrl: true, filePath: true, originalFileName: true, createdBy: true })
  .extend({
    pmaNumber: z.string().min(1, 'PMA Number is required'),
    specification: z.enum([
      'API', 'ASME', 'ASTM', 'ATEX', 'BS', 'DIN', 'EN', 'IECEx', 'ISO'
    ]),
    grade: z.enum([
      // Carbon Steel
      'SA-516 Gr 60', 'SA-516 Gr 70', 'SA-106 Gr B', 'SA-106 Gr C', 
      'SA-36', 'SA-537 Cl 1', 'SA-537 Cl 2', 'SA-53 Gr B',
      'SA-105', 'SA-234 WPB', 'SA 179', 'ASTM A36', 'ASTM A106 Gr B',
      'ASTM A333 Gr 6', 'ASTM A515 Gr 70', 'Gr.B',
      // Stainless Steel
      'SA-240 TP 304', 'SA-240 TP 304L', 'SA-240 TP 316', 'SA-240 TP 316L',
      'SA-240 TP 321', 'SA-240 TP 347', 'SA-312 TP 304', 'SA-312 TP 316L',
      'SA-240 Type 304', 'SA-240 Type 304L', 'SA-240 Type 316', 'SA-240 Type 316L',
      'SA-240 Type 321', 'SA-312 TP304', 'SA-312 TP304L', 'SA-312 TP316',
      'SA-312 TP316L', 'SA-213 TP304', 'SA-213 TP304L', 'SA-213 TP316',
      'SA-213 TP316L', 'SA-182 F304', 'SA-182 F316', 'SA-403 Gr. WP 316L',
      // Alloy Steel
      'SA-335 P11', 'SA-335 P22', 'SA-335 P91', 'SA-213 T11', 'SA-213 T22',
      'SA-387 Gr 11 Cl 2', 'SA-387 Gr 22 Cl 2', 'SA-182 F11', 'SA-182 F22', 
      'SA-234 WP11', 'SA-234 WP22',
      // API Grades
      'API 5L Gr B', 'API 5L X42', 'API 5L X52', 'API 5L X60',
      'API 5L X65', 'API 5L X70',
      // Duplex Steel
      'ASTM A240 UNS S31803 (2205)', 'ASTM A240 UNS S32750 (2507)',
      'ASTM A790 UNS S31803', 'ASTM A790 UNS S32750',
      // Bolts
      'SA-193 B7', 'SA-193 Gr. B8', 'SA-325 Type 1', 'SA-490 Type 1',
      // Nuts
      'SA-194 Gr. 8', 'SA-194 Gr. 2H', 'SA-194 2H', 'SA-194 7', 'SA-563 Grade A',
      // Gaskets
      'AF 159',
      // Other grades
      'A105', 'A350 LF2', 'A182 F304', 'A182 F316L'
    ]),
    certifiedBy: z.string().min(1, 'Certified By is required'),
    status: z.enum(['Draft', 'Active', 'Inactive']).default('Draft'),
    issueDate: z.string().min(1, 'Issue Date is required'),
    expiryDate: z.string().min(1, 'Expiry Date is required'),
    remarks: z.string().optional(),
  });

// Export PMA document types
export type PmaDocument = typeof pmaDocuments.$inferSelect;
export type InsertPmaDocument = z.infer<typeof pmaDocumentSchema>;

// Inspection Documents table for storing uploaded files associated with inspection records
export const inspectionDocuments = pgTable('inspection_documents', {
  id: serial('id').primaryKey(),
  inspectionOrderId: integer('inspection_order_id').notNull().references(() => inspectionOrders.id, { onDelete: 'cascade' }),
  tabName: text('tab_name').notNull(), // e.g., 'Welding & Weld Maps', 'NDT', etc.
  recordId: text('record_id').notNull(), // ID of the specific record in the tab e.g., 'W-1', 'NDT-1'
  fileName: text('file_name').notNull(),
  filePath: text('file_path').notNull(),
  fileUrl: text('file_url'),
  fileType: text('file_type'),
  fileSize: integer('file_size'),
  uploadedBy: integer('uploaded_by').references(() => users.id),
  itemCode: varchar('item_code', { length: 100 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Relations for inspection documents
export const inspectionDocumentsRelations = relations(inspectionDocuments, ({ one }) => ({
  inspectionOrder: one(inspectionOrders, {
    fields: [inspectionDocuments.inspectionOrderId],
    references: [inspectionOrders.id],
  }),
  uploader: one(users, {
    fields: [inspectionDocuments.uploadedBy],
    references: [users.id],
  }),
}));

// Insert schema for Inspection Documents
export const insertInspectionDocumentSchema = createInsertSchema(inspectionDocuments)
  .omit({ id: true, createdAt: true, updatedAt: true });

// Export Inspection Document types
export type InspectionDocument = typeof inspectionDocuments.$inferSelect;
export type InsertInspectionDocument = z.infer<typeof insertInspectionDocumentSchema>;

// =============================================
// Template Management Schema
// =============================================

// Available section types for final dossier templates
export const templateSectionTypes = [
  "Material Traceability", 
  "Welding & Weld Maps", 
  "NDT", 
  "Visual Inspection", 
  "Hydrotest", 
  "Non-Conformance"
] as const;

export type TemplateSectionType = typeof templateSectionTypes[number];

// Templates can have custom fields in each section
export interface TemplateSectionField {
  id: string;          // Unique identifier for the field
  name: string;        // Display name
  type: 'text' | 'checkbox' | 'date' | 'number' | 'select'; // Field type
  required: boolean;   // Is this field required?
  options?: string[];  // Options for select fields
  defaultValue?: any;  // Default value
  databaseTable?: string; // Database table this field maps to
  databaseColumn?: string; // Database column this field maps to
}

// Section configuration
export interface TemplateSection {
  type: TemplateSectionType;  // Which section
  title: string;              // Display title (customizable)
  enabled: boolean;           // Is this section enabled?
  fields: TemplateSectionField[]; // Custom fields in this section
}

// Available font sizes for templates
export const templateFontSizes = ["Small", "Medium", "Large"] as const;
export type TemplateFontSize = typeof templateFontSizes[number];

// Available paper sizes for templates
export const templatePaperSizes = ["A4", "Letter", "Legal"] as const;
export type TemplatePaperSize = typeof templatePaperSizes[number];

// Available page orientations for templates
export const templateOrientations = ["Portrait", "Landscape"] as const;
export type TemplateOrientation = typeof templateOrientations[number];

// Template for document generation (QMS Final Dossier templates, etc.)
export const reportTemplates = pgTable('report_templates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull().default('QMS Final Dossier'), // For future expansion to other template types
  
  // Layout options
  hasCoverPage: boolean('has_cover_page').notNull().default(true),
  hasFooter: boolean('has_footer').notNull().default(true),
  
  // Styling options
  fontSize: text('font_size').notNull().default('Medium'),
  headerText: text('header_text'),
  footerText: text('footer_text'),
  
  // Advanced options - new
  paperSize: text('paper_size').default('A4'),
  orientation: text('orientation').default('Portrait'),
  marginTop: integer('margin_top').default(25),
  marginBottom: integer('margin_bottom').default(25),
  marginLeft: integer('margin_left').default(25),
  marginRight: integer('margin_right').default(25),
  
  // Customized sections
  sectionConfigurations: jsonb('section_configurations').$type<TemplateSection[]>(),
  
  // Order of sections stored as JSON array (keeping for backward compatibility)
  sectionOrder: jsonb('section_order').$type<TemplateSectionType[]>(),
  
  // Company Logo settings
  showCompanyLogo: boolean('show_company_logo').default(true),
  logoPosition: text('logo_position').default('header'),
  
  // Is this the default template for its type?
  isDefault: boolean('is_default').notNull().default(false),
  
  // Tracking
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Relations for report templates
export const reportTemplatesRelations = relations(reportTemplates, ({ one }) => ({
  creator: one(users, {
    fields: [reportTemplates.createdBy],
    references: [users.id],
  }),
}));

// Insert schema for Report Templates
export const insertReportTemplateSchema = createInsertSchema(reportTemplates)
  .omit({ id: true, createdAt: true, updatedAt: true });

// Export Report Template types
export type ReportTemplate = typeof reportTemplates.$inferSelect;
export type InsertReportTemplate = z.infer<typeof insertReportTemplateSchema>;

//==============================================================================
// FINANCE MODULE
//==============================================================================

// Invoices table
export const invoices = pgTable('invoices', {
  id: serial('id').primaryKey(),
  invoiceNumber: varchar('invoice_number', { length: 50 }).notNull(),
  customerId: integer('customer_id').notNull(),
  projectId: integer('project_id'),
  issueDate: date('issue_date').notNull(),
  dueDate: date('due_date').notNull(),
  totalAmount: decimal('total_amount', { precision: 15, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('INR'),
  exchangeRate: decimal('exchange_rate', { precision: 10, scale: 4 }).default('1.0000'),
  status: varchar('status', { length: 20 }).notNull().default('Pending'),
  notes: text('notes'),
  // Export tracking fields
  isExport: boolean('is_export').default(false),
  exportDestinationCountry: varchar('export_destination_country', { length: 100 }),
  exportPort: varchar('export_port', { length: 100 }),
  shippingBillNumber: varchar('shipping_bill_number', { length: 100 }),
  shippingBillDate: date('shipping_bill_date'),
  brcRequired: boolean('brc_required').default(false),
  brcReceived: boolean('brc_received').default(false),
  // Credit note fields
  creditNoteNumber: varchar('credit_note_number', { length: 50 }),
  creditNoteDate: date('credit_note_date'),
  creditNoteAmount: decimal('credit_note_amount', { precision: 15, scale: 2 }),
  creditNoteReason: text('credit_note_reason'),
  creditedBy: integer('credited_by'),
  creditedAt: timestamp('credited_at'),
  createdBy: integer('created_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Invoice items table
export const invoiceItems = pgTable('invoice_items', {
  id: serial('id').primaryKey(),
  invoiceId: integer('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
  unitPrice: decimal('unit_price', { precision: 15, scale: 2 }).notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  amountLc: decimal('amount_lc', { precision: 15, scale: 2 }).default('0'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Payments table
export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  irmNo: varchar('irm_no', { length: 100 }),
  paymentDate: date('payment_date').notNull(),
  sapPaymentNo: varchar('sap_payment_no', { length: 100 }),
  paymentType: varchar('payment_type', { length: 20 }),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('INR'),
  paymentMethod: varchar('payment_method', { length: 50 }).notNull(),
  referenceNumber: varchar('reference_number', { length: 100 }),
  notes: text('notes'),
  proofDocumentPath: varchar('proof_document_path', { length: 255 }),
  isAdvancePayment: boolean('is_advance_payment').default(false),
  unallocatedAmount: decimal('unallocated_amount', { precision: 15, scale: 2 }),
  allocatedAmount: decimal('allocated_amount', { precision: 15, scale: 2 }).default('0'),
  customerId: integer('customer_id'),
  createdBy: integer('created_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Payment-Invoice links table
export const paymentInvoiceLinks = pgTable('payment_invoice_links', {
  id: serial('id').primaryKey(),
  paymentId: integer('payment_id').notNull().references(() => payments.id, { onDelete: 'cascade' }),
  invoiceId: integer('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  amountApplied: decimal('amount_applied', { precision: 15, scale: 2 }).notNull(),
  // Audit trail fields
  allocatedBy: integer('allocated_by').references(() => users.id),
  allocatedAt: timestamp('allocated_at'),
  // Standard timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
}, (table) => {
  return {
    paymentInvoiceUnique: primaryKey({ columns: [table.paymentId, table.invoiceId] })
  };
});

// Bank Realization Certificates table
export const bankRealizationCertificates = pgTable('bank_realization_certificates', {
  id: serial('id').primaryKey(),
  certificateNumber: varchar('certificate_number', { length: 100 }).notNull(),
  issueDate: date('issue_date').notNull(),
  bankName: varchar('bank_name', { length: 100 }).notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  relatedInvoiceId: integer('related_invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
  documentPath: varchar('document_path', { length: 255 }),
  notes: text('notes'),
  createdBy: integer('created_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Relations for invoices
export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  customer: one(customers, {
    fields: [invoices.customerId],
    references: [customers.id]
  }),
  project: one(projects, {
    fields: [invoices.projectId],
    references: [projects.id]
  }),
  creator: one(users, {
    fields: [invoices.createdBy],
    references: [users.id]
  }),
  items: many(invoiceItems),
  paymentLinks: many(paymentInvoiceLinks),
  bankRealizationCertificates: many(bankRealizationCertificates)
}));

// Relations for invoice items
export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id]
  })
}));

// Relations for payments
export const paymentsRelations = relations(payments, ({ one, many }) => ({
  creator: one(users, {
    fields: [payments.createdBy],
    references: [users.id]
  }),
  invoiceLinks: many(paymentInvoiceLinks),
  bankRealizationCertificates: many(bankRealizationCertificates)
}));

// Relations for payment-invoice links
export const paymentInvoiceLinksRelations = relations(paymentInvoiceLinks, ({ one }) => ({
  payment: one(payments, {
    fields: [paymentInvoiceLinks.paymentId],
    references: [payments.id]
  }),
  invoice: one(invoices, {
    fields: [paymentInvoiceLinks.invoiceId],
    references: [invoices.id]
  })
}));

// Relations for bank realization certificates
export const bankRealizationCertificatesRelations = relations(bankRealizationCertificates, ({ one }) => ({
  invoice: one(invoices, {
    fields: [bankRealizationCertificates.relatedInvoiceId],
    references: [invoices.id]
  }),
  creator: one(users, {
    fields: [bankRealizationCertificates.createdBy],
    references: [users.id]
  })
}));

// Insert schemas
export const insertInvoiceSchema = createInsertSchema(invoices)
  .omit({ id: true, createdAt: true, updatedAt: true });

export const insertInvoiceItemSchema = createInsertSchema(invoiceItems)
  .omit({ id: true, createdAt: true, updatedAt: true });

export const insertPaymentSchema = createInsertSchema(payments)
  .omit({ id: true, createdAt: true, updatedAt: true });

export const insertPaymentInvoiceLinkSchema = createInsertSchema(paymentInvoiceLinks)
  .omit({ id: true, createdAt: true, updatedAt: true });

export const insertBankRealizationCertificateSchema = createInsertSchema(bankRealizationCertificates)
  .omit({ id: true, createdAt: true, updatedAt: true });

// Export types
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type PaymentInvoiceLink = typeof paymentInvoiceLinks.$inferSelect;
export type BankRealizationCertificate = typeof bankRealizationCertificates.$inferSelect;

export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type InsertPaymentInvoiceLink = z.infer<typeof insertPaymentInvoiceLinkSchema>;
export type InsertBankRealizationCertificate = z.infer<typeof insertBankRealizationCertificateSchema>;

// Advance Tax Calculations table for storing corporate taxpayer calculations by financial year
export const advanceTaxCalculations = pgTable('advance_tax_calculations', {
  id: serial('id').primaryKey(),
  
  // User, company, and financial year tracking
  userId: integer('user_id').notNull().references(() => users.id),
  companyName: text('company_name').notNull().default('TPEL'), // TPEL or TPBL
  financialYear: text('financial_year').notNull(), // Format: "2025-26", "2026-27"
  
  // Tax calculation inputs
  annualTaxableIncome: decimal('annual_taxable_income', { precision: 15, scale: 2 }).notNull(),
  taxRate: decimal('tax_rate', { precision: 5, scale: 2 }).notNull(), // e.g., 30.00
  surchargeRate: decimal('surcharge_rate', { precision: 5, scale: 2 }).notNull(), // e.g., 10.00
  cessRate: decimal('cess_rate', { precision: 5, scale: 2 }).notNull(), // e.g., 4.00
  
  // Calculated tax amounts
  baseTax: decimal('base_tax', { precision: 15, scale: 2 }).notNull(),
  surchargeAmount: decimal('surcharge_amount', { precision: 15, scale: 2 }).notNull(),
  cessAmount: decimal('cess_amount', { precision: 15, scale: 2 }).notNull(),
  totalTaxLiability: decimal('total_tax_liability', { precision: 15, scale: 2 }).notNull(),
  
  // Advance tax payments made
  paidJune: decimal('paid_june', { precision: 15, scale: 2 }).default('0').notNull(),
  paidSeptember: decimal('paid_september', { precision: 15, scale: 2 }).default('0').notNull(),
  paidDecember: decimal('paid_december', { precision: 15, scale: 2 }).default('0').notNull(),
  paidMarch: decimal('paid_march', { precision: 15, scale: 2 }).default('0').notNull(),
  
  // TDS credit per quarter
  tdsQ1: decimal('tds_q1', { precision: 15, scale: 2 }).default('0').notNull(),
  tdsQ2: decimal('tds_q2', { precision: 15, scale: 2 }).default('0').notNull(),
  tdsQ3: decimal('tds_q3', { precision: 15, scale: 2 }).default('0').notNull(),
  tdsQ4: decimal('tds_q4', { precision: 15, scale: 2 }).default('0').notNull(),
  
  // Calculation status and notes
  status: text('status').notNull().default('active'), // active, completed, archived
  notes: text('notes'),
  estimationData: text('estimation_data'),
  
  // Tracking
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastPaymentDate: date('last_payment_date'),
});

// Advance Tax Payment History for tracking quarterly payments
export const advanceTaxPayments = pgTable('advance_tax_payments', {
  id: serial('id').primaryKey(),
  
  // Link to main calculation
  calculationId: integer('calculation_id').notNull().references(() => advanceTaxCalculations.id, { onDelete: 'cascade' }),
  
  // Payment details
  quarter: text('quarter').notNull(), // 'Q1-June', 'Q2-September', 'Q3-December', 'Q4-March'
  dueDate: date('due_date').notNull(),
  amountDue: decimal('amount_due', { precision: 15, scale: 2 }).notNull(),
  amountPaid: decimal('amount_paid', { precision: 15, scale: 2 }).default('0').notNull(),
  paymentDate: date('payment_date'),
  
  // Payment method and reference
  paymentMethod: text('payment_method'), // 'Online Banking', 'Challan', 'Bank Transfer'
  referenceNumber: text('reference_number'),
  bankName: text('bank_name'),
  
  // Interest calculation for late payments
  interestApplicable: boolean('interest_applicable').default(false),
  interestAmount: decimal('interest_amount', { precision: 15, scale: 2 }).default('0'),
  
  // Status and notes
  paymentStatus: text('payment_status').notNull().default('pending'), // pending, partial, paid, overdue
  notes: text('notes'),
  
  // Tracking
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations for advance tax tables
export const advanceTaxCalculationsRelations = relations(advanceTaxCalculations, ({ one, many }) => ({
  user: one(users, {
    fields: [advanceTaxCalculations.userId],
    references: [users.id],
  }),
  payments: many(advanceTaxPayments),
}));

export const advanceTaxPaymentsRelations = relations(advanceTaxPayments, ({ one }) => ({
  calculation: one(advanceTaxCalculations, {
    fields: [advanceTaxPayments.calculationId],
    references: [advanceTaxCalculations.id],
  }),
}));

// Insert schemas for advance tax tables
export const insertAdvanceTaxCalculationSchema = createInsertSchema(advanceTaxCalculations)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    status: z.enum(['active', 'completed', 'archived']).default('active'),
  });

export const insertAdvanceTaxPaymentSchema = createInsertSchema(advanceTaxPayments)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    quarter: z.enum(['Q1-June', 'Q2-September', 'Q3-December', 'Q4-March']),
    paymentStatus: z.enum(['pending', 'partial', 'paid', 'overdue']).default('pending'),
  });

// Export advance tax types
export type AdvanceTaxCalculation = typeof advanceTaxCalculations.$inferSelect;
export type InsertAdvanceTaxCalculation = z.infer<typeof insertAdvanceTaxCalculationSchema>;
export type AdvanceTaxPayment = typeof advanceTaxPayments.$inferSelect;
export type InsertAdvanceTaxPayment = z.infer<typeof insertAdvanceTaxPaymentSchema>;

// Attendance Management Relations
export const attendanceRecordsRelations = relations(attendanceRecords, ({ one }) => ({
  user: one(users, {
    fields: [attendanceRecords.userId],
    references: [users.id],
  }),
  workLocation: one(workLocations, {
    fields: [attendanceRecords.workLocationId],
    references: [workLocations.id],
  }),
  adjustedByUser: one(users, {
    fields: [attendanceRecords.adjustedBy],
    references: [users.id],
  }),
}));

export const attendanceSettingsRelations = relations(attendanceSettings, ({ one }) => ({
  workLocation: one(workLocations, {
    fields: [attendanceSettings.workLocationId],
    references: [workLocations.id],
  }),
}));

export const workLocationsRelations = relations(workLocations, ({ many }) => ({
  attendanceRecords: many(attendanceRecords),
  attendanceSettings: many(attendanceSettings),
  users: many(users),
}));

export const dailyWorkReportsRelations = relations(dailyWorkReports, ({ one }) => ({
  user: one(users, {
    fields: [dailyWorkReports.userId],
    references: [users.id],
  }),
  approver: one(users, {
    fields: [dailyWorkReports.approvedBy],
    references: [users.id],
  }),
}));

export const monthlyKpiSummaryRelations = relations(monthlyKpiSummary, ({ one }) => ({
  user: one(users, {
    fields: [monthlyKpiSummary.userId],
    references: [users.id],
  }),
}));

// Work Location insert schemas and types
export const insertWorkLocationSchema = createInsertSchema(workLocations)
  .omit({ id: true, createdAt: true, updatedAt: true, createdBy: true, updatedBy: true })
  .extend({
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    radiusMeters: z.number().int().min(10).max(10000).nullable().optional(),
    ipRestrictions: z.array(
      z.string().regex(
        /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/,
        'Each entry must be a valid IPv4 address or CIDR block (e.g. 192.168.1.0/24)'
      )
    ).nullable().optional(),
  });

export type WorkLocation = typeof workLocations.$inferSelect;
export type InsertWorkLocation = z.infer<typeof insertWorkLocationSchema>;
export type WorkLocationAuditLog = typeof workLocationAuditLog.$inferSelect;

// Attendance Records schemas and types
export const insertAttendanceRecordSchema = createInsertSchema(attendanceRecords)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    status: z.enum(['present', 'absent', 'partial', 'late', 'incomplete']).default('present'),
  });

export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type InsertAttendanceRecord = z.infer<typeof insertAttendanceRecordSchema>;

// Attendance Issues schemas and types
export const insertAttendanceIssueSchema = createInsertSchema(attendanceIssues)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    issueType: z.enum(['incomplete_checkout', 'no_dwar', 'late_arrival', 'early_departure']),
    severity: z.enum(['low', 'medium', 'high']).default('medium'),
    status: z.enum(['pending', 'resolved', 'escalated']).default('pending'),
  });

export type AttendanceIssue = typeof attendanceIssues.$inferSelect;
export type InsertAttendanceIssue = z.infer<typeof insertAttendanceIssueSchema>;

// Attendance Settings schemas and types
export const insertAttendanceSettingsSchema = createInsertSchema(attendanceSettings)
  .omit({ id: true, createdAt: true, updatedAt: true });

export type AttendanceSettings = typeof attendanceSettings.$inferSelect;
export type InsertAttendanceSettings = z.infer<typeof insertAttendanceSettingsSchema>;

// Daily Work Reports schemas and types
export const insertDailyWorkReportSchema = createInsertSchema(dailyWorkReports)
  .omit({ id: true, createdAt: true, updatedAt: true, submittedAt: true, approvedAt: true })
  .extend({
    status: z.enum(['draft', 'submitted', 'approved', 'rejected']).default('draft'),
    managerRating: z.number().min(1).max(5).optional(),
    satisfactionRating: z.number().min(1).max(5).optional(),
    challengeLevel: z.number().min(1).max(5).optional(),
    activities: z.array(z.object({
      type: z.string(),
      description: z.string(),
      timeSpent: z.number(),
      plannedHours: z.number().optional(),
      priority: z.enum(['low', 'medium', 'high']),
      status: z.enum(['completed', 'in_progress', 'pending', 'blocked']),
      taskId: z.number().optional(), // Link to existing task system
      blockedReason: z.string().optional()
    })).default([]),
    priorityTasks: z.array(z.object({
      task: z.string(),
      priority: z.enum(['low', 'medium', 'high']),
      estimatedTime: z.number().optional()
    })).default([])
  });

export type DailyWorkReport = typeof dailyWorkReports.$inferSelect;
export type InsertDailyWorkReport = z.infer<typeof insertDailyWorkReportSchema>;

// Monthly KPI Summary schemas and types
export const insertMonthlyKpiSummarySchema = createInsertSchema(monthlyKpiSummary)
  .omit({ id: true, calculatedAt: true, lastUpdated: true });

export type MonthlyKpiSummary = typeof monthlyKpiSummary.$inferSelect;
export type InsertMonthlyKpiSummary = z.infer<typeof insertMonthlyKpiSummarySchema>;

// Payroll Management Relations
export const employeeSalariesRelations = relations(employeeSalaries, ({ one, many }) => ({
  employee: one(users, {
    fields: [employeeSalaries.userId],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [employeeSalaries.createdBy],
    references: [users.id],
  }),
  payrollRecords: many(payrollRecords),
}));

export const payrollPeriodsRelations = relations(payrollPeriods, ({ one, many }) => ({
  processor: one(users, {
    fields: [payrollPeriods.processedBy],
    references: [users.id],
  }),
  records: many(payrollRecords),
  approvals: many(payrollApprovals),
}));

export const payrollRecordsRelations = relations(payrollRecords, ({ one }) => ({
  period: one(payrollPeriods, {
    fields: [payrollRecords.periodId],
    references: [payrollPeriods.id],
  }),
  employee: one(users, {
    fields: [payrollRecords.userId],
    references: [users.id],
  }),
}));

export const payrollSettingsRelations = relations(payrollSettings, ({ one }) => ({
  updater: one(users, {
    fields: [payrollSettings.updatedBy],
    references: [users.id],
  }),
}));

export const payrollApprovalsRelations = relations(payrollApprovals, ({ one }) => ({
  period: one(payrollPeriods, {
    fields: [payrollApprovals.periodId],
    references: [payrollPeriods.id],
  }),
  approver: one(users, {
    fields: [payrollApprovals.approvedBy],
    references: [users.id],
  }),
}));

// Payroll Management Schemas and Types
export const insertEmployeeSalarySchema = createInsertSchema(employeeSalaries)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    payFrequency: z.enum(['monthly', 'bi-weekly', 'weekly']).default('monthly'),
    effectiveDate: z.string().transform(dateStringToDate),
    endDate: z.string().optional().transform(dateStringToDate),
  });

export const insertPayrollPeriodSchema = createInsertSchema(payrollPeriods)
  .omit({ id: true, createdAt: true, processedAt: true })
  .extend({
    status: z.enum(['draft', 'processing', 'completed', 'closed']).default('draft'),
    startDate: z.string().transform(dateStringToDate),
    endDate: z.string().transform(dateStringToDate),
    payDate: z.string().transform(dateStringToDate),
  });

export const insertPayrollRecordSchema = createInsertSchema(payrollRecords)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    status: z.enum(['draft', 'approved', 'paid']).default('draft'),
    paymentDate: z.string().optional().transform(dateStringToDate),
  });

export const insertPayrollSettingSchema = createInsertSchema(payrollSettings)
  .omit({ id: true, updatedAt: true })
  .extend({
    dataType: z.enum(['string', 'number', 'boolean', 'json']).default('string'),
  });

export const insertBonusRuleSchema = createInsertSchema(bonusRules)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    ruleType: z.enum(['productivity', 'attendance', 'task_completion', 'satisfaction']),
  });

export const insertPayrollApprovalSchema = createInsertSchema(payrollApprovals)
  .omit({ id: true, createdAt: true, approvedAt: true })
  .extend({
    approvalLevel: z.number().min(1).max(3),
    approvalStatus: z.enum(['pending', 'approved', 'rejected']).default('pending'),
  });

// Payroll Management Types
export type EmployeeSalary = typeof employeeSalaries.$inferSelect;
export type InsertEmployeeSalary = z.infer<typeof insertEmployeeSalarySchema>;

export type PayrollPeriod = typeof payrollPeriods.$inferSelect;
export type InsertPayrollPeriod = z.infer<typeof insertPayrollPeriodSchema>;

export type PayrollRecord = typeof payrollRecords.$inferSelect;
export type InsertPayrollRecord = z.infer<typeof insertPayrollRecordSchema>;

export type PayrollSetting = typeof payrollSettings.$inferSelect;
export type InsertPayrollSetting = z.infer<typeof insertPayrollSettingSchema>;

export type BonusRule = typeof bonusRules.$inferSelect;
export type InsertBonusRule = z.infer<typeof insertBonusRuleSchema>;

export type PayrollApproval = typeof payrollApprovals.$inferSelect;
export type InsertPayrollApproval = z.infer<typeof insertPayrollApprovalSchema>;

// Payroll Run Log schemas and types
export const insertPayrollRunLogSchema = createInsertSchema(payrollRunLog)
  .omit({ id: true, createdAt: true })
  .extend({
    step: z.enum(['attendance_snapshot', 'leave_consolidation', 'salary_calculation', 'bonus_calculation', 'deduction_calculation', 'review', 'approval', 'payment_marked', 'lock', 'reset']),
    status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped']).default('pending'),
  });
export type PayrollRunLog = typeof payrollRunLog.$inferSelect;
export type InsertPayrollRunLog = z.infer<typeof insertPayrollRunLogSchema>;

// Payroll Exceptions schemas and types
export const insertPayrollExceptionSchema = createInsertSchema(payrollExceptions)
  .omit({ id: true, createdAt: true })
  .extend({
    exceptionType: z.enum(['calculation_error', 'data_missing', 'validation_failure', 'attendance_gap', 'leave_conflict', 'salary_missing', 'lock_violation', 'manual_override']),
    severity: z.enum(['info', 'warning', 'error', 'critical']).default('warning'),
    resolution: z.enum(['unresolved', 'resolved', 'ignored', 'deferred']).default('unresolved'),
  });
export type PayrollException = typeof payrollExceptions.$inferSelect;
export type InsertPayrollException = z.infer<typeof insertPayrollExceptionSchema>;

// Payroll Locks schemas and types
export const insertPayrollLockSchema = createInsertSchema(payrollLocks)
  .omit({ id: true, createdAt: true, unlockedAt: true, unlockedBy: true, unlockReason: true })
  .extend({
    lockType: z.enum(['attendance', 'leave', 'salary', 'payroll', 'full']),
  });
export type PayrollLock = typeof payrollLocks.$inferSelect;
export type InsertPayrollLock = z.infer<typeof insertPayrollLockSchema>;

// Payroll Lock Exceptions schemas and types
export const insertPayrollLockExceptionSchema = createInsertSchema(payrollLockExceptions)
  .omit({ id: true, approvedBy: true, approvedAt: true, closedAt: true, closedBy: true, createdAt: true, changesDescription: true, rejectionReason: true })
  .extend({
    status: z.enum(['pending', 'approved', 'rejected', 'expired']).default('pending'),
  });
export type PayrollLockException = typeof payrollLockExceptions.$inferSelect;
export type InsertPayrollLockException = z.infer<typeof insertPayrollLockExceptionSchema>;

// Payroll Attendance Snapshot schemas and types
export const insertPayrollAttendanceSnapshotSchema = createInsertSchema(payrollAttendanceSnapshot)
  .omit({ id: true, createdAt: true });
export type PayrollAttendanceSnapshot = typeof payrollAttendanceSnapshot.$inferSelect;
export type InsertPayrollAttendanceSnapshot = z.infer<typeof insertPayrollAttendanceSnapshotSchema>;

// Payroll Salary Snapshot schemas and types
export const insertPayrollSalarySnapshotSchema = createInsertSchema(payrollSalarySnapshot)
  .omit({ id: true, createdAt: true });
export type PayrollSalarySnapshot = typeof payrollSalarySnapshot.$inferSelect;
export type InsertPayrollSalarySnapshot = z.infer<typeof insertPayrollSalarySnapshotSchema>;

// Tax Slabs schemas and types
export const insertTaxSlabSchema = createInsertSchema(taxSlabs)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    regime: z.enum(['old', 'new']),
  });
export type TaxSlab = typeof taxSlabs.$inferSelect;
export type InsertTaxSlab = z.infer<typeof insertTaxSlabSchema>;

// Employee Tax Declarations schemas and types
export const insertEmployeeTaxDeclarationSchema = createInsertSchema(employeeTaxDeclarations)
  .omit({ id: true, createdAt: true, updatedAt: true, submittedAt: true, approvedBy: true, approvedAt: true })
  .extend({
    regime: z.enum(['old', 'new']).default('new'),
    status: z.enum(['draft', 'submitted', 'approved', 'rejected']).default('draft'),
  });
export type EmployeeTaxDeclaration = typeof employeeTaxDeclarations.$inferSelect;
export type InsertEmployeeTaxDeclaration = z.infer<typeof insertEmployeeTaxDeclarationSchema>;

// Employee Investment Proofs schemas and types
export const insertEmployeeInvestmentProofSchema = createInsertSchema(employeeInvestmentProofs)
  .omit({ id: true, createdAt: true, verifiedBy: true, verifiedAt: true, verificationNotes: true })
  .extend({
    proofStatus: z.enum(['pending', 'submitted', 'verified', 'rejected']).default('pending'),
  });
export type EmployeeInvestmentProof = typeof employeeInvestmentProofs.$inferSelect;
export type InsertEmployeeInvestmentProof = z.infer<typeof insertEmployeeInvestmentProofSchema>;

// TDS Monthly Records schemas and types
export const insertTdsMonthlyRecordSchema = createInsertSchema(tdsMonthlyRecords)
  .omit({ id: true, createdAt: true })
  .extend({
    regime: z.enum(['old', 'new']),
  });
export type TdsMonthlyRecord = typeof tdsMonthlyRecords.$inferSelect;
export type InsertTdsMonthlyRecord = z.infer<typeof insertTdsMonthlyRecordSchema>;

//==============================================================================
// LEAVE MANAGEMENT MODULE RELATIONS
//==============================================================================

// Leave Types Relations
export const leaveTypesRelations = relations(leaveTypes, ({ many }) => ({
  balances: many(leaveBalances),
  requests: many(leaveRequests)
}));

// Leave Balances Relations
export const leaveBalancesRelations = relations(leaveBalances, ({ one }) => ({
  user: one(users, {
    fields: [leaveBalances.userId],
    references: [users.id]
  }),
  leaveType: one(leaveTypes, {
    fields: [leaveBalances.leaveTypeId],
    references: [leaveTypes.id]
  }),
  updatedByUser: one(users, {
    fields: [leaveBalances.updatedBy],
    references: [users.id]
  })
}));

// Leave Requests Relations
export const leaveRequestsRelations = relations(leaveRequests, ({ one, many }) => ({
  employee: one(users, {
    fields: [leaveRequests.employeeId],
    references: [users.id]
  }),
  leaveType: one(leaveTypes, {
    fields: [leaveRequests.leaveTypeId],
    references: [leaveTypes.id]
  }),
  manager: one(users, {
    fields: [leaveRequests.managerId],
    references: [users.id]
  }),
  hrApprover: one(users, {
    fields: [leaveRequests.hrApprovalId],
    references: [users.id]
  }),
  approvedByUser: one(users, {
    fields: [leaveRequests.approvedBy],
    references: [users.id]
  }),
  approvals: many(leaveApprovals)
}));

// Leave Approvals Relations
export const leaveApprovalsRelations = relations(leaveApprovals, ({ one }) => ({
  leaveRequest: one(leaveRequests, {
    fields: [leaveApprovals.leaveRequestId],
    references: [leaveRequests.id]
  }),
  approver: one(users, {
    fields: [leaveApprovals.approverId],
    references: [users.id]
  })
}));

// Company Holidays Relations
export const companyHolidaysRelations = relations(companyHolidays, ({ one }) => ({
  createdByUser: one(users, {
    fields: [companyHolidays.createdBy],
    references: [users.id]
  })
}));

// Leave Policies Relations
export const leavePoliciesRelations = relations(leavePolicies, ({ one }) => ({
  updatedByUser: one(users, {
    fields: [leavePolicies.updatedBy],
    references: [users.id]
  })
}));

//==============================================================================
// LEAVE MANAGEMENT INSERT SCHEMAS
//==============================================================================

export const insertLeaveTypeSchema = createInsertSchema(leaveTypes)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    maxDaysPerYear: z.string().transform(val => parseFloat(val) || 0),
    maxCarryoverDays: z.string().transform(val => parseFloat(val) || 0),
    noticeDaysRequired: z.number().default(1),
    colorCode: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#3B82F6')
  });

export const insertLeaveBalanceSchema = createInsertSchema(leaveBalances)
  .omit({ id: true, lastUpdated: true })
  .extend({
    allocatedDays: z.string().transform(val => parseFloat(val) || 0),
    usedDays: z.string().transform(val => parseFloat(val) || 0),
    pendingDays: z.string().transform(val => parseFloat(val) || 0),
    carryoverDays: z.string().transform(val => parseFloat(val) || 0)
  });

export const insertLeaveRequestSchema = createInsertSchema(leaveRequests)
  .omit({ id: true, createdAt: true, updatedAt: true, appliedDate: true })
  .extend({
    startDate: z.string().transform(dateStringToDate),
    endDate: z.string().transform(dateStringToDate),
    totalDays: z.string().transform(val => parseFloat(val) || 0),
    status: z.enum(['pending', 'approved', 'rejected', 'canceled']).default('pending'),
    managerApprovalStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
    hrApprovalStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
    halfDayPeriod: z.enum(['morning', 'afternoon']).optional()
  });

export const insertLeaveApprovalSchema = createInsertSchema(leaveApprovals)
  .omit({ id: true, createdAt: true, approvedDate: true })
  .extend({
    status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
    approvalLevel: z.number().min(1).max(2)
  });

export const insertCompanyHolidaySchema = createInsertSchema(companyHolidays)
  .omit({ id: true, createdAt: true })
  .extend({
    date: z.string().transform(dateStringToDate)
  });

export const insertLeavePolicySchema = createInsertSchema(leavePolicies)
  .omit({ id: true, updatedAt: true })
  .extend({
    dataType: z.enum(['string', 'number', 'boolean', 'json']).default('string')
  });

//==============================================================================
// LEAVE MANAGEMENT TYPESCRIPT TYPES
//==============================================================================

export type LeaveType = typeof leaveTypes.$inferSelect;
export type InsertLeaveType = z.infer<typeof insertLeaveTypeSchema>;

export type LeaveBalance = typeof leaveBalances.$inferSelect;
export type InsertLeaveBalance = z.infer<typeof insertLeaveBalanceSchema>;

export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type InsertLeaveRequest = z.infer<typeof insertLeaveRequestSchema>;

export type LeaveApproval = typeof leaveApprovals.$inferSelect;
export type InsertLeaveApproval = z.infer<typeof insertLeaveApprovalSchema>;

export type CompanyHoliday = typeof companyHolidays.$inferSelect;
export type InsertCompanyHoliday = z.infer<typeof insertCompanyHolidaySchema>;

export type LeavePolicy = typeof leavePolicies.$inferSelect;
export type InsertLeavePolicy = z.infer<typeof insertLeavePolicySchema>;

// =============================================
// WORKWEEK POLICY MANAGEMENT
// =============================================

// Policy types for workweek management
export const policyTypes = ['location', 'department', 'global'] as const;
export type PolicyType = typeof policyTypes[number];

// Override types for calendar exceptions
export const overrideTypes = ['holiday', 'working_day', 'half_day', 'special_hours'] as const;
export type OverrideType = typeof overrideTypes[number];

// Workweek Policies table
export const workweekPolicies = pgTable('workweek_policies', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  policyType: varchar('policy_type', { length: 50 }).notNull(),
  locationId: integer('location_id').references(() => workLocations.id, { onDelete: 'cascade' }),
  department: varchar('department', { length: 255 }),
  
  // Working days configuration (JSON array of day numbers: 0=Sunday, 1=Monday, etc.)
  workingDays: jsonb('working_days').notNull().default('[1,2,3,4,5]'),
  
  // Working hours
  startTime: varchar('start_time', { length: 8 }).notNull().default('09:00:00'),
  endTime: varchar('end_time', { length: 8 }).notNull().default('18:00:00'),
  breakDurationMinutes: integer('break_duration_minutes').default(60),
  
  // Weekly working hours
  weeklyHours: decimal('weekly_hours', { precision: 5, scale: 2 }).default('40.00'),
  
  // Overtime policies
  overtimeThresholdDaily: decimal('overtime_threshold_daily', { precision: 5, scale: 2 }).default('8.00'),
  overtimeThresholdWeekly: decimal('overtime_threshold_weekly', { precision: 5, scale: 2 }).default('40.00'),
  overtimeRateMultiplier: decimal('overtime_rate_multiplier', { precision: 4, scale: 2 }).default('1.50'),
  
  // Half-day policies
  halfDayHours: decimal('half_day_hours', { precision: 4, scale: 2 }).default('4.00'),
  
  // Holiday and leave policies
  includesSaturdays: boolean('includes_saturdays').default(false),
  includesSundays: boolean('includes_sundays').default(false),
  followsNationalHolidays: boolean('follows_national_holidays').default(true),
  
  // Status and metadata
  isActive: boolean('is_active').default(true),
  effectiveFrom: date('effective_from').notNull().defaultNow(),
  effectiveUntil: date('effective_until'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdBy: integer('created_by').references(() => users.id),
});

// Employee Workweek Assignments table
export const employeeWorkweekAssignments = pgTable('employee_workweek_assignments', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workweekPolicyId: integer('workweek_policy_id').notNull().references(() => workweekPolicies.id, { onDelete: 'restrict' }),
  
  // Override fields (if different from policy defaults)
  customWorkingDays: jsonb('custom_working_days'),
  customStartTime: varchar('custom_start_time', { length: 8 }),
  customEndTime: varchar('custom_end_time', { length: 8 }),
  customWeeklyHours: decimal('custom_weekly_hours', { precision: 5, scale: 2 }),
  
  // Assignment metadata
  assignedDate: date('assigned_date').notNull().defaultNow(),
  effectiveFrom: date('effective_from').notNull().defaultNow(),
  effectiveUntil: date('effective_until'),
  assignedBy: integer('assigned_by').references(() => users.id),
  notes: text('notes'),
  
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Workweek Calendar Overrides table
export const workweekCalendarOverrides = pgTable('workweek_calendar_overrides', {
  id: serial('id').primaryKey(),
  workweekPolicyId: integer('workweek_policy_id').notNull().references(() => workweekPolicies.id, { onDelete: 'cascade' }),
  overrideDate: date('override_date').notNull(),
  overrideType: varchar('override_type', { length: 50 }).notNull(),
  
  // Override details
  isWorkingDay: boolean('is_working_day').notNull(),
  customStartTime: varchar('custom_start_time', { length: 8 }),
  customEndTime: varchar('custom_end_time', { length: 8 }),
  reason: varchar('reason', { length: 255 }),
  description: text('description'),
  
  createdAt: timestamp('created_at').defaultNow(),
  createdBy: integer('created_by').references(() => users.id),
});

// Relations for workweek policies
export const workweekPoliciesRelations = relations(workweekPolicies, ({ one, many }) => ({
  location: one(workLocations, {
    fields: [workweekPolicies.locationId],
    references: [workLocations.id],
  }),
  creator: one(users, {
    fields: [workweekPolicies.createdBy],
    references: [users.id],
  }),
  employeeAssignments: many(employeeWorkweekAssignments),
  calendarOverrides: many(workweekCalendarOverrides),
}));

// Relations for employee assignments
export const employeeWorkweekAssignmentsRelations = relations(employeeWorkweekAssignments, ({ one }) => ({
  employee: one(users, {
    fields: [employeeWorkweekAssignments.employeeId],
    references: [users.id],
  }),
  workweekPolicy: one(workweekPolicies, {
    fields: [employeeWorkweekAssignments.workweekPolicyId],
    references: [workweekPolicies.id],
  }),
  assignedByUser: one(users, {
    fields: [employeeWorkweekAssignments.assignedBy],
    references: [users.id],
  }),
}));

// Relations for calendar overrides
export const workweekCalendarOverridesRelations = relations(workweekCalendarOverrides, ({ one }) => ({
  workweekPolicy: one(workweekPolicies, {
    fields: [workweekCalendarOverrides.workweekPolicyId],
    references: [workweekPolicies.id],
  }),
  creator: one(users, {
    fields: [workweekCalendarOverrides.createdBy],
    references: [users.id],
  }),
}));

// Insert schemas for workweek policies
export const insertWorkweekPolicySchema = createInsertSchema(workweekPolicies)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    policyType: z.enum(policyTypes),
    workingDays: z.array(z.number().min(0).max(6)).default([1,2,3,4,5]),
    startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/),
    endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/),
    effectiveFrom: z.string().optional().transform(dateStringToDate),
    effectiveUntil: z.string().optional().transform(dateStringToDate),
  });

export const insertEmployeeWorkweekAssignmentSchema = createInsertSchema(employeeWorkweekAssignments)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    customWorkingDays: z.array(z.number().min(0).max(6)).optional(),
    customStartTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/).optional(),
    customEndTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/).optional(),
    effectiveFrom: z.string().optional().transform(dateStringToDate),
    effectiveUntil: z.string().optional().transform(dateStringToDate),
  });

export const insertWorkweekCalendarOverrideSchema = createInsertSchema(workweekCalendarOverrides)
  .omit({ id: true, createdAt: true })
  .extend({
    overrideType: z.enum(overrideTypes),
    overrideDate: z.string().transform(dateStringToDate),
    customStartTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/).optional(),
    customEndTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/).optional(),
  });

// Export workweek policy types
export type WorkweekPolicy = typeof workweekPolicies.$inferSelect;
export type InsertWorkweekPolicy = z.infer<typeof insertWorkweekPolicySchema>;

export type EmployeeWorkweekAssignment = typeof employeeWorkweekAssignments.$inferSelect;
export type InsertEmployeeWorkweekAssignment = z.infer<typeof insertEmployeeWorkweekAssignmentSchema>;

export type WorkweekCalendarOverride = typeof workweekCalendarOverrides.$inferSelect;
export type InsertWorkweekCalendarOverride = z.infer<typeof insertWorkweekCalendarOverrideSchema>;

//==============================================================================
// CONCLUDED CALENDAR EVENTS
//==============================================================================

// Table to track concluded Google Calendar events
export const concludedCalendarEvents = pgTable('concluded_calendar_events', {
  id: serial('id').primaryKey(),
  googleEventId: varchar('google_event_id', { length: 255 }).notNull().unique(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  eventTitle: varchar('event_title', { length: 500 }),
  concludedAt: timestamp('concluded_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Relations for concluded calendar events
export const concludedCalendarEventsRelations = relations(concludedCalendarEvents, ({ one }) => ({
  user: one(users, {
    fields: [concludedCalendarEvents.userId],
    references: [users.id],
  }),
}));

// Insert schema for concluded calendar events
export const insertConcludedCalendarEventSchema = createInsertSchema(concludedCalendarEvents)
  .omit({ id: true, concludedAt: true, createdAt: true })
  .extend({
    eventTitle: z.string().optional(),
  });

// Export types
export type ConcludedCalendarEvent = typeof concludedCalendarEvents.$inferSelect;
export type InsertConcludedCalendarEvent = z.infer<typeof insertConcludedCalendarEventSchema>;

// Form schemas for UI validation
export const workweekPolicyFormSchema = insertWorkweekPolicySchema
  .extend({
    locationId: z.number().optional(),
    department: z.string().optional(),
  })
  .refine((data) => {
    if (data.policyType === 'location' && !data.locationId) {
      return false;
    }
    if (data.policyType === 'department' && !data.department) {
      return false;
    }
    return true;
  }, {
    message: "Location is required for location-based policies, Department is required for department-based policies",
  });

export const employeeAssignmentFormSchema = insertEmployeeWorkweekAssignmentSchema;
export const calendarOverrideFormSchema = insertWorkweekCalendarOverrideSchema;

export type WorkweekPolicyForm = z.infer<typeof workweekPolicyFormSchema>;
export type EmployeeAssignmentForm = z.infer<typeof employeeAssignmentFormSchema>;
export type CalendarOverrideForm = z.infer<typeof calendarOverrideFormSchema>;

// ==================== LEGAL MANAGEMENT ====================

// Contract Types
export const contractTypes = [
  "Service Agreement",
  "Purchase Agreement", 
  "Employment Contract",
  "Non-Disclosure Agreement",
  "Lease Agreement",
  "Vendor Agreement",
  "Consulting Agreement",
  "Maintenance Contract",
  "License Agreement",
  "Joint Venture Agreement"
] as const;

export type ContractType = typeof contractTypes[number];

// NDA and Exclusivity Agreement Tables

// NDA (Non-Disclosure Agreement) Management
export const ndaAgreements = pgTable('nda_agreements', {
  id: serial('id').primaryKey(),
  agreementNumber: varchar('agreement_number', { length: 255 }).unique().notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  partyName: varchar('party_name', { length: 255 }).notNull(),
  partyType: varchar('party_type', { length: 50 }).notNull(), // Individual, Company, Vendor, Client, Employee
  partyContact: varchar('party_contact', { length: 255 }),
  partyEmail: varchar('party_email', { length: 255 }),
  ndaType: varchar('nda_type', { length: 50 }).notNull(), // Unilateral, Mutual, Multilateral
  disclosureScope: text('disclosure_scope').notNull(),
  purpose: text('purpose').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  durationMonths: integer('duration_months'),
  confidentialityLevel: varchar('confidentiality_level', { length: 50 }).default('Standard'), // Standard, High, Critical
  permittedUse: text('permitted_use'),
  exceptions: text('exceptions'),
  returnObligation: boolean('return_obligation').default(true),
  monetaryDamages: decimal('monetary_damages', { precision: 15, scale: 2 }),
  currency: varchar('currency', { length: 10 }).default('INR'),
  governingLaw: varchar('governing_law', { length: 100 }).default('Indian Law'),
  jurisdiction: varchar('jurisdiction', { length: 100 }),
  status: varchar('status', { length: 50 }).default('Active'), // Active, Expired, Terminated, Breached
  breachIncidents: integer('breach_incidents').default(0),
  autoRenewal: boolean('auto_renewal').default(false),
  noticePeriodDays: integer('notice_period_days').default(30),
  filePath: varchar('file_path', { length: 500 }),
  fileUrl: varchar('file_url', { length: 500 }),
  digitalSignatureRequired: boolean('digital_signature_required').default(false),
  signedDate: date('signed_date'),
  witnessRequired: boolean('witness_required').default(false),
  witnessName: varchar('witness_name', { length: 255 }),
  witnessContact: varchar('witness_contact', { length: 255 }),
  createdBy: integer('created_by').references(() => users.id),
  assignedTo: integer('assigned_to').references(() => users.id),
  approvedBy: integer('approved_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Exclusivity Agreement Management
export const exclusivityAgreements = pgTable('exclusivity_agreements', {
  id: serial('id').primaryKey(),
  agreementNumber: varchar('agreement_number', { length: 255 }).unique().notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  partyName: varchar('party_name', { length: 255 }).notNull(),
  partyType: varchar('party_type', { length: 50 }).notNull(), // Vendor, Supplier, Distributor, Client, Partner
  partyContact: varchar('party_contact', { length: 255 }),
  partyEmail: varchar('party_email', { length: 255 }),
  exclusivityType: varchar('exclusivity_type', { length: 50 }).notNull(), // Geographic, Product, Service, Territory, Time-based
  exclusivityScope: text('exclusivity_scope').notNull(),
  geographicalScope: text('geographical_scope'),
  productServiceScope: text('product_service_scope'),
  territoryRestrictions: text('territory_restrictions'),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  durationMonths: integer('duration_months'),
  minimumCommitment: decimal('minimum_commitment', { precision: 15, scale: 2 }),
  performanceTargets: text('performance_targets'),
  penaltyClause: text('penalty_clause'),
  terminationConditions: text('termination_conditions'),
  renewalTerms: text('renewal_terms'),
  exclusivityLevel: varchar('exclusivity_level', { length: 50 }).default('Full'), // Full, Partial, Conditional
  competingRestrictions: text('competing_restrictions'),
  nonCompetePeriod: integer('non_compete_period'), // months after termination
  agreementValue: decimal('agreement_value', { precision: 15, scale: 2 }),
  currency: varchar('currency', { length: 10 }).default('INR'),
  paymentTerms: text('payment_terms'),
  milestoneRequirements: text('milestone_requirements'),
  governingLaw: varchar('governing_law', { length: 100 }).default('Indian Law'),
  jurisdiction: varchar('jurisdiction', { length: 100 }),
  status: varchar('status', { length: 50 }).default('Active'), // Active, Expired, Terminated, Breached, Suspended
  breachIncidents: integer('breach_incidents').default(0),
  performanceScore: integer('performance_score').default(0), // 0-100 scale
  autoRenewal: boolean('auto_renewal').default(false),
  noticePeriodDays: integer('notice_period_days').default(60),
  filePath: varchar('file_path', { length: 500 }),
  fileUrl: varchar('file_url', { length: 500 }),
  digitalSignatureRequired: boolean('digital_signature_required').default(false),
  signedDate: date('signed_date'),
  witnessRequired: boolean('witness_required').default(false),
  witnessName: varchar('witness_name', { length: 255 }),
  witnessContact: varchar('witness_contact', { length: 255 }),
  createdBy: integer('created_by').references(() => users.id),
  assignedTo: integer('assigned_to').references(() => users.id),
  approvedBy: integer('approved_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// NDA Breach Incidents Tracking
export const ndaBreachIncidents = pgTable('nda_breach_incidents', {
  id: serial('id').primaryKey(),
  ndaId: integer('nda_id').references(() => ndaAgreements.id, { onDelete: 'cascade' }),
  incidentNumber: varchar('incident_number', { length: 255 }).unique().notNull(),
  incidentDate: date('incident_date').notNull(),
  incidentType: varchar('incident_type', { length: 100 }).notNull(), // Unauthorized Disclosure, Misuse, Data Leak, Violation
  severity: varchar('severity', { length: 50 }).notNull(), // Minor, Moderate, Major, Critical
  description: text('description').notNull(),
  discoveredBy: varchar('discovered_by', { length: 255 }),
  discoveryDate: date('discovery_date'),
  investigationStatus: varchar('investigation_status', { length: 50 }).default('Open'), // Open, Under Investigation, Resolved, Closed
  investigationFindings: text('investigation_findings'),
  remedialActions: text('remedial_actions'),
  legalActionTaken: boolean('legal_action_taken').default(false),
  legalActionDetails: text('legal_action_details'),
  damagesClaimed: decimal('damages_claimed', { precision: 15, scale: 2 }),
  damagesAwarded: decimal('damages_awarded', { precision: 15, scale: 2 }),
  currency: varchar('currency', { length: 10 }).default('INR'),
  resolutionDate: date('resolution_date'),
  lessonsLearned: text('lessons_learned'),
  preventiveMeasures: text('preventive_measures'),
  createdBy: integer('created_by').references(() => users.id),
  assignedTo: integer('assigned_to').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Exclusivity Performance Tracking
export const exclusivityPerformance = pgTable('exclusivity_performance', {
  id: serial('id').primaryKey(),
  exclusivityId: integer('exclusivity_id').references(() => exclusivityAgreements.id, { onDelete: 'cascade' }),
  evaluationPeriod: varchar('evaluation_period', { length: 50 }).notNull(), // Monthly, Quarterly, Annual
  evaluationDate: date('evaluation_date').notNull(),
  targetAchievement: decimal('target_achievement', { precision: 5, scale: 2 }).default('0.00'), // Percentage
  revenueGenerated: decimal('revenue_generated', { precision: 15, scale: 2 }).default('0.00'),
  volumeAchieved: decimal('volume_achieved', { precision: 15, scale: 2 }).default('0.00'),
  currency: varchar('currency', { length: 10 }).default('INR'),
  performanceRating: varchar('performance_rating', { length: 50 }), // Excellent, Good, Average, Poor
  performanceScore: integer('performance_score').default(0), // 0-100 scale
  complianceScore: integer('compliance_score').default(0), // 0-100 scale
  feedbackComments: text('feedback_comments'),
  improvementAreas: text('improvement_areas'),
  recognitionRewards: text('recognition_rewards'),
  penaltyApplied: boolean('penalty_applied').default(false),
  penaltyAmount: decimal('penalty_amount', { precision: 15, scale: 2 }),
  penaltyReason: text('penalty_reason'),
  nextEvaluationDate: date('next_evaluation_date'),
  createdBy: integer('created_by').references(() => users.id),
  evaluatedBy: integer('evaluated_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Agreement Renewals and Amendments Tracking
export const agreementAmendments = pgTable('agreement_amendments', {
  id: serial('id').primaryKey(),
  agreementType: varchar('agreement_type', { length: 50 }).notNull(), // NDA, Exclusivity, Contract
  agreementId: integer('agreement_id').notNull(),
  amendmentNumber: varchar('amendment_number', { length: 255 }).notNull(),
  amendmentDate: date('amendment_date').notNull(),
  amendmentType: varchar('amendment_type', { length: 100 }).notNull(), // Extension, Modification, Termination, Renewal
  previousTerms: text('previous_terms'),
  newTerms: text('new_terms'),
  changesSummary: text('changes_summary').notNull(),
  reasonForChange: text('reason_for_change'),
  effectiveDate: date('effective_date'),
  approvalRequired: boolean('approval_required').default(true),
  approvalStatus: varchar('approval_status', { length: 50 }).default('Pending'), // Pending, Approved, Rejected
  approvedBy: integer('approved_by').references(() => users.id),
  approvalDate: date('approval_date'),
  legalReviewRequired: boolean('legal_review_required').default(true),
  legalReviewStatus: varchar('legal_review_status', { length: 50 }).default('Pending'),
  legalReviewer: integer('legal_reviewer').references(() => users.id),
  legalReviewDate: date('legal_review_date'),
  legalReviewComments: text('legal_review_comments'),
  filePath: varchar('file_path', { length: 500 }),
  fileUrl: varchar('file_url', { length: 500 }),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Contract Status
export const contractStatuses = [
  "Active",
  "Expired", 
  "Terminated",
  "Pending",
  "Under Review"
] as const;

export type ContractStatus = typeof contractStatuses[number];

// Case Types
export const caseTypes = [
  "Civil",
  "Criminal",
  "Employment",
  "Intellectual Property", 
  "Contract Dispute",
  "Regulatory",
  "Tax",
  "Environmental",
  "Corporate"
] as const;

export type CaseType = typeof caseTypes[number];

// Case Status
export const caseStatuses = [
  "Active",
  "Closed",
  "Pending",
  "On Hold",
  "Under Review"
] as const;

export type CaseStatus = typeof caseStatuses[number];

// Priority Levels
export const priorityLevels = [
  "High",
  "Medium",
  "Low"
] as const;

export type PriorityLevel = typeof priorityLevels[number];

// Compliance Types
export const complianceTypes = [
  "Legal",
  "Regulatory",
  "Statutory",
  "Environmental",
  "Safety",
  "Tax",
  "Labour",
  "Corporate"
] as const;

export type ComplianceType = typeof complianceTypes[number];

// Compliance Status
export const complianceStatuses = [
  "Pending",
  "Completed",
  "Overdue",
  "N/A"
] as const;

export type ComplianceStatus = typeof complianceStatuses[number];

// Compliance Frequency
export const complianceFrequencies = [
  "Monthly",
  "Quarterly",
  "Half-yearly",
  "Yearly",
  "One-time"
] as const;

export type ComplianceFrequency = typeof complianceFrequencies[number];

// POSH Case Types
export const poshCaseTypes = [
  "Sexual Harassment",
  "Discrimination",
  "Retaliation",
  "Hostile Work Environment"
] as const;

export type PoshCaseType = typeof poshCaseTypes[number];

// POSH Case Status
export const poshCaseStatuses = [
  "Investigation",
  "Inquiry",
  "Closed",
  "Dismissed",
  "Under Review"
] as const;

export type PoshCaseStatus = typeof poshCaseStatuses[number];

// Notice Types
export const noticeTypes = [
  "Received",
  "Sent",
  "Show Cause",
  "Demand Notice",
  "Termination Notice",
  "Legal Notice",
  "Cease and Desist"
] as const;

export type NoticeType = typeof noticeTypes[number];

// Notice Status
export const noticeStatuses = [
  "Pending",
  "Responded",
  "Closed",
  "Escalated",
  "Under Review"
] as const;

export type NoticeStatus = typeof noticeStatuses[number];

// Specializations
export const specializations = [
  "Corporate Law",
  "Litigation",
  "Intellectual Property",
  "Employment Law",
  "Tax Law",
  "Environmental Law",
  "Real Estate Law",
  "Banking & Finance",
  "Regulatory Compliance"
] as const;

export type Specialization = typeof specializations[number];

// Counsel Status
export const counselStatuses = [
  "Active",
  "Inactive",
  "Blacklisted"
] as const;

export type CounselStatus = typeof counselStatuses[number];

// Template Types
export const templateTypes = [
  "HR Policy",
  "Legal Policy",
  "Compliance Policy",
  "Safety Policy",
  "IT Policy",
  "Security Policy",
  "Code of Conduct"
] as const;

export type TemplateType = typeof templateTypes[number];

// Template Categories
export const templateCategories = [
  "Employment",
  "Privacy",
  "Code of Conduct",
  "Anti-Harassment",
  "Leave Policy",
  "Disciplinary Policy",
  "Data Protection",
  "Whistleblower Policy"
] as const;

export type TemplateCategory = typeof templateCategories[number];

// Policy Approval Status
export const policyApprovalStatuses = [
  "Draft",
  "Under Review",
  "Approved",
  "Rejected",
  "Archived"
] as const;

export type PolicyApprovalStatus = typeof policyApprovalStatuses[number];

// Alert Types
export const legalAlertTypes = [
  "Contract Expiry",
  "Hearing Date",
  "Compliance Due",
  "Notice Response",
  "Renewal Reminder",
  "Document Expiry"
] as const;

export type LegalAlertType = typeof legalAlertTypes[number];

// Alert Status
export const legalAlertStatuses = [
  "Active",
  "Dismissed",
  "Resolved"
] as const;

export type LegalAlertStatus = typeof legalAlertStatuses[number];

// Contracts table
export const contracts = pgTable('contracts', {
  id: serial('id').primaryKey(),
  contractNumber: varchar('contract_number', { length: 255 }).notNull().unique(),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  contractType: varchar('contract_type', { length: 100 }).notNull(),
  partyName: varchar('party_name', { length: 255 }).notNull(),
  partyContact: varchar('party_contact', { length: 255 }),
  partyEmail: varchar('party_email', { length: 255 }),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  renewalDate: date('renewal_date'),
  contractValue: decimal('contract_value', { precision: 15, scale: 2 }),
  currency: varchar('currency', { length: 10 }).notNull().default('INR'),
  status: varchar('status', { length: 50 }).notNull().default('Active'),
  autoRenewal: boolean('auto_renewal').notNull().default(false),
  noticePeriodDays: integer('notice_period_days').notNull().default(30),
  filePath: varchar('file_path', { length: 500 }),
  fileUrl: varchar('file_url', { length: 500 }),
  createdBy: integer('created_by').notNull().references(() => users.id),
  assignedTo: integer('assigned_to').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Legal Cases table
export const legalCases = pgTable('legal_cases', {
  id: serial('id').primaryKey(),
  caseNumber: varchar('case_number', { length: 255 }).notNull().unique(),
  caseTitle: varchar('case_title', { length: 500 }).notNull(),
  caseType: varchar('case_type', { length: 100 }).notNull(),
  caseStatus: varchar('case_status', { length: 50 }).notNull().default('Active'),
  courtName: varchar('court_name', { length: 255 }),
  judgeName: varchar('judge_name', { length: 255 }),
  opposingParty: varchar('opposing_party', { length: 255 }),
  caseValue: decimal('case_value', { precision: 15, scale: 2 }),
  currency: varchar('currency', { length: 10 }).notNull().default('INR'),
  filingDate: date('filing_date'),
  nextHearingDate: date('next_hearing_date'),
  expectedClosureDate: date('expected_closure_date'),
  priority: varchar('priority', { length: 20 }).notNull().default('Medium'),
  description: text('description'),
  outcome: text('outcome'),
  internalCounsel: integer('internal_counsel').references(() => users.id),
  externalCounselId: integer('external_counsel_id'),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Compliance Register table
export const complianceRegister = pgTable('compliance_register', {
  id: serial('id').primaryKey(),
  complianceType: varchar('compliance_type', { length: 100 }).notNull(),
  regulationName: varchar('regulation_name', { length: 255 }).notNull(),
  applicableSection: varchar('applicable_section', { length: 255 }),
  complianceRequirement: text('compliance_requirement').notNull(),
  frequency: varchar('frequency', { length: 50 }).notNull(),
  dueDate: date('due_date').notNull(),
  completionDate: date('completion_date'),
  status: varchar('status', { length: 50 }).notNull().default('Pending'),
  responsiblePerson: integer('responsible_person').references(() => users.id),
  complianceEvidence: text('compliance_evidence'),
  filePath: varchar('file_path', { length: 500 }),
  fileUrl: varchar('file_url', { length: 500 }),
  penaltyAmount: decimal('penalty_amount', { precision: 15, scale: 2 }),
  remarks: text('remarks'),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// POSH Cases table
export const poshCases = pgTable('posh_cases', {
  id: serial('id').primaryKey(),
  caseNumber: varchar('case_number', { length: 255 }).notNull().unique(),
  complaintDate: date('complaint_date').notNull(),
  complainantName: varchar('complainant_name', { length: 255 }).notNull(),
  complainantDesignation: varchar('complainant_designation', { length: 255 }),
  complainantDepartment: varchar('complainant_department', { length: 255 }),
  respondentName: varchar('respondent_name', { length: 255 }).notNull(),
  respondentDesignation: varchar('respondent_designation', { length: 255 }),
  respondentDepartment: varchar('respondent_department', { length: 255 }),
  incidentDate: date('incident_date'),
  incidentLocation: varchar('incident_location', { length: 255 }),
  caseType: varchar('case_type', { length: 100 }).notNull(),
  caseStatus: varchar('case_status', { length: 50 }).notNull().default('Investigation'),
  priority: varchar('priority', { length: 20 }).notNull().default('High'),
  description: text('description').notNull(),
  actionTaken: text('action_taken'),
  outcome: varchar('outcome', { length: 100 }),
  closureDate: date('closure_date'),
  committeeMembers: text('committee_members'),
  investigationOfficer: integer('investigation_officer').references(() => users.id),
  filePath: varchar('file_path', { length: 500 }),
  fileUrl: varchar('file_url', { length: 500 }),
  confidentialityLevel: varchar('confidentiality_level', { length: 50 }).notNull().default('Confidential'),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Legal Notices table
export const legalNotices = pgTable('legal_notices', {
  id: serial('id').primaryKey(),
  noticeNumber: varchar('notice_number', { length: 255 }).notNull().unique(),
  noticeType: varchar('notice_type', { length: 100 }).notNull(),
  fromParty: varchar('from_party', { length: 255 }).notNull(),
  toParty: varchar('to_party', { length: 255 }).notNull(),
  subject: varchar('subject', { length: 500 }).notNull(),
  noticeDate: date('notice_date').notNull(),
  responseDueDate: date('response_due_date'),
  responseDate: date('response_date'),
  status: varchar('status', { length: 50 }).notNull().default('Pending'),
  priority: varchar('priority', { length: 20 }).notNull().default('Medium'),
  description: text('description').notNull(),
  responseSummary: text('response_summary'),
  actionRequired: text('action_required'),
  assignedTo: integer('assigned_to').references(() => users.id),
  filePath: varchar('file_path', { length: 500 }),
  fileUrl: varchar('file_url', { length: 500 }),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// External Counsel Directory table
export const externalCounsel = pgTable('external_counsel', {
  id: serial('id').primaryKey(),
  firmName: varchar('firm_name', { length: 255 }).notNull(),
  contactPerson: varchar('contact_person', { length: 255 }).notNull(),
  designation: varchar('designation', { length: 255 }),
  specialization: varchar('specialization', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),
  address: text('address'),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 100 }),
  country: varchar('country', { length: 100 }).notNull().default('India'),
  barCouncilNumber: varchar('bar_council_number', { length: 100 }),
  yearsExperience: integer('years_experience'),
  hourlyRate: decimal('hourly_rate', { precision: 10, scale: 2 }),
  currency: varchar('currency', { length: 10 }).notNull().default('INR'),
  rating: integer('rating'),
  status: varchar('status', { length: 50 }).notNull().default('Active'),
  retainerAgreement: boolean('retainer_agreement').notNull().default(false),
  notes: text('notes'),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Policy Templates table
export const policyTemplates = pgTable('policy_templates', {
  id: serial('id').primaryKey(),
  templateName: varchar('template_name', { length: 255 }).notNull(),
  templateType: varchar('template_type', { length: 100 }).notNull(),
  category: varchar('category', { length: 100 }),
  version: varchar('version', { length: 50 }).notNull(),
  effectiveDate: date('effective_date').notNull(),
  reviewDate: date('review_date'),
  approvalStatus: varchar('approval_status', { length: 50 }).notNull().default('Draft'),
  approvedBy: integer('approved_by').references(() => users.id),
  approvalDate: date('approval_date'),
  templateContent: text('template_content').notNull(),
  filePath: varchar('file_path', { length: 500 }),
  fileUrl: varchar('file_url', { length: 500 }),
  applicableLocations: text('applicable_locations'),
  mandatory: boolean('mandatory').notNull().default(false),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Legal Alerts table
export const legalAlerts = pgTable('legal_alerts', {
  id: serial('id').primaryKey(),
  alertType: varchar('alert_type', { length: 100 }).notNull(),
  referenceType: varchar('reference_type', { length: 100 }).notNull(),
  referenceId: integer('reference_id').notNull(),
  alertDate: date('alert_date').notNull(),
  alertTitle: varchar('alert_title', { length: 255 }).notNull(),
  alertMessage: text('alert_message').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('Active'),
  priority: varchar('priority', { length: 20 }).notNull().default('Medium'),
  assignedTo: integer('assigned_to').references(() => users.id),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Legal Management Relations
export const contractsRelations = relations(contracts, ({ one }) => ({
  createdByUser: one(users, {
    fields: [contracts.createdBy],
    references: [users.id],
  }),
  assignedToUser: one(users, {
    fields: [contracts.assignedTo],
    references: [users.id],
  }),
}));

export const legalCasesRelations = relations(legalCases, ({ one }) => ({
  createdByUser: one(users, {
    fields: [legalCases.createdBy],
    references: [users.id],
  }),
  internalCounselUser: one(users, {
    fields: [legalCases.internalCounsel],
    references: [users.id],
  }),
  externalCounselUser: one(externalCounsel, {
    fields: [legalCases.externalCounselId],
    references: [externalCounsel.id],
  }),
}));

export const complianceRegisterRelations = relations(complianceRegister, ({ one }) => ({
  createdByUser: one(users, {
    fields: [complianceRegister.createdBy],
    references: [users.id],
  }),
  responsiblePersonUser: one(users, {
    fields: [complianceRegister.responsiblePerson],
    references: [users.id],
  }),
}));

export const poshCasesRelations = relations(poshCases, ({ one }) => ({
  createdByUser: one(users, {
    fields: [poshCases.createdBy],
    references: [users.id],
  }),
  investigationOfficerUser: one(users, {
    fields: [poshCases.investigationOfficer],
    references: [users.id],
  }),
}));

export const legalNoticesRelations = relations(legalNotices, ({ one }) => ({
  createdByUser: one(users, {
    fields: [legalNotices.createdBy],
    references: [users.id],
  }),
  assignedToUser: one(users, {
    fields: [legalNotices.assignedTo],
    references: [users.id],
  }),
}));

export const externalCounselRelations = relations(externalCounsel, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [externalCounsel.createdBy],
    references: [users.id],
  }),
  cases: many(legalCases),
}));

export const policyTemplatesRelations = relations(policyTemplates, ({ one }) => ({
  createdByUser: one(users, {
    fields: [policyTemplates.createdBy],
    references: [users.id],
  }),
  approvedByUser: one(users, {
    fields: [policyTemplates.approvedBy],
    references: [users.id],
  }),
}));

export const legalAlertsRelations = relations(legalAlerts, ({ one }) => ({
  createdByUser: one(users, {
    fields: [legalAlerts.createdBy],
    references: [users.id],
  }),
  assignedToUser: one(users, {
    fields: [legalAlerts.assignedTo],
    references: [users.id],
  }),
}));

// Legal Management Zod Schemas
export const insertContractSchema = createInsertSchema(contracts)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    description: z.string().optional(),
    partyContact: z.string().optional(),
    partyEmail: z.string().optional(),
    endDate: z.string().optional().transform(dateStringToDate),
    renewalDate: z.string().optional().transform(dateStringToDate),
    contractValue: z.string().optional(),
    assignedTo: z.number().optional(),
    filePath: z.string().optional(),
    fileUrl: z.string().optional(),
    startDate: z.string().transform(dateStringToDate),
  });

export const insertLegalCaseSchema = createInsertSchema(legalCases)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    courtName: z.string().optional(),
    judgeName: z.string().optional(),
    opposingParty: z.string().optional(),
    caseValue: z.string().optional(),
    filingDate: z.string().optional().transform(dateStringToDate),
    nextHearingDate: z.string().optional().transform(dateStringToDate),
    expectedClosureDate: z.string().optional().transform(dateStringToDate),
    description: z.string().optional(),
    outcome: z.string().optional(),
    internalCounsel: z.number().optional(),
    externalCounselId: z.number().optional(),
  });

export const insertComplianceRegisterSchema = createInsertSchema(complianceRegister)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    applicableSection: z.string().optional(),
    completionDate: z.string().optional().transform(dateStringToDate),
    responsiblePerson: z.number().optional(),
    complianceEvidence: z.string().optional(),
    filePath: z.string().optional(),
    fileUrl: z.string().optional(),
    penaltyAmount: z.string().optional(),
    remarks: z.string().optional(),
    dueDate: z.string().transform(dateStringToDate),
  });

export const insertPoshCaseSchema = createInsertSchema(poshCases)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    complainantDesignation: z.string().optional(),
    complainantDepartment: z.string().optional(),
    respondentDesignation: z.string().optional(),
    respondentDepartment: z.string().optional(),
    incidentDate: z.string().optional().transform(dateStringToDate),
    incidentLocation: z.string().optional(),
    actionTaken: z.string().optional(),
    outcome: z.string().optional(),
    closureDate: z.string().optional().transform(dateStringToDate),
    committeeMembers: z.string().optional(),
    investigationOfficer: z.number().optional(),
    filePath: z.string().optional(),
    fileUrl: z.string().optional(),
    complaintDate: z.string().transform(dateStringToDate),
  });

export const insertLegalNoticeSchema = createInsertSchema(legalNotices)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    responseDueDate: z.string().optional().transform(dateStringToDate),
    responseDate: z.string().optional().transform(dateStringToDate),
    responseSummary: z.string().optional(),
    actionRequired: z.string().optional(),
    assignedTo: z.number().optional(),
    filePath: z.string().optional(),
    fileUrl: z.string().optional(),
    noticeDate: z.string().transform(dateStringToDate),
  });

export const insertExternalCounselSchema = createInsertSchema(externalCounsel)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    designation: z.string().optional(),
    specialization: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    barCouncilNumber: z.string().optional(),
    yearsExperience: z.number().optional(),
    hourlyRate: z.string().optional(),
    rating: z.number().optional(),
    notes: z.string().optional(),
  });

export const insertPolicyTemplateSchema = createInsertSchema(policyTemplates)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    category: z.string().optional(),
    reviewDate: z.string().optional().transform(dateStringToDate),
    approvedBy: z.number().optional(),
    approvalDate: z.string().optional().transform(dateStringToDate),
    filePath: z.string().optional(),
    fileUrl: z.string().optional(),
    applicableLocations: z.string().optional(),
    effectiveDate: z.string().transform(dateStringToDate),
  });

export const insertLegalAlertSchema = createInsertSchema(legalAlerts)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    assignedTo: z.number().optional(),
    alertDate: z.string().transform(dateStringToDate),
  });

// Legal Management Types
export type Contract = typeof contracts.$inferSelect;
export type InsertContract = z.infer<typeof insertContractSchema>;
export type LegalCase = typeof legalCases.$inferSelect;
export type InsertLegalCase = z.infer<typeof insertLegalCaseSchema>;
export type ComplianceRegister = typeof complianceRegister.$inferSelect;
export type InsertComplianceRegister = z.infer<typeof insertComplianceRegisterSchema>;
export type PoshCase = typeof poshCases.$inferSelect;
export type InsertPoshCase = z.infer<typeof insertPoshCaseSchema>;
export type LegalNotice = typeof legalNotices.$inferSelect;
export type InsertLegalNotice = z.infer<typeof insertLegalNoticeSchema>;
export type ExternalCounsel = typeof externalCounsel.$inferSelect;
export type InsertExternalCounsel = z.infer<typeof insertExternalCounselSchema>;
export type PolicyTemplate = typeof policyTemplates.$inferSelect;
export type InsertPolicyTemplate = z.infer<typeof insertPolicyTemplateSchema>;
export type LegalAlert = typeof legalAlerts.$inferSelect;
export type InsertLegalAlert = z.infer<typeof insertLegalAlertSchema>;

// NDA and Exclusivity Agreement Relations
export const ndaAgreementsRelations = relations(ndaAgreements, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [ndaAgreements.createdBy],
    references: [users.id],
  }),
  assignedToUser: one(users, {
    fields: [ndaAgreements.assignedTo],
    references: [users.id],
  }),
  approvedByUser: one(users, {
    fields: [ndaAgreements.approvedBy],
    references: [users.id],
  }),
  breachIncidents: many(ndaBreachIncidents),
}));

export const exclusivityAgreementsRelations = relations(exclusivityAgreements, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [exclusivityAgreements.createdBy],
    references: [users.id],
  }),
  assignedToUser: one(users, {
    fields: [exclusivityAgreements.assignedTo],
    references: [users.id],
  }),
  approvedByUser: one(users, {
    fields: [exclusivityAgreements.approvedBy],
    references: [users.id],
  }),
  performanceRecords: many(exclusivityPerformance),
}));

export const ndaBreachIncidentsRelations = relations(ndaBreachIncidents, ({ one }) => ({
  ndaAgreement: one(ndaAgreements, {
    fields: [ndaBreachIncidents.ndaId],
    references: [ndaAgreements.id],
  }),
  createdByUser: one(users, {
    fields: [ndaBreachIncidents.createdBy],
    references: [users.id],
  }),
  assignedToUser: one(users, {
    fields: [ndaBreachIncidents.assignedTo],
    references: [users.id],
  }),
}));

export const exclusivityPerformanceRelations = relations(exclusivityPerformance, ({ one }) => ({
  exclusivityAgreement: one(exclusivityAgreements, {
    fields: [exclusivityPerformance.exclusivityId],
    references: [exclusivityAgreements.id],
  }),
  createdByUser: one(users, {
    fields: [exclusivityPerformance.createdBy],
    references: [users.id],
  }),
  evaluatedByUser: one(users, {
    fields: [exclusivityPerformance.evaluatedBy],
    references: [users.id],
  }),
}));

export const agreementAmendmentsRelations = relations(agreementAmendments, ({ one }) => ({
  createdByUser: one(users, {
    fields: [agreementAmendments.createdBy],
    references: [users.id],
  }),
  approvedByUser: one(users, {
    fields: [agreementAmendments.approvedBy],
    references: [users.id],
  }),
  legalReviewerUser: one(users, {
    fields: [agreementAmendments.legalReviewer],
    references: [users.id],
  }),
}));

// NDA and Exclusivity Agreement Zod Schemas
export const insertNdaAgreementSchema = createInsertSchema(ndaAgreements)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    description: z.string().optional(),
    partyContact: z.string().optional(),
    partyEmail: z.string().optional(),
    endDate: z.string().optional().transform(dateStringToDate),
    durationMonths: z.number().optional(),
    permittedUse: z.string().optional(),
    exceptions: z.string().optional(),
    monetaryDamages: z.string().optional(),
    jurisdiction: z.string().optional(),
    assignedTo: z.number().optional(),
    approvedBy: z.number().optional(),
    filePath: z.string().optional(),
    fileUrl: z.string().optional(),
    signedDate: z.string().optional().transform(dateStringToDate),
    witnessName: z.string().optional(),
    witnessContact: z.string().optional(),
    startDate: z.string().transform(dateStringToDate),
  });

export const insertExclusivityAgreementSchema = createInsertSchema(exclusivityAgreements)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    description: z.string().optional(),
    partyContact: z.string().optional(),
    partyEmail: z.string().optional(),
    geographicalScope: z.string().optional(),
    productServiceScope: z.string().optional(),
    territoryRestrictions: z.string().optional(),
    endDate: z.string().optional().transform(dateStringToDate),
    durationMonths: z.number().optional(),
    minimumCommitment: z.string().optional(),
    performanceTargets: z.string().optional(),
    penaltyClause: z.string().optional(),
    terminationConditions: z.string().optional(),
    renewalTerms: z.string().optional(),
    competingRestrictions: z.string().optional(),
    nonCompetePeriod: z.number().optional(),
    agreementValue: z.string().optional(),
    paymentTerms: z.string().optional(),
    milestoneRequirements: z.string().optional(),
    jurisdiction: z.string().optional(),
    assignedTo: z.number().optional(),
    approvedBy: z.number().optional(),
    filePath: z.string().optional(),
    fileUrl: z.string().optional(),
    signedDate: z.string().optional().transform(dateStringToDate),
    witnessName: z.string().optional(),
    witnessContact: z.string().optional(),
    startDate: z.string().transform(dateStringToDate),
  });

export const insertNdaBreachIncidentSchema = createInsertSchema(ndaBreachIncidents)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    discoveredBy: z.string().optional(),
    discoveryDate: z.string().optional().transform(dateStringToDate),
    investigationFindings: z.string().optional(),
    remedialActions: z.string().optional(),
    legalActionDetails: z.string().optional(),
    damagesClaimed: z.string().optional(),
    damagesAwarded: z.string().optional(),
    resolutionDate: z.string().optional().transform(dateStringToDate),
    lessonsLearned: z.string().optional(),
    preventiveMeasures: z.string().optional(),
    assignedTo: z.number().optional(),
    incidentDate: z.string().transform(dateStringToDate),
  });

export const insertExclusivityPerformanceSchema = createInsertSchema(exclusivityPerformance)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    targetAchievement: z.string().optional(),
    revenueGenerated: z.string().optional(),
    volumeAchieved: z.string().optional(),
    performanceRating: z.string().optional(),
    performanceScore: z.number().optional(),
    complianceScore: z.number().optional(),
    feedbackComments: z.string().optional(),
    improvementAreas: z.string().optional(),
    recognitionRewards: z.string().optional(),
    penaltyAmount: z.string().optional(),
    penaltyReason: z.string().optional(),
    nextEvaluationDate: z.string().optional().transform(dateStringToDate),
    evaluatedBy: z.number().optional(),
    evaluationDate: z.string().transform(dateStringToDate),
  });

export const insertAgreementAmendmentSchema = createInsertSchema(agreementAmendments)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    previousTerms: z.string().optional(),
    newTerms: z.string().optional(),
    reasonForChange: z.string().optional(),
    effectiveDate: z.string().optional().transform(dateStringToDate),
    approvedBy: z.number().optional(),
    approvalDate: z.string().optional().transform(dateStringToDate),
    legalReviewer: z.number().optional(),
    legalReviewDate: z.string().optional().transform(dateStringToDate),
    legalReviewComments: z.string().optional(),
    filePath: z.string().optional(),
    fileUrl: z.string().optional(),
    amendmentDate: z.string().transform(dateStringToDate),
  });

// NDA and Exclusivity Agreement Types
export type NdaAgreement = typeof ndaAgreements.$inferSelect;
export type InsertNdaAgreement = z.infer<typeof insertNdaAgreementSchema>;
export type ExclusivityAgreement = typeof exclusivityAgreements.$inferSelect;
export type InsertExclusivityAgreement = z.infer<typeof insertExclusivityAgreementSchema>;
export type NdaBreachIncident = typeof ndaBreachIncidents.$inferSelect;
export type InsertNdaBreachIncident = z.infer<typeof insertNdaBreachIncidentSchema>;
export type ExclusivityPerformance = typeof exclusivityPerformance.$inferSelect;
export type InsertExclusivityPerformance = z.infer<typeof insertExclusivityPerformanceSchema>;
export type AgreementAmendment = typeof agreementAmendments.$inferSelect;
export type InsertAgreementAmendment = z.infer<typeof insertAgreementAmendmentSchema>;

// =============================================================================
// MEETINGS & COMMITMENTS MODULE
// =============================================================================

// Business Meetings table
export const businessMeetings = pgTable('business_meetings', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  meetingType: varchar('meeting_type', { length: 50 }).notNull(), // Team Meeting, Client Meeting, Board Meeting, etc.
  priority: varchar('priority', { length: 20 }).notNull().default('Medium'), // Low, Medium, High, Critical
  
  // Scheduling
  meetingDate: date('meeting_date').notNull(),
  startTime: varchar('start_time', { length: 8 }).notNull(), // HH:MM:SS format
  endTime: varchar('end_time', { length: 8 }).notNull(),
  duration: integer('duration_minutes'), // Auto-calculated duration in minutes
  timezone: varchar('timezone', { length: 50 }).notNull().default('Asia/Kolkata'),
  
  // Location
  location: text('location'), // Physical location or "Virtual"
  meetingUrl: text('meeting_url'), // Zoom, Teams, etc. URL
  meetingRoomId: integer('meeting_room_id'), // Future: Link to meeting rooms table
  
  // Organizer and participants
  organizerId: integer('organizer_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  attendeeIds: jsonb('attendee_ids').notNull().default([]), // Array of user IDs
  externalAttendees: jsonb('external_attendees').default([]), // Array of {name, email, company} objects
  
  // Agenda and documentation
  agenda: text('agenda'),
  agendaItems: jsonb('agenda_items').default([]), // Array of {item, duration, presenter, type} objects
  meetingNotes: text('meeting_notes'),
  keyDecisions: text('key_decisions'),
  nextSteps: text('next_steps'),
  
  // Meeting outcomes
  status: varchar('status', { length: 20 }).notNull().default('Scheduled'), // Scheduled, In Progress, Completed, Cancelled, Postponed
  completionPercentage: integer('completion_percentage').default(0), // 0-100
  effectivenessRating: integer('effectiveness_rating'), // 1-5 scale
  
  // Document attachments
  attachments: jsonb('attachments').default([]), // Array of {filename, fileUrl, uploadedBy, uploadedAt} objects
  
  // Follow-up and recurring meetings
  isRecurring: boolean('is_recurring').default(false),
  recurringPattern: jsonb('recurring_pattern'), // {type: 'weekly/monthly', interval: 1, endDate: 'date'}
  parentMeetingId: integer('parent_meeting_id').references(() => businessMeetings.id), // For recurring meetings
  
  // KPI Integration
  linkedKpis: jsonb('linked_kpis').default([]), // Array of KPI IDs that this meeting impacts
  kpiWeight: decimal('kpi_weight', { precision: 5, scale: 2 }).default('0'), // Weight in KPI calculation (0-100)
  
  // Google Calendar Integration
  googleEventId: text('google_event_id'),
  googleCalendarSynced: boolean('google_calendar_synced').default(false),
  googleEventLink: text('google_event_link'),
  autoCreateCalendarEvent: boolean('auto_create_calendar_event').default(true),
  
  // Google Meet Integration
  googleMeetLink: text('google_meet_link'),
  googleMeetUrl: text('google_meet_url'), // Alternative field for compatibility
  googleMeetEnabled: boolean('google_meet_enabled').default(true),
  autoCreateGoogleMeet: boolean('auto_create_google_meet').default(true),
  
  // AI Meeting Notes fields
  recordingUrl: text('recording_url'),
  transcriptUrl: text('transcript_url'),
  aiSummary: text('ai_summary'),
  aiActionItems: jsonb('ai_action_items').$type<any[]>().default([]),
  aiKeyPoints: jsonb('ai_key_points').$type<any[]>().default([]),
  recordingEnabled: boolean('recording_enabled').default(false),
  aiNotesGenerated: boolean('ai_notes_generated').default(false),
  aiNotesGeneratedAt: timestamp('ai_notes_generated_at'),
  
  // Tracking
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
});

// Meeting Commitments/Action Items table
export const meetingCommitments = pgTable('meeting_commitments', {
  id: serial('id').primaryKey(),
  meetingId: integer('meeting_id').references(() => businessMeetings.id, { onDelete: 'cascade' }), // Nullable for Google Calendar events
  
  // Meeting reference fields (supports both internal meetings and Google Calendar events)
  meetingType: varchar('meeting_type', { length: 20 }).notNull().default('internal'), // 'internal' or 'google_calendar'
  googleCalendarEventId: text('google_calendar_event_id'), // Google Calendar event ID when meetingType is 'google_calendar'
  meetingTitle: text('meeting_title'), // Meeting title for display purposes
  meetingDate: date('meeting_date'), // Meeting date for display and filtering
  meetingStartTime: time('meeting_start_time'), // Meeting start time for display purposes
  
  // Commitment details
  title: text('title').notNull(),
  description: text('description'),
  priority: varchar('priority', { length: 20 }).notNull().default('Medium'), // Low, Medium, High, Critical
  category: varchar('category', { length: 50 }).default('Action Item'), // Action Item, Decision, Information, Follow-up
  
  // Assignment and responsibility
  assignedToId: integer('assigned_to_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assignedById: integer('assigned_by_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  collaborators: jsonb('collaborators').default([]), // Array of user IDs who are helping
  
  // Timeline and deadlines
  dueDate: date('due_date').notNull(),
  estimatedHours: decimal('estimated_hours', { precision: 5, scale: 2 }),
  actualHours: decimal('actual_hours', { precision: 5, scale: 2 }),
  
  // Progress tracking
  status: varchar('status', { length: 20 }).notNull().default('Pending'), // Pending, In Progress, Completed, Overdue, Cancelled, On Hold
  progressPercentage: integer('progress_percentage').default(0), // 0-100
  completionDate: date('completion_date'),
  
  // Updates and communication
  statusUpdates: jsonb('status_updates').default([]), // Array of {date, update, userId, timestamp} objects
  blockers: text('blockers'), // What's preventing completion
  dependencies: jsonb('dependencies').default([]), // Array of commitment IDs this depends on
  
  // Escalation and reminders
  reminderDays: integer('reminder_days').default(1), // Days before due date to send reminder
  escalationDays: integer('escalation_days').default(3), // Days overdue before escalating to manager
  lastReminderSent: timestamp('last_reminder_sent'),
  escalationSent: boolean('escalation_sent').default(false),
  escalatedAt: timestamp('escalated_at'),
  escalatedToId: integer('escalated_to_id').references(() => users.id), // Manager who received escalation
  
  // Quality and impact
  impactLevel: varchar('impact_level', { length: 20 }).default('Medium'), // Low, Medium, High, Critical
  businessValue: text('business_value'), // Description of business impact
  successCriteria: text('success_criteria'), // How to measure success
  deliverables: jsonb('deliverables').default([]), // Array of expected outputs
  
  // KPI Integration
  linkedKpis: jsonb('linked_kpis').default([]), // Array of KPI IDs this commitment affects
  kpiWeight: decimal('kpi_weight', { precision: 5, scale: 2 }).default('0'), // Weight in KPI calculation (0-100)
  kpiImpactPercentage: decimal('kpi_impact_percentage', { precision: 5, scale: 2 }).default('0'), // % impact on linked KPIs
  
  // Approval and sign-off
  requiresApproval: boolean('requires_approval').default(false),
  approvedBy: integer('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  approvalNotes: text('approval_notes'),
  
  // Tracking
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Meeting Attendance Tracking table
export const meetingAttendance = pgTable('meeting_attendance', {
  id: serial('id').primaryKey(),
  meetingId: integer('meeting_id').notNull().references(() => businessMeetings.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Attendance status
  status: varchar('status', { length: 20 }).notNull().default('Invited'), // Invited, Accepted, Declined, Tentative, Attended, No Show
  responseDate: timestamp('response_date'),
  attendanceConfirmed: boolean('attendance_confirmed').default(false),
  
  // Participation tracking
  joinTime: timestamp('join_time'),
  leaveTime: timestamp('leave_time'),
  participationMinutes: integer('participation_minutes'), // Actual time spent in meeting
  participationScore: integer('participation_score'), // 1-5 scale for engagement level
  
  // Feedback and notes
  meetingFeedback: text('meeting_feedback'),
  actionItemsReceived: integer('action_items_received').default(0),
  actionItemsCompleted: integer('action_items_completed').default(0),
  
  // Tracking
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Meeting Reminder and Escalation Log table
export const meetingReminders = pgTable('meeting_reminders', {
  id: serial('id').primaryKey(),
  
  // Reference
  meetingId: integer('meeting_id').references(() => businessMeetings.id, { onDelete: 'cascade' }),
  commitmentId: integer('commitment_id').references(() => meetingCommitments.id, { onDelete: 'cascade' }),
  
  // Reminder details
  reminderType: varchar('reminder_type', { length: 30 }).notNull(), // meeting_reminder, commitment_due, commitment_overdue, escalation
  recipientId: integer('recipient_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reminderMessage: text('reminder_message').notNull(),
  
  // Delivery
  deliveryMethod: varchar('delivery_method', { length: 20 }).notNull().default('email'), // email, sms, push, in_app
  sentAt: timestamp('sent_at').notNull().defaultNow(),
  deliveryStatus: varchar('delivery_status', { length: 20 }).notNull().default('sent'), // sent, delivered, failed, read
  
  // Response tracking
  acknowledged: boolean('acknowledged').default(false),
  acknowledgedAt: timestamp('acknowledged_at'),
  responseAction: varchar('response_action', { length: 50 }), // status_updated, deadline_extended, task_completed, etc.
  
  // Tracking
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Meeting Analytics and Metrics table
export const meetingAnalytics = pgTable('meeting_analytics', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  teamId: integer('team_id'), // Future: Link to teams table
  
  // Time period
  periodType: varchar('period_type', { length: 20 }).notNull(), // daily, weekly, monthly, quarterly, yearly
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  
  // Meeting metrics
  totalMeetings: integer('total_meetings').default(0),
  meetingsOrganized: integer('meetings_organized').default(0),
  meetingsAttended: integer('meetings_attended').default(0),
  meetingHours: decimal('meeting_hours', { precision: 6, scale: 2 }).default('0'),
  averageMeetingDuration: decimal('average_meeting_duration', { precision: 5, scale: 2 }).default('0'),
  meetingEffectivenessScore: decimal('meeting_effectiveness_score', { precision: 5, scale: 2 }).default('0'),
  
  // Commitment metrics
  totalCommitments: integer('total_commitments').default(0),
  commitmentsAssigned: integer('commitments_assigned').default(0),
  commitmentsCompleted: integer('commitments_completed').default(0),
  commitmentsOverdue: integer('commitments_overdue').default(0),
  averageCompletionTime: decimal('average_completion_time', { precision: 5, scale: 2 }).default('0'), // Days
  commitmentCompletionRate: decimal('commitment_completion_rate', { precision: 5, scale: 2 }).default('0'), // Percentage
  
  // KPI Impact
  kpiImpactScore: decimal('kpi_impact_score', { precision: 5, scale: 2 }).default('0'), // Weighted score from KPI-linked commitments
  businessValueGenerated: decimal('business_value_generated', { precision: 10, scale: 2 }).default('0'),
  
  // Quality metrics
  participationScore: decimal('participation_score', { precision: 5, scale: 2 }).default('0'),
  feedbackScore: decimal('feedback_score', { precision: 5, scale: 2 }).default('0'),
  punctualityScore: decimal('punctuality_score', { precision: 5, scale: 2 }).default('0'),
  
  // Tracking
  calculatedAt: timestamp('calculated_at').notNull().defaultNow(),
  lastUpdated: timestamp('last_updated').notNull().defaultNow(),
});

// Meeting KPI Integration table
export const meetingKpiLinks = pgTable('meeting_kpi_links', {
  id: serial('id').primaryKey(),
  
  // References
  meetingId: integer('meeting_id').references(() => businessMeetings.id, { onDelete: 'cascade' }),
  commitmentId: integer('commitment_id').references(() => meetingCommitments.id, { onDelete: 'cascade' }),
  kpiId: integer('kpi_id'), // Reference to KPI system (future implementation)
  
  // KPI details
  kpiName: text('kpi_name').notNull(),
  kpiCategory: varchar('kpi_category', { length: 50 }), // Revenue, Quality, Efficiency, Customer, Employee
  
  // Impact tracking
  baselineValue: decimal('baseline_value', { precision: 15, scale: 6 }),
  targetValue: decimal('target_value', { precision: 15, scale: 6 }),
  currentValue: decimal('current_value', { precision: 15, scale: 6 }),
  impactWeight: decimal('impact_weight', { precision: 5, scale: 2 }).default('0'), // 0-100 percentage
  
  // Progress tracking
  measurementDate: date('measurement_date'),
  progressPercentage: decimal('progress_percentage', { precision: 5, scale: 2 }).default('0'),
  isPositiveImpact: boolean('is_positive_impact').default(true), // Whether higher values are better
  
  // Tracking
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Meeting Templates table for recurring meeting patterns
export const meetingTemplates = pgTable('meeting_templates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  
  // Template details
  meetingType: varchar('meeting_type', { length: 50 }).notNull(),
  defaultDuration: integer('default_duration_minutes').default(60),
  defaultLocation: text('default_location'),
  
  // Default agenda
  agendaTemplate: jsonb('agenda_template').default([]), // Array of agenda item templates
  standardAttendees: jsonb('standard_attendees').default([]), // Array of user IDs or role types
  
  // KPI settings
  linkedKpis: jsonb('linked_kpis').default([]),
  defaultKpiWeight: decimal('default_kpi_weight', { precision: 5, scale: 2 }).default('0'),
  
  // Template settings
  isActive: boolean('is_active').default(true),
  isPublic: boolean('is_public').default(false), // Available to all users or just creator
  usageCount: integer('usage_count').default(0),
  
  // Tracking
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Relations for Meetings & Commitments module
export const businessMeetingsRelations = relations(businessMeetings, ({ one, many }) => ({
  organizer: one(users, {
    fields: [businessMeetings.organizerId],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [businessMeetings.createdBy],
    references: [users.id],
  }),
  parentMeeting: one(businessMeetings, {
    fields: [businessMeetings.parentMeetingId],
    references: [businessMeetings.id],
  }),
  commitments: many(meetingCommitments),
  attendance: many(meetingAttendance),
  reminders: many(meetingReminders),
  kpiLinks: many(meetingKpiLinks),
}));

export const meetingCommitmentsRelations = relations(meetingCommitments, ({ one, many }) => ({
  meeting: one(businessMeetings, {
    fields: [meetingCommitments.meetingId],
    references: [businessMeetings.id],
  }),
  assignedTo: one(users, {
    fields: [meetingCommitments.assignedToId],
    references: [users.id],
  }),
  assignedBy: one(users, {
    fields: [meetingCommitments.assignedById],
    references: [users.id],
  }),
  escalatedTo: one(users, {
    fields: [meetingCommitments.escalatedToId],
    references: [users.id],
  }),
  approver: one(users, {
    fields: [meetingCommitments.approvedBy],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [meetingCommitments.createdBy],
    references: [users.id],
  }),
  reminders: many(meetingReminders),
  kpiLinks: many(meetingKpiLinks),
}));

export const meetingAttendanceRelations = relations(meetingAttendance, ({ one }) => ({
  meeting: one(businessMeetings, {
    fields: [meetingAttendance.meetingId],
    references: [businessMeetings.id],
  }),
  user: one(users, {
    fields: [meetingAttendance.userId],
    references: [users.id],
  }),
}));

export const meetingRemindersRelations = relations(meetingReminders, ({ one }) => ({
  meeting: one(businessMeetings, {
    fields: [meetingReminders.meetingId],
    references: [businessMeetings.id],
  }),
  commitment: one(meetingCommitments, {
    fields: [meetingReminders.commitmentId],
    references: [meetingCommitments.id],
  }),
  recipient: one(users, {
    fields: [meetingReminders.recipientId],
    references: [users.id],
  }),
}));

export const meetingAnalyticsRelations = relations(meetingAnalytics, ({ one }) => ({
  user: one(users, {
    fields: [meetingAnalytics.userId],
    references: [users.id],
  }),
}));

export const meetingKpiLinksRelations = relations(meetingKpiLinks, ({ one }) => ({
  meeting: one(businessMeetings, {
    fields: [meetingKpiLinks.meetingId],
    references: [businessMeetings.id],
  }),
  commitment: one(meetingCommitments, {
    fields: [meetingKpiLinks.commitmentId],
    references: [meetingCommitments.id],
  }),
  creator: one(users, {
    fields: [meetingKpiLinks.createdBy],
    references: [users.id],
  }),
}));

export const meetingTemplatesRelations = relations(meetingTemplates, ({ one }) => ({
  creator: one(users, {
    fields: [meetingTemplates.createdBy],
    references: [users.id],
  }),
}));

// Meetings & Commitments schemas for validation
export const insertBusinessMeetingSchema = createInsertSchema(businessMeetings)
  .omit({ id: true, createdAt: true, updatedAt: true, completedAt: true })
  .extend({
    meetingDate: z.string().transform((str) => new Date(str)),
    startTime: z.string(),
    endTime: z.string(),
    attendeeIds: z.array(z.number()).default([]),
    externalAttendees: z.array(z.object({
      name: z.string(),
      email: z.string().email(),
      company: z.string().optional(),
    })).default([]),
    agendaItems: z.array(z.object({
      item: z.string(),
      duration: z.number().optional(),
      presenter: z.string().optional(),
      type: z.string().optional(),
    })).default([]),
    attachments: z.array(z.object({
      filename: z.string(),
      fileUrl: z.string(),
      uploadedBy: z.number(),
      uploadedAt: z.string(),
    })).default([]),
    linkedKpis: z.array(z.number()).default([]),
    googleMeetEnabled: z.boolean().default(true),
    recordingEnabled: z.boolean().default(false),
    autoCreateGoogleMeet: z.boolean().default(true),
  });

export const insertMeetingCommitmentSchema = createInsertSchema(meetingCommitments)
  .omit({ id: true, createdAt: true, updatedAt: true, completedAt: true, escalatedAt: true, approvedAt: true })
  .extend({
    meetingId: z.number().optional(), // Now nullable for Google Calendar events
    meetingType: z.enum(['internal', 'google_calendar']).default('internal'),
    googleCalendarEventId: z.string().optional(),
    meetingTitle: z.string().optional(),
    meetingDate: z.string().optional(),
    meetingStartTime: z.string().optional(),
    dueDate: z.string().transform((str) => new Date(str)),
    collaborators: z.array(z.number()).default([]),
    statusUpdates: z.array(z.object({
      date: z.string(),
      update: z.string(),
      userId: z.number(),
      timestamp: z.string(),
    })).default([]),
    dependencies: z.array(z.number()).default([]),
    deliverables: z.array(z.string()).default([]),
    linkedKpis: z.array(z.number()).default([]),
  });

export const insertMeetingAttendanceSchema = createInsertSchema(meetingAttendance)
  .omit({ id: true, createdAt: true, updatedAt: true, responseDate: true, joinTime: true, leaveTime: true });

// Types for Meetings & Commitments module
export type BusinessMeeting = typeof businessMeetings.$inferSelect;
export type InsertBusinessMeeting = z.infer<typeof insertBusinessMeetingSchema>;
export type MeetingCommitment = typeof meetingCommitments.$inferSelect;
export type InsertMeetingCommitment = z.infer<typeof insertMeetingCommitmentSchema>;
export type MeetingAttendance = typeof meetingAttendance.$inferSelect;
export type InsertMeetingAttendance = z.infer<typeof insertMeetingAttendanceSchema>;
export type MeetingReminder = typeof meetingReminders.$inferSelect;
export type MeetingAnalytics = typeof meetingAnalytics.$inferSelect;
export type MeetingKpiLink = typeof meetingKpiLinks.$inferSelect;
export type MeetingTemplate = typeof meetingTemplates.$inferSelect;

// ==================== DESIGN MANAGEMENT MODULE ====================

// Design Project Status
export const designProjectStatuses = [
  "Draft",
  "In Progress", 
  "Under Review",
  "Approved",
  "On Hold",
  "Cancelled",
  "Completed"
] as const;

export type DesignProjectStatus = typeof designProjectStatuses[number];

// Design Phases
export const designPhases = [
  "Conceptual",
  "Preliminary",
  "Detailed",
  "Final",
  "As-Built"
] as const;

export type DesignPhase = typeof designPhases[number];

// Drawing Categories
export const drawingCategories = [
  "P&ID",
  "Equipment Layout",
  "Piping Isometric",
  "Electrical",
  "Civil",
  "Instrumentation",
  "3D Model",
  "General Arrangement",
  "Assembly Drawing",
  "Detail Drawing"
] as const;

export type DrawingCategory = typeof drawingCategories[number];

// Drawing Status
export const drawingStatuses = [
  "Draft",
  "Under Review",
  "Approved",
  "Issued for Construction",
  "As-Built",
  "Superseded",
  "Cancelled"
] as const;

export type DrawingStatus = typeof drawingStatuses[number];

// Review Status
export const reviewStatuses = [
  "Pending",
  "In Progress",
  "Approved",
  "Rejected",
  "Approved with Comments"
] as const;

export type ReviewStatus = typeof reviewStatuses[number];

// Design Projects table
export const designProjects = pgTable('design_projects', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectCode: text('project_code').notNull(),
  designProjectName: varchar('design_project_name', { length: 255 }).notNull(),
  description: text('description'),
  designPhase: varchar('design_phase', { length: 50 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('Draft'),
  
  // Design Manager and Team
  designManagerId: integer('design_manager_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  teamMembers: jsonb('team_members').default([]), // Array of user IDs
  
  // Timeline
  startDate: date('start_date'),
  targetEndDate: date('target_end_date'),
  actualEndDate: date('actual_end_date'),
  
  // Client Information
  clientApprovalRequired: boolean('client_approval_required').default(false),
  clientContactInfo: text('client_contact_info'),
  
  // Progress Tracking
  overallProgress: integer('overall_progress').default(0), // Percentage 0-100
  
  // Audit Information
  createdBy: integer('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Design Drawings table
export const designDrawings = pgTable('design_drawings', {
  id: serial('id').primaryKey(),
  designProjectId: integer('design_project_id').notNull().references(() => designProjects.id, { onDelete: 'cascade' }),
  
  // Drawing Identification
  drawingNumber: varchar('drawing_number', { length: 100 }).notNull().unique(),
  drawingTitle: varchar('drawing_title', { length: 255 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  disciplineCode: varchar('discipline_code', { length: 10 }), // ME, EE, CV, etc.
  
  // Drawing Details
  description: text('description'),
  scale: varchar('scale', { length: 50 }),
  paperSize: varchar('paper_size', { length: 10 }).default('A1'),
  sheetCount: integer('sheet_count').default(1),
  
  // Status and Version
  status: varchar('status', { length: 50 }).notNull().default('Draft'),
  currentRevision: varchar('current_revision', { length: 10 }).default('A'),
  latestVersionId: integer('latest_version_id'), // Self-reference to latest version
  
  // Assignment
  assignedToId: integer('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),
  checkedById: integer('checked_by_id').references(() => users.id, { onDelete: 'set null' }),
  approvedById: integer('approved_by_id').references(() => users.id, { onDelete: 'set null' }),
  
  // Timeline
  dueDate: date('due_date'),
  approvedDate: date('approved_date'),
  issuedDate: date('issued_date'),
  
  // Client Approval
  clientApprovalRequired: boolean('client_approval_required').default(false),
  clientApprovedDate: date('client_approved_date'),
  clientApprovedBy: text('client_approved_by'),
  
  // References
  relatedDrawings: jsonb('related_drawings').default([]), // Array of drawing IDs
  supersededBy: integer('superseded_by').references(() => designDrawings.id),
  supersedes: integer('supersedes').references(() => designDrawings.id),
  
  // Audit Information
  createdBy: integer('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Drawing Versions table (for version control)
export const drawingVersions = pgTable('drawing_versions', {
  id: serial('id').primaryKey(),
  drawingId: integer('drawing_id').notNull().references(() => designDrawings.id, { onDelete: 'cascade' }),
  
  // Version Information
  version: integer('version').notNull(),
  revision: varchar('revision', { length: 10 }).notNull(),
  changeDescription: text('change_description'),
  
  // File Information
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileUrl: text('file_url').notNull(),
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size'),
  fileType: varchar('file_type', { length: 50 }),
  mimeType: varchar('mime_type', { length: 100 }),
  
  // Drawing Properties
  fileFormat: varchar('file_format', { length: 10 }).default('DWG'), // DWG, PDF, STEP, etc.
  isWorkingCopy: boolean('is_working_copy').default(false),
  isLatestVersion: boolean('is_latest_version').default(true),
  
  // Check-in/Check-out system
  isCheckedOut: boolean('is_checked_out').default(false),
  checkedOutBy: integer('checked_out_by').references(() => users.id, { onDelete: 'set null' }),
  checkedOutAt: timestamp('checked_out_at'),
  
  // Approval Status
  reviewStatus: varchar('review_status', { length: 50 }).default('Pending'),
  
  // Audit Information
  createdBy: integer('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Design Reviews table
export const designReviews = pgTable('design_reviews', {
  id: serial('id').primaryKey(),
  drawingId: integer('drawing_id').notNull().references(() => designDrawings.id, { onDelete: 'cascade' }),
  versionId: integer('version_id').notNull().references(() => drawingVersions.id, { onDelete: 'cascade' }),
  
  // Review Information
  reviewType: varchar('review_type', { length: 50 }).notNull(), // Internal, Client, Third Party
  reviewStage: varchar('review_stage', { length: 50 }), // Preliminary, Detailed, Final
  reviewTitle: varchar('review_title', { length: 255 }),
  
  // Review Assignment
  reviewerId: integer('reviewer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  reviewerRole: varchar('reviewer_role', { length: 50 }), // Designer, Checker, Approver, Client
  
  // Review Status
  status: varchar('status', { length: 50 }).notNull().default('Pending'),
  priority: varchar('priority', { length: 20 }).default('Medium'),
  
  // Review Details
  reviewComments: text('review_comments'),
  markupFileUrl: text('markup_file_url'), // Marked up drawing
  
  // Timeline
  requestedDate: timestamp('requested_date').notNull().defaultNow(),
  dueDate: date('due_date'),
  startedDate: timestamp('started_date'),
  completedDate: timestamp('completed_date'),
  
  // Review Decision
  recommendation: varchar('recommendation', { length: 50 }), // Approve, Reject, Approve with Comments
  
  // Audit Information
  createdBy: integer('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Review Comments table (detailed feedback)
export const reviewComments = pgTable('review_comments', {
  id: serial('id').primaryKey(),
  reviewId: integer('review_id').notNull().references(() => designReviews.id, { onDelete: 'cascade' }),
  
  // Comment Details
  commentNumber: integer('comment_number').notNull(),
  commentType: varchar('comment_type', { length: 50 }).default('General'), // General, Critical, Minor, Suggestion
  discipline: varchar('discipline', { length: 50 }),
  
  // Comment Content
  comment: text('comment').notNull(),
  location: varchar('location', { length: 255 }), // Drawing coordinate or description
  category: varchar('category', { length: 100 }), // Design, Code Compliance, etc.
  
  // Response and Resolution
  designerResponse: text('designer_response'),
  resolutionAction: text('resolution_action'),
  resolutionStatus: varchar('resolution_status', { length: 50 }).default('Open'), // Open, Closed, Verified
  
  // Timeline
  raisedDate: timestamp('raised_date').notNull().defaultNow(),
  targetResolutionDate: date('target_resolution_date'),
  resolvedDate: timestamp('resolved_date'),
  verifiedDate: timestamp('verified_date'),
  
  // Assignment
  assignedToId: integer('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),
  verifiedById: integer('verified_by_id').references(() => users.id, { onDelete: 'set null' }),
  
  // Audit Information
  createdBy: integer('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Design Standards table
export const designStandards = pgTable('design_standards', {
  id: serial('id').primaryKey(),
  
  // Standard Information
  standardNumber: varchar('standard_number', { length: 100 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  category: varchar('category', { length: 100 }).notNull(), // Templates, Symbols, Specifications, Guidelines
  discipline: varchar('discipline', { length: 50 }), // Mechanical, Electrical, Civil, etc.
  
  // Content
  description: text('description'),
  content: text('content'), // For text-based standards
  
  // File Attachments
  fileUrl: text('file_url'),
  filePath: text('file_path'),
  fileName: varchar('file_name', { length: 255 }),
  fileSize: integer('file_size'),
  fileType: varchar('file_type', { length: 50 }),
  
  // Version Control
  version: varchar('version', { length: 50 }).notNull(),
  revision: varchar('revision', { length: 10 }).default('A'),
  effectiveDate: date('effective_date'),
  supersededDate: date('superseded_date'),
  
  // Usage and Access
  isActive: boolean('is_active').default(true),
  accessLevel: varchar('access_level', { length: 50 }).default('Internal'), // Internal, Client, Public
  usageGuidelines: text('usage_guidelines'),
  
  // References
  relatedStandards: jsonb('related_standards').default([]), // Array of standard IDs
  
  // Audit Information
  createdBy: integer('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Drawing Transmittals table (for client/external submissions)
export const drawingTransmittals = pgTable('drawing_transmittals', {
  id: serial('id').primaryKey(),
  designProjectId: integer('design_project_id').notNull().references(() => designProjects.id, { onDelete: 'cascade' }),
  
  // Transmittal Information
  transmittalNumber: varchar('transmittal_number', { length: 100 }).notNull().unique(),
  transmittalTitle: varchar('transmittal_title', { length: 255 }).notNull(),
  purpose: varchar('purpose', { length: 100 }), // For Approval, For Information, For Construction
  
  // Recipient Information
  recipientOrganization: varchar('recipient_organization', { length: 255 }).notNull(),
  recipientContact: varchar('recipient_contact', { length: 255 }),
  recipientEmail: varchar('recipient_email', { length: 255 }),
  
  // Drawings Included
  drawingIds: jsonb('drawing_ids').notNull(), // Array of drawing IDs
  totalDrawings: integer('total_drawings').notNull(),
  
  // Status and Timeline
  status: varchar('status', { length: 50 }).default('Draft'), // Draft, Sent, Acknowledged, Approved
  sentDate: timestamp('sent_date'),
  acknowledgedDate: timestamp('acknowledged_date'),
  responseDate: timestamp('response_date'),
  dueDate: date('due_date'),
  
  // Content
  coverLetter: text('cover_letter'),
  specialInstructions: text('special_instructions'),
  
  // Response Tracking
  clientComments: text('client_comments'),
  responseDocumentUrl: text('response_document_url'),
  
  // Audit Information
  createdBy: integer('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Design Assignments table (for task management)
export const designAssignments = pgTable('design_assignments', {
  id: serial('id').primaryKey(),
  designProjectId: integer('design_project_id').notNull().references(() => designProjects.id, { onDelete: 'cascade' }),
  drawingId: integer('drawing_id').references(() => designDrawings.id, { onDelete: 'cascade' }),
  
  // Assignment Details
  taskTitle: varchar('task_title', { length: 255 }).notNull(),
  taskDescription: text('task_description'),
  taskType: varchar('task_type', { length: 50 }).notNull(), // Design, Review, Approval, Checking
  
  // Assignment
  assignedToId: integer('assigned_to_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  assignedById: integer('assigned_by_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  
  // Status and Priority
  status: varchar('status', { length: 50 }).default('Assigned'), // Assigned, In Progress, Completed, On Hold
  priority: varchar('priority', { length: 20 }).default('Medium'),
  
  // Timeline
  assignedDate: timestamp('assigned_date').notNull().defaultNow(),
  dueDate: date('due_date'),
  startedDate: timestamp('started_date'),
  completedDate: timestamp('completed_date'),
  
  // Work Tracking
  estimatedHours: decimal('estimated_hours', { precision: 5, scale: 2 }),
  actualHours: decimal('actual_hours', { precision: 5, scale: 2 }),
  progressPercentage: integer('progress_percentage').default(0),
  
  // Comments and Notes
  assignmentNotes: text('assignment_notes'),
  completionNotes: text('completion_notes'),
  
  // Audit Information
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Design Basic Drawings table
export const designBasicDrawings = pgTable('design_basic_drawings', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  
  // Drawing Classification
  discipline: varchar('discipline', { length: 100 }).notNull(), // Process Engineering, Mechanical & Piping, etc.
  drawingType: varchar('drawing_type', { length: 255 }).notNull(), // PFD, P&ID, Piping GA, etc.
  
  // File Details
  fileName: varchar('file_name', { length: 255 }).notNull(),
  originalFileName: varchar('original_file_name', { length: 255 }),
  revision: varchar('revision', { length: 50 }).default('R1'),
  description: text('description'),
  
  // Storage Information
  filePath: text('file_path').notNull(),
  fileUrl: text('file_url'),
  fileSize: integer('file_size'),
  fileType: varchar('file_type', { length: 50 }),
  
  // Revision Control
  status: varchar('status', { length: 50 }).notNull().default('current'), // current, superseded, archived
  isRevision: boolean('is_revision').notNull().default(false),
  revisionOf: integer('revision_of').references(() => designBasicDrawings.id, { onDelete: 'set null' }),
  revisionReason: text('revision_reason'),
  supersededAt: timestamp('superseded_at'),
  supersededBy: integer('superseded_by').references(() => users.id, { onDelete: 'set null' }),
  
  // Upload Information
  uploadedBy: integer('uploaded_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  uploadedAt: timestamp('uploaded_at').notNull().defaultNow(),
});

// Define relationships for Design Module
export const designProjectsRelations = relations(designProjects, ({ one, many }) => ({
  project: one(projects, {
    fields: [designProjects.projectId],
    references: [projects.id],
  }),
  designManager: one(users, {
    fields: [designProjects.designManagerId],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [designProjects.createdBy],
    references: [users.id],
  }),
  drawings: many(designDrawings),
  transmittals: many(drawingTransmittals),
  assignments: many(designAssignments),
}));

export const designDrawingsRelations = relations(designDrawings, ({ one, many }) => ({
  designProject: one(designProjects, {
    fields: [designDrawings.designProjectId],
    references: [designProjects.id],
  }),
  assignedTo: one(users, {
    fields: [designDrawings.assignedToId],
    references: [users.id],
  }),
  checkedBy: one(users, {
    fields: [designDrawings.checkedById],
    references: [users.id],
  }),
  approvedBy: one(users, {
    fields: [designDrawings.approvedById],
    references: [users.id],
  }),
  supersededByDrawing: one(designDrawings, {
    fields: [designDrawings.supersededBy],
    references: [designDrawings.id],
  }),
  supersedesDrawing: one(designDrawings, {
    fields: [designDrawings.supersedes],
    references: [designDrawings.id],
  }),
  creator: one(users, {
    fields: [designDrawings.createdBy],
    references: [users.id],
  }),
  versions: many(drawingVersions),
  reviews: many(designReviews),
}));

export const drawingVersionsRelations = relations(drawingVersions, ({ one, many }) => ({
  drawing: one(designDrawings, {
    fields: [drawingVersions.drawingId],
    references: [designDrawings.id],
  }),
  checkedOutBy: one(users, {
    fields: [drawingVersions.checkedOutBy],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [drawingVersions.createdBy],
    references: [users.id],
  }),
  reviews: many(designReviews),
}));

export const designReviewsRelations = relations(designReviews, ({ one, many }) => ({
  drawing: one(designDrawings, {
    fields: [designReviews.drawingId],
    references: [designDrawings.id],
  }),
  version: one(drawingVersions, {
    fields: [designReviews.versionId],
    references: [drawingVersions.id],
  }),
  reviewer: one(users, {
    fields: [designReviews.reviewerId],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [designReviews.createdBy],
    references: [users.id],
  }),
  comments: many(reviewComments),
}));

export const reviewCommentsRelations = relations(reviewComments, ({ one }) => ({
  review: one(designReviews, {
    fields: [reviewComments.reviewId],
    references: [designReviews.id],
  }),
  assignedTo: one(users, {
    fields: [reviewComments.assignedToId],
    references: [users.id],
  }),
  verifiedBy: one(users, {
    fields: [reviewComments.verifiedById],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [reviewComments.createdBy],
    references: [users.id],
  }),
}));

export const designStandardsRelations = relations(designStandards, ({ one }) => ({
  creator: one(users, {
    fields: [designStandards.createdBy],
    references: [users.id],
  }),
}));

export const drawingTransmittalsRelations = relations(drawingTransmittals, ({ one }) => ({
  designProject: one(designProjects, {
    fields: [drawingTransmittals.designProjectId],
    references: [designProjects.id],
  }),
  creator: one(users, {
    fields: [drawingTransmittals.createdBy],
    references: [users.id],
  }),
}));

export const designAssignmentsRelations = relations(designAssignments, ({ one }) => ({
  designProject: one(designProjects, {
    fields: [designAssignments.designProjectId],
    references: [designProjects.id],
  }),
  drawing: one(designDrawings, {
    fields: [designAssignments.drawingId],
    references: [designDrawings.id],
  }),
  assignedTo: one(users, {
    fields: [designAssignments.assignedToId],
    references: [users.id],
  }),
  assignedBy: one(users, {
    fields: [designAssignments.assignedById],
    references: [users.id],
  }),
}));

export const designBasicDrawingsRelations = relations(designBasicDrawings, ({ one }) => ({
  project: one(projects, {
    fields: [designBasicDrawings.projectId],
    references: [projects.id],
  }),
  uploadedByUser: one(users, {
    fields: [designBasicDrawings.uploadedBy],
    references: [users.id],
  }),
}));

// Create Zod schemas for data validation
export const insertDesignProjectSchema = createInsertSchema(designProjects)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    designPhase: z.enum(['Conceptual', 'Preliminary', 'Detailed', 'Final', 'As-Built']),
    status: z.enum(['Draft', 'In Progress', 'Under Review', 'Approved', 'On Hold', 'Cancelled', 'Completed']),
    startDate: z.string().optional().transform(dateStringToDate),
    targetEndDate: z.string().optional().transform(dateStringToDate),
    actualEndDate: z.string().optional().transform(dateStringToDate),
    teamMembers: z.array(z.number()).default([]),
    overallProgress: z.number().min(0).max(100).default(0),
  });

export const insertDesignDrawingSchema = createInsertSchema(designDrawings)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    category: z.enum(['P&ID', 'Equipment Layout', 'Piping Isometric', 'Electrical', 'Civil', 'Instrumentation', '3D Model', 'General Arrangement', 'Assembly Drawing', 'Detail Drawing']),
    status: z.enum(['Draft', 'Under Review', 'Approved', 'Issued for Construction', 'As-Built', 'Superseded', 'Cancelled']),
    dueDate: z.string().optional().transform(dateStringToDate),
    approvedDate: z.string().optional().transform(dateStringToDate),
    issuedDate: z.string().optional().transform(dateStringToDate),
    clientApprovedDate: z.string().optional().transform(dateStringToDate),
    relatedDrawings: z.array(z.number()).default([]),
  });

export const insertDrawingVersionSchema = createInsertSchema(drawingVersions)
  .omit({ id: true, createdAt: true })
  .extend({
    reviewStatus: z.enum(['Pending', 'In Progress', 'Approved', 'Rejected', 'Approved with Comments']),
  });

export const insertDesignReviewSchema = createInsertSchema(designReviews)
  .omit({ id: true, createdAt: true, updatedAt: true, requestedDate: true })
  .extend({
    status: z.enum(['Pending', 'In Progress', 'Approved', 'Rejected', 'Approved with Comments']),
    dueDate: z.string().optional().transform(dateStringToDate),
    recommendation: z.enum(['Approve', 'Reject', 'Approve with Comments']).optional(),
  });

export const insertReviewCommentSchema = createInsertSchema(reviewComments)
  .omit({ id: true, createdAt: true, updatedAt: true, raisedDate: true })
  .extend({
    resolutionStatus: z.enum(['Open', 'Closed', 'Verified']),
    targetResolutionDate: z.string().optional().transform(dateStringToDate),
  });

export const insertDesignStandardSchema = createInsertSchema(designStandards)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    effectiveDate: z.string().optional().transform(dateStringToDate),
    supersededDate: z.string().optional().transform(dateStringToDate),
    relatedStandards: z.array(z.number()).default([]),
  });

export const insertDrawingTransmittalSchema = createInsertSchema(drawingTransmittals)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    drawingIds: z.array(z.number()).min(1, "At least one drawing must be included"),
    dueDate: z.string().optional().transform(dateStringToDate),
  });

export const insertDesignAssignmentSchema = createInsertSchema(designAssignments)
  .omit({ id: true, createdAt: true, updatedAt: true, assignedDate: true })
  .extend({
    status: z.enum(['Assigned', 'In Progress', 'Completed', 'On Hold']),
    dueDate: z.string().optional().transform(dateStringToDate),
    progressPercentage: z.number().min(0).max(100).default(0),
  });

export const insertDesignBasicDrawingSchema = createInsertSchema(designBasicDrawings)
  .omit({ id: true, uploadedAt: true })
  .extend({
    discipline: z.string().min(1, "Discipline is required"),
    drawingType: z.string().min(1, "Drawing type is required"),
    fileName: z.string().min(1, "File name is required"),
    version: z.string().default('v1.0'),
  });

// Export types for Design Module
export type DesignProject = typeof designProjects.$inferSelect;
export type InsertDesignProject = z.infer<typeof insertDesignProjectSchema>;

export type DesignDrawing = typeof designDrawings.$inferSelect;
export type InsertDesignDrawing = z.infer<typeof insertDesignDrawingSchema>;

export type DrawingVersion = typeof drawingVersions.$inferSelect;
export type InsertDrawingVersion = z.infer<typeof insertDrawingVersionSchema>;

export type DesignReview = typeof designReviews.$inferSelect;
export type InsertDesignReview = z.infer<typeof insertDesignReviewSchema>;

export type ReviewComment = typeof reviewComments.$inferSelect;
export type InsertReviewComment = z.infer<typeof insertReviewCommentSchema>;

export type DesignStandard = typeof designStandards.$inferSelect;
export type InsertDesignStandard = z.infer<typeof insertDesignStandardSchema>;

export type DrawingTransmittal = typeof drawingTransmittals.$inferSelect;
export type InsertDrawingTransmittal = z.infer<typeof insertDrawingTransmittalSchema>;

export type DesignAssignment = typeof designAssignments.$inferSelect;
export type InsertDesignAssignment = z.infer<typeof insertDesignAssignmentSchema>;

export type DesignBasicDrawing = typeof designBasicDrawings.$inferSelect;
export type InsertDesignBasicDrawing = z.infer<typeof insertDesignBasicDrawingSchema>;

// ============================================================================
// USER INTELLIGENCE & BUSINESS ANALYTICS TABLES
// ============================================================================

// User activity tracking table
export const userActivityLogs = pgTable("user_activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  module: varchar("module", { length: 50 }).notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  resourceType: varchar("resource_type", { length: 50 }),
  resourceId: varchar("resource_id", { length: 50 }),
  ipAddress: varchar("ip_address", { length: 45 }), // Support both IPv4 and IPv6
  userAgent: text("user_agent"),
  sessionDuration: integer("session_duration").default(0), // in minutes
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Module usage statistics (daily aggregated data)
export const userModuleStats = pgTable("user_module_stats", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  module: varchar("module", { length: 50 }).notNull(),
  date: date("date").notNull(),
  timeSpent: integer("time_spent").default(0), // in minutes
  actionsCount: integer("actions_count").default(0),
  documentsCreated: integer("documents_created").default(0),
  documentsModified: integer("documents_modified").default(0),
  lastActivity: timestamp("last_activity"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Compliance tracking for various compliance requirements
export const userComplianceMetrics = pgTable("user_compliance_metrics", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  complianceType: varchar("compliance_type", { length: 50 }).notNull(), // password_policy, training, certification, etc.
  status: varchar("status", { length: 20 }).notNull(), // compliant, non_compliant, pending, expired
  dueDate: date("due_date"),
  completedDate: date("completed_date"),
  score: decimal("score", { precision: 5, scale: 2 }), // compliance score 0-100
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User productivity metrics
export const userProductivityMetrics = pgTable("user_productivity_metrics", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  date: date("date").notNull(),
  tasksCompleted: integer("tasks_completed").default(0),
  inspectionsProcessed: integer("inspections_processed").default(0),
  documentsGenerated: integer("documents_generated").default(0),
  qualityRecordsCreated: integer("quality_records_created").default(0),
  financialTransactions: integer("financial_transactions").default(0),
  attendanceScore: decimal("attendance_score", { precision: 5, scale: 2 }).default("0"), // percentage
  efficiencyScore: decimal("efficiency_score", { precision: 5, scale: 2 }).default("0"), // calculated score
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Two-Factor Authentication Audit Log
export const twoFactorAuditLog = pgTable("two_factor_audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata").default('{}'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schemas for Business Intelligence tables
export const insertUserActivityLogSchema = createInsertSchema(userActivityLogs)
  .omit({ id: true, createdAt: true });

export const insertUserModuleStatsSchema = createInsertSchema(userModuleStats)
  .omit({ id: true, createdAt: true, updatedAt: true });

export const insertUserComplianceMetricsSchema = createInsertSchema(userComplianceMetrics)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    status: z.enum(['compliant', 'non_compliant', 'pending', 'expired']),
    dueDate: z.string().optional().transform(dateStringToDate),
    completedDate: z.string().optional().transform(dateStringToDate),
  });

export const insertUserProductivityMetricsSchema = createInsertSchema(userProductivityMetrics)
  .omit({ id: true, createdAt: true, updatedAt: true });

// Export types for Business Intelligence
export type UserActivityLog = typeof userActivityLogs.$inferSelect;
export type InsertUserActivityLog = z.infer<typeof insertUserActivityLogSchema>;

export type UserModuleStats = typeof userModuleStats.$inferSelect;
export type InsertUserModuleStats = z.infer<typeof insertUserModuleStatsSchema>;

export type UserComplianceMetrics = typeof userComplianceMetrics.$inferSelect;
export type InsertUserComplianceMetrics = z.infer<typeof insertUserComplianceMetricsSchema>;

export type UserProductivityMetrics = typeof userProductivityMetrics.$inferSelect;
export type InsertUserProductivityMetrics = z.infer<typeof insertUserProductivityMetricsSchema>;

// ==================== LLM PROMPT ENGINE ====================

// LLM Prompts table
export const llmPrompts = pgTable('llm_prompts_registry', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),  
  description: text('description'),
  template: text('template').notNull(),
  category: varchar('category', { length: 100 }).notNull(),
  model: varchar('model', { length: 50 }).default('gpt-4o'),
  frequency: varchar('frequency', { length: 20 }).default('daily'),
  active: boolean('active').default(true),
  version: integer('version').default(1),
  priority: integer('priority').default(5),
  temperature: numeric('temperature', { precision: 3, scale: 2 }).default('0.70'),
  dataQuery: text('data_query'),
  dataParameters: jsonb('data_parameters'),
  outputFormat: varchar('output_format', { length: 50 }).default('markdown'),
  preferredModel: varchar('preferred_model', { length: 100 }),
  maskingRules: jsonb('masking_rules'),
  isSensitive: boolean('is_sensitive').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
});

// LLM Logs audit table for comprehensive logging
export const llmLogs = pgTable('llm_logs', {
  id: serial('id').primaryKey(),
  promptId: integer('prompt_id').notNull().references(() => llmPrompts.id),
  userId: integer('user_id').notNull().references(() => users.id),
  model: varchar('model', { length: 100 }).notNull(),
  executionTimestamp: timestamp('execution_timestamp').defaultNow().notNull(),
  maskedInput: text('masked_input'),
  llmResponse: text('llm_response'),
  executionStatus: varchar('execution_status', { length: 50 }).notNull(),
  executionTimeMs: integer('execution_time_ms'),
  tokenUsageInput: integer('token_usage_input'),
  tokenUsageOutput: integer('token_usage_output'),
  costUsd: decimal('cost_usd', { precision: 10, scale: 6 }),
  errorMessage: text('error_message'),
  isTestMode: boolean('is_test_mode').default(false),
  routingReason: varchar('routing_reason', { length: 200 }),
  originalModelRequest: varchar('original_model_request', { length: 100 }),
  fallbackUsed: boolean('fallback_used').default(false),
  maskingRulesApplied: jsonb('masking_rules_applied'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// LLM Prompt Engine Relations
export const llmPromptsRelations = relations(llmPrompts, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [llmPrompts.createdBy],
    references: [users.id],
  }),
  updatedByUser: one(users, {
    fields: [llmPrompts.updatedBy],
    references: [users.id],
  }),
  logs: many(llmLogs),
}));

export const llmLogsRelations = relations(llmLogs, ({ one }) => ({
  prompt: one(llmPrompts, {
    fields: [llmLogs.promptId],
    references: [llmPrompts.id],
  }),
  user: one(users, {
    fields: [llmLogs.userId],
    references: [users.id],
  }),
}));

// LLM Prompt Engine Zod Schemas
export const insertLlmPromptSchema = createInsertSchema(llmPrompts)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    description: z.string().optional(),
    dataQuery: z.string().optional(),
    dataParameters: z.any().optional(),
    preferredModel: z.string().optional(),
    maskingRules: z.any().optional(),
    createdBy: z.number().optional(),
    updatedBy: z.number().optional(),
  });

export const insertLlmLogSchema = createInsertSchema(llmLogs)
  .omit({ id: true, createdAt: true })
  .extend({
    maskedInput: z.string().optional(),
    llmResponse: z.string().optional(),
    executionTimeMs: z.number().optional(),
    tokenUsageInput: z.number().optional(),
    tokenUsageOutput: z.number().optional(),
    costUsd: z.string().optional(),
    errorMessage: z.string().optional(),
    routingReason: z.string().optional(),
    originalModelRequest: z.string().optional(),
    maskingRulesApplied: z.any().optional(),
  });

// LLM Types
export type LlmPrompt = typeof llmPrompts.$inferSelect;
export type InsertLlmPrompt = z.infer<typeof insertLlmPromptSchema>;
export type LlmLog = typeof llmLogs.$inferSelect;
export type InsertLlmLog = z.infer<typeof insertLlmLogSchema>;

// ==================== PRODUCT DATABASE ====================

export const productAttributeOptions = pgTable('product_attribute_options', {
  id: serial('id').primaryKey(),
  attributeType: text('attribute_type').notNull(),
  code: text('code').notNull(),
  label: text('label').notNull(),
  tag: text('tag').notNull(),
  parentId: integer('parent_id'),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ([
  // FK: parent_id → id in same table, RESTRICT prevents deleting a parent that has children
  foreignKey({
    columns: [table.parentId],
    foreignColumns: [table.id],
    name: 'fk_attr_option_parent',
  }).onDelete('restrict'),
  // UNIQUE scoped to hierarchy: item_family rows (parent_id IS NULL)
  uniqueIndex('uq_attr_type_null_parent_code')
    .on(table.attributeType, table.code)
    .where(sql`parent_id IS NULL`),
  // UNIQUE scoped to hierarchy: property_1 / property_2 rows (parent_id IS NOT NULL)
  uniqueIndex('uq_attr_type_parent_code')
    .on(table.attributeType, table.parentId, table.code)
    .where(sql`parent_id IS NOT NULL`),
  // CHECK: only allowed attribute types
  check('chk_attr_option_type', sql`attribute_type IN ('item_family', 'property_1', 'property_2')`),
]));

export const insertProductAttributeOptionSchema = createInsertSchema(productAttributeOptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ProductAttributeOption = typeof productAttributeOptions.$inferSelect;
export type InsertProductAttributeOption = z.infer<typeof insertProductAttributeOptionSchema>;

// Audit log for label changes on attribute options
export const attributeOptionAuditLog = pgTable('attribute_option_audit_log', {
  id: serial('id').primaryKey(),
  optionId: integer('option_id').notNull().references(() => productAttributeOptions.id, { onDelete: 'restrict' }),
  oldLabel: text('old_label').notNull(),
  newLabel: text('new_label').notNull(),
  oldTag: text('old_tag'),
  newTag: text('new_tag'),
  changedBy: integer('changed_by').references(() => users.id),
  changedAt: timestamp('changed_at').defaultNow(),
});

export const insertAttributeOptionAuditLogSchema = createInsertSchema(attributeOptionAuditLog).omit({
  id: true,
  changedAt: true,
});

export type AttributeOptionAuditLog = typeof attributeOptionAuditLog.$inferSelect;
export type InsertAttributeOptionAuditLog = z.infer<typeof insertAttributeOptionAuditLogSchema>;

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  itemFamily: text('item_family').notNull(),
  itemFamilyLabel: text('item_family_label').notNull(),
  itemProperty1: text('item_property_1').notNull(),
  itemProperty1Label: text('item_property_1_label').notNull(),
  itemProperty2: text('item_property_2').notNull(),
  itemProperty2Label: text('item_property_2_label').notNull(),
  itemProperty3: text('item_property_3').notNull(),
  parentId: integer('parent_id'),
  productCode: text('product_code').notNull().unique(),
  description: text('description').notNull(),
  unit: text('unit').notNull(),
  unitPrice: numeric('unit_price', { precision: 15, scale: 2 }).notNull(),
  currency: text('currency').default('USD').notNull(),
  category: text('category'),
  hsnSacCode: text('hsn_sac_code'),
  makeOrBuy: text('make_or_buy').default('Make'),
  preferredVendor: text('preferred_vendor'),
  isActive: boolean('is_active').default(true),
  isGrandparent: boolean('is_grandparent').default(false),
  tagNo: text('tag_no'),
  equipmentConfiguration: text('equipment_configuration').default('Vessel'),
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export const productChildren = pgTable('product_children', {
  id: serial('id').primaryKey(),
  parentProductId: integer('parent_product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  childProductId: integer('child_product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  quantity: integer('quantity').notNull().default(1),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertProductChildSchema = createInsertSchema(productChildren).omit({
  id: true,
  createdAt: true,
});

export type ProductChild = typeof productChildren.$inferSelect;
export type InsertProductChild = z.infer<typeof insertProductChildSchema>;

// ==================== OFFER TEMPLATES ====================

export const offerTemplates = pgTable('offer_templates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  subject: text('subject').notNull(),
  description: text('description'),
  filePath: text('file_path').notNull(),
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size'),
  position: text('position').default('after').notNull(),
  language: text('language').default('English').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  startPage: integer('start_page'),
  endPage: integer('end_page'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  gcsObjectPath: text('gcs_object_path'),
  gcsBucket: text('gcs_bucket'),
  checksumSha256: text('checksum_sha256'),
  versionSeq: integer('version_seq').default(1).notNull(),
  currentLabel: text('current_label'),
  mirrorStatus: varchar('mirror_status', { length: 20 }).default('pending').notNull(),
  mirrorJobId: integer('mirror_job_id'),
});

export const insertOfferTemplateSchema = createInsertSchema(offerTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type OfferTemplate = typeof offerTemplates.$inferSelect;
export type InsertOfferTemplate = z.infer<typeof insertOfferTemplateSchema>;

// ==================== OFFER TEMPLATE REVISIONS ====================

export const offerTemplateRevisions = pgTable('offer_template_revisions', {
  id: serial('id').primaryKey(),
  templateId: integer('template_id').notNull().references(() => offerTemplates.id, { onDelete: 'cascade' }),
  versionSeq: integer('version_seq').notNull(),
  gcsObjectPath: text('gcs_object_path'),
  gcsBucket: text('gcs_bucket'),
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size'),
  checksumSha256: text('checksum_sha256'),
  label: text('label'),
  uploadedBy: integer('uploaded_by').references(() => users.id),
  uploadedAt: timestamp('uploaded_at').defaultNow(),
  status: text('status').default('superseded').notNull(),
  notes: text('notes'),
});

export type OfferTemplateRevision = typeof offerTemplateRevisions.$inferSelect;

// ==================== OFFER TEMPLATE AUDIT LOG ====================

export const offerTemplateAuditLog = pgTable('offer_template_audit_log', {
  id: serial('id').primaryKey(),
  templateId: integer('template_id').notNull().references(() => offerTemplates.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  performedBy: integer('performed_by').references(() => users.id),
  performedAt: timestamp('performed_at').defaultNow(),
  versionSeq: integer('version_seq'),
  meta: text('meta'),
});

export type OfferTemplateAuditEntry = typeof offerTemplateAuditLog.$inferSelect;

// ==================== OFFER SUBJECTS ====================

export const offerSubjectsTable = pgTable('offer_subjects', {
  id: serial('id').primaryKey(),
  subject: text('subject').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ==================== OFFERS / QUOTATIONS ====================

export const offers = pgTable('offers', {
  id: serial('id').primaryKey(),
  offerNumber: text('offer_number').notNull().unique(),
  customerId: integer('customer_id').references(() => customers.id),
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email'),
  customerAddress: text('customer_address'),
  contactPerson: text('contact_person'),
  subject: text('subject').notNull(),
  currency: text('currency').default('USD').notNull(),
  subtotal: numeric('subtotal', { precision: 15, scale: 2 }).default('0').notNull(),
  discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }).default('0'),
  discountAmount: numeric('discount_amount', { precision: 15, scale: 2 }).default('0'),
  taxPercent: numeric('tax_percent', { precision: 5, scale: 2 }).default('0'),
  taxAmount: numeric('tax_amount', { precision: 15, scale: 2 }).default('0'),
  totalAmount: numeric('total_amount', { precision: 15, scale: 2 }).default('0').notNull(),
  revision: integer('revision').default(0).notNull(),
  status: text('status').default('Draft').notNull(),
  validUntil: timestamp('valid_until'),
  paymentTerms: text('payment_terms'),
  deliveryTerms: text('delivery_terms'),
  notes: text('notes'),
  termsAndConditions: text('terms_and_conditions'),
  templatePdfPath: text('template_pdf_path'),
  templatePdfName: text('template_pdf_name'),
  templatePdfPosition: text('template_pdf_position').default('middle'),
  language: text('language').default('English'),
  createdBy: integer('created_by').references(() => users.id),
  approvedBy: integer('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  commercialChainId: uuid('commercial_chain_id').notNull().defaultRandom(),
  parentOfferId: integer('parent_offer_id'),
  rootOfferId: integer('root_offer_id'),

  // Test data flag — hides from normal views; only visible to Superuser with toggle
  isTest: boolean('is_test').default(false).notNull(),

  // Offer type: 'standalone' (Customer Order required) | 'project-linked' (Sales Contract required)
  offerType: text('offer_type').default('standalone').notNull(),

  // Mandatory confirmation document — must be uploaded before Order Confirmed transition
  confirmationDocGcsPath: text('confirmation_doc_gcs_path'),
  confirmationDocFilename: text('confirmation_doc_filename'),

  // Locked final offer snapshot — immutable copy saved at offer-to-order conversion
  finalOfferGcsPath:      text('final_offer_gcs_path'),
  finalOfferMirrorStatus: varchar('final_offer_mirror_status', { length: 20 }),
  finalOfferMirrorJobId:  integer('final_offer_mirror_job_id'),

  // Commercial summary — OFFER-FREIGHT-001
  // offer_scope: server-derived from customers.country_code at save time ('DOMESTIC'|'EXPORT'|NULL=legacy)
  // freight_amount: accepted from client; freight_tax_amount + final_value: server-calculated
  offerScope:       varchar('offer_scope', { length: 10 }),
  freightAmount:    numeric('freight_amount',     { precision: 15, scale: 2 }).default('0').notNull(),
  freightTaxAmount: numeric('freight_tax_amount', { precision: 15, scale: 2 }).default('0').notNull(),
  finalValue:       numeric('final_value',        { precision: 15, scale: 2 }).default('0').notNull(),
});

export const insertOfferSchema = createInsertSchema(offers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Offer = typeof offers.$inferSelect;
export type InsertOffer = z.infer<typeof insertOfferSchema>;

export const offerItems = pgTable('offer_items', {
  id: serial('id').primaryKey(),
  offerId: integer('offer_id').notNull().references(() => offers.id, { onDelete: 'cascade' }),
  productId: integer('product_id').references(() => products.id),
  productCode: text('product_code'),
  description: text('description').notNull(),
  unit: text('unit').notNull(),
  quantity: numeric('quantity', { precision: 15, scale: 3 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 15, scale: 2 }).notNull(),
  discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }).default('0'),
  totalPrice: numeric('total_price', { precision: 15, scale: 2 }).notNull(),
  hsnSacCode: text('hsn_sac_code'),
  isSubItem: boolean('is_sub_item').default(false),
  parentItemId: integer('parent_item_id'),
  sortOrder: integer('sort_order').default(0),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertOfferItemSchema = createInsertSchema(offerItems).omit({
  id: true,
  createdAt: true,
});

export type OfferItem = typeof offerItems.$inferSelect;
export type InsertOfferItem = z.infer<typeof insertOfferItemSchema>;

export const projectCommercialSnapshots = pgTable('project_commercial_snapshots', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  snapshotNumber: text('snapshot_number').notNull(),
  revision: integer('revision').notNull().default(1),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  sellingCurrency: varchar('selling_currency', { length: 10 }).notNull().default('USD'),
  exchangeRate: numeric('exchange_rate', { precision: 14, scale: 6 }).notNull(),
  totalCostInr: numeric('total_cost_inr', { precision: 15, scale: 2 }).notNull(),
  totalSellingInr: numeric('total_selling_inr', { precision: 15, scale: 2 }).notNull(),
  totalSellingForeign: numeric('total_selling_foreign', { precision: 15, scale: 2 }),
  incoterms: varchar('incoterms', { length: 20 }),
  paymentTerms: text('payment_terms'),
  deliveryTerms: text('delivery_terms'),
  offerValidityDays: integer('offer_validity_days').default(30),
  notes: text('notes'),
  itemsSnapshot: jsonb('items_snapshot').notNull().default([]),
  createdBy: integer('created_by').references(() => users.id),
  approvedBy: integer('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertProjectCommercialSnapshotSchema = createInsertSchema(projectCommercialSnapshots).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type ProjectCommercialSnapshot = typeof projectCommercialSnapshots.$inferSelect;
export type InsertProjectCommercialSnapshot = z.infer<typeof insertProjectCommercialSnapshotSchema>;

export const googleAdsTokens = pgTable('google_ads_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  tokenExpiry: timestamp('token_expiry'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const googleAdsAccounts = pgTable('google_ads_accounts', {
  id: serial('id').primaryKey(),
  customerId: text('customer_id').notNull(),
  descriptiveName: text('descriptive_name'),
  currencyCode: text('currency_code'),
  timeZone: text('time_zone'),
  isManager: boolean('is_manager').default(false),
  isActive: boolean('is_active').default(true),
  linkedAt: timestamp('linked_at').defaultNow(),
});

export const gadsCampaigns = pgTable('gads_campaigns', {
  id: serial('id').primaryKey(),
  googleCampaignId: text('google_campaign_id').notNull().unique(),
  accountId: integer('account_id').references(() => googleAdsAccounts.id),
  name: text('name').notNull(),
  status: text('status').notNull(),
  advertisingChannelType: text('advertising_channel_type'),
  budgetAmountMicros: numeric('budget_amount_micros', { precision: 20, scale: 0 }),
  budgetType: text('budget_type'),
  budgetResourceName: text('budget_resource_name'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  syncedAt: timestamp('synced_at').defaultNow(),
});

export const gadsAdGroups = pgTable('gads_ad_groups', {
  id: serial('id').primaryKey(),
  googleAdGroupId: text('google_ad_group_id').notNull().unique(),
  campaignId: text('campaign_id').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  type: text('type'),
  cpcBidMicros: numeric('cpc_bid_micros', { precision: 20, scale: 0 }),
  syncedAt: timestamp('synced_at').defaultNow(),
});

export const gadsKeywords = pgTable('gads_keywords', {
  id: serial('id').primaryKey(),
  googleCriterionId: text('google_criterion_id').notNull().unique(),
  adGroupId: text('ad_group_id').notNull(),
  campaignId: text('campaign_id').notNull(),
  text: text('text').notNull(),
  matchType: text('match_type').notNull(),
  status: text('status').notNull(),
  qualityScore: integer('quality_score'),
  syncedAt: timestamp('synced_at').defaultNow(),
});

export const gadsDailyMetrics = pgTable('gads_daily_metrics', {
  id: serial('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  date: text('date').notNull(),
  impressions: integer('impressions').default(0),
  clicks: integer('clicks').default(0),
  costMicros: numeric('cost_micros', { precision: 20, scale: 0 }).default('0'),
  conversions: numeric('conversions', { precision: 15, scale: 2 }).default('0'),
  conversionValue: numeric('conversion_value', { precision: 15, scale: 2 }).default('0'),
  allConversions: numeric('all_conversions', { precision: 15, scale: 2 }).default('0'),
  syncedAt: timestamp('synced_at').defaultNow(),
});

export const gadsSearchTerms = pgTable('gads_search_terms', {
  id: serial('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  adGroupId: text('ad_group_id').notNull(),
  searchTerm: text('search_term').notNull(),
  impressions: integer('impressions').default(0),
  clicks: integer('clicks').default(0),
  costMicros: numeric('cost_micros', { precision: 20, scale: 0 }).default('0'),
  conversions: numeric('conversions', { precision: 15, scale: 2 }).default('0'),
  date: text('date').notNull(),
  syncedAt: timestamp('synced_at').defaultNow(),
});

export const gadsSyncJobs = pgTable('gads_sync_jobs', {
  id: serial('id').primaryKey(),
  jobType: text('job_type').notNull(),
  status: text('status').notNull().default('pending'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  error: text('error'),
  recordsSynced: integer('records_synced').default(0),
  lockKey: text('lock_key').unique(),
  lastRunAt: timestamp('last_run_at'),
});

export const gadsChangeLog = pgTable('gads_change_log', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  actionType: text('action_type').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  beforeValue: jsonb('before_value'),
  afterValue: jsonb('after_value'),
  createdAt: timestamp('created_at').defaultNow(),
});

export type GoogleAdsToken = typeof googleAdsTokens.$inferSelect;
export type GoogleAdsAccount = typeof googleAdsAccounts.$inferSelect;
export type GadsCampaign = typeof gadsCampaigns.$inferSelect;
export type GadsAdGroup = typeof gadsAdGroups.$inferSelect;
export type GadsKeyword = typeof gadsKeywords.$inferSelect;
export type GadsDailyMetric = typeof gadsDailyMetrics.$inferSelect;
export type GadsSearchTerm = typeof gadsSearchTerms.$inferSelect;
export type GadsSyncJob = typeof gadsSyncJobs.$inferSelect;
export type GadsChangeLog = typeof gadsChangeLog.$inferSelect;

// ============================================================
// MULTI-AGENT INTELLIGENCE & AUTOMATION LAYER
// ============================================================

export const agentRegistry = pgTable('agent_registry', {
  id: serial('id').primaryKey(),
  agentKey: text('agent_key').unique().notNull(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  category: text('category').notNull(),
  isEnabled: boolean('is_enabled').default(true),
  isSuspended: boolean('is_suspended').default(false),
  suspendedBy: integer('suspended_by').references(() => users.id),
  suspendedReason: text('suspended_reason'),
  suspendedAt: timestamp('suspended_at'),
  defaultSchedule: text('default_schedule'),
  config: jsonb('config').default({}),
  scopingRules: jsonb('scoping_rules').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const agentRuns = pgTable('agent_runs', {
  id: serial('id').primaryKey(),
  agentKey: text('agent_key').notNull(),
  triggerType: text('trigger_type').notNull(),
  triggerDetail: text('trigger_detail'),
  companyScope: text('company_scope'),
  locationScope: text('location_scope'),
  status: text('status').notNull().default('running'),
  startedAt: timestamp('started_at').defaultNow(),
  completedAt: timestamp('completed_at'),
  findingsCount: integer('findings_count').default(0),
  insightsCount: integer('insights_count').default(0),
  recommendationsCount: integer('recommendations_count').default(0),
  errorMessage: text('error_message'),
  executionMetadata: jsonb('execution_metadata').default({}),
});

export const agentFindings = pgTable('agent_findings', {
  id: serial('id').primaryKey(),
  runId: integer('run_id').notNull().references(() => agentRuns.id),
  agentKey: text('agent_key').notNull(),
  fingerprint: text('fingerprint').unique().notNull(),
  findingType: text('finding_type').notNull(),
  severity: text('severity').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  logicType: text('logic_type').notNull().default('rule_based'),
  dataSnapshot: jsonb('data_snapshot'),
  relatedEntityType: text('related_entity_type'),
  relatedEntityId: text('related_entity_id'),
  companyName: text('company_name'),
  location: text('location'),
  status: text('status').notNull().default('open'),
  assignedTo: integer('assigned_to').references(() => users.id),
  assignedBy: integer('assigned_by').references(() => users.id),
  assignedAt: timestamp('assigned_at'),
  snoozedUntil: timestamp('snoozed_until'),
  mutedReason: text('muted_reason'),
  dismissedBy: integer('dismissed_by').references(() => users.id),
  dismissedReason: text('dismissed_reason'),
  dismissedAt: timestamp('dismissed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const agentInsights = pgTable('agent_insights', {
  id: serial('id').primaryKey(),
  runId: integer('run_id').notNull().references(() => agentRuns.id),
  agentKey: text('agent_key').notNull(),
  findingIds: integer('finding_ids').array(),
  insightType: text('insight_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  logicType: text('logic_type').notNull().default('llm_generated'),
  dataSources: text('data_sources').array(),
  companyName: text('company_name'),
  scopePeriod: text('scope_period'),
  metadata: jsonb('metadata').default({}),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const agentRecommendations = pgTable('agent_recommendations', {
  id: serial('id').primaryKey(),
  findingId: integer('finding_id').references(() => agentFindings.id),
  insightId: integer('insight_id').references(() => agentInsights.id),
  agentKey: text('agent_key').notNull(),
  actionCategory: text('action_category').notNull(),
  actionType: text('action_type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  actionPayload: jsonb('action_payload').notNull(),
  logicType: text('logic_type').notNull(),
  confidence: numeric('confidence', { precision: 3, scale: 2 }),
  priority: text('priority').default('normal'),
  companyName: text('company_name'),
  status: text('status').notNull().default('pending_review'),
  requiresApproval: boolean('requires_approval').notNull().default(true),
  assignedTo: integer('assigned_to').references(() => users.id),
  approvedBy: integer('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  rejectionReason: text('rejection_reason'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const agentActions = pgTable('agent_actions', {
  id: serial('id').primaryKey(),
  recommendationId: integer('recommendation_id').notNull().references(() => agentRecommendations.id),
  agentKey: text('agent_key').notNull(),
  actionCategory: text('action_category').notNull(),
  actionType: text('action_type').notNull(),
  actionPayload: jsonb('action_payload').notNull(),
  idempotencyKey: text('idempotency_key').unique().notNull(),
  executionStatus: text('execution_status').notNull().default('pending'),
  resultMessage: text('result_message'),
  resultData: jsonb('result_data'),
  executedAt: timestamp('executed_at'),
  retryCount: integer('retry_count').default(0),
  maxRetries: integer('max_retries').default(3),
  nextRetryAt: timestamp('next_retry_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const agentPolicies = pgTable('agent_policies', {
  id: serial('id').primaryKey(),
  agentKey: text('agent_key').notNull(),
  actionCategory: text('action_category').notNull(),
  actionType: text('action_type').notNull(),
  approvalMode: text('approval_mode').notNull().default('require_approval'),
  allowedApproverRoles: text('allowed_approver_roles').array().default(['Superuser']),
  maxActionsPerDay: integer('max_actions_per_day').default(50),
  cooldownMinutes: integer('cooldown_minutes').default(30),
  isEnabled: boolean('is_enabled').default(true),
  companyScope: text('company_scope').default('ALL'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const agentSubscriptions = pgTable('agent_subscriptions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  agentKey: text('agent_key'),
  severityFilter: text('severity_filter').array().default(['critical', 'high']),
  findingTypes: text('finding_types').array(),
  channel: text('channel').notNull().default('dashboard'),
  isActive: boolean('is_active').default(true),
  companyScope: text('company_scope').default('ALL'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const agentEntityOverrides = pgTable('agent_entity_overrides', {
  id: serial('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  overrideType: text('override_type').notNull(),
  reason: text('reason'),
  createdBy: integer('created_by').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export const agentAuditLog = pgTable('agent_audit_log', {
  id: serial('id').primaryKey(),
  agentKey: text('agent_key'),
  eventType: text('event_type').notNull(),
  actorType: text('actor_type').notNull(),
  actorId: text('actor_id'),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  companyName: text('company_name'),
  details: jsonb('details').default({}),
  createdAt: timestamp('created_at').defaultNow(),
});

export type AgentRegistry = typeof agentRegistry.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type AgentFinding = typeof agentFindings.$inferSelect;
export type AgentInsight = typeof agentInsights.$inferSelect;
export type AgentRecommendation = typeof agentRecommendations.$inferSelect;
export type AgentAction = typeof agentActions.$inferSelect;
export type AgentPolicy = typeof agentPolicies.$inferSelect;
export type AgentSubscription = typeof agentSubscriptions.$inferSelect;
export type AgentEntityOverride = typeof agentEntityOverrides.$inferSelect;
export type AgentAuditLogEntry = typeof agentAuditLog.$inferSelect;

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  link: text('link'),
  isRead: boolean('is_read').notNull().default(false),
  priority: varchar('priority', { length: 20 }).notNull().default('medium'),
  category: varchar('category', { length: 50 }).notNull().default('general'),
  status: varchar('status', { length: 20 }).notNull().default('new'),
  sourceType: varchar('source_type', { length: 50 }),
  sourceId: integer('source_id'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export const attendanceRegularizations = pgTable('attendance_regularizations', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  attendanceRecordId: integer('attendance_record_id').references(() => attendanceRecords.id, { onDelete: 'set null' }),
  requestDate: date('request_date').notNull(),
  requestType: varchar('request_type', { length: 30 }).notNull(),
  correctedCheckIn: timestamp('corrected_check_in'),
  correctedCheckOut: timestamp('corrected_check_out'),
  reason: text('reason').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  approverId: integer('approver_id').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  approverRemarks: text('approver_remarks'),
  rejectedBy: integer('rejected_by').references(() => users.id),
  rejectedAt: timestamp('rejected_at'),
  rejectionReason: text('rejection_reason'),
  businessScenario: varchar('business_scenario', { length: 40 }),
  clCredited: boolean('cl_credited').default(false),
  appliedToAttendance: boolean('applied_to_attendance').default(false),
  originalData: jsonb('original_data'),
  auditTrail: jsonb('audit_trail'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertAttendanceRegularizationSchema = createInsertSchema(attendanceRegularizations)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAttendanceRegularization = z.infer<typeof insertAttendanceRegularizationSchema>;
export type AttendanceRegularization = typeof attendanceRegularizations.$inferSelect;

export const glAccountMappings = pgTable('gl_account_mappings', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').default(1),
  componentCode: varchar('component_code', { length: 50 }).notNull(),
  componentName: varchar('component_name', { length: 100 }).notNull(),
  category: varchar('category', { length: 30 }).notNull(),
  postingContext: varchar('posting_context', { length: 30 }).notNull(),
  glAccountCode: varchar('gl_account_code', { length: 30 }).notNull().default(''),
  sapAcctCode: varchar('sap_acct_code', { length: 30 }),
  glAccountName: varchar('gl_account_name', { length: 200 }),
  sapValidatedAt: timestamp('sap_validated_at'),
  debitCredit: varchar('debit_credit', { length: 10 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  uniqueComponentContext: uniqueIndex('gl_component_context_uniq').on(table.componentCode, table.postingContext, table.companyId),
}));

export const insertGlAccountMappingSchema = createInsertSchema(glAccountMappings).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGlAccountMapping = z.infer<typeof insertGlAccountMappingSchema>;
export type GlAccountMapping = typeof glAccountMappings.$inferSelect;

export const glPostingLog = pgTable('gl_posting_log', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').default(1),
  sourceModule: varchar('source_module', { length: 30 }).notNull(),
  sourceReferenceId: integer('source_reference_id'),
  payrollPeriodId: integer('payroll_period_id').references(() => payrollPeriods.id),
  postingType: varchar('posting_type', { length: 30 }).notNull(),
  totalDebit: decimal('total_debit', { precision: 12, scale: 2 }).notNull(),
  totalCredit: decimal('total_credit', { precision: 12, scale: 2 }).notNull(),
  sapJeNumber: varchar('sap_je_number', { length: 50 }),
  sapDocEntry: integer('sap_doc_entry'),
  postingStatus: varchar('posting_status', { length: 20 }).notNull().default('draft'),
  postedBy: integer('posted_by').references(() => users.id),
  postedAt: timestamp('posted_at'),
  errorMessage: text('error_message'),
  lineItems: jsonb('line_items'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertGlPostingLogSchema = createInsertSchema(glPostingLog).omit({ id: true, createdAt: true });
export type InsertGlPostingLog = z.infer<typeof insertGlPostingLogSchema>;
export type GlPostingLog = typeof glPostingLog.$inferSelect;

export const statutoryChallans = pgTable('statutory_challans', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').default(1),
  challanReference: varchar('challan_reference', { length: 50 }).notNull().unique(),
  moduleType: varchar('module_type', { length: 10 }).notNull(),
  payrollPeriodId: integer('payroll_period_id').references(() => payrollPeriods.id),
  month: integer('month').notNull(),
  year: integer('year').notNull(),
  financialYear: varchar('financial_year', { length: 10 }).notNull(),
  state: varchar('state', { length: 50 }),
  employeeCount: integer('employee_count').default(0),
  totalEmployeeContribution: decimal('total_employee_contribution', { precision: 12, scale: 2 }).notNull().default('0'),
  totalEmployerContribution: decimal('total_employer_contribution', { precision: 12, scale: 2 }).notNull().default('0'),
  adminCharges: decimal('admin_charges', { precision: 10, scale: 2 }).default('0'),
  interest: decimal('interest', { precision: 10, scale: 2 }).default('0'),
  penalty: decimal('penalty', { precision: 10, scale: 2 }).default('0'),
  totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  tdsSection: varchar('tds_section', { length: 10 }),
  tdsQuarter: varchar('tds_quarter', { length: 5 }),
  bsrCode: varchar('bsr_code', { length: 20 }),
  cinNumber: varchar('cin_number', { length: 50 }),
  establishmentCode: varchar('establishment_code', { length: 30 }),
  trrnNumber: varchar('trrn_number', { length: 50 }),
  employerEps: decimal('employer_eps', { precision: 12, scale: 2 }),
  ecrGenerated: boolean('ecr_generated').default(false),
  ecrFileKey: text('ecr_file_key'),
  esicEmployerCode: varchar('esic_employer_code', { length: 30 }),
  ptrcNumber: varchar('ptrc_number', { length: 30 }),
  grnNumber: varchar('grn_number', { length: 50 }),
  paymentDate: timestamp('payment_date'),
  paymentMode: varchar('payment_mode', { length: 20 }),
  paymentReference: varchar('payment_reference', { length: 100 }),
  bankName: varchar('bank_name', { length: 100 }),
  challanSerial: varchar('challan_serial', { length: 30 }),
  sapJeReference: varchar('sap_je_reference', { length: 50 }),
  sapDocEntry: integer('sap_doc_entry'),
  sapJeNumber: varchar('sap_je_number', { length: 50 }),
  sapBankAccountCode: varchar('sap_bank_account_code', { length: 50 }),
  sapPostingStatus: varchar('sap_posting_status', { length: 20 }).default('draft'),
  sapPostingError: text('sap_posting_error'),
  sapPostedAt: timestamp('sap_posted_at'),
  reversalSapDocEntry: integer('reversal_sap_doc_entry'),
  reversalSapJeNumber: varchar('reversal_sap_je_number', { length: 50 }),
  reversalSapPostedAt: timestamp('reversal_sap_posted_at'),
  reversedBy: integer('reversed_by'),
  reversedAt: timestamp('reversed_at'),
  glPostingId: integer('gl_posting_id'),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertStatutoryChallanSchema = createInsertSchema(statutoryChallans).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStatutoryChallan = z.infer<typeof insertStatutoryChallanSchema>;
export type StatutoryChallan = typeof statutoryChallans.$inferSelect;

export const statutoryChallanDetails = pgTable('statutory_challan_details', {
  id: serial('id').primaryKey(),
  challanId: integer('challan_id').notNull().references(() => statutoryChallans.id, { onDelete: 'cascade' }),
  employeeId: integer('employee_id').notNull().references(() => users.id),
  payrollRecordId: integer('payroll_record_id').references(() => payrollRecords.id),
  employeeContribution: decimal('employee_contribution', { precision: 10, scale: 2 }).default('0'),
  employerContribution: decimal('employer_contribution', { precision: 10, scale: 2 }).default('0'),
  grossSalary: decimal('gross_salary', { precision: 12, scale: 2 }).default('0'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertStatutoryChallanDetailSchema = createInsertSchema(statutoryChallanDetails).omit({ id: true, createdAt: true });
export type InsertStatutoryChallanDetail = z.infer<typeof insertStatutoryChallanDetailSchema>;
export type StatutoryChallanDetail = typeof statutoryChallanDetails.$inferSelect;

export const statutoryFilingStatus = pgTable('statutory_filing_status', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').default(1),
  moduleType: varchar('module_type', { length: 10 }).notNull(),
  financialYear: varchar('financial_year', { length: 10 }).notNull(),
  filingPeriod: varchar('filing_period', { length: 30 }).notNull(),
  formType: varchar('form_type', { length: 20 }),
  state: varchar('state', { length: 50 }),
  dueDate: timestamp('due_date'),
  filingDate: timestamp('filing_date'),
  acknowledgementNumber: varchar('acknowledgement_number', { length: 50 }),
  totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).default('0'),
  employeeCount: integer('employee_count').default(0),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  remarks: text('remarks'),
  filedBy: integer('filed_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  uniqueFiling: uniqueIndex('statutory_filing_uniq').on(table.moduleType, table.financialYear, table.filingPeriod, table.state, table.companyId),
}));

export const insertStatutoryFilingStatusSchema = createInsertSchema(statutoryFilingStatus).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStatutoryFilingStatus = z.infer<typeof insertStatutoryFilingStatusSchema>;
export type StatutoryFilingStatus = typeof statutoryFilingStatus.$inferSelect;

export const ptStateConfig = pgTable('pt_state_config', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').default(1),
  state: varchar('state', { length: 50 }).notNull(),
  ptrcNumber: varchar('ptrc_number', { length: 30 }),
  filingFrequency: varchar('filing_frequency', { length: 20 }).notNull().default('monthly'),
  paymentDueDay: integer('payment_due_day').default(0),
  isActive: boolean('is_active').notNull().default(true),
  slabConfig: jsonb('slab_config'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const companyTaxYears = pgTable('company_tax_years', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').default(1),
  assessmentYear: varchar('assessment_year', { length: 10 }).notNull(),
  financialYear: varchar('financial_year', { length: 10 }).notNull(),
  companyPan: varchar('company_pan', { length: 15 }),
  taxRegime: varchar('tax_regime', { length: 20 }),
  baseTaxRate: decimal('base_tax_rate', { precision: 5, scale: 2 }).notNull(),
  surchargeRate: decimal('surcharge_rate', { precision: 5, scale: 2 }).default('0'),
  surchargePolicy: text('surcharge_policy'),
  cessRate: decimal('cess_rate', { precision: 5, scale: 2 }).default('4'),
  effectiveRate: decimal('effective_rate', { precision: 6, scale: 3 }),
  rateOverrideNotes: text('rate_override_notes'),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  remarks: text('remarks'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertCompanyTaxYearSchema = createInsertSchema(companyTaxYears).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompanyTaxYear = z.infer<typeof insertCompanyTaxYearSchema>;
export type CompanyTaxYear = typeof companyTaxYears.$inferSelect;

export const companyTaxEstimates = pgTable('company_tax_estimates', {
  id: serial('id').primaryKey(),
  taxYearId: integer('tax_year_id').references(() => companyTaxYears.id).notNull(),
  estimateDate: timestamp('estimate_date').notNull(),
  estimateLabel: varchar('estimate_label', { length: 50 }),
  grossRevenue: decimal('gross_revenue', { precision: 14, scale: 2 }),
  totalExpenses: decimal('total_expenses', { precision: 14, scale: 2 }),
  profitBeforeTax: decimal('profit_before_tax', { precision: 14, scale: 2 }),
  adjustments: decimal('adjustments', { precision: 14, scale: 2 }).default('0'),
  adjustmentDetails: jsonb('adjustment_details'),
  taxableIncome: decimal('taxable_income', { precision: 14, scale: 2 }),
  taxAtNormalRate: decimal('tax_at_normal_rate', { precision: 12, scale: 2 }),
  surcharge: decimal('surcharge', { precision: 10, scale: 2 }).default('0'),
  educationCess: decimal('education_cess', { precision: 10, scale: 2 }).default('0'),
  totalTaxLiability: decimal('total_tax_liability', { precision: 12, scale: 2 }),
  matApplicable: boolean('mat_applicable').default(false),
  matAmount: decimal('mat_amount', { precision: 12, scale: 2 }),
  effectiveTaxPayable: decimal('effective_tax_payable', { precision: 12, scale: 2 }),
  tdsReceivable: decimal('tds_receivable', { precision: 12, scale: 2 }).default('0'),
  advanceTaxPaid: decimal('advance_tax_paid', { precision: 12, scale: 2 }).default('0'),
  selfAssessmentTaxPaid: decimal('self_assessment_tax_paid', { precision: 12, scale: 2 }).default('0'),
  netTaxPayable: decimal('net_tax_payable', { precision: 12, scale: 2 }),
  isLatest: boolean('is_latest').default(false),
  notes: text('notes'),
  preparedBy: integer('prepared_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertCompanyTaxEstimateSchema = createInsertSchema(companyTaxEstimates).omit({ id: true, createdAt: true });
export type InsertCompanyTaxEstimate = z.infer<typeof insertCompanyTaxEstimateSchema>;
export type CompanyTaxEstimate = typeof companyTaxEstimates.$inferSelect;

export const companyTaxChallans = pgTable('company_tax_challans', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').default(1),
  taxYearId: integer('tax_year_id').references(() => companyTaxYears.id).notNull(),
  challanReference: varchar('challan_reference', { length: 50 }).unique(),
  paymentType: varchar('payment_type', { length: 30 }).notNull(),
  challanNo: varchar('challan_no', { length: 10 }).default('280'),
  bsrCode: varchar('bsr_code', { length: 20 }),
  cinNumber: varchar('cin_number', { length: 50 }),
  taxAmount: decimal('tax_amount', { precision: 12, scale: 2 }).notNull(),
  surchargeAmount: decimal('surcharge_amount', { precision: 10, scale: 2 }).default('0'),
  cessAmount: decimal('cess_amount', { precision: 10, scale: 2 }).default('0'),
  interestAmount: decimal('interest_amount', { precision: 10, scale: 2 }).default('0'),
  penaltyAmount: decimal('penalty_amount', { precision: 10, scale: 2 }).default('0'),
  totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).notNull(),
  advanceTaxId: integer('advance_tax_id'),
  paymentDate: timestamp('payment_date'),
  paymentMode: varchar('payment_mode', { length: 20 }),
  paymentReference: varchar('payment_reference', { length: 100 }),
  bankName: varchar('bank_name', { length: 100 }),
  sapJeReference: varchar('sap_je_reference', { length: 50 }),
  sapDocEntry: integer('sap_doc_entry'),
  sapJeNumber: varchar('sap_je_number', { length: 50 }),
  sapBankAccountCode: varchar('sap_bank_account_code', { length: 50 }),
  sapPostingStatus: varchar('sap_posting_status', { length: 20 }).default('draft'),
  sapPostingError: text('sap_posting_error'),
  sapPostedAt: timestamp('sap_posted_at'),
  reversalSapDocEntry: integer('reversal_sap_doc_entry'),
  reversalSapJeNumber: varchar('reversal_sap_je_number', { length: 50 }),
  reversalSapPostedAt: timestamp('reversal_sap_posted_at'),
  reversedBy: integer('reversed_by'),
  reversedAt: timestamp('reversed_at'),
  glPostingId: integer('gl_posting_id'),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertCompanyTaxChallanSchema = createInsertSchema(companyTaxChallans).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompanyTaxChallan = z.infer<typeof insertCompanyTaxChallanSchema>;
export type CompanyTaxChallan = typeof companyTaxChallans.$inferSelect;

export const companyAdvanceTax = pgTable('company_advance_tax', {
  id: serial('id').primaryKey(),
  taxYearId: integer('tax_year_id').references(() => companyTaxYears.id).notNull(),
  estimateId: integer('estimate_id'),
  installment: varchar('installment', { length: 5 }).notNull(),
  dueDate: timestamp('due_date').notNull(),
  cumulativePercent: decimal('cumulative_percent', { precision: 5, scale: 2 }),
  estimatedLiability: decimal('estimated_liability', { precision: 12, scale: 2 }),
  amountDue: decimal('amount_due', { precision: 12, scale: 2 }),
  amountPaid: decimal('amount_paid', { precision: 12, scale: 2 }).default('0'),
  paymentDate: timestamp('payment_date'),
  challanId: integer('challan_id'),
  interest234c: decimal('interest_234c', { precision: 10, scale: 2 }).default('0'),
  interest234b: decimal('interest_234b', { precision: 10, scale: 2 }).default('0'),
  status: varchar('status', { length: 20 }).notNull().default('upcoming'),
  remarks: text('remarks'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertCompanyAdvanceTaxSchema = createInsertSchema(companyAdvanceTax).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompanyAdvanceTax = z.infer<typeof insertCompanyAdvanceTaxSchema>;
export type CompanyAdvanceTax = typeof companyAdvanceTax.$inferSelect;

export const companyTaxProvisions = pgTable('company_tax_provisions', {
  id: serial('id').primaryKey(),
  taxYearId: integer('tax_year_id').references(() => companyTaxYears.id).notNull(),
  provisionDate: timestamp('provision_date').notNull(),
  provisionPeriod: varchar('provision_period', { length: 30 }),
  provisionType: varchar('provision_type', { length: 20 }),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  cumulativeProvision: decimal('cumulative_provision', { precision: 12, scale: 2 }),
  estimateId: integer('estimate_id'),
  reversedProvisionId: integer('reversed_provision_id'),
  adjustmentReference: varchar('adjustment_reference', { length: 100 }),
  sapJeReference: varchar('sap_je_reference', { length: 50 }),
  sapDocEntry: integer('sap_doc_entry'),
  sapJeNumber: varchar('sap_je_number', { length: 50 }),
  sapPostingStatus: varchar('sap_posting_status', { length: 20 }).default('draft'),
  sapPostingError: text('sap_posting_error'),
  sapPostedAt: timestamp('sap_posted_at'),
  reversalSapDocEntry: integer('reversal_sap_doc_entry'),
  reversalSapJeNumber: varchar('reversal_sap_je_number', { length: 50 }),
  reversalSapPostedAt: timestamp('reversal_sap_posted_at'),
  reversedBy: integer('reversed_by'),
  reversedAt: timestamp('reversed_at'),
  glPostingId: integer('gl_posting_id'),
  postingStatus: varchar('posting_status', { length: 20 }).notNull().default('draft'),
  notes: text('notes'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertCompanyTaxProvisionSchema = createInsertSchema(companyTaxProvisions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompanyTaxProvision = z.infer<typeof insertCompanyTaxProvisionSchema>;
export type CompanyTaxProvision = typeof companyTaxProvisions.$inferSelect;

export const companyTaxReturns = pgTable('company_tax_returns', {
  id: serial('id').primaryKey(),
  taxYearId: integer('tax_year_id').references(() => companyTaxYears.id).notNull(),
  returnType: varchar('return_type', { length: 20 }).notNull(),
  formType: varchar('form_type', { length: 10 }).default('ITR-6'),
  dueDate: timestamp('due_date'),
  filingDate: timestamp('filing_date'),
  acknowledgementNumber: varchar('acknowledgement_number', { length: 50 }),
  totalIncomeReported: decimal('total_income_reported', { precision: 14, scale: 2 }),
  totalTaxPayable: decimal('total_tax_payable', { precision: 12, scale: 2 }),
  totalTaxPaid: decimal('total_tax_paid', { precision: 12, scale: 2 }),
  interest234a: decimal('interest_234a', { precision: 10, scale: 2 }).default('0'),
  interest234b: decimal('interest_234b', { precision: 10, scale: 2 }).default('0'),
  interest234c: decimal('interest_234c', { precision: 10, scale: 2 }).default('0'),
  totalInterest: decimal('total_interest', { precision: 10, scale: 2 }).default('0'),
  refundClaimed: decimal('refund_claimed', { precision: 12, scale: 2 }).default('0'),
  refundReceived: decimal('refund_received', { precision: 12, scale: 2 }).default('0'),
  refundDate: timestamp('refund_date'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  remarks: text('remarks'),
  filedBy: integer('filed_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertCompanyTaxReturnSchema = createInsertSchema(companyTaxReturns).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompanyTaxReturn = z.infer<typeof insertCompanyTaxReturnSchema>;
export type CompanyTaxReturn = typeof companyTaxReturns.$inferSelect;

export const companyTaxNotices = pgTable('company_tax_notices', {
  id: serial('id').primaryKey(),
  taxYearId: integer('tax_year_id').references(() => companyTaxYears.id).notNull(),
  noticeType: varchar('notice_type', { length: 30 }),
  noticeDate: timestamp('notice_date'),
  dueDate: timestamp('due_date'),
  demandAmount: decimal('demand_amount', { precision: 12, scale: 2 }),
  status: varchar('status', { length: 20 }).notNull().default('received'),
  remarks: text('remarks'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const tdsComplianceRegister = pgTable('tds_compliance_register', {
  id: serial('id').primaryKey(),
  sourceCategory: varchar('source_category', { length: 30 }).notNull(),
  tdsSection: varchar('tds_section', { length: 10 }).notNull(),
  financialYear: varchar('financial_year', { length: 10 }).notNull(),
  quarter: varchar('quarter', { length: 5 }).notNull(),
  month: integer('month').notNull(),
  year: integer('year').notNull(),
  deducteeName: varchar('deductee_name', { length: 200 }).notNull(),
  deducteePan: varchar('deductee_pan', { length: 15 }),
  panStatus: varchar('pan_status', { length: 20 }).notNull().default('unverified'),
  panValidationError: varchar('pan_validation_error', { length: 100 }),
  deducteeType: varchar('deductee_type', { length: 20 }).notNull(),
  employeeId: integer('employee_id').references(() => users.id),
  payrollRecordId: integer('payroll_record_id').references(() => payrollRecords.id),
  sapVendorCode: varchar('sap_vendor_code', { length: 50 }),
  sapDocEntry: integer('sap_doc_entry'),
  sapDocType: varchar('sap_doc_type', { length: 30 }),
  sapWtCode: varchar('sap_wt_code', { length: 20 }),
  sapLineIndex: integer('sap_line_index'),
  deductionStage: varchar('deduction_stage', { length: 20 }),
  baseAmount: decimal('base_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  tdsAmount: decimal('tds_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  tdsRate: decimal('tds_rate', { precision: 5, scale: 2 }),
  deductionDate: timestamp('deduction_date'),
  challanId: integer('challan_id').references(() => statutoryChallans.id),
  challanStatus: varchar('challan_status', { length: 20 }).notNull().default('pending'),
  syncBatchId: varchar('sync_batch_id', { length: 50 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertTdsComplianceRegisterSchema = createInsertSchema(tdsComplianceRegister).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTdsComplianceRegister = z.infer<typeof insertTdsComplianceRegisterSchema>;
export type TdsComplianceRegister = typeof tdsComplianceRegister.$inferSelect;

export const tdsPayrollSapReconciliation = pgTable('tds_payroll_sap_reconciliation', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull().references(() => users.id),
  employeeName: varchar('employee_name', { length: 200 }).notNull(),
  employeeCode: varchar('employee_code', { length: 20 }),
  periodId: integer('period_id').references(() => payrollPeriods.id),
  month: integer('month').notNull(),
  year: integer('year').notNull(),
  financialYear: varchar('financial_year', { length: 10 }).notNull(),
  quarter: varchar('quarter', { length: 5 }).notNull(),
  payrollTdsAmount: decimal('payroll_tds_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  sapPostingStatus: varchar('sap_posting_status', { length: 20 }).notNull().default('sap_missing'),
  sapDocEntry: integer('sap_doc_entry'),
  sapJeNumber: varchar('sap_je_number', { length: 50 }),
  sapPostingDate: timestamp('sap_posting_date'),
  sapVerifiedTdsAmount: decimal('sap_verified_tds_amount', { precision: 12, scale: 2 }),
  sapVerificationStatus: varchar('sap_verification_status', { length: 20 }).default('not_verified'),
  variance: decimal('variance', { precision: 12, scale: 2 }),
  toleranceApplied: decimal('tolerance_applied', { precision: 10, scale: 2 }),
  payrollRecordId: integer('payroll_record_id').references(() => payrollRecords.id),
  lastReconciledAt: timestamp('last_reconciled_at'),
  lastVerifiedAt: timestamp('last_verified_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertTdsPayrollSapReconciliationSchema = createInsertSchema(tdsPayrollSapReconciliation).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTdsPayrollSapReconciliation = z.infer<typeof insertTdsPayrollSapReconciliationSchema>;
export type TdsPayrollSapReconciliation = typeof tdsPayrollSapReconciliation.$inferSelect;

export const sapWhtSyncLog = pgTable('sap_wht_sync_log', {
  id: serial('id').primaryKey(),
  syncBatchId: varchar('sync_batch_id', { length: 50 }).notNull().unique(),
  financialYear: varchar('financial_year', { length: 10 }).notNull(),
  month: integer('month').notNull(),
  year: integer('year').notNull(),
  recordsFetched: integer('records_fetched').default(0),
  recordsInserted: integer('records_inserted').default(0),
  recordsSkipped: integer('records_skipped').default(0),
  recordsUpdated: integer('records_updated').default(0),
  syncStatus: varchar('sync_status', { length: 20 }).notNull().default('pending'),
  errorMessage: text('error_message'),
  sapDocTypesQueried: text('sap_doc_types_queried'),
  syncedBy: integer('synced_by').references(() => users.id),
  syncedAt: timestamp('synced_at').defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertSapWhtSyncLogSchema = createInsertSchema(sapWhtSyncLog).omit({ id: true, createdAt: true });
export type InsertSapWhtSyncLog = z.infer<typeof insertSapWhtSyncLogSchema>;
export type SapWhtSyncLog = typeof sapWhtSyncLog.$inferSelect;

// ==========================================
// EMPLOYEE APPRAISAL MODULE
// ==========================================

export const appraisalCycleStatuses = [
  'draft', 'open', 'under_review', 'closed', 'paused'
] as const;
export type AppraisalCycleStatus = typeof appraisalCycleStatuses[number];

export const appraisalStatuses = [
  'draft', 'open', 'self_submitted', 'l1_reviewed', 'l2_reviewed', 'approved', 'closed', 'reopened'
] as const;
export type AppraisalStatus = typeof appraisalStatuses[number];

export const appraisalCycleTypes = ['annual', 'mid_year'] as const;
export type AppraisalCycleType = typeof appraisalCycleTypes[number];

export const appraisalRatingBands = ['poor', 'fair', 'good', 'very_good', 'excellent'] as const;
export type AppraisalRatingBand = typeof appraisalRatingBands[number];

// Table 1: Appraisal Cycle Templates
export const appraisalCycleTemplates = pgTable('appraisal_cycle_templates', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  cycleType: varchar('cycle_type', { length: 50 }).notNull(),
  triggerMonth: integer('trigger_month').notNull(),
  triggerDay: integer('trigger_day').notNull(),
  selfDeadlineDays: integer('self_deadline_days').notNull().default(30),
  managerDeadlineDays: integer('manager_deadline_days').notNull().default(45),
  l2DeadlineDays: integer('l2_deadline_days').notNull().default(60),
  approvalDeadlineDays: integer('approval_deadline_days').notNull().default(75),
  closureBufferDays: integer('closure_buffer_days').notNull().default(15),
  minServiceDays: integer('min_service_days').notNull().default(90),
  autoCreate: boolean('auto_create').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertAppraisalCycleTemplateSchema = createInsertSchema(appraisalCycleTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAppraisalCycleTemplate = z.infer<typeof insertAppraisalCycleTemplateSchema>;
export type AppraisalCycleTemplate = typeof appraisalCycleTemplates.$inferSelect;

// Table 2: Appraisal Cycles
export const appraisalCycles = pgTable('appraisal_cycles', {
  id: serial('id').primaryKey(),
  templateId: integer('template_id').references(() => appraisalCycleTemplates.id),
  name: varchar('name', { length: 300 }).notNull(),
  cycleType: varchar('cycle_type', { length: 50 }).notNull(),
  financialYear: varchar('financial_year', { length: 20 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('draft'),
  startDate: date('start_date').notNull(),
  selfAssessmentDeadline: date('self_assessment_deadline').notNull(),
  managerReviewDeadline: date('manager_review_deadline').notNull(),
  l2ReviewDeadline: date('l2_review_deadline').notNull(),
  approvalDeadline: date('approval_deadline').notNull(),
  closureDate: date('closure_date').notNull(),
  totalAppraisals: integer('total_appraisals').default(0),
  completedAppraisals: integer('completed_appraisals').default(0),
  createdBy: integer('created_by').references(() => users.id),
  isAutoGenerated: boolean('is_auto_generated').default(false),
  pausedAt: timestamp('paused_at'),
  pausedBy: integer('paused_by').references(() => users.id),
  pauseReason: text('pause_reason'),
  previousStatusBeforePause: varchar('previous_status_before_pause', { length: 30 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertAppraisalCycleSchema = createInsertSchema(appraisalCycles).omit({ id: true, createdAt: true, updatedAt: true, totalAppraisals: true, completedAppraisals: true });
export type InsertAppraisalCycle = z.infer<typeof insertAppraisalCycleSchema>;
export type AppraisalCycle = typeof appraisalCycles.$inferSelect;

// Table 3: Employee Appraisals (core record with L1/L2/L3 snapshot)
export const employeeAppraisals = pgTable('employee_appraisals', {
  id: serial('id').primaryKey(),
  cycleId: integer('cycle_id').notNull().references(() => appraisalCycles.id),
  employeeId: integer('employee_id').notNull().references(() => users.id),
  employeeName: varchar('employee_name', { length: 200 }).notNull(),
  employeeCode: varchar('employee_code', { length: 50 }),
  department: varchar('department', { length: 100 }),
  designation: varchar('designation', { length: 100 }),
  dateOfJoining: text('date_of_joining'),

  l1ReviewerId: integer('l1_reviewer_id').notNull().references(() => users.id),
  l1ReviewerName: varchar('l1_reviewer_name', { length: 200 }).notNull(),
  l2ReviewerId: integer('l2_reviewer_id').notNull().references(() => users.id),
  l2ReviewerName: varchar('l2_reviewer_name', { length: 200 }).notNull(),
  l3ApproverId: integer('l3_approver_id').notNull().references(() => users.id),
  l3ApproverName: varchar('l3_approver_name', { length: 200 }).notNull(),

  status: varchar('status', { length: 30 }).notNull().default('draft'),

  selfAssessmentNarrative: text('self_assessment_narrative'),
  selfSubmittedAt: timestamp('self_submitted_at'),

  l1Score: decimal('l1_score', { precision: 5, scale: 2 }),
  l1Comments: text('l1_comments'),
  l1ReviewedAt: timestamp('l1_reviewed_at'),
  l1IncrementRecommendation: varchar('l1_increment_recommendation', { length: 50 }),
  l1PromotionRecommendation: varchar('l1_promotion_recommendation', { length: 50 }),
  l1TrainingRecommendation: text('l1_training_recommendation'),

  l2Score: decimal('l2_score', { precision: 5, scale: 2 }),
  l2Comments: text('l2_comments'),
  l2ReviewedAt: timestamp('l2_reviewed_at'),
  l2OverrideReason: text('l2_override_reason'),
  l2IncrementRecommendation: varchar('l2_increment_recommendation', { length: 50 }),
  l2PromotionRecommendation: varchar('l2_promotion_recommendation', { length: 50 }),
  l2TrainingRecommendation: text('l2_training_recommendation'),

  l3Comments: text('l3_comments'),
  l3ApprovedAt: timestamp('l3_approved_at'),

  l3IncrementType: varchar('l3_increment_type', { length: 20 }),
  l3IncrementValue: decimal('l3_increment_value', { precision: 10, scale: 2 }),
  l3PromotionApproved: boolean('l3_promotion_approved'),
  l3NewDesignation: varchar('l3_new_designation', { length: 200 }),
  l3EffectiveDate: text('l3_effective_date'),
  l3FinalRemarks: text('l3_final_remarks'),

  systemRecommendation: jsonb('system_recommendation'),

  finalScore: decimal('final_score', { precision: 5, scale: 2 }),
  finalRating: varchar('final_rating', { length: 30 }),
  finalRecommendations: jsonb('final_recommendations'),

  kpiWeightedScore: decimal('kpi_weighted_score', { precision: 5, scale: 2 }),
  competencyAvgScore: decimal('competency_avg_score', { precision: 5, scale: 2 }),
  overallCalculatedScore: decimal('overall_calculated_score', { precision: 5, scale: 2 }),

  appliedTemplateId: integer('applied_template_id').references(() => appraisalKpiTemplates.id),
  appliedTemplateName: varchar('applied_template_name', { length: 300 }),
  templateChangedAt: timestamp('template_changed_at'),
  templateChangedBy: integer('template_changed_by').references(() => users.id),
  templateChangeCount: integer('template_change_count').default(0),

  isLocked: boolean('is_locked').default(false),
  reopenedAt: timestamp('reopened_at'),
  reopenedBy: integer('reopened_by').references(() => users.id),
  reopenReason: text('reopen_reason'),
  reopenTargetStage: varchar('reopen_target_stage', { length: 30 }),

  resubmissionCount: integer('resubmission_count').notNull().default(0),
  lastReturnedAt: timestamp('last_returned_at'),
  lastReturnedBy: integer('last_returned_by'),
  lastReturnRemarks: text('last_return_remarks'),

  // System-suggested increment (computed on L3 approval, Superuser-only visibility)
  systemSuggestedIncrementPct: decimal('system_suggested_increment_pct', { precision: 5, scale: 2 }),
  minIncrementPct: decimal('min_increment_pct', { precision: 5, scale: 2 }),
  maxIncrementPct: decimal('max_increment_pct', { precision: 5, scale: 2 }),
  incrementProposalId: integer('increment_proposal_id'),
  incrementProposalCreatedAt: timestamp('increment_proposal_created_at'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertEmployeeAppraisalSchema = createInsertSchema(employeeAppraisals).omit({
  id: true, createdAt: true, updatedAt: true,
  selfSubmittedAt: true, l1ReviewedAt: true, l2ReviewedAt: true, l3ApprovedAt: true,
  kpiWeightedScore: true, competencyAvgScore: true, overallCalculatedScore: true,
  finalScore: true, finalRating: true, finalRecommendations: true,
  isLocked: true, reopenedAt: true, reopenedBy: true,
});
export type InsertEmployeeAppraisal = z.infer<typeof insertEmployeeAppraisalSchema>;
export type EmployeeAppraisal = typeof employeeAppraisals.$inferSelect;

export const appraisalIncrementPolicy = pgTable('appraisal_increment_policy', {
  id: serial('id').primaryKey(),
  ratingBand: varchar('rating_band', { length: 30 }).notNull(),
  minScoreRange: decimal('min_score_range', { precision: 3, scale: 1 }).notNull(),
  maxScoreRange: decimal('max_score_range', { precision: 3, scale: 1 }).notNull(),
  incrementMinPercent: decimal('increment_min_percent', { precision: 5, scale: 2 }).notNull(),
  incrementMaxPercent: decimal('increment_max_percent', { precision: 5, scale: 2 }).notNull(),
  promotionSuitability: varchar('promotion_suitability', { length: 10 }).notNull().default('Low'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const appraisalDesignationProgression = pgTable('appraisal_designation_progression', {
  id: serial('id').primaryKey(),
  currentDesignation: varchar('current_designation', { length: 200 }).notNull(),
  nextDesignation: varchar('next_designation', { length: 200 }).notNull(),
  minimumTenureMonths: integer('minimum_tenure_months').default(12),
  minimumRating: varchar('minimum_rating', { length: 30 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type AppraisalIncrementPolicy = typeof appraisalIncrementPolicy.$inferSelect;
export type AppraisalDesignationProgression = typeof appraisalDesignationProgression.$inferSelect;

// Table 4: Employee Appraisal KPIs
export const employeeAppraisalKpis = pgTable('employee_appraisal_kpis', {
  id: serial('id').primaryKey(),
  appraisalId: integer('appraisal_id').notNull().references(() => employeeAppraisals.id, { onDelete: 'cascade' }),
  kpiTitle: varchar('kpi_title', { length: 300 }).notNull(),
  kpiDescription: text('kpi_description'),
  weightage: decimal('weightage', { precision: 5, scale: 2 }).notNull(),
  targetValue: text('target_value'),
  achievedValue: text('achieved_value'),
  selfScore: decimal('self_score', { precision: 3, scale: 1 }),
  managerScore: decimal('manager_score', { precision: 3, scale: 1 }),
  l2Score: decimal('l2_score', { precision: 3, scale: 1 }),
  selfComments: text('self_comments'),
  managerComments: text('manager_comments'),
  l2Comments: text('l2_comments'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertEmployeeAppraisalKpiSchema = createInsertSchema(employeeAppraisalKpis).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmployeeAppraisalKpi = z.infer<typeof insertEmployeeAppraisalKpiSchema>;
export type EmployeeAppraisalKpi = typeof employeeAppraisalKpis.$inferSelect;

// Table 5: Employee Appraisal Competencies
export const employeeAppraisalCompetencies = pgTable('employee_appraisal_competencies', {
  id: serial('id').primaryKey(),
  appraisalId: integer('appraisal_id').notNull().references(() => employeeAppraisals.id, { onDelete: 'cascade' }),
  competencyName: varchar('competency_name', { length: 300 }).notNull(),
  competencyDescription: text('competency_description'),
  selfScore: decimal('self_score', { precision: 3, scale: 1 }),
  managerScore: decimal('manager_score', { precision: 3, scale: 1 }),
  l2Score: decimal('l2_score', { precision: 3, scale: 1 }),
  selfComments: text('self_comments'),
  managerComments: text('manager_comments'),
  l2Comments: text('l2_comments'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertEmployeeAppraisalCompetencySchema = createInsertSchema(employeeAppraisalCompetencies).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmployeeAppraisalCompetency = z.infer<typeof insertEmployeeAppraisalCompetencySchema>;
export type EmployeeAppraisalCompetency = typeof employeeAppraisalCompetencies.$inferSelect;

// Table 6: Appraisal Comments
export const appraisalComments = pgTable('appraisal_comments', {
  id: serial('id').primaryKey(),
  appraisalId: integer('appraisal_id').notNull().references(() => employeeAppraisals.id, { onDelete: 'cascade' }),
  section: varchar('section', { length: 50 }).notNull(),
  commentBy: integer('comment_by').notNull().references(() => users.id),
  commentByName: varchar('comment_by_name', { length: 200 }).notNull(),
  commentByRole: varchar('comment_by_role', { length: 50 }).notNull(),
  comment: text('comment').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertAppraisalCommentSchema = createInsertSchema(appraisalComments).omit({ id: true, createdAt: true });
export type InsertAppraisalComment = z.infer<typeof insertAppraisalCommentSchema>;
export type AppraisalComment = typeof appraisalComments.$inferSelect;

// Table 7: Appraisal Approvals (status transition log)
export const appraisalApprovals = pgTable('appraisal_approvals', {
  id: serial('id').primaryKey(),
  appraisalId: integer('appraisal_id').notNull().references(() => employeeAppraisals.id, { onDelete: 'cascade' }),
  previousStatus: varchar('previous_status', { length: 30 }).notNull(),
  newStatus: varchar('new_status', { length: 30 }).notNull(),
  performedBy: integer('performed_by').notNull().references(() => users.id),
  performedByName: varchar('performed_by_name', { length: 200 }).notNull(),
  remarks: text('remarks'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertAppraisalApprovalSchema = createInsertSchema(appraisalApprovals).omit({ id: true, createdAt: true });
export type InsertAppraisalApproval = z.infer<typeof insertAppraisalApprovalSchema>;
export type AppraisalApproval = typeof appraisalApprovals.$inferSelect;

// Table 8: Appraisal Audit Log
export const appraisalAuditLog = pgTable('appraisal_audit_log', {
  id: serial('id').primaryKey(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: integer('entity_id').notNull(),
  action: varchar('action', { length: 100 }).notNull(),
  performedBy: integer('performed_by').references(() => users.id),
  performedByName: varchar('performed_by_name', { length: 200 }),
  performedBySystem: boolean('performed_by_system').default(false),
  details: jsonb('details'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const insertAppraisalAuditLogSchema = createInsertSchema(appraisalAuditLog).omit({ id: true, createdAt: true });
export type InsertAppraisalAuditLog = z.infer<typeof insertAppraisalAuditLogSchema>;
export type AppraisalAuditLog = typeof appraisalAuditLog.$inferSelect;

// Table 9: Appraisal KPI Templates (Department + Level based)
export const appraisalKpiTemplates = pgTable('appraisal_kpi_templates', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 300 }).notNull(),
  department: varchar('department', { length: 100 }).notNull(),
  hierarchyLevel: varchar('hierarchy_level', { length: 10 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  description: text('description'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertAppraisalKpiTemplateSchema = createInsertSchema(appraisalKpiTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAppraisalKpiTemplate = z.infer<typeof insertAppraisalKpiTemplateSchema>;
export type AppraisalKpiTemplate = typeof appraisalKpiTemplates.$inferSelect;

// Table 10: Appraisal KPI Template Items
export const appraisalKpiTemplateItems = pgTable('appraisal_kpi_template_items', {
  id: serial('id').primaryKey(),
  templateId: integer('template_id').notNull().references(() => appraisalKpiTemplates.id, { onDelete: 'cascade' }),
  kpiTitle: varchar('kpi_title', { length: 300 }).notNull(),
  kpiDescription: text('kpi_description'),
  defaultWeightage: decimal('default_weightage', { precision: 5, scale: 2 }).notNull(),
  targetGuidance: text('target_guidance'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertAppraisalKpiTemplateItemSchema = createInsertSchema(appraisalKpiTemplateItems).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAppraisalKpiTemplateItem = z.infer<typeof insertAppraisalKpiTemplateItemSchema>;
export type AppraisalKpiTemplateItem = typeof appraisalKpiTemplateItems.$inferSelect;

// Appraisal Relations
export const appraisalCycleTemplatesRelations = relations(appraisalCycleTemplates, ({ many }) => ({
  cycles: many(appraisalCycles),
}));

export const appraisalKpiTemplatesRelations = relations(appraisalKpiTemplates, ({ one, many }) => ({
  creator: one(users, { fields: [appraisalKpiTemplates.createdBy], references: [users.id], relationName: 'kpiTemplateCreator' }),
  items: many(appraisalKpiTemplateItems),
}));

export const appraisalKpiTemplateItemsRelations = relations(appraisalKpiTemplateItems, ({ one }) => ({
  template: one(appraisalKpiTemplates, { fields: [appraisalKpiTemplateItems.templateId], references: [appraisalKpiTemplates.id] }),
}));

export const appraisalCyclesRelations = relations(appraisalCycles, ({ one, many }) => ({
  template: one(appraisalCycleTemplates, { fields: [appraisalCycles.templateId], references: [appraisalCycleTemplates.id] }),
  createdByUser: one(users, { fields: [appraisalCycles.createdBy], references: [users.id], relationName: 'appraisalCycleCreator' }),
  appraisals: many(employeeAppraisals),
}));

export const employeeAppraisalsRelations = relations(employeeAppraisals, ({ one, many }) => ({
  cycle: one(appraisalCycles, { fields: [employeeAppraisals.cycleId], references: [appraisalCycles.id] }),
  employee: one(users, { fields: [employeeAppraisals.employeeId], references: [users.id], relationName: 'appraisalEmployee' }),
  l1Reviewer: one(users, { fields: [employeeAppraisals.l1ReviewerId], references: [users.id], relationName: 'appraisalL1Reviewer' }),
  l2Reviewer: one(users, { fields: [employeeAppraisals.l2ReviewerId], references: [users.id], relationName: 'appraisalL2Reviewer' }),
  l3Approver: one(users, { fields: [employeeAppraisals.l3ApproverId], references: [users.id], relationName: 'appraisalL3Approver' }),
  reopener: one(users, { fields: [employeeAppraisals.reopenedBy], references: [users.id], relationName: 'appraisalReopener' }),
  kpis: many(employeeAppraisalKpis),
  competencies: many(employeeAppraisalCompetencies),
  comments: many(appraisalComments),
  approvals: many(appraisalApprovals),
}));

export const employeeAppraisalKpisRelations = relations(employeeAppraisalKpis, ({ one }) => ({
  appraisal: one(employeeAppraisals, { fields: [employeeAppraisalKpis.appraisalId], references: [employeeAppraisals.id] }),
}));

export const employeeAppraisalCompetenciesRelations = relations(employeeAppraisalCompetencies, ({ one }) => ({
  appraisal: one(employeeAppraisals, { fields: [employeeAppraisalCompetencies.appraisalId], references: [employeeAppraisals.id] }),
}));

export const appraisalCommentsRelations = relations(appraisalComments, ({ one }) => ({
  appraisal: one(employeeAppraisals, { fields: [appraisalComments.appraisalId], references: [employeeAppraisals.id] }),
  user: one(users, { fields: [appraisalComments.commentBy], references: [users.id], relationName: 'appraisalCommentUser' }),
}));

export const appraisalApprovalsRelations = relations(appraisalApprovals, ({ one }) => ({
  appraisal: one(employeeAppraisals, { fields: [appraisalApprovals.appraisalId], references: [employeeAppraisals.id] }),
  user: one(users, { fields: [appraisalApprovals.performedBy], references: [users.id], relationName: 'appraisalApprovalUser' }),
}));

export const l1Workers = pgTable("l1_workers", {
  id: serial("id").primaryKey(),
  workerKey: varchar("worker_key", { length: 100 }).notNull().unique(),
  displayName: varchar("display_name", { length: 200 }).notNull(),
  description: text("description"),
  listenEvents: text("listen_events").array().notNull(),
  checks: text("checks").array(),
  module: varchar("module", { length: 100 }),
  phase: varchar("phase", { length: 20 }).default("phase1"),
  isEnabled: boolean("is_enabled").notNull().default(false),
  isSuspended: boolean("is_suspended").notNull().default(false),
  eventsConsumed: integer("events_consumed").notNull().default(0),
  actionsCreated: integer("actions_created").notNull().default(0),
  actionsResolved: integer("actions_resolved").notNull().default(0),
  avgResponseMs: integer("avg_response_ms").notNull().default(0),
  consecutiveErrors: integer("consecutive_errors").notNull().default(0),
  lastEventAt: timestamp("last_event_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertL1WorkerSchema = createInsertSchema(l1Workers).omit({ id: true, createdAt: true });
export type InsertL1Worker = z.infer<typeof insertL1WorkerSchema>;
export type L1Worker = typeof l1Workers.$inferSelect;

export const l1Events = pgTable("l1_events", {
  id: serial("id").primaryKey(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  workerKey: varchar("worker_key", { length: 100 }).notNull(),
  userId: integer("user_id"),
  userName: varchar("user_name", { length: 200 }),
  entityType: varchar("entity_type", { length: 100 }),
  entityId: varchar("entity_id", { length: 100 }),
  entityLabel: varchar("entity_label", { length: 500 }),
  checksRun: integer("checks_run").notNull().default(0),
  checksPassed: integer("checks_passed").notNull().default(0),
  actionsGenerated: integer("actions_generated").notNull().default(0),
  resultStatus: varchar("result_status", { length: 50 }).notNull().default("passed"),
  resultSummary: varchar("result_summary", { length: 500 }),
  processingMs: integer("processing_ms").notNull().default(0),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertL1EventSchema = createInsertSchema(l1Events).omit({ id: true, createdAt: true });
export type InsertL1Event = z.infer<typeof insertL1EventSchema>;
export type L1Event = typeof l1Events.$inferSelect;

export const l1Actions = pgTable("l1_actions", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id"),
  workerKey: varchar("worker_key", { length: 100 }).notNull(),
  userId: integer("user_id").notNull(),
  userName: varchar("user_name", { length: 200 }),
  priority: varchar("priority", { length: 20 }).notNull().default("P2"),
  what: varchar("what", { length: 200 }).notNull(),
  where: varchar("where", { length: 500 }),
  whenTo: varchar("when_to", { length: 200 }),
  why: varchar("why", { length: 500 }),
  actionLabel: varchar("action_label", { length: 100 }),
  actionUrl: varchar("action_url", { length: 500 }),
  entityType: varchar("entity_type", { length: 100 }),
  entityId: varchar("entity_id", { length: 100 }),
  status: varchar("status", { length: 50 }).notNull().default("open"),
  warningType: varchar("warning_type", { length: 100 }),
  dismissCount: integer("dismiss_count").notNull().default(0),
  resolvedAt: timestamp("resolved_at"),
  dismissedAt: timestamp("dismissed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertL1ActionSchema = createInsertSchema(l1Actions).omit({ id: true, createdAt: true });
export type InsertL1Action = z.infer<typeof insertL1ActionSchema>;
export type L1Action = typeof l1Actions.$inferSelect;

export const projectWorkflowEvents = pgTable('project_workflow_events', {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  eventName: varchar("event_name", { length: 200 }).notNull(),
  eventPayload: jsonb("event_payload").notNull(),
  emittedBy: varchar("emitted_by", { length: 200 }).notNull(),
  emittedAt: timestamp("emitted_at").notNull().defaultNow(),
  processed: boolean("processed").notNull().default(false),
  processedAt: timestamp("processed_at"),
});

export const insertProjectWorkflowEventSchema = createInsertSchema(projectWorkflowEvents).omit({ id: true });
export type InsertProjectWorkflowEvent = z.infer<typeof insertProjectWorkflowEventSchema>;
export type ProjectWorkflowEvent = typeof projectWorkflowEvents.$inferSelect;

export const epcPurchaseOrders = pgTable('epc_purchase_orders', {
  id: serial("id").primaryKey(),
  poNumber: varchar("po_number", { length: 50 }).notNull().unique(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectItemId: integer("project_item_id").notNull().references(() => projectItems.id, { onDelete: 'cascade' }),
  planningRecordId: integer("planning_record_id").references(() => itemPlanningRecords.id),
  executionRecordId: integer("execution_record_id").references(() => procurementExecutionRecords.id),
  poPreparationId: integer("po_preparation_id").notNull().references(() => poPreparationRecords.id),
  qualityPlanId: integer("quality_plan_id").references(() => qualityPlanningRecords.id),
  masterItemId: integer("master_item_id").notNull().references(() => masterItems.id),
  vendorId: integer("vendor_id").references(() => vendors.id),
  vendorName: varchar("vendor_name", { length: 255 }),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default('INR'),
  paymentTerms: text("payment_terms"),
  deliveryTerms: text("delivery_terms"),
  poNotes: text("po_notes"),
  status: varchar("status", { length: 30 }).notNull().default('draft'),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  approvalNote: text("approval_note"),
  issuedBy: integer("issued_by").references(() => users.id),
  issuedAt: timestamp("issued_at"),
  issueNote: text("issue_note"),
  cancelledBy: integer("cancelled_by").references(() => users.id),
  cancelledAt: timestamp("cancelled_at"),
  cancelReason: text("cancel_reason"),
  supersededById: integer("superseded_by_id"),
  supersededAt: timestamp("superseded_at"),
  supersessionReason: text("supersession_reason"),
  sourceBomHeaderId: integer("source_bom_header_id").references(() => epcBomHeaders.id, { onDelete: 'set null' }),
  sourceBomLineId: integer("source_bom_line_id"),
  qualityStatus: varchar("quality_status", { length: 30 }).default('pending_inspection'),
  qualityClearedBy: integer("quality_cleared_by").references(() => users.id),
  qualityClearedAt: timestamp("quality_cleared_at"),
  qualityClearedInspectionId: integer("quality_cleared_inspection_id"),
  qualityFailureReason: text("quality_failure_reason"),
  qualityFailedInspectionId: integer("quality_failed_inspection_id"),
  createdBy: integer("created_by").references(() => users.id),
  createdSourceType: varchar("created_source_type", { length: 20 }).default('manual'),
  createdSourceRef: varchar("created_source_ref", { length: 100 }),
  automationRunId: uuid("automation_run_id"),
  poGroupId: integer("po_group_id"), // FK to epc_po_groups — no .references() to avoid forward ref; constraint enforced at application layer
  amendmentCount: integer("amendment_count").default(0),
  itemCode: varchar("item_code", { length: 100 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const epcPurchaseOrderItems = pgTable('epc_purchase_order_items', {
  id: serial("id").primaryKey(),
  epcPurchaseOrderId: integer("epc_purchase_order_id").notNull().references(() => epcPurchaseOrders.id, { onDelete: 'cascade' }),
  lineNumber: integer("line_number").notNull().default(1),
  masterItemId: integer("master_item_id").notNull().references(() => masterItems.id),
  itemCode: varchar("item_code", { length: 100 }),
  itemDescription: text("item_description"),
  itemSpecification: text("item_specification"),
  uom: varchar("uom", { length: 30 }),
  drawingNo: varchar("drawing_no", { length: 100 }),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 12, scale: 2 }),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }),
  sourceBomLineId: integer("source_bom_line_id"),
  plcLineId: integer("plc_line_id"), // FK to procurement_list_lines — nullable; added Phase 1
  plcLineQty: decimal("plc_line_qty", { precision: 10, scale: 2 }),
  plcLineQtyReceived: decimal("plc_line_qty_received", { precision: 10, scale: 2 }).default('0'),
  procurementNotes: text("procurement_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEpcPurchaseOrderSchema = createInsertSchema(epcPurchaseOrders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEpcPurchaseOrder = z.infer<typeof insertEpcPurchaseOrderSchema>;
export type EpcPurchaseOrder = typeof epcPurchaseOrders.$inferSelect;

export const insertEpcPurchaseOrderItemSchema = createInsertSchema(epcPurchaseOrderItems).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEpcPurchaseOrderItem = z.infer<typeof insertEpcPurchaseOrderItemSchema>;
export type EpcPurchaseOrderItem = typeof epcPurchaseOrderItems.$inferSelect;

export const epcWorkOrders = pgTable('epc_work_orders', {
  id: serial("id").primaryKey(),
  woNumber: varchar("wo_number", { length: 50 }).notNull().unique(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectItemId: integer("project_item_id").notNull().references(() => projectItems.id, { onDelete: 'cascade' }),
  planningRecordId: integer("planning_record_id").references(() => itemPlanningRecords.id),
  executionRecordId: integer("execution_record_id").references(() => productionExecutionRecords.id),
  woPreparationId: integer("wo_preparation_id").notNull().references(() => woPreparationRecords.id),
  qualityPlanId: integer("quality_plan_id").references(() => qualityPlanningRecords.id),
  masterItemId: integer("master_item_id").notNull().references(() => masterItems.id),
  itemCode: varchar("item_code", { length: 100 }),
  itemDescription: text("item_description"),
  itemSpecification: text("item_specification"),
  uom: varchar("uom", { length: 30 }),
  drawingNo: varchar("drawing_no", { length: 100 }),
  drawingRevision: integer("drawing_revision"),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  estimatedUnitCost: decimal("estimated_unit_cost", { precision: 12, scale: 2 }),
  estimatedTotalCost: decimal("estimated_total_cost", { precision: 12, scale: 2 }),
  makeClassification: varchar("make_classification", { length: 50 }),
  manufacturingNotes: text("manufacturing_notes"),
  woNotes: text("wo_notes"),
  status: varchar("status", { length: 30 }).notNull().default('draft'),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  approvalNote: text("approval_note"),
  releasedBy: integer("released_by").references(() => users.id),
  releasedAt: timestamp("released_at"),
  releaseNote: text("release_note"),
  cancelledBy: integer("cancelled_by").references(() => users.id),
  cancelledAt: timestamp("cancelled_at"),
  cancelReason: text("cancel_reason"),
  supersededById: integer("superseded_by_id"),
  supersededAt: timestamp("superseded_at"),
  supersessionReason: text("supersession_reason"),
  sourceBomHeaderId: integer("source_bom_header_id").references(() => epcBomHeaders.id, { onDelete: 'set null' }),
  sourceBomLineId: integer("source_bom_line_id"),
  qualityStatus: varchar("quality_status", { length: 30 }).default('pending_inspection'),
  qualityClearedBy: integer("quality_cleared_by").references(() => users.id),
  qualityClearedAt: timestamp("quality_cleared_at"),
  qualityClearedInspectionId: integer("quality_cleared_inspection_id"),
  qualityFailureReason: text("quality_failure_reason"),
  qualityFailedInspectionId: integer("quality_failed_inspection_id"),
  createdBy: integer("created_by").references(() => users.id),
  createdSourceType: varchar("created_source_type", { length: 20 }).default('manual'),
  createdSourceRef: varchar("created_source_ref", { length: 100 }),
  automationRunId: uuid("automation_run_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const epcWorkOrderItems = pgTable('epc_work_order_items', {
  id: serial("id").primaryKey(),
  epcWorkOrderId: integer("epc_work_order_id").notNull().references(() => epcWorkOrders.id, { onDelete: 'cascade' }),
  lineNumber: integer("line_number").notNull().default(1),
  masterItemId: integer("master_item_id").notNull().references(() => masterItems.id),
  itemCode: varchar("item_code", { length: 100 }),
  itemDescription: text("item_description"),
  itemSpecification: text("item_specification"),
  uom: varchar("uom", { length: 30 }),
  drawingNo: varchar("drawing_no", { length: 100 }),
  drawingRevision: integer("drawing_revision"),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 12, scale: 2 }),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }),
  sourceBomLineId: integer("source_bom_line_id"),
  manufacturingNotes: text("manufacturing_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEpcWorkOrderSchema = createInsertSchema(epcWorkOrders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEpcWorkOrder = z.infer<typeof insertEpcWorkOrderSchema>;
export type EpcWorkOrder = typeof epcWorkOrders.$inferSelect;

export const insertEpcWorkOrderItemSchema = createInsertSchema(epcWorkOrderItems).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEpcWorkOrderItem = z.infer<typeof insertEpcWorkOrderItemSchema>;
export type EpcWorkOrderItem = typeof epcWorkOrderItems.$inferSelect;

export const epcDispatchReadiness = pgTable('epc_dispatch_readiness', {
  id: serial("id").primaryKey(),
  drNumber: varchar("dr_number", { length: 50 }).notNull().unique(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectItemId: integer("project_item_id").notNull().references(() => projectItems.id, { onDelete: 'cascade' }),
  epcPurchaseOrderId: integer("epc_purchase_order_id").references(() => epcPurchaseOrders.id),
  epcWorkOrderId: integer("epc_work_order_id").references(() => epcWorkOrders.id),
  inspectionExecutionId: integer("inspection_execution_id").references(() => inspectionExecutionRecords.id),
  qualityPlanId: integer("quality_plan_id").references(() => qualityPlanningRecords.id),
  masterItemId: integer("master_item_id").notNull().references(() => masterItems.id),
  itemCode: varchar("item_code", { length: 100 }),
  itemDescription: text("item_description"),
  itemSpecification: text("item_specification"),
  uom: varchar("uom", { length: 30 }),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  dispatchQuantity: decimal("dispatch_quantity", { precision: 10, scale: 2 }),
  packagingType: varchar("packaging_type", { length: 50 }),
  packagingNotes: text("packaging_notes"),
  shippingMethod: varchar("shipping_method", { length: 50 }),
  shippingNotes: text("shipping_notes"),
  dispatchNotes: text("dispatch_notes"),
  specialHandling: text("special_handling"),
  destinationAddress: text("destination_address"),
  estimatedDispatchDate: timestamp("estimated_dispatch_date"),
  qualityClearanceDate: timestamp("quality_clearance_date"),
  qualityClearanceReference: text("quality_clearance_reference"),
  sourceType: varchar("source_type", { length: 30 }).notNull().default('purchase_order'),
  status: varchar("status", { length: 30 }).notNull().default('draft'),
  preparedBy: integer("prepared_by").references(() => users.id),
  preparedAt: timestamp("prepared_at"),
  preparationNote: text("preparation_note"),
  readyMarkedBy: integer("ready_marked_by").references(() => users.id),
  readyMarkedAt: timestamp("ready_marked_at"),
  readyNote: text("ready_note"),
  dispatchedBy: integer("dispatched_by").references(() => users.id),
  dispatchedAt: timestamp("dispatched_at"),
  dispatchReference: text("dispatch_reference"),
  cancelledBy: integer("cancelled_by").references(() => users.id),
  cancelledAt: timestamp("cancelled_at"),
  cancelReason: text("cancel_reason"),
  supersededById: integer("superseded_by_id"),
  supersededAt: timestamp("superseded_at"),
  supersessionReason: text("supersession_reason"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEpcDispatchReadinessSchema = createInsertSchema(epcDispatchReadiness).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEpcDispatchReadiness = z.infer<typeof insertEpcDispatchReadinessSchema>;
export type EpcDispatchReadiness = typeof epcDispatchReadiness.$inferSelect;

export const epcDispatchRecords = pgTable('epc_dispatch_records', {
  id: serial("id").primaryKey(),
  dispatchNumber: varchar("dispatch_number", { length: 50 }).notNull().unique(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectItemId: integer("project_item_id").notNull().references(() => projectItems.id, { onDelete: 'cascade' }),
  dispatchReadinessId: integer("dispatch_readiness_id").notNull().references(() => epcDispatchReadiness.id),
  epcPurchaseOrderId: integer("epc_purchase_order_id").references(() => epcPurchaseOrders.id),
  epcWorkOrderId: integer("epc_work_order_id").references(() => epcWorkOrders.id),
  inspectionExecutionId: integer("inspection_execution_id").references(() => inspectionExecutionRecords.id),
  qualityPlanId: integer("quality_plan_id").references(() => qualityPlanningRecords.id),
  masterItemId: integer("master_item_id").notNull().references(() => masterItems.id),
  itemCode: varchar("item_code", { length: 100 }),
  itemDescription: text("item_description"),
  itemSpecification: text("item_specification"),
  uom: varchar("uom", { length: 30 }),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  dispatchQuantity: decimal("dispatch_quantity", { precision: 10, scale: 2 }).notNull(),
  packagingType: varchar("packaging_type", { length: 50 }),
  packagingNotes: text("packaging_notes"),
  shippingMethod: varchar("shipping_method", { length: 50 }),
  shippingNotes: text("shipping_notes"),
  dispatchNotes: text("dispatch_notes"),
  specialHandling: text("special_handling"),
  destinationAddress: text("destination_address"),
  qualityClearanceDate: timestamp("quality_clearance_date"),
  qualityClearanceReference: text("quality_clearance_reference"),
  sourceType: varchar("source_type", { length: 30 }).notNull().default('purchase_order'),
  dispatchDate: timestamp("dispatch_date"),
  transporterName: varchar("transporter_name", { length: 255 }),
  transporterContact: varchar("transporter_contact", { length: 100 }),
  vehicleNumber: varchar("vehicle_number", { length: 100 }),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  lrNumber: varchar("lr_number", { length: 100 }),
  lrDate: timestamp("lr_date"),
  logisticsNotes: text("logistics_notes"),
  deliveryAddress: text("delivery_address"),
  expectedDeliveryDate: timestamp("expected_delivery_date"),
  actualDeliveryDate: timestamp("actual_delivery_date"),
  deliveryConfirmedBy: integer("delivery_confirmed_by").references(() => users.id),
  deliveryNote: text("delivery_note"),
  status: varchar("status", { length: 30 }).notNull().default('draft'),
  confirmedBy: integer("confirmed_by").references(() => users.id),
  confirmedAt: timestamp("confirmed_at"),
  confirmationNote: text("confirmation_note"),
  shippedBy: integer("shipped_by").references(() => users.id),
  shippedAt: timestamp("shipped_at"),
  shipmentNote: text("shipment_note"),
  deliveredBy: integer("delivered_by").references(() => users.id),
  deliveredAt: timestamp("delivered_at"),
  cancelledBy: integer("cancelled_by").references(() => users.id),
  cancelledAt: timestamp("cancelled_at"),
  cancelReason: text("cancel_reason"),
  supersededById: integer("superseded_by_id"),
  supersededAt: timestamp("superseded_at"),
  supersessionReason: text("supersession_reason"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEpcDispatchRecordSchema = createInsertSchema(epcDispatchRecords).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEpcDispatchRecord = z.infer<typeof insertEpcDispatchRecordSchema>;
export type EpcDispatchRecord = typeof epcDispatchRecords.$inferSelect;

export const epcCommissioningReadiness = pgTable('epc_commissioning_readiness', {
  id: serial("id").primaryKey(),
  crNumber: varchar("cr_number", { length: 50 }).notNull().unique(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectItemId: integer("project_item_id").notNull().references(() => projectItems.id, { onDelete: 'cascade' }),
  dispatchRecordId: integer("dispatch_record_id").notNull().references(() => epcDispatchRecords.id),
  dispatchReadinessId: integer("dispatch_readiness_id").references(() => epcDispatchReadiness.id),
  epcPurchaseOrderId: integer("epc_purchase_order_id").references(() => epcPurchaseOrders.id),
  epcWorkOrderId: integer("epc_work_order_id").references(() => epcWorkOrders.id),
  inspectionExecutionId: integer("inspection_execution_id").references(() => inspectionExecutionRecords.id),
  qualityPlanId: integer("quality_plan_id").references(() => qualityPlanningRecords.id),
  masterItemId: integer("master_item_id").notNull().references(() => masterItems.id),
  itemCode: varchar("item_code", { length: 100 }),
  itemDescription: text("item_description"),
  itemSpecification: text("item_specification"),
  uom: varchar("uom", { length: 30 }),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  dispatchNumber: varchar("dispatch_number", { length: 50 }),
  dispatchDate: timestamp("dispatch_date"),
  deliveryDate: timestamp("delivery_date"),
  siteName: varchar("site_name", { length: 255 }),
  siteAddress: text("site_address"),
  siteContactPerson: varchar("site_contact_person", { length: 255 }),
  siteContactPhone: varchar("site_contact_phone", { length: 100 }),
  siteReadinessConfirmed: boolean("site_readiness_confirmed").default(false),
  siteReadinessNote: text("site_readiness_note"),
  installationRequired: boolean("installation_required").default(true),
  installationNotes: text("installation_notes"),
  utilitiesConfirmed: boolean("utilities_confirmed").default(false),
  utilitiesNote: text("utilities_note"),
  documentationComplete: boolean("documentation_complete").default(false),
  documentationNote: text("documentation_note"),
  testCertificatesAvailable: boolean("test_certificates_available").default(false),
  warrantyDocumentsAvailable: boolean("warranty_documents_available").default(false),
  operationManualAvailable: boolean("operation_manual_available").default(false),
  sparePartsListAvailable: boolean("spare_parts_list_available").default(false),
  trainingRequired: boolean("training_required").default(false),
  trainingNotes: text("training_notes"),
  commissioningNotes: text("commissioning_notes"),
  handoverNotes: text("handover_notes"),
  qualityClearanceReference: text("quality_clearance_reference"),
  sourceType: varchar("source_type", { length: 30 }).notNull().default('purchase_order'),
  status: varchar("status", { length: 30 }).notNull().default('draft'),
  preparedBy: integer("prepared_by").references(() => users.id),
  preparedAt: timestamp("prepared_at"),
  preparationNote: text("preparation_note"),
  readyMarkedBy: integer("ready_marked_by").references(() => users.id),
  readyMarkedAt: timestamp("ready_marked_at"),
  readyNote: text("ready_note"),
  commissionedBy: integer("commissioned_by").references(() => users.id),
  commissionedAt: timestamp("commissioned_at"),
  commissioningNote: text("commissioning_note"),
  commissioningDate: timestamp("commissioning_date"),
  handedOverBy: integer("handed_over_by").references(() => users.id),
  handedOverAt: timestamp("handed_over_at"),
  handoverDate: timestamp("handover_date"),
  handoverAcceptedBy: varchar("handover_accepted_by", { length: 255 }),
  handoverAcceptanceNote: text("handover_acceptance_note"),
  cancelledBy: integer("cancelled_by").references(() => users.id),
  cancelledAt: timestamp("cancelled_at"),
  cancelReason: text("cancel_reason"),
  supersededById: integer("superseded_by_id"),
  supersededAt: timestamp("superseded_at"),
  supersessionReason: text("supersession_reason"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEpcCommissioningReadinessSchema = createInsertSchema(epcCommissioningReadiness).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEpcCommissioningReadiness = z.infer<typeof insertEpcCommissioningReadinessSchema>;
export type EpcCommissioningReadiness = typeof epcCommissioningReadiness.$inferSelect;

export const epcBillingReadiness = pgTable('epc_billing_readiness', {
  id: serial("id").primaryKey(),
  brNumber: varchar("br_number", { length: 50 }).notNull().unique(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectItemId: integer("project_item_id").references(() => projectItems.id, { onDelete: 'cascade' }),
  dispatchRecordId: integer("dispatch_record_id").references(() => epcDispatchRecords.id),
  commissioningReadinessId: integer("commissioning_readiness_id").references(() => epcCommissioningReadiness.id),
  dispatchReadinessId: integer("dispatch_readiness_id").references(() => epcDispatchReadiness.id),
  epcPurchaseOrderId: integer("epc_purchase_order_id").references(() => epcPurchaseOrders.id),
  epcWorkOrderId: integer("epc_work_order_id").references(() => epcWorkOrders.id),
  inspectionExecutionId: integer("inspection_execution_id").references(() => inspectionExecutionRecords.id),
  qualityPlanId: integer("quality_plan_id").references(() => qualityPlanningRecords.id),
  masterItemId: integer("master_item_id").references(() => masterItems.id),
  billingBasis: varchar("billing_basis", { length: 30 }).notNull().default('dispatch'),
  milestoneName: varchar("milestone_name", { length: 255 }),
  milestoneDescription: text("milestone_description"),
  itemCode: varchar("item_code", { length: 100 }),
  itemDescription: text("item_description"),
  itemSpecification: text("item_specification"),
  uom: varchar("uom", { length: 30 }),
  quantity: decimal("quantity", { precision: 10, scale: 2 }),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default('INR'),
  taxApplicable: boolean("tax_applicable").default(true),
  taxPercentage: decimal("tax_percentage", { precision: 5, scale: 2 }),
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }),
  grossAmount: decimal("gross_amount", { precision: 15, scale: 2 }),
  dispatchNumber: varchar("dispatch_number", { length: 50 }),
  dispatchDate: timestamp("dispatch_date"),
  deliveryDate: timestamp("delivery_date"),
  crNumber: varchar("cr_number", { length: 50 }),
  commissioningDate: timestamp("commissioning_date"),
  handoverDate: timestamp("handover_date"),
  customerName: varchar("customer_name", { length: 255 }),
  customerAddress: text("customer_address"),
  customerGst: varchar("customer_gst", { length: 50 }),
  customerPoNumber: varchar("customer_po_number", { length: 100 }),
  customerPoDate: timestamp("customer_po_date"),
  billingAddress: text("billing_address"),
  shippingAddress: text("shipping_address"),
  billingNotes: text("billing_notes"),
  exceptionNotes: text("exception_notes"),
  supportingDocuments: text("supporting_documents"),
  sourceType: varchar("source_type", { length: 30 }).notNull().default('purchase_order'),
  status: varchar("status", { length: 30 }).notNull().default('draft'),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNote: text("review_note"),
  readyMarkedBy: integer("ready_marked_by").references(() => users.id),
  readyMarkedAt: timestamp("ready_marked_at"),
  readyNote: text("ready_note"),
  invoicedBy: integer("invoiced_by").references(() => users.id),
  invoicedAt: timestamp("invoiced_at"),
  invoiceReference: varchar("invoice_reference", { length: 100 }),
  invoiceNote: text("invoice_note"),
  cancelledBy: integer("cancelled_by").references(() => users.id),
  cancelledAt: timestamp("cancelled_at"),
  cancelReason: text("cancel_reason"),
  supersededById: integer("superseded_by_id"),
  supersededAt: timestamp("superseded_at"),
  supersessionReason: text("supersession_reason"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEpcBillingReadinessSchema = createInsertSchema(epcBillingReadiness).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEpcBillingReadiness = z.infer<typeof insertEpcBillingReadinessSchema>;
export type EpcBillingReadiness = typeof epcBillingReadiness.$inferSelect;

export const epcInvoices = pgTable('epc_invoices', {
  id: serial("id").primaryKey(),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull().unique(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectItemId: integer("project_item_id").references(() => projectItems.id, { onDelete: 'cascade' }),
  billingReadinessId: integer("billing_readiness_id").notNull().references(() => epcBillingReadiness.id),
  dispatchRecordId: integer("dispatch_record_id").references(() => epcDispatchRecords.id),
  commissioningReadinessId: integer("commissioning_readiness_id").references(() => epcCommissioningReadiness.id),
  dispatchReadinessId: integer("dispatch_readiness_id").references(() => epcDispatchReadiness.id),
  epcPurchaseOrderId: integer("epc_purchase_order_id").references(() => epcPurchaseOrders.id),
  epcWorkOrderId: integer("epc_work_order_id").references(() => epcWorkOrders.id),
  inspectionExecutionId: integer("inspection_execution_id").references(() => inspectionExecutionRecords.id),
  qualityPlanId: integer("quality_plan_id").references(() => qualityPlanningRecords.id),
  masterItemId: integer("master_item_id").references(() => masterItems.id),
  billingBasis: varchar("billing_basis", { length: 30 }).notNull(),
  milestoneName: varchar("milestone_name", { length: 255 }),
  milestoneDescription: text("milestone_description"),
  itemCode: varchar("item_code", { length: 100 }),
  itemDescription: text("item_description"),
  itemSpecification: text("item_specification"),
  uom: varchar("uom", { length: 30 }),
  quantity: decimal("quantity", { precision: 10, scale: 2 }),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default('INR'),
  taxApplicable: boolean("tax_applicable").default(true),
  taxPercentage: decimal("tax_percentage", { precision: 5, scale: 2 }),
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }),
  grossAmount: decimal("gross_amount", { precision: 15, scale: 2 }).notNull(),
  amountPaid: decimal("amount_paid", { precision: 15, scale: 2 }).default('0'),
  amountOutstanding: decimal("amount_outstanding", { precision: 15, scale: 2 }),
  discountAmount: decimal("discount_amount", { precision: 15, scale: 2 }).default('0'),
  discountNote: text("discount_note"),
  customerName: varchar("customer_name", { length: 255 }),
  customerAddress: text("customer_address"),
  customerGst: varchar("customer_gst", { length: 50 }),
  customerPoNumber: varchar("customer_po_number", { length: 100 }),
  customerPoDate: timestamp("customer_po_date"),
  billingAddress: text("billing_address"),
  shippingAddress: text("shipping_address"),
  dispatchNumber: varchar("dispatch_number", { length: 50 }),
  dispatchDate: timestamp("dispatch_date"),
  deliveryDate: timestamp("delivery_date"),
  crNumber: varchar("cr_number", { length: 50 }),
  commissioningDate: timestamp("commissioning_date"),
  handoverDate: timestamp("handover_date"),
  brNumber: varchar("br_number", { length: 50 }),
  invoiceDate: timestamp("invoice_date").notNull().defaultNow(),
  dueDate: timestamp("due_date"),
  paymentTerms: varchar("payment_terms", { length: 255 }),
  invoiceNotes: text("invoice_notes"),
  internalNotes: text("internal_notes"),
  sourceType: varchar("source_type", { length: 30 }).notNull().default('purchase_order'),
  status: varchar("status", { length: 30 }).notNull().default('draft'),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  approvalNote: text("approval_note"),
  issuedBy: integer("issued_by").references(() => users.id),
  issuedAt: timestamp("issued_at"),
  issueNote: text("issue_note"),
  cancelledBy: integer("cancelled_by").references(() => users.id),
  cancelledAt: timestamp("cancelled_at"),
  cancelReason: text("cancel_reason"),
  supersededById: integer("superseded_by_id"),
  supersededAt: timestamp("superseded_at"),
  supersessionReason: text("supersession_reason"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEpcInvoiceSchema = createInsertSchema(epcInvoices).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEpcInvoice = z.infer<typeof insertEpcInvoiceSchema>;
export type EpcInvoice = typeof epcInvoices.$inferSelect;

export const epcDrawingControls = pgTable('epc_drawing_controls', {
  id: serial('id').primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectItemId: integer("project_item_id").references(() => projectItems.id, { onDelete: 'cascade' }),
  masterItemId: integer("master_item_id").references(() => masterItems.id),
  designDrawingId: integer("design_drawing_id").references(() => designDrawings.id, { onDelete: 'set null' }),
  legacyMetadata: jsonb("legacy_metadata"),
  dwgControlNumber: varchar("dwg_control_number", { length: 35 }).notNull(),
  revisionCode: varchar("revision_code", { length: 5 }).notNull().default('A'),
  isCurrent: boolean("is_current").notNull().default(true),
  revisionStatus: varchar("revision_status", { length: 20 }).notNull().default('draft'),
  supersedesId: integer("supersedes_id"),
  drawingNumber: varchar("drawing_number", { length: 100 }),
  drawingTitle: varchar("drawing_title", { length: 255 }),
  drawingRevision: varchar("drawing_revision", { length: 20 }),
  drawingCategory: varchar("drawing_category", { length: 50 }),
  disciplineCode: varchar("discipline_code", { length: 50 }),
  itemCode: varchar("item_code", { length: 100 }),
  itemDescription: text("item_description"),
  classificationSnapshot: varchar("classification_snapshot", { length: 20 }),
  drawingPurpose: varchar("drawing_purpose", { length: 30 }).notNull().default('general'),
  status: varchar("status", { length: 30 }).notNull().default('draft'),
  releasedForProcurement: boolean("released_for_procurement").notNull().default(false),
  releasedForProcurementAt: timestamp("released_for_procurement_at"),
  releasedForProcurementBy: integer("released_for_procurement_by").references(() => users.id),
  releasedForManufacturing: boolean("released_for_manufacturing").notNull().default(false),
  releasedForManufacturingAt: timestamp("released_for_manufacturing_at"),
  releasedForManufacturingBy: integer("released_for_manufacturing_by").references(() => users.id),
  procurementReleaseRequired: boolean("procurement_release_required").notNull().default(false),
  manufacturingReleaseRequired: boolean("manufacturing_release_required").notNull().default(false),
  clientApprovalRequired: boolean("client_approval_required").notNull().default(false),
  clientApprovalStatus: varchar("client_approval_status", { length: 30 }).default('not_required'),
  clientApprovedAt: timestamp("client_approved_at"),
  clientApprovedBy: text("client_approved_by"),
  clientApprovalNotes: text("client_approval_notes"),
  submittedBy: integer("submitted_by").references(() => users.id),
  submittedAt: timestamp("submitted_at"),
  submissionNote: text("submission_note"),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNote: text("review_note"),
  reviewRecommendation: varchar("review_recommendation", { length: 30 }),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  approvalNote: text("approval_note"),
  releasedBy: integer("released_by").references(() => users.id),
  releasedAt: timestamp("released_at"),
  releaseNote: text("release_note"),
  supersededBy: integer("superseded_by"),
  supersededAt: timestamp("superseded_at"),
  supersessionReason: text("supersession_reason"),
  cancelledBy: integer("cancelled_by").references(() => users.id),
  cancelledAt: timestamp("cancelled_at"),
  cancelReason: text("cancel_reason"),
  notes: text("notes"),
  gcsObjectPath: text("gcs_object_path"),
  fileName: text("file_name"),
  fileSize: integer("file_size"),
  checksumSha256: text("checksum_sha256"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  structuredAt: timestamp("structured_at"),
});

export const insertEpcDrawingControlSchema = createInsertSchema(epcDrawingControls).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEpcDrawingControl = z.infer<typeof insertEpcDrawingControlSchema>;
export type EpcDrawingControl = typeof epcDrawingControls.$inferSelect;

export const epcBomHeaders = pgTable('epc_bom_headers', {
  id: serial('id').primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectItemId: integer("project_item_id").notNull().references(() => projectItems.id, { onDelete: 'cascade' }),
  masterItemId: integer("master_item_id").notNull().references(() => masterItems.id),
  drawingControlId: integer("drawing_control_id").references(() => epcDrawingControls.id, { onDelete: 'set null' }),
  bomNumber: varchar("bom_number", { length: 35 }).notNull(),
  revisionCode: varchar("revision_code", { length: 5 }).notNull().default('A'),
  isCurrent: boolean("is_current").notNull().default(true),
  revisionStatus: varchar("revision_status", { length: 20 }).notNull().default('draft'),
  supersedesId: integer("supersedes_id"),
  bomRevision: varchar("bom_revision", { length: 20 }).notNull().default('A'),
  bomType: varchar("bom_type", { length: 30 }).notNull().default('assembly'),
  bomTitle: varchar("bom_title", { length: 255 }),
  bomDescription: text("bom_description"),
  itemCode: varchar("item_code", { length: 100 }),
  itemDescription: text("item_description"),
  classificationSnapshot: varchar("classification_snapshot", { length: 20 }),
  drawingNumber: varchar("drawing_number", { length: 100 }),
  drawingRevision: varchar("drawing_revision", { length: 20 }),
  totalLineCount: integer("total_line_count").notNull().default(0),
  totalEstimatedCost: decimal("total_estimated_cost", { precision: 14, scale: 2 }),
  status: varchar("status", { length: 30 }).notNull().default('draft'),
  submittedBy: integer("submitted_by").references(() => users.id),
  submittedAt: timestamp("submitted_at"),
  submissionNote: text("submission_note"),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNote: text("review_note"),
  reviewRecommendation: varchar("review_recommendation", { length: 30 }),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  approvalNote: text("approval_note"),
  releasedBy: integer("released_by").references(() => users.id),
  releasedAt: timestamp("released_at"),
  releaseNote: text("release_note"),
  supersededBy: integer("superseded_by"),
  supersededAt: timestamp("superseded_at"),
  supersessionReason: text("supersession_reason"),
  cancelledBy: integer("cancelled_by").references(() => users.id),
  cancelledAt: timestamp("cancelled_at"),
  cancelReason: text("cancel_reason"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEpcBomHeaderSchema = createInsertSchema(epcBomHeaders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEpcBomHeader = z.infer<typeof insertEpcBomHeaderSchema>;
export type EpcBomHeader = typeof epcBomHeaders.$inferSelect;

export const epcBomLines = pgTable('epc_bom_lines', {
  id: serial('id').primaryKey(),
  bomHeaderId: integer("bom_header_id").notNull().references(() => epcBomHeaders.id, { onDelete: 'cascade' }),
  lineNumber: integer("line_number").notNull(),
  componentItemId: integer("component_item_id").notNull().references(() => masterItems.id),
  componentItemCode: varchar("component_item_code", { length: 100 }),
  componentDescription: text("component_description"),
  componentSpecification: text("component_specification"),
  componentUom: varchar("component_uom", { length: 30 }),
  componentMakeOrBuy: varchar("component_make_or_buy", { length: 20 }),
  quantityPerUnit: decimal("quantity_per_unit", { precision: 10, scale: 2 }).notNull().default('1'),
  componentDrawingNo: varchar("component_drawing_no", { length: 100 }),
  estimatedUnitCost: decimal("estimated_unit_cost", { precision: 12, scale: 2 }),
  estimatedTotalCost: decimal("estimated_total_cost", { precision: 14, scale: 2 }),
  procurementLeadTimeDays: integer("procurement_lead_time_days"),
  preferredVendor: varchar("preferred_vendor", { length: 255 }),
  planningRequired: boolean("planning_required").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEpcBomLineSchema = createInsertSchema(epcBomLines).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEpcBomLine = z.infer<typeof insertEpcBomLineSchema>;
export type EpcBomLine = typeof epcBomLines.$inferSelect;

export const bomExplosionLogs = pgTable('bom_explosion_logs', {
  id: serial('id').primaryKey(),
  bomHeaderId: integer("bom_header_id").notNull(),
  bomLineId: integer("bom_line_id").notNull(),
  projectItemId: integer("project_item_id"),
  planningRecordId: integer("planning_record_id"),
  componentItemId: integer("component_item_id").notNull(),
  classificationUsed: varchar("classification_used", { length: 20 }),
  quantityComputed: decimal("quantity_computed", { precision: 12, scale: 2 }),
  status: varchar("status", { length: 20 }).notNull().default('created'),
  explodedBy: integer("exploded_by"),
  explodedAt: timestamp("exploded_at").notNull().defaultNow(),
  supersededAt: timestamp("superseded_at"),
  notes: text("notes"),
  itemCode: varchar('item_code', { length: 100 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBomExplosionLogSchema = createInsertSchema(bomExplosionLogs).omit({ id: true, createdAt: true });
export type InsertBomExplosionLog = z.infer<typeof insertBomExplosionLogSchema>;
export type BomExplosionLog = typeof bomExplosionLogs.$inferSelect;

export const epcAgentFindings = pgTable('epc_agent_findings', {
  id: serial('id').primaryKey(),
  fingerprint: varchar("fingerprint", { length: 255 }).notNull().unique(),
  projectId: integer("project_id"),
  projectItemId: integer("project_item_id"),
  findingCode: varchar("finding_code", { length: 20 }).notNull(),
  agentKey: varchar("agent_key", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default('active'),
  severity: varchar("severity", { length: 20 }).notNull().default('warning'),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: integer("entity_id"),
  firstDetectedAt: timestamp("first_detected_at").notNull().defaultNow(),
  lastDetectedAt: timestamp("last_detected_at").notNull().defaultNow(),
  lastAlertedAt: timestamp("last_alerted_at"),
  lastTaskCreatedAt: timestamp("last_task_created_at"),
  resolvedAt: timestamp("resolved_at"),
  cooldownHours: integer("cooldown_hours").notNull().default(24),
  metadata: jsonb("metadata"),
  itemCode: varchar('item_code', { length: 100 }),
});

export const insertEpcAgentFindingSchema = createInsertSchema(epcAgentFindings).omit({ id: true, firstDetectedAt: true, lastDetectedAt: true });
export type InsertEpcAgentFinding = z.infer<typeof insertEpcAgentFindingSchema>;
export type EpcAgentFinding = typeof epcAgentFindings.$inferSelect;

export const epcDocumentAttachments = pgTable('epc_document_attachments', {
  id: serial('id').primaryKey(),
  parentEntityType: varchar('parent_entity_type', { length: 30 }).notNull(),
  parentEntityId: integer('parent_entity_id').notNull(),
  projectId: integer('project_id').notNull().references(() => projects.id),
  docType: varchar('doc_type', { length: 3 }).notNull(),
  documentNumber: varchar('document_number', { length: 40 }).notNull(),
  isRevisionControlled: boolean('is_revision_controlled').notNull().default(false),
  revisionCode: varchar('revision_code', { length: 4 }),
  attachmentLabel: varchar('attachment_label', { length: 100 }).notNull(),
  attachmentSeq: integer('attachment_seq').notNull().default(1),
  gcsBucket: varchar('gcs_bucket', { length: 100 }).notNull().default('thermopac_storage'),
  gcsObjectPath: varchar('gcs_object_path', { length: 500 }).notNull(),
  originalFileName: varchar('original_file_name', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).notNull(),
  checksumSha256: varchar('checksum_sha256', { length: 64 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  isCurrent: boolean('is_current').notNull().default(true),
  uploadedBy: integer('uploaded_by').notNull().references(() => users.id),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  supersededAt: timestamp('superseded_at', { withTimezone: true }),
  supersededBy: integer('superseded_by').references(() => users.id),
  withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  withdrawnBy: integer('withdrawn_by').references(() => users.id),
  withdrawReason: text('withdraw_reason'),
  itemCode: varchar('item_code', { length: 100 }),
});

export const insertEpcDocumentAttachmentSchema = createInsertSchema(epcDocumentAttachments).omit({ id: true, uploadedAt: true });
export type InsertEpcDocumentAttachment = z.infer<typeof insertEpcDocumentAttachmentSchema>;
export type EpcDocumentAttachment = typeof epcDocumentAttachments.$inferSelect;

export const epcDocumentAccessLog = pgTable('epc_document_access_log', {
  id: serial('id').primaryKey(),
  attachmentId: integer('attachment_id').notNull().references(() => epcDocumentAttachments.id),
  documentNumber: varchar('document_number', { length: 40 }).notNull(),
  revisionCode: varchar('revision_code', { length: 4 }),
  docType: varchar('doc_type', { length: 3 }).notNull(),
  projectId: integer('project_id').notNull(),
  action: varchar('action', { length: 20 }).notNull(),
  accessedBy: integer('accessed_by').notNull().references(() => users.id),
  accessedAt: timestamp('accessed_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: varchar('user_agent', { length: 500 }),
});

export const insertEpcDocumentAccessLogSchema = createInsertSchema(epcDocumentAccessLog).omit({ id: true, accessedAt: true });
export type InsertEpcDocumentAccessLog = z.infer<typeof insertEpcDocumentAccessLogSchema>;
export type EpcDocumentAccessLog = typeof epcDocumentAccessLog.$inferSelect;

export const legacyFileAccessLog = pgTable('legacy_file_access_log', {
  id: serial('id').primaryKey(),
  legacyPath: varchar('legacy_path', { length: 500 }).notNull(),
  pathFamily: varchar('path_family', { length: 20 }).notNull(),
  projectId: integer('project_id'),
  accessedBy: integer('accessed_by').notNull().references(() => users.id),
  accessedAt: timestamp('accessed_at', { withTimezone: true }).notNull().defaultNow(),
  action: varchar('action', { length: 20 }).notNull().default('download'),
  migratedToEpc: boolean('migrated_to_epc').notNull().default(false),
  epcAttachmentId: integer('epc_attachment_id'),
});

export const insertLegacyFileAccessLogSchema = createInsertSchema(legacyFileAccessLog).omit({ id: true, accessedAt: true });
export type InsertLegacyFileAccessLog = z.infer<typeof insertLegacyFileAccessLogSchema>;
export type LegacyFileAccessLog = typeof legacyFileAccessLog.$inferSelect;

export const epcMigrationFeatureFlags = pgTable('epc_migration_feature_flags', {
  id: serial('id').primaryKey(),
  flagName: varchar('flag_name', { length: 100 }).notNull().unique(),
  enabled: boolean('enabled').notNull().default(false),
  description: text('description'),
  updatedBy: integer('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type EpcMigrationFeatureFlag = typeof epcMigrationFeatureFlags.$inferSelect;

export const qmsDocumentRevisions = pgTable('qms_document_revisions', {
  id: serial('id').primaryKey(),
  module: varchar('module', { length: 30 }).notNull(),
  documentNumber: varchar('document_number', { length: 100 }).notNull(),
  revisionNumber: integer('revision_number').notNull().default(1),
  sequence: integer('sequence').notNull().default(1),
  label: varchar('label', { length: 100 }).notNull(),
  fileExtension: varchar('file_extension', { length: 20 }).notNull(),
  gcsPath: varchar('gcs_path', { length: 500 }).notNull(),
  checksumSha256: varchar('checksum_sha256', { length: 64 }).notNull(),
  fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).notNull().default(0),
  originalFileName: varchar('original_file_name', { length: 255 }),
  contentType: varchar('content_type', { length: 100 }),
  isLatest: boolean('is_latest').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  parentEntityType: varchar('parent_entity_type', { length: 50 }).notNull(),
  parentEntityId: integer('parent_entity_id').notNull(),
  revisionOf: integer('revision_of'),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  deletedBy: integer('deleted_by').references(() => users.id),
  deletedAt: timestamp('deleted_at'),
  deleteReason: text('delete_reason'),
});

export const qmsDocumentRevisionsRelations = relations(qmsDocumentRevisions, ({ one }) => ({
  creator: one(users, { fields: [qmsDocumentRevisions.createdBy], references: [users.id] }),
  deleter: one(users, { fields: [qmsDocumentRevisions.deletedBy], references: [users.id] }),
}));

export type QmsDocumentRevision = typeof qmsDocumentRevisions.$inferSelect;
export type InsertQmsDocumentRevision = typeof qmsDocumentRevisions.$inferInsert;

export const qmsDocumentAuditLog = pgTable('qms_document_audit_log', {
  id: serial('id').primaryKey(),
  module: varchar('module', { length: 30 }).notNull(),
  documentNumber: varchar('document_number', { length: 100 }).notNull(),
  revisionId: integer('revision_id'),
  action: varchar('action', { length: 30 }).notNull(),
  gcsPath: varchar('gcs_path', { length: 500 }),
  userId: integer('user_id').notNull().references(() => users.id),
  userRole: varchar('user_role', { length: 50 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  details: jsonb('details'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type QmsDocumentAuditLog = typeof qmsDocumentAuditLog.$inferSelect;

export const bomGatingBypassLog = pgTable('bom_gating_bypass_log', {
  id: serial('id').primaryKey(),
  documentType: varchar('document_type', { length: 10 }).notNull(),
  documentId: integer('document_id').notNull(),
  documentNumber: varchar('document_number', { length: 100 }).notNull(),
  projectId: integer('project_id').notNull(),
  projectItemId: integer('project_item_id').notNull(),
  reason: varchar('reason', { length: 50 }).notNull().default('no_bom_exists'),
  itemCode: varchar('item_code', { length: 100 }),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type BomGatingBypassLog = typeof bomGatingBypassLog.$inferSelect;

export const VALID_PROJECT_ITEM_SOURCES = ['sales_offer', 'sales_offer_custom', 'manual', 'bom_explosion', 'buy_list'] as const;
export type ProjectItemSource = typeof VALID_PROJECT_ITEM_SOURCES[number];

/** Named constants for project item source — use these instead of inline string literals. */
export const PROJECT_ITEM_SOURCES = {
  SALES_OFFER:        'sales_offer',        // Catalogue line from Products picker
  SALES_OFFER_CUSTOM: 'sales_offer_custom', // Custom line — no product_code
  MANUAL:             'manual',
  BOM_EXPLOSION:      'bom_explosion',
  BUY_LIST:           'buy_list',
} as const satisfies Record<string, ProjectItemSource>;

export const offerConversionSnapshots = pgTable('offer_conversion_snapshots', {
  id: serial('id').primaryKey(),
  conversionId: uuid('conversion_id').notNull().unique(),
  offerId: integer('offer_id').notNull().references(() => offers.id).unique(),
  offerRevision: integer('offer_revision').notNull(),
  orderNumber: varchar('order_number', { length: 15 }).notNull().unique(),
  headerSnapshot: jsonb('header_snapshot').notNull(),
  itemsSnapshot: jsonb('items_snapshot').notNull(),
  epcParamsSnapshot: jsonb('epc_params_snapshot').notNull(),
  projectId: integer('project_id').references(() => projects.id),
  conversionStatus: varchar('conversion_status', { length: 20 }).notNull().default('initiated'),
  errorDetail: text('error_detail'),
  convertedBy: integer('converted_by').notNull().references(() => users.id),
  convertedAt: timestamp('converted_at').notNull().defaultNow(),
  finalOfferGcsPath: text('final_offer_gcs_path'),
  finalOfferMirrorStatus: varchar('final_offer_mirror_status', { length: 20 }),
  finalOfferMirrorJobId: integer('final_offer_mirror_job_id'),
});

export const insertOfferConversionSnapshotSchema = createInsertSchema(offerConversionSnapshots).omit({ id: true });
export type OfferConversionSnapshot = typeof offerConversionSnapshots.$inferSelect;
export type InsertOfferConversionSnapshot = z.infer<typeof insertOfferConversionSnapshotSchema>;

// ── Offer Archive Revisions ────────────────────────────────────────────────────
// One row per archive transaction (create or update). Three quotation_pdf_artifacts
// rows are children of each revision (combined / breakup / technical).
export const offerArchiveRevisions = pgTable('offer_archive_revisions', {
  id:          serial('id').primaryKey(),
  offerId:     integer('offer_id').notNull().references(() => offers.id),
  revision:    integer('revision').notNull(),
  actionType:  varchar('action_type', { length: 10 }).notNull(),
  status:      varchar('status', { length: 20 }).notNull().default('archiving'),
  archivedBy:  integer('archived_by').references(() => users.id),
  archivedAt:  timestamp('archived_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  errorDetail: text('error_detail'),
});

export const insertOfferArchiveRevisionSchema = createInsertSchema(offerArchiveRevisions).omit({ id: true, archivedAt: true });
export type OfferArchiveRevision = typeof offerArchiveRevisions.$inferSelect;
export type InsertOfferArchiveRevision = z.infer<typeof insertOfferArchiveRevisionSchema>;

export const quotationPdfArtifacts = pgTable('quotation_pdf_artifacts', {
  id: serial('id').primaryKey(),
  offerId: integer('offer_id').notNull().references(() => offers.id),
  revision: integer('revision').notNull(),
  priceMode: varchar('price_mode', { length: 20 }).notNull(),
  gcsBucket: varchar('gcs_bucket', { length: 100 }).notNull().default('thermopac_storage'),
  gcsObjectPath: varchar('gcs_object_path', { length: 500 }).notNull().unique(),
  checksumSha256: varchar('checksum_sha256', { length: 64 }).notNull(),
  fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).notNull(),
  artifactStatus: varchar('artifact_status', { length: 20 }).notNull().default('active'),
  isConfirmed: boolean('is_confirmed').notNull().default(false),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  epcAttachmentStatus: varchar('epc_attachment_status', { length: 20 }),
  epcAttachmentId: integer('epc_attachment_id').references(() => epcDocumentAttachments.id),
  epcAttachmentError: text('epc_attachment_error'),
  archiveRevisionId: integer('archive_revision_id').references(() => offerArchiveRevisions.id),
  actionType: varchar('action_type', { length: 10 }),
  generatedBy: integer('generated_by').notNull().references(() => users.id),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const insertQuotationPdfArtifactSchema = createInsertSchema(quotationPdfArtifacts).omit({ id: true, generatedAt: true });
export type QuotationPdfArtifact = typeof quotationPdfArtifacts.$inferSelect;
export type InsertQuotationPdfArtifact = z.infer<typeof insertQuotationPdfArtifactSchema>;

export const commercialChangeOrders = pgTable('commercial_change_orders', {
  id: serial('id').primaryKey(),
  changeOrderNumber: varchar('change_order_number', { length: 30 }).notNull().unique(),
  sequence: integer('sequence').notNull(),
  originalOfferId: integer('original_offer_id').notNull().references(() => offers.id),
  originalOrderNumber: varchar('original_order_number', { length: 15 }).notNull(),
  projectId: integer('project_id').notNull().references(() => projects.id),
  revisedOfferId: integer('revised_offer_id').references(() => offers.id),
  ecrId: integer('ecr_id'),
  changeType: varchar('change_type', { length: 30 }).notNull(),
  description: text('description').notNull(),
  changeValue: numeric('change_value', { precision: 15, scale: 2 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  requestedBy: integer('requested_by').notNull().references(() => users.id),
  approvedBy: integer('approved_by').references(() => users.id),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  notes: text('notes'),
});

export const insertCommercialChangeOrderSchema = createInsertSchema(commercialChangeOrders).omit({ id: true, requestedAt: true });
export type CommercialChangeOrder = typeof commercialChangeOrders.$inferSelect;
export type InsertCommercialChangeOrder = z.infer<typeof insertCommercialChangeOrderSchema>;

export const epcDocTypes = pgTable('epc_doc_types', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  folderCode: text('folder_code').unique(),
  allowedExtensions: text('allowed_extensions').array().notNull(),
  uploadMode: text('upload_mode').notNull().default('single'),
  maxFileSizeMb: integer('max_file_size_mb').notNull().default(50),
  isSlot: boolean('is_slot').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  gcsFolderName: varchar('gcs_folder_name', { length: 80 }),
});

export const insertEpcDocTypeSchema = createInsertSchema(epcDocTypes).omit({ id: true });
export type EpcDocType = typeof epcDocTypes.$inferSelect;
export type InsertEpcDocType = z.infer<typeof insertEpcDocTypeSchema>;

export const epcDocuments = pgTable('epc_documents', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  docType: text('doc_type').notNull(),
  folderCode: text('folder_code'),
  documentNumber: text('document_number'),
  revision: text('revision').notNull().default('00'),
  status: text('status').notNull().default('active'),
  title: text('title').notNull(),
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size'),
  contentType: text('content_type'),
  gcsObjectPath: text('gcs_object_path').notNull(),
  checksumSha256: text('checksum_sha256'),
  seqNumber: integer('seq_number').notNull().default(1),
  uploadedBy: integer('uploaded_by').references(() => users.id),
  uploadedAt: timestamp('uploaded_at').notNull().defaultNow(),
  supersededAt: timestamp('superseded_at'),
  supersededById: integer('superseded_by_id'),
  mirrorStatus: varchar('mirror_status', { length: 20 }).default('pending').notNull(),
  mirrorJobId: integer('mirror_job_id'),
});

export const insertEpcDocumentSchema = createInsertSchema(epcDocuments).omit({ id: true, uploadedAt: true });
export type EpcDocument = typeof epcDocuments.$inferSelect;
export type InsertEpcDocument = z.infer<typeof insertEpcDocumentSchema>;

export const docSequences = pgTable('doc_sequences', {
  id: serial('id').primaryKey(),
  docType: text('doc_type').notNull(),
  fyCode: varchar('fy_code', { length: 4 }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  nextSeq: integer('next_seq').notNull().default(1),
});

export type DocSequence = typeof docSequences.$inferSelect;

export const executionDrafts = pgTable('execution_drafts', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectItemId: integer('project_item_id').notNull().references(() => projectItems.id, { onDelete: 'cascade' }),
  docType: varchar('doc_type', { length: 10 }).notNull(),
  applicable: boolean('applicable').notNull().default(true),
  docNumber: varchar('doc_number', { length: 30 }),
  approvalStatus: varchar('approval_status', { length: 30 }).notNull().default('draft'),
  activationStatus: varchar('activation_status', { length: 30 }).notNull().default('not_activated'),
  generatedBy: varchar('generated_by', { length: 20 }).notNull().default('system'),
  generatedByUserId: integer('generated_by_user_id').references(() => users.id),
  approvedBy: integer('approved_by').references(() => users.id),
  rejectedBy: integer('rejected_by').references(() => users.id),
  rejectionRemarks: text('rejection_remarks'),
  holdRemarks: text('hold_remarks'),
  linkedTaskId: integer('linked_task_id'),
  dependencyDocType: varchar('dependency_doc_type', { length: 10 }),
  dependencyStatus: varchar('dependency_status', { length: 20 }).notNull().default('not_required'),
  sourceData: jsonb('source_data').notNull().default({}),
  activatedEntityId: integer('activated_entity_id'),
  activatedEntityType: varchar('activated_entity_type', { length: 50 }),
  activatedBy: integer('activated_by').references(() => users.id),
  activatedAt: timestamp('activated_at'),
  parentDraftId: integer('parent_draft_id'),
  actualDocNumber: varchar('actual_doc_number', { length: 30 }),
  errorMessage: text('error_message'),
  createdSourceType: varchar('created_source_type', { length: 20 }).default('manual'),
  createdSourceRef: varchar('created_source_ref', { length: 100 }),
  automationRunId: uuid('automation_run_id'),
  itemCode: varchar('item_code', { length: 100 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertExecutionDraftSchema = createInsertSchema(executionDrafts).omit({ id: true, createdAt: true, updatedAt: true });
export type ExecutionDraft = typeof executionDrafts.$inferSelect;
export type InsertExecutionDraft = z.infer<typeof insertExecutionDraftSchema>;

export const epcDrawingOrders = pgTable('epc_drawing_orders', {
  id: serial('id').primaryKey(),
  doNumber: varchar('do_number', { length: 30 }).notNull().unique(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectItemId: integer('project_item_id').notNull().references(() => projectItems.id, { onDelete: 'cascade' }),
  masterItemId: integer('master_item_id').references(() => masterItems.id),
  itemCode: varchar('item_code', { length: 100 }),
  itemDescription: text('item_description'),
  drawingType: varchar('drawing_type', { length: 30 }),
  requiredByDate: timestamp('required_by_date'),
  assignedTo: integer('assigned_to').references(() => users.id),
  status: varchar('status', { length: 30 }).notNull().default('draft'),
  drawingNo: varchar('drawing_no', { length: 100 }),
  revision: varchar('revision', { length: 10 }),
  linkedEcrNumber: varchar('linked_ecr_number', { length: 30 }),
  linkedEcnNumber: varchar('linked_ecn_number', { length: 30 }),
  linkedDwgControlId: integer('linked_dwg_control_id'),
  notes: text('notes'),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdSourceType: varchar('created_source_type', { length: 20 }).default('manual'),
  createdSourceRef: varchar('created_source_ref', { length: 100 }),
  automationRunId: uuid('automation_run_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertEpcDrawingOrderSchema = createInsertSchema(epcDrawingOrders).omit({ id: true, createdAt: true, updatedAt: true });
export type EpcDrawingOrder = typeof epcDrawingOrders.$inferSelect;
export type InsertEpcDrawingOrder = z.infer<typeof insertEpcDrawingOrderSchema>;

export const projectCancellationSnapshots = pgTable('project_cancellation_snapshots', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  module: varchar('module', { length: 100 }).notNull(),
  tableName: varchar('table_name', { length: 100 }).notNull(),
  recordId: integer('record_id').notNull(),
  statusBefore: varchar('status_before', { length: 100 }).notNull(),
  statusAfter: varchar('status_after', { length: 100 }).notNull(),
  keyData: jsonb('key_data').default({}),
  restorationEligible: boolean('restoration_eligible').notNull().default(false),
  restored: boolean('restored').notNull().default(false),
  cancellationType: varchar('cancellation_type', { length: 50 }),
  cancelledAt: timestamp('cancelled_at').defaultNow(),
  restoredAt: timestamp('restored_at'),
});

export type ProjectCancellationSnapshot = typeof projectCancellationSnapshots.$inferSelect;

export const gcsFileIndex = pgTable('gcs_file_index', {
  id: serial('id').primaryKey(),
  bucketName: varchar('bucket_name', { length: 100 }).notNull(),
  filePath: text('file_path').notNull().unique(),
  fileName: text('file_name').notNull(),
  folderPath: text('folder_path').notNull(),
  continentCode: varchar('continent_code', { length: 5 }),
  continentName: varchar('continent_name', { length: 100 }),
  countryCode: varchar('country_code', { length: 5 }),
  countryName: varchar('country_name', { length: 100 }),
  customerCode: varchar('customer_code', { length: 10 }),
  customerName: varchar('customer_name', { length: 255 }),
  fyCode: varchar('fy_code', { length: 10 }),
  fyLabel: varchar('fy_label', { length: 20 }),
  projectCode: varchar('project_code', { length: 50 }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  docType: varchar('doc_type', { length: 20 }),
  revision: varchar('revision', { length: 20 }),
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  contentType: varchar('content_type', { length: 100 }),
  isResolved: boolean('is_resolved').notNull().default(true),
  unresolvedFields: text('unresolved_fields').array(),
  assuranceFlags: text('assurance_flags').array(),
  gcsUpdatedAt: timestamp('gcs_updated_at'),
  lastSyncedAt: timestamp('last_synced_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type GcsFileIndex = typeof gcsFileIndex.$inferSelect;

export const gcsAccessPermissions = pgTable('gcs_access_permissions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  accessLevel: varchar('access_level', { length: 20 }).notNull().default('viewer'),
  grantedBy: integer('granted_by').notNull().references(() => users.id),
  grantedAt: timestamp('granted_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at'),
  isActive: boolean('is_active').notNull().default(true),
  notes: text('notes'),
});

export type GcsAccessPermission = typeof gcsAccessPermissions.$inferSelect;

export const automationPipelineRuns = pgTable('automation_pipeline_runs', {
  id: serial('id').primaryKey(),
  runId: uuid('run_id').notNull().unique(),
  projectId: integer('project_id').notNull().references(() => projects.id),
  status: varchar('status', { length: 30 }).notNull().default('running'),
  currentPhase: integer('current_phase').notNull().default(1),
  currentStep: varchar('current_step', { length: 100 }),
  triggerUserId: integer('trigger_user_id').notNull().references(() => users.id),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  heartbeatAt: timestamp('heartbeat_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  failedAt: timestamp('failed_at'),
  failureStep: varchar('failure_step', { length: 100 }),
  failureMessage: text('failure_message'),
  failureEntityId: integer('failure_entity_id'),
  failureEntityType: varchar('failure_entity_type', { length: 50 }),
  stepResults: jsonb('step_results').notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  parentRunId: uuid('parent_run_id'),
});

export const insertAutomationPipelineRunSchema = createInsertSchema(automationPipelineRuns).omit({ id: true, createdAt: true });
export type AutomationPipelineRun = typeof automationPipelineRuns.$inferSelect;
export type InsertAutomationPipelineRun = z.infer<typeof insertAutomationPipelineRunSchema>;

export const agentUsageLimits = pgTable('agent_usage_limits', {
  id: serial('id').primaryKey(),
  monthlyLimitUnits: numeric('monthly_limit_units', { precision: 10, scale: 2 }).notNull().default('500'),
  dailyLimitUnits: numeric('daily_limit_units', { precision: 10, scale: 2 }).notNull().default('50'),
  softBlockEnabled: boolean('soft_block_enabled').notNull().default(true),
  updatedBy: integer('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgentUsageLimitSchema = createInsertSchema(agentUsageLimits).omit({ id: true, updatedAt: true });
export type AgentUsageLimit = typeof agentUsageLimits.$inferSelect;
export type InsertAgentUsageLimit = z.infer<typeof insertAgentUsageLimitSchema>;

export const agentUsageDailyLog = pgTable('agent_usage_daily_log', {
  id: serial('id').primaryKey(),
  logDate: timestamp('log_date', { withTimezone: true }).notNull(),
  estimatedUnits: numeric('estimated_units', { precision: 10, scale: 2 }).notNull().default('0'),
  estimatedCost: numeric('estimated_cost', { precision: 10, scale: 2 }).notNull().default('0'),
  cumulativeTotal: numeric('cumulative_total', { precision: 10, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  loggedBy: integer('logged_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgentUsageDailyLogSchema = createInsertSchema(agentUsageDailyLog).omit({ id: true, createdAt: true });
export type AgentUsageDailyLog = typeof agentUsageDailyLog.$inferSelect;
export type InsertAgentUsageDailyLog = z.infer<typeof insertAgentUsageDailyLogSchema>;

export const epcAssignmentRules = pgTable('epc_assignment_rules', {
  id: serial('id').primaryKey(),
  workflowCode: text('workflow_code').notNull().unique(),
  stageGate: text('stage_gate').notNull(),
  actionType: text('action_type').notNull(),
  department: text('department').notNull(),
  role: text('role').notNull(),
  fallbackDepartment: text('fallback_department'),
  fallbackRole: text('fallback_role'),
  isActive: boolean('is_active').notNull().default(true),
  description: text('description'),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const insertEpcAssignmentRuleSchema = createInsertSchema(epcAssignmentRules).omit({ id: true, createdAt: true, updatedAt: true });
export type EpcAssignmentRule = typeof epcAssignmentRules.$inferSelect;
export type InsertEpcAssignmentRule = z.infer<typeof insertEpcAssignmentRuleSchema>;

export const epcAssignmentAuditLog = pgTable('epc_assignment_audit_log', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id'),
  workflowCode: text('workflow_code').notNull(),
  stageGate: text('stage_gate').notNull(),
  actionType: text('action_type').notNull(),
  ruleId: integer('rule_id').references(() => epcAssignmentRules.id),
  resolutionMethod: text('resolution_method').notNull(),
  resolvedDepartment: text('resolved_department'),
  resolvedRole: text('resolved_role'),
  resolvedUserId: integer('resolved_user_id'),
  triggeredBy: text('triggered_by'),
  warningMessage: text('warning_message'),
  loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
});

export type EpcAssignmentAuditLog = typeof epcAssignmentAuditLog.$inferSelect;

// ==================== GCS RETENTION: OBJECT DELETIONS ====================

export const gcsObjectDeletions = pgTable('gcs_object_deletions', {
  id: serial('id').primaryKey(),
  gcsBucket: text('gcs_bucket').notNull(),
  gcsObjectPath: text('gcs_object_path').notNull(),
  deletionReason: text('deletion_reason').notNull(),
  deletionPolicy: text('deletion_policy').notNull(),
  requestedBy: integer('requested_by').references(() => users.id),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  status: text('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
  documentType: text('document_type'),
  documentNumber: text('document_number'),
  projectId: integer('project_id').references(() => projects.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const insertGcsObjectDeletionSchema = createInsertSchema(gcsObjectDeletions).omit({ id: true, createdAt: true, executedAt: true });
export type GcsObjectDeletion = typeof gcsObjectDeletions.$inferSelect;
export type InsertGcsObjectDeletion = z.infer<typeof insertGcsObjectDeletionSchema>;

// ==================== CUSTOMER ORDER DOCUMENTS ====================

export const customerOrderDocuments = pgTable('customer_order_documents', {
  id: serial('id').primaryKey(),
  ccoId: integer('cco_id').references(() => commercialChangeOrders.id),
  projectId: integer('project_id').notNull().references(() => projects.id),
  customerOrderNumber: text('customer_order_number').notNull(),
  documentLabel: text('document_label').notNull(),
  revisionCode: text('revision_code'),
  attachmentSeq: integer('attachment_seq').notNull().default(1),
  gcsBucket: text('gcs_bucket').notNull(),
  gcsObjectPath: text('gcs_object_path').notNull(),
  originalFileName: text('original_file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSizeBytes: integer('file_size_bytes'),
  checksumSha256: text('checksum_sha256'),
  status: text('status').notNull().default('active'),
  isCurrent: boolean('is_current').notNull().default(true),
  uploadedBy: integer('uploaded_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const insertCustomerOrderDocumentSchema = createInsertSchema(customerOrderDocuments).omit({ id: true, createdAt: true, updatedAt: true });
export type CustomerOrderDocument = typeof customerOrderDocuments.$inferSelect;
export type InsertCustomerOrderDocument = z.infer<typeof insertCustomerOrderDocumentSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Hazard Classification types & constants
// ─────────────────────────────────────────────────────────────────────────────

export const APPLIED_CODE_OPTIONS = [
  'ASME SEC VIII Div-1',
  'ASME B31.3',
  'EN 13445',
  'PED 2014/68/EU',
  'API 650',
  'AS 4343:2014',
] as const;

export const AS4343_LEVEL_OPTIONS = ['A', 'B', 'C', 'D', 'E'] as const;

export const FLUID_SERVICE_CATEGORY_OPTIONS = [
  'Normal Fluid Service',
  'Category D',
  'Category M',
  'High Pressure Fluid Service',
] as const;

export const FLUID_STATE_HC_OPTIONS = [
  'Fluid',
  'Vapor',
  'Mixture of Fluid and Vapor',
] as const;

export const FLUID_GROUP_OPTIONS = ['Group 1', 'Group 2'] as const;

export const PED_CATEGORY_OPTIONS = [
  'SEP',
  'Category I',
  'Category II',
  'Category III',
  'Category IV',
] as const;

export type HazardData = {
  appliedCode: string | null;
  isLethalService: 'Yes' | 'No' | null;
  fluidServiceCategory: string | null;
  fluidGroup: string | null;
  pedCategory: string | null;
  fluidState: string;
  toxicInhalationRisk: boolean;
  isFlammable: boolean;
  isCorrosive: boolean;
  isEnvironmentallyHazardous: boolean;
  as4343EquipmentType: 'Vessel' | 'Piping' | null;
  as4343NominalBoreDN: number | null;
  as4343FluidGroup: 'A' | 'B' | 'C' | null;
  codeNativeClassification: string | null;
  internalHazardLevel: string | null;
  hazardBasisNote: string | null;
};

export type ColumnHazardData = {
  shell: HazardData;
  tube: HazardData | null;
  jacket: HazardData | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Design Data Sheets  (one per epc_drawing_controls row)
// ─────────────────────────────────────────────────────────────────────────────

export const designDataSheets = pgTable('design_data_sheets', {
  id: serial('id').primaryKey(),

  // FK – one unique sheet per drawing control record
  dwgControlId: integer('dwg_control_id')
    .notNull()
    .unique()
    .references(() => epcDrawingControls.id, { onDelete: 'cascade' }),

  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),

  // ── Header (auto-generated fields marked) ──────────────────────────────────
  designCode: varchar('design_code', { length: 100 }).notNull(),   // dropdown
  materialCode: varchar('material_code', { length: 100 }),          // auto from designCode
  equipmentDescription: text('equipment_description'),              // auto from item_description
  tagNo: varchar('tag_no', { length: 200 }),                        // auto-generated server-side
  equipmentType: varchar('equipment_type', { length: 100 }),        // auto from equipmentConfig
  manufactureSerialNo: varchar('manufacture_serial_no', { length: 200 }), // auto or null
  inspectionBy: varchar('inspection_by', { length: 80 }).notNull(), // dropdown

  // ── Mechanical data configuration ─────────────────────────────────────────
  equipmentConfig: varchar('equipment_config', { length: 60 }).notNull(),
  // Vessel | Jacketed Vessel | Heat Exchanger | Jacketed Vessel and Heat Exchanger

  // Fixed JSON keys – columns present = shell / tube / jacket
  // mechanicalData shape (all keys always present, null = N/A):
  // { shell: { ...params }, tube: { ...params } | null, jacket: { ...params } | null }
  mechanicalData: jsonb('mechanical_data').notNull().$type<MechanicalData>(),

  // ── General data (single-value rows) ──────────────────────────────────────
  // Fixed keys only:
  generalData: jsonb('general_data').notNull().$type<GeneralData>(),

  // ── Hazard classification (per-column, separate from mechanical_data) ───────
  appliedCode: varchar('applied_code', { length: 50 }),
  hazardData: jsonb('hazard_data').$type<ColumnHazardData>(),

  status: varchar('status', { length: 20 }).notNull().default('draft'),

  ddsGcsPath: varchar('dds_gcs_path', { length: 500 }),
  ddsPdfStatus: varchar('dds_pdf_status', { length: 20 }),

  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Fixed mechanical parameter keys per column
export type MechanicalColumn = {
  internalDesignPressureMawp: string | null;
  externalDesignPressureMawp: string | null;
  workingPressure: string | null;
  hydroTestPressure: string | null;
  mdmt: string | null;
  hydroTestTempMinMax: string | null;
  operatingTempMinMax: string | null;
  designTempMinMax: string | null;
  physicalState: string | null;
  grossVolumeLiters: string | null;
  serviceFluid: string | null;
  hazardLevel: string | null;
  specificGravity: string | null;
  internalCorrosionAllowanceMm: string | null;
  externalCorrosionAllowanceMm: string | null;
  radiography: string | null;
  jointEfficiency: string | null;
  testingGroup: string | null;
  fabricationToleranceClass: string | null;
  postWeldHeatTreatment: string | null;
  typeOfHeads: string | null;
  insulation: string | null;
  insulationTypeThkDensity: string | null;
};

export type MechanicalData = {
  shell: MechanicalColumn;
  tube: MechanicalColumn | null;
  jacket: MechanicalColumn | null;
};

export type GeneralData = {
  hydroTestPosition: string | null;
  vesselOrientation: string | null;
  designServiceLife: string | null;
  windData: string | null;
  windDesignVelocity: string | null;
  seismicDesignCode: string | null;
  hazardFactorZ: string | null;
  seismicCoefficientHorizontal: string | null;
  seismicCoefficientVertical: string | null;
  weightEmptyOperatingHydro: string | null;
  location: string | null;
  qty: string | null;
};

export const insertDesignDataSheetSchema = createInsertSchema(designDataSheets).omit({
  id: true, createdAt: true, updatedAt: true,
  materialCode: true, equipmentDescription: true, tagNo: true,
  equipmentType: true, manufactureSerialNo: true,
});
export type InsertDesignDataSheet = z.infer<typeof insertDesignDataSheetSchema>;
export type DesignDataSheet = typeof designDataSheets.$inferSelect;


// ─────────────────────────────────────────────────────────────────────────────
// EPC Agent Nodes — per-node registration for SolidWorks extraction agents
// ─────────────────────────────────────────────────────────────────────────────

export const epcAgentNodes = pgTable('epc_agent_nodes', {
  id:                serial('id').primaryKey(),
  nodeId:            varchar('node_id', { length: 100 }).notNull().unique(),
  tokenHash:         varchar('token_hash', { length: 255 }).notNull(),
  machineName:       varchar('machine_name', { length: 255 }),
  label:             varchar('label', { length: 255 }),
  createdBy:         varchar('created_by', { length: 255 }),
  createdAt:         timestamp('created_at').notNull().defaultNow(),
  active:            boolean('active').notNull().default(true),
  lastSeenAt:        timestamp('last_seen_at'),
  lastSeenVersion:   varchar('last_seen_version', { length: 50 }),
});

export type EpcAgentNode = typeof epcAgentNodes.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// EPC SolidWorks Extraction Jobs
// Cloud-side job queue: pending → processing → completed | failed
// ─────────────────────────────────────────────────────────────────────────────

export const epcSlddrwExtractionJobs = pgTable('epc_slddrw_extraction_jobs', {
  id:                    serial('id').primaryKey(),
  drawingControlId:      integer('drawing_control_id')
                           .notNull()
                           .references(() => epcDrawingControls.id, { onDelete: 'cascade' }),
  attachmentId:          integer('attachment_id')
                           .references(() => epcDocumentAttachments.id, { onDelete: 'set null' }),
  slddrwGcsPath:         varchar('slddrw_gcs_path', { length: 500 }).notNull(),
  slddrwFilename:        varchar('slddrw_filename', { length: 255 }),
  slddrwSha256:          varchar('slddrw_sha256', { length: 64 }),
  // Job lifecycle
  status:                varchar('status', { length: 50 }).notNull().default('pending'),
  // pending | processing | completed | failed
  nodeId:                varchar('node_id', { length: 100 }),
  agentVersion:          varchar('agent_version', { length: 50 }),
  machineName:           varchar('machine_name', { length: 255 }),
  claimedAt:             timestamp('claimed_at'),
  completedAt:           timestamp('completed_at'),
  failedReason:          text('failed_reason'),
  retryCount:            integer('retry_count').notNull().default(0),
  // Extraction output
  extractionResult:      jsonb('extraction_result'),
  // DDS comparison output
  ddsComparisonStatus:   varchar('dds_comparison_status', { length: 50 }),
  // pass | warn | fail | blocked
  ddsComparisonResult:   jsonb('dds_comparison_result'),
  // Audit
  createdBy:             varchar('created_by', { length: 255 }),
  createdAt:             timestamp('created_at').notNull().defaultNow(),
});

export type EpcSlddrwExtractionJob = typeof epcSlddrwExtractionJobs.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// EPC Structuring Agent Settings — template & staging path config
// Singleton row (id=1 always)
// ─────────────────────────────────────────────────────────────────────────────

export const epcStructuringSettings = pgTable('epc_structuring_settings', {
  id:           serial('id').primaryKey(),
  templatePath: varchar('template_path', { length: 1000 }),
  stagingRoot:  varchar('staging_root', { length: 1000 }),
  updatedBy:    varchar('updated_by', { length: 255 }),
  updatedAt:    timestamp('updated_at').defaultNow(),
});

export type EpcStructuringSettings = typeof epcStructuringSettings.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// EPC Structure Jobs — WRITE agent queue (create / update .slddrw)
// pending → processing → completed | failed
// ─────────────────────────────────────────────────────────────────────────────

export const epcStructureJobs = pgTable('epc_structure_jobs', {
  id:               serial('id').primaryKey(),
  drawingControlId: integer('drawing_control_id')
                      .notNull()
                      .references(() => epcDrawingControls.id, { onDelete: 'cascade' }),
  drawingNumber:    varchar('drawing_number', { length: 500 }),
  revision:         varchar('revision', { length: 50 }),
  baseRevision:     varchar('base_revision', { length: 50 }),
  // create_new | update_existing
  mode:             varchar('mode', { length: 50 }).notNull().default('create_new'),
  // Snapshot of DDS data at job creation time
  ddsPayload:       jsonb('dds_payload'),
  // Project identifiers forwarded to the agent
  projectContext:   jsonb('project_context'),
  // Paths resolved from settings at job creation time
  templatePath:     varchar('template_path', { length: 1000 }),
  stagingRoot:      varchar('staging_root', { length: 1000 }),
  // Job lifecycle
  status:           varchar('status', { length: 50 }).notNull().default('pending'),
  nodeId:           varchar('node_id', { length: 100 }),
  agentVersion:     varchar('agent_version', { length: 50 }),
  machineName:      varchar('machine_name', { length: 255 }),
  claimedAt:        timestamp('claimed_at'),
  completedAt:      timestamp('completed_at'),
  failedReason:     text('failed_reason'),
  retryCount:       integer('retry_count').notNull().default(0),
  // Agent result (file path, properties written, duration)
  result:           jsonb('result'),
  // Audit
  createdBy:        varchar('created_by', { length: 255 }),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
});

export type EpcStructureJob = typeof epcStructureJobs.$inferSelect;

// =============================================================================
// PPPC — Phase 0: Master Reference Tables
// buy_groups · buy_subgroups · uom_master
// =============================================================================

export const buyGroups = pgTable('buy_groups', {
  id:        serial('id').primaryKey(),
  code:      varchar('code', { length: 40 }).notNull().unique(),
  label:     varchar('label', { length: 100 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive:  boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const insertBuyGroupSchema = createInsertSchema(buyGroups).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBuyGroup = z.infer<typeof insertBuyGroupSchema>;
export type BuyGroup = typeof buyGroups.$inferSelect;

export const buySubgroups = pgTable('buy_subgroups', {
  id:         serial('id').primaryKey(),
  buyGroupId: integer('buy_group_id').notNull().references(() => buyGroups.id, { onDelete: 'restrict' }),
  code:       varchar('code', { length: 60 }).notNull(),
  label:      varchar('label', { length: 120 }).notNull(),
  sortOrder:  integer('sort_order').notNull().default(0),
  isActive:   boolean('is_active').notNull().default(true),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  groupCodeUnique: uniqueIndex('buy_subgroups_group_code_unique').on(t.buyGroupId, t.code),
}));

export const insertBuySubgroupSchema = createInsertSchema(buySubgroups).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBuySubgroup = z.infer<typeof insertBuySubgroupSchema>;
export type BuySubgroup = typeof buySubgroups.$inferSelect;

export const uomMaster = pgTable('uom_master', {
  id:        serial('id').primaryKey(),
  code:      varchar('code', { length: 20 }).notNull().unique(),
  label:     varchar('label', { length: 60 }).notNull(),
  category:  varchar('category', { length: 40 }),
  isActive:  boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const insertUomMasterSchema = createInsertSchema(uomMaster).omit({ id: true, createdAt: true });
export type InsertUomMaster = z.infer<typeof insertUomMasterSchema>;
export type UomMaster = typeof uomMaster.$inferSelect;

// =============================================================================
// PPPC — Phase 1: Standard BUY Package (Catalog)
// buy_package_headers · buy_package_lines
// =============================================================================

export const buyPackageHeaders = pgTable('buy_package_headers', {
  id:          serial('id').primaryKey(),
  productId:   integer('product_id').notNull().references(() => products.id, { onDelete: 'restrict' }),
  packageCode: varchar('package_code', { length: 30 }).notNull(),
  name:        varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  version:     integer('version').notNull().default(1),
  status:      varchar('status', { length: 20 }).notNull().default('draft'),
  isActive:    boolean('is_active').notNull().default(true),
  createdBy:   integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  productVersionUnique:  uniqueIndex('buy_package_headers_product_version_unique').on(t.productId, t.version),
  codeVersionUnique:     uniqueIndex('buy_package_headers_code_version_unique').on(t.packageCode, t.version),
}));

export const insertBuyPackageHeaderSchema = createInsertSchema(buyPackageHeaders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBuyPackageHeader = z.infer<typeof insertBuyPackageHeaderSchema>;
export type BuyPackageHeader = typeof buyPackageHeaders.$inferSelect;

export const buyPackageLines = pgTable('buy_package_lines', {
  id:                   serial('id').primaryKey(),
  lineUid:              uuid('line_uid').notNull().defaultRandom(),
  buyPackageHeaderId:   integer('buy_package_header_id').notNull().references(() => buyPackageHeaders.id, { onDelete: 'cascade' }),
  lineNumber:           integer('line_number').notNull(),
  buyGroupId:           integer('buy_group_id').notNull().references(() => buyGroups.id, { onDelete: 'restrict' }),
  buySubgroupId:        integer('buy_subgroup_id').notNull().references(() => buySubgroups.id, { onDelete: 'restrict' }),
  uomId:                integer('uom_id').notNull().references(() => uomMaster.id, { onDelete: 'restrict' }),
  genericRequirement:   text('generic_requirement').notNull(),
  defaultQuantity:      numeric('default_quantity', { precision: 10, scale: 2 }).notNull().default('1'),
  defaultSpecification: text('default_specification'),
  technicalAttributes:  jsonb('technical_attributes'),
  selectionRequired:    boolean('selection_required').notNull().default(true),
  datasheetRequired:    boolean('datasheet_required').notNull().default(false),
  inspectionRequired:   boolean('inspection_required').notNull().default(false),
  certificateRequired:  boolean('certificate_required').notNull().default(false),
  complianceRequired:   boolean('compliance_required').notNull().default(false),
  notes:                text('notes'),
  sortOrder:            integer('sort_order').notNull().default(0),
  masterItemId:         integer('master_item_id').references(() => masterItems.id, { onDelete: 'set null' }),
  sapItemCode:          text('sap_item_code'),
  createdAt:            timestamp('created_at').notNull().defaultNow(),
  updatedAt:            timestamp('updated_at').notNull().defaultNow(),
});

export const insertBuyPackageLineSchema = createInsertSchema(buyPackageLines).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBuyPackageLine = z.infer<typeof insertBuyPackageLineSchema>;
export type BuyPackageLine = typeof buyPackageLines.$inferSelect;

// =============================================================================
// PPPC — Phase 2: Project BUY Procurement List
// project_buy_list_headers · project_buy_list_lines
// =============================================================================

export const projectBuyListHeaders = pgTable('project_buy_list_headers', {
  id:                     serial('id').primaryKey(),
  projectId:              integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  projectItemId:          integer('project_item_id').notNull().references(() => projectItems.id, { onDelete: 'cascade' }),
  sourcePackageId:        integer('source_package_id').references(() => buyPackageHeaders.id, { onDelete: 'set null' }),
  latestSyncedPackageId:  integer('latest_synced_package_id').references(() => buyPackageHeaders.id, { onDelete: 'set null' }),
  listNumber:           varchar('list_number', { length: 35 }).notNull().unique(),
  revisionCode:         varchar('revision_code', { length: 5 }).notNull().default('A'),
  isCurrent:            boolean('is_current').notNull().default(true),
  status:               varchar('status', { length: 30 }).notNull().default('draft'),
  supersedesId:         integer('supersedes_id'),
  supersededBy:         integer('superseded_by'),
  supersededAt:         timestamp('superseded_at'),
  supersessionReason:   text('supersession_reason'),
  revisionNotes:        text('revision_notes'),
  submittedBy:          integer('submitted_by').references(() => users.id, { onDelete: 'set null' }),
  submittedAt:          timestamp('submitted_at'),
  submissionNote:       text('submission_note'),
  reviewedBy:           integer('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt:           timestamp('reviewed_at'),
  reviewNote:           text('review_note'),
  reviewRecommendation: varchar('review_recommendation', { length: 30 }),
  releasedBy:           integer('released_by').references(() => users.id, { onDelete: 'set null' }),
  releasedAt:           timestamp('released_at'),
  releaseNote:          text('release_note'),
  cancelledBy:          integer('cancelled_by').references(() => users.id, { onDelete: 'set null' }),
  cancelledAt:          timestamp('cancelled_at'),
  cancelReason:         text('cancel_reason'),
  createdBy:            integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  itemCode:             varchar('item_code', { length: 100 }),
  createdAt:            timestamp('created_at').notNull().defaultNow(),
  updatedAt:            timestamp('updated_at').notNull().defaultNow(),
});

export const insertProjectBuyListHeaderSchema = createInsertSchema(projectBuyListHeaders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProjectBuyListHeader = z.infer<typeof insertProjectBuyListHeaderSchema>;
export type ProjectBuyListHeader = typeof projectBuyListHeaders.$inferSelect;

export const projectBuyListLines = pgTable('project_buy_list_lines', {
  id:                   serial('id').primaryKey(),
  buyListHeaderId:      integer('buy_list_header_id').notNull().references(() => projectBuyListHeaders.id, { onDelete: 'cascade' }),
  projectId:            integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  lineNumber:           integer('line_number').notNull(),
  buyGroupId:           integer('buy_group_id').notNull().references(() => buyGroups.id, { onDelete: 'restrict' }),
  buySubgroupId:        integer('buy_subgroup_id').notNull().references(() => buySubgroups.id, { onDelete: 'restrict' }),
  uomId:                integer('uom_id').notNull().references(() => uomMaster.id, { onDelete: 'restrict' }),
  genericRequirement:   text('generic_requirement').notNull(),
  quantity:             numeric('quantity', { precision: 10, scale: 2 }).notNull().default('1'),
  requiredDate:         date('required_date'),
  specification:        text('specification'),
  technicalAttributes:  jsonb('technical_attributes'),
  tagNo:                varchar('tag_no', { length: 80 }).notNull().default(''),
  equipmentReference:   varchar('equipment_reference', { length: 120 }).notNull().default(''),
  serviceDescription:   varchar('service_description', { length: 255 }).notNull().default(''),
  selectionRequired:    boolean('selection_required').notNull().default(true),
  datasheetRequired:    boolean('datasheet_required').notNull().default(false),
  inspectionRequired:   boolean('inspection_required').notNull().default(false),
  certificateRequired:  boolean('certificate_required').notNull().default(false),
  complianceRequired:   boolean('compliance_required').notNull().default(false),
  status:               varchar('status', { length: 30 }).notNull().default('open'),
  selectedMasterItemId: integer('selected_master_item_id').references(() => masterItems.id, { onDelete: 'set null' }),
  sourcePackageLineId:  integer('source_package_line_id').references(() => buyPackageLines.id, { onDelete: 'set null' }),
  planningRecordId:     integer('planning_record_id'),
  isUserModified:       boolean('is_user_modified').notNull().default(false),
  notes:                text('notes'),
  approvedBy:           integer('approved_by').references(() => users.id, { onDelete: 'set null' }),
  approvedAt:           timestamp('approved_at', { withTimezone: true }),
  createdAt:            timestamp('created_at').notNull().defaultNow(),
  updatedAt:            timestamp('updated_at').notNull().defaultNow(),
});

export const insertProjectBuyListLineSchema = createInsertSchema(projectBuyListLines).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProjectBuyListLine = z.infer<typeof insertProjectBuyListLineSchema>;
export type ProjectBuyListLine = typeof projectBuyListLines.$inferSelect;

// ─── Phase 3: buy_list_line_selections ────────────────────────────────────────
export const buyListLineSelections = pgTable('buy_list_line_selections', {
  id:                         serial('id').primaryKey(),
  buyListLineId:              integer('buy_list_line_id').notNull().unique().references(() => projectBuyListLines.id, { onDelete: 'cascade' }),
  masterItemId:               integer('master_item_id').notNull(),
  itemCode:                   varchar('item_code', { length: 100 }),
  itemDescription:            text('item_description'),
  itemSpecification:          text('item_specification'),
  drawingNumber:              varchar('drawing_number', { length: 100 }),
  drawingRevision:            varchar('drawing_revision', { length: 20 }),
  selectedBy:                 integer('selected_by').notNull(),
  selectedAt:                 timestamp('selected_at').notNull().defaultNow(),
  datasheetRequired:          boolean('datasheet_required').notNull(),
  datasheetUploaded:          boolean('datasheet_uploaded').notNull().default(false),
  datasheetGcsBucket:         varchar('datasheet_gcs_bucket', { length: 100 }),
  datasheetGcsObjectPath:     varchar('datasheet_gcs_object_path', { length: 500 }),
  datasheetOriginalFilename:  varchar('datasheet_original_filename', { length: 255 }),
  datasheetMimeType:          varchar('datasheet_mime_type', { length: 100 }),
  datasheetFileSizeBytes:     bigint('datasheet_file_size_bytes', { mode: 'number' }),
  datasheetChecksumSha256:    varchar('datasheet_checksum_sha256', { length: 64 }),
  datasheetRevisionSeq:       integer('datasheet_revision_seq').notNull().default(1),
  datasheetUploadedBy:        integer('datasheet_uploaded_by'),
  datasheetUploadedAt:        timestamp('datasheet_uploaded_at'),
  approvalStatus:             varchar('approval_status', { length: 20 }).notNull().default('pending'),
  approvedBy:                 integer('approved_by'),
  approvedAt:                 timestamp('approved_at'),
  rejectionReason:            text('rejection_reason'),
  notes:                      text('notes'),
  createdAt:                  timestamp('created_at').notNull().defaultNow(),
  updatedAt:                  timestamp('updated_at').notNull().defaultNow(),
});

export const insertBuyListLineSelectionSchema = createInsertSchema(buyListLineSelections).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBuyListLineSelection = z.infer<typeof insertBuyListLineSelectionSchema>;
export type BuyListLineSelection = typeof buyListLineSelections.$inferSelect;

// ─── Tag No Audit Log ──────────────────────────────────────────────────────────
export const tagNoAuditLog = pgTable('tag_no_audit_log', {
  id:        serial('id').primaryKey(),
  lineId:    integer('line_id').notNull(),
  headerId:  integer('header_id').notNull(),
  projectId: integer('project_id').notNull(),
  oldTagNo:  varchar('old_tag_no', { length: 80 }).notNull().default(''),
  newTagNo:  varchar('new_tag_no', { length: 80 }).notNull().default(''),
  changedBy: integer('changed_by').references(() => users.id, { onDelete: 'set null' }),
  changedAt: timestamp('changed_at').notNull().defaultNow(),
});
export type TagNoAuditLog = typeof tagNoAuditLog.$inferSelect;

// =============================================================================
// SECURITY BASELINE v1.0 — Phase 1: Foundation & Schema Layer
// Approved: 09 May 2026
// Baseline: docs/security-baseline-v1.0.md
// All feature flags remain enabled=false until Phase 2+
// =============================================================================

// --- Table 1: Login Security Policies (one row per security level) ---
export const loginSecurityPolicies = pgTable('login_security_policies', {
  id: serial('id').primaryKey(),
  policyLevel: varchar('policy_level', { length: 20 }).notNull().unique(), // 'high_security' | 'elevated' | 'standard'
  applyToRoles: text('apply_to_roles').array().notNull().default(sql`'{}'::text[]`),
  require2fa: boolean('require_2fa').notNull().default(false),
  requireDeviceTrust: boolean('require_device_trust').notNull().default(false),
  maxSessionHours: integer('max_session_hours').notNull().default(24),
  maxFailedAttempts: integer('max_failed_attempts').notNull().default(5),
  lockoutMinutes: integer('lockout_minutes').notNull().default(15),
  reauthTimeoutMinutes: integer('reauth_timeout_minutes').notNull().default(60),
  allowedNetworks: text('allowed_networks').array(),
  updatedBy: integer('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
export type LoginSecurityPolicy = typeof loginSecurityPolicies.$inferSelect;

// --- Table 2: Login Audit Log (append-only — standard audit log) ---
export const loginAuditLog = pgTable('login_audit_log', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  username: varchar('username', { length: 100 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  outcome: varchar('outcome', { length: 30 }).notNull(), // 'success' | 'failed_password' | 'failed_2fa' | 'locked' | 'success_2fa'
  policyLevel: varchar('policy_level', { length: 20 }),
  isTrustedDevice: boolean('is_trusted_device').default(false),
  networkFlag: boolean('network_flag').default(false),
  failedAttemptCount: integer('failed_attempt_count'),
  severity: varchar('severity', { length: 20 }).notNull().default('info'), // 'info' | 'warning' | 'critical' | 'emergency'
  archivedAt: timestamp('archived_at'),
  archivePath: text('archive_path'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
export type LoginAuditLog = typeof loginAuditLog.$inferSelect;

// --- Table 3: User Session Registry ---
export const userSessionRegistry = pgTable('user_session_registry', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: varchar('session_id', { length: 255 }).notNull().unique(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  deviceFingerprint: text('device_fingerprint'),
  isActive: boolean('is_active').notNull().default(true),
  lastActivityAt: timestamp('last_activity_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
export type UserSessionRegistry = typeof userSessionRegistry.$inferSelect;

// --- Table 4: Attendance Security Policies (one row per role group) ---
export const attendanceSecurityPolicies = pgTable('attendance_security_policies', {
  id: serial('id').primaryKey(),
  policyName: varchar('policy_name', { length: 50 }).notNull().unique(),
  applyToRoles: text('apply_to_roles').array().notNull().default(sql`'{}'::text[]`),
  policyMode: varchar('policy_mode', { length: 20 }).notNull().default('advisory'), // 'enforced' | 'advisory' | 'exempt'
  requireGps: boolean('require_gps').notNull().default(false),
  geofenceRadiusOverride: integer('geofence_radius_override'),
  maxGpsAccuracyMeters: integer('max_gps_accuracy_meters').default(100),
  requireIpVerification: boolean('require_ip_verification').notNull().default(false),
  allowRemoteWork: boolean('allow_remote_work').notNull().default(true),
  updatedBy: integer('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
export type AttendanceSecurityPolicy = typeof attendanceSecurityPolicies.$inferSelect;

// --- Table 5: Attendance Location Audit Log (append-only — standard audit log) ---
export const attendanceLocationAuditLog = pgTable('attendance_location_audit_log', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  attendanceRecordId: integer('attendance_record_id').references(() => attendanceRecords.id, { onDelete: 'set null' }),
  attemptType: varchar('attempt_type', { length: 20 }).notNull(), // 'check_in' | 'check_out'
  policyMode: varchar('policy_mode', { length: 20 }),
  outcome: varchar('outcome', { length: 40 }).notNull(), // 'allowed' | 'blocked_geofence' | 'blocked_accuracy' | 'advisory_warning' | 'skipped_exempt'
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  gpsAccuracyMeters: doublePrecision('gps_accuracy_meters'),
  distanceToOfficeMeters: doublePrecision('distance_to_office_meters'),
  workLocationId: integer('work_location_id').references(() => workLocations.id, { onDelete: 'set null' }),
  ipAddress: varchar('ip_address', { length: 45 }),
  isIpVerified: boolean('is_ip_verified').default(false),
  spoofingFlags: text('spoofing_flags').array().notNull().default(sql`'{}'::text[]`),
  severity: varchar('severity', { length: 20 }).notNull().default('info'),
  archivedAt: timestamp('archived_at'),
  archivePath: text('archive_path'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
export type AttendanceLocationAuditLog = typeof attendanceLocationAuditLog.$inferSelect;

// --- Table 6: Trusted Devices ---
export const trustedDevices = pgTable('trusted_devices', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  deviceFingerprint: text('device_fingerprint').notNull(),
  deviceName: varchar('device_name', { length: 100 }),
  trustToken: varchar('trust_token', { length: 255 }).notNull().unique(),
  trustTokenExpiresAt: timestamp('trust_token_expires_at'),
  isActive: boolean('is_active').notNull().default(true),
  registeredByAdmin: boolean('registered_by_admin').notNull().default(false),
  registeredBy: integer('registered_by').references(() => users.id),
  lastUsedAt: timestamp('last_used_at'),
  revokedAt: timestamp('revoked_at'),
  revokedBy: integer('revoked_by').references(() => users.id),
  revokedReason: text('revoked_reason'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
export type TrustedDevice = typeof trustedDevices.$inferSelect;

// --- Table 7: Trusted Device Audit Log (append-only — standard audit log) ---
export const trustedDeviceAuditLog = pgTable('trusted_device_audit_log', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  deviceId: integer('device_id').references(() => trustedDevices.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 30 }).notNull(), // 'registered' | 'revoked' | 'login_trusted' | 'login_challenged' | 'login_new_device'
  performedBy: integer('performed_by').references(() => users.id, { onDelete: 'set null' }),
  ipAddress: varchar('ip_address', { length: 45 }),
  severity: varchar('severity', { length: 20 }).notNull().default('info'),
  notes: text('notes'),
  archivedAt: timestamp('archived_at'),
  archivePath: text('archive_path'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
export type TrustedDeviceAuditLog = typeof trustedDeviceAuditLog.$inferSelect;

// --- Table 8: Sensitive Action Policies ---
export const sensitiveActionPolicies = pgTable('sensitive_action_policies', {
  id: serial('id').primaryKey(),
  actionKey: varchar('action_key', { length: 80 }).notNull().unique(),
  actionLabel: text('action_label').notNull(),
  applyToRoles: text('apply_to_roles').array().notNull().default(sql`'{}'::text[]`),
  challengeType: varchar('challenge_type', { length: 20 }).notNull().default('any'), // 'any' | 'password' | 'totp'
  timeoutMinutes: integer('timeout_minutes').notNull().default(30), // 0 = always re-auth regardless of recency
  isActive: boolean('is_active').notNull().default(true),
  updatedBy: integer('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
export type SensitiveActionPolicy = typeof sensitiveActionPolicies.$inferSelect;

// --- Table 9: Re-Auth Audit Log (append-only — standard audit log) ---
export const reauthAuditLog = pgTable('reauth_audit_log', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  actionKey: varchar('action_key', { length: 80 }).notNull(),
  challengeType: varchar('challenge_type', { length: 20 }),
  outcome: varchar('outcome', { length: 30 }).notNull(), // 'success_password' | 'success_totp' | 'failed_password' | 'failed_totp' | 'cancelled' | 'reused'
  ipAddress: varchar('ip_address', { length: 45 }),
  severity: varchar('severity', { length: 20 }).notNull().default('info'),
  archivedAt: timestamp('archived_at'),
  archivePath: text('archive_path'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
export type ReauthAuditLog = typeof reauthAuditLog.$inferSelect;

// --- Table 10: Security Emergency Log (PERMANENT GOVERNANCE LOG — fully immutable after insert) ---
// GCS copy written at event time by emergency-recovery.ts script.
// Never enters archival rotation. Never deleted. Never updated.
export const securityEmergencyLog = pgTable('security_emergency_log', {
  id: serial('id').primaryKey(),
  initiatedBy: varchar('initiated_by', { length: 100 }).notNull(),
  witnessName: varchar('witness_name', { length: 100 }),
  scenario: varchar('scenario', { length: 50 }).notNull(),
  affectedAction: text('affected_action'),
  targetUserId: integer('target_user_id'),
  passphraseAttempts: integer('passphrase_attempts').notNull().default(1),
  outcome: varchar('outcome', { length: 30 }).notNull(), // 'success' | 'failed' | 'aborted'
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
export type SecurityEmergencyLog = typeof securityEmergencyLog.$inferSelect;

// --- Table 11: 2FA Global Policy (singleton — always exactly 1 row) ---
export const twoFaGlobalPolicy = pgTable('two_fa_global_policy', {
  id: serial('id').primaryKey(),
  enforcementMode: varchar('enforcement_mode', { length: 30 }).notNull().default('optional'), // 'optional' | 'required_from_date' | 'enforced'
  applyToRoles: text('apply_to_roles').array().notNull().default(sql`'{}'::text[]`),
  enforcementFromDate: date('enforcement_from_date'),
  gracePeriodEnabled: boolean('grace_period_enabled').notNull().default(true),
  gracePeriodDays: integer('grace_period_days').notNull().default(14),
  updatedBy: integer('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
export type TwoFaGlobalPolicy = typeof twoFaGlobalPolicy.$inferSelect;

// --- Table 12: 2FA Policy Audit Log (PERMANENT GOVERNANCE LOG — fully immutable after insert) ---
// GCS read-only backup copy made after 2 years. PostgreSQL rows permanent. No archived_at/archive_path.
export const twoFaPolicyAuditLog = pgTable('two_fa_policy_audit_log', {
  id: serial('id').primaryKey(),
  changedBy: integer('changed_by').references(() => users.id, { onDelete: 'set null' }),
  previousMode: varchar('previous_mode', { length: 30 }),
  newMode: varchar('new_mode', { length: 30 }).notNull(),
  previousRoles: text('previous_roles').array(),
  newRoles: text('new_roles').array(),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
export type TwoFaPolicyAuditLog = typeof twoFaPolicyAuditLog.$inferSelect;

// --- Table 13: Security Archival Log (nightly job metadata) ---
export const securityArchivalLog = pgTable('security_archival_log', {
  id: serial('id').primaryKey(),
  jobRunAt: timestamp('job_run_at').notNull().defaultNow(),
  targetTable: varchar('target_table', { length: 80 }).notNull(),
  rowsArchived: integer('rows_archived').notNull().default(0),
  archivePath: text('archive_path'),
  checksumSha256: varchar('checksum_sha256', { length: 64 }),
  status: varchar('status', { length: 20 }).notNull().default('success'), // 'success' | 'failed' | 'partial'
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
export type SecurityArchivalLog = typeof securityArchivalLog.$inferSelect;

// --- Password Reset Audit Log ---
export const passwordResetAuditLog = pgTable('password_reset_audit_log', {
  id:                serial('id').primaryKey(),
  userId:            integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  emailAttempted:    text('email_attempted').notNull(),
  usernameAttempted: text('username_attempted').notNull().default(''),
  eventType:         varchar('event_type', { length: 30 }).notNull(),
  failureReason:     text('failure_reason'),
  ipAddress:         text('ip_address'),
  userAgent:         text('user_agent'),
  requestSource:     varchar('request_source', { length: 50 }),
  createdAt:         timestamp('created_at').notNull().defaultNow(),
});
export type PasswordResetAuditLog = typeof passwordResetAuditLog.$inferSelect;

// --- Item Code Registry (Baseline v1.3) ---
// Single source of truth for GROUP, SUBGROUP, TYPE, SEG4, SEG5, UNIT codes and their labels.
// scopeGroup / scopeSubgroup use '' (empty string) as the sentinel for "global scope"
// so the composite unique index works correctly on non-nullable columns.
export const itemCodeRegistry = pgTable('item_code_registry', {
  id:            serial('id').primaryKey(),
  registryType:  varchar('registry_type', { length: 20 }).notNull(), // 'group'|'subgroup'|'type'|'seg4'|'seg5'|'unit'
  scopeGroup:    varchar('scope_group',    { length: 5  }).notNull().default(''), // '' = global; else GROUP abbr e.g. 'VALVE'
  scopeSubgroup: varchar('scope_subgroup', { length: 5  }).notNull().default(''), // '' = group-level; else SUBGROUP abbr e.g. 'ISO'
  entityKey:     varchar('entity_key',     { length: 60 }).notNull(),             // stable key e.g. 'cs_body', '150f'
  abbr:          varchar('abbr',           { length: 10 }).notNull(),             // code in ItemCode e.g. 'CS', '150F', 'NB'
  label:         varchar('label',          { length: 150 }).notNull(),            // English label for buildShortItemName
  isActive:      boolean('is_active').notNull().default(true),
  sortOrder:     integer('sort_order').notNull().default(0),
}, (t) => ({
  uniq: uniqueIndex('icr_type_scope_key_unique').on(t.registryType, t.scopeGroup, t.scopeSubgroup, t.entityKey),
}));
export type ItemCodeRegistry = typeof itemCodeRegistry.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// PLC MODULE — Phase 1 Schema (approved baseline v1.0, 13 May 2026)
// Governance: docs/procurement-list-control-baseline-v1.md §8 and §38
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 1. Vendor Subgroup Qualification (AVL) ────────────────────────────────
export const vendorSubgroupQualification = pgTable('vendor_subgroup_qualification', {
  id: serial('id').primaryKey(),
  vendorId: integer('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  subgroupCode: varchar('subgroup_code', { length: 20 }).notNull(),
  subgroupLabel: varchar('subgroup_label', { length: 120 }),
  status: varchar('status', { length: 30 }).notNull().default('under_review'),
  // 'qualified' | 'conditionally_qualified' | 'not_qualified' | 'under_review'
  qualifiedBy: integer('qualified_by').references(() => users.id),
  qualifiedAt: timestamp('qualified_at'),
  validUntil: date('valid_until'),
  performanceScore: decimal('performance_score', { precision: 5, scale: 2 }),
  notes: text('notes'),
  conditions: text('conditions'),
  annualReviewDue: date('annual_review_due'),
  lastReviewedBy: integer('last_reviewed_by').references(() => users.id),
  lastReviewedAt: timestamp('last_reviewed_at'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  uniqVendorSubgroup: uniqueIndex('vsq_vendor_subgroup_unique').on(t.vendorId, t.subgroupCode),
}));
export const insertVendorSubgroupQualificationSchema = createInsertSchema(vendorSubgroupQualification).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVendorSubgroupQualification = z.infer<typeof insertVendorSubgroupQualificationSchema>;
export type VendorSubgroupQualification = typeof vendorSubgroupQualification.$inferSelect;

// ─── 2. Procurement List Lines ─────────────────────────────────────────────
// Creator: createPlcLineInTx() in server/plc-line-service.ts ONLY.
// Mutator: service functions in plc-line-service.ts ONLY.
// No direct SQL UPDATE or DELETE permitted in application code.
export const procurementListLines = pgTable('procurement_list_lines', {
  id: serial('id').primaryKey(),
  plcNumber: varchar('plc_number', { length: 60 }).notNull().unique(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  planningRecordId: integer('planning_record_id').references(() => itemPlanningRecords.id),
  planningNumber: varchar('planning_number', { length: 60 }),
  sourceBuyListHeaderId: integer('source_buy_list_header_id'),
  sourceBuyListLineId: integer('source_buy_list_line_id'),
  masterItemId: integer('master_item_id').references(() => masterItems.id),
  tagNo: varchar('tag_no', { length: 50 }),
  serviceDescription: text('service_description'),
  equipmentReference: varchar('equipment_reference', { length: 150 }),
  subgroupCode: varchar('subgroup_code', { length: 20 }),
  subgroupLabel: varchar('subgroup_label', { length: 120 }),
  // Qty fields — only modified by recomputePlcQty() and derivePlcLineStatus()
  qtyRequired: decimal('qty_required', { precision: 10, scale: 2 }).notNull(),
  qtyOrdered: decimal('qty_ordered', { precision: 10, scale: 2 }).notNull().default('0'),
  qtyReceived: decimal('qty_received', { precision: 10, scale: 2 }).notNull().default('0'),
  qtyBalance: decimal('qty_balance', { precision: 10, scale: 2 }).notNull().default('0'),
  qtyOverProcured: decimal('qty_over_procured', { precision: 10, scale: 2 }).notNull().default('0'),
  // Status lifecycle: pr_raised → in_po_group → po_issued → partial_received → fully_received | closed
  status: varchar('status', { length: 30 }).notNull().default('pr_raised'),
  activePoGroupId: integer('active_po_group_id'),  // FK to epc_po_groups — no .references() to avoid circular
  activeEpcPoId: integer('active_epc_po_id'),      // FK to epc_purchase_orders — no .references() to avoid circular
  vendorId: integer('vendor_id').references(() => vendors.id),
  vendorName: varchar('vendor_name', { length: 255 }),
  priority: varchar('priority', { length: 20 }).notNull().default('standard'), // standard | expedite | critical
  requiredByDate: date('required_by_date'),
  // AVL governance
  avlStatus: varchar('avl_status', { length: 30 }).notNull().default('not_checked'),
  // not_checked | qualified | conditionally_qualified | not_qualified | bypassed
  avlBypassReason: text('avl_bypass_reason'),
  avlBypassedBy: integer('avl_bypassed_by').references(() => users.id),
  avlBypassedAt: timestamp('avl_bypassed_at'),
  // BUY List revision tracking
  revisionActionRequired: varchar('revision_action_required', { length: 30 }).notNull().default('none'),
  // none | price_revision | qty_revision | cancellation_revision
  specificationNotes: text('specification_notes'),
  internalNotes: text('internal_notes'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
export const insertProcurementListLineSchema = createInsertSchema(procurementListLines).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProcurementListLine = z.infer<typeof insertProcurementListLineSchema>;
export type ProcurementListLine = typeof procurementListLines.$inferSelect;

// ─── 3. EPC PO Groups ─────────────────────────────────────────────────────
export const epcPoGroups = pgTable('epc_po_groups', {
  id: serial('id').primaryKey(),
  pogNumber: varchar('pog_number', { length: 60 }).notNull().unique(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  vendorId: integer('vendor_id').references(() => vendors.id),
  vendorName: varchar('vendor_name', { length: 255 }),
  totalLines: integer('total_lines').notNull().default(0),
  totalAmount: decimal('total_amount', { precision: 15, scale: 2 }),
  currency: varchar('currency', { length: 10 }).notNull().default('INR'),
  status: varchar('status', { length: 30 }).notNull().default('draft'),
  // draft → submitted → approved → po_issued | rejected | cancelled
  epcPoId: integer('epc_po_id'),      // FK to epc_purchase_orders (set when po_issued)
  epcPoNumber: varchar('epc_po_number', { length: 60 }),
  deliveryTerms: text('delivery_terms'),
  paymentTerms: text('payment_terms'),
  groupNotes: text('group_notes'),
  submittedBy: integer('submitted_by').references(() => users.id),
  submittedAt: timestamp('submitted_at'),
  submissionNotes: text('submission_notes'),
  approvedBy: integer('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  approvalNotes: text('approval_notes'),
  rejectedBy: integer('rejected_by').references(() => users.id),
  rejectedAt: timestamp('rejected_at'),
  rejectionReason: text('rejection_reason'),
  issuedBy: integer('issued_by').references(() => users.id),
  issuedAt: timestamp('issued_at'),
  cancelledBy: integer('cancelled_by').references(() => users.id),
  cancelledAt: timestamp('cancelled_at'),
  cancellationReason: text('cancellation_reason'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
export const insertEpcPoGroupSchema = createInsertSchema(epcPoGroups).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEpcPoGroup = z.infer<typeof insertEpcPoGroupSchema>;
export type EpcPoGroup = typeof epcPoGroups.$inferSelect;

// ─── 4. EPC PO Group Lines ─────────────────────────────────────────────────
export const epcPoGroupLines = pgTable('epc_po_group_lines', {
  id: serial('id').primaryKey(),
  poGroupId: integer('po_group_id').notNull().references(() => epcPoGroups.id, { onDelete: 'cascade' }),
  plcLineId: integer('plc_line_id').notNull(), // FK to procurement_list_lines (no .references() to avoid dependency order issue)
  lineNumber: integer('line_number').notNull().default(1),
  lineQty: decimal('line_qty', { precision: 10, scale: 2 }).notNull(),
  lineUnitRate: decimal('line_unit_rate', { precision: 12, scale: 2 }),
  lineAmount: decimal('line_amount', { precision: 15, scale: 2 }),
  lineNotes: text('line_notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
export const insertEpcPoGroupLineSchema = createInsertSchema(epcPoGroupLines).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEpcPoGroupLine = z.infer<typeof insertEpcPoGroupLineSchema>;
export type EpcPoGroupLine = typeof epcPoGroupLines.$inferSelect;

// ─── 5. EPC PO Amendments ─────────────────────────────────────────────────
export const epcPoAmendments = pgTable('epc_po_amendments', {
  id: serial('id').primaryKey(),
  amendmentNumber: varchar('amendment_number', { length: 60 }).notNull().unique(),
  epcPoId: integer('epc_po_id').notNull().references(() => epcPurchaseOrders.id, { onDelete: 'cascade' }),
  poGroupId: integer('po_group_id').references(() => epcPoGroups.id),
  amendmentType: varchar('amendment_type', { length: 40 }).notNull(),
  // qty_increase | qty_decrease | price_change | delivery_date_change | scope_change
  amendmentSummary: text('amendment_summary').notNull(),
  priceChangeDelta: decimal('price_change_delta', { precision: 12, scale: 2 }),
  qtyChangeDelta: decimal('qty_change_delta', { precision: 10, scale: 2 }),
  deliveryDateChange: date('delivery_date_change'),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  // draft | submitted | approved | rejected | issued
  submittedBy: integer('submitted_by').references(() => users.id),
  submittedAt: timestamp('submitted_at'),
  approvedBy: integer('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  issuedBy: integer('issued_by').references(() => users.id),
  issuedAt: timestamp('issued_at'),
  rejectedBy: integer('rejected_by').references(() => users.id),
  rejectedAt: timestamp('rejected_at'),
  rejectionReason: text('rejection_reason'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
export const insertEpcPoAmendmentSchema = createInsertSchema(epcPoAmendments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEpcPoAmendment = z.infer<typeof insertEpcPoAmendmentSchema>;
export type EpcPoAmendment = typeof epcPoAmendments.$inferSelect;

// ─── 6. PLC GRN Records (Phase 3 routes; table created Phase 1) ──────────
export const plcGrnRecords = pgTable('plc_grn_records', {
  id: serial('id').primaryKey(),
  grnNumber: varchar('grn_number', { length: 60 }).notNull().unique(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  plcLineId: integer('plc_line_id').notNull(), // FK to procurement_list_lines
  epcPoId: integer('epc_po_id').references(() => epcPurchaseOrders.id),
  poGroupId: integer('po_group_id').references(() => epcPoGroups.id),
  vendorId: integer('vendor_id').references(() => vendors.id),
  vendorName: varchar('vendor_name', { length: 255 }),
  challanNumber: varchar('challan_number', { length: 80 }),
  challanDate: date('challan_date'),
  receivedDate: date('received_date').notNull(),
  grnQty: decimal('grn_qty', { precision: 10, scale: 2 }).notNull(),
  acceptedQty: decimal('accepted_qty', { precision: 10, scale: 2 }).default('0'),
  rejectedQty: decimal('rejected_qty', { precision: 10, scale: 2 }).default('0'),
  inspectionStatus: varchar('inspection_status', { length: 30 }).notNull().default('pending'),
  // pending | passed | failed | partial
  inspectionNotes: text('inspection_notes'),
  inspectionBy: integer('inspection_by').references(() => users.id),
  inspectionAt: timestamp('inspection_at'),
  storesAcceptedBy: integer('stores_accepted_by').references(() => users.id),
  storesAcceptedAt: timestamp('stores_accepted_at'),
  storesNotes: text('stores_notes'),
  status: varchar('status', { length: 30 }).notNull().default('received'),
  // received | under_inspection | accepted | rejected
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
export const insertPlcGrnRecordSchema = createInsertSchema(plcGrnRecords).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlcGrnRecord = z.infer<typeof insertPlcGrnRecordSchema>;
export type PlcGrnRecord = typeof plcGrnRecords.$inferSelect;

// ─── 7. PLC Material Issues (Phase 3 routes; table created Phase 1) ───────
export const plcMaterialIssues = pgTable('plc_material_issues', {
  id: serial('id').primaryKey(),
  mirNumber: varchar('mir_number', { length: 60 }).notNull().unique(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  plcLineId: integer('plc_line_id').notNull(),
  grnRecordId: integer('grn_record_id').references(() => plcGrnRecords.id),
  issuedQty: decimal('issued_qty', { precision: 10, scale: 2 }).notNull(),
  issuedTo: varchar('issued_to', { length: 255 }),
  purposeNotes: text('purpose_notes'),
  issuedBy: integer('issued_by').references(() => users.id),
  issuedAt: timestamp('issued_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
export const insertPlcMaterialIssueSchema = createInsertSchema(plcMaterialIssues).omit({ id: true, createdAt: true });
export type InsertPlcMaterialIssue = z.infer<typeof insertPlcMaterialIssueSchema>;
export type PlcMaterialIssue = typeof plcMaterialIssues.$inferSelect;

// ─── 8. PLC Document Attachments ──────────────────────────────────────────
export const plcDocumentAttachments = pgTable('plc_document_attachments', {
  id: serial('id').primaryKey(),
  plcLineId: integer('plc_line_id'), // at least one of these must be set
  poGroupId: integer('po_group_id').references(() => epcPoGroups.id),
  epcPoId: integer('epc_po_id').references(() => epcPurchaseOrders.id),
  documentType: varchar('document_type', { length: 30 }).notNull().default('other'),
  // po | grn | inspection | certification | vendor_doc | other
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileSize: integer('file_size'),
  mimeType: varchar('mime_type', { length: 100 }),
  gcsPath: text('gcs_path').notNull(),
  sha256Hash: varchar('sha256_hash', { length: 64 }),
  isCurrent: boolean('is_current').notNull().default(true),
  uploadedBy: integer('uploaded_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
export const insertPlcDocumentAttachmentSchema = createInsertSchema(plcDocumentAttachments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlcDocumentAttachment = z.infer<typeof insertPlcDocumentAttachmentSchema>;
export type PlcDocumentAttachment = typeof plcDocumentAttachments.$inferSelect;

// ─── 9. Procurement List Audit Log (APPEND-ONLY — no UPDATE/DELETE permitted) ─
export const procurementListAuditLog = pgTable('procurement_list_audit_log', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 40 }).notNull(),
  // plc_line | po_group | po_amendment | grn | material_issue | vendor_qual | epc_po
  entityId: integer('entity_id').notNull(),
  eventType: varchar('event_type', { length: 80 }).notNull(),
  oldStatus: varchar('old_status', { length: 40 }),
  newStatus: varchar('new_status', { length: 40 }),
  changedBy: integer('changed_by').references(() => users.id),
  changedAt: timestamp('changed_at').notNull().defaultNow(),
  notes: text('notes'),
  metadata: jsonb('metadata'),
});
export type ProcurementListAuditLog = typeof procurementListAuditLog.$inferSelect;
// Note: NO insertSchema — all inserts go through logPlcAudit() in plc-line-service.ts

// ─── 10. RFQ Frozen Attachments (IMMUTABLE after creation — no UPDATE/DELETE) ─
export const plcRfqAttachments = pgTable('plc_rfq_attachments', {
  id:                 serial('id').primaryKey(),
  rfqId:              integer('rfq_id').notNull(),
  plcLineId:          integer('plc_line_id'),
  attachmentType:     varchar('attachment_type', { length: 30 }).notNull(),
  // Values: rfq_pdf | datasheet | tech_spec | t_and_c
  gcsBucket:          varchar('gcs_bucket', { length: 100 }).notNull(),
  gcsPath:            text('gcs_path').notNull(),
  originalFilename:   varchar('original_filename', { length: 255 }),
  fileSizeBytes:      bigint('file_size_bytes', { mode: 'number' }),
  mimeType:           varchar('mime_type', { length: 100 }),
  checksumSha256:     varchar('checksum_sha256', { length: 64 }),
  sourceRevisionSeq:  integer('source_revision_seq'),
  frozenAt:           timestamp('frozen_at').notNull().defaultNow(),
  frozenBy:           integer('frozen_by').references(() => users.id, { onDelete: 'set null' }),
});
export type PlcRfqAttachment = typeof plcRfqAttachments.$inferSelect;

// ─── 11. RFQ Vendor Dispatch Log (APPEND-ONLY — no UPDATE/DELETE permitted) ──
export const plcRfqDispatchLog = pgTable('plc_rfq_dispatch_log', {
  id:                   serial('id').primaryKey(),
  rfqId:                integer('rfq_id').notNull(),
  vendorId:             integer('vendor_id').notNull().references(() => vendors.id, { onDelete: 'restrict' }),
  emailTo:              text('email_to').notNull(),
  emailCc:              text('email_cc').array(),
  dispatchStatus:       varchar('dispatch_status', { length: 20 }).notNull(),
  // Values: sent | failed | no_email | resent
  nodemailMessageId:    text('nodemailer_message_id'),
  failureReason:        text('failure_reason'),
  attachmentCount:      integer('attachment_count').default(0),
  dispatchedAt:         timestamp('dispatched_at').notNull().defaultNow(),
  dispatchedBy:         integer('dispatched_by').references(() => users.id, { onDelete: 'set null' }),
  isResend:             boolean('is_resend').notNull().default(false),
  resendNumber:         integer('resend_number').notNull().default(0),
});
export type PlcRfqDispatchLog = typeof plcRfqDispatchLog.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT PATH & FOLDER TEMPLATE GOVERNANCE
// Phase 2 — Database Tables (baseline v1.0)
// ═══════════════════════════════════════════════════════════════════════════

// ─── 1. Document Path Templates ───────────────────────────────────────────
export const documentPathTemplates = pgTable('document_path_templates', {
  id:                     serial('id').primaryKey(),
  templateCode:           varchar('template_code', { length: 120 }).notNull().unique(),
  documentType:           varchar('document_type', { length: 50 }).notNull(),
  documentCategory:       varchar('document_category', { length: 80 }),
  // GCS identity fields — synced from gcs_governance_rules on every create/update
  ruleDisplayName:        varchar('rule_display_name', { length: 200 }),
  moduleKey:              varchar('module_key', { length: 80 }),
  submoduleKey:           varchar('submodule_key', { length: 80 }),
  relativePathTemplate:   text('relative_path_template').notNull(),
  fileNameTemplate:       varchar('file_name_template', { length: 255 }),
  revisionMode:           varchar('revision_mode', { length: 20 }).notNull().default('folder'),
  // folder = revision embedded in path segment (rev-{rev}), suffix = revision in filename
  fileExtension:          varchar('file_extension', { length: 20 }),
  active:                 boolean('active').notNull().default(true),
  gcsRuleId:              integer('gcs_rule_id').notNull(),
  createdAt:              timestamp('created_at').notNull().defaultNow(),
  updatedAt:              timestamp('updated_at').notNull().defaultNow(),
});
export const insertDocumentPathTemplateSchema = createInsertSchema(documentPathTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocumentPathTemplate = z.infer<typeof insertDocumentPathTemplateSchema>;
export type DocumentPathTemplate = typeof documentPathTemplates.$inferSelect;

// ─── 2. Folder Templates ──────────────────────────────────────────────────
export const folderTemplates = pgTable('folder_templates', {
  id:           serial('id').primaryKey(),
  templateCode: varchar('template_code', { length: 120 }).notNull().unique(),
  templateName: varchar('template_name', { length: 120 }).notNull(),
  description:  text('description'),
  companyCode:  varchar('company_code', { length: 20 }).notNull().default('TPEL'),
  active:       boolean('active').notNull().default(true),
  version:      varchar('version', { length: 20 }).notNull().default('1'),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
});
export const insertFolderTemplateSchema = createInsertSchema(folderTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFolderTemplate = z.infer<typeof insertFolderTemplateSchema>;
export type FolderTemplate = typeof folderTemplates.$inferSelect;

// ─── 3. Folder Template Nodes ─────────────────────────────────────────────
export const folderTemplateNodes = pgTable('folder_template_nodes', {
  id:                   serial('id').primaryKey(),
  folderTemplateId:     integer('folder_template_id').notNull().references(() => folderTemplates.id, { onDelete: 'cascade' }),
  parentId:             integer('parent_id'),
  // null = root-level node under the project root
  folderCode:           varchar('folder_code', { length: 80 }).notNull(),
  folderNameTemplate:   varchar('folder_name_template', { length: 255 }).notNull(),
  // may contain tokens: {Assembly}, {YYMMDD}, etc.
  sequence:             integer('sequence').notNull().default(0),
  module:               varchar('module', { length: 40 }),
  // sales | design | purchase | production | accounts | after_sales
  isDynamic:            boolean('is_dynamic').notNull().default(false),
  dynamicSource:        varchar('dynamic_source', { length: 80 }),
  // e.g. 'project_assemblies', 'meeting_dates'
  isRevisionControlled: boolean('is_revision_controlled').notNull().default(false),
  autoCreate:           boolean('auto_create').notNull().default(true),
  active:               boolean('active').notNull().default(true),
  createdAt:            timestamp('created_at').notNull().defaultNow(),
  updatedAt:            timestamp('updated_at').notNull().defaultNow(),
});
export const insertFolderTemplateNodeSchema = createInsertSchema(folderTemplateNodes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFolderTemplateNode = z.infer<typeof insertFolderTemplateNodeSchema>;
export type FolderTemplateNode = typeof folderTemplateNodes.$inferSelect;

// ─── 4. Resolved Project Folders ──────────────────────────────────────────
export const resolvedProjectFolders = pgTable('resolved_project_folders', {
  id:               serial('id').primaryKey(),
  projectId:        integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  folderTemplateId: integer('folder_template_id').notNull().references(() => folderTemplates.id),
  folderNodeId:     integer('folder_node_id').references(() => folderTemplateNodes.id),
  relativePath:     text('relative_path').notNull(),
  folderCode:       varchar('folder_code', { length: 80 }),
  status:           varchar('status', { length: 20 }).notNull().default('pending'),
  // pending | agent_created | agent_failed | skipped
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
});
export const insertResolvedProjectFolderSchema = createInsertSchema(resolvedProjectFolders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertResolvedProjectFolder = z.infer<typeof insertResolvedProjectFolderSchema>;
export type ResolvedProjectFolder = typeof resolvedProjectFolders.$inferSelect;

// ─── 5. Project Document Files ────────────────────────────────────────────
export const projectDocumentFiles = pgTable('project_document_files', {
  id:                 serial('id').primaryKey(),
  projectId:          integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  documentType:       varchar('document_type', { length: 50 }).notNull(),
  documentCategory:   varchar('document_category', { length: 80 }),
  relativeFolderPath: text('relative_folder_path').notNull(),
  fileName:           varchar('file_name', { length: 255 }).notNull(),
  relativeFilePath:   text('relative_file_path').notNull(),
  revision:           varchar('revision', { length: 10 }).notNull().default('00'),
  sha256:             varchar('sha256', { length: 64 }),
  fileSizeBytes:      bigint('file_size_bytes', { mode: 'number' }),
  storageStatus:      varchar('storage_status', { length: 20 }).notNull().default('pending'),
  // pending | synced | missing | error
  createdAt:          timestamp('created_at').notNull().defaultNow(),
  updatedAt:          timestamp('updated_at').notNull().defaultNow(),
});
export const insertProjectDocumentFileSchema = createInsertSchema(projectDocumentFiles).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProjectDocumentFile = z.infer<typeof insertProjectDocumentFileSchema>;
export type ProjectDocumentFile = typeof projectDocumentFiles.$inferSelect;

// ─── GCS Governance Phase 0 ───────────────────────────────────────────────

// 1. Token Registry — master list of valid path tokens
export const gcsGovernanceTokenRegistry = pgTable('gcs_governance_token_registry', {
  id:                serial('id').primaryKey(),
  tokenName:         varchar('token_name', { length: 50 }).notNull().unique(),
  description:       text('description').notNull(),
  exampleValue:      varchar('example_value', { length: 100 }).notNull(),
  sourceDescription: text('source_description').notNull(),
  active:            boolean('active').notNull().default(true),
  createdAt:         timestamp('created_at').notNull().defaultNow(),
});
export type GcsGovernanceToken = typeof gcsGovernanceTokenRegistry.$inferSelect;
export const insertGcsGovernanceTokenSchema = createInsertSchema(gcsGovernanceTokenRegistry).omit({ id: true, createdAt: true });
export type InsertGcsGovernanceToken = z.infer<typeof insertGcsGovernanceTokenSchema>;

// 2. Governance Rules — one row per module + document_type combination
export const gcsGovernanceRules = pgTable('gcs_governance_rules', {
  id:               serial('id').primaryKey(),
  moduleKey:        varchar('module_key', { length: 50 }).notNull(),
  submoduleKey:     varchar('submodule_key', { length: 50 }),
  documentType:     varchar('document_type', { length: 80 }).notNull(),
  displayName:      varchar('display_name', { length: 120 }).notNull(),
  rootPrefix:       text('root_prefix').notNull(),
  pathTemplate:     text('path_template').notNull(),
  revisionMode:     varchar('revision_mode', { length: 20 }).notNull().default('none'),
  allowedTokens:    text('allowed_tokens').array(),
  requiredTokens:   text('required_tokens').array(),
  maxFileSizeMb:    integer('max_file_size_mb'),
  allowedMimeTypes: text('allowed_mime_types').array(),
  active:           boolean('active').notNull().default(true),
  notes:            text('notes'),
  governanceMode:   varchar('governance_mode', { length: 20 }).notNull().default('hardcoded'),
  createdBy:        integer('created_by'),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:           timestamp('updated_at').notNull().defaultNow(),
  routingDeprecatedAt: timestamp('routing_deprecated_at'),
});
export type GcsGovernanceRule = typeof gcsGovernanceRules.$inferSelect;
export const insertGcsGovernanceRuleSchema = createInsertSchema(gcsGovernanceRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGcsGovernanceRule = z.infer<typeof insertGcsGovernanceRuleSchema>;

// 3. Upload Monitor Log — audit log in monitor-only mode (no blocking)
export const gcsUploadMonitorLog = pgTable('gcs_upload_monitor_log', {
  id:              serial('id').primaryKey(),
  detectedAt:      timestamp('detected_at').notNull().defaultNow(),
  matchedRuleId:   integer('matched_rule_id').references(() => gcsGovernanceRules.id),
  moduleKey:       varchar('module_key', { length: 50 }),
  documentType:    varchar('document_type', { length: 80 }),
  detectedGcsPath: text('detected_gcs_path').notNull(),
  pathConforms:    boolean('path_conforms'),
  violationReason: text('violation_reason'),
  fileSizeBytes:   bigint('file_size_bytes', { mode: 'number' }),
  mimeType:        varchar('mime_type', { length: 120 }),
  uploadedBy:      integer('uploaded_by'),
  routeFile:       varchar('route_file', { length: 200 }),
});
export type GcsUploadMonitorLog = typeof gcsUploadMonitorLog.$inferSelect;
export const insertGcsUploadMonitorLogSchema = createInsertSchema(gcsUploadMonitorLog).omit({ id: true, detectedAt: true });
export type InsertGcsUploadMonitorLog = z.infer<typeof insertGcsUploadMonitorLogSchema>;

// 4. Rule Versions — immutable versioned snapshots of pathTemplate + routing config (Phase 0)
export const gcsGovernanceRuleVersions = pgTable('gcs_governance_rule_versions', {
  id:                 serial('id').primaryKey(),
  ruleId:             integer('rule_id').notNull().references(() => gcsGovernanceRules.id),
  versionNumber:      integer('version_number').notNull(),
  pathTemplate:       text('path_template').notNull(),
  revisionMode:       varchar('revision_mode', { length: 20 }).notNull().default('none'),
  rootPrefix:         varchar('root_prefix', { length: 100 }).notNull(),
  displayName:        text('display_name').notNull(),
  notes:              text('notes'),
  status:             varchar('status', { length: 20 }).notNull().default('draft'),
  createdBy:          integer('created_by'),
  createdAt:          timestamp('created_at').notNull().defaultNow(),
  approvedBy:         integer('approved_by'),
  approvedAt:         timestamp('approved_at'),
  activatedBy:        integer('activated_by'),
  activatedAt:        timestamp('activated_at'),
  supersededAt:       timestamp('superseded_at'),
  validationEvidence: jsonb('validation_evidence'),
  diffFromPrev:       jsonb('diff_from_prev'),
}, (t) => ([
  uniqueIndex('gcs_rule_versions_one_active').on(t.ruleId).where(sql`status = 'active'`),
  uniqueIndex('gcs_rule_versions_rule_ver_num').on(t.ruleId, t.versionNumber),
]));
export type GcsGovernanceRuleVersion = typeof gcsGovernanceRuleVersions.$inferSelect;
export const insertGcsGovernanceRuleVersionSchema = createInsertSchema(gcsGovernanceRuleVersions).omit({ id: true, createdAt: true });
export type InsertGcsGovernanceRuleVersion = z.infer<typeof insertGcsGovernanceRuleVersionSchema>;

// 5. Upload Tokens — short-lived pre-authorisation tokens (Phase 1)
export const gcsUploadTokens = pgTable('gcs_upload_tokens', {
  id:               serial('id').primaryKey(),
  ruleId:           integer('rule_id').notNull().references(() => gcsGovernanceRules.id),
  tokenHash:        varchar('token_hash', { length: 64 }).notNull().unique(),
  resolvedPath:     text('resolved_path').notNull(),
  rootPrefix:       text('root_prefix').notNull(),
  moduleKey:        varchar('module_key', { length: 50 }).notNull(),
  documentType:     varchar('document_type', { length: 80 }).notNull(),
  tokenValues:      jsonb('token_values'),
  maxFileSizeBytes: bigint('max_file_size_bytes', { mode: 'number' }),
  allowedMimeTypes: text('allowed_mime_types').array(),
  issuedTo:         integer('issued_to').notNull(),
  issuedAt:         timestamp('issued_at').notNull().defaultNow(),
  expiresAt:        timestamp('expires_at').notNull(),
  usedAt:           timestamp('used_at'),
  usedForPath:      text('used_for_path'),
  notes:            text('notes'),
  versionId:        integer('version_id').references(() => gcsGovernanceRuleVersions.id),
});
export type GcsUploadToken = typeof gcsUploadTokens.$inferSelect;
export const insertGcsUploadTokenSchema = createInsertSchema(gcsUploadTokens).omit({ id: true, issuedAt: true });
export type InsertGcsUploadToken = z.infer<typeof insertGcsUploadTokenSchema>;

// 6. Governance Audit Log — records all version lifecycle events (Phase 0)
export const gcsGovernanceAuditLog = pgTable('gcs_governance_audit_log', {
  id:          serial('id').primaryKey(),
  eventType:   varchar('event_type', { length: 60 }).notNull(),
  ruleId:      integer('rule_id').references(() => gcsGovernanceRules.id),
  versionId:   integer('version_id').references(() => gcsGovernanceRuleVersions.id),
  actorId:     integer('actor_id'),
  actorRole:   varchar('actor_role', { length: 50 }),
  eventAt:     timestamp('event_at').notNull().defaultNow(),
  payload:     jsonb('payload'),
  ipAddress:   varchar('ip_address', { length: 45 }),
});
export type GcsGovernanceAuditLog = typeof gcsGovernanceAuditLog.$inferSelect;

// 7. Path Migration Log — tracks every hardcoded route pending migration (Phase 0)
export const gcsPathMigrationLog = pgTable('gcs_path_migration_log', {
  id:              serial('id').primaryKey(),
  ruleId:          integer('rule_id').notNull().references(() => gcsGovernanceRules.id),
  routeFile:       varchar('route_file', { length: 200 }).notNull(),
  routeFunction:   varchar('route_function', { length: 100 }),
  oldMethod:       varchar('old_method', { length: 100 }).notNull(),
  migrationPhase:  varchar('migration_phase', { length: 10 }).notNull(),
  migratedAt:      timestamp('migrated_at'),
  migratedBy:      integer('migrated_by'),
  status:          varchar('status', { length: 20 }).notNull().default('pending'),
  notes:           text('notes'),
});
export type GcsPathMigrationLog = typeof gcsPathMigrationLog.$inferSelect;

// 8. File Migration Jobs — tracks automated GCS object-level migration runs
//    triggered when a rule switches to DB-driven routing.
export const gcsFileMigrationJobs = pgTable('gcs_file_migration_jobs', {
  id:             serial('id').primaryKey(),
  ruleId:         integer('rule_id').notNull().references(() => gcsGovernanceRules.id),
  documentType:   varchar('document_type', { length: 80 }).notNull(),
  triggerReason:  varchar('trigger_reason', { length: 40 }).notNull().default('manual'),
  triggeredBy:    integer('triggered_by'),
  status:         varchar('status', { length: 20 }).notNull().default('pending'),
  totalFiles:     integer('total_files').notNull().default(0),
  processedFiles: integer('processed_files').notNull().default(0),
  migratedFiles:  integer('migrated_files').notNull().default(0),
  skippedFiles:   integer('skipped_files').notNull().default(0),
  failedFiles:    integer('failed_files').notNull().default(0),
  missingSrcFiles: integer('missing_src_files').notNull().default(0),
  errorLog:       jsonb('error_log').$type<Array<{fileId: number; oldPath: string; error: string; type?: string}>>(),
  startedAt:      timestamp('started_at').notNull().defaultNow(),
  completedAt:    timestamp('completed_at'),
});
export type GcsFileMigrationJob = typeof gcsFileMigrationJobs.$inferSelect;
export const insertGcsFileMigrationJobSchema = createInsertSchema(gcsFileMigrationJobs).omit({ id: true, startedAt: true });
export type InsertGcsFileMigrationJob = z.infer<typeof insertGcsFileMigrationJobSchema>;

export const gcsFileMigrationItems = pgTable('gcs_file_migration_items', {
  id:          serial('id').primaryKey(),
  jobId:       integer('job_id').notNull(),
  fileId:      integer('file_id').notNull(),
  tableName:   varchar('table_name', { length: 100 }).notNull(),
  beforePath:  text('before_path').notNull(),
  afterPath:   text('after_path'),
  status:      varchar('status', { length: 20 }).notNull().default('pending'),
  error:       text('error'),
  processedAt: timestamp('processed_at'),
});
export type GcsFileMigrationItem = typeof gcsFileMigrationItems.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Local Windows Document Agent — node registry
// ─────────────────────────────────────────────────────────────────────────────

export const documentAgentNodes = pgTable('document_agent_nodes', {
  id:               serial('id').primaryKey(),
  agentCode:        varchar('agent_code', { length: 100 }).notNull().unique(),
  apiKeyHash:       varchar('api_key_hash', { length: 255 }).notNull(),
  machineName:      varchar('machine_name', { length: 255 }),
  agentVersion:     varchar('agent_version', { length: 50 }),
  allowedRootPath:  varchar('allowed_root_path', { length: 500 }),
  environment:      varchar('environment', { length: 10 }).notNull().default('prod'),
  agentState:       varchar('agent_state', { length: 50 }).default('OFFLINE'),
  lastHeartbeatAt:  timestamp('last_heartbeat_at'),
  lastError:        text('last_error'),
  active:           boolean('active').notNull().default(true),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
});
export type DocumentAgentNode = typeof documentAgentNodes.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Local Windows Document Agent — job queue
// pending → processing → completed | failed
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Vendor Mandatory Compliance Documents
// One row per upload (immutable history). isActive=true marks the latest revision.
// GCS path: TPEL/VENDORS/{bpCode}/{docType}/rev-{NN}/{seq}-{label}.{ext}
// ─────────────────────────────────────────────────────────────────────────────

export const VENDOR_COMPLIANCE_DOC_TYPES = [
  'GST_CERTIFICATE',
  'PAN_CARD',
  'MSME_CERTIFICATE',
  'CANCELLED_CHEQUE',
  'VENDOR_REGISTRATION_FORM',
  'CONTACT_DETAILS_SHEET',
  'ADDRESS_PROOF',
] as const;

export const VENDOR_COMPLIANCE_DOC_LABELS: Record<string, string> = {
  GST_CERTIFICATE:        'GST Certificate',
  PAN_CARD:               'PAN Card',
  MSME_CERTIFICATE:       'MSME Certificate',
  CANCELLED_CHEQUE:       'Cancelled Cheque / Bank Proof',
  VENDOR_REGISTRATION_FORM: 'Vendor Registration Form',
  CONTACT_DETAILS_SHEET:  'Contact Details Sheet',
  ADDRESS_PROOF:          'Address Proof',
};

// Docs that must be present before a vendor can be approved.
export const VENDOR_COMPLIANCE_MANDATORY = ['GST_CERTIFICATE', 'PAN_CARD', 'CANCELLED_CHEQUE'];

export const vendorComplianceDocs = pgTable('vendor_compliance_docs', {
  id:             serial('id').primaryKey(),
  vendorId:       integer('vendor_id').notNull(),
  bpCode:         varchar('bp_code', { length: 50 }).notNull(),
  docType:        varchar('doc_type', { length: 50 }).notNull(),
  revisionNumber: integer('revision_number').notNull().default(0),
  fileName:       varchar('file_name', { length: 255 }).notNull(),
  gcsPath:        text('gcs_path').notNull(),
  contentType:    varchar('content_type', { length: 100 }),
  sizeBytes:      bigint('size_bytes', { mode: 'number' }),
  // 'uploaded' | 'expired' | 'pending_approval'
  status:         varchar('status', { length: 30 }).notNull().default('uploaded'),
  expiryDate:     date('expiry_date'),
  // Only the latest revision is active. Previous revisions: isActive=false.
  isActive:       boolean('is_active').notNull().default(true),
  uploadedBy:     integer('uploaded_by'),
  notes:          text('notes'),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
});

export type VendorComplianceDoc = typeof vendorComplianceDocs.$inferSelect;

export const documentAgentJobs = pgTable('document_agent_jobs', {
  id:               serial('id').primaryKey(),
  jobType:          varchar('job_type', { length: 50 }).notNull(),
  // CREATE_FOLDER | SAVE_FILE | SAVE_PDF | VERIFY_FILE_EXISTS | VERIFY_FOLDER_EXISTS | HASH_VALIDATE | LIST_DIRECTORY | SAVE_TEST_FILE | CREATE_PROJECT_STRUCTURE
  status:           varchar('status', { length: 50 }).notNull().default('pending'),
  // pending | claimed | completed | failed
  agentCode:        varchar('agent_code', { length: 100 }),
  relativePath:     text('relative_path').notNull(),
  fileUrl:          text('file_url'),
  fileName:         varchar('file_name', { length: 255 }),
  expectedSha256:   varchar('expected_sha256', { length: 64 }),
  actualSha256:     varchar('actual_sha256', { length: 64 }),
  resultLocalPath:  text('result_local_path'),
  inputPayload:     jsonb('input_payload'),
  resultPayload:    jsonb('result_payload'),
  failedReason:     text('failed_reason'),
  retryCount:       integer('retry_count').notNull().default(0),
  claimedAt:        timestamp('claimed_at'),
  completedAt:      timestamp('completed_at'),
  sourceRef:        varchar('source_ref', { length: 200 }),
  sourceModule:     text('source_module'),
  sourceRecordId:   integer('source_record_id'),
  createdBy:        integer('created_by'),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
});
export type DocumentAgentJob = typeof documentAgentJobs.$inferSelect;

// ── Project Folder Templates ───────────────────────────────────────────────────
// Manages the standard folder structures created on the Windows network share
// when a new SOR project is confirmed. Folder lists are snapshotted into
// document_agent_jobs.input_payload at enqueue time so retries are stable.

export const projectFolderTemplates = pgTable('project_folder_templates', {
  id:           serial('id').primaryKey(),
  templateCode: varchar('template_code', { length: 50 }).notNull().unique(),
  templateName: varchar('template_name', { length: 200 }).notNull(),
  description:  text('description'),
  projectType:  varchar('project_type', { length: 50 }),   // null = all types
  version:      integer('version').notNull().default(1),
  isActive:     boolean('is_active').notNull().default(true),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
  createdBy:    integer('created_by'),
  updatedBy:    integer('updated_by'),
});
export type ProjectFolderTemplate = typeof projectFolderTemplates.$inferSelect;

export const projectFolderTemplateItems = pgTable('project_folder_template_items', {
  id:           serial('id').primaryKey(),
  templateId:   integer('template_id').notNull().references(() => projectFolderTemplates.id, { onDelete: 'cascade' }),
  relativePath: text('relative_path').notNull(),  // relative to SOR root, forward slashes, no trailing slash
  sortOrder:    integer('sort_order').notNull().default(0),
  isActive:     boolean('is_active').notNull().default(true),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
});
export type ProjectFolderTemplateItem = typeof projectFolderTemplateItems.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Company Information Master — 8 tables
// Phase 1 baseline: docs/company-information-master-baseline-v1.md
// Partial unique indexes created at startup via company-seed.ts
// ─────────────────────────────────────────────────────────────────────────────

export const COMPANY_DOC_TYPES = [
  'GST_CERTIFICATE',
  'PAN_CARD',
  'IEC_CERTIFICATE',
  'LUT_COPY',
  'MSME_CERTIFICATE',
  'CANCELLED_CHEQUE_BOB',
  'CANCELLED_CHEQUE_ICICI',
  'LEI_CERTIFICATE',
  'RCMC_CERTIFICATE',
  'PT_REGISTRATION',
  'TAN_CERTIFICATE',
  'SHOP_ESTABLISHMENT_CERTIFICATE',
  'SSI_UDYAM_REGISTRATION',
  'MPCB_CTO',
  'INCORPORATION_CERTIFICATE',
  'FACTORY_DEED_OF_ASSIGNMENT_TRANSFER',
  'FACTORY_LICENSE',
  'ESIC_CERTIFICATE',
  'PF_ESI_DOCUMENT',
] as const;

export const COMPANY_DOC_LABELS: Record<string, string> = {
  GST_CERTIFICATE:              'GST Certificate',
  PAN_CARD:                     'PAN Card',
  IEC_CERTIFICATE:              'IEC Certificate',
  LUT_COPY:                     'LUT Copy',
  MSME_CERTIFICATE:             'MSME Certificate',
  CANCELLED_CHEQUE_BOB:         'Cancelled Cheque - Bank of Baroda',
  CANCELLED_CHEQUE_ICICI:       'Cancelled Cheque - ICICI Bank',
  LEI_CERTIFICATE:              'LEI Certificate',
  RCMC_CERTIFICATE:             'RCMC Certificate',
  PT_REGISTRATION:              'PT Registration',
  TAN_CERTIFICATE:              'TAN Certificate',
  SHOP_ESTABLISHMENT_CERTIFICATE:'Shop & Establishment Certificate',
  SSI_UDYAM_REGISTRATION:       'SSI / Udyam Registration',
  MPCB_CTO:                     'MPCB Consent to Operate',
  INCORPORATION_CERTIFICATE:    'Incorporation Certificate',
  FACTORY_DEED_OF_ASSIGNMENT_TRANSFER: 'Factory Deed of Assignment & Transfer',
  FACTORY_LICENSE:              'Factory License',
  ESIC_CERTIFICATE:             'ESIC Certificate',
  PF_ESI_DOCUMENT:              'PF / ESI Documents',
};

export const COMPANY_DOC_MANDATORY = [
  'GST_CERTIFICATE',
  'PAN_CARD',
  'CANCELLED_CHEQUE_BOB',
  'CANCELLED_CHEQUE_ICICI',
  'LEI_CERTIFICATE',
  'RCMC_CERTIFICATE',
  'PT_REGISTRATION',
  'TAN_CERTIFICATE',
  'SHOP_ESTABLISHMENT_CERTIFICATE',
  'SSI_UDYAM_REGISTRATION',
  'MPCB_CTO',
  'ESIC_CERTIFICATE',
  'INCORPORATION_CERTIFICATE',
];

export const COMPANY_ADDRESS_TYPES = [
  'registered_office',
  'corporate_office',
  'factory',
  'dispatch',
  'billing',
] as const;

export const ISO4217_ALLOWLIST = ['INR','USD','EUR','GBP','AED','SGD','JPY','CHF'] as const;

// 1. company_master
export const companyMaster = pgTable('company_master', {
  id:               serial('id').primaryKey(),
  companyCode:      varchar('company_code', { length: 10 }).notNull().unique(),
  shortName:        varchar('short_name', { length: 30 }).notNull(),
  legalName:        varchar('legal_name', { length: 120 }).notNull(),
  displayName:      varchar('display_name', { length: 120 }).notNull(),
  companyType:      varchar('company_type', { length: 40 }),
  industry:         varchar('industry', { length: 80 }),
  fyStartMonth:     integer('fy_start_month').notNull().default(4),
  baseCurrency:     varchar('base_currency', { length: 3 }).notNull().default('INR'),
  timezone:         varchar('timezone', { length: 60 }).notNull().default('Asia/Kolkata'),
  logoGcsPath:      text('logo_gcs_path'),
  signatureGcsPath: text('signature_gcs_path'),
  sealGcsPath:      text('seal_gcs_path'),
  phone:            varchar('phone', { length: 60 }),
  fax:              varchar('fax', { length: 60 }),
  email:            varchar('email', { length: 120 }),
  description:      text('description'),
  isActive:         boolean('is_active').notNull().default(true),
  version:          integer('version').notNull().default(1),
  createdBy:        integer('created_by'),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
});
export type CompanyMaster = typeof companyMaster.$inferSelect;

// 2. company_legal_tax (1:1 with company_master)
export const companyLegalTax = pgTable('company_legal_tax', {
  id:                   serial('id').primaryKey(),
  companyId:            integer('company_id').notNull().unique(),
  cin:                  varchar('cin', { length: 21 }),
  pan:                  varchar('pan', { length: 10 }),
  gstin:                varchar('gstin', { length: 15 }),
  iecCode:              varchar('iec_code', { length: 10 }),
  iecBranch:            varchar('iec_branch', { length: 40 }),
  lutNumber:            varchar('lut_number', { length: 40 }),
  lutValidityDate:      date('lut_validity_date'),
  lutFinancialYear:     varchar('lut_financial_year', { length: 10 }),
  msmeUdyam:            varchar('msme_udyam', { length: 20 }),
  tan:                  varchar('tan', { length: 10 }),
  pfNumber:             varchar('pf_number', { length: 20 }),
  esiNumber:            varchar('esi_number', { length: 17 }),
  gstRegistrationType:  varchar('gst_registration_type', { length: 40 }),
  gstStateCode:         varchar('gst_state_code', { length: 3 }),
  exportWithoutGst:     boolean('export_without_gst').notNull().default(false),
  adCode:               varchar('ad_code', { length: 14 }),
  authorizedDealerBank: varchar('authorized_dealer_bank', { length: 80 }),
  version:              integer('version').notNull().default(1),
  updatedBy:            integer('updated_by'),
  updatedAt:            timestamp('updated_at').notNull().defaultNow(),
});
export type CompanyLegalTax = typeof companyLegalTax.$inferSelect;

// 3. company_addresses
export const companyAddresses = pgTable('company_addresses', {
  id:           serial('id').primaryKey(),
  companyId:    integer('company_id').notNull(),
  addressType:  varchar('address_type', { length: 30 }).notNull(),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city:         varchar('city', { length: 60 }),
  district:     varchar('district', { length: 60 }),
  state:        varchar('state', { length: 60 }),
  country:      varchar('country', { length: 60 }).notNull().default('India'),
  pinCode:      varchar('pin_code', { length: 10 }),
  geoLat:       numeric('geo_lat', { precision: 10, scale: 6 }),
  geoLng:       numeric('geo_lng', { precision: 10, scale: 6 }),
  isActive:     boolean('is_active').notNull().default(true),
  version:      integer('version').notNull().default(1),
  updatedBy:    integer('updated_by'),
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
});
export type CompanyAddress = typeof companyAddresses.$inferSelect;

// 4. company_bank_accounts
export const companyBankAccounts = pgTable('company_bank_accounts', {
  id:              serial('id').primaryKey(),
  companyId:       integer('company_id').notNull(),
  bankName:        varchar('bank_name', { length: 80 }).notNull(),
  branch:          varchar('branch', { length: 80 }),
  beneficiaryName: varchar('beneficiary_name', { length: 120 }).notNull(),
  accountNumber:   varchar('account_number', { length: 20 }).notNull(),
  ifsc:            varchar('ifsc', { length: 11 }),
  swift:           varchar('swift', { length: 11 }),
  iban:            varchar('iban', { length: 34 }),
  currency:        varchar('currency', { length: 3 }).notNull().default('INR'),
  isPrimary:       boolean('is_primary').notNull().default(false),
  isActive:        boolean('is_active').notNull().default(true),
  version:         integer('version').notNull().default(1),
  createdBy:       integer('created_by'),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
});
export type CompanyBankAccount = typeof companyBankAccounts.$inferSelect;

// 5. company_erp_config (1:1 with company_master)
export const companyErpConfig = pgTable('company_erp_config', {
  id:                   serial('id').primaryKey(),
  companyId:            integer('company_id').notNull().unique(),
  sapCompanyDb:         varchar('sap_company_db', { length: 60 }),
  sapBranchCode:        varchar('sap_branch_code', { length: 20 }),
  defaultWarehouse:     varchar('default_warehouse', { length: 40 }),
  defaultCostCenter:    varchar('default_cost_center', { length: 40 }),
  defaultPaymentTerms:  varchar('default_payment_terms', { length: 80 }),
  defaultDeliveryTerms: varchar('default_delivery_terms', { length: 80 }),
  baseUom:              varchar('base_uom', { length: 20 }),
  decimalPrecision:     integer('decimal_precision').notNull().default(2),
  version:              integer('version').notNull().default(1),
  updatedBy:            integer('updated_by'),
  updatedAt:            timestamp('updated_at').notNull().defaultNow(),
});
export type CompanyErpConfig = typeof companyErpConfig.$inferSelect;

// 6. company_branding (1:1 with company_master)
export const companyBranding = pgTable('company_branding', {
  id:                serial('id').primaryKey(),
  companyId:         integer('company_id').notNull().unique(),
  defaultLetterhead: text('default_letterhead'),
  footerText:        text('footer_text'),
  termsConditions:   text('terms_conditions'),
  rfqFooter:         text('rfq_footer'),
  offerFooter:       text('offer_footer'),
  purchaseFooter:    text('purchase_footer'),
  reportWatermark:   text('report_watermark'),
  version:           integer('version').notNull().default(1),
  updatedBy:         integer('updated_by'),
  updatedAt:         timestamp('updated_at').notNull().defaultNow(),
});
export type CompanyBranding = typeof companyBranding.$inferSelect;

// 7. company_documents — GCS-governed revision chain
export const companyDocuments = pgTable('company_documents', {
  id:             serial('id').primaryKey(),
  companyId:      integer('company_id').notNull(),
  docType:        varchar('doc_type', { length: 40 }).notNull(),
  revisionNumber: integer('revision_number').notNull().default(1),
  fileName:       varchar('file_name', { length: 255 }).notNull(),
  gcsPath:        text('gcs_path').notNull(),
  contentType:    varchar('content_type', { length: 80 }),
  sizeBytes:      integer('size_bytes'),
  status:         varchar('status', { length: 20 }).notNull().default('uploaded'),
  expiryDate:     date('expiry_date'),
  isActive:       boolean('is_active').notNull().default(true),
  uploadedBy:     integer('uploaded_by').notNull(),
  uploadedAt:     timestamp('uploaded_at').notNull().defaultNow(),
  notes:          text('notes'),
});
export type CompanyDocument = typeof companyDocuments.$inferSelect;

// 8. company_audit_log — append-only, permanent retention
export const companyAuditLog = pgTable('company_audit_log', {
  id:         serial('id').primaryKey(),
  companyId:  integer('company_id').notNull(),
  action:     varchar('action', { length: 40 }).notNull(),
  tableName:  varchar('table_name', { length: 60 }),
  fieldName:  varchar('field_name', { length: 80 }),
  oldValue:   text('old_value'),
  newValue:   text('new_value'),
  changedBy:  integer('changed_by'),
  changedAt:  timestamp('changed_at').notNull().defaultNow(),
  ipAddress:  varchar('ip_address', { length: 45 }),
  userAgent:  text('user_agent'),
  notes:      text('notes'),
});
export type CompanyAuditLog = typeof companyAuditLog.$inferSelect;

// ============================================================
// OPERATIONAL INTELLIGENCE — Phase 1A
// ============================================================

export const oiIssueStatusEnum = pgEnum("oi_issue_status", [
  "captured","classified","investigating","rca_draft","rca_review","rca_approved",
  "capa_open","capa_in_progress","capa_verified","sop_review","erp_enforcement",
  "verified","closed","reopened","withdrawn",
]);
export const oiSeverityEnum = pgEnum("oi_severity", ["S1","S2","S3","S4"]);
export const oiCategoryEnum = pgEnum("oi_category", [
  "QC","DWG","PROC","MFG","SITE","COMM","LOG","DOC","SAP","COMP",
  "SAFETY","FIN","LEGAL","HR","CUST","SYS","INT","OTHER",
  "PROJECT","MAINT","STORE","SALES","QA",
]);
export const oiProjectPhaseEnum = pgEnum("oi_project_phase", [
  "SALES","ENG","DVS","PROC","MFG","QC","FAT","DISP","LOG",
  "SITE","ERECT","SAT","COMM","PERF","WARR","AFTS",
]);
export const oiProbabilityLevelEnum = pgEnum("oi_probability_level", [
  "very_low","low","medium","high","very_high",
]);
export const oiImpactLevelEnum = pgEnum("oi_impact_level", [
  "negligible","minor","moderate","major","catastrophic",
]);
export const oiRiskRatingEnum = pgEnum("oi_risk_rating", ["low","medium","high","critical"]);
export const oiCriticalityLevelEnum = pgEnum("oi_criticality_level", [
  "none","low","medium","high","critical",
]);
export const oiEscalationTypeEnum = pgEnum("oi_escalation_type", [
  "s1_immediate","safety_escalation","statutory_escalation","financial_escalation",
  "overdue_response","overdue_closure","severity_change","manual",
]);
export const oiAuditActionEnum = pgEnum("oi_audit_action", [
  "created","status_changed","field_updated","severity_changed","assigned",
  "escalated","comment_added","withdrawn","reopened","closed","verified",
  // Phase 1C: RCA audit actions
  "rca_created","rca_deleted","rca_reopened","five_why_updated",
  "fishbone_cause_added","fishbone_cause_updated","fishbone_cause_deleted",
  "failure_tree_node_added","failure_tree_node_updated","failure_tree_node_deleted",
  "rca_evidence_uploaded","rca_evidence_deleted","correlation_link_created","correlation_link_deleted",
  // Phase 1D: CAPA audit actions
  "capa_created","capa_deleted","capa_cancelled","capa_reopened",
  "capa_action_added","capa_action_updated","capa_action_completed",
  "capa_action_cancelled","capa_action_verified","capa_action_verification_rejected",
  "capa_effectiveness_recorded","capa_sla_breach",
  // Phase 2A: SOP audit actions
  "sop_created","sop_revised","sop_submitted_for_review","sop_approved","sop_rejected",
  "sop_activated","sop_retired","sop_linked","sop_unlinked",
  "sop_acknowledgment_assigned","sop_acknowledged","sop_acknowledgment_withdrawn",
  "sop_effectiveness_recorded",
  "suggestion_submitted","suggestion_reviewed",
  // Phase 2B: Enforcement audit actions
  "enforcement_control_created","enforcement_control_activated","enforcement_control_suspended","enforcement_control_retired",
  "enforcement_hold_raised","enforcement_hold_approved_to_proceed","enforcement_hold_released",
  "enforcement_hold_overridden","enforcement_checklist_item_checked","enforcement_checklist_item_rejected",
  "enforcement_hold_emergency_bypassed","enforcement_checklist_item_resubmitted",
  // Phase 3A: Lessons Learned audit actions
  "lesson_created","lesson_submitted_for_review","lesson_reviewer_assigned",
  "lesson_reviewer_voted","lesson_review_recused","lesson_approved",
  "lesson_rejected","lesson_published","lesson_archived","lesson_revised",
  "lesson_linked","lesson_unlinked","lesson_recurrence_recorded",
  "lesson_effectiveness_reviewed","lesson_cross_project_approved",
  "lesson_acknowledgment_required","lesson_acknowledged",
]);

export const oiIssues = pgTable("oi_issues", {
  id:                       serial("id").primaryKey(),
  issueNumber:              text("issue_number").notNull().unique(),
  title:                    text("title").notNull(),
  description:              text("description").notNull(),
  department:               text("department"),
  category:                 oiCategoryEnum("category").notNull(),
  subCategory:              text("sub_category"),
  projectPhase:             oiProjectPhaseEnum("project_phase").notNull(),
  severity:                 oiSeverityEnum("severity").notNull(),
  status:                   oiIssueStatusEnum("status").notNull().default("captured"),
  projectId:                integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  equipmentFamily:          text("equipment_family"),
  equipmentType:            text("equipment_type"),
  packageType:              text("package_type"),
  processSystem:            text("process_system"),
  utilitySystem:            text("utility_system"),
  skidSystem:               text("skid_system"),
  customerIndustry:         text("customer_industry"),
  criticalEquipmentFlag:    boolean("critical_equipment_flag").notNull().default(false),
  criticalPathFlag:         boolean("critical_path_flag").notNull().default(false),
  projectComplexity:        text("project_complexity"),
  probabilityLevel:         oiProbabilityLevelEnum("probability_level"),
  impactLevel:              oiImpactLevelEnum("impact_level"),
  riskScore:                integer("risk_score"),
  riskRating:               oiRiskRatingEnum("risk_rating"),
  recurrenceRisk:           text("recurrence_risk"),
  businessCriticality:      oiCriticalityLevelEnum("business_criticality"),
  customerCriticality:      oiCriticalityLevelEnum("customer_criticality"),
  safetyCriticality:        oiCriticalityLevelEnum("safety_criticality"),
  statutoryCriticality:     oiCriticalityLevelEnum("statutory_criticality"),
  financialCriticality:     oiCriticalityLevelEnum("financial_criticality"),
  operationalCriticality:   oiCriticalityLevelEnum("operational_criticality"),
  scheduleCriticality:      oiCriticalityLevelEnum("schedule_criticality"),
  oiRiskScore:              integer("oi_risk_score"),
  reportedBy:               integer("reported_by").notNull().references(() => users.id),
  assignedTo:               integer("assigned_to").references(() => users.id),
  riskOwner:                integer("risk_owner").references(() => users.id),
  escalationOwner:          integer("escalation_owner").references(() => users.id),
  technicalOwner:           integer("technical_owner").references(() => users.id),
  complianceOwner:          integer("compliance_owner").references(() => users.id),
  financialOwner:           integer("financial_owner").references(() => users.id),
  legalOwner:               integer("legal_owner").references(() => users.id),
  businessOwner:            integer("business_owner").references(() => users.id),
  classifiedBy:             integer("classified_by").references(() => users.id),
  classifiedAt:             timestamp("classified_at"),
  investigatingStartedAt:   timestamp("investigating_started_at"),
  verifiedBy:               integer("verified_by").references(() => users.id),
  verifiedAt:               timestamp("verified_at"),
  closedBy:                 integer("closed_by").references(() => users.id),
  closedAt:                 timestamp("closed_at"),
  reopenedBy:               integer("reopened_by").references(() => users.id),
  reopenedAt:               timestamp("reopened_at"),
  reopenReason:             text("reopen_reason"),
  withdrawnBy:              integer("withdrawn_by").references(() => users.id),
  withdrawnAt:              timestamp("withdrawn_at"),
  withdrawalReason:         text("withdrawal_reason"),
  severityChangedBy:        integer("severity_changed_by").references(() => users.id),
  severityChangedAt:        timestamp("severity_changed_at"),
  severityChangeReason:     text("severity_change_reason"),
  previousSeverity:         oiSeverityEnum("previous_severity"),
  occurredAt:               timestamp("occurred_at"),
  detectedAt:               timestamp("detected_at"),
  responseDueAt:            timestamp("response_due_at"),
  closureDueAt:             timestamp("closure_due_at"),
  responseSlaBreached:      boolean("response_sla_breached").notNull().default(false),
  closureSlaBreached:       boolean("closure_sla_breached").notNull().default(false),
  repeatIssue:              boolean("repeat_issue").notNull().default(false),
  parentIssueId:            integer("parent_issue_id"),
  estimatedLossAmount:      decimal("estimated_loss_amount", { precision: 15, scale: 2 }),
  liabilitySeverity:        text("liability_severity"),
  consequentialDamageFlag:  boolean("consequential_damage_flag").notNull().default(false),
  businessInterruptionFlag: boolean("business_interruption_flag").notNull().default(false),
  statutoryAuthority:       text("statutory_authority"),
  complianceStatus:         text("compliance_status"),
  statutorySeverity:        text("statutory_severity"),
  legalReviewRequired:      boolean("legal_review_required").notNull().default(false),
  fatReference:             text("fat_reference"),
  satReference:             text("sat_reference"),
  punchPointReference:      text("punch_point_reference"),
  readinessStatus:          text("readiness_status"),

  // ─── Phase 1B: Linkage FKs ─────────────────────────────────────────────────
  customerId:               integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  vendorId:                 integer("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
  epcDrawingControlId:      integer("epc_drawing_control_id").references(() => epcDrawingControls.id, { onDelete: "set null" }),
  epcPoId:                  integer("epc_po_id").references(() => epcPurchaseOrders.id, { onDelete: "set null" }),
  epcWoId:                  integer("epc_wo_id").references(() => epcWorkOrders.id, { onDelete: "set null" }),
  inspectionOrderId:        integer("inspection_order_id").references(() => inspectionOrders.id, { onDelete: "set null" }),
  fatInspectionOrderId:     integer("fat_inspection_order_id").references(() => inspectionOrders.id, { onDelete: "set null" }),
  satInspectionOrderId:     integer("sat_inspection_order_id").references(() => inspectionOrders.id, { onDelete: "set null" }),
  contractId:               integer("contract_id").references(() => contracts.id, { onDelete: "set null" }),

  // ─── Phase 1B: Dimension Scores ────────────────────────────────────────────
  technicalScore:           smallint("technical_score"),
  qualityScore:             smallint("quality_score"),
  safetyScore:              smallint("safety_score"),
  financialScore:           smallint("financial_score"),
  complianceScore:          smallint("compliance_score"),
  scheduleScore:            smallint("schedule_score"),
  liabilityScore:           smallint("liability_score"),
  customerScore:            smallint("customer_score"),
  operationalScore:         smallint("operational_score"),

  // ─── Phase 1B: Financial Exposure ──────────────────────────────────────────
  actualLossAmount:         decimal("actual_loss_amount", { precision: 15, scale: 2 }),
  insuranceClaimFlag:       boolean("insurance_claim_flag").notNull().default(false),
  claimReference:           text("claim_reference"),
  recoveryAmount:           decimal("recovery_amount", { precision: 15, scale: 2 }),
  netFinancialExposure:     decimal("net_financial_exposure", { precision: 15, scale: 2 }),

  // ─── Phase 1B: Liability ───────────────────────────────────────────────────
  liabilityType:            text("liability_type"),
  indemnityRequired:        boolean("indemnity_required").notNull().default(false),
  warrantyClaimFlag:        boolean("warranty_claim_flag").notNull().default(false),
  warrantyClaimReference:   text("warranty_claim_reference"),

  // ─── Phase 1B: Time Intelligence ───────────────────────────────────────────
  captureDelayHours:              decimal("capture_delay_hours",            { precision: 10, scale: 2 }),
  responseTimeActualHours:        decimal("response_time_actual_hours",     { precision: 10, scale: 2 }),
  investigationDurationHours:     decimal("investigation_duration_hours",   { precision: 10, scale: 2 }),
  totalResolutionHours:           decimal("total_resolution_hours",         { precision: 10, scale: 2 }),

  // ─── Phase 1C: RCA Control Fields ─────────────────────────────────────────
  rcaRequired:              boolean("rca_required").notNull().default(false),
  rcaDueDate:               timestamp("rca_due_date"),

  createdAt:                timestamp("created_at").notNull().defaultNow(),
  updatedAt:                timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  statusIdx:           index("idx_oi_issues_status").on(table.status),
  severityIdx:         index("idx_oi_issues_severity").on(table.severity),
  categoryIdx:         index("idx_oi_issues_category").on(table.category),
  reportedByIdx:       index("idx_oi_issues_reported_by").on(table.reportedBy),
  assignedToIdx:       index("idx_oi_issues_assigned_to").on(table.assignedTo),
  projectIdIdx:        index("idx_oi_issues_project_id").on(table.projectId),
  createdAtIdx:        index("idx_oi_issues_created_at").on(table.createdAt),
  severityStatusIdx:   index("idx_oi_issues_severity_status").on(table.severity, table.status),
  statusSevCreatedIdx: index("idx_oi_issues_status_severity_created").on(table.status, table.severity, table.createdAt),
}));

export const oiAuditLog = pgTable("oi_audit_log", {
  id:         serial("id").primaryKey(),
  issueId:    integer("issue_id").notNull().references(() => oiIssues.id, { onDelete: "cascade" }),
  action:     oiAuditActionEnum("action").notNull(),
  actorId:    integer("actor_id").notNull().references(() => users.id),
  actorName:  text("actor_name").notNull(),
  actorRole:  text("actor_role").notNull(),
  fieldName:  text("field_name"),
  oldValue:   text("old_value"),
  newValue:   text("new_value"),
  context:    text("context"),
  ipAddress:  text("ip_address"),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  issueIdIdx:   index("idx_oi_audit_issue_id").on(table.issueId),
  actorIdIdx:   index("idx_oi_audit_actor_id").on(table.actorId),
  createdAtIdx: index("idx_oi_audit_created_at").on(table.createdAt),
  actionIdx:    index("idx_oi_audit_action").on(table.action),
}));

export const oiEscalations = pgTable("oi_escalations", {
  id:                  serial("id").primaryKey(),
  issueId:             integer("issue_id").notNull().references(() => oiIssues.id, { onDelete: "cascade" }),
  escalationType:      oiEscalationTypeEnum("escalation_type").notNull(),
  triggeredBy:         integer("triggered_by").references(() => users.id),
  triggeredAt:         timestamp("triggered_at").notNull().defaultNow(),
  escalatedTo:         integer("escalated_to").references(() => users.id),
  notificationSent:    boolean("notification_sent").notNull().default(false),
  notificationSentAt:  timestamp("notification_sent_at"),
  context:             text("context"),
  resolved:            boolean("resolved").notNull().default(false),
  resolvedAt:          timestamp("resolved_at"),
  resolvedBy:          integer("resolved_by").references(() => users.id),
}, (table) => ({
  issueIdIdx: index("idx_oi_escalations_issue_id").on(table.issueId),
  typeIdx:    index("idx_oi_escalations_type").on(table.escalationType),
}));

export const oiRiskWeightConfig = pgTable("oi_risk_weight_config", {
  id:                serial("id").primaryKey(),
  technicalWeight:   decimal("technical_weight",   { precision: 4, scale: 2 }).notNull().default("1.0"),
  qualityWeight:     decimal("quality_weight",     { precision: 4, scale: 2 }).notNull().default("1.2"),
  safetyWeight:      decimal("safety_weight",      { precision: 4, scale: 2 }).notNull().default("2.0"),
  financialWeight:   decimal("financial_weight",   { precision: 4, scale: 2 }).notNull().default("1.5"),
  complianceWeight:  decimal("compliance_weight",  { precision: 4, scale: 2 }).notNull().default("1.8"),
  scheduleWeight:    decimal("schedule_weight",    { precision: 4, scale: 2 }).notNull().default("1.0"),
  liabilityWeight:   decimal("liability_weight",   { precision: 4, scale: 2 }).notNull().default("2.0"),
  customerWeight:    decimal("customer_weight",    { precision: 4, scale: 2 }).notNull().default("1.5"),
  operationalWeight: decimal("operational_weight", { precision: 4, scale: 2 }).notNull().default("1.0"),
  updatedBy:         integer("updated_by").references(() => users.id),
  updatedAt:         timestamp("updated_at").notNull().defaultNow(),
});

export const oiRiskMatrixConfig = pgTable("oi_risk_matrix_config", {
  id:          serial("id").primaryKey(),
  probability: integer("probability").notNull(),
  impact:      integer("impact").notNull(),
  riskRating:  oiRiskRatingEnum("risk_rating").notNull(),
  updatedBy:   integer("updated_by").references(() => users.id),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  probImpactUniq: uniqueIndex("idx_oi_risk_matrix_prob_impact").on(table.probability, table.impact),
}));

export const insertOiIssueSchema = createInsertSchema(oiIssues).omit({
  id: true, issueNumber: true, status: true, riskScore: true, riskRating: true,
  oiRiskScore: true, classifiedBy: true, classifiedAt: true,
  investigatingStartedAt: true, verifiedBy: true, verifiedAt: true,
  closedBy: true, closedAt: true, reopenedBy: true, reopenedAt: true,
  reopenReason: true, withdrawnBy: true, withdrawnAt: true, withdrawalReason: true,
  severityChangedBy: true, severityChangedAt: true, previousSeverity: true,
  responseDueAt: true, closureDueAt: true, responseSlaBreached: true,
  closureSlaBreached: true, createdAt: true, updatedAt: true,
  // Phase 1B computed fields — server-side only
  netFinancialExposure: true, captureDelayHours: true,
  responseTimeActualHours: true, investigationDurationHours: true, totalResolutionHours: true,
  // Phase 1C: SM+ patched fields — not accepted at issue creation
  rcaRequired: true, rcaDueDate: true,
});

// ─── Phase 1C: RCA Tables ─────────────────────────────────────────────────────
export const oiRcaRecords = pgTable('oi_rca_records', {
  id:                 serial('id').primaryKey(),
  issueId:            integer('issue_id').notNull().references(() => oiIssues.id, { onDelete: 'cascade' }),
  methodology:        text('methodology').notNull(),
  rootCauseCode:      text('root_cause_code').notNull().default('UNKNOWN'),
  rootCauseSummary:   text('root_cause_summary').notNull().default(''),
  contributingFactors: text('contributing_factors'),
  immediateCause:     text('immediate_cause'),
  underlyingCause:    text('underlying_cause'),
  systemicCause:      text('systemic_cause'),
  assignedTo:         integer('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  reviewerId:         integer('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
  approverId:         integer('approver_id').references(() => users.id, { onDelete: 'set null' }),
  status:             text('status').notNull().default('draft'),
  submittedAt:        timestamp('submitted_at'),
  reviewStartedAt:    timestamp('review_started_at'),
  approvedAt:         timestamp('approved_at'),
  rejectedAt:         timestamp('rejected_at'),
  rejectionReason:    text('rejection_reason'),
  revisionNumber:     integer('revision_number').notNull().default(1),
  createdBy:          integer('created_by').notNull().references(() => users.id),
  createdAt:          timestamp('created_at').notNull().defaultNow(),
  updatedAt:          timestamp('updated_at').notNull().defaultNow(),
});

export const oiRcaFiveWhy = pgTable('oi_rca_five_why', {
  id:           serial('id').primaryKey(),
  rcaId:        integer('rca_id').notNull().references(() => oiRcaRecords.id, { onDelete: 'cascade' }),
  whyLevel:     integer('why_level').notNull(),
  whyQuestion:  text('why_question').notNull(),
  whyAnswer:    text('why_answer').notNull(),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
});

export const oiRcaFishbone = pgTable('oi_rca_fishbone', {
  id:               serial('id').primaryKey(),
  rcaId:            integer('rca_id').notNull().references(() => oiRcaRecords.id, { onDelete: 'cascade' }),
  category:         text('category').notNull(),
  causeDescription: text('cause_description').notNull(),
  isPrimaryCause:   boolean('is_primary_cause').notNull().default(false),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
});

export const oiRcaFailureTreeNodes = pgTable('oi_rca_failure_tree_nodes', {
  id:            serial('id').primaryKey(),
  rcaId:         integer('rca_id').notNull().references(() => oiRcaRecords.id, { onDelete: 'cascade' }),
  parentId:      integer('parent_id'),  // self-ref FK enforced by migration only — no Drizzle .references() to avoid circular ref
  nodeType:      text('node_type').notNull(),
  nodeLabel:     text('node_label').notNull(),
  nodeNote:      text('node_note'),
  isTopEvent:    boolean('is_top_event').notNull().default(false),
  sequenceOrder: integer('sequence_order').notNull().default(0),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
});

export const oiRcaEvidence = pgTable('oi_rca_evidence', {
  id:            serial('id').primaryKey(),
  rcaId:         integer('rca_id').notNull().references(() => oiRcaRecords.id, { onDelete: 'cascade' }),
  fileName:      text('file_name').notNull(),
  gcsPath:       text('gcs_path').notNull(),
  fileSizeBytes: integer('file_size_bytes'),
  contentType:   text('content_type'),
  uploadedBy:    integer('uploaded_by').notNull().references(() => users.id),
  uploadedAt:    timestamp('uploaded_at').notNull().defaultNow(),
});

export const oiRcaSimilarLinks = pgTable('oi_rca_similar_links', {
  id:        serial('id').primaryKey(),
  issueIdA:  integer('issue_id_a').notNull().references(() => oiIssues.id, { onDelete: 'cascade' }),
  issueIdB:  integer('issue_id_b').notNull().references(() => oiIssues.id, { onDelete: 'cascade' }),
  linkType:  text('link_type').notNull().default('same_root_cause'),
  linkNote:  text('link_note'),
  linkedBy:  integer('linked_by').notNull().references(() => users.id),
  linkedAt:  timestamp('linked_at').notNull().defaultNow(),
});

// ─── Phase 1D: CAPA Records ──────────────────────────────────────────────────
export const oiCapaRecords = pgTable('oi_capa_records', {
  id:                     serial('id').primaryKey(),
  capaNumber:             text('capa_number').notNull().unique(),
  issueId:                integer('issue_id').notNull().references(() => oiIssues.id, { onDelete: 'restrict' }),
  rcaId:                  integer('rca_id').notNull().references(() => oiRcaRecords.id, { onDelete: 'restrict' }),
  capaType:               text('capa_type').notNull(),
  title:                  text('title').notNull(),
  description:            text('description').notNull(),
  rootCauseRef:           text('root_cause_ref'),
  priority:               text('priority').notNull().default('medium'),
  assignedTo:             integer('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  verifierId:             integer('verifier_id').references(() => users.id, { onDelete: 'set null' }),
  approverId:             integer('approver_id').references(() => users.id, { onDelete: 'set null' }),
  status:                 text('status').notNull().default('draft'),
  dueDate:                timestamp('due_date'),
  extendedDueDate:        timestamp('extended_due_date'),
  openedAt:               timestamp('opened_at'),
  inProgressAt:           timestamp('in_progress_at'),
  pendingVerificationAt:  timestamp('pending_verification_at'),
  effectivenessReviewAt:  timestamp('effectiveness_review_at'),
  closedAt:               timestamp('closed_at'),
  cancelledAt:            timestamp('cancelled_at'),
  cancellationReason:     text('cancellation_reason'),
  reOpenCount:            integer('re_open_count').notNull().default(0),
  createdBy:              integer('created_by').notNull().references(() => users.id),
  createdAt:              timestamp('created_at').notNull().defaultNow(),
  updatedAt:              timestamp('updated_at').notNull().defaultNow(),
});

export const oiCapaActions = pgTable('oi_capa_actions', {
  id:                 serial('id').primaryKey(),
  capaId:             integer('capa_id').notNull().references(() => oiCapaRecords.id, { onDelete: 'cascade' }),
  actionNo:           integer('action_no').notNull(),
  description:        text('description').notNull(),
  assignedTo:         integer('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  dueDate:            timestamp('due_date'),
  status:             text('status').notNull().default('open'),
  completedAt:        timestamp('completed_at'),
  completedBy:        integer('completed_by').references(() => users.id, { onDelete: 'set null' }),
  completionNote:     text('completion_note'),
  verificationStatus: text('verification_status').notNull().default('pending'),
  verifiedAt:         timestamp('verified_at'),
  verifiedBy:         integer('verified_by').references(() => users.id, { onDelete: 'set null' }),
  verificationNote:   text('verification_note'),
  createdBy:          integer('created_by').notNull().references(() => users.id),
  createdAt:          timestamp('created_at').notNull().defaultNow(),
  updatedAt:          timestamp('updated_at').notNull().defaultNow(),
});

export const oiCapaEffectiveness = pgTable('oi_capa_effectiveness', {
  id:                  serial('id').primaryKey(),
  capaId:              integer('capa_id').notNull().references(() => oiCapaRecords.id, { onDelete: 'cascade' }),
  reviewCycle:         integer('review_cycle').notNull().default(1),
  reviewerId:          integer('reviewer_id').notNull().references(() => users.id),
  reviewedAt:          timestamp('reviewed_at').notNull().defaultNow(),
  effectivenessScore:  integer('effectiveness_score').notNull(),
  isEffective:         boolean('is_effective').notNull(),
  recurrenceObserved:  boolean('recurrence_observed').notNull().default(false),
  evidenceNotes:       text('evidence_notes'),
  recommendation:      text('recommendation'),
});

export const oiCapaEscalationLog = pgTable('oi_capa_escalation_log', {
  id:      serial('id').primaryKey(),
  capaId:  integer('capa_id').notNull().references(() => oiCapaRecords.id, { onDelete: 'cascade' }),
  level:   integer('level').notNull(),
  firedAt: timestamp('fired_at').notNull().defaultNow(),
});

// ─── Phase 2A: SOP Records ───────────────────────────────────────────────────
export const oiSopRecords = pgTable("oi_sop_records", {
  id:                serial("id").primaryKey(),
  sopNumber:         text("sop_number").notNull().unique(),
  title:             text("title").notNull(),
  description:       text("description").notNull(),
  sopType:           text("sop_type").notNull(),
  department:        text("department").notNull(),
  applicableRole:    text("applicable_role").notNull().default("Employee"),
  processArea:       text("process_area").notNull(),
  documentReference: text("document_reference"),
  status:            text("status").notNull().default("draft"),
  ownerId:           integer("owner_id").references(() => users.id, { onDelete: "set null" }),
  approverId:        integer("approver_id").references(() => users.id, { onDelete: "set null" }),
  revisionNumber:    integer("revision_number").notNull().default(0),
  effectiveDate:     timestamp("effective_date"),
  reviewDueDate:     timestamp("review_due_date"),
  nextReviewDate:    timestamp("next_review_date"),
  activatedAt:       timestamp("activated_at"),
  retiredAt:         timestamp("retired_at"),
  createdBy:         integer("created_by").notNull().references(() => users.id),
  createdAt:         timestamp("created_at").notNull().defaultNow(),
  updatedAt:         timestamp("updated_at").notNull().defaultNow(),
});

export const oiSopSections = pgTable("oi_sop_sections", {
  id:             serial("id").primaryKey(),
  sopId:          integer("sop_id").notNull().references(() => oiSopRecords.id, { onDelete: "cascade" }),
  sectionNo:      varchar("section_no", { length: 20 }).notNull(),
  sectionTitle:   text("section_title").notNull(),
  sectionContent: text("section_content").notNull().default(""),
  sequence:       integer("sequence").notNull().default(0),
  isActive:       boolean("is_active").notNull().default(true),
  createdBy:      integer("created_by").notNull().references(() => users.id),
  updatedBy:      integer("updated_by").references(() => users.id),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
});

export const oiSopRevisions = pgTable("oi_sop_revisions", {
  id:               serial("id").primaryKey(),
  sopId:            integer("sop_id").notNull().references(() => oiSopRecords.id, { onDelete: "cascade" }),
  revisionNumber:   integer("revision_number").notNull(),
  changeSummary:    text("change_summary").notNull(),
  changeRationale:  text("change_rationale").notNull(),
  status:           text("status").notNull().default("draft"),
  submittedBy:      integer("submitted_by").references(() => users.id, { onDelete: "set null" }),
  submittedAt:      timestamp("submitted_at"),
  reviewedBy:       integer("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewNotes:      text("review_notes"),
  approvedBy:       integer("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt:       timestamp("approved_at"),
  rejectedBy:       integer("rejected_by").references(() => users.id, { onDelete: "set null" }),
  rejectionReason:  text("rejection_reason"),
  rejectedAt:       timestamp("rejected_at"),
  createdBy:        integer("created_by").notNull().references(() => users.id),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
  updatedAt:        timestamp("updated_at").notNull().defaultNow(),
});

export const oiSopLinkages = pgTable("oi_sop_linkages", {
  id:          serial("id").primaryKey(),
  sopId:       integer("sop_id").notNull().references(() => oiSopRecords.id, { onDelete: "cascade" }),
  linkedType:  text("linked_type").notNull(),
  linkedId:    integer("linked_id").notNull(),
  linkNote:    text("link_note").notNull(),
  linkedBy:    integer("linked_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

export const oiSopAcknowledgments = pgTable("oi_sop_acknowledgments", {
  id:                  serial("id").primaryKey(),
  sopId:               integer("sop_id").notNull().references(() => oiSopRecords.id, { onDelete: "cascade" }),
  revisionNumber:      integer("revision_number").notNull(),
  userId:              integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  assignedBy:          integer("assigned_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  assignedAt:          timestamp("assigned_at").notNull().defaultNow(),
  dueDate:             timestamp("due_date"),
  acknowledgedAt:      timestamp("acknowledged_at"),
  acknowledgmentNote:  text("acknowledgment_note"),
});

export const oiSopEffectiveness = pgTable("oi_sop_effectiveness", {
  id:                 serial("id").primaryKey(),
  sopId:              integer("sop_id").notNull().references(() => oiSopRecords.id, { onDelete: "cascade" }),
  reviewCycle:        integer("review_cycle").notNull().default(1),
  reviewerId:         integer("reviewer_id").notNull().references(() => users.id),
  reviewedAt:         timestamp("reviewed_at").notNull().defaultNow(),
  effectivenessScore: integer("effectiveness_score").notNull(),
  isEffective:        boolean("is_effective").notNull(),
  deviationObserved:  boolean("deviation_observed").notNull().default(false),
  requiresRevision:   boolean("requires_revision").notNull().default(false),
  evidenceNotes:      text("evidence_notes"),
  recommendation:     text("recommendation"),
});

export const oiSopAuditLog = pgTable("oi_sop_audit_log", {
  id:             serial("id").primaryKey(),
  sopId:          integer("sop_id").references(() => oiSopRecords.id, { onDelete: "set null" }),
  action:         oiAuditActionEnum("action").notNull(),
  actorId:        integer("actor_id").notNull().references(() => users.id),
  actorName:      text("actor_name").notNull(),
  actorRole:      text("actor_role").notNull(),
  fieldName:      text("field_name"),
  oldValue:       text("old_value"),
  newValue:       text("new_value"),
  department:     text("department"),
  applicableRole: text("applicable_role"),
  context:        text("context"),
  ipAddress:      text("ip_address"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

export const oiSopRevisionSuggestions = pgTable("oi_sop_revision_suggestions", {
  id:              serial("id").primaryKey(),
  sopId:           integer("sop_id").notNull().references(() => oiSopRecords.id, { onDelete: "cascade" }),
  sourceType:      text("source_type").notNull(),
  sourceId:        integer("source_id"),
  suggestedChange: text("suggested_change").notNull(),
  rationale:       text("rationale").notNull(),
  status:          text("status").notNull().default("pending"),
  suggestedBy:     integer("suggested_by").references(() => users.id, { onDelete: "set null" }),
  suggestedAt:     timestamp("suggested_at").notNull().defaultNow(),
  reviewedBy:      integer("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt:      timestamp("reviewed_at"),
  reviewNotes:     text("review_notes"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
});

export type OiSopRevisionSuggestion = typeof oiSopRevisionSuggestions.$inferSelect;

// ─── Phase 2B: ERP Enforcement Framework ─────────────────────────────────────

export const oiEnforcementControls = pgTable("oi_enforcement_controls", {
  id:                     serial("id").primaryKey(),
  controlNumber:          text("control_number").notNull().unique(),
  sopId:                  integer("sop_id").notNull().references(() => oiSopRecords.id, { onDelete: "restrict" }),
  sopRevisionNumber:      integer("sop_revision_number").notNull(),
  erpEntityType:          text("erp_entity_type").notNull(),
  controlType:            text("control_type").notNull(),
  enforcementLevel:       text("enforcement_level").notNull().default("advisory"),
  enforcementScope:       text("enforcement_scope").notNull().default("global"),
  scopeProjectId:         integer("scope_project_id").references(() => projects.id, { onDelete: "restrict" }),
  scopeEquipmentType:     text("scope_equipment_type"),
  title:                  text("title").notNull(),
  description:            text("description").notNull(),
  rationale:              text("rationale").notNull(),
  department:             text("department").notNull(),
  processArea:            text("process_area"),
  controlChecklistVersion: integer("control_checklist_version").notNull().default(0),
  status:                 text("status").notNull().default("draft"),
  ownerId:                integer("owner_id").notNull().references(() => users.id),
  approverId:             integer("approver_id").notNull().references(() => users.id),
  approvedBy:             integer("approved_by").references(() => users.id),
  approvedAt:             timestamp("approved_at"),
  suspendedBy:            integer("suspended_by").references(() => users.id),
  suspendedAt:            timestamp("suspended_at"),
  suspensionReason:       text("suspension_reason"),
  retiredBy:              integer("retired_by").references(() => users.id),
  retiredAt:              timestamp("retired_at"),
  retirementReason:       text("retirement_reason"),
  createdBy:              integer("created_by").notNull().references(() => users.id),
  createdAt:              timestamp("created_at").notNull().defaultNow(),
  updatedAt:              timestamp("updated_at").notNull().defaultNow(),
});

export const oiEnforcementChecklists = pgTable("oi_enforcement_checklists", {
  id:               serial("id").primaryKey(),
  controlId:        integer("control_id").notNull().references(() => oiEnforcementControls.id, { onDelete: "cascade" }),
  itemNumber:       integer("item_number").notNull(),
  title:            text("title").notNull(),
  description:      text("description"),
  isRequired:       boolean("is_required").notNull().default(true),
  evidenceRequired: boolean("evidence_required").notNull().default(false),
  sortOrder:        integer("sort_order").notNull().default(0),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
  updatedAt:        timestamp("updated_at").notNull().defaultNow(),
});

export const oiEnforcementHolds = pgTable("oi_enforcement_holds", {
  id:                      serial("id").primaryKey(),
  holdNumber:              text("hold_number").notNull().unique(),
  controlId:               integer("control_id").notNull().references(() => oiEnforcementControls.id, { onDelete: "restrict" }),
  erpEntityType:           text("erp_entity_type").notNull(),
  erpEntityId:             integer("erp_entity_id").notNull(),
  erpEntityRef:            text("erp_entity_ref"),
  enforcementLevel:        text("enforcement_level").notNull(),
  holdType:                text("hold_type").notNull(),
  enforcementScope:        text("enforcement_scope").notNull(),
  isPrimaryHold:           boolean("is_primary_hold").notNull().default(false),
  reason:                  text("reason").notNull(),
  status:                  text("status").notNull().default("open"),
  holdOwnerId:             integer("hold_owner_id").notNull().references(() => users.id),
  responsibleDepartment:   text("responsible_department").notNull(),
  escalationOwnerId:       integer("escalation_owner_id").notNull().references(() => users.id),
  holdApproverId:          integer("hold_approver_id").references(() => users.id),
  raisedBy:                integer("raised_by").notNull().references(() => users.id),
  raisedAt:                timestamp("raised_at").notNull().defaultNow(),
  approvedToProceedBy:     integer("approved_to_proceed_by").references(() => users.id),
  approvedToProceedAt:     timestamp("approved_to_proceed_at"),
  approvedToProceedNote:   text("approved_to_proceed_note"),
  releasedBy:              integer("released_by").references(() => users.id),
  releasedAt:              timestamp("released_at"),
  releaseNote:             text("release_note"),
  overrideBy:              integer("override_by").references(() => users.id),
  overrideAt:              timestamp("override_at"),
  overrideReason:          text("override_reason"),
  bypassBy:                integer("bypass_by").references(() => users.id),
  bypassAt:                timestamp("bypass_at"),
  bypassReason:            text("bypass_reason"),
  createdAt:               timestamp("created_at").notNull().defaultNow(),
  updatedAt:               timestamp("updated_at").notNull().defaultNow(),
});

export const oiEnforcementChecklistResponses = pgTable("oi_enforcement_checklist_responses", {
  id:                       serial("id").primaryKey(),
  holdId:                   integer("hold_id").notNull().references(() => oiEnforcementHolds.id, { onDelete: "cascade" }),
  checklistItemId:          integer("checklist_item_id").notNull().references(() => oiEnforcementChecklists.id, { onDelete: "restrict" }),
  sopRevisionNumber:        integer("sop_revision_number").notNull(),
  checklistRevisionNumber:  integer("checklist_revision_number").notNull(),
  responseStatus:           text("response_status").notNull().default("pending"),
  isChecked:                boolean("is_checked").notNull().default(false),
  evidenceNote:             text("evidence_note"),
  respondedBy:              integer("responded_by").references(() => users.id),
  respondedAt:              timestamp("responded_at"),
  rejectionReason:          text("rejection_reason"),
  rejectedBy:               integer("rejected_by").references(() => users.id),
  rejectedAt:               timestamp("rejected_at"),
  createdAt:                timestamp("created_at").notNull().defaultNow(),
  updatedAt:                timestamp("updated_at").notNull().defaultNow(),
});

export const oiEnforcementAuditLog = pgTable("oi_enforcement_audit_log", {
  id:              serial("id").primaryKey(),
  controlId:       integer("control_id").references(() => oiEnforcementControls.id, { onDelete: "set null" }),
  holdId:          integer("hold_id").references(() => oiEnforcementHolds.id, { onDelete: "set null" }),
  action:          oiAuditActionEnum("action").notNull(),
  actorId:         integer("actor_id").notNull().references(() => users.id),
  actorName:       text("actor_name").notNull(),
  actorRole:       text("actor_role").notNull(),
  fieldName:       text("field_name"),
  oldValue:        text("old_value"),
  newValue:        text("new_value"),
  context:         text("context"),
  ipAddress:       text("ip_address"),
  isOverrideEvent: boolean("is_override_event").notNull().default(false),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
});

export const insertOiEnforcementControlSchema = createInsertSchema(oiEnforcementControls).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOiEnforcementChecklistSchema = createInsertSchema(oiEnforcementChecklists).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOiEnforcementHoldSchema = createInsertSchema(oiEnforcementHolds).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOiEnforcementChecklistResponseSchema = createInsertSchema(oiEnforcementChecklistResponses).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOiEnforcementAuditLogSchema = createInsertSchema(oiEnforcementAuditLog).omit({ id: true, createdAt: true });

export type OiEnforcementControl           = typeof oiEnforcementControls.$inferSelect;
export type InsertOiEnforcementControl     = z.infer<typeof insertOiEnforcementControlSchema>;
export type OiEnforcementChecklist         = typeof oiEnforcementChecklists.$inferSelect;
export type InsertOiEnforcementChecklist   = z.infer<typeof insertOiEnforcementChecklistSchema>;
export type OiEnforcementHold              = typeof oiEnforcementHolds.$inferSelect;
export type InsertOiEnforcementHold        = z.infer<typeof insertOiEnforcementHoldSchema>;
export type OiEnforcementChecklistResponse = typeof oiEnforcementChecklistResponses.$inferSelect;
export type OiEnforcementAuditLog          = typeof oiEnforcementAuditLog.$inferSelect;

export type OiIssue          = typeof oiIssues.$inferSelect;
export type InsertOiIssue    = z.infer<typeof insertOiIssueSchema>;
export type OiAuditLog       = typeof oiAuditLog.$inferSelect;
export type OiEscalation     = typeof oiEscalations.$inferSelect;
export type OiRiskWeightConfig = typeof oiRiskWeightConfig.$inferSelect;
export type OiRiskMatrixConfig = typeof oiRiskMatrixConfig.$inferSelect;
export type OiRcaRecord        = typeof oiRcaRecords.$inferSelect;
export type OiRcaFiveWhy       = typeof oiRcaFiveWhy.$inferSelect;
export type OiRcaFishbone      = typeof oiRcaFishbone.$inferSelect;
export type OiRcaFailureTreeNode = typeof oiRcaFailureTreeNodes.$inferSelect;
export type OiRcaEvidence      = typeof oiRcaEvidence.$inferSelect;
export type OiCapaRecord        = typeof oiCapaRecords.$inferSelect;
export type OiCapaAction        = typeof oiCapaActions.$inferSelect;
export type OiCapaEffectiveness = typeof oiCapaEffectiveness.$inferSelect;
export type OiCapaEscalationLog = typeof oiCapaEscalationLog.$inferSelect;
export type OiRcaSimilarLink   = typeof oiRcaSimilarLinks.$inferSelect;
// Phase 2A SOP types
export type OiSopRecord          = typeof oiSopRecords.$inferSelect;
export type OiSopSection         = typeof oiSopSections.$inferSelect;
export type OiSopRevision        = typeof oiSopRevisions.$inferSelect;
export type OiSopLinkage         = typeof oiSopLinkages.$inferSelect;
export type OiSopAcknowledgment  = typeof oiSopAcknowledgments.$inferSelect;
export type OiSopEffectiveness   = typeof oiSopEffectiveness.$inferSelect;
export type OiSopAuditLog        = typeof oiSopAuditLog.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3A: Lessons Learned Platform
// ─────────────────────────────────────────────────────────────────────────────

export const oiLessonRecords = pgTable("oi_lesson_records", {
  id:                           serial("id").primaryKey(),
  lessonNumber:                 varchar("lesson_number", { length: 20 }).notNull().unique(),
  parentLessonId:               integer("parent_lesson_id").references((): any => oiLessonRecords.id, { onDelete: "restrict" }),
  revisionNumber:               integer("revision_number").notNull().default(1),
  isCurrentRevision:            boolean("is_current_revision").notNull().default(true),
  title:                        text("title").notNull(),
  titleHash:                    varchar("title_hash", { length: 32 }).notNull(),
  description:                  text("description").notNull(),
  lessonCategory:               varchar("lesson_category", { length: 50 }).notNull(),
  lessonType:                   varchar("lesson_type", { length: 30 }).notNull(),
  applicabilityScope:           varchar("applicability_scope", { length: 30 }).notNull().default("global"),
  scopeDepartment:              varchar("scope_department", { length: 100 }),
  scopeProjectId:               integer("scope_project_id").references(() => projects.id, { onDelete: "set null" }),
  scopeEquipmentType:           varchar("scope_equipment_type", { length: 100 }),
  tags:                         text("tags").array(),
  status:                       varchar("status", { length: 30 }).notNull().default("draft"),
  processArea:                  varchar("process_area", { length: 100 }),
  rootCauseSummary:             text("root_cause_summary"),
  recommendation:               text("recommendation").notNull(),
  implementationGuidance:       text("implementation_guidance"),
  priority:                     varchar("priority", { length: 20 }).notNull().default("normal"),
  recurrenceRisk:               varchar("recurrence_risk", { length: 20 }),
  crossProjectApplicable:       boolean("cross_project_applicable").notNull().default(false),
  crossProjectApprovedBy:       integer("cross_project_approved_by").references(() => users.id, { onDelete: "restrict" }),
  crossProjectApprovedAt:       timestamp("cross_project_approved_at"),
  effectivenessReviewDueMonths: integer("effectiveness_review_due_months").default(6),
  // ts_document (tsvector) lives in the DB only — updated via raw SQL; not in Drizzle schema
  authorId:                     integer("author_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  submittedAt:                  timestamp("submitted_at"),
  reviewDueAt:                  timestamp("review_due_at"),
  approvedBy:                   integer("approved_by").references(() => users.id, { onDelete: "restrict" }),
  approvedAt:                   timestamp("approved_at"),
  publishedBy:                  integer("published_by").references(() => users.id, { onDelete: "restrict" }),
  publishedAt:                  timestamp("published_at"),
  archivedBy:                   integer("archived_by").references(() => users.id, { onDelete: "restrict" }),
  archivedAt:                   timestamp("archived_at"),
  archiveReason:                text("archive_reason"),
  rejectedBy:                   integer("rejected_by").references(() => users.id, { onDelete: "restrict" }),
  rejectedAt:                   timestamp("rejected_at"),
  rejectionReason:              text("rejection_reason"),
  createdAt:                    timestamp("created_at").notNull().defaultNow(),
  updatedAt:                    timestamp("updated_at").notNull().defaultNow(),
});

export const oiLessonLinkages = pgTable("oi_lesson_linkages", {
  id:              serial("id").primaryKey(),
  lessonId:        integer("lesson_id").notNull().references(() => oiLessonRecords.id, { onDelete: "cascade" }),
  linkType:        varchar("link_type", { length: 30 }).notNull(),
  linkedEntityId:  integer("linked_entity_id").notNull(),
  linkedEntityRef: varchar("linked_entity_ref", { length: 100 }),
  linkNote:        text("link_note"),
  createdBy:       integer("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
});

export const oiLessonReviewers = pgTable("oi_lesson_reviewers", {
  id:           serial("id").primaryKey(),
  lessonId:     integer("lesson_id").notNull().references(() => oiLessonRecords.id, { onDelete: "cascade" }),
  reviewerId:   integer("reviewer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reviewStatus: varchar("review_status", { length: 20 }).notNull().default("pending"),
  reviewNote:   text("review_note"),
  reviewedAt:   timestamp("reviewed_at"),
  assignedBy:   integer("assigned_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  assignedAt:   timestamp("assigned_at").notNull().defaultNow(),
});

export const oiLessonRecurrenceChecks = pgTable("oi_lesson_recurrence_checks", {
  id:               serial("id").primaryKey(),
  lessonId:         integer("lesson_id").notNull().references(() => oiLessonRecords.id, { onDelete: "cascade" }),
  checkDate:        timestamp("check_date").notNull(),
  checkerId:        integer("checker_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  recurrenceFound:  boolean("recurrence_found").notNull().default(false),
  recurrenceDetail: text("recurrence_detail"),
  linkedIssueId:    integer("linked_issue_id").references(() => oiIssues.id, { onDelete: "set null" }),
  linkedRcaId:      integer("linked_rca_id").references(() => oiRcaRecords.id, { onDelete: "set null" }),
  recommendation:   text("recommendation"),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
});

export const oiLessonEffectivenessReviews = pgTable("oi_lesson_effectiveness_reviews", {
  id:                  serial("id").primaryKey(),
  lessonId:            integer("lesson_id").notNull().references(() => oiLessonRecords.id, { onDelete: "cascade" }),
  reviewDate:          timestamp("review_date").notNull(),
  reviewerId:          integer("reviewer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reviewStatus:        varchar("review_status", { length: 20 }).notNull().default("pending"),
  effectivenessRating: varchar("effectiveness_rating", { length: 30 }),
  observations:        text("observations"),
  recommendation:      text("recommendation"),
  nextReviewDue:       timestamp("next_review_due"),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
});

export const oiLessonAcknowledgments = pgTable("oi_lesson_acknowledgments", {
  id:                 serial("id").primaryKey(),
  lessonId:           integer("lesson_id").notNull().references(() => oiLessonRecords.id, { onDelete: "cascade" }),
  acknowledgmentType: varchar("acknowledgment_type", { length: 20 }).notNull(),
  targetDepartment:   varchar("target_department", { length: 100 }),
  targetProjectId:    integer("target_project_id").references(() => projects.id, { onDelete: "set null" }),
  isRequired:         boolean("is_required").notNull().default(true),
  dueDate:            timestamp("due_date"),
  acknowledgedBy:     integer("acknowledged_by").references(() => users.id, { onDelete: "restrict" }),
  acknowledgedAt:     timestamp("acknowledged_at"),
  acknowledgmentNote: text("acknowledgment_note"),
  status:             varchar("status", { length: 20 }).notNull().default("pending"),
  assignedBy:         integer("assigned_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  assignedAt:         timestamp("assigned_at").notNull().defaultNow(),
});

export const oiLessonAuditLog = pgTable("oi_lesson_audit_log", {
  id:        serial("id").primaryKey(),
  lessonId:  integer("lesson_id").notNull().references(() => oiLessonRecords.id, { onDelete: "cascade" }),
  action:    oiAuditActionEnum("action").notNull(),
  actorId:   integer("actor_id").notNull(),
  actorName: text("actor_name").notNull(),
  actorRole: text("actor_role").notNull(),
  fieldName: text("field_name"),
  oldValue:  text("old_value"),
  newValue:  text("new_value"),
  context:   text("context"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOiLessonRecordSchema             = createInsertSchema(oiLessonRecords).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOiLessonLinkageSchema            = createInsertSchema(oiLessonLinkages).omit({ id: true, createdAt: true });
export const insertOiLessonReviewerSchema           = createInsertSchema(oiLessonReviewers).omit({ id: true, assignedAt: true });
export const insertOiLessonRecurrenceCheckSchema    = createInsertSchema(oiLessonRecurrenceChecks).omit({ id: true, createdAt: true });
export const insertOiLessonEffectivenessReviewSchema = createInsertSchema(oiLessonEffectivenessReviews).omit({ id: true, createdAt: true });
export const insertOiLessonAcknowledgmentSchema     = createInsertSchema(oiLessonAcknowledgments).omit({ id: true, assignedAt: true });
export const insertOiLessonAuditLogSchema           = createInsertSchema(oiLessonAuditLog).omit({ id: true, createdAt: true });

export type OiLessonRecord               = typeof oiLessonRecords.$inferSelect;
export type InsertOiLessonRecord         = z.infer<typeof insertOiLessonRecordSchema>;
export type OiLessonLinkage              = typeof oiLessonLinkages.$inferSelect;
export type InsertOiLessonLinkage        = z.infer<typeof insertOiLessonLinkageSchema>;
export type OiLessonReviewer             = typeof oiLessonReviewers.$inferSelect;
export type InsertOiLessonReviewer       = z.infer<typeof insertOiLessonReviewerSchema>;
export type OiLessonRecurrenceCheck      = typeof oiLessonRecurrenceChecks.$inferSelect;
export type InsertOiLessonRecurrenceCheck = z.infer<typeof insertOiLessonRecurrenceCheckSchema>;
export type OiLessonEffectivenessReview  = typeof oiLessonEffectivenessReviews.$inferSelect;
export type InsertOiLessonEffectivenessReview = z.infer<typeof insertOiLessonEffectivenessReviewSchema>;
export type OiLessonAcknowledgment       = typeof oiLessonAcknowledgments.$inferSelect;
export type InsertOiLessonAcknowledgment = z.infer<typeof insertOiLessonAcknowledgmentSchema>;
export type OiLessonAuditLog             = typeof oiLessonAuditLog.$inferSelect;
export type InsertOiLessonAuditLog       = z.infer<typeof insertOiLessonAuditLogSchema>;

// ─── OI Issue Title Master ────────────────────────────────────────────────────
export const oiIssueTitleMaster = pgTable('oi_issue_title_master', {
  id:           serial('id').primaryKey(),
  title:        text('title').notNull(),
  department:   text('department'),
  category:     text('category'),
  projectPhase: text('project_phase'),
  isActive:     boolean('is_active').notNull().default(true),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
});

export const insertOiIssueTitleMasterSchema = createInsertSchema(oiIssueTitleMaster).omit({ id: true, createdAt: true });
export type OiIssueTitleMaster       = typeof oiIssueTitleMaster.$inferSelect;
export type InsertOiIssueTitleMaster = z.infer<typeof insertOiIssueTitleMasterSchema>;

// ─── Department Master ────────────────────────────────────────────────────────
export const departmentMaster = pgTable('department_master', {
  id:        serial('id').primaryKey(),
  name:      text('name').notNull(),
  code:      varchar('code', { length: 10 }),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive:  boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uqNameCI:    uniqueIndex('uq_dept_master_name_ci').on(sql`LOWER(${table.name})`),
  uqCode:      uniqueIndex('uq_dept_master_code').on(table.code),
  activeOrdIdx: index('idx_dept_master_active').on(table.isActive, table.sortOrder),
}));

export const insertDepartmentMasterSchema = createInsertSchema(departmentMaster)
  .omit({ id: true, createdAt: true })
  .extend({
    name: z.string().min(1).trim()
      .transform(s => s.replace(/\b\w/g, c => c.toUpperCase())),
  });

export type DepartmentMaster       = typeof departmentMaster.$inferSelect;
export type InsertDepartmentMaster = z.infer<typeof insertDepartmentMasterSchema>;

// ─── OI Issue Attachments ─────────────────────────────────────────────────────
export const oiIssueAttachments = pgTable("oi_issue_attachments", {
  id:           serial("id").primaryKey(),
  issueId:      integer("issue_id").notNull().references(() => oiIssues.id, { onDelete: "cascade" }),
  gcsPath:      text("gcs_path").notNull(),
  fileName:     text("file_name").notNull(),
  originalName: text("original_name").notNull(),
  mimeType:     text("mime_type").notNull(),
  sizeBytes:    integer("size_bytes").notNull(),
  seq:          integer("seq").notNull().default(1),
  uploadedBy:   integer("uploaded_by").notNull().references(() => users.id),
  uploadedAt:   timestamp("uploaded_at").notNull().defaultNow(),
}, (table) => ({
  issueIdIdx: index("idx_oi_att_issue_id").on(table.issueId),
}));
export type OiIssueAttachment = typeof oiIssueAttachments.$inferSelect;

// ─── HAZOP Module — Phase 1 Foundation ───────────────────────────────────────
// All 20 tables are additive. No existing tables modified.
// Governed by: docs/hazop-phase1-execution-plan-v1.0.md

// 1. hazop_studies
export const hazopStudies = pgTable('hazop_studies', {
  id:                  serial('id').primaryKey(),
  studyMode:           varchar('study_mode', { length: 30 }).notNull(),
  projectId:           integer('project_id').references(() => projects.id, { onDelete: 'restrict' }),
  studyNumber:         varchar('study_number', { length: 50 }).notNull().unique(),
  title:               varchar('title', { length: 200 }).notNull(),
  revision:            varchar('revision', { length: 10 }).notNull().default('A'),
  status:              varchar('status', { length: 30 }).notNull().default('draft'),
  studyLeader:         integer('study_leader').references(() => users.id),
  teamMembers:         jsonb('team_members'),
  studyDate:           date('study_date'),
  processDescription:  text('process_description'),
  designBasis:         text('design_basis'),
  conceptTitle:        varchar('concept_title', { length: 200 }),
  convertedToStudyId:  integer('converted_to_study_id'),
  convertedAt:         timestamp('converted_at'),
  convertedBy:         integer('converted_by').references(() => users.id),
  approvedBy:          integer('approved_by').references(() => users.id),
  approvedAt:          timestamp('approved_at'),
  createdBy:           integer('created_by').references(() => users.id),
  createdAt:           timestamp('created_at').notNull().defaultNow(),
  updatedAt:           timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  studyModeIdx:  index('idx_hazop_studies_mode').on(table.studyMode),
  projectIdx:    index('idx_hazop_studies_project').on(table.projectId),
  statusIdx:     index('idx_hazop_studies_status').on(table.status),
}));
export type HazopStudy = typeof hazopStudies.$inferSelect;

// 2. hazop_concept_equipment
export const hazopConceptEquipment = pgTable('hazop_concept_equipment', {
  id:                   serial('id').primaryKey(),
  studyId:              integer('study_id').notNull().references(() => hazopStudies.id, { onDelete: 'cascade' }),
  equipmentCategory:    varchar('equipment_category', { length: 50 }).notNull(),
  conceptTag:           varchar('concept_tag', { length: 50 }).notNull(),
  equipmentRole:        varchar('equipment_role', { length: 100 }),
  make:                 varchar('make', { length: 100 }),
  model:                varchar('model', { length: 100 }),
  kwRating:             numeric('kw_rating'),
  estimatedPressureMin: numeric('estimated_pressure_min'),
  estimatedPressureMax: numeric('estimated_pressure_max'),
  estimatedTempMin:     numeric('estimated_temp_min'),
  estimatedTempMax:     numeric('estimated_temp_max'),
  fluid:                varchar('fluid', { length: 100 }),
  hasVfd:               boolean('has_vfd').notNull().default(false),
  hazardousArea:        boolean('hazardous_area').notNull().default(false),
  areaClassification:   varchar('area_classification', { length: 30 }),
  designAssumption:     text('design_assumption'),
  isConfirmed:          boolean('is_confirmed').notNull().default(false),
  notes:                text('notes'),
  createdAt:            timestamp('created_at').notNull().defaultNow(),
  updatedAt:            timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  uqStudyTag: uniqueIndex('uq_hazop_concept_eq_tag').on(table.studyId, table.conceptTag),
}));
export type HazopConceptEquipment = typeof hazopConceptEquipment.$inferSelect;

// 3. hazop_concept_instruments
export const hazopConceptInstruments = pgTable('hazop_concept_instruments', {
  id:                  serial('id').primaryKey(),
  studyId:             integer('study_id').notNull().references(() => hazopStudies.id, { onDelete: 'cascade' }),
  conceptTag:          varchar('concept_tag', { length: 50 }).notNull(),
  instrumentClass:     varchar('instrument_class', { length: 30 }),
  serviceDescription:  varchar('service_description', { length: 200 }),
  signalType:          varchar('signal_type', { length: 20 }),
  estimatedRangeMin:   numeric('estimated_range_min'),
  estimatedRangeMax:   numeric('estimated_range_max'),
  units:               varchar('units', { length: 20 }),
  linkedEquipmentTag:  varchar('linked_equipment_tag', { length: 50 }),
  designAssumption:    text('design_assumption'),
  isConfirmed:         boolean('is_confirmed').notNull().default(false),
  notes:               text('notes'),
  createdAt:           timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  uqStudyTag: uniqueIndex('uq_hazop_concept_inst_tag').on(table.studyId, table.conceptTag),
}));
export type HazopConceptInstrument = typeof hazopConceptInstruments.$inferSelect;

// 4. hazop_design_assumptions
export const hazopDesignAssumptions = pgTable('hazop_design_assumptions', {
  id:                      serial('id').primaryKey(),
  studyId:                 integer('study_id').notNull().references(() => hazopStudies.id, { onDelete: 'cascade' }),
  assumptionNumber:        integer('assumption_number').notNull(),
  assumptionCategory:      varchar('assumption_category', { length: 50 }),
  description:             text('description').notNull(),
  basis:                   text('basis'),
  status:                  varchar('status', { length: 20 }).notNull().default('open'),
  confirmedAt:             timestamp('confirmed_at'),
  confirmedBy:             integer('confirmed_by').references(() => users.id),
  preservedOnConversion:   boolean('preserved_on_conversion').notNull().default(true),
  createdAt:               timestamp('created_at').notNull().defaultNow(),
});
export type HazopDesignAssumption = typeof hazopDesignAssumptions.$inferSelect;

// 5. hazop_process_loops — schema only in Phase 1; no UI/routes until Phase 2
export const hazopProcessLoops = pgTable('hazop_process_loops', {
  id:                   serial('id').primaryKey(),
  studyId:              integer('study_id').notNull().references(() => hazopStudies.id, { onDelete: 'cascade' }),
  projectId:            integer('project_id'),
  loopNumber:           integer('loop_number').notNull(),
  loopName:             varchar('loop_name', { length: 200 }).notNull(),
  designIntent:         text('design_intent'),
  fluid:                varchar('fluid', { length: 100 }),
  operatingPressureMin: numeric('operating_pressure_min'),
  operatingPressureMax: numeric('operating_pressure_max'),
  operatingTempMin:     numeric('operating_temp_min'),
  operatingTempMax:     numeric('operating_temp_max'),
  status:               varchar('status', { length: 20 }).notNull().default('draft'),
  sortOrder:            integer('sort_order').notNull(),
  createdAt:            timestamp('created_at').notNull().defaultNow(),
  updatedAt:            timestamp('updated_at').notNull().defaultNow(),
});
export type HazopProcessLoop = typeof hazopProcessLoops.$inferSelect;

// 6. hazop_process_steps — Phase 2 v2.0
// sequence_no scoped to (node_id). loop_id is denormalized for query convenience.
// outlet_destination: 'next_step'|'prev_step'|'start_of_loop'|'next_node'|
//   'next_loop'|'specific_step'|'recycle'|'bypass'|
//   'drain'|'vent'|'product_outlet'|'waste_outlet'
export const hazopProcessSteps = pgTable('hazop_process_steps', {
  id:                   serial('id').primaryKey(),
  nodeId:               integer('node_id').notNull().references(() => hazopNodes.id, { onDelete: 'cascade' }),
  loopId:               integer('loop_id').notNull().references(() => hazopProcessLoops.id, { onDelete: 'cascade' }),
  projectId:            integer('project_id'),
  sequenceNo:           integer('sequence_no').notNull(),
  equipmentCategory:    varchar('equipment_category', { length: 50 }).notNull(),
  equipmentTag:         varchar('equipment_tag', { length: 50 }),
  equipmentRole:        varchar('equipment_role', { length: 100 }),
  connectionType:       varchar('connection_type', { length: 50 }).notNull(),
  fromStep:             integer('from_step'),
  toStep:               integer('to_step'),
  outletType:           varchar('outlet_type', { length: 50 }),
  outletDestination:    varchar('outlet_destination', { length: 50 }).notNull(),
  outletDestinationRef: varchar('outlet_destination_ref', { length: 100 }),
  operatingPressure:    numeric('operating_pressure'),
  operatingTemperature: numeric('operating_temperature'),
  fluid:                varchar('fluid', { length: 100 }),
  remarks:              text('remarks'),
  sortOrder:            integer('sort_order').notNull(),
  createdAt:            timestamp('created_at').notNull().defaultNow(),
  updatedAt:            timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  uqNodeSeq: uniqueIndex('uq_hazop_step_node_seq').on(table.nodeId, table.sequenceNo),
}));
export type HazopProcessStep = typeof hazopProcessSteps.$inferSelect;

// 7. hazop_nodes — Phase 2 v2.0 — independent user-defined object under Loop
// node_reference = '{loop_number}.{node_number}' (computed server-side, stored)
// UNIQUE (loop_id, node_number) enforced.
export const hazopNodes = pgTable('hazop_nodes', {
  id:              serial('id').primaryKey(),
  studyId:         integer('study_id').notNull().references(() => hazopStudies.id, { onDelete: 'cascade' }),
  loopId:          integer('loop_id').notNull().references(() => hazopProcessLoops.id, { onDelete: 'cascade' }),
  nodeNumber:      integer('node_number').notNull(),
  nodeName:        varchar('node_name', { length: 200 }).notNull(),
  nodeReference:   varchar('node_reference', { length: 100 }).notNull(),
  nodeDescription: varchar('node_description', { length: 300 }),
  designIntent:    text('design_intent'),
  pAndIdRef:       varchar('p_and_id_ref', { length: 100 }),
  deviationCount:              integer('deviation_count').notNull().default(0),
  actionCount:                 integer('action_count').notNull().default(0),
  generatedAt:                 timestamp('generated_at'),
  generatedBy:                 integer('generated_by').references(() => users.id),
  // Phase 3B — TWFE process-function and regime fields
  processFunction:             varchar('process_function', { length: 50 }),
  operatingRegime:             varchar('operating_regime', { length: 20 }).notNull().default('atmospheric'),
  phaseState:                  varchar('phase_state', { length: 20 }).notNull().default('liquid'),
  topologyChangedAfterReview:  boolean('topology_changed_after_review').notNull().default(false),
}, (table) => ({
  uqLoopNode: uniqueIndex('uq_hazop_node_loop_num').on(table.loopId, table.nodeNumber),
}));
export type HazopNode = typeof hazopNodes.$inferSelect;

// 8. hazop_deviations
export const hazopDeviations = pgTable('hazop_deviations', {
  id:                   serial('id').primaryKey(),
  nodeId:               integer('node_id').notNull().references(() => hazopNodes.id, { onDelete: 'cascade' }),
  studyId:              integer('study_id').notNull().references(() => hazopStudies.id, { onDelete: 'cascade' }),
  deviationNumber:      varchar('deviation_number', { length: 50 }).notNull(),
  guideword:            varchar('guideword', { length: 20 }).notNull(),
  parameter:            varchar('parameter', { length: 20 }).notNull(),
  deviationDescription: varchar('deviation_description', { length: 200 }).notNull(),
  isCredible:           boolean('is_credible').notNull().default(true),
  credibilityReason:    text('credibility_reason'),
  reviewed:             boolean('reviewed').notNull().default(false),
  reviewedBy:           integer('reviewed_by').references(() => users.id),
  reviewedAt:           timestamp('reviewed_at'),
  createdAt:            timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  uqNodeGP: uniqueIndex('uq_hazop_dev_node_gp').on(table.nodeId, table.guideword, table.parameter),
}));
export type HazopDeviation = typeof hazopDeviations.$inferSelect;

// 9. hazop_causes
export const hazopCauses = pgTable('hazop_causes', {
  id:               serial('id').primaryKey(),
  deviationId:      integer('deviation_id').notNull().references(() => hazopDeviations.id, { onDelete: 'cascade' }),
  causeNumber:      integer('cause_number').notNull(),
  causeDescription: text('cause_description').notNull(),
  source:           varchar('source', { length: 10 }).notNull().default('library'),
  deleted:          boolean('deleted').notNull().default(false),
});
export type HazopCause = typeof hazopCauses.$inferSelect;

// 10. hazop_consequences
export const hazopConsequences = pgTable('hazop_consequences', {
  id:                       serial('id').primaryKey(),
  deviationId:              integer('deviation_id').notNull().references(() => hazopDeviations.id, { onDelete: 'cascade' }),
  consequenceNumber:        integer('consequence_number').notNull(),
  consequenceDescription:   text('consequence_description').notNull(),
  severity:                 varchar('severity', { length: 20 }),
  source:                   varchar('source', { length: 10 }).notNull().default('library'),
  deleted:                  boolean('deleted').notNull().default(false),
});
export type HazopConsequence = typeof hazopConsequences.$inferSelect;

// 11. hazop_safeguards
export const hazopSafeguards = pgTable('hazop_safeguards', {
  id:                   serial('id').primaryKey(),
  deviationId:          integer('deviation_id').notNull().references(() => hazopDeviations.id, { onDelete: 'cascade' }),
  safeguardNumber:      integer('safeguard_number').notNull(),
  safeguardDescription: text('safeguard_description').notNull(),
  safeguardType:        varchar('safeguard_type', { length: 30 }),
  tagRef:               varchar('tag_ref', { length: 50 }),
  source:               varchar('source', { length: 10 }).notNull().default('library'),
  deleted:              boolean('deleted').notNull().default(false),
});
export type HazopSafeguard = typeof hazopSafeguards.$inferSelect;

// 12. hazop_actions
export const hazopActions = pgTable('hazop_actions', {
  id:                serial('id').primaryKey(),
  deviationId:       integer('deviation_id').notNull().references(() => hazopDeviations.id, { onDelete: 'cascade' }),
  actionNumber:      integer('action_number').notNull(),
  actionDescription: text('action_description').notNull(),
  actionType:        varchar('action_type', { length: 30 }),
  assignedTo:        integer('assigned_to').references(() => users.id),
  dueDate:           date('due_date'),
  status:            varchar('status', { length: 20 }).notNull().default('open'),
  closeComments:     text('close_comments'),
  closedAt:          timestamp('closed_at'),
  source:            varchar('source', { length: 10 }).notNull().default('library'),
});
export type HazopAction = typeof hazopActions.$inferSelect;

// 13. hazop_safety_functions
export const hazopSafetyFunctions = pgTable('hazop_safety_functions', {
  id:                  serial('id').primaryKey(),
  studyId:             integer('study_id').notNull().references(() => hazopStudies.id, { onDelete: 'cascade' }),
  projectId:           integer('project_id'),
  sifNumber:           varchar('sif_number', { length: 50 }).notNull(),
  sifDescription:      varchar('sif_description', { length: 300 }).notNull(),
  initiatingCause:     text('initiating_cause').notNull(),
  initiatorTag:        varchar('initiator_tag', { length: 50 }),
  initiatorCondition:  varchar('initiator_condition', { length: 100 }),
  finalElementTag:     varchar('final_element_tag', { length: 50 }),
  finalElementAction:  varchar('final_element_action', { length: 100 }),
  sifType:             varchar('sif_type', { length: 30 }),
  safetyCritical:      boolean('safety_critical').notNull().default(false),
  sourceDeviationId:   integer('source_deviation_id').references(() => hazopDeviations.id, { onDelete: 'set null' }),
  sourceActionId:      integer('source_action_id').references(() => hazopActions.id, { onDelete: 'set null' }),
  silTarget:           varchar('sil_target', { length: 10 }),
  status:              varchar('status', { length: 20 }).notNull().default('draft'),
  createdAt:           timestamp('created_at').notNull().defaultNow(),
  updatedAt:           timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  uqStudySif: uniqueIndex('uq_hazop_sf_study_sif').on(table.studyId, table.sifNumber),
}));
export type HazopSafetyFunction = typeof hazopSafetyFunctions.$inferSelect;

// 14. hazop_ce_matrix (Cause & Effect Matrix — one per study)
export const hazopCeMatrix = pgTable('hazop_ce_matrix', {
  id:           serial('id').primaryKey(),
  studyId:      integer('study_id').notNull().references(() => hazopStudies.id, { onDelete: 'cascade' }).unique(),
  projectId:    integer('project_id'),
  matrixNumber: varchar('matrix_number', { length: 50 }).notNull(),
  revision:     varchar('revision', { length: 10 }).notNull().default('A'),
  status:       varchar('status', { length: 20 }).notNull().default('draft'),
  generatedAt:  timestamp('generated_at'),
  approvedBy:   integer('approved_by').references(() => users.id),
  approvedAt:   timestamp('approved_at'),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
});
export type HazopCeMatrix = typeof hazopCeMatrix.$inferSelect;

// 15. hazop_ce_causes
export const hazopCeCauses = pgTable('hazop_ce_causes', {
  id:               serial('id').primaryKey(),
  matrixId:         integer('matrix_id').notNull().references(() => hazopCeMatrix.id, { onDelete: 'cascade' }),
  rowNumber:        integer('row_number').notNull(),
  causeTag:         varchar('cause_tag', { length: 50 }).notNull(),
  causeDescription: varchar('cause_description', { length: 200 }).notNull(),
  causeCondition:   varchar('cause_condition', { length: 100 }),
  causeType:        varchar('cause_type', { length: 20 }),
  sourceSifId:      integer('source_sif_id').references(() => hazopSafetyFunctions.id, { onDelete: 'set null' }),
});
export type HazopCeCause = typeof hazopCeCauses.$inferSelect;

// 16. hazop_ce_effects
export const hazopCeEffects = pgTable('hazop_ce_effects', {
  id:               serial('id').primaryKey(),
  matrixId:         integer('matrix_id').notNull().references(() => hazopCeMatrix.id, { onDelete: 'cascade' }),
  colNumber:        integer('col_number').notNull(),
  effectTag:        varchar('effect_tag', { length: 50 }).notNull(),
  effectDescription: varchar('effect_description', { length: 200 }).notNull(),
  effectAction:     varchar('effect_action', { length: 50 }),
  sourceSifId:      integer('source_sif_id').references(() => hazopSafetyFunctions.id, { onDelete: 'set null' }),
});
export type HazopCeEffect = typeof hazopCeEffects.$inferSelect;

// 17. hazop_ce_cells
export const hazopCeCells = pgTable('hazop_ce_cells', {
  id:            serial('id').primaryKey(),
  matrixId:      integer('matrix_id').notNull().references(() => hazopCeMatrix.id, { onDelete: 'cascade' }),
  causeId:       integer('cause_id').notNull().references(() => hazopCeCauses.id, { onDelete: 'cascade' }),
  effectId:      integer('effect_id').notNull().references(() => hazopCeEffects.id, { onDelete: 'cascade' }),
  action:        varchar('action', { length: 10 }),
  timeDelaySec:  integer('time_delay_sec').notNull().default(0),
  notes:         varchar('notes', { length: 200 }),
}, (table) => ({
  uqCauseEffect: uniqueIndex('uq_hazop_ce_cell').on(table.causeId, table.effectId),
}));
export type HazopCeCell = typeof hazopCeCells.$inferSelect;

// 18. hazop_fat_sat_items
export const hazopFatSatItems = pgTable('hazop_fat_sat_items', {
  id:              serial('id').primaryKey(),
  studyId:         integer('study_id').notNull().references(() => hazopStudies.id, { onDelete: 'cascade' }),
  projectId:       integer('project_id'),
  checklistType:   varchar('checklist_type', { length: 5 }).notNull(),
  itemNumber:      integer('item_number').notNull(),
  sifId:           integer('sif_id').references(() => hazopSafetyFunctions.id, { onDelete: 'set null' }),
  causeId:         integer('cause_id').references(() => hazopCeCauses.id, { onDelete: 'set null' }),
  effectId:        integer('effect_id').references(() => hazopCeEffects.id, { onDelete: 'set null' }),
  testDescription: text('test_description').notNull(),
  expectedResult:  varchar('expected_result', { length: 300 }),
  actualResult:    varchar('actual_result', { length: 300 }),
  status:          varchar('status', { length: 20 }).notNull().default('not_tested'),
  remarks:         text('remarks'),
  testedBy:        integer('tested_by').references(() => users.id),
  testedAt:        timestamp('tested_at'),
});
export type HazopFatSatItem = typeof hazopFatSatItems.$inferSelect;

// 19. hazop_revisions
export const hazopRevisions = pgTable('hazop_revisions', {
  id:                serial('id').primaryKey(),
  studyId:           integer('study_id').notNull().references(() => hazopStudies.id, { onDelete: 'cascade' }),
  documentType:      varchar('document_type', { length: 30 }),
  revision:          varchar('revision', { length: 10 }).notNull(),
  changeDescription: text('change_description').notNull(),
  changedBy:         integer('changed_by').notNull().references(() => users.id),
  changedAt:         timestamp('changed_at').notNull().defaultNow(),
});
export type HazopRevision = typeof hazopRevisions.$inferSelect;

// 20. hazop_deviation_library
export const hazopDeviationLibrary = pgTable('hazop_deviation_library', {
  id:                   serial('id').primaryKey(),
  equipmentCategory:    varchar('equipment_category', { length: 50 }).notNull(),
  guideword:            varchar('guideword', { length: 20 }).notNull(),
  parameter:            varchar('parameter', { length: 20 }).notNull(),
  applicable:           boolean('applicable').notNull().default(true),
  deviationDescription: varchar('deviation_description', { length: 200 }).notNull(),
  typicalCauses:        jsonb('typical_causes').notNull().default([]),
  typicalConsequences:  jsonb('typical_consequences').notNull().default([]),
  typicalSafeguards:    jsonb('typical_safeguards').notNull().default([]),
  typicalActions:       jsonb('typical_actions').notNull().default([]),
  version:              integer('version').notNull().default(1),
}, (table) => ({
  uqCatGP: uniqueIndex('uq_hazop_lib_cat_gp').on(table.equipmentCategory, table.guideword, table.parameter),
}));
export type HazopDeviationLibrary = typeof hazopDeviationLibrary.$inferSelect;

// ─── HAZOP Module — Phase 4A Safety Logic Modeling Layer ─────────────────────
// All 4 tables are additive. No existing tables modified.
// Governed by: docs/hazop-phase4-execution-plan-v1.3.md

// 21. hazop_event_groups
export const hazopEventGroups = pgTable('hazop_event_groups', {
  id:                     serial('id').primaryKey(),
  studyId:                integer('study_id').notNull().references(() => hazopStudies.id, { onDelete: 'cascade' }),
  groupNumber:            text('group_number').notNull(),
  groupName:              text('group_name').notNull(),
  eventType:              text('event_type').notNull(),
  processTransitionType:  text('process_transition_type'),
  consequenceSeverity:    text('consequence_severity'),
  operatingMode:          text('operating_mode'),
  commonCauseGroup:       text('common_cause_group'),
  description:            text('description'),
  operatingRegime:        text('operating_regime'),
  phaseState:             text('phase_state'),
  processFunction:        text('process_function'),
  source:                 text('source').notNull().default('manual'),
  createdAt:              timestamp('created_at').notNull().defaultNow(),
  createdBy:              integer('created_by').references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  uqStudyGroupNum: uniqueIndex('uq_hazop_eg_study_num').on(table.studyId, table.groupNumber),
}));
export type HazopEventGroup = typeof hazopEventGroups.$inferSelect;

// 22. hazop_event_group_members
export const hazopEventGroupMembers = pgTable('hazop_event_group_members', {
  id:           serial('id').primaryKey(),
  groupId:      integer('group_id').notNull().references(() => hazopEventGroups.id, { onDelete: 'cascade' }),
  deviationId:  integer('deviation_id').notNull().references(() => hazopDeviations.id, { onDelete: 'cascade' }),
}, (table) => ({
  uqGroupDev: uniqueIndex('uq_hazop_egm_group_dev').on(table.groupId, table.deviationId),
}));
export type HazopEventGroupMember = typeof hazopEventGroupMembers.$inferSelect;

// 23. hazop_response_groups
export const hazopResponseGroups = pgTable('hazop_response_groups', {
  id:                            serial('id').primaryKey(),
  studyId:                       integer('study_id').notNull().references(() => hazopStudies.id, { onDelete: 'cascade' }),
  groupNumber:                   text('group_number').notNull(),
  groupName:                     text('group_name').notNull(),
  protectionLayer:               text('protection_layer').notNull(),
  logicType:                     text('logic_type'),
  criticalityClass:              text('criticality_class'),
  effectivenessRating:           text('effectiveness_rating'),
  humanDependencyLevel:          text('human_dependency_level'),
  operatingMode:                 text('operating_mode'),
  isIndependentProtectionLayer:  boolean('is_independent_protection_layer').notNull().default(false),
  commonCauseGroup:              text('common_cause_group'),
  description:                   text('description'),
  source:                        text('source').notNull().default('manual'),
  createdAt:                     timestamp('created_at').notNull().defaultNow(),
  createdBy:                     integer('created_by').references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  uqStudyRgNum: uniqueIndex('uq_hazop_rg_study_num').on(table.studyId, table.groupNumber),
}));
export type HazopResponseGroup = typeof hazopResponseGroups.$inferSelect;

// 24. hazop_response_group_actions
export const hazopResponseGroupActions = pgTable('hazop_response_group_actions', {
  id:                  serial('id').primaryKey(),
  responseGroupId:     integer('response_group_id').notNull().references(() => hazopResponseGroups.id, { onDelete: 'cascade' }),
  sequenceNo:          integer('sequence_no').notNull(),
  actionDescription:   text('action_description').notNull(),
  actionType:          text('action_type'),
  tagRef:              text('tag_ref'),
  confidenceScore:     integer('confidence_score'),
  sourceSafeguardId:   integer('source_safeguard_id').references(() => hazopSafeguards.id, { onDelete: 'set null' }),
  sourceActionId:      integer('source_action_id').references(() => hazopActions.id, { onDelete: 'set null' }),
}, (table) => ({
  uqRgSeq: uniqueIndex('uq_hazop_rga_rg_seq').on(table.responseGroupId, table.sequenceNo),
}));
export type HazopResponseGroupAction = typeof hazopResponseGroupActions.$inferSelect;

// ─── HAZOP Module — Phase 4B Engineering Safety Artefacts ─────────────────────
// All tables are additive. Governed by: docs/hazop-phase4-execution-plan-v1.3.md

// 25. hazop_ce_matrices  (v1.3 — separate from legacy hazop_ce_matrix)
export const hazopCeMatrices = pgTable('hazop_ce_matrices', {
  id:               serial('id').primaryKey(),
  studyId:          integer('study_id').notNull().references(() => hazopStudies.id, { onDelete: 'cascade' }),
  nodeId:           integer('node_id').references(() => hazopNodes.id, { onDelete: 'set null' }),
  matrixNumber:     text('matrix_number').notNull(),
  title:            text('title'),
  scopeDescription: text('scope_description'),
  baselineRevision: text('baseline_revision'),
  status:           text('status').notNull().default('draft'),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  createdBy:        integer('created_by').references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  uqStudyMatNum: uniqueIndex('uq_hazop_cem_study_num').on(table.studyId, table.matrixNumber),
}));
export type HazopCeMatrix_v13 = typeof hazopCeMatrices.$inferSelect;

// 26. hazop_ce_rows
export const hazopCeRows = pgTable('hazop_ce_rows', {
  id:               serial('id').primaryKey(),
  matrixId:         integer('matrix_id').notNull().references(() => hazopCeMatrices.id, { onDelete: 'cascade' }),
  rowNumber:        integer('row_number').notNull(),
  description:      text('description').notNull(),
  eventType:        text('event_type'),
  tagRef:           text('tag_ref'),
  sourceDeviationId: integer('source_deviation_id').references(() => hazopDeviations.id, { onDelete: 'set null' }),
  sourceCauseId:    integer('source_cause_id').references(() => hazopCauses.id, { onDelete: 'set null' }),
  eventGroupId:     integer('event_group_id').references(() => hazopEventGroups.id, { onDelete: 'set null' }),
}, (table) => ({
  uqMatRow: uniqueIndex('uq_hazop_cer_mat_row').on(table.matrixId, table.rowNumber),
}));
export type HazopCeRow = typeof hazopCeRows.$inferSelect;

// 27. hazop_ce_columns
export const hazopCeColumns = pgTable('hazop_ce_columns', {
  id:               serial('id').primaryKey(),
  matrixId:         integer('matrix_id').notNull().references(() => hazopCeMatrices.id, { onDelete: 'cascade' }),
  colNumber:        integer('col_number').notNull(),
  description:      text('description').notNull(),
  colType:          text('col_type').notNull().default('interlock'),
  protectionLayer:  text('protection_layer'),
  tagRef:           text('tag_ref'),
  sourceSafeguardId: integer('source_safeguard_id').references(() => hazopSafeguards.id, { onDelete: 'set null' }),
  sourceActionId:   integer('source_action_id').references(() => hazopActions.id, { onDelete: 'set null' }),
  responseGroupId:  integer('response_group_id').references(() => hazopResponseGroups.id, { onDelete: 'set null' }),
}, (table) => ({
  uqMatCol: uniqueIndex('uq_hazop_cec_mat_col').on(table.matrixId, table.colNumber),
}));
export type HazopCeColumn = typeof hazopCeColumns.$inferSelect;

// 28. hazop_interlocks
export const hazopInterlocks = pgTable('hazop_interlocks', {
  id:                             serial('id').primaryKey(),
  studyId:                        integer('study_id').notNull().references(() => hazopStudies.id, { onDelete: 'cascade' }),
  interlockNumber:                text('interlock_number').notNull(),
  interlockType:                  text('interlock_type').notNull(),
  eventType:                      text('event_type'),
  protectionLayer:                text('protection_layer'),
  logicType:                      text('logic_type'),
  criticalityClass:               text('criticality_class'),
  consequenceSeverity:            text('consequence_severity'),
  effectivenessRating:            text('effectiveness_rating'),
  isIndependentProtectionLayer:   boolean('is_independent_protection_layer').notNull().default(false),
  baselineRevision:               text('baseline_revision'),
  description:                    text('description').notNull(),
  initiatingCondition:            text('initiating_condition'),
  initiatingTag:                  text('initiating_tag'),
  finalElementTag:                text('final_element_tag'),
  setPoint:                       text('set_point'),
  resetType:                      text('reset_type'),
  bypassProvision:                boolean('bypass_provision').notNull().default(false),
  silLevel:                       integer('sil_level'),
  status:                         text('status').notNull().default('identified'),
  sourceDeviationId:              integer('source_deviation_id').references(() => hazopDeviations.id, { onDelete: 'set null' }),
  sourceSafeguardId:              integer('source_safeguard_id').references(() => hazopSafeguards.id, { onDelete: 'set null' }),
  eventGroupId:                   integer('event_group_id').references(() => hazopEventGroups.id, { onDelete: 'set null' }),
  responseGroupId:                integer('response_group_id').references(() => hazopResponseGroups.id, { onDelete: 'set null' }),
  ceRowId:                        integer('ce_row_id').references(() => hazopCeRows.id, { onDelete: 'set null' }),
  ceColumnId:                     integer('ce_column_id').references(() => hazopCeColumns.id, { onDelete: 'set null' }),
  notes:                          text('notes'),
  createdAt:                      timestamp('created_at').notNull().defaultNow(),
  createdBy:                      integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  requiresReview:                 boolean('requires_review').notNull().default(false),
  reviewedBy:                     integer('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt:                     timestamp('reviewed_at', { withTimezone: true }),
}, (table) => ({
  uqStudyIlNum: uniqueIndex('uq_hazop_il_study_num').on(table.studyId, table.interlockNumber),
}));
export type HazopInterlock = typeof hazopInterlocks.$inferSelect;

// 29. hazop_interlock_actions
export const hazopInterlockActions = pgTable('hazop_interlock_actions', {
  id:                 serial('id').primaryKey(),
  interlockId:        integer('interlock_id').notNull().references(() => hazopInterlocks.id, { onDelete: 'cascade' }),
  sequenceNo:         integer('sequence_no').notNull(),
  actionDescription:  text('action_description').notNull(),
  actionType:         text('action_type'),
  failState:          text('fail_state'),
  tagRef:             text('tag_ref'),
  confidenceScore:    integer('confidence_score'),
  sourceSafeguardId:  integer('source_safeguard_id').references(() => hazopSafeguards.id, { onDelete: 'set null' }),
}, (table) => ({
  uqIlSeq: uniqueIndex('uq_hazop_ila_il_seq').on(table.interlockId, table.sequenceNo),
}));
export type HazopInterlockAction = typeof hazopInterlockActions.$inferSelect;

// 30. hazop_alarm_trips
export const hazopAlarmTrips = pgTable('hazop_alarm_trips', {
  id:                      serial('id').primaryKey(),
  studyId:                 integer('study_id').notNull().references(() => hazopStudies.id, { onDelete: 'cascade' }),
  alarmNumber:             text('alarm_number').notNull(),
  alarmType:               text('alarm_type').notNull(),
  eventType:               text('event_type'),
  protectionLayer:         text('protection_layer'),
  criticalityClass:        text('criticality_class'),
  effectivenessRating:     text('effectiveness_rating'),
  humanDependencyLevel:    text('human_dependency_level'),
  tagRef:                  text('tag_ref'),
  description:             text('description').notNull(),
  processParameter:        text('process_parameter'),
  setPoint:                text('set_point'),
  alarmAction:             text('alarm_action'),
  tripAction:              text('trip_action'),
  responseTimeSec:         integer('response_time_sec'),
  operatorActionRequired:  boolean('operator_action_required').notNull().default(true),
  confidenceScore:         integer('confidence_score'),
  baselineRevision:        text('baseline_revision'),
  priority:                text('priority').notNull().default('medium'),
  rationalizationStatus:   text('rationalization_status').notNull().default('pending'),
  sourceDeviationId:       integer('source_deviation_id').references(() => hazopDeviations.id, { onDelete: 'set null' }),
  sourceSafeguardId:       integer('source_safeguard_id').references(() => hazopSafeguards.id, { onDelete: 'set null' }),
  interlockId:             integer('interlock_id').references(() => hazopInterlocks.id, { onDelete: 'set null' }),
  eventGroupId:            integer('event_group_id').references(() => hazopEventGroups.id, { onDelete: 'set null' }),
  notes:                   text('notes'),
  createdAt:               timestamp('created_at').notNull().defaultNow(),
  createdBy:               integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  requiresReview:          boolean('requires_review').notNull().default(false),
  reviewedBy:              integer('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt:              timestamp('reviewed_at', { withTimezone: true }),
}, (table) => ({
  uqStudyAlmNum: uniqueIndex('uq_hazop_at_study_num').on(table.studyId, table.alarmNumber),
}));
export type HazopAlarmTrip = typeof hazopAlarmTrips.$inferSelect;

// 31. hazop_safety_critical_elements
export const hazopSafetyCriticalElements = pgTable('hazop_safety_critical_elements', {
  id:                     serial('id').primaryKey(),
  studyId:                integer('study_id').notNull().references(() => hazopStudies.id, { onDelete: 'cascade' }),
  sceNumber:              text('sce_number').notNull(),
  tagRef:                 text('tag_ref').notNull(),
  description:            text('description').notNull(),
  equipmentType:          text('equipment_type'),
  protectionLayer:        text('protection_layer'),
  failState:              text('fail_state'),
  linkedSifId:            integer('linked_sif_id').references(() => hazopSafetyFunctions.id, { onDelete: 'set null' }),
  linkedInterlockId:      integer('linked_interlock_id').references(() => hazopInterlocks.id, { onDelete: 'set null' }),
  proofTestRequired:      boolean('proof_test_required').notNull().default(true),
  inspectionIntervalDays: integer('inspection_interval_days'),
  notes:                  text('notes'),
  createdAt:              timestamp('created_at').notNull().defaultNow(),
  createdBy:              integer('created_by').references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  uqStudySceNum: uniqueIndex('uq_hazop_sce_study_num').on(table.studyId, table.sceNumber),
}));
export type HazopSafetyCriticalElement = typeof hazopSafetyCriticalElements.$inferSelect;

// 32. hazop_scenarios
export const hazopScenarios = pgTable('hazop_scenarios', {
  id:                      serial('id').primaryKey(),
  studyId:                 integer('study_id').notNull().references(() => hazopStudies.id, { onDelete: 'cascade' }),
  scenarioNumber:          text('scenario_number').notNull(),
  title:                   text('title').notNull(),
  initiatingEventGroupId:  integer('initiating_event_group_id').references(() => hazopEventGroups.id, { onDelete: 'set null' }),
  consequenceDescription:  text('consequence_description').notNull(),
  consequenceSeverity:     text('consequence_severity').notNull(),
  operatingMode:           text('operating_mode'),
  humanDependencyLevel:    text('human_dependency_level'),
  residualRisk:            text('residual_risk'),
  baselineRevision:        text('baseline_revision'),
  notes:                   text('notes'),
  createdAt:               timestamp('created_at').notNull().defaultNow(),
  createdBy:               integer('created_by').references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  uqStudyScNum: uniqueIndex('uq_hazop_sc_study_num').on(table.studyId, table.scenarioNumber),
}));
export type HazopScenario = typeof hazopScenarios.$inferSelect;

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 5A — LOPA Core
// ══════════════════════════════════════════════════════════════════════════════

// 33. hazop_scenario_ipl_stack
export const hazopScenarioIplStack = pgTable('hazop_scenario_ipl_stack', {
  id:                   serial('id').primaryKey(),
  studyId:              integer('study_id').notNull().references(() => hazopStudies.id, { onDelete: 'cascade' }),
  scenarioId:           integer('scenario_id').notNull().references(() => hazopScenarios.id, { onDelete: 'cascade' }),
  responseGroupId:      integer('response_group_id').references(() => hazopResponseGroups.id, { onDelete: 'set null' }),
  safetyFunctionId:     integer('safety_function_id').references(() => hazopSafetyFunctions.id, { onDelete: 'set null' }),
  interlockId:          integer('interlock_id').references(() => hazopInterlocks.id, { onDelete: 'set null' }),
  iplType:              text('ipl_type').notNull(),
  iplLabel:             text('ipl_label').notNull(),
  protectionLayer:      text('protection_layer').notNull(),
  isIndependent:        boolean('is_independent').notNull().default(false),
  effectivenessRating:  text('effectiveness_rating'),
  humanDependencyLevel: text('human_dependency_level'),
  failState:            text('fail_state'),
  pfdValue:             numeric('pfd_value', { precision: 10, scale: 6 }),
  pfdSource:            text('pfd_source'),
  pfdBasis:             text('pfd_basis'),
  creditApplied:        boolean('credit_applied').notNull().default(false),
  creditable:           boolean('creditable'),
  ccfGroup:             text('ccf_group'),
  stackPosition:        integer('stack_position').notNull(),
  notes:                text('notes'),
  createdAt:            timestamp('created_at').notNull().defaultNow(),
  createdBy:            integer('created_by').references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  uqScenarioPos: uniqueIndex('uq_hazop_ipl_scenario_pos').on(table.scenarioId, table.stackPosition),
}));
export type HazopScenarioIplStack = typeof hazopScenarioIplStack.$inferSelect;

// 34. hazop_lopa_records
export const hazopLopaRecords = pgTable('hazop_lopa_records', {
  id:                    serial('id').primaryKey(),
  studyId:               integer('study_id').notNull().references(() => hazopStudies.id, { onDelete: 'cascade' }),
  scenarioId:            integer('scenario_id').notNull().references(() => hazopScenarios.id, { onDelete: 'cascade' }),
  lopaNumber:            text('lopa_number').notNull(),
  title:                 text('title'),
  ieFrequencyPerYear:    numeric('ie_frequency_per_year', { precision: 15, scale: 9 }).notNull(),
  ieFrequencyBasis:      text('ie_frequency_basis'),
  consequenceCategory:   text('consequence_category').notNull(),
  rttfPerYear:           numeric('rttf_per_year', { precision: 15, scale: 9 }).notNull(),
  rttfBasis:             text('rttf_basis'),
  achievedMefPerYear:    numeric('achieved_mef_per_year', { precision: 15, scale: 9 }),
  pfdProduct:            numeric('pfd_product', { precision: 15, scale: 9 }),
  riskGapRatio:          numeric('risk_gap_ratio', { precision: 15, scale: 6 }),
  requiredAdditionalPfd: numeric('required_additional_pfd', { precision: 15, scale: 9 }),
  requiredSil:           integer('required_sil'),
  lopaOutcome:           text('lopa_outcome'),
  lopaStatus:            text('lopa_status').notNull().default('draft'),
  creditedIplCount:      integer('credited_ipl_count'),
  excludedIplCount:      integer('excluded_ipl_count'),
  ccfDeratedCount:       integer('ccf_derated_count'),
  arithmeticVersion:     text('arithmetic_version'),
  warnings:              text('warnings').array(),
  baselineRevision:      text('baseline_revision'),
  approvedBy:            integer('approved_by').references(() => users.id, { onDelete: 'set null' }),
  approvedAt:            timestamp('approved_at'),
  notes:                 text('notes'),
  createdAt:             timestamp('created_at').notNull().defaultNow(),
  createdBy:             integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  requiresReview:        boolean('requires_review').notNull().default(false),
  reviewedBy:            integer('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt:            timestamp('reviewed_at', { withTimezone: true }),
}, (table) => ({
  uqStudyLopaNum: uniqueIndex('uq_hazop_lopa_study_num').on(table.studyId, table.lopaNumber),
  uqScenario:     uniqueIndex('uq_hazop_lopa_scenario').on(table.scenarioId),
}));
export type HazopLopaRecord = typeof hazopLopaRecords.$inferSelect;

// 35. hazop_srs_records
export const hazopSrsRecords = pgTable('hazop_srs_records', {
  id:                        serial('id').primaryKey(),
  studyId:                   integer('study_id').notNull().references(() => hazopStudies.id, { onDelete: 'cascade' }),
  safetyFunctionId:          integer('safety_function_id').notNull().references(() => hazopSafetyFunctions.id, { onDelete: 'cascade' }),
  lopaId:                    integer('lopa_id').references(() => hazopLopaRecords.id, { onDelete: 'set null' }),
  srsNumber:                 text('srs_number').notNull(),
  silRequired:               integer('sil_required').notNull(),
  silProposed:               integer('sil_proposed'),
  pfdRequired:               numeric('pfd_required', { precision: 10, scale: 6 }).notNull(),
  pfdTarget:                 numeric('pfd_target', { precision: 10, scale: 6 }),
  processDemandDescription:  text('process_demand_description').notNull(),
  safeStateDescription:      text('safe_state_description').notNull(),
  processInputTag:           text('process_input_tag'),
  finalElementTag:           text('final_element_tag'),
  finalElementAction:        text('final_element_action'),
  failState:                 text('fail_state'),
  processSafetyTimeSec:      integer('process_safety_time_sec'),
  responseTimeRequiredSec:   integer('response_time_required_sec'),
  manualResetRequired:       boolean('manual_reset_required').default(true),
  proofTestIntervalDays:     integer('proof_test_interval_days'),
  proofTestCoverage:         numeric('proof_test_coverage', { precision: 5, scale: 2 }),
  proofTestProcedureRef:     text('proof_test_procedure_ref'),
  architectureType:          text('architecture_type'),
  hardwareFaultTolerance:    integer('hardware_fault_tolerance').default(0),
  srsStatus:                 text('srs_status').notNull().default('draft'),
  baselineRevision:          text('baseline_revision'),
  approvedBy:                integer('approved_by').references(() => users.id, { onDelete: 'set null' }),
  approvedAt:                timestamp('approved_at'),
  notes:                     text('notes'),
  createdAt:                 timestamp('created_at').notNull().defaultNow(),
  createdBy:                 integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  requiresReview:            boolean('requires_review').notNull().default(false),
  reviewedBy:                integer('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt:                timestamp('reviewed_at', { withTimezone: true }),
}, (table) => ({
  uqStudySrsNum: uniqueIndex('uq_hazop_srs_study_num').on(table.studyId, table.srsNumber),
  uqSif:         uniqueIndex('uq_hazop_srs_sif').on(table.safetyFunctionId),
}));
export type HazopSrsRecord = typeof hazopSrsRecords.$inferSelect;

// ── hazop_moc_records (Phase 5C) ─────────────────────────────────────────────
export const hazopMocRecords = pgTable('hazop_moc_records', {
  id:                     serial('id').primaryKey(),
  studyId:                integer('study_id').notNull().references(() => hazopStudies.id, { onDelete: 'cascade' }),
  mocNumber:              text('moc_number').notNull(),

  scenarioId:             integer('scenario_id').references(() => hazopScenarios.id, { onDelete: 'set null' }),
  safetyFunctionId:       integer('safety_function_id').references(() => hazopSafetyFunctions.id, { onDelete: 'set null' }),
  interlockId:            integer('interlock_id').references(() => hazopInterlocks.id, { onDelete: 'set null' }),
  alarmTripId:            integer('alarm_trip_id').references(() => hazopAlarmTrips.id, { onDelete: 'set null' }),
  sceId:                  integer('sce_id').references(() => hazopSafetyCriticalElements.id, { onDelete: 'set null' }),
  lopaId:                 integer('lopa_id').references(() => hazopLopaRecords.id, { onDelete: 'set null' }),
  srsId:                  integer('srs_id').references(() => hazopSrsRecords.id, { onDelete: 'set null' }),

  changeType:             text('change_type').notNull(),
  changeReason:           text('change_reason').notNull(),
  changeDescription:      text('change_description').notNull(),
  safetyImpactAssessment: text('safety_impact_assessment'),

  baselineBefore:         text('baseline_before'),
  baselineAfter:          text('baseline_after'),

  requestedBy:            integer('requested_by').references(() => users.id, { onDelete: 'set null' }),
  requestedAt:            timestamp('requested_at').defaultNow(),
  approvedBy:             integer('approved_by').references(() => users.id, { onDelete: 'set null' }),
  approvedAt:             timestamp('approved_at'),
  rejectedBy:             integer('rejected_by').references(() => users.id, { onDelete: 'set null' }),
  rejectedAt:             timestamp('rejected_at'),
  rejectionReason:        text('rejection_reason'),
  mocStatus:              text('moc_status').notNull().default('open'),

  notes:                  text('notes'),
  createdAt:              timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  uqStudyMocNum: uniqueIndex('uq_hazop_moc_study_num').on(table.studyId, table.mocNumber),
}));
export type HazopMocRecord = typeof hazopMocRecords.$inferSelect;

// ── hazop_baseline_approvals (Phase 5D) ─────────────────────────────────────
export const hazopBaselineApprovals = pgTable('hazop_baseline_approvals', {
  id:                 serial('id').primaryKey(),
  studyId:            integer('study_id').notNull().references(() => hazopStudies.id, { onDelete: 'cascade' }),
  artefactType:       text('artefact_type').notNull(),
  artefactId:         integer('artefact_id').notNull(),
  baselineRevision:   text('baseline_revision').notNull(),
  baselinedBy:        integer('baselined_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  countersignedBy:    integer('countersigned_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  countersignedAt:    timestamp('countersigned_at', { withTimezone: true }).notNull().defaultNow(),
  countersignerRole:  text('countersigner_role').notNull(),
  approvalDiscipline: text('approval_discipline').notNull(),
  approvalToken:      text('approval_token').notNull().unique(),
  notes:              text('notes'),
  createdAt:          timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  uqArtefactRevision: uniqueIndex('uq_hazop_ba_artefact_rev').on(table.artefactType, table.artefactId, table.baselineRevision),
}));
export const insertHazopBaselineApprovalSchema = createInsertSchema(hazopBaselineApprovals).omit({ id: true, createdAt: true });
export type HazopBaselineApproval = typeof hazopBaselineApprovals.$inferSelect;

// ── employee_code_audit_log ───────────────────────────────────────────────────
export const employeeCodeAuditLog = pgTable('employee_code_audit_log', {
  id:              serial('id').primaryKey(),
  userId:          integer('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  oldEmployeeCode: text('old_employee_code'),
  newEmployeeCode: text('new_employee_code').notNull(),
  reason:          text('reason').notNull(),
  changedBy:       integer('changed_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  changedAt:       timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
});
export const insertEmployeeCodeAuditLogSchema = createInsertSchema(employeeCodeAuditLog).omit({ id: true, changedAt: true });
export type EmployeeCodeAuditLog = typeof employeeCodeAuditLog.$inferSelect;

// ── WO Manage: Crew Slots ─────────────────────────────────────────────────────
// ── Crew Members Master ───────────────────────────────────────────────────────
export const crewMembers = pgTable('crew_members', {
  id:           serial('id').primaryKey(),
  name:         varchar('name', { length: 200 }).notNull(),
  roleTypes:    text('role_types').array().notNull().default([]),
  employeeCode: varchar('employee_code', { length: 50 }),
  isActive:     boolean('is_active').notNull().default(true),
  createdBy:    integer('created_by').references(() => users.id),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
});
export const insertCrewMemberSchema = createInsertSchema(crewMembers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCrewMember = z.infer<typeof insertCrewMemberSchema>;
export type CrewMember = typeof crewMembers.$inferSelect;

export const woCrewSlots = pgTable('wo_crew_slots', {
  id:               serial('id').primaryKey(),
  epcWorkOrderId:   integer('epc_work_order_id').notNull().references(() => epcWorkOrders.id, { onDelete: 'cascade' }),
  roleType:         varchar('role_type', { length: 20 }).notNull(),   // team_leader | fitter | welder | helper | qc_person
  slotNumber:       smallint('slot_number').notNull(),
  slotLabel:        varchar('slot_label', { length: 40 }).notNull(),  // e.g. "Fitter-2"
  assignedName:     varchar('assigned_name', { length: 200 }),
  crewMemberId:     integer('crew_member_id').references(() => crewMembers.id, { onDelete: 'set null' }),
  isActive:         boolean('is_active').notNull().default(true),
  addedBy:          integer('added_by').notNull().references(() => users.id),
  addedAt:          timestamp('added_at').notNull().defaultNow(),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
});
export const insertWoCrewSlotSchema = createInsertSchema(woCrewSlots).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWoCrewSlot = z.infer<typeof insertWoCrewSlotSchema>;
export type WoCrewSlot = typeof woCrewSlots.$inferSelect;

// ── WO Manage: Crew Slot History ─────────────────────────────────────────────
export const woCrewSlotHistory = pgTable('wo_crew_slot_history', {
  id:           serial('id').primaryKey(),
  slotId:       integer('slot_id').notNull(),
  previousName: varchar('previous_name', { length: 200 }),
  newName:      varchar('new_name', { length: 200 }),
  changedBy:    integer('changed_by').notNull().references(() => users.id),
  changedAt:    timestamp('changed_at').notNull().defaultNow(),
});
export const insertWoCrewSlotHistorySchema = createInsertSchema(woCrewSlotHistory).omit({ id: true, changedAt: true });
export type InsertWoCrewSlotHistory = z.infer<typeof insertWoCrewSlotHistorySchema>;
export type WoCrewSlotHistory = typeof woCrewSlotHistory.$inferSelect;

// ── WO Manage: Schedule ───────────────────────────────────────────────────────
export const woSchedule = pgTable('wo_schedule', {
  id:                       serial('id').primaryKey(),
  epcWorkOrderId:           integer('epc_work_order_id').notNull().unique().references(() => epcWorkOrders.id, { onDelete: 'cascade' }),
  targetStartDate:          date('target_start_date'),
  targetCompletionDate:     date('target_completion_date'),
  actualStartDate:          date('actual_start_date'),
  actualCompletionDate:     date('actual_completion_date'),
  scheduleSetBy:            integer('schedule_set_by').references(() => users.id),
  scheduleSetAt:            timestamp('schedule_set_at'),
  actualStartRecordedBy:    integer('actual_start_recorded_by').references(() => users.id),
  actualStartRecordedAt:    timestamp('actual_start_recorded_at'),
  actualEndRecordedBy:      integer('actual_end_recorded_by').references(() => users.id),
  actualEndRecordedAt:      timestamp('actual_end_recorded_at'),
  updatedAt:                timestamp('updated_at').notNull().defaultNow(),
});
export const insertWoScheduleSchema = createInsertSchema(woSchedule).omit({ id: true, updatedAt: true });
export type InsertWoSchedule = z.infer<typeof insertWoScheduleSchema>;
export type WoSchedule = typeof woSchedule.$inferSelect;

// ── WO Manage: Daily Logs ─────────────────────────────────────────────────────
export const woDailyLogs = pgTable('wo_daily_logs', {
  id:                 serial('id').primaryKey(),
  epcWorkOrderId:     integer('epc_work_order_id').notNull().references(() => epcWorkOrders.id, { onDelete: 'cascade' }),
  logDate:            date('log_date').notNull(),
  reportedBy:         integer('reported_by').notNull().references(() => users.id),
  status:             varchar('status', { length: 20 }).notNull().default('draft'),
  progressPercent:    smallint('progress_percent').notNull().default(0),
  workDoneToday:      text('work_done_today'),
  manpowerCount:      smallint('manpower_count').notNull().default(0),
  manpowerBreakdown:  jsonb('manpower_breakdown').default({}),
  hoursWorked:        decimal('hours_worked', { precision: 6, scale: 2 }).notNull().default('0'),
  issuesEncountered:  text('issues_encountered'),
  nextDayPlan:        text('next_day_plan'),
  crewNote:           text('crew_note'),
  reviewedBy:         integer('reviewed_by').references(() => users.id),
  reviewedAt:         timestamp('reviewed_at'),
  createdAt:          timestamp('created_at').notNull().defaultNow(),
  updatedAt:          timestamp('updated_at').notNull().defaultNow(),
});
export const insertWoDailyLogSchema = createInsertSchema(woDailyLogs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWoDailyLog = z.infer<typeof insertWoDailyLogSchema>;
export type WoDailyLog = typeof woDailyLogs.$inferSelect;

// ── WO Manage: Hold Records ───────────────────────────────────────────────────
export const woHoldRecords = pgTable('wo_hold_records', {
  id:               serial('id').primaryKey(),
  epcWorkOrderId:   integer('epc_work_order_id').notNull().references(() => epcWorkOrders.id, { onDelete: 'cascade' }),
  holdType:         varchar('hold_type', { length: 40 }).notNull(),
  holdReason:       text('hold_reason').notNull(),
  heldBy:           integer('held_by').notNull().references(() => users.id),
  heldAt:           timestamp('held_at').notNull().defaultNow(),
  resolvedBy:       integer('resolved_by').references(() => users.id),
  resolvedAt:       timestamp('resolved_at'),
  resolutionNotes:  text('resolution_notes'),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
});
export const insertWoHoldRecordSchema = createInsertSchema(woHoldRecords).omit({ id: true, createdAt: true });
export type InsertWoHoldRecord = z.infer<typeof insertWoHoldRecordSchema>;
export type WoHoldRecord = typeof woHoldRecords.$inferSelect;

// ── Makes catalog ─────────────────────────────────────────────────────────────
export const makes = pgTable('makes', {
  id:           serial('id').primaryKey(),
  name:         text('name').notNull(),
  normalized:   text('normalized').notNull().unique(),
  createdBy:    integer('created_by').references(() => users.id),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
});
export const insertMakeSchema = createInsertSchema(makes).omit({ id: true, createdAt: true });
export type InsertMake = z.infer<typeof insertMakeSchema>;
export type Make = typeof makes.$inferSelect;

// ══════════════════════════════════════════════════════════════════════════════
// OFFER COMMUNICATION REGISTER — V1
// ══════════════════════════════════════════════════════════════════════════════

// ── offer_comm_categories ──────────────────────────────────────────────────────
// Reference table — exactly 20 approved categories.
// Populated by scripts/migrate-offer-comm-categories.ts ONLY.
// No runtime insert. No startup seed.
export const offerCommCategories = pgTable('offer_comm_categories', {
  id:            serial('id').primaryKey(),
  categoryCode:  varchar('category_code', { length: 60 }).notNull().unique(),
  categoryPath:  varchar('category_path', { length: 120 }).notNull().unique(),
  displayLabel:  text('display_label').notNull(),
  section:       varchar('section', { length: 20 }).notNull(), // Sales | Design
  sortOrder:     integer('sort_order').notNull(),
  isActive:      boolean('is_active').notNull().default(true),
});
export type OfferCommCategory = typeof offerCommCategories.$inferSelect;

// ── offer_communications ───────────────────────────────────────────────────────
// Primary business object — one row per communication event on an Offer.
export const offerCommunications = pgTable('offer_communications', {
  id:                       serial('id').primaryKey(),
  offerId:                  integer('offer_id').notNull().references(() => offers.id, { onDelete: 'cascade' }),
  communicationCategoryId:  integer('communication_category_id').notNull().references(() => offerCommCategories.id),
  commDate:                 date('comm_date').notNull(),
  title:                    text('title').notNull(),
  direction:                varchar('direction', { length: 20 }).notNull(),
                            // Incoming | Outgoing | Internal
  channel:                  varchar('channel', { length: 30 }).notNull(),
                            // Email | Meeting | Phone | WhatsApp | Letter | Internal Note
  customerContact:          text('customer_contact'),
  fromParty:                text('from_party'),
  toParty:                  text('to_party'),
  ccParty:                  text('cc_party'),
  customerQuestion:         text('customer_question'),
  summary:                  text('summary'),
  actionRequired:           boolean('action_required').notNull().default(false),
  responsibleUserId:        integer('responsible_user_id').references(() => users.id),
  dueDate:                  date('due_date'),
  status:                   varchar('status', { length: 30 }).notNull().default('Open'),
                            // Open | Closed | For Information | Awaiting Customer | Awaiting Thermopac
  responseType:             text('response_type'),
                            // note_text | upload_existing | drawing_image | other_document
                            // | create_word | create_excel | create_ppt | create_pdf
  createdBy:                integer('created_by').notNull().references(() => users.id),
  createdAt:                timestamp('created_at').notNull().defaultNow(),
  updatedAt:                timestamp('updated_at').notNull().defaultNow(),
});
export const insertOfferCommunicationSchema = createInsertSchema(offerCommunications).omit({ id: true, createdAt: true, updatedAt: true });
export type OfferCommunication = typeof offerCommunications.$inferSelect;
export type InsertOfferCommunication = z.infer<typeof insertOfferCommunicationSchema>;

// ── offer_comm_documents ───────────────────────────────────────────────────────
// Files (uploaded or generated) attached to a Communication Record.
// Category is inherited via: communication_id → offer_communications → communication_category_id
export const offerCommDocuments = pgTable('offer_comm_documents', {
  id:              serial('id').primaryKey(),
  communicationId: integer('communication_id').notNull().references(() => offerCommunications.id, { onDelete: 'cascade' }),
  documentType:    varchar('document_type', { length: 40 }).notNull(),
                   // PDF | Word | Excel | PPT | Image | Drawing | Email_File | Other
  fileName:        text('file_name').notNull(),
  gcsPath:         text('gcs_path').notNull().unique(),
  sha256:          text('sha256').notNull(),
  revision:        varchar('revision', { length: 10 }).notNull().default('00'),
  isCurrent:       boolean('is_current').notNull().default(true),
  fileSizeBytes:   integer('file_size_bytes'),
  mimeType:        varchar('mime_type', { length: 100 }),
  mirrorStatus:    varchar('mirror_status', { length: 20 }).notNull().default('pending'),
                   // pending | mirrored | failed  (Open_Quotations mirror)
  mirrorJobId:     integer('mirror_job_id').references(() => documentAgentJobs.id),
  gcsRuleId:       integer('gcs_rule_id'),
                   // FK to gcs_governance_rules.id — the active rule that governed this path
  templateId:      integer('template_id').references(() => offerCommTemplates.id),
                   // FK to offer_comm_templates.id — set when document was generated from a template
  uploadedBy:      integer('uploaded_by').notNull().references(() => users.id),
  uploadedAt:      timestamp('uploaded_at').notNull().defaultNow(),
});
export const insertOfferCommDocumentSchema = createInsertSchema(offerCommDocuments).omit({ id: true, uploadedAt: true });
export type OfferCommDocument = typeof offerCommDocuments.$inferSelect;
export type InsertOfferCommDocument = z.infer<typeof insertOfferCommDocumentSchema>;

// ── offer_comm_doc_conversions ─────────────────────────────────────────────────
// Traceability record for each document copied from Open_Quotations → SOR project
// on Order Confirmation. Two UNIQUE constraints prevent duplicate copies.
export const offerCommDocConversions = pgTable('offer_comm_doc_conversions', {
  id:              serial('id').primaryKey(),
  sourceDocId:     integer('source_doc_id').notNull().references(() => offerCommDocuments.id),
  snapshotId:      integer('snapshot_id').notNull().references(() => offerConversionSnapshots.id),
  projectId:       integer('project_id').notNull().references(() => projects.id),
  sourceGcsPath:   text('source_gcs_path').notNull(),
  destGcsPath:     text('dest_gcs_path').notNull(),
  gcsCopyStatus:   varchar('gcs_copy_status', { length: 20 }).notNull().default('pending'),
                   // pending | copied | failed
  mirrorJobId:     integer('mirror_job_id').references(() => documentAgentJobs.id),
  mirrorStatus:    varchar('mirror_status', { length: 20 }).notNull().default('not_started'),
                   // not_started | pending | mirrored | failed
  errorDetail:     text('error_detail'),
  gcsRuleId:       integer('gcs_rule_id'),
                   // FK to gcs_governance_rules.id — the active rule that governed this SOR copy path
  convertedBy:     integer('converted_by').notNull().references(() => users.id),
  convertedAt:     timestamp('converted_at').notNull().defaultNow(),
}, (table) => ({
  uqSourceProject: uniqueIndex('uq_occ_source_project').on(table.sourceDocId, table.projectId),
  uqDestGcsPath:   uniqueIndex('uq_occ_dest_gcs_path').on(table.destGcsPath),
}));
export type OfferCommDocConversion = typeof offerCommDocConversions.$inferSelect;

// ── offer_comm_templates ───────────────────────────────────────────────────────
// Templates for generated communication documents (Word / Excel / PDF).
// Each Communication Category may have one default template per type.
// Separate from offer_templates (quotation PDF insertion system).
export const offerCommTemplates = pgTable('offer_comm_templates', {
  id:               serial('id').primaryKey(),
  name:             text('name').notNull(),
  description:      text('description'),
  templateType:     varchar('template_type', { length: 10 }).notNull(),
                    // WORD | EXCEL | PDF | PPT
  commCategoryId:   integer('comm_category_id').references(() => offerCommCategories.id),
                    // NULL = applies to all categories as a fallback
  isDefault:        boolean('is_default').notNull().default(false),
  gcsObjectPath:    text('gcs_object_path'),
  gcsBucket:        text('gcs_bucket'),
  fileName:         text('file_name').notNull(),
  fileSize:         integer('file_size'),
  checksumSha256:   text('checksum_sha256'),
  versionSeq:       integer('version_seq').notNull().default(1),
  isActive:         boolean('is_active').notNull().default(true),
  mirrorStatus:     varchar('mirror_status', { length: 20 }).notNull().default('pending'),
  mirrorJobId:      integer('mirror_job_id').references(() => documentAgentJobs.id),
  uploadedBy:       integer('uploaded_by').references(() => users.id),
  uploadedAt:       timestamp('uploaded_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
});
export const insertOfferCommTemplateSchema = createInsertSchema(offerCommTemplates).omit({ id: true, uploadedAt: true, updatedAt: true });
export type OfferCommTemplate = typeof offerCommTemplates.$inferSelect;
export type InsertOfferCommTemplate = z.infer<typeof insertOfferCommTemplateSchema>;
