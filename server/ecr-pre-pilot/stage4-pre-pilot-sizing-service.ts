import { pool } from '../db';
import {
  makeStage1HydrodynamicProcessBasis,
  validateStage1Snapshot,
} from './stage1';
import { kuhniRunHash } from './kuhni-hydrodynamics';
import { resolveKuhniOperatingHoldupV110 } from './kuhni-geometry-resolver-v110';
import { getKuhniGeometryResolverRuns } from '../ecr-pre-pilot-service';

const FINITE = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const HASH = /^[a-f0-9]{64}$/;
const USABLE_STAGE2_STATUSES = new Set([
  'COMPLETED_GOVERNED_SEQUENCE',
  'COMPLETED_DIAGNOSTIC_SEQUENCE',
  'COMPLETED_PRE_PILOT_MULTISTAGE_MATRIX',
]);

type SourceKind = 'MEASURED' | 'PUBLISHED' | 'PILOT' | 'ENGINEER_ASSUMPTION';
type Range = {
  ntMin: number; ntMax: number; diameterMinM: number; diameterMaxM: number;
  rpmMin: number; rpmMax: number; pitchMinM: number; pitchMaxM: number;
};
type EvidenceItem = {
  sourceKind: SourceKind;
  sourceReference: string;
  citation: string;
  provenance: string;
  validityConditions: string;
  applicability: Range;
};
type EvidenceInput = {
  performance: EvidenceItem & {
    basis: 'OVERALL_EFFICIENCY' | 'HETS';
    value: number;
    unit: 'FRACTION' | 'M_PER_THEORETICAL_STAGE';
  };
  pitch: EvidenceItem & { value: number; unit: 'M_PER_COMPARTMENT' };
  review: { attested: boolean; attestation: string; reviewer: string };
};

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function error(code: string): never {
  throw new Error(code);
}

function range(value: unknown, label: string): Range {
  if (!value || typeof value !== 'object' || Array.isArray(value)) error(`STAGE4_${label}_APPLICABILITY_REQUIRED`);
  const source = value as Record<string, unknown>;
  const fields = [
    'ntMin', 'ntMax', 'diameterMinM', 'diameterMaxM', 'rpmMin', 'rpmMax', 'pitchMinM', 'pitchMaxM',
  ] as const;
  const result = Object.fromEntries(fields.map(field => {
    const candidate = source[field];
    if (!FINITE(candidate)) error(`STAGE4_${label}_APPLICABILITY_${field.toUpperCase()}_FINITE_REQUIRED`);
    return [field, candidate];
  })) as unknown as Range;
  if (!(result.ntMin > 0 && result.ntMax >= result.ntMin
    && result.diameterMinM > 0 && result.diameterMaxM >= result.diameterMinM
    && result.rpmMin > 0 && result.rpmMax >= result.rpmMin
    && result.pitchMinM > 0 && result.pitchMaxM >= result.pitchMinM)) {
    error(`STAGE4_${label}_APPLICABILITY_RANGE_INVALID`);
  }
  return result;
}

function commonEvidence(value: unknown, label: string): EvidenceItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) error(`STAGE4_${label}_EVIDENCE_REQUIRED`);
  const source = value as Record<string, unknown>;
  if (!['MEASURED', 'PUBLISHED', 'PILOT', 'ENGINEER_ASSUMPTION'].includes(String(source.sourceKind))) {
    error(`STAGE4_${label}_SOURCE_KIND_INVALID`);
  }
  for (const field of ['sourceReference', 'citation', 'provenance', 'validityConditions'] as const) {
    if (!nonEmpty(source[field])) error(`STAGE4_${label}_${field.toUpperCase()}_REQUIRED`);
  }
  return {
    sourceKind: source.sourceKind as SourceKind,
    sourceReference: source.sourceReference.trim(),
    citation: source.citation.trim(),
    provenance: source.provenance.trim(),
    validityConditions: source.validityConditions.trim(),
    applicability: range(source.applicability, label),
  };
}

