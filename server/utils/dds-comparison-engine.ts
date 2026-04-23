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

// ── Side-aware field definitions ──────────────────────────────────────────────
// perSide=true  → emitted once per active side (Shell / Tube / Jacket)
// perSide=false → emitted once from the Shell column only
interface SideFieldDef {
  key:            string;               // canonical key (lowercase)
  severity:       'critical' | 'warning';
  numericCompare: boolean;
  perSide:        boolean;
  getColumnValue: (col: MechanicalColumn) => string | null;
}

const SIDE_FIELDS: SideFieldDef[] = [
  { key: 'design pressure',    severity: 'critical', numericCompare: true,  perSide: true,  getColumnValue: c => c.internalDesignPressureMawp      },
  { key: 'design temperature', severity: 'critical', numericCompare: true,  perSide: true,  getColumnValue: c => c.designTempMinMax                 },
  { key: 'corrosion allowance',severity: 'critical', numericCompare: true,  perSide: true,  getColumnValue: c => c.internalCorrosionAllowanceMm     },
  { key: 'hazard level',       severity: 'critical', numericCompare: false, perSide: true,  getColumnValue: c => c.hazardLevel                      },
  { key: 'hydro test pressure',severity: 'warning',  numericCompare: true,  perSide: true,  getColumnValue: c => c.hydroTestPressure                },
  { key: 'pwht',               severity: 'warning',  numericCompare: false, perSide: false, getColumnValue: c => c.postWeldHeatTreatment            },
  { key: 'radiography',        severity: 'warning',  numericCompare: false, perSide: false, getColumnValue: c => c.radiography                      },
  { key: 'joint efficiency',   severity: 'warning',  numericCompare: true,  perSide: false, getColumnValue: c => c.jointEfficiency                  },
  { key: 'insulation',         severity: 'warning',  numericCompare: false, perSide: false, getColumnValue: c => c.insulation                       },
];

// Material comes from dds.designCode (not a mechanical column), always shown once.
const MATERIAL_DEF = { key: 'material', severity: 'critical' as const, numericCompare: false };

// ── Equipment-config → active sides ──────────────────────────────────────────
type Side = 'shell' | 'tube' | 'jacket';

function activeSides(equipmentConfig: string | null): Side[] {
  const cfg = (equipmentConfig ?? '').toLowerCase();
  const sides: Side[] = ['shell'];
  if (cfg.includes('heat exchanger') || cfg.includes('tube') || cfg.includes('hx')) {
    sides.push('tube');
  }
  if (cfg.includes('jacket')) {
    sides.push('jacket');
  }
  return sides;
}

const SIDE_LABEL: Record<Side, string> = {
  shell:  'Shell',
  tube:   'Tube',
  jacket: 'Jacket',
};

