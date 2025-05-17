-- Script to reset all financial data
-- Warning: This will delete all invoices, payments, allocations and write-offs

-- First, disable foreign key constraints temporarily
SET session_replication_role = 'replica';

-- Delete data from tables in the correct order to respect dependencies
DELETE FROM write_offs;
DELETE FROM payment_allocations;
DELETE FROM invoice_items;
DELETE FROM invoices;
DELETE FROM payments;

-- Re-enable foreign key constraints
SET session_replication_role = 'origin';

-- Optionally reset sequence counters
ALTER SEQUENCE invoices_id_seq RESTART WITH 1;
ALTER SEQUENCE payments_id_seq RESTART WITH 1;
ALTER SEQUENCE invoice_items_id_seq RESTART WITH 1;
ALTER SEQUENCE payment_allocations_id_seq RESTART WITH 1;
ALTER SEQUENCE write_offs_id_seq RESTART WITH 1;