/**
 * tests/fittings-builder.test.ts
 * Unit tests for buildFittingsItemCode
 *
 * Standard BW/reducing:  RM-FTG-{TYPE}-{GRADE}-{NB}-{SCH}-{END}
 * Reducing:              RM-FTG-{TYPE}-{GRADE}-{NB}X{RNB}-{SCH}-{END}
 * SW/Screwed (CPLG/HCPL/UNI/BOSS): RM-FTG-{TYPE}-{GRADE}-{NB}-{PC}-{END}
 *
 * Procurement identity:
 *   All types : Type · Grade · NB · Schedule or Pressure Class · End Type
 *   Reducing  : + Reducing Bore
 *   SW/Screwed Coupling/Half Coupling/Union/Boss : Pressure Class replaces Schedule
 */

import { describe, it, expect } from 'vitest';
import { buildFittingsItemCode } from '../server/buy-catalog-sap-service';

// ── helpers ───────────────────────────────────────────────────────────────────
function ftg(overrides: Record<string, unknown> = {}) {
  return {
    fitting_type:     '90° 1.5D Elbow',
    material_grade:   'A234 WPB',
    nominal_bore:     '50NB',
    schedule:         'SCH 40',
    end_type:         'Butt Weld (BW)',
    // spec-only — must never affect the code
    fitting_standard: 'ASME B16.9',
    mtr_required:     'Yes',
    elbow_radius:     'Long Radius (LR)',
    ...overrides,
  };
}

function cplg(overrides: Record<string, unknown> = {}) {
  // Coupling + SW → uses pressure_class, not schedule
  return {
    fitting_type:     'Coupling',
    material_grade:   'A 105',
    nominal_bore:     '25NB',
    end_type:         'Socket Weld (SW)',
    pressure_class:   '3000LB',
    fitting_standard: 'ASME B16.11',
    mtr_required:     'No',
    ...overrides,
  };
}

