/**
 * Buy Catalog SAP Item Code Service
 *
 * Resolves or generates an SAP-compatible Item Code for a non-Raw-Material
 * Buy Package Catalog line using the 4-field identity:
 *   Group + Sub Group + Make + Model → unique SAP Item Code
 *
 * Generated code format: {GRP}-{SUB}-{MAKE}-{MODEL}  (max 50 chars, SAP B1 compliant)
 * Example: PMP-CEN-KSB-CPKEY 65-200
 *
 * The code is deterministic — the same identity always produces the same code.
 * Full identity also stored as separate columns: catalog_make, catalog_model,
 * buy_group_id, buy_subgroup_id.
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

export function groupPrefix(code: string): string {
  return GROUP_PREFIX[code.toLowerCase()] ?? code.slice(0, 3).toUpperCase();
}

/**
 * Subgroup code → 2–3-char SAP abbreviation mapping.
 * Replaces the old literal "-CAT-" segment so each subgroup produces a unique code.
 * Fallback: first 3 chars of code, uppercased.
 */
const SUBGROUP_PREFIX: Record<string, string> = {
  centrifugal:      'CEN',
  gear:             'GER',
  screw:            'SCW',
  multistage:       'MTS',
  dosing_metering:  'DOS',
  vacuum_boosters:  'VCB',
  vacuum_pump:      'VCP',
  hand_pump:        'HND',
  pump_skid:        'PSK',
  control:          'CTL',
  safety:           'SFT',
  isolation:        'ISO',
  needle:           'NDL',
  nrv:              'NRV',
  on_off:           'ONF',
  pressure:         'PRE',
  temperature:      'TMP',
  flow:             'FLW',
  level:            'LVL',
  flameproof:       'FLP',
  non_flameproof:   'NFP',
  junction_box:     'JBX',
  panels:           'PNL',
  cabling:          'CBL',
  field_items:      'FLD',
  components:       'CMP',
  general:          'GEN',
  cooling_tower:    'CTW',
  pipes:            'PIP',
  fittings:         'FIT',
  flanges:          'FLN',
  gaskets:          'GSK',
  fasteners:        'FST',
  plates:           'PLT',
  structural_steel: 'STR',
};

export function subgroupPrefix(code: string): string {
  return SUBGROUP_PREFIX[code.toLowerCase()] ?? code.slice(0, 3).toUpperCase();
}

/** SAP B1 hard limit for Item Codes */
export const SAP_ITEM_CODE_MAX_LEN = 50;

/**
 * Build the deterministic SAP Item Code from the 4-field identity.
 * Format: {GRP_PREFIX}-{SUB_PREFIX}-{MAKE}-{MODEL}  e.g. PMP-CEN-KSB-CPKEY 65-200
 *
 * Returns the code string (may exceed SAP_ITEM_CODE_MAX_LEN — callers must
 * check `.length` and reject if > 50 chars; never truncate silently).
 */
export function buildCatalogItemCode(
  grpPrefix: string,
  subPrefix: string,
  make: string,
  model: string,
): string {
  return `${grpPrefix}-${subPrefix}-${make}-${model}`;
}

/**
 * Throw a user-friendly error if the code would exceed the SAP B1 50-char limit.
 * Call this before any INSERT.
 */
export function assertSapCodeLength(code: string): void {
  if (code.length > SAP_ITEM_CODE_MAX_LEN) {
    throw Object.assign(
      new Error(
        `SAP Item Code "${code}" is ${code.length} characters — exceeds the SAP B1 limit of ${SAP_ITEM_CODE_MAX_LEN}. ` +
        `Shorten the Make or Model so the combined code fits within 50 characters.`,
      ),
      { sapCodeTooLong: true, generatedCode: code, codeLength: code.length },
    );
  }
}

/**
 * Find or create a master_items catalog record for the given 4-field identity.
 * The item code is deterministic (no counter), so concurrent requests for the
 * same identity are safe — only one INSERT wins; the other reuses via SELECT.
 *
 * @param pool        - pg Pool
 * @param groupId     - buy_groups.id
 * @param subgroupId  - buy_subgroups.id
 * @param make        - trimmed, finalized make string
 * @param model       - trimmed, finalized model/series string
 * @param uomCode     - uom code string for the master_items.uom field
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

    // 2 — No match — build the deterministic code from group + subgroup + make + model.
    const grpRow = await client.query<{ code: string }>(
      `SELECT code FROM buy_groups WHERE id = $1`,
      [groupId],
    );
    const sgRow = await client.query<{ code: string }>(
      `SELECT code FROM buy_subgroups WHERE id = $1`,
      [subgroupId],
    );
    const grpPfx  = grpRow.rowCount && grpRow.rowCount > 0 ? groupPrefix(grpRow.rows[0].code)   : 'GEN';
    const sgPfx   = sgRow.rowCount  && sgRow.rowCount  > 0 ? subgroupPrefix(sgRow.rows[0].code) : 'GEN';
    const itemCode = buildCatalogItemCode(grpPfx, sgPfx, make, model);

    // Hard-block: never insert a code that exceeds SAP B1's 50-char limit.
    assertSapCodeLength(itemCode);

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
