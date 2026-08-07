import { describe, it, expect } from 'vitest';
import { mergeSectionData } from '../server/section-merge';

/**
 * Regression: a partial save of the Stage 9 mechanical_design section
 * (e.g. only the governing design code) must NEVER erase the rest of the
 * section. Previously the inputs route replaced the whole section JSON,
 * which wiped supports/nozzle_rows on a partial write.
 */

const NOZZLE_ROWS = Array.from({ length: 16 }, (_, i) => ({
  tag: `N${i + 1}`,
  service: `Service ${i + 1}`,
  size_dn: [25, 40, 50, 80, 100][i % 5],
  rating: '150#',
  facing: 'RF',
  flange_std: 'ASME B16.5',
}));

const EXISTING_STAGE9 = {
  // Support selection
  supports: 'Saddle',
  // Nozzle rows
  nozzle_rows: NOZZLE_ROWS,
  // Mechanical configuration
  orientation: 'horizontal',
  head_type: 'torispherical',
  shell_id_mm: 600,
  // Design conditions
  design_pressure_barg: 3.5,
  design_temperature_c: 120,
  // Material selections
  shell_material: 'SA-516 Gr 70',
  head_material: 'SA-516 Gr 70',
  nozzle_material: 'SA-106 Gr B',
  // Corrosion allowances
  corrosion_allowance_mm: 1.5,
  // Other Stage 9 values
  joint_efficiency: 0.85,
  insulation_thickness_mm: 50,
};

describe('Stage 9 mechanical_design section merge semantics', () => {
  it('changing only the governing design code preserves every other field', () => {
    const merged = mergeSectionData(EXISTING_STAGE9, { design_code: 'ASME Sec VIII Div 1' });

    expect(merged.design_code).toBe('ASME Sec VIII Div 1');
    // Support selection
    expect(merged.supports).toBe('Saddle');
    // Nozzle rows — all 16, deep-equal
    expect(merged.nozzle_rows).toEqual(NOZZLE_ROWS);
    expect((merged.nozzle_rows as unknown[]).length).toBe(16);
    // Mechanical configuration
    expect(merged.orientation).toBe('horizontal');
    expect(merged.head_type).toBe('torispherical');
    expect(merged.shell_id_mm).toBe(600);
    // Design conditions
    expect(merged.design_pressure_barg).toBe(3.5);
    expect(merged.design_temperature_c).toBe(120);
    // Material selections
    expect(merged.shell_material).toBe('SA-516 Gr 70');
    expect(merged.head_material).toBe('SA-516 Gr 70');
    expect(merged.nozzle_material).toBe('SA-106 Gr B');
    // Corrosion allowances
    expect(merged.corrosion_allowance_mm).toBe(1.5);
    // All other Stage 9 values
    expect(merged.joint_efficiency).toBe(0.85);
    expect(merged.insulation_thickness_mm).toBe(50);
    // Nothing extra lost or added
    expect(Object.keys(merged).sort()).toEqual(
      [...Object.keys(EXISTING_STAGE9), 'design_code'].sort(),
    );
  });

  it('whole-section saves (the normal client path) behave as before', () => {
    const full = { ...EXISTING_STAGE9, design_code: 'EN 13445', supports: 'Leg' };
    const merged = mergeSectionData(EXISTING_STAGE9, full);
    expect(merged).toEqual(full);
  });

  it('explicit null deletes a field; omission preserves it', () => {
    const merged = mergeSectionData(EXISTING_STAGE9, { insulation_thickness_mm: null });
    expect('insulation_thickness_mm' in merged).toBe(false);
    expect(merged.supports).toBe('Saddle');
    expect(merged.nozzle_rows).toEqual(NOZZLE_ROWS);
  });

  it('first save with no existing row stores the payload as-is', () => {
    const merged = mergeSectionData(undefined, { supports: 'Saddle' });
    expect(merged).toEqual({ supports: 'Saddle' });
  });
});
