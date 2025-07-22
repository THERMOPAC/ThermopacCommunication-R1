-- Add issue_date column to PMA documents table
ALTER TABLE pma_documents ADD COLUMN issue_date DATE;

-- Set a default issue date for existing records (if any)
UPDATE pma_documents SET issue_date = CURRENT_DATE WHERE issue_date IS NULL;

-- Make the issue_date column NOT NULL after setting defaults
ALTER TABLE pma_documents ALTER COLUMN issue_date SET NOT NULL;