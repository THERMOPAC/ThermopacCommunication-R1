/**
 * Governed evidence boundary for the ECR-2 Stage 8 numerical dependencies.
 *
 * Physical RRBO family values are supplied only by the separate, provenance-
 * tagged physical-property registry.  They never become Coto/NRTL values.
 */

import {
  ECR2_RRBO_SN300_PHYSICAL_COMPONENT_BASIS,
  type Ecr2PhysicalComponentKey,
} from './ecr2-physical-property-basis';

export const ECR2_STAGE8_NUMERICAL_PARAMETER_IDS = [
  'physical_mw_sat',
  'physical_mw_mono',
  'physical_mw_di',
  'physical_mw_poly',
  'diffusivity_sat_c',
  'diffusivity_sat_d',
  'diffusivity_mono_c',
  'diffusivity_mono_d',
  'diffusivity_di_c',
  'diffusivity_di_d',
  'diffusivity_poly_c',
  'diffusivity_poly_d',
  'diffusivity_nmp_c',
  'diffusivity_nmp_d',
  'kuhni_shd_c2',
] as const;

export type ECR2Stage8NumericalParameterId =
  typeof ECR2_STAGE8_NUMERICAL_PARAMETER_IDS[number];

export type ECR2EvidenceLevel =
  | 'PROJECT_MEASURED'
  | 'VENDOR_DOCUMENTED'
  | 'PRIMARY_EQUATION_VERIFIED'
  | 'SECONDARY_EQUATION_VERIFIED'
  | 'ENGINEER_APPROVED_PRELIMINARY'
  | 'MISSING';

export type ECR2EvidenceResolutionStatus =
  | 'AUTO_RESOLVED_PENDING_ACCEPTANCE'
  | 'CALCULATED_PRELIMINARY'
  | 'ACCEPTED_AUTO_BASIS'
  | 'ENGINEER_OVERRIDE'
  | 'BLOCKED_MISSING_REQUIRED_EVIDENCE'
  | 'APPROVAL_REQUIRED';

export interface ECR2Stage8EvidenceRecord {
  id: ECR2Stage8NumericalParameterId;
  label: string;
  unit: 'g/mol' | 'm2/s' | '—';
  sourcePriority: readonly ECR2EvidenceLevel[];
  evidenceLevel: ECR2EvidenceLevel;
  status: ECR2EvidenceResolutionStatus;
  value?: number;
  basis: string;
  method: string;
  source: string;
  applicability: string;
  validationStatus: 'RRBO_NMP_VALIDATION_PENDING' | 'NOT_APPLICABLE';
  /** True only when RRBO/NMP-specific transport validation exists. */
  validatedForRRBONMP?: boolean;
  /** Calibration remains a future evidence path, not a first-run prerequisite. */
  pilotCalibrationStatus?: 'NOT_YET_VALIDATED' | 'CALIBRATED';
  warnings: readonly string[];
  blockingReason?: string;
  resolutionInputs?: readonly string[];
  inputSnapshot?: Readonly<Record<string, string | number>>;
  version?: string;
  requiredInputs?: readonly string[];
  availableInputs?: readonly string[];
  missingInputs?: readonly string[];
  uncertainty?: string;
  physicalMwDecision?: 'PHYSICAL_MW_GOVERNED' | 'PHYSICAL_MW_PRELIMINARY_APPROVED_BASIS' | 'PHYSICAL_MW_EVIDENCE_NOT_CLOSED';
}

const BASE_PRIORITY = [
  'PROJECT_MEASURED',
  'VENDOR_DOCUMENTED',
  'PRIMARY_EQUATION_VERIFIED',
  'SECONDARY_EQUATION_VERIFIED',
  'ENGINEER_APPROVED_PRELIMINARY',
] as const;

