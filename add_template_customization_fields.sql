-- Add new fields to the report_templates table for advanced customization
ALTER TABLE report_templates
  ADD COLUMN IF NOT EXISTS paper_size TEXT DEFAULT 'A4',
  ADD COLUMN IF NOT EXISTS orientation TEXT DEFAULT 'Portrait',
  ADD COLUMN IF NOT EXISTS margin_top INTEGER DEFAULT 25,
  ADD COLUMN IF NOT EXISTS margin_bottom INTEGER DEFAULT 25,
  ADD COLUMN IF NOT EXISTS margin_left INTEGER DEFAULT 25,
  ADD COLUMN IF NOT EXISTS margin_right INTEGER DEFAULT 25,
  ADD COLUMN IF NOT EXISTS section_configurations JSONB,
  ADD COLUMN IF NOT EXISTS show_company_logo BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS logo_position TEXT DEFAULT 'header';