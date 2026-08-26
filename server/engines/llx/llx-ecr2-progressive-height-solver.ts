// ═══════════════════════════════════════════════════════════════════════════
// ECR-2 — Progressive physical-height solver
//
// This module owns only the outer design-height search.  It deliberately
// delegates every local equilibrium, property, hydrodynamic, and transfer
// calculation to the existing counter-current BVP.
// ═══════════════════════════════════════════════════════════════════════════

import {
  solveECR2CounterCurrentBVP,
  type ECR2CounterCurrentBVPInput,
  type ECR2CounterCurrentBVPResult,
} from './llx-ecr2-counter-current-bvp';
import { calculateHydrocarbonProductQuality } from '../../engine-framework/cel/product-quality-basis';

const N_COMPONENTS = 5;

export const ECR2_HEIGHT_SOLVER_NUMERICS = {
  minimumPhysicalHeight_m: 0.01,
  maximumPhysicalHeight_m: 100,
  heightTolerance_m: 0.001,
  residualMonotonicityTolerance: 1e-8,
  maximumBracketExpansions: 20,
  maximumBisectionIterations: 24,
} as const;

/**
 * ECR-2 process-design acceptance requirement. This is deliberately separate
 * from BVP numerical acceptance: an exactly converged BVP is still not a
 * feasible design point if it reaches the aromatic target by losing too much
 * RRBO hydrocarbon to the extract.
 */
export const ECR2_RRBO_RECOVERY_REQUIREMENT = {
  minimumMassFraction: 0.95,
  basis: 'NMP-free hydrocarbon mass in raffinate / NMP-free hydrocarbon mass in RRBO feed',
} as const;

export type ECR2HeightSizingStatus =
  | 'target_met'
  | 'target_not_met'
  | 'no_feasible_recovery'
  | 'not_calculable';

export interface ECR2HeightQualityTarget {
  value: number;
  sourceType: string;
  sourceReference: string;
}

export interface ECR2HeightTrial {
  physicalHeight_m: number;
  numberOfCells: number;
  deltaZ_m: number;
  accepted: boolean;
  /** True only when the full BVP converged and passed global mass balance. */
  bvpAccepted: boolean;
  bvpConverged: boolean;
  massBalancePassed: boolean;
  productAromaticsMoleFraction: number | null;
  residual: number | null;
  /** Hydrocarbon-only RRBO recovery. NMP is excluded from numerator and denominator. */
  rrboRecoveryMassFraction: number | null;
  recoveryResidual: number | null;
  saturatesTransferred_kg_h: number | null;
  aromaticsTransferred_kg_h: number | null;
  totalRrboTransferredToExtract_kg_h: number | null;
  bvpStatus: ECR2CounterCurrentBVPResult['status'];
  massBalanceStatus: ECR2CounterCurrentBVPResult['massBalanceStatus'];
  failure: string | null;
}

export interface ECR2ProgressiveHeightSolveResult {
  status: ECR2HeightSizingStatus;
  requiredActiveHeight_m: number | null;
  achievedProductAromaticsMoleFraction: number | null;
  residual: number | null;
  rrboRecoveryMassFraction: number | null;
  recoveryResidual: number | null;
  recoveryRequirement: typeof ECR2_RRBO_RECOVERY_REQUIREMENT;
  /**
   * Best calculated raffinate aromatic result among evaluated BVP points that
   * retained the required RRBO recovery. This is the reportable comparator for
   * an infeasible recovery-constrained search.
   */
  bestAromaticsAtRequiredRecovery: {
    physicalHeight_m: number;
    productAromaticsMoleFraction: number;
    residual: number;
    rrboRecoveryMassFraction: number;
    recoveryResidual: number;
    saturatesTransferred_kg_h: number;
    aromaticsTransferred_kg_h: number;
    totalRrboTransferredToExtract_kg_h: number;
  } | null;
  target: ECR2HeightQualityTarget;
  maximumCellHeight_m: number;
  searchTolerance_m: number;
  lowerBracketHeight_m: number | null;
  upperBracketHeight_m: number | null;
  selectedNumberOfCells: number | null;
  selectedDeltaZ_m: number | null;
  trials: readonly ECR2HeightTrial[];
  selectedBvp: ECR2CounterCurrentBVPResult | null;
  diagnostics: readonly string[];
}

