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
// 5. ECR-2 calculate() must check every correlation it calls. Outputs are null
//    unless their lifecycle explicitly authorizes controlled numerical use.
//
// PHASE 1 → POST-PHASE 1 STATUS:
//   d32   : preliminary_engineering_reconstruction (K&H 1996, Kühni set)
//   holdup: secondary_equation_verified (K&H 1995, Kühni set)
//   K_oa  : preliminary_engineering_reconstruction (K_d/driving-force subset
//           is controlled; source-incomplete Sherwood-dependent terms remain
//           explicitly unavailable)
//   axial dispersion: reserved
//   flooding: pending_approval
//
// preliminary_engineering_reconstruction = an explicitly approved reconstruction
// may be calculated with persistent traceability warnings. It is neither primary-
// source verified, RRBO/NMP validated, pilot calibrated, nor governed.
// ═══════════════════════════════════════════════════════════════════════════════

export type CorrelationQuantity =
  | 'droplet_size'
  | 'holdup'
  | 'mass_transfer'
  | 'interfacial_area'
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
 *  preliminary_engineering_reconstruction — An explicitly approved best-supported
 *                             reconstruction may be calculated for preliminary
 *                             engineering. It must retain primary-source,
 *                             applicability, phase-convention, and calibration
 *                             warnings; it is not governed.
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
  | 'preliminary_engineering_reconstruction'
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
   * Evidence status recorded separately for secondary reproductions. Existing
   * historic entries may omit this field; new K&H 1999 evidence records must
   * set it explicitly.
   */
  correlationStatus?: CorrelationStatus;
  /** Exact equation location in the peer-reviewed secondary source. */
  secondarySourceEquation?: string;
  /** Original publication to which the secondary source attributes the equation. */
  originalAttribution?: string;
  /** Metadata may be source-verified while runtime evaluation remains prohibited. */
  numericalUse?: 'metadata_only' | 'not_authorized' | 'independently_available' | 'preliminary_authorized';
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

// ── K&H 1999 supplied preliminary parameter evidence ─────────────────────────

export interface ECR2KH1999PreliminaryParameter {
  id:
    | 'kh1999_provisional_C1'
    | 'kh1999_provisional_Fc'
    | 'kh1999_provisional_Fd';
  /** Printed symbol only; never use it as a registry lookup key. */
  symbol: 'C1' | 'Fc' | 'Fd';
  /** Makes the provisional source family explicit and prevents symbol collisions. */
  scope: 'project_provisional_role_unresolved';
  value: number;
  unit: '—';
  phaseRole: 'continuous' | 'dispersed';
  physicalRole: string;
  equationPlacement: 'unresolved_do_not_apply_numerically';
  evidenceStatus: 'supplied_preliminary_evidence';
  source: string;
}

/**
 * These constants are intentionally separate from all historic K&H registry
 * symbols. Their identical-looking names must never be matched by name alone:
 * application is permitted only after an exact published equation role is
 * established.
 */
export const ECR2_KH1999_PRELIMINARY_PARAMETERS: readonly ECR2KH1999PreliminaryParameter[] = [
  {
    id: 'kh1999_provisional_C1', symbol: 'C1', scope: 'project_provisional_role_unresolved',
    value: 0.90, unit: '—', phaseRole: 'continuous',
    physicalRole: 'K&H 1999 continuous-phase agitation parameter',
    equationPlacement: 'unresolved_do_not_apply_numerically',
    evidenceStatus: 'supplied_preliminary_evidence',
    source: 'ECR-2 K&H 1999 preliminary implementation specification.',
  },
  {
    id: 'kh1999_provisional_Fc', symbol: 'Fc', scope: 'project_provisional_role_unresolved',
    value: 0.76, unit: '—', phaseRole: 'continuous',
    physicalRole: 'Kühni continuous-phase correction',
    equationPlacement: 'unresolved_do_not_apply_numerically',
    evidenceStatus: 'supplied_preliminary_evidence',
    source: 'ECR-2 K&H 1999 preliminary implementation specification.',
  },
  {
    id: 'kh1999_provisional_Fd', symbol: 'Fd', scope: 'project_provisional_role_unresolved',
    value: 0.58, unit: '—', phaseRole: 'dispersed',
    physicalRole: 'Kühni dispersed-phase correction',
    equationPlacement: 'unresolved_do_not_apply_numerically',
    evidenceStatus: 'supplied_preliminary_evidence',
    source: 'ECR-2 K&H 1999 preliminary implementation specification.',
  },
] as const;

/** Guard against symbol collision or an accidental phase-role swap. */
export function validateKH1999PreliminaryParameterRegistry(): string[] {
  const expected: Record<ECR2KH1999PreliminaryParameter['id'], readonly [
    'C1' | 'Fc' | 'Fd',
    number,
    'continuous' | 'dispersed',
  ]> = {
    kh1999_provisional_C1: ['C1', 0.90, 'continuous'],
    kh1999_provisional_Fc: ['Fc', 0.76, 'continuous'],
    kh1999_provisional_Fd: ['Fd', 0.58, 'dispersed'],
  };
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const parameter of ECR2_KH1999_PRELIMINARY_PARAMETERS) {
    if (seen.has(parameter.id)) issues.push(`Duplicate K&H 1999 parameter '${parameter.id}'.`);
    seen.add(parameter.id);
    const [symbol, value, phaseRole] = expected[parameter.id];
    if (parameter.symbol !== symbol || parameter.value !== value || parameter.phaseRole !== phaseRole) {
      issues.push(`K&H 1999 parameter '${parameter.id}' has an unexpected value or phase role.`);
    }
    if (parameter.scope !== 'project_provisional_role_unresolved') {
      issues.push(`K&H 1999 parameter '${parameter.id}' must remain in its provisional source scope.`);
    }
    if (parameter.equationPlacement !== 'unresolved_do_not_apply_numerically') {
      issues.push(`K&H 1999 parameter '${parameter.id}' must not receive an invented equation placement.`);
    }
  }
  for (const id of Object.keys(expected)) {
    if (!seen.has(id)) issues.push(`Required K&H 1999 parameter '${id}' is missing.`);
  }
  return issues;
}

// ── K&H 1999 secondary-literature evidence ────────────────────────────────────

export interface ECR2KH1999ScopedConstant {
  id:
    | 'kh1999_shc_agitation_C1_kuhni'
    | 'kh1999_shc_agitation_C1_pulsed';
  symbol: 'C1';
  value: number;
  unit: '—';
  correlationId: 'ecr2_kh1999_shc_secondary' | 'ecr2_kh1999_shd_secondary';
  sourceScope: 'kh1999_secondary_equation';
  deviceType: 'kuhni' | 'pulsed';
  phaseBasis: 'continuous';
  equationPlacement: string;
  evidenceStatus: 'secondary_equation_verified';
  source: string;
}

/**
 * Secondary-source values are deliberately scoped to the individual equation,
 * device, and phase. They are not aliases for the project provisional
 * parameters above, nor for K&H 1995/1996 constants.
 */
export const ECR2_KH1999_SECONDARY_SCOPED_CONSTANTS: readonly ECR2KH1999ScopedConstant[] = [
  {
    id: 'kh1999_shc_agitation_C1_kuhni',
    symbol: 'C1',
    value: 7.5,
    unit: '—',
    correlationId: 'ecr2_kh1999_shc_secondary',
    sourceScope: 'kh1999_secondary_equation',
    deviceType: 'kuhni',
    phaseBasis: 'continuous',
    equationPlacement: 'Additive coefficient inside the [1 + C1·agitationGroup^(1/3)] continuous-side power correction.',
    evidenceStatus: 'secondary_equation_verified',
    source: 'Asadollahzadeh et al. (2017), Table 3 Eq. (18): C1 = 7.5 for Kühni columns.',
  },
  {
    id: 'kh1999_shc_agitation_C1_pulsed',
    symbol: 'C1',
    value: 4.33,
    unit: '—',
    correlationId: 'ecr2_kh1999_shc_secondary',
    sourceScope: 'kh1999_secondary_equation',
    deviceType: 'pulsed',
    phaseBasis: 'continuous',
    equationPlacement: 'Same printed continuous-side power-correction location; pulsed-column context only.',
    evidenceStatus: 'secondary_equation_verified',
    source: 'Torab-Mostaedi et al. (2011), after Eq. (12); Asadollahzadeh et al. (2017), Table 3 Eq. (18).',
  },
] as const;

