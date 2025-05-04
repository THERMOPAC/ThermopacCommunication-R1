-- Create inspection documents table for storing uploaded files associated with inspection records
CREATE TABLE IF NOT EXISTS inspection_documents (
  id SERIAL PRIMARY KEY,
  inspection_order_id INTEGER NOT NULL REFERENCES inspection_orders(id) ON DELETE CASCADE,
  tab_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT,
  file_type TEXT,
  file_size INTEGER,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_inspection_documents_inspection_order_id ON inspection_documents(inspection_order_id);
CREATE INDEX IF NOT EXISTS idx_inspection_documents_tab_name ON inspection_documents(tab_name);
CREATE INDEX IF NOT EXISTS idx_inspection_documents_record_id ON inspection_documents(record_id);

-- Add comment to table
COMMENT ON TABLE inspection_documents IS 'Stores metadata for uploaded documents associated with inspection records';