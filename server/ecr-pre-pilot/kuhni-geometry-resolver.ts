import { createHash } from 'node:crypto';
import type { HydrodynamicProcessBasis } from './kuhni-hydrodynamics';
import { kuhniRunHash } from './kuhni-hydrodynamics';

export const KUHNI_GEOMETRY_RESOLVER_V100_VERSION = 'KUHNI_GEOMETRY_RESOLVER_V1.0.0';
export const KUHNI_GEOMETRY_RESOLVER_VERSION = 'KUHNI_GEOMETRY_RESOLVER_V1.0.1';
export const KUHNI_DRAG_MODEL_VERSION = 'MYINT_GARTHE_PREPILOT_CLOSURE_V1.0.0';
export const PRE_PILOT_DEFAULT_THEORETICAL_STAGES = 7;

const G = 9.80665;
const PI = Math.PI;
const ROTOR_TO_COLUMN = 0.5;
const COMPARTMENT_TO_COLUMN = 0.5;
const STATOR_FREE_AREA = 0.35;
const POWER_NUMBER = 1.2;
const DIRECT_TURBULENCE_C = 0.42;
const DESIGN_FLOOD_FRACTION = 0.7;
const MIN_RPM = 5;
const MAX_RPM = 60;
const RPM_STEP = 5;
const MAX_TIP_SPEED_MS = 4.5;
const MIN_ROTOR_DIAMETER_M = 0.05;
const MIN_COMPARTMENT_HEIGHT_M = 0.05;

function implementationHash(version: string, resultAdmissionRule: string) {
  const descriptors = [
  version,
  KUHNI_DRAG_MODEL_VERSION,
  'stage1-authority|stage2-nt-or-system-default-7',
  'Myint2006-Cd|Myint2007-shape|Garthe5.6-5.7|Garthe8.3-square-root',
  'turning-point-capacity|70%-flood|rpm:5..60|tip<=4.5',
  'ratios:Dr/Dc=.5,Hc/Dc=.5|Np=1.2|C=.42',
  ];
  if (resultAdmissionRule) descriptors.push(resultAdmissionRule);
  return createHash('sha256').update(descriptors.join('|')).digest('hex');
}

export const KUHNI_GEOMETRY_RESOLVER_V100_HASH = implementationHash(
  KUHNI_GEOMETRY_RESOLVER_V100_VERSION,
  '',
);
export const KUHNI_GEOMETRY_RESOLVER_HASH = implementationHash(
  KUHNI_GEOMETRY_RESOLVER_VERSION,
  'visible-envelope-and-diagnostic:CALCULATED_IN_RANGE-only|extrapolated:audit-only',
);

export type TheoreticalStageAuthority = {
  value: number;
  provenance: 'STAGE_2_CALCULATED_NT' | 'PRE_PILOT_DESIGN_DEFAULT';
  label: string;
  stage2JobId: string | null;
  stage2ResultHash: string | null;
};

function bisect(fn: (x: number) => number, low: number, high: number, iterations = 50) {
  let fLow = fn(low);
  const fHigh = fn(high);
  if (!Number.isFinite(fLow) || !Number.isFinite(fHigh) || fLow * fHigh > 0) throw new Error('ROOT_NOT_BRACKETED');
  for (let i = 0; i < iterations; i += 1) {
    const mid = (low + high) / 2;
    const fMid = fn(mid);
    if (!Number.isFinite(fMid)) throw new Error('NON_FINITE_ROOT_RESIDUAL');
    if (fLow * fMid <= 0) high = mid;
    else { low = mid; fLow = fMid; }
  }
  return (low + high) / 2;
}

function goldenMax(fn: (x: number) => number, low: number, high: number, iterations = 32) {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let c = high - ratio * (high - low);
  let d = low + ratio * (high - low);
  let fc = fn(c), fd = fn(d);
  for (let i = 0; i < iterations; i += 1) {
    if (fc > fd) {
      high = d; d = c; fd = fc; c = high - ratio * (high - low); fc = fn(c);
    } else {
      low = c; c = d; fc = fd; d = low + ratio * (high - low); fd = fn(d);
    }
  }
  const x = (low + high) / 2;
  return { x, value: fn(x) };
}

