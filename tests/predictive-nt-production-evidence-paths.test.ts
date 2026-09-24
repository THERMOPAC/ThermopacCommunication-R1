import { createHash } from 'node:crypto';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const { databaseClient, connectDatabase } = vi.hoisted(() => {
  const databaseClient = { query: vi.fn(), release: vi.fn() };
  return { databaseClient, connectDatabase: vi.fn().mockResolvedValue(databaseClient) };
});
vi.mock('../server/db', () => ({
  pool: { connect: connectDatabase, query: vi.fn() },
}));

import {
  resolvePredictiveNtFrozenRuntimePath,
  resolveStage1SixComponentCosmoSacBinding,
  verifyStage1SixComponentCosmoSacProfileFiles,
} from '../server/ecr-pre-pilot/six-component-cosmo-sac-basis';
import { frozenMolecularBasis } from '../server/ecr-pre-pilot/predictive-nt-report-evidence';
import { generatePredictiveNtReport } from '../server/ecr-pre-pilot/predictive-nt-report';
import {
  derivePredictiveNtInputFromStage1,
  enqueuePredictiveNtJobFromSavedStage1,
  validatePredictiveNtJobInput,
} from '../server/ecr-pre-pilot/predictive-nt-job-service';
import {
  canonicalizeStage1Input,
  makeStage1Snapshot,
} from '../server/ecr-pre-pilot/stage1';

const repositoryRoot = process.cwd();
const runtimeRelative = 'dist/predictive-nt-runtime-7c-1-6';
const packagedRuntime = path.join(repositoryRoot, runtimeRelative);
const runtimeManifestSha256 =
  '2482213baab825170ffd9af67b66319674095f5864a9ceccb897b25a5b72e017';
const sixManifestPath =
  'server/research/ecr-pre-pilot-six-component-thermodynamics/generated/generation-manifest.json';
const h2oManifestPath =
  'server/research/ecr-pre-pilot-seven-component-h2o-profile/generated/generation-manifest.json';
const integrity = {
  sixGenerationManifestSha256:
    '65baa44c36ffae817e52f60a32591f3fc1be7c140517c8b37c95458c834d1fa9',
  h2oGenerationManifestSha256:
    '943b753db28b910e1b672f74571769ec09a781009deccc88db151b64fb780eba',
  profileSha256ByFamily: {
    SAT: '6f51a75fbfa70df9b410fae88614e5c27d003eea228bc91318edb2854b5c26c2',
    MONO: '0afc9a2a69c0f3c7827ecdd7553f7ebf1a6e35f8b64597ffc8a6b780c324c275',
    DI: '7e8664f594afa70a232f845dfafbfbb1efd2e10e13c586187b556102a97503ed',
    POLY: '682828484416f124e3207f246d23954197502cba83d9b4744ace239d91fe8854',
    PA: '474736e63fd99749f7dad0cd5569959e9dd47a8a2dfe55b6ef80642ed3d1c03e',
    NMP: '58dcecc755994f7955aec100dfb26de62c3ad933dcfd25c11f68ddec3b1efa69',
    H2O: '82fc9cc17f71b4b8d28db01b7a25453ae03bea66b4af8adc21d4b85615cd7bb1',
  },
};
const savedStage1 = {
  projectReference: '2643',
  rrboGrade: 'SN300',
  designFeedRateLph: 1000,
  operatingTemperatureC: 50,
  operatingPressure: '2.0',
  phaseConfiguration: 'nmp-continuous-rrbo-dispersed',
  saturatesWt: 65,
  monoAromaticsWt: 20,
  diAromaticsWt: 5,
  polyAromaticsWt: 3,
  polarAromaticsWt: 5,
  nmpInFeedWt: 2,
  rrboDensityKgM3: 850,
  rrboDynamicViscosityCp: 20,
  rrboInterfacialTensionMnM: 8,
  nmpPurityWt: 99.5,
  nmpWaterWt: 0.5,
  nmpTemperatureC: 50,
  nmpDensityKgM3: 1000,
  nmpDynamicViscosityCp: 1.2,
  solventOilRatio: 1.5,
  targetRaffinateSulfurPpm: 1000,
  minimumRaffinateSaturatesWt: 90,
  targetRaffinateTotalAromaticsWt: 10,
  targetRaffinatePolarAromaticsWt: 0.5,
  minimumRecoveryPct: 90,
  maximumNmpRaffinateWt: 1,
  feedSulfurPpm: 3500,
  sulfurAllocationSatPct: 0,
  sulfurAllocationMonoPct: 20,
  sulfurAllocationDiPct: 30,
  sulfurAllocationPolyPct: 40,
  sulfurAllocationPaPct: 10,
  designBasisNotes: 'Production packaged-evidence boundary fixture',
  satIdentity: 'n-dodecane',
  monoIdentity: 'n-propylbenzene',
  maximumStages: 10,
} as const;

