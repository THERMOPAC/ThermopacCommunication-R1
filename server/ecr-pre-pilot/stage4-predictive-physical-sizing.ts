import { createHash } from 'node:crypto';
import sourceManifest from './stage4-finite-rate-source-manifest.json';
import {
  evaluateJobA,
  JOB_A_COMPONENT_ORDER,
  JOB_A_IMPLEMENTATION_SHA256,
} from './job-a';
import {
  createSevenComponentLocalEquilibriumSession,
  STAGE4_SEVEN_COMPONENT_ADAPTER_VERSION,
} from './stage4-seven-component-adapter';
import { calculateKumarHartlandEcDetails } from './stage4-mixing-audit';
import {
  createSevenComponentTwoFilmInterfaceSession,
  type JobBInterfaceRequest,
  type JobBInterfaceResponse,
} from './job-b-interface';

/**
 * A deliberately small, rate-based Stage-4 calculation.  It is not a
 * replacement for Stage 2: it uses the Stage-2 accepted N_T only as the
 * reference against which the independently searched physical count is
 * reported.  No Stage-2 outlet is used as a physical-column outlet or target.
 */
export const STAGE4_PREDICTIVE_PHYSICAL_SIZING_VERSION =
  'ECR_STAGE4_PREDICTIVE_PHYSICAL_SIZING_V2' as const;
export const STAGE4_PREDICTIVE_PHYSICAL_SIZING_HASH = createHash('sha256').update([
  STAGE4_PREDICTIVE_PHYSICAL_SIZING_VERSION,
  'dynamically-updated-pinned-seven-component-local-equilibrium',
  'job-a-two-film-coefficients',
  'non-equimolar-conserved-counter-current-finite-volume-axial-dispersion',
  'independent-fv-refinement-two-and-four-cells-per-physical-compartment',
  'molar-average-diagonal-generalized-fick-screening-frame',
  'kh-screening-ec-ed-zero-c0126-c0105',
  JSON.stringify(sourceManifest),
].join('|')).digest('hex');

const MW = [170.3348, 120.1916, 142.1971, 202.2506, 405.58, 99.1311, 18.01528];
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const positive = (value: unknown): value is number => finite(value) && value > 0;
const hash = (value: unknown) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
const normalize = (values: number[]) => {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!(total > 0) || values.some(value => !finite(value) || value < 0)) {
    throw new Error('STAGE4_PHYSICAL_SOLVER_INVALID_PHASE_STATE');
  }
  return values.map(value => value / total);
};

export type Stage4ScreeningProcessBasis = {
  temperatureK: number;
  phaseConfiguration: string;
  rrboFeed: { flowM3S: number; densityKgM3: number; dynamicViscosityPaS: number };
  wetSolventPhase: { flowM3S: number; densityKgM3: number; dynamicViscosityPaS: number };
  interfacialTensionNM: number;
  composition: {
    rrboFeedWt: {
      saturates: number; monoAromatics: number; diAromatics: number;
      polyAromatics: number; polarAromatics: number; nmp: number;
    };
    wetSolventWt: { nmp: number; water: number };
  };
};

export type Stage4ScreeningHydraulics = {
  diameterM: number; rotorDiameterM: number; rpm: number; d32M: number;
  operatingHoldup: number; continuousSuperficialVelocityMS: number;
  dispersedSuperficialVelocityMS: number;
};

type Flash = {
  status: string; phaseOrientation?: string; raffinateComposition?: number[];
  extractComposition?: number[]; resultHash?: string;
};
type FlashEvaluator = (request: {
  temperatureK: number; componentMolarInventory: number[];
  componentOrder: [...typeof JOB_A_COMPONENT_ORDER];
}, timeoutMs?: number) => Promise<Flash>;
type InterfaceEvaluator = (request: JobBInterfaceRequest, timeoutMs?: number) => Promise<JobBInterfaceResponse>;

export type Stage4PhysicalSizingInput = {
  calculatedNt: number;
  stage1SnapshotHash: string;
  stage2JobId: string;
  stage2ResultHash: string;
  stage2EngineHash: string;
  stage3RunId: number | string;
  stage3ImmutableHash: string;
  stage3ImplementationHash: string;
  selectedTrialId: string;
  selectedTrialOrdinal: number;
  processBasis: Stage4ScreeningProcessBasis;
  hydraulics: Stage4ScreeningHydraulics;
  stage1Targets: Record<string, unknown>;
  maximumCompartments?: number;
};
export type Stage4PhysicalSizingProgress = {
  caseCoefficient: 0.0126 | 0.0105;
  physicalCompartments: number;
  finiteVolumeCellsPerPhysicalCompartment: 2 | 4;
  state: 'STARTED' | 'CONVERGED' | 'NUMERICAL_FAILURE';
  localFlashCalls: number;
  reason: string | null;
};

export function calculateKumarHartlandScreeningDispersion(input: {
  c: 0.0126 | 0.0105;
  diameterM: number; rotorDiameterM: number; rpm: number;
  continuousSuperficialVelocityMS: number; dispersedSuperficialVelocityMS: number;
  continuousDensityKgM3: number; continuousViscosityPaS: number;
}) {
  const { c, diameterM: D, rotorDiameterM: DR, rpm, continuousSuperficialVelocityMS: vc,
    dispersedSuperficialVelocityMS: vd, continuousDensityKgM3: rho,
    continuousViscosityPaS: mu } = input;
  if (![D, DR, rpm, vc, vd, rho, mu].every(positive) || !(DR < D)) {
    throw new Error('STAGE4_KH_SCREENING_INPUT_INVALID');
  }
  const detail = calculateKumarHartlandEcDetails({
    columnDiameterM: D, rotorDiameterM: DR, rpm, continuousSuperficialVelocityMS: vc,
    dispersedSuperficialVelocityMS: vd, continuousDensityKgM3: rho,
    continuousViscosityPaS: mu, hcM: .5 * D,
  }, c);
  return {
    valueM2S: detail.ecM2S, normalizedEcOverVcHc: detail.dimensionlessEc,
    q: detail.q, compartmentPitchM: detail.hcM,
    c,
    equation: 'Ec/(Vc hc)=.42+.29(Vd/Vc)+[c q+13.38/(3.18+q)](Vc DR rho/mu)^-.08(D/DR)^.16(D/hc)^.10',
    assumptions: [
      'Engineer-authorized Kumar–Hartland screening expression; not a claimed exact reproduction of a 2017 publication.',
      'Vc and Vd are persisted superficial velocities; hc=0.5D; Ec is applied only to continuous-phase axial dispersion.',
      'Ed=0 m2/s screening assumption.',
    ],
  };
}

/**
 * Continuous-phase overall two-film coefficient with xC*=m*xD*.  Keeping
 * this small kernel exported makes the orientation and zero-driving-force
 * condition independently testable.
 */
