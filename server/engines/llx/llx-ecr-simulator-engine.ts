// ═══════════════════════════════════════════════════════════════════════════════
// ECR-2 — LLX Agitated Extraction Column Simulator Engine (Stage C5-S)
//
// PHASE 1 SCAFFOLD — GEOMETRY, POWER, BOUNDARY CONDITIONS, HYDRAULICS, AND
// GOVERNED PRELIMINARY MASS-TRANSFER INTERFACE. No axial propagation, BVP,
// flooding, optimisation, or UI layer is implemented here.
//
// RELATIONSHIP TO ECR-1
// ─────────────────────
// ECR-1 (llx-ecr-engine.ts, calculation_type 'ecr') is frozen. This engine
// does NOT import from llx-ecr-engine.ts. ECR-1 remains the preliminary
// screening/reference model (C5). This engine is the simulator (C5-S).
//
// PHYSICAL ORIENTATION (FIXED — DO NOT CHANGE)
// ──────────────────────────────────────────────
//   z = 0  →  BOTTOM:  RRBO light phase enters (upward) · Extract exits
//   z = H  →  TOP:     Fresh NMP heavy phase enters (downward) · Raffinate exits
//
//   NMP flows:       TOP → BOTTOM (downward)
//   RRBO/raffinate:  BOTTOM → TOP (upward)
//
// COMPONENT SYSTEM (FROZEN — 5-COMPONENT PSEUDO-SYSTEM)
// ───────────────────────────────────────────────────────
//   Index 0 — Saturates   (IDX.SAT)
//   Index 1 — Mono-aromatics (IDX.MONO)
//   Index 2 — Di-aromatics   (IDX.DI)
//   Index 3 — Poly-aromatics (IDX.POLY)
//   Index 4 — NMP            (IDX.NMP)
//
// Reuses the existing governed NRTL pseudo-component system and τ parameters.
// No second characterization model is created.
//
// GOVERNANCE
// ──────────
// ECR2-001…ECR2-NNN formula references are reserved for this engine only.
// ECR-001…ECR-009 belong to ECR-1 and are not referenced here.
// ═══════════════════════════════════════════════════════════════════════════════

import {
  IDesignEngine,
  ValidationResult,
  ValidationError,
  CalculationContext,
  CalculationResult,
  DesignSummary,
  EngineWarning,
} from '../../engine-framework/types';

import {
  CEL_VERSION,
  EPD_VERSION,
  getProperty,
  createPropertyContext,
  containsAssumedData,
  columnCrossSectionArea,
  SOURCE_TYPES,
} from '../../engine-framework/common-engineering-library';

import type { SourceType } from '../../engine-framework/epd/types';
import {
  resolveRrboSn300DynamicViscosityAtTemperature,
} from '../../../shared/ecr2-stage8-transport-basis';
import {
  ECR2_RRBO_NMP_SIGMA_CONSTANT_PRELIMINARY_BASIS,
  resolveEcr2RrboNmpInterfacialTensionAtTemperature,
  resolveEcr2RrboNmpInterfacialTensionConstantAtTemperature,
} from '../../../shared/ecr2-interfacial-tension-basis';

// NRTL reuse: the run-level LLE flash and the local BVP calculations both use
// the governed CEL model. The function signature is
// nrtlFlash(z, T_K, x0, y0) → FlashResult, where x = raffinate-phase mole
// fractions and y = extract-phase mole fractions.
import {
  nrtlFlash,
  temperatureModelStatus,
  resolveThermodynamicValidityAtTemperature,
  TLLE_MODEL_ID,
  TLLE_MODEL_VERSION,
  TLLE_MODEL_NAME,
  TLLE_MODEL_CITATION,
} from '../../engine-framework/cel/llx-temperature-lle-model';

import {
  COTO_COMPONENTS,
  COTO_COMPONENT_ROLES,
  COTO_2022_DATASET_ID,
  COTO_2022_DATASET_VERSION,
  SURROGATE_MW,
} from '../../engine-framework/cel/coto2022-nmp-lle';
import { calculateHydrocarbonProductQuality } from '../../engine-framework/cel/product-quality-basis';

import {
  correlationRegistrySummary,
  isGoverned,
  ECR2_KH1999_PRELIMINARY_PARAMETERS,
} from './llx-ecr2-correlation-registry';

import {
  computeKH1995Holdup,
  isHoldupUsable,
  type KH1995HoldupResult,
} from './llx-ecr2-holdup';

import {
  computeDropletDiameter,
  isD32Usable,
  drivingForceContractDefined,
  drivingForceContractNote,
  type D32Config,
  type D32Result,
} from './llx-ecr2-d32-interface';

import {
  computeInterfacialArea,
  computeSlipVelocity,
  type InterfacialAreaResult,
} from './llx-ecr2-interfacial-area';

import {
  buildDependencyGraph,
  type ECR2DependencyGraph,
  NULL_BLOCKED_D32,
  NULL_BLOCKED_HOLDUP,
  NULL_BLOCKED_INTERFACIAL_AREA,
  NULL_BLOCKED_KC,
  NULL_BLOCKED_KD,
  NULL_BLOCKED_K_OVERALL,
  NULL_PHASE2,
  NULL_LOCAL_PROPERTIES,
} from './llx-ecr2-compartment-state';

import {
  createUnavailableKH1999PreliminaryLocalMassTransfer,
  type ECR2KH1999LocalMassTransferResult,
} from './llx-ecr2-kh1999-mass-transfer';
import {
  solveECR2CounterCurrentBVP,
  createECR2BVPBlockedResult,
  type ECR2CounterCurrentBVPResult,
  type ECR2CounterCurrentBVPInput,
} from './llx-ecr2-counter-current-bvp';
import {
  createECR2ProgressiveHeightBlockedResult,
  solveECR2ProgressiveHeight,
  type ECR2ProgressiveHeightSolveResult,
} from './llx-ecr2-progressive-height-solver';
import {
  createECR2ProgressiveCompartmentBlockedResult,
  solveECR2ProgressiveCompartments,
  type ECR2ProgressiveCompartmentResult,
} from './llx-ecr2-progressive-compartment-solver';
import {
  solveECR2IdealStageCascade,
  type ECR2IdealStageCascadeResult,
} from './llx-ecr2-ideal-stage-cascade';
import { emptyDiffusivityContract } from './llx-ecr2-diffusivity';
import {
  ECR2_STAGE8_NUMERICAL_PARAMETER_IDS,
} from '../../../shared/ecr2-stage8-evidence';

// ── Constants ─────────────────────────────────────────────────────────────────

const ENGINE_ID      = 'llx-ecr-simulator';
const ENGINE_VERSION = '2.1.0';
const CALCULATION_TYPE = 'ecr_simulator';

const APPLICABILITY_STATEMENT =
  'ECR-2 PRELIMINARY AGITATED EXTRACTION COLUMN SIMULATOR — COUNTER-CURRENT ' +
  'FIVE-COMPONENT BVP — NOT VENDOR RATING AND NOT FOR FABRICATION.';

/**
 * Fixed physical basis for the preliminary whole-column ECR-2 model.
 * Numerical BVP cells are not mechanical stages and must never change this.
 */
const G = 9.80665; // m/s²
const PI = Math.PI;

/**
 * ECR-2 owns its preliminary process-sizing search mechanics. This is an
 * evaluation envelope, not a hydraulic/flooding criterion and never selects a
 * final column diameter. It deliberately has no user-editable workspace fields.
 */
const ECR2_PRELIMINARY_PROCESS_SIZING_BASIS = {
  id: 'ecr2_preliminary_process_sizing_basis_v1',
  status: 'PRELIMINARY_DEFAULT' as const,
  sourceType: 'Assumed' as const,
  sourceReference: 'Thermopac Preliminary ECR-2 process-model basis — pending governing evidence and pilot calibration',
  psi_W_kg: 0.1,
  diameterSearch: {
    values_m: [0.30, 0.45, 0.60, 0.80, 1.00] as const,
    method: 'fixed_preliminary_ecr2_evaluation_envelope',
  },
};

// ── Component system (frozen) ──────────────────────────────────────────────────

/** Frozen component index convention for ECR-2. Must not be reordered. */
export const IDX = { SAT: 0, MONO: 1, DI: 2, POLY: 3, NMP: 4 } as const;
export const COMPONENT_NAMES = ['Saturates', 'Mono', 'Di', 'Poly', 'NMP'] as const;
export const N_COMP = 5;

/** Five-component mole or mass fraction vector. Index follows IDX. */
export type ComponentVector = [number, number, number, number, number];

/**
 * Fixed Coto surrogate MW vector in the canonical NRTL component order.
 *
 * This is a thermodynamic-coordinate conversion basis only. It is not a
 * physical RRBO molecular-weight characterization.
 */
const COTO_SURROGATE_MW_VECTOR: ComponentVector = [
  SURROGATE_MW.c12,
  SURROGATE_MW.xylene,
  SURROGATE_MW.methylnaphtalene,
  SURROGATE_MW.pyrene,
  SURROGATE_MW.nmp,
];

export const ECR2_PHYSICAL_BASIS_STATUS =
  'ACTIVE_ENGINEERING_INPUT__NUMERICAL_USE_PENDING_MASS_TRANSFER_ARCHITECTURE' as const;

export type ECR2ThermodynamicStateSource =
  | 'c2_inherited'
  | 'c2_basis_reconstructed';

// ── Type helpers ───────────────────────────────────────────────────────────────

interface TaggedValue {
  value: number;
  unit?: string;
  sourceType: SourceType;
  sourceReference: string;
}

interface ResolvedSigmaTaggedValue extends TaggedValue {
  referenceTemperatureC: number;
  temperatureResolution?: {
    requestedTemperature_C: number;
    anchor: {
      value_N_m: number;
      temperature_C: number;
      sourceType: string;
      sourceReference: string;
    };
    method: string;
    basis: string;
    warnings: readonly string[];
    resolutionMode:
      | 'governed_temperature_correlation'
      | 'preliminary_constant_over_range';
    applicabilityRange_C: {
      min: number;
      max: number;
    };
  };
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)))
    return Number(v);
  return undefined;
}

