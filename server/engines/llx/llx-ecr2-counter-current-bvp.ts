// ═══════════════════════════════════════════════════════════════════════════
// ECR-2 — Steady-state counter-current five-component BVP
//
// This module owns axial coupling only.  Local thermodynamics, physical
// properties, hydrodynamics, d32, holdup and K&H transfer equations remain in
// their frozen modules and are invoked afresh for every compartment/trial.
// ═══════════════════════════════════════════════════════════════════════════

import type { ECR2ThermodynamicBasis } from './llx-ecr-simulator-engine';
import { SURROGATE_MW } from '../../engine-framework/cel/coto2022-nmp-lle';
import type { D32Config, D32Result } from './llx-ecr2-d32-interface';
import { computeDropletDiameter, isD32Usable } from './llx-ecr2-d32-interface';
import { computeKH1995Holdup, isHoldupUsable, type KH1995HoldupResult } from './llx-ecr2-holdup';
import { computeInterfacialArea, computeSlipVelocity, type InterfacialAreaResult } from './llx-ecr2-interfacial-area';
import { computeDimensionlessNumbers, type ECR2DimensionlessResult } from './llx-ecr2-dimensionless';
import { computeAllSchmidtNumbers } from './llx-ecr2-diffusivity';
import {
  activateKH1999PreliminaryLocalMassTransfer,
  evaluateKH1999PreliminaryLocalMassTransfer,
  type ECR2KH1999EngineerC2Input,
  type ECR2KH1999LocalMassTransferResult,
  type ECR2KH1999PartitionBasisApproval,
  type ECR2PhysicalMolecularWeightVector,
  type FiveComponentVector,
} from './llx-ecr2-kh1999-mass-transfer';
import {
  resolveECR2LocalProperties,
  toECR2KernelPropertyResult,
  type ECR2GovernedPropertyInputs,
  type ECR2LocalPropertySnapshot,
} from './llx-ecr2-local-property-closure';
import { computeLocalNRTL, type ECR2LocalNRTLResult } from './llx-ecr2-local-nrtl';
import {
  computeECR2CompartmentActiveLiquidVolume,
  ECR2_EFFECTIVE_TRANSFER_VOLUME_GOVERNANCE,
} from './llx-ecr2-transfer-volume-governance';

const N_COMPONENTS = 5;
const COMPONENTS = ['Sat', 'Mono', 'Di', 'Poly', 'NMP'] as const;

/**
 * Proposed numerical acceptance constants.  They are deliberately centralised
 * and explicitly labelled pending engineering calibration.
 */
export const PROPOSED_SOLVER_TOLERANCE = {
  normalizedResidual: 1e-7,
  // Column closure accumulates the accepted local residuals over N cells.
  componentBalance_kg_h: 1e-6,
  totalBalance_kg_h: 5e-6,
  relativeStateChange: 1e-8,
  residualScaleTotalFlowFraction: 1e-9,
  finiteDifferenceRelativeStep: 1e-6,
  maxIterations: 80,
  maxFunctionEvaluations: 2400,
  initialDamping: 1e-5,
  maximumDamping: 1e12,
  initialTrustRegionRelative: 0.35,
  minimumLineSearchFraction: 1 / 4096,
} as const;

export type ECR2Vector = readonly [number, number, number, number, number];

export interface ECR2CounterCurrentBVPInput {
  /** Number of axial compartments, indexed bottom (1) to top (N). */
  numberOfCompartments: number;
  /** Total active height H_actual (m). */
  activeHeight_m: number;
  /** Column cross-sectional area A_column (m²). */
  columnCrossSectionArea_m2: number;
  /** Fixed per-compartment specific power basis ψ = (P/V)/ρ_mix (W/kg). */
  psi_W_kg: number;
  /** Required K&H 1995 stator open-area fraction x_f. */
  statorOpenAreaFraction: number;
  /** Isothermal operating temperature. */
  operatingTemperature_C: number;
  /**
   * Physical/project molecular weights used only after NRTL for physical
   * concentration, Kd, driving-force, and transfer-rate conversion.
   */
  physicalMolecularWeights: ECR2PhysicalMolecularWeightVector;
  /**
   * C2 thermodynamic trace. The BVP blocks without it; local NRTL calculations
   * still use only local face-derived compositions and the governed NRTL model.
   */
  c2ThermodynamicBasis: ECR2ThermodynamicBasis | null;
  /** Known RRBO/dispersed feed component flows at z=0 (kg/h). */
  rrboFeedComponentFlows_kg_h: ECR2Vector;
  /** Known NMP/continuous feed component flows at z=H (kg/h). */
  nmpFeedComponentFlows_kg_h: ECR2Vector;
  governedProperties: ECR2GovernedPropertyInputs;
  d32Config: D32Config | null;
  kuhniShdC2: ECR2KH1999EngineerC2Input | null;
  partitionBasis: ECR2KH1999PartitionBasisApproval | null;
  /**
   * Optional free face state from a prior converged run. Its length must be
   * exactly 10N and every member must be finite and non-negative.
   */
  previousSolution?: readonly number[] | null;
  solverOptions?: Partial<Pick<typeof PROPOSED_SOLVER_TOLERANCE,
    'maxIterations' | 'maxFunctionEvaluations' | 'normalizedResidual' | 'relativeStateChange'>> & {
    /** Diagnostic/verification transfer-strength target λ, constrained to [0, 1]. Defaults to the physical target λ=1. */
    transferStrength?: number;
  };
}

