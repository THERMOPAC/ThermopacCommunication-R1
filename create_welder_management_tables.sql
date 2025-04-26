-- Create welders table for welder management
CREATE TABLE IF NOT EXISTS welders (
    id SERIAL PRIMARY KEY,
    "welderId" VARCHAR(10) NOT NULL,
    name VARCHAR(100) NOT NULL,
    trade VARCHAR(50) NOT NULL,
    "processQualified" TEXT[] NOT NULL,
    "materialGroupQualified" TEXT[] NOT NULL,
    "thicknessRange" VARCHAR(50) NOT NULL,
    "positionQualified" TEXT[] NOT NULL,
    "wpsNumber" VARCHAR(50) NOT NULL,
    "testDate" DATE NOT NULL,
    "testResults" VARCHAR(20) NOT NULL,
    "certificateNo" VARCHAR(10) NOT NULL,
    "certificateExpiryDate" DATE NOT NULL,
    status VARCHAR(20) NOT NULL,
    remarks TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on welderId for faster lookups
CREATE INDEX IF NOT EXISTS idx_welders_welder_id ON welders ("welderId");

-- Create index on wpsNumber to quickly find welders for a specific WPS
CREATE INDEX IF NOT EXISTS idx_welders_wps_number ON welders ("wpsNumber");

-- Create index on status and certificateExpiryDate for queries related to expiring certificates
CREATE INDEX IF NOT EXISTS idx_welders_status_expiry ON welders (status, "certificateExpiryDate");