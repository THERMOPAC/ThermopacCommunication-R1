/**
 * dds-comparison-engine.ts
 *
 * Layer 2 verification: compares extracted SolidWorks custom properties
 * against the DDS record stored in the database for a given drawing control.
 *
 * Source of truth for drawing values: extractionResult.customProperties.fields
 * Source of truth for expected values: design_data_sheets table (DDS)
 *
 * Returns:
 *   status  — "pass" | "warn" | "fail" | "blocked"
 *   result  — per-parameter comparison breakdown
 */

import { db } from '../db';
import { eq } from 'drizzle-orm';
import { designDataSheets, epcDrawingControls } from '@shared/schema';
import type { MechanicalData, GeneralData, ColumnHazardData } from '@shared/schema';
import { compareNumeric, compareString } from './drawing-unit-normalizer';

export type ComparisonStatus = 'pass' | 'warn' | 'fail' | 'blocked';
export type ParameterStatus  = 'match' | 'mismatch' | 'missing_dds' | 'missing_drawing' | 'low_confidence';

export interface ParameterResult {
  parameter:  string;
  dds_value:  string | null;
  dwg_value:  string | null;
  status:     ParameterStatus;
  severity:   'critical' | 'warning';
  note?:      string;
}

export interface ComparisonOutput {
  status:  ComparisonStatus;
  result:  ParameterResult[];
}

type DdsRecord = typeof designDataSheets.$inferSelect;
type Side = 'shell' | 'tube' | 'jacket';

// ── Field definitions ──────────────────────────────────────────────────────────
// Each entry maps one drawing custom property to one DDS field.
// side: if set, the row is only included when that side is active.

type MatchMode = 'exact' | 'contains';  // 'contains': match if either value is a substring of the other

interface FieldDef {
  drawingProp:    string;               // key in customProperties.fields[].property
  displayLabel:   string;              // label shown in the UI
  severity:       'critical' | 'warning';
  numericCompare: boolean;
  matchMode?:     MatchMode;           // default 'exact'
  side?:          Side;                // omit row when this side is not active
  getDdsValue:    (dds: DdsRecord) => string | null;
}

const FIELD_DEFS: FieldDef[] = [
  {
    drawingProp:    'Equipment_Type',
    displayLabel:   'Equipment Type',
    severity:       'critical',
    numericCompare: false,
    getDdsValue:    dds => dds.equipmentConfig ?? null,
  },
  {
    drawingProp:    'Design_Code',
    displayLabel:   'Design Code',
    severity:       'critical',
    numericCompare: false,
    // dds.designCode is the regulatory umbrella code (e.g. PED applied code).
    // The actual design standard applied per-column lives in hazardData.shell.appliedCode.
    getDdsValue:    dds => (dds.hazardData as ColumnHazardData)?.shell?.appliedCode ?? null,
  },
  {
    drawingProp:    'Material_Code',
    displayLabel:   'Material Code',
    severity:       'warning',
    numericCompare: false,
    getDdsValue:    dds => dds.materialCode ?? null,
  },
  {
    drawingProp:    'Inspection_By',
    displayLabel:   'Inspection By',
    severity:       'warning',
    numericCompare: false,
    // Drawing may abbreviate the agency name (e.g. "TUV" vs "TUV India").
    // Match if either value is a case-insensitive substring of the other.
    matchMode:      'contains',
    getDdsValue:    dds => dds.inspectionBy ?? null,
  },
  {
    drawingProp:    'HYDRO_TEST_POSITION',
    displayLabel:   'Hydro Test Position',
    severity:       'warning',
    numericCompare: false,
    getDdsValue:    dds => (dds.generalData as GeneralData)?.hydroTestPosition ?? null,
  },
  // ── Per-side mechanical fields ───────────────────────────────────────────
  {
    drawingProp:    'SHELL_IDP',
    displayLabel:   'Shell — Working Pressure',
    severity:       'critical',
    numericCompare: true,
    side:           'shell',
    // _IDP custom property stores the working/design pressure (not MAWP)
    getDdsValue:    dds => (dds.mechanicalData as MechanicalData)?.shell?.workingPressure ?? null,
  },
  {
    drawingProp:    'SHELL_MOT',
    displayLabel:   'Shell — Max Operating Temp',
    severity:       'critical',
    numericCompare: true,
    side:           'shell',
    getDdsValue:    dds => (dds.mechanicalData as MechanicalData)?.shell?.operatingTempMinMax ?? null,
  },
  {
    drawingProp:    'TUBE_IDP',
    displayLabel:   'Tube — Working Pressure',
    severity:       'critical',
    numericCompare: true,
    side:           'tube',
    getDdsValue:    dds => (dds.mechanicalData as MechanicalData)?.tube?.workingPressure ?? null,
  },
  {
    drawingProp:    'TUBE_MOT',
    displayLabel:   'Tube — Max Operating Temp',
    severity:       'critical',
    numericCompare: true,
    side:           'tube',
    getDdsValue:    dds => (dds.mechanicalData as MechanicalData)?.tube?.operatingTempMinMax ?? null,
  },
  {
    drawingProp:    'JACKET_IDP',
    displayLabel:   'Jacket — Working Pressure',
    severity:       'critical',
    numericCompare: true,
    side:           'jacket',
    getDdsValue:    dds => (dds.mechanicalData as MechanicalData)?.jacket?.workingPressure ?? null,
  },
  {
    drawingProp:    'JACKET_MOT',
    displayLabel:   'Jacket — Max Operating Temp',
    severity:       'critical',
    numericCompare: true,
    side:           'jacket',
    getDdsValue:    dds => (dds.mechanicalData as MechanicalData)?.jacket?.operatingTempMinMax ?? null,
  },
];

