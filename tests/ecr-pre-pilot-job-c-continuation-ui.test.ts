import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  'client/src/pages/design-software/ecr-pre-pilot-design-stage-4-page.tsx',
  'utf8',
);

describe('Job C strict-anchor continuation UI', () => {
  it('keeps the explicit action available for server-side eligibility resolution', () => {
    expect(page).toContain('data-testid="run-full-job-c-from-strict-anchor"');
    expect(page).toContain(
      '/api/ecr-pre-pilot/designs/${id}/job-c/continuation/strict-anchor/jobs',
    );
    expect(page).not.toContain(
      '{hasVerifiedStrictDiagnosticAnchor(jobCJob) && <Button',
    );
  });
});