function myintDrag(re: number, kappa: number, lambda: number) {
  if (!(re > 0) || !(kappa > 0) || lambda < 0) throw new Error('INVALID_MYINT_STATE');
  return 8 * (2 + 3 * kappa + 3 * lambda) / (re * (1 + kappa + lambda))
    * (1 + 0.15 * re ** 0.687);
}

function terminalState(diameterM: number, rhoC: number, rhoD: number, muC: number, muD: number, sigma: number) {
  const deltaRho = rhoC - rhoD;
  if (!(diameterM > 0 && deltaRho > 0 && sigma > 0 && muC > 0 && muD > 0)) throw new Error('NON_PHYSICAL_TERMINAL_INPUT');
  const kappa = muD / muC;
  const archimedes = rhoC * deltaRho * G * diameterM ** 3 / muC ** 2;
  const residual = (re: number) => myintDrag(re, kappa, 0) * re ** 2 - 4 * archimedes / 3;
  let high = 1;
  while (residual(high) < 0 && high < 1e7) high *= 2;
  const re = bisect(residual, 1e-12, high);
  const velocityMS = re * muC / (rhoC * diameterM);
  const eotvos = deltaRho * G * diameterM ** 2 / sigma;
  const morton = G * muC ** 4 * deltaRho / (rhoC ** 2 * sigma ** 3);
  const taylor = re * morton ** 0.23;
  const aspectRatio = 1 - 0.0487 * taylor - 0.0289 * taylor ** 2;
  return { velocityMS, re, drag: myintDrag(re, kappa, 0), eotvos, morton, kappa, taylor, aspectRatio };
}

