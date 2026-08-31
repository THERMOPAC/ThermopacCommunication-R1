import { createHash } from 'node:crypto';
import { ECR_PRE_PILOT_PA_ANCHOR_EVIDENCE } from '../research/ecr-pre-pilot-pa-anchor/evidence';
import {
  SIX_COMPONENT_COSMO_SAC_BASIS,
  SIX_COMPONENT_COSMO_SAC_BASIS_MANIFEST_SHA256,
  resolveStage1SixComponentCosmoSacBinding,
  stage1SixComponentCosmoSacBindingHash,
  type SixComponentCosmoSacBasis,
  type SixComponentCosmoSacStage1Binding,
  validateStage1SixComponentCosmoSacBinding,
  validateSixComponentCosmoSacBasis,
} from './six-component-cosmo-sac-basis';

export const ECR_PRE_PILOT_STAGE1_SCHEMA = 'ECR_PRE_PILOT_STAGE_1_V1' as const;

export const PREDICTIVE_NT_MOLECULAR_REGISTRY = {
  saturates: [
    { identity: 'n-dodecane', label: 'n-Dodecane', molecularWeightGmol: 170.34 },
    { identity: 'n-tetradecane', label: 'n-Tetradecane', molecularWeightGmol: 198.39 },
    { identity: 'n-hexadecane', label: 'n-Hexadecane', molecularWeightGmol: 226.44 },
    { identity: 'n-heptadecane', label: 'n-Heptadecane', molecularWeightGmol: 240.47 },
  ],
  monoAromatics: [
    { identity: 'n-propylbenzene', label: 'n-Propylbenzene', molecularWeightGmol: 120.19 },
    { identity: 'n-pentylbenzene', label: 'n-Pentylbenzene', molecularWeightGmol: 148.25 },
    { identity: 'sec-butylbenzene', label: 'sec-Butylbenzene', molecularWeightGmol: 134.22 },
    { identity: '1,3,5-trimethylbenzene', label: '1,3,5-Trimethylbenzene', molecularWeightGmol: 120.19 },
    { identity: 'p-xylene', label: 'p-Xylene', molecularWeightGmol: 106.17 },
    { identity: 'toluene', label: 'Toluene', molecularWeightGmol: 92.14 },
  ],
  diAromatics: {
    identity: '1-methylnaphthalene',
    label: '1-Methylnaphthalene',
    molecularWeightGmol: 142.1971,
    admission: 'FIXED_GOVERNED_SURROGATE',
    provenance: 'NIST Chemistry WebBook molecular weight; frozen descriptor-transfer registry',
    applicability: 'Predictive five-component surrogate screening only',
  },
  polyAromatics: {
    identity: 'pyrene',
    label: 'Pyrene',
    molecularWeightGmol: 202.2506,
    admission: 'FIXED_GOVERNED_SURROGATE',
    provenance: 'NIST Chemistry WebBook molecular weight; frozen descriptor-transfer registry',
    applicability: 'Predictive five-component surrogate screening only',
  },
  nmp: {
    identity: 'N-methyl-2-pyrrolidone',
    label: 'N-Methyl-2-pyrrolidone',
    molecularWeightGmol: 99.1311,
  },
  polarAromatics: {
    admission: ECR_PRE_PILOT_PA_ANCHOR_EVIDENCE.admission,
    representative: ECR_PRE_PILOT_PA_ANCHOR_EVIDENCE.identity,
    molecularWeightGmol: ECR_PRE_PILOT_PA_ANCHOR_EVIDENCE.identity.molecularWeightGmol,
    representativePurpose: ECR_PRE_PILOT_PA_ANCHOR_EVIDENCE.representativePurpose,
    sulfurRelationship: ECR_PRE_PILOT_PA_ANCHOR_EVIDENCE.sulfurRelationship,
    parameters: ECR_PRE_PILOT_PA_ANCHOR_EVIDENCE.thermodynamicClosure,
    lleEvidence: null,
    applicability: ECR_PRE_PILOT_PA_ANCHOR_EVIDENCE.applicability,
    blocker: ECR_PRE_PILOT_PA_ANCHOR_EVIDENCE.thermodynamicClosure.primaryBlocker,
  },
} as const;

