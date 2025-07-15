-- SAP B1 Purchase Module Database Schema
-- This script creates tables for SAP B1 Purchase module integration

-- Purchase Orders table
CREATE TABLE IF NOT EXISTS sap_purchase_orders (
    id SERIAL PRIMARY KEY,
    doc_entry INTEGER UNIQUE NOT NULL, -- SAP B1 Document Entry (Primary Key in SAP)
    doc_num VARCHAR(50) NOT NULL,      -- SAP B1 Document Number
    doc_type VARCHAR(10) DEFAULT 'PO', -- Document Type (PO = Purchase Order)
    series INTEGER,                    -- Document Series
    doc_date DATE NOT NULL,            -- Document Date
    doc_due_date DATE,                 -- Due Date
    tax_date DATE,                     -- Tax Date
    
    -- Vendor Information
    vendor_code VARCHAR(50) NOT NULL,  -- Business Partner Code
    vendor_name VARCHAR(255),          -- Business Partner Name
    contact_person VARCHAR(100),       -- Contact Person
    
    -- Financial Information
    doc_total DECIMAL(15,2) DEFAULT 0,     -- Document Total
    vat_sum DECIMAL(15,2) DEFAULT 0,       -- VAT Sum
    doc_total_fc DECIMAL(15,2) DEFAULT 0,  -- Document Total Foreign Currency
    doc_currency VARCHAR(10) DEFAULT 'INR', -- Document Currency
    doc_rate DECIMAL(10,4) DEFAULT 1,      -- Exchange Rate
    
    -- Status Information
    doc_status VARCHAR(10) DEFAULT 'O',    -- Document Status (O=Open, C=Closed)
    cancelled VARCHAR(1) DEFAULT 'N',     -- Cancelled (Y/N)
    
    -- Additional Information
    comments TEXT,                     -- Comments
    reference_1 VARCHAR(100),          -- Reference 1
    reference_2 VARCHAR(100),          -- Reference 2
    project_code VARCHAR(50),          -- Project Code
    
    -- Sync Information
    sap_synced_at TIMESTAMP,           -- Last successful sync timestamp
    sap_last_modified TIMESTAMP,       -- Last modification in SAP B1
    sap_sync_status VARCHAR(20) DEFAULT 'pending', -- Sync status
    
    -- Audit Information
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER
);

-- Purchase Order Items table
CREATE TABLE IF NOT EXISTS sap_purchase_order_items (
    id SERIAL PRIMARY KEY,
    doc_entry INTEGER NOT NULL,        -- Reference to Purchase Order
    line_num INTEGER NOT NULL,         -- Line Number
    
    -- Item Information
    item_code VARCHAR(50) NOT NULL,    -- Item Code
    item_description VARCHAR(255),     -- Item Description
    
    -- Quantity and Pricing
    quantity DECIMAL(15,4) DEFAULT 0,     -- Quantity
    open_qty DECIMAL(15,4) DEFAULT 0,     -- Open Quantity
    unit_price DECIMAL(15,4) DEFAULT 0,   -- Unit Price
    price_after_vat DECIMAL(15,4) DEFAULT 0, -- Price After VAT
    line_total DECIMAL(15,2) DEFAULT 0,   -- Line Total
    
    -- Tax Information
    tax_code VARCHAR(20),              -- Tax Code
    tax_rate DECIMAL(5,2) DEFAULT 0,   -- Tax Rate
    tax_sum DECIMAL(15,2) DEFAULT 0,   -- Tax Sum
    
    -- Warehouse Information
    warehouse_code VARCHAR(20),        -- Warehouse Code
    
    -- Additional Information
    uom VARCHAR(20),                   -- Unit of Measure
    uom_code VARCHAR(20),              -- UOM Code
    cost_center VARCHAR(50),           -- Cost Center
    project_code VARCHAR(50),          -- Project Code
    
    -- Delivery Information
    ship_date DATE,                    -- Ship Date
    delivery_date DATE,                -- Delivery Date
    
    -- Sync Information
    sap_synced_at TIMESTAMP,           -- Last successful sync timestamp
    sap_last_modified TIMESTAMP,       -- Last modification in SAP B1
    sap_sync_status VARCHAR(20) DEFAULT 'pending', -- Sync status
    
    -- Audit Information
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (doc_entry) REFERENCES sap_purchase_orders(doc_entry) ON DELETE CASCADE
);

