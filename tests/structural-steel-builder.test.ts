import { describe, it, expect } from 'vitest';
import { buildStructuralSteelItemCode } from '../server/buy-catalog-sap-service';

function ss(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { supply_form: 'Standard Stock', ...overrides };
}
function cts(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { supply_form: 'Cut-to-Size', ...overrides };
}

// ─── Plate (Chequered) ────────────────────────────────────────────────────────
describe('Plate (Chequered)', () => {
  it('standard code', () => {
    expect(buildStructuralSteelItemCode(ss({
      section_type: 'Plate (Chequered)', material_grade: 'IS 2062 E250A',
      thickness_mm: '6', width_mm: '1500', chq_length: '6000',
    }))).toBe('RM-STR-PLTC-E250A-6X1500X6000');
  });
  it('ASTM A572 grade code', () => {
    expect(buildStructuralSteelItemCode(ss({
      section_type: 'Plate (Chequered)', material_grade: 'ASTM A572 Gr 50',
      thickness_mm: '8', width_mm: '2000', chq_length: '4000',
    }))).toBe('RM-STR-PLTC-A572-50-8X2000X4000');
  });
  it('trailing zeros stripped', () => {
    expect(buildStructuralSteelItemCode(ss({
      section_type: 'Plate (Chequered)', material_grade: 'IS 2062 E250A',
      thickness_mm: '6.0', width_mm: '1500.0', chq_length: '6000.0',
    }))).toBe('RM-STR-PLTC-E250A-6X1500X6000');
  });
  it('throws for Mill Length', () => {
    expect(() => buildStructuralSteelItemCode(ss({
      section_type: 'Plate (Chequered)', material_grade: 'IS 2062 E250A',
      thickness_mm: '6', width_mm: '1500', chq_length: 'Mill Length',
    }))).toThrow('Mill Length');
  });
  it('worst-case ≤ 50 chars', () => {
    const code = buildStructuralSteelItemCode(ss({
      section_type: 'Plate (Chequered)', material_grade: 'ASTM A572 Gr 50',
      thickness_mm: '16', width_mm: '2500', chq_length: '6000',
    }));
    expect(code.length).toBeLessThanOrEqual(50);
  });
});

// ─── Angle (Equal Leg) ────────────────────────────────────────────────────────
describe('Angle (Equal Leg)', () => {
  it('standard stock — no CTS suffix', () => {
    expect(buildStructuralSteelItemCode(ss({
      section_type: 'Angle (Equal Leg)', material_grade: 'IS 2062 E250A',
      leg_mm: '75', thickness_mm: '8',
    }))).toBe('RM-STR-ANG-E250A-75X8');
  });
  it('cut-to-size appends CTS suffix', () => {
    expect(buildStructuralSteelItemCode(cts({
      section_type: 'Angle (Equal Leg)', material_grade: 'IS 2062 E350',
      leg_mm: '75', thickness_mm: '8', cut_length_mm: '1500',
    }))).toBe('RM-STR-ANG-E350-75X8-CTS-1500MM');
  });
  it('throws when CTS but cut_length missing', () => {
    expect(() => buildStructuralSteelItemCode(cts({
      section_type: 'Angle (Equal Leg)', material_grade: 'IS 2062 E250A',
      leg_mm: '75', thickness_mm: '8',
    }))).toThrow('Cut Length');
  });
  it('worst-case with CTS ≤ 50 chars', () => {
    const code = buildStructuralSteelItemCode(cts({
      section_type: 'Angle (Equal Leg)', material_grade: 'IS 2062 E250BO',
      leg_mm: '200', thickness_mm: '20', cut_length_mm: '12000',
    }));
    expect(code).toBe('RM-STR-ANG-E250BO-200X20-CTS-12000MM');
    expect(code.length).toBeLessThanOrEqual(50);
  });
});

