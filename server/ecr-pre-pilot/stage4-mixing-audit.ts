/**
 * Read-only pre-pilot audit. Unverified candidate equations are deliberately
 * absent: dimensional plausibility is not verification of source typography.
 */
const positive = (x: unknown): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x > 0;

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
  const missingParameters = [
    ...(rotorDiameterM === null ? ['rotorDiameterM'] : []),
    'statorOpeningGeometry',
  ];
  const vc = operating.continuousSuperficialVelocityMS;
  const vd = operating.dispersedSuperficialVelocityMS;
  const phase = processBasis?.phaseConfiguration;
  const continuous = phase === 'nmp-continuous-rrbo-dispersed' ? processBasis?.wetSolventPhase : null;
  const blockers = [
    {
      code: 'STAGE4_GEOMETRY_INPUT_REQUIRED',
      parameters: missingParameters,
      detail: 'Persist actual stator opening geometry. Do not substitute column diameter or infer an equivalent diameter before the correlation defines Ds. Free area and clearance are not yet established as independent required inputs.',
    },
    {
      code: 'STAGE4_AXIAL_MIXING_SOURCE_EQUATION_UNVERIFIED',
      parameters: ['Ds_definition', 'correlation_velocity_basis', 'N_units', 'equation_constants_and_exponents', 'calibration_range'],
      detail: 'The proposed Kumar–Hartland expression is not implemented: the retained Asadollahzadeh Eq. 9 extraction omits its algebra. Confirm the source equation and all symbols before numerical use.',
    },
    ...(!positive(vc) || !positive(vd) ? [{
      code: 'STAGE4_PERSISTED_PHASE_VELOCITIES_REQUIRED',
      parameters: [
        ...(!positive(vc) ? ['continuousSuperficialVelocityMS'] : []),
        ...(!positive(vd) ? ['dispersedSuperficialVelocityMS'] : []),
      ],
      detail: 'Use the persisted operating-point superficial phase velocities.',
    }] : []),
  ];
  return {
    classification: 'PRE-PILOT PREDICTIVE / SCREENING',
    status: 'PARTIAL_CALCULATION_SIZING_BLOCKED',
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
      continuousDensityKgM3: positive(continuous?.densityKgM3) ? continuous.densityKgM3 : null,
      continuousViscosityPaS: positive(continuous?.dynamicViscosityPaS) ? continuous.dynamicViscosityPaS : null,
      rotationalFrequencyS1: selected.rpm / 60,
      pitchM: 0.5 * selected.columnDiameterM,
    },
    continuousMixing: {
      value: null, unit: 'm²/s', selectedCorrelation: null,
      candidate: 'Kumar–Hartland mechanically agitated-column correlation; Asadollahzadeh (2017), Eq. 9 / reference 23',
      status: 'SOURCE_AND_GEOMETRY_VERIFICATION_REQUIRED',
    },
    dispersedMixing: {
      value: 0, unit: 'm²/s', status: 'SCREENING_ASSUMPTION',
      source: 'Asadollahzadeh et al. (2017), assumption following Eqs. 5–6',
      warning: 'Negligible dispersed backmixing is assumed for the base case; it is not verified for RRBO/NMP.',
    },
    peclet: {
      continuous: { value: null, status: 'HEIGHT_AND_CONTINUOUS_DISPERSION_REQUIRED' },
      dispersed: { value: null, status: 'ZERO_DISPERSION_LIMIT_INFINITE_FOR_POSITIVE_HEIGHT_AND_FLOW' },
      equations: ['Pe_c = H V_c / E_c', 'Pe_d = H V_d / E_d'],
      velocityBasis: 'SUPERFICIAL; do not silently substitute interstitial velocity',
      source: 'Asadollahzadeh et al. (2017), Eqs. 5–6',
    },
    steinerCrossCheck: {
      status: 'SOURCE_EQUATION_UNVERIFIED',
      source: 'Steiner, Kumar & Hartland (1988), DOI 10.1002/cjce.5450660208',
      detail: 'Constants 0.188 and 0.0267 are not used without the original nondimensional definition.',
    },
    sensitivity: {
      status: 'NOT_CALCULATED_SOURCE_DEFINITION_REQUIRED',
      baseCase: 'Ed = 0; screening assumption only',
      alternative: 'Modified Rod–Misek; Bodenstein definition and dimensional conversion unverified',
      result: null,
      detail: 'No with/without-backmixing performance comparison is claimed.',
    },
    applicability: {
      status: 'CORRELATION_VALIDITY_RANGE_UNVERIFIED',
      extrapolationAssessment: Math.abs(selected.columnDiameterM - 0.117) > 1e-6
        || selected.rpm < 100 || selected.rpm > 250
        ? 'OUTSIDE_CITED_KUHNI_STUDY_CONDITIONS; exact correlation envelope remains unverified'
        : 'CITED_DIAMETER_AND_RPM_MATCH_ONLY; exact correlation envelope remains unverified',
      referenceStudy: 'Asadollahzadeh (2017): D = 0.117 m; plotted N = 100–250 rpm. These are study conditions, not proven Kumar–Hartland correlation limits.',
      currentPoint: { diameterM: selected.columnDiameterM, rpm: selected.rpm },
      warnings: [
        'RRBO/NMP transfer from the cited test systems is unvalidated pre-pilot extrapolation.',
        'Physical compartment pitch = 0.5D is preliminary, not finalized Stage-3B geometry.',
        'No pilot calibration is required to report an explicitly qualified screening prediction.',
      ],
    },
    transferSolution: {
      status: 'NOT_EXECUTED_UPSTREAM_MIXING_INPUTS_REQUIRED',
      detail: 'Existing preliminary film/local-equilibrium routines require integration into a conserved axial-dispersion physical-compartment search. No legacy job is executed and no efficiency is assumed.',
    },
    blockers,
  };
}