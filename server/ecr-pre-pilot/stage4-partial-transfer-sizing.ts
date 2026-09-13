import {
  currentJobCArtifactHashes,
  jobCResultHash,
  jobCScientificResultHash,
  jobCWorkerStateHash,
} from './job-c';

export const PARTIAL_TRANSFER_SIZING_VERSION =
  'ECR_PRE_PILOT_STAGE4_DIRECT_NONLINEAR_PARTIAL_TRANSFER_CANDIDATE_V2';
export const PARTIAL_TRANSFER_ANCHOR_LAMBDA = 8e-9;
export const PARTIAL_TRANSFER_ANCHOR_HEIGHT_M = 2;
export const PARTIAL_TRANSFER_COMPONENT_ORDER =
  ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'] as const;
const PARTIAL_TRANSFER_MW_G_MOL = [170.3348, 120.194, 142.1971, 202.2506, 405.58, 119.16, 18.01528];

const HASH = /^[a-f0-9]{64}$/;
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const vector = (value: unknown, length: number): value is number[] =>
  Array.isArray(value) && value.length === length && value.every(finite);
const nonnegativeVector = (value: unknown, length: number): value is number[] =>
  vector(value, length) && value.every(item => item >= 0);

export type PartialTransferStage1Targets = {
  minimumRecoveryPct: number;
  minimumRaffinateSaturatesWt: number;
  targetRaffinateTotalAromaticsWt: number;
  targetRaffinatePolarAromaticsWt: number;
  maximumNmpRaffinateWt: number;
  targetRaffinateSulfurPpm: number;
};

/**
 * Pure, phase-aware product-duty evaluator for a direct partial-transfer
 * worker response.  It accepts only the exact seven-cell worker shape, never
 * coerces null/strings into numbers, and explicitly leaves sulfur unevaluated
 * because sulfur is absent from this seven-component transport model.
 */
