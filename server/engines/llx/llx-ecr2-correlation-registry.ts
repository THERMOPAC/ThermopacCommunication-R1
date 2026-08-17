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
 *  governed                  — Equation frozen, coefficients verified from primary source,
 *                             explicitly approved for use in ECR-2 calculations.
 *
 *  secondary_equation_verified — Equation form and all constants traced to a peer-reviewed
 *                             secondary source that explicitly cites and reproduces the primary.
 *                             Dimensional verification complete. ALL symbol assignments resolved
 *                             in the secondary source. Equation is accepted for CONTROLLED
 *                             implementation (i.e. the engine may call it behind a governance
 *                             guard), but primarySourceVerified must still be set to true before
 *                             the result may be used for design decisions.
 *
 *  candidate_governed        — Equation reproduced from a secondary source; symbol assignments
 *                             and/or dimensional groupings contain UNRESOLVED items that must be
 *                             cleared from the primary paper before any numerical use.
 *                             Do NOT implement numerically until UNRESOLVED flags are removed and
 *                             status advances.
 *
 *  pending_approval          — No candidate equation nominated yet. Placeholder only.
 *
 *  reserved                  — Architectural slot; correlation category needed in Phase 3+
 *                             but no candidate nominated and not required now.
 */
export type CorrelationStatus =
  | 'governed'
  | 'secondary_equation_verified'
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
  // Kumar & Hartland (1996) — Kühni column, Eq. (3) as reproduced in
  // Laitinen et al. (2019), Chem. Eng. Res. Des., 146, 518–527.
  // STATUS: candidate_governed
  //
  // EQUATION NOW DOCUMENTED from peer-reviewed secondary reproduction.
  // Do NOT implement numerically — status remains candidate_governed.
  //
  // ── Full Kühni parameter table — secondary-verified metadata ─────────────
  //   Source: general structure of K&H unified correlations; specific coefficient
  //   table reproduced in prior secondary reproduction and accepted as metadata.
  //   These values are NOT yet placed into the equation with confidence — see
  //   UNRESOLVED flags below.
  //
  //   C1(c→d) = 1      (transfer direction: continuous to dispersed)
  //   C1(d→c) = 3.04   (transfer direction: dispersed to continuous — ECR-2 direction)
  //   C2      = 1.60
  //   C3      = 0.034
  //   n1      = 0.45
  //   n2      = −0.63
  //   n3      = −0.38
  //
  //   ECR-2 phase convention: mass transfer is d→c (RRBO→NMP), so C1=3.04 applies.
  //   How C1 enters the equation structure must be resolved from K&H 1996 primary.
  //
  // ── UNRESOLVED items requiring primary-paper resolution ───────────────────
  //   (a) UNRESOLVED_SYMBOL: numerator symbol in "?^0.45".
  //       Laitinen Eq. (3) renders the numerator as a single-character symbol
  //       raised to exponent n1=0.45. Identity is UNRESOLVED.
  //       Do NOT assume it is Euler's constant e ≈ 2.71828 — this is NOT confirmed.
  //       Candidate interpretations (none adopted):
  //         · mathematical constant e (dimensionless prefactor e^0.45 ≈ 1.568)
  //         · C1 (from the Kühni table above, e.g. 3.04^0.45)
  //         · another fluid/geometry variable
  //       Must be read from K&H 1996 primary paper, Table 2 / equation body.
  //   (b) UNRESOLVED_GROUPING: h-group in Term₂: "h·(ρcg/γ)^0.38".
  //       As written, ρcg/γ has units m⁻², so (ρcg/γ)^0.38 has units m⁻⁰·⁷⁶,
  //       and h·m⁻⁰·⁷⁶ has units m^+0.24 — NOT dimensionless.
  //       Dimensionally consistent candidate: (h²·ρcg/γ)^0.38 = Eo^0.38.
  //       Exact grouping MUST be confirmed from K&H 1996 primary paper.
  //   (c) C1=3.04 assignment: NOT visibly assigned in the Laitinen Eq. (3)
  //       rendering. May be: numerator coefficient, absorbed factor, or other.
  //       Resolve from K&H 1996 primary paper Table 2.
  //   (d) K&H 1996 fit: 702 data points, average relative deviation 22%.
  //       Laitinen reports significant deviance vs their 2MTHF/water measurements,
  //       attributing it to experimental limitations in quantifying coalescence.
  //
  // PHASE ASSIGNMENT (ECR-2 specific):
  //   RRBO = DISPERSED phase  (light, upward)
  //   NMP  = CONTINUOUS phase (heavy, downward)
  //   Confirm K&H 1996 dataset phase convention before implementation.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'ecr2_d32_kh1996',
    quantity: 'droplet_size',
    name: 'Kühni Column d₃₂ — Kumar & Hartland (1996), Kühni parameter set',

    source:
      'Kumar, A. & Hartland, S. (1996). ' +
      '"Unified Correlations for the Prediction of Drop Size in Liquid−Liquid Extraction Columns." ' +
      'Industrial & Engineering Chemistry Research, 35(8), 2682–2695. DOI: 10.1021/ie950674w. ' +
      'K&H fitted 702 data points; reported average relative deviation 22%. ' +
      'Equation reproduced as Eq. (3) in: ' +
      'Laitinen, A. et al. (2019). "Axial Dispersion and CFD Models for the Extraction of ' +
      'Levulinic Acid from Dilute Aqueous Solution in a Kühni Column with 2-Methyltetrahydrofuran Solvent." ' +
      'Chemical Engineering Research and Design, 146, 518–527. DOI: 10.1016/j.cherd.2019.04.018.',

    // ── Equation — reproduced from Laitinen et al. (2019), Eq. (3) ──────────
    //
    // Exact transcription from secondary source (Laitinen 2019, p. 10):
    //
    //   d₃₂ / h  =  e^0.45 / [ Term₁ + Term₂ ]
    //
    //   Term₁ = 1.6 · (γ / ((ρc − ρd) · g · h²))^(1/2)
    //
    //   Term₂ = 0.034 · ((ψ/g) · (ρc/(g·γ))^(1/4))^(−0.63) · (h · (ρcg/γ)^0.38)^(−1)
    //
    // Symbol map (Laitinen 2019 nomenclature):
    //   d₃₂   Sauter mean droplet diameter     [m]
    //   h      compartment height               [m]
    //   e      see note (a) above — mathematical constant (≈2.71828) or ε/ψ
    //   γ      interfacial tension              [N m⁻¹ = kg s⁻²]
    //   ρc     continuous-phase density         [kg m⁻³]
    //   ρd     dispersed-phase density          [kg m⁻³]
    //   g      gravitational acceleration       [m s⁻²]
    //   ψ      mechanical power dissipation
    //          per unit mass                    [W kg⁻¹ = m² s⁻³]
    //
    // Dimensional status:
    //   Term₁: 1.6·(γ/((ρc−ρd)·g·h²))^0.5
    //          → γ/((ρc−ρd)·g·h²) = [kg/s²]/[kg/s²] = dimensionless ✓
    //          → Term₁ dimensionless ✓
    //   Term₂: h·(ρcg/γ)^0.38 — UNRESOLVED_GROUPING; see (b) above.
    //   Numerator: [UNRESOLVED_SYMBOL]^0.45 — base identity NOT resolved.
    //              DO NOT assume mathematical constant e ≈ 2.71828.
    //
    // DO NOT IMPLEMENT. Equation reproduced for engineering review only.
    // Both UNRESOLVED flags must be cleared from K&H 1996 primary paper
    // before any numerical implementation.
    //
    equation:
      'CANDIDATE — DO NOT IMPLEMENT. ' +
      'Reproduced from Laitinen et al. (2019) Eq. (3). ' +
      'd32/h = [UNRESOLVED_SYMBOL]^0.45 / [1.6·(γ/((ρc−ρd)·g·h²))^(1/2) + ' +
      '0.034·((ψ/g)·(ρc/(g·γ))^(1/4))^(−0.63)·[UNRESOLVED_GROUPING: h·(ρcg/γ)^0.38]^(−1)] ' +
      '| UNRESOLVED_SYMBOL: numerator base for exponent 0.45 is a single-character symbol in ' +
      '  Laitinen Eq. (3) whose identity is NOT confirmed. ' +
      '  DO NOT interpret as Euler\'s constant e ≈ 2.71828 — this is not verified. ' +
      '  Must be read from K&H 1996 primary paper (DOI 10.1021/ie950674w), Table 2 / equation body. ' +
      '| UNRESOLVED_GROUPING: h-term in Term₂ written as "h·(ρcg/γ)^0.38" has units m^+0.24 ' +
      '  (not dimensionless). Consistent form is (h²·ρcg/γ)^0.38 = Eo^0.38 — confirm from K&H 1996. ' +
      '| KÜHNI PARAMETER TABLE (secondary-verified metadata): ' +
      '  C1(c→d)=1, C1(d→c)=3.04, C2=1.60, C3=0.034, n1=0.45, n2=−0.63, n3=−0.38. ' +
      '  ECR-2 direction is d→c, so C1=3.04. Placement in equation structure UNRESOLVED. ' +
      '| C1=3.04 not visibly assigned in Laitinen Eq. (3) rendering — confirm from K&H 1996 Table 2.',

    // ── Variable definitions ─────────────────────────────────────────────────
    variables: {
      d_32: {
        symbol: 'd₃₂',
        unit: 'm',
        description:
          'Sauter mean droplet diameter (volume-to-surface mean diameter). ' +
          'Left-hand side variable: d₃₂/h is the dimensionless ratio.',
      },
      h: {
        symbol: 'h',
        unit: 'm',
        description:
          'Compartment height — centre-to-centre spacing between rotor planes. ' +
          'Normalisation length for d₃₂ on the LHS. ' +
          'Also appears in Term₂ as part of a geometry group — exact grouping TBD (see note b).',
      },
      e_numerator: {
        symbol: '[UNRESOLVED_SYMBOL]',
        unit: '—',
        description:
          'UNRESOLVED_SYMBOL: numerator base for exponent n1=0.45 in Laitinen Eq. (3). ' +
          'Laitinen\'s PDF renders a single-character symbol raised to 0.45 in the numerator. ' +
          'Identity is NOT resolved — do NOT assume Euler\'s constant e ≈ 2.71828. ' +
          'Candidate interpretations (none adopted until primary paper read): ' +
          '  · Mathematical constant e (dimensionless: e^0.45 ≈ 1.568) — NOT confirmed. ' +
          '  · C1 from the Kühni parameter table (e.g. 3.04^0.45 for d→c) — NOT confirmed. ' +
          '  · Another fluid or geometry variable — NOT confirmed. ' +
          'Must be identified from K&H 1996 primary paper (DOI 10.1021/ie950674w), ' +
          'Table 2 and/or the equation body. ' +
          'DO NOT IMPLEMENT until symbol identity is confirmed and UNRESOLVED_SYMBOL is removed.',
      },
      kuhni_param_table: {
        symbol: 'C1, C2, C3, n1, n2, n3',
        unit: '—',
        description:
          'Full Kühni parameter table from the K&H unified correlation framework. ' +
          'Secondary-verified metadata — recorded from prior secondary reproduction. ' +
          'These values are accepted as the numerical targets but their placement in ' +
          'the equation structure remains UNRESOLVED pending K&H 1996 primary paper. ' +
          '' +
          'Table: ' +
          '  C1(c→d) = 1       [transfer from continuous to dispersed phase] ' +
          '  C1(d→c) = 3.04    [transfer from dispersed to continuous phase — ECR-2 direction] ' +
          '  C2      = 1.60    [visible in Laitinen Eq. (3): Term₁ coefficient, confirmed] ' +
          '  C3      = 0.034   [visible in Laitinen Eq. (3): Term₂ coefficient, confirmed] ' +
          '  n1      = 0.45    [exponent on UNRESOLVED_SYMBOL in numerator] ' +
          '  n2      = −0.63   [exponent on agitation group in Term₂, confirmed] ' +
          '  n3      = −0.38   [exponent magnitude for h-group, inner sign; outer −1 supplies −] ' +
          '' +
          'ECR-2 operates in d→c direction (RRBO→NMP), so C1=3.04 applies. ' +
          'C2=1.60 and C3=0.034 are positionally confirmed in Laitinen Eq. (3). ' +
          'C1 placement in the equation is UNRESOLVED (see UNRESOLVED_SYMBOL note above). ' +
          'Do NOT use these constants in a numerical implementation until all UNRESOLVED ' +
          'flags are cleared from the primary paper.',
      },
      gamma: {
        symbol: 'γ',
        unit: 'N m⁻¹',
        description:
          'Liquid–liquid interfacial tension at operating temperature. ' +
          'SI: [N/m] = [kg/s²]. Must be in SI — do not use mN/m. ' +
          'For ECR-2: NMP/RRBO interfacial tension at column operating temperature.',
      },
      rho_c: {
        symbol: 'ρc',
        unit: 'kg m⁻³',
        description:
          'Continuous-phase density. In ECR-2: NMP is the continuous phase. ' +
          'Confirm that K&H 1996 Kühni dataset also uses aqueous/heavy phase as continuous.',
      },
      rho_d: {
        symbol: 'ρd',
        unit: 'kg m⁻³',
        description:
          'Dispersed-phase density. In ECR-2: RRBO is the dispersed phase (light, upward-flowing).',
      },
      g: {
        symbol: 'g',
        unit: 'm s⁻²',
        description: 'Standard gravitational acceleration. Value: 9.80665 m/s².',
      },
      psi: {
        symbol: 'ψ',
        unit: 'W kg⁻¹',
        description:
          'Mechanical power dissipation per unit mass of liquid in the compartment. ' +
          'ψ = N_P · N³ · D_R⁵ / (A_col · h) where N = rotor speed [rev/s]. ' +
          'Same physical quantity as ε used in other references. ' +
          'SI: [W/kg] = [m²/s³].',
      },
      N_P: {
        symbol: 'N_P',
        unit: '—',
        description:
          'Rotor power number (dimensionless). ' +
          'Must be sourced from Kühni rotor geometry data or a separate validated correlation.',
      },
      N_rot: {
        symbol: 'N',
        unit: 'rev s⁻¹',
        description: 'Rotor rotational speed: N = RPM / 60.',
      },
      D_R: {
        symbol: 'D_R',
        unit: 'm',
        description: 'Rotor disc diameter.',
      },
      A_col: {
        symbol: 'A_col',
        unit: 'm²',
        description: 'Column internal cross-sectional area = π·D²/4.',
      },
      // ── Term₁ group: γ/((ρc−ρd)·g·h²) ──────────────────────────────────
      // Dimensional check: [kg/s²]/([kg/m³]·[m/s²]·[m²]) = [kg/s²]/[kg/s²] = dimensionless ✓
      // This is the reciprocal of the Eötvös number Eo = (ρc−ρd)·g·h²/γ.
      Eo_inv: {
        symbol: 'γ/((ρc−ρd)·g·h²)',
        unit: '—',
        description:
          'Inverse Eötvös number with compartment height h as the characteristic length. ' +
          'Dimensionless: [kg/s²]/[kg/s²] = 1. ' +
          'Captures the balance between interfacial tension and buoyancy forces ' +
          'at the compartment scale.',
      },
      // ── Term₂ inner groups ───────────────────────────────────────────────
      // Group 1: (ψ/g)·(ρc/(gγ))^(1/4) — dimensional check:
      //   ψ/g = [m²/s³]/[m/s²] = [m/s]
      //   ρc/(gγ) = [kg/m³]/([m/s²·kg/s²]) = [kg/m³]/[kg·m/s⁴] = s⁴/m⁴ ... units of s^4/m^4
      //   (ρc/(gγ))^(1/4) = s/m
      //   Product: [m/s]·[s/m] = dimensionless ✓
      psi_group: {
        symbol: '(ψ/g)·(ρc/(g·γ))^(1/4)',
        unit: '—',
        description:
          'Dimensionless agitation group combining power dissipation with fluid properties. ' +
          'Dimensional verification: (ψ/g)[m/s] × (ρc/(gγ))^0.25[s/m] = dimensionless ✓. ' +
          'Raised to exponent −0.63 in Term₂.',
      },
      // Group 2: h·(ρcg/γ)^0.38 — UNRESOLVED_GROUPING:
      //   ρcg/γ = [kg/(m²·s²)]/[kg/s²] = 1/m² — has units m⁻²
      //   (ρcg/γ)^0.38 has units m⁻⁰·⁷⁶
      //   h·m⁻⁰·⁷⁶ has units m^+0.24 — NOT dimensionless.
      //   Dimensionally consistent candidate: (h²·ρcg/γ)^0.38 = Eo^0.38 (dimensionless)
      //   Primary paper must resolve exact grouping before any numerical use.
      h_group: {
        symbol: '[UNRESOLVED_GROUPING: h·(ρcg/γ)^0.38]',
        unit: 'm^0.24 [DIMENSIONAL INCONSISTENCY — grouping UNRESOLVED]',
        description:
          'UNRESOLVED_GROUPING: geometry-property group from Term₂ of Laitinen Eq. (3). ' +
          'As transcribed from Laitinen: h·(ρcg/γ)^0.38. ' +
          'Dimensional issue: ρcg/γ = m⁻², so (ρcg/γ)^0.38 has units m⁻⁰·⁷⁶, ' +
          'and h·m⁻⁰·⁷⁶ gives units m^+0.24 — NOT dimensionless. ' +
          'Dimensionally consistent candidate grouping: (h²·ρcg/γ)^0.38 = Eo^0.38 (dimensionless). ' +
          'Exponent magnitude |n3|=0.38 is secondary-verified from Kühni parameter table (n3=−0.38, ' +
          'with the outer ^(−1) in Term₂ supplying the sign). ' +
          'Exact grouping of the h-term MUST be confirmed from K&H 1996 primary paper. ' +
          'DO NOT IMPLEMENT until UNRESOLVED_GROUPING is cleared.',
      },
      // ── Positionally confirmed coefficients and Kühni table ──────────────
      // C2=1.60 and C3=0.034 are visible at confirmed positions in Laitinen Eq. (3).
      // C1=3.04 assignment remains UNRESOLVED — see C1_unresolved entry below.
      // Full parameter table stored in kuhni_param_table variable above.
      coeff_1pt6: {
        symbol: '1.6',
        unit: '—',
        description:
          'Coefficient in Term₁ of denominator. ' +
          'Corresponds to C2=1.60 from prior secondary reproduction. ' +
          'Multiplies (inverse Eo)^0.5.',
      },
      coeff_0pt034: {
        symbol: '0.034',
        unit: '—',
        description:
          'Coefficient in Term₂ of denominator. ' +
          'Corresponds to C3=0.034 from prior secondary reproduction. ' +
          'Multiplies the combined agitation-geometry group.',
      },
      exp_0pt45: {
        symbol: '0.45',
        unit: '—',
        description:
          'Exponent n1=0.45 applied to the UNRESOLVED_SYMBOL in the numerator. ' +
          'Value n1=0.45 is secondary-verified from the Kühni parameter table. ' +
          'The base to which 0.45 is applied is UNRESOLVED — see e_numerator and kuhni_param_table entries.',
      },
      exp_neg0pt63: {
        symbol: '−0.63',
        unit: '—',
        description:
          'Exponent on the agitation group (ψ/g)·(ρc/(gγ))^0.25 in Term₂. ' +
          'Corresponds to n2=−0.63 from prior secondary reproduction.',
      },
      exp_0pt38: {
        symbol: '0.38',
        unit: '—',
        description:
          'Exponent on the h-group in Term₂ (inside the (...)^(−1) factor). ' +
          'Corresponds to |n3|=0.38 (n3=−0.38) from prior secondary reproduction. ' +
          'Sign: the entire h-group is raised to (−1) in Term₂, so n3=−0.38 maps to ' +
          'a positive inner exponent of 0.38 with the outer −1 supplying the sign.',
      },
      C1_unresolved: {
        symbol: 'C1=3.04',
        unit: '—',
        description:
          'Kühni coefficient C1(d→c)=3.04 from the secondary-verified parameter table ' +
          '(see kuhni_param_table entry). ECR-2 direction is d→c so C1=3.04 applies. ' +
          'NOT visibly assigned in the Laitinen Eq. (3) rendering. ' +
          'Possible placements (none confirmed): ' +
          '  (a) coefficient on the UNRESOLVED_SYMBOL in the numerator ' +
          '      (i.e., numerator = C1·[symbol]^n1 or numerator = C1^n1), ' +
          '  (b) normalisation factor absorbed into the equation structure, ' +
          '  (c) numerator IS C1^n1 = 3.04^0.45 directly (no separate base symbol). ' +
          'All three interpretations remain UNRESOLVED. ' +
          'Resolve from K&H 1996 primary paper Table 2 and equation body.',
      },
    },

    // ── Validity ranges ──────────────────────────────────────────────────────
    // From Laitinen (2019) and K&H 1996 secondary sources.
    // Confirm exact bounds from K&H 1996 Table 1 (or equivalent).
    validityRange: {
      psi: {
        min: 0.1,
        max: 50,
        unit: 'W/kg',
        note:
          'Approximate range of K&H 1996 mechanically agitated column dataset. ' +
          'Confirm Kühni subset from primary paper. ' +
          'Laitinen column: h=30mm, D_R=48mm, D=60mm, N=100–150 rpm.',
      },
      gamma: {
        min: 0.001,
        max: 0.045,
        unit: 'N/m',
        note:
          'Organic–aqueous systems. Laitinen: γ=3.50 mN/m (2MTHF/water). ' +
          'NMP/RRBO interfacial tension must be measured and confirmed within this range.',
      },
      delta_rho: {
        min: 50,
        max: 600,
        unit: 'kg/m³',
        note:
          'K&H 1996 database range. Laitinen: Δρ=143 kg/m³ (water/2MTHF). ' +
          'Confirm NMP/RRBO Δρ lies within.',
      },
      d_32: {
        min: 0.0003,
        max: 0.005,
        unit: 'm',
        note:
          'Approximate Kühni dataset range (0.3–5 mm). ' +
          'Laitinen measured 0.51–0.65 mm at 100–150 rpm for 2MTHF/water. ' +
          'Expected range for NMP/RRBO system must be verified.',
      },
    },

    applicabilityStatus: 'candidate_governed',
    primarySourceVerified: false,          // K&H 1996 primary paper not yet inspected
    secondaryReproductionVerified: true,   // Equation reproduced from Laitinen et al. (2019) — peer-reviewed
    validatedForRRBONMP: false,            // Pilot calibration required for NMP/RRBO

    pilotCalibrationFactor: {
      symbol: 'f_cal_d32',
      description:
        'd₃₂_design = f_cal_d32 · d₃₂_KH96. ' +
        'Multiplicative correction factor for NMP/RRBO fluid system applied AFTER ' +
        'the published equation is evaluated. ' +
        'Kept strictly separate from the equation constants (1.6, 0.034, exponents). ' +
        'Do NOT modify equation constants during pilot calibration.',
      currentValue: 'NOT_YET_CALIBRATED',
      note:
        'f_cal_d32 derived from ECR pilot-plant d₃₂ measurements (RRBO feed + NMP solvent). ' +
        'Until measured: f_cal_d32 = 1.0 (no correction applied).',
    },

    approvalNote:
      'candidate_governed: equation reproduced from Laitinen et al. (2019), Eq. (3) — ' +
      'peer-reviewed secondary source using K&H 1996. secondaryReproductionVerified=true. ' +
      'TWO UNRESOLVED FLAGS BLOCK ADVANCEMENT: ' +
      '  UNRESOLVED_SYMBOL: identity of the numerator base (raised to exponent n1=0.45) ' +
      '    is not confirmed. DO NOT interpret as Euler\'s constant e ≈ 2.71828 — not verified. ' +
      '    Candidates: mathematical constant e, C1^n1, or another variable. None adopted. ' +
      '  UNRESOLVED_GROUPING: h-term in Term₂ transcribed as h·(ρcg/γ)^0.38 is dimensionally ' +
      '    inconsistent (m^+0.24). Consistent form is (h²·ρcg/γ)^0.38 = Eo^0.38. Not confirmed. ' +
      'FULL Kühni parameter table now recorded as secondary-verified metadata: ' +
      '  C1(c→d)=1, C1(d→c)=3.04, C2=1.60, C3=0.034, n1=0.45, n2=−0.63, n3=−0.38. ' +
      'BEFORE advancing to governed: ' +
      '(1) Read K&H 1996 primary paper (DOI 10.1021/ie950674w). ' +
      '    Clear UNRESOLVED_SYMBOL: identify numerator base and confirm C1 placement. ' +
      '    Clear UNRESOLVED_GROUPING: confirm exact h-term grouping in Term₂. ' +
      '(2) Set primarySourceVerified = true with engineer name and date. ' +
      '(3) Confirm K&H 1996 Kühni experimental dataset phase convention ' +
      '    matches ECR-2 phase assignment (RRBO dispersed, NMP continuous). ' +
      '(4) Verify NMP/RRBO system properties (γ, Δρ, ρc, ρd) lie within validity range. ' +
      'DO NOT IMPLEMENT NUMERICALLY until both UNRESOLVED flags are cleared and status is governed.',
  },

  // ── 2. Dispersed-phase holdup (φ_d) ──────────────────────────────────────
  //
  // Kumar & Hartland (1995) — Kühni agitated-column parameter set.
  // Equations (1) and (2) as reproduced in Laitinen et al. (2019),
  // Chem. Eng. Res. Des., 146, 518–527, DOI 10.1016/j.cherd.2019.04.018.
  // STATUS: candidate_governed
  //
  // ALL EIGHT KÜHNI CONSTANTS ARE NOW ASSIGNED to exact equation terms.
  // Do NOT implement numerically — status remains candidate_governed.
  //
  // LAITINEN VALIDATION (2MTHF/water system, Kühni ECR60/50G, T=298K):
  //   Relative deviation: 11.2% (vs K&H 1995 reported 13% for 75mm column).
  //   Laitinen reports the correlation predicts holdup "reasonably well at
  //   100 and 125 rpm especially at the lower S/F ratio; larger deviation at 150 rpm."
  //   K&H 1995 reported average deviation 21% over all column types.
  //
  // PHASE CONVENTION (ECR-2):
  //   Ud = dispersed-phase superficial velocity = Q_RRBO / A_col  [RRBO upward]
  //   Uc = continuous-phase superficial velocity = Q_NMP / A_col  [NMP downward]
  //   Confirm K&H 1995 Kühni experimental dataset uses same phase convention.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'ecr2_holdup_kh1995',
    quantity: 'holdup',
    name: 'Kühni Column φ — Kumar & Hartland (1995), agitated-column holdup',

    source:
      'Kumar, A. & Hartland, S. (1995). ' +
      '"A Unified Correlation for the Prediction of Dispersed-Phase Hold-Up ' +
      'in Liquid-Liquid Extraction Columns." ' +
      'Industrial & Engineering Chemistry Research, 34(11), 3925–3940. ' +
      'DOI: 10.1021/ie00038a032. ' +
      'K&H reported avg. absolute relative deviation: 13% for 75mm Kühni; 21% all data. ' +
      'Equations reproduced as Eqs (1) and (2) in: ' +
      'Laitinen, A. et al. (2019). "Axial Dispersion and CFD Models for the Extraction of ' +
      'Levulinic Acid from Dilute Aqueous Solution in a Kühni Column with 2-Methyltetrahydrofuran Solvent." ' +
      'Chemical Engineering Research and Design, 146, 518–527. DOI: 10.1016/j.cherd.2019.04.018. ' +
      'Laitinen validation: 11.2% relative deviation for 2MTHF/water at 298 K.',

    // ── Equations — exact reproduction from Laitinen et al. (2019), Eqs (1)–(2) ──
    //
    //  Eq. (1) — dispersed-phase holdup φ:
    //
    //   φ = [ 2.67×10⁻² + (ψθ/g)^0.77 ] · (Ud·θ)^0.64 · exp(20.7·Uc·θ)^0.90
    //       · ((ρc − ρd)/ρc)^(−0.34) · 2.27 · xf^(−0.77)
    //
    //  Eq. (2) — characteristic time-length scale θ:
    //
    //   θ = (ρc / (g · γ))^0.25
    //
    //  where the Laitinen (2019) nomenclature is:
    //   φ      hold-up (dispersed phase volume fraction)      [—]
    //   ψ      mechanical power dissipation per unit mass     [W kg⁻¹]
    //   g      gravitational acceleration                     [m s⁻²]
    //   Ud     dispersed-phase superficial velocity           [m s⁻¹]
    //   Uc     continuous-phase superficial velocity          [m s⁻¹]
    //   ρc     continuous-phase density                       [kg m⁻³]
    //   ρd     dispersed-phase density                        [kg m⁻³]
    //   xf     fractional free column cross-sectional area    [—]
    //   γ      interfacial tension                            [N m⁻¹]
    //   θ      derived characteristic scale = (ρc/(gγ))^0.25 [s m⁻¹]
    //
    //  ── Assignment of all eight Kühni constants ──────────────────────────
    //   2.67×10⁻²  additive constant inside the first bracket [ ] in Eq. (1)
    //   0.77        exponent on (ψθ/g)
    //   0.64        exponent on (Ud·θ)
    //   20.7        linear coefficient inside exp argument: exp(20.7·Uc·θ)
    //   0.90        exponent on the entire exp(…) factor: [exp(20.7·Uc·θ)]^0.90
    //   −0.34       exponent on ((ρc − ρd)/ρc)
    //   2.27        multiplicative coefficient on xf^(−0.77)
    //   −0.77       exponent on xf
    //
    //  ── Dimensional verification of θ ────────────────────────────────────
    //   θ = (ρc/(gγ))^0.25
    //   ρc: kg/m³,  g: m/s²,  γ: N/m = kg/s²
    //   ρc/(gγ) = [kg/m³]/([m/s²]·[kg/s²]) = [kg/m³]/[kg·m/s⁴] = s⁴/m⁴
    //   θ = (s⁴/m⁴)^0.25 = s/m  ✓
    //   Ud·θ = [m/s]·[s/m] = dimensionless ✓
    //   Uc·θ = [m/s]·[s/m] = dimensionless ✓
    //   ψθ/g = [W/kg]·[s/m]/[m/s²] = [m²/s³]·[s/m]/[m/s²]
    //        = [m/s²]/[m/s²] = dimensionless ✓
    //
    //  ── Physical structure of Eq. (1) ────────────────────────────────────
    //   The equation is fully explicit in φ — no iteration required.
    //   The first bracket [2.67×10⁻² + (ψθ/g)^0.77] adds a base holdup constant
    //   to an agitation-driven term: at ψ→0 the bracket → 2.67×10⁻² (minimum
    //   holdup), at high ψ the agitation term dominates.
    //   The (Ud·θ)^0.64 factor: holdup increases with dispersed-phase throughput.
    //   The exp(20.7·Uc·θ)^0.90 factor: holdup decreases with continuous-phase
    //   throughput (increased Uc flushes drops upward faster, reducing inventory).
    //   The ((ρc−ρd)/ρc)^(−0.34) factor: smaller density difference → more holdup.
    //   The 2.27·xf^(−0.77) factor: smaller free area (more restricted stator) → more holdup.
    //
    equation:
      'CANDIDATE — DO NOT IMPLEMENT. ' +
      'Reproduced from Laitinen et al. (2019) Eqs (1) and (2). ' +
      'Eq.(1): φ = [2.67e-2 + (ψθ/g)^0.77]·(Ud·θ)^0.64·[exp(20.7·Uc·θ)]^0.90' +
      '·((ρc−ρd)/ρc)^(−0.34)·2.27·xf^(−0.77) ' +
      'Eq.(2): θ = (ρc/(g·γ))^0.25  [s/m — dimensionless products Ud·θ, Uc·θ, ψθ/g ✓] ' +
      '| ECR-2: Ud=Q_RRBO/A_col [dispersed], Uc=Q_NMP/A_col [continuous] ' +
      '| All constants now assigned — see variables section.',

    // ── Symbol definitions ──────────────────────────────────────────────────
    variables: {
      phi: {
        symbol: 'φ',
        unit: '—',
        description:
          'Dispersed-phase holdup (volume fraction of dispersed phase in the column). ' +
          'In ECR-2: RRBO is the dispersed phase. ' +
          'φ is the LHS of Laitinen Eq. (1) — computed directly, no iteration.',
      },
      theta: {
        symbol: 'θ',
        unit: 's m⁻¹',
        description:
          'Characteristic time-length scale defined by Laitinen Eq. (2): θ = (ρc/(g·γ))^0.25. ' +
          'Dimensional verification: (s⁴/m⁴)^0.25 = s/m ✓. ' +
          'Makes Ud·θ, Uc·θ, and ψθ/g dimensionless. ' +
          'This group is determined entirely by continuous-phase properties and ' +
          'interfacial tension — it is constant along the column at fixed temperature.',
      },
      psi: {
        symbol: 'ψ',
        unit: 'W kg⁻¹',
        description:
          'Mechanical power dissipation per unit mass of liquid in the compartment. ' +
          'SI: [W/kg] = [m²/s³]. ' +
          'For Kühni: ψ = N_P · N³ · D_R⁵ / (A_col · h) where N = rotor speed [rev/s]. ' +
          'N_P is the rotor power number — must be sourced from geometry data.',
      },
      g: {
        symbol: 'g',
        unit: 'm s⁻²',
        description: 'Standard gravitational acceleration: 9.80665 m/s².',
      },
      Ud: {
        symbol: 'Ud',
        unit: 'm s⁻¹',
        description:
          'Dispersed-phase superficial velocity = volumetric flow / column cross-section area. ' +
          'In ECR-2: Ud = Q_RRBO / A_col [RRBO is dispersed, light phase, flows upward]. ' +
          'Dimensionless product: Ud·θ [—].',
      },
      Uc: {
        symbol: 'Uc',
        unit: 'm s⁻¹',
        description:
          'Continuous-phase superficial velocity = volumetric flow / column cross-section area. ' +
          'In ECR-2: Uc = Q_NMP / A_col [NMP is continuous, heavy phase, flows downward]. ' +
          'Dimensionless product: Uc·θ [—].',
      },
      rho_c: {
        symbol: 'ρc',
        unit: 'kg m⁻³',
        description:
          'Continuous-phase density. In ECR-2: NMP density at operating temperature. ' +
          'Appears in both θ (Eq. 2) and the density-ratio group of Eq. (1).',
      },
      rho_d: {
        symbol: 'ρd',
        unit: 'kg m⁻³',
        description:
          'Dispersed-phase density. In ECR-2: RRBO density at operating temperature.',
      },
      xf: {
        symbol: 'xf',
        unit: '—',
        description:
          'Fractional free column cross-sectional area — the open area of the Kühni stator ' +
          'partition plates as a fraction of the column total cross section. ' +
          'From Laitinen Table 2: xf = 0.30 (30%) for the ECR60/50G column. ' +
          'Must be confirmed for the specific Kühni model used in ECR-2. ' +
          'Appears with coefficient 2.27 and exponent −0.77: 2.27·xf^(−0.77). ' +
          'Smaller free area → more restricted flow → higher holdup.',
      },
      gamma: {
        symbol: 'γ',
        unit: 'N m⁻¹',
        description:
          'Liquid–liquid interfacial tension at operating temperature. ' +
          'SI: [N/m] = [kg/s²]. Must be in SI — do not use mN/m. ' +
          'Laitinen measured γ = 3.50 mN/m for 2MTHF/water at 295 K. ' +
          'NMP/RRBO interfacial tension must be measured at ECR-2 operating temperature.',
      },
      // ── Assigned Kühni constants ─────────────────────────────────────────
      k1_additive: {
        symbol: '2.67×10⁻²',
        unit: '—',
        description:
          'Additive constant inside the first bracket of Eq. (1). ' +
          'Represents minimum holdup at zero agitation (ψ→0): ' +
          'φ_min → 2.67×10⁻²·(Ud·θ)^0.64·[exp(20.7·Uc·θ)]^0.90·(...)',
      },
      k2_psi_exp: {
        symbol: '0.77',
        unit: '—',
        description:
          'Exponent on the agitation group (ψθ/g) inside the first bracket. ' +
          'At high agitation, bracket ≈ (ψθ/g)^0.77 — holdup increases sub-linearly with ψ.',
      },
      k3_Ud_exp: {
        symbol: '0.64',
        unit: '—',
        description: 'Exponent on (Ud·θ) — holdup increases with dispersed-phase throughput.',
      },
      k4_exp_coeff: {
        symbol: '20.7',
        unit: '—',
        description:
          'Linear coefficient inside the exp argument: exp(20.7·Uc·θ). ' +
          'Note: 20.7 is NOT an exponent on Uc; it multiplies the dimensionless group Uc·θ ' +
          'before the exp function is applied. ' +
          'High continuous-phase velocity → exp term → holdup suppressed.',
      },
      k5_exp_outer: {
        symbol: '0.90',
        unit: '—',
        description:
          'Exponent on the entire exp(…) factor: [exp(20.7·Uc·θ)]^0.90. ' +
          'The outer 0.90 power slightly attenuates the exponential sensitivity to Uc.',
      },
      k6_dens_exp: {
        symbol: '−0.34',
        unit: '—',
        description:
          'Exponent on the density-ratio group ((ρc−ρd)/ρc). ' +
          'Negative: smaller density difference → higher holdup (drops settle more slowly).',
      },
      k7_xf_coeff: {
        symbol: '2.27',
        unit: '—',
        description:
          'Multiplicative prefactor on xf^(−0.77). ' +
          'Works together with k8 (−0.77) to give the stator geometry factor.',
      },
      k8_xf_exp: {
        symbol: '−0.77',
        unit: '—',
        description:
          'Exponent on fractional free area xf. ' +
          'Negative: smaller free area (more restricted stator) → higher holdup. ' +
          'Combined factor: 2.27·xf^(−0.77).',
      },
    },

    // ── Validity ranges ──────────────────────────────────────────────────────
    // From Laitinen (2019) Table 2 and K&H 1995 general documentation.
    // Confirm Kühni-specific bounds from K&H 1995 primary paper.
    validityRange: {
      phi: {
        min: 0.01,
        max: 0.40,
        unit: '—',
        note:
          'Range from Laitinen experiments: φ = 3.98–16.04%. ' +
          'Flooding occurs as φ → φ_flood; flood margin must be monitored separately. ' +
          'Confirm upper bound from K&H 1995 Kühni dataset.',
      },
      Ud: {
        min: 0.0005,
        max: 0.02,
        unit: 'm/s',
        note:
          'Laitinen: S/F 8.4/9.2 to 12.2/14.0 kg/h. ' +
          'Confirm K&H 1995 Kühni dataset Ud range from primary paper.',
      },
      Uc: {
        min: 0.0005,
        max: 0.02,
        unit: 'm/s',
        note: 'Approximate range. Confirm from K&H 1995 primary paper.',
      },
      psi: {
        min: 0.05,
        max: 50,
        unit: 'W/kg',
        note: 'Agitated-column range. Confirm Kühni subset bounds from K&H 1995 primary paper.',
      },
      gamma: {
        min: 0.001,
        max: 0.045,
        unit: 'N/m',
        note:
          'Laitinen: γ = 3.50 mN/m (2MTHF/water). ' +
          'NMP/RRBO interfacial tension must be measured and confirmed within range.',
      },
      xf: {
        min: 0.10,
        max: 0.50,
        unit: '—',
        note:
          'Laitinen ECR60/50G: xf = 0.30. ' +
          'Confirm Kühni model used in ECR-2 and its stator free area fraction.',
      },
    },

    applicabilityStatus: 'secondary_equation_verified',
    primarySourceVerified: false,          // K&H 1995 primary paper not yet inspected
    secondaryReproductionVerified: true,   // Eqs (1)–(2) reproduced from Laitinen et al. (2019) — peer-reviewed
    validatedForRRBONMP: false,            // Pilot calibration required for NMP/RRBO system

    pilotCalibrationFactor: {
      symbol: 'f_cal_phi',
      description:
        'φ_design = f_cal_phi · φ_KH95. ' +
        'Multiplicative correction factor for NMP/RRBO applied AFTER Eq. (1) is evaluated. ' +
        'Kept strictly separate from the published constants — ' +
        'do NOT modify any of the 8 Kühni constants (2.67e-2, 0.77, 0.64, 20.7, 0.90, ' +
        '−0.34, 2.27, −0.77) during calibration.',
      currentValue: 'NOT_YET_CALIBRATED',
      note:
        'f_cal_phi derived from ECR pilot-plant holdup measurements with actual RRBO/NMP at operating T. ' +
        'Until measured: f_cal_phi = 1.0 (no correction). ' +
        'Laitinen 11.2% deviation for 2MTHF/water is a reference benchmark only.',
    },

    approvalNote:
      'secondary_equation_verified: Eqs (1) and (2) accepted as secondary-reproduced K&H 1995 holdup model. ' +
      'Equation form fully confirmed from Laitinen et al. (2019), peer-reviewed secondary source. ' +
      'All 8 Kühni constants assigned to exact equation terms. No UNRESOLVED symbols or groupings. ' +
      'Dimensional verification complete for θ, Ud·θ, Uc·θ, ψθ/g (all dimensionless ✓). ' +
      'secondaryReproductionVerified=true. Ready for CONTROLLED implementation behind a governance guard. ' +
      '' +
      'CONTROLLED IMPLEMENTATION GATE: ' +
      '  Engine may call Eqs (1)–(2) numerically, but any output used for design decisions ' +
      '  must carry a clearly labelled "UNVERIFIED — pending primary source" flag. ' +
      '  Result must not be used for column sizing, flooding margin, or performance guarantees ' +
      '  until primarySourceVerified = true. ' +
      '' +
      'BEFORE advancing to governed: ' +
      '(1) Read K&H 1995 primary paper (DOI 10.1021/ie00038a032): ' +
      '    confirm exact equation form and all 8 Kühni constants match Laitinen reproduction. ' +
      '(2) Confirm K&H 1995 Kühni experimental dataset uses same phase convention ' +
      '    as Laitinen (aqueous=continuous, organic=dispersed) for Ud and Uc. ' +
      '    If reversed, Ud and Uc in Eq. (1) must be reassigned for ECR-2. ' +
      '(3) Verify K&H 1995 Kühni validity ranges cover ECR-2 operating envelope ' +
      '    (Ud, Uc, ψ, γ, Δρ, xf). ' +
      '(4) Confirm xf for the specific Kühni model used in ECR-2 (not ECR60/50G). ' +
      '(5) Set primarySourceVerified = true with engineer name and date. ' +
      'Numerical output remains UNVERIFIED until governed.',
  },

  // ── 3. Phase mass-transfer coefficients — Kumar & Hartland (1999) ────────
  //
  // Candidate correlation for individual phase Sherwood numbers (kc, kd)
  // reproduced from Laitinen et al. (2019), Eqs (10)–(15) [1D model form]
  // and Eqs (18)–(23) [CFD form, slightly reformulated].
  //
  // Primary source:
  //   Kumar, A. & Hartland, S. (1999). "Correlations for Prediction of Mass
  //   Transfer Coefficients in Single Drop Systems and Liquid-Liquid Extraction
  //   Columns." Transactions of the Institution of Chemical Engineers (Trans IChemE),
  //   Part A, 77, 372–384.
  //
  // STATUS: pending_approval
  //   Equations documented from secondary reproduction only.
  //   Dimensional verification, primary-paper check, and explicit engineering
  //   approval required before advancing.
  //   ECR-2 requires component-by-component treatment (Sat/Mono/Di/Poly) —
  //   a single lumped ki is NOT acceptable. How the Sherwood number correlation
  //   is applied per-component must be resolved before implementation.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'ecr2_koa_kh1999',
    quantity: 'mass_transfer',
    name: 'Kühni Column Phase Mass-Transfer Coefficients — Kumar & Hartland (1999)',

    source:
      'Kumar, A. & Hartland, S. (1999). ' +
      '"Correlations for Prediction of Mass Transfer Coefficients in Single Drop Systems ' +
      'and Liquid-Liquid Extraction Columns." ' +
      'Transactions of the Institution of Chemical Engineers, Part A, 77, 372–384. ' +
      'Equations reproduced from: ' +
      'Laitinen, A. et al. (2019). Chemical Engineering Research and Design, 146, 518–527. ' +
      'DOI: 10.1016/j.cherd.2019.04.018. ' +
      'Laitinen reports kc values 4.29–6.38 × 10⁻⁵ m/s and kd values 3.43–5.12 × 10⁻⁵ m/s ' +
      'for 2MTHF/water system; overall ki ≈ 1.4–2.2 × 10⁻⁵ m/s.',

    // ── Equations — reproduced from Laitinen et al. (2019) ──────────────────
    //
    // OVERALL MASS TRANSFER COEFFICIENT, Eq. (10):
    //   ki = kc · kd / (kd · Kd + kc)
    //   [Note: Laitinen Eq.(10) PDF renders denominator as "kc·Kd + kc" which
    //    is likely a typographic error; the physically correct form for
    //    resistance-in-series is ki = kc·kd / (kd·Kd + kc) — confirm from K&H 1999]
    //
    // PARTITION COEFFICIENT, Eq. (11):
    //   Kd,i = Cd,i* / Cc,i*
    //   (ratio of equilibrium dispersed-to-continuous concentrations for component i)
    //
    // CONTINUOUS-PHASE SHERWOOD NUMBER, Eqs (12)–(14) [1D form]:
    //
    //   (Shc − Shc,rigid) / (Shc,∞ − Shc) × 1/(1−φ)
    //     = 5.26×10⁻² · Red^(−2/3) + 6.59×10⁻² · Red^(1/4) · Scc^(1/3)
    //       · (Uslip·μc/γ)^(1/3) · 1/(1+κ^1.1)
    //       · (1 + C1 · ((ψ/g)·(ρc/(gγ))^(1/4))^...)
    //
    //   Shc,rigid = 2.43 + 0.775·Re^(1/2)·Scc^(1/3) + 0.0103·Re·Scc^(1/3)  ... Eq. (13)
    //   Shc,∞    = 50 + (2/√π)·(Re·Scc)^(1/2)                               ... Eq. (14)
    //     [Eq.(14) valid: 0.1 < Re < 1400, 180 < Scc < 571600, 15 < Shc < 1919]
    //     [Eq.(13) valid: 10 < Re < 1200]
    //
    //   kc = Shc · De / d32        [continuous-phase mass transfer coefficient, m/s]
    //
    // DISPERSED-PHASE SHERWOOD NUMBER, Eq. (15) [1D form] / Eq. (23) [CFD form]:
    //
    //   Shd = 17.7 + 3.19×10⁻³·(Red·Scd)^(1/3)^1.7 / (1 + 1.43×10⁻²·(Red·Scd)^(1/3)^0.7)
    //         · (ρd/ρc)^(2/3) · 1/(1+κ^(2/3))
    //         · (1 + C2·((ψ/g)·(ρc/(gγ))^(1/4))^...)
    //
    //   kd = Shd · De / d32        [dispersed-phase mass transfer coefficient, m/s]
    //
    // INTERFACIAL AREA, Eq. (9):
    //   a = 6·φ / d32              [specific interfacial area, m²/m³]
    //
    // SLIP VELOCITY (required for Shc):
    //   Uslip = Ud/φ + Uc/(1−φ)   [from continuity]
    //
    // DIMENSIONLESS GROUPS:
    //   Red  = Uslip · ρc · d32 / μc   [drop Reynolds number]
    //   Scc  = μc / (ρc · De,c)        [continuous Sc]
    //   Scd  = μd / (ρd · De,d)        [dispersed Sc]
    //   κ    = μd / μc                 [viscosity ratio]
    //   De   = molecular diffusivity of solute in each phase [m²/s]
    //
    // C1, C2 = agitation correction constants for continuous and dispersed phases.
    //   Exact forms of the agitation terms containing C1 and C2 require primary paper.
    //   Laitinen uses C1 in the continuous phase Shc equation and C2 in the
    //   dispersed phase Shd equation. Values not extracted — pending_approval.
    //
    // ECR-2 SPECIFIC REQUIREMENTS BEFORE IMPLEMENTATION:
    //   (a) Component-by-component application: ki must be computed separately for
    //       each of Sat / Mono / Di / Poly with their respective De and Kd values.
    //       A single lumped ki applied to the whole hydrocarbon is NOT acceptable.
    //   (b) Confirm K&H 1999 phase convention matches ECR-2 (RRBO dispersed, NMP continuous).
    //   (c) Confirm the exact C1 and C2 agitation terms from K&H 1999 primary paper.
    //   (d) Laitinen Re range (6–21) is below Eq.(13) validity floor (Re>10).
    //       Confirm applicability or use alternative correlation for low-Re regime.
    //   (e) Kd for each pseudo-component must come from ECR-2 NRTL flash, not assumed.
    //
    equation:
      'PENDING_APPROVAL — DO NOT IMPLEMENT. ' +
      'Framework from K&H 1999 as reproduced in Laitinen (2019) Eqs (10)–(15). ' +
      'ki = kc·kd/(kd·Kd+kc) [overall, component i] ' +
      '| kc = Shc·De/d32, kd = Shd·De/d32 ' +
      '| Shc: Lévêque + Hadamard–Rybczynski + agitation correction (C1 term — pending primary paper) ' +
      '| Shc,rigid = 2.43 + 0.775·Re^0.5·Scc^(1/3) + 0.0103·Re·Scc^(1/3) [Eq.13, Re 10–1200] ' +
      '| Shc,∞ = 50 + (2/√π)·(Re·Scc)^0.5 [Eq.14, Re 0.1–1400] ' +
      '| Shd = 17.7 + 3.19e-3·(Re·Scd)^(1/3)^1.7 / (1+1.43e-2·(Re·Scd)^(1/3)^0.7) ' +
      '       ·(ρd/ρc)^(2/3)·1/(1+κ^(2/3))·(1+C2·agitation) [C2 pending primary paper] ' +
      '| a = 6·φ/d32, Uslip = Ud/φ + Uc/(1−φ) ' +
      '| ECR-2: apply per component (Sat/Mono/Di/Poly) with component-specific De and Kd.',

    variables: {
      ki: {
        symbol: 'ki',
        unit: 'm s⁻¹',
        description:
          'Overall mass transfer coefficient for component i, based on continuous-phase driving force. ' +
          'Defined by Laitinen Eq. (10): ki = kc·kd/(kd·Kd+kc). ' +
          'Must be applied per pseudo-component in ECR-2.',
      },
      kc: {
        symbol: 'kc',
        unit: 'm s⁻¹',
        description:
          'Continuous-phase (NMP) mass transfer coefficient. ' +
          'kc = Shc·De,c/d32 where De,c is the molecular diffusivity of the solute in NMP.',
      },
      kd: {
        symbol: 'kd',
        unit: 'm s⁻¹',
        description:
          'Dispersed-phase (RRBO) mass transfer coefficient. ' +
          'kd = Shd·De,d/d32 where De,d is the molecular diffusivity of the solute in RRBO.',
      },
      Kd: {
        symbol: 'Kd,i',
        unit: '—',
        description:
          'Partition coefficient for component i: Kd,i = Cd,i* / Cc,i* ' +
          '(equilibrium dispersed-to-continuous concentration ratio). ' +
          'Must be computed from ECR-2 NRTL flash for each pseudo-component.',
      },
      Shc: {
        symbol: 'Shc',
        unit: '—',
        description:
          'Continuous-phase Sherwood number. ' +
          'Computed from Laitinen Eqs (12)–(14) using rigid-sphere and fully-circulating limits ' +
          'plus an agitation correction containing C1 (value pending K&H 1999 primary paper).',
      },
      Shd: {
        symbol: 'Shd',
        unit: '—',
        description:
          'Dispersed-phase Sherwood number. ' +
          'Computed from Laitinen Eq. (15): base term 17.7 + saturation function of Re·Scd, ' +
          'times density ratio, times viscosity correction, times agitation factor (C2 pending).',
      },
      Red: {
        symbol: 'Red',
        unit: '—',
        description:
          'Drop Reynolds number: Red = Uslip·ρc·d32/μc. ' +
          'Uses slip velocity Uslip = Ud/φ + Uc/(1−φ). ' +
          'Laitinen reports Red ≈ 6–21; note Eq.(13) formally valid only for Re > 10.',
      },
      Scc: {
        symbol: 'Scc',
        unit: '—',
        description:
          'Continuous-phase Schmidt number: Scc = μc/(ρc·De,c). ' +
          'Laitinen reports Scc ≈ 900 for 2MTHF/water; Eq.(14) valid 180 < Scc < 571600.',
      },
      Scd: {
        symbol: 'Scd',
        unit: '—',
        description: 'Dispersed-phase Schmidt number: Scd = μd/(ρd·De,d).',
      },
      kappa: {
        symbol: 'κ',
        unit: '—',
        description: 'Viscosity ratio: κ = μd/μc (dispersed/continuous).',
      },
      De: {
        symbol: 'De',
        unit: 'm² s⁻¹',
        description:
          'Effective molecular diffusivity of the transferring solute in the relevant phase. ' +
          'Laitinen uses De = 9.34×10⁻⁹ m²/s (continuous) and 2.4×10⁻⁹ m²/s (dispersed). ' +
          'Must be provided for each pseudo-component (Sat/Mono/Di/Poly) in ECR-2.',
      },
      a_intf: {
        symbol: 'a',
        unit: 'm² m⁻³',
        description: 'Specific interfacial area: a = 6·φ/d32. Requires holdup φ and d32 as inputs.',
      },
      Uslip: {
        symbol: 'Uslip',
        unit: 'm s⁻¹',
        description:
          'Slip velocity between phases: Uslip = Ud/φ + Uc/(1−φ). ' +
          'Requires holdup φ as input from K&H 1995 correlation.',
      },
    },

    validityRange: {
      Red: {
        min: 0.1,
        max: 1400,
        unit: '—',
        note:
          'Shc,∞ formula (Eq.14) valid 0.1–1400. ' +
          'Shc,rigid (Eq.13) valid 10–1200. ' +
          'Laitinen Re≈6–21: below Eq.(13) floor — applicability must be confirmed.',
      },
      Scc: {
        min: 180,
        max: 571600,
        unit: '—',
        note: 'From Laitinen Eq.(14) validity statement. Laitinen: Scc≈900 ✓.',
      },
    },

    applicabilityStatus: 'pending_approval',
    primarySourceVerified: false,
    secondaryReproductionVerified: true,   // Framework reproduced from Laitinen (2019)
    validatedForRRBONMP: false,

    approvalNote:
      'pending_approval: K&H 1999 framework documented from Laitinen et al. (2019) secondary reproduction. ' +
      'BEFORE advancing to candidate_governed: ' +
      '(1) Read K&H 1999 primary paper — confirm exact Shc and Shd equations and C1, C2 agitation terms. ' +
      '(2) Resolve component-level application strategy: ki must be computed per pseudo-component ' +
      '    (Sat/Mono/Di/Poly) with individual De and Kd from the NRTL model. ' +
      '(3) Resolve Eq.(13) validity at Re < 10 for ECR-2 operating conditions. ' +
      '(4) Confirm ki/Kd sign convention and which phase the driving force is expressed in. ' +
      '(5) Confirm K&H 1999 phase convention (continuous/dispersed assignment). ' +
      'GATED ON: d32 (ecr2_d32_kh1996) and holdup (ecr2_holdup_kh1995) both reaching governed. ' +
      'DO NOT IMPLEMENT until both upstream correlations are governed and this entry is approved.',
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
