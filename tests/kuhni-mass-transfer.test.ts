import { describe, expect, it } from 'vitest';
import {
  KUHNI_MASS_TRANSFER_IMPLEMENTATION_HASH, createNoAxialMixingClosure, runKuhniMassTransfer,
  type KuhniMassTransferDependencies, type KuhniMassTransferInput,
} from '../server/ecr-pre-pilot/kuhni-mass-transfer';

const hash = 'a'.repeat(64);
const lineage = { stage1SnapshotHash: hash, stage2: { modelId: 'm', modelHash: hash, engineId: 'e', engineHash: hash, equilibriumId: 'q', equilibriumHash: hash }, stage3: { runId: 'r', version: '1', immutableHash: hash }, propertyPackageHash: hash, evidencePackageHash: hash, hardwareGeometry: { source: 'vendor', hash, status: 'GOVERNED' } };
const identity = { implementationId: 'test', version: '1', implementationHash: hash };
const dependencies = (overrides: Partial<KuhniMassTransferDependencies> = {}): KuhniMassTransferDependencies => ({
  kernelArtifactHash: hash,
  operatingHydraulics: { ...identity, evaluate: () => ({ operatingHoldup: .2, d32M: .002, areaModelStatus: 'CALCULATED_IN_RANGE', uncertainty: [], applicability: [] }) },
  equilibrium: { ...identity, evaluate: () => ({ continuousEquilibriumComposition: [.2,.8], dispersedEquilibriumComposition: [.8,.2], applicability: [], uncertainty: [] }), generateReferenceDuty: ({ theoreticalStages }) => ({ id: `ideal-${theoreticalStages}` }) },
  massTransfer: { ...identity, fluxFrame: { kind: 'MOLAR_AVERAGE', dependentComponentTreatment: 'component-B', constraint: 'ZERO_SUM_DIFFUSIVE_MOLAR_FLUX' }, evaluate: (r: any) => ({ componentTransferMolS: [.2 * r.continuousInMolarFlowMolS[0], -.02 * r.continuousInMolarFlowMolS[0]], componentDiffusiveFluxMolS: [.1, -.1], applicability: [], uncertainty: [] }) },
  axialMixing: createNoAxialMixingClosure(identity),
  ...overrides,
});
const input = (overrides: Partial<KuhniMassTransferInput> = {}): KuhniMassTransferInput => ({
  lineage, componentIds: ['A','B'], continuousFeed: { componentMolarFlowMolS: [1,1] }, dispersedFeed: { componentMolarFlowMolS: [.1,1] },
  stage2UnavailableReason: 'not run', hydraulicCandidates: [{ ordinal: 1, rpm: 20, columnDiameterM: 1, compartmentHeightM: .5, powerVolumeWM3: 10, trialId: 'trial-1', trialImmutableHash: hash, status: 'CALCULATED_IN_RANGE', applicability: [], uncertainty: [], pilotValidated: true, hydraulicallyFeasible: true }],
  maximumCompartments: 8, maximumActiveHeightM: 10, dutyAcceptance: { id: 'duty', version: '1', implementationHash: hash, targets: [{ phase: 'continuous', componentId: 'A', metric: 'MOLAR_FLOW_MOL_S', comparator: 'LTE', target: .65, tolerance: 0 }] }, ...overrides,
});

