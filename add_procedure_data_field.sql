-- Add procedure_data field to inspection_orders table
-- This field will store JSON data for the Procedures/Test Procedures tab

ALTER TABLE inspection_orders 
ADD COLUMN IF NOT EXISTS procedure_data TEXT;

-- Add comment to document the field
COMMENT ON COLUMN inspection_orders.procedure_data IS 'JSON string storing Test Procedures records data';