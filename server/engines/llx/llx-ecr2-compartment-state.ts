// ═══════════════════════════════════════════════════════════════════════════
// ECR-2 — Axial Compartment State Schema & Dependency Graph
//
// Defines the canonical per-compartment state vector (ECR2CompartmentStateV2)
// and the typed dependency graph that identifies which quantity blocks each
// downstream null.
//
// This schema is the ground truth for what the compartment-to-compartment
// simulator tracks and reports. All fields are present; unavailable values
// carry explicit null + a typed dependency reason rather than being omitted
// or silently set to zero.
//
// Dependency philosophy (section 12 of the simulator specification):
//   A. calculated              — computed from published correlation
//   B. calculated_extrapolated — computed, outside primary validity range
//   C. engineer_supplied       — explicit engineer-supplied development basis
//   D. physically_invalid      — input produced a physically impossible result
//   E. missing_dependency      — required upstream quantity unavailable
//
// Only D and E prevent downstream numerical consumption.
// "Not validated for RRBO/NMP" is provenance metadata, not a blocker.
// ═══════════════════════════════════════════════════════════════════════════

import type { ComponentVector } from './llx-ecr-simulator-engine';
import type { KH1995HoldupResult } from './llx-ecr2-holdup';
import type { D32Result } from './llx-ecr2-d32-interface';
import type { ECR2LocalNRTLResult } from './llx-ecr2-local-nrtl';
import type { ECR2LocalPropertySet } from './llx-ecr2-local-properties';
import type { ECR2DiffusivityContract, DiffusivityInput } from './llx-ecr2-diffusivity';

// ── Dependency reasons ─────────────────────────────────────────────────────

/**
 * Typed reasons why a compartment field is null.
 *
 * Use these as the `reason` in ECR2NullField so the UI and downstream
 * consumers can say exactly what is missing, rather than "Pending Validation".
 */
export type ECR2DependencyReason =
  | 'blocked_by_d32'            // d₃₂ is null (unresolved or not supplied)
  | 'blocked_by_holdup'         // φ_d is null (holdup calculation failed/missing)
  | 'blocked_by_interfacial_area' // a is null (needs φ_d + d₃₂)
  | 'blocked_by_kc'             // k_c is null
  | 'blocked_by_kd'             // k_d is null
  | 'blocked_by_K_overall'      // K_overall is null
  | 'blocked_by_Kd_partition'   // partition coefficient from NRTL unavailable
  | 'blocked_by_De'             // diffusivity not supplied for this component
  | 'blocked_by_local_properties' // rho_c, rho_d, mu_c, mu_d, or sigma null
  | 'blocked_by_composition'    // local composition (x/y) unavailable
  | 'correlation_unresolved'    // the governing correlation is not yet fully specified
  | 'phase_2_not_implemented'   // BVP/forward simulation not yet built
  | 'not_applicable';           // field not relevant in current configuration

/**
 * A null compartment value with an explicit dependency reason and the
 * registry correlation ID that must be resolved before it becomes available.
 */
export interface ECR2NullField {
  value: null;
  reason: ECR2DependencyReason;
  /** Registry correlation ID causing the block (e.g. 'ecr2_d32_kh1996'). */
  upstreamCorrelation: string | null;
  /** Human-readable explanation suitable for UI display. */
  message: string;
}

// ── Hydrodynamic dimensionless groups ──────────────────────────────────────

/**
 * Drop-level dimensionless groups — bulk (phase-level) quantities.
 *
 * Sc_c and Sc_d are per-component and live in ECR2ComponentMassTransfer.
 * These bulk groups use NMP/RRBO phase properties only.
 */
export interface ECR2HydrodynamicGroups {
  /** Slip velocity: U_slip = u_d/φ_d + u_c/(1−φ_d) (m/s).
   *  Computable once φ_d is available — does NOT require d₃₂. */
  U_slip_m_s: number | ECR2NullField;
  /** Drop Reynolds number: Re_d = ρ_c·U_slip·d₃₂/μ_c (—). Gated on d₃₂ + properties. */
  Re_drop: number | ECR2NullField;
  /** Drop Weber number: We = ρ_c·U_slip²·d₃₂/σ (—). Gated on d₃₂ + properties + σ. */
  We_drop: number | ECR2NullField;
  /**
   * Viscosity ratio κ = μ_d/μ_c (—).
   * Gated on μ_d (engineer-supplied) and μ_c (EPD library).
   */
  kappa: number | ECR2NullField;
  /**
   * NOTE: Sc_c,i and Sc_d,i are per-component (component-index-dependent De).
   * They live in ECR2ComponentMassTransfer, not here.
   */
}

