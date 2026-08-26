// ═══════════════════════════════════════════════════════════════════════════
// ECR-2 — RRBO/NMP pre-pilot hydrodynamic comparison model
//
// This module is deliberately isolated from the production simulator. It
// evaluates an evidence-tagged sensitivity closure for engineering review; it
// never supplies holdup, d32, area, capacity, or transfer values to the BVP,
// height solver, optimizer, or release gate.
// ═══════════════════════════════════════════════════════════════════════════

import {
  computeDropletDiameter,
  isD32Usable,
  type D32Result,
  type DirectTurbulencePreliminaryD32Config,
} from './llx-ecr2-d32-interface';
import {
  computeKH1995Holdup,
  type HoldupInputs,
  type KH1995HoldupResult,
} from './llx-ecr2-holdup';

const PI = Math.PI;
const ROOT_EPSILON = 1e-8;
export const MAX_PREPILOT_SENSITIVITY_CASES = 12;

export type PrePilotEvidenceQuality =
  | 'primary_verified'
  | 'secondary_reproduced'
  | 'mechanistic_identity'
  | 'project_controlled_preliminary'
  | 'pilot_measurement_required';

export interface PrePilotCandidateRecord {
  id: string;
  quantity:
    | 'holdup'
    | 'mass_transfer_direction'
    | 'd32'
    | 'slip'
    | 'capacity_flooding'
    | 'power_agitation'
    | 'interfacial_area'
    | 'mass_transfer';
  name: string;
  source: string;
  equationStructure: string;
  variables: readonly string[];
  phaseConvention: string;
  geometryAndOperatingInputs: readonly string[];
  experimentalDomain: string;
  rrboNmpSimilarity: 'direct' | 'analogue_only' | 'not_established';
  extrapolationDistance: string;
  knownLimitations: readonly string[];
  uncertainty: string;
  evidenceQuality: PrePilotEvidenceQuality;
  lifecycle: 'benchmark_only' | 'prepilot_selected' | 'prepilot_comparator' | 'measurement_required';
}

/**
 * Controlled source-and-equation matrix. The records distinguish a reproducible
 * equation from an approved RRBO/NMP design basis: none is release eligible.
 */
