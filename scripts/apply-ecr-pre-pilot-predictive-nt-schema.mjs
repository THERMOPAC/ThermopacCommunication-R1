import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const migrationPath = path.resolve(
  process.cwd(),
  'migrations/ecr_pre_pilot_predictive_nt_jobs.sql',
);
const migration = fs.readFileSync(migrationPath, 'utf8');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(migration);
  console.log('Predictive N_T persistence schema is current.');
} catch (error) {
  console.error('Predictive N_T persistence migration failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}