// ─── Angle (Unequal Leg) ─────────────────────────────────────────────────────
describe('Angle (Unequal Leg)', () => {
  it('standard code', () => {
    expect(buildStructuralSteelItemCode(ss({
      section_type: 'Angle (Unequal Leg)', material_grade: 'ASTM A36',
      leg1_mm: '100', leg2_mm: '75', thickness_mm: '8',
    }))).toBe('RM-STR-ANGU-A36-100X75X8');
  });
  it('worst-case with CTS ≤ 50 chars', () => {
    const code = buildStructuralSteelItemCode(cts({
      section_type: 'Angle (Unequal Leg)', material_grade: 'IS 2062 E250BO',
      leg1_mm: '200', leg2_mm: '150', thickness_mm: '20', cut_length_mm: '12000',
    }));
    expect(code).toBe('RM-STR-ANGU-E250BO-200X150X20-CTS-12000MM');
    expect(code.length).toBeLessThanOrEqual(50);
  });
});

// ─── Channel (ISMC) ──────────────────────────────────────────────────────────
describe('Channel (ISMC)', () => {
  it('strips space in designation', () => {
    expect(buildStructuralSteelItemCode(ss({
      section_type: 'Channel (ISMC)', material_grade: 'IS 2062 E250A',
      section_designation: 'ISMC 100',
    }))).toBe('RM-STR-CHN-E250A-ISMC100');
  });
  it('CTS variant', () => {
    expect(buildStructuralSteelItemCode(cts({
      section_type: 'Channel (ISMC)', material_grade: 'ASTM A572 Gr 50',
      section_designation: 'ISMC 400', cut_length_mm: '2500',
    }))).toBe('RM-STR-CHN-A572-50-ISMC400-CTS-2500MM');
  });
  it('worst-case ≤ 50 chars', () => {
    const code = buildStructuralSteelItemCode(cts({
      section_type: 'Channel (ISMC)', material_grade: 'ASTM A572 Gr 50',
      section_designation: 'ISMC 400', cut_length_mm: '12000',
    }));
    expect(code.length).toBeLessThanOrEqual(50);
  });
});

// ─── I-Beam (ISMB) ───────────────────────────────────────────────────────────
describe('I-Beam (ISMB)', () => {
  it('standard code', () => {
    expect(buildStructuralSteelItemCode(ss({
      section_type: 'I-Beam (ISMB)', material_grade: 'IS 2062 E250A',
      section_designation: 'ISMB 200',
    }))).toBe('RM-STR-IBM-E250A-ISMB200');
  });
  it('worst-case ≤ 50 chars', () => {
    const code = buildStructuralSteelItemCode(cts({
      section_type: 'I-Beam (ISMB)', material_grade: 'ASTM A572 Gr 50',
      section_designation: 'ISMB 600', cut_length_mm: '12000',
    }));
    expect(code).toBe('RM-STR-IBM-A572-50-ISMB600-CTS-12000MM');
    expect(code.length).toBeLessThanOrEqual(50);
  });
});

// ─── H-Beam (ISHB) ───────────────────────────────────────────────────────────
describe('H-Beam (ISHB)', () => {
  it('standard code', () => {
    expect(buildStructuralSteelItemCode(ss({
      section_type: 'H-Beam (ISHB)', material_grade: 'IS 2062 E250A',
      section_designation: 'ISHB 150',
    }))).toBe('RM-STR-HBM-E250A-ISHB150');
  });
  it('worst-case ≤ 50 chars', () => {
    const code = buildStructuralSteelItemCode(cts({
      section_type: 'H-Beam (ISHB)', material_grade: 'ASTM A572 Gr 50',
      section_designation: 'ISHB 550', cut_length_mm: '12000',
    }));
    expect(code).toBe('RM-STR-HBM-A572-50-ISHB550-CTS-12000MM');
    expect(code.length).toBeLessThanOrEqual(50);
  });
});

// ─── Round Bar ───────────────────────────────────────────────────────────────
describe('Round Bar', () => {
  it('DIA prefix encoded', () => {
    expect(buildStructuralSteelItemCode(ss({
      section_type: 'Round Bar', material_grade: 'SS 304',
      diameter_mm: '50',
    }))).toBe('RM-STR-RB-SS304-DIA50');
  });
  it('CTS variant', () => {
    expect(buildStructuralSteelItemCode(cts({
      section_type: 'Round Bar', material_grade: 'SS 316',
      diameter_mm: '100', cut_length_mm: '500',
    }))).toBe('RM-STR-RB-SS316-DIA100-CTS-500MM');
  });
  it('worst-case ≤ 50 chars', () => {
    const code = buildStructuralSteelItemCode(cts({
      section_type: 'Round Bar', material_grade: 'IS 2062 E250BO',
      diameter_mm: '500', cut_length_mm: '12000',
    }));
    expect(code.length).toBeLessThanOrEqual(50);
  });
});