/** Guards accepted source scopes against accidental identifier matching. */
export function validateKH1999SecondaryEvidenceRegistry(
  constants: readonly ECR2KH1999ScopedConstant[] = ECR2_KH1999_SECONDARY_SCOPED_CONSTANTS,
  preliminaryParameters: readonly ECR2KH1999PreliminaryParameter[] = ECR2_KH1999_PRELIMINARY_PARAMETERS,
): string[] {
  const issues: string[] = [];
  const expected: Record<ECR2KH1999ScopedConstant['id'], Omit<ECR2KH1999ScopedConstant, 'id' | 'equationPlacement' | 'source'>> = {
    kh1999_shc_agitation_C1_kuhni: {
      symbol: 'C1', value: 7.5, unit: '—', correlationId: 'ecr2_kh1999_shc_secondary',
      sourceScope: 'kh1999_secondary_equation', deviceType: 'kuhni', phaseBasis: 'continuous',
      evidenceStatus: 'secondary_equation_verified',
    },
    kh1999_shc_agitation_C1_pulsed: {
      symbol: 'C1', value: 4.33, unit: '—', correlationId: 'ecr2_kh1999_shc_secondary',
      sourceScope: 'kh1999_secondary_equation', deviceType: 'pulsed', phaseBasis: 'continuous',
      evidenceStatus: 'secondary_equation_verified',
    },
  };
  const seen = new Set<string>();
  for (const constant of constants) {
    if (seen.has(constant.id)) issues.push(`Duplicate secondary K&H 1999 constant '${constant.id}'.`);
    seen.add(constant.id);
    const expectedScope = expected[constant.id];
    if (!expectedScope) {
      issues.push(`Unrecognised secondary K&H 1999 constant '${constant.id}'.`);
      continue;
    }
    for (const key of Object.keys(expectedScope) as (keyof typeof expectedScope)[]) {
      if (constant[key] !== expectedScope[key]) {
        issues.push(`Secondary K&H 1999 constant '${constant.id}' has an invalid ${String(key)} scope.`);
      }
    }
  }
  for (const id of Object.keys(expected) as ECR2KH1999ScopedConstant['id'][]) {
    if (!seen.has(id)) issues.push(`Required secondary K&H 1999 constant '${id}' is missing.`);
  }
  const secondaryIds = new Set<string>(constants.map((constant) => constant.id));
  const symbolCollisions = preliminaryParameters.some(
    (parameter) => String(parameter.scope) === 'kh1999_secondary_equation' || secondaryIds.has(parameter.id),
  );
  if (symbolCollisions) issues.push('Project provisional parameters must not share secondary-evidence source scope or registry identities.');
  return issues;
}

export interface ECR2FuturePreliminaryInputContract {
  id: 'd32' | 'D_c' | 'D_d' | 'sigma' | 'mu_c' | 'mu_d';
  unit: string;
  requiredFields: readonly ['value', 'unit', 'sourceType', 'sourceReference', 'engineeringStatus'];
  activation: 'future_only_not_runtime' | 'preliminary_runtime_required';
  note: string;
}

/**
 * Shape only: this does not add any runtime input or substitute data. It
 * preserves the provenance contract required if preliminary simulation is
 * explicitly authorised later.
 */
export const ECR2_KH1999_FUTURE_PRELIMINARY_INPUTS: readonly ECR2FuturePreliminaryInputContract[] = [
  { id: 'd32', unit: 'm', requiredFields: ['value', 'unit', 'sourceType', 'sourceReference', 'engineeringStatus'], activation: 'preliminary_runtime_required', note: 'May be governed-calculated or engineer-entered/measured; existing K&H 1996 governance is unchanged.' },
  { id: 'D_c', unit: 'm²/s', requiredFields: ['value', 'unit', 'sourceType', 'sourceReference', 'engineeringStatus'], activation: 'preliminary_runtime_required', note: 'Continuous-phase component diffusivity.' },
  { id: 'D_d', unit: 'm²/s', requiredFields: ['value', 'unit', 'sourceType', 'sourceReference', 'engineeringStatus'], activation: 'preliminary_runtime_required', note: 'Dispersed-phase component diffusivity.' },
  { id: 'sigma', unit: 'N/m', requiredFields: ['value', 'unit', 'sourceType', 'sourceReference', 'engineeringStatus'], activation: 'preliminary_runtime_required', note: 'Physical liquid-liquid interfacial tension.' },
  { id: 'mu_c', unit: 'Pa·s', requiredFields: ['value', 'unit', 'sourceType', 'sourceReference', 'engineeringStatus'], activation: 'preliminary_runtime_required', note: 'Continuous-phase physical viscosity.' },
  { id: 'mu_d', unit: 'Pa·s', requiredFields: ['value', 'unit', 'sourceType', 'sourceReference', 'engineeringStatus'], activation: 'preliminary_runtime_required', note: 'Dispersed-phase physical viscosity.' },
] as const;

type KH1999DependencyAvailability = 'available' | 'unavailable' | 'independently_governed';
export type ECR2KH1999RuntimeBlockerId =
  | 'kuhni_psi_definition'
  | 'drop_regime_selector'
  | 'characteristic_velocity'
  | 'overall_partition_basis'
  | 'original_validity_ranges'
  | 'rrbo_nmp_validation'
  | 'runtime_activation'
  | 'independent_d32_governance';
interface KH1999Dependency {
  id: string;
  availability: KH1999DependencyAvailability;
  detail: string;
}
export interface ECR2KH1999OutputDependency {
  output: 'Sh_c' | 'Sh_d' | 'k_c' | 'k_d' | 'K_overall' | 'a' | 'Koa' | 'transfer_rate';
  equationStructure: KH1999Dependency;
  requiredConstants: readonly KH1999Dependency[];
  requiredLocalVariables: readonly KH1999Dependency[];
  d32Provenance: readonly ('governed_calculated_future' | 'engineer_entered_or_measured_future')[];
  runtimeStatus: 'not_activated' | 'independently_available' | 'preliminary_authorized';
  blockerIds: readonly ECR2KH1999RuntimeBlockerId[];
  exactBlockers: readonly string[];
}

const D32_PROVENANCE = ['governed_calculated_future', 'engineer_entered_or_measured_future'] as const;
const SHC_BLOCKERS = [
] as const;
const SHD_BLOCKERS = [] as const;
const OVERALL_BLOCKERS = ['overall_partition_basis'] as const;

/**
 * This map is declarative governance data. It never feeds the local kernel and
 * is the single source for why a future output remains unavailable.
 */
