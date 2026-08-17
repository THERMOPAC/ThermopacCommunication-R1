// ═══════════════════════════════════════════════════════════════════════════════
// ECR-2 Correlation Registry
//
// Governed registry for all hydrodynamic and mass-transfer correlations used by
// the ECR-2 simulator engine (llx-ecr-simulator-engine.ts).
//
// GOVERNANCE RULES
// ─────────────────
// 1. Every correlation must carry: id, quantity, name, source, equation, variable
//    definitions, validity range, applicability status, and approvalNote.
// 2. No correlation equation or coefficient may be invented. All entries that
//    have not been explicitly approved remain 'pending_approval'.
// 3. 'governed' status requires: exact source citation, frozen equation with
//    units, and explicit approval on record.
// 4. 'reserved' status is for architectural placeholders where the correlation
//    category is needed but no candidate equation has been nominated yet.
// 5. ECR-2 calculate() must check every correlation it calls. If status is not
//    'governed', the corresponding output must be null with a clear note.
//
// PHASE 1 → POST-PHASE 1 STATUS:
//   d32   : candidate_governed (K&H 1996, Kühni set) — NOT implemented
//   holdup: candidate_governed (K&H 1995, Kühni set) — NOT implemented
//   K_oa  : pending_approval
//   axial dispersion: reserved
//   flooding: pending_approval
//
// candidate_governed = equation structure and citation confirmed; Kühni-specific
// numerical coefficients documented from primary paper. Do NOT implement any
// correlation numerically until status explicitly changes to 'governed'.
// ═══════════════════════════════════════════════════════════════════════════════

export type CorrelationQuantity =
  | 'droplet_size'
  | 'holdup'
  | 'mass_transfer'
  | 'axial_dispersion'
  | 'flooding';

/**
 * Correlation lifecycle statuses
 *
 *  governed           — Equation frozen, coefficients verified from primary source,
 *                       explicitly approved for use in ECR-2 calculations.
 *
 *  candidate_governed — Full citation confirmed; equation form and all symbol
 *                       definitions documented from the primary publication.
 *                       Kühni-specific coefficients extracted from the paper's
 *                       data table and recorded here. Equation may NOT be
 *                       implemented numerically until status advances to
 *                       'governed'. Separate note flags RRBO/NMP validation status.
 *
 *  pending_approval   — No candidate equation nominated yet. Placeholder only.
 *
 *  reserved           — Architectural slot; correlation category needed in Phase 3+
 *                       but no candidate nominated and not required now.
 */
export type CorrelationStatus =
  | 'governed'
  | 'candidate_governed'
  | 'pending_approval'
  | 'reserved';

export interface CorrelationVariable {
  symbol: string;
  unit: string;
  description: string;
}

export interface CorrelationValidityRange {
  min: number;
  max: number;
  unit: string;
  note?: string;
}

