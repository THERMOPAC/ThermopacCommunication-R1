import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../server/ecr-pre-pilot/stage4-finite-rate-source-manifest.json';

describe('Stage 4 immutable calculation lineage', () => {
  it('binds the checked finite-rate source and tolerances rather than a version label alone', () => {
    for (const [file, expected] of Object.entries(manifest.files)) {
      const actual = createHash('sha256').update(readFileSync(file)).digest('hex');
      expect(actual, `${file}: refresh the source manifest after reviewed changes`).toBe(expected);
    }
  });
});