-- Add sap_invoice_no and invoice_type fields to the payments table

-- First, check if the columns already exist to avoid errors
DO $$
BEGIN
    -- Check if sap_invoice_no column exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'payments' AND column_name = 'sap_invoice_no'
    ) THEN
        ALTER TABLE payments ADD COLUMN sap_invoice_no VARCHAR(100);
    END IF;

    -- Check if invoice_type column exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'payments' AND column_name = 'invoice_type'
    ) THEN
        ALTER TABLE payments ADD COLUMN invoice_type VARCHAR(20) DEFAULT 'Product';
    END IF;
END $$;

-- Add comment to explain the purpose of these columns
COMMENT ON COLUMN payments.sap_invoice_no IS 'SAP Invoice number reference for the payment';
COMMENT ON COLUMN payments.invoice_type IS 'Type of invoice - Product or Service';

-- Update existing payments to have a default value for invoice_type
UPDATE payments SET invoice_type = 'Product' WHERE invoice_type IS NULL;