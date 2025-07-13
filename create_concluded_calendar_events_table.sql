-- Create table to track concluded Google Calendar events
CREATE TABLE IF NOT EXISTS concluded_calendar_events (
  id SERIAL PRIMARY KEY,
  google_event_id VARCHAR(255) NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  event_title VARCHAR(500),
  concluded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_concluded_events_user_id ON concluded_calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_concluded_events_google_id ON concluded_calendar_events(google_event_id);

-- Add comment
COMMENT ON TABLE concluded_calendar_events IS 'Tracks Google Calendar events that have been marked as concluded by users';