export function calculateTwoFilmContinuousFlux(input: {
  kcMPerS: number; kdMPerS: number; continuousTotalConcentrationMolM3: number;
  dispersedTotalConcentrationMolM3: number; partitionXCOverXD: number;
  continuousMoleFraction: number; dispersedMoleFraction: number;
}) {
  const { kcMPerS: kc, kdMPerS: kd, continuousTotalConcentrationMolM3: cc,
    dispersedTotalConcentrationMolM3: cd, partitionXCOverXD: m,
    continuousMoleFraction: xc, dispersedMoleFraction: xd } = input;
  if (![kc, kd, cc, cd, m].every(positive) || ![xc, xd].every(value =>
    finite(value) && value >= 0 && value <= 1)) {
    throw new Error('STAGE4_TWO_FILM_INPUT_NONPHYSICAL');
  }
  const kocMPerS = 1 / (1 / kc + m * cc / (kd * cd));
  const drivingForce = xc - m * xd;
  const fluxMolM2S = kocMPerS * cc * drivingForce;
  if (!finite(kocMPerS) || !finite(fluxMolM2S)) throw new Error('STAGE4_TWO_FILM_RESULT_NONFINITE');
  return { kocMPerS, drivingForce, fluxMolM2S };
}

function feeds(basis: Stage4ScreeningProcessBasis) {
  const rrboMassKgS = basis.rrboFeed.flowM3S * basis.rrboFeed.densityKgM3;
  const wetMassKgS = basis.wetSolventPhase.flowM3S * basis.wetSolventPhase.densityKgM3;
  const r = basis.composition.rrboFeedWt;
  const w = basis.composition.wetSolventWt;
  const oil = [r.saturates, r.monoAromatics, r.diAromatics, r.polyAromatics,
    r.polarAromatics, r.nmp, 0].map((pct, index) => rrboMassKgS * pct * 10 / MW[index]);
  const solvent = [0, 0, 0, 0, 0, wetMassKgS * w.nmp * 10 / MW[5],
    wetMassKgS * w.water * 10 / MW[6]];
  if (basis.phaseConfiguration === 'nmp-continuous-rrbo-dispersed') {
    return { continuous: solvent, dispersed: oil, continuousIsExtract: true };
  }
  if (basis.phaseConfiguration === 'rrbo-continuous-nmp-dispersed') {
    return { continuous: oil, dispersed: solvent, continuousIsExtract: false };
  }
  throw new Error('STAGE4_PHYSICAL_SOLVER_PHASE_CONFIGURATION_INVALID');
}

export function evaluateStage4ProductTargets(outletOil: number[], oilFeed: number[], targets: Record<string, unknown>) {
  if (outletOil.length !== 7 || oilFeed.length !== 7
    || [...outletOil, ...oilFeed].some(value => !finite(value) || value < 0)) {
    throw new Error('STAGE4_PHYSICAL_SOLVER_NEGATIVE_OR_INVALID_PRODUCT_OUTLET');
  }
  const masses = outletOil.map((flow, index) => flow * MW[index]);
  const feedMass = oilFeed.map((flow, index) => flow * MW[index]);
  const hydrocarbon = masses.slice(0, 5).reduce((a, b) => a + b, 0);
  const feedHydrocarbon = feedMass.slice(0, 5).reduce((a, b) => a + b, 0);
  const full = masses.reduce((a, b) => a + b, 0);
  if (!(hydrocarbon > 0 && feedHydrocarbon > 0 && full > 0)) {
    throw new Error('STAGE4_PHYSICAL_SOLVER_PRODUCT_MASS_INVALID');
  }
  // Stage 4 uses the same explicitly governed Stage-1 product targets.  A
  // missing target is a data-integrity failure, never an unbounded default.
  const required = (name: string) => {
    const value = targets[name];
    if (!finite(value)) throw new Error(`STAGE4_STAGE1_TARGET_REQUIRED:${name}`);
    return value;
  };
  const recovery = 100 * hydrocarbon / feedHydrocarbon;
  const allocations = [
    required('sulfurAllocationSatPct'), required('sulfurAllocationMonoPct'),
    required('sulfurAllocationDiPct'), required('sulfurAllocationPolyPct'),
    required('sulfurAllocationPaPct'),
  ];
  const feedSulfur = required('feedSulfurPpm');
  const sulfurCanBeEvaluated = allocations.every((allocation, i) =>
    allocation === 0 || feedMass[i] > 0);
  // This is the already-admitted Stage-2 sulfur post-processing inference:
  // each molecular pool retains the fraction predicted by the 7C LLE solve.
  // It is not a newly fitted sulfur-transfer correlation.
  const sulfur = sulfurCanBeEvaluated
    ? allocations.reduce((sum, allocation, i) =>
      sum + feedSulfur * allocation / 100 * masses[i] / feedMass[i], 0)
    : null;
  const metrics = [
    ['NMP_FREE_RRBO_HYDROCARBON_RECOVERY_PCT', 'GTE', recovery,
      required('minimumRecoveryPct')],
    ['RAFFINATE_SATURATES_WT_PCT_NMP_FREE_HYDROCARBON', 'GTE', 100 * masses[0] / hydrocarbon,
      required('minimumRaffinateSaturatesWt')],
    ['RAFFINATE_TOTAL_AROMATICS_WT_PCT_NMP_FREE_HYDROCARBON', 'LTE',
      100 * (masses[1] + masses[2] + masses[3] + masses[4]) / hydrocarbon,
      required('targetRaffinateTotalAromaticsWt')],
    ['RAFFINATE_POLAR_AROMATICS_WT_PCT_NMP_FREE_HYDROCARBON', 'LTE', 100 * masses[4] / hydrocarbon,
      required('targetRaffinatePolarAromaticsWt')],
    ['RAFFINATE_NMP_WT_PCT_FULL_RAFFINATE_STREAM', 'LTE', 100 * masses[5] / full,
      required('maximumNmpRaffinateWt')],
  ].map(([name, comparator, actual, target]) => ({
    name, comparator, actual, target,
    status: comparator === 'GTE' ? actual >= target ? 'PASS' : 'FAIL' : actual <= target ? 'PASS' : 'FAIL',
  }));
  const sulfurTarget = required('targetRaffinateSulfurPpm');
  const sulfurMetric = sulfur === null ? {
    name: 'RAFFINATE_SULFUR_PPM', actual: null, target: sulfurTarget,
    status: 'NOT_EVALUATED_ZERO_FEED_MOLECULAR_POOL_PREVENTS_GOVERNED_STAGE2_INFERENCE' as const,
  } : {
    name: 'RAFFINATE_SULFUR_PPM', actual: sulfur, target: sulfurTarget,
    status: sulfur <= sulfurTarget ? 'PASS' as const : 'FAIL' as const,
  };
  return {
    metrics: [...metrics, sulfurMetric],
    allEvaluatedTargetsPassed: metrics.every(metric => metric.status === 'PASS')
      && sulfurMetric.status === 'PASS',
    raffinateRecoveryPct: recovery,
  };
}

