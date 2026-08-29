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
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await pool.query(migration);
      break;
    } catch (error) {
      const isDeadlock = error?.code === '40P01';
      if (!isDeadlock || attempt === maxAttempts) throw error;
      const delayMs = attempt * 500;
      console.warn(
        `Predictive N_T schema migration deadlocked; retrying in ${delayMs} ms ` +
        `(attempt ${attempt + 1}/${maxAttempts}).`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  console.log('Predictive N_T persistence schema is current.');
} catch (error) {
  console.error('Predictive N_T persistence migration failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}