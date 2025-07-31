-- Add temperature field to llm_prompts table
ALTER TABLE llm_prompts 
ADD COLUMN IF NOT EXISTS temperature NUMERIC(3, 2) DEFAULT 0.70;

-- Update existing records to have default temperature if null
UPDATE llm_prompts 
SET temperature = 0.70 
WHERE temperature IS NULL;