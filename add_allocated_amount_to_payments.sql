-- Add allocated_amount column to payments table 
ALTER TABLE payments 
ADD COLUMN allocated_amount DECIMAL(15, 2) DEFAULT 0.00 NOT NULL;

-- Update existing payments to calculate allocated_amount as (amount - unallocated_amount)
UPDATE payments 
SET allocated_amount = (amount::DECIMAL - unallocated_amount::DECIMAL)
WHERE 1=1;

-- Add a check constraint to ensure data integrity
ALTER TABLE payments 
ADD CONSTRAINT check_payment_amounts CHECK (
  allocated_amount::DECIMAL + unallocated_amount::DECIMAL = amount::DECIMAL
);

-- Add an index for performance on queries that filter by allocation status
CREATE INDEX idx_payment_allocation_status ON payments (allocated_amount, unallocated_amount);

-- Comment explaining the relationship
COMMENT ON COLUMN payments.allocated_amount IS 'Amount that has been allocated to invoices. Formula: amount = allocated_amount + unallocated_amount';