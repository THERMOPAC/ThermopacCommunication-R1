-- Add credit note fields to the invoices table

ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS credit_note_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS credit_note_date DATE,
ADD COLUMN IF NOT EXISTS credit_note_amount DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS credit_note_reason TEXT,
ADD COLUMN IF NOT EXISTS credited_by INTEGER,
ADD COLUMN IF NOT EXISTS credited_at TIMESTAMP;

-- Add foreign key constraint for credited_by
ALTER TABLE invoices 
ADD CONSTRAINT fk_invoices_credited_by 
FOREIGN KEY (credited_by) REFERENCES users(id);

-- Add comments to explain the purpose of these columns
COMMENT ON COLUMN invoices.credit_note_number IS 'Credit note number issued for this invoice';
COMMENT ON COLUMN invoices.credit_note_date IS 'Date when credit note was issued';
COMMENT ON COLUMN invoices.credit_note_amount IS 'Amount of credit note issued';
COMMENT ON COLUMN invoices.credit_note_reason IS 'Reason for issuing credit note';
COMMENT ON COLUMN invoices.credited_by IS 'User who issued the credit note';
COMMENT ON COLUMN invoices.credited_at IS 'Timestamp when credit note was issued';