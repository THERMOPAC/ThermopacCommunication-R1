// ═══════════════════════════════════════════════════════════════════════════════
// ECR-Type Kühni Agitated Extraction Column Engine (Stage C5)
//
// PRELIMINARY ECR-TYPE AGITATED COLUMN SCREENING — NOT VENDOR RATING AND NOT FOR
// FABRICATION.
//
// Implements ECR-001…ECR-009 per the approved Stage C5 basis with the three
// final refinements:
//   R1. Selectable power mixture-density basis: 'continuous_phase' |
//       'volume_averaged' | 'holdup_corrected' (reserved — rejected in C5).
//       The selected basis is recorded with every calculation.
//   R2. Rotor geometry: direct rotorDiameter AND/OR rotorToColumnDiameterRatio;
//       both entered ⇒ must agree within ±1 % else blocked; one entered ⇒ the
//       other is calculated per candidate diameter.
//   R3. Tip-speed assessment classifies against a preferred operating range and
//       the vendor limit: below_preferred_range / preferred_range /
//       above_preferred_range / above_vendor_limit.
//
// Vendor neutral — no proprietary Kühni/Sulzer model; vendor identity is data.
// The C3 generic hydraulic percentage is NEVER reused as ECR utilization.
// No droplet-size prediction from RPM. Rate-based placeholders reserved only.
// ═══════════════════════════════════════════════════════════════════════════════

import {
  IDesignEngine, ValidationResult, ValidationError, CalculationContext,
  CalculationResult, DesignSummary, EngineWarning,
} from '../../engine-framework/types';
import {
  CEL_VERSION, EPD_VERSION,
  getProperty, createPropertyContext, containsAssumedData, EngineeringInputError,
  SOURCE_TYPES, columnCrossSectionArea,
} from '../../engine-framework/common-engineering-library';
import type { SourceType } from '../../engine-framework/epd/types';
import {
  PerformanceBasis, evaluatePerformanceBasis, performanceBasisAssumed, validatePerformanceBasis,
} from '../../engine-framework/packing/database';

// ── Constants ─────────────────────────────────────────────────────────────────

const ENGINE_VERSION = '1.0.0';
const C2_PROCESS_DESIGN_VERSION = '1.0.0';
const C3_HYDRAULICS_COMMON_VERSION = '1.0.0';

const APPLICABILITY_STATEMENT = 'PRELIMINARY ECR-TYPE AGITATED COLUMN SCREENING — NOT VENDOR RATING AND NOT FOR FABRICATION';
const LIMITATIONS = [
  'No proprietary Kühni model',
  'No vendor hydraulic guarantee',
  'No validated droplet breakup/coalescence model',
  'No axial back-mixing model',
  'No rate-based mass-transfer model',
  'No final shaft/seal/bearing design',
  'No mechanical code design',
];

const PHASE_CONFIGS = ['rrbo_continuous_nmp_dispersed', 'nmp_continuous_rrbo_dispersed'] as const;
type PhaseConfig = (typeof PHASE_CONFIGS)[number];
type Classification = 'Calculated Screening Result' | 'Pending Validation' | 'Not Calculable';

const DENSITY_BASES = ['continuous_phase', 'volume_averaged'] as const;
type DensityBasis = (typeof DENSITY_BASES)[number];

const DEFAULT_UTILIZATION_BAND = { min: 40, max: 80 }; // % — configurable criterion, not a universal rule
const G = 9.80665; // m/s2
const SMALL = 1e-12;

// ── Rich result item ──────────────────────────────────────────────────────────

