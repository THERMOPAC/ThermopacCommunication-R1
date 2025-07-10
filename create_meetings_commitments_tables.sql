-- =============================================================================
-- MEETINGS & COMMITMENTS MODULE - DATABASE MIGRATION
-- Created: July 10, 2025
-- Description: Complete database schema for business meetings and commitment tracking
-- =============================================================================

-- Business Meetings table
CREATE TABLE IF NOT EXISTS business_meetings (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    meeting_type VARCHAR(50) NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'Medium',
    
    -- Scheduling
    meeting_date DATE NOT NULL,
    start_time VARCHAR(8) NOT NULL,
    end_time VARCHAR(8) NOT NULL,
    duration_minutes INTEGER,
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    
    -- Location
    location TEXT,
    meeting_url TEXT,
    meeting_room_id INTEGER,
    
    -- Organizer and participants
    organizer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    attendee_ids JSONB NOT NULL DEFAULT '[]',
    external_attendees JSONB DEFAULT '[]',
    
    -- Agenda and documentation
    agenda TEXT,
    agenda_items JSONB DEFAULT '[]',
    meeting_notes TEXT,
    key_decisions TEXT,
    next_steps TEXT,
    
    -- Meeting outcomes
    status VARCHAR(20) NOT NULL DEFAULT 'Scheduled',
    completion_percentage INTEGER DEFAULT 0,
    effectiveness_rating INTEGER,
    
    -- Document attachments
    attachments JSONB DEFAULT '[]',
    
    -- Follow-up and recurring meetings
    is_recurring BOOLEAN DEFAULT FALSE,
    recurring_pattern JSONB,
    parent_meeting_id INTEGER REFERENCES business_meetings(id),
    
    -- KPI Integration
    linked_kpis JSONB DEFAULT '[]',
    kpi_weight DECIMAL(5,2) DEFAULT 0,
    
    -- Tracking
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Meeting Commitments/Action Items table
CREATE TABLE IF NOT EXISTS meeting_commitments (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER NOT NULL REFERENCES business_meetings(id) ON DELETE CASCADE,
    
    -- Commitment details
    title TEXT NOT NULL,
    description TEXT,
    priority VARCHAR(20) NOT NULL DEFAULT 'Medium',
    category VARCHAR(50) DEFAULT 'Action Item',
    
    -- Assignment and responsibility
    assigned_to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_by_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    collaborators JSONB DEFAULT '[]',
    
    -- Timeline and deadlines
    due_date DATE NOT NULL,
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    
    -- Progress tracking
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    progress_percentage INTEGER DEFAULT 0,
    completion_date DATE,
    
    -- Updates and communication
    status_updates JSONB DEFAULT '[]',
    blockers TEXT,
    dependencies JSONB DEFAULT '[]',
    
    -- Escalation and reminders
    reminder_days INTEGER DEFAULT 1,
    escalation_days INTEGER DEFAULT 3,
    last_reminder_sent TIMESTAMP,
    escalation_sent BOOLEAN DEFAULT FALSE,
    escalated_at TIMESTAMP,
    escalated_to_id INTEGER REFERENCES users(id),
    
    -- Quality and impact
    impact_level VARCHAR(20) DEFAULT 'Medium',
    business_value TEXT,
    success_criteria TEXT,
    deliverables JSONB DEFAULT '[]',
    
    -- KPI Integration
    linked_kpis JSONB DEFAULT '[]',
    kpi_weight DECIMAL(5,2) DEFAULT 0,
    kpi_impact_percentage DECIMAL(5,2) DEFAULT 0,
    
    -- Approval and sign-off
    requires_approval BOOLEAN DEFAULT FALSE,
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMP,
    approval_notes TEXT,
    
    -- Tracking
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Meeting Attendance Tracking table
CREATE TABLE IF NOT EXISTS meeting_attendance (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER NOT NULL REFERENCES business_meetings(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Attendance status
    status VARCHAR(20) NOT NULL DEFAULT 'Invited',
    response_date TIMESTAMP,
    attendance_confirmed BOOLEAN DEFAULT FALSE,
    
    -- Participation tracking
    join_time TIMESTAMP,
    leave_time TIMESTAMP,
    participation_minutes INTEGER,
    participation_score INTEGER,
    
    -- Feedback and notes
    meeting_feedback TEXT,
    action_items_received INTEGER DEFAULT 0,
    action_items_completed INTEGER DEFAULT 0,
    
    -- Tracking
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Meeting Reminder and Escalation Log table
CREATE TABLE IF NOT EXISTS meeting_reminders (
    id SERIAL PRIMARY KEY,
    
    -- Reference
    meeting_id INTEGER REFERENCES business_meetings(id) ON DELETE CASCADE,
    commitment_id INTEGER REFERENCES meeting_commitments(id) ON DELETE CASCADE,
    
    -- Reminder details
    reminder_type VARCHAR(30) NOT NULL,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reminder_message TEXT NOT NULL,
    
    -- Delivery
    delivery_method VARCHAR(20) NOT NULL DEFAULT 'email',
    sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
    delivery_status VARCHAR(20) NOT NULL DEFAULT 'sent',
    
    -- Response tracking
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP,
    response_action VARCHAR(50),
    
    -- Tracking
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Meeting Analytics and Metrics table
CREATE TABLE IF NOT EXISTS meeting_analytics (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    team_id INTEGER,
    
    -- Time period
    period_type VARCHAR(20) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Meeting metrics
    total_meetings INTEGER DEFAULT 0,
    meetings_organized INTEGER DEFAULT 0,
    meetings_attended INTEGER DEFAULT 0,
    meeting_hours DECIMAL(6,2) DEFAULT 0,
    average_meeting_duration DECIMAL(5,2) DEFAULT 0,
    meeting_effectiveness_score DECIMAL(5,2) DEFAULT 0,
    
    -- Commitment metrics
    total_commitments INTEGER DEFAULT 0,
    commitments_assigned INTEGER DEFAULT 0,
    commitments_completed INTEGER DEFAULT 0,
    commitments_overdue INTEGER DEFAULT 0,
    average_completion_time DECIMAL(5,2) DEFAULT 0,
    commitment_completion_rate DECIMAL(5,2) DEFAULT 0,
    
    -- KPI Impact
    kpi_impact_score DECIMAL(5,2) DEFAULT 0,
    business_value_generated DECIMAL(10,2) DEFAULT 0,
    
    -- Quality metrics
    participation_score DECIMAL(5,2) DEFAULT 0,
    feedback_score DECIMAL(5,2) DEFAULT 0,
    punctuality_score DECIMAL(5,2) DEFAULT 0,
    
    -- Tracking
    calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_updated TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Meeting KPI Integration table
CREATE TABLE IF NOT EXISTS meeting_kpi_links (
    id SERIAL PRIMARY KEY,
    
    -- References
    meeting_id INTEGER REFERENCES business_meetings(id) ON DELETE CASCADE,
    commitment_id INTEGER REFERENCES meeting_commitments(id) ON DELETE CASCADE,
    kpi_id INTEGER,
    
    -- KPI details
    kpi_name TEXT NOT NULL,
    kpi_category VARCHAR(50),
    
    -- Impact tracking
    baseline_value DECIMAL(15,6),
    target_value DECIMAL(15,6),
    current_value DECIMAL(15,6),
    impact_weight DECIMAL(5,2) DEFAULT 0,
    
    -- Progress tracking
    measurement_date DATE,
    progress_percentage DECIMAL(5,2) DEFAULT 0,
    is_positive_impact BOOLEAN DEFAULT TRUE,
    
    -- Tracking
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Meeting Templates table for recurring meeting patterns
CREATE TABLE IF NOT EXISTS meeting_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    
    -- Template details
    meeting_type VARCHAR(50) NOT NULL,
    default_duration_minutes INTEGER DEFAULT 60,
    default_location TEXT,
    
    -- Default agenda
    agenda_template JSONB DEFAULT '[]',
    standard_attendees JSONB DEFAULT '[]',
    
    -- KPI settings
    linked_kpis JSONB DEFAULT '[]',
    default_kpi_weight DECIMAL(5,2) DEFAULT 0,
    
    -- Template settings
    is_active BOOLEAN DEFAULT TRUE,
    is_public BOOLEAN DEFAULT FALSE,
    usage_count INTEGER DEFAULT 0,
    
    -- Tracking
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_business_meetings_organizer ON business_meetings(organizer_id);
CREATE INDEX IF NOT EXISTS idx_business_meetings_date ON business_meetings(meeting_date);
CREATE INDEX IF NOT EXISTS idx_business_meetings_status ON business_meetings(status);
CREATE INDEX IF NOT EXISTS idx_business_meetings_type ON business_meetings(meeting_type);

CREATE INDEX IF NOT EXISTS idx_meeting_commitments_meeting ON meeting_commitments(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_commitments_assigned_to ON meeting_commitments(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_meeting_commitments_due_date ON meeting_commitments(due_date);
CREATE INDEX IF NOT EXISTS idx_meeting_commitments_status ON meeting_commitments(status);

CREATE INDEX IF NOT EXISTS idx_meeting_attendance_meeting ON meeting_attendance(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendance_user ON meeting_attendance(user_id);

CREATE INDEX IF NOT EXISTS idx_meeting_reminders_recipient ON meeting_reminders(recipient_id);
CREATE INDEX IF NOT EXISTS idx_meeting_reminders_type ON meeting_reminders(reminder_type);

-- GIN indexes for JSONB columns to support array operations
CREATE INDEX IF NOT EXISTS idx_business_meetings_attendees ON business_meetings USING GIN (attendee_ids);
CREATE INDEX IF NOT EXISTS idx_business_meetings_kpis ON business_meetings USING GIN (linked_kpis);
CREATE INDEX IF NOT EXISTS idx_meeting_commitments_kpis ON meeting_commitments USING GIN (linked_kpis);

-- Comments for documentation
COMMENT ON TABLE business_meetings IS 'Core table for managing business meetings with comprehensive scheduling and tracking features';
COMMENT ON TABLE meeting_commitments IS 'Action items and commitments arising from meetings with progress tracking and escalation';
COMMENT ON TABLE meeting_attendance IS 'Tracks attendance and participation for meeting attendees';
COMMENT ON TABLE meeting_reminders IS 'Log of all reminders and escalations sent for meetings and commitments';
COMMENT ON TABLE meeting_analytics IS 'Aggregated metrics and analytics for meeting effectiveness and commitment completion';
COMMENT ON TABLE meeting_kpi_links IS 'Links meetings and commitments to business KPIs for impact tracking';
COMMENT ON TABLE meeting_templates IS 'Reusable templates for recurring meetings and standardized agendas';

-- Insert sample meeting types (optional)
INSERT INTO business_meetings (id, title, description, meeting_type, priority, meeting_date, start_time, end_time, 
                              organizer_id, created_by, status) 
VALUES 
(1, 'Sample Team Meeting', 'Weekly team sync meeting', 'Team Meeting', 'Medium', 
 CURRENT_DATE + INTERVAL '7 days', '09:00:00', '10:00:00', 
 3, 3, 'Scheduled')
ON CONFLICT (id) DO NOTHING;

-- Insert sample commitment
INSERT INTO meeting_commitments (id, meeting_id, title, description, assigned_to_id, assigned_by_id, 
                                due_date, created_by, status)
VALUES 
(1, 1, 'Prepare quarterly report', 'Compile Q3 financial data for presentation', 
 3, 3, CURRENT_DATE + INTERVAL '14 days', 3, 'Pending')
ON CONFLICT (id) DO NOTHING;

-- Reset sequences to ensure proper auto-increment
SELECT setval('business_meetings_id_seq', COALESCE((SELECT MAX(id) FROM business_meetings), 1));
SELECT setval('meeting_commitments_id_seq', COALESCE((SELECT MAX(id) FROM meeting_commitments), 1));
SELECT setval('meeting_attendance_id_seq', COALESCE((SELECT MAX(id) FROM meeting_attendance), 1));
SELECT setval('meeting_reminders_id_seq', COALESCE((SELECT MAX(id) FROM meeting_reminders), 1));
SELECT setval('meeting_analytics_id_seq', COALESCE((SELECT MAX(id) FROM meeting_analytics), 1));
SELECT setval('meeting_kpi_links_id_seq', COALESCE((SELECT MAX(id) FROM meeting_kpi_links), 1));
SELECT setval('meeting_templates_id_seq', COALESCE((SELECT MAX(id) FROM meeting_templates), 1));

COMMIT;