type LocalFlash = {
  continuousEquilibriumComposition: number[];
  dispersedEquilibriumComposition: number[];
  resultHash: string | null;
};
type MeshSolve = {
  converged: boolean;
  reason: string | null;
  iterations: number;
  localFlashCalls: number;
  continuousOutlet: number[];
  dispersedOutlet: number[];
  transfer: number[][];
  maxScaledUpdateResidual: number | null;
  maxScaledConstitutiveResidual: number | null;
  maxScaledComponentBalanceResidual: number | null;
  maxAxialResidualMolS: number | null;
  maxDiffusiveFrameResidualMolS: number | null;
  maxFilmEqualityResidualMolS: number | null;
  maxStefanIdentityResidualMolS: number | null;
};

/** Component residual scale is the total supplied inventory of that component,
 * not the phase that happens to be indexed by the residual vector. */
const scaledMaximum = (values: number[], componentSupplyScale: number[]) =>
  Math.max(...values.map((value, index) =>
    Math.abs(value) / componentSupplyScale[index % componentSupplyScale.length]));

function validateLocalFlash(flash: Flash, continuousIsExtract: boolean): LocalFlash {
  if (flash.status !== 'CALCULATED' || flash.phaseOrientation !== 'NMP_RICH_EXTRACT'
    || !Array.isArray(flash.raffinateComposition) || !Array.isArray(flash.extractComposition)
    || flash.raffinateComposition.length !== 7 || flash.extractComposition.length !== 7) {
    throw new Error(`STAGE4_PINNED_7C_LOCAL_EQUILIBRIUM_UNAVAILABLE:${flash.status}`);
  }
  const continuousEquilibriumComposition = continuousIsExtract
    ? flash.extractComposition : flash.raffinateComposition;
  const dispersedEquilibriumComposition = continuousIsExtract
    ? flash.raffinateComposition : flash.extractComposition;
  if (![...continuousEquilibriumComposition, ...dispersedEquilibriumComposition]
    .every(positive)) throw new Error('STAGE4_LOCAL_EQUILIBRIUM_COMPOSITION_INVALID');
  return {
    continuousEquilibriumComposition,
    dispersedEquilibriumComposition,
    resultHash: typeof flash.resultHash === 'string' ? flash.resultHash : null,
  };
}

