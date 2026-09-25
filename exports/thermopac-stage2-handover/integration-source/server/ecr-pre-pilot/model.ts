export const PRE_PILOT_MODEL = {
  packageId: 'PRE_PILOT_MODEL',
  packageVersion: '2.0.0',
  modelHash: '9666ff67194102ca9c3dc139695bead8ff133fbfe24c2d786ce1deca49456196',
  operationalDecision: 'RESEARCH_DIAGNOSTIC_ONLY',
  calibrationStatus: 'CALIBRATION_REQUIRED',
  qualificationDecision: 'REJECT',
  qualificationGoverningStatus: 'FAIL_CLOSED',
  releaseEligibility: 'BLOCKED',
  pilotValidated: false,
  gates: {
    topologyRecallMinimum: 0.9,
    tieLineRmsdMaximum: 0.03,
  },
  limitations: {
    supportedOperationalScope: 'SAT_MONO_DI_POLY_PA_NMP_COSMO_SAC_RESEARCH_DIAGNOSTIC',
    branching: 'SCREEN_ONLY',
    cycloalkane: 'FAIL_CLOSED',
    diPoly: 'FIXED_GOVERNED_SURROGATES',
    polarAromatics: 'EXACT_PA_ANCHOR_SIX_COMPONENT_RESEARCH_ONLY',
    sulfur: 'FAIL_CLOSED',
  },
} as const;

export const PRE_PILOT_MULTISTAGE_MODEL_1_4 = {
  ...PRE_PILOT_MODEL,
  packageId: 'PRE_PILOT_MULTISTAGE_MODEL',
  packageVersion: '7C-1.4.0',
  // SHA-256 of the immutable 7C-1.4 identity tuple: formulation, Task-238
  // artifact/version, fitted parameter vector, and pinned results artifact.
  // This deliberately never reuses the historical PRE_PILOT_MODEL hash.
  modelHash: '5b226f456778a1b85b7813417800d4bc9fb0713066994baeb88de70977801691',
  operationalDecision: 'PRE_PILOT_MULTISTAGE_PREDICTIVE',
  calibrationStatus: 'FUTURE_PILOT_COMPARISON',
  qualificationDecision: 'THERMODYNAMIC_GATES_REQUIRED',
  qualificationGoverningStatus: 'PRE_PILOT_EXECUTION',
  releaseEligibility: 'PRE_PILOT_ONLY',
  limitations: {
    supportedOperationalScope: 'SAT_MONO_DI_POLY_PA_NMP_H2O_SIMULTANEOUS_COUNTER_CURRENT',
    branching: 'GOVERNED_REPRODUCIBLE_BRANCH_REQUIRED',
    cycloalkane: 'REPRESENTED_BY_GOVERNED_SAT_SURROGATE',
    diPoly: 'FIXED_GOVERNED_SURROGATES',
    polarAromatics: 'EXACT_PA_PROFILE_PRE_PILOT_PREDICTION',
    sulfur: 'NOT_CALCULABLE',
  },
} as const;

export const PRE_PILOT_MULTISTAGE_MODEL = {
  ...PRE_PILOT_MULTISTAGE_MODEL_1_4,
  packageVersion: '7C-1.5.0',
  // SHA-256 of the immutable 7C-1.5 identity tuple: the historical 7C-1.4
  // model hash, the 7C-1.5 contract version, and the supported H2O grid.
  modelHash: 'f165f0d23eeae810e40341f1cc86a2b97514bc21b74838d4a08eab1760e6e1af',
} as const;

export type PrePilotNtStartStatus =
  | 'READY_FOR_PREDICTIVE_NT'
  | 'MODEL_HASH_MISMATCH'
  | 'UNSUPPORTED_COMPONENT_SCOPE'
  | 'POLAR_AROMATICS_THERMODYNAMIC_CLOSURE_UNAVAILABLE'
  | 'SULFUR_MODEL_UNAVAILABLE'
  | 'GOVERNED_RELEASE_BLOCKED';