export interface EcrPrePilotStage1Input {
  projectReference: string;
  rrboGrade: string;
  designFeedRateLph: number;
  operatingTemperatureC: number;
  operatingPressure: string;
  phaseConfiguration: string;
  saturatesWt: number;
  monoAromaticsWt: number;
  diAromaticsWt: number;
  polyAromaticsWt: number;
  polarAromaticsWt: number;
  nmpInFeedWt: number;
  rrboDensityKgM3: number;
  rrboDynamicViscosityCp: number;
  rrboInterfacialTensionMnM: number;
  nmpPurityWt: number;
  nmpWaterWt: number;
  nmpTemperatureC: number;
  nmpDensityKgM3: number;
  nmpDynamicViscosityCp: number;
  solventOilRatio: number;
  targetRaffinateSulfurPpm: number;
  minimumRaffinateSaturatesWt: number;
  targetRaffinateTotalAromaticsWt: number;
  targetRaffinatePolarAromaticsWt: number;
  minimumRecoveryPct: number;
  maximumNmpRaffinateWt: number;
  feedSulfurPpm: number;
  sulfurAllocationSatPct: number;
  sulfurAllocationMonoPct: number;
  sulfurAllocationDiPct: number;
  sulfurAllocationPolyPct: number;
  sulfurAllocationPaPct: number;
  designBasisNotes: string;
  satIdentity: string;
  monoIdentity: string;
  maximumStages: number;
}

export interface EcrPrePilotStage1Snapshot {
  schemaVersion: typeof ECR_PRE_PILOT_STAGE1_SCHEMA;
  savedAt: string;
  stage1: EcrPrePilotStage1Input;
  sulfurPrediction: {
    status: 'NOT_CALCULABLE';
    calibrationStatus: 'CALIBRATION_REQUIRED';
  };
  polarAromaticsAdmission: typeof PREDICTIVE_NT_MOLECULAR_REGISTRY.polarAromatics;
  sixComponentCosmoSacBasis: SixComponentCosmoSacBasis;
  sixComponentCosmoSacBasisManifestSha256: string;
  sixComponentCosmoSacBinding: SixComponentCosmoSacStage1Binding;
  sixComponentCosmoSacBindingSha256: string;
  immutableHash: string;
}

const RRBO_GRADES = new Set(['SN150', 'SN300', 'SN500']);
const FEED_RATES = new Set(Array.from({ length: 15 }, (_, index) => (index + 1) * 1000));
const TEMPERATURES = new Set([25, 30, ...Array.from({ length: 7 }, (_, index) => (index + 4) * 10)]);
const PRESSURES = new Set(['atmospheric', '1.0', '1.5', '2.0', '3.0', 'other']);
const PHASE_CONFIGURATIONS = new Set([
  'nmp-continuous-rrbo-dispersed',
  'rrbo-continuous-nmp-dispersed',
]);
const SOLVENT_RATIOS = new Set([0.5, 0.75, 0.9, 1, 1.25, 1.5, 2]);
const SULFUR_TARGETS = new Set([750, 1000, 1500, 2000, 2500]);
const SATURATES_TARGETS = new Set([90, 92.5, 95, 97.5]);
const AROMATICS_TARGETS = new Set(Array.from({ length: 17 }, (_, index) => 2 + index * 0.5));
const POLAR_TARGETS = new Set([0.1, 0.25, 0.5, 1, 2]);
const RECOVERY_TARGETS = new Set(Array.from({ length: 11 }, (_, index) => 80 + index));
const NMP_TARGETS = new Set([0.1, 0.25, 0.5, 1]);
const SAT_IDENTITIES = new Set(PREDICTIVE_NT_MOLECULAR_REGISTRY.saturates.map(({ identity }) => identity));
const MONO_IDENTITIES = new Set(PREDICTIVE_NT_MOLECULAR_REGISTRY.monoAromatics.map(({ identity }) => identity));
const MAXIMUM_STAGE_OPTIONS = new Set(Array.from({ length: 9 }, (_, index) => index + 2));

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('INVALID_STAGE1_INPUT');
  }
  return value as Record<string, unknown>;
}

function text(source: Record<string, unknown>, key: string, maximum = 2000): string {
  if (typeof source[key] !== 'string') throw new Error(`INVALID_STAGE1_${key}`);
  const value = source[key].trim();
  if (!value || value.length > maximum) throw new Error(`INVALID_STAGE1_${key}`);
  return value;
}

function optionalText(source: Record<string, unknown>, key: string, maximum = 2000): string {
  if (source[key] === undefined || source[key] === null) return '';
  if (typeof source[key] !== 'string') throw new Error(`INVALID_STAGE1_${key}`);
  const value = source[key].trim();
  if (value.length > maximum) throw new Error(`INVALID_STAGE1_${key}`);
  return value;
}

