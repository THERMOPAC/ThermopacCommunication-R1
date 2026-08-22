// ═══════════════════════════════════════════════════════════════════════════
// ECR-2 — Composition-independent preliminary local-property closure
//
// This module is the single future-BVP entry point for local physical
// properties.  The first-BVP basis intentionally keeps physical properties
// frozen/preliminary while compositions and transfer physics remain local.
//
// No mixture-property rule is created here.  No NRTL calculation is performed
// here.  Missing or invalid required inputs block the snapshot rather than
// receiving a default.
// ═══════════════════════════════════════════════════════════════════════════

import {
  getProperty,
} from '../../engine-framework/common-engineering-library';
import {
  validateComposition,
  COMPONENT_NAMES,
  type ComponentName,
} from './llx-ecr2-composition';
import type {
  DiffusivityInput,
  ECR2DiffusivityContract,
} from './llx-ecr2-diffusivity';
import type {
  ECR2LocalPropertyResult,
} from './llx-ecr2-local-properties';

// ── Public governance vocabulary ────────────────────────────────────────────

export const ECR2_LOCAL_PROPERTY_STATUSES = [
  'LOCAL_PROPERTY_GOVERNED',
  'LOCAL_PROPERTY_PRELIMINARY_CONSTANT',
  'LOCAL_PROPERTY_PRELIMINARY_PURE_PHASE',
  'LOCAL_PROPERTY_ENGINEER_SUPPLIED',
  'LOCAL_PROPERTY_UNAVAILABLE',
] as const;

export type ECR2LocalPropertyStatus = typeof ECR2_LOCAL_PROPERTY_STATUSES[number];

export type ECR2LocalPropertyValidationStatus =
  | 'PRELIMINARY_PURE_PHASE_PROPERTY'
  | 'PRELIMINARY_RRBO_PROPERTY'
  | 'PRELIMINARY_COLUMN_CONSTANT_PROPERTY';

export const ECR2_LOCALITY_WARNING_CODES = {
  continuousComposition: 'CONTINUOUS_PHASE_COMPOSITION_DEPENDENCE_NOT_MODELLED',
  dispersedComposition: 'DISPERSED_PHASE_COMPOSITION_DEPENDENCE_NOT_MODELLED',
  interfacialTensionComposition: 'INTERFACIAL_TENSION_COMPOSITION_DEPENDENCE_NOT_MODELLED',
  diffusivityComposition: 'DIFFUSIVITY_COMPOSITION_DEPENDENCE_NOT_MODELLED',
} as const;

export type ECR2ClosureSourceType =
  | 'Assumed'
  | 'Vendor'
  | 'Literature'
  | 'Literature_Analogy'
  | 'Measured'
  | 'Pilot'
  | 'Thermopac'
  | 'Engineer_Judgement'
  | 'Calibrated';

const ALLOWED_SOURCE_TYPES: ReadonlySet<string> = new Set([
  'Assumed',
  'Vendor',
  'Literature',
  'Literature_Analogy',
  'Measured',
  'Pilot',
  'Thermopac',
  'Engineer_Judgement',
  'Calibrated',
]);

const ABSOLUTE_ZERO_C = -273.15;
const TEMPERATURE_MATCH_TOLERANCE_C = 1e-9;

// ── Input contracts ─────────────────────────────────────────────────────────

/**
 * Local phase composition is required at the closure boundary so the future
 * BVP cannot accidentally call this resolver with a stale or absent state.
 * Values are inspected only; they are never normalized or mutated.
 */
export interface ECR2LocalPhaseState {
  readonly x_local: readonly number[];
  readonly y_local: readonly number[];
  readonly compartmentIndex?: number;
}

/**
 * Explicit engineer input used by the first-BVP closure.  The existing
 * ECR2EngineerPropertyInput remains the lower-level contract used by the
 * frozen local kernel; this stricter contract makes the reference temperature
 * mandatory at the BVP closure boundary.
 */
export interface ECR2ClosureEngineerPropertyInput {
  readonly value: number;
  readonly unit: string;
  readonly sourceType: string;
  readonly sourceReference: string;
  readonly referenceTemperature_C: number;
}