export interface ECR2BVPLocalFailure {
  compartmentIndex: number | null;
  component: string | null;
  dependency: string;
  message: string;
  provenance: string[];
}

export interface ECR2BVPCompartment {
  compartmentIndex: number;
  z_bottom_m: number;
  z_centre_m: number;
  z_top_m: number;
  dispersedIncoming_kg_h: ECR2Vector;
  dispersedOutgoing_kg_h: ECR2Vector;
  continuousIncoming_kg_h: ECR2Vector;
  continuousOutgoing_kg_h: ECR2Vector;
  dispersedTotal_kg_h: number;
  continuousTotal_kg_h: number;
  dispersedMassFractions: ECR2Vector;
  continuousMassFractions: ECR2Vector;
  localNRTL: ECR2LocalNRTLResult;
  localProperties: ECR2LocalPropertySnapshot;
  d32: D32Result;
  holdup: KH1995HoldupResult;
  interfacialArea: InterfacialAreaResult;
  U_slip_m_s: number;
  dimensionless: ECR2DimensionlessResult;
  localMassTransfer: ECR2KH1999LocalMassTransferResult;
  activeLiquidVolume_m3: number;
  transferRate_kg_m3_s: ECR2Vector;
  transferAmount_kg_h: ECR2Vector;
  localWarnings: readonly string[];
}

export interface ECR2BVPResidualRecord {
  compartmentIndex: number;
  component: typeof COMPONENTS[number];
  dispersedRaw_kg_h: number;
  continuousRaw_kg_h: number;
  dispersedNormalized: number;
  continuousNormalized: number;
}

export interface ECR2CounterCurrentBVPResult {
  status: 'converged' | 'non_converged' | 'blocked';
  convergenceStatus: 'accepted' | 'not_converged' | 'dependency_blocked';
  massBalanceStatus: 'passed' | 'failed' | 'not_evaluated';
  propertyValidityStatus: 'passed' | 'failed';
  engineeringBasis: 'Published Correlation — Preliminary Engineering';
  primarySourceVerified: false;
  validatedForRRBONMP: false;
  pilotCalibrationStatus: 'NOT_YET_VALIDATED';
  iterations: number;
  functionEvaluations: number;
  finalResidualNorm: number | null;
  maximumComponentResidual_kg_h: number | null;
  maximumNormalizedResidual: number | null;
  stateVector: readonly number[] | null;
  residuals: readonly ECR2BVPResidualRecord[];
  compartments: readonly ECR2BVPCompartment[];
  axialProfile: readonly {
    z_m: number;
    raffinateMassFractions: ECR2Vector;
    extractMassFractions: ECR2Vector;
    raffinateFlow_kg_h: number;
    extractFlow_kg_h: number;
    phi_d: number;
    d32_m: number;
    Re_d: number;
    Sh_c: ECR2Vector;
    Sh_d: ECR2Vector;
    Koa_per_s: ECR2Vector;
    drivingForce_kg_m3: ECR2Vector;
    transferRate_kg_m3_s: ECR2Vector;
  }[];
  outlets: {
    raffinate: { componentFlows_kg_h: ECR2Vector; totalFlow_kg_h: number; massFractions: ECR2Vector } | null;
    extract: { componentFlows_kg_h: ECR2Vector; totalFlow_kg_h: number; massFractions: ECR2Vector } | null;
  };
  componentBalances_kg_h: ECR2Vector | null;
  totalMassBalance_kg_h: number | null;
  diagnostics: readonly string[];
  failure: ECR2BVPLocalFailure | null;
  governance: typeof ECR2_EFFECTIVE_TRANSFER_VOLUME_GOVERNANCE;
}

interface Evaluation {
  valid: boolean;
  residualRaw: number[];
  residualNormalized: number[];
  records: ECR2BVPResidualRecord[];
  compartments: ECR2BVPCompartment[];
  failure: ECR2BVPLocalFailure | null;
  donorViolation: boolean;
}

const zeros = (): number[] => [0, 0, 0, 0, 0];
const asVector = (values: readonly number[]): ECR2Vector =>
  [values[0], values[1], values[2], values[3], values[4]];
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const norm2 = (values: readonly number[]) => Math.sqrt(values.reduce((acc, value) => acc + value * value, 0));

function invalid(
  dependency: string,
  message: string,
  compartmentIndex: number | null = null,
  component: string | null = null,
  provenance: string[] = [],
): ECR2BVPLocalFailure {
  return { dependency, message, compartmentIndex, component, provenance };
}

function finiteNonNegativeVector(value: readonly number[]): boolean {
  return value.length === N_COMPONENTS && value.every((item) => finite(item) && item >= 0);
}

function massFractions(values: readonly number[]): ECR2Vector | null {
  const total = sum(values);
  if (!finite(total) || total <= 0 || !finiteNonNegativeVector(values)) return null;
  return asVector(values.map((value) => value / total));
}

/**
 * Canonical Coto thermodynamic coordinate conversion.
 *
 * The BVP state remains physical component mass flow (kg/h), but every local
 * composition supplied to NRTL must be represented on the governed Coto
 * pseudo-component basis. Physical ECR-2 molecular weights are deliberately
 * absent from this boundary and remain reserved for downstream physical
 * concentration/rate conversion.
 */
