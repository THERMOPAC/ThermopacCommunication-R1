import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ECR pre-pilot Job C queue governance', () => {
  it('rebuilds every current dependency pin before starting Job C Python', () => {
    const source = readFileSync('server/ecr-pre-pilot/job-c-job-service.ts', 'utf8');
    const revalidation = source.indexOf('currentPrepared = await prepareEcrPrePilotJobC');
    const execution = source.indexOf('const result = await executePreparedEcrPrePilotJobC');
    expect(revalidation).toBeGreaterThan(0);
    expect(execution).toBeGreaterThan(revalidation);
    expect(source).toContain('COMPLETE_PREPARED_DEPENDENCY_SNAPSHOT_CHANGED');
    expect(source).toContain('currentPreparedHash !== frozenPreparedHash');
    expect(source).toContain("event: final.rows[0].status");
  });

  it('maps boundary-state enqueue blocks to conflict and worker blocks to blocked', () => {
    const routes = readFileSync('server/ecr-pre-pilot/routes.ts', 'utf8');
    const queue = readFileSync('server/ecr-pre-pilot/job-c-job-service.ts', 'utf8');
    expect(routes).toContain("message.startsWith('JOB_B_BOUNDARY_STATE_BLOCKED:') ? 409");
    expect(queue).toContain("result.status === 'BLOCKED_PRELIMINARY_JOB_C'");
    expect(queue).toContain("blocked ? 'blocked' : 'completed'");
  });
});