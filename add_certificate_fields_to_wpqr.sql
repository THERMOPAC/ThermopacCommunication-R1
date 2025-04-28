-- Add certificate_no and inspection_authority columns to wpqr_documents table
ALTER TABLE wpqr_documents 
ADD COLUMN certificate_no VARCHAR(50),
ADD COLUMN inspection_authority VARCHAR(50);