export function thermodynamicMoleFractionsFromPhysicalMassFractions(
  physicalMassFractions: readonly number[],
): ECR2Vector | null {
  const surrogateMw = [
    SURROGATE_MW.c12,
    SURROGATE_MW.xylene,
    SURROGATE_MW.methylnaphtalene,
    SURROGATE_MW.pyrene,
    SURROGATE_MW.nmp,
  ];
  if (
    !finiteNonNegativeVector(physicalMassFractions) ||
    !surrogateMw.every((value) => finite(value) && value > 0)
  ) return null;
  const moles = physicalMassFractions.map((fraction, i) => fraction / surrogateMw[i]);
  const total = sum(moles);
  if (!finite(total) || total <= 0) return null;
  return asVector(moles.map((value) => value / total));
}

function overallThermodynamicMoleFractions(
  dispersedMassFractions: readonly number[],
  continuousMassFractions: readonly number[],
  dispersedTotal_kg_h: number,
  continuousTotal_kg_h: number,
): ECR2Vector | null {
  const combinedTotal = dispersedTotal_kg_h + continuousTotal_kg_h;
  if (!finite(combinedTotal) || combinedTotal <= 0) return null;
  const combinedMassFractions = dispersedMassFractions.map(
    (fraction, index) =>
      (fraction * dispersedTotal_kg_h + continuousMassFractions[index] * continuousTotal_kg_h) /
      combinedTotal,
  );
  return thermodynamicMoleFractionsFromPhysicalMassFractions(combinedMassFractions);
}

function resultFailure(
  input: ECR2CounterCurrentBVPInput,
  failure: ECR2BVPLocalFailure,
  diagnostics: string[],
  functionEvaluations = 0,
): ECR2CounterCurrentBVPResult {
  return {
    status: 'blocked',
    convergenceStatus: 'dependency_blocked',
    massBalanceStatus: 'not_evaluated',
    propertyValidityStatus: 'failed',
    engineeringBasis: 'Published Correlation — Preliminary Engineering',
    primarySourceVerified: false,
    validatedForRRBONMP: false,
    pilotCalibrationStatus: 'NOT_YET_VALIDATED',
    iterations: 0,
    functionEvaluations,
    finalResidualNorm: null,
    maximumComponentResidual_kg_h: null,
    maximumNormalizedResidual: null,
    stateVector: null,
    residuals: [],
    compartments: [],
    axialProfile: [],
    outlets: { raffinate: null, extract: null },
    componentBalances_kg_h: null,
    totalMassBalance_kg_h: null,
    diagnostics,
    failure,
    governance: ECR2_EFFECTIVE_TRANSFER_VOLUME_GOVERNANCE,
  };
}

function validateInput(input: ECR2CounterCurrentBVPInput): ECR2BVPLocalFailure | null {
  if (!Number.isInteger(input.numberOfCompartments) || input.numberOfCompartments < 1) {
    return invalid('grid', 'numberOfCompartments must be an integer >= 1.');
  }
  for (const [name, value] of [
    ['activeHeight_m', input.activeHeight_m],
    ['columnCrossSectionArea_m2', input.columnCrossSectionArea_m2],
    ['psi_W_kg', input.psi_W_kg],
    ['statorOpenAreaFraction', input.statorOpenAreaFraction],
  ] as const) {
    if (!finite(value) || value <= 0) return invalid('geometry_or_hydrodynamics', `${name} must be finite and > 0.`);
  }
  if (!finite(input.operatingTemperature_C)) return invalid('temperature', 'operatingTemperature_C must be finite.');
  if (!input.c2ThermodynamicBasis) return invalid('c2_thermodynamic_basis', 'A C2 thermodynamic basis is required for a BVP run.');
  if (!input.d32Config) return invalid('d32', 'd32Config is required; no d32 default is permitted.');
  if (!input.kuhniShdC2) return invalid('kuhni_shd_c2', 'kuhniShdC2 is required for the full local transfer rate.');
  if (!input.partitionBasis) return invalid('partition_basis', 'An approved K_d concentration partition basis is required.');
  if (input.solverOptions?.transferStrength !== undefined &&
      (!finite(input.solverOptions.transferStrength) || input.solverOptions.transferStrength < 0 || input.solverOptions.transferStrength > 1)) {
    return invalid('transfer_strength', 'solverOptions.transferStrength must be a finite value in [0, 1].');
  }
  if (!finiteNonNegativeVector(input.rrboFeedComponentFlows_kg_h) || sum(input.rrboFeedComponentFlows_kg_h) <= 0) {
    return invalid('rrbo_feed', 'RRBO feed must be five non-negative finite component flows with positive total flow.');
  }
  if (!finiteNonNegativeVector(input.nmpFeedComponentFlows_kg_h) || sum(input.nmpFeedComponentFlows_kg_h) <= 0) {
    return invalid('nmp_feed', 'NMP feed must be five non-negative finite component flows with positive total flow.');
  }
  if (!Object.values(input.physicalMolecularWeights).every((value) => finite(value) && value > 0)) {
    return invalid('physical_molecular_weights', 'All physical molecular weights must be positive finite values.');
  }
  return null;
}

