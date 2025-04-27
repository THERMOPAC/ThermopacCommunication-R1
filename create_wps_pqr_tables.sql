-- Create WPS documents table
CREATE TABLE wps_documents (
    id SERIAL PRIMARY KEY,
    wps_id VARCHAR(50) NOT NULL UNIQUE,
    pqr_id VARCHAR(50) NOT NULL UNIQUE,
    revision_no VARCHAR(10) NOT NULL DEFAULT '0',
    welder_process VARCHAR(20) NOT NULL,
    base_metal_grade VARCHAR(100) NOT NULL,
    base_metal_thickness VARCHAR(50) NOT NULL,
    filler_material VARCHAR(100) NOT NULL,
    joint_type VARCHAR(50) NOT NULL,
    weld_position VARCHAR(50) NOT NULL,
    preheating_temp VARCHAR(50),
    post_weld_heat_treatment VARCHAR(100),
    electrical_parameters JSONB,
    shielding_gas VARCHAR(100),
    document_file_path VARCHAR(255),
    document_url TEXT,
    combined_document_file_path VARCHAR(255),
    combined_document_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'Draft',
    remarks TEXT,
    approved_by INTEGER REFERENCES users(id),
    approval_date TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_wps_documents_wps_id ON wps_documents(wps_id);
CREATE INDEX idx_wps_documents_pqr_id ON wps_documents(pqr_id);
CREATE INDEX idx_wps_documents_status ON wps_documents(status);
CREATE INDEX idx_wps_documents_created_by ON wps_documents(created_by);
CREATE INDEX idx_wps_documents_approved_by ON wps_documents(approved_by);

-- Create view for WPS documents with user information
CREATE VIEW wps_documents_with_users AS
SELECT 
    wd.*,
    creator.username AS created_by_user,
    approver.username AS approved_by_user
FROM 
    wps_documents wd
LEFT JOIN 
    users creator ON wd.created_by = creator.id
LEFT JOIN 
    users approver ON wd.approved_by = approver.id;

-- Create table for the database queries to access
ALTER TABLE pg_catalog.pg_type OWNER TO postgres;
CREATE OR REPLACE VIEW public.wps_documents AS SELECT * FROM wps_documents_with_users;