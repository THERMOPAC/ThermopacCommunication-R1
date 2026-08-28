export const PRE_PILOT_MODEL = {
  packageId: 'PRE_PILOT_MODEL',
  packageVersion: '1.0.0',
  modelHash: 'cb8b2945499ea65cd071f99695ea14c5a3396fba475aa6bb8ed8bdfe6f3198c7',
  operationalDecision: 'ACCEPT_WITH_LIMITATIONS',
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
    supportedOperationalScope: 'SAT_MONO_NMP_PRE_PILOT_SCREENING',
    branching: 'SCREEN_ONLY',
    cycloalkane: 'FAIL_CLOSED',
    diPoly: 'FAIL_CLOSED',
    sulfur: 'FAIL_CLOSED',
  },
} as const;

export type PrePilotNtStartStatus =
  | 'READY_FOR_PREDICTIVE_NT'
  | 'MODEL_HASH_MISMATCH'
  | 'UNSUPPORTED_COMPONENT_SCOPE'
  | 'SULFUR_MODEL_UNAVAILABLE'
  | 'GOVERNED_RELEASE_BLOCKED';

export interface PrePilotNtStartResult {
  status: PrePilotNtStartStatus;
  executionMode: 'PRE_PILOT_PREDICTIVE' | 'GOVERNED_RELEASE';
  model: typeof PRE_PILOT_MODEL;
  establishedTheoreticalStages: null;
  mayRunPredictiveNt: boolean;
  mayWriteEstablishedTheoreticalStages: false;
  calibrationRequired: true;
  diagnostics: readonly string[];
}

/**
 * Starts an N_T calculation lineage by binding it to the immutable pre-pilot
 * package. Numerical stage solving is deliberately downstream of this check.
 * This contract never turns a predictive N_T into an established design value.
 */
export function startPrePilotNt(input: {
  executionMode: 'PRE_PILOT_PREDICTIVE' | 'GOVERNED_RELEASE';
  requestedModelHash: string;
  feedCompositionMassFraction: {
    saturates: number;
    mono: number;
    di: number;
    poly: number;
  };
  sulfurObjectiveRequested: boolean;
}): PrePilotNtStartResult {
  const common = {
    executionMode: input.executionMode,
    model: PRE_PILOT_MODEL,
    establishedTheoreticalStages: null,
    mayWriteEstablishedTheoreticalStages: false as const,
    calibrationRequired: true as const,
  };
  if (input.requestedModelHash !== PRE_PILOT_MODEL.modelHash) {
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
  if (input.executionMode !== 'PRE_PILOT_PREDICTIVE') {
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
  if (!finiteComposition || composition.di > 1e-12 || composition.poly > 1e-12) {
    return {
      ...common,
      status: 'UNSUPPORTED_COMPONENT_SCOPE',
      mayRunPredictiveNt: false,
      diagnostics: [
        'PRE_PILOT_MODEL operational use is limited to SAT/MONO/NMP screening.',
        'DI and POLY remain fail-closed and cannot be folded into SAT or MONO for N_T.',
      ],
    };
  }
  return {
    ...common,
    status: 'READY_FOR_PREDICTIVE_NT',
    mayRunPredictiveNt: true,
    diagnostics: [
      'N_T lineage is bound to the frozen PRE_PILOT_MODEL equations, parameters, dataset and solver settings.',
      'Any result is predictive pre-pilot screening, calibration-required and not pilot validated.',
      'DI/POLY, sulfur prediction, governed-release use and write-through to established theoretical stages remain fail-closed.',
    ],
  };
}