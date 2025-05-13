-- Create lead sources table
CREATE TABLE IF NOT EXISTS lead_sources (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Insert default lead sources
INSERT INTO lead_sources (name, description)
VALUES 
  ('Google Ads', 'Leads generated through Google Ads campaigns'),
  ('Website', 'Leads generated through website contact forms'),
  ('Referral', 'Leads referred by existing customers'),
  ('Exhibition', 'Leads collected at industry exhibitions'),
  ('Direct Contact', 'Leads from direct outreach')
ON CONFLICT (name) DO NOTHING;

-- Create lead statuses table
CREATE TABLE IF NOT EXISTS lead_statuses (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  display_order INTEGER NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Insert default lead statuses
INSERT INTO lead_statuses (name, description, display_order, color)
VALUES 
  ('New', 'Newly created lead that has not been contacted yet', 1, '#3B82F6'),
  ('Contacted', 'Lead has been reached out to', 2, '#10B981'),
  ('Qualified', 'Lead has been qualified as having potential', 3, '#F59E0B'),
  ('Proposal', 'Proposal or quote has been sent to lead', 4, '#8B5CF6'),
  ('Negotiation', 'In active negotiation with lead', 5, '#EC4899'),
  ('Won', 'Lead converted to customer', 6, '#16A34A'),
  ('Lost', 'Lead opportunity lost', 7, '#EF4444')
ON CONFLICT (name) DO NOTHING;

-- Create leads table
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  company_name TEXT NOT NULL,
  industry TEXT,
  website TEXT,
  annual_revenue DECIMAL(15, 2),
  employee_count INTEGER,
  
  -- Main contact information
  contact_name TEXT NOT NULL,
  contact_title TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  country_code TEXT,
  
  -- Lead management fields
  source_id INTEGER REFERENCES lead_sources(id),
  status_id INTEGER REFERENCES lead_statuses(id),
  assigned_to INTEGER REFERENCES users(id),
  
  -- Location information
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT,
  
  -- Lead details
  notes TEXT,
  requirements TEXT,
  potential_value DECIMAL(15, 2),
  probability INTEGER CHECK (probability >= 0 AND probability <= 100),
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_contacted_at TIMESTAMP,
  expected_close_date DATE,
  
  -- If converted to customer, link to customer record
  is_converted BOOLEAN DEFAULT FALSE,
  customer_id INTEGER REFERENCES customers(id)
);

-- Create lead activities table
CREATE TABLE IF NOT EXISTS lead_activities (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL, -- email, call, meeting, note
  title TEXT NOT NULL,
  description TEXT,
  activity_date TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create campaigns table
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  budget DECIMAL(15, 2),
  actual_cost DECIMAL(15, 2),
  status TEXT NOT NULL, -- planned, active, completed, cancelled
  goals TEXT,
  target_audience TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create campaign channels table
CREATE TABLE IF NOT EXISTS campaign_channels (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT
);

-- Insert default campaign channels
INSERT INTO campaign_channels (name, description)
VALUES 
  ('Google Ads', 'Google search and display advertising'),
  ('Email', 'Email marketing campaigns'),
  ('Social Media', 'Campaigns on social media platforms'),
  ('Trade Shows', 'Industry exhibitions and trade shows'),
  ('Content Marketing', 'Blog posts, whitepapers, and other content'),
  ('Direct Mail', 'Physical mail campaigns')
ON CONFLICT (name) DO NOTHING;

-- Create campaign activities table
CREATE TABLE IF NOT EXISTS campaign_activities (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL REFERENCES campaign_channels(id),
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL, -- planned, active, completed, cancelled
  budget DECIMAL(15, 2),
  actual_cost DECIMAL(15, 2),
  metrics JSONB, -- Store metrics like clicks, impressions, conversions
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create leads to campaigns junction table
CREATE TABLE IF NOT EXISTS campaign_leads (
  campaign_id INTEGER NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, lead_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status_id);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_campaign_activities_campaign_id ON campaign_activities(campaign_id);