export const ECR2_PREPILOT_HYDRODYNAMIC_CANDIDATES: readonly PrePilotCandidateRecord[] = [
  {
    id: 'kh1995_primary_holdup_benchmark',
    quantity: 'holdup',
    name: 'Kumar & Hartland 1995 dispersed-holdup benchmark',
    source: 'Kumar, A. & Hartland, S. (1995), Ind. Eng. Chem. Res. 34, 3925–3940, Eq. 15–19 and Table 2.',
    equationStructure: 'φd = [0.0267 + (εθ/g)^0.77]·(Udθ)^0.64·exp(20.7Ucθ)·[(ρc−ρd)/ρc]^−0.34·CΨ·2.27xf^−0.77; ε=P/(AcHρc).',
    variables: ['Ud', 'Uc', 'ρc', 'ρd', 'γ', 'xf', 'P', 'Ac', 'H', 'CΨ'],
    phaseConvention: 'NMP=continuous; RRBO=dispersed.',
    geometryAndOperatingInputs: ['column diameter', 'rotor diameter', 'compartment height', 'stator free area', 'one-agitator power'],
    experimentalDomain: 'Published liquid-liquid Kühni data envelope in Table 1.',
    rrboNmpSimilarity: 'not_established',
    extrapolationDistance: 'Computed per independent Table 1 variable; RRBO/NMP validation gap and bidirectional CΨ gap are retained.',
    knownLimitations: ['No single published CΨ for bidirectional multicomponent transfer.', 'Production implementation correctly fails closed outside source applicability or without RRBO/NMP validation.'],
    uncertainty: 'The primary equation has no accepted RRBO/NMP calibration uncertainty; it is reported as a benchmark only.',
    evidenceQuality: 'primary_verified',
    lifecycle: 'benchmark_only',
  },
  {
    id: 'pilot_calibrated_hindrance_closure',
    quantity: 'holdup',
    name: 'Mechanistic pilot-calibrated hindrance closure',
    source: 'Richardson, J. F. & Zaki, W. N. (1954), Trans. Inst. Chem. Eng. 32, 35–53 (hindrance form); applied here only as a source-tagged RRBO/NMP pilot-fit closure.',
    equationStructure: 'Ud/φd + Uc/(1−φd) = uK·(1−φd)^n, solved for every physical root 0<φd<1.',
    variables: ['Ud', 'Uc', 'uK', 'n', 'φd'],
    phaseConvention: 'NMP=continuous; RRBO=dispersed. The closure is hydrodynamic and does not select CΨ.',
    geometryAndOperatingInputs: ['phase volumetric flows', 'column area', 'uK and n measured/fitted for the actual compartment geometry'],
    experimentalDomain: 'To be fitted only within a RRBO/NMP pilot matrix spanning geometry, flow ratio, power and transfer direction.',
    rrboNmpSimilarity: 'direct',
    extrapolationDistance: 'Not quantified until RRBO/NMP pilot measurements define the fitted domain.',
    knownLimitations: ['uK and n are not universal liquid-liquid constants.', 'Multiple roots are exposed; the lower root is a reportable branch, not an operating recommendation.', 'No capacity or flooding claim follows from a root.'],
    uncertainty: 'Quantified only from user-supplied/pilot confidence ranges for uK and n; otherwise measurement-required.',
    evidenceQuality: 'mechanistic_identity',
    lifecycle: 'prepilot_selected',
  },
  {
    id: 'bidirectional_cpsi_replacement',
    quantity: 'mass_transfer_direction',
    name: 'Direction-neutral hydrodynamic replacement for a single CΨ',
    source: 'Architectural replacement derived from the mechanistic hindrance closure; K&H (1995) Table 2 remains separately preserved for its one-way benchmark factors.',
    equationStructure: 'No CΨ is applied. Bidirectional transfer effects must be represented by separately fitted RRBO/NMP uK,n (or a future validated directional closure), with transfer condition recorded in the pilot data.',
    variables: ['uK', 'n', 'transfer condition', 'φd'],
    phaseConvention: 'NMP continuous / RRBO dispersed; actual-transfer and no-transfer experiments remain distinct conditions.',
    geometryAndOperatingInputs: ['full pilot geometry', 'phase flow rates', 'delivered power', 'temperature', 'declared transfer condition'],
    experimentalDomain: 'No transferable RRBO/NMP directional model currently exists; only an actual pilot calibration may support this replacement.',
    rrboNmpSimilarity: 'direct',
    extrapolationDistance: 'Unquantified until matched RRBO/NMP pilot data exist.',
    knownLimitations: ['Does not claim that mass transfer is absent.', 'Does not convert the K&H one-way CΨ values into a bidirectional factor.', 'Requires condition-specific calibration and uncertainty.'],
    uncertainty: 'Cannot be quantified before paired no-transfer/actual-transfer RRBO/NMP pilot tests are available.',
    evidenceQuality: 'pilot_measurement_required',
    lifecycle: 'prepilot_selected',
  },
  {
    id: 'direct_turbulence_d32_preliminary',
    quantity: 'd32',
    name: 'Direct-turbulence d32 sensitivity',
    source: 'Project-controlled preliminary route; evidence register documents that no authoritative source verifies the C=0.36–0.43 interval for this exact ECR-2 route.',
    equationStructure: 'd32=C·(γ/ρc)^0.6·ε^−0.4, ε=P/(AcHρc).',
    variables: ['C', 'γ', 'ρc', 'ε'],
    phaseConvention: 'NMP=continuous density; RRBO=dispersed drops.',
    geometryAndOperatingInputs: ['one-agitator power', 'column area', 'physical compartment height', 'temperature-matched γ and ρc'],
    experimentalDomain: 'No verified RRBO/NMP or Kühni fitted interval.',
    rrboNmpSimilarity: 'not_established',
    extrapolationDistance: 'Unquantified; C-range sensitivity is project controlled, not a validated applicability range.',
    knownLimitations: ['Not K&H 1996.', 'Breakup-only scaling omits coalescence and distribution width.', 'Must be calibrated to measured RRBO/NMP d32 before use beyond sensitivity studies.'],
    uncertainty: 'C range gives an explicit numerical d32 interval; all remaining model discrepancy is unquantified pending pilot data.',
    evidenceQuality: 'project_controlled_preliminary',
    lifecycle: 'prepilot_selected',
  },
  {
    id: 'measured_d32_population',
    quantity: 'd32',
    name: 'Stagewise measured d32 distribution',
    source: 'Required RRBO/NMP pilot measurement: optical/high-speed imaging or validated sampling method with stated population statistic.',
    equationStructure: 'd32 = Σni di^3 / Σni di^2 from the measured droplet population.',
    variables: ['ni', 'di'],
    phaseConvention: 'RRBO dispersed droplet population in NMP continuous phase.',
    geometryAndOperatingInputs: ['actual compartment geometry', 'actual power/torque', 'actual phase flows and transfer condition'],
    experimentalDomain: 'RRBO/NMP pilot operating matrix.',
    rrboNmpSimilarity: 'direct',
    extrapolationDistance: 'None inside the measured pilot matrix; outside is explicitly unquantified.',
    knownLimitations: ['Sampling/imaging bias and axial non-uniformity must be documented.', 'A measured d32 does not validate holdup, capacity or film transfer alone.'],
    uncertainty: 'Quantified by replicate measurements and image-analysis uncertainty.',
    evidenceQuality: 'pilot_measurement_required',
    lifecycle: 'measurement_required',
  },
  {
    id: 'phase_continuity_slip_identity',
    quantity: 'slip',
    name: 'Two-phase continuity slip identity',
    source: 'Two-phase superficial-velocity identity; implemented independently in the ECR-2 interfacial-area module.',
    equationStructure: 'Uslip=Ud/φd + Uc/(1−φd).',
    variables: ['Ud', 'Uc', 'φd'],
    phaseConvention: 'RRBO=dispersed upward superficial velocity Ud; NMP=continuous counter-current superficial velocity Uc.',
    geometryAndOperatingInputs: ['phase flow rates', 'column cross-sectional area', 'holdup'],
    experimentalDomain: 'Identity, not a fitted correlation.',
    rrboNmpSimilarity: 'direct',
    extrapolationDistance: 'Not applicable to the identity; uncertainty propagates from flow and holdup.',
    knownLimitations: ['Does not predict holdup or terminal/characteristic velocity.', 'Requires the correct phase continuity convention.'],
    uncertainty: 'Propagated from the selected holdup closure and measured phase flows.',
    evidenceQuality: 'mechanistic_identity',
    lifecycle: 'prepilot_selected',
  },
  {
    id: 'pilot_operability_envelope',
    quantity: 'capacity_flooding',
    name: 'Observed pilot operability envelope',
    source: 'Required RRBO/NMP pilot matrix with documented onset criteria (entrainment, phase inversion, inventory instability, torque/power excursion).',
    equationStructure: 'No transferable correlation admitted. Capacity is an observed boundary in {Ud,Uc,P,geometry,fluid state} space.',
    variables: ['Ud', 'Uc', 'P', 'geometry', 'temperature', 'φd', 'd32'],
    phaseConvention: 'NMP continuous / RRBO dispersed must be confirmed in each observed condition.',
    geometryAndOperatingInputs: ['full rotor/stator geometry', 'column diameter', 'compartment height', 'actual torque/power'],
    experimentalDomain: 'RRBO/NMP pilot only.',
    rrboNmpSimilarity: 'direct',
    extrapolationDistance: 'Not available before the pilot matrix exists.',
    knownLimitations: ['No generic C3 utilization may be substituted.', 'A holdup root or invalid empirical output is not flooding evidence.'],
    uncertainty: 'Cannot be quantified before repeated observed boundary testing.',
    evidenceQuality: 'pilot_measurement_required',
    lifecycle: 'measurement_required',
  },
  {
    id: 'one_agitator_power_identity',
    quantity: 'power_agitation',
    name: 'One-agitator compartment power basis',
    source: 'Kumar & Hartland (1995), Eq. 15–19 power-dissipation definition retained as an auditable identity.',
    equationStructure: 'ε=P/(Ac·H·ρc).',
    variables: ['P', 'Ac', 'H', 'ρc'],
    phaseConvention: 'Continuous-phase density ρc=NMP.',
    geometryAndOperatingInputs: ['one agitator power', 'column cross-sectional area', 'physical mechanical compartment height'],
    experimentalDomain: 'Identity used to preserve a single declared power basis.',
    rrboNmpSimilarity: 'analogue_only',
    extrapolationDistance: 'No correlation extrapolation; torque/idle-loss measurement remains required for actual delivered P.',
    knownLimitations: ['Nameplate or shaft input is not automatically liquid dissipated power.', 'No alternative volume or second holdup multiplier is allowed.'],
    uncertainty: 'Quantify from torque, speed, motor efficiency and idle-loss measurements; otherwise measurement-required.',
    evidenceQuality: 'primary_verified',
    lifecycle: 'prepilot_selected',
  },
  {
    id: 'drop_population_interfacial_area',
    quantity: 'interfacial_area',
    name: 'Drop-population interfacial-area identity',
    source: 'Standard drop-population identity; also reported in K&H (1999)/Laitinen et al. (2019) secondary treatment.',
    equationStructure: 'a=6φd/d32.',
    variables: ['φd', 'd32'],
    phaseConvention: 'φd=RRBO dispersed-phase volume fraction.',
    geometryAndOperatingInputs: ['selected holdup', 'selected or measured d32'],
    experimentalDomain: 'Identity for a monodisperse Sauter representation.',
    rrboNmpSimilarity: 'direct',
    extrapolationDistance: 'Not applicable to the identity; representation error depends on the true droplet population.',
    knownLimitations: ['Does not independently validate φd or d32.', 'φd is included once only; no second phase-fraction multiplier is permitted.'],
    uncertainty: 'Propagated from holdup and d32 uncertainty.',
    evidenceQuality: 'mechanistic_identity',
    lifecycle: 'prepilot_selected',
  },
  {
    id: 'kh1999_mass_transfer_comparator',
    quantity: 'mass_transfer',
    name: 'K&H 1999 local mass-transfer comparator',
    source: 'Kumar & Hartland (1999), Trans IChemE A 77, 372–384; secondary equation structures in Torab-Mostaedi et al. (2011) and Asadollahzadeh et al. (2017).',
    equationStructure: 'kc=ShcDc/d32; kd=ShdDd/d32; Koa=Koverall·a after an approved componentwise partition/resistance basis.',
    variables: ['Shc', 'Shd', 'Dc', 'Dd', 'd32', 'a', 'componentwise partition basis'],
    phaseConvention: 'NMP-rich continuous phase and RRBO-rich dispersed phase; transfer sign RRBO→NMP.',
    geometryAndOperatingInputs: ['d32', 'slip', 'holdup', 'power basis', 'component diffusivities and local properties'],
    experimentalDomain: 'Kühni and liquid-liquid literature contexts, not yet verified for RRBO/NMP.',
    rrboNmpSimilarity: 'analogue_only',
    extrapolationDistance: 'Unquantified pending primary source range, regime definition and RRBO/NMP pilot validation.',
    knownLimitations: ['No governed regime selector, ψ definition, characteristic drop velocity or two-film partition basis.', 'Numerical Koa/rate cannot feed a design result from this route.'],
    uncertainty: 'Cannot be quantified before the model structure and RRBO/NMP calibration are resolved.',
    evidenceQuality: 'secondary_reproduced',
    lifecycle: 'prepilot_comparator',
  },
  {
    id: 'pilot_effective_koa',
    quantity: 'mass_transfer',
    name: 'Componentwise pilot effective Koa fit',
    source: 'Proposed RRBO/NMP pilot regression using NRTL-derived concentration driving forces and independently held-out axial/outlet data.',
    equationStructure: 'ratei=Koa,i·ΔCi, with componentwise Koa,i fitted only to its declared pilot domain.',
    variables: ['Koa,i', 'ΔCi', 'temperature', 'flow ratio', 'power', 'geometry'],
    phaseConvention: 'Component order Sat/Mono/Di/Poly/NMP retained; no pooled aromatic or surrogate-to-physical shortcut.',
    geometryAndOperatingInputs: ['pilot geometry', 'actual power', 'phase flows', 'local/boundary compositions'],
    experimentalDomain: 'RRBO/NMP pilot data only.',
    rrboNmpSimilarity: 'direct',
    extrapolationDistance: 'Not applicable before calibration; domain bounds must be persisted with the fit.',
    knownLimitations: ['Empirical effective coefficient, not a transferable film correlation.', 'Requires thermodynamic driving-force and mass-balance validation.'],
    uncertainty: 'Fit covariance and hold-out error after a pilot data set exists.',
    evidenceQuality: 'pilot_measurement_required',
    lifecycle: 'measurement_required',
  },
] as const;

