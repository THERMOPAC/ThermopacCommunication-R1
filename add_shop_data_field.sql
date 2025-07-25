-- Add shop_data field to inspection_orders table for storing Shop Inspection records as JSON
-- This field was missing from the inspection_orders table preventing Shop tab records from persisting

ALTER TABLE inspection_orders 
ADD COLUMN shop_data TEXT;

-- Add comment for clarity
COMMENT ON COLUMN inspection_orders.shop_data IS 'Shop Inspection data stored as JSON string - matches pattern with other inspection tab data fields';