-- Engineering Change Request and Engineering Change Notice tables for THERMOPAC

-- Create engineering_change_requests table
CREATE TABLE IF NOT EXISTS engineering_change_requests (
  id SERIAL PRIMARY KEY,
  document_number TEXT NOT NULL,
  item_id INTEGER NOT NULL REFERENCES master_items(id),
  description TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  requested_by INTEGER NOT NULL REFERENCES users(id),
  requested_date TIMESTAMP NOT NULL DEFAULT NOW(),
  approved_by INTEGER REFERENCES users(id),
  approved_date TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create engineering_change_notices table
CREATE TABLE IF NOT EXISTS engineering_change_notices (
  id SERIAL PRIMARY KEY,
  document_number TEXT NOT NULL,
  ecr_id INTEGER REFERENCES engineering_change_requests(id),
  item_id INTEGER NOT NULL REFERENCES master_items(id),
  description TEXT NOT NULL,
  implementation_details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  issued_by INTEGER NOT NULL REFERENCES users(id),
  issued_date TIMESTAMP NOT NULL DEFAULT NOW(),
  implementation_date TIMESTAMP,
  implemented_by INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create change_documents table
CREATE TABLE IF NOT EXISTS change_documents (
  id SERIAL PRIMARY KEY,
  ecr_id INTEGER REFERENCES engineering_change_requests(id),
  ecn_id INTEGER REFERENCES engineering_change_notices(id),
  document_type TEXT NOT NULL,
  document_name TEXT NOT NULL,
  document_path TEXT NOT NULL,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  storage_path TEXT,
  storage_url TEXT,
  storage_url_expiry TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_ecr_item_id ON engineering_change_requests(item_id);
CREATE INDEX IF NOT EXISTS idx_ecn_item_id ON engineering_change_notices(item_id);
CREATE INDEX IF NOT EXISTS idx_ecn_ecr_id ON engineering_change_notices(ecr_id);
CREATE INDEX IF NOT EXISTS idx_change_doc_ecr_id ON change_documents(ecr_id);
CREATE INDEX IF NOT EXISTS idx_change_doc_ecn_id ON change_documents(ecn_id);