export type PrePilotQuantityStatus = 'CALCULATED_PRELIMINARY' | 'NOT_CALCULABLE' | 'INPUT_INVALID';

export interface PrePilotUncertaintyRange {
  lower: number;
  upper: number;
  basis: string;
}

export interface PrePilotSensitivityCase {
  id: string;
  label: string;
  overrides: Partial<Pick<ECR2PrePilotHydrodynamicInput,
    'rrboVolumetricFlow_m3_s' | 'nmpVolumetricFlow_m3_s' | 'columnDiameter_m' |
    'physicalCompartmentHeight_m' | 'powerPerAgitator_W' | 'rhoContinuous_kg_m3' |
    'rhoDispersed_kg_m3' | 'gamma_N_m' | 'characteristicSlipVelocity_m_s' |
    'hindranceExponent'>>;
  basis: string;
}

export interface ECR2PrePilotHydrodynamicInput {
  rrboVolumetricFlow_m3_s: number;
  nmpVolumetricFlow_m3_s: number;
  columnDiameter_m: number;
  rotorDiameter_m: number;
  physicalCompartmentHeight_m: number;
  statorOpenAreaFraction: number;
  powerPerAgitator_W: number;
  rhoContinuous_kg_m3: number;
  rhoDispersed_kg_m3: number;
  muContinuous_Pa_s: number;
  muDispersed_Pa_s: number;
  gamma_N_m: number;
  characteristicSlipVelocity_m_s: number;
  hindranceExponent: number;
  characteristicSlipEvidence: {
    sourceType: 'measured' | 'vendor' | 'literature_analogy' | 'assumed';
    sourceReference: string;
    uncertainty?: PrePilotUncertaintyRange;
  };
  hindranceEvidence: {
    sourceType: 'measured' | 'vendor' | 'literature_analogy' | 'assumed';
    sourceReference: string;
    uncertainty?: PrePilotUncertaintyRange;
  };
  /**
   * This isolated review accepts only the declared direct-turbulence
   * preliminary route. A measured/pilot d32 route needs its own explicit
   * review contract rather than silently changing the package basis.
   */
  d32Config: DirectTurbulencePreliminaryD32Config;
  sensitivityCases?: readonly PrePilotSensitivityCase[];
}

