-- Add material_type field to material_identification table
ALTER TABLE material_identification 
ADD COLUMN material_type VARCHAR(255);

-- Update existing records with default value
UPDATE material_identification 
SET material_type = 'Others' 
WHERE material_type IS NULL;