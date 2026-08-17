// ═══════════════════════════════════════════════════════════════════════════════
// ECR-2 — LLX Agitated Extraction Column Simulator Engine (Stage C5-S)
//
// PHASE 1 SCAFFOLD — GEOMETRY, POWER, BOUNDARY CONDITIONS, AND CORRELATION
// REGISTRY ONLY. MASS TRANSFER, HOLDUP, d₃₂, AND FORWARD SIMULATION LOOP
// ARE NOT YET IMPLEMENTED. See correlation registry for gating status.
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

// NRTL reuse: nrtlFlash is imported for Phase 2 forward simulation.
// In Phase 1 it is not called but the import confirms the reuse path.
// The function signature: nrtlFlash(z, T_K, x0, y0) → FlashResult
// where x = raffinate-phase mole fractions, y = extract-phase mole fractions.
import {
  nrtlFlash,
  nrtlLnGamma,
  temperatureModelStatus,
} from '../../engine-framework/cel/llx-temperature-lle-model';

import {
  correlationRegistrySummary,
  isGoverned,
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

// ── Constants ─────────────────────────────────────────────────────────────────

const ENGINE_ID      = 'llx-ecr-simulator';
const ENGINE_VERSION = '2.0.0';
const CALCULATION_TYPE = 'ecr_simulator';

const APPLICABILITY_STATEMENT =
  'ECR-2 PRELIMINARY AGITATED EXTRACTION COLUMN SIMULATOR — PHASE 1 SCAFFOLD ' +
  '(GEOMETRY AND POWER ONLY) — NOT VENDOR RATING AND NOT FOR FABRICATION.';

/** Fixed by governance — one rotor per compartment in ECR-2. Not an input. */
const ROTORS_PER_COMPARTMENT = 1;

const G = 9.80665; // m/s²
const PI = Math.PI;

// ── Component system (frozen) ──────────────────────────────────────────────────

/** Frozen component index convention for ECR-2. Must not be reordered. */
export const IDX = { SAT: 0, MONO: 1, DI: 2, POLY: 3, NMP: 4 } as const;
export const COMPONENT_NAMES = ['Saturates', 'Mono', 'Di', 'Poly', 'NMP'] as const;
export const N_COMP = 5;

/** Five-component mole or mass fraction vector. Index follows IDX. */
export type ComponentVector = [number, number, number, number, number];

// ── Type helpers ───────────────────────────────────────────────────────────────

interface TaggedValue {
  value: number;
  unit?: string;
  sourceType: SourceType;
  sourceReference: string;
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
  /** Total shaft power for this compartment = P₁ × ROTORS_PER_COMPARTMENT (W). */
  shaftPower_compartment_W: number;
  /** Power per unit volume P/V = P₁ / (A_column × h_comp) (W/m³). */
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
    /** RRBO feed mole fractions [Sat, Mono, Di, Poly, NMP]. Known (converted from mass basis). */
    x_feed_mole: ComponentVector;
    /** RRBO feed total molar flow (mol/h). Known. */
    L_feed_mol_h: number;
    /** Extract outlet — unknown at Phase 1; solved by BVP in Phase 2. */
    extract_outlet: null;
  };
  top: {
    z_m: number; // = H_active_m
    /** Fresh NMP solvent mass flow entering at top (kg/h). Known. */
    nmpFeed_kg_h: number;
    /** Fresh NMP mole fractions [Sat, Mono, Di, Poly, NMP]. Known (purity-derived). */
    y_feed_mole: ComponentVector;
    /** Fresh NMP total molar flow (mol/h). Known. */
    V_feed_mol_h: number;
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

// ── Input schema ───────────────────────────────────────────────────────────────

/**
 * ECR-2 Simulator input contract.
 *
 * Fixed from workspace (passed through, not re-entered):
 *   operatingTemperatureC, rrboMassFlow_kg_h, nmpMassFlow_kg_h,
 *   feedCompositionMassFraction, nmpPurity
 *
 * Engineer enters once per simulation run:
 *   columnDiameter_m, activeHeight_m, compartmentHeight_m,
 *   rotorToColumnDiameterRatio, rotorSpeed_rpm, rotorType,
 *   powerNumber, statorOpenAreaFraction (optional),
 *   shaftEfficiency, mechanicalDesignMargin,
 *   phaseConfiguration, feedDensity, feedViscosity,
 *   interfacialTension, molecularWeights
 *
 * Fixed by governance (never an input):
 *   rotorsPerCompartment = 1
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
  /** Phase continuity assignment. */
  phaseConfiguration: 'rrbo_continuous_nmp_dispersed' | 'nmp_continuous_rrbo_dispersed';

  // ── Column geometry ────────────────────────────────────────────────────
  /** Column internal diameter D (m). */
  columnDiameter_m: number;
  /** Active agitated height H_active (m). */
  activeHeight_m: number;
  /** Compartment height h_comp (m). */
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

  // ── Molecular weights (for mole-basis conversion) ─────────────────────
  /**
   * Pseudo-component molecular weights. Source-tagged.
   * Must come from RRBO characterization; Assumed values seeded as defaults.
   */
  molecularWeights: ECR2MolecularWeights;

  // ── d₃₂ configuration (optional) ─────────────────────────────────────
  /**
   * d₃₂ mode configuration for this simulator run.
   *
   * Omit to run without d₃₂ (interfacial area and mass transfer will be null).
   *
   * mode='published_correlation': use K&H 1996 (currently returns
   *   correlation_unresolved — UNRESOLVED flags must be cleared first).
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

// ── Mass/mole conversion ──────────────────────────────────────────────────────

/**
 * Convert mass fractions to mole fractions for the 5-component system.
 * MW array: [MW_Sat, MW_Mono, MW_Di, MW_Poly, MW_NMP] in g/mol.
 */
function massToMoleFraction(
  wt: ComponentVector,
  mw: [number, number, number, number, number],
): ComponentVector {
  const moles = wt.map((w, i) => w / mw[i]);
  const total = moles.reduce((s, m) => s + m, 0);
  if (total <= 0)
    throw new Error('massToMoleFraction: zero total moles — check mass fractions');
  return moles.map((m) => m / total) as unknown as ComponentVector;
}

/** Convert kg/h mass flows to total mol/h given mass fractions and MW array. */
function massFlowToMolFlow(
  massFlow_kg_h: number,
  massFractions: ComponentVector,
  mw_g_mol: [number, number, number, number, number],
): number {
  // mol/h = Σ (w_i × massFlow_kg_h × 1000 / MW_i)
  let molTotal = 0;
  for (let i = 0; i < N_COMP; i++) {
    molTotal += (massFractions[i] * massFlow_kg_h * 1000) / mw_g_mol[i];
  }
  return molTotal;
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class LLXECRSimulatorEngine implements IDesignEngine {
  getEngineId(): string    { return ENGINE_ID; }
  getEngineVersion(): string { return ENGINE_VERSION; }
  getModuleType(): string  { return 'llx'; }
  getCalculationType(): string { return CALCULATION_TYPE; }

  // ── validate ──────────────────────────────────────────────────────────────

  validate(inputs: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = [];
    const err = (field: string, message: string) =>
      errors.push({ field, message, severity: 'error' });

    // Operating temperature
    const T = num(inputs.operatingTemperatureC);
    if (T === undefined || T <= 0 || T >= 300)
      err('operatingTemperatureC', 'operatingTemperatureC (°C) is required, 0 < T < 300');

    // NRTL model status at this temperature (informational — does not block)
    if (T !== undefined) {
      const nrtlStatus = temperatureModelStatus((T + 273.15));
      if (nrtlStatus === 'out_of_range') {
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

    // NMP purity
    const purity = num(inputs.nmpPurity);
    if (purity === undefined || purity <= 0 || purity > 1)
      err('nmpPurity', 'nmpPurity must be in (0, 1] (mass fraction NMP in solvent stream)');

    // Phase configuration
    const validPhaseConfigs = ['rrbo_continuous_nmp_dispersed', 'nmp_continuous_rrbo_dispersed'];
    if (!validPhaseConfigs.includes(inputs.phaseConfiguration as string))
      err('phaseConfiguration', `phaseConfiguration must be one of: ${validPhaseConfigs.join(', ')}`);

    // Column geometry
    const D = num(inputs.columnDiameter_m);
    const H = num(inputs.activeHeight_m);
    const hComp = num(inputs.compartmentHeight_m);
    if (D === undefined || D <= 0 || D > 10)
      err('columnDiameter_m', 'columnDiameter_m must be > 0 and ≤ 10 (m)');
    if (H === undefined || H <= 0 || H > 100)
      err('activeHeight_m', 'activeHeight_m must be > 0 and ≤ 100 (m)');
    if (hComp === undefined || hComp <= 0 || hComp > 2)
      err('compartmentHeight_m', 'compartmentHeight_m must be > 0 and ≤ 2 (m)');
    if (D !== undefined && H !== undefined && hComp !== undefined) {
      const nComp = Math.ceil(H / hComp); // ceiling — matches calculate() geometry
      if (nComp < 1)
        err('compartmentHeight_m', `compartmentHeight_m ${hComp} m exceeds activeHeight_m ${H} m — no compartments would result`);
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
      if (mode !== 'published_correlation' && mode !== 'engineer_supplied') {
        err('d32Config.mode', "d32Config.mode must be 'published_correlation' or 'engineer_supplied'");
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

    const D      = num(inputs.columnDiameter_m)!;
    const H      = num(inputs.activeHeight_m)!;
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
    // Interfacial tension — optional; required for K&H 1995 holdup.
    // If absent, holdup_dispersed will be null for all compartments.
    const gamma        = inputs.interfacialTension !== undefined
      ? parseTagged(inputs.interfacialTension, 'interfacialTension', [], { min: 0.0001, max: 0.1, unit: 'N/m' })
      : undefined;
    if (!gamma)
      pushWarning(
        'HOLDUP_GAMMA_MISSING',
        'interfacialTension not supplied or failed validation — K&H 1995 holdup (ecr2_holdup_kh1995) not calculable. ' +
        'Provide γ (N/m) as { value, sourceType, sourceReference } to enable holdup computation.',
      );
    const feedDensity  = parseTagged(inputs.feedDensity,   'feedDensity',   [], { min: 500, max: 1200, unit: 'kg/m3', required: true })!;

    const mwRaw = inputs.molecularWeights as Record<string, unknown>;
    const mwSat  = parseTagged(mwRaw.saturates_g_mol, 'molecularWeights.saturates_g_mol', [], { min: 100, max: 1000, unit: 'g/mol', required: true })!;
    const mwMono = parseTagged(mwRaw.mono_g_mol,      'molecularWeights.mono_g_mol',      [], { min: 100, max: 1000, unit: 'g/mol', required: true })!;
    const mwDi   = parseTagged(mwRaw.di_g_mol,        'molecularWeights.di_g_mol',        [], { min: 100, max: 1000, unit: 'g/mol', required: true })!;
    const mwPoly = parseTagged(mwRaw.poly_g_mol,      'molecularWeights.poly_g_mol',      [], { min: 100, max: 1000, unit: 'g/mol', required: true })!;
    const mwNMP  = NMP_MW_G_MOL;

    const mwVec: [number, number, number, number, number] = [
      mwSat.value, mwMono.value, mwDi.value, mwPoly.value, mwNMP,
    ];

    // Warn if any MW is Assumed
    const mwAssumed = [mwSat, mwMono, mwDi, mwPoly].some((t) => t.sourceType === 'Assumed');
    if (mwAssumed)
      pushWarning('MW_ASSUMED', 'One or more pseudo-component molecular weights are Assumed — mole-basis boundary conditions are Pending Validation until RRBO characterization data are available.');

    // ── NRTL model status at operating temperature ───────────────────────────
    const nrtlStatus = temperatureModelStatus(T_K);
    const nrtlNote = nrtlStatus === 'in_range'
      ? `NRTL model: in-range at ${T_C} °C — experimental tie-lines exact.`
      : nrtlStatus === 'out_of_range'
        ? `NRTL model: EXTRAPOLATION at ${T_C} °C — Temperature Extrapolation Preliminary / Pending Validation.`
        : `NRTL model: status '${nrtlStatus}' at ${T_C} °C.`;

    // ── ECR-2 geometry ───────────────────────────────────────────────────────
    const A_col  = columnCrossSectionArea(D);                      // m²
    const D_R    = ratio * D;                                       // m
    const A_R    = rotorArea(D_R);                                  // m²
    const v_tip  = tipSpeed(D_R, rpm);                              // m/s
    const v_stator = fStator
      ? null  // computed per compartment using actual flows below
      : null; // not supplied

    // ── Axial grid ───────────────────────────────────────────────────────────
    //
    // N_comp = ceil(H_requested / h_comp)  — ceiling, not floor.
    // H_actual = N_comp × h_comp           — always ≥ H_requested.
    //
    // Rationale: N_comp is the realized integer equipment geometry (number of
    // agitator stages manufactured). Using ceiling ensures the delivered
    // column NEVER provides less active height than the design specifies.
    // floor() would under-deliver height and is physically incorrect for
    // specifying a piece of equipment against a required separation duty.
    //
    const N_compartments = Math.ceil(H / hComp);
    const H_actual = N_compartments * hComp;
    const H_extension = H_actual - H; // always ≥ 0 by construction
    if (H_extension > 1e-3)
      pushWarning(
        'HEIGHT_CEILING_EXTENSION',
        `H_requested ${H} m / h_comp ${hComp} m → N_comp = ${N_compartments} (ceil). ` +
        `H_actual = ${H_actual.toFixed(4)} m (${H_extension.toFixed(4)} m above requested). ` +
        `H_actual ≥ H_requested is guaranteed — excess height is conservative.`,
      );

    // ── Feed compositions → mole basis ──────────────────────────────────────
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
    const x_feed_mole = massToMoleFraction(rrboNormalized, mwVec);
    const L_feed_mol_h = massFlowToMolFlow(mRRBO, rrboNormalized, mwVec);

    // NMP solvent: purity fraction is NMP, impurity assumed Saturates
    const nmpMassFrac: ComponentVector = [
      1 - purity, // impurity → Saturates (conservative, Assumed)
      0,
      0,
      0,
      purity,
    ];
    if (purity < 1.0)
      pushWarning('NMP_IMPURITY_ASSUMED_SAT', `NMP purity ${purity.toFixed(4)} — solvent impurity (${((1 - purity) * 100).toFixed(2)} %) assigned to Saturates (Assumed). Review if impurity characterization differs.`);
    const y_feed_mole = massToMoleFraction(nmpMassFrac, mwVec);
    const V_feed_mol_h = massFlowToMolFlow(mNMP, nmpMassFrac, mwVec);

    // ── Boundary conditions ──────────────────────────────────────────────────
    const boundaryConditions: ECR2BoundaryConditions = {
      bottom: {
        z_m: 0,
        rrboFeed_kg_h: mRRBO,
        x_feed_mole,
        L_feed_mol_h,
        extract_outlet: null,
      },
      top: {
        z_m: H_actual,
        nmpFeed_kg_h: mNMP,
        y_feed_mole,
        V_feed_mol_h,
        raffinate_outlet: null,
      },
    };

    // ── Volumetric flows ─────────────────────────────────────────────────────
    // Phase 1 uses inlet-condition properties for all compartments.
    // Phase 2 will replace with composition-dependent values.
    const rho = feedDensity.value; // kg/m³ — RRBO density used for power; NMP from EPD library
    const rhoNMP = getProperty('nmp', 'density', T_C);
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

    // ── Power ────────────────────────────────────────────────────────────────
    // Phase 1 uses inlet-condition mixture density for all compartments.
    // Density basis follows ECR-1 precedent: use continuous-phase density.
    const rhoMix_phase1 = rrboContinuous ? rho : rhoNMP.value;
    const P1_W = powerPerRotor(powerNumber.value, rhoMix_phase1, rpm, D_R);
    const P_shaft_per_comp_W = P1_W * ROTORS_PER_COMPARTMENT;
    const P_V_W_m3 = P1_W / (A_col * hComp);
    const P_shaft_total_W = P_shaft_per_comp_W * N_compartments;
    const P_motor_W = P_shaft_total_W / shaftEff.value * designMargin.value;

    const v_st_m_s = fStator
      ? statorVelocity(qTotal_m3_h, A_col, fStator.value)
      : null;

    // ── ψ — mechanical specific power dissipation (Form A) ───────────────────
    //
    // This implementation uses Form A:
    //
    //   P₁      = N_P · ρ_b · N³ · D_R⁵                [W]       ← includes ρ_b
    //   P/V     = P₁ / (A_col · h_comp)                 [W/m³]    ← includes ρ_b
    //   ψ       = (P/V) / ρ_b                           [W/kg = m²/s³]
    //           = N_P · ρ_b · N³ · D_R⁵ / (A·h) / ρ_b
    //           = N_P · N³ · D_R⁵ / (A_col · h_comp)   ← ρ_b cancels ✓
    //
    // Density basis ρ_b: continuous-phase inlet density (rhoMix_phase1).
    // Same ρ_b appears once in the numerator (powerPerRotor) and once in the
    // denominator (division below) — it cancels completely.
    // This is NOT a double division.  The result is density-independent.
    //
    // Form B equivalence:
    //   ψ = N_P · N³ · D_R⁵ / (A_col · h_comp)   [W/kg]
    // produces the same numerical value because the same ρ_b cancelled.
    //
    // Reference verification (N_P=1, N=1 s⁻¹, D_R=0.1 m, A=0.01 m², h=0.1 m):
    //   Form A:  P = 1×ρ×1³×0.1⁵ = ρ×10⁻⁵ W
    //            P/V = ρ×10⁻⁵ / 0.001 = ρ×0.01 W/m³
    //            ψ = ρ×0.01 / ρ = 0.01 W/kg ✓
    //   Form B:  ψ = 1×1³×0.1⁵ / (0.01×0.1) = 10⁻⁵/10⁻³ = 0.01 W/kg ✓
    //
    // Literature uncertainty (unresolved, does NOT affect calculation):
    //   The exact liquid mass basis K&H 1995 intended for ψ has not been
    //   confirmed from the primary paper. Since ρ_b cancels, the numerical
    //   result is the same regardless of whether K&H used total, continuous,
    //   or dispersed mass basis — provided their density appears consistently
    //   in both P₁ and the ψ normalisation.
    //   psiDefinitionEvidenceStatus = 'thermopac_preliminary'
    //
    const psi_W_kg = P_V_W_m3 / rhoMix_phase1;

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
    const holdupResult: KH1995HoldupResult | null = gamma !== undefined
      ? computeKH1995Holdup({
          psi_W_kg,
          Ud_m_s:      u_raffinate_m_s,   // RRBO = dispersed phase
          Uc_m_s:      u_extract_m_s,     // NMP  = continuous phase
          rho_c_kg_m3: rhoNMP.value,      // NMP  = continuous phase
          rho_d_kg_m3: feedDensity.value, // RRBO = dispersed phase
          gamma_N_m:   gamma.value,
          xf:          fStator !== undefined ? fStator.value : Number.NaN,
        })
      : null;

    if (holdupResult?.status === 'input_missing') {
      pushWarning(
        'HOLDUP_INPUT_MISSING',
        `K&H 1995 holdup: missing or invalid required inputs (${holdupResult.missing.join(', ')}) — holdup_dispersed not calculable. ` +
        'Supply statorOpenAreaFraction and valid interfacialTension to enable holdup calculation.',
      );
    }
    if (holdupResult?.status === 'calculation_invalid') {
      pushWarning(
        'HOLDUP_CALCULATION_INVALID',
        `K&H 1995 holdup: equation produced a non-finite result (phi_raw = ${holdupResult.phi_raw}) — ${holdupResult.reason}`,
      );
    }
    if (holdupResult?.status === 'physically_invalid') {
      pushWarning(
        'HOLDUP_PHYSICALLY_INVALID',
        `K&H 1995 holdup: phi_raw = ${holdupResult.phi_raw.toFixed(4)} (${holdupResult.physicalViolation}) — ` +
        'the correlation has produced a physically inadmissible prediction at this operating point. ' +
        'Review agitation intensity (ψ) and flow conditions.',
      );
    }
    if (holdupResult?.status === 'calculated_extrapolated') {
      pushWarning(
        'HOLDUP_EXTRAPOLATED',
        `K&H 1995 holdup: phi = ${holdupResult.phi.toFixed(4)} calculated but inputs outside diagnostic applicability ranges ` +
        `(${holdupResult.extrapolatedRanges.join(', ')}). All ranges are source_not_verified. ` +
        'Result is the best available preliminary engineering estimate — apply engineering judgement.',
      );
    }

    // ── d₃₂ computation ──────────────────────────────────────────────────────
    //
    // Phase 1 uniform: d₃₂ is computed once with inlet-condition properties.
    // Phase 2 will call per-compartment with local ρ_c, ρ_d, σ, φ_d.
    //
    // If d32Config is not supplied, d₃₂ is not attempted.
    // If d32Config.mode='published_correlation', returns correlation_unresolved
    // until K&H 1996 UNRESOLVED flags are cleared from the primary paper.
    // If d32Config.mode='engineer_supplied', uses the engineer-supplied value.
    //
    const d32Config = inputs.d32Config as D32Config | undefined;

    // Build a partial local state for d₃₂ computation (Phase 1: inlet properties)
    const d32LocalState = {
      h_comp_m:       hComp,
      psi_W_kg,
      rho_c_kg_m3:    rhoNMP.value,       // NMP = continuous phase
      rho_d_kg_m3:    feedDensity.value,  // RRBO = dispersed phase
      delta_rho_kg_m3: Math.abs(rhoNMP.value - feedDensity.value),
      sigma_N_m:      gamma?.value ?? 0,
      xf_stator:      fStator?.value ?? Number.NaN,
      phi_d:          (holdupResult != null && isHoldupUsable(holdupResult)) ? holdupResult.phi : Number.NaN,
    };

    const d32Result: D32Result | null = d32Config
      ? computeDropletDiameter(d32LocalState, d32Config)
      : null;

    // Emit warnings for d₃₂ status
    if (d32Result?.status === 'correlation_unresolved') {
      pushWarning(
        'D32_CORRELATION_UNRESOLVED',
        'K&H 1996 d₃₂ correlation (ecr2_d32_kh1996) has UNRESOLVED_SYMBOL and UNRESOLVED_GROUPING. ' +
        'Cannot compute d₃₂ from published correlation. ' +
        'Supply d32Config.mode=\'engineer_supplied\' to proceed with downstream development.',
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

    const d32Scalar: number | null = (d32Result && isD32Usable(d32Result)) ? d32Result.d32_m : null;

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
      pushWarning(
        'INTERFACIAL_AREA_COMPUTED',
        `Interfacial area a = ${interfacialAreaResult.a_m2_m3.toFixed(1)} m²/m³ ` +
        `(φ_d = ${interfacialAreaResult.phi_d_used?.toFixed(4)}, d₃₂ = ${((interfacialAreaResult.d32_m_used ?? 0) * 1000).toFixed(3)} mm). ` +
        `${interfacialAreaResult.d32EngineerSupplied ? 'Engineer-supplied d₃₂ basis.' : 'Published correlation basis.'}`,
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
      const z_bottom = (k - 1) * hComp;
      const z_top    = k * hComp;
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
        shaftPower_compartment_W: P_shaft_per_comp_W,
        powerPerVolume_W_m3:      P_V_W_m3,

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
        Koa_per_s: null,
      });
    }

    // ── S/O ratio ────────────────────────────────────────────────────────────
    const SO_mass = mNMP / mRRBO;

    // ── Correlation registry summary ─────────────────────────────────────────
    const corrRegistry = correlationRegistrySummary();

    // ── Result payload ───────────────────────────────────────────────────────
    const data: Record<string, unknown> = {
      applicabilityStatement: APPLICABILITY_STATEMENT,
      phase: 1,
      calculationRunStatus: 'scaffold_phase_1_geometry_and_power',
      phaseOrientationNote:
        'z=0=BOTTOM: RRBO enters (upward), extract exits. ' +
        'z=H=TOP: fresh NMP enters (downward), raffinate exits. ' +
        'NMP flows downward. RRBO/raffinate flows upward.',
      componentSystemNote:
        'Five-component system: [0]=Saturates, [1]=Mono, [2]=Di, [3]=Poly, [4]=NMP. ' +
        'Reuses governed NRTL pseudo-component system and τ parameters. ' +
        'No second characterization model created.',
      rotorsPerCompartmentFixed: ROTORS_PER_COMPARTMENT,
      engineVersions: { cel: CEL_VERSION, epd: EPD_VERSION, ecrSimulator: ENGINE_VERSION },

      designBasis: {
        operatingTemperatureC:  T_C,
        operatingTemperatureK:  T_K,
        nrtlModelStatus:        { status: nrtlStatus, note: nrtlNote },
        phaseConfiguration:     { input: phaseConfig, continuousPhase, dispersedPhase },
        rrboFeed: {
          massFlow_kg_h:    mRRBO,
          density_kg_m3:    { value: rho, source: sourceOf(feedDensity) },
          volumetricFlow_m3_h: qRRBO_m3_h,
          compositionMassFraction: { saturates: rrboNormalized[IDX.SAT], mono: rrboNormalized[IDX.MONO], di: rrboNormalized[IDX.DI], poly: rrboNormalized[IDX.POLY] },
          compositionMoleFraction: { saturates: x_feed_mole[IDX.SAT], mono: x_feed_mole[IDX.MONO], di: x_feed_mole[IDX.DI], poly: x_feed_mole[IDX.POLY], nmp: x_feed_mole[IDX.NMP] },
          totalMolarFlow_mol_h: L_feed_mol_h,
        },
        nmpSolvent: {
          massFlow_kg_h:    mNMP,
          purity:           purity,
          density_kg_m3:    { value: rhoNMP.value, source: rhoNMP.source },
          volumetricFlow_m3_h: qNMP_m3_h,
          compositionMoleFraction: { saturates: y_feed_mole[IDX.SAT], mono: y_feed_mole[IDX.MONO], di: y_feed_mole[IDX.DI], poly: y_feed_mole[IDX.POLY], nmp: y_feed_mole[IDX.NMP] },
          totalMolarFlow_mol_h: V_feed_mol_h,
          impurityNote: purity < 1.0 ? 'Solvent impurity assigned to Saturates — Assumed' : 'Pure NMP solvent',
        },
        SO_massRatio: SO_mass,
        molecularWeights: {
          saturates_g_mol: { value: mwSat.value, source: sourceOf(mwSat) },
          mono_g_mol:      { value: mwMono.value, source: sourceOf(mwMono) },
          di_g_mol:        { value: mwDi.value,   source: sourceOf(mwDi) },
          poly_g_mol:      { value: mwPoly.value,  source: sourceOf(mwPoly) },
          nmp_g_mol:       { value: NMP_MW_G_MOL,  source: 'Exact molecular weight — not an input' },
          assumedNote:     mwAssumed ? 'One or more MW values are Assumed — mole fractions are Pending Validation' : 'All MW values are source-tagged',
        },
      },

      geometry: {
        formulaReference: 'ECR2-001',
        columnDiameter_m:            D,
        columnCrossSectionArea_m2:   A_col,
        rotorToColumnDiameterRatio:  ratio,
        rotorDiameter_m:             D_R,
        rotorSweptArea_m2:           A_R,
        compartmentHeight_m:         hComp,
        rotorsPerCompartment:        ROTORS_PER_COMPARTMENT,
        activeHeightInput_m:         H,
        nCompartments:               N_compartments,
        activeHeightActual_m:        H_actual,
        heightRoundingLoss_m:        H_extension,
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
        N_P:                  { value: powerNumber.value, source: sourceOf(powerNumber) },
        rotorSpeed_rpm:       rpm,
        rotorSpeed_rev_s:     rpm / 60,
        powerPerRotor_W:      P1_W,
        powerPerCompartment_W: P_shaft_per_comp_W,
        powerPerVolume_W_m3:  P_V_W_m3,
        totalShaftPower_W:    P_shaft_total_W,
        totalShaftPower_kW:   P_shaft_total_W / 1000,
        motorDesignPower_W:   P_motor_W,
        motorDesignPower_kW:  P_motor_W / 1000,
        shaftEfficiency:      { value: shaftEff.value,     source: sourceOf(shaftEff) },
        designMargin:         { value: designMargin.value, source: sourceOf(designMargin) },
        powerFormula:         'P₁ = N_P · ρ_b · N³ · D_R⁵ (per rotor, ECR2-003)',
        motorFormula:         'P_motor = P_shaft_total / η_shaft × design_margin',
        // ── ψ dimensional audit fields ────────────────────────────────────────
        psi_W_kg,
        psiFormA_verified: 'P_V_W_m3 = N_P·ρ_b·N³·D_R⁵/(A·h) [W/m³]; ψ = P_V_W_m3/ρ_b [W/kg]; ρ_b cancels → ψ = N_P·N³·D_R⁵/(A·h) — Form A ✓',
        psiDensityCancellation: 'ρ_b enters once in numerator (powerPerRotor) and once in denominator (÷rhoMix_phase1) — not a double division; net result is density-independent',
        powerDensityBasis: `Phase 1 continuous-phase inlet density (${continuousPhase}) = ${rhoMix_phase1.toFixed(2)} kg/m³ — same ρ_b in both P₁ and ψ normalisation`,
        psiMassBasis: 'source_not_verified — K&H 1995 primary paper not yet read; Laitinen 2019 does not state mass basis explicitly; numerical result is density-independent due to cancellation, so mass-basis uncertainty does not affect ψ value when same ρ_b is used consistently',
        psiDefinitionEvidenceStatus: 'thermopac_preliminary',
      },

      boundaryConditions,

      axialGrid: {
        note: 'Phase 1: geometry and power calculated per compartment. Compositions null — requires Phase 2 forward simulation loop. Properties null — requires Phase 2 composition-dependent property calculations.',
        compartments,
      },

      correlationRegistry: {
        note:
          'ecr2_holdup_kh1995: secondary_equation_verified — K&H 1995 holdup computed in Phase 1. ' +
          'ecr2_d32_kh1996: candidate_governed — UNRESOLVED_SYMBOL and UNRESOLVED_GROUPING block published implementation; engineer_supplied mode available. ' +
          'ecr2_koa_kh1999: pending_approval — gated on d₃₂ and K&H 1999 primary paper (C1, C2 agitation terms). ' +
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
      }),

      // ── d₃₂ section ────────────────────────────────────────────────────────
      d32: {
        correlationId:    'ecr2_d32_kh1996',
        correlationStatus: 'candidate_governed',
        engineeringBasis: d32Result?.status === 'engineer_supplied'
          ? 'Engineer-Supplied d₃₂ — Simulator Development / Sensitivity Basis'
          : 'Published Correlation — candidate_governed (K&H 1996)',
        modeUsed:         d32Config?.mode ?? 'not_attempted',
        d32_mm:           d32Scalar !== null ? d32Scalar * 1000 : null,
        d32_m:            d32Scalar,
        status:           d32Result?.status ?? 'not_attempted',
        label:            d32Result?.label ?? null,
        extrapolated:     d32Result?.extrapolated ?? false,
        diagnostics:      d32Result?.diagnostics ?? [],
        provenance:       d32Result?.provenance ?? 'd₃₂ not attempted — d32Config not supplied.',
        engineerSource:   d32Result?.engineerSource ?? null,
        unresolved: {
          UNRESOLVED_SYMBOL:
            'Numerator base for n₁=0.45 — primary candidate C₁^n₁ (C₁=3.04, d→c Kühni). ' +
            'Structural inference — NOT confirmed from K&H 1996 primary paper.',
          UNRESOLVED_GROUPING:
            'Term₂ geometry group — strong candidate [h·(ρcg/γ)^0.5]^0.38 = [h/λc]^0.38. ' +
            'Laitinen transcription h·(ρcg/γ)^0.38 is definitively dimensionally wrong (m^+0.24). ' +
            'Parameter table consistent — NOT confirmed from primary paper.',
          resolutionRequired: 'K&H 1996 primary paper (DOI 10.1021/ie950674w), Table 2 and equation body.',
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
        correlationStatus: 'pending_approval',
        status: 'NOT IMPLEMENTED',
        reason:
          'K&H 1999 mass-transfer framework (k_c, k_d, K_overall) is pending_approval. ' +
          'C1 and C2 agitation correction terms require K&H 1999 primary paper. ' +
          'Additionally gated on d₃₂ resolution (UNRESOLVED flags in K&H 1996).',
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
          primary: d32Scalar === null
            ? { reason: 'blocked_by_d32', correlationId: 'ecr2_d32_kh1996' }
            : { reason: 'correlation_unresolved', correlationId: 'ecr2_koa_kh1999' },
          message: d32Scalar === null
            ? 'K_oa requires d₃₂ (for d₃₂-based Sherwood number computation). Supply engineer d₃₂ to continue.'
            : 'K_oa requires K&H 1999 primary paper to confirm C1 and C2 agitation terms.',
        },
      },

      holdupCorrelation: {
        correlationId:     'ecr2_holdup_kh1995',
        correlationStatus: 'secondary_equation_verified',
        engineeringBasis:  'Published Correlation — Preliminary Engineering',
        governanceStatus:  'UNVERIFIED — pending primary source',
        primarySourceVerified: false,
        validatedForRRBONMP:   false,
        psiBasis: 'Thermopac preliminary interpretation — specific mechanical power dissipation',
        localAxialApplication: 'Thermopac model extension',
        phase1Note: 'Phase 1: uniform inlet-condition properties applied to all compartments. Axial property variation requires Phase 2.',
        phaseMappingFixed: 'RRBO = dispersed (Ud, ρd) | NMP = continuous (Uc, ρc)',
        psi_W_kg,
        gamma_N_m: gamma?.value ?? null,
        xf: fStator?.value ?? null,
        result: holdupResult,
        // phi is non-null when status ∈ {'calculated', 'calculated_extrapolated'}
        phi: holdupResult != null && (holdupResult.status === 'calculated' || holdupResult.status === 'calculated_extrapolated')
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
        extrapolatedRanges: holdupResult != null && holdupResult.status !== 'input_missing'
          ? holdupResult.extrapolatedRanges
          : null,
        downstreamUsable: holdupResult != null
          ? (holdupResult.status === 'calculated' || holdupResult.status === 'calculated_extrapolated')
          : false,
      },

      forwardSimulationStatus: {
        holdup: (() => {
          if (holdupResult == null) return 'NOT CALCULATED — interfacialTension not supplied';
          if (holdupResult.status === 'calculated')
            return `CALCULATED — φ = ${holdupResult.phi.toFixed(4)} (${(holdupResult.phi * 100).toFixed(2)} %) — Published Correlation Preliminary Engineering (K&H 1995)`;
          if (holdupResult.status === 'calculated_extrapolated')
            return `CALCULATED_EXTRAPOLATED — φ = ${holdupResult.phi.toFixed(4)} (${(holdupResult.phi * 100).toFixed(2)} %) — outside ranges: ${holdupResult.extrapolatedRanges.join(', ')}`;
          return `NOT CALCULABLE — ${holdupResult.status}`;
        })(),
        slipVelocity: U_slip_m_s !== null
          ? `CALCULATED — U_slip = ${U_slip_m_s.toExponential(4)} m/s (from φ_d, does not require d₃₂)`
          : 'NOT CALCULATED — requires usable φ_d',
        d32: (() => {
          if (!d32Config) return 'NOT ATTEMPTED — d32Config not supplied; provide d32Config to enable d₃₂ computation';
          if (d32Result?.status === 'engineer_supplied')
            return `ENGINEER_SUPPLIED — d₃₂ = ${(d32Result.d32_m! * 1000).toFixed(3)} mm — Simulator Development / Sensitivity Basis`;
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
              `${interfacialAreaResult.d32EngineerSupplied ? ', engineer-supplied basis' : ''})`;
          return `BLOCKED — ${interfacialAreaResult.status}: ${interfacialAreaResult.blockingReasons.join('; ')}`;
        })(),
        massTransfer: d32Scalar === null
          ? 'BLOCKED — k_c/k_d/K_overall require d₃₂ (and K&H 1999 primary paper for C1/C2 terms). Supply engineer d₃₂ and await K&H 1999 approval.'
          : 'BLOCKED_CORRELATION — d₃₂ available but K&H 1999 mass-transfer correlation is pending_approval (C1/C2 agitation terms require primary paper).',
        Koa: 'BLOCKED — gated on k_c, k_d, K_overall (all gated on K&H 1999 approval)',
        bvp: 'NOT IMPLEMENTED — requires: φ_d usable, d₃₂ usable/supplied, a calculated, k_c defined, k_d defined, K_overall defined, K_oa defined, driving-force contract implemented.',
        optimizer: 'NOT IMPLEMENTED — downstream of BVP',
        axialDispersion: 'NOT IMPLEMENTED — reserved; plug-flow baseline must be established first',
        nrtlReuseConfirmed: true,
        nrtlFunction: 'nrtlFlash(z, T_K, x0, y0) from llx-temperature-lle-model.ts — imported and ready for Phase 2',
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
      status: warnings.length > 0 ? 'warning' : 'success',
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

    const d32mm    = d32S?.d32_mm    != null ? Number(d32S.d32_mm) : null;
    const aVal     = intA?.a_m2_m3   != null ? Number(intA.a_m2_m3) : null;
    const avail    = dep?.availableCount as number | undefined;
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
          : { label: 'd₃₂', value: 'Blocked — K&H 1996 UNRESOLVED or not supplied', highlight: false },
        aVal !== null
          ? { label: 'Interfacial area a', value: Number(aVal.toFixed(1)), unit: 'm²/m³', highlight: true }
          : { label: 'Interfacial area a', value: 'Blocked — requires d₃₂', highlight: false },
        avail != null && total != null
          ? { label: 'Dependency graph', value: `${avail}/${total} quantities available`, highlight: false }
          : null,
      ].filter(Boolean) as DesignSummary['keyResults'],
      recommendations: [
        'ECR-2 Phase 1 + d₃₂/interfacial-area infrastructure. BVP and optimizer NOT implemented.',
        d32mm === null
          ? 'To enable a, k_c, k_d, K_oa: supply d32Config.mode=\'engineer_supplied\' for development/sensitivity.'
          : `d₃₂ = ${d32mm.toFixed(3)} mm (${d32S?.modeUsed}). Interfacial area a = ${aVal?.toFixed(1) ?? 'blocked'} m²/m³.`,
        'K&H 1999 mass-transfer correlation (k_c, k_d) is pending_approval — C1/C2 agitation terms require K&H 1999 primary paper.',
        'K&H 1996 d₃₂: UNRESOLVED_SYMBOL and UNRESOLVED_GROUPING — resolve from primary paper (DOI 10.1021/ie950674w).',
        'ECR-1 remains frozen and isolated — calculation_type=\'ecr_simulator\' confirmed.',
      ],
      warnings: [],
      calculationClass: 'Preliminary Simulator — Phase 1 + d₃₂/Interfacial-Area Infrastructure',
    };
  }
}
