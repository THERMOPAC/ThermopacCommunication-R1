-- Add performance metrics columns to marketing_campaigns table
ALTER TABLE marketing_campaigns 
  ADD COLUMN ctr DECIMAL(10, 2),
  ADD COLUMN cpc DECIMAL(10, 2),
  ADD COLUMN conversions INTEGER,
  ADD COLUMN conversion_rate DECIMAL(10, 2),
  ADD COLUMN cpa DECIMAL(10, 2),
  ADD COLUMN impressions INTEGER,
  ADD COLUMN quality_score DECIMAL(10, 2),
  ADD COLUMN roas DECIMAL(10, 2),
  ADD COLUMN impression_share DECIMAL(10, 2),
  ADD COLUMN bounce_rate DECIMAL(10, 2),
  ADD COLUMN expected_lead_count INTEGER,
  ADD COLUMN actual_lead_count INTEGER;

-- Migrate data from kpis to individual metrics (if possible)
-- This would require custom logic based on how the KPIs are stored
-- For now, we'll just establish the new columns