// ── Suite 1: All 20 fitting type codes ───────────────────────────────────────
describe('buildFittingsItemCode — all 20 type codes', () => {
  it('90° 1D Elbow',       () => expect(buildFittingsItemCode(ftg({ fitting_type: '90° 1D Elbow'       }))).toBe('RM-FTG-E90-1D-A234-WPB-50NB-SCH40-BW'));
  it('90° 1.5D Elbow',     () => expect(buildFittingsItemCode(ftg()                                     )).toBe('RM-FTG-E90-1.5D-A234-WPB-50NB-SCH40-BW'));
  it('90° 2D Elbow',       () => expect(buildFittingsItemCode(ftg({ fitting_type: '90° 2D Elbow'       }))).toBe('RM-FTG-E90-2D-A234-WPB-50NB-SCH40-BW'));
  it('45° 1D Elbow',       () => expect(buildFittingsItemCode(ftg({ fitting_type: '45° 1D Elbow'       }))).toBe('RM-FTG-E45-1D-A234-WPB-50NB-SCH40-BW'));
  it('45° 1.5D Elbow',     () => expect(buildFittingsItemCode(ftg({ fitting_type: '45° 1.5D Elbow'     }))).toBe('RM-FTG-E45-1.5D-A234-WPB-50NB-SCH40-BW'));
  it('45° 2D Elbow',       () => expect(buildFittingsItemCode(ftg({ fitting_type: '45° 2D Elbow'       }))).toBe('RM-FTG-E45-2D-A234-WPB-50NB-SCH40-BW'));
  it('Equal Tee',          () => expect(buildFittingsItemCode(ftg({ fitting_type: 'Equal Tee'          }))).toBe('RM-FTG-TEE-A234-WPB-50NB-SCH40-BW'));
  it('Reducing Tee',       () => expect(buildFittingsItemCode(ftg({ fitting_type: 'Reducing Tee',       reducing_bore: '25NB' }))).toBe('RM-FTG-TEER-A234-WPB-50NBX25NB-SCH40-BW'));
  it('Cross',              () => expect(buildFittingsItemCode(ftg({ fitting_type: 'Cross'              }))).toBe('RM-FTG-CRS-A234-WPB-50NB-SCH40-BW'));
  it('Concentric Reducer', () => expect(buildFittingsItemCode(ftg({ fitting_type: 'Concentric Reducer', reducing_bore: '25NB' }))).toBe('RM-FTG-REDC-A234-WPB-50NBX25NB-SCH40-BW'));
  it('Eccentric Reducer',  () => expect(buildFittingsItemCode(ftg({ fitting_type: 'Eccentric Reducer',  reducing_bore: '25NB' }))).toBe('RM-FTG-REDE-A234-WPB-50NBX25NB-SCH40-BW'));
  it('End Cap',            () => expect(buildFittingsItemCode(ftg({ fitting_type: 'End Cap'            }))).toBe('RM-FTG-CAP-A234-WPB-50NB-SCH40-BW'));
  it('Stub End',           () => expect(buildFittingsItemCode(ftg({ fitting_type: 'Stub End'           }))).toBe('RM-FTG-STUB-A234-WPB-50NB-SCH40-BW'));
  it('Swage Nipple',       () => expect(buildFittingsItemCode(ftg({ fitting_type: 'Swage Nipple',       reducing_bore: '25NB' }))).toBe('RM-FTG-SWAG-A234-WPB-50NBX25NB-SCH40-BW'));
  it('Coupling (BW)',      () => expect(buildFittingsItemCode(ftg({ fitting_type: 'Coupling'           }))).toBe('RM-FTG-CPLG-A234-WPB-50NB-SCH40-BW'));
  it('Half Coupling (BW)', () => expect(buildFittingsItemCode(ftg({ fitting_type: 'Half Coupling'      }))).toBe('RM-FTG-HCPL-A234-WPB-50NB-SCH40-BW'));
  it('Union (BW)',         () => expect(buildFittingsItemCode(ftg({ fitting_type: 'Union'              }))).toBe('RM-FTG-UNI-A234-WPB-50NB-SCH40-BW'));
  it('Boss (BW)',          () => expect(buildFittingsItemCode(ftg({ fitting_type: 'Boss'               }))).toBe('RM-FTG-BOSS-A234-WPB-50NB-SCH40-BW'));
  it('Barrel Nipple',      () => expect(buildFittingsItemCode(ftg({ fitting_type: 'Barrel Nipple', end_type: 'Screwed NPT', length_mm: '100' }))).toBe('RM-FTG-BNIP-A234-WPB-50NB-100MM-SCH40-NPT'));
  it('Pipe Nipple',        () => expect(buildFittingsItemCode(ftg({ fitting_type: 'Pipe Nipple',   end_type: 'Screwed NPT', length_mm: '100' }))).toBe('RM-FTG-PNIP-A234-WPB-50NB-100MM-SCH40-NPT'));
});

