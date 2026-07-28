import { describe, it, expect } from 'vitest';
import { buildGasketsItemCode } from '../server/buy-catalog-sap-service';

// ─── helpers ────────────────────────────────────────────────────────────────
function swio(overrides: Record<string, string> = {}) {
  return {
    gasket_type:          'Spiral Wound – Inner + Outer Ring',
    winding_material:     'SS316 / Graphite',
    inner_ring_material:  'SS316',
    outer_ring_material:  'Carbon Steel',
    nominal_bore:         '50NB',
    pressure_class:       '150#',
    facing:               'RF',
    ...overrides,
  };
}
function cmg(overrides: Record<string, string> = {}) {
  return {
    gasket_type:    'Corrugated Metal Gasket',
    cmg_material:   'SS316',
    nominal_bore:   '50NB',
    pressure_class: '150#',
    facing:         'RF',
    ...overrides,
  };
}
function fsg(overrides: Record<string, string> = {}) {
  return {
    gasket_type:      'Flat Sheet Gasket',
    sheet_material:   'CAF-Free (Non-asbestos)',
    sheet_thickness:  '3',
    nominal_bore:     '50NB',
    pressure_class:   '150#',
    facing:           'RF',
    ...overrides,
  };
}
function scgRing(overrides: Record<string, string> = {}) {
  return {
    gasket_type:     'Soft Cut Gasket',
    sheet_material:  'PTFE',
    sheet_thickness: '3',
    scg_shape:       'Ring',
    scg_id:          '50',
    scg_od:          '100',
    ...overrides,
  };
}
function scgRect(overrides: Record<string, string> = {}) {
  return {
    gasket_type:     'Soft Cut Gasket',
    sheet_material:  'EPDM',
    sheet_thickness: '6',
    scg_shape:       'Rectangular',
    scg_length:      '300',
    scg_width:       '200',
    ...overrides,
  };
}
function oring(overrides: Record<string, string> = {}) {
  return {
    gasket_type:    'O-Ring',
    oring_material: 'NBR',
    oring_id:       '50',
    oring_od:       '60.66',
    oring_cs:       '5.33',
    oring_hardness: '70A',
    ...overrides,
  };
}

// ─── SWIO ────────────────────────────────────────────────────────────────────
describe('SWIO — Spiral Wound Inner + Outer Ring', () => {
  it('generates baseline code', () => {
    expect(buildGasketsItemCode(swio())).toBe('RM-GSK-SWIO-316G-316-CS-50NB-150-RF');
  });
  it('winding: SS304/Graphite → 304G', () => {
    expect(buildGasketsItemCode(swio({ winding_material: 'SS304 / Graphite' }))).toContain('-304G-');
  });
  it('winding: Inconel 625/Graphite → IC625G', () => {
    expect(buildGasketsItemCode(swio({ winding_material: 'Inconel 625 / Graphite' }))).toContain('-IC625G-');
  });
  it('winding: SS316/PTFE → 316T', () => {
    expect(buildGasketsItemCode(swio({ winding_material: 'SS316 / PTFE' }))).toContain('-316T-');
  });
  it('winding: SS316/Ceramic → 316C', () => {
    expect(buildGasketsItemCode(swio({ winding_material: 'SS316 / Ceramic' }))).toContain('-316C-');
  });
  it('inner ring: Monel 400 → MNL400', () => {
    expect(buildGasketsItemCode(swio({ inner_ring_material: 'Monel 400' }))).toContain('-MNL400-');
  });
  it('outer ring: SS316 → 316', () => {
    expect(buildGasketsItemCode(swio({ outer_ring_material: 'SS316' }))).toContain('-316-50NB-');
  });
  it('outer ring: Inconel 625 → IC625', () => {
    expect(buildGasketsItemCode(swio({ outer_ring_material: 'Inconel 625' }))).toContain('-IC625-50NB-');
  });
  it('pressure class 2500# → 2500', () => {
    expect(buildGasketsItemCode(swio({ pressure_class: '2500#' }))).toContain('-2500-');
  });
  it('facing FF encoded', () => {
    expect(buildGasketsItemCode(swio({ facing: 'FF' }))).toMatch(/-FF$/);
  });
  it('worst-case code ≤ 50 chars (Inconel winding, Monel inner+outer, 1200NB, 2500#)', () => {
    const code = buildGasketsItemCode(swio({
      winding_material:    'Inconel 625 / Graphite',
      inner_ring_material: 'Inconel 625',
      outer_ring_material: 'Monel 400',
      nominal_bore:        '1200NB',
      pressure_class:      '2500#',
    }));
    expect(code.length).toBeLessThanOrEqual(50);
  });
  it('throws on missing winding material', () => {
    expect(() => buildGasketsItemCode(swio({ winding_material: '' }))).toThrow('Winding Material');
  });
  it('throws on unrecognised facing', () => {
    expect(() => buildGasketsItemCode(swio({ facing: '' }))).toThrow('Flange Facing');
  });
});

