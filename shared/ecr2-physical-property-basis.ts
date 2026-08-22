/**
 * Physical RRBO pseudo-component basis for ECR-2.
 *
 * This registry is deliberately separate from the Coto/NRTL surrogate
 * coordinate system.  The anchors below are an engineer-approved preliminary
 * screening basis, not measurements of a particular RRBO batch.  They are
 * calculated with the published API/Riazi-Daubert petroleum-fraction
 * correlation from a representative TBP50/specific-gravity pair for each
 * family.  A class-specific GC/MS, GPC, simulated-distillation, or vendor
 * characterization must supersede them before release-grade classification.
 */

export type Ecr2PhysicalComponentKey = 'sat' | 'mono' | 'di' | 'poly';

export type Ecr2PhysicalMwDecision =
  | 'PHYSICAL_MW_GOVERNED'
  | 'PHYSICAL_MW_PRELIMINARY_APPROVED_BASIS'
  | 'PHYSICAL_MW_EVIDENCE_NOT_CLOSED';

export interface Ecr2PhysicalComponentBasis {
  key: Ecr2PhysicalComponentKey;
  label: string;
  physicalMw_g_mol: number;
  density_kg_m3: number;
  molarVolume_cm3_mol: number;
  representativeMedianBoilingPoint_C: number;
  representativeSpecificGravity_15C: number;
  equation: string;
  source: string;
  sourceVersion: string;
  requiredInputs: readonly string[];
  availableInputs: readonly string[];
  missingInputs: readonly string[];
  applicability: string;
  evidenceLevel: 'ENGINEER_APPROVED_PRELIMINARY';
  decision: Ecr2PhysicalMwDecision;
  uncertainty: string;
  warnings: readonly string[];
}

export const ECR2_RRBO_SN300_PHYSICAL_BASIS_ID = 'rrbo-sn300-physical-family-screening-v1';
export const ECR2_RRBO_SN300_PHYSICAL_BASIS_VERSION = '1.0.0';

const RIAZI_DAUBERT_EQUATION =
  'M = 42.965·exp(2.097×10⁻⁴·Tb − 7.78712·SG + 2.08476×10⁻³·Tb·SG)·Tb^1.26007·SG^4.98308; Tb in K, SG = d15.6/15.6.';
const RIAZI_DAUBERT_SOURCE =
  'Riazi, M.R., “Characterization parameters for petroleum fractions,” Industrial & Engineering Chemistry Research 26(4) (1987), DOI 10.1021/ie00064a023; API/Riazi–Daubert 1987 form.';
const COMMON_REQUIRED_INPUTS = [
  'class median true-boiling-point (TBP50) or equivalent normal-boiling-point characterization',
  'class specific gravity at 15.6 °C (or independently governed density conversion)',
] as const;
const COMMON_MISSING_INPUTS = [
  'RRBO SN300 class-specific TBP50/boiling-point distribution',
  'RRBO SN300 class-specific density/specific gravity',
  'class molecular-weight distribution from GC/MS or GPC',
] as const;
const COMMON_WARNINGS = [
  'Preliminary family anchor only; not a measured RRBO SN300 class characterization.',
  'Replace with class-specific project, vendor, or laboratory evidence before release-grade use.',
  'Physical MW is for material balance, concentration, and transport only; it must not enter Coto/NRTL coordinates.',
] as const;

/**
 * These anchors are intentionally not the Coto surrogate values.  Each value
 * is the rounded result of the equation above for the stated representative
 * TBP50 and SG pair.  Density is the corresponding family screening basis used
 * to expose a molar-volume route to downstream correlations.
 */
