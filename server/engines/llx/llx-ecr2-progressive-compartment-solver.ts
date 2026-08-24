// ═══════════════════════════════════════════════════════════════════════════
// ECR-2 — Local progressive physical-compartment calculation
//
// Independent conservative sizing/checking path. This is deliberately NOT the
// rate-based BVP: every 0.25 m physical contacting compartment approaches its
// own freshly flashed local NRTL equilibrium state by 30% on conserved
// component flows. The two counter-current feed boundaries are solved together.
// ═══════════════════════════════════════════════════════════════════════════

import { SURROGATE_MW } from '../../engine-framework/cel/coto2022-nmp-lle';
import { calculateHydrocarbonProductQuality } from '../../engine-framework/cel/product-quality-basis';
import { computeLocalNRTL, type ECR2LocalNRTLResult } from './llx-ecr2-local-nrtl';
import { ECR2_RRBO_RECOVERY_REQUIREMENT, type ECR2HeightQualityTarget } from './llx-ecr2-progressive-height-solver';

const N_COMPONENTS = 5;
const SURROGATE_MOLECULAR_WEIGHTS_G_MOL = [
  SURROGATE_MW.c12,
  SURROGATE_MW.xylene,
  SURROGATE_MW.methylnaphtalene,
  SURROGATE_MW.pyrene,
  SURROGATE_MW.nmp,
] as const;

type Vector = readonly [number, number, number, number, number];

export const ECR2_PROGRESSIVE_COMPARTMENT_BASIS = {
  physicalCompartmentHeight_m: 0.25,
  localProgressiveEfficiency: 0.30,
  method: 'counter_current_local_nrtl_equilibrium_approach_on_conserved_component_mass_flows',
  maxPhysicalCompartments: 400,
  maximumCounterCurrentSweeps: 150,
  relativeConvergenceTolerance: 1e-8,
  componentMassBalanceTolerance_kg_h: 1e-6,
  totalMassBalanceTolerance_kg_h: 5e-6,
} as const;

export type ECR2ProgressiveCompartmentStatus =
  | 'target_met'
  | 'no_feasible_recovery'
  | 'target_not_met'
  | 'not_calculable';

export interface ECR2ProgressiveCompartmentAxialProfile {
  compartmentIndex: number;
  z_bottom_m: number;
  z_top_m: number;
  rrboIncoming_kg_h: Vector;
  nmpIncoming_kg_h: Vector;
  rrboIncomingThermodynamicMoleFractions: Vector;
  nmpIncomingThermodynamicMoleFractions: Vector;
  equilibriumRrboThermodynamicMoleFractions: Vector;
  equilibriumNmpThermodynamicMoleFractions: Vector;
  equilibriumTransfer_kg_h: Vector;
  actualTransfer_kg_h: Vector;
  rrboOutgoing_kg_h: Vector;
  nmpOutgoing_kg_h: Vector;
  componentMassBalanceResidual_kg_h: Vector;
  localNrtl: {
    flashConverged: boolean;
    flashTrivial: boolean;
    thermodynamicClassification: string;
  };
}

export interface ECR2ProgressiveCompartmentTrial {
  physicalCompartmentCount: number;
  physicalHeight_m: number;
  counterCurrentConverged: boolean;
  counterCurrentSweeps: number;
  massBalancePassed: boolean;
  productAromaticsMoleFraction: number | null;
  aromaticResidual: number | null;
  rrboRecoveryMassFraction: number | null;
  recoveryResidual: number | null;
  saturatesLoss_kg_h: number | null;
  aromaticsRemoved_kg_h: number | null;
  componentMassBalance_kg_h: Vector | null;
  totalMassBalance_kg_h: number | null;
  accepted: boolean;
  failure: string | null;
  axialProfile: readonly ECR2ProgressiveCompartmentAxialProfile[];
}