describe('Stage-4 authority, safety, and serializable lineage', () => {
  it('uses valid Stage-2 NT, otherwise exactly seven generated ideal-duty stages', () => {
    const calculated = runKuhniMassTransfer(input({ stage2: { status: 'CALCULATED', theoreticalStages: 4.5, duty: { id: 's2' }, jobId: 'j', resultHash: hash } }), dependencies());
    expect(calculated.theoreticalStageAuthority.value).toBe(4.5);
    expect(calculated.governingDuty.id).toBe('s2');
    const fallback = runKuhniMassTransfer(input(), dependencies());
    expect(fallback.theoreticalStageAuthority).toMatchObject({ value: 7, provenance: 'PRE_PILOT_DESIGN_DEFAULT', reason: 'not run' });
    expect(fallback.governingDuty.id).toBe('ideal-7');
  });
  it('prohibits assumed efficiency and flood holdup', () => {
    expect(() => runKuhniMassTransfer(input({ assumedEfficiency: .5 } as any), dependencies())).toThrow(/ASSUMED/);
    const bad = input(); (bad.hydraulicCandidates[0] as any).floodHoldup = .2;
    expect(() => runKuhniMassTransfer(bad, dependencies())).toThrow(/FLOOD/);
  });
  it('emits pinned lineage and closure hashes, deep freezes result, and replays its hash', () => {
    const a = runKuhniMassTransfer(input(), dependencies()), b = runKuhniMassTransfer(input(), dependencies());
    expect(a.lineage).toEqual(lineage); expect(a.closureHashes.massTransfer.implementationHash).toBe(hash);
    expect(a.engine.contractHash).toBe(KUHNI_MASS_TRANSFER_IMPLEMENTATION_HASH); expect(a.engine.kernelArtifactHash).toBe(hash); expect(a.resultHash).toBe(b.resultHash);
    expect(Object.isFrozen(a)).toBe(true); expect(Object.isFrozen(a.selectedDesign!.cells)).toBe(true);
    expect(() => { (a.selectedDesign!.cells[0] as any).d32M = 2; }).toThrow();
  });
  it('rejects nonfinite or nonpositive solver, geometry, hydraulic, and artifact values', () => {
    expect(() => runKuhniMassTransfer(input({ convergenceTolerance: Infinity }), dependencies())).toThrow(/SOLVER/);
    expect(() => runKuhniMassTransfer(input({ convergenceTolerance: 0 }), dependencies())).toThrow(/SOLVER/);
    expect(() => runKuhniMassTransfer(input({ maximumIterations: -1 }), dependencies())).toThrow(/SOLVER/);
    const bad = input(); bad.hydraulicCandidates[0].columnDiameterM = Infinity;
    expect(() => runKuhniMassTransfer(bad, dependencies())).toThrow(/HYDRAULIC/);
    expect(() => runKuhniMassTransfer(input(), dependencies({ kernelArtifactHash: 'not-a-hash' }))).toThrow(/ARTIFACT/);
    const h = { ...dependencies().operatingHydraulics, evaluate: () => ({ operatingHoldup: 0, d32M: Infinity, areaModelStatus: 'CALCULATED_IN_RANGE' as const, uncertainty: [], applicability: [] }) };
    expect(runKuhniMassTransfer(input(), dependencies({ operatingHydraulics: h })).candidateEvaluations[0].status).toBe('MODEL_CLOSURE_FAILED');
  });
  it('uses code-unit canonical sort so equivalent insertion orders replay identically', () => {
    const first = runKuhniMassTransfer(input({ stage2: { status: 'CALCULATED', theoreticalStages: 2, duty: { id: 'd', z: 1, a: 2 }, jobId: 'job', resultHash: hash } }), dependencies());
    const second = runKuhniMassTransfer(input({ stage2: { duty: { a: 2, z: 1, id: 'd' }, theoreticalStages: 2, status: 'CALCULATED', jobId: 'job', resultHash: hash } }), dependencies());
    expect(first.resultHash).toBe(second.resultHash);
  });
  it('pins the full duty-acceptance snapshot into the result hash', () => {
    const first = runKuhniMassTransfer(input(), dependencies());
    const changed = input({ dutyAcceptance: { id: 'duty', version: '1', implementationHash: hash, targets: [{ phase: 'continuous', componentId: 'A', metric: 'MOLAR_FLOW_MOL_S', comparator: 'LTE', target: .7, tolerance: .01 }] } });
    const second = runKuhniMassTransfer(changed, dependencies());
    expect(first.selectedDesign!.physicalCompartments).toBe(second.selectedDesign!.physicalCompartments);
    expect(first.resultHash).not.toBe(second.resultHash);
    expect(second.dutyAcceptance.targets[0].tolerance).toBe(.01);
  });
});

