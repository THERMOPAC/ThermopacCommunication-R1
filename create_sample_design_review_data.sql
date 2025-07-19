-- Create sample data for Design Review & Approval system testing
-- This will populate the existing design review tables with realistic test data

-- First, let's make sure we have some projects and drawings to work with
INSERT INTO design_projects (project_id, design_project_name, design_project_code, design_lead_id, design_phase, target_completion_date, status, created_by)
VALUES 
(8, 'Thermal Power Plant Design', 'TPP-2025', 3, 'Detailed Design', '2025-12-31', 'Active', 3),
(9, 'Chemical Processing Unit', 'CPU-2025', 3, 'Concept Design', '2025-10-31', 'Active', 3),
(10, 'Waste Heat Recovery System', 'WHRS-2025', 3, 'Basic Engineering', '2025-09-30', 'Active', 3)
ON CONFLICT (project_id) DO NOTHING;

-- Insert sample design drawings
INSERT INTO design_drawings (design_project_id, drawing_number, drawing_title, category, discipline_code, description, status, current_revision, created_by)
VALUES 
(1, 'TPP-P&ID-001', 'Main Process Flow Diagram', 'Process', 'P&ID', 'Primary thermal cycle P&ID showing main steam flow', 'Under Review', 'Rev-A', 3),
(1, 'TPP-EL-001', 'Equipment Layout - Boiler House', 'Layout', 'Equipment_Layout', 'General arrangement drawing of boiler house equipment', 'In Progress', 'Rev-0', 3),
(1, 'TPP-PIP-001', 'Main Steam Piping Isometric', 'Piping', 'Piping', 'Isometric drawing of main steam piping system', 'Approved', 'Rev-B', 3),
(2, 'CPU-P&ID-001', 'Chemical Reactor Process Flow', 'Process', 'P&ID', 'Chemical reactor process flow with instrumentation', 'Draft', 'Rev-0', 3),
(2, 'CPU-ELC-001', 'Electrical Single Line Diagram', 'Electrical', 'Electrical', 'Main electrical distribution system', 'Under Review', 'Rev-A', 3),
(3, 'WHRS-CIV-001', 'Foundation Layout Plan', 'Civil', 'Civil', 'Foundation layout for heat exchanger units', 'In Progress', 'Rev-0', 3)
ON CONFLICT (drawing_number) DO NOTHING;

-- Insert sample design reviews
INSERT INTO design_reviews (drawing_id, version_id, review_type, review_stage, review_title, reviewer_id, reviewer_role, status, priority, review_comments, requested_date, due_date, created_by)
VALUES 
-- High priority reviews
(1, NULL, 'Design Review', 'Preliminary Design Review', 'PDR - Main Process Flow Review', 8, 'Lead Engineer', 'In Progress', 'High', 'Critical safety review for main thermal cycle', '2025-07-19', '2025-07-25', 3),
(2, NULL, 'Technical Review', 'Detailed Design Review', 'DDR - Boiler House Layout', 9, 'Project Manager', 'Pending', 'High', 'Space optimization and access requirements review', '2025-07-19', '2025-07-22', 3),
(5, NULL, 'Safety Review', 'HAZOP Review', 'HAZOP - Electrical Distribution Safety', 10, 'Safety Engineer', 'Under Review', 'High', 'Electrical safety and hazard analysis', '2025-07-18', '2025-07-24', 3),

-- Medium priority reviews  
(3, NULL, 'Technical Review', 'Final Design Review', 'FDR - Steam Piping Systems', 11, 'Senior Engineer', 'Approved', 'Medium', 'Piping stress analysis and support design review', '2025-07-15', '2025-07-20', 3),
(4, NULL, 'Design Review', 'Preliminary Design Review', 'PDR - Chemical Reactor Design', 15, 'Process Engineer', 'Pending', 'Medium', 'Process parameters and control strategy review', '2025-07-19', '2025-07-26', 3),