/**
 * Per-component mass-transfer quantities.
 *
 * Applied separately for Sat (0), Mono (1), Di (2), Poly (3).
 * NMP (4) is the solvent — not included in this structure.
 *
 * Blocked fields carry ECR2NullField with an explicit dependency reason.
 * Dependency chain (all gated on d₃₂ and K&H 1999 approval):
 *
 *   De_c,i (engineer-supplied) → Sc_c,i → (Sh_c,i) → k_c,i = Sh_c,i·De_c,i/d₃₂
 *   De_d,i (engineer-supplied) → Sc_d,i → (Sh_d,i) → k_d,i = Sh_d,i·De_d,i/d₃₂
 *   k_c,i + k_d,i + K_d,i     → K_overall,i = k_c·k_d/(k_d·K_d+k_c)
 *   K_overall,i + a            → Koa_i = K_overall,i · a
 */
export interface ECR2ComponentMassTransfer {
  // ── Diffusivities (engineer-supplied — no EPD/CEL defaults) ──────────
  /** Molecular diffusivity of this component in the continuous (NMP) phase (m²/s). */
  De_c_m2_s: DiffusivityInput | ECR2NullField;
  /** Molecular diffusivity of this component in the dispersed (RRBO) phase (m²/s). */
  De_d_m2_s: DiffusivityInput | ECR2NullField;

  // ── Schmidt numbers (per-component — depend on De and phase properties) ──
  /** Continuous-phase Schmidt number: Sc_c,i = μ_c/(ρ_c·De_c,i) (—). */
  Sc_c: number | ECR2NullField;
  /** Dispersed-phase Schmidt number: Sc_d,i = μ_d/(ρ_d·De_d,i) (—). */
  Sc_d: number | ECR2NullField;

  // ── Sherwood numbers (K&H 1999 — pending_approval) ────────────────────
  /** Continuous-phase Sherwood number Sh_c,i (—). Gated on d₃₂ and K&H 1999. */
  Sh_c: number | ECR2NullField;
  /** Dispersed-phase Sherwood number Sh_d,i (—). Gated on d₃₂ and K&H 1999. */
  Sh_d: number | ECR2NullField;

  // ── Phase mass-transfer coefficients (m/s) ────────────────────────────
  /** Continuous-phase k_c,i = Sh_c,i·De_c,i/d₃₂ (m/s). */
  k_c_m_s: number | ECR2NullField;
  /** Dispersed-phase k_d,i = Sh_d,i·De_d,i/d₃₂ (m/s). */
  k_d_m_s: number | ECR2NullField;

  // ── Equilibrium partition coefficient ─────────────────────────────────
  /**
   * Partition coefficient K_d,i (—).
   * Definition and derivation from NRTL to be approved in the
   * Mass-Transfer / Driving-Force Approval Report (hard stop §9).
   * NOT computed until that derivation is approved.
   */
  K_d_partition: number | ECR2NullField;

  // ── Overall coefficient and K_oa ──────────────────────────────────────
  /**
   * Overall mass-transfer coefficient K_overall,i (m/s).
   * Formula blocked pending approval (§9). Structure preserved for wiring.
   */
  K_overall_m_s: number | ECR2NullField;
  /**
   * Volumetric overall coefficient K_oa,i = K_overall,i · a (1/s).
   *
   * Unit: s⁻¹ — NOT m/s.
   * K_overall,i [m/s] × a [m²/m³ = 1/m] = [1/s] ✓
   *
   * Null until K_overall,i and a are both available.
   * Numerical population blocked pending K&H 1999 approval and K_d,i definition approval.
   */
  Koa_i_per_s: number | ECR2NullField;

  // ── Driving force and transfer rate (NOT YET IMPLEMENTED) ────────────
  /**
   * Component driving force Δ_i (units TBD — see §9 approval report).
   * NOT implemented until K_d, K_overall basis, and concentration basis
   * are confirmed.
   */
  drivingForce_i: ECR2NullField;
  /**
   * Component transfer rate N_i (mol/(m³·s) × compartment volume).
   * NOT implemented — requires driving force and K_oa.
   */
  transferRate_i_mol_m3_s: ECR2NullField;
}

// ── Full compartment state schema (V2) ─────────────────────────────────────