// Prefix a field key with a side label when there are multiple active sides.
function paramLabel(fieldKey: string, side: Side, multiSide: boolean): string {
  const display = fieldKey.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return multiSide ? `${SIDE_LABEL[side]} — ${display}` : display;
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

  const mechData = dds.mechanicalData as MechanicalData;
  const sides    = activeSides(dds.equipmentConfig);
  const multiSide = sides.length > 1;

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

  // ── No DDT path ────────────────────────────────────────────────────────────
  if (ddtRows.length === 0 || designDataStatus === 'missing' || designDataSource === 'missing') {
    const noTableResults: ParameterResult[] = [];
    let hasCriticalMissing = false;
    let hasWarningMissing  = false;
    let hasDdsValues       = false;

    // Per-side fields
    for (const field of SIDE_FIELDS) {
      const targetSides = field.perSide ? sides : ['shell' as Side];

      for (const side of targetSides) {
        const col    = mechData[side];
        const ddsRaw = col ? field.getColumnValue(col) : null;
        const ddsVal = ddsRaw?.trim() || null;
        const label  = paramLabel(field.key, side, field.perSide && multiSide);

        if (ddsVal) {
          hasDdsValues = true;
          if (field.severity === 'critical') hasCriticalMissing = true;
          else hasWarningMissing = true;

          noTableResults.push({
            parameter: label,
            dds_value: ddsVal,
            dwg_value: null,
            status:    'missing_drawing',
            severity:  field.severity,
            note:      'No Design Data table found in drawing — parameter expected from DDS but absent',
          });
        } else {
          noTableResults.push({
            parameter: label,
            dds_value: null,
            dwg_value: null,
            status:    'missing_dds',
            severity:  field.severity,
            note:      'Not set in DDS',
          });
        }
      }
    }

    // Material (from designCode) — always once
    const matVal = dds.designCode?.trim() || null;
    if (matVal) {
      hasDdsValues = true;
      hasCriticalMissing = true;
      noTableResults.push({
        parameter: 'Material',
        dds_value: matVal,
        dwg_value: null,
        status:    'missing_drawing',
        severity:  'critical',
        note:      'No Design Data table found in drawing — parameter expected from DDS but absent',
      });
    } else {
      noTableResults.push({
        parameter: 'Material',
        dds_value: null,
        dwg_value: null,
        status:    'missing_dds',
        severity:  'critical',
        note:      'Not set in DDS',
      });
    }

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

  // ── Has DDT — build drawing lookup ────────────────────────────────────────
  // Index by both raw and canonical key; for multi-side drawings also try
  // "shell design pressure", "tube design pressure" etc.
  const dwgMap = new Map<string, { value: string; unit: string }>();
  for (const row of ddtRows) {
    const key = canonicaliseDrawingKey(row.parameter ?? '');
    if (key) dwgMap.set(key, { value: String(row.value ?? ''), unit: String(row.unit ?? '') });
    const rawKey = normaliseKey(row.parameter ?? '');
    if (rawKey && !dwgMap.has(rawKey)) {
      dwgMap.set(rawKey, { value: String(row.value ?? ''), unit: String(row.unit ?? '') });
    }
  }

  // ── Compare each field ─────────────────────────────────────────────────────
  const paramResults: ParameterResult[] = [];
  let hasCriticalMismatch = false;
  let hasWarningMismatch  = false;

  for (const field of SIDE_FIELDS) {
    const targetSides = field.perSide ? sides : ['shell' as Side];

    for (const side of targetSides) {
      const col    = mechData[side];
      const ddsRaw = col ? field.getColumnValue(col) : null;
      const label  = paramLabel(field.key, side, field.perSide && multiSide);

      // Build lookup keys: try side-prefixed first, then bare
      const sidePrefix  = `${side} ${field.key}`;            // e.g. "shell design pressure"
      const bareKey     = field.key;
      const dwgEntry    = dwgMap.get(sidePrefix) ?? dwgMap.get(bareKey) ?? null;

      const ddsVal = ddsRaw?.trim() ?? null;
      const dwgVal = dwgEntry
        ? `${dwgEntry.value}${dwgEntry.unit ? ' ' + dwgEntry.unit : ''}`.trim()
        : null;

      const result = compareField(field, ddsVal, dwgVal);
      if (result.status === 'mismatch' || result.status === 'missing_drawing') {
        if (field.severity === 'critical') hasCriticalMismatch = true;
        else hasWarningMismatch = true;
      }
      if (result.status === 'low_confidence') hasWarningMismatch = true;

      paramResults.push({ parameter: label, dds_value: ddsVal, dwg_value: dwgVal, severity: field.severity, ...result });
    }
  }

  // Material
  {
    const ddsVal  = dds.designCode?.trim() ?? null;
    const dwgEntry = dwgMap.get('material') ?? null;
    const dwgVal  = dwgEntry
      ? `${dwgEntry.value}${dwgEntry.unit ? ' ' + dwgEntry.unit : ''}`.trim()
      : null;
    const result  = compareField(MATERIAL_DEF, ddsVal, dwgVal);
    if (result.status === 'mismatch' || result.status === 'missing_drawing') hasCriticalMismatch = true;
    paramResults.push({ parameter: 'Material', dds_value: ddsVal, dwg_value: dwgVal, severity: 'critical', ...result });
  }

  const overallStatus: ComparisonStatus =
    hasCriticalMismatch ? 'fail' :
    hasWarningMismatch  ? 'warn' :
    'pass';

  return { status: overallStatus, result: paramResults };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function compareField(
  field: Pick<SideFieldDef, 'numericCompare'>,
  ddsVal: string | null,
  dwgVal: string | null,
): { status: ParameterStatus; note?: string } {
  if (!ddsVal) return { status: 'missing_dds', note: 'Parameter not set in DDS' };
  if (!dwgVal) return { status: 'missing_drawing', note: 'Parameter not found in drawing Design Data table' };

  const matched = field.numericCompare
    ? compareNumeric(ddsVal, dwgVal)
    : compareString(ddsVal, dwgVal);

  if (matched === true)  return { status: 'match' };
  if (matched === false) return { status: 'mismatch', note: `DDS: "${ddsVal}" ≠ Drawing: "${dwgVal}"` };
  return { status: 'low_confidence', note: `Values could not be reliably compared (DDS: "${ddsVal}", Drawing: "${dwgVal}")` };
}

function normaliseKey(raw: string): string {
  return raw.toLowerCase().replace(/[-_\/]/g, ' ').replace(/\s+/g, ' ').trim();
}

function canonicaliseDrawingKey(raw: string): string {
  const key = normaliseKey(raw);
  if (!key) return '';

  // Detect side prefix
  let side = '';
  let rest = key;
  if (key.startsWith('shell '))  { side = 'shell ';  rest = key.slice(6); }
  if (key.startsWith('tube '))   { side = 'tube ';   rest = key.slice(5); }
  if (key.startsWith('jacket ')) { side = 'jacket '; rest = key.slice(7); }

  let canonical = '';
  if ((rest.includes('internal') || rest.includes('int') || rest.includes('mawp')) && rest.includes('pressure')) canonical = 'design pressure';
  else if (rest.includes('design') && rest.includes('pressure')) canonical = 'design pressure';
  else if (rest.includes('design') && (rest.includes('temperature') || rest.includes('temp'))) canonical = 'design temperature';
  else if (rest.includes('corrosion') && (rest.includes('allowance') || rest.includes('allow'))) canonical = 'corrosion allowance';
  else if (rest.includes('material')) canonical = 'material';
  else if (rest.includes('hazard')) canonical = 'hazard level';
  else if (rest.includes('pwht') || rest.includes('post weld heat')) canonical = 'pwht';
  else if (rest.includes('radio')) canonical = 'radiography';
  else if (rest.includes('joint') && rest.includes('eff')) canonical = 'joint efficiency';
  else if (rest.includes('insulation')) canonical = 'insulation';
  else if (rest.includes('hydro') && rest.includes('pressure')) canonical = 'hydro test pressure';
  else canonical = rest;

  return side ? `${side.trim()} ${canonical}` : canonical;
}
