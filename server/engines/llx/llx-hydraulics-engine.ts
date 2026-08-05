// ═══════════════════════════════════════════════════════════════════════════════
// LLX — Common Hydraulic Screening Engine (Stage C3) — v1.0.0
//
// PRELIMINARY GENERIC HYDRAULIC SCREENING — NOT ECP OR ECR RATING.
//
// Implements HYD-001…HYD-008 per the approved corrected Stage C3 basis:
//   - Generic slip model u_slip(φ) = u_K·(1−φ)^n. BOTH u_K (characteristic
//     swarm/slip velocity) and n (hindrance exponent) are engineer-supplied,
//     source-tagged inputs. n = 1 is permitted only as an explicit Assumed
//     entry (ASSUMED_HINDRANCE_EXPONENT, Pending Validation). n = 1 is NOT a
//     universal liquid-liquid extraction relationship.
//   - u_K and rigid-sphere terminal velocity are DISTINCT. Reusing the
//     rigid-sphere screening velocity as a provisional u_K requires the
//     explicit option useTerminalVelocityAsCharacteristic and emits
//     CHARACTERISTIC_VELOCITY_FROM_RIGID_SPHERE_SCREENING; all holdup and
//     throughput results become Pending Validation.
//   - Missing NMP/RRBO interfacial tension never blocks area, superficial
//     velocities, density difference, rigid-sphere terminal velocity, or
//     generic holdup with an independently entered u_K. IFT is required only
//     for We / Eo / Mo and shape-regime warnings (Not Calculable without it).
//   - Phase-dependent velocity assignment from the engineer-selected phase
//     configuration; exact flow-ratio definition and phase names stored.
//   - Normal and maximum solvent cases are fully independent (own ratio, own
//     throughput optimum — nothing reused across cases).
//   - Configurable holdup bounds (default 0.005–0.60) stored in the snapshot.
//   - All physical roots returned and classified; the preliminary operating
//     branch is the lowest root below φ* only when inside bounds and isolated
//     by the configured tolerance; otherwise AMBIGUOUS_HOLDUP_BRANCH and
//     Pending Validation.
//   - Diameter sweep returns CLASSIFICATIONS (infeasible / above band /
//     within band / below band) — never one "recommended diameter". The
//     screening band is a configurable criterion (default 40–80 %), not a
//     universal rule.
//   - Interfacial area a = 6φ/d₃₂ only from an established physical
//     operating holdup.
//   - Terminology: Generic Hydraulic Throughput Maximum / Percentage of
//     Generic Hydraulic Throughput Maximum / Generic Hydraulic Feasibility.
//     Never "flooding percentage", ECP/ECR flooding, or vendor diameters.
// ═══════════════════════════════════════════════════════════════════════════════

import {
  IDesignEngine, ValidationResult, ValidationError, CalculationContext,
  CalculationResult, DesignSummary, EngineWarning,
} from '../../engine-framework/types';
import {
  CEL_VERSION, EPD_VERSION,
  getProperty, getInterfacialTension, createPropertyContext,
  containsAssumedData, EngineeringInputError,
  SOURCE_TYPES,
  columnCrossSectionArea, superficialVelocity, terminalVelocitySphere,
  interfacialArea, solveCounterCurrentHoldup, maximizeThroughputAtFixedFlowRatio,
  percentOfThroughputMaximum,
  weber, eotvos, morton,
} from '../../engine-framework/common-engineering-library';
import type { SourceType } from '../../engine-framework/epd/types';

// ── Structures ────────────────────────────────────────────────────────────────

interface TaggedValue { value: number; sourceType: SourceType; sourceReference: string }

const PHASE_CONFIGS = ['rrbo_continuous_nmp_dispersed', 'nmp_continuous_rrbo_dispersed'] as const;
type PhaseConfig = (typeof PHASE_CONFIGS)[number];

type Classification = 'Calculated Screening Result' | 'Pending Validation' | 'Not Calculable';

const RATIO_TOLERANCE = 0.001;
const SMALL = 1e-12;

const DEFAULT_HOLDUP_BOUNDS = { min: 0.005, max: 0.60 };
const MODERATE_HOLDUP_LIMIT = 0.60;
const DEFAULT_SCREENING_BAND = { min: 40, max: 80 }; // % of generic maximum — configurable criterion
const DEFAULT_ROOT_ISOLATION_TOLERANCE = 0.02;

const APPLICABILITY_STATEMENT = 'PRELIMINARY GENERIC HYDRAULIC SCREENING — NOT ECP OR ECR RATING';
const LIMITATIONS = [
  'No packing effect (ECP internals not modelled)',
  'No rotor/stator effect (ECR internals not modelled)',
  'No axial dispersion',
  'No droplet breakup/coalescence model',
  'No phase inversion model',
  'No entrainment model',
  'Rigid-sphere terminal-velocity screening limitations (drops may deform, circulate, oscillate, or have immobilized interfaces)',
  'Characteristic velocity u_K and hindrance exponent n require experimental or vendor validation',
];