export function validateStage4Evidence(raw: unknown): EvidenceInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) error('STAGE4_EVIDENCE_BODY_REQUIRED');
  const source = raw as Record<string, unknown>;
  const performance = commonEvidence(source.performance, 'PERFORMANCE');
  const performanceRaw = source.performance as Record<string, unknown>;
  const pitch = commonEvidence(source.pitch, 'PITCH');
  const pitchRaw = source.pitch as Record<string, unknown>;
  const reviewRaw = source.review;
  if (!['OVERALL_EFFICIENCY', 'HETS'].includes(String(performanceRaw.basis))
    || !FINITE(performanceRaw.value)
    || (performanceRaw.basis === 'OVERALL_EFFICIENCY'
      && (!(performanceRaw.value > 0) || performanceRaw.value > 1 || performanceRaw.unit !== 'FRACTION'))
    || (performanceRaw.basis === 'HETS'
      && (!(performanceRaw.value > 0) || performanceRaw.unit !== 'M_PER_THEORETICAL_STAGE'))) {
    error('STAGE4_PERFORMANCE_BASIS_VALUE_OR_UNIT_INVALID');
  }
  if (!FINITE(pitchRaw.value) || !(pitchRaw.value > 0) || pitchRaw.unit !== 'M_PER_COMPARTMENT') {
    error('STAGE4_PITCH_VALUE_OR_UNIT_INVALID');
  }
  if (!reviewRaw || typeof reviewRaw !== 'object' || Array.isArray(reviewRaw)
    || (reviewRaw as any).attested !== true || !nonEmpty((reviewRaw as any).attestation)
    || !nonEmpty((reviewRaw as any).reviewer)) {
    error('STAGE4_EXPLICIT_REVIEW_ATTESTATION_REQUIRED');
  }
  return {
    performance: {
      ...performance, basis: performanceRaw.basis as 'OVERALL_EFFICIENCY' | 'HETS',
      value: performanceRaw.value, unit: performanceRaw.unit as 'FRACTION' | 'M_PER_THEORETICAL_STAGE',
    },
    pitch: { ...pitch, value: pitchRaw.value, unit: 'M_PER_COMPARTMENT' },
    review: {
      attested: true, attestation: (reviewRaw as any).attestation.trim(),
      reviewer: (reviewRaw as any).reviewer.trim(),
    },
  };
}

function within(value: number, min: number, max: number) {
  return value >= min && value <= max;
}

function evidenceApplies(evidence: EvidenceItem, nt: number, diameterM: number, rpm: number, pitchM: number) {
  const range = evidence.applicability;
  return within(nt, range.ntMin, range.ntMax)
    && within(diameterM, range.diameterMinM, range.diameterMaxM)
    && within(rpm, range.rpmMin, range.rpmMax)
    && within(pitchM, range.pitchMinM, range.pitchMaxM);
}

async function currentPrerequisites(userId: number, designId: number) {
  const design = await pool.query<{ input_data: unknown }>(
    'SELECT input_data FROM ecr_pre_pilot_designs WHERE id=$1 AND created_by=$2',
    [designId, userId],
  );
  if (!design.rows[0]) error('ECR_PRE_PILOT_DESIGN_NOT_FOUND');
  const stage1 = validateStage1Snapshot(design.rows[0].input_data);
  const stage2 = await pool.query<{ id: string; result_snapshot: any }>(
    `SELECT id::text,result_snapshot FROM ecr_pre_pilot_predictive_nt_jobs
      WHERE design_id=$1 AND created_by=$2 AND status='completed'
        AND result_snapshot IS NOT NULL
        AND result_snapshot->>'status' IS DISTINCT FROM 'ENGINE_ERROR'
        AND result_snapshot#>>'{stage1TargetGovernance,stage1SnapshotHash}'=$3
      ORDER BY created_at DESC,id DESC`,
    [designId, userId, stage1.immutableHash],
  );
  const stage2Row = stage2.rows.find(row => {
    const result = row.result_snapshot;
    const nt = result?.establishedTheoreticalStages ?? result?.predictiveNt;
    return USABLE_STAGE2_STATUSES.has(String(result?.executionStatus ?? ''))
      && Number.isInteger(nt) && nt > 0;
  });
  if (!stage2Row) error('STAGE4_CALCULATED_SAME_LINEAGE_STAGE2_NT_REQUIRED_NO_DEFAULT_APPLIED');
  const nt = stage2Row.result_snapshot.establishedTheoreticalStages
    ?? stage2Row.result_snapshot.predictiveNt;
  const stage2ResultHash = kuhniRunHash(stage2Row.result_snapshot);
  const stage3 = await getKuhniGeometryResolverRuns(userId, designId, true);
  if (!stage3) error('STAGE4_CURRENT_VERIFIED_STAGE3_HYDRAULIC_ENVELOPE_REQUIRED');
  const authority = (stage3.result as any)?.theoreticalStagesUsed;
  if (stage3.stage1SnapshotHash !== stage1.immutableHash
    || authority?.provenance !== 'STAGE_2_CALCULATED_NT'
    || authority?.stage2JobId !== stage2Row.id
    || authority?.stage2ResultHash !== stage2ResultHash
    || authority?.value !== nt) {
    error('STAGE4_STAGE3_STALE_OR_NOT_SAME_LINEAGE_WITH_CALCULATED_STAGE2_NT');
  }
  const included = (stage3.result as any)?.hydraulicRpmEnvelope;
  const excluded = (stage3.result as any)?.excludedExtrapolatedTrials;
  if (!Array.isArray(included) || !included.length) {
    error('STAGE4_COMPLETE_STAGE3_HYDRAULIC_CANDIDATE_ENVELOPE_REQUIRED');
  }
  // V1.0.1 intentionally moves extrapolated records out of the displayed
  // envelope. They are still part of the persisted candidate set and must be
  // recomputed/reported here rather than silently disappearing from review.
  const envelope = [
    ...included.map((item: any) => ({ ...item, stage3Envelope: 'IN_RANGE_ENVELOPE' })),
    ...(Array.isArray(excluded)
      ? excluded.map((item: any) => ({ ...item, stage3Envelope: 'EXCLUDED_EXTRAPOLATED_AUDIT_RECORD' }))
      : []),
  ];
  return { stage1, stage2: { id: stage2Row.id, nt, resultHash: stage2ResultHash }, stage3, envelope };
}