/**
 * Full per-compartment state vector for the ECR-2 agitated extraction column.
 *
 * All 34+ scalar fields listed in the simulator specification (section 3) are
 * present. Quantities that depend on unresolved or not-yet-implemented upstream
 * correlations carry an ECR2NullField with an explicit typed reason.
 *
 * Naming: SI units in field name suffix, e.g. _m, _m2, _m3, _kg_m3, _Pa_s,
 * _N_m, _W, _W_m3, _W_kg, _m_s, _m2_m3.
 *
 * Phase orientation (fixed):
 *   z = 0  → bottom: RRBO enters (upward), extract exits
 *   z = H  → top:    NMP enters (downward), raffinate exits
 *
 * Component index (frozen): 0=Sat, 1=Mono, 2=Di, 3=Poly, 4=NMP
 */
export interface ECR2CompartmentStateV2 {

  // ── Identity ───────────────────────────────────────────────────────────
  /** Compartment index, 1-based from bottom. */
  compartmentIndex: number;
  /** Axial position of compartment centre — z (m from bottom, z=0). */
  z_m: number;
  /** Compartment bottom face z-coordinate (m). */
  z_bottom_m: number;
  /** Compartment top face z-coordinate (m). */
  z_top_m: number;

  // ── Column geometry (always available) ───────────────────────────────
  /** Column inner diameter D (m). */
  D_m: number;
  /** Column cross-sectional area A_col = π·D²/4 (m²). */
  A_col_m2: number;
  /** Compartment height h_comp (m). */
  h_comp_m: number;
  /** Rotor diameter D_R (m). */
  D_R_m: number;
  /** Rotor speed N (rev/s). */
  N_rev_s: number;
  /** Rotor speed RPM (rpm). */
  RPM: number;
  /** Stator free-area velocity (m/s). Null when f_stator not supplied. */
  u_stator_m_s: number | null;

  // ── Volumetric flows and superficial velocities (Phase 1) ─────────────
  /** RRBO (dispersed) volumetric flow at this compartment (m³/h). */
  Q_RRBO_m3_h: number;
  /** NMP (continuous) volumetric flow at this compartment (m³/h). */
  Q_NMP_m3_h: number;
  /** RRBO superficial velocity u_d (m/s). */
  u_RRBO_m_s: number;
  /** NMP superficial velocity u_c (m/s). */
  u_NMP_m_s: number;

  // ── Local physical properties (Phase 2 — NRTL-derived) ───────────────
  /** Local continuous-phase (NMP) density ρ_c (kg/m³). Null until Phase 2. */
  rho_c_kg_m3: number | ECR2NullField;
  /** Local dispersed-phase (RRBO) density ρ_d (kg/m³). Null until Phase 2. */
  rho_d_kg_m3: number | ECR2NullField;
  /** Local density difference Δρ = |ρ_c − ρ_d| (kg/m³). Null until Phase 2. */
  delta_rho_kg_m3: number | ECR2NullField;
  /** Local continuous-phase viscosity μ_c (Pa·s). Null until Phase 2. */
  mu_c_Pa_s: number | ECR2NullField;
  /** Local dispersed-phase viscosity μ_d (Pa·s). Null until Phase 2. */
  mu_d_Pa_s: number | ECR2NullField;
  /** Local interfacial tension σ (N/m).
   *  In Phase 1 this may be supplied as a single inlet value. */
  sigma_N_m: number | ECR2NullField;

  // ── Power and agitation (always available in Phase 1) ────────────────
  /** Shaft power per compartment P (W). */
  P_W: number;
  /** Power per unit volume P/V (W/m³). */
  PV_W_m3: number;
  /** Specific power input ψ = (P/V)/ρ_b (W/kg). */
  psi_W_kg: number;

  // ── Holdup (K&H 1995 — secondary_equation_verified) ──────────────────
  /**
   * Dispersed-phase holdup φ_d (—).
   * Full K&H 1995 result including status, governance, and diagnostics.
   * Null when holdup inputs are absent.
   */
  holdup_dispersed: KH1995HoldupResult | null;
  /**
   * Extracted φ_d scalar for downstream use.
   * Non-null only when holdup_dispersed.status is 'calculated' or
   * 'calculated_extrapolated' (i.e. isHoldupUsable() === true).
   */
  phi_d: number | ECR2NullField;

  // ── Droplet diameter (K&H 1996 — candidate_governed, unresolved) ──────
  /**
   * Full d₃₂ result from the plug-in interface.
   * Null when d₃₂ has not been computed (no engineer-supplied value and
   * published correlation is unresolved).
   */
  d32_result: D32Result | null;
  /**
   * Sauter mean droplet diameter d₃₂ (m).
   * Non-null only when d32_result.status is 'calculated', 
   * 'calculated_extrapolated', or 'engineer_supplied'.
   */
  d32_m: number | ECR2NullField;