// ── Suite 2: All 16 material grade codes ─────────────────────────────────────
describe('buildFittingsItemCode — all 16 grade codes', () => {
  it('A 105',            () => expect(buildFittingsItemCode(ftg({ material_grade: 'A 105'            }))).toContain('-A105-'));
  it('A 182 F304',       () => expect(buildFittingsItemCode(ftg({ material_grade: 'A 182 F304'       }))).toContain('-A182-F304-'));
  it('A 182 F316',       () => expect(buildFittingsItemCode(ftg({ material_grade: 'A 182 F316'       }))).toContain('-A182-F316-'));
  it('A234 WPB',         () => expect(buildFittingsItemCode(ftg({ material_grade: 'A234 WPB'         }))).toContain('-A234-WPB-'));
  it('A234 WPC',         () => expect(buildFittingsItemCode(ftg({ material_grade: 'A234 WPC'         }))).toContain('-A234-WPC-'));
  it('A234 WP11',        () => expect(buildFittingsItemCode(ftg({ material_grade: 'A234 WP11'        }))).toContain('-A234-WP11-'));
  it('A234 WP22',        () => expect(buildFittingsItemCode(ftg({ material_grade: 'A234 WP22'        }))).toContain('-A234-WP22-'));
  it('A403 WP304',       () => expect(buildFittingsItemCode(ftg({ material_grade: 'A403 WP304'       }))).toContain('-A403-304-'));
  it('A403 WP304L',      () => expect(buildFittingsItemCode(ftg({ material_grade: 'A403 WP304L'      }))).toContain('-A403-304L-'));
  it('A403 WP316',       () => expect(buildFittingsItemCode(ftg({ material_grade: 'A403 WP316'       }))).toContain('-A403-316-'));
  it('A403 WP316L',      () => expect(buildFittingsItemCode(ftg({ material_grade: 'A403 WP316L'      }))).toContain('-A403-316L-'));
  it('A403 WP321',       () => expect(buildFittingsItemCode(ftg({ material_grade: 'A403 WP321'       }))).toContain('-A403-321-'));
  it('A403 WP347',       () => expect(buildFittingsItemCode(ftg({ material_grade: 'A403 WP347'       }))).toContain('-A403-347-'));
  it('A860 WPHY 60',     () => expect(buildFittingsItemCode(ftg({ material_grade: 'A860 WPHY 60'     }))).toContain('-A860-60-'));
  it('Duplex F51',       () => expect(buildFittingsItemCode(ftg({ material_grade: 'Duplex F51'       }))).toContain('-F51-'));
  it('Super Duplex F53', () => expect(buildFittingsItemCode(ftg({ material_grade: 'Super Duplex F53' }))).toContain('-F53-'));
});

// ── Suite 3: All 13 schedule codes ───────────────────────────────────────────
describe('buildFittingsItemCode — all 13 schedule codes', () => {
  it('SCH 5',   () => expect(buildFittingsItemCode(ftg({ schedule: 'SCH 5'   }))).toContain('-SCH5-'));
  it('SCH 5S',  () => expect(buildFittingsItemCode(ftg({ schedule: 'SCH 5S'  }))).toContain('-SCH5S-'));
  it('SCH 10',  () => expect(buildFittingsItemCode(ftg({ schedule: 'SCH 10'  }))).toContain('-SCH10-'));
  it('SCH 10S', () => expect(buildFittingsItemCode(ftg({ schedule: 'SCH 10S' }))).toContain('-SCH10S-'));
  it('SCH 20',  () => expect(buildFittingsItemCode(ftg({ schedule: 'SCH 20'  }))).toContain('-SCH20-'));
  it('SCH 40',  () => expect(buildFittingsItemCode(ftg({ schedule: 'SCH 40'  }))).toContain('-SCH40-'));
  it('SCH 40S', () => expect(buildFittingsItemCode(ftg({ schedule: 'SCH 40S' }))).toContain('-SCH40S-'));
  it('SCH 80',  () => expect(buildFittingsItemCode(ftg({ schedule: 'SCH 80'  }))).toContain('-SCH80-'));
  it('SCH 80S', () => expect(buildFittingsItemCode(ftg({ schedule: 'SCH 80S' }))).toContain('-SCH80S-'));
  it('SCH 160', () => expect(buildFittingsItemCode(ftg({ schedule: 'SCH 160' }))).toContain('-SCH160-'));
  it('XXS',     () => expect(buildFittingsItemCode(ftg({ schedule: 'XXS'     }))).toContain('-XXS-'));
  it('STD',     () => expect(buildFittingsItemCode(ftg({ schedule: 'STD'     }))).toContain('-STD-'));
  it('XS',      () => expect(buildFittingsItemCode(ftg({ schedule: 'XS'      }))).toContain('-XS-'));
});

