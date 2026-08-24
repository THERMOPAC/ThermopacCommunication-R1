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

export type ECR2HeightSizingStatus =
  | 'target_met'
  | 'target_not_met'
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
  productAromaticsMoleFraction: number | null;
  residual: number | null;
  bvpStatus: ECR2CounterCurrentBVPResult['status'];
  massBalanceStatus: ECR2CounterCurrentBVPResult['massBalanceStatus'];
  failure: string | null;
}

export interface ECR2ProgressiveHeightSolveResult {
  status: ECR2HeightSizingStatus;
  requiredActiveHeight_m: number | null;
  achievedProductAromaticsMoleFraction: number | null;
  residual: number | null;
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
  ];
  const trials: ECR2HeightTrial[] = [];

  const invalid = (message: string): ECR2ProgressiveHeightSolveResult => ({
    status: 'not_calculable',
    requiredActiveHeight_m: null,
    achievedProductAromaticsMoleFraction: null,
    residual: null,
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
    const accepted = quality !== null;
    const residual = quality === null ? null : quality - input.target.value;
    const trial: ECR2HeightTrial = {
      physicalHeight_m,
      numberOfCells: cells,
      deltaZ_m,
      accepted,
      productAromaticsMoleFraction: quality,
      residual,
      bvpStatus: bvp.status,
      massBalanceStatus: bvp.massBalanceStatus,
      failure: accepted ? null : (bvp.failure?.message ?? 'BVP did not reach accepted convergence and global mass balance.'),
    };
    trials.push(trial);
    if (accepted && bvp.stateVector) {
      previousAccepted = { height_m: physicalHeight_m, cells, state: bvp.stateVector };
    }
    const acceptedOrdered = trials
      .filter((entry) => entry.accepted && entry.residual !== null)
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
    return { trial, bvp, acceptedState: previousAccepted };
  };

  let lowerHeight = Math.min(
    maximumPhysicalHeight_m,
    Math.max(ECR2_HEIGHT_SOLVER_NUMERICS.minimumPhysicalHeight_m, heightTolerance_m),
  );
  let lower: EvaluatedTrial | null = null;
  for (let step = 0; step <= ECR2_HEIGHT_SOLVER_NUMERICS.maximumBracketExpansions; step++) {
    const candidate = evaluateHeight(lowerHeight);
    if (candidate.trial.accepted && candidate.trial.residual !== null) {
      lower = candidate;
      break;
    }
    return invalid(`The initial ${lowerHeight.toFixed(4)} m physical-height BVP is not accepted: ${candidate.trial.failure}`);
  }
  if (!lower) return invalid('No accepted physical-height BVP was established during initial physical-height expansion.');
  if (monotonicityViolation) return invalid(monotonicityViolation);

  if (lower.trial.residual <= 0) {
    diagnostics.push('The product target is met at the first accepted physical-height trial.');
    return {
      status: 'target_met',
      requiredActiveHeight_m: lowerHeight,
      achievedProductAromaticsMoleFraction: lower.trial.productAromaticsMoleFraction,
      residual: lower.trial.residual,
      target: input.target,
      maximumCellHeight_m,
      searchTolerance_m: heightTolerance_m,
      lowerBracketHeight_m: trials.some((trial) => !trial.accepted) ? null : 0,
      upperBracketHeight_m: lowerHeight,
      selectedNumberOfCells: lower.trial.numberOfCells,
      selectedDeltaZ_m: lower.trial.deltaZ_m,
      trials,
      selectedBvp: lower.bvp,
      diagnostics,
    };
  }

  let upper: EvaluatedTrial | null = null;
  for (let step = 0; step < ECR2_HEIGHT_SOLVER_NUMERICS.maximumBracketExpansions; step++) {
    const nextHeight = Math.min(maximumPhysicalHeight_m, lowerHeight * 2);
    if (nextHeight <= lowerHeight) break;
    const candidate = evaluateHeight(nextHeight);
    if (!candidate.trial.accepted || candidate.trial.residual === null) {
      return invalid(`The ${nextHeight.toFixed(4)} m continuation BVP is not accepted: ${candidate.trial.failure}`);
    }
    if (monotonicityViolation) return invalid(monotonicityViolation);
    if (candidate.trial.residual <= 0) {
      upper = candidate;
      break;
    }
    lower = candidate;
    lowerHeight = nextHeight;
  }

  if (!upper) {
    diagnostics.push(`Target not reached by the configured ${maximumPhysicalHeight_m.toFixed(3)} m physical-height bound.`);
    return {
      status: 'target_not_met',
      requiredActiveHeight_m: null,
      achievedProductAromaticsMoleFraction: lower.trial.productAromaticsMoleFraction,
      residual: lower.trial.residual,
      target: input.target,
      maximumCellHeight_m,
      searchTolerance_m: heightTolerance_m,
      lowerBracketHeight_m: lowerHeight,
      upperBracketHeight_m: null,
      selectedNumberOfCells: null,
      selectedDeltaZ_m: null,
      trials,
      selectedBvp: null,
      diagnostics,
    };
  }

  let lowHeight = lowerHeight;
  let low = lower;
  let highHeight = upper.trial.physicalHeight_m;
  let high = upper;
  for (let iteration = 0;
    iteration < ECR2_HEIGHT_SOLVER_NUMERICS.maximumBisectionIterations
      && highHeight - lowHeight > heightTolerance_m;
    iteration++) {
    const midpoint = (lowHeight + highHeight) / 2;
    const candidate = evaluateHeight(midpoint);
    if (!candidate.trial.accepted || candidate.trial.residual === null) {
      return invalid(`The ${midpoint.toFixed(4)} m bisection BVP is not accepted: ${candidate.trial.failure}`);
    }
    if (monotonicityViolation) return invalid(monotonicityViolation);
    if (candidate.trial.residual <= 0) {
      highHeight = midpoint;
      high = candidate;
    } else {
      lowHeight = midpoint;
      low = candidate;
    }
  }

  diagnostics.push(
    `Target bracket refined to [${lowHeight.toFixed(4)}, ${highHeight.toFixed(4)}] m; conservative upper bound selected.`,
  );
  return {
    status: 'target_met',
    requiredActiveHeight_m: highHeight,
    achievedProductAromaticsMoleFraction: high.trial.productAromaticsMoleFraction,
    residual: high.trial.residual,
    target: input.target,
    maximumCellHeight_m,
    searchTolerance_m: heightTolerance_m,
    lowerBracketHeight_m: lowHeight,
    upperBracketHeight_m: highHeight,
    selectedNumberOfCells: high.trial.numberOfCells,
    selectedDeltaZ_m: high.trial.deltaZ_m,
    trials,
    selectedBvp: high.bvp,
    diagnostics,
  };
}