import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SIX_COMPONENT_COSMO_SAC_BASIS,
  SIX_COMPONENT_COSMO_SAC_BASIS_MANIFEST_SHA256,
  SIX_COMPONENT_COSMO_SAC_ORDER,
  resolveStage1SixComponentCosmoSacBinding,
  validateSixComponentCosmoSacBasis,
  verifyStage1SixComponentCosmoSacProfileFiles,
} from '../server/ecr-pre-pilot/six-component-cosmo-sac-basis';
import {
  makeStage1Snapshot,
  validateStage1Snapshot,
  type EcrPrePilotStage1Input,
} from '../server/ecr-pre-pilot/stage1';
import {
  attachStage1ResultGovernance,
  derivePredictiveNtInputFromStage1,
  deriveSixComponentCosmoSacRemoval,
} from '../server/ecr-pre-pilot/predictive-nt-job-service';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const savedStage1: EcrPrePilotStage1Input = {
  projectReference: '209',
  rrboGrade: 'SN300', designFeedRateLph: 1000, operatingTemperatureC: 50,
  operatingPressure: '2.0', phaseConfiguration: 'nmp-continuous-rrbo-dispersed',
  saturatesWt: 70, monoAromaticsWt: 30, diAromaticsWt: 0, polyAromaticsWt: 0,
  polarAromaticsWt: 0, nmpInFeedWt: 0, rrboDensityKgM3: 850,
  rrboDynamicViscosityCp: 20, rrboInterfacialTensionMnM: 8, nmpPurityWt: 99.5,
  nmpWaterWt: 0.05, nmpTemperatureC: 50, nmpDensityKgM3: 1000,
  nmpDynamicViscosityCp: 1.2, solventOilRatio: 1,
  targetRaffinateSulfurPpm: 1000, minimumRaffinateSaturatesWt: 90,
  targetRaffinateTotalAromaticsWt: 10, targetRaffinatePolarAromaticsWt: 0.5,
  minimumRecoveryPct: 95, maximumNmpRaffinateWt: 0.5, feedSulfurPpm: 3500,
  designBasisNotes: 'complete fixture', satIdentity: 'n-dodecane',
  monoIdentity: 'n-propylbenzene', maximumStages: 10,
};

