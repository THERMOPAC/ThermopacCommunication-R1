-- Add is_advance_payment and customer_id fields to payments table
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS is_advance_payment BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS customer_id INTEGER;

-- Add comment to document the purpose of these fields
COMMENT ON COLUMN payments.is_advance_payment IS 'Flag to indicate if this is an advance payment not linked to any invoice';
COMMENT ON COLUMN payments.customer_id IS 'Customer ID for advance payments or for reference';