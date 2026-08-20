// ─────────────────────────────────────────────────────────────────────────────
// ECR-2 — C2 Thermodynamic Basis Alignment
// ─────────────────────────────────────────────────────────────────────────────
// These tests deliberately prove thermodynamic-coordinate alignment only.
// They do not create a thermodynamic-to-physical mass-transfer mapping.

import { describe, expect, it } from 'vitest';

import {
  buildECR2ThermodynamicBasis,
  ECR2_PHYSICAL_BASIS_STATUS,
  extractC2ThermodynamicHandoff,
  LLXECRSimulatorEngine,
  type ComponentVector,
} from '../server/engines/llx/llx-ecr-simulator-engine';

import { SURROGATE_MW } from '../server/engine-framework/cel/coto2022-nmp-lle';
import { nrtlFlash } from '../server/engine-framework/cel/llx-temperature-lle-model';
import { injectC2ThermodynamicHandoffForECR2 } from '../server/engines/llx/llx-ecr2-c2-handoff';

const T_C = 70;
const T_K = T_C + 273.15;
const RRBO_W: ComponentVector = [0.52, 0.22, 0.16, 0.10, 0];

function c2FeedMoleFractions(w: ComponentVector): ComponentVector {
  const mw = [
    SURROGATE_MW.c12,
    SURROGATE_MW.xylene,
    SURROGATE_MW.methylnaphtalene,
    SURROGATE_MW.pyrene,
    SURROGATE_MW.nmp,
  ];
  const raw = w.map((wi, i) => wi / mw[i]);
  const total = raw.reduce((sum, value) => sum + value, 0);
  return raw.map((value) => value / total) as ComponentVector;
}

function tagged(value: number, sourceType: 'Assumed' | 'Literature', sourceReference: string) {
  return { value, unit: 'g/mol', sourceType, sourceReference };
}

function simulatorInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    operatingTemperatureC: T_C,
    rrboMassFlow_kg_h: 1000,
    nmpMassFlow_kg_h: 1200,
    feedCompositionMassFraction: { saturates: 0.52, mono: 0.22, di: 0.16, poly: 0.10 },
    nmpPurity: 0.998,
    phaseConfiguration: 'nmp_continuous_rrbo_dispersed',
    columnDiameter_m: 0.6,
    activeHeight_m: 4,
    compartmentHeight_m: 0.5,
    rotorToColumnDiameterRatio: 0.5,
    rotorSpeed_rpm: 150,
    rotorType: 'shrouded turbine',
    powerNumber: { value: 5.0, unit: '-', sourceType: 'Assumed', sourceReference: 'test fixture' },
    shaftEfficiency: { value: 0.85, unit: '-', sourceType: 'Assumed', sourceReference: 'test fixture' },
    mechanicalDesignMargin: { value: 1.2, unit: '-', sourceType: 'Assumed', sourceReference: 'test fixture' },
    feedDensity: { value: 870, unit: 'kg/m3', sourceType: 'Assumed', sourceReference: 'test fixture' },
    feedViscosity: { value: 0.008, unit: 'Pa.s', sourceType: 'Assumed', sourceReference: 'test fixture' },
    interfacialTension: { value: 0.012, unit: 'N/m', sourceType: 'Assumed', sourceReference: 'test fixture' },
    molecularWeights: {
      saturates_g_mol: tagged(450, 'Assumed', 'Existing physical characterization fixture'),
      mono_g_mol: tagged(190, 'Assumed', 'Existing physical characterization fixture'),
      di_g_mol: tagged(230, 'Assumed', 'Existing physical characterization fixture'),
      poly_g_mol: tagged(310, 'Assumed', 'Existing physical characterization fixture'),
    },
    ...overrides,
  };
}

function numbersClose(left: readonly number[], right: readonly number[], tolerance = 1e-12) {
  expect(left).toHaveLength(right.length);
  left.forEach((value, index) => expect(Math.abs(value - right[index])).toBeLessThan(tolerance));
}