function recomputeEnvelope(envelope: any[], processBasis: ReturnType<typeof makeStage1HydrodynamicProcessBasis>) {
  return envelope.map((source, ordinal) => {
    const diameterM = source?.columnDiameterM;
    const rpm = source?.rpm;
    const base = {
      ordinal, stage3Envelope: source?.stage3Envelope ?? 'UNSPECIFIED',
      sourceStatus: source?.status ?? null, diameterM: FINITE(diameterM) ? diameterM : null,
      rpm: FINITE(rpm) ? rpm : null, sourceApplicability: source?.applicability ?? [],
    };
    if (!(FINITE(diameterM) && diameterM > 0 && FINITE(rpm) && rpm > 0)) {
      return { ...base, status: 'REJECTED_INVALID_STAGE3_CANDIDATE_DIMENSIONS' };
    }
    try {
      const hydraulic = resolveKuhniOperatingHoldupV110({ processBasis, columnDiameterM: diameterM, rpm });
      if (hydraulic.status !== 'OPERATING_HOLDUP_CALCULATED') {
        return { ...base, status: 'REJECTED_NO_STABLE_OPERATING_HOLDUP_ROOT', reason: hydraulic.reason };
      }
      if (hydraulic.applicability.status !== 'CALCULATED_IN_RANGE') {
        return {
          ...base, status: 'REJECTED_HYDRAULIC_CORRELATION_EXTRAPOLATED',
          d32M: hydraulic.d32M, operatingHoldup: hydraulic.operatingHoldup,
          floodHoldup: hydraulic.floodHoldup, holdupMargin: hydraulic.floodHoldup - hydraulic.operatingHoldup,
          applicability: hydraulic.applicability,
        };
      }
      if (source?.status !== 'CALCULATED_IN_RANGE') {
        return {
          ...base, status: 'REJECTED_STAGE3_SOURCE_APPLICABILITY_CONSTRAINT',
          d32M: hydraulic.d32M, operatingHoldup: hydraulic.operatingHoldup,
          floodHoldup: hydraulic.floodHoldup, holdupMargin: hydraulic.floodHoldup - hydraulic.operatingHoldup,
          applicability: hydraulic.applicability,
          reason: 'STAGE3_RECORDED_THIS_CANDIDATE_AS_EXTRAPOLATED_OR_NOT_ADMITTED',
        };
      }
      return {
        ...base, status: 'HYDRAULICALLY_ELIGIBLE', d32M: hydraulic.d32M,
        operatingHoldup: hydraulic.operatingHoldup, floodHoldup: hydraulic.floodHoldup,
        holdupMargin: hydraulic.floodHoldup - hydraulic.operatingHoldup,
        applicability: hydraulic.applicability,
      };
    } catch (cause) {
      return {
        ...base, status: 'REJECTED_HYDRAULIC_CLOSURE_ERROR',
        reason: cause instanceof Error ? cause.message : 'UNKNOWN_HYDRAULIC_CLOSURE_ERROR',
      };
    }
  });
}

