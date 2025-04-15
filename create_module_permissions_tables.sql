-- Create module permissions tables
CREATE TABLE IF NOT EXISTS module_permissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_name TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, module_name)
);

CREATE TABLE IF NOT EXISTS role_module_permissions (
  id SERIAL PRIMARY KEY,
  role TEXT NOT NULL,
  module_name TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (role, module_name)
);

-- Insert default role-based module permissions

-- Superuser has all permissions on all modules
INSERT INTO role_module_permissions (role, module_name, can_view, can_create, can_edit, can_delete)
VALUES
-- Project Management
('Superuser', 'Project Management', true, true, true, true),
('General Manager', 'Project Management', true, true, true, false),
('Senior Manager', 'Project Management', true, true, true, false),
('Manager', 'Project Management', true, true, false, false),
('Employee', 'Project Management', true, false, false, false),

-- Production Management
('Superuser', 'Production Management', true, true, true, true),
('General Manager', 'Production Management', true, true, true, false),
('Senior Manager', 'Production Management', true, true, true, false),
('Manager', 'Production Management', true, true, false, false),
('Employee', 'Production Management', true, false, false, false),

-- Quality Management
('Superuser', 'Quality Management', true, true, true, true),
('General Manager', 'Quality Management', true, true, true, false),
('Senior Manager', 'Quality Management', true, true, true, false),
('Manager', 'Quality Management', true, true, false, false),
('Employee', 'Quality Management', true, false, false, false),

-- Project Commissioning
('Superuser', 'Project Commissioning', true, true, true, true),
('General Manager', 'Project Commissioning', true, true, true, false),
('Senior Manager', 'Project Commissioning', true, true, true, false),
('Manager', 'Project Commissioning', true, true, false, false),
('Employee', 'Project Commissioning', true, false, false, false),

-- Dispatch & Shipping
('Superuser', 'Dispatch & Shipping', true, true, true, true),
('General Manager', 'Dispatch & Shipping', true, true, true, false),
('Senior Manager', 'Dispatch & Shipping', true, true, true, false),
('Manager', 'Dispatch & Shipping', true, true, false, false),
('Employee', 'Dispatch & Shipping', true, false, false, false),

-- After-Sales
('Superuser', 'After-Sales', true, true, true, true),
('General Manager', 'After-Sales', true, true, true, false),
('Senior Manager', 'After-Sales', true, true, true, false),
('Manager', 'After-Sales', true, true, false, false),
('Employee', 'After-Sales', true, false, false, false),

-- Internal Communication
('Superuser', 'Internal Communication', true, true, true, true),
('General Manager', 'Internal Communication', true, true, true, false),
('Senior Manager', 'Internal Communication', true, true, true, false),
('Manager', 'Internal Communication', true, true, true, false),
('Employee', 'Internal Communication', true, true, false, false)
ON CONFLICT (role, module_name) DO UPDATE
SET 
  can_view = EXCLUDED.can_view,
  can_create = EXCLUDED.can_create,
  can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete,
  updated_at = CURRENT_TIMESTAMP;