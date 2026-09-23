import type { EndEngineeringEvidence } from '../../shared/ecr-stage5-end-sections';

/** Independent of frozen Stage 1/2/5 snapshots. A literature candidate is not
 * an executable model admission. Bump this version when admission changes. */
export const END_MODEL_AUTHORITY = {
  id: 'ECR_END_QUALIFICATION_PROTOCOL',
  version: '2.0.0',
  status: 'PROTOCOL_ISSUED_NO_MODELS_QUALIFIED_HOLD',
  source: 'docs/stage5-end-qualification-protocol.md',
  evidenceReview: 'docs/stage5-end-qualification-evidence-review.md',
  supersedes: 'ECR_END_SOURCE_AUDIT / 1.0.0',
} as const;

export const END_QUALIFICATION_EVIDENCE_IDS = {
  top: ['TOP-QP-DSD-001', 'TOP-QP-PROP-001', 'TOP-QP-TERM-001',
    'TOP-QP-MARGIN-001', 'TOP-QP-FAB-001', 'TOP-QP-CTRL-001'],
  bottom: ['BOTTOM-QP-DSD-001', 'BOTTOM-QP-PROP-001', 'BOTTOM-QP-TERM-001',
    'BOTTOM-QP-MARGIN-001', 'BOTTOM-QP-FAB-001', 'BOTTOM-QP-CTRL-001'],
} as const;

export function auditedEndModelEvidence(end: 'top' | 'bottom'): NonNullable<EndEngineeringEvidence['modelAudit']> {
  const ids = END_QUALIFICATION_EVIDENCE_IDS[end];
  return [
    {
      modelId: `${end}:outlet-droplet`,
      evidenceId: ids[0],
      citation: end === 'top'
        ? 'docs/stage5-end-qualification-evidence-review.md §2.1; Oliveira et al. (2008), DOI 10.1590/S0104-66322008000400010, pp.731–736, Eqs.(2)–(5); Glatz/Cross pp.7–8'
        : 'docs/stage5-end-qualification-evidence-review.md §2.2',
      eligibility: 'NO_QUALIFIED_SOURCE_FOUND',
      reason: end === 'top'
        ? 'Number-weighted local Exxsol/water DSD and active-compartment NMP d32 do not establish a top NMP-in-RRBO outlet flux/capture population. Representative terminal outlet DSD, loading and capture/return criterion are required.'
        : 'No qualified bottom RRBO-in-NMP outlet flux population or carryunder criterion found. Phase inversion forbids use of top NMP d32; offline 200 µm is an assumption.',
    },
    {
      modelId: `${end}:liquid-drop-terminal`,
      evidenceId: ids[2],
      citation: 'docs/stage5-end-qualification-evidence-review.md §3; Myint et al. (2006), DOI 10.1299/jfst.1.72, Eqs.(1)–(5),(9)–(10), pp.72–80; Tomiyama et al. (2007), DOI 10.1299/jfst.2.184; Barry & Parlange (2018), DOI 10.1371/journal.pone.0194907, Eq.(10), pp.3–9',
      eligibility: 'CANDIDATE_NOT_QUALIFIED',
      reason: end === 'top'
        ? 'Candidates exist, but actual outlet size, properties, mobility, shape and return-path domain are unqualified. Nominal top kappa 0.0237 is outside Myint terminal and Tomiyama shape kappa 0.1–100. Myint also requires log10(M) −11.6 to −0.9, Re 0.17–200 and Eo 0.017–12.1.'
        : 'Candidates only. Nominal kappa 42.2 is inside Myint’s 0.1–100 range but does not establish actual size, properties, mobility or the required log10(M), Re, Eo and shape domains. Schiller–Naumann is a rigid-sphere endpoint, not a proven liquid-drop lower bound.',
    },
    {
      modelId: `${end}:velocity-margin`,
      evidenceId: ids[3],
      citation: 'docs/stage5-end-qualification-evidence-review.md §4',
      eligibility: 'NO_QUALIFIED_SOURCE_FOUND',
      reason: 'No controlled end-duty factor and multiply/divide convention found. Offline 0.50, terminal-correlation error and active-column capacity margin are not end-design authority. The protected failure mode, uncertainty and operating envelope must be established.',
    },
    {
      modelId: `${end}:fabrication-rounding`,
      evidenceId: ids[4],
      citation: 'docs/stage5-end-qualification-evidence-review.md §5; IS 4049 (Part 2):1996 §§1,4.1,4.4 and Table 1',
      eligibility: 'CANDIDATE_NOT_QUALIFIED',
      reason: 'IS 4049 Part 2 Table 1 is a controlled deep-torispherical formed-end inside-diameter candidate (400–2400 mm by 100 mm, then listed sizes through 5000 mm), not a project round-up rule or fabricator commitment. Code hierarchy, shell/head datum, guaranteed minimum ID tolerance, tooling, supported range and signed adoption remain open; historical sizes remain excluded.',
    },
    {
      modelId: `${end}:operating-product-properties`,
      evidenceId: ids[1],
      citation: 'docs/stage5-end-qualification-protocol.md §2',
      eligibility: 'PROPERTY_SOURCE_REQUIRED',
      reason: 'Equilibrated end-specific densities, viscosities, interfacial tension, phase identity and interface state over the representative operating envelope are not qualified.',
    },
    {
      modelId: `${end}:controlled-qualification-package`,
      evidenceId: ids[5],
      citation: 'docs/stage5-end-qualification-protocol.md §§5,8',
      eligibility: 'QUALIFICATION_PACKAGE_REQUIRED',
      reason: 'A predeclared blind validation and controlled approval package cannot qualify until the underlying end-specific data pass the approved criteria; paperwork alone is not evidence.',
    },
  ];
}