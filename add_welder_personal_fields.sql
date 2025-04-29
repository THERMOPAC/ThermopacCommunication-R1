-- Add new columns to the welders table for personal information
ALTER TABLE welders
ADD COLUMN photo_path VARCHAR(255),
ADD COLUMN date_of_birth DATE,
ADD COLUMN contact_number VARCHAR(20),
ADD COLUMN hire_date DATE,
ADD COLUMN identification_type VARCHAR(50),
ADD COLUMN identification_number VARCHAR(50);