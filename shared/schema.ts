import { pgTable, text, serial, integer, boolean, jsonb, timestamp, date } from "drizzle-orm/pg-core";
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
  assignedTo: integer('assigned_to').references(() => users.id),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: text('created_at').notNull(),
  completedAt: text('completed_at'),
  category: text('category'), // Optional category for task classification
  
  // Link to recurring pattern if this task was generated from one
  recurringPatternId: integer('recurring_pattern_id').references(() => recurringPatterns.id),
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
  finishDate: z.string()
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

// Recurring pattern insert schema
export const insertRecurringPatternSchema = createInsertSchema(recurringPatterns, {
  pattern: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().min(1),
  daysOfWeek: z.string().optional(),
  dayOfMonth: z.number().optional(),
  monthOfYear: z.number().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  templateTitle: z.string().min(3, { message: "Title must be at least 3 characters" }),
  templateDescription: z.string().min(5, { message: "Description must be at least 5 characters" }),
  templatePriority: z.enum(['Low', 'Medium', 'High']),
  templateCategory: z.string().optional(),
  templateAssignedTo: z.number().optional(),
  templateDurationDays: z.number().min(1),
  userId: z.number(),
  isActive: z.boolean().optional().default(true),
  maxOccurrences: z.number().optional(),
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