/** Free state: D at faces 1..N followed by C at faces 0..N-1. */
function unpackFaces(input: ECR2CounterCurrentBVPInput, state: readonly number[]) {
  const n = input.numberOfCompartments;
  const d: number[][] = Array.from({ length: n + 1 }, () => zeros());
  const c: number[][] = Array.from({ length: n + 1 }, () => zeros());
  d[0] = [...input.rrboFeedComponentFlows_kg_h];
  c[n] = [...input.nmpFeedComponentFlows_kg_h];
  for (let face = 1; face <= n; face++) d[face] = state.slice((face - 1) * N_COMPONENTS, face * N_COMPONENTS);
  const cOffset = n * N_COMPONENTS;
  for (let face = 0; face < n; face++) c[face] = state.slice(cOffset + face * N_COMPONENTS, cOffset + (face + 1) * N_COMPONENTS);
  return { d, c };
}

function zeroTransferGuess(input: ECR2CounterCurrentBVPInput): number[] {
  const values: number[] = [];
  for (let face = 1; face <= input.numberOfCompartments; face++) values.push(...input.rrboFeedComponentFlows_kg_h);
  for (let face = 0; face < input.numberOfCompartments; face++) values.push(...input.nmpFeedComponentFlows_kg_h);
  return values;
}

function d32Provenance(input: ECR2CounterCurrentBVPInput, d32: D32Result) {
  return {
    value_m: d32.d32_m!,
    source: input.d32Config!.mode === 'engineer_supplied' ? 'engineer_entered' as const : 'governed_calculated' as const,
    sourceReference: input.d32Config!.mode === 'engineer_supplied'
      ? input.d32Config!.sourceReference
      : 'ecr2_d32_kh1996 — approved preliminary reconstruction',
  };
}