export interface ECR2ProgressiveHeightSolveInput {
  target: ECR2HeightQualityTarget;
  maximumCellHeight_m: number;
  physicalMolecularWeights_g_mol: readonly [number, number, number, number, number];
  bvpBaseInput: Omit<ECR2CounterCurrentBVPInput,
    'numberOfCompartments' | 'activeHeight_m' | 'previousSolution'>;
  maximumPhysicalHeight_m?: number;
  heightTolerance_m?: number;
  /** Test seam only; production deliberately uses the existing full BVP. */
  solveBvp?: (input: ECR2CounterCurrentBVPInput) => ECR2CounterCurrentBVPResult;
  /**
   * Builds each physical-height trial input for an explicitly different
   * physical condition. Production ECR-2 process sizing keeps governed ψ
   * invariant across H and normally uses bvpBaseInput directly.
   */
  buildTrialBvpInput?: (trial: {
    physicalHeight_m: number;
    numberOfCells: number;
    deltaZ_m: number;
    previousSolution: readonly number[] | null;
  }) => ECR2CounterCurrentBVPInput;
}

/** Builds a reportable NOT_CALCULABLE height result without running a BVP trial. */
export function createECR2ProgressiveHeightBlockedResult(input: {
  target: ECR2HeightQualityTarget;
  maximumCellHeight_m: number;
  reason: string;
}): ECR2ProgressiveHeightSolveResult {
  return {
    status: 'not_calculable',
    requiredActiveHeight_m: null,
    achievedProductAromaticsMoleFraction: null,
    residual: null,
    rrboRecoveryMassFraction: null,
    recoveryResidual: null,
    recoveryRequirement: ECR2_RRBO_RECOVERY_REQUIREMENT,
    bestAromaticsAtRequiredRecovery: null,
    target: input.target,
    maximumCellHeight_m: input.maximumCellHeight_m,
    searchTolerance_m: ECR2_HEIGHT_SOLVER_NUMERICS.heightTolerance_m,
    lowerBracketHeight_m: null,
    upperBracketHeight_m: null,
    selectedNumberOfCells: null,
    selectedDeltaZ_m: null,
    trials: [],
    selectedBvp: null,
    diagnostics: [
      'No physical-height BVP trial was run because a required physical dependency is blocked.',
      input.reason,
    ],
  };
}

interface AcceptedState {
  height_m: number;
  cells: number;
  state: readonly number[];
}

