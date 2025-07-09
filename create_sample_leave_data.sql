-- Insert sample leave types
INSERT INTO leave_types (name, code, description, max_days_per_year, carryover_allowed, max_carryover_days, is_paid, requires_approval, notice_days_required, can_be_half_day, color_code, is_active) VALUES
('Annual Leave', 'AL', 'Regular paid vacation days', '21', true, '5', true, true, 3, true, '#3B82F6', true),
('Sick Leave', 'SL', 'Medical/health related leave', '12', false, '0', true, false, 0, true, '#EF4444', true),
('Casual Leave', 'CL', 'Short-term casual leave', '7', false, '0', true, true, 1, true, '#10B981', true),
('Maternity Leave', 'ML', 'Maternity leave for mothers', '180', false, '0', true, true, 30, false, '#EC4899', true),
('Paternity Leave', 'PL', 'Paternity leave for fathers', '7', false, '0', true, true, 7, false, '#8B5CF6', true),
('Emergency Leave', 'EL', 'Emergency situations', '3', false, '0', true, true, 0, true, '#F59E0B', true),
('Study Leave', 'ST', 'Educational/training purposes', '5', false, '0', false, true, 15, false, '#06B6D4', true),
('Bereavement Leave', 'BL', 'Death in family', '5', false, '0', true, true, 0, false, '#6B7280', true)
ON CONFLICT (code) DO NOTHING;

-- Insert sample company holidays for 2025
INSERT INTO company_holidays (name, date, description, is_optional, created_by) VALUES
('New Year''s Day', '2025-01-01', 'New Year celebration', false, 3),
('Republic Day', '2025-01-26', 'India Republic Day', false, 3),
('Holi', '2025-03-14', 'Festival of Colors', false, 3),
('Good Friday', '2025-04-18', 'Christian holiday', false, 3),
('Independence Day', '2025-08-15', 'India Independence Day', false, 3),
('Gandhi Jayanti', '2025-10-02', 'Mahatma Gandhi''s Birthday', false, 3),
('Diwali', '2025-10-20', 'Festival of Lights', false, 3),
('Christmas Day', '2025-12-25', 'Christmas celebration', false, 3),
('Eid al-Fitr', '2025-04-10', 'End of Ramadan', true, 3),
('Eid al-Adha', '2025-06-17', 'Festival of Sacrifice', true, 3),
('Dussehra', '2025-10-12', 'Victory of good over evil', true, 3),
('Karva Chauth', '2025-11-01', 'Traditional Hindu festival', true, 3)
ON CONFLICT (date, name) DO NOTHING;

-- Create default leave policy
INSERT INTO leave_policies (policy_name, policy_description, carry_forward_limit, encashment_allowed, max_encashment_days, minimum_notice_period, maximum_continuous_days, weekend_included, holiday_included, proration_method, is_active, created_by) VALUES
('Standard Leave Policy', 'Default company leave policy for all employees', 5, true, 10, 3, 30, false, false, 'monthly', true, 3)
ON CONFLICT (policy_name) DO NOTHING;

-- Initialize leave balances for existing users (for current year)
INSERT INTO leave_balances (user_id, leave_type_id, year, allocated_days, used_days, pending_days, carryover_days, updated_by)
SELECT 
    u.id as user_id,
    lt.id as leave_type_id,
    2025 as year,
    lt.max_days_per_year as allocated_days,
    '0' as used_days,
    '0' as pending_days,
    '0' as carryover_days,
    3 as updated_by
FROM users u
CROSS JOIN leave_types lt
WHERE u.is_active = true 
AND lt.is_active = true
AND NOT EXISTS (
    SELECT 1 FROM leave_balances lb 
    WHERE lb.user_id = u.id 
    AND lb.leave_type_id = lt.id 
    AND lb.year = 2025
);

-- Insert sample leave requests
INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, total_days, is_half_day, half_day_period, reason, status, applied_date, emergency_contact, work_handover_notes) VALUES
(3, 1, '2025-07-15', '2025-07-17', '3', false, null, 'Family vacation trip to Goa', 'pending', CURRENT_TIMESTAMP, '+91-9821137879', 'Tasks delegated to team members, will check emails twice daily'),
(3, 2, '2025-07-10', '2025-07-10', '1', true, 'morning', 'Doctor appointment for routine checkup', 'approved', CURRENT_TIMESTAMP - INTERVAL '2 days', null, null),
(4, 1, '2025-08-01', '2025-08-05', '5', false, null, 'Wedding anniversary celebration', 'pending', CURRENT_TIMESTAMP - INTERVAL '1 day', '+91-9876543210', 'Project handover completed'),
(5, 3, '2025-07-12', '2025-07-12', '1', false, null, 'Personal work', 'approved', CURRENT_TIMESTAMP - INTERVAL '3 days', null, 'Daily tasks covered by colleague')
ON CONFLICT DO NOTHING;