// ── Suite 4: All 4 end type codes ────────────────────────────────────────────
describe('buildFittingsItemCode — all 4 end type codes', () => {
  it('BW',              () => expect(buildFittingsItemCode(ftg({ end_type: 'Butt Weld (BW)'  }))).toBe('RM-FTG-E90-1.5D-A234-WPB-50NB-SCH40-BW'));
  it('SW (non-PC type)',() => expect(buildFittingsItemCode(ftg({ end_type: 'Socket Weld (SW)' }))).toBe('RM-FTG-E90-1.5D-A234-WPB-50NB-SCH40-SW'));
  it('NPT (non-PC type)',()=> expect(buildFittingsItemCode(ftg({ end_type: 'Screwed NPT'      }))).toBe('RM-FTG-E90-1.5D-A234-WPB-50NB-SCH40-NPT'));
  it('BSP (non-PC type)',()=> expect(buildFittingsItemCode(ftg({ end_type: 'Screwed BSP'      }))).toBe('RM-FTG-E90-1.5D-A234-WPB-50NB-SCH40-BSP'));
});

// ── Suite 5: Pressure Class logic — Coupling/Half Coupling/Union/Boss ─────────
describe('buildFittingsItemCode — pressure class logic', () => {
  // SW end → pressure class used, schedule ignored
  it('Coupling + SW → 3000LB in code (not schedule)', () => {
    const code = buildFittingsItemCode(cplg());
    expect(code).toBe('RM-FTG-CPLG-A105-25NB-3000LB-SW');
    expect(code).not.toContain('SCH');
  });

  it('Coupling + SW → 6000LB', () =>
    expect(buildFittingsItemCode(cplg({ pressure_class: '6000LB' }))).toBe('RM-FTG-CPLG-A105-25NB-6000LB-SW'));

  it('Coupling + SW → 9000LB', () =>
    expect(buildFittingsItemCode(cplg({ pressure_class: '9000LB' }))).toBe('RM-FTG-CPLG-A105-25NB-9000LB-SW'));

  it('Coupling + NPT → pressure class used', () =>
    expect(buildFittingsItemCode(cplg({ end_type: 'Screwed NPT', pressure_class: '3000LB' }))).toBe('RM-FTG-CPLG-A105-25NB-3000LB-NPT'));

  it('Coupling + BSP → pressure class used', () =>
    expect(buildFittingsItemCode(cplg({ end_type: 'Screwed BSP', pressure_class: '6000LB' }))).toBe('RM-FTG-CPLG-A105-25NB-6000LB-BSP'));

  it('Coupling + BW → schedule used, not pressure class', () =>
    expect(buildFittingsItemCode(ftg({ fitting_type: 'Coupling', schedule: 'SCH 40' }))).toBe('RM-FTG-CPLG-A234-WPB-50NB-SCH40-BW'));

  it('Half Coupling + SW → pressure class', () =>
    expect(buildFittingsItemCode(cplg({ fitting_type: 'Half Coupling', pressure_class: '3000LB' }))).toBe('RM-FTG-HCPL-A105-25NB-3000LB-SW'));

  it('Half Coupling + BW → schedule', () =>
    expect(buildFittingsItemCode(ftg({ fitting_type: 'Half Coupling' }))).toBe('RM-FTG-HCPL-A234-WPB-50NB-SCH40-BW'));

  it('Union + SW → pressure class', () =>
    expect(buildFittingsItemCode(cplg({ fitting_type: 'Union', pressure_class: '3000LB' }))).toBe('RM-FTG-UNI-A105-25NB-3000LB-SW'));

  it('Union + NPT → pressure class', () =>
    expect(buildFittingsItemCode(cplg({ fitting_type: 'Union', end_type: 'Screwed NPT', pressure_class: '6000LB' }))).toBe('RM-FTG-UNI-A105-25NB-6000LB-NPT'));

  it('Boss + SW → pressure class', () =>
    expect(buildFittingsItemCode(cplg({ fitting_type: 'Boss', pressure_class: '3000LB' }))).toBe('RM-FTG-BOSS-A105-25NB-3000LB-SW'));

  it('Boss + NPT → pressure class', () =>
    expect(buildFittingsItemCode(cplg({ fitting_type: 'Boss', end_type: 'Screwed NPT', pressure_class: '6000LB' }))).toBe('RM-FTG-BOSS-A105-25NB-6000LB-NPT'));

  // Non-PC types ignore pressure_class and always use schedule
  it('Elbow + SW → schedule (not pressure class), pressure_class field ignored', () => {
    const code = buildFittingsItemCode(ftg({ end_type: 'Socket Weld (SW)', pressure_class: '3000LB' }));
    expect(code).toContain('-SCH40-');
    expect(code).not.toContain('3000LB');
  });
});

