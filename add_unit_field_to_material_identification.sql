-- Add unit field to material_identification table
ALTER TABLE material_identification 
ADD COLUMN unit VARCHAR(50);

-- Update existing records with a default unit value
UPDATE material_identification 
SET unit = 'Pcs' 
WHERE unit IS NULL;

-- Make the unit field NOT NULL after setting default values
ALTER TABLE material_identification 
ALTER COLUMN unit SET NOT NULL;