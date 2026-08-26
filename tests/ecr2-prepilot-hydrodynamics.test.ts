import { describe, expect, it } from 'vitest';
import {
  ECR2_PREPILOT_HYDRODYNAMIC_CANDIDATES,
  buildECR2PrePilotHydrodynamicReview,
  validateECR2PrePilotHydrodynamicInput,
  type ECR2PrePilotHydrodynamicInput,
} from '../server/engines/llx/llx-ecr2-prepilot-hydrodynamics';

const BASE: ECR2PrePilotHydrodynamicInput = {
  rrboVolumetricFlow_m3_s: 2.0e-6,
  nmpVolumetricFlow_m3_s: 2.4e-6,
  columnDiameter_m: 0.10,
  rotorDiameter_m: 0.06,
  physicalCompartmentHeight_m: 0.06,
  statorOpenAreaFraction: 0.30,
  powerPerAgitator_W: 0.06,
  rhoContinuous_kg_m3: 1000,
  rhoDispersed_kg_m3: 860,
  muContinuous_Pa_s: 0.0012,
  muDispersed_Pa_s: 0.001,
  gamma_N_m: 0.0035,
  characteristicSlipVelocity_m_s: 0.003,
  hindranceExponent: 1.1,
  characteristicSlipEvidence: {
    sourceType: 'literature_analogy',
    sourceReference: 'Pre-pilot sensitivity basis only — pending RRBO/NMP pilot fit',
    uncertainty: { lower: 0.0025, upper: 0.0035, basis: 'Engineering sensitivity envelope' },
  },
  hindranceEvidence: {
    sourceType: 'assumed',
    sourceReference: 'Pre-pilot sensitivity basis only — pending RRBO/NMP pilot fit',
  },
  d32Config: {
    mode: 'direct_turbulence_preliminary',
    correlationId: 'ecr2_d32_direct_turbulence_preliminary',
    C_nominal: 0.40,
    sourceType: 'Project-Controlled Preliminary',
    sourceReference: 'ECR-2 direct-turbulence preliminary sensitivity register',
  },
};

