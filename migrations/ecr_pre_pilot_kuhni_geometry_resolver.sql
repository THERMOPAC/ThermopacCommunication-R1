CREATE TABLE IF NOT EXISTS ecr_pre_pilot_kuhni_geometry_resolver_runs (
  id bigserial PRIMARY KEY,
  design_id integer NOT NULL REFERENCES ecr_pre_pilot_designs(id),
  created_by integer NOT NULL REFERENCES users(id),
  stage1_snapshot_hash varchar(64) NOT NULL,
  stage2_job_id uuid REFERENCES ecr_pre_pilot_predictive_nt_jobs(id),
  stage2_result_hash varchar(64),
  parent_hydrodynamic_run_id bigint REFERENCES ecr_pre_pilot_kuhni_hydrodynamic_runs(id),
  parent_hydrodynamic_run_hash varchar(64),
  process_basis jsonb NOT NULL,
  theoretical_stage_authority jsonb NOT NULL,
  result_snapshot jsonb NOT NULL,
  implementation_hash varchar(64) NOT NULL,
  immutable_hash varchar(64) NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ecr_pre_pilot_kuhni_resolver_design_idx
  ON ecr_pre_pilot_kuhni_geometry_resolver_runs(design_id, created_at DESC);
CREATE OR REPLACE FUNCTION protect_ecr_pre_pilot_kuhni_resolver_run()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Kuhni geometry resolver runs are immutable'; END $$;
DROP TRIGGER IF EXISTS ecr_pre_pilot_kuhni_resolver_runs_immutable ON ecr_pre_pilot_kuhni_geometry_resolver_runs;
CREATE TRIGGER ecr_pre_pilot_kuhni_resolver_runs_immutable
  BEFORE UPDATE OR DELETE ON ecr_pre_pilot_kuhni_geometry_resolver_runs
  FOR EACH ROW EXECUTE FUNCTION protect_ecr_pre_pilot_kuhni_resolver_run();