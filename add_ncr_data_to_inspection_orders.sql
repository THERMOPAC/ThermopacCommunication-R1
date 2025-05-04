-- Add ncr_data column to inspection_orders table
ALTER TABLE inspection_orders ADD COLUMN IF NOT EXISTS ncr_data TEXT;

-- Description: This migration adds a ncr_data column to the inspection_orders table
-- to store Non-Conformance Report (NCR) information in JSON format.
-- Date: May 4, 2025