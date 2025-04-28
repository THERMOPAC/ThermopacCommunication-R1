-- Create WPQR documents table
CREATE TABLE IF NOT EXISTS wpqr_documents (
  id SERIAL PRIMARY KEY,
  document_id VARCHAR(50) NOT NULL UNIQUE,
  title VARCHAR(100) NOT NULL,
  description TEXT,
  welder_process VARCHAR(20) NOT NULL,
  base_metal_grade VARCHAR(100) NOT NULL,
  joint_type VARCHAR(50) NOT NULL,
  file_path VARCHAR(255),
  file_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'Active',
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);