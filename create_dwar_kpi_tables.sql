-- Create DWAR and KPI management tables

-- Daily Work Activity Reports table
CREATE TABLE IF NOT EXISTS daily_work_reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  
  -- Work summary
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  tasks_in_progress INTEGER NOT NULL DEFAULT 0,
  hours_worked DECIMAL(4,2) NOT NULL DEFAULT 0,
  productivity_score DECIMAL(5,2) DEFAULT 0,
  
  -- Detailed activities (JSON array)
  activities JSONB NOT NULL DEFAULT '[]',
  
  -- Issues and challenges
  challenges TEXT,
  issues_encountered TEXT,
  support_required TEXT,
  
  -- Next day planning
  tomorrow_plans TEXT,
  priority_tasks JSONB DEFAULT '[]',
  
  -- KPI tracking (auto-calculated)
  quality_score DECIMAL(5,2) DEFAULT 0,
  efficiency_rating DECIMAL(5,2) DEFAULT 0,
  collaboration_score DECIMAL(5,2) DEFAULT 0,
  
  -- Status and approvals
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMP,
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
  
  -- Manager feedback
  manager_feedback TEXT,
  manager_rating INTEGER CHECK (manager_rating >= 1 AND manager_rating <= 5),
  
  -- Tracking
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Monthly KPI Summary table
CREATE TABLE IF NOT EXISTS monthly_kpi_summary (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  
  -- Attendance KPIs
  total_working_days INTEGER NOT NULL DEFAULT 0,
  days_present INTEGER NOT NULL DEFAULT 0,
  days_absent INTEGER NOT NULL DEFAULT 0,
  days_late INTEGER NOT NULL DEFAULT 0,
  total_hours_worked DECIMAL(6,2) DEFAULT 0,
  overtime_hours DECIMAL(6,2) DEFAULT 0,
  attendance_percentage DECIMAL(5,2) DEFAULT 0,
  
  -- Performance KPIs from DWAR
  total_tasks_completed INTEGER DEFAULT 0,
  average_productivity_score DECIMAL(5,2) DEFAULT 0,
  average_quality_score DECIMAL(5,2) DEFAULT 0,
  average_efficiency_rating DECIMAL(5,2) DEFAULT 0,
  average_collaboration_score DECIMAL(5,2) DEFAULT 0,
  dwar_submission_rate DECIMAL(5,2) DEFAULT 0,
  
  -- Manager evaluation KPIs
  average_manager_rating DECIMAL(3,2) DEFAULT 0,
  total_approved_reports INTEGER DEFAULT 0,
  total_rejected_reports INTEGER DEFAULT 0,
  
  -- Overall performance score
  overall_performance_score DECIMAL(5,2) DEFAULT 0,
  performance_grade VARCHAR(2) DEFAULT 'C',
  
  -- Tracking
  calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_updated TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_daily_work_reports_user_date ON daily_work_reports(user_id, report_date);
CREATE INDEX IF NOT EXISTS idx_daily_work_reports_status ON daily_work_reports(status);
CREATE INDEX IF NOT EXISTS idx_daily_work_reports_date_range ON daily_work_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_monthly_kpi_user_month ON monthly_kpi_summary(user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_monthly_kpi_performance_grade ON monthly_kpi_summary(performance_grade);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_daily_work_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_daily_work_reports_updated_at
  BEFORE UPDATE ON daily_work_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_daily_work_reports_updated_at();

CREATE OR REPLACE FUNCTION update_monthly_kpi_summary_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_monthly_kpi_summary_updated_at
  BEFORE UPDATE ON monthly_kpi_summary
  FOR EACH ROW
  EXECUTE FUNCTION update_monthly_kpi_summary_updated_at();