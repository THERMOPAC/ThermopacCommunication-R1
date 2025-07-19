import { pgTable, text, serial, integer, boolean, jsonb, timestamp, date, decimal, varchar, foreignKey, primaryKey, doublePrecision, uuid, time } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { roles } from "./roles";
import { relations } from "drizzle-orm";

// Available system modules
export const modules = [
  "Administration",
  "Legal Management",
  "Sales and Marketing",
  "Finance",
  "Project Management",
  "Task Management",
  "Meetings & Commitments",
  "Procurement Management", 
  "Production Management", 
  "Quality Management",
  "Design Management",
  "Project Commissioning",
  "Dispatch & Shipping",
  "After-Sales",
  "SAP B1 Integration"
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
  updatedAt: timestamp('updated_at').notNull().defaultNow()
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
  overtimeHours: decimal('overtime_hours', { precision: 5, scale: 2 }).default('0'),
  
  // Status and validation
  status: varchar('status', { length: 30 }).notNull().default('present'), // present, absent, partial, late, incomplete
  isLocationVerified: boolean('is_location_verified').default(false),
  isIpVerified: boolean('is_ip_verified').default(false),
  
  // Incomplete attendance tracking
  isIncomplete: boolean('is_incomplete').default(false),
  incompleteReason: text('incomplete_reason'),
  flaggedAt: timestamp('flagged_at'),
  requiresApproval: boolean('requires_approval').default(false),
  approvedBy: integer('approved_by').references(() => users.id),
  approvalDate: timestamp('approval_date'),
  approvalNotes: text('approval_notes'),
  
  // Admin adjustments
  adminAdjustment: jsonb('admin_adjustment'), // For manual corrections
  adjustedBy: integer('adjusted_by').references(() => users.id),
  adjustmentReason: text('adjustment_reason'),
  adjustmentDate: timestamp('adjustment_date'),
  
  // Notes and remarks
  employeeNotes: text('employee_notes'),
  adminNotes: text('admin_notes'),
  
  // Tracking
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

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
  colorCode: varchar('color_code', { length: 7 }).default('#3B82F6'),
  isActive: boolean('is_active').default(true),
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
  esicNo: text('esic_no'),
  stdCode: text('std_code'),
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
  reportingManagerId: z.number().optional(),
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
  finishDate: z.string(),
  dueDate: z.string().optional(),
  sourceType: z.enum(['manual', 'meeting_commitment', 'recurring']).optional(),
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
  status: text('status').notNull().default('Draft'), // Draft, Submitted, Approved, Rejected
  requested_by: integer('requested_by').references(() => users.id).notNull(),
  requested_date: timestamp('requested_date').defaultNow().notNull(),
  approved_by: integer('approved_by').references(() => users.id),
  approved_date: timestamp('approved_date'),
  notes: text('notes'),
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
  status: text('status').notNull().default('Draft'), // Draft, Issued, Implemented, Closed
  issued_by: integer('issued_by').references(() => users.id).notNull(),
  issued_date: timestamp('issued_date').defaultNow().notNull(),
  implementation_date: timestamp('implementation_date'),
  implemented_by: integer('implemented_by').references(() => users.id),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export const changeDocuments = pgTable('change_documents', {
  id: serial('id').primaryKey(),
  ecr_id: integer('ecr_id').references(() => engineeringChangeRequests.id),
  ecn_id: integer('ecn_id').references(() => engineeringChangeNotices.id),
  document_type: text('document_type').notNull(), // Drawing, Specification, etc.
  document_name: text('document_name').notNull(),
  document_path: text('document_path').notNull(),
  uploaded_by: integer('uploaded_by').references(() => users.id).notNull(),
  uploaded_at: timestamp('uploaded_at').defaultNow().notNull(),
  storage_path: text('storage_path'),
  storage_url: text('storage_url'),
  storage_url_expiry: timestamp('storage_url_expiry'),
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
  pattern: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
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
  labels: z.array(z.string()).optional()
});

export const insertGmailSettingsSchema = createInsertSchema(gmailSettings);

export type GmailToken = typeof gmailTokens.$inferSelect;
export type InsertGmailToken = z.infer<typeof insertGmailTokenSchema>;
export type GmailMessage = typeof gmailMessages.$inferSelect;
export type InsertGmailMessage = z.infer<typeof insertGmailMessageSchema>;
export type GmailSettings = typeof gmailSettings.$inferSelect;
export type InsertGmailSettings = z.infer<typeof insertGmailSettingsSchema>;

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
  email: text('email'),
  billToAddress: text('bill_to_address'),
  shipToAddress: text('ship_to_address'),
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
  sapSyncStatus: text('sap_sync_status').default('pending') // pending, synced, error
});

