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
