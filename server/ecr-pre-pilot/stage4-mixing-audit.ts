/**
 * Stage-4 mixing screening.
 *
 * This module deliberately stops at an engineering screening prediction.  The
 * Kumar--Hartland expression below is the user-approved expression for this
 * pre-pilot use; its use here is not a claim that the RRBO/NMP system has been
 * pilot-validated or that the expression is a final-design correlation.
 */
const positive = (x: unknown): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x > 0;

export const KH_PRIMARY_COEFFICIENT = 0.0126;
export const KH_SENSITIVITY_COEFFICIENT = 0.0105;

export type KumarHartlandContinuousMixingInput = {
  columnDiameterM: number;
  rotorDiameterM: number;
  rpm: number;
  continuousSuperficialVelocityMS: number;
  dispersedSuperficialVelocityMS: number;
  continuousDensityKgM3: number;
  continuousViscosityPaS: number;
  /**
   * The approved physical-compartment pitch is hc = 0.5D.  These aliases are
   * accepted by the pure helper so callers can make that unit-bearing input
   * explicit; the audit always supplies 0.5D itself.
   */
  hcM?: number;
  pitchM?: number;
  coefficient?: number;
  c?: number;
};

type KumarHartlandEvaluation = {
  ecM2S: number;
  dimensionlessEc: number;
  q: number;
  reynoldsLike: number;
  hcM: number;
  coefficient: number;
};

function evaluateKumarHartlandEc(
  input: KumarHartlandContinuousMixingInput,
  coefficientArgument?: number,
): KumarHartlandEvaluation {
  const {
    columnDiameterM: D,
    rotorDiameterM: DR,
    rpm,
    continuousSuperficialVelocityMS: Vc,
    dispersedSuperficialVelocityMS: Vd,
    continuousDensityKgM3: rho,
    continuousViscosityPaS: mu,
  } = input;
  const coefficient = coefficientArgument ?? input.coefficient ?? input.c ?? KH_PRIMARY_COEFFICIENT;
  const hcM = input.hcM ?? input.pitchM ?? (0.5 * D);
  if (!positive(D) || !positive(DR) || !positive(rpm)
    || !positive(Vc) || !positive(Vd) || !positive(rho) || !positive(mu)
    || !positive(hcM) || !positive(coefficient)) {
    throw new Error('STAGE4_INVALID_KH_MIXING_INPUT');
  }

  // q and the Reynolds-like group are dimensionless when the inputs use the
  // declared SI units: RPM/60 is s^-1 and Vc*DR*rho/mu is dimensionless.
  const q = (rpm / 60) * DR / Vc;
  const reynoldsLike = Vc * DR * rho / mu;
  const dimensionlessEc = 0.42
    + 0.29 * Vd / Vc
    + (coefficient * q + 13.38 / (3.18 + q))
      * reynoldsLike ** (-0.08)
      * (D / DR) ** 0.16
      * (D / hcM) ** 0.10;
  const ecM2S = dimensionlessEc * Vc * hcM;
  if (!positive(ecM2S) || !Number.isFinite(ecM2S)) {
    throw new Error('STAGE4_INVALID_KH_MIXING_RESULT');
  }
  return { ecM2S, dimensionlessEc, q, reynoldsLike, hcM, coefficient };
}

/**
 * User-approved Kumar--Hartland continuous-phase dispersion screening:
 *
 * Ec/(Vc hc) = .42 + .29 Vd/Vc
 *   + [c q + 13.38/(3.18+q)]
 *       (Vc DR rho/mu)^(-.08) (D/DR)^.16 (D/hc)^.10
 *
 * Ec is returned in m²/s.  The default c=.0126 is the primary screen; the
 * 2017-reported c=.0105 is intentionally available as a sensitivity only.
 */
export function calculateKumarHartlandEc(
  input: KumarHartlandContinuousMixingInput,
  coefficient?: number,
): number {
  return evaluateKumarHartlandEc(input, coefficient).ecM2S;
}

/** Detailed form used by the audit and useful to other screening callers. */
export function calculateKumarHartlandEcDetails(
  input: KumarHartlandContinuousMixingInput,
  coefficient?: number,
) {
  return evaluateKumarHartlandEc(input, coefficient);
}

