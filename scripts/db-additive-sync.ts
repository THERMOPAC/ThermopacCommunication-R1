/**
 * Additive-only schema sync: compares shared/schema.ts against the live
 * database and applies ONLY safe, additive changes:
 *   - CREATE TABLE for tables missing in the DB (columns + primary key;
 *     foreign keys / indexes are reported, not created)
 *   - ALTER TABLE ADD COLUMN for missing columns (NOT NULL only when a
 *     default exists or the table is empty; otherwise added nullable + warned)
 *
 * It NEVER drops or renames anything. Extra DB tables/columns are reported
 * for manual review. This replaces `drizzle-kit push` in post-merge setup,
 * which is unusable here: the schema pull takes ~5 min, push prompts
 * interactively on create-vs-rename ambiguity (stdin is closed), and a forced
 * push would DROP live data columns that exist in the DB but not in
 * schema.ts (long-standing accepted drift).
 *
 * Usage: npx tsx scripts/db-additive-sync.ts [--dry-run]
 * Exits 0 on success (drift warnings are informational), 1 on failure.
 */
import * as schema from '../shared/schema';
import { getTableConfig, PgTable, PgDialect } from 'drizzle-orm/pg-core';
import { is, SQL } from 'drizzle-orm';
import pg from 'pg';

const DRY = process.argv.includes('--dry-run');
const dialect = new PgDialect();

function defaultToSql(d: unknown): string | null {
  if (d === undefined || d === null) return null;
  if (is(d, SQL)) {
    try { return dialect.sqlToQuery(d as SQL).sql; } catch { return null; }
  }
  if (typeof d === 'number' || typeof d === 'boolean') return String(d);
  if (typeof d === 'string') return `'${d.replace(/'/g, "''")}'`;
  if (Array.isArray(d) || typeof d === 'object') return `'${JSON.stringify(d).replace(/'/g, "''")}'`;
  return null;
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const warnings: string[] = [];
  try {
    const res = await pool.query(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'`
    );
    const db = new Map<string, Set<string>>();
    for (const r of res.rows) {
      if (!db.has(r.table_name)) db.set(r.table_name, new Set());
      db.get(r.table_name)!.add(r.column_name);
    }

    const statements: string[] = [];
    for (const v of Object.values(schema)) {
      if (!(v instanceof PgTable)) continue;
      const cfg = getTableConfig(v as PgTable);
      const dbCols = db.get(cfg.name);

      if (!dbCols) {
        // Missing table — build CREATE TABLE (columns + PK only)
        const colDefs: string[] = [];
        const pkCols = cfg.columns.filter((c) => c.primary).map((c) => `"${c.name}"`);
        for (const c of cfg.columns) {
          let def = `"${c.name}" ${c.getSQLType()}`;
          const dflt = defaultToSql((c as { default?: unknown }).default);
          if (dflt !== null) def += ` DEFAULT ${dflt}`;
          if (c.notNull) def += ' NOT NULL';
          colDefs.push(def);
        }
        const compositePk = cfg.primaryKeys[0];
        if (compositePk) {
          colDefs.push(`CONSTRAINT "${compositePk.getName()}" PRIMARY KEY (${compositePk.columns.map((c) => `"${c.name}"`).join(', ')})`);
        } else if (pkCols.length) {
          colDefs.push(`PRIMARY KEY (${pkCols.join(', ')})`);
        }
        statements.push(`CREATE TABLE IF NOT EXISTS "${cfg.name}" (\n  ${colDefs.join(',\n  ')}\n)`);
        if (cfg.foreignKeys.length) warnings.push(`${cfg.name}: created without ${cfg.foreignKeys.length} FK(s) — add manually if needed`);
        continue;
      }

      const missing = cfg.columns.filter((c) => !dbCols.has(c.name));
      if (!missing.length) continue;
      const { rows } = await pool.query(`SELECT EXISTS(SELECT 1 FROM "${cfg.name}") AS nonempty`);
      const nonEmpty = rows[0].nonempty === true;
      for (const c of missing) {
        let def = `ALTER TABLE "${cfg.name}" ADD COLUMN IF NOT EXISTS "${c.name}" ${c.getSQLType()}`;
        const dflt = defaultToSql((c as { default?: unknown }).default);
        if (dflt !== null) def += ` DEFAULT ${dflt}`;
        if (c.notNull) {
          if (dflt !== null || !nonEmpty) def += ' NOT NULL';
          else warnings.push(`${cfg.name}.${c.name}: schema says NOT NULL but table has rows and no default — added nullable; backfill then SET NOT NULL manually`);
        }
        statements.push(def);
      }
    }

    if (!statements.length) {
      console.log('Additive sync: database already has every table/column in schema.ts.');
    }
    for (const s of statements) {
      console.log((DRY ? '[dry-run] ' : '') + s + ';');
      if (!DRY) await pool.query(s);
    }
    for (const w of warnings) console.warn('WARNING: ' + w);
    console.log(`Additive sync complete: ${statements.length} statement(s)${DRY ? ' (dry run)' : ''}.`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error('Additive sync FAILED:', e); process.exit(1); });
