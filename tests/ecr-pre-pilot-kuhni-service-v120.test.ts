import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  canonicalizeStage1Input,
  makeStage1HydrodynamicProcessBasis,
  makeStage1Snapshot,
  type EcrPrePilotStage1Snapshot,
} from '../server/ecr-pre-pilot/stage1';
import {
  PRE_PILOT_DEFAULT_THEORETICAL_STAGES,
  resolveKuhniGeometry,
  resolveKuhniGeometryV100,
  type TheoreticalStageAuthority,
} from '../server/ecr-pre-pilot/kuhni-geometry-resolver';
import { resolveKuhniGeometryV110 } from '../server/ecr-pre-pilot/kuhni-geometry-resolver-v110';
import {
  KUHNI_GEOMETRY_RESOLVER_V120_HASH,
  KUHNI_GEOMETRY_RESOLVER_V120_VERSION,
  resolveKuhniGeometryV120,
} from '../server/ecr-pre-pilot/kuhni-geometry-resolver-v120';
import {
  KUHNI_GEOMETRY_RESOLVER_V130_HASH,
  KUHNI_GEOMETRY_RESOLVER_V130_VERSION,
} from '../server/ecr-pre-pilot/kuhni-geometry-resolver-v130';
import { kuhniRunHash } from '../server/ecr-pre-pilot/kuhni-hydrodynamics';
import {
  ECR_STAGE3_STAGE4_OPTIMIZER_HASH,
  optimizeStage3Stage4,
} from '../server/ecr-pre-pilot/stage3-stage4-optimizer';

const state = vi.hoisted(() => ({
  query: vi.fn(),
  designSnapshot: null as EcrPrePilotStage1Snapshot | null,
  geometryRows: [] as any[],
  insertParams: null as unknown[] | null,
  nextId: 1,
}));

vi.mock('../server/db', () => ({ pool: { query: state.query } }));

// Job A's adapter preflight is a dependency boundary, not the subject of this
// service persistence test. Keep the real module's exports for import safety,
// but avoid reading/building the adapter runtime.
vi.mock('../server/ecr-pre-pilot/stage4-seven-component-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/ecr-pre-pilot/stage4-seven-component-adapter')>();
  return {
    ...actual,
    preflightSevenComponentStage4Adapter: vi.fn(async () => ({
      status: 'PASS',
      engineId: 'ECR2_PRE_PILOT_SEVEN_COMPONENT_0P5_5P0_H2O',
      engineVersion: '7C-1.5.0',
      componentOrder: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'],
      engineHash: 'a'.repeat(64),
      resultHash: 'b'.repeat(64),
    })),
  };
});

const {
  createKuhniGeometryResolverRun,
  evaluateEcrPrePilotJobA,
  getStage3Stage4OptimizerRuns,
  getKuhniGeometryResolverRuns,
} = await import('../server/ecr-pre-pilot-service');

function stage1Input(overrides: Record<string, unknown> = {}) {
  return {
    projectReference: '209',
    rrboGrade: 'SN300',
    designFeedRateLph: '1000',
    operatingTemperatureC: '50',
    nmpTemperatureC: '50',
    operatingPressure: '2.0',
    phaseConfiguration: 'nmp-continuous-rrbo-dispersed',
    saturatesWt: '65',
    monoAromaticsWt: '20',
    diAromaticsWt: '5',
    polyAromaticsWt: '3',
    polarAromaticsWt: '5',
    nmpInFeedWt: '2',
    rrboDensityKgM3: '850',
    rrboDynamicViscosityCp: '20',
    rrboInterfacialTensionMnM: '8',
    nmpPurityWt: '99.5',
    nmpWaterWt: '0.5',
    nmpDensityKgM3: '1000',
    nmpDynamicViscosityCp: '1.2',
    solventOilRatio: '1.50',
    targetRaffinateSulfurPpm: '1000',
    minimumRaffinateSaturatesWt: '90',
    targetRaffinateTotalAromaticsWt: '10.0',
    targetRaffinatePolarAromaticsWt: '0.50',
    minimumRecoveryPct: '90',
    maximumNmpRaffinateWt: '1.0',
    feedSulfurPpm: '3500',
    sulfurAllocationSatPct: '0',
    sulfurAllocationMonoPct: '20',
    sulfurAllocationDiPct: '30',
    sulfurAllocationPolyPct: '40',
    sulfurAllocationPaPct: '10',
    designBasisNotes: 'Task 297 service persistence fixture',
    satIdentity: 'n-dodecane',
    monoIdentity: 'n-propylbenzene',
    maximumStages: '10',
    ...overrides,
  };
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return makeStage1Snapshot(canonicalizeStage1Input(stage1Input(overrides), 209));
}

