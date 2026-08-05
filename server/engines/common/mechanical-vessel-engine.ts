// ═══════════════════════════════════════════════════════════════════════════════
// Common Mechanical Design Engine (Stage C6)
//
// PRELIMINARY MECHANICAL SCREENING — NOT A CODE CALCULATION AND NOT FOR
// FABRICATION.
//
// Common downstream engine: receives the process/equipment sizing result from
// Stage C4 (ECP) or Stage C5 (ECR) — and any future Thermopac module — via a
// technology-neutral MechanicalGeometryInput snapshot, and produces a
// preliminary mechanical vessel definition (MEC-001…MEC-010).
//
// Approved refinements implemented:
//   R1. vesselOrientation is an explicit mandatory input — never inferred.
//   R2. MaterialInterface { name, specification, grade, allowableStress,
//       density, corrosionAllowance, source } — future ASME Section II hook.
//   R3. Head types: 2:1 ellipsoidal / torispherical / hemispherical / flat /
//       custom; head depth determined from the selected head type.
//   R4. Nozzle schedule extended with Projection, Flange Class, Flange Standard.
//   R5. Complete weight breakdown: shell / heads / nozzles / internals /
//       supports / insulation (optional) / future platforms (placeholder) /
//       empty / operating / hydrotest.
//   R6. Reserved architecture placeholders (no implementation): wind, seismic,
//       transportation, foundation load, nozzle load.
//   R7. Structured Mechanical Datasheet object generated from results
//       (internal engineering object — not a PDF).
//
// No ASME VIII / EN 13445 / IS 2825 / PV Elite / FEA / wind / seismic /
// reinforcement / detailed support design. Thickness methods dispatch through
// a ThicknessMethod label so code methods can be added without changing the
// workflow. Allowable stress is engineer-entered — never looked up by name.
// ═══════════════════════════════════════════════════════════════════════════════

import {
  IDesignEngine, ValidationResult, ValidationError, CalculationContext,
  CalculationResult, DesignSummary, EngineWarning,
} from '../../engine-framework/types';
import { SOURCE_TYPES } from '../../engine-framework/common-engineering-library';
import type { SourceType } from '../../engine-framework/epd/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const ENGINE_VERSION = '1.0.0';
const THICKNESS_METHOD = 'thin_wall_membrane_screening'; // the only method shipped in C6

const APPLICABILITY_STATEMENT = 'PRELIMINARY MECHANICAL SCREENING — NOT A CODE CALCULATION AND NOT FOR FABRICATION';
const LIMITATIONS = [
  'No ASME VIII / EN 13445 / IS 2825 code calculation',
  'No PV Elite or FEA verification',
  'No wind or seismic analysis',
  'No nozzle reinforcement calculation',
  'No detailed support or lifting-lug structural design',
  'Thicknesses are thin-wall membrane screening values only',
  'Weights are estimates from stated assumptions only',
];

const ORIENTATIONS = ['vertical', 'horizontal'] as const;
type Orientation = (typeof ORIENTATIONS)[number];
const HEAD_TYPES = ['ellipsoidal_2_1', 'torispherical', 'hemispherical', 'flat', 'custom'] as const;
type HeadType = (typeof HEAD_TYPES)[number];
const SUPPORT_TYPES = ['skirt', 'legs', 'saddle', 'lug'] as const;
type SupportType = (typeof SUPPORT_TYPES)[number];

const MANDATORY_NOZZLE_SERVICES = ['feed', 'solvent', 'raffinate', 'extract', 'vent', 'drain', 'instrument'] as const;

type Classification = 'Calculated Screening Result' | 'Pending Validation' | 'Not Calculable';
const THIN_WALL_LIMIT = 0.10; // t/R validity gate for the membrane screening formula
const BARG_TO_MPA = 0.1;      // 1 bar = 0.1 MPa (gauge basis stated in output)

// ── Rich result item ──────────────────────────────────────────────────────────

interface ResultItem {
  result: number | string | null;
  units: string;
  source: string;
  status: Classification;
  validation: string;
  warnings: string[];
  formulaReference: string;   // MEC-001…MEC-010
  engineVersion: string;
}

