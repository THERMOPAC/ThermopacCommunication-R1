-- Add Approved Drawing, DVR, and ITP data fields to inspection_orders table
-- These fields will store JSON data for the corresponding inspection tabs

ALTER TABLE inspection_orders 
ADD COLUMN IF NOT EXISTS approved_drawing_data TEXT,
ADD COLUMN IF NOT EXISTS dvr_data TEXT,
ADD COLUMN IF NOT EXISTS itp_data TEXT;

-- Add comments to document the fields
COMMENT ON COLUMN inspection_orders.approved_drawing_data IS 'JSON string storing Approved Drawing records data';
COMMENT ON COLUMN inspection_orders.dvr_data IS 'JSON string storing Design Verification Records (DVR) data';
COMMENT ON COLUMN inspection_orders.itp_data IS 'JSON string storing Inspection Test Plan (ITP) records data';