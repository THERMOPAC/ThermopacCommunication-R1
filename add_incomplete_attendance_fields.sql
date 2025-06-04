-- Add fields for incomplete attendance tracking

-- Add new status values for incomplete attendance
ALTER TABLE attendance_records 
ALTER COLUMN status TYPE VARCHAR(30);

-- Add fields for tracking incomplete attendance
ALTER TABLE attendance_records 
ADD COLUMN IF NOT EXISTS is_incomplete BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS incomplete_reason TEXT,
ADD COLUMN IF NOT EXISTS flagged_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS approval_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS approval_notes TEXT;

-- Update status enum to include incomplete
COMMENT ON COLUMN attendance_records.status IS 'present, absent, partial, late, incomplete';

-- Create index for incomplete attendance queries
CREATE INDEX IF NOT EXISTS idx_attendance_incomplete ON attendance_records(is_incomplete, requires_approval);
CREATE INDEX IF NOT EXISTS idx_attendance_flagged_date ON attendance_records(flagged_at);

-- Create table for attendance issues requiring management attention
CREATE TABLE IF NOT EXISTS attendance_issues (
  id SERIAL PRIMARY KEY,
  attendance_record_id INTEGER NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issue_type VARCHAR(50) NOT NULL, -- 'incomplete_checkout', 'no_dwar', 'late_arrival', 'early_departure'
  description TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high'
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'resolved', 'escalated'
  detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP,
  resolved_by INTEGER REFERENCES users(id),
  resolution_notes TEXT,
  manager_notified BOOLEAN DEFAULT FALSE,
  hr_notified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for attendance issues
CREATE INDEX IF NOT EXISTS idx_attendance_issues_user ON attendance_issues(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_issues_status ON attendance_issues(status);
CREATE INDEX IF NOT EXISTS idx_attendance_issues_type ON attendance_issues(issue_type);
CREATE INDEX IF NOT EXISTS idx_attendance_issues_detected ON attendance_issues(detected_at);