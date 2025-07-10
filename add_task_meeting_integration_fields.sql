-- Add meeting integration fields to tasks table
-- Migration to support automatic task generation from meeting commitments

-- Add source type and source ID fields to track task origin
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS source_type TEXT,
ADD COLUMN IF NOT EXISTS source_id INTEGER;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_tasks_source_type ON tasks(source_type);
CREATE INDEX IF NOT EXISTS idx_tasks_source_id ON tasks(source_id);
CREATE INDEX IF NOT EXISTS idx_tasks_source_composite ON tasks(source_type, source_id);

-- Add comments for documentation
COMMENT ON COLUMN tasks.source_type IS 'Origin of the task: manual, meeting_commitment, recurring';
COMMENT ON COLUMN tasks.source_id IS 'ID of the source record (meeting commitment ID if source_type is meeting_commitment)';