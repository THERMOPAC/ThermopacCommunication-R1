-- Payroll Management Tables
-- This script creates tables for comprehensive payroll management with KPI integration

-- Employee salary information
CREATE TABLE IF NOT EXISTS employee_salaries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base_salary DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  pay_frequency VARCHAR(20) DEFAULT 'monthly', -- monthly, bi-weekly, weekly
  effective_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  salary_grade VARCHAR(10),
  department VARCHAR(100),
  position VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id)
);

-- Payroll periods
CREATE TABLE IF NOT EXISTS payroll_periods (
  id SERIAL PRIMARY KEY,
  period_name VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  pay_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'draft', -- draft, processing, completed, closed
  total_employees INTEGER DEFAULT 0,
  total_gross_pay DECIMAL(15, 2) DEFAULT 0,
  total_deductions DECIMAL(15, 2) DEFAULT 0,
  total_net_pay DECIMAL(15, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP,
  processed_by INTEGER REFERENCES users(id)
);

-- Individual payroll records
CREATE TABLE IF NOT EXISTS payroll_records (
  id SERIAL PRIMARY KEY,
  period_id INTEGER NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base_salary DECIMAL(12, 2) NOT NULL,
  
  -- KPI-based bonuses from DWAR
  productivity_bonus DECIMAL(10, 2) DEFAULT 0,
  attendance_bonus DECIMAL(10, 2) DEFAULT 0,
  task_completion_bonus DECIMAL(10, 2) DEFAULT 0,
  satisfaction_bonus DECIMAL(10, 2) DEFAULT 0,
  
  -- Other allowances
  overtime_hours DECIMAL(5, 2) DEFAULT 0,
  overtime_pay DECIMAL(10, 2) DEFAULT 0,
  other_allowances DECIMAL(10, 2) DEFAULT 0,
  
  -- Total gross
  gross_pay DECIMAL(12, 2) NOT NULL,
  
  -- Deductions
  income_tax DECIMAL(10, 2) DEFAULT 0,
  professional_tax DECIMAL(10, 2) DEFAULT 0,
  provident_fund DECIMAL(10, 2) DEFAULT 0,
  esi_deduction DECIMAL(10, 2) DEFAULT 0,
  other_deductions DECIMAL(10, 2) DEFAULT 0,
  total_deductions DECIMAL(10, 2) DEFAULT 0,
  
  -- Net pay
  net_pay DECIMAL(12, 2) NOT NULL,
  
  -- KPI metrics for reference
  dwar_productivity_score DECIMAL(5, 2),
  attendance_percentage DECIMAL(5, 2),
  tasks_completed INTEGER DEFAULT 0,
  average_satisfaction_rating DECIMAL(3, 2),
  
  status VARCHAR(20) DEFAULT 'draft', -- draft, approved, paid
  payment_reference VARCHAR(100),
  payment_date DATE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(period_id, user_id)
);

-- Payroll settings and tax configurations
CREATE TABLE IF NOT EXISTS payroll_settings (
  id SERIAL PRIMARY KEY,
  setting_name VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  data_type VARCHAR(20) DEFAULT 'string', -- string, number, boolean, json
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES users(id)
);

-- Bonus calculation rules
CREATE TABLE IF NOT EXISTS bonus_rules (
  id SERIAL PRIMARY KEY,
  rule_name VARCHAR(100) NOT NULL,
  rule_type VARCHAR(30) NOT NULL, -- productivity, attendance, task_completion, satisfaction
  min_threshold DECIMAL(5, 2) NOT NULL,
  max_threshold DECIMAL(5, 2),
  bonus_percentage DECIMAL(5, 2),
  fixed_amount DECIMAL(10, 2),
  is_percentage BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payroll approval workflow
CREATE TABLE IF NOT EXISTS payroll_approvals (
  id SERIAL PRIMARY KEY,
  period_id INTEGER NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  approved_by INTEGER NOT NULL REFERENCES users(id),
  approval_level INTEGER DEFAULT 1, -- 1: Manager, 2: HR, 3: Finance
  approval_status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
  approval_comments TEXT,
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default payroll settings
INSERT INTO payroll_settings (setting_name, setting_value, data_type, description) VALUES
('currency', 'INR', 'string', 'Default currency for payroll'),
('income_tax_rate', '10', 'number', 'Default income tax rate percentage'),
('professional_tax_rate', '2.5', 'number', 'Professional tax rate percentage'),
('provident_fund_rate', '12', 'number', 'Provident fund contribution rate'),
('esi_rate', '1.75', 'number', 'ESI contribution rate'),
('productivity_bonus_enabled', 'true', 'boolean', 'Enable productivity-based bonuses'),
('attendance_bonus_enabled', 'true', 'boolean', 'Enable attendance-based bonuses'),
('max_productivity_bonus_percentage', '15', 'number', 'Maximum productivity bonus as percentage of base salary'),
('max_attendance_bonus_percentage', '5', 'number', 'Maximum attendance bonus as percentage of base salary')
ON CONFLICT (setting_name) DO NOTHING;

-- Insert default bonus rules
INSERT INTO bonus_rules (rule_name, rule_type, min_threshold, max_threshold, bonus_percentage, is_percentage, is_active) VALUES
('High Productivity Bonus', 'productivity', 80, 100, 10, true, true),
('Medium Productivity Bonus', 'productivity', 60, 79.99, 5, true, true),
('Perfect Attendance Bonus', 'attendance', 100, 100, 3, true, true),
('Good Attendance Bonus', 'attendance', 90, 99.99, 1.5, true, true),
('Task Completion Excellence', 'task_completion', 20, null, 500, false, true),
('High Satisfaction Bonus', 'satisfaction', 4, 5, 2, true, true)
ON CONFLICT DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_employee_salaries_user_id ON employee_salaries(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_salaries_active ON employee_salaries(is_active);
CREATE INDEX IF NOT EXISTS idx_payroll_records_period_user ON payroll_records(period_id, user_id);
CREATE INDEX IF NOT EXISTS idx_payroll_records_status ON payroll_records(status);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_status ON payroll_periods(status);