export function evaluateDirectPartialTransferStage1Targets(input: {
  phaseConfiguration: unknown;
  componentOrder: unknown;
  numericalCells: unknown;
  recoveryPct: unknown;
  targets: PartialTransferStage1Targets;
  recoveryTolerancePct: number;
}) {
  if (JSON.stringify(input.componentOrder) !== JSON.stringify(PARTIAL_TRANSFER_COMPONENT_ORDER)
    || !finite(input.recoveryPct) || !finite(input.recoveryTolerancePct)
    || input.recoveryTolerancePct < 0
    || !Object.values(input.targets).every(finite)
    || !Array.isArray(input.numericalCells) || input.numericalCells.length !== 7) {
    return { valid: false as const, reason: 'PARTIAL_TRANSFER_TARGET_INPUT_SHAPE_INVALID' };
  }
  const cells = input.numericalCells;
  if (!cells.every((cell, index) => cell && typeof cell === 'object'
    && (cell as any).numericalCell === index + 1)) {
    return { valid: false as const, reason: 'PARTIAL_TRANSFER_TARGET_NUMERICAL_CELL_ORDINALS_INVALID' };
  }
  const rrboContinuous = input.phaseConfiguration === 'rrbo-continuous-nmp-dispersed';
  const rrboDispersed = input.phaseConfiguration === 'nmp-continuous-rrbo-dispersed';
  if (!rrboContinuous && !rrboDispersed) {
    return { valid: false as const, reason: 'PARTIAL_TRANSFER_TARGET_PHASE_CONFIGURATION_INVALID' };
  }
  const outlet = rrboContinuous
    ? (cells[6] as any).continuousOutMolS
    : (cells[0] as any).dispersedOutMolS;
  if (!nonnegativeVector(outlet, 7)) {
    return { valid: false as const, reason: 'PARTIAL_TRANSFER_TARGET_RAFFINATE_OUTLET_INVALID' };
  }
  const masses = outlet.map((flow, index) => flow * PARTIAL_TRANSFER_MW_G_MOL[index]);
  const hydrocarbonMass = masses.slice(0, 5).reduce((sum, value) => sum + value, 0);
  const fullMass = masses.reduce((sum, value) => sum + value, 0);
  if (!(hydrocarbonMass > 0) || !(fullMass > 0) || !masses.every(Number.isFinite)) {
    return { valid: false as const, reason: 'PARTIAL_TRANSFER_TARGET_MASS_DENOMINATOR_INVALID' };
  }
  const criteria = [
    {
      name: 'NMP_FREE_RRBO_HYDROCARBON_RECOVERY_PCT', comparator: 'GTE',
      target: input.targets.minimumRecoveryPct - input.recoveryTolerancePct,
      actual: input.recoveryPct,
    },
    {
      name: 'RAFFINATE_SATURATES_WT_PCT_NMP_FREE_HYDROCARBON', comparator: 'GTE',
      target: input.targets.minimumRaffinateSaturatesWt, actual: 100 * masses[0] / hydrocarbonMass,
    },
    {
      name: 'RAFFINATE_TOTAL_AROMATICS_WT_PCT_NMP_FREE_HYDROCARBON', comparator: 'LTE',
      target: input.targets.targetRaffinateTotalAromaticsWt,
      actual: 100 * (masses[1] + masses[2] + masses[3] + masses[4]) / hydrocarbonMass,
    },
    {
      name: 'RAFFINATE_POLAR_AROMATICS_WT_PCT_NMP_FREE_HYDROCARBON', comparator: 'LTE',
      target: input.targets.targetRaffinatePolarAromaticsWt, actual: 100 * masses[4] / hydrocarbonMass,
    },
    {
      name: 'RAFFINATE_NMP_WT_PCT_FULL_RAFFINATE_STREAM', comparator: 'LTE',
      target: input.targets.maximumNmpRaffinateWt, actual: 100 * masses[5] / fullMass,
    },
  ].map(metric => ({ ...metric,
    status: (metric.comparator === 'GTE' ? metric.actual >= metric.target : metric.actual <= metric.target)
      ? 'PASSED' as const : 'FAILED' as const }));
  return {
    valid: true as const,
    criteria: [...criteria, {
      name: 'RAFFINATE_SULFUR_PPM', comparator: 'LTE', target: input.targets.targetRaffinateSulfurPpm,
      actual: null, status: 'NOT_EVALUATED_NO_SULFUR_COMPONENT_OR_CALIBRATED_MODEL' as const,
    }],
    allEvaluatedNonSulfurTargetsPassed: criteria.every(metric => metric.status === 'PASSED'),
    qualityTargetsPassed: criteria.slice(1, 4).every(metric => metric.status === 'PASSED'),
    recoveryAndNmpTargetsPassed: criteria[0].status === 'PASSED'
      && criteria[4].status === 'PASSED',
    recoveryPct: input.recoveryPct,
    raffinateOutletMolS: outlet,
    massBasis: {
      hydrocarbonMassGPerS: hydrocarbonMass, fullRaffinateMassGPerS: fullMass,
      hydrocarbonExcludes: ['NMP', 'H2O'],
    },
  };
}

/** Pure search termination predicate; equality is intentionally sufficient. */
export function partialTransferHeightBracketResolved(
  lowerHeightM: unknown,
  upperHeightM: unknown,
  toleranceM: unknown,
) {
  return finite(lowerHeightM) && finite(upperHeightM) && finite(toleranceM)
    && toleranceM > 0 && upperHeightM >= lowerHeightM
    && upperHeightM - lowerHeightM <= toleranceM
      + Number.EPSILON * Math.max(1, Math.abs(lowerHeightM), Math.abs(upperHeightM));
}

/** Preserve the complete persisted candidate envelope; runtime budgets may
 * stop evaluation, but they must not silently discard candidate records. */
export function eligibleDirectPartialTransferCandidates<T>(
  candidates: readonly T[],
  eligible: (candidate: T) => boolean,
) {
  return candidates.filter(eligible);
}