// ─── Flat Bar ────────────────────────────────────────────────────────────────
describe('Flat Bar', () => {
  it('width × thickness', () => {
    expect(buildStructuralSteelItemCode(ss({
      section_type: 'Flat Bar', material_grade: 'IS 2062 E250A',
      width_mm: '100', thickness_mm: '10',
    }))).toBe('RM-STR-FB-E250A-100X10');
  });
  it('worst-case with CTS ≤ 50 chars', () => {
    const code = buildStructuralSteelItemCode(cts({
      section_type: 'Flat Bar', material_grade: 'IS 2062 E250BO',
      width_mm: '200', thickness_mm: '25', cut_length_mm: '12000',
    }));
    expect(code.length).toBeLessThanOrEqual(50);
  });
});

// ─── Square Bar ──────────────────────────────────────────────────────────────
describe('Square Bar', () => {
  it('side encoded', () => {
    expect(buildStructuralSteelItemCode(ss({
      section_type: 'Square Bar', material_grade: 'IS 2062 E350',
      side_mm: '50',
    }))).toBe('RM-STR-SB-E350-50');
  });
  it('worst-case with CTS ≤ 50 chars', () => {
    const code = buildStructuralSteelItemCode(cts({
      section_type: 'Square Bar', material_grade: 'IS 2062 E250BO',
      side_mm: '150', cut_length_mm: '12000',
    }));
    expect(code.length).toBeLessThanOrEqual(50);
  });
});

// ─── SHS (Square Hollow Section) ─────────────────────────────────────────────
describe('SHS (Square Hollow Section)', () => {
  it('side × wall thickness', () => {
    expect(buildStructuralSteelItemCode(ss({
      section_type: 'SHS (Square Hollow Section)', material_grade: 'IS 2062 E250 BR',
      shs_side_mm: '150', wall_thickness_mm: '6',
    }))).toBe('RM-STR-SHS-E250BR-150X6');
  });
  it('CTS variant', () => {
    expect(buildStructuralSteelItemCode(cts({
      section_type: 'SHS (Square Hollow Section)', material_grade: 'IS 2062 E250A',
      shs_side_mm: '150', wall_thickness_mm: '6', cut_length_mm: '3000',
    }))).toBe('RM-STR-SHS-E250A-150X6-CTS-3000MM');
  });
  it('worst-case with CTS ≤ 50 chars', () => {
    const code = buildStructuralSteelItemCode(cts({
      section_type: 'SHS (Square Hollow Section)', material_grade: 'IS 2062 E250BO',
      shs_side_mm: '300', wall_thickness_mm: '16', cut_length_mm: '12000',
    }));
    expect(code).toBe('RM-STR-SHS-E250BO-300X16-CTS-12000MM');
    expect(code.length).toBeLessThanOrEqual(50);
  });
});

// ─── Grating (GI) ────────────────────────────────────────────────────────────
describe('Grating (GI)', () => {
  it('encodes all 6 fields', () => {
    expect(buildStructuralSteelItemCode(ss({
      section_type: 'Grating (GI)',
      bb_width_mm: '40', bb_thickness_mm: '5', bb_pitch_mm: '30',
      cb_pitch_mm: '100', panel_width_mm: '1000', panel_length_mm: '6000',
    }))).toBe('RM-STR-GRTGI-40X5-P30-C100-1000X6000');
  });
  it('throws when a field is missing', () => {
    expect(() => buildStructuralSteelItemCode(ss({
      section_type: 'Grating (GI)',
      bb_width_mm: '40', bb_thickness_mm: '5', bb_pitch_mm: '30',
      cb_pitch_mm: '100', panel_width_mm: '1000',
    }))).toThrow();
  });
  it('decimal dimensions normalised', () => {
    const code = buildStructuralSteelItemCode(ss({
      section_type: 'Grating (GI)',
      bb_width_mm: '40.0', bb_thickness_mm: '5.0', bb_pitch_mm: '30.0',
      cb_pitch_mm: '100.0', panel_width_mm: '1000.0', panel_length_mm: '6000.0',
    }));
    expect(code).toBe('RM-STR-GRTGI-40X5-P30-C100-1000X6000');
  });
  it('worst-case ≤ 50 chars', () => {
    const code = buildStructuralSteelItemCode(ss({
      section_type: 'Grating (GI)',
      bb_width_mm: '100', bb_thickness_mm: '10', bb_pitch_mm: '40',
      cb_pitch_mm: '100', panel_width_mm: '1200', panel_length_mm: '6000',
    }));
    expect(code.length).toBeLessThanOrEqual(50);
  });
});

