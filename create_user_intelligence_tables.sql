-- User Intelligence Dashboard Database Schema
-- Create tables for tracking user activity, productivity, and compliance

-- User activity tracking table
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  module VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(50),
  ip_address INET,
  user_agent TEXT,
  session_duration INTEGER DEFAULT 0, -- in minutes
  created_at TIMESTAMP DEFAULT NOW()
);

-- Module usage statistics (daily aggregated data)
CREATE TABLE IF NOT EXISTS user_module_stats (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  module VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  time_spent INTEGER DEFAULT 0, -- in minutes
  actions_count INTEGER DEFAULT 0,
  documents_created INTEGER DEFAULT 0,
  documents_modified INTEGER DEFAULT 0,
  last_activity TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, module, date)
);

-- Compliance tracking for various compliance requirements
CREATE TABLE IF NOT EXISTS user_compliance_metrics (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  compliance_type VARCHAR(50) NOT NULL, -- password_policy, training, certification, etc.
  status VARCHAR(20) NOT NULL, -- compliant, non_compliant, pending, expired
  due_date DATE,
  completed_date DATE,
  score DECIMAL(5,2), -- compliance score 0-100
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- User productivity metrics
CREATE TABLE IF NOT EXISTS user_productivity_metrics (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  tasks_completed INTEGER DEFAULT 0,
  inspections_processed INTEGER DEFAULT 0,
  documents_generated INTEGER DEFAULT 0,
  quality_records_created INTEGER DEFAULT 0,
  financial_transactions INTEGER DEFAULT 0,
  attendance_score DECIMAL(5,2) DEFAULT 0, -- percentage
  efficiency_score DECIMAL(5,2) DEFAULT 0, -- calculated score
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_module ON user_activity_logs(module);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON user_activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_user_module_stats_user_date ON user_module_stats(user_id, date);
CREATE INDEX IF NOT EXISTS idx_user_compliance_metrics_user_id ON user_compliance_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_user_productivity_metrics_user_date ON user_productivity_metrics(user_id, date);