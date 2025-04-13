-- Create the dispatch_records table
CREATE TABLE IF NOT EXISTS dispatch_records (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  dispatch_number VARCHAR(50) NOT NULL,
  dispatch_date TIMESTAMP NOT NULL,
  transporter_name VARCHAR(100) NOT NULL,
  transporter_contact VARCHAR(50),
  vehicle_number VARCHAR(50),
  gate_pass_number VARCHAR(50) NOT NULL,
  delivery_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
  estimated_delivery_date TIMESTAMP,
  actual_delivery_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  created_by INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Create the dispatch_items table
CREATE TABLE IF NOT EXISTS dispatch_items (
  id SERIAL PRIMARY KEY,
  dispatch_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  unit VARCHAR(20) NOT NULL,
  quality_approved BOOLEAN NOT NULL DEFAULT FALSE,
  quality_approval_date TIMESTAMP,
  quality_approved_by INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dispatch_id) REFERENCES dispatch_records(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES master_items(id),
  FOREIGN KEY (quality_approved_by) REFERENCES users(id)
);

-- Create the dispatch_documents table
CREATE TABLE IF NOT EXISTS dispatch_documents (
  id SERIAL PRIMARY KEY,
  dispatch_id INTEGER NOT NULL,
  document_type VARCHAR(50) NOT NULL,
  document_name VARCHAR(255) NOT NULL,
  document_path VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  uploaded_by INTEGER,
  storage_path VARCHAR(255),
  storage_url VARCHAR(255),
  storage_url_expiry TIMESTAMP,
  FOREIGN KEY (dispatch_id) REFERENCES dispatch_records(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- Create the transporters table for storing regular transporters
CREATE TABLE IF NOT EXISTS transporters (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  contact_person VARCHAR(100),
  email VARCHAR(100),
  phone VARCHAR(50),
  address TEXT,
  gst_number VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);