function localCompartment(
  input: ECR2CounterCurrentBVPInput,
  index: number,
  dIn: readonly number[],
  dOut: readonly number[],
  cIn: readonly number[],
  cOut: readonly number[],
  lambda: number,
): { compartment: ECR2BVPCompartment | null; failure: ECR2BVPLocalFailure | null } {
  const localD = dIn.map((value, i) => (value + dOut[i]) / 2);
  const localC = cIn.map((value, i) => (value + cOut[i]) / 2);
  const dMassFractions = massFractions(localD);
  const cMassFractions = massFractions(localC);
  const dTotal = sum(localD);
  const cTotal = sum(localC);
  const xThermo = dMassFractions &&
    thermodynamicMoleFractionsFromPhysicalMassFractions(dMassFractions);
  const yThermo = cMassFractions &&
    thermodynamicMoleFractionsFromPhysicalMassFractions(cMassFractions);
  const zThermo = dMassFractions && cMassFractions
    ? overallThermodynamicMoleFractions(dMassFractions, cMassFractions, dTotal, cTotal)
    : null;
  if (!dMassFractions || !cMassFractions || !xThermo || !yThermo || !zThermo) {
    return { compartment: null, failure: invalid('local_composition', 'Local phase component flows cannot form valid non-zero five-component compositions.', index) };
  }

  const properties = resolveECR2LocalProperties(
    { x_local: xThermo, y_local: yThermo, compartmentIndex: index },
    input.operatingTemperature_C,
    input.governedProperties,
  );
  if (properties.status !== 'resolved') {
    return { compartment: null, failure: invalid('local_property_closure', properties.errors.join(' '), index, null, [...properties.warnings]) };
  }

  const nrtl = computeLocalNRTL({
    x_j: xThermo,
    y_j: yThermo,
    z_feed: zThermo,
    T_K: input.operatingTemperature_C + 273.15,
  });
  if (nrtl.flashConverged !== true || !nrtl.x_eq || !nrtl.y_eq) {
    return { compartment: null, failure: invalid('local_nrtl', 'Local NRTL flash did not return a converged two-phase equilibrium state.', index, null, nrtl.diagnostics) };
  }

  const height = input.activeHeight_m / input.numberOfCompartments;
  const uD = dTotal / (properties.snapshot.rho_d_kg_m3 * input.columnCrossSectionArea_m2 * 3600);
  const uC = cTotal / (properties.snapshot.rho_c_kg_m3 * input.columnCrossSectionArea_m2 * 3600);
  const holdup = computeKH1995Holdup({
    psi_W_kg: input.psi_W_kg,
    Ud_m_s: uD,
    Uc_m_s: uC,
    rho_c_kg_m3: properties.snapshot.rho_c_kg_m3,
    rho_d_kg_m3: properties.snapshot.rho_d_kg_m3,
    gamma_N_m: properties.snapshot.sigma_N_m,
    xf: input.statorOpenAreaFraction,
  });
  if (!isHoldupUsable(holdup)) {
    return { compartment: null, failure: invalid('holdup', `K&H 1995 holdup is unusable: ${holdup.status}.`, index, null, 'missing' in holdup ? holdup.missing : []) };
  }

  const d32 = computeDropletDiameter({
    h_comp_m: height,
    psi_W_kg: input.psi_W_kg,
    rho_c_kg_m3: properties.snapshot.rho_c_kg_m3,
    rho_d_kg_m3: properties.snapshot.rho_d_kg_m3,
    sigma_N_m: properties.snapshot.sigma_N_m,
    compartmentIndex: index,
    z_m: (index - 0.5) * height,
  }, input.d32Config!);
  if (!isD32Usable(d32)) {
    return { compartment: null, failure: invalid('d32', `d32 is unusable: ${d32.status}.`, index, null, d32.diagnostics) };
  }
  const area = computeInterfacialArea(holdup, d32);
  const slip = computeSlipVelocity(uD, uC, holdup.phi);
  if (!('U_slip_m_s' in slip) || slip.U_slip_m_s === null || area.a_m2_m3 === null) {
    return { compartment: null, failure: invalid('interfacial_area_or_slip', area.blockingReasons.join(' ') || ('reason' in slip ? slip.reason : 'Local interfacial area/slip unavailable.'), index) };
  }
  const dimensionless = computeDimensionlessNumbers({
    U_slip_m_s: slip.U_slip_m_s,
    d32_m: d32.d32_m,
    rho_c: toECR2KernelPropertyResult(properties.snapshot.properties.rho_c),
    mu_c: toECR2KernelPropertyResult(properties.snapshot.properties.mu_c),
    mu_d: toECR2KernelPropertyResult(properties.snapshot.properties.mu_d),
    sigma: toECR2KernelPropertyResult(properties.snapshot.properties.sigma),
  });
  const schmidt = computeAllSchmidtNumbers({
    diffusivity: input.governedProperties.diffusivity,
    rho_c: toECR2KernelPropertyResult(properties.snapshot.properties.rho_c),
    rho_d: toECR2KernelPropertyResult(properties.snapshot.properties.rho_d),
    mu_c: toECR2KernelPropertyResult(properties.snapshot.properties.mu_c),
    mu_d: toECR2KernelPropertyResult(properties.snapshot.properties.mu_d),
  });
  const base = evaluateKH1999PreliminaryLocalMassTransfer({
    continuous_bulk: yThermo,
    dispersed_bulk: xThermo,
    continuous_equilibrium: nrtl.y_eq as FiveComponentVector,
    dispersed_equilibrium: nrtl.x_eq as FiveComponentVector,
    rho_c_bulk_kg_m3: properties.snapshot.rho_c_kg_m3,
    rho_d_bulk_kg_m3: properties.snapshot.rho_d_kg_m3,
    rho_c_equilibrium_kg_m3: properties.snapshot.rho_c_kg_m3,
    rho_d_equilibrium_kg_m3: properties.snapshot.rho_d_kg_m3,
    molecularWeights: input.physicalMolecularWeights,
    dimensionless,
    schmidt,
    d32_m: d32.d32_m,
    interfacialArea_m2_m3: area.a_m2_m3,
  });
  const localMassTransfer = activateKH1999PreliminaryLocalMassTransfer(base, {
    hydrodynamics: {
      phi_d: holdup.phi,
      psi_W_kg: input.psi_W_kg,
      U_slip_m_s: slip.U_slip_m_s,
      rho_c_kg_m3: properties.snapshot.rho_c_kg_m3,
      rho_d_kg_m3: properties.snapshot.rho_d_kg_m3,
      mu_c: toECR2KernelPropertyResult(properties.snapshot.properties.mu_c),
      mu_d: toECR2KernelPropertyResult(properties.snapshot.properties.mu_d),
      sigma: toECR2KernelPropertyResult(properties.snapshot.properties.sigma),
    },
    diffusivity: input.governedProperties.diffusivity,
    d32: d32Provenance(input, d32),
    kuhniShdC2: input.kuhniShdC2,
    partitionBasis: input.partitionBasis,
  });
  const rates = COMPONENTS.map((component) => localMassTransfer.components[component].transferRate_kg_m3_s);
  if (!rates.every((rate) => typeof rate === 'number' && Number.isFinite(rate))) {
    const componentIndex = rates.findIndex((rate) => typeof rate !== 'number' || !Number.isFinite(rate as number));
    const component = COMPONENTS[Math.max(0, componentIndex)];
    return {
      compartment: null,
      failure: invalid('kh1999_local_mass_transfer', localMassTransfer.components[component].outputStatus.transferRate.message, index, component, localMassTransfer.diagnostics),
    };
  }
  const volume = computeECR2CompartmentActiveLiquidVolume({
    columnCrossSectionArea_m2: input.columnCrossSectionArea_m2,
    compartmentHeight_m: height,
  });
  if (volume.status !== 'calculated') {
    return { compartment: null, failure: invalid('transfer_volume', volume.reasons.join(' '), index) };
  }
  const transferRate = rates as number[];
  const transferAmount = transferRate.map((rate) => lambda * rate * volume.activeLiquidVolume_m3 * 3600);
  return {
    compartment: {
      compartmentIndex: index,
      z_bottom_m: (index - 1) * height,
      z_centre_m: (index - 0.5) * height,
      z_top_m: index * height,
      dispersedIncoming_kg_h: asVector(dIn),
      dispersedOutgoing_kg_h: asVector(dOut),
      continuousIncoming_kg_h: asVector(cIn),
      continuousOutgoing_kg_h: asVector(cOut),
      dispersedTotal_kg_h: dTotal,
      continuousTotal_kg_h: cTotal,
      dispersedMassFractions: dMassFractions,
      continuousMassFractions: cMassFractions,
      localNRTL: nrtl,
      localProperties: properties.snapshot,
      d32,
      holdup,
      interfacialArea: area,
      U_slip_m_s: slip.U_slip_m_s,
      dimensionless,
      localMassTransfer,
      activeLiquidVolume_m3: volume.activeLiquidVolume_m3,
      transferRate_kg_m3_s: asVector(transferRate),
      transferAmount_kg_h: asVector(transferAmount),
      localWarnings: [...properties.snapshot.localityWarnings, ...d32.diagnostics],
    },
    failure: null,
  };
}

