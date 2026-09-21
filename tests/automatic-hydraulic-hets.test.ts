import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), validate: vi.fn() }));
vi.mock('../server/db', () => ({ pool: { query: mocks.query } }));
vi.mock('../server/ecr-pre-pilot/stage1', () => ({
  validateStage1Snapshot: mocks.validate, makeStage1HydrodynamicProcessBasis: () => ({}),
}));
vi.mock('../server/ecr-pre-pilot/predictive-nt-job-service', () => ({
  validatePersistedAcceptedSevenComponentNtForStage4: vi.fn(),
}));
import { calculateStage4PrePilotSizing, loadStage4PrePilotSizingAuthority } from '../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service';
import { kuhniRunHash } from '../server/ecr-pre-pilot/kuhni-hydrodynamics';
const saved = JSON.parse(readFileSync('deliverables/p1-research-regression/integrated-saved-artifact.json', 'utf8'));
let candidate: any, stored: any;
beforeEach(() => {
  vi.clearAllMocks(); stored = null;
  const payload = { candidateKind: 'RRBO_P1_CANDIDATE_ONLY', metadata: saved.metadata, result: saved.result };
  candidate = { ledgerId: saved.ledgerId, basis: saved.stage1Basis, payload, hash: kuhniRunHash({ basis: saved.stage1Basis, payload }),
    implementationHash: saved.implementationHash, createdAt: saved.ledgerCreatedAt };
  mocks.validate.mockReturnValue({ immutableHash: saved.currentStage1Hash, stage1: { phaseConfiguration: saved.metadata.phaseConfiguration } });
  mocks.query.mockImplementation(async (sql: string, args: any[]) => {
    if (sql.includes('FROM ecr_pre_pilot_designs')) {
      expect(args).toEqual([269, 7]); return { rows: [{ input_data: {} }] };
    }
    if (sql.includes('SELECT DISTINCT')) {
      expect(args.slice(0, 2)).toEqual([269, 7]); return { rows: [candidate] };
    }
    if (sql.startsWith('INSERT')) {
      expect(sql).toContain('ecr_pre_pilot_stage4_physical_sizing_calculations');
      expect(args[6]).toBe(saved.ledgerId);
      stored = { status: 'CALCULATED', result_snapshot: args[10] };
      return { rows: [] };
    }
    if (sql.includes('FROM ecr_pre_pilot_stage4_physical_sizing_calculations')) return { rows: stored ? [stored] : [] };
    throw new Error(`Unexpected query ${sql}`);
  });
});
it('resolves current owned persisted P1 on GET without writes and persists exact automatic geometry only on HETS run', async () => {
  const authority = await loadStage4PrePilotSizingAuthority(7, 269);
  const h = authority.projection.selectedStage3Hydraulics;
  expect(h.source).toBe('AUTOMATIC_PRELIMINARY_P1_SELECTION');
  expect(h.diameterM).toBe(.7);
  expect(h.compartmentHeightM).toBe(.21);
  expect(authority.projection.hetsSizing.installedActiveHeightM).toBe(4.2);
  expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  const result = await calculateStage4PrePilotSizing(7, 269);
  expect(result.selectedStage3Hydraulics).toEqual(h);
  expect(stored.result_snapshot.selectedStage3Hydraulics.automaticSelection.source.candidateId).toBe(saved.metadata.id);
  expect(stored.result_snapshot.selectedStage3Hydraulics.automaticSelection.source.calculationHash).toBe(saved.calculationHash);
}, 30000);
it('blocks stale P1 without falling back to historical authority', async () => {
  mocks.validate.mockReturnValue({ immutableHash: 'changed', stage1: { phaseConfiguration: saved.metadata.phaseConfiguration } });
  await expect(loadStage4PrePilotSizingAuthority(7, 269)).rejects.toThrow('CURRENT_AUTOMATIC_P1_SELECTION_REQUIRED');
});
it('blocks a tampered owned candidate', async () => {
  candidate.hash = 'tampered';
  await expect(loadStage4PrePilotSizingAuthority(7, 269)).rejects.toThrow('INTEGRITY_FAILURE');
});
it('does not admit another owner', async () => {
  mocks.query.mockResolvedValue({ rows: [] });
  await expect(loadStage4PrePilotSizingAuthority(8, 269)).rejects.toThrow('DESIGN_NOT_FOUND');
});