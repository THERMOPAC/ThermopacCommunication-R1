// ═══════════════════════════════════════════════════════════════════════════
// ECR-2 — Same-specification ideal equilibrium-stage cascade
//
// This is deliberately distinct from both the C2 full-phase cascade and the
// 30% physical-compartment calculation. Every stage reaches its own complete
// NRTL equilibrium split and the product/recovery gates use the ECR-2 physical
// hydrocarbon-only basis.
// ═══════════════════════════════════════════════════════════════════════════

import { SURROGATE_MW } from '../../engine-framework/cel/coto2022-nmp-lle';
import { calculateHydrocarbonProductQuality } from '../../engine-framework/cel/product-quality-basis';
import { computeLocalNRTL, type ECR2LocalNRTLResult } from './llx-ecr2-local-nrtl';
import {
  ECR2_RRBO_RECOVERY_REQUIREMENT,
  type ECR2HeightQualityTarget,
} from './llx-ecr2-progressive-height-solver';

const N_COMPONENTS = 5;
const SURROGATE_MOLECULAR_WEIGHTS_G_MOL = [
  SURROGATE_MW.c12,
  SURROGATE_MW.xylene,
  SURROGATE_MW.methylnaphtalene,
  SURROGATE_MW.pyrene,
  SURROGATE_MW.nmp,
] as const;
const COMPONENT_LABELS = ['Sat', 'Mono', 'Di', 'Poly', 'NMP'] as const;

type Vector = readonly [number, number, number, number, number];
const asVector = (values: readonly number[]): Vector => [values[0], values[1], values[2], values[3], values[4]];
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonNegativeVector = (values: readonly number[]) =>
  values.length === N_COMPONENTS && values.every((value) => finite(value) && value >= 0);

export const ECR2_IDEAL_STAGE_CASCADE_BASIS = {
  method: 'blocked_pending_governed_coto_surrogate_to_physical_pseudocomponent_mapping',
  maximumIdealStages: 40,
  maximumCounterCurrentSweeps: 300,
  relativeConvergenceTolerance: 1e-8,
  componentMassBalanceTolerance_kg_h: 1e-6,
  totalMassBalanceTolerance_kg_h: 5e-6,
  productQualityBasis: 'hydrocarbon_only_physical_outlet',
  molecularWeightArchitecture: 'physical_and_coto_surrogate_mw_define_materially_different_mole_coordinates__no_nrtl_stage_calculation_until_mapping_is_governed',
} as const;

export type ECR2IdealStageCascadeStatus =
  | 'target_met'
  | 'no_feasible_theoretical_stage_cascade'
  | 'not_calculable'
  | 'thermodynamic_surrogate_to_physical_mapping_not_closed';

export interface ECR2IdealStageAxialProfile {
  stageNumber: number;
  rrboIncoming_kg_h: Vector;
  nmpIncoming_kg_h: Vector;
  rrboOutgoing_kg_h: Vector;
  nmpOutgoing_kg_h: Vector;
  overallIncomingPhysicalMolarFlows_mol_h: Vector;
  overallIncomingThermodynamicMoleFractions: Vector;
  rrboEquilibriumThermodynamicMoleFractions: Vector;
  nmpEquilibriumThermodynamicMoleFractions: Vector;
  nmpRichPhaseFraction_beta: number;
  rrboRichPhaseFraction: number;
  rrboOutgoingPhysicalMolarFlows_mol_h: Vector;
  nmpOutgoingPhysicalMolarFlows_mol_h: Vector;
  componentMassBalanceResidual_kg_h: Vector;
  localNrtl: {
    flashConverged: boolean;
    flashTrivial: boolean;
    thermodynamicClassification: string;
  };
}

export interface ECR2IdealStageMolecularWeightBasis {
  componentOrder: readonly ['Sat', 'Mono', 'Di', 'Poly', 'NMP'];
  physicalMolecularWeights_g_mol: Vector;
  surrogateMolecularWeights_g_mol: Vector;
  physicalBasisUse: 'physical pseudo-component material-balance and reporting basis; it does not define Coto/NRTL mole fractions without a governed mapping';
  surrogateBasisUse: 'Coto NRTL component-identity and fitted-mole-coordinate basis; it does not define project physical pseudo-component moles';
}