async function solveCase(input: Stage4PhysicalSizingInput, c: 0.0126 | 0.0105,
  flashEvaluator: FlashEvaluator, interfaceEvaluator: InterfaceEvaluator,
  controls: {
    deadlineMs: number; operationTimeoutMs: number; cancelled: () => boolean;
    progress?: (event: Stage4PhysicalSizingProgress) => void;
  }) {
  const remainingOperationMs = () => Math.max(1, Math.min(
    controls.operationTimeoutMs, controls.deadlineMs - Date.now(),
  ));
  if (controls.cancelled() || Date.now() > controls.deadlineMs) {
    throw new Error(controls.cancelled()
      ? 'STAGE4_FINITE_RATE_SOLVER_CANCELLED'
      : 'GLOBAL_STAGE4_WALL_CLOCK_BUDGET_EXHAUSTED');
  }
  const { processBasis: basis, hydraulics } = input;
  const feed = feeds(basis);
  const continuousPhase = basis.phaseConfiguration === 'nmp-continuous-rrbo-dispersed'
    ? basis.wetSolventPhase : basis.rrboFeed;
  const dispersedPhase = basis.phaseConfiguration === 'nmp-continuous-rrbo-dispersed'
    ? basis.rrboFeed : basis.wetSolventPhase;
  const dispersion = calculateKumarHartlandScreeningDispersion({
    c, diameterM: hydraulics.diameterM, rotorDiameterM: hydraulics.rotorDiameterM,
    rpm: hydraulics.rpm, continuousSuperficialVelocityMS: hydraulics.continuousSuperficialVelocityMS,
    dispersedSuperficialVelocityMS: hydraulics.dispersedSuperficialVelocityMS,
    continuousDensityKgM3: continuousPhase.densityKgM3,
    continuousViscosityPaS: continuousPhase.dynamicViscosityPaS,
  });
  const total = feed.continuous.map((value, i) => value + feed.dispersed[i]);
  // This first flash is only adapter/provenance binding and the base-film
  // composition. It is never retained as an equilibrium partition closure.
  const inletFlash = validateLocalFlash(await flashEvaluator({
    temperatureK: basis.temperatureK, componentMolarInventory: total,
    componentOrder: [...JOB_A_COMPONENT_ORDER],
  }, remainingOperationMs()), feed.continuousIsExtract);
  const localComposition = normalize(feed.continuous);
  const jobA = evaluateJobA({
    stage1SnapshotHash: input.stage1SnapshotHash, theoreticalStages: input.calculatedNt,
    theoreticalStageProvenance: 'STAGE_2_CALCULATED_NT', stage2JobId: input.stage2JobId,
    stage2ResultHash: input.stage2ResultHash, stage2EngineHash: input.stage2EngineHash,
    // The validated adapter response is the runtime integrity evidence used
    // here.  This field is an immutable adapter binding, not a second worker
    // launch merely to obtain a redundant preflight response.
    thermodynamicAdapterPreflightHash: inletFlash.resultHash
      ?? hash(`PINNED_7C_ADAPTER:${STAGE4_SEVEN_COMPONENT_ADAPTER_VERSION}`),
    stage3RunId: String(input.stage3RunId), stage3ImmutableHash: input.stage3ImmutableHash,
    stage3ImplementationHash: input.stage3ImplementationHash, selectedTrialId: input.selectedTrialId,
    selectedTrialOrdinal: input.selectedTrialOrdinal, temperatureK: basis.temperatureK,
    interfacialTensionNM: basis.interfacialTensionNM, d32M: hydraulics.d32M,
    slipVelocityMS: hydraulics.continuousSuperficialVelocityMS / (1 - hydraulics.operatingHoldup)
      + hydraulics.dispersedSuperficialVelocityMS / hydraulics.operatingHoldup,
    continuous: { densityKgM3: continuousPhase.densityKgM3,
      dynamicViscosityPaS: continuousPhase.dynamicViscosityPaS, moleFractions: localComposition },
    dispersed: { densityKgM3: dispersedPhase.densityKgM3,
      dynamicViscosityPaS: dispersedPhase.dynamicViscosityPaS, moleFractions: normalize(feed.dispersed) },
  });
  const kc = JOB_A_COMPONENT_ORDER.map(component =>
    (jobA.cells as any[]).find(cell => cell.componentId === component && cell.phase === 'continuous').filmCoefficientMS);
  const kd = JOB_A_COMPONENT_ORDER.map(component =>
    (jobA.cells as any[]).find(cell => cell.componentId === component && cell.phase === 'dispersed').filmCoefficientMS);
  const pitch = dispersion.compartmentPitchM;
  const area = Math.PI * hydraulics.diameterM ** 2 / 4;
  const a = 6 * hydraulics.operatingHoldup / hydraulics.d32M;
  const cTot = continuousPhase.densityKgM3 / (normalize(feed.continuous)
    .reduce((sum, fraction, i) => sum + fraction * MW[i], 0) / 1000);
  const dTot = dispersedPhase.densityKgM3 / (normalize(feed.dispersed)
    .reduce((sum, fraction, i) => sum + fraction * MW[i], 0) / 1000);
  const max = input.maximumCompartments ?? 80;
  if (!Number.isInteger(max) || max < input.calculatedNt) {
    throw new Error('STAGE4_PHYSICAL_COUNT_BOUND_BELOW_ACCEPTED_NT');
  }
  const result = {
    c, dispersion,
    continuousPecletPerPhysicalCompartment:
      pitch * hydraulics.continuousSuperficialVelocityMS / dispersion.valueM2S,
    dispersedPecletPerPhysicalCompartment: {
      value: null, status: 'INFINITE_ZERO_DISPERSION_LIMIT_ED_ZERO',
    },
    equilibrium: {
      localClosure: 'PINNED_7C_FLASH_REEVALUATED_FROM_EACH_CURRENT_LOCAL_COUNTERCURRENT_STATE',
      inletAdapterResultHash: inletFlash.resultHash,
    },
    jobA: { implementationSha256: JOB_A_IMPLEMENTATION_SHA256, resultSha256: jobA.resultSha256 },
    twoFilm: {
      continuousFilmCoefficientKcMPerS: kc,
      dispersedFilmCoefficientKdMPerS: kd,
      constitutiveClosure: 'Job-B 13-unknown interface root: six continuous and six dispersed interface logits plus total Stefan molar flux; seven pinned-7C isoactivity equations and six independent component-flux equality equations.',
      rateEquations: 'rCi=kc_i CtC(xCb_i-xCi_i); JCi=rCi-xCi_i sum(rC); rDi=kd_i CtD(xDi_i-xDb_i); JDi=rDi-xDi_i sum(rD); Ni=JCi+xCi_i N=JDi+xDi_i N.',
      concentrationConvention: 'CtC and CtD are locally recomputed as frozen phase density divided by local phase-average molecular weight. Job-A kc/kd remain frozen from the persisted Stage-3 hydraulic state.',
      referenceFrame: 'Screening diagonal generalized-Fick two-film closure. J is zero-sum only in the molar-average diffusive frame; total interphase N_i retains its Stefan/convective sum and can change phase total molar flow.',
      orientation: feed.continuousIsExtract
        ? 'continuous=NMP-rich extract; dispersed=raffinate'
        : 'continuous=raffinate; dispersed=NMP-rich extract',
    },
    selected: null as any, attemptedPhysicalCompartments: [] as number[],
    maximumPhysicalCompartmentsSearched: max,
    nonconvergedPhysicalCounts: [] as number[],
    physicalCountOutcomes: [] as Array<{
      physicalCompartments: number;
      status: 'TARGET_PASS' | 'TARGET_FAIL' | 'NUMERICAL_UNRESOLVED';
      reason: string | null;
    }>,
    lastConservedPhysicalTrial: null as any,
    meshRefinement: {
      coarseFiniteVolumeCellsPerPhysicalCompartment: 2,
      refinedFiniteVolumeCellsPerPhysicalCompartment: 4,
      acceptanceRelativeOutletDifference: .01,
    },
    searchTermination: null as string | null,
  };
  const solveMesh = async (physicalCompartments: number, cellsPerPhysicalCompartment: number):
    Promise<MeshSolve> => {
    const cells = physicalCompartments * cellsPerPhysicalCompartment;
    const dz = pitch / cellsPerPhysicalCompartment;
    const interfacialArea = a * area * dz;
    const dispersionConductance = dispersion.valueM2S * area * cTot / dz;
    const feedScale = feed.continuous.map((value, index) =>
      Math.max(value + feed.dispersed[index], 1e-12));
    let transfer = Array.from({ length: cells }, () => Array(7).fill(0));
    let latestFrame = 0;
    let latestFilmEquality = 0;
    let latestStefanIdentity = 0;
    let flashCalls = 0;
    const maxIterations = 80;
    const relativeTolerance = 2e-6;
    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      if (Date.now() > controls.deadlineMs || controls.cancelled()) {
        return { converged: false,
          reason: controls.cancelled() ? 'STAGE4_FINITE_RATE_SOLVER_CANCELLED' : 'GLOBAL_STAGE4_WALL_CLOCK_BUDGET_EXHAUSTED',
          iterations: iteration,
          localFlashCalls: flashCalls, continuousOutlet: [], dispersedOutlet: [], transfer,
          maxScaledUpdateResidual: null, maxScaledConstitutiveResidual: null,
          maxScaledComponentBalanceResidual: null, maxAxialResidualMolS: null,
          maxDiffusiveFrameResidualMolS: null, maxFilmEqualityResidualMolS: null,
          maxStefanIdentityResidualMolS: null };
      }
      latestFrame = 0;
      latestFilmEquality = 0;
      latestStefanIdentity = 0;
      const faces = Array.from({ length: cells + 1 }, () => Array(7).fill(0));
      faces[0] = [...feed.continuous];
      for (let j = 0; j < cells; j += 1) {
        faces[j + 1] = faces[j].map((value, i) => value - transfer[j][i]);
      }
      const qFaces = faces.map(row => row.reduce((sum, value) => sum + value, 0));
      if (faces.flat().some(value => !finite(value) || value < -1e-11)
        || qFaces.some(value => !positive(value))) {
        return { converged: false, reason: 'NONNEGATIVE_CONTINUOUS_FACE_GATE_FAILED', iterations: iteration,
          localFlashCalls: flashCalls, continuousOutlet: [], dispersedOutlet: [], transfer,
          maxScaledUpdateResidual: null, maxScaledConstitutiveResidual: null,
          maxScaledComponentBalanceResidual: null, maxAxialResidualMolS: null,
          maxDiffusiveFrameResidualMolS: null, maxFilmEqualityResidualMolS: null,
          maxStefanIdentityResidualMolS: null };
      }
      // With known face component fluxes, the continuous implicit FV equation
      // is marched from the zero-diffusive-flux outlet. This is algebraically
      // equivalent to a tridiagonal solve but preserves the component flux
      // exactly even when the total continuous molar flow changes.
      const xc = Array.from({ length: cells }, () => Array(7).fill(0));
      xc[cells - 1] = faces[cells].map((value, i) => value / qFaces[cells]);
      for (let j = cells - 2; j >= 0; j -= 1) {
        xc[j] = faces[j + 1].map((value, i) =>
          (value + dispersionConductance * xc[j + 1][i])
          / (qFaces[j + 1] + dispersionConductance));
      }
      const dIn = Array.from({ length: cells }, () => Array(7).fill(0));
      const dOut = Array.from({ length: cells }, () => Array(7).fill(0));
      let dispersed = [...feed.dispersed];
      for (let j = cells - 1; j >= 0; j -= 1) {
        dIn[j] = [...dispersed];
        dispersed = dispersed.map((value, i) => value + transfer[j][i]);
        dOut[j] = [...dispersed];
      }
      if ([...xc.flat(), ...dIn.flat(), ...dOut.flat()].some(value => !finite(value) || value < -1e-11)) {
        return { converged: false, reason: 'NONNEGATIVE_LOCAL_PHASE_STATE_GATE_FAILED', iterations: iteration,
          localFlashCalls: flashCalls, continuousOutlet: [], dispersedOutlet: [], transfer,
          maxScaledUpdateResidual: null, maxScaledConstitutiveResidual: null,
          maxScaledComponentBalanceResidual: null, maxAxialResidualMolS: null,
          maxDiffusiveFrameResidualMolS: null, maxFilmEqualityResidualMolS: null,
          maxStefanIdentityResidualMolS: null };
      }
      const proposed: number[][] = [];
      try {
        for (let j = 0; j < cells; j += 1) {
          const dInventory = dIn[j].map((value, i) => .5 * (value + dOut[j][i]));
          const xD = normalize(dInventory);
          const localCtC = continuousPhase.densityKgM3 / (xc[j]
            .reduce((sum, fraction, i) => sum + fraction * MW[i], 0) / 1000);
          const localCtD = dispersedPhase.densityKgM3 / (xD
            .reduce((sum, fraction, i) => sum + fraction * MW[i], 0) / 1000);
          if (controls.cancelled() || Date.now() > controls.deadlineMs) {
            throw new Error(controls.cancelled()
              ? 'STAGE4_FINITE_RATE_SOLVER_CANCELLED'
              : 'GLOBAL_STAGE4_WALL_CLOCK_BUDGET_EXHAUSTED');
          }
          const interfaceResult = await interfaceEvaluator({
            componentOrder: [...JOB_A_COMPONENT_ORDER], T: basis.temperatureK,
            x_bulk_continuous: xc[j], x_bulk_dispersed: xD, kc, kd,
            CtC: localCtC, CtD: localCtD, phase_config: basis.phaseConfiguration as any,
          }, remainingOperationMs());
          if (interfaceResult.status !== 'CALCULATED_PRELIMINARY_INTERFACE'
            || !interfaceResult.interface
            || interfaceResult.interface.continuousComponentFluxMolM2S.length !== 7) {
            throw new Error(`STAGE4_JOB_B_INTERFACE_UNAVAILABLE:${interfaceResult.status}`);
          }
          const raw = interfaceResult.interface.continuousComponentFluxMolM2S
            .map(value => value * interfacialArea);
          const equality = interfaceResult.interface.fluxEqualityResidualMolM2S;
          if (equality.length !== 7 || equality.some(value => !finite(value))
            || !finite(interfaceResult.interface.totalMolarFluxMolM2S)) {
            throw new Error('STAGE4_JOB_B_INTERFACE_FILM_CLOSURE_INVALID');
          }
          latestFilmEquality = Math.max(latestFilmEquality,
            ...equality.map(value => Math.abs(value) * interfacialArea));
          latestStefanIdentity = Math.max(latestStefanIdentity, Math.abs(
            raw.reduce((sum, value) => sum + value, 0)
            - interfaceResult.interface.totalMolarFluxMolM2S * interfacialArea,
          ));
          // In the allowed molar-average generalized-Fick screening frame, the
          // diffusive part sums to zero. Its non-zero total transfer is kept as
          // Stefan/convective phase transfer, never discarded by forcing it to
          // zero as the earlier diagnostic implementation did.
          const diffusive = interfaceResult.interface.continuousDiffusiveFluxMolM2S;
          if (diffusive.length !== 7 || diffusive.some(value => !finite(value))) {
            throw new Error('STAGE4_JOB_B_INTERFACE_DIFFUSIVE_FRAME_INVALID');
          }
          latestFrame = Math.max(latestFrame,
            Math.abs(diffusive.reduce((sum, value) => sum + value, 0)) * interfacialArea);
          proposed.push(raw);
        }
      } catch (error) {
        return { converged: false, reason: error instanceof Error ? error.message : 'LOCAL_EQUILIBRIUM_FAILURE',
          iterations: iteration + 1, localFlashCalls: flashCalls, continuousOutlet: [], dispersedOutlet: [], transfer,
          maxScaledUpdateResidual: null, maxScaledConstitutiveResidual: null,
          maxScaledComponentBalanceResidual: null, maxAxialResidualMolS: null,
          maxDiffusiveFrameResidualMolS: null, maxFilmEqualityResidualMolS: null,
          maxStefanIdentityResidualMolS: null };
      }
      // A bounded line search maintains non-negative face and countercurrent
      // dispersed flows; it is numerical damping, not a transfer limiter.
      let relaxation = .20;
      const feasible = (candidate: number[][]) => {
        const c = [...feed.continuous], d = [...feed.dispersed];
        for (let j = 0; j < cells; j += 1) {
          for (let i = 0; i < 7; i += 1) c[i] -= candidate[j][i];
          if (c.some(value => value < -1e-12 || !finite(value))) return false;
        }
        for (let j = cells - 1; j >= 0; j -= 1) {
          for (let i = 0; i < 7; i += 1) d[i] += candidate[j][i];
          if (d.some(value => value < -1e-12 || !finite(value))) return false;
        }
        return [...c, ...d].every(value => value >= -1e-12 && finite(value));
      };
      let next = transfer.map((row, j) => row.map((value, i) =>
        value + relaxation * (proposed[j][i] - value)));
      while (!feasible(next) && relaxation > 1e-10) {
        relaxation /= 2;
        next = transfer.map((row, j) => row.map((value, i) =>
          value + relaxation * (proposed[j][i] - value)));
      }
      if (!feasible(next)) {
        return { converged: false, reason: 'NONNEGATIVE_LINE_SEARCH_EXHAUSTED', iterations: iteration + 1,
          localFlashCalls: flashCalls, continuousOutlet: [], dispersedOutlet: [], transfer,
          maxScaledUpdateResidual: null, maxScaledConstitutiveResidual: null,
          maxScaledComponentBalanceResidual: null, maxAxialResidualMolS: null,
          maxDiffusiveFrameResidualMolS: null, maxFilmEqualityResidualMolS: null,
          maxStefanIdentityResidualMolS: null };
      }
      const update = scaledMaximum(next.flatMap((row, j) => row.map((value, i) =>
        value - transfer[j][i])), feedScale);
      if (update <= relativeTolerance) {
        // `proposed` was evaluated from the *current* reconstructed faces and
        // local interface roots. Qualify that same state; returning `next`
        // would otherwise pair outlets with stale constitutive evaluations.
        const continuousOutlet = feed.continuous.map((value, i) =>
          value - transfer.reduce((sum, row) => sum + row[i], 0));
        const dispersedOutlet = feed.dispersed.map((value, i) =>
          value + transfer.reduce((sum, row) => sum + row[i], 0));
        const constitutive = scaledMaximum(transfer.flatMap((row, j) =>
          row.map((value, i) => value - proposed[j][i])), feedScale);
        const axial = Math.max(...transfer.flatMap((row, j) => row.map((value, i) =>
          faces[j][i] - faces[j + 1][i] - value).map(Math.abs)));
        const balance = scaledMaximum(continuousOutlet.map((value, i) =>
          feed.continuous[i] + feed.dispersed[i] - value - dispersedOutlet[i]), feedScale);
        // Job-B has solved local chemical-potential/interface stability during
        // every iteration. Independently admit the converged bulk state using
        // the pinned flash once per FV cell, with liquid holdup inventory
        // rather than a throughput surrogate.
        try {
          for (let j = 0; j < cells; j += 1) {
            const xD = normalize(dIn[j].map((value, i) => .5 * (value + dOut[j][i])));
            const localCtC = continuousPhase.densityKgM3 / (xc[j]
              .reduce((sum, fraction, i) => sum + fraction * MW[i], 0) / 1000);
            const localCtD = dispersedPhase.densityKgM3 / (xD
              .reduce((sum, fraction, i) => sum + fraction * MW[i], 0) / 1000);
            const inventory = xc[j].map((fraction, i) =>
              (1 - hydraulics.operatingHoldup) * area * dz * localCtC * fraction
              + hydraulics.operatingHoldup * area * dz * localCtD * xD[i]);
            if (controls.cancelled() || Date.now() > controls.deadlineMs) {
              throw new Error(controls.cancelled()
                ? 'STAGE4_FINITE_RATE_SOLVER_CANCELLED'
                : 'GLOBAL_STAGE4_WALL_CLOCK_BUDGET_EXHAUSTED');
            }
            validateLocalFlash(await flashEvaluator({
              temperatureK: basis.temperatureK, componentMolarInventory: inventory,
              componentOrder: [...JOB_A_COMPONENT_ORDER],
            }, remainingOperationMs()), feed.continuousIsExtract);
            flashCalls += 1;
          }
        } catch (error) {
          return { converged: false, reason: error instanceof Error ? error.message : 'FINAL_LOCAL_LLE_QUALIFICATION_FAILED',
            iterations: iteration + 1, localFlashCalls: flashCalls, continuousOutlet: [], dispersedOutlet: [], transfer,
            maxScaledUpdateResidual: update, maxScaledConstitutiveResidual: constitutive,
            maxScaledComponentBalanceResidual: balance, maxAxialResidualMolS: axial,
            maxDiffusiveFrameResidualMolS: latestFrame,
            maxFilmEqualityResidualMolS: latestFilmEquality,
            maxStefanIdentityResidualMolS: latestStefanIdentity };
        }
        return { converged: constitutive <= 1e-5 && balance <= 1e-10,
          reason: constitutive <= 1e-5 && balance <= 1e-10 ? null
            : `FINAL_SCALED_RESIDUAL_GATE_FAILED:${constitutive}:${balance}`,
          iterations: iteration + 1, localFlashCalls: flashCalls, continuousOutlet, dispersedOutlet, transfer,
          maxScaledUpdateResidual: update, maxScaledConstitutiveResidual: constitutive,
          maxScaledComponentBalanceResidual: balance, maxAxialResidualMolS: axial,
          maxDiffusiveFrameResidualMolS: latestFrame,
          maxFilmEqualityResidualMolS: latestFilmEquality,
          maxStefanIdentityResidualMolS: latestStefanIdentity };
      }
      transfer = next;
    }
    return { converged: false, reason: 'COUNTERCURRENT_NONLINEAR_ITERATION_LIMIT', iterations: maxIterations,
      localFlashCalls: flashCalls, continuousOutlet: [], dispersedOutlet: [], transfer,
      maxScaledUpdateResidual: null, maxScaledConstitutiveResidual: null,
      maxScaledComponentBalanceResidual: null, maxAxialResidualMolS: null,
      maxDiffusiveFrameResidualMolS: null, maxFilmEqualityResidualMolS: null,
      maxStefanIdentityResidualMolS: null };
  };

  // N is physical hardware. The finite-volume resolution below is deliberately
  // independent (2 then 4 axial cells per physical compartment).
  let lowerCountUnresolved = false;
  for (let count = input.calculatedNt; count <= max; count += 1) {
    result.attemptedPhysicalCompartments.push(count);
    controls.progress?.({ caseCoefficient: c, physicalCompartments: count,
      finiteVolumeCellsPerPhysicalCompartment: 2, state: 'STARTED', localFlashCalls: 0, reason: null });
    const coarse = await solveMesh(count, 2);
    controls.progress?.({ caseCoefficient: c, physicalCompartments: count,
      finiteVolumeCellsPerPhysicalCompartment: 2,
      state: coarse.converged ? 'CONVERGED' : 'NUMERICAL_FAILURE',
      localFlashCalls: coarse.localFlashCalls, reason: coarse.reason });
    controls.progress?.({ caseCoefficient: c, physicalCompartments: count,
      finiteVolumeCellsPerPhysicalCompartment: 4, state: 'STARTED', localFlashCalls: 0, reason: null });
    const refined = await solveMesh(count, 4);
    controls.progress?.({ caseCoefficient: c, physicalCompartments: count,
      finiteVolumeCellsPerPhysicalCompartment: 4,
      state: refined.converged ? 'CONVERGED' : 'NUMERICAL_FAILURE',
      localFlashCalls: refined.localFlashCalls, reason: refined.reason });
    if (!coarse.converged || !refined.converged) {
      result.nonconvergedPhysicalCounts.push(count);
      result.physicalCountOutcomes.push({ physicalCompartments: count,
        status: 'NUMERICAL_UNRESOLVED', reason: `COARSE:${coarse.reason};REFINED:${refined.reason}` });
      lowerCountUnresolved = true;
      result.lastConservedPhysicalTrial = {
        physicalCompartments: count, status: 'NUMERICAL_FAILURE',
        coarse: { reason: coarse.reason, iterations: coarse.iterations, localFlashCalls: coarse.localFlashCalls },
        refined: { reason: refined.reason, iterations: refined.iterations, localFlashCalls: refined.localFlashCalls },
      };
      // No higher count can establish a minimum while this count is unknown.
      // Preserve the evidence and leave time for the other coefficient case.
      break;
    }
    const meshDifference = scaledMaximum(refined.continuousOutlet.map((value, i) =>
      value - coarse.continuousOutlet[i]).concat(refined.dispersedOutlet.map((value, i) =>
      value - coarse.dispersedOutlet[i])), feed.continuous.map((value, i) =>
      Math.max(value + feed.dispersed[i], 1e-12)));
    const cf = refined.continuousOutlet;
    const df = refined.dispersedOutlet;
    const oilOutlet = feed.continuousIsExtract ? df : cf;
    if (oilOutlet.some(value => !finite(value) || value < 0)) {
      result.nonconvergedPhysicalCounts.push(count);
      result.physicalCountOutcomes.push({ physicalCompartments: count,
        status: 'NUMERICAL_UNRESOLVED', reason: 'FINAL_OIL_OUTLET_NONNEGATIVE_GATE_FAILED' });
      lowerCountUnresolved = true;
      break;
    }
    const duty = evaluateStage4ProductTargets(oilOutlet,
      feed.continuousIsExtract ? feed.dispersed : feed.continuous, input.stage1Targets);
    const coarseOilOutlet = feed.continuousIsExtract ? coarse.dispersedOutlet : coarse.continuousOutlet;
    const coarseDuty = evaluateStage4ProductTargets(coarseOilOutlet,
      feed.continuousIsExtract ? feed.dispersed : feed.continuous, input.stage1Targets);
    const targetStatusChanged = coarseDuty.metrics.some((metric, index) =>
      metric.status !== duty.metrics[index].status);
    if (meshDifference > .01 || targetStatusChanged) {
      result.nonconvergedPhysicalCounts.push(count);
      result.physicalCountOutcomes.push({ physicalCompartments: count,
        status: 'NUMERICAL_UNRESOLVED', reason: targetStatusChanged
          ? 'FV_REFINEMENT_CHANGED_TARGET_STATUS' : 'FV_REFINEMENT_OUTLET_DIFFERENCE_EXCEEDS_1_PCT' });
      lowerCountUnresolved = true;
      result.lastConservedPhysicalTrial = { physicalCompartments: count, status: 'FV_REFINEMENT_NOT_CONVERGED',
        relativeOutletDifference: meshDifference, targetStatusChanged, coarse, refined };
      break;
    }
    const mixResidual = refined.maxAxialResidualMolS ?? 1;
    const balance = refined.maxScaledComponentBalanceResidual ?? 1;
    if (mixResidual > 1e-10 || balance > 1e-10
      || (refined.maxDiffusiveFrameResidualMolS ?? 1) > 1e-9
      || (refined.maxFilmEqualityResidualMolS ?? 1) > 1e-9
      || (refined.maxStefanIdentityResidualMolS ?? 1) > 1e-9) {
      result.nonconvergedPhysicalCounts.push(count);
      result.physicalCountOutcomes.push({ physicalCompartments: count,
        status: 'NUMERICAL_UNRESOLVED', reason: 'FINAL_CONSERVATION_OR_FRAME_RESIDUAL_GATE_FAILED' });
      lowerCountUnresolved = true;
      break;
    }
    result.lastConservedPhysicalTrial = {
      physicalCompartments: count, activeHeightM: count * pitch,
      overallEfficiency: input.calculatedNt / count,
      targetCompliance: duty,
      maximumScaledGlobalComponentBalanceResidual: balance,
      continuousAxialDispersionConservationResidualMolS: mixResidual,
      scaledConstitutiveResidual: refined.maxScaledConstitutiveResidual,
      finiteVolumeRefinementRelativeOutletDifference: meshDifference,
    };
    result.physicalCountOutcomes.push({ physicalCompartments: count,
      status: duty.allEvaluatedTargetsPassed ? 'TARGET_PASS' : 'TARGET_FAIL',
      reason: duty.allEvaluatedTargetsPassed ? null : 'GOVERNED_PRODUCT_TARGETS_NOT_MET' });
    if (duty.allEvaluatedTargetsPassed && !result.selected && !lowerCountUnresolved) {
      result.selected = {
        physicalCompartments: count, activeHeightM: count * pitch,
        overallEfficiency: input.calculatedNt / count,
        continuousColumnPeclet: count * pitch
          * hydraulics.continuousSuperficialVelocityMS / dispersion.valueM2S,
        continuousOutletMolarFlowMolS: cf, dispersedOutletMolarFlowMolS: df,
        oilRaffinateOutletMolarFlowMolS: oilOutlet, targetCompliance: duty,
        maximumScaledGlobalComponentBalanceResidual: balance,
        continuousAxialDispersionConservationResidualMolS: mixResidual,
        scaledConstitutiveResidual: refined.maxScaledConstitutiveResidual,
        continuousPhaseTotalMolarFlowChangeMolS: cf.reduce((sum, value) => sum + value, 0)
          - feed.continuous.reduce((sum, value) => sum + value, 0),
        dispersedPhaseTotalMolarFlowChangeMolS: df.reduce((sum, value) => sum + value, 0)
          - feed.dispersed.reduce((sum, value) => sum + value, 0),
        molarAverageDiffusiveFrameResidualMolS: refined.maxDiffusiveFrameResidualMolS,
        maximumFilmEqualityResidualMolS: refined.maxFilmEqualityResidualMolS,
        stefanTotalFluxIdentityResidualMolS: refined.maxStefanIdentityResidualMolS,
        finiteVolumeRefinementRelativeOutletDifference: meshDifference,
        axialDispersion: {
          EcM2S: dispersion.valueM2S, EdM2S: 0, continuousOnly: true,
          discretization: 'implicit cell-centred finite volume; Danckwerts inlet total component flux Qc*xFeed; zero diffusive outlet face',
        },
        localThermodynamics: 'Job-B evaluates pinned 7C chemical potentials and interface stability at each local nonlinear state; the independently pinned bulk 7C flash is freshly admitted at every converged FV-cell state.',
        concentrationConvention: 'Diagonal generalized-Fick two-film screening; total component transfer includes non-equimolar Stefan/convective contribution while the molar-average diffusive residual is zero.',
      };
      break;
    }
  }
  result.searchTermination = result.selected
    ? 'FIRST_CERTIFIABLE_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT'
    : result.nonconvergedPhysicalCounts.length
      ? 'TARGET_COMPLIANCE_UNKNOWN_NUMERICAL_PHYSICAL_COUNTS_REMAIN'
      : 'NO_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT_WITHIN_EXPLICIT_SEARCH_BOUND';
  return result;
}

