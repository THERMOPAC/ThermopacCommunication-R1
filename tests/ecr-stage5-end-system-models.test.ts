import { describe, expect, it } from 'vitest';
import { calculateAutomaticEndSections, endEngineeringRows, endNozzle, type SystemModelEvidence } from '../shared/ecr-stage5-end-sections';
import { renderEndSchematic } from '../shared/ecr-stage5-end-schematic';
import { evaluateEndSystemModels, resolveStage5EndSystemAuthority, type BuiltInEndModels, type NormalEndSource } from '../server/ecr-pre-pilot/stage5-end-system-models';
import { buildStage5R1Geometry } from '../shared/ecr-stage5-r1';
import { createStage5EngineeringReportPdf } from '../server/ecr-pre-pilot/stage5-engineering-report';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const feed = { designFeedRateLph: 4000, rrboDensityKgM3: 869, nmpDensityKgM3: 1015, solventOilRatio: .6,
  oilComponentWt: [60, 15, 10, 8, 6, 1], nmpPurityWt: 98, nmpWaterWt: 2 };
const meta = (id: string): SystemModelEvidence => ({ status: 'BUILTIN_MODEL_ELIGIBLE',
  modelId: `TEST_ONLY_${id}`, version: 'fixture-v1', citation: 'Explicit numerical verification fixture — not a production model admission' });
function source(end: 'top' | 'bottom'): NormalEndSource {
  return { flow: { status: 'SOURCE_QUALIFIED_NORMAL_FLOW', qM3H: end === 'top' ? 4 : 6,
    sourceIdentity: `${end}-normal-duty`, sourceRevision: 'normal-r12' },
  properties: { qualification: 'SOURCE_QUALIFIED_END_PROPERTIES', sourceIdentity: `${end}-property-source`, sourceRevision: 'property-r5',
    operatingTemperatureC: 60, continuousPhase: end === 'top' ? 'RRBO_RICH' : 'NMP_RICH', dispersedPhase: end === 'top' ? 'NMP' : 'RRBO',
    continuousDensityKgM3: end === 'top' ? 800 : 1000, dispersedDensityKgM3: end === 'top' ? 1000 : 850,
    continuousViscosityPaS: end === 'top' ? .01 : .003, dispersedViscosityPaS: .004, interfacialTensionNM: .012 } };
}
function models(end: 'top' | 'bottom'): BuiltInEndModels {
  // Deliberately isolated fixtures exercise the registered-model pipeline.
  // These constants/correlation are NOT inserted into the live model registry.
  return {
    droplet: { evidence: meta(`${end}_DROPLET`), appliesTo: end,
      calculate: () => end === 'top' ? .0005 : .0002, governingCriterion: `Test-only ${end} governing outlet cohort` },
    terminal: { evidence: meta(`${end}_TERMINAL`), appliesTo: end,
      calculate: (d, p) => 9.81 * Math.abs(p.dispersedDensityKgM3 - p.continuousDensityKgM3) * d * d / (18 * p.continuousViscosityPaS) },
    margin: { evidence: meta(`${end}_MARGIN`), appliesTo: end, factor: .5, convention: 'MULTIPLY_VT' },
    fabrication: { evidence: meta(`${end}_FABRICATION`), appliesTo: end,
      rule: { kind: 'BUILTIN_SERIES', model: meta(`${end}_FABRICATION`), diametersM: [2.5, .8, 1.2, 1.6, 2] } },
  };
}
const evidence = (end: 'top' | 'bottom') => evaluateEndSystemModels(end, source(end), models(end));
const active = { revisionId: '8', sourceHash: 'active', diameterM: .55, compartmentCount: 13, installedActiveHeightM: 2.73 };

