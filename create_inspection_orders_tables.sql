-- Create Inspection Orders tables

-- Inspection Orders table
CREATE TABLE IF NOT EXISTS inspection_orders (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_code VARCHAR(50) NOT NULL,
  
  -- Order identifiers
  inspection_order_number VARCHAR(50) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  
  -- Related items
  item_id INTEGER REFERENCES project_items(id) ON DELETE SET NULL,
  item_code VARCHAR(100),
  description TEXT NOT NULL,
  work_order_id INTEGER REFERENCES work_orders(id) ON DELETE SET NULL,
  
  -- Order details
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  inspection_type VARCHAR(50) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit VARCHAR(20) NOT NULL DEFAULT 'Nos',
  make_or_buy VARCHAR(20),
  parent_inspection_order_id INTEGER REFERENCES inspection_orders(id) ON DELETE SET NULL,
  sequence_number INTEGER NOT NULL,
  
  -- Timing
  planned_date TIMESTAMP WITH TIME ZONE,
  completed_date TIMESTAMP WITH TIME ZONE,
  
  -- Tracking
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Inspection Order Items table
CREATE TABLE IF NOT EXISTS inspection_order_items (
  id SERIAL PRIMARY KEY,
  inspection_order_id INTEGER NOT NULL REFERENCES inspection_orders(id) ON DELETE CASCADE,
  
  -- Related items
  item_id INTEGER REFERENCES project_items(id) ON DELETE SET NULL,
  item_code VARCHAR(100),
  description TEXT NOT NULL,
  work_order_item_id INTEGER REFERENCES work_order_items(id) ON DELETE SET NULL,
  
  -- Item details
  quantity INTEGER NOT NULL DEFAULT 1,
  unit VARCHAR(20) NOT NULL DEFAULT 'Nos',
  make_or_buy VARCHAR(20),
  sequence_number INTEGER NOT NULL,
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_inspection_orders_project_id ON inspection_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_inspection_orders_item_id ON inspection_orders(item_id);
CREATE INDEX IF NOT EXISTS idx_inspection_orders_status ON inspection_orders(status);
CREATE INDEX IF NOT EXISTS idx_inspection_order_items_order_id ON inspection_order_items(inspection_order_id);