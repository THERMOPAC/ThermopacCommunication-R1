CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  bp_code TEXT NOT NULL UNIQUE,
  bp_name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  continent TEXT,
  country_name TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Insert some sample customers
INSERT INTO customers (bp_code, bp_name, contact_person, email, continent, country_name)
VALUES 
('BP001', 'TATA Motors', 'Ratan Tata', 'contact@tatamotors.com', 'Asia', 'India'),
('BP002', 'Mahindra & Mahindra', 'Anand Mahindra', 'contact@mahindra.com', 'Asia', 'India'),
('BP003', 'Reliance Industries', 'Mukesh Ambani', 'contact@ril.com', 'Asia', 'India');