async function textFromPdf(pdf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: pdf });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

describe('Predictive N_T frozen production evidence paths', () => {
  let fixtureRoot: string;
  let previousNodeEnv: string | undefined;

  beforeAll(() => {
    expect(createHash('sha256').update(readFileSync(
      path.join(packagedRuntime, 'predictive-nt-runtime-manifest.json'),
    )).digest('hex')).toBe(runtimeManifestSha256);
    fixtureRoot = mkdtempSync(path.join(tmpdir(), 'predictive-nt-evidence-runtime-'));
    mkdirSync(path.join(fixtureRoot, 'dist'), { recursive: true });
    cpSync(packagedRuntime, path.join(fixtureRoot, runtimeRelative), { recursive: true });
    expect(existsSync(path.join(fixtureRoot, 'server'))).toBe(false);
    previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.chdir(fixtureRoot);
  }, 60_000);

  afterAll(() => {
    process.chdir(repositoryRoot);
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('rejects invalid runtime path inputs and confines a job path to the current production bundle', () => {
    expect(resolvePredictiveNtFrozenRuntimePath(sixManifestPath)).toBe(
      path.join(fixtureRoot, runtimeRelative, sixManifestPath),
    );
    for (const invalid of ['', '..', '../outside', 'server/../outside', '/absolute', '\\absolute']) {
      expect(() => resolvePredictiveNtFrozenRuntimePath(invalid))
        .toThrow('PREDICTIVE_NT_FROZEN_RUNTIME_PATH_INVALID');
    }
    expect(() => resolvePredictiveNtFrozenRuntimePath(null as unknown as string))
      .toThrow('PREDICTIVE_NT_FROZEN_RUNTIME_PATH_INVALID');
  });

  it('uses packaged profiles at the production job boundary while preserving an injected reader', () => {
    const binding = resolveStage1SixComponentCosmoSacBinding({
      satIdentity: 'n-dodecane',
      monoIdentity: 'n-propylbenzene',
    });
    expect(() => verifyStage1SixComponentCosmoSacProfileFiles(binding)).not.toThrow();

    const requested: string[] = [];
    verifyStage1SixComponentCosmoSacProfileFiles(binding, (relativePath) => {
      requested.push(relativePath);
      return readFileSync(path.join(fixtureRoot, runtimeRelative, relativePath));
    });
    expect(requested).toEqual(binding.components.map(component => component.profile.path));
  });

  it('derives and validates the actual production job input using only packaged profiles', () => {
    const snapshot = makeStage1Snapshot(canonicalizeStage1Input(savedStage1, 2643));
    const input = derivePredictiveNtInputFromStage1(snapshot, 2643);
    expect(input.engineContractVersion).toBe('7C-1.6.0');
    expect(() => validatePredictiveNtJobInput(input)).not.toThrow();

    const satProfile = path.join(
      fixtureRoot,
      runtimeRelative,
      input.stage1Authority!.source.sixComponentCosmoSacBinding.components[0].profile.path!,
    );
    const bytes = readFileSync(satProfile);
    unlinkSync(satProfile);
    try {
      expect(() => derivePredictiveNtInputFromStage1(snapshot, 2643))
        .toThrow('SIX_COMPONENT_COSMO_SAC_SAT_PROFILE_FILE_MISSING');
      expect(() => validatePredictiveNtJobInput(input))
        .toThrow('SIX_COMPONENT_COSMO_SAC_SAT_PROFILE_FILE_MISSING');
    } finally {
      writeFileSync(satProfile, bytes);
    }
  });

  it('crosses the saved-Stage-1 enqueue boundary with a mocked DB and stops before insert or solve', async () => {
    const snapshot = makeStage1Snapshot(canonicalizeStage1Input(savedStage1, 2643));
    databaseClient.query.mockReset();
    databaseClient.release.mockReset();
    connectDatabase.mockClear();
    databaseClient.query.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK' || sql.includes('pg_advisory_xact_lock')) {
        return { rows: [] };
      }
      if (sql.includes('FROM ecr_pre_pilot_designs')) {
        return { rows: [{ id: 53, project_number: 2643, input_data: snapshot }] };
      }
      if (sql.includes('COUNT(*)::int AS total')) {
        return { rows: [{ total: 10, user_total: 0 }] };
      }
      throw new Error(`UNEXPECTED_TEST_QUERY:${sql}`);
    });

    await expect(enqueuePredictiveNtJobFromSavedStage1(71, 53))
      .rejects.toThrow('PREDICTIVE_NT_QUEUE_FULL');
    expect(connectDatabase).toHaveBeenCalledOnce();
    expect(databaseClient.query.mock.calls.some(([sql]) => String(sql).includes(
      'INSERT INTO ecr_pre_pilot_predictive_nt_jobs',
    ))).toBe(false);
    expect(databaseClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(databaseClient.release).toHaveBeenCalledOnce();
  });

  it('reads both packaged generation manifests and renders their molecular evidence in a real PDF', async () => {
    const result = {
      trials: [],
      componentOrder: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'],
      engineContractVersion: '7C-1.6.0',
      scientificIntegrity: integrity,
    };
    const molecular = await frozenMolecularBasis({}, result);
    expect(molecular.components.find(component => component.family === 'SAT')?.name)
      .toBe('N-DODECANE');
    expect(molecular.components.find(component => component.family === 'H2O')?.name)
      .toBe('WATER');
    expect(molecular.provenance).toContainEqual(['Hash-verified source', sixManifestPath]);
    expect(molecular.provenance).toContainEqual(['Hash-verified source', h2oManifestPath]);

    const pdf = await generatePredictiveNtReport({
      id: 'production-evidence-fixture',
      projectNumber: 2643,
      modelHash: 'a'.repeat(64),
      engineHash: 'b'.repeat(64),
      completedAt: '2026-01-01T00:00:00.000Z',
      input: {},
      result,
    });
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    const text = await textFromPdf(pdf);
    expect(text).toContain('N-DODECANE');
    expect(text).toContain('WATER');
    expect(text).toContain(
      'server/research/ecr-pre-pilot-six-component-thermodynamics/generated/',
    );
    expect(text).toContain(
      'server/research/ecr-pre-pilot-seven-component-h2o-profile/generated/generation-',
    );
    expect(text).toContain(integrity.sixGenerationManifestSha256);
    expect(text).toContain(integrity.h2oGenerationManifestSha256);
  }, 30_000);

  it('fails closed for missing or corrupt packaged evidence without consulting source paths', async () => {
    const binding = resolveStage1SixComponentCosmoSacBinding({
      satIdentity: 'n-dodecane',
      monoIdentity: 'n-propylbenzene',
    });
    const profilePath = path.join(
      fixtureRoot, runtimeRelative, binding.components[0].profile.path!,
    );
    const profileBytes = readFileSync(profilePath);
    unlinkSync(profilePath);
    expect(() => verifyStage1SixComponentCosmoSacProfileFiles(binding))
      .toThrow('SIX_COMPONENT_COSMO_SAC_SAT_PROFILE_FILE_MISSING');
    writeFileSync(profilePath, profileBytes);
    writeFileSync(profilePath, 'corrupt packaged profile');
    expect(() => verifyStage1SixComponentCosmoSacProfileFiles(binding))
      .toThrow('SIX_COMPONENT_COSMO_SAC_SAT_PROFILE_HASH_MISMATCH');
    writeFileSync(profilePath, profileBytes);

    const manifestPath = path.join(fixtureRoot, runtimeRelative, sixManifestPath);
    const manifestBytes = readFileSync(manifestPath);
    writeFileSync(manifestPath, 'corrupt packaged manifest');
    const molecular = await frozenMolecularBasis(
      {},
      { componentOrder: ['SAT'], scientificIntegrity: integrity },
    );
    expect(molecular.provenance.some(([, value]) => value.includes('HASH MISMATCH'))).toBe(true);
    expect(molecular.components[0].name).not.toBe('N-DODECANE');
    writeFileSync(manifestPath, manifestBytes);

    unlinkSync(manifestPath);
    const sourcePath = path.join(fixtureRoot, sixManifestPath);
    mkdirSync(path.dirname(sourcePath), { recursive: true });
    writeFileSync(sourcePath, manifestBytes);
    try {
      const missing = await frozenMolecularBasis(
        {},
        { componentOrder: ['SAT'], scientificIntegrity: integrity },
      );
      expect(missing.provenance.some(([, value]) => value.includes(
        `${sixManifestPath}: unavailable`,
      ))).toBe(true);
      expect(missing.components[0].name).not.toBe('N-DODECANE');
    } finally {
      writeFileSync(manifestPath, manifestBytes);
      rmSync(path.join(fixtureRoot, 'server'), { recursive: true, force: true });
    }
  });

  it('leaves development resolution unchanged at the cwd source-relative path', () => {
    process.env.NODE_ENV = 'development';
    expect(resolvePredictiveNtFrozenRuntimePath(sixManifestPath))
      .toBe(path.join(fixtureRoot, sixManifestPath));
    expect(existsSync(path.join(fixtureRoot, 'server'))).toBe(false);
    process.env.NODE_ENV = 'production';
  });
});