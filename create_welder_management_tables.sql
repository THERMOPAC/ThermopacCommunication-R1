-- Create welder management tables
CREATE TABLE IF NOT EXISTS welder_management (
  id SERIAL PRIMARY KEY,
  welder_id VARCHAR(20) NOT NULL UNIQUE,
  welder_name VARCHAR(100) NOT NULL,
  trade VARCHAR(50) NOT NULL,
  process_qualified TEXT[] NOT NULL,
  material_group_qualified TEXT[] NOT NULL,
  thickness_range VARCHAR(50) NOT NULL,
  position_qualified TEXT[] NOT NULL,
  wps_id VARCHAR(20) NOT NULL,
  test_date DATE NOT NULL,
  test_results VARCHAR(20) NOT NULL,
  certificate_no VARCHAR(20) NOT NULL UNIQUE,
  certificate_expiry_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL,
  remarks TEXT,
  certificate_file_path VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  updated_by INTEGER,
  FOREIGN KEY (wps_id) REFERENCES wps_documents(wps_id) ON DELETE RESTRICT
);

-- Create welder counter table for auto-incrementing IDs
CREATE TABLE IF NOT EXISTS welder_id_counter (
  id SERIAL PRIMARY KEY,
  sequence INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create certificate counter table for auto-incrementing certificate numbers
CREATE TABLE IF NOT EXISTS welder_certificate_counter (
  id SERIAL PRIMARY KEY,
  sequence INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial counter values if not exists
INSERT INTO welder_id_counter (sequence)
SELECT 1
WHERE NOT EXISTS (SELECT 1 FROM welder_id_counter);

INSERT INTO welder_certificate_counter (sequence)
SELECT 1
WHERE NOT EXISTS (SELECT 1 FROM welder_certificate_counter);