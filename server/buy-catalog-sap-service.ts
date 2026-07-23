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
  '230 V': '230',   '380 V': '380',   '400 V': '400',
  '415 V': '415',   '440 V': '440',   '525 V': '525',
  '690 V': '690',   '3300 V': '3300', '6600 V': '6600', '11000 V': '11000',
  '230': '230', '380': '380', '400': '400', '415': '415', '440': '440',
  '525': '525', '690': '690', '3300': '3300', '6600': '6600', '11000': '11000',
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

// ── FLP Motor Spec-Based Item Code ───────────────────────────────────────────

/** Explosion protection designation → short code for FLP item code */
const EX_PROTECTION_CODE: Record<string, string> = {
  'Ex d':  'EXD',
  'Ex e':  'EXE',
  'Ex de': 'EXDE',
  'Ex n':  'EXN',
  'Ex p':  'EXP',
};

/** ATEX/IECEx gas group → code (stored as-is; identity is the group itself) */
const GAS_GROUP_CODE: Record<string, string> = {
  'IIA': 'IIA', 'IIB': 'IIB', 'IIC': 'IIC',
};

/** Surface temperature class → code (T1–T6) */
const T_CLASS_CODE: Record<string, string> = {
  'T1': 'T1', 'T2': 'T2', 'T3': 'T3', 'T4': 'T4', 'T5': 'T5', 'T6': 'T6',
};

/**
 * Build the deterministic FLP Motor SAP Item Code from technical_attributes.
 * Format: MOT-FLP-{MotorType}-{Mounting}-{Power}-{Voltage}-{Freq}-{Poles}-{Efficiency}-{ExProtection}-{GasGroup}-{TClass}
 * Example: MOT-FLP-IND-B3-015-415-50-4-IE3-EXD-IIB-T4   (44 chars)
 * Worst case: MOT-FLP-PMSM-B35-018P5-11000-60-12-IE4-EXDE-IIC-T6  (50 chars — within SAP B1 limit)
 *
 * Throws a descriptive error if any required attribute is missing or unrecognised.
 */
export function buildFlpMotorItemCode(attrs: Record<string, unknown>): string {
  const motorTypeRaw  = (attrs.motor_type          as string | undefined)?.trim() ?? '';
  const mountingRaw   = (attrs.mounting             as string | undefined)?.trim() ?? '';
  const powerRaw      = (attrs.power                as string | undefined)?.trim() ?? '';
  const voltageRaw    = (attrs.voltage              as string | undefined)?.trim() ?? '';
  const freqRaw       = (attrs.frequency            as string | undefined)?.trim() ?? '';
  const polesRaw      = ((attrs.num_poles ?? attrs.poles) as string | undefined)?.trim() ?? '';
  const effRaw        = (attrs.efficiency_class     as string | undefined)?.trim() ?? '';
  const exProtRaw     = (attrs.explosion_protection as string | undefined)?.trim() ?? '';
  const gasGroupRaw   = (attrs.gas_group            as string | undefined)?.trim() ?? '';
  const tClassRaw     = (attrs.temperature_class    as string | undefined)?.trim() ?? '';

  const motorType    = MOTOR_TYPE_CODE[motorTypeRaw];
  const mounting     = MOUNTING_CODE[mountingRaw];
  const voltage      = VOLTAGE_CODE[voltageRaw];
  const frequency    = FREQUENCY_CODE[freqRaw];
  const poles        = polesRaw.replace(/[^0-9]/g, '');
  const efficiency   = effRaw;
  const exProtection = EX_PROTECTION_CODE[exProtRaw];
  const gasGroup     = GAS_GROUP_CODE[gasGroupRaw];
  const tClass       = T_CLASS_CODE[tClassRaw];

  let powerCode: string | undefined;
  try { powerCode = powerRaw ? encodePowerRating(powerRaw) : undefined; } catch { /* leave undefined */ }

  const missing: string[] = [];
  if (!motorType)    missing.push(`Motor Type ("${motorTypeRaw}")`);
  if (!mounting)     missing.push(`Mounting ("${mountingRaw}")`);
  if (!powerCode)    missing.push(`Power Rating ("${powerRaw}")`);
  if (!voltage)      missing.push(`Voltage ("${voltageRaw}")`);
  if (!frequency)    missing.push(`Frequency ("${freqRaw}")`);
  if (!poles)        missing.push('Number of Poles');
  if (!efficiency)   missing.push('Efficiency Class');
  if (!exProtection) missing.push(`Explosion Protection ("${exProtRaw}" — must be one of: Ex d, Ex e, Ex de, Ex n, Ex p)`);
  if (!gasGroup)     missing.push(`Gas Group ("${gasGroupRaw}" — must be IIA, IIB, or IIC)`);
  if (!tClass)       missing.push(`Temperature Class ("${tClassRaw}" — must be T1–T6)`);

  if (missing.length > 0)
    throw new Error(`Cannot generate FLP Motor SAP Item Code — missing or unrecognised: ${missing.join('; ')}`);

  return `MOT-FLP-${motorType}-${mounting}-${powerCode}-${voltage}-${frequency}-${poles}-${efficiency}-${exProtection}-${gasGroup}-${tClass}`;
}