describe('six-component COSMO-SAC gate contract', () => {
  function runSixComponentPreflight(stage1: EcrPrePilotStage1Input): {
    status: number;
    stdout: string;
    stderr: string;
  } {
    const directory = mkdtempSync(join(tmpdir(), 'ecr-stage1-'));
    const snapshotPath = join(directory, 'stage1.json');
    writeFileSync(snapshotPath, JSON.stringify(makeStage1Snapshot(stage1)));
    try {
      const stdout = execFileSync('python3', [
        'server/research/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent/run.py',
        '--stage1-snapshot', snapshotPath,
        '--preflight-only',
      ], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { status: 0, stdout, stderr: '' };
    } catch (error: any) {
      return {
        status: Number(error.status ?? 1),
        stdout: String(error.stdout ?? ''),
        stderr: String(error.stderr ?? ''),
      };
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  it('freezes the exact SAT, MONO, DI, POLY, PA, NMP order and stable hash', () => {
    expect(SIX_COMPONENT_COSMO_SAC_BASIS.componentOrder).toEqual(SIX_COMPONENT_COSMO_SAC_ORDER);
    expect(SIX_COMPONENT_COSMO_SAC_BASIS.components.map(({ family }) => family))
      .toEqual(SIX_COMPONENT_COSMO_SAC_ORDER);
    expect(SIX_COMPONENT_COSMO_SAC_BASIS_MANIFEST_SHA256).toMatch(/^[a-f0-9]{64}$/);
    expect(() => validateSixComponentCosmoSacBasis(
      clone(SIX_COMPONENT_COSMO_SAC_BASIS),
      SIX_COMPONENT_COSMO_SAC_BASIS_MANIFEST_SHA256,
    )).not.toThrow();
  });

  it('rejects an omitted component, duplicate identity, or bad manifest hash', () => {
    const omitted = clone(SIX_COMPONENT_COSMO_SAC_BASIS) as any;
    omitted.components.splice(4, 1);
    expect(() => validateSixComponentCosmoSacBasis(
      omitted,
      SIX_COMPONENT_COSMO_SAC_BASIS_MANIFEST_SHA256,
    )).toThrow('SIX_COMPONENT_COSMO_SAC_ORDER_MISMATCH');

    const duplicate = clone(SIX_COMPONENT_COSMO_SAC_BASIS) as any;
    duplicate.components[1].inchiKey = duplicate.components[0].inchiKey;
    expect(() => validateSixComponentCosmoSacBasis(
      duplicate,
      SIX_COMPONENT_COSMO_SAC_BASIS_MANIFEST_SHA256,
    )).toThrow('SIX_COMPONENT_COSMO_SAC_IDENTITY_NOT_UNIQUE');

    expect(() => validateSixComponentCosmoSacBasis(
      clone(SIX_COMPONENT_COSMO_SAC_BASIS),
      '0'.repeat(64),
    )).toThrow('SIX_COMPONENT_COSMO_SAC_BASIS_HASH_MISMATCH');
  });

  it('rejects Stage-1 snapshot tampering and a stale basis binding', () => {
    const tampered = clone(makeStage1Snapshot(savedStage1)) as any;
    tampered.stage1.projectReference = 'changed-after-save';
    expect(() => validateStage1Snapshot(tampered)).toThrow('STAGE1_SNAPSHOT_HASH_MISMATCH');

    const stale = clone(makeStage1Snapshot(savedStage1)) as any;
    stale.sixComponentCosmoSacBasisManifestSha256 = '0'.repeat(64);
    expect(() => validateStage1Snapshot(stale))
      .toThrow('SIX_COMPONENT_COSMO_SAC_BASIS_HASH_MISMATCH');

    const substitutedBinding = clone(makeStage1Snapshot(savedStage1)) as any;
    substitutedBinding.sixComponentCosmoSacBinding.components[0].identity = 'n-hexadecane';
    expect(() => validateStage1Snapshot(substitutedBinding))
      .toThrow('SIX_COMPONENT_COSMO_SAC_BINDING_MISMATCH');
    const unavailableBinding = clone(makeStage1Snapshot(savedStage1)) as any;
    unavailableBinding.sixComponentCosmoSacBinding.components[4].profile.available = false;
    expect(() => validateStage1Snapshot(unavailableBinding))
      .toThrow('SIX_COMPONENT_COSMO_SAC_BINDING_MISMATCH');
    const reorderedBinding = clone(makeStage1Snapshot(savedStage1)) as any;
    [reorderedBinding.sixComponentCosmoSacBinding.components[0],
      reorderedBinding.sixComponentCosmoSacBinding.components[1]] =
      [reorderedBinding.sixComponentCosmoSacBinding.components[1],
        reorderedBinding.sixComponentCosmoSacBinding.components[0]];
    expect(() => validateStage1Snapshot(reorderedBinding))
      .toThrow('SIX_COMPONENT_COSMO_SAC_BINDING_MISMATCH');
  });

  it('binds saved SAT/MONO identities without substitution and blocks unprofiled selections', () => {
    const alternateSat = resolveStage1SixComponentCosmoSacBinding({
      satIdentity: 'n-hexadecane',
      monoIdentity: 'n-propylbenzene',
    });
    expect(alternateSat.status).toBe('BLOCKED');
    expect(alternateSat.components[0]).toMatchObject({
      family: 'SAT', identity: 'n-hexadecane', blocker: 'SAT_IDENTITY_PROFILE_NOT_VERIFIED',
    });
    expect(alternateSat.components.slice(2).map(({ identity }) => identity)).toEqual([
      '1-methylnaphthalene',
      'pyrene',
      "4,4'-Bis(alpha,alpha-dimethylbenzyl)diphenylamine",
      'N-methyl-2-pyrrolidone',
    ]);
    const alternateMono = resolveStage1SixComponentCosmoSacBinding({
      satIdentity: 'n-dodecane',
      monoIdentity: 'n-pentylbenzene',
    });
    expect(alternateMono.status).toBe('BLOCKED');
    expect(alternateMono.components[1]).toMatchObject({
      family: 'MONO', identity: 'n-pentylbenzene', blocker: 'MONO_IDENTITY_PROFILE_NOT_VERIFIED',
    });
    expect(() => derivePredictiveNtInputFromStage1(makeStage1Snapshot({
      ...savedStage1,
      satIdentity: 'n-hexadecane',
    }), 209)).toThrow('SIX_COMPONENT_COSMO_SAC_BINDING_BLOCKED');
    expect(() => derivePredictiveNtInputFromStage1(makeStage1Snapshot({
      ...savedStage1,
      monoIdentity: 'n-pentylbenzene',
    }), 209)).toThrow('SIX_COMPONENT_COSMO_SAC_BINDING_BLOCKED');
  });

  it('detects missing or corrupt profile bytes through the injectable reader', () => {
    const binding = resolveStage1SixComponentCosmoSacBinding(savedStage1);
    expect(() => verifyStage1SixComponentCosmoSacProfileFiles(binding, () => {
      throw new Error('missing');
    })).toThrow('SIX_COMPONENT_COSMO_SAC_SAT_PROFILE_FILE_MISSING');
    expect(() => verifyStage1SixComponentCosmoSacProfileFiles(binding, () => Buffer.from('corrupt')))
      .toThrow('SIX_COMPONENT_COSMO_SAC_SAT_PROFILE_HASH_MISMATCH');
  });

  it('keeps PA and feed NMP mandatory in the exact six-component inlet order', () => {
    const result = runSixComponentPreflight({
      ...savedStage1,
      saturatesWt: 67,
      monoAromaticsWt: 20,
      diAromaticsWt: 5,
      polyAromaticsWt: 3,
      polarAromaticsWt: 3,
      nmpInFeedWt: 2,
      nmpPurityWt: 100,
      nmpWaterWt: 0,
    });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.componentOrder).toEqual(['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP']);
    expect(output.oilFeedNmpMassBasis).toBeGreaterThan(0);
    expect(output.freshSolventNmpMassBasis).toBeGreaterThan(0);
    expect(output.overallInletNmpMassBasis).toBeGreaterThan(0);
    expect(output.flowConvention).toMatchObject({
      feed: 'enters stage 1',
      freshSolvent: 'enters stage N',
    });
  }, 30_000);

  it('keeps Project-111-style purity and water as audit specifications without adding a component', () => {
    const result = runSixComponentPreflight({
      ...savedStage1,
      saturatesWt: 85,
      monoAromaticsWt: 7,
      diAromaticsWt: 4,
      polyAromaticsWt: 2,
      polarAromaticsWt: 2,
      solventOilRatio: 0.75,
      nmpPurityWt: 99.5,
      nmpWaterWt: 0.05,
    });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.componentOrder).toEqual(['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP']);
    expect(output.modeledComponentCount).toBe(6);
    expect(output.freshSolventNmpMassBasis).toBe(75);
    expect(output.freshSolventModelingBasis).toBe('PURE_NMP_FROM_SAVED_SOLVENT_OIL_RATIO');
    expect(output.nmpPurityAndWaterSpecificationOnly).toEqual({
      nmpPurityWt: 99.5,
      nmpWaterWt: 0.05,
    });
    expect(result.stdout).not.toContain('UNSPECIFIED');
    expect(result.stdout).not.toContain('"WATER"');
  }, 30_000);

  it('rejects a tampered Stage-1 file before six-component preflight', () => {
    const snapshot = makeStage1Snapshot({
      ...savedStage1,
      nmpPurityWt: 100,
      nmpWaterWt: 0,
      polarAromaticsWt: 3,
      saturatesWt: 67,
    });
    (snapshot.stage1 as EcrPrePilotStage1Input).operatingTemperatureC = 30;
    const directory = mkdtempSync(join(tmpdir(), 'ecr-stage1-tampered-'));
    const snapshotPath = join(directory, 'stage1.json');
    writeFileSync(snapshotPath, JSON.stringify(snapshot));
    try {
      expect(() => execFileSync('python3', [
        'server/research/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent/run.py',
        '--stage1-snapshot', snapshotPath,
        '--preflight-only',
      ], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
        .toThrow(/STAGE1_SNAPSHOT_HASH_MISMATCH/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it('uses the application hash validator for scientific notation and negative zero', () => {
    const result = runSixComponentPreflight({
      ...savedStage1,
      saturatesWt: 67,
      polarAromaticsWt: 3,
      nmpInFeedWt: -0,
      nmpPurityWt: 99.9999999,
      nmpWaterWt: 1e-7,
    });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.modeledComponentCount).toBe(6);
    expect(output.nmpPurityAndWaterSpecificationOnly).toEqual({
      nmpPurityWt: 99.9999999,
      nmpWaterWt: 1e-7,
    });
    expect(result.stderr).not.toContain('STAGE1_SNAPSHOT_HASH_MISMATCH');
    expect(result.stderr).not.toContain('STAGE1_APPLICATION_VALIDATION_FAILED');
  }, 30_000);

  it('calculates positive PA removal only from accepted complete six-component flows', () => {
    expect(deriveSixComponentCosmoSacRemoval({
      status: 'ACCEPTED_SIX_COMPONENT_COSMO_SAC',
      accepted: true,
      numericallyAccepted: true,
      feedComponentFlows: { SAT: 60, MONO: 10, DI: 8, POLY: 6, PA: 4, NMP: 20 },
      raffinateComponentFlows: { SAT: 58, MONO: 4, DI: 2, POLY: 1, PA: 1, NMP: 0.5 },
    })).toMatchObject({
      status: 'CALCULABLE',
      removals: {
        PA: { status: 'CALCULABLE', valuePercent: 75 },
      },
    });
  });

  it('never promotes blocked, unaccepted, or five-component output to removal claims', () => {
    const completeFlows = {
      feedComponentFlows: { SAT: 60, MONO: 10, DI: 8, POLY: 6, PA: 4, NMP: 20 },
      raffinateComponentFlows: { SAT: 58, MONO: 4, DI: 2, POLY: 1, PA: 1, NMP: 0.5 },
    };
    expect(deriveSixComponentCosmoSacRemoval({
      status: 'TARGET_NOT_REACHED',
      accepted: false,
      ...completeFlows,
    }).status).toBe('NOT_CALCULABLE');
    const fiveComponent = deriveSixComponentCosmoSacRemoval({
      status: 'ACCEPTED_SIX_COMPONENT_COSMO_SAC',
      accepted: true,
      numericallyAccepted: true,
      ...completeFlows,
    }, false);
    expect(fiveComponent.status).toBe('NOT_CALCULABLE');
    expect(fiveComponent.removals.PA.valuePercent).toBeNull();

    const snapshot = makeStage1Snapshot(savedStage1);
    const governed = attachStage1ResultGovernance({
      status: 'RESEARCH_DIAGNOSTIC_NOT_ACCEPTED',
      sixComponentRemoval: { PA: 99 },
      removalClaims: { PA: 99 },
    }, {
      stage1Authority: {
        schemaVersion: snapshot.schemaVersion,
        savedAt: snapshot.savedAt,
        snapshotHash: snapshot.immutableHash,
        source: snapshot,
        sulfurPrediction: snapshot.sulfurPrediction,
        minimumMassRecovery: { targetPercent: 95, status: 'CALCULABLE' },
        polarAromaticsAdmission: snapshot.polarAromaticsAdmission,
        sixComponentCosmoSacBasisManifestSha256:
          snapshot.sixComponentCosmoSacBasisManifestSha256,
        sixComponentCosmoSacBindingSha256: snapshot.sixComponentCosmoSacBindingSha256,
      },
    } as any) as any;
    expect(governed.sixComponentRemoval).toBeUndefined();
    expect(governed.removalClaims).toBeUndefined();
    expect(governed.stage1TargetGovernance.sixComponentRemoval.status)
      .toBe('NOT_CALCULABLE');
  });
});