interface AssumptionEntry { assumption: string; sourceType?: SourceType; sourceReference?: string; scope: string }

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function parseTagged(raw: unknown, field: string, errors: ValidationError[], opts: { min: number; max: number; minExclusive?: boolean; maxExclusive?: boolean }): TaggedValue | undefined {
  if (raw === undefined || raw === null) return undefined;
  const o = raw as Record<string, unknown>;
  const value = num(o.value);
  if (value === undefined) { errors.push({ field, message: `${field}.value must be a finite number`, severity: 'error' }); return undefined; }
  const belowMin = opts.minExclusive ? value <= opts.min : value < opts.min;
  const aboveMax = opts.maxExclusive ? value >= opts.max : value > opts.max;
  if (belowMin || aboveMax) {
    errors.push({ field, message: `${field}.value must be in ${opts.minExclusive ? '(' : '['}${opts.min}, ${opts.max}${opts.maxExclusive ? ')' : ']'} (got ${value})`, severity: 'error' });
    return undefined;
  }
  if (!SOURCE_TYPES.includes(o.sourceType as SourceType)) { errors.push({ field, message: `${field}.sourceType must be one of ${SOURCE_TYPES.join(', ')}`, severity: 'error' }); return undefined; }
  if (typeof o.sourceReference !== 'string' || !o.sourceReference.trim()) { errors.push({ field, message: `${field}.sourceReference is mandatory`, severity: 'error' }); return undefined; }
  return { value, sourceType: o.sourceType as SourceType, sourceReference: o.sourceReference };
}

function validateTaggedPropertyEntry(raw: unknown, field: string, err: (f: string, m: string) => void, unit: string): void {
  const o = raw as Record<string, unknown> | undefined;
  if (!o) { err(field, `${field} is required: source-tagged RRBO entry { value (${unit}), referenceTemperatureC, sourceType, sourceReference }. No default RRBO correlations exist.`); return; }
  const v = num(o.value);
  if (v === undefined || v <= 0) err(`${field}.value`, `${field}.value must be > 0 (${unit})`);
  if (num(o.referenceTemperatureC) === undefined) err(`${field}.referenceTemperatureC`, `${field}.referenceTemperatureC (°C) is required`);
  if (!SOURCE_TYPES.includes(o.sourceType as SourceType)) err(`${field}.sourceType`, `${field}.sourceType must be one of ${SOURCE_TYPES.join(', ')}`);
  if (typeof o.sourceReference !== 'string' || !(o.sourceReference as string).trim()) err(`${field}.sourceReference`, `${field}.sourceReference is mandatory`);
}

