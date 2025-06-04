-- Create work_locations table
CREATE TABLE IF NOT EXISTS work_locations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'India',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  radius_meters INTEGER DEFAULT 100,
  ip_restrictions TEXT[],
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add work_location_id column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_location_id INTEGER REFERENCES work_locations(id);

-- Insert some default work locations
INSERT INTO work_locations (name, address, city, state, pincode, country) VALUES 
('Head Office Mumbai', 'Plot No. 123, Industrial Area', 'Mumbai', 'Maharashtra', '400001', 'India'),
('Branch Office Pune', 'Office No. 456, IT Park', 'Pune', 'Maharashtra', '411001', 'India'),
('Plant Aurangabad', 'Survey No. 789, MIDC Area', 'Aurangabad', 'Maharashtra', '431001', 'India')
ON CONFLICT DO NOTHING;