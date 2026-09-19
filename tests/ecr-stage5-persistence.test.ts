import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyStage5Inputs } from '../shared/ecr-stage5-geometry';

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
        rows.unshift(row); return { rows: [row] };
      }
      if (sql.includes('SELECT * FROM ecr_pre_pilot_stage5')) return { rows };
      return { rows: [] };
    } };
  });
});
describe('Stage 5 authoritative immutable persistence', () => {
  it('rejects non-owner reads before loading source or revision', async () => {
    owner = false;
    await expect(getStage5Basis(2, 1)).rejects.toThrow('DESIGN_NOT_FOUND');
    await expect(getStage5Revisions(2, 1, '1')).rejects.toThrow('DESIGN_NOT_FOUND');
    await expect(saveStage5Revision(2, 1, emptyStage5Inputs(), 'source')).rejects.toThrow('DESIGN_NOT_FOUND');
    expect(mocks.authority).not.toHaveBeenCalled();
  });
  it('requires saved Stage 4 and never creates an optimizer', async () => {
    saved = false;
    await expect(getStage5Basis(1, 1)).rejects.toThrow('SAVED_CURRENT_STAGE4_REQUIRED');
    expect(mocks.authority).toHaveBeenCalledWith(1, 1, { ensureCurrentOptimizer: false });
    expect(queries.some(q => q.includes('INSERT'))).toBe(false);
  });
  it('requires expected source hash and rejects stale handoff without writing', async () => {
    await expect(saveStage5Revision(1, 1, emptyStage5Inputs(), undefined)).rejects.toThrow('EXPECTED_SOURCE_HASH_REQUIRED');
    await expect(saveStage5Revision(1, 1, emptyStage5Inputs(), 'stale')).rejects.toThrow('SOURCE_CHANGED');
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
    const inputs = emptyStage5Inputs();
    const results = await Promise.all([saveStage5Revision(1, 1, inputs, sourceHash, 'first'), saveStage5Revision(1, 1, inputs, sourceHash, 'second')]);
    expect(results.map(r => r.revision)).toEqual([1, 2]);
    inputs.notes = 'mutated client';
    const list = await getStage5Revisions(1, 1);
    expect(list.map(r => r.currentness)).toEqual(['CURRENT', 'SUPERSEDED']);
    expect(list[0].inputs.notes).toBe('');
    expect(queries.some(q => q.includes('IN SHARE MODE'))).toBe(true);
  });
  it('marks historical records outdated dynamically without changing their hash or geometry', async () => {
    const basis = await getStage5Basis(1, 1);
    const original = await saveStage5Revision(1, 1, emptyStage5Inputs(), basis.sourceHash);
    const frozen = JSON.stringify(rows);
    changed = true;
    const [historical] = await getStage5Revisions(1, 1, original.id);
    expect(historical.currentness).toBe('OUTDATED');
    expect(historical.geometry).toEqual(original.geometry);
    expect(JSON.stringify(rows)).toBe(frozen);
  });
  it('restores the latest matching-source revision as current when lineage returns', async () => {
    const basis = await getStage5Basis(1, 1);
    await saveStage5Revision(1, 1, emptyStage5Inputs(), basis.sourceHash);
    await saveStage5Revision(1, 1, emptyStage5Inputs(), basis.sourceHash);
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
    await saveStage5Revision(1, 1, emptyStage5Inputs(), basis.sourceHash);
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
  it('exports actual multi-page PDF from frozen shared SVG with paginated schedules', async () => {
    const basis = await getStage5Basis(1, 1);
    const record = await saveStage5Revision(1, 1, emptyStage5Inputs(), basis.sourceHash);
    const pdf = await createStage5Pdf(record);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const parsed = await PDFDocument.load(pdf);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(9);
    expect(parsed.getTitle()).toContain('revision 1');
    expect(pdf.length).toBeGreaterThan(10000);
  });
});