CREATE TABLE IF NOT EXISTS ecr_pre_pilot_job_c_jobs (
  id uuid PRIMARY KEY,
  design_id integer NOT NULL REFERENCES ecr_pre_pilot_designs(id),
  created_by integer NOT NULL REFERENCES users(id),
  input_snapshot jsonb NOT NULL,
  input_hash varchar(64) NOT NULL,
  implementation_hash varchar(64) NOT NULL,
  candidate_hash varchar(64) NOT NULL,
  job_b_engine_hash varchar(64) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  progress_phase varchar(80) NOT NULL DEFAULT 'queued',
  progress_completed integer NOT NULL DEFAULT 0,
  progress_total integer,
  result_snapshot jsonb,
  result_hash varchar(64),
  error text,
  worker_owner varchar(160),
  claim_token uuid,
  lease_expires_at timestamp,
  attempt_count integer NOT NULL DEFAULT 0,
  cancel_requested_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  started_at timestamp,
  completed_at timestamp,
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT ecr_pre_pilot_job_c_jobs_status_chk CHECK
    (status IN ('pending','running','completed','blocked','failed','cancelled'))
);

CREATE INDEX IF NOT EXISTS ecr_pre_pilot_job_c_jobs_queue_idx
  ON ecr_pre_pilot_job_c_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS ecr_pre_pilot_job_c_jobs_scope_idx
  ON ecr_pre_pilot_job_c_jobs(created_by, design_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ecr_pre_pilot_job_c_job_history (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES ecr_pre_pilot_job_c_jobs(id),
  input_snapshot jsonb NOT NULL,
  input_hash varchar(64) NOT NULL,
  implementation_hash varchar(64) NOT NULL,
  candidate_hash varchar(64) NOT NULL,
  job_b_engine_hash varchar(64) NOT NULL,
  status varchar(20) NOT NULL,
  progress_phase varchar(80) NOT NULL,
  progress_completed integer NOT NULL,
  progress_total integer,
  worker_owner varchar(160),
  claim_token uuid,
  attempt_count integer NOT NULL,
  result_snapshot jsonb,
  result_hash varchar(64),
  error text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT ecr_pre_pilot_job_c_history_status_chk CHECK
    (status IN ('pending','running','completed','blocked','failed','cancelled'))
);
CREATE INDEX IF NOT EXISTS ecr_pre_pilot_job_c_history_job_idx
  ON ecr_pre_pilot_job_c_job_history(job_id, recorded_at);

CREATE OR REPLACE FUNCTION protect_ecr_pre_pilot_job_c_evidence()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.design_id IS DISTINCT FROM OLD.design_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.input_snapshot IS DISTINCT FROM OLD.input_snapshot
     OR NEW.input_hash IS DISTINCT FROM OLD.input_hash
     OR NEW.implementation_hash IS DISTINCT FROM OLD.implementation_hash
     OR NEW.candidate_hash IS DISTINCT FROM OLD.candidate_hash
     OR NEW.job_b_engine_hash IS DISTINCT FROM OLD.job_b_engine_hash
     OR (OLD.result_snapshot IS NOT NULL AND NEW.result_snapshot IS DISTINCT FROM OLD.result_snapshot)
     OR (OLD.result_hash IS NOT NULL AND NEW.result_hash IS DISTINCT FROM OLD.result_hash)
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Job C immutable evidence cannot be changed';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ecr_pre_pilot_job_c_jobs_evidence_immutable
  ON ecr_pre_pilot_job_c_jobs;
CREATE TRIGGER ecr_pre_pilot_job_c_jobs_evidence_immutable
BEFORE UPDATE ON ecr_pre_pilot_job_c_jobs
FOR EACH ROW EXECUTE FUNCTION protect_ecr_pre_pilot_job_c_evidence();

CREATE OR REPLACE FUNCTION protect_ecr_pre_pilot_job_c_history()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Job C history is append-only';
END $$;
DROP TRIGGER IF EXISTS ecr_pre_pilot_job_c_history_append_only
  ON ecr_pre_pilot_job_c_job_history;
CREATE TRIGGER ecr_pre_pilot_job_c_history_append_only
BEFORE UPDATE OR DELETE ON ecr_pre_pilot_job_c_job_history
FOR EACH ROW EXECUTE FUNCTION protect_ecr_pre_pilot_job_c_history();