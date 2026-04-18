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
    numericCompare: false,
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

  const dwgMap = new Map<string, { value: string; unit: string }>();
  for (const row of ddtRows) {
    const key = normaliseKey(row.parameter ?? '');
    if (key) {
      dwgMap.set(key, { value: String(row.value ?? ''), unit: String(row.unit ?? '') });
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

function _displayName(key: string): string {
  return key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
