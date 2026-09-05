import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  evaluateSevenComponentLocalEquilibrium,
  generateSevenComponentReferenceDuty,
  preflightSevenComponentStage4Adapter,
  stage4SevenComponentAdapterArtifactHash,
  STAGE4_SEVEN_COMPONENT_ENGINE_ID,
  STAGE4_SEVEN_COMPONENT_ENGINE_VERSION,
  STAGE4_SEVEN_COMPONENT_ORDER,
} from '../server/ecr-pre-pilot/stage4-seven-component-adapter';
import {
  PRE_PILOT_MODEL,
  PRE_PILOT_MULTISTAGE_MODEL,
  PRE_PILOT_MULTISTAGE_MODEL_1_4,
} from '../server/ecr-pre-pilot/model';
import {
  loadValidatedCompletedSevenComponentNtForStage4,
} from '../server/ecr-pre-pilot/predictive-nt-job-service';

const root = path.resolve('dist/stage4-seven-component-adapter-runtime');
const componentOrder = [...STAGE4_SEVEN_COMPONENT_ORDER];
const feed = [85 / 170.3348, 7 / 120.194, 4 / 142.1971, 2 / 202.2506, 2 / 405.58, 0, 0];
const solvent = [0, 0, 0, 0, 0, 49 / 99.1311, 1 / 18.01528];
const total = feed.map((value, index) => value + solvent[index]);
const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const canonical = (value: any): string => Array.isArray(value)
  ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
    : JSON.stringify(value);
const attackerSealAdapter = (adapterRoot: string) => {
  const manifestPath = path.join(adapterRoot, 'stage4-seven-component-adapter-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const record of manifest.files) {
    const file = path.join(adapterRoot, record.path);
    record.bytes = fs.statSync(file).size;
    record.sha256 = sha(file);
  }
  manifest.aggregateSha256 = createHash('sha256').update(manifest.files.map((record: any) =>
    `${record.path}:${record.bytes}:${record.sha256}`).join('\n')).digest('hex');
  delete manifest.artifactSha256;
  manifest.artifactSha256 = createHash('sha256')
    .update(canonical(manifest)).digest('hex');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
};
let tamperRoot: string;
let tamperBase: string;

