import { createHash } from 'node:crypto';
import type { HydrodynamicProcessBasis } from './kuhni-hydrodynamics';
import {
  KUHNI_GEOMETRY_RESOLVER_V120_HASH,
  KUHNI_GEOMETRY_RESOLVER_V120_VERSION,
  resolveKuhniGeometryV120,
} from './kuhni-geometry-resolver-v120';
import {
  STAGE2_ACCEPTED_PREDICTIVE_NT,
  STAGE3_GEOMETRY_DESIGN_NT,
  type Stage3GeometryStageAuthority,
} from './kuhni-geometry-resolver';
import { kuhniRunHash } from './kuhni-hydrodynamics';

/**
 * V1.3.0 changes only the Stage-3 authority contract: hydraulic geometry
 * always uses the fixed pre-pilot design basis N_T=7.  The accepted Stage-2
 * Predictive N_T remains embedded as separate lineage/reporting data.  V1.2.0
 * and earlier artifacts remain immutable numerical replay artifacts.
 */
export const KUHNI_GEOMETRY_RESOLVER_V130_VERSION = 'KUHNI_GEOMETRY_RESOLVER_V1.3.0';

const implementationDescriptors = [
  KUHNI_GEOMETRY_RESOLVER_V130_VERSION,
  KUHNI_GEOMETRY_RESOLVER_V120_VERSION,
  KUHNI_GEOMETRY_RESOLVER_V120_HASH,
  `fixed-stage3-geometry-design-nt:${STAGE3_GEOMETRY_DESIGN_NT}`,
  'stage2-accepted-predictive-nt-retained-separately',
  'stage2-stage4-scientific-authority-not-relabelled',
];

export const KUHNI_GEOMETRY_RESOLVER_V130_HASH = createHash('sha256')
  .update(implementationDescriptors.join('|'))
  .digest('hex');

const GEOMETRY_DESIGN_BASIS_LABEL =
  'FIXED PRE-PILOT KUHNI GEOMETRY DESIGN BASIS (STAGE3_GEOMETRY_DESIGN_NT=7)';

function stage2Reporting(authority: Stage3GeometryStageAuthority) {
  return {
    name: STAGE2_ACCEPTED_PREDICTIVE_NT,
    value: authority.stage2AcceptedPredictiveNt,
    provenance: authority.stage2AcceptedPredictiveNtProvenance,
    label: authority.stage2AcceptedPredictiveNtLabel,
    jobId: authority.stage2JobId,
    resultHash: authority.stage2ResultHash,
    stage2JobId: authority.stage2JobId,
    stage2ResultHash: authority.stage2ResultHash,
    reason: authority.reason,
  };
}

export function resolveKuhniGeometryV130(
  basis: HydrodynamicProcessBasis,
  theoreticalStages: Stage3GeometryStageAuthority,
) {
  if (
    theoreticalStages.value !== STAGE3_GEOMETRY_DESIGN_NT
    || theoreticalStages.provenance !== 'STAGE3_GEOMETRY_DESIGN_NT'
    || theoreticalStages.stage3GeometryDesignNt !== STAGE3_GEOMETRY_DESIGN_NT
  ) {
    throw new Error('INVALID_STAGE3_GEOMETRY_DESIGN_NT_AUTHORITY');
  }

  // V1.2.0 contains the frozen equations and phase-applicability boundary.
  // Passing the fixed authority through preserves all numerical behavior while
  // this version owns the new persisted/reporting contract.
  const historical = resolveKuhniGeometryV120(basis, theoreticalStages);
  const { calculationHash: _historicalCalculationHash, ...historicalPayload } = historical;
  const stage2 = stage2Reporting(theoreticalStages);
  const result = {
    ...historicalPayload,
    engine: {
      ...historical.engine,
      version: KUHNI_GEOMETRY_RESOLVER_V130_VERSION,
      implementationHash: KUHNI_GEOMETRY_RESOLVER_V130_HASH,
      extendsImplementationHash: KUHNI_GEOMETRY_RESOLVER_V120_HASH,
    },
    theoreticalStagesUsed: theoreticalStages,
    stage3GeometryDesignBasis: {
      name: 'STAGE3_GEOMETRY_DESIGN_NT' as const,
      value: STAGE3_GEOMETRY_DESIGN_NT,
      label: GEOMETRY_DESIGN_BASIS_LABEL,
      scientificMeaning: 'FIXED PRE-PILOT KUHNI GEOMETRY DESIGN BASIS; NOT A STAGE-2 PREDICTIVE N_T',
    },
    stage2AcceptedPredictiveNt: stage2,
    calculationReport: {
      ...historical.calculationReport,
      title: `${KUHNI_GEOMETRY_RESOLVER_V130_VERSION} calculation report`,
      theoreticalStagesUsed: theoreticalStages,
      stage3GeometryDesignBasis: {
        name: 'STAGE3_GEOMETRY_DESIGN_NT' as const,
        value: STAGE3_GEOMETRY_DESIGN_NT,
        label: GEOMETRY_DESIGN_BASIS_LABEL,
      },
      stage2AcceptedPredictiveNt: stage2,
      disposition: `${GEOMETRY_DESIGN_BASIS_LABEL}; Stage-2 accepted Predictive N_T is retained separately for scientific reporting and downstream Stage-4 authority.`,
    },
  };
  return { ...result, calculationHash: kuhniRunHash(result) };
}

export type KuhniGeometryV130Result = ReturnType<typeof resolveKuhniGeometryV130>;