export type FrozenCoefficientBand = {
  numericalCell: number;
  continuousBulkMoleFractions: number[];
  dispersedBulkMoleFractions: number[];
  interfaceContinuousMoleFractions: number[];
  interfaceDispersedMoleFractions: number[];
  totalMolarFluxMolM2S: number;
  reconstructedContinuousComponentFluxMolM2S: number[];
  reconstructedDispersedComponentFluxMolM2S: number[];
  equilibriumSecantM: number[];
  overallCoefficientMolM2S: number[];
  equations: {
    rawContinuous: 'rawc=kc*CtC*(xc-xic)';
    diffusiveContinuous: 'jc=rawc-xic*sum(rawc)';
    componentFlux: 'N=jc+xic*n';
    frozenSecant: 'm=xid/xic; K=N/(m*xc-xd)';
  };
};

export type StrictPartialAnchor = {
  sourceJobId: string;
  sourceResultHash: string;
  sourceInputHash: string;
  stage1SnapshotHash: string;
  workerRequest: Record<string, any>;
  profileState: number[];
  profileStateSha256: string;
  sourceDependencies: Record<string, any>;
};

/**
 * Read-only validation of a persisted strict-diagnostic source.  It neither
 * creates nor resumes a Job-C queue item.  The checkpoint is intentionally
 * inspected literally because it is the only persisted 189-coordinate state.
 */
