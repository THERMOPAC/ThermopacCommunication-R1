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

// ── Control Valve Spec-Based Item Code ───────────────────────────────────────

/**
 * Resolve the Valve Type code for a Control Valve.
 * Globe variants encode the valve_config (Two Way / Three Way Mixing / Three Way Diverting).
 */
function resolveCtrlValveTypeCode(
  valveTypeRaw: string,
  valveConfigRaw: string,
): string | undefined {
  const vt = valveTypeRaw.toLowerCase();
  if (vt.includes('globe')) {
    const cfg = valveConfigRaw.toLowerCase();
    if (cfg.includes('mixing'))    return 'G3MX';
    if (cfg.includes('diverting')) return 'G3DV';
    return 'GLBE'; // Two Way or not specified
  }
  if (vt.includes('ball'))      return 'BALL';
  if (vt.includes('butterfly')) return 'BFLY';
  if (vt.includes('eccentric') || vt.includes('rotary')) return 'PLUG';
  if (vt.includes('angle'))     return 'ANGL';
  return undefined;
}

const CV_END_CONN_CODE: Record<string, string> = {
  'Flanged':    'RF',
  'Threaded':   'THD',
  'Butt Weld':  'BW',
  'Socket Weld':'SW',
  'Wafer':      'WFR',
  'Lug':        'LUG',
};

const CV_PRESSURE_CODE: Record<string, string> = {
  'Class 150': 'CL150', 'Class 300': 'CL300', 'Class 600': 'CL600',
  'Class 900': 'CL900', 'Class 1500': 'CL1500', 'Class 2500': 'CL2500',
  'PN10': 'PN10', 'PN16': 'PN16', 'PN25': 'PN25', 'PN40': 'PN40',
  'PN64': 'PN64', 'PN100': 'PN100', 'PN160': 'PN160',
};

const CV_BODY_MAT_CODE: Record<string, string> = {
  'WCB (CS)':       'WCB',
  'LCB (Low Temp CS)': 'LCB',
  'SS304':   'SS304', 'SS316':   'SS316', 'SS316L': 'SS316L',
  'CF8':     'CF8',   'CF8M':    'CF8M',
  'Duplex SS':  'DSS',
  'Hastelloy C':'HC276',
};

/** Union of all trim codes across all control valve types */
const CV_TRIM_CODE: Record<string, string> = {
  // Globe / Angle trim_material
  'SS304': 'SS304', 'SS316': 'SS316', 'SS316L': 'S316L',
  'Hardened SS': 'HSS', 'Hardened Trim': 'HSS',
  'Stellite Overlay': 'STLT', 'Stellite': 'STLT',
  'SS316 + Stellite': 'S3ST',
  // Ball ball_trim_material
  'Duplex SS': 'DSS',
  // Butterfly seat_liner_material
  'EPDM': 'EPDM', 'PTFE': 'PTFE',
  'Metal (SS316)': 'SS316', 'Graphite': 'GRPH',
  // Plug plug_trim_material (SS304/SS316/HSS/STLT already covered above)
  // Angle
  'Tungsten Carbide': 'TC',
};

const CV_ACTUATOR_CODE: Record<string, string> = {
  'Pneumatic Diaphragm': 'PNEU',
  'Pneumatic Piston':    'PNUP',
  'Electric Actuator':   'ELEC',
  'Hydraulic Actuator':  'HYD',
};

const CV_FAIL_ACTION_CODE: Record<string, string> = {
  'Fail Open (FO)':  'FO',
  'Fail Close (FC)': 'FC',
  'Fail Last (FL)':  'FL',
};

/** Derive the trim field key and raw value for a control valve. */
function resolveCtrlValveTrim(
  attrs: Record<string, unknown>,
  vt: string,
): { field: string; raw: string; code: string | undefined } {
  let field = '';
  let raw   = '';
  if (vt.includes('globe') || vt.includes('angle')) {
    field = 'trim_material';
    raw   = (attrs.trim_material      as string | undefined)?.trim() ?? '';
  } else if (vt.includes('ball')) {
    field = 'ball_trim_material';
    raw   = (attrs.ball_trim_material as string | undefined)?.trim() ?? '';
  } else if (vt.includes('butterfly')) {
    field = 'seat_liner_material';
    raw   = (attrs.seat_liner_material as string | undefined)?.trim() ?? '';
  } else if (vt.includes('eccentric') || vt.includes('rotary')) {
    field = 'plug_trim_material';
    raw   = (attrs.plug_trim_material as string | undefined)?.trim() ?? '';
  }
  return { field, raw, code: CV_TRIM_CODE[raw] };
}

/**
 * Build the deterministic Control Valve SAP Item Code.
 * Format: VLV-CV-{ValveType}-{EndConn}-{Size}-{PressureClass}-{BodyMat}-{Trim}-{ActuatorType}-{FailAction}
 * Examples:
 *   VLV-CV-GLBE-RF-DN50-CL300-WCB-STLT-PNEU-FC   (40 chars)
 *   VLV-CV-G3MX-WFR-DN300-CL2500-SS316L-SS304-PNEU-FC  (49 chars ≤ 50 SAP B1 limit)
 *
 * Throws a descriptive error if any required field is missing or unrecognised.
 */
export function buildCtrlValveItemCode(attrs: Record<string, unknown>): string {
  const valveTypeRaw  = (attrs.valve_type     as string | undefined)?.trim() ?? '';
  const valveConfigRaw= (attrs.valve_config   as string | undefined)?.trim() ?? '';
  const endConnRaw    = (attrs.end_connection  as string | undefined)?.trim() ?? '';
  const sizeRaw       = (attrs.size_nb         as string | undefined)?.trim() ?? '';
  const pressureRaw   = (attrs.pressure_rating as string | undefined)?.trim() ?? '';
  const bodyMatRaw    = (attrs.body_material   as string | undefined)?.trim() ?? '';
  const actuatorRaw   = (attrs.actuator_type   as string | undefined)?.trim() ?? '';
  const failActionRaw = (attrs.fail_action     as string | undefined)?.trim() ?? '';
  const vt            = valveTypeRaw.toLowerCase();

  const valveType = resolveCtrlValveTypeCode(valveTypeRaw, valveConfigRaw);
  const endConn   = CV_END_CONN_CODE[endConnRaw];
  const sizeMatch = sizeRaw.match(/^(\d+)\s*NB$/i);
  const size      = sizeMatch ? `DN${sizeMatch[1]}` : undefined;
  const pressure  = CV_PRESSURE_CODE[pressureRaw];
  const bodyMat   = CV_BODY_MAT_CODE[bodyMatRaw];
  const trim      = resolveCtrlValveTrim(attrs, vt);
  const actuator  = CV_ACTUATOR_CODE[actuatorRaw];
  const failAction= CV_FAIL_ACTION_CODE[failActionRaw];

  const missing: string[] = [];
  if (!valveType)    missing.push(`Valve Type ("${valveTypeRaw}")`);
  if (!endConn)      missing.push(`End Connection ("${endConnRaw}")`);
  if (!size)         missing.push(`Size ("${sizeRaw}" — must be format "XX NB")`);
  if (!pressure)     missing.push(`Pressure Rating ("${pressureRaw}")`);
  if (!bodyMat)      missing.push(`Body Material ("${bodyMatRaw}")`);
  if (!trim.code)    missing.push(`Trim ("${trim.raw}" — unrecognised for ${valveTypeRaw || 'this valve type'})`);
  if (!actuator)     missing.push(`Actuator Type ("${actuatorRaw}")`);
  if (!failAction)   missing.push(`Fail Action ("${failActionRaw}")`);

  if (missing.length > 0)
    throw new Error(`Cannot generate Control Valve SAP Item Code — missing or unrecognised: ${missing.join('; ')}`);

  return `VLV-CV-${valveType}-${endConn}-${size}-${pressure}-${bodyMat}-${trim.code!}-${actuator}-${failAction}`;
}

/**
 * Find or create a master_items catalog record for a Control Valve specification.
 * The item_code (spec-based, deterministic) is the unique lookup key.
 */
