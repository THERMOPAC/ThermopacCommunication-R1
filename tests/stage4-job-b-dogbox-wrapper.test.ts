import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Stage-4-only Job-B dogbox wrapper', () => {
  it('pins the immutable worker and fixes, rather than accepts, strategy selection', () => {
    const source = fs.readFileSync(
      'server/ecr-pre-pilot/job-b-interface-stage4-dogbox/worker.py', 'utf8',
    );
    expect(source).toContain('LEGACY_WORKER_SHA256 = "70229d3eacfde61d906f39bc3dec8a29387cabfc96944493ffb5318653e02f2d"');
    expect(source).toContain('solve_kwargs["method"] = "dogbox"');
    expect(source).toContain('solve_kwargs["x_scale"] = "jac"');
    expect(source).toContain('legacy.execute(request)');
    expect(source).not.toContain('request.get("strategy")');
  });

  it('records qualified exact coarse and refined production requests', () => {
    const evidence = JSON.parse(fs.readFileSync(
      'research/design269-stage4-dogbox-exact-request-qualification.json', 'utf8',
    ));
    expect(evidence.qualificationPassed).toBe(true);
    expect(evidence.cases.map((row: { mesh: string }) => row.mesh)).toEqual(['coarse', 'refined']);
    for (const row of evidence.cases) {
      expect(row.allOriginalWorkerSelectionGatesPassed).toBe(true);
      expect(row.response.selectedGateEvidence.numericalAccepted).toBe(true);
      expect(row.response.selectedGateEvidence.phaseSeparationAccepted).toBe(true);
      expect(row.response.selectedGateEvidence.phaseOrientationAccepted).toBe(true);
      expect(row.response.selectedGateEvidence.endpointStabilityAccepted).toBe(true);
    }
  });
});