function parseTagged(
  raw: unknown,
  field: string,
  errors: ValidationError[],
  opts: { min: number; max: number; unit: string; required?: boolean },
): TaggedValue | undefined {
  if (raw === undefined || raw === null) {
    if (opts.required)
      errors.push({
        field,
        message: `${field} is required: { value (${opts.unit}), sourceType, sourceReference }`,
        severity: 'error',
      });
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const value = num(o.value);
  if (value === undefined) {
    errors.push({ field, message: `${field}.value must be a finite number (${opts.unit})`, severity: 'error' });
    return undefined;
  }
  if (value < opts.min || value > opts.max) {
    errors.push({
      field,
      message: `${field}.value must be in [${opts.min}, ${opts.max}] ${opts.unit} (got ${value})`,
      severity: 'error',
    });
    return undefined;
  }
  if (!SOURCE_TYPES.includes(o.sourceType as SourceType)) {
    errors.push({ field, message: `${field}.sourceType must be one of ${SOURCE_TYPES.join(', ')}`, severity: 'error' });
    return undefined;
  }
  if (typeof o.sourceReference !== 'string' || !o.sourceReference.trim()) {
    errors.push({ field, message: `${field}.sourceReference is mandatory`, severity: 'error' });
    return undefined;
  }
  return { value, unit: opts.unit, sourceType: o.sourceType as SourceType, sourceReference: o.sourceReference };
}

function sourceOf(t: TaggedValue): string {
  return `${t.sourceType}: ${t.sourceReference}`;
}

// ── Axial state types ──────────────────────────────────────────────────────────

/**
 * State vector for one axial compartment.
 *
 * Phase 1: geometry, power, and phase velocities are populated.
 * Phase 2+: compositions, properties, d₃₂, holdup, K_oa will be populated
 *           by the forward simulation loop once correlations are approved.
 *
 * Phase orientation:
 *   Raffinate (RRBO-rich) flows UPWARD  — z increasing is upward
 *   Extract   (NMP-rich)  flows DOWNWARD — z increasing is downward for this phase
 */
export interface ECR2CompartmentState {
  /** Compartment index, 1-based from bottom. Compartment 1 is at z ≈ h_comp/2. */
  compartmentIndex: number;
  /** Axial position of compartment centre (m from bottom, z=0). */
  z_centre_m: number;
  /** Axial position of compartment bottom face (m from bottom). */
  z_bottom_m: number;
  /** Axial position of compartment top face (m from bottom). */
  z_top_m: number;

  // ── Column geometry (Phase 1) ────────────────────────────────────────────
  /** Column cross-section area A = π·D²/4 (m²). */
  columnArea_m2: number;
  /** Rotor diameter D_R = (D_R/D) × D (m). */
  rotorDiameter_m: number;
  /** Rotor swept area A_R = π·D_R²/4 (m²). */
  rotorArea_m2: number;
  /** Tip speed v_tip = π·D_R·N (m/s). */
  tipSpeed_m_s: number;
  /** Stator free-area velocity (m/s). Null if f_stator not supplied. */
  statorVelocity_m_s: number | null;

  // ── Power (Phase 1) ──────────────────────────────────────────────────────
  /** Power per rotor P₁ = N_P·ρ_mix·N³·D_R⁵ (W). */
  powerPerRotor_W: number;
  /** Preliminary whole-column shaft power apportioned only for display. */
  shaftPower_compartment_W: number;
  /** Whole-column physical power density P/V = P₁ / (A_column × H) (W/m³). */
  powerPerVolume_W_m3: number;

  // ── Superficial velocities from boundary-condition flows (Phase 1) ───────
  /** Raffinate-phase superficial velocity at this compartment (m/s). */
  u_raffinate_m_s: number;
  /** Extract-phase superficial velocity at this compartment (m/s). */
  u_extract_m_s: number;
  /** Total specific throughput (m³/(m²·h)). */
  specificThroughput_m3_m2_h: number;

  // ── Compositions (Phase 2 — forward simulation) ──────────────────────────
  /** Raffinate-phase mole fractions [Sat, Mono, Di, Poly, NMP]. Null until Phase 2. */
  x_raffinate_mole: ComponentVector | null;
  /** Extract-phase mole fractions [Sat, Mono, Di, Poly, NMP]. Null until Phase 2. */
  y_extract_mole: ComponentVector | null;
  /** Total raffinate molar flow rate (mol/h). Null until Phase 2. */
  L_raffinate_mol_h: number | null;
  /** Total extract molar flow rate (mol/h). Null until Phase 2. */
  V_extract_mol_h: number | null;

  // ── Local physical properties (Phase 2) ─────────────────────────────────
  /** Local continuous-phase density ρ_c(z) (kg/m³). Null until Phase 2. */
  rho_c_kg_m3: number | null;
  /** Local dispersed-phase density ρ_d(z) (kg/m³). Null until Phase 2. */
  rho_d_kg_m3: number | null;
  /** Local density difference Δρ(z) = |ρ_c − ρ_d| (kg/m³). Null until Phase 2. */
  deltarho_kg_m3: number | null;
  /** Local continuous-phase viscosity μ_c(z) (Pa·s). Null until Phase 2. */
  mu_c_Pa_s: number | null;
  /** Local dispersed-phase viscosity μ_d(z) (Pa·s). Null until Phase 2. */
  mu_d_Pa_s: number | null;
  /** Local interfacial tension σ(z) (N/m). Null until Phase 2. */
  sigma_N_m: number | null;

  // ── Hydrodynamic correlation outputs ─────────────────────────────────────
  /**
   * Sauter mean droplet diameter d₃₂(z) (m).
   * Non-null when mode='engineer_supplied' and a valid value was provided,
   * or when the K&H 1996 correlation is resolved and governed (not yet).
   * Null when K&H 1996 UNRESOLVED flags are blocking and no engineer value supplied.
   */
  d32_m: number | null;
  /** Full d₃₂ result from the plug-in interface. Null if d₃₂ not attempted. */
  d32_result: D32Result | null;
  /**
   * Dispersed-phase holdup φ_d(z) (−).
   * Populated by K&H 1995 (secondary_equation_verified) in Phase 1 when
   * interfacialTension and statorOpenAreaFraction are supplied.
   * Null when inputs are missing or outside correlation envelope.
   * Check result.status before reading result.phi.
   */
  holdup_dispersed: KH1995HoldupResult | null;
  /**
   * Specific interfacial area a(z) = 6·φ_d/d₃₂ (m²/m³).
   * Non-null when both φ_d and d₃₂ are usable.
   * Null with explicit reason when either is blocked.
   */
  interfacialArea_m2_m3: number | null;
  /** Full interfacial area result including status and diagnostics. Null if not attempted. */
  interfacialArea_result: InterfacialAreaResult | null;
  /** Slip velocity U_slip = u_d/φ_d + u_c/(1−φ_d) (m/s). Non-null when φ_d is usable. */
  U_slip_m_s: number | null;
  /**
   * K&H 1999 preliminary local result. Phase 1 has no local composition/property
   * state, so every dependent calculation is explicitly unavailable.
   */
  massTransferPreliminary: ECR2KH1999LocalMassTransferResult;
  /**
   * Overall volumetric mass-transfer coefficient K_oa (1/s).
   * Unit: s⁻¹ — K_overall [m/s] × a [1/m] = [1/s].
   * Null — K_oa numerically blocked pending K&H 1999 approval and K_d,i definition approval.
   */
  Koa_per_s: null;
}

// ── Boundary conditions ────────────────────────────────────────────────────────

/**
 * Two-point boundary conditions for the countercurrent BVP.
 *
 * z = 0 (BOTTOM): RRBO feed known, extract outlet unknown
 * z = H (TOP):    Fresh NMP known, raffinate outlet unknown
 *
 * In Phase 1 these are populated from the input mass flows and compositions,
 * converted to mole basis. The actual BVP solution is Phase 2.
 */
export interface ECR2BoundaryConditions {
  bottom: {
    z_m: 0;
    /** RRBO feed mass flow entering at bottom (kg/h). Known. */
    rrboFeed_kg_h: number;
    /**
     * Coto thermodynamic feed coordinates [Sat, Mono, Di, Poly, NMP].
     * These are surrogate-model mole fractions, not physical RRBO mole fractions.
     */
    x_feed_thermo: ComponentVector;
    /**
     * Coto-surrogate total molar representation of the RRBO feed (mol/h).
     * It closes with x_feed_thermo and its Coto average surrogate MW, never
     * with ECR2MolecularWeights.
     */
    L_feed_surrogate_mol_h: number;
    /**
     * Component mass representation derived from the Coto surrogate basis.
     * This is not a physical RRBO allocation when its composition differs from
     * the project feed composition.
     */
    surrogateComponentMassRepresentation_kg_h: ComponentVector;
    /** Extract outlet — unknown at Phase 1; solved by BVP in Phase 2. */
    extract_outlet: null;
  };
  top: {
    z_m: number; // = H_active_m
    /** Fresh NMP solvent mass flow entering at top (kg/h). Known. */
    nmpFeed_kg_h: number;
    /** Coto thermodynamic solvent coordinates [Sat, Mono, Di, Poly, NMP]. */
    y_feed_thermo: ComponentVector;
    /**
     * Coto-surrogate total molar representation of the solvent feed (mol/h).
     * It closes with the selected C2 solvent molar ratio and y_feed_thermo.
     */
    V_feed_surrogate_mol_h: number;
    /** Coto-surrogate component mass representation; not a physical allocation. */
    surrogateComponentMassRepresentation_kg_h: ComponentVector;
    /** Raffinate outlet — unknown at Phase 1; solved by BVP in Phase 2. */
    raffinate_outlet: null;
  };
}

// ── Molecular weights (Assumed — pending RRBO characterization) ───────────────

/**
 * Pseudo-component molecular weights (g/mol).
 *
 * These are engineer-entered inputs (source-tagged). Representative assumed
 * values are provided as defaults seeded by ecr2DefaultFields(). They must be
 * replaced with values from the RRBO characterization once available.
 *
 * NMP MW is exact (99.13 g/mol).
 */
export interface ECR2MolecularWeights {
  /** Saturates pseudo-component MW (g/mol). */
  saturates_g_mol: TaggedValue;
  /** Mono-aromatic pseudo-component MW (g/mol). */
  mono_g_mol: TaggedValue;
  /** Di-aromatic pseudo-component MW (g/mol). */
  di_g_mol: TaggedValue;
  /** Poly-aromatic pseudo-component MW (g/mol). */
  poly_g_mol: TaggedValue;
}

/** NMP MW is exact — not a user input. */
export const NMP_MW_G_MOL = 99.13;

/**
 * Optional handoff of the canonical C2 thermodynamic input trace.
 *
 * Only feedMoleFractions is required for a handoff. Remaining values preserve
 * available C2 traceability; ECR-2 reconstructs them from its actual physical
 * feed boundary when C2 did not persist a value.
 */
export interface ECR2C2ThermodynamicHandoff {
  feedMoleFractions: ComponentVector;
  temperatureK?: number;
  solventMolarRatio?: number;
  sourceCalculationId?: string;
  /** Current Design Software revision that supplied the C2 result snapshot. */
  sourceRevisionId?: string;
  sourceWorkspaceId?: string;
}

/**
 * Read-only provenance for the independently calculated C2 theoretical-stage
 * result. ECR-2 records it but never converts it to compartment count or
 * applies a global per-stage efficiency shortcut.
 */
export interface ECR2C2TheoreticalStageHandoff {
  status:
    | 'same_specification_calculated'
    | 'upstream_reference_not_same_specification'
    | 'not_available';
  theoreticalStages: number | null;
  basis: string | null;
  /** Retained only as an auditable upstream reference; never an ECR-2 N_T. */
  upstreamReferenceTheoreticalStages?: number;
  establishmentNote?: string;
  sourceRevisionId?: string;
  sourceComputedAt?: string;
}

/**
 * Immutable trace of the Coto/NRTL coordinate system used by ECR-2.
 *
 * This basis is intentionally separate from ECR2MolecularWeights. It gives
 * nrtlFlash() the identical feed coordinate used by C2 whenever that canonical
 * C2 state is available.
 */
export interface ECR2ThermodynamicBasis {
  componentOrder: readonly [0, 1, 2, 3, 4];
  componentIdentities: typeof COTO_COMPONENTS;
  componentRoles: typeof COTO_COMPONENT_ROLES;
  feedMoleFractions: ComponentVector;
  /** Coto-surrogate mass fractions implied by feedMoleFractions and SURROGATE_MW. */
  feedSurrogateMassFractions: ComponentVector;
  surrogateMW_g_mol: {
    saturates: number;
    mono: number;
    di: number;
    poly: number;
    nmp: number;
  };
  averageSurrogateFeedMW_g_mol: number;
  temperatureK: number;
  solventMolarRatio: number;
  rrboCharacterisationWtPct: {
    saturates: number;
    mono: number;
    di: number;
    poly: number;
  };
  thermodynamicStateSource: ECR2ThermodynamicStateSource;
  sourceCalculationId: string | null;
  sourceRevisionId: string | null;
  sourceWorkspaceId: string | null;
  modelIdentity: {
    id: string;
    version: string;
    name: string;
    citation: string;
    datasetId: string;
    datasetVersion: string;
  };
}

/**
 * Executed, isothermal NRTL LLE flash for the ECR-2 inlet material basis.
 *
 * This is a run-level equilibrium trace, not a replacement for the local
 * compartment flashes in the counter-current BVP. It makes the selected Stage
 * 4 condition auditable even if the BVP is separately dependency-blocked.
 */
export interface ECR2LLEFlashSnapshot {
  status:
    | 'two_phase_converged'
    | 'trivial_single_phase'
    | 'not_converged'
    | 'not_calculable';
  temperature: {
    selectedOperatingTemperature_C: number;
    selectedOperatingTemperature_K: number;
    authority: 'Stage 4 Extraction Temperature';
  };
  model: {
    id: string;
    version: string;
    name: string;
    citation: string;
  };
  overallFeedMoleFractions: ComponentVector;
  initialRaffinateMoleFractions: ComponentVector;
  initialExtractMoleFractions: ComponentVector;
  raffinatePhaseMoleFractions: ComponentVector | null;
  extractPhaseMoleFractions: ComponentVector | null;
  extractPhaseMolarFraction: number | null;
  converged: boolean;
  trivial: boolean;
  temperatureStatus: ReturnType<typeof temperatureModelStatus>;
  thermodynamicValidity: ReturnType<typeof resolveThermodynamicValidityAtTemperature>;
  diagnostics: string[];
}

/**
 * Active project physical characterization retained for the future approved
 * mass-balance / mass-transfer architecture. No numerical bridge to the Coto
 * thermodynamic coordinates exists or is created here.
 */
export interface ECR2PhysicalBasis {
  physicalBasisStatus: typeof ECR2_PHYSICAL_BASIS_STATUS;
  ecr2MolecularWeights: {
    saturates_g_mol: TaggedValue;
    mono_g_mol: TaggedValue;
    di_g_mol: TaggedValue;
    poly_g_mol: TaggedValue;
    nmp_g_mol: {
      value: number;
      unit: 'g/mol';
      source: string;
    };
  };
  systemDefaultAvailability:
    'not_exposed_by_current_input_contract__no_default_value_invented';
  overrideStatus:
    'source_tag_retained__explicit_override_flag_not_supported_by_current_input_contract';
}

// ── Input schema ───────────────────────────────────────────────────────────────

/**
 * ECR-2 Simulator input contract.
 *
 * Fixed from workspace (passed through, not re-entered):
 *   operatingTemperatureC, rrboMassFlow_kg_h, nmpMassFlow_kg_h,
 *   feedCompositionMassFraction, nmpPurity
 *
 * Engineer enters once per simulation run:
 *   columnDiameter_m, compartmentHeight_m (numerical Δz_max),
 *   rotorToColumnDiameterRatio, rotorSpeed_rpm, rotorType,
 *   powerNumber, statorOpenAreaFraction (optional),
 *   shaftEfficiency, mechanicalDesignMargin,
 *   phaseConfiguration, feedDensity, feedViscosity,
 *   interfacialTension, molecularWeights
 *
 * Fixed by governance (never an input):
 *   physicalRotorCount = 1
 *   Temperature is not optimized.
 */
export interface ECR2SimulatorInputs {
  // ── Process (from upstream workspace steps) ────────────────────────────
  /** Operating temperature (°C). Engineer-fixed; not optimized. */
  operatingTemperatureC: number;
  /** RRBO feed mass flow at the normal case (kg/h). From C3 hydraulics. */
  rrboMassFlow_kg_h: number;
  /** NMP solvent mass flow (kg/h). Determines S/O ratio. */
  nmpMassFlow_kg_h: number;
  /**
   * RRBO feed composition — mass fractions summing to 1.
   * From C2 process design characterization.
   */
  feedCompositionMassFraction: {
    saturates: number;
    mono: number;
    di: number;
    poly: number;
  };
  /** NMP solvent purity — mass fraction of NMP in the solvent stream (0–1). */
  nmpPurity: number;
  /**
   * Canonical thermodynamic state emitted by C2 at
   * data.lleStageCalculation.inputTrace. When supplied, this exact Coto
   * feedMoleFractions vector is inherited instead of being regenerated.
   */
  c2ThermodynamicHandoff?: ECR2C2ThermodynamicHandoff;
  c2TheoreticalStageHandoff?: ECR2C2TheoreticalStageHandoff;
  /** Phase continuity assignment. */
  phaseConfiguration: 'rrbo_continuous_nmp_dispersed' | 'nmp_continuous_rrbo_dispersed';

  // ── Column geometry ────────────────────────────────────────────────────
  /** Engine-resolved detail diameter (m), retained in snapshots for compatibility. */
  columnDiameter_m?: number;
  /**
   * Explicit ECR-2 process-sizing diameter trials (m). Every entry is evaluated
   * independently; no Stage 7/DS-SEL diameter is injected into this list.
   */
  columnDiameterTrials_m?: readonly number[];
  /** Legacy diagnostic BVP height only; never used for physical sizing. */
  activeHeight_m?: number;
  /** Maximum numerical BVP-cell height Δz_max (m), not an equipment stage height. */
  compartmentHeight_m: number;

  // ── Rotor ──────────────────────────────────────────────────────────────
  /** Rotor-to-column diameter ratio D_R/D (−). */
  rotorToColumnDiameterRatio: number;
  /** Rotor speed (rpm). */
  rotorSpeed_rpm: number;
  /** Rotor type label (e.g. 'shrouded turbine'). Data label only — no geometry modelled from it. */
  rotorType: string;
  /** Power number N_P (−). Source-tagged. */
  powerNumber: TaggedValue;

  /**
   * Deprecated external field. The simulator resolves ψ from its controlled
   * process-sizing basis and ignores browser-supplied values.
   */
  governedPsi_W_kg?: TaggedValue;
  /** Density basis used with governedPsi_W_kg. Only the continuous-phase inlet
   * density is currently supported by the Phase-1 property closure. */
  psiDensityBasis?: 'continuous_phase_inlet';

  // ── Stator (optional) ──────────────────────────────────────────────────
  /** Stator open-area fraction f_stator (−). Source-tagged. Optional. */
  statorOpenAreaFraction?: TaggedValue;

  // ── Mechanical ─────────────────────────────────────────────────────────
  /** Shaft mechanical efficiency η_shaft (−). Source-tagged. */
  shaftEfficiency: TaggedValue;
  /** Mechanical design margin (−, ≥ 1.0). Source-tagged. */
  mechanicalDesignMargin: TaggedValue;

  // ── Physical properties ────────────────────────────────────────────────
  /**
   * RRBO density at operating temperature (kg/m³). Source-tagged.
   * Used as mixture/continuous-phase density for power calculation in Phase 1.
   */
  feedDensity: TaggedValue;
  /** RRBO dynamic viscosity at operating temperature (Pa·s). Source-tagged. */
  feedViscosity: TaggedValue;
  /** Interfacial tension σ at operating temperature (N/m). Source-tagged. */
  interfacialTension?: TaggedValue;

  // ── Physical/project molecular weights (not NRTL coordinates) ─────────
  /**
   * Physical/project RRBO pseudo-component molecular weights. Source-tagged.
   * They remain active engineering inputs, reserved for the future approved
   * physical mass-balance/mass-transfer layer. They must not alter the Coto
   * thermodynamic mole-fraction coordinates.
   */
  molecularWeights: ECR2MolecularWeights;

  // ── d₃₂ configuration (optional) ─────────────────────────────────────
  /**
   * d₃₂ mode configuration for this simulator run.
   *
   * Omit to run without d₃₂ (interfacial area and mass transfer will be null).
   *
   * mode='published_correlation': retain the controlled K&H 1996 selection,
   *   which currently returns transcription_invalid without a numerical d₃₂.
   *
   * mode='engineer_supplied': supply d₃₂ explicitly for simulator development
   *   and sensitivity testing. Must include value_m, sourceType, sourceReference.
   *   All downstream outputs carry the engineer-supplied basis label.
   *   DO NOT use as a production result.
   */
  d32Config?: D32Config;

  // ── Product target (optional — for Phase 7 optimizer) ─────────────────
  productTarget?: {
    type: 'raffinate_saturates_min_pct' | 'aromatic_removal_min_pct';
    value: number;
  };
}

// ── Geometry helpers ───────────────────────────────────────────────────────────

function rotorArea(rotorDiameter_m: number): number {
  return (PI / 4) * rotorDiameter_m * rotorDiameter_m;
}

function tipSpeed(rotorDiameter_m: number, rpm: number): number {
  // v_tip = π · D_R · N, where N = rpm / 60
  return PI * rotorDiameter_m * (rpm / 60);
}

function statorVelocity(
  qTotal_m3_h: number,
  columnArea_m2: number,
  fStator: number,
): number {
  // v_stator = (Q_c + Q_d) / (A · f_stator) — in m/s, Q in m³/h → ÷ 3600
  return qTotal_m3_h / 3600 / (columnArea_m2 * fStator);
}

function powerPerRotor(
  N_P: number,
  rho_kg_m3: number,
  rpm: number,
  rotorDiameter_m: number,
): number {
  // P₁ = N_P · ρ · N³ · D_R⁵, N in rev/s
  const N = rpm / 60;
  return N_P * rho_kg_m3 * Math.pow(N, 3) * Math.pow(rotorDiameter_m, 5);
}

function validDiameterTrials(inputs: Record<string, unknown>): number[] {
  const raw = inputs.columnDiameterTrials_m;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => num(value))
    .filter((value): value is number => value !== undefined);
}

function resolveECR2ProcessSizingInputs(inputs: Record<string, unknown>): Record<string, unknown> {
  // A future controlled server-side basis may deliberately declare itself
  // unavailable. In that case preserve the dependency gap instead of using a
  // hidden manual or rotor-derived substitute.
  const requestedSystemBasis = inputs.ecr2SystemProcessSizingBasis as Record<string, unknown> | undefined;
  const basisUnavailable = requestedSystemBasis?.status === 'UNAVAILABLE';
  if (basisUnavailable) {
    return {
      ...inputs,
      columnDiameterTrials_m: [],
      columnDiameter_m: undefined,
      governedPsi_W_kg: undefined,
      psiDensityBasis: undefined,
      ecr2ResolvedProcessSizingBasis: {
        id: String(requestedSystemBasis.id ?? 'ecr2_process_sizing_basis_unavailable'),
        status: 'MISSING_DEPENDENCY',
        missingDependency: String(requestedSystemBasis.missingDependency ?? 'ECR-2 governed/preliminary process-sizing basis'),
      },
    };
  }

  const basis = ECR2_PRELIMINARY_PROCESS_SIZING_BASIS;
  const columnDiameterTrials_m = [...basis.diameterSearch.values_m];
  return {
    ...inputs,
    // Overwrite every legacy UI/API value. The engine, not the browser, owns
    // trial generation and ψ resolution.
    columnDiameterTrials_m,
    columnDiameter_m: columnDiameterTrials_m[0],
    governedPsi_W_kg: {
      value: basis.psi_W_kg,
      unit: 'W/kg',
      sourceType: basis.sourceType,
      sourceReference: basis.sourceReference,
    },
    psiDensityBasis: 'continuous_phase_inlet',
    ecr2ResolvedProcessSizingBasis: {
      id: basis.id,
      status: basis.status,
      sourceType: basis.sourceType,
      sourceReference: basis.sourceReference,
      governedPsi_W_kg: basis.psi_W_kg,
      psiDensityBasis: 'continuous_phase_inlet',
      diameterSearch: basis.diameterSearch,
      ignoredLegacyInputKeys: [
        'column_diameter_trials_m',
        'columnDiameterTrials_m',
        'columnDiameter_m',
        'governed_psi_w_kg',
        'governedPsi_W_kg',
        'governed_psi_source_type',
        'governed_psi_source_reference',
      ],
    },
  };
}

// ── Thermodynamic-coordinate conversion ───────────────────────────────────────

/**
 * Convert mass fractions to Coto thermodynamic mole coordinates.
 * MW array must be the canonical Coto surrogate vector in [Sat, Mono, Di, Poly, NMP] order.
 */
function massToThermodynamicMoleFraction(
  wt: ComponentVector,
  mw: [number, number, number, number, number],
): ComponentVector {
  const moles = wt.map((w, i) => w / mw[i]);
  const total = moles.reduce((s, m) => s + m, 0);
  if (total <= 0)
    throw new Error('massToThermodynamicMoleFraction: zero total surrogate moles — check mass fractions');
  return moles.map((m) => m / total) as unknown as ComponentVector;
}

/** Component mass representation implied by one closed Coto surrogate basis. */
function surrogateComponentMassRepresentation(
  totalSurrogateMolarFlow_mol_h: number,
  moleFractions: ComponentVector,
): ComponentVector {
  return moleFractions.map(
    (z_i, i) => totalSurrogateMolarFlow_mol_h * z_i * COTO_SURROGATE_MW_VECTOR[i] / 1000,
  ) as ComponentVector;
}

function isComponentVector(value: unknown): value is ComponentVector {
  return Array.isArray(value)
    && value.length === N_COMP
    && value.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0)
    && Math.abs(value.reduce((sum, v) => sum + v, 0) - 1) <= 0.005;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Extracts the canonical state from the C2 result snapshot without modifying C2.
 *
 * The source path is intentionally exact:
 * data.lleStageCalculation.inputTrace.feedMoleFractions.
 * A null result tells the caller no usable canonical state was persisted and
 * that ECR-2 must use its governed C2-basis reconstruction instead.
 */
export function extractC2ThermodynamicHandoff(
  c2CalculationResult: unknown,
): ECR2C2ThermodynamicHandoff | null {
  if (!isRecord(c2CalculationResult)) return null;
  const resultData = isRecord(c2CalculationResult.data)
    ? c2CalculationResult.data
    : c2CalculationResult;
  const lleStageCalculation = resultData.lleStageCalculation;
  if (!isRecord(lleStageCalculation) || !isRecord(lleStageCalculation.inputTrace)) return null;
  const inputTrace = lleStageCalculation.inputTrace;
  if (!isComponentVector(inputTrace.feedMoleFractions)) return null;

  const sourceCalculationId = typeof resultData.calculationId === 'string'
    ? resultData.calculationId
    : typeof c2CalculationResult.calculationId === 'string'
      ? c2CalculationResult.calculationId
      : undefined;
  const sourceWorkspaceId = typeof resultData.workspaceId === 'string'
    ? resultData.workspaceId
    : typeof c2CalculationResult.workspaceId === 'string'
      ? c2CalculationResult.workspaceId
      : undefined;
  const sourceRevisionId = typeof resultData.revisionId === 'string'
    ? resultData.revisionId
    : typeof c2CalculationResult.revisionId === 'string'
      ? c2CalculationResult.revisionId
      : undefined;
  const temperatureK = num(inputTrace.temperatureK);
  const solventMolarRatio = num(inputTrace.solventMolarRatio_molNMP_per_molFeed);

  return {
    feedMoleFractions: [...inputTrace.feedMoleFractions] as ComponentVector,
    ...(temperatureK !== undefined ? { temperatureK } : {}),
    ...(solventMolarRatio !== undefined ? { solventMolarRatio } : {}),
    ...(sourceCalculationId ? { sourceCalculationId } : {}),
    ...(sourceRevisionId ? { sourceRevisionId } : {}),
    ...(sourceWorkspaceId ? { sourceWorkspaceId } : {}),
  };
}

/**
 * Builds the governed Coto thermodynamic coordinate state for ECR-2.
 *
 * The inherited C2 vector is authoritative when it is present and valid.
 * Otherwise reconstruction deliberately matches C2's wt% / SURROGATE_MW
 * conversion exactly. Physical ECR2MolecularWeights are intentionally absent.
 */
