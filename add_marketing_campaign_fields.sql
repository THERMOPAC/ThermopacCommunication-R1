-- Add missing fields to marketing_campaigns table
ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS objective text;
ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS channel_id integer REFERENCES campaign_channels(id);
ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS kpis text;
ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS expected_lead_count integer;