// ─── CMG ─────────────────────────────────────────────────────────────────────
describe('CMG — Corrugated Metal Gasket', () => {
  it('bare CMG', () => {
    expect(buildGasketsItemCode(cmg())).toBe('RM-GSK-CMG-316-50NB-150-RF');
  });
  it('faced CMG — Graphite surface', () => {
    expect(buildGasketsItemCode(cmg({ cmg_surface: 'Graphite' }))).toBe('RM-GSK-CMG-316-GRPH-50NB-150-RF');
  });
  it('faced CMG — PTFE surface', () => {
    expect(buildGasketsItemCode(cmg({ cmg_surface: 'PTFE' }))).toBe('RM-GSK-CMG-316-PTFE-50NB-150-RF');
  });
  it('core: Inconel 625 → IC625', () => {
    expect(buildGasketsItemCode(cmg({ cmg_material: 'Inconel 625' }))).toContain('-IC625-');
  });
  it('core: Carbon Steel → CS', () => {
    expect(buildGasketsItemCode(cmg({ cmg_material: 'Carbon Steel' }))).toContain('-CS-');
  });
  it('PN 10 pressure class', () => {
    expect(buildGasketsItemCode(cmg({ pressure_class: 'PN 10' }))).toContain('-PN10-');
  });
  it('worst-case code ≤ 50 chars (Inconel, GRPH surface, 1200NB, 2500#)', () => {
    const code = buildGasketsItemCode(cmg({ cmg_material: 'Inconel 625', cmg_surface: 'Graphite', nominal_bore: '1200NB', pressure_class: '2500#' }));
    expect(code.length).toBeLessThanOrEqual(50);
  });
  it('throws on unknown surface layer', () => {
    expect(() => buildGasketsItemCode(cmg({ cmg_surface: 'Rubber' }))).toThrow('Surface Layer');
  });
  it('throws on missing core material', () => {
    expect(() => buildGasketsItemCode(cmg({ cmg_material: '' }))).toThrow('Core Material');
  });
  it('throws on missing facing', () => {
    expect(() => buildGasketsItemCode(cmg({ facing: '' }))).toThrow('Flange Facing');
  });
});

// ─── FSG ─────────────────────────────────────────────────────────────────────
describe('FSG — Flat Sheet Gasket', () => {
  it('CNAF 3mm RF', () => {
    expect(buildGasketsItemCode(fsg())).toBe('RM-GSK-FSG-CNAF-3MM-50NB-150-RF');
  });
  it('PTFE 1.5mm FF', () => {
    expect(buildGasketsItemCode(fsg({ sheet_material: 'PTFE', sheet_thickness: '1.5', facing: 'FF' })))
      .toBe('RM-GSK-FSG-PTFE-1.5MM-50NB-150-FF');
  });
  it('Expanded Graphite → EXGRPH', () => {
    expect(buildGasketsItemCode(fsg({ sheet_material: 'Expanded Graphite' }))).toContain('-EXGRPH-');
  });
  it('EPDM', () => { expect(buildGasketsItemCode(fsg({ sheet_material: 'EPDM' }))).toContain('-EPDM-'); });
  it('Neoprene → NEOP', () => { expect(buildGasketsItemCode(fsg({ sheet_material: 'Neoprene' }))).toContain('-NEOP-'); });
  it('Silicone → SIL', () => { expect(buildGasketsItemCode(fsg({ sheet_material: 'Silicone' }))).toContain('-SIL-'); });
  it('NBR', () => { expect(buildGasketsItemCode(fsg({ sheet_material: 'NBR' }))).toContain('-NBR-'); });
  it('Compressed Fibre → CFB', () => { expect(buildGasketsItemCode(fsg({ sheet_material: 'Compressed Fibre' }))).toContain('-CFB-'); });
  it('strips mm suffix from thickness input', () => {
    expect(buildGasketsItemCode(fsg({ sheet_thickness: '3mm' }))).toContain('-3MM-');
  });
  it('worst-case code ≤ 50 chars (EXGRPH, 1200NB, 2500#, FF)', () => {
    const code = buildGasketsItemCode(fsg({ sheet_material: 'Expanded Graphite', nominal_bore: '1200NB', pressure_class: '2500#', facing: 'FF' }));
    expect(code.length).toBeLessThanOrEqual(50);
  });
  it('throws on missing sheet material', () => {
    expect(() => buildGasketsItemCode(fsg({ sheet_material: '' }))).toThrow('Sheet Material');
  });
  it('throws on missing thickness', () => {
    expect(() => buildGasketsItemCode(fsg({ sheet_thickness: '' }))).toThrow('Thickness');
  });
  it('throws on missing NB', () => {
    expect(() => buildGasketsItemCode(fsg({ nominal_bore: '' }))).toThrow('Nominal Bore');
  });
});