/**
 * Explicit continuous-phase Peclet helper.  H and Vc are superficial-basis
 * quantities, and Ec is a positive dispersion coefficient in m²/s.
 */
export function calculateContinuousPeclet(heightM: number, velocityMS: number, ecM2S: number) {
  if (!positive(heightM) || !positive(velocityMS) || !positive(ecM2S)) {
    throw new Error('STAGE4_INVALID_CONTINUOUS_PECLET_INPUT');
  }
  return {
    value: heightM * velocityMS / ecM2S,
    unit: '1',
    status: 'CALCULATED',
    velocityBasis: 'SUPERFICIAL',
    dispersion: 'Ec',
  };
}

// Short aliases keep the pure helper contract usable without making callers
// depend on the audit's report terminology.
export const calculateEc = calculateKumarHartlandEc;
export const calculatePec = calculateContinuousPeclet;
export const calculateContinuousMixingCoefficient = calculateKumarHartlandEc;
export const calculatePeclet = calculateContinuousPeclet;

export function calculateInterfacialArea(holdup: number, d32M: number) {
  if (!positive(holdup) || holdup >= 1 || !positive(d32M)) {
    throw new Error('STAGE4_INVALID_INTERFACIAL_AREA_INPUT');
  }
  return 6 * holdup / d32M;
}

/** V is superficial velocity, per Asadollahzadeh (2017), Eqs. 5–6. */
export function calculateSuperficialPeclet(heightM: number, velocityMS: number, dispersionM2S: number) {
  if (!positive(heightM) || !positive(velocityMS)
    || !Number.isFinite(dispersionM2S) || dispersionM2S < 0) {
    throw new Error('STAGE4_INVALID_PECLET_INPUT');
  }
  // Infinity cannot be serialized as a JSON number; retain the physical limit.
  return dispersionM2S === 0
    ? { value: null, status: 'INFINITE_ZERO_DISPERSION_LIMIT', velocityBasis: 'SUPERFICIAL' }
    : { value: heightM * velocityMS / dispersionM2S, status: 'CALCULATED', velocityBasis: 'SUPERFICIAL' };
}