interface EvaluatedTrial {
  trial: ECR2HeightTrial;
  bvp: ECR2CounterCurrentBVPResult;
  acceptedState: AcceptedState | null;
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function interpolateFace(
  values: readonly number[][],
  coordinate: number,
): number[] {
  const last = values.length - 1;
  const position = Math.max(0, Math.min(last, coordinate * last));
  const lower = Math.floor(position);
  const upper = Math.min(last, lower + 1);
  const fraction = position - lower;
  return values[lower].map((value, index) => value + fraction * (values[upper][index] - value));
}

/**
 * Projects only accepted physical face flows onto a changed numerical mesh.
 * Local NRTL, transfer rates, properties, and residuals are never projected;
 * the next BVP evaluation recomputes them from its own trial state.
 */
export function projectECR2BVPFaceState(input: {
  previousState: readonly number[];
  previousCells: number;
  nextCells: number;
  rrboFeedComponentFlows_kg_h: readonly number[];
  nmpFeedComponentFlows_kg_h: readonly number[];
}): number[] | null {
  const {
    previousState, previousCells, nextCells,
    rrboFeedComponentFlows_kg_h, nmpFeedComponentFlows_kg_h,
  } = input;
  if (
    !Number.isInteger(previousCells) || previousCells < 1 ||
    !Number.isInteger(nextCells) || nextCells < 1 ||
    previousState.length !== 2 * N_COMPONENTS * previousCells ||
    !previousState.every((value) => Number.isFinite(value) && value >= 0) ||
    rrboFeedComponentFlows_kg_h.length !== N_COMPONENTS ||
    nmpFeedComponentFlows_kg_h.length !== N_COMPONENTS
  ) return null;

  const dispersedFaces = Array.from({ length: previousCells + 1 }, (_, face) =>
    face === 0
      ? [...rrboFeedComponentFlows_kg_h]
      : previousState.slice((face - 1) * N_COMPONENTS, face * N_COMPONENTS),
  );
  const continuousOffset = previousCells * N_COMPONENTS;
  const continuousFaces = Array.from({ length: previousCells + 1 }, (_, face) =>
    face === previousCells
      ? [...nmpFeedComponentFlows_kg_h]
      : previousState.slice(
          continuousOffset + face * N_COMPONENTS,
          continuousOffset + (face + 1) * N_COMPONENTS,
        ),
  );

  const projected: number[] = [];
  for (let face = 1; face <= nextCells; face++) {
    projected.push(...interpolateFace(dispersedFaces, face / nextCells));
  }
  for (let face = 0; face < nextCells; face++) {
    projected.push(...interpolateFace(continuousFaces, face / nextCells));
  }
  return projected.every((value) => Number.isFinite(value) && value >= 0)
    ? projected
    : null;
}

function productAromaticMoleFraction(
  bvp: ECR2CounterCurrentBVPResult,
  molecularWeights: readonly [number, number, number, number, number],
): number | null {
  if (bvp.status !== 'converged' || bvp.massBalanceStatus !== 'passed' || !bvp.outlets.raffinate) {
    return null;
  }
  try {
    return calculateHydrocarbonProductQuality({
      componentMoleFractions: bvp.outlets.raffinate.componentFlows_kg_h.map(
        (flow, index) => (flow * 1000) / molecularWeights[index],
      ),
      componentMassFlows_kg_h: bvp.outlets.raffinate.componentFlows_kg_h,
    }).x_A_R_product.value;
  } catch {
    return null;
  }
}

function hydrocarbonSum(values: readonly number[]): number {
  return values.slice(0, 4).reduce((total, value) => total + value, 0);
}

function aromaticSum(values: readonly number[]): number {
  return values.slice(1, 4).reduce((total, value) => total + value, 0);
}

function recoveryAndTransferSummary(
  bvp: ECR2CounterCurrentBVPResult,
  rrboFeedComponentFlows_kg_h: readonly number[],
): {
  rrboRecoveryMassFraction: number;
  saturatesTransferred_kg_h: number;
  aromaticsTransferred_kg_h: number;
  totalRrboTransferredToExtract_kg_h: number;
} | null {
  const raffinate = bvp.outlets?.raffinate?.componentFlows_kg_h;
  const feedHydrocarbons = hydrocarbonSum(rrboFeedComponentFlows_kg_h);
  if (
    bvp.status !== 'converged' ||
    bvp.massBalanceStatus !== 'passed' ||
    !raffinate ||
    !Number.isFinite(feedHydrocarbons) ||
    feedHydrocarbons <= 0
  ) return null;

  const raffinateHydrocarbons = hydrocarbonSum(raffinate);
  const saturatesTransferred_kg_h = rrboFeedComponentFlows_kg_h[0] - raffinate[0];
  const aromaticsTransferred_kg_h =
    aromaticSum(rrboFeedComponentFlows_kg_h) - aromaticSum(raffinate);
  const totalRrboTransferredToExtract_kg_h = feedHydrocarbons - raffinateHydrocarbons;
  const rrboRecoveryMassFraction = raffinateHydrocarbons / feedHydrocarbons;
  const values = [
    rrboRecoveryMassFraction,
    saturatesTransferred_kg_h,
    aromaticsTransferred_kg_h,
    totalRrboTransferredToExtract_kg_h,
  ];
  return values.every(Number.isFinite)
    ? {
        rrboRecoveryMassFraction,
        saturatesTransferred_kg_h,
        aromaticsTransferred_kg_h,
        totalRrboTransferredToExtract_kg_h,
      }
    : null;
}

export function solveECR2ProgressiveHeight(
  input: ECR2ProgressiveHeightSolveInput,
): ECR2ProgressiveHeightSolveResult {
  const maximumCellHeight_m = input.maximumCellHeight_m;
  const maximumPhysicalHeight_m = input.maximumPhysicalHeight_m
    ?? ECR2_HEIGHT_SOLVER_NUMERICS.maximumPhysicalHeight_m;
  const heightTolerance_m = input.heightTolerance_m
    ?? ECR2_HEIGHT_SOLVER_NUMERICS.heightTolerance_m;
  const diagnostics: string[] = [
    'Outer method: bracketed physical-height continuation followed by conservative bisection.',
    'Each trial reruns the full counter-current BVP; no local NRTL, K&H, d32, holdup, or transfer value is reused.',
    `Design acceptance requires hydrocarbon-only raffinate aromatics at or below target and RRBO recovery at or above ${(ECR2_RRBO_RECOVERY_REQUIREMENT.minimumMassFraction * 100).toFixed(1)}%.`,
  ];
  const trials: ECR2HeightTrial[] = [];

  const bestRecoveryQualifiedTrial = () =>
    trials
      .filter((trial) =>
        trial.bvpAccepted &&
        trial.productAromaticsMoleFraction !== null &&
        trial.residual !== null &&
        trial.rrboRecoveryMassFraction !== null &&
        trial.recoveryResidual !== null &&
        trial.recoveryResidual >= 0 &&
        trial.saturatesTransferred_kg_h !== null &&
        trial.aromaticsTransferred_kg_h !== null &&
        trial.totalRrboTransferredToExtract_kg_h !== null,
      )
      .sort((left, right) =>
        left.productAromaticsMoleFraction! - right.productAromaticsMoleFraction!,
      )[0] ?? null;

  const bestAromaticsAtRequiredRecovery = () => {
    const candidate = bestRecoveryQualifiedTrial();
    return candidate
      ? {
          physicalHeight_m: candidate.physicalHeight_m,
          productAromaticsMoleFraction: candidate.productAromaticsMoleFraction!,
          residual: candidate.residual!,
          rrboRecoveryMassFraction: candidate.rrboRecoveryMassFraction!,
          recoveryResidual: candidate.recoveryResidual!,
          saturatesTransferred_kg_h: candidate.saturatesTransferred_kg_h!,
          aromaticsTransferred_kg_h: candidate.aromaticsTransferred_kg_h!,
          totalRrboTransferredToExtract_kg_h: candidate.totalRrboTransferredToExtract_kg_h!,
        }
      : null;
  };

  const invalid = (message: string): ECR2ProgressiveHeightSolveResult => ({
    status: 'not_calculable',
    requiredActiveHeight_m: null,
    achievedProductAromaticsMoleFraction: null,
    residual: null,
    rrboRecoveryMassFraction: null,
    recoveryResidual: null,
    recoveryRequirement: ECR2_RRBO_RECOVERY_REQUIREMENT,
    bestAromaticsAtRequiredRecovery: bestAromaticsAtRequiredRecovery(),
    target: input.target,
    maximumCellHeight_m,
    searchTolerance_m: heightTolerance_m,
    lowerBracketHeight_m: null,
    upperBracketHeight_m: null,
    selectedNumberOfCells: null,
    selectedDeltaZ_m: null,
    trials,
    selectedBvp: null,
    diagnostics: [...diagnostics, message],
  });

  if (
    !finitePositive(maximumCellHeight_m) ||
    !finitePositive(maximumPhysicalHeight_m) ||
    !finitePositive(heightTolerance_m) ||
    heightTolerance_m > maximumPhysicalHeight_m ||
    !finitePositive(input.target.value) ||
    input.target.value >= 1 ||
    !input.physicalMolecularWeights_g_mol.every(finitePositive)
  ) {
    return invalid('Progressive height solve has an invalid target, numerical mesh, physical-height bound, tolerance, or molecular-weight basis.');
  }

  let previousAccepted: AcceptedState | null = null;
  let monotonicityViolation: string | null = null;
  let recoveryMonotonicityViolation: string | null = null;

  const evaluateHeight = (physicalHeight_m: number): EvaluatedTrial => {
    const cells = Math.max(1, Math.ceil(physicalHeight_m / maximumCellHeight_m));
    const deltaZ_m = physicalHeight_m / cells;
    const projected = previousAccepted
      ? projectECR2BVPFaceState({
          previousState: previousAccepted.state,
          previousCells: previousAccepted.cells,
          nextCells: cells,
          rrboFeedComponentFlows_kg_h: input.bvpBaseInput.rrboFeedComponentFlows_kg_h,
          nmpFeedComponentFlows_kg_h: input.bvpBaseInput.nmpFeedComponentFlows_kg_h,
        })
      : null;
    const bvpInput = input.buildTrialBvpInput
      ? input.buildTrialBvpInput({
          physicalHeight_m,
          numberOfCells: cells,
          deltaZ_m,
          previousSolution: projected,
        })
      : {
          ...input.bvpBaseInput,
          numberOfCompartments: cells,
          activeHeight_m: physicalHeight_m,
          previousSolution: projected,
        };
    const bvp = (input.solveBvp ?? solveECR2CounterCurrentBVP)(bvpInput);
    const quality = productAromaticMoleFraction(bvp, input.physicalMolecularWeights_g_mol);
    const recovery = recoveryAndTransferSummary(
      bvp,
      input.bvpBaseInput.rrboFeedComponentFlows_kg_h,
    );
    const bvpAccepted = quality !== null && recovery !== null;
    const residual = quality === null ? null : quality - input.target.value;
    const recoveryResidual = recovery === null
      ? null
      : recovery.rrboRecoveryMassFraction - ECR2_RRBO_RECOVERY_REQUIREMENT.minimumMassFraction;
    const accepted = bvpAccepted && residual! <= 0 && recoveryResidual! >= 0;
    const failure = !bvpAccepted
      ? (bvp.failure?.message ?? 'BVP did not reach accepted convergence and global mass balance.')
      : accepted
        ? null
        : [
            residual! > 0
              ? `Raffinate aromatic residual ${residual!.toExponential(3)} is above the product target.`
              : null,
            recoveryResidual! < 0
              ? `RRBO recovery ${(recovery!.rrboRecoveryMassFraction * 100).toFixed(4)}% is below the ${(ECR2_RRBO_RECOVERY_REQUIREMENT.minimumMassFraction * 100).toFixed(1)}% requirement.`
              : null,
          ].filter(Boolean).join(' ');
    const trial: ECR2HeightTrial = {
      physicalHeight_m,
      numberOfCells: cells,
      deltaZ_m,
      accepted,
      bvpAccepted,
      bvpConverged: bvp.status === 'converged',
      massBalancePassed: bvp.massBalanceStatus === 'passed',
      productAromaticsMoleFraction: quality,
      residual,
      rrboRecoveryMassFraction: recovery?.rrboRecoveryMassFraction ?? null,
      recoveryResidual,
      saturatesTransferred_kg_h: recovery?.saturatesTransferred_kg_h ?? null,
      aromaticsTransferred_kg_h: recovery?.aromaticsTransferred_kg_h ?? null,
      totalRrboTransferredToExtract_kg_h: recovery?.totalRrboTransferredToExtract_kg_h ?? null,
      bvpStatus: bvp.status,
      massBalanceStatus: bvp.massBalanceStatus,
      failure,
    };
    trials.push(trial);
    if (bvpAccepted && bvp.stateVector) {
      previousAccepted = { height_m: physicalHeight_m, cells, state: bvp.stateVector };
    }
    const acceptedOrdered = trials
      .filter((entry) => entry.bvpAccepted && entry.residual !== null)
      .sort((left, right) => left.physicalHeight_m - right.physicalHeight_m);
    for (let index = 1; index < acceptedOrdered.length; index++) {
      const prior = acceptedOrdered[index - 1];
      const current = acceptedOrdered[index];
      if (current.residual! > prior.residual! + ECR2_HEIGHT_SOLVER_NUMERICS.residualMonotonicityTolerance) {
        monotonicityViolation =
          `Raffinate product-quality residual increased from ${prior.residual!.toExponential(3)} at ${prior.physicalHeight_m.toFixed(4)} m ` +
          `to ${current.residual!.toExponential(3)} at ${current.physicalHeight_m.toFixed(4)} m; minimum target height cannot be established fail-closed.`;
        break;
      }
    }
    for (let index = 1; index < acceptedOrdered.length; index++) {
      const prior = acceptedOrdered[index - 1];
      const current = acceptedOrdered[index];
      if (
        current.rrboRecoveryMassFraction !== null &&
        prior.rrboRecoveryMassFraction !== null &&
        current.rrboRecoveryMassFraction >
          prior.rrboRecoveryMassFraction + ECR2_HEIGHT_SOLVER_NUMERICS.residualMonotonicityTolerance
      ) {
        recoveryMonotonicityViolation =
          `RRBO recovery increased from ${(prior.rrboRecoveryMassFraction * 100).toFixed(5)}% at ${prior.physicalHeight_m.toFixed(4)} m ` +
          `to ${(current.rrboRecoveryMassFraction * 100).toFixed(5)}% at ${current.physicalHeight_m.toFixed(4)} m; the recovery boundary cannot be established fail-closed.`;
        break;
      }
    }
    return { trial, bvp, acceptedState: previousAccepted };
  };

  const resultFor = (
    status: ECR2HeightSizingStatus,
    summaryTrial: ECR2HeightTrial | null,
    requiredActiveHeight_m: number | null,
    lowerBracketHeight_m: number | null,
    upperBracketHeight_m: number | null,
    selected: EvaluatedTrial | null,
  ): ECR2ProgressiveHeightSolveResult => ({
    status,
    requiredActiveHeight_m,
    achievedProductAromaticsMoleFraction: summaryTrial?.productAromaticsMoleFraction ?? null,
    residual: summaryTrial?.residual ?? null,
    rrboRecoveryMassFraction: summaryTrial?.rrboRecoveryMassFraction ?? null,
    recoveryResidual: summaryTrial?.recoveryResidual ?? null,
    recoveryRequirement: ECR2_RRBO_RECOVERY_REQUIREMENT,
    bestAromaticsAtRequiredRecovery: bestAromaticsAtRequiredRecovery(),
    target: input.target,
    maximumCellHeight_m,
    searchTolerance_m: heightTolerance_m,
    lowerBracketHeight_m,
    upperBracketHeight_m,
    selectedNumberOfCells: selected?.trial.numberOfCells ?? null,
    selectedDeltaZ_m: selected?.trial.deltaZ_m ?? null,
    trials,
    selectedBvp: selected?.bvp ?? null,
    diagnostics,
  });

  const noFeasibleRecovery = (
    reachedTrial: ECR2HeightTrial,
    message: string,
  ): ECR2ProgressiveHeightSolveResult => {
    const best = bestRecoveryQualifiedTrial();
    diagnostics.push(
      'NO FEASIBLE D/H SOLUTION AT REQUIRED RRBO RECOVERY: ' +
      `${message} Best evaluated aromatic result while RRBO recovery remained at or above ` +
      `${(ECR2_RRBO_RECOVERY_REQUIREMENT.minimumMassFraction * 100).toFixed(1)}% is ` +
      (best
        ? `${(best.productAromaticsMoleFraction! * 100).toFixed(5)} mol % at ${best.physicalHeight_m.toFixed(5)} m ` +
          `with ${(best.rrboRecoveryMassFraction! * 100).toFixed(5)}% recovery.`
        : 'not available because no converged, mass-balanced recovery-qualified BVP point exists.'),
    );
    return resultFor(
      'no_feasible_recovery',
      best ?? reachedTrial,
      null,
      best?.physicalHeight_m ?? null,
      reachedTrial.physicalHeight_m,
      null,
    );
  };

  let lowerHeight = Math.min(
    maximumPhysicalHeight_m,
    Math.max(ECR2_HEIGHT_SOLVER_NUMERICS.minimumPhysicalHeight_m, heightTolerance_m),
  );
  let lower = evaluateHeight(lowerHeight);
  if (!lower.trial.bvpAccepted || lower.trial.residual === null || lower.trial.recoveryResidual === null) {
    return invalid(`The initial ${lowerHeight.toFixed(4)} m physical-height BVP is not accepted: ${lower.trial.failure}`);
  }
  if (monotonicityViolation || recoveryMonotonicityViolation) {
    return invalid(monotonicityViolation ?? recoveryMonotonicityViolation!);
  }

  if (lower.trial.accepted) {
    diagnostics.push('Both product-quality and RRBO-recovery requirements are met at the first valid physical-height trial.');
    return resultFor('target_met', lower.trial, lowerHeight, 0, lowerHeight, lower);
  }
  if (lower.trial.recoveryResidual < 0) {
    return noFeasibleRecovery(
      lower.trial,
      `The initial ${lowerHeight.toFixed(4)} m trial is already below the recovery requirement.`,
    );
  }
  let upper: EvaluatedTrial | null = null;
  for (let step = 0; step < ECR2_HEIGHT_SOLVER_NUMERICS.maximumBracketExpansions; step++) {
    const nextHeight = Math.min(maximumPhysicalHeight_m, lowerHeight * 2);
    if (nextHeight <= lowerHeight) break;
    const candidate = evaluateHeight(nextHeight);
    if (
      !candidate.trial.bvpAccepted ||
      candidate.trial.residual === null ||
      candidate.trial.recoveryResidual === null
    ) {
      return invalid(`The ${nextHeight.toFixed(4)} m continuation BVP is not accepted: ${candidate.trial.failure}`);
    }
    if (monotonicityViolation || recoveryMonotonicityViolation) {
      return invalid(monotonicityViolation ?? recoveryMonotonicityViolation!);
    }

    if (candidate.trial.accepted) {
      upper = candidate;
      break;
    }
    if (candidate.trial.recoveryResidual < 0) {
      upper = candidate;
      break;
    }
    lower = candidate;
    lowerHeight = nextHeight;
  }

  if (!upper) {
    diagnostics.push(`Target not reached by the configured ${maximumPhysicalHeight_m.toFixed(3)} m physical-height bound while RRBO recovery remained acceptable.`);
    return resultFor('target_not_met', lower.trial, null, lowerHeight, null, null);
  }

  /*
   * A product-quality pass at the first recovery-failing expansion point does
   * not prove infeasibility. The two physical requirements can cross in either
   * order inside that interval. First resolve the largest height retaining
   * recovery; only then decide whether the quality and recovery intervals
   * overlap. This bisection establishes a constraint boundary, never a
   * selected design height by itself.
   */
  if (upper.trial.recoveryResidual! < 0) {
    let recoveryLowHeight = lowerHeight;
    let recoveryLow = lower;
    let recoveryHighHeight = upper.trial.physicalHeight_m;
    let recoveryHigh = upper;
    for (let iteration = 0;
      iteration < ECR2_HEIGHT_SOLVER_NUMERICS.maximumBisectionIterations
        && recoveryHighHeight - recoveryLowHeight > heightTolerance_m;
      iteration++) {
      const midpoint = (recoveryLowHeight + recoveryHighHeight) / 2;
      const candidate = evaluateHeight(midpoint);
      if (
        !candidate.trial.bvpAccepted ||
        candidate.trial.residual === null ||
        candidate.trial.recoveryResidual === null
      ) {
        return invalid(`The ${midpoint.toFixed(4)} m recovery-boundary BVP is not accepted: ${candidate.trial.failure}`);
      }
      if (monotonicityViolation || recoveryMonotonicityViolation) {
        return invalid(monotonicityViolation ?? recoveryMonotonicityViolation!);
      }
      if (candidate.trial.recoveryResidual >= 0) {
        recoveryLowHeight = midpoint;
        recoveryLow = candidate;
      } else {
        recoveryHighHeight = midpoint;
        recoveryHigh = candidate;
      }
    }

    if (recoveryLow.trial.residual! > 0) {
      return noFeasibleRecovery(
        recoveryHigh.trial,
        `The recovery boundary is approximately ${recoveryLowHeight.toFixed(4)} m; its raffinate aromatic residual remains ${recoveryLow.trial.residual!.toExponential(3)} above target.`,
      );
    }
    diagnostics.push(
      `Recovery boundary resolved to [${recoveryLowHeight.toFixed(4)}, ${recoveryHighHeight.toFixed(4)}] m; aromatic target remains attainable before the recovery limit.`,
    );
    upper = recoveryLow;
  }

  let lowHeight = lowerHeight;
  let highHeight = upper.trial.physicalHeight_m;
  let high = upper;
  for (let iteration = 0;
    iteration < ECR2_HEIGHT_SOLVER_NUMERICS.maximumBisectionIterations
      && highHeight - lowHeight > heightTolerance_m;
    iteration++) {
    const midpoint = (lowHeight + highHeight) / 2;
    const candidate = evaluateHeight(midpoint);
    if (
      !candidate.trial.bvpAccepted ||
      candidate.trial.residual === null ||
      candidate.trial.recoveryResidual === null
    ) {
      return invalid(`The ${midpoint.toFixed(4)} m bisection BVP is not accepted: ${candidate.trial.failure}`);
    }
    if (monotonicityViolation || recoveryMonotonicityViolation) {
      return invalid(monotonicityViolation ?? recoveryMonotonicityViolation!);
    }
    if (candidate.trial.accepted) {
      highHeight = midpoint;
      high = candidate;
    } else if (candidate.trial.recoveryResidual < 0) {
      return invalid(
        `RRBO-recovery feasibility is non-monotonic inside an otherwise feasible height bracket at ${midpoint.toFixed(4)} m; minimum feasible height cannot be established fail-closed.`,
      );
    } else {
      lowHeight = midpoint;
    }
  }

  diagnostics.push(
    `Simultaneous aromatic-quality and RRBO-recovery bracket refined to [${lowHeight.toFixed(4)}, ${highHeight.toFixed(4)}] m; conservative upper bound selected.`,
  );
  return resultFor('target_met', high.trial, highHeight, lowHeight, highHeight, high);
}