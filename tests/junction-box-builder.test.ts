/**
 * tests/junction-box-builder.test.ts
 * Unit tests for buildJunctionBoxItemCode
 *
 * Procurement identity: JB Type, Number of Terminals, Body Material, IP Rating,
 *                       Area Classification (mandatory + hazardous-only for IS/FLP;
 *                       optional, omitted for Safe Area, on other types)
 * Engineering spec (not in code): terminal type, mounting, gland details,
 *                                  certification, earthing, accessories, make
 */

import { describe, it, expect } from 'vitest';
import { buildJunctionBoxItemCode } from '../server/buy-catalog-sap-service';

// ── helper ────────────────────────────────────────────────────────────────────
function jb(overrides: Record<string, unknown> = {}) {
  return {
    jb_type:             'General Purpose JB',
    num_terminals:       '12',
    body_material:       'GRP/FRP',
    enclosure_type:      'IP65',
    area_classification: 'Safe Area',
    // engineering spec — must NOT appear in code
    terminal_type:       'Screw Clamp (Weidmuller)',
    mounting:            'Wall Mounted',
    certification:       'No Certification Required',
    earthing:            'External Earthing Boss (M8)',
    make:                'Rittal',
    ...overrides,
  };
}

// ── Suite 1: Standard types — Safe Area (area omitted) ────────────────────────
describe('buildJunctionBoxItemCode — standard types, Safe Area', () => {
  it('General Purpose JB, GRP, IP65, 12T', () => {
    expect(buildJunctionBoxItemCode(jb())).toBe('ELC-JBX-GP-12T-GRP-IP65');
  });

  it('Marshalling JB, SS316, IP66, 48T', () => {
    expect(buildJunctionBoxItemCode(jb({ jb_type: 'Marshalling JB', num_terminals: '48', body_material: 'SS316', enclosure_type: 'IP66' }))).toBe('ELC-JBX-MRS-48T-S316-IP66');
  });

  it('Thermocouple JB, Polycarbonate, IP65, 8T', () => {
    expect(buildJunctionBoxItemCode(jb({ jb_type: 'Thermocouple JB', num_terminals: '8', body_material: 'Polycarbonate', enclosure_type: 'IP65' }))).toBe('ELC-JBX-TC-8T-PC-IP65');
  });

  it('RTD JB, SS304, IP66, 6T', () => {
    expect(buildJunctionBoxItemCode(jb({ jb_type: 'RTD JB', num_terminals: '6', body_material: 'SS304', enclosure_type: 'IP66' }))).toBe('ELC-JBX-RTD-6T-S304-IP66');
  });

  it('Field JB, Die-Cast Aluminium, IP67, 24T', () => {
    expect(buildJunctionBoxItemCode(jb({ jb_type: 'Field JB', num_terminals: '24', body_material: 'Die-Cast Aluminium', enclosure_type: 'IP67' }))).toBe('ELC-JBX-FLD-24T-ALU-IP67');
  });

  it('Panel JB, Mild Steel, IP65, 20T', () => {
    expect(buildJunctionBoxItemCode(jb({ jb_type: 'Panel JB', num_terminals: '20', body_material: 'Mild Steel (Painted)', enclosure_type: 'IP65' }))).toBe('ELC-JBX-PNL-20T-MS-IP65');
  });

  it('Signal Distribution JB, Carbon Steel, IP65, 30T', () => {
    expect(buildJunctionBoxItemCode(jb({ jb_type: 'Signal Distribution JB', num_terminals: '30', body_material: 'Carbon Steel', enclosure_type: 'IP65' }))).toBe('ELC-JBX-SIG-30T-CS-IP65');
  });

  it('engineering spec fields do NOT appear in code', () => {
    const code = buildJunctionBoxItemCode(jb({ terminal_type: 'Spring Cage (WAGO)', mounting: 'Pole Mounted', certification: 'ATEX Certified' }));
    expect(code).not.toContain('WAGO');
    expect(code).not.toContain('Pole');
    expect(code).not.toContain('ATEX');
    expect(code).toBe('ELC-JBX-GP-12T-GRP-IP65');
  });
});

