-- Drop the old PMA tables and recreate with new structure
DROP TABLE IF EXISTS pma_materials CASCADE;
DROP TABLE IF EXISTS pma_documents CASCADE;

-- Create new PMA documents table with simplified structure
CREATE TABLE pma_documents (
  id SERIAL PRIMARY KEY,
  pma_number VARCHAR(50) NOT NULL UNIQUE,
  specification VARCHAR(100) NOT NULL,
  grade VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Draft',
  remarks TEXT,
  expiry_date DATE NOT NULL,
  file_path VARCHAR(255),
  file_url TEXT,
  original_file_name VARCHAR(255),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add check constraint for status
ALTER TABLE pma_documents ADD CONSTRAINT pma_documents_status_check 
  CHECK (status IN ('Draft', 'Active', 'Inactive'));