-- Low priority reviews
(6, NULL, 'Technical Review', 'Basic Design Review', 'BDR - Foundation Design', 19, 'Structural Engineer', 'In Progress', 'Low', 'Structural loads and foundation sizing review', '2025-07-17', '2025-07-30', 3)
ON CONFLICT (id) DO NOTHING;

-- Insert sample review comments
INSERT INTO review_comments (review_id, comment_number, comment_type, discipline, comment, location, category, designer_response, resolution_status, raised_date, target_resolution_date, assigned_to_id, created_by)
VALUES 
-- Comments for Review ID 1 (PDR - Main Process Flow Review)
(1, 1, 'Technical', 'P&ID', 'Steam pressure rating needs verification against ASME standards', 'Main steam header', 'Design', 'Will verify and update per ASME B31.1', 'Open', '2025-07-19', '2025-07-23', 8, 8),
(1, 2, 'Safety', 'P&ID', 'Emergency shutdown valve location requires HAZOP review', 'Emergency systems', 'Safety', 'HAZOP review scheduled for next week', 'In Progress', '2025-07-19', '2025-07-25', 10, 8),
(1, 3, 'General', 'P&ID', 'Legend symbols need standardization per company standards', 'Drawing legend', 'Documentation', NULL, 'Open', '2025-07-19', '2025-07-24', 3, 8),

-- Comments for Review ID 2 (DDR - Boiler House Layout)
(2, 1, 'Technical', 'Equipment_Layout', 'Maintenance access clearance insufficient for boiler inspection', 'Boiler maintenance area', 'Design', NULL, 'Open', '2025-07-19', '2025-07-22', 9, 9),
(2, 2, 'Technical', 'Equipment_Layout', 'Crane capacity and coverage needs verification', 'Overhead crane area', 'Equipment', NULL, 'Open', '2025-07-19', '2025-07-23', 11, 9),

-- Comments for Review ID 3 (HAZOP - Electrical Distribution Safety)  
(3, 1, 'Safety', 'Electrical', 'Arc flash analysis required for main switchboard', 'Main electrical room', 'Safety', 'Arc flash study in progress', 'In Progress', '2025-07-18', '2025-07-24', 15, 10),
(3, 2, 'Technical', 'Electrical', 'Ground fault protection settings need coordination study', 'Protection systems', 'Design', NULL, 'Open', '2025-07-18', '2025-07-25', 8, 10),

-- Comments for Review ID 6 (BDR - Foundation Design)
(6, 1, 'Technical', 'Civil', 'Soil bearing capacity report missing from design basis', 'Foundation design section', 'Documentation', 'Geotechnical report under review', 'In Progress', '2025-07-17', '2025-07-28', 19, 19),
(6, 2, 'Technical', 'Civil', 'Seismic design criteria needs clarification', 'Structural analysis', 'Design', NULL, 'Open', '2025-07-17', '2025-07-30', 11, 19)
ON CONFLICT (review_id, comment_number) DO NOTHING;

-- Update some reviews with completion data
UPDATE design_reviews 
SET 
  status = 'Approved',
  started_date = '2025-07-15 10:00:00',
  completed_date = '2025-07-20 16:30:00',
  recommendation = 'Approved with minor revisions. Address piping stress analysis comments and proceed to construction.'
WHERE id = (SELECT id FROM design_reviews WHERE review_title LIKE '%Steam Piping Systems%' LIMIT 1);

-- Set some reviews as started
UPDATE design_reviews 
SET 
  status = 'In Progress',
  started_date = '2025-07-18 09:00:00'
WHERE status = 'In Progress';

-- Add some markup file URLs (simulated)
UPDATE design_reviews 
SET markup_file_url = 'QMS/Design_Documents/TPP-2025/Reviews/Review_' || id || '_Markup.pdf'
WHERE id IN (1, 2, 3);

COMMIT;

-- Display summary of created data
SELECT 'Design Reviews Created:' as summary, COUNT(*) as count FROM design_reviews
UNION ALL
SELECT 'Review Comments Created:' as summary, COUNT(*) as count FROM review_comments
UNION ALL  
SELECT 'Design Drawings Available:' as summary, COUNT(*) as count FROM design_drawings;