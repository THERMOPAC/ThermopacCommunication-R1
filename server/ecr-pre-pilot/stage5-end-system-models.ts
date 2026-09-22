import type { EndEngineeringAuthority, EndEngineeringEvidence, FabricationDiameterRule,
  QualifiedNormalEndFlow, QualifiedOpeningEnvelope, SystemModelEvidence } from '../../shared/ecr-stage5-end-sections';
import { auditedEndModelEvidence, END_MODEL_AUTHORITY } from './stage5-end-model-authority';

export type End = 'top' | 'bottom';
export interface NormalEndProperties {
  qualification: 'SOURCE_QUALIFIED_END_PROPERTIES';
  sourceIdentity: string; sourceRevision: string; operatingTemperatureC: number;
  continuousPhase: 'RRBO_RICH' | 'NMP_RICH'; dispersedPhase: 'RRBO' | 'NMP';
  continuousDensityKgM3: number; dispersedDensityKgM3: number;
  continuousViscosityPaS: number; dispersedViscosityPaS: number; interfacialTensionNM: number;
}
export interface NormalEndSource { flow?: QualifiedNormalEndFlow; properties?: NormalEndProperties }
type Model = { evidence: SystemModelEvidence; appliesTo: End };
/** Registered server implementation functions, never JSON from a request.
 * Each model must explicitly establish end-duty applicability. No global
 * registry entry below promotes an active-compartment d32 to an outlet size. */
export interface BuiltInEndModels {
  droplet?: Model & { calculate: (source: NormalEndSource) => number; governingCriterion: string };
  terminal?: Model & { calculate: (diameterM: number, properties: NormalEndProperties) => number };
  margin?: Model & { factor: number; convention: 'MULTIPLY_VT' | 'DIVIDE_VT' };
  fabrication?: Model & { rule: FabricationDiameterRule };
  opening?: QualifiedOpeningEnvelope;
}
const pos = (v: number) => Number.isFinite(v) && v > 0;
const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
const eligible = (m: Model | undefined, end: End) => m?.appliesTo === end
  && m.evidence.status === 'BUILTIN_MODEL_ELIGIBLE'
  && text(m.evidence.modelId) && text(m.evidence.version) && text(m.evidence.citation);

export function evaluateEndSystemModels(end: End, source: NormalEndSource, models: BuiltInEndModels): EndEngineeringEvidence {
  const modelDependencies: string[] = [], propertyDependencies: string[] = [];
  for (const name of ['droplet', 'terminal', 'margin', 'fabrication'] as const)
    if (!eligible(models[name], end)) modelDependencies.push(`MODEL_UNAVAILABLE:${end.toUpperCase()}_${name.toUpperCase()}_MODEL`);
  const p = source.properties;
  const propertyReady = p?.qualification === 'SOURCE_QUALIFIED_END_PROPERTIES'
    && text(p.sourceIdentity) && text(p.sourceRevision) && Number.isFinite(p.operatingTemperatureC)
    && [p.continuousDensityKgM3, p.dispersedDensityKgM3, p.continuousViscosityPaS,
      p.dispersedViscosityPaS, p.interfacialTensionNM].every(pos)
    && p.continuousPhase === (end === 'top' ? 'RRBO_RICH' : 'NMP_RICH')
    && p.dispersedPhase === (end === 'top' ? 'NMP' : 'RRBO')
    && (end === 'top' ? p.dispersedDensityKgM3 > p.continuousDensityKgM3 : p.continuousDensityKgM3 > p.dispersedDensityKgM3);
  if (!propertyReady) propertyDependencies.push(`PROPERTY_SOURCE_REQUIRED:${end.toUpperCase()}_OPERATING_PRODUCT_DENSITIES_VISCOSITIES_INTERFACIAL_TENSION_AND_PHASE_IDENTITY`);
  const result: EndEngineeringEvidence = {
    normalFlow: source.flow, modelDependencies, propertyDependencies,
    modelChainStatus: (['droplet', 'terminal', 'margin'] as const).every(name => eligible(models[name], end))
      ? 'ELIGIBLE_AWAITING_SOURCE' : 'MODEL_UNAVAILABLE',
    fabrication: eligible(models.fabrication, end) ? models.fabrication!.rule : undefined,
    opening: models.opening,
    modelAudit: (['droplet', 'terminal', 'margin', 'fabrication'] as const).map(name => ({
      modelId: models[name]?.evidence.modelId ?? `${end}:${name}:unavailable`,
      citation: models[name]?.evidence.citation ?? 'No admitted built-in end-duty model',
      eligibility: eligible(models[name], end) ? 'BUILTIN_MODEL_ELIGIBLE' : 'MODEL_UNAVAILABLE',
      reason: eligible(models[name], end) ? `Explicit ${end} end-duty applicability` : 'Missing model or different end applicability',
    })),
  };
  // Missing fabrication does not block the separate droplet → vt → U → Dcalc
  // calculation. Missing property/flow does not get replaced by inlet proxies.
  if (propertyReady && source.flow?.status === 'SOURCE_QUALIFIED_NORMAL_FLOW'
    && pos(source.flow.qM3H) && text(source.flow.sourceIdentity) && text(source.flow.sourceRevision)
    && eligible(models.droplet, end) && eligible(models.terminal, end) && eligible(models.margin, end)) {
    try {
      const diameter = models.droplet!.calculate(source);
      const terminal = models.terminal!.calculate(diameter, p!);
      const margin = models.margin!;
      if (!pos(diameter) || !pos(terminal) || !pos(margin.factor)
        || !['MULTIPLY_VT', 'DIVIDE_VT'].includes(margin.convention) || !text(models.droplet!.governingCriterion)) {
        result.modelChainStatus = 'MODEL_UNAVAILABLE';
        modelDependencies.push('MODEL_UNAVAILABLE:NONPHYSICAL_OR_INCOMPLETE_MODEL_RESULT');
      }
      else {
        result.modelChainStatus = 'EVALUATED';
        result.separation = {
        kind: 'SYSTEM_TERMINAL_MODEL', model: models.terminal!.evidence,
        terminalModel: models.terminal!.evidence.modelId,
        governingDropletCriterion: models.droplet!.governingCriterion,
        governingDropletDiameterM: diameter, dropletModel: models.droplet!.evidence,
        propertiesReference: `${p!.sourceIdentity} / ${p!.sourceRevision}; ${p!.operatingTemperatureC} °C`,
        terminalVelocityMS: terminal, marginModel: margin.evidence,
        safetyFactor: margin.factor, factorConvention: margin.convention,
        };
      }
    } catch {
      result.modelChainStatus = 'MODEL_UNAVAILABLE';
      modelDependencies.push('MODEL_UNAVAILABLE:END_DUTY_OUTSIDE_REGISTERED_MODEL_DOMAIN');
    }
  }
  return result;
}

