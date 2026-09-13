-- Independent, evidence-led Stage-4 pre-pilot sizing.  This deliberately has
-- no Job-C parent: a calculated Stage-2 N_T, Stage-3 hydraulic envelope, and
-- reviewed physical evidence are its only inputs.
CREATE TABLE IF NOT EXISTS ecr_pre_pilot_stage4_pre_pilot_sizing_results (
  id bigserial PRIMARY KEY,
  design_id integer NOT NULL REFERENCES ecr_pre_pilot_designs(id),
  created_by integer NOT NULL REFERENCES users(id),
  stage1_snapshot_hash varchar(64) NOT NULL,
  stage2_job_id uuid NOT NULL REFERENCES ecr_pre_pilot_predictive_nt_jobs(id),
  stage2_result_hash varchar(64) NOT NULL,
  stage3_run_id bigint NOT NULL REFERENCES ecr_pre_pilot_kuhni_geometry_resolver_runs(id),
  stage3_immutable_hash varchar(64) NOT NULL,
  evidence_snapshot jsonb NOT NULL,
  result_snapshot jsonb NOT NULL,
  result_hash varchar(64) NOT NULL,
  immutable_hash varchar(64) NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ecr_pre_pilot_stage4_pre_pilot_sizing_scope_idx
  ON ecr_pre_pilot_stage4_pre_pilot_sizing_results
  (created_by, design_id, created_at DESC);

CREATE OR REPLACE FUNCTION protect_ecr_pre_pilot_stage4_pre_pilot_sizing_result()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Stage-4 pre-pilot sizing results are immutable';
END $$;
DROP TRIGGER IF EXISTS ecr_pre_pilot_stage4_pre_pilot_sizing_results_immutable
  ON ecr_pre_pilot_stage4_pre_pilot_sizing_results;
CREATE TRIGGER ecr_pre_pilot_stage4_pre_pilot_sizing_results_immutable
BEFORE UPDATE OR DELETE ON ecr_pre_pilot_stage4_pre_pilot_sizing_results
FOR EACH ROW EXECUTE FUNCTION protect_ecr_pre_pilot_stage4_pre_pilot_sizing_result();