export interface PrePilotRoot {
  phi_d: number;
  U_slip_m_s: number;
  residual_m_s: number;
}

export const ECR2_PREPILOT_HINDRANCE_MODEL_ID = 'pilot_calibrated_hindrance_closure';
export const ECR2_PREPILOT_HINDRANCE_MODEL_VERSION = '1.0.0';

export interface ECR2PrePilotHindranceModel {
  modelId: typeof ECR2_PREPILOT_HINDRANCE_MODEL_ID;
  modelVersion: typeof ECR2_PREPILOT_HINDRANCE_MODEL_VERSION;
  characteristicSlipVelocity_m_s: number;
  hindranceExponent: number;
  characteristicSlipEvidence: {
    sourceReference: string;
  };
  hindranceEvidence: {
    sourceReference: string;
  };
}

export function validatePrePilotHindranceModel(
  value: unknown,
): { valid: boolean; errors: string[]; model: ECR2PrePilotHindranceModel | null } {
  const record = isRecord(value) ? value : null;
  const errors: string[] = [];
  if (!record) errors.push('model object is required');
  if (record?.modelId !== ECR2_PREPILOT_HINDRANCE_MODEL_ID) errors.push('modelId is not the reviewed hindrance closure');
  if (record?.modelVersion !== ECR2_PREPILOT_HINDRANCE_MODEL_VERSION) errors.push('modelVersion is not supported');
  if (!finitePositive(record?.characteristicSlipVelocity_m_s)) errors.push('characteristicSlipVelocity_m_s must be finite and > 0');
  if (!finitePositive(record?.hindranceExponent)) errors.push('hindranceExponent must be finite and > 0');
  const slipEvidence = isRecord(record?.characteristicSlipEvidence) ? record.characteristicSlipEvidence : null;
  const hindranceEvidence = isRecord(record?.hindranceEvidence) ? record.hindranceEvidence : null;
  if (!nonBlankString(slipEvidence?.sourceReference)) errors.push('characteristicSlipEvidence.sourceReference is required');
  if (!nonBlankString(hindranceEvidence?.sourceReference)) errors.push('hindranceEvidence.sourceReference is required');
  return {
    valid: errors.length === 0,
    errors,
    model: errors.length === 0 ? record as unknown as ECR2PrePilotHindranceModel : null,
  };
}

export interface ECR2PrePilotHydrodynamicCore {
  status: PrePilotQuantityStatus;
  diagnostics: readonly string[];
  geometry: {
    columnArea_m2: number;
    columnDiameter_m: number;
    rotorDiameter_m: number;
    physicalCompartmentHeight_m: number;
  } | null;
  power: {
    epsilon_W_kg: number;
    basis: 'epsilon = P/(Ac·H·rho_c)';
    powerPerAgitator_W: number;
  } | null;
  superficialVelocities: { Ud_m_s: number; Uc_m_s: number } | null;
  roots: readonly PrePilotRoot[];
  selectedLowerBranch: PrePilotRoot | null;
  branchStatus: 'NO_PHYSICAL_ROOT' | 'ONE_ROOT' | 'MULTIPLE_ROOTS_LOWEST_REPORT_ONLY' | 'INPUT_INVALID';
  d32: D32Result | null;
  interfacialArea_m2_m3: number | null;
  capacityFlooding: {
    status: 'NOT_CALCULABLE';
    value: null;
    message: string;
  };
  massTransfer: {
    status: 'NOT_CALCULABLE';
    value: null;
    message: string;
  };
}

