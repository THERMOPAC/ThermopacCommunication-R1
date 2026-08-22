import { describe, expect, it } from 'vitest';

import { mapWorkspaceProcessDesignInputs } from '../server/llx-process-design-input-mapper';

describe('ECR-2 simulator workspace adapter', () => {
  it('fails closed for an unrecognized Feed Service rather than defaulting to SN300 physical properties', () => {
    const mapped = mapWorkspaceProcessDesignInputs({
      feed_service: 'Uncharacterized Re-Refined Oil',
      rrboFluidId: 'rrbo-sn300',
      operating_temperature: '60',
    }, 'ecr_simulator');
    const resolution = (mapped.bvp as any).stage8Resolution;

    expect(resolution.records.physical_mw_sat.status).toBe('BLOCKED_MISSING_REQUIRED_EVIDENCE');
    expect(resolution.autoPopulatedCount).toBe(0);
  });

  it('strips retired Kühni Shd C2 values from legacy flat, nested evidence, and resolver payloads', () => {
    const mapped = mapWorkspaceProcessDesignInputs({
      feed_service: 'Uncharacterized Re-Refined Oil',
      rrboFluidId: 'rrbo-sn300',
      operating_temperature: '60',
      kuhni_shd_c2_value: '4.33',
      kuhni_shd_c2_source_type: 'Literature',
      kuhni_shd_c2_source_reference: 'pulsed column only',
      bvp: JSON.stringify({
        kuhniShdC2: {
          value: 4.33,
          sourceType: 'Literature',
          sourceReference: 'pulsed column only',
          scope: 'kuhni_shd_preliminary',
        },
        stage8Evidence: {
          kuhni_shd_c2: { status: 'ACCEPTED_AUTO_BASIS', value: 4.33 },
        },
        stage8Resolution: {
          records: {
            kuhni_shd_c2: { status: 'ACCEPTED_AUTO_BASIS', value: 4.33 },
          },
        },
      }),
    }, 'ecr_simulator');
    const bvp = mapped.bvp as any;

    expect(bvp).not.toHaveProperty('kuhniShdC2');
    expect(bvp.stage8Evidence).not.toHaveProperty('kuhni_shd_c2');
    expect(bvp.stage8Resolution.records).not.toHaveProperty('kuhni_shd_c2');
    expect(mapped).not.toHaveProperty('kuhni_shd_c2_value');
  });
});