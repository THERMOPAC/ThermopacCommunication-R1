CREATE TABLE IF NOT EXISTS ecr_pre_pilot_stage5_geometry_revisions (
  id BIGSERIAL PRIMARY KEY,
  design_id INTEGER NOT NULL REFERENCES ecr_pre_pilot_designs(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  revision INTEGER NOT NULL CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_hash TEXT NOT NULL,
  immutable_hash TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  UNIQUE (design_id, created_by, revision)
);
CREATE INDEX IF NOT EXISTS ecr_pre_pilot_stage5_geometry_scope_idx
  ON ecr_pre_pilot_stage5_geometry_revisions (design_id, created_by, revision DESC);