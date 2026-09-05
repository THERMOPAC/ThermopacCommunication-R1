import { createHash } from 'node:crypto';

export const KUHNI_MASS_TRANSFER_VERSION = 'KUHNI_MASS_TRANSFER_STAGE_4_V1.1.0' as const;
export const PRE_PILOT_DESIGN_DEFAULT_NT = 7 as const;
export const KUHNI_MASS_TRANSFER_IMPLEMENTATION_HASH = createHash('sha256').update([
  KUHNI_MASS_TRANSFER_VERSION, 'final-constitutive-re-evaluation', 'injected-both-phase-backflow',
  'serializable-lineage-dto', 'deep-freeze-canonical-snapshot',
].join('|')).digest('hex');

export type NumericVector = readonly number[];
export type RangeStatus = 'CALCULATED_IN_RANGE' | 'CALCULATED_EXTRAPOLATED';
export type AreaModelStatus = RangeStatus | 'AREA_MODEL_EXTRAPOLATED';
export interface PhaseFeed { componentMolarFlowMolS: NumericVector; }
export interface Stage2Duty { id: string; [key: string]: unknown; }
export interface Stage2AuthorityInput {
  status: 'CALCULATED' | 'NOT_CALCULATED' | 'INVALID';
  theoreticalStages?: number | null; duty?: Stage2Duty | null; jobId?: string | null; resultHash?: string | null;
}
export interface Lineage {
  stage1SnapshotHash: string;
  stage2: { modelId: string; modelHash: string; engineId: string; engineHash: string; equilibriumId: string; equilibriumHash: string; };
  stage3: { runId: string; version: string; immutableHash: string; };
  propertyPackageHash: string; evidencePackageHash: string;
  hardwareGeometry: { source: string; hash: string; status: string; };
}
export interface HydraulicCandidate {
  ordinal: number; rpm: number; columnDiameterM: number; compartmentHeightM: number; powerVolumeWM3: number;
  trialId: string; trialImmutableHash: string;
  status: RangeStatus; applicability: string[]; uncertainty: string[]; pilotValidated: boolean; hydraulicallyFeasible: boolean;
}
export interface DutyAcceptanceTarget {
  phase: 'continuous' | 'dispersed'; componentId: string;
  metric: 'MOLAR_FLOW_MOL_S' | 'MOLE_FRACTION'; comparator: 'LTE' | 'GTE';
  target: number; tolerance: number;
}
export interface DutyAcceptanceContract {
  id: string; version: string; implementationHash: string; targets: DutyAcceptanceTarget[];
}
export interface KuhniMassTransferInput {
  lineage: Lineage; componentIds: string[]; continuousFeed: PhaseFeed; dispersedFeed: PhaseFeed;
  stage2?: Stage2AuthorityInput | null; stage2UnavailableReason?: string;
  hydraulicCandidates: HydraulicCandidate[]; maximumCompartments: number; maximumActiveHeightM: number;
  convergenceTolerance?: number; maximumIterations?: number;
  dutyAcceptance: DutyAcceptanceContract;
}
export interface ClosureIdentity { implementationId: string; version: string; implementationHash: string; }
export interface LocalState {
  compartment: number; physicalCompartments: number; continuousComponentMolarFlowMolS: number[];
  dispersedComponentMolarFlowMolS: number[];
}
export interface OperatingHydraulics extends ClosureIdentity {
  evaluate(state: LocalState): { operatingHoldup: number; d32M: number; areaModelStatus: AreaModelStatus; uncertainty: string[]; applicability: string[]; };
}
export interface LocalEquilibrium extends ClosureIdentity {
  evaluate(request: { componentIds: string[]; continuousComposition: number[]; dispersedComposition: number[]; compartment: number; physicalCompartments: number }):
    { continuousEquilibriumComposition: NumericVector; dispersedEquilibriumComposition: NumericVector; applicability: string[]; uncertainty: string[]; };
  generateReferenceDuty(request: { theoreticalStages: number; componentIds: string[]; continuousFeed: PhaseFeed; dispersedFeed: PhaseFeed }): Stage2Duty;
}
export interface MassTransfer extends ClosureIdentity {
  fluxFrame: { kind: 'MOLAR_AVERAGE'; constraint: 'ZERO_SUM_DIFFUSIVE_MOLAR_FLUX'; dependentComponentTreatment: string; };
  evaluate(request: { componentIds: string[]; compartment: number; physicalCompartments: number; compartmentVolumeM3: number; interfacialAreaM2M3: number;
    continuousInMolarFlowMolS: number[]; continuousOutMolarFlowMolS: number[]; dispersedInMolarFlowMolS: number[]; dispersedOutMolarFlowMolS: number[];
    equilibrium: ReturnType<LocalEquilibrium['evaluate']> }): { componentTransferMolS: NumericVector; componentDiffusiveFluxMolS: NumericVector; coefficients?: Record<string, NumericVector | number>; applicability: string[]; uncertainty: string[]; };
}
export interface AxialMixing extends ClosureIdentity {
  evaluate(request: { componentIds: string[]; compartment: number; physicalCompartments: number; continuousCellsMolarFlowMolS: number[][]; dispersedCellsMolarFlowMolS: number[][] }):
    { continuousComponentSourceMolS: NumericVector; dispersedComponentSourceMolS: NumericVector; applicability: string[]; uncertainty: string[]; };
}
export interface KuhniMassTransferDependencies {
  kernelArtifactHash: string;
  operatingHydraulics: OperatingHydraulics; equilibrium: LocalEquilibrium; massTransfer: MassTransfer; axialMixing: AxialMixing;
}