function item(formulaReference: string, result: number | string | null, units: string, source: string, status: Classification, validation: string, itemWarnings: string[] = []): ResultItem {
  return { result, units, source, status, validation, warnings: itemWarnings, formulaReference, engineVersion: ENGINE_VERSION };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface TaggedValue { value: number; unit?: string; sourceType: SourceType; sourceReference: string }
interface AssumptionEntry { assumption: string; sourceType?: SourceType; sourceReference?: string; consequence: string }

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function parseTagged(raw: unknown, field: string, errors: ValidationError[], opts: { min: number; max: number; unit: string; required?: boolean }): TaggedValue | undefined {
  if (raw === undefined || raw === null) {
    if (opts.required) errors.push({ field, message: `${field} is required: { value (${opts.unit}), unit, sourceType, sourceReference } — source-tagged or explicitly Assumed; never defaulted`, severity: 'error' });
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const value = num(o.value);
  if (value === undefined) { errors.push({ field, message: `${field}.value must be a finite number (${opts.unit})`, severity: 'error' }); return undefined; }
  if (value < opts.min || value > opts.max) { errors.push({ field, message: `${field}.value must be in [${opts.min}, ${opts.max}] ${opts.unit} (got ${value})`, severity: 'error' }); return undefined; }
  if (o.unit !== undefined && o.unit !== opts.unit) { errors.push({ field, message: `${field}.unit must be '${opts.unit}' (got '${String(o.unit)}')`, severity: 'error' }); return undefined; }
  if (!SOURCE_TYPES.includes(o.sourceType as SourceType)) { errors.push({ field, message: `${field}.sourceType must be one of ${SOURCE_TYPES.join(', ')}`, severity: 'error' }); return undefined; }
  if (typeof o.sourceReference !== 'string' || !o.sourceReference.trim()) { errors.push({ field, message: `${field}.sourceReference is mandatory`, severity: 'error' }); return undefined; }
  return { value, unit: opts.unit, sourceType: o.sourceType as SourceType, sourceReference: o.sourceReference };
}

function sourceOf(t: TaggedValue): string { return `${t.sourceType}: ${t.sourceReference}`; }
function normalizeService(s: string): string { return s.trim().toLowerCase().replace(/\s+(inlet|outlet|in|out)$/i, ''); }

// Refinement R2 — Material Interface (future ASME Section II hook)
interface ParsedMaterial {
  materialName: string;
  materialSpecification: string;
  materialGrade: string;
  allowableStress: TaggedValue;   // MPa at design temperature
  density: TaggedValue;           // kg/m3
  corrosionAllowance: TaggedValue; // mm
  source: string;
}

function parseMaterial(raw: unknown, errors: ValidationError[]): ParsedMaterial | undefined {
  if (raw === undefined || raw === null || typeof raw !== 'object') {
    errors.push({ field: 'material', message: 'material is required: { materialName, materialSpecification, materialGrade, allowableStress, density, corrosionAllowance, source } — the Material Interface is mandatory (future ASME Section II hook)', severity: 'error' });
    return undefined;
  }
  const m = raw as Record<string, unknown>;
  for (const k of ['materialName', 'materialSpecification', 'materialGrade', 'source'] as const) {
    if (typeof m[k] !== 'string' || !(m[k] as string).trim()) errors.push({ field: `material.${k}`, message: `material.${k} is a mandatory non-empty string`, severity: 'error' });
  }
  const allowableStress = parseTagged(m.allowableStress, 'material.allowableStress', errors, { min: 1, max: 1000, unit: 'MPa', required: true });
  const density = parseTagged(m.density, 'material.density', errors, { min: 1000, max: 25000, unit: 'kg/m3', required: true });
  const corrosionAllowance = parseTagged(m.corrosionAllowance, 'material.corrosionAllowance', errors, { min: 0, max: 25, unit: 'mm', required: true });
  if (!allowableStress || !density || !corrosionAllowance) return undefined;
  if (errors.some((e) => e.field.startsWith('material.') && e.severity === 'error')) return undefined;
  return {
    materialName: m.materialName as string, materialSpecification: m.materialSpecification as string,
    materialGrade: m.materialGrade as string, allowableStress, density, corrosionAllowance, source: m.source as string,
  };
}

interface ParsedGeometry {
  sourceEngine: { engineId: string; engineVersion: string; calculationType: string };
  sourceRunReference: string;
  insideDiameter: number;          // m
  tangentToTangent: number;        // m
  overallVesselHeight: number;     // m
  operatingLiquidBasis: 'liquid_full' | { holdupFraction: TaggedValue };
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class MechanicalVesselEngine implements IDesignEngine {
  getEngineId(): string { return 'mech-vessel'; }
  getEngineVersion(): string { return ENGINE_VERSION; }
  getModuleType(): string { return 'common'; }
  getCalculationType(): string { return 'mechanical_vessel'; }

  // ── validate ────────────────────────────────────────────────────────────────
  validate(inputs: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = [];
    const err = (field: string, message: string) => errors.push({ field, message, severity: 'error' });

    // R1 — explicit mandatory orientation, never inferred
    if (!ORIENTATIONS.includes(inputs.vesselOrientation as Orientation)) {
      err('vesselOrientation', "vesselOrientation is an explicit mandatory input: 'vertical' | 'horizontal' — the engine never infers orientation");
    }

    // Geometry snapshot (adopted, never re-entered)
    const g = inputs.geometry as Record<string, unknown> | undefined;
    if (!g || typeof g !== 'object') err('geometry', 'geometry is required: the MechanicalGeometryInput snapshot from the selected technology (ECP/ECR) result — geometry is adopted, never re-entered');
    else {
      const se = g.sourceEngine as Record<string, unknown> | undefined;
      if (!se || typeof se.engineId !== 'string' || !se.engineId || typeof se.engineVersion !== 'string' || !se.engineVersion || typeof se.calculationType !== 'string' || !se.calculationType) {
        err('geometry.sourceEngine', 'geometry.sourceEngine { engineId, engineVersion, calculationType } is mandatory for traceability');
      }
      if (typeof g.sourceRunReference !== 'string' || !(g.sourceRunReference as string).trim()) err('geometry.sourceRunReference', 'geometry.sourceRunReference is mandatory (run/snapshot traceability)');
      const D = num(g.insideDiameter_m); const tt = num(g.tangentToTangentHeight_m); const oh = num(g.overallVesselHeight_m);
      if (D === undefined || D <= 0 || D > 20) err('geometry.insideDiameter_m', 'geometry.insideDiameter_m must be a finite value in (0, 20] m');
      if (tt === undefined || tt <= 0 || tt > 200) err('geometry.tangentToTangentHeight_m', 'geometry.tangentToTangentHeight_m must be a finite value in (0, 200] m');
      if (oh === undefined || oh <= 0 || oh > 250) err('geometry.overallVesselHeight_m', 'geometry.overallVesselHeight_m must be a finite value in (0, 250] m');
      if (tt !== undefined && oh !== undefined && oh < tt) err('geometry.overallVesselHeight_m', 'overallVesselHeight_m must be ≥ tangentToTangentHeight_m');
      const basis = g.operatingLiquidBasis as unknown;
      if (basis !== 'liquid_full') {
        const hb = basis as Record<string, unknown> | undefined;
        if (!hb || typeof hb !== 'object' || hb.holdupFraction === undefined) err('geometry.operatingLiquidBasis', "geometry.operatingLiquidBasis must be 'liquid_full' or { holdupFraction: tagged value }");
        else parseTagged(hb.holdupFraction, 'geometry.operatingLiquidBasis.holdupFraction', errors, { min: 0.01, max: 1, unit: '-', required: true });
      }
    }

    // MEC-001 design conditions
    const pd = parseTagged(inputs.designPressure, 'designPressure', errors, { min: 0, max: 500, unit: 'barg', required: true });
    const pop = parseTagged(inputs.operatingPressure, 'operatingPressure', errors, { min: 0, max: 500, unit: 'barg', required: true });
    const td = parseTagged(inputs.designTemperature, 'designTemperature', errors, { min: -200, max: 1000, unit: 'C', required: true });
    const top = parseTagged(inputs.operatingTemperature, 'operatingTemperature', errors, { min: -200, max: 1000, unit: 'C', required: true });
    if (pd && pop && pd.value < pop.value) err('designPressure', `designPressure (${pd.value} barg) must be ≥ operatingPressure (${pop.value} barg) — design margins are engineer-set, never invented by the engine`);
    if (td && top && td.value < top.value) err('designTemperature', `designTemperature (${td.value} °C) must be ≥ operatingTemperature (${top.value} °C)`);

    const material = parseMaterial(inputs.material, errors);
    const E = parseTagged(inputs.jointEfficiency, 'jointEfficiency', errors, { min: 0.01, max: 1, unit: '-', required: true });
    if (typeof inputs.designCode !== 'string' || !(inputs.designCode as string).trim()) err('designCode', "designCode placeholder label is mandatory (e.g. 'NOT_ASSIGNED') — code calculations are a future method");

    // MEC-002 head type (R3)
    const headType = inputs.headType as HeadType;
    if (!HEAD_TYPES.includes(headType)) err('headType', `headType must be one of ${HEAD_TYPES.join(', ')}`);
    else {
      if (headType === 'torispherical') {
        const tg = inputs.torisphericalGeometry as Record<string, unknown> | undefined;
        if (!tg) err('torisphericalGeometry', 'torisphericalGeometry { crownRadius, knuckleRadius } is mandatory for a torispherical head — never assumed');
        else {
          const cr = parseTagged(tg.crownRadius, 'torisphericalGeometry.crownRadius', errors, { min: 0.05, max: 40, unit: 'm', required: true });
          const kr = parseTagged(tg.knuckleRadius, 'torisphericalGeometry.knuckleRadius', errors, { min: 0.005, max: 10, unit: 'm', required: true });
          if (cr && kr && kr.value >= cr.value) err('torisphericalGeometry', 'knuckleRadius must be < crownRadius');
        }
        parseTagged(inputs.headDepth, 'headDepth', errors, { min: 0.01, max: 10, unit: 'm', required: true });
        parseTagged(inputs.headVolume, 'headVolume', errors, { min: 0.0001, max: 1000, unit: 'm3', required: true });
      }
      if (headType === 'custom') {
        parseTagged(inputs.headDepth, 'headDepth', errors, { min: 0, max: 10, unit: 'm', required: true });
        parseTagged(inputs.headVolume, 'headVolume', errors, { min: 0, max: 1000, unit: 'm3', required: true });
        // customHeadThickness optional — absent ⇒ head thickness Not Calculable (screening formula does not exist for arbitrary geometry)
        parseTagged(inputs.customHeadThickness, 'customHeadThickness', errors, { min: 0.5, max: 300, unit: 'mm' });
      }
      if (headType === 'flat' && pd && pd.value > 0) {
        errors.push({ field: 'headType', message: 'Flat head selected for pressure service — flat-cover thickness requires a code method (not shipped in C6); head thickness will be Not Calculable', severity: 'warning' });
      }
    }

    // MEC-005 plate series (optional, source-tagged)
    const ps = inputs.plateThicknessSeries as Record<string, unknown> | undefined;
    if (ps !== undefined && ps !== null) {
      const vals = ps.values_mm as unknown;
      if (!Array.isArray(vals) || vals.length === 0 || !vals.every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0)) err('plateThicknessSeries.values_mm', 'plateThicknessSeries.values_mm must be a non-empty array of finite positive thicknesses (mm)');
      else if ([...(vals as number[])].some((v, i, a) => i > 0 && v <= a[i - 1])) err('plateThicknessSeries.values_mm', 'plateThicknessSeries.values_mm must be strictly increasing');
      if (!SOURCE_TYPES.includes(ps.sourceType as SourceType)) err('plateThicknessSeries.sourceType', `plateThicknessSeries.sourceType must be one of ${SOURCE_TYPES.join(', ')}`);
      if (typeof ps.sourceReference !== 'string' || !(ps.sourceReference as string).trim()) err('plateThicknessSeries.sourceReference', 'plateThicknessSeries.sourceReference is mandatory');
    }
    parseTagged(inputs.minimumThickness, 'minimumThickness', errors, { min: 0.5, max: 100, unit: 'mm' });

    // Physicality gate: S·E − 0.6·P must be positive
    if (pd && material && E) {
      const P = pd.value * BARG_TO_MPA;
      if (material.allowableStress.value * E.value - 0.6 * P <= 0) err('designPressure', 'S·E − 0.6·P ≤ 0 — the thin-wall membrane screening formula is not physical at these conditions; a code method is required');
    }

    // MEC-006 nozzles (R4)
    const nozzles = inputs.nozzles as unknown;
    if (!Array.isArray(nozzles) || nozzles.length === 0) err('nozzles', `nozzles is required: mandatory services ${MANDATORY_NOZZLE_SERVICES.join(', ')} (Spare optional)`);
    else {
      const services = new Set<string>();
      nozzles.forEach((n, i) => {
        const nz = n as Record<string, unknown>;
        if (typeof nz.service !== 'string' || !(nz.service as string).trim()) { err(`nozzles[${i}].service`, 'service is mandatory'); return; }
        services.add(normalizeService(nz.service as string));
        const hasSize = nz.size !== undefined && nz.size !== null;
        const ffs = nz.flowForSizing as Record<string, unknown> | undefined;
        if (hasSize) parseTagged(nz.size, `nozzles[${i}].size`, errors, { min: 8, max: 2000, unit: 'DN', required: true });
        if (ffs) {
          parseTagged(ffs.volumetricFlow, `nozzles[${i}].flowForSizing.volumetricFlow`, errors, { min: 0.0001, max: 100000, unit: 'm3/h', required: true });
          parseTagged(ffs.designVelocity, `nozzles[${i}].flowForSizing.designVelocity`, errors, { min: 0.01, max: 50, unit: 'm/s', required: true });
        }
        if (nz.projection !== undefined && nz.projection !== null) parseTagged(nz.projection, `nozzles[${i}].projection`, errors, { min: 50, max: 2000, unit: 'mm', required: true });
      });
      for (const s of MANDATORY_NOZZLE_SERVICES) {
        // Exact match on the normalized service word — substring matching is
        // forbidden ('solvent' must never satisfy 'vent').
        if (!Array.from(services).some((x) => x === s)) err('nozzles', `Mandatory nozzle service missing: '${s}' — the schedule must include Feed, Solvent, Raffinate, Extract, Vent, Drain and at least one Instrument (exact normalized service names; 'Solvent Inlet' → 'solvent')`);
      }
    }
    const nd = inputs.nozzleDefaults as Record<string, unknown> | undefined;
    if (nd?.projection !== undefined && nd?.projection !== null) parseTagged(nd.projection, 'nozzleDefaults.projection', errors, { min: 50, max: 2000, unit: 'mm', required: true });
    if (nd?.dnSeries !== undefined && nd?.dnSeries !== null) {
      const ds = nd.dnSeries as Record<string, unknown>;
      const vals = ds.values as unknown;
      if (!Array.isArray(vals) || vals.length === 0 || !vals.every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0)) err('nozzleDefaults.dnSeries.values', 'dnSeries.values must be a non-empty array of finite positive DN values');
      else if ((vals as number[]).some((v, i, a) => i > 0 && v <= a[i - 1])) err('nozzleDefaults.dnSeries.values', 'dnSeries.values must be strictly increasing');
      if (!SOURCE_TYPES.includes(ds.sourceType as SourceType)) err('nozzleDefaults.dnSeries.sourceType', `dnSeries.sourceType must be one of ${SOURCE_TYPES.join(', ')}`);
      if (typeof ds.sourceReference !== 'string' || !(ds.sourceReference as string).trim()) err('nozzleDefaults.dnSeries.sourceReference', 'dnSeries.sourceReference is mandatory');
    }

    // MEC-007 support
    const so = inputs.supportOverride as SupportType | undefined;
    if (so !== undefined && so !== null && !SUPPORT_TYPES.includes(so)) err('supportOverride', `supportOverride must be one of ${SUPPORT_TYPES.join(', ')}`);
    if (so === 'legs') {
      const lc = inputs.legCriteria as Record<string, unknown> | undefined;
      if (!lc) err('legCriteria', 'legCriteria { maxHeight, maxWeight } is mandatory when legs are requested — the engine never assumes leg applicability');
      else {
        parseTagged(lc.maxHeight, 'legCriteria.maxHeight', errors, { min: 0.5, max: 50, unit: 'm', required: true });
        parseTagged(lc.maxWeight, 'legCriteria.maxWeight', errors, { min: 100, max: 1e6, unit: 'kg', required: true });
      }
    }

    // MEC-008 weight inputs (R5 breakdown)
    parseTagged(inputs.nozzlesWeight, 'nozzlesWeight', errors, { min: 0, max: 1e5, unit: 'kg', required: true });
    parseTagged(inputs.internalsWeight, 'internalsWeight', errors, { min: 0, max: 1e6, unit: 'kg', required: true });
    parseTagged(inputs.supportsWeight, 'supportsWeight', errors, { min: 0, max: 1e6, unit: 'kg', required: true });
    parseTagged(inputs.insulationWeight, 'insulationWeight', errors, { min: 0, max: 1e5, unit: 'kg' }); // optional
    parseTagged(inputs.headBlankFactor, 'headBlankFactor', errors, { min: 0.5, max: 3, unit: '-', required: true });
    parseTagged(inputs.operatingLiquidDensity, 'operatingLiquidDensity', errors, { min: 1, max: 20000, unit: 'kg/m3', required: true });
    parseTagged(inputs.waterDensity, 'waterDensity', errors, { min: 900, max: 1100, unit: 'kg/m3', required: true });
    parseTagged(inputs.erectionAllowance, 'erectionAllowance', errors, { min: 0, max: 1e5, unit: 'kg' }); // optional

    return { valid: errors.filter((e) => e.severity === 'error').length === 0, errors };
  }

  // ── calculate ───────────────────────────────────────────────────────────────
  async calculate(inputs: Record<string, unknown>, context: CalculationContext): Promise<CalculationResult> {
    const base = {
      calculationClass: context.calculationClass ?? 'Preliminary Screening',
      engineId: this.getEngineId(),
      engineVersion: ENGINE_VERSION,
      computedAt: new Date(),
    };
    const warnings: EngineWarning[] = [];
    const pushWarning = (code: string, message: string) => { if (!warnings.some((w) => w.code === code && w.message === message)) warnings.push({ code, message }); };
    const assumptions: AssumptionEntry[] = [];
    let anyPending = false;
    const notePending = () => { anyPending = true; };
    const errs: ValidationError[] = [];

    const gate = this.validate(inputs);
    const gateErrors = gate.errors.filter((e) => e.severity === 'error');
    if (gateErrors.length > 0) {
      return { ...base, status: 'error', data: { calculationRunStatus: 'calculation_blocked' }, warnings, validationIssues: gate.errors };
    }
    for (const w of gate.errors.filter((e) => e.severity === 'warning')) pushWarning('INPUT_WARNING', `${w.field}: ${w.message}`);

    try {
      // ── Parse (post-gate) ───────────────────────────────────────────────────
      const orientation = inputs.vesselOrientation as Orientation; // R1 — explicit, never inferred
      const g = inputs.geometry as Record<string, unknown>;
      const se = g.sourceEngine as Record<string, string>;
      const geometry: ParsedGeometry = {
        sourceEngine: { engineId: se.engineId, engineVersion: se.engineVersion, calculationType: se.calculationType },
        sourceRunReference: g.sourceRunReference as string,
        insideDiameter: num(g.insideDiameter_m)!,
        tangentToTangent: num(g.tangentToTangentHeight_m)!,
        overallVesselHeight: num(g.overallVesselHeight_m)!,
        operatingLiquidBasis: g.operatingLiquidBasis === 'liquid_full' ? 'liquid_full'
          : { holdupFraction: parseTagged((g.operatingLiquidBasis as Record<string, unknown>).holdupFraction, 'geometry.operatingLiquidBasis.holdupFraction', errs, { min: 0.01, max: 1, unit: '-', required: true })! },
      };
      const pd = parseTagged(inputs.designPressure, 'designPressure', errs, { min: 0, max: 500, unit: 'barg', required: true })!;
      const pop = parseTagged(inputs.operatingPressure, 'operatingPressure', errs, { min: 0, max: 500, unit: 'barg', required: true })!;
      const td = parseTagged(inputs.designTemperature, 'designTemperature', errs, { min: -200, max: 1000, unit: 'C', required: true })!;
      const top = parseTagged(inputs.operatingTemperature, 'operatingTemperature', errs, { min: -200, max: 1000, unit: 'C', required: true })!;
      const material = parseMaterial(inputs.material, errs)!;
      const E = parseTagged(inputs.jointEfficiency, 'jointEfficiency', errs, { min: 0.01, max: 1, unit: '-', required: true })!;
      const designCode = inputs.designCode as string;
      const headType = inputs.headType as HeadType;
      const headDepthIn = parseTagged(inputs.headDepth, 'headDepth', errs, { min: 0, max: 10, unit: 'm' });
      const headVolumeIn = parseTagged(inputs.headVolume, 'headVolume', errs, { min: 0, max: 1000, unit: 'm3' });
      const customHeadThk = parseTagged(inputs.customHeadThickness, 'customHeadThickness', errs, { min: 0.5, max: 300, unit: 'mm' });
      const toriGeom = inputs.torisphericalGeometry as Record<string, unknown> | undefined;
      const crownRadius = toriGeom ? parseTagged(toriGeom.crownRadius, 'torisphericalGeometry.crownRadius', errs, { min: 0.05, max: 40, unit: 'm', required: true }) : undefined;
      const knuckleRadius = toriGeom ? parseTagged(toriGeom.knuckleRadius, 'torisphericalGeometry.knuckleRadius', errs, { min: 0.005, max: 10, unit: 'm', required: true }) : undefined;
      const minThk = parseTagged(inputs.minimumThickness, 'minimumThickness', errs, { min: 0.5, max: 100, unit: 'mm' });
      const nozzlesWeight = parseTagged(inputs.nozzlesWeight, 'nozzlesWeight', errs, { min: 0, max: 1e5, unit: 'kg', required: true })!;
      const internalsWeight = parseTagged(inputs.internalsWeight, 'internalsWeight', errs, { min: 0, max: 1e6, unit: 'kg', required: true })!;
      const supportsWeight = parseTagged(inputs.supportsWeight, 'supportsWeight', errs, { min: 0, max: 1e6, unit: 'kg', required: true })!;
      const insulationWeight = parseTagged(inputs.insulationWeight, 'insulationWeight', errs, { min: 0, max: 1e5, unit: 'kg' });
      const headBlankFactor = parseTagged(inputs.headBlankFactor, 'headBlankFactor', errs, { min: 0.5, max: 3, unit: '-', required: true })!;
      const rhoOp = parseTagged(inputs.operatingLiquidDensity, 'operatingLiquidDensity', errs, { min: 1, max: 20000, unit: 'kg/m3', required: true })!;
      const rhoW = parseTagged(inputs.waterDensity, 'waterDensity', errs, { min: 900, max: 1100, unit: 'kg/m3', required: true })!;
      const erection = parseTagged(inputs.erectionAllowance, 'erectionAllowance', errs, { min: 0, max: 1e5, unit: 'kg' });

      // Centralized Assumed scan — any Assumed tagged input ⇒ pending_validation
      const taggedInputs: [string, TaggedValue | undefined][] = [
        ['designPressure', pd], ['operatingPressure', pop], ['designTemperature', td], ['operatingTemperature', top],
        ['material.allowableStress', material.allowableStress], ['material.density', material.density], ['material.corrosionAllowance', material.corrosionAllowance],
        ['jointEfficiency', E], ['headDepth', headDepthIn], ['headVolume', headVolumeIn], ['customHeadThickness', customHeadThk],
        ['torisphericalGeometry.crownRadius', crownRadius], ['torisphericalGeometry.knuckleRadius', knuckleRadius],
        ['minimumThickness', minThk], ['nozzlesWeight', nozzlesWeight], ['internalsWeight', internalsWeight],
        ['supportsWeight', supportsWeight], ['insulationWeight', insulationWeight], ['headBlankFactor', headBlankFactor],
        ['operatingLiquidDensity', rhoOp], ['waterDensity', rhoW], ['erectionAllowance', erection],
      ];
      if (geometry.operatingLiquidBasis !== 'liquid_full') taggedInputs.push(['geometry.operatingLiquidBasis.holdupFraction', geometry.operatingLiquidBasis.holdupFraction]);
      for (const [name, t] of taggedInputs) {
        if (t?.sourceType === 'Assumed') {
          notePending();
          assumptions.push({ assumption: `${name} = ${t.value} ${t.unit ?? ''} is ASSUMED`, sourceType: t.sourceType, sourceReference: t.sourceReference, consequence: 'Dependent results are Pending Validation' });
        }
      }
      // Complete Assumed pre-pass — plate series, DN series, project defaults,
      // leg criteria and every per-nozzle tagged input are registered BEFORE
      // any result item is constructed, so run status and every item status
      // derive from one immutable assumption set (no ordering hazards).
      const registerAssumed = (name: string, t: TaggedValue | undefined, consequence: string) => {
        if (t?.sourceType === 'Assumed') {
          notePending();
          assumptions.push({ assumption: `${name} = ${t.value} ${t.unit ?? ''} is ASSUMED`, sourceType: t.sourceType, sourceReference: t.sourceReference, consequence });
        }
      };
      const ps = inputs.plateThicknessSeries as { values_mm: number[]; sourceType: SourceType; sourceReference: string } | undefined | null;
      if (ps?.sourceType === 'Assumed') { notePending(); assumptions.push({ assumption: 'Plate-thickness series is ASSUMED', sourceType: ps.sourceType, sourceReference: ps.sourceReference, consequence: 'Selected thicknesses are Pending Validation' }); }
      const nd = (inputs.nozzleDefaults ?? {}) as Record<string, unknown>;
      const dnSeriesRaw = nd.dnSeries as { values: number[]; sourceType: SourceType; sourceReference: string } | undefined;
      if (dnSeriesRaw?.sourceType === 'Assumed') { notePending(); assumptions.push({ assumption: 'Nozzle DN series is ASSUMED', sourceType: dnSeriesRaw.sourceType, sourceReference: dnSeriesRaw.sourceReference, consequence: 'Screened nozzle sizes are Pending Validation' }); }
      const defProjection = nd.projection !== undefined && nd.projection !== null ? parseTagged(nd.projection, 'nozzleDefaults.projection', errs, { min: 50, max: 2000, unit: 'mm', required: true }) : undefined;
      registerAssumed('Default nozzle projection', defProjection, 'Nozzle projections are Pending Validation');
      const supportOverride = inputs.supportOverride as SupportType | undefined;
      let legMaxH: TaggedValue | undefined; let legMaxW: TaggedValue | undefined;
      if (supportOverride === 'legs') {
        const lc = inputs.legCriteria as Record<string, unknown>;
        legMaxH = parseTagged(lc.maxHeight, 'legCriteria.maxHeight', errs, { min: 0.5, max: 50, unit: 'm', required: true })!;
        legMaxW = parseTagged(lc.maxWeight, 'legCriteria.maxWeight', errs, { min: 100, max: 1e6, unit: 'kg', required: true })!;
        registerAssumed('legCriteria.maxHeight', legMaxH, 'Leg applicability checks are Pending Validation');
        registerAssumed('legCriteria.maxWeight', legMaxW, 'Leg applicability checks are Pending Validation');
      }
      interface ParsedNozzle { raw: Record<string, unknown>; size?: TaggedValue; Q?: TaggedValue; v?: TaggedValue; projection?: TaggedValue }
      const parsedNozzles: ParsedNozzle[] = (inputs.nozzles as Record<string, unknown>[]).map((nz, idx) => {
        const label = `Nozzle #${idx + 1} (${String(nz.service)})`;
        const size = nz.size !== undefined && nz.size !== null ? parseTagged(nz.size, `nozzles[${idx}].size`, errs, { min: 8, max: 2000, unit: 'DN', required: true }) : undefined;
        registerAssumed(`${label} size`, size, 'Nozzle size is Pending Validation');
        const ffs = nz.flowForSizing as Record<string, unknown> | undefined;
        const Q = ffs ? parseTagged(ffs.volumetricFlow, `nozzles[${idx}].flowForSizing.volumetricFlow`, errs, { min: 0.0001, max: 100000, unit: 'm3/h', required: true }) : undefined;
        const v = ffs ? parseTagged(ffs.designVelocity, `nozzles[${idx}].flowForSizing.designVelocity`, errs, { min: 0.01, max: 50, unit: 'm/s', required: true }) : undefined;
        registerAssumed(`${label} sizing flow`, Q, 'Nozzle size is Pending Validation');
        registerAssumed(`${label} sizing velocity`, v, 'Nozzle size is Pending Validation');
        const projection = nz.projection !== undefined && nz.projection !== null ? parseTagged(nz.projection, `nozzles[${idx}].projection`, errs, { min: 50, max: 2000, unit: 'mm', required: true }) : undefined;
        registerAssumed(`${label} projection`, projection, 'Projection is Pending Validation');
        return { raw: nz, size, Q, v, projection };
      });

      // Assumption set is now complete and immutable for status derivation.
      const anyInputAssumed = () => assumptions.length > 0;
      const baseStatus: () => Classification = () => (anyInputAssumed() ? 'Pending Validation' : 'Calculated Screening Result');

      const D = geometry.insideDiameter;           // m
      const D_mm = D * 1000;
      const R_mm = D_mm / 2;
      const P = pd.value * BARG_TO_MPA;            // MPa
      const S = material.allowableStress.value;    // MPa
      const CA = material.corrosionAllowance.value; // mm
      const SE = S * E.value;

      // ── MEC-001 Design conditions ───────────────────────────────────────────
      const designConditions = {
        designPressure: item('MEC-001', pd.value, 'barg', sourceOf(pd), baseStatus(), `Design pressure ≥ operating pressure ${pop.value} barg — margin engineer-set`),
        operatingPressure: item('MEC-001', pop.value, 'barg', sourceOf(pop), baseStatus(), 'Entered operating pressure'),
        designTemperature: item('MEC-001', td.value, 'C', sourceOf(td), baseStatus(), `Design temperature ≥ operating temperature ${top.value} °C`),
        operatingTemperature: item('MEC-001', top.value, 'C', sourceOf(top), baseStatus(), 'Entered operating temperature'),
        corrosionAllowance: item('MEC-001', CA, 'mm', sourceOf(material.corrosionAllowance), baseStatus(), 'Corrosion allowance from the Material Interface'),
        material: {   // R2 — Material Interface echoed in full
          materialName: material.materialName,
          materialSpecification: material.materialSpecification,
          materialGrade: material.materialGrade,
          allowableStress: item('MEC-001', S, 'MPa', sourceOf(material.allowableStress), baseStatus(), `Engineer-entered allowable stress at design temperature ${td.value} °C — the engine never looks up S from a material name (ASME Section II hook reserved)`),
          density: item('MEC-001', material.density.value, 'kg/m3', sourceOf(material.density), baseStatus(), 'Material density for weight estimation'),
          corrosionAllowance: item('MEC-001', CA, 'mm', sourceOf(material.corrosionAllowance), baseStatus(), 'Corrosion allowance'),
          source: material.source,
        },
        jointEfficiency: item('MEC-001', E.value, '-', sourceOf(E), baseStatus(), 'Entered joint efficiency, 0 < E ≤ 1'),
        designCode: item('MEC-001', designCode, '-', 'Engineer-declared placeholder', 'Calculated Screening Result', 'Placeholder only — no code calculation is performed in C6; code methods register as future ThicknessMethods'),
        thicknessMethod: THICKNESS_METHOD,
      };

      // ── MEC-002 Geometry adoption + head depth (R3) ─────────────────────────
      let headDepth: number | null;
      let headDepthSource: string;
      switch (headType) {
        case 'ellipsoidal_2_1': headDepth = D / 4; headDepthSource = 'h = D/4 (2:1 ellipsoidal)'; break;
        case 'hemispherical': headDepth = D / 2; headDepthSource = 'h = D/2 (hemispherical)'; break;
        case 'flat': headDepth = 0; headDepthSource = 'h = 0 (flat)'; break;
        case 'torispherical': headDepth = headDepthIn!.value; headDepthSource = `Entered dish depth (${sourceOf(headDepthIn!)}) — dish geometry L=${crownRadius!.value} m, r=${knuckleRadius!.value} m`; break;
        case 'custom': headDepth = headDepthIn!.value; headDepthSource = `Entered custom head depth (${sourceOf(headDepthIn!)})`; break;
      }
      const Lss = geometry.tangentToTangent; // straight shell length = T/T
      const geometryOut = {
        adoptedFrom: { ...geometry.sourceEngine, sourceRunReference: geometry.sourceRunReference, note: 'Geometry adopted from the selected technology result — never re-entered' },
        orientation: item('MEC-002', orientation, '-', 'Explicit mandatory input — never inferred (Refinement 1)', 'Calculated Screening Result', 'Vessel orientation'),
        insideDiameter: item('MEC-002', D, 'm', `Adopted from ${geometry.sourceEngine.engineId} v${geometry.sourceEngine.engineVersion} (${geometry.sourceRunReference})`, baseStatus(), 'Inside diameter'),
        tangentToTangentHeight: item('MEC-002', geometry.tangentToTangent, 'm', `Adopted from ${geometry.sourceEngine.engineId} (${geometry.sourceRunReference})`, baseStatus(), 'Tangent-to-tangent height (heads excluded)'),
        overallVesselHeight: item('MEC-002', geometry.overallVesselHeight, 'm', `Adopted from ${geometry.sourceEngine.engineId} (${geometry.sourceRunReference})`, baseStatus(), 'Overall vessel height'),
        straightShellLength: item('MEC-002', Lss, 'm', 'L_ss = tangent-to-tangent height', baseStatus(), 'Straight shell length'),
        headType: item('MEC-002', headType, '-', 'Engineer-selected', 'Calculated Screening Result', `Head type (supported: ${HEAD_TYPES.join(', ')})`),
        headDepth: item('MEC-002', headDepth, 'm', headDepthSource, baseStatus(), 'Head depth determined from the selected head type (Refinement 3)'),
      };

      // ── MEC-003 / MEC-004 thickness screening ───────────────────────────────
      const thinWallGate = (t_mm: number, label: string): { ok: boolean; note: string } => {
        const ratio = t_mm / R_mm;
        if (ratio > THIN_WALL_LIMIT) {
          pushWarning('THIN_WALL_LIMIT_EXCEEDED', `${label}: t/R = ${ratio.toFixed(3)} > ${THIN_WALL_LIMIT} — thin-wall membrane screening is outside its validity; a thick-wall code method is required.`);
          return { ok: false, note: `t/R = ${ratio.toFixed(3)} > ${THIN_WALL_LIMIT} — outside thin-wall validity` };
        }
        return { ok: true, note: `t/R = ${ratio.toFixed(4)} ≤ ${THIN_WALL_LIMIT} — thin-wall screening valid` };
      };

      const tShellCalc = (P * R_mm) / (SE - 0.6 * P);
      const shellGate = thinWallGate(tShellCalc, 'Shell');

      let tHeadCalc: number | null = null;
      let headFormula = '';
      let headThkStatus: Classification = baseStatus();
      let headThkNote = '';
      const headWarnings: string[] = [];
      switch (headType) {
        case 'ellipsoidal_2_1':
          tHeadCalc = (P * D_mm) / (2 * SE - 0.2 * P);
          headFormula = 't = P·D/(2·S·E − 0.2·P) — 2:1 ellipsoidal membrane screening';
          break;
        case 'hemispherical':
          tHeadCalc = (P * R_mm) / (2 * SE - 0.2 * P);
          headFormula = 't = P·R/(2·S·E − 0.2·P) — hemispherical membrane screening';
          break;
        case 'torispherical':
          tHeadCalc = (0.885 * P * crownRadius!.value * 1000) / (SE - 0.1 * P);
          headFormula = `t = 0.885·P·L/(S·E − 0.1·P), L = ${crownRadius!.value} m (${sourceOf(crownRadius!)}) — torispherical membrane screening`;
          break;
        case 'flat':
          tHeadCalc = null;
          headFormula = 'Flat-cover thickness requires a code method (not shipped in C6)';
          headThkStatus = 'Not Calculable';
          headThkNote = 'FLAT_HEAD_REQUIRES_CODE_METHOD — no screening formula exists for flat covers; never assumed';
          pushWarning('FLAT_HEAD_REQUIRES_CODE_METHOD', 'Flat head selected — thickness requires a code flat-cover method (future ThicknessMethod).');
          headWarnings.push('Flat head thickness Not Calculable without a code method');
          break;
        case 'custom':
          if (customHeadThk) {
            tHeadCalc = customHeadThk.value;
            headFormula = `Engineer-entered custom head thickness (${sourceOf(customHeadThk)}) — no screening formula exists for arbitrary geometry`;
          } else {
            tHeadCalc = null;
            headFormula = 'Custom head — thickness must be engineer-entered (customHeadThickness)';
            headThkStatus = 'Not Calculable';
            headThkNote = 'CUSTOM_HEAD_THICKNESS_NOT_ENTERED — no screening formula for custom geometry; never assumed';
            pushWarning('CUSTOM_HEAD_THICKNESS_NOT_ENTERED', 'Custom head selected without customHeadThickness — head thickness Not Calculable.');
          }
          break;
      }
      const headGate = tHeadCalc !== null && headType !== 'custom' ? thinWallGate(tHeadCalc, 'Head') : { ok: true, note: 'Gate not applicable' };

      const shellStatus: Classification = shellGate.ok ? baseStatus() : 'Not Calculable';
      if (tHeadCalc !== null && !headGate.ok) { headThkStatus = 'Not Calculable'; headThkNote = headGate.note; }

      // ── MEC-005 thickness selection ─────────────────────────────────────────
      const selectFromSeries = (tReq: number, label: string): { selected: number | null; note: string; status: Classification } => {
        if (!ps) { pushWarning('NO_PLATE_SERIES_DATA', `${label}: no plate-thickness series entered — required thickness reported, selection Not Calculable.`); return { selected: null, note: 'No plate series entered — selection Not Calculable (NO_PLATE_SERIES_DATA)', status: 'Not Calculable' }; }
        const floor = minThk ? Math.max(tReq, minThk.value) : tReq;
        const sel = ps.values_mm.find((v) => v >= floor - 1e-9);
        if (sel === undefined) { pushWarning('PLATE_SERIES_EXCEEDED', `${label}: required ${floor.toFixed(2)} mm exceeds the entered plate series maximum ${ps.values_mm[ps.values_mm.length - 1]} mm.`); return { selected: null, note: `Required ${floor.toFixed(2)} mm exceeds series maximum — Not Calculable`, status: 'Not Calculable' }; }
        return { selected: sel, note: `Next plate ≥ ${floor.toFixed(3)} mm from entered series (${ps.sourceType}: ${ps.sourceReference})${minThk ? `, minimum-thickness floor ${minThk.value} mm (${sourceOf(minThk)})` : ''}`, status: ps.sourceType === 'Assumed' ? 'Pending Validation' : baseStatus() };
      };
      const tShellReq = shellGate.ok ? tShellCalc + CA : null;
      const shellSel = tShellReq !== null ? selectFromSeries(tShellReq, 'Shell') : { selected: null, note: shellGate.note, status: 'Not Calculable' as Classification };
      const tHeadReq = tHeadCalc !== null && headThkStatus !== 'Not Calculable' ? tHeadCalc + CA : (headType === 'custom' && customHeadThk ? customHeadThk.value + CA : null);
      const headSel = tHeadReq !== null ? selectFromSeries(tHeadReq, 'Head') : { selected: null, note: headThkNote || 'Head calculated thickness unavailable', status: 'Not Calculable' as Classification };

      const shellDesign = {
        thicknessMethod: THICKNESS_METHOD,
        shellThicknessCalculated: item('MEC-003', shellGate.ok ? tShellCalc : null, 'mm', `t = P·R/(S·E − 0.6·P); P = ${P.toFixed(4)} MPa (${pd.value} barg × 0.1), R = ${R_mm.toFixed(1)} mm, S = ${S} MPa (${sourceOf(material.allowableStress)}), E = ${E.value}`, shellStatus, shellGate.ok ? `Thin-wall membrane screening pending code calculation; ${shellGate.note}` : shellGate.note, shellGate.ok ? [] : ['Outside thin-wall validity — code method required']),
        headThicknessCalculated: item('MEC-004', tHeadCalc, 'mm', headFormula, headThkStatus, headThkNote || `Membrane screening pending code calculation; ${headGate.note}`, headWarnings),
        corrosionAllowanceAdded: item('MEC-005', CA, 'mm', sourceOf(material.corrosionAllowance), baseStatus(), 'Added to every calculated thickness before plate selection'),
        shellThicknessRequired: item('MEC-005', tShellReq, 'mm', 't_req = t_calc + CA', shellSel.status === 'Not Calculable' && tShellReq === null ? 'Not Calculable' : baseStatus(), 'Required thickness before plate selection'),
        headThicknessRequired: item('MEC-005', tHeadReq, 'mm', 't_req = t_calc + CA', tHeadReq === null ? 'Not Calculable' : baseStatus(), 'Required head thickness before plate selection'),
        shellThicknessSelected: item('MEC-005', shellSel.selected, 'mm', shellSel.note, shellSel.status, 'Selected shell plate thickness'),
        headThicknessSelected: item('MEC-005', headSel.selected, 'mm', headSel.note, headSel.status, 'Selected head plate thickness'),
      };

      // ── MEC-006 Nozzle schedule (R4) ────────────────────────────────────────
      const defOf = (k: string): string | null => (typeof nd[k] === 'string' && (nd[k] as string).trim() ? nd[k] as string : null);

      let tagSeq = 0;
      const nozzleSchedule = parsedNozzles.map((pn) => {
        const nz = pn.raw;
        tagSeq += 1;
        const tag = typeof nz.tag === 'string' && (nz.tag as string).trim() ? nz.tag as string : `N${tagSeq}`;
        const service = nz.service as string;
        const sizeEntered = pn.size;
        let sizeItem: ResultItem;
        if (sizeEntered) {
          sizeItem = item('MEC-006', sizeEntered.value, 'DN', sourceOf(sizeEntered), sizeEntered.sourceType === 'Assumed' ? 'Pending Validation' : baseStatus(), 'Engineer-entered nozzle size');
        } else {
          if (pn.Q && pn.v) {
            const Q = pn.Q; const v = pn.v;
            const d_mm = Math.sqrt((4 * (Q.value / 3600)) / (Math.PI * v.value)) * 1000;
            if (dnSeriesRaw) {
              const dn = dnSeriesRaw.values.find((x) => x >= d_mm - 1e-9);
              if (dn !== undefined) {
                sizeItem = item('MEC-006', dn, 'DN', `d = √(4·Q/(π·v)) = ${d_mm.toFixed(1)} mm; Q = ${Q.value} m³/h (${sourceOf(Q)}), v = ${v.value} m/s (${sourceOf(v)}); next DN from entered series (${dnSeriesRaw.sourceType}: ${dnSeriesRaw.sourceReference})`, Q.sourceType === 'Assumed' || v.sourceType === 'Assumed' || dnSeriesRaw.sourceType === 'Assumed' ? 'Pending Validation' : baseStatus(), 'Screened line size — confirm with piping engineering');
              } else {
                sizeItem = item('MEC-006', null, 'DN', `Calculated bore ${d_mm.toFixed(1)} mm exceeds the entered DN series maximum`, 'Not Calculable', 'DN series exceeded — Not Calculable');
                pushWarning('DN_SERIES_EXCEEDED', `Nozzle ${tag} (${service}): calculated bore ${d_mm.toFixed(1)} mm exceeds the entered DN series.`);
              }
            } else {
              sizeItem = item('MEC-006', null, 'DN', `Calculated bore ${d_mm.toFixed(1)} mm — no DN series entered`, 'Not Calculable', 'NO_DN_SERIES_DATA — bore reported, commercial size Not Calculable');
              pushWarning('NO_DN_SERIES_DATA', `Nozzle ${tag} (${service}): no DN series entered — commercial size Not Calculable.`);
            }
          } else {
            sizeItem = item('MEC-006', null, 'DN', 'No size entered and no flowForSizing data', 'Not Calculable', 'Size Not Calculable — never assumed');
            pushWarning('NOZZLE_SIZE_MISSING', `Nozzle ${tag} (${service}): no size and no sizing basis entered.`);
          }
        }
        const projTagged = pn.projection ?? defProjection;
        const strOr = (own: unknown, defKey: string): string | null => (typeof own === 'string' && (own as string).trim() ? own as string : defOf(defKey));
        const rating = strOr(nz.rating, 'rating');
        const facing = strOr(nz.facing, 'facing');
        const flangeClass = strOr(nz.flangeClass, 'flangeClass');
        const flangeStandard = strOr(nz.flangeStandard, 'flangeStandard');
        for (const [label, val, code] of [['Rating', rating, 'NOZZLE_RATING_MISSING'], ['Facing', facing, 'NOZZLE_FACING_MISSING'], ['Flange class', flangeClass, 'NOZZLE_FLANGE_CLASS_MISSING'], ['Flange standard', flangeStandard, 'NOZZLE_FLANGE_STANDARD_MISSING']] as const) {
          if (val === null) pushWarning(code, `Nozzle ${tag} (${service}): ${label} not entered (no per-nozzle value and no project default) — never invented.`);
        }
        return {
          tag, service,
          size: sizeItem,
          rating: rating ?? 'NOT ENTERED',
          facing: facing ?? 'NOT ENTERED',
          projection: projTagged ? item('MEC-006', projTagged.value, 'mm', sourceOf(projTagged), projTagged.sourceType === 'Assumed' ? 'Pending Validation' : baseStatus(), 'Nozzle projection (Refinement 4)') : item('MEC-006', null, 'mm', 'Not entered', 'Not Calculable', 'Projection not entered — never assumed'),
          flangeClass: flangeClass ?? 'NOT ENTERED',
          flangeStandard: flangeStandard ?? 'NOT ENTERED',
          remarks: `${typeof nz.remarks === 'string' && (nz.remarks as string).trim() ? `${nz.remarks} — ` : ''}No reinforcement calculation performed (future code method)`,
        };
      });

      // ── MEC-007 Support selection ───────────────────────────────────────────
      let supportSelected: SupportType;
      let supportBasis: string;
      const rejected: { type: SupportType; reason: string }[] = [];
      if (supportOverride) {
        supportSelected = supportOverride;
        supportBasis = `Engineer-selected override ('${supportOverride}')${supportOverride === 'legs' ? ' — leg criteria entered and gated' : ''}`;
      } else if (orientation === 'vertical') {
        supportSelected = 'skirt';
        supportBasis = 'Vertical process column ⇒ skirt (industry practice for process columns; overridable by engineer selection)';
        rejected.push({ type: 'legs', reason: 'Permitted only with engineer-entered height/weight criteria' }, { type: 'lug', reason: 'Only by explicit engineer selection' }, { type: 'saddle', reason: 'Horizontal vessels only' });
      } else {
        supportSelected = 'saddle';
        supportBasis = 'Horizontal vessel ⇒ 2 saddles (industry practice; overridable by engineer selection)';
        rejected.push({ type: 'skirt', reason: 'Vertical vessels only' }, { type: 'legs', reason: 'Permitted only with engineer-entered criteria' }, { type: 'lug', reason: 'Only by explicit engineer selection' });
      }
      const support = {
        selection: item('MEC-007', supportSelected, '-', supportBasis, 'Calculated Screening Result', 'Support type selection — NO structural calculation performed', ['No detailed support design — screening selection only']),
        quantity: supportSelected === 'saddle' ? 2 : (supportSelected === 'legs' ? null : 1),
        rejectedAlternatives: rejected,
      };
      if (supportOverride === 'legs' && legMaxH && legMaxW) {
        if (geometry.overallVesselHeight > legMaxH.value) pushWarning('LEG_HEIGHT_CRITERION_EXCEEDED', `Overall vessel height ${geometry.overallVesselHeight} m exceeds the entered leg criterion ${legMaxH.value} m (${sourceOf(legMaxH)}).`);
        (support as Record<string, unknown>).legCriteria = { maxHeight: item('MEC-007', legMaxH.value, 'm', sourceOf(legMaxH), baseStatus(), 'Engineer-entered leg height criterion'), maxWeight: item('MEC-007', legMaxW.value, 'kg', sourceOf(legMaxW), baseStatus(), 'Engineer-entered leg weight criterion — checked against empty weight below') };
      }

      // ── MEC-008 Weights (R5 complete breakdown) ─────────────────────────────
      const rhoSteel = material.density.value;
      const tShell_m = shellSel.selected !== null ? shellSel.selected / 1000 : null;
      const tHead_m = headSel.selected !== null ? headSel.selected / 1000 : null;
      const wStatus: Classification = baseStatus();

      const shellWeight = tShell_m !== null ? Math.PI * (D + tShell_m) * tShell_m * Lss * rhoSteel : null;
      const headsWeight = tHead_m !== null ? 2 * headBlankFactor.value * D * D * tHead_m * rhoSteel : null;
      const insWeight = insulationWeight ? insulationWeight.value : 0;
      const emptyWeight = shellWeight !== null && headsWeight !== null
        ? shellWeight + headsWeight + nozzlesWeight.value + internalsWeight.value + supportsWeight.value + insWeight
        : null;
      if (emptyWeight === null) pushWarning('WEIGHTS_NOT_CALCULABLE', 'Empty weight Not Calculable — selected shell/head thickness unavailable (see MEC-005).');

      let headVolEach: number | null;
      let headVolSource: string;
      switch (headType) {
        case 'ellipsoidal_2_1': headVolEach = Math.PI * D ** 3 / 24; headVolSource = 'V_head = π·D³/24 (2:1 ellipsoidal)'; break;
        case 'hemispherical': headVolEach = Math.PI * D ** 3 / 12; headVolSource = 'V_head = π·D³/12 (hemispherical)'; break;
        case 'flat': headVolEach = 0; headVolSource = 'V_head = 0 (flat)'; break;
        default: headVolEach = headVolumeIn ? headVolumeIn.value : null; headVolSource = headVolumeIn ? `Entered head volume (${sourceOf(headVolumeIn)})` : 'Head volume not entered — Not Calculable';
      }
      const vesselVolume = headVolEach !== null ? (Math.PI / 4) * D * D * Lss + 2 * headVolEach : null;
      const holdupFactor = geometry.operatingLiquidBasis === 'liquid_full' ? 1 : geometry.operatingLiquidBasis.holdupFraction.value;
      const operatingLiquid = vesselVolume !== null ? vesselVolume * holdupFactor * rhoOp.value : null;
      const hydroWater = vesselVolume !== null ? vesselVolume * rhoW.value : null;
      const operatingWeight = emptyWeight !== null && operatingLiquid !== null ? emptyWeight + operatingLiquid : null;
      const hydrotestWeight = emptyWeight !== null && hydroWater !== null ? emptyWeight + hydroWater : null;

      const nn = (v: number | null): Classification => (v === null ? 'Not Calculable' : wStatus);
      const weights = {
        shell: item('MEC-008', shellWeight, 'kg', `π·(D + t)·t·L_ss·ρ; t = selected shell plate, ρ = ${rhoSteel} kg/m³ (${sourceOf(material.density)})`, nn(shellWeight), 'Shell weight from selected thickness'),
        heads: item('MEC-008', headsWeight, 'kg', `2 × k_blank ${headBlankFactor.value} (${sourceOf(headBlankFactor)}) × D² × t × ρ`, nn(headsWeight), 'Head weights from entered blank-mass factor — never hard-coded'),
        nozzles: item('MEC-008', nozzlesWeight.value, 'kg', sourceOf(nozzlesWeight), wStatus, 'Entered nozzles/manways weight allowance'),
        internals: item('MEC-008', internalsWeight.value, 'kg', sourceOf(internalsWeight), wStatus, 'Entered internals weight'),
        supports: item('MEC-008', supportsWeight.value, 'kg', sourceOf(supportsWeight), wStatus, 'Entered support-structure weight'),
        insulation: insulationWeight
          ? item('MEC-008', insulationWeight.value, 'kg', sourceOf(insulationWeight), wStatus, 'Entered insulation weight (optional)')
          : item('MEC-008', 0, 'kg', 'Not entered — insulation weight taken as 0 with explicit note (optional item)', 'Calculated Screening Result', 'No insulation entered'),
        futurePlatforms: item('MEC-008', null, 'kg', 'PLACEHOLDER — platforms/ladders not designed in C6', 'Not Calculable', 'Reserved placeholder (Refinement 5) — populated by a future platform/ladder module'),
        emptyWeight: item('MEC-008', emptyWeight, 'kg', 'Σ shell + heads + nozzles + internals + supports + insulation', nn(emptyWeight), 'Empty (fabricated) weight estimate'),
        vesselVolume: item('MEC-008', vesselVolume, 'm3', `π/4·D²·L_ss + 2·V_head; ${headVolSource}`, nn(vesselVolume), 'Geometric vessel volume'),
        operatingWeight: item('MEC-008', operatingWeight, 'kg', `Empty + V × ${holdupFactor === 1 ? 'liquid-full' : `holdup ${holdupFactor}`} × ρ_op ${rhoOp.value} kg/m³ (${sourceOf(rhoOp)})`, nn(operatingWeight), 'Operating weight estimate'),
        hydrotestWeight: item('MEC-008', hydrotestWeight, 'kg', `Empty + V × ρ_w ${rhoW.value} kg/m³ (${sourceOf(rhoW)})`, nn(hydrotestWeight), 'Hydrotest (water-full) weight estimate'),
      };
      if (supportOverride === 'legs' && emptyWeight !== null && legMaxW) {
        if (emptyWeight > legMaxW.value) pushWarning('LEG_WEIGHT_CRITERION_EXCEEDED', `Empty weight ${emptyWeight.toFixed(0)} kg exceeds the entered leg criterion ${legMaxW.value} kg.`);
      }

      // ── MEC-009 Lifting (preliminary) ───────────────────────────────────────
      pushWarning('LIFTING_NOT_VERIFIED', 'Lifting arrangement is a preliminary rigging convention — NO structural verification performed.');
      const erectionWeight = emptyWeight !== null ? emptyWeight + (erection ? erection.value : 0) : null;
      const lifting = orientation === 'vertical'
        ? {
            lugQuantity: item('MEC-009', 3, 'off', 'Rigging convention: 2 top lifting lugs + 1 tailing lug (vertical vessel)', 'Calculated Screening Result', 'Quantity only — no structural verification', ['LIFTING_NOT_VERIFIED']),
            suggestedLocations: ['Top lifting lug 1 — top-head tangent line, 0°', 'Top lifting lug 2 — top-head tangent line, 180°', 'Tailing lug — skirt/base, 0°'],
            erectionWeight: item('MEC-009', erectionWeight, 'kg', `Empty weight${erection ? ` + erection allowance ${erection.value} kg (${sourceOf(erection)})` : ' (no erection allowance entered)'}`, erectionWeight === null ? 'Not Calculable' : wStatus, 'Preliminary erection weight'),
          }
        : {
            lugQuantity: item('MEC-009', 2, 'off', 'Rigging convention: 2 lifting lugs above the saddles (horizontal vessel)', 'Calculated Screening Result', 'Quantity only — no structural verification', ['LIFTING_NOT_VERIFIED']),
            suggestedLocations: ['Lifting lug 1 — shell top, above saddle 1', 'Lifting lug 2 — shell top, above saddle 2'],
            erectionWeight: item('MEC-009', erectionWeight, 'kg', `Empty weight${erection ? ` + erection allowance ${erection.value} kg (${sourceOf(erection)})` : ' (no erection allowance entered)'}`, erectionWeight === null ? 'Not Calculable' : wStatus, 'Preliminary erection weight'),
          };

      // ── R6 Reserved architecture placeholders (no implementation) ───────────
      const reservedNote = (name: string) => ({ status: 'reserved', implemented: false, note: `${name} analysis is a reserved architecture placeholder — registers as a future analysis method without changing the C6 workflow or output schema` });
      const futureAnalyses = {
        windLoad: reservedNote('Wind load'),
        seismicLoad: reservedNote('Seismic load'),
        transportation: reservedNote('Transportation'),
        foundationLoad: reservedNote('Foundation load'),
        nozzleLoad: reservedNote('Nozzle load'),
      };

      // ── MEC-010 Validation checklist ────────────────────────────────────────
      const calculationRunStatus = anyPending ? 'pending_validation' : 'screening_complete';
      const checklist = {
        geometryComplete: { pass: true, evidence: `Adopted from ${geometry.sourceEngine.engineId} v${geometry.sourceEngine.engineVersion}, run ${geometry.sourceRunReference}` },
        thicknessCalculated: { pass: shellGate.ok && tShellReq !== null, evidence: shellGate.ok ? `Shell t_calc ${tShellCalc.toFixed(3)} mm (${THICKNESS_METHOD})` : shellGate.note },
        mandatoryNozzlesDefined: { pass: true, evidence: `${nozzleSchedule.length} nozzles; mandatory services enforced at validation` },
        supportSelected: { pass: true, evidence: `${supportSelected} — ${supportBasis}` },
        weightsCalculated: { pass: emptyWeight !== null && operatingWeight !== null && hydrotestWeight !== null, evidence: emptyWeight !== null ? `Empty ${emptyWeight.toFixed(1)} kg / Operating ${operatingWeight?.toFixed(1)} kg / Hydrotest ${hydrotestWeight?.toFixed(1)} kg` : 'Not Calculable — see MEC-005/MEC-008' },
        mechanicalAssumptionsAcknowledged: { pass: assumptions.length === 0 || calculationRunStatus === 'pending_validation', evidence: assumptions.length === 0 ? 'No Assumed inputs' : `${assumptions.length} Assumed input(s) registered; run flagged pending_validation` },
      };

      // ── MEC-010 Mechanical summary ──────────────────────────────────────────
      const mechanicalSummary = {
        vesselDimensions: { insideDiameter_m: D, tangentToTangent_m: geometry.tangentToTangent, overallHeight_m: geometry.overallVesselHeight, straightShell_m: Lss, headType, headDepth_m: headDepth, orientation },
        thicknessSummary: { method: THICKNESS_METHOD, shellSelected_mm: shellSel.selected, headSelected_mm: headSel.selected, corrosionAllowance_mm: CA },
        weightSummary: { empty_kg: emptyWeight, operating_kg: operatingWeight, hydrotest_kg: hydrotestWeight },
        supportSummary: { type: supportSelected, quantity: support.quantity, basis: supportBasis },
        nozzleSummary: nozzleSchedule.map((n) => ({ tag: n.tag, service: n.service, size: n.size.result, rating: n.rating, flangeClass: n.flangeClass, flangeStandard: n.flangeStandard })),
      };

      // ── R7 Mechanical Datasheet (structured internal engineering object) ────
      const mechanicalDatasheet = {
        datasheetType: 'PRELIMINARY_MECHANICAL_DATASHEET',
        revision: 'SCREENING',
        generatedBy: { engineId: this.getEngineId(), engineVersion: ENGINE_VERSION, computedAt: base.computedAt.toISOString() },
        applicability: APPLICABILITY_STATEMENT,
        service: { sourceEngine: geometry.sourceEngine, sourceRunReference: geometry.sourceRunReference },
        designConditions: {
          designPressure_barg: pd.value, operatingPressure_barg: pop.value,
          designTemperature_C: td.value, operatingTemperature_C: top.value,
          designCode, jointEfficiency: E.value,
        },
        material: {
          materialName: material.materialName, materialSpecification: material.materialSpecification,
          materialGrade: material.materialGrade, allowableStress_MPa: S, density_kg_m3: rhoSteel,
          corrosionAllowance_mm: CA, source: material.source,
        },
        geometry: mechanicalSummary.vesselDimensions,
        thickness: mechanicalSummary.thicknessSummary,
        nozzles: nozzleSchedule.map((n) => ({ tag: n.tag, service: n.service, size_DN: n.size.result, rating: n.rating, facing: n.facing, projection_mm: n.projection.result, flangeClass: n.flangeClass, flangeStandard: n.flangeStandard, remarks: n.remarks })),
        support: mechanicalSummary.supportSummary,
        weights: {
          shell_kg: shellWeight, heads_kg: headsWeight, nozzles_kg: nozzlesWeight.value,
          internals_kg: internalsWeight.value, supports_kg: supportsWeight.value,
          insulation_kg: insWeight, futurePlatforms_kg: null,
          empty_kg: emptyWeight, operating_kg: operatingWeight, hydrotest_kg: hydrotestWeight,
        },
        lifting: { lugQuantity: lifting.lugQuantity.result, suggestedLocations: lifting.suggestedLocations, verified: false },
        futureAnalyses,
        assumptions,
        note: 'Internal engineering object for future report generation — not a PDF and not a fabrication document.',
      };

      const data: Record<string, unknown> = {
        applicabilityStatement: APPLICABILITY_STATEMENT,
        limitations: LIMITATIONS,
        calculationRunStatus,
        designBasis: {
          orientationInput: 'explicit (Refinement 1 — never inferred)',
          sourceEngine: geometry.sourceEngine,
          sourceRunReference: geometry.sourceRunReference,
          thicknessMethod: THICKNESS_METHOD,
          pressureUnitBasis: '1 barg = 0.1 MPa (gauge membrane screening basis)',
        },
        designConditions,
        geometry: geometryOut,
        shellDesign,
        nozzleSchedule,
        support,
        weights,
        lifting,
        futureAnalyses,
        mechanicalSummary,
        mechanicalDatasheet,
        validationChecklist: checklist,
        assumptions,
        engineVersions: { 'mech-vessel': ENGINE_VERSION, sourceEngine: `${geometry.sourceEngine.engineId} v${geometry.sourceEngine.engineVersion}` },
      };

      if (errs.filter((e) => e.severity === 'error').length > 0) {
        return { ...base, status: 'error', data: { calculationRunStatus: 'calculation_blocked' }, warnings, validationIssues: errs };
      }
      return { ...base, status: warnings.length > 0 ? 'warning' : 'success', data, warnings, validationIssues: errs };
    } catch (e) {
      return {
        ...base, status: 'error',
        data: { calculationRunStatus: 'calculation_blocked', error: e instanceof Error ? e.message : String(e) },
        warnings, validationIssues: [{ field: 'calculation', message: e instanceof Error ? e.message : String(e), severity: 'error' }],
      };
    }
  }

  // ── generateSummary ─────────────────────────────────────────────────────────
  generateSummary(results: Record<string, unknown>): DesignSummary {
    const status = results.calculationRunStatus as string | undefined;
    const summary = results.mechanicalSummary as { thicknessSummary?: { shellSelected_mm?: number | null }; weightSummary?: { empty_kg?: number | null } } | undefined;
    const keyResults = [
      summary?.thicknessSummary?.shellSelected_mm != null ? { label: 'Selected shell thickness', value: summary.thicknessSummary.shellSelected_mm, unit: 'mm', highlight: true } : null,
      summary?.weightSummary?.empty_kg != null ? { label: 'Empty weight', value: Math.round(summary.weightSummary.empty_kg), unit: 'kg', highlight: true } : null,
      status ? { label: 'Run status', value: status, highlight: true } : null,
    ].filter(Boolean) as DesignSummary['keyResults'];
    return {
      keyResults,
      recommendations: [
        'PRELIMINARY MECHANICAL SCREENING — NOT A CODE CALCULATION AND NOT FOR FABRICATION.',
        'Perform full code calculations (ASME VIII / EN 13445 / IS 2825), nozzle reinforcement, wind/seismic and support design before fabrication.',
      ],
      warnings: [],
      calculationClass: 'Preliminary Screening',
    };
  }
}
