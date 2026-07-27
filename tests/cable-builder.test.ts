/**
 * tests/cable-builder.test.ts
 * Unit tests for buildCablingItemCode
 *
 * Procurement identity: cable type, core config, conductor size, voltage grade,
 *                       armour (if not Unarmoured), screening (if not Unscreened)
 * Engineering spec (not in code): insulation, outer sheath, laying type, standard
 */

import { describe, it, expect } from 'vitest';
import { buildCablingItemCode } from '../server/buy-catalog-sap-service';

// ── helper ────────────────────────────────────────────────────────────────────
function cable(overrides: Record<string, unknown> = {}) {
  return {
    cable_type:   'Power Cable',
    core_config:  '4 Core',
    cable_size:   '10 mm²',
    voltage:      '1.1kV',
    armour:       'Unarmoured',
    screening:    'Unscreened',
    // engineering spec — must NOT appear in the code
    insulation:   'XLPE',
    outer_sheath: 'PVC',
    laying_type:  'Cable Tray',
    standard:     'IS 7098',
    ...overrides,
  };
}

// ── Suite 1: Power Cable ──────────────────────────────────────────────────────
describe('buildCablingItemCode — Power Cable', () => {
  it('basic 4Cx10 unarmoured unscreened', () => {
    expect(buildCablingItemCode(cable())).toBe('ELC-CBL-PWR-4Cx10-1.1kV');
  });

  it('SWA armoured power cable', () => {
    expect(buildCablingItemCode(cable({ armour: 'SWA (Steel Wire Armour)' }))).toBe('ELC-CBL-PWR-4Cx10-1.1kV-SWA');
  });

  it('STA armoured power cable', () => {
    expect(buildCablingItemCode(cable({ armour: 'STA (Steel Tape Armour)' }))).toBe('ELC-CBL-PWR-4Cx10-1.1kV-STA');
  });

  it('Braided Wire Armour power cable', () => {
    expect(buildCablingItemCode(cable({ armour: 'Braided Wire Armour' }))).toBe('ELC-CBL-PWR-4Cx10-1.1kV-BWA');
  });

  it('engineering spec fields (insulation, sheath, standard) do NOT appear in code', () => {
    const code = buildCablingItemCode(cable({ insulation: 'PVC', outer_sheath: 'LSZH', standard: 'IEC 60502' }));
    expect(code).not.toContain('PVC');
    expect(code).not.toContain('LSZH');
    expect(code).not.toContain('IEC');
    expect(code).toBe('ELC-CBL-PWR-4Cx10-1.1kV');
  });
});

// ── Suite 2: Control Cable ────────────────────────────────────────────────────
describe('buildCablingItemCode — Control Cable', () => {
  it('basic 7Cx2.5 unarmoured', () => {
    expect(buildCablingItemCode(cable({ cable_type: 'Control Cable', core_config: '7 Core', cable_size: '2.5 mm²' }))).toBe('ELC-CBL-CTL-7Cx2.5-1.1kV');
  });

  it('overall screened control cable', () => {
    expect(buildCablingItemCode(cable({ cable_type: 'Control Cable', core_config: '12 Core', cable_size: '1.5 mm²', screening: 'Overall Screened' }))).toBe('ELC-CBL-CTL-12Cx1.5-1.1kV-OS');
  });

  it('armoured + screened control cable', () => {
    expect(buildCablingItemCode(cable({ cable_type: 'Control Cable', core_config: '19 Core', cable_size: '1.5 mm²', armour: 'SWA (Steel Wire Armour)', screening: 'Individual + Overall Screened' }))).toBe('ELC-CBL-CTL-19Cx1.5-1.1kV-SWA-IOS');
  });
});

// ── Suite 3: Instrumentation Cable ────────────────────────────────────────────
describe('buildCablingItemCode — Instrumentation Cable', () => {
  it('individually screened pair', () => {
    expect(buildCablingItemCode(cable({ cable_type: 'Instrumentation Cable', core_config: '2 Core', cable_size: '1.5 mm²', screening: 'Individually Screened' }))).toBe('ELC-CBL-INS-2Cx1.5-1.1kV-IS');
  });

  it('individual + overall screened with armour', () => {
    expect(buildCablingItemCode(cable({ cable_type: 'Instrumentation Cable', core_config: '27 Core', cable_size: '1.5 mm²', armour: 'SWA (Steel Wire Armour)', screening: 'Individual + Overall Screened' }))).toBe('ELC-CBL-INS-27Cx1.5-1.1kV-SWA-IOS');
  });
});

