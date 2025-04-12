-- Create the item_components table for sub-assembly relationships
CREATE TABLE IF NOT EXISTS item_components (
  id SERIAL PRIMARY KEY,
  parent_item_id INTEGER NOT NULL,
  component_item_id INTEGER NOT NULL,
  quantity DECIMAL NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_item_id) REFERENCES master_items(id),
  FOREIGN KEY (component_item_id) REFERENCES master_items(id)
);

-- Add index for faster lookups by parent item
CREATE INDEX IF NOT EXISTS idx_item_components_parent_item_id ON item_components(parent_item_id);

-- Add index for faster lookups by component item
CREATE INDEX IF NOT EXISTS idx_item_components_component_item_id ON item_components(component_item_id);

-- Add a unique constraint to prevent duplicate components for a parent
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_parent_component ON item_components(parent_item_id, component_item_id);