const physicalMw = (
  id: Extract<ECR2Stage8NumericalParameterId, `physical_mw_${string}`>,
  label: string,
  key: Ecr2PhysicalComponentKey,
): ECR2Stage8EvidenceRecord => ({
  id,
  label,
  unit: 'g/mol',
  sourcePriority: BASE_PRIORITY,
  evidenceLevel: 'MISSING',
  status: 'BLOCKED_MISSING_REQUIRED_EVIDENCE',
  basis: 'Physical RRBO pseudo-component characterization only; never the Coto/NRTL surrogate molecular-weight basis.',
  method: 'No project GC/MS, GPC, distillation, vendor characterization, or explicitly approved pseudo-component basis is registered.',
  source: 'No eligible evidence record.',
  applicability: 'RRBO SN300 pseudo-component characterization required.',
  validationStatus: 'RRBO_NMP_VALIDATION_PENDING',
  warnings: [
    'Coto surrogate molecular weights are thermodynamic-coordinate data and are prohibited here.',
    ...ECR2_RRBO_SN300_PHYSICAL_COMPONENT_BASIS[key].warnings,
  ],
  blockingReason: 'A traceable physical RRBO pseudo-component molecular-weight basis is required.',
  version: ECR2_RRBO_SN300_PHYSICAL_COMPONENT_BASIS[key].sourceVersion,
  requiredInputs: ECR2_RRBO_SN300_PHYSICAL_COMPONENT_BASIS[key].requiredInputs,
  availableInputs: ECR2_RRBO_SN300_PHYSICAL_COMPONENT_BASIS[key].availableInputs,
  missingInputs: ECR2_RRBO_SN300_PHYSICAL_COMPONENT_BASIS[key].missingInputs,
  uncertainty: ECR2_RRBO_SN300_PHYSICAL_COMPONENT_BASIS[key].uncertainty,
  physicalMwDecision: 'PHYSICAL_MW_EVIDENCE_NOT_CLOSED',
});

const diffusivity = (
  id: Extract<ECR2Stage8NumericalParameterId, `diffusivity_${string}`>,
  label: string,
  phase: 'continuous NMP-rich' | 'dispersed RRBO-rich',
  isNmpSelfDiffusion = false,
): ECR2Stage8EvidenceRecord => ({
  id,
  label,
  unit: 'm2/s',
  sourcePriority: BASE_PRIORITY,
  evidenceLevel: isNmpSelfDiffusion ? 'MISSING' : 'SECONDARY_EQUATION_VERIFIED',
  status: 'BLOCKED_MISSING_REQUIRED_EVIDENCE',
  basis: isNmpSelfDiffusion
    ? 'NMP self-diffusion in the continuous NMP-rich phase is distinct from a dilute solute-in-solvent estimate.'
    : `${phase} infinite-dilution estimate; solvent viscosity must be at the actual isothermal operating temperature.`,
  method: isNmpSelfDiffusion
    ? 'No approved NMP self-diffusion route is registered.'
    : 'Wilke–Chang (1955) SI form; calculation is allowed only when every physical input is traceable.',
  source: isNmpSelfDiffusion
    ? 'No eligible NMP self-diffusion evidence record.'
    : 'Wilke, C.R.; Chang, P. (1955), AIChE Journal, 1(2), 264–270, doi:10.1002/aic.690010222. SI implementation independently reproduced by PolyKin.',
  applicability: `${phase}; infinite-dilution correlation evidence is not validated specifically for RRBO/NMP.`,
  validationStatus: 'RRBO_NMP_VALIDATION_PENDING',
  warnings: isNmpSelfDiffusion
    ? ['Do not treat NMP self-diffusion as a Wilke–Chang pseudo-solute calculation.']
    : ['Requires solute physical MW and density/molar volume, solvent MW, solvent association factor, and operating-temperature viscosity.'],
  blockingReason: isNmpSelfDiffusion
    ? 'Measured or explicitly approved NMP self-diffusion evidence is required.'
    : 'Required physical characterization or operating-temperature correlation inputs are not registered.',
});

