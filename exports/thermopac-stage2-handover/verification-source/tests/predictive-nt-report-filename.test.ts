import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../server/db', () => ({
  pool: { query },
}));

import {
  authoritativePredictiveNtProjectNumber,
  getPredictiveNtJobReport,
  mapPredictiveNtJobRow,
  predictiveNtReportFilenameForOwnedJob,
} from '../server/ecr-pre-pilot/predictive-nt-job-service';

const jobId = 'ac6dce36-9ca1-482d-8047-7b28cfbbe718';
const expectedFilename = `Project-2643-Predictive-NT-Run-${jobId}.pdf`;

function completedReportRow(overrides: Record<string, unknown> = {}) {
  return {
    id: jobId,
    design_id: 53,
    created_by: 71,
    model_hash: 'a'.repeat(64),
    engine_hash: 'b'.repeat(64),
    status: 'completed',
    created_at: '2026-01-01T00:00:00.000Z',
    started_at: '2026-01-01T00:01:00.000Z',
    completed_at: '2026-01-01T00:02:00.000Z',
    input_snapshot: {},
    completed_trials: 10,
    maximum_stages: 10,
    result_snapshot: {},
    report_pdf: Buffer.from('%PDF-frozen-scientific-snapshot'),
    report_filename: `Project-NaN-Predictive-NT-Run-${jobId}.pdf`,
    report_sha256: 'c'.repeat(64),
    report_generated_at: '2026-01-01T00:02:00.000Z',
    error: null,
    project_number: 2643,
    ...overrides,
  };
}

describe('Predictive N_T report filenames', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('uses the joined owned-design number for a reloaded completed row, not a persisted NaN filename', () => {
    const row = completedReportRow();
    const before = JSON.stringify(row);

    const job = mapPredictiveNtJobRow(row);

    expect(job.report).toMatchObject({
      available: true,
      filename: expectedFilename,
      downloadUrl: `/api/ecr-pre-pilot/designs/53/predictive-nt/jobs/${jobId}/report`,
    });
    // Reading metadata repairs neither the immutable scientific snapshot nor
    // the legacy column; the download name is derived on demand.
    expect(JSON.stringify(row)).toBe(before);
  });

  it.each([2643, '2643', 2643n])(
    'accepts positive integer owned-design project number %s',
    (project_number) => {
      expect(authoritativePredictiveNtProjectNumber({ project_number })).toBe(2643);
      expect(predictiveNtReportFilenameForOwnedJob({ id: jobId, project_number }))
        .toBe(expectedFilename);
    },
  );

  it.each([undefined, null, Number.NaN, 0, -1, 2643.5, 'NaN'])(
    'fails clearly for an invalid reloaded project number %s rather than emitting NaN',
    (project_number) => {
      expect(() => predictiveNtReportFilenameForOwnedJob({ id: jobId, project_number }))
        .toThrow('PREDICTIVE_NT_REPORT_PROJECT_NUMBER_INVALID');
    },
  );

  it('refreshes presentation from owned frozen evidence without changing the archived PDF or writing data', async () => {
    const row = completedReportRow({ result_snapshot: { trials: [], componentOrder: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP'] } });
    const before = JSON.stringify(row);
    query.mockResolvedValueOnce({ rows: [row] });

    const report = await getPredictiveNtJobReport(jobId, 71, 53);

    expect(report).toMatchObject({
      filename: expectedFilename,
    });
    expect(report?.pdf.toString('latin1')).toMatch(/^%PDF/);
    expect(report?.pdf.equals(row.report_pdf)).toBe(false);
    expect(report?.sha256).toBe(createHash('sha256').update(report!.pdf).digest('hex'));
    expect(JSON.stringify(row)).toBe(before);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('job.input_snapshot, job.result_snapshot');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('JOIN ecr_pre_pilot_designs AS design'),
      [jobId, 71, 53],
    );
    expect(query.mock.calls[0][0]).toContain('design.created_by = job.created_by');
  });

  it('does not expose a report when the owned-design join rejects a cross-design request', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(getPredictiveNtJobReport(jobId, 71, 54)).resolves.toBeNull();
    expect(query).toHaveBeenCalledWith(expect.any(String), [jobId, 71, 54]);
    expect(query.mock.calls[0][0]).toContain('job.design_id = $3');
    expect(query.mock.calls[0][0]).toContain('design.created_by = job.created_by');
  });
});