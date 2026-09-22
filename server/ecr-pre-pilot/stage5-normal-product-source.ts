import type { TrustedCompletedSevenComponentNtForStage4 } from './predictive-nt-job-service';

export interface FrozenStage2NormalProductReference {
  stage2JobId: string;
  stage2ResultHash: string;
  value: number;
}

export interface BoundNormalProductTrial {
  status: 'NORMAL_PRODUCT_TRIAL_BOUND_DENSITIES_REQUIRED';
  sourceIdentity: string;
  sourceRevision: string;
  stageCount: number;
  componentOrder: readonly ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'];
  raffinateComponentKgH: number[];
  extractComponentKgH: number[];
  raffinateDensityKgM3: null;
  extractDensityKgM3: null;
  holds: readonly ['NORMAL_RAFFINATE_OPERATING_DENSITY_NOT_QUALIFIED', 'NORMAL_EXTRACT_OPERATING_DENSITY_NOT_QUALIFIED'];
  detail: string;
}

const COMPONENT_ORDER = ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'] as const;
const finiteNonnegativeVector = (value: unknown): value is number[] => Array.isArray(value)
  && value.length === COMPONENT_ORDER.length
  && value.every(entry => typeof entry === 'number' && Number.isFinite(entry) && entry >= 0);
const close = (actual: number, expected: number) =>
  Math.abs(actual - expected) <= Math.max(1e-9, Math.abs(expected) * 1e-8);

/**
 * Adapts the one accepted trial already selected by the persisted Stage-2
 * validator. This function does not search trials or infer an N4/N7 choice.
 *
 * Stage-2 boundary-stream masses are a normalized process basis. Scaling all
 * streams by frozen Stage-1 oil mass rate preserves the saved normal S/O and
 * provides authoritative product mass rates. Stage-2 has no qualified
 * operating-temperature volume/density contract, so this adapter deliberately
 * stops before producing QualifiedNormalEndFlow or NormalProductDuty.
 */
export function bindNormalProductTrial(
  trusted: TrustedCompletedSevenComponentNtForStage4,
  reference: FrozenStage2NormalProductReference,
  stage1OilKgH: number,
): BoundNormalProductTrial {
  if (!trusted || typeof reference?.stage2JobId !== 'string'
    || typeof reference.stage2ResultHash !== 'string'
    || !Number.isInteger(reference.value) || reference.value < 1
    || trusted.jobId !== reference.stage2JobId
    || trusted.resultSnapshotHash !== reference.stage2ResultHash
    || trusted.theoreticalStages !== reference.value) {
    throw new Error('STAGE5_NORMAL_PRODUCT_FROZEN_STAGE2_IDENTITY_MISMATCH');
  }
  if (!Number.isFinite(stage1OilKgH) || stage1OilKgH <= 0) {
    throw new Error('STAGE5_NORMAL_PRODUCT_STAGE1_OIL_RATE_INVALID');
  }

  const trial = trusted.selectedTrial as Record<string, any>;
  const boundary = trial?.boundaryStreams;
  const oil = boundary?.oilFeed;
  const solvent = boundary?.freshWetSolvent;
  const raffinate = boundary?.finalRaffinate;
  const extract = boundary?.finalExtract;
  if (trial?.accepted !== true || trial?.stageCount !== trusted.theoreticalStages
    || !finiteNonnegativeVector(oil?.componentMass)
    || !finiteNonnegativeVector(solvent?.componentMass)
    || !finiteNonnegativeVector(raffinate?.componentMass)
    || !finiteNonnegativeVector(extract?.componentMass)
    || !Number.isFinite(oil.mass) || oil.mass <= 0) {
    throw new Error('STAGE5_NORMAL_PRODUCT_BOUND_TRIAL_INVALID');
  }

  for (const stream of [oil, solvent, raffinate, extract]) {
    const componentTotal = stream.componentMass.reduce((sum: number, value: number) => sum + value, 0);
    if (!Number.isFinite(stream.mass) || stream.mass < 0 || !close(componentTotal, stream.mass)) {
      throw new Error('STAGE5_NORMAL_PRODUCT_BOUNDARY_MASS_INVALID');
    }
  }
  for (let index = 0; index < COMPONENT_ORDER.length; index += 1) {
    const incoming = oil.componentMass[index] + solvent.componentMass[index];
    const outgoing = raffinate.componentMass[index] + extract.componentMass[index];
    if (!close(outgoing, incoming)) {
      throw new Error('STAGE5_NORMAL_PRODUCT_COMPONENT_BALANCE_INVALID');
    }
  }

  const scale = stage1OilKgH / oil.mass;
  if (![...raffinate.componentMass, ...extract.componentMass]
    .every(value => Number.isFinite(value * scale))) {
    throw new Error('STAGE5_NORMAL_PRODUCT_SCALED_RATE_INVALID');
  }
  return Object.freeze({
    status: 'NORMAL_PRODUCT_TRIAL_BOUND_DENSITIES_REQUIRED',
    sourceIdentity: `STAGE2_ACCEPTED_NORMAL_TRIAL:${trusted.jobId}:N${trusted.theoreticalStages}`,
    sourceRevision: trusted.resultSnapshotHash,
    stageCount: trusted.theoreticalStages,
    componentOrder: COMPONENT_ORDER,
    raffinateComponentKgH: raffinate.componentMass.map((value: number) => value * scale),
    extractComponentKgH: extract.componentMass.map((value: number) => value * scale),
    raffinateDensityKgM3: null,
    extractDensityKgM3: null,
    holds: [
      'NORMAL_RAFFINATE_OPERATING_DENSITY_NOT_QUALIFIED',
      'NORMAL_EXTRACT_OPERATING_DENSITY_NOT_QUALIFIED',
    ],
    detail: `The uniquely accepted frozen Stage-2 trial (job ${trusted.jobId}, N=${trusted.theoreticalStages}, result ${trusted.resultSnapshotHash}) supplies simultaneous normal product mass rates: raffinate ${(raffinate.mass * scale).toPrecision(8)} kg/h; extract ${(extract.mass * scale).toPrecision(8)} kg/h. No persisted source qualifies raffinate or extract density at operating temperature, so volumetric end flow and D/H remain unavailable.`,
  });
}