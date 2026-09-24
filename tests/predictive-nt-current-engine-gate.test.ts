import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertCurrentPredictiveNtExecution,
  enqueuePredictiveNtRuntimeTestJob,
  preflightPredictiveNtRuntime,
} from '../server/ecr-pre-pilot/predictive-nt-job-service';

const serviceSource = readFileSync(
  'server/ecr-pre-pilot/predictive-nt-job-service.ts',
  'utf8',
);

describe('Predictive N_T current-engine execution gate', () => {
  it('accepts only the immutable 7C-1.6 execution contract', () => {
    expect(() => assertCurrentPredictiveNtExecution({
      engineContractVersion: '7C-1.6.0',
    })).not.toThrow();
    expect(() => assertCurrentPredictiveNtExecution({
      engineContractVersion: '7C-1.5.0',
    })).toThrow('PREDICTIVE_NT_ENGINE_CONTRACT_RETIRED: only 7C-1.6.0 may execute');
    expect(() => assertCurrentPredictiveNtExecution()).toThrow(
      'PREDICTIVE_NT_ENGINE_CONTRACT_RETIRED: only 7C-1.6.0 may execute',
    );
  });

  it('refuses retired raw test requests before database access', async () => {
    await expect(enqueuePredictiveNtRuntimeTestJob({
      engineContractVersion: '7C-1.5.0',
    }, 1, 1)).rejects.toThrow(
      'PREDICTIVE_NT_ENGINE_CONTRACT_RETIRED: only 7C-1.6.0 may execute',
    );
  });

  it('preflights 7C-1.6 and preserves its scientific engine hash', () => {
    const evidence = preflightPredictiveNtRuntime();
    expect(evidence.engineContractVersion).toBe('7C-1.6.0');
    expect(evidence.engineHash).toBe(
      'ff35a410554e3f30bb43715691752fdc2f6a016a4689c885bf91272a17c7b486',
    );
    expect(evidence.verifiedScientificInputAggregateSha256).toBe(evidence.engineHash);
  }, 30_000);

  it('filters both pending claims and stale-running reclaims to 7C-1.6', () => {
    expect(serviceSource).toContain(
      "AND input_snapshot->>'engineContractVersion' = '7C-1.6.0'",
    );
    expect(serviceSource).toContain('assertCurrentPredictiveNtExecution(job.input)');
    expect(serviceSource).toContain('assertCurrentPredictiveNtExecution(input)');
    expect(serviceSource).toContain('currentRuntimeRoot()');
    expect(serviceSource).not.toContain('return readPredictiveNtRuntimePreflight();');
  });
});