export interface ECR2PrePilotSensitivityResult {
  id: string;
  label: string;
  basis: string;
  core: ECR2PrePilotHydrodynamicCore;
}

export interface ECR2PrePilotHydrodynamicReview {
  reviewType: 'ECR2_RRBO_NMP_PREPILOT_HYDRODYNAMIC_COMPARISON';
  reviewStatus: 'PRELIMINARY_ENGINEERING_ONLY';
  productionEligibility: {
    bvp: 'BLOCKED';
    heightSizing: 'BLOCKED';
    diameter: 'BLOCKED';
    theoreticalStages: 'BLOCKED';
    capacityOrFloodingClaim: 'BLOCKED';
    releaseEligibility: 'BLOCKED';
    rule: string;
  };
  selectedRoute: {
    holdup: 'pilot_calibrated_hindrance_closure';
    d32: 'direct_turbulence_d32_preliminary';
    slip: 'phase_continuity_slip_identity';
    power: 'one_agitator_power_identity';
    interfacialArea: 'drop_population_interfacial_area';
    capacityFlooding: 'pilot_operability_envelope';
    massTransfer: 'kh1999_mass_transfer_comparator';
    cPsiTreatment: string;
  };
  candidateMatrix: readonly PrePilotCandidateRecord[];
  kh1995Benchmark: KH1995HoldupResult;
  selectedAlternative: ECR2PrePilotHydrodynamicCore;
  sensitivities: readonly ECR2PrePilotSensitivityResult[];
  uncertaintyBudget: readonly {
    item: string;
    status: 'QUANTIFIED' | 'MEASUREMENT_REQUIRED';
    statement: string;
  }[];
  requiredMeasurements: readonly string[];
  approvalHandoff: {
    recommendation: string;
    acceptanceCriteria: readonly string[];
    laterApprovalTaskRequirement: string;
  };
}

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const PREPILOT_NUMERIC_FIELDS = [
  'rrboVolumetricFlow_m3_s', 'nmpVolumetricFlow_m3_s', 'columnDiameter_m',
  'rotorDiameter_m', 'physicalCompartmentHeight_m', 'statorOpenAreaFraction',
  'powerPerAgitator_W', 'rhoContinuous_kg_m3', 'rhoDispersed_kg_m3',
  'muContinuous_Pa_s', 'muDispersed_Pa_s', 'gamma_N_m',
  'characteristicSlipVelocity_m_s', 'hindranceExponent',
] as const;

const SENSITIVITY_OVERRIDE_FIELDS = new Set([
  'rrboVolumetricFlow_m3_s', 'nmpVolumetricFlow_m3_s', 'columnDiameter_m',
  'physicalCompartmentHeight_m', 'powerPerAgitator_W', 'rhoContinuous_kg_m3',
  'rhoDispersed_kg_m3', 'gamma_N_m', 'characteristicSlipVelocity_m_s',
  'hindranceExponent',
]);

function validateUncertainty(
  label: string,
  value: number,
  uncertainty: unknown,
  errors: string[],
): void {
  if (uncertainty === undefined) return;
  if (!isRecord(uncertainty)
    || !finitePositive(uncertainty.lower)
    || !finitePositive(uncertainty.upper)
    || uncertainty.lower > value
    || uncertainty.upper < value
    || !nonBlankString(uncertainty.basis)) {
    errors.push(`${label}.uncertainty must provide finite positive lower ≤ selected value ≤ upper and a nonblank basis`);
  }
}

/**
 * Runtime guard for the read-only HTTP boundary. The exported builder is also
 * used by tests/internal callers, while this guard ensures JSON never changes
 * the declared evidence route or creates unbounded sensitivity work.
 */
export function validateECR2PrePilotHydrodynamicInput(value: unknown): {
  valid: boolean;
  errors: readonly string[];
  input?: ECR2PrePilotHydrodynamicInput;
} {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['Input must be an object'] };
  for (const field of PREPILOT_NUMERIC_FIELDS) {
    if (!finitePositive(value[field])) errors.push(`${field} must be a finite positive number`);
  }
  if (finitePositive(value.rhoContinuous_kg_m3) && finitePositive(value.rhoDispersed_kg_m3)
    && value.rhoContinuous_kg_m3 <= value.rhoDispersed_kg_m3) {
    errors.push('rhoContinuous_kg_m3 must be greater than rhoDispersed_kg_m3 for NMP-continuous/RRBO-dispersed review');
  }
  const provenanceTypes = new Set(['measured', 'vendor', 'literature_analogy', 'assumed']);
  for (const [label, selectedValue, evidence] of [
    ['characteristicSlipEvidence', value.characteristicSlipVelocity_m_s, value.characteristicSlipEvidence],
    ['hindranceEvidence', value.hindranceExponent, value.hindranceEvidence],
  ] as const) {
    if (!isRecord(evidence)
      || typeof selectedValue !== 'number'
      || !provenanceTypes.has(String(evidence.sourceType))
      || !nonBlankString(evidence.sourceReference)) {
      errors.push(`${label} requires an enumerated sourceType and nonblank sourceReference`);
    } else {
      validateUncertainty(label, selectedValue, evidence.uncertainty, errors);
    }
  }
  const d32 = value.d32Config;
  if (!isRecord(d32)
    || d32.mode !== 'direct_turbulence_preliminary'
    || d32.correlationId !== 'ecr2_d32_direct_turbulence_preliminary'
    || !finitePositive(d32.C_nominal)
    || Number(d32.C_nominal) < 0.36
    || Number(d32.C_nominal) > 0.43
    || !nonBlankString(d32.sourceType)
    || !nonBlankString(d32.sourceReference)) {
    errors.push('d32Config must be the direct-turbulence preliminary route with correlation ID ecr2_d32_direct_turbulence_preliminary, 0.36 ≤ C_nominal ≤ 0.43, and provenance');
  }
  if (value.sensitivityCases !== undefined) {
    if (!Array.isArray(value.sensitivityCases) || value.sensitivityCases.length > MAX_PREPILOT_SENSITIVITY_CASES) {
      errors.push(`sensitivityCases must contain at most ${MAX_PREPILOT_SENSITIVITY_CASES} cases`);
    } else {
      value.sensitivityCases.forEach((scenario, index) => {
        if (!isRecord(scenario)
          || !nonBlankString(scenario.id)
          || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(String(scenario.id))
          || !nonBlankString(scenario.label)
          || !nonBlankString(scenario.basis)
          || !isRecord(scenario.overrides)) {
          errors.push(`sensitivityCases[${index}] requires a bounded id, label, basis and overrides object`);
          return;
        }
        for (const [field, override] of Object.entries(scenario.overrides)) {
          if (!SENSITIVITY_OVERRIDE_FIELDS.has(field) || !finitePositive(override)) {
            errors.push(`sensitivityCases[${index}].overrides.${field} is not an allowed finite positive override`);
          }
        }
      });
    }
  }
  return errors.length
    ? { valid: false, errors }
    : { valid: true, errors, input: value as unknown as ECR2PrePilotHydrodynamicInput };
}