export function createNoAxialMixingClosure(identity: ClosureIdentity, applicability = ['AXIAL_MIXING_EXPLICITLY_NEGLECTED']): AxialMixing {
  return { ...identity, evaluate: ({ componentIds }) => ({
    continuousComponentSourceMolS: componentIds.map(() => 0), dispersedComponentSourceMolS: componentIds.map(() => 0),
    applicability, uncertainty: ['AXIAL_MIXING_NOT_PILOT_VALIDATED'],
  }) };
}

export interface TheoreticalStageAuthority {
  value: number; provenance: 'STAGE_2_CALCULATED_NT' | 'PRE_PILOT_DESIGN_DEFAULT'; reason: string | null;
  stage2JobId: string | null; stage2ResultHash: string | null;
}
export interface CellSolution {
  compartment: number; operatingHoldup: number; d32M: number; interfacialAreaM2M3: number; areaModelStatus: AreaModelStatus;
  transferMolS: number[]; componentDiffusiveFluxMolS: number[]; continuousMixingSourceMolS: number[]; dispersedMixingSourceMolS: number[];
  continuousInMolarFlowMolS: number[]; continuousOutMolarFlowMolS: number[]; dispersedInMolarFlowMolS: number[]; dispersedOutMolarFlowMolS: number[];
  componentLocalEfficiency: Array<number | null>; localMaterialBalanceResidualMolS: number; constitutiveResidualMolS: number; frameConstraintResidualMolS: number;
}
export interface FeasibleDesign {
  ordinal: number; rpm: number; status: RangeStatus; physicalCompartments: number; activeHeightM: number; activeVolumeM3: number; shaftPowerW: number;
  overallEfficiency: number; hetsM: number; continuousOutletMolarFlowMolS: number[]; dispersedOutletMolarFlowMolS: number[];
  cells: CellSolution[]; maxConstitutiveResidualMolS: number; maxLocalMaterialBalanceResidualMolS: number; maxGlobalMaterialBalanceResidualMolS: number;
  maxContinuousMixingConservationResidualMolS: number; maxDispersedMixingConservationResidualMolS: number; maxFrameConstraintResidualMolS: number;
  applicabilityFlags: string[]; uncertaintyFlags: string[];
}
export type CandidateStatus = 'FEASIBLE' | 'HYDRAULICALLY_INFEASIBLE' | 'NO_FEASIBLE_PHYSICAL_HEIGHT' | 'NUMERICAL_CLOSURE_FAILED' | 'MODEL_CLOSURE_FAILED';
export interface CandidateEvaluation { ordinal: number; rpm: number; status: CandidateStatus; design: FeasibleDesign | null; attemptedCompartments: number[]; reason: string | null; }
export interface KuhniMassTransferResult {
  status: 'CALCULATED' | 'NO_FEASIBLE_PHYSICAL_HEIGHT' | 'HYDRAULICALLY_INFEASIBLE' | 'MODEL_CLOSURE_FAILED' | 'NUMERICAL_CLOSURE_FAILED'; engine: { version: string; contractHash: string; kernelArtifactHash: string; };
  closureHashes: Record<'operatingHydraulics' | 'equilibrium' | 'massTransfer' | 'axialMixing', { implementationId: string; version: string; implementationHash: string; }>;
  lineage: Lineage; theoreticalStageAuthority: TheoreticalStageAuthority; governingDuty: Stage2Duty; dutyAcceptance: DutyAcceptanceContract;
  finalOperatingRpm: number | null; physicalCompartments: number | null; activeHeightM: number | null;
  selectedDesign: FeasibleDesign | null; feasibleEnvelope: FeasibleDesign[]; candidateEvaluations: CandidateEvaluation[]; resultHash: string;
}
class NumericalFailure extends Error {} class ModelFailure extends Error {}
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('NON_FINITE_VALUE_CANNOT_BE_HASHED');
  return JSON.stringify(value);
}
function cloneFreeze<T>(value: T): T {
  const clone = JSON.parse(JSON.stringify(value)) as T;
  const freeze = (v: unknown): unknown => { if (v && typeof v === 'object') { Object.values(v as object).forEach(freeze); Object.freeze(v); } return v; };
  return freeze(clone) as T;
}
export function kuhniMassTransferResultHash(result: Omit<KuhniMassTransferResult, 'resultHash'> | KuhniMassTransferResult): string {
  const { resultHash: _ignored, ...snapshot } = result as KuhniMassTransferResult; return hash(canonical(snapshot));
}
export function resolveTheoreticalStageAuthority(stage2?: Stage2AuthorityInput | null, reason?: string): TheoreticalStageAuthority {
  if (stage2?.status === 'CALCULATED' && Number.isFinite(stage2.theoreticalStages) && stage2.theoreticalStages! > 0 && stage2.duty) return {
    value: stage2.theoreticalStages!, provenance: 'STAGE_2_CALCULATED_NT', reason: null, stage2JobId: stage2.jobId ?? null, stage2ResultHash: stage2.resultHash ?? null,
  };
  return { value: 7, provenance: 'PRE_PILOT_DESIGN_DEFAULT', reason: reason?.trim() || (stage2?.status === 'CALCULATED' ? 'STAGE_2_CALCULATED_RESULT_INVALID_OR_DUTY_MISSING' : 'VALID_CALCULATED_STAGE_2_NT_UNAVAILABLE'), stage2JobId: stage2?.jobId ?? null, stage2ResultHash: stage2?.resultHash ?? null };
}
export function computeOperatingInterfacialArea(operatingHoldup: number, d32M: number): number {
  if (!(operatingHoldup > 0 && operatingHoldup < 1) || !Number.isFinite(operatingHoldup)) throw new ModelFailure('INVALID_OPERATING_HOLDUP');
  if (!(d32M > 0) || !Number.isFinite(d32M)) throw new ModelFailure('INVALID_OPERATING_D32'); return 6 * operatingHoldup / d32M;
}
function vector(v: NumericVector, n: number, code: string, signed = false) {
  if (v.length !== n || v.some(x => !Number.isFinite(x) || (!signed && x < 0))) throw new ModelFailure(code);
}
function composition(v: number[]) { const t = v.reduce((a, b) => a + b, 0); if (!(t > 0)) throw new NumericalFailure('NONPOSITIVE_PHASE_FLOW'); return v.map(x => x / t); }
function identity(value: ClosureIdentity, name: string) { if (!value.implementationId || !value.version || !/^[a-f0-9]{64}$/.test(value.implementationHash)) throw new Error(`INVALID_${name}_IDENTITY`); }
const isHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function validLineage(l: Lineage) { const text = [l.stage2.modelId, l.stage2.engineId, l.stage2.equilibriumId, l.stage3.runId, l.stage3.version, l.hardwareGeometry.source]; const hashes = [l.stage1SnapshotHash, l.stage2.modelHash, l.stage2.engineHash, l.stage2.equilibriumHash, l.stage3.immutableHash, l.propertyPackageHash, l.evidencePackageHash, l.hardwareGeometry.hash]; if (text.some(x => !x) || hashes.some(x => !isHash(x)) || l.hardwareGeometry.status !== 'GOVERNED') throw new Error('INCOMPLETE_PINNED_LINEAGE'); }
function prohibited(v: unknown, path = 'input'): void { if (!v || typeof v !== 'object') return; for (const [k, child] of Object.entries(v as Record<string, unknown>)) { const x = k.replace(/[_-]/g, '').toLowerCase(); if (x === 'floodholdup') throw new Error(`FLOOD_HOLDUP_PROHIBITED:${path}.${k}`); if (x === 'assumedefficiency' || x === 'stageefficiency') throw new Error(`ASSUMED_EFFICIENCY_PROHIBITED:${path}.${k}`); prohibited(child, `${path}.${k}`); } }
function flows(cFeed: NumericVector, dFeed: NumericVector, transfer: number[][], cmix: number[][], dmix: number[][]) {
  const n = transfer.length, m = cFeed.length; const ci: number[][] = [], co: number[][] = [], di = Array.from({ length: n }, () => Array(m).fill(0)), dout = Array.from({ length: n }, () => Array(m).fill(0));
  let c = [...cFeed]; for (let j = 0; j < n; j++) { ci.push([...c]); c = c.map((x, i) => x - transfer[j][i] + cmix[j][i]); co.push([...c]); }
  let d = [...dFeed]; for (let j = n - 1; j >= 0; j--) { di[j] = [...d]; d = d.map((x, i) => x + transfer[j][i] + dmix[j][i]); dout[j] = [...d]; }
  return { ci, co, di, dout };
}
function maxDelta(a: number[][], b: number[][]) { return Math.max(...a.flatMap((r, j) => r.map((x, i) => Math.abs(x - b[j][i])))); }
function dutyAccepted(contract: DutyAcceptanceContract, componentIds: string[], continuous: number[], dispersed: number[]): boolean {
  return contract.targets.every(target => {
    const index = componentIds.indexOf(target.componentId);
    const phase = target.phase === 'continuous' ? continuous : dispersed;
    const value = target.metric === 'MOLAR_FLOW_MOL_S'
      ? phase[index]
      : phase[index] / phase.reduce((sum, part) => sum + part, 0);
    return target.comparator === 'LTE'
      ? value <= target.target + target.tolerance
      : value >= target.target - target.tolerance;
  });
}

