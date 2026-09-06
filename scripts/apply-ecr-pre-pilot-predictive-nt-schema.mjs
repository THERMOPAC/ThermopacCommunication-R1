import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const migrationPaths = [
  'migrations/ecr_pre_pilot_predictive_nt_jobs.sql',
  'migrations/ecr_pre_pilot_job_c_jobs.sql',
  'migrations/ecr_pre_pilot_kuhni_hydrodynamics.sql',
  'migrations/ecr_pre_pilot_kuhni_geometry_resolver.sql',
].map((migrationPath) => path.resolve(process.cwd(), migrationPath));
const migration = migrationPaths.map((migrationPath) => fs.readFileSync(migrationPath, 'utf8')).join('\n');
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
  console.log('ECR Pre-Pilot persistence schema is current.');
} catch (error) {
  console.error('ECR Pre-Pilot persistence migration failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}