export async function evaluateStage4PrePilotSizing(userId: number, designId: number, rawEvidence: unknown) {
  const evidence = validateStage4Evidence(rawEvidence);
  const prerequisites = await currentPrerequisites(userId, designId);
  const processBasis = makeStage1HydrodynamicProcessBasis(prerequisites.stage1);
  const candidates = recomputeEnvelope(prerequisites.envelope, processBasis);
  const eligible = candidates.filter(item => item.status === 'HYDRAULICALLY_ELIGIBLE');
  if (!eligible.length) error('STAGE4_NO_IN_RANGE_HYDRAULIC_CANDIDATE_AFTER_COMPLETE_ENVELOPE_RECOMPUTATION');
  // Hydraulic-only deterministic selection: smallest recomputed column
  // diameter, then lowest RPM, then original envelope ordinal.  It does not
  // optimize performance evidence or invoke any transport/Job-C solver.
  const selected = [...eligible].sort((left, right) =>
    left.diameterM! - right.diameterM! || left.rpm! - right.rpm! || left.ordinal - right.ordinal,
  )[0];
  const nt = prerequisites.stage2.nt;
  const pitch = evidence.pitch.value;
  if (!evidenceApplies(evidence.performance, nt, selected.diameterM!, selected.rpm!, pitch)
    || !evidenceApplies(evidence.pitch, nt, selected.diameterM!, selected.rpm!, pitch)) {
    error('STAGE4_EVIDENCE_APPLICABILITY_RANGE_DOES_NOT_COVER_CALCULATED_NT_SELECTED_HYDRAULICS_AND_PITCH');
  }
  const physicalCompartments = evidence.performance.basis === 'OVERALL_EFFICIENCY'
    ? Math.ceil(nt / evidence.performance.value)
    : Math.ceil((nt * evidence.performance.value) / pitch);
  if (!(Number.isSafeInteger(physicalCompartments) && physicalCompartments > 0)) {
    error('STAGE4_PHYSICAL_COMPARTMENT_ROUNDING_INVALID');
  }
  const installedHeightM = physicalCompartments * pitch;
  const specifiedEfficiency = evidence.performance.basis === 'OVERALL_EFFICIENCY'
    ? evidence.performance.value : null;
  const specifiedHetsM = evidence.performance.basis === 'HETS' ? evidence.performance.value : null;
  const installedOverallStageCountRatio = nt / physicalCompartments;
  const assumption = [evidence.performance.sourceKind, evidence.pitch.sourceKind].includes('ENGINEER_ASSUMPTION');
  const result = {
    status: assumption
      ? 'CALCULATED_WITH_ENGINEER_ASSUMPTION_NOT_SUPPORTED_MODEL'
      : 'CALCULATED_PRE_PILOT_PREDICTIVE_PHYSICAL_SIZING',
    classification: 'PRE_PILOT_PREDICTIVE_NOT_FINAL_DESIGN_NOT_RELEASE_ELIGIBLE',
    calculatedNt: {
      value: nt, provenance: 'STAGE_2_CALCULATED_NT_SAME_LINEAGE',
      stage2JobId: prerequisites.stage2.id, stage2ResultHash: prerequisites.stage2.resultHash,
    },
    selectedHydraulics: {
      ...selected,
      selectionRule: 'HYDRAULIC_ONLY_MINIMUM_RECOMPUTED_DIAMETER_THEN_LOWEST_RPM_THEN_STAGE3_ORDINAL',
      stage3RunId: prerequisites.stage3.id, stage3ImmutableHash: prerequisites.stage3.immutableHash,
      operatingMarginDefinition: 'floodHoldup - operatingHoldup',
    },
    hydraulicCandidates: candidates,
    evidence,
    physicalSizing: {
      physicalCompartments, installedHeightM, pitchM: pitch,
      specifiedOverallEfficiency: specifiedEfficiency,
      specifiedHetsM,
      installedOverallStageCountRatio,
      installedOverallStageCountRatioLabel:
        'DERIVED_NT_DIVIDED_BY_INSTALLED_PHYSICAL_COMPARTMENTS_NOT_MEASURED_MURPHREE_EFFICIENCY',
      specifiedEfficiencyLabel: specifiedEfficiency === null
        ? 'NOT_SPECIFIED_HETS_BASIS_USED'
        : 'SPECIFIED_EVIDENCE_VALUE_NOT_ROUNDED_ACHIEVED_COUNT_RATIO',
      equations: evidence.performance.basis === 'OVERALL_EFFICIENCY'
        ? ['Nphys = ceil(NT / Eo)', 'H = Nphys × pitch']
        : ['Hreq = NT × HETS', 'Nphys = ceil(Hreq / pitch)', 'H = Nphys × pitch'],
      units: { NT: 'theoretical stages', Eo: 'fraction', HETS: 'm/theoretical stage', pitch: 'm/compartment', H: 'm' },
    },
    assumptions: [
      'No Job-C, lambda=1 continuation, 189-equation transport solve, or automatic long calculation was run.',
      'D=1.02877 m is not privileged or auto-passed; every persisted Stage-3 envelope candidate was recomputed.',
      'The Stage-3 hydraulic closure supplies hydraulic eligibility only; physical pitch is supplied by separately reviewed evidence.',
      ...(assumption ? ['ENGINEER_ASSUMPTION is clearly distinguished from measured, published, or pilot evidence and does not create a supported model.'] : []),
    ],
  };
  const evidenceSnapshot = { schemaVersion: 'ECR_PRE_PILOT_STAGE4_EVIDENCE_V1', evidence };
  const resultHash = kuhniRunHash(result);
  const immutableHash = kuhniRunHash({ evidenceSnapshot, result });
  const saved = await pool.query<{ id: number; created_at: Date }>(
    `INSERT INTO ecr_pre_pilot_stage4_pre_pilot_sizing_results
      (design_id,created_by,stage1_snapshot_hash,stage2_job_id,stage2_result_hash,
       stage3_run_id,stage3_immutable_hash,evidence_snapshot,result_snapshot,result_hash,immutable_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,created_at`,
    [designId, userId, prerequisites.stage1.immutableHash, prerequisites.stage2.id,
      prerequisites.stage2.resultHash, prerequisites.stage3.id, prerequisites.stage3.immutableHash,
      evidenceSnapshot, result, resultHash, immutableHash],
  );
  return {
    id: Number(saved.rows[0].id), createdAt: new Date(saved.rows[0].created_at).toISOString(),
    resultHash, immutableHash, ...result,
  };
}

