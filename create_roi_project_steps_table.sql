-- Create ROI Project Steps table for saving step-by-step progress
CREATE TABLE roi_project_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roi_project_id UUID NOT NULL,
  step_number INT NOT NULL,
  step_data JSONB NOT NULL,
  updated_by INT NOT NULL REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (roi_project_id, step_number)
);

-- Create index for faster lookups
CREATE INDEX idx_roi_project_steps_project_id ON roi_project_steps(roi_project_id);
CREATE INDEX idx_roi_project_steps_step_number ON roi_project_steps(step_number);

-- Insert initial test data
INSERT INTO roi_project_steps (roi_project_id, step_number, step_data, updated_by) VALUES
('550e8400-e29b-41d4-a716-446655440000', 1, '{"capacity": "2000", "currency": "USD", "customerName": "Test Customer", "projectName": "Test Project"}', 3),
('550e8400-e29b-41d4-a716-446655440000', 2, '{"tanks": [{"capacity": 100, "quantity": 2, "unitPrice": 27800}]}', 3);