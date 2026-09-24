import { configDefaults, defineConfig } from 'vitest/config';
import base from './vitest.config';

// Research-only execution against preserved source, never a release prerequisite.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    exclude: configDefaults.exclude,
    include: [
      'tests/**/*.archive.test.ts',
      'tests/ecr-pre-pilot-six-component-gate.test.ts',
      'tests/stage4-seven-component-adapter.integration.test.ts',
    ],
    fileParallelism: false,
    maxWorkers: 1,
  },
});