import { pgTable, text, serial, integer, boolean, jsonb, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { roles } from "./roles";

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  email: text('email').notNull().unique(),
  mobileNumber: text('mobile_number').notNull(),
  countryCode: text('country_code').notNull(),
  role: text('role', { enum: roles }).notNull(),
  reportingManagerId: integer('reporting_manager_id').references(() => users.id),
});

// Define task priority enum
export const taskPriorities = ['Low', 'Medium', 'High'] as const;

// Define task status enum
export const taskStatuses = ['pending', 'completed'] as const;

// Define recurring pattern types
export const recurringPatternTypes = ['none', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const;

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  priority: text('priority', { enum: taskPriorities }).notNull(),
  status: text('status', { enum: taskStatuses }).notNull().default('pending'),
  startDate: date('start_date').notNull(),
  finishDate: date('finish_date').notNull(),
  assignedTo: integer('assigned_to').references(() => users.id),
  createdBy: integer('created_by').references(() => users.id),
  // Recurring task fields
  isRecurring: boolean('is_recurring').notNull().default(false),
  recurringPattern: text('recurring_pattern', { enum: recurringPatternTypes }).notNull().default('none'),
  recurringDays: jsonb('recurring_days'), // For storing multiple days in weekly pattern
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
  priority: z.enum(taskPriorities),
  status: z.enum(taskStatuses),
  startDate: z.coerce.date(),
  finishDate: z.coerce.date(),
  recurringPattern: z.enum(recurringPatternTypes).optional(),
  recurringDays: z.array(z.number()).optional(), // For weekly pattern: [1,3] means Monday and Wednesday
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;