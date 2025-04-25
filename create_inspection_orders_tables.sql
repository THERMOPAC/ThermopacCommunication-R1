-- Inspection Orders tables
-- For creating and tracking inspection orders for projects

-- Inspection Orders table
CREATE TABLE IF NOT EXISTS inspection_orders (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_code TEXT NOT NULL,
  
  -- Order identifiers
  inspection_order_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  
  -- Related items
  item_id INTEGER REFERENCES project_items(id) ON DELETE SET NULL,
  item_code TEXT,
  description TEXT NOT NULL,
  work_order_id INTEGER REFERENCES work_orders(id) ON DELETE SET NULL,
  
  -- Order details
  status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, cancelled
  inspection_type TEXT NOT NULL, -- incoming, in-process, final, dimensional, visual
  quantity INTEGER NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'Nos',
  make_or_buy TEXT,
  parent_inspection_order_id INTEGER REFERENCES inspection_orders(id) ON DELETE SET NULL,
  sequence_number INTEGER NOT NULL,
  
  -- Timing
  planned_date TIMESTAMP,
  completed_date TIMESTAMP,
  
  -- Tracking
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Inspection Order Items table (for component items under a parent inspection order)
CREATE TABLE IF NOT EXISTS inspection_order_items (
  id SERIAL PRIMARY KEY,
  inspection_order_id INTEGER NOT NULL REFERENCES inspection_orders(id) ON DELETE CASCADE,
  
  -- Related items
  item_id INTEGER REFERENCES project_items(id) ON DELETE SET NULL,
  item_code TEXT,
  description TEXT NOT NULL,
  work_order_item_id INTEGER REFERENCES work_order_items(id) ON DELETE SET NULL,
  
  -- Item details
  quantity INTEGER NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'Nos',
  make_or_buy TEXT,
  sequence_number INTEGER NOT NULL,
  
  -- Tracking
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_inspection_orders_project_id ON inspection_orders(project_id);
CREATE INDEX idx_inspection_orders_work_order_id ON inspection_orders(work_order_id);
CREATE INDEX idx_inspection_orders_parent_id ON inspection_orders(parent_inspection_order_id);
CREATE INDEX idx_inspection_order_items_order_id ON inspection_order_items(inspection_order_id);