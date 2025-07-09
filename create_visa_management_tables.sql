-- Visa Management Tables
-- Create visa_records table for employee visa information
CREATE TABLE visa_records (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visa_type VARCHAR(100) NOT NULL,
  country VARCHAR(100) NOT NULL,
  visa_number VARCHAR(100) NOT NULL UNIQUE,
  issue_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Expiring Soon', 'Expired', 'Cancelled')),
  quota_reference VARCHAR(100),
  file_path TEXT,
  file_url TEXT,
  notes TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create visa_alerts table for tracking expiry notifications
CREATE TABLE visa_alerts (
  id SERIAL PRIMARY KEY,
  visa_record_id INTEGER NOT NULL REFERENCES visa_records(id) ON DELETE CASCADE,
  alert_type VARCHAR(20) NOT NULL CHECK (alert_type IN ('60_days', '30_days', '7_days')),
  alert_date DATE NOT NULL,
  is_sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create visa_quota_settings table for country-wise visa quotas
CREATE TABLE visa_quota_settings (
  id SERIAL PRIMARY KEY,
  country VARCHAR(100) NOT NULL UNIQUE,
  visa_type VARCHAR(100) NOT NULL,
  total_quota INTEGER NOT NULL DEFAULT 0,
  used_quota INTEGER NOT NULL DEFAULT 0,
  financial_year VARCHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_visa_records_employee_id ON visa_records(employee_id);
CREATE INDEX idx_visa_records_expiry_date ON visa_records(expiry_date);
CREATE INDEX idx_visa_records_status ON visa_records(status);
CREATE INDEX idx_visa_records_country ON visa_records(country);
CREATE INDEX idx_visa_alerts_visa_record_id ON visa_alerts(visa_record_id);
CREATE INDEX idx_visa_alerts_alert_date ON visa_alerts(alert_date);

-- Insert default visa types and countries
INSERT INTO visa_quota_settings (country, visa_type, total_quota, used_quota, financial_year) VALUES
('United States', 'B1/B2 Business/Tourist', 50, 0, '2025-26'),
('United Kingdom', 'Standard Visitor', 30, 0, '2025-26'),
('Germany', 'Schengen Business', 40, 0, '2025-26'),
('Singapore', 'Business Visa', 25, 0, '2025-26'),
('UAE', 'Business Visa', 35, 0, '2025-26'),
('Australia', 'Business Visitor', 20, 0, '2025-26'),
('Canada', 'Temporary Resident', 25, 0, '2025-26'),
('Japan', 'Business Visa', 15, 0, '2025-26');

-- Function to automatically update visa status based on expiry date
CREATE OR REPLACE FUNCTION update_visa_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Update status based on expiry date
  IF NEW.expiry_date < CURRENT_DATE THEN
    NEW.status = 'Expired';
  ELSIF NEW.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN
    NEW.status = 'Expiring Soon';
  ELSE
    NEW.status = 'Active';
  END IF;
  
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update status
CREATE TRIGGER trigger_update_visa_status
  BEFORE INSERT OR UPDATE ON visa_records
  FOR EACH ROW
  EXECUTE FUNCTION update_visa_status();

-- Function to create alert records when visa is added/updated
CREATE OR REPLACE FUNCTION create_visa_alerts()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete existing alerts for this visa
  DELETE FROM visa_alerts WHERE visa_record_id = NEW.id;
  
  -- Create 60-day alert
  IF NEW.expiry_date > CURRENT_DATE + INTERVAL '60 days' THEN
    INSERT INTO visa_alerts (visa_record_id, alert_type, alert_date)
    VALUES (NEW.id, '60_days', NEW.expiry_date - INTERVAL '60 days');
  END IF;
  
  -- Create 30-day alert
  IF NEW.expiry_date > CURRENT_DATE + INTERVAL '30 days' THEN
    INSERT INTO visa_alerts (visa_record_id, alert_type, alert_date)
    VALUES (NEW.id, '30_days', NEW.expiry_date - INTERVAL '30 days');
  END IF;
  
  -- Create 7-day alert
  IF NEW.expiry_date > CURRENT_DATE + INTERVAL '7 days' THEN
    INSERT INTO visa_alerts (visa_record_id, alert_type, alert_date)
    VALUES (NEW.id, '7_days', NEW.expiry_date - INTERVAL '7 days');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to generate alerts
CREATE TRIGGER trigger_create_visa_alerts
  AFTER INSERT OR UPDATE ON visa_records
  FOR EACH ROW
  EXECUTE FUNCTION create_visa_alerts();