function mixWithFreshNmp(feed: ComponentVector, solventMolarRatio: number): ComponentVector {
  const total = 1 + solventMolarRatio;
  return [
    feed[0] / total,
    feed[1] / total,
    feed[2] / total,
    feed[3] / total,
    solventMolarRatio / total,
  ];
}

describe('C2 → ECR-2 thermodynamic handoff', () => {
  it('reconstructs the exact C2 SURROGATE_MW feed vector and produces identical NRTL equilibrium', () => {
    const zC2 = c2FeedMoleFractions(RRBO_W);
    const ecr2Basis = buildECR2ThermodynamicBasis({
      operatingTemperatureC: T_C,
      rrboMassFlow_kg_h: 1000,
      nmpMassFlow_kg_h: 1200,
      rrboMassFractions: RRBO_W,
    });

    expect(ecr2Basis.thermodynamicStateSource).toBe('c2_basis_reconstructed');
    numbersClose(zC2, ecr2Basis.feedMoleFractions);

    // C2 calls nrtlFlash on a mixed RRBO + fresh-NMP stage feed, not on the
    // RRBO-only characterization vector itself.
    const c2FlashFeed = mixWithFreshNmp(zC2, ecr2Basis.solventMolarRatio);
    const ecr2FlashFeed = mixWithFreshNmp(
      ecr2Basis.feedMoleFractions,
      ecr2Basis.solventMolarRatio,
    );
    const x0: ComponentVector = [0.70, 0.10, 0.08, 0.04, 0.08];
    const y0: ComponentVector = [0.12, 0.10, 0.08, 0.05, 0.65];
    const c2Flash = nrtlFlash(c2FlashFeed, T_K, x0, y0);
    const ecr2Flash = nrtlFlash(ecr2FlashFeed, T_K, x0, y0);

    numbersClose(c2Flash.x, ecr2Flash.x);
    numbersClose(c2Flash.y, ecr2Flash.y);
  });

  it('inherits the exact canonical C2 vector without regenerating it', () => {
    const canonicalC2 = c2FeedMoleFractions(RRBO_W);
    const handoff = extractC2ThermodynamicHandoff({
      calculationId: 'c2-run-123',
      workspaceId: 'workspace-456',
      data: {
        lleStageCalculation: {
          inputTrace: {
            feedMoleFractions: canonicalC2,
            temperatureK: T_K,
            solventMolarRatio_molNMP_per_molFeed: 1.5,
          },
        },
      },
    });
    expect(handoff).not.toBeNull();
    const basis = buildECR2ThermodynamicBasis({
      operatingTemperatureC: T_C,
      rrboMassFlow_kg_h: 1000,
      nmpMassFlow_kg_h: 1200,
      rrboMassFractions: [0.40, 0.30, 0.20, 0.10, 0],
      c2ThermodynamicHandoff: handoff!,
    });

    expect(basis.thermodynamicStateSource).toBe('c2_inherited');
    numbersClose(basis.feedMoleFractions, canonicalC2);
    expect(basis.sourceCalculationId).toBe('c2-run-123');
    expect(basis.sourceWorkspaceId).toBe('workspace-456');
    expect(basis.componentIdentities).toEqual([
      'n-dodecane',
      '1,4-xylene',
      '1-methylnaphtalene',
      'pyrene',
      'NMP',
    ]);
  });

  it('injects the accepted persisted C2 result into the ECR-2 input snapshot', () => {
    const canonicalC2 = c2FeedMoleFractions(RRBO_W);
    const ecr2InputSnapshot: Record<string, unknown> = {};
    const injected = injectC2ThermodynamicHandoffForECR2(
      ecr2InputSnapshot,
      {
        lleStageCalculation: {
          inputTrace: {
            feedMoleFractions: canonicalC2,
            temperatureK: T_K,
            solventMolarRatio_molNMP_per_molFeed: 1.5,
          },
        },
      },
      { sourceRevisionId: 'revision-76' },
    );

    expect(injected).toBe(true);
    const basis = buildECR2ThermodynamicBasis({
      operatingTemperatureC: T_C,
      rrboMassFlow_kg_h: 1000,
      nmpMassFlow_kg_h: 1200,
      rrboMassFractions: [0.40, 0.30, 0.20, 0.10, 0],
      c2ThermodynamicHandoff: ecr2InputSnapshot.c2ThermodynamicHandoff as any,
    });

    expect(basis.thermodynamicStateSource).toBe('c2_inherited');
    numbersClose(basis.feedMoleFractions, canonicalC2);
    expect(basis.sourceRevisionId).toBe('revision-76');
    expect(basis.sourceWorkspaceId).toBeNull();
  });

  it('fails closed when persisted C2 state is older than its Process Design inputs', () => {
    const ecr2InputSnapshot: Record<string, unknown> = {};
    expect(() => injectC2ThermodynamicHandoffForECR2(
      ecr2InputSnapshot,
      {
        lleStageCalculation: {
          inputTrace: {
            feedMoleFractions: c2FeedMoleFractions(RRBO_W),
          },
        },
      },
      {
        sourceRevisionId: 'revision-76',
        c2ResultComputedAt: '2026-08-20T10:00:00.000Z',
        c2InputsUpdatedAt: '2026-08-20T10:00:01.000Z',
      },
    )).toThrow('Re-run C2 Process Design before running the ECR-2 simulator');
    expect(ecr2InputSnapshot.c2ThermodynamicHandoff).toBeUndefined();
  });

  it('keeps an inherited C2 boundary closed when local physical composition differs', async () => {
    // Deliberately differs from simulatorInput()'s local physical RRBO
    // composition [0.52, 0.22, 0.16, 0.10]. The C2 coordinate remains the
    // selected thermodynamic basis, while physical kg/h inputs remain separate.
    const c2MassFractions: ComponentVector = [0.40, 0.30, 0.20, 0.10, 0];
    const inheritedC2Vector = c2FeedMoleFractions(c2MassFractions);
    const result = await new LLXECRSimulatorEngine().calculate(simulatorInput({
      c2ThermodynamicHandoff: {
        feedMoleFractions: inheritedC2Vector,
        temperatureK: T_K,
        solventMolarRatio: 1.5,
      },
    }), {});
    const data = result.data as Record<string, any>;
    const boundary = data.boundaryConditions;
    const expectedAverageMw = inheritedC2Vector.reduce((sum, z_i, index) => sum + z_i * [
      SURROGATE_MW.c12,
      SURROGATE_MW.xylene,
      SURROGATE_MW.methylnaphtalene,
      SURROGATE_MW.pyrene,
      SURROGATE_MW.nmp,
    ][index], 0);
    const expectedL = 1000 * 1000 / expectedAverageMw;

    numbersClose(boundary.bottom.x_feed_thermo, inheritedC2Vector);
    expect(boundary.bottom.L_feed_surrogate_mol_h).toBeCloseTo(expectedL, 10);
    const expectedRrboSurrogateMass = inheritedC2Vector.map((z_i, index) =>
      expectedL * z_i * [
        SURROGATE_MW.c12,
        SURROGATE_MW.xylene,
        SURROGATE_MW.methylnaphtalene,
        SURROGATE_MW.pyrene,
        SURROGATE_MW.nmp,
      ][index] / 1000,
    );
    numbersClose(boundary.bottom.surrogateComponentMassRepresentation_kg_h, expectedRrboSurrogateMass);
    expect(boundary.bottom.surrogateComponentMassRepresentation_kg_h.reduce(
      (sum: number, componentMass: number) => sum + componentMass,
      0,
    )).toBeCloseTo(1000, 10);
    expect(boundary.bottom.surrogateComponentMassRepresentation_kg_h[0]).not.toBeCloseTo(520, 10);

    expect(boundary.top.V_feed_surrogate_mol_h).toBeCloseTo(expectedL * 1.5, 10);
    expect(boundary.top.y_feed_thermo).toEqual([0, 0, 0, 0, 1]);
    expect(boundary.top.surrogateComponentMassRepresentation_kg_h[4]).toBeCloseTo(
      boundary.top.V_feed_surrogate_mol_h * SURROGATE_MW.nmp / 1000,
      10,
    );

    // The actual ECR plant boundaries are retained rather than rewritten by
    // the selected C2 thermodynamic surrogate representation.
    expect(data.designBasis.rrboFeed.compositionMassFraction.saturates).toBeCloseTo(0.52, 10);
    expect(data.designBasis.nmpSolvent.massFlow_kg_h).toBe(1200);
  });
});

