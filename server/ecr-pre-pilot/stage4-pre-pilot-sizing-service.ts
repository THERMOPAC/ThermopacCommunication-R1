import { createHash, randomUUID } from 'node:crypto';
import { pool } from '../db';
import { kuhniRunHash } from './kuhni-hydrodynamics';
import {
  stage1EquilibriumScientificContentHash,
  validateStage1Snapshot,
  type EcrPrePilotStage1Snapshot,
} from './stage1';
import { validatePersistedAcceptedSevenComponentNtForStage4 } from './predictive-nt-job-service';
import {
  qualifyKuhniStage3Presentation,
  type KuhniStage3PresentationQualification,
} from './kuhni-stage3-presentation';
import {
  ECR_STAGE3_STAGE4_OPTIMIZER_HASH,
  ECR_STAGE3_STAGE4_OPTIMIZER_VERSION,
} from './stage3-stage4-optimizer';

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const acceptedStage2Statuses = new Set([
  'COMPLETED_GOVERNED_SEQUENCE',
  'COMPLETED_DIAGNOSTIC_SEQUENCE',
  'COMPLETED_PRE_PILOT_MULTISTAGE_MATRIX',
]);

export const STAGE4_HETS_DESIGN_NT = 7;
export const STAGE4_DESIGN_COMPARTMENT_EFFICIENCY = 0.35;
export const STAGE4_HETS_IMPLEMENTATION_VERSION =
  'ECR_STAGE4_ADOPTED_COMPARTMENT_EFFICIENCY_V2_FIXED_DESIGN_NT7_ETA0.35';
export const STAGE4_HETS_IMPLEMENTATION_HASH = createHash('sha256').update(JSON.stringify({
  version: STAGE4_HETS_IMPLEMENTATION_VERSION,
  fixedPhysicalSizingDesignNt: STAGE4_HETS_DESIGN_NT,
  actualStage2Nt: 'OPTIONAL_SEPARATELY_LABELLED_REFERENCE_ONLY',
  sizingMethod: 'ADOPTED_COMPARTMENT_EFFICIENCY',
  designCompartmentEfficiency: STAGE4_DESIGN_COMPARTMENT_EFFICIENCY,
  selectedCompartmentHeight: 'PERSISTED_STAGE3_SELECTED_hc_REQUIRED',
  physicalCount: 'ceil(Ndesign / designCompartmentEfficiency)',
  requiredAndInstalledActiveHeight: 'Nphysical * persisted_stage3_hc',
  impliedInstalledHets: 'installedActiveHeight / Ndesign (DERIVED_DIAGNOSTIC_ONLY)',
  scope: 'PRE_PILOT_SCREENING_NO_OUTLET_OR_TARGET_CLAIM',
  stage3Admission: 'CURRENT_PERSISTED_INTEGRITY_VERIFIED_OPTIMIZER_GEOMETRY_ONLY',
  orientations: 'NMP_CONTINUOUS_RRBO_DISPERSED_OR_RRBO_CONTINUOUS_NMP_DISPERSED',
})).digest('hex');
export const STAGE4_OPTIMIZED_HETS_IMPLEMENTATION_VERSION =
  STAGE4_HETS_IMPLEMENTATION_VERSION;
export const STAGE4_OPTIMIZED_HETS_IMPLEMENTATION_HASH = createHash('sha256').update(JSON.stringify({
  version: STAGE4_OPTIMIZED_HETS_IMPLEMENTATION_VERSION,
  optimizerVersion: ECR_STAGE3_STAGE4_OPTIMIZER_VERSION,
  optimizerHash: ECR_STAGE3_STAGE4_OPTIMIZER_HASH,
  fixedDesignPhysicalStages: STAGE4_HETS_DESIGN_NT,
  actualStage2Nt: 'REFERENCE_ONLY',
  selectedCompartmentHeight: 'PERSISTED_STAGE3_OPTIMIZER_GEOMETRY',
  sizingMethod: 'ADOPTED_COMPARTMENT_EFFICIENCY',
  designCompartmentEfficiency: STAGE4_DESIGN_COMPARTMENT_EFFICIENCY,
  physicalCount: 'ceil(Ndesign / designCompartmentEfficiency)',
  requiredAndInstalledHeight: 'Nphysical * selected_hc',
  impliedInstalledHets: 'installedHeight / Ndesign',
  noLegacyHalfDGeneration: true,
})).digest('hex');

function fail(code: string): never {
  throw new Error(code);
}

type Stage3Projection = {
  id: number | string;
  immutableHash: string;
  stage1SnapshotHash?: string;
  result: Record<string, any>;
};

type PersistedStage2 = {
  id: string; design_id: number; created_by: number; input_snapshot: unknown; model_hash: string; status: string;
  engine_hash: string;
  result_snapshot: Record<string, any>;
};

export type Stage2HetsStage1Compatibility = {
  status:
    | 'EXACT_STAGE1_SNAPSHOT_MATCH'
    | 'EXACT_EQUILIBRIUM_INPUT_MATCH_EXCLUDING_HYDRAULIC_PHASE_ORIENTATION';
  currentStage1SnapshotHash: string;
  persistedStage2Stage1SnapshotHash: string;
  currentEquilibriumScientificInputHash: string;
  persistedEquilibriumScientificInputHash: string;
  excludedScientificInputField: 'stage1.phaseConfiguration' | null;
  currentPhaseConfiguration: string;
  persistedStage2PhaseConfiguration: string;
};