  // ── Interfacial area (gated on φ_d and d₃₂) ──────────────────────────
  /**
   * Specific interfacial area a = 6·φ_d / d₃₂ (m²/m³).
   * Null when either φ_d or d₃₂ is unavailable.
   */
  a_m2_m3: number | ECR2NullField;

  // ── Hydrodynamic dimensionless groups (gated on d₃₂ + properties) ────
  hydrodynamicGroups: ECR2HydrodynamicGroups;

  // ── Mass transfer — per component (gated on d₃₂ + Sherwood + NRTL) ──
  /**
   * Per-component mass-transfer quantities.
   * Indexed by IDX: [Sat, Mono, Di, Poly].
   * NMP (IDX 4) is the solvent — not transferred on a driving-force basis.
   * All fields are ECR2NullField until K&H 1999 is approved and d₃₂ resolved.
   */
  massTransfer: [
    ECR2ComponentMassTransfer,  // 0 Saturates
    ECR2ComponentMassTransfer,  // 1 Mono-aromatics
    ECR2ComponentMassTransfer,  // 2 Di-aromatics
    ECR2ComponentMassTransfer,  // 3 Poly-aromatics
  ];

  /**
   * Overall volumetric mass-transfer coefficient K_oa = K_overall · a (1/s).
   *
   * Unit: s⁻¹ — NOT m/s.
   * K_overall [m/s] × a [m²/m³ = 1/m] = [1/s] ✓
   *
   * Null until K_overall and a are both available.
   * This is a SCALAR representing a lumped all-component value for reporting.
   * Rate-based calculation uses per-component K_overall,i · a (Koa_i_per_s) internally.
   * Numerical population blocked pending K&H 1999 approval and K_d,i definition approval.
   */
  Koa_per_s: number | ECR2NullField;

  // ── Local compartment composition (Phase 2 / test state) ────────────
  /**
   * Actual RRBO-rich (dispersed) phase mole fractions at this compartment [Sat, Mono, Di, Poly, NMP].
   * Supplied as a test state in Phase 2 pre-BVP development.
   * Not propagated axially yet (BVP not implemented).
   * Null until compositions are supplied or BVP is solved.
   */
  x_local: number[] | ECR2NullField;
  /**
   * Actual NMP-rich (continuous) phase mole fractions at this compartment [Sat, Mono, Di, Poly, NMP].
   * Null until supplied or BVP solved.
   */
  y_local: number[] | ECR2NullField;

  // ── Local NRTL equilibrium ─────────────────────────────────────────
  /**
   * NRTL equilibrium quantities at local compartment conditions.
   * Contains: gamma_x, gamma_y, x_eq, y_eq, flashConverged, flashTrivial,
   *           K_approx, temperatureStatus.
   * Null until x_local and y_local are supplied.
   */
  nrtlLocal: ECR2LocalNRTLResult | ECR2NullField;

  // ── Local physical properties ──────────────────────────────────────
  /**
   * Full local physical property set: rho_c, rho_d, delta_rho, mu_c, mu_d, sigma.
   * rho_c, rho_d, mu_c: from EPD library at temperature T.
   * mu_d, sigma: must be engineer-supplied (no EPD library defaults).
   * All evaluated as PURE-COMPONENT properties at temperature T_C
   * (composition-dependent mixing rules are NOT implemented here).
   * Null when the full property set has not been computed.
   */
  localProperties: ECR2LocalPropertySet | null;

  // ── Component diffusivities (engineer-supplied) ────────────────────
  /**
   * Molecular diffusivities for the 4 transferable pseudo-components.
   * No EPD/CEL library defaults exist — all must be engineer-supplied.
   * Null when no diffusivities have been provided.
   */
  diffusivityContract: ECR2DiffusivityContract | null;

  // ── Compositions (Phase 2 — BVP solution) ────────────────────────────
  /** Raffinate-phase mole fractions [Sat, Mono, Di, Poly, NMP]. Null until Phase 2. */
  x_raffinate_mole: ComponentVector | ECR2NullField;
  /** Extract-phase mole fractions [Sat, Mono, Di, Poly, NMP]. Null until Phase 2. */
  y_extract_mole: ComponentVector | ECR2NullField;
  /** Total raffinate molar flow (mol/h). Null until Phase 2. */
  L_raffinate_mol_h: number | ECR2NullField;
  /** Total extract molar flow (mol/h). Null until Phase 2. */
  V_extract_mol_h: number | ECR2NullField;
}

