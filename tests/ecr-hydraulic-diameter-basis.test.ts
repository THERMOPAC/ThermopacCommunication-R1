import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('LLX frontend retirement dependency boundary', () => {
  it('removes only the retired interactive page files', () => {
    for (const name of ['design-software-list-page', 'design-software-workspace-page']) {
      expect(existsSync(resolve(process.cwd(), `client/src/pages/design-software/${name}.tsx`))).toBe(false);
    }
  });

  it('preserves the ECR Pre-Pilot shared droplet-diameter dependency', () => {
    expect(source('server/ecr-pre-pilot/kuhni-hydrodynamics.ts'))
      .toContain('../engines/llx/llx-ecr2-d32-interface');
    expect(existsSync(resolve(process.cwd(), 'server/engines/llx/llx-ecr2-d32-interface.ts'))).toBe(true);
  });

  it('retains reference-paper and historical-result presentation code and backend access', () => {
    for (const path of [
      'client/src/pages/design-software/reference-papers-section.tsx',
      'client/src/pages/design-software/ecr2-run-presentation.ts',
      'server/design-software-service.ts',
      'server/design-reports/report-service.ts',
    ]) {
      expect(existsSync(resolve(process.cwd(), path))).toBe(true);
    }
    const routes = source('server/design-software-routes.ts');
    expect(routes).toContain('/api/design-software/reference-papers');
    expect(routes).toContain('/api/design-software/revisions/:id/reports');
    expect(routes).toContain('/api/design-software/cps/sizing-cases');
  });
});