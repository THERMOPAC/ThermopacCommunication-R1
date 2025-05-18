-- Rename fields in payments table to be consistent with UI changes

-- First, check if the columns already exist to avoid errors
DO $$
BEGIN
    -- Check if sap_invoice_no column exists but sap_payment_no doesn't
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'payments' AND column_name = 'sap_invoice_no'
    ) AND NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'payments' AND column_name = 'sap_payment_no'
    ) THEN
        -- Rename sap_invoice_no to sap_payment_no
        ALTER TABLE payments RENAME COLUMN sap_invoice_no TO sap_payment_no;
    END IF;

    -- Check if invoice_type column exists but payment_type doesn't
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'payments' AND column_name = 'invoice_type'
    ) AND NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'payments' AND column_name = 'payment_type'
    ) THEN
        -- Rename invoice_type to payment_type
        ALTER TABLE payments RENAME COLUMN invoice_type TO payment_type;
    END IF;
END $$;

-- Add comment to explain the purpose of these columns
COMMENT ON COLUMN payments.sap_payment_no IS 'SAP Payment number reference for the payment';
COMMENT ON COLUMN payments.payment_type IS 'Type of payment - Product or Service';