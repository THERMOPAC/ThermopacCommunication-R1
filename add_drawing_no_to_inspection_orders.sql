-- Add drawing_no column to inspection_orders table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'inspection_orders' 
        AND column_name = 'drawing_no'
    ) THEN
        ALTER TABLE inspection_orders ADD COLUMN drawing_no TEXT;
        RAISE NOTICE 'Added drawing_no column to inspection_orders table';
    ELSE
        RAISE NOTICE 'drawing_no column already exists in inspection_orders table';
    END IF;
END $$;