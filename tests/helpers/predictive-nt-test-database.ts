import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

/**
 * Real PostgreSQL transactions and queue leases, but no engineering rows,
 * shared sequences, or public-schema fallback. Never clone live data.
 */
export async function createPredictiveNtTestDatabase() {
  if (process.env.NODE_ENV !== 'test') throw new Error('TEST_DATABASE_ONLY');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  neonConfig.webSocketConstructor = ws;
  const namespace = `test_predictive_nt_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${namespace}`,
  });
  let created = false;
  async function dispose() {
    await pool.end();
    try {
      // The identifier is generated here, never supplied by callers.
      if (created) {
        await admin.query(`DROP SCHEMA "${namespace}" CASCADE`);
        const remaining = await admin.query(
          'SELECT 1 FROM pg_namespace WHERE nspname = $1', [namespace],
        );
        if (remaining.rowCount !== 0) throw new Error('TEST_SCHEMA_CLEANUP_FAILED');
        created = false;
      }
    } finally {
      await admin.end();
    }
  }
  try {
    await admin.query(`CREATE SCHEMA "${namespace}"`);
    created = true;
    await pool.query(`
      CREATE TABLE users (id integer PRIMARY KEY, username text NOT NULL UNIQUE);
      INSERT INTO users VALUES (1, 'predictive-nt-regression-only');
      CREATE TABLE ecr_pre_pilot_number_counters (
        id integer PRIMARY KEY DEFAULT 1, next_number integer NOT NULL DEFAULT 1
      );
      CREATE TABLE ecr_pre_pilot_number_allocations (
        project_number integer PRIMARY KEY,
        allocation_key varchar(128) NOT NULL,
        allocated_by integer NOT NULL REFERENCES users(id),
        allocated_at timestamp NOT NULL DEFAULT now(),
        UNIQUE (allocated_by, allocation_key)
      );
      CREATE TABLE ecr_pre_pilot_designs (
        id serial PRIMARY KEY, project_number integer NOT NULL UNIQUE,
        allocation_key varchar(128) NOT NULL,
        created_by integer NOT NULL REFERENCES users(id),
        status varchar(20) NOT NULL DEFAULT 'draft',
        input_data jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        UNIQUE (created_by, allocation_key)
      );
    `);
    // Exercise the real queue constraints, immutable evidence, and history triggers.
    await pool.query(await readFile(
      new URL('../../migrations/ecr_pre_pilot_predictive_nt_jobs.sql', import.meta.url),
      'utf8',
    ));
    return { pool, namespace, userId: 1, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}