function numberValue(
  source: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum = Number.POSITIVE_INFINITY,
): number {
  const value = typeof source[key] === 'string' && source[key] !== ''
    ? Number(source[key])
    : source[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`INVALID_STAGE1_${key}`);
  }
  return value;
}

function requireOption<T>(value: T, options: Set<T>, key: string): T {
  if (!options.has(value)) throw new Error(`INVALID_STAGE1_${key}`);
  return value;
}

export function canonicalizeStage1Input(
  raw: unknown,
  projectNumber: number,
): EcrPrePilotStage1Input {
  const source = record(raw);
  const projectReference = text(source, 'projectReference', 32);
  if (projectReference !== String(projectNumber)) throw new Error('STAGE1_PROJECT_REFERENCE_MISMATCH');

  const stage1: EcrPrePilotStage1Input = {
    projectReference,
    rrboGrade: requireOption(text(source, 'rrboGrade', 16), RRBO_GRADES, 'rrboGrade'),
    designFeedRateLph: requireOption(numberValue(source, 'designFeedRateLph', 1), FEED_RATES, 'designFeedRateLph'),
    operatingTemperatureC: requireOption(numberValue(source, 'operatingTemperatureC', 25, 100), TEMPERATURES, 'operatingTemperatureC'),
    operatingPressure: requireOption(text(source, 'operatingPressure', 32), PRESSURES, 'operatingPressure'),
    phaseConfiguration: requireOption(text(source, 'phaseConfiguration', 64), PHASE_CONFIGURATIONS, 'phaseConfiguration'),
    saturatesWt: numberValue(source, 'saturatesWt', 0, 100),
    monoAromaticsWt: numberValue(source, 'monoAromaticsWt', 0, 100),
    diAromaticsWt: numberValue(source, 'diAromaticsWt', 0, 100),
    polyAromaticsWt: numberValue(source, 'polyAromaticsWt', 0, 100),
    polarAromaticsWt: numberValue(source, 'polarAromaticsWt', 0, 100),
    nmpInFeedWt: numberValue(source, 'nmpInFeedWt', 0, 100),
    rrboDensityKgM3: numberValue(source, 'rrboDensityKgM3', 0.001),
    rrboDynamicViscosityCp: numberValue(source, 'rrboDynamicViscosityCp', 0.001),
    rrboInterfacialTensionMnM: numberValue(source, 'rrboInterfacialTensionMnM', 0.001),
    nmpPurityWt: numberValue(source, 'nmpPurityWt', 0, 100),
    nmpWaterWt: numberValue(source, 'nmpWaterWt', 0, 100),
    nmpTemperatureC: numberValue(source, 'nmpTemperatureC', 25, 100),
    nmpDensityKgM3: numberValue(source, 'nmpDensityKgM3', 0.001),
    nmpDynamicViscosityCp: numberValue(source, 'nmpDynamicViscosityCp', 0.001),
    solventOilRatio: requireOption(numberValue(source, 'solventOilRatio', 0.01), SOLVENT_RATIOS, 'solventOilRatio'),
    targetRaffinateSulfurPpm: requireOption(numberValue(source, 'targetRaffinateSulfurPpm', 0), SULFUR_TARGETS, 'targetRaffinateSulfurPpm'),
    minimumRaffinateSaturatesWt: requireOption(numberValue(source, 'minimumRaffinateSaturatesWt', 0, 100), SATURATES_TARGETS, 'minimumRaffinateSaturatesWt'),
    targetRaffinateTotalAromaticsWt: requireOption(numberValue(source, 'targetRaffinateTotalAromaticsWt', 0, 100), AROMATICS_TARGETS, 'targetRaffinateTotalAromaticsWt'),
    targetRaffinatePolarAromaticsWt: requireOption(numberValue(source, 'targetRaffinatePolarAromaticsWt', 0, 100), POLAR_TARGETS, 'targetRaffinatePolarAromaticsWt'),
    minimumRecoveryPct: requireOption(numberValue(source, 'minimumRecoveryPct', 0, 100), RECOVERY_TARGETS, 'minimumRecoveryPct'),
    maximumNmpRaffinateWt: requireOption(numberValue(source, 'maximumNmpRaffinateWt', 0, 100), NMP_TARGETS, 'maximumNmpRaffinateWt'),
    feedSulfurPpm: numberValue(source, 'feedSulfurPpm', 0),
    sulfurAllocationSatPct: numberValue(source, 'sulfurAllocationSatPct', 0, 100),
    sulfurAllocationMonoPct: numberValue(source, 'sulfurAllocationMonoPct', 0, 100),
    sulfurAllocationDiPct: numberValue(source, 'sulfurAllocationDiPct', 0, 100),
    sulfurAllocationPolyPct: numberValue(source, 'sulfurAllocationPolyPct', 0, 100),
    sulfurAllocationPaPct: numberValue(source, 'sulfurAllocationPaPct', 0, 100),
    designBasisNotes: optionalText(source, 'designBasisNotes'),
    satIdentity: requireOption(text(source, 'satIdentity', 80), SAT_IDENTITIES, 'satIdentity'),
    monoIdentity: requireOption(text(source, 'monoIdentity', 80), MONO_IDENTITIES, 'monoIdentity'),
    maximumStages: requireOption(numberValue(source, 'maximumStages', 2, 10), MAXIMUM_STAGE_OPTIONS, 'maximumStages'),
  };

  const compositionTotal = stage1.saturatesWt + stage1.monoAromaticsWt + stage1.diAromaticsWt
    + stage1.polyAromaticsWt + stage1.polarAromaticsWt + stage1.nmpInFeedWt;
  if (Math.abs(compositionTotal - 100) >= 0.005) throw new Error('INVALID_STAGE1_COMPOSITION_TOTAL');
  const sulfurAllocationTotal = stage1.sulfurAllocationSatPct + stage1.sulfurAllocationMonoPct
    + stage1.sulfurAllocationDiPct + stage1.sulfurAllocationPolyPct + stage1.sulfurAllocationPaPct;
  if (Math.abs(sulfurAllocationTotal - 100) > 1e-9) {
    throw new Error('INVALID_STAGE1_SULFUR_ALLOCATION_TOTAL');
  }
  return stage1;
}