// ── Suite 4: Other cable types ────────────────────────────────────────────────
describe('buildCablingItemCode — Other types', () => {
  it('Data / Comm Cable', () => {
    expect(buildCablingItemCode(cable({ cable_type: 'Data / Comm Cable', core_config: '2 Core', cable_size: '1.0 mm²' }))).toBe('ELC-CBL-DAT-2Cx1.0-1.1kV');
  });

  it('Earthing Cable single core', () => {
    expect(buildCablingItemCode(cable({ cable_type: 'Earthing Cable', core_config: '1 Core', cable_size: '70 mm²', voltage: '600/1000V' }))).toBe('ELC-CBL-ETH-1Cx70-1kV');
  });

  it('Fire Resistant Cable armoured', () => {
    expect(buildCablingItemCode(cable({ cable_type: 'Fire Resistant Cable', core_config: '4 Core', cable_size: '16 mm²', armour: 'SWA (Steel Wire Armour)' }))).toBe('ELC-CBL-FRS-4Cx16-1.1kV-SWA');
  });
});

// ── Suite 5: Voltage grades ───────────────────────────────────────────────────
describe('buildCablingItemCode — Voltage grades', () => {
  it('300/500V → 0.5kV', () => {
    expect(buildCablingItemCode(cable({ voltage: '300/500V' }))).toBe('ELC-CBL-PWR-4Cx10-0.5kV');
  });

  it('450/750V → 0.75kV', () => {
    expect(buildCablingItemCode(cable({ voltage: '450/750V' }))).toBe('ELC-CBL-PWR-4Cx10-0.75kV');
  });

  it('600/1000V → 1kV', () => {
    expect(buildCablingItemCode(cable({ voltage: '600/1000V' }))).toBe('ELC-CBL-PWR-4Cx10-1kV');
  });

  it('3.3kV HV power cable', () => {
    expect(buildCablingItemCode(cable({ core_config: '3 Core', cable_size: '185 mm²', voltage: '3.3kV', armour: 'SWA (Steel Wire Armour)' }))).toBe('ELC-CBL-PWR-3Cx185-3.3kV-SWA');
  });

  it('11kV HV cable — worst-case length', () => {
    const code = buildCablingItemCode(cable({ cable_type: 'Fire Resistant Cable', core_config: '3.5 Core', cable_size: '240 mm²', voltage: '11kV', armour: 'SWA (Steel Wire Armour)', screening: 'Individual + Overall Screened' }));
    expect(code).toBe('ELC-CBL-FRS-3.5Cx240-11kV-SWA-IOS');
    expect(code.length).toBeLessThanOrEqual(50);
  });
});

// ── Suite 6: Edge cases ───────────────────────────────────────────────────────
describe('buildCablingItemCode — Edge cases', () => {
  it('3.5 Core encoding', () => {
    expect(buildCablingItemCode(cable({ core_config: '3.5 Core', cable_size: '95 mm²' }))).toBe('ELC-CBL-PWR-3.5Cx95-1.1kV');
  });

  it('all valid codes stay within 50-char SAP limit', () => {
    const cases = [
      cable({ cable_type: 'Instrumentation Cable', core_config: '27 Core', cable_size: '2.5 mm²', voltage: '11kV', armour: 'SWA (Steel Wire Armour)', screening: 'Individual + Overall Screened' }),
      cable({ cable_type: 'Control Cable', core_config: '27 Core', cable_size: '2.5 mm²', voltage: '6.6kV', armour: 'STA (Steel Tape Armour)', screening: 'Overall Screened' }),
    ];
    for (const c of cases) {
      const code = buildCablingItemCode(c);
      expect(code.length, `"${code}" exceeds 50 chars`).toBeLessThanOrEqual(50);
    }
  });

  it('throws on unrecognised cable type', () => {
    expect(() => buildCablingItemCode(cable({ cable_type: 'Submarine Cable' }))).toThrow('Cannot generate Cabling SAP Item Code');
  });

  it('throws on unrecognised voltage', () => {
    expect(() => buildCablingItemCode(cable({ voltage: '415V' }))).toThrow('Cannot generate Cabling SAP Item Code');
  });

  it('throws when cable_type is empty', () => {
    expect(() => buildCablingItemCode(cable({ cable_type: '' }))).toThrow('Cannot generate Cabling SAP Item Code');
  });

  it('throws when core_config is empty', () => {
    expect(() => buildCablingItemCode(cable({ core_config: '' }))).toThrow('Cannot generate Cabling SAP Item Code');
  });

  it('throws when cable_size is empty', () => {
    expect(() => buildCablingItemCode(cable({ cable_size: '' }))).toThrow('Cannot generate Cabling SAP Item Code');
  });

  it('throws when voltage is empty', () => {
    expect(() => buildCablingItemCode(cable({ voltage: '' }))).toThrow('Cannot generate Cabling SAP Item Code');
  });
});