export const ECR2_RRBO_SN300_PHYSICAL_COMPONENT_BASIS: Readonly<Record<Ecr2PhysicalComponentKey, Ecr2PhysicalComponentBasis>> = {
  sat: {
    key: 'sat',
    label: 'Saturates',
    physicalMw_g_mol: 269.93,
    density_kg_m3: 820,
    molarVolume_cm3_mol: 329.18,
    representativeMedianBoilingPoint_C: 326.85,
    representativeSpecificGravity_15C: 0.82,
    equation: RIAZI_DAUBERT_EQUATION,
    source: RIAZI_DAUBERT_SOURCE,
    sourceVersion: ECR2_RRBO_SN300_PHYSICAL_BASIS_VERSION,
    requiredInputs: COMMON_REQUIRED_INPUTS,
    availableInputs: ['Engineer-approved preliminary family TBP50 anchor: 600 K (326.85 °C)', 'Engineer-approved preliminary family SG anchor: 0.820 at 15.6 °C'],
    missingInputs: COMMON_MISSING_INPUTS,
    applicability: 'Light/medium petroleum fractions; screening representation of the RRBO SN300 saturates family within the published correlation range.',
    evidenceLevel: 'ENGINEER_APPROVED_PRELIMINARY',
    decision: 'PHYSICAL_MW_PRELIMINARY_APPROVED_BASIS',
    uncertainty: '±20% pending class-specific TBP50, density, and molecular-weight-distribution evidence.',
    warnings: COMMON_WARNINGS,
  },
  mono: {
    key: 'mono',
    label: 'Mono-aromatics',
    physicalMw_g_mol: 320.00,
    density_kg_m3: 870,
    molarVolume_cm3_mol: 367.82,
    representativeMedianBoilingPoint_C: 376.85,
    representativeSpecificGravity_15C: 0.87,
    equation: RIAZI_DAUBERT_EQUATION,
    source: RIAZI_DAUBERT_SOURCE,
    sourceVersion: ECR2_RRBO_SN300_PHYSICAL_BASIS_VERSION,
    requiredInputs: COMMON_REQUIRED_INPUTS,
    availableInputs: ['Engineer-approved preliminary family TBP50 anchor: 650 K (376.85 °C)', 'Engineer-approved preliminary family SG anchor: 0.870 at 15.6 °C'],
    missingInputs: COMMON_MISSING_INPUTS,
    applicability: 'Light/medium petroleum fractions; screening representation of the RRBO SN300 mono-aromatics family within the published correlation range.',
    evidenceLevel: 'ENGINEER_APPROVED_PRELIMINARY',
    decision: 'PHYSICAL_MW_PRELIMINARY_APPROVED_BASIS',
    uncertainty: '±25% pending class-specific TBP50, density, and molecular-weight-distribution evidence.',
    warnings: COMMON_WARNINGS,
  },
  di: {
    key: 'di',
    label: 'Di-aromatics',
    physicalMw_g_mol: 377.57,
    density_kg_m3: 910,
    molarVolume_cm3_mol: 414.91,
    representativeMedianBoilingPoint_C: 426.85,
    representativeSpecificGravity_15C: 0.91,
    equation: RIAZI_DAUBERT_EQUATION,
    source: RIAZI_DAUBERT_SOURCE,
    sourceVersion: ECR2_RRBO_SN300_PHYSICAL_BASIS_VERSION,
    requiredInputs: COMMON_REQUIRED_INPUTS,
    availableInputs: ['Engineer-approved preliminary family TBP50 anchor: 700 K (426.85 °C)', 'Engineer-approved preliminary family SG anchor: 0.910 at 15.6 °C'],
    missingInputs: COMMON_MISSING_INPUTS,
    applicability: 'Medium petroleum fractions; screening representation of the RRBO SN300 di-aromatics family within the published correlation range.',
    evidenceLevel: 'ENGINEER_APPROVED_PRELIMINARY',
    decision: 'PHYSICAL_MW_PRELIMINARY_APPROVED_BASIS',
    uncertainty: '±30% pending class-specific TBP50, density, and molecular-weight-distribution evidence.',
    warnings: COMMON_WARNINGS,
  },
  poly: {
    key: 'poly',
    label: 'Poly-aromatics',
    physicalMw_g_mol: 459.45,
    density_kg_m3: 950,
    molarVolume_cm3_mol: 483.63,
    representativeMedianBoilingPoint_C: 486.85,
    representativeSpecificGravity_15C: 0.95,
    equation: RIAZI_DAUBERT_EQUATION,
    source: RIAZI_DAUBERT_SOURCE,
    sourceVersion: ECR2_RRBO_SN300_PHYSICAL_BASIS_VERSION,
    requiredInputs: COMMON_REQUIRED_INPUTS,
    availableInputs: ['Engineer-approved preliminary family TBP50 anchor: 760 K (486.85 °C)', 'Engineer-approved preliminary family SG anchor: 0.950 at 15.6 °C'],
    missingInputs: COMMON_MISSING_INPUTS,
    applicability: 'Medium/heavy petroleum fractions; screening representation of the RRBO SN300 poly-aromatics family within the published correlation range.',
    evidenceLevel: 'ENGINEER_APPROVED_PRELIMINARY',
    decision: 'PHYSICAL_MW_PRELIMINARY_APPROVED_BASIS',
    uncertainty: '±35% pending class-specific TBP50, density, and molecular-weight-distribution evidence.',
    warnings: COMMON_WARNINGS,
  },
};

export function getEcr2PhysicalComponentBasis(
  rrboGradeId: string | undefined,
): Readonly<Record<Ecr2PhysicalComponentKey, Ecr2PhysicalComponentBasis>> | undefined {
  return rrboGradeId === 'rrbo-sn300' ? ECR2_RRBO_SN300_PHYSICAL_COMPONENT_BASIS : undefined;
}