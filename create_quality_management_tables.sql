-- Quality Management Tables
-- For tracking inspection reports, non-conformance reports, and quality checklists

-- Inspection Reports table
CREATE TABLE IF NOT EXISTS inspection_reports (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_code TEXT NOT NULL,
  work_order_id INTEGER REFERENCES work_orders(id) ON DELETE SET NULL,
  
  -- Report identification
  report_number TEXT NOT NULL UNIQUE,
  report_type TEXT NOT NULL, -- incoming, in-process, final, customer
  title TEXT NOT NULL,
  
  -- Inspection details
  inspection_date TIMESTAMP NOT NULL,
  location TEXT NOT NULL,
  inspector_id INTEGER NOT NULL REFERENCES users(id),
  
  -- Results
  status TEXT NOT NULL DEFAULT 'pending', -- pending, passed, failed, conditionally_passed
  findings TEXT,
  recommendations TEXT,
  
  -- Related items
  project_item_id INTEGER REFERENCES project_items(id) ON DELETE SET NULL,
  batch_number TEXT,
  quantity_inspected INTEGER NOT NULL,
  quantity_accepted INTEGER NOT NULL DEFAULT 0,
  quantity_rejected INTEGER NOT NULL DEFAULT 0,
  
  -- Document references
  reference_documents TEXT[] DEFAULT '{}',
  
  -- Approvals
  approved_by INTEGER REFERENCES users(id),
  approved_date TIMESTAMP,
  
  -- Tracking
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
  
  -- NCR identification
  ncr_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  
  -- Classification
  severity TEXT NOT NULL, -- critical, major, minor
  category TEXT NOT NULL, -- dimensional, material, workmanship, documentation, other
  
  -- Details
  identified_date TIMESTAMP NOT NULL,
  identified_by INTEGER NOT NULL REFERENCES users(id),
  location TEXT,
  
  -- Related items
  project_item_id INTEGER REFERENCES project_items(id) ON DELETE SET NULL,
  work_order_id INTEGER REFERENCES work_orders(id) ON DELETE SET NULL,
  batch_number TEXT,
  quantity_affected INTEGER NOT NULL,
  
  -- Resolution
  status TEXT NOT NULL DEFAULT 'open', -- open, in_review, corrective_action, closed, waived
  disposition TEXT, -- rework, repair, use_as_is, scrap, return_to_vendor
  root_cause TEXT,
  corrective_action TEXT,
  preventive_action TEXT,
  
  -- Approvals
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_date TIMESTAMP,
  approved_by INTEGER REFERENCES users(id),
  approved_date TIMESTAMP,
  closed_by INTEGER REFERENCES users(id),
  closed_date TIMESTAMP,
  
  -- Tracking
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Quality Checklists table
CREATE TABLE IF NOT EXISTS quality_checklists (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_code TEXT NOT NULL,
  
  -- Checklist identification
  checklist_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  
  -- Scope and applicability
  checklist_type TEXT NOT NULL, -- incoming, in-process, final, customer
  applicable_items TEXT[] DEFAULT '{}', -- Array of item codes this checklist applies to
  
  -- Version control
  version TEXT NOT NULL DEFAULT '1.0',
  status TEXT NOT NULL DEFAULT 'draft', -- draft, active, deprecated
  
  -- Ownership
  prepared_by INTEGER NOT NULL REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  approval_date TIMESTAMP,
  
  -- Tracking
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Checklist Items table (individual checks within a checklist)
CREATE TABLE IF NOT EXISTS checklist_items (
  id SERIAL PRIMARY KEY,
  checklist_id INTEGER NOT NULL REFERENCES quality_checklists(id) ON DELETE CASCADE,
  
  -- Check details
  sequence_number INTEGER NOT NULL,
  description TEXT NOT NULL,
  requirement TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  inspection_method TEXT NOT NULL, -- visual, measurement, test, documentation
  
  -- Configuration
  is_critical BOOLEAN NOT NULL DEFAULT false,
  requires_evidence BOOLEAN NOT NULL DEFAULT false,
  reference_document TEXT,
  
  -- Tracking
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Checklist Executions table (instances of completed checklists)
CREATE TABLE IF NOT EXISTS checklist_executions (
  id SERIAL PRIMARY KEY,
  checklist_id INTEGER NOT NULL REFERENCES quality_checklists(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_code TEXT NOT NULL,
  work_order_id INTEGER REFERENCES work_orders(id) ON DELETE SET NULL,
  
  -- Execution details
  execution_date TIMESTAMP NOT NULL,
  executed_by INTEGER NOT NULL REFERENCES users(id),
  
  -- Results
  status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress, completed, failed
  overall_result TEXT, -- pass, fail, conditional_pass
  comments TEXT,
  
  -- Related info
  batch_number TEXT,
  reference_documents TEXT[] DEFAULT '{}',
  
  -- Approvals
  verified_by INTEGER REFERENCES users(id),
  verified_date TIMESTAMP,
  
  -- Tracking
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Checklist Item Results table (results for individual checks in an execution)
CREATE TABLE IF NOT EXISTS checklist_item_results (
  id SERIAL PRIMARY KEY,
  execution_id INTEGER NOT NULL REFERENCES checklist_executions(id) ON DELETE CASCADE,
  checklist_item_id INTEGER NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  
  -- Result details
  result TEXT NOT NULL, -- pass, fail, n/a
  measured_value TEXT,
  observation TEXT,
  
  -- Evidence
  evidence_file_path TEXT,
  
  -- Tracking
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);