// ── Suite 6: Reducing bore logic ──────────────────────────────────────────────
describe('buildFittingsItemCode — reducing bore', () => {
  it('Concentric Reducer encodes NBxRNB', () =>
    expect(buildFittingsItemCode(ftg({ fitting_type: 'Concentric Reducer', reducing_bore: '25NB' }))).toBe('RM-FTG-REDC-A234-WPB-50NBX25NB-SCH40-BW'));

  it('Eccentric Reducer encodes NBxRNB', () =>
    expect(buildFittingsItemCode(ftg({ fitting_type: 'Eccentric Reducer', reducing_bore: '40NB' }))).toBe('RM-FTG-REDE-A234-WPB-50NBX40NB-SCH40-BW'));

  it('Reducing Tee encodes NBxRNB (branch)', () =>
    expect(buildFittingsItemCode(ftg({ fitting_type: 'Reducing Tee', reducing_bore: '32NB' }))).toBe('RM-FTG-TEER-A234-WPB-50NBX32NB-SCH40-BW'));

  it('Swage Nipple encodes NBxRNB', () =>
    expect(buildFittingsItemCode(ftg({ fitting_type: 'Swage Nipple', reducing_bore: '25NB' }))).toBe('RM-FTG-SWAG-A234-WPB-50NBX25NB-SCH40-BW'));

  it('Concentric Reducer — missing reducing_bore throws', () =>
    expect(() => buildFittingsItemCode(ftg({ fitting_type: 'Concentric Reducer' }))).toThrow('Reducing Bore'));

  it('Eccentric Reducer — missing reducing_bore throws', () =>
    expect(() => buildFittingsItemCode(ftg({ fitting_type: 'Eccentric Reducer' }))).toThrow('Reducing Bore'));

  it('Reducing Tee — missing reducing_bore throws', () =>
    expect(() => buildFittingsItemCode(ftg({ fitting_type: 'Reducing Tee' }))).toThrow('Reducing Bore'));

  it('Swage Nipple — missing reducing_bore throws', () =>
    expect(() => buildFittingsItemCode(ftg({ fitting_type: 'Swage Nipple' }))).toThrow('Reducing Bore'));

  it('Equal Tee — reducing_bore present is ignored (non-reducing type)', () => {
    const code = buildFittingsItemCode(ftg({ fitting_type: 'Equal Tee', reducing_bore: '25NB' }));
    expect(code).toBe('RM-FTG-TEE-A234-WPB-50NB-SCH40-BW');
    expect(code).not.toContain('X25NB');
  });
});

// ── Suite 7: Spec fields excluded ─────────────────────────────────────────────
describe('buildFittingsItemCode — spec fields excluded from code', () => {
  it('fitting_standard does not affect code', () => {
    const a = buildFittingsItemCode(ftg({ fitting_standard: 'ASME B16.9'   }));
    const b = buildFittingsItemCode(ftg({ fitting_standard: 'MSS SP-43'    }));
    expect(a).toBe(b);
  });

  it('mtr_required does not affect code', () => {
    const a = buildFittingsItemCode(ftg({ mtr_required: 'Yes' }));
    const b = buildFittingsItemCode(ftg({ mtr_required: 'No'  }));
    expect(a).toBe(b);
  });

  it('elbow_radius does not affect code', () => {
    const a = buildFittingsItemCode(ftg({ elbow_radius: 'Long Radius (LR)'  }));
    const b = buildFittingsItemCode(ftg({ elbow_radius: 'Short Radius (SR)' }));
    expect(a).toBe(b);
  });
});