function evaluateCandidate(
  columnDiameterM: number,
  rpm: number,
  basis: HydrodynamicProcessBasis,
) {
  const continuous = basis.phaseConfiguration === 'nmp-continuous-rrbo-dispersed'
    ? basis.wetSolventPhase : basis.rrboFeed;
  const dispersed = basis.phaseConfiguration === 'nmp-continuous-rrbo-dispersed'
    ? basis.rrboFeed : basis.wetSolventPhase;
  if (!(continuous.densityKgM3 > dispersed.densityKgM3)) throw new Error('CONTINUOUS_PHASE_MUST_BE_HEAVIER');
  const rotorDiameterM = ROTOR_TO_COLUMN * columnDiameterM;
  const compartmentHeightM = COMPARTMENT_TO_COLUMN * columnDiameterM;
  const n = rpm / 60;
  const tipSpeedMS = PI * rotorDiameterM * n;
  if (tipSpeedMS > MAX_TIP_SPEED_MS) throw new Error('TIP_SPEED_LIMIT_EXCEEDED');
  const areaM2 = PI * columnDiameterM ** 2 / 4;
  const powerW = POWER_NUMBER * continuous.densityKgM3 * n ** 3 * rotorDiameterM ** 5;
  const psiWKg = powerW / (areaM2 * compartmentHeightM * continuous.densityKgM3);
  const d32M = DIRECT_TURBULENCE_C
    * (basis.interfacialTensionNM / continuous.densityKgM3) ** 0.6 * psiWKg ** -0.4;
  if (!(d32M > 0 && Number.isFinite(d32M))) throw new Error('D32_NOT_CALCULABLE');
  const terminal = terminalState(
    d32M, continuous.densityKgM3, dispersed.densityKgM3,
    continuous.dynamicViscosityPaS, dispersed.dynamicViscosityPaS, basis.interfacialTensionNM,
  );
  const rotorReynolds = continuous.densityKgM3 * n * rotorDiameterM ** 2 / continuous.dynamicViscosityPaS;
  if (!(rotorReynolds > 0)) throw new Error('ROTOR_REYNOLDS_NOT_CALCULABLE');
  const sourcePowerNumber = 1.08 + 10.94 / Math.sqrt(rotorReynolds) + 257.37 / rotorReynolds ** 1.5;
  const characteristicFactor = 1
    - 1.669 * sourcePowerNumber ** -3.945
    - 2.807 * (d32M / (columnDiameterM - rotorDiameterM)) ** 1.336
    - 1.159 * (compartmentHeightM / columnDiameterM) ** 2.049
    + 2.1 * STATOR_FREE_AREA ** 1.032;
  if (!(characteristicFactor > 0)) throw new Error('NON_POSITIVE_GARTHE_CHARACTERISTIC_FACTOR');
  const characteristicVelocityMS = terminal.velocityMS * characteristicFactor;
  const characteristicRe = continuous.densityKgM3 * characteristicVelocityMS * d32M / continuous.dynamicViscosityPaS;
  const characteristicDrag = myintDrag(characteristicRe, terminal.kappa, 0);
  const swarmVelocity = (holdup: number) => {
    const residual = (velocity: number) => {
      const re = continuous.densityKgM3 * velocity * d32M / continuous.dynamicViscosityPaS;
      const drag = myintDrag(re, terminal.kappa, 0);
      return velocity - characteristicVelocityMS
        * Math.sqrt(characteristicDrag / drag * (1 - holdup) ** 4.65);
    };
    return bisect(residual, 1e-14, characteristicVelocityMS);
  };
  const flowRatio = dispersed.flowM3S / continuous.flowM3S;
  const capacityAtHoldup = (holdup: number) =>
    (1 + flowRatio) * swarmVelocity(holdup)
    / (flowRatio / holdup + 1 / (1 - holdup));
  const flood = goldenMax(capacityAtHoldup, 1e-7, 1 - 1e-7);
  if (!(flood.value > 0 && flood.x > 0 && flood.x < 1)) throw new Error('NO_INTERIOR_FLOODING_MAXIMUM');
  const actualLoading = (continuous.flowM3S + dispersed.flowM3S) / (areaM2 * flood.value);
  const swarmVelocityMS = swarmVelocity(flood.x);
  const swarmRe = continuous.densityKgM3 * swarmVelocityMS * d32M / continuous.dynamicViscosityPaS;
  const dragApplicability: string[] = [];
  const shapeApplicability: string[] = [];
  const dragCheck = (condition: boolean, code: string) => { if (!condition) dragApplicability.push(code); };
  const shapeCheck = (condition: boolean, code: string) => { if (!condition) shapeApplicability.push(code); };
  const log10Morton = Math.log10(terminal.morton);
  dragCheck(log10Morton > -11.6 && log10Morton < -0.9, `MYINT_DRAG_MORTON_EXTRAPOLATED:${log10Morton}`);
  dragCheck(terminal.re > 0.17 && terminal.re < 200, `MYINT_TERMINAL_RE_EXTRAPOLATED:${terminal.re}`);
  dragCheck(characteristicRe > 0.17 && characteristicRe < 200, `MYINT_CHARACTERISTIC_RE_EXTRAPOLATED:${characteristicRe}`);
  dragCheck(swarmRe > 0.17 && swarmRe < 200, `MYINT_SWARM_RE_EXTRAPOLATED:${swarmRe}`);
  dragCheck(terminal.eotvos > 0.017 && terminal.eotvos < 12.1, `MYINT_DRAG_EOTVOS_EXTRAPOLATED:${terminal.eotvos}`);
  dragCheck(terminal.kappa > 0.1 && terminal.kappa < 100, `MYINT_DRAG_KAPPA_EXTRAPOLATED:${terminal.kappa}`);
  shapeCheck(log10Morton >= -11.6 && log10Morton <= -0.9, `MYINT_SHAPE_MORTON_EXTRAPOLATED:${log10Morton}`);
  shapeCheck(terminal.re >= 0.015 && terminal.re <= 850, `MYINT_SHAPE_RE_EXTRAPOLATED:${terminal.re}`);
  shapeCheck(terminal.eotvos >= 0.017 && terminal.eotvos <= 9.3, `MYINT_SHAPE_EOTVOS_EXTRAPOLATED:${terminal.eotvos}`);
  shapeCheck(terminal.taylor >= 0.0074 && terminal.taylor <= 3.6, `MYINT_SHAPE_TAYLOR_EXTRAPOLATED:${terminal.taylor}`);
  shapeCheck(terminal.kappa >= 0.1 && terminal.kappa <= 100, `MYINT_SHAPE_KAPPA_EXTRAPOLATED:${terminal.kappa}`);
  shapeCheck(terminal.aspectRatio > 0 && terminal.aspectRatio <= 1, `MYINT_SHAPE_NON_PHYSICAL:${terminal.aspectRatio}`);
  const applicability = [...dragApplicability, ...shapeApplicability];
  return {
    rpm, columnDiameterM, rotorDiameterM, compartmentHeightM, tipSpeedMS,
    powerW, powerVolumeWM3: powerW / (areaM2 * compartmentHeightM), psiWKg, d32M, rotorReynolds,
    terminal, sourcePowerNumber, characteristicFactor, characteristicVelocityMS, characteristicRe,
    floodHoldup: flood.x, floodTotalSuperficialVelocityMS: flood.value,
    swarmVelocityAtFloodMS: swarmVelocityMS, swarmRe, actualLoading,
    designFloodFraction: DESIGN_FLOOD_FRACTION,
    hydraulicPass: actualLoading <= DESIGN_FLOOD_FRACTION,
    applicability, dragApplicability, shapeApplicability,
    status: applicability.length ? 'CALCULATED_EXTRAPOLATED' as const : 'CALCULATED_IN_RANGE' as const,
  };
}