describe('rate-based physical compartment solution', () => {
  it('calculates zero transfer without assumed efficiency and reports final closure residuals', () => {
    const d = dependencies({ massTransfer: { ...dependencies().massTransfer, evaluate: () => ({ componentTransferMolS: [0,0], componentDiffusiveFluxMolS: [0, 0], applicability: [], uncertainty: [] }) } });
    const r = runKuhniMassTransfer(input({ dutyAcceptance: { id: 'zero', version: '1', implementationHash: hash, targets: [{ phase: 'continuous', componentId: 'A', metric: 'MOLAR_FLOW_MOL_S', comparator: 'LTE', target: 1, tolerance: 0 }] } }), d).selectedDesign!;
    expect(r.cells[0].transferMolS).toEqual([0,0]); expect(r.overallEfficiency).toBe(7 / r.physicalCompartments);
    expect(r.maxConstitutiveResidualMolS).toBeLessThan(1e-9); expect(r.maxLocalMaterialBalanceResidualMolS).toBeLessThan(1e-12); expect(r.maxGlobalMaterialBalanceResidualMolS).toBeLessThan(1e-12);
  });
  it('conserves component material in every cell and searches integer physical heights', () => {
    const r = runKuhniMassTransfer(input(), dependencies());
    expect(r.physicalCompartments).toBe(2); expect(Number.isInteger(r.physicalCompartments)).toBe(true);
    r.selectedDesign!.cells.forEach(c => c.transferMolS.forEach((x,i) => {
      expect(c.continuousInMolarFlowMolS[i] - c.continuousOutMolarFlowMolS[i] + c.continuousMixingSourceMolS[i]).toBeCloseTo(x, 12);
      expect(c.dispersedOutMolarFlowMolS[i] - c.dispersedInMolarFlowMolS[i] - c.dispersedMixingSourceMolS[i]).toBeCloseTo(x, 12);
    }));
    expect(runKuhniMassTransfer(input({ maximumCompartments: 1 }), dependencies()).status).toBe('NO_FEASIBLE_PHYSICAL_HEIGHT');
  });
  it('solves injected neighbor-coupled mixing and verifies componentwise mixing conservation', () => {
    const mixing = { ...identity, evaluate: ({ compartment, physicalCompartments, continuousCellsMolarFlowMolS, dispersedCellsMolarFlowMolS }: any) => {
      const j = compartment - 1, k = .01;
      const lap = (cells: number[][]) => cells[j].map((x,i) => k * ((j ? cells[j-1][i] : cells[j][i]) - 2*x + (j < physicalCompartments-1 ? cells[j+1][i] : cells[j][i])));
      return { continuousComponentSourceMolS: lap(continuousCellsMolarFlowMolS), dispersedComponentSourceMolS: lap(dispersedCellsMolarFlowMolS), applicability: ['NEIGHBOR_COUPLED'], uncertainty: [] };
    }};
    const r = runKuhniMassTransfer(input({ dutyAcceptance: { id: 'mix', version: '1', implementationHash: hash, targets: [{ phase: 'continuous', componentId: 'A', metric: 'MOLAR_FLOW_MOL_S', comparator: 'LTE', target: 1, tolerance: 0 }] } }), dependencies({ axialMixing: mixing })).selectedDesign!;
    expect(r.maxContinuousMixingConservationResidualMolS).toBeLessThan(1e-9);
    expect(r.maxDispersedMixingConservationResidualMolS).toBeLessThan(1e-9);
    expect(r.applicabilityFlags).toContain('NEIGHBOR_COUPLED');
  });
  it('keeps extrapolated and unvalidated routes calculable with flags', () => {
    const i=input(); i.hydraulicCandidates[0]={...i.hydraulicCandidates[0],status:'CALCULATED_EXTRAPOLATED',pilotValidated:false,applicability:['OUT_OF_RANGE']};
    const r=runKuhniMassTransfer(i,dependencies()).selectedDesign!;
    expect(r.applicabilityFlags).toEqual(expect.arrayContaining(['HYDRAULIC_CORRELATION_EXTRAPOLATED','PILOT_VALIDATION_NOT_AVAILABLE','OUT_OF_RANGE']));
  });
});

