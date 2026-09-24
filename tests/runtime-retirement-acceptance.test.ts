import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertCurrentPredictiveNtExecution,
  enqueuePredictiveNtRuntimeTestJob,
  preflightPredictiveNtRuntime,
} from '../server/ecr-pre-pilot/predictive-nt-job-service';

const retainedRoot = 'dist/predictive-nt-runtime-7c-1-6';
const retiredRuntimeRoots = [
  'dist/predictive-nt-runtime',
  'dist/predictive-nt-runtime-7c',
  'dist/predictive-nt-runtime-7c-1-2',
  'dist/predictive-nt-runtime-7c-1-3',
  'dist/predictive-nt-runtime-7c-1-4',
  'dist/predictive-nt-runtime-7c-1-5',
];
const retiredAdapterRoots = [
  'dist/job-b-interface-runtime',
  'dist/job-c-runtime',
  'dist/stage4-job-b-dogbox-runtime',
  'dist/stage4-seven-component-adapter-runtime',
];

const sha256 = (value: Buffer | string) =>
  createHash('sha256').update(value).digest('hex');

describe('scientific runtime retirement production acceptance', () => {
  it('ships the byte-identical 7C-1.6 runtime as the only standalone scientific runtime', () => {
    expect(existsSync(retainedRoot)).toBe(true);
    for (const root of [...retiredRuntimeRoots, ...retiredAdapterRoots]) {
      expect(existsSync(root), `${root} must not be deployed`).toBe(false);
    }

    const manifestPath = join(retainedRoot, 'predictive-nt-runtime-manifest.json');
    const manifestBytes = readFileSync(manifestPath);
    expect(sha256(manifestBytes))
      .toBe('2482213baab825170ffd9af67b66319674095f5864a9ceccb897b25a5b72e017');

    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    expect(manifest).toMatchObject({
      schemaVersion: 'PREDICTIVE_NT_RUNTIME_MANIFEST_V1',
      hashAlgorithm: 'sha256',
      fileCount: 2349,
      aggregateSha256: '617d26175b5355418ed5b987eb1655bff571dfbc039455b1a4891f35b98652d0',
    });
    expect(manifest.files).toHaveLength(manifest.fileCount);
    const aggregate = manifest.files
      .map((file: any) => `${file.path}:${file.bytes}:${file.sha256}`)
      .join('\n');
    expect(sha256(aggregate)).toBe(manifest.aggregateSha256);

    // Check every frozen file, not only the manifest's self-reported aggregate.
    for (const file of manifest.files) {
      const deployedPath = join(retainedRoot, file.path);
      expect(statSync(deployedPath).size, file.path).toBe(file.bytes);
      expect(sha256(readFileSync(deployedPath)), file.path).toBe(file.sha256);
    }
    expect(readdirSync('dist').filter(name =>
      name.startsWith('predictive-nt-runtime'))).toEqual([
      'predictive-nt-runtime-7c-1-6',
    ]);
  });

  it('binds production preflight, enqueue and claim to current 7C-1.6 only', async () => {
    const service = readFileSync(
      'server/ecr-pre-pilot/predictive-nt-job-service.ts',
      'utf8',
    );

    const evidence = preflightPredictiveNtRuntime();
    expect(evidence).toMatchObject({
      engineContractVersion: '7C-1.6.0',
      engineHash: 'ff35a410554e3f30bb43715691752fdc2f6a016a4689c885bf91272a17c7b486',
    });
    expect(() => assertCurrentPredictiveNtExecution({
      engineContractVersion: '7C-1.6.0',
    })).not.toThrow();
    for (const contract of [
      undefined,
      '6C-1.0.0',
      '7C-1.1.0',
      '7C-1.2.0',
      '7C-1.3.0',
      '7C-1.4.0',
      '7C-1.5.0',
    ]) {
      expect(() => assertCurrentPredictiveNtExecution({
        engineContractVersion: contract as any,
      })).toThrow('PREDICTIVE_NT_ENGINE_CONTRACT_RETIRED');
      await expect(enqueuePredictiveNtRuntimeTestJob({
        engineContractVersion: contract,
      }, 1, 1)).rejects.toThrow('PREDICTIVE_NT_ENGINE_CONTRACT_RETIRED');
    }

    expect(service).toContain(`dist/predictive-nt-runtime-7c-1-6`);
    expect(service).toContain(
      'server/ecr-pre-pilot/predictive-nt-seven-component-v1-6/worker.py',
    );
    expect(service).toContain(`input_snapshot->>'engineContractVersion' = '7C-1.6.0'`);
    expect(service).toContain(`engineContractVersion: '7C-1.6.0'`);
    expect(service).toContain('currentRuntimeRoot()');
  });

  it('keeps historical result and Stage 3/4/5 report reads without relabelling snapshots', () => {
    const predictiveRoutes = readFileSync('server/ecr-pre-pilot/routes.ts', 'utf8');
    const stage5Routes = readFileSync(
      'server/ecr-pre-pilot/stage5-geometry-routes.ts',
      'utf8',
    );
    const reportEvidence = readFileSync(
      'server/ecr-pre-pilot/predictive-nt-report-evidence.ts',
      'utf8',
    );

    for (const route of [
      '/predictive-nt/jobs/latest',
      '/predictive-nt/jobs/:jobId',
      '/predictive-nt/jobs/:jobId/report',
      '/stage3-stage4-optimizer/runs',
      '/stage4/pre-pilot-sizing/latest',
    ]) expect(predictiveRoutes).toContain(route);
    for (const route of [
      '/revisions',
      '/:revisionId',
      '/export.pdf',
    ]) expect(stage5Routes).toContain(route);
    expect(stage5Routes).toContain("'design-data.pdf', 'audit-archive.pdf'");

    // Historical adapters must branch on the persisted contract. A blanket
    // assignment of 1.6 would destroy the audit identity of an old result.
    expect(reportEvidence).toContain('engineContractVersion');
    expect(reportEvidence).not.toMatch(
      /(?:result|snapshot)\.engineContractVersion\s*=\s*['"]7C-1\.6\.0['"]/,
    );
  });
});