// Projects table
export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  code: text('code').notNull().unique(), // Project code for easy reference
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
  department: text('department').notNull(), // e.g., "design", "procurement", "manufacturing", "quality"
  subDirectory: text('sub_directory'), // e.g., "1_BEDD", "2_P_ID", can be null for root directories
  
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
  projectCode: text('project_code').notNull(), // Reference to the project code for quicker lookups
  itemId: integer('item_id').notNull().references(() => masterItems.id),
  
  // Project-specific details
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
  estimatedCost: decimal('estimated_cost', { precision: 12, scale: 2 }),
  actualCost: decimal('actual_cost', { precision: 12, scale: 2 }),
  notes: text('notes'),
  
  // Item status in the project
  status: text('status').default('Not Started'), // Not Started, Drawing Received, Material Received, Under Construction, Completed, On Hold, Cancelled
  
  // Tracking
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Create insert schemas for project management tables
export const insertCustomerSchema = createInsertSchema(customers);

// Master item insert schema
export const insertMasterItemSchema = createInsertSchema(masterItems, {
  itemCode: z.string().min(1),
  description: z.string().min(1),
  uom: z.string().min(1),
  makeOrBuy: z.enum(['Make', 'Buy']).nullable().optional().transform(v => v === null ? undefined : v),
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
  name: z.enum(['Design', 'Procurement', 'Manufacturing', 'Quality']),
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
  status: z.enum(['draft', 'submitted', 'approved', 'ordered', 'shipped', 'received', 'on_hold', 'cancelled']),
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
  
  // Non-Conformance data - stored as JSON string
  ncrData: text('ncr_data'),
  
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
    status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
    inspectionType: z.enum(['incoming', 'in-process', 'final', 'dimensional', 'visual']),
    makeOrBuy: z.enum(['Make', 'Buy']).optional(),
    plannedDate: z.string().optional().transform(dateStringToDate),
    completedDate: z.string().optional().transform(dateStringToDate),
    ndtData: z.string().optional(),
    visualData: z.string().optional(),
    weldData: z.string().optional(),
    ncrData: z.string().optional(),
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
  
  // PF & ESIC Contributions
  employeePfContribution: decimal('employee_pf_contribution', { precision: 10, scale: 2 }).default('0'),
  employerPfContribution: decimal('employer_pf_contribution', { precision: 10, scale: 2 }).default('0'),
  employeeEsicContribution: decimal('employee_esic_contribution', { precision: 10, scale: 2 }).default('0'),
  employerEsicContribution: decimal('employer_esic_contribution', { precision: 10, scale: 2 }).default('0'),
  groupInsurance: decimal('group_insurance', { precision: 10, scale: 2 }).default('0'),
  professionalTax: decimal('professional_tax', { precision: 10, scale: 2 }).default('0'),
  
  // Bank Details
  bankName: text('bank_name'),
  bankAccountNo: text('bank_account_no'),
  debitAccount: text('debit_account'),
  
  // Salary Configuration
  salaryType: varchar('salary_type', { length: 20 }).default('monthly'),
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

// Payroll periods
export const payrollPeriods = pgTable('payroll_periods', {
  id: serial('id').primaryKey(),
  periodName: varchar('period_name', { length: 50 }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  payDate: date('pay_date').notNull(),
  status: varchar('status', { length: 20 }).default('draft'),
  totalEmployees: integer('total_employees').default(0),
  totalGrossPay: decimal('total_gross_pay', { precision: 15, scale: 2 }).default('0'),
  totalDeductions: decimal('total_deductions', { precision: 15, scale: 2 }).default('0'),
  totalNetPay: decimal('total_net_pay', { precision: 15, scale: 2 }).default('0'),
  createdAt: timestamp('created_at').defaultNow(),
  processedAt: timestamp('processed_at'),
  processedBy: integer('processed_by').references(() => users.id),
});

// Individual payroll records
export const payrollRecords = pgTable('payroll_records', {
  id: serial('id').primaryKey(),
  periodId: integer('period_id').notNull().references(() => payrollPeriods.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  baseSalary: decimal('base_salary', { precision: 12, scale: 2 }).notNull(),
  
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
  
  // Net pay
  netPay: decimal('net_pay', { precision: 12, scale: 2 }).notNull(),
  
  // KPI metrics for reference
  dwarProductivityScore: decimal('dwar_productivity_score', { precision: 5, scale: 2 }),
  attendancePercentage: decimal('attendance_percentage', { precision: 5, scale: 2 }),
  tasksCompleted: integer('tasks_completed').default(0),
  averageSatisfactionRating: decimal('average_satisfaction_rating', { precision: 3, scale: 2 }),
  
  status: varchar('status', { length: 20 }).default('draft'),
  paymentReference: varchar('payment_reference', { length: 100 }),
  paymentDate: date('payment_date'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

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
  welderProcess: varchar('welder_process', { length: 20 }).notNull(),
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
  welderProcess: varchar('welder_process', { length: 20 }).notNull(),
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

// WPQR Documents relations
export const wpqrDocumentsRelations = relations(wpqrDocuments, ({ one }) => ({
  creator: one(users, {
    fields: [wpqrDocuments.createdBy],
    references: [users.id],
  }),
}));

// WPQR Document schema for validation
export const wpqrDocumentSchema = createInsertSchema(wpqrDocuments)
  .omit({ id: true, createdAt: true, updatedAt: true, fileUrl: true, filePath: true })
  .extend({
    welderProcess: z.enum(['SMAW', 'GMAW', 'GTAW', 'FCAW', 'SAW']),
    inspectionAuthority: z.enum(['TUV NORD', 'SGS']).optional(),
    certificateNo: z.string().optional(),
    status: z.enum(['Active', 'Obsolete']).default('Active'),
  });

// Export WPQR document types
export type WpqrDocument = typeof wpqrDocuments.$inferSelect;
export type InsertWpqrDocument = z.infer<typeof wpqrDocumentSchema>;

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
    welderProcess: z.enum(['SMAW', 'GMAW', 'GTAW', 'FCAW', 'SAW']),
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
  projectId: integer('project_id').notNull().references(() => projects.id),
  inspectionOrderId: integer('inspection_order_id').references(() => inspectionOrders.id),
  
  // Material Identification details
  materialIdentificationId: text('material_identification_id').notNull().unique(), // Format: MI-YYYY-SEQUENCE
  materialDescription: text('material_description').notNull(),
  materialCode: text('material_code').notNull(),
  specification: text('specification').notNull(),
  materialGrade: text('material_grade').notNull(),
  heatNumber: text('heat_number').notNull(),
  batchNumber: text('batch_number'),
  millName: text('mill_name').notNull(),
  millTestCertificateNumber: text('mill_test_certificate_number').notNull(),
  quantity: text('quantity').notNull(),
  dimensions: text('dimensions').notNull(),
  materialStatus: text('material_status').notNull(),
  
  // Inspection details
  inspectorName: text('inspector_name').notNull(),
  inspectionDate: date('inspection_date').notNull(),
  remarks: text('remarks'),
  
  // Tracking and metadata
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Counter table for MI ID sequence numbers
export const materialIdentificationCounter = pgTable('material_identification_counter', {
  year: integer('year').primaryKey(),
  sequenceNumber: integer('sequence_number').notNull().default(0),
});

// Relations for material identification
export const materialIdentificationRelations = relations(materialIdentification, ({ one }) => ({
  project: one(projects, {
    fields: [materialIdentification.projectId],
    references: [projects.id],
  }),
  inspectionOrder: one(inspectionOrders, {
    fields: [materialIdentification.inspectionOrderId],
    references: [inspectionOrders.id],
  }),
  creator: one(users, {
    fields: [materialIdentification.createdBy],
    references: [users.id],
  }),
}));

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
  
  // User and financial year tracking
  userId: integer('user_id').notNull().references(() => users.id),
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
  
  // Calculation status and notes
  status: text('status').notNull().default('active'), // active, completed, archived
  notes: text('notes'),
  
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
  .omit({ id: true, createdAt: true, updatedAt: true });

export type WorkLocation = typeof workLocations.$inferSelect;
export type InsertWorkLocation = z.infer<typeof insertWorkLocationSchema>;

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
    status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).default('pending'),
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