function columnArea(diameter_m: number): number {
  return (PI * diameter_m * diameter_m) / 4;
}

function closureResidual(phi: number, Ud: number, Uc: number, uK: number, n: number): number {
  return Ud / phi + Uc / (1 - phi) - uK * Math.pow(1 - phi, n);
}

function bisect(
  lower: number,
  upper: number,
  fn: (value: number) => number,
): number | null {
  let lo = lower;
  let hi = upper;
  let flo = fn(lo);
  const fhi = fn(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo === 0 || fhi === 0 || flo * fhi > 0) return null;
  for (let iteration = 0; iteration < 100; iteration++) {
    const mid = (lo + hi) / 2;
    const fmid = fn(mid);
    if (!Number.isFinite(fmid)) return null;
    if (Math.abs(fmid) < 1e-12 || hi - lo < 1e-12) return mid;
    if (flo * fmid <= 0) {
      hi = mid;
    } else {
      lo = mid;
      flo = fmid;
    }
  }
  return (lo + hi) / 2;
}

export function findPrePilotHindranceRoots(
  Ud: number,
  Uc: number,
  uK: number,
  n: number,
): PrePilotRoot[] {
  const fn = (phi: number) => closureResidual(phi, Ud, Uc, uK, n);
  const roots: number[] = [];
  let previousPhi = ROOT_EPSILON;
  let previousValue = fn(previousPhi);
  const segments = 2048;
  for (let index = 1; index <= segments; index++) {
    const phi = ROOT_EPSILON + ((1 - 2 * ROOT_EPSILON) * index) / segments;
    const value = fn(phi);
    if (Number.isFinite(previousValue) && Number.isFinite(value) && previousValue * value < 0) {
      const root = bisect(previousPhi, phi, fn);
      if (root !== null && !roots.some((existing) => Math.abs(existing - root) < 1e-7)) roots.push(root);
    }
    previousPhi = phi;
    previousValue = value;
  }
  return roots.map((phi_d) => ({
    phi_d,
    U_slip_m_s: Ud / phi_d + Uc / (1 - phi_d),
    residual_m_s: fn(phi_d),
  }));
}

