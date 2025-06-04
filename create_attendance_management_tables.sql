-- Create attendance management tables
-- Attendance Records table
CREATE TABLE IF NOT EXISTS attendance_records (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_location_id INTEGER REFERENCES work_locations(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  
  -- Check-in details
  check_in_time TIMESTAMP,
  check_in_latitude DOUBLE PRECISION,
  check_in_longitude DOUBLE PRECISION,
  check_in_address TEXT,
  check_in_ip_address VARCHAR(45),
  check_in_device_info JSONB,
  
  -- Check-out details
  check_out_time TIMESTAMP,
  check_out_latitude DOUBLE PRECISION,
  check_out_longitude DOUBLE PRECISION,
  check_out_address TEXT,
  check_out_ip_address VARCHAR(45),
  check_out_device_info JSONB,
  
  -- Calculated fields
  working_hours DECIMAL(5,2),
  overtime_hours DECIMAL(5,2) DEFAULT 0,
  
  -- Status and validation
  status VARCHAR(20) NOT NULL DEFAULT 'present',
  is_location_verified BOOLEAN DEFAULT FALSE,
  is_ip_verified BOOLEAN DEFAULT FALSE,
  
  -- Admin adjustments
  admin_adjustment JSONB,
  adjusted_by INTEGER REFERENCES users(id),
  adjustment_reason TEXT,
  adjustment_date TIMESTAMP,
  
  -- Notes and remarks
  employee_notes TEXT,
  admin_notes TEXT,
  
  -- Tracking
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Ensure one record per user per date
  UNIQUE(user_id, date)
);

-- Attendance Settings table
CREATE TABLE IF NOT EXISTS attendance_settings (
  id SERIAL PRIMARY KEY,
  work_location_id INTEGER REFERENCES work_locations(id) ON DELETE CASCADE,
  
  -- Working hours
  standard_working_hours DECIMAL(3,1) NOT NULL DEFAULT 8.0,
  overtime_threshold DECIMAL(3,1) NOT NULL DEFAULT 8.0,
  
  -- Time slots
  earliest_check_in VARCHAR(8) NOT NULL DEFAULT '06:00:00',
  latest_check_out VARCHAR(8) NOT NULL DEFAULT '22:00:00',
  late_threshold_minutes INTEGER NOT NULL DEFAULT 15,
  
  -- Break settings
  lunch_break_duration_minutes INTEGER DEFAULT 60,
  automatic_break_deduction BOOLEAN DEFAULT TRUE,
  
  -- Location verification
  require_location_verification BOOLEAN DEFAULT TRUE,
  require_ip_verification BOOLEAN DEFAULT FALSE,
  allow_offline_check_in BOOLEAN DEFAULT FALSE,
  
  -- Tracking
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- One setting per location
  UNIQUE(work_location_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_attendance_records_user_date ON attendance_records(user_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_records_work_location ON attendance_records(work_location_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_status ON attendance_records(status);
CREATE INDEX IF NOT EXISTS idx_attendance_records_date_range ON attendance_records(date);

-- Insert default attendance settings for existing work locations
INSERT INTO attendance_settings (work_location_id, standard_working_hours, overtime_threshold)
SELECT id, 8.0, 8.0 FROM work_locations
ON CONFLICT (work_location_id) DO NOTHING;