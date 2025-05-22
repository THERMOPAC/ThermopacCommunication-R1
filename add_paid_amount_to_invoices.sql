-- Add paid_amount column to invoices table
-- This will track how much has been paid against each invoice

ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(15,2) DEFAULT 0;

-- Update existing invoices to calculate paid_amount from payment_invoice_links
UPDATE invoices 
SET paid_amount = COALESCE((
    SELECT SUM(amount_applied) 
    FROM payment_invoice_links 
    WHERE invoice_id = invoices.id
), 0);

-- Add a comment to document the column
COMMENT ON COLUMN invoices.paid_amount IS 'Total amount paid against this invoice from all allocations';