export function verifyOwnedStrictPartialAnchor(row: any): StrictPartialAnchor | null {
  const snapshot = row?.input_snapshot;
  const prepared = snapshot?.prepared;
  const workerRequest = prepared?.workerRequest;
  const response = prepared?.responseBasis;
  const result = row?.result_snapshot;
  const worker = result?.workerResult;
  const endpoint = worker?.diagnosticPartialEndpoint;
  const mode = response?.diagnosticMode;
  const checkpoint = row?.partial_result_snapshot;
  if (
    !snapshot || !prepared || !workerRequest || !response || !result || !worker
    || row?.status !== 'completed' || !row?.completed_at
    || !HASH.test(String(row?.input_hash ?? ''))
    || jobCResultHash(snapshot) !== row.input_hash
    || !HASH.test(String(row?.result_hash ?? ''))
    || jobCScientificResultHash(result) !== row.result_hash
    || result.resultSha256 !== jobCResultHash(result)
    || result.status !== 'CALCULATED_DIAGNOSTIC_PARTIAL_JOB_C'
    || worker.status !== 'CALCULATED_DIAGNOSTIC_PARTIAL_JOB_C'
    || !HASH.test(String(worker.resultSha256 ?? ''))
    || jobCScientificResultHash(worker) !== worker.resultSha256
    || worker.diagnosticOnly !== true || worker.workflowTestOnly === true
    || result.workflowTestOnly === true
    || mode?.mode !== 'TEMPORARY_PARTIAL_TRANSFER_DIAGNOSTIC_ONLY_V1'
    || mode?.terminalLambda !== PARTIAL_TRANSFER_ANCHOR_LAMBDA
    || mode?.heightTrialM !== PARTIAL_TRANSFER_ANCHOR_HEIGHT_M
    || mode?.normalAcceptancePermitted !== false
    || worker?.diagnosticMode?.mode !== 'TEMPORARY_PARTIAL_TRANSFER_DIAGNOSTIC_ONLY_V1'
    || worker?.diagnosticMode?.terminalLambda !== PARTIAL_TRANSFER_ANCHOR_LAMBDA
    || worker?.diagnosticMode?.heightTrialM !== PARTIAL_TRANSFER_ANCHOR_HEIGHT_M
    || worker?.diagnosticMode?.normalAcceptancePermitted !== false
    || endpoint?.status !== 'QUALIFIED_PARTIAL_TRANSFER_ENDPOINT'
    || endpoint?.lambda !== PARTIAL_TRANSFER_ANCHOR_LAMBDA
    || endpoint?.heightTrialM !== PARTIAL_TRANSFER_ANCHOR_HEIGHT_M
    || !checkpoint || !HASH.test(String(row?.partial_result_hash ?? ''))
    || jobCResultHash(checkpoint) !== row.partial_result_hash
    || checkpoint.schemaVersion !== 'ECR_JOB_C_PARTIAL_V1'
    || checkpoint.complete !== false
  ) return null;
  // Match Job-C's persisted checkpoint identity exactly. Diagnostic mode is
  // part of the strict source request; only transport envelope fields are
  // removed by the existing checkpoint identity function.
  const request = { ...workerRequest };
  delete request.protocol;
  delete request.operation;
  delete request.resumeCheckpoint;
  if (checkpoint.requestSha256 !== jobCResultHash(request)) return null;
  const matches = (checkpoint.completedResults ?? []).filter((entry: any) =>
    entry?.kind === 'ACCEPTED_COUPLED_CONTINUATION_ANCHOR'
      && entry?.inputSha256 === checkpoint.requestSha256
      && entry?.value?.lambda === PARTIAL_TRANSFER_ANCHOR_LAMBDA
      && entry?.value?.heightM === PARTIAL_TRANSFER_ANCHOR_HEIGHT_M);
  if (matches.length !== 1) return null;
  const value = matches[0]?.value;
  if (!vector(value?.state, 189) || !HASH.test(String(value?.stateSha256 ?? ''))
    || jobCWorkerStateHash(value.state) !== value.stateSha256) return null;
  const confirmations = [value?.deterministicConfirmation, endpoint?.deterministicConfirmation];
  if (!confirmations.every((item: any) => item?.independentRawReevaluationCount === 2
    && item?.bothScientificGateEvaluationsPassed === true
    && item?.exactlyRepeatable === true && item?.maximumMetricDifference === 0)) return null;
  const gates = { ...(value?.gateMetrics ?? {}), ...(endpoint?.gateDecision ?? {}) };
  if (!['rawFvGatePassed', 'scaledFvGatePassed', 'originalJobBGatePassed',
    'strictPositivityPassed', 'accepted'].every(key => gates[key] === true)) return null;
  if (![value?.gateMetrics?.rawFvResidualMolS, value?.gateMetrics?.scaledFvResidual,
    value?.gateMetrics?.maximumOriginalJobBGateResidual, value?.gateMetrics?.minimumFlowMolS]
    .every(finite)) return null;
  const anchorMetricIdentity = {
    rawFvResidualMolS: value.gateMetrics.rawFvResidualMolS,
    scaledFvResidual: value.gateMetrics.scaledFvResidual,
    maximumOriginalJobBGateResidual: value.gateMetrics.maximumOriginalJobBGateResidual,
    minimumFlowMolS: value.gateMetrics.minimumFlowMolS,
  };
  if (jobCResultHash(anchorMetricIdentity) !== jobCResultHash(endpoint?.gateMetrics)
    || jobCResultHash(value.deterministicConfirmation)
      !== jobCResultHash(endpoint?.deterministicConfirmation)) return null;
  const dependencies = response.dependencies;
  if (!dependencies || !HASH.test(String(dependencies.stage1SnapshotHash ?? ''))
    || !HASH.test(String(dependencies.stage3ImmutableHash ?? ''))) return null;
  // Source implementation/Job-B/candidate compatibility is rechecked against
  // the same immutable worker-artifact identities enforced by the canonical
  // strict-continuation source validator. Reading digests does not import or
  // execute a worker.
  let artifacts: ReturnType<typeof currentJobCArtifactHashes>;
  try {
    artifacts = currentJobCArtifactHashes();
  } catch {
    return null;
  }
  const historicalStrictDiagnosticWorker =
    '2c2e266b8424bfc2dc9917294bf758da7517c2d3896626f7aad31de37b197c25';
  if (row?.candidate_hash !== artifacts.candidateHash
    || !HASH.test(String(row?.implementation_hash ?? ''))
    || (row.implementation_hash !== artifacts.implementationHash
      && row.implementation_hash !== historicalStrictDiagnosticWorker)
    || row?.job_b_engine_hash !== dependencies.jobBInterfaceWorkerSha256
    || dependencies.jobCBoundaryInterfaceQualifierSha256 !== artifacts.boundaryQualifierHash
    || dependencies.jobCBranchContinuationSha256 !== artifacts.branchContinuationHash) return null;
  return {
    sourceJobId: String(row.id),
    sourceResultHash: row.result_hash,
    sourceInputHash: row.input_hash,
    stage1SnapshotHash: dependencies.stage1SnapshotHash,
    workerRequest,
    profileState: [...value.state],
    profileStateSha256: value.stateSha256,
    sourceDependencies: dependencies,
  };
}

