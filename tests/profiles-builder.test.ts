/**
 * tests/profiles-builder.test.ts
 * Unit tests for buildProfilesItemCode
 *
 * Two profile types:
 *   Solid Circular  — RM-PRF-CIR-{GRADE}-{THICK}XOD{OD}
 *   Hollow Circular — RM-PRF-CIRH-{GRADE}-{THICK}XOD{OD}XID{ID}
 *
 * Validation:
 *   • Thickness > 0  (independent axial dimension — NOT derived from OD/ID)
 *   • OD > 0
 *   • ID > 0  (Hollow only)
 *   • OD > ID (Hollow only)
 *   • Solid:  id_mm ignored, never in code
 *
 * Normalisation:
 *   "12", "12.0", "012"   → "12"
 *   "12.5"                → "12.5"
 */

import { describe, it, expect } from 'vitest';
import { buildProfilesItemCode } from '../server/buy-catalog-sap-service';

// ── helpers ───────────────────────────────────────────────────────────────────
function solid(overrides: Record<string, unknown> = {}) {
  return {
    profile_type:   'Solid Circular',
    material_grade: 'SS316',
    thickness_mm:   '12',
    od_mm:          '500',
    // id_mm intentionally absent for solid
    ...overrides,
  };
}

function hollow(overrides: Record<string, unknown> = {}) {
  return {
    profile_type:   'Hollow Circular',
    material_grade: 'SS316',
    thickness_mm:   '12',
    od_mm:          '500',
    id_mm:          '476',
    ...overrides,
  };
}

// ── Suite 1: All 13 grades — Solid Circular ───────────────────────────────────
describe('buildProfilesItemCode — all grades (Solid Circular)', () => {
  it('IS 2062 E250', () =>
    expect(buildProfilesItemCode(solid({ material_grade: 'IS 2062 E250' }))).toBe('RM-PRF-CIR-E250-12XOD500'));

  it('IS 2062 E350', () =>
    expect(buildProfilesItemCode(solid({ material_grade: 'IS 2062 E350' }))).toBe('RM-PRF-CIR-E350-12XOD500'));

  it('SS304', () =>
    expect(buildProfilesItemCode(solid({ material_grade: 'SS304' }))).toBe('RM-PRF-CIR-SS304-12XOD500'));

  it('SS304L', () =>
    expect(buildProfilesItemCode(solid({ material_grade: 'SS304L' }))).toBe('RM-PRF-CIR-SS304L-12XOD500'));

  it('SS316 (user example)', () =>
    expect(buildProfilesItemCode(solid())).toBe('RM-PRF-CIR-SS316-12XOD500'));

  it('SS316L', () =>
    expect(buildProfilesItemCode(solid({ material_grade: 'SS316L' }))).toBe('RM-PRF-CIR-SS316L-12XOD500'));

  it('SA 516 Gr 60', () =>
    expect(buildProfilesItemCode(solid({ material_grade: 'SA 516 Gr 60' }))).toBe('RM-PRF-CIR-SA516-60-12XOD500'));

  it('SA 516 Gr 70', () =>
    expect(buildProfilesItemCode(solid({ material_grade: 'SA 516 Gr 70' }))).toBe('RM-PRF-CIR-SA516-70-12XOD500'));

  it('ASTM A36', () =>
    expect(buildProfilesItemCode(solid({ material_grade: 'ASTM A36' }))).toBe('RM-PRF-CIR-A36-12XOD500'));

  it('SA-240 Gr 304', () =>
    expect(buildProfilesItemCode(solid({ material_grade: 'SA-240 Gr 304' }))).toBe('RM-PRF-CIR-SA240-304-12XOD500'));

  it('SA-240 Gr 304L', () =>
    expect(buildProfilesItemCode(solid({ material_grade: 'SA-240 Gr 304L' }))).toBe('RM-PRF-CIR-SA240-304L-12XOD500'));

  it('SA-240 Gr 316', () =>
    expect(buildProfilesItemCode(solid({ material_grade: 'SA-240 Gr 316' }))).toBe('RM-PRF-CIR-SA240-316-12XOD500'));

  it('SA-240 Gr 316L', () =>
    expect(buildProfilesItemCode(solid({ material_grade: 'SA-240 Gr 316L' }))).toBe('RM-PRF-CIR-SA240-316L-12XOD500'));
});