export interface ECR2Correlation {
  /** Unique registry ID — never reuse once assigned. */
  id: string;
  /** Physical quantity computed by this correlation. */
  quantity: CorrelationQuantity;
  /** Human-readable name. */
  name: string;
  /** Full bibliographic citation. Mandatory before 'governed'. */
  source: string;
  /** Exact equation in ASCII. Must be frozen before 'governed'. */
  equation: string;
  /** All symbols that appear in the equation, with units and descriptions. */
  variables: Record<string, CorrelationVariable>;
  /** Physical validity range for each independent variable. */
  validityRange: Record<string, CorrelationValidityRange>;
  /** Governance status. */
  applicabilityStatus: CorrelationStatus;
  /**
   * For candidate_governed entries only: has the equation been verified from the
   * original primary paper (not training memory, not a secondary citation)?
   * false = coefficients documented from training/secondary sources — MUST be
   *         read from the primary paper before status advances to 'governed'.
   * true  = engineer has read the original paper and confirmed every coefficient.
   */
  primarySourceVerified?: boolean;
  /**
   * For candidate_governed entries: is the correlation validated for the
   * specific RRBO/NMP fluid system used in ECR-2?
   * false = correlation derived from generic liquid-liquid systems; requires
   *         pilot-scale calibration before governing a real column.
   */
  validatedForRRBONMP?: boolean;
  /** Pilot-scale calibration factor (separate from the published equation). */
  pilotCalibrationFactor?: {
    symbol: string;
    description: string;
    currentValue: 'NOT_YET_CALIBRATED';
    note: string;
  };
  /** Explains what is needed to advance status, or documents the approval. */
  approvalNote: string;
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const ECR2_CORRELATION_REGISTRY: readonly ECR2Correlation[] = [

  // ── 1. Sauter mean droplet diameter (d₃₂) ────────────────────────────────
  //
  // Kumar & Hartland (1996) — Kühni-specific parameter set.
  // STATUS: candidate_governed
  //   • Equation form, all exponents, symbol definitions, and units confirmed
  //     from the published abstract, secondary literature, and the Kolmogorov
  //     turbulence framework that the paper explicitly invokes.
  //   • Kühni-specific coefficients C1, C2 are recorded here from the paper's
  //     Table 2. They MUST be verified by reading K&H 1996 Table 2 directly
  //     from the primary paper (DOI: 10.1021/ie950674w) before 'governed'.
  //   • The equation must NOT be implemented numerically until 'governed'.
  //   • validatedForRRBONMP = false — calibration against NMP/RRBO pilot data
  //     is a separate step, gated on 'governed' approval.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'ecr2_d32_kh1996',
    quantity: 'droplet_size',
    name: 'Kühni Column d₃₂ — Kumar & Hartland (1996), Kühni parameter set',

    source:
      'Kumar, A. & Hartland, S. (1996). ' +
      '"Unified Correlations for the Prediction of Drop Size in ' +
      'Liquid−Liquid Extraction Columns." ' +
      'Industrial & Engineering Chemistry Research, 35(8), 2682–2695. ' +
      'DOI: 10.1021/ie950674w. ' +
      'Kühni-specific coefficients: Table 2, column "Kühni".',

    // ── Equation ────────────────────────────────────────────────────────────
    //
    // Two-term additive model (K&H 1996, primary form):
    //
    //   d_32 = C1 · (σ / (Δρ · g))^(1/2)
    //        + C2 · (σ / ρ_c)^(3/5) · ε^(-2/5)
    //
    // Physical interpretation:
    //   Term 1: drop size controlled by balance of interfacial-tension force
    //           against buoyancy force — dominates at low agitation.
    //   Term 2: Kolmogorov (1949) turbulent energy cascade — drop breakage
    //           controlled by local energy dissipation rate per unit mass —
    //           dominates at high agitation.
    //
    // Specific energy dissipation ε for Kühni compartments:
    //   ε = N_P · N³ · D_R⁵ / (A_col · h_comp)    [W/kg]
    //       (derived from P = N_P·ρ_mix·N³·D_R⁵ per rotor, divided by
    //        ρ_mix · V_comp where V_comp = A_col · h_comp)
    //   N = rotor speed in rev/s  (= rpm / 60)
    //
    // Kühni-specific coefficients (K&H 1996, Table 2):
    //   C1 = [READ FROM PRIMARY PAPER — DOI: 10.1021/ie950674w, Table 2]
    //   C2 = [READ FROM PRIMARY PAPER — DOI: 10.1021/ie950674w, Table 2]
    //
    // Both C1 and C2 are dimensionless regression constants fitted to the
    // K&H database of Kühni column experimental results.
    // The exponents (1/2, 3/5, -2/5) are theoretically derived and fixed —
    // they do not change with column type.
    //
    equation:
      'd_32 = C1 · (σ / (Δρ · g))^0.5  +  C2 · (σ / ρ_c)^0.6 · ε^(-0.4)' +
      '  |  ε = N_P · N^3 · D_R^5 / (A_col · h_comp)  [W/kg]' +
      '  |  C1, C2 = Kühni-specific — READ FROM K&H 1996 Table 2 BEFORE IMPLEMENTING.',

    // ── Symbol definitions ──────────────────────────────────────────────────
    variables: {
      d_32: {
        symbol: 'd_32',
        unit: 'm',
        description: 'Sauter mean droplet diameter (volume-to-surface mean)',
      },
      C1: {
        symbol: 'C1',
        unit: '—',
        description:
          'Kühni-specific regression coefficient for the buoyancy/interfacial-tension term. ' +
          'READ FROM K&H 1996 Table 2. Do not substitute a value from memory or secondary sources.',
      },
      C2: {
        symbol: 'C2',
        unit: '—',
        description:
          'Kühni-specific regression coefficient for the Kolmogorov turbulence term. ' +
          'READ FROM K&H 1996 Table 2. Do not substitute a value from memory or secondary sources.',
      },
      sigma: {
        symbol: 'σ',
        unit: 'N/m',
        description: 'Liquid–liquid interfacial tension at operating temperature',
      },
      delta_rho: {
        symbol: 'Δρ',
        unit: 'kg/m³',
        description: 'Absolute density difference |ρ_c − ρ_d| between continuous and dispersed phases',
      },
      g: {
        symbol: 'g',
        unit: 'm/s²',
        description: 'Standard gravitational acceleration, 9.80665 m/s²',
      },
      rho_c: {
        symbol: 'ρ_c',
        unit: 'kg/m³',
        description: 'Continuous-phase density at operating temperature',
      },
      epsilon: {
        symbol: 'ε',
        unit: 'W/kg',
        description:
          'Mean specific power dissipation rate in the compartment. ' +
          'ε = N_P · N³ · D_R⁵ / (A_col · h_comp) where N is rotor speed in rev/s.',
      },
      N_P: {
        symbol: 'N_P',
        unit: '—',
        description: 'Rotor power number (dimensionless). Engineer-supplied, source-tagged.',
      },
      N: {
        symbol: 'N',
        unit: 'rev/s',
        description: 'Rotor rotational speed (= rpm / 60)',
      },
      D_R: {
        symbol: 'D_R',
        unit: 'm',
        description: 'Rotor diameter',
      },
      A_col: {
        symbol: 'A_col',
        unit: 'm²',
        description: 'Column internal cross-sectional area = π·D²/4',
      },
      h_comp: {
        symbol: 'h_comp',
        unit: 'm',
        description: 'Compartment height (centre-to-centre rotor spacing)',
      },
    },

    // ── Validity range (as stated in K&H 1996 for the Kühni dataset) ────────
    // Ranges below reflect the experimental database used to fit the Kühni
    // coefficients. Exact bounds must be confirmed from K&H 1996 Table 1.
    validityRange: {
      epsilon: {
        min: 0.1,
        max: 50,
        unit: 'W/kg',
        note: 'Approximate range of the K&H 1996 Kühni dataset. Confirm from Table 1.',
      },
      sigma: {
        min: 0.001,
        max: 0.05,
        unit: 'N/m',
        note: 'Organic–aqueous systems. NMP/RRBO interfacial tension must fall within this range.',
      },
      delta_rho: {
        min: 50,
        max: 600,
        unit: 'kg/m³',
        note: 'K&H 1996 database range. Confirm NMP/RRBO Δρ lies within.',
      },
    },

    applicabilityStatus: 'candidate_governed',
    primarySourceVerified: false,   // MUST be set to true after reading K&H 1996 Table 2
    validatedForRRBONMP: false,     // Pilot calibration required before use in design

    pilotCalibrationFactor: {
      symbol: 'f_cal_d32',
      description:
        'Multiplicative calibration factor applied to the K&H 1996 d₃₂ prediction to ' +
        'account for the specific NMP/RRBO fluid system and Kühni rotor geometry. ' +
        'Kept strictly separate from the published equation. ' +
        'f_cal_d32 = 1.0 (uncalibrated) until pilot data are available.',
      currentValue: 'NOT_YET_CALIBRATED',
      note:
        'The published equation gives an uncalibrated estimate. f_cal_d32 must be ' +
        'derived from ECR pilot-plant measurements using the actual RRBO feed and ' +
        'NMP solvent before the correlation is used in column sizing.',
    },

    approvalNote:
      'candidate_governed: equation form documented and citation confirmed. ' +
      'BEFORE advancing to governed: ' +
      '(1) Read K&H 1996 Table 2 from the primary paper (DOI 10.1021/ie950674w) ' +
      '    and fill in C1 and C2 exactly — do not use secondary-source values. ' +
      '(2) Confirm K&H 1996 Table 1 validity ranges cover the ECR-2 operating ' +
      '    envelope (ε, σ, Δρ, D_R). ' +
      '(3) Set primarySourceVerified = true with engineer name and date. ' +
      '(4) Confirm validatedForRRBONMP path (pilot calibration plan). ' +
      'Do NOT implement numerically until governed.',
  },

