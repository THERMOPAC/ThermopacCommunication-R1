-- Create Design Management Module Tables
-- THERMOPAC Design Module Database Schema
-- Version: 1.0
-- Date: July 18, 2025

-- Design Projects table
CREATE TABLE IF NOT EXISTS design_projects (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_code TEXT NOT NULL,
  design_project_name VARCHAR(255) NOT NULL,
  description TEXT,
  design_phase VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'Draft',
  
  -- Design Manager and Team
  design_manager_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  team_members JSONB DEFAULT '[]',
  
  -- Timeline
  start_date DATE,
  target_end_date DATE,
  actual_end_date DATE,
  
  -- Client Information
  client_approval_required BOOLEAN DEFAULT FALSE,
  client_contact_info TEXT,
  
  -- Progress Tracking
  overall_progress INTEGER DEFAULT 0,
  
  -- Audit Information
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Design Drawings table
CREATE TABLE IF NOT EXISTS design_drawings (
  id SERIAL PRIMARY KEY,
  design_project_id INTEGER NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  
  -- Drawing Identification
  drawing_number VARCHAR(100) NOT NULL UNIQUE,
  drawing_title VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  discipline_code VARCHAR(10),
  
  -- Drawing Details
  description TEXT,
  scale VARCHAR(50),
  paper_size VARCHAR(10) DEFAULT 'A1',
  sheet_count INTEGER DEFAULT 1,
  
  -- Status and Version
  status VARCHAR(50) NOT NULL DEFAULT 'Draft',
  current_revision VARCHAR(10) DEFAULT 'A',
  latest_version_id INTEGER,
  
  -- Assignment
  assigned_to_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  checked_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  
  -- Timeline
  due_date DATE,
  approved_date DATE,
  issued_date DATE,
  
  -- Client Approval
  client_approval_required BOOLEAN DEFAULT FALSE,
  client_approved_date DATE,
  client_approved_by TEXT,
  
  -- References
  related_drawings JSONB DEFAULT '[]',
  superseded_by INTEGER REFERENCES design_drawings(id),
  supersedes INTEGER REFERENCES design_drawings(id),
  
  -- Audit Information
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Drawing Versions table (for version control)
CREATE TABLE IF NOT EXISTS drawing_versions (
  id SERIAL PRIMARY KEY,
  drawing_id INTEGER NOT NULL REFERENCES design_drawings(id) ON DELETE CASCADE,
  
  -- Version Information
  version INTEGER NOT NULL,
  revision VARCHAR(10) NOT NULL,
  change_description TEXT,
  
  -- File Information
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type VARCHAR(50),
  mime_type VARCHAR(100),
  
  -- Drawing Properties
  file_format VARCHAR(10) DEFAULT 'DWG',
  is_working_copy BOOLEAN DEFAULT FALSE,
  is_latest_version BOOLEAN DEFAULT TRUE,
  
  -- Check-in/Check-out system
  is_checked_out BOOLEAN DEFAULT FALSE,
  checked_out_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  checked_out_at TIMESTAMP,
  
  -- Approval Status
  review_status VARCHAR(50) DEFAULT 'Pending',
  
  -- Audit Information
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Design Reviews table
CREATE TABLE IF NOT EXISTS design_reviews (
  id SERIAL PRIMARY KEY,
  drawing_id INTEGER NOT NULL REFERENCES design_drawings(id) ON DELETE CASCADE,
  version_id INTEGER NOT NULL REFERENCES drawing_versions(id) ON DELETE CASCADE,
  
  -- Review Information
  review_type VARCHAR(50) NOT NULL,
  review_stage VARCHAR(50),
  review_title VARCHAR(255),
  
  -- Review Assignment
  reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewer_role VARCHAR(50),
  
  -- Review Status
  status VARCHAR(50) NOT NULL DEFAULT 'Pending',
  priority VARCHAR(20) DEFAULT 'Medium',
  
  -- Review Details
  review_comments TEXT,
  markup_file_url TEXT,
  
  -- Timeline
  requested_date TIMESTAMP NOT NULL DEFAULT NOW(),
  due_date DATE,
  started_date TIMESTAMP,
  completed_date TIMESTAMP,
  
  -- Review Decision
  recommendation VARCHAR(50),
  
  -- Audit Information
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Review Comments table (detailed feedback)
CREATE TABLE IF NOT EXISTS review_comments (
  id SERIAL PRIMARY KEY,
  review_id INTEGER NOT NULL REFERENCES design_reviews(id) ON DELETE CASCADE,
  
  -- Comment Details
  comment_number INTEGER NOT NULL,
  comment_type VARCHAR(50) DEFAULT 'General',
  discipline VARCHAR(50),
  
  -- Comment Content
  comment TEXT NOT NULL,
  location VARCHAR(255),
  category VARCHAR(100),
  
  -- Response and Resolution
  designer_response TEXT,
  resolution_action TEXT,
  resolution_status VARCHAR(50) DEFAULT 'Open',
  
  -- Timeline
  raised_date TIMESTAMP NOT NULL DEFAULT NOW(),
  target_resolution_date DATE,
  resolved_date TIMESTAMP,
  verified_date TIMESTAMP,
  
  -- Assignment
  assigned_to_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  verified_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  
  -- Audit Information
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Design Standards table
CREATE TABLE IF NOT EXISTS design_standards (
  id SERIAL PRIMARY KEY,
  
  -- Standard Information
  standard_number VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  discipline VARCHAR(50),
  
  -- Content
  description TEXT,
  content TEXT,
  
  -- File Attachments
  file_url TEXT,
  file_path TEXT,
  file_name VARCHAR(255),
  file_size INTEGER,
  file_type VARCHAR(50),
  
  -- Version Control
  version VARCHAR(50) NOT NULL,
  revision VARCHAR(10) DEFAULT 'A',
  effective_date DATE,
  superseded_date DATE,
  
  -- Usage and Access
  is_active BOOLEAN DEFAULT TRUE,
  access_level VARCHAR(50) DEFAULT 'Internal',
  usage_guidelines TEXT,
  
  -- References
  related_standards JSONB DEFAULT '[]',
  
  -- Audit Information
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Drawing Transmittals table (for client/external submissions)
CREATE TABLE IF NOT EXISTS drawing_transmittals (
  id SERIAL PRIMARY KEY,
  design_project_id INTEGER NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  
  -- Transmittal Information
  transmittal_number VARCHAR(100) NOT NULL UNIQUE,
  transmittal_title VARCHAR(255) NOT NULL,
  purpose VARCHAR(100),
  
  -- Recipient Information
  recipient_organization VARCHAR(255) NOT NULL,
  recipient_contact VARCHAR(255),
  recipient_email VARCHAR(255),
  
  -- Drawings Included
  drawing_ids JSONB NOT NULL,
  total_drawings INTEGER NOT NULL,
  
  -- Status and Timeline
  status VARCHAR(50) DEFAULT 'Draft',
  sent_date TIMESTAMP,
  acknowledged_date TIMESTAMP,
  response_date TIMESTAMP,
  due_date DATE,
  
  -- Content
  cover_letter TEXT,
  special_instructions TEXT,
  
  -- Response Tracking
  client_comments TEXT,
  response_document_url TEXT,
  
  -- Audit Information
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Design Assignments table (for task management)
CREATE TABLE IF NOT EXISTS design_assignments (
  id SERIAL PRIMARY KEY,
  design_project_id INTEGER NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  drawing_id INTEGER REFERENCES design_drawings(id) ON DELETE CASCADE,
  
  -- Assignment Details
  task_title VARCHAR(255) NOT NULL,
  task_description TEXT,
  task_type VARCHAR(50) NOT NULL,
  
  -- Assignment
  assigned_to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_by_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  
  -- Status and Priority
  status VARCHAR(50) DEFAULT 'Assigned',
  priority VARCHAR(20) DEFAULT 'Medium',
  
  -- Timeline
  assigned_date TIMESTAMP NOT NULL DEFAULT NOW(),
  due_date DATE,
  started_date TIMESTAMP,
  completed_date TIMESTAMP,
  
  -- Work Tracking
  estimated_hours DECIMAL(5,2),
  actual_hours DECIMAL(5,2),
  progress_percentage INTEGER DEFAULT 0,
  
  -- Comments and Notes
  assignment_notes TEXT,
  completion_notes TEXT,
  
  -- Audit Information
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add self-reference foreign key for latest_version_id
ALTER TABLE design_drawings 
ADD CONSTRAINT fk_design_drawings_latest_version 
FOREIGN KEY (latest_version_id) REFERENCES drawing_versions(id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_design_projects_project_id ON design_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_design_projects_design_manager ON design_projects(design_manager_id);
CREATE INDEX IF NOT EXISTS idx_design_projects_status ON design_projects(status);
CREATE INDEX IF NOT EXISTS idx_design_projects_phase ON design_projects(design_phase);

CREATE INDEX IF NOT EXISTS idx_design_drawings_project_id ON design_drawings(design_project_id);
CREATE INDEX IF NOT EXISTS idx_design_drawings_number ON design_drawings(drawing_number);
CREATE INDEX IF NOT EXISTS idx_design_drawings_status ON design_drawings(status);
CREATE INDEX IF NOT EXISTS idx_design_drawings_category ON design_drawings(category);
CREATE INDEX IF NOT EXISTS idx_design_drawings_assigned_to ON design_drawings(assigned_to_id);

CREATE INDEX IF NOT EXISTS idx_drawing_versions_drawing_id ON drawing_versions(drawing_id);
CREATE INDEX IF NOT EXISTS idx_drawing_versions_latest ON drawing_versions(is_latest_version);
CREATE INDEX IF NOT EXISTS idx_drawing_versions_checkout ON drawing_versions(is_checked_out);

CREATE INDEX IF NOT EXISTS idx_design_reviews_drawing_id ON design_reviews(drawing_id);
CREATE INDEX IF NOT EXISTS idx_design_reviews_reviewer_id ON design_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_design_reviews_status ON design_reviews(status);

CREATE INDEX IF NOT EXISTS idx_review_comments_review_id ON review_comments(review_id);
CREATE INDEX IF NOT EXISTS idx_review_comments_status ON review_comments(resolution_status);

CREATE INDEX IF NOT EXISTS idx_design_standards_category ON design_standards(category);
CREATE INDEX IF NOT EXISTS idx_design_standards_discipline ON design_standards(discipline);
CREATE INDEX IF NOT EXISTS idx_design_standards_active ON design_standards(is_active);

CREATE INDEX IF NOT EXISTS idx_drawing_transmittals_project ON drawing_transmittals(design_project_id);
CREATE INDEX IF NOT EXISTS idx_drawing_transmittals_status ON drawing_transmittals(status);

CREATE INDEX IF NOT EXISTS idx_design_assignments_project ON design_assignments(design_project_id);
CREATE INDEX IF NOT EXISTS idx_design_assignments_assigned_to ON design_assignments(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_design_assignments_status ON design_assignments(status);

-- Add check constraints for data integrity
ALTER TABLE design_projects ADD CONSTRAINT chk_design_projects_progress 
CHECK (overall_progress >= 0 AND overall_progress <= 100);

ALTER TABLE design_projects ADD CONSTRAINT chk_design_projects_phase 
CHECK (design_phase IN ('Conceptual', 'Preliminary', 'Detailed', 'Final', 'As-Built'));

ALTER TABLE design_projects ADD CONSTRAINT chk_design_projects_status 
CHECK (status IN ('Draft', 'In Progress', 'Under Review', 'Approved', 'On Hold', 'Cancelled', 'Completed'));

ALTER TABLE design_drawings ADD CONSTRAINT chk_design_drawings_status 
CHECK (status IN ('Draft', 'Under Review', 'Approved', 'Issued for Construction', 'As-Built', 'Superseded', 'Cancelled'));

ALTER TABLE design_drawings ADD CONSTRAINT chk_design_drawings_category 
CHECK (category IN ('P&ID', 'Equipment Layout', 'Piping Isometric', 'Electrical', 'Civil', 'Instrumentation', '3D Model', 'General Arrangement', 'Assembly Drawing', 'Detail Drawing'));

ALTER TABLE drawing_versions ADD CONSTRAINT chk_drawing_versions_review_status 
CHECK (review_status IN ('Pending', 'In Progress', 'Approved', 'Rejected', 'Approved with Comments'));

ALTER TABLE design_reviews ADD CONSTRAINT chk_design_reviews_status 
CHECK (status IN ('Pending', 'In Progress', 'Approved', 'Rejected', 'Approved with Comments'));

ALTER TABLE design_reviews ADD CONSTRAINT chk_design_reviews_priority 
CHECK (priority IN ('Low', 'Medium', 'High', 'Critical'));

ALTER TABLE review_comments ADD CONSTRAINT chk_review_comments_resolution_status 
CHECK (resolution_status IN ('Open', 'Closed', 'Verified'));

ALTER TABLE design_assignments ADD CONSTRAINT chk_design_assignments_status 
CHECK (status IN ('Assigned', 'In Progress', 'Completed', 'On Hold'));

ALTER TABLE design_assignments ADD CONSTRAINT chk_design_assignments_priority 
CHECK (priority IN ('Low', 'Medium', 'High', 'Critical'));

ALTER TABLE design_assignments ADD CONSTRAINT chk_design_assignments_progress 
CHECK (progress_percentage >= 0 AND progress_percentage <= 100);

-- Add comments for documentation
COMMENT ON TABLE design_projects IS 'Design projects linked to main projects with design-specific information';
COMMENT ON TABLE design_drawings IS 'Master drawing registry with version control and approval workflow';
COMMENT ON TABLE drawing_versions IS 'Version history for drawings with file management and check-in/check-out system';
COMMENT ON TABLE design_reviews IS 'Review workflow tracking for drawings with reviewer assignments';
COMMENT ON TABLE review_comments IS 'Detailed review comments with resolution tracking';
COMMENT ON TABLE design_standards IS 'Company design standards, templates, and guidelines repository';
COMMENT ON TABLE drawing_transmittals IS 'Client and external submission tracking for drawing packages';
COMMENT ON TABLE design_assignments IS 'Task management for design work assignments';

-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_app_user;

COMMIT;