// ─── Grating (SS) ────────────────────────────────────────────────────────────
describe('Grating (SS)', () => {
  it('SS316 — includes GMAT segment', () => {
    expect(buildStructuralSteelItemCode(ss({
      section_type: 'Grating (SS)', grating_material: 'SS316',
      bb_width_mm: '40', bb_thickness_mm: '5', bb_pitch_mm: '30',
      cb_pitch_mm: '100', panel_width_mm: '600', panel_length_mm: '6000',
    }))).toBe('RM-STR-GRTSS-SS316-40X5-P30-C100-600X6000');
  });
  it('SS304 variant', () => {
    const code = buildStructuralSteelItemCode(ss({
      section_type: 'Grating (SS)', grating_material: 'SS304',
      bb_width_mm: '30', bb_thickness_mm: '3', bb_pitch_mm: '22',
      cb_pitch_mm: '50', panel_width_mm: '500', panel_length_mm: '3000',
    }));
    expect(code.startsWith('RM-STR-GRTSS-SS304-')).toBe(true);
  });
  it('throws for unrecognised grating material', () => {
    expect(() => buildStructuralSteelItemCode(ss({
      section_type: 'Grating (SS)', grating_material: 'Monel',
      bb_width_mm: '40', bb_thickness_mm: '5', bb_pitch_mm: '30',
      cb_pitch_mm: '100', panel_width_mm: '600', panel_length_mm: '6000',
    }))).toThrow();
  });
  it('worst-case ≤ 50 chars', () => {
    const code = buildStructuralSteelItemCode(ss({
      section_type: 'Grating (SS)', grating_material: 'SS316',
      bb_width_mm: '100', bb_thickness_mm: '10', bb_pitch_mm: '40',
      cb_pitch_mm: '100', panel_width_mm: '1200', panel_length_mm: '6000',
    }));
    expect(code).toBe('RM-STR-GRTSS-SS316-100X10-P40-C100-1200X6000');
    expect(code.length).toBeLessThanOrEqual(50);
  });
});

// ─── All 17 material grades produce valid codes ───────────────────────────────
describe('All material grades — Round Bar spot-check', () => {
  const GRADES = [
    'IS 2062 E250A','IS 2062 E250 BR','IS 2062 E250 C','IS 2062 E250BO',
    'IS 2062 E300','IS 2062 E350','IS 2062 E350BO','IS 2062 E410',
    'SS 304','SS 304L','SS 316','SS 316L',
    'ASTM A36','ASTM A500','ASTM A572 Gr 50','EN S275','EN S355',
  ];
  it('all 17 grades generate a code starting RM-STR-RB-', () => {
    for (const grade of GRADES) {
      const code = buildStructuralSteelItemCode(ss({
        section_type: 'Round Bar', material_grade: grade, diameter_mm: '50',
      }));
      expect(code.startsWith('RM-STR-RB-')).toBe(true);
      expect(code.length).toBeLessThanOrEqual(50);
    }
  });
});

// ─── General guards ───────────────────────────────────────────────────────────
describe('General guards', () => {
  it('throws for unknown section type', () => {
    expect(() => buildStructuralSteelItemCode({ section_type: 'Mystery Section' })).toThrow();
  });
  it('throws for unknown grade on non-grating type', () => {
    expect(() => buildStructuralSteelItemCode(ss({
      section_type: 'Round Bar', material_grade: 'NotAGrade', diameter_mm: '50',
    }))).toThrow();
  });
  it('grating GI does not need material_grade', () => {
    expect(() => buildStructuralSteelItemCode(ss({
      section_type: 'Grating (GI)',
      bb_width_mm: '40', bb_thickness_mm: '5', bb_pitch_mm: '30',
      cb_pitch_mm: '100', panel_width_mm: '600', panel_length_mm: '6000',
    }))).not.toThrow();
  });
});