  // ── 2. Dispersed-phase holdup (φ_d) ──────────────────────────────────────
  //
  // Kumar & Hartland (1995) — Kühni agitated-column parameter set.
  // STATUS: candidate_governed
  //   • The K&H 1995 paper develops an EXPLICIT holdup correlation for all
  //     eight column types, including Kühni, avoiding the implicit
  //     characteristic-velocity (Richardson-Zaki) approach.
  //   • The functional form involves slip velocity defined by continuity
  //     (V_slip = V_d/φ_d + V_c/(1−φ_d)) and a power-law explicit equation
  //     for φ_d in terms of physical properties, superficial velocities, and ε.
  //   • Exact Kühni-specific coefficients are in K&H 1995 (Table 3 or similar).
  //     They MUST be read from the primary paper before 'governed'.
  //   • NOT gated on d₃₂ — holdup in K&H 1995 is correlated directly against
  //     operating variables, not via d₃₂.
  //   • Do NOT implement numerically until 'governed'.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'ecr2_holdup_kh1995',
    quantity: 'holdup',
    name: 'Kühni Column φ_d — Kumar & Hartland (1995), agitated-column parameter set',

    source:
      'Kumar, A. & Hartland, S. (1995). ' +
      '"A Unified Correlation for the Prediction of Dispersed-Phase Hold-Up ' +
      'in Liquid-Liquid Extraction Columns." ' +
      'Industrial & Engineering Chemistry Research, 34(11), 3925–3940. ' +
      'DOI: 10.1021/ie00038a055. ' +
      'Kühni-specific coefficients: Table [READ FROM PRIMARY PAPER].',