function solve(input: KuhniMassTransferInput, dep: KuhniMassTransferDependencies, candidate: HydraulicCandidate, count: number, nt: number): FeasibleDesign {
  const m = input.componentIds.length, tol = input.convergenceTolerance ?? 1e-9, maxIter = input.maximumIterations ?? 500;
  const area = Math.PI * candidate.columnDiameterM ** 2 / 4, volume = area * candidate.compartmentHeightM;
  let tr = Array.from({ length: count }, () => Array(m).fill(0)), cm = Array.from({ length: count }, () => Array(m).fill(0)), dm = Array.from({ length: count }, () => Array(m).fill(0));
  for (let it = 0; it < maxIter; it++) {
    const f = flows(input.continuousFeed.componentMolarFlowMolS, input.dispersedFeed.componentMolarFlowMolS, tr, cm, dm);
    const pTr: number[][] = [], pCm: number[][] = [], pDm: number[][] = [];
    for (let j = 0; j < count; j++) {
      if ([...f.ci[j], ...f.co[j], ...f.di[j], ...f.dout[j]].some(x => x < -tol || !Number.isFinite(x))) throw new NumericalFailure('NONNEGATIVE_STATE_GATE_FAILED');
      const state: LocalState = { compartment: j + 1, physicalCompartments: count, continuousComponentMolarFlowMolS: f.ci[j].map((x, i) => (x + f.co[j][i]) / 2), dispersedComponentMolarFlowMolS: f.di[j].map((x, i) => (x + f.dout[j][i]) / 2) };
      const h = dep.operatingHydraulics.evaluate(state); if (!['CALCULATED_IN_RANGE', 'CALCULATED_EXTRAPOLATED', 'AREA_MODEL_EXTRAPOLATED'].includes(h.areaModelStatus) || !Array.isArray(h.uncertainty) || !Array.isArray(h.applicability)) throw new ModelFailure('AREA_MODEL_METADATA_REQUIRED');
      const eq = dep.equilibrium.evaluate({ componentIds: input.componentIds, continuousComposition: composition(state.continuousComponentMolarFlowMolS), dispersedComposition: composition(state.dispersedComponentMolarFlowMolS), compartment: j + 1, physicalCompartments: count });
      vector(eq.continuousEquilibriumComposition, m, 'INVALID_EQUILIBRIUM_CONTINUOUS'); vector(eq.dispersedEquilibriumComposition, m, 'INVALID_EQUILIBRIUM_DISPERSED');
      if (Math.abs(eq.continuousEquilibriumComposition.reduce((a,b)=>a+b,0)-1)>tol || Math.abs(eq.dispersedEquilibriumComposition.reduce((a,b)=>a+b,0)-1)>tol) throw new ModelFailure('EQUILIBRIUM_COMPOSITION_NOT_NORMALIZED');
      const mt = dep.massTransfer.evaluate({ componentIds: input.componentIds, compartment: j + 1, physicalCompartments: count, compartmentVolumeM3: volume, interfacialAreaM2M3: computeOperatingInterfacialArea(h.operatingHoldup, h.d32M), continuousInMolarFlowMolS: f.ci[j], continuousOutMolarFlowMolS: f.co[j], dispersedInMolarFlowMolS: f.di[j], dispersedOutMolarFlowMolS: f.dout[j], equilibrium: eq });
      vector(mt.componentTransferMolS, m, 'INVALID_TRANSFER_VECTOR', true);
      vector(mt.componentDiffusiveFluxMolS, m, 'INVALID_DIFFUSIVE_FLUX_VECTOR', true);
      const mix = dep.axialMixing.evaluate({ componentIds: input.componentIds, compartment: j + 1, physicalCompartments: count, continuousCellsMolarFlowMolS: f.ci, dispersedCellsMolarFlowMolS: f.di });
      vector(mix.continuousComponentSourceMolS, m, 'INVALID_CONTINUOUS_MIXING_VECTOR', true); vector(mix.dispersedComponentSourceMolS, m, 'INVALID_DISPERSED_MIXING_VECTOR', true);
      pTr.push([...mt.componentTransferMolS]); pCm.push([...mix.continuousComponentSourceMolS]); pDm.push([...mix.dispersedComponentSourceMolS]);
    }
    const next = (old: number[][], proposed: number[][]) => old.map((r,j)=>r.map((x,i)=>x+.5*(proposed[j][i]-x)));
    const ntr = next(tr,pTr), ncm=next(cm,pCm), ndm=next(dm,pDm); const delta=Math.max(maxDelta(ntr,tr),maxDelta(ncm,cm),maxDelta(ndm,dm));
    tr=ntr; cm=ncm; dm=ndm; if (delta <= tol) break; if (it === maxIter-1) throw new NumericalFailure('COUNTER_CURRENT_SOLVER_DID_NOT_CONVERGE');
  }
  const f = flows(input.continuousFeed.componentMolarFlowMolS, input.dispersedFeed.componentMolarFlowMolS, tr, cm, dm);
  const flags = new Set<string>(candidate.applicability), uncertainty = new Set<string>(candidate.uncertainty);
  if (candidate.status === 'CALCULATED_EXTRAPOLATED') flags.add('HYDRAULIC_CORRELATION_EXTRAPOLATED'); if (!candidate.pilotValidated) { flags.add('PILOT_VALIDATION_NOT_AVAILABLE'); uncertainty.add('PRE_PILOT_PREDICTIVE_UNCERTAINTY'); }
  let constitutive=0, local=0, frame=0; const mixC=Array(m).fill(0), mixD=Array(m).fill(0); const cells: CellSolution[]=[];
  for (let j=0;j<count;j++) {
    const state: LocalState={compartment:j+1,physicalCompartments:count,continuousComponentMolarFlowMolS:f.ci[j].map((x,i)=>(x+f.co[j][i])/2),dispersedComponentMolarFlowMolS:f.di[j].map((x,i)=>(x+f.dout[j][i])/2)};
    const h=dep.operatingHydraulics.evaluate(state); if(!['CALCULATED_IN_RANGE','CALCULATED_EXTRAPOLATED','AREA_MODEL_EXTRAPOLATED'].includes(h.areaModelStatus)||!Array.isArray(h.uncertainty)||!Array.isArray(h.applicability)) throw new ModelFailure('AREA_MODEL_METADATA_REQUIRED');
    const eq=dep.equilibrium.evaluate({componentIds:input.componentIds,continuousComposition:composition(state.continuousComponentMolarFlowMolS),dispersedComposition:composition(state.dispersedComponentMolarFlowMolS),compartment:j+1,physicalCompartments:count});
    vector(eq.continuousEquilibriumComposition,m,'INVALID_EQUILIBRIUM_CONTINUOUS'); vector(eq.dispersedEquilibriumComposition,m,'INVALID_EQUILIBRIUM_DISPERSED');
    if(Math.abs(eq.continuousEquilibriumComposition.reduce((a,b)=>a+b,0)-1)>tol || Math.abs(eq.dispersedEquilibriumComposition.reduce((a,b)=>a+b,0)-1)>tol) throw new ModelFailure('EQUILIBRIUM_COMPOSITION_NOT_NORMALIZED');
    const mt=dep.massTransfer.evaluate({componentIds:input.componentIds,compartment:j+1,physicalCompartments:count,compartmentVolumeM3:volume,interfacialAreaM2M3:computeOperatingInterfacialArea(h.operatingHoldup,h.d32M),continuousInMolarFlowMolS:f.ci[j],continuousOutMolarFlowMolS:f.co[j],dispersedInMolarFlowMolS:f.di[j],dispersedOutMolarFlowMolS:f.dout[j],equilibrium:eq}); vector(mt.componentTransferMolS,m,'INVALID_TRANSFER_VECTOR',true); vector(mt.componentDiffusiveFluxMolS,m,'INVALID_DIFFUSIVE_FLUX_VECTOR',true);
    const mx=dep.axialMixing.evaluate({componentIds:input.componentIds,compartment:j+1,physicalCompartments:count,continuousCellsMolarFlowMolS:f.ci,dispersedCellsMolarFlowMolS:f.di}); vector(mx.continuousComponentSourceMolS,m,'INVALID_CONTINUOUS_MIXING_VECTOR',true); vector(mx.dispersedComponentSourceMolS,m,'INVALID_DISPERSED_MIXING_VECTOR',true);
    const cres=Math.max(...tr[j].map((x,i)=>Math.abs(mt.componentTransferMolS[i]-x)),...cm[j].map((x,i)=>Math.abs(mx.continuousComponentSourceMolS[i]-x)),...dm[j].map((x,i)=>Math.abs(mx.dispersedComponentSourceMolS[i]-x))); constitutive=Math.max(constitutive,cres); const frameResidual=Math.abs(mt.componentDiffusiveFluxMolS.reduce((a,b)=>a+b,0)); frame=Math.max(frame,frameResidual);
    const lres=Math.max(...tr[j].map((x,i)=>Math.abs(f.ci[j][i]-f.co[j][i]-x+cm[j][i])),...tr[j].map((x,i)=>Math.abs(f.di[j][i]-f.dout[j][i]+x+dm[j][i]))); local=Math.max(local,lres);
    for(let i=0;i<m;i++){mixC[i]+=cm[j][i];mixD[i]+=dm[j][i];} h.applicability.forEach(x=>flags.add(x));h.uncertainty.forEach(x=>uncertainty.add(x));eq.applicability.forEach(x=>flags.add(x));eq.uncertainty.forEach(x=>uncertainty.add(x));mt.applicability.forEach(x=>flags.add(x));mt.uncertainty.forEach(x=>uncertainty.add(x));mx.applicability.forEach(x=>flags.add(x));mx.uncertainty.forEach(x=>uncertainty.add(x));
    const cin=composition(f.ci[j]), cout=composition(f.co[j]); cells.push({compartment:j+1,operatingHoldup:h.operatingHoldup,d32M:h.d32M,interfacialAreaM2M3:computeOperatingInterfacialArea(h.operatingHoldup,h.d32M),areaModelStatus:h.areaModelStatus,transferMolS:[...tr[j]],componentDiffusiveFluxMolS:[...mt.componentDiffusiveFluxMolS],continuousMixingSourceMolS:[...cm[j]],dispersedMixingSourceMolS:[...dm[j]],continuousInMolarFlowMolS:f.ci[j],continuousOutMolarFlowMolS:f.co[j],dispersedInMolarFlowMolS:f.di[j],dispersedOutMolarFlowMolS:f.dout[j],componentLocalEfficiency:eq.continuousEquilibriumComposition.map((x,i)=>Math.abs(x-cin[i])<=tol?null:(cout[i]-cin[i])/(x-cin[i])),localMaterialBalanceResidualMolS:lres,constitutiveResidualMolS:cres,frameConstraintResidualMolS:frameResidual});
  }
  const maxMC=Math.max(...mixC.map(Math.abs)),maxMD=Math.max(...mixD.map(Math.abs)); if(constitutive>tol) throw new NumericalFailure('FINAL_CONSTITUTIVE_CLOSURE_FAILED'); if(frame>tol) throw new ModelFailure('DIFFUSIVE_FLUX_FRAME_CONSTRAINT_FAILED'); if(maxMC>tol||maxMD>tol) throw new NumericalFailure('AXIAL_MIXING_CONSERVATION_FAILED');
  const cout=f.co[count-1], dout=f.dout[0]; if([...cout,...dout].some(x=>x < -tol || !Number.isFinite(x))) throw new NumericalFailure('FINAL_NONNEGATIVE_STATE_GATE_FAILED');
  const global=Math.max(...cout.map((x,i)=>Math.abs(input.continuousFeed.componentMolarFlowMolS[i]+input.dispersedFeed.componentMolarFlowMolS[i]-x-dout[i])));
  if(global>tol||local>tol) throw new NumericalFailure('MATERIAL_BALANCE_CLOSURE_FAILED');
  const H=count*candidate.compartmentHeightM,V=area*H; return {ordinal:candidate.ordinal,rpm:candidate.rpm,status:candidate.status,physicalCompartments:count,activeHeightM:H,activeVolumeM3:V,shaftPowerW:candidate.powerVolumeWM3*V,overallEfficiency:nt/count,hetsM:H/nt,continuousOutletMolarFlowMolS:cout,dispersedOutletMolarFlowMolS:dout,cells,maxConstitutiveResidualMolS:constitutive,maxLocalMaterialBalanceResidualMolS:local,maxGlobalMaterialBalanceResidualMolS:global,maxContinuousMixingConservationResidualMolS:maxMC,maxDispersedMixingConservationResidualMolS:maxMD,maxFrameConstraintResidualMolS:frame,applicabilityFlags:[...flags].sort(),uncertaintyFlags:[...uncertainty].sort()};
}
function order(a:FeasibleDesign,b:FeasibleDesign){const eq=(x:number,y:number)=>Math.abs(x-y)<=1e-12*Math.max(1,Math.abs(x),Math.abs(y));return !eq(a.activeVolumeM3,b.activeVolumeM3)?a.activeVolumeM3-b.activeVolumeM3:!eq(a.shaftPowerW,b.shaftPowerW)?a.shaftPowerW-b.shaftPowerW:a.rpm-b.rpm||a.ordinal-b.ordinal;}
export function runKuhniMassTransfer(input: KuhniMassTransferInput, dep: KuhniMassTransferDependencies): KuhniMassTransferResult {
  prohibited(input); validLineage(input.lineage);
  identity(dep.operatingHydraulics, 'OPERATING_HYDRAULICS'); identity(dep.equilibrium, 'EQUILIBRIUM');
  identity(dep.massTransfer, 'MASS_TRANSFER'); identity(dep.axialMixing, 'AXIAL_MIXING');
  if (!isHash(dep.kernelArtifactHash) || dep.kernelArtifactHash === KUHNI_MASS_TRANSFER_IMPLEMENTATION_HASH) throw new Error('INVALID_KERNEL_ARTIFACT_HASH');
  if(dep.massTransfer.fluxFrame?.kind !== 'MOLAR_AVERAGE'||!dep.massTransfer.fluxFrame.dependentComponentTreatment||dep.massTransfer.fluxFrame.constraint !== 'ZERO_SUM_DIFFUSIVE_MOLAR_FLUX') throw new Error('MULTICOMPONENT_FLUX_FRAME_METADATA_REQUIRED');
  const m=input.componentIds.length;if(!m||new Set(input.componentIds).size!==m)throw new Error('INVALID_COMPONENT_IDS');vector(input.continuousFeed.componentMolarFlowMolS,m,'INVALID_CONTINUOUS_FEED');vector(input.dispersedFeed.componentMolarFlowMolS,m,'INVALID_DISPERSED_FEED');
  const tolerance=input.convergenceTolerance ?? 1e-9, maximumIterations=input.maximumIterations ?? 500;
  if(!Number.isFinite(tolerance)||tolerance<=0||!Number.isInteger(maximumIterations)||maximumIterations<=0)throw new Error('INVALID_SOLVER_CONTROLS');
  if(!Number.isInteger(input.maximumCompartments)||input.maximumCompartments<1||!Number.isFinite(input.maximumActiveHeightM)||!(input.maximumActiveHeightM>0))throw new Error('INVALID_SEARCH_BOUNDS');
  const dutyContract=input.dutyAcceptance;
  if(!dutyContract?.id||!dutyContract.version||!isHash(dutyContract.implementationHash)||!Array.isArray(dutyContract.targets)||!dutyContract.targets.length) throw new Error('INVALID_DUTY_ACCEPTANCE_CONTRACT');
  dutyContract.targets.forEach(target => { if(!['continuous','dispersed'].includes(target.phase)||!input.componentIds.includes(target.componentId)||!['MOLAR_FLOW_MOL_S','MOLE_FRACTION'].includes(target.metric)||!['LTE','GTE'].includes(target.comparator)||!Number.isFinite(target.target)||!Number.isFinite(target.tolerance)||target.tolerance<0) throw new Error('INVALID_DUTY_ACCEPTANCE_TARGET'); });
  if (input.stage2?.status === 'CALCULATED' && (!input.stage2.jobId || !isHash(input.stage2.resultHash))) throw new Error('CALCULATED_STAGE2_LINEAGE_INCOMPLETE');
  const authority=resolveTheoreticalStageAuthority(input.stage2,input.stage2UnavailableReason),duty=authority.provenance==='STAGE_2_CALCULATED_NT'?input.stage2!.duty!:dep.equilibrium.generateReferenceDuty({theoreticalStages:7,componentIds:input.componentIds,continuousFeed:input.continuousFeed,dispersedFeed:input.dispersedFeed});if(!duty?.id)throw new Error('INVALID_GOVERNING_DUTY');
  const evaluations:CandidateEvaluation[]=input.hydraulicCandidates.map(c=>{if(!(Number.isFinite(c.rpm)&&c.rpm>0&&Number.isFinite(c.columnDiameterM)&&c.columnDiameterM>0&&Number.isFinite(c.compartmentHeightM)&&c.compartmentHeightM>0&&Number.isFinite(c.powerVolumeWM3)&&c.powerVolumeWM3>=0&&Number.isInteger(c.ordinal)&&typeof c.trialId==='string'&&!!c.trialId&&isHash(c.trialImmutableHash)&&['CALCULATED_IN_RANGE','CALCULATED_EXTRAPOLATED'].includes(c.status)&&Array.isArray(c.applicability)&&Array.isArray(c.uncertainty)))throw new Error('INVALID_HYDRAULIC_CANDIDATE');if(!c.hydraulicallyFeasible)return{ordinal:c.ordinal,rpm:c.rpm,status:'HYDRAULICALLY_INFEASIBLE',design:null,attemptedCompartments:[],reason:'HYDRAULICALLY_INFEASIBLE'};const attempted:number[]=[];let failure:CandidateStatus|undefined,reason:string|null=null;for(let n=1;n<=input.maximumCompartments&&n*c.compartmentHeightM<=input.maximumActiveHeightM;n++){attempted.push(n);try{const d=solve({...input,convergenceTolerance:tolerance,maximumIterations},dep,c,n,authority.value);if(dutyAccepted(dutyContract,input.componentIds,d.continuousOutletMolarFlowMolS,d.dispersedOutletMolarFlowMolS))return{ordinal:c.ordinal,rpm:c.rpm,status:'FEASIBLE',design:d,attemptedCompartments:attempted,reason:null};}catch(e){failure=e instanceof ModelFailure?'MODEL_CLOSURE_FAILED':e instanceof NumericalFailure?'NUMERICAL_CLOSURE_FAILED':undefined;reason=e instanceof Error?e.message:'UNKNOWN_FAILURE';if(!failure)throw e;break;}}return{ordinal:c.ordinal,rpm:c.rpm,status:failure??'NO_FEASIBLE_PHYSICAL_HEIGHT',design:null,attemptedCompartments:attempted,reason:reason??'DUTY_NOT_MET_WITHIN_BOUNDS'};});
  const envelope=evaluations.flatMap(x=>x.design?[x.design]:[]).sort((a,b)=>a.ordinal-b.ordinal);
  const terminal=evaluations.some(x=>x.status==='MODEL_CLOSURE_FAILED')?'MODEL_CLOSURE_FAILED':evaluations.some(x=>x.status==='NUMERICAL_CLOSURE_FAILED')?'NUMERICAL_CLOSURE_FAILED':envelope.length?'CALCULATED':evaluations.length&&evaluations.every(x=>x.status==='HYDRAULICALLY_INFEASIBLE')?'HYDRAULICALLY_INFEASIBLE':'NO_FEASIBLE_PHYSICAL_HEIGHT';
  const selected=terminal==='CALCULATED'?[...envelope].sort(order)[0]??null:null;
  const body:Omit<KuhniMassTransferResult,'resultHash'>={status:terminal,engine:{version:KUHNI_MASS_TRANSFER_VERSION,contractHash:KUHNI_MASS_TRANSFER_IMPLEMENTATION_HASH,kernelArtifactHash:dep.kernelArtifactHash},closureHashes:{operatingHydraulics:pick(dep.operatingHydraulics),equilibrium:pick(dep.equilibrium),massTransfer:pick(dep.massTransfer),axialMixing:pick(dep.axialMixing)},lineage:input.lineage,theoreticalStageAuthority:authority,governingDuty:duty,dutyAcceptance:dutyContract,finalOperatingRpm:selected?.rpm??null,physicalCompartments:selected?.physicalCompartments??null,activeHeightM:selected?.activeHeightM??null,selectedDesign:selected,feasibleEnvelope:envelope,candidateEvaluations:evaluations};
  const frozen=cloneFreeze(body), result=cloneFreeze({...frozen,resultHash:kuhniMassTransferResultHash(frozen)}); return result;
}
function pick(x:ClosureIdentity){return{implementationId:x.implementationId,version:x.version,implementationHash:x.implementationHash};}
export const resolveKuhniMassTransfer=runKuhniMassTransfer;