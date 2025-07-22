-- Add certified_by field to pma_documents table
ALTER TABLE pma_documents 
ADD COLUMN certified_by VARCHAR(100) NOT NULL DEFAULT 'Pending';

-- Remove default after adding the column (so future inserts require the field)
ALTER TABLE pma_documents 
ALTER COLUMN certified_by DROP DEFAULT;