export interface EndSystemSourceContext {
  designId: number; revisionId: string; activeSourceHash: string; stage1Hash: string;
  normalProductAuthority: { status: string; detail: string };
}
export type EndSystemSourceResolver = (context: EndSystemSourceContext) => Promise<EndEngineeringAuthority>;

/** Repository applicability audit. Existing hydraulic solvers are real, but
 * their own qualification excludes end capture/return and phase-inverted
 * outlet populations. No missing capture duty, margin or fabrication series
 * is created here, and no values are requested from the end user. */
export const resolveStage5EndSystemAuthority: EndSystemSourceResolver = async () => {
  const end = (which: End): EndEngineeringEvidence => ({
    ...evaluateEndSystemModels(which, {}, {}),
    modelAuthority: { ...END_MODEL_AUTHORITY },
    modelAudit: [
      ...auditedEndModelEvidence(which),
      { modelId: 'P1_HINZE_D32_ACTIVE_COMPARTMENT', citation: 'rrbo-wetnmp-hydraulic-p1.ts: d32 and six hydraulic scenarios',
        eligibility: 'NOT_ELIGIBLE_FOR_END_DUTY', reason: which === 'top'
          ? 'Mean turbulent active-compartment d32 is not the terminal-stator outlet flux/capture population or qualified return-path duty.'
          : 'NMP active-compartment d32 does not model RRBO droplets rising in NMP-rich extract after phase inversion.' },
      { modelId: 'BARRY_PARLANGE_MOBILE / SCHILLER_NAUMANN_IMMOBILE / MYINT_SIGNED_TERMINAL',
        citation: 'rrbo-wetnmp-hydraulic-p1.ts; kuhni-geometry-resolver-v140.ts signedTerminalState',
        eligibility: 'CONDITIONAL_TERMINAL_MODELS_ONLY',
        reason: 'Real drag/force-balance implementations exist, but end-specific droplet population, operating product properties, interface mobility, spherical-drop regime and return-path applicability are not qualified.' },
      { modelId: 'AUTOMATIC_HYDRAULIC_SELECTION', citation: 'automatic-hydraulic-selection.ts: qualificationUnknowns',
        eligibility: 'NOT_END_SEPARATION_MODEL', reason: 'Explicitly lists inversion, entrainment and disengagement as unknown; hydraulic knee/loading margin is not an end Udesign margin.' },
      { modelId: 'END_MARGIN_AND_FABRICATION_RULE', citation: 'ecr-stage5-r1.ts geometric envelope exclusions; legacy END_DIAMETERS_M comparisons',
        eligibility: 'MODEL_UNAVAILABLE', reason: 'No governed end-duty velocity factor/convention or fabrication rounding series found. Legacy comparison diameters and active-column search grids are not fabrication rules.' },
      { modelId: 'OFFLINE_PROPOSAL_AND_TERMINAL_CHAIN',
        citation: 'deliverables/disengager-preliminary-proposal.mjs; deliverables/kuhni-terminal-chain.md; deliverables/disengager-drag-evidence.md (Myint et al., DOI 10.1299/jfst.1.72)',
        eligibility: 'CONDITIONAL_RESEARCH_NOT_LIVE_MODEL_AUTHORITY',
        reason: 'Prior proposal explicitly labels the 200 µm bottom target and 0.50 velocity fraction engineer-selected, with N4/N7 flow proxies. Terminal-chain research says PASS mathematics / HOLD actual performance, with assumed DSD widths/loading and unqualified return. None establishes an admitted current end population, margin or fabrication series.' },
    ],
  });
  return { top: end('top'), bottom: end('bottom') };
};