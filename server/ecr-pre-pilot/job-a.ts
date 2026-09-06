import { createHash } from 'node:crypto';

export const JOB_A_VERSION = 'ECR_PRE_PILOT_JOB_A_V1' as const;
export const JOB_A_COMPONENT_ORDER = ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'] as const;
export const JOB_A_STAGE2_ENGINE_ID =
  'ECR2_PRE_PILOT_SEVEN_COMPONENT_0P5_5P0_H2O' as const;
export const JOB_A_STAGE2_ENGINE_VERSION = '7C-1.5.0' as const;
export type JobAComponentId = typeof JOB_A_COMPONENT_ORDER[number];
export type JobAPhase = 'continuous' | 'dispersed';

export const JOB_A_EVIDENCE_IDS = [
  'LAITINEN_2019_CHERD_146_518_527_EQ_13_14_20_23',
  'WILKE_CHANG_1955_COMPONENTWISE_INFINITE_DILUTION',
  'KOOIJMAN_WATER_SOLUTE_VB_TIMES_4_5',
  'JOBACK_1984_EQ_CRITICAL_VOLUME',
  'TYN_CALUS_1975_VB_FROM_VC',
  'REVISED_CLOSURE_REPORT_JOB_A',
] as const;

export const JOB_A_MOLECULAR_DATA: Readonly<Record<JobAComponentId, {
  identity: string; cas: string; molecularWeightGmol: number;
  criticalVolumeCm3Mol: number; boilingVolumeCm3Mol: number; volumeSource: string;
}>> = Object.freeze({
  SAT: { identity: 'n-dodecane', cas: '112-40-3', molecularWeightGmol: 170.3348, criticalVolumeCm3Mol: 713, boilingVolumeCm3Mol: 278.53686762800953, volumeSource: 'TYN_CALUS_FROM_COMPILED_VC' },
  MONO: { identity: 'n-propylbenzene', cas: '103-65-1', molecularWeightGmol: 120.1916, criticalVolumeCm3Mol: 440, boilingVolumeCm3Mol: 167.95125946719878, volumeSource: 'TYN_CALUS_FROM_COMPILED_VC' },
  DI: { identity: '1-methylnaphthalene', cas: '90-12-0', molecularWeightGmol: 142.1971, criticalVolumeCm3Mol: 465.5, boilingVolumeCm3Mol: 178.16594275007947, volumeSource: 'JOBACK_THEN_TYN_CALUS' },
  POLY: { identity: 'pyrene', cas: '129-00-0', molecularWeightGmol: 202.2506, criticalVolumeCm3Mol: 630, boilingVolumeCm3Mol: 244.65480846378912, volumeSource: 'TYN_CALUS_FROM_COMPILED_VC' },
  PA: { identity: "4,4'-bis(alpha,alpha-dimethylbenzyl)diphenylamine", cas: '10081-67-1', molecularWeightGmol: 405.58, criticalVolumeCm3Mol: 1296.5, boilingVolumeCm3Mol: 521.231269838688, volumeSource: 'JOBACK_THEN_TYN_CALUS' },
  NMP: { identity: 'N-methyl-2-pyrrolidone', cas: '872-50-4', molecularWeightGmol: 99.1311, criticalVolumeCm3Mol: 407, boilingVolumeCm3Mol: 154.7746394095033, volumeSource: 'TYN_CALUS_FROM_COMPILED_VC' },
  H2O: { identity: 'water', cas: '7732-18-5', molecularWeightGmol: 18.01528, criticalVolumeCm3Mol: 57.1, boilingVolumeCm3Mol: 19.76057153126099, volumeSource: 'TYN_CALUS_FROM_COMPILED_VC' },
});

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('JOB_A_NON_FINITE_HASH_INPUT');
  return JSON.stringify(value);
};
const sha256 = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');

