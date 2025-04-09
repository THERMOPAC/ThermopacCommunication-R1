import { pgTable, text, serial, integer, boolean, jsonb, timestamp, date, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { roles } from "./roles";

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

// Define types for all tables
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
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
  
  // Additional details
  standardCost: decimal('standard_cost', { precision: 12, scale: 2 }),
  supplier: text('supplier'),
  notes: text('notes'),
  
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
});

// Project item insert schema
export const insertProjectItemSchema = createInsertSchema(projectItems, {
  itemId: z.number().positive(),
  quantity: z.number().positive(),
  estimatedCost: z.number().nullable().optional().transform(v => v === null ? undefined : v),
  actualCost: z.number().nullable().optional().transform(v => v === null ? undefined : v),
  notes: z.string().nullable().optional().transform(v => v === null ? '' : v),
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

export type PhaseApproval = typeof phaseApprovals.$inferSelect;
export type InsertPhaseApproval = z.infer<typeof insertPhaseApprovalSchema>;

export type ProjectDocument = typeof projectDocuments.$inferSelect;
export type InsertProjectDocument = z.infer<typeof insertProjectDocumentSchema>;

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;