-- Enhanced GST Tracking Fields for Purchase Order Items
-- This migration adds comprehensive line-level GST tracking capabilities

-- Add GST-specific fields to Purchase Order Items table
ALTER TABLE sap_purchase_order_items ADD COLUMN IF NOT EXISTS gst_type VARCHAR(20) DEFAULT 'IGST';
ALTER TABLE sap_purchase_order_items ADD COLUMN IF NOT EXISTS gst_treatment VARCHAR(30) DEFAULT 'taxable';
ALTER TABLE sap_purchase_order_items ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(50);
ALTER TABLE sap_purchase_order_items ADD COLUMN IF NOT EXISTS vendor_state VARCHAR(50);
ALTER TABLE sap_purchase_order_items ADD COLUMN IF NOT EXISTS buyer_state VARCHAR(50);

-- CGST (Central GST) fields
ALTER TABLE sap_purchase_order_items ADD COLUMN IF NOT EXISTS cgst_rate DECIMAL(5,2) DEFAULT 0;
ALTER TABLE sap_purchase_order_items ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(15,2) DEFAULT 0;

-- SGST (State GST) fields  
ALTER TABLE sap_purchase_order_items ADD COLUMN IF NOT EXISTS sgst_rate DECIMAL(5,2) DEFAULT 0;
ALTER TABLE sap_purchase_order_items ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(15,2) DEFAULT 0;

-- IGST (Integrated GST) fields
ALTER TABLE sap_purchase_order_items ADD COLUMN IF NOT EXISTS igst_rate DECIMAL(5,2) DEFAULT 0;
ALTER TABLE sap_purchase_order_items ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(15,2) DEFAULT 0;

-- Total GST amount (sum of all GST components)
ALTER TABLE sap_purchase_order_items ADD COLUMN IF NOT EXISTS total_gst_amount DECIMAL(15,2) DEFAULT 0;

-- Input Tax Credit eligibility
ALTER TABLE sap_purchase_order_items ADD COLUMN IF NOT EXISTS itc_eligible BOOLEAN DEFAULT true;
ALTER TABLE sap_purchase_order_items ADD COLUMN IF NOT EXISTS itc_claim_amount DECIMAL(15,2) DEFAULT 0;

-- CapEx/OpEx classification (for GST segregation from asset/operational calculations)
ALTER TABLE sap_purchase_order_items ADD COLUMN IF NOT EXISTS expenditure_type VARCHAR(20) DEFAULT 'OpEx';
ALTER TABLE sap_purchase_order_items ADD COLUMN IF NOT EXISTS line_total_before_gst DECIMAL(15,2) DEFAULT 0;
ALTER TABLE sap_purchase_order_items ADD COLUMN IF NOT EXISTS line_total_after_gst DECIMAL(15,2) DEFAULT 0;

-- HSN/SAC Code for GST compliance
ALTER TABLE sap_purchase_order_items ADD COLUMN IF NOT EXISTS hsn_sac_code VARCHAR(20);
ALTER TABLE sap_purchase_order_items ADD COLUMN IF NOT EXISTS commodity_description VARCHAR(255);

-- Financial Year tracking for annual GST reporting
ALTER TABLE sap_purchase_order_items ADD COLUMN IF NOT EXISTS financial_year VARCHAR(20);

-- Add indexes for GST reporting queries
CREATE INDEX IF NOT EXISTS idx_sap_po_items_gst_type ON sap_purchase_order_items(gst_type);
CREATE INDEX IF NOT EXISTS idx_sap_po_items_financial_year ON sap_purchase_order_items(financial_year);
CREATE INDEX IF NOT EXISTS idx_sap_po_items_expenditure_type ON sap_purchase_order_items(expenditure_type);
CREATE INDEX IF NOT EXISTS idx_sap_po_items_itc_eligible ON sap_purchase_order_items(itc_eligible);
CREATE INDEX IF NOT EXISTS idx_sap_po_items_hsn_sac ON sap_purchase_order_items(hsn_sac_code);

