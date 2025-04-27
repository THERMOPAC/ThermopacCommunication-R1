-- Create WPS Documents table
CREATE TABLE IF NOT EXISTS wps_documents (
  id SERIAL PRIMARY KEY,
  "wpsId" VARCHAR(100) NOT NULL,
  "pqrId" VARCHAR(100) NOT NULL,
  "revisionNo" VARCHAR(50) DEFAULT '0',
  "welderProcess" VARCHAR(255) NOT NULL,
  "baseMetalGrade" VARCHAR(255) NOT NULL,
  "baseMetalThickness" VARCHAR(100) NOT NULL,
  "fillerMaterial" VARCHAR(255) NOT NULL,
  "jointType" VARCHAR(100) NOT NULL,
  "weldPosition" VARCHAR(100) NOT NULL,
  "preheatingTemp" VARCHAR(100),
  "postWeldHeatTreatment" VARCHAR(255),
  "electricalParameters" JSONB,
  "shieldingGas" VARCHAR(255),
  "document_file_path" VARCHAR(1000),
  status VARCHAR(50) NOT NULL DEFAULT 'Draft',
  "approvedBy" INTEGER REFERENCES users(id),
  "approvalDate" TIMESTAMP,
  remarks TEXT,
  "createdBy" INTEGER REFERENCES users(id),
  "createdAt" TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP NOT NULL
);

-- Create index for WPS ID and PQR ID for faster lookups
CREATE INDEX IF NOT EXISTS idx_wps_documents_wpsid ON wps_documents("wpsId");
CREATE INDEX IF NOT EXISTS idx_wps_documents_pqrid ON wps_documents("pqrId");

-- Create a table for welders qualified under specific WPS
CREATE TABLE IF NOT EXISTS welder_wps_qualifications (
  id SERIAL PRIMARY KEY,
  "welderId" INTEGER NOT NULL REFERENCES welders(id) ON DELETE CASCADE,
  "wpsId" INTEGER NOT NULL REFERENCES wps_documents(id) ON DELETE CASCADE,
  "qualificationDate" TIMESTAMP NOT NULL,
  "expiryDate" TIMESTAMP,
  "qualificationStatus" VARCHAR(50) NOT NULL DEFAULT 'Active',
  "certificationNumber" VARCHAR(100),
  "witnessBy" VARCHAR(255),
  "remarks" TEXT,
  "createdBy" INTEGER REFERENCES users(id),
  "createdAt" TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP NOT NULL,
  UNIQUE("welderId", "wpsId")
);

-- Create index for welder ID and WPS ID for faster lookups
CREATE INDEX IF NOT EXISTS idx_welder_wps_welderid ON welder_wps_qualifications("welderId");
CREATE INDEX IF NOT EXISTS idx_welder_wps_wpsid ON welder_wps_qualifications("wpsId");