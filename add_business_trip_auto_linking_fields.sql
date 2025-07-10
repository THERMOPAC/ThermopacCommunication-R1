-- Add auto-linking fields to schengen_travel_log table
-- These fields enable automatic linking between Business Trip Management and EU 180-Day Rule Tracker

-- Add source field to track where the entry came from
ALTER TABLE schengen_travel_log 
ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT 'Manual Entry';

-- Add business_trip_id field to link back to the originating business trip
ALTER TABLE schengen_travel_log 
ADD COLUMN IF NOT EXISTS business_trip_id INTEGER REFERENCES business_trips(id) ON DELETE SET NULL;

-- Add concluded status to business trip statuses (if not already exists)
-- Note: This is handled in the application schema, but ensuring database accepts the new status

-- Create index for performance on the new fields
CREATE INDEX IF NOT EXISTS idx_schengen_travel_log_business_trip_id ON schengen_travel_log(business_trip_id);
CREATE INDEX IF NOT EXISTS idx_schengen_travel_log_source ON schengen_travel_log(source);

-- Update existing records to have proper source value
UPDATE schengen_travel_log 
SET source = 'Manual Entry' 
WHERE source IS NULL;

COMMENT ON COLUMN schengen_travel_log.source IS 'Source of the travel log entry (Manual Entry, Business Trip Module, etc.)';
COMMENT ON COLUMN schengen_travel_log.business_trip_id IS 'Reference to the business trip that generated this entry (if applicable)';