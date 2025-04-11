-- Create the directory templates table
CREATE TABLE directory_templates (
  id SERIAL PRIMARY KEY,
  department VARCHAR(255) NOT NULL,
  sub_directory VARCHAR(255),
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Populate with the standard directory structure for design department
INSERT INTO directory_templates (department, sub_directory, is_public)
VALUES 
  -- Design department directories
  ('design', '0_3D_Model_Assembly', true),
  ('design', '1_BEDD', true),
  ('design', '2_Relevant_Standards', true),
  ('design', '2_P_ID', true),
  ('design', '4_Material_and_heat_balance', true),
  ('design', '4_Hazop', true),
  ('design', '5_QAP', true),
  ('design', '6_Tiein_points', true),
  ('design', '7_GA', true),
  ('design', '8_Foundation', true),
  ('design', '9_Electrical', true),
  ('design', '10_Progress_Report', true),
  ('design', '11_Cause_Effect', true),
  ('design', '12_Data_sheet_for_approval', true),
  ('design', '13_Inspection_Reports', true),
  ('design', '14_Design_Calculation', true),
  ('design', '15_Operation_Maintenance_Manual', true),
  
  -- Other department root directories
  ('procurement', null, true),
  ('manufacturing', null, true),
  ('quality', null, true);

-- Add index for faster queries
CREATE INDEX idx_directory_templates_department ON directory_templates(department);