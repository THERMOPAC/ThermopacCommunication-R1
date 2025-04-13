-- Production Management Tables
-- For tracking work orders, resources, and production status

-- Work Orders table
CREATE TABLE IF NOT EXISTS work_orders (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_code TEXT NOT NULL,
  work_order_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planned', -- planned, in_progress, on_hold, completed, cancelled
  priority TEXT NOT NULL DEFAULT 'Medium', -- Low, Medium, High
  
  -- Dates and scheduling
  planned_start_date TIMESTAMP NOT NULL,
  planned_end_date TIMESTAMP NOT NULL,
  actual_start_date TIMESTAMP,
  actual_end_date TIMESTAMP,
  
  -- Production details
  production_line TEXT,
  batch_number TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  
  -- Resources and costs
  estimated_hours INTEGER,
  actual_hours INTEGER,
  estimated_cost DECIMAL(12, 2),
  actual_cost DECIMAL(12, 2),
  
  -- Ownership and creation details
  supervisor_id INTEGER NOT NULL REFERENCES users(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Work Order Items table (linking work orders to project items)
CREATE TABLE IF NOT EXISTS work_order_items (
  id SERIAL PRIMARY KEY,
  work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  project_item_id INTEGER NOT NULL REFERENCES project_items(id) ON DELETE CASCADE,
  quantity DECIMAL(10, 2) NOT NULL,
  
  -- Production details for this specific item
  status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, complete
  sequence_number INTEGER NOT NULL, -- order of production
  notes TEXT,
  
  -- Tracking
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Resource Assignments table (tracking who's working on what)
CREATE TABLE IF NOT EXISTS resource_assignments (
  id SERIAL PRIMARY KEY,
  work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  
  -- Assignment details
  role TEXT NOT NULL, -- operator, inspector, supervisor, helper
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP,
  hours_allocated DECIMAL(8, 2),
  hours_spent DECIMAL(8, 2) DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'assigned', -- assigned, in_progress, completed, reassigned
  
  -- Tracking
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(work_order_id, user_id, role) -- A user should have only one role assignment per work order
);

-- Production Records table (daily production entry)
CREATE TABLE IF NOT EXISTS production_records (
  id SERIAL PRIMARY KEY,
  work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  work_order_item_id INTEGER REFERENCES work_order_items(id) ON DELETE CASCADE,
  
  -- Production metrics
  date DATE NOT NULL,
  shift TEXT NOT NULL, -- morning, afternoon, night
  quantity_produced INTEGER NOT NULL,
  quantity_rejected INTEGER NOT NULL DEFAULT 0,
  hours_worked DECIMAL(8, 2) NOT NULL,
  
  -- Quality and issues
  issues_encountered TEXT,
  
  -- Ownership
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Material Consumption table
CREATE TABLE IF NOT EXISTS material_consumption (
  id SERIAL PRIMARY KEY,
  work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  component_item_id INTEGER NOT NULL REFERENCES master_items(id),
  
  -- Consumption details
  quantity_required DECIMAL(10, 2) NOT NULL,
  quantity_consumed DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Tracking and status
  status TEXT NOT NULL DEFAULT 'allocated', -- allocated, partially_consumed, fully_consumed
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Machine Allocation table
CREATE TABLE IF NOT EXISTS machine_allocations (
  id SERIAL PRIMARY KEY,
  work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  
  -- Machine details
  machine_name TEXT NOT NULL,
  machine_code TEXT,
  
  -- Allocation details
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  setup_time_minutes INTEGER NOT NULL DEFAULT 0,
  downtime_minutes INTEGER NOT NULL DEFAULT 0,
  
  -- Status and tracking
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled, active, completed, maintenance
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);