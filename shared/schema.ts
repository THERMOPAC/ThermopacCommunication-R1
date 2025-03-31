import { pgTable, text, serial, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
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

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type TaskHistory = typeof taskHistory.$inferSelect;
export type InsertTaskHistory = z.infer<typeof insertTaskHistorySchema>;
export type WorkflowRecommendation = typeof workflowRecommendations.$inferSelect;
export type InsertWorkflowRecommendation = z.infer<typeof insertWorkflowRecommendationSchema>;