-- Purchase Requisitions table
CREATE TABLE IF NOT EXISTS sap_purchase_requisitions (
    id SERIAL PRIMARY KEY,
    doc_entry INTEGER UNIQUE NOT NULL, -- SAP B1 Document Entry
    doc_num VARCHAR(50) NOT NULL,      -- SAP B1 Document Number
    doc_type VARCHAR(10) DEFAULT 'PR', -- Document Type (PR = Purchase Requisition)
    series INTEGER,                    -- Document Series
    doc_date DATE NOT NULL,            -- Document Date
    due_date DATE,                     -- Due Date
    
    -- Requester Information
    requester_code VARCHAR(50),        -- Requester Code
    requester_name VARCHAR(255),       -- Requester Name
    
    -- Status Information
    doc_status VARCHAR(10) DEFAULT 'O',    -- Document Status (O=Open, C=Closed)
    priority VARCHAR(10) DEFAULT 'Normal', -- Priority (High, Normal, Low)
    
    -- Additional Information
    comments TEXT,                     -- Comments
    reference_1 VARCHAR(100),          -- Reference 1
    department VARCHAR(50),            -- Department
    
    -- Sync Information
    sap_synced_at TIMESTAMP,           -- Last successful sync timestamp
    sap_last_modified TIMESTAMP,       -- Last modification in SAP B1
    sap_sync_status VARCHAR(20) DEFAULT 'pending', -- Sync status
    
    -- Audit Information
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER
);

-- Goods Receipt PO table
CREATE TABLE IF NOT EXISTS sap_goods_receipt_po (
    id SERIAL PRIMARY KEY,
    doc_entry INTEGER UNIQUE NOT NULL, -- SAP B1 Document Entry
    doc_num VARCHAR(50) NOT NULL,      -- SAP B1 Document Number
    doc_type VARCHAR(10) DEFAULT 'GR', -- Document Type (GR = Goods Receipt)
    series INTEGER,                    -- Document Series
    doc_date DATE NOT NULL,            -- Document Date
    posting_date DATE,                 -- Posting Date
    
    -- Vendor Information
    vendor_code VARCHAR(50) NOT NULL,  -- Business Partner Code
    vendor_name VARCHAR(255),          -- Business Partner Name
    
    -- Reference Information
    base_doc_type VARCHAR(10),         -- Base Document Type
    base_doc_entry INTEGER,            -- Base Document Entry (PO)
    base_doc_num VARCHAR(50),          -- Base Document Number
    
    -- Financial Information
    doc_total DECIMAL(15,2) DEFAULT 0,     -- Document Total
    vat_sum DECIMAL(15,2) DEFAULT 0,       -- VAT Sum
    doc_currency VARCHAR(10) DEFAULT 'INR', -- Document Currency
    
    -- Status Information
    doc_status VARCHAR(10) DEFAULT 'O',    -- Document Status
    cancelled VARCHAR(1) DEFAULT 'N',     -- Cancelled (Y/N)
    
    -- Additional Information
    comments TEXT,                     -- Comments
    reference_1 VARCHAR(100),          -- Reference 1
    
    -- Sync Information
    sap_synced_at TIMESTAMP,           -- Last successful sync timestamp
    sap_last_modified TIMESTAMP,       -- Last modification in SAP B1
    sap_sync_status VARCHAR(20) DEFAULT 'pending', -- Sync status
    
    -- Audit Information
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER
);