export interface ECR2ThermodynamicSurrogatePhysicalMappingAudit {
  status: 'not_closed';
  statusLabel: 'THERMODYNAMIC SURROGATE-TO-PHYSICAL MAPPING NOT CLOSED';
  resolutionRequired: string;
  componentMappings: readonly {
    physicalPseudoComponent: 'Sat' | 'Mono' | 'Di' | 'Poly' | 'NMP';
    cotoSurrogate: 'n-dodecane' | '1,4-xylene' | '1-methylnaphthalene' | 'pyrene' | 'NMP';
    physicalMolecularWeight_g_mol: number;
    surrogateMolecularWeight_g_mol: number;
    hypotheticalMassEquivalentSurrogateMolesPerPhysicalMole: number;
    conservedQuantity: string;
  }[];
  feedCoordinateAudit: {
    componentFeedMassFlows_kg_h: Vector;
    physicalPseudoComponentMolarFlows_mol_h: Vector;
    nrtlZFromPhysicalPseudoComponentMW: Vector;
    surrogateComponentMolarFlows_mol_h: Vector;
    nrtlZFromSurrogateMW: Vector;
  } | null;
}

export interface ECR2IdealStageCascadeTrial {
  idealStageCount: number;
  counterCurrentConverged: boolean;
  counterCurrentSweeps: number;
  massBalancePassed: boolean;
  productAromaticsMoleFraction: number | null;
  aromaticResidual: number | null;
  rrboRecoveryMassFraction: number | null;
  recoveryResidual: number | null;
  componentMassBalance_kg_h: Vector | null;
  totalMassBalance_kg_h: number | null;
  accepted: boolean;
  failure: string | null;
  stageProfile: readonly ECR2IdealStageAxialProfile[];
}

export interface ECR2IdealStageCascadeResult {
  status: ECR2IdealStageCascadeStatus;
  statusLabel: string;
  target: ECR2HeightQualityTarget;
  recoveryRequirement: typeof ECR2_RRBO_RECOVERY_REQUIREMENT;
  basis: typeof ECR2_IDEAL_STAGE_CASCADE_BASIS;
  molecularWeightBasis: ECR2IdealStageMolecularWeightBasis;
  thermodynamicSurrogatePhysicalMapping: ECR2ThermodynamicSurrogatePhysicalMappingAudit;
  establishedTheoreticalStages: number | null;
  achievedProductAromaticsMoleFraction: number | null;
  aromaticResidual: number | null;
  rrboRecoveryMassFraction: number | null;
  recoveryResidual: number | null;
  selectedTrial: ECR2IdealStageCascadeTrial | null;
  trials: readonly ECR2IdealStageCascadeTrial[];
  diagnostics: readonly string[];
}

const COTO_SURROGATE_LABELS = [
  'n-dodecane',
  '1,4-xylene',
  '1-methylnaphthalene',
  'pyrene',
  'NMP',
] as const;

function buildThermodynamicSurrogatePhysicalMappingAudit(
  input: ECR2IdealStageCascadeInput,
): ECR2ThermodynamicSurrogatePhysicalMappingAudit {
  const physicalMolecularWeights = input.physicalMolecularWeights_g_mol;
  const surrogateMolecularWeights = asVector(SURROGATE_MOLECULAR_WEIGHTS_G_MOL);
  const feedMassFlows = asVector(input.rrboFeedComponentFlows_kg_h.map(
    (flow, index) => flow + input.nmpFeedComponentFlows_kg_h[index],
  ));
  const validMolecularWeights = physicalMolecularWeights.every((value) => finite(value) && value > 0);
  const physicalMolarFlows = validMolecularWeights
    ? asVector(feedMassFlows.map((flow, index) => (flow * 1000) / physicalMolecularWeights[index]))
    : null;
  const surrogateMolarFlows = asVector(feedMassFlows.map(
    (flow, index) => (flow * 1000) / surrogateMolecularWeights[index],
  ));
  const physicalTotal = physicalMolarFlows ? sum(physicalMolarFlows) : 0;
  const surrogateTotal = sum(surrogateMolarFlows);

  return {
    status: 'not_closed',
    statusLabel: 'THERMODYNAMIC SURROGATE-TO-PHYSICAL MAPPING NOT CLOSED',
    resolutionRequired: 'A governed, experimentally supported mapping must define what amount of each RRBO pseudo-component is represented by its Coto surrogate and how surrogate phase allocations convert back to physical component moles and mass. The present one-to-one class analogy is not that mapping.',
    componentMappings: COMPONENT_LABELS.map((physicalPseudoComponent, index) => ({
      physicalPseudoComponent,
      cotoSurrogate: COTO_SURROGATE_LABELS[index],
      physicalMolecularWeight_g_mol: physicalMolecularWeights[index],
      surrogateMolecularWeight_g_mol: surrogateMolecularWeights[index],
      hypotheticalMassEquivalentSurrogateMolesPerPhysicalMole:
        validMolecularWeights ? physicalMolecularWeights[index] / surrogateMolecularWeights[index] : NaN,
      conservedQuantity: index === 4
        ? 'NMP is the same identified component and has the same MW; physical and surrogate moles coincide.'
        : 'Unresolved. No validated physical-pseudo-mole ↔ Coto-surrogate-mole conversion is available; a mass-equivalent scaling would preserve mass only, not the fitted surrogate-mole identity.',
    })),
    feedCoordinateAudit: physicalMolarFlows && physicalTotal > 0 && surrogateTotal > 0
      ? {
          componentFeedMassFlows_kg_h: feedMassFlows,
          physicalPseudoComponentMolarFlows_mol_h: physicalMolarFlows,
          nrtlZFromPhysicalPseudoComponentMW: asVector(physicalMolarFlows.map((flow) => flow / physicalTotal)),
          surrogateComponentMolarFlows_mol_h: surrogateMolarFlows,
          nrtlZFromSurrogateMW: asVector(surrogateMolarFlows.map((flow) => flow / surrogateTotal)),
        }
      : null,
  };
}