describe('closure and selection failure distinctions', () => {
  it('rejects unnormalized equilibrium as model closure rather than no feasible height', () => {
    const eq={...dependencies().equilibrium,evaluate:()=>({continuousEquilibriumComposition:[.3,.3],dispersedEquilibriumComposition:[.8,.2],applicability:[],uncertainty:[]})};
    expect(runKuhniMassTransfer(input(),dependencies({equilibrium:eq})).candidateEvaluations[0].status).toBe('MODEL_CLOSURE_FAILED');
  });
  it('rejects negative final states as numerical closure rather than no feasible height', () => {
    const mt={...dependencies().massTransfer,evaluate:()=>({componentTransferMolS:[2,0],componentDiffusiveFluxMolS:[1,-1],applicability:[],uncertainty:[]})};
    expect(runKuhniMassTransfer(input(),dependencies({massTransfer:mt})).candidateEvaluations[0].status).toBe('NUMERICAL_CLOSURE_FAILED');
  });
  it('rejects a diffusive vector that violates the declared molar-average frame constraint', () => {
    const mt = { ...dependencies().massTransfer, evaluate: () => ({ componentTransferMolS: [.1, -.01], componentDiffusiveFluxMolS: [.1, -.01], applicability: [], uncertainty: [] }) };
    const r = runKuhniMassTransfer(input(), dependencies({ massTransfer: mt }));
    expect(r.status).toBe('MODEL_CLOSURE_FAILED');
    expect(r.selectedDesign).toBeNull();
  });
  it('selects minimum volume, then power, lower RPM, then ordinal deterministically', () => {
    const i=input(); i.hydraulicCandidates=[
      {...i.hydraulicCandidates[0],ordinal:9,rpm:30,powerVolumeWM3:4},
      {...i.hydraulicCandidates[0],ordinal:8,rpm:20,powerVolumeWM3:5},
      {...i.hydraulicCandidates[0],ordinal:7,rpm:20,powerVolumeWM3:5},
    ];
    expect(runKuhniMassTransfer(i,dependencies()).selectedDesign).toMatchObject({rpm:30,ordinal:9});
    i.hydraulicCandidates[0].powerVolumeWM3=5;
    expect(runKuhniMassTransfer(i,dependencies()).selectedDesign).toMatchObject({rpm:20,ordinal:7});
  });
  it('returns terminal grid failures and never selects a partial envelope', () => {
    const i = input(); i.hydraulicCandidates.push({ ...i.hydraulicCandidates[0], ordinal: 2, rpm: 25 });
    const mt = { ...dependencies().massTransfer, evaluate: (r: any) => r.compartment === 1 && r.physicalCompartments === 1 ? { componentTransferMolS: [2, 0], componentDiffusiveFluxMolS: [1, -1], applicability: [], uncertainty: [] } : { componentTransferMolS: [.2 * r.continuousInMolarFlowMolS[0], -.02 * r.continuousInMolarFlowMolS[0]], componentDiffusiveFluxMolS: [.1, -.1], applicability: [], uncertainty: [] } };
    const r = runKuhniMassTransfer(i, dependencies({ massTransfer: mt }));
    expect(r.status).toBe('NUMERICAL_CLOSURE_FAILED');
    expect(r.selectedDesign).toBeNull();
    const hydro = input(); hydro.hydraulicCandidates[0].hydraulicallyFeasible = false;
    expect(runKuhniMassTransfer(hydro, dependencies()).status).toBe('HYDRAULICALLY_INFEASIBLE');
  });
});