/**
 * tests/plates-builder.test.ts
 * Unit tests for buildPlatesItemCode
 *
 * Model A – Stock / Inventory Plate
 * Skeleton  : RM-PLT-{GRADE}-{THICK}X{WIDTH}X{LENGTH}
 * Identity  : Material Grade · Thickness (mm) · Width (mm) · Length (mm)
 * Spec only : Plate Standard, MTR/MTC, Heat Treatment, Surface Finish, Testing
 *
 * Interchangeability rule:
 *   Two plates with the same SAP Item Code must be physically interchangeable
 *   as stocked inventory. "Mill Length" is explicitly rejected.
 *
 * Normalisation rule:
 *   "1500", "1500.0", "01500" → "1500"
 *   "12.5"                   → "12.5"
 */

import { describe, it, expect } from 'vitest';
import { buildPlatesItemCode } from '../server/buy-catalog-sap-service';

// ── helper ────────────────────────────────────────────────────────────────────
function plt(overrides: Record<string, unknown> = {}) {
  return {
    material_grade:     'IS 2062 E250',
    thickness_mm:       '6',
    width_mm:           '1500',
    length_mm:          '6000',
    // engineering spec — must NOT appear in code
    plate_standard:     'IS 2062',
    mtr_required:       'Yes',
    heat_treatment:     'None',
    surface_finish:     'No.1 (HR)',
    additional_testing: 'UT (Ultrasonic)',
    ...overrides,
  };
}

// ── Suite 1: All 13 mapped grades (representative thickness/dimensions) ────────
describe('buildPlatesItemCode — all grades', () => {
  it('IS 2062 E250', () =>
    expect(buildPlatesItemCode(plt())).toBe('RM-PLT-E250-6X1500X6000'));

  it('IS 2062 E350', () =>
    expect(buildPlatesItemCode(plt({ material_grade: 'IS 2062 E350' }))).toBe('RM-PLT-E350-6X1500X6000'));

  it('SS304', () =>
    expect(buildPlatesItemCode(plt({ material_grade: 'SS304', width_mm: '1250', length_mm: '2500' }))).toBe('RM-PLT-SS304-6X1250X2500'));

  it('SS304L', () =>
    expect(buildPlatesItemCode(plt({ material_grade: 'SS304L' }))).toBe('RM-PLT-SS304L-6X1500X6000'));

  it('SS316', () =>
    expect(buildPlatesItemCode(plt({ material_grade: 'SS316', thickness_mm: '12' }))).toBe('RM-PLT-SS316-12X1500X6000'));

  it('SS316L', () =>
    expect(buildPlatesItemCode(plt({ material_grade: 'SS316L', thickness_mm: '12' }))).toBe('RM-PLT-SS316L-12X1500X6000'));

  it('SA 516 Gr 60', () =>
    expect(buildPlatesItemCode(plt({ material_grade: 'SA 516 Gr 60', thickness_mm: '25', width_mm: '2000', length_mm: '6000' }))).toBe('RM-PLT-SA516-60-25X2000X6000'));

  it('SA 516 Gr 70 (matches user example)', () =>
    expect(buildPlatesItemCode(plt({ material_grade: 'SA 516 Gr 70', thickness_mm: '25', width_mm: '2000', length_mm: '12000' }))).toBe('RM-PLT-SA516-70-25X2000X12000'));

  it('ASTM A36', () =>
    expect(buildPlatesItemCode(plt({ material_grade: 'ASTM A36', thickness_mm: '10', width_mm: '1500', length_mm: '3000' }))).toBe('RM-PLT-A36-10X1500X3000'));

  it('SA-240 Gr 304', () =>
    expect(buildPlatesItemCode(plt({ material_grade: 'SA-240 Gr 304' }))).toBe('RM-PLT-SA240-304-6X1500X6000'));

  it('SA-240 Gr 304L', () =>
    expect(buildPlatesItemCode(plt({ material_grade: 'SA-240 Gr 304L' }))).toBe('RM-PLT-SA240-304L-6X1500X6000'));

  it('SA-240 Gr 316', () =>
    expect(buildPlatesItemCode(plt({ material_grade: 'SA-240 Gr 316' }))).toBe('RM-PLT-SA240-316-6X1500X6000'));

  it('SA-240 Gr 316L', () =>
    expect(buildPlatesItemCode(plt({ material_grade: 'SA-240 Gr 316L' }))).toBe('RM-PLT-SA240-316L-6X1500X6000'));
});

// ── Suite 2: Engineering spec fields excluded from code ───────────────────────
describe('buildPlatesItemCode — spec fields excluded', () => {
  it('plate_standard, mtr_required, heat_treatment, surface_finish, additional_testing do not appear', () => {
    const code = buildPlatesItemCode(plt({
      plate_standard:     'ASME Sec. II Part A',
      mtr_required:       'Yes',
      heat_treatment:     'Normalized',
      surface_finish:     'Pickled & Oiled',
      additional_testing: 'NACE MR-0175',
    }));
    expect(code).toBe('RM-PLT-E250-6X1500X6000');
    expect(code).not.toContain('ASME');
    expect(code).not.toContain('Yes');
    expect(code).not.toContain('Normalized');
    expect(code).not.toContain('Pickled');
    expect(code).not.toContain('NACE');
  });
});