export interface ECR2IdealStageCascadeInput {
  target: ECR2HeightQualityTarget;
  operatingTemperature_C: number;
  rrboFeedComponentFlows_kg_h: Vector;
  nmpFeedComponentFlows_kg_h: Vector;
  physicalMolecularWeights_g_mol: Vector;
  maxIdealStages?: number;
}

interface LocalEquilibrium {
  rrboEquilibrium_kg_h: Vector;
  nmpEquilibrium_kg_h: Vector;
  overallPhysicalMolarFlows_mol_h: Vector;
  overallThermodynamicMoleFractions: Vector;
  rrboEquilibriumThermodynamicMoleFractions: Vector;
  nmpEquilibriumThermodynamicMoleFractions: Vector;
  rrboPhaseFraction: number;
  nmpPhaseFraction: number;
  rrboEquilibriumPhysicalMolarFlows_mol_h: Vector;
  nmpEquilibriumPhysicalMolarFlows_mol_h: Vector;
  localNrtl: ECR2LocalNRTLResult;
}

function physicalComponentMolarFlows(
  flows_kg_h: readonly number[],
  physicalMolecularWeights_g_mol: Vector,
): Vector | null {
  if (!nonNegativeVector(flows_kg_h)) return null;
  if (!physicalMolecularWeights_g_mol.every((value) => finite(value) && value > 0)) return null;
  const molarFlows = flows_kg_h.map(
    (flow, index) => (flow * 1000) / physicalMolecularWeights_g_mol[index],
  );
  return nonNegativeVector(molarFlows) ? asVector(molarFlows) : null;
}

function normalizedThermodynamicMoleFractions(
  flows_kg_h: readonly number[],
  physicalMolecularWeights_g_mol: Vector,
): Vector | null {
  const molarFlows = physicalComponentMolarFlows(flows_kg_h, physicalMolecularWeights_g_mol);
  if (!molarFlows) return null;
  const total = sum(molarFlows);
  return total > 0 && finite(total) ? asVector(molarFlows.map((flow) => flow / total)) : null;
}

function combinedThermodynamicMoleFractions(
  rrbo_kg_h: readonly number[],
  nmp_kg_h: readonly number[],
  physicalMolecularWeights_g_mol: Vector,
): { fractions: Vector; totalMolarFlow_mol_h: number } | null {
  if (!nonNegativeVector(rrbo_kg_h) || !nonNegativeVector(nmp_kg_h)) return null;
  const combinedMassFlows = rrbo_kg_h.map((flow, index) => flow + nmp_kg_h[index]);
  const componentMolarFlows = physicalComponentMolarFlows(
    combinedMassFlows,
    physicalMolecularWeights_g_mol,
  );
  if (!componentMolarFlows) return null;
  const totalMolarFlow_mol_h = sum(componentMolarFlows);
  return totalMolarFlow_mol_h > 0 && finite(totalMolarFlow_mol_h)
    ? { fractions: asVector(componentMolarFlows.map((flow) => flow / totalMolarFlow_mol_h)), totalMolarFlow_mol_h }
    : null;
}