export const ECR2_STAGE8_EVIDENCE_CATALOG: readonly ECR2Stage8EvidenceRecord[] = [
  physicalMw('physical_mw_sat', 'Physical MW — Saturates', 'sat'),
  physicalMw('physical_mw_mono', 'Physical MW — Mono-aromatics', 'mono'),
  physicalMw('physical_mw_di', 'Physical MW — Di-aromatics', 'di'),
  physicalMw('physical_mw_poly', 'Physical MW — Poly-aromatics', 'poly'),
  diffusivity('diffusivity_sat_c', 'Dc Saturates', 'continuous NMP-rich'),
  diffusivity('diffusivity_sat_d', 'Dd Saturates', 'dispersed RRBO-rich'),
  diffusivity('diffusivity_mono_c', 'Dc Mono-aromatics', 'continuous NMP-rich'),
  diffusivity('diffusivity_mono_d', 'Dd Mono-aromatics', 'dispersed RRBO-rich'),
  diffusivity('diffusivity_di_c', 'Dc Di-aromatics', 'continuous NMP-rich'),
  diffusivity('diffusivity_di_d', 'Dd Di-aromatics', 'dispersed RRBO-rich'),
  diffusivity('diffusivity_poly_c', 'Dc Poly-aromatics', 'continuous NMP-rich'),
  diffusivity('diffusivity_poly_d', 'Dd Poly-aromatics', 'dispersed RRBO-rich'),
  diffusivity('diffusivity_nmp_c', 'Dc NMP', 'continuous NMP-rich', true),
  diffusivity('diffusivity_nmp_d', 'Dd NMP', 'dispersed RRBO-rich'),
  {
    id: 'kuhni_shd_c2',
    label: 'Kühni Shd C2',
    unit: '—',
    sourcePriority: BASE_PRIORITY,
    evidenceLevel: 'MISSING',
    status: 'APPROVAL_REQUIRED',
    basis: 'Exact Kühni dispersed-side K&H 1999 Shd equation identity and coefficient placement.',
    method: 'No numerical resolution is permitted until the exact equation, device applicability, phase basis, and coefficient value are evidenced.',
    source: 'Existing secondary evidence supports a pulsed-column C2 only; it is explicitly excluded from the Kühni route.',
    applicability: 'Kühni extraction column only.',
    validationStatus: 'NOT_APPLICABLE',
    warnings: ['Do not use the project provisional C2, fixture C2, or pulsed-column C2 by symbol matching.'],
    blockingReason: 'Scoped engineer preliminary evidence or exact equation-bearing Kühni C2 literature is required.',
  },
] as const;

export interface WilkeChangInput {
  temperature_C: number;
  solventViscosity_Pa_s: number;
  solventMolecularWeight_g_mol: number;
  solventAssociationFactor: number;
  soluteMolecularWeight_g_mol: number;
  soluteDensity_kg_m3: number;
}

export type WilkeChangResolution =
  | { status: 'resolved'; value_m2_s: number; method: string; warnings: readonly string[] }
  | { status: 'blocked'; value_m2_s: null; errors: readonly string[] };

/**
 * SI Wilke–Chang estimator:
 * D = 5.9e-17 * sqrt(phi * M_B) * T / (mu_B * (M_A/rho_A)^0.6)
 *
 * M is numerically in g/mol (= kg/kmol), rho in kg/m3, mu in Pa.s and T in K.
 * It is an infinite-dilution estimate, not a claim of RRBO/NMP validation.
 */
export function resolveWilkeChangDiffusivity(input: WilkeChangInput): WilkeChangResolution {
  const errors: string[] = [];
  const requirePositive = (name: keyof WilkeChangInput) => {
    if (!Number.isFinite(input[name]) || input[name] <= 0) errors.push(`${name} must be a positive finite number.`);
  };
  requirePositive('solventViscosity_Pa_s');
  requirePositive('solventMolecularWeight_g_mol');
  requirePositive('solventAssociationFactor');
  requirePositive('soluteMolecularWeight_g_mol');
  requirePositive('soluteDensity_kg_m3');
  if (!Number.isFinite(input.temperature_C) || input.temperature_C <= -273.15) {
    errors.push('temperature_C must be above absolute zero.');
  }
  if (errors.length) return { status: 'blocked', value_m2_s: null, errors };

  const temperature_K = input.temperature_C + 273.15;
  const soluteMolarVolume = input.soluteMolecularWeight_g_mol / input.soluteDensity_kg_m3;
  const value = 5.9e-17
    * Math.sqrt(input.solventAssociationFactor * input.solventMolecularWeight_g_mol)
    * temperature_K
    / (input.solventViscosity_Pa_s * Math.pow(soluteMolarVolume, 0.6));
  if (!Number.isFinite(value) || value <= 0) {
    return { status: 'blocked', value_m2_s: null, errors: ['Wilke–Chang produced a non-physical diffusivity.'] };
  }
  return {
    status: 'resolved',
    value_m2_s: value,
    method: 'Wilke–Chang (1955) SI infinite-dilution estimate',
    warnings: ['RRBO_NMP_VALIDATION_PENDING', 'Correlation result requires engineer acceptance before numerical use.'],
  };
}

