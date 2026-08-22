// ─────────────────────────────────────────────────────────────────────────────
// ECR-2 — d₃₂ Plug-In Interface Tests
//
// Tests for:
//   · computeDropletDiameter() — both modes
//   · isD32Usable() — usability guard
//   · Engineer-supplied mode: value validation, labelling, guards, advisories
//   · Published-correlation mode: approved K&H 1996 preliminary reconstruction
//   · Interface contract: double-exponent notation absent, correct label text
//   · Driving-force contract existence
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  computeDropletDiameter,
  isD32Usable,
  drivingForceContractDefined,
  drivingForceContractNote,
  type D32LocalState,
  type EngineerSuppliedD32Config,
  type PublishedCorrelationD32Config,
  type DirectTurbulencePreliminaryD32Config,
} from '../server/engines/llx/llx-ecr2-d32-interface';

// ── Shared test state ─────────────────────────────────────────────────────────

const VALID_LOCAL_STATE: D32LocalState = {
  h_comp_m:        0.06,    // 60 mm compartment height
  psi_W_kg:        0.012,   // 12 mW/kg specific power
  rho_c_kg_m3:     1020,    // NMP continuous phase
  rho_d_kg_m3:     870,     // RRBO dispersed phase
  delta_rho_kg_m3: 150,
  sigma_N_m:       0.015,   // 15 mN/m
  xf_stator:       0.23,
  phi_d:           0.20,
  z_m:             0.5,
  compartmentIndex: 5,
};

const ENGINEER_CFG_VALID: EngineerSuppliedD32Config = {
  mode: 'engineer_supplied',
  value_m: 0.002,           // 2 mm
  sourceType: 'Assumed',
  sourceReference: 'Analogous Kühni ECR60 pilot — assumed for simulator development',
};

const PUBLISHED_CFG: PublishedCorrelationD32Config = {
  mode: 'published_correlation',
  correlationId: 'ecr2_d32_kh1996',
};

const DIRECT_TURBULENCE_CFG: DirectTurbulencePreliminaryD32Config = {
  mode: 'direct_turbulence_preliminary',
  correlationId: 'ecr2_d32_direct_turbulence_preliminary',
  C_nominal: 0.4,
  sourceType: 'Literature',
  sourceReference: 'Controlled preliminary C selection',
};

const RESULT_META = {
  d32_raw_m: null,
  engineeringBasis: 'test',
  governanceStatus: 'test',
  primarySourceVerified: false,
  validatedForRRBONMP: false,
  pilotCalibrationStatus: 'test',
  calibrationFactor: null,
  localAxialApplication: 'test',
};

// ── 1. Published-correlation transcription invalidation ───────────────────────

describe('computeDropletDiameter — published_correlation transcription invalidation', () => {
  it('returns a non-usable transcription-invalid result instead of the legacy reconstruction', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, PUBLISHED_CFG);
    expect(result.status).toBe('transcription_invalid');
    expect(result.mode).toBe('published_correlation');
    expect(result.correlationId).toBe('ecr2_d32_kh1996');
    expect(result.d32_m).toBeNull();
    expect(result.d32_raw_m).toBeNull();
    expect(isD32Usable(result)).toBe(false);
  });

  it('records the reciprocal high-agitation conflict and unresolved notation', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, PUBLISHED_CFG);
    const diagnostics = result.diagnostics.join(' ');
    expect(diagnostics).toContain('reciprocal high-agitation contribution');
    expect(diagnostics).toContain('Rahimpour et al. (2024)');
    expect(diagnostics).toContain('Pulse and karr');
    expect(diagnostics).not.toContain('Mirzaei');
    expect(diagnostics).toContain('TRANSCRIPTION_INVALID__LEGACY_C1_N1_AND_DIRECT_HIGH_AGITATION_TERM');
    expect(diagnostics).toContain('KH1996_H_UNRESOLVED__NUMERICAL_EXECUTION_DISABLED');
    expect(diagnostics).toContain('KH1996_NUMERATOR_SYMBOL_UNRESOLVED__NUMERICAL_EXECUTION_DISABLED');
    expect(result.primarySourceVerified).toBe(false);
    expect(result.pilotCalibrationStatus).toBe('NOT_APPLICABLE__TRANSCRIPTION_INVALID');
  });

  it('never re-enables the legacy calculation when local inputs change', () => {
    const changedState = {
      ...VALID_LOCAL_STATE,
      h_comp_m: 0.75,
      psi_W_kg: 0.0671435,
      sigma_N_m: 0.009,
      rho_c_kg_m3: 1040,
    };
    const result = computeDropletDiameter(changedState, PUBLISHED_CFG);
    expect(result.status).toBe('transcription_invalid');
    expect(result.d32_m).toBeNull();
    expect(result.d32_raw_m).toBeNull();
    expect(result.provenance).toContain('approximately 10.299 m');
  });
});