export interface ECR2ProgressiveCompartmentResult {
  status: ECR2ProgressiveCompartmentStatus;
  target: ECR2HeightQualityTarget;
  basis: typeof ECR2_PROGRESSIVE_COMPARTMENT_BASIS;
  recoveryRequirement: typeof ECR2_RRBO_RECOVERY_REQUIREMENT;
  requiredPhysicalCompartmentCount: number | null;
  requiredActiveHeight_m: number | null;
  achievedProductAromaticsMoleFraction: number | null;
  aromaticResidual: number | null;
  rrboRecoveryMassFraction: number | null;
  recoveryResidual: number | null;
  selectedTrial: ECR2ProgressiveCompartmentTrial | null;
  trials: readonly ECR2ProgressiveCompartmentTrial[];
  diagnostics: readonly string[];
}

export interface ECR2ProgressiveCompartmentInput {
  target: ECR2HeightQualityTarget;
  operatingTemperature_C: number;
  rrboFeedComponentFlows_kg_h: Vector;
  nmpFeedComponentFlows_kg_h: Vector;
  physicalMolecularWeights_g_mol: Vector;
  maxPhysicalCompartments?: number;
}

interface LocalEquilibrium {
  rrboEquilibrium_kg_h: Vector;
  nmpEquilibrium_kg_h: Vector;
  rrboEquilibriumThermodynamicMoleFractions: Vector;
  nmpEquilibriumThermodynamicMoleFractions: Vector;
  localNrtl: ECR2LocalNRTLResult;
}

const asVector = (values: readonly number[]): Vector =>
  [values[0], values[1], values[2], values[3], values[4]];

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonNegativeVector = (values: readonly number[]) =>
  values.length === N_COMPONENTS && values.every((value) => finite(value) && value >= 0);

function normalizedThermodynamicMoleFractions(flows_kg_h: readonly number[]): Vector | null {
  if (!nonNegativeVector(flows_kg_h)) return null;
  const molarFlows = flows_kg_h.map(
    (flow, index) => (flow * 1000) / SURROGATE_MOLECULAR_WEIGHTS_G_MOL[index],
  );
  const total = sum(molarFlows);
  if (!(total > 0) || !finite(total)) return null;
  return asVector(molarFlows.map((flow) => flow / total));
}

function combinedThermodynamicMoleFractions(
  rrbo_kg_h: readonly number[],
  nmp_kg_h: readonly number[],
): { fractions: Vector; totalMolarFlow_mol_h: number } | null {
  if (!nonNegativeVector(rrbo_kg_h) || !nonNegativeVector(nmp_kg_h)) return null;
  const componentMolarFlows = rrbo_kg_h.map(
    (flow, index) => ((flow + nmp_kg_h[index]) * 1000) / SURROGATE_MOLECULAR_WEIGHTS_G_MOL[index],
  );
  const totalMolarFlow_mol_h = sum(componentMolarFlows);
  if (!(totalMolarFlow_mol_h > 0) || !finite(totalMolarFlow_mol_h)) return null;
  return {
    fractions: asVector(componentMolarFlows.map((flow) => flow / totalMolarFlow_mol_h)),
    totalMolarFlow_mol_h,
  };
}