/**
 * A property calculated by an eligible governed route at the current operating
 * temperature. This is distinct from an engineer's raw anchor datum.
 */
export interface ECR2ClosureGovernedPropertyInput extends ECR2ClosureEngineerPropertyInput {
  readonly method: string;
  readonly basis: string;
  readonly warnings: readonly string[];
}

export interface ECR2GovernedPropertyInputs {
  /** Selected grade ID; no cross-grade fallback is permitted. */
  readonly rrboGradeId: string;
  /** Required only when the selected RRBO grade has no valid EPD density route. */
  readonly rho_d_engineer?: ECR2ClosureEngineerPropertyInput | null;
  /** Explicit at-operating-temperature RRBO viscosity takes precedence. */
  readonly mu_d_engineer: ECR2ClosureEngineerPropertyInput | null;
  /** Eligible RRBO operating-temperature calculation, assembled at the BVP boundary. */
  readonly mu_d_governed?: ECR2ClosureGovernedPropertyInput | null;
  /** Explicit NMP/RRBO pair value; first-BVP basis is column-constant. */
  readonly sigma_engineer: ECR2ClosureEngineerPropertyInput | null;
  /** Required pair of values for every frozen component and both phases. */
  readonly diffusivity: ECR2DiffusivityContract;
}

// ── Snapshot contracts ──────────────────────────────────────────────────────

export interface ECR2LocalPropertyMetadata {
  readonly sourceType: string;
  readonly sourceReference: string;
  readonly basis: string;
  readonly method?: string;
  readonly referenceTemperature_C: number;
  readonly localityStatus: ECR2LocalPropertyStatus;
  readonly validationStatus: ECR2LocalPropertyValidationStatus;
  readonly warnings: readonly string[];
}

export interface ECR2ResolvedLocalProperty extends ECR2LocalPropertyMetadata {
  readonly value: number;
  readonly unit: string;
}

export type ECR2FivePropertyTuple = readonly [
  ECR2ResolvedLocalProperty,
  ECR2ResolvedLocalProperty,
  ECR2ResolvedLocalProperty,
  ECR2ResolvedLocalProperty,
  ECR2ResolvedLocalProperty,
];

export interface ECR2LocalPropertySnapshot {
  readonly temperature_C: number;
  readonly rho_c_kg_m3: number;
  readonly rho_d_kg_m3: number;
  readonly mu_c_Pa_s: number;
  readonly mu_d_Pa_s: number;
  readonly sigma_N_m: number;
  readonly D_c_i_m2_s: readonly number[];
  readonly D_d_i_m2_s: readonly number[];

  readonly properties: {
    readonly rho_c: ECR2ResolvedLocalProperty;
    readonly rho_d: ECR2ResolvedLocalProperty;
    readonly mu_c: ECR2ResolvedLocalProperty;
    readonly mu_d: ECR2ResolvedLocalProperty;
    readonly sigma: ECR2ResolvedLocalProperty;
    readonly D_c_i: ECR2FivePropertyTuple;
    readonly D_d_i: ECR2FivePropertyTuple;
  };

  /** Codes are exposed in result metadata, not hidden in debug-only fields. */
  readonly localityWarnings: readonly string[];
  readonly diagnostics: readonly string[];
  readonly closureStatus: 'PRELIMINARY_FROZEN_PROPERTY_INPUTS';
}

