-- Add weld_data column to inspection_orders table
ALTER TABLE inspection_orders ADD COLUMN IF NOT EXISTS weld_data TEXT;

-- Description: This migration adds a weld_data column to the inspection_orders table
-- to store welding and weld maps information in JSON format.
-- Date: May 4, 2025