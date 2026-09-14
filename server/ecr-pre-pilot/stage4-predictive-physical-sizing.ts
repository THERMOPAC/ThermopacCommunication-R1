import { createHash } from 'node:crypto';
import {
  evaluateJobA,
  JOB_A_COMPONENT_ORDER,
  JOB_A_IMPLEMENTATION_SHA256,
} from './job-a';
import {
  evaluateSevenComponentLocalEquilibrium,
  STAGE4_SEVEN_COMPONENT_ADAPTER_VERSION,
} from './stage4-seven-component-adapter';
import { calculateKumarHartlandEcDetails } from './stage4-mixing-audit';

/**
 * A deliberately small, rate-based Stage-4 calculation.  It is not a
 * replacement for Stage 2: it uses the Stage-2 accepted N_T only as the
 * reference against which the independently searched physical count is
 * reported.  No Stage-2 outlet is used as a physical-column outlet or target.
 */
export const STAGE4_PREDICTIVE_PHYSICAL_SIZING_VERSION =
  'ECR_STAGE4_PREDICTIVE_PHYSICAL_SIZING_V1' as const;
export const STAGE4_PREDICTIVE_PHYSICAL_SIZING_HASH = createHash('sha256').update([
  STAGE4_PREDICTIVE_PHYSICAL_SIZING_VERSION,
  'seven-component-local-equilibrium-secants',
  'job-a-two-film-coefficients',
  'conserved-counter-current-finite-volume-axial-dispersion',
  'kh-screening-ec-ed-zero-c0126-c0105',
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
const maximum = (values: number[]) => Math.max(...values.map(Math.abs));

/** Thomas solve for the implicit finite-volume continuous-phase equations. */
function solveTridiagonal(lower: number[], diagonal: number[], upper: number[], rhs: number[]) {
  const n = rhs.length;
  const d = [...diagonal], b = [...rhs], u = [...upper], l = [...lower];
  for (let row = 1; row < n; row += 1) {
    const factor = l[row] / d[row - 1];
    d[row] -= factor * u[row - 1];
    b[row] -= factor * b[row - 1];
  }
  const x = Array(n).fill(0);
  x[n - 1] = b[n - 1] / d[n - 1];
  for (let row = n - 2; row >= 0; row -= 1) x[row] = (b[row] - u[row] * x[row + 1]) / d[row];
  if (x.some(value => !finite(value))) throw new Error('STAGE4_IMPLICIT_AXIAL_DISPERSION_SOLVE_FAILED');
  return x;
}

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
}) => Promise<Flash>;

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