describe('ECR-2 RRBO/NMP pre-pilot hydrodynamic review', () => {
  it('keeps every required requested quantity in the source comparison matrix', () => {
    const quantities = new Set(ECR2_PREPILOT_HYDRODYNAMIC_CANDIDATES.map((entry) => entry.quantity));
    expect(quantities).toEqual(new Set([
      'holdup', 'mass_transfer_direction', 'd32', 'slip', 'capacity_flooding',
      'power_agitation', 'interfacial_area', 'mass_transfer',
    ]));
    expect(ECR2_PREPILOT_HYDRODYNAMIC_CANDIDATES.every((entry) =>
      entry.source && entry.equationStructure && entry.phaseConvention &&
      entry.experimentalDomain && entry.extrapolationDistance && entry.uncertainty,
    )).toBe(true);
  });

  it('compares the untouched K&H benchmark with an isolated selected alternative', () => {
    const review = buildECR2PrePilotHydrodynamicReview(BASE);

    expect(review.kh1995Benchmark.status).toBe('dependency_blocked');
    expect(review.selectedAlternative.status).toBe('CALCULATED_PRELIMINARY');
    expect(review.selectedAlternative.selectedLowerBranch?.phi_d).toBeGreaterThan(0);
    expect(review.selectedAlternative.selectedLowerBranch?.phi_d).toBeLessThan(1);
    expect(review.selectedAlternative.d32?.status).toBe('calculated_preliminary');
    expect(review.selectedAlternative.interfacialArea_m2_m3).toBeGreaterThan(0);
    expect(review.selectedRoute.cPsiTreatment).toMatch(/No single CΨ/);
  });

  it('uses one geometry-dependent power basis and preserves dimensional identities', () => {
    const review = buildECR2PrePilotHydrodynamicReview(BASE);
    const core = review.selectedAlternative;
    const area = Math.PI * BASE.columnDiameter_m ** 2 / 4;
    const epsilon = BASE.powerPerAgitator_W /
      (area * BASE.physicalCompartmentHeight_m * BASE.rhoContinuous_kg_m3);
    expect(core.geometry?.columnArea_m2).toBeCloseTo(area, 14);
    expect(core.power?.epsilon_W_kg).toBeCloseTo(epsilon, 14);
    expect(core.superficialVelocities?.Ud_m_s).toBeCloseTo(BASE.rrboVolumetricFlow_m3_s / area, 14);
    expect(core.interfacialArea_m2_m3).toBeCloseTo(
      6 * core.selectedLowerBranch!.phi_d / core.d32!.d32_m!,
      12,
    );
  });

  it('propagates declared sensitivity cases without averaging or clipping roots', () => {
    const review = buildECR2PrePilotHydrodynamicReview({
      ...BASE,
      sensitivityCases: [{
        id: 'lower-power',
        label: 'Lower delivered power',
        overrides: { powerPerAgitator_W: 0.045 },
        basis: 'Torque uncertainty sensitivity',
      }],
    });

    expect(review.sensitivities).toHaveLength(1);
    expect(review.sensitivities[0].core.power?.powerPerAgitator_W).toBe(0.045);
    expect(review.sensitivities[0].core.selectedLowerBranch?.phi_d).toBeGreaterThan(0);
    expect(review.sensitivities[0].core.capacityFlooding.status).toBe('NOT_CALCULABLE');
  });

  it('returns NOT_CALCULABLE rather than an inferred process failure when no physical root exists', () => {
    const review = buildECR2PrePilotHydrodynamicReview({
      ...BASE,
      characteristicSlipVelocity_m_s: 1e-6,
    });
    expect(review.selectedAlternative.status).toBe('NOT_CALCULABLE');
    expect(review.selectedAlternative.branchStatus).toBe('NO_PHYSICAL_ROOT');
    expect(review.selectedAlternative.interfacialArea_m2_m3).toBeNull();
    expect(review.selectedAlternative.capacityFlooding.status).toBe('NOT_CALCULABLE');
  });

  it('cannot unlock any production result, even when preliminary physics calculates', () => {
    const review = buildECR2PrePilotHydrodynamicReview(BASE);
    expect(review.productionEligibility).toMatchObject({
      bvp: 'BLOCKED',
      heightSizing: 'BLOCKED',
      diameter: 'BLOCKED',
      theoreticalStages: 'BLOCKED',
      capacityOrFloodingClaim: 'BLOCKED',
      releaseEligibility: 'BLOCKED',
    });
    expect(review.approvalHandoff.laterApprovalTaskRequirement).toMatch(/cannot unlock governed results/);
  });

  it('does not disguise missing uncertainty as a numerical range', () => {
    const review = buildECR2PrePilotHydrodynamicReview(BASE);
    const hindrance = review.uncertaintyBudget.find((item) => item.item === 'Hindrance exponent n');
    expect(hindrance).toMatchObject({ status: 'MEASUREMENT_REQUIRED' });
    expect(hindrance?.statement).toMatch(/no universal exponent/i);
  });

  it('accepts only the declared direct-turbulence d32 route at the HTTP boundary', () => {
    const invalid = validateECR2PrePilotHydrodynamicInput({
      ...BASE,
      d32Config: {
        mode: 'engineer_supplied',
        d32_m: 0.002,
        sourceType: 'Assumed',
        sourceReference: 'Must not alter the pre-pilot package route',
      },
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.join(' ')).toMatch(/direct-turbulence preliminary route/);

    const valid = validateECR2PrePilotHydrodynamicInput(BASE);
    expect(valid.valid).toBe(true);
  });

  it('rejects malformed uncertainty and unbounded sensitivity work instead of reporting them', () => {
    const invalidUncertainty = validateECR2PrePilotHydrodynamicInput({
      ...BASE,
      characteristicSlipEvidence: {
        ...BASE.characteristicSlipEvidence,
        uncertainty: { lower: 0.004, upper: 0.002, basis: '' },
      },
    });
    expect(invalidUncertainty.valid).toBe(false);
    expect(invalidUncertainty.errors.join(' ')).toMatch(/uncertainty/);

    const tooMany = validateECR2PrePilotHydrodynamicInput({
      ...BASE,
      sensitivityCases: Array.from({ length: 13 }, (_, index) => ({
        id: `case-${index}`,
        label: `Case ${index}`,
        basis: 'Bounded-load validation',
        overrides: { powerPerAgitator_W: 0.05 },
      })),
    });
    expect(tooMany.valid).toBe(false);
    expect(tooMany.errors.join(' ')).toMatch(/at most 12/);
  });
});