describe.sequential('governed Stage-4 7C-1.5 adapter (actual engine)', () => {
  beforeAll(() => {
    process.env.STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT = root;
    tamperRoot = fs.mkdtempSync(path.join(process.cwd(), 'stage4-tamper-'));
    tamperBase = path.join(tamperRoot, 'predictive-nt-runtime-7c-1-5');
    fs.cpSync('dist/predictive-nt-runtime-7c-1-5', tamperBase, { recursive: true });
  });
  afterAll(() => fs.rmSync(tamperRoot, { recursive: true, force: true }));

  it('binds its separate artifact without changing historical packages', async () => {
    const adapterManifest = JSON.parse(fs.readFileSync(
      path.join(root, 'stage4-seven-component-adapter-manifest.json'), 'utf8',
    ));
    const adapterFiles = fs.readdirSync(root, { recursive: true })
      .filter(entry => fs.statSync(path.join(root, entry.toString())).isFile())
      .map(String);
    expect(adapterManifest.fileCount).toBe(1);
    expect(adapterManifest.files.map((record: any) => record.path)).toEqual([
      'server/ecr-pre-pilot/stage4-seven-component-adapter/worker.py',
    ]);
    expect(adapterFiles).toHaveLength(2);
    expect(adapterManifest.baseRuntime.manifestSha256).toBe(
      sha('dist/predictive-nt-runtime-7c-1-5/predictive-nt-runtime-manifest.json'),
    );
    process.env.STAGE4_ADAPTER_TEST_SECRET = 'must-not-reach-worker';
    const preflight = await preflightSevenComponentStage4Adapter({ timeoutMs: 120_000 })
      .finally(() => { delete process.env.STAGE4_ADAPTER_TEST_SECRET; });
    expect(preflight.status).toBe('PASS');
    expect(preflight.engineId).toBe(STAGE4_SEVEN_COMPONENT_ENGINE_ID);
    expect(preflight.engineVersion).toBe(STAGE4_SEVEN_COMPONENT_ENGINE_VERSION);
    expect(preflight.launchEnvironmentKeys).not.toContain('DATABASE_URL');
    expect(preflight.launchEnvironmentKeys).not.toContain('SESSION_SECRET');
    expect(preflight.launchEnvironmentKeys).not.toContain('STAGE4_ADAPTER_TEST_SECRET');
    expect(stage4SevenComponentAdapterArtifactHash()).toMatch(/^[a-f0-9]{64}$/);
    expect([
      PRE_PILOT_MODEL.modelHash,
      PRE_PILOT_MULTISTAGE_MODEL_1_4.modelHash,
      PRE_PILOT_MULTISTAGE_MODEL.modelHash,
    ]).toEqual([
      '9666ff67194102ca9c3dc139695bead8ff133fbfe24c2d786ce1deca49456196',
      '5b226f456778a1b85b7813417800d4bc9fb0713066994baeb88de70977801691',
      'f165f0d23eeae810e40341f1cc86a2b97514bc21b74838d4a08eab1760e6e1af',
    ]);
    for (const [file, expected] of [
      ['dist/predictive-nt-runtime/predictive-nt-runtime-manifest.json',
        'a4e1a54633b4d0dcc102f642d12d090576695e5f5d221b139e9f2a664c751595'],
      ['dist/predictive-nt-runtime-7c/predictive-nt-runtime-manifest.json',
        'a5872e6a8186c4455000bb55b26dd61c60bc028bb4c4a7bcc88793c568862a58'],
      ['dist/predictive-nt-runtime-7c-1-2/predictive-nt-runtime-manifest.json',
        '50c4db1f8f5a956c39193750213979dc4d05e49398b6abd2522be54eb4eb92e2'],
      ['dist/predictive-nt-runtime-7c-1-3/predictive-nt-runtime-manifest.json',
        'a2f85ed199d4fdd45e43aad661ad6a784c6165276216a2ee6e2bfa182365facb'],
      ['dist/predictive-nt-runtime-7c-1-4/predictive-nt-runtime-manifest.json',
        '4cf9b18c901faf995daaefc6c68c2e17c812a8f628bb6f5132959fe707ba9105'],
      ['dist/predictive-nt-runtime-7c-1-5/predictive-nt-runtime-manifest.json',
        'f4e6e0156e6dc82dfaa3bf012a67ff143eb8cb45dd7c8208d9f924cec0d023fc'],
    ]) expect(sha(file)).toBe(expected);
  }, 120_000);

  it('rejects a self-consistently resealed attacker adapter worker', async () => {
    const attackerAdapter = path.join(tamperRoot, 'attacker-adapter-worker');
    fs.cpSync(root, attackerAdapter, { recursive: true });
    const worker = path.join(
      attackerAdapter, 'server/ecr-pre-pilot/stage4-seven-component-adapter/worker.py',
    );
    fs.appendFileSync(worker, '\n# attacker-controlled reseal\n');
    attackerSealAdapter(attackerAdapter);
    process.env.STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT = attackerAdapter;
    process.env.STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT = tamperBase;
    try {
      await expect(preflightSevenComponentStage4Adapter())
        .rejects.toThrow('STAGE4_ADAPTER_MANIFEST_IDENTITY_INVALID');
    } finally {
      process.env.STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT = root;
      delete process.env.STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT;
    }
  });

  it('rejects self-consistently resealed attacker base files and pins', async () => {
    const attackerAdapter = path.join(tamperRoot, 'attacker-base-pins-adapter');
    const attackerBase = tamperBase;
    fs.cpSync(root, attackerAdapter, { recursive: true });
    const baseManifestPath = path.join(attackerBase, 'predictive-nt-runtime-manifest.json');
    const baseManifest = JSON.parse(fs.readFileSync(baseManifestPath, 'utf8'));
    const workerRecord = baseManifest.files.find((record: any) =>
      record.path === 'server/ecr-pre-pilot/predictive-nt-seven-component-v1-5/worker.py');
    const worker = path.join(attackerBase, workerRecord.path);
    fs.appendFileSync(worker, '\n# attacker-controlled base reseal\n');
    workerRecord.bytes = fs.statSync(worker).size;
    workerRecord.sha256 = sha(worker);
    baseManifest.aggregateSha256 = createHash('sha256').update(
      baseManifest.files.map((record: any) =>
        `${record.path}:${record.bytes}:${record.sha256}`).join('\n'),
    ).digest('hex');
    fs.writeFileSync(baseManifestPath, `${JSON.stringify(baseManifest, null, 2)}\n`);
    const adapterManifestPath = path.join(
      attackerAdapter, 'stage4-seven-component-adapter-manifest.json',
    );
    const adapterManifest = JSON.parse(fs.readFileSync(adapterManifestPath, 'utf8'));
    adapterManifest.baseRuntime.manifestSha256 = sha(baseManifestPath);
    adapterManifest.baseRuntime.aggregateSha256 = baseManifest.aggregateSha256;
    adapterManifest.baseRuntime.activeWorkerSha256 = workerRecord.sha256;
    fs.writeFileSync(adapterManifestPath, `${JSON.stringify(adapterManifest, null, 2)}\n`);
    attackerSealAdapter(attackerAdapter);
    process.env.STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT = attackerAdapter;
    process.env.STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT = attackerBase;
    try {
      await expect(preflightSevenComponentStage4Adapter())
        .rejects.toThrow('STAGE4_ADAPTER_MANIFEST_IDENTITY_INVALID');
    } finally {
      process.env.STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT = root;
      delete process.env.STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT;
    }
  });

  it('closes and deterministically replays a physical local flash', async () => {
    const request = { temperatureK: 298.15, componentOrder, componentMolarInventory: total };
    const first = await evaluateSevenComponentLocalEquilibrium(request, { timeoutMs: 300_000 });
    const replay = await evaluateSevenComponentLocalEquilibrium(request, { timeoutMs: 300_000 });
    expect(first.status).toBe('CALCULATED');
    expect(replay.resultHash).toBe(first.resultHash);
    expect(first.phaseOrientation).toBe('NMP_RICH_EXTRACT');
    expect(first.betaExtract).toBeGreaterThan(0);
    expect(first.betaExtract).toBeLessThan(1);
    expect((first.gates as any).isoactivityLogResidual).toBeLessThanOrEqual(2e-5);
    expect((first.gates as any).materialBalanceResidual).toBeLessThanOrEqual(1e-8);
    expect((first.gates as any).postSplitTpd.raffinate.minimum).toBeGreaterThanOrEqual(-1e-8);
    expect((first.gates as any).postSplitTpd.extract.minimum).toBeGreaterThanOrEqual(-1e-8);
    const recovered = (first.raffinateComponentMoles as number[])
      .map((value, index) => value + (first.extractComponentMoles as number[])[index]);
    recovered.forEach((value, index) => expect(value).toBeCloseTo(total[index], 12));
  }, 700_000);

  it('rejects malformed seven-component state without fallback thermodynamics', async () => {
    const result = await evaluateSevenComponentLocalEquilibrium({
      temperatureK: 298.15, componentOrder, componentMolarInventory: [1, 2, 3, 4, 5],
    }, { timeoutMs: 120_000 });
    expect(result.status).toBe('FAILURE_INVALID_REQUEST');
    expect(result.error).toBe('INVALID_SEVEN_COMPONENT_MOLAR_INVENTORY');
  }, 120_000);

  it('runs the actual fallback cascade at exactly N_T=7', async () => {
    const fallback = await generateSevenComponentReferenceDuty({
      temperatureK: 298.15, componentOrder,
      continuousFeedComponentMoles: feed, dispersedFeedComponentMoles: solvent,
    }, { timeoutMs: 1_200_000 });
    expect(fallback.status).toBe('CALCULATED');
    expect(fallback.provenance).toBe('PRE_PILOT_DESIGN_DEFAULT');
    expect(fallback.theoreticalStages).toBe(7);
    expect(fallback.stage2ResultHash).toBeNull();
    const cascade = (fallback.duty as any).cascade;
    expect(cascade.stageCount).toBe(7);
    expect(cascade.accepted).toBe(true);
    expect(cascade.bothEndpointsClosed).toBe(true);
    expect(cascade.branchReproduced).toBe(true);
    expect(cascade.primaryMaximumScaledEquationResidual).toBeGreaterThanOrEqual(0);
    expect(cascade.secondaryMaximumScaledEquationResidual).toBeGreaterThanOrEqual(0);
    expect(cascade.stages).toHaveLength(7);
    for (const stage of cascade.stages) {
      expect(stage.maximumComponentBalanceResidualMol).toBeGreaterThanOrEqual(0);
      expect(stage.isoactivityLogResidual).toBeGreaterThanOrEqual(0);
      expect(stage.maximumCompositionSeparation).toBeGreaterThan(0);
      expect(stage.stageGibbsReduction).toBeGreaterThanOrEqual(0);
      for (const phase of ['raffinate', 'extract']) {
        expect(stage.localPostSplitStability[phase].stepSizeConverged).toBe(true);
        expect(stage.postSplitTpdSearch[phase].allRefinementsAccepted).toBe(true);
      }
    }
  }, 1_300_000);

  it('forbids caller-supplied calculated Stage-2 fields', async () => {
    const rejected = await generateSevenComponentReferenceDuty({
      temperatureK: 298.15, componentOrder,
      continuousFeedComponentMoles: feed, dispersedFeedComponentMoles: solvent,
      calculatedStage2Result: {
        status: 'CALCULATED', theoreticalStages: 6, resultHash: '0'.repeat(64),
      },
    } as any, { timeoutMs: 120_000 });
    expect(rejected.status).toBe('FAILURE_INVALID_REQUEST');
    expect(rejected.error).toBe('UNSUPPORTED_REFERENCE_DUTY_FIELD');
  }, 120_000);

  it('rejects an invalid trusted-loader identity before querying storage', async () => {
    await expect(loadValidatedCompletedSevenComponentNtForStage4('', 1, 1))
      .rejects.toThrow('STAGE4_STAGE2_JOB_REFERENCE_INVALID');
  });
});