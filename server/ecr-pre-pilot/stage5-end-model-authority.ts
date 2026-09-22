import type { EndEngineeringEvidence } from '../../shared/ecr-stage5-end-sections';

/** Independent of frozen Stage 1/2/5 snapshots. A literature candidate is not
 * an executable model admission. Bump this version when admission changes. */
export const END_MODEL_AUTHORITY = {
  id: 'ECR_END_SOURCE_AUDIT',
  version: '1.0.0',
  status: 'NO_COMPLETE_QUALIFIED_CHAIN_FOUND',
  source: 'docs/task-306-end-sizing-source-audit.md',
} as const;

export function auditedEndModelEvidence(end: 'top' | 'bottom'): NonNullable<EndEngineeringEvidence['modelAudit']> {
  return [
    {
      modelId: `${end}:outlet-droplet`,
      citation: end === 'top'
        ? 'Oliveira et al. (2008), DOI 10.1590/S0104-66322008000400010, pp.731–736, Eqs.(2)–(5)'
        : 'docs/task-306-end-sizing-source-audit.md §3.2; deliverables/disengager-preliminary-proposal.mjs',
      eligibility: 'NO_QUALIFIED_SOURCE_FOUND',
      reason: end === 'top'
        ? 'Number-weighted local Exxsol/water DSD and active-compartment NMP d32 do not establish a top NMP-in-RRBO outlet flux/capture population. Representative terminal outlet DSD, loading and capture/return criterion are required.'
        : 'No qualified bottom RRBO-in-NMP outlet flux population or carryunder criterion found. Phase inversion forbids use of top NMP d32; offline 200 µm is an assumption.',
    },
    {
      modelId: `${end}:liquid-drop-terminal`,
      citation: 'Barry & Parlange (2018), DOI 10.1371/journal.pone.0194907, Eq.(10), pp.8–9; Myint et al. (2006), DOI 10.1299/jfst.1.72, Eqs.(9)–(10), pp.79–80',
      eligibility: 'CANDIDATE_NOT_QUALIFIED',
      reason: end === 'top'
        ? 'Spherical fluid-drop equations exist, but actual outlet size, product properties, mobility, deformation and return-path domain are unqualified. Nominal top viscosity ratio 0.0237 is outside Myint’s 0.1–100 experimental range; it is not current property authority.'
        : 'Liquid-drop equations are candidates only. Nominal viscosity ratio alone is insufficient: actual RRBO outlet size, product properties, mobility and every dimensionless domain require validation. Schiller–Naumann is a rigid-sphere endpoint, not a proven liquid-drop lower bound.',
    },
    {
      modelId: `${end}:velocity-margin`,
      citation: 'docs/task-306-end-sizing-source-audit.md §§3.1–3.2; deliverables/disengager-preliminary-proposal.mjs',
      eligibility: 'NO_QUALIFIED_SOURCE_FOUND',
      reason: 'No controlled end-duty factor and multiply/divide convention found. Offline 0.50, terminal-correlation error and active-column capacity margin are not end-design authority. The protected failure mode, uncertainty and operating envelope must be established.',
    },
    {
      modelId: `${end}:fabrication-rounding`,
      citation: 'docs/task-306-end-sizing-source-audit.md §§3.1–3.2',
      eligibility: 'NO_QUALIFIED_SOURCE_FOUND',
      reason: 'No controlled fabricator/project inside-diameter series or increment found. Historical Ø900/Ø1000 comparisons and active diameter search grids are not fabrication rules. An upward rounding rule with shell-ID and tolerance basis is required.',
    },
  ];
}