function diameterForRpm(rpm: number, basis: HydrodynamicProcessBasis) {
  const physicalMinimumM = Math.max(
    MIN_ROTOR_DIAMETER_M / ROTOR_TO_COLUMN,
    MIN_COMPARTMENT_HEIGHT_M / COMPARTMENT_TO_COLUMN,
  );
  const tipDerivedMaximumM = MAX_TIP_SPEED_MS * 60 / (PI * ROTOR_TO_COLUMN * rpm);
  const samples: Array<{ diameter: number; residual: number }> = [];
  for (let i = 0; i <= 30; i += 1) {
    const diameter = physicalMinimumM * (tipDerivedMaximumM / physicalMinimumM) ** (i / 30);
    try {
      const value = evaluateCandidate(diameter, rpm, basis).actualLoading - DESIGN_FLOOD_FRACTION;
      if (Number.isFinite(value)) samples.push({ diameter, residual: value });
    } catch { /* candidate is outside a physical equation domain */ }
  }
  let bracket: [number, number] | null = null;
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i - 1].residual * samples[i].residual <= 0) {
      bracket = [samples[i - 1].diameter, samples[i].diameter];
      break;
    }
  }
  if (!bracket) throw new Error('NO_DIAMETER_ROOT_WITHIN_PHYSICAL_BOUNDS');
  const diameter = bisect(
    (value) => evaluateCandidate(value, rpm, basis).actualLoading - DESIGN_FLOOD_FRACTION,
    bracket[0], bracket[1],
  );
  return {
    ...evaluateCandidate(diameter, rpm, basis),
    searchBounds: { physicalMinimumM, tipDerivedMaximumM, basis: 'rotor/compartment source minima and 4.5 m/s tip-speed ceiling' },
  };
}