export interface ECR2LocalPropertyClosureBlocked {
  readonly status: 'blocked';
  readonly snapshot: null;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export interface ECR2LocalPropertyClosureResolved {
  readonly status: 'resolved';
  readonly snapshot: ECR2LocalPropertySnapshot;
  readonly errors: readonly [];
  readonly warnings: readonly string[];
}

export type ECR2LocalPropertyClosureResult =
  | ECR2LocalPropertyClosureBlocked
  | ECR2LocalPropertyClosureResolved;

// ── Small validation helpers ─────────────────────────────────────────────────

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function hasValidProvenance(input: {
  sourceType: string;
  sourceReference: string;
}): boolean {
  return (
    typeof input.sourceType === 'string' &&
    ALLOWED_SOURCE_TYPES.has(input.sourceType) &&
    typeof input.sourceReference === 'string' &&
    input.sourceReference.trim().length > 0
  );
}

function validateTemperature(
  temperature_C: number,
  label: string,
  errors: string[],
): void {
  if (!Number.isFinite(temperature_C)) {
    errors.push(`${label}: temperature must be finite.`);
  } else if (temperature_C < ABSOLUTE_ZERO_C) {
    errors.push(`${label}: temperature ${temperature_C} °C is below absolute zero.`);
  }
}

function validateReferenceTemperature(
  referenceTemperature_C: number,
  operatingTemperature_C: number,
  label: string,
  errors: string[],
): void {
  if (!Number.isFinite(referenceTemperature_C)) {
    errors.push(`${label}: referenceTemperature_C must be finite.`);
    return;
  }
  if (
    Math.abs(referenceTemperature_C - operatingTemperature_C) >
    TEMPERATURE_MATCH_TOLERANCE_C
  ) {
    errors.push(
      `${label}: reference temperature ${referenceTemperature_C} °C does not match ` +
      `Stage 4 Extraction Temperature ${operatingTemperature_C} °C; no governed ` +
      `temperature route resolves this property at the requested condition.`,
    );
  }
}

function validateEngineerInput(
  input: ECR2ClosureEngineerPropertyInput | null | undefined,
  label: string,
  expectedUnits: readonly string[],
  operatingTemperature_C: number,
  errors: string[],
): input is ECR2ClosureEngineerPropertyInput {
  if (!input || typeof input !== 'object') {
    errors.push(`${label}: required engineer-supplied property is missing.`);
    return false;
  }
  if (!isFinitePositive(input.value)) {
    errors.push(`${label}: value must be a positive finite number.`);
  }
  if (!expectedUnits.includes(input.unit)) {
    errors.push(`${label}: unit '${input.unit}' is invalid; expected ${expectedUnits.join(' or ')}.`);
  }
  if (!hasValidProvenance(input)) {
    errors.push(`${label}: sourceType and sourceReference are required valid provenance.`);
  }
  validateReferenceTemperature(
    input.referenceTemperature_C,
    operatingTemperature_C,
    label,
    errors,
  );
  return errors.length === 0;
}

function propertyWarnings(
  localityWarning: string,
  sourceWarnings: readonly string[] = [],
): readonly string[] {
  return Object.freeze([localityWarning, ...sourceWarnings]);
}

function freezeProperty(
  property: ECR2ResolvedLocalProperty,
): ECR2ResolvedLocalProperty {
  return Object.freeze(property);
}

function makeEngineerProperty(
  input: ECR2ClosureEngineerPropertyInput,
  basis: string,
  validationStatus: ECR2LocalPropertyValidationStatus,
  localityWarning: string,
): ECR2ResolvedLocalProperty {
  return freezeProperty({
    value: input.value,
    unit: input.unit,
    sourceType: input.sourceType,
    sourceReference: input.sourceReference,
    basis,
    referenceTemperature_C: input.referenceTemperature_C,
    localityStatus: 'LOCAL_PROPERTY_ENGINEER_SUPPLIED',
    validationStatus,
    warnings: propertyWarnings(localityWarning),
  });
}

function makeGovernedProperty(
  input: ECR2ClosureGovernedPropertyInput,
  validationStatus: ECR2LocalPropertyValidationStatus,
  localityWarning: string,
): ECR2ResolvedLocalProperty {
  return freezeProperty({
    value: input.value,
    unit: input.unit,
    sourceType: input.sourceType,
    sourceReference: input.sourceReference,
    basis: input.basis,
    method: input.method,
    referenceTemperature_C: input.referenceTemperature_C,
    localityStatus: 'LOCAL_PROPERTY_GOVERNED',
    validationStatus,
    warnings: propertyWarnings(localityWarning, input.warnings),
  });
}

function makeEpdProperty(
  value: number,
  unit: string,
  sourceReference: string,
  basis: string,
  validationStatus: ECR2LocalPropertyValidationStatus,
  localityWarning: string,
  sourceWarnings: readonly string[],
  temperature_C: number,
): ECR2ResolvedLocalProperty {
  return freezeProperty({
    value,
    unit,
    sourceType: 'EPD_Library',
    sourceReference,
    basis,
    referenceTemperature_C: temperature_C,
    localityStatus: 'LOCAL_PROPERTY_PRELIMINARY_PURE_PHASE',
    validationStatus,
    warnings: propertyWarnings(localityWarning, sourceWarnings),
  });
}

function makeDiffusivityProperty(
  input: DiffusivityInput,
  validationStatus: ECR2LocalPropertyValidationStatus,
  localityWarning: string,
): ECR2ResolvedLocalProperty {
  return freezeProperty({
    value: input.value_m2_s,
    unit: 'm2/s',
    sourceType: input.sourceType,
    sourceReference: input.sourceReference,
    basis: 'engineer_supplied_constant_at_operating_temperature',
    referenceTemperature_C: input.referenceTemperature_C,
    localityStatus: 'LOCAL_PROPERTY_PRELIMINARY_CONSTANT',
    validationStatus,
    warnings: propertyWarnings(localityWarning),
  });
}

function validateDiffusivity(
  input: DiffusivityInput | null,
  label: string,
  operatingTemperature_C: number,
  errors: string[],
): input is DiffusivityInput {
  if (!input || typeof input !== 'object') {
    errors.push(`${label}: required diffusivity is missing.`);
    return false;
  }
  if (!isFinitePositive(input.value_m2_s)) {
    errors.push(`${label}: value_m2_s must be a positive finite number.`);
  }
  if (!['engineer_supplied', 'system_resolved_preliminary'].includes(input.status)) {
    errors.push(`${label}: status must be 'engineer_supplied' or 'system_resolved_preliminary'.`);
  }
  if (!hasValidProvenance(input)) {
    errors.push(`${label}: sourceType and sourceReference are required valid provenance.`);
  }
  if (typeof input.method !== 'string' || !input.method.trim()) {
    errors.push(`${label}: method is required provenance.`);
  }
  validateReferenceTemperature(
    input.referenceTemperature_C,
    operatingTemperature_C,
    label,
    errors,
  );
  return errors.length === 0;
}

function validateGovernedPropertyInput(
  input: ECR2ClosureGovernedPropertyInput | null | undefined,
  label: string,
  expectedUnits: readonly string[],
  operatingTemperature_C: number,
  errors: string[],
): input is ECR2ClosureGovernedPropertyInput {
  if (!validateEngineerInput(input, label, expectedUnits, operatingTemperature_C, errors)) {
    return false;
  }
  if (typeof input.method !== 'string' || !input.method.trim()) {
    errors.push(`${label}: method is required provenance.`);
  }
  if (typeof input.basis !== 'string' || !input.basis.trim()) {
    errors.push(`${label}: basis is required provenance.`);
  }
  if (!Array.isArray(input.warnings)) {
    errors.push(`${label}: warnings must be a provenance array.`);
  }
  return errors.length === 0;
}

function addEpdWarnings(
  diagnostics: string[],
  propertyName: string,
  warnings: readonly { message: string }[],
): void {
  for (const warning of warnings) {
    diagnostics.push(`${propertyName}: ${warning.message}`);
  }
}

function blocked(
  errors: readonly string[],
  warnings: readonly string[] = [],
): ECR2LocalPropertyClosureBlocked {
  return Object.freeze({
    status: 'blocked' as const,
    snapshot: null,
    errors: Object.freeze([...errors]),
    warnings: Object.freeze([...warnings]),
  });
}

// ── Main closure ────────────────────────────────────────────────────────────

/**
 * Resolve the complete preliminary physical-property snapshot for one local
 * compartment.
 *
 * The phase compositions are validated to ensure the caller supplies local
 * state, but they do not enter any unsupported mixture-property calculation.
 * This function is deterministic, has no cache, does not mutate its inputs,
 * does not normalize compositions, and does not call the thermodynamic model.
 */
export function resolveECR2LocalProperties(
  localPhaseState: ECR2LocalPhaseState,
  operatingTemperature_C: number,
  governedPropertyInputs: ECR2GovernedPropertyInputs,
): ECR2LocalPropertyClosureResult {
  const errors: string[] = [];
  const diagnostics: string[] = [];

  validateTemperature(operatingTemperature_C, 'operatingTemperature_C', errors);

  if (!localPhaseState || !Array.isArray(localPhaseState.x_local)) {
    errors.push('localPhaseState.x_local: local RRBO-rich composition is required.');
  } else {
    const xValidation = validateComposition(localPhaseState.x_local, 'x_local');
    if (!xValidation.valid) errors.push(xValidation.message);
  }
  if (!localPhaseState || !Array.isArray(localPhaseState.y_local)) {
    errors.push('localPhaseState.y_local: local NMP-rich composition is required.');
  } else {
    const yValidation = validateComposition(localPhaseState.y_local, 'y_local');
    if (!yValidation.valid) errors.push(yValidation.message);
  }

  if (!governedPropertyInputs || typeof governedPropertyInputs.rrboGradeId !== 'string' ||
      governedPropertyInputs.rrboGradeId.trim() === '') {
    errors.push('governedPropertyInputs.rrboGradeId: selected RRBO grade is required.');
  }
  if (!governedPropertyInputs?.diffusivity) {
    errors.push('governedPropertyInputs.diffusivity: complete five-component contract is required.');
  }

  if (errors.length > 0) return blocked(errors);

  const {
    rrboGradeId,
    rho_d_engineer,
    mu_d_engineer,
    mu_d_governed,
    sigma_engineer,
    diffusivity,
  } = governedPropertyInputs;

  const continuousWarning = ECR2_LOCALITY_WARNING_CODES.continuousComposition;
  const dispersedWarning = ECR2_LOCALITY_WARNING_CODES.dispersedComposition;
  const sigmaWarning = ECR2_LOCALITY_WARNING_CODES.interfacialTensionComposition;
  const diffusivityWarning = ECR2_LOCALITY_WARNING_CODES.diffusivityComposition;

  // ── Continuous NMP-rich phase: pure-NMP EPD temperature routes ─────────
  let rho_c: ECR2ResolvedLocalProperty;
  let mu_c: ECR2ResolvedLocalProperty;
  try {
    const result = getProperty('nmp', 'density', operatingTemperature_C);
    if (!isFinitePositive(result.value)) {
      errors.push(`rho_c: EPD returned non-positive value ${result.value}.`);
    }
    rho_c = makeEpdProperty(
      result.value,
      result.unit,
      `EPD NMP density library at ${operatingTemperature_C} °C. Source: ${result.source}`,
      'continuous_phase_pure_NMP_temperature_basis',
      'PRELIMINARY_PURE_PHASE_PROPERTY',
      continuousWarning,
      result.warnings.map((warning) => warning.message),
      operatingTemperature_C,
    );
    addEpdWarnings(diagnostics, 'rho_c', result.warnings);
  } catch (error) {
    errors.push(`rho_c: EPD NMP density route unavailable: ${String(error)}`);
    rho_c = undefined as never;
  }

  try {
    const result = getProperty('nmp', 'dynamicViscosity', operatingTemperature_C);
    if (!isFinitePositive(result.value)) {
      errors.push(`mu_c: EPD returned non-positive value ${result.value}.`);
    }
    mu_c = makeEpdProperty(
      result.value,
      result.unit,
      `EPD NMP dynamic viscosity library at ${operatingTemperature_C} °C. Source: ${result.source}`,
      'pure_NMP_temperature_basis_preliminary',
      'PRELIMINARY_PURE_PHASE_PROPERTY',
      continuousWarning,
      result.warnings.map((warning) => warning.message),
      operatingTemperature_C,
    );
    addEpdWarnings(diagnostics, 'mu_c', result.warnings);
  } catch (error) {
    errors.push(`mu_c: EPD NMP viscosity route unavailable: ${String(error)}`);
    mu_c = undefined as never;
  }

  // ── Dispersed RRBO-rich phase: grade route first, explicit fallback only ─
  let rho_d: ECR2ResolvedLocalProperty | undefined;
  try {
    const result = getProperty(rrboGradeId, 'density', operatingTemperature_C);
    if (!isFinitePositive(result.value)) {
      throw new Error(`EPD returned non-positive value ${result.value}.`);
    }
    rho_d = makeEpdProperty(
      result.value,
      result.unit,
      `EPD ${rrboGradeId} density library at ${operatingTemperature_C} °C. Source: ${result.source}`,
      'rrbo_grade_temperature_basis_preliminary',
      'PRELIMINARY_RRBO_PROPERTY',
      dispersedWarning,
      result.warnings.map((warning) => warning.message),
      operatingTemperature_C,
    );
    addEpdWarnings(diagnostics, 'rho_d', result.warnings);
  } catch (error) {
    diagnostics.push(`rho_d: grade route unavailable for '${rrboGradeId}': ${String(error)}`);
    const rhoErrors: string[] = [];
    if (validateEngineerInput(
      rho_d_engineer,
      'rho_d_engineer',
      ['kg/m3', 'kg/m³'],
      operatingTemperature_C,
      rhoErrors,
    )) {
      rho_d = makeEngineerProperty(
        rho_d_engineer,
        'engineer_supplied_rrbo_density_at_operating_temperature_preliminary',
        'PRELIMINARY_RRBO_PROPERTY',
        dispersedWarning,
      );
    } else {
      errors.push(
        `rho_d: no valid EPD grade route and no valid engineer density fallback. ${rhoErrors.join(' ')}`,
      );
    }
  }

  const muDEngineerErrors: string[] = [];
  const hasAtTemperatureEngineerMuD = validateEngineerInput(
    mu_d_engineer,
    'mu_d_engineer',
    ['Pa.s', 'Pa·s'],
    operatingTemperature_C,
    muDEngineerErrors,
  );
  const muDGovernedErrors: string[] = [];
  const hasGovernedMuD = validateGovernedPropertyInput(
    mu_d_governed,
    'mu_d_governed',
    ['Pa.s', 'Pa·s'],
    operatingTemperature_C,
    muDGovernedErrors,
  );
  let mu_d: ECR2ResolvedLocalProperty | undefined;
  if (hasAtTemperatureEngineerMuD) {
    mu_d = makeEngineerProperty(
      mu_d_engineer,
      'engineer_supplied_rrbo_viscosity_at_operating_temperature_preliminary',
      'PRELIMINARY_RRBO_PROPERTY',
      dispersedWarning,
    );
  } else if (hasGovernedMuD) {
    mu_d = makeGovernedProperty(
      mu_d_governed,
      'PRELIMINARY_RRBO_PROPERTY',
      dispersedWarning,
    );
  } else {
    errors.push(
      `mu_d: no governed RRBO operating-temperature viscosity route applies for '${rrboGradeId}' at ${operatingTemperature_C} °C. ` +
      `${muDGovernedErrors.join(' ')} ${muDEngineerErrors.join(' ')}`.trim(),
    );
  }

  const sigmaErrors: string[] = [];
  const hasSigma = validateEngineerInput(
    sigma_engineer,
    'sigma_engineer',
    ['N/m'],
    operatingTemperature_C,
    sigmaErrors,
  );
  if (!hasSigma) errors.push(`sigma: ${sigmaErrors.join(' ')}`);

  // Validate the complete vector before constructing any partial snapshot.
  const continuousDiffusivities: DiffusivityInput[] = [];
  const dispersedDiffusivities: DiffusivityInput[] = [];
  for (const component of COMPONENT_NAMES) {
    const pair = diffusivity[component];
    if (!pair) {
      errors.push(`diffusivity.${component}: component pair is missing.`);
      continue;
    }
    if (validateDiffusivity(
      pair.De_c,
      `diffusivity.${component}.De_c`,
      operatingTemperature_C,
      errors,
    )) {
      continuousDiffusivities.push(pair.De_c);
    }
    if (validateDiffusivity(
      pair.De_d,
      `diffusivity.${component}.De_d`,
      operatingTemperature_C,
      errors,
    )) {
      dispersedDiffusivities.push(pair.De_d);
    }
  }

  if (errors.length > 0 || !rho_d || !mu_d || !hasSigma ||
      continuousDiffusivities.length !== COMPONENT_NAMES.length ||
      dispersedDiffusivities.length !== COMPONENT_NAMES.length) {
    return blocked(errors, diagnostics);
  }

  const sigma = makeEngineerProperty(
    sigma_engineer,
    'column_constant_engineer_supplied_preliminary',
    'PRELIMINARY_COLUMN_CONSTANT_PROPERTY',
    sigmaWarning,
  );

  const D_c_i = Object.freeze(
    continuousDiffusivities.map((input) =>
      makeDiffusivityProperty(
        input,
        'PRELIMINARY_COLUMN_CONSTANT_PROPERTY',
        diffusivityWarning,
      ),
    ),
  ) as unknown as ECR2FivePropertyTuple;
  const D_d_i = Object.freeze(
    dispersedDiffusivities.map((input) =>
      makeDiffusivityProperty(
        input,
        'PRELIMINARY_COLUMN_CONSTANT_PROPERTY',
        diffusivityWarning,
      ),
    ),
  ) as unknown as ECR2FivePropertyTuple;

  const localityWarnings = Object.freeze([
    continuousWarning,
    dispersedWarning,
    sigmaWarning,
    diffusivityWarning,
  ]);

  const allPropertyWarnings = [
    ...rho_c.warnings,
    ...rho_d.warnings,
    ...mu_c.warnings,
    ...mu_d.warnings,
    ...sigma.warnings,
    ...D_c_i.flatMap((property) => property.warnings),
    ...D_d_i.flatMap((property) => property.warnings),
  ];

  const snapshot: ECR2LocalPropertySnapshot = Object.freeze({
    temperature_C: operatingTemperature_C,
    rho_c_kg_m3: rho_c.value,
    rho_d_kg_m3: rho_d.value,
    mu_c_Pa_s: mu_c.value,
    mu_d_Pa_s: mu_d.value,
    sigma_N_m: sigma.value,
    D_c_i_m2_s: Object.freeze(D_c_i.map((property) => property.value)),
    D_d_i_m2_s: Object.freeze(D_d_i.map((property) => property.value)),
    properties: Object.freeze({
      rho_c,
      rho_d,
      mu_c,
      mu_d,
      sigma,
      D_c_i,
      D_d_i,
    }),
    localityWarnings,
    diagnostics: Object.freeze([...diagnostics, ...allPropertyWarnings]),
    closureStatus: 'PRELIMINARY_FROZEN_PROPERTY_INPUTS',
  });

  return Object.freeze({
    status: 'resolved' as const,
    snapshot,
    errors: Object.freeze([]) as readonly [],
    warnings: Object.freeze([...localityWarnings]),
  });
}

/** Narrow a closure result without exposing implementation details to callers. */
export function isECR2LocalPropertyClosureResolved(
  result: ECR2LocalPropertyClosureResult,
): result is ECR2LocalPropertyClosureResolved {
  return result.status === 'resolved' && result.snapshot !== null;
}

/**
 * Adapt resolved closure metadata to the existing local-kernel property
 * contract.  This preserves the frozen kernel's public interface while a
 * future BVP obtains all values from one property-closure snapshot.
 */
export function toECR2KernelPropertyResult(
  property: ECR2ResolvedLocalProperty,
): ECR2LocalPropertyResult {
  return Object.freeze({
    value: property.value,
    unit: property.unit,
    sourceType: property.sourceType,
    sourceReference: property.sourceReference,
    calculationMethod: property.method ?? property.basis,
    status: property.sourceType === 'EPD_Library'
      ? 'library'
      : 'engineer_supplied',
    warnings: [...property.warnings],
  });
}

/** Human-readable component labels for diagnostics and future BVP wiring. */
export function ecr2PropertyComponentName(index: number): ComponentName | null {
  return index >= 0 && index < COMPONENT_NAMES.length ? COMPONENT_NAMES[index] : null;
}