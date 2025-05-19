import { pgTable, serial, integer, decimal, text, timestamp, boolean } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Define the write-offs table
export const writeOffs = pgTable('write_offs', {
  id: serial('id').primaryKey(),
  invoiceId: integer('invoice_id').notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  reason: text('reason').notNull(),
  notes: text('notes'),
  dateCreated: timestamp('date_created').notNull().defaultNow(),
  createdBy: integer('created_by').notNull(),
  status: text('status').notNull().default('Pending'), // Pending, Approved, Rejected
  approvedBy: integer('approved_by'),
  approvalDate: timestamp('approval_date')
});

// Define the insert schema for write-offs (exclude auto-generated fields)
export const insertWriteOffSchema = createInsertSchema(writeOffs, {
  amount: z.string().or(z.number()).transform(val => 
    typeof val === 'string' ? parseFloat(val) : val
  ),
}).omit({ 
  id: true, 
  dateCreated: true,
  status: true,
  approvedBy: true,
  approvalDate: true
});

// Define the type for write-offs table
export type WriteOff = typeof writeOffs.$inferSelect;
export type InsertWriteOff = z.infer<typeof insertWriteOffSchema>;

// Define the schema for write-off status update
export const writeOffStatusUpdateSchema = z.object({
  status: z.enum(['Approved', 'Rejected']),
  notes: z.string().optional()
});

export type WriteOffStatusUpdate = z.infer<typeof writeOffStatusUpdateSchema>;