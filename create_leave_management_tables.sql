-- Create Leave Management Tables
-- This script creates tables for comprehensive leave management with payroll integration

-- Leave types configuration
CREATE TABLE IF NOT EXISTS leave_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  code VARCHAR(20) NOT NULL UNIQUE,
  description TEXT,
  max_days_per_year DECIMAL(5, 2) DEFAULT 0,
  carryover_allowed BOOLEAN DEFAULT false,
  max_carryover_days DECIMAL(5, 2) DEFAULT 0,
  is_paid BOOLEAN DEFAULT true,
  requires_approval BOOLEAN DEFAULT true,
  notice_days_required INTEGER DEFAULT 1,
  can_be_half_day BOOLEAN DEFAULT true,
  color_code VARCHAR(7) DEFAULT '#3B82F6', -- Blue color for UI
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default leave types
INSERT INTO leave_types (name, code, description, max_days_per_year, carryover_allowed, max_carryover_days, is_paid, requires_approval, notice_days_required, can_be_half_day, color_code) VALUES
('Annual Leave', 'AL', 'Annual vacation leave', 21, true, 5, true, true, 3, true, '#10B981'),
('Sick Leave', 'SL', 'Medical sick leave', 12, false, 0, true, false, 0, true, '#EF4444'),
('Casual Leave', 'CL', 'Casual personal leave', 8, false, 0, true, true, 1, true, '#F59E0B'),
('Maternity Leave', 'ML', 'Maternity leave for mothers', 180, false, 0, true, true, 30, false, '#EC4899'),
('Paternity Leave', 'PL', 'Paternity leave for fathers', 15, false, 0, true, true, 7, false, '#8B5CF6'),
('Bereavement Leave', 'BL', 'Leave for family bereavement', 5, false, 0, true, false, 0, false, '#6B7280'),
('Emergency Leave', 'EL', 'Emergency personal leave', 3, false, 0, true, true, 0, true, '#F97316'),
('Unpaid Leave', 'UL', 'Unpaid personal leave', 365, false, 0, false, true, 7, true, '#64748B')
ON CONFLICT (code) DO NOTHING;

-- Employee leave balances
CREATE TABLE IF NOT EXISTS leave_balances (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type_id INTEGER NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  allocated_days DECIMAL(5, 2) NOT NULL DEFAULT 0,
  used_days DECIMAL(5, 2) NOT NULL DEFAULT 0,
  pending_days DECIMAL(5, 2) NOT NULL DEFAULT 0, -- Days in pending leave requests
  carryover_days DECIMAL(5, 2) NOT NULL DEFAULT 0,
  remaining_days DECIMAL(5, 2) GENERATED ALWAYS AS (allocated_days + carryover_days - used_days - pending_days) STORED,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES users(id),
  
  UNIQUE(user_id, leave_type_id, year)
);

-- Leave requests
CREATE TABLE IF NOT EXISTS leave_requests (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type_id INTEGER NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  
  -- Leave period
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days DECIMAL(5, 2) NOT NULL,
  is_half_day BOOLEAN DEFAULT false,
  half_day_period VARCHAR(10), -- 'morning' or 'afternoon'
  
  -- Request details
  reason TEXT NOT NULL,
  emergency_contact TEXT,
  work_handover_notes TEXT,
  attachment_url TEXT, -- For medical certificates, etc.
  
  -- Status and approval
  status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected, cancelled
  applied_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- First level approval (Direct Manager)
  manager_id INTEGER REFERENCES users(id),
  manager_approval_status VARCHAR(20), -- pending, approved, rejected
  manager_approval_date TIMESTAMP,
  manager_comments TEXT,
  
  -- Second level approval (HR)
  hr_approval_id INTEGER REFERENCES users(id),
  hr_approval_status VARCHAR(20), -- pending, approved, rejected
  hr_approval_date TIMESTAMP,
  hr_comments TEXT,
  
  -- Final status
  approved_by INTEGER REFERENCES users(id),
  approved_date TIMESTAMP,
  rejection_reason TEXT,
  
  -- Tracking
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Leave request approval workflow
CREATE TABLE IF NOT EXISTS leave_approvals (
  id SERIAL PRIMARY KEY,
  leave_request_id INTEGER NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  approver_id INTEGER NOT NULL REFERENCES users(id),
  approval_level INTEGER NOT NULL, -- 1: Manager, 2: HR
  status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
  comments TEXT,
  approved_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Leave calendar and holidays
CREATE TABLE IF NOT EXISTS company_holidays (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  date DATE NOT NULL,
  is_optional BOOLEAN DEFAULT false,
  description TEXT,
  year INTEGER GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id)
);

-- Insert common Indian holidays for 2025
INSERT INTO company_holidays (name, date, is_optional, description) VALUES
('New Year''s Day', '2025-01-01', false, 'New Year celebration'),
('Republic Day', '2025-01-26', false, 'Indian Republic Day'),
('Holi', '2025-03-14', false, 'Festival of Colors'),
('Good Friday', '2025-04-18', false, 'Christian holiday'),
('Independence Day', '2025-08-15', false, 'Indian Independence Day'),
('Dussehra', '2025-10-02', false, 'Hindu festival'),
('Diwali', '2025-10-20', false, 'Festival of Lights'),
('Christmas Day', '2025-12-25', false, 'Christian holiday'),
('Eid al-Fitr', '2025-03-31', true, 'Islamic festival'),
('Eid al-Adha', '2025-06-07', true, 'Islamic festival'),
('Janmashtami', '2025-08-26', true, 'Hindu festival')
ON CONFLICT DO NOTHING;

-- Leave policy settings
CREATE TABLE IF NOT EXISTS leave_policies (
  id SERIAL PRIMARY KEY,
  policy_name VARCHAR(100) NOT NULL UNIQUE,
  policy_value TEXT NOT NULL,
  data_type VARCHAR(20) DEFAULT 'string', -- string, number, boolean, json
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES users(id)
);

-- Insert default leave policies
INSERT INTO leave_policies (policy_name, policy_value, data_type, description) VALUES
('max_consecutive_days', '15', 'number', 'Maximum consecutive leave days without special approval'),
('advance_booking_limit', '90', 'number', 'Days in advance leave can be booked'),
('weekend_inclusion', 'false', 'boolean', 'Whether to include weekends in leave calculation'),
('holiday_inclusion', 'false', 'boolean', 'Whether to include holidays in leave calculation'),
('half_day_minimum_hours', '4', 'number', 'Minimum working hours to qualify for half day'),
('probation_leave_eligibility', '6', 'number', 'Months of service required before leave eligibility'),
('leave_encashment_enabled', 'true', 'boolean', 'Whether leave encashment is allowed'),
('max_encashment_days', '10', 'number', 'Maximum days that can be encashed per year')
ON CONFLICT (policy_name) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_leave_balances_user_year ON leave_balances(user_id, year);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_status ON leave_requests(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_approvals_request_approver ON leave_approvals(leave_request_id, approver_id);
CREATE INDEX IF NOT EXISTS idx_company_holidays_date ON company_holidays(date);
CREATE INDEX IF NOT EXISTS idx_company_holidays_year ON company_holidays(year);

-- Add constraints
ALTER TABLE leave_requests ADD CONSTRAINT chk_leave_dates CHECK (end_date >= start_date);
ALTER TABLE leave_requests ADD CONSTRAINT chk_total_days_positive CHECK (total_days > 0);
ALTER TABLE leave_balances ADD CONSTRAINT chk_days_non_negative CHECK (allocated_days >= 0 AND used_days >= 0 AND pending_days >= 0);