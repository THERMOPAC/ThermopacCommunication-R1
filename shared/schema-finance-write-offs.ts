import { pgTable, serial, integer, text, timestamp, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";
import { users, invoices } from "./schema";

// Financial write-offs table
export const writeOffs = pgTable('write_offs', {
  id: serial('id').primaryKey(),
  invoiceId: integer('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  reason: text('reason').notNull(),
  notes: text('notes'),
  dateCreated: timestamp('date_created').defaultNow().notNull(),
  createdBy: integer('created_by').notNull().references(() => users.id),
  status: text('status').notNull().default('Pending'),
  approvedBy: integer('approved_by').references(() => users.id),
  approvalDate: timestamp('approval_date'),
});

// Define write-off relations
export const writeOffsRelations = relations(writeOffs, ({ one }) => ({
  invoice: one(invoices, {
    fields: [writeOffs.invoiceId],
    references: [invoices.id],
  }),
  creator: one(users, {
    fields: [writeOffs.createdBy],
    references: [users.id],
  }),
  approver: one(users, {
    fields: [writeOffs.approvedBy],
    references: [users.id],
  }),
}));

// Create insert and select types for write-offs
export const insertWriteOffSchema = createInsertSchema(writeOffs).omit({
  id: true,
  dateCreated: true,
  approvedBy: true,
  approvalDate: true,
}).extend({
  reason: z.enum([
    'Goodwill Adjustment', 
    'Disputed Amount', 
    'Rounding Difference', 
    'Bad Debt', 
    'Settlement Agreement',
    'Other'
  ]),
  status: z.enum(['Pending', 'Approved', 'Rejected']).default('Pending'),
});

export type WriteOff = typeof writeOffs.$inferSelect;
export type InsertWriteOff = z.infer<typeof insertWriteOffSchema>;