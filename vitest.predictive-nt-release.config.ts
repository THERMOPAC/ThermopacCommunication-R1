import { defineConfig } from 'vitest/config';
import base from './vitest.config';

// This is an explicit release selection, not a name-pattern sweep: archive
// replay must not become a production requirement when another suite is added.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: [
      'tests/ecr-pre-pilot-nt-job.test.ts',
      'tests/predictive-nt-current-engine-gate.test.ts',
      'tests/predictive-nt-packaging-retirement.test.ts',
      'tests/runtime-retirement-acceptance.test.ts',
      'tests/ecr-pre-pilot-predictive-nt-report.test.ts',
      'tests/predictive-nt-report-evidence.test.ts',
      'tests/predictive-nt-report-filename.test.ts',
      'tests/predictive-nt-progress.test.ts',
      'tests/predictive-nt-stage-display.test.ts',
      'tests/predictive-nt-stage-verdict.test.ts',
    ],
    fileParallelism: false,
    maxWorkers: 1,
  },
});