// ─── SCG ─────────────────────────────────────────────────────────────────────
describe('SCG — Soft Cut Gasket', () => {
  it('Ring shape', () => {
    expect(buildGasketsItemCode(scgRing())).toBe('RM-GSK-SCG-PTFE-3MM-RNG-50X100');
  });
  it('Full Face Ring shape → FF', () => {
    expect(buildGasketsItemCode(scgRing({ scg_shape: 'Full Face Ring', scg_id: '25', scg_od: '80' })))
      .toBe('RM-GSK-SCG-PTFE-3MM-FF-25X80');
  });
  it('Rectangular shape', () => {
    expect(buildGasketsItemCode(scgRect())).toBe('RM-GSK-SCG-EPDM-6MM-RECT-300X200');
  });
  it('Expanded Graphite soft cut ring', () => {
    expect(buildGasketsItemCode(scgRing({ sheet_material: 'Expanded Graphite' }))).toContain('-EXGRPH-');
  });
  it('CNAF rectangular', () => {
    expect(buildGasketsItemCode(scgRect({ sheet_material: 'CAF-Free (Non-asbestos)' }))).toContain('-CNAF-');
  });
  it('Custom shape throws (manual entry required)', () => {
    expect(() => buildGasketsItemCode(scgRing({ scg_shape: 'Custom' }))).toThrow('manual SAP code entry');
  });
  it('worst-case ring code ≤ 50 chars (EXGRPH, 6mm, large dims)', () => {
    const code = buildGasketsItemCode(scgRing({ sheet_material: 'Expanded Graphite', sheet_thickness: '6', scg_id: '1200', scg_od: '1500' }));
    expect(code.length).toBeLessThanOrEqual(50);
  });
  it('worst-case rect code ≤ 50 chars (EXGRPH, 6mm, 1500×2000)', () => {
    const code = buildGasketsItemCode(scgRect({ sheet_material: 'Expanded Graphite', sheet_thickness: '6', scg_length: '1500', scg_width: '2000' }));
    expect(code.length).toBeLessThanOrEqual(50);
  });
  it('throws on missing shape', () => {
    expect(() => buildGasketsItemCode(scgRing({ scg_shape: '' }))).toThrow('Shape');
  });
  it('throws on missing ID for ring', () => {
    expect(() => buildGasketsItemCode(scgRing({ scg_id: '' }))).toThrow('Inner Diameter');
  });
  it('throws on missing length for rectangular', () => {
    expect(() => buildGasketsItemCode(scgRect({ scg_length: '' }))).toThrow('Length');
  });
});

