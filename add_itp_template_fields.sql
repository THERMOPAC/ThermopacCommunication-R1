-- Migration to add missing fields to itp_templates table
ALTER TABLE IF EXISTS itp_templates ADD COLUMN IF NOT EXISTS placeholders JSONB NULL;
ALTER TABLE IF EXISTS itp_templates ADD COLUMN IF NOT EXISTS category VARCHAR(100) NULL;
ALTER TABLE IF EXISTS itp_templates ADD COLUMN IF NOT EXISTS tags TEXT[] NULL;