function validatePersistedStage2Stage1Authority(
  row: PersistedStage2,
  persistedStage1SnapshotHash: string,
): EcrPrePilotStage1Snapshot {
  const stage1Authority = (row.input_snapshot as any)?.stage1Authority;
  if (
    !stage1Authority
    || typeof stage1Authority !== 'object'
    || typeof stage1Authority.snapshotHash !== 'string'
  ) {
    fail('STAGE4_PERSISTED_ACCEPTED_STAGE2_INTEGRITY_INVALID');
  }
  let persistedStage1: EcrPrePilotStage1Snapshot;
  try {
    persistedStage1 = validateStage1Snapshot(stage1Authority.source);
  } catch {
    fail('STAGE4_PERSISTED_ACCEPTED_STAGE2_INTEGRITY_INVALID');
  }
  if (
    stage1Authority.snapshotHash !== persistedStage1.immutableHash
    || persistedStage1.immutableHash !== persistedStage1SnapshotHash
  ) {
    fail('STAGE4_PERSISTED_ACCEPTED_STAGE2_INTEGRITY_INVALID');
  }
  return persistedStage1;
}

/**
 * Verifies Stage-2 evidence already persisted by the accepted Stage-2 worker.
 * It intentionally does not preflight or execute that worker/runtime: HETS
 * sizing uses the immutable accepted record and must stay a synchronous read.
 */
export function validatePersistedStage2HetsAuthority(
  row: PersistedStage2,
  currentStage1: EcrPrePilotStage1Snapshot,
) {
  const result = row?.result_snapshot;
  const persistedStage1SnapshotHash = result?.stage1TargetGovernance?.stage1SnapshotHash;
  if (
    !result || !acceptedStage2Statuses.has(String(result.executionStatus ?? ''))
    || typeof persistedStage1SnapshotHash !== 'string'
  ) {
    fail('STAGE4_PERSISTED_ACCEPTED_STAGE2_INTEGRITY_INVALID');
  }
  const persistedStage1 = validatePersistedStage2Stage1Authority(
    row,
    persistedStage1SnapshotHash,
  );
  let stage1Compatibility: Stage2HetsStage1Compatibility;
  if (persistedStage1SnapshotHash === currentStage1.immutableHash) {
    // Direct immutable-hash matching is already stricter than the
    // orientation-only compatibility path. The stored Stage-1 source and
    // its wrapper hash have also been revalidated above, so the result hash
    // cannot be self-attested independently of the persisted input.
    const equilibriumHash = stage1EquilibriumScientificContentHash(currentStage1);
    stage1Compatibility = {
      status: 'EXACT_STAGE1_SNAPSHOT_MATCH',
      currentStage1SnapshotHash: currentStage1.immutableHash,
      persistedStage2Stage1SnapshotHash: persistedStage1SnapshotHash,
      currentEquilibriumScientificInputHash: equilibriumHash,
      persistedEquilibriumScientificInputHash:
        stage1EquilibriumScientificContentHash(persistedStage1),
      excludedScientificInputField: null,
      currentPhaseConfiguration: currentStage1.stage1.phaseConfiguration,
      persistedStage2PhaseConfiguration: persistedStage1.stage1.phaseConfiguration,
    };
  } else {
    const currentEquilibriumScientificInputHash =
      stage1EquilibriumScientificContentHash(currentStage1);
    const persistedEquilibriumScientificInputHash =
      stage1EquilibriumScientificContentHash(persistedStage1);
    if (currentEquilibriumScientificInputHash !== persistedEquilibriumScientificInputHash) {
      fail('STAGE4_STAGE2_EQUILIBRIUM_INPUT_MISMATCH_EXCEPT_PHASE_ORIENTATION');
    }
    stage1Compatibility = {
      status: 'EXACT_EQUILIBRIUM_INPUT_MATCH_EXCLUDING_HYDRAULIC_PHASE_ORIENTATION',
      currentStage1SnapshotHash: currentStage1.immutableHash,
      persistedStage2Stage1SnapshotHash: persistedStage1SnapshotHash,
      currentEquilibriumScientificInputHash,
      persistedEquilibriumScientificInputHash,
      excludedScientificInputField: 'stage1.phaseConfiguration',
      currentPhaseConfiguration: currentStage1.stage1.phaseConfiguration,
      persistedStage2PhaseConfiguration: persistedStage1.stage1.phaseConfiguration,
    };
  }
  try {
    const trusted = validatePersistedAcceptedSevenComponentNtForStage4(row);
    return {
      theoreticalStages: trusted.theoreticalStages,
      resultHash: kuhniRunHash(result),
      stage1Compatibility,
    };
  } catch (error) {
    fail((error as Error).message || 'STAGE4_PERSISTED_ACCEPTED_STAGE2_INTEGRITY_INVALID');
  }
}

export type Stage3PrePilotHetsAdmission = {
  status: 'INDEPENDENTLY_CHECKED_PREPILOT_HETS_CANDIDATE';
  source: 'CALCULATED_IN_RANGE_TRIAL' | 'V150_EXTRAPOLATED_MODEL_ROOT';
  columnDiameterM: number;
  stage3PresentationQualificationHash: string;
  limitations: KuhniStage3PresentationQualification['limitations'];
};

/**
 * This turns the additive Stage-3 qualification into a deliberately narrow
 * admission record.  The qualifier has already re-evaluated the V1.5 reverse
 * root from its frozen primitive basis; this function only accepts its exact
 * HETS-only contract and never treats it as governed hydraulics.
 */