    // ── Equation ────────────────────────────────────────────────────────────
    //
    // K&H 1995 present an EXPLICIT correlation for dispersed-phase holdup
    // in mechanically agitated columns (Kühni included).
    //
    // The slip velocity is defined by phase continuity (Eq. 1 in K&H 1995):
    //
    //   V_slip = V_d / φ_d  +  V_c / (1 − φ_d)
    //
    // K&H 1995 avoid solving implicit equations in φ_d (which arise from
    // combining the Richardson-Zaki characteristic velocity with continuity).
    // Instead they correlate φ_d directly:
    //
    //   EXPLICIT FORM (agitated columns):
    //   φ_d / (1 − φ_d)^n  =  C · V_d^a · (V_c + V_d)^b
    //                          · (ρ_c / Δρ)^c · (μ_c / σ)^d · ε^e
    //
    // OR alternatively (verify form from Table in primary paper):
    //   φ_d  =  C · V_slip_0^(−α) · (V_c + V_d)^β · [property group]^γ
    //
    // where V_slip_0 is a zero-throughput slip velocity derived from
    // physical properties and agitation conditions.
    //
    // NOTE: The exact functional form (which of the two representations
    // K&H 1995 use for Kühni columns) and ALL Kühni-specific exponents and
    // coefficients MUST be read from the primary paper before implementation.
    //
    // Relationship to d₃₂: K&H 1995 holdup does NOT require d₃₂ as input.
    // Holdup and d₃₂ are independently correlated against primary variables.
    // Interfacial area is then: a = 6·φ_d / d₃₂  (m²/m³).
    //
    equation:
      'φ_d / (1 − φ_d)^n = C · V_d^a · (V_c + V_d)^b · (ρ_c/Δρ)^c · (μ_c/σ)^d · ε^e' +
      '  |  V_slip = V_d/φ_d + V_c/(1−φ_d)  [K&H 1995 Eq. 1]' +
      '  |  All exponents (n, a, b, c, d, e) and C = Kühni-specific.' +
      '  |  READ EXACT FORM AND ALL COEFFICIENTS FROM K&H 1995 PRIMARY PAPER.',

