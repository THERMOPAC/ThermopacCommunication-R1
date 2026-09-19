import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../server/auth-middleware', () => ({ ensureAuthenticated: vi.fn() }));
vi.mock('../server/ecr-pre-pilot-service', () => ({}));
vi.mock('../server/ecr-pre-pilot/predictive-nt-job-service', () => ({}));
vi.mock('../server/ecr-pre-pilot/model', () => ({
  PRE_PILOT_MODEL: {},
  PRE_PILOT_MULTISTAGE_MODEL: {},
}));
vi.mock('../server/ecr-pre-pilot/six-component-cosmo-sac-basis', () => ({
  SIX_COMPONENT_COSMO_SAC_BASIS: {},
  SIX_COMPONENT_COSMO_SAC_BASIS_MANIFEST_SHA256: 'a'.repeat(64),
}));
vi.mock('../server/ecr-pre-pilot/kuhni-resolver-preview', () => ({}));
vi.mock('../server/ecr-pre-pilot/job-c-job-service', () => ({}));
vi.mock('../server/ecr-pre-pilot/partial-transfer-qualification-service', () => ({}));
vi.mock('../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service', () => ({}));

import { retiredEcrPrePilotResponse } from '../server/ecr-pre-pilot/routes';

const routes = readFileSync('server/ecr-pre-pilot/routes.ts', 'utf8');
const jobCQueue = readFileSync('server/ecr-pre-pilot/job-c-job-service.ts', 'utf8');
const partialQualification = readFileSync(
  'server/ecr-pre-pilot/partial-transfer-qualification-service.ts',
  'utf8',
);

describe('ECR pre-pilot retired backend boundary', () => {
  it('returns one explicit gone contract from every retired mutation route', () => {
    const capabilities = [
      'JOB_B_EVALUATION',
      'JOB_C_DIAGNOSTIC_ENQUEUE',
      'JOB_C_STRICT_DIAGNOSTIC_ENQUEUE',
      'JOB_C_STRICT_CONTINUATION_ENQUEUE',
      'JOB_C_ENQUEUE',
      'JOB_C_PHYSICAL_SIZING',
      'PARTIAL_TRANSFER_PHYSICAL_SIZING_SEARCH',
      'PARTIAL_TRANSFER_QUALIFICATION',
      'JOB_C_EVALUATION',
    ];
    expect(routes).toContain("res.status(410)");
    expect(routes).toContain("error: 'ECR_PRE_PILOT_JOB_RETIRED'");
    for (const capability of capabilities) {
      expect(routes).toContain(`retiredEcrPrePilotResponse(res, '${capability}')`);
    }
    expect(routes).toContain("'JOB_A_HISTORICAL_RESULT_UNAVAILABLE' : 'JOB_A_EVALUATION'");
  });

  it('emits the HTTP 410 JSON contract at runtime', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const response = { status } as any;

    retiredEcrPrePilotResponse(response, 'JOB_C_ENQUEUE');

    expect(status).toHaveBeenCalledWith(410);
    expect(json).toHaveBeenCalledWith({
      error: 'ECR_PRE_PILOT_JOB_RETIRED',
      capability: 'JOB_C_ENQUEUE',
      message: expect.stringContaining('Historical owned results remain read-only'),
    });
  });

  it('keeps owned historical reads and operational cancellation routes registered', () => {
    expect(routes).toContain("'/api/ecr-pre-pilot/designs/:id/job-c/jobs/latest'");
    expect(routes).toContain("'/api/ecr-pre-pilot/designs/:id/job-c/jobs/:jobId'");
    expect(routes).toContain("'/api/ecr-pre-pilot/designs/:id/job-c/jobs/:jobId/cancel'");
    expect(routes).toContain(
      "'/api/ecr-pre-pilot/designs/:id/partial-transfer-qualification/jobs/:jobId'",
    );
    expect(routes).toContain(
      "'/api/ecr-pre-pilot/designs/:id/partial-transfer-qualification/jobs/:jobId/cancel'",
    );
  });

  it('terminalizes active retired work without claiming it after restart', () => {
    expect(jobCQueue).toContain('export async function retireActiveJobCJobs()');
    expect(jobCQueue).toContain("WHERE status IN ('pending','running') RETURNING *");
    expect(jobCQueue).toContain("partialRetained: row.partial_result_snapshot != null");
    expect(jobCQueue).toContain("diagnosticsRetained: row.progress_snapshot != null");
    expect(jobCQueue).toContain('await retireActiveJobCJobs()');
    expect(jobCQueue).not.toContain('const timer = setInterval(() => void poll(), POLL_MS)');
    expect(jobCQueue).toContain('if (controller) controllersToAbort.push(controller)');
    expect(jobCQueue.indexOf("await client.query('COMMIT')"))
      .toBeLessThan(jobCQueue.indexOf('for (const controller of controllersToAbort)'));
  });

  it('prevents partial qualification restart and supports cross-process stop polling', () => {
    expect(partialQualification).toContain(
      'ECR_PRE_PILOT_PARTIAL_TRANSFER_QUALIFICATION_RETIRED',
    );
    expect(partialQualification).toContain(
      "WHERE status IN ('pending','running') RETURNING id",
    );
    expect(partialQualification).toContain('if (state.rows[0]?.status !== \'running\') controller.abort()');
    expect(partialQualification).toContain('activeControllers.get(row.id)?.abort()');
    expect(partialQualification).toContain(
      'await markInterruptedSinglePartialTransferQualifications()',
    );
    expect(partialQualification).toContain('Retirement cleanup failed; retrying:');
  });
});