-- Add revision control fields to design_basic_drawings table
-- Migration: Add revision control for Project Basic Drawings

-- Add new columns for revision control
ALTER TABLE design_basic_drawings ADD COLUMN IF NOT EXISTS original_file_name VARCHAR(255);
ALTER TABLE design_basic_drawings ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'current';
ALTER TABLE design_basic_drawings ADD COLUMN IF NOT EXISTS is_revision BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE design_basic_drawings ADD COLUMN IF NOT EXISTS revision_of INTEGER REFERENCES design_basic_drawings(id) ON DELETE SET NULL;
ALTER TABLE design_basic_drawings ADD COLUMN IF NOT EXISTS revision_reason TEXT;
ALTER TABLE design_basic_drawings ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMP;
ALTER TABLE design_basic_drawings ADD COLUMN IF NOT EXISTS superseded_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Add CHECK constraint for status values
ALTER TABLE design_basic_drawings DROP CONSTRAINT IF EXISTS design_basic_drawings_status_check;
ALTER TABLE design_basic_drawings ADD CONSTRAINT design_basic_drawings_status_check 
CHECK (status IN ('current', 'superseded', 'archived'));

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_design_basic_drawings_status ON design_basic_drawings(status);
CREATE INDEX IF NOT EXISTS idx_design_basic_drawings_revision_of ON design_basic_drawings(revision_of);
CREATE INDEX IF NOT EXISTS idx_design_basic_drawings_project_discipline ON design_basic_drawings(project_id, discipline);
CREATE INDEX IF NOT EXISTS idx_design_basic_drawings_project_discipline_type ON design_basic_drawings(project_id, discipline, drawing_type);

-- Update existing records to have original_file_name
UPDATE design_basic_drawings 
SET original_file_name = file_name 
WHERE original_file_name IS NULL;

COMMENT ON TABLE design_basic_drawings IS 'Project Basic Drawings with automatic revision control';
COMMENT ON COLUMN design_basic_drawings.original_file_name IS 'Original uploaded file name without version prefix';
COMMENT ON COLUMN design_basic_drawings.status IS 'Drawing status: current, superseded, archived';
COMMENT ON COLUMN design_basic_drawings.is_revision IS 'Whether this is a revision of an existing drawing';
COMMENT ON COLUMN design_basic_drawings.revision_of IS 'ID of the drawing this is a revision of';
COMMENT ON COLUMN design_basic_drawings.revision_reason IS 'Reason for creating this revision';
COMMENT ON COLUMN design_basic_drawings.superseded_at IS 'When this drawing was superseded by a newer version';
COMMENT ON COLUMN design_basic_drawings.superseded_by IS 'User who superseded this drawing';