function localEquilibrium(
  rrboIncoming_kg_h: Vector,
  nmpIncoming_kg_h: Vector,
  operatingTemperature_C: number,
  physicalMolecularWeights_g_mol: Vector,
): { value: LocalEquilibrium | null; error: string | null } {
  const x = normalizedThermodynamicMoleFractions(
    rrboIncoming_kg_h,
    physicalMolecularWeights_g_mol,
  );
  const y = normalizedThermodynamicMoleFractions(
    nmpIncoming_kg_h,
    physicalMolecularWeights_g_mol,
  );
  const mixed = combinedThermodynamicMoleFractions(
    rrboIncoming_kg_h,
    nmpIncoming_kg_h,
    physicalMolecularWeights_g_mol,
  );
  if (!x || !y || !mixed) return { value: null, error: 'Stage flows cannot form valid non-zero thermodynamic compositions.' };
  const localNrtl = computeLocalNRTL({ x_j: x, y_j: y, z_feed: mixed.fractions, T_K: operatingTemperature_C + 273.15 });
  if (!localNrtl.flashConverged || localNrtl.flashTrivial || !localNrtl.x_eq || !localNrtl.y_eq ||
      localNrtl.flashBeta === null || !finite(localNrtl.flashBeta)) {
    return { value: null, error: 'NRTL flash did not return a converged non-trivial equilibrium phase split.' };
  }
  const rawXIsRrbo = localNrtl.x_eq[0] >= localNrtl.y_eq[0];
  const rrboFractions = rawXIsRrbo ? localNrtl.x_eq : localNrtl.y_eq;
  const nmpFractions = rawXIsRrbo ? localNrtl.y_eq : localNrtl.x_eq;
  const rrboPhaseFraction = rawXIsRrbo ? 1 - localNrtl.flashBeta : localNrtl.flashBeta;
  const nmpPhaseFraction = rawXIsRrbo ? localNrtl.flashBeta : 1 - localNrtl.flashBeta;
  const rrboEquilibriumMolarFlows = rrboFractions.map(
    (fraction) => fraction * rrboPhaseFraction * mixed.totalMolarFlow_mol_h,
  );
  const nmpEquilibriumMolarFlows = nmpFractions.map(
    (fraction) => fraction * nmpPhaseFraction * mixed.totalMolarFlow_mol_h,
  );
  const rrboEquilibrium = rrboEquilibriumMolarFlows.map(
    (flow, index) => (flow * physicalMolecularWeights_g_mol[index]) / 1000,
  );
  const nmpEquilibrium = nmpEquilibriumMolarFlows.map(
    (flow, index) => (flow * physicalMolecularWeights_g_mol[index]) / 1000,
  );
  if (
    !nonNegativeVector(rrboEquilibriumMolarFlows) ||
    !nonNegativeVector(nmpEquilibriumMolarFlows) ||
    !nonNegativeVector(rrboEquilibrium) ||
    !nonNegativeVector(nmpEquilibrium)
  ) {
    return { value: null, error: 'NRTL phase split produced an invalid physical component-flow state.' };
  }
  return {
    value: {
      rrboEquilibrium_kg_h: asVector(rrboEquilibrium),
      nmpEquilibrium_kg_h: asVector(nmpEquilibrium),
      overallPhysicalMolarFlows_mol_h: asVector(mixed.fractions.map(
        (fraction) => fraction * mixed.totalMolarFlow_mol_h,
      )),
      overallThermodynamicMoleFractions: mixed.fractions,
      rrboEquilibriumThermodynamicMoleFractions: asVector(rrboFractions),
      nmpEquilibriumThermodynamicMoleFractions: asVector(nmpFractions),
      rrboPhaseFraction,
      nmpPhaseFraction,
      rrboEquilibriumPhysicalMolarFlows_mol_h: asVector(rrboEquilibriumMolarFlows),
      nmpEquilibriumPhysicalMolarFlows_mol_h: asVector(nmpEquilibriumMolarFlows),
      localNrtl,
    },
    error: null,
  };
}