// ── Null field constructor helpers ─────────────────────────────────────────

/** Create an ECR2NullField with typed reason. */
export function nullField(
  reason: ECR2DependencyReason,
  upstreamCorrelation: string | null,
  message: string,
): ECR2NullField {
  return { value: null, reason, upstreamCorrelation, message };
}

/** Commonly reused null fields. */
export const NULL_BLOCKED_D32: ECR2NullField = nullField(
  'blocked_by_d32',
  'ecr2_d32_kh1996',
  'Requires Sauter mean droplet diameter d₃₂. K&H 1996 correlation has UNRESOLVED_SYMBOL and ' +
  'UNRESOLVED_GROUPING — see registry. Supply an engineer-specified d₃₂ to proceed.',
);

export const NULL_BLOCKED_HOLDUP: ECR2NullField = nullField(
  'blocked_by_holdup',
  'ecr2_holdup_kh1995',
  'Requires dispersed-phase holdup φ_d. Holdup inputs (σ, xf) are missing or produced a ' +
  'physically invalid result.',
);

export const NULL_BLOCKED_INTERFACIAL_AREA: ECR2NullField = nullField(
  'blocked_by_interfacial_area',
  null,
  'Requires interfacial area a = 6·φ_d/d₃₂. One or both of φ_d and d₃₂ are unavailable.',
);

export const NULL_BLOCKED_KC: ECR2NullField = nullField(
  'blocked_by_kc',
  'ecr2_koa_kh1999',
  'Requires continuous-phase mass-transfer coefficient k_c (K&H 1999, pending_approval). ' +
  'Gated on d₃₂ and C1 agitation term from K&H 1999 primary paper.',
);

export const NULL_BLOCKED_KD: ECR2NullField = nullField(
  'blocked_by_kd',
  'ecr2_koa_kh1999',
  'Requires dispersed-phase mass-transfer coefficient k_d (K&H 1999, pending_approval). ' +
  'Gated on d₃₂ and C2 agitation term from K&H 1999 primary paper.',
);

export const NULL_BLOCKED_K_OVERALL: ECR2NullField = nullField(
  'blocked_by_K_overall',
  'ecr2_koa_kh1999',
  'Requires k_c, k_d, and K_d,i (NRTL partition coefficient). All three must be resolved.',
);

export const NULL_PHASE2: ECR2NullField = nullField(
  'phase_2_not_implemented',
  null,
  'Requires forward simulation (BVP). Not implemented in this phase. ' +
  'Available when all of φ_d, d₃₂, a, k_c, k_d, K_overall, K_oa, and driving-force ' +
  'contract are resolved and the compartment-to-compartment solver is built.',
);

export const NULL_LOCAL_PROPERTIES: ECR2NullField = nullField(
  'blocked_by_local_properties',
  null,
  'Requires local phase properties (ρ_c, ρ_d, μ_c, μ_d, σ). ' +
  'Available when Phase 2 NRTL-derived property profiles are computed.',
);

export const NULL_DE_MISSING: ECR2NullField = nullField(
  'blocked_by_De',
  'ecr2_koa_kh1999',
  'Requires molecular diffusivity De (m²/s) for this pseudo-component in each phase. ' +
  'De must be engineer-supplied or computed from a separate diffusivity model.',
);

export const NULL_BLOCKED_COMPOSITION: ECR2NullField = nullField(
  'blocked_by_composition',
  null,
  'Requires local compartment composition (x_local and y_local). ' +
  'Supply test compositions or wait for BVP solver (Phase 2).',
);

export const NULL_BLOCKED_KD_PARTITION: ECR2NullField = nullField(
  'blocked_by_Kd_partition',
  'ecr2_koa_kh1999',
  'Requires component partition coefficient K_d,i from NRTL flash. ' +
  'K_d definition and derivation must be approved (§9 hard stop) before implementation. ' +
  'See Mass-Transfer / Driving-Force Approval Report.',
);

export const NULL_DRIVING_FORCE: ECR2NullField = nullField(
  'phase_2_not_implemented',
  null,
  'Driving force Δ_i not implemented. Requires: K_d definition approved (§9), ' +
  'concentration basis confirmed, K_overall formula approved. ' +
  'See Mass-Transfer / Driving-Force Approval Report before implementation.',
);

export const NULL_TRANSFER_RATE: ECR2NullField = nullField(
  'phase_2_not_implemented',
  null,
  'Component transfer rate N_i not implemented. Requires driving force Δ_i and K_oa,i. ' +
  'See Mass-Transfer / Driving-Force Approval Report.',
);

