-- Create GCS Directories table
CREATE TABLE IF NOT EXISTS gcs_directories (
  id SERIAL PRIMARY KEY,
  
  -- Directory structure
  financial_year TEXT NOT NULL,
  project_code TEXT NOT NULL,
  department TEXT NOT NULL,
  sub_directory TEXT,
  
  -- Full path in GCS
  full_path TEXT NOT NULL UNIQUE,
  
  -- Access control
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create GCS Files table
CREATE TABLE IF NOT EXISTS gcs_files (
  id SERIAL PRIMARY KEY,
  
  -- File details
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size BIGINT NOT NULL,
  
  -- Directory association
  directory_id INTEGER REFERENCES gcs_directories(id) ON DELETE CASCADE,
  
  -- GCS path
  gcs_path TEXT NOT NULL UNIQUE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER, -- User ID
  
  -- File properties
  description TEXT,
  tags TEXT[]
);