export function admitIndependentlyCheckedStage3PrePilotHetsCandidate(
  qualification: KuhniStage3PresentationQualification,
): Stage3PrePilotHetsAdmission | null {
  const candidate = qualification?.candidate;
  const governed = qualification?.governedOutput;
  if (
    qualification?.status !== 'CALCULATED_PRE_PILOT_WITH_MAJOR_SCALE_UP_EXTRAPOLATION'
    || qualification.lineage?.status !== 'CURRENT'
    || !candidate
    || candidate.available !== true
    || candidate.governed !== false
    || candidate.stage4Input !== false
    || candidate.stage4HetsScreeningInput !== true
    || candidate.independentCheck !== 'PASSED'
    || !['CALCULATED_IN_RANGE_TRIAL', 'V150_EXTRAPOLATED_MODEL_ROOT'].includes(candidate.source)
    || !positiveFinite(candidate.columnDiameterM)
    || governed?.candidateIsNotGoverned !== true
    || governed?.stage4Input !== false
    || governed?.stage4HetsScreeningInput !== true
  ) return null;
  return {
    status: 'INDEPENDENTLY_CHECKED_PREPILOT_HETS_CANDIDATE',
    source: candidate.source,
    columnDiameterM: candidate.columnDiameterM,
    stage3PresentationQualificationHash: kuhniRunHash(qualification),
    limitations: qualification.limitations,
  };
}

function positiveFinite(value: unknown): value is number {
  return finite(value) && value > 0;
}