// ── Suite 8: Required field validation ───────────────────────────────────────
describe('buildFittingsItemCode — required field errors', () => {
  it('throws when fitting_type is blank', () =>
    expect(() => buildFittingsItemCode(ftg({ fitting_type: '' }))).toThrow('Cannot generate Fitting SAP Item Code'));

  it('throws when fitting_type is unrecognised', () =>
    expect(() => buildFittingsItemCode(ftg({ fitting_type: 'Y-Strainer' }))).toThrow('Y-Strainer'));

  it('throws when material_grade is blank', () =>
    expect(() => buildFittingsItemCode(ftg({ material_grade: '' }))).toThrow('Cannot generate Fitting SAP Item Code'));

  it('throws when material_grade is unrecognised', () =>
    expect(() => buildFittingsItemCode(ftg({ material_grade: 'A216 WCB' }))).toThrow('A216 WCB'));

  it('throws when nominal_bore is blank', () =>
    expect(() => buildFittingsItemCode(ftg({ nominal_bore: '' }))).toThrow('Cannot generate Fitting SAP Item Code'));

  it('throws when schedule is blank (BW fitting)', () =>
    expect(() => buildFittingsItemCode(ftg({ schedule: '' }))).toThrow('Cannot generate Fitting SAP Item Code'));

  it('throws when schedule is unrecognised (BW fitting)', () =>
    expect(() => buildFittingsItemCode(ftg({ schedule: 'SCH 120' }))).toThrow('SCH 120'));

  it('throws when end_type is blank', () =>
    expect(() => buildFittingsItemCode(ftg({ end_type: '' }))).toThrow('Cannot generate Fitting SAP Item Code'));

  it('throws when end_type is unrecognised', () =>
    expect(() => buildFittingsItemCode(ftg({ end_type: 'Flanged' }))).toThrow('Flanged'));

  it('throws when pressure_class is blank for Coupling + SW', () =>
    expect(() => buildFittingsItemCode(cplg({ pressure_class: '' }))).toThrow('Pressure Class'));

  it('throws when pressure_class is blank for Union + NPT', () =>
    expect(() => buildFittingsItemCode(cplg({ fitting_type: 'Union', end_type: 'Screwed NPT', pressure_class: '' }))).toThrow('Pressure Class'));

  it('collects multiple missing fields in one error', () =>
    expect(() => buildFittingsItemCode({ fitting_type: '', material_grade: '', nominal_bore: '', schedule: '', end_type: '' }))
      .toThrow('Cannot generate Fitting SAP Item Code'));
});

