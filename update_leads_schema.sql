-- Remove employeeCount and annualRevenue fields from leads table
ALTER TABLE leads DROP COLUMN IF EXISTS employee_count;
ALTER TABLE leads DROP COLUMN IF EXISTS annual_revenue;

-- Add currency and expectedRevenue fields to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS currency VARCHAR(10);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS expected_revenue DECIMAL(15, 2);