export function deriveStage4PrePilotSizing(input: {
  /** Actual accepted Stage-2 value, retained as reference only when available. */
  calculatedNt?: number | null;
  stage2JobId?: string | null;
  stage2ResultHash?: string | null;
  stage3: Stage3Projection;
  stage2Stage1Compatibility?: Stage2HetsStage1Compatibility;
  stage3PrePilotHetsAdmission?: Stage3PrePilotHetsAdmission | null;
}) {
  const actualStage2Available = input.calculatedNt !== undefined && input.calculatedNt !== null;
  if (actualStage2Available && (
    !Number.isInteger(input.calculatedNt) || input.calculatedNt <= 0
    || typeof input.stage2JobId !== 'string' || !input.stage2JobId
    || typeof input.stage2ResultHash !== 'string' || !input.stage2ResultHash
  )) fail('STAGE4_ACTUAL_STAGE2_NT_REFERENCE_INVALID');
  if (!actualStage2Available && (
    input.stage2JobId != null || input.stage2ResultHash != null
  )) fail('STAGE4_ACTUAL_STAGE2_NT_REFERENCE_INVALID');
  if (input.stage3.result.engine?.version === ECR_STAGE3_STAGE4_OPTIMIZER_VERSION) {
    const resultStage1Hash = input.stage3.result.stage1Authority?.snapshotHash;
    const basisStage1Hash = input.stage3.result.processBasis?.stage1SnapshotHash;
    if (
      resultStage1Hash !== input.stage3.stage1SnapshotHash
      || basisStage1Hash !== input.stage3.stage1SnapshotHash
    ) {
      fail('STAGE4_OPTIMIZER_STAGE1_LINEAGE_STALE');
    }
  }
  const optimizerGeometry = input.stage3.result.engine?.version === ECR_STAGE3_STAGE4_OPTIMIZER_VERSION
    && input.stage3.result.engine?.implementationHash === ECR_STAGE3_STAGE4_OPTIMIZER_HASH
    ? input.stage3.result.stage4GeometryInput
    : null;
  const optimizedHydraulics = optimizerGeometry?.status === 'SELECTED_IMMUTABLE_OPTIMIZER_GEOMETRY'
    && positiveFinite(optimizerGeometry.columnDiameterM)
    && positiveFinite(optimizerGeometry.compartmentHeightM)
    && positiveFinite(optimizerGeometry.hcToColumn)
    && optimizerGeometry.hcToColumn >= 0.2
    && optimizerGeometry.hcToColumn <= 0.3
    && positiveFinite(optimizerGeometry.rotorDiameterM)
    && positiveFinite(optimizerGeometry.rotorToColumn)
    && optimizerGeometry.rotorToColumn >= 0.33
    && optimizerGeometry.rotorToColumn <= 0.5
    && positiveFinite(optimizerGeometry.freeArea)
    && optimizerGeometry.freeArea >= 0.2
    && optimizerGeometry.freeArea <= 0.4
    && positiveFinite(optimizerGeometry.rpm)
    && optimizerGeometry.rpm >= 30
    && optimizerGeometry.rpm <= 70
    && Math.abs(
      optimizerGeometry.compartmentHeightM - optimizerGeometry.columnDiameterM * optimizerGeometry.hcToColumn,
    ) <= 1e-9
    && Math.abs(
      optimizerGeometry.rotorDiameterM - optimizerGeometry.columnDiameterM * optimizerGeometry.rotorToColumn,
    ) <= 1e-9;
  if (!optimizedHydraulics) {
    fail('STAGE4_VALID_CURRENT_STAGE3_SELECTED_HYDRAULICS_REQUIRED');
  }

  const diameterM = optimizerGeometry!.columnDiameterM;
  const compartmentHeightM = optimizerGeometry!.compartmentHeightM;
  const requiredPhysicalCompartments = Math.ceil(
    STAGE4_HETS_DESIGN_NT / STAGE4_DESIGN_COMPARTMENT_EFFICIENCY,
  );
  const installedActiveHeightM = Math.round(
    requiredPhysicalCompartments * compartmentHeightM * 1e12,
  ) / 1e12;
  const requiredActiveHeightM = installedActiveHeightM;
  const impliedInstalledHetsMPerTheoreticalStage =
    installedActiveHeightM / STAGE4_HETS_DESIGN_NT;
  if (!finite(compartmentHeightM) || !finite(impliedInstalledHetsMPerTheoreticalStage)
    || !Number.isInteger(requiredPhysicalCompartments) || requiredPhysicalCompartments < 1
    || !finite(installedActiveHeightM)) fail('STAGE4_COMPARTMENT_EFFICIENCY_CALCULATION_INVALID');

  return {
    status: 'CALCULATED_COMPARTMENT_EFFICIENCY_PRE_PILOT_SIZING',
    classification: 'PRE-PILOT PREDICTIVE / SCREENING DESIGN',
    screeningNotice: 'PRE-PILOT SCREENING',
     implementation: {
        version: STAGE4_OPTIMIZED_HETS_IMPLEMENTATION_VERSION,
        implementationHash: STAGE4_OPTIMIZED_HETS_IMPLEMENTATION_HASH,
    },
     currentOptimizer: optimizedHydraulics ? {
       version: ECR_STAGE3_STAGE4_OPTIMIZER_VERSION,
       implementationHash: ECR_STAGE3_STAGE4_OPTIMIZER_HASH,
       resultHash: optimizerGeometry!.optimizerResultHash ?? input.stage3.immutableHash,
     } : null,
    mainOutputs: {
      diameterM,
      overallEfficiency: STAGE4_DESIGN_COMPARTMENT_EFFICIENCY,
      physicalCompartments: requiredPhysicalCompartments,
      activeHeightM: requiredActiveHeightM,
      requiredActiveHeightM,
      installedActiveHeightM,
    },
    designNt: {
      value: STAGE4_HETS_DESIGN_NT,
      provenance: 'STAGE4_FIXED_PRE_PILOT_DESIGN_NT',
      label: 'FIXED STAGE-4 PRE-PILOT PHYSICAL SIZING DESIGN BASIS (N_T=7)',
    },
    actualStage2NtReference: {
      value: actualStage2Available ? input.calculatedNt : null,
      status: actualStage2Available ? 'AVAILABLE_REFERENCE_ONLY' : 'NOT_AVAILABLE_REFERENCE_ONLY',
       label: 'ACTUAL ACCEPTED STAGE-2 PREDICTIVE N_T — REFERENCE ONLY; NOT THE STAGE-4 SIZING BASIS',
      stage2JobId: actualStage2Available ? input.stage2JobId : null,
      stage2ResultHash: actualStage2Available ? input.stage2ResultHash : null,
    },
    selectedStage3Hydraulics: {
      diameterM,
       compartmentHeightM,
       hcToColumn: optimizedHydraulics
         ? optimizerGeometry!.hcToColumn
         : .5,
       rotorDiameterM: optimizedHydraulics ? optimizerGeometry!.rotorDiameterM : null,
       rotorToColumn: optimizedHydraulics ? optimizerGeometry!.rotorToColumn : null,
       freeArea: optimizedHydraulics ? optimizerGeometry!.freeArea : null,
       selectedRpm: optimizedHydraulics ? optimizerGeometry!.rpm : null,
        orientation: optimizedHydraulics
          ? input.stage3.result.selectedOrientation
            ?? input.stage3.result.stage1Authority?.phaseConfiguration
            ?? null
          : null,
       source: 'PERSISTED_STAGE3_OPTIMIZER_GEOMETRY_NO_STAGE4_RESELECTION',
      stage3RunId: input.stage3.id,
      stage3ImmutableHash: input.stage3.immutableHash,
       optimizerVersion: optimizedHydraulics ? ECR_STAGE3_STAGE4_OPTIMIZER_VERSION : null,
        optimizerImplementationHash: optimizedHydraulics
          ? input.stage3.result.engine?.implementationHash ?? null
          : null,
       optimizerResultHash: optimizedHydraulics
          ? optimizerGeometry!.optimizerResultHash ?? input.stage3.immutableHash
         : null,
        ...(optimizedHydraulics ? {
          ranking: {
            objective: input.stage3.result.selectionRationale?.objective ?? null,
            diameterSelection: input.stage3.result.selectionRationale?.diameterSelection ?? null,
            selectedWindow: input.stage3.result.selectedOperatingWindow ?? null,
            usefulWindowPreference:
              input.stage3.result.selectionRationale?.usefulWindowPreference ?? null,
            // Keep the compact occupied-grid comparison and the non-dominated
            // frontier together. Stage 4 only presents this persisted
            // evidence; it never reruns or re-ranks the optimizer.
            alternatives: [
              ...(input.stage3.result.selectionRationale?.alternatives ?? []),
              ...(input.stage3.result.selectionRationale?.sizeWindowComparisons ?? [])
                .filter((candidate: any) => candidate?.role !== 'SELECTED_COMPACT'
                  && candidate?.role !== 'BEST_AVAILABLE'),
            ],
          },
        } : {}),
    },
    // Stage-2 is optional reference evidence for this fixed-design screening;
    // do not fabricate a compatibility finding when it is absent.
    stage2Stage1Compatibility: input.stage2Stage1Compatibility ?? null,
     stage3HetsAdmission: {
         status: 'PERSISTED_STAGE3_OPTIMIZER_GEOMETRY',
         source: 'PERSISTED_STAGE3_OPTIMIZER_GEOMETRY_NO_STAGE4_RESELECTION',
        },
    overallEfficiency: {
       value: STAGE4_DESIGN_COMPARTMENT_EFFICIENCY,
       status: 'ADOPTED_PRE_PILOT_ENGINEERING_ASSUMPTION_NOT_CALCULATED_PERFORMANCE',
      dependency: null,
      closure: null,
    },
    hetsSizing: {
       sizingMethod: 'ADOPTED_COMPARTMENT_EFFICIENCY',
       designCompartmentEfficiency: STAGE4_DESIGN_COMPARTMENT_EFFICIENCY,
      fixedDesignTheoreticalStages: STAGE4_HETS_DESIGN_NT,
      actualStage2TheoreticalStagesReference: actualStage2Available ? input.calculatedNt : null,
      stage3HydraulicColumnDiameterM: diameterM,
       compartmentHeightRule: 'PERSISTED_STAGE3_SELECTED_hc',
      physicalCompartmentHeightM: compartmentHeightM,
       impliedInstalledHetsMPerTheoreticalStage,
      requiredActiveHeightM,
      requiredPhysicalCompartments,
      installedActiveHeightM,
      designStatus: 'PRE-PILOT SCREENING',
    },
    physicalGeometry: {
      pitchM: compartmentHeightM,
       pitchAssumption: 'PERSISTED STAGE-3 OPTIMIZER GEOMETRY — selected hc/D is immutable lineage; pilot/vendor confirmation required',
       equations: [
           'hc = persisted Stage-3 selected compartment height',
            'Nphysical = ceil(Ndesign(7) / ηcomp,design)',
            'Hrequired = Hinstalled = Nphysical × hc',
            'HETSimpl,installed = Hinstalled / Ndesign(7) (derived diagnostic only)',
         ],
    },
    assumptions: [
       'Stage 4 carries the persisted immutable Stage-3 optimizer geometry (D and hc) forward and does not recalculate or reselect hydraulic candidates.',
       'Stage-4 physical sizing deliberately fixes Ndesign = 7. Any actual accepted Stage-2 N_T is retained as reference only and does not set height or compartment count.',
       'Design average physical-compartment efficiency ηcomp,design = 0.35 is an adopted pre-pilot engineering assumption, subject to validation/calibration from pilot performance or a validated mass-transfer/backmixing model; it is not a published Kühni constant or calculated NMP/RRBO efficiency.',
       'The persisted Stage-3 hc is authoritative. Stage 4 does not select, modify, or infer compartment height.',
       'Implied installed HETS = installed active height / 7 is a derived reporting diagnostic only, never a design input.',
      'Installed active height is not total vessel height. This screening makes no outlet, recovery, target-compliance, or final-design claim.',
    ],
  };
}

