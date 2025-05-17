-- Add outstanding_amount field to invoices table
ALTER TABLE invoices ADD COLUMN outstanding_amount DECIMAL(15, 2);

-- Update existing invoices to initialize the outstanding_amount
-- Set outstanding_amount equal to total_amount initially
-- This assumes no payments have been applied yet
UPDATE invoices SET outstanding_amount = total_amount WHERE outstanding_amount IS NULL;

-- Add unallocated_amount field to payments table
ALTER TABLE payments ADD COLUMN unallocated_amount DECIMAL(15, 2);

-- Update existing payments to initialize the unallocated_amount
-- Set unallocated_amount equal to amount initially
-- This assumes no allocations have been made yet
UPDATE payments SET unallocated_amount = amount WHERE unallocated_amount IS NULL;

-- Create payment_allocations table to track invoice-payment relationships
CREATE TABLE payment_allocations (
  id SERIAL PRIMARY KEY,
  payment_id INTEGER NOT NULL,
  invoice_id INTEGER NOT NULL,
  amount_allocated DECIMAL(15, 2) NOT NULL,
  allocation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payment_id) REFERENCES payments(id),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Create an index for faster lookups
CREATE INDEX idx_payment_allocations_payment_id ON payment_allocations(payment_id);
CREATE INDEX idx_payment_allocations_invoice_id ON payment_allocations(invoice_id);

-- Add a constraint to ensure allocated amount is positive
ALTER TABLE payment_allocations ADD CONSTRAINT check_positive_allocation CHECK (amount_allocated > 0);