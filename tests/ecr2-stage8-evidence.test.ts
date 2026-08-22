import { describe, expect, it } from 'vitest';

import {
  ecr2Stage8EvidenceFingerprint,
  ECR2_STAGE8_EVIDENCE_CATALOG,
  findEcr2Stage8Evidence,
  resolveWilkeChangDiffusivity,
} from '../shared/ecr2-stage8-evidence';
import { LLXECRSimulatorEngine } from '../server/engines/llx/llx-ecr-simulator-engine';

describe('ECR-2 Stage 8 governed evidence registry', () => {
  it('registers exactly the fifteen required numerical dependencies without Coto physical-MW substitution', () => {
    expect(ECR2_STAGE8_EVIDENCE_CATALOG).toHaveLength(15);
    const physicalMw = ECR2_STAGE8_EVIDENCE_CATALOG.filter((record) => record.id.startsWith('physical_mw_'));
    expect(physicalMw).toHaveLength(4);
    expect(physicalMw.every((record) => record.value === undefined)).toBe(true);
    expect(physicalMw.every((record) => record.warnings.join(' ').includes('Coto surrogate'))).toBe(true);
  });

  it('keeps Dc_NMP distinct from Dd_NMP and leaves only the unsupported self-diffusion route blocked', () => {
    const dcNmp = findEcr2Stage8Evidence('diffusivity_nmp_c');
    const ddNmp = findEcr2Stage8Evidence('diffusivity_nmp_d');
    expect(dcNmp.method).toContain('self-diffusion');
    expect(ddNmp.method).toContain('Wilke–Chang');
    expect(dcNmp.blockingReason).not.toEqual(ddNmp.blockingReason);
  });

  it('uses the actual temperature and viscosity in the verified Wilke–Chang equation while retaining validation warnings', () => {
    const at60 = resolveWilkeChangDiffusivity({
      temperature_C: 60,
      solventViscosity_Pa_s: 0.001,
      solventMolecularWeight_g_mol: 99.13,
      solventAssociationFactor: 1,
      soluteMolecularWeight_g_mol: 300,
      soluteDensity_kg_m3: 850,
    });
    const hotter = resolveWilkeChangDiffusivity({
      temperature_C: 80,
      solventViscosity_Pa_s: 0.001,
      solventMolecularWeight_g_mol: 99.13,
      solventAssociationFactor: 1,
      soluteMolecularWeight_g_mol: 300,
      soluteDensity_kg_m3: 850,
    });
    const moreViscous = resolveWilkeChangDiffusivity({
      temperature_C: 60,
      solventViscosity_Pa_s: 0.002,
      solventMolecularWeight_g_mol: 99.13,
      solventAssociationFactor: 1,
      soluteMolecularWeight_g_mol: 300,
      soluteDensity_kg_m3: 850,
    });

    expect(at60.status).toBe('resolved');
    expect(hotter.status).toBe('resolved');
    expect(moreViscous.status).toBe('resolved');
    if (at60.status === 'resolved' && hotter.status === 'resolved' && moreViscous.status === 'resolved') {
      expect(hotter.value_m2_s).toBeGreaterThan(at60.value_m2_s);
      expect(moreViscous.value_m2_s).toBeLessThan(at60.value_m2_s);
      expect(at60.warnings).toContain('RRBO_NMP_VALIDATION_PENDING');
    }
  });

  it('fails closed when any Wilke–Chang physical input is absent or nonphysical', () => {
    const blocked = resolveWilkeChangDiffusivity({
      temperature_C: 60,
      solventViscosity_Pa_s: 0,
      solventMolecularWeight_g_mol: 99.13,
      solventAssociationFactor: 1,
      soluteMolecularWeight_g_mol: 300,
      soluteDensity_kg_m3: 850,
    });
    expect(blocked).toMatchObject({ status: 'blocked', value_m2_s: null });
  });

  it('keeps Kühni C2 approval-required and excludes the pulsed-column value', () => {
    const c2 = findEcr2Stage8Evidence('kuhni_shd_c2');
    expect(c2.status).toBe('APPROVAL_REQUIRED');
    expect(c2.value).toBeUndefined();
    expect(c2.warnings.join(' ')).toContain('pulsed-column C2');
  });

  it('server-side validation rejects missing, blocked, pending, and unknown evidence states', () => {
    const engine = new LLXECRSimulatorEngine();
    const invalidStates = ['', 'BLOCKED_MISSING_REQUIRED_EVIDENCE', 'AUTO_RESOLVED_PENDING_ACCEPTANCE', 'unexpected'];
    for (const status of invalidStates) {
      const validation = engine.validate({
        bvp: {
          stage8Evidence: {
            physical_mw_sat: { status, originalEvidence: '' },
          },
        },
      });
      expect(validation.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: 'bvp.stage8Evidence.physical_mw_sat', severity: 'error' }),
      ]));
    }
  });

  it('server-side validation rejects forged acceptance and accepts only a fingerprinted, audited override', () => {
    const engine = new LLXECRSimulatorEngine();
    const evidence = Object.fromEntries(ECR2_STAGE8_EVIDENCE_CATALOG.map((record) => [
      record.id,
      { status: 'ACCEPTED_AUTO_BASIS', originalEvidence: 'forged evidence', resolverFingerprint: 'forged evidence' },
    ]));
    const accepted = engine.validate({ bvp: { stage8Evidence: evidence } });
    expect(accepted.errors.some((issue) => issue.field.startsWith('bvp.stage8Evidence.'))).toBe(true);

    const satFingerprint = ecr2Stage8EvidenceFingerprint(findEcr2Stage8Evidence('physical_mw_sat'));
    evidence.physical_mw_sat = {
      status: 'ENGINEER_OVERRIDE',
      originalEvidence: satFingerprint,
      resolverFingerprint: satFingerprint,
      overrideReason: 'Controlled engineering exception',
      overrideUser: '23',
      overrideAt: '2026-08-22T10:00:00.000Z',
    };
    const overridden = engine.validate({ bvp: { stage8Evidence: evidence } });
    expect(overridden.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'bvp.stage8Evidence.diffusivity_sat_c', severity: 'error' }),
    ]));
    expect(overridden.errors).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'bvp.stage8Evidence.physical_mw_sat', severity: 'error' }),
    ]));
  });
});