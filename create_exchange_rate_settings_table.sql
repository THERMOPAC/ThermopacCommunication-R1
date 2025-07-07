-- Create exchange rate settings table for unified USD to INR exchange rate management
CREATE TABLE IF NOT EXISTS exchange_rate_settings (
  id SERIAL PRIMARY KEY,
  from_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  to_currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  exchange_rate TEXT NOT NULL,
  source VARCHAR(20) NOT NULL CHECK (source IN ('api', 'manual', 'fallback')),
  api_last_updated TIMESTAMP,
  updated_by INTEGER,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Insert default exchange rate setting
INSERT INTO exchange_rate_settings (
  from_currency, 
  to_currency, 
  exchange_rate, 
  source, 
  updated_by, 
  is_active
) VALUES (
  'USD', 
  'INR', 
  '83.5', 
  'fallback', 
  3, -- Prasad's user ID
  true
) ON CONFLICT DO NOTHING;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_exchange_rate_active ON exchange_rate_settings(is_active) WHERE is_active = true;