// Packaging entry only. All scientific functions are unchanged source exports.
export { evaluateRrboHydraulicTrial, dragCoefficient, swarmSpeeds } from './source/server/ecr-pre-pilot/rrbo-wetnmp-hydraulic-p1';
export { resolveAutomaticHydraulicSelection, AUTOMATIC_SELECTION_HASH } from './source/server/ecr-pre-pilot/automatic-hydraulic-selection';
export { kuhniRunHash } from './source/server/ecr-pre-pilot/kuhni-hydrodynamics';
export { makeStage1HydrodynamicProcessBasis } from './source/server/ecr-pre-pilot/stage1';
export { evaluateP1ReviewTrial, ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_HASH, ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_VERSION } from './source/server/ecr-pre-pilot/stage3-stage4-optimizer';