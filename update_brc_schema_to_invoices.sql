-- Update BRC table to link to invoices instead of payments
-- Add export tracking fields to invoices

-- First, add export tracking fields to invoices table
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS is_export BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS export_destination_country VARCHAR(100),
ADD COLUMN IF NOT EXISTS export_port VARCHAR(100),
ADD COLUMN IF NOT EXISTS shipping_bill_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS shipping_bill_date DATE,
ADD COLUMN IF NOT EXISTS brc_required BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS brc_received BOOLEAN DEFAULT FALSE;

-- Update BRC table to reference invoices instead of payments
ALTER TABLE bank_realization_certificates 
DROP CONSTRAINT IF EXISTS bank_realization_certificates_related_payment_id_fkey;

ALTER TABLE bank_realization_certificates 
ADD COLUMN IF NOT EXISTS related_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_invoices_export ON invoices(is_export) WHERE is_export = TRUE;
CREATE INDEX IF NOT EXISTS idx_invoices_brc_required ON invoices(brc_required) WHERE brc_required = TRUE;
CREATE INDEX IF NOT EXISTS idx_brc_invoice ON bank_realization_certificates(related_invoice_id);

-- Update existing BRC records to link to invoices (if any exist)
-- This finds the invoice related to the payment and updates the BRC
UPDATE bank_realization_certificates 
SET related_invoice_id = (
  SELECT DISTINCT pil.invoice_id 
  FROM payment_invoice_links pil 
  WHERE pil.payment_id = bank_realization_certificates.related_payment_id
  LIMIT 1
)
WHERE related_payment_id IS NOT NULL 
AND related_invoice_id IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN invoices.is_export IS 'Indicates if this invoice is for export transaction';
COMMENT ON COLUMN invoices.brc_required IS 'Indicates if Bank Realization Certificate is required for this export invoice';
COMMENT ON COLUMN invoices.brc_received IS 'Indicates if BRC has been received for this export invoice';
COMMENT ON COLUMN bank_realization_certificates.related_invoice_id IS 'References the export invoice for which BRC is issued';