function localEquilibrium(
  rrboIncoming_kg_h: Vector,
  nmpIncoming_kg_h: Vector,
  operatingTemperature_C: number,
): { value: LocalEquilibrium | null; error: string | null } {
  const x = normalizedThermodynamicMoleFractions(rrboIncoming_kg_h);
  const y = normalizedThermodynamicMoleFractions(nmpIncoming_kg_h);
  const mixed = combinedThermodynamicMoleFractions(rrboIncoming_kg_h, nmpIncoming_kg_h);
  if (!x || !y || !mixed) {
    return { value: null, error: 'Local phase flows cannot form valid non-zero thermodynamic compositions.' };
  }
  const localNrtl = computeLocalNRTL({
    x_j: x,
    y_j: y,
    z_feed: mixed.fractions,
    T_K: operatingTemperature_C + 273.15,
  });
  if (
    localNrtl.flashConverged !== true ||
    localNrtl.flashTrivial === true ||
    !localNrtl.x_eq ||
    !localNrtl.y_eq ||
    localNrtl.flashBeta === null ||
    !finite(localNrtl.flashBeta)
  ) {
    return {
      value: null,
      error: 'Local NRTL flash did not return a converged non-trivial two-phase equilibrium state.',
    };
  }

  // nrtlFlash reports beta as the raw y-phase fraction. Orient the phases by
  // the RRBO surrogate marker (saturates), then reconstruct physical component
  // mass flows from the conserved mixed surrogate component inventory.
  const rawXIsRrbo = localNrtl.x_eq[0] >= localNrtl.y_eq[0];
  const rawXFraction = 1 - localNrtl.flashBeta;
  const rawYFraction = localNrtl.flashBeta;
  const rrboFractions = rawXIsRrbo ? localNrtl.x_eq : localNrtl.y_eq;
  const nmpFractions = rawXIsRrbo ? localNrtl.y_eq : localNrtl.x_eq;
  const rrboPhaseFraction = rawXIsRrbo ? rawXFraction : rawYFraction;
  const nmpPhaseFraction = rawXIsRrbo ? rawYFraction : rawXFraction;
  const rrboEquilibrium_kg_h = rrboFractions.map(
    (fraction, index) =>
      fraction * rrboPhaseFraction * mixed.totalMolarFlow_mol_h *
      SURROGATE_MOLECULAR_WEIGHTS_G_MOL[index] / 1000,
  );
  const nmpEquilibrium_kg_h = nmpFractions.map(
    (fraction, index) =>
      fraction * nmpPhaseFraction * mixed.totalMolarFlow_mol_h *
      SURROGATE_MOLECULAR_WEIGHTS_G_MOL[index] / 1000,
  );
  if (!nonNegativeVector(rrboEquilibrium_kg_h) || !nonNegativeVector(nmpEquilibrium_kg_h)) {
    return { value: null, error: 'Local NRTL equilibrium phase split produced an invalid physical component-flow state.' };
  }
  return {
    value: {
      rrboEquilibrium_kg_h: asVector(rrboEquilibrium_kg_h),
      nmpEquilibrium_kg_h: asVector(nmpEquilibrium_kg_h),
      rrboEquilibriumThermodynamicMoleFractions: asVector(rrboFractions),
      nmpEquilibriumThermodynamicMoleFractions: asVector(nmpFractions),
      localNrtl,
    },
    error: null,
  };
}