function softmax(logits: number[]) {
  const values = [...logits, 0];
  const maximum = Math.max(...values);
  const exp = values.map(value => Math.exp(value - maximum));
  const total = exp.reduce((sum, value) => sum + value, 0);
  return exp.map(value => value / total);
}

/**
 * Decode the exact strict-anchor coordinates with the unmodified candidate
 * transform.  No Job-C worker is imported or executed here.
 */
export function decodeFrozenLocalCoefficients(input: {
  state: number[];
  workerRequest: Record<string, any>;
}): FrozenCoefficientBand[] {
  const { state, workerRequest: request } = input;
  if (!vector(state, 189) || !vector(request?.kc, 7) || !vector(request?.kd, 7)
    || !finite(request?.continuousTotalConcentrationMolM3)
    || !finite(request?.dispersedTotalConcentrationMolM3)
    || request.continuousTotalConcentrationMolM3 <= 0
    || request.dispersedTotalConcentrationMolM3 <= 0) {
    throw new Error('PARTIAL_TRANSFER_COEFFICIENTS_INVALID_STRICT_ANCHOR_INPUT');
  }
  const ctc = request.continuousTotalConcentrationMolM3;
  const ctd = request.dispersedTotalConcentrationMolM3;
  const kcct = request.kc.map((value: number) => value * ctc);
  const kdct = request.kd.map((value: number) => value * ctd);
  if (![...kcct, ...kdct].every(value => finite(value) && value > 0)) {
    throw new Error('PARTIAL_TRANSFER_COEFFICIENTS_INVALID_ORIGINAL_FILMS');
  }
  // CandidateInterfaceSolver.bound, preserved exactly to decode u[12].
  const fluxBound = 2 * [...kcct, ...kdct].reduce((sum, value) => sum + value, 0);
  const bands: FrozenCoefficientBand[] = [];
  for (let cell = 0; cell < 7; cell += 1) {
    const fc = state.slice(cell * 7, cell * 7 + 7);
    const fd = state.slice(49 + cell * 7, 49 + cell * 7 + 7);
    const unknowns = state.slice(98 + cell * 13, 98 + (cell + 1) * 13);
    const totalC = fc.reduce((sum, value) => sum + value, 0);
    const totalD = fd.reduce((sum, value) => sum + value, 0);
    if (!(totalC > 0) || !(totalD > 0) || fc.some(value => value <= 0)
      || fd.some(value => value <= 0)) {
      throw new Error(`PARTIAL_TRANSFER_COEFFICIENTS_NONPOSITIVE_ANCHOR_FLOW:CELL_${cell + 1}`);
    }
    const xc = fc.map(value => value / totalC);
    const xd = fd.map(value => value / totalD);
    const xic = softmax(unknowns.slice(0, 6));
    const xid = softmax(unknowns.slice(6, 12));
    const n = fluxBound * Math.tanh(unknowns[12]);
    const rawc = kcct.map((value, i) => value * (xc[i] - xic[i]));
    const rawd = kdct.map((value, i) => value * (xid[i] - xd[i]));
    const jc = rawc.map((value, i) => value - xic[i] * rawc.reduce((a, b) => a + b, 0));
    const jd = rawd.map((value, i) => value - xid[i] * rawd.reduce((a, b) => a + b, 0));
    const nc = jc.map((value, i) => value + xic[i] * n);
    const nd = jd.map((value, i) => value + xid[i] * n);
    const m = xid.map((value, i) => value / xic[i]);
    const drivingForce = m.map((value, i) => value * xc[i] - xd[i]);
    const K = nc.map((value, i) => value / drivingForce[i]);
    // A zero/near-zero secant denominator is not a fit opportunity.  It is
    // rejected before any height integration; K must retain the two-film sign.
    if (![...xic, ...xid, n, ...rawc, ...rawd, ...nc, ...nd, ...m,
      ...drivingForce, ...K].every(finite)
      || drivingForce.some(value => Math.abs(value) <= 1e-12)
      || K.some(value => !(value > 0))
      || nc.some((value, i) => Math.abs(value - nd[i])
        > 1e-7 * Math.max(1, Math.abs(value), Math.abs(nd[i])))) {
      throw new Error(`PARTIAL_TRANSFER_COEFFICIENTS_ILL_CONDITIONED_OR_INCONSISTENT:CELL_${cell + 1}`);
    }
    bands.push({
      numericalCell: cell + 1, continuousBulkMoleFractions: xc,
      dispersedBulkMoleFractions: xd, interfaceContinuousMoleFractions: xic,
      interfaceDispersedMoleFractions: xid, totalMolarFluxMolM2S: n,
      reconstructedContinuousComponentFluxMolM2S: nc,
      reconstructedDispersedComponentFluxMolM2S: nd,
      equilibriumSecantM: m, overallCoefficientMolM2S: K,
      equations: {
        rawContinuous: 'rawc=kc*CtC*(xc-xic)',
        diffusiveContinuous: 'jc=rawc-xic*sum(rawc)',
        componentFlux: 'N=jc+xic*n',
        frozenSecant: 'm=xid/xic; K=N/(m*xc-xd)',
      },
    });
  }
  return bands;
}