// ── 2. Engineer-supplied mode — valid input ────────────────────────────────────

describe('computeDropletDiameter — engineer_supplied mode — valid input', () => {
  it('returns status=engineer_supplied', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, ENGINEER_CFG_VALID);
    expect(result.status).toBe('engineer_supplied');
  });

  it('returns the supplied d32_m value', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, ENGINEER_CFG_VALID);
    expect(result.d32_m).toBe(0.002);
  });

  it('returns mode=engineer_supplied', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, ENGINEER_CFG_VALID);
    expect(result.mode).toBe('engineer_supplied');
  });

  it('correlationId is null for engineer_supplied', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, ENGINEER_CFG_VALID);
    expect(result.correlationId).toBeNull();
  });

  it('label contains "Engineer-Supplied"', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, ENGINEER_CFG_VALID);
    expect(result.label).toContain('Engineer-Supplied');
  });

  it('label contains "Simulator Development"', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, ENGINEER_CFG_VALID);
    expect(result.label).toContain('Simulator Development');
  });

  it('label contains "Sensitivity"', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, ENGINEER_CFG_VALID);
    expect(result.label).toContain('Sensitivity');
  });

  it('provenance contains the d32 value in mm', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, ENGINEER_CFG_VALID);
    expect(result.provenance).toMatch(/2(\.\d+)?\s*mm/);
  });

  it('provenance contains source type', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, ENGINEER_CFG_VALID);
    expect(result.provenance).toContain('Assumed');
  });

  it('engineerSource carries sourceType and sourceReference', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, ENGINEER_CFG_VALID);
    expect(result.engineerSource).not.toBeNull();
    expect(result.engineerSource?.sourceType).toBe('Assumed');
    expect(result.engineerSource?.sourceReference).toContain('Kühni');
  });

  it('extrapolated is false for engineer_supplied', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, ENGINEER_CFG_VALID);
    expect(result.extrapolated).toBe(false);
  });

  it('is usable', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, ENGINEER_CFG_VALID);
    expect(isD32Usable(result)).toBe(true);
  });

  it('no diagnostics for a typical in-range value (2 mm)', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, ENGINEER_CFG_VALID);
    // 2 mm is within 0.1–10 mm typical range — no ADVISORY expected
    const advisories = result.diagnostics.filter((d) => d.startsWith('ADVISORY'));
    expect(advisories).toHaveLength(0);
  });
});

describe('computeDropletDiameter — direct_turbulence_preliminary', () => {
  const state: D32LocalState = {
    ...VALID_LOCAL_STATE,
    directTurbulence: {
      powerNumber_Ne: 2,
      rotorSpeed_s: 2,
      rotorDiameter_m: 0.1,
      rotorVolume_m3: 0.002,
    },
  };

  it('calculates the stated direct-turbulence equation and preserves C sensitivity', () => {
    const result = computeDropletDiameter(state, DIRECT_TURBULENCE_CFG);
    const epsilon = 2 * (2 ** 3) * (0.1 ** 5) / 0.002;
    const expected = 0.4 * ((0.015 / 1020) ** 0.6) * (epsilon ** -0.4);
    expect(result.status).toBe('calculated_preliminary');
    expect(result.d32_m).toBeCloseTo(expected, 14);
    expect(result.directTurbulence?.epsilon_m2_s3).toBeCloseTo(epsilon, 14);
    expect(result.directTurbulence?.d32_at_C_min_m).toBeLessThan(result.d32_m!);
    expect(result.directTurbulence?.d32_at_C_max_m).toBeGreaterThan(result.d32_m!);
    expect(result.label).toContain('NOT YET PILOT_VALIDATED');
    expect(result.provenance).toContain('Not K&H 1996');
    expect(isD32Usable(result)).toBe(true);
  });

  it('fails closed without a recorded nominal-C source', () => {
    const result = computeDropletDiameter(state, {
      ...DIRECT_TURBULENCE_CFG,
      sourceReference: '',
    });
    expect(result.status).toBe('input_missing');
    expect(result.d32_m).toBeNull();
    expect(isD32Usable(result)).toBe(false);
  });

  it('fails closed when selected C is outside the governed interval', () => {
    const result = computeDropletDiameter(state, {
      ...DIRECT_TURBULENCE_CFG,
      C_nominal: 0.44,
    });
    expect(result.status).toBe('calculation_invalid');
    expect(result.d32_m).toBeNull();
  });
});

