-- Create the material_inspection_links table for material traceability within inspection orders
CREATE TABLE IF NOT EXISTS material_inspection_links (
  id SERIAL PRIMARY KEY,
  inspection_order_id INTEGER NOT NULL REFERENCES inspection_orders(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES material_identification(id) ON DELETE CASCADE,
  material_identification_id TEXT NOT NULL,
  material_certificate_number TEXT,
  heat_number TEXT,
  material_grade TEXT,
  material_specification TEXT,
  allocated_quantity TEXT,
  quantity_unit TEXT,
  remarks TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_material_inspection_links_inspection_order_id ON material_inspection_links(inspection_order_id);
CREATE INDEX IF NOT EXISTS idx_material_inspection_links_material_id ON material_inspection_links(material_id);