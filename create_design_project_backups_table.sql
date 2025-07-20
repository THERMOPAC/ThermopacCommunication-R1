-- Create Design Project Backups table
CREATE TABLE IF NOT EXISTS design_project_backups (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Backup Classification
  backup_type VARCHAR(100) NOT NULL, -- 3D Model, PLC Program, SCADA
  
  -- File Details
  file_name VARCHAR(255) NOT NULL,
  original_file_name VARCHAR(255),
  revision VARCHAR(50) DEFAULT 'R1',
  description TEXT,
  
  -- Storage Information
  file_path TEXT NOT NULL,
  file_url TEXT,
  file_size INTEGER,
  file_type VARCHAR(50),
  
  -- Revision Control
  status VARCHAR(50) NOT NULL DEFAULT 'current', -- current, superseded, archived
  is_revision BOOLEAN NOT NULL DEFAULT false,
  revision_of INTEGER REFERENCES design_project_backups(id) ON DELETE SET NULL,
  revision_reason TEXT,
  superseded_at TIMESTAMP,
  superseded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  
  -- Upload Information
  uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_design_project_backups_project_id ON design_project_backups(project_id);
CREATE INDEX IF NOT EXISTS idx_design_project_backups_backup_type ON design_project_backups(backup_type);
CREATE INDEX IF NOT EXISTS idx_design_project_backups_status ON design_project_backups(status);
CREATE INDEX IF NOT EXISTS idx_design_project_backups_revision_of ON design_project_backups(revision_of);
CREATE INDEX IF NOT EXISTS idx_design_project_backups_uploaded_by ON design_project_backups(uploaded_by);

-- Add constraints
ALTER TABLE design_project_backups 
ADD CONSTRAINT check_backup_type 
CHECK (backup_type IN ('3D Model', 'PLC Program', 'SCADA'));

ALTER TABLE design_project_backups 
ADD CONSTRAINT check_status 
CHECK (status IN ('current', 'superseded', 'archived'));

-- Insert sample data for testing
INSERT INTO design_project_backups (
  project_id, backup_type, file_name, original_file_name, revision, description,
  file_path, file_url, file_size, file_type, uploaded_by
) VALUES 
(8, '3D Model', 'Flukar_3D_Model_R1.step', 'Flukar_3D_Model.step', 'R1', 'Initial 3D model backup for Flukar CPS 120',
 'Design_Management/2025-2/Backups/3D Model_R1/Flukar_3D_Model.step', 
 'https://storage.googleapis.com/thermopac_storage/Design_Management/2025-2/Backups/3D Model_R1/Flukar_3D_Model.step',
 15728640, 'step', 3),

(8, 'PLC Program', 'Flukar_PLC_Program_R1.zip', 'Flukar_PLC_Program.zip', 'R1', 'Initial PLC program backup for Flukar CPS 120',
 'Design_Management/2025-2/Backups/PLC Program_R1/Flukar_PLC_Program.zip',
 'https://storage.googleapis.com/thermopac_storage/Design_Management/2025-2/Backups/PLC Program_R1/Flukar_PLC_Program.zip',
 2097152, 'zip', 3),

(8, 'SCADA', 'Flukar_SCADA_R1.zip', 'Flukar_SCADA.zip', 'R1', 'Initial SCADA backup for Flukar CPS 120',
 'Design_Management/2025-2/Backups/SCADA_R1/Flukar_SCADA.zip',
 'https://storage.googleapis.com/thermopac_storage/Design_Management/2025-2/Backups/SCADA_R1/Flukar_SCADA.zip',
 5242880, 'zip', 3),

-- Add revision examples
(8, '3D Model', 'Flukar_3D_Model_R2.step', 'Flukar_3D_Model_Updated.step', 'R2', 'Updated 3D model with design improvements',
 'Design_Management/2025-2/Backups/3D Model_R2/Flukar_3D_Model_Updated.step',
 'https://storage.googleapis.com/thermopac_storage/Design_Management/2025-2/Backups/3D Model_R2/Flukar_3D_Model_Updated.step',
 16777216, 'step', 3);

-- Update revision references
UPDATE design_project_backups 
SET revision_of = (SELECT id FROM design_project_backups WHERE backup_type = '3D Model' AND revision = 'R1' AND project_id = 8),
    is_revision = true
WHERE backup_type = '3D Model' AND revision = 'R2' AND project_id = 8;