// ── Suite 8b: Nipple length ──────────────────────────────────────────────────
describe('buildFittingsItemCode — nipple length mandatory', () => {
  function bnip(overrides: Record<string, unknown> = {}) {
    return ftg({ fitting_type: 'Barrel Nipple', end_type: 'Screwed NPT', length_mm: '100', ...overrides });
  }
  function pnip(overrides: Record<string, unknown> = {}) {
    return ftg({ fitting_type: 'Pipe Nipple', end_type: 'Screwed NPT', length_mm: '100', ...overrides });
  }

  // Different lengths produce distinct codes — core procurement identity
  it('Barrel Nipple 40NB × 50 mm',  () =>
    expect(buildFittingsItemCode(bnip({ nominal_bore: '40NB', length_mm: '50'  }))).toBe('RM-FTG-BNIP-A234-WPB-40NB-50MM-SCH40-NPT'));
  it('Barrel Nipple 40NB × 100 mm', () =>
    expect(buildFittingsItemCode(bnip({ nominal_bore: '40NB', length_mm: '100' }))).toBe('RM-FTG-BNIP-A234-WPB-40NB-100MM-SCH40-NPT'));
  it('Barrel Nipple 40NB × 150 mm', () =>
    expect(buildFittingsItemCode(bnip({ nominal_bore: '40NB', length_mm: '150' }))).toBe('RM-FTG-BNIP-A234-WPB-40NB-150MM-SCH40-NPT'));

  it('Pipe Nipple 25NB × 75 mm',    () =>
    expect(buildFittingsItemCode(pnip({ nominal_bore: '25NB', length_mm: '75'  }))).toBe('RM-FTG-PNIP-A234-WPB-25NB-75MM-SCH40-NPT'));
  it('Pipe Nipple 25NB × 200 mm',   () =>
    expect(buildFittingsItemCode(pnip({ nominal_bore: '25NB', length_mm: '200' }))).toBe('RM-FTG-PNIP-A234-WPB-25NB-200MM-SCH40-NPT'));

  // Custom mm value (user types "300mm" — trailing suffix stripped)
  it('Barrel Nipple custom length "300mm" normalised to 300MM', () =>
    expect(buildFittingsItemCode(bnip({ length_mm: '300mm' }))).toBe('RM-FTG-BNIP-A234-WPB-50NB-300MM-SCH40-NPT'));
  it('Barrel Nipple custom length "300MM" normalised to 300MM', () =>
    expect(buildFittingsItemCode(bnip({ length_mm: '300MM' }))).toBe('RM-FTG-BNIP-A234-WPB-50NB-300MM-SCH40-NPT'));

  // Missing length must throw
  it('Barrel Nipple missing length throws', () =>
    expect(() => buildFittingsItemCode(ftg({ fitting_type: 'Barrel Nipple', end_type: 'Screwed NPT' })))
      .toThrow('Length (mm)'));
  it('Pipe Nipple missing length throws', () =>
    expect(() => buildFittingsItemCode(ftg({ fitting_type: 'Pipe Nipple', end_type: 'Screwed NPT' })))
      .toThrow('Length (mm)'));

  // Non-nipple types must NOT include a length segment even if length_mm is present
  it('Equal Tee ignores length_mm', () =>
    expect(buildFittingsItemCode(ftg({ length_mm: '100' }))).toBe('RM-FTG-E90-1.5D-A234-WPB-50NB-SCH40-BW'));
});

// ── Suite 9: User examples and worst-case length ──────────────────────────────
describe('buildFittingsItemCode — examples and length', () => {
  it('90° 1.5D Elbow · A234 WPB · 50NB · SCH 40 · BW', () =>
    expect(buildFittingsItemCode(ftg())).toBe('RM-FTG-E90-1.5D-A234-WPB-50NB-SCH40-BW'));

  it('Equal Tee · A403 WP316L · 25NB · SCH 10S · SW', () =>
    expect(buildFittingsItemCode(ftg({ fitting_type: 'Equal Tee', material_grade: 'A403 WP316L', nominal_bore: '25NB', schedule: 'SCH 10S', end_type: 'Socket Weld (SW)' })))
      .toBe('RM-FTG-TEE-A403-316L-25NB-SCH10S-SW'));

  it('Concentric Reducer · A234 WPB · 50NBx25NB · SCH 40 · BW', () =>
    expect(buildFittingsItemCode(ftg({ fitting_type: 'Concentric Reducer', reducing_bore: '25NB' })))
      .toBe('RM-FTG-REDC-A234-WPB-50NBX25NB-SCH40-BW'));

  it('Coupling · A105 · 25NB · SW · 3000LB', () =>
    expect(buildFittingsItemCode(cplg())).toBe('RM-FTG-CPLG-A105-25NB-3000LB-SW'));

  it('Half Coupling · A105 · 20NB · NPT · 3000LB', () =>
    expect(buildFittingsItemCode(cplg({ fitting_type: 'Half Coupling', nominal_bore: '20NB', end_type: 'Screwed NPT' })))
      .toBe('RM-FTG-HCPL-A105-20NB-3000LB-NPT'));

  it('worst case: REDC A182-F304 1200NBX600NB SCH160 BW = 46 chars ≤ 50', () => {
    const code = buildFittingsItemCode(ftg({
      fitting_type:   'Concentric Reducer',
      material_grade: 'A 182 F304',
      nominal_bore:   '1200NB',
      reducing_bore:  '600NB',
      schedule:       'SCH 160',
    }));
    expect(code).toBe('RM-FTG-REDC-A182-F304-1200NBX600NB-SCH160-BW');
    expect(code.length).toBeLessThanOrEqual(50);
  });
});