function evaluateCore(input: ECR2PrePilotHydrodynamicInput): ECR2PrePilotHydrodynamicCore {
  const required: Array<[string, unknown]> = [
    ['rrboVolumetricFlow_m3_s', input.rrboVolumetricFlow_m3_s],
    ['nmpVolumetricFlow_m3_s', input.nmpVolumetricFlow_m3_s],
    ['columnDiameter_m', input.columnDiameter_m],
    ['rotorDiameter_m', input.rotorDiameter_m],
    ['physicalCompartmentHeight_m', input.physicalCompartmentHeight_m],
    ['statorOpenAreaFraction', input.statorOpenAreaFraction],
    ['powerPerAgitator_W', input.powerPerAgitator_W],
    ['rhoContinuous_kg_m3', input.rhoContinuous_kg_m3],
    ['rhoDispersed_kg_m3', input.rhoDispersed_kg_m3],
    ['muContinuous_Pa_s', input.muContinuous_Pa_s],
    ['muDispersed_Pa_s', input.muDispersed_Pa_s],
    ['gamma_N_m', input.gamma_N_m],
    ['characteristicSlipVelocity_m_s', input.characteristicSlipVelocity_m_s],
    ['hindranceExponent', input.hindranceExponent],
  ];
  const invalid = required.filter(([, value]) => !finitePositive(value)).map(([name]) => name);
  if (input.rhoContinuous_kg_m3 <= input.rhoDispersed_kg_m3) invalid.push('rhoContinuous_kg_m3 must be > rhoDispersed_kg_m3');
  if (!input.characteristicSlipEvidence?.sourceReference?.trim()) invalid.push('characteristicSlipEvidence.sourceReference');
  if (!input.hindranceEvidence?.sourceReference?.trim()) invalid.push('hindranceEvidence.sourceReference');
  if (invalid.length) {
    return {
      status: 'INPUT_INVALID',
      diagnostics: [`Pre-pilot hydrodynamic closure requires positive provenance-bearing inputs; invalid: ${invalid.join(', ')}.`],
      geometry: null, power: null, superficialVelocities: null, roots: [], selectedLowerBranch: null,
      branchStatus: 'INPUT_INVALID', d32: null, interfacialArea_m2_m3: null,
      capacityFlooding: { status: 'NOT_CALCULABLE', value: null, message: 'Capacity/flooding remains measurement-required.' },
      massTransfer: { status: 'NOT_CALCULABLE', value: null, message: 'K&H 1999 transfer coupling remains unresolved for RRBO/NMP design use.' },
    };
  }

  const area = columnArea(input.columnDiameter_m);
  const Ud = input.rrboVolumetricFlow_m3_s / area;
  const Uc = input.nmpVolumetricFlow_m3_s / area;
  const epsilon = input.powerPerAgitator_W / (area * input.physicalCompartmentHeight_m * input.rhoContinuous_kg_m3);
  const diagnostics = [
    'Selected alternative is a source-tagged mechanistic/pilot-calibratable closure, not a universal liquid-liquid correlation.',
    'No K&H CΨ is selected: bidirectional multicomponent hydrodynamics are represented by uK and n, which require RRBO/NMP pilot fitting or an explicit sensitivity basis.',
    'Capacity and flooding have no numerical result because only a documented RRBO/NMP pilot operability envelope can establish them.',
    'This isolated review output cannot feed production BVP, height sizing, diameter, N_T, feasibility, or release gates.',
  ];
  const roots = findPrePilotHindranceRoots(
    Ud,
    Uc,
    input.characteristicSlipVelocity_m_s,
    input.hindranceExponent,
  );
  const selectedLowerBranch = roots[0] ?? null;
  const branchStatus = roots.length === 0
    ? 'NO_PHYSICAL_ROOT'
    : roots.length === 1 ? 'ONE_ROOT' : 'MULTIPLE_ROOTS_LOWEST_REPORT_ONLY';
  if (roots.length > 1) diagnostics.push(`The closure has ${roots.length} physical roots. The lowest holdup branch is reported only for sensitivity comparison; no operating branch is recommended.`);
  if (!selectedLowerBranch) diagnostics.push('No physical holdup root was found in (0,1); no holdup, slip, or interfacial area is inferred.');

  const d32 = computeDropletDiameter({
    h_comp_m: input.physicalCompartmentHeight_m,
    psi_W_kg: epsilon,
    rho_c_kg_m3: input.rhoContinuous_kg_m3,
    rho_d_kg_m3: input.rhoDispersed_kg_m3,
    sigma_N_m: input.gamma_N_m,
  }, input.d32Config);
  if (!isD32Usable(d32)) diagnostics.push(`d32 is ${d32.status}; pre-pilot interfacial area is not calculated.`);
  const interfacialArea = selectedLowerBranch && isD32Usable(d32)
    ? (6 * selectedLowerBranch.phi_d) / d32.d32_m
    : null;
  if (interfacialArea !== null && (!Number.isFinite(interfacialArea) || interfacialArea <= 0)) {
    diagnostics.push('Pre-pilot interfacial-area identity produced an invalid result; no clipped value is reported.');
  }

  return {
    status: selectedLowerBranch && isD32Usable(d32) && interfacialArea !== null && Number.isFinite(interfacialArea) && interfacialArea > 0
      ? 'CALCULATED_PRELIMINARY'
      : 'NOT_CALCULABLE',
    diagnostics,
    geometry: {
      columnArea_m2: area,
      columnDiameter_m: input.columnDiameter_m,
      rotorDiameter_m: input.rotorDiameter_m,
      physicalCompartmentHeight_m: input.physicalCompartmentHeight_m,
    },
    power: {
      epsilon_W_kg: epsilon,
      basis: 'epsilon = P/(Ac·H·rho_c)',
      powerPerAgitator_W: input.powerPerAgitator_W,
    },
    superficialVelocities: { Ud_m_s: Ud, Uc_m_s: Uc },
    roots,
    selectedLowerBranch,
    branchStatus,
    d32,
    interfacialArea_m2_m3: interfacialArea !== null && Number.isFinite(interfacialArea) && interfacialArea > 0 ? interfacialArea : null,
    capacityFlooding: {
      status: 'NOT_CALCULABLE',
      value: null,
      message: 'No generic utilization or holdup threshold is substituted for a Kühni RRBO/NMP capacity/flooding criterion. Establish only from a documented pilot operability envelope.',
    },
    massTransfer: {
      status: 'NOT_CALCULABLE',
      value: null,
      message: 'K&H 1999 coupling remains a comparator only: regime selection, componentwise partition resistance and RRBO/NMP validation are unresolved.',
    },
  };
}

function kh1995Input(input: ECR2PrePilotHydrodynamicInput): HoldupInputs {
  const area = columnArea(input.columnDiameter_m);
  return {
    Ud_m_s: input.rrboVolumetricFlow_m3_s / area,
    Uc_m_s: input.nmpVolumetricFlow_m3_s / area,
    rho_c_kg_m3: input.rhoContinuous_kg_m3,
    rho_d_kg_m3: input.rhoDispersed_kg_m3,
    mu_c_Pa_s: input.muContinuous_Pa_s,
    mu_d_Pa_s: input.muDispersed_Pa_s,
    gamma_N_m: input.gamma_N_m,
    xf: input.statorOpenAreaFraction,
    powerPerAgitator_W: input.powerPerAgitator_W,
    columnCrossSectionArea_m2: area,
    compartmentHeight_m: input.physicalCompartmentHeight_m,
    columnDiameter_m: input.columnDiameter_m,
    rotorDiameter_m: input.rotorDiameter_m,
    massTransferDirection: 'bidirectional_multicomponent',
    systemIdentity: 'rrbo_nmp',
  };
}