export const ECR2_KH1999_MASS_TRANSFER_DEPENDENCY_MAP: readonly ECR2KH1999OutputDependency[] = [
  {
    output: 'Sh_c',
    equationStructure: { id: 'ecr2_kh1999_shc_secondary', availability: 'available', detail: '2011 Eq. (8) and 2017 Table 3 Eq. (18) reproduce the structure.' },
    requiredConstants: [{ id: 'kh1999_shc_agitation_C1_kuhni', availability: 'available', detail: 'C1 = 7.5 only in the verified Kühni continuous-side context.' }],
    requiredLocalVariables: [
      { id: 'Re', availability: 'available', detail: 'd32·Vs·rho_c/mu_c dimensionless group.' },
      { id: 'Sc_c', availability: 'available', detail: 'mu_c/(rho_c·D_c) dimensionless group.' },
      { id: 'psi_kuhni', availability: 'available', detail: 'Thermopac preliminary interpretation: ψ = (P/V)/ρ_mix_phase1, retained with persistent provenance warning.' },
      { id: 'phi_d', availability: 'independently_governed', detail: 'K&H 1995 holdup remains an independent existing gate.' },
    ],
    d32Provenance: D32_PROVENANCE,
    runtimeStatus: 'preliminary_authorized',
    blockerIds: SHC_BLOCKERS,
    exactBlockers: [],
  },
  {
    output: 'Sh_d',
    equationStructure: { id: 'ecr2_kh1999_shd_secondary', availability: 'available', detail: 'K&H 1999 single-drop form retains the reproduced dispersed-side structure without an unsupported agitation multiplier.' },
    requiredConstants: [],
    requiredLocalVariables: [
      { id: 'Re', availability: 'available', detail: 'Shared drop Reynolds number.' },
      { id: 'Sc_d', availability: 'available', detail: 'mu_d/(rho_d·D_d) dimensionless group.' },
      { id: 'rho_d_over_rho_c', availability: 'available', detail: 'Published density-ratio term.' },
      { id: 'mu_d_over_mu_c', availability: 'available', detail: 'Published viscosity-ratio term through κ = mu_d/mu_c.' },
    ],
    d32Provenance: D32_PROVENANCE,
    runtimeStatus: 'preliminary_authorized',
    blockerIds: SHD_BLOCKERS,
    exactBlockers: [],
  },
  {
    output: 'k_c',
    equationStructure: { id: 'k_c = Sh_c·D_c/d32', availability: 'available', detail: 'Film-coefficient identity is source-reproduced.' },
    requiredConstants: [],
    requiredLocalVariables: [{ id: 'Sh_c', availability: 'unavailable', detail: 'Blocked by the Sh_c dependencies above.' }, { id: 'D_c', availability: 'unavailable', detail: 'The provenance contract exists, but mass-transfer use is future-only and not runtime activated.' }],
    d32Provenance: D32_PROVENANCE,
    runtimeStatus: 'preliminary_authorized',
    blockerIds: [],
    exactBlockers: [],
  },
  {
    output: 'k_d',
    equationStructure: { id: 'k_d = Sh_d·D_d/d32', availability: 'available', detail: 'Film-coefficient identity is source-reproduced.' },
    requiredConstants: [],
    requiredLocalVariables: [{ id: 'Sh_d', availability: 'unavailable', detail: 'Blocked by the Sh_d dependencies above.' }, { id: 'D_d', availability: 'unavailable', detail: 'The provenance contract exists, but mass-transfer use is future-only and not runtime activated.' }],
    d32Provenance: D32_PROVENANCE,
    runtimeStatus: 'preliminary_authorized',
    blockerIds: SHD_BLOCKERS,
    exactBlockers: [],
  },
  {
    output: 'K_overall',
    equationStructure: { id: 'ecr2_kh1999_two_film_secondary', availability: 'available', detail: '2011 Eq. (13) is recorded exactly as printed.' },
    requiredConstants: [],
    requiredLocalVariables: [
      { id: 'k_c', availability: 'unavailable', detail: 'Requires activated Sh_c.' },
      { id: 'k_d', availability: 'unavailable', detail: 'Requires activated Sh_d.' },
      { id: 'm_or_partition_basis', availability: 'unavailable', detail: 'The printed m is undefined; the ECR-2 partition convention is not confirmed by this source.' },
    ],
    d32Provenance: D32_PROVENANCE,
    runtimeStatus: 'not_activated',
    blockerIds: OVERALL_BLOCKERS,
    exactBlockers: ['Two-film slope m / partition basis must be explicitly engineer-approved and governed before use.', 'Both film coefficients must be available.'],
  },
  {
    output: 'a',
    equationStructure: { id: 'ecr2_kh1999_interfacial_area_secondary', availability: 'available', detail: 'a = 6·phi_d/d32 is secondary-recorded and implemented independently.' },
    requiredConstants: [],
    requiredLocalVariables: [{ id: 'phi_d', availability: 'independently_governed', detail: 'Existing K&H 1995 holdup result.' }, { id: 'd32', availability: 'independently_governed', detail: 'Existing K&H 1996 or engineer-supplied d32 gate.' }],
    d32Provenance: D32_PROVENANCE,
    runtimeStatus: 'independently_available',
    blockerIds: ['independent_d32_governance'],
    exactBlockers: ['Not a mass-transfer-rate activation; existing d32 governance remains independent.'],
  },
  {
    output: 'Koa',
    equationStructure: { id: 'Koa = K_overall·a', availability: 'available', detail: 'Definition only; no runtime evaluation is authorised.' },
    requiredConstants: [],
    requiredLocalVariables: [{ id: 'K_overall', availability: 'unavailable', detail: 'Two-film basis is unresolved.' }, { id: 'a', availability: 'independently_governed', detail: 'Available only through existing independent guards.' }],
    d32Provenance: D32_PROVENANCE,
    runtimeStatus: 'not_activated',
    blockerIds: OVERALL_BLOCKERS,
    exactBlockers: ['K_overall is unavailable.'],
  },
  {
    output: 'transfer_rate',
    equationStructure: { id: 'rate = Koa·approved_driving_force', availability: 'unavailable', detail: 'No approved rate convention is enabled.' },
    requiredConstants: [],
    requiredLocalVariables: [{ id: 'Koa', availability: 'unavailable', detail: 'Koa is unavailable.' }, { id: 'driving_force_convention', availability: 'unavailable', detail: 'Existing physical driving force is informational only until Koverall is approved.' }],
    d32Provenance: D32_PROVENANCE,
    runtimeStatus: 'not_activated',
    blockerIds: OVERALL_BLOCKERS,
    exactBlockers: ['Koa and the overall partition/resistance convention are unresolved.'],
  },
] as const;

export function validateKH1999MassTransferDependencyMap(): string[] {
  const issues: string[] = [];
  const shc = ECR2_KH1999_MASS_TRANSFER_DEPENDENCY_MAP.find((item) => item.output === 'Sh_c');
  const shd = ECR2_KH1999_MASS_TRANSFER_DEPENDENCY_MAP.find((item) => item.output === 'Sh_d');
  const rate = ECR2_KH1999_MASS_TRANSFER_DEPENDENCY_MAP.find((item) => item.output === 'transfer_rate');
  const area = ECR2_KH1999_MASS_TRANSFER_DEPENDENCY_MAP.find((item) => item.output === 'a');
  if (!shc?.requiredConstants.some((item) => item.id === 'kh1999_shc_agitation_C1_kuhni' && item.availability === 'available')) {
    issues.push('Sh_c must identify the scoped Kühni C1 = 7.5 requirement.');
  }
  if (shd?.exactBlockers.length) {
    issues.push('Sh_d must not retain unsupported C2 blockers.');
  }
  if (shc?.runtimeStatus !== 'preliminary_authorized') {
    issues.push('Sh_c must be preliminary-authorized with its scoped Kühni C1 evidence.');
  }
  if (shd?.runtimeStatus !== 'preliminary_authorized') {
    issues.push('Sh_d must be preliminary-authorized from the reproduced single-drop form.');
  }
  if (rate?.runtimeStatus !== 'not_activated') issues.push('Transfer rate must remain inactive.');
  if (!area?.d32Provenance.includes('engineer_entered_or_measured_future')) {
    issues.push('Interfacial area must retain an engineer-entered/measured d32 future provenance path.');
  }
  return issues;
}