function evaluate(input: ECR2CounterCurrentBVPInput, state: readonly number[], lambda: number, scales: readonly number[]): Evaluation {
  const n = input.numberOfCompartments;
  if (state.length !== 10 * n || !state.every((value) => finite(value) && value >= 0)) {
    return { valid: false, residualRaw: [], residualNormalized: [], records: [], compartments: [], donorViolation: false, failure: invalid('state_bounds', 'State vector must contain exactly 10N finite non-negative component flows.') };
  }
  const { d, c } = unpackFaces(input, state);
  const raw: number[] = [];
  const normalized: number[] = [];
  const records: ECR2BVPResidualRecord[] = [];
  const compartments: ECR2BVPCompartment[] = [];
  let donorViolation = false;
  for (let j = 0; j < n; j++) {
    const local = localCompartment(input, j + 1, d[j], d[j + 1], c[j + 1], c[j], lambda);
    if (!local.compartment) {
      return { valid: false, residualRaw: [], residualNormalized: [], records: [], compartments: [], donorViolation, failure: local.failure };
    }
    compartments.push(local.compartment);
    for (let i = 0; i < N_COMPONENTS; i++) {
      const transfer = local.compartment.transferAmount_kg_h[i];
      // Incoming donor flows are D at the bottom face and C at the top face.
      if ((transfer > d[j][i] + 1e-12) || (-transfer > c[j + 1][i] + 1e-12)) donorViolation = true;
      const dispersed = d[j][i] - d[j + 1][i] - transfer;
      const continuous = c[j + 1][i] - c[j][i] + transfer;
      raw.push(dispersed, continuous);
      normalized.push(dispersed / scales[i], continuous / scales[i]);
      records.push({
        compartmentIndex: j + 1,
        component: COMPONENTS[i],
        dispersedRaw_kg_h: dispersed,
        continuousRaw_kg_h: continuous,
        dispersedNormalized: dispersed / scales[i],
        continuousNormalized: continuous / scales[i],
      });
    }
  }
  return { valid: !donorViolation, residualRaw: raw, residualNormalized: normalized, records, compartments, donorViolation, failure: donorViolation ? invalid('donor_inventory', 'A trial state requests transfer beyond an incoming donor component inventory.') : null };
}

/** Dense linear solve for the small square normal-equation system. */
function solveLinear(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const matrix = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) pivot = row;
    if (!finite(matrix[pivot][col]) || Math.abs(matrix[pivot][col]) < 1e-20) return null;
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
    const divisor = matrix[col][col];
    for (let k = col; k <= n; k++) matrix[col][k] /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = matrix[row][col];
      for (let k = col; k <= n; k++) matrix[row][k] -= factor * matrix[col][k];
    }
  }
  const solution = matrix.map((row) => row[n]);
  return solution.every(finite) ? solution : null;
}

function gaussNewtonStep(
  input: ECR2CounterCurrentBVPInput,
  state: readonly number[],
  current: Evaluation,
  lambda: number,
  scales: readonly number[],
  damping: number,
  evaluations: { count: number; max: number },
): number[] | null {
  const n = state.length;
  const m = current.residualNormalized.length;
  const jacobian = Array.from({ length: m }, () => Array(n).fill(0));
  for (let column = 0; column < n; column++) {
    if (evaluations.count >= evaluations.max) return null;
    const h = PROPOSED_SOLVER_TOLERANCE.finiteDifferenceRelativeStep * Math.max(1, state[column]);
    const trial = [...state];
    trial[column] += h;
    const evaluated = evaluate(input, trial, lambda, scales);
    evaluations.count++;
    if (!evaluated.valid || evaluated.residualNormalized.length !== m) continue;
    for (let row = 0; row < m; row++) jacobian[row][column] = (evaluated.residualNormalized[row] - current.residualNormalized[row]) / h;
  }
  const normal = Array.from({ length: n }, () => Array(n).fill(0));
  const rhs = Array(n).fill(0);
  for (let row = 0; row < m; row++) {
    for (let col = 0; col < n; col++) {
      const value = jacobian[row][col];
      rhs[col] -= value * current.residualNormalized[row];
      for (let inner = 0; inner <= col; inner++) normal[col][inner] += value * jacobian[row][inner];
    }
  }
  for (let row = 0; row < n; row++) {
    for (let col = row + 1; col < n; col++) normal[row][col] = normal[col][row];
    normal[row][row] += damping;
  }
  return solveLinear(normal, rhs);
}

function scaledInitialGuess(input: ECR2CounterCurrentBVPInput): { state: number[]; source: string } {
  const zero = zeroTransferGuess(input);
  const prior = input.previousSolution;
  if (prior && prior.length === zero.length && prior.every((value) => finite(value) && value >= 0)) {
    return { state: [...prior], source: 'previous converged solution' };
  }
  return { state: zero, source: 'zero-transfer / constant-flow counter-current profile' };
}

