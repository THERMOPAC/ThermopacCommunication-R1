-- Add "In Use" field to calibration_instruments table
-- This field indicates whether the calibration instrument is currently in use or not

-- Add the in_use column with default value "In Use"
ALTER TABLE calibration_instruments 
ADD COLUMN IF NOT EXISTS in_use VARCHAR(20) NOT NULL DEFAULT 'In Use';

-- Create index on in_use for filtering
CREATE INDEX IF NOT EXISTS idx_calibration_in_use ON calibration_instruments(in_use);

-- Add check constraint to ensure only valid values
ALTER TABLE calibration_instruments 
ADD CONSTRAINT IF NOT EXISTS chk_calibration_in_use 
CHECK (in_use IN ('In Use', 'Not in Use'));

-- Update any existing NULL values to "In Use"
UPDATE calibration_instruments 
SET in_use = 'In Use' 
WHERE in_use IS NULL;