// ── Equipment config → active sides ──────────────────────────────────────────
function activeSides(equipmentConfig: string): Set<Side> {
  const cfg = equipmentConfig.toLowerCase();
  const sides = new Set<Side>(['shell']);
  if (cfg.includes('heat exchanger') || cfg.includes('tube') || cfg.includes('hx')) sides.add('tube');
  if (cfg.includes('jacket')) sides.add('jacket');
  return sides;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runDdsComparison(
  drawingControlId: number,
  extractionResult: any,
): Promise<ComparisonOutput> {

  // ── Fetch DDS + drawing control (for revision) ────────────────────────────
  const [[dds], [dwgCtrl]] = await Promise.all([
    db.select().from(designDataSheets).where(eq(designDataSheets.dwgControlId, drawingControlId)).limit(1),
    db.select({ revisionCode: epcDrawingControls.revisionCode }).from(epcDrawingControls).where(eq(epcDrawingControls.id, drawingControlId)).limit(1),
  ]);

  if (!dds) {
    return {
      status: 'blocked',
      result: [{
        parameter: '__dds__',
        dds_value: null,
        dwg_value: null,
        status:    'missing_dds',
        severity:  'critical',
        note:      'No Design Data Sheet found for this drawing control',
      }],
    };
  }

  if (!dds.equipmentConfig) {
    return {
      status: 'blocked',
      result: [{
        parameter: '__dds__',
        dds_value: null,
        dwg_value: null,
        status:    'missing_dds',
        severity:  'critical',
        note:      'DDS equipment_config not set — DDS is incomplete',
      }],
    };
  }

  // ── Build custom property lookup ───────────────────────────────────────────
  // Source: extractionResult.customProperties.fields[]
  // Use resolvedValue; treat found=false or empty resolvedValue as missing.
  const cpFields: Array<{ property: string; found: boolean; resolvedValue: string }> =
    extractionResult?.customProperties?.fields ?? [];

  const dwgMap = new Map<string, string | null>();
  for (const f of cpFields) {
    const val = f.found && f.resolvedValue?.trim() ? f.resolvedValue.trim() : null;
    dwgMap.set(f.property, val);
  }

  // Equipment_Configuration fallback: if missing, use Equipment_Type
  if (!dwgMap.get('Equipment_Configuration') && dwgMap.get('Equipment_Type')) {
    dwgMap.set('Equipment_Configuration', dwgMap.get('Equipment_Type')!);
  }

  // ── Determine active sides from DDS equipment config ──────────────────────
  const sides = activeSides(dds.equipmentConfig);

  // ── Compare each field ────────────────────────────────────────────────────
  const results: ParameterResult[] = [];
  let hasCriticalMismatch = false;
  let hasWarningMismatch  = false;

  for (const field of FIELD_DEFS) {
    // Skip side-specific fields when that side is not active
    if (field.side && !sides.has(field.side)) continue;

    const ddsRaw = field.getDdsValue(dds);
    const ddsVal = ddsRaw?.trim() || null;
    const dwgVal = dwgMap.get(field.drawingProp) ?? null;

    let status: ParameterStatus;
    let note: string | undefined;

    if (!ddsVal && !dwgVal) {
      // Both empty — not applicable / not configured
      status = 'missing_dds';
      note   = 'Not set in DDS';
    } else if (!ddsVal) {
      status = 'missing_dds';
      note   = 'Parameter not set in DDS';
    } else if (!dwgVal) {
      status = 'missing_drawing';
      note   = 'Property not found or empty in drawing';
      if (field.severity === 'critical') hasCriticalMismatch = true;
      else hasWarningMismatch = true;
    } else {
      let matched: boolean | null;
      if (field.numericCompare) {
        matched = compareNumeric(ddsVal, dwgVal);
      } else if (field.matchMode === 'contains') {
        const a = ddsVal.toLowerCase();
        const b = dwgVal.toLowerCase();
        matched = a.includes(b) || b.includes(a);
      } else {
        matched = compareString(ddsVal, dwgVal);
      }

      if (matched === true) {
        status = 'match';
      } else if (matched === false) {
        status = 'mismatch';
        note   = `DDS: "${ddsVal}" ≠ Drawing: "${dwgVal}"`;
        if (field.severity === 'critical') hasCriticalMismatch = true;
        else hasWarningMismatch = true;
      } else {
        status = 'low_confidence';
        note   = `Values could not be reliably compared (DDS: "${ddsVal}", Drawing: "${dwgVal}")`;
        hasWarningMismatch = true;
      }
    }

    results.push({
      parameter: field.displayLabel,
      dds_value: ddsVal,
      dwg_value: dwgVal,
      status,
      severity:  field.severity,
      ...(note ? { note } : {}),
    });
  }

  // ── Revision comparison ────────────────────────────────────────────────────
  // The control record holds the LAST APPROVED revision (e.g. "A").
  // A new drawing submission must be exactly ONE step ahead ("B").
  // Compare drawing's Revision property against nextRevision(revisionCode).
  {
    const dwgRevision  = dwgMap.get('Revision') ?? null;
    const currentRev   = dwgCtrl?.revisionCode?.trim() || null;
    const expectedNext = currentRev ? nextRevision(currentRev) : null;

    let revStatus: ParameterStatus;
    let revNote: string | undefined;

    if (!currentRev) {
      // No approved revision yet — drawing can be any initial revision
      revStatus = 'missing_dds';
      revNote   = 'No approved revision in drawing control record';
    } else if (!dwgRevision) {
      revStatus = 'missing_drawing';
      revNote   = 'Revision property not found or empty in drawing';
      hasCriticalMismatch = true;
    } else {
      const matched = compareString(expectedNext!, dwgRevision);
      if (matched === true) {
        revStatus = 'match';
      } else {
        revStatus = 'mismatch';
        revNote   = `Expected next revision "${expectedNext}" (after approved "${currentRev}"), drawing shows "${dwgRevision}"`;
        hasCriticalMismatch = true;
      }
    }

    results.push({
      parameter: 'Revision',
      dds_value: expectedNext ?? currentRev,  // show expected next as the "required" value
      dwg_value: dwgRevision,
      status:    revStatus,
      severity:  'critical',
      ...(revNote ? { note: revNote } : {}),
    });
  }

  const overallStatus: ComparisonStatus =
    hasCriticalMismatch ? 'fail' :
    hasWarningMismatch  ? 'warn' :
    'pass';

  return { status: overallStatus, result: results };
}

// ── Revision increment ─────────────────────────────────────────────────────────
// Returns the expected NEXT revision after the current approved one.
// Handles:
//   Single alpha  : A→B, B→C, …, Z→AA
//   Multi-alpha   : AA→AB, AZ→BA (column-style like Excel)
//   Zero-padded # : 00→01, 09→10, 99→100
//   Unrecognised  : returns current + "+" as a fallback label

function nextRevision(current: string): string {
  const s = current.trim().toUpperCase();

  // Zero-padded numeric (e.g. "00", "01", "09")
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10) + 1;
    return String(n).padStart(s.length, '0');
  }

  // Purely alphabetic (e.g. "A", "Z", "AA", "AZ")
  if (/^[A-Z]+$/.test(s)) {
    return incrementAlpha(s);
  }

  // Unrecognised format — append "+" as a hint
  return s + '+';
}

function incrementAlpha(s: string): string {
  const chars = s.split('');
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] < 'Z') {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
      return chars.join('');
    }
    chars[i] = 'A';
    i--;
  }
  // All chars were 'Z' — prepend an 'A' (Z→AA, ZZ→AAA, etc.)
  return 'A' + chars.join('');
}
