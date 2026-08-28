CREATE TABLE IF NOT EXISTS ecr_pre_pilot_predictive_nt_jobs (
  id uuid PRIMARY KEY,
  design_id integer NOT NULL REFERENCES ecr_pre_pilot_designs(id),
  created_by integer NOT NULL REFERENCES users(id),
  input_snapshot jsonb NOT NULL,
  model_hash varchar(64) NOT NULL,
  engine_hash varchar(64) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  completed_trials integer NOT NULL DEFAULT 0,
  maximum_stages integer NOT NULL,
  result_snapshot jsonb,
  error text,
  worker_owner varchar(160),
  claim_token uuid,
  attempt_count integer NOT NULL DEFAULT 0,
  lease_expires_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  started_at timestamp,
  completed_at timestamp,
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT ecr_pre_pilot_predictive_nt_jobs_status_chk
    CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS ecr_pre_pilot_predictive_nt_jobs_queue_idx
  ON ecr_pre_pilot_predictive_nt_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS ecr_pre_pilot_predictive_nt_jobs_owner_idx
  ON ecr_pre_pilot_predictive_nt_jobs(created_by, status);
CREATE INDEX IF NOT EXISTS ecr_pre_pilot_predictive_nt_jobs_design_idx
  ON ecr_pre_pilot_predictive_nt_jobs(design_id, created_at);

CREATE TABLE IF NOT EXISTS ecr_pre_pilot_predictive_nt_job_history (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES ecr_pre_pilot_predictive_nt_jobs(id),
  input_snapshot jsonb NOT NULL,
  model_hash varchar(64) NOT NULL,
  engine_hash varchar(64) NOT NULL,
  status varchar(20) NOT NULL,
  completed_trials integer NOT NULL,
  maximum_stages integer NOT NULL,
  worker_owner varchar(160),
  attempt_count integer NOT NULL,
  result_snapshot jsonb,
  error text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT ecr_pre_pilot_predictive_nt_job_history_status_chk
    CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);

ALTER TABLE ecr_pre_pilot_predictive_nt_job_history
  ADD COLUMN IF NOT EXISTS input_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS model_hash varchar(64),
  ADD COLUMN IF NOT EXISTS engine_hash varchar(64);

UPDATE ecr_pre_pilot_predictive_nt_job_history AS history
   SET input_snapshot = job.input_snapshot,
       model_hash = job.model_hash,
       engine_hash = job.engine_hash
  FROM ecr_pre_pilot_predictive_nt_jobs AS job
 WHERE history.job_id = job.id
   AND (history.input_snapshot IS NULL OR history.model_hash IS NULL OR history.engine_hash IS NULL);

ALTER TABLE ecr_pre_pilot_predictive_nt_job_history
  ALTER COLUMN input_snapshot SET NOT NULL,
  ALTER COLUMN model_hash SET NOT NULL,
  ALTER COLUMN engine_hash SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ecr_pre_pilot_predictive_nt_jobs_design_id_fkey'
       AND conrelid = 'ecr_pre_pilot_predictive_nt_jobs'::regclass
  ) THEN
    ALTER TABLE ecr_pre_pilot_predictive_nt_jobs
      ADD CONSTRAINT ecr_pre_pilot_predictive_nt_jobs_design_id_fkey
      FOREIGN KEY (design_id) REFERENCES ecr_pre_pilot_designs(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ecr_pre_pilot_predictive_nt_jobs_created_by_fkey'
       AND conrelid = 'ecr_pre_pilot_predictive_nt_jobs'::regclass
  ) THEN
    ALTER TABLE ecr_pre_pilot_predictive_nt_jobs
      ADD CONSTRAINT ecr_pre_pilot_predictive_nt_jobs_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES users(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ecr_pre_pilot_predictive_nt_jobs_status_chk'
       AND conrelid = 'ecr_pre_pilot_predictive_nt_jobs'::regclass
  ) THEN
    ALTER TABLE ecr_pre_pilot_predictive_nt_jobs
      ADD CONSTRAINT ecr_pre_pilot_predictive_nt_jobs_status_chk
      CHECK (status IN ('pending', 'running', 'completed', 'failed'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ecr_pre_pilot_predictive_nt_job_history_job_id_fkey'
       AND conrelid = 'ecr_pre_pilot_predictive_nt_job_history'::regclass
  ) THEN
    ALTER TABLE ecr_pre_pilot_predictive_nt_job_history
      ADD CONSTRAINT ecr_pre_pilot_predictive_nt_job_history_job_id_fkey
      FOREIGN KEY (job_id) REFERENCES ecr_pre_pilot_predictive_nt_jobs(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ecr_pre_pilot_predictive_nt_job_history_status_chk'
       AND conrelid = 'ecr_pre_pilot_predictive_nt_job_history'::regclass
  ) THEN
    ALTER TABLE ecr_pre_pilot_predictive_nt_job_history
      ADD CONSTRAINT ecr_pre_pilot_predictive_nt_job_history_status_chk
      CHECK (status IN ('pending', 'running', 'completed', 'failed'));
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION protect_ecr_pre_pilot_predictive_nt_job_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.design_id IS DISTINCT FROM OLD.design_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.input_snapshot IS DISTINCT FROM OLD.input_snapshot
     OR NEW.model_hash IS DISTINCT FROM OLD.model_hash
     OR NEW.engine_hash IS DISTINCT FROM OLD.engine_hash
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Predictive N_T job evidence is immutable';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS ecr_pre_pilot_predictive_nt_jobs_evidence_immutable
  ON ecr_pre_pilot_predictive_nt_jobs;
CREATE TRIGGER ecr_pre_pilot_predictive_nt_jobs_evidence_immutable
BEFORE UPDATE ON ecr_pre_pilot_predictive_nt_jobs
FOR EACH ROW EXECUTE FUNCTION protect_ecr_pre_pilot_predictive_nt_job_evidence();

CREATE OR REPLACE FUNCTION protect_ecr_pre_pilot_predictive_nt_job_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Predictive N_T job history is append-only';
END
$$;

DROP TRIGGER IF EXISTS ecr_pre_pilot_predictive_nt_job_history_append_only
  ON ecr_pre_pilot_predictive_nt_job_history;
CREATE TRIGGER ecr_pre_pilot_predictive_nt_job_history_append_only
BEFORE UPDATE OR DELETE ON ecr_pre_pilot_predictive_nt_job_history
FOR EACH ROW EXECUTE FUNCTION protect_ecr_pre_pilot_predictive_nt_job_history();

CREATE INDEX IF NOT EXISTS ecr_pre_pilot_predictive_nt_job_history_job_idx
  ON ecr_pre_pilot_predictive_nt_job_history(job_id, recorded_at);