describe('governed system end-sizing architecture', () => {
  it('executes independent model chains and correct SI square-root diameter and normal H10 equations', () => {
    const authority = { top: evidence('top'), bottom: evidence('bottom') };
    const before = JSON.stringify({ feed, authority, active });
    const r = calculateAutomaticEndSections(feed, null, active.diameterM, authority);
    for (const end of ['top', 'bottom'] as const) {
      const a = r.assemblies[end], c = authority[end].separation!;
      expect(c.kind).toBe('SYSTEM_TERMINAL_MODEL');
      if (c.kind !== 'SYSTEM_TERMINAL_MODEL') throw new Error('fixture');
      expect(a.uDesignMS).toBe(c.terminalVelocityMS * .5);
      expect(a.calculatedDiameterM).toBeCloseTo(Math.sqrt(4 * (source(end).flow!.qM3H / 3600) / (Math.PI * a.uDesignMS!)), 12);
      expect(a.diameterM!).toBeGreaterThanOrEqual(a.calculatedDiameterM!);
      expect(a.residenceHeightM).toBeCloseTo(source(end).flow!.qM3H / (6 * .9 * Math.PI * a.diameterM! ** 2 / 4), 12);
      expect(a.status).toBe('CALCULATED_CONDITIONAL');
      expect(a.feedDistribution.diameterM).toBe(.55);
      expect(a.transition.physicalLengthM).toBeNull();
      expect(a.transition.nominalSharpConeReferenceM).toBeCloseTo((a.diameterM! - .55) / (2 * Math.tan(Math.PI / 6)));
      expect(a.productOpeningNearEdgeM).toBeCloseTo(.15 + a.residenceHeightM!);
      expect(a.productNozzleCentreM).toBeNull();
      expect(a.straightShellHeightM).toBeNull();
      expect(a.head.residenceCreditM3).toBe(0);
    }
    expect(r.assemblies.top.diameterM).not.toBe(r.assemblies.bottom.diameterM);
    expect(JSON.stringify({ feed, authority, active })).toBe(before);
    expect(renderEndSchematic({ ...r, active }, 'ga')).toContain('data-active-compartments="13"');
    expect(renderEndSchematic({ ...r, active }, 'ga')).toContain('Additional Ø550');
  });
  it('distinguishes missing models from process and property dependencies without requesting user approval', async () => {
    const missing = await resolveStage5EndSystemAuthority({ designId: 1, revisionId: '8', activeSourceHash: 'active',
      stage1Hash: 's1', normalProductAuthority: { status: 'UNAVAILABLE', detail: 'fixture' } });
    const r = calculateAutomaticEndSections(feed, null, .55, missing);
    for (const a of Object.values(r.assemblies)) {
      expect(a.status).toBe('HOLD');
      expect(a.holds).toEqual(expect.arrayContaining(['MODEL_UNAVAILABLE', 'DESIGN_CRITERION_REQUIRED', 'PROCESS_SOURCE_REQUIRED', 'PROPERTY_SOURCE_REQUIRED']));
      expect(a.diameterM).toBeNull(); expect(a.residenceHeightM).toBeNull();
      expect(a.modelAudit.some(a => a.reason.includes('d32'))).toBe(true);
      expect(a.modelAuthority).toMatchObject({
        id: 'ECR_END_QUALIFICATION_PROTOCOL', version: '2.0.0',
        status: 'PROTOCOL_ISSUED_NO_MODELS_QUALIFIED_HOLD',
        evidenceReview: 'docs/stage5-end-qualification-evidence-review.md',
        supersedes: 'ECR_END_SOURCE_AUDIT / 1.0.0',
      });
      expect(a.modelAudit.filter(row => row.eligibility === 'NO_QUALIFIED_SOURCE_FOUND')).toHaveLength(2);
      expect(a.modelAudit.find(row => row.modelId.endsWith(':liquid-drop-terminal'))?.eligibility)
        .toBe('CANDIDATE_NOT_QUALIFIED');
      expect(a.modelAudit.find(row => row.modelId.endsWith(':fabrication-rounding'))).toMatchObject({
        evidenceId: `${a.end === 'top' ? 'TOP' : 'BOTTOM'}-QP-FAB-001`,
        eligibility: 'CANDIDATE_NOT_QUALIFIED',
      });
      expect(a.modelAudit.find(row => row.modelId.endsWith(':fabrication-rounding'))?.reason)
        .toContain('IS 4049 Part 2 Table 1');
      expect(endEngineeringRows(a).find(([label]) => label === 'Independent model authority')?.[1])
        .toContain('ECR_END_QUALIFICATION_PROTOCOL / 2.0.0');
      expect(endEngineeringRows(a).find(([label]) => label === 'Independent model authority')?.[1])
        .toContain('supersedes ECR_END_SOURCE_AUDIT / 1.0.0');
      expect(endEngineeringRows(a).find(([label]) => label === 'Independent model authority')?.[1])
        .toContain('docs/stage5-end-qualification-evidence-review.md');
      const prefix = a.end === 'top' ? 'TOP' : 'BOTTOM';
      expect(a.missingCriteria).toEqual(expect.arrayContaining([
        `QUALIFICATION_EVIDENCE_REQUIRED:${prefix}-QP-DSD-001`,
        `QUALIFICATION_EVIDENCE_REQUIRED:${prefix}-QP-PROP-001`,
        `QUALIFICATION_EVIDENCE_REQUIRED:${prefix}-QP-TERM-001`,
        `QUALIFICATION_EVIDENCE_REQUIRED:${prefix}-QP-MARGIN-001`,
        `QUALIFICATION_EVIDENCE_REQUIRED:${prefix}-QP-FAB-001`,
        `QUALIFICATION_EVIDENCE_REQUIRED:${prefix}-QP-CTRL-001`,
      ]));
      expect(a.modelAudit.filter(row => row.evidenceId?.startsWith(`${prefix}-QP-`)).map(row => row.evidenceId))
        .toHaveLength(6);
    }
    expect(JSON.stringify(r)).not.toMatch(/USER_APPROVAL_REQUIRED|topDiameterM|bottomDiameterM/);
    const sourceOnly = evaluateEndSystemModels('top', { flow: source('top').flow }, models('top'));
    const p = calculateAutomaticEndSections(feed, null, .55, { top: sourceOnly }).assemblies.top;
    expect(p.holds).toContain('PROPERTY_SOURCE_REQUIRED');
    expect(p.holds).not.toContain('MODEL_UNAVAILABLE');
    expect(p.holds).not.toContain('PROCESS_SOURCE_REQUIRED');
    expect(p.separationCriterionStatus).toContain('ELIGIBLE_AWAITING');
    const noFlow = evaluateEndSystemModels('top', { properties: source('top').properties }, models('top'));
    const f = calculateAutomaticEndSections(feed, null, .55, { top: noFlow }).assemblies.top;
    expect(f.holds).toContain('PROCESS_SOURCE_REQUIRED');
    expect(f.holds).not.toContain('PROPERTY_SOURCE_REQUIRED');
    expect(f.holds).not.toContain('MODEL_UNAVAILABLE');
  });
  it('keeps qualification evidence holes independent and cannot be relaxed by an authority claim', async () => {
    const claimed = await resolveStage5EndSystemAuthority({ designId: 99, revisionId: 'frozen-r9',
      activeSourceHash: 'stage5-hash', stage1Hash: 'stage1-hash',
      normalProductAuthority: { status: 'CLAIMED_QUALIFIED', detail: 'A status claim is not qualification evidence' } });
    const topIds = claimed.top!.modelAudit!.flatMap(row => row.evidenceId ? [row.evidenceId] : []);
    const bottomIds = claimed.bottom!.modelAudit!.flatMap(row => row.evidenceId ? [row.evidenceId] : []);
    expect(topIds).toEqual(['TOP-QP-DSD-001', 'TOP-QP-TERM-001', 'TOP-QP-MARGIN-001',
      'TOP-QP-FAB-001', 'TOP-QP-PROP-001', 'TOP-QP-CTRL-001']);
    expect(bottomIds).toEqual(['BOTTOM-QP-DSD-001', 'BOTTOM-QP-TERM-001', 'BOTTOM-QP-MARGIN-001',
      'BOTTOM-QP-FAB-001', 'BOTTOM-QP-PROP-001', 'BOTTOM-QP-CTRL-001']);
    expect(new Set([...topIds, ...bottomIds]).size).toBe(12);
    for (const end of [claimed.top!, claimed.bottom!]) {
      expect(end.separation).toBeUndefined();
      expect(end.fabrication).toBeUndefined();
      expect(end.modelChainStatus).toBe('MODEL_UNAVAILABLE');
      expect(end.modelAuthority?.supersedes).toBe('ECR_END_SOURCE_AUDIT / 1.0.0');
    }
    const result = calculateAutomaticEndSections(feed, null, .55, claimed);
    for (const assembly of Object.values(result.assemblies)) {
      expect(assembly.status).toBe('HOLD');
      expect(assembly.calculatedDiameterM).toBeNull();
      expect(assembly.diameterM).toBeNull();
      expect(assembly.residenceHeightM).toBeNull();
    }
    expect(JSON.stringify(claimed)).not.toContain('"status":"BUILTIN_MODEL_ELIGIBLE"');
  });
  it('never promotes the top droplet model into bottom phase-inverted duty', () => {
    const wrong = evaluateEndSystemModels('bottom', source('bottom'), models('top'));
    expect(wrong.separation).toBeUndefined();
    expect(wrong.modelDependencies).toContain('MODEL_UNAVAILABLE:BOTTOM_DROPLET_MODEL');
    const r = calculateAutomaticEndSections(feed, null, .55, { top: evidence('top'), bottom: wrong });
    expect(r.assemblies.top.diameterM).not.toBeNull();
    expect(r.assemblies.bottom.diameterM).toBeNull();
    const svg = renderEndSchematic({ ...r, active }, 'ga');
    expect(svg).toContain('data-sizing="calculated-conditional"');
    expect(svg).toContain('data-sizing="hold"');
    expect(svg).toContain('SYSTEM CALCULATED / CONDITIONAL');
    expect(svg).toContain('HOLD: SYSTEM MODEL / SOURCE GAPS');
  });
  it('uses the defined margin convention, not an assumed multiplication', () => {
    const m = models('top'); m.margin!.factor = 2; m.margin!.convention = 'DIVIDE_VT';
    const a = evaluateEndSystemModels('top', source('top'), m);
    const r = calculateAutomaticEndSections(feed, null, .55, { top: a });
    const c = a.separation!;
    if (c.kind !== 'SYSTEM_TERMINAL_MODEL') throw new Error('fixture');
    expect(r.assemblies.top.uDesignMS).toBe(c.terminalVelocityMS / 2);
    m.margin!.convention = undefined as any;
    expect(evaluateEndSystemModels('top', source('top'), m).separation).toBeUndefined();
  });
  it('fails explicitly for invalid model results, blank property references and nonfinite rounding', () => {
    const m = models('top'); m.terminal!.calculate = () => Infinity;
    const invalid = evaluateEndSystemModels('top', source('top'), m);
    expect(invalid.separation).toBeUndefined();
    expect(invalid.modelChainStatus).toBe('MODEL_UNAVAILABLE');
    const s = source('top'); s.properties!.sourceRevision = ' ';
    expect(evaluateEndSystemModels('top', s, models('top')).propertyDependencies!.length).toBeGreaterThan(0);
    const e = evidence('top');
    e.fabrication = { kind: 'BUILTIN_INCREMENT', model: meta('tiny-increment'), incrementM: Number.MIN_VALUE };
    const a = calculateAutomaticEndSections(feed, null, .55, { top: e }).assemblies.top;
    expect(a.diameterM).toBeNull();
    expect(a.missingCriteria).toContain('MODEL_UNAVAILABLE:FINITE_POSITIVE_FABRICATION_DIAMETER');
  });
  it('rounds upward by eligible fabrication rules only; missing series blocks Dshell but not Dcalc', () => {
    const e = evidence('top');
    delete e.fabrication;
    const a = calculateAutomaticEndSections(feed, null, .55, { top: e }).assemblies.top;
    expect(a.calculatedDiameterM).toBeGreaterThan(0);
    expect(a.diameterM).toBeNull(); expect(a.residenceHeightM).toBeNull();
    e.fabrication = { kind: 'BUILTIN_INCREMENT', model: meta('increment'), incrementM: .05 };
    const b = calculateAutomaticEndSections(feed, null, .55, { top: e }).assemblies.top;
    expect(b.diameterM!).toBeGreaterThanOrEqual(b.calculatedDiameterM!);
    expect(b.diameterM! - b.calculatedDiameterM!).toBeLessThan(.05);
    e.fabrication = { kind: 'BUILTIN_SERIES', model: meta('too-small'), diametersM: [.2, .4] };
    expect(calculateAutomaticEndSections(feed, null, .55, { top: e }).assemblies.top.diameterM).toBeNull();
  });
  it('does not clamp Dshell or invent an expander below/equal to inherited active diameter', () => {
    const r = calculateAutomaticEndSections(feed, null, 1.2, { top: evidence('top') });
    expect(r.assemblies.top.diameterM).toBe(1.2);
    expect(r.assemblies.top.holds).toContain('TRANSITION_RULE_REQUIRED');
    expect(r.assemblies.top.transition.nominalSharpConeReferenceM).toBeNull();
    expect(r.assemblies.top.transition.physicalLengthM).toBeNull();
    const svg = renderEndSchematic({ ...r, active: { ...active, diameterM: 1.2 } }, 'ga');
    const top = svg.slice(svg.indexOf('<g data-end-profile="top"'), svg.indexOf('data-part="integrated-frozen-active"'));
    expect(top).not.toContain('symbolic-knuckled-transition');
    expect(top).toContain('no diameter clamp');
  });
  it('retains D and H10 without an envelope and derives exact outward/mirrored shell distances only with one', () => {
    const e = evidence('bottom');
    e.opening = { model: meta('actual-nozzle-envelope'), sourceIdentity: 'nozzle-model-revision-3', nearHalfExtentM: .04, farHalfExtentM: .06 };
    const a = calculateAutomaticEndSections(feed, null, .55, { bottom: e }).assemblies.bottom;
    expect(a.productNozzleCentreM).toBeCloseTo(.15 + a.residenceHeightM! + .04);
    expect(a.productOpeningFarEdgeM).toBeCloseTo(a.productNozzleCentreM! + .06);
    expect(a.straightShellHeightM).toBeCloseTo(.15 + a.residenceHeightM! + .04 + .06 + Math.max(.2, .4 * a.diameterM!));
    expect(a.interfaceDirection).toBe('DOWN_FROM_TRANSITION');
    expect(a.totalAssemblyHeightM).toBeNull();
    delete e.opening;
    const b = calculateAutomaticEndSections(feed, null, .55, { bottom: e }).assemblies.bottom;
    expect(b.diameterM).toBe(a.diameterM); expect(b.residenceHeightM).toBe(a.residenceHeightM);
    expect(b.productNozzleCentreM).toBeNull(); expect(b.straightShellHeightM).toBeNull();
  });
  it('keeps normal geometry invariant to nozzle-only property/basis and 120% hydraulic changes', () => {
    const authority = { top: evidence('top'), bottom: evidence('bottom') };
    const saved = JSON.stringify({ feed, authority, active });
    const a = calculateAutomaticEndSections(feed, null, .55, authority);
    const b = calculateAutomaticEndSections({ ...feed, solventOilRatio: .8, nmpDensityKgM3: 1100 }, null, .55, authority);
    expect(b.assemblies).toEqual(a.assemblies);
    expect(b.feed.wetSolventKgH).not.toBe(a.feed.wetSolventKgH);
    expect(a.nozzleSizingBasis.solventOilMassRatio).toBe(1.5);
    expect(b.nozzles.wetSolventFeed).not.toEqual(a.nozzles.wetSolventFeed);
    const nominal = endNozzle(4, 1), check = endNozzle(4, 1.2);
    expect(check.hydraulic120M3H).toBeCloseTo(1.2 * nominal.hydraulic120M3H);
    expect(check.candidates[0].velocity120MS).toBeCloseTo(1.2 * nominal.candidates[0].velocity120MS);
    expect(a.assemblies.top.residenceHeightM).not.toBeCloseTo(1.2 * a.assemblies.top.residenceHeightM!);
    expect(JSON.stringify({ feed, authority, active })).toBe(saved);
  });
  it('reports every per-end output, calculated vs HOLD, source/model IDs and all equations in a rendered PDF', async () => {
    const geometry = buildStage5R1Geometry({ stage3ResultId: '3', stage4ResultId: '4', sourcesCurrent: true, sourcesCompatible: true,
      columnDiameterM: .55, rotorDiameterM: .275, rotorDiameterRatio: .5, compartmentHeightM: .21,
      compartmentCount: 13, requiredActiveHeightM: 2.73, installedActiveHeightM: 2.73,
      designNt: 7, hetsM: .39, statorFreeAreaRatio: .4, selectedRpm: 50, rpmMin: 30, rpmMax: 70, phaseConfiguration: 'fixture' });
    const ends = { ...calculateAutomaticEndSections(feed, null, .55, { top: evidence('top') }),
      sourceHash: 'ends', stage1Hash: 'stage1', active };
    const file = join(mkdtempSync(join(tmpdir(), 'governed-end-report-')), 'report.pdf');
    writeFileSync(file, await createStage5EngineeringReportPdf({ id: '8', revision: 8, createdAt: '2026-01-01',
      sourceHash: 'active', currentness: 'CURRENT', geometry }, ends, 'MODEL-FIXTURE'));
    const text = execFileSync('python3', ['-c', 'import fitz,sys; print("\\n".join(p.get_text() for p in fitz.open(sys.argv[1])))', file], { maxBuffer: 5e6 }).toString();
    expect(text).toContain('SYSTEM_CALCULATED_FROM_GOVERNED_MODELS');
    expect(text).toContain('DESIGN_CRITERION_REQUIRED');
    expect(text.replace(/\s+/g, ' ')).toContain('not required user inputs');
    expect(text.replace(/\s+/g, ' ')).toContain('Hstraight = 0.150 + H10 + eNear + eFar + Hpost');
    expect(text).toContain('TEST_ONLY_top_DROPLET');
    expect(text).toContain('normal-r12');
    const compact = text.replace(/\s+/g, '');
    for (const [label] of endEngineeringRows(ends.assemblies.top)) expect(compact).toContain(label.replace(/\s+/g, ''));
    expect(text).not.toMatch(/5950|7000|ellipsoid/);
  }, 60000);
});