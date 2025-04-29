-- Create welder certificates table for multiple certificates per welder
CREATE TABLE IF NOT EXISTS welder_certificates (
  id SERIAL PRIMARY KEY,
  welder_id INTEGER NOT NULL,
  certificate_no VARCHAR(30) NOT NULL,
  certificate_type VARCHAR(50) NOT NULL,
  description TEXT,
  issue_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  file_url VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  FOREIGN KEY (welder_id) REFERENCES welders(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_welder_certificates_welder_id ON welder_certificates(welder_id);