const KH1999_SECONDARY_VARIABLES: Record<string, CorrelationVariable> = {
  Re: { symbol: 'Re', unit: '—', description: 'Drop Reynolds number: d32·Vs·rho_c/mu_c.' },
  Sc_c: { symbol: 'Sc_c', unit: '—', description: 'Continuous Schmidt number: mu_c/(rho_c·D_c).' },
  Sc_d: { symbol: 'Sc_d', unit: '—', description: 'Dispersed Schmidt number: mu_d/(rho_d·D_d).' },
  Pe_c: { symbol: 'Pe_c', unit: '—', description: 'Continuous Péclet number: d32·Vs/D_c.' },
  Vs: { symbol: 'V_s', unit: 'm s⁻¹', description: 'Slip velocity between phases.' },
  d32: { symbol: 'd32', unit: 'm', description: 'Sauter mean droplet diameter; remains independently governed.' },
  phi_d: { symbol: 'φ_d', unit: '—', description: 'Dispersed-phase holdup; printed as x_d in the 2011 paper.' },
  psi: { symbol: 'ψ', unit: 'W kg⁻¹', description: 'Power dissipated per unit mass; no Kühni-specific definition is enabled.' },
  rho_c: { symbol: 'ρ_c', unit: 'kg m⁻³', description: 'Continuous-phase density.' },
  rho_d: { symbol: 'ρ_d', unit: 'kg m⁻³', description: 'Dispersed-phase density.' },
  mu_c: { symbol: 'μ_c', unit: 'Pa·s', description: 'Continuous-phase viscosity.' },
  mu_d: { symbol: 'μ_d', unit: 'Pa·s', description: 'Dispersed-phase viscosity.' },
  sigma: { symbol: 'σ', unit: 'N m⁻¹', description: 'Interfacial tension.' },
  kappa: { symbol: 'κ', unit: '—', description: 'Viscosity ratio: μ_d/μ_c.' },
  D_c: { symbol: 'D_c', unit: 'm² s⁻¹', description: 'Continuous-phase solute diffusivity.' },
  D_d: { symbol: 'D_d', unit: 'm² s⁻¹', description: 'Dispersed-phase solute diffusivity.' },
  g: { symbol: 'g', unit: 'm s⁻²', description: 'Gravitational acceleration.' },
  m: { symbol: 'm', unit: '—', description: 'Undefined two-film slope in the printed source; not inferred.' },
};

// ── Registry ─────────────────────────────────────────────────────────────────