// ── 3. Engineer-supplied mode — boundary and edge cases ───────────────────────

describe('computeDropletDiameter — engineer_supplied mode — boundary cases', () => {
  it('d₃₂ = 0 returns calculation_invalid and null', () => {
    const cfg: EngineerSuppliedD32Config = { ...ENGINEER_CFG_VALID, value_m: 0 };
    const result = computeDropletDiameter(VALID_LOCAL_STATE, cfg);
    expect(result.status).toBe('calculation_invalid');
    expect(result.d32_m).toBeNull();
  });

  it('d₃₂ < 0 returns calculation_invalid and null', () => {
    const cfg: EngineerSuppliedD32Config = { ...ENGINEER_CFG_VALID, value_m: -0.001 };
    const result = computeDropletDiameter(VALID_LOCAL_STATE, cfg);
    expect(result.status).toBe('calculation_invalid');
    expect(result.d32_m).toBeNull();
  });

  it('NaN d₃₂ returns calculation_invalid', () => {
    const cfg: EngineerSuppliedD32Config = { ...ENGINEER_CFG_VALID, value_m: NaN };
    const result = computeDropletDiameter(VALID_LOCAL_STATE, cfg);
    expect(result.status).toBe('calculation_invalid');
    expect(result.d32_m).toBeNull();
  });

  it('invalid result is not usable', () => {
    const cfg: EngineerSuppliedD32Config = { ...ENGINEER_CFG_VALID, value_m: 0 };
    const result = computeDropletDiameter(VALID_LOCAL_STATE, cfg);
    expect(isD32Usable(result)).toBe(false);
  });

  it('very small d₃₂ (0.05 mm) emits advisory but is still accepted', () => {
    const cfg: EngineerSuppliedD32Config = { ...ENGINEER_CFG_VALID, value_m: 0.00005 }; // 0.05 mm
    const result = computeDropletDiameter(VALID_LOCAL_STATE, cfg);
    expect(result.status).toBe('engineer_supplied');
    expect(result.d32_m).toBe(0.00005);
    const advisories = result.diagnostics.filter((d) => d.startsWith('ADVISORY'));
    expect(advisories.length).toBeGreaterThan(0);
    expect(advisories[0]).toMatch(/below.*typical/i);
  });

  it('very large d₃₂ (15 mm) emits advisory but is accepted', () => {
    const cfg: EngineerSuppliedD32Config = { ...ENGINEER_CFG_VALID, value_m: 0.015 }; // 15 mm
    const result = computeDropletDiameter(VALID_LOCAL_STATE, cfg);
    expect(result.status).toBe('engineer_supplied');
    expect(result.d32_m).toBe(0.015);
    const advisories = result.diagnostics.filter((d) => d.startsWith('ADVISORY'));
    expect(advisories.length).toBeGreaterThan(0);
    expect(advisories[0]).toMatch(/above.*typical/i);
  });

  it('large advisory is a WARNING only — result is still usable', () => {
    const cfg: EngineerSuppliedD32Config = { ...ENGINEER_CFG_VALID, value_m: 0.015 };
    const result = computeDropletDiameter(VALID_LOCAL_STATE, cfg);
    expect(isD32Usable(result)).toBe(true);
  });

  it('empty sourceType emits a warning diagnostic', () => {
    const cfg: EngineerSuppliedD32Config = { ...ENGINEER_CFG_VALID, sourceType: '' };
    const result = computeDropletDiameter(VALID_LOCAL_STATE, cfg);
    expect(result.status).toBe('engineer_supplied');
    expect(result.diagnostics.some((d) => d.includes('sourceType'))).toBe(true);
  });

  it('empty sourceReference emits a warning diagnostic', () => {
    const cfg: EngineerSuppliedD32Config = { ...ENGINEER_CFG_VALID, sourceReference: '' };
    const result = computeDropletDiameter(VALID_LOCAL_STATE, cfg);
    expect(result.status).toBe('engineer_supplied');
    expect(result.diagnostics.some((d) => d.includes('sourceReference'))).toBe(true);
  });
});

