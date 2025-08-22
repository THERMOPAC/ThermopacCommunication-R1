-- Lead Generation Database Schema
-- Enhanced with freshness filters, hard dedup, and LLM scoring

-- Search history and tracking
CREATE TABLE IF NOT EXISTS lead_generation_searches (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  search_query VARCHAR(500) NOT NULL,
  search_filters JSONB DEFAULT '{}',
  results_count INTEGER DEFAULT 0,
  api_quota_used INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Raw search results with deduplication
CREATE TABLE IF NOT EXISTS lead_generation_raw_results (
  id SERIAL PRIMARY KEY,
  search_id INTEGER REFERENCES lead_generation_searches(id),
  title VARCHAR(1000) NOT NULL,
  link VARCHAR(2000) NOT NULL,
  snippet TEXT,
  display_link VARCHAR(500),
  formatted_url VARCHAR(2000),
  
  -- Deduplication fields
  content_fingerprint VARCHAR(64) NOT NULL, -- sha256(title|snippet|link)
  
  -- Freshness tracking
  first_seen TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP DEFAULT NOW(),
  search_ranking INTEGER,
  
  -- Processing status
  llm_processed BOOLEAN DEFAULT FALSE,
  llm_processed_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- LLM processed and scored leads
CREATE TABLE IF NOT EXISTS lead_generation_processed_leads (
  id SERIAL PRIMARY KEY,
  raw_result_id INTEGER REFERENCES lead_generation_raw_results(id),
  user_id INTEGER REFERENCES users(id),
  
  -- LLM extracted data
  company_name VARCHAR(500),
  country VARCHAR(100),
  capacity_lph NUMERIC(15,2), -- Liters per hour capacity
  contact_email VARCHAR(500),
  deadline_date DATE,
  business_intent TEXT,
  
  -- LLM scoring (0.0 to 1.0)
  llm_score NUMERIC(3,2) CHECK (llm_score >= 0.0 AND llm_score <= 1.0),
  score_reasoning TEXT,
  
  -- Lead promotion status
  promoted_to_lead BOOLEAN DEFAULT FALSE,
  promoted_at TIMESTAMP,
  lead_id INTEGER, -- Reference to actual leads table if promoted
  
  -- Quality indicators
  data_completeness_score NUMERIC(3,2),
  contact_info_verified BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- API usage tracking for quota management
CREATE TABLE IF NOT EXISTS lead_generation_api_usage (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  api_calls_today INTEGER DEFAULT 0,
  quota_reset_date DATE DEFAULT CURRENT_DATE,
  total_calls_month INTEGER DEFAULT 0,
  monthly_reset_date DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create unique indexes for hard deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_raw_results_dedup 
ON lead_generation_raw_results(link, content_fingerprint);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_lead_searches_user_created 
ON lead_generation_searches(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_raw_results_processed 
ON lead_generation_raw_results(llm_processed, created_at);

CREATE INDEX IF NOT EXISTS idx_lead_processed_score 
ON lead_generation_processed_leads(llm_score DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_processed_promoted 
ON lead_generation_processed_leads(promoted_to_lead, llm_score);

CREATE INDEX IF NOT EXISTS idx_lead_api_usage_user_date 
ON lead_generation_api_usage(user_id, quota_reset_date);

-- Functions for fingerprint generation
CREATE OR REPLACE FUNCTION generate_content_fingerprint(title TEXT, snippet TEXT, link TEXT)
RETURNS VARCHAR(64) AS $$
BEGIN
  RETURN encode(sha256((COALESCE(title, '') || '|' || COALESCE(snippet, '') || '|' || COALESCE(link, ''))::bytea), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Update quota tracking function
CREATE OR REPLACE FUNCTION update_api_quota(p_user_id INTEGER, p_calls_used INTEGER DEFAULT 1)
RETURNS VOID AS $$
BEGIN
  INSERT INTO lead_generation_api_usage (user_id, api_calls_today, quota_reset_date, total_calls_month, monthly_reset_date)
  VALUES (p_user_id, p_calls_used, CURRENT_DATE, p_calls_used, DATE_TRUNC('month', CURRENT_DATE))
  ON CONFLICT (user_id) DO UPDATE SET
    api_calls_today = CASE 
      WHEN lead_generation_api_usage.quota_reset_date < CURRENT_DATE 
      THEN p_calls_used 
      ELSE lead_generation_api_usage.api_calls_today + p_calls_used 
    END,
    quota_reset_date = CURRENT_DATE,
    total_calls_month = CASE 
      WHEN lead_generation_api_usage.monthly_reset_date < DATE_TRUNC('month', CURRENT_DATE)
      THEN p_calls_used 
      ELSE lead_generation_api_usage.total_calls_month + p_calls_used 
    END,
    monthly_reset_date = DATE_TRUNC('month', CURRENT_DATE),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;