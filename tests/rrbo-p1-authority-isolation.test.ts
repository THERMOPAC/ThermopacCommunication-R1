import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// Fail immediately on attempted DB access; no real db module or secret is loaded.
vi.mock('../server/db', () => ({ pool: { query: vi.fn(() => { throw new Error('DB_ACCESS_PROHIBITED'); }) } }));
vi.mock('../server/ecr-pre-pilot/predictive-nt-job-service', () => ({
  validatePersistedAcceptedSevenComponentNtForStage4: vi.fn(() => { throw new Error('STAGE2_ACCESS_PROHIBITED'); }),
}));
import {
  ECR_STAGE3_STAGE4_OPTIMIZER_VERSION, ECR_STAGE3_STAGE4_OPTIMIZER_HASH,
  ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_VERSION, ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_HASH,
} from '../server/ecr-pre-pilot/stage3-stage4-optimizer';
import {
  STAGE4_OPTIMIZED_HETS_IMPLEMENTATION_HASH, deriveStage4PrePilotSizing,
} from '../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service';
import { pool } from '../server/db';

// Independently reconstructed from git HEAD's original descriptor and Stage-4
// hash object before P1 changes, not from the runtime constants under test.
const originalVersion = 'ECR_STAGE3_STAGE4_OPTIMIZER_V1.3.0';
const originalHash = 'faa56fdd99b0904a5e524fb8350859192d94b269331e91bbd34cc5d946ccb550';
const originalStage4Hash = 'b6893ba2bc448ef35d1e9abdd83158602e0b7956a481028416821cfc9b66f58a';

describe('P1 review cannot invalidate current saved authority', () => {
  it('pins current lookup identity and transitive Stage-4 identity to original V1.3', () => {
    expect(ECR_STAGE3_STAGE4_OPTIMIZER_VERSION).toBe(originalVersion);
    expect(ECR_STAGE3_STAGE4_OPTIMIZER_HASH).toBe(originalHash);
    expect(STAGE4_OPTIMIZED_HETS_IMPLEMENTATION_HASH).toBe(originalStage4Hash);
    expect(ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_VERSION).toBe('ECR_STAGE3_STAGE4_OPTIMIZER_V1.4.0');
    expect(ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_HASH).not.toBe(originalHash);
  });
  it('keeps current-authority lookup and admission separate from P1 candidate routing', () => {
    for (const path of [
      'server/ecr-pre-pilot-service.ts',
      'server/ecr-pre-pilot/stage4-pre-pilot-sizing-service.ts',
    ]) {
      const source = readFileSync(path, 'utf8');
      expect(source).not.toContain('P1ForReview');
      expect(source).not.toContain('P1_REVIEW_VERSION');
      expect(source).toContain("AND result_snapshot->'engine'->>'version'=$4");
      expect(source).toContain('ECR_STAGE3_STAGE4_OPTIMIZER_VERSION, ECR_STAGE3_STAGE4_OPTIMIZER_HASH');
    }
    expect(readFileSync('server/ecr-pre-pilot-service.ts', 'utf8')).toContain("result_snapshot->>'candidateKind' IS DISTINCT FROM 'RRBO_P1_CANDIDATE_ONLY'");
    const source = readFileSync('server/ecr-pre-pilot/stage3-stage4-optimizer.ts', 'utf8');
    const currentDispatcher = source.slice(source.indexOf('export function optimizeStage3Stage4('), source.indexOf('export function replayLegacyStage3Stage4('));
    expect(currentDispatcher).toContain("optimizeStage3Stage4Internal(basis, stage1SnapshotHash, rawControls, 'CORRECTED')");
    expect(source).toContain('p1Review = false');
    expect(source).toContain('const correctedReverse = p1Review &&');
  });
  it('still admits a synthetic immutable V1.3 geometry and does not promote P1 review geometry', () => {
    const stage1Hash = 'a'.repeat(64);
    const input: any = { stage3: {
      id: 'fixture-only-not-persisted', immutableHash: 'b'.repeat(64), stage1SnapshotHash: stage1Hash,
      result: {
        engine: { version: originalVersion, implementationHash: originalHash },
        stage1Authority: { snapshotHash: stage1Hash }, processBasis: { stage1SnapshotHash: stage1Hash },
        stage4GeometryInput: {
          status: 'SELECTED_IMMUTABLE_OPTIMIZER_GEOMETRY', columnDiameterM: 1.2,
          compartmentHeightM: .36, hcToColumn: .30, rotorDiameterM: .396,
          rotorToColumn: .33, freeArea: .30, rpm: 40, optimizerResultHash: 'c'.repeat(64),
        },
      },
    }};
    const before = JSON.stringify(input);
    const projection = deriveStage4PrePilotSizing(input);
    expect(projection.currentOptimizer?.version).toBe(originalVersion);
    expect(projection.implementation.implementationHash).toBe(originalStage4Hash);
    expect(projection.selectedStage3Hydraulics.stage3RunId).toBe('fixture-only-not-persisted');
    expect(JSON.stringify(input)).toBe(before);
    const review = structuredClone(input);
    review.stage3.result.engine = {
      version: ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_VERSION,
      implementationHash: ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_HASH,
    };
    expect(() => deriveStage4PrePilotSizing(review)).toThrow('STAGE4_VALID_CURRENT_STAGE3_SELECTED_HYDRAULICS_REQUIRED');
    expect(pool.query).not.toHaveBeenCalled();
  });
});