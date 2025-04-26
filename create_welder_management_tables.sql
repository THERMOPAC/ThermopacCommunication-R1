-- Create the welders table for storing welder information
CREATE TABLE IF NOT EXISTS welders (
  id SERIAL PRIMARY KEY,
  "welderId" VARCHAR(10) NOT NULL UNIQUE, -- Format: W-001, W-002, etc.
  name VARCHAR(100) NOT NULL,
  trade VARCHAR(50) NOT NULL, -- Welder, Fitter, Fabricator
  "processQualified" TEXT[] NOT NULL, -- SMAW, GTAW, FCAW, SAW
  "materialGroupQualified" TEXT[] NOT NULL, -- Carbon Steel, Stainless Steel, Alloy Steel
  "thicknessRange" VARCHAR(50) NOT NULL,
  "positionQualified" TEXT[] NOT NULL, -- 1G, 2G, 3G, 4G, 5G, 6G
  "wpsNumber" VARCHAR(20) NOT NULL, -- Reference to WPS document
  "testDate" DATE NOT NULL,
  "testResults" VARCHAR(20) NOT NULL, -- Passed, Failed
  "certificateNo" VARCHAR(20) NOT NULL UNIQUE, -- Format: WQC-001, WQC-002, etc.
  "certificateExpiryDate" DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Active', -- Active, Expired, Revoked
  remarks TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE
);

-- Create index on common search fields
CREATE INDEX IF NOT EXISTS idx_welders_welder_id ON welders("welderId");
CREATE INDEX IF NOT EXISTS idx_welders_name ON welders(name);
CREATE INDEX IF NOT EXISTS idx_welders_wps_number ON welders("wpsNumber");
CREATE INDEX IF NOT EXISTS idx_welders_status ON welders(status);
CREATE INDEX IF NOT EXISTS idx_welders_certificate_expiry ON welders("certificateExpiryDate");

-- Comments for database documentation
COMMENT ON TABLE welders IS 'Stores information about welders and their qualifications';
COMMENT ON COLUMN welders."welderId" IS 'Unique identifier for the welder in format W-XXX';
COMMENT ON COLUMN welders."processQualified" IS 'List of welding processes the welder is qualified for';
COMMENT ON COLUMN welders."materialGroupQualified" IS 'List of material groups the welder is qualified to work with';
COMMENT ON COLUMN welders."positionQualified" IS 'List of welding positions the welder is qualified for';
COMMENT ON COLUMN welders."wpsNumber" IS 'Reference to the Welding Procedure Specification';
COMMENT ON COLUMN welders."certificateNo" IS 'Welder qualification certificate number in format WQC-XXX';
COMMENT ON COLUMN welders."certificateExpiryDate" IS 'Date when the welder qualification certificate expires';