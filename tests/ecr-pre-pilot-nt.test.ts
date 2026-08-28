import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  PRE_PILOT_MODEL,
  startPrePilotNt,
} from '../server/ecr-pre-pilot/model';

describe('ECR Pre-Pilot frozen N_T start', () => {
  it('starts predictive N_T only against the frozen model hash', () => {
    const result = startPrePilotNt({
      executionMode: 'ECR_PRE_PILOT_PREDICTIVE',
      requestedModelHash: PRE_PILOT_MODEL.modelHash,
      feedCompositionMassFraction: { saturates: 0.7, mono: 0.3, di: 0, poly: 0 },
      sulfurObjectiveRequested: false,
    });

    expect(result).toMatchObject({
      status: 'READY_FOR_PREDICTIVE_NT',
      mayRunPredictiveNt: true,
      mayWriteEstablishedTheoreticalStages: false,
      establishedTheoreticalStages: null,
      calibrationRequired: true,
      model: {
        packageId: 'PRE_PILOT_MODEL',
        operationalDecision: 'ACCEPT_WITH_LIMITATIONS',
        calibrationStatus: 'CALIBRATION_REQUIRED',
        qualificationDecision: 'REJECT',
        qualificationGoverningStatus: 'FAIL_CLOSED',
        releaseEligibility: 'BLOCKED',
        gates: {
          topologyRecallMinimum: 0.9,
          tieLineRmsdMaximum: 0.03,
        },
      },
    });
  });

  it('fails closed when any mutable or unidentified model is requested', () => {
    expect(startPrePilotNt({
      executionMode: 'ECR_PRE_PILOT_PREDICTIVE',
      requestedModelHash: 'changed',
      feedCompositionMassFraction: { saturates: 0.7, mono: 0.3, di: 0, poly: 0 },
      sulfurObjectiveRequested: false,
    })).toMatchObject({
      status: 'MODEL_HASH_MISMATCH',
      mayRunPredictiveNt: false,
      establishedTheoreticalStages: null,
    });
  });

  it('does not promote the pre-pilot package into governed release', () => {
    expect(startPrePilotNt({
      executionMode: 'GOVERNED_RELEASE',
      requestedModelHash: PRE_PILOT_MODEL.modelHash,
      feedCompositionMassFraction: { saturates: 0.7, mono: 0.3, di: 0, poly: 0 },
      sulfurObjectiveRequested: false,
    })).toMatchObject({
      status: 'GOVERNED_RELEASE_BLOCKED',
      mayRunPredictiveNt: false,
      mayWriteEstablishedTheoreticalStages: false,
      establishedTheoreticalStages: null,
    });
  });

  it('matches the authoritative release manifest at runtime', () => {
    const manifest = JSON.parse(fs.readFileSync(
      'server/research/ecr-pre-pilot-model-freeze/model-manifest.json',
      'utf8',
    ));

    expect(PRE_PILOT_MODEL).toMatchObject({
      packageId: manifest.packageId,
      packageVersion: manifest.packageVersion,
      modelHash: manifest.modelHash,
      operationalDecision: manifest.disposition.operationalDecision,
      calibrationStatus: manifest.disposition.calibrationStatus,
      qualificationDecision: manifest.disposition.qualificationDecision,
      qualificationGoverningStatus: manifest.disposition.qualificationGoverningStatus,
      releaseEligibility: manifest.disposition.releaseEligibility,
      gates: {
        topologyRecallMinimum: manifest.gates.topologyRecallMinimum,
        tieLineRmsdMaximum: manifest.gates.tieLineRmsdMaximum,
      },
    });
  });

  it('fails closed for DI/POLY or sulfur use', () => {
    const base = {
      executionMode: 'ECR_PRE_PILOT_PREDICTIVE' as const,
      requestedModelHash: PRE_PILOT_MODEL.modelHash,
      sulfurObjectiveRequested: false,
    };
    expect(startPrePilotNt({
      ...base,
      feedCompositionMassFraction: { saturates: 0.6, mono: 0.3, di: 0.1, poly: 0 },
    }).status).toBe('UNSUPPORTED_COMPONENT_SCOPE');
    expect(startPrePilotNt({
      ...base,
      sulfurObjectiveRequested: true,
      feedCompositionMassFraction: { saturates: 0.7, mono: 0.3, di: 0, poly: 0 },
    }).status).toBe('SULFUR_MODEL_UNAVAILABLE');
  });
});