export function buildECR2ThermodynamicBasis(input: {
  operatingTemperatureC: number;
  rrboMassFlow_kg_h: number;
  nmpMassFlow_kg_h: number;
  rrboMassFractions: ComponentVector;
  c2ThermodynamicHandoff?: ECR2C2ThermodynamicHandoff;
}): ECR2ThermodynamicBasis {
  const { operatingTemperatureC, rrboMassFlow_kg_h, nmpMassFlow_kg_h, rrboMassFractions, c2ThermodynamicHandoff } = input;
  const fallbackFeedMoleFractions = massToThermodynamicMoleFraction(
    rrboMassFractions,
    COTO_SURROGATE_MW_VECTOR,
  );
  const inherited = c2ThermodynamicHandoff?.feedMoleFractions;
  const feedMoleFractions = inherited && isComponentVector(inherited)
    ? [...inherited] as ComponentVector
    : fallbackFeedMoleFractions;
  const averageSurrogateFeedMW_g_mol = feedMoleFractions.reduce(
    (sum, z_i, i) => sum + z_i * COTO_SURROGATE_MW_VECTOR[i],
    0,
  );
  const surrogateMassFractions = feedMoleFractions.map(
    (z_i, i) => (z_i * COTO_SURROGATE_MW_VECTOR[i]) / averageSurrogateFeedMW_g_mol,
  ) as ComponentVector;
  const reconstructedSolventMolarRatio =
    (nmpMassFlow_kg_h / rrboMassFlow_kg_h)
    * (averageSurrogateFeedMW_g_mol / SURROGATE_MW.nmp);

  return {
    componentOrder: [0, 1, 2, 3, 4],
    componentIdentities: COTO_COMPONENTS,
    componentRoles: COTO_COMPONENT_ROLES,
    feedMoleFractions,
    feedSurrogateMassFractions: surrogateMassFractions,
    surrogateMW_g_mol: {
      saturates: SURROGATE_MW.c12,
      mono: SURROGATE_MW.xylene,
      di: SURROGATE_MW.methylnaphtalene,
      poly: SURROGATE_MW.pyrene,
      nmp: SURROGATE_MW.nmp,
    },
    averageSurrogateFeedMW_g_mol,
    // The upstream C2 handoff may supply the canonical composition basis, but
    // it must never supply the ECR-2 execution temperature. validate() rejects
    // a mismatched handoff temperature before calculation; the persisted basis
    // always records the user-selected Stage 4 calculation condition.
    temperatureK: operatingTemperatureC + 273.15,
    solventMolarRatio: c2ThermodynamicHandoff?.solventMolarRatio ?? reconstructedSolventMolarRatio,
    rrboCharacterisationWtPct: {
      saturates: surrogateMassFractions[IDX.SAT] * 100,
      mono: surrogateMassFractions[IDX.MONO] * 100,
      di: surrogateMassFractions[IDX.DI] * 100,
      poly: surrogateMassFractions[IDX.POLY] * 100,
    },
    thermodynamicStateSource: inherited && isComponentVector(inherited)
      ? 'c2_inherited'
      : 'c2_basis_reconstructed',
    sourceCalculationId: c2ThermodynamicHandoff?.sourceCalculationId ?? null,
    sourceRevisionId: c2ThermodynamicHandoff?.sourceRevisionId ?? null,
    sourceWorkspaceId: c2ThermodynamicHandoff?.sourceWorkspaceId ?? null,
    modelIdentity: {
      id: TLLE_MODEL_ID,
      version: TLLE_MODEL_VERSION,
      name: TLLE_MODEL_NAME,
      citation: TLLE_MODEL_CITATION,
      datasetId: COTO_2022_DATASET_ID,
      datasetVersion: COTO_2022_DATASET_VERSION,
    },
  };
}

function buildECR2PhysicalBasis(
  molecularWeights: ECR2MolecularWeights,
): ECR2PhysicalBasis {
  return {
    physicalBasisStatus: ECR2_PHYSICAL_BASIS_STATUS,
    ecr2MolecularWeights: {
      saturates_g_mol: molecularWeights.saturates_g_mol,
      mono_g_mol: molecularWeights.mono_g_mol,
      di_g_mol: molecularWeights.di_g_mol,
      poly_g_mol: molecularWeights.poly_g_mol,
      nmp_g_mol: {
        value: NMP_MW_G_MOL,
        unit: 'g/mol',
        source: 'Exact molecular weight — not an input',
      },
    },
    systemDefaultAvailability:
      'not_exposed_by_current_input_contract__no_default_value_invented',
    overrideStatus:
      'source_tag_retained__explicit_override_flag_not_supported_by_current_input_contract',
  };
}

