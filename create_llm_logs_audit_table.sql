-- Create comprehensive logging table for LLM prompt execution auditing
CREATE TABLE IF NOT EXISTS llm_logs (
    id SERIAL PRIMARY KEY,
    prompt_id INTEGER NOT NULL REFERENCES llm_prompts(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    model VARCHAR(100) NOT NULL,
    execution_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    masked_input TEXT,
    llm_response TEXT,
    execution_status VARCHAR(50) NOT NULL, -- 'success', 'error', 'masked_error'
    execution_time_ms INTEGER,
    token_usage_input INTEGER,
    token_usage_output INTEGER,
    cost_usd DECIMAL(10, 6),
    error_message TEXT,
    is_test_mode BOOLEAN DEFAULT FALSE,
    routing_reason VARCHAR(200), -- why this model was selected
    original_model_request VARCHAR(100), -- what model was originally requested
    fallback_used BOOLEAN DEFAULT FALSE,
    masking_rules_applied JSONB, -- which masking rules were applied
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_llm_logs_prompt_id ON llm_logs(prompt_id);
CREATE INDEX IF NOT EXISTS idx_llm_logs_user_id ON llm_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_llm_logs_timestamp ON llm_logs(execution_timestamp);
CREATE INDEX IF NOT EXISTS idx_llm_logs_model ON llm_logs(model);
CREATE INDEX IF NOT EXISTS idx_llm_logs_status ON llm_logs(execution_status);

-- Add preferred_model column to llm_prompts table for model routing
ALTER TABLE llm_prompts ADD COLUMN IF NOT EXISTS preferred_model VARCHAR(100);
ALTER TABLE llm_prompts ADD COLUMN IF NOT EXISTS masking_rules JSONB;
ALTER TABLE llm_prompts ADD COLUMN IF NOT EXISTS is_sensitive BOOLEAN DEFAULT FALSE;

-- Update existing prompts with intelligent model preferences
UPDATE llm_prompts SET preferred_model = 'gpt-4o' WHERE frequency IN ('daily', 'hourly') OR name ILIKE '%urgent%' OR name ILIKE '%alert%';
UPDATE llm_prompts SET preferred_model = 'claude-sonnet-4-20250514' WHERE category IN ('meetings', 'analysis') OR name ILIKE '%summary%' OR name ILIKE '%report%';
UPDATE llm_prompts SET preferred_model = 'gpt-4o' WHERE preferred_model IS NULL; -- default fallback

-- Mark sensitive prompts
UPDATE llm_prompts SET is_sensitive = TRUE WHERE category IN ('administration', 'finance', 'hr') OR name ILIKE '%payroll%' OR name ILIKE '%salary%';