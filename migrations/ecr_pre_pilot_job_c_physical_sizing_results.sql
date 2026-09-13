-- Immutable child assessments for post-acceptance Job-C physical sizing.
-- A row is intentionally appended for each explicit request: it must never
-- overwrite the completed Job-C parent or turn a dependency block into an
-- implied approval.
CREATE TABLE IF NOT EXISTS ecr_pre_pilot_job_c_physical_sizing_results (
  id bigserial PRIMARY KEY,
  parent_job_id uuid NOT NULL REFERENCES ecr_pre_pilot_job_c_jobs(id),
  design_id integer NOT NULL REFERENCES ecr_pre_pilot_designs(id),
  created_by integer NOT NULL REFERENCES users(id),
  parent_result_hash varchar(64) NOT NULL,
  stage1_snapshot_hash varchar(64) NOT NULL,
  process_basis jsonb NOT NULL,
  input_snapshot jsonb NOT NULL,
  result_snapshot jsonb NOT NULL,
  result_hash varchar(64) NOT NULL,
  immutable_hash varchar(64) NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ecr_pre_pilot_job_c_physical_sizing_scope_idx
  ON ecr_pre_pilot_job_c_physical_sizing_results
     (created_by, design_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ecr_pre_pilot_job_c_physical_sizing_parent_idx
  ON ecr_pre_pilot_job_c_physical_sizing_results(parent_job_id, created_at DESC);

CREATE OR REPLACE FUNCTION protect_ecr_pre_pilot_job_c_physical_sizing_result()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Job C physical sizing results are immutable';
END $$;
DROP TRIGGER IF EXISTS ecr_pre_pilot_job_c_physical_sizing_results_immutable
  ON ecr_pre_pilot_job_c_physical_sizing_results;
CREATE TRIGGER ecr_pre_pilot_job_c_physical_sizing_results_immutable
BEFORE UPDATE OR DELETE ON ecr_pre_pilot_job_c_physical_sizing_results
FOR EACH ROW EXECUTE FUNCTION protect_ecr_pre_pilot_job_c_physical_sizing_result();