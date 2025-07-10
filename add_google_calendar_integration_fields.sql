-- =============================================================================
-- GOOGLE CALENDAR INTEGRATION FIELDS
-- Created: July 10, 2025
-- Description: Add Google Calendar integration fields to support OAuth and event syncing
-- =============================================================================

-- Add Google Calendar integration fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar_connected BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_token_expires_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar_sync_enabled BOOLEAN DEFAULT TRUE;

-- Add Google Calendar event tracking to business_meetings table
ALTER TABLE business_meetings ADD COLUMN IF NOT EXISTS google_event_id TEXT;
ALTER TABLE business_meetings ADD COLUMN IF NOT EXISTS google_calendar_synced BOOLEAN DEFAULT FALSE;
ALTER TABLE business_meetings ADD COLUMN IF NOT EXISTS google_event_link TEXT;
ALTER TABLE business_meetings ADD COLUMN IF NOT EXISTS auto_create_calendar_event BOOLEAN DEFAULT TRUE;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_google_calendar ON users(google_calendar_connected);
CREATE INDEX IF NOT EXISTS idx_meetings_google_event ON business_meetings(google_event_id);
CREATE INDEX IF NOT EXISTS idx_meetings_google_synced ON business_meetings(google_calendar_synced);

-- Create a table to track Google Calendar sync logs
CREATE TABLE IF NOT EXISTS google_calendar_sync_log (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER REFERENCES business_meetings(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- 'create', 'update', 'delete', 'sync_error'
    google_event_id TEXT,
    status VARCHAR(20) NOT NULL, -- 'success', 'error', 'pending'
    error_message TEXT,
    sync_details JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_log_meeting ON google_calendar_sync_log(meeting_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_user ON google_calendar_sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_status ON google_calendar_sync_log(status);