function uncertaintyBudget(input: ECR2PrePilotHydrodynamicInput) {
  const parameter = (label: string, uncertainty: PrePilotUncertaintyRange | undefined, requirement: string) => ({
    item: label,
    status: uncertainty ? 'QUANTIFIED' as const : 'MEASUREMENT_REQUIRED' as const,
    statement: uncertainty
      ? `${uncertainty.basis}: [${uncertainty.lower}, ${uncertainty.upper}].`
      : requirement,
  });
  const d32Range = input.d32Config.mode === 'direct_turbulence_preliminary'
    ? 'Direct-turbulence C sensitivity is explicitly reported by the d32 result; it is not an authoritative applicability interval.'
    : 'd32 uncertainty requires a measured distribution or a controlled engineer-supplied uncertainty range.';
  return [
    parameter('Characteristic slip uK', input.characteristicSlipEvidence.uncertainty, 'Measure/fix uK for RRBO/NMP across the pilot matrix; no default uncertainty is invented.'),
    parameter('Hindrance exponent n', input.hindranceEvidence.uncertainty, 'Fit n with confidence bounds to RRBO/NMP pilot data; no universal exponent is assumed.'),
    { item: 'd32', status: input.d32Config.mode === 'direct_turbulence_preliminary' ? 'QUANTIFIED' as const : 'MEASUREMENT_REQUIRED' as const, statement: d32Range },
    { item: 'Capacity/flooding', status: 'MEASUREMENT_REQUIRED' as const, statement: 'Repeated observed operability-boundary testing is required; no generic C3 utilization is used.' },
    { item: 'K&H 1999 mass transfer', status: 'MEASUREMENT_REQUIRED' as const, statement: 'Primary equation/range, regime definition, componentwise resistance basis and RRBO/NMP calibration are needed before uncertainty can be quantified.' },
  ];
}

/**
 * Produces a read-only engineering-review package. The function has no imports
 * from the BVP/height solver and its output contract deliberately contains no
 * design-eligible diameter, height, N_T, flooding, feasibility, or release value.
 */
export function buildECR2PrePilotHydrodynamicReview(
  input: ECR2PrePilotHydrodynamicInput,
): ECR2PrePilotHydrodynamicReview {
  if (input.sensitivityCases && input.sensitivityCases.length > MAX_PREPILOT_SENSITIVITY_CASES) {
    throw new Error(`At most ${MAX_PREPILOT_SENSITIVITY_CASES} sensitivity cases are permitted`);
  }
  const selectedAlternative = evaluateCore(input);
  const sensitivities = (input.sensitivityCases ?? []).map((sensitivity) => ({
    id: sensitivity.id,
    label: sensitivity.label,
    basis: sensitivity.basis,
    core: evaluateCore({ ...input, ...sensitivity.overrides, sensitivityCases: undefined }),
  }));
  return {
    reviewType: 'ECR2_RRBO_NMP_PREPILOT_HYDRODYNAMIC_COMPARISON',
    reviewStatus: 'PRELIMINARY_ENGINEERING_ONLY',
    productionEligibility: {
      bvp: 'BLOCKED',
      heightSizing: 'BLOCKED',
      diameter: 'BLOCKED',
      theoreticalStages: 'BLOCKED',
      capacityOrFloodingClaim: 'BLOCKED',
      releaseEligibility: 'BLOCKED',
      rule: 'Pre-pilot model results are evidence-development diagnostics only. They do not satisfy any governed dependency gate without independent review and approval.',
    },
    selectedRoute: {
      holdup: 'pilot_calibrated_hindrance_closure',
      d32: 'direct_turbulence_d32_preliminary',
      slip: 'phase_continuity_slip_identity',
      power: 'one_agitator_power_identity',
      interfacialArea: 'drop_population_interfacial_area',
      capacityFlooding: 'pilot_operability_envelope',
      massTransfer: 'kh1999_mass_transfer_comparator',
      cPsiTreatment: 'No single CΨ is selected. The alternative closure is direction-neutral hydrodynamics and requires RRBO/NMP pilot-fit uK/n for each declared transfer condition.',
    },
    candidateMatrix: ECR2_PREPILOT_HYDRODYNAMIC_CANDIDATES,
    kh1995Benchmark: computeKH1995Holdup(kh1995Input(input)),
    selectedAlternative,
    sensitivities,
    uncertaintyBudget: uncertaintyBudget(input),
    requiredMeasurements: [
      'Stagewise RRBO dispersed-phase holdup over the intended Ud/Uc/power/temperature matrix, with no-transfer and actual-transfer conditions separated.',
      'Stagewise droplet-size distributions (not only one assumed d32) with imaging/sampling method and repeatability documented.',
      'Torque, speed, motor efficiency and idle-loss measurements to establish delivered liquid power for each geometry.',
      'Observed operability boundary: entrainment, phase inversion, inventory instability and torque/power excursion criteria.',
      'Componentwise RRBO/NMP phase compositions and verified overall balances to calibrate/validate any effective Koa model.',
      'Full rotor/stator geometry and actual free-area specification for every pilot condition.',
    ],
    approvalHandoff: {
      recommendation: 'Use this package only to design the pilot evidence matrix and rank information gaps. Retain K&H 1995 as a separately traceable benchmark; do not average or overwrite it with the alternative closure.',
      acceptanceCriteria: [
        'Pilot measurements cover the intended operating envelope and phase continuity.',
        'uK/n (or a replacement correlation) has a defined fitted domain, uncertainty and held-out validation.',
        'd32, holdup, delivered power and slip are jointly reconciled for the same geometry and condition.',
        'Capacity/flooding boundary is observed with explicit onset criteria; no generic utilization surrogate is used.',
        'Any mass-transfer model is componentwise, thermodynamically consistent and independently balance-validated.',
      ],
      laterApprovalTaskRequirement: 'The later approval/release task may consider evidence only after this review package and the required pilot evidence are independently accepted; this package itself cannot unlock governed results.',
    },
  };
}