const currentSnapshot = snapshot();
const currentBasis = makeStage1HydrodynamicProcessBasis(currentSnapshot);
const defaultAuthority: TheoreticalStageAuthority = {
  value: PRE_PILOT_DEFAULT_THEORETICAL_STAGES,
  provenance: 'PRE_PILOT_DESIGN_DEFAULT',
  label: 'PRE-PILOT DESIGN DEFAULT (Stage-2 calculated NT unavailable)',
  stage2JobId: null,
  stage2ResultHash: null,
};

function persistedRow(
  id: string,
  basis: typeof currentBasis,
  result: any,
  authority: TheoreticalStageAuthority = defaultAuthority,
  createdAt = '2026-01-01T00:00:00.000Z',
) {
  const parentHydrodynamicRun = null;
  return {
    id,
    createdAt,
    stage1SnapshotHash: basis.stage1SnapshotHash,
    stage2JobId: null,
    stage2ResultHash: null,
    parentHydrodynamicRunId: null,
    parentHydrodynamicRunHash: null,
    processBasis: basis,
    theoreticalStages: authority,
    result,
    implementationHash: result.engine.implementationHash,
    immutableHash: kuhniRunHash({
      basis,
      theoreticalStages: authority,
      parentHydrodynamicRun,
      result,
    }),
  };
}

function fourVersionRows(
  basis = currentBasis,
  authority = defaultAuthority,
) {
  const results = [
    resolveKuhniGeometryV100(basis, authority),
    resolveKuhniGeometry(basis, authority),
    resolveKuhniGeometryV110(basis, authority),
    resolveKuhniGeometryV120(basis, authority),
  ];
  return results.map((result, index) =>
    persistedRow(
      `resolver-${index + 100}`,
      basis,
      result,
      authority,
      `2026-01-0${index + 1}T00:00:00.000Z`,
    ));
}

beforeEach(() => {
  state.query.mockReset();
  state.designSnapshot = currentSnapshot;
  state.geometryRows = [];
  state.insertParams = null;
  state.nextId = 1;
  state.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    const normalized = sql.toLowerCase();
    if (normalized.includes('from ecr_pre_pilot_designs')) {
      return { rows: state.designSnapshot ? [{ input_data: state.designSnapshot }] : [] };
    }
    if (normalized.includes('from ecr_pre_pilot_predictive_nt_jobs')) return { rows: [] };
    if (normalized.includes('from ecr_pre_pilot_kuhni_hydrodynamic_runs')) {
      return { rows: [{ id: 'hydro-parent-1', immutable_hash: 'p'.repeat(64) }] };
    }
    if (normalized.startsWith('insert into ecr_pre_pilot_kuhni_geometry_resolver_runs')) {
      state.insertParams = params;
      return {
        rows: [{
          id: String(state.nextId++),
          created_at: '2026-01-02T00:00:00.000Z',
        }],
      };
    }
    if (normalized.includes('from ecr_pre_pilot_kuhni_geometry_resolver_runs')) {
      if (normalized.includes("result_snapshot->'engine'->>'version'=$4")) {
        return {
          rows: state.geometryRows.filter((row) =>
            row.stage1SnapshotHash === params[2]
            && row.result?.engine?.version === params[3]),
        };
      }
      return { rows: state.geometryRows };
    }
    throw new Error(`UNEXPECTED_MOCK_DB_QUERY:${sql}`);
  });
});