/**
 * Find or create a master_items catalog record for a Flameproof Motor specification.
 * The item_code is the unique lookup key (spec-based, deterministic — no make/model).
 */
export async function resolveFlpMotorSapItemCode(
  pool:        Pool,
  groupId:     number,
  subgroupId:  number,
  attrs:       Record<string, unknown>,
  uomCode:     string,
  description: string,
): Promise<CatalogSapResult> {
  const itemCode = buildFlpMotorItemCode(attrs);
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

// ── Isolation Valve Spec-Based Item Code ─────────────────────────────────────

const ISO_VALVE_TYPE_CODE: Record<string, string> = {
  'Ball Valve':       'BALL',
  'Gate Valve':       'GATE',
  'Globe Valve':      'GLBE',
  'Butterfly Valve':  'BFLY',
  'Plug Valve':       'PLUG',
  'Knife Gate Valve': 'KGATE',
  'Diaphragm Valve':  'DIAPH',
};

const ISO_END_CONN_CODE: Record<string, string> = {
  'Flanged':              'RF',
  'Butt Weld':            'BW',
  'Socket Weld':          'SW',
  'Threaded (BSP)':       'THDB',
  'Threaded (NPT)':       'THDN',
  'Wafer':                'WFR',
  'Lug Type':             'LUG',
  'Grooved':              'GRV',
  'Clamp End (Tri-Clamp)':'TC',
};

const ISO_PRESSURE_CODE: Record<string, string> = {
  'Class 150': 'CL150', 'Class 300': 'CL300', 'Class 600': 'CL600',
  'Class 900': 'CL900', 'Class 1500': 'CL1500', 'Class 2500': 'CL2500',
  'PN6': 'PN6', 'PN10': 'PN10', 'PN16': 'PN16', 'PN25': 'PN25',
  'PN40': 'PN40', 'PN64': 'PN64', 'PN100': 'PN100', 'PN160': 'PN160',
};

const ISO_BODY_MAT_CODE: Record<string, string> = {
  'CI': 'CI', 'DI': 'DI', 'CS (WCB)': 'WCB', 'LCB': 'LCB',
  'SS304': 'SS304', 'SS316': 'SS316', 'SS316L': 'SS316L',
  'CF8': 'CF8', 'CF8M': 'CF8M', 'Duplex SS': 'DSS',
  'Hastelloy C': 'HC276', 'Bronze': 'BRZ', 'Monel': 'MNL', 'Titanium': 'TI',
};

/** All recognised trim values → short code (union across all valve types) */
const ISO_TRIM_CODE: Record<string, string> = {
  // Ball / Butterfly seats
  'PTFE': 'PTFE', 'PEEK': 'PEEK', 'Metal (SS316)': 'SS316', 'Nylon': 'NYLON',
  'EPDM': 'EPDM', 'NBR': 'NBR',
  // Gate / Globe trim materials
  'SS304': 'SS304', '13Cr': '13CR', 'Hard Facing (Stellite)': 'STLT', 'Alloy Steel': 'AYST',
  // Plug sleeve
  'Metal': 'MTL',
  // Knife gate
  'Hardened SS': 'HSS',
  // Diaphragm
  'Butyl': 'BUTYL',
};

/** Derive the trim field key and raw value from attrs based on valve type. */
function resolveIsoValveTrim(
  attrs: Record<string, unknown>,
  vt: string,  // lowercase valve_type
): { field: string; raw: string; code: string | undefined } {
  let field = '';
  let raw   = '';
  if (vt.includes('ball')) {
    field = 'seat_material';
    raw   = (attrs.seat_material   as string | undefined)?.trim() ?? '';
  } else if (vt.includes('gate') && !vt.includes('knife')) {
    field = 'trim_material';
    raw   = (attrs.trim_material   as string | undefined)?.trim() ?? '';
  } else if (vt.includes('globe')) {
    field = 'trim_material';
    raw   = (attrs.trim_material   as string | undefined)?.trim() ?? '';
  } else if (vt.includes('butterfly')) {
    field = 'seat_material';
    raw   = (attrs.seat_material   as string | undefined)?.trim() ?? '';
  } else if (vt.includes('plug')) {
    field = 'sleeve_material';
    raw   = (attrs.sleeve_material as string | undefined)?.trim() ?? '';
  } else if (vt.includes('knife')) {
    field = 'gate_material';
    raw   = (attrs.gate_material   as string | undefined)?.trim() ?? '';
  } else if (vt.includes('diaphragm')) {
    field = 'diaphragm_material';
    raw   = (attrs.diaphragm_material as string | undefined)?.trim() ?? '';
  }
  return { field, raw, code: ISO_TRIM_CODE[raw] };
}

/** Convert "50 NB" → "DN50", "100 NB" → "DN100", etc. */
function encodeValveSize(raw: string): string | undefined {
  const m = raw.match(/^(\d+)\s*NB$/i);
  return m ? `DN${m[1]}` : undefined;
}

/**
 * Build the deterministic Isolation Valve SAP Item Code.
 * Format: VLV-ISO-{ValveType}-{EndConn}-{Size}-{PressureClass}-{BodyMat}-{Trim}
 * Example: VLV-ISO-BALL-RF-DN50-CL150-WCB-PTFE   (30 chars)
 * Worst case: VLV-ISO-DIAPH-THDB-DN400-CL2500-SS316L-BUTYL  (44 chars ≤ 50 SAP B1 limit)
 *
 * Throws a descriptive error if any required field is missing or unrecognised.
 */
export function buildIsoValveItemCode(attrs: Record<string, unknown>): string {
  const valveTypeRaw = (attrs.valve_type     as string | undefined)?.trim() ?? '';
  const endConnRaw   = (attrs.end_connection  as string | undefined)?.trim() ?? '';
  const sizeRaw      = (attrs.size_nb         as string | undefined)?.trim() ?? '';
  const pressureRaw  = (attrs.pressure_rating as string | undefined)?.trim() ?? '';
  const bodyMatRaw   = (attrs.body_material   as string | undefined)?.trim() ?? '';

  const valveType = ISO_VALVE_TYPE_CODE[valveTypeRaw];
  const endConn   = ISO_END_CONN_CODE[endConnRaw];
  const size      = encodeValveSize(sizeRaw);
  const pressure  = ISO_PRESSURE_CODE[pressureRaw];
  const bodyMat   = ISO_BODY_MAT_CODE[bodyMatRaw];
  const vt        = valveTypeRaw.toLowerCase();
  const trim      = resolveIsoValveTrim(attrs, vt);

  const missing: string[] = [];
  if (!valveType) missing.push(`Valve Type ("${valveTypeRaw}")`);
  if (!endConn)   missing.push(`End Connection ("${endConnRaw}")`);
  if (!size)      missing.push(`Size ("${sizeRaw}" — must be format "XX NB")`);
  if (!pressure)  missing.push(`Pressure Rating ("${pressureRaw}")`);
  if (!bodyMat)   missing.push(`Body Material ("${bodyMatRaw}")`);
  if (!trim.code) missing.push(`Trim/Seat ("${trim.raw}" — unrecognised for ${valveTypeRaw || 'this valve type'})`);

  if (missing.length > 0)
    throw new Error(`Cannot generate Isolation Valve SAP Item Code — missing or unrecognised: ${missing.join('; ')}`);

  return `VLV-ISO-${valveType}-${endConn}-${size}-${pressure}-${bodyMat}-${trim.code!}`;
}

/**
 * Find or create a master_items catalog record for an Isolation Valve specification.
 * The item_code (spec-based, deterministic) is the unique lookup key.
 */
export async function resolveIsoValveSapItemCode(
  pool:        Pool,
  groupId:     number,
  subgroupId:  number,
  attrs:       Record<string, unknown>,
  uomCode:     string,
  description: string,
): Promise<CatalogSapResult> {
  const itemCode = buildIsoValveItemCode(attrs);
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