// ── 4. isD32Usable() guard ─────────────────────────────────────────────────────

describe('isD32Usable()', () => {
  it('true for engineer_supplied with positive d32_m', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, ENGINEER_CFG_VALID);
    expect(isD32Usable(result)).toBe(true);
  });

  it('false for missing gamma', () => {
    const { sigma_N_m: _unused, ...withoutGamma } = VALID_LOCAL_STATE;
    const result = computeDropletDiameter(withoutGamma, PUBLISHED_CFG);
    expect(isD32Usable(result)).toBe(false);
  });

  it('false when d32_m is null regardless of status', () => {
    // Construct a minimal result object with status engineer_supplied but d32_m null
    const fakeResult = {
      d32_m: null as null,
      status: 'engineer_supplied' as const,
      mode: 'engineer_supplied' as const,
      correlationId: null,
      label: 'test',
      extrapolated: false,
      diagnostics: [],
      provenance: '',
      engineerSource: null,
      ...RESULT_META,
    };
    expect(isD32Usable(fakeResult)).toBe(false);
  });

  it('false when d32_m is 0 even if status is engineer_supplied', () => {
    const fakeResult = {
      d32_m: 0,
      status: 'engineer_supplied' as const,
      mode: 'engineer_supplied' as const,
      correlationId: null,
      label: 'test',
      extrapolated: false,
      diagnostics: [],
      provenance: '',
      engineerSource: null,
      ...RESULT_META,
    };
    expect(isD32Usable(fakeResult)).toBe(false);
  });

  it('false when status is calculation_invalid even if d32_m were non-null', () => {
    const fakeResult = {
      d32_m: 0.002,
      status: 'calculation_invalid' as const,
      mode: 'engineer_supplied' as const,
      correlationId: null,
      label: null,
      extrapolated: false,
      diagnostics: [],
      provenance: '',
      engineerSource: null,
      ...RESULT_META,
    };
    expect(isD32Usable(fakeResult)).toBe(false);
  });
});

// ── 5. Double-exponent notation check ─────────────────────────────────────────

describe('d₃₂ interface — equation notation invariants', () => {
  it('engineer_supplied result does not contain "^n₁]^" double-exponent notation', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, ENGINEER_CFG_VALID);
    const allText = [result.label, result.provenance, ...result.diagnostics].join(' ');
    // Ensure the double-exponent notation never appears in output strings
    expect(allText).not.toMatch(/\^n[₁1]\]\^/);
    expect(allText).not.toMatch(/\^0\.45\]\^/);
  });

  it('published_correlation diagnostics do not contain double-exponent notation', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, PUBLISHED_CFG);
    const allText = result.diagnostics.join(' ');
    expect(allText).not.toMatch(/\^n[₁1]\]\^/);
    expect(allText).not.toMatch(/\^0\.45\]\^/);
  });
});

// ── 6. Driving-force contract ─────────────────────────────────────────────────

describe('driving-force interface contract', () => {
  it('drivingForceContractDefined is true', () => {
    expect(drivingForceContractDefined).toBe(true);
  });

  it('drivingForceContractNote is a non-empty string', () => {
    expect(typeof drivingForceContractNote).toBe('string');
    expect(drivingForceContractNote.length).toBeGreaterThan(10);
  });

  it('drivingForceContractNote mentions NRTL', () => {
    expect(drivingForceContractNote).toMatch(/NRTL/);
  });

  it('drivingForceContractNote mentions per-component', () => {
    expect(drivingForceContractNote.toLowerCase()).toMatch(/per.component|per component/);
  });

  it('drivingForceContractNote is not implemented (Phase 2)', () => {
    expect(drivingForceContractNote).toMatch(/not.*implement|Phase 2/i);
  });
});

// ── 7. Compartment-index diagnostics ──────────────────────────────────────────

describe('compartment index in diagnostics', () => {
  it('published result includes compartment index in diagnostics', () => {
    const state = { ...VALID_LOCAL_STATE, compartmentIndex: 7 };
    const result = computeDropletDiameter(state, PUBLISHED_CFG);
    const combined = result.diagnostics.join(' ');
    expect(combined).toContain('7');
  });

  it('input-missing result with z_m shows location when no compartmentIndex', () => {
    const state = { h_comp_m: 0.06, z_m: 1.23 };
    const result = computeDropletDiameter(state, PUBLISHED_CFG);
    const combined = result.diagnostics.join(' ');
    expect(combined).toMatch(/1\.23|z\s*=/);
  });
});
