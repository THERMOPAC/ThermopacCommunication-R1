import { describe, expect, it } from 'vitest';
import {
  resolveECR2Models,
} from '../server/engines/llx/llx-ecr2-execution-mode';

describe('ECR-2 two-level execution resolver', () => {
  it('treats absent pilot validation as predictive evidence maturity, not a calculation block', () => {
    const resolved = resolveECR2Models({
      prePilotHydrodynamics: {
        modelId: 'pilot_calibrated_hindrance_closure',
        modelVersion: '1.0.0',
        characteristicSlipVelocity_m_s: 0.013,
        hindranceExponent: 1.1,
        characteristicSlipEvidence: {
          sourceReference: 'Predictive test slip basis',
        },
        hindranceEvidence: {
          sourceReference: 'Predictive test hindrance basis',
        },
      },
    }, 'PRE_PILOT_PREDICTIVE', {
      modelId: 'llx-temperature-nrtl',
      modelVersion: 'test-version',
      modelName: 'Test shared NRTL',
      citation: 'Test citation',
    });

    expect(resolved).toMatchObject({
      executionMode: 'PRE_PILOT_PREDICTIVE',
      displayLabel: 'PRE_PILOT_PREDICTIVE — NOT PILOT VALIDATED',
      evidenceStatus: 'PRE_PILOT_PREDICTIVE_NOT_PILOT_VALIDATED',
      releaseStatus: 'BLOCKED',
      releaseLabel: 'RELEASE ELIGIBILITY: BLOCKED',
      uncertaintyRequired: true,
      thermodynamicModel: {
        packageId: 'llx-temperature-nrtl',
        packageVersion: 'test-version',
        use: 'shared_ecr2_core',
        pilotValidated: false,
      },
      hydrodynamicModel: {
        packageId: 'pilot_calibrated_hindrance_closure',
        packageVersion: '1.0.0',
        use: 'shared_ecr2_core',
        pilotValidated: false,
        selectionStatus: 'SELECTED',
        prePilotInputUsed: true,
        unusedPrePilotInputPresent: false,
      },
    });
  });

  it('keeps governed execution evidence-incomplete and release-blocked without current approval', () => {
    expect(resolveECR2Models({}, 'GOVERNED_RELEASE')).toMatchObject({
      executionMode: 'GOVERNED_RELEASE',
      evidenceStatus: 'GOVERNED_EVIDENCE_INCOMPLETE',
      releaseStatus: 'BLOCKED',
      uncertaintyRequired: false,
      thermodynamicModel: {
        packageId: 'UNSPECIFIED_SHARED_ECR2_THERMODYNAMIC_MODEL',
        pilotValidated: false,
      },
    });
  });

  it('reports the governed K&H route and never the retained pre-pilot closure', () => {
    const resolved = resolveECR2Models({
      prePilotHydrodynamics: {
        modelId: 'pilot_calibrated_hindrance_closure',
        modelVersion: '1.0.0',
        characteristicSlipVelocity_m_s: 0.013,
        hindranceExponent: 1.1,
        characteristicSlipEvidence: {
          sourceReference: 'Saved pre-pilot slip basis',
        },
        hindranceEvidence: {
          sourceReference: 'Saved pre-pilot hindrance basis',
        },
      },
    }, 'GOVERNED_RELEASE');

    expect(resolved.hydrodynamicModel).toEqual({
      packageId: 'kuhni_1995_primary_holdup',
      packageVersion: 'equations_15_to_19',
      use: 'shared_ecr2_core',
      pilotValidated: false,
      selectionStatus: 'SELECTED',
      prePilotInputUsed: false,
      unusedPrePilotInputPresent: true,
    });
    expect(resolved.notes.join(' ')).toContain('explicitly unused');
  });
});