export type Stage4PrePilotSizingAuthority = {
  projection: ReturnType<typeof deriveStage4PrePilotSizing>;
  /** Retained only as read-only evidence shape for stopped historical scripts. */
  solverInput: { actualStage2Nt: number | null; stage1SnapshotHash: string; stage2JobId: string | null; stage2ResultHash: string | null; stage3RunId: string; stage3ImmutableHash: string; hydraulics: { diameterM: number } };
  lineageHash: string;
};

/**
 * A Stage-4 calculation is current only when it was produced from the
 * currently accepted optimizer record.  Checking the Stage-4 implementation
 * hash alone is not sufficient: older HETS rows can carry the same fixed
 * N_T=7 label while containing a superseded HETS basis or geometry.
 */
function isCurrentStage4Calculation(
  authority: Stage4PrePilotSizingAuthority,
  calculation: StoredCalculation | null,
): boolean {
  if (calculation?.status !== 'CALCULATED') return false;
  const result = calculation.result_snapshot;
  const resultHydraulics = result?.selectedStage3Hydraulics;
  const currentHydraulics = authority.projection.selectedStage3Hydraulics;
  return result?.currentOptimizer?.version === ECR_STAGE3_STAGE4_OPTIMIZER_VERSION
    && result?.currentOptimizer?.implementationHash === ECR_STAGE3_STAGE4_OPTIMIZER_HASH
    && result?.currentOptimizer?.resultHash === currentHydraulics.optimizerResultHash
    && result?.implementation?.version === STAGE4_OPTIMIZED_HETS_IMPLEMENTATION_VERSION
    && result?.implementation?.implementationHash === STAGE4_OPTIMIZED_HETS_IMPLEMENTATION_HASH
    && result?.calculationModel === STAGE4_OPTIMIZED_HETS_IMPLEMENTATION_VERSION
    && resultHydraulics?.optimizerVersion === ECR_STAGE3_STAGE4_OPTIMIZER_VERSION
    && resultHydraulics?.optimizerImplementationHash === ECR_STAGE3_STAGE4_OPTIMIZER_HASH
    && resultHydraulics?.optimizerResultHash === currentHydraulics.optimizerResultHash
    && resultHydraulics?.stage3RunId === currentHydraulics.stage3RunId
    && resultHydraulics?.stage3ImmutableHash === currentHydraulics.stage3ImmutableHash
    && resultHydraulics?.diameterM === currentHydraulics.diameterM
    && resultHydraulics?.compartmentHeightM === currentHydraulics.compartmentHeightM
    && resultHydraulics?.hcToColumn === currentHydraulics.hcToColumn
    && resultHydraulics?.rotorDiameterM === currentHydraulics.rotorDiameterM
    && resultHydraulics?.rotorToColumn === currentHydraulics.rotorToColumn
    && resultHydraulics?.freeArea === currentHydraulics.freeArea
    && resultHydraulics?.selectedRpm === currentHydraulics.selectedRpm;
}

