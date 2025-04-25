-- Create Inspection Orders tables

-- Inspection Orders table
CREATE TABLE IF NOT EXISTS inspection_orders (
  id SERIAL PRIMARY KEY,
  inspection_order_number VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_code VARCHAR(50) NOT NULL,
  item_id INTEGER NOT NULL REFERENCES master_items(id),
  item_code VARCHAR(100) NOT NULL,
  parent_item_id INTEGER REFERENCES master_items(id),
  parent_item_code VARCHAR(100),
  inspection_type VARCHAR(50) DEFAULT 'incoming',
  quantity DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(20) DEFAULT 'pcs',
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER REFERENCES users(id),
  is_virtual BOOLEAN DEFAULT FALSE,
  sequence_number INTEGER,
  reference_number VARCHAR(100),
  notes TEXT
);

-- Inspection Order Items table
CREATE TABLE IF NOT EXISTS inspection_order_items (
  id SERIAL PRIMARY KEY,
  inspection_order_id INTEGER NOT NULL REFERENCES inspection_orders(id) ON DELETE CASCADE,
  characteristic VARCHAR(255) NOT NULL,
  specification TEXT,
  tolerance TEXT,
  measurement_method VARCHAR(255),
  result TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  is_critical BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  inspector_id INTEGER REFERENCES users(id),
  notes TEXT
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_inspection_orders_project_id ON inspection_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_inspection_orders_item_id ON inspection_orders(item_id);
CREATE INDEX IF NOT EXISTS idx_inspection_orders_status ON inspection_orders(status);
CREATE INDEX IF NOT EXISTS idx_inspection_order_items_order_id ON inspection_order_items(inspection_order_id);