// ── Suite 2: Hazardous area — standard types ───────────────────────────────────
describe('buildJunctionBoxItemCode — standard types, hazardous area', () => {
  it('Zone 1 IIA/IIB → Z1A', () => {
    expect(buildJunctionBoxItemCode(jb({ area_classification: 'Zone 1 (Gas Groups IIA/IIB)' }))).toBe('ELC-JBX-GP-12T-GRP-IP65-Z1A');
  });

  it('Zone 1 IIC → Z1C', () => {
    expect(buildJunctionBoxItemCode(jb({ area_classification: 'Zone 1 (Gas Group IIC)' }))).toBe('ELC-JBX-GP-12T-GRP-IP65-Z1C');
  });

  it('Zone 2 → Z2', () => {
    expect(buildJunctionBoxItemCode(jb({ area_classification: 'Zone 2' }))).toBe('ELC-JBX-GP-12T-GRP-IP65-Z2');
  });

  it('Division 1 → D1', () => {
    expect(buildJunctionBoxItemCode(jb({ area_classification: 'Division 1' }))).toBe('ELC-JBX-GP-12T-GRP-IP65-D1');
  });

  it('Division 2 → D2', () => {
    expect(buildJunctionBoxItemCode(jb({ area_classification: 'Division 2' }))).toBe('ELC-JBX-GP-12T-GRP-IP65-D2');
  });
});

// ── Suite 3: IS and FLP types — mandatory hazardous area ──────────────────────
describe('buildJunctionBoxItemCode — IS and FLP types', () => {
  it('Intrinsically Safe JB, Zone 1 IIA/IIB', () => {
    expect(buildJunctionBoxItemCode(jb({ jb_type: 'Intrinsically Safe JB', body_material: 'SS316', enclosure_type: 'IP66', area_classification: 'Zone 1 (Gas Groups IIA/IIB)' }))).toBe('ELC-JBX-IS-12T-S316-IP66-Z1A');
  });

  it('Intrinsically Safe JB, Zone 1 IIC', () => {
    expect(buildJunctionBoxItemCode(jb({ jb_type: 'Intrinsically Safe JB', body_material: 'SS316', enclosure_type: 'IP66', area_classification: 'Zone 1 (Gas Group IIC)' }))).toBe('ELC-JBX-IS-12T-S316-IP66-Z1C');
  });

  it('Flameproof JB, Zone 1 IIA/IIB', () => {
    expect(buildJunctionBoxItemCode(jb({ jb_type: 'Flameproof JB', num_terminals: '24', body_material: 'SS316', enclosure_type: 'IP66', area_classification: 'Zone 1 (Gas Groups IIA/IIB)' }))).toBe('ELC-JBX-FLP-24T-S316-IP66-Z1A');
  });

  it('Flameproof JB, Zone 2', () => {
    expect(buildJunctionBoxItemCode(jb({ jb_type: 'Flameproof JB', body_material: 'SS316', enclosure_type: 'IP67', area_classification: 'Zone 2' }))).toBe('ELC-JBX-FLP-12T-S316-IP67-Z2');
  });

  it('IS JB throws when area is Safe Area', () => {
    expect(() => buildJunctionBoxItemCode(jb({ jb_type: 'Intrinsically Safe JB', area_classification: 'Safe Area' }))).toThrow('Cannot generate Junction Box SAP Item Code');
  });

  it('FLP JB throws when area is blank', () => {
    expect(() => buildJunctionBoxItemCode(jb({ jb_type: 'Flameproof JB', area_classification: '' }))).toThrow('Cannot generate Junction Box SAP Item Code');
  });

  it('IS JB throws when area is Non-classified', () => {
    expect(() => buildJunctionBoxItemCode(jb({ jb_type: 'Intrinsically Safe JB', area_classification: 'Non-classified' }))).toThrow('Cannot generate Junction Box SAP Item Code');
  });
});

