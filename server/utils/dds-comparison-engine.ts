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
import { designDataSheets } from '@shared/schema';
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

  // ── Fetch DDS ──────────────────────────────────────────────────────────────
  const [dds] = await db
    .select()
    .from(designDataSheets)
    .where(eq(designDataSheets.dwgControlId, drawingControlId))
    .limit(1);

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

  const overallStatus: ComparisonStatus =
    hasCriticalMismatch ? 'fail' :
    hasWarningMismatch  ? 'warn' :
    'pass';

  return { status: overallStatus, result: results };
}
