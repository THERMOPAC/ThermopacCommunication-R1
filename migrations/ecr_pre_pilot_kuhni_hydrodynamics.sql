CREATE TABLE IF NOT EXISTS ecr_pre_pilot_kuhni_hydrodynamic_runs (
  id bigserial PRIMARY KEY,
  design_id integer NOT NULL REFERENCES ecr_pre_pilot_designs(id),
  created_by integer NOT NULL REFERENCES users(id),
  stage1_snapshot_hash varchar(64) NOT NULL,
  process_basis jsonb NOT NULL,
  input_snapshot jsonb NOT NULL,
  result_snapshot jsonb NOT NULL,
  implementation_hash varchar(64) NOT NULL,
  immutable_hash varchar(64) NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ecr_pre_pilot_kuhni_runs_design_idx ON ecr_pre_pilot_kuhni_hydrodynamic_runs(design_id, created_at DESC);
CREATE OR REPLACE FUNCTION protect_ecr_pre_pilot_kuhni_run()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Kuhni hydrodynamic runs are immutable'; END $$;
DROP TRIGGER IF EXISTS ecr_pre_pilot_kuhni_runs_immutable ON ecr_pre_pilot_kuhni_hydrodynamic_runs;
CREATE TRIGGER ecr_pre_pilot_kuhni_runs_immutable BEFORE UPDATE OR DELETE ON ecr_pre_pilot_kuhni_hydrodynamic_runs FOR EACH ROW EXECUTE FUNCTION protect_ecr_pre_pilot_kuhni_run();