const implementationDescriptor = {
  version: JOB_A_VERSION,
  componentOrder: JOB_A_COMPONENT_ORDER,
  stage2Authority: {
    engineId: JOB_A_STAGE2_ENGINE_ID,
    engineVersion: JOB_A_STAGE2_ENGINE_VERSION,
  },
  route: 'LAITINEN_2019_KH_BASE_SINGLE_DROP',
  continuous: 'A=.0526*Re^(1/3+.0659*Re^.25)*Sc^(1/3)*(U*muC/gamma)^(1/3)/(1+kappa^1.1);Sh=(rigid+A*infinity)/(1+A)',
  rigid: '2.43+.775*Re^.5*Sc^(1/3)+.0103*Re*Sc^(1/3)',
  infinity: '50+2/sqrt(pi)*Pe^.5',
  dispersed: '17.7+.00319*(Re*Sc^(1/3))^1.7/(1+.0143*(Re*Sc^(1/3))^.7)*(rhoD/rhoC)^(2/3)/(1+kappa^(2/3))',
  diffusivity: 'Wilke-Chang; phi=1; local phase-average MW; H2O solute Vb*=4.5',
  excluded: ['HOLDUP_CORRECTION', 'C1_PSI', 'C2_PSI', 'COLUMN_ENHANCEMENT'],
};
export const JOB_A_IMPLEMENTATION_SHA256 = sha256(implementationDescriptor);
export const JOB_A_EVIDENCE_SHA256 = sha256(JOB_A_EVIDENCE_IDS);

export interface JobAPhaseInput {
  densityKgM3: number;
  dynamicViscosityPaS: number;
  moleFractions: readonly number[];
}
export interface JobAEvaluationInput {
  stage1SnapshotHash: string;
  theoreticalStages: number;
  theoreticalStageProvenance: 'STAGE_2_CALCULATED_NT' | 'PRE_PILOT_DESIGN_DEFAULT';
  stage2JobId: string | null;
  stage2ResultHash: string | null;
  stage2EngineHash: string;
  thermodynamicAdapterPreflightHash: string;
  stage3RunId: string;
  stage3ImmutableHash: string;
  stage3ImplementationHash: string;
  selectedTrialId: string;
  selectedTrialOrdinal: number;
  temperatureK: number;
  interfacialTensionNM: number;
  d32M: number;
  slipVelocityMS: number;
  continuous: JobAPhaseInput;
  dispersed: JobAPhaseInput;
}

function positive(value: number, code: string): number {
  if (!Number.isFinite(value) || !(value > 0)) throw new Error(`JOB_A_NONPHYSICAL_INPUT:${code}`);
  return value;
}
function phase(input: JobAPhaseInput, code: string) {
  positive(input.densityKgM3, `${code}_DENSITY`);
  positive(input.dynamicViscosityPaS, `${code}_VISCOSITY`);
  if (input.moleFractions.length !== 7 || input.moleFractions.some(x => !Number.isFinite(x) || x < 0)) {
    throw new Error(`JOB_A_NONPHYSICAL_INPUT:${code}_COMPOSITION`);
  }
  const total = input.moleFractions.reduce((a, b) => a + b, 0);
  if (!(total > 0) || Math.abs(total - 1) > 1e-10) throw new Error(`JOB_A_NONPHYSICAL_INPUT:${code}_COMPOSITION_TOTAL`);
  const averageMwGmol = input.moleFractions.reduce(
    (sum, x, index) => sum + x * JOB_A_MOLECULAR_DATA[JOB_A_COMPONENT_ORDER[index]].molecularWeightGmol, 0,
  );
  return { ...input, averageMwGmol };
}

export function jobAResultHash(value: unknown): string {
  const snapshot = value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => key !== 'resultSha256'))
    : value;
  return sha256(snapshot);
}