function failedTrial(idealStageCount: number, sweeps: number, failure: string): ECR2IdealStageCascadeTrial {
  return {
    idealStageCount, counterCurrentConverged: false, counterCurrentSweeps: sweeps, massBalancePassed: false,
    productAromaticsMoleFraction: null, aromaticResidual: null, rrboRecoveryMassFraction: null, recoveryResidual: null,
    componentMassBalance_kg_h: null, totalMassBalance_kg_h: null, accepted: false, failure, stageProfile: [],
  };
}

function trialAtIdealStageCount(
  input: ECR2IdealStageCascadeInput,
  idealStageCount: number,
): ECR2IdealStageCascadeTrial {
  let rrboFaces = Array.from({ length: idealStageCount + 1 }, () => [...input.rrboFeedComponentFlows_kg_h]);
  let nmpFaces = Array.from({ length: idealStageCount + 1 }, () => [...input.nmpFeedComponentFlows_kg_h]);
  rrboFaces[0] = [...input.rrboFeedComponentFlows_kg_h];
  nmpFaces[idealStageCount] = [...input.nmpFeedComponentFlows_kg_h];
  let sweeps = 0;
  let converged = false;

  for (let sweep = 1; sweep <= ECR2_IDEAL_STAGE_CASCADE_BASIS.maximumCounterCurrentSweeps; sweep++) {
    const nextRrbo = Array.from({ length: idealStageCount + 1 }, () => Array(N_COMPONENTS).fill(0));
    const nextNmp = Array.from({ length: idealStageCount + 1 }, () => Array(N_COMPONENTS).fill(0));
    nextRrbo[0] = [...input.rrboFeedComponentFlows_kg_h];
    nextNmp[idealStageCount] = [...input.nmpFeedComponentFlows_kg_h];
    for (let index = 0; index < idealStageCount; index++) {
      const equilibrium = localEquilibrium(
        asVector(rrboFaces[index]),
        asVector(nmpFaces[index + 1]),
        input.operatingTemperature_C,
        input.physicalMolecularWeights_g_mol,
      );
      if (!equilibrium.value) return failedTrial(idealStageCount, sweep, `Ideal stage ${index + 1}: ${equilibrium.error}`);
      nextRrbo[index + 1] = [...equilibrium.value.rrboEquilibrium_kg_h];
      nextNmp[index] = [...equilibrium.value.nmpEquilibrium_kg_h];
    }
    sweeps = sweep;
    let maximumRelativeChange = 0;
    for (let face = 0; face <= idealStageCount; face++) {
      for (let component = 0; component < N_COMPONENTS; component++) {
        for (const [before, after] of [
          [rrboFaces[face][component], nextRrbo[face][component]],
          [nmpFaces[face][component], nextNmp[face][component]],
        ]) maximumRelativeChange = Math.max(maximumRelativeChange, Math.abs(after - before) / Math.max(1, Math.abs(before)));
      }
    }
    rrboFaces = nextRrbo;
    nmpFaces = nextNmp;
    if (maximumRelativeChange <= ECR2_IDEAL_STAGE_CASCADE_BASIS.relativeConvergenceTolerance) {
      converged = true;
      break;
    }
  }
  if (!converged) {
    return failedTrial(
      idealStageCount,
      sweeps,
      `Counter-current ideal-stage cascade did not converge within ${ECR2_IDEAL_STAGE_CASCADE_BASIS.maximumCounterCurrentSweeps} sweeps.`,
    );
  }

  const stageProfile: ECR2IdealStageAxialProfile[] = [];
  for (let index = 0; index < idealStageCount; index++) {
    const rrboIncoming = asVector(rrboFaces[index]);
    const nmpIncoming = asVector(nmpFaces[index + 1]);
    const equilibrium = localEquilibrium(
      rrboIncoming,
      nmpIncoming,
      input.operatingTemperature_C,
      input.physicalMolecularWeights_g_mol,
    );
    if (!equilibrium.value) return failedTrial(idealStageCount, sweeps, `Ideal stage ${index + 1}: final equilibrium state could not be reconstructed.`);
    const rrboOutgoing = asVector(rrboFaces[index + 1]);
    const nmpOutgoing = asVector(nmpFaces[index]);
    stageProfile.push({
      stageNumber: index + 1,
      rrboIncoming_kg_h: rrboIncoming,
      nmpIncoming_kg_h: nmpIncoming,
      rrboOutgoing_kg_h: rrboOutgoing,
      nmpOutgoing_kg_h: nmpOutgoing,
      overallIncomingPhysicalMolarFlows_mol_h: equilibrium.value.overallPhysicalMolarFlows_mol_h,
      overallIncomingThermodynamicMoleFractions: equilibrium.value.overallThermodynamicMoleFractions,
      rrboEquilibriumThermodynamicMoleFractions: equilibrium.value.rrboEquilibriumThermodynamicMoleFractions,
      nmpEquilibriumThermodynamicMoleFractions: equilibrium.value.nmpEquilibriumThermodynamicMoleFractions,
      nmpRichPhaseFraction_beta: equilibrium.value.nmpPhaseFraction,
      rrboRichPhaseFraction: equilibrium.value.rrboPhaseFraction,
      rrboOutgoingPhysicalMolarFlows_mol_h: equilibrium.value.rrboEquilibriumPhysicalMolarFlows_mol_h,
      nmpOutgoingPhysicalMolarFlows_mol_h: equilibrium.value.nmpEquilibriumPhysicalMolarFlows_mol_h,
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

  const raffinate = asVector(rrboFaces[idealStageCount]);
  const extract = asVector(nmpFaces[0]);
  const componentMassBalance = asVector(input.rrboFeedComponentFlows_kg_h.map(
    (flow, component) => flow + input.nmpFeedComponentFlows_kg_h[component] - raffinate[component] - extract[component],
  ));
  const totalMassBalance = sum(componentMassBalance);
  const massBalancePassed =
    Math.max(...componentMassBalance.map((value) => Math.abs(value))) <= ECR2_IDEAL_STAGE_CASCADE_BASIS.componentMassBalanceTolerance_kg_h &&
    Math.abs(totalMassBalance) <= ECR2_IDEAL_STAGE_CASCADE_BASIS.totalMassBalanceTolerance_kg_h;
  let productAromaticsMoleFraction: number | null = null;
  try {
    productAromaticsMoleFraction = calculateHydrocarbonProductQuality({
      componentMoleFractions: raffinate.map((flow, component) => (flow * 1000) / input.physicalMolecularWeights_g_mol[component]),
      componentMassFlows_kg_h: raffinate,
    }).x_A_R_product.value;
  } catch {
    // The rejected trial retains its phase/balance trace but cannot claim a product basis.
  }
  const feedHydrocarbons = sum(input.rrboFeedComponentFlows_kg_h.slice(0, 4));
  const raffinateHydrocarbons = sum(raffinate.slice(0, 4));
  const rrboRecoveryMassFraction = feedHydrocarbons > 0 ? raffinateHydrocarbons / feedHydrocarbons : null;
  const aromaticResidual = productAromaticsMoleFraction === null ? null : productAromaticsMoleFraction - input.target.value;
  const recoveryResidual = rrboRecoveryMassFraction === null ? null :
    rrboRecoveryMassFraction - ECR2_RRBO_RECOVERY_REQUIREMENT.minimumMassFraction;
  const accepted = massBalancePassed && aromaticResidual !== null && aromaticResidual <= 0 && recoveryResidual !== null && recoveryResidual >= 0;
  const failures = [
    !massBalancePassed ? 'Stage/global component mass balance is outside acceptance tolerance.' : null,
    aromaticResidual !== null && aromaticResidual > 0 ? `Raffinate aromatic residual ${aromaticResidual.toExponential(3)} is above target.` : null,
    recoveryResidual !== null && recoveryResidual < 0
      ? `RRBO recovery ${(rrboRecoveryMassFraction! * 100).toFixed(4)}% is below the ${(ECR2_RRBO_RECOVERY_REQUIREMENT.minimumMassFraction * 100).toFixed(1)}% requirement.`
      : null,
  ].filter(Boolean).join(' ');
  return {
    idealStageCount, counterCurrentConverged: true, counterCurrentSweeps: sweeps, massBalancePassed,
    productAromaticsMoleFraction, aromaticResidual, rrboRecoveryMassFraction, recoveryResidual,
    componentMassBalance_kg_h: componentMassBalance, totalMassBalance_kg_h: totalMassBalance,
    accepted, failure: accepted ? null : failures || 'The physical product-quality basis could not be formed.', stageProfile,
  };
}

export function solveECR2IdealStageCascade(input: ECR2IdealStageCascadeInput): ECR2IdealStageCascadeResult {
  const molecularWeightBasis: ECR2IdealStageMolecularWeightBasis = {
    componentOrder: COMPONENT_LABELS,
    physicalMolecularWeights_g_mol: input.physicalMolecularWeights_g_mol,
    surrogateMolecularWeights_g_mol: asVector(SURROGATE_MOLECULAR_WEIGHTS_G_MOL),
    physicalBasisUse: 'physical pseudo-component material-balance and reporting basis; it does not define Coto/NRTL mole fractions without a governed mapping',
    surrogateBasisUse: 'Coto NRTL component-identity and fitted-mole-coordinate basis; it does not define project physical pseudo-component moles',
  };
  const thermodynamicSurrogatePhysicalMapping = buildThermodynamicSurrogatePhysicalMappingAudit(input);
  const diagnostics = [
    'The Coto NRTL parameters are fitted to n-dodecane/1,4-xylene/1-methylnaphthalene/pyrene/NMP mole coordinates, while the project RRBO physical pseudo-components have different molecular weights.',
    'A one-to-one RRBO-class ↔ Coto-surrogate screening analogy does not define a physical-pseudo-mole ↔ surrogate-mole mapping or a valid NRTL material-balance bridge.',
  ];
  const empty = (message: string): ECR2IdealStageCascadeResult => ({
    status: 'not_calculable', statusLabel: 'NOT_CALCULABLE', target: input.target,
    recoveryRequirement: ECR2_RRBO_RECOVERY_REQUIREMENT, basis: ECR2_IDEAL_STAGE_CASCADE_BASIS,
    molecularWeightBasis,
    thermodynamicSurrogatePhysicalMapping,
    establishedTheoreticalStages: null, achievedProductAromaticsMoleFraction: null, aromaticResidual: null,
    rrboRecoveryMassFraction: null, recoveryResidual: null, selectedTrial: null, trials: [], diagnostics: [...diagnostics, message],
  });
  if (!finite(input.operatingTemperature_C) || !finite(input.target.value) || input.target.value <= 0 || input.target.value >= 1 ||
      !nonNegativeVector(input.rrboFeedComponentFlows_kg_h) || !nonNegativeVector(input.nmpFeedComponentFlows_kg_h) ||
      !input.physicalMolecularWeights_g_mol.every((value) => finite(value) && value > 0)) {
    return empty('Ideal-stage cascade has invalid temperature, target, feed-flow, or molecular-weight inputs.');
  }
  const maximum = input.maxIdealStages ?? ECR2_IDEAL_STAGE_CASCADE_BASIS.maximumIdealStages;
  if (!Number.isInteger(maximum) || maximum < 1) return empty('Ideal-stage cascade has an invalid integer-stage safety bound.');
  return {
    status: 'thermodynamic_surrogate_to_physical_mapping_not_closed',
    statusLabel: 'THERMODYNAMIC SURROGATE-TO-PHYSICAL MAPPING NOT CLOSED',
    target: input.target,
    recoveryRequirement: ECR2_RRBO_RECOVERY_REQUIREMENT,
    basis: ECR2_IDEAL_STAGE_CASCADE_BASIS,
    molecularWeightBasis,
    thermodynamicSurrogatePhysicalMapping,
    establishedTheoreticalStages: null,
    achievedProductAromaticsMoleFraction: null,
    aromaticResidual: null,
    rrboRecoveryMassFraction: null,
    recoveryResidual: null,
    selectedTrial: null,
    trials: [],
    diagnostics: [
      ...diagnostics,
      'THERMODYNAMIC SURROGATE-TO-PHYSICAL MAPPING NOT CLOSED: neither the surrogate-MW coordinate nor the physical-pseudo-component-MW coordinate can be supplied to the current Coto NRTL model as a validated physical ECR-2 material balance.',
      'No ideal-stage NRTL flash, physical product quality, RRBO recovery, or theoretical-stage result is calculated until the mapping is governed. Previously calculated 53.6715% recovery is an unvalidated historical sensitivity, not a validated physical RRBO recovery.',
    ],
  };

  const trials: ECR2IdealStageCascadeTrial[] = [];
  for (let count = 1; count <= maximum; count++) {
    const trial = trialAtIdealStageCount(input, count);
    trials.push(trial);
    if (trial.accepted) {
      const invalidLowerTrials = trials.slice(0, -1).filter(
        (prior) =>
          !prior.counterCurrentConverged ||
          !prior.massBalancePassed ||
          prior.productAromaticsMoleFraction === null ||
          prior.rrboRecoveryMassFraction === null,
      );
      if (invalidLowerTrials.length > 0) {
        const firstInvalid = invalidLowerTrials[0];
        return {
          status: 'not_calculable', statusLabel: 'NOT_CALCULABLE', target: input.target,
          recoveryRequirement: ECR2_RRBO_RECOVERY_REQUIREMENT, basis: ECR2_IDEAL_STAGE_CASCADE_BASIS,
          molecularWeightBasis,
          establishedTheoreticalStages: null, achievedProductAromaticsMoleFraction: null,
          aromaticResidual: null, rrboRecoveryMassFraction: null, recoveryResidual: null,
          selectedTrial: null, trials,
          diagnostics: [
            ...diagnostics,
            `Ideal-stage cascade is NOT_CALCULABLE: N = ${count} passed both gates, but the required minimum-stage proof is incomplete because lower N = ${firstInvalid.idealStageCount} was numerically invalid (${firstInvalid.failure ?? 'no numerical result was available.'}).`,
            'ECR-2 N_T is not established unless every smaller integer stage count was calculated, mass-balanced, and rejected by the same product/recovery gates.',
          ],
        };
      }
      return {
        status: 'target_met', statusLabel: 'THEORETICAL_STAGES_ESTABLISHED', target: input.target,
        recoveryRequirement: ECR2_RRBO_RECOVERY_REQUIREMENT, basis: ECR2_IDEAL_STAGE_CASCADE_BASIS,
        molecularWeightBasis,
        establishedTheoreticalStages: count, achievedProductAromaticsMoleFraction: trial.productAromaticsMoleFraction,
        aromaticResidual: trial.aromaticResidual, rrboRecoveryMassFraction: trial.rrboRecoveryMassFraction,
        recoveryResidual: trial.recoveryResidual, selectedTrial: trial, trials,
        diagnostics: [...diagnostics, `Minimum accepted same-specification ideal-stage count is N_T = ${count}.`],
      };
    }
  }
  const invalidTrials = trials.filter(
    (trial) =>
      !trial.counterCurrentConverged ||
      !trial.massBalancePassed ||
      trial.productAromaticsMoleFraction === null ||
      trial.rrboRecoveryMassFraction === null,
  );
  if (invalidTrials.length > 0) {
    const firstInvalid = invalidTrials[0];
    return {
      status: 'not_calculable',
      statusLabel: 'NOT_CALCULABLE',
      target: input.target, recoveryRequirement: ECR2_RRBO_RECOVERY_REQUIREMENT, basis: ECR2_IDEAL_STAGE_CASCADE_BASIS,
        molecularWeightBasis,
      establishedTheoreticalStages: null, achievedProductAromaticsMoleFraction: null,
      aromaticResidual: null, rrboRecoveryMassFraction: null, recoveryResidual: null,
      selectedTrial: null, trials,
      diagnostics: [
        ...diagnostics,
        `Ideal-stage cascade is NOT_CALCULABLE: ${invalidTrials.length} of ${trials.length} tested stage counts did not produce a converged, mass-balanced physical product/recovery result. First invalid N = ${firstInvalid.idealStageCount}: ${firstInvalid.failure ?? 'no numerical result was available.'}`,
        'A numerical flash/cascade failure is not evidence that the specified ECR-2 product and recovery gates are infeasible.',
      ],
    };
  }
  const latest = trials.at(-1) ?? null;
  return {
    status: 'no_feasible_theoretical_stage_cascade',
    statusLabel: 'NO FEASIBLE THEORETICAL-STAGE CASCADE AT THE SPECIFIED CONDITIONS',
    target: input.target, recoveryRequirement: ECR2_RRBO_RECOVERY_REQUIREMENT, basis: ECR2_IDEAL_STAGE_CASCADE_BASIS,
    molecularWeightBasis,
    establishedTheoreticalStages: null, achievedProductAromaticsMoleFraction: latest?.productAromaticsMoleFraction ?? null,
    aromaticResidual: latest?.aromaticResidual ?? null, rrboRecoveryMassFraction: latest?.rrboRecoveryMassFraction ?? null,
    recoveryResidual: latest?.recoveryResidual ?? null, selectedTrial: null, trials,
    diagnostics: [...diagnostics, `NO FEASIBLE THEORETICAL-STAGE CASCADE AT THE SPECIFIED CONDITIONS: no integer N in 1..${maximum} passed both product-quality and recovery gates.`],
  };
}