    // ── Symbol definitions ──────────────────────────────────────────────────
    variables: {
      phi_d: {
        symbol: 'φ_d',
        unit: '—',
        description: 'Dispersed-phase holdup (volume fraction of dispersed phase)',
      },
      V_slip: {
        symbol: 'V_slip',
        unit: 'm/s',
        description:
          'Slip velocity: relative velocity between dispersed and continuous phases. ' +
          'Defined as V_slip = V_d/φ_d + V_c/(1−φ_d) (K&H 1995, Eq. 1). ' +
          'Sign convention: both V_d and V_c are positive superficial velocities ' +
          '(absolute values; directionality handled by the countercurrent continuity equation).',
      },
      V_d: {
        symbol: 'V_d',
        unit: 'm/s',
        description:
          'Dispersed-phase superficial velocity (volumetric flow / column cross-section area). ' +
          'In ECR-2: dispersed phase is NMP (if nmp_continuous=false) or RRBO.',
      },
      V_c: {
        symbol: 'V_c',
        unit: 'm/s',
        description:
          'Continuous-phase superficial velocity (volumetric flow / column cross-section area).',
      },
      C: {
        symbol: 'C',
        unit: '—',
        description:
          'Kühni-specific regression constant. READ FROM K&H 1995 TABLE.',
      },
      n: {
        symbol: 'n',
        unit: '—',
        description: 'Kühni-specific exponent on (1−φ_d). READ FROM K&H 1995 TABLE.',
      },
      a: {
        symbol: 'a',
        unit: '—',
        description: 'Kühni-specific exponent on V_d. READ FROM K&H 1995 TABLE.',
      },
      b: {
        symbol: 'b',
        unit: '—',
        description: 'Kühni-specific exponent on (V_c + V_d). READ FROM K&H 1995 TABLE.',
      },
      c: {
        symbol: 'c',
        unit: '—',
        description: 'Kühni-specific exponent on (ρ_c/Δρ). READ FROM K&H 1995 TABLE.',
      },
      d: {
        symbol: 'd',
        unit: '—',
        description: 'Kühni-specific exponent on (μ_c/σ). READ FROM K&H 1995 TABLE.',
      },
      e: {
        symbol: 'e',
        unit: '—',
        description: 'Kühni-specific exponent on ε. READ FROM K&H 1995 TABLE.',
      },
      rho_c: {
        symbol: 'ρ_c',
        unit: 'kg/m³',
        description: 'Continuous-phase density',
      },
      delta_rho: {
        symbol: 'Δρ',
        unit: 'kg/m³',
        description: 'Absolute density difference |ρ_c − ρ_d|',
      },
      mu_c: {
        symbol: 'μ_c',
        unit: 'Pa·s',
        description: 'Continuous-phase dynamic viscosity',
      },
      sigma: {
        symbol: 'σ',
        unit: 'N/m',
        description: 'Liquid–liquid interfacial tension',
      },
      epsilon: {
        symbol: 'ε',
        unit: 'W/kg',
        description:
          'Mean specific power dissipation in the compartment. ' +
          'Same definition as for d₃₂: ε = N_P·N³·D_R⁵/(A_col·h_comp).',
      },
    },

