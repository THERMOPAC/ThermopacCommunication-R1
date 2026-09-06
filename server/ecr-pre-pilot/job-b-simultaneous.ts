import { JOB_A_COMPONENT_ORDER, JOB_A_MOLECULAR_DATA, jobAResultHash } from './job-a';
import { JobBDependencyError, jobBResultHash } from './job-b';
import { loadJobBBoundaryState } from './job-b-boundary-state';
import { pool } from '../db';
import {
  solveSevenComponentTwoFilmInterface, type JobBInterfaceRequest,
} from './job-b-interface';

type RecordValue = Record<string, any>;
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** No phase volume or holdup participates in this thermodynamic request. */
export function makeJobBInterfaceRequest(jobA: RecordValue, boundary: RecordValue, phaseConfiguration: string) {
  if (jobA.resultSha256 !== jobAResultHash(jobA)
    || jobA.status !== 'JOB_A_CLOSED_FOR_PRE_PILOT_IMPLEMENTATION') {
    throw new Error('JOB_B_DEPENDENCY_BLOCKED:VALID_JOB_A_REQUIRED');
  }
  if (!['nmp-continuous-rrbo-dispersed', 'rrbo-continuous-nmp-dispersed'].includes(phaseConfiguration)) {
    throw new Error('JOB_B_DEPENDENCY_BLOCKED:EXPLICIT_PHASE_CONFIGURATION_REQUIRED');
  }
  if (boundary.provenance.engineHash !== jobA.dependencies.stage2EngineHash
    || boundary.provenance.stage1ImmutableHash !== jobA.dependencies.stage1SnapshotHash
    || boundary.temperatureK !== jobA.input.temperatureK) {
    throw new Error('JOB_B_DEPENDENCY_BLOCKED:STAGE2_BOUNDARY_LINEAGE_MISMATCH');
  }
  const nmpContinuous = phaseConfiguration === 'nmp-continuous-rrbo-dispersed';
  const continuous = nmpContinuous ? boundary.extractIncoming : boundary.raffinateIncoming;
  const dispersed = nmpContinuous ? boundary.raffinateIncoming : boundary.extractIncoming;
  const xC = [...continuous.stream.moleFractions];
  const xD = [...dispersed.stream.moleFractions];
  const coefficients = (phase: string) => JOB_A_COMPONENT_ORDER.map(componentId => {
    const cells = jobA.cells.filter((c: RecordValue) => c.componentId === componentId && c.phase === phase);
    if (cells.length !== 1 || !positive(cells[0].filmCoefficientMS)) {
      throw new Error(`JOB_B_DEPENDENCY_BLOCKED:INVALID_JOB_A_FILM:${phase}:${componentId}`);
    }
    return cells[0].filmCoefficientMS as number;
  });
  const totalConcentration = (x: number[], density: number) => {
    if (x.length !== 7 || x.some(v => !Number.isFinite(v) || v < 0)
      || Math.abs(x.reduce((a, b) => a + b, 0) - 1) > 1e-10 || !positive(density)) {
      throw new Error('JOB_B_DEPENDENCY_BLOCKED:INVALID_BOUNDARY_CONCENTRATION');
    }
    const mw = x.reduce((sum, value, i) =>
      sum + value * JOB_A_MOLECULAR_DATA[JOB_A_COMPONENT_ORDER[i]].molecularWeightGmol / 1000, 0);
    return density / mw;
  };
  const request: JobBInterfaceRequest = {
    componentOrder: [...JOB_A_COMPONENT_ORDER],
    T: boundary.temperatureK,
    x_bulk_continuous: xC,
    x_bulk_dispersed: xD,
    kc: coefficients('continuous'),
    kd: coefficients('dispersed'),
    CtC: totalConcentration(xC, jobA.input.continuous.densityKgM3),
    CtD: totalConcentration(xD, jobA.input.dispersed.densityKgM3),
    phase_config: phaseConfiguration as JobBInterfaceRequest['phase_config'],
  };
  return { request, continuous, dispersed };
}

