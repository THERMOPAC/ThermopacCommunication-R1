-- Add Google Calendar support to meeting commitments
-- This allows commitments to link to both internal meetings and Google Calendar events

BEGIN;

-- Add new columns to support Google Calendar events
ALTER TABLE meeting_commitments 
ADD COLUMN meeting_type VARCHAR(20) DEFAULT 'internal',  -- 'internal' or 'google_calendar'
ADD COLUMN google_calendar_event_id TEXT,               -- Google Calendar event ID
ADD COLUMN meeting_title TEXT,                          -- Store meeting title for reference
ADD COLUMN meeting_date DATE,                           -- Store meeting date for reference
ADD COLUMN meeting_start_time TIME;                     -- Store meeting start time for reference

-- Update the constraint to make meeting_id nullable for Google Calendar events
ALTER TABLE meeting_commitments 
ALTER COLUMN meeting_id DROP NOT NULL;

-- Add a check constraint to ensure proper data integrity
ALTER TABLE meeting_commitments 
ADD CONSTRAINT meeting_reference_check 
CHECK (
  (meeting_type = 'internal' AND meeting_id IS NOT NULL AND google_calendar_event_id IS NULL) OR
  (meeting_type = 'google_calendar' AND google_calendar_event_id IS NOT NULL AND meeting_id IS NULL)
);

-- Add comment explaining the new structure
COMMENT ON COLUMN meeting_commitments.meeting_type IS 'Type of meeting: internal (business_meetings table) or google_calendar (Google Calendar API)';
COMMENT ON COLUMN meeting_commitments.google_calendar_event_id IS 'Google Calendar event ID when meeting_type is google_calendar';
COMMENT ON COLUMN meeting_commitments.meeting_title IS 'Meeting title for display purposes';
COMMENT ON COLUMN meeting_commitments.meeting_date IS 'Meeting date for display and filtering';
COMMENT ON COLUMN meeting_commitments.meeting_start_time IS 'Meeting start time for display purposes';

COMMIT;