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

  it('serializes and narrowly scopes unchanged blocked-result reuse', () => {
    const routes = readFileSync('server/ecr-pre-pilot/routes.ts', 'utf8');
    const queue = readFileSync('server/ecr-pre-pilot/job-c-job-service.ts', 'utf8');
    expect(queue).toContain('pg_advisory_xact_lock');
    expect(queue).toContain("created_by=$1 AND design_id=$2");
    expect(queue).toContain("status='blocked' AND completed_at IS NOT NULL");
    expect(queue).toContain('result_snapshot IS NOT NULL');
    expect(queue).toContain("result_hash ~ '^[a-f0-9]{64}$'");
    expect(queue).toContain("status IN ('pending','running')");
    expect(queue).toContain('JOB_C_DEPENDENCY_BLOCKED:IDENTICAL_JOB_ALREADY_ACTIVE');
    expect(queue).toContain('input_hash=$3 AND implementation_hash=$4');
    expect(queue).toContain('candidate_hash=$5 AND job_b_engine_hash=$6');
    expect(queue).toContain('jobCBoundaryInterfaceQualifierSha256');
    expect(queue).toContain('boundaryBranchSourceStateSha256');
    expect(queue).toContain("reason: 'UNCHANGED_TERMINAL_BLOCKED_JOB_C'");
    expect(queue).toContain("event: 'enqueue_reused'");
    expect(routes).toContain("res.setHeader('X-Job-C-Reused'");
    expect(routes).toContain("message.includes('DEPENDENCY_BLOCKED:')");
  });
});