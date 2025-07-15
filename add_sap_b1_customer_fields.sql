-- Add SAP B1 integration fields to customers table
-- This migration adds support for SAP Business One customer synchronization

-- Add SAP B1 specific fields to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sap_card_code TEXT UNIQUE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sap_card_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sap_card_type TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sap_phone1 TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sap_phone2 TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sap_fax TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sap_email TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sap_mail_address TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sap_mail_city TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sap_mail_country TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sap_mail_zip_code TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sap_currency TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sap_credit_line DECIMAL(15,2);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sap_balance DECIMAL(15,2);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sap_group_code INTEGER;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sap_license_number TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sap_vat_reg_number TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sap_synced_at TIMESTAMP;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sap_last_modified TIMESTAMP;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sap_sync_status TEXT DEFAULT 'pending';

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_customers_sap_card_code ON customers(sap_card_code);
CREATE INDEX IF NOT EXISTS idx_customers_sap_sync_status ON customers(sap_sync_status);
CREATE INDEX IF NOT EXISTS idx_customers_sap_synced_at ON customers(sap_synced_at);

-- Add comments for documentation
COMMENT ON COLUMN customers.sap_card_code IS 'SAP B1 Customer Card Code (Primary Key in SAP)';
COMMENT ON COLUMN customers.sap_card_name IS 'SAP B1 Customer Card Name';
COMMENT ON COLUMN customers.sap_card_type IS 'SAP B1 Customer Card Type (C=Customer, S=Supplier, L=Lead)';
COMMENT ON COLUMN customers.sap_sync_status IS 'SAP B1 synchronization status (pending, synced, error)';
COMMENT ON COLUMN customers.sap_synced_at IS 'Last successful synchronization timestamp';
COMMENT ON COLUMN customers.sap_last_modified IS 'Last modification timestamp in SAP B1';

-- Display success message
SELECT 'SAP B1 customer integration fields added successfully' as message;