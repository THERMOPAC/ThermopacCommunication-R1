-- Create ITP Templates table
CREATE TABLE IF NOT EXISTS itp_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  version VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create ITPs table
CREATE TABLE IF NOT EXISTS itps (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  project_id INT REFERENCES projects(id),
  qap_id INT REFERENCES generated_qaps(id),
  equipment_name VARCHAR(255) NOT NULL,
  drawing_number VARCHAR(255),
  revision VARCHAR(50) NOT NULL DEFAULT 'A',
  version INT NOT NULL DEFAULT 1,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  notified_body VARCHAR(255),
  hazard_level VARCHAR(50),
  prepared_by INT REFERENCES users(id),
  approved_by INT REFERENCES users(id),
  content JSON NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create ITP Versions table for version tracking
CREATE TABLE IF NOT EXISTS itp_versions (
  id SERIAL PRIMARY KEY,
  itp_id INT REFERENCES itps(id) ON DELETE CASCADE,
  version INT NOT NULL,
  revision VARCHAR(50) NOT NULL,
  content JSON NOT NULL,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create ITP Inspection Activities table
CREATE TABLE IF NOT EXISTS itp_activities (
  id SERIAL PRIMARY KEY,
  itp_id INT REFERENCES itps(id) ON DELETE CASCADE,
  sequence_number INT NOT NULL,
  activity_name VARCHAR(255) NOT NULL,
  characteristics VARCHAR(255),
  reference_documents TEXT,
  acceptance_criteria TEXT,
  record_format VARCHAR(255),
  inspection_by JSON, -- Stores who needs to inspect (Manufacturer, Third-party, etc.)
  remarks TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX idx_itps_project_id ON itps(project_id);
CREATE INDEX idx_itps_qap_id ON itps(qap_id);
CREATE INDEX idx_itp_versions_itp_id ON itp_versions(itp_id);
CREATE INDEX idx_itp_activities_itp_id ON itp_activities(itp_id);