interface ResultItem {
  result: number | string | null;
  units: string;
  source: string;
  status: Classification;
  validation: string;
  warnings: string[];
  formulaReference: string;   // ECR-001…ECR-009
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

function parseTagged(raw: unknown, field: string, errors: ValidationError[], opts: { min: number; max: number; unit: string; required?: boolean; integer?: boolean }): TaggedValue | undefined {
  if (raw === undefined || raw === null) {
    if (opts.required) errors.push({ field, message: `${field} is required: { value (${opts.unit}), unit, sourceType, sourceReference } — source-tagged or explicitly Assumed; never defaulted`, severity: 'error' });
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const value = num(o.value);
  if (value === undefined) { errors.push({ field, message: `${field}.value must be a finite number (${opts.unit})`, severity: 'error' }); return undefined; }
  if (value < opts.min || value > opts.max) { errors.push({ field, message: `${field}.value must be in [${opts.min}, ${opts.max}] ${opts.unit} (got ${value})`, severity: 'error' }); return undefined; }
  if (opts.integer && !Number.isInteger(value)) { errors.push({ field, message: `${field}.value must be an integer`, severity: 'error' }); return undefined; }
  if (o.unit !== undefined && o.unit !== opts.unit) { errors.push({ field, message: `${field}.unit must be '${opts.unit}' (got '${String(o.unit)}')`, severity: 'error' }); return undefined; }
  if (!SOURCE_TYPES.includes(o.sourceType as SourceType)) { errors.push({ field, message: `${field}.sourceType must be one of ${SOURCE_TYPES.join(', ')}`, severity: 'error' }); return undefined; }
  if (typeof o.sourceReference !== 'string' || !o.sourceReference.trim()) { errors.push({ field, message: `${field}.sourceReference is mandatory`, severity: 'error' }); return undefined; }
  return { value, unit: opts.unit, sourceType: o.sourceType as SourceType, sourceReference: o.sourceReference };
}

function sourceOf(t: TaggedValue): string { return `${t.sourceType}: ${t.sourceReference}`; }

const ALLOWANCE_FIELDS = [
  { key: 'topHeadHeight', unit: 'm', min: 0.1, max: 5, label: 'Top Head' },
  { key: 'topDisengagementHeight', unit: 'm', min: 0.1, max: 5, label: 'Top Disengagement' },
  { key: 'topDistributorAllowance', unit: 'm', min: 0.05, max: 2, label: 'Top Distributor' },
  { key: 'bottomDistributorAllowance', unit: 'm', min: 0.05, max: 2, label: 'Bottom Distributor' },
  { key: 'bottomDisengagementHeight', unit: 'm', min: 0.1, max: 5, label: 'Bottom Disengagement' },
  { key: 'bottomHeadHeight', unit: 'm', min: 0.1, max: 5, label: 'Bottom Head' },
  { key: 'driveSealBearingAllowance', unit: 'm', min: 0.1, max: 5, label: 'Drive/Seal/Bearing' },
] as const;

// ── Engine ────────────────────────────────────────────────────────────────────

export class LLXECREngine implements IDesignEngine {
  getEngineId(): string { return 'llx-ecr'; }
  getEngineVersion(): string { return ENGINE_VERSION; }
  getModuleType(): string { return 'llx'; }
  getCalculationType(): string { return 'ecr'; }

  validate(inputs: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = [];
    const err = (field: string, message: string) => errors.push({ field, message, severity: 'error' });
    const warn = (field: string, message: string) => errors.push({ field, message, severity: 'warning' });

    const T = num(inputs.operatingTemperature);
    if (T === undefined || T <= 0 || T >= 300) err('operatingTemperature', 'operatingTemperature (°C) is required, 0 < T < 300');

    for (const c of ['normalCase', 'maximumCase'] as const) {
      const cf = inputs[c] as Record<string, unknown> | undefined;
      const rr = num(cf?.rrboMassFlow_kg_h); const nm = num(cf?.nmpMassFlow_kg_h);
      if (!cf || rr === undefined || rr <= 0 || nm === undefined || nm <= 0) {
        err(c, `${c} { rrboMassFlow_kg_h > 0, nmpMassFlow_kg_h > 0 } is required — normal and maximum cases are independent inputs from the Stage C3 basis`);
      }
    }

    if (!PHASE_CONFIGS.includes(inputs.phaseConfiguration as PhaseConfig)) err('phaseConfiguration', `phaseConfiguration must be one of: ${PHASE_CONFIGS.join(', ')}`);

    // RRBO properties — engineer-entered, source-tagged, never defaulted
    for (const [f, unit] of [['feedDensity', 'kg/m3'], ['feedViscosity', 'Pa.s']] as const) {
      const o = inputs[f] as Record<string, unknown> | undefined;
      if (!o) { err(f, `${f} is required: source-tagged RRBO entry { value (${unit}), referenceTemperatureC, sourceType, sourceReference }. No default RRBO correlations exist.`); continue; }
      const v = num(o.value);
      if (v === undefined || v <= 0) err(`${f}.value`, `${f}.value must be > 0 (${unit})`);
      if (num(o.referenceTemperatureC) === undefined) err(`${f}.referenceTemperatureC`, `${f}.referenceTemperatureC (°C) is required`);
      if (!SOURCE_TYPES.includes(o.sourceType as SourceType)) err(`${f}.sourceType`, `${f}.sourceType must be one of ${SOURCE_TYPES.join(', ')}`);
      if (typeof o.sourceReference !== 'string' || !(o.sourceReference as string).trim()) err(`${f}.sourceReference`, `${f}.sourceReference is mandatory`);
    }
    parseTagged(inputs.continuousPhaseViscosity, 'continuousPhaseViscosity', errors, { min: 1e-5, max: 10, unit: 'Pa.s' });
    if (inputs.phaseConfiguration === 'rrbo_continuous_nmp_dispersed' && inputs.continuousPhaseViscosity === undefined) {
      // RRBO continuous — feedViscosity serves as continuous-phase viscosity; fine.
    }
    if (inputs.phaseConfiguration === 'nmp_continuous_rrbo_dispersed' && (inputs.continuousPhaseViscosity === undefined || inputs.continuousPhaseViscosity === null)) {
      err('continuousPhaseViscosity', 'continuousPhaseViscosity { value (Pa.s), sourceType, sourceReference } is required when NMP is the continuous phase — the rotor Reynolds number needs μ_c and no NMP viscosity is silently taken');
    }
    parseTagged(inputs.interfacialTension, 'interfacialTension', errors, { min: 0.0005, max: 0.1, unit: 'N/m' });

    // Refinement R1 — selectable power mixture-density basis
    const basis = inputs.powerDensityBasis;
    if (basis === 'holdup_corrected') err('powerDensityBasis', "powerDensityBasis 'holdup_corrected' is RESERVED for a future validated-holdup path — Stage C5 supports 'continuous_phase' and 'volume_averaged' only");
    else if (!DENSITY_BASES.includes(basis as DensityBasis)) err('powerDensityBasis', `powerDensityBasis is required and must be one of: ${DENSITY_BASES.join(', ')} ('holdup_corrected' is reserved). Never hard-coded — the selected basis is recorded with every calculation.`);

    // Refinement R2 — rotor geometry: direct diameter and/or ratio
    const rotorD = parseTagged(inputs.rotorDiameter, 'rotorDiameter', errors, { min: 0.05, max: 5, unit: 'm' });
    const ratio = parseTagged(inputs.rotorToColumnDiameterRatio, 'rotorToColumnDiameterRatio', errors, { min: 0.2, max: 0.8, unit: '-' });
    if (!rotorD && !ratio && inputs.rotorDiameter === undefined && inputs.rotorToColumnDiameterRatio === undefined) {
      err('rotorDiameter', 'Rotor geometry is required: rotorDiameter (m) and/or rotorToColumnDiameterRatio — if only one is entered the other is calculated; if both are entered they must agree within ±1 %');
    }
    if (typeof inputs.rotorType !== 'string' || !(inputs.rotorType as string).trim()) err('rotorType', 'rotorType is a mandatory data label (e.g. shrouded turbine) — no geometry is designed from it');

    // Rotor speed: single or range
    const speed = parseTagged(inputs.rotorSpeed, 'rotorSpeed', errors, { min: 1, max: 1000, unit: 'rpm' });
    const range = inputs.rotorSpeedRange as Record<string, unknown> | undefined;
    if (inputs.rotorSpeed !== undefined && range !== undefined) err('rotorSpeedRange', 'Provide EITHER rotorSpeed OR rotorSpeedRange — not both');
    else if (range !== undefined && range !== null) {
      const lo = parseTagged(range.min, 'rotorSpeedRange.min', errors, { min: 1, max: 1000, unit: 'rpm' });
      const hi = parseTagged(range.max, 'rotorSpeedRange.max', errors, { min: 1, max: 1000, unit: 'rpm' });
      if (lo && hi && lo.value >= hi.value) err('rotorSpeedRange', 'rotorSpeedRange must satisfy min < max');
    } else if (!speed && inputs.rotorSpeed === undefined) {
      err('rotorSpeed', 'rotorSpeed (rpm) or rotorSpeedRange { min, max } is required — source-tagged, never defaulted');
    }

    parseTagged(inputs.powerNumber, 'powerNumber', errors, { min: 0.1, max: 20, unit: '-', required: true });
    parseTagged(inputs.statorOpenAreaFraction, 'statorOpenAreaFraction', errors, { min: 0.01, max: 0.9, unit: '-' });
    const svl = inputs.statorVelocityLimits as Record<string, unknown> | undefined;
    if (svl) {
      const lo = parseTagged(svl.min, 'statorVelocityLimits.min', errors, { min: 0, max: 10, unit: 'm/s' });
      const hi = parseTagged(svl.max, 'statorVelocityLimits.max', errors, { min: 0, max: 10, unit: 'm/s' });
      if (lo && hi && lo.value >= hi.value) err('statorVelocityLimits', 'statorVelocityLimits must satisfy min < max');
    }
    parseTagged(inputs.rotorSweptLoadingLimit, 'rotorSweptLoadingLimit', errors, { min: 0.1, max: 10000, unit: 'm3/(m2.h)' });

    // Compartments
    const stages = num(inputs.theoreticalStages);
    if (stages === undefined || stages <= 0) err('theoreticalStages', 'theoreticalStages must be > 0 (engineer-entered, typically from the Stage C2 result)');
    parseTagged(inputs.compartmentEfficiency, 'compartmentEfficiency', errors, { min: 1e-6, max: 1, unit: '-', required: true });
    parseTagged(inputs.compartmentHeight, 'compartmentHeight', errors, { min: 0.05, max: 1, unit: 'm', required: true });
    parseTagged(inputs.rotorsPerCompartment, 'rotorsPerCompartment', errors, { min: 1, max: 10, unit: '-', integer: true });

    // Mechanical
    parseTagged(inputs.shaftEfficiency, 'shaftEfficiency', errors, { min: 0.5, max: 1.0, unit: '-', required: true });
    parseTagged(inputs.mechanicalDesignMargin, 'mechanicalDesignMargin', errors, { min: 1.0, max: 2.0, unit: '-', required: true });
    parseTagged(inputs.maxAllowableTipSpeed, 'maxAllowableTipSpeed', errors, { min: 0.1, max: 50, unit: 'm/s' });
    // Refinement R3 — preferred tip-speed operating range
    const pref = inputs.preferredTipSpeedRange as Record<string, unknown> | undefined;
    if (pref) {
      const lo = parseTagged(pref.min, 'preferredTipSpeedRange.min', errors, { min: 0, max: 50, unit: 'm/s' });
      const hi = parseTagged(pref.max, 'preferredTipSpeedRange.max', errors, { min: 0, max: 50, unit: 'm/s' });
      if (lo && hi && lo.value >= hi.value) err('preferredTipSpeedRange', 'preferredTipSpeedRange must satisfy min < max');
    }
    parseTagged(inputs.maxAllowableShaftPower, 'maxAllowableShaftPower', errors, { min: 0.01, max: 10000, unit: 'kW' });
    parseTagged(inputs.maxUnsupportedShaftLength, 'maxUnsupportedShaftLength', errors, { min: 0.5, max: 50, unit: 'm' });

    // Vendor hydraulic capacity — C4 PerformanceBasis architecture, never invented
    const cap = inputs.vendorHydraulicCapacity as PerformanceBasis | undefined;
    if (cap !== undefined && cap !== null) {
      for (const issue of validatePerformanceBasis(cap, 'vendorHydraulicCapacity')) err(issue.field, issue.message);
      if (cap.kind !== 'constant' && (cap as { independentVariable?: string }).independentVariable !== 'flowRatioDispersedToContinuous') {
        err('vendorHydraulicCapacity.independentVariable', "Vendor Hydraulic Capacity curves must be expressed vs 'flowRatioDispersedToContinuous' — the engine will not evaluate a curve against a different variable");
      }
      if (cap.kind === 'constant' && !(num((cap as { value?: unknown }).value) !== undefined && num((cap as { value?: unknown }).value)! > 0)) {
        err('vendorHydraulicCapacity.value', 'A constant Vendor Hydraulic Capacity must be a finite value > 0');
      }
    }
    parseTagged(inputs.systemDeratingFactor, 'systemDeratingFactor', errors, { min: 0.1, max: 1.0, unit: '-' });

    // Diameter basis — identical discipline to C3/C4
    const sweep = inputs.diameterSweep as Record<string, unknown> | undefined;
    const values = inputs.diameterValues as unknown;
    if (sweep && values !== undefined) err('diameterValues', 'Provide EITHER diameterSweep OR diameterValues — not both');
    else if (values !== undefined) {
      if (!Array.isArray(values) || values.length === 0 || values.length > 200 || values.some((v) => num(v) === undefined || num(v)! <= 0)) {
        err('diameterValues', 'diameterValues must be a non-empty array of up to 200 diameters, each > 0 (m)');
      }
    } else {
      const dMin = num(sweep?.min); const dMax = num(sweep?.max); const dStep = num(sweep?.step);
      if (!sweep || dMin === undefined || dMax === undefined || dStep === undefined || dMin <= 0 || dMax <= dMin || dStep <= 0) {
        err('diameterSweep', 'diameterSweep { 0 < min < max, step > 0 } (m) is required (for a single diameter use diameterValues: [D])');
      } else {
        const points = Math.floor((dMax - dMin) / dStep) + 1;
        if (dMin + dStep === dMin) err('diameterSweep.step', 'diameterSweep.step is too small to advance the sweep at floating-point precision');
        else if (points > 200) err('diameterSweep', `diameterSweep would produce ${points} points — limit is 200; use a coarser step`);
        else if (points > 100) warn('diameterSweep', `diameterSweep has ${points} points — consider a coarser step for screening`);
      }
    }
    const trial = num(inputs.selectedTrialDiameter);
    if (inputs.selectedTrialDiameter !== undefined && (trial === undefined || trial <= 0)) err('selectedTrialDiameter', 'selectedTrialDiameter must be > 0 (m)');

    if (inputs.utilizationBandPercent !== undefined && inputs.utilizationBandPercent !== null) {
      const b = inputs.utilizationBandPercent as Record<string, unknown>;
      const bMin = num(b.min); const bMax = num(b.max);
      if (bMin === undefined || bMax === undefined || !(bMin >= 0 && bMax <= 100 && bMin < bMax)) err('utilizationBandPercent', 'utilizationBandPercent must satisfy 0 ≤ min < max ≤ 100');
    }

    // Height allowances — mandatory and source-tagged or explicitly Assumed
    for (const f of ALLOWANCE_FIELDS) parseTagged(inputs[f.key], f.key, errors, { min: f.min, max: f.max, unit: f.unit, required: true });

    return { valid: errors.filter((e) => e.severity === 'error').length === 0, errors };
  }

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
      const T = num(inputs.operatingTemperature)!;
      const phaseConfig = inputs.phaseConfiguration as PhaseConfig;
      const rrboContinuous = phaseConfig === 'rrbo_continuous_nmp_dispersed';
      const continuousPhase = rrboContinuous ? 'RRBO' : 'NMP';
      const dispersedPhase = rrboContinuous ? 'NMP' : 'RRBO';

      // ── Properties (calculation-scoped context — registries never mutated) ──
      const fd = inputs.feedDensity as Record<string, unknown>;
      const fv = inputs.feedViscosity as Record<string, unknown>;
      const feedDensityEntry = { value: num(fd.value)!, unit: 'kg/m3', referenceTemperatureC: num(fd.referenceTemperatureC)!, sourceType: fd.sourceType as SourceType, sourceReference: fd.sourceReference as string };
      const feedViscosityEntry = { value: num(fv.value)!, unit: 'Pa.s', referenceTemperatureC: num(fv.referenceTemperatureC)!, sourceType: fv.sourceType as SourceType, sourceReference: fv.sourceReference as string };
      const propertyContext = createPropertyContext([{
        id: 'rrbo', name: 'RRBO (Re-Refined Base Oil) — run feed', isProjectFluid: true,
        properties: { density: feedDensityEntry, dynamicViscosity: feedViscosityEntry },
      }]);
      const rhoRRBO = getProperty('rrbo', 'density', T, propertyContext);
      const rhoNMP = getProperty('nmp', 'density', T);
      for (const w of [...rhoRRBO.warnings, ...rhoNMP.warnings]) pushWarning(w.code, w.message);
      const propertyAssumed = containsAssumedData([...rhoRRBO.warnings, ...rhoNMP.warnings])
        || feedDensityEntry.sourceType === 'Assumed' || feedViscosityEntry.sourceType === 'Assumed';
      if (propertyAssumed) { notePending(); assumptions.push({ assumption: 'Fluid property data contain Assumed entries (RRBO entered tags and/or EPD data)', consequence: 'All load- and rotor-derived items are Pending Validation' }); }

      const rhoC = rrboContinuous ? rhoRRBO.value : rhoNMP.value;
      const rhoCSource = rrboContinuous ? rhoRRBO.source : rhoNMP.source;

      // Continuous-phase viscosity: entered override, or RRBO entered viscosity
      // when RRBO is continuous. Never silently taken for NMP (gated above).
      const muCTagged = parseTagged(inputs.continuousPhaseViscosity, 'continuousPhaseViscosity', errs, { min: 1e-5, max: 10, unit: 'Pa.s' });
      const muC = muCTagged ? muCTagged.value : feedViscosityEntry.value;
      const muCSource = muCTagged ? sourceOf(muCTagged) : `RRBO entered viscosity (${feedViscosityEntry.sourceType}: ${feedViscosityEntry.sourceReference})`;
      const muCAssumed = muCTagged ? muCTagged.sourceType === 'Assumed' : feedViscosityEntry.sourceType === 'Assumed';
      if (muCTagged?.sourceType === 'Assumed') { notePending(); assumptions.push({ assumption: `Continuous-phase viscosity ${muCTagged.value} Pa·s is ASSUMED`, sourceType: muCTagged.sourceType, sourceReference: muCTagged.sourceReference, consequence: 'Rotor Reynolds number is Pending Validation' }); }

      const ift = parseTagged(inputs.interfacialTension, 'interfacialTension', errs, { min: 0.0005, max: 0.1, unit: 'N/m' });
      if (ift?.sourceType === 'Assumed') { notePending(); assumptions.push({ assumption: `Interfacial tension ${ift.value} N/m is ASSUMED`, sourceType: ift.sourceType, sourceReference: ift.sourceReference, consequence: 'Rotor Weber number is Pending Validation' }); }

      // ── Refinement R1 — power mixture-density basis (recorded, never hard-coded)
      const densityBasis = inputs.powerDensityBasis as DensityBasis;

      // ── Rotor speed(s) ───────────────────────────────────────────────────────
      const speedTagged = parseTagged(inputs.rotorSpeed, 'rotorSpeed', errs, { min: 1, max: 1000, unit: 'rpm' });
      const rangeIn = inputs.rotorSpeedRange as Record<string, unknown> | undefined;
      const speedLo = rangeIn ? parseTagged(rangeIn.min, 'rotorSpeedRange.min', errs, { min: 1, max: 1000, unit: 'rpm' }) : undefined;
      const speedHi = rangeIn ? parseTagged(rangeIn.max, 'rotorSpeedRange.max', errs, { min: 1, max: 1000, unit: 'rpm' }) : undefined;
      const speedPoints: { label: 'single' | 'atMinSpeed' | 'atMaxSpeed'; rpm: number; tag: TaggedValue }[] = speedTagged
        ? [{ label: 'single', rpm: speedTagged.value, tag: speedTagged }]
        : [{ label: 'atMinSpeed', rpm: speedLo!.value, tag: speedLo! }, { label: 'atMaxSpeed', rpm: speedHi!.value, tag: speedHi! }];
      const speedAssumed = speedPoints.some((s) => s.tag.sourceType === 'Assumed');
      if (speedAssumed) { notePending(); assumptions.push({ assumption: 'Rotor speed is ASSUMED', consequence: 'All rotor-derived items are Pending Validation' }); }

      // ── Mandatory tagged mechanical/compartment inputs ───────────────────────
      const powerNumber = parseTagged(inputs.powerNumber, 'powerNumber', errs, { min: 0.1, max: 20, unit: '-', required: true })!;
      const compartmentEfficiency = parseTagged(inputs.compartmentEfficiency, 'compartmentEfficiency', errs, { min: 1e-6, max: 1, unit: '-', required: true })!;
      const compartmentHeight = parseTagged(inputs.compartmentHeight, 'compartmentHeight', errs, { min: 0.05, max: 1, unit: 'm', required: true })!;
      const rotorsPerComp = parseTagged(inputs.rotorsPerCompartment, 'rotorsPerCompartment', errs, { min: 1, max: 10, unit: '-', integer: true });
      const shaftEfficiency = parseTagged(inputs.shaftEfficiency, 'shaftEfficiency', errs, { min: 0.5, max: 1.0, unit: '-', required: true })!;
      const designMargin = parseTagged(inputs.mechanicalDesignMargin, 'mechanicalDesignMargin', errs, { min: 1.0, max: 2.0, unit: '-', required: true })!;
      for (const t of [powerNumber, compartmentEfficiency, compartmentHeight, shaftEfficiency, designMargin, rotorsPerComp].filter(Boolean) as TaggedValue[]) {
        if (t.sourceType === 'Assumed') { notePending(); assumptions.push({ assumption: `Input tagged ASSUMED (${t.sourceReference}, value ${t.value})`, sourceType: t.sourceType, sourceReference: t.sourceReference, consequence: 'Downstream items are Pending Validation' }); }
      }
      const nRotorsPerComp = rotorsPerComp?.value ?? 1;
      if (!rotorsPerComp) pushWarning('ROTORS_PER_COMPARTMENT_DEFAULT', 'rotorsPerCompartment not supplied — 1 rotor per compartment applied (typical ECR arrangement; confirm with vendor).');

      const maxTip = parseTagged(inputs.maxAllowableTipSpeed, 'maxAllowableTipSpeed', errs, { min: 0.1, max: 50, unit: 'm/s' });
      const prefIn = inputs.preferredTipSpeedRange as Record<string, unknown> | undefined;
      const prefLo = prefIn ? parseTagged(prefIn.min, 'preferredTipSpeedRange.min', errs, { min: 0, max: 50, unit: 'm/s' }) : undefined;
      const prefHi = prefIn ? parseTagged(prefIn.max, 'preferredTipSpeedRange.max', errs, { min: 0, max: 50, unit: 'm/s' }) : undefined;
      const maxShaftPower = parseTagged(inputs.maxAllowableShaftPower, 'maxAllowableShaftPower', errs, { min: 0.01, max: 10000, unit: 'kW' });
      const maxShaftLength = parseTagged(inputs.maxUnsupportedShaftLength, 'maxUnsupportedShaftLength', errs, { min: 0.5, max: 50, unit: 'm' });
      const statorFrac = parseTagged(inputs.statorOpenAreaFraction, 'statorOpenAreaFraction', errs, { min: 0.01, max: 0.9, unit: '-' });
      const svlIn = inputs.statorVelocityLimits as Record<string, unknown> | undefined;
      const svLo = svlIn ? parseTagged(svlIn.min, 'statorVelocityLimits.min', errs, { min: 0, max: 10, unit: 'm/s' }) : undefined;
      const svHi = svlIn ? parseTagged(svlIn.max, 'statorVelocityLimits.max', errs, { min: 0, max: 10, unit: 'm/s' }) : undefined;
      const sweptLimit = parseTagged(inputs.rotorSweptLoadingLimit, 'rotorSweptLoadingLimit', errs, { min: 0.1, max: 10000, unit: 'm3/(m2.h)' });

      // Centralized Assumed scan over ALL optional screening criteria — any
      // Assumed tag anywhere makes the run pending_validation (binding rule).
      const optionalCriteria: [string, TaggedValue | undefined][] = [
        ['maxAllowableTipSpeed', maxTip], ['preferredTipSpeedRange.min', prefLo], ['preferredTipSpeedRange.max', prefHi],
        ['maxAllowableShaftPower', maxShaftPower], ['maxUnsupportedShaftLength', maxShaftLength],
        ['statorOpenAreaFraction', statorFrac], ['statorVelocityLimits.min', svLo], ['statorVelocityLimits.max', svHi],
        ['rotorSweptLoadingLimit', sweptLimit],
      ];
      let criteriaAssumed = false;
      for (const [name, t] of optionalCriteria) {
        if (t?.sourceType === 'Assumed') {
          criteriaAssumed = true;
          notePending();
          assumptions.push({ assumption: `Screening criterion ${name} = ${t.value} is ASSUMED`, sourceType: t.sourceType, sourceReference: t.sourceReference, consequence: 'Checks against this criterion are Pending Validation' });
        }
      }
      const criterionStatus = (t: TaggedValue | undefined, otherwise: Classification): Classification =>
        t?.sourceType === 'Assumed' ? 'Pending Validation' : otherwise;

      // ── ECR-007 — compartments (efficiency path only) ───────────────────────
      const stages = num(inputs.theoreticalStages)!;
      const nCompartments = Math.ceil(stages / compartmentEfficiency.value - 1e-9);
      const compClassification: Classification = compartmentEfficiency.sourceType === 'Assumed' ? 'Pending Validation' : 'Calculated Screening Result';
      const compartmentsItem = item('ECR-007', nCompartments, '-',
        `ceil(theoreticalStages ${stages} / compartmentEfficiency ${compartmentEfficiency.value} [${sourceOf(compartmentEfficiency)}])`,
        compClassification, compClassification === 'Pending Validation' ? 'Compartment efficiency is Assumed — vendor/test confirmation required' : 'Compartment-efficiency screening path — rate-based path reserved');

      // ── ECR-008 — heights ────────────────────────────────────────────────────
      const allowances: Record<string, TaggedValue> = {};
      let allowancesAssumed = false;
      for (const f of ALLOWANCE_FIELDS) {
        const t = parseTagged(inputs[f.key], f.key, errs, { min: f.min, max: f.max, unit: 'm', required: true })!;
        allowances[f.key] = t;
        if (t.sourceType === 'Assumed') {
          allowancesAssumed = true;
          assumptions.push({ assumption: `${f.label} allowance ${t.value} m is ASSUMED`, sourceType: t.sourceType, sourceReference: t.sourceReference, consequence: 'Height breakdown is Pending Validation' });
        }
      }
      if (allowancesAssumed) notePending();
      const activeHeight = nCompartments * compartmentHeight.value;
      const heightStatus: Classification = allowancesAssumed || compClassification === 'Pending Validation' || compartmentHeight.sourceType === 'Assumed' ? 'Pending Validation' : 'Calculated Screening Result';
      const hLines: { label: string; item: ResultItem }[] = [];
      const pushLine = (label: string, value: number, source: string, status: Classification = heightStatus) =>
        hLines.push({ label, item: item('ECR-008', value, 'm', source, status, status === 'Pending Validation' ? 'Contains Assumed data' : 'Source-tagged') });
      pushLine('Drive/Seal/Bearing', allowances.driveSealBearingAllowance.value, sourceOf(allowances.driveSealBearingAllowance));
      pushLine('Top Head', allowances.topHeadHeight.value, sourceOf(allowances.topHeadHeight));
      pushLine('Top Disengagement', allowances.topDisengagementHeight.value, sourceOf(allowances.topDisengagementHeight));
      pushLine('Top Distributor', allowances.topDistributorAllowance.value, sourceOf(allowances.topDistributorAllowance));
      pushLine('Active Agitated Section', activeHeight, `ECR-007/ECR-008: ${nCompartments} compartments × ${compartmentHeight.value} m (${sourceOf(compartmentHeight)})`);
      pushLine('Bottom Distributor', allowances.bottomDistributorAllowance.value, sourceOf(allowances.bottomDistributorAllowance));
      pushLine('Bottom Disengagement', allowances.bottomDisengagementHeight.value, sourceOf(allowances.bottomDisengagementHeight));
      pushLine('Bottom Head', allowances.bottomHeadHeight.value, sourceOf(allowances.bottomHeadHeight));
      const ttLabels = ['Top Disengagement', 'Top Distributor', 'Active Agitated Section', 'Bottom Distributor', 'Bottom Disengagement'];
      const totalTT = hLines.filter((l) => ttLabels.includes(l.label)).reduce((s, l) => s + (l.item.result as number), 0);
      const overallVessel = totalTT + allowances.topHeadHeight.value + allowances.bottomHeadHeight.value + allowances.driveSealBearingAllowance.value;
      const heightBreakdown = {
        activeAgitatedHeight: item('ECR-008', activeHeight, 'm', `${nCompartments} compartments × compartment height`, heightStatus, heightStatus === 'Pending Validation' ? 'Contains Assumed data' : 'Source-tagged'),
        lines: hLines.map((l) => ({ label: l.label, ...l.item })),
        totalTangentToTangent: item('ECR-008', totalTT, 'm', 'Sum of tangent-to-tangent items (heads and drive/seal excluded)', heightStatus, heightStatus === 'Pending Validation' ? 'Contains Assumed data' : 'Source-tagged'),
        overallVesselHeight: item('ECR-008', overallVessel, 'm', 'Total T/T + top head + bottom head + drive/seal/bearing allowance', heightStatus, heightStatus === 'Pending Validation' ? 'Contains Assumed data' : 'Source-tagged'),
      };

      // ── Vendor capacity & derating — ECR-002 ────────────────────────────────
      const capacityBasis = inputs.vendorHydraulicCapacity as PerformanceBasis | undefined;
      const capacityAssumed = capacityBasis ? performanceBasisAssumed(capacityBasis) : false;
      if (capacityAssumed) { notePending(); assumptions.push({ assumption: 'Vendor Hydraulic Capacity data are ASSUMED', consequence: 'ECR utilization is Pending Validation' }); }
      const derate = parseTagged(inputs.systemDeratingFactor, 'systemDeratingFactor', errs, { min: 0.1, max: 1.0, unit: '-' });
      let derateValue = 1.0;
      let derateSource = 'No vendor system-derating factor supplied — 1.0 used with explicit warning (never invented)';
      if (derate) {
        derateValue = derate.value;
        derateSource = `Vendor system-derating factor (${sourceOf(derate)})`;
        if (derate.sourceType === 'Assumed') { notePending(); assumptions.push({ assumption: `System derating factor ${derate.value} is ASSUMED`, sourceType: derate.sourceType, sourceReference: derate.sourceReference, consequence: 'ECR utilization is Pending Validation' }); }
      } else if (capacityBasis) {
        pushWarning('NO_SYSTEM_DERATING_DATA', `No vendor system-derating factor supplied — Vendor Hydraulic Capacity applied without correction. Confirm applicability to the ${dispersedPhase}-in-${continuousPhase} system.`);
      }
      if (!capacityBasis) {
        notePending();
        pushWarning('NO_ECR_CAPACITY_DATA', 'No ECR-specific Vendor Hydraulic Capacity data supplied — ECR hydraulic utilization is Pending Validation (loads are still reported). The C3 generic screening percentage is NOT a substitute.');
      }
      const utilizationPendingBase = propertyAssumed || capacityAssumed || (derate?.sourceType === 'Assumed');

      const utilBandIn = inputs.utilizationBandPercent as Record<string, unknown> | undefined;
      const utilizationBand = utilBandIn ? { min: num(utilBandIn.min)!, max: num(utilBandIn.max)! } : { ...DEFAULT_UTILIZATION_BAND };

      // ── Diameter list ────────────────────────────────────────────────────────
      let diameters: number[];
      if (inputs.diameterValues !== undefined) diameters = (inputs.diameterValues as unknown[]).map((v) => num(v)!);
      else {
        const sweep = inputs.diameterSweep as { min: number; max: number; step: number };
        const sweepMin = num(sweep.min)!; const sweepMax = num(sweep.max)!; const sweepStep = num(sweep.step)!;
        const nPoints = Math.floor((sweepMax - sweepMin) / sweepStep + 1e-9) + 1;
        diameters = Array.from({ length: nPoints }, (_, i) => Number((sweepMin + i * sweepStep).toFixed(10)));
      }
      const trialD = num(inputs.selectedTrialDiameter);
      if (trialD !== undefined && !diameters.some((d) => Math.abs(d - trialD) < 1e-9)) diameters = [...diameters, trialD].sort((a, b) => a - b);

      // ── Refinement R2 — rotor geometry resolution per diameter ──────────────
      const rotorDTagged = parseTagged(inputs.rotorDiameter, 'rotorDiameter', errs, { min: 0.05, max: 5, unit: 'm' });
      const ratioTagged = parseTagged(inputs.rotorToColumnDiameterRatio, 'rotorToColumnDiameterRatio', errs, { min: 0.2, max: 0.8, unit: '-' });
      const rotorGeometryAssumed = rotorDTagged?.sourceType === 'Assumed' || ratioTagged?.sourceType === 'Assumed';
      if (rotorGeometryAssumed) { notePending(); assumptions.push({ assumption: 'Rotor geometry (diameter/ratio) is ASSUMED', consequence: 'All rotor-derived items are Pending Validation' }); }
      const resolveRotor = (D: number): { rotorD: number; ratio: number; source: string; blockedReason?: string } => {
        if (rotorDTagged && ratioTagged) {
          const implied = ratioTagged.value * D;
          const deviation = Math.abs(rotorDTagged.value - implied) / implied;
          if (deviation > 0.01) return { rotorD: NaN, ratio: NaN, source: '', blockedReason: `rotorDiameter ${rotorDTagged.value} m and rotorToColumnDiameterRatio ${ratioTagged.value} disagree at D = ${D} m (implied ${implied.toFixed(4)} m, deviation ${(deviation * 100).toFixed(2)} % > ±1 %) — resolve the inconsistency` };
          return { rotorD: rotorDTagged.value, ratio: rotorDTagged.value / D, source: `Direct entry (${sourceOf(rotorDTagged)}), verified within ±1 % of ratio (${sourceOf(ratioTagged)})` };
        }
        if (rotorDTagged) return { rotorD: rotorDTagged.value, ratio: rotorDTagged.value / D, source: `Direct entry (${sourceOf(rotorDTagged)}); ratio calculated = D_R/D` };
        return { rotorD: ratioTagged!.value * D, ratio: ratioTagged!.value, source: `Calculated from ratio ${ratioTagged!.value} (${sourceOf(ratioTagged!)}) × column diameter` };
      };

      // ── Flows per case ───────────────────────────────────────────────────────
      const caseFlows = (c: 'normalCase' | 'maximumCase') => {
        const cf = inputs[c] as { rrboMassFlow_kg_h: number; nmpMassFlow_kg_h: number };
        const mRRBO = num(cf.rrboMassFlow_kg_h)!; const mNMP = num(cf.nmpMassFlow_kg_h)!;
        const qRRBO = mRRBO / rhoRRBO.value; const qNMP = mNMP / rhoNMP.value;
        return {
          mRRBO, mNMP, qRRBO, qNMP,
          qC: rrboContinuous ? qRRBO : qNMP, qD: rrboContinuous ? qNMP : qRRBO,
          rhoMixVolumeAveraged: (mRRBO + mNMP) / (qRRBO + qNMP),
        };
      };
      const normalFlows = caseFlows('normalCase');
      const maximumFlows = caseFlows('maximumCase');
      if (maximumFlows.mNMP < normalFlows.mNMP - SMALL) pushWarning('MAXIMUM_CASE_BELOW_NORMAL', 'maximumCase NMP flow is below normalCase — confirm the case definitions.');

      const rotorPendingBase = propertyAssumed || speedAssumed || rotorGeometryAssumed;

      // ── Refinement R3 — tip-speed classification ────────────────────────────
      const tipCriteriaAssumed = [maxTip, prefLo, prefHi].some((t) => t?.sourceType === 'Assumed');
      const classifyTipSpeed = (vTip: number): { classification: string; status: Classification; detail: string } => {
        const st: Classification = rotorPendingBase || tipCriteriaAssumed ? 'Pending Validation' : 'Calculated Screening Result';
        if (maxTip && vTip > maxTip.value) return { classification: 'above_vendor_limit', status: st, detail: `v_tip ${vTip.toFixed(3)} m/s > vendor limit ${maxTip.value} m/s (${sourceOf(maxTip)})` };
        if (prefLo && prefHi) {
          if (vTip < prefLo.value) return { classification: 'below_preferred_range', status: st, detail: `v_tip ${vTip.toFixed(3)} m/s < preferred minimum ${prefLo.value} m/s (${sourceOf(prefLo)})` };
          if (vTip > prefHi.value) return { classification: 'above_preferred_range', status: st, detail: `v_tip ${vTip.toFixed(3)} m/s > preferred maximum ${prefHi.value} m/s (${sourceOf(prefHi)})${maxTip ? ` but ≤ vendor limit ${maxTip.value} m/s` : ' (no vendor limit supplied)'}` };
          return { classification: 'preferred_range', status: st, detail: `v_tip ${vTip.toFixed(3)} m/s within preferred [${prefLo.value}, ${prefHi.value}] m/s` };
        }
        if (maxTip) return { classification: 'below_vendor_limit_no_preferred_range', status: 'Not Calculable', detail: `v_tip ${vTip.toFixed(3)} m/s ≤ vendor limit ${maxTip.value} m/s, but no preferred operating range was supplied — range classification Not Calculable` };
        return { classification: 'no_limit_data', status: 'Not Calculable', detail: 'Neither preferred tip-speed range nor vendor limit supplied — never assumed' };
      };

      // ── Per-case diameter rating ─────────────────────────────────────────────
      const runCase = (caseName: 'normal' | 'maximum', flows: ReturnType<typeof caseFlows>) => {
        const rows: Record<string, unknown>[] = [];
        for (const D of diameters) {
          const A = columnCrossSectionArea(D);
          const loadC = flows.qC / A; const loadD = flows.qD / A; const loadTot = loadC + loadD;
          const flowRatio = flows.qD / Math.max(flows.qC, SMALL);
          const loadsStatus: Classification = propertyAssumed ? 'Pending Validation' : 'Calculated Screening Result';
          const rhoMix = densityBasis === 'continuous_phase' ? rhoC : flows.rhoMixVolumeAveraged;
          const rhoMixSource = densityBasis === 'continuous_phase'
            ? `Continuous-phase (${continuousPhase}) density ${rhoC.toFixed(1)} kg/m³ [${rhoCSource}] — selected powerDensityBasis 'continuous_phase'`
            : `Volume-averaged mixture density (m_RRBO+m_NMP)/(Q_RRBO+Q_NMP) = ${flows.rhoMixVolumeAveraged.toFixed(1)} kg/m³ — selected powerDensityBasis 'volume_averaged'`;

          const row: Record<string, unknown> = {
            diameter_m: D,
            area: item('ECR-001', A, 'm2', 'A = π·D²/4', 'Calculated Screening Result', 'Geometric'),
            loads: {
              continuous: item('ECR-001', loadC, 'm3/(m2.h)', `Q_${continuousPhase}/A`, loadsStatus, 'From entered flows and densities'),
              dispersed: item('ECR-001', loadD, 'm3/(m2.h)', `Q_${dispersedPhase}/A`, loadsStatus, 'From entered flows and densities'),
              total: item('ECR-001', loadTot, 'm3/(m2.h)', 'Total both-phase liquid load', loadsStatus, 'From entered flows and densities'),
              superficialVelocities: {
                continuous_m_s: item('ECR-001', loadC / 3600, 'm/s', `u_c = Q_${continuousPhase}/A`, loadsStatus, 'Superficial (empty-column) velocity'),
                dispersed_m_s: item('ECR-001', loadD / 3600, 'm/s', `u_d = Q_${dispersedPhase}/A`, loadsStatus, 'Superficial (empty-column) velocity'),
              },
              phaseNames: { continuousPhase, dispersedPhase },
              flowRatioDispersedToContinuous: item('ECR-001', flowRatio, '-', 'Q_d/Q_c', loadsStatus, 'Used as the Vendor Hydraulic Capacity curve variable'),
            },
          };

          // ECR-002 — ECR utilization from Vendor Hydraulic Capacity ONLY
          let feasibility: string;
          if (capacityBasis) {
            const evalX = capacityBasis.kind === 'constant' ? 0 : flowRatio;
            const cap = evaluatePerformanceBasis(capacityBasis, evalX);
            if (!cap.ok) {
              row.ecrHydraulicUtilization = item('ECR-002', null, '%', 'Vendor Hydraulic Capacity', 'Not Calculable', cap.reason!, [cap.reason!]);
              pushWarning('VENDOR_CAPACITY_OUT_OF_DATA_RANGE', `${caseName} case, D = ${D} m: ${cap.reason}`);
              feasibility = 'not_calculable';
              notePending();
            } else if (!(cap.value! > 0)) {
              row.ecrHydraulicUtilization = item('ECR-002', null, '%', 'Vendor Hydraulic Capacity', 'Not Calculable', `Vendor Hydraulic Capacity evaluated to ${cap.value} ${cap.unit} — a non-positive capacity cannot screen utilization`, []);
              pushWarning('VENDOR_CAPACITY_NON_POSITIVE', `${caseName} case, D = ${D} m: Vendor Hydraulic Capacity evaluated to ${cap.value} ${cap.unit}.`);
              feasibility = 'not_calculable';
              notePending();
            } else {
              const pct = (loadTot / (cap.value! * derateValue)) * 100;
              const utilStatus: Classification = utilizationPendingBase ? 'Pending Validation' : 'Calculated Screening Result';
              row.ecrHydraulicUtilization = item('ECR-002', pct, '%',
                `total load / (Vendor Hydraulic Capacity ${cap.value!.toFixed(2)} ${cap.unit} [${cap.source}] × derating ${derateValue} [${derateSource}])`,
                utilStatus, utilStatus === 'Pending Validation' ? 'Vendor/property data contain Assumed entries' : 'Vendor performance data — not a vendor rating. NOT the C3 generic percentage.');
              feasibility = pct >= 100 ? 'hydraulically_infeasible'
                : pct > utilizationBand.max ? 'above_screening_band'
                  : pct < utilizationBand.min ? 'below_minimum_loading_band'
                    : 'within_screening_band';
            }
          } else {
            row.ecrHydraulicUtilization = item('ECR-002', null, '%', 'Vendor Hydraulic Capacity', 'Pending Validation', 'No ECR-specific Vendor Hydraulic Capacity data — utilization cannot be screened; the C3 generic percentage is not a substitute');
            feasibility = 'pending_validation';
          }

          // ECR-004 — rotor geometry & speed (R2)
          const rotor = resolveRotor(D);
          if (rotor.blockedReason) {
            errs.push({ field: 'rotorDiameter', message: rotor.blockedReason, severity: 'error' });
            return { blocked: rotor.blockedReason };
          }
          const rotorD = rotor.rotorD;
          const A_R = Math.PI * rotorD * rotorD / 4;
          const sweptLoading = (flows.qC + flows.qD) / A_R;

          // ECR-003 — stator & rotor-region checks
          if (statorFrac) {
            const vSt = (flows.qC + flows.qD) / 3600 / (A * statorFrac.value);
            const stStatus: Classification = statorFrac.sourceType === 'Assumed' || propertyAssumed ? 'Pending Validation' : 'Calculated Screening Result';
            row.statorFreeAreaVelocity = item('ECR-003', vSt, 'm/s', `v_st = (Q_c+Q_d)/(A·f_stator ${statorFrac.value} [${sourceOf(statorFrac)}])`, stStatus, 'Stator free-area velocity — limit assessment is a separate check item');
            if (svLo || svHi) {
              const stWarnings: string[] = [];
              if (svLo && vSt < svLo.value) { stWarnings.push(`Below vendor stator-velocity minimum ${svLo.value} m/s`); pushWarning('STATOR_VELOCITY_BELOW_LIMIT', `${caseName} case, D = ${D} m: stator velocity ${vSt.toFixed(4)} m/s below vendor minimum ${svLo.value} m/s.`); }
              if (svHi && vSt > svHi.value) { stWarnings.push(`Above vendor stator-velocity maximum ${svHi.value} m/s`); pushWarning('STATOR_VELOCITY_ABOVE_LIMIT', `${caseName} case, D = ${D} m: stator velocity ${vSt.toFixed(4)} m/s above vendor maximum ${svHi.value} m/s.`); }
              const limStatus = criterionStatus(svLo, criterionStatus(svHi, stStatus));
              row.statorVelocityLimitCheck = item('ECR-003', stWarnings.length ? 'outside_vendor_limits' : 'within_vendor_limits', '-', `v_st ${vSt.toFixed(4)} m/s vs vendor limits [${svLo ? svLo.value : '—'}, ${svHi ? svHi.value : '—'}] m/s`, limStatus, stWarnings.length ? 'Outside vendor stator-velocity limits' : 'Within vendor stator-velocity limits', stWarnings);
            } else {
              row.statorVelocityLimitCheck = item('ECR-003', null, '-', 'Vendor stator-velocity limits', 'Not Calculable', 'No vendor stator-velocity limits supplied — value reported, limit check Not Calculable (never assumed)');
            }
          } else {
            row.statorFreeAreaVelocity = item('ECR-003', null, 'm/s', 'Stator open-area fraction', 'Not Calculable', 'statorOpenAreaFraction not supplied — never assumed');
            row.statorVelocityLimitCheck = item('ECR-003', null, '-', 'Vendor stator-velocity limits', 'Not Calculable', 'No stator geometry — check Not Calculable');
          }
          {
            const swWarnings: string[] = [];
            if (sweptLimit && sweptLoading > sweptLimit.value) { swWarnings.push(`Above rotor swept-loading limit ${sweptLimit.value} m3/(m2.h)`); pushWarning('ROTOR_SWEPT_LOADING_ABOVE_LIMIT', `${caseName} case, D = ${D} m: rotor swept-area loading ${sweptLoading.toFixed(1)} exceeds the limit ${sweptLimit.value} m3/(m2.h).`); }
            row.rotorSweptAreaLoading = item('ECR-003', sweptLoading, 'm3/(m2.h)', `(Q_c+Q_d)/A_R, A_R = π·D_R²/4 = ${A_R.toFixed(5)} m²`, rotorPendingBase || sweptLimit?.sourceType === 'Assumed' ? 'Pending Validation' : 'Calculated Screening Result', sweptLimit ? (swWarnings.length ? 'Above vendor/engineer limit' : `Within limit ${sweptLimit.value} m3/(m2.h) (${sourceOf(sweptLimit)})`) : 'No swept-loading limit supplied — value reported only', swWarnings);
          }

          // ECR-004/005/006/009 per speed point
          const rotorStatus: Classification = rotorPendingBase ? 'Pending Validation' : 'Calculated Screening Result';
          const speedResults = speedPoints.map((sp) => {
            const N = sp.rpm / 60; // rev/s
            const vTip = Math.PI * rotorD * N;
            const Re = rhoC * N * rotorD * rotorD / muC;
            const Fr = N * N * rotorD / G;
            const tipClass = classifyTipSpeed(vTip);
            if (tipClass.classification === 'above_vendor_limit') pushWarning('TIP_SPEED_LIMIT_EXCEEDED', `${caseName} case, D = ${D} m (${sp.label}): tip speed ${vTip.toFixed(3)} m/s exceeds the vendor limit ${maxTip!.value} m/s.`);
            const weberItem = ift
              ? item('ECR-005', rhoC * N * N * rotorD ** 3 / ift.value, '-', `We = ρ_c·N²·D_R³/σ (σ ${ift.value} N/m [${sourceOf(ift)}])`, ift.sourceType === 'Assumed' || rotorPendingBase ? 'Pending Validation' : 'Calculated Screening Result', 'Rotor Weber number — no droplet-size prediction is made from it')
              : item('ECR-005', null, '-', 'Interfacial tension', 'Not Calculable', 'interfacialTension not supplied — Weber number Not Calculable; other groups unaffected');
            // ECR-006 power
            const P1 = powerNumber.value * rhoMix * N ** 3 * rotorD ** 5;
            const nRotors = nCompartments * nRotorsPerComp;
            const PShaft = P1 * nRotors;
            const PMotor = PShaft / shaftEfficiency.value * designMargin.value;
            const powerStatus: Classification = rotorPendingBase || powerNumber.sourceType === 'Assumed' || compClassification === 'Pending Validation' || shaftEfficiency.sourceType === 'Assumed' || designMargin.sourceType === 'Assumed' ? 'Pending Validation' : 'Calculated Screening Result';
            const shaftPowerWarnings: string[] = [];
            let shaftPowerCheck: ResultItem;
            if (maxShaftPower) {
              const exceeded = PShaft / 1000 > maxShaftPower.value;
              if (exceeded) { shaftPowerWarnings.push(`Shaft power ${(PShaft / 1000).toFixed(2)} kW exceeds limit ${maxShaftPower.value} kW`); pushWarning('SHAFT_POWER_LIMIT_EXCEEDED', `${caseName} case, D = ${D} m (${sp.label}): total shaft power ${(PShaft / 1000).toFixed(2)} kW exceeds the allowable ${maxShaftPower.value} kW.`); }
              shaftPowerCheck = item('ECR-009', exceeded ? 'above_limit' : 'within_limit', '-', `P_shaft vs maxAllowableShaftPower ${maxShaftPower.value} kW (${sourceOf(maxShaftPower)})`, criterionStatus(maxShaftPower, powerStatus), exceeded ? 'ABOVE allowable shaft power' : 'Within allowable shaft power', shaftPowerWarnings);
            } else {
              shaftPowerCheck = item('ECR-009', null, '-', 'maxAllowableShaftPower', 'Not Calculable', 'No allowable shaft power supplied — never assumed');
            }
            return {
              speedPoint: sp.label,
              rotorSpeed_rpm: item('ECR-004', sp.rpm, 'rpm', sourceOf(sp.tag), rotorStatus, 'Engineer/vendor-entered rotor speed'),
              rotationalFrequency: item('ECR-004', N, 'rev/s', 'N = rpm/60', rotorStatus, 'Derived'),
              tipSpeed: item('ECR-009', vTip, 'm/s', 'v_tip = π·D_R·N', rotorStatus, tipClass.detail),
              tipSpeedClassification: item('ECR-009', tipClass.classification, '-', maxTip || prefLo ? `Preferred range ${prefLo && prefHi ? `[${prefLo.value}, ${prefHi.value}]` : 'not supplied'}; vendor limit ${maxTip ? maxTip.value : 'not supplied'} m/s` : 'No tip-speed criteria supplied', tipClass.status, tipClass.detail, tipClass.classification === 'above_vendor_limit' ? ['Tip speed exceeds the vendor limit'] : []),
              reynolds: item('ECR-005', Re, '-', `Re = ρ_c·N·D_R²/μ_c (ρ_c ${rhoC.toFixed(1)} kg/m³ [${rhoCSource}], μ_c ${muC} Pa·s [${muCSource}])`, muCAssumed || rotorPendingBase ? 'Pending Validation' : 'Calculated Screening Result', 'Rotor Reynolds number'),
              weber: weberItem,
              froude: item('ECR-005', Fr, '-', 'Fr = N²·D_R/g', rotorStatus, 'Rotational Froude number'),
              power: {
                densityBasis: { selected: densityBasis, valueUsed_kg_m3: rhoMix, source: rhoMixSource, reservedBases: ['holdup_corrected (future — requires a validated holdup model)'] },
                perRotor: item('ECR-006', P1, 'W', `P₁ = N_P ${powerNumber.value} [${sourceOf(powerNumber)}] · ρ_m ${rhoMix.toFixed(1)} kg/m³ [basis '${densityBasis}'] · N³ · D_R⁵`, powerStatus, 'Agitation power per rotor'),
                totalShaft: item('ECR-006', PShaft, 'W', `P₁ [ρ_m ${rhoMix.toFixed(1)} kg/m³, basis '${densityBasis}'] × ${nRotors} rotors (${nCompartments} compartments × ${nRotorsPerComp} rotor(s)/compartment)`, powerStatus, 'Total shaft power'),
                motorDesign: item('ECR-006', PMotor, 'W', `P_shaft [ρ_m ${rhoMix.toFixed(1)} kg/m³, basis '${densityBasis}'] / η_shaft ${shaftEfficiency.value} [${sourceOf(shaftEfficiency)}] × margin ${designMargin.value} [${sourceOf(designMargin)}]`, powerStatus, 'Motor design power — screening only, not a motor selection'),
              },
              mechanicalScreening: {
                formulaReference: 'ECR-009',
                tipSpeedCheck: item('ECR-009', tipClass.classification, '-', 'π·D_R·N vs preferred range and vendor limit', tipClass.status, tipClass.detail),
                shaftPowerCheck,
              },
            };
          });
          row.rotor = {
            rotorType: inputs.rotorType,
            rotorDiameter: item('ECR-004', rotorD, 'm', rotor.source, rotorPendingBase ? 'Pending Validation' : 'Calculated Screening Result', 'Refinement R2: direct and/or ratio-derived, ±1 % consistency enforced'),
            rotorToColumnDiameterRatio: item('ECR-004', rotor.ratio, '-', rotor.source, rotorPendingBase ? 'Pending Validation' : 'Calculated Screening Result', 'D_R/D'),
            sweptArea: item('ECR-004', A_R, 'm2', 'A_R = π·D_R²/4', 'Calculated Screening Result', 'Geometric'),
            atSpeed: speedResults,
          };
          // Shaft support screening (per diameter, speed-independent)
          if (maxShaftLength) {
            const proxy = overallVessel;
            const needsSupport = proxy > maxShaftLength.value;
            if (needsSupport) pushWarning('SHAFT_SUPPORT_REQUIRED', `Overall vessel height ${proxy.toFixed(2)} m exceeds the maximum unsupported shaft length ${maxShaftLength.value} m — intermediate bearings/supports required (screening only).`);
            row.shaftSupportCheck = item('ECR-009', needsSupport ? 'intermediate_support_required' : 'within_unsupported_length', '-', `Overall vessel height proxy ${proxy.toFixed(2)} m vs maxUnsupportedShaftLength ${maxShaftLength.value} m (${sourceOf(maxShaftLength)})`, criterionStatus(maxShaftLength, heightStatus), 'Shaft-length proxy screening — not a shaft design');
          } else {
            row.shaftSupportCheck = item('ECR-009', null, '-', 'maxUnsupportedShaftLength', 'Not Calculable', 'No shaft-length datum supplied — never assumed');
          }
          row.bearingSupportRequirements = item('ECR-009', 'pending_validation', '-', 'Vendor/mechanical data', 'Pending Validation', 'Bearing/support requirements are Pending Validation unless vendor/mechanical data exist — no bearing design is performed');

          row.feasibility = feasibility;
          rows.push(row);
        }
        const within = rows.filter((r) => r.feasibility === 'within_screening_band');
        const feasible = rows.filter((r) => !['hydraulically_infeasible', 'not_calculable', 'pending_validation'].includes(r.feasibility as string));
        return {
          caseName,
          flows: {
            rrboMassFlow_kg_h: flows.mRRBO, nmpMassFlow_kg_h: flows.mNMP,
            rrboVolumetricFlow_m3_h: flows.qRRBO, nmpVolumetricFlow_m3_h: flows.qNMP,
            continuousPhase, dispersedPhase,
          },
          utilizationBandPercent: { ...utilizationBand, note: 'Configurable screening criterion — not a universal engineering rule' },
          diameters: rows,
          summary: {
            hydraulicallyInfeasibleDiameters_m: rows.filter((r) => r.feasibility === 'hydraulically_infeasible').map((r) => r.diameter_m),
            aboveScreeningBandDiameters_m: rows.filter((r) => r.feasibility === 'above_screening_band').map((r) => r.diameter_m),
            withinScreeningBandDiameters_m: within.map((r) => r.diameter_m),
            belowMinimumLoadingBandDiameters_m: rows.filter((r) => r.feasibility === 'below_minimum_loading_band').map((r) => r.diameter_m),
            minimumFeasibleDiameter_m: feasible.length ? (feasible[0].diameter_m as number) : null,
            selectedTrialDiameter_m: trialD ?? null,
            selectedTrialDiameterNote: trialD !== undefined ? 'Engineer-selected trial diameter (echoed and rated, not engine-recommended)' : 'No trial diameter selected — the engine does not recommend one',
          },
        };
      };

      const normalCase = runCase('normal', normalFlows);
      if ((normalCase as { blocked?: string }).blocked) {
        return { ...base, status: 'error', data: { calculationRunStatus: 'calculation_blocked' }, warnings, validationIssues: errs };
      }
      const maximumCase = runCase('maximum', maximumFlows);

      const calculationRunStatus = anyPending ? 'pending_validation' : 'screening_complete';

      const data: Record<string, unknown> = {
        applicabilityStatement: APPLICABILITY_STATEMENT,
        limitations: LIMITATIONS,
        calculationRunStatus,
        engineVersions: {
          cel: CEL_VERSION, epd: EPD_VERSION,
          processDesign: C2_PROCESS_DESIGN_VERSION, hydraulicsCommon: C3_HYDRAULICS_COMMON_VERSION,
          ecrAgitatedColumn: ENGINE_VERSION,
        },
        designBasis: {
          operatingTemperatureC: T,
          phaseConfiguration: { input: phaseConfig, continuousPhase, dispersedPhase, note: 'Phase continuity is taken from the engineer input only.' },
          feedFluid: { id: 'rrbo', enteredDensity: feedDensityEntry, enteredViscosity: feedViscosityEntry, densityUsed: { value: rhoRRBO.value, unit: rhoRRBO.unit, source: rhoRRBO.source } },
          solventFluid: { id: 'nmp', densityUsed: { value: rhoNMP.value, unit: rhoNMP.unit, source: rhoNMP.source } },
          continuousPhaseViscosity: { value: muC, unit: 'Pa.s', source: muCSource },
          interfacialTension: ift ?? { note: 'Not supplied — Weber number Not Calculable' },
          powerDensityBasis: { selected: densityBasis, note: "Refinement R1: selectable basis recorded with every calculation. 'holdup_corrected' is reserved for a future validated-holdup path." },
          rotor: { rotorType: inputs.rotorType, directDiameter: rotorDTagged ?? null, ratio: ratioTagged ?? null, note: 'Refinement R2: both entered ⇒ ±1 % consistency enforced; one entered ⇒ the other calculated' },
          tipSpeedCriteria: { preferredRange: prefLo && prefHi ? { min: prefLo, max: prefHi } : null, vendorLimit: maxTip ?? null, note: 'Refinement R3: classified below/within/above preferred range and above vendor limit' },
          theoreticalStages: stages,
          compartmentEfficiency, compartmentHeight,
          vendorHydraulicCapacity: capacityBasis ?? { note: 'Not supplied — utilization Pending Validation; never invented' },
          systemDeratingFactor: derate ?? { value: 1.0, note: 'Not supplied — 1.0 applied with warning; never invented' },
          utilizationBandPercent: { ...utilizationBand, note: 'Configurable screening criterion — not a universal engineering rule' },
        },
        compartments: compartmentsItem,
        heightBreakdown,
        normalCase, maximumCase,
        rateBasedPlaceholders: {
          note: 'Reserved architecture for a future rate-based path. NOT calculated in Stage C5.',
          compartmentMassTransferCoefficient: null, residenceTime: null, stageEfficiencyFromKoaVQ: null, axialBackMixing: null,
        },
        assumptions,
      };

      const status = warnings.length > 0 || anyPending ? 'warning' : 'success';
      return { ...base, status, data, warnings, validationIssues: errs };
    } catch (e) {
      if (e instanceof EngineeringInputError) {
        errs.push({ field: 'inputs', message: e.message, severity: 'error' });
        return { ...base, status: 'error', data: { calculationRunStatus: 'calculation_blocked' }, warnings, validationIssues: errs };
      }
      throw e;
    }
  }

  generateSummary(results: Record<string, unknown>): DesignSummary {
    const status = results.calculationRunStatus as string | undefined;
    const height = results.heightBreakdown as { totalTangentToTangent?: { result?: number } } | undefined;
    const comps = results.compartments as { result?: number } | undefined;
    const keyResults = [
      comps?.result != null ? { label: 'Estimated compartments', value: comps.result, highlight: true } : null,
      height?.totalTangentToTangent?.result != null ? { label: 'Total tangent-to-tangent height', value: height.totalTangentToTangent.result, unit: 'm', highlight: true } : null,
      status ? { label: 'Run status', value: status, highlight: true } : null,
    ].filter(Boolean) as DesignSummary['keyResults'];
    return {
      keyResults,
      recommendations: [
        'PRELIMINARY ECR-TYPE AGITATED COLUMN SCREENING — NOT VENDOR RATING AND NOT FOR FABRICATION.',
        'Confirm hydraulic capacity, compartment efficiency, tip-speed criteria and mechanical limits with the column vendor before rating.',
      ],
      warnings: [],
      calculationClass: 'Preliminary Screening',
    };
  }
}