// ── Suite 3: Dimension normalisation ─────────────────────────────────────────
describe('buildPlatesItemCode — dimension normalisation', () => {
  it('leading zeros stripped: "01500" → "1500"', () =>
    expect(buildPlatesItemCode(plt({ width_mm: '01500' }))).toBe('RM-PLT-E250-6X1500X6000'));

  it('trailing decimal zeros stripped: "1500.0" → "1500"', () =>
    expect(buildPlatesItemCode(plt({ width_mm: '1500.0' }))).toBe('RM-PLT-E250-6X1500X6000'));

  it('"1500.00" → "1500"', () =>
    expect(buildPlatesItemCode(plt({ width_mm: '1500.00' }))).toBe('RM-PLT-E250-6X1500X6000'));

  it('equivalent inputs produce identical codes', () => {
    const a = buildPlatesItemCode(plt({ thickness_mm: '06', width_mm: '1500.0', length_mm: '06000' }));
    const b = buildPlatesItemCode(plt({ thickness_mm: '6', width_mm: '1500', length_mm: '6000' }));
    expect(a).toBe(b);
  });

  it('decimal thickness preserved when genuinely fractional: "12.5" → "12.5"', () =>
    expect(buildPlatesItemCode(plt({ thickness_mm: '12.5' }))).toBe('RM-PLT-E250-12.5X1500X6000'));

  it('custom thickness via Other: "32"', () =>
    expect(buildPlatesItemCode(plt({ thickness_mm: '32' }))).toBe('RM-PLT-E250-32X1500X6000'));

  it('custom width via Other: "1800"', () =>
    expect(buildPlatesItemCode(plt({ width_mm: '1800' }))).toBe('RM-PLT-E250-6X1800X6000'));

  it('custom length via Other: "4500"', () =>
    expect(buildPlatesItemCode(plt({ length_mm: '4500' }))).toBe('RM-PLT-E250-6X1500X4500'));
});

// ── Suite 4: Mill Length rejection ───────────────────────────────────────────
describe('buildPlatesItemCode — Mill Length rejection', () => {
  it('throws when length_mm is "Mill Length"', () =>
    expect(() => buildPlatesItemCode(plt({ length_mm: 'Mill Length' }))).toThrow('Cannot generate Plate SAP Item Code'));

  it('error message mentions Mill Length', () =>
    expect(() => buildPlatesItemCode(plt({ length_mm: 'Mill Length' }))).toThrow('Mill Length'));
});

// ── Suite 5: Required field validation ───────────────────────────────────────
describe('buildPlatesItemCode — required field errors', () => {
  it('throws when material_grade is blank', () =>
    expect(() => buildPlatesItemCode(plt({ material_grade: '' }))).toThrow('Cannot generate Plate SAP Item Code'));

  it('throws when material_grade is unrecognised', () =>
    expect(() => buildPlatesItemCode(plt({ material_grade: 'Duplex 2205' }))).toThrow('Cannot generate Plate SAP Item Code'));

  it('throws when thickness_mm is blank', () =>
    expect(() => buildPlatesItemCode(plt({ thickness_mm: '' }))).toThrow('Cannot generate Plate SAP Item Code'));

  it('throws when thickness_mm is zero', () =>
    expect(() => buildPlatesItemCode(plt({ thickness_mm: '0' }))).toThrow('Cannot generate Plate SAP Item Code'));

  it('throws when thickness_mm is negative', () =>
    expect(() => buildPlatesItemCode(plt({ thickness_mm: '-6' }))).toThrow('Cannot generate Plate SAP Item Code'));

  it('throws when thickness_mm is non-numeric', () =>
    expect(() => buildPlatesItemCode(plt({ thickness_mm: 'thick' }))).toThrow('Cannot generate Plate SAP Item Code'));

  it('throws when width_mm is blank', () =>
    expect(() => buildPlatesItemCode(plt({ width_mm: '' }))).toThrow('Cannot generate Plate SAP Item Code'));

  it('throws when length_mm is blank', () =>
    expect(() => buildPlatesItemCode(plt({ length_mm: '' }))).toThrow('Cannot generate Plate SAP Item Code'));
});

// ── Suite 6: Length and worst-case check ─────────────────────────────────────
describe('buildPlatesItemCode — length assertions', () => {
  it('user example 1: RM-PLT-E250-6X1500X6000', () =>
    expect(buildPlatesItemCode(plt())).toBe('RM-PLT-E250-6X1500X6000'));

  it('user example 2: RM-PLT-SS316-12X1500X6000', () =>
    expect(buildPlatesItemCode(plt({ material_grade: 'SS316', thickness_mm: '12' }))).toBe('RM-PLT-SS316-12X1500X6000'));

  it('user example 3: RM-PLT-SA516-70-25X2000X12000', () =>
    expect(buildPlatesItemCode(plt({ material_grade: 'SA 516 Gr 70', thickness_mm: '25', width_mm: '2000', length_mm: '12000' }))).toBe('RM-PLT-SA516-70-25X2000X12000'));

  it('worst-case length stays under 50 chars', () => {
    // SA-240 Gr 316L grade code = SA240-316L (10 chars), thickness/width/length all large
    const code = buildPlatesItemCode(plt({
      material_grade: 'SA-240 Gr 316L',
      thickness_mm:   '999',
      width_mm:       '9999',
      length_mm:      '99999',
    }));
    expect(code).toBe('RM-PLT-SA240-316L-999X9999X99999');
    expect(code.length).toBeLessThanOrEqual(50);
  });
});
