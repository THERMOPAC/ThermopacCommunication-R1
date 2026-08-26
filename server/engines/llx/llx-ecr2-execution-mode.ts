import {
  KH1995_HOLDUP_MODEL_ID,
  KH1995_HOLDUP_MODEL_VERSION,
} from './llx-ecr2-holdup';
import {
  validatePrePilotHindranceModel,
} from './llx-ecr2-prepilot-hydrodynamics';

export const ECR2_EXECUTION_MODES = [
  'PRE_PILOT_PREDICTIVE',
  'GOVERNED_RELEASE',
] as const;

export type ECR2ExecutionMode = (typeof ECR2_EXECUTION_MODES)[number];

export interface ECR2ModelResolution {
  executionMode: ECR2ExecutionMode;
  thermodynamicModel: {
    packageId: string;
    packageVersion: string;
    modelName: string;
    citation: string;
    use: 'shared_ecr2_core';
    pilotValidated: boolean;
  };
  hydrodynamicModel: {
    packageId: string | null;
    packageVersion: string | null;
    use: 'shared_ecr2_core';
    pilotValidated: false;
    selectionStatus: 'SELECTED' | 'INPUT_INCOMPLETE';
    prePilotInputUsed: boolean;
    unusedPrePilotInputPresent: boolean;
  };
  evidenceStatus:
    | 'PRE_PILOT_PREDICTIVE_NOT_PILOT_VALIDATED'
    | 'GOVERNED_EVIDENCE_INCOMPLETE'
    | 'GOVERNED_EVIDENCE_APPROVED';
  releaseStatus: 'BLOCKED';
  displayLabel:
    | 'PRE_PILOT_PREDICTIVE — NOT PILOT VALIDATED'
    | 'GOVERNED_RELEASE';
  releaseLabel: 'RELEASE ELIGIBILITY: BLOCKED';
  uncertaintyRequired: boolean;
  notes: string[];
}

export function isECR2ExecutionMode(value: unknown): value is ECR2ExecutionMode {
  return ECR2_EXECUTION_MODES.includes(value as ECR2ExecutionMode);
}

function hasGovernedEvidence(inputs: Record<string, unknown>): boolean {
  const bvp = inputs.bvp as Record<string, unknown> | undefined;
  const partition = bvp?.partitionBasis as Record<string, unknown> | undefined;
  const evidence = bvp?.stage8Evidence as Record<string, Record<string, unknown>> | undefined;
  if (partition?.approvalStatus !== 'engineer_approved_governed') return false;
  if (!evidence) return false;
  return Object.values(evidence).every((record) =>
    record?.status === 'ACCEPTED_AUTO_BASIS' || record?.status === 'ENGINEER_OVERRIDE',
  );
}

/**
 * Selects evidence maturity and model-package identity only. Numerical
 * thermodynamics, hydrodynamics, transfer and sizing continue through the
 * existing ECR-2 engine and BVP; this resolver never changes an equation or
 * parameter value.
 */
export function resolveECR2Models(
  inputs: Record<string, unknown>,
  executionMode: ECR2ExecutionMode,
  thermodynamicModel: {
    modelId: string;
    modelVersion: string;
    modelName: string;
    citation: string;
  } = {
    modelId: 'UNSPECIFIED_SHARED_ECR2_THERMODYNAMIC_MODEL',
    modelVersion: 'unknown',
    modelName: 'Shared ECR-2 thermodynamic model',
    citation: 'Runtime model identity not supplied',
  },
): ECR2ModelResolution {
  const governedEvidence = hasGovernedEvidence(inputs);
  const prePilotValidation = validatePrePilotHindranceModel(inputs.prePilotHydrodynamics);
  const hasPrePilotInput = inputs.prePilotHydrodynamics != null;
  const resolvedThermodynamicModel = {
    packageId: thermodynamicModel.modelId,
    packageVersion: thermodynamicModel.modelVersion,
    modelName: thermodynamicModel.modelName,
    citation: thermodynamicModel.citation,
    use: 'shared_ecr2_core' as const,
    pilotValidated: false,
  };
  const predictiveHydrodynamicModel = {
    packageId: prePilotValidation.model?.modelId ?? null,
    packageVersion: prePilotValidation.model?.modelVersion ?? null,
    use: 'shared_ecr2_core' as const,
    pilotValidated: false as const,
    selectionStatus: prePilotValidation.valid ? 'SELECTED' as const : 'INPUT_INCOMPLETE' as const,
    prePilotInputUsed: prePilotValidation.valid,
    unusedPrePilotInputPresent: false,
  };
  const governedHydrodynamicModel = {
    packageId: KH1995_HOLDUP_MODEL_ID,
    packageVersion: KH1995_HOLDUP_MODEL_VERSION,
    use: 'shared_ecr2_core' as const,
    pilotValidated: false as const,
    selectionStatus: 'SELECTED' as const,
    prePilotInputUsed: false,
    unusedPrePilotInputPresent: hasPrePilotInput,
  };
  if (executionMode === 'PRE_PILOT_PREDICTIVE') {
    return {
      executionMode,
      thermodynamicModel: resolvedThermodynamicModel,
      hydrodynamicModel: predictiveHydrodynamicModel,
      evidenceStatus: 'PRE_PILOT_PREDICTIVE_NOT_PILOT_VALIDATED',
      releaseStatus: 'BLOCKED',
      displayLabel: 'PRE_PILOT_PREDICTIVE — NOT PILOT VALIDATED',
      releaseLabel: 'RELEASE ELIGIBILITY: BLOCKED',
      uncertaintyRequired: true,
      notes: [
        'Pilot validation is absent and is represented as evidence maturity, not as an automatic numerical failure.',
        'Indispensable missing inputs, invalid model states, physical-closure failures and numerical failures remain fail-closed.',
        'This run cannot satisfy Stage 8 acceptance, DS-SEL, released reports or any governed downstream consumer.',
      ],
    };
  }
  return {
    executionMode,
    thermodynamicModel: resolvedThermodynamicModel,
    hydrodynamicModel: governedHydrodynamicModel,
    evidenceStatus: governedEvidence
      ? 'GOVERNED_EVIDENCE_APPROVED'
      : 'GOVERNED_EVIDENCE_INCOMPLETE',
    releaseStatus: 'BLOCKED',
    displayLabel: 'GOVERNED_RELEASE',
    releaseLabel: 'RELEASE ELIGIBILITY: BLOCKED',
    uncertaintyRequired: false,
    notes: [
      'Governed execution remains fail-closed until all required evidence, calibration and engineering approvals are current.',
      hasPrePilotInput
        ? 'Saved pre-pilot hydrodynamic inputs are retained but explicitly unused; governed execution selects the K&H 1995 primary route.'
        : 'Governed execution selects the K&H 1995 primary hydrodynamic route.',
      'A numerically accepted preliminary transfer result is not by itself release eligibility.',
    ],
  };
}