function propertyEntryFromInput(o: Record<string, unknown>, unit: string) {
  return {
    value: num(o.value)!,
    unit,
    referenceTemperatureC: num(o.referenceTemperatureC)!,
    sourceType: o.sourceType as SourceType,
    sourceReference: o.sourceReference as string,
    ...(o.validRangeC ? { validRangeC: o.validRangeC as { min: number; max: number } } : {}),
    ...(o.temperatureCoefficient ? { temperatureCoefficient: o.temperatureCoefficient as { slopePerC: number; sourceType: SourceType; sourceReference: string } } : {}),
  };
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class LLXHydraulicsEngine implements IDesignEngine {
  getEngineId(): string { return 'llx-hydraulics'; }
  getEngineVersion(): string { return '1.0.0'; }
  getModuleType(): string { return 'llx'; }
  getCalculationType(): string { return 'hydraulics_common'; }

  validate(inputs: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = [];
    const err = (field: string, message: string) => errors.push({ field, message, severity: 'error' });
    const warn = (field: string, message: string) => errors.push({ field, message, severity: 'warning' });

    const T = num(inputs.operatingTemperature);
    if (T === undefined) err('operatingTemperature', 'operatingTemperature (°C) is required and must be a finite number');
    else if (T < -273.15) err('operatingTemperature', 'operatingTemperature is below absolute zero');

    const feedFlow = inputs.feedFlow as Record<string, unknown> | undefined;
    const feedValue = num(feedFlow?.value);
    if (!feedFlow || feedValue === undefined || feedValue <= 0) err('feedFlow', 'feedFlow { value > 0, basis } is required');
    else if (feedFlow.basis !== 'mass' && feedFlow.basis !== 'volumetric') err('feedFlow.basis', "feedFlow.basis must be 'mass' (kg/h) or 'volumetric' (m³/h)");

    validateTaggedPropertyEntry(inputs.feedDensity, 'feedDensity', err, 'kg/m3');
    validateTaggedPropertyEntry(inputs.feedViscosity, 'feedViscosity', err, 'Pa.s');

    const sFlow = num(inputs.solventFlow);
    const sRatio = num(inputs.solventToOilRatio);
    if (sFlow === undefined && sRatio === undefined) err('solventFlow', 'Provide solventFlow (kg/h), solventToOilRatio, or both');
    if (inputs.solventFlow !== undefined && (sFlow === undefined || sFlow <= 0)) err('solventFlow', 'solventFlow must be > 0 kg/h');
    if (inputs.solventToOilRatio !== undefined && (sRatio === undefined || sRatio <= 0)) err('solventToOilRatio', 'solventToOilRatio must be > 0');

    const fMax = num(inputs.maxCirculationFactor);
    if (fMax === undefined) err('maxCirculationFactor', 'maxCirculationFactor is required (design-case multiplier for the maximum solvent-flow case)');
    else if (fMax < 1.0) err('maxCirculationFactor', 'maxCirculationFactor must be ≥ 1.0');
    else if (fMax < 1.1 || fMax > 1.5) warn('maxCirculationFactor', `maxCirculationFactor ${fMax} is outside the typical screening band 1.1–1.5`);

    if (!PHASE_CONFIGS.includes(inputs.phaseConfiguration as PhaseConfig)) {
      err('phaseConfiguration', `phaseConfiguration must be one of: ${PHASE_CONFIGS.join(', ')}`);
    }

    // Optional interfacial tension — absence must NOT block unrelated results
    if (inputs.interfacialTension !== undefined && inputs.interfacialTension !== null) {
      const ift = inputs.interfacialTension as Record<string, unknown>;
      const iv = num(ift.value);
      if (iv === undefined || iv <= 0) err('interfacialTension.value', 'interfacialTension.value must be > 0 (N/m)');
      if (num(ift.referenceTemperatureC) === undefined) err('interfacialTension.referenceTemperatureC', 'interfacialTension.referenceTemperatureC (°C) is required');
      if (!SOURCE_TYPES.includes(ift.sourceType as SourceType)) err('interfacialTension.sourceType', `interfacialTension.sourceType must be one of ${SOURCE_TYPES.join(', ')}`);
      if (typeof ift.sourceReference !== 'string' || !(ift.sourceReference as string).trim()) err('interfacialTension.sourceReference', 'interfacialTension.sourceReference is mandatory');
    }

    // Optional Sauter mean diameter (m) — no prediction, no default
    parseTagged(inputs.sauterMeanDiameter, 'sauterMeanDiameter', errors, { min: 0, max: 0.1, minExclusive: true });

    // Optional configurable d32 screening band (m) — source-tagged or user-defined
    if (inputs.d32ScreeningBand !== undefined && inputs.d32ScreeningBand !== null) {
      const b = inputs.d32ScreeningBand as Record<string, unknown>;
      const bMin = num(b.min); const bMax = num(b.max);
      if (bMin === undefined || bMax === undefined || bMin <= 0 || bMax <= bMin) err('d32ScreeningBand', 'd32ScreeningBand requires 0 < min < max (m)');
    }

    // Slip model inputs — u_K and n both source-tagged; no defaults
    const uK = parseTagged(inputs.characteristicVelocity, 'characteristicVelocity', errors, { min: 0, max: 10, minExclusive: true });
    const nExp = parseTagged(inputs.hindranceExponent, 'hindranceExponent', errors, { min: 0, max: 10, minExclusive: true });
    if (nExp && nExp.value === 1 && nExp.sourceType !== 'Assumed') {
      err('hindranceExponent', "hindranceExponent n = 1 is permitted ONLY as an explicit Assumed entry (sourceType: 'Assumed') — it is not a universal liquid-liquid extraction relationship and must not carry a Measured/Vendor/Literature tag unless the tagged source actually reports n = 1; if it does, enter the exact reported value (e.g. 1.0 from a named test report) as Assumed pending review.");
    }
    const useUt = inputs.useTerminalVelocityAsCharacteristic === true;
    if (uK !== undefined && useUt) err('useTerminalVelocityAsCharacteristic', 'Provide EITHER an entered characteristicVelocity OR useTerminalVelocityAsCharacteristic — not both');
    if (useUt && (inputs.sauterMeanDiameter === undefined || inputs.sauterMeanDiameter === null)) {
      err('useTerminalVelocityAsCharacteristic', 'useTerminalVelocityAsCharacteristic requires sauterMeanDiameter (the rigid-sphere screening velocity needs a drop diameter)');
    }
    if ((uK !== undefined || useUt) && nExp === undefined && inputs.hindranceExponent === undefined) {
      err('hindranceExponent', 'hindranceExponent n is required with a characteristic-velocity basis. n = 1 is permitted only as an explicit Assumed entry — it is not a universal liquid-liquid extraction relationship.');
    }

    // Configurable holdup bounds
    if (inputs.holdupBounds !== undefined && inputs.holdupBounds !== null) {
      const hb = inputs.holdupBounds as Record<string, unknown>;
      const hMin = num(hb.min); const hMax = num(hb.max);
      if (hMin === undefined || hMax === undefined || !(hMin > 0 && hMax < 1 && hMin < hMax)) err('holdupBounds', 'holdupBounds must satisfy 0 < min < max < 1');
      else if (hMax > MODERATE_HOLDUP_LIMIT) warn('holdupBounds', `holdupBounds.max = ${hMax} exceeds the moderate-holdup applicability limit ${MODERATE_HOLDUP_LIMIT} of the generic slip model — results above ${MODERATE_HOLDUP_LIMIT} are outside the model's applicability`);
    }

    const tol = num(inputs.rootIsolationTolerance);
    if (inputs.rootIsolationTolerance !== undefined && (tol === undefined || tol <= 0 || tol >= 0.5)) err('rootIsolationTolerance', 'rootIsolationTolerance must be in (0, 0.5)');

    // Configurable screening band (%)
    if (inputs.screeningBandPercent !== undefined && inputs.screeningBandPercent !== null) {
      const sb = inputs.screeningBandPercent as Record<string, unknown>;
      const sMin = num(sb.min); const sMax = num(sb.max);
      if (sMin === undefined || sMax === undefined || !(sMin >= 0 && sMax <= 100 && sMin < sMax)) err('screeningBandPercent', 'screeningBandPercent must satisfy 0 ≤ min < max ≤ 100');
    }

    // Diameter sweep
    const sweep = inputs.diameterSweep as Record<string, unknown> | undefined;
    const dMin = num(sweep?.min); const dMax = num(sweep?.max); const dStep = num(sweep?.step);
    if (!sweep || dMin === undefined || dMax === undefined || dStep === undefined || dMin <= 0 || dMax < dMin || dStep <= 0) {
      err('diameterSweep', 'diameterSweep { min > 0, max ≥ min, step > 0 } (m) is required');
    } else {
      const points = Math.floor((dMax - dMin) / dStep) + 1;
      if (dMin + dStep === dMin) err('diameterSweep.step', 'diameterSweep.step is too small to advance the sweep at floating-point precision');
      else if (points > 200) err('diameterSweep', `diameterSweep would produce ${points} points — limit is 200; use a coarser step`);
      else if (points > 100) warn('diameterSweep', `diameterSweep has ${points} points — consider a coarser step for screening`);
    }

    const trial = num(inputs.selectedTrialDiameter);
    if (inputs.selectedTrialDiameter !== undefined && (trial === undefined || trial <= 0)) err('selectedTrialDiameter', 'selectedTrialDiameter must be > 0 (m)');

    return { valid: errors.filter((e) => e.severity === 'error').length === 0, errors };
  }

  async calculate(inputs: Record<string, unknown>, context: CalculationContext): Promise<CalculationResult> {
    const base = {
      calculationClass: context.calculationClass ?? 'Preliminary Screening',
      engineId: this.getEngineId(),
      engineVersion: this.getEngineVersion(),
      computedAt: new Date(),
    };
    const warnings: EngineWarning[] = [];
    const assumptions: AssumptionEntry[] = [
      { assumption: 'Steady counter-current gravity flow; fully developed hydraulics', scope: 'run' },
      { assumption: 'Generic characteristic-velocity slip model u_slip = u_K·(1−φ)^n — technology internals not modelled', scope: 'run' },
    ];

    // Gate — never run arithmetic on invalid inputs
    const gate = this.validate(inputs);
    const gateErrors = gate.errors.filter((e) => e.severity === 'error');
    if (gateErrors.length > 0) {
      return { ...base, status: 'error', data: { calculationRunStatus: 'calculation_blocked' }, warnings, validationIssues: gate.errors };
    }
    // Promote non-blocking validation warnings into the run warnings
    for (const w of gate.errors.filter((e) => e.severity === 'warning')) {
      warnings.push({ code: 'INPUT_WARNING', message: `${w.field}: ${w.message}` });
    }

    const errs: ValidationError[] = [];
    try {
      const T = num(inputs.operatingTemperature)!;
      const fd = inputs.feedDensity as Record<string, unknown>;
      const fv = inputs.feedViscosity as Record<string, unknown>;
      const iftInput = (inputs.interfacialTension ?? undefined) as Record<string, unknown> | undefined;

      // Calculation-scoped property context — shared registries never mutated
      const feedDensityEntry = propertyEntryFromInput(fd, 'kg/m3');
      const feedViscosityEntry = propertyEntryFromInput(fv, 'Pa.s');
      const propertyContext = createPropertyContext([{
        id: 'rrbo',
        name: 'RRBO (Re-Refined Base Oil) — run feed',
        isProjectFluid: true,
        properties: { density: feedDensityEntry, dynamicViscosity: feedViscosityEntry },
        ...(iftInput ? {
          interfacialTension: {
            nmp: {
              value: num(iftInput.value)!,
              referenceTemperatureC: num(iftInput.referenceTemperatureC)!,
              sourceType: iftInput.sourceType as SourceType,
              sourceReference: iftInput.sourceReference as string,
            },
          },
        } : {}),
      }]);

      const rhoRRBO = getProperty('rrbo', 'density', T, propertyContext);
      const muRRBO = getProperty('rrbo', 'dynamicViscosity', T, propertyContext);
      const rhoNMP = getProperty('nmp', 'density', T);
      const muNMP = getProperty('nmp', 'dynamicViscosity', T);
      for (const w of [...rhoRRBO.warnings, ...muRRBO.warnings, ...rhoNMP.warnings, ...muNMP.warnings]) warnings.push({ code: w.code, message: w.message });
      let propertyAssumed = [rhoRRBO, muRRBO, rhoNMP, muNMP].some((p) => containsAssumedData(p.warnings));

      // Interfacial tension — optional; absence blocks ONLY We/Eo/Mo/shape items
      let ift: { value: number; unit: string; source: string } | undefined;
      if (iftInput) {
        const r = getInterfacialTension('rrbo', 'nmp', propertyContext);
        for (const w of r.warnings) warnings.push({ code: w.code, message: w.message });
        if (containsAssumedData(r.warnings)) propertyAssumed = true;
        ift = { value: r.value, unit: r.unit, source: r.source };
      }

      // Flows (HYD-001, same PD-001/PD-003 discipline)
      const feedFlow = inputs.feedFlow as { value: number; basis: 'mass' | 'volumetric' };
      const feedMassFlow = feedFlow.basis === 'mass' ? num(feedFlow.value)! : num(feedFlow.value)! * rhoRRBO.value;
      const enteredSolventFlow = num(inputs.solventFlow);
      const enteredRatio = num(inputs.solventToOilRatio);
      let normalSolventMassFlow: number;
      let solventFlowConsistency: Record<string, unknown> | undefined;
      if (enteredSolventFlow !== undefined && enteredRatio !== undefined) {
        const impliedRatio = enteredSolventFlow / feedMassFlow;
        const absoluteDifference = Math.abs(impliedRatio - enteredRatio);
        const relativeDifference = absoluteDifference / Math.max(Math.abs(enteredRatio), SMALL);
        solventFlowConsistency = {
          enteredSolventFlow_kg_h: enteredSolventFlow, enteredSolventToOilRatio: enteredRatio,
          impliedRatio, absoluteDifference, relativeDifference, acceptanceTolerance: RATIO_TOLERANCE,
        };
        if (relativeDifference > RATIO_TOLERANCE) {
          errs.push({ field: 'solventToOilRatio', message: `Inconsistent solvent basis: implied ratio ${impliedRatio.toFixed(6)} vs entered ${enteredRatio} — relative difference ${(relativeDifference * 100).toFixed(3)} % exceeds 0.1 % tolerance.`, severity: 'error' });
          return { ...base, status: 'error', data: { solventFlowConsistency, calculationRunStatus: 'calculation_blocked' }, warnings, validationIssues: errs };
        }
        normalSolventMassFlow = enteredSolventFlow;
      } else if (enteredSolventFlow !== undefined) normalSolventMassFlow = enteredSolventFlow;
      else normalSolventMassFlow = enteredRatio! * feedMassFlow;
      const maxCirculationFactor = num(inputs.maxCirculationFactor)!;
      const maximumSolventMassFlow = maxCirculationFactor * normalSolventMassFlow;

      const qRRBO_m3s = feedMassFlow / rhoRRBO.value / 3600;
      const qNMP_normal_m3s = normalSolventMassFlow / rhoNMP.value / 3600;
      const qNMP_maximum_m3s = maximumSolventMassFlow / rhoNMP.value / 3600;

      // Phase configuration & density difference (HYD-002)
      const phaseConfig = inputs.phaseConfiguration as PhaseConfig;
      const rrboContinuous = phaseConfig === 'rrbo_continuous_nmp_dispersed';
      const continuousPhase = rrboContinuous ? 'RRBO' : 'NMP';
      const dispersedPhase = rrboContinuous ? 'NMP' : 'RRBO';
      const rhoC = rrboContinuous ? rhoRRBO.value : rhoNMP.value;
      const rhoD = rrboContinuous ? rhoNMP.value : rhoRRBO.value;
      const muC = rrboContinuous ? muRRBO.value : muNMP.value;
      const densityDifference = Math.abs(rhoC - rhoD);
      if (densityDifference < SMALL) {
        errs.push({ field: 'feedDensity', message: 'Density difference between phases is ~zero — gravity counter-current flow is Not Calculable.', severity: 'error' });
        return { ...base, status: 'error', data: { calculationRunStatus: 'calculation_blocked' }, warnings, validationIssues: errs };
      }
      if (densityDifference < 30) warnings.push({ code: 'LOW_DENSITY_DIFFERENCE', message: `Δρ = ${densityDifference.toFixed(1)} kg/m³ (< 30) — gravity separation is marginal; screening results are highly sensitive.` });

      // Droplet size (HYD-003) — engineer-supplied only, never predicted
      const d32 = parseTagged(inputs.sauterMeanDiameter, 'sauterMeanDiameter', errs, { min: 0, max: 0.1, minExclusive: true });
      let d32Assumed = d32?.sourceType === 'Assumed';
      if (d32Assumed) assumptions.push({ assumption: `Sauter mean diameter d32 = ${d32!.value} m is ASSUMED`, sourceType: d32!.sourceType, sourceReference: d32!.sourceReference, scope: 'run' });
      const bandInput = inputs.d32ScreeningBand as Record<string, unknown> | undefined;
      let d32Band: Record<string, unknown> | undefined;
      if (bandInput) {
        const hasRef = SOURCE_TYPES.includes(bandInput.sourceType as SourceType) && typeof bandInput.sourceReference === 'string' && (bandInput.sourceReference as string).trim();
        d32Band = {
          min_m: num(bandInput.min)!, max_m: num(bandInput.max)!,
          label: hasRef ? `${bandInput.sourceType}: ${bandInput.sourceReference}` : 'User-defined screening range',
        };
        if (d32 && (d32.value < (d32Band.min_m as number) || d32.value > (d32Band.max_m as number))) {
          warnings.push({ code: 'D32_OUTSIDE_SCREENING_BAND', message: `d32 = ${d32.value} m is outside the configured screening band [${d32Band.min_m}, ${d32Band.max_m}] m (${d32Band.label}).` });
        }
      }

      // Rigid-sphere terminal-velocity screening (HYD-004) — independent of IFT
      let terminalVelocity: Record<string, unknown> = { classification: 'Not Calculable' as Classification, reason: d32 ? '' : 'sauterMeanDiameter not provided' };
      let uT: number | undefined;
      if (d32) {
        const tv = terminalVelocitySphere(d32.value, rhoD, rhoC, muC);
        for (const w of tv.warnings) warnings.push({ code: w.code, message: w.message });
        uT = tv.velocity;
        terminalVelocity = {
          classification: 'Calculated Screening Result' as Classification,
          basis: 'Rigid-sphere screening only — NOT a validated liquid-drop terminal velocity',
          velocity_m_s: tv.velocity, reynolds: tv.reynolds, dragCoefficient: tv.dragCoefficient, regime: tv.regime,
          d32_m: d32.value, continuousPhase, dispersedPhase,
        };
      }

      // Shape-regime groups (HYD-005) — require IFT (and d32; We also needs u_t)
      let shapeRegime: Record<string, unknown>;
      if (ift && d32) {
        const eo = eotvos(densityDifference, d32.value, ift.value);
        const mo = morton(muC, densityDifference, rhoC, ift.value);
        const we = uT !== undefined ? weber(rhoC, uT, d32.value, ift.value) : undefined;
        if (eo > 40) warnings.push({ code: 'EOTVOS_ABOVE_RIGID_SPHERE_RANGE', message: `Eo = ${eo.toFixed(1)} > 40 — strongly deformed drop regime; the rigid-sphere screening basis is poor.` });
        shapeRegime = {
          classification: 'Calculated Screening Result' as Classification,
          note: 'Shape-regime indicators only — no drop-drag correlation is applied',
          eotvos: eo, morton: mo, ...(we !== undefined ? { weber: we } : { weber: 'Not Calculable (terminal velocity unavailable)' }),
          interfacialTension: ift,
        };
      } else {
        shapeRegime = {
          classification: 'Not Calculable' as Classification,
          reason: !ift ? 'Interfacial tension not provided — required only for We/Eo/Mo and shape-regime warnings; all other hydraulic screening proceeds' : 'sauterMeanDiameter not provided',
        };
      }

      // Characteristic velocity & hindrance exponent (HYD-006)
      const uKEntered = parseTagged(inputs.characteristicVelocity, 'characteristicVelocity', errs, { min: 0, max: 10, minExclusive: true });
      const nEntered = parseTagged(inputs.hindranceExponent, 'hindranceExponent', errs, { min: 0, max: 10, minExclusive: true });
      const useUt = inputs.useTerminalVelocityAsCharacteristic === true;
      let uK: number | undefined;
      let uKBasis: string | undefined;
      let holdupForcePending = false;
      if (uKEntered) {
        uK = uKEntered.value;
        uKBasis = `Engineer-entered characteristic swarm/slip velocity (${uKEntered.sourceType}: ${uKEntered.sourceReference})`;
        if (uKEntered.sourceType === 'Assumed') { holdupForcePending = true; assumptions.push({ assumption: `Characteristic velocity u_K = ${uK} m/s is ASSUMED`, sourceType: uKEntered.sourceType, sourceReference: uKEntered.sourceReference, scope: 'run' }); }
      } else if (useUt && uT !== undefined) {
        uK = uT;
        uKBasis = 'PROVISIONAL — rigid-sphere terminal-velocity screening value reused as u_K by explicit engineer option';
        holdupForcePending = true;
        warnings.push({ code: 'CHARACTERISTIC_VELOCITY_FROM_RIGID_SPHERE_SCREENING', message: 'u_K taken from the rigid-sphere terminal-velocity screening value by explicit option — a characteristic swarm velocity and an isolated-droplet screening value are NOT the same quantity. All holdup and throughput results are Pending Validation until an experimental or vendor u_K is entered.' });
        assumptions.push({ assumption: `u_K provisionally taken equal to the rigid-sphere screening terminal velocity (${uT.toExponential(4)} m/s)`, sourceType: 'Assumed', sourceReference: 'Engineer option useTerminalVelocityAsCharacteristic', scope: 'run' });
      }
      let nExp: number | undefined;
      if (uK !== undefined && nEntered) {
        nExp = nEntered.value;
        if (nEntered.sourceType === 'Assumed') {
          holdupForcePending = true;
          warnings.push({ code: 'ASSUMED_HINDRANCE_EXPONENT', message: `Hindrance exponent n = ${nExp} is an explicit ASSUMED entry (${nEntered.sourceReference}) — n = 1 (or any assumed n) is NOT a universal liquid-liquid extraction relationship. Holdup/throughput results are Pending Validation.` });
          assumptions.push({ assumption: `Hindrance exponent n = ${nExp} is ASSUMED`, sourceType: nEntered.sourceType, sourceReference: nEntered.sourceReference, scope: 'run' });
        }
      }
      const holdupBasisAvailable = uK !== undefined && nExp !== undefined;

      // Configurable bounds / band / tolerance — all stored in the snapshot
      const hbIn = inputs.holdupBounds as Record<string, unknown> | undefined;
      const holdupBounds = hbIn ? { min: num(hbIn.min)!, max: num(hbIn.max)! } : { ...DEFAULT_HOLDUP_BOUNDS };
      if (holdupBounds.max > MODERATE_HOLDUP_LIMIT) {
        warnings.push({ code: 'HOLDUP_BOUND_ABOVE_MODERATE_LIMIT', message: `Configured holdup upper bound ${holdupBounds.max} exceeds the moderate-holdup applicability limit ${MODERATE_HOLDUP_LIMIT} — roots above ${MODERATE_HOLDUP_LIMIT} are outside the generic slip model's applicability.` });
      }
      const sbIn = inputs.screeningBandPercent as Record<string, unknown> | undefined;
      const screeningBand = sbIn ? { min: num(sbIn.min)!, max: num(sbIn.max)! } : { ...DEFAULT_SCREENING_BAND };
      const rootTol = num(inputs.rootIsolationTolerance) ?? DEFAULT_ROOT_ISOLATION_TOLERANCE;

      // Diameter sweep per independent case (HYD-007 / HYD-008)
      const sweep = inputs.diameterSweep as { min: number; max: number; step: number };
      const sweepMin = num(sweep.min)!; const sweepMax = num(sweep.max)!; const sweepStep = num(sweep.step)!;
      // Index-based generation — no additive float drift, bounded by validation (≤ 200 points)
      const nPoints = Math.floor((sweepMax - sweepMin) / sweepStep + 1e-9) + 1;
      const diameters: number[] = Array.from({ length: nPoints }, (_, i) => Number((sweepMin + i * sweepStep).toFixed(10)));

      const slipFn = holdupBasisAvailable ? (phi: number) => uK! * Math.pow(1 - phi, nExp!) : undefined;

      const runCase = (caseName: 'normal' | 'maximum', qNMP: number) => {
        const rows: Record<string, unknown>[] = [];
        let caseAmbiguity = false;
        for (const D of diameters) {
          const A = columnCrossSectionArea(D);
          const uRRBO = superficialVelocity(qRRBO_m3s, A);
          const uNMP = superficialVelocity(qNMP, A);
          const uC = rrboContinuous ? uRRBO : uNMP;
          const uD = rrboContinuous ? uNMP : uRRBO;
          const R = uC / Math.max(uD, SMALL);
          const row: Record<string, unknown> = {
            diameter_m: D, area_m2: A,
            rrboSuperficialVelocity_m_s: uRRBO, nmpSuperficialVelocity_m_s: uNMP,
            continuousSuperficialVelocity_m_s: uC, dispersedSuperficialVelocity_m_s: uD,
            flowRatio: { definition: 'R = u_c / u_d (continuous / dispersed superficial velocity)', value: R, continuousPhase, dispersedPhase },
          };
          if (!slipFn) {
            row.holdup = { classification: 'Not Calculable' as Classification, reason: 'No characteristic-velocity basis: enter source-tagged characteristicVelocity + hindranceExponent, or set useTerminalVelocityAsCharacteristic (with d32).' };
            row.genericHydraulicFeasibility = 'not_calculable';
            rows.push(row);
            continue;
          }
          // Generic Hydraulic Throughput Maximum at THIS case's ratio
          const uDofPhi = (phi: number) => (uK! * Math.pow(1 - phi, nExp! + 1) * phi) / ((1 - phi) + R * phi);
          const maxRes = maximizeThroughputAtFixedFlowRatio(uDofPhi, R, holdupBounds);
          for (const w of maxRes.warnings) if (!warnings.some((x) => x.code === w.code && x.message === w.message)) warnings.push({ code: w.code, message: w.message });
          const phiStar = maxRes.optimumHoldup;

          const holdupRes = solveCounterCurrentHoldup(slipFn, uD, uC, holdupBounds);
          for (const w of holdupRes.warnings) if (!warnings.some((x) => x.code === w.code)) warnings.push({ code: w.code, message: w.message });
          const allRoots = holdupRes.roots.map((phi) => ({
            holdup: phi,
            withinConfiguredBounds: phi >= holdupBounds.min && phi <= holdupBounds.max,
            belowThroughputOptimum: phi < phiStar,
            branch: phi < phiStar ? 'lower (operating candidate)' : 'upper (approach to hydraulic limit)',
          }));
          const candidates = allRoots.filter((r) => r.withinConfiguredBounds && r.belowThroughputOptimum).map((r) => r.holdup).sort((a, b) => a - b);
          let operatingHoldup: number | undefined;
          let holdupClassification: Classification;
          let holdupNote: string;
          let ambiguous = false;
          if (holdupRes.roots.length === 0) {
            holdupClassification = 'Not Calculable';
            holdupNote = 'No holdup satisfies the slip balance within the configured bounds — hydraulically infeasible at this diameter (or the slip basis is inconsistent).';
          } else if (candidates.length === 0) {
            holdupClassification = 'Not Calculable';
            holdupNote = 'No root below the throughput-optimum holdup inside the configured bounds — no stable operating branch identified.';
          } else {
            // Preliminary operating branch: lowest root below φ*, inside bounds,
            // AND isolated from every other root (including the upper branch)
            // by the configured tolerance. Otherwise AMBIGUOUS_HOLDUP_BRANCH.
            const lowest = candidates[0];
            const nearestOther = holdupRes.roots
              .filter((r) => Math.abs(r - lowest) > 1e-12)
              .reduce((m, r) => Math.min(m, Math.abs(r - lowest)), Number.POSITIVE_INFINITY);
            if (nearestOther > rootTol) {
              operatingHoldup = lowest;
              holdupClassification = holdupForcePending || propertyAssumed || (d32Assumed ?? false) ? 'Pending Validation' : 'Calculated Screening Result';
              holdupNote = holdupRes.roots.length === 1
                ? 'Single operating-branch root inside bounds and below the throughput optimum.'
                : `Lowest root below the throughput optimum selected: isolated from the nearest other root by ${nearestOther.toFixed(4)} > tolerance ${rootTol}.`;
            } else {
              ambiguous = true; caseAmbiguity = true;
              operatingHoldup = lowest;
              holdupClassification = 'Pending Validation';
              holdupNote = `AMBIGUOUS_HOLDUP_BRANCH: nearest other root is within the isolation tolerance ${rootTol} — no branch is silently chosen; the lowest root is reported as a candidate only.`;
            }
          }
          if (ambiguous) warnings.push({ code: 'AMBIGUOUS_HOLDUP_BRANCH', message: `${caseName} case, D = ${D} m: multiple plausible holdup roots within the isolation tolerance — operating holdup is Pending Validation.` });

          const pctRes = percentOfThroughputMaximum(uD, uC, maxRes);
          // Band classification is a CONFIGURABLE screening criterion — CEL's
          // fixed 40/80 practice notes are replaced by the configured band.
          const pct = pctRes.value;
          for (const w of pctRes.warnings) {
            if (w.code === 'FAR_BELOW_CAPACITY_LIMIT' || w.code === 'NEAR_CAPACITY_LIMIT') continue;
            if (!warnings.some((x) => x.message === w.message)) warnings.push({ code: w.code, message: w.message });
          }
          const feasibility =
            holdupRes.roots.length === 0 || pct >= 100 ? 'hydraulically_infeasible'
              : pct > screeningBand.max ? 'above_screening_band'
                : pct < screeningBand.min ? 'below_minimum_loading_band'
                  : 'within_screening_band';

          row.holdup = {
            classification: holdupClassification,
            allRoots, operatingHoldup: operatingHoldup ?? null, note: holdupNote, ambiguous,
            configuredBounds: { ...holdupBounds }, rootIsolationTolerance: rootTol,
          };
          row.genericHydraulicThroughputMaximum = {
            flowRatioDefinition: maxRes.flowRatioDefinition, flowRatioValue: maxRes.flowRatioValue,
            optimumHoldup: phiStar, dispersedVelocityAtMaximum_m_s: maxRes.dispersedVelocityAtMaximum,
            continuousVelocityAtMaximum_m_s: maxRes.continuousVelocityAtMaximum,
            classification: holdupForcePending || propertyAssumed ? 'Pending Validation' as Classification : 'Calculated Screening Result' as Classification,
          };
          row.percentageOfGenericHydraulicThroughputMaximum = pct;
          row.genericHydraulicFeasibility = feasibility;
          row.interfacialArea = (operatingHoldup !== undefined && !ambiguous && d32)
            ? { classification: holdupClassification, value_m2_m3: interfacialArea(operatingHoldup, d32.value), basis: 'a = 6·φ_operating/d32 — from the established operating holdup only' }
            : { classification: 'Not Calculable' as Classification, reason: !d32 ? 'sauterMeanDiameter not provided' : operatingHoldup === undefined ? 'No established operating holdup' : 'Operating branch is ambiguous — interfacial area from an unresolved root is not reported' };
          rows.push(row);
        }
        const feasible = rows.filter((r) => r.genericHydraulicFeasibility === 'within_screening_band' || r.genericHydraulicFeasibility === 'above_screening_band' || r.genericHydraulicFeasibility === 'below_minimum_loading_band');
        const within = rows.filter((r) => r.genericHydraulicFeasibility === 'within_screening_band');
        return {
          caseName,
          solventMassFlow_kg_h: caseName === 'normal' ? normalSolventMassFlow : maximumSolventMassFlow,
          nmpVolumetricFlow_m3_h: qNMP * 3600,
          rrboVolumetricFlow_m3_h: qRRBO_m3s * 3600,
          screeningBandPercent: { ...screeningBand, note: 'Configurable screening criterion — not a universal engineering rule' },
          diameters: rows,
          summary: {
            hydraulicallyInfeasibleDiameters_m: rows.filter((r) => r.genericHydraulicFeasibility === 'hydraulically_infeasible').map((r) => r.diameter_m),
            aboveScreeningBandDiameters_m: rows.filter((r) => r.genericHydraulicFeasibility === 'above_screening_band').map((r) => r.diameter_m),
            withinScreeningBandDiameters_m: within.map((r) => r.diameter_m),
            belowMinimumLoadingBandDiameters_m: rows.filter((r) => r.genericHydraulicFeasibility === 'below_minimum_loading_band').map((r) => r.diameter_m),
            minimumFeasibleDiameter_m: feasible.length ? (feasible[0].diameter_m as number) : null,
            screeningBandDiameterRange_m: within.length ? { min: within[0].diameter_m, max: within[within.length - 1].diameter_m } : null,
            selectedTrialDiameter_m: num(inputs.selectedTrialDiameter) ?? null,
            selectedTrialDiameterNote: inputs.selectedTrialDiameter !== undefined ? 'Engineer-selected trial diameter (echoed, not engine-recommended)' : 'No trial diameter selected — the engine does not recommend one',
          },
          caseAmbiguity,
        };
      };

      const normalCase = runCase('normal', qNMP_normal_m3s);
      const maximumCase = runCase('maximum', qNMP_maximum_m3s);

      const anyPending = propertyAssumed || holdupForcePending || d32Assumed || normalCase.caseAmbiguity || maximumCase.caseAmbiguity;
      const calculationRunStatus = anyPending ? 'pending_validation' : 'screening_complete';

      const data: Record<string, unknown> = {
        applicabilityStatement: APPLICABILITY_STATEMENT,
        limitations: LIMITATIONS,
        calculationRunStatus,
        celVersion: CEL_VERSION, epdVersion: EPD_VERSION, engineVersion: this.getEngineVersion(),
        designBasis: {
          operatingTemperatureC: T,
          phaseConfiguration: { input: phaseConfig, continuousPhase, dispersedPhase, note: 'Phase continuity is taken from the engineer input only; density gives buoyancy direction, not continuity.' },
          densityDifference_kg_m3: densityDifference,
          feedFluid: {
            id: 'rrbo', name: 'RRBO (Re-Refined Base Oil)',
            density: { value: rhoRRBO.value, unit: rhoRRBO.unit, source: rhoRRBO.source },
            dynamicViscosity: { value: muRRBO.value, unit: muRRBO.unit, source: muRRBO.source },
            enteredDensity: feedDensityEntry, enteredViscosity: feedViscosityEntry,
          },
          solventFluid: {
            id: 'nmp', density: { value: rhoNMP.value, unit: rhoNMP.unit, source: rhoNMP.source },
            dynamicViscosity: { value: muNMP.value, unit: muNMP.unit, source: muNMP.source },
          },
          interfacialTension: ift ?? { classification: 'Not Calculable' as Classification, note: 'Not provided — blocks only We/Eo/Mo and shape-regime items' },
          sauterMeanDiameter: d32 ?? null,
          d32ScreeningBand: d32Band ?? null,
          characteristicVelocity: uK !== undefined ? { value_m_s: uK, basis: uKBasis } : { classification: 'Not Calculable' as Classification, note: 'No u_K basis entered' },
          hindranceExponent: nEntered ?? null,
          slipModel: 'u_slip(φ) = u_K·(1−φ)^n — generic screening form; u_K and n require experimental or vendor validation',
          holdupBounds: { ...holdupBounds, moderateHoldupApplicabilityLimit: MODERATE_HOLDUP_LIMIT },
          rootIsolationTolerance: rootTol,
          flows: {
            feedMassFlow_kg_h: feedMassFlow, normalSolventMassFlow_kg_h: normalSolventMassFlow,
            maximumSolventMassFlow_kg_h: maximumSolventMassFlow, maxCirculationFactor,
          },
          ...(solventFlowConsistency ? { solventFlowConsistency } : {}),
        },
        terminalVelocityScreening: terminalVelocity,
        shapeRegimeIndicators: shapeRegime,
        normalCase, maximumCase,
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
    const normal = results.normalCase as Record<string, unknown> | undefined;
    const summary = normal?.summary as Record<string, unknown> | undefined;
    const status = results.calculationRunStatus as string | undefined;
    const keyResults = [
      summary?.minimumFeasibleDiameter_m != null ? { label: 'Minimum feasible diameter (normal case)', value: summary.minimumFeasibleDiameter_m as number, unit: 'm', highlight: true } : null,
      status ? { label: 'Run status', value: status, highlight: true } : null,
    ].filter(Boolean) as DesignSummary['keyResults'];
    return {
      keyResults,
      recommendations: [
        'PRELIMINARY GENERIC HYDRAULIC SCREENING — NOT ECP OR ECR RATING.',
        'Validate u_K and n experimentally or via vendor data before any rating work.',
      ],
      warnings: [],
      calculationClass: 'Preliminary Screening',
    };
  }
}