export interface PrePilotNtStartResult {
  status: PrePilotNtStartStatus;
  executionMode: 'ECR_PRE_PILOT_PREDICTIVE' | 'GOVERNED_RELEASE';
  model: typeof PRE_PILOT_MODEL | typeof PRE_PILOT_MULTISTAGE_MODEL
    | typeof PRE_PILOT_MULTISTAGE_MODEL_1_4;
  establishedTheoreticalStages: number | null;
  mayRunPredictiveNt: boolean;
  mayWriteEstablishedTheoreticalStages: false;
  calibrationRequired: true;
  diagnostics: readonly string[];
}

export function startPrePilotNt(input: {
  executionMode: 'ECR_PRE_PILOT_PREDICTIVE' | 'GOVERNED_RELEASE';
  requestedModelHash: string;
  feedCompositionMassFraction: {
    saturates: number;
    mono: number;
    di: number;
    poly: number;
    polar?: number;
  };
  sulfurObjectiveRequested: boolean;
}): PrePilotNtStartResult {
  const requestedMultistage = input.requestedModelHash === PRE_PILOT_MULTISTAGE_MODEL.modelHash;
  const requestedHistoricalMultistage =
    input.requestedModelHash === PRE_PILOT_MULTISTAGE_MODEL_1_4.modelHash;
  const common = {
    executionMode: input.executionMode,
    model: requestedMultistage
      ? PRE_PILOT_MULTISTAGE_MODEL
      : requestedHistoricalMultistage
        ? PRE_PILOT_MULTISTAGE_MODEL_1_4
        : PRE_PILOT_MODEL,
    establishedTheoreticalStages: null,
    mayWriteEstablishedTheoreticalStages: false as const,
    calibrationRequired: true as const,
  };
  if (
    input.requestedModelHash !== PRE_PILOT_MODEL.modelHash
    && !requestedMultistage
    && !requestedHistoricalMultistage
  ) {
    return {
      ...common,
      status: 'MODEL_HASH_MISMATCH',
      mayRunPredictiveNt: false,
      diagnostics: [
        'The requested model hash does not match the frozen PRE_PILOT_MODEL package.',
        'No N_T calculation may start against mutable or unidentified thermodynamic inputs.',
      ],
    };
  }
  if (input.executionMode !== 'ECR_PRE_PILOT_PREDICTIVE') {
    return {
      ...common,
      status: 'GOVERNED_RELEASE_BLOCKED',
      mayRunPredictiveNt: false,
      diagnostics: [
        'PRE_PILOT_MODEL is not qualified for governed-release N_T.',
        'The unchanged topology, tie-line RMSD and row-level thermodynamic qualification gates remain failed.',
      ],
    };
  }
  if (input.sulfurObjectiveRequested) {
    return {
      ...common,
      status: 'SULFUR_MODEL_UNAVAILABLE',
      mayRunPredictiveNt: false,
      diagnostics: [
        'The frozen PRE_PILOT_MODEL has no admitted sulfur partition model.',
        'A sulfur objective cannot be inferred from SAT/MONO aromatic transfer.',
      ],
    };
  }
  const composition = input.feedCompositionMassFraction;
  const finiteComposition = Object.values(composition)
    .every((value) => Number.isFinite(value) && value >= 0);
  if (!finiteComposition) {
    return {
      ...common,
      status: 'UNSUPPORTED_COMPONENT_SCOPE',
      mayRunPredictiveNt: false,
      diagnostics: [
        'PRE_PILOT_MODEL requires finite nonnegative SAT/MONO/DI/POLY/PA feed fractions.',
      ],
    };
  }
  return {
    ...common,
    status: 'READY_FOR_PREDICTIVE_NT',
    mayRunPredictiveNt: true,
    diagnostics: [
      requestedMultistage || requestedHistoricalMultistage
        ? `N_T lineage is bound to the immutable ${requestedMultistage ? '7C-1.5' : '7C-1.4'} native-plus-RK simultaneous counter-current model and Stage 1 evidence.`
        : 'N_T lineage is bound to the frozen exact-profile six-family COSMO-SAC research engine and Stage 1 evidence.',
      requestedMultistage || requestedHistoricalMultistage
        ? 'A Predictive N_T requires full simultaneous closure, stable physical LLE, explicit MONO-rich audit acceptance, and Stage-1 target acceptance.'
        : 'Any result is a research diagnostic, calibration-required, not pilot validated, and never release eligible.',
      'Sulfur remains NOT_CALCULABLE; governed-release use and write-through to established theoretical stages remain fail-closed.',
    ],
  };
}