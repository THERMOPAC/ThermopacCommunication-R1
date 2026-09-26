import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const read = (file: string) => readFileSync(file, 'utf8');
const retired = /ecr-pre-pilot|ecrPrePilot|ecr_pre_pilot|ecr-stage5|predictive-nt|p1-optimizer/;
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sources(file) : /\.(tsx?|mjs|sh|py)$/.test(file) ? [file] : [];
  });
}

describe('standalone five-stage retirement', () => {
  it('has no registered API, service or runnable workers', () => {
    expect(read('server/routes.ts')).not.toMatch(retired);
    expect(read('server/index.ts')).not.toMatch(retired);
    expect(existsSync('server/ecr-pre-pilot-service.ts')).toBe(false);
    for (const file of existsSync('server/ecr-pre-pilot') ? sources('server/ecr-pre-pilot') : []) {
      throw new Error(`Retired server source remains: ${file}`);
    }
  });

  it('has no client routes, navigation or module imports', () => {
    for (const file of sources('client/src')) expect(read(file), file).not.toMatch(retired);
  });

  it('cannot recreate the retired schema through normal startup or build hooks', () => {
    expect(read('shared/schema.ts')).not.toMatch(/ecrPrePilot|ecr_pre_pilot/);
    const scripts = JSON.parse(read('package.json')).scripts;
    for (const command of Object.values(scripts)) expect(command).not.toMatch(retired);
    for (const file of ['scripts/post-merge.sh', 'scripts/production-run.sh']) {
      expect(read(file)).not.toMatch(retired);
    }
    expect(existsSync('scripts/apply-ecr-pre-pilot-predictive-nt-schema.mjs')).toBe(false);
    expect(existsSync('scripts/package-predictive-nt-runtime.mjs')).toBe(false);
    expect(scripts.build).toMatch(/^node scripts\/clean-build-output\.mjs &&/);
  });

  it('preserves the separate LLX/ECR-2 implementation and route registration', () => {
    expect(read('server/routes.ts')).toContain('setupDesignSoftwareRoutes');
    expect(existsSync('server/engines/llx/llx-ecr2-counter-current-bvp.ts')).toBe(true);
    expect(existsSync('server/engines/llx/llx-ecr-simulator-engine.ts')).toBe(true);
    expect(readdirSync('shared').some(file => file.startsWith('ecr2'))).toBe(true);
    expect(read('shared/schema.ts')).toContain('designProjects');
  });
});