describe('ECR2MolecularWeights thermodynamic isolation', () => {
  it('retains engineer-edited physical MWs without changing Coto coordinates or NRTL equilibrium', async () => {
    const engine = new LLXECRSimulatorEngine();
    const first = await engine.calculate(simulatorInput(), {});
    const second = await engine.calculate(simulatorInput({
      molecularWeights: {
        saturates_g_mol: tagged(720, 'Literature', 'Engineer override — physical RRBO characterization'),
        mono_g_mol: tagged(410, 'Literature', 'Engineer override — physical RRBO characterization'),
        di_g_mol: tagged(510, 'Literature', 'Engineer override — physical RRBO characterization'),
        poly_g_mol: tagged(650, 'Literature', 'Engineer override — physical RRBO characterization'),
      },
    }), {});

    const firstData = first.data as Record<string, any>;
    const secondData = second.data as Record<string, any>;
    numbersClose(firstData.thermodynamicBasis.feedMoleFractions, secondData.thermodynamicBasis.feedMoleFractions);
    expect(secondData.physicalBasis.physicalBasisStatus).toBe(ECR2_PHYSICAL_BASIS_STATUS);
    expect(secondData.physicalBasis.ecr2MolecularWeights.saturates_g_mol).toMatchObject({
      value: 720,
      sourceType: 'Literature',
      sourceReference: 'Engineer override — physical RRBO characterization',
    });
    expect(secondData.physicalBasis.ecr2MolecularWeights.saturates_g_mol.value).not.toBe(SURROGATE_MW.c12);

    const firstFlash = nrtlFlash(
      mixWithFreshNmp(firstData.thermodynamicBasis.feedMoleFractions, firstData.thermodynamicBasis.solventMolarRatio),
      T_K,
      [0.7, 0.1, 0.08, 0.04, 0.08],
      [0.12, 0.10, 0.08, 0.05, 0.65],
    );
    const secondFlash = nrtlFlash(
      mixWithFreshNmp(secondData.thermodynamicBasis.feedMoleFractions, secondData.thermodynamicBasis.solventMolarRatio),
      T_K,
      [0.7, 0.1, 0.08, 0.04, 0.08],
      [0.12, 0.10, 0.08, 0.05, 0.65],
    );
    numbersClose(firstFlash.x, secondFlash.x);
    numbersClose(firstFlash.y, secondFlash.y);
  });

  it('changes thermodynamic coordinates when RRBO characterization changes', () => {
    const original = buildECR2ThermodynamicBasis({
      operatingTemperatureC: T_C,
      rrboMassFlow_kg_h: 1000,
      nmpMassFlow_kg_h: 1200,
      rrboMassFractions: RRBO_W,
    });
    const changed = buildECR2ThermodynamicBasis({
      operatingTemperatureC: T_C,
      rrboMassFlow_kg_h: 1000,
      nmpMassFlow_kg_h: 1200,
      rrboMassFractions: [0.32, 0.28, 0.22, 0.18, 0],
    });

    expect(changed.feedMoleFractions).not.toEqual(original.feedMoleFractions);
  });

  it('does not invent a missing system default or an override flag outside the existing contract', async () => {
    const result = await new LLXECRSimulatorEngine().calculate(simulatorInput(), {});
    const physicalBasis = (result.data as Record<string, any>).physicalBasis;
    expect(physicalBasis.systemDefaultAvailability)
      .toBe('not_exposed_by_current_input_contract__no_default_value_invented');
    expect(physicalBasis.overrideStatus)
      .toBe('source_tag_retained__explicit_override_flag_not_supported_by_current_input_contract');
    expect(physicalBasis.ecr2MolecularWeights.mono_g_mol).toMatchObject({
      value: 190,
      sourceType: 'Assumed',
      sourceReference: 'Existing physical characterization fixture',
    });
  });
});

