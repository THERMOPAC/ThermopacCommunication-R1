-- Add Google Meet integration and AI notes fields to business_meetings table
ALTER TABLE business_meetings ADD COLUMN IF NOT EXISTS google_meet_link TEXT;
ALTER TABLE business_meetings ADD COLUMN IF NOT EXISTS google_meet_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE business_meetings ADD COLUMN IF NOT EXISTS recording_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE business_meetings ADD COLUMN IF NOT EXISTS recording_url TEXT;
ALTER TABLE business_meetings ADD COLUMN IF NOT EXISTS transcript_url TEXT;
ALTER TABLE business_meetings ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE business_meetings ADD COLUMN IF NOT EXISTS ai_action_items JSONB DEFAULT '[]';
ALTER TABLE business_meetings ADD COLUMN IF NOT EXISTS ai_key_points JSONB DEFAULT '[]';
ALTER TABLE business_meetings ADD COLUMN IF NOT EXISTS ai_notes_generated BOOLEAN DEFAULT FALSE;
ALTER TABLE business_meetings ADD COLUMN IF NOT EXISTS ai_notes_generated_at TIMESTAMP;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_meetings_google_meet ON business_meetings(google_meet_link);
CREATE INDEX IF NOT EXISTS idx_meetings_recording ON business_meetings(recording_enabled);
CREATE INDEX IF NOT EXISTS idx_meetings_ai_notes ON business_meetings(ai_notes_generated);

-- Add comment for documentation
COMMENT ON COLUMN business_meetings.google_meet_link IS 'Auto-generated Google Meet link for virtual meetings';
COMMENT ON COLUMN business_meetings.recording_enabled IS 'Whether to enable recording for this meeting';
COMMENT ON COLUMN business_meetings.ai_summary IS 'AI-generated meeting summary from Google Meet transcript';
COMMENT ON COLUMN business_meetings.ai_action_items IS 'Array of AI-extracted action items from meeting';
COMMENT ON COLUMN business_meetings.ai_key_points IS 'Array of AI-extracted key discussion points';