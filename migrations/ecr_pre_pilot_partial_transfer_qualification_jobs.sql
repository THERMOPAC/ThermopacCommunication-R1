-- Explicit, isolated single-point qualification lifecycle.  This table is
-- intentionally not part of the Job-C queue and may never be resumed.
CREATE TABLE IF NOT EXISTS ecr_pre_pilot_partial_transfer_qualification_jobs (
  id uuid PRIMARY KEY,
  design_id integer NOT NULL REFERENCES ecr_pre_pilot_designs(id),
  created_by integer NOT NULL REFERENCES users(id),
  status varchar(20) NOT NULL DEFAULT 'pending',
  input_snapshot jsonb NOT NULL,
  input_hash varchar(64) NOT NULL,
  result_snapshot jsonb,
  result_hash varchar(64),
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamp NOT NULL DEFAULT now(),
  started_at timestamp,
  completed_at timestamp,
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT ecr_pre_pilot_partial_transfer_qualification_jobs_status_chk
    CHECK (status IN ('pending','running','completed','failed','cancelled','interrupted'))
);

CREATE INDEX IF NOT EXISTS ecr_pre_pilot_partial_transfer_qualification_scope_idx
  ON ecr_pre_pilot_partial_transfer_qualification_jobs
  (created_by, design_id, created_at DESC);

-- One owned active qualification per user/design, while completed immutable
-- evidence remains independently readable.
CREATE UNIQUE INDEX IF NOT EXISTS ecr_pre_pilot_partial_transfer_qualification_one_active_idx
  ON ecr_pre_pilot_partial_transfer_qualification_jobs (created_by, design_id)
  WHERE status IN ('pending','running');