async function solveCase(input: Stage4PhysicalSizingInput, c: 0.0126 | 0.0105,
  flashEvaluator: FlashEvaluator) {
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
  const flash = await flashEvaluator({
    temperatureK: basis.temperatureK, componentMolarInventory: total,
    componentOrder: [...JOB_A_COMPONENT_ORDER],
  });
  if (flash.status !== 'CALCULATED' || flash.phaseOrientation !== 'NMP_RICH_EXTRACT'
    || !Array.isArray(flash.raffinateComposition) || !Array.isArray(flash.extractComposition)
    || flash.raffinateComposition.length !== 7 || flash.extractComposition.length !== 7) {
    throw new Error(`STAGE4_PINNED_7C_LOCAL_EQUILIBRIUM_UNAVAILABLE:${flash.status}`);
  }
  const eqC = feed.continuousIsExtract ? flash.extractComposition : flash.raffinateComposition;
  const eqD = feed.continuousIsExtract ? flash.raffinateComposition : flash.extractComposition;
  // The equilibrium secant is defined consistently as xC* = m xD*.
  // That convention makes the two-film driving force xC - m xD.
  const m = eqC.map((value, i) => value / eqD[i]);
  if (![...eqC, ...eqD, ...m].every(positive)) throw new Error('STAGE4_EQUILIBRIUM_SECANT_INVALID');
  const localComposition = normalize(feed.continuous);
  const jobA = evaluateJobA({
    stage1SnapshotHash: input.stage1SnapshotHash, theoreticalStages: input.calculatedNt,
    theoreticalStageProvenance: 'STAGE_2_CALCULATED_NT', stage2JobId: input.stage2JobId,
    stage2ResultHash: input.stage2ResultHash, stage2EngineHash: input.stage2EngineHash,
    // The validated adapter response is the runtime integrity evidence used
    // here.  This field is an immutable adapter binding, not a second worker
    // launch merely to obtain a redundant preflight response.
    thermodynamicAdapterPreflightHash: typeof flash.resultHash === 'string'
      ? flash.resultHash : hash(`PINNED_7C_ADAPTER:${STAGE4_SEVEN_COMPONENT_ADAPTER_VERSION}`),
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
  // xC*=m xD*.  Eliminating the interface compositions from
  // kc Cc(xC-xC*)=kd Cd(xD*-xD) gives
  // N=Kc Cc(xC-m xD), with 1/Kc=1/kc+m Cc/(kd Cd).
  const Kc = kc.map((value, i) => calculateTwoFilmContinuousFlux({
    kcMPerS: value, kdMPerS: kd[i], continuousTotalConcentrationMolM3: cTot,
    dispersedTotalConcentrationMolM3: dTot, partitionXCOverXD: m[i],
    continuousMoleFraction: 0, dispersedMoleFraction: 0,
  }).kocMPerS);
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
    equilibrium: { adapterResultHash: flash.resultHash ?? null,
      continuousEquilibriumComposition: eqC, dispersedEquilibriumComposition: eqD, secantM: m },
    jobA: { implementationSha256: JOB_A_IMPLEMENTATION_SHA256, resultSha256: jobA.resultSha256 },
    twoFilm: {
      continuousOverallCoefficientKocMPerS: Kc,
      continuousFilmCoefficientKcMPerS: kc,
      dispersedFilmCoefficientKdMPerS: kd,
      concentrationConvention: 'Koc is continuous-phase coefficient in N_i=Koc_i*Ctot,c*(xC_i-m_i*xD_i); Ctot=phase density / phase-average molecular weight.',
      partitionConvention: 'm_i=xC_i,eq/xD_i,eq; equilibrium driving force is xC_i-m_i*xD_i.',
      orientation: feed.continuousIsExtract
        ? 'continuous=NMP-rich extract; dispersed=raffinate'
        : 'continuous=raffinate; dispersed=NMP-rich extract',
    },
    selected: null as any, attemptedPhysicalCompartments: [] as number[],
    maximumPhysicalCompartmentsSearched: max,
    nonconvergedPhysicalCounts: [] as number[],
    lastConservedPhysicalTrial: null as any,
    searchTermination: null as string | null,
  };
  // A physical compartment cannot represent more than one accepted
  // theoretical stage in this reported overall-efficiency convention.
  // Starting below Nt could produce eta>1, which is a physical-consistency
  // failure rather than an attractive smaller design.
  for (let count = input.calculatedNt; count <= max; count += 1) {
    result.attemptedPhysicalCompartments.push(count);
    let transfer = Array.from({ length: count }, () => Array(7).fill(0));
    let converged = false;
    let finalContinuous: number[][] = [];
    const qContinuous = feed.continuous.reduce((sum, value) => sum + value, 0);
    const faceConductance = dispersion.valueM2S * area * cTot / pitch;
    for (let iteration = 0; iteration < 2_000; iteration += 1) {
      // These equations are solved implicitly, component-by-component, on
      // one shared set of faces.  At the inlet the total component flux is
      // Qc*xFeed (Danckwerts); at the outlet the diffusive face flux is zero.
      const xc = Array.from({ length: count }, () => Array(7).fill(0));
      try {
        for (let component = 0; component < 7; component += 1) {
          if (count === 1) {
            xc[0][component] = (qContinuous * normalize(feed.continuous)[component]
              - transfer[0][component]) / qContinuous;
            continue;
          }
          const lower = Array(count).fill(0);
          const diagonal = Array(count).fill(qContinuous + 2 * faceConductance);
          const upper = Array(count).fill(-faceConductance);
          const rhs = Array(count).fill(0);
          diagonal[0] = qContinuous + faceConductance;
          rhs[0] = qContinuous * normalize(feed.continuous)[component] - transfer[0][component];
          for (let j = 1; j < count - 1; j += 1) {
            lower[j] = -(qContinuous + faceConductance);
            rhs[j] = -transfer[j][component];
          }
          // Last cell: zero diffusive flux at the outlet face.
          lower[count - 1] = -(qContinuous + faceConductance);
          diagonal[count - 1] = qContinuous + faceConductance;
          rhs[count - 1] = -transfer[count - 1][component];
          const solved = solveTridiagonal(lower, diagonal, upper, rhs);
          solved.forEach((value, j) => { xc[j][component] = value; });
        }
      } catch {
        break;
      }
      const xd = Array.from({ length: count }, () => Array(7).fill(0));
      let dispersed = [...feed.dispersed];
      for (let j = count - 1; j >= 0; j -= 1) {
        xd[j] = dispersed.map((value, i) => value + .5 * transfer[j][i]);
        dispersed = dispersed.map((value, i) => value + transfer[j][i]);
      }
      if ([...xc.flat(), ...xd.flat()].some(value => !finite(value) || value < -1e-12)) break;
      const proposedTransfer = xc.map((continuous, j) => {
        const xContinuous = normalize(continuous);
        const xDispersed = normalize(xd[j]);
        const raw = Kc.map((_coefficient, i) => a * area * pitch
          * calculateTwoFilmContinuousFlux({
            kcMPerS: kc[i], kdMPerS: kd[i], continuousTotalConcentrationMolM3: cTot,
            dispersedTotalConcentrationMolM3: dTot, partitionXCOverXD: m[i],
            continuousMoleFraction: xContinuous[i], dispersedMoleFraction: xDispersed[i],
          }).fluxMolM2S);
        const totalRaw = raw.reduce((sum, value) => sum + value, 0);
        return raw.map((value, i) => value - xContinuous[i] * totalRaw);
      });
      const nextTransfer = transfer.map((row, j) => row.map((value, i) =>
        value + .005 * (proposedTransfer[j][i] - value)));
      const delta = maximum(nextTransfer.flatMap((row, j) => row.map((value, i) =>
        value - transfer[j][i])));
      transfer = nextTransfer;
      finalContinuous = xc;
      if (delta < 1e-10) { converged = true; break; }
    }
    if (!converged) {
      result.nonconvergedPhysicalCounts.push(count);
      continue;
    }
    const cf = finalContinuous[count - 1].map(value => qContinuous * value);
    const df = feed.dispersed.map((value, i) =>
      value + transfer.reduce((sum, row) => sum + row[i], 0));
    const oilOutlet = feed.continuousIsExtract ? df : cf;
    if (oilOutlet.some(value => !finite(value) || value < 0)) continue;
    const duty = evaluateStage4ProductTargets(oilOutlet, feed.continuousIsExtract ? feed.dispersed : feed.continuous,
      input.stage1Targets);
    const xFeed = normalize(feed.continuous);
    const axialResiduals = finalContinuous.flatMap((x, j) => x.map((value, i) => {
      const incoming = j === 0
        ? qContinuous * xFeed[i]
        : qContinuous * finalContinuous[j - 1][i]
          + faceConductance * (finalContinuous[j - 1][i] - value);
      const outgoing = j === count - 1
        ? qContinuous * value // explicit zero-gradient / zero-diffusive outlet face
        : qContinuous * value + faceConductance * (value - finalContinuous[j + 1][i]);
      return incoming - outgoing - transfer[j][i];
    }));
    const mixResidual = maximum(axialResiduals);
    const balance = maximum(cf.map((value, i) => feed.continuous[i] + feed.dispersed[i] - value - df[i]));
    if (mixResidual > 1e-8 || balance > 1e-8) continue;
    result.lastConservedPhysicalTrial = {
      physicalCompartments: count, activeHeightM: count * pitch,
      overallEfficiency: input.calculatedNt / count,
      targetCompliance: duty,
      maximumGlobalComponentBalanceResidualMolS: balance,
      continuousAxialDispersionConservationResidualMolS: mixResidual,
    };
    if (duty.allEvaluatedTargetsPassed) {
      result.selected = {
        physicalCompartments: count, activeHeightM: count * pitch,
        overallEfficiency: input.calculatedNt / count,
        continuousColumnPeclet: count * pitch
          * hydraulics.continuousSuperficialVelocityMS / dispersion.valueM2S,
        continuousOutletMolarFlowMolS: cf, dispersedOutletMolarFlowMolS: df,
        oilRaffinateOutletMolarFlowMolS: oilOutlet, targetCompliance: duty,
        maximumGlobalComponentBalanceResidualMolS: balance,
        continuousAxialDispersionConservationResidualMolS: mixResidual,
        axialDispersion: {
          EcM2S: dispersion.valueM2S, EdM2S: 0, continuousOnly: true,
          discretization: 'implicit cell-centred finite volume; Danckwerts inlet total component flux Qc*xFeed; zero diffusive outlet face',
        },
        continuousOverallCoefficientKocMPerS: Kc,
        continuousTransferUnitsNoc: Kc.map(value =>
          value * a * (count * pitch) / hydraulics.continuousSuperficialVelocityMS),
        concentrationConvention: 'Noc_i=Koc_i*a*H/Vc using superficial Vc and total active-liquid interfacial area a=6φ/d32.',
      };
      result.searchTermination = 'FIRST_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT';
      return result;
    }
  }
  result.searchTermination = result.nonconvergedPhysicalCounts.length
    ? 'TARGET_COMPLIANCE_UNKNOWN_NUMERICAL_PHYSICAL_COUNTS_REMAIN'
    : 'NO_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT_WITHIN_EXPLICIT_SEARCH_BOUND';
  return result;
}

export async function runStage4PredictivePhysicalSizing(input: Stage4PhysicalSizingInput,
  options?: { flashEvaluator?: FlashEvaluator; diagnosticFrozenInletEquilibrium?: boolean }) {
  if (!Number.isInteger(input.calculatedNt) || input.calculatedNt < 1) {
    throw new Error('STAGE4_VALID_CALCULATED_STAGE2_NT_REQUIRED_NO_DEFAULT_APPLIED');
  }
  if (options?.diagnosticFrozenInletEquilibrium !== true) {
    throw new Error('STAGE4_DYNAMIC_LOCAL_7C_EQUILIBRIUM_CLOSURE_REQUIRED');
  }
  const rawEvaluator = options?.flashEvaluator ?? ((request) =>
    evaluateSevenComponentLocalEquilibrium(request, { timeoutMs: 300_000 }));
  // Both K&H cases have identical thermodynamic state.  Do not start two
  // adapter workers just because the dispersion sensitivity is evaluated in
  // parallel.
  const flashes = new Map<string, Promise<Flash>>();
  const evaluator: FlashEvaluator = request => {
    const key = JSON.stringify(request);
    const cached = flashes.get(key);
    if (cached) return cached;
    const pending = rawEvaluator(request);
    flashes.set(key, pending);
    return pending;
  };
  const [primary, sensitivity] = await Promise.all([
    solveCase(input, .0126, evaluator), solveCase(input, .0105, evaluator),
  ]);
  const p = primary.selected, s = sensitivity.selected;
  const comparable = !!p && !!s;
  const heightRelativeDifference = comparable
    ? Math.abs(p.activeHeightM - s.activeHeightM) / Math.max(p.activeHeightM, s.activeHeightM) : null;
  const efficiencyRelativeDifference = comparable
    ? Math.abs(p.overallEfficiency - s.overallEfficiency) / Math.max(p.overallEfficiency, s.overallEfficiency) : null;
  const robust = comparable && p.physicalCompartments === s.physicalCompartments
    && heightRelativeDifference! <= .05 && efficiencyRelativeDifference! <= .05;
  const primaryUnresolved = !p && primary.nonconvergedPhysicalCounts.length > 0;
  return {
    status: p ? 'DIAGNOSTIC_FROZEN_INLET_EQUILIBRIUM_NOT_PHYSICAL_SIZING'
      : primaryUnresolved ? 'DIAGNOSTIC_TARGET_COMPLIANCE_UNRESOLVED_NUMERICAL_COUNTS_REMAIN'
        : 'DIAGNOSTIC_NO_TARGET_COMPLIANT_COUNT_WITHIN_BOUND',
    classification: 'DIAGNOSTIC ONLY — FROZEN INLET EQUILIBRIUM — NOT PHYSICAL SIZING',
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
      'Diagnostic count search starts at the accepted Stage-2 theoretical-stage count and accepts the first target-compliant conserved physical solve; fixed-point iterations solve the nonlinear algebraic system and are not axial mesh refinement.',
      'Overall efficiency is calculated after the search as Stage-2 accepted Nt/Nphysical; it is never an input.',
      'The 7-component local equilibrium is a pinned adapter flash at the actual combined inlet inventory; its resulting phase-composition secants are retained during each axial solve. This is a screening closure, not a fitted Stage-2 target or an exact 2017 reproduction.',
      'This routine is diagnostic-only because a frozen inlet equilibrium cannot substitute for a dynamically updated local 7C equilibrium closure.',
      'Job A two-film coefficients use frozen Stage-3 hydraulic state and phase-average feed compositions; composition-dependent transport and axial variation require pilot validation.',
      'Ec uses the authorized screening expression; Ed=0. Numerical iteration count is integration resolution, never a physical compartment count.',
    ],
  };
}