export async function evaluateJobBSimultaneous(
  userId: number, designId: number, jobA: RecordValue,
  operatingHoldup: number, phaseConfiguration: string,
) {
  if (!positive(operatingHoldup) || operatingHoldup >= 1 || !positive(jobA.localHydraulics.d32M)) {
    throw new Error('JOB_B_DEPENDENCY_BLOCKED:INVALID_FROZEN_STAGE3_HYDRAULICS');
  }
  // Job A has just verified the pinned adapter and base-runtime hashes.
  const boundary = await loadJobBBoundaryState(userId, designId, jobA.dependencies.theoreticalStages, {
    query: pool.query.bind(pool),
    currentEngineHash: () => jobA.dependencies.stage2EngineHash,
  });
  const { request, continuous, dispersed } = makeJobBInterfaceRequest(jobA, boundary, phaseConfiguration);
  const inputAudit = {
    componentOrder: [...JOB_A_COMPONENT_ORDER],
    x_bulk_continuous: request.x_bulk_continuous,
    x_bulk_dispersed: request.x_bulk_dispersed,
    bulkContinuousProvenance: continuous,
    bulkDispersedProvenance: dispersed,
    stage2Provenance: boundary.provenance,
    sourceStageCount: boundary.sourceStageCount,
    requestedNT: boundary.requestedNT,
    phi_d_operating: operatingHoldup,
    d32_m: jobA.localHydraulics.d32M,
    kc: request.kc, kd: request.kd,
    jobAResultSha256: jobA.resultSha256,
    stage3RunId: jobA.dependencies.stage3RunId,
    stage3ImmutableHash: jobA.dependencies.stage3ImmutableHash,
    selectedStage3TrialId: jobA.dependencies.selectedTrialId,
    exactInterfaceEquilibriumRequest: request,
    holdupDefinesThermodynamicComposition: false,
    concentrationClosure: 'PRELIMINARY_FIXED_BULK_DENSITY_OVER_PHASE_AVERAGE_MW',
    sourceQualification: 'RECORDED_STAGE2_INCOMING_BOUNDARIES_NOT_REJECTED_OUTLET_LLE',
  };
  let response: RecordValue;
  try {
    response = await solveSevenComponentTwoFilmInterface(request, { timeoutMs: 300_000 });
  } catch (error: any) {
    throw new JobBDependencyError('JOB_B_DEPENDENCY_BLOCKED:INTERFACE_RUNTIME_FAILED', {
      inputAudit, adapterStatus: 'RUNTIME_FAILED', error: error.message, fluxMetricsReturned: false,
    });
  }
  if (response.status !== 'CALCULATED_PRELIMINARY_INTERFACE'
    || response.engineHash !== jobA.dependencies.stage2EngineHash || !response.interface) {
    throw new JobBDependencyError('JOB_B_DEPENDENCY_BLOCKED:SIMULTANEOUS_INTERFACE_NOT_ACCEPTED', {
      inputAudit, adapterStatus: response.status, interfaceDiagnostics: response,
      fluxMetricsReturned: false,
    });
  }
  const area = 6 * operatingHoldup / jobA.localHydraulics.d32M;
  const interfacial = response.interface;
  const rows = JOB_A_COMPONENT_ORDER.map((componentId, i) => {
    const nc = interfacial.continuousComponentFluxMolM2S[i];
    const nd = interfacial.dispersedComponentFluxMolM2S[i];
    const flux = (nc + nd) / 2;
    if (![nc, nd, area * nc, area * nd].every(Number.isFinite)) {
      throw new Error('JOB_B_NUMERICAL_VALIDITY_BLOCKED:NONFINITE_INTERFACE_FLUX');
    }
    return {
      componentId, kcMS: request.kc[i], kdMS: request.kd[i],
      interfaceContinuousMoleFraction: interfacial.continuousMoleFractions[i],
      interfaceDispersedMoleFraction: interfacial.dispersedMoleFractions[i],
      fluxMolM2S: flux, volumetricTransferMolM3S: area * flux,
      continuousPhaseSourceMolM3S: -area * nc,
      dispersedPhaseSourceMolM3S: area * nd,
      continuousFilmResidualMolM2S: flux - nc,
      dispersedFilmResidualMolM2S: flux - nd,
      phaseConservationResidualMolM3S: area * (nd - nc),
    };
  });
  const body = {
    status: 'PRE_PILOT_SIMULTANEOUS_TWO_FILM_FLUX_CALCULATED',
    componentOrder: [...JOB_A_COMPONENT_ORDER], inputAudit, rows,
    dependencies: { ...jobA.dependencies, jobAResultSha256: jobA.resultSha256,
      stage2BoundaryResultSha256: boundary.provenance.resultSnapshotHash },
    theoreticalStageAuthority: { theoreticalStages: boundary.requestedNT,
      provenance: jobA.dependencies.theoreticalStageProvenance },
    implementationSha256: response.jobBInterfaceArtifactSha256,
    equilibriumAuthority: { engineId: response.engineId, engineVersion: response.engineVersion,
      engineHash: response.engineHash, resultHash: response.resultHash, operation: 'SOLVE_INTERFACE' },
    frozenLocalHydraulics: { operatingHoldup, d32M: jobA.localHydraulics.d32M,
      interfacialAreaM2M3: area, holdupAreaFactorCount: 1, hydrodynamicsRecomputed: false },
    interfaceResult: response,
    signConvention: 'POSITIVE_CONTINUOUS_TO_DISPERSED',
    qualification: response.closure,
    releaseEligible: false,
    excluded: { compartmentCountCalculated: false, heightCalculated: false,
      efficiencyCalculated: false, finalRpmSelected: false, globalPartitionCoefficientUsed: false },
  };
  return { ...body, resultSha256: jobBResultHash(body) };
}