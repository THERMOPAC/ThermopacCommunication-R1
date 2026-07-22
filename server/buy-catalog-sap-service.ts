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

// ── NFP Motor Spec-Based Item Code ───────────────────────────────────────────

/** Motor Type display name → 3–4 char short code for NFP item code */
const MOTOR_TYPE_CODE: Record<string, string> = {
  'Induction':                    'IND',
  'Brake Motor':                  'BRK',
  'VFD Duty':                     'VFD',
  'Synchronous':                  'SYN',
  'Permanent Magnet Synchronous': 'PMS',
  'Wound Rotor Motor':            'WRM',
};

/** Mounting display label OR bare IEC code → canonical IEC code */
const MOUNTING_CODE: Record<string, string> = {
  'Horizontal (B3)':    'B3',
  'Flange Mounted (B5)':'B5',
  'Foot + Flange (B35)':'B35',
  'Vertical (V1)':      'V1',
  'Vertical (V3)':      'V3',
  'Vertical (V5)':      'V5',
  'Vertical (V6)':      'V6',
  // bare IEC codes accepted directly
  'B3': 'B3', 'B5': 'B5', 'B14': 'B14', 'B35': 'B35',
  'V1': 'V1', 'V3': 'V3', 'V5': 'V5',   'V6': 'V6',
};

/** Voltage display label OR bare numeric → numeric string for item code */
const VOLTAGE_CODE: Record<string, string> = {
  '230 V': '230',   '415 V': '415',   '440 V': '440',
  '525 V': '525',   '690 V': '690',   '3300 V': '3300',
  '6600 V': '6600', '11000 V': '11000',
  '230': '230', '415': '415', '440': '440',
  '525': '525', '690': '690', '3300': '3300',
  '6600': '6600', '11000': '11000',
};

/** Frequency display label OR bare numeric → numeric string for item code */
const FREQUENCY_CODE: Record<string, string> = {
  '50 Hz': '50', '60 Hz': '60', '50': '50', '60': '60',
};

/**
 * Encode an IEC motor power rating (kW) as a sort-safe P-notation string.
 *
 * Rules:
 *   Whole kW  → 3-digit zero-padded integer      e.g. 15   → "015"
 *   Sub-1 kW  → "000P{2-digit centesimal}"        e.g. 0.37 → "000P37"
 *   Fractional ≥1 kW → "{3d}P{decimal, no trailing zeros}"
 *                                                  e.g. 1.1  → "001P1"
 *                                                       18.5 → "018P5"
 *
 * Lexicographic order equals numeric order for all standard IEC ratings.
 */
export function encodePowerRating(kw: string): string {
  const num = parseFloat(kw);
  if (isNaN(num) || num <= 0) throw new Error(`Invalid power rating: "${kw}"`);
  if (Number.isInteger(num)) return String(num).padStart(3, '0');
  const str    = num.toString();
  const dotIdx = str.indexOf('.');
  const intPart = str.slice(0, dotIdx);
  const decPart = str.slice(dotIdx + 1);
  return `${intPart.padStart(3, '0')}P${decPart}`;
}

/**
 * Build the deterministic NFP Motor SAP Item Code from technical_attributes.
 * Format: MOT-NFP-{MotorType}-{Mounting}-{Power}-{Voltage}-{Freq}-{Poles}-{Efficiency}
 * Example: MOT-NFP-IND-B3-015-415-50-4-IE3   (32 chars)
 *
 * Throws a descriptive error if any required attribute is missing or unrecognised.
 */
export function buildNfpMotorItemCode(attrs: Record<string, unknown>): string {
  const motorTypeRaw = (attrs.motor_type       as string | undefined)?.trim() ?? '';
  const mountingRaw  = (attrs.mounting          as string | undefined)?.trim() ?? '';
  const powerRaw     = (attrs.power             as string | undefined)?.trim() ?? '';
  const voltageRaw   = (attrs.voltage           as string | undefined)?.trim() ?? '';
  const freqRaw      = (attrs.frequency         as string | undefined)?.trim() ?? '';
  const polesRaw     = ((attrs.num_poles ?? attrs.poles) as string | undefined)?.trim() ?? '';
  const effRaw       = (attrs.efficiency_class  as string | undefined)?.trim() ?? '';

  const motorType = MOTOR_TYPE_CODE[motorTypeRaw];
  const mounting  = MOUNTING_CODE[mountingRaw];
  const voltage   = VOLTAGE_CODE[voltageRaw];
  const frequency = FREQUENCY_CODE[freqRaw];
  const poles     = polesRaw.replace(/[^0-9]/g, '');
  const efficiency = effRaw;

  let powerCode: string | undefined;
  try { powerCode = powerRaw ? encodePowerRating(powerRaw) : undefined; } catch { /* leave undefined */ }

  const missing: string[] = [];
  if (!motorType)  missing.push(`Motor Type ("${motorTypeRaw}" — must be one of: Induction, Brake Motor, VFD Duty, Synchronous, Permanent Magnet Synchronous, Wound Rotor Motor)`);
  if (!mounting)   missing.push(`Mounting ("${mountingRaw}")`);
  if (!powerCode)  missing.push(`Power Rating ("${powerRaw}")`);
  if (!voltage)    missing.push(`Voltage ("${voltageRaw}")`);
  if (!frequency)  missing.push(`Frequency ("${freqRaw}")`);
  if (!poles)      missing.push('Number of Poles');
  if (!efficiency) missing.push('Efficiency Class');

  if (missing.length > 0)
    throw new Error(`Cannot generate NFP Motor SAP Item Code — missing or unrecognised: ${missing.join('; ')}`);

  return `MOT-NFP-${motorType}-${mounting}-${powerCode}-${voltage}-${frequency}-${poles}-${efficiency}`;
}

/**
 * Find or create a master_items catalog record for an NFP Motor specification.
 * The item_code is the unique lookup key (spec-based, deterministic — no make/model).
 */
export async function resolveNfpMotorSapItemCode(
  pool:        Pool,
  groupId:     number,
  subgroupId:  number,
  attrs:       Record<string, unknown>,
  uomCode:     string,
  description: string,
): Promise<CatalogSapResult> {
  const itemCode = buildNfpMotorItemCode(attrs);
  assertSapCodeLength(itemCode);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query<{ id: number; item_code: string }>(
      `SELECT id, item_code FROM master_items
       WHERE item_type = 'catalog' AND item_code = $1
       FOR UPDATE`,
      [itemCode],
    );

    if (existing.rowCount && existing.rowCount > 0) {
      await client.query('COMMIT');
      return { masterItemId: existing.rows[0].id, sapItemCode: itemCode, reused: true };
    }

    const inserted = await client.query<{ id: number; item_code: string }>(
      `INSERT INTO master_items
         (item_code, description, uom, make_or_buy,
          item_type, buy_group_id, buy_subgroup_id, created_at, updated_at)
       VALUES ($1, $2, $3, 'Buy', 'catalog', $4, $5, NOW(), NOW())
       RETURNING id, item_code`,
      [itemCode, description, uomCode, groupId, subgroupId],
    );

    await client.query('COMMIT');
    return { masterItemId: inserted.rows[0].id, sapItemCode: itemCode, reused: false };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

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
