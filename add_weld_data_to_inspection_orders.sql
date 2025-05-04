-- Add weld data field to inspection_orders table
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'inspection_orders' 
        AND column_name = 'weld_data'
    ) THEN
        ALTER TABLE inspection_orders ADD COLUMN weld_data TEXT;
        RAISE NOTICE 'Added weld_data column to inspection_orders table';
    ELSE
        RAISE NOTICE 'weld_data column already exists in inspection_orders table';
    END IF;
END $$;