describe('Kühni V1.2.0 service persistence and dependency boundaries', () => {
  it('persists the V1.2.0 hash and the current Stage-1 snapshot lineage', async () => {
    const created = await createKuhniGeometryResolverRun(7, 209);

    expect(created.engine.version).toBe(KUHNI_GEOMETRY_RESOLVER_V130_VERSION);
    expect(created.engine.implementationHash).toBe(KUHNI_GEOMETRY_RESOLVER_V130_HASH);
    expect(created.processBasis.stage1SnapshotHash).toBe(currentSnapshot.immutableHash);
    expect(state.insertParams).not.toBeNull();
    expect(state.insertParams?.[2]).toBe(currentSnapshot.immutableHash);
    expect(state.insertParams?.[7]).toMatchObject({
      stage1SnapshotHash: currentSnapshot.immutableHash,
    });
    expect(state.insertParams?.[8]).toMatchObject({
      value: PRE_PILOT_DEFAULT_THEORETICAL_STAGES,
      provenance: 'STAGE3_GEOMETRY_DESIGN_NT',
      stage3GeometryDesignNt: PRE_PILOT_DEFAULT_THEORETICAL_STAGES,
      stage2AcceptedPredictiveNt: null,
    });
    expect(state.insertParams?.[5]).toBe('hydro-parent-1');
    expect(state.insertParams?.[6]).toBe('p'.repeat(64));
    expect(state.insertParams?.[9]).toMatchObject({
      engine: {
        version: KUHNI_GEOMETRY_RESOLVER_V130_VERSION,
        implementationHash: KUHNI_GEOMETRY_RESOLVER_V130_HASH,
      },
    });
    expect(state.insertParams?.[10]).toBe(KUHNI_GEOMETRY_RESOLVER_V130_HASH);
    expect(state.insertParams?.[11]).toBe(created.immutableHash);
    expect(created.integrityStatus).toBe('VERIFIED');
    expect(created.stage1SnapshotHash).toBe(currentSnapshot.immutableHash);
    expect(created.implementationHash).toBe(KUHNI_GEOMETRY_RESOLVER_V130_HASH);
    expect(created.presentationQualification.status)
      .toBe('CALCULATED_PRE_PILOT_WITH_MAJOR_SCALE_UP_EXTRAPOLATION');
    expect(created.presentationQualification.candidate).toMatchObject({
      source: 'CALCULATED_IN_RANGE_TRIAL',
      governed: false,
      stage4Input: false,
    });
  });

  it('loads only the current optimizer row, verifies its persisted hash, and compacts the grid', async () => {
    const result = optimizeStage3Stage4(currentBasis, currentSnapshot.immutableHash, {
      diameterMinM: 0.2,
      diameterMaxM: 0.4,
      diameterStepM: 0.2,
    });
    expect(result.engine.implementationHash).toBe(ECR_STAGE3_STAGE4_OPTIMIZER_HASH);
    const currentRow = persistedRow('optimizer-current', currentBasis, result);
    state.geometryRows = [{
      ...currentRow,
      id: 'optimizer-stale',
      stage1SnapshotHash: 'stale-stage1-hash',
    }, currentRow];

    const latest = await getStage3Stage4OptimizerRuns(7, 209, true);
    expect(latest?.integrityStatus).toBe('VERIFIED');
    expect(latest?.stage1SnapshotHash).toBe(currentSnapshot.immutableHash);
    expect(latest?.result?.engine?.implementationHash).toBe(ECR_STAGE3_STAGE4_OPTIMIZER_HASH);
    expect(latest?.result?.orientationComparison?.every((item: any) =>
      item.geometryGrid.length === 0)).toBe(true);
  });

  it('replays and verifies V1.0.0, V1.0.1, V1.1.0, and V1.2.0 rows', async () => {
    state.geometryRows = fourVersionRows();

    const rows = await getKuhniGeometryResolverRuns(7, 209);

    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.result.engine.version)).toEqual([
      'KUHNI_GEOMETRY_RESOLVER_V1.0.0',
      'KUHNI_GEOMETRY_RESOLVER_V1.0.1',
      'KUHNI_GEOMETRY_RESOLVER_V1.1.0',
      KUHNI_GEOMETRY_RESOLVER_V120_VERSION,
    ]);
    expect(rows.every((row) => row.integrityStatus === 'VERIFIED')).toBe(true);
  });

  it('accepts Job A only with a verified V1.2.0 in-range Stage-3 trial', async () => {
    state.geometryRows = [fourVersionRows()[3]];

    const jobA = await evaluateEcrPrePilotJobA(7, 209);

    expect(jobA.status).toBe('JOB_A_CLOSED_FOR_PRE_PILOT_IMPLEMENTATION');
    expect(jobA.dependencies.stage3ImplementationHash).toBe(KUHNI_GEOMETRY_RESOLVER_V120_HASH);
    expect(jobA.dependencies.stage1SnapshotHash).toBe(currentSnapshot.immutableHash);
  });

  it('rejects a verified V1.2.0 Stage-3 result with no calculated-in-range trial', async () => {
    const reverseSnapshot = snapshot({ phaseConfiguration: 'rrbo-continuous-nmp-dispersed' });
    const reverseBasis = makeStage1HydrodynamicProcessBasis(reverseSnapshot);
    state.designSnapshot = reverseSnapshot;
    state.geometryRows = [persistedRow(
      'resolver-reverse',
      reverseBasis,
      resolveKuhniGeometryV120(reverseBasis, defaultAuthority),
    )];

    await expect(evaluateEcrPrePilotJobA(7, 209))
      .rejects.toThrow('JOB_A_DEPENDENCY_BLOCKED:NO_CALCULATED_IN_RANGE_STAGE3_TRIAL');
  });

  it('rejects a verified V1.2.0 result whose Stage-1 lineage is stale', async () => {
    const staleSnapshot = snapshot({ operatingTemperatureC: '60', nmpTemperatureC: '60' });
    const staleBasis = makeStage1HydrodynamicProcessBasis(staleSnapshot);
    state.geometryRows = [persistedRow(
      'resolver-stale',
      staleBasis,
      resolveKuhniGeometryV120(staleBasis, defaultAuthority),
    )];

    await expect(evaluateEcrPrePilotJobA(7, 209))
      .rejects.toThrow('JOB_A_DEPENDENCY_BLOCKED:STAGE1_STAGE3_HASH_MISMATCH');
  });
});