export interface NmpSelfDiffusionInput {
  temperature_C: number;
  viscosity_Pa_s: number;
  molecularWeight_g_mol: number;
  density_kg_m3: number;
}

export type NmpSelfDiffusionResolution =
  | { status: 'resolved'; value_m2_s: number; method: string; warnings: readonly string[] }
  | { status: 'blocked'; value_m2_s: null; errors: readonly string[] };

/**
 * Preliminary pure-NMP self-diffusion route, deliberately distinct from
 * Wilke–Chang.  The Stokes–Einstein molecular-radius form evaluates the
 * hydrodynamic radius from the pure-liquid molecular volume at the actual
 * operating temperature:
 *
 * r_h = [3M/(4πρN_A)]^(1/3);  D_self = k_B T/(6πμr_h)
 *
 * This is a published molecular-liquid estimate (Einstein, 1905) rather than
 * a pseudo-solute shortcut.  It remains explicitly preliminary until a
 * controlled NMP self-diffusion dataset is adopted.
 */
export function resolveNmpSelfDiffusion(input: NmpSelfDiffusionInput): NmpSelfDiffusionResolution {
  const errors: string[] = [];
  const positive = (value: number, label: string) => {
    if (!Number.isFinite(value) || value <= 0) errors.push(`${label} must be a positive finite number.`);
  };
  if (!Number.isFinite(input.temperature_C) || input.temperature_C <= -273.15) {
    errors.push('temperature_C must be above absolute zero.');
  }
  positive(input.viscosity_Pa_s, 'viscosity_Pa_s');
  positive(input.molecularWeight_g_mol, 'molecularWeight_g_mol');
  positive(input.density_kg_m3, 'density_kg_m3');
  if (errors.length) return { status: 'blocked', value_m2_s: null, errors };

  const kB = 1.380649e-23; // J/K, exact SI definition
  const avogadro = 6.02214076e23; // mol^-1, exact SI definition
  const molecularVolume_m3 = (input.molecularWeight_g_mol / 1000) / input.density_kg_m3 / avogadro;
  const hydrodynamicRadius_m = Math.cbrt((3 * molecularVolume_m3) / (4 * Math.PI));
  const temperature_K = input.temperature_C + 273.15;
  const value = (kB * temperature_K) / (6 * Math.PI * input.viscosity_Pa_s * hydrodynamicRadius_m);
  if (!Number.isFinite(value) || value <= 0) {
    return { status: 'blocked', value_m2_s: null, errors: ['Stokes–Einstein produced a non-physical NMP self-diffusivity.'] };
  }
  return {
    status: 'resolved',
    value_m2_s: value,
    method: 'Stokes–Einstein molecular-radius pure-NMP self-diffusion estimate (Einstein, 1905; not Wilke–Chang)',
    warnings: [
      'RRBO_NMP_VALIDATION_PENDING',
      'Pure-NMP self-diffusion is a preliminary molecular-radius estimate; replace with controlled NMP PFG-NMR or tracer data before release-grade use.',
    ],
  };
}

type PhysicalComponentKey = 'sat' | 'mono' | 'di' | 'poly';
type DiffusivityComponentKey = PhysicalComponentKey | 'nmp';

export interface ECR2Stage8TrustedScalar {
  value: number;
  source: string;
  evidenceLevel: Exclude<ECR2EvidenceLevel, 'MISSING'>;
  warnings?: readonly string[];
  method?: string;
  applicability?: string;
}

/**
 * The resolver accepts only server-assembled, provenance-bearing inputs. It is
 * deliberately data-free: callers must never substitute client Stage 8 fields
 * into this structure to manufacture an automatic result.
 */
