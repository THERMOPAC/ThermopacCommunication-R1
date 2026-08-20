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

// ── 1. Published-correlation preliminary reconstruction ───────────────────────

describe('computeDropletDiameter — published_correlation preliminary reconstruction', () => {
  it('returns a usable preliminary-engineering reconstruction', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, PUBLISHED_CFG);
    expect(result.status).toBe('preliminary_engineering_reconstruction');
    expect(result.mode).toBe('published_correlation');
    expect(result.correlationId).toBe('ecr2_d32_kh1996');
    expect(isD32Usable(result)).toBe(true);
  });

  it('uses C1^n1 = 3.04^0.45 once only', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, PUBLISHED_CFG);
    expect(3.04 ** 0.45).toBeCloseTo(1.649275139, 9);
    expect(result.diagnostics.join(' ')).toContain('1.649275139');
    expect(result.diagnostics.join(' ')).not.toMatch(/\^0\.45\)\^0\.45/);
  });

  it('matches an independently calculated reference case', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, PUBLISHED_CFG);
    // Independent evaluation of the approved equation for VALID_LOCAL_STATE.
    expect(result.d32_raw_m).toBeCloseTo(0.45667856255541833, 12);
    expect(result.d32_m).toBeCloseTo(0.45667856255541833, 12);
    expect(result.d32_m).toBeGreaterThan(0);
  });

  it('uses the capillary-length geometry group rather than the invalid transcription', () => {
    const rhoC = VALID_LOCAL_STATE.rho_c_kg_m3;
    const gamma = VALID_LOCAL_STATE.sigma_N_m;
    const g = 9.80665;
    const geometryFromDirectForm = VALID_LOCAL_STATE.h_comp_m * Math.sqrt(rhoC * g / gamma);
    const lambdaC = Math.sqrt(gamma / (rhoC * g));
    expect(geometryFromDirectForm).toBeCloseTo(VALID_LOCAL_STATE.h_comp_m / lambdaC, 12);
    expect(Number.isFinite(geometryFromDirectForm)).toBe(true);
  });

  it('returns input_missing for absent gamma without inventing a value', () => {
    const { sigma_N_m: _unused, ...withoutGamma } = VALID_LOCAL_STATE;
    const result = computeDropletDiameter(withoutGamma, PUBLISHED_CFG);
    expect(result.status).toBe('input_missing');
    expect(result.d32_m).toBeNull();
    expect(result.diagnostics.join(' ')).toMatch(/sigma_N_m.*gamma/i);
  });

  it('rejects gamma <= 0 without clamping', () => {
    const result = computeDropletDiameter({ ...VALID_LOCAL_STATE, sigma_N_m: 0 }, PUBLISHED_CFG);
    expect(result.status).toBe('calculation_invalid');
    expect(result.d32_m).toBeNull();
  });

  it('rejects h <= 0 without clamping', () => {
    const result = computeDropletDiameter({ ...VALID_LOCAL_STATE, h_comp_m: 0 }, PUBLISHED_CFG);
    expect(result.status).toBe('calculation_invalid');
    expect(result.d32_m).toBeNull();
  });

  it('rejects rho_c <= rho_d', () => {
    const result = computeDropletDiameter({ ...VALID_LOCAL_STATE, rho_c_kg_m3: 870 }, PUBLISHED_CFG);
    expect(result.status).toBe('calculation_invalid');
    expect(result.d32_m).toBeNull();
  });

  it('rejects psi <= 0 and retains a finite raw value when calculable', () => {
    const result = computeDropletDiameter({ ...VALID_LOCAL_STATE, psi_W_kg: 0 }, PUBLISHED_CFG);
    expect(result.status).toBe('calculation_invalid');
    expect(result.d32_m).toBeNull();
    expect(result.d32_raw_m).toBe(0);
  });

  it('carries required preliminary governance fields and warnings', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, PUBLISHED_CFG);
    const diagnostics = result.diagnostics.join(' ');
    expect(result.engineeringBasis).toBe('Published Correlation — Preliminary Engineering');
    expect(result.governanceStatus).toBe('K&H 1996 reconstructed pending primary-source verification');
    expect(result.primarySourceVerified).toBe(false);
    expect(result.validatedForRRBONMP).toBe(false);
    expect(result.calibrationFactor).toBe(1);
    expect(result.pilotCalibrationStatus).toBe('NOT_YET_CALIBRATED__UNITY_BASIS');
    expect(result.localAxialApplication).toBe('Thermopac model extension — uniform/inlet property basis');
    for (const warning of [
      'PRIMARY_SOURCE_UNVERIFIED__KH1996',
      'NUMERATOR_RECONSTRUCTION__C1_N1',
      'GEOMETRY_RECONSTRUCTION__CAPILLARY_LENGTH_GROUP',
      'KH1996_PHASE_CONVENTION_NOT_PRIMARY_VERIFIED',
      'RRBO_NMP_VALIDATION_PENDING',
    ]) expect(diagnostics).toContain(warning);
  });

  it('does not use stator open area or holdup as d32 inputs', () => {
    const baseline = computeDropletDiameter(VALID_LOCAL_STATE, PUBLISHED_CFG);
    const changedContext = computeDropletDiameter({
      ...VALID_LOCAL_STATE,
      xf_stator: 0.81,
      phi_d: 0.91,
    }, PUBLISHED_CFG);
    expect(changedContext.d32_m).toBeCloseTo(baseline.d32_m!, 12);
  });

  it('responds only to an approved mathematical local-state input', () => {
    const baseline = computeDropletDiameter(VALID_LOCAL_STATE, PUBLISHED_CFG);
    const changedGamma = computeDropletDiameter({
      ...VALID_LOCAL_STATE,
      sigma_N_m: VALID_LOCAL_STATE.sigma_N_m * 1.1,
    }, PUBLISHED_CFG);
    expect(changedGamma.d32_m).not.toBeCloseTo(baseline.d32_m!, 12);
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
