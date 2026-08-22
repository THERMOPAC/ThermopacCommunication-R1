import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  ECR2ClosureEngineerPropertyInput,
  ECR2GovernedPropertyInputs,
  ECR2LocalPropertyClosureResult,
} from '../server/engines/llx/llx-ecr2-local-property-closure';
import {
  ECR2_LOCALITY_WARNING_CODES,
  isECR2LocalPropertyClosureResolved,
  resolveECR2LocalProperties,
  toECR2KernelPropertyResult,
} from '../server/engines/llx/llx-ecr2-local-property-closure';
import type {
  DiffusivityInput,
  ECR2DiffusivityContract,
} from '../server/engines/llx/llx-ecr2-diffusivity';
import {
  computeAllSchmidtNumbers,
} from '../server/engines/llx/llx-ecr2-diffusivity';
import {
  computeDimensionlessNumbers,
} from '../server/engines/llx/llx-ecr2-dimensionless';
import { getProperty } from '../server/engine-framework/common-engineering-library';
import {
  resolveRrboSn300DynamicViscosityAtTemperature,
} from '../shared/ecr2-stage8-transport-basis';
import {
  resolveEcr2RrboNmpInterfacialTensionAtTemperature,
} from '../shared/ecr2-interfacial-tension-basis';

const TEMPERATURE_C = 70;
const X_LOCAL = [0.42, 0.28, 0.14, 0.10, 0.06];
const Y_LOCAL = [0.04, 0.03, 0.02, 0.01, 0.90];

function engineer(
  value: number,
  unit: string,
  sourceReference: string,
  referenceTemperature_C = TEMPERATURE_C,
): ECR2ClosureEngineerPropertyInput {
  return {
    value,
    unit,
    sourceType: 'Assumed',
    sourceReference,
    referenceTemperature_C,
  };
}

function diffusivity(
  value_m2_s: number,
  sourceReference: string,
  referenceTemperature_C = TEMPERATURE_C,
): DiffusivityInput {
  return {
    value_m2_s,
    sourceType: 'Assumed',
    sourceReference,
    referenceTemperature_C,
    method: 'Unit-test engineer estimate',
    status: 'engineer_supplied',
  };
}

function makeDiffusivityContract(
  referenceTemperature_C = TEMPERATURE_C,
): ECR2DiffusivityContract {
  return {
    Sat: {
      De_c: diffusivity(2.5e-9, 'Sat continuous diffusivity', referenceTemperature_C),
      De_d: diffusivity(2.2e-9, 'Sat dispersed diffusivity', referenceTemperature_C),
    },
    Mono: {
      De_c: diffusivity(2.0e-9, 'Mono continuous diffusivity', referenceTemperature_C),
      De_d: diffusivity(1.8e-9, 'Mono dispersed diffusivity', referenceTemperature_C),
    },
    Di: {
      De_c: diffusivity(1.6e-9, 'Di continuous diffusivity', referenceTemperature_C),
      De_d: diffusivity(1.4e-9, 'Di dispersed diffusivity', referenceTemperature_C),
    },
    Poly: {
      De_c: diffusivity(1.2e-9, 'Poly continuous diffusivity', referenceTemperature_C),
      De_d: diffusivity(1.0e-9, 'Poly dispersed diffusivity', referenceTemperature_C),
    },
    NMP: {
      De_c: diffusivity(2.4e-9, 'NMP continuous diffusivity', referenceTemperature_C),
      De_d: diffusivity(1.9e-9, 'NMP dispersed diffusivity', referenceTemperature_C),
    },
  };
}

function makeInputs(
  overrides: Partial<ECR2GovernedPropertyInputs> = {},
): ECR2GovernedPropertyInputs {
  return {
    rrboGradeId: 'rrbo-sn300',
    mu_d_engineer: engineer(0.008, 'Pa.s', 'RRBO viscosity at 70 °C'),
    sigma_engineer: engineer(0.012, 'N/m', 'NMP/RRBO interfacial tension at 70 °C'),
    diffusivity: makeDiffusivityContract(),
    ...overrides,
  };
}