export interface ECR2Stage8ResolutionContext {
  temperature_C?: number;
  nmp?: {
    viscosity_Pa_s?: ECR2Stage8TrustedScalar;
    molecularWeight_g_mol?: ECR2Stage8TrustedScalar;
    associationFactor?: ECR2Stage8TrustedScalar;
    density_kg_m3?: ECR2Stage8TrustedScalar;
    selfDiffusion_m2_s?: ECR2Stage8TrustedScalar;
  };
  rrbo?: {
    viscosity_Pa_s?: ECR2Stage8TrustedScalar;
    molecularWeight_g_mol?: ECR2Stage8TrustedScalar;
    associationFactor?: ECR2Stage8TrustedScalar;
  };
  physicalComponents?: Partial<Record<PhysicalComponentKey, {
    molecularWeight_g_mol?: ECR2Stage8TrustedScalar;
    density_kg_m3?: ECR2Stage8TrustedScalar;
    method?: string;
    physicalMwDecision?: 'PHYSICAL_MW_GOVERNED' | 'PHYSICAL_MW_PRELIMINARY_APPROVED_BASIS';
  }>>;
  kuhniShdC2?: ECR2Stage8TrustedScalar & {
    exactEquationIdentity: string;
    deviceApplicability: 'kuhni';
    phaseBasis: 'dispersed';
  };
}

export interface ECR2Stage8Resolution {
  records: Record<ECR2Stage8NumericalParameterId, ECR2Stage8EvidenceRecord>;
  autoPopulatedCount: number;
  unresolvedCount: number;
}

const componentLabel: Record<DiffusivityComponentKey, string> = {
  sat: 'Saturates', mono: 'Mono-aromatics', di: 'Di-aromatics',
  poly: 'Poly-aromatics', nmp: 'NMP',
};

function isTrustedScalar(value: unknown): value is ECR2Stage8TrustedScalar {
  if (!value || typeof value !== 'object') return false;
  const scalar = value as Record<string, unknown>;
  return typeof scalar.value === 'number'
    && Number.isFinite(scalar.value)
    && scalar.value > 0
    && typeof scalar.source === 'string'
    && scalar.source.trim() !== ''
    && ['PROJECT_MEASURED', 'VENDOR_DOCUMENTED', 'PRIMARY_EQUATION_VERIFIED', 'SECONDARY_EQUATION_VERIFIED', 'ENGINEER_APPROVED_PRELIMINARY']
      .includes(String(scalar.evidenceLevel));
}

function blockedRecord(
  base: ECR2Stage8EvidenceRecord,
  blockingReason: string,
  resolutionInputs: readonly string[],
): ECR2Stage8EvidenceRecord {
  return {
    ...base,
    status: base.id === 'kuhni_shd_c2' ? 'APPROVAL_REQUIRED' : 'BLOCKED_MISSING_REQUIRED_EVIDENCE',
    value: undefined,
    blockingReason,
    resolutionInputs,
  };
}

function resolvedRecord(
  base: ECR2Stage8EvidenceRecord,
  value: number,
  method: string,
  source: string,
  resolutionInputs: readonly string[],
  inputSnapshot: Readonly<Record<string, string | number>> = {},
  evidenceLevel: Exclude<ECR2EvidenceLevel, 'MISSING'> = 'SECONDARY_EQUATION_VERIFIED',
  preliminaryWarnings: readonly string[] = [],
): ECR2Stage8EvidenceRecord {
  const isDiffusivity = base.id.startsWith('diffusivity_');
  return {
    ...base,
    value,
    status: isDiffusivity ? 'CALCULATED_PRELIMINARY' : 'AUTO_RESOLVED_PENDING_ACCEPTANCE',
    evidenceLevel,
    method,
    source,
    blockingReason: undefined,
    resolutionInputs,
    inputSnapshot,
    validatedForRRBONMP: isDiffusivity ? false : base.validatedForRRBONMP,
    pilotCalibrationStatus: isDiffusivity ? 'NOT_YET_VALIDATED' : base.pilotCalibrationStatus,
    warnings: [...new Set([
      ...base.warnings,
      ...preliminaryWarnings,
      'RRBO_NMP_VALIDATION_PENDING',
      'System-resolved preliminary basis; engineer acceptance is required before numerical use.',
    ])],
  };
}

/**
 * Resolve only calculations whose source, inputs, and applicability have been
 * supplied by a server-owned upstream basis. It reports every missing physical
 * prerequisite by name so Stage 8 can stop at the root gap.
 */
