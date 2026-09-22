-- Separate JSON preferences only: never write the Stage 1 or active snapshots.
CREATE TABLE IF NOT EXISTS ecr_pre_pilot_stage5_end_sections (
  design_id INTEGER NOT NULL REFERENCES ecr_pre_pilot_designs(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  selection JSONB NOT NULL,
  source_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (design_id, created_by)
);