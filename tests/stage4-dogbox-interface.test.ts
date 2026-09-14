import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyStage4DogboxRuntime } from '../server/ecr-pre-pilot/stage4-dogbox-interface';

const temporary: string[] = [];
afterEach(() => { while (temporary.length) fs.rmSync(temporary.pop()!, { recursive: true, force: true }); });

describe('Stage-4 dogbox runtime verifier', () => {
  it('accepts the dedicated pinned wrapper runtime', () => {
    expect(verifyStage4DogboxRuntime().manifest.numericalStrategy.id).toBe('STAGE4_DOGBOX_JAC_SCALED_V1');
  });

  it('rejects a manifest whose fixed strategy identity is tampered', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stage4-dogbox-manifest-'));
    temporary.push(root);
    fs.cpSync('dist/stage4-job-b-dogbox-runtime', root, { recursive: true });
    const manifestPath = path.join(root, 'stage4-job-b-dogbox-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.numericalStrategy.id = 'UNTRUSTED';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => verifyStage4DogboxRuntime(root)).toThrow('STAGE4_DOGBOX_MANIFEST_IDENTITY_INVALID');
  });
});