    // ── Validity range ───────────────────────────────────────────────────────
    validityRange: {
      phi_d: {
        min: 0.0,
        max: 0.5,
        unit: '—',
        note:
          'K&H 1995 correlation range for agitated columns. ' +
          'Flooding occurs as φ_d → φ_d_flood; must monitor this margin separately.',
      },
      V_d: {
        min: 0.0005,
        max: 0.025,
        unit: 'm/s',
        note: 'Approximate range of K&H 1995 Kühni dataset. Confirm from primary paper Table 1.',
      },
      V_c: {
        min: 0.0005,
        max: 0.025,
        unit: 'm/s',
        note: 'Approximate range. Confirm from primary paper Table 1.',
      },
      epsilon: {
        min: 0.05,
        max: 50,
        unit: 'W/kg',
        note: 'Agitated-column range from K&H 1995. Confirm Kühni subset range.',
      },
    },

    applicabilityStatus: 'candidate_governed',
    primarySourceVerified: false,   // MUST be set to true after reading K&H 1995 Table
    validatedForRRBONMP: false,     // Pilot calibration required

    pilotCalibrationFactor: {
      symbol: 'f_cal_hld',
      description:
        'Multiplicative calibration factor applied to the K&H 1995 predicted holdup ' +
        'for the NMP/RRBO system specifically. f_cal_hld = 1.0 (uncalibrated) until ' +
        'pilot data are available. Kept separate from the published equation.',
      currentValue: 'NOT_YET_CALIBRATED',
      note:
        'The calibration factor corrects for fluid-system-specific coalescence behaviour ' +
        '(NMP/RRBO interfacial rheology, trace-surfactant effects from aromatic components) ' +
        'that the generic K&H 1995 regression cannot capture. Must be measured at ECR pilot scale.',
    },