type BvpState = { continuous: number[]; dispersed: number[] };
const add = (a: number[], b: number[], scale: number) => a.map((value, i) => value + scale * b[i]);

/**
 * Seven-band, opposite-feed plug-flow shooting solve. z increases from the
 * continuous inlet (z=0) to its outlet; dispersed magnitude enters at z=H.
 * Thus dFc/dz=dFd/dz=-a*A*N, preserving Fc(H)+Fd(0)=Fc(0)+Fd(H).
 */
export function solveFrozenSecantPlugFlowBvp(input: {
  continuousFeedMolS: number[];
  dispersedFeedMolS: number[];
  bands: FrozenCoefficientBand[];
  holdup: number;
  d32M: number;
  columnDiameterM: number;
  heightM: number;
}): {
  continuousOutletMolS: number[];
  dispersedOutletMolS: number[];
  minimumFlowMolS: number;
  maximumComponentBalanceResidualMolS: number;
  iterations: number;
  converged: boolean;
} {
  const { continuousFeedMolS: cFeed, dispersedFeedMolS: dFeed, bands, holdup, d32M,
    columnDiameterM, heightM } = input;
  if (!nonnegativeVector(cFeed, 7) || !nonnegativeVector(dFeed, 7) || bands.length !== 7
    || ![holdup, d32M, columnDiameterM, heightM].every(finite)
    || !(holdup > 0 && holdup < 1) || !(d32M > 0) || !(columnDiameterM > 0)
    || !(heightM > 0)
    || !(cFeed.reduce((sum, value) => sum + value, 0) > 0)
    || !(dFeed.reduce((sum, value) => sum + value, 0) > 0)) {
    throw new Error('PARTIAL_TRANSFER_BVP_INVALID_INPUT');
  }
  const a = 6 * holdup / d32M;
  const area = Math.PI * columnDiameterM ** 2 / 4;
  const steps = 280; // integration refinement, not a physical compartment count
  const dz = heightM / steps;
  const derivative = (z: number, state: BvpState): BvpState => {
    const totalC = state.continuous.reduce((sum, value) => sum + value, 0);
    const totalD = state.dispersed.reduce((sum, value) => sum + value, 0);
    // A component may legitimately be absent at its feed boundary. Interior
    // and outlet values remain strictly gated after integration.
    if (!(totalC > 0) || !(totalD > 0) || state.continuous.some(value => value < 0)
      || state.dispersed.some(value => value < 0)) throw new Error('PARTIAL_TRANSFER_BVP_NEGATIVE_FLOW');
    const band = bands[Math.min(6, Math.floor(z / heightM * 7))];
    const xc = state.continuous.map(value => value / totalC);
    const xd = state.dispersed.map(value => value / totalD);
    const source = band.overallCoefficientMolM2S.map((k, i) =>
      a * area * k * (band.equilibriumSecantM[i] * xc[i] - xd[i]));
    if (!source.every(finite)) throw new Error('PARTIAL_TRANSFER_BVP_NONFINITE_SOURCE');
    return { continuous: source.map(value => -value), dispersed: source.map(value => -value) };
  };
  const integrate = (d0: number[]) => {
    let state: BvpState = { continuous: [...cFeed], dispersed: [...d0] };
    let minimum = Number.POSITIVE_INFINITY;
    for (let step = 0; step < steps; step += 1) {
      const z = step * dz;
      const k1 = derivative(z, state);
      const k2 = derivative(z + dz / 2, {
        continuous: add(state.continuous, k1.continuous, dz / 2),
        dispersed: add(state.dispersed, k1.dispersed, dz / 2),
      });
      const k3 = derivative(z + dz / 2, {
        continuous: add(state.continuous, k2.continuous, dz / 2),
        dispersed: add(state.dispersed, k2.dispersed, dz / 2),
      });
      const k4 = derivative(z + dz, {
        continuous: add(state.continuous, k3.continuous, dz),
        dispersed: add(state.dispersed, k3.dispersed, dz),
      });
      state = {
        continuous: state.continuous.map((value, i) => value + dz / 6
          * (k1.continuous[i] + 2 * k2.continuous[i] + 2 * k3.continuous[i] + k4.continuous[i])),
        dispersed: state.dispersed.map((value, i) => value + dz / 6
          * (k1.dispersed[i] + 2 * k2.dispersed[i] + 2 * k3.dispersed[i] + k4.dispersed[i])),
      };
      minimum = Math.min(minimum, ...state.continuous, ...state.dispersed);
    }
    return { state, minimum };
  };
  // The dispersed z=0 boundary is the shooting unknown, not its z=H feed.
  // A tiny positive initial iterate permits legitimate zero feed components;
  // the converged interior/outlet gate below remains strict.
  let d0 = dFeed.map(value => value === 0 ? 1e-20 : value);
  let integrated: ReturnType<typeof integrate> | null = null;
  let iterations = 0;
  for (; iterations < 100; iterations += 1) {
    integrated = integrate(d0);
    const residual = integrated.state.dispersed.map((value, i) => value - dFeed[i]);
    const scale = Math.max(...dFeed);
    if (Math.max(...residual.map(Math.abs)) <= 1e-9 * Math.max(scale, 1e-20)) break;
    d0 = d0.map((value, i) => value - 0.5 * residual[i]);
    if (d0.some(value => !(value > 0) || !finite(value))) {
      throw new Error('PARTIAL_TRANSFER_BVP_SHOOTING_LEFT_POSITIVE_DOMAIN');
    }
  }
  if (!integrated) throw new Error('PARTIAL_TRANSFER_BVP_NO_INTEGRATION');
  const residual = integrated.state.dispersed.map((value, i) => value - dFeed[i]);
  const converged = Math.max(...residual.map(Math.abs))
    <= 1e-9 * Math.max(...dFeed, 1e-20);
  const balance = cFeed.map((value, i) =>
    value + dFeed[i] - integrated!.state.continuous[i] - d0[i]);
  if (!(integrated.minimum > 0) || integrated.state.continuous.some(value => !(value > 0))
    || d0.some(value => !(value > 0))) {
    throw new Error('PARTIAL_TRANSFER_BVP_NONPOSITIVE_INTERIOR_OR_OUTLET_FLOW');
  }
  return {
    continuousOutletMolS: integrated.state.continuous,
    dispersedOutletMolS: d0,
    minimumFlowMolS: integrated.minimum,
    maximumComponentBalanceResidualMolS: Math.max(...balance.map(Math.abs)),
    iterations, converged,
  };
}

