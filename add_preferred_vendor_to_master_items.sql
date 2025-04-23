-- Add preferred_vendor_id column to master_items table
ALTER TABLE master_items
ADD COLUMN preferred_vendor_id INTEGER REFERENCES vendors(id);

-- Add estimated_cost column to master_items table if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'master_items' AND column_name = 'estimated_cost'
    ) THEN
        ALTER TABLE master_items ADD COLUMN estimated_cost DECIMAL(10, 2);
    END IF;
END $$;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_master_items_preferred_vendor ON master_items(preferred_vendor_id);