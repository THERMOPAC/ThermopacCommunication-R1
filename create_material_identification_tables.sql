-- Material Identification Tables
-- For tracking material identification records

-- Material Identification table
CREATE TABLE IF NOT EXISTS material_identification (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  inspection_order_id INTEGER REFERENCES inspection_orders(id) ON DELETE SET NULL,
  
  -- Material Identification details
  material_identification_id TEXT NOT NULL UNIQUE, -- Format: MI-YYYY-SEQUENCE
  material_description TEXT NOT NULL,
  material_code TEXT NOT NULL,
  specification TEXT NOT NULL,
  material_grade TEXT NOT NULL,
  heat_number TEXT NOT NULL,
  batch_number TEXT,
  mill_name TEXT NOT NULL,
  mill_test_certificate_number TEXT NOT NULL,
  quantity TEXT NOT NULL,
  dimensions TEXT NOT NULL,
  material_status TEXT NOT NULL,
  
  -- Inspection details
  inspector_name TEXT NOT NULL,
  inspection_date DATE NOT NULL,
  remarks TEXT,
  
  -- Tracking and metadata
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Counter table for MI ID sequence numbers
CREATE TABLE IF NOT EXISTS material_identification_counter (
  year INTEGER NOT NULL PRIMARY KEY,
  sequence_number INTEGER NOT NULL DEFAULT 0
);

-- Create indexes for performance
CREATE INDEX idx_material_identification_project_id ON material_identification(project_id);
CREATE INDEX idx_material_identification_material_id ON material_identification(material_identification_id);