// One-off: create the CPS sizing calculation history table.
// This table stores one immutable row per successful Output Sizing calculation,
// preserving the exact KE snapshot and calculated outputs used for that run.
// Failed calculations are never recorded here.
import { pool } from '../server/db';

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cps_sizing_calculation_history (
      id                 SERIAL PRIMARY KEY,
      sizing_case_id     INTEGER NOT NULL REFERENCES cps_sizing_cases(id),
      treatment_scope    VARCHAR(30) NOT NULL,
      ke_snapshot        JSONB NOT NULL,
      calculated_outputs JSONB NOT NULL,
      calculated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      calculated_by      INTEGER NOT NULL REFERENCES users(id),
      CONSTRAINT cps_calc_hist_scope_chk
        CHECK (treatment_scope IN ('COLOUR_ODOR','COLOUR_ODOR_SULPHUR'))
    );
    CREATE INDEX IF NOT EXISTS cps_calc_hist_case_idx
      ON cps_sizing_calculation_history (sizing_case_id);
    CREATE INDEX IF NOT EXISTS cps_calc_hist_at_idx
      ON cps_sizing_calculation_history (calculated_at DESC);
  `);
  console.log('✓ cps_sizing_calculation_history table and indexes created (or already exist).');
  await pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