// ── Suite 2: All 13 grades — Hollow Circular ─────────────────────────────────
describe('buildProfilesItemCode — all grades (Hollow Circular)', () => {
  it('IS 2062 E250', () =>
    expect(buildProfilesItemCode(hollow({ material_grade: 'IS 2062 E250' }))).toBe('RM-PRF-CIRH-E250-12XOD500XID476'));

  it('IS 2062 E350', () =>
    expect(buildProfilesItemCode(hollow({ material_grade: 'IS 2062 E350' }))).toBe('RM-PRF-CIRH-E350-12XOD500XID476'));

  it('SS304', () =>
    expect(buildProfilesItemCode(hollow({ material_grade: 'SS304' }))).toBe('RM-PRF-CIRH-SS304-12XOD500XID476'));

  it('SS316 (user example)', () =>
    expect(buildProfilesItemCode(hollow())).toBe('RM-PRF-CIRH-SS316-12XOD500XID476'));

  it('SA 516 Gr 70', () =>
    expect(buildProfilesItemCode(hollow({ material_grade: 'SA 516 Gr 70' }))).toBe('RM-PRF-CIRH-SA516-70-12XOD500XID476'));

  it('SA-240 Gr 316L', () =>
    expect(buildProfilesItemCode(hollow({ material_grade: 'SA-240 Gr 316L' }))).toBe('RM-PRF-CIRH-SA240-316L-12XOD500XID476'));
});

// ── Suite 3: Solid Circular — id_mm completely ignored ───────────────────────
describe('buildProfilesItemCode — Solid Circular, id_mm ignored', () => {
  it('id_mm absent → same code', () =>
    expect(buildProfilesItemCode(solid())).toBe('RM-PRF-CIR-SS316-12XOD500'));

  it('id_mm present → same code (ignored)', () =>
    expect(buildProfilesItemCode(solid({ id_mm: '250' }))).toBe('RM-PRF-CIR-SS316-12XOD500'));

  it('id_mm = "0" → same code (ignored)', () =>
    expect(buildProfilesItemCode(solid({ id_mm: '0' }))).toBe('RM-PRF-CIR-SS316-12XOD500'));

  it('id_mm = blank string → same code (ignored)', () =>
    expect(buildProfilesItemCode(solid({ id_mm: '' }))).toBe('RM-PRF-CIR-SS316-12XOD500'));

  it('ID never appears in Solid code', () => {
    const code = buildProfilesItemCode(solid({ id_mm: '200' }));
    expect(code).not.toContain('XID');
  });
});

