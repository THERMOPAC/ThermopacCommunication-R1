/**
 * Phase 2B — Pre-Phase-1 Unresolved Lines Backfill
 *
 * Resolves master_item_id and sap_item_code for all buy_package_lines rows
 * that were created before the spec-based builder system (Phase 1) was deployed
 * and therefore still have master_item_id = NULL.
 *
 * Scope: 7 spec-based subgroups with unresolved pre-Phase-1 lines
 *   Raw Materials — Plates, Pipes, Flanges, Structural Steel
 *   Motors       — Non-Flameproof, Flameproof
 *   Valves       — Isolation
 *
 * Usage:
 *   npx tsx scripts/phase2b-backfill.ts           — live run (wrapped in transaction)
 *   npx tsx scripts/phase2b-backfill.ts --dry-run — dry-run: show codes, no writes
 *   npx tsx scripts/phase2b-backfill.ts --rollback-test — run + rollback (confirm txn works)
 *
 * Behaviour:
 *   • Pre-run audit printed before any writes
 *   • Each line is attempted individually; errors are collected and reported
 *   • Live run uses a single DB transaction; any unhandled throw rolls back everything
 *   • Lines with incomplete or invalid attributes are skipped (logged) — not fatal
 *   • After-run counts printed at end
 *   • Exit code 0 = success (even if some lines were skipped); 1 = fatal error
 */

import { Pool, PoolClient } from 'pg';
import {
  resolvePlatesSapItemCode,
  resolvePipesSapItemCode,
  resolveFlangesSapItemCode,
  resolveStructuralSteelSapItemCode,
  resolveNfpMotorSapItemCode,
  resolveFlpMotorSapItemCode,
  resolveIsoValveSapItemCode,
} from '../server/buy-catalog-sap-service';

// ── Config ────────────────────────────────────────────────────────────────────

const DRY_RUN       = process.argv.includes('--dry-run');
const ROLLBACK_TEST = process.argv.includes('--rollback-test');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineRow {
  id:                   number;
  buy_group_id:         number;
  buy_subgroup_id:      number;
  group_code:           string;
  subgroup_code:        string;
  technical_attributes: Record<string, unknown> | null;
  uom_code:             string;
  generic_requirement:  string | null;
}

interface LineResult {
  lineId:      number;
  subgroup:    string;
  status:      'resolved' | 'skipped' | 'error';
  sapItemCode?: string;
  reused?:     boolean;
  message?:    string;
}

// ── Helper: build description per subgroup ────────────────────────────────────

function buildDesc(row: LineRow): string {
  const g = (k: string) =>
    ((row.technical_attributes?.[k] as string | undefined) ?? '').trim();

  switch (row.subgroup_code) {
    case 'plates':
      return `${g('material_grade')} Plate — ${g('thickness_mm')} × ${g('width_mm')} × ${g('length_mm')} mm`.slice(0, 255);
    case 'pipes':
      return `${g('material_grade')} Pipe — ${g('nominal_bore')} — ${g('schedule')}`.replace(/ —\s*$/, '').slice(0, 255);
    case 'flanges':
      return `${g('flange_type')} — ${g('standard')} — ${g('size_nb')} — ${g('pressure')} — ${g('material')}`.replace(/ —\s*$/, '').slice(0, 255);
    case 'structural_steel':
      return `${g('section_type')} — ${g('material_grade')}`.replace(/ —\s*$/, '').slice(0, 255);
    case 'non_flameproof':
      return `Non-Flameproof Motor — ${g('motor_type')} — ${g('power')} kW`.slice(0, 255);
    case 'flameproof':
      return `Flameproof Motor — ${g('motor_type')} — ${g('power')} kW`.slice(0, 255);
    case 'isolation':
      return (row.generic_requirement ?? `Isolation Valve — ${g('valve_type')} — ${g('size_nb')}`).slice(0, 255);
    default:
      return (row.generic_requirement ?? row.subgroup_code).slice(0, 255);
  }
}

// ── Helper: call the correct resolver per subgroup ────────────────────────────

async function resolveForLine(
  client:  PoolClient,
  row:     LineRow,
): Promise<{ masterItemId: number; sapItemCode: string; reused: boolean }> {
  const attrs   = row.technical_attributes ?? {};
  const uom     = row.uom_code;
  const desc    = buildDesc(row);
  const gid     = row.buy_group_id;
  const sid     = row.buy_subgroup_id;

  // Use the pool-compatible client wrapper the resolvers expect
  // (Pool and PoolClient share the .query() interface used by getOrCreateCatalogMasterItem)
  const db = client as unknown as Pool;

  switch (row.subgroup_code) {
    case 'plates':           return resolvePlatesSapItemCode(db, gid, sid, attrs, uom, desc);
    case 'pipes':            return resolvePipesSapItemCode(db, gid, sid, attrs, uom, desc);
    case 'flanges':          return resolveFlangesSapItemCode(db, gid, sid, attrs, uom, desc);
    case 'structural_steel': return resolveStructuralSteelSapItemCode(db, gid, sid, attrs, uom, desc);
    case 'non_flameproof':   return resolveNfpMotorSapItemCode(db, gid, sid, attrs, uom, desc);
    case 'flameproof':       return resolveFlpMotorSapItemCode(db, gid, sid, attrs, uom, desc);
    case 'isolation':        return resolveIsoValveSapItemCode(db, gid, sid, attrs, uom, desc);
    default:
      throw new Error(`No resolver registered for subgroup "${row.subgroup_code}"`);
  }
}