const recoveryMolecularWeights = [170.3348, 120.194, 142.1971, 202.2506, 405.58];

/**
 * Pure preparation/evaluation seam for read-only review. It deliberately has
 * no database, worker, queue, or filesystem dependency, allowing an owned
 * persisted source to be inspected without mutating evidence.
 */
export function prepareFrozenPartialTransferBvp(input: {
  workerRequest: Record<string, any>;
  bands: FrozenCoefficientBand[];
  compartmentHeightM: number;
  targetRecoveryPct: number;
}) {
  const request = input.workerRequest;
  const recovery = (bvp: ReturnType<typeof solveFrozenSecantPlugFlowBvp>) => {
    const product = request.phaseConfiguration === 'rrbo-continuous-nmp-dispersed'
      ? bvp.continuousOutletMolS : bvp.dispersedOutletMolS;
    const incoming = request.phaseConfiguration === 'rrbo-continuous-nmp-dispersed'
      ? request.continuousFeedMolS : request.dispersedFeedMolS;
    if (!vector(incoming, 7)) throw new Error('PARTIAL_TRANSFER_TARGET_RECOVERY_INPUT_INVALID');
    const denominator = incoming.slice(0, 5).reduce((sum: number, value: number, index: number) =>
      sum + value * recoveryMolecularWeights[index], 0);
    if (!(denominator > 0)) throw new Error('PARTIAL_TRANSFER_TARGET_RECOVERY_INPUT_INVALID');
    return 100 * product.slice(0, 5).reduce((sum: number, value: number, index: number) =>
      sum + value * recoveryMolecularWeights[index], 0) / denominator;
  };
  const solveAt = (heightM: number) => {
    const bvp = solveFrozenSecantPlugFlowBvp({
      continuousFeedMolS: request.continuousFeedMolS,
      dispersedFeedMolS: request.dispersedFeedMolS,
      bands: input.bands, holdup: request.operatingHoldup, d32M: request.d32M,
      columnDiameterM: request.columnDiameterM, heightM,
    });
    if (!bvp.converged || !(bvp.minimumFlowMolS > 0)
      || bvp.maximumComponentBalanceResidualMolS > 1e-8) {
      throw new Error('PARTIAL_TRANSFER_BVP_BALANCE_OR_POSITIVITY_GATE_FAILED');
    }
    return { ...bvp, heightM, recoveryPct: recovery(bvp) };
  };
  if (!finite(input.compartmentHeightM) || !(input.compartmentHeightM > 0)
    || !finite(input.targetRecoveryPct)) {
    throw new Error('PARTIAL_TRANSFER_BVP_PREPARATION_INPUT_INVALID');
  }
  const lower = solveAt(input.compartmentHeightM);
  const upper = solveAt(PARTIAL_TRANSFER_ANCHOR_HEIGHT_M);
  let selected: ReturnType<typeof solveAt> | null = null;
  let targetFailure: string | null = null;
  if (!(input.compartmentHeightM < PARTIAL_TRANSFER_ANCHOR_HEIGHT_M)) {
    targetFailure = 'PARTIAL_TRANSFER_TARGET_BRACKET_INVALID_PERSISTED_STAGE3_COMPARTMENT_HEIGHT_NOT_BELOW_2M_ANCHOR';
  } else if (lower.recoveryPct >= input.targetRecoveryPct) {
    selected = lower;
  } else if (upper.recoveryPct < input.targetRecoveryPct) {
    targetFailure = 'PARTIAL_TRANSFER_TARGET_RECOVERY_NOT_BRACKETED_BY_PERSISTED_STAGE3_COMPARTMENT_AND_2M_ANCHOR';
  } else {
    let lo = input.compartmentHeightM;
    let hi = PARTIAL_TRANSFER_ANCHOR_HEIGHT_M;
    const middleCheck = solveAt((lo + hi) / 2);
    if (middleCheck.recoveryPct < lower.recoveryPct || middleCheck.recoveryPct > upper.recoveryPct) {
      targetFailure = 'PARTIAL_TRANSFER_TARGET_RECOVERY_NONMONOTONE_WITHIN_BRACKET';
    }
    for (let iteration = 0; iteration < 40 && !targetFailure; iteration += 1) {
      const middle = (lo + hi) / 2;
      const trial = solveAt(middle);
      if (trial.recoveryPct >= input.targetRecoveryPct) {
        hi = middle; selected = trial;
      } else lo = middle;
    }
  }
  return { lower, upper, selected, targetFailure };
}