export async function runStage4PredictivePhysicalSizing(input: Stage4PhysicalSizingInput,
  options?: {
    flashEvaluator?: FlashEvaluator;
    interfaceEvaluator?: InterfaceEvaluator;
    timeoutMs?: number;
    /** Bounded whole-solve budget; every mesh/count reports a numerical
     * failure rather than allowing child timeouts to become unbounded work. */
    wallClockBudgetMs?: number;
    abortSignal?: AbortSignal;
    onNumericalProgress?: (progress: Stage4PhysicalSizingProgress) => void;
    onProgress?: (progress: {
      phase: 'PRIMARY_RUNNING' | 'PRIMARY_COMPLETE' | 'SENSITIVITY_RUNNING' | 'SENSITIVITY_COMPLETE';
      completedCases: 0 | 1 | 2;
      totalCases: 2;
    }) => void | Promise<void>;
  }) {
  if (!Number.isInteger(input.calculatedNt) || input.calculatedNt < 1) {
    throw new Error('STAGE4_VALID_CALCULATED_STAGE2_NT_REQUIRED_NO_DEFAULT_APPLIED');
  }
  const wallClockBudgetMs = options?.wallClockBudgetMs ?? 900_000;
  if (!Number.isFinite(wallClockBudgetMs) || wallClockBudgetMs <= 0 || wallClockBudgetMs > 1_800_000) {
    throw new Error('STAGE4_WALL_CLOCK_BUDGET_INVALID');
  }
  const controls = {
    deadlineMs: Date.now() + wallClockBudgetMs,
    operationTimeoutMs: options?.timeoutMs ?? 120_000,
    cancelled: () => options?.abortSignal?.aborted === true,
    progress: options?.onNumericalProgress,
  };
  const session = options?.flashEvaluator ? null : createSevenComponentLocalEquilibriumSession({
    timeoutMs: options?.timeoutMs ?? 120_000,
  });
  const interfaceSession = options?.interfaceEvaluator ? null
    : createSevenComponentTwoFilmInterfaceSession({ timeoutMs: options?.timeoutMs ?? 120_000 });
  const closeSessions = () => {
    session?.close();
    interfaceSession?.close();
  };
  let rejectInterrupted!: (reason: Error) => void;
  const interrupted = new Promise<never>((_resolve, reject) => { rejectInterrupted = reject; });
  // The watchdog is active between requests too; keep its rejection handled
  // even when no evaluation is currently awaiting it.
  void interrupted.catch(() => undefined);
  const abort = () => {
    rejectInterrupted(new Error('STAGE4_FINITE_RATE_SOLVER_CANCELLED'));
    closeSessions();
  };
  const deadlineTimer = setTimeout(() => {
    rejectInterrupted(new Error('GLOBAL_STAGE4_WALL_CLOCK_BUDGET_EXHAUSTED'));
    closeSessions();
  }, Math.max(1, controls.deadlineMs - Date.now()));
  options?.abortSignal?.addEventListener('abort', abort, { once: true });
  if (options?.abortSignal?.aborted) abort();
  const underlyingFlash: FlashEvaluator = options?.flashEvaluator ?? (request =>
    session!.evaluate(request) as Promise<Flash>);
  const underlyingInterface: InterfaceEvaluator = options?.interfaceEvaluator ?? (request =>
    interfaceSession!.solve(request));
  const rawEvaluator: FlashEvaluator = (request, timeout) =>
    Promise.race([underlyingFlash(request, timeout), interrupted]);
  const interfaceEvaluator: InterfaceEvaluator = (request, timeout) =>
    Promise.race([underlyingInterface(request, timeout), interrupted]);
  // Both K&H cases share one serial persistent pinned engine. This avoids a
  // process-per-cell import without widening the immutable adapter contract.
  const flashes = new Map<string, Promise<Flash>>();
  const evaluator: FlashEvaluator = (request, timeout) => {
    const key = JSON.stringify(request);
    const cached = flashes.get(key);
    if (cached) return cached;
    // This cache deduplicates only simultaneous requests. Settled local
    // states are removed, so changing countercurrent states cannot be
    // accidentally reused and memory is bounded even in a long count sweep.
    if (flashes.size >= 256) flashes.clear();
    const pending = rawEvaluator(request, timeout);
    flashes.set(key, pending);
    void pending.then(
      () => { if (flashes.get(key) === pending) flashes.delete(key); },
      () => { if (flashes.get(key) === pending) flashes.delete(key); },
    );
    return pending;
  };
  let primary: Awaited<ReturnType<typeof solveCase>>;
  let sensitivity: Awaited<ReturnType<typeof solveCase>>;
  try {
    await options?.onProgress?.({ phase: 'PRIMARY_RUNNING', completedCases: 0, totalCases: 2 });
    primary = await solveCase(input, .0126, evaluator, interfaceEvaluator, controls);
    await options?.onProgress?.({ phase: 'PRIMARY_COMPLETE', completedCases: 1, totalCases: 2 });
    await options?.onProgress?.({ phase: 'SENSITIVITY_RUNNING', completedCases: 1, totalCases: 2 });
    sensitivity = await solveCase(input, .0105, evaluator, interfaceEvaluator, controls);
    await options?.onProgress?.({ phase: 'SENSITIVITY_COMPLETE', completedCases: 2, totalCases: 2 });
  } finally {
    clearTimeout(deadlineTimer);
    options?.abortSignal?.removeEventListener('abort', abort);
    closeSessions();
  }
  const p = primary.selected, s = sensitivity.selected;
  const comparable = !!p && !!s;
  const heightRelativeDifference = comparable
    ? Math.abs(p.activeHeightM - s.activeHeightM) / Math.max(p.activeHeightM, s.activeHeightM) : null;
  const efficiencyRelativeDifference = comparable
    ? Math.abs(p.overallEfficiency - s.overallEfficiency) / Math.max(p.overallEfficiency, s.overallEfficiency) : null;
  const robust = comparable && p.physicalCompartments === s.physicalCompartments
    && heightRelativeDifference! <= .05 && efficiencyRelativeDifference! <= .05;
  const unresolved = primary.nonconvergedPhysicalCounts.length > 0
    || sensitivity.nonconvergedPhysicalCounts.length > 0;
  return {
    status: comparable ? 'CALCULATED_FINITE_RATE_SCREENING'
      : unresolved ? 'NUMERICAL_FAILURE_UNRESOLVED_PHYSICAL_COUNTS_REMAIN'
        : 'TARGET_FAILURE_NO_TARGET_COMPLIANT_COUNT_WITHIN_BOUND',
    classification: 'PRE-PILOT PREDICTIVE / SCREENING — REQUIRES PILOT VALIDATION BEFORE FINAL DESIGN',
    screeningNotice: 'PRE-PILOT PREDICTIVE / SCREENING — REQUIRES PILOT VALIDATION BEFORE FINAL DESIGN',
    implementation: {
      version: STAGE4_PREDICTIVE_PHYSICAL_SIZING_VERSION,
      implementationHash: STAGE4_PREDICTIVE_PHYSICAL_SIZING_HASH,
    },
    primary, sensitivity,
    materiality: {
      threshold: 'same integer physical compartments and <=5% relative active-height and overall-efficiency difference',
      comparable, heightRelativeDifference, efficiencyRelativeDifference,
      robustToKhCoefficientSensitivity: robust,
      classification: robust ? 'ROBUST_WITHIN_DISCLOSED_SCREENING_THRESHOLD'
        : 'NOT_ROBUST_OR_NOT_COMPARABLE',
      note: 'Ec proximity alone is not a robustness criterion.',
    },
    assumptions: [
      'Each K&H case searches upward from accepted Stage-2 Nt and stops at the first certifiable conserved, mesh-qualified target pass or the first numerically unresolved count. An unresolved lower count prevents any higher count from establishing a minimum; remaining budget is reserved for the other coefficient case.',
      'Overall efficiency is calculated after the search as Stage-2 accepted Nt/Nphysical; it is never an input.',
      'Job-B evaluates pinned seven-component chemical potentials/interface stability from each current local countercurrent state. The independently pinned bulk-equilibrium adapter re-evaluates the converged holdup-weighted inventory in every FV cell; no inlet equilibrium partition is retained as a column closure.',
      'This is a finite-rate diagonal generalized-Fick screening closure in a molar-average frame, not a full Maxwell–Stefan model. The zero-sum diffusive frame residual does not erase non-equimolar Stefan/convective phase transfer.',
      'Job A two-film coefficients use frozen Stage-3 hydraulic state and phase-average feed compositions; composition-dependent transport and axial variation require pilot validation.',
      'Ec uses the authorized screening expression; Ed=0. Two and four finite-volume cells per physical compartment are independently solved; mesh and nonlinear iteration counts are never physical compartment count.',
    ],
  };
}