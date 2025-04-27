-- Create Welders Table
CREATE TABLE IF NOT EXISTS welders (
  id SERIAL PRIMARY KEY,
  "welderId" VARCHAR(20) UNIQUE NOT NULL,
  "welderName" VARCHAR(255) NOT NULL,
  trade VARCHAR(50) NOT NULL,
  "processQualified" TEXT[] NOT NULL,
  "materialGroupQualified" TEXT[] NOT NULL,
  "thicknessRange" VARCHAR(100) NOT NULL,
  "positionQualified" TEXT[] NOT NULL,
  "wpsId" VARCHAR(20) NOT NULL,
  "testDate" TIMESTAMP NOT NULL,
  "testResults" VARCHAR(20) NOT NULL,
  "certificateNo" VARCHAR(50) UNIQUE NOT NULL,
  "certificateExpiryDate" TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('Active', 'Expired', 'Revoked')),
  remarks TEXT,
  "createdBy" INTEGER REFERENCES users(id),
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create Welder-WPS Qualifications Table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS welder_wps_qualifications (
  id SERIAL PRIMARY KEY,
  "welderId" INTEGER NOT NULL REFERENCES welders(id) ON DELETE CASCADE,
  "wpsId" INTEGER NOT NULL REFERENCES wps_documents(id) ON DELETE CASCADE,
  "qualificationDate" TIMESTAMP NOT NULL,
  "expiryDate" TIMESTAMP NOT NULL,
  "qualificationStatus" VARCHAR(20) NOT NULL CHECK (
    "qualificationStatus" IN ('Active', 'Expired', 'Revoked')
  ),
  "certificationNumber" VARCHAR(50) NOT NULL,
  remarks TEXT,
  "createdBy" INTEGER REFERENCES users(id),
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_welder_wps UNIQUE ("welderId", "wpsId")
);

-- Create indexes for faster querying
CREATE INDEX IF NOT EXISTS idx_welders_welderId ON welders("welderId");
CREATE INDEX IF NOT EXISTS idx_welders_status ON welders(status);
CREATE INDEX IF NOT EXISTS idx_welders_certificateExpiryDate ON welders("certificateExpiryDate");
CREATE INDEX IF NOT EXISTS idx_welder_qualifications_welderId ON welder_wps_qualifications("welderId");
CREATE INDEX IF NOT EXISTS idx_welder_qualifications_wpsId ON welder_wps_qualifications("wpsId");
CREATE INDEX IF NOT EXISTS idx_welder_qualifications_expiryDate ON welder_wps_qualifications("expiryDate");