describe('ECR-2 preliminary d32 phase applicability', () => {
  const publishedD32 = {
    mode: 'published_correlation',
    correlationId: 'ecr2_d32_kh1996',
  };

  it('calculates published K&H 1996 d32 only for NMP-continuous/RRBO-dispersed operation', async () => {
    const result = await new LLXECRSimulatorEngine().calculate(
      simulatorInput({
        d32Config: publishedD32,
        statorOpenAreaFraction: { value: 0.23, unit: '-', sourceType: 'Assumed', sourceReference: 'test fixture' },
        rotorSpeed_rpm: 60,
      }),
      {},
    );
    const data = result.data as Record<string, any>;
    const d32 = data.d32;
    expect(d32.status).toBe('preliminary_engineering_reconstruction');
    expect(d32.correlationStatus).toBe('preliminary_engineering_reconstruction');
    expect(d32.d32_m).toBeGreaterThan(0);
    expect(data.forwardSimulationStatus.d32).toContain('Published Correlation — Preliminary Engineering');
    expect(data.forwardSimulationStatus.d32).toContain('RRBO/NMP validation');
    expect(data.forwardSimulationStatus.interfacialArea).toContain('Preliminary Engineering');
    expect(result.warnings.some((warning: any) =>
      warning.code === 'INTERFACIAL_AREA_COMPUTED' &&
      warning.message.includes('Published Correlation — Preliminary Engineering') &&
      warning.message.includes('RRBO/NMP validation'),
    )).toBe(true);
  });

  it('fails closed for published K&H 1996 d32 when RRBO is configured as continuous', async () => {
    const result = await new LLXECRSimulatorEngine().calculate(
      simulatorInput({
        phaseConfiguration: 'rrbo_continuous_nmp_dispersed',
        d32Config: publishedD32,
      }),
      {},
    );
    const data = result.data as Record<string, any>;
    expect(data.d32.status).toBe('phase_configuration_unsupported');
    expect(data.d32.correlationStatus).toBe('phase_configuration_unsupported');
    expect(data.d32.d32_m).toBeNull();
    expect(data.d32.diagnostics.join(' ')).toContain('nmp_continuous_rrbo_dispersed');
    expect(data.forwardSimulationStatus.d32).toContain('phase_configuration_unsupported');
    expect(data.forwardSimulationStatus.d32).toContain('nmp_continuous_rrbo_dispersed');
  });

  it('reports engineer-supplied d32 with its actual source status', async () => {
    const result = await new LLXECRSimulatorEngine().calculate(
      simulatorInput({
        phaseConfiguration: 'rrbo_continuous_nmp_dispersed',
        d32Config: {
          mode: 'engineer_supplied',
          value_m: 0.002,
          sourceType: 'Assumed',
          sourceReference: 'Engine-level phase applicability test',
        },
      }),
      {},
    );
    const d32 = (result.data as Record<string, any>).d32;
    expect(d32.status).toBe('engineer_supplied');
    expect(d32.correlationStatus).toBe('engineer_supplied');
    expect(d32.d32_m).toBe(0.002);
  });
});

describe('SURROGATE-REPRESENTATION MASS CLOSURE', () => {
  it('recovers every input component mass with the same surrogate MW used in both directions', () => {
    const feedMassFlow_kg_h = 1000;
    const surrogateMw = [
      SURROGATE_MW.c12,
      SURROGATE_MW.xylene,
      SURROGATE_MW.methylnaphtalene,
      SURROGATE_MW.pyrene,
      SURROGATE_MW.nmp,
    ];

    RRBO_W.forEach((massFraction, index) => {
      const inputMass_kg_h = feedMassFlow_kg_h * massFraction;
      const surrogateMolarFlow_mol_h = inputMass_kg_h * 1000 / surrogateMw[index];
      const recoveredMass_kg_h = surrogateMolarFlow_mol_h * surrogateMw[index] / 1000;
      expect(Math.abs(recoveredMass_kg_h - inputMass_kg_h)).toBeLessThan(1e-12);
    });
  });
});