export async function resolveCtrlValveSapItemCode(
  pool:        Pool,
  groupId:     number,
  subgroupId:  number,
  attrs:       Record<string, unknown>,
  uomCode:     string,
  description: string,
): Promise<CatalogSapResult> {
  const itemCode = buildCtrlValveItemCode(attrs);
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

// ── Safety Valve Spec-Based Item Codes ───────────────────────────────────────

const SV_END_CONN_CODE: Record<string, string> = {
  'Flanged': 'RF', 'Threaded': 'THD',
};
const SV_BV_END_CONN_CODE: Record<string, string> = {
  'Flanged': 'FLG', 'NPT': 'NPT', 'BSP': 'BSP',
};
const SV_PRESSURE_CODE: Record<string, string> = {
  'Class 150': 'CL150', 'Class 300': 'CL300', 'Class 600': 'CL600',
  'Class 900': 'CL900', 'Class 1500': 'CL1500',
};
const SV_BODY_MAT_CODE: Record<string, string> = {
  'WCB (CS)': 'WCB', 'LCB (Low Temp CS)': 'LCB',
  'SS304': 'SS304', 'SS316': 'SS316', 'SS316L': 'SS316L',
  'CF8': 'CF8', 'CF8M': 'CF8M', 'Duplex SS': 'DSS', 'Hastelloy C': 'HC276',
};
const SV_TRIM_CODE: Record<string, string> = {
  'SS304': 'SS304', 'SS316': 'SS316', 'Hardened Trim': 'HSS', 'Stellite': 'STLT',
};
const SV_BACK_PRESS_CODE: Record<string, string> = {
  'Conventional': 'CONV', 'Balanced Bellows': 'BLW', 'Pilot-Operated': 'PLT',
};
const SV_BV_BODY_CODE: Record<string, string> = {
  'Al Alloy': 'ALAY', 'CS': 'CS', 'SS304': 'SS304', 'SS316': 'SS316', 'FRP': 'FRP',
};
const SV_FLAME_CODE: Record<string, string> = {
  'Integrated': 'INT', 'Separate': 'SEP', 'None': 'NON',
};

/** Encode set pressure value to normalized compact form.
 *  10 barg → "10B", 10.5 barg → "10P5B", 258.5 barg → "258P5B".
 *  psig is converted to barg (1 dp) before encoding. */
function encodeSetPressure(valueRaw: string, unit: string): string | undefined {
  const num = parseFloat(valueRaw);
  if (isNaN(num) || num <= 0) return undefined;
  let barg = num;
  if (unit.toLowerCase() === 'psig') barg = Math.round(num * 0.0689476 * 10) / 10;
  const normalized = parseFloat(barg.toPrecision(10)); // eliminate floating-point noise
  return normalized.toString().replace('.', 'P') + 'B';
}

/** Convert vacuum magnitude to normalized integer mbar.
 *  kPa×10, mmWC×0.09807, mmHg×1.33322, inH2O×2.49089. */
function normalizeVacuumToMbar(value: number, unit: string): number {
  switch (unit.toLowerCase()) {
    case 'kpa':   return Math.round(value * 10);
    case 'mmwc':  return Math.round(value * 0.09807);
    case 'mmhg':  return Math.round(value * 1.33322);
    case 'inh2o': return Math.round(value * 2.49089);
    default:      return Math.round(value); // mbar
  }
}

/** Resolve PSV/PRV/SRV type code from valve_type label. */
function svPressureTypeCode(valveTypeRaw: string): string | undefined {
  const vt = valveTypeRaw.toLowerCase();
  if (vt.includes('(psv)') || (vt.includes('safety') && vt.includes('valve') && !vt.includes('relief'))) return 'PSV';
  if (vt.includes('(prv)') || (vt.includes('pressure') && vt.includes('relief') && !vt.includes('safety'))) return 'PRV';
  if (vt.includes('(srv)') || vt.includes('safety relief')) return 'SRV';
  return undefined;
}

/**
 * Build SAP Item Code for PSV / PRV / SRV (API 526 Pressure Relief family).
 * Format: VLV-SV-{Type}-{EndConn}-{Size}-{PressClass}-{BodyMat}-{Trim}-{Orifice}-{SetPressure}-{BackPress}
 * Worst case: VLV-SV-PSV-RF-300-CL1500-SS316L-STLT-J-258P5B-BLW = 49 chars ≤ 50.
 */
export function buildPressureRelievingItemCode(attrs: Record<string, unknown>): string {
  const valveTypeRaw  = (attrs.valve_type          as string | undefined)?.trim() ?? '';
  const endConnRaw    = (attrs.end_connection       as string | undefined)?.trim() ?? '';
  const inletSizeRaw  = (attrs.inlet_size           as string | undefined)?.trim() ?? '';
  const pressureRaw   = (attrs.pressure_rating      as string | undefined)?.trim() ?? '';
  const bodyMatRaw    = (attrs.body_material        as string | undefined)?.trim() ?? '';
  const trimRaw       = (attrs.trim_material        as string | undefined)?.trim() ?? '';
  const orificeRaw    = (attrs.api_orifice          as string | undefined)?.trim() ?? '';
  const setPressVal   = (attrs.set_pressure_value   as string | undefined)?.trim() ?? '';
  const setPressUnit  = (attrs.set_pressure_unit    as string | undefined)?.trim() || 'barg';
  const backPressRaw  = (attrs.back_pressure_type   as string | undefined)?.trim() ?? '';

  const typeCode  = svPressureTypeCode(valveTypeRaw);
  const endConn   = SV_END_CONN_CODE[endConnRaw];
  const sizeMatch = inletSizeRaw.match(/^(\d+)\s*NB$/i);
  const size      = sizeMatch ? sizeMatch[1] : undefined;
  const pressure  = SV_PRESSURE_CODE[pressureRaw];
  const bodyMat   = SV_BODY_MAT_CODE[bodyMatRaw];
  const trim      = SV_TRIM_CODE[trimRaw];
  const orifice   = /^[A-T]$/i.test(orificeRaw) ? orificeRaw.toUpperCase() : undefined;
  const setPress  = encodeSetPressure(setPressVal, setPressUnit);
  const backPress = SV_BACK_PRESS_CODE[backPressRaw];

  const missing: string[] = [];
  if (!typeCode)  missing.push(`Valve Type ("${valveTypeRaw}")`);
  if (!endConn)   missing.push(`End Connection ("${endConnRaw}")`);
  if (!size)      missing.push(`Inlet Size ("${inletSizeRaw}")`);
  if (!pressure)  missing.push(`Pressure Rating ("${pressureRaw}")`);
  if (!bodyMat)   missing.push(`Body Material ("${bodyMatRaw}")`);
  if (!trim)      missing.push(`Trim Material ("${trimRaw}")`);
  if (!orifice)   missing.push(`API Orifice ("${orificeRaw}")`);
  if (!setPress)  missing.push(`Set Pressure ("${setPressVal}" ${setPressUnit})`);
  if (!backPress) missing.push(`Back Pressure Type ("${backPressRaw}")`);
  if (missing.length > 0)
    throw new Error(`Cannot generate Pressure Relief Valve SAP Item Code — missing or unrecognised: ${missing.join('; ')}`);

  return `VLV-SV-${typeCode}-${endConn}-${size}-${pressure}-${bodyMat}-${trim}-${orifice}-${setPress}-${backPress}`;
}

/**
 * Build SAP Item Code for VRV (Spring-loaded Vacuum Relief Valve).
 * Format: VLV-SV-VRV-{EndConn}-{Size}-{PressClass}-{BodyMat}-{Trim}-{VacuumSet}
 * Vacuum encoded as positive magnitude in mbar, e.g. 250M.
 */
export function buildVrvItemCode(attrs: Record<string, unknown>): string {
  const endConnRaw  = (attrs.end_connection  as string | undefined)?.trim() ?? '';
  const sizeRaw     = (attrs.connection_size as string | undefined)?.trim() ?? '';
  const pressureRaw = (attrs.pressure_rating as string | undefined)?.trim() ?? '';
  const bodyMatRaw  = (attrs.body_material   as string | undefined)?.trim() ?? '';
  const trimRaw     = (attrs.trim_material   as string | undefined)?.trim() ?? '';
  const vacValRaw   = (attrs.set_vacuum_value as string | undefined)?.trim() ?? '';
  const vacUnit     = (attrs.set_vacuum_unit  as string | undefined)?.trim() || 'mbar';

  const endConn   = SV_END_CONN_CODE[endConnRaw];
  const sizeMatch = sizeRaw.match(/^(\d+)\s*NB$/i);
  const size      = sizeMatch ? sizeMatch[1] : undefined;
  const pressure  = SV_PRESSURE_CODE[pressureRaw];
  const bodyMat   = SV_BODY_MAT_CODE[bodyMatRaw];
  const trim      = SV_TRIM_CODE[trimRaw];
  const vacNum    = parseFloat(vacValRaw);
  const vacMbar   = !isNaN(vacNum) && vacNum > 0 ? normalizeVacuumToMbar(vacNum, vacUnit) : undefined;
  const vacCode   = vacMbar ? `${vacMbar}M` : undefined;

  const missing: string[] = [];
  if (!endConn)  missing.push(`End Connection ("${endConnRaw}")`);
  if (!size)     missing.push(`Inlet Size ("${sizeRaw}")`);
  if (!pressure) missing.push(`Pressure Rating ("${pressureRaw}")`);
  if (!bodyMat)  missing.push(`Body Material ("${bodyMatRaw}")`);
  if (!trim)     missing.push(`Trim Material ("${trimRaw}")`);
  if (!vacCode)  missing.push(`Vacuum Set Point ("${vacValRaw}" ${vacUnit})`);
  if (missing.length > 0)
    throw new Error(`Cannot generate VRV SAP Item Code — missing or unrecognised: ${missing.join('; ')}`);

  return `VLV-SV-VRV-${endConn}-${size}-${pressure}-${bodyMat}-${trim}-${vacCode}`;
}

/**
 * Build SAP Item Code for BV (Breather Valve / Conservation Vent).
 * Format: VLV-SV-BV-{EndConn}-{ConnSize}-{BodyMat}-{FlameArrestor}
 */
export function buildBvItemCode(attrs: Record<string, unknown>): string {
  const endConnRaw = (attrs.end_connection  as string | undefined)?.trim() ?? '';
  const sizeRaw    = (attrs.connection_size as string | undefined)?.trim() ?? '';
  const bodyMatRaw = (attrs.body_material   as string | undefined)?.trim() ?? '';
  const flameRaw   = (attrs.flame_arrestor  as string | undefined)?.trim() ?? '';

  const endConn   = SV_BV_END_CONN_CODE[endConnRaw];
  const sizeMatch = sizeRaw.match(/^(\d+)\s*NB$/i);
  const size      = sizeMatch ? sizeMatch[1] : undefined;
  const bodyMat   = SV_BV_BODY_CODE[bodyMatRaw];
  const flame     = SV_FLAME_CODE[flameRaw];

  const missing: string[] = [];
  if (!endConn) missing.push(`End Connection ("${endConnRaw}")`);
  if (!size)    missing.push(`Connection Size ("${sizeRaw}")`);
  if (!bodyMat) missing.push(`Body Material ("${bodyMatRaw}")`);
  if (!flame)   missing.push(`Flame Arrestor ("${flameRaw}")`);
  if (missing.length > 0)
    throw new Error(`Cannot generate Breather Valve SAP Item Code — missing or unrecognised: ${missing.join('; ')}`);

  return `VLV-SV-BV-${endConn}-${size}-${bodyMat}-${flame}`;
}

/** Dispatch to the correct builder based on valve_type. */
export function buildSafetyValveItemCode(attrs: Record<string, unknown>): string {
  const vt = ((attrs.valve_type as string | undefined) ?? '').toLowerCase();
  if (vt.includes('breather'))        return buildBvItemCode(attrs);
  if (vt.includes('vacuum'))          return buildVrvItemCode(attrs);
  return buildPressureRelievingItemCode(attrs); // PSV / PRV / SRV
}

/**
 * Find or create a master_items catalog record for a Safety Valve specification.
 */
export async function resolveSafetyValveSapItemCode(
  pool:        Pool,
  groupId:     number,
  subgroupId:  number,
  attrs:       Record<string, unknown>,
  uomCode:     string,
  description: string,
): Promise<CatalogSapResult> {
  const itemCode = buildSafetyValveItemCode(attrs);
  assertSapCodeLength(itemCode);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ id: number }>(
      `SELECT id FROM master_items WHERE item_type = 'catalog' AND item_code = $1 FOR UPDATE`,
      [itemCode],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      await client.query('COMMIT');
      return { masterItemId: existing.rows[0].id, sapItemCode: itemCode, reused: true };
    }
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO master_items
         (item_code, description, uom, make_or_buy, item_type, buy_group_id, buy_subgroup_id, created_at, updated_at)
       VALUES ($1,$2,$3,'Buy','catalog',$4,$5,NOW(),NOW()) RETURNING id`,
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

// ── ON/OFF Valve Spec-Based Item Codes ───────────────────────────────────────

const OOV_END_CONN_CODE: Record<string, string> = {
  'Flanged':               'RF',
  'Threaded':              'NP',
  'Butt Weld':             'BW',
  'Socket Weld':           'SW',
  'Wafer':                 'WF',
  'Lug Type':              'LG',
  'Grooved':               'GV',
  'Clamp End (Tri-Clamp)': 'TC',
};

const OOV_PRESSURE_CODE: Record<string, string> = {
  'Class 150': 'CL150', 'Class 300': 'CL300', 'Class 600': 'CL600',
  'Class 900': 'CL900', 'Class 1500': 'CL1500',
  'PN6': 'PN6', 'PN10': 'PN10', 'PN16': 'PN16', 'PN25': 'PN25',
  'PN40': 'PN40', 'PN64': 'PN64', 'PN100': 'PN100', 'PN160': 'PN160',
};

const OOV_BODY_MAT_CODE: Record<string, string> = {
  'WCB (CS)':          'WCB',
  'LCB (Low Temp CS)': 'LCB',
  'SS304':             'SS304',
  'SS316':             'SS316',
  'SS316L':            'SS316L',
  'CF8':               'CF8',
  'CF8M':              'CF8M',
  'Duplex SS':         'DSS',
  'CI (Cast Iron)':    'CI',
  'Ductile Iron':      'DI',
  'Hastelloy C':       'HC276',
};

const OOV_ACT_CODE: Record<string, string> = {
  'Manual Lever':       'LVR',
  'Manual Handwheel':   'HWH',
  'Manual Gear':        'GBX',
  'Pneumatic Actuator': 'PNE',
  'Electric Actuator':  'ELE',
  'Hydraulic Actuator': 'HYD',
};

const OOV_FAIL_CODE: Record<string, string> = {
  'Fail Open (FO)':  'FO',
  'Fail Close (FC)': 'FC',
  'Fail Last (FL)':  'FL',
};

const OOV_ACTUATED = new Set(['Pneumatic Actuator', 'Electric Actuator', 'Hydraulic Actuator']);

const OOV_SEAT_MAT_CODE: Record<string, string> = {
  'PTFE':               'PTFE',
  'PEEK':               'PEEK',
  'Metal Seat (SS316)': 'SS316',
  'Graphite':           'GRPH',
  'Devlon':             'DVL',
};

const OOV_BORE_CODE: Record<string, string> = {
  'Full Bore':    'FB',
  'Reduced Bore': 'RB',
};

const OOV_STYLE_CODE: Record<string, string> = {
  'Floating Ball':    'FLT',
  'Trunnion Mounted': 'TRN',
};

const OOV_PORT_CODE: Record<string, string> = {
  '3-Way (L-Port)': '3L',
  '3-Way (T-Port)': '3T',
};

const OOV_WEDGE_CODE: Record<string, string> = {
  'Solid Wedge':    'SW',
  'Flexible Wedge': 'FW',
  'Split Wedge':    'SPW',
};

const OOV_GATE_MAT_CODE: Record<string, string> = {
  'WCB (CS)':       'WCB',
  'SS316':          'SS316',
  'Hardened Steel': 'HSS',
  'Stellite Faced': 'STLT',
};

const OOV_TRIM_CODE: Record<string, string> = {
  'SS316':          'SS316',
  'SS304':          'SS304',
  'Stellite Faced': 'STLT',
  'Hardened':       'HSS',
};

const OOV_SEAT_GLOBE_CODE: Record<string, string> = {
  'SS316':          'SS316',
  'SS304':          'SS304',
  'Stellite Faced': 'STLT',
  'Hardened':       'HSS',
  'PTFE Insert':    'PTFE',
};

const OOV_DESIGN_CODE: Record<string, string> = {
  'Concentric':       'C',
  'Double Eccentric': 'D',
  'Triple Eccentric': 'T',
};

const OOV_DISC_CODE: Record<string, string> = {
  'CI':           'CI',
  'CS':           'CS',
  'SS304':        'SS304',
  'SS316':        'SS316',
  'Ni-Al Bronze': 'NAB',
  'Hastelloy C':  'HC276',
};

const OOV_LINER_CODE: Record<string, string> = {
  'EPDM':        'EPDM',
  'NBR':         'NBR',
  'PTFE':        'PTFE',
  'Viton (FKM)': 'VTN',
  'Silicone':    'SLC',
};

const OOV_PLUG_TYPE_CODE: Record<string, string> = {
  'Non-Lubricated (Sleeved)': 'NLS',
  'Lubricated':               'LUB',
  'Eccentric':                'ECC',
};

const OOV_SLEEVE_CODE: Record<string, string> = {
  'PTFE':     'PTFE',
  'RPTFE':    'RPTFE',
  'Neoprene': 'NEO',
  'Kel-F':    'KLF',
};

const OOV_DIAPHRAGM_CODE: Record<string, string> = {
  'EPDM':           'EPDM',
  'Natural Rubber':  'NR',
  'PTFE':            'PTFE',
  'Butyl Rubber':    'BUT',
  'Neoprene':        'NEO',
};

const OOV_BODY_DESIGN_CODE: Record<string, string> = {
  'Weir Type':       'WT',
  'Straight Through': 'ST',
};

function oovActSuffix(actuationRaw: string, failRaw: string): string {
  const act  = OOV_ACT_CODE[actuationRaw];
  const fail = OOV_FAIL_CODE[failRaw];
  if (!act) return '';
  return OOV_ACTUATED.has(actuationRaw) && fail ? `${act}-${fail}` : act;
}

/**
 * Build the deterministic ON/OFF Valve SAP Item Code.
 *
 * Formats by valve type:
 *   Ball (2W):  VLV-ONF-BLV-{EC}-{NB}-{CL}-{Body}-{Seat}-{Bore}-{Style}-{Act}[-{Fail}]
 *   Ball (3L/T):VLV-ONF-BLV-{EC}-{NB}-{CL}-{Body}-{Seat}-{Style}-{Port}-{Act}[-{Fail}]
 *   Ball (DBB): VLV-ONF-BLV-{EC}-{NB}-{CL}-{Body}-{Seat}-{Bore}-DBB-{Act}[-{Fail}]
 *   Gate:       VLV-ONF-GTV-{EC}-{NB}-{CL}-{Body}-{Wedge}-{GateMat}-{Act}[-{Fail}]
 *   Globe:      VLV-ONF-GLV-{EC}-{NB}-{CL}-{Body}-{Trim}[-{Seat}]-{Act}[-{Fail}]
 *   Butterfly:  VLV-ONF-BF-{EC}-{NB}-{CL}-{Body}-{Design}-{Disc}-{SeatLiner}-{Act}[-{Fail}]
 *   Plug(NLS):  VLV-ONF-PLV-{EC}-{NB}-{CL}-{Body}-NLS-{Sleeve}-{Act}[-{Fail}]
 *   Plug(LUB/ECC): VLV-ONF-PLV-{EC}-{NB}-{CL}-{Body}-{PlugType}-{Act}[-{Fail}]
 *   Diaphragm:  VLV-ONF-DPV-{EC}-{NB}-{CL}-{Body}-{Diaphragm}-{Design}-{Act}[-{Fail}]
 *
 * Throws a descriptive error if any required field is missing or unrecognised.
 */
export function buildOnOffValveItemCode(attrs: Record<string, unknown>): string {
  const valveTypeRaw = (attrs.valve_type     as string | undefined)?.trim() ?? '';
  const endConnRaw   = (attrs.end_connection  as string | undefined)?.trim() ?? '';
  const sizeRaw      = (attrs.size_nb         as string | undefined)?.trim() ?? '';
  const pressureRaw  = (attrs.pressure_rating as string | undefined)?.trim() ?? '';
  const bodyMatRaw   = (attrs.body_material   as string | undefined)?.trim() ?? '';
  const actuationRaw = (attrs.actuation_type  as string | undefined)?.trim() ?? '';
  const failRaw      = (attrs.fail_action     as string | undefined)?.trim() ?? '';

  const endConn  = OOV_END_CONN_CODE[endConnRaw];
  const sizeM    = sizeRaw.match(/^(\d+)\s*NB$/i);
  const nb       = sizeM ? sizeM[1] : undefined;
  const pressure = OOV_PRESSURE_CODE[pressureRaw];
  const bodyMat  = OOV_BODY_MAT_CODE[bodyMatRaw];
  const act      = OOV_ACT_CODE[actuationRaw];

  const commonMissing: string[] = [];
  if (!valveTypeRaw) commonMissing.push('Valve Type');
  if (!endConn)      commonMissing.push(`End Connection ("${endConnRaw}")`);
  if (!nb)           commonMissing.push(`Size ("${sizeRaw}" — must be format "XX NB")`);
  if (!pressure)     commonMissing.push(`Pressure Rating ("${pressureRaw}")`);
  if (!bodyMat)      commonMissing.push(`Body Material ("${bodyMatRaw}")`);
  if (!act)          commonMissing.push(`Actuation Type ("${actuationRaw}")`);
  if (OOV_ACTUATED.has(actuationRaw) && !OOV_FAIL_CODE[failRaw])
    commonMissing.push(`Fail Action ("${failRaw}")`);
  if (commonMissing.length > 0)
    throw new Error(`Cannot generate ON/OFF Valve SAP Item Code — missing or unrecognised: ${commonMissing.join('; ')}`);

  const actSuffix = oovActSuffix(actuationRaw, failRaw);
  const vt = valveTypeRaw.toLowerCase();

  if (vt.includes('ball')) {
    const portRaw  = (attrs.port_configuration as string | undefined)?.trim() ?? '';
    const seatRaw  = (attrs.seat_material      as string | undefined)?.trim() ?? '';
    const boreRaw  = (attrs.bore_type          as string | undefined)?.trim() ?? '';
    const styleRaw = (attrs.body_style         as string | undefined)?.trim() ?? '';
    const seat     = OOV_SEAT_MAT_CODE[seatRaw];
    const bore     = OOV_BORE_CODE[boreRaw];
    const style    = OOV_STYLE_CODE[styleRaw];
    const bMissing: string[] = [];
    if (!seat) bMissing.push(`Seat Material ("${seatRaw}")`);
    if (portRaw === 'DBB (Double Block & Bleed)') {
      if (!bore) bMissing.push(`Bore Type ("${boreRaw}")`);
    } else if (portRaw === '3-Way (L-Port)' || portRaw === '3-Way (T-Port)') {
      if (!style) bMissing.push(`Body Style ("${styleRaw}")`);
    } else {
      if (!bore)  bMissing.push(`Bore Type ("${boreRaw}")`);
      if (!style) bMissing.push(`Body Style ("${styleRaw}")`);
    }
    if (bMissing.length > 0)
      throw new Error(`Cannot generate ON/OFF Valve SAP Item Code — missing or unrecognised: ${bMissing.join('; ')}`);
    if (portRaw === 'DBB (Double Block & Bleed)')
      return `VLV-ONF-BLV-${endConn}-${nb}-${pressure}-${bodyMat}-${seat}-${bore!}-DBB-${actSuffix}`;
    if (portRaw === '3-Way (L-Port)' || portRaw === '3-Way (T-Port)')
      return `VLV-ONF-BLV-${endConn}-${nb}-${pressure}-${bodyMat}-${seat}-${style!}-${OOV_PORT_CODE[portRaw]}-${actSuffix}`;
    return `VLV-ONF-BLV-${endConn}-${nb}-${pressure}-${bodyMat}-${seat}-${bore!}-${style!}-${actSuffix}`;
  }

  if (vt.includes('gate')) {
    const wedgeRaw   = (attrs.wedge_type    as string | undefined)?.trim() ?? '';
    const gateMatRaw = (attrs.gate_material as string | undefined)?.trim() ?? '';
    const wedge   = OOV_WEDGE_CODE[wedgeRaw];
    const gateMat = OOV_GATE_MAT_CODE[gateMatRaw];
    const gMissing: string[] = [];
    if (!wedge)   gMissing.push(`Wedge Type ("${wedgeRaw}")`);
    if (!gateMat) gMissing.push(`Gate/Wedge Material ("${gateMatRaw}")`);
    if (gMissing.length > 0)
      throw new Error(`Cannot generate ON/OFF Valve SAP Item Code — missing or unrecognised: ${gMissing.join('; ')}`);
    return `VLV-ONF-GTV-${endConn}-${nb}-${pressure}-${bodyMat}-${wedge!}-${gateMat!}-${actSuffix}`;
  }

  if (vt.includes('globe')) {
    const trimRaw = (attrs.plug_trim_material  as string | undefined)?.trim() ?? '';
    const seatRaw = (attrs.seat_material_globe as string | undefined)?.trim() ?? '';
    const trim = OOV_TRIM_CODE[trimRaw];
    const seat = OOV_SEAT_GLOBE_CODE[seatRaw];
    const glMissing: string[] = [];
    if (!trim) glMissing.push(`Plug/Trim Material ("${trimRaw}")`);
    if (!seat) glMissing.push(`Seat Material ("${seatRaw}")`);
    if (glMissing.length > 0)
      throw new Error(`Cannot generate ON/OFF Valve SAP Item Code — missing or unrecognised: ${glMissing.join('; ')}`);
    const trimSeat = trim === seat ? trim! : `${trim!}-${seat!}`;
    return `VLV-ONF-GLV-${endConn}-${nb}-${pressure}-${bodyMat}-${trimSeat}-${actSuffix}`;
  }

  if (vt.includes('butterfly')) {
    const designRaw = (attrs.valve_design  as string | undefined)?.trim() ?? '';
    const discRaw   = (attrs.disc_material as string | undefined)?.trim() ?? '';
    const linerRaw  = (attrs.seat_liner    as string | undefined)?.trim() ?? '';
    const design = OOV_DESIGN_CODE[designRaw];
    const disc   = OOV_DISC_CODE[discRaw];
    const liner  = OOV_LINER_CODE[linerRaw];
    const bfMissing: string[] = [];
    if (!design) bfMissing.push(`Valve Design ("${designRaw}")`);
    if (!disc)   bfMissing.push(`Disc Material ("${discRaw}")`);
    if (!liner)  bfMissing.push(`Seat Liner ("${linerRaw}")`);
    if (bfMissing.length > 0)
      throw new Error(`Cannot generate ON/OFF Valve SAP Item Code — missing or unrecognised: ${bfMissing.join('; ')}`);
    return `VLV-ONF-BF-${endConn}-${nb}-${pressure}-${bodyMat}-${design!}-${disc!}-${liner!}-${actSuffix}`;
  }

  if (vt.includes('plug')) {
    const plugTypeRaw = (attrs.plug_type       as string | undefined)?.trim() ?? '';
    const sleeveRaw   = (attrs.sleeve_material as string | undefined)?.trim() ?? '';
    const plugTypeCode = OOV_PLUG_TYPE_CODE[plugTypeRaw];
    if (!plugTypeCode)
      throw new Error(`Cannot generate ON/OFF Valve SAP Item Code — missing or unrecognised: Plug Type ("${plugTypeRaw}")`);
    if (plugTypeRaw === 'Non-Lubricated (Sleeved)') {
      const sleeve = OOV_SLEEVE_CODE[sleeveRaw];
      if (!sleeve)
        throw new Error(`Cannot generate ON/OFF Valve SAP Item Code — missing or unrecognised: Sleeve Material ("${sleeveRaw}")`);
      return `VLV-ONF-PLV-${endConn}-${nb}-${pressure}-${bodyMat}-NLS-${sleeve}-${actSuffix}`;
    }
    return `VLV-ONF-PLV-${endConn}-${nb}-${pressure}-${bodyMat}-${plugTypeCode}-${actSuffix}`;
  }

  if (vt.includes('diaphragm')) {
    const diaphRaw   = (attrs.diaphragm_material as string | undefined)?.trim() ?? '';
    const designRaw2 = (attrs.body_design        as string | undefined)?.trim() ?? '';
    const diaph   = OOV_DIAPHRAGM_CODE[diaphRaw];
    const design2 = OOV_BODY_DESIGN_CODE[designRaw2];
    const dpMissing: string[] = [];
    if (!diaph)   dpMissing.push(`Diaphragm Material ("${diaphRaw}")`);
    if (!design2) dpMissing.push(`Body Design ("${designRaw2}")`);
    if (dpMissing.length > 0)
      throw new Error(`Cannot generate ON/OFF Valve SAP Item Code — missing or unrecognised: ${dpMissing.join('; ')}`);
    return `VLV-ONF-DPV-${endConn}-${nb}-${pressure}-${bodyMat}-${diaph!}-${design2!}-${actSuffix}`;
  }

  throw new Error(`Cannot generate ON/OFF Valve SAP Item Code — unrecognised Valve Type: "${valveTypeRaw}"`);
}

/**
 * Find or create a master_items catalog record for an ON/OFF Valve specification.
 */
export async function resolveOnOffValveSapItemCode(
  pool:        Pool,
  groupId:     number,
  subgroupId:  number,
  attrs:       Record<string, unknown>,
  uomCode:     string,
  description: string,
): Promise<CatalogSapResult> {
  const itemCode = buildOnOffValveItemCode(attrs);
  assertSapCodeLength(itemCode);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ id: number }>(
      `SELECT id FROM master_items WHERE item_type = 'catalog' AND item_code = $1 FOR UPDATE`,
      [itemCode],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      await client.query('COMMIT');
      return { masterItemId: existing.rows[0].id, sapItemCode: itemCode, reused: true };
    }
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO master_items
         (item_code, description, uom, make_or_buy, item_type, buy_group_id, buy_subgroup_id, created_at, updated_at)
       VALUES ($1,$2,$3,'Buy','catalog',$4,$5,NOW(),NOW()) RETURNING id`,
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

// ── NRV Check Valve SAP Item Code ─────────────────────────────────────────────

const NRV_EC_CODE: Record<string, string> = {
  'Flanged': 'RF', 'BSP Threaded': 'BS', 'Threaded': 'NP',
  'Butt Weld': 'BW', 'Socket Weld': 'SW', 'Wafer': 'WF',
  'Lug Type': 'LG', 'Grooved': 'GV', 'Clamp End (Tri-Clamp)': 'TC',
};
const NRV_PRESSURE_CODE: Record<string, string> = {
  'Class 150': 'CL150', 'Class 300': 'CL300', 'Class 600': 'CL600',
  'Class 900': 'CL900', 'Class 1500': 'CL1500',
  'PN6': 'PN6', 'PN10': 'PN10', 'PN16': 'PN16', 'PN25': 'PN25',
  'PN40': 'PN40', 'PN64': 'PN64', 'PN100': 'PN100', 'PN160': 'PN160',
};
const NRV_BODY_CODE: Record<string, string> = {
  'WCB (CS)': 'WCB', 'LCB (Low Temp CS)': 'LCB',
  'SS304': 'SS304', 'SS316': 'SS316', 'SS316L': 'SS316L',
  'CF8': 'CF8', 'CF8M': 'CF8M', 'Duplex SS': 'DSS',
  'CI (Cast Iron)': 'CI', 'Ductile Iron': 'DI',
  'Bronze': 'BRZ', 'Hastelloy C': 'HC276',
};
const NRV_DISC_CODE: Record<string, string> = {
  'WCB (CS)': 'WCB', 'SS304': 'SS304', 'SS316': 'SS316', 'SS316L': 'SS316L',
  'Duplex SS': 'DSS', 'Bronze': 'BRZ', 'Hardened Steel': 'HSS',
  'Stellite Faced': 'STLT', 'NBR': 'NBR', 'EPDM': 'EPDM',
};
const NRV_SEAT_CODE: Record<string, string> = {
  'Soft Seat (NBR)': 'NBR', 'Soft Seat (EPDM)': 'EPDM',
  'Soft Seat (PTFE)': 'PTFE', 'Metal Seat (SS316)': 'SS316',
  'Stellite': 'STLT',
};
const NRV_BALL_CODE: Record<string, string> = {
  'SS316': 'SS316', 'PTFE Coated': 'PTFE', 'Rubber Coated': 'RUB', 'Buna-N': 'BN',
};
const NRV_PISTON_CODE: Record<string, string> = {
  'SS316': 'SS316', 'PTFE Coated': 'PTFE', 'Teflon Coated': 'TFLN',
};
const NRV_DISC_TILT_CODE: Record<string, string> = {
  'WCB (CS)': 'WCB', 'SS316': 'SS316', 'Duplex SS': 'DSS', 'Stellite Faced': 'STLT',
};
const NRV_DUAL_SPRING_CODE: Record<string, string> = {
  'SS316': 'SS316', 'Inconel': 'INC', 'Hastelloy C': 'HC276',
};
const NRV_STRAINER_CODE: Record<string, string> = {
  'Integral': 'INT', 'Separate': 'SEP', 'None': 'NIL',
};
const NRV_FOOT_SEAT_CODE: Record<string, string> = {
  'Rubber': 'RUB', 'Brass': 'BRS', 'SS316': 'SS316',
};
const NRV_LEVER_CODE: Record<string, string> = {
  'Standard (No Lever)':             '',
  'Lever Only':                      'LVR',
  'Lever + Counterweight':           'CWT',
  'Lever + Counterweight + Dashpot': 'DSH',
};

/**
 * Build the deterministic SAP Item Code for an NRV (Non-Return Valve).
 *
 * Formats:
 *  Swing:   VLV-NRV-SWG-{EC}-{NB}-{CL}-{Body}-{Disc}-{Seat}[-SA][-{Lever}]
 *  Lift:    VLV-NRV-LFT-{EC}-{NB}-{CL}-{Body}-{Disc}-{Seat}[-SA][-GD]
 *  Dual:    VLV-NRV-DPL-{EC}-{NB}-{CL}-{Body}-{Disc}-{Seat}-{Spring}
 *  Ball:    VLV-NRV-BLC-{EC}-{NB}-{CL}-{Body}-{Ball}-{Seat}
 *  Tilting: VLV-NRV-TLD-{EC}-{NB}-{CL}-{Body}-{Disc}-{Seat}[-SA]
 *  Piston:  VLV-NRV-PST-{EC}-{NB}-{CL}-{Body}-{Piston}-{Seat}[-DP]
 *  Foot:    VLV-NRV-FTV-{EC}-{NB}-{CL}-{Body}-{Disc}-{Strainer}-{FtSeat}
 */
export function buildNrvValveItemCode(attrs: Record<string, unknown>): string {
  const vtRaw   = (attrs.valve_type      as string | undefined)?.trim() ?? '';
  const ecRaw   = (attrs.end_connection  as string | undefined)?.trim() ?? '';
  const sizeRaw = (attrs.size_nb         as string | undefined)?.trim() ?? '';
  const prRaw   = (attrs.pressure_rating as string | undefined)?.trim() ?? '';
  const bodyRaw = (attrs.body_material   as string | undefined)?.trim() ?? '';

  const ec   = NRV_EC_CODE[ecRaw];
  const nbM  = sizeRaw.match(/^(\d+)\s*NB$/i);
  const nb   = nbM ? nbM[1] : undefined;
  const pr   = NRV_PRESSURE_CODE[prRaw];
  const body = NRV_BODY_CODE[bodyRaw];

  const missing: string[] = [];
  if (!vtRaw) missing.push('Valve Type');
  if (!ec)    missing.push(`End Connection ("${ecRaw}")`);
  if (!nb)    missing.push(`Size ("${sizeRaw}" — must be "XX NB")`);
  if (!pr)    missing.push(`Pressure Rating ("${prRaw}")`);
  if (!body)  missing.push(`Body Material ("${bodyRaw}")`);
  if (missing.length > 0)
    throw new Error(`Cannot generate NRV SAP Item Code — missing or unrecognised: ${missing.join('; ')}`);

  const vtLC = vtRaw.toLowerCase();

  // Per-family End Connection applicability (server-side enforcement)
  const NRV_FAMILY_ALLOWED_EC: Record<string, string[]> = {
    swing:   ['RF','BS','NP','BW','SW'],
    lift:    ['RF','BS','NP','BW','SW','TC'],
    dual:    ['WF','LG','RF'],
    ball:    ['RF','BS','NP','BW','SW'],
    tilting: ['RF','BW','SW'],
    piston:  ['RF','BS','NP','BW','SW','TC'],
    foot:    ['RF','BS','NP'],
  };
  const familyKey =
    vtLC.includes('swing')   ? 'swing'   :
    vtLC.includes('lift')    ? 'lift'    :
    vtLC.includes('dual')    ? 'dual'    :
    vtLC.includes('ball')    ? 'ball'    :
    vtLC.includes('tilting') ? 'tilting' :
    vtLC.includes('piston')  ? 'piston'  :
    vtLC.includes('foot')    ? 'foot'    : null;
  if (familyKey && !NRV_FAMILY_ALLOWED_EC[familyKey].includes(ec!)) {
    throw new Error(
      `Cannot generate NRV SAP Item Code — End Connection "${ecRaw}" is not applicable for ${vtRaw}. ` +
      `Allowed: ${NRV_FAMILY_ALLOWED_EC[familyKey].join(', ')}`,
    );
  }

  if (vtLC.includes('swing')) {
    const discRaw   = (attrs.disc_material     as string | undefined)?.trim() ?? '';
    const seatRaw   = (attrs.seat_material     as string | undefined)?.trim() ?? '';
    const springRaw = (attrs.spring            as string | undefined)?.trim() ?? '';
    const leverRaw  = (attrs.lever_arrangement as string | undefined)?.trim() ?? '';
    const disc = NRV_DISC_CODE[discRaw];
    const seat = NRV_SEAT_CODE[seatRaw];
    const m: string[] = [];
    if (!disc) m.push(`Disc Material ("${discRaw}")`);
    if (!seat) m.push(`Seat Material ("${seatRaw}")`);
    if (m.length > 0) throw new Error(`Cannot generate NRV SAP Item Code — missing or unrecognised: ${m.join('; ')}`);
    const sa          = springRaw === 'Spring Assisted' ? '-SA' : '';
    const leverCode   = NRV_LEVER_CODE[leverRaw];
    const leverSuffix = (leverCode !== undefined && leverCode !== '') ? `-${leverCode}` : '';
    return `VLV-NRV-SWG-${ec}-${nb}-${pr}-${body}-${disc}-${seat}${sa}${leverSuffix}`;
  }

  if (vtLC.includes('lift')) {
    const discRaw   = (attrs.disc_material as string | undefined)?.trim() ?? '';
    const seatRaw   = (attrs.seat_material as string | undefined)?.trim() ?? '';
    const springRaw = (attrs.spring        as string | undefined)?.trim() ?? '';
    const guidedRaw = (attrs.guided        as string | undefined)?.trim() ?? '';
    const disc = NRV_DISC_CODE[discRaw];
    const seat = NRV_SEAT_CODE[seatRaw];
    const m: string[] = [];
    if (!disc) m.push(`Disc Material ("${discRaw}")`);
    if (!seat) m.push(`Seat Material ("${seatRaw}")`);
    if (m.length > 0) throw new Error(`Cannot generate NRV SAP Item Code — missing or unrecognised: ${m.join('; ')}`);
    const sa = springRaw === 'Spring Assisted' ? '-SA' : '';
    const gd = guidedRaw === 'Yes' ? '-GD' : '';
    return `VLV-NRV-LFT-${ec}-${nb}-${pr}-${body}-${disc}-${seat}${sa}${gd}`;
  }

  if (vtLC.includes('dual')) {
    const discRaw   = (attrs.disc_material        as string | undefined)?.trim() ?? '';
    const seatRaw   = (attrs.seat_material        as string | undefined)?.trim() ?? '';
    const springRaw = (attrs.dual_spring_material as string | undefined)?.trim() ?? '';
    const disc   = NRV_DISC_CODE[discRaw];
    const seat   = NRV_SEAT_CODE[seatRaw];
    const spring = NRV_DUAL_SPRING_CODE[springRaw];
    const m: string[] = [];
    if (!disc)   m.push(`Disc Material ("${discRaw}")`);
    if (!seat)   m.push(`Seat Material ("${seatRaw}")`);
    if (!spring) m.push(`Spring Material ("${springRaw}")`);
    if (m.length > 0) throw new Error(`Cannot generate NRV SAP Item Code — missing or unrecognised: ${m.join('; ')}`);
    return `VLV-NRV-DPL-${ec}-${nb}-${pr}-${body}-${disc}-${seat}-${spring}`;
  }

  if (vtLC.includes('ball')) {
    const ballRaw = (attrs.ball_material as string | undefined)?.trim() ?? '';
    const seatRaw = (attrs.seat_material as string | undefined)?.trim() ?? '';
    const ball = NRV_BALL_CODE[ballRaw];
    const seat = NRV_SEAT_CODE[seatRaw];
    const m: string[] = [];
    if (!ball) m.push(`Ball Material ("${ballRaw}")`);
    if (!seat) m.push(`Seat Material ("${seatRaw}")`);
    if (m.length > 0) throw new Error(`Cannot generate NRV SAP Item Code — missing or unrecognised: ${m.join('; ')}`);
    return `VLV-NRV-BLC-${ec}-${nb}-${pr}-${body}-${ball}-${seat}`;
  }

  if (vtLC.includes('tilting')) {
    const discRaw   = (attrs.disc_tilt_material as string | undefined)?.trim() ?? '';
    const seatRaw   = (attrs.seat_material      as string | undefined)?.trim() ?? '';
    const springRaw = (attrs.spring             as string | undefined)?.trim() ?? '';
    const disc = NRV_DISC_TILT_CODE[discRaw];
    const seat = NRV_SEAT_CODE[seatRaw];
    const m: string[] = [];
    if (!disc) m.push(`Disc Material ("${discRaw}")`);
    if (!seat) m.push(`Seat Material ("${seatRaw}")`);
    if (m.length > 0) throw new Error(`Cannot generate NRV SAP Item Code — missing or unrecognised: ${m.join('; ')}`);
    const sa = springRaw === 'Spring Assisted' ? '-SA' : '';
    return `VLV-NRV-TLD-${ec}-${nb}-${pr}-${body}-${disc}-${seat}${sa}`;
  }

  if (vtLC.includes('piston')) {
    const pistonRaw  = (attrs.piston_material as string | undefined)?.trim() ?? '';
    const seatRaw    = (attrs.seat_material   as string | undefined)?.trim() ?? '';
    const dashpotRaw = (attrs.dashpot         as string | undefined)?.trim() ?? '';
    const piston = NRV_PISTON_CODE[pistonRaw];
    const seat   = NRV_SEAT_CODE[seatRaw];
    const m: string[] = [];
    if (!piston) m.push(`Piston Material ("${pistonRaw}")`);
    if (!seat)   m.push(`Seat Material ("${seatRaw}")`);
    if (m.length > 0) throw new Error(`Cannot generate NRV SAP Item Code — missing or unrecognised: ${m.join('; ')}`);
    const dp = dashpotRaw === 'Yes' ? '-DP' : '';
    return `VLV-NRV-PST-${ec}-${nb}-${pr}-${body}-${piston}-${seat}${dp}`;
  }

  if (vtLC.includes('foot')) {
    const discRaw     = (attrs.disc_material      as string | undefined)?.trim() ?? '';
    const strainerRaw = (attrs.strainer           as string | undefined)?.trim() ?? '';
    const ftSeatRaw   = (attrs.foot_seat_material as string | undefined)?.trim() ?? '';
    const disc     = NRV_DISC_CODE[discRaw];
    const strainer = NRV_STRAINER_CODE[strainerRaw];
    const ftSeat   = NRV_FOOT_SEAT_CODE[ftSeatRaw];
    const m: string[] = [];
    if (!disc)     m.push(`Disc Material ("${discRaw}")`);
    if (!strainer) m.push(`Strainer ("${strainerRaw}")`);
    if (!ftSeat)   m.push(`Seat Material ("${ftSeatRaw}")`);
    if (m.length > 0) throw new Error(`Cannot generate NRV SAP Item Code — missing or unrecognised: ${m.join('; ')}`);
    return `VLV-NRV-FTV-${ec}-${nb}-${pr}-${body}-${disc}-${strainer}-${ftSeat}`;
  }

  throw new Error(`Cannot generate NRV SAP Item Code — unrecognised Valve Type: "${vtRaw}"`);
}

/**
 * Find or create a master_items catalog record for an NRV specification.
 */
export async function resolveNrvValveSapItemCode(
  pool:        Pool,
  groupId:     number,
  subgroupId:  number,
  attrs:       Record<string, unknown>,
  uomCode:     string,
  description: string,
): Promise<CatalogSapResult> {
  const itemCode = buildNrvValveItemCode(attrs);
  assertSapCodeLength(itemCode);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ id: number }>(
      `SELECT id FROM master_items WHERE item_type = 'catalog' AND item_code = $1 FOR UPDATE`,
      [itemCode],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      await client.query('COMMIT');
      return { masterItemId: existing.rows[0].id, sapItemCode: itemCode, reused: true };
    }
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO master_items
         (item_code, description, uom, make_or_buy, item_type, buy_group_id, buy_subgroup_id, created_at, updated_at)
       VALUES ($1,$2,$3,'Buy','catalog',$4,$5,NOW(),NOW()) RETURNING id`,
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

// ─────────────────────────────────────────────────────────────────────────────
// NEEDLE VALVE SAP ITEM CODE BUILDER
// ─────────────────────────────────────────────────────────────────────────────
/*
 * Formats:
 *  ST/AN/MT: VLV-NDL-{TYPE}-{EC}-{SIZE}-{PR}-{BODY}-{STEM}-{SEAT}-{PACK}-{BONNET}
 *  BL:       VLV-NDL-BL-{EC}-{SIZE}-{PR}-{BODY}-{STEM}-{SEAT}-{PACK}-{VENT}
 *
 * EC groups:
 *  Ferrule  (DF/SF)         → Tube OD sizes (T025–T100) + PSI ratings (3K/6K/10K)
 *  Threaded (NM/NF/BM/BF)  → NB sizes (8–25) + PSI ratings (3K/6K/10K)
 *  Process  (SW/BW/FL)      → NB sizes (8–25) + Class/PN ratings
 *  BL family: Ferrule or Threaded ONLY — process connections not permitted.
 */

const NDL_TYPE_CODE: Record<string, string> = {
  'Straight Needle Valve':          'ST',
  'Angle Needle Valve (L-Pattern)': 'AN',
  'Multi-Turn Needle Valve':        'MT',
  'Bleed / Vent Needle Valve':      'BL',
};

const NDL_EC_CODE: Record<string, string> = {
  'Double Ferrule (Swagelok / Ham-Let Type)': 'DF',
  'Single Ferrule (Parker Type)':             'SF',
  'NPT Male':                                 'NM',
  'NPT Female':                               'NF',
  'BSP Male':                                 'BM',
  'BSP Female':                               'BF',
  'Socket Weld':                              'SW',
  'Butt Weld':                                'BW',
  'Flanged (ASME B16.5)':                     'FL',
};

const NDL_EC_GROUP: Record<string, 'ferrule' | 'threaded' | 'process'> = {
  DF: 'ferrule', SF: 'ferrule',
  NM: 'threaded', NF: 'threaded', BM: 'threaded', BF: 'threaded',
  SW: 'process',  BW: 'process',  FL: 'process',
};

const NDL_FERRULE_SIZES = new Set(['T025', 'T038', 'T050', 'T075', 'T100']);
const NDL_NB_SIZES      = new Set(['8', '10', '15', '20', '25']);
const NDL_PSI_PR        = new Set(['3K', '6K', '10K']);

const NDL_SIZE_CODE: Record<string, string> = {
  '1/4" OD':      'T025',
  '3/8" OD':      'T038',
  '1/2" OD':      'T050',
  '3/4" OD':      'T075',
  '1" OD':        'T100',
  '8 NB (DN8)':   '8',
  '10 NB (DN10)': '10',
  '15 NB (DN15)': '15',
  '20 NB (DN20)': '20',
  '25 NB (DN25)': '25',
};

const NDL_PR_CODE: Record<string, string> = {
  '3000 PSI (207 bar)':  '3K',
  '6000 PSI (414 bar)':  '6K',
  '10000 PSI (689 bar)': '10K',
  'Class 300':  'CL300',
  'Class 600':  'CL600',
  'Class 900':  'CL900',
  'Class 1500': 'CL1500',
  'PN40':  'PN40',
  'PN64':  'PN64',
  'PN100': 'PN100',
};

const NDL_BODY_CODE: Record<string, string> = {
  'SS316':               'SS316',
  'SS316L':              'SS316L',
  'SS304':               'SS304',
  'Carbon Steel (A105)': 'A105',
  'Duplex SS (A182 F51)':'DSS',
  'Monel 400 (B564)':    'M400',
  'Hastelloy C-276':     'HC276',
  'Inconel 625':         'INC625',
};

const NDL_STEM_CODE: Record<string, string> = {
  'SS316':           'SS316',
  'SS316L':          'SS316L',
  '17-4 PH SS':      '174PH',
  'Monel 400':       'M400',
  'Hastelloy C-276': 'HC276',
};

const NDL_SEAT_CODE: Record<string, string> = {
  'Metal Seat (Integral)': 'MET',
  'PTFE Soft Seat':        'PTFE',
  'PEEK Seat':             'PEEK',
};

const NDL_PACK_CODE: Record<string, string> = {
  'PTFE':        'PTFE',
  'Graphite':    'GRP',
  'FKM (Viton)': 'FKM',
};

const NDL_BONNET_CODE: Record<string, string> = {
  'Packed Bonnet':   'PKD',
  'Welded Bonnet':   'WLD',
  'Capped Bonnet':   'CAP',
  'Extended Bonnet': 'EXT',
};

const NDL_VENT_CODE: Record<string, string> = {
  'Manual Bleed':      'MBL',
  'Auto Vent':         'AVT',
  'Self-Closing Vent': 'SCV',
};

export function buildNeedleValveItemCode(attrs: Record<string, unknown>): string {
  const vtRaw   = (attrs.valve_type      as string | undefined)?.trim() ?? '';
  const ecRaw   = (attrs.end_connection  as string | undefined)?.trim() ?? '';
  const sizeRaw = (attrs.size            as string | undefined)?.trim() ?? '';
  const prRaw   = (attrs.pressure_rating as string | undefined)?.trim() ?? '';
  const bodyRaw = (attrs.body_material   as string | undefined)?.trim() ?? '';
  const stemRaw = (attrs.stem_material   as string | undefined)?.trim() ?? '';
  const seatRaw = (attrs.seat_type       as string | undefined)?.trim() ?? '';
  const packRaw = (attrs.packing         as string | undefined)?.trim() ?? '';

  const vt   = NDL_TYPE_CODE[vtRaw];
  const ec   = NDL_EC_CODE[ecRaw];
  const sz   = NDL_SIZE_CODE[sizeRaw];
  const pr   = NDL_PR_CODE[prRaw];
  const body = NDL_BODY_CODE[bodyRaw];
  const stem = NDL_STEM_CODE[stemRaw];
  const seat = NDL_SEAT_CODE[seatRaw];
  const pack = NDL_PACK_CODE[packRaw];

  const isBleed = vt === 'BL';

  const bonnetRaw = isBleed ? '' : ((attrs.bonnet_type as string | undefined)?.trim() ?? '');
  const ventRaw   = isBleed ? ((attrs.vent_type as string | undefined)?.trim() ?? '') : '';
  const bonnet    = isBleed ? undefined : NDL_BONNET_CODE[bonnetRaw];
  const vent      = isBleed ? NDL_VENT_CODE[ventRaw] : undefined;

  const missing: string[] = [];
  if (!vt)   missing.push(`Valve Type ("${vtRaw}")`);
  if (!ec)   missing.push(`End Connection ("${ecRaw}")`);
  if (!sz)   missing.push(`Size ("${sizeRaw}")`);
  if (!pr)   missing.push(`Pressure Rating ("${prRaw}")`);
  if (!body) missing.push(`Body Material ("${bodyRaw}")`);
  if (!stem) missing.push(`Stem Material ("${stemRaw}")`);
  if (!seat) missing.push(`Seat Type ("${seatRaw}")`);
  if (!pack) missing.push(`Packing ("${packRaw}")`);
  if (!isBleed && !bonnet) missing.push(`Bonnet Type ("${bonnetRaw}")`);
  if (isBleed  && !vent)   missing.push(`Vent Type ("${ventRaw}")`);

  if (missing.length > 0)
    throw new Error(`Cannot generate Needle Valve SAP Item Code — missing or unrecognised: ${missing.join('; ')}`);

  const ecGroup = NDL_EC_GROUP[ec!];

  // BL restriction: no process connections
  if (isBleed && ecGroup === 'process') {
    throw new Error(
      `Cannot generate Needle Valve SAP Item Code — Bleed/Vent Needle Valve does not permit process connections (${ecRaw}). Allowed: Double Ferrule, Single Ferrule, NPT Male/Female, BSP Male/Female.`,
    );
  }

  // EC × Size validation
  if (ecGroup === 'ferrule' && !NDL_FERRULE_SIZES.has(sz!)) {
    throw new Error(
      `Cannot generate Needle Valve SAP Item Code — Ferrule connection (${ecRaw}) requires a tube OD size (T025–T100). "${sizeRaw}" is not valid.`,
    );
  }
  if ((ecGroup === 'threaded' || ecGroup === 'process') && !NDL_NB_SIZES.has(sz!)) {
    throw new Error(
      `Cannot generate Needle Valve SAP Item Code — ${ecGroup === 'threaded' ? 'Threaded' : 'Process'} connection (${ecRaw}) requires an NB size (8–25). "${sizeRaw}" is not valid.`,
    );
  }

  // EC × Pressure validation
  if ((ecGroup === 'ferrule' || ecGroup === 'threaded') && !NDL_PSI_PR.has(pr!)) {
    throw new Error(
      `Cannot generate Needle Valve SAP Item Code — ${ecGroup === 'ferrule' ? 'Ferrule' : 'Threaded'} connection (${ecRaw}) requires a PSI pressure rating (3K / 6K / 10K). "${prRaw}" is not valid.`,
    );
  }
  if (ecGroup === 'process' && NDL_PSI_PR.has(pr!)) {
    throw new Error(
      `Cannot generate Needle Valve SAP Item Code — Process connection (${ecRaw}) requires a Class or PN pressure rating. "${prRaw}" is not valid.`,
    );
  }

  if (isBleed) {
    return `VLV-NDL-BL-${ec}-${sz}-${pr}-${body}-${stem}-${seat}-${pack}-${vent}`;
  }
  return `VLV-NDL-${vt}-${ec}-${sz}-${pr}-${body}-${stem}-${seat}-${pack}-${bonnet}`;
}

export async function resolveNeedleValveSapItemCode(
  pool:       Pool,
  groupId:    number,
  subgroupId: number,
  attrs:      Record<string, unknown>,
  uomCode:    string,
  description: string,
): Promise<{ masterItemId: number; sapItemCode: string; reused: boolean }> {
  const itemCode = buildNeedleValveItemCode(attrs);
  return resolveOrCreateSapMasterItem(pool, itemCode, description, uomCode, groupId, subgroupId, null, null);
}

// ─────────────────────────────────────────────────────────────────────────────
// MCC PANEL
// Skeleton: PNL-MCC-{VOLT}-{BUS}-{ICW}-{IP}-{MAT}-{AREA}
// Safe:      PNL-MCC-415V-800A-50KA-IP54-CRCA-SA           (34 chars)
// Hazardous: PNL-MCC-415V-3200A-85KA-IP65-SS316-Z2-EXIA-IIC-T6 (49 chars)
// ─────────────────────────────────────────────────────────────────────────────
const MCC_VOLT_MAP: Record<string, string> = {
  '415V AC (3Ph)': '415V',
  '380V AC (3Ph)': '380V',
  '440V AC (3Ph)': '440V',
  '480V AC (3Ph)': '480V',
  '690V AC (3Ph)': '690V',
};
const MCC_BUS_SET = new Set([
  '100A','125A','160A','200A','250A','315A','400A','500A',
  '630A','800A','1000A','1250A','1600A','2000A','2500A','3200A',
]);
const MCC_ICW_MAP: Record<string, string> = {
  '6 kA':'6KA','10 kA':'10KA','25 kA':'25KA','36 kA':'36KA',
  '50 kA':'50KA','65 kA':'65KA','85 kA':'85KA',
};
const MCC_IP_SET = new Set(['IP20','IP42','IP54','IP55','IP65','IP66']);
const MCC_MAT_MAP: Record<string, string> = {
  'CRCA Steel':'CRCA','SS304':'SS304','SS316':'SS316','Aluminium':'ALU','GRP/FRP':'GRP',
};
const MCC_EXP_MAP: Record<string, string> = {
  'Ex e (Increased Safety)':   'EXE',
  'Ex d (Flameproof)':         'EXD',
  'Ex n (Non-sparking)':       'EXN',
  'Ex p (Pressurized)':        'EXP',
  'Ex ia (Intrinsically Safe)':'EXIA',
};

export function buildMccPanelItemCode(attrs: Record<string, unknown>): string {
  const voltRaw  = ((attrs.voltage           as string) ?? '').trim();
  const busRaw   = ((attrs.main_bus_rating   as string) ?? '').trim();
  const icwRaw   = ((attrs.fault_level_icw   as string) ?? '').trim();
  const ipRaw    = ((attrs.ip_rating         as string) ?? '').trim();
  const matRaw   = ((attrs.enclosure_material as string) ?? '').trim();
  const areaRaw  = ((attrs.area_classification as string) ?? '').trim();

  const volt = MCC_VOLT_MAP[voltRaw];
  const bus  = MCC_BUS_SET.has(busRaw) ? busRaw : undefined;
  const icw  = MCC_ICW_MAP[icwRaw];
  const ip   = MCC_IP_SET.has(ipRaw) ? ipRaw : undefined;
  const mat  = MCC_MAT_MAP[matRaw];

  const missing: string[] = [];
  if (!volt) missing.push(`Voltage ("${voltRaw}")`);
  if (!bus)  missing.push(`Main Bus Rating ("${busRaw}")`);
  if (!icw)  missing.push(`Panel Fault Level Icw ("${icwRaw}")`);
  if (!ip)   missing.push(`IP Rating ("${ipRaw}")`);
  if (!mat)  missing.push(`Enclosure Material ("${matRaw}")`);
  if (!areaRaw) missing.push('Area Classification');

  const isHazardous = areaRaw === 'Zone 1' || areaRaw === 'Zone 2';
  let expCode = '', gasCode = '', tmpCode = '';
  if (isHazardous) {
    const expRaw = ((attrs.explosion_protection as string) ?? '').trim();
    const gasRaw = ((attrs.gas_group            as string) ?? '').trim();
    const tmpRaw = ((attrs.temperature_class    as string) ?? '').trim();
    expCode = MCC_EXP_MAP[expRaw] ?? '';
    gasCode = ['IIA','IIB','IIC'].includes(gasRaw) ? gasRaw : '';
    tmpCode = /^T[1-6]/.test(tmpRaw) ? tmpRaw.split(' ')[0] : '';
    if (!expCode) missing.push(`Explosion Protection ("${expRaw}")`);
    if (!gasCode) missing.push(`Gas Group ("${gasRaw}")`);
    if (!tmpCode) missing.push(`Temperature Class ("${tmpRaw}")`);
  } else if (areaRaw !== 'Safe Area') {
    missing.push(`Area Classification — must be Safe Area, Zone 1 or Zone 2 ("${areaRaw}")`);
  }

  if (missing.length > 0)
    throw new Error(`Cannot generate MCC SAP Item Code — missing or unrecognised: ${missing.join('; ')}`);

  const zone    = areaRaw === 'Zone 1' ? 'Z1' : 'Z2';
  const areaSeg = isHazardous ? `${zone}-${expCode}-${gasCode}-${tmpCode}` : 'SA';
  const code    = `PNL-MCC-${volt}-${bus}-${icw}-${ip}-${mat}-${areaSeg}`;

  if (code.length > 50)
    throw new Error(`MCC SAP Item Code exceeds 50 characters: "${code}" (${code.length} chars)`);
  return code;
}

export async function resolveMccPanelSapItemCode(
  pool:        Pool,
  groupId:     number,
  subgroupId:  number,
  attrs:       Record<string, unknown>,
  uomCode:     string,
  description: string,
): Promise<{ masterItemId: number; sapItemCode: string; reused: boolean }> {
  const itemCode = buildMccPanelItemCode(attrs);
  return resolveOrCreateSapMasterItem(pool, itemCode, description, uomCode, groupId, subgroupId, null, null);
}

// ══════════════════════════════════════════════════════════════════════════════
// NON-MCC PANEL BUILDERS
// Shared maps — extended voltage set + common lookups
// ══════════════════════════════════════════════════════════════════════════════
const P_VOLT3: Record<string, string> = {
  '415V AC (3Ph)': '415V', '380V AC (3Ph)': '380V', '440V AC (3Ph)': '440V',
  '480V AC (3Ph)': '480V', '690V AC (3Ph)': '690V',
};
const P_VOLT_ALL: Record<string, string> = {
  ...P_VOLT3,
  '240V AC (1Ph)': '240V', '110V AC (1Ph)': '110V',
  '110V DC': '110VDC', '48V DC': '48VDC', '24V DC': '24VDC',
};
const P_ICW: Record<string, string> = {
  '6 kA':'6KA','10 kA':'10KA','25 kA':'25KA','36 kA':'36KA',
  '50 kA':'50KA','65 kA':'65KA','85 kA':'85KA',
};
const P_MAT: Record<string, string> = {
  'CRCA Steel':'CRCA','SS304':'SS304','SS316':'SS316','Aluminium':'ALU','GRP/FRP':'GRP',
};
const P_EXP: Record<string, string> = {
  'Ex e (Increased Safety)':'EXE','Ex d (Flameproof)':'EXD',
  'Ex n (Non-sparking)':'EXN','Ex p (Pressurized)':'EXP',
  'Ex ia (Intrinsically Safe)':'EXIA',
};
const P_IP  = new Set(['IP20','IP42','IP54','IP55','IP65','IP66']);
const P_BUS = new Set([
  '100A','125A','160A','200A','250A','315A','400A','500A',
  '630A','800A','1000A','1250A','1600A','2000A','2500A','3200A',
]);
const P_ENCTYPE: Record<string, string> = {
  'Floor Standing':'FS','Wall Mounted':'WM','Desktop':'DSK','Rack Mounted':'RM',
};
const P_STARTER: Record<string, string> = { 'DOL':'DOL','Star-Delta':'SD','Soft Starter':'SS' };
const P_BYPASS:  Record<string, string> = { 'None':'NBY','Mechanical Bypass':'MBY','Electronic Bypass':'EBY' };
const P_VFD_KW  = new Set(['11','15','22','30','37','45','55','75','90','110','132','160','200','250','315','400','500','630','800','1000']);
const P_APFC_KV = new Set(['25','50','75','100','150','200','250','300','400','500','750','1000']);

/** Shared helper: resolve area segment or accumulate missing. */
function panelAreaSeg(attrs: Record<string, unknown>, missing: string[]): string {
  const area = ((attrs.area_classification as string) ?? '').trim();
  if (!area) { missing.push('Area Classification'); return ''; }
  if (area === 'Safe Area') return 'SA';
  if (area !== 'Zone 1' && area !== 'Zone 2') {
    missing.push(`Area Classification — must be Safe Area, Zone 1 or Zone 2 ("${area}")`); return '';
  }
  const expRaw = ((attrs.explosion_protection as string) ?? '').trim();
  const gasRaw = ((attrs.gas_group            as string) ?? '').trim();
  const tmpRaw = ((attrs.temperature_class    as string) ?? '').trim();
  const exp = P_EXP[expRaw] ?? '';
  const gas = ['IIA','IIB','IIC'].includes(gasRaw) ? gasRaw : '';
  const tmp = /^T[1-6]/.test(tmpRaw) ? tmpRaw.split(' ')[0] : '';
  if (!exp) missing.push(`Explosion Protection ("${expRaw}")`);
  if (!gas) missing.push(`Gas Group ("${gasRaw}")`);
  if (!tmp) missing.push(`Temperature Class ("${tmpRaw}")`);
  return `${area === 'Zone 1' ? 'Z1' : 'Z2'}-${exp}-${gas}-${tmp}`;
}

function checkPanelCode(code: string, label: string): string {
  if (code.length > 50)
    throw new Error(`${label} SAP Item Code exceeds 50 characters: "${code}" (${code.length} chars)`);
  return code;
}

// ── Starter Panel ─────────────────────────────────────────────────────────────
// PNL-STR-{STARTER}-{VOLT}-{ICW}-{IP}-{MAT}-{AREA}
export function buildStarterPanelItemCode(attrs: Record<string, unknown>): string {
  const starterRaw = ((attrs.starter_type      as string) ?? '').trim();
  const voltRaw    = ((attrs.voltage           as string) ?? '').trim();
  const icwRaw     = ((attrs.fault_level_icw   as string) ?? '').trim();
  const ipRaw      = ((attrs.ip_rating         as string) ?? '').trim();
  const matRaw     = ((attrs.enclosure_material as string) ?? '').trim();
  const starter = P_STARTER[starterRaw];
  const volt    = P_VOLT3[voltRaw];
  const icw     = P_ICW[icwRaw];
  const ip      = P_IP.has(ipRaw) ? ipRaw : undefined;
  const mat     = P_MAT[matRaw];
  const missing: string[] = [];
  if (!starter) missing.push(`Starter Type ("${starterRaw}")`);
  if (!volt)    missing.push(`System Voltage ("${voltRaw}")`);
  if (!icw)     missing.push(`Panel Fault Level Icw ("${icwRaw}")`);
  if (!ip)      missing.push(`IP Rating ("${ipRaw}")`);
  if (!mat)     missing.push(`Enclosure Material ("${matRaw}")`);
  const area = panelAreaSeg(attrs, missing);
  if (missing.length) throw new Error(`Cannot generate Starter Panel SAP Item Code — missing or unrecognised: ${missing.join('; ')}`);
  return checkPanelCode(`PNL-STR-${starter}-${volt}-${icw}-${ip}-${mat}-${area}`, 'Starter Panel');
}
export async function resolveStarterPanelSapItemCode(
  pool: Pool, groupId: number, subgroupId: number,
  attrs: Record<string, unknown>, uomCode: string, description: string,
): Promise<{ masterItemId: number; sapItemCode: string; reused: boolean }> {
  return resolveOrCreateSapMasterItem(pool, buildStarterPanelItemCode(attrs), description, uomCode, groupId, subgroupId, null, null);
}

// ── Distribution Board ────────────────────────────────────────────────────────
// PNL-DB-{VOLT}-{BUS}-{ICW}-{IP}-{MAT}-{AREA}
export function buildDbPanelItemCode(attrs: Record<string, unknown>): string {
  const voltRaw = ((attrs.voltage            as string) ?? '').trim();
  const busRaw  = ((attrs.main_bus_rating    as string) ?? '').trim();
  const icwRaw  = ((attrs.fault_level_icw   as string) ?? '').trim();
  const ipRaw   = ((attrs.ip_rating         as string) ?? '').trim();
  const matRaw  = ((attrs.enclosure_material as string) ?? '').trim();
  const volt = P_VOLT_ALL[voltRaw]; // includes 1Ph AC
  const bus  = P_BUS.has(busRaw) ? busRaw : undefined;
  const icw  = P_ICW[icwRaw];
  const ip   = P_IP.has(ipRaw) ? ipRaw : undefined;
  const mat  = P_MAT[matRaw];
  const missing: string[] = [];
  if (!volt) missing.push(`System Voltage ("${voltRaw}")`);
  if (!bus)  missing.push(`Main Bus Rating ("${busRaw}")`);
  if (!icw)  missing.push(`Panel Fault Level Icw ("${icwRaw}")`);
  if (!ip)   missing.push(`IP Rating ("${ipRaw}")`);
  if (!mat)  missing.push(`Enclosure Material ("${matRaw}")`);
  const area = panelAreaSeg(attrs, missing);
  if (missing.length) throw new Error(`Cannot generate DB SAP Item Code — missing or unrecognised: ${missing.join('; ')}`);
  return checkPanelCode(`PNL-DB-${volt}-${bus}-${icw}-${ip}-${mat}-${area}`, 'Distribution Board');
}
export async function resolveDbPanelSapItemCode(
  pool: Pool, groupId: number, subgroupId: number,
  attrs: Record<string, unknown>, uomCode: string, description: string,
): Promise<{ masterItemId: number; sapItemCode: string; reused: boolean }> {
  return resolveOrCreateSapMasterItem(pool, buildDbPanelItemCode(attrs), description, uomCode, groupId, subgroupId, null, null);
}

// ── Power Distribution Panel ──────────────────────────────────────────────────
// PNL-PDP-{VOLT}-{BUS}-{ICW}-{IP}-{MAT}-{AREA}
export function buildPdpPanelItemCode(attrs: Record<string, unknown>): string {
  const voltRaw = ((attrs.voltage            as string) ?? '').trim();
  const busRaw  = ((attrs.main_bus_rating    as string) ?? '').trim();
  const icwRaw  = ((attrs.fault_level_icw   as string) ?? '').trim();
  const ipRaw   = ((attrs.ip_rating         as string) ?? '').trim();
  const matRaw  = ((attrs.enclosure_material as string) ?? '').trim();
  const volt = P_VOLT3[voltRaw]; // 3-phase only
  const bus  = P_BUS.has(busRaw) ? busRaw : undefined;
  const icw  = P_ICW[icwRaw];
  const ip   = P_IP.has(ipRaw) ? ipRaw : undefined;
  const mat  = P_MAT[matRaw];
  const missing: string[] = [];
  if (!volt) missing.push(`System Voltage ("${voltRaw}")`);
  if (!bus)  missing.push(`Main Bus Rating ("${busRaw}")`);
  if (!icw)  missing.push(`Panel Fault Level Icw ("${icwRaw}")`);
  if (!ip)   missing.push(`IP Rating ("${ipRaw}")`);
  if (!mat)  missing.push(`Enclosure Material ("${matRaw}")`);
  const area = panelAreaSeg(attrs, missing);
  if (missing.length) throw new Error(`Cannot generate PDP SAP Item Code — missing or unrecognised: ${missing.join('; ')}`);
  return checkPanelCode(`PNL-PDP-${volt}-${bus}-${icw}-${ip}-${mat}-${area}`, 'Power Distribution Panel');
}
export async function resolvePdpPanelSapItemCode(
  pool: Pool, groupId: number, subgroupId: number,
  attrs: Record<string, unknown>, uomCode: string, description: string,
): Promise<{ masterItemId: number; sapItemCode: string; reused: boolean }> {
  return resolveOrCreateSapMasterItem(pool, buildPdpPanelItemCode(attrs), description, uomCode, groupId, subgroupId, null, null);
}

// ── Automation Panels (PLC / DCS / SCADA / REL) ───────────────────────────────
// PNL-{TYPE}-{VOLT}-{IP}-{ENCTYPE}-{MAT}-{AREA}
const AUTO_TYPE_CODES: Record<string, string> = {
  'PLC Panel': 'PLC', 'DCS Panel': 'DCS', 'SCADA Panel': 'SCADA',
  'Relay / Protection Panel': 'REL',
};
export function buildAutomationPanelItemCode(attrs: Record<string, unknown>): string {
  const panelType = ((attrs.panel_type        as string) ?? '').trim();
  const voltRaw   = ((attrs.voltage           as string) ?? '').trim();
  const ipRaw     = ((attrs.ip_rating         as string) ?? '').trim();
  const encRaw    = ((attrs.enclosure_type    as string) ?? '').trim();
  const matRaw    = ((attrs.enclosure_material as string) ?? '').trim();
  const typeCode  = AUTO_TYPE_CODES[panelType];
  const volt      = P_VOLT_ALL[voltRaw]; // includes DC for REL
  const ip        = P_IP.has(ipRaw) ? ipRaw : undefined;
  const enc       = P_ENCTYPE[encRaw];
  const mat       = P_MAT[matRaw];
  const missing: string[] = [];
  if (!typeCode) missing.push(`Panel Type ("${panelType}")`);
  if (!volt)     missing.push(`System Voltage ("${voltRaw}")`);
  if (!ip)       missing.push(`IP Rating ("${ipRaw}")`);
  if (!enc)      missing.push(`Enclosure Type ("${encRaw}")`);
  if (!mat)      missing.push(`Enclosure Material ("${matRaw}")`);
  const area = panelAreaSeg(attrs, missing);
  if (missing.length) throw new Error(`Cannot generate ${typeCode ?? 'Automation Panel'} SAP Item Code — missing or unrecognised: ${missing.join('; ')}`);
  return checkPanelCode(`PNL-${typeCode}-${volt}-${ip}-${enc}-${mat}-${area}`, typeCode ?? 'Automation Panel');
}
export async function resolveAutomationPanelSapItemCode(
  pool: Pool, groupId: number, subgroupId: number,
  attrs: Record<string, unknown>, uomCode: string, description: string,
): Promise<{ masterItemId: number; sapItemCode: string; reused: boolean }> {
  return resolveOrCreateSapMasterItem(pool, buildAutomationPanelItemCode(attrs), description, uomCode, groupId, subgroupId, null, null);
}

// ── APFC Panel ────────────────────────────────────────────────────────────────
// PNL-APFC-{VOLT}-{KVAR}KVAR-{IP}-{MAT}-{AREA}
export function buildApfcPanelItemCode(attrs: Record<string, unknown>): string {
  const voltRaw = ((attrs.voltage            as string) ?? '').trim();
  const kvarRaw = ((attrs.kvar_rating        as string) ?? '').trim();
  const ipRaw   = ((attrs.ip_rating         as string) ?? '').trim();
  const matRaw  = ((attrs.enclosure_material as string) ?? '').trim();
  const volt    = P_VOLT3[voltRaw];
  const kvarNum = kvarRaw.split(' ')[0];
  const kvar    = P_APFC_KV.has(kvarNum) ? `${kvarNum}KVAR` : undefined;
  const ip      = P_IP.has(ipRaw) ? ipRaw : undefined;
  const mat     = P_MAT[matRaw];
  const missing: string[] = [];
  if (!volt) missing.push(`System Voltage ("${voltRaw}")`);
  if (!kvar) missing.push(`kVAr Rating ("${kvarRaw}")`);
  if (!ip)   missing.push(`IP Rating ("${ipRaw}")`);
  if (!mat)  missing.push(`Enclosure Material ("${matRaw}")`);
  const area = panelAreaSeg(attrs, missing);
  if (missing.length) throw new Error(`Cannot generate APFC Panel SAP Item Code — missing or unrecognised: ${missing.join('; ')}`);
  return checkPanelCode(`PNL-APFC-${volt}-${kvar}-${ip}-${mat}-${area}`, 'APFC Panel');
}
export async function resolveApfcPanelSapItemCode(
  pool: Pool, groupId: number, subgroupId: number,
  attrs: Record<string, unknown>, uomCode: string, description: string,
): Promise<{ masterItemId: number; sapItemCode: string; reused: boolean }> {
  return resolveOrCreateSapMasterItem(pool, buildApfcPanelItemCode(attrs), description, uomCode, groupId, subgroupId, null, null);
}

// ── VFD Panel ─────────────────────────────────────────────────────────────────
// PNL-VFD-{VOLT}-{DRVKW}KW-{IP}-{MAT}-{BYPASS}-{AREA}
export function buildVfdPanelItemCode(attrs: Record<string, unknown>): string {
  const voltRaw   = ((attrs.voltage            as string) ?? '').trim();
  const driveRaw  = ((attrs.drive_power_kw     as string) ?? '').trim();
  const ipRaw     = ((attrs.ip_rating          as string) ?? '').trim();
  const matRaw    = ((attrs.enclosure_material as string) ?? '').trim();
  const bypassRaw = ((attrs.bypass_arrangement as string) ?? '').trim();
  const volt      = P_VOLT3[voltRaw];
  const driveNum  = driveRaw.split(' ')[0];
  const drive     = P_VFD_KW.has(driveNum) ? `${driveNum}KW` : undefined;
  const ip        = P_IP.has(ipRaw) ? ipRaw : undefined;
  const mat       = P_MAT[matRaw];
  const bypass    = P_BYPASS[bypassRaw];
  const missing: string[] = [];
  if (!volt)   missing.push(`System Voltage ("${voltRaw}")`);
  if (!drive)  missing.push(`Drive Power kW ("${driveRaw}")`);
  if (!ip)     missing.push(`IP Rating ("${ipRaw}")`);
  if (!mat)    missing.push(`Enclosure Material ("${matRaw}")`);
  if (!bypass) missing.push(`Bypass Arrangement ("${bypassRaw}")`);
  const area = panelAreaSeg(attrs, missing);
  if (missing.length) throw new Error(`Cannot generate VFD Panel SAP Item Code — missing or unrecognised: ${missing.join('; ')}`);
  return checkPanelCode(`PNL-VFD-${volt}-${drive}-${ip}-${mat}-${bypass}-${area}`, 'VFD Panel');
}
export async function resolveVfdPanelSapItemCode(
  pool: Pool, groupId: number, subgroupId: number,
  attrs: Record<string, unknown>, uomCode: string, description: string,
): Promise<{ masterItemId: number; sapItemCode: string; reused: boolean }> {
  return resolveOrCreateSapMasterItem(pool, buildVfdPanelItemCode(attrs), description, uomCode, groupId, subgroupId, null, null);
}

// ── Cabling SAP Item Code ─────────────────────────────────────────────────────
// Skeleton : ELC-CBL-{TYPE}-{CORES}Cx{SIZE}-{VOLT}[-{ARM}][-{SCR}]
//
// Procurement Identity (encoded in the SAP Item Code):
//   Cable Type · Core Configuration · Conductor Size · Voltage Grade
//   Armour (omitted when Unarmoured) · Screening (omitted when Unscreened)
//
// Engineering Specification (mandatory fields, NOT in the code):
//   Insulation · Outer Sheath · Laying Type · Standard
//
// Two cables with the same SAP Item Code belong to the same procurement family;
// the engineering spec document defines the exact construction and standard.

const CBL_TYPE: Record<string, string> = {
  'Power Cable':           'PWR',
  'Control Cable':         'CTL',
  'Instrumentation Cable': 'INS',
  'Data / Comm Cable':     'DAT',
  'Earthing Cable':        'ETH',
  'Fire Resistant Cable':  'FRS',
};

const CBL_VOLT: Record<string, string> = {
  '300/500V':  '0.5kV',
  '450/750V':  '0.75kV',
  '600/1000V': '1kV',
  '1.1kV':     '1.1kV',
  '3.3kV':     '3.3kV',
  '6.6kV':     '6.6kV',
  '11kV':      '11kV',
};

const CBL_ARM: Record<string, string> = {
  'SWA (Steel Wire Armour)': 'SWA',
  'STA (Steel Tape Armour)': 'STA',
  'Braided Wire Armour':     'BWA',
};

const CBL_SCR: Record<string, string> = {
  'Individual + Overall Screened': 'IOS',
  'Overall Screened':              'OS',
  'Individually Screened':         'IS',
};

/**
 * Build a deterministic SAP Item Code for a cabling line.
 * Required attrs: cable_type, core_config, cable_size, voltage
 * Optional attrs: armour (omitted when Unarmoured), screening (omitted when Unscreened)
 * Throws a user-friendly error if any required field is missing or unrecognised.
 */
export function buildCablingItemCode(attrs: Record<string, unknown>): string {
  const typeRaw = ((attrs.cable_type  as string) ?? '').trim();
  const coreRaw = ((attrs.core_config as string) ?? '').trim();
  const sizeRaw = ((attrs.cable_size  as string) ?? '').trim();
  const voltRaw = ((attrs.voltage     as string) ?? '').trim();
  const armRaw  = ((attrs.armour      as string) ?? '').trim();
  const scrRaw  = ((attrs.screening   as string) ?? '').trim();

  const missing: string[] = [];

  const type = CBL_TYPE[typeRaw];
  if (!type) missing.push(`Cable Type ("${typeRaw}")`);

  // "4 Core" → "4",  "3.5 Core" → "3.5"
  const coreNum = coreRaw.replace(/\s*Core$/i, '').trim();
  if (!coreNum) missing.push(`Core Configuration ("${coreRaw}")`);

  // "10 mm²" → "10",  "1.0 mm²" → "1.0"
  const sizeNum = sizeRaw.replace(/\s*mm²$/i, '').trim();
  if (!sizeNum) missing.push(`Conductor Size ("${sizeRaw}")`);

  const volt = CBL_VOLT[voltRaw];
  if (!volt) missing.push(`Voltage Grade ("${voltRaw}")`);

  if (missing.length) {
    throw new Error(
      `Cannot generate Cabling SAP Item Code — missing or unrecognised: ${missing.join('; ')}`,
    );
  }

  const parts = [`ELC-CBL-${type}-${coreNum}Cx${sizeNum}-${volt}`];
  const armSeg = CBL_ARM[armRaw];
  const scrSeg = CBL_SCR[scrRaw];
  if (armSeg) parts.push(armSeg);
  if (scrSeg) parts.push(scrSeg);

  const code = parts.join('-');
  if (code.length > SAP_ITEM_CODE_MAX_LEN) {
    throw new Error(
      `SAP Item Code "${code}" is ${code.length} characters — exceeds the SAP B1 limit of ${SAP_ITEM_CODE_MAX_LEN}.`,
    );
  }
  return code;
}

export async function resolveCablingSapItemCode(
  pool:        Pool,
  groupId:     number,
  subgroupId:  number,
  attrs:       Record<string, unknown>,
  uomCode:     string,
  description: string,
): Promise<{ masterItemId: number; sapItemCode: string; reused: boolean }> {
  return resolveOrCreateSapMasterItem(
    pool, buildCablingItemCode(attrs), description, uomCode, groupId, subgroupId, null, null,
  );
}

// ── Plates SAP Item Code ──────────────────────────────────────────────────────
// Skeleton : RM-PLT-{GRADE}-{THICK}X{WIDTH}X{LENGTH}
//
// Procurement Identity (encoded — defines a stocked plate):
//   Material Grade · Thickness (mm) · Width (mm) · Length (mm)
//
// Two plates with the same code are physically interchangeable as inventory.
// "Mill Length" is explicitly rejected — stock plates must have a defined length.
//
// Engineering Specification (NOT in the code):
//   Plate Standard · MTR/MTC · Heat Treatment · Surface Finish · Additional Testing

const PLATES_GRADE_CODE: Record<string, string> = {
  'IS 2062 E250':   'E250',
  'IS 2062 E350':   'E350',
  'SS304':          'SS304',
  'SS304L':         'SS304L',
  'SS316':          'SS316',
  'SS316L':         'SS316L',
  'SA 516 Gr 60':   'SA516-60',
  'SA 516 Gr 70':   'SA516-70',
  'ASTM A36':       'A36',
  'SA-240 Gr 304':  'SA240-304',
  'SA-240 Gr 304L': 'SA240-304L',
  'SA-240 Gr 316':  'SA240-316',
  'SA-240 Gr 316L': 'SA240-316L',
};

/**
 * Normalise a dimension string to a deterministic representation.
 * Strips leading zeros and trailing decimal zeros.
 *   "01500"   → "1500"
 *   "1500.0"  → "1500"
 *   "12.5"    → "12.5"
 * Throws on non-positive or non-numeric input.
 */
function normalizePlateDim(raw: string, label: string): string {
  const n = parseFloat(raw.trim());
  if (isNaN(n) || n <= 0) {
    throw new Error(`Cannot generate Plate SAP Item Code — ${label} "${raw}" is not a positive number`);
  }
  return Number.isInteger(n) ? String(Math.round(n)) : String(n);
}

/**
 * Build a deterministic SAP Item Code for a stock/inventory Plate line.
 *
 * Required attrs : material_grade, thickness_mm, width_mm, length_mm
 * Throws a user-friendly error for missing, unrecognised, or non-numeric values.
 * "Mill Length" as length is explicitly rejected.
 */
export function buildPlatesItemCode(attrs: Record<string, unknown>): string {
  const gradeRaw  = ((attrs.material_grade as string) ?? '').trim();
  const thickRaw  = ((attrs.thickness_mm   as string) ?? '').trim();
  const widthRaw  = ((attrs.width_mm       as string) ?? '').trim();
  const lengthRaw = ((attrs.length_mm      as string) ?? '').trim();

  const missing: string[] = [];

  const grade = PLATES_GRADE_CODE[gradeRaw];
  if (!grade) {
    missing.push(
      gradeRaw
        ? `Material Grade "${gradeRaw}" is not in the recognised grade list`
        : 'Material Grade',
    );
  }
  if (!thickRaw)  missing.push('Thickness');
  if (!widthRaw)  missing.push('Width');
  if (!lengthRaw) missing.push('Length');

  if (lengthRaw === 'Mill Length') {
    missing.push(
      'Length — "Mill Length" is not accepted for stock/inventory plates; specify the actual length in mm',
    );
  }

  if (missing.length) {
    throw new Error(
      `Cannot generate Plate SAP Item Code — missing or unrecognised: ${missing.join('; ')}`,
    );
  }

  const thick  = normalizePlateDim(thickRaw,  'Thickness');
  const width  = normalizePlateDim(widthRaw,  'Width');
  const length = normalizePlateDim(lengthRaw, 'Length');

  const code = `RM-PLT-${grade}-${thick}X${width}X${length}`;

  if (code.length > SAP_ITEM_CODE_MAX_LEN) {
    throw new Error(
      `SAP Item Code "${code}" is ${code.length} characters — exceeds the SAP B1 limit of ${SAP_ITEM_CODE_MAX_LEN}.`,
    );
  }
  return code;
}

export async function resolvePlatesSapItemCode(
  pool:        Pool,
  groupId:     number,
  subgroupId:  number,
  attrs:       Record<string, unknown>,
  uomCode:     string,
  description: string,
): Promise<{ masterItemId: number; sapItemCode: string; reused: boolean }> {
  return resolveOrCreateSapMasterItem(
    pool, buildPlatesItemCode(attrs), description, uomCode, groupId, subgroupId, null, null,
  );
}

// ── Fittings SAP Item Code ────────────────────────────────────────────────────
// Skeleton (BW / reducing):    RM-FTG-{TYPE}-{GRADE}-{NB}-{SCH}-{END}
// Skeleton (BW / reducing):    RM-FTG-{TYPE}-{GRADE}-{NB}X{RNB}-{SCH}-{END}
// Skeleton (SW/Screwed / std): RM-FTG-{TYPE}-{GRADE}-{NB}-{PC}-{END}
// Skeleton (SW/Screwed / red): RM-FTG-{TYPE}-{GRADE}-{NB}X{RNB}-{PC}-{END}
//
// Procurement Identity:
//   All types : Fitting Type · Material Grade · Nominal Bore · Schedule or Pressure Class · End Type
//   Reducing  : + Reducing Bore (Concentric/Eccentric Reducer · Reducing Tee · Swage Nipple)
//   SW/Screwed for Coupling/Half Coupling/Union/Boss : Pressure Class (3000LB/6000LB/9000LB)
//     replaces Schedule — these fittings are manufactured and catalogued to B16.11 Pressure Class,
//     not to pipe schedule designations.
//
// Outside the code: Fitting Standard · MTR · Elbow Radius (already in type name) · Eccentric orientation

const FITTINGS_TYPE_CODE: Record<string, string> = {
  '90° 1D Elbow':       'E90-1D',
  '90° 1.5D Elbow':     'E90-1.5D',
  '90° 2D Elbow':       'E90-2D',
  '45° 1D Elbow':       'E45-1D',
  '45° 1.5D Elbow':     'E45-1.5D',
  '45° 2D Elbow':       'E45-2D',
  'Equal Tee':          'TEE',
  'Reducing Tee':       'TEER',
  'Cross':              'CRS',
  'Concentric Reducer': 'REDC',
  'Eccentric Reducer':  'REDE',
  'End Cap':            'CAP',
  'Stub End':           'STUB',
  'Swage Nipple':       'SWAG',
  'Coupling':           'CPLG',
  'Half Coupling':      'HCPL',
  'Union':              'UNI',
  'Boss':               'BOSS',
  'Barrel Nipple':      'BNIP',
  'Pipe Nipple':        'PNIP',
};

const FITTINGS_GRADE_CODE: Record<string, string> = {
  'A 105':            'A105',
  'A 182 F304':       'A182-F304',
  'A 182 F316':       'A182-F316',
  'A234 WPB':         'A234-WPB',
  'A234 WPC':         'A234-WPC',
  'A234 WP11':        'A234-WP11',
  'A234 WP22':        'A234-WP22',
  'A403 WP304':       'A403-304',
  'A403 WP304L':      'A403-304L',
  'A403 WP316':       'A403-316',
  'A403 WP316L':      'A403-316L',
  'A403 WP321':       'A403-321',
  'A403 WP347':       'A403-347',
  'A860 WPHY 60':     'A860-60',
  'Duplex F51':       'F51',
  'Super Duplex F53': 'F53',
};

const FITTINGS_SCHEDULE_CODE: Record<string, string> = {
  'SCH 5':   'SCH5',  'SCH 5S':  'SCH5S',  'SCH 10': 'SCH10',  'SCH 10S': 'SCH10S',
  'SCH 20':  'SCH20', 'SCH 40':  'SCH40',  'SCH 40S':'SCH40S', 'SCH 80':  'SCH80',
  'SCH 80S': 'SCH80S','SCH 160': 'SCH160', 'XXS':    'XXS',    'STD':     'STD',    'XS': 'XS',
};

const FITTINGS_END_CODE: Record<string, string> = {
  'Butt Weld (BW)': 'BW',
  'Socket Weld (SW)': 'SW',
  'Screwed NPT': 'NPT',
  'Screwed BSP': 'BSP',
};

// Coupling, Half Coupling, Union, Boss + SW/Screwed end types → Pressure Class replaces Schedule
const PRESSURE_CLASS_FITTINGS = new Set(['Coupling', 'Half Coupling', 'Union', 'Boss']);
const SW_SCREWED_ENDS          = new Set(['Socket Weld (SW)', 'Screwed NPT', 'Screwed BSP']);

// Reducers and Swage Nipple always require a second (reducing) bore
const REDUCING_FITTINGS = new Set([
  'Concentric Reducer', 'Eccentric Reducer', 'Reducing Tee', 'Swage Nipple',
]);

// Nipples require a mandatory length (mm) — two nipples of different length are different stock items
const NIPPLE_FITTINGS = new Set(['Barrel Nipple', 'Pipe Nipple']);

export function buildFittingsItemCode(attrs: Record<string, unknown>): string {
  const ftype    = ((attrs.fitting_type   as string) ?? '').trim();
  const gradeRaw = ((attrs.material_grade as string) ?? '').trim();
  const nbRaw    = ((attrs.nominal_bore   as string) ?? '').trim();
  const schRaw   = ((attrs.schedule       as string) ?? '').trim();
  const endRaw   = ((attrs.end_type       as string) ?? '').trim();
  const pcRaw    = ((attrs.pressure_class as string) ?? '').trim();
  const rbRaw    = ((attrs.reducing_bore  as string) ?? '').trim();
  // Nipple length: stored as plain mm number ("100") or with suffix ("100mm") — normalise by stripping suffix
  const lenRaw   = ((attrs.length_mm      as string) ?? '').trim().replace(/mm$/i, '');

  const missing: string[] = [];

  const typeCode = FITTINGS_TYPE_CODE[ftype];
  if (!typeCode) missing.push(ftype ? `Fitting Type "${ftype}" not recognised` : 'Fitting Type');

  const grade = FITTINGS_GRADE_CODE[gradeRaw];
  if (!grade) missing.push(gradeRaw ? `Material Grade "${gradeRaw}" not recognised` : 'Material Grade');

  if (!nbRaw) missing.push('Nominal Bore (NB)');

  const endCode = FITTINGS_END_CODE[endRaw];
  if (!endCode) missing.push(endRaw ? `End Type "${endRaw}" not recognised` : 'End Type');

  // Size dimension: Pressure Class for SW/Screwed on Coupling/Half Coupling/Union/Boss, Schedule otherwise
  const needsPC = PRESSURE_CLASS_FITTINGS.has(ftype) && SW_SCREWED_ENDS.has(endRaw);
  let sizeDim = '';
  if (needsPC) {
    if (!pcRaw) missing.push('Pressure Class');
    sizeDim = pcRaw; // e.g. "3000LB"
  } else {
    const sch = FITTINGS_SCHEDULE_CODE[schRaw];
    if (!sch) missing.push(schRaw ? `Schedule "${schRaw}" not recognised` : 'Schedule');
    sizeDim = sch ?? '';
  }

  // Reducing bore required for REDC / REDE / TEER / SWAG
  const isReducing = REDUCING_FITTINGS.has(ftype);
  if (isReducing && !rbRaw) missing.push('Reducing Bore (second NB)');

  // Nipple length is mandatory — without it identical-NB nipples of different lengths get the same code
  const isNipple = NIPPLE_FITTINGS.has(ftype);
  if (isNipple && !lenRaw) missing.push('Length (mm)');

  if (missing.length) {
    throw new Error(
      `Cannot generate Fitting SAP Item Code — missing or unrecognised: ${missing.join('; ')}`,
    );
  }

  const nbPart   = isReducing ? `${nbRaw}X${rbRaw}` : nbRaw;
  const segments = ['RM-FTG', typeCode, grade, nbPart];
  if (isNipple) segments.push(`${lenRaw}MM`);
  segments.push(sizeDim, endCode);
  const code = segments.join('-');

  if (code.length > SAP_ITEM_CODE_MAX_LEN) {
    throw new Error(
      `SAP Item Code "${code}" is ${code.length} chars — exceeds the SAP B1 limit of ${SAP_ITEM_CODE_MAX_LEN}.`,
    );
  }
  return code;
}

export async function resolveFittingsSapItemCode(
  pool:        Pool,
  groupId:     number,
  subgroupId:  number,
  attrs:       Record<string, unknown>,
  uomCode:     string,
  description: string,
): Promise<{ masterItemId: number; sapItemCode: string; reused: boolean }> {
  return resolveOrCreateSapMasterItem(
    pool, buildFittingsItemCode(attrs), description, uomCode, groupId, subgroupId, null, null,
  );
}

// ── Pipes SAP Item Code ───────────────────────────────────────────────────────
// Skeleton : RM-PIP-{GRADE}-{NB}-{SCH}
//
// Procurement Identity (encoded in the SAP Item Code):
//   Material Grade · Nominal Bore (NB) · Schedule
//
// Engineering Specification (NOT in the code):
//   End Condition · Length · Pipe Standard · MTR/MTC
//   Surface Finish · Hydro Test / Additional Testing

const PIPES_GRADE_CODE: Record<string, string> = {
  'IS 1239 Class A': 'IS1239A',
  'IS 1239 Class B': 'IS1239B',
  'IS 1239 Class C': 'IS1239C',
  'IS 3589 Fe 330':  'IS3589-330',
  'IS 3589 Fe 410':  'IS3589-410',
  'SA-106 Gr B':     'SA106B',
  'SA-53 Gr B':      'SA53B',
  'SS304 Pipe':      'SS304',
  'SS304L Pipe':     'SS304L',
  'SS316 Pipe':      'SS316',
  'SS316L Pipe':     'SS316L',
  'SA-312 TP304':    'SA312-304',
  'SA-312 TP304L':   'SA312-304L',
  'SA-312 TP316':    'SA312-316',
  'SA-312 TP316L':   'SA312-316L',
  'Copper Pipe':     'CU',
  'Aluminium Pipe':  'AL',
};

const PIPES_SCHEDULE_CODE: Record<string, string> = {
  'SCH 5':   'SCH5',
  'SCH 5S':  'SCH5S',
  'SCH 10':  'SCH10',
  'SCH 10S': 'SCH10S',
  'SCH 20':  'SCH20',
  'SCH 40':  'SCH40',
  'SCH 40S': 'SCH40S',
  'SCH 80':  'SCH80',
  'SCH 80S': 'SCH80S',
  'SCH 160': 'SCH160',
  'XXS':     'XXS',
  'STD':     'STD',
  'XS':      'XS',
};

export function buildPipesItemCode(attrs: Record<string, unknown>): string {
  const gradeRaw = ((attrs.material_grade as string) ?? '').trim();
  const nbRaw    = ((attrs.nominal_bore   as string) ?? '').trim();
  const schRaw   = ((attrs.schedule       as string) ?? '').trim();

  const missing: string[] = [];

  const grade = PIPES_GRADE_CODE[gradeRaw];
  if (!grade) {
    missing.push(gradeRaw
      ? `Material Grade "${gradeRaw}" is not in the recognised grade list`
      : 'Material Grade');
  }

  if (!nbRaw) missing.push('Nominal Bore (NB)');

  const sch = PIPES_SCHEDULE_CODE[schRaw];
  if (!sch) {
    missing.push(schRaw
      ? `Schedule "${schRaw}" is not in the recognised schedule list`
      : 'Schedule');
  }

  if (missing.length) {
    throw new Error(
      `Cannot generate Pipe SAP Item Code — missing or unrecognised: ${missing.join('; ')}`,
    );
  }

  const code = `RM-PIP-${grade}-${nbRaw}-${sch}`;

  if (code.length > SAP_ITEM_CODE_MAX_LEN) {
    throw new Error(
      `SAP Item Code "${code}" is ${code.length} characters — exceeds the SAP B1 limit of ${SAP_ITEM_CODE_MAX_LEN}.`,
    );
  }
  return code;
}

export async function resolvePipesSapItemCode(
  pool:        Pool,
  groupId:     number,
  subgroupId:  number,
  attrs:       Record<string, unknown>,
  uomCode:     string,
  description: string,
): Promise<{ masterItemId: number; sapItemCode: string; reused: boolean }> {
  return resolveOrCreateSapMasterItem(
    pool, buildPipesItemCode(attrs), description, uomCode, groupId, subgroupId, null, null,
  );
}

// ── Profiles SAP Item Code ────────────────────────────────────────────────────
// Skeleton — Solid Circular  : RM-PRF-CIR-{GRADE}-{THICK}XOD{OD}
// Skeleton — Hollow Circular : RM-PRF-CIRH-{GRADE}-{THICK}XOD{OD}XID{ID}
//
// Procurement Identity (encoded in the SAP Item Code):
//   Profile Type · Material Grade · Thickness (mm) · Outside Diameter (mm)
//   Inside Diameter (mm) — Hollow Circular only
//
// Thickness is an independent axial dimension. It is NOT derived from OD and ID.
// For Hollow Circular the only geometric constraint is OD > ID.
//
// Engineering Specification (NOT in the code):
//   Material Standard · Dimensional Tolerance · MTR/MTC · Heat Treatment
//   Surface Finish · Additional Testing

const PROFILE_TYPES = new Set(['Solid Circular', 'Hollow Circular']);

function normalizeProfileDim(raw: string, label: string): string {
  const n = parseFloat(raw.trim());
  if (isNaN(n) || n <= 0) {
    throw new Error(`Cannot generate Profile SAP Item Code — ${label} "${raw}" is not a positive number`);
  }
  return Number.isInteger(n) ? String(Math.round(n)) : String(n);
}

export function buildProfilesItemCode(attrs: Record<string, unknown>): string {
  const profileTypeRaw = ((attrs.profile_type   as string) ?? '').trim();
  const gradeRaw       = ((attrs.material_grade as string) ?? '').trim();
  const thickRaw       = ((attrs.thickness_mm   as string) ?? '').trim();
  const odRaw          = ((attrs.od_mm          as string) ?? '').trim();
  const idRaw          = ((attrs.id_mm          as string) ?? '').trim();

  const missing: string[] = [];

  if (!PROFILE_TYPES.has(profileTypeRaw)) {
    missing.push(profileTypeRaw
      ? `Profile Type "${profileTypeRaw}" is not recognised — must be "Solid Circular" or "Hollow Circular"`
      : 'Profile Type');
  }

  const grade = PLATES_GRADE_CODE[gradeRaw];
  if (!grade) {
    missing.push(gradeRaw
      ? `Material Grade "${gradeRaw}" is not in the recognised grade list`
      : 'Material Grade');
  }

  if (!thickRaw) missing.push('Thickness');
  if (!odRaw)    missing.push('Outside Diameter (OD)');

  const isHollow = profileTypeRaw === 'Hollow Circular';
  if (isHollow && !idRaw) missing.push('Inside Diameter (ID)');

  if (missing.length) {
    throw new Error(
      `Cannot generate Profile SAP Item Code — missing or unrecognised: ${missing.join('; ')}`,
    );
  }

  const thick = normalizeProfileDim(thickRaw, 'Thickness');
  const od    = normalizeProfileDim(odRaw,    'Outside Diameter (OD)');

  if (isHollow) {
    const id    = normalizeProfileDim(idRaw, 'Inside Diameter (ID)');
    if (parseFloat(id) >= parseFloat(od)) {
      throw new Error(
        `Cannot generate Profile SAP Item Code — Inside Diameter (${id} mm) must be less than Outside Diameter (${od} mm)`,
      );
    }
    const code = `RM-PRF-CIRH-${grade}-${thick}XOD${od}XID${id}`;
    if (code.length > SAP_ITEM_CODE_MAX_LEN) {
      throw new Error(
        `SAP Item Code "${code}" is ${code.length} characters — exceeds the SAP B1 limit of ${SAP_ITEM_CODE_MAX_LEN}.`,
      );
    }
    return code;
  }

  // Solid Circular — id_mm is completely ignored
  const code = `RM-PRF-CIR-${grade}-${thick}XOD${od}`;
  if (code.length > SAP_ITEM_CODE_MAX_LEN) {
    throw new Error(
      `SAP Item Code "${code}" is ${code.length} characters — exceeds the SAP B1 limit of ${SAP_ITEM_CODE_MAX_LEN}.`,
    );
  }
  return code;
}

export async function resolveProfilesSapItemCode(
  pool:        Pool,
  groupId:     number,
  subgroupId:  number,
  attrs:       Record<string, unknown>,
  uomCode:     string,
  description: string,
): Promise<{ masterItemId: number; sapItemCode: string; reused: boolean }> {
  return resolveOrCreateSapMasterItem(
    pool, buildProfilesItemCode(attrs), description, uomCode, groupId, subgroupId, null, null,
  );
}

// ── Junction Box SAP Item Code ────────────────────────────────────────────────
// Skeleton : ELC-JBX-{TYPE}-{TERMS}T-{MAT}-{IP}[-{AREA}]
//
// Procurement Identity (encoded in the SAP Item Code):
//   JB Type · Number of Terminals · Body Material · IP Rating
//   Area Classification (omitted for Safe Area on standard types;
//                        mandatory and always hazardous for IS and FLP types)
//
// Engineering Specification (NOT in the code):
//   Terminal Type · Mounting · Cable Entry / Gland details
//   Certification · Earthing · Accessories · Make (optional vendor preference)

const JBX_TYPE: Record<string, string> = {
  'General Purpose JB':     'GP',
  'Marshalling JB':         'MRS',
  'Thermocouple JB':        'TC',
  'RTD JB':                 'RTD',
  'Field JB':               'FLD',
  'Panel JB':               'PNL',
  'Signal Distribution JB': 'SIG',
  'Intrinsically Safe JB':  'IS',
  'Flameproof JB':          'FLP',
};

const JBX_MAT: Record<string, string> = {
  'GRP/FRP':             'GRP',
  'SS316':               'S316',
  'SS304':               'S304',
  'Carbon Steel':        'CS',
  'Polycarbonate':       'PC',
  'Die-Cast Aluminium':  'ALU',
  'Mild Steel (Painted)': 'MS',
};

// Area options that may appear in the SAP code (Safe Area is omitted, not encoded)
const JBX_AREA: Record<string, string> = {
  'Zone 1 (Gas Groups IIA/IIB)': 'Z1A',
  'Zone 1 (Gas Group IIC)':      'Z1C',
  'Zone 2':                       'Z2',
  'Division 1':                   'D1',
  'Division 2':                   'D2',
  'Non-classified':               'NC',
};

// IS and FLP JBs exist specifically for hazardous areas — Safe Area is not valid
const JBX_ALWAYS_HAZ = new Set(['Intrinsically Safe JB', 'Flameproof JB']);

/**
 * Build a deterministic SAP Item Code for a Junction Box line.
 *
 * Required attrs : jb_type, num_terminals (or "Other" + custom_terminal_count),
 *                  body_material, enclosure_type (IP rating)
 * Conditional    : area_classification — mandatory and must be hazardous for IS/FLP;
 *                  included when hazardous for all other types; omitted for Safe Area
 * Throws a user-friendly error for missing or unrecognised values.
 */
export function buildJunctionBoxItemCode(attrs: Record<string, unknown>): string {
  const jbTypeRaw  = ((attrs.jb_type       as string) ?? '').trim();
  const numTermRaw = ((attrs.num_terminals  as string) ?? '').trim();
  const customRaw  = ((attrs.custom_terminal_count as string) ?? '').trim();
  const matRaw     = ((attrs.body_material  as string) ?? '').trim();
  const ipRaw      = ((attrs.enclosure_type as string) ?? '').trim();
  const areaRaw    = ((attrs.area_classification as string) ?? '').trim();

  const missing: string[] = [];

  const type = JBX_TYPE[jbTypeRaw];
  if (!type) missing.push(`JB Type ("${jbTypeRaw}")`);

  // Resolve terminal count — "Other" delegates to custom_terminal_count
  let termsNum: number | undefined;
  if (!numTermRaw) {
    missing.push('Number of Terminals');
  } else if (numTermRaw === 'Other') {
    const n = parseInt(customRaw, 10);
    if (!customRaw || isNaN(n) || n <= 0 || !Number.isInteger(n)) {
      missing.push('Custom Terminal Count (must be a positive whole number)');
    } else {
      termsNum = n;
    }
  } else {
    const n = parseInt(numTermRaw, 10);
    if (isNaN(n) || n <= 0) {
      missing.push(`Number of Terminals ("${numTermRaw}")`);
    } else {
      termsNum = n;
    }
  }

  const mat = JBX_MAT[matRaw];
  if (!mat) missing.push(`Body Material ("${matRaw}")`);

  const validIp = ['IP65', 'IP66', 'IP67', 'IP68'];
  if (!validIp.includes(ipRaw)) missing.push(`IP Rating ("${ipRaw}")`);

  // Area classification
  const isAlwaysHaz = JBX_ALWAYS_HAZ.has(jbTypeRaw);
  let areaSeg: string | undefined;
  if (isAlwaysHaz) {
    // IS and FLP must have a hazardous area — Safe Area and Non-classified are rejected
    if (!areaRaw || areaRaw === 'Safe Area' || areaRaw === 'Non-classified') {
      missing.push(
        `Area Classification — ${jbTypeRaw} requires a hazardous zone (Zone 1/Zone 2/Division); ` +
        `"${areaRaw || 'blank'}" is not accepted`,
      );
    } else {
      const seg = JBX_AREA[areaRaw];
      if (!seg) missing.push(`Area Classification ("${areaRaw}")`);
      else areaSeg = seg;
    }
  } else if (areaRaw && areaRaw !== 'Safe Area') {
    // Non-IS/FLP in hazardous area: include area segment
    const seg = JBX_AREA[areaRaw];
    if (!seg) missing.push(`Area Classification ("${areaRaw}")`);
    else areaSeg = seg;
    // Safe Area: area segment omitted (default assumption)
  }

  if (missing.length) {
    throw new Error(
      `Cannot generate Junction Box SAP Item Code — missing or unrecognised: ${missing.join('; ')}`,
    );
  }

  const parts = [`ELC-JBX-${type}-${termsNum}T-${mat}-${ipRaw}`];
  if (areaSeg) parts.push(areaSeg);

  const code = parts.join('-');
  if (code.length > SAP_ITEM_CODE_MAX_LEN) {
    throw new Error(
      `SAP Item Code "${code}" is ${code.length} characters — exceeds the SAP B1 limit of ${SAP_ITEM_CODE_MAX_LEN}.`,
    );
  }
  return code;
}

export async function resolveJunctionBoxSapItemCode(
  pool:        Pool,
  groupId:     number,
  subgroupId:  number,
  attrs:       Record<string, unknown>,
  uomCode:     string,
  description: string,
): Promise<{ masterItemId: number; sapItemCode: string; reused: boolean }> {
  return resolveOrCreateSapMasterItem(
    pool, buildJunctionBoxItemCode(attrs), description, uomCode, groupId, subgroupId, null, null,
  );
}
