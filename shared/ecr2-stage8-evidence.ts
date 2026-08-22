/**
 * Governed evidence boundary for the ECR-2 Stage 8 numerical dependencies.
 *
 * This module intentionally contains no representative RRBO values.  It records
 * the best currently traceable calculation route and returns a typed block when
 * a project characterization, molar volume, or exact C2 source is absent.
 */

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
  warnings: readonly string[];
  blockingReason?: string;
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
  warnings: ['Coto surrogate molecular weights are thermodynamic-coordinate data and are prohibited here.'],
  blockingReason: 'A traceable physical RRBO pseudo-component molecular-weight basis is required.',
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
  physicalMw('physical_mw_sat', 'Physical MW — Saturates'),
  physicalMw('physical_mw_mono', 'Physical MW — Mono-aromatics'),
  physicalMw('physical_mw_di', 'Physical MW — Di-aromatics'),
  physicalMw('physical_mw_poly', 'Physical MW — Poly-aromatics'),
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
  });
}