-- Add column comments for GST fields
COMMENT ON COLUMN sap_purchase_order_items.gst_type IS 'Type of GST: IGST (Interstate), CGST+SGST (Intrastate)';
COMMENT ON COLUMN sap_purchase_order_items.gst_treatment IS 'GST Treatment: taxable, exempt, nil_rated, non_gst';
COMMENT ON COLUMN sap_purchase_order_items.cgst_rate IS 'Central GST rate in percentage';
COMMENT ON COLUMN sap_purchase_order_items.sgst_rate IS 'State GST rate in percentage';
COMMENT ON COLUMN sap_purchase_order_items.igst_rate IS 'Integrated GST rate in percentage';
COMMENT ON COLUMN sap_purchase_order_items.total_gst_amount IS 'Total GST amount (CGST + SGST + IGST)';
COMMENT ON COLUMN sap_purchase_order_items.itc_eligible IS 'Input Tax Credit eligibility flag';
COMMENT ON COLUMN sap_purchase_order_items.expenditure_type IS 'CapEx (Capital) or OpEx (Operational) expenditure classification';
COMMENT ON COLUMN sap_purchase_order_items.line_total_before_gst IS 'Line total excluding all GST components';
COMMENT ON COLUMN sap_purchase_order_items.line_total_after_gst IS 'Line total including all GST components';
COMMENT ON COLUMN sap_purchase_order_items.hsn_sac_code IS 'HSN (Goods) or SAC (Services) code for GST compliance';
COMMENT ON COLUMN sap_purchase_order_items.financial_year IS 'Indian Financial Year (FY2024-25) for annual GST reporting';

-- Add check constraints for data integrity
ALTER TABLE sap_purchase_order_items 
ADD CONSTRAINT chk_gst_type CHECK (gst_type IN ('IGST', 'CGST+SGST'));

ALTER TABLE sap_purchase_order_items 
ADD CONSTRAINT chk_gst_treatment CHECK (gst_treatment IN ('taxable', 'exempt', 'nil_rated', 'non_gst'));

ALTER TABLE sap_purchase_order_items 
ADD CONSTRAINT chk_expenditure_type CHECK (expenditure_type IN ('CapEx', 'OpEx'));

-- Add trigger to auto-calculate total GST amount
CREATE OR REPLACE FUNCTION calculate_total_gst_amount()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_gst_amount = COALESCE(NEW.cgst_amount, 0) + COALESCE(NEW.sgst_amount, 0) + COALESCE(NEW.igst_amount, 0);
    
    -- Calculate ITC claim amount (only if eligible)
    IF NEW.itc_eligible THEN
        NEW.itc_claim_amount = NEW.total_gst_amount;
    ELSE
        NEW.itc_claim_amount = 0;
    END IF;
    
    -- Auto-calculate line totals
    NEW.line_total_after_gst = COALESCE(NEW.line_total_before_gst, 0) + NEW.total_gst_amount;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_gst_amounts
    BEFORE INSERT OR UPDATE ON sap_purchase_order_items
    FOR EACH ROW
    EXECUTE FUNCTION calculate_total_gst_amount();

-- Sample view for GST reporting by financial year
CREATE OR REPLACE VIEW vw_gst_summary_by_fy AS
SELECT 
    financial_year,
    expenditure_type,
    gst_type,
    COUNT(*) as line_count,
    SUM(line_total_before_gst) as total_amount_before_gst,
    SUM(cgst_amount) as total_cgst,
    SUM(sgst_amount) as total_sgst, 
    SUM(igst_amount) as total_igst,
    SUM(total_gst_amount) as total_gst,
    SUM(CASE WHEN itc_eligible THEN itc_claim_amount ELSE 0 END) as total_itc_claim,
    SUM(line_total_after_gst) as total_amount_after_gst
FROM sap_purchase_order_items 
WHERE financial_year IS NOT NULL
GROUP BY financial_year, expenditure_type, gst_type
ORDER BY financial_year DESC, expenditure_type, gst_type;

COMMENT ON VIEW vw_gst_summary_by_fy IS 'GST summary by Financial Year for annual reporting and ITC claims';