// ── Suite 4: Custom terminal count ────────────────────────────────────────────
describe('buildJunctionBoxItemCode — custom terminal count', () => {
  it('Other + valid custom count → encoded as numeric', () => {
    expect(buildJunctionBoxItemCode(jb({ num_terminals: 'Other', custom_terminal_count: '36' }))).toBe('ELC-JBX-GP-36T-GRP-IP65');
  });

  it('Other + large custom count', () => {
    expect(buildJunctionBoxItemCode(jb({ num_terminals: 'Other', custom_terminal_count: '144' }))).toBe('ELC-JBX-GP-144T-GRP-IP65');
  });

  it('Other without custom count → throws', () => {
    expect(() => buildJunctionBoxItemCode(jb({ num_terminals: 'Other', custom_terminal_count: '' }))).toThrow('Cannot generate Junction Box SAP Item Code');
  });

  it('Other with zero → throws', () => {
    expect(() => buildJunctionBoxItemCode(jb({ num_terminals: 'Other', custom_terminal_count: '0' }))).toThrow('Cannot generate Junction Box SAP Item Code');
  });

  it('Other with negative → throws', () => {
    expect(() => buildJunctionBoxItemCode(jb({ num_terminals: 'Other', custom_terminal_count: '-5' }))).toThrow('Cannot generate Junction Box SAP Item Code');
  });
});

// ── Suite 5: Required field validation ────────────────────────────────────────
describe('buildJunctionBoxItemCode — required field errors', () => {
  it('throws when jb_type is missing', () => {
    expect(() => buildJunctionBoxItemCode(jb({ jb_type: '' }))).toThrow('Cannot generate Junction Box SAP Item Code');
  });

  it('throws when jb_type is unrecognised', () => {
    expect(() => buildJunctionBoxItemCode(jb({ jb_type: 'Explosion Proof JB' }))).toThrow('Cannot generate Junction Box SAP Item Code');
  });

  it('throws when num_terminals is missing', () => {
    expect(() => buildJunctionBoxItemCode(jb({ num_terminals: '' }))).toThrow('Cannot generate Junction Box SAP Item Code');
  });

  it('throws when body_material is missing', () => {
    expect(() => buildJunctionBoxItemCode(jb({ body_material: '' }))).toThrow('Cannot generate Junction Box SAP Item Code');
  });

  it('throws when IP rating is missing', () => {
    expect(() => buildJunctionBoxItemCode(jb({ enclosure_type: '' }))).toThrow('Cannot generate Junction Box SAP Item Code');
  });

  it('throws when IP rating is unrecognised', () => {
    expect(() => buildJunctionBoxItemCode(jb({ enclosure_type: 'IP54' }))).toThrow('Cannot generate Junction Box SAP Item Code');
  });
});

// ── Suite 6: Length and all-types check ───────────────────────────────────────
describe('buildJunctionBoxItemCode — length and completeness', () => {
  it('all codes stay within 50-char SAP limit', () => {
    const cases = [
      jb({ jb_type: 'Flameproof JB', num_terminals: '96', body_material: 'SS316', enclosure_type: 'IP68', area_classification: 'Zone 1 (Gas Groups IIA/IIB)' }),
      jb({ jb_type: 'Intrinsically Safe JB', num_terminals: 'Other', custom_terminal_count: '999', body_material: 'Die-Cast Aluminium', enclosure_type: 'IP67', area_classification: 'Zone 1 (Gas Group IIC)' }),
      jb({ jb_type: 'Marshalling JB', num_terminals: '96', body_material: 'SS316', enclosure_type: 'IP66', area_classification: 'Division 1' }),
    ];
    for (const c of cases) {
      const code = buildJunctionBoxItemCode(c);
      expect(code.length, `"${code}" exceeds 50 chars`).toBeLessThanOrEqual(50);
    }
  });

  it('Non-classified area is encoded for standard types', () => {
    expect(buildJunctionBoxItemCode(jb({ area_classification: 'Non-classified' }))).toBe('ELC-JBX-GP-12T-GRP-IP65-NC');
  });
});
