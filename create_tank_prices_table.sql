-- Create tank_prices table for ROI Calculator
CREATE TABLE IF NOT EXISTS tank_prices (
  id SERIAL PRIMARY KEY,
  capacity INTEGER NOT NULL UNIQUE,
  price_usd DECIMAL(10,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id)
);

-- Insert default tank prices
INSERT INTO tank_prices (capacity, price_usd, created_by) VALUES
(50, 15900.00, 3),
(100, 27800.00, 3),
(200, 48600.00, 3),
(300, 66250.00, 3),
(400, 81900.00, 3),
(500, 96100.00, 3),
(600, 109250.00, 3)
ON CONFLICT (capacity) DO NOTHING;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_tank_prices_capacity ON tank_prices(capacity);
CREATE INDEX IF NOT EXISTS idx_tank_prices_active ON tank_prices(is_active);