export async function loadStage4PrePilotSizingAuthority(
  userId: number,
  designId: number,
): Promise<Stage4PrePilotSizingAuthority> {
  const design = await pool.query<{ input_data: unknown }>(
    'SELECT input_data FROM ecr_pre_pilot_designs WHERE id=$1 AND created_by=$2',
    [designId, userId],
  );
  if (!design.rows[0]) fail('ECR_PRE_PILOT_DESIGN_NOT_FOUND');
  const stage1 = validateStage1Snapshot(design.rows[0].input_data);
  const stage2Rows = await pool.query<PersistedStage2>(
    `SELECT id::text,design_id,created_by,input_snapshot,model_hash,engine_hash,status,result_snapshot FROM ecr_pre_pilot_predictive_nt_jobs
      WHERE design_id=$1 AND created_by=$2 AND status='completed'
        AND result_snapshot IS NOT NULL
        AND result_snapshot->>'status' IS DISTINCT FROM 'ENGINE_ERROR'
      ORDER BY created_at DESC,id DESC`,
    [designId, userId],
  );
  let rejectedStage2AuthorityCode: string | null = null;
  const stage2 = stage2Rows.rows.find(row => {
    try {
      validatePersistedStage2HetsAuthority(row, stage1);
      return true;
    } catch (error) {
      rejectedStage2AuthorityCode = (error as Error).message;
      return false;
    }
  });
  if (!stage2 && stage2Rows.rows.length > 0) {
    fail(rejectedStage2AuthorityCode
      || 'STAGE4_PERSISTED_ACCEPTED_STAGE2_INTEGRITY_INVALID');
  }
  const trustedStage2 = stage2
    ? validatePersistedStage2HetsAuthority(stage2, stage1)
    : null;

  const optimizerStage3Rows = await pool.query<{
    id: string; immutable_hash: string; stage1_snapshot_hash: string;
    implementation_hash: string;
    stage2_job_id: string | null; stage2_result_hash: string | null;
    parent_hydrodynamic_run_id: string | null; parent_hydrodynamic_run_hash: string | null;
    process_basis: unknown; theoretical_stage_authority: unknown; result_snapshot: Record<string, any>;
  }>(
    `SELECT id::text,immutable_hash,stage1_snapshot_hash,implementation_hash,
            stage2_job_id::text,stage2_result_hash,
            parent_hydrodynamic_run_id::text,parent_hydrodynamic_run_hash,process_basis,
            theoretical_stage_authority,result_snapshot
       FROM ecr_pre_pilot_kuhni_geometry_resolver_runs
      WHERE design_id=$1 AND created_by=$2
        AND stage1_snapshot_hash=$3
        AND NOT (result_snapshot ? 'candidateKind')
        AND result_snapshot->'engine'->>'version'=$4
        AND implementation_hash=$5
        AND result_snapshot->'engine'->>'implementationHash'=$5
      ORDER BY created_at DESC,id DESC LIMIT 1`,
     [designId, userId, stage1.immutableHash, ECR_STAGE3_STAGE4_OPTIMIZER_VERSION, ECR_STAGE3_STAGE4_OPTIMIZER_HASH],
  );
  const currentOptimizerRows = optimizerStage3Rows.rows;
  // Historical rows remain replayable, but they are never a Stage-4 input.
  // In particular, do not fall back to a V1.x/V1.5 row whose legacy geometry
  // implies hc=0.5D. Stage 4 never creates missing Stage-3 authority.
  if (!currentOptimizerRows.length) {
    fail('STAGE4_CURRENT_STAGE3_OPTIMIZER_REQUIRED');
  }
  const stage3Rows = { ...optimizerStage3Rows, rows: currentOptimizerRows };
  const row = stage3Rows.rows[0];
  if (!row) fail('STAGE4_VALID_CURRENT_STAGE3_SELECTED_HYDRAULICS_REQUIRED');
  const immutableHash = kuhniRunHash({
    basis: row.process_basis,
    theoreticalStages: row.theoretical_stage_authority,
    parentHydrodynamicRun: row.parent_hydrodynamic_run_id
      ? { id: row.parent_hydrodynamic_run_id, immutable_hash: row.parent_hydrodynamic_run_hash } : null,
    result: row.result_snapshot,
  });
  if (immutableHash !== row.immutable_hash
    || row.stage1_snapshot_hash !== stage1.immutableHash
    || row.result_snapshot?.processBasis?.stage1SnapshotHash !== stage1.immutableHash) {
    fail('STAGE4_VALID_CURRENT_STAGE3_SELECTED_HYDRAULICS_REQUIRED');
  }
  if (currentOptimizerRows.length) {
    const { calculationHash, ...calculationPayload } = row.result_snapshot ?? {};
    if (
      row.result_snapshot?.engine?.version !== ECR_STAGE3_STAGE4_OPTIMIZER_VERSION
      || row.result_snapshot?.engine?.implementationHash !== ECR_STAGE3_STAGE4_OPTIMIZER_HASH
      || row.implementation_hash !== ECR_STAGE3_STAGE4_OPTIMIZER_HASH
      || row.result_snapshot?.stage1Authority?.snapshotHash !== stage1.immutableHash
      || kuhniRunHash(calculationPayload) !== calculationHash
    ) {
      fail('STAGE4_CURRENT_OPTIMIZER_INTEGRITY_FAILURE');
    }
  }
  const stage3: Stage3Projection = {
    id: row.id, immutableHash: row.immutable_hash, stage1SnapshotHash: row.stage1_snapshot_hash,
    result: row.result_snapshot,
  };
  // This is an additive read-only qualification of the already replayed
  // resolver record. It neither writes presentation data into the immutable
  // Stage-3 result nor calls the frozen geometry engine.
  const presentationQualification = qualifyKuhniStage3Presentation({
    result: row.result_snapshot,
    processBasis: row.process_basis as any,
    runStage1SnapshotHash: row.stage1_snapshot_hash,
    currentStage1SnapshotHash: stage1.immutableHash,
    integrityVerified: true,
  });
  const stage3PrePilotHetsAdmission =
    admitIndependentlyCheckedStage3PrePilotHetsCandidate(presentationQualification);
  const projection = deriveStage4PrePilotSizing({
    calculatedNt: trustedStage2?.theoreticalStages ?? null,
    stage2JobId: stage2?.id ?? null,
    stage2ResultHash: trustedStage2?.resultHash ?? null,
    stage3,
    stage2Stage1Compatibility: trustedStage2?.stage1Compatibility,
    stage3PrePilotHetsAdmission,
  });
  const solverInput = {
    actualStage2Nt: trustedStage2?.theoreticalStages ?? null,
    stage1SnapshotHash: stage1.immutableHash,
    stage2JobId: stage2?.id ?? null,
    stage2ResultHash: trustedStage2?.resultHash ?? null,
    stage3RunId: String(row.id),
    stage3ImmutableHash: row.immutable_hash,
    hydraulics: { diameterM: projection.mainOutputs.diameterM },
  };
  const lineageHash = kuhniRunHash({
    owner: { userId, designId },
    stage1SnapshotHash: stage1.immutableHash,
    stage2ActualReference: trustedStage2 ? {
      jobId: stage2!.id, resultHash: trustedStage2.resultHash,
      theoreticalStages: trustedStage2.theoreticalStages,
      stage1Compatibility: trustedStage2.stage1Compatibility,
    } : null,
    stage3: {
      runId: String(row.id), immutableHash: row.immutable_hash,
      hydraulicDiameterM: projection.mainOutputs.diameterM,
      hetsAdmission: projection.stage3HetsAdmission,
    },
    implementation: projection.implementation,
  });
  return { projection, solverInput, lineageHash };
}