export function evaluateJobA(raw: JobAEvaluationInput) {
  if (!/^[a-f0-9]{64}$/.test(raw.stage1SnapshotHash)
    || !Number.isInteger(raw.theoreticalStages) || raw.theoreticalStages < 1
    || !['STAGE_2_CALCULATED_NT', 'PRE_PILOT_DESIGN_DEFAULT'].includes(raw.theoreticalStageProvenance)
    || (raw.theoreticalStageProvenance === 'STAGE_2_CALCULATED_NT'
      && (!raw.stage2JobId || !raw.stage2ResultHash))
    || (raw.stage2ResultHash !== null && !/^[a-f0-9]{64}$/.test(raw.stage2ResultHash))
    || !/^[a-f0-9]{64}$/.test(raw.stage2EngineHash)
    || !/^[a-f0-9]{64}$/.test(raw.thermodynamicAdapterPreflightHash)
    || !/^[a-f0-9]{64}$/.test(raw.stage3ImmutableHash)
    || !/^[a-f0-9]{64}$/.test(raw.stage3ImplementationHash)
    || !raw.stage3RunId || !raw.selectedTrialId || !Number.isInteger(raw.selectedTrialOrdinal)) {
    throw new Error('JOB_A_INVALID_DEPENDENCY_LINEAGE');
  }
  const temperatureK = positive(raw.temperatureK, 'TEMPERATURE');
  const gamma = positive(raw.interfacialTensionNM, 'INTERFACIAL_TENSION');
  const d32M = positive(raw.d32M, 'D32');
  const slipVelocityMS = positive(raw.slipVelocityMS, 'SLIP_VELOCITY');
  const continuous = phase(raw.continuous, 'CONTINUOUS');
  const dispersed = phase(raw.dispersed, 'DISPERSED');
  const rhoC = continuous.densityKgM3;
  const rhoD = dispersed.densityKgM3;
  const muC = continuous.dynamicViscosityPaS;
  const muD = dispersed.dynamicViscosityPaS;
  const reynolds = rhoC * slipVelocityMS * d32M / muC;
  const kappa = muD / muC;
  positive(reynolds, 'REYNOLDS');
  positive(kappa, 'KAPPA');

  const cells = JOB_A_COMPONENT_ORDER.flatMap((componentId) => {
    const molecular = JOB_A_MOLECULAR_DATA[componentId];
    return (['continuous', 'dispersed'] as const).map((phaseId) => {
      const p = phaseId === 'continuous' ? continuous : dispersed;
      const correctedVb = molecular.boilingVolumeCm3Mol * (componentId === 'H2O' ? 4.5 : 1);
      const viscosityCp = p.dynamicViscosityPaS * 1000;
      const diffusivityCm2S = 7.4e-8 * Math.sqrt(p.averageMwGmol) * temperatureK
        / (viscosityCp * correctedVb ** 0.6);
      const diffusivityM2S = diffusivityCm2S * 1e-4;
      const schmidt = p.dynamicViscosityPaS / (p.densityKgM3 * diffusivityM2S);
      const peclet = d32M * slipVelocityMS / diffusivityM2S;
      let sherwood: number;
      if (phaseId === 'continuous') {
        const rigid = 2.43 + .775 * Math.sqrt(reynolds) * schmidt ** (1 / 3)
          + .0103 * reynolds * schmidt ** (1 / 3);
        const infinite = 50 + 2 / Math.sqrt(Math.PI) * Math.sqrt(peclet);
        const ratio = .0526 * reynolds ** (1 / 3 + .0659 * reynolds ** .25)
          * schmidt ** (1 / 3) * (slipVelocityMS * muC / gamma) ** (1 / 3)
          / (1 + kappa ** 1.1);
        sherwood = (rigid + ratio * infinite) / (1 + ratio);
      } else {
        const group = reynolds * schmidt ** (1 / 3);
        sherwood = 17.7 + .00319 * group ** 1.7 / (1 + .0143 * group ** .7)
          * (rhoD / rhoC) ** (2 / 3) / (1 + kappa ** (2 / 3));
      }
      const filmCoefficientMS = sherwood * diffusivityM2S / d32M;
      [diffusivityM2S, schmidt, peclet, sherwood, filmCoefficientMS]
        .forEach((x, index) => positive(x, `${componentId}_${phaseId}_${index}`));
      const flags = [
        'PRE_PILOT_PREDICTIVE_APPROXIMATION', 'DIFFUSION_MODEL_APPROXIMATE',
        'INFINITE_DILUTION_APPLIED_TO_LOCAL_PSEUDOPHASE', 'NOT_PILOT_VALIDATED',
        'NOT_RELEASE_ELIGIBLE', 'CORRELATION_EXTRAPOLATED',
        ...(componentId === 'H2O' ? ['KOOIJMAN_WATER_SOLUTE_VOLUME_CORRECTION'] : []),
      ];
      return {
        componentId, phase: phaseId, diffusivityM2S, reynolds, schmidt, peclet,
        sherwood, filmCoefficientMS,
        D_m2_s: diffusivityM2S,
        Re: reynolds,
        Sc: schmidt,
        Pe: peclet,
        Sh: sherwood,
        k_m_s: filmCoefficientMS,
        molecularInputs: {
          ...molecular, phaseAverageMolecularWeightGmol: p.averageMwGmol,
          associationFactorPhi: 1, wilkeChangViscosityCp: viscosityCp,
          wilkeChangBoilingVolumeCm3Mol: correctedVb,
          waterSoluteVolumeMultiplier: componentId === 'H2O' ? 4.5 : 1,
        },
        dimensionalAudit: {
          diffusivityConversion: { valueCm2S: diffusivityCm2S, multiplierM2PerCm2: 1e-4, valueM2S: diffusivityM2S },
          reynoldsIdentity: { numerator: rhoC * slipVelocityMS * d32M, denominator: muC, residual: reynolds - rhoC * slipVelocityMS * d32M / muC },
          schmidtIdentity: { numerator: p.dynamicViscosityPaS, denominator: p.densityKgM3 * diffusivityM2S, residual: schmidt - p.dynamicViscosityPaS / (p.densityKgM3 * diffusivityM2S) },
          pecletIdentity: { numerator: d32M * slipVelocityMS, denominator: diffusivityM2S, residual: peclet - d32M * slipVelocityMS / diffusivityM2S },
          filmIdentity: { numerator: sherwood * diffusivityM2S, denominator: d32M, residual: filmCoefficientMS - sherwood * diffusivityM2S / d32M },
        },
        flags,
      };
    });
  });
  const inputSha256 = sha256(raw);
  const body = {
    status: 'JOB_A_CLOSED_FOR_PRE_PILOT_IMPLEMENTATION' as const,
    schemaVersion: JOB_A_VERSION,
    componentOrder: JOB_A_COMPONENT_ORDER,
    phaseOrder: ['continuous', 'dispersed'] as const,
    thermodynamicAuthority: {
      engineId: JOB_A_STAGE2_ENGINE_ID,
      engineVersion: JOB_A_STAGE2_ENGINE_VERSION,
      jobId: raw.stage2JobId,
      resultHash: raw.stage2ResultHash,
      engineHash: raw.stage2EngineHash,
      adapterPreflightHash: raw.thermodynamicAdapterPreflightHash,
      adapterPreflightStatus: 'PASS',
      referenceDutyOperation: 'REFERENCE_DUTY',
      referenceDutyExecution: 'NOT_EXECUTED_BY_JOB_A',
      componentOrder: JOB_A_COMPONENT_ORDER,
    },
    implementationSha256: JOB_A_IMPLEMENTATION_SHA256,
    evidenceSha256: JOB_A_EVIDENCE_SHA256,
    evidenceIds: JOB_A_EVIDENCE_IDS,
    inputSha256,
    dependencies: {
      stage1SnapshotHash: raw.stage1SnapshotHash,
      theoreticalStages: raw.theoreticalStages,
      theoreticalStageProvenance: raw.theoreticalStageProvenance,
      stage2JobId: raw.stage2JobId,
      stage2ResultHash: raw.stage2ResultHash,
      stage2EngineHash: raw.stage2EngineHash,
      thermodynamicAdapterPreflightHash: raw.thermodynamicAdapterPreflightHash,
      stage3RunId: raw.stage3RunId,
      stage3ImmutableHash: raw.stage3ImmutableHash, stage3ImplementationHash: raw.stage3ImplementationHash,
      selectedTrialId: raw.selectedTrialId, selectedTrialOrdinal: raw.selectedTrialOrdinal,
    },
    input: raw,
    localHydraulics: {
      temperatureK,
      interfacialTensionNM: gamma,
      d32M,
      slipVelocityMS,
      reynolds,
      dispersedToContinuousViscosityRatio: kappa,
      continuousDensityKgM3: rhoC,
      dispersedDensityKgM3: rhoD,
      continuousViscosityPaS: muC,
      dispersedViscosityPaS: muD,
      source: 'FROZEN_STAGE_3_LOCAL_STATE' as const,
      recomputedPower: false as const,
      recomputedDropSize: false as const,
      recomputedHoldup: false as const,
      recomputedSlipVelocity: false as const,
    },
    cells,
    flags: [
      'PRE_PILOT_PREDICTIVE_APPROXIMATION',
      'DIFFUSION_MODEL_APPROXIMATE',
      'INFINITE_DILUTION_APPLIED_TO_LOCAL_PSEUDOPHASE',
      'NOT_PILOT_VALIDATED',
      'NOT_RELEASE_ELIGIBLE',
      'CORRELATION_EXTRAPOLATED',
    ] as const,
    excludedEnhancements: {
      holdupCorrectionApplied: false as const,
      c1PsiApplied: false as const,
      c2Available: false as const,
      c2Value: null,
      psiUsed: false as const,
      statement: 'K&H base/single-drop route; no column-enhancement coefficient is inferred or set to zero.',
    },
    legacyPathInvoked: false as const,
    releaseEligible: false as const,
    pilotValidated: false as const,
  };
  return { ...body, resultSha256: jobAResultHash(body) };
}