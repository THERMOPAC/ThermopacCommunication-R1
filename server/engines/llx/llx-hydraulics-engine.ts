import { GOVERNED_HOLDUP_BOUNDS, GOVERNED_SCREENING_BAND } from './llx-governed-design-criteria';

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
import {
  packingHydraulicDiameter, phaseLoadFactor, packingPhaseReynolds,
  dryPackingPressureDropPerLength, fanningLaminarPipeReference,
  classifyPackingFlowRegime, DUSS_2013_CITATION, ZOGG_1972_CITATION,
  evaluateDuss2013ReCf, type Duss2013DatasetRecord,
} from '../../engine-framework/common-engineering-library';
import {
  type PerformanceBasis,
  evaluatePerformanceBasis, performanceBasisAssumed, validatePerformanceBasis,
} from '../../engine-framework/packing/database';

// ── Structures ────────────────────────────────────────────────────────────────

interface TaggedValue { value: number; sourceType: SourceType; sourceReference: string }

const PHASE_CONFIGS = ['rrbo_continuous_nmp_dispersed', 'nmp_continuous_rrbo_dispersed'] as const;
type PhaseConfig = (typeof PHASE_CONFIGS)[number];

type Classification = 'Calculated Screening Result' | 'Pending Validation' | 'Not Calculable';

// Numerical solver tolerances — NOT engineering design criteria (see llx-governed-design-criteria.ts).
const RATIO_TOLERANCE = 0.001;           // 0.1 % solvent-basis consistency check (PD-003)
const DEFAULT_ROOT_ISOLATION_TOLERANCE = 0.02; // holdup branch isolation (bisection solver only)
const SMALL = 1e-12;

// Moderate-holdup applicability ceiling — Godfrey slip model boundary.
const MODERATE_HOLDUP_LIMIT = 0.60;
const GRAVITY_M_S2 = 9.80665;
const ASADOLLAHZADEH_2017_KUHNI_VK_PRELIMINARY = 'ASADOLLAHZADEH_2017_KUHNI_VK_PRELIMINARY';
const KUHNI_VK_ROUTE_REFERENCE =
  'Asadollahzadeh, M.; Torkaman, R.; Torab-Mostaedi, M. “New correlations for slip velocity and characteristic velocity in a rotary liquid–liquid extraction column.” Chemical Engineering Research & Design 127 (2017), 146–153. https://doi.org/10.1016/j.cherd.2017.07.032';

// This is deliberately a server-owned evidence record, not a workspace field.
// The publisher's article record and abstract have been checked, but the
// controlled primary equation page has not been obtained. Do not infer units,
// fitted ranges, geometry, or an approved m from the supplied expression, and
// do not let a client-side field advance the explicit rejected-use decision.
const KUHNI_VK_SOURCE_EVIDENCE = Object.freeze({
  recordId: 'LLX-ECR-KUHNI-VK-2017-001',
  status: 'engineer_rejected_design_use',
  capacitySweepAllowed: false,
  primarySource: {
    citation: KUHNI_VK_ROUTE_REFERENCE,
    publisherRecordUrl: 'https://www.sciencedirect.com/science/article/abs/pii/S0263876217304100',
    verification: 'Publisher bibliographic record and abstract verified',
  },
  sourceControl: {
    assessmentDate: '2026-08-22',
    equationPageStatus: 'not_retained_primary_material_unavailable',
    equationPageNote: 'The publisher record exposes institutional-access and purchase paths only; no lawful equation page was available to retain in the controlled record.',
  },
  equation: {
    suppliedExpression: 'V_k = 0.237·(ρ_c/Δρ)^0.741·Fr^-0.184·N_μ^-0.095·(1+0.052·α_MT)',
    nativeOutputUnit: null,
    unitStatus: 'Unknown — no controlled primary equation page retained',
    transcriptionStatus: 'Not independently checked against a primary equation page; supplied expression is audit-only',
  },
  applicability: {
    validRanges: null,
    rangeStatus: 'Unknown — no controlled primary equation page retained',
    testedSystem: 'Publisher abstract: three liquid–liquid systems with and without mass transfer, including toluene–water with silica nanoparticles.',
    testedGeometry: null,
    geometryStatus: 'Unknown — no controlled primary equation page retained',
    projectOperatingEnvelope: 'NMP-continuous/RRBO-dispersed extraction with Stage 4 operating-temperature properties and Stage 7 rotor ratio/speed.',
    projectApplicability: 'Not comparable: no source ranges or full geometry are available, and no NMP/RRBO calibration has been established.',
  },
  routeSpecificHindranceExponent: {
    requirement: 'A separately sourced, route-specific m with a controlled source, validity context, and review is required.',
    reviewStatus: 'not_accepted_for_design_use',
    note: 'Any workspace m is retained only as audit provenance; none is accepted to enable capacity or diameter calculations.',
  },
  engineerReview: {
    decision: 'rejected',
    decisionDate: '2026-08-22',
    scope: 'Stage 5 generic hydraulic capacity and diameter screening only',
    capacityUseApproved: false,
    diameterUseApproved: false,
    rationale: 'Reject design use because the controlled primary equation page, native V_k output unit, independently checked transcription, fitted ranges, full tested geometry, NMP/RRBO applicability, and approved route-specific m are unavailable.',
  },
  blockers: [
    'Controlled primary equation page and native V_k output unit are unavailable.',
    'Independent primary-source transcription check is unavailable.',
    'Fitted validity ranges and full tested geometry are unavailable.',
    'NMP/RRBO applicability and calibration are unavailable.',
    'No route-specific m has been accepted for design use.',
    'Engineer review explicitly rejects capacity and diameter use.',
  ],
  reviewStatus: 'Engineer rejected capacity and diameter use; audit output only',
});