export function buildStage4MixingAudit(input: {
  selected: Record<string, any>;
  operating: Record<string, any>;
  processBasis?: Record<string, any>;
}) {
  const { selected, operating, processBasis } = input;
  const rotorDiameterM = positive(selected.rotorDiameterM) ? selected.rotorDiameterM : null;
  const vc = operating.continuousSuperficialVelocityMS;
  const vd = operating.dispersedSuperficialVelocityMS;
  const phase = processBasis?.phaseConfiguration;
  const continuous = phase === 'nmp-continuous-rrbo-dispersed' ? processBasis?.wetSolventPhase : null;
  const density = positive(continuous?.densityKgM3) ? continuous.densityKgM3 : null;
  const viscosity = positive(continuous?.dynamicViscosityPaS) ? continuous.dynamicViscosityPaS : null;
  const D = selected.columnDiameterM;
  const hcM = positive(D) ? 0.5 * D : null;
  const blockers: Array<{ code: string; parameters: string[]; detail: string }> = [];
  if (rotorDiameterM === null) {
    blockers.push({
      code: 'STAGE4_ROTOR_DIAMETER_REQUIRED',
      parameters: ['rotorDiameterM'],
      detail: 'Persist the actual rotor diameter for the Kumar–Hartland screening expression; column diameter is not substituted for DR.',
    });
  }
  if (!positive(vc) || !positive(vd)) {
    blockers.push({
      code: 'STAGE4_PERSISTED_PHASE_VELOCITIES_REQUIRED',
      parameters: [
        ...(!positive(vc) ? ['continuousSuperficialVelocityMS'] : []),
        ...(!positive(vd) ? ['dispersedSuperficialVelocityMS'] : []),
      ],
      detail: 'Use the persisted operating-point superficial phase velocities.',
    });
  }
  if (!positive(D)) {
    blockers.push({
      code: 'STAGE4_COLUMN_DIAMETER_REQUIRED',
      parameters: ['columnDiameterM'],
      detail: 'Persist the selected column diameter to establish the approved preliminary pitch hc = 0.5D.',
    });
  }
  if (!positive(selected.rpm)) {
    blockers.push({
      code: 'STAGE4_RPM_REQUIRED',
      parameters: ['rpm'],
      detail: 'Persist a positive rotor speed for N = RPM/60 and q.',
    });
  }
  if (density === null || viscosity === null) {
    blockers.push({
      code: 'STAGE4_CONTINUOUS_MIXING_PROPERTIES_REQUIRED',
      parameters: [
        ...(density === null ? ['continuousDensityKgM3'] : []),
        ...(viscosity === null ? ['continuousViscosityPaS'] : []),
      ],
      detail: 'Persist positive continuous-phase density and dynamic viscosity for the dimensionless Kumar–Hartland group.',
    });
  }

  const mixingInput = rotorDiameterM !== null && positive(vc) && positive(vd)
    && positive(D) && positive(selected.rpm)
    && density !== null && viscosity !== null && hcM !== null
    ? {
      columnDiameterM: D,
      rotorDiameterM,
      rpm: selected.rpm,
      continuousSuperficialVelocityMS: vc,
      dispersedSuperficialVelocityMS: vd,
      continuousDensityKgM3: density,
      continuousViscosityPaS: viscosity,
      hcM,
    } satisfies KumarHartlandContinuousMixingInput
    : null;
  const primaryEvaluation = mixingInput
    ? calculateKumarHartlandEcDetails(mixingInput, KH_PRIMARY_COEFFICIENT)
    : null;
  const sensitivityEvaluation = mixingInput
    ? calculateKumarHartlandEcDetails(mixingInput, KH_SENSITIVITY_COEFFICIENT)
    : null;
  const ec = primaryEvaluation?.ecM2S ?? null;
  const sensitivityEc = sensitivityEvaluation?.ecM2S ?? null;
  const screeningNotice =
    'PRE-PILOT PREDICTIVE / SCREENING — REQUIRES PILOT VALIDATION BEFORE FINAL DESIGN';

  return {
    classification: 'PRE-PILOT PREDICTIVE / SCREENING',
    screeningNotice,
    status: blockers.length ? 'PARTIAL_CALCULATION_SIZING_BLOCKED' : 'CALCULATED_SCREENING',
    interfacialArea: {
      value: calculateInterfacialArea(operating.operatingHoldup, selected.d32M),
      unit: 'm²/m³', equation: 'a = 6φ/d32',
      source: 'Asadollahzadeh et al. (2017), Eq. 2',
      basis: 'Total active liquid volume; spherical-drop/Sauter-diameter approximation; operating holdup, not flood holdup.',
    },
    inputs: {
      rotorDiameterM,
      statorOpeningGeometry: null,
      continuousSuperficialVelocityMS: positive(vc) ? vc : null,
      dispersedSuperficialVelocityMS: positive(vd) ? vd : null,
      continuousInterstitialVelocityMS: positive(vc) ? vc / (1 - operating.operatingHoldup) : null,
      continuousDensityKgM3: density,
      continuousViscosityPaS: viscosity,
      rotationalFrequencyS1: positive(selected.rpm) ? selected.rpm / 60 : null,
      pitchM: hcM,
    },
    continuousMixing: {
      value: ec,
      unit: 'm²/s',
      selectedCorrelation: ec === null ? null : 'KUMAR_HARTLAND_EC_SCREENING',
      candidate: 'Kumar–Hartland continuous-phase axial-dispersion expression',
      status: ec === null ? 'INPUTS_REQUIRED' : 'CALCULATED_SCREENING',
      coefficient: KH_PRIMARY_COEFFICIENT,
      coefficientUnit: 'dimensionless',
      hcM,
      q: primaryEvaluation?.q ?? null,
      reynoldsLike: primaryEvaluation?.reynoldsLike ?? null,
      normalizedEc: primaryEvaluation?.dimensionlessEc ?? null,
      equation:
        'Ec/(Vc hc) = 0.42 + 0.29 Vd/Vc + [c q + 13.38/(3.18+q)] (Vc DR rho/mu)^(-0.08) (D/DR)^0.16 (D/hc)^0.10',
      qEquation: 'q = (RPM/60) DR/Vc',
      pitchAssumption: 'PRELIMINARY PHYSICAL COMPARTMENT PITCH: hc = 0.5D',
      sourceQualification:
        'User-approved engineering screening expression; Kumar–Hartland source typography and RRBO/NMP applicability remain subject to pilot validation.',
      sourceDiscrepancy: 'Primary c=0.0126; Asadollahzadeh (2017) supporting presentation reports c=0.0105.',
      notationBoundary: 'Barred V and trailing undefined e are not used; Vc and Vd remain the specified superficial velocities.',
      supportingSource: 'Asadollahzadeh (2017) is supporting context, not authoritative source authority.',
      warning: screeningNotice,
      sensitivity: {
        coefficient: KH_SENSITIVITY_COEFFICIENT,
        value: sensitivityEc,
        unit: 'm²/s',
        normalizedEc: sensitivityEvaluation?.dimensionlessEc ?? null,
      },
    },
    dispersedMixing: {
      value: 0, unit: 'm²/s', status: 'SCREENING_ASSUMPTION',
      source: 'Asadollahzadeh et al. (2017), assumption following Eqs. 5–6',
      warning: 'Negligible dispersed backmixing is assumed for the base case; it is not verified for RRBO/NMP.',
    },
    peclet: {
      continuous: { value: null, status: 'HEIGHT_AND_CONTINUOUS_DISPERSION_REQUIRED' },
      dispersed: { value: null, status: 'ZERO_DISPERSION_LIMIT_INFINITE_FOR_POSITIVE_HEIGHT_AND_FLOW' },
      continuousScreeningDispersionM2S: ec,
      equations: ['Pe_c = H V_c / E_c', 'Pe_d = H V_d / E_d'],
      velocityBasis: 'SUPERFICIAL; do not silently substitute interstitial velocity',
      source: 'Asadollahzadeh et al. (2017), Eqs. 5–6',
      helper: 'calculateContinuousPeclet(H, Vc, Ec)',
    },
    steinerCrossCheck: {
      status: 'NOT_USED_IN_SCREENING',
      source: 'Steiner, Kumar & Hartland (1988), DOI 10.1002/cjce.5450660208',
      detail: 'Constants 0.188 and 0.0267 are not used in this user-approved K-H screening path.',
    },
    sensitivity: {
      status: sensitivityEc === null ? 'INPUTS_REQUIRED' : 'CALCULATED_COEFFICIENT_SENSITIVITY',
      parameter: 'Kumar–Hartland coefficient c',
      primaryCoefficient: KH_PRIMARY_COEFFICIENT,
      sensitivityCoefficient: KH_SENSITIVITY_COEFFICIENT,
      primaryEcM2S: ec,
      sensitivityEcM2S: sensitivityEc,
      result: ec === null || sensitivityEc === null ? null : {
        primary: { coefficient: KH_PRIMARY_COEFFICIENT, EcM2S: ec },
        sensitivity: { coefficient: KH_SENSITIVITY_COEFFICIENT, EcM2S: sensitivityEc },
      },
      baseCase: 'Ed = 0; explicit dispersed-phase screening assumption only',
      detail: 'The c=.0105 result is a coefficient sensitivity, not a second validated source or a with/without-backmixing comparison.',
    },
    applicability: {
      status: 'SCREENING_VALIDATION_REQUIRED',
      extrapolationAssessment: Math.abs(selected.columnDiameterM - 0.117) > 1e-6
        || selected.rpm < 100 || selected.rpm > 250
        ? 'OUTSIDE_CITED_KUHNI_STUDY_CONDITIONS; screening result requires pilot validation'
        : 'CITED_DIAMETER_AND_RPM_MATCH_ONLY; screening result requires pilot validation',
      referenceStudy: 'Asadollahzadeh (2017) is supporting context, not authoritative source authority for the K-H expression.',
      currentPoint: { diameterM: selected.columnDiameterM, rpm: selected.rpm },
      warnings: [
        'RRBO/NMP transfer from the cited test systems is unvalidated pre-pilot extrapolation.',
        'Physical compartment pitch = 0.5D is preliminary, not finalized geometry.',
        screeningNotice,
      ],
    },
    transferSolution: {
      status: 'NOT_EXECUTED_UPSTREAM_MIXING_INPUTS_REQUIRED',
      detail: 'Existing preliminary film/local-equilibrium routines require integration into a conserved axial-dispersion physical-compartment search. No legacy job is executed and no efficiency is assumed.',
    },
    blockers,
  };
}