// ─── O-Ring ───────────────────────────────────────────────────────────────────
describe('O-Ring', () => {
  it('NBR 70A baseline (exact user example)', () => {
    expect(buildGasketsItemCode(oring())).toBe('RM-GSK-ORING-NBR-50X60.66X5.33-70A');
  });
  it('70A and 90A produce different codes (not silently merged)', () => {
    const a = buildGasketsItemCode(oring({ oring_hardness: '70A' }));
    const b = buildGasketsItemCode(oring({ oring_hardness: '90A' }));
    expect(a).not.toBe(b);
    expect(b).toContain('-90A');
  });
  it('EPDM material → EPDM code', () => {
    expect(buildGasketsItemCode(oring({ oring_material: 'EPDM', oring_od: '60.66', oring_cs: '5.33' }))).toContain('-EPDM-');
  });
  it('Viton → VITON', () => {
    expect(buildGasketsItemCode(oring({ oring_material: 'Viton (FKM)', oring_od: '60.66', oring_cs: '5.33' }))).toContain('-VITON-');
  });
  it('Silicone → SIL', () => {
    expect(buildGasketsItemCode(oring({ oring_material: 'Silicone', oring_od: '60.66', oring_cs: '5.33' }))).toContain('-SIL-');
  });
  it('Neoprene → NEOP', () => {
    expect(buildGasketsItemCode(oring({ oring_material: 'Neoprene', oring_od: '60.66', oring_cs: '5.33' }))).toContain('-NEOP-');
  });
  it('PTFE — hardness not required, omitted from code', () => {
    const code = buildGasketsItemCode(oring({ oring_material: 'PTFE', oring_hardness: '' }));
    expect(code).toMatch(/^RM-GSK-ORING-PTFE-/);
    expect(code).not.toMatch(/-\d+A$/);
  });
  it('PTFE — hardness included when provided', () => {
    expect(buildGasketsItemCode(oring({ oring_material: 'PTFE', oring_hardness: '70A' }))).toMatch(/-70A$/);
  });
  it('dimension formatting: trailing zeros stripped (50.0 → 50)', () => {
    const code = buildGasketsItemCode(oring({ oring_id: '50.0', oring_od: '60.0', oring_cs: '5.0' }));
    expect(code).toContain('50X60X5');
    expect(code).not.toContain('50.0');
  });
  it('dimension formatting: meaningful decimals retained (5.33 stays 5.33)', () => {
    expect(buildGasketsItemCode(oring())).toContain('5.33');
  });
  it('dimension check passes for exact OD = ID + 2×CS', () => {
    // 25 + 2×3.53 = 32.06
    expect(() => buildGasketsItemCode(oring({ oring_id: '25', oring_od: '32.06', oring_cs: '3.53', oring_hardness: '70A' }))).not.toThrow();
  });
  it('dimension check passes within 1mm tolerance', () => {
    // 50 + 2×5 = 60; OD=60.8 (within 1mm)
    expect(() => buildGasketsItemCode(oring({ oring_id: '50', oring_od: '60.8', oring_cs: '5', oring_hardness: '70A' }))).not.toThrow();
  });
  it('dimension check fails when OD is clearly wrong', () => {
    // 50 + 2×5 = 60; OD=75 (way off)
    expect(() => buildGasketsItemCode(oring({ oring_id: '50', oring_od: '75', oring_cs: '5', oring_hardness: '70A' })))
      .toThrow('dimension check failed');
  });
  it('throws on missing hardness for NBR', () => {
    expect(() => buildGasketsItemCode(oring({ oring_hardness: '' }))).toThrow('Hardness');
  });
  it('throws on missing ID', () => {
    expect(() => buildGasketsItemCode(oring({ oring_id: '' }))).toThrow('Inside Diameter');
  });
  it('worst-case code ≤ 50 chars (VITON, large dims, 90A)', () => {
    const code = buildGasketsItemCode(oring({ oring_material: 'Viton (FKM)', oring_id: '600', oring_od: '614', oring_cs: '7', oring_hardness: '90A' }));
    expect(code.length).toBeLessThanOrEqual(50);
  });
});

// ─── General ─────────────────────────────────────────────────────────────────
describe('General', () => {
  it('throws on empty gasket type', () => {
    expect(() => buildGasketsItemCode({ gasket_type: '' })).toThrow('Gasket Type is required');
  });
  it('throws on unrecognised gasket type', () => {
    expect(() => buildGasketsItemCode({ gasket_type: 'RTJ — Oval' })).toThrow('not recognised');
  });
  it('all five family codes start with RM-GSK-', () => {
    const codes = [
      buildGasketsItemCode(swio()),
      buildGasketsItemCode(cmg()),
      buildGasketsItemCode(fsg()),
      buildGasketsItemCode(scgRing()),
      buildGasketsItemCode(oring()),
    ];
    codes.forEach(c => expect(c).toMatch(/^RM-GSK-/));
  });
});