// ── Fetch unresolved lines ────────────────────────────────────────────────────

async function fetchUnresolvedLines(client: PoolClient): Promise<LineRow[]> {
  const { rows } = await client.query<LineRow>(`
    SELECT
      bpl.id,
      bpl.buy_group_id,
      bpl.buy_subgroup_id,
      bg.code                                       AS group_code,
      bs.code                                       AS subgroup_code,
      bpl.technical_attributes::jsonb               AS technical_attributes,
      COALESCE(u.code, 'Nos')                       AS uom_code,
      bpl.generic_requirement
    FROM buy_package_lines bpl
    JOIN buy_subgroups bs ON bs.id = bpl.buy_subgroup_id
    JOIN buy_groups    bg ON bg.id = bs.buy_group_id
    LEFT JOIN uom_master u ON u.id = bpl.uom_id
    WHERE (bpl.master_item_id IS NULL OR bpl.sap_item_code IS NULL)
      AND bg.code IN ('raw_materials', 'motors', 'valves')
      AND bs.code IN ('plates','pipes','flanges','structural_steel',
                      'non_flameproof','flameproof','isolation')
    ORDER BY bg.code, bs.code, bpl.id
  `);
  return rows;
}

// ── Pre-run audit ─────────────────────────────────────────────────────────────

async function printPreRunAudit(lines: LineRow[]): Promise<void> {
  const bySubgroup: Record<string, number> = {};
  for (const row of lines) {
    const k = `${row.group_code} / ${row.subgroup_code}`;
    bySubgroup[k] = (bySubgroup[k] ?? 0) + 1;
  }
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('PHASE 2B BACKFILL — PRE-RUN AUDIT');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (no writes)' : ROLLBACK_TEST ? 'ROLLBACK-TEST (will roll back)' : 'LIVE (transaction commit)'}`);
  console.log('\nUnresolved lines by subgroup (BEFORE):');
  let total = 0;
  for (const [k, n] of Object.entries(bySubgroup)) {
    console.log(`  ${k.padEnd(40)} ${n} lines`);
    total += n;
  }
  console.log(`  ${'TOTAL'.padEnd(40)} ${total} lines`);
  console.log('────────────────────────────────────────────────────────────');
}

// ── After-run count ───────────────────────────────────────────────────────────

async function printAfterCounts(client: PoolClient): Promise<void> {
  const { rows } = await client.query<{ subgroup_code: string; unresolved: string }>(`
    SELECT bs.code AS subgroup_code, COUNT(*) AS unresolved
    FROM buy_package_lines bpl
    JOIN buy_subgroups bs ON bs.id = bpl.buy_subgroup_id
    JOIN buy_groups    bg ON bg.id = bs.buy_group_id
    WHERE (bpl.master_item_id IS NULL OR bpl.sap_item_code IS NULL)
      AND bg.code IN ('raw_materials', 'motors', 'valves')
      AND bs.code IN ('plates','pipes','flanges','structural_steel',
                      'non_flameproof','flameproof','isolation')
    GROUP BY bs.code
    ORDER BY bs.code
  `);
  console.log('\nUnresolved lines by subgroup (AFTER):');
  if (rows.length === 0) {
    console.log('  ✅ Zero unresolved lines remaining across all targeted subgroups.');
  } else {
    for (const r of rows) {
      console.log(`  ${r.subgroup_code.padEnd(40)} ${r.unresolved} remaining`);
    }
  }
}