export function makeStage1Snapshot(stage1: EcrPrePilotStage1Input): EcrPrePilotStage1Snapshot {
  const sixComponentCosmoSacBinding = resolveStage1SixComponentCosmoSacBinding(stage1);
  const snapshot: Omit<EcrPrePilotStage1Snapshot, 'immutableHash'> = {
    schemaVersion: ECR_PRE_PILOT_STAGE1_SCHEMA,
    savedAt: new Date().toISOString(),
    stage1,
    sulfurPrediction: {
      status: 'NOT_CALCULABLE',
      calibrationStatus: 'CALIBRATION_REQUIRED',
    },
    polarAromaticsAdmission: PREDICTIVE_NT_MOLECULAR_REGISTRY.polarAromatics,
    sixComponentCosmoSacBasis: SIX_COMPONENT_COSMO_SAC_BASIS,
    sixComponentCosmoSacBasisManifestSha256: SIX_COMPONENT_COSMO_SAC_BASIS_MANIFEST_SHA256,
    sixComponentCosmoSacBinding,
    sixComponentCosmoSacBindingSha256:
      stage1SixComponentCosmoSacBindingHash(sixComponentCosmoSacBinding),
  };
  return { ...snapshot, immutableHash: stage1SnapshotHash(snapshot) };
}

export function stage1SnapshotHash(snapshot: Omit<EcrPrePilotStage1Snapshot, 'immutableHash'> | EcrPrePilotStage1Snapshot): string {
  const { immutableHash: _ignored, ...immutableSnapshot } = snapshot as EcrPrePilotStage1Snapshot;
  const canonicalJson = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  };
  return createHash('sha256').update(canonicalJson(immutableSnapshot)).digest('hex');
}

export function validateStage1Snapshot(rawSnapshot: unknown): EcrPrePilotStage1Snapshot {
  if (!rawSnapshot || typeof rawSnapshot !== 'object') throw new Error('STAGE1_INPUT_NOT_SAVED');
  const snapshot = rawSnapshot as EcrPrePilotStage1Snapshot;
  if (
    snapshot.schemaVersion !== ECR_PRE_PILOT_STAGE1_SCHEMA
    || typeof snapshot.savedAt !== 'string'
    || !snapshot.savedAt
    || !/^[a-f0-9]{64}$/.test(snapshot.immutableHash)
  ) {
    throw new Error('STAGE1_SNAPSHOT_INVALID');
  }
  validateSixComponentCosmoSacBasis(
    snapshot.sixComponentCosmoSacBasis,
    snapshot.sixComponentCosmoSacBasisManifestSha256,
  );
  validateStage1SixComponentCosmoSacBinding(
    snapshot.sixComponentCosmoSacBinding,
    snapshot.sixComponentCosmoSacBindingSha256,
    snapshot.stage1,
  );
  if (stage1SnapshotHash(snapshot) !== snapshot.immutableHash) {
    throw new Error('STAGE1_SNAPSHOT_HASH_MISMATCH');
  }
  return snapshot;
}