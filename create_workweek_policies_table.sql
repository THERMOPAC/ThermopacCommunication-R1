-- Create workweek policies table for managing working days by location/department
CREATE TABLE IF NOT EXISTS workweek_policies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    policy_type VARCHAR(50) NOT NULL CHECK (policy_type IN ('location', 'department', 'global')),
    location_id INTEGER REFERENCES work_locations(id) ON DELETE CASCADE,
    department VARCHAR(255),
    
    -- Working days configuration (JSON array of day numbers: 0=Sunday, 1=Monday, etc.)
    working_days JSONB NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb, -- Default Monday-Friday
    
    -- Working hours
    start_time TIME NOT NULL DEFAULT '09:00:00',
    end_time TIME NOT NULL DEFAULT '18:00:00',
    break_duration_minutes INTEGER DEFAULT 60,
    
    -- Weekly working hours
    weekly_hours DECIMAL(5,2) DEFAULT 40.00,
    
    -- Overtime policies
    overtime_threshold_daily DECIMAL(5,2) DEFAULT 8.00,
    overtime_threshold_weekly DECIMAL(5,2) DEFAULT 40.00,
    overtime_rate_multiplier DECIMAL(4,2) DEFAULT 1.50,
    
    -- Half-day policies
    half_day_hours DECIMAL(4,2) DEFAULT 4.00,
    
    -- Holiday and leave policies
    includes_saturdays BOOLEAN DEFAULT false,
    includes_sundays BOOLEAN DEFAULT false,
    follows_national_holidays BOOLEAN DEFAULT true,
    
    -- Status and metadata
    is_active BOOLEAN DEFAULT true,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_until DATE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT valid_time_range CHECK (start_time < end_time),
    CONSTRAINT valid_location_or_department CHECK (
        (policy_type = 'location' AND location_id IS NOT NULL AND department IS NULL) OR
        (policy_type = 'department' AND department IS NOT NULL AND location_id IS NULL) OR
        (policy_type = 'global' AND location_id IS NULL AND department IS NULL)
    ),
    CONSTRAINT unique_active_policy UNIQUE (policy_type, location_id, department, effective_from) DEFERRABLE
);

-- Create indexes for better performance
CREATE INDEX idx_workweek_policies_location ON workweek_policies(location_id) WHERE location_id IS NOT NULL;
CREATE INDEX idx_workweek_policies_department ON workweek_policies(department) WHERE department IS NOT NULL;
CREATE INDEX idx_workweek_policies_type_active ON workweek_policies(policy_type, is_active);
CREATE INDEX idx_workweek_policies_effective_dates ON workweek_policies(effective_from, effective_until);

-- Insert default policies
INSERT INTO workweek_policies (
    name, 
    description, 
    policy_type, 
    working_days, 
    start_time, 
    end_time, 
    weekly_hours,
    created_by
) VALUES 
(
    'Standard Office Policy', 
    'Default 5-day office workweek (Monday-Friday)', 
    'global', 
    '[1,2,3,4,5]'::jsonb, 
    '09:00:00', 
    '18:00:00', 
    40.00,
    1
),
(
    'Factory Shift Policy', 
    '6-day factory workweek including Saturday', 
    'global', 
    '[1,2,3,4,5,6]'::jsonb, 
    '08:00:00', 
    '17:00:00', 
    48.00,
    1
);

-- Create employee workweek assignments table
CREATE TABLE IF NOT EXISTS employee_workweek_assignments (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workweek_policy_id INTEGER NOT NULL REFERENCES workweek_policies(id) ON DELETE RESTRICT,
    
    -- Override fields (if different from policy defaults)
    custom_working_days JSONB,
    custom_start_time TIME,
    custom_end_time TIME,
    custom_weekly_hours DECIMAL(5,2),
    
    -- Assignment metadata
    assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_until DATE,
    assigned_by INTEGER REFERENCES users(id),
    notes TEXT,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one active assignment per employee at a time
    CONSTRAINT unique_active_employee_assignment UNIQUE (employee_id, effective_from) DEFERRABLE
);

CREATE INDEX idx_employee_workweek_assignments_employee ON employee_workweek_assignments(employee_id);
CREATE INDEX idx_employee_workweek_assignments_policy ON employee_workweek_assignments(workweek_policy_id);
CREATE INDEX idx_employee_workweek_assignments_active ON employee_workweek_assignments(employee_id, is_active);

-- Create workweek calendar table for specific date overrides
CREATE TABLE IF NOT EXISTS workweek_calendar_overrides (
    id SERIAL PRIMARY KEY,
    workweek_policy_id INTEGER NOT NULL REFERENCES workweek_policies(id) ON DELETE CASCADE,
    override_date DATE NOT NULL,
    override_type VARCHAR(50) NOT NULL CHECK (override_type IN ('holiday', 'working_day', 'half_day', 'special_hours')),
    
    -- Override details
    is_working_day BOOLEAN NOT NULL,
    custom_start_time TIME,
    custom_end_time TIME,
    reason VARCHAR(255),
    description TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    
    CONSTRAINT unique_policy_date_override UNIQUE (workweek_policy_id, override_date)
);

CREATE INDEX idx_workweek_calendar_overrides_policy_date ON workweek_calendar_overrides(workweek_policy_id, override_date);

-- Add comments for documentation
COMMENT ON TABLE workweek_policies IS 'Defines working day patterns and policies for different locations, departments, or globally';
COMMENT ON TABLE employee_workweek_assignments IS 'Assigns specific workweek policies to employees with optional customizations';
COMMENT ON TABLE workweek_calendar_overrides IS 'Specific date overrides for workweek policies (holidays, special working days, etc.)';