import { describe, expect, it } from 'vitest';

import {
  ecr2Stage8EvidenceFingerprint,
  ECR2_STAGE8_EVIDENCE_CATALOG,
  findEcr2Stage8Evidence,
  resolveEcr2Stage8Evidence,
  resolveWilkeChangDiffusivity,
} from '../shared/ecr2-stage8-evidence';
import {
  ECR2_RRBO_SN300_PHYSICAL_COMPONENT_BASIS,
  getEcr2PhysicalComponentBasis,
} from '../shared/ecr2-physical-property-basis';
import { LLXECRSimulatorEngine } from '../server/engines/llx/llx-ecr-simulator-engine';
import { signEcr2Stage8ResolverRecord } from '../server/engines/llx/llx-ecr2-stage8-resolution-signature';

describe('ECR-2 Stage 8 governed evidence registry', () => {
  it('registers exactly the fifteen required numerical dependencies without Coto physical-MW substitution', () => {
    expect(ECR2_STAGE8_EVIDENCE_CATALOG).toHaveLength(15);
    const physicalMw = ECR2_STAGE8_EVIDENCE_CATALOG.filter((record) => record.id.startsWith('physical_mw_'));
    expect(physicalMw).toHaveLength(4);
    expect(physicalMw.every((record) => record.value === undefined)).toBe(true);
    expect(physicalMw.every((record) => record.warnings.join(' ').includes('Coto surrogate'))).toBe(true);
  });

  it('registers a versioned RRBO SN300 physical-family preliminary basis with no Coto molecular-weight reuse', () => {
    const values = Object.values(ECR2_RRBO_SN300_PHYSICAL_COMPONENT_BASIS);
    expect(values).toHaveLength(4);
    expect(values.every((basis) => basis.decision === 'PHYSICAL_MW_PRELIMINARY_APPROVED_BASIS')).toBe(true);
    expect(values.every((basis) => basis.evidenceLevel === 'ENGINEER_APPROVED_PRELIMINARY')).toBe(true);
    expect(values.every((basis) => basis.equation.includes('42.965'))).toBe(true);
    expect(values.map((basis) => basis.physicalMw_g_mol)).not.toEqual(
      expect.arrayContaining([170.34, 106.17, 142.20, 202.25]),
    );
    expect(getEcr2PhysicalComponentBasis('rrbo-sn500')).toBeUndefined();
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

  it('evaluates all fifteen routes and reports the exact current root evidence gaps', () => {
    const resolution = resolveEcr2Stage8Evidence({
      temperature_C: 60,
      nmp: {
        viscosity_Pa_s: {
          value: 0.001,
          source: 'Controlled NMP viscosity at 60 °C',
          evidenceLevel: 'PRIMARY_EQUATION_VERIFIED',
        },
      },
    });

    expect(Object.keys(resolution.records)).toHaveLength(15);
    expect(resolution).toMatchObject({ autoPopulatedCount: 0, unresolvedCount: 15 });
    expect(resolution.records.physical_mw_sat.blockingReason).toContain('ROOT_GAP_PHYSICAL_MW_SAT');
    expect(resolution.records.diffusivity_sat_c.blockingReason).toContain('NMP molecular weight');
    expect(resolution.records.diffusivity_sat_d.blockingReason).toContain('RRBO operating-temperature viscosity');
    expect(resolution.records.diffusivity_nmp_c.blockingReason).toContain('ROOT_GAP_NMP_SELF_DIFFUSION');
    expect(resolution.records.kuhni_shd_c2.blockingReason).toContain('ROOT_GAP_KUHNI_SHD_C2');
  });

  it('auto-calculates each eligible Wilke–Chang route only from a complete controlled basis and retains temperature sensitivity', () => {
    const scalar = (value: number, source: string) => ({
      value, source, evidenceLevel: 'PRIMARY_EQUATION_VERIFIED' as const,
    });
    const physicalComponents = {
      sat: { molecularWeight_g_mol: scalar(300, 'controlled Sat MW'), density_kg_m3: scalar(850, 'controlled Sat density') },
      mono: { molecularWeight_g_mol: scalar(320, 'controlled Mono MW'), density_kg_m3: scalar(900, 'controlled Mono density') },
      di: { molecularWeight_g_mol: scalar(340, 'controlled Di MW'), density_kg_m3: scalar(950, 'controlled Di density') },
      poly: { molecularWeight_g_mol: scalar(360, 'controlled Poly MW'), density_kg_m3: scalar(1000, 'controlled Poly density') },
    };
    const context = {
      temperature_C: 60,
      nmp: {
        viscosity_Pa_s: scalar(0.001, 'controlled NMP viscosity'),
        molecularWeight_g_mol: scalar(99.13, 'controlled NMP MW'),
        associationFactor: scalar(1, 'controlled NMP association factor'),
        density_kg_m3: scalar(1020, 'controlled NMP density'),
        selfDiffusion_m2_s: scalar(2e-9, 'controlled NMP self-diffusion'),
      },
      rrbo: {
        viscosity_Pa_s: scalar(0.01, 'controlled RRBO viscosity'),
        molecularWeight_g_mol: scalar(320, 'controlled RRBO MW'),
        associationFactor: scalar(1, 'controlled RRBO association factor'),
      },
      physicalComponents,
      kuhniShdC2: {
        ...scalar(1.2, 'controlled exact Kühni C2'),
        exactEquationIdentity: 'Kühni/Hartland 1999, exact dispersed-side Shd coefficient placement',
        deviceApplicability: 'kuhni' as const,
        phaseBasis: 'dispersed' as const,
      },
    };
    const at60 = resolveEcr2Stage8Evidence(context);
    const at80 = resolveEcr2Stage8Evidence({ ...context, temperature_C: 80 });

    expect(at60).toMatchObject({ autoPopulatedCount: 15, unresolvedCount: 0 });
    expect(at60.records.diffusivity_sat_c.status).toBe('CALCULATED_PRELIMINARY');
    expect(at60.records.diffusivity_sat_d.status).toBe('CALCULATED_PRELIMINARY');
    expect(at60.records.diffusivity_nmp_c.method).toContain('self-diffusion');
    expect(at60.records.diffusivity_nmp_d.value).toBeGreaterThan(0);
    expect(at60.records.diffusivity_nmp_c).toMatchObject({
      validatedForRRBONMP: false,
      pilotCalibrationStatus: 'NOT_YET_VALIDATED',
    });
    expect(at80.records.diffusivity_sat_c.value).toBeGreaterThan(at60.records.diffusivity_sat_c.value!);
  });

  it('retains the physical-basis decision, equation, and uncertainty in an SN300 auto-resolution', () => {
    const physicalComponents = Object.fromEntries(
      Object.entries(ECR2_RRBO_SN300_PHYSICAL_COMPONENT_BASIS).map(([key, basis]) => [
        key,
        {
          molecularWeight_g_mol: {
            value: basis.physicalMw_g_mol,
            source: basis.source,
            evidenceLevel: basis.evidenceLevel,
          },
          density_kg_m3: {
            value: basis.density_kg_m3,
            source: `${basis.label} density anchor`,
            evidenceLevel: basis.evidenceLevel,
          },
          method: basis.equation,
          physicalMwDecision: basis.decision,
        },
      ]),
    );
    const resolution = resolveEcr2Stage8Evidence({ physicalComponents: physicalComponents as any });
    const sat = resolution.records.physical_mw_sat;

    expect(resolution.autoPopulatedCount).toBe(4);
    expect(sat).toMatchObject({
      status: 'AUTO_RESOLVED_PENDING_ACCEPTANCE',
      value: 269.93,
      evidenceLevel: 'ENGINEER_APPROVED_PRELIMINARY',
      physicalMwDecision: 'PHYSICAL_MW_PRELIMINARY_APPROVED_BASIS',
    });
    expect(sat.method).toContain('42.965');
    expect(sat.uncertainty).toContain('±20%');
  });

  it('fails closed for incomplete or invalid runtime resolver inputs rather than throwing or promoting a value', () => {
    const invalid = resolveEcr2Stage8Evidence({
      physicalComponents: {
        sat: {
          molecularWeight_g_mol: { value: 0, source: 'invalid', evidenceLevel: 'PRIMARY_EQUATION_VERIFIED' },
        },
      },
      nmp: {
        selfDiffusion_m2_s: { value: Number.NaN, source: 'invalid', evidenceLevel: 'PRIMARY_EQUATION_VERIFIED' },
      },
      kuhniShdC2: {
        value: -1,
        source: 'invalid',
        evidenceLevel: 'PRIMARY_EQUATION_VERIFIED',
        exactEquationIdentity: 'not eligible',
        deviceApplicability: 'kuhni',
        phaseBasis: 'dispersed',
      },
    });
    expect(invalid.records.physical_mw_sat.status).toBe('BLOCKED_MISSING_REQUIRED_EVIDENCE');
    expect(invalid.records.diffusivity_sat_c.blockingReason).toContain('physical molecular weight');
    expect(invalid.records.diffusivity_nmp_c.status).toBe('BLOCKED_MISSING_REQUIRED_EVIDENCE');
    expect(invalid.records.kuhni_shd_c2.status).toBe('APPROVAL_REQUIRED');
  });

  it('keeps Kühni C2 approval-required and excludes the pulsed-column value', () => {
    const c2 = findEcr2Stage8Evidence('kuhni_shd_c2');
    expect(c2.status).toBe('APPROVAL_REQUIRED');
    expect(c2.value).toBeUndefined();
    expect(c2.warnings.join(' ')).toContain('pulsed-column C2');
  });

  it('server-side validation rejects missing, blocked, pending, and unknown evidence states', () => {
    const engine = new LLXECRSimulatorEngine();
    const invalidStates = ['', 'BLOCKED_MISSING_REQUIRED_EVIDENCE', 'AUTO_RESOLVED_PENDING_ACCEPTANCE', 'CALCULATED_PRELIMINARY', 'unexpected'];
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

  it('server-side validation rejects an unsigned forged dynamic resolver record', () => {
    const engine = new LLXECRSimulatorEngine();
    const candidate = {
      ...findEcr2Stage8Evidence('physical_mw_sat'),
      status: 'AUTO_RESOLVED_PENDING_ACCEPTANCE' as const,
      value: 300,
      source: 'forged dynamic source',
    };
    const evidence = Object.fromEntries(ECR2_STAGE8_EVIDENCE_CATALOG.map((record) => {
      const fingerprint = ecr2Stage8EvidenceFingerprint(record);
      return [record.id, {
        status: 'ENGINEER_OVERRIDE',
        originalEvidence: fingerprint,
        resolverFingerprint: fingerprint,
        overrideReason: 'Controlled engineering exception',
        overrideUser: '23',
        overrideAt: '2026-08-22T10:00:00.000Z',
      }];
    }));
    const forgedFingerprint = ecr2Stage8EvidenceFingerprint(candidate);
    evidence.physical_mw_sat = {
      status: 'ACCEPTED_AUTO_BASIS',
      originalEvidence: forgedFingerprint,
      resolverFingerprint: forgedFingerprint,
      resolverRecord: candidate,
      // Deliberately no resolverSignature.
    };
    const validation = engine.validate({ bvp: { stage8Evidence: evidence } });
    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'bvp.stage8Evidence.physical_mw_sat', severity: 'error' }),
    ]));
  });

  it('requires a server-stamped accepting engineer and timestamp even for a signed resolver candidate', () => {
    const previousSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = 'stage8-test-signing-secret-minimum-length';
    try {
      const engine = new LLXECRSimulatorEngine();
      const candidate = {
        ...findEcr2Stage8Evidence('physical_mw_sat'),
        status: 'AUTO_RESOLVED_PENDING_ACCEPTANCE' as const,
        value: 300,
        source: 'server-controlled dynamic source',
      };
      const evidence = Object.fromEntries(ECR2_STAGE8_EVIDENCE_CATALOG.map((record) => {
        const fingerprint = ecr2Stage8EvidenceFingerprint(record);
        return [record.id, {
          status: 'ENGINEER_OVERRIDE',
          originalEvidence: fingerprint,
          resolverFingerprint: fingerprint,
          overrideReason: 'Controlled engineering exception',
          overrideUser: '23',
          overrideAt: '2026-08-22T10:00:00.000Z',
        }];
      }));
      const fingerprint = ecr2Stage8EvidenceFingerprint(candidate);
      evidence.physical_mw_sat = {
        status: 'ACCEPTED_AUTO_BASIS',
        originalEvidence: fingerprint,
        resolverFingerprint: fingerprint,
        resolverRecord: candidate,
        resolverSignature: signEcr2Stage8ResolverRecord(fingerprint),
      };
      const validation = engine.validate({ bvp: { stage8Evidence: evidence } });
      expect(validation.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: 'bvp.stage8Evidence.physical_mw_sat', severity: 'error' }),
      ]));
    } finally {
      if (previousSecret === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = previousSecret;
    }
  });

  it('accepts a server-signed dynamic resolver record while retaining its exact fingerprint', () => {
    const previousSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = 'stage8-test-signing-secret-minimum-length';
    try {
      const engine = new LLXECRSimulatorEngine();
      const candidate = {
        ...findEcr2Stage8Evidence('physical_mw_sat'),
        status: 'AUTO_RESOLVED_PENDING_ACCEPTANCE' as const,
        value: 300,
        source: 'server-controlled dynamic source',
      };
      const evidence = Object.fromEntries(ECR2_STAGE8_EVIDENCE_CATALOG.map((record) => {
        const fingerprint = ecr2Stage8EvidenceFingerprint(record);
        return [record.id, {
          status: 'ENGINEER_OVERRIDE',
          originalEvidence: fingerprint,
          resolverFingerprint: fingerprint,
          overrideReason: 'Controlled engineering exception',
          overrideUser: '23',
          overrideAt: '2026-08-22T10:00:00.000Z',
        }];
      }));
      const fingerprint = ecr2Stage8EvidenceFingerprint(candidate);
      evidence.physical_mw_sat = {
        status: 'ACCEPTED_AUTO_BASIS',
        originalEvidence: fingerprint,
        resolverFingerprint: fingerprint,
        resolverRecord: candidate,
        resolverSignature: signEcr2Stage8ResolverRecord(fingerprint),
      acceptedBy: '23',
      acceptedAt: '2026-08-22T10:00:00.000Z',
      };
      const validation = engine.validate({ bvp: { stage8Evidence: evidence } });
      expect(validation.errors).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ field: 'bvp.stage8Evidence.physical_mw_sat', severity: 'error' }),
      ]));
    } finally {
      if (previousSecret === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = previousSecret;
    }
  });

  it('rejects a signed resolver record after any governed physical-basis provenance is changed', () => {
    const previousSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = 'stage8-test-signing-secret-minimum-length';
    try {
      const engine = new LLXECRSimulatorEngine();
      const candidate = {
        ...findEcr2Stage8Evidence('physical_mw_sat'),
        status: 'AUTO_RESOLVED_PENDING_ACCEPTANCE' as const,
        value: 269.93,
        source: 'server-controlled physical-basis source',
        version: '1.0.0',
        requiredInputs: ['TBP50', 'specific gravity'],
        availableInputs: ['controlled preliminary anchors'],
        missingInputs: ['GC/MS'],
        uncertainty: '±20%',
        physicalMwDecision: 'PHYSICAL_MW_PRELIMINARY_APPROVED_BASIS' as const,
        warnings: ['controlled preliminary warning'],
      };
      const evidence = Object.fromEntries(ECR2_STAGE8_EVIDENCE_CATALOG.map((record) => {
        const fingerprint = ecr2Stage8EvidenceFingerprint(record);
        return [record.id, {
          status: 'ENGINEER_OVERRIDE',
          originalEvidence: fingerprint,
          resolverFingerprint: fingerprint,
          overrideReason: 'Controlled engineering exception',
          overrideUser: '23',
          overrideAt: '2026-08-22T10:00:00.000Z',
        }];
      }));
      const fingerprint = ecr2Stage8EvidenceFingerprint(candidate);
      candidate.version = 'tampered';
      evidence.physical_mw_sat = {
        status: 'ACCEPTED_AUTO_BASIS',
        originalEvidence: fingerprint,
        resolverFingerprint: fingerprint,
        resolverRecord: candidate,
        resolverSignature: signEcr2Stage8ResolverRecord(fingerprint),
      };
      const validation = engine.validate({ bvp: { stage8Evidence: evidence } });
      expect(validation.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: 'bvp.stage8Evidence.physical_mw_sat', severity: 'error' }),
      ]));
    } finally {
      if (previousSecret === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = previousSecret;
    }
  });
});
