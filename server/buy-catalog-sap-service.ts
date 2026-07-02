/**
 * Buy Catalog SAP Item Code Service
 *
 * Resolves or generates a compact SAP-compatible Item Code for a non-Raw-Material
 * Buy Package Catalog line using the 4-field identity:
 *   Group + Sub Group + Make + Model
 *
 * Generated code format: CAT-{GRP}-{0001}  (max 50 chars, SAP B1 compliant)
 * Full identity stored as separate columns: catalog_make, catalog_model,
 * buy_group_id, buy_subgroup_id — never embedded in the item code itself.
 */

import { Pool } from 'pg';

export interface CatalogSapResult {
  masterItemId: number;
  sapItemCode:  string;
  reused:       boolean;
}

/**
 * Group code → 3-char SAP prefix mapping.
 * Extend as new buy_groups are added.
 */
const GROUP_PREFIX: Record<string, string> = {
  pumps:              'PMP',
  motors:             'MOT',
  instruments:        'INS',
  valves:             'VLV',
  electrical_control: 'ELC',
  packages:           'PKG',
};

function groupPrefix(code: string): string {
  return GROUP_PREFIX[code.toLowerCase()] ?? code.slice(0, 3).toUpperCase();
}

/**
 * Find or create a master_items catalog record for the given 4-field identity.
 * Runs inside a serialisable transaction with a row-level lock to prevent
 * duplicate generation under concurrent requests.
 *
 * @param pool       - pg Pool
 * @param groupId    - buy_groups.id
 * @param subgroupId - buy_subgroups.id
 * @param make       - trimmed, finalized make string
 * @param model      - trimmed, finalized model/series string
 * @param uomCode    - uom label/code string for the master_items.uom field
 * @param description - human-readable description for the new record
 */
export async function resolveCatalogSapItemCode(
  pool:        Pool,
  groupId:     number,
  subgroupId:  number,
  make:        string,
  model:       string,
  uomCode:     string,
  description: string,
): Promise<CatalogSapResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1 — Try to find an existing catalog record for this exact identity.
    //     Use FOR UPDATE to lock the row and prevent concurrent duplicates.
    const existing = await client.query<{ id: number; item_code: string }>(
      `SELECT id, item_code
       FROM master_items
       WHERE item_type       = 'catalog'
         AND buy_group_id    = $1
         AND buy_subgroup_id = $2
         AND catalog_make    = $3
         AND catalog_model   = $4
       FOR UPDATE`,
      [groupId, subgroupId, make, model],
    );

    if (existing.rowCount && existing.rowCount > 0) {
      await client.query('COMMIT');
      return {
        masterItemId: existing.rows[0].id,
        sapItemCode:  existing.rows[0].item_code,
        reused:       true,
      };
    }

    // 2 — No match — generate a new code.
    //     Fetch the group code for prefix derivation.
    const grpRow = await client.query<{ code: string }>(
      `SELECT code FROM buy_groups WHERE id = $1`,
      [groupId],
    );
    const prefix = grpRow.rowCount && grpRow.rowCount > 0
      ? groupPrefix(grpRow.rows[0].code)
      : 'CAT';

    // Count existing catalog items in this group to determine next sequence.
    // Lock the count with pg_advisory_xact_lock to prevent race conditions.
    await client.query(`SELECT pg_advisory_xact_lock($1)`, [groupId + 900000]);

    const countRow = await client.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt
       FROM master_items
       WHERE item_type = 'catalog' AND buy_group_id = $1`,
      [groupId],
    );
    const seq = (parseInt(countRow.rows[0].cnt, 10) + 1).toString().padStart(4, '0');
    const itemCode = `CAT-${prefix}-${seq}`; // e.g. CAT-PMP-0001  (max ~12 chars, well within SAP 50-char limit)

    // 3 — Insert the new master_items record.
    const inserted = await client.query<{ id: number; item_code: string }>(
      `INSERT INTO master_items
         (item_code, description, uom, make_or_buy,
          item_type, buy_group_id, buy_subgroup_id, catalog_make, catalog_model,
          created_at, updated_at)
       VALUES ($1, $2, $3, 'Buy',
               'catalog', $4, $5, $6, $7,
               NOW(), NOW())
       RETURNING id, item_code`,
      [itemCode, description, uomCode, groupId, subgroupId, make, model],
    );

    await client.query('COMMIT');
    return {
      masterItemId: inserted.rows[0].id,
      sapItemCode:  inserted.rows[0].item_code,
      reused:       false,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