function trialAtPhysicalCompartmentCount(
  input: ECR2ProgressiveCompartmentInput,
  physicalCompartmentCount: number,
): ECR2ProgressiveCompartmentTrial {
  const diagnostics: string[] = [];
  let rrboFaces = Array.from(
    { length: physicalCompartmentCount + 1 },
    () => [...input.rrboFeedComponentFlows_kg_h],
  );
  let nmpFaces = Array.from(
    { length: physicalCompartmentCount + 1 },
    () => [...input.nmpFeedComponentFlows_kg_h],
  );
  rrboFaces[0] = [...input.rrboFeedComponentFlows_kg_h];
  nmpFaces[physicalCompartmentCount] = [...input.nmpFeedComponentFlows_kg_h];
  let converged = false;
  let sweeps = 0;

  for (let sweep = 1; sweep <= ECR2_PROGRESSIVE_COMPARTMENT_BASIS.maximumCounterCurrentSweeps; sweep++) {
    const nextRrbo = Array.from({ length: physicalCompartmentCount + 1 }, () => Array(N_COMPONENTS).fill(0));
    const nextNmp = Array.from({ length: physicalCompartmentCount + 1 }, () => Array(N_COMPONENTS).fill(0));
    nextRrbo[0] = [...input.rrboFeedComponentFlows_kg_h];
    nextNmp[physicalCompartmentCount] = [...input.nmpFeedComponentFlows_kg_h];
    let failure: string | null = null;

    for (let index = 0; index < physicalCompartmentCount; index++) {
      const rrboIncoming = asVector(rrboFaces[index]);
      const nmpIncoming = asVector(nmpFaces[index + 1]);
      const equilibrium = localEquilibrium(rrboIncoming, nmpIncoming, input.operatingTemperature_C);
      if (!equilibrium.value) {
        failure = `Compartment ${index + 1}: ${equilibrium.error}`;
        break;
      }
      const rrboOutgoing = rrboIncoming.map(
        (flow, component) =>
          flow + ECR2_PROGRESSIVE_COMPARTMENT_BASIS.localProgressiveEfficiency *
          (equilibrium.value!.rrboEquilibrium_kg_h[component] - flow),
      );
      const nmpOutgoing = nmpIncoming.map(
        (flow, component) =>
          flow + ECR2_PROGRESSIVE_COMPARTMENT_BASIS.localProgressiveEfficiency *
          (equilibrium.value!.nmpEquilibrium_kg_h[component] - flow),
      );
      if (!nonNegativeVector(rrboOutgoing) || !nonNegativeVector(nmpOutgoing)) {
        failure = `Compartment ${index + 1}: the 30% local equilibrium approach produced a negative component flow.`;
        break;
      }
      nextRrbo[index + 1] = rrboOutgoing;
      nextNmp[index] = nmpOutgoing;
    }
    sweeps = sweep;
    if (failure) {
      return {
        physicalCompartmentCount,
        physicalHeight_m: physicalCompartmentCount * ECR2_PROGRESSIVE_COMPARTMENT_BASIS.physicalCompartmentHeight_m,
        counterCurrentConverged: false,
        counterCurrentSweeps: sweeps,
        massBalancePassed: false,
        productAromaticsMoleFraction: null,
        aromaticResidual: null,
        rrboRecoveryMassFraction: null,
        recoveryResidual: null,
        saturatesLoss_kg_h: null,
        aromaticsRemoved_kg_h: null,
        componentMassBalance_kg_h: null,
        totalMassBalance_kg_h: null,
        accepted: false,
        failure,
        axialProfile: [],
      };
    }

    let maximumRelativeChange = 0;
    for (let face = 0; face <= physicalCompartmentCount; face++) {
      for (let component = 0; component < N_COMPONENTS; component++) {
        const oldValues = [rrboFaces[face][component], nmpFaces[face][component]];
        const newValues = [nextRrbo[face][component], nextNmp[face][component]];
        for (let item = 0; item < oldValues.length; item++) {
          maximumRelativeChange = Math.max(
            maximumRelativeChange,
            Math.abs(newValues[item] - oldValues[item]) / Math.max(1, Math.abs(oldValues[item])),
          );
        }
      }
    }
    rrboFaces = nextRrbo;
    nmpFaces = nextNmp;
    if (maximumRelativeChange <= ECR2_PROGRESSIVE_COMPARTMENT_BASIS.relativeConvergenceTolerance) {
      converged = true;
      break;
    }
  }

  if (!converged) {
    return {
      physicalCompartmentCount,
      physicalHeight_m: physicalCompartmentCount * ECR2_PROGRESSIVE_COMPARTMENT_BASIS.physicalCompartmentHeight_m,
      counterCurrentConverged: false,
      counterCurrentSweeps: sweeps,
      massBalancePassed: false,
      productAromaticsMoleFraction: null,
      aromaticResidual: null,
      rrboRecoveryMassFraction: null,
      recoveryResidual: null,
      saturatesLoss_kg_h: null,
      aromaticsRemoved_kg_h: null,
      componentMassBalance_kg_h: null,
      totalMassBalance_kg_h: null,
      accepted: false,
      failure: `Counter-current local progressive sweeps did not converge within ${ECR2_PROGRESSIVE_COMPARTMENT_BASIS.maximumCounterCurrentSweeps} iterations.`,
      axialProfile: [],
    };
  }

  const axialProfile: ECR2ProgressiveCompartmentAxialProfile[] = [];
  for (let index = 0; index < physicalCompartmentCount; index++) {
    const rrboIncoming = asVector(rrboFaces[index]);
    const nmpIncoming = asVector(nmpFaces[index + 1]);
    const rrboOutgoing = asVector(rrboFaces[index + 1]);
    const nmpOutgoing = asVector(nmpFaces[index]);
    const equilibrium = localEquilibrium(rrboIncoming, nmpIncoming, input.operatingTemperature_C);
    const x = normalizedThermodynamicMoleFractions(rrboIncoming);
    const y = normalizedThermodynamicMoleFractions(nmpIncoming);
    if (!equilibrium.value || !x || !y) {
      diagnostics.push(`Compartment ${index + 1}: final local NRTL state could not be reconstructed.`);
      continue;
    }
    axialProfile.push({
      compartmentIndex: index + 1,
      z_bottom_m: index * ECR2_PROGRESSIVE_COMPARTMENT_BASIS.physicalCompartmentHeight_m,
      z_top_m: (index + 1) * ECR2_PROGRESSIVE_COMPARTMENT_BASIS.physicalCompartmentHeight_m,
      rrboIncoming_kg_h: rrboIncoming,
      nmpIncoming_kg_h: nmpIncoming,
      rrboIncomingThermodynamicMoleFractions: x,
      nmpIncomingThermodynamicMoleFractions: y,
      equilibriumRrboThermodynamicMoleFractions: equilibrium.value.rrboEquilibriumThermodynamicMoleFractions,
      equilibriumNmpThermodynamicMoleFractions: equilibrium.value.nmpEquilibriumThermodynamicMoleFractions,
      equilibriumTransfer_kg_h: asVector(rrboIncoming.map(
        (flow, component) => flow - equilibrium.value!.rrboEquilibrium_kg_h[component],
      )),
      actualTransfer_kg_h: asVector(rrboIncoming.map(
        (flow, component) => flow - rrboOutgoing[component],
      )),
      rrboOutgoing_kg_h: rrboOutgoing,
      nmpOutgoing_kg_h: nmpOutgoing,
      componentMassBalanceResidual_kg_h: asVector(rrboIncoming.map(
        (flow, component) => flow + nmpIncoming[component] - rrboOutgoing[component] - nmpOutgoing[component],
      )),
      localNrtl: {
        flashConverged: equilibrium.value.localNrtl.flashConverged === true,
        flashTrivial: equilibrium.value.localNrtl.flashTrivial === true,
        thermodynamicClassification: equilibrium.value.localNrtl.temperatureStatus.classification,
      },
    });
  }

  const raffinate = asVector(rrboFaces[physicalCompartmentCount]);
  const extract = asVector(nmpFaces[0]);
  const componentMassBalance = asVector(input.rrboFeedComponentFlows_kg_h.map(
    (flow, component) => flow + input.nmpFeedComponentFlows_kg_h[component] - raffinate[component] - extract[component],
  ));
  const totalMassBalance = sum(componentMassBalance);
  const massBalancePassed =
    Math.max(...componentMassBalance.map((value) => Math.abs(value))) <= ECR2_PROGRESSIVE_COMPARTMENT_BASIS.componentMassBalanceTolerance_kg_h &&
    Math.abs(totalMassBalance) <= ECR2_PROGRESSIVE_COMPARTMENT_BASIS.totalMassBalanceTolerance_kg_h;
  const feedHydrocarbons = sum(input.rrboFeedComponentFlows_kg_h.slice(0, 4));
  const raffinateHydrocarbons = sum(raffinate.slice(0, 4));
  let productAromaticsMoleFraction: number | null = null;
  try {
    productAromaticsMoleFraction = calculateHydrocarbonProductQuality({
      componentMoleFractions: raffinate.map(
        (flow, component) => (flow * 1000) / input.physicalMolecularWeights_g_mol[component],
      ),
      componentMassFlows_kg_h: raffinate,
    }).x_A_R_product.value;
  } catch {
    diagnostics.push('The converged progressive compartment outlet could not form a hydrocarbon-only raffinate quality basis.');
  }
  const rrboRecoveryMassFraction =
    feedHydrocarbons > 0 && finite(raffinateHydrocarbons)
      ? raffinateHydrocarbons / feedHydrocarbons
      : null;
  const aromaticResidual = productAromaticsMoleFraction === null
    ? null
    : productAromaticsMoleFraction - input.target.value;
  const recoveryResidual = rrboRecoveryMassFraction === null
    ? null
    : rrboRecoveryMassFraction - ECR2_RRBO_RECOVERY_REQUIREMENT.minimumMassFraction;
  const accepted =
    massBalancePassed &&
    productAromaticsMoleFraction !== null &&
    rrboRecoveryMassFraction !== null &&
    aromaticResidual! <= 0 &&
    recoveryResidual! >= 0;
  return {
    physicalCompartmentCount,
    physicalHeight_m: physicalCompartmentCount * ECR2_PROGRESSIVE_COMPARTMENT_BASIS.physicalCompartmentHeight_m,
    counterCurrentConverged: true,
    counterCurrentSweeps: sweeps,
    massBalancePassed,
    productAromaticsMoleFraction,
    aromaticResidual,
    rrboRecoveryMassFraction,
    recoveryResidual,
    saturatesLoss_kg_h: input.rrboFeedComponentFlows_kg_h[0] - raffinate[0],
    aromaticsRemoved_kg_h:
      sum(input.rrboFeedComponentFlows_kg_h.slice(1, 4)) - sum(raffinate.slice(1, 4)),
    componentMassBalance_kg_h: componentMassBalance,
    totalMassBalance_kg_h: totalMassBalance,
    accepted,
    failure: accepted
      ? null
      : !massBalancePassed
        ? 'Counter-current local progressive solution failed the component/global mass-balance acceptance tolerance.'
        : [
            aromaticResidual !== null && aromaticResidual > 0
              ? `Raffinate aromatic residual ${aromaticResidual.toExponential(3)} is above target.`
              : null,
            recoveryResidual !== null && recoveryResidual < 0
              ? `RRBO recovery ${(rrboRecoveryMassFraction! * 100).toFixed(4)}% is below the ${(ECR2_RRBO_RECOVERY_REQUIREMENT.minimumMassFraction * 100).toFixed(1)}% requirement.`
              : null,
          ].filter(Boolean).join(' '),
    axialProfile,
  };
}