function buildECR2LLEFlashSnapshot(input: {
  operatingTemperatureC: number;
  operatingTemperatureK: number;
  feedMoleFractions: ComponentVector;
  freshNmpMoleFractions: ComponentVector;
  solventMolarRatio: number;
  temperatureStatus: ReturnType<typeof temperatureModelStatus>;
  thermodynamicValidity: ReturnType<typeof resolveThermodynamicValidityAtTemperature>;
  modelIdentity: ECR2ThermodynamicBasis['modelIdentity'];
}): ECR2LLEFlashSnapshot {
  const diagnostics: string[] = [];
  const totalSurrogateMoles = 1 + input.solventMolarRatio;
  const overallFeedMoleFractions = input.feedMoleFractions.map(
    (value, index) => (
      value + input.solventMolarRatio * input.freshNmpMoleFractions[index]
    ) / totalSurrogateMoles,
  ) as ComponentVector;
  const base = {
    temperature: {
      selectedOperatingTemperature_C: input.operatingTemperatureC,
      selectedOperatingTemperature_K: input.operatingTemperatureK,
      authority: 'Stage 4 Extraction Temperature' as const,
    },
    model: {
      id: input.modelIdentity.id,
      version: input.modelIdentity.version,
      name: input.modelIdentity.name,
      citation: input.modelIdentity.citation,
    },
    overallFeedMoleFractions,
    initialRaffinateMoleFractions: [...input.feedMoleFractions] as ComponentVector,
    initialExtractMoleFractions: [...input.freshNmpMoleFractions] as ComponentVector,
    temperatureStatus: input.temperatureStatus,
    thermodynamicValidity: input.thermodynamicValidity,
  };

  if (
    !Number.isFinite(totalSurrogateMoles) ||
    totalSurrogateMoles <= 0 ||
    !isComponentVector(overallFeedMoleFractions)
  ) {
    diagnostics.push(
      'NRTL LLE flash was not attempted because the run-level surrogate overall composition is not a valid closed five-component vector.',
    );
    return {
      ...base,
      status: 'not_calculable',
      raffinatePhaseMoleFractions: null,
      extractPhaseMoleFractions: null,
      extractPhaseMolarFraction: null,
      converged: false,
      trivial: false,
      diagnostics,
    };
  }

  try {
    const flash = nrtlFlash(
      overallFeedMoleFractions,
      input.operatingTemperatureK,
      input.feedMoleFractions,
      input.freshNmpMoleFractions,
    );
    const finitePhases = isComponentVector(flash.x) && isComponentVector(flash.y);
    const rawXIsRaffinate = finitePhases && flash.x[IDX.SAT] >= flash.y[IDX.SAT];
    const raffinatePhaseMoleFractions = finitePhases
      ? (rawXIsRaffinate ? flash.x : flash.y) as ComponentVector
      : null;
    const extractPhaseMoleFractions = finitePhases
      ? (rawXIsRaffinate ? flash.y : flash.x) as ComponentVector
      : null;
    // nrtlFlash defines beta as the raw y-phase fraction. Convert it after
    // orienting the phases so the persisted value always means NMP-rich extract.
    const extractPhaseMolarFraction = finitePhases && Number.isFinite(flash.beta)
      ? rawXIsRaffinate ? flash.beta : 1 - flash.beta
      : null;

    if (!finitePhases) {
      diagnostics.push(
        'NRTL LLE flash returned non-finite or non-normalized phase compositions; no equilibrium phase result is usable.',
      );
    } else if (!flash.converged) {
      diagnostics.push(
        'NRTL LLE flash did not converge within 1500 iterations. Persisted phase values are diagnostic iterates, not an accepted equilibrium result.',
      );
    } else if (flash.trivial) {
      diagnostics.push(
        'NRTL LLE flash converged to a trivial single-phase result at the selected operating temperature; two-phase equilibrium targets are not available from this run-level flash.',
      );
    } else {
      diagnostics.push(
        `NRTL LLE flash converged at the user-selected Stage 4 operating temperature ${input.operatingTemperatureK.toFixed(2)} K.`,
      );
    }

    return {
      ...base,
      status: !finitePhases
        ? 'not_calculable'
        : !flash.converged
          ? 'not_converged'
          : flash.trivial
            ? 'trivial_single_phase'
            : 'two_phase_converged',
      raffinatePhaseMoleFractions,
      extractPhaseMoleFractions,
      extractPhaseMolarFraction,
      converged: flash.converged,
      trivial: flash.trivial,
      diagnostics,
    };
  } catch (error) {
    diagnostics.push(
      `NRTL LLE flash failed at the selected operating temperature: ${error instanceof Error ? error.message : String(error)}.`,
    );
    return {
      ...base,
      status: 'not_calculable',
      raffinatePhaseMoleFractions: null,
      extractPhaseMoleFractions: null,
      extractPhaseMolarFraction: null,
      converged: false,
      trivial: false,
      diagnostics,
    };
  }
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class LLXECRSimulatorEngine implements IDesignEngine {
  getEngineId(): string    { return ENGINE_ID; }
  getEngineVersion(): string { return ENGINE_VERSION; }
  getModuleType(): string  { return 'llx'; }
  getCalculationType(): string { return CALCULATION_TYPE; }

  // ── validate ──────────────────────────────────────────────────────────────

  validate(inputs: Record<string, unknown>): ValidationResult {
    inputs = resolveECR2ProcessSizingInputs(inputs);
    const errors: ValidationError[] = [];
    const err = (field: string, message: string) =>
      errors.push({ field, message, severity: 'error' });
    const warn = (field: string, message: string) =>
      errors.push({ field, message, severity: 'warning' });

    // Operating temperature
    const T = num(inputs.operatingTemperatureC);
    if (T === undefined || T <= 0 || T >= 300)
      err('operatingTemperatureC', 'operatingTemperatureC (°C) is required, 0 < T < 300');

    // NRTL model status at this temperature (informational — does not block)
    if (T !== undefined) {
      const nrtlStatus = temperatureModelStatus((T + 273.15));
      if (nrtlStatus.mode === 'extrapolation') {
        errors.push({
          field: 'operatingTemperatureC',
          message: `NRTL model: temperature ${T} °C is outside the calibrated range — NRTL equilibrium targets will be extrapolated (Pending Validation).`,
          severity: 'warning',
        });
      }
    }

    // Mass flows
    const qRRBO = num(inputs.rrboMassFlow_kg_h);
    const qNMP  = num(inputs.nmpMassFlow_kg_h);
    if (qRRBO === undefined || qRRBO <= 0)
      err('rrboMassFlow_kg_h', 'rrboMassFlow_kg_h must be > 0 (kg/h) — from C3 hydraulics');
    if (qNMP  === undefined || qNMP  <= 0)
      err('nmpMassFlow_kg_h',  'nmpMassFlow_kg_h must be > 0 (kg/h)');

    // Feed composition
    const fc = inputs.feedCompositionMassFraction as Record<string, unknown> | undefined;
    if (!fc) {
      err('feedCompositionMassFraction', 'feedCompositionMassFraction { saturates, mono, di, poly } is required (mass fractions, sum = 1)');
    } else {
      const sat  = num(fc.saturates) ?? 0;
      const mono = num(fc.mono) ?? 0;
      const di   = num(fc.di) ?? 0;
      const poly = num(fc.poly) ?? 0;
      if ([sat, mono, di, poly].some((v) => v < 0 || v > 1))
        err('feedCompositionMassFraction', 'All mass fractions must be in [0, 1]');
      const sum = sat + mono + di + poly;
      if (Math.abs(sum - 1.0) > 0.005)
        err('feedCompositionMassFraction', `Mass fractions must sum to 1.0 (got ${sum.toFixed(4)})`);
    }

    // Optional C2 canonical thermodynamic-state handoff
    if (inputs.c2ThermodynamicHandoff !== undefined && inputs.c2ThermodynamicHandoff !== null) {
      const handoff = inputs.c2ThermodynamicHandoff as Record<string, unknown>;
      if (!isComponentVector(handoff.feedMoleFractions)) {
        err(
          'c2ThermodynamicHandoff.feedMoleFractions',
          'C2 canonical feedMoleFractions must be five non-negative values [Sat, Mono, Di, Poly, NMP] summing to 1.000 ± 0.005',
        );
      }
      const handoffTemperatureK = num(handoff.temperatureK);
      if (handoff.temperatureK !== undefined && (handoffTemperatureK === undefined || handoffTemperatureK <= 0)) {
        err('c2ThermodynamicHandoff.temperatureK', 'C2 canonical temperatureK must be a positive finite number when supplied');
      } else if (T !== undefined && handoffTemperatureK !== undefined && Math.abs(handoffTemperatureK - (T + 273.15)) > 1e-6) {
        err(
          'c2ThermodynamicHandoff.temperatureK',
          `C2 canonical temperatureK (${handoffTemperatureK}) must match operatingTemperatureC + 273.15 (${T + 273.15})`,
        );
      }
      const handoffSolventMolarRatio = num(handoff.solventMolarRatio);
      if (handoff.solventMolarRatio !== undefined && (handoffSolventMolarRatio === undefined || handoffSolventMolarRatio <= 0)) {
        err('c2ThermodynamicHandoff.solventMolarRatio', 'C2 canonical solventMolarRatio must be > 0 when supplied');
      }
    }

    // NMP purity
    const purity = num(inputs.nmpPurity);
    if (purity === undefined || purity <= 0 || purity > 1)
      err('nmpPurity', 'nmpPurity must be in (0, 1] (mass fraction NMP in solvent stream)');

    // Phase configuration
    const validPhaseConfigs = ['rrbo_continuous_nmp_dispersed', 'nmp_continuous_rrbo_dispersed'];
    if (!validPhaseConfigs.includes(inputs.phaseConfiguration as string))
      err('phaseConfiguration', `phaseConfiguration must be one of: ${validPhaseConfigs.join(', ')}`);
    if (inputs.phaseConfiguration !== 'nmp_continuous_rrbo_dispersed') {
      warn(
        'phaseConfiguration',
        'The ECR-2 counter-current BVP will be dependency-blocked because it is governed only for nmp_continuous_rrbo_dispersed (NMP continuous, RRBO dispersed). Phase-1 d₃₂ applicability remains reported explicitly.',
      );
    }

    // Column geometry
    const diameterTrials = validDiameterTrials(inputs);
    const D = diameterTrials[0];
    const H = num(inputs.activeHeight_m);
    const hComp = num(inputs.compartmentHeight_m);
    const sizingBasis = inputs.ecr2ResolvedProcessSizingBasis as Record<string, unknown> | undefined;
    if (sizingBasis?.status === 'MISSING_DEPENDENCY') {
      err(
        'ecr2SystemProcessSizingBasis',
        `ECR-2 process sizing is blocked: ${String(sizingBasis.missingDependency)} is unavailable. The simulator will not use manual diameter trials, manual ψ, Stage 7, DS-SEL, or rotor-derived P/V as a substitute.`,
      );
    } else if (!Array.isArray(inputs.columnDiameterTrials_m) || inputs.columnDiameterTrials_m.length === 0) {
      err('ecr2ResolvedProcessSizingBasis', 'ECR-2 could not generate a non-empty internal diameter trial space from its process-sizing basis');
    } else if (diameterTrials.length !== inputs.columnDiameterTrials_m.length) {
      err('ecr2ResolvedProcessSizingBasis', 'The ECR-2 generated diameter trial space contains a non-finite value');
    } else if (diameterTrials.some((value) => value <= 0 || value > 10)) {
      err('ecr2ResolvedProcessSizingBasis', 'Every ECR-2 generated diameter trial must be > 0 and ≤ 10 m');
    }
    if (H !== undefined && (H <= 0 || H > 100))
      err('activeHeight_m', 'When supplied for a diagnostic BVP, activeHeight_m must be > 0 and ≤ 100 (m)');
    if (hComp === undefined || hComp <= 0 || hComp > 2)
      err('compartmentHeight_m', 'compartmentHeight_m (maximum numerical Δz) must be > 0 and ≤ 2 (m)');
    if (D !== undefined && H !== undefined && hComp !== undefined) {
      const nComp = Math.ceil(H / hComp); // ceiling — matches calculate() geometry
      if (nComp < 1)
        err('compartmentHeight_m', `compartmentHeight_m ${hComp} m produces no numerical cells for diagnostic activeHeight_m ${H} m`);
      if (nComp > 500)
        errors.push({ field: 'activeHeight_m', message: `ceil(H/h_comp) = ${nComp} compartments — consider a coarser compartment height for Phase 1 screening`, severity: 'warning' });
    }

    // Rotor geometry
    const ratio = num(inputs.rotorToColumnDiameterRatio);
    if (ratio === undefined || ratio < 0.2 || ratio > 0.8)
      err('rotorToColumnDiameterRatio', 'rotorToColumnDiameterRatio must be in [0.2, 0.8]');
    const rpm = num(inputs.rotorSpeed_rpm);
    if (rpm === undefined || rpm <= 0 || rpm > 1000)
      err('rotorSpeed_rpm', 'rotorSpeed_rpm must be in (0, 1000] rpm');
    if (typeof inputs.rotorType !== 'string' || !(inputs.rotorType as string).trim())
      err('rotorType', 'rotorType is a mandatory data label (e.g. shrouded turbine)');

    // Power number
    parseTagged(inputs.powerNumber, 'powerNumber', errors, { min: 0.1, max: 20, unit: '-', required: true });

    // Process agitation is resolved from the ECR-2 controlled basis. Rotor and
    // mechanical fields are never an acceptable substitute.
    if (inputs.governedPsi_W_kg === undefined || inputs.governedPsi_W_kg === null) {
      err(
        'governedPsi_W_kg',
        'ECR-2 process sizing is blocked because its governed/preliminary ψ basis is unavailable; rotor-derived ψ/P·V is not permitted.',
      );
    } else {
      parseTagged(inputs.governedPsi_W_kg, 'governedPsi_W_kg', errors, {
        min: 1e-12,
        max: 1e6,
        unit: 'W/kg',
      });
    }
    if (inputs.psiDensityBasis !== undefined && inputs.psiDensityBasis !== 'continuous_phase_inlet') {
      err('psiDensityBasis', "psiDensityBasis must be 'continuous_phase_inlet'");
    }

    // Stator (optional)
    if (inputs.statorOpenAreaFraction !== undefined && inputs.statorOpenAreaFraction !== null)
      parseTagged(inputs.statorOpenAreaFraction, 'statorOpenAreaFraction', errors, { min: 0.01, max: 0.9, unit: '-' });

    // Mechanical
    parseTagged(inputs.shaftEfficiency,        'shaftEfficiency',        errors, { min: 0.5, max: 1.0, unit: '-', required: true });
    parseTagged(inputs.mechanicalDesignMargin, 'mechanicalDesignMargin', errors, { min: 1.0, max: 2.0, unit: '-', required: true });

    // Physical properties
    const fdRaw = inputs.feedDensity as Record<string, unknown> | undefined;
    if (!fdRaw)
      err('feedDensity', 'feedDensity { value (kg/m³), sourceType, sourceReference } is required — RRBO density at T');
    else
      parseTagged(inputs.feedDensity, 'feedDensity', errors, { min: 500, max: 1200, unit: 'kg/m3', required: true });

    if (inputs.feedViscosity !== undefined)
      parseTagged(inputs.feedViscosity, 'feedViscosity', errors, { min: 1e-5, max: 10, unit: 'Pa.s' });

    if (inputs.interfacialTension !== undefined && inputs.interfacialTension !== null)
      parseTagged(inputs.interfacialTension, 'interfacialTension', errors, { min: 0.0005, max: 0.1, unit: 'N/m' });

    // Molecular weights
    const mw = inputs.molecularWeights as Record<string, unknown> | undefined;
    if (!mw) {
      err('molecularWeights', 'molecularWeights { saturates_g_mol, mono_g_mol, di_g_mol, poly_g_mol } is required — source-tagged pseudo-component MW values');
    } else {
      parseTagged(mw.saturates_g_mol, 'molecularWeights.saturates_g_mol', errors, { min: 100, max: 1000, unit: 'g/mol', required: true });
      parseTagged(mw.mono_g_mol,      'molecularWeights.mono_g_mol',      errors, { min: 100, max: 1000, unit: 'g/mol', required: true });
      parseTagged(mw.di_g_mol,        'molecularWeights.di_g_mol',        errors, { min: 100, max: 1000, unit: 'g/mol', required: true });
      parseTagged(mw.poly_g_mol,      'molecularWeights.poly_g_mol',      errors, { min: 100, max: 1000, unit: 'g/mol', required: true });
    }

    // d₃₂ config validation (optional field)
    if (inputs.d32Config !== undefined && inputs.d32Config !== null) {
      const d32Cfg = inputs.d32Config as Record<string, unknown>;
      const mode = d32Cfg.mode;
      if (mode !== 'published_correlation' && mode !== 'engineer_supplied' && mode !== 'direct_turbulence_preliminary') {
        err('d32Config.mode', "d32Config.mode must be 'published_correlation', 'engineer_supplied', or 'direct_turbulence_preliminary'");
      } else if (mode === 'published_correlation') {
        if (d32Cfg.correlationId !== 'ecr2_d32_kh1996') {
          err('d32Config.correlationId', "d32Config.correlationId must be 'ecr2_d32_kh1996' for published_correlation mode");
        }
      } else if (mode === 'engineer_supplied') {
        const v = num(d32Cfg.value_m);
        if (v === undefined || v <= 0) {
          err('d32Config.value_m', 'd32Config.value_m must be a positive finite number (Sauter mean diameter in metres)');
        } else if (v > 0.05) {
          errors.push({ field: 'd32Config.value_m', message: `d32Config.value_m = ${v * 1000} mm is unusually large (> 50 mm) — verify units are metres`, severity: 'warning' });
        }
        if (typeof d32Cfg.sourceType !== 'string' || !(d32Cfg.sourceType as string).trim()) {
          errors.push({ field: 'd32Config.sourceType', message: 'd32Config.sourceType should be a non-empty string (e.g. Assumed, Vendor, Literature_Analogy)', severity: 'warning' });
        }
        if (typeof d32Cfg.sourceReference !== 'string' || !(d32Cfg.sourceReference as string).trim()) {
          errors.push({ field: 'd32Config.sourceReference', message: 'd32Config.sourceReference should be a non-empty source reference string', severity: 'warning' });
        }
      } else if (mode === 'direct_turbulence_preliminary') {
        if (d32Cfg.correlationId !== 'ecr2_d32_direct_turbulence_preliminary') {
          err('d32Config.correlationId', "d32Config.correlationId must be 'ecr2_d32_direct_turbulence_preliminary' for direct_turbulence_preliminary mode");
        }
        const C = num(d32Cfg.C_nominal);
        if (C === undefined || C < 0.36 || C > 0.43) {
          err('d32Config.C_nominal', 'd32Config.C_nominal must be a finite selected C in the governed preliminary interval [0.36, 0.43]');
        }
        if (typeof d32Cfg.sourceType !== 'string' || !(d32Cfg.sourceType as string).trim()) {
          err('d32Config.sourceType', 'A source class is required for the selected direct-turbulence nominal C');
        }
        if (typeof d32Cfg.sourceReference !== 'string' || !(d32Cfg.sourceReference as string).trim()) {
          err('d32Config.sourceReference', 'A source reference is required for the selected direct-turbulence nominal C');
        }
      }
    }

    // Full BVP activation inputs deliberately remain explicit. The frozen BVP
    // reports the first unavailable dependency in its structured failure result;
    // these validation entries give the workspace a complete pre-run checklist.
    const bvp = inputs.bvp as Record<string, unknown> | undefined;
    if (!bvp) {
      warn('bvp', 'BVP activation data is missing: d32, five-component diffusivity, and approved concentration Kd basis. The solver will return a structured dependency-blocked snapshot.');
    } else {
      if (!inputs.d32Config) warn('d32Config', 'd32Config is required for the ECR-2 BVP; no default is permitted.');
      if (!inputs.feedViscosity) warn('feedViscosity', 'feedViscosity is required for the ECR-2 BVP local-property closure.');
      if (!inputs.interfacialTension) warn('interfacialTension', 'interfacialTension is required for the ECR-2 BVP local-property closure.');
      if (!bvp.diffusivity) warn('bvp.diffusivity', 'Five-component, two-phase diffusivity inputs are required for the ECR-2 BVP.');
      if (!bvp.partitionBasis) {
        warn('bvp.partitionBasis', 'An engineer-approved K_d concentration partition basis is required for the ECR-2 BVP.');
      } else {
        const approval = bvp.partitionBasis as Record<string, unknown>;
        if (typeof approval.approvedBy !== 'string' || !approval.approvedBy.trim()) {
          err('bvp.partitionBasis.approvedBy', 'Kd concentration-basis approval requires the approving engineer.');
        }
        if (typeof approval.approvedAt !== 'string' || !approval.approvedAt.trim() || Number.isNaN(Date.parse(approval.approvedAt))) {
          err('bvp.partitionBasis.approvedAt', 'Kd concentration-basis approval requires a valid approval timestamp.');
        }
      }
      const evidence = bvp.stage8Evidence as Record<string, unknown> | undefined;
      for (const id of ECR2_STAGE8_NUMERICAL_PARAMETER_IDS) {
        const record = evidence?.[id] as Record<string, unknown> | undefined;
        const status = typeof record?.status === 'string' ? record.status : '';
        const accepted = status === 'ACCEPTED_AUTO_BASIS'
          && typeof record?.value === 'number'
          && Number.isFinite(record.value);
        const overridden = status === 'ENGINEER_OVERRIDE'
          && typeof record?.value === 'number'
          && Number.isFinite(record.value)
          && typeof record?.source === 'string'
          && record.source.trim() !== '';
        if (!accepted && !overridden) {
          err(
            `bvp.stage8Evidence.${id}`,
            `Stage 8 '${id}' must be a current system-resolved value accepted through the Stage 8 bulk action, or a complete engineer override; received '${status || 'missing'}'.`,
          );
        }
      }
    }

    return {
      valid: errors.filter((e) => e.severity === 'error').length === 0,
      errors,
    };
  }

  // ── calculate ──────────────────────────────────────────────────────────────

  async calculate(
    inputs: Record<string, unknown>,
    context: CalculationContext,
  ): Promise<CalculationResult> {
    inputs = resolveECR2ProcessSizingInputs(inputs);
    const base = {
      calculationClass: context.calculationClass ?? 'Preliminary Simulator Scaffold',
      engineId:      ENGINE_ID,
      engineVersion: ENGINE_VERSION,
      computedAt:    new Date(),
    };
    const warnings: EngineWarning[] = [];
    const pushWarning = (code: string, message: string) => {
      if (!warnings.some((w) => w.code === code && w.message === message))
        warnings.push({ code, message });
    };

    // Gate on validation
    const gate = this.validate(inputs);
    const gateErrors = gate.errors.filter((e) => e.severity === 'error');
    if (gateErrors.length > 0) {
      return {
        ...base,
        status: 'error',
        data: { calculationRunStatus: 'calculation_blocked', phase: 1 },
        warnings,
        validationIssues: gate.errors,
      };
    }
    for (const w of gate.errors.filter((e) => e.severity === 'warning'))
      pushWarning('INPUT_WARNING', `${w.field}: ${w.message}`);

    // ── Parse validated inputs ───────────────────────────────────────────────
    const T_C  = num(inputs.operatingTemperatureC)!;
    const T_K  = T_C + 273.15;
    const mRRBO = num(inputs.rrboMassFlow_kg_h)!;
    const mNMP  = num(inputs.nmpMassFlow_kg_h)!;
    const purity = num(inputs.nmpPurity)!;
    const phaseConfig = inputs.phaseConfiguration as 'rrbo_continuous_nmp_dispersed' | 'nmp_continuous_rrbo_dispersed';
    const rrboContinuous = phaseConfig === 'rrbo_continuous_nmp_dispersed';
    const continuousPhase = rrboContinuous ? 'RRBO' : 'NMP';
    const dispersedPhase  = rrboContinuous ? 'NMP'  : 'RRBO';

    const configuredDiameterTrials = validDiameterTrials(inputs);
    const D      = configuredDiameterTrials[0]!;
    // A manually supplied height is retained only for an explicitly labelled
    // diagnostic BVP when no compatible physical product-quality target exists.
    // It is never used by the progressive physical-height sizing path.
    const manualDiagnosticHeight_m = num(inputs.activeHeight_m);
    const hComp  = num(inputs.compartmentHeight_m)!;
    const ratio  = num(inputs.rotorToColumnDiameterRatio)!;
    const rpm    = num(inputs.rotorSpeed_rpm)!;
    const rotorType = String(inputs.rotorType);

    const powerNumber  = parseTagged(inputs.powerNumber,        'powerNumber',        [], { min: 0.1, max: 20, unit: '-', required: true })!;
    const shaftEff     = parseTagged(inputs.shaftEfficiency,    'shaftEfficiency',    [], { min: 0.5, max: 1.0, unit: '-', required: true })!;
    const designMargin = parseTagged(inputs.mechanicalDesignMargin, 'mechanicalDesignMargin', [], { min: 1.0, max: 2.0, unit: '-', required: true })!;
    const fStator      = inputs.statorOpenAreaFraction
      ? parseTagged(inputs.statorOpenAreaFraction, 'statorOpenAreaFraction', [], { min: 0.01, max: 0.9, unit: '-' })
      : undefined;
    // A measurement/estimate at another temperature must never be used as the
    // Stage 4 operating-temperature value unless its explicit, source-tagged
    // temperature coefficient resolves it through the governed ECR-2 route.
    const gammaCandidate = inputs.interfacialTension !== undefined
      ? parseTagged(inputs.interfacialTension, 'interfacialTension', [], { min: 0.0001, max: 0.1, unit: 'N/m' })
      : undefined;
    // Direct engine callers from pre-reference-temperature payloads represent
    // their untagged sigma value as a value for the current run condition.
    // Workspace-mapped records always carry an explicit reference temperature,
    // so an explicitly tagged 70 °C value can never pass for a 40 °C run.
    const gammaReferenceTemperature_C = Number(
      (inputs.interfacialTension as any)?.referenceTemperatureC ?? T_C,
    );
    const gammaRaw = inputs.interfacialTension as Record<string, any> | undefined;
    const gammaTemperatureCoefficient = gammaRaw?.temperatureCoefficient;
    const gammaTemperatureRoute = gammaCandidate
      && Number.isFinite(gammaReferenceTemperature_C)
      && Math.abs(gammaReferenceTemperature_C - T_C) > 1e-9
      && gammaTemperatureCoefficient
      && typeof gammaTemperatureCoefficient === 'object'
      ? resolveEcr2RrboNmpInterfacialTensionAtTemperature({
          temperature_C: T_C,
          anchor: {
            value_N_m: gammaCandidate.value,
            temperature_C: gammaReferenceTemperature_C,
            sourceType: gammaCandidate.sourceType,
            sourceReference: gammaCandidate.sourceReference,
          },
          temperatureCoefficient: {
            slopePerC: num(gammaTemperatureCoefficient.slopePerC) ?? Number.NaN,
            sourceType: String(gammaTemperatureCoefficient.sourceType ?? ''),
            sourceReference: String(gammaTemperatureCoefficient.sourceReference ?? ''),
          },
        })
      : undefined;
    const gammaConstantPreliminaryRoute = gammaCandidate
      && Number.isFinite(gammaReferenceTemperature_C)
      && Math.abs(gammaReferenceTemperature_C - T_C) > 1e-9
      && !gammaTemperatureRoute
      && gammaRaw?.preliminaryConstantBasisId
        === ECR2_RRBO_NMP_SIGMA_CONSTANT_PRELIMINARY_BASIS.id
      ? resolveEcr2RrboNmpInterfacialTensionConstantAtTemperature({
          temperature_C: T_C,
          anchor: {
            value_N_m: gammaCandidate.value,
            temperature_C: gammaReferenceTemperature_C,
            sourceType: gammaCandidate.sourceType,
            sourceReference: gammaCandidate.sourceReference,
          },
        })
      : undefined;
    const gammaTemperatureResolution = gammaTemperatureRoute ?? gammaConstantPreliminaryRoute;
    const gamma: ResolvedSigmaTaggedValue | undefined =
      gammaCandidate && Number.isFinite(gammaReferenceTemperature_C)
      && Math.abs(gammaReferenceTemperature_C - T_C) < 1e-9
        ? {
            ...gammaCandidate,
            referenceTemperatureC: T_C,
          }
        : gammaTemperatureResolution
          ? {
              ...gammaCandidate!,
              value: gammaTemperatureResolution.value_N_m,
              referenceTemperatureC: T_C,
              temperatureResolution: gammaTemperatureResolution,
            }
          : undefined;
    if (gamma?.temperatureResolution?.resolutionMode === 'preliminary_constant_over_range') {
      const range = gamma.temperatureResolution.applicabilityRange_C;
      pushWarning(
        'INTERFACIAL_TENSION_TEMPERATURE_DEPENDENCE_NOT_MODELLED',
        `sigma uses the unchanged ${gamma.temperatureResolution.anchor.temperature_C} °C source anchor at the selected ${T_C} °C operating condition ` +
        `under the governed preliminary constant-over-range basis [${range.min}, ${range.max}] °C. ` +
        'No sigma(T) correlation has been applied.',
      );
    }
    if (gammaCandidate && !gamma) {
      pushWarning(
        'SIGMA_TEMPERATURE_ROUTE_UNAVAILABLE',
        `sigma: record reference temperature ${Number.isFinite(gammaReferenceTemperature_C) ? `${gammaReferenceTemperature_C} °C` : 'is missing'} ` +
        `cannot be used at Stage 4 Extraction Temperature ${T_C} °C because neither a complete governed NMP/RRBO temperature correlation nor a bounded preliminary constant basis applies. ` +
        'The current controlled sigma bases apply only from 25–100 °C.',
      );
    }
    if (!gamma)
      pushWarning(
        'HOLDUP_GAMMA_MISSING',
        'interfacialTension is not resolved at the Stage 4 Extraction Temperature — K&H 1995 holdup (ecr2_holdup_kh1995) is not calculable. ' +
        'Provide γ (N/m) at that temperature or register a governed temperature route.',
      );
    const feedDensity  = parseTagged(inputs.feedDensity,   'feedDensity',   [], { min: 500, max: 1200, unit: 'kg/m3', required: true })!;
    const governedPsi = inputs.governedPsi_W_kg
      ? parseTagged(inputs.governedPsi_W_kg, 'governedPsi_W_kg', [], { min: 1e-12, max: 1e6, unit: 'W/kg' })
      : undefined;
    const processSizingBasis = inputs.ecr2ResolvedProcessSizingBasis as Record<string, unknown>;
    if (processSizingBasis.status === 'PRELIMINARY_DEFAULT') {
      pushWarning(
        'ECR2_PROCESS_SIZING_BASIS_PRELIMINARY',
        'ECR-2 generated its diameter trials and ψ from the system preliminary process-model basis. This evaluation envelope is not a hydraulic/flooding criterion and does not select a final diameter.',
      );
    }

    const mwRaw = inputs.molecularWeights as Record<string, unknown>;
    const mwSat  = parseTagged(mwRaw.saturates_g_mol, 'molecularWeights.saturates_g_mol', [], { min: 100, max: 1000, unit: 'g/mol', required: true })!;
    const mwMono = parseTagged(mwRaw.mono_g_mol,      'molecularWeights.mono_g_mol',      [], { min: 100, max: 1000, unit: 'g/mol', required: true })!;
    const mwDi   = parseTagged(mwRaw.di_g_mol,        'molecularWeights.di_g_mol',        [], { min: 100, max: 1000, unit: 'g/mol', required: true })!;
    const mwPoly = parseTagged(mwRaw.poly_g_mol,      'molecularWeights.poly_g_mol',      [], { min: 100, max: 1000, unit: 'g/mol', required: true })!;
    const physicalMolecularWeights: ECR2MolecularWeights = {
      saturates_g_mol: mwSat,
      mono_g_mol: mwMono,
      di_g_mol: mwDi,
      poly_g_mol: mwPoly,
    };
    const physicalBasis = buildECR2PhysicalBasis(physicalMolecularWeights);

    // Warn if any MW is Assumed
    const mwAssumed = [mwSat, mwMono, mwDi, mwPoly].some((t) => t.sourceType === 'Assumed');
    if (mwAssumed)
      pushWarning('PHYSICAL_MW_ASSUMED', 'One or more physical/project RRBO molecular weights are Assumed. They remain active engineering inputs for the pending physical mass-transfer architecture and do not alter Coto/NRTL coordinates.');

    // ── NRTL model status at operating temperature ───────────────────────────
    const nrtlStatus = temperatureModelStatus(T_K);
    const thermodynamicValidity = resolveThermodynamicValidityAtTemperature(T_K);
    const nrtlNote = nrtlStatus.mode === 'interpolation'
      ? `NRTL model: in-range at ${T_C} °C — experimental tie-lines exact.`
      : nrtlStatus.mode === 'extrapolation'
        ? `NRTL model: EXTRAPOLATION at ${T_C} °C — Temperature Extrapolation Preliminary / Pending Validation.`
        : `NRTL model: status '${nrtlStatus.mode}' at ${T_C} °C.`;

    // ── ECR-2 geometry ───────────────────────────────────────────────────────
    const A_col  = columnCrossSectionArea(D);                      // m²
    const D_R    = ratio * D;                                       // m
    const A_R    = rotorArea(D_R);                                  // m²
    const v_tip  = tipSpeed(D_R, rpm);                              // m/s
    const v_stator = fStator
      ? null  // computed per compartment using actual flows below
      : null; // not supplied

    // The numerical axial mesh is established only after the progressive
    // physical-height solve. hComp is Δz_max, never an equipment-stage height.

    // ── Physical feed composition → separate thermodynamic coordinates ──────
    const fc = inputs.feedCompositionMassFraction as Record<string, unknown>;
    const rrboMassFrac: ComponentVector = [
      num(fc.saturates)!,
      num(fc.mono)!,
      num(fc.di)!,
      num(fc.poly)!,
      0, // RRBO feed contains no NMP initially
    ];
    // Renormalize to account for NMP=0
    const rrboBuildSum = rrboMassFrac.slice(0, 4).reduce((s, v) => s + v, 0);
    const rrboNormalized: ComponentVector = [
      rrboMassFrac[0] / rrboBuildSum,
      rrboMassFrac[1] / rrboBuildSum,
      rrboMassFrac[2] / rrboBuildSum,
      rrboMassFrac[3] / rrboBuildSum,
      0,
    ];
    const c2ThermodynamicHandoff = inputs.c2ThermodynamicHandoff as ECR2C2ThermodynamicHandoff | undefined;
    const thermodynamicBasis = buildECR2ThermodynamicBasis({
      operatingTemperatureC: T_C,
      rrboMassFlow_kg_h: mRRBO,
      nmpMassFlow_kg_h: mNMP,
      rrboMassFractions: rrboNormalized,
      c2ThermodynamicHandoff,
    });
    const x_feed_thermo = thermodynamicBasis.feedMoleFractions;
    const L_feed_surrogate_mol_h =
      (mRRBO * 1000) / thermodynamicBasis.averageSurrogateFeedMW_g_mol;
    const rrboSurrogateComponentMassRepresentation_kg_h =
      surrogateComponentMassRepresentation(L_feed_surrogate_mol_h, x_feed_thermo);

    // The physical NMP purity remains a plant-boundary input. The C2/NRTL
    // thermodynamic solvent boundary is canonical fresh NMP so it closes with
    // the selected C2 solvent molar ratio.
    if (purity < 1.0)
      pushWarning('NMP_PURITY_PHYSICAL_ONLY', `NMP purity ${purity.toFixed(4)} is retained as a physical plant-boundary input. The C2 thermodynamic solvent coordinate is canonical fresh NMP; characterize impurities before any physical mass-transfer architecture is enabled.`);
    const y_feed_thermo: ComponentVector = [0, 0, 0, 0, 1];
    const V_feed_surrogate_mol_h =
      L_feed_surrogate_mol_h * thermodynamicBasis.solventMolarRatio;
    const nmpSurrogateComponentMassRepresentation_kg_h =
      surrogateComponentMassRepresentation(V_feed_surrogate_mol_h, y_feed_thermo);
    const lleFlashAtOperatingTemperature = buildECR2LLEFlashSnapshot({
      operatingTemperatureC: T_C,
      operatingTemperatureK: T_K,
      feedMoleFractions: x_feed_thermo,
      freshNmpMoleFractions: y_feed_thermo,
      solventMolarRatio: thermodynamicBasis.solventMolarRatio,
      temperatureStatus: nrtlStatus,
      thermodynamicValidity,
      modelIdentity: thermodynamicBasis.modelIdentity,
    });
    if (lleFlashAtOperatingTemperature.status === 'not_converged') {
      pushWarning(
        'ECR2_NRTL_LLE_NOT_CONVERGED',
        lleFlashAtOperatingTemperature.diagnostics[0],
      );
    } else if (
      lleFlashAtOperatingTemperature.status === 'trivial_single_phase' ||
      lleFlashAtOperatingTemperature.status === 'not_calculable'
    ) {
      pushWarning(
        'ECR2_NRTL_LLE_NOT_CALCULABLE',
        lleFlashAtOperatingTemperature.diagnostics[0],
      );
    }

    // ── Boundary conditions ──────────────────────────────────────────────────
    const boundaryConditions: ECR2BoundaryConditions = {
      bottom: {
        z_m: 0,
        rrboFeed_kg_h: mRRBO,
        x_feed_thermo,
        L_feed_surrogate_mol_h,
        surrogateComponentMassRepresentation_kg_h: rrboSurrogateComponentMassRepresentation_kg_h,
        extract_outlet: null,
      },
      top: {
        // Filled with the selected physical height after the BVP-height search.
        z_m: 0,
        nmpFeed_kg_h: mNMP,
        y_feed_thermo,
        V_feed_surrogate_mol_h,
        surrogateComponentMassRepresentation_kg_h: nmpSurrogateComponentMassRepresentation_kg_h,
        raffinate_outlet: null,
      },
    };

    // ── Volumetric flows ─────────────────────────────────────────────────────
    // Phase 1 uses inlet-condition properties for all compartments.
    // Phase 2 will replace with composition-dependent values.
    const rho = feedDensity.value; // kg/m³ — RRBO density used for power; NMP from EPD library
    const rhoNMP = getProperty('nmp', 'density', T_C);
    const muNMP = getProperty('nmp', 'dynamicViscosity', T_C);
    for (const w of rhoNMP.warnings)
      pushWarning(w.code ?? 'EPD_WARNING', w.message);

    const qRRBO_m3_h = mRRBO / rho;                  // m³/h
    const qNMP_m3_h  = mNMP  / rhoNMP.value;         // m³/h
    const qTotal_m3_h = qRRBO_m3_h + qNMP_m3_h;

    const qC_m3_h = rrboContinuous ? qRRBO_m3_h : qNMP_m3_h;
    const qD_m3_h = rrboContinuous ? qNMP_m3_h  : qRRBO_m3_h;

    // Superficial velocities (m/s)
    const u_raffinate_m_s = qRRBO_m3_h / 3600 / A_col; // upward (RRBO)
    const u_extract_m_s   = qNMP_m3_h  / 3600 / A_col; // downward (NMP)
    const specificThroughput = qTotal_m3_h / A_col;    // m³/(m²·h)

    // ── Mechanical context (not a process-sizing basis) ─────────────────────
    // These values remain available as descriptive rotor/mechanical context.
    // They must not determine process P/V or ψ; mechanical design is a later
    // consumer of a selected process design.
    const rhoMix_phase1 = rrboContinuous ? rho : rhoNMP.value;
    const P1_W = powerPerRotor(powerNumber.value, rhoMix_phase1, rpm, D_R);
    const P_shaft_physical_W = P1_W;
    const psi_W_kg = governedPsi?.value ?? Number.NaN;
    const P_V_W_m3 = Number.isFinite(psi_W_kg)
      ? rhoMix_phase1 * psi_W_kg
      : Number.NaN;

    const v_st_m_s = fStator
      ? statorVelocity(qTotal_m3_h, A_col, fStator.value)
      : null;

    // ── Governed process agitation basis ────────────────────────────────────
    // P/V = ρ_mix × ψ.  ψ is an independent, source-tagged process condition,
    // so changing physical height or diameter cannot silently change agitation.
    if (!governedPsi) {
      pushWarning(
        'GOVERNED_PSI_MISSING',
        'ECR-2 D/H sizing is blocked because governedPsi_W_kg is missing; rotor-derived ψ/P·V is not permitted.',
      );
    }

    // ── K&H 1995 holdup — uniform Phase 1 calculation ─────────────────────────
    //
    // Computed once with inlet-condition properties (Phase 1 uniform assumption).
    // Phase 2 will call per compartment with local ρ, γ, and flow corrections.
    //
    // Phase mapping is governance-fixed for ECR-2:
    //   Dispersed = RRBO → Ud = u_raffinate_m_s, ρd = feedDensity.value
    //   Continuous = NMP → Uc = u_extract_m_s,   ρc = rhoNMP.value
    //
    // xf: stator open-area fraction. If statorOpenAreaFraction was not supplied,
    // xf = NaN triggers input_missing in computeKH1995Holdup — no silent default.
    //
    let holdupResult: KH1995HoldupResult | null = null;

    // ── d₃₂ computation ──────────────────────────────────────────────────────
    //
    // Phase 1 uniform: d₃₂ is computed once with inlet-condition properties.
    // A future local-property layer may call per compartment with local ρ_c,
    // ρ_d, σ, and ψ. This Phase 1 calculation is explicitly uniform/inlet.
    //
    // If d32Config is not supplied, d₃₂ is not attempted.
    // If d32Config.mode='published_correlation', returns the controlled
    // transcription-invalid K&H 1996 status without a numerical d₃₂.
    // If d32Config.mode='engineer_supplied', uses the engineer-supplied value.
    // If d32Config.mode='direct_turbulence_preliminary', consumes governed Stage
    // 7 rotor N_e, n, d_R, V_R and a source-tagged selected C. This separate
    // route must never be identified as, or alter, the K&H 1996 route.
    //
    const d32Config = inputs.d32Config as D32Config | undefined;

    // Build the Phase 1 inlet-state for the approved published d₃₂ direction:
    // NMP continuous, RRBO dispersed. Engineer-supplied d₃₂ ignores this state.
    const d32LocalState = {
      h_comp_m:       hComp,
      psi_W_kg,
      rho_c_kg_m3:    rhoNMP.value,       // NMP = continuous phase
      rho_d_kg_m3:    feedDensity.value,  // RRBO = dispersed phase
      sigma_N_m:      gamma?.value,
    };

    const d32Result: D32Result | null = !d32Config
      ? null
      : (d32Config.mode === 'published_correlation' || d32Config.mode === 'direct_turbulence_preliminary') &&
          phaseConfig !== 'nmp_continuous_rrbo_dispersed'
        ? {
            d32_m: null,
            d32_raw_m: null,
            status: 'phase_configuration_unsupported',
            mode: d32Config.mode,
            correlationId: d32Config.mode === 'published_correlation'
              ? 'ecr2_d32_kh1996'
              : 'ecr2_d32_direct_turbulence_preliminary',
            label: null,
            extrapolated: false,
            diagnostics: [
              `${d32Config.mode === 'published_correlation' ? 'K&H 1996 d₃₂ source' : 'DIRECT_TURBULENCE_D32_PRELIMINARY'} route is scoped only to phaseConfiguration='nmp_continuous_rrbo_dispersed' ` +
              `(NMP continuous, RRBO dispersed); received '${phaseConfig}'.`,
              'No c→d mapping, phase-property reassignment, or alternate coefficient set is approved for this simulator path.',
            ],
            provenance:
              `${d32Config.mode === 'published_correlation' ? 'The transcription-invalid K&H 1996 source route' : 'The direct-turbulence preliminary route'} is not applicable to the selected phase configuration. ` +
              'The numerical d₃₂ calculation was intentionally not attempted.',
            engineerSource: null,
            engineeringBasis: d32Config.mode === 'published_correlation'
              ? 'K&H 1996 transcription-invalid source route (phase configuration not approved)'
              : 'DIRECT_TURBULENCE_D32_PRELIMINARY (phase configuration not approved)',
            governanceStatus: d32Config.mode === 'published_correlation'
              ? 'phase_configuration_not_approved_for_kh1996_transcription_invalid_route'
              : 'phase_configuration_not_approved_for_direct_turbulence_preliminary_route',
            primarySourceVerified: false,
            validatedForRRBONMP: false,
            pilotCalibrationStatus: d32Config.mode === 'published_correlation'
              ? 'NOT_APPLICABLE__TRANSCRIPTION_INVALID'
              : 'NOT_YET_PILOT_VALIDATED',
            calibrationFactor: 1.0,
            localAxialApplication: 'Not calculated — approved ECR-2 direction is NMP continuous / RRBO dispersed only',
          }
        : computeDropletDiameter(d32LocalState, d32Config);

    // Emit warnings for d₃₂ status
    if (d32Result?.status === 'transcription_invalid') {
      pushWarning(
        'D32_TRANSCRIPTION_INVALID',
        'K&H 1996 d₃₂ reconstruction is transcription-invalid: independent secondary reproductions require a reciprocal high-agitation contribution, while the legacy code directly added it. ' +
        'H and the numerator symbol remain unresolved; no numerical d₃₂ is calculated. Supply an explicit engineer-supplied value only for sensitivity work.',
      );
    }
    if (d32Result?.status === 'engineer_supplied') {
      pushWarning(
        'D32_ENGINEER_SUPPLIED',
        `Engineer-Supplied d₃₂ = ${(d32Result.d32_m! * 1000).toFixed(3)} mm — ` +
        'Simulator Development / Sensitivity Basis. NOT a published correlation result. ' +
        `Source: ${d32Result.engineerSource?.sourceType ?? 'unspecified'} — ${d32Result.engineerSource?.sourceReference ?? 'no reference'}. ` +
        'All downstream outputs (a, k_c, k_d, K_oa) carry this basis label.',
      );
    }
    if (d32Result?.status === 'calculated_preliminary') {
      pushWarning(
        'D32_DIRECT_TURBULENCE_PRELIMINARY',
        `DIRECT_TURBULENCE_D32_PRELIMINARY d₃₂ = ${(d32Result.d32_m! * 1000).toFixed(3)} mm ` +
        `(C=${d32Result.directTurbulence?.C_nominal}; C sensitivity ${((d32Result.directTurbulence?.d32_at_C_min_m ?? 0) * 1000).toFixed(3)}–${((d32Result.directTurbulence?.d32_at_C_max_m ?? 0) * 1000).toFixed(3)} mm). ` +
        'PRELIMINARY_ENGINEERING / NOT YET PILOT_VALIDATED; separate from K&H 1996.',
      );
    }
    if (d32Result?.status === 'phase_configuration_unsupported') {
      pushWarning(
        'D32_PHASE_CONFIGURATION_UNSUPPORTED',
        d32Result.diagnostics[0],
      );
    }
    if (d32Result?.status === 'input_missing' || d32Result?.status === 'calculation_invalid') {
      pushWarning(
        'D32_CALCULATION_BLOCKED',
        `K&H 1996 preliminary d₃₂ is unavailable: ${d32Result.diagnostics[0] ?? 'invalid or missing local-state input.'}`,
      );
    }

    const d32Scalar: number | null = (d32Result && isD32Usable(d32Result)) ? d32Result.d32_m : null;

    // ── Frozen counter-current BVP boundary ───────────────────────────────────
    // This engine assembles the typed boundary contract only. The numerical
    // equations, local properties and transfer physics remain owned by the
    // verified solver and are not reproduced here.
    const bvpSettings = (inputs.bvp ?? {}) as Record<string, any>;
    const rrboGradeId = String(bvpSettings.rrboGradeId ?? inputs.rrboFluidId ?? '');
    const rawFeedViscosity = inputs.feedViscosity
      ? parseTagged(inputs.feedViscosity, 'feedViscosity', [], { min: 1e-5, max: 10, unit: 'Pa.s' })
      : undefined;
    const rawFeedViscosityReferenceTemperature_C = Number(
      (inputs.feedViscosity as any)?.referenceTemperatureC ?? T_C,
    );
    let muDGoverned: {
      value: number;
      unit: string;
      sourceType: string;
      sourceReference: string;
      referenceTemperature_C: number;
      method: string;
      basis: string;
      warnings: readonly string[];
    } | null = null;
    if (rrboGradeId === 'rrbo-sn300') {
      try {
        const densityAtOperatingTemperature = getProperty('rrbo-sn300', 'density', T_C);
        let kinematicViscosity40_cSt: number | undefined;
        if (rawFeedViscosity && Math.abs(rawFeedViscosityReferenceTemperature_C - 40) < 1e-9) {
          const densityAt40 = getProperty('rrbo-sn300', 'density', 40);
          kinematicViscosity40_cSt = rawFeedViscosity.value * 1e6 / densityAt40.value;
        }
        const resolved = resolveRrboSn300DynamicViscosityAtTemperature({
          temperature_C: T_C,
          density_kg_m3: densityAtOperatingTemperature.value,
          kinematicViscosity40_cSt,
        });
        if (resolved) {
          muDGoverned = {
            value: resolved.value_Pa_s,
            unit: 'Pa.s',
            sourceType: 'Thermopac',
            sourceReference: `${resolved.source}; RRBO density at ${T_C} °C: ${densityAtOperatingTemperature.source}` +
              (rawFeedViscosity && Math.abs(rawFeedViscosityReferenceTemperature_C - 40) < 1e-9
                ? `; 40 °C anchor: ${sourceOf(rawFeedViscosity)}`
                : ''),
            referenceTemperature_C: T_C,
            method: resolved.method,
            basis: `rrbo_sn300_astm_d341_walther_operating_temperature_preliminary; ${resolved.applicability}`,
            warnings: [
              ...resolved.warnings,
              ...densityAtOperatingTemperature.warnings.map((warning) => warning.message),
            ],
          };
        }
      } catch {
        // The local-property closure reports the named operating-temperature
        // dependency block when the governed route cannot be assembled.
      }
    }
    holdupResult = gamma !== undefined
      ? computeKH1995Holdup({
          Ud_m_s: u_raffinate_m_s,
          Uc_m_s: u_extract_m_s,
          rho_c_kg_m3: rhoNMP.value,
          rho_d_kg_m3: feedDensity.value,
          mu_c_Pa_s: muNMP.value,
          mu_d_Pa_s: muDGoverned?.value ?? rawFeedViscosity?.value ?? Number.NaN,
          gamma_N_m: gamma.value,
          xf: fStator?.value ?? Number.NaN,
          powerPerAgitator_W: P1_W,
          columnCrossSectionArea_m2: A_col,
          compartmentHeight_m: hComp,
          columnDiameter_m: D,
          rotorDiameter_m: D_R,
          massTransferDirection: 'bidirectional_multicomponent',
          systemIdentity: 'rrbo_nmp',
        })
      : null;
    if (holdupResult?.status === 'dependency_blocked') {
      pushWarning(
        'HOLDUP_DEPENDENCY_BLOCKED',
        `K&H 1995 primary holdup is NOT_CALCULABLE: ${holdupResult.blockedBy.join('; ')}. ` +
        'This is a physical-dependency/evidence block, not a flooding or process-infeasibility conclusion.',
      );
    } else if (holdupResult?.status === 'input_missing') {
      pushWarning('HOLDUP_INPUT_MISSING',
        `K&H 1995 primary holdup: missing or invalid required inputs (${holdupResult.missing.join(', ')}) — NOT_CALCULABLE.`);
    } else if (holdupResult?.status === 'calculation_invalid') {
      pushWarning('HOLDUP_CALCULATION_INVALID',
        `K&H 1995 primary holdup produced a non-finite result — ${holdupResult.reason}`);
    } else if (holdupResult?.status === 'physically_invalid') {
      pushWarning('HOLDUP_PHYSICALLY_INVALID',
        `K&H 1995 primary holdup raw result ${holdupResult.phi_raw.toFixed(4)} is inadmissible; it was not clipped and does not establish flooding.`);
    }
    const bvpBaseInput: Omit<ECR2CounterCurrentBVPInput,
      'numberOfCompartments' | 'activeHeight_m' | 'previousSolution'> = {
      columnCrossSectionArea_m2: A_col,
      psi_W_kg,
      powerPerAgitator_W: P1_W,
      columnDiameter_m: D,
      rotorDiameter_m: D_R,
      physicalCompartmentHeight_m: hComp,
      holdupSystemIdentity: 'rrbo_nmp',
      holdupMassTransferDirection: 'bidirectional_multicomponent',
      statorOpenAreaFraction: fStator?.value ?? Number.NaN,
      operatingTemperature_C: T_C,
      physicalMolecularWeights: {
        Sat_g_mol: mwSat.value,
        Mono_g_mol: mwMono.value,
        Di_g_mol: mwDi.value,
        Poly_g_mol: mwPoly.value,
        NMP_g_mol: 99.13,
      },
      c2ThermodynamicBasis: thermodynamicBasis,
      rrboFeedComponentFlows_kg_h: [
        mRRBO * rrboNormalized[IDX.SAT],
        mRRBO * rrboNormalized[IDX.MONO],
        mRRBO * rrboNormalized[IDX.DI],
        mRRBO * rrboNormalized[IDX.POLY],
        0,
      ],
      nmpFeedComponentFlows_kg_h: [0, 0, 0, 0, mNMP * purity],
      governedProperties: {
        rrboGradeId,
        mu_d_engineer: rawFeedViscosity
          ? {
              value: rawFeedViscosity.value,
              unit: 'Pa.s',
              sourceType: rawFeedViscosity.sourceType,
              sourceReference: rawFeedViscosity.sourceReference,
              referenceTemperature_C: rawFeedViscosityReferenceTemperature_C,
            }
          : null,
        mu_d_governed: muDGoverned,
        // Preserve the raw anchor even when the at-temperature route fails so
        // the BVP closure can name sigma (rather than reporting an anonymous
        // missing property) in its dependency block.
        sigma_engineer: gammaCandidate
          ? {
              value: gammaCandidate.value,
              unit: 'N/m',
              sourceType: gammaCandidate.sourceType,
              sourceReference: gammaCandidate.sourceReference,
              referenceTemperature_C: gammaReferenceTemperature_C,
            }
          : null,
        sigma_governed: gamma?.temperatureResolution
          ? {
              value: gamma.value,
              unit: 'N/m',
              sourceType: gamma.sourceType,
              sourceReference: gamma.sourceReference,
              referenceTemperature_C: gamma.referenceTemperatureC,
              method: gamma.temperatureResolution.method,
              basis: gamma.temperatureResolution.basis,
              warnings: gamma.temperatureResolution.warnings,
              resolutionMode: gamma.temperatureResolution.resolutionMode,
              applicabilityRange_C: gamma.temperatureResolution.applicabilityRange_C,
              anchor: {
                value: gamma.temperatureResolution.anchor.value_N_m,
                unit: 'N/m',
                sourceType: gamma.temperatureResolution.anchor.sourceType,
                sourceReference: gamma.temperatureResolution.anchor.sourceReference,
                referenceTemperature_C: gamma.temperatureResolution.anchor.temperature_C,
              },
            }
          : null,
        diffusivity: bvpSettings.diffusivity ?? emptyDiffusivityContract(),
      },
      d32Config: d32Config ?? null,
      partitionBasis: bvpSettings.partitionBasis ?? null,
      solverOptions: bvpSettings.solverOptions,
    };
    const targetInput = (inputs.lleStageInputs as Record<string, unknown> | undefined)
      ?.targetRaffinateAromaticsMolePct as Record<string, unknown> | undefined;
    const targetParseIssues: ValidationError[] = [];
    const targetTagged = targetInput
      ? parseTagged(
          targetInput,
          'lleStageInputs.targetRaffinateAromaticsMolePct',
          targetParseIssues,
          { min: 0.0001, max: 99.9999, unit: 'mol %' },
        )
      : undefined;
    const targetBasis = targetInput?.productQualityBasis;
    const physicalProductTarget = targetTagged
      && targetBasis === 'hydrocarbon_only_physical_outlet'
      ? {
          value: targetTagged.value / 100,
          sourceType: targetTagged.sourceType,
          sourceReference: targetTagged.sourceReference,
        }
      : null;
    let heightSizing: ECR2ProgressiveHeightSolveResult | null = null;
    let progressiveCompartmentSizing: ECR2ProgressiveCompartmentResult | null = null;
    let idealStageCascade: ECR2IdealStageCascadeResult | null = null;
    let bvpResult: ECR2CounterCurrentBVPResult;
    let performanceSimulationHeight_m: number | null = null;
    let performanceSimulationLabel: string | null = null;

    if (phaseConfig === 'nmp_continuous_rrbo_dispersed' && physicalProductTarget) {
      const idealStageInput = {
        target: physicalProductTarget,
        operatingTemperature_C: T_C,
        rrboFeedComponentFlows_kg_h: [
          mRRBO * rrboNormalized[IDX.SAT],
          mRRBO * rrboNormalized[IDX.MONO],
          mRRBO * rrboNormalized[IDX.DI],
          mRRBO * rrboNormalized[IDX.POLY],
          0,
        ],
        nmpFeedComponentFlows_kg_h: [0, 0, 0, 0, mNMP * purity],
        physicalMolecularWeights_g_mol: [
          mwSat.value, mwMono.value, mwDi.value, mwPoly.value, NMP_MW_G_MOL,
        ],
      } as const;
      // This must execute before the physical efficiency path. An ideal-stage
      // count belongs to the same physical outlet target and recovery gate,
      // never to the C2 full-phase aromatics target.
      idealStageCascade = solveECR2IdealStageCascade(idealStageInput);
      progressiveCompartmentSizing = idealStageCascade.status === 'target_met'
        ? solveECR2ProgressiveCompartments(idealStageInput)
        : createECR2ProgressiveCompartmentBlockedResult(
            physicalProductTarget,
            idealStageCascade.statusLabel,
          );
      const holdupBlockReason = holdupResult === null
        ? 'K&H 1995 primary holdup was not attempted because interfacial tension is unavailable.'
        : holdupResult.status === 'dependency_blocked'
          ? `K&H 1995 primary holdup dependency block: ${holdupResult.blockedBy.join('; ')}`
          : `K&H 1995 primary holdup is not usable: ${holdupResult.status}.`;
      const holdupUsableForPhysicalSizing = holdupResult !== null && isHoldupUsable(holdupResult);
      heightSizing = holdupUsableForPhysicalSizing
        ? solveECR2ProgressiveHeight({
            target: physicalProductTarget,
            maximumCellHeight_m: hComp,
            physicalMolecularWeights_g_mol: [
              mwSat.value, mwMono.value, mwDi.value, mwPoly.value, 99.13,
            ],
            bvpBaseInput,
          })
        : createECR2ProgressiveHeightBlockedResult({
            target: physicalProductTarget,
            maximumCellHeight_m: hComp,
            reason: holdupBlockReason,
          });
      const heightSizingFailure = heightSizing.diagnostics[heightSizing.diagnostics.length - 1]
        ?? 'the progressive BVP search did not establish an accepted physical height.';
      bvpResult = heightSizing.selectedBvp ?? createECR2BVPBlockedResult(
        holdupUsableForPhysicalSizing
          ? 'physical_height_not_established'
          : 'kh1995_primary_holdup_dependency',
        `Required Active Extraction Height = NOT_CALCULATED because ${heightSizingFailure}`,
        ['ECR-2 progressive BVP height search', heightSizingFailure],
      );
      if (heightSizing.status !== 'target_met') {
        const recoveryInfeasible = heightSizing.status === 'no_feasible_recovery';
        pushWarning(
          'ECR2_HEIGHT_NOT_CALCULABLE',
          recoveryInfeasible
            ? `ECR-2 physical height is NOT CALCULATED: NO FEASIBLE D/H SOLUTION AT REQUIRED RRBO RECOVERY. ${heightSizingFailure}`
            : `ECR-2 physical height is ${heightSizing.status === 'target_not_met' ? 'not attained' : 'not calculable'}: ${heightSizingFailure}`,
        );
      }
    } else {
      performanceSimulationHeight_m = manualDiagnosticHeight_m ?? null;
      const reason = phaseConfig !== 'nmp_continuous_rrbo_dispersed'
        ? 'the NMP-continuous/RRBO-dispersed phase orientation is not active'
        : targetInput === undefined
          ? 'no Stage 4 target has been supplied'
          : targetParseIssues[0]?.message
            ?? `target basis '${String(targetBasis ?? 'missing')}' is not the required hydrocarbon_only_physical_outlet basis`;
      if (
        performanceSimulationHeight_m !== null &&
        phaseConfig === 'nmp_continuous_rrbo_dispersed'
      ) {
        const performanceCells = Math.max(1, Math.ceil(performanceSimulationHeight_m / hComp));
        bvpResult = solveECR2CounterCurrentBVP({
          ...bvpBaseInput,
          numberOfCompartments: performanceCells,
          activeHeight_m: performanceSimulationHeight_m,
          previousSolution: Array.isArray(bvpSettings.previousSolution)
            ? bvpSettings.previousSolution
            : null,
        });
        performanceSimulationLabel = 'PERFORMANCE SIMULATION ONLY — fixed engineer-supplied height; not an ECR-2 calculated design height.';
        pushWarning(
          'ECR2_HEIGHT_TARGET_UNAVAILABLE',
          `Required Active Extraction Height = NOT_CALCULATED because ${reason}. The ${performanceSimulationHeight_m.toFixed(4)} m result is a PERFORMANCE SIMULATION ONLY and does not establish a design height.`,
        );
      } else {
        bvpResult = createECR2BVPBlockedResult(
          phaseConfig !== 'nmp_continuous_rrbo_dispersed' ? 'phase_configuration' : 'physical_product_target',
          `Required Active Extraction Height = NOT_CALCULATED because ${reason}. No fallback geometry or BVP sizing run is permitted without the governed target.`,
          [
            'ECR-2 physical height target governance',
            'A Stage 7 height, legacy manual height, or numerical mesh cap is not an ECR-2 design height.',
          ],
        );
        pushWarning(
          'ECR2_HEIGHT_TARGET_UNAVAILABLE',
          `Required Active Extraction Height = NOT_CALCULATED because ${reason}. No ECR-2 sizing BVP was run.`,
        );
      }
    }

    /**
     * Every configured diameter is an independent physical BVP and local
     * 30%-compartment trial. There is deliberately no diameter selection step.
     * The first trial above remains the legacy-detail payload; all remaining
     * trials are evaluated here with their own area and full local BVP closure.
     * There is deliberately no diameter-ranking or selection step.
     */
    const summarizeDiameterTrial = (
      diameter_m: number,
      area_m2: number,
      sizing: ECR2ProgressiveHeightSolveResult | null,
      progressiveSizing: ECR2ProgressiveCompartmentResult | null,
      bvp: ECR2CounterCurrentBVPResult,
      reason: string | null = null,
    ) => {
      const accepted = bvp.status === 'converged' && bvp.massBalanceStatus === 'passed';
      const quality = bvp.outlets.raffinate && accepted
        ? calculateHydrocarbonProductQuality({
            componentMoleFractions: bvp.outlets.raffinate.componentFlows_kg_h.map(
              (flow, index) => (flow * 1000) / [
                mwSat.value, mwMono.value, mwDi.value, mwPoly.value, NMP_MW_G_MOL,
              ][index],
            ),
            componentMassFlows_kg_h: bvp.outlets.raffinate.componentFlows_kg_h,
          })
        : null;
      const trialStatus = sizing?.status === 'target_met' && progressiveSizing?.status === 'target_met' && accepted
        ? 'feasible_preliminary'
        : sizing?.status === 'no_feasible_recovery'
          ? 'no_feasible_recovery'
        : sizing?.status === 'target_not_met'
          ? 'target_not_met'
          : progressiveSizing?.status === 'no_feasible_recovery'
            ? 'no_feasible_recovery'
            : progressiveSizing?.status === 'target_not_met'
              ? 'target_not_met'
          : 'dependency_blocked';
      return {
        diameter_m,
        columnCrossSectionArea_m2: area_m2,
        governedPsi_W_kg: Number.isFinite(psi_W_kg) ? psi_W_kg : null,
        psiDensityBasis: 'continuous_phase_inlet',
        rhoMix_kg_m3: rhoMix_phase1,
        powerPerVolume_W_m3: Number.isFinite(P_V_W_m3) ? P_V_W_m3 : null,
        superficialVelocities_m_s: {
          rrbo: qRRBO_m3_h / 3600 / area_m2,
          nmp: qNMP_m3_h / 3600 / area_m2,
        },
        status: trialStatus,
        feasible: trialStatus === 'feasible_preliminary',
        requiredActiveHeight_m: sizing?.requiredActiveHeight_m ?? null,
        requiredBvpHeight_m: sizing?.requiredActiveHeight_m ?? null,
        requiredProgressiveCompartmentHeight_m: progressiveSizing?.requiredActiveHeight_m ?? null,
        requiredProgressivePhysicalCompartmentCount: progressiveSizing?.requiredPhysicalCompartmentCount ?? null,
        productQualityResidual: sizing?.residual ?? null,
        productAromaticsMoleFraction: sizing?.achievedProductAromaticsMoleFraction
          ?? quality?.x_A_R_product.value
          ?? null,
        rrboRecoveryMassFraction: sizing?.rrboRecoveryMassFraction ?? null,
        recoveryResidual: sizing?.recoveryResidual ?? null,
        recoveryRequirement: sizing?.recoveryRequirement ?? null,
        bestAromaticsAtRequiredRecovery: sizing?.bestAromaticsAtRequiredRecovery ?? null,
        heightSizing: sizing,
        progressiveCompartmentSizing: progressiveSizing,
        bvp,
        diagnostic: reason
          ?? progressiveSizing?.diagnostics.at(-1)
          ?? sizing?.diagnostics.at(-1)
          ?? bvp.failure?.message
          ?? null,
        governance: {
          processCalculation: 'PRELIMINARY_PROCESS_CALCULATION',
          releaseStatus: 'NOT_RELEASE_ELIGIBLE',
          diameterSelection: 'NOT_SELECTED_BY_SIMULATOR',
        },
      };
    };

    const diameterTrials = [
       summarizeDiameterTrial(D, A_col, heightSizing, progressiveCompartmentSizing, bvpResult),
      ...configuredDiameterTrials.slice(1).map((trialDiameter_m) => {
        const trialArea_m2 = columnCrossSectionArea(trialDiameter_m);
        if (phaseConfig !== 'nmp_continuous_rrbo_dispersed' || !physicalProductTarget || !(holdupResult !== null && isHoldupUsable(holdupResult))) {
          const reason = phaseConfig !== 'nmp_continuous_rrbo_dispersed'
            ? 'The NMP-continuous/RRBO-dispersed phase orientation is not active.'
            : !physicalProductTarget
              ? 'No compatible governed physical product-quality target is available.'
              : 'K&H 1995 primary holdup is dependency-blocked; no physical BVP height trial was run.';
          return summarizeDiameterTrial(
            trialDiameter_m,
            trialArea_m2,
            null,
            null,
            createECR2BVPBlockedResult('kh1995_primary_holdup_dependency', `Required Active Extraction Height = NOT_CALCULATED because ${reason}`),
            reason,
          );
        }
        const trialSizing = solveECR2ProgressiveHeight({
          target: physicalProductTarget,
          maximumCellHeight_m: hComp,
          physicalMolecularWeights_g_mol: [
            mwSat.value, mwMono.value, mwDi.value, mwPoly.value, NMP_MW_G_MOL,
          ],
          bvpBaseInput: {
            ...bvpBaseInput,
            columnCrossSectionArea_m2: trialArea_m2,
            psi_W_kg,
          },
        });
        const trialBvp = trialSizing.selectedBvp ?? createECR2BVPBlockedResult(
          'physical_height_not_established',
          `Required Active Extraction Height = NOT_CALCULATED because ${
            trialSizing.diagnostics.at(-1)
              ?? 'the progressive BVP search did not establish an accepted physical height.'
          }`,
          ['ECR-2 progressive BVP height search', ...trialSizing.diagnostics],
        );
        const trialProgressiveSizing = solveECR2ProgressiveCompartments({
          target: physicalProductTarget,
          operatingTemperature_C: T_C,
          rrboFeedComponentFlows_kg_h: [
            mRRBO * rrboNormalized[IDX.SAT],
            mRRBO * rrboNormalized[IDX.MONO],
            mRRBO * rrboNormalized[IDX.DI],
            mRRBO * rrboNormalized[IDX.POLY],
            0,
          ],
          nmpFeedComponentFlows_kg_h: [0, 0, 0, 0, mNMP * purity],
          physicalMolecularWeights_g_mol: [
            mwSat.value, mwMono.value, mwDi.value, mwPoly.value, NMP_MW_G_MOL,
          ],
        });
        return summarizeDiameterTrial(trialDiameter_m, trialArea_m2, trialSizing, trialProgressiveSizing, trialBvp);
      }),
    ];
    const feasibleDesignSet = diameterTrials
      .filter((trial) => trial.feasible)
      .map((trial) => ({
        diameter_m: trial.diameter_m,
        requiredBvpHeight_m: trial.requiredBvpHeight_m,
        requiredProgressiveCompartmentHeight_m: trial.requiredProgressiveCompartmentHeight_m,
        columnCrossSectionArea_m2: trial.columnCrossSectionArea_m2,
        governedPsi_W_kg: trial.governedPsi_W_kg,
        powerPerVolume_W_m3: trial.powerPerVolume_W_m3,
        productAromaticsMoleFraction: trial.productAromaticsMoleFraction,
        productQualityResidual: trial.productQualityResidual,
        rrboRecoveryMassFraction: trial.rrboRecoveryMassFraction,
        recoveryResidual: trial.recoveryResidual,
        releaseStatus: trial.governance.releaseStatus,
      }));
    const axialDiagnosticTrial = diameterTrials.find(
      (trial) => trial.bvp.axialDiagnostic.acceptanceStatus === 'ACCEPTED',
    ) ?? null;
    const axialTransferDiagnostic = axialDiagnosticTrial?.bvp.axialDiagnostic
      ?? bvpResult.axialDiagnostic;
    const axialTransferDiagnosticBasis = axialDiagnosticTrial
      ? {
          diameter_m: axialDiagnosticTrial.diameter_m,
          activeHeight_m: axialDiagnosticTrial.requiredActiveHeight_m,
          numberOfCells: axialDiagnosticTrial.heightSizing?.selectedNumberOfCells ?? null,
          deltaZ_m: axialDiagnosticTrial.heightSizing?.selectedDeltaZ_m ?? null,
          selection: 'LOWEST_ACCEPTED_PRELIMINARY_DIAMETER_TRIAL',
        }
      : null;
    const H = heightSizing?.requiredActiveHeight_m ?? manualDiagnosticHeight_m ?? hComp;
    const N_compartments = heightSizing?.selectedNumberOfCells
      ?? Math.max(1, Math.ceil(H / hComp));
    const deltaZ_m = heightSizing?.selectedDeltaZ_m ?? H / N_compartments;
    const selectedPowerPerVolume_W_m3 = P_V_W_m3;
    const selectedPsi_W_kg = psi_W_kg;
    // N_compartments is a numerical mesh count. It must not create rotors or
    // alter the governed process agitation condition.
    const P_shaft_total_W = P_shaft_physical_W;
    const P_motor_W = P_shaft_total_W / shaftEff.value * designMargin.value;
    boundaryConditions.top.z_m = H;
    const raffinateProductQuality = bvpResult.outlets.raffinate
      ? calculateHydrocarbonProductQuality({
          componentMoleFractions: bvpResult.outlets.raffinate.componentFlows_kg_h.map(
            (flow, index) => (flow * 1000) / [
              mwSat.value,
              mwMono.value,
              mwDi.value,
              mwPoly.value,
              NMP_MW_G_MOL,
            ][index],
          ),
          componentMassFlows_kg_h: bvpResult.outlets.raffinate.componentFlows_kg_h,
        })
      : null;
    if (bvpResult.status !== 'converged')
      pushWarning('BVP_NOT_ACCEPTED', bvpResult.failure?.message ?? bvpResult.diagnostics[0] ?? 'Counter-current BVP did not converge.');
    if (bvpResult.massBalanceStatus !== 'passed')
      pushWarning('BVP_MASS_BALANCE_FAILED', 'Counter-current BVP result is not accepted because its mass-balance check did not pass.');

    // ── Interfacial area ─────────────────────────────────────────────────────
    //
    // a = 6·φ_d / d₃₂ — requires both usable φ_d and usable d₃₂.
    // Computed once with Phase 1 uniform inlet-condition values.
    //
    const interfacialAreaResult: InterfacialAreaResult | null =
      (holdupResult !== null || d32Result !== null)
        ? computeInterfacialArea(holdupResult, d32Result)
        : null;

    const aScalar: number | null = interfacialAreaResult?.a_m2_m3 ?? null;

    if (interfacialAreaResult?.status === 'blocked_d32' && d32Config === undefined) {
      // Don't warn about this — user simply didn't supply d₃₂, which is expected
    } else if (interfacialAreaResult && interfacialAreaResult.a_m2_m3 !== null) {
      const interfacialAreaBasis = interfacialAreaResult.d32EngineerSupplied
          ? 'Engineer-supplied d₃₂ basis.'
          : 'Published correlation basis.';
      pushWarning(
        'INTERFACIAL_AREA_COMPUTED',
        `Interfacial area a = ${interfacialAreaResult.a_m2_m3.toFixed(1)} m²/m³ ` +
        `(φ_d = ${interfacialAreaResult.phi_d_used?.toFixed(4)}, d₃₂ = ${((interfacialAreaResult.d32_m_used ?? 0) * 1000).toFixed(3)} mm). ` +
        interfacialAreaBasis,
      );
    }

    // ── Slip velocity ────────────────────────────────────────────────────────
    const slipVelocityResult = (holdupResult !== null && isHoldupUsable(holdupResult))
      ? computeSlipVelocity(u_raffinate_m_s, u_extract_m_s, holdupResult.phi)
      : null;
    const U_slip_m_s: number | null = (slipVelocityResult && 'U_slip_m_s' in slipVelocityResult && slipVelocityResult.U_slip_m_s !== null)
      ? slipVelocityResult.U_slip_m_s
      : null;

    // ── Build compartment grid ───────────────────────────────────────────────
    const compartments: ECR2CompartmentState[] = [];
    for (let k = 1; k <= N_compartments; k++) {
      const z_bottom = (k - 1) * deltaZ_m;
      const z_top    = k * deltaZ_m;
      const z_centre = (z_bottom + z_top) / 2;

      compartments.push({
        compartmentIndex: k,
        z_centre_m: z_centre,
        z_bottom_m: z_bottom,
        z_top_m:    z_top,

        columnArea_m2:    A_col,
        rotorDiameter_m:  D_R,
        rotorArea_m2:     A_R,
        tipSpeed_m_s:     v_tip,
        statorVelocity_m_s: v_st_m_s,

        powerPerRotor_W:          P1_W,
        shaftPower_compartment_W: P_shaft_physical_W,
        powerPerVolume_W_m3:      selectedPowerPerVolume_W_m3,

        u_raffinate_m_s,
        u_extract_m_s,
        specificThroughput_m3_m2_h: specificThroughput,

        // Phase 2 — not yet solved
        x_raffinate_mole: null,
        y_extract_mole:   null,
        L_raffinate_mol_h: null,
        V_extract_mol_h:   null,

        // Phase 2 — composition-dependent properties
        rho_c_kg_m3:    null,
        rho_d_kg_m3:    null,
        deltarho_kg_m3: null,
        mu_c_Pa_s:      null,
        mu_d_Pa_s:      null,
        sigma_N_m:      null,

        // Correlation outputs — Phase 1 uniform values
        // d₃₂ and interfacial area: uniform across compartments in Phase 1
        // Phase 2 will compute per-compartment with local properties.
        d32_m:                d32Scalar,
        d32_result:           d32Result,
        holdup_dispersed:     holdupResult,
        interfacialArea_m2_m3: aScalar,
        interfacialArea_result: interfacialAreaResult,
        U_slip_m_s,
        massTransferPreliminary: createUnavailableKH1999PreliminaryLocalMassTransfer(),
        Koa_per_s: null,
      });
    }

    // ── S/O ratio ────────────────────────────────────────────────────────────
    const SO_mass = mNMP / mRRBO;

    // ── Correlation registry summary ─────────────────────────────────────────
    const corrRegistry = correlationRegistrySummary();

    // ── Result payload ───────────────────────────────────────────────────────
    const bvpAccepted = bvpResult.status === 'converged' && bvpResult.massBalanceStatus === 'passed';
    const componentLabels = ['saturates', 'monoAromatics', 'diAromatics', 'polyAromatics', 'nmp'] as const;
    const componentNames = ['Sat', 'Mono', 'Di', 'Poly', 'NMP'] as const;
    const feedComponentFlows = bvpBaseInput.rrboFeedComponentFlows_kg_h.map(
      (flow, index) => flow + bvpBaseInput.nmpFeedComponentFlows_kg_h[index],
    );
    const nullIfInvalid = (value: number | null | undefined): number | null =>
      typeof value === 'number' && Number.isFinite(value) ? value : null;
    const percentage = (numerator: number | null | undefined, denominator: number | null | undefined): number | null =>
      bvpAccepted && typeof numerator === 'number' && Number.isFinite(numerator)
        && typeof denominator === 'number' && Number.isFinite(denominator) && denominator > 0
        ? (numerator / denominator) * 100
        : null;
    const raffinateFlows = bvpAccepted ? bvpResult.outlets.raffinate?.componentFlows_kg_h ?? null : null;
    const extractFlows = bvpAccepted ? bvpResult.outlets.extract?.componentFlows_kg_h ?? null : null;
    const componentPerformance = Object.fromEntries(componentLabels.map((label, index) => {
      const feed = feedComponentFlows[index];
      const raffinate = raffinateFlows?.[index] ?? null;
      const extract = extractFlows?.[index] ?? null;
      return [label, {
        component: componentNames[index],
        feed_kg_h: nullIfInvalid(feed),
        raffinate_kg_h: nullIfInvalid(raffinate),
        extract_kg_h: nullIfInvalid(extract),
        raffinateRecovery_percent: percentage(raffinate, feed),
        extractRecovery_percent: percentage(extract, feed),
        removal_percent: percentage(extract, feed),
        loss_kg_h: bvpAccepted && raffinate !== null && typeof raffinate === 'number'
          ? nullIfInvalid(feed - raffinate)
          : null,
      }];
    }));
    const rrboFeedKgH = componentPerformance.saturates.feed_kg_h! +
      componentPerformance.monoAromatics.feed_kg_h! +
      componentPerformance.diAromatics.feed_kg_h! +
      componentPerformance.polyAromatics.feed_kg_h!;
    const rrboRaffinateKgH = bvpAccepted && raffinateFlows
      ? raffinateFlows.slice(0, 4).reduce((sum, flow) => sum + flow, 0)
      : null;
    const rrboExtractKgH = bvpAccepted && extractFlows
      ? extractFlows.slice(0, 4).reduce((sum, flow) => sum + flow, 0)
      : null;
    const totalAromaticFeedKgH = feedComponentFlows[1] + feedComponentFlows[2] + feedComponentFlows[3];
    const totalAromaticExtractKgH = extractFlows
      ? extractFlows[1] + extractFlows[2] + extractFlows[3]
      : null;
    const headlineEngineeringResults = {
      status: bvpAccepted ? 'CALCULATED_PRELIMINARY' : 'NOT_CALCULABLE',
      releaseStatus: 'NOT_RELEASE_ELIGIBLE',
      basis: 'Accepted five-component counter-current BVP outlet flows; preliminary local transfer physics.',
      rrboNmpFeed: {
        rrbo_kg_h: mRRBO,
        nmp_kg_h: mNMP,
        soRatio_mass: SO_mass,
      },
      selectedOperatingTemperature_C: T_C,
      raffinateFlow_kg_h: bvpAccepted ? nullIfInvalid(bvpResult.outlets.raffinate?.totalFlow_kg_h) : null,
      rrboTransferToExtract_kg_h: rrboExtractKgH,
      rrboRecovery_percent: percentage(rrboRaffinateKgH, rrboFeedKgH),
      extractOilYield_percent: percentage(rrboExtractKgH, rrboFeedKgH),
      saturatesRecovery_percent: componentPerformance.saturates.raffinateRecovery_percent,
      saturatesLoss_kg_h: componentPerformance.saturates.loss_kg_h,
      monoAromaticRemoval_percent: componentPerformance.monoAromatics.removal_percent,
      diAromaticRemoval_percent: componentPerformance.diAromatics.removal_percent,
      polyAromaticRemoval_percent: componentPerformance.polyAromatics.removal_percent,
      totalAromaticRemoval_percent: percentage(totalAromaticExtractKgH, totalAromaticFeedKgH),
      sulfurDbtPrediction: 'NOT_IMPLEMENTED',
      sulfurDbtPredictionNote: 'SULFUR/DBT PREDICTION = NOT IMPLEMENTED. Aromatic-transfer results must not be interpreted as sulfur or DBT removal.',
      componentPerformance,
      productQualityBasis: {
        raffinate: 'Hydrocarbon-only product quantities; NMP excluded from molar and mass denominators.',
        extract: 'Physical five-component outlet quantities; no product-quality claim is inferred.',
      },
    };
    const massBalanceSummary = {
      componentOrder: componentNames,
      feed_kg_h: feedComponentFlows,
      raffinate_kg_h: bvpAccepted ? bvpResult.outlets.raffinate?.componentFlows_kg_h ?? null : null,
      extract_kg_h: bvpAccepted ? bvpResult.outlets.extract?.componentFlows_kg_h ?? null : null,
      componentBalance_kg_h: bvpResult.componentBalances_kg_h,
      totalBalance_kg_h: bvpResult.totalMassBalance_kg_h,
      status: bvpResult.massBalanceStatus,
    };
    const data: Record<string, unknown> = {
      applicabilityStatement: APPLICABILITY_STATEMENT,
      phase: 2,
      calculationRunStatus: bvpResult.status === 'converged' && bvpResult.massBalanceStatus === 'passed'
        ? 'counter_current_bvp_accepted'
        : 'counter_current_bvp_not_accepted',
      transferStatus: bvpResult.transferStatus,
      reportingStatus: {
        numericalBvpStatus: bvpResult.status === 'converged' && bvpResult.massBalanceStatus === 'passed'
          ? 'CONVERGED_PRELIMINARY'
          : 'NOT_ACCEPTED',
        governedValues: bvpResult.transferStatus.governedValues,
        releaseStatus: bvpResult.transferStatus.releaseStatus,
        message: bvpResult.transferStatus.message,
      },
      diameterSizing: {
        method: 'engine_generated_independent_progressive_bvp_trials',
        processSizingBasis,
        selectedDiameter_m: null,
        selectionStatus: 'NOT_SELECTED_BY_SIMULATOR',
        selectionExplanation:
          'The ECR-2 simulator has no independent governed hydraulic diameter criterion. ' +
          'It returns the complete feasible preliminary (D,H) set; final diameter selection belongs to the Optimizer.',
        trialCount: diameterTrials.length,
        trials: diameterTrials,
        feasibleDesignSet,
        feasibleDesignCount: feasibleDesignSet.length,
      },
      phaseOrientationNote:
        'z=0=BOTTOM: RRBO enters (upward), extract exits. ' +
        'z=H=TOP: fresh NMP enters (downward), raffinate exits. ' +
        'NMP flows downward. RRBO/raffinate flows upward.',
      componentSystemNote:
        'Five-component system: [0]=Saturates, [1]=Mono, [2]=Di, [3]=Poly, [4]=NMP. ' +
        'Reuses governed NRTL pseudo-component system and τ parameters. ' +
        'No second characterization model created.',
      mechanicalRotorArrangement: 'NOT_USED_FOR_PROCESS_DH_SIZING',
      engineVersions: { cel: CEL_VERSION, epd: EPD_VERSION, ecrSimulator: ENGINE_VERSION },
      thermodynamicTemperatureValidation: thermodynamicValidity,
      lleFlashAtOperatingTemperature,
      c2TheoreticalStages: (inputs.c2TheoreticalStageHandoff as ECR2C2TheoreticalStageHandoff | undefined)
        ?? {
          status: 'not_available',
          theoreticalStages: null,
          basis: null,
        },
      axialTransferDiagnostic,
      axialTransferDiagnosticBasis,

      designBasis: {
        operatingTemperatureC:  T_C,
        operatingTemperatureK:  T_K,
        nrtlModelStatus:        {
          status: nrtlStatus,
          thermodynamicValidity,
          note: nrtlNote,
          execution: {
            status: lleFlashAtOperatingTemperature.status,
            selectedOperatingTemperatureK: lleFlashAtOperatingTemperature.temperature.selectedOperatingTemperature_K,
            converged: lleFlashAtOperatingTemperature.converged,
            trivial: lleFlashAtOperatingTemperature.trivial,
          },
        },
        phaseConfiguration:     { input: phaseConfig, continuousPhase, dispersedPhase },
        rrboFeed: {
          massFlow_kg_h:    mRRBO,
          density_kg_m3:    { value: rho, source: sourceOf(feedDensity) },
          volumetricFlow_m3_h: qRRBO_m3_h,
          compositionMassFraction: { saturates: rrboNormalized[IDX.SAT], mono: rrboNormalized[IDX.MONO], di: rrboNormalized[IDX.DI], poly: rrboNormalized[IDX.POLY] },
          thermodynamicMoleFraction: { saturates: x_feed_thermo[IDX.SAT], mono: x_feed_thermo[IDX.MONO], di: x_feed_thermo[IDX.DI], poly: x_feed_thermo[IDX.POLY], nmp: x_feed_thermo[IDX.NMP] },
          surrogateMolarFlow_mol_h: L_feed_surrogate_mol_h,
          surrogateComponentMassRepresentation_kg_h: { saturates: rrboSurrogateComponentMassRepresentation_kg_h[IDX.SAT], mono: rrboSurrogateComponentMassRepresentation_kg_h[IDX.MONO], di: rrboSurrogateComponentMassRepresentation_kg_h[IDX.DI], poly: rrboSurrogateComponentMassRepresentation_kg_h[IDX.POLY], nmp: rrboSurrogateComponentMassRepresentation_kg_h[IDX.NMP] },
          thermodynamicCoordinateNote: 'Closed Coto surrogate thermodynamic representation only. Physical RRBO kg/h and physical composition remain separately reported and are not redefined.',
        },
        nmpSolvent: {
          massFlow_kg_h:    mNMP,
          purity:           purity,
          density_kg_m3:    { value: rhoNMP.value, source: rhoNMP.source },
          volumetricFlow_m3_h: qNMP_m3_h,
          thermodynamicMoleFraction: { saturates: y_feed_thermo[IDX.SAT], mono: y_feed_thermo[IDX.MONO], di: y_feed_thermo[IDX.DI], poly: y_feed_thermo[IDX.POLY], nmp: y_feed_thermo[IDX.NMP] },
          surrogateMolarFlow_mol_h: V_feed_surrogate_mol_h,
          surrogateComponentMassRepresentation_kg_h: { saturates: nmpSurrogateComponentMassRepresentation_kg_h[IDX.SAT], mono: nmpSurrogateComponentMassRepresentation_kg_h[IDX.MONO], di: nmpSurrogateComponentMassRepresentation_kg_h[IDX.DI], poly: nmpSurrogateComponentMassRepresentation_kg_h[IDX.POLY], nmp: nmpSurrogateComponentMassRepresentation_kg_h[IDX.NMP] },
          impurityNote: purity < 1.0 ? 'Physical solvent impurity remains outside the C2 thermodynamic coordinate; no transfer mapping has been created.' : 'Physical solvent specified as pure NMP',
        },
        interfacialTension: gamma
          ? {
              value_N_m: gamma.value,
              requestedTemperature_C: T_C,
              sourceType: gamma.sourceType,
              sourceReference: gamma.sourceReference,
              ...(gamma.temperatureResolution
                ? {
                    method: gamma.temperatureResolution.method,
                    basis: gamma.temperatureResolution.basis,
                    warnings: gamma.temperatureResolution.warnings,
                    resolutionMode: gamma.temperatureResolution.resolutionMode,
                    applicabilityRange_C: gamma.temperatureResolution.applicabilityRange_C,
                    anchor: gamma.temperatureResolution.anchor,
                  }
                : {
                    method: 'Direct measured/engineer-supplied value at Stage 4 Extraction Temperature',
                    basis: 'column_constant_engineer_supplied_preliminary',
                    warnings: [],
                    anchor: {
                      value_N_m: gamma.value,
                      temperature_C: T_C,
                      sourceType: gamma.sourceType,
                      sourceReference: gamma.sourceReference,
                    },
                  }),
            }
          : {
              value_N_m: null,
              requestedTemperature_C: T_C,
              status: 'unresolved',
              explanation:
                'NMP/RRBO sigma is unresolved at Stage 4 Extraction Temperature; holdup and sigma-dependent d32 work remain blocked.',
            },
        SO_massRatio: SO_mass,
        physicalBasis,
      },

      thermodynamicBasis,
      physicalBasis,
      bvp: bvpResult,
      heightSizing: heightSizing
        ? {
            ...heightSizing,
            targetBasis: 'hydrocarbon_only_physical_outlet',
            targetExplanation:
              'A height is feasible only when the physical raffinate outlet hydrocarbon-only aromatic molar target is met and hydrocarbon-only RRBO recovery is at least 95%. NMP is excluded from the aromatic product basis and both RRBO-recovery numerator and denominator.',
            requiredActiveHeightStatus: heightSizing.requiredActiveHeight_m === null ? 'NOT_CALCULATED' : 'CALCULATED',
          }
        : {
            status: 'not_calculable',
            requiredActiveHeight_m: null,
            requiredActiveHeightStatus: 'NOT_CALCULATED',
            targetBasis: 'hydrocarbon_only_physical_outlet',
            targetExplanation:
              performanceSimulationLabel
                ?? 'No compatible Stage 4 physical outlet product-quality target was supplied. Required Active Extraction Height is NOT_CALCULATED; no fallback geometry is a design result.',
            performanceSimulationHeight_m,
            performanceSimulationLabel,
          },
      progressiveCompartmentSizing: progressiveCompartmentSizing
        ? {
            ...progressiveCompartmentSizing,
            targetBasis: 'hydrocarbon_only_physical_outlet',
            targetExplanation:
              'Independent local physical-compartment path: each 0.25 m compartment recomputes local NRTL equilibrium and applies 30% of the equilibrium component-flow change. It does not use N_T/0.30 or a global 0.70ⁿ shortcut.',
            requiredActiveHeightStatus: progressiveCompartmentSizing.requiredActiveHeight_m === null ? 'NOT_CALCULATED' : 'CALCULATED',
          }
        : {
            status: 'not_calculable',
            requiredActiveHeight_m: null,
            requiredActiveHeightStatus: 'NOT_CALCULATED',
            targetBasis: 'hydrocarbon_only_physical_outlet',
            targetExplanation:
              'No compatible Stage 4 physical outlet product-quality target was supplied. The independent 30% local physical-compartment path is NOT_CALCULATED.',
          },
      idealStageCascade: idealStageCascade
        ? {
            ...idealStageCascade,
            targetBasis: 'hydrocarbon_only_physical_outlet',
            targetExplanation:
              'ECR-2 N_T is the minimum integer counter-current ideal-stage count for which the same physical hydrocarbon-only raffinate aromatic target is met while NMP-free RRBO recovery remains at least 95%.',
          }
        : {
            status: 'not_calculable',
            statusLabel: 'NOT_CALCULABLE',
            establishedTheoreticalStages: null,
            trials: [],
            targetBasis: 'hydrocarbon_only_physical_outlet',
            targetExplanation:
              'No compatible Stage 4 physical outlet product-quality target was supplied. ECR-2 theoretical stages are NOT_ESTABLISHED.',
          },
      headlineEngineeringResults,
      massBalanceSummary,
      raffinateProductQuality,

      geometry: {
        formulaReference: 'ECR2-001',
        trialDiameter_m:             D,
        columnDiameter_m:            D,
        columnCrossSectionArea_m2:   A_col,
        rotorToColumnDiameterRatio:  ratio,
        rotorDiameter_m:             D_R,
        rotorSweptArea_m2:           A_R,
        maximumCellHeight_m:         hComp,
        numericalDeltaZ_m:           deltaZ_m,
        physicalRotorCount:          null,
        activeHeightRequired_m:      heightSizing?.requiredActiveHeight_m ?? null,
        activeHeightDiagnostic_m:    performanceSimulationHeight_m,
        nCompartments:               N_compartments,
        activeHeightActual_m:        heightSizing?.requiredActiveHeight_m ?? null,
        heightRoundingLoss_m:        null,
        heightMethod:                heightSizing?.status === 'target_met'
          ? 'progressive_bvp_product_quality_and_rrbo_recovery_target'
          : performanceSimulationHeight_m !== null
            ? 'performance_simulation_only_fixed_height'
            : 'not_calculated_no_governed_target',
        rotorType,
      },

      hydraulics: {
        formulaReference: 'ECR2-002',
        phase1Note: 'Phase 1 uses inlet-condition properties for all compartments. Axial property variation requires Phase 2 composition profile.',
        totalVolumetricFlow_m3_h:    qTotal_m3_h,
        rrboVolumetricFlow_m3_h:     qRRBO_m3_h,
        nmpVolumetricFlow_m3_h:      qNMP_m3_h,
        specificThroughput_m3_m2_h:  specificThroughput,
        u_raffinate_m_s,
        u_extract_m_s,
        tipSpeed_m_s:                v_tip,
        tipSpeedNote:                `v_tip = π·D_R·N = π × ${D_R.toFixed(4)} m × ${(rpm / 60).toFixed(4)} rev/s`,
        statorVelocity_m_s:          v_st_m_s,
        statorNote:                  fStator
          ? `v_stator = (Q_c+Q_d)/(A·f_stator) at f_stator=${fStator.value} [${sourceOf(fStator)}]`
          : 'statorOpenAreaFraction not supplied — stator velocity Not Calculable',
      },

      power: {
        formulaReference: 'ECR2-003',
        phase1DensityBasis: `Continuous-phase (${continuousPhase}) inlet density ${rhoMix_phase1.toFixed(1)} kg/m³ — Phase 1 uniform; axial variation requires Phase 2`,
        processSizingBasis: 'P/V = rho_mix × governed ψ; rotor/mechanical power is not used to size D or H.',
        governedPsi: governedPsi
          ? { value_W_kg: governedPsi.value, source: sourceOf(governedPsi), densityBasis: 'continuous_phase_inlet' }
          : null,
        N_P:                  { value: powerNumber.value, source: sourceOf(powerNumber) },
        rotorSpeed_rpm:       rpm,
        rotorSpeed_rev_s:     rpm / 60,
        powerPerRotor_W:      P1_W,
        powerPerActiveColumn_W: P_shaft_physical_W,
        powerPerVolume_W_m3:  selectedPowerPerVolume_W_m3,
        totalShaftPower_W:    P_shaft_total_W,
        totalShaftPower_kW:   P_shaft_total_W / 1000,
        motorDesignPower_W:   P_motor_W,
        motorDesignPower_kW:  P_motor_W / 1000,
        shaftEfficiency:      { value: shaftEff.value,     source: sourceOf(shaftEff) },
        designMargin:         { value: designMargin.value, source: sourceOf(designMargin) },
        powerFormula:         'Mechanical context only: P₁ = N_P · ρ_b · N³ · D_R⁵ (not used for process D/H sizing)',
        motorFormula:         'P_motor = P_shaft_total / η_shaft × design_margin',
        psi_W_kg: selectedPsi_W_kg,
        psiFormA_verified: 'P/V = rho_mix × governed ψ [W/m³]; ψ is invariant across every physical-height and diameter trial.',
        powerDensityBasis: `Process trial basis: ρ_mix (${continuousPhase} inlet) × governed ψ. Active height, rotor count, rotor pitch, rotor volume, shaft power, and motor power are excluded.`,
        psiMassBasis: 'Governed process specific agitation condition [W/kg].',
        psiDefinitionEvidenceStatus: 'governed_process_input',
      },

      boundaryConditions,

      axialGrid: {
        note: 'Numerical BVP mesh: Δz is a numerical discretisation only. Physical active height is selected independently by the outlet hydrocarbon-only product-quality target when the target basis and BVP gates are accepted.',
        compartments,
      },

      correlationRegistry: {
        note:
          'ecr2_holdup_kh1995: secondary_equation_verified — K&H 1995 holdup computed in Phase 1. ' +
          'ecr2_d32_kh1996: transcription_invalid — legacy reconstruction disabled because independent secondary reproductions contradict its high-agitation-term placement; H and numerator notation remain unresolved. ' +
           'ecr2_d32_direct_turbulence_preliminary: preliminary_engineering_reconstruction — separate source-tagged direct-turbulence sensitivity route; NOT YET PILOT_VALIDATED. ' +
          `ecr2_koa_kh1999: ${bvpResult.transferStatus.status} — ${bvpResult.transferStatus.message} ` +
          'ecr2_flooding_pending, ecr2_axial_dispersion_pending: pending/reserved.',
        entries: corrRegistry,
      },

      // ── Dependency graph ───────────────────────────────────────────────────
      dependencyGraph: buildDependencyGraph({
        psiAvailable:               true,
        holdupUsable:               holdupResult !== null && isHoldupUsable(holdupResult),
        holdupPhysicallyInvalid:    holdupResult?.status === 'physically_invalid',
        d32Available:               d32Scalar !== null,
        d32EngineerSupplied:        d32Result?.mode === 'engineer_supplied',
        d32CorrelationUnresolved:   d32Result?.status === 'correlation_unresolved',
        propertiesAvailable:        gamma !== undefined,
        transferStatus:              bvpResult.transferStatus,
      }),

      // ── d₃₂ section ────────────────────────────────────────────────────────
      d32: {
        correlationId:    d32Result?.correlationId ?? (
          d32Config?.mode === 'direct_turbulence_preliminary'
            ? 'ecr2_d32_direct_turbulence_preliminary'
            : 'ecr2_d32_kh1996'
        ),
        correlationStatus: d32Result?.status ?? 'not_attempted',
        engineeringBasis: d32Result?.engineeringBasis ?? 'd₃₂ not attempted',
        modeUsed:         d32Config?.mode ?? 'not_attempted',
        d32_mm:           d32Scalar !== null ? d32Scalar * 1000 : null,
        d32_m:            d32Scalar,
        d32_raw_m:        d32Result?.d32_raw_m ?? null,
        status:           d32Result?.status ?? 'not_attempted',
        label:            d32Result?.label ?? null,
        extrapolated:     d32Result?.extrapolated ?? false,
        diagnostics:      d32Result?.diagnostics ?? [],
        provenance:       d32Result?.provenance ?? 'd₃₂ not attempted — d32Config not supplied.',
        engineerSource:   d32Result?.engineerSource ?? null,
        governanceStatus: d32Result?.governanceStatus ?? 'not_attempted',
        primarySourceVerified: d32Result?.primarySourceVerified ?? false,
        validatedForRRBONMP: d32Result?.validatedForRRBONMP ?? false,
        pilotCalibrationStatus: d32Result?.pilotCalibrationStatus ?? 'NOT_YET_CALIBRATED',
        calibrationFactor: d32Result?.calibrationFactor ?? null,
        localAxialApplication: d32Result?.localAxialApplication ?? null,
        directTurbulence: d32Result?.directTurbulence ?? null,
        preliminaryTraceability: {
          numerator: 'UNRESOLVED: Laitinen Eq. (3) renders a numerator symbol raised to 0.45; no numerical identity is accepted.',
          geometry: 'UNRESOLVED: independent secondary reproductions establish a reciprocal high-agitation structure, but do not define H sufficiently for numerical use.',
          pendingEvidence: 'Independent authoritative resolution of H, numerator symbol, coefficient mapping, phase convention, and applicability; K&H 1996 primary text remains unverified.',
        },
      },

      // ── Interfacial area section ───────────────────────────────────────────
      interfacialArea: {
        formula: 'a = 6·φ_d / d₃₂  (m²/m³)',
        source: 'Laitinen (2019) Eq. (9) / standard drop-population model',
        a_m2_m3:       aScalar,
        status:        interfacialAreaResult?.status ?? 'not_attempted',
        phi_d_used:    interfacialAreaResult?.phi_d_used ?? null,
        d32_mm_used:   interfacialAreaResult?.d32_m_used !== null && interfacialAreaResult?.d32_m_used !== undefined
          ? interfacialAreaResult.d32_m_used * 1000
          : null,
        d32EngineerSupplied: interfacialAreaResult?.d32EngineerSupplied ?? false,
        label:         interfacialAreaResult?.label ?? null,
        blockingReasons: interfacialAreaResult?.blockingReasons ?? [
          'd₃₂ not supplied — provide d32Config to compute interfacial area.',
        ],
        diagnostics:   interfacialAreaResult?.diagnostics ?? [],
        provenance:    interfacialAreaResult?.provenance ?? 'a not attempted — d32Config not supplied.',
        slipVelocity: {
          U_slip_m_s,
          formula: 'U_slip = u_d/φ_d + u_c/(1−φ_d)',
          note: U_slip_m_s !== null
            ? `Computed from Phase 1 uniform φ_d. Does not require d₃₂.`
            : 'Not computed — requires usable φ_d.',
        },
      },

      // ── Mass-transfer interface contract ───────────────────────────────────
      massTransferInterface: {
        correlationId: 'ecr2_koa_kh1999',
        correlationStatus: 'preliminary_engineering_reconstruction',
        status: 'MASS_TRANSFER_PRELIMINARY',
        availability: bvpResult.transferStatus,
        reason:
          bvpResult.transferStatus.message,
        preliminaryParameters: ECR2_KH1999_PRELIMINARY_PARAMETERS,
        interfaceDefined: true,
        interfaceContract: {
          k_c: 'k_c = Sh_c · De_c / d₃₂  (m/s) — per pseudo-component, NMP continuous phase',
          k_d: 'k_d = Sh_d · De_d / d₃₂  (m/s) — per pseudo-component, RRBO dispersed phase',
          K_overall: 'K_overall,i = k_c · k_d / (k_d · K_d,i + k_c)  — component i, resistance-in-series',
          K_d_partition: 'K_d,i = C_d,i* / C_c,i* from NRTL flash per pseudo-component',
          Koa: 'K_oa,i = K_overall,i · a  (m/s)',
          applicationNote:
            'Must be applied per pseudo-component (Sat/Mono/Di/Poly) with component-specific De and K_d. ' +
            'A single lumped ki is NOT acceptable for ECR-2.',
        },
        drivingForceContract: {
          defined: drivingForceContractDefined,
          note: drivingForceContractNote,
        },
        pseudoComponentSystem: {
          0: 'Saturates   — separate De_c, De_d, K_d,0 required',
          1: 'Mono-aromatics — separate De_c, De_d, K_d,1 required',
          2: 'Di-aromatics   — separate De_c, De_d, K_d,2 required',
          3: 'Poly-aromatics — separate De_c, De_d, K_d,3 required',
          4: 'NMP (solvent) — not transferred on driving-force basis',
        },
        blockedBy: {
          primary: bvpResult.transferStatus.blocker
            ? { reason: bvpResult.transferStatus.blocker.dependency, correlationId: 'ecr2_koa_kh1999' }
            : null,
          message: bvpResult.transferStatus.blocker?.message ??
            'Governed K_oa remains unavailable. The local preliminary Koa shown in the BVP snapshot is not a release-eligible design value.',
        },
      },

      holdupCorrelation: {
        correlationId:     'ecr2_holdup_kh1995',
        correlationStatus: 'primary_equation_verified',
        engineeringBasis:  'Published Correlation — Primary Equation / Dependency-Gated',
        governanceStatus:  'PRIMARY_FORM_VERIFIED__RRBO_NMP_NOT_VALIDATED',
        primarySourceVerified: true,
        validatedForRRBONMP:   false,
        powerDissipationBasis: 'ε = P/(Ac·H·ρc); one agitator power, column area, local compartment height, continuous density',
        localAxialApplication: 'not_governed_for_RRBO_NMP',
        phase1Note: 'Phase 1: uniform inlet-condition properties applied to all compartments. Axial property variation requires Phase 2.',
        phaseMappingFixed: 'RRBO = dispersed (Ud, ρd) | NMP = continuous (Uc, ρc)',
        psi_W_kg,
        gamma_N_m: gamma?.value ?? null,
        xf: fStator?.value ?? null,
        result: holdupResult,
        // phi is non-null only when primary evidence and all dependencies are usable.
        phi: holdupResult?.status === 'calculated'
          ? holdupResult.phi
          : null,
        phi_raw: holdupResult != null && holdupResult.status !== 'input_missing'
          ? holdupResult.phi_raw
          : null,
        theta_s_m: holdupResult != null && holdupResult.status !== 'input_missing'
          ? holdupResult.theta_s_m
          : null,
        intermediates: holdupResult != null && holdupResult.status !== 'input_missing'
          ? holdupResult.intermediates
          : null,
        applicabilityDiagnostics: holdupResult != null && holdupResult.status !== 'input_missing'
          ? holdupResult.applicabilityDiagnostics
          : null,
        dependencyBlockers: holdupResult?.status === 'dependency_blocked'
          ? holdupResult.blockedBy
          : null,
        downstreamUsable: holdupResult != null
          ? holdupResult.status === 'calculated'
          : false,
      },

      forwardSimulationStatus: {
        lle: (() => {
          const flash = lleFlashAtOperatingTemperature;
          if (flash.status === 'two_phase_converged') {
            return `CALCULATED_PRELIMINARY — run-level NRTL LLE flash converged at Stage 4 Extraction Temperature ${flash.temperature.selectedOperatingTemperature_C.toFixed(2)} °C (${flash.temperature.selectedOperatingTemperature_K.toFixed(2)} K). ${flash.temperatureStatus.classification}.`;
          }
          return `NOT_CALCULABLE — ${flash.diagnostics[0] ?? 'NRTL LLE flash did not provide an accepted two-phase equilibrium result.'}`;
        })(),
        holdup: (() => {
          if (holdupResult == null) return 'NOT CALCULATED — interfacialTension not supplied';
          if (holdupResult.status === 'calculated')
            return `CALCULATED — φ = ${holdupResult.phi.toFixed(4)} (${(holdupResult.phi * 100).toFixed(2)} %) — Published Correlation Preliminary Engineering (K&H 1995)`;
          if (holdupResult.status === 'dependency_blocked')
            return `NOT_CALCULABLE — physical dependency blocked: ${holdupResult.blockedBy.join('; ')}`;
          return `NOT_CALCULABLE — ${holdupResult.status}`;
        })(),
        slipVelocity: U_slip_m_s !== null
          ? `CALCULATED — U_slip = ${U_slip_m_s.toExponential(4)} m/s (from φ_d, does not require d₃₂)`
          : 'NOT CALCULATED — requires usable φ_d',
        d32: (() => {
          if (!d32Config) return 'NOT ATTEMPTED — d32Config not supplied; provide d32Config to enable d₃₂ computation';
          if (d32Result?.status === 'engineer_supplied')
            return `ENGINEER_SUPPLIED — d₃₂ = ${(d32Result.d32_m! * 1000).toFixed(3)} mm — Simulator Development / Sensitivity Basis`;
          if (d32Result?.status === 'calculated_preliminary')
            return `DIRECT_TURBULENCE_D32_PRELIMINARY — d₃₂ = ${(d32Result.d32_m! * 1000).toFixed(3)} mm; PRELIMINARY_ENGINEERING / NOT YET PILOT_VALIDATED (not K&H 1996)`;
          if (d32Result?.status === 'transcription_invalid')
            return 'TRANSCRIPTION_INVALID — K&H 1996 legacy reconstruction is disabled; H and numerator notation are unresolved, so no d₃₂ is calculated.';
          if (d32Result?.status === 'phase_configuration_unsupported')
            return `NOT CALCULABLE — phase_configuration_unsupported: ${d32Result.diagnostics[0]}`;
          if (d32Result?.status === 'correlation_unresolved')
            return 'CORRELATION_UNRESOLVED — K&H 1996 has UNRESOLVED_SYMBOL and UNRESOLVED_GROUPING; cannot compute from published correlation';
          if (d32Result?.status === 'calculated')
            return `CALCULATED — d₃₂ = ${(d32Result.d32_m! * 1000).toFixed(3)} mm (K&H 1996)`;
          if (d32Result?.status === 'calculated_extrapolated')
            return `CALCULATED_EXTRAPOLATED — d₃₂ = ${(d32Result.d32_m! * 1000).toFixed(3)} mm (outside K&H 1996 validity range)`;
          return `NOT CALCULABLE — ${d32Result?.status ?? 'unknown'}`;
        })(),
        interfacialArea: (() => {
          if (!interfacialAreaResult) return 'NOT ATTEMPTED — d32Config not supplied';
          if (interfacialAreaResult.a_m2_m3 !== null)
            return `CALCULATED — a = ${interfacialAreaResult.a_m2_m3.toFixed(1)} m²/m³ ` +
              `(φ_d=${interfacialAreaResult.phi_d_used?.toFixed(4)}, d₃₂=${((interfacialAreaResult.d32_m_used ?? 0)*1000).toFixed(3)} mm` +
              `${interfacialAreaResult.d32EngineerSupplied
                ? ', engineer-supplied basis'
                : ''})`;
          return `BLOCKED — ${interfacialAreaResult.status}: ${interfacialAreaResult.blockingReasons.join('; ')}`;
        })(),
        massTransfer: `${bvpResult.transferStatus.status} — ${bvpResult.transferStatus.message}`,
        Koa: bvpResult.transferStatus.status === 'LOCAL_PRELIMINARY_CALCULATED'
          ? 'CALCULATED_PRELIMINARY — local Koa is provenance-tagged physics only; governed Koa remains unavailable and is not release-eligible.'
          : `UNAVAILABLE — ${bvpResult.transferStatus.message}`,
        bvp: bvpResult.status === 'converged' && bvpResult.massBalanceStatus === 'passed'
          ? 'CONVERGED_PRELIMINARY — counter-current five-component BVP solved numerically, but every transfer, profile, and outlet value remains NOT_RELEASE_ELIGIBLE.'
          : `NOT ACCEPTED — ${bvpResult.failure?.dependency ?? bvpResult.convergenceStatus}: ${bvpResult.failure?.message ?? bvpResult.diagnostics[0] ?? 'review BVP diagnostics.'}`,
        optimizer: 'NOT IMPLEMENTED — downstream of BVP',
        axialDispersion: 'NOT IMPLEMENTED — reserved; plug-flow baseline must be established first',
        nrtlReuseConfirmed: true,
        nrtlFunction: 'nrtlFlash(z, T_K, x0, y0) from llx-temperature-lle-model.ts — executed for the run-level inlet material basis and by local BVP equilibrium calculations',
        bvpOrientation: 'Two-point BVP: z=0 (RRBO feed known, extract unknown) and z=H (NMP feed known, raffinate unknown)',
        rateBasisNote: 'ECR-2 is rate-based. NRTL provides local equilibrium TARGET for driving force; finite K_oa determines actual transfer rate.',
        drivingForceContract: drivingForceContractNote,
      },

      ecr1IsolationProof: {
        note: 'ECR-1 (llx-ecr-engine.ts, calculation_type ecr) is completely isolated from ECR-2.',
        importsFromECR1: false,
        formulaNamespace: 'ECR2-NNN (this engine) vs ECR-00N (ECR-1) — no overlap',
        calculationType: CALCULATION_TYPE,
        ecr1CalculationType: 'ecr',
      },
    };

    return {
      ...base,
      status: feasibleDesignSet.length === 0
        ? 'error'
        : warnings.length > 0 || feasibleDesignSet.length !== diameterTrials.length
          ? 'warning'
          : 'success',
      data,
      warnings,
      validationIssues: gate.errors,
    };
  }

  // ── generateSummary ───────────────────────────────────────────────────────

  generateSummary(results: Record<string, unknown>): DesignSummary {
    const geo  = results.geometry  as Record<string, unknown> | undefined;
    const pwr  = results.power     as Record<string, unknown> | undefined;
    const d32S = results.d32       as Record<string, unknown> | undefined;
    const intA = results.interfacialArea as Record<string, unknown> | undefined;
    const dep  = results.dependencyGraph as Record<string, unknown> | undefined;
    const transfer = results.transferStatus as Record<string, unknown> | undefined;

    const d32mm    = d32S?.d32_mm    != null ? Number(d32S.d32_mm) : null;
    const aVal     = intA?.a_m2_m3   != null ? Number(intA.a_m2_m3) : null;
    const avail    = dep?.availableCount as number | undefined;
    const preliminary = dep?.preliminaryCount as number | undefined;
    const total    = dep?.totalCount    as number | undefined;

    return {
      keyResults: [
        geo?.nCompartments != null
          ? { label: 'Compartments', value: geo.nCompartments, highlight: true }
          : null,
        geo?.activeHeightActual_m != null
          ? { label: 'Active height (actual)', value: Number(geo.activeHeightActual_m), unit: 'm', highlight: true }
          : null,
        pwr?.totalShaftPower_kW != null
          ? { label: 'Total shaft power', value: Number(pwr.totalShaftPower_kW), unit: 'kW', highlight: true }
          : null,
        pwr?.psi_W_kg != null
          ? { label: 'Specific power ψ', value: Number(pwr.psi_W_kg), unit: 'W/kg', highlight: false }
          : null,
        d32mm !== null
          ? { label: 'd₃₂ (Phase 1 uniform)', value: d32mm, unit: 'mm', highlight: true }
          : { label: 'd₃₂', value: 'Blocked — K&H 1996 legacy reconstruction is transcription-invalid or no engineer value was supplied', highlight: false },
        aVal !== null
          ? { label: 'Interfacial area a', value: Number(aVal.toFixed(1)), unit: 'm²/m³', highlight: true }
          : { label: 'Interfacial area a', value: 'Blocked — requires d₃₂', highlight: false },
        avail != null && total != null
          ? {
              label: 'Dependency graph',
              value: `${avail}/${total} governed/standard quantities available${preliminary ? `; ${preliminary} calculated preliminary` : ''}`,
              highlight: false,
            }
          : null,
        transfer?.status != null
          ? {
              label: 'Transfer-result status',
              value: `${String(transfer.status)} — ${String(transfer.releaseStatus ?? 'NOT_RELEASE_ELIGIBLE')}`,
              highlight: false,
            }
          : null,
      ].filter(Boolean) as DesignSummary['keyResults'],
      recommendations: [
        transfer?.status === 'LOCAL_PRELIMINARY_CALCULATED'
          ? 'Counter-current BVP local transfer physics converged as preliminary engineering only; its profiles and outlets are not release-eligible design performance.'
          : 'Counter-current BVP local transfer physics is unavailable until its blocking dependency is resolved.',
        d32mm === null
          ? 'To enable a, k_c, k_d, K_oa: supply d32Config.mode=\'engineer_supplied\' for development/sensitivity.'
          : `d₃₂ = ${d32mm.toFixed(3)} mm (${d32S?.modeUsed}). Interfacial area a = ${aVal?.toFixed(1) ?? 'blocked'} m²/m³.`,
        'Governed K&H 1999 transfer performance remains unavailable; numerical local preliminary physics must retain its provenance and non-release status.',
        'K&H 1996 d₃₂: legacy reconstruction is transcription-invalid; resolve H, numerator notation, coefficient mapping, phase convention, and applicability from independent authoritative evidence before any numerical route is restored.',
        'ECR-1 remains frozen and isolated — calculation_type=\'ecr_simulator\' confirmed.',
      ],
      warnings: [],
      calculationClass: 'Preliminary Simulator — Local Transfer Physics Only (Not Release Eligible)',
    };
  }
}