function resolveKuhniGeometryCore(
  basis: HydrodynamicProcessBasis,
  theoreticalStages: TheoreticalStageAuthority,
  inRangeOnly: boolean,
) {
  const calculatedTrials: Array<ReturnType<typeof diameterForRpm>> = [];
  const rejected: Array<{ rpm: number; reason: string }> = [];
  for (let rpm = MIN_RPM; rpm <= MAX_RPM; rpm += RPM_STEP) {
    try { calculatedTrials.push(diameterForRpm(rpm, basis)); }
    catch (error) { rejected.push({ rpm, reason: error instanceof Error ? error.message : 'UNRESOLVED' }); }
  }
  const extrapolatedTrials = calculatedTrials.filter((trial) => trial.status !== 'CALCULATED_IN_RANGE');
  const trials = inRangeOnly
    ? calculatedTrials.filter((trial) => trial.status === 'CALCULATED_IN_RANGE')
    : calculatedTrials;
  const diagnosticPoint = [...trials].sort((a, b) =>
    a.columnDiameterM - b.columnDiameterM || a.rpm - b.rpm)[0] ?? null;
  const massTransferBlocker =
    'MASS_TRANSFER_COMPARTMENT_EFFICIENCY_MODEL_UNAVAILABLE: no approved equation currently maps local transfer to compartment efficiency and physical height.';
  const result = {
    status: trials.length ? 'HYDRAULIC_ENVELOPE_CALCULATED_MASS_TRANSFER_PENDING' as const : 'NOT_CALCULABLE' as const,
    classification: 'PRE_PILOT_PREDICTIVE_NOT_VENDOR_GUARANTEED' as const,
    engine: {
      id: 'kuhni_geometry_resolver',
      version: inRangeOnly ? KUHNI_GEOMETRY_RESOLVER_VERSION : KUHNI_GEOMETRY_RESOLVER_V100_VERSION,
      implementationHash: inRangeOnly ? KUHNI_GEOMETRY_RESOLVER_HASH : KUHNI_GEOMETRY_RESOLVER_V100_HASH,
      dragModel: KUHNI_DRAG_MODEL_VERSION,
    },
    theoreticalStagesUsed: theoreticalStages,
    authority: {
      processBasis: 'IMMUTABLE_STAGE_1_SNAPSHOT',
      geometryAndRpm: 'SYSTEM_RESOLVED_NO_USER_AUTHORITY',
      ratios: { rotorToColumn: ROTOR_TO_COLUMN, compartmentToColumn: COMPARTMENT_TO_COLUMN, rotorToCompartment: ROTOR_TO_COLUMN / COMPARTMENT_TO_COLUMN },
      constants: { statorFreeAreaFraction: STATOR_FREE_AREA, powerNumber: POWER_NUMBER, directTurbulenceC: DIRECT_TURBULENCE_C, designFloodFraction: DESIGN_FLOOD_FRACTION },
    },
    processBasis: basis,
    hydraulicRpmEnvelope: trials,
    ...(inRangeOnly ? {
      excludedExtrapolatedTrialCount: extrapolatedTrials.length,
      excludedExtrapolatedTrials: extrapolatedTrials,
      resultAdmissionRule: 'ONLY_CALCULATED_IN_RANGE_TRIALS_ARE_DISPLAYED_OR_USED_FOR_THE_HYDRAULIC_DIAGNOSTIC',
    } : {}),
    rejectedRpmTrials: rejected,
    hydraulicDiagnosticPoint: diagnosticPoint,
    hydraulicResolvedColumnDiameterM: diagnosticPoint?.columnDiameterM ?? null,
    resolvedColumnDiameterM: null,
    finalOperatingRpm: null,
    physicalCompartments: null,
    activeHeightM: null,
    coupledSelection: { status: 'DEPENDENCY_BLOCKED' as const, blocker: massTransferBlocker },
    blockers: [massTransferBlocker],
    evidence: {
      drag: 'Myint et al. (2006), clean-drop branch; source applicability retained per local state.',
      shape: 'Myint et al. (2007), E=1-0.0487Ta-0.0289Ta^2.',
      characteristic: 'Garthe (2005) Eq. 5.6 and Eq. 5.7.',
      swarm: 'Garthe (2005) Eq. 8.3 with the published square-root drag ratio.',
      flooding: 'Turning-point capacity derived from the admitted swarm function; 70% pre-pilot design fraction.',
      extrapolationRule: 'Documented pre-pilot extrapolation is retained as applicability metadata and is not, by itself, an execution blocker.',
    },
    calculationReport: {
      title: `${inRangeOnly ? KUHNI_GEOMETRY_RESOLVER_VERSION : KUHNI_GEOMETRY_RESOLVER_V100_VERSION} calculation report`,
      theoreticalStagesUsed: theoreticalStages,
      hydraulicResolvedColumnDiameterM: diagnosticPoint?.columnDiameterM ?? null,
      hydraulicDiagnosticRpm: diagnosticPoint?.rpm ?? null,
      hydraulicRpmRange: trials.length ? { minimum: trials[0].rpm, maximum: trials[trials.length - 1].rpm } : null,
      finalOperatingRpm: null,
      physicalCompartments: null,
      activeHeightM: null,
      disposition: 'Hydraulic envelope calculated; coupled mass-transfer selection pending.',
    },
  };
  return { ...result, calculationHash: kuhniRunHash(result) };
}

export function resolveKuhniGeometryV100(
  basis: HydrodynamicProcessBasis,
  theoreticalStages: TheoreticalStageAuthority,
) {
  return resolveKuhniGeometryCore(basis, theoreticalStages, false);
}

export function resolveKuhniGeometry(
  basis: HydrodynamicProcessBasis,
  theoreticalStages: TheoreticalStageAuthority,
) {
  return resolveKuhniGeometryCore(basis, theoreticalStages, true);
}