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
// PHASE 1 STATUS: All five correlation slots are 'pending_approval'.
// No equations or coefficients are provided. Do not implement correlations
// until each is individually approved and status is changed to 'governed'.
// ═══════════════════════════════════════════════════════════════════════════════

export type CorrelationQuantity =
  | 'droplet_size'
  | 'holdup'
  | 'mass_transfer'
  | 'axial_dispersion'
  | 'flooding';

export type CorrelationStatus = 'governed' | 'pending_approval' | 'reserved';

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
  /** Exact equation in ASCII or LaTeX. Must be frozen before 'governed'. */
  equation: string;
  /** All symbols that appear in the equation, with units and descriptions. */
  variables: Record<string, CorrelationVariable>;
  /** Physical validity range for each independent variable. */
  validityRange: Record<string, CorrelationValidityRange>;
  /** Governance status. */
  applicabilityStatus: CorrelationStatus;
  /** Explains what is needed to advance status, or documents the approval. */
  approvalNote: string;
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const ECR2_CORRELATION_REGISTRY: readonly ECR2Correlation[] = [

  // ── 1. Sauter mean droplet diameter (d₃₂) ────────────────────────────────
  {
    id: 'ecr2_d32_pending',
    quantity: 'droplet_size',
    name: 'Kühni Column Sauter Mean Droplet Diameter (d₃₂)',
    source: 'PENDING — Kühni-specific correlation to be provided and approved. ' +
      'Candidate sources: Modes & Bart 2001, Jere & Steiner, or other ' +
      'Kühni-specific droplet-size correlation. Exact reference, year, ' +
      'equation number, and page must be confirmed.',
    equation:
      'd_32(z) = f(P/V(z), ρ_c(z), ρ_d(z), μ_c(z), σ(z), Δρ(z), D_R, geometry) — ' +
      'EQUATION NOT YET APPROVED. Do not implement a placeholder coefficient.',
    variables: {},
    validityRange: {},
    applicabilityStatus: 'pending_approval',
    approvalNote:
      'Requires: (1) exact equation with all coefficients, (2) units for every ' +
      'term, (3) validity ranges for Re, We, P/V, D_R, and Δρ, (4) applicability ' +
      'confirmation to the NMP/RRBO system. Do not implement until approved.',
  },

  // ── 2. Dispersed-phase holdup (φ_d) ──────────────────────────────────────
  {
    id: 'ecr2_holdup_pending',
    quantity: 'holdup',
    name: 'Kühni Column Dispersed-Phase Holdup (φ_d)',
    source: 'PENDING — Holdup correlation for agitated liquid-liquid extraction ' +
      'columns (Kühni type) to be provided and approved. Candidate sources: ' +
      'Kumar & Hartland 1999, Modes & Bart 2001, or vendor-supplied pilot data.',
    equation:
      'φ_d(z) = f(Q_c(z), Q_d(z), d_32(z), RPM, ρ_c(z), ρ_d(z), μ_c(z), σ(z), D_R, geometry) — ' +
      'EQUATION NOT YET APPROVED. Holdup requires a converged d_32 value first.',
    variables: {},
    validityRange: {},
    applicabilityStatus: 'pending_approval',
    approvalNote:
      'Gated on d_32 correlation approval. Requires: same information as d_32 ' +
      'plus explicit treatment of flooding proximity. Must preserve distinction ' +
      'between correlation-derived holdup and the ECR-1 assumed hydraulic-capacity method.',
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
  approvalNote: string;
}[] {
  return ECR2_CORRELATION_REGISTRY.map(({ id, quantity, name, applicabilityStatus, approvalNote }) => ({
    id, quantity, name, applicabilityStatus, approvalNote,
  }));
}