-- Purchase Invoices table
CREATE TABLE IF NOT EXISTS sap_purchase_invoices (
    id SERIAL PRIMARY KEY,
    doc_entry INTEGER UNIQUE NOT NULL, -- SAP B1 Document Entry
    doc_num VARCHAR(50) NOT NULL,      -- SAP B1 Document Number
    doc_type VARCHAR(10) DEFAULT 'PI', -- Document Type (PI = Purchase Invoice)
    series INTEGER,                    -- Document Series
    doc_date DATE NOT NULL,            -- Document Date
    doc_due_date DATE,                 -- Due Date
    tax_date DATE,                     -- Tax Date
    
    -- Vendor Information
    vendor_code VARCHAR(50) NOT NULL,  -- Business Partner Code
    vendor_name VARCHAR(255),          -- Business Partner Name
    
    -- Reference Information
    base_doc_type VARCHAR(10),         -- Base Document Type
    base_doc_entry INTEGER,            -- Base Document Entry (PO/GR)
    base_doc_num VARCHAR(50),          -- Base Document Number
    
    -- Financial Information
    doc_total DECIMAL(15,2) DEFAULT 0,     -- Document Total
    vat_sum DECIMAL(15,2) DEFAULT 0,       -- VAT Sum
    paid_sum DECIMAL(15,2) DEFAULT 0,      -- Paid Sum
    doc_total_fc DECIMAL(15,2) DEFAULT 0,  -- Document Total Foreign Currency
    doc_currency VARCHAR(10) DEFAULT 'INR', -- Document Currency
    doc_rate DECIMAL(10,4) DEFAULT 1,      -- Exchange Rate
    
    -- Status Information
    doc_status VARCHAR(10) DEFAULT 'O',    -- Document Status
    cancelled VARCHAR(1) DEFAULT 'N',     -- Cancelled (Y/N)
    
    -- Additional Information
    comments TEXT,                     -- Comments
    reference_1 VARCHAR(100),          -- Reference 1
    reference_2 VARCHAR(100),          -- Reference 2
    
    -- Sync Information
    sap_synced_at TIMESTAMP,           -- Last successful sync timestamp
    sap_last_modified TIMESTAMP,       -- Last modification in SAP B1
    sap_sync_status VARCHAR(20) DEFAULT 'pending', -- Sync status
    
    -- Audit Information
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sap_purchase_orders_doc_entry ON sap_purchase_orders(doc_entry);
CREATE INDEX IF NOT EXISTS idx_sap_purchase_orders_vendor_code ON sap_purchase_orders(vendor_code);
CREATE INDEX IF NOT EXISTS idx_sap_purchase_orders_doc_date ON sap_purchase_orders(doc_date);
CREATE INDEX IF NOT EXISTS idx_sap_purchase_orders_sync_status ON sap_purchase_orders(sap_sync_status);
CREATE INDEX IF NOT EXISTS idx_sap_purchase_orders_doc_status ON sap_purchase_orders(doc_status);

CREATE INDEX IF NOT EXISTS idx_sap_purchase_order_items_doc_entry ON sap_purchase_order_items(doc_entry);
CREATE INDEX IF NOT EXISTS idx_sap_purchase_order_items_item_code ON sap_purchase_order_items(item_code);
CREATE INDEX IF NOT EXISTS idx_sap_purchase_order_items_sync_status ON sap_purchase_order_items(sap_sync_status);

CREATE INDEX IF NOT EXISTS idx_sap_purchase_requisitions_doc_entry ON sap_purchase_requisitions(doc_entry);
CREATE INDEX IF NOT EXISTS idx_sap_purchase_requisitions_requester_code ON sap_purchase_requisitions(requester_code);
CREATE INDEX IF NOT EXISTS idx_sap_purchase_requisitions_sync_status ON sap_purchase_requisitions(sap_sync_status);

CREATE INDEX IF NOT EXISTS idx_sap_goods_receipt_po_doc_entry ON sap_goods_receipt_po(doc_entry);
CREATE INDEX IF NOT EXISTS idx_sap_goods_receipt_po_vendor_code ON sap_goods_receipt_po(vendor_code);
CREATE INDEX IF NOT EXISTS idx_sap_goods_receipt_po_base_doc_entry ON sap_goods_receipt_po(base_doc_entry);
CREATE INDEX IF NOT EXISTS idx_sap_goods_receipt_po_sync_status ON sap_goods_receipt_po(sap_sync_status);

CREATE INDEX IF NOT EXISTS idx_sap_purchase_invoices_doc_entry ON sap_purchase_invoices(doc_entry);
CREATE INDEX IF NOT EXISTS idx_sap_purchase_invoices_vendor_code ON sap_purchase_invoices(vendor_code);
CREATE INDEX IF NOT EXISTS idx_sap_purchase_invoices_base_doc_entry ON sap_purchase_invoices(base_doc_entry);
CREATE INDEX IF NOT EXISTS idx_sap_purchase_invoices_sync_status ON sap_purchase_invoices(sap_sync_status);

-- Add comments to tables
COMMENT ON TABLE sap_purchase_orders IS 'SAP B1 Purchase Orders synchronized from SAP Business One';
COMMENT ON TABLE sap_purchase_order_items IS 'SAP B1 Purchase Order line items';
COMMENT ON TABLE sap_purchase_requisitions IS 'SAP B1 Purchase Requisitions';
COMMENT ON TABLE sap_goods_receipt_po IS 'SAP B1 Goods Receipt PO documents';
COMMENT ON TABLE sap_purchase_invoices IS 'SAP B1 Purchase Invoices';

-- Add column comments for key fields
COMMENT ON COLUMN sap_purchase_orders.doc_entry IS 'SAP B1 Document Entry - Primary Key in SAP';
COMMENT ON COLUMN sap_purchase_orders.doc_num IS 'SAP B1 Document Number - User-visible number';
COMMENT ON COLUMN sap_purchase_orders.vendor_code IS 'Business Partner Code from SAP B1';
COMMENT ON COLUMN sap_purchase_orders.doc_status IS 'Document Status: O=Open, C=Closed';
COMMENT ON COLUMN sap_purchase_orders.sap_sync_status IS 'Sync Status: pending, synced, error';