// ── Dependency graph ───────────────────────────────────────────────────────

/** Availability level for a quantity in the dependency graph. */
export type AvailabilityLevel =
  | 'available'             // computed and usable
  | 'available_extrapolated' // computed but outside primary validity range
  | 'engineer_supplied'     // explicit engineer-supplied development basis
  | 'physically_invalid'    // result was physically impossible (not clamped)
  | 'missing_dependency'    // blocked by upstream quantity
  | 'correlation_unresolved'; // correlation not yet fully specified

/** One node in the dependency graph. */
export interface DependencyNode {
  quantity: string;
  symbol: string;
  unit: string;
  level: AvailabilityLevel;
  /** Immediate upstream quantities this node depends on. */
  dependsOn: string[];
  /** Typed reason when level is missing_dependency or correlation_unresolved. */
  blockedBy: ECR2DependencyReason | null;
  /** Registry correlation ID providing this quantity (null if not correlation-derived). */
  correlationId: string | null;
  /** Human-readable status for display. */
  statusMessage: string;
}

/** Full dependency graph for the ECR-2 simulator at a given point in time. */
export interface ECR2DependencyGraph {
  /**
   * Ordered list of all computed quantities, from upstream to downstream.
   * The order follows the dependency chain in the specification:
   *   geometry → power → ψ → φ_d → d₃₂ → a → Re/We → k_c/k_d → K_overall → K_oa → BVP
   */
  nodes: DependencyNode[];
  /** Summary: how many quantities are currently available (level !== missing_dependency/unresolved). */
  availableCount: number;
  totalCount: number;
  /** First blocking reason in the chain (the root cause blocking the most downstream work). */
  primaryBlocker: ECR2DependencyReason | null;
  /** Registry correlation ID of the primary blocker. */
  primaryBlockerCorrelationId: string | null;
}

/**
 * Build the simulator dependency graph from the compartment state of compartment 1
 * (or any representative compartment — geometry/power nodes are uniform).
 *
 * This is a simulator-level graph (not per-compartment) that describes which
 * physics modules are available for the current configuration.
 */
