-- Remove fields from test_procedures table
-- Equipment Required, Materials Required, Calibration Requirements, and Safety Precautions

ALTER TABLE test_procedures 
DROP COLUMN IF EXISTS equipment,
DROP COLUMN IF EXISTS materials,
DROP COLUMN IF EXISTS calibration_requirements,
DROP COLUMN IF EXISTS safety_precautions;