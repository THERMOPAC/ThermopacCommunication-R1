import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe.runIf(process.env.ISOLATED_NIX_SMOKE === '1')('active production configuration', () => {
  it('keeps development and module settings, and deduplicates Nix package roots', () => {
    const config = readFileSync(process.env.ACTIVE_REPLIT_PATH!, 'utf8');
    expect(config).toMatch(/^modules = \["nodejs-20", "web", "python-3\.12", "postgresql-16"\]$/m);
    expect(config).toMatch(/^run = "npm run dev"$/m);
    expect(config).toMatch(/\[nix\]\s*channel = "stable-24_05"\s*packages = \[\]/);
    expect(config).toMatch(/build = \["npm", "run", "build"\]/);
    expect(config).toMatch(/run = \["sh", "scripts\/production-run\.sh"\]/);
    const nix = readFileSync('replit.nix', 'utf8');
    for (const root of ['python312', 'zlib', 'chromium',
      'poppler_utils', 'which', 'glibcLocales']) {
      expect(nix).toContain(`pkgs.${root}`);
    }
    expect(nix).not.toContain('stdenv.cc.cc.lib');
    expect(nix).not.toContain('python312Packages');
    const build = JSON.parse(readFileSync('package.json', 'utf8')).scripts.build as string;
    expect(build.indexOf('node scripts/package-predictive-nt-runtime.mjs'))
      .toBeLessThan(build.indexOf('node scripts/prepare-production-runtime.mjs'));
    expect(build.indexOf('node scripts/prepare-production-runtime.mjs'))
      .toBeLessThan(build.indexOf('node scripts/publish-size-diagnostics.mjs'));
  });
});