function resolve(
  inputs: ECR2GovernedPropertyInputs = makeInputs(),
  x_local = X_LOCAL,
  y_local = Y_LOCAL,
  temperature_C = TEMPERATURE_C,
): ECR2LocalPropertyClosureResult {
  return resolveECR2LocalProperties(
    { x_local, y_local, compartmentIndex: 1 },
    temperature_C,
    inputs,
  );
}

function resolvedSnapshot(
  result: ECR2LocalPropertyClosureResult,
) {
  if (!isECR2LocalPropertyClosureResolved(result)) {
    throw new Error(`Expected resolved closure: ${result.errors.join(' ')}`);
  }
  return result.snapshot;
}

describe('ECR-2 preliminary local-property closure', () => {
  it('returns a deterministic snapshot for the same inputs', () => {
    const first = resolve();
    const second = resolve();
    expect(first).toEqual(second);
    expect(isECR2LocalPropertyClosureResolved(first)).toBe(true);
  });

  it('returns identical output for identical inputs on repeated calls', () => {
    const input = makeInputs();
    const first = resolvedSnapshot(resolve(input));
    const second = resolvedSnapshot(resolve(input));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('fails closed for invalid engineer density fallback', () => {
    const result = resolve(makeInputs({
      rrboGradeId: 'unregistered-rrbo-grade',
      rho_d_engineer: engineer(0, 'kg/m3', 'invalid density'),
    }));
    expect(result.status).toBe('blocked');
    expect(result.errors.join(' ')).toMatch(/rho_d/);
    expect(result.snapshot).toBeNull();
  });

  it('fails closed for invalid RRBO viscosity', () => {
    const result = resolve(makeInputs({
      mu_d_engineer: engineer(-0.001, 'Pa.s', 'invalid viscosity'),
    }));
    expect(result.status).toBe('blocked');
    expect(result.errors.join(' ')).toMatch(/mu_d/);
  });

  it('fails closed for invalid interfacial tension', () => {
    const result = resolve(makeInputs({
      sigma_engineer: engineer(0, 'N/m', 'invalid interfacial tension'),
    }));
    expect(result.status).toBe('blocked');
    expect(result.errors.join(' ')).toMatch(/sigma/);
  });

  it('fails closed by component and phase when diffusivity is missing', () => {
    const contract = makeDiffusivityContract();
    contract.Di.De_d = null;
    const result = resolve(makeInputs({ diffusivity: contract }));
    expect(result.status).toBe('blocked');
    expect(result.errors.join(' ')).toMatch(/diffusivity\.Di\.De_d.*missing/);
  });

  it('retains source provenance on every resolved property', () => {
    const snapshot = resolvedSnapshot(resolve());
    expect(snapshot.properties.rho_c.sourceType).toBe('EPD_Library');
    expect(snapshot.properties.rho_c.sourceReference).toContain('EPD NMP');
    expect(snapshot.properties.mu_d.sourceType).toBe('Assumed');
    expect(snapshot.properties.mu_d.sourceReference).toBe('RRBO viscosity at 70 °C');
    expect(snapshot.properties.sigma.sourceReference).toBe('NMP/RRBO interfacial tension at 70 °C');
    expect(snapshot.properties.D_c_i.every((property) => property.sourceReference)).toBe(true);
    expect(snapshot.properties.D_d_i.every((property) => property.sourceReference)).toBe(true);
  });

  it('uses pure-NMP density at operating temperature with the required basis', () => {
    const property = resolvedSnapshot(resolve()).properties.rho_c;
    expect(property.basis).toBe('continuous_phase_pure_NMP_temperature_basis');
    expect(property.validationStatus).toBe('PRELIMINARY_PURE_PHASE_PROPERTY');
    expect(property.localityStatus).toBe('LOCAL_PROPERTY_PRELIMINARY_PURE_PHASE');
    expect(property.warnings).toContain(
      ECR2_LOCALITY_WARNING_CODES.continuousComposition,
    );
  });

  it('uses pure-NMP viscosity at operating temperature with the required basis', () => {
    const property = resolvedSnapshot(resolve()).properties.mu_c;
    expect(property.basis).toBe('pure_NMP_temperature_basis_preliminary');
    expect(property.validationStatus).toBe('PRELIMINARY_PURE_PHASE_PROPERTY');
    expect(property.warnings).toContain(
      ECR2_LOCALITY_WARNING_CODES.continuousComposition,
    );
  });

  it('uses the grade-specific RRBO density route before engineer fallback', () => {
    const property = resolvedSnapshot(resolve()).properties.rho_d;
    expect(property.sourceType).toBe('EPD_Library');
    expect(property.basis).toBe('rrbo_grade_temperature_basis_preliminary');
    expect(property.validationStatus).toBe('PRELIMINARY_RRBO_PROPERTY');
  });

  it('uses an explicit engineer RRBO density when the grade route is unavailable', () => {
    const property = resolvedSnapshot(resolve(makeInputs({
      rrboGradeId: 'unregistered-rrbo-grade',
      rho_d_engineer: engineer(860, 'kg/m3', 'Measured RRBO density fallback'),
    }))).properties.rho_d;
    expect(property.value).toBe(860);
    expect(property.localityStatus).toBe('LOCAL_PROPERTY_ENGINEER_SUPPLIED');
    expect(property.sourceReference).toBe('Measured RRBO density fallback');
  });

  it('uses the explicit engineer RRBO viscosity route', () => {
    const property = resolvedSnapshot(resolve()).properties.mu_d;
    expect(property.value).toBe(0.008);
    expect(property.basis).toBe(
      'engineer_supplied_rrbo_viscosity_at_operating_temperature_preliminary',
    );
    expect(property.validationStatus).toBe('PRELIMINARY_RRBO_PROPERTY');
    expect(property.warnings).toContain(
      ECR2_LOCALITY_WARNING_CODES.dispersedComposition,
    );
  });

  it('uses the governed RRBO SN300 temperature route when the available viscosity anchor is at 40 °C', () => {
    const anchorAt40_Pa_s = 0.052;
    const densityAt40 = getProperty('rrbo-sn300', 'density', 40).value;
    const densityAt70 = getProperty('rrbo-sn300', 'density', TEMPERATURE_C).value;
    const resolved = resolveRrboSn300DynamicViscosityAtTemperature({
      temperature_C: TEMPERATURE_C,
      density_kg_m3: densityAt70,
      kinematicViscosity40_cSt: anchorAt40_Pa_s * 1e6 / densityAt40,
    });
    expect(resolved).toBeDefined();
    if (!resolved) return;

    const snapshot = resolvedSnapshot(resolve(makeInputs({
      mu_d_engineer: engineer(anchorAt40_Pa_s, 'Pa.s', 'RRBO viscosity anchor at 40 °C', 40),
      mu_d_governed: {
        value: resolved.value_Pa_s,
        unit: 'Pa.s',
        sourceType: 'Thermopac',
        sourceReference: `${resolved.source}; controlled test 40 °C anchor`,
        referenceTemperature_C: TEMPERATURE_C,
        method: resolved.method,
        basis: `rrbo_sn300_astm_d341_walther_operating_temperature_preliminary; ${resolved.applicability}`,
        warnings: resolved.warnings,
      },
    })));

    expect(snapshot.mu_d_Pa_s).toBeCloseTo(resolved.value_Pa_s, 12);
    expect(snapshot.mu_d_Pa_s).not.toBe(anchorAt40_Pa_s);
    expect(snapshot.properties.mu_d.sourceType).toBe('Thermopac');
    expect(snapshot.properties.mu_d.referenceTemperature_C).toBe(TEMPERATURE_C);
    expect(snapshot.properties.mu_d.method).toContain('ASTM D341/Walther');
    expect(snapshot.properties.mu_d.basis).toContain('rrbo_sn300_astm_d341_walther');
    expect(snapshot.properties.mu_d.warnings).toContain('RRBO_NMP_VALIDATION_PENDING');
  });

  it('resolves every local property at the Stage 4 40 °C condition when that is the supplied operating temperature', () => {
    const snapshot = resolvedSnapshot(resolve(makeInputs({
      mu_d_engineer: engineer(0.052, 'Pa.s', 'RRBO viscosity at 40 °C', 40),
      sigma_engineer: engineer(0.012, 'N/m', 'NMP/RRBO interfacial tension at 40 °C', 40),
      diffusivity: makeDiffusivityContract(40),
    }), X_LOCAL, Y_LOCAL, 40));

    const allProperties = [
      snapshot.properties.rho_c,
      snapshot.properties.rho_d,
      snapshot.properties.mu_c,
      snapshot.properties.mu_d,
      snapshot.properties.sigma,
      ...snapshot.properties.D_c_i,
      ...snapshot.properties.D_d_i,
    ];
    expect(snapshot.temperature_C).toBe(40);
    expect(allProperties.every((property) => property.referenceTemperature_C === 40)).toBe(true);
    expect(snapshot.properties.rho_c.sourceReference).toContain('40 °C');
    expect(snapshot.properties.rho_d.sourceReference).toContain('40 °C');
    expect(snapshot.properties.mu_c.sourceReference).toContain('40 °C');
  });

  it('names the governed operating-temperature route as the dependency when neither route applies', () => {
    const result = resolve(makeInputs({
      rrboGradeId: 'unregistered-rrbo-grade',
      rho_d_engineer: engineer(860, 'kg/m3', 'RRBO density fallback at 70 °C'),
      mu_d_engineer: engineer(0.052, 'Pa.s', 'RRBO viscosity anchor at 40 °C', 40),
      mu_d_governed: null,
    }));

    expect(result.status).toBe('blocked');
    expect(result.errors.join(' ')).toContain('no governed RRBO operating-temperature viscosity route applies');
  });

  it('uses the explicit column-constant interfacial-tension route', () => {
    const property = resolvedSnapshot(resolve()).properties.sigma;
    expect(property.value).toBe(0.012);
    expect(property.basis).toBe('column_constant_engineer_supplied_preliminary');
    expect(property.localityStatus).toBe('LOCAL_PROPERTY_ENGINEER_SUPPLIED');
    expect(property.validationStatus).toBe('PRELIMINARY_COLUMN_CONSTANT_PROPERTY');
    expect(property.warnings).toContain(
      ECR2_LOCALITY_WARNING_CODES.interfacialTensionComposition,
    );
  });

  it('resolves an anchored sigma through the controlled temperature route and retains its provenance', () => {
    const resolved = resolveEcr2RrboNmpInterfacialTensionAtTemperature({
      temperature_C: TEMPERATURE_C,
      anchor: {
        value_N_m: 0.014,
        temperature_C: 40,
        sourceType: 'Measured',
        sourceReference: 'RRBO/NMP IFT laboratory series — anchor at 40 °C',
      },
      temperatureCoefficient: {
        slopePerC: -0.00003,
        sourceType: 'Literature',
        sourceReference: 'Approved RRBO/NMP IFT temperature coefficient memorandum',
      },
    });
    expect(resolved).toBeDefined();
    if (!resolved) return;
    const measuredAnchor: ECR2ClosureEngineerPropertyInput = {
      value: resolved.anchor.value_N_m,
      unit: 'N/m',
      sourceType: resolved.anchor.sourceType,
      sourceReference: resolved.anchor.sourceReference,
      referenceTemperature_C: resolved.anchor.temperature_C,
    };

    const snapshot = resolvedSnapshot(resolve(makeInputs({
      sigma_engineer: measuredAnchor,
      sigma_governed: {
        value: resolved.value_N_m,
        unit: 'N/m',
        sourceType: resolved.sourceType,
        sourceReference: resolved.sourceReference,
        referenceTemperature_C: resolved.requestedTemperature_C,
        method: resolved.method,
        basis: resolved.basis,
        warnings: resolved.warnings,
        anchor: measuredAnchor,
      },
    })));

    expect(snapshot.properties.sigma.value).toBeCloseTo(0.0131, 12);
    expect(snapshot.properties.sigma.referenceTemperature_C).toBe(TEMPERATURE_C);
    expect(snapshot.properties.sigma.method).toContain('sigma(T) = sigma_anchor');
    expect(snapshot.properties.sigma.sourceReference).toBe(resolved.anchor.sourceReference);
    expect(snapshot.properties.sigma.anchor).toMatchObject({
      value: resolved.anchor.value_N_m,
      referenceTemperature_C: resolved.anchor.temperature_C,
      sourceType: resolved.anchor.sourceType,
      sourceReference: resolved.anchor.sourceReference,
    });
    expect(snapshot.properties.sigma.warnings).toEqual(
      expect.arrayContaining(resolved.warnings),
    );
  });

  it('does not resolve sigma outside the controlled route range or without coefficient provenance', () => {
    const anchor = {
      value_N_m: 0.014,
      temperature_C: 40,
      sourceType: 'Measured',
      sourceReference: 'RRBO/NMP IFT laboratory series — anchor at 40 °C',
    };
    expect(resolveEcr2RrboNmpInterfacialTensionAtTemperature({
      temperature_C: 101,
      anchor,
      temperatureCoefficient: {
        slopePerC: -0.00003,
        sourceType: 'Literature',
        sourceReference: 'Approved coefficient',
      },
    })).toBeUndefined();
    expect(resolveEcr2RrboNmpInterfacialTensionAtTemperature({
      temperature_C: 70,
      anchor,
      temperatureCoefficient: {
        slopePerC: -0.00003,
        sourceType: 'Literature',
        sourceReference: '',
      },
    })).toBeUndefined();
  });

  it('retains five diffusivities per phase in Sat/Mono/Di/Poly/NMP order', () => {
    const snapshot = resolvedSnapshot(resolve());
    expect(snapshot.D_c_i_m2_s).toEqual([2.5e-9, 2.0e-9, 1.6e-9, 1.2e-9, 2.4e-9]);
    expect(snapshot.D_d_i_m2_s).toEqual([2.2e-9, 1.8e-9, 1.4e-9, 1.0e-9, 1.9e-9]);
    expect(snapshot.properties.D_c_i[4].sourceReference).toBe('NMP continuous diffusivity');
    expect(snapshot.properties.D_d_i[0].sourceReference).toBe('Sat dispersed diffusivity');
  });

  it('does not provide a silent default when required viscosity is absent', () => {
    const result = resolve(makeInputs({ mu_d_engineer: null }));
    expect(result.status).toBe('blocked');
    expect(result.snapshot).toBeNull();
    expect(result.errors.join(' ')).toMatch(/required engineer-supplied property is missing/);
  });

  it('does not mutate local compositions or normalize them', () => {
    const x = [...X_LOCAL];
    const y = [...Y_LOCAL];
    const before = { x: [...x], y: [...y] };
    const result = resolve(makeInputs(), x, y);
    expect(result.status).toBe('resolved');
    expect(x).toEqual(before.x);
    expect(y).toEqual(before.y);
  });

  it('does not call or import the NRTL model', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'server/engines/llx/llx-ecr2-local-property-closure.ts'),
      'utf8',
    );
    expect(source).not.toContain('computeLocalNRTL');
    expect(source).not.toContain('llx-ecr2-local-nrtl');
  });

  it('retains all required composition-dependence warnings in the snapshot', () => {
    const snapshot = resolvedSnapshot(resolve());
    expect(snapshot.localityWarnings).toEqual([
      ECR2_LOCALITY_WARNING_CODES.continuousComposition,
      ECR2_LOCALITY_WARNING_CODES.dispersedComposition,
      ECR2_LOCALITY_WARNING_CODES.interfacialTensionComposition,
      ECR2_LOCALITY_WARNING_CODES.diffusivityComposition,
    ]);
    expect(snapshot.diagnostics).toEqual(expect.arrayContaining(snapshot.localityWarnings));
  });

  it('retains operating temperature as property reference temperature', () => {
    const snapshot = resolvedSnapshot(resolve());
    const allProperties = [
      snapshot.properties.rho_c,
      snapshot.properties.rho_d,
      snapshot.properties.mu_c,
      snapshot.properties.mu_d,
      snapshot.properties.sigma,
      ...snapshot.properties.D_c_i,
      ...snapshot.properties.D_d_i,
    ];
    expect(allProperties.every((property) => property.referenceTemperature_C === TEMPERATURE_C)).toBe(true);
  });

  it('is compatible with the frozen local-kernel numeric property inputs', () => {
    const snapshot = resolvedSnapshot(resolve());
    const inputs = makeInputs();
    expect(snapshot.rho_c_kg_m3).toBe(snapshot.properties.rho_c.value);
    expect(snapshot.rho_d_kg_m3).toBe(snapshot.properties.rho_d.value);
    expect(snapshot.mu_c_Pa_s).toBe(snapshot.properties.mu_c.value);
    expect(snapshot.mu_d_Pa_s).toBe(snapshot.properties.mu_d.value);
    expect(snapshot.sigma_N_m).toBe(snapshot.properties.sigma.value);
    expect(snapshot.D_c_i_m2_s).toEqual(snapshot.properties.D_c_i.map((property) => property.value));
    expect(snapshot.D_d_i_m2_s).toEqual(snapshot.properties.D_d_i.map((property) => property.value));

    const dimensionless = computeDimensionlessNumbers({
      U_slip_m_s: 0.001,
      d32_m: 0.0005,
      rho_c: toECR2KernelPropertyResult(snapshot.properties.rho_c),
      mu_c: toECR2KernelPropertyResult(snapshot.properties.mu_c),
      mu_d: toECR2KernelPropertyResult(snapshot.properties.mu_d),
      sigma: toECR2KernelPropertyResult(snapshot.properties.sigma),
    });
    expect(dimensionless.Re_d).toBeTypeOf('number');
    expect(dimensionless.kappa).toBeTypeOf('number');

    const schmidt = computeAllSchmidtNumbers({
      diffusivity: inputs.diffusivity,
      rho_c: toECR2KernelPropertyResult(snapshot.properties.rho_c),
      rho_d: toECR2KernelPropertyResult(snapshot.properties.rho_d),
      mu_c: toECR2KernelPropertyResult(snapshot.properties.mu_c),
      mu_d: toECR2KernelPropertyResult(snapshot.properties.mu_d),
    });
    expect(schmidt.Sat.Sc_c).toBeTypeOf('number');
    expect(schmidt.NMP.Sc_d).toBeTypeOf('number');
  });

  it('does not leak a stale snapshot when temperature or engineer inputs change', () => {
    const first = resolvedSnapshot(resolve());
    const changed = resolvedSnapshot(resolve(makeInputs({
      mu_d_engineer: engineer(0.010, 'Pa.s', 'Changed RRBO viscosity at 60 °C', 60),
      sigma_engineer: engineer(0.010, 'N/m', 'Changed interfacial tension at 60 °C', 60),
      diffusivity: {
        ...makeDiffusivityContract(60),
        Sat: {
          De_c: diffusivity(3.5e-9, 'Changed Sat continuous diffusivity', 60),
          De_d: diffusivity(3.1e-9, 'Changed Sat dispersed diffusivity', 60),
        },
      },
    }), X_LOCAL, Y_LOCAL, 60));
    expect(changed.temperature_C).toBe(60);
    expect(changed.mu_d_Pa_s).toBe(0.010);
    expect(changed.sigma_N_m).toBe(0.010);
    expect(changed.D_c_i_m2_s[0]).toBe(3.5e-9);
    expect(first.temperature_C).toBe(70);
    expect(first.mu_d_Pa_s).toBe(0.008);
  });

  it('fails closed for invalid provenance and mismatched reference temperature', () => {
    const result = resolve(makeInputs({
      mu_d_engineer: engineer(0.008, 'Pa.s', '', 60),
    }));
    expect(result.status).toBe('blocked');
    expect(result.errors.join(' ')).toMatch(/mu_d_engineer/);
    expect(result.errors.join(' ')).toMatch(/Stage 4 Extraction Temperature/);
  });

  it('names sigma as the evidence gap when its record cannot be resolved at the Stage 4 temperature', () => {
    const result = resolve(makeInputs({
      sigma_engineer: engineer(0.012, 'N/m', 'NMP/RRBO interfacial tension at 70 °C', 70),
      mu_d_engineer: engineer(0.052, 'Pa.s', 'RRBO viscosity at 40 °C', 40),
      diffusivity: makeDiffusivityContract(40),
    }), X_LOCAL, Y_LOCAL, 40);

    expect(result.status).toBe('blocked');
    expect(result.errors.join(' ')).toContain('sigma_engineer');
    expect(result.errors.join(' ')).toContain('no governed temperature route resolves this property');
  });

  it('fails closed for missing diffusivity provenance', () => {
    const contract = makeDiffusivityContract();
    contract.NMP.De_c = {
      ...contract.NMP.De_c!,
      sourceReference: '',
    };
    const result = resolve(makeInputs({ diffusivity: contract }));
    expect(result.status).toBe('blocked');
    expect(result.errors.join(' ')).toMatch(/diffusivity\.NMP\.De_c.*provenance/);
  });

  it('returns blocked rather than throwing for a malformed diffusivity record', () => {
    const contract = makeDiffusivityContract();
    contract.Sat.De_c = {
      ...contract.Sat.De_c!,
      method: 7 as unknown as string,
    };

    expect(() => resolve(makeInputs({ diffusivity: contract }))).not.toThrow();
    const result = resolve(makeInputs({ diffusivity: contract }));
    expect(result.status).toBe('blocked');
    expect(result.errors.join(' ')).toMatch(/diffusivity\.Sat\.De_c.*method/);
  });

  it('rejects invalid local composition rather than silently normalizing it', () => {
    const result = resolve(makeInputs(), [0.4, 0.2, 0.1, 0.1, 0.05], Y_LOCAL);
    expect(result.status).toBe('blocked');
    expect(result.errors.join(' ')).toMatch(/x_local/);
  });

  it('exposes immutable snapshot containers for future compartment reuse', () => {
    const snapshot = resolvedSnapshot(resolve());
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.properties)).toBe(true);
    expect(Object.isFrozen(snapshot.D_c_i_m2_s)).toBe(true);
    expect(Object.isFrozen(snapshot.properties.D_c_i)).toBe(true);
  });

  it('preserves engineer provenance when adapting snapshot diffusivity', () => {
    const snapshot = resolvedSnapshot(resolve());
    const adaptedDiffusivity = toECR2KernelPropertyResult(snapshot.properties.D_c_i[0]);
    const adaptedDensity = toECR2KernelPropertyResult(snapshot.properties.rho_c);

    expect(adaptedDiffusivity.status).toBe('engineer_supplied');
    expect(adaptedDiffusivity.sourceType).toBe('Assumed');
    expect(adaptedDiffusivity.sourceReference).toBe('Sat continuous diffusivity');
    expect(adaptedDensity.status).toBe('library');
    expect(adaptedDensity.sourceType).toBe('EPD_Library');
  });
});