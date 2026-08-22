import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, connect, client } = vi.hoisted(() => {
  const query = vi.fn();
  const client = { query, release: vi.fn() };
  const connect = vi.fn(async () => client);
  return { query, connect, client };
});

vi.mock('../server/db', () => ({ pool: { connect } }));

import { acceptAllEcr2Stage8ResolvedValues } from '../server/design-software-service';

const savedSn300Inputs = {
  feed_service: 'Re-Refined Base Oil SN300',
  operating_temperature: '70',
  rrbo_saturates_wt: '75',
  rrbo_mono_aromatics_wt: '8.3333',
  rrbo_di_aromatics_wt: '8.3333',
  rrbo_poly_aromatics_wt: '8.3333',
};

describe('ECR-2 Stage 8 bulk acceptance', () => {
  beforeEach(() => {
    query.mockReset();
    client.release.mockReset();
    connect.mockClear();
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('FROM design_software_revisions')) {
        return { rows: [{ id: 8, is_frozen: false, module_type: 'llx' }] };
      }
      if (text.includes('SELECT section, data FROM design_software_inputs')) {
        return { rows: [{ section: 'process_design', data: savedSn300Inputs }] };
      }
      if (text.includes('INSERT INTO design_software_inputs')) return { rows: [] };
      if (text.includes('UPDATE design_software_revisions')) return { rows: [] };
      throw new Error(`Unexpected SQL: ${text}`);
    });
  });

  it('persists one current acceptance state for resolved values and excludes unresolved dependencies', async () => {
    const result = await acceptAllEcr2Stage8ResolvedValues(8, 42);

    expect(result.acceptedIds).toHaveLength(14);
    expect(result.acceptedIds).toContain('physical_mw_sat');
    expect(result.acceptedIds).toContain('diffusivity_nmp_d');
    expect(result.acceptedIds).not.toContain('kuhni_shd_c2');

    const upsertCall = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO design_software_inputs'));
    const acceptanceFields = JSON.parse(upsertCall![1][1]);
    expect(acceptanceFields).toEqual({
      stage8_system_values_acceptance_status: 'ACCEPTED',
    });
    expect(client.release).toHaveBeenCalledOnce();
  });
});