const C3_PRESSURE_DROP_CLASSIFICATION = 'Controlled Literature Prediction — Preliminary / Pending RRBO-NMP Validation';
const ALLOWED_CF_PROVENANCE = ['measured', 'controlled_literature', 'vendor_document'] as const;
type CfProvenance = (typeof ALLOWED_CF_PROVENANCE)[number];

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

function calculateAsadollahzadehKuhniVk(input: {
  diameter_m: number;
  rotorToColumnDiameterRatio: number;
  rotorSpeed_rpm: number;
  continuousDensity_kg_m3: number;
  dispersedDensity_kg_m3: number;
  densityDifference_kg_m3: number;
  continuousViscosity_Pa_s: number;
  interfacialTension_N_m: number;
  alphaMT: -1 | 0 | 1;
}) {
  const rotorDiameter_m = input.rotorToColumnDiameterRatio * input.diameter_m;
  const rotationalSpeed_s_1 = input.rotorSpeed_rpm / 60;
  const froude = (rotationalSpeed_s_1 ** 2 * rotorDiameter_m) / GRAVITY_M_S2;
  const morton =
    ((input.continuousViscosity_Pa_s ** 4) * GRAVITY_M_S2)
    / (input.dispersedDensity_kg_m3 * (input.interfacialTension_N_m ** 3));
  const directionFactor = 1 + 0.052 * input.alphaMT;
  const velocity =
    0.237
    * Math.pow(input.continuousDensity_kg_m3 / input.densityDifference_kg_m3, 0.741)
    * Math.pow(froude, -0.184)
    * Math.pow(morton, -0.095)
    * directionFactor;

  return {
    nativeOutputValue: velocity,
    froudeNumber: froude,
    mortonNumber: morton,
    rotorDiameter_m,
    rotationalSpeed_s_1,
    alphaMT: input.alphaMT,
    directionFactor,
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
    const characteristicVelocityRoute = String(inputs.characteristicVelocityRoute ?? '').trim();
    const usesKuhniVkRoute = characteristicVelocityRoute === ASADOLLAHZADEH_2017_KUHNI_VK_PRELIMINARY;
    if (characteristicVelocityRoute !== '' && !usesKuhniVkRoute) {
      err('characteristicVelocityRoute', `Unsupported characteristic-velocity route: ${characteristicVelocityRoute}`);
    }
    if (usesKuhniVkRoute) {
      parseTagged(inputs.rotorToColumnDiameterRatio, 'rotorToColumnDiameterRatio', errors, { min: 0, max: 1, minExclusive: true, maxExclusive: true });
      parseTagged(inputs.rotorSpeed, 'rotorSpeed', errors, { min: 0, max: 5000, minExclusive: true });
      if (inputs.interfacialTension === undefined || inputs.interfacialTension === null) {
        err('interfacialTension', `${ASADOLLAHZADEH_2017_KUHNI_VK_PRELIMINARY} requires interfacialTension γ (N/m) at the operating temperature`);
      }
      const transferDirection = String(inputs.kuhniVkTransferDirection ?? '').trim();
      if (!['d_to_c', 'no_transfer', 'c_to_d'].includes(transferDirection)) {
        err('kuhniVkTransferDirection', `${ASADOLLAHZADEH_2017_KUHNI_VK_PRELIMINARY} requires an explicit resolved transfer direction: d_to_c, no_transfer, or c_to_d`);
      }
      const m = parseTagged(inputs.kuhniVkHindranceExponent, 'kuhniVkHindranceExponent', errors, { min: 0, max: 10, minExclusive: true });
      if (m?.value === 1 && m.sourceType === 'Assumed') {
        err('kuhniVkHindranceExponent', 'The Kühni-route hindrance exponent m = 1 cannot be an Assumed carry-over. Provide a separately sourced route-specific value.');
      }
      if (uK !== undefined || useUt) {
        err('characteristicVelocityRoute', `${ASADOLLAHZADEH_2017_KUHNI_VK_PRELIMINARY} is a separate basis. Do not combine it with characteristicVelocity or useTerminalVelocityAsCharacteristic.`);
      }
    }
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

    // Diameter basis — EITHER a range sweep (strictly min < max) OR an explicit
    // list. A single diameter must be given explicitly via diameterValues: [D]
    // (or evaluated as selectedTrialDiameter within a sweep) — never min = max.
    const sweep = inputs.diameterSweep as Record<string, unknown> | undefined;
    const values = inputs.diameterValues as unknown;
    if (sweep && values !== undefined) {
      err('diameterValues', 'Provide EITHER diameterSweep OR diameterValues — not both');
    } else if (values !== undefined) {
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

    // Optional pressure-drop basis (HYD-009) — structural validation only;
    // detailed per-diameter computation proceeds in calculate() as non-blocking
    const pdBasisRaw = inputs.pressureDropBasis;
    if (pdBasisRaw !== undefined && pdBasisRaw !== null) {
      if (typeof pdBasisRaw !== 'object' || Array.isArray(pdBasisRaw)) {
        err('pressureDropBasis', 'pressureDropBasis must be an object when provided');
      } else {
        const pdb = pdBasisRaw as Record<string, unknown>;
        const psa = pdb.packingSpecificSurface as Record<string, unknown> | undefined;
        if (!psa) {
          err('pressureDropBasis.packingSpecificSurface', 'pressureDropBasis.packingSpecificSurface { value (m²/m³), sourceType, sourceReference } is required when pressureDropBasis is provided');
        } else {
          const v = num(psa.value);
          if (v === undefined || v <= 0) err('pressureDropBasis.packingSpecificSurface.value', 'packingSpecificSurface.value must be > 0 (m²/m³)');
          if (!SOURCE_TYPES.includes(psa.sourceType as SourceType)) err('pressureDropBasis.packingSpecificSurface.sourceType', `packingSpecificSurface.sourceType must be one of ${SOURCE_TYPES.join(', ')}`);
          if (typeof psa.sourceReference !== 'string' || !(psa.sourceReference as string).trim()) err('pressureDropBasis.packingSpecificSurface.sourceReference', 'packingSpecificSurface.sourceReference is mandatory');
        }
        // cf may come from the governed Duss 2013 dataset (auto-injected) OR from a user-entered frictionFactorBasis.
        const hasGoverned = pdb.governedReCfDataset !== undefined && pdb.governedReCfDataset !== null;
        if (!hasGoverned && !pdb.frictionFactorBasis) {
          err('pressureDropBasis.frictionFactorBasis', 'pressureDropBasis: either governedReCfDataset (auto-injected) or frictionFactorBasis + frictionFactorProvenance is required');
        }
        if (!hasGoverned && pdb.frictionFactorBasis && !ALLOWED_CF_PROVENANCE.includes(pdb.frictionFactorProvenance as CfProvenance)) {
          err('pressureDropBasis.frictionFactorProvenance', `frictionFactorProvenance must be one of: ${ALLOWED_CF_PROVENANCE.join(', ')} — vendor-SOFTWARE outputs (Sulcol, DRP, etc.) are prohibited by project directive; a controlled provenance class is mandatory`);
        }
      }
    }

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
      const muC_Pas = muC;   // muC is already Pa·s from EPD (dynamic viscosity)
      const densityDifference = Math.abs(rhoC - rhoD);

      // HYD-009: Single-phase frictional pressure drop basis — Duss 2013 / Zogg
      // All results classified: C3_PRESSURE_DROP_CLASSIFICATION.
      // Non-blocking: if the basis is absent or malformed, pressure drop fields
      // are omitted from each diameter row without affecting holdup/throughput.
      const pdIn = inputs.pressureDropBasis as Record<string, unknown> | undefined;
      let dhSetup: { dh_m: number; a_m2_m3: number; source: string } | undefined;
      let cfBasis: PerformanceBasis | undefined;
      let cfProvenance: CfProvenance | undefined;
      let corrAngleDeg: number | undefined;
      let vendorDpBasis: PerformanceBasis | undefined;
      let governedDataset: Duss2013DatasetRecord | undefined;
      let pdBasisAssumed = false;
      if (pdIn) {
        try {
          const psa = pdIn.packingSpecificSurface as Record<string, unknown>;
          const a = num(psa?.value);
          if (a !== undefined && a > 0) {
            const dh = packingHydraulicDiameter(a);
            dhSetup = { dh_m: dh, a_m2_m3: a, source: `${psa.sourceType}: ${psa.sourceReference}` };
          }
          const angleIn = pdIn.packingCorrugationAngleDeg as Record<string, unknown> | undefined;
          if (angleIn) corrAngleDeg = num(angleIn.value);
          cfBasis = pdIn.frictionFactorBasis as PerformanceBasis | undefined;
          cfProvenance = pdIn.frictionFactorProvenance as CfProvenance | undefined;
          if (cfBasis && performanceBasisAssumed(cfBasis)) {
            pdBasisAssumed = true;
            assumptions.push({ assumption: 'Packing friction factor c_f is tagged Assumed — pressure drop results are Pending Validation', sourceType: 'Assumed', sourceReference: (cfBasis as Record<string, unknown>).sourceReference as string ?? 'pressureDropBasis.frictionFactorBasis', scope: 'run' });
          }
          governedDataset = pdIn.governedReCfDataset as Duss2013DatasetRecord | undefined;
          vendorDpBasis = pdIn.vendorPressureDropBasis as PerformanceBasis | undefined;
          // Detailed frictionFactorBasis validation issues → warnings (non-blocking)
          if (cfBasis) {
            for (const issue of validatePerformanceBasis(cfBasis, 'pressureDropBasis.frictionFactorBasis')) {
              warnings.push({ code: 'PRESSURE_DROP_BASIS_ISSUE', message: `${issue.field}: ${issue.message}` });
            }
          }
          if (vendorDpBasis) {
            for (const issue of validatePerformanceBasis(vendorDpBasis, 'pressureDropBasis.vendorPressureDropBasis')) {
              warnings.push({ code: 'PRESSURE_DROP_BASIS_ISSUE', message: `${issue.field}: ${issue.message}` });
            }
          }
        } catch (pdErr) {
          warnings.push({ code: 'PRESSURE_DROP_BASIS_ISSUE', message: `Pressure drop basis parse error: ${(pdErr as Error).message}` });
          dhSetup = undefined; cfBasis = undefined; vendorDpBasis = undefined; governedDataset = undefined;
        }
      }
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
      const characteristicVelocityRoute = String(inputs.characteristicVelocityRoute ?? '').trim();
      const usesKuhniVkRoute = characteristicVelocityRoute === ASADOLLAHZADEH_2017_KUHNI_VK_PRELIMINARY;
      const kuhniRotorRatio = usesKuhniVkRoute
        ? parseTagged(inputs.rotorToColumnDiameterRatio, 'rotorToColumnDiameterRatio', errs, { min: 0, max: 1, minExclusive: true, maxExclusive: true })
        : undefined;
      const kuhniRotorSpeed = usesKuhniVkRoute
        ? parseTagged(inputs.rotorSpeed, 'rotorSpeed', errs, { min: 0, max: 5000, minExclusive: true })
        : undefined;
      const kuhniM = usesKuhniVkRoute
        ? parseTagged(inputs.kuhniVkHindranceExponent, 'kuhniVkHindranceExponent', errs, { min: 0, max: 10, minExclusive: true })
        : undefined;
      const kuhniTransferDirection = String(inputs.kuhniVkTransferDirection ?? '').trim();
      const kuhniAlphaMT: -1 | 0 | 1 | undefined = kuhniTransferDirection === 'd_to_c'
        ? 1
        : kuhniTransferDirection === 'no_transfer'
          ? 0
          : kuhniTransferDirection === 'c_to_d'
            ? -1
            : undefined;
      // Only the server-owned evidence record can allow a route-specific
      // capacity sweep. A separately sourced m is necessary but not sufficient.
      const kuhniCapacitySweepAllowed = usesKuhniVkRoute
        && KUHNI_VK_SOURCE_EVIDENCE.capacitySweepAllowed
        && KUHNI_VK_SOURCE_EVIDENCE.engineerReview.capacityUseApproved
        && KUHNI_VK_SOURCE_EVIDENCE.engineerReview.diameterUseApproved
        && kuhniM !== undefined;
      let uK: number | undefined;
      let uKBasis: string | undefined;
      let holdupForcePending = false;
      if (usesKuhniVkRoute) {
        uKBasis = `PRELIMINARY — ${ASADOLLAHZADEH_2017_KUHNI_VK_PRELIMINARY}; calculated per trial diameter from Stage 4 operating-temperature properties and Stage 7 rotor ratio/speed`;
        holdupForcePending = true;
        warnings.push({
          code: 'KUHNI_VK_DESIGN_USE_REJECTED',
          message: `${ASADOLLAHZADEH_2017_KUHNI_VK_PRELIMINARY} is explicitly rejected for capacity and diameter use. The controlled primary equation page, native output unit, transcription check, ranges, geometry, NMP/RRBO applicability, and an accepted route-specific m are unavailable. V_k is shown only as an audit expression output; no holdup, capacity, feasibility, or diameter sweep is run.`,
        });
        assumptions.push({
          assumption: 'The Asadollahzadeh 2017 V_k expression is retained as an audit-only record. Engineer review rejects its use for capacity and diameter decisions until controlled primary evidence and route-specific m review are complete.',
          sourceType: 'Literature',
          sourceReference: KUHNI_VK_ROUTE_REFERENCE,
          scope: 'run',
        });
      } else if (uKEntered) {
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
      if (usesKuhniVkRoute && kuhniM) {
        nExp = kuhniM.value;
        if (kuhniM.sourceType === 'Assumed') {
          holdupForcePending = true;
          warnings.push({ code: 'ASSUMED_KUHNI_HINDRANCE_EXPONENT', message: `Kühni-route hindrance exponent m = ${nExp} is Assumed (${kuhniM.sourceReference}); capacity results remain Pending Validation.` });
        }
      } else if (uK !== undefined && nEntered) {
        nExp = nEntered.value;
        if (nEntered.sourceType === 'Assumed') {
          holdupForcePending = true;
          warnings.push({ code: 'ASSUMED_HINDRANCE_EXPONENT', message: `Hindrance exponent n = ${nExp} is an explicit ASSUMED entry (${nEntered.sourceReference}) — n = 1 (or any assumed n) is NOT a universal liquid-liquid extraction relationship. Holdup/throughput results are Pending Validation.` });
          assumptions.push({ assumption: `Hindrance exponent n = ${nExp} is ASSUMED`, sourceType: nEntered.sourceType, sourceReference: nEntered.sourceReference, scope: 'run' });
        }
      }
      const holdupBasisAvailable = (uK !== undefined && nExp !== undefined) || kuhniCapacitySweepAllowed;

      // Configurable bounds / band / tolerance — all stored in the snapshot
      const hbIn = inputs.holdupBounds as Record<string, unknown> | undefined;
      const holdupBounds = hbIn ? { min: num(hbIn.min)!, max: num(hbIn.max)! } : { ...GOVERNED_HOLDUP_BOUNDS };
      if (holdupBounds.max > MODERATE_HOLDUP_LIMIT) {
        warnings.push({ code: 'HOLDUP_BOUND_ABOVE_MODERATE_LIMIT', message: `Configured holdup upper bound ${holdupBounds.max} exceeds the moderate-holdup applicability limit ${MODERATE_HOLDUP_LIMIT} — roots above ${MODERATE_HOLDUP_LIMIT} are outside the generic slip model's applicability.` });
      }
      const sbIn = inputs.screeningBandPercent as Record<string, unknown> | undefined;
      const screeningBand = sbIn ? { min: num(sbIn.min)!, max: num(sbIn.max)! } : { ...GOVERNED_SCREENING_BAND };
      const rootTol = num(inputs.rootIsolationTolerance) ?? DEFAULT_ROOT_ISOLATION_TOLERANCE;

      // Diameter sweep per independent case (HYD-007 / HYD-008)
      let diameters: number[];
      if (inputs.diameterValues !== undefined) {
        diameters = (inputs.diameterValues as unknown[]).map((v) => num(v)!);
      } else {
        const sweep = inputs.diameterSweep as { min: number; max: number; step: number };
        const sweepMin = num(sweep.min)!; const sweepMax = num(sweep.max)!; const sweepStep = num(sweep.step)!;
        // Index-based generation — no additive float drift, bounded by validation (≤ 200 points)
        const nPoints = Math.floor((sweepMax - sweepMin) / sweepStep + 1e-9) + 1;
        diameters = Array.from({ length: nPoints }, (_, i) => Number((sweepMin + i * sweepStep).toFixed(10)));
      }

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
          const kuhniVk = usesKuhniVkRoute && kuhniRotorRatio && kuhniRotorSpeed && kuhniAlphaMT !== undefined && ift
            ? calculateAsadollahzadehKuhniVk({
                diameter_m: D,
                rotorToColumnDiameterRatio: kuhniRotorRatio.value,
                rotorSpeed_rpm: kuhniRotorSpeed.value,
                continuousDensity_kg_m3: rhoC,
                dispersedDensity_kg_m3: rhoD,
                densityDifference_kg_m3: densityDifference,
                continuousViscosity_Pa_s: muC,
                interfacialTension_N_m: ift.value,
                alphaMT: kuhniAlphaMT,
              })
            : undefined;
          const uKAtDiameter = kuhniCapacitySweepAllowed ? kuhniVk?.nativeOutputValue : uK;
          const rowSlipFn = holdupBasisAvailable && uKAtDiameter !== undefined
            ? (phi: number) => uKAtDiameter * Math.pow(1 - phi, nExp!)
            : undefined;
          if (kuhniVk) {
            row.characteristicVelocity = {
              routeId: ASADOLLAHZADEH_2017_KUHNI_VK_PRELIMINARY,
              classification: 'Pending Validation' as Classification,
              nativeOutputValue: kuhniVk.nativeOutputValue,
              nativeOutputUnit: KUHNI_VK_SOURCE_EVIDENCE.equation.nativeOutputUnit,
              froudeNumber: kuhniVk.froudeNumber,
              mortonNumber: kuhniVk.mortonNumber,
              rotorDiameter_m: kuhniVk.rotorDiameter_m,
              rotorSpeed_rpm: kuhniRotorSpeed?.value,
              alphaMT: kuhniVk.alphaMT,
              transferDirection: kuhniTransferDirection,
              equation: 'V_k = 0.237·(ρ_c/Δρ)^0.741·Fr^-0.184·N_μ^-0.095·(1+0.052·α_MT)',
              sourceReference: KUHNI_VK_ROUTE_REFERENCE,
              evidenceStatus: KUHNI_VK_SOURCE_EVIDENCE.status,
              capacitySweepAllowed: KUHNI_VK_SOURCE_EVIDENCE.capacitySweepAllowed,
            };
          }
          if (!rowSlipFn) {
            row.holdup = {
              classification: 'Not Calculable' as Classification,
              reason: usesKuhniVkRoute
                ? (kuhniM
                  ? 'Kühni V_k design use is rejected. The supplied m is audit provenance only; controlled primary evidence, an independently checked transcription, validity ranges, geometry, NMP/RRBO applicability, and accepted m review are unavailable.'
                  : 'Kühni V_k design use is rejected. A route-specific m is absent, the rigid-sphere route n is not reused, and controlled primary evidence is unavailable.')
                : 'No characteristic-velocity basis: enter source-tagged characteristicVelocity + hindranceExponent, or set useTerminalVelocityAsCharacteristic (with d32).',
            };
            row.genericHydraulicThroughputMaximum = {
              classification: 'Not Calculable' as Classification,
              reason: usesKuhniVkRoute
                ? (kuhniM
                  ? 'Kühni-route capacity sweep is rejected by the engineer review; supplied m is not accepted for design use.'
                  : 'Kühni-route limiting throughput requires a separately sourced, reviewed m, but engineer review also rejects capacity use pending controlled evidence.')
                : 'No complete characteristic-velocity and hindrance-exponent basis.',
            };
            row.percentageOfGenericHydraulicThroughputMaximum = null;
            row.genericHydraulicFeasibility = 'not_calculable';
            row.interfacialArea = { classification: 'Not Calculable' as Classification, reason: 'No established operating holdup' };
          } else {
          // Generic Hydraulic Throughput Maximum at THIS case's ratio
          const uDofPhi = (phi: number) => (uKAtDiameter! * Math.pow(1 - phi, nExp! + 1) * phi) / ((1 - phi) + R * phi);
          const maxRes = maximizeThroughputAtFixedFlowRatio(uDofPhi, R, holdupBounds);
          for (const w of maxRes.warnings) if (!warnings.some((x) => x.code === w.code && x.message === w.message)) warnings.push({ code: w.code, message: w.message });
          const phiStar = maxRes.optimumHoldup;

          const holdupRes = solveCounterCurrentHoldup(rowSlipFn, uD, uC, holdupBounds);
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
          // Screening band is SUSPENDED (no governed source). C3 reports only
          // hydraulically_feasible / hydraulically_infeasible.
          const feasibility =
            holdupRes.roots.length === 0 || pct >= 100 ? 'hydraulically_infeasible'
              : 'hydraulically_feasible';

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
          }

          // HYD-009: Duss 2013 / Zogg single-phase frictional ΔP/Δz — per diameter
          // cf source priority: (1) governed Duss 2013 dataset (auto-injected), (2) user-entered constant/tabular cfBasis.
          if (dhSetup && (governedDataset || (cfBasis && cfProvenance))) {
            const { dh_m: dh, a_m2_m3: a } = dhSetup;
            const re = uC > 0 ? packingPhaseReynolds(uC, rhoC, dh, muC_Pas) : 0;
            const fv = phaseLoadFactor(uC, rhoC);
            const regime = uC > 0 && re > 0 ? classifyPackingFlowRegime(re, corrAngleDeg) : { regime: 'Not Determinable' as const, criticalReynolds: null, basis: 'u_c = 0 — no flow' };
            const fRef = uC > 0 && re > 0 ? fanningLaminarPipeReference(re) : null;

            const litResult: Record<string, unknown> = {
              classification: C3_PRESSURE_DROP_CLASSIFICATION,
              continuousPhaseSuperficialVelocity_m_s: uC,
              hydraulicDiameter_m: dh,
              specificSurfaceArea_m2_m3: a,
              phaseReynolds: uC > 0 ? re : null,
              phaseLoadFactor_Pa05: fv,
              flowRegime: { regime: regime.regime, criticalReynolds: regime.criticalReynolds, basis: regime.basis },
              laminarPipeReferenceFrictionFactor: fRef ? { value: fRef.value, applicabilityNote: fRef.applicabilityNote } : null,
            };

            if (governedDataset) {
              // ── Governed Duss 2013 dataset path ──
              // evaluateDuss2013ReCf applies the governed range policy:
              //   - within [tableMin, tableMax] → piecewise linear interpolation
              //   - below tableMin → 'below_range', boundary minimum estimate provided (NOT design ΔP)
              //   - above tableMax → 'above_range', no estimate
              const cfEval = evaluateDuss2013ReCf(re > 0 ? re : 1e-12, governedDataset);
              if (cfEval.status === 'interpolated' && cfEval.cf !== null) {
                const dpm = uC > 0 ? dryPackingPressureDropPerLength(cfEval.cf, dh, rhoC, uC) : 0;
                litResult.frictionFactor = {
                  value: cfEval.cf,
                  status: 'interpolated',
                  provenance: 'controlled_literature',
                  source: governedDataset.sourceDocuments.join('; '),
                  note: cfEval.note,
                };
                litResult.pressureDropPerMeter_Pa_m = dpm;
                litResult.outsideTabularRange = false;
              } else {
                // below_range or above_range — report without blocking the row
                litResult.frictionFactor = {
                  notCalculable: true,
                  status: cfEval.status,
                  note: cfEval.note,
                  provenance: 'controlled_literature',
                };
                litResult.pressureDropPerMeter_Pa_m = null;
                litResult.outsideTabularRange = true;
                litResult.outsideTabularRangeStatus = cfEval.status;
                // For below_range only: boundary minimum estimate as indicative lower bound
                if (cfEval.status === 'below_range' && cfEval.boundaryMinimum) {
                  const { cfAtBoundary, boundaryRe } = cfEval.boundaryMinimum;
                  const dpmBoundary = uC > 0 ? dryPackingPressureDropPerLength(cfAtBoundary, dh, rhoC, uC) : 0;
                  litResult.pressureDropBoundaryMinimumEstimate = {
                    classification: 'Published-boundary minimum ΔP estimate — NOT design ΔP. Do not use for column sizing acceptance/rejection.',
                    cf: cfAtBoundary,
                    cfAtPublishedRe: boundaryRe,
                    pressureDropPerMeter_Pa_m: dpmBoundary,
                    operatingRe: re,
                    note:
                      `Uses c_f = ${cfAtBoundary} at the published dataset minimum Re = ${boundaryRe} ` +
                      `(Re_operating = ${re.toExponential(4)} is below the tabulated range [${governedDataset.tableMin}, ${governedDataset.tableMax}]). ` +
                      `Actual c_f at Re = ${re.toExponential(4)} is expected to be HIGHER — Zogg 1972 Figure 2 shows c_f increasing with decreasing Re in the laminar regime. ` +
                      `This value is a LOWER BOUND on ΔP/Δz and must not be used for sizing decisions.`,
                  };
                } else {
                  litResult.pressureDropBoundaryMinimumEstimate = null;
                }
              }
            } else if (cfBasis && cfProvenance) {
              // ── User-entered constant/tabular frictionFactorBasis path ──
              const cfEval = cfBasis.kind === 'constant'
                ? evaluatePerformanceBasis(cfBasis, 0)     // x ignored for constant
                : evaluatePerformanceBasis(cfBasis, re);
              if (cfEval.ok && cfEval.value !== undefined) {
                const dpm = uC > 0 ? dryPackingPressureDropPerLength(cfEval.value, dh, rhoC, uC) : 0;
                litResult.frictionFactor = { value: cfEval.value, source: cfEval.source, provenance: cfProvenance };
                litResult.pressureDropPerMeter_Pa_m = dpm;
              } else {
                litResult.frictionFactor = { notCalculable: true, reason: cfEval.reason };
                litResult.pressureDropPerMeter_Pa_m = null;
              }
            }

            const pdRow: Record<string, unknown> = {
              framework: 'Duss 2013 / Zogg',
              literature: litResult,
              activeResult: 'literature',
            };

            if (vendorDpBasis) {
              // Vendor override: evaluated at Re (constant → x ignored)
              const vendEval = vendorDpBasis.kind === 'constant'
                ? evaluatePerformanceBasis(vendorDpBasis, 0)
                : evaluatePerformanceBasis(vendorDpBasis, re);
              if (vendEval.ok && vendEval.value !== undefined) {
                pdRow.vendor = {
                  pressureDropPerMeter_Pa_m: vendEval.value,
                  source: vendEval.source,
                  supersedes: 'literature_calculation',
                  literatureRetained: true,
                  note: 'Vendor data is the active result for this diameter — literature calculation is retained for comparison',
                };
                pdRow.activeResult = 'vendor';
              } else {
                pdRow.vendor = { notCalculable: true, reason: vendEval.reason };
              }
            }

            row.pressureDropPrediction = pdRow;
          } else if (pdIn) {
            // Basis was provided but is incomplete — note but don't block row
            row.pressureDropPrediction = {
              classification: 'Not Calculable',
              reason: !dhSetup
                ? 'packingSpecificSurface missing or invalid'
                : 'No cf basis — governedReCfDataset not injected and frictionFactorBasis + frictionFactorProvenance not provided',
            };
          }
          rows.push(row);
        }
        // Screening band SUSPENDED — feasible = any diameter with a holdup
        // solution and % of maximum < 100 %. No band-derived sub-classification.
        const feasible = rows.filter((r) => r.genericHydraulicFeasibility === 'hydraulically_feasible');
        return {
          caseName,
          solventMassFlow_kg_h: caseName === 'normal' ? normalSolventMassFlow : maximumSolventMassFlow,
          nmpVolumetricFlow_m3_h: qNMP * 3600,
          rrboVolumetricFlow_m3_h: qRRBO_m3s * 3600,
          screeningBandPercent: {
            ...screeningBand,
            suspended: true,
            note: 'Suspended — no governed source established for the 40–80% criterion. Not used for diameter classification. Percentage of Generic Hydraulic Throughput Maximum is reported as a raw value per diameter.',
          },
          diameters: rows,
          summary: {
            hydraulicallyInfeasibleDiameters_m: rows.filter((r) => r.genericHydraulicFeasibility === 'hydraulically_infeasible').map((r) => r.diameter_m),
            hydraulicallyFeasibleDiameters_m: feasible.map((r) => r.diameter_m),
            minimumFeasibleDiameter_m: feasible.length ? (feasible[0].diameter_m as number) : null,
            screeningBandSuspended: true,
            screeningBandSuspendedNote: 'The 40–80% generic screening band has no established governed source and is suspended from diameter classification. All diameters where a holdup solution exists and % of maximum < 100% are classified hydraulically_feasible. Percentage of Generic Hydraulic Throughput Maximum is reported per diameter as a raw value only.',
            selectedTrialDiameter_m: num(inputs.selectedTrialDiameter) ?? null,
            selectedTrialDiameterNote: inputs.selectedTrialDiameter !== undefined ? 'Engineer-selected trial diameter (echoed, not engine-recommended)' : 'No trial diameter selected — the engine does not recommend one',
          },
          caseAmbiguity,
        };
      };

      const normalCase = runCase('normal', qNMP_normal_m3s);
      const maximumCase = runCase('maximum', qNMP_maximum_m3s);

      const anyPending = propertyAssumed || holdupForcePending || d32Assumed || normalCase.caseAmbiguity || maximumCase.caseAmbiguity || usesKuhniVkRoute;
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
          ...(usesKuhniVkRoute ? {
            characteristicVelocityRoute: {
              id: ASADOLLAHZADEH_2017_KUHNI_VK_PRELIMINARY,
              classification: 'Pending Validation' as Classification,
              equation: 'V_k = 0.237·(ρ_c/Δρ)^0.741·Fr^-0.184·N_μ^-0.095·(1+0.052·α_MT)',
              froudeEquation: 'Fr = N²·d_R/g',
              mortonEquation: 'N_μ = μ_c⁴·g/(ρ_d·γ³)',
              alphaMT: kuhniAlphaMT ?? null,
              transferDirection: kuhniTransferDirection || null,
              rotorToColumnDiameterRatio: kuhniRotorRatio ?? null,
              rotorSpeed: kuhniRotorSpeed ?? null,
              routeSpecificHindranceExponent: kuhniM ?? null,
              routeSpecificHindranceNote: kuhniM
                ? 'Supplied m is retained as audit provenance only. Engineer review has not accepted it for the route, and capacity use is rejected.'
                : 'No route-specific m supplied. The rigid-sphere route n is not reused; engineer review rejects capacity and diameter use, so holdup, limiting throughput, percentage, and selection are Not Calculable.',
              sourceReference: KUHNI_VK_ROUTE_REFERENCE,
              sourceEvidence: KUHNI_VK_SOURCE_EVIDENCE,
            },
          } : {}),
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
        ...(dhSetup && (governedDataset || (cfBasis && cfProvenance)) ? {
          pressureDropBasisSetup: {
            classification: C3_PRESSURE_DROP_CLASSIFICATION,
            framework: 'Duss 2013 / Zogg',
            sourceDocuments: governedDataset ? governedDataset.sourceDocuments : [DUSS_2013_CITATION, ZOGG_1972_CITATION],
            hydraulicDiameter: {
              value_m: dhSetup.dh_m,
              specificSurfaceArea_m2_m3: dhSetup.a_m2_m3,
              source: dhSetup.source,
              equation: 'DUSS2013-EQ3: d_h = 4/a (Zogg definition)',
            },
            corrugationAngle: corrAngleDeg !== undefined
              ? {
                  value_deg: corrAngleDeg,
                  reCrit: governedDataset?.reCrit ?? null,
                  reCritBasis: governedDataset?.reCritBasis ?? null,
                  note: corrAngleDeg === 45 || corrAngleDeg === 30
                    ? `Published Zogg/Duss anchor — governed dataset available (Re_crit = ${governedDataset?.reCrit ?? '—'})`
                    : 'Not a published anchor (45° or 30°) — no governed dataset; flow-regime classification not determinable',
                }
              : null,
            cfBasis: governedDataset
              ? {
                  type: 'governed_tabulated_dataset',
                  datasetId: governedDataset.id,
                  corrugationType: governedDataset.corrugationType,
                  nominalSpecificSurface_m2_m3: governedDataset.nominalSpecificSurface_m2_m3,
                  points: governedDataset.points.length,
                  validRange_re: { min: governedDataset.tableMin, max: governedDataset.tableMax },
                  provenance: 'controlled_literature',
                  governanceNote: governedDataset.governanceNote,
                }
              : {
                  type: 'user_entered',
                  kind: cfBasis?.kind,
                  provenance: cfProvenance,
                  assumed: pdBasisAssumed,
                },
            vendorOverrideProvided: vendorDpBasis !== undefined,
            activeResult: vendorDpBasis !== undefined ? 'vendor' : 'literature',
            rangePolicy: governedDataset
              ? {
                  interpolation: `Piecewise linear within Re = [${governedDataset.tableMin}, ${governedDataset.tableMax}]`,
                  belowRange: 'c_f not directly supported — boundary minimum ΔP estimate provided (NOT design ΔP; lower bound only)',
                  aboveRange: 'c_f not directly supported — no governed extrapolation rule approved above published range',
                }
              : null,
            governanceSummary:
              governedDataset
                ? `cf auto-calculated from Duss 2013 Table 2 governed dataset (${governedDataset.id}). ` +
                  'Vendor-SOFTWARE outputs (Sulcol, DRP, etc.) are prohibited as live design inputs. ' +
                  'Table 2 values from the published conference paper are used as controlled-literature tabulated data with full provenance.'
                : 'cf from user-entered source-tagged PerformanceBasis (controlled_literature / measured / vendor_document). Vendor-SOFTWARE outputs are prohibited.',
            applicabilityStatement: [
              'Single-phase frictional model only — valid below the loading point.',
              "The source paper's validated envelope is GAS-phase flow in counter-current gas/liquid distillation packing. Application to RRBO-NMP liquid-liquid continuous-phase flow is an ANALOG OUTSIDE the validated envelope.",
              `All results classified: "${C3_PRESSURE_DROP_CLASSIFICATION}"`,
            ],
            equations: [
              { id: 'DUSS2013-EQ3', statement: 'd_h = 4/a', variables: 'a = specific packing surface (m²/m³); d_h (m)' },
              { id: 'DUSS2013-EQ4', statement: 'Re = u_s·ρ_c·d_h/η_c', variables: 'u_s = continuous superficial velocity (m/s); ρ_c (kg/m³); η_c (Pa·s)' },
              { id: 'DUSS2013-EQ5', statement: 'F_v = u_s·√ρ_c', variables: 'F_v (Pa^0.5)' },
              { id: 'DUSS2013-EQ2/EQ6', statement: 'ΔP/Δz = c_f·ρ_c·u_s²/(2·d_h) = c_f·F_v²/(2·d_h)', variables: 'c_f = packing friction factor (–); ΔP/Δz (Pa/m)' },
            ],
          },
        } : {}),
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
