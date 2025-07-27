-- Add material_traceability_data field to inspection_orders table
ALTER TABLE inspection_orders ADD COLUMN IF NOT EXISTS material_traceability_data TEXT;

-- Add comment for documentation
COMMENT ON COLUMN inspection_orders.material_traceability_data IS 'JSON string storing material traceability data for inspection orders';