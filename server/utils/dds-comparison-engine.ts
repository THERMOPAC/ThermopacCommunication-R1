/**
 * dds-comparison-engine.ts
 *
 * Compares extracted SolidWorks Design Data table rows against the DDS record
 * stored in Replit for a given drawing control.
 *
 * Baseline: docs/slddrw-extraction-agent-baseline-v3.md §6b
 *
 * Returns:
 *   status  — "pass" | "warn" | "fail" | "blocked"
 *   result  — per-parameter comparison breakdown
 */

import { db } from '../db';
import { eq }  from 'drizzle-orm';
import { designDataSheets, epcDrawingControls } from '@shared/schema';
import type { MechanicalColumn, MechanicalData } from '@shared/schema';
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

// ── DDS field map ─────────────────────────────────────────────────────────────
// Maps drawing parameter name (normalised) → DDS field extractor + severity
// See baseline §6b for the full table.

interface FieldDef {
  severity: 'critical' | 'warning';
  getDdsValue: (dds: typeof designDataSheets.$inferSelect) => string | null;
  numericCompare: boolean;
}

const FIELD_MAP: Record<string, FieldDef> = {
  'design pressure': {
    severity: 'critical',
    numericCompare: true,
    getDdsValue: dds =>
      (dds.mechanicalData as MechanicalData)?.shell?.internalDesignPressureMawp ?? null,
  },
  'design temperature': {
    severity: 'critical',
    numericCompare: true,
    getDdsValue: dds =>
      (dds.mechanicalData as MechanicalData)?.shell?.designTempMinMax ?? null,
  },
  'corrosion allowance': {
    severity: 'critical',
    numericCompare: true,
    getDdsValue: dds =>
      (dds.mechanicalData as MechanicalData)?.shell?.internalCorrosionAllowanceMm ?? null,
  },
  'material': {
    severity: 'critical',
    numericCompare: false,
    getDdsValue: dds => dds.designCode ?? null,
  },
  'hazard level': {
    severity: 'critical',
    numericCompare: false,
    getDdsValue: dds =>
      (dds.mechanicalData as MechanicalData)?.shell?.hazardLevel ?? null,
  },
  'pwht': {
    severity: 'warning',
    numericCompare: false,
    getDdsValue: dds =>
      (dds.mechanicalData as MechanicalData)?.shell?.postWeldHeatTreatment ?? null,
  },
  'radiography': {
    severity: 'warning',
    numericCompare: false,
    getDdsValue: dds =>
      (dds.mechanicalData as MechanicalData)?.shell?.radiography ?? null,
  },
  'joint efficiency': {
    severity: 'warning',
    numericCompare: true,
    getDdsValue: dds =>
      (dds.mechanicalData as MechanicalData)?.shell?.jointEfficiency ?? null,
  },
  'insulation': {
    severity: 'warning',
    numericCompare: true,
    getDdsValue: dds =>
      (dds.mechanicalData as MechanicalData)?.shell?.insulation ?? null,
  },
  'hydro test pressure': {
    severity: 'warning',
    numericCompare: true,
    getDdsValue: dds =>
      (dds.mechanicalData as MechanicalData)?.shell?.hydroTestPressure ?? null,
  },
};

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

  // ── Build drawing lookup from design_data_table.rows ─────────────────────
  const ddtRows: Array<{ parameter: string; value: string; unit: string }> =
    extractionResult?.design_data_table?.rows ?? [];
  const designDataStatus =
    extractionResult?.design_data?.status ??
    extractionResult?.design_data_table?.status ??
    (ddtRows.length > 0 ? 'table' : 'missing');
  const designDataSource =
    extractionResult?.design_data?.source ??
    extractionResult?.design_data_table?.source ??
    (ddtRows.length > 0 ? 'table' : 'missing');

  if (ddtRows.length === 0 || designDataStatus === 'missing' || designDataSource === 'missing') {
    // No Design Data table in the drawing.
    // Instead of a single vague sentinel, emit one row per FIELD_MAP parameter so the
    // reviewer sees exactly which values the DDS expects that the drawing is missing.
    const noTableResults: ParameterResult[] = [];
    let hasCriticalMissing = false;
    let hasWarningMissing  = false;
    let hasDdsValues       = false;

    for (const [paramKey, fieldDef] of Object.entries(FIELD_MAP)) {
      const ddsRaw = fieldDef.getDdsValue(dds);
      const ddsVal = ddsRaw?.trim() || null;

      if (ddsVal) {
        hasDdsValues = true;
        if (fieldDef.severity === 'critical') hasCriticalMissing = true;
        else hasWarningMissing = true;

        noTableResults.push({
          parameter: paramKey,
          dds_value: ddsVal,
          dwg_value: null,
          status:    'missing_drawing',
          severity:  fieldDef.severity,
          note:      'No Design Data table found in drawing — parameter expected from DDS but absent',
        });
      } else {
        // DDS also has no value — show as missing_dds so reviewer knows both sides are blank
        noTableResults.push({
          parameter: paramKey,
          dds_value: null,
          dwg_value: null,
          status:    'missing_dds',
          severity:  fieldDef.severity,
          note:      'Not set in DDS',
        });
      }
    }

    // If the DDS had no values at all, fall back to the soft sentinel
    if (!hasDdsValues) {
      return {
        status: 'warn',
        result: [{
          parameter: '__design_data__',
          dds_value: null,
          dwg_value: null,
          status:    'low_confidence',
          severity:  'warning',
          note:      'Drawing extraction completed, but no structured Design Data table was found. Review extracted properties, sheets, notes, and warnings before approval.',
        }],
      };
    }

    return {
      status: hasCriticalMissing ? 'fail' : 'warn',
      result: noTableResults,
    };
  }

  const dwgMap = new Map<string, { value: string; unit: string }>();
  for (const row of ddtRows) {
    const key = canonicaliseDrawingKey(row.parameter ?? '');
    if (key) {
      dwgMap.set(key, { value: String(row.value ?? ''), unit: String(row.unit ?? '') });
    }
    const rawKey = normaliseKey(row.parameter ?? '');
    if (rawKey && !dwgMap.has(rawKey)) {
      dwgMap.set(rawKey, { value: String(row.value ?? ''), unit: String(row.unit ?? '') });
    }
  }

  // ── Compare each field ────────────────────────────────────────────────────
  const paramResults: ParameterResult[] = [];
  let hasCriticalMismatch = false;
  let hasWarningMismatch  = false;

  for (const [paramKey, fieldDef] of Object.entries(FIELD_MAP)) {
    const ddsRaw  = fieldDef.getDdsValue(dds);
    const dwgEntry = dwgMap.get(paramKey);

    const ddsVal = ddsRaw?.trim() ?? null;
    const dwgVal = dwgEntry ? `${dwgEntry.value}${dwgEntry.unit ? ' ' + dwgEntry.unit : ''}`.trim() : null;

    let status: ParameterStatus;
    let note: string | undefined;

    if (!ddsVal) {
      status = 'missing_dds';
      note   = 'Parameter not set in DDS';
    } else if (!dwgVal) {
      status = 'missing_drawing';
      note   = 'Parameter not found in drawing Design Data table';
      if (fieldDef.severity === 'critical') hasCriticalMismatch = true;
      else hasWarningMismatch = true;
    } else {
      // Compare
      const matched = fieldDef.numericCompare
        ? compareNumeric(ddsVal, dwgVal)
        : compareString(ddsVal, dwgVal);

      if (matched === true) {
        status = 'match';
      } else if (matched === false) {
        status = 'mismatch';
        note   = `DDS: "${ddsVal}" ≠ Drawing: "${dwgVal}"`;
        if (fieldDef.severity === 'critical') hasCriticalMismatch = true;
        else hasWarningMismatch = true;
      } else {
        // null = low confidence from normalizer
        status = 'low_confidence';
        note   = `Values could not be reliably compared (DDS: "${ddsVal}", Drawing: "${dwgVal}")`;
        hasWarningMismatch = true;
      }
    }

    paramResults.push({
      parameter: _displayName(paramKey),
      dds_value: ddsVal,
      dwg_value: dwgVal,
      status,
      severity:  fieldDef.severity,
      ...(note ? { note } : {}),
    });
  }

  const overallStatus: ComparisonStatus =
    hasCriticalMismatch ? 'fail' :
    hasWarningMismatch  ? 'warn' :
    'pass';

  return { status: overallStatus, result: paramResults };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseKey(raw: string): string {
  return raw.toLowerCase().replace(/[-_\/]/g, ' ').replace(/\s+/g, ' ').trim();
}

function canonicaliseDrawingKey(raw: string): string {
  const key = normaliseKey(raw);
  if (!key) return '';
  if ((key.includes('internal') || key.includes('int')) && key.includes('design') && key.includes('pressure')) return 'design pressure';
  if (key.includes('mawp') || (key.includes('design') && key.includes('pressure'))) return 'design pressure';
  if (key.includes('design') && (key.includes('temperature') || key.includes('temp'))) return 'design temperature';
  if (key.includes('corrosion') && (key.includes('allowance') || key.includes('allow'))) return 'corrosion allowance';
  if (key.includes('material')) return 'material';
  if (key.includes('hazard')) return 'hazard level';
  if (key.includes('pwht') || key.includes('post weld heat')) return 'pwht';
  if (key.includes('radio')) return 'radiography';
  if (key.includes('joint') && key.includes('eff')) return 'joint efficiency';
  if (key.includes('insulation')) return 'insulation';
  if (key.includes('hydro') && key.includes('pressure')) return 'hydro test pressure';
  return key;
}

function _displayName(key: string): string {
  return key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
