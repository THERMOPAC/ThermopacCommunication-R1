-- Create the Welding Procedure Specification (WPS) table
CREATE TABLE IF NOT EXISTS wps_documents (
  id SERIAL PRIMARY KEY,
  "wpsId" VARCHAR(20) NOT NULL UNIQUE, -- Format: WPS-001, WPS-002, etc.
  "pqrId" VARCHAR(20) NOT NULL UNIQUE, -- Format: PQR-001, PQR-002, etc. (one-to-one relationship)
  "revisionNo" VARCHAR(10) NOT NULL DEFAULT '0',
  "welderProcess" VARCHAR(50) NOT NULL, -- SMAW, GTAW, FCAW, SAW
  "baseMetalGrade" VARCHAR(100) NOT NULL,
  "baseMetalThickness" VARCHAR(50) NOT NULL,
  "fillerMaterial" VARCHAR(100) NOT NULL,
  "jointType" VARCHAR(50) NOT NULL, -- Butt, Fillet, Corner, Lap, etc.
  "weldPosition" VARCHAR(50) NOT NULL, -- 1G, 2G, 3G, 4G, 5G, 6G
  "preheatingTemp" VARCHAR(50),
  "postWeldHeatTreatment" VARCHAR(100),
  "electricalParameters" JSONB, -- Current, voltage, etc.
  "shieldingGas" VARCHAR(100),
  "document_file_path" TEXT, -- Path to the document in GCS
  status VARCHAR(20) NOT NULL DEFAULT 'Pending Approval', -- Draft, Pending Approval, Approved, Obsolete
  "approvedBy" INTEGER REFERENCES users(id),
  "approvalDate" TIMESTAMP WITH TIME ZONE,
  remarks TEXT,
  "createdBy" INTEGER NOT NULL REFERENCES users(id),
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE
);

-- Create the Procedure Qualification Record (PQR) table
CREATE TABLE IF NOT EXISTS pqr_documents (
  id SERIAL PRIMARY KEY,
  "pqrId" VARCHAR(20) NOT NULL UNIQUE, -- Format: PQR-001, PQR-002, etc.
  "wpsId" VARCHAR(20) NOT NULL, -- Reference to WPS
  "testDate" DATE NOT NULL,
  "testLaboratory" VARCHAR(100) NOT NULL,
  "inspectionResults" JSONB NOT NULL, -- Details of tests performed
  "mechanicalTests" JSONB, -- Tensile, bend, impact tests
  "hardnessTests" JSONB,
  "qualifiedRanges" JSONB, -- Thickness, diameter, etc.
  "document_file_path" TEXT, -- Path to the document in GCS
  status VARCHAR(20) NOT NULL DEFAULT 'Pending Approval', -- Draft, Pending Approval, Approved, Rejected
  "approvedBy" INTEGER REFERENCES users(id),
  "approvalDate" TIMESTAMP WITH TIME ZONE,
  remarks TEXT,
  "createdBy" INTEGER NOT NULL REFERENCES users(id),
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  
  -- Enforce relationship with WPS table
  FOREIGN KEY ("wpsId") REFERENCES wps_documents("wpsId") ON DELETE CASCADE
);

-- Create index on common search fields for WPS
CREATE INDEX IF NOT EXISTS idx_wps_documents_wps_id ON wps_documents("wpsId");
CREATE INDEX IF NOT EXISTS idx_wps_documents_pqr_id ON wps_documents("pqrId");
CREATE INDEX IF NOT EXISTS idx_wps_documents_welder_process ON wps_documents("welderProcess");
CREATE INDEX IF NOT EXISTS idx_wps_documents_base_metal ON wps_documents("baseMetalGrade");
CREATE INDEX IF NOT EXISTS idx_wps_documents_status ON wps_documents(status);
CREATE INDEX IF NOT EXISTS idx_wps_documents_created_by ON wps_documents("createdBy");

-- Create index on common search fields for PQR
CREATE INDEX IF NOT EXISTS idx_pqr_documents_pqr_id ON pqr_documents("pqrId");
CREATE INDEX IF NOT EXISTS idx_pqr_documents_wps_id ON pqr_documents("wpsId");
CREATE INDEX IF NOT EXISTS idx_pqr_documents_status ON pqr_documents(status);
CREATE INDEX IF NOT EXISTS idx_pqr_documents_test_date ON pqr_documents("testDate");

-- Comments for database documentation
COMMENT ON TABLE wps_documents IS 'Stores Welding Procedure Specifications (WPS) documents and their details';
COMMENT ON TABLE pqr_documents IS 'Stores Procedure Qualification Records (PQR) documents and their details';
COMMENT ON COLUMN wps_documents."wpsId" IS 'Unique identifier for the WPS in format WPS-XXX';
COMMENT ON COLUMN wps_documents."pqrId" IS 'Related PQR ID in format PQR-XXX';
COMMENT ON COLUMN wps_documents."document_file_path" IS 'GCS path for the WPS document PDF file';
COMMENT ON COLUMN pqr_documents."pqrId" IS 'Unique identifier for the PQR in format PQR-XXX';
COMMENT ON COLUMN pqr_documents."wpsId" IS 'Related WPS ID in format WPS-XXX';
COMMENT ON COLUMN pqr_documents."document_file_path" IS 'GCS path for the PQR document PDF file';