/**
 * Migration: Add 'ecr_simulator' to ECR-2 / Stage C5-S check constraints
 *
 * Widens three check constraints to accept the new 'ecr_simulator'
 * calculation_type for the ECR-2 simulator engine.
 *
 * ECR-1 ('ecr') is completely untouched — this is additive only.
 *
 * Run with: npx tsx scripts/migrate-ecr-simulator-calc-type.ts
 */

import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. design_software_calculation_runs ────────────────────────────────
    await client.query(`ALTER TABLE design_software_calculation_runs DROP CONSTRAINT IF EXISTS ds_calc_runs_type_chk`);
    await client.query(`
      ALTER TABLE design_software_calculation_runs
        ADD CONSTRAINT ds_calc_runs_type_chk
        CHECK (calculation_type IN (
          'process_design', 'hydraulics_common',
          'ecp', 'ecr', 'ecr_simulator',
          'mechanical_vessel'
        ))
    `);
    console.log('✅ ds_calc_runs_type_chk widened');

    // ── 2. design_software_results ─────────────────────────────────────────
    await client.query(`ALTER TABLE design_software_results DROP CONSTRAINT IF EXISTS ds_results_section_chk`);
    await client.query(`
      ALTER TABLE design_software_results
        ADD CONSTRAINT ds_results_section_chk
        CHECK (section IN (
          'process_design', 'hydraulics_common',
          'ecp', 'ecr', 'ecr_simulator',
          'comparison', 'summary', 'mechanical_vessel'
        ))
    `);
    console.log('✅ ds_results_section_chk widened');

    // ── 3. design_software_inputs ──────────────────────────────────────────
    await client.query(`ALTER TABLE design_software_inputs DROP CONSTRAINT IF EXISTS ds_inputs_section_chk`);
    await client.query(`
      ALTER TABLE design_software_inputs
        ADD CONSTRAINT ds_inputs_section_chk
        CHECK (section IN (
          'design_identity', 'design_basis', 'fluid_properties',
          'process_design', 'hydraulic_design', 'technology_selection',
          'equipment_design', 'technology_comparison', 'mechanical_design',
          'utilities', 'cost_estimation', 'design_validation',
          'reports', 'revision_control',
          'ecp', 'ecr', 'ecr_simulator', 'comparison',
          'ecp_design', 'ecr_design'
        ))
    `);
    console.log('✅ ds_inputs_section_chk widened');

    await client.query('COMMIT');
    console.log('✅ Migration complete — ecr_simulator calculation type added to all three check constraints.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed — rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