// ── Suite 4: Dimension normalisation ─────────────────────────────────────────
describe('buildProfilesItemCode — dimension normalisation', () => {
  it('thickness 012 → 12', () =>
    expect(buildProfilesItemCode(solid({ thickness_mm: '012' }))).toBe('RM-PRF-CIR-SS316-12XOD500'));

  it('thickness 12.0 → 12', () =>
    expect(buildProfilesItemCode(solid({ thickness_mm: '12.0' }))).toBe('RM-PRF-CIR-SS316-12XOD500'));

  it('OD 0500 → 500', () =>
    expect(buildProfilesItemCode(solid({ od_mm: '0500' }))).toBe('RM-PRF-CIR-SS316-12XOD500'));

  it('OD 500.0 → 500', () =>
    expect(buildProfilesItemCode(solid({ od_mm: '500.0' }))).toBe('RM-PRF-CIR-SS316-12XOD500'));

  it('decimal thickness preserved: 12.5 stays 12.5', () =>
    expect(buildProfilesItemCode(solid({ thickness_mm: '12.5' }))).toBe('RM-PRF-CIR-SS316-12.5XOD500'));

  it('equivalence: "12" == "12.0" == "012" (Solid)', () => {
    const a = buildProfilesItemCode(solid({ thickness_mm: '12',   od_mm: '500.0' }));
    const b = buildProfilesItemCode(solid({ thickness_mm: '12.0', od_mm: '0500'  }));
    const c = buildProfilesItemCode(solid({ thickness_mm: '012',  od_mm: '500'   }));
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('Hollow: ID normalised — 0476 → 476', () =>
    expect(buildProfilesItemCode(hollow({ id_mm: '0476' }))).toBe('RM-PRF-CIRH-SS316-12XOD500XID476'));

  it('Hollow: ID 476.0 → 476', () =>
    expect(buildProfilesItemCode(hollow({ id_mm: '476.0' }))).toBe('RM-PRF-CIRH-SS316-12XOD500XID476'));

  it('user example 2: OD 500, ID 475 — RM-PRF-CIRH-SS316-12XOD500XID475', () =>
    expect(buildProfilesItemCode(hollow({ id_mm: '475' }))).toBe('RM-PRF-CIRH-SS316-12XOD500XID475'));
});

// ── Suite 5: Hollow Circular — OD > ID enforced ──────────────────────────────
describe('buildProfilesItemCode — Hollow Circular, OD > ID', () => {
  it('ID = OD throws', () =>
    expect(() => buildProfilesItemCode(hollow({ od_mm: '500', id_mm: '500' }))).toThrow('Cannot generate Profile SAP Item Code'));

  it('ID > OD throws', () =>
    expect(() => buildProfilesItemCode(hollow({ od_mm: '300', id_mm: '400' }))).toThrow('Cannot generate Profile SAP Item Code'));

  it('error mentions Inside Diameter and Outside Diameter', () => {
    expect(() => buildProfilesItemCode(hollow({ od_mm: '300', id_mm: '400' }))).toThrow('Inside Diameter');
  });

  it('ID just below OD is valid', () =>
    expect(buildProfilesItemCode(hollow({ od_mm: '500', id_mm: '499' }))).toBe('RM-PRF-CIRH-SS316-12XOD500XID499'));
});

// ── Suite 6: Required field validation ───────────────────────────────────────
describe('buildProfilesItemCode — required field errors', () => {
  it('throws when profile_type is blank', () =>
    expect(() => buildProfilesItemCode(solid({ profile_type: '' }))).toThrow('Cannot generate Profile SAP Item Code'));

  it('throws when profile_type is unrecognised', () =>
    expect(() => buildProfilesItemCode(solid({ profile_type: 'Rectangular' }))).toThrow('Cannot generate Profile SAP Item Code'));

  it('throws when material_grade is blank', () =>
    expect(() => buildProfilesItemCode(solid({ material_grade: '' }))).toThrow('Cannot generate Profile SAP Item Code'));

  it('throws when material_grade is unrecognised', () =>
    expect(() => buildProfilesItemCode(solid({ material_grade: 'Duplex 2205' }))).toThrow('Cannot generate Profile SAP Item Code'));

  it('throws when thickness_mm is blank', () =>
    expect(() => buildProfilesItemCode(solid({ thickness_mm: '' }))).toThrow('Cannot generate Profile SAP Item Code'));

  it('throws when thickness_mm is zero', () =>
    expect(() => buildProfilesItemCode(solid({ thickness_mm: '0' }))).toThrow('Cannot generate Profile SAP Item Code'));

  it('throws when thickness_mm is negative', () =>
    expect(() => buildProfilesItemCode(solid({ thickness_mm: '-12' }))).toThrow('Cannot generate Profile SAP Item Code'));

  it('throws when thickness_mm is non-numeric', () =>
    expect(() => buildProfilesItemCode(solid({ thickness_mm: 'thick' }))).toThrow('Cannot generate Profile SAP Item Code'));

  it('throws when od_mm is blank', () =>
    expect(() => buildProfilesItemCode(solid({ od_mm: '' }))).toThrow('Cannot generate Profile SAP Item Code'));

  it('throws when od_mm is zero', () =>
    expect(() => buildProfilesItemCode(solid({ od_mm: '0' }))).toThrow('Cannot generate Profile SAP Item Code'));

  it('throws when od_mm is negative', () =>
    expect(() => buildProfilesItemCode(solid({ od_mm: '-100' }))).toThrow('Cannot generate Profile SAP Item Code'));

  it('Hollow: throws when id_mm is blank', () =>
    expect(() => buildProfilesItemCode(hollow({ id_mm: '' }))).toThrow('Cannot generate Profile SAP Item Code'));

  it('Hollow: throws when id_mm is zero', () =>
    expect(() => buildProfilesItemCode(hollow({ id_mm: '0' }))).toThrow('Cannot generate Profile SAP Item Code'));

  it('Hollow: throws when id_mm is negative', () =>
    expect(() => buildProfilesItemCode(hollow({ id_mm: '-10' }))).toThrow('Cannot generate Profile SAP Item Code'));

  it('Hollow: throws when id_mm is non-numeric', () =>
    expect(() => buildProfilesItemCode(hollow({ id_mm: 'abc' }))).toThrow('Cannot generate Profile SAP Item Code'));
});

// ── Suite 7: User examples and worst-case length ──────────────────────────────
describe('buildProfilesItemCode — user examples and length check', () => {
  it('Solid user example: RM-PRF-CIR-SS316-12XOD500', () =>
    expect(buildProfilesItemCode(solid())).toBe('RM-PRF-CIR-SS316-12XOD500'));

  it('Hollow user example 1: RM-PRF-CIRH-SS316-12XOD500XID476', () =>
    expect(buildProfilesItemCode(hollow())).toBe('RM-PRF-CIRH-SS316-12XOD500XID476'));

  it('Hollow user example 2: RM-PRF-CIRH-SS316-12XOD500XID475', () =>
    expect(buildProfilesItemCode(hollow({ id_mm: '475' }))).toBe('RM-PRF-CIRH-SS316-12XOD500XID475'));

  it('Hollow worst-case: RM-PRF-CIRH-SA240-316L-999XOD9999XID9998 = 42 chars', () => {
    const code = buildProfilesItemCode(hollow({
      material_grade: 'SA-240 Gr 316L',
      thickness_mm:   '999',
      od_mm:          '9999',
      id_mm:          '9998',
    }));
    expect(code).toBe('RM-PRF-CIRH-SA240-316L-999XOD9999XID9998');
    expect(code.length).toBe(40);
    expect(code.length).toBeLessThanOrEqual(50);
  });

  it('Solid worst-case: RM-PRF-CIR-SA240-316L-999XOD9999 = 33 chars', () => {
    const code = buildProfilesItemCode(solid({
      material_grade: 'SA-240 Gr 316L',
      thickness_mm:   '999',
      od_mm:          '9999',
    }));
    expect(code).toBe('RM-PRF-CIR-SA240-316L-999XOD9999');
    expect(code.length).toBe(32);
    expect(code.length).toBeLessThanOrEqual(50);
  });
});