export function resolveEcr2Stage8Evidence(
  context: ECR2Stage8ResolutionContext,
): ECR2Stage8Resolution {
  const records = Object.fromEntries(ECR2_STAGE8_EVIDENCE_CATALOG.map((record) => [record.id, { ...record }])) as
    Record<ECR2Stage8NumericalParameterId, ECR2Stage8EvidenceRecord>;
  const physical = context.physicalComponents ?? {};

  for (const key of ['sat', 'mono', 'di', 'poly'] as const) {
    const id = `physical_mw_${key}` as ECR2Stage8NumericalParameterId;
    const item = physical[key];
    const molecularWeight = item?.molecularWeight_g_mol;
    records[id] = isTrustedScalar(molecularWeight)
      ? {
        ...resolvedRecord(
          records[id],
          molecularWeight.value,
          item?.method?.trim() || 'Server-owned physical pseudo-component characterization basis',
          molecularWeight.source,
          [`physicalComponents.${key}.molecularWeight_g_mol`, `physicalComponents.${key}.density_kg_m3`],
          {
            molecularWeight_g_mol: molecularWeight.value,
            molecularWeightSource: molecularWeight.source,
            density_kg_m3: isTrustedScalar(item?.density_kg_m3) ? item.density_kg_m3.value : 'NOT_REGISTERED',
            densitySource: isTrustedScalar(item?.density_kg_m3) ? item.density_kg_m3.source : 'NOT_REGISTERED',
          },
          molecularWeight.evidenceLevel,
        ),
        physicalMwDecision: item?.physicalMwDecision
          ?? (molecularWeight.evidenceLevel === 'ENGINEER_APPROVED_PRELIMINARY'
            ? 'PHYSICAL_MW_PRELIMINARY_APPROVED_BASIS'
            : 'PHYSICAL_MW_GOVERNED'),
      }
      : blockedRecord(
        records[id],
        `ROOT_GAP_PHYSICAL_MW_${key.toUpperCase()}: no controlled physical RRBO ${componentLabel[key]} pseudo-component molecular-weight characterization is registered; Coto/NRTL surrogate MW is prohibited.`,
        [`physicalComponents.${key}.molecularWeight_g_mol`, `physicalComponents.${key}.density_kg_m3`],
      );
  }

  const wc = (
    id: Extract<ECR2Stage8NumericalParameterId, `diffusivity_${string}`>,
    component: PhysicalComponentKey | 'nmp',
    phase: 'c' | 'd',
  ) => {
    const base = records[id];
    if (component === 'nmp' && phase === 'c') {
      const self = context.nmp?.selfDiffusion_m2_s;
      const viscosity = context.nmp?.viscosity_Pa_s;
      const molecularWeight = context.nmp?.molecularWeight_g_mol;
      const density = context.nmp?.density_kg_m3;
      if (isTrustedScalar(self)) {
        records[id] = resolvedRecord(
          base,
          self.value,
          'Controlled NMP self-diffusion basis (not Wilke–Chang)',
          self.source,
          ['nmp.selfDiffusion_m2_s'],
          { nmpSelfDiffusion_m2_s: self.value, nmpSelfDiffusionSource: self.source },
          self.evidenceLevel,
        );
        return;
      }
      if (!Number.isFinite(context.temperature_C)
        || !isTrustedScalar(viscosity)
        || !isTrustedScalar(molecularWeight)
        || !isTrustedScalar(density)) {
        const missing = [
          !Number.isFinite(context.temperature_C) ? 'operating temperature' : '',
          !isTrustedScalar(viscosity) ? 'NMP operating-temperature viscosity' : '',
          !isTrustedScalar(molecularWeight) ? 'NMP molecular weight' : '',
          !isTrustedScalar(density) ? 'NMP operating-temperature density' : '',
        ].filter(Boolean).join('; ');
        records[id] = blockedRecord(
          base,
          `ROOT_GAP_NMP_SELF_DIFFUSION: ${missing} is not registered in a controlled upstream basis; Dc_NMP cannot use Wilke–Chang as a pseudo-solute shortcut.`,
          ['temperature_C', 'nmp.viscosity_Pa_s', 'nmp.molecularWeight_g_mol', 'nmp.density_kg_m3'],
        );
        return;
      }
      const result = resolveNmpSelfDiffusion({
        temperature_C: context.temperature_C!,
        viscosity_Pa_s: viscosity.value,
        molecularWeight_g_mol: molecularWeight.value,
        density_kg_m3: density.value,
      });
      records[id] = result.status === 'resolved'
        ? resolvedRecord(
          base,
          result.value_m2_s,
          result.method,
          `${viscosity.source}; ${molecularWeight.source}; ${density.source}`,
          ['temperature_C', 'nmp.viscosity_Pa_s', 'nmp.molecularWeight_g_mol', 'nmp.density_kg_m3'],
          {
            temperature_C: context.temperature_C!,
            nmpViscosity_Pa_s: viscosity.value,
            nmpViscositySource: viscosity.source,
            nmpMolecularWeight_g_mol: molecularWeight.value,
            nmpMolecularWeightSource: molecularWeight.source,
            nmpDensity_kg_m3: density.value,
            nmpDensitySource: density.source,
          },
          'ENGINEER_APPROVED_PRELIMINARY',
          [...(viscosity.warnings ?? []), ...(molecularWeight.warnings ?? []), ...(density.warnings ?? []), ...result.warnings],
        )
        : blockedRecord(base, `ROOT_GAP_NMP_SELF_DIFFUSION: ${result.errors.join(' ')}`, ['temperature_C', 'nmp.viscosity_Pa_s', 'nmp.molecularWeight_g_mol', 'nmp.density_kg_m3']);
      return;
    }
    const solvent = phase === 'c' ? context.nmp : context.rrbo;
    const solute = component === 'nmp'
      ? context.nmp && { molecularWeight_g_mol: context.nmp.molecularWeight_g_mol, density_kg_m3: context.nmp.density_kg_m3 }
      : physical[component];
    const missing: string[] = [];
    if (!Number.isFinite(context.temperature_C)) missing.push('operating temperature');
    const solventViscosity = solvent?.viscosity_Pa_s;
    const solventMolecularWeight = solvent?.molecularWeight_g_mol;
    const solventAssociationFactor = solvent?.associationFactor;
    const soluteMolecularWeight = solute?.molecularWeight_g_mol;
    const soluteDensity = solute?.density_kg_m3;
    if (!isTrustedScalar(solventViscosity)) missing.push(`${phase === 'c' ? 'NMP' : 'RRBO'} operating-temperature viscosity`);
    if (!isTrustedScalar(solventMolecularWeight)) missing.push(`${phase === 'c' ? 'NMP' : 'RRBO'} molecular weight`);
    if (!isTrustedScalar(solventAssociationFactor)) missing.push(`${phase === 'c' ? 'NMP' : 'RRBO'} Wilke–Chang association factor`);
    if (!isTrustedScalar(soluteMolecularWeight)) missing.push(`${componentLabel[component]} physical molecular weight`);
    if (!isTrustedScalar(soluteDensity)) missing.push(`${componentLabel[component]} physical density/molar-volume basis`);
    const resolutionInputs = [
      'temperature_C',
      `${phase === 'c' ? 'nmp' : 'rrbo'}.viscosity_Pa_s`,
      `${phase === 'c' ? 'nmp' : 'rrbo'}.molecularWeight_g_mol`,
      `${phase === 'c' ? 'nmp' : 'rrbo'}.associationFactor`,
      component === 'nmp' ? 'nmp.molecularWeight_g_mol' : `physicalComponents.${component}.molecularWeight_g_mol`,
      component === 'nmp' ? 'nmp.density_kg_m3' : `physicalComponents.${component}.density_kg_m3`,
    ];
    if (missing.length > 0) {
      records[id] = blockedRecord(
        base,
        `ROOT_GAP_WILKE_CHANG_${id.toUpperCase()}: ${missing.join('; ')} is not registered in a controlled upstream basis.`,
        resolutionInputs,
      );
      return;
    }
    const result = resolveWilkeChangDiffusivity({
      temperature_C: context.temperature_C!,
      solventViscosity_Pa_s: solventViscosity!.value,
      solventMolecularWeight_g_mol: solventMolecularWeight!.value,
      solventAssociationFactor: solventAssociationFactor!.value,
      soluteMolecularWeight_g_mol: soluteMolecularWeight!.value,
      soluteDensity_kg_m3: soluteDensity!.value,
    });
    records[id] = result.status === 'resolved'
      ? resolvedRecord(
        base,
        result.value_m2_s,
        result.method,
        `${solventViscosity!.source}; ${solventMolecularWeight!.source}; ${soluteMolecularWeight!.source}; ${soluteDensity!.source}`,
        resolutionInputs,
        {
          temperature_C: context.temperature_C!,
          solventViscosity_Pa_s: solventViscosity!.value,
          solventViscositySource: solventViscosity!.source,
          solventMolecularWeight_g_mol: solventMolecularWeight!.value,
          solventMolecularWeightSource: solventMolecularWeight!.source,
          solventAssociationFactor: solventAssociationFactor!.value,
          solventAssociationFactorSource: solventAssociationFactor!.source,
          soluteMolecularWeight_g_mol: soluteMolecularWeight!.value,
          soluteMolecularWeightSource: soluteMolecularWeight!.source,
          soluteDensity_kg_m3: soluteDensity!.value,
          soluteDensitySource: soluteDensity!.source,
        },
          'ENGINEER_APPROVED_PRELIMINARY',
          [
            ...(solventViscosity!.warnings ?? []),
            ...(solventMolecularWeight!.warnings ?? []),
            ...(solventAssociationFactor!.warnings ?? []),
            ...(soluteMolecularWeight!.warnings ?? []),
            ...(soluteDensity!.warnings ?? []),
            ...result.warnings,
          ],
      )
      : blockedRecord(base, `ROOT_GAP_WILKE_CHANG_${id.toUpperCase()}: ${result.errors.join(' ')}`, resolutionInputs);
  };

  for (const component of ['sat', 'mono', 'di', 'poly', 'nmp'] as const) {
    wc(`diffusivity_${component}_c`, component, 'c');
    wc(`diffusivity_${component}_d`, component, 'd');
  }

  const c2 = context.kuhniShdC2;
  records.kuhni_shd_c2 = isTrustedScalar(c2)
    && c2.deviceApplicability === 'kuhni'
    && c2.phaseBasis === 'dispersed'
    && c2.exactEquationIdentity.trim() !== ''
    ? resolvedRecord(
      records.kuhni_shd_c2,
      c2.value,
      `Exact Kühni Shd C2 — ${c2.exactEquationIdentity}`,
      c2.source,
      ['kuhniShdC2'],
      {
        c2: c2.value,
        exactEquationIdentity: c2.exactEquationIdentity,
        deviceApplicability: c2.deviceApplicability,
        phaseBasis: c2.phaseBasis,
        source: c2.source,
      },
    )
    : blockedRecord(records.kuhni_shd_c2, 'ROOT_GAP_KUHNI_SHD_C2: no exact equation-bearing Kühni dispersed-side C2 source, device applicability, and phase placement are registered; project, fixture, and pulsed-column values are excluded.', ['kuhniShdC2']);

  const values = Object.values(records);
  return {
    records,
    autoPopulatedCount: values.filter((record) =>
      record.status === 'AUTO_RESOLVED_PENDING_ACCEPTANCE' || record.status === 'CALCULATED_PRELIMINARY',
    ).length,
    unresolvedCount: values.filter((record) =>
      record.status !== 'AUTO_RESOLVED_PENDING_ACCEPTANCE' && record.status !== 'CALCULATED_PRELIMINARY',
    ).length,
  };
}

