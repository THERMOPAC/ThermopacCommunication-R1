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
  type KH1995HoldupResult,
} from './llx-ecr2-holdup';

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

  // ── Hydrodynamic correlation outputs (pending approval) ──────────────────
  /** Sauter mean droplet diameter d₃₂(z) (m). Null — d₃₂ correlation pending_approval. */
  d32_m: null;
  /**
   * Dispersed-phase holdup φ_d(z) (−).
   * Populated by K&H 1995 (secondary_equation_verified) in Phase 1 when
   * interfacialTension and statorOpenAreaFraction are supplied.
   * Null when inputs are missing or outside correlation envelope.
   * Check result.status before reading result.phi.
   */
  holdup_dispersed: KH1995HoldupResult | null;
  /** Interfacial area a(z) = 6·φ_d/d₃₂ (m²/m³). Null — gated on d₃₂ and holdup. */
  interfacialArea_m2_m3: null;
  /** Overall volumetric mass-transfer coefficient K_oa (m/s). Null — K_oa pending_approval. */
  Koa_m_s: null;
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

    // ── ψ — mechanical power dissipation per unit mass ───────────────────────
    //
    // ψ [W/kg] = N_P · N³ · D_R⁵ / (A_col · h_comp)
    //          = P_V_W_m3 / ρ_mix
    //
    // Uses the same continuous-phase density basis as the Phase 1 power calc.
    // Dimensional identity: P₁ [W] = N_P · ρ · N³ · D_R⁵
    //   → P/V = P₁ / (A_col · h_comp) [W/m³]
    //   → ψ   = (P/V) / ρ = N_P · N³ · D_R⁵ / (A_col · h_comp)  [W/kg = m²/s³] ✓
    //
    // In Phase 1, ψ is uniform along the column (inlet-condition properties).
    // Phase 2 will replace with compartment-local densities.
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

        // Correlation outputs
        d32_m:               null,          // CANDIDATE — UNRESOLVED_SYMBOL/UNRESOLVED_GROUPING; not implemented
        holdup_dispersed:    holdupResult,  // K&H 1995 — secondary_equation_verified; UNVERIFIED pending primary
        interfacialArea_m2_m3: null,        // Gated on d₃₂ and holdup — Phase 2
        Koa_m_s:             null,          // pending_approval — Phase 2
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
        powerFormula:         'P₁ = N_P · ρ_mix · N³ · D_R⁵ (per rotor, ECR2-003)',
        motorFormula:         'P_motor = P_shaft_total / η_shaft × design_margin',
      },

      boundaryConditions,

      axialGrid: {
        note: 'Phase 1: geometry and power calculated per compartment. Compositions null — requires Phase 2 forward simulation loop. Properties null — requires Phase 2 composition-dependent property calculations.',
        compartments,
      },

      correlationRegistry: {
        note:
          'ecr2_holdup_kh1995: secondary_equation_verified — K&H 1995 holdup now computed per compartment. ' +
          'ecr2_d32_kh1996: candidate_governed — UNRESOLVED_SYMBOL and UNRESOLVED_GROUPING block implementation. ' +
          'ecr2_koa_kh1999: pending_approval — gated on d₃₂ and holdup. ' +
          'ecr2_flooding_pending, ecr2_axial_dispersion_pending: pending/reserved.',
        entries: corrRegistry,
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
            return `CALCULATED — φ = ${holdupResult.phi.toFixed(4)} (${(holdupResult.phi * 100).toFixed(2)} %) — Published Correlation Preliminary Engineering`;
          if (holdupResult.status === 'calculated_extrapolated')
            return `CALCULATED_EXTRAPOLATED — φ = ${holdupResult.phi.toFixed(4)} (${(holdupResult.phi * 100).toFixed(2)} %) — outside ranges: ${holdupResult.extrapolatedRanges.join(', ')}`;
          return `NOT CALCULABLE — ${holdupResult.status}`;
        })(),
        d32: 'NOT IMPLEMENTED — UNRESOLVED_SYMBOL and UNRESOLVED_GROUPING in registry; requires K&H 1996 primary paper review',
        massTransfer: 'NOT IMPLEMENTED — gated on d₃₂ and holdup governing',
        bvp: 'NOT IMPLEMENTED — Phase 2',
        optimizer: 'NOT IMPLEMENTED — Phase 2',
        axialDispersion: 'NOT IMPLEMENTED — reserved',
        nrtlReuseConfirmed: true,
        nrtlFunction: 'nrtlFlash(z, T_K, x0, y0) from llx-temperature-lle-model.ts — imported and ready for Phase 2',
        bvpOrientation: 'Two-point BVP: z=0 (RRBO feed known, extract unknown) and z=H (NMP feed known, raffinate unknown)',
        rateBasisNote: 'ECR-2 is rate-based. NRTL provides local equilibrium TARGET for driving force; finite K_oa determines actual transfer.',
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
    const geo = results.geometry as Record<string, unknown> | undefined;
    const pwr = results.power   as Record<string, unknown> | undefined;
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
        { label: 'Scaffold phase', value: 'Phase 1 — geometry and power only', highlight: true },
      ].filter(Boolean) as DesignSummary['keyResults'],
      recommendations: [
        'ECR-2 PHASE 1 SCAFFOLD ONLY — forward simulation not yet implemented.',
        'All hydrodynamic correlations are pending_approval — no d₃₂, holdup, or K_oa calculated.',
        'Phase 2 implementation requires separate approval of at minimum: d₃₂ and holdup correlations.',
      ],
      warnings: [],
      calculationClass: 'Preliminary Simulator Scaffold',
    };
  }
}