export const ECR2_CORRELATION_REGISTRY: readonly ECR2Correlation[] = [

  // ── 1. Sauter mean droplet diameter (d₃₂) ────────────────────────────────
  //
  // Kumar & Hartland (1996) — Kühni column, Eq. (3) as reproduced in
  // Laitinen et al. (2019), Chem. Eng. Res. Des., 146, 518–527.
  // STATUS: preliminary_engineering_reconstruction
  //
  // The reconstruction is explicitly approved for preliminary engineering
  // only. It remains unverified against the primary source, unvalidated for
  // RRBO/NMP, and uncalibrated to pilot data.
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
  // ── Resolution analysis — available sources ───────────────────────────────
  //
  //   Sources available without K&H 1996 primary paper:
  //     · Laitinen et al. (2019) Eq. (3) transcription — in this registry
  //     · K&H unified framework structure — secondary-source knowledge
  //     · Dimensional analysis — first-principles, source-independent
  //     · Kühni parameter table — secondary-verified (C1, C2, C3, n1, n2, n3)
  //
  // ── (a) UNRESOLVED_SYMBOL: numerator base for exponent n1=0.45 ─────────────
  //
  //   Laitinen Eq. (3) renders a single character "e" raised to 0.45. The
  //   character identity is the unresolved question.
  //
  //   Dimensional constraint (definitive): the numerator symbol must be
  //   DIMENSIONLESS — d₃₂/h is dimensionless, denominator is dimensionless,
  //   therefore numerator must be dimensionless. This rules out any dimensional
  //   quantity (e.g. ψ alone, ρ alone) as the base.
  //
  //   PRIMARY CANDIDATE: C₁^n₁ (framework analysis)
  //     Evidence:
  //       · The Kühni parameter table has 6 column-specific constants:
  //         C₁, C₂, C₃, n₁, n₂, n₃. C₂ is the Term₁ coefficient (confirmed 1.60),
  //         C₃ is the Term₂ coefficient (confirmed 0.034), n₂ is the Term₂
  //         agitation exponent (confirmed −0.63), n₃ is the Term₂ geometry
  //         exponent (resolved −0.38, see item b). This leaves C₁ and n₁=0.45
  //         unplaced. The natural K&H 1996 unified framework structure places
  //         C₁^n₁ in the numerator: d₃₂/h = C₁^n₁ / [denominator].
  //       · If the numerator were Euler's constant e (a universal constant),
  //         n₁=0.45 would be a fixed exponent with no column-type dependence.
  //         But n₁ IS column-specific in the K&H parameter table — different
  //         column types have different n₁ values — making it purposeless if
  //         the base were a universal constant.
  //       · C₁ is explicitly defined in the K&H unified framework as the
  //         column-type and transfer-direction constant. C₁^n₁ correctly
  //         incorporates column-type dependence through both C₁ and n₁.
  //       · For ECR-2 direction (d→c): C₁^n₁ = 3.04^0.45 ≈ 1.649275 — a
  //         physically reasonable prefactor (larger drops in d→c direction).
  //       · For c→d direction: C₁^n₁ = 1^0.45 = 1.000 — reduces to unity,
  //         consistent with c→d being the reference direction in K&H.
  //     Status: strong_candidate — NOT yet adopted.
  //     Requires: K&H 1996 primary paper (DOI 10.1021/ie950674w), Table 2
  //               or equation body — confirm symbol identity and C₁ placement.
  //
  //   SECONDARY CANDIDATE: Euler's constant e ≈ 2.71828
  //     Evidence: PDF character "e" most commonly denotes Euler's constant in
  //     mathematical typesetting; dimensionless ✓.
  //     Against: universal constant with no column-type dependence — makes n₁
  //     a purposeless parameter in the unified framework. e^0.45 ≈ 1.568 is a
  //     fixed prefactor, not calibrated to column type or transfer direction.
  //     Status: secondary_candidate — less likely than C₁^n₁ but not excluded.
  //
  //   EXCLUDED: any dimensional quantity alone (ψ, ρ, etc.)
  //     ψ^0.45 has units (m²/s³)^0.45 — NOT dimensionless. Definitively excluded
  //     by dimensional necessity. No dimensional variable can stand alone as the
  //     numerator base.
  //
  //   RESOLUTION PATHWAY: Read K&H 1996 primary paper (DOI 10.1021/ie950674w).
  //   Locate equation body and Table 2. Identify numerator symbol and confirm
  //   C₁ placement. Primary source verification required before adopting any
  //   candidate. Do NOT implement numerically until UNRESOLVED_SYMBOL is cleared.
  //
  // ── (b) UNRESOLVED_GROUPING: h-group in Term₂ ─────────────────────────────
  //
  //   Laitinen Eq. (3) transcription: h·(ρcg/γ)^0.38 inside (...)^(−1) in Term₂.
  //
  //   Dimensional constraint (DEFINITIVE — source-independent):
  //     ρcg/γ = [kg/(m²·s²)] / [kg/s²] = m⁻²
  //     (ρcg/γ)^0.38 has units m⁻⁰·⁷⁶
  //     h·(ρcg/γ)^0.38 has units m × m⁻⁰·⁷⁶ = m^+0.24 — NOT dimensionless.
  //   This is a definitive dimensional inconsistency. The Laitinen transcription
  //   as written CANNOT be correct. The correct grouping must be dimensionless.
  //
  //   PRIMARY CANDIDATE: [h·(ρcg/γ)^0.5]^0.38 = [h/λc]^0.38
  //     where λc = (γ/(ρcg))^0.5 = capillary length (continuous-phase basis)
  //
  //     Dimensional verification: h^0.38 × (ρcg/γ)^0.19 = m^0.38 × m⁻⁰·³⁸ = 1 ✓
  //
  //     Evidence:
  //       · K&H 1996 unified framework uses h/λc = h·(ρcg/γ)^0.5 as the
  //         fundamental dimensionless geometry-property group throughout.
  //         The column-type exponent n₃ is applied to this group: Term₂
  //         geometry contribution = [h/λc]^n₃ = [h/λc]^(-0.38) for Kühni.
  //       · In the equation, Term₂ writes [h_group]^(-1), so the outer inverse
  //         supplies the sign: h_group = [h/λc]^0.38 = [h·(ρcg/γ)^0.5]^0.38.
  //         This is fully consistent with n₃=−0.38 from the parameter table.
  //       · CRUCIAL parameter-table consistency check:
  //         If h_group = [h²·ρcg/γ]^0.38 (alternative), the effective exponent
  //         on [h/λc] would be 0.76 (since [h²ρcg/γ]^0.38 = [h/λc]^0.76),
  //         giving Term₂ contribution [h/λc]^(-0.76) → effective n₃ = −0.76.
  //         This contradicts the Kühni table value n₃=−0.38. The alternative
  //         is therefore INCONSISTENT with the parameter table.
  //       · The Laitinen typesetting error is identifiable: the 0.38 exponent
  //         should be on the ENTIRE group (h·(ρcg/γ)^0.5), not on (ρcg/γ) alone.
  //         This is a common LaTeX rendering ambiguity: (h·X^{0.5})^{0.38}
  //         vs h·X^{0.38} when grouping braces are dropped or misrendered.
  //     Status: strong_candidate — supported by dimensional necessity AND
  //             parameter-table consistency. NOT yet adopted.
  //     Requires: K&H 1996 primary paper confirmation of exact grouping.
  //
  //   REJECTED: h·(ρcg/γ)^0.38 as transcribed
  //     Definitively dimensionally inconsistent. Cannot be the correct form.
  //
  //   REJECTED: [h²·ρcg/γ]^0.38
  //     Dimensionless ✓, but inconsistent with Kühni parameter table n₃=−0.38
  //     (would imply effective n₃=−0.76). Rejected on framework grounds.
  //
  //   RESOLUTION PATHWAY: Read K&H 1996 primary paper. Confirm whether the
  //   geometry group in Term₂ for agitated columns is (h·(ρcg/γ)^0.5)^n₃
  //   or some other dimensionless grouping. Primary source verification required.
  //   Do NOT implement numerically until UNRESOLVED_GROUPING is cleared.
  //
  // ── (c) C1 placement ──────────────────────────────────────────────────────
  //   Superseded by resolution of UNRESOLVED_SYMBOL: if C₁^n₁ is confirmed as
  //   the numerator, C₁ is placed in the numerator as the base. See item (a).
  //   Resolve from K&H 1996 primary paper Table 2 together with item (a).
  //
  // ── (d) K&H 1996 fit ──────────────────────────────────────────────────────
  //   702 data points, average relative deviation 22%.
  //   Laitinen reports significant deviance vs their 2MTHF/water measurements,
  //   attributing it to experimental limitations in quantifying coalescence.
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
      'PRELIMINARY ENGINEERING RECONSTRUCTION — d32/h = C1^n1 / ' +
      '[C2·(γ/((ρc−ρd)·g·h²))^0.5 + C3·((ψ/g)·(ρc/(g·γ))^0.25)^n2·' +
      '(h·(ρcg/γ)^0.5)^n3], with C1=3.04, C2=1.60, C3=0.034, n1=0.45, n2=−0.63, n3=−0.38 for ECR-2 d→c. ' +
      'C1^n1 = 3.04^0.45 is applied once only; the geometry group is h/λc. ' +
      'Approved as Published Correlation — Preliminary Engineering with primary-source, phase-convention, RRBO/NMP validation, and uncalibrated-unity traceability warnings.',
    /*
    equation:
      'CANDIDATE — DO NOT IMPLEMENT. ' +
      'Reproduced from Laitinen et al. (2019) Eq. (3). ' +
      'd32/h = [SYMBOL:primary_candidate=C₁^n₁] / ' +
      '[1.6·(γ/((ρc−ρd)·g·h²))^(1/2) + ' +
      '0.034·((ψ/g)·(ρc/(g·γ))^(1/4))^(−0.63)·[GROUPING:strong_candidate=(h·(ρcg/γ)^0.5)^0.38]^(−1)] ' +
      '| UNRESOLVED_SYMBOL (primary_candidate — NOT YET ADOPTED): ' +
      '  Laitinen PDF renders a symbol raised to exponent n₁=0.45 in the numerator. ' +
      '  Primary candidate is C₁^n₁: C₁ and n₁=0.45 are the only Kühni-table constants ' +
      '  not yet placed in the equation (C₂, C₃, n₂, n₃ all positionally confirmed). ' +
      '  n₁ is column-specific — purposeless in the unified framework unless applied to C₁. ' +
      '  For ECR-2 (d→c): C₁^n₁ = 3.04^0.45 ≈ 1.649275. For c→d: 1^0.45 = 1.000. ' +
      '  This is a structural inference — NOT a verified published placement. ' +
      '  Requires K&H 1996 primary (DOI 10.1021/ie950674w) to confirm. ' +
      '| UNRESOLVED_GROUPING (strong_candidate — NOT YET ADOPTED): ' +
      '  Laitinen transcription "h·(ρcg/γ)^0.38" is DEFINITIVELY dimensionally wrong (m^+0.24). ' +
      '  Strong candidate: [h·(ρcg/γ)^0.5]^0.38 = [h/λc]^0.38 (dimensionless ✓). ' +
      '  Evidence: K&H framework uses [h/λc] as geometry group; n₃=−0.38 applied to [h/λc] gives ' +
      '  [h/λc]^(-0.38); equation writes this as [h_group]^(-1) with h_group=[h/λc]^0.38. ' +
      '  Alternative (h²ρcg/γ)^0.38 = [h/λc]^0.76 REJECTED: implies effective n₃=−0.76, ' +
      '  contradicting Kühni parameter table value n₃=−0.38. ' +
      '  Requires K&H 1996 primary to confirm. ' +
      '| KÜHNI PARAMETER TABLE (secondary-verified): ' +
      '  C1(c→d)=1, C1(d→c)=3.04, C2=1.60, C3=0.034, n1=0.45, n2=−0.63, n3=−0.38. ' +
      '  ECR-2 direction is d→c, so C1=3.04. ' +
      '  C2 confirmed at Term₁ (1.6). C3 confirmed at Term₂ (0.034). n2 confirmed (−0.63). ' +
      '  C1 and n1 are strong_candidates for numerator C₁^n₁ — pending primary confirmation.',
    */

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
        symbol: '[UNRESOLVED_SYMBOL — primary_candidate: C₁^n₁]',
        unit: '—',
        description:
          'UNRESOLVED_SYMBOL: numerator base for exponent n1=0.45. ' +
          'Laitinen Eq. (3) PDF renders a single-character "e" raised to 0.45. ' +
          '' +
          'DIMENSIONAL CONSTRAINT (definitive): the base must be dimensionless. ' +
          'd₃₂/h is dimensionless; denominator is dimensionless; therefore the numerator ' +
          '[symbol]^0.45 must be dimensionless. Any dimensional quantity is excluded. ' +
          '' +
          'PRIMARY CANDIDATE: C₁^n₁ (K&H unified framework analysis) ' +
          '  · The Kühni parameter table has 6 column-specific constants: C₁, C₂, C₃, n₁, n₂, n₃. ' +
          '    C₂=1.60 (Term₁ coefficient, confirmed), C₃=0.034 (Term₂ coefficient, confirmed), ' +
          '    n₂=−0.63 (Term₂ agitation exponent, confirmed), n₃=−0.38 (Term₂ geometry exponent, ' +
          '    resolved). Only C₁ and n₁=0.45 remain unplaced. ' +
          '  · The natural K&H unified framework structure places C₁^n₁ in the numerator. ' +
          '  · n₁=0.45 is a column-specific parameter — it must depend on column type. ' +
          '    If the base were a universal constant (Euler e, or any fixed value), n₁ would ' +
          '    give the same result for all column types — making it purposeless as a ' +
          '    column-specific parameter. C₁^n₁ incorporates column-type variation through both. ' +
          '  · For ECR-2 direction (d→c): C₁^n₁ = 3.04^0.45 ≈ 1.649275 (larger drops in d→c). ' +
          '  · For c→d reference direction: C₁^n₁ = 1^0.45 = 1.000 (unity — base case). ' +
          '  Status: strong_candidate — NOT adopted. Requires K&H 1996 primary confirmation. ' +
          '' +
          'SECONDARY CANDIDATE: Euler\'s constant e ≈ 2.71828 ' +
          '  · PDF character "e" is the standard mathematical typesetting for Euler\'s constant. ' +
          '  · Dimensionless ✓. e^0.45 ≈ 1.568. ' +
          '  · Against: universal constant with no column-type dependence — makes n₁ purposeless ' +
          '    as a column-specific parameter in the K&H unified framework. ' +
          '  Status: secondary_candidate — possible but less likely than C₁^n₁. ' +
          '' +
          'RESOLUTION REQUIRED: K&H 1996 primary paper (DOI 10.1021/ie950674w), Table 2 ' +
          'or equation body. Confirm symbol identity and C₁ placement. ' +
          'DO NOT IMPLEMENT until UNRESOLVED_SYMBOL is cleared.',
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
        symbol: '[UNRESOLVED_GROUPING — strong_candidate: (h·(ρcg/γ)^0.5)^0.38 = (h/λc)^0.38]',
        unit: '— [dimensionless when correct grouping is applied]',
        description:
          'UNRESOLVED_GROUPING: geometry-property group from Term₂ of Laitinen Eq. (3). ' +
          '' +
          'LAITINEN TRANSCRIPTION (DEFINITIVELY WRONG): h·(ρcg/γ)^0.38 ' +
          '  ρcg/γ = [kg/(m²·s²)]/[kg/s²] = m⁻² ' +
          '  (ρcg/γ)^0.38 has units m⁻⁰·⁷⁶ ' +
          '  h·(ρcg/γ)^0.38 has units m × m⁻⁰·⁷⁶ = m^+0.24 — NOT dimensionless. ' +
          '  The Laitinen transcription as written is dimensionally inconsistent. ' +
          '  Term₂ must be dimensionless, so the h-group MUST be dimensionless. ' +
          '  The transcribed form is definitively incorrect — primary-source-independent conclusion. ' +
          '' +
          'STRONG CANDIDATE: [h·(ρcg/γ)^0.5]^0.38 = [h/λc]^0.38 ' +
          '  where λc = (γ/(ρcg))^0.5 = capillary length (continuous-phase density basis). ' +
          '  Dimensional verification: h^0.38 × (ρcg/γ)^0.19 = m^0.38 × m⁻⁰·³⁸ = 1 ✓ ' +
          '  ' +
          '  Evidence chain: ' +
          '  1. K&H 1996 unified framework uses h/λc = h·(ρcg/γ)^0.5 as the fundamental ' +
          '     dimensionless geometry-property group for all agitated columns. ' +
          '  2. Column-type exponent n₃ is applied to this group: [h/λc]^n₃. ' +
          '     For Kühni: n₃=−0.38. Term₂ contribution = [h/λc]^(−0.38). ' +
          '  3. Equation writes Term₂ as [h_group]^(−1), so h_group = [h/λc]^0.38 ' +
          '     = [h·(ρcg/γ)^0.5]^0.38. The outer (−1) supplies the n₃ sign. ' +
          '  4. PARAMETER TABLE CONSISTENCY CHECK: ' +
          '     Alternative (h²ρcg/γ)^0.38 = [h/λc]^0.76 implies effective n₃=−0.76. ' +
          '     This CONTRADICTS the Kühni table value n₃=−0.38. REJECTED. ' +
          '  5. TYPESETTING ERROR DIAGNOSIS: Laitinen likely wrote (h·(ρcg/γ)^0.5)^0.38 ' +
          '     but the 0.38 exponent was typeset on (ρcg/γ) instead of on the whole group. ' +
          '     This is a common LaTeX rendering ambiguity. ' +
          '  Status: strong_candidate — NOT yet adopted. ' +
          '  Requires: K&H 1996 primary paper confirmation of exact grouping. ' +
          '' +
          'REJECTED: h·(ρcg/γ)^0.38 (Laitinen transcription) ' +
          '  Definitively dimensionally inconsistent. Cannot be the correct form. ' +
          '' +
          'REJECTED: (h²·ρcg/γ)^0.38 = Eo_c^0.38 ' +
          '  Dimensionless ✓, but implies effective n₃=−0.76, contradicting ' +
          '  Kühni parameter table n₃=−0.38. Rejected on framework grounds. ' +
          '' +
          'RESOLUTION REQUIRED: K&H 1996 primary paper (DOI 10.1021/ie950674w). ' +
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
        symbol: 'C1=3.04 (ECR-2 d→c direction)',
        unit: '—',
        description:
          'Kühni coefficient C1(d→c)=3.04 from the secondary-verified parameter table. ' +
          'ECR-2 direction is d→c (RRBO→NMP), so C1=3.04 applies. ' +
          'C1(c→d)=1 is the reference direction in the K&H framework. ' +
          '' +
          'PLACEMENT ANALYSIS (post-resolution analysis): ' +
          'If UNRESOLVED_SYMBOL is confirmed as C₁ (primary candidate), then the ' +
          'numerator is C₁^n₁ and C₁ is fully placed: ' +
          '  · C₁(c→d)^n₁ = 1^0.45 = 1.000 (reference/baseline) ' +
          '  · C₁(d→c)^n₁ = 3.04^0.45 ≈ 1.649275 (ECR-2 value) ' +
          'This would resolve the C₁ placement question together with UNRESOLVED_SYMBOL. ' +
          '' +
          'If UNRESOLVED_SYMBOL is confirmed as Euler\'s e, then C₁=3.04 must appear ' +
          'elsewhere — as a separate multiplier, absorbed factor, or in a different term. ' +
          'That alternative placement would need to be identified from the primary paper. ' +
          '' +
          'RESOLUTION: tied to UNRESOLVED_SYMBOL. Read K&H 1996 primary paper ' +
          'Table 2 and equation body to confirm both simultaneously.',
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

    applicabilityStatus: 'preliminary_engineering_reconstruction',
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
      'preliminary_engineering_reconstruction: approved best-supported K&H 1996 reconstruction from Laitinen et al. (2019), Eq. (3) — ' +
      'peer-reviewed secondary source using K&H 1996. secondaryReproductionVerified=true. ' +
      '' +
      'RESOLUTION ANALYSIS COMPLETE — TWO FLAGS REMAIN OPEN PENDING PRIMARY PAPER: ' +
      '' +
      'UNRESOLVED_SYMBOL (analysis status: primary_candidate identified, NOT adopted): ' +
      '  Laitinen PDF renders a symbol raised to exponent n₁=0.45 in the numerator. ' +
      '  PRIMARY CANDIDATE: C₁^n₁ — structural inference from K&H unified framework: ' +
      '  C₁ and n₁=0.45 are the only two Kühni table constants not yet placed (C₂, C₃, n₂, ' +
      '  n₃ all positionally confirmed). n₁ is column-specific — purposeless in the unified ' +
      '  framework unless applied to column-type constant C₁. ' +
      '  ECR-2 value if confirmed: C₁(d→c)^n₁ = 3.04^0.45 ≈ 1.649275. ' +
      '  This is a structural inference — NOT verified published placement. ' +
      '  DIMENSIONAL CONSTRAINT (definitive): base must be dimensionless — ψ and any ' +
      '  dimensional quantity are definitively excluded. ' +
      '  Approved for preliminary engineering only: retain this reconstruction warning on every numerical result. ' +
      '' +
      'UNRESOLVED_GROUPING (analysis status: strong_candidate identified, NOT adopted): ' +
      '  Laitinen transcription h·(ρcg/γ)^0.38 is DEFINITIVELY dimensionally wrong (m^+0.24). ' +
      '  STRONG CANDIDATE: [h·(ρcg/γ)^0.5]^0.38 = [h/λc]^0.38 — supported by: ' +
      '    (i)  dimensional necessity (the transcribed form is definitively wrong); ' +
      '    (ii) K&H framework: h/λc = h·(ρcg/γ)^0.5 is the fundamental geometry group; ' +
      '    (iii) parameter table consistency: n₃=−0.38 applied to [h/λc] gives [h/λc]^(-0.38); ' +
      '          equation writes [h_group]^(-1) → h_group = [h/λc]^0.38 ✓; ' +
      '    (iv) alternative (h²ρcg/γ)^0.38 = [h/λc]^0.76 implies effective n₃=−0.76, ' +
      '         contradicting Kühni table n₃=−0.38 — REJECTED on framework grounds. ' +
      '  Typesetting diagnosis: exponent 0.38 was placed on (ρcg/γ) instead of on the ' +
      '  whole group (h·(ρcg/γ)^0.5) in the Laitinen PDF — a known LaTeX rendering issue. ' +
      '  Approved for preliminary engineering only: retain this reconstruction warning on every numerical result. ' +
      '' +
      'KÜHNI PARAMETER TABLE — PLACEMENT STATUS: ' +
      '  C1(c→d)=1, C1(d→c)=3.04 — primary_candidate placement: numerator as C₁^n₁. ' +
      '  C2=1.60  — CONFIRMED in Term₁ as coefficient on (Eo_d)^(−0.5). ' +
      '  C3=0.034 — CONFIRMED in Term₂ as coefficient on agitation-geometry group. ' +
      '  n1=0.45  — primary_candidate placement: exponent on C₁ in numerator. ' +
      '  n2=−0.63 — CONFIRMED in Term₂ as exponent on agitation group. ' +
      '  n3=−0.38 — strong_candidate placement: exponent on [h/λc] in Term₂ (UNRESOLVED_GROUPING ' +
      '             pending K&H 1996 primary paper; parameter table consistent but not primary-verified). ' +
      '' +
      'Before advancing this preliminary reconstruction to governed: ' +
      '(1) Read K&H 1996 primary paper (DOI 10.1021/ie950674w). ' +
      '    Clear UNRESOLVED_SYMBOL: confirm numerator symbol (primary candidate: C₁^n₁) from equation body. ' +
      '    Clear UNRESOLVED_GROUPING: confirm geometry group (strong candidate: (h·(ρcg/γ)^0.5)^0.38). ' +
      '    Confirm C₁ and n₁ placements from Table 2 and equation body. ' +
      '(2) Set primarySourceVerified = true with engineer name and date. ' +
      '(3) Confirm K&H 1996 Kühni experimental dataset phase convention ' +
      '    matches ECR-2 phase assignment (RRBO dispersed, NMP continuous). ' +
      '(4) Verify NMP/RRBO system properties lie within K&H 1996 validity range. ' +
      'The present implementation is limited to Published Correlation — Preliminary Engineering. ' +
      'Do not set primarySourceVerified or validatedForRRBONMP true, and do not claim a calibrated performance guarantee.',
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
    id: 'ecr2_kh1999_shc_secondary',
    quantity: 'mass_transfer',
    name: 'K&H 1999 Continuous-Side Sherwood Structure — Secondary Verified',
    source:
      'Torab-Mostaedi, M.; Ghaemi, A.; Asadollahzadeh, M.; Pejmanzad, P. ' +
      '"Mass Transfer Performance in Pulsed Disc and Doughnut Extraction Columns." ' +
      'Brazilian Journal of Chemical Engineering 28(3), 447–456 (2011), Eq. (8). ' +
      'Independently reproduced for a Kühni column by Asadollahzadeh, M.; Torkaman, R.; ' +
      'Torab-Mostaedi, M., Iranian Journal of Chemistry & Chemical Engineering 36(5), 149–161 (2017), Table 3 Eq. (18).',
    secondarySourceEquation: '2011 Eq. (8); 2017 Table 3 Eq. (18).',
    originalAttribution: 'Attributed by both secondary sources to Kumar & Hartland (1999).',
    equation:
      '((Sh_c/(1−φ_d))−Sh_c,rigid)/(Sh_c,infinity−(Sh_c/(1−φ_d))) = 5.26×10⁻²·Re^(1/3+6.59×10⁻²·Re^0.25)·Sc_c^(1/3)·(V_s·μ_c/σ)^(1/3)·[1/(1+κ^1.1)]·[1+C1·{(ψ/g)·(ρ_c/(g·σ))^0.25}^(1/3)].',
    variables: {
      ...KH1999_SECONDARY_VARIABLES,
      Sh_c: { symbol: 'Sh_c', unit: '—', description: 'Continuous-phase Sherwood number.' },
      Sh_c_rigid: { symbol: 'Sh_c,rigid', unit: '—', description: 'Rigid-drop continuous-side limit from 2011 Eq. (10).' },
      Sh_c_infinity: { symbol: 'Sh_c,∞', unit: '—', description: 'Infinite-circulation continuous-side limit from 2011 Eq. (11).' },
      C1: { symbol: 'C1', unit: '—', description: 'Use only scoped Kuhni identifier kh1999_shc_agitation_C1_kuhni (7.5); no global C1 lookup.' },
    },
    validityRange: {},
    applicabilityStatus: 'secondary_equation_verified',
    correlationStatus: 'secondary_equation_verified',
    numericalUse: 'preliminary_authorized',
    primarySourceVerified: false,
    secondaryReproductionVerified: true,
    validatedForRRBONMP: false,
    approvalNote:
      'The printed equation structure and Kühni C1=7.5 are secondary-verified metadata only. ' +
      'Kühni ψ, regime treatment, original validity ranges, RRBO/NMP validation, and runtime authorisation are not recovered; do not evaluate Sh_c.',
  },
  {
    id: 'ecr2_kh1999_shc_rigid_secondary',
    quantity: 'mass_transfer',
    name: 'K&H 1999 Continuous-Side Rigid-Drop Limit — Secondary Verified',
    source: 'Torab-Mostaedi et al., Brazilian Journal of Chemical Engineering 28(3), 447–456 (2011), Eq. (10).',
    secondarySourceEquation: '2011 Eq. (10).',
    originalAttribution: 'Printed within the K&H (1999) correlation framework.',
    equation: 'Sh_c,rigid = 2.43 + 0.775·Re^0.5·Sc_c^(1/3) + 0.0103·Re·Sc_c^(1/3).',
    variables: { ...KH1999_SECONDARY_VARIABLES, Sh_c_rigid: { symbol: 'Sh_c,rigid', unit: '—', description: 'Rigid-drop continuous-side Sherwood limit.' } },
    validityRange: {},
    applicabilityStatus: 'secondary_equation_verified',
    correlationStatus: 'secondary_equation_verified',
    numericalUse: 'preliminary_authorized',
    primarySourceVerified: false,
    secondaryReproductionVerified: true,
    validatedForRRBONMP: false,
    approvalNote: 'Exact secondary reproduction recorded. Original K&H validity range and an authorised ECR-2 regime selector were not recovered; not evaluated independently.',
  },
  {
    id: 'ecr2_kh1999_shc_infinity_secondary',
    quantity: 'mass_transfer',
    name: 'K&H 1999 Continuous-Side Infinite-Circulation Limit — Secondary Verified',
    source: 'Torab-Mostaedi et al., Brazilian Journal of Chemical Engineering 28(3), 447–456 (2011), Eq. (11).',
    secondarySourceEquation: '2011 Eq. (11).',
    originalAttribution: 'Printed within the K&H (1999) correlation framework.',
    equation: 'Sh_c,infinity = 50 + (2/sqrt(π))·Pe_c^0.5; Pe_c = d32·V_s/D_c.',
    variables: { ...KH1999_SECONDARY_VARIABLES, Sh_c_infinity: { symbol: 'Sh_c,∞', unit: '—', description: 'Infinite-circulation continuous-side Sherwood limit.' } },
    validityRange: {},
    applicabilityStatus: 'secondary_equation_verified',
    correlationStatus: 'secondary_equation_verified',
    numericalUse: 'preliminary_authorized',
    primarySourceVerified: false,
    secondaryReproductionVerified: true,
    validatedForRRBONMP: false,
    approvalNote: 'Exact secondary reproduction recorded. It remains part of the inactive Sh_c chain pending a governed Kühni ψ and regime treatment.',
  },
  {
    id: 'ecr2_kh1999_shd_secondary',
    quantity: 'mass_transfer',
    name: 'K&H 1999 Dispersed-Side Sherwood Structure — Secondary Verified',
    source: 'Torab-Mostaedi et al., Brazilian Journal of Chemical Engineering 28(3), 447–456 (2011), Eq. (9).',
    secondarySourceEquation: '2011 Eq. (9).',
    originalAttribution: 'Attributed by the secondary source to Kumar & Hartland (1999).',
    equation:
      'Sh_d = 17.7 + [3.19×10⁻³·(Re·Sc_d^(1/3))^1.7/(1+1.43×10⁻²·(Re·Sc_d^(1/3))^0.7)]·(ρ_d/ρ_c)^(2/3)·[1/(1+κ^(2/3))].',
    variables: {
      ...KH1999_SECONDARY_VARIABLES,
      Sh_d: { symbol: 'Sh_d', unit: '—', description: 'Dispersed-phase Sherwood number.' },
    },
    validityRange: {},
    applicabilityStatus: 'secondary_equation_verified',
    correlationStatus: 'secondary_equation_verified',
    numericalUse: 'preliminary_authorized',
    primarySourceVerified: false,
    secondaryReproductionVerified: true,
    validatedForRRBONMP: false,
    approvalNote:
      'The reproduced single-drop terms are preliminary-authorized. Original validity ranges and RRBO/NMP validation remain pending; no column-specific correction has been added.',
  },
  {
    id: 'ecr2_kh1999_two_film_secondary',
    quantity: 'mass_transfer',
    name: 'K&H 1999 Continuous-Basis Two-Film Relation — Secondary Verified',
    source: 'Torab-Mostaedi et al., Brazilian Journal of Chemical Engineering 28(3), 447–456 (2011), Eq. (13).',
    secondarySourceEquation: '2011 Eq. (13).',
    originalAttribution: 'Printed in the K&H (1999) mass-transfer framework.',
    equation: '1/k_oc = 1/k_c + m/k_d.',
    variables: {
      ...KH1999_SECONDARY_VARIABLES,
      k_oc: { symbol: 'k_oc', unit: 'm s⁻¹ (conditional)', description: 'Printed nomenclature reports s⁻¹, but the resistance equation is dimensionally consistent only on a film-coefficient m/s basis; discrepancy is preserved.' },
      k_c: { symbol: 'k_c', unit: 'm s⁻¹', description: 'Continuous-side film coefficient.' },
      k_d: { symbol: 'k_d', unit: 'm s⁻¹', description: 'Dispersed-side film coefficient.' },
    },
    validityRange: {},
    applicabilityStatus: 'secondary_equation_verified',
    correlationStatus: 'secondary_equation_verified',
    numericalUse: 'preliminary_authorized',
    primarySourceVerified: false,
    secondaryReproductionVerified: true,
    validatedForRRBONMP: false,
    approvalNote:
      'Equation recorded exactly as printed. The source does not define m or the ECR-2 partition basis, and its k_oc nomenclature unit conflicts with film-coefficient dimensions. No overall coefficient is authorised.',
  },
  {
    id: 'ecr2_kh1999_interfacial_area_secondary',
    quantity: 'interfacial_area',
    name: 'Specific Interfacial Area a = 6φ_d/d32 — Secondary Recorded',
    source: 'Torab-Mostaedi et al., Brazilian Journal of Chemical Engineering 28(3), 447–456 (2011), prose accompanying conversion of volumetric coefficient to k_oc.',
    secondarySourceEquation: '2011 prose accompanying Eq. (13); no equation number assigned.',
    originalAttribution: 'The secondary source states the geometric relation but does not explicitly attribute it to K&H (1999).',
    equation: 'a = 6·φ_d/d32.',
    variables: { ...KH1999_SECONDARY_VARIABLES, a: { symbol: 'a', unit: 'm² m⁻³', description: 'Specific interfacial area.' } },
    validityRange: {},
    applicabilityStatus: 'secondary_equation_verified',
    correlationStatus: 'secondary_equation_verified',
    numericalUse: 'independently_available',
    primarySourceVerified: false,
    secondaryReproductionVerified: true,
    validatedForRRBONMP: false,
    approvalNote:
      'This existing geometric calculation is independently guarded by usable K&H 1995 holdup and an independently governed or engineer-supplied d32. It does not activate any K&H 1999 transfer-rate calculation.',
  },
  {
    id: 'ecr2_koa_kh1999',
    quantity: 'mass_transfer',
    name: 'K&H 1999 Mass-Transfer Runtime Activation Gate',

    source:
      'Runtime gate for the separately registered K&H 1999 secondary evidence: ' +
      'Torab-Mostaedi et al. (2011), Eqs. (8)–(13), and Asadollahzadeh et al. (2017), Table 3 Eq. (18). ' +
      'Original attribution: Kumar & Hartland (1999), Transactions of the Institution of Chemical Engineers, Part A, 77, 372–384.',

    // ── Evidence boundary ────────────────────────────────────────────────────
    //
    // The controlled preliminary kernel is intentionally limited to:
    //   Kd,i = Cd,i* / Cc,i* (physical equilibrium mass concentrations)
    //   ΔCd,i = Cd,i − Kd,i·Cc,i
    //
    // Film definitions and the resistance-in-series form are retained as
    // interface contracts only:
    //   kc,i = Shc,i·De,c,i/d32
    //   kd,i = Shd,i·De,d,i/d32
    //   Kod,i = kc,i·kd,i/(Kd,i·kd,i + kc,i)
    //   Koa,i = Kod,i·a
    //
    // No complete source-backed Shc/Shd form, regime-selection rule, low-Re
    // policy, or C1/C2/Fc/Fd placement is presently available. Do not infer one
    // from the partial historic secondary-source transcription.
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
      'MASS_TRANSFER_RUNTIME_GATE — controlled numerical scope: Kd,i = Cd,i*/Cc,i* and ' +
      'ΔCd,i = Cd,i − Kd,i·Cc,i on physical mass-concentration basis. Interface contracts only: ' +
      'kc=Shc·De,c/d32; kd=Shd·De,d/d32; Kod=kc·kd/(Kd·kd+kc); Koa=Kod·a. ' +
      'Secondary equation metadata does not authorise Shc/Shd or dependent runtime quantities: ' +
      'Kühni ψ, Kuhni C2, regime selection, m/partition basis, original validity ranges, and activation approval remain unresolved. ' +
      'Apply the controlled subset per component Sat/Mono/Di/Poly.',

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
          'Continuous-phase Sherwood number. Its complete source-backed equation and exact correction placement are unresolved; numerical evaluation is prohibited.',
      },
      Shd: {
        symbol: 'Shd',
        unit: '—',
        description:
          'Dispersed-phase Sherwood number. Its complete source-backed equation, regime selection, and exact correction placement are unresolved; numerical evaluation is prohibited.',
      },
      provisional_C1: {
        symbol: 'C1',
        unit: '—',
        description: 'Project provisional C1 = 0.90, scoped outside the secondary equation registry. Exact role is unresolved; not applied numerically.',
      },
      provisional_C2: {
        symbol: 'C2',
        unit: '—',
        description: 'Project provisional C2 = 0.45, scoped outside the secondary equation registry. Exact role is unresolved; not applied numerically.',
      },
      provisional_Fc: {
        symbol: 'Fc',
        unit: '—',
        description: 'Project provisional Fc = 0.76. It does not occur in the accepted secondary evidence and is not applied numerically.',
      },
      provisional_Fd: {
        symbol: 'Fd',
        unit: '—',
        description: 'Project provisional Fd = 0.58. It does not occur in the accepted secondary evidence and is not applied numerically.',
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

    validityRange: {},

    applicabilityStatus: 'candidate_governed',
    correlationStatus: 'candidate_governed',
    numericalUse: 'not_authorized',
    primarySourceVerified: false,
    secondaryReproductionVerified: true,   // Framework reproduced from Laitinen (2019)
    validatedForRRBONMP: false,

    approvalNote:
      'The preliminary project constants remain separately scoped with unresolved equation roles. Controlled numerical work remains ' +
      'limited to physical concentration conversion, Kd=Cd*/Cc*, and driving-force reporting. Secondary equation metadata is now ' +
      'recorded separately, but Kuhni ψ, Kuhni C2, regime selection, m/partition basis, original validity ranges, and runtime approval ' +
      'remain unresolved; Sh, film coefficients, Kod, Koa, and rates MUST remain unavailable.',
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
