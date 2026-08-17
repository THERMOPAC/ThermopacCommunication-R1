// ─────────────────────────────────────────────────────────────────────────────
// ECR-2 — d₃₂ Plug-In Interface Tests
//
// Tests for:
//   · computeDropletDiameter() — both modes
//   · isD32Usable() — usability guard
//   · Engineer-supplied mode: value validation, labelling, guards, advisories
//   · Published-correlation mode: always returns correlation_unresolved
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

// ── 1. Published-correlation mode ─────────────────────────────────────────────

describe('computeDropletDiameter — published_correlation mode', () => {
  it('always returns status=correlation_unresolved while K&H 1996 flags are open', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, PUBLISHED_CFG);
    expect(result.status).toBe('correlation_unresolved');
  });

  it('returns d32_m = null when correlation is unresolved', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, PUBLISHED_CFG);
    expect(result.d32_m).toBeNull();
  });

  it('returns mode = published_correlation', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, PUBLISHED_CFG);
    expect(result.mode).toBe('published_correlation');
  });

  it('returns correlationId = ecr2_d32_kh1996', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, PUBLISHED_CFG);
    expect(result.correlationId).toBe('ecr2_d32_kh1996');
  });

  it('label is null when d32_m is null', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, PUBLISHED_CFG);
    expect(result.label).toBeNull();
  });

  it('diagnostics contain UNRESOLVED_SYMBOL mention', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, PUBLISHED_CFG);
    const combined = result.diagnostics.join(' ');
    expect(combined).toMatch(/UNRESOLVED_SYMBOL/);
  });

  it('diagnostics contain UNRESOLVED_GROUPING mention', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, PUBLISHED_CFG);
    const combined = result.diagnostics.join(' ');
    expect(combined).toMatch(/UNRESOLVED_GROUPING/);
  });

  it('diagnostics mention K&H 1996 primary paper DOI', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, PUBLISHED_CFG);
    const combined = result.diagnostics.join(' ');
    expect(combined).toMatch(/10\.1021\/ie950674w/);
  });

  it('diagnostics suggest engineer_supplied as the path forward', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, PUBLISHED_CFG);
    const combined = result.diagnostics.join(' ');
    expect(combined).toMatch(/engineer.supplied/i);
  });

  it('engineerSource is null for published_correlation mode', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, PUBLISHED_CFG);
    expect(result.engineerSource).toBeNull();
  });

  it('extrapolated is false for unresolved correlation', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, PUBLISHED_CFG);
    expect(result.extrapolated).toBe(false);
  });

  it('works with minimal local state (no optional fields)', () => {
    const result = computeDropletDiameter({}, PUBLISHED_CFG);
    expect(result.status).toBe('correlation_unresolved');
    expect(result.d32_m).toBeNull();
  });

  it('is not usable', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, PUBLISHED_CFG);
    expect(isD32Usable(result)).toBe(false);
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

  it('false for correlation_unresolved', () => {
    const result = computeDropletDiameter(VALID_LOCAL_STATE, PUBLISHED_CFG);
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
  it('unresolved result includes compartment index in diagnostics', () => {
    const state = { ...VALID_LOCAL_STATE, compartmentIndex: 7 };
    const result = computeDropletDiameter(state, PUBLISHED_CFG);
    const combined = result.diagnostics.join(' ');
    expect(combined).toContain('7');
  });

  it('unresolved result with z_m shows location when no compartmentIndex', () => {
    const state = { h_comp_m: 0.06, z_m: 1.23 };
    const result = computeDropletDiameter(state, PUBLISHED_CFG);
    const combined = result.diagnostics.join(' ');
    expect(combined).toMatch(/1\.23|z\s*=/);
  });
});