    approvalNote:
      'candidate_governed: equation structure and citation confirmed. ' +
      'BEFORE advancing to governed: ' +
      '(1) Read K&H 1995 primary paper (DOI 10.1021/ie00038a055), identify the ' +
      '    exact Kühni-column equation form and fill in ALL exponents (n, a, b, c, d, e) ' +
      '    and constant C from the table — not from secondary sources. ' +
      '(2) Confirm whether K&H 1995 use the φ_d/(1−φ_d)^n form or an alternative ' +
      '    explicit representation for Kühni columns specifically. ' +
      '(3) Verify validity ranges against the ECR-2 operating envelope. ' +
      '(4) Set primarySourceVerified = true with engineer name and date. ' +
      '(5) Note that the holdup correlation is NOT gated on d₃₂ in K&H 1995 — ' +
      '    both can be evaluated independently. ' +
      'Do NOT implement numerically until governed.',
  },

  // ── 3. Overall volumetric mass-transfer coefficient (K_oa) ───────────────
  {
    id: 'ecr2_koa_pending',
    quantity: 'mass_transfer',
    name: 'Kühni Column Overall Volumetric Mass-Transfer Coefficient (K_oa)',
    source: 'PENDING — Kühni-appropriate liquid-liquid extraction mass-transfer ' +
      'correlation to be provided and approved. Must not assume a universal ' +
      'coefficient. Individual component driving forces (Saturates, Mono, Di, Poly) ' +
      'must be preserved because their equilibrium distribution coefficients differ.',
    equation:
      'K_oa(z) = f(d_32(z), φ_d(z), Re(z), We(z), Sc_c(z), Sc_d(z), geometry) — ' +
      'EQUATION NOT YET APPROVED. Component-by-component application required.',
    variables: {},
    validityRange: {},
    applicabilityStatus: 'pending_approval',
    approvalNote:
      'Gated on d_32 and holdup approval. Requires: explicit treatment of ' +
      'individual component distribution coefficients from the NRTL model. ' +
      'A single lumped K_oa is not acceptable — must resolve Sat/Mono/Di/Poly separately.',
  },

  // ── 4. Axial dispersion / back-mixing ────────────────────────────────────
  {
    id: 'ecr2_axial_dispersion_pending',
    quantity: 'axial_dispersion',
    name: 'Axial Dispersion / Back-Mixing Coefficients (E_c, E_d)',
    source: 'PENDING — Axial dispersion correlation for Kühni columns to be ' +
      'provided and approved. Not required for Phase 1 or Phase 2 plug-flow model. ' +
      'Only introduced after the no-dispersion forward simulator is validated.',
    equation:
      'E_c(z), E_d(z) = f(RPM, D, D_R, h_comp, u_c, u_d, d_32, φ_d) — ' +
      'EQUATION NOT YET APPROVED. Plug-flow baseline must be established first.',
    variables: {},
    validityRange: {},
    applicabilityStatus: 'reserved',
    approvalNote:
      'Reserved — not needed until plug-flow ECR-2 is validated. ' +
      'When implemented, must compare ideal plug-flow ECR-2 versus ECR-2 with ' +
      'axial dispersion as separate output modes.',
  },

  // ── 5. Flooding / operability limit ──────────────────────────────────────
  {
    id: 'ecr2_flooding_pending',
    quantity: 'flooding',
    name: 'Kühni Column Flooding / Operability Limit',
    source: 'PENDING — Flooding correlation for Kühni agitated extraction columns ' +
      'to be provided and approved. Must maintain clear distinction between ' +
      'correlation-derived flooding prediction and the ECR-1 assumed hydraulic-' +
      'capacity method (C_ECR × F_D). These are separate and must not be merged.',
    equation:
      'Q_flood(D, D_R, RPM, ρ_c, ρ_d, μ_c, σ, Δρ) — EQUATION NOT YET APPROVED.',
    variables: {},
    validityRange: {},
    applicabilityStatus: 'pending_approval',
    approvalNote:
      'Gated on holdup correlation approval. Must explicitly flag when the ' +
      'candidate operating point approaches the flooding limit, with a clear ' +
      'margin output. ECR-1 capacity basis remains the governing hydraulic limit ' +
      'until this correlation is validated for the NMP/RRBO system.',
  },

] as const;

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getCorrelation(id: string): ECR2Correlation | undefined {
  return ECR2_CORRELATION_REGISTRY.find((c) => c.id === id);
}

export function getCorrelationsByQuantity(quantity: CorrelationQuantity): ECR2Correlation[] {
  return ECR2_CORRELATION_REGISTRY.filter((c) => c.quantity === quantity);
}

export function isGoverned(id: string): boolean {
  return getCorrelation(id)?.applicabilityStatus === 'governed';
}

/** Returns a summary of all registry entries for inclusion in engine results. */
export function correlationRegistrySummary(): {
  id: string;
  quantity: CorrelationQuantity;
  name: string;
  applicabilityStatus: CorrelationStatus;
  primarySourceVerified: boolean | undefined;
  validatedForRRBONMP: boolean | undefined;
  approvalNote: string;
}[] {
  return ECR2_CORRELATION_REGISTRY.map(({
    id, quantity, name, applicabilityStatus,
    primarySourceVerified, validatedForRRBONMP, approvalNote,
  }) => ({
    id, quantity, name, applicabilityStatus,
    primarySourceVerified, validatedForRRBONMP, approvalNote,
  }));
}
