-- Create calibration instruments table
CREATE TABLE IF NOT EXISTS calibration_instruments (
  id SERIAL PRIMARY KEY,
  instrument_id VARCHAR(20) NOT NULL,
  instrument_name VARCHAR(255) NOT NULL,
  instrument_type VARCHAR(100) NOT NULL,
  manufacturer VARCHAR(255) NOT NULL,
  serial_number VARCHAR(100) NOT NULL,
  location VARCHAR(255) NOT NULL,
  calibration_frequency VARCHAR(50) NOT NULL,
  last_calibration_date DATE NOT NULL,
  next_calibration_date DATE NOT NULL,
  calibration_status VARCHAR(50) NOT NULL,
  certificate_number VARCHAR(100),
  certificate_file_path TEXT,
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on next_calibration_date for quicker lookup of due/overdue instruments
CREATE INDEX IF NOT EXISTS idx_calibration_next_date ON calibration_instruments(next_calibration_date);

-- Create index on calibration_status for quicker filtering
CREATE INDEX IF NOT EXISTS idx_calibration_status ON calibration_instruments(calibration_status);