export function buildDependencyGraph(opts: {
  psiAvailable: boolean;
  holdupUsable: boolean;
  holdupPhysicallyInvalid: boolean;
  d32Available: boolean;
  d32EngineerSupplied: boolean;
  d32CorrelationUnresolved: boolean;
  propertiesAvailable: boolean;  // rho_c, rho_d, mu_c, mu_d, sigma at inlet
}): ECR2DependencyGraph {
  const {
    psiAvailable,
    holdupUsable,
    holdupPhysicallyInvalid,
    d32Available,
    d32EngineerSupplied,
    d32CorrelationUnresolved,
    propertiesAvailable,
  } = opts;

  // Interfacial area requires both holdup and d₃₂
  const aAvailable = holdupUsable && d32Available;
  // Hydrodynamic groups require a, d₃₂, and properties
  const hydGroupsAvailable = aAvailable && propertiesAvailable;
  // k_c, k_d require d₃₂, properties, and K&H 1999 approval (not yet)
  const kcKdAvailable = false; // K&H 1999 is pending_approval
  const KoaAvailable = false;  // gated on kc, kd, K_overall

  const nodes: DependencyNode[] = [
    {
      quantity: 'geometry',
      symbol: 'D, A_col, h_comp, D_R',
      unit: 'm, m², m, m',
      level: 'available',
      dependsOn: [],
      blockedBy: null,
      correlationId: null,
      statusMessage: 'Column and rotor geometry computed from inputs.',
    },
    {
      quantity: 'power',
      symbol: 'P, P/V',
      unit: 'W, W/m³',
      level: 'available',
      dependsOn: ['geometry'],
      blockedBy: null,
      correlationId: null,
      statusMessage: 'Shaft power from N_P·ρ_b·N³·D_R⁵ per compartment.',
    },
    {
      quantity: 'specific_power',
      symbol: 'ψ',
      unit: 'W/kg',
      level: psiAvailable ? 'available' : 'missing_dependency',
      dependsOn: ['power'],
      blockedBy: psiAvailable ? null : 'blocked_by_local_properties',
      correlationId: null,
      statusMessage: psiAvailable
        ? 'ψ = (P/V)/ρ_b computed. Density cancels algebraically.'
        : 'ψ unavailable — requires bulk density ρ_b.',
    },
    {
      quantity: 'holdup',
      symbol: 'φ_d',
      unit: '—',
      level: holdupPhysicallyInvalid
        ? 'physically_invalid'
        : holdupUsable
          ? 'available'
          : 'missing_dependency',
      dependsOn: ['specific_power'],
      blockedBy: holdupUsable ? null : 'blocked_by_local_properties',
      correlationId: 'ecr2_holdup_kh1995',
      statusMessage: holdupPhysicallyInvalid
        ? 'φ_d physically invalid — result ≥ 1. Not clamped.'
        : holdupUsable
          ? 'φ_d computed from K&H 1995 (secondary_equation_verified). ' +
            'primarySourceVerified=false; result labelled Preliminary Engineering.'
          : 'φ_d unavailable — requires σ (interfacial tension) and xf (stator open-area fraction).',
    },
    {
      quantity: 'slip_velocity',
      symbol: 'U_slip',
      unit: 'm/s',
      level: holdupUsable ? 'available' : 'missing_dependency',
      dependsOn: ['holdup'],
      blockedBy: holdupUsable ? null : 'blocked_by_holdup',
      correlationId: null,
      statusMessage: holdupUsable
        ? 'U_slip = u_d/φ_d + u_c/(1−φ_d). Requires only φ_d (not d₃₂).'
        : 'U_slip unavailable — requires usable φ_d.',
    },
    {
      quantity: 'd32',
      symbol: 'd₃₂',
      unit: 'm',
      level: d32EngineerSupplied
        ? 'engineer_supplied'
        : d32CorrelationUnresolved
          ? 'correlation_unresolved'
          : d32Available
            ? 'available'
            : 'missing_dependency',
      dependsOn: ['specific_power', 'holdup'],
      blockedBy: d32Available ? null : 'blocked_by_d32',
      correlationId: 'ecr2_d32_kh1996',
      statusMessage: d32EngineerSupplied
        ? 'Engineer-Supplied d₃₂ — Simulator Development / Sensitivity Basis. ' +
          'Not a published correlation result.'
        : d32CorrelationUnresolved
          ? 'K&H 1996 d₃₂ correlation has UNRESOLVED_SYMBOL and UNRESOLVED_GROUPING. ' +
            'Cannot be implemented numerically until both flags are cleared from the ' +
            'K&H 1996 primary paper (DOI 10.1021/ie950674w). ' +
            'Supply an engineer-specified d₃₂ to continue downstream development.'
          : 'K&H 1996 d₃₂ not yet computed.',
    },
    {
      quantity: 'interfacial_area',
      symbol: 'a',
      unit: 'm²/m³',
      level: aAvailable ? 'available' : 'missing_dependency',
      dependsOn: ['holdup', 'd32'],
      blockedBy: aAvailable ? null : !holdupUsable ? 'blocked_by_holdup' : 'blocked_by_d32',
      correlationId: null,
      statusMessage: aAvailable
        ? 'a = 6·φ_d / d₃₂. Computed with physical admissibility guards (0 < φ_d < 1, d₃₂ > 0).'
        : !holdupUsable
          ? 'a unavailable — φ_d is not usable.'
          : 'a unavailable — d₃₂ is null. K&H 1996 correlation unresolved; supply engineer d₃₂.',
    },
    {
      quantity: 'drop_reynolds',
      symbol: 'Re_d',
      unit: '—',
      level: hydGroupsAvailable ? 'available' : 'missing_dependency',
      dependsOn: ['slip_velocity', 'd32', 'interfacial_area'],
      blockedBy: hydGroupsAvailable
        ? null
        : !holdupUsable ? 'blocked_by_holdup'
        : !d32Available ? 'blocked_by_d32'
        : 'blocked_by_local_properties',
      correlationId: null,
      statusMessage: hydGroupsAvailable
        ? 'Re_d = U_slip·ρ_c·d₃₂/μ_c.'
        : 'Re_d unavailable — requires d₃₂ and local phase properties.',
    },
    {
      quantity: 'drop_weber',
      symbol: 'We',
      unit: '—',
      level: hydGroupsAvailable ? 'available' : 'missing_dependency',
      dependsOn: ['slip_velocity', 'd32'],
      blockedBy: hydGroupsAvailable ? null : 'blocked_by_d32',
      correlationId: null,
      statusMessage: hydGroupsAvailable
        ? 'We = ρ_c·U_slip²·d₃₂/σ.'
        : 'We unavailable — requires d₃₂ and local phase properties.',
    },
    {
      quantity: 'k_c',
      symbol: 'k_c',
      unit: 'm/s',
      level: kcKdAvailable ? 'available' : 'correlation_unresolved',
      dependsOn: ['d32', 'drop_reynolds'],
      blockedBy: 'blocked_by_kc',
      correlationId: 'ecr2_koa_kh1999',
      statusMessage:
        'k_c unavailable — K&H 1999 mass-transfer correlation is pending_approval. ' +
        'C1 agitation term requires K&H 1999 primary paper. Also gated on d₃₂ resolution. ' +
        'Requires molecular diffusivity De_c (engineer-supplied) per pseudo-component.',
    },
    {
      quantity: 'k_d',
      symbol: 'k_d',
      unit: 'm/s',
      level: kcKdAvailable ? 'available' : 'correlation_unresolved',
      dependsOn: ['d32', 'drop_reynolds'],
      blockedBy: 'blocked_by_kd',
      correlationId: 'ecr2_koa_kh1999',
      statusMessage:
        'k_d unavailable — K&H 1999 mass-transfer correlation is pending_approval. ' +
        'C2 agitation term requires K&H 1999 primary paper. Also gated on d₃₂ resolution. ' +
        'Requires molecular diffusivity De_d (engineer-supplied) per pseudo-component.',
    },
    {
      quantity: 'K_overall',
      symbol: 'K_overall,i',
      unit: 'm/s',
      level: KoaAvailable ? 'available' : 'missing_dependency',
      dependsOn: ['k_c', 'k_d'],
      blockedBy: 'blocked_by_K_overall',
      correlationId: 'ecr2_koa_kh1999',
      statusMessage:
        'K_overall unavailable — requires k_c, k_d, and K_d,i (NRTL partition coefficient). ' +
        'K_d,i must come from the NRTL flash for each pseudo-component. ' +
        'Formula: K_overall,i = k_c·k_d / (k_d·K_d,i + k_c).',
    },
    {
      quantity: 'Koa',
      symbol: 'K_oa',
      unit: '1/s',
      level: KoaAvailable ? 'available' : 'missing_dependency',
      dependsOn: ['K_overall', 'interfacial_area'],
      blockedBy: 'blocked_by_K_overall',
      correlationId: null,
      statusMessage:
        'K_oa unavailable — requires K_overall and interfacial area a. ' +
        'K_oa = K_overall [m/s] · a [1/m] = [1/s] once both are resolved.',
    },
    {
      quantity: 'component_transfer_rates',
      symbol: 'N_i',
      unit: 'mol/(m³·s)',
      level: 'missing_dependency',
      dependsOn: ['Koa'],
      blockedBy: 'blocked_by_K_overall',
      correlationId: null,
      statusMessage:
        'Component transfer rates unavailable — requires K_oa and local driving force ' +
        '(x - x*) from NRTL equilibrium. Driving-force contract defined but not implemented.',
    },
    {
      quantity: 'compositions',
      symbol: 'x(z), y(z)',
      unit: 'mol/mol',
      level: 'missing_dependency',
      dependsOn: ['component_transfer_rates'],
      blockedBy: 'phase_2_not_implemented',
      correlationId: null,
      statusMessage:
        'Axial composition profiles unavailable — BVP (counter-current compartment solver) ' +
        'not yet implemented. Gated on all upstream quantities being available.',
    },
    {
      quantity: 'raffinate_quality',
      symbol: 'x_raffinate',
      unit: 'mol/mol',
      level: 'missing_dependency',
      dependsOn: ['compositions'],
      blockedBy: 'phase_2_not_implemented',
      correlationId: null,
      statusMessage: 'Raffinate outlet composition unavailable — BVP not yet implemented.',
    },
    {
      quantity: 'extract_quality',
      symbol: 'y_extract',
      unit: 'mol/mol',
      level: 'missing_dependency',
      dependsOn: ['compositions'],
      blockedBy: 'phase_2_not_implemented',
      correlationId: null,
      statusMessage: 'Extract outlet composition unavailable — BVP not yet implemented.',
    },
  ];

  const availableCount = nodes.filter(
    (n) => n.level === 'available' || n.level === 'available_extrapolated' || n.level === 'engineer_supplied'
  ).length;

  // Primary blocker: first blocked_by_* or correlation_unresolved node
  const firstBlocked = nodes.find(
    (n) => n.level === 'missing_dependency' || n.level === 'correlation_unresolved' || n.level === 'physically_invalid'
  );

  return {
    nodes,
    availableCount,
    totalCount: nodes.length,
    primaryBlocker: firstBlocked?.blockedBy ?? null,
    primaryBlockerCorrelationId: firstBlocked?.correlationId ?? null,
  };
}
