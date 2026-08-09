// One-off: create CPS Sizing Tool — Customer Input cases table (Phase 2 inputs, definition approved).
// Idempotent. No sizing calculations — input capture only.
import { pool } from '../server/db';

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cps_sizing_cases (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER REFERENCES customers(id),
      customer_name TEXT NOT NULL,
      plant_location TEXT NOT NULL,
      cps_feed_capacity NUMERIC NOT NULL CHECK (cps_feed_capacity > 0),
      rrbo_grade VARCHAR(20) NOT NULL,
      feed_oil_visc_40c NUMERIC NOT NULL CHECK (feed_oil_visc_40c > 0),
      treatment_scope VARCHAR(30) NOT NULL,
      inlet_colour NUMERIC NOT NULL,
      target_colour NUMERIC NOT NULL,
      inlet_sulphur NUMERIC,
      target_sulphur NUMERIC,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_by INTEGER NOT NULL REFERENCES users(id),
      CONSTRAINT cps_scases_scope_chk CHECK (treatment_scope IN ('COLOUR_ODOR', 'COLOUR_ODOR_SULPHUR')),
      -- Conditional sulphur rule: colour-only cases store NULL sulphur (never 0);
      -- sulphur cases require both sulphur fields.
      CONSTRAINT cps_scases_sulphur_chk CHECK (
        (treatment_scope = 'COLOUR_ODOR' AND inlet_sulphur IS NULL AND target_sulphur IS NULL)
        OR
        (treatment_scope = 'COLOUR_ODOR_SULPHUR' AND inlet_sulphur IS NOT NULL AND target_sulphur IS NOT NULL)
      )
    );
    CREATE INDEX IF NOT EXISTS cps_scases_customer_idx ON cps_sizing_cases (customer_id);
  `);
  console.log('cps_sizing_cases table ready.');
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
