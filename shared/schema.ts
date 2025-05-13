import { pgTable, text, serial, integer, boolean, jsonb, timestamp, date, decimal, varchar, foreignKey, primaryKey, sql } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { roles } from "./roles";
import { relations } from "drizzle-orm";

// Available system modules
export const modules = [
  "Sales and Marketing",
  "Project Management",
  "Procurement Management", 
  "Production Management", 
  "Quality Management",
  "Project Commissioning",
  "Dispatch & Shipping",
  "After-Sales"
] as const;

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
  annualRevenue: decimal('annual_revenue', { precision: 15, scale: 2 }),
  employeeCount: integer('employee_count'),
  
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
  startDate: date('start_date'),
  endDate: date('end_date'),
  budget: decimal('budget', { precision: 15, scale: 2 }),
  actualCost: decimal('actual_cost', { precision: 15, scale: 2 }),
  status: text('status', { enum: campaignStatuses }).notNull(),
  goals: text('goals'),
  targetAudience: text('target_audience'),
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
};

// Create the users table with self-reference after definition
export const users = pgTable('users', {
  ...userSchema,
  reportingManagerId: integer('reporting_manager_id'),
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

export const insertUserSchema = createInsertSchema(users).extend({
  role: z.enum(roles),
  reportingManagerId: z.number().optional(),
  password: z.string().min(6),
  email: z.string().email(),
  mobileNumber: z.string().min(10),
  countryCode: z.string(),
});

export const insertTaskSchema = createInsertSchema(tasks).extend({
  priority: z.enum(['Low', 'Medium', 'High']),
  startDate: z.string(),
  finishDate: z.string(),
  dueDate: z.string().optional()
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