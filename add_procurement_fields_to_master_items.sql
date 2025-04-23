-- Add procurement fields to master_items table
ALTER TABLE master_items 
ADD COLUMN IF NOT EXISTS preferred_vendor_id INTEGER REFERENCES vendors(id),
ADD COLUMN IF NOT EXISTS estimated_cost DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS unit TEXT;