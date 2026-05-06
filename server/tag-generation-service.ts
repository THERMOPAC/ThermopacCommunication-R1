/**
 * Tag Generation Service — EPC-grade Tag Number control
 * ────────────────────────────────────────────────────────
 * Prefix map, sequence generation (advisory-lock-safe),
 * uniqueness checks, and audit logging for Project BUY List lines.
 *
 * Rules:
 *  • Tags exist ONLY on project_buy_list_lines — never on catalog
 *  • Raw Materials group → no tag (returns null / '')
 *  • Tags are unique across the entire project (all buy lists)
 *  • Sequence generation uses pg_advisory_xact_lock to prevent races
 *  • Every manual tag change is written to tag_no_audit_log
 */

import type { Pool, PoolClient } from 'pg';

// ── Constants ──────────────────────────────────────────────────────────────────

export const RAW_MATERIALS_CODE = 'raw_materials';

/** Subgroup code → tag prefix.  null = not a tagged item (no tag generated). */
export const TAG_PREFIXES: Record<string, string | null> = {
  pressure:      'PT',
  temperature:   'TT',
  flow:          'FT',
  level:         'LT',
  isolation:     'XV',
  control:       'CV',
  safety:        'PSV',
  on_off:        'XV',
  pump_skid:     'P',
  cooling_tower: 'CT',
  junction_box:  'JB',
  non_flameproof:'M',
  flameproof:    'M',
  motors:        'M',
  panels:        null,
  cabling:       null,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

export function getPrefixForSubgroup(subgroupCode: string): string | null {
  if (!(subgroupCode in TAG_PREFIXES)) return null;
  return TAG_PREFIXES[subgroupCode];
}

export function isTaggableSubgroup(subgroupCode: string): boolean {
  return !!getPrefixForSubgroup(subgroupCode);
}

/** Parse the numeric suffix from a tag like "PT-101" → 101. Returns NaN on bad input. */
function parseTagSeq(tagNo: string): number {
  const parts = tagNo.split('-');
  return parseInt(parts[parts.length - 1], 10);
}

/** Find the current max sequence for a prefix within a project by scanning existing tags. */
async function findMaxSeq(client: PoolClient | Pool, projectId: number, prefix: string): Promise<number> {
  const result = await (client as any).query<{ tag_no: string }>(
    `SELECT tag_no FROM project_buy_list_lines WHERE project_id = $1 AND tag_no LIKE $2`,
    [projectId, `${prefix}-%`],
  );
  let maxSeq = 100;
  for (const row of result.rows) {
    const n = parseTagSeq(row.tag_no);
    if (!isNaN(n) && n > maxSeq) maxSeq = n;
  }
  return maxSeq;
}

// ── Tag generation (must run inside advisory-locked transaction) ───────────────

/**
 * Generate ONE tag inside an already-open transaction that holds
 * pg_advisory_xact_lock(projectId).
 * Returns null for non-taggable subgroups (caller must handle).
 */
export async function getNextTagNoInTx(
  client: PoolClient,
  projectId: number,
  subgroupCode: string,
): Promise<string | null> {
  const prefix = getPrefixForSubgroup(subgroupCode);
  if (!prefix) return null;
  const maxSeq = await findMaxSeq(client, projectId, prefix);
  return `${prefix}-${maxSeq + 1}`;
}

/**
 * Generate N sequential tags inside an already-open advisory-locked transaction.
 * Returns [] for non-taggable subgroups.
 */
export async function getNextNTagNosInTx(
  client: PoolClient,
  projectId: number,
  subgroupCode: string,
  n: number,
): Promise<string[]> {
  const prefix = getPrefixForSubgroup(subgroupCode);
  if (!prefix || n < 1) return [];
  const maxSeq = await findMaxSeq(client, projectId, prefix);
  return Array.from({ length: n }, (_, i) => `${prefix}-${maxSeq + 1 + i}`);
}

// ── Preview (no lock — for UI display only) ────────────────────────────────────

/**
 * Preview the next tag(s) WITHOUT a transaction lock.
 * Safe for UI preview — the actual tag is re-confirmed inside the INSERT transaction.
 * qty defaults to 1.
 */
export async function previewNextTagNos(
  pool: Pool,
  projectId: number,
  subgroupCode: string,
  qty = 1,
): Promise<string[]> {
  const prefix = getPrefixForSubgroup(subgroupCode);
  if (!prefix) return [];
  const maxSeq = await findMaxSeq(pool, projectId, prefix);
  return Array.from({ length: Math.max(1, qty) }, (_, i) => `${prefix}-${maxSeq + 1 + i}`);
}

// ── Uniqueness check (read-only, no lock needed) ───────────────────────────────

/**
 * Check that a tag is unique across the entire project.
 * Returns true  → tag is unique (safe to use).
 * Returns false → duplicate found.
 *
 * Pass excludeLineId when editing an existing line so the line's own tag
 * does not falsely fail the check.
 */
export async function isTagNoUnique(
  pool: Pool,
  projectId: number,
  tagNo: string,
  excludeLineId?: number,
): Promise<boolean> {
  const params: unknown[] = [projectId, tagNo];
  let sql = `SELECT 1 FROM project_buy_list_lines
             WHERE project_id = $1 AND tag_no = $2 AND tag_no <> ''`;
  if (excludeLineId) {
    sql += ` AND id != $3`;
    params.push(excludeLineId);
  }
  const result = await pool.query(sql, params);
  return (result.rowCount ?? 0) === 0;
}

// ── Audit logging ──────────────────────────────────────────────────────────────

/**
 * Write one row to tag_no_audit_log whenever a tag is manually changed.
 * Called after a successful UPDATE in the PATCH route.
 */
export async function logTagNoChange(
  pool: Pool,
  lineId: number,
  headerId: number,
  projectId: number,
  oldTagNo: string,
  newTagNo: string,
  changedBy: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO tag_no_audit_log
       (line_id, header_id, project_id, old_tag_no, new_tag_no, changed_by, changed_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [lineId, headerId, projectId, oldTagNo, newTagNo, changedBy],
  );
}
