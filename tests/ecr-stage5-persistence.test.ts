import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildStage5Geometry, emptyStage5Inputs } from '../shared/ecr-stage5-geometry';
import { renderStage5Svg } from '../shared/ecr-stage5-drawings';

const mocks = vi.hoisted(() => ({ connect: vi.fn(), authority: vi.fn() }));
vi.mock('../server/db', () => ({ pool: { connect: mocks.connect } }));
vi.mock('../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service', () => ({ loadStage4PrePilotSizingAuthority: mocks.authority }));
import { getStage5Basis, getStage5Revisions, saveStage5Revision, stage5Hash, validateStage5Basis, validateStage5Inputs, verifyStage5Snapshot } from '../server/ecr-pre-pilot/stage5-geometry-service';
import { createStage5Pdf } from '../server/ecr-pre-pilot/stage5-geometry-report';
import { PDFDocument } from 'pdf-lib';

const projection = {
  implementation: { version: 'current' },
  selectedStage3Hydraulics: { diameterM: .8, compartmentHeightM: .2, rotorToColumn: .4,
    rotorDiameterM: .32, freeArea: .25, selectedRpm: 150, orientation: 'SOLVENT_CONTINUOUS' },
  hetsSizing: { requiredPhysicalCompartments: 35, requiredActiveHeightM: 7,
    installedActiveHeightM: 7, fixedDesignTheoreticalStages: 7, screeningHetsMPerTheoreticalStage: 1 },
};
let rows: any[], owner: boolean, saved: boolean, changed: boolean, queries: string[];
beforeEach(() => {
  rows = []; owner = true; saved = true; changed = false; queries = [];
  mocks.authority.mockReset();
  mocks.authority.mockImplementation(async () => ({
    projection, lineageHash: changed ? 'new-lineage' : 'lineage',
    solverInput: { stage3RunId: '3', stage3ImmutableHash: 'stage3-hash' },
  }));
  // Model PostgreSQL row locking, rather than assuming requests arrive serially.
  let tail = Promise.resolve();
  mocks.connect.mockImplementation(async () => {
    let unlock: (() => void) | undefined;
    return { release: vi.fn(), query: async (sql: string, params: any[] = []) => {
      queries.push(sql);
      if (sql.includes('FOR UPDATE')) {
        const previous = tail;
        tail = new Promise<void>(resolve => { unlock = resolve; });
        await previous;
        return { rows: owner ? [{ id: 1 }] : [] };
      }
      if (sql === 'COMMIT' || sql === 'ROLLBACK') { unlock?.(); return { rows: [] }; }
      if (sql.includes('FROM ecr_pre_pilot_stage4_physical_sizing_calculations'))
        return { rows: saved && !changed ? [{ id: '4', stage3_run_id: '3', stage3_immutable_hash: 'stage3-hash',
          status: 'CALCULATED', result_snapshot: { ...projection, calculationModel: 'current' } }] : [] };
      if (sql.includes('FROM ecr_pre_pilot_kuhni_geometry_resolver_runs'))
        return { rows: [{ id: '3', immutable_hash: 'stage3-hash', result_snapshot: { selectedOperatingWindow: { rpmMin: 100, rpmMax: 200 } } }] };
      if (sql.includes('INSERT INTO ecr_pre_pilot_stage5')) {
        const row = { id: String(rows.length + 1), revision: rows.length + 1, created_at: '2026-01-01T00:00:00Z',
          source_hash: params[2], immutable_hash: params[3], snapshot: structuredClone(params[4]) };
        rows.unshift(row); return { rows: [structuredClone(row)] };
      }
      if (sql.includes('SELECT * FROM ecr_pre_pilot_stage5')) return { rows: structuredClone(rows) };
      return { rows: [] };
    } };
  });
});
describe('Stage 5 authoritative immutable persistence', () => {
  it('rejects non-owner reads before loading source or revision', async () => {
    owner = false;
    await expect(getStage5Basis(2, 1)).rejects.toThrow('DESIGN_NOT_FOUND');
    await expect(getStage5Revisions(2, 1, '1')).rejects.toThrow('DESIGN_NOT_FOUND');
    await expect(saveStage5Revision(2, 1, undefined, 'source')).rejects.toThrow('DESIGN_NOT_FOUND');
    expect(mocks.authority).not.toHaveBeenCalled();
  });
  it('requires saved Stage 4 and never creates an optimizer', async () => {
    saved = false;
    await expect(getStage5Basis(1, 1)).rejects.toThrow('SAVED_CURRENT_STAGE4_REQUIRED');
    expect(mocks.authority).toHaveBeenCalledWith(1, 1, { ensureCurrentOptimizer: false });
    expect(queries.some(q => q.includes('INSERT'))).toBe(false);
  });
  it('maps the adopted efficiency handoff without treating implied HETS as a sizing input', async () => {
    const previous = structuredClone(projection.hetsSizing);
    (projection as any).hetsSizing = {
      sizingMethod: 'ADOPTED_COMPARTMENT_EFFICIENCY',
      designCompartmentEfficiency: .4,
      fixedDesignTheoreticalStages: 7,
      requiredPhysicalCompartments: 18,
      requiredActiveHeightM: 3.6,
      installedActiveHeightM: 3.6,
      impliedInstalledHetsMPerTheoreticalStage: 3.6 / 7,
    };
    try {
      const { basis } = await getStage5Basis(1, 1);
      expect(basis).toMatchObject({
        sizingMethod: 'ADOPTED_COMPARTMENT_EFFICIENCY',
        designCompartmentEfficiency: .4,
        compartmentCount: 18,
        requiredActiveHeightM: 3.6,
        installedActiveHeightM: 3.6,
        impliedInstalledHetsMPerTheoreticalStage: 3.6 / 7,
      });
      expect(basis).not.toHaveProperty('hetsM');
    } finally {
      (projection as any).hetsSizing = previous;
    }
  });
  it('requires expected source hash and rejects stale handoff without writing', async () => {
    await expect(saveStage5Revision(1, 1, undefined, undefined)).rejects.toThrow('EXPECTED_SOURCE_HASH_REQUIRED');
    await expect(saveStage5Revision(1, 1, undefined, 'stale')).rejects.toThrow('SOURCE_CHANGED');
    expect(rows).toHaveLength(0);
    expect(queries).toContain('ROLLBACK');
  });
  it('rejects incompatible saved Stage 4', async () => {
    mocks.authority.mockResolvedValueOnce({ projection: { ...projection, implementation: { version: 'changed' } },
      solverInput: { stage3RunId: '3', stage3ImmutableHash: 'stage3-hash' }, lineageHash: 'lineage' });
    await expect(getStage5Basis(1, 1)).rejects.toThrow('SOURCE_INCOMPATIBLE');
  });
  it('serializes concurrent revisions, preserving both input snapshots', async () => {
    const { sourceHash } = await getStage5Basis(1, 1);
    const results = await Promise.all([saveStage5Revision(1, 1, undefined, sourceHash, 'first'), saveStage5Revision(1, 1, undefined, sourceHash, 'second')]);
    expect(results.map(r => r.revision)).toEqual([1, 2]);
    results[0].geometry.dimensions.shaftDiameterM = 99;
    const list = await getStage5Revisions(1, 1);
    expect(list.map(r => r.currentness)).toEqual(['CURRENT', 'SUPERSEDED']);
    expect(list[0].inputs.notes).toContain('ECR_KUHNI_PREPILOT_GEOMETRY_RULESET_R1');
    expect(list[1].geometry.dimensions.shaftDiameterM).not.toBe(99);
    expect(list[0].geometryHash).toBe(stage5Hash(list[0].geometry));
    expect(list[0].rulesManifestHash).toBe(stage5Hash(list[0].rulesManifest));
    expect(queries.some(q => q.includes('IN SHARE MODE'))).toBe(true);
  });
  it('marks historical records outdated dynamically without changing their hash or geometry', async () => {
    const basis = await getStage5Basis(1, 1);
    const original = await saveStage5Revision(1, 1, undefined, basis.sourceHash);
    const frozen = JSON.stringify(rows);
    changed = true;
    const [historical] = await getStage5Revisions(1, 1, original.id);
    expect(historical.currentness).toBe('OUTDATED');
    expect(historical.geometry).toEqual(original.geometry);
    expect(JSON.stringify(rows)).toBe(frozen);
  });
  it('restores the latest matching-source revision as current when lineage returns', async () => {
    const basis = await getStage5Basis(1, 1);
    await saveStage5Revision(1, 1, undefined, basis.sourceHash);
    await saveStage5Revision(1, 1, undefined, basis.sourceHash);
    // A later legitimate package belongs to a different upstream lineage.
    const later = structuredClone(rows[0]);
    later.id = '3'; later.revision = 3; later.snapshot.sourceStage4.lineageHash = 'different-lineage';
    later.source_hash = stage5Hash({ sourceStage3: later.snapshot.sourceStage3, sourceStage4: later.snapshot.sourceStage4 });
    later.snapshot.sourceHash = later.source_hash;
    later.immutable_hash = stage5Hash(later.snapshot);
    rows.unshift(later);
    const list = await getStage5Revisions(1, 1);
    expect(list.map(r => r.currentness)).toEqual(['OUTDATED', 'CURRENT', 'SUPERSEDED']);
  });
  it('rejects missing, nonfinite or malformed inherited facts explicitly', async () => {
    const { basis } = await getStage5Basis(1, 1);
    for (const key of ['columnDiameterM', 'compartmentHeightM', 'rotorDiameterRatio', 'rotorDiameterM',
      'statorFreeAreaRatio', 'selectedRpm', 'rpmMin', 'rpmMax', 'compartmentCount',
      'requiredActiveHeightM', 'installedActiveHeightM', 'designNt', 'hetsM']) {
      for (const value of [undefined, null, '7', NaN, Infinity, 0])
        expect(() => validateStage5Basis({ ...basis, [key]: value })).toThrow('GOVERNING_BASIS_INVALID');
    }
    expect(() => validateStage5Basis({ ...basis, phaseConfiguration: null })).toThrow('GOVERNING_BASIS_INVALID');
    expect(() => validateStage5Basis({ ...basis, compartmentCount: 2.5 })).toThrow('GOVERNING_BASIS_INVALID');
  });
  it('detects frozen geometry, SVG and source tampering', async () => {
    const basis = await getStage5Basis(1, 1);
    await saveStage5Revision(1, 1, undefined, basis.sourceHash);
    for (const mutate of [
      (s: any) => { s.geometry.dimensions.columnDiameterM = 99; },
      (s: any) => { s.drawings.ga = '<svg/>'; },
      (s: any) => { s.sourceStage3.id = 'wrong'; },
    ]) {
      const row = structuredClone(rows[0]); mutate(row.snapshot);
      expect(() => verifyStage5Snapshot(row)).toThrow('INTEGRITY_FAILURE');
    }
    expect(stage5Hash({ a: 1, b: 2 })).toBe(stage5Hash({ b: 2, a: 1 }));
  });
  it('does not disguise infrastructure failures as outdated', async () => {
    mocks.authority.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(getStage5Revisions(1, 1)).rejects.toThrow('database unavailable');
  });
  it('validates construction choices without dropping blade and hub inputs', () => {
    const inputs = emptyStage5Inputs();
    inputs.rotorConstruction = 'flat-blade-turbine';
    inputs.values.bladeCount.value = 6;
    expect(validateStage5Inputs(inputs)).toEqual(inputs);
    expect(() => validateStage5Inputs({ ...inputs, rotorConstruction: 'unknown' })).toThrow('INVALID_INPUTS');
    expect(() => validateStage5Inputs({ ...inputs, basis: {} })).toThrow('INVALID_INPUTS');
  });
  it('rejects construction overrides before saving any new R1 revision', async () => {
    const basis = await getStage5Basis(1, 1);
    await expect(saveStage5Revision(1, 1, emptyStage5Inputs(), basis.sourceHash)).rejects.toThrow('CONSTRUCTION_OVERRIDES_FORBIDDEN');
    expect(rows).toHaveLength(0);
  });
  it('reads historical pre-R1 snapshots and all five saved drawings without regeneration', async () => {
    const basis = await getStage5Basis(1, 1);
    await saveStage5Revision(1, 1, undefined, basis.sourceHash);
    const row = rows[0];
    row.snapshot.geometry = buildStage5Geometry(basis.basis, emptyStage5Inputs());
    row.snapshot.inputs = row.snapshot.geometry.inputs;
    delete row.snapshot.ruleset;
    delete row.snapshot.geometryHash;
    row.snapshot.status = 'INCOMPLETE';
    row.snapshot.drawings = Object.fromEntries(['ga', 'section', 'compartment', 'rotor', 'stator']
      .map(view => [view, renderStage5Svg(row.snapshot.geometry, view as any)]));
    row.immutable_hash = stage5Hash(row.snapshot);
    const before = JSON.stringify(row);
    const [historical] = await getStage5Revisions(1, 1, row.id);
    expect(historical.geometry.ruleset).toBeUndefined();
    expect(historical.geometry.freeAreaDefinition).toContain('Net free area');
    expect(historical.drawings).toEqual(row.snapshot.drawings);
    expect(JSON.stringify(row)).toBe(before);
  });
  it('independently verifies geometry and manifest hashes inside the immutable snapshot', async () => {
    const basis = await getStage5Basis(1, 1);
    await saveStage5Revision(1, 1, undefined, basis.sourceHash);
    for (const key of ['geometryHash', 'rulesManifestHash']) {
      const row = structuredClone(rows[0]);
      row.snapshot[key] = 'wrong';
      row.immutable_hash = stage5Hash(row.snapshot);
      expect(() => verifyStage5Snapshot(row)).toThrow('DATASET_MANIFEST_INTEGRITY_FAILURE');
    }
  });
  it('exports actual multi-page PDF from frozen shared SVG with paginated schedules', async () => {
    const basis = await getStage5Basis(1, 1);
    const record = await saveStage5Revision(1, 1, undefined, basis.sourceHash);
    const pdf = await createStage5Pdf(record);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const parsed = await PDFDocument.load(pdf);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(9);
    expect(parsed.getTitle()).toContain('revision 1');
    expect(pdf.length).toBeGreaterThan(10000);
  });
});