type StoredCalculation = {
  status: string; result_snapshot: any; progress_snapshot: Record<string, unknown> | null;
  error_code: string | null; attempt_token: string; started_at: string; deadline_at: string; completed_at: string | null;
};

function resultFor(authority: Stage4PrePilotSizingAuthority, calculation: StoredCalculation | null, historical?: StoredCalculation | null) {
  const calculated = isCurrentStage4Calculation(authority, calculation);
  const result = calculated ? calculation.result_snapshot : {
    status: 'UNRUN',
    currentOptimizerRequired: false,
    historicalCalculationOnly: Boolean(historical),
    classification: 'PRE-PILOT PREDICTIVE / SCREENING DESIGN',
    screeningNotice: 'PRE-PILOT SCREENING',
    mainOutputs: { diameterM: authority.projection.mainOutputs.diameterM, overallEfficiency: null, physicalCompartments: null, activeHeightM: null },
    designNt: authority.projection.designNt,
    actualStage2NtReference: authority.projection.actualStage2NtReference,
    selectedStage3Hydraulics: authority.projection.selectedStage3Hydraulics,
    assumptions: authority.projection.assumptions,
  };
  return {
    ...result,
    calculation: {
      status: calculated ? 'CALCULATED' : 'UNRUN',
      progress: { phase: calculated ? 'COMPLETE' : 'NOT_RUN_EXPLICIT_CALCULATION_REQUIRED' },
      lineageHash: authority.lineageHash,
      startedAt: calculation?.started_at ?? null,
      completedAt: calculation?.completed_at ?? null,
      errorCode: calculation?.error_code ?? null,
    },
    ...(historical ? {
      historicalCalculationOnly: true,
      historicalCalculationImplementationVersion:
        historical.result_snapshot?.implementation?.version ?? null,
      previousCalculation: {
        status: historical.status, errorCode: historical.error_code,
        completedAt: historical.completed_at, progress: historical.progress_snapshot, historical: true as const,
        staleReason: 'STAGE4_RESULT_REQUIRES_CURRENT_OPTIMIZER_ENGINE_AND_HASH',
      },
    } : {}),
  };
}

/**
 * A legacy Stage-3/Stage-4 chain must not be presented as the current result
 * merely because it is the newest row in the immutable ledger. Keep only
 * non-scientific lifecycle metadata visible until the user explicitly
 * calculates Stage 4, at which point the bounded optimizer and its current
 * implementation hash are established.
 */
async function currentOptimizerRequiredResult(
  userId: number,
  designId: number,
  reason: string,
) {
  const previous = await pool.query<StoredCalculation>(
    `SELECT status,result_snapshot,progress_snapshot,error_code,attempt_token,started_at::text,
            deadline_at::text,completed_at::text
       FROM ecr_pre_pilot_stage4_physical_sizing_calculations
      WHERE created_by=$1 AND design_id=$2
      ORDER BY completed_at DESC NULLS LAST,id DESC LIMIT 1`,
    [userId, designId],
  );
  const historical = previous.rows[0] ?? null;
  return {
    status: 'UNRUN',
    currentOptimizerRequired: true,
    historicalCalculationOnly: Boolean(historical),
    currentOptimizerStatus: 'NOT_RUN_FOR_CURRENT_STAGE1_SNAPSHOT',
    currentOptimizerReason: reason,
    classification: 'PRE-PILOT PREDICTIVE / SCREENING DESIGN',
    screeningNotice: 'PRE-PILOT SCREENING',
    // These fields are intentionally null: no legacy D or hc=0.5D value is
    // current authority, and no new Stage-4 number exists yet.
    mainOutputs: {
      diameterM: null,
      overallEfficiency: null,
      physicalCompartments: null,
      activeHeightM: null,
      requiredActiveHeightM: null,
      installedActiveHeightM: null,
    },
    designNt: {
      value: STAGE4_HETS_DESIGN_NT,
      provenance: 'STAGE4_FIXED_PRE_PILOT_DESIGN_NT',
      label: 'FIXED STAGE-4 PRE-PILOT PHYSICAL SIZING DESIGN BASIS (N_T=7)',
    },
    actualStage2NtReference: {
      value: null,
      status: 'NOT_AVAILABLE_REFERENCE_ONLY',
      label: 'ACTUAL ACCEPTED STAGE-2 PREDICTIVE N_T — REFERENCE ONLY; NOT THE STAGE-4 SIZING BASIS',
      stage2JobId: null,
      stage2ResultHash: null,
    },
    selectedStage3Hydraulics: {
      source: 'CURRENT_STAGE3_OPTIMIZER_REQUIRED',
      diameterM: null,
      compartmentHeightM: null,
      hcToColumn: null,
      rotorDiameterM: null,
      rotorToColumn: null,
      freeArea: null,
      selectedRpm: null,
    },
    assumptions: [
      'A current Stage-3 optimizer record is required before new Stage-4 sizing.',
      'Legacy Stage-3 geometry and hc=0.5D Stage-4 records remain immutable historical evidence only.',
      'Stage 4 cannot calculate until the required persisted Stage-3 authority exists; Calculate never creates or reruns Stage 3.',
    ],
    calculation: {
      status: 'UNRUN',
      progress: { phase: 'CURRENT_STAGE3_OPTIMIZER_REQUIRED' },
      lineageHash: null,
      startedAt: null,
      completedAt: null,
      errorCode: reason,
    },
    ...(historical ? {
      historicalCalculationImplementationVersion:
        historical.result_snapshot?.implementation?.version ?? null,
      previousCalculation: {
        status: historical.status,
        errorCode: historical.error_code,
        completedAt: historical.completed_at,
        progress: historical.progress_snapshot,
        implementationVersion: historical.result_snapshot?.implementation?.version ?? null,
        historical: true as const,
        staleReason: 'LEGACY_STAGE4_RESULT_REQUIRES_CURRENT_STAGE3_OPTIMIZER',
      },
    } : {}),
  };
}

