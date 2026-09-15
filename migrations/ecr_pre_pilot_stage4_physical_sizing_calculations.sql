CREATE TABLE IF NOT EXISTS ecr_pre_pilot_stage4_physical_sizing_calculations (
  id BIGSERIAL PRIMARY KEY,
  design_id INTEGER NOT NULL REFERENCES ecr_pre_pilot_designs(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  lineage_hash TEXT NOT NULL,
  stage1_snapshot_hash TEXT NOT NULL,
  stage2_job_id TEXT,
  stage2_result_hash TEXT,
  stage3_run_id TEXT NOT NULL,
  stage3_immutable_hash TEXT NOT NULL,
  targets_hash TEXT NOT NULL,
  implementation_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'INTERRUPTED', 'CALCULATED', 'TARGET_FAILURE', 'NUMERICAL_FAILURE')),
  result_snapshot JSONB,
  progress_snapshot JSONB NOT NULL DEFAULT '{"phase":"QUEUED","completedCases":0,"totalCases":2}'::jsonb,
  error_code TEXT,
  attempt_token TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deadline_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  CONSTRAINT ecr_pre_pilot_stage4_physical_sizing_calculations_scope_unique
    UNIQUE (created_by, design_id, lineage_hash)
);

CREATE INDEX IF NOT EXISTS ecr_pre_pilot_stage4_physical_sizing_calculations_scope_idx
  ON ecr_pre_pilot_stage4_physical_sizing_calculations (created_by, design_id, started_at DESC);

-- Fixed-N_T=7 HETS physical sizing remains available when no accepted Stage-2
-- result exists. Null represents absent reference evidence; no historical
-- result is altered or backfilled.
ALTER TABLE ecr_pre_pilot_stage4_physical_sizing_calculations
  ALTER COLUMN stage2_job_id DROP NOT NULL,
  ALTER COLUMN stage2_result_hash DROP NOT NULL;