export function findEcr2Stage8Evidence(id: ECR2Stage8NumericalParameterId): ECR2Stage8EvidenceRecord {
  const record = ECR2_STAGE8_EVIDENCE_CATALOG.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`Unknown ECR-2 Stage 8 evidence record '${id}'.`);
  return record;
}

/** Stable server-side provenance payload for a Stage 8 catalog resolution. */
export function ecr2Stage8EvidenceFingerprint(record: ECR2Stage8EvidenceRecord): string {
  return JSON.stringify({
    id: record.id,
    value: record.value ?? null,
    unit: record.unit,
    evidenceLevel: record.evidenceLevel,
    status: record.status,
    basis: record.basis,
    method: record.method,
    source: record.source,
    applicability: record.applicability,
    validationStatus: record.validationStatus,
    validatedForRRBONMP: record.validatedForRRBONMP ?? null,
    pilotCalibrationStatus: record.pilotCalibrationStatus ?? null,
    warnings: record.warnings,
    resolutionInputs: record.resolutionInputs ?? [],
    inputSnapshot: record.inputSnapshot ?? {},
    version: record.version ?? null,
    requiredInputs: record.requiredInputs ?? [],
    availableInputs: record.availableInputs ?? [],
    missingInputs: record.missingInputs ?? [],
    uncertainty: record.uncertainty ?? null,
    physicalMwDecision: record.physicalMwDecision ?? null,
  });
}