export async function getLiveStage4PrePilotSizing(userId: number, designId: number) {
  let authority: Stage4PrePilotSizingAuthority;
  try {
    // GET remains read-only. It must not create an optimizer or reinterpret a
    // historical V1.x/V1.5 row as current authority.
    authority = await loadStage4PrePilotSizingAuthority(userId, designId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (reason === 'STAGE4_CURRENT_STAGE3_OPTIMIZER_REQUIRED') {
      return currentOptimizerRequiredResult(userId, designId, reason);
    }
    throw error;
  }
  const stored = await pool.query<StoredCalculation>(
    `SELECT status,result_snapshot,progress_snapshot,error_code,attempt_token,started_at::text,
            deadline_at::text,completed_at::text
       FROM ecr_pre_pilot_stage4_physical_sizing_calculations
      WHERE created_by=$1 AND design_id=$2 AND lineage_hash=$3`,
    [userId, designId, authority.lineageHash],
  );
  let calculation = stored.rows[0] ?? null;
  let historical: StoredCalculation | null = null;
  if (!isCurrentStage4Calculation(authority, calculation)) {
    historical = calculation;
    if (!historical) {
      const previous = await pool.query<StoredCalculation>(
        `SELECT status,result_snapshot,progress_snapshot,error_code,attempt_token,started_at::text,
                deadline_at::text,completed_at::text
           FROM ecr_pre_pilot_stage4_physical_sizing_calculations
          WHERE created_by=$1 AND design_id=$2 AND lineage_hash<>$3
          ORDER BY completed_at DESC NULLS LAST,id DESC LIMIT 1`,
        [userId, designId, authority.lineageHash],
      );
      historical = previous.rows[0] ?? null;
    }
    calculation = null;
  }
  return resultFor(authority, calculation, historical);
}

export async function calculateStage4PrePilotSizing(userId: number, designId: number) {
  // Calculate consumes persisted Stage-3 authority only. It must never create,
  // rerun, or replace a Stage-3 optimizer record.
  const authority = await loadStage4PrePilotSizingAuthority(userId, designId);
  const lookup = () => pool.query<StoredCalculation>(
    `SELECT status,result_snapshot,progress_snapshot,error_code,attempt_token,started_at::text,
            deadline_at::text,completed_at::text
       FROM ecr_pre_pilot_stage4_physical_sizing_calculations
      WHERE created_by=$1 AND design_id=$2 AND lineage_hash=$3`,
    [userId, designId, authority.lineageHash],
  );
  let calculation = (await lookup()).rows[0] ?? null;
  if (!isCurrentStage4Calculation(authority, calculation)) {
    const optimized = authority.projection.implementation?.implementationHash
      === STAGE4_OPTIMIZED_HETS_IMPLEMENTATION_HASH;
    const implementationHash = optimized
      ? STAGE4_OPTIMIZED_HETS_IMPLEMENTATION_HASH
      : STAGE4_HETS_IMPLEMENTATION_HASH;
    const result = {
      ...authority.projection,
      calculationModel: optimized
        ? STAGE4_OPTIMIZED_HETS_IMPLEMENTATION_VERSION
        : STAGE4_HETS_IMPLEMENTATION_VERSION,
    };
    await pool.query(
      `INSERT INTO ecr_pre_pilot_stage4_physical_sizing_calculations
        (design_id,created_by,lineage_hash,stage1_snapshot_hash,stage2_job_id,stage2_result_hash,
         stage3_run_id,stage3_immutable_hash,targets_hash,implementation_hash,status,result_snapshot,
         progress_snapshot,attempt_token,deadline_at,completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'CALCULATED',$11,
               '{"phase":"COMPLETE"}'::jsonb,$12,now(),now())
         ON CONFLICT (created_by,design_id,lineage_hash) DO NOTHING`,
      [designId, userId, authority.lineageHash, authority.solverInput.stage1SnapshotHash,
         authority.solverInput.stage2JobId, authority.solverInput.stage2ResultHash,
        authority.solverInput.stage3RunId, authority.solverInput.stage3ImmutableHash,
        authority.solverInput.stage1SnapshotHash, implementationHash, result, randomUUID()],
    );
    calculation = (await lookup()).rows[0] ?? null;
  }
  return resultFor(authority, calculation);
}

export async function retryStage4PrePilotSizing(userId: number, designId: number) {
  return calculateStage4PrePilotSizing(userId, designId);
}

export async function stopStage4PrePilotSizing(userId: number, designId: number) {
  return getLiveStage4PrePilotSizing(userId, designId);
}