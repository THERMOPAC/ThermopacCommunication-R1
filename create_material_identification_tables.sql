-- Create Material Identification table
CREATE TABLE IF NOT EXISTS material_identification (
    id SERIAL PRIMARY KEY,
    material_identification_id VARCHAR(20) NOT NULL UNIQUE,
    project_id INTEGER NOT NULL,
    project_number VARCHAR(50) NOT NULL,
    project_name VARCHAR(255) NOT NULL,
    inspection_order_number VARCHAR(50) NOT NULL,
    material_description TEXT NOT NULL,
    material_code VARCHAR(100) NOT NULL,
    specification VARCHAR(255) NOT NULL,
    material_grade VARCHAR(100) NOT NULL,
    heat_number VARCHAR(100) NOT NULL,
    batch_number VARCHAR(100),
    mill_name VARCHAR(255) NOT NULL,
    mill_test_certificate_number VARCHAR(100) NOT NULL,
    quantity VARCHAR(50) NOT NULL,
    dimensions VARCHAR(255) NOT NULL,
    material_status VARCHAR(50) NOT NULL,
    inspector_name VARCHAR(255) NOT NULL,
    inspection_date DATE NOT NULL,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Create Material Identification Counter table for auto-generated IDs
CREATE TABLE IF NOT EXISTS material_identification_counter (
    id SERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    sequence INTEGER NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial counter record for current year with sequence 1
INSERT INTO material_identification_counter (year, sequence)
VALUES (
    EXTRACT(YEAR FROM CURRENT_DATE),
    1
)
ON CONFLICT DO NOTHING;

-- Create index on material_identification_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_material_identification_id ON material_identification(material_identification_id);

-- Create index on project_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_material_identification_project_id ON material_identification(project_id);