-- Quality Management Tables
-- For tracking inspections, non-conformances, and quality checklists

-- Inspection Reports table
CREATE TABLE IF NOT EXISTS inspection_reports (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_code TEXT NOT NULL,
  work_order_id INTEGER REFERENCES work_orders(id) ON DELETE SET NULL,
  
  -- Report identifiers
  report_number TEXT NOT NULL UNIQUE,
  report_type TEXT NOT NULL, -- incoming, in-process, final, customer
  title TEXT NOT NULL,
  
  -- Inspection details
  inspection_date TIMESTAMP NOT NULL,
  location TEXT NOT NULL,
  inspector_id INTEGER NOT NULL REFERENCES users(id),
  findings TEXT,
  recommendations TEXT,
  
  -- Inspection metrics
  quantity_inspected INTEGER NOT NULL,
  quantity_accepted INTEGER NOT NULL DEFAULT 0,
  quantity_rejected INTEGER NOT NULL DEFAULT 0,
  
  -- Status and tracking
  status TEXT NOT NULL DEFAULT 'pending', -- pending, passed, failed, conditionally_passed
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Non-Conformance Reports (NCRs) table
CREATE TABLE IF NOT EXISTS non_conformance_reports (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_code TEXT NOT NULL,
  inspection_report_id INTEGER REFERENCES inspection_reports(id) ON DELETE SET NULL,
  
  -- NCR details
  ncr_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL, -- critical, major, minor
  category TEXT NOT NULL, -- material, dimension, appearance, function, documentation
  
  -- Timing and ownership
  identified_date TIMESTAMP NOT NULL,
  identified_by INTEGER NOT NULL REFERENCES users(id),
  assigned_to INTEGER REFERENCES users(id),
  closed_by INTEGER REFERENCES users(id),
  closed_date TIMESTAMP,
  
  -- Impact and disposition
  quantity_affected INTEGER NOT NULL,
  disposition TEXT, -- rework, scrap, use-as-is, return-to-vendor
  corrective_action TEXT,
  preventive_action TEXT,
  
  -- Status and tracking
  status TEXT NOT NULL DEFAULT 'open', -- open, in_progress, closed, voided
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Quality Checklists table
CREATE TABLE IF NOT EXISTS quality_checklists (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_code TEXT NOT NULL,
  
  -- Checklist details
  checklist_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  checklist_type TEXT NOT NULL, -- incoming, in-process, final, general
  description TEXT,
  
  -- Ownership
  prepared_by INTEGER NOT NULL REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  approval_date TIMESTAMP,
  
  -- Status and tracking
  status TEXT NOT NULL DEFAULT 'draft', -- draft, active, obsolete
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Checklist Items table
CREATE TABLE IF NOT EXISTS checklist_items (
  id SERIAL PRIMARY KEY,
  checklist_id INTEGER NOT NULL REFERENCES quality_checklists(id) ON DELETE CASCADE,
  
  -- Item details
  sequence_number INTEGER NOT NULL,
  description TEXT NOT NULL,
  requirement TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  inspection_method TEXT NOT NULL,
  
  -- Settings
  is_critical BOOLEAN NOT NULL DEFAULT false,
  requires_evidence BOOLEAN NOT NULL DEFAULT false,
  
  -- Tracking
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(checklist_id, sequence_number) -- Ensure sequence numbers are unique per checklist
);

-- Checklist Executions table (instance of a checklist being used)
CREATE TABLE IF NOT EXISTS checklist_executions (
  id SERIAL PRIMARY KEY,
  checklist_id INTEGER NOT NULL REFERENCES quality_checklists(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_code TEXT NOT NULL,
  work_order_id INTEGER REFERENCES work_orders(id) ON DELETE SET NULL,
  
  -- Execution details
  execution_date TIMESTAMP NOT NULL,
  executed_by INTEGER NOT NULL REFERENCES users(id),
  location TEXT,
  
  -- Status and results
  overall_result TEXT NOT NULL DEFAULT 'pending', -- pending, pass, fail, conditional_pass
  notes TEXT,
  
  -- Tracking
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Checklist Item Results table (results for each item in an execution)
CREATE TABLE IF NOT EXISTS checklist_item_results (
  id SERIAL PRIMARY KEY,
  execution_id INTEGER NOT NULL REFERENCES checklist_executions(id) ON DELETE CASCADE,
  checklist_item_id INTEGER NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  
  -- Result details
  result TEXT NOT NULL, -- pass, fail, n/a
  measured_value TEXT,
  observation TEXT,
  
  -- Evidence (reference to files/photos)
  evidence_path TEXT,
  
  -- Tracking
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(execution_id, checklist_item_id) -- One result per item per execution
);

-- Create indexes for performance
CREATE INDEX idx_inspection_reports_project_id ON inspection_reports(project_id);
CREATE INDEX idx_inspection_reports_work_order_id ON inspection_reports(work_order_id);
CREATE INDEX idx_non_conformance_reports_project_id ON non_conformance_reports(project_id);
CREATE INDEX idx_non_conformance_reports_inspection_id ON non_conformance_reports(inspection_report_id);
CREATE INDEX idx_quality_checklists_project_id ON quality_checklists(project_id);
CREATE INDEX idx_checklist_executions_checklist_id ON checklist_executions(checklist_id);
CREATE INDEX idx_checklist_executions_project_id ON checklist_executions(project_id);
CREATE INDEX idx_checklist_item_results_execution_id ON checklist_item_results(execution_id);