function profile(compartments: readonly ECR2BVPCompartment[]) {
  return compartments.map((item) => {
    const component = (name: typeof COMPONENTS[number], field: keyof ECR2KH1999LocalMassTransferResult['components'][typeof COMPONENTS[number]]) =>
      item.localMassTransfer.components[name][field];
    const vector = (field: keyof ECR2KH1999LocalMassTransferResult['components'][typeof COMPONENTS[number]]) =>
      asVector(COMPONENTS.map((name) => {
        const value = component(name, field);
        return typeof value === 'number' ? value : Number.NaN;
      }));
    return {
      z_m: item.z_centre_m,
      raffinateMassFractions: item.dispersedMassFractions,
      extractMassFractions: item.continuousMassFractions,
      raffinateFlow_kg_h: item.dispersedTotal_kg_h,
      extractFlow_kg_h: item.continuousTotal_kg_h,
      phi_d: item.holdup.phi ?? Number.NaN,
      d32_m: item.d32.d32_m ?? Number.NaN,
      Re_d: typeof item.dimensionless.Re_d === 'number' ? item.dimensionless.Re_d : Number.NaN,
      Sh_c: vector('Sh_c'),
      Sh_d: vector('Sh_d'),
      Koa_per_s: vector('K_oa_per_s'),
      drivingForce_kg_m3: vector('drivingForce_dispersed_kg_m3'),
      transferRate_kg_m3_s: item.transferRate_kg_m3_s,
    };
  });
}

function resultFromEvaluation(
  input: ECR2CounterCurrentBVPInput,
  status: 'converged' | 'non_converged',
  state: readonly number[],
  evaluated: Evaluation,
  iterations: number,
  functionEvaluations: number,
  diagnostics: string[],
): ECR2CounterCurrentBVPResult {
  const residualNorm = norm2(evaluated.residualNormalized);
  const maxRaw = Math.max(...evaluated.residualRaw.map((value) => Math.abs(value)), 0);
  const maxNormalized = Math.max(...evaluated.residualNormalized.map((value) => Math.abs(value)), 0);
  const faces = unpackFaces(input, state);
  const raffinate = asVector(faces.d[input.numberOfCompartments]);
  const extract = asVector(faces.c[0]);
  const componentBalance = asVector(COMPONENTS.map((_, i) =>
    input.rrboFeedComponentFlows_kg_h[i] + input.nmpFeedComponentFlows_kg_h[i] - raffinate[i] - extract[i],
  ));
  const totalBalance = sum(componentBalance);
  const balancePass = componentBalance.every((value) => Math.abs(value) <= PROPOSED_SOLVER_TOLERANCE.componentBalance_kg_h) &&
    Math.abs(totalBalance) <= PROPOSED_SOLVER_TOLERANCE.totalBalance_kg_h;
  const accepted = status === 'converged' && balancePass && maxNormalized <= (input.solverOptions?.normalizedResidual ?? PROPOSED_SOLVER_TOLERANCE.normalizedResidual);
  return {
    status: accepted ? 'converged' : 'non_converged',
    convergenceStatus: accepted ? 'accepted' : 'not_converged',
    massBalanceStatus: balancePass ? 'passed' : 'failed',
    propertyValidityStatus: 'passed',
    engineeringBasis: 'Published Correlation — Preliminary Engineering',
    primarySourceVerified: false,
    validatedForRRBONMP: false,
    pilotCalibrationStatus: 'NOT_YET_VALIDATED',
    iterations,
    functionEvaluations,
    finalResidualNorm: residualNorm,
    maximumComponentResidual_kg_h: maxRaw,
    maximumNormalizedResidual: maxNormalized,
    stateVector: [...state],
    residuals: evaluated.records,
    compartments: evaluated.compartments,
    axialProfile: profile(evaluated.compartments),
    outlets: {
      raffinate: { componentFlows_kg_h: raffinate, totalFlow_kg_h: sum(raffinate), massFractions: massFractions(raffinate)! },
      extract: { componentFlows_kg_h: extract, totalFlow_kg_h: sum(extract), massFractions: massFractions(extract)! },
    },
    componentBalances_kg_h: componentBalance,
    totalMassBalance_kg_h: totalBalance,
    diagnostics,
    failure: accepted ? null : invalid('convergence', 'The nonlinear least-squares solver did not satisfy all numerical and mass-balance acceptance checks.'),
    governance: ECR2_EFFECTIVE_TRANSFER_VOLUME_GOVERNANCE,
  };
}

/**
 * Solve the exact 10N component-flow balance system with non-negative bounds.
 *
 * The bounded method is a projected, damped Gauss-Newton nonlinear least
 * squares solve.  Every trial is evaluated before acceptance; trials that
 * breach a component donor inventory or any local-physics contract are
 * rejected and reduced by trust-region line search rather than clamped.
 */