export async function getLatestStage4PrePilotSizing(userId: number, designId: number) {
  const found = await pool.query<any>(
    `SELECT * FROM ecr_pre_pilot_stage4_pre_pilot_sizing_results
      WHERE design_id=$1 AND created_by=$2 ORDER BY created_at DESC,id DESC LIMIT 1`,
    [designId, userId],
  );
  const row = found.rows[0];
  if (!row) return null;
  if (!HASH.test(row.result_hash) || !HASH.test(row.immutable_hash)
    || kuhniRunHash(row.result_snapshot) !== row.result_hash
    || kuhniRunHash({ evidenceSnapshot: row.evidence_snapshot, result: row.result_snapshot }) !== row.immutable_hash) {
    error('STAGE4_PRE_PILOT_SIZING_RESULT_INTEGRITY_FAILURE');
  }
  try {
    const current = await currentPrerequisites(userId, designId);
    if (current.stage1.immutableHash !== row.stage1_snapshot_hash
      || current.stage2.id !== row.stage2_job_id
      || current.stage2.resultHash !== row.stage2_result_hash
      || Number(current.stage3.id) !== Number(row.stage3_run_id)
      || current.stage3.immutableHash !== row.stage3_immutable_hash) {
      return {
        ...row.result_snapshot, id: Number(row.id), resultHash: row.result_hash, immutableHash: row.immutable_hash,
        status: 'DEPENDENCY_BLOCKED', staleStatus: 'STALE',
        reason: 'STAGE4_PRE_PILOT_SIZING_CURRENT_STAGE1_STAGE2_OR_STAGE3_LINEAGE_CHANGED',
      };
    }
  } catch (cause) {
    return {
      ...row.result_snapshot, id: Number(row.id), resultHash: row.result_hash, immutableHash: row.immutable_hash,
      status: 'DEPENDENCY_BLOCKED', staleStatus: 'STALE_OR_PREREQUISITE_UNAVAILABLE',
      reason: cause instanceof Error ? cause.message : 'STAGE4_PRE_PILOT_SIZING_PREREQUISITE_UNAVAILABLE',
    };
  }
  return {
    ...row.result_snapshot, id: Number(row.id), createdAt: new Date(row.created_at).toISOString(),
    resultHash: row.result_hash, immutableHash: row.immutable_hash,
  };
}