// ── Main run ──────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const client = await pool.connect();
  const results: LineResult[] = [];

  try {
    // Always fetch count outside a transaction for the pre-run audit
    await client.query('BEGIN');
    const lines = await fetchUnresolvedLines(client);

    await printPreRunAudit(lines);

    if (lines.length === 0) {
      console.log('\nNothing to do — no unresolved lines found.');
      await client.query('ROLLBACK');
      return;
    }

    if (DRY_RUN) {
      // ── DRY-RUN: attempt resolution in-memory, no DB writes ──────────────
      console.log('\nDRY-RUN: attempting code generation (no DB writes)...\n');
      for (const row of lines) {
        try {
          // Import pure builder functions via dynamic import to avoid pool writes
          // Call the builder function directly (pure, no DB side-effects)
          const attrs   = row.technical_attributes ?? {};
          let sapCode: string;

          // Inline pure-builder calls (no DB side effects)
          const { buildFlangesItemCode, buildPipesItemCode, buildPlatesItemCode,
                  buildStructuralSteelItemCode, buildFittingsItemCode } =
            await import('../server/buy-catalog-sap-service');

          switch (row.subgroup_code) {
            case 'plates':           sapCode = buildPlatesItemCode(attrs); break;
            case 'pipes':            sapCode = buildPipesItemCode(attrs); break;
            case 'flanges':          sapCode = buildFlangesItemCode(attrs); break;
            case 'structural_steel': sapCode = buildStructuralSteelItemCode(attrs); break;
            // Motors and Isolation have DB-dependant resolvers with no pure builder export;
            // for dry-run we call the resolver with a savepoint and roll back
            default: {
              await client.query(`SAVEPOINT dryrun_${row.id}`);
              try {
                const r = await resolveForLine(client, row);
                sapCode = r.sapItemCode;
              } finally {
                await client.query(`ROLLBACK TO SAVEPOINT dryrun_${row.id}`);
                await client.query(`RELEASE SAVEPOINT dryrun_${row.id}`);
              }
            }
          }
          results.push({ lineId: row.id, subgroup: row.subgroup_code, status: 'resolved', sapItemCode: sapCode });
          console.log(`  ✓ line ${row.id.toString().padStart(5)} [${row.subgroup_code}] → ${sapCode}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          results.push({ lineId: row.id, subgroup: row.subgroup_code, status: 'skipped', message: msg });
          console.log(`  ✗ line ${row.id.toString().padStart(5)} [${row.subgroup_code}] SKIP: ${msg}`);
        }
      }
      await client.query('ROLLBACK');
    } else {
      // ── LIVE RUN: resolve + UPDATE inside transaction ─────────────────────
      console.log('\nResolving and writing master_item_id / sap_item_code...\n');

      for (const row of lines) {
        try {
          const resolved = await resolveForLine(client, row);
          await client.query(
            `UPDATE buy_package_lines
             SET master_item_id = $1, sap_item_code = $2
             WHERE id = $3`,
            [resolved.masterItemId, resolved.sapItemCode, row.id],
          );
          results.push({
            lineId: row.id, subgroup: row.subgroup_code,
            status: 'resolved', sapItemCode: resolved.sapItemCode, reused: resolved.reused,
          });
          console.log(`  ✓ line ${row.id.toString().padStart(5)} [${row.subgroup_code}] → ${resolved.sapItemCode}${resolved.reused ? ' (reused)' : ' (new)'}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          results.push({ lineId: row.id, subgroup: row.subgroup_code, status: 'skipped', message: msg });
          console.log(`  ✗ line ${row.id.toString().padStart(5)} [${row.subgroup_code}] SKIP: ${msg}`);
        }
      }

      if (ROLLBACK_TEST) {
        console.log('\n⚠️  ROLLBACK-TEST mode — rolling back transaction now.');
        await printAfterCounts(client);  // show counts before rollback
        await client.query('ROLLBACK');
        console.log('✅ Transaction rolled back successfully. Database unchanged.');
      } else {
        await printAfterCounts(client);
        await client.query('COMMIT');
        console.log('\n✅ Transaction committed.');
      }
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ FATAL ERROR — transaction rolled back:', err);
    process.exitCode = 1;
  } finally {
    client.release();
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const resolvedRows = results.filter(r => r.status === 'resolved');
  const skippedRows  = results.filter(r => r.status === 'skipped');
  const errorRows    = results.filter(r => r.status === 'error');
  const newMaster    = resolvedRows.filter(r => r.reused === false).length;
  const reusedMaster = resolvedRows.filter(r => r.reused === true).length;

  // Skipped reasons grouped
  const skipByReason: Record<string, number> = {};
  for (const r of skippedRows) {
    // Condense long error to first sentence for grouping
    const key = (r.message ?? 'Unknown').split('\n')[0].slice(0, 120);
    skipByReason[key] = (skipByReason[key] ?? 0) + 1;
  }

  // Resolved per subgroup
  const resolvedBySubgroup: Record<string, number> = {};
  for (const r of resolvedRows) {
    resolvedBySubgroup[r.subgroup] = (resolvedBySubgroup[r.subgroup] ?? 0) + 1;
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`PHASE 2B BACKFILL — FINAL SUMMARY${DRY_RUN ? ' (DRY-RUN)' : ''}`);
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Total records processed   : ${results.length}`);
  console.log(`  Successfully resolved     : ${resolvedRows.length}`);
  console.log(`    New master_items created: ${newMaster}`);
  console.log(`    Existing master reused  : ${reusedMaster}`);
  console.log(`  Skipped (attr incomplete) : ${skippedRows.length}`);
  console.log(`  Errors (unexpected)       : ${errorRows.length}`);

  if (resolvedRows.length > 0) {
    console.log('\n  Resolved by subgroup:');
    for (const [sg, n] of Object.entries(resolvedBySubgroup)) {
      console.log(`    ${sg.padEnd(30)} ${n}`);
    }
  }

  if (skippedRows.length > 0) {
    console.log('\n  Skip reasons (grouped):');
    for (const [reason, count] of Object.entries(skipByReason)) {
      console.log(`    [${count}x] ${reason}`);
    }
  }

  console.log('════════════════════════════════════════════════════════════');

  if (DRY_RUN) {
    console.log('  DRY-RUN: no changes written. Run without --dry-run to apply.\n');
  }
}

run().finally(() => pool.end());