export function solveECR2CounterCurrentBVP(input: ECR2CounterCurrentBVPInput): ECR2CounterCurrentBVPResult {
  const inputFailure = validateInput(input);
  if (inputFailure) return resultFailure(input, inputFailure, [inputFailure.message]);
  const totalIn = sum(input.rrboFeedComponentFlows_kg_h) + sum(input.nmpFeedComponentFlows_kg_h);
  const scales = COMPONENTS.map((_, index) => Math.max(
    input.rrboFeedComponentFlows_kg_h[index],
    input.nmpFeedComponentFlows_kg_h[index],
    totalIn * PROPOSED_SOLVER_TOLERANCE.residualScaleTotalFlowFraction,
  ));
  const options = {
    maxIterations: input.solverOptions?.maxIterations ?? PROPOSED_SOLVER_TOLERANCE.maxIterations,
    maxFunctionEvaluations: input.solverOptions?.maxFunctionEvaluations ?? PROPOSED_SOLVER_TOLERANCE.maxFunctionEvaluations,
    normalizedResidual: input.solverOptions?.normalizedResidual ?? PROPOSED_SOLVER_TOLERANCE.normalizedResidual,
    relativeStateChange: input.solverOptions?.relativeStateChange ?? PROPOSED_SOLVER_TOLERANCE.relativeStateChange,
    transferStrength: input.solverOptions?.transferStrength ?? 1,
  };
  const guess = scaledInitialGuess(input);
  const diagnostics = [
    `Initial profile: ${guess.source}.`,
    'Method: projected damped Gauss-Newton bounded nonlinear least squares with lower bounds D,C ≥ 0 and feasibility-preserving line search.',
    'Transfer conversion: M_i,j = lambda × r_i,j × (A_column × Δz_j) × 3600; φ_d is contained only in a = 6φ_d/d32.',
    `Target transfer strength λ=${options.transferStrength}.`,
  ];
  const evaluations = { count: 0, max: options.maxFunctionEvaluations };

  const solveAtLambda = (initial: number[], lambda: number) => {
    let state = [...initial];
    let current = evaluate(input, state, lambda, scales);
    evaluations.count++;
    if (!current.valid) return { state, current, converged: false, iterations: 0, stateChange: Number.POSITIVE_INFINITY };
    let damping = PROPOSED_SOLVER_TOLERANCE.initialDamping;
    let trust = PROPOSED_SOLVER_TOLERANCE.initialTrustRegionRelative * Math.max(1, norm2(state));
    // The zero-transfer profile is an exact λ=0 solution. Its implicit state
    // change is zero, not "unknown", so the residual/state acceptance checks
    // remain jointly meaningful at the continuation origin.
    let lastChange = 0;
    for (let iteration = 1; iteration <= options.maxIterations && evaluations.count < evaluations.max; iteration++) {
      const maxResidual = Math.max(...current.residualNormalized.map((value) => Math.abs(value)));
      if (maxResidual <= options.normalizedResidual && lastChange <= options.relativeStateChange * Math.max(1, norm2(state))) {
        return { state, current, converged: true, iterations: iteration - 1, stateChange: lastChange };
      }
      const step = gaussNewtonStep(input, state, current, lambda, scales, damping, evaluations);
      if (!step) {
        damping *= 10;
        if (damping > PROPOSED_SOLVER_TOLERANCE.maximumDamping) break;
        continue;
      }
      const stepNorm = norm2(step);
      const trustScale = stepNorm > trust ? trust / stepNorm : 1;
      const cost = norm2(current.residualNormalized) ** 2;
      let alpha = trustScale;
      let accepted: Evaluation | null = null;
      let candidate: number[] | null = null;
      while (alpha >= PROPOSED_SOLVER_TOLERANCE.minimumLineSearchFraction && evaluations.count < evaluations.max) {
        const trial = state.map((value, index) => Math.max(0, value + alpha * step[index]));
        const trialEvaluation = evaluate(input, trial, lambda, scales);
        evaluations.count++;
        if (trialEvaluation.valid && norm2(trialEvaluation.residualNormalized) ** 2 < cost) {
          accepted = trialEvaluation;
          candidate = trial;
          break;
        }
        alpha /= 2;
      }
      if (!accepted || !candidate) {
        // Once the scaled balances meet tolerance, the absence of any
        // feasibility-preserving residual-reducing step establishes a zero
        // accepted state change for this bounded trust-region iteration.
        if (maxResidual <= options.normalizedResidual) {
          return { state, current, converged: true, iterations: iteration, stateChange: 0 };
        }
        damping *= 10;
        trust *= 0.5;
        if (damping > PROPOSED_SOLVER_TOLERANCE.maximumDamping || trust < 1e-14) break;
        continue;
      }
      lastChange = norm2(candidate.map((value, index) => value - state[index])) / Math.max(1, norm2(state));
      state = candidate;
      current = accepted;
      damping = Math.max(PROPOSED_SOLVER_TOLERANCE.initialDamping * 1e-6, damping / 3);
      trust = Math.min(trust * 1.5, Math.max(1, norm2(state)));
    }
    return { state, current, converged: false, iterations: options.maxIterations, stateChange: lastChange };
  };

  // First attempt full coupling.  Continuation is used only after a full
  // coupling failure, preserving the stated hierarchy.
  let solved = solveAtLambda(guess.state, options.transferStrength);
  let totalIterations = solved.iterations;
  if (!solved.converged && options.transferStrength > 0) {
    diagnostics.push(`Direct λ=${options.transferStrength} solve was not accepted; retrying via transfer-strength continuation.`);
    let state = [...guess.state];
    let continuationOk = true;
    const stages = [0, 0.25, 0.5, 0.75, 1].map((stage) => stage * options.transferStrength);
    for (const lambda of stages) {
      const stage = solveAtLambda(state, lambda);
      totalIterations += stage.iterations;
      if (!stage.current.valid) {
        continuationOk = false;
        solved = stage;
        break;
      }
      state = stage.state;
      solved = stage;
      if (!stage.converged) {
        continuationOk = false;
        break;
      }
    }
    if (continuationOk) diagnostics.push(`Continuation λ=0 → ${options.transferStrength} accepted.`);
  }
  if (!solved.current.valid) {
    const failure = solved.current.failure ?? invalid('solver', 'The nonlinear trial became infeasible.');
    return resultFailure(input, failure, [...diagnostics, failure.message], evaluations.count);
  }
  return resultFromEvaluation(
    input,
    solved.converged ? 'converged' : 'non_converged',
    solved.state,
    solved.current,
    totalIterations,
    evaluations.count,
    solved.converged ? diagnostics : [...diagnostics, 'Non-convergence diagnostics retained: residual, state vector, and last feasible local compartments are returned.'],
  );
}