export function solveECR2ProgressiveCompartments(
  input: ECR2ProgressiveCompartmentInput,
): ECR2ProgressiveCompartmentResult {
  const diagnostics = [
    'Independent local progressive physical-compartment calculation; does not change the existing rate-based BVP.',
    `Each physical compartment is ${ECR2_PROGRESSIVE_COMPARTMENT_BASIS.physicalCompartmentHeight_m.toFixed(2)} m and applies ${(ECR2_PROGRESSIVE_COMPARTMENT_BASIS.localProgressiveEfficiency * 100).toFixed(0)}% of its freshly calculated local NRTL equilibrium component-flow change.`,
    'Counter-current RRBO and fresh-NMP boundaries are solved together by repeated full-field sweeps; no local equilibrium state is carried forward without recalculation.',
  ];
  const empty = (status: ECR2ProgressiveCompartmentStatus, message: string): ECR2ProgressiveCompartmentResult => ({
    status,
    target: input.target,
    basis: ECR2_PROGRESSIVE_COMPARTMENT_BASIS,
    recoveryRequirement: ECR2_RRBO_RECOVERY_REQUIREMENT,
    requiredPhysicalCompartmentCount: null,
    requiredActiveHeight_m: null,
    achievedProductAromaticsMoleFraction: null,
    aromaticResidual: null,
    rrboRecoveryMassFraction: null,
    recoveryResidual: null,
    selectedTrial: null,
    trials: [],
    diagnostics: [...diagnostics, message],
  });
  if (
    !finite(input.operatingTemperature_C) ||
    !finite(input.target.value) ||
    input.target.value <= 0 ||
    input.target.value >= 1 ||
    !nonNegativeVector(input.rrboFeedComponentFlows_kg_h) ||
    !nonNegativeVector(input.nmpFeedComponentFlows_kg_h) ||
    !input.physicalMolecularWeights_g_mol.every((value) => finite(value) && value > 0)
  ) {
    return empty('not_calculable', 'Progressive physical-compartment calculation has invalid temperature, target, feed flow, or molecular-weight inputs.');
  }
  const maximum = input.maxPhysicalCompartments ?? ECR2_PROGRESSIVE_COMPARTMENT_BASIS.maxPhysicalCompartments;
  if (!Number.isInteger(maximum) || maximum < 1) {
    return empty('not_calculable', 'Progressive physical-compartment calculation has an invalid compartment safety bound.');
  }

  const trials: ECR2ProgressiveCompartmentTrial[] = [];
  for (let count = 1; count <= maximum; count++) {
    const trial = trialAtPhysicalCompartmentCount(input, count);
    trials.push(trial);
    if (!trial.counterCurrentConverged || !trial.massBalancePassed) {
      return {
        ...empty('not_calculable', trial.failure ?? 'A physical-compartment counter-current solution was not accepted.'),
        trials,
      };
    }
    if (trial.accepted) {
      diagnostics.push(
        `First simultaneous product-quality/recovery physical configuration is ${count} compartment(s), H=${trial.physicalHeight_m.toFixed(2)} m.`,
      );
      return {
        status: 'target_met',
        target: input.target,
        basis: ECR2_PROGRESSIVE_COMPARTMENT_BASIS,
        recoveryRequirement: ECR2_RRBO_RECOVERY_REQUIREMENT,
        requiredPhysicalCompartmentCount: count,
        requiredActiveHeight_m: trial.physicalHeight_m,
        achievedProductAromaticsMoleFraction: trial.productAromaticsMoleFraction,
        aromaticResidual: trial.aromaticResidual,
        rrboRecoveryMassFraction: trial.rrboRecoveryMassFraction,
        recoveryResidual: trial.recoveryResidual,
        selectedTrial: trial,
        trials,
        diagnostics,
      };
    }
    if (trial.recoveryResidual !== null && trial.recoveryResidual < 0) {
      return {
        status: 'no_feasible_recovery',
        target: input.target,
        basis: ECR2_PROGRESSIVE_COMPARTMENT_BASIS,
        recoveryRequirement: ECR2_RRBO_RECOVERY_REQUIREMENT,
        requiredPhysicalCompartmentCount: null,
        requiredActiveHeight_m: null,
        achievedProductAromaticsMoleFraction: trial.productAromaticsMoleFraction,
        aromaticResidual: trial.aromaticResidual,
        rrboRecoveryMassFraction: trial.rrboRecoveryMassFraction,
        recoveryResidual: trial.recoveryResidual,
        selectedTrial: null,
        trials,
        diagnostics: [
          ...diagnostics,
          `NO FEASIBLE HEIGHT AT REQUIRED PRODUCT QUALITY AND RRBO RECOVERY: recovery fell below ${(ECR2_RRBO_RECOVERY_REQUIREMENT.minimumMassFraction * 100).toFixed(1)}% at ${count} physical compartment(s); later heights were not evaluated.`,
        ],
      };
    }
  }
  return {
    status: 'target_not_met',
    target: input.target,
    basis: ECR2_PROGRESSIVE_COMPARTMENT_BASIS,
    recoveryRequirement: ECR2_RRBO_RECOVERY_REQUIREMENT,
    requiredPhysicalCompartmentCount: null,
    requiredActiveHeight_m: null,
    achievedProductAromaticsMoleFraction: trials.at(-1)?.productAromaticsMoleFraction ?? null,
    aromaticResidual: trials.at(-1)?.aromaticResidual ?? null,
    rrboRecoveryMassFraction: trials.at(-1)?.rrboRecoveryMassFraction ?? null,
    recoveryResidual: trials.at(-1)?.recoveryResidual ?? null,
    selectedTrial: null,
    trials,
    diagnostics: [
      ...diagnostics,
      `The physical-compartment target was not met within the numerical safety bound of ${maximum} compartments; no active height was selected.`,
    ],
  };
}