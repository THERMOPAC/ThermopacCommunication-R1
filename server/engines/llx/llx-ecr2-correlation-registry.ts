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
   * For candidate_governed entries: have the coefficients been reproduced from
   * a secondary peer-reviewed source that itself cites the primary paper?
   * true  = values traced to a secondary reproduction; provides confidence in the
   *         numbers but does NOT substitute for primarySourceVerified.
   * false = values not yet reproduced from any source.
   */
  secondaryReproductionVerified?: boolean;
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
  //
  // PHASE ASSIGNMENT (ECR-2 specific):
  //   RRBO = DISPERSED phase   (light, upward)
  //   NMP  = CONTINUOUS phase  (heavy, downward)
  //   Mass-transfer direction: d → c  (aromatics transfer from RRBO drops into NMP)
  //   This must be preserved when the governing equation is reconstructed for ECR-2.
  //
  // IDENTIFIED KÜHNI PARAMETER SET (secondary reproduction):
  //   Six parameters identified from secondary peer-reviewed reproduction of
  //   K&H 1996 for the Kühni column type:
  //     C1 = 3.04,  n1 = 0.45
  //     C2 = 1.60,  n2 = −0.63
  //     C3 = 0.034, n3 = −0.38
  //   secondaryReproductionVerified = true
  //   primarySourceVerified        = false  ← must be verified from K&H 1996 primary paper
  //
  // IMPORTANT — DO NOT IMPLEMENT THE SIMPLIFIED TWO-TERM EQUATION BELOW:
  //   The six parameters (C1, C2, C3, n1, n2, n3) indicate that the actual
  //   K&H 1996 Kühni equation has a more detailed structure than the generic
  //   two-term abstract model. The exact full equation — including geometry
  //   terms, dimension groups, and unit conventions — must be reconstructed
  //   cleanly from the primary paper before any numerical implementation.
  //   The equation field below is a STRUCTURAL PLACEHOLDER ONLY.
  //
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
      'Kühni-specific coefficients: Table 2, column "Kühni". ' +
      'Phase assignment for ECR-2: RRBO dispersed, NMP continuous, mass transfer d→c.',

    // ── Equation (STRUCTURAL PLACEHOLDER — DO NOT IMPLEMENT) ───────────────
    //
    // The K&H 1996 unified d₃₂ model for agitated columns uses an additive
    // structure combining a buoyancy term and a Kolmogorov turbulence term.
    // The GENERIC abstract form is:
    //
    //   d_32 = C1 · (σ / (Δρ · g))^n1
    //        + C2 · (σ / ρ_c)^n2 · ε^n3
    //        [+ C3 · (geometry / property group) ]
    //
    // The IDENTIFIED KÜHNI PARAMETERS ARE:
    //   C1 = 3.04,  n1 = 0.45
    //   C2 = 1.60,  n2 = −0.63
    //   C3 = 0.034, n3 = −0.38
    //
    // HOWEVER: The exact assignment of (C3, n3) to a specific term, the full
    // dimensional form, the geometry groups, and the unit conventions HAVE NOT
    // YET been reconstructed from the primary paper. Do NOT substitute the six
    // parameters into the simplified two-term equation above — the actual Kühni
    // equation may have a third term or different groupings.
    //
    // This equation field will be updated once the exact published mathematical
    // form is confirmed from K&H 1996 and separately approved.
    //
    equation:
      'STRUCTURAL PLACEHOLDER — DO NOT IMPLEMENT. ' +
      'Identified parameters (secondary reproduction, not yet assigned to terms): ' +
      'C1=3.04 n1=0.45 | C2=1.60 n2=−0.63 | C3=0.034 n3=−0.38. ' +
      'Exact Kühni equation form with full geometry groups and unit conventions ' +
      'must be reconstructed from K&H 1996 primary paper before numerical use. ' +
      'Generic structure: d_32 = C1·(σ/(Δρ·g))^n1 + C2·(σ/ρ_c)^n2·ε^n3 [+C3·(...)^(...)] ' +
      '| ε = N_P · N^3 · D_R^5 / (A_col · h_comp) [W/kg] ' +
      '| Phase: RRBO dispersed, NMP continuous, mass-transfer d→c.',

    // ── Identified Kühni parameters (secondary reproduction) ────────────────
    // These are recorded for audit purposes. Do not use for calculation until
    // the full equation is reconstructed and status advances to 'governed'.
    variables: {
      d_32: {
        symbol: 'd_32',
        unit: 'm',
        description: 'Sauter mean droplet diameter (volume-to-surface mean)',
      },
      // ── Kühni coefficients ──────────────────────────────────────────────────
      // Identified values (secondary reproduction). Term assignments NOT yet
      // established — do not pair Ci with ni until K&H 1996 Table 2 is read.
      C1: {
        symbol: 'C1',
        unit: '—',
        description:
          'Kühni regression coefficient. Identified value: 3.04 (secondary reproduction). ' +
          'Which term (buoyancy/turbulence/geometry) this multiplies is NOT YET CONFIRMED — ' +
          'do not assume C1 pairs with n1 without primary-paper verification.',
      },
      C2: {
        symbol: 'C2',
        unit: '—',
        description:
          'Kühni regression coefficient. Identified value: 1.60 (secondary reproduction). ' +
          'Term assignment NOT YET CONFIRMED from primary paper.',
      },
      C3: {
        symbol: 'C3',
        unit: '—',
        description:
          'Kühni regression coefficient. Identified value: 0.034 (secondary reproduction). ' +
          'Term assignment NOT YET CONFIRMED from primary paper. ' +
          'May belong to a geometry-correction group or a third additive term.',
      },
      // ── Kühni exponents ─────────────────────────────────────────────────────
      // Identified values (secondary reproduction). Which Ci each ni belongs to
      // is NOT established — confirm term structure from primary paper.
      n1: {
        symbol: 'n1',
        unit: '—',
        description:
          'Kühni regression exponent. Identified value: 0.45 (secondary reproduction). ' +
          'Term assignment NOT YET CONFIRMED. Do not pair with C1 without primary-paper verification.',
      },
      n2: {
        symbol: 'n2',
        unit: '—',
        description:
          'Kühni regression exponent. Identified value: −0.63 (secondary reproduction). ' +
          'Term assignment NOT YET CONFIRMED.',
      },
      n3: {
        symbol: 'n3',
        unit: '—',
        description:
          'Kühni regression exponent. Identified value: −0.38 (secondary reproduction). ' +
          'Term assignment NOT YET CONFIRMED.',
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
        description: 'Continuous-phase (NMP) density at operating temperature',
      },
      rho_d: {
        symbol: 'ρ_d',
        unit: 'kg/m³',
        description: 'Dispersed-phase (RRBO) density at operating temperature',
      },
      epsilon: {
        symbol: 'ε',
        unit: 'W/kg',
        description:
          'Mean specific power dissipation rate per unit liquid mass in the compartment. ' +
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

    // ── Validity range (K&H 1996 Kühni dataset — confirm from Table 1) ───────
    validityRange: {
      epsilon: {
        min: 0.1,
        max: 50,
        unit: 'W/kg',
        note: 'Approximate range of the K&H 1996 Kühni dataset. Confirm exact bounds from Table 1.',
      },
      sigma: {
        min: 0.001,
        max: 0.05,
        unit: 'N/m',
        note: 'Organic–aqueous systems. NMP/RRBO σ must be confirmed within this range.',
      },
      delta_rho: {
        min: 50,
        max: 600,
        unit: 'kg/m³',
        note: 'K&H 1996 database range. Confirm NMP/RRBO Δρ lies within.',
      },
    },

    applicabilityStatus: 'candidate_governed',
    primarySourceVerified: false,            // Not yet read from K&H 1996 primary paper
    secondaryReproductionVerified: true,     // Six parameters traced to secondary peer-reviewed source
    validatedForRRBONMP: false,              // Pilot calibration required

    pilotCalibrationFactor: {
      symbol: 'f_cal_d32',
      description:
        'd_32_design = f_cal_d32 · d_32_KH96. ' +
        'Multiplicative factor applied to the K&H 1996 prediction to correct for ' +
        'the NMP/RRBO fluid system (interfacial rheology, aromatic solute effects). ' +
        'Kept strictly separate from the published equation coefficients — ' +
        'do not modify C1, C2, C3, n1, n2, n3 during calibration.',
      currentValue: 'NOT_YET_CALIBRATED',
      note:
        'f_cal_d32 derived from ECR pilot-plant d₃₂ measurements with actual RRBO/NMP. ' +
        'Until measured, f_cal_d32 = 1.0 (no correction).',
    },

    approvalNote:
      'candidate_governed: six Kühni parameters (C1=3.04 n1=0.45, C2=1.60 n2=−0.63, ' +
      'C3=0.034 n3=−0.38) identified from secondary peer-reviewed reproduction. ' +
      'BEFORE advancing to governed: ' +
      '(1) Read K&H 1996 primary paper (DOI 10.1021/ie950674w), Table 2 — ' +
      '    confirm all six values AND the exact term structure each belongs to. ' +
      '(2) Reconstruct the full Kühni equation with correct geometry groups and ' +
      '    unit conventions — the simplified two-term form must NOT be used. ' +
      '(3) Confirm ECR-2 phase assignment (RRBO dispersed, NMP continuous, d→c) ' +
      '    is consistent with the K&H 1996 phase convention for the Kühni dataset. ' +
      '(4) Set primarySourceVerified = true with engineer name and date. ' +
      '(5) Confirm NMP/RRBO system properties within K&H 1996 validity range. ' +
      'Do NOT implement numerically until governed.',
  },

  // ── 2. Dispersed-phase holdup (φ_d) ──────────────────────────────────────
  //
  // Kumar & Hartland (1995) — Kühni agitated-column parameter set.
  // STATUS: candidate_governed
  //
  // IDENTIFIED KÜHNI CONSTANTS (secondary reproduction — UNASSIGNED TO TERMS):
  //   Eight numerical constants identified from secondary reproduction:
  //     [ 2.67×10⁻², 0.77, 0.64, 20.7, 0.90, −0.34, 2.27, −0.77 ]
  //   secondaryReproductionVerified = true
  //   primarySourceVerified        = false  ← must verify from K&H 1995 primary paper
  //
  // IMPORTANT — DO NOT ASSIGN CONSTANTS TO EQUATION TERMS YET:
  //   The exact Kühni equation form (which of the K&H 1995 representations is used,
  //   how the 8 constants map to C, n, a, b, c, d, e, and any additional terms)
  //   must first be established from the primary paper (DOI: 10.1021/ie00038a032).
  //   The provisional generic equation in this entry must NOT be implemented.
  //
  // DO NOT IMPLEMENT THE PROVISIONAL GENERIC EQUATION BELOW.
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
      'DOI: 10.1021/ie00038a032. ' +
      'Kühni-specific constants: Table [confirm table number from primary paper]. ' +
      'Phase assignment for ECR-2: RRBO dispersed (V_d), NMP continuous (V_c).',

    // ── Equation (PROVISIONAL GENERIC STRUCTURE — DO NOT IMPLEMENT) ─────────
    //
    // K&H 1995 GENERAL APPROACH (from abstract and secondary sources):
    //   Presents an EXPLICIT correlation for φ_d — avoids the need to solve
    //   implicit equations arising from Richardson-Zaki + continuity.
    //
    //   Slip velocity definition (K&H 1995, Eq. 1):
    //     V_slip = V_d / φ_d  +  V_c / (1 − φ_d)
    //
    //   PROVISIONAL generic form for agitated columns:
    //     φ_d / (1 − φ_d)^n = C · V_d^a · (V_c + V_d)^b
    //                          · (ρ_c / Δρ)^c · (μ_c / σ)^d · ε^e
    //
    // IDENTIFIED KÜHNI CONSTANTS (8 values, unassigned to equation terms):
    //   [ 2.67e-2, 0.77, 0.64, 20.7, 0.90, -0.34, 2.27, -0.77 ]
    //   How these 8 values map to (C, n, a, b, c, d, e) and any additional terms
    //   MUST be established from the primary paper before this becomes 'governed'.
    //   The generic form above may have additional terms for the Kühni type.
    //
    // Relationship to d₃₂: K&H 1995 holdup does NOT require d₃₂ as input.
    // Interfacial area computed separately: a = 6·φ_d / d₃₂ (m²/m³).
    //
    equation:
      'PROVISIONAL — DO NOT IMPLEMENT. ' +
      'Identified Kühni constants (unassigned to equation terms, secondary reproduction): ' +
      '[2.67e-2, 0.77, 0.64, 20.7, 0.90, -0.34, 2.27, -0.77]. ' +
      'Provisional generic structure: ' +
      'φ_d / (1−φ_d)^n = C · V_d^a · (V_c+V_d)^b · (ρ_c/Δρ)^c · (μ_c/σ)^d · ε^e ' +
      '| V_slip = V_d/φ_d + V_c/(1−φ_d) [K&H 1995, Eq. 1] ' +
      '| Exact Kühni form and term assignments must be read from K&H 1995 primary paper ' +
      '  (DOI: 10.1021/ie00038a032) before any numerical use. ' +
      '| Phase (ECR-2): V_d = RRBO superficial velocity, V_c = NMP superficial velocity.',

    // ── Symbol definitions ──────────────────────────────────────────────────
    variables: {
      phi_d: {
        symbol: 'φ_d',
        unit: '—',
        description: 'Dispersed-phase holdup (volume fraction). In ECR-2: RRBO is the dispersed phase.',
      },
      unassigned_kuhni_constants: {
        symbol: '[k1…k8]',
        unit: 'various',
        description:
          'Eight Kühni-specific constants identified from secondary reproduction: ' +
          '[2.67e-2, 0.77, 0.64, 20.7, 0.90, -0.34, 2.27, -0.77]. ' +
          'Term assignment (which maps to C, n, a, b, c, d, e, and any additional terms) ' +
          'must be established from K&H 1995 primary paper (DOI: 10.1021/ie00038a032). ' +
          'Do not assign to equation terms until confirmed.',
      },
      V_slip: {
        symbol: 'V_slip',
        unit: 'm/s',
        description:
          'Slip velocity. Definition (K&H 1995, Eq. 1): V_slip = V_d/φ_d + V_c/(1−φ_d). ' +
          'Both V_d and V_c are positive superficial velocities (m/s).',
      },
      V_d: {
        symbol: 'V_d',
        unit: 'm/s',
        description:
          'Dispersed-phase superficial velocity = Q_RRBO / A_col in ECR-2. ' +
          'RRBO is the dispersed phase in ECR-2.',
      },
      V_c: {
        symbol: 'V_c',
        unit: 'm/s',
        description:
          'Continuous-phase superficial velocity = Q_NMP / A_col in ECR-2. ' +
          'NMP is the continuous phase in ECR-2.',
      },
      rho_c: {
        symbol: 'ρ_c',
        unit: 'kg/m³',
        description: 'Continuous-phase (NMP) density at operating temperature',
      },
      delta_rho: {
        symbol: 'Δρ',
        unit: 'kg/m³',
        description: 'Absolute density difference |ρ_NMP − ρ_RRBO|',
      },
      mu_c: {
        symbol: 'μ_c',
        unit: 'Pa·s',
        description: 'Continuous-phase (NMP) dynamic viscosity',
      },
      sigma: {
        symbol: 'σ',
        unit: 'N/m',
        description: 'NMP/RRBO interfacial tension at operating temperature',
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
          'Flooding occurs as φ_d → φ_d_flood; flooding margin must be monitored separately.',
      },
      V_d: {
        min: 0.0005,
        max: 0.025,
        unit: 'm/s',
        note: 'Approximate range of K&H 1995 Kühni dataset. Confirm exact bounds from primary paper.',
      },
      V_c: {
        min: 0.0005,
        max: 0.025,
        unit: 'm/s',
        note: 'Approximate range. Confirm from primary paper.',
      },
      epsilon: {
        min: 0.05,
        max: 50,
        unit: 'W/kg',
        note: 'Agitated-column range. Confirm Kühni subset bounds from primary paper.',
      },
    },

    applicabilityStatus: 'candidate_governed',
    primarySourceVerified: false,            // Must be set to true after reading K&H 1995
    secondaryReproductionVerified: true,     // 8 constants traced to secondary peer-reviewed source
    validatedForRRBONMP: false,              // Pilot calibration required

    pilotCalibrationFactor: {
      symbol: 'f_cal_phi',
      description:
        'φ_d_design = f_cal_phi · φ_d_KH95. ' +
        'Multiplicative factor applied to the K&H 1995 prediction to correct for ' +
        'NMP/RRBO-specific coalescence behaviour (interfacial rheology, aromatic solute effects). ' +
        'Kept strictly separate from the published correlation constants — ' +
        'do not modify the 8 identified Kühni constants during calibration.',
      currentValue: 'NOT_YET_CALIBRATED',
      note:
        'f_cal_phi derived from ECR pilot-plant holdup measurements with actual RRBO/NMP. ' +
        'Until measured, f_cal_phi = 1.0 (no correction).',
    },

    approvalNote:
      'candidate_governed: 8 Kühni constants identified from secondary peer-reviewed ' +
      'reproduction [2.67e-2, 0.77, 0.64, 20.7, 0.90, -0.34, 2.27, -0.77]. ' +
      'BEFORE advancing to governed: ' +
      '(1) Read K&H 1995 primary paper (DOI 10.1021/ie00038a032) and identify the ' +
      '    exact Kühni equation form — confirm whether the φ_d/(1−φ_d)^n structure ' +
      '    or an alternative representation is used for Kühni. ' +
      '(2) Assign each of the 8 constants to its exact term in the equation; ' +
      '    confirm units and dimensional consistency of every group. ' +
      '(3) Verify the validity range (V_d, V_c, ε, σ, Δρ) covers ECR-2 envelope. ' +
      '(4) Confirm ECR-2 phase convention (RRBO=dispersed, NMP=continuous) matches ' +
      '    the K&H 1995 Kühni dataset dispersed-phase convention. ' +
      '(5) Set primarySourceVerified = true with engineer name and date. ' +
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
