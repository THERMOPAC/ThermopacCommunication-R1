-- Create transporters table
CREATE TABLE IF NOT EXISTS transporters (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    contact_person VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(20),
    address TEXT,
    gst_number VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create dispatch_records table
CREATE TABLE IF NOT EXISTS dispatch_records (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    dispatch_number VARCHAR(50) NOT NULL,
    dispatch_date DATE NOT NULL,
    transporter_name VARCHAR(100),
    transporter_contact VARCHAR(100),
    vehicle_number VARCHAR(20),
    gate_pass_number VARCHAR(50),
    delivery_status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    estimated_delivery_date DATE,
    actual_delivery_date DATE,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create dispatch_items table
CREATE TABLE IF NOT EXISTS dispatch_items (
    id SERIAL PRIMARY KEY,
    dispatch_id INTEGER NOT NULL REFERENCES dispatch_records(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES master_items(id),
    quantity NUMERIC(10, 2) NOT NULL,
    unit VARCHAR(10) NOT NULL,
    quality_approved BOOLEAN NOT NULL DEFAULT FALSE,
    quality_approval_date TIMESTAMP,
    quality_approved_by INTEGER REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create dispatch_documents table
CREATE TABLE IF NOT EXISTS dispatch_documents (
    id SERIAL PRIMARY KEY,
    dispatch_id INTEGER NOT NULL REFERENCES dispatch_records(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL,
    document_name VARCHAR(255) NOT NULL,
    document_path TEXT NOT NULL,
    storage_path TEXT,
    storage_url TEXT,
    storage_url_expiry TIMESTAMP,
    uploaded_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_dispatch_records_project_id ON dispatch_records(project_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_records_dispatch_date ON dispatch_records(dispatch_date);
CREATE INDEX IF NOT EXISTS idx_dispatch_items_dispatch_id ON dispatch_items(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_items_item_id ON dispatch_items(item_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_documents_dispatch_id ON dispatch_documents(dispatch_id);