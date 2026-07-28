/**
 * tests/pipes-builder.test.ts
 * Unit tests for buildPipesItemCode
 *
 * Skeleton : RM-PIP-{GRADE}-{NB}-{SCH}
 *
 * Procurement identity : Material Grade · Nominal Bore · Schedule
 * Engineering spec (NOT in code) : End Condition · Length · Standard ·
 *                                   MTR · Surface Finish · Testing
 */

import { describe, it, expect } from 'vitest';
import { buildPipesItemCode } from '../server/buy-catalog-sap-service';

// ── helper ────────────────────────────────────────────────────────────────────
function pipe(overrides: Record<string, unknown> = {}) {
  return {
    material_grade: 'IS 1239 Class B',
    nominal_bore:   '50NB',
    schedule:       'SCH 40',
    // spec-only fields — must never affect the code
    end_condition:  'Bevelled End (BE)',
    length:         'Random (5–7m)',
    pipe_standard:  'IS 1239',
    mtr_required:   'Yes',
    surface_condition: 'Black (As-rolled)',
    additional_testing: 'Hydrotest',
    ...overrides,
  };
}

// ── Suite 1: All 17 grades ────────────────────────────────────────────────────
describe('buildPipesItemCode — all grades', () => {
  it('IS 1239 Class A', () =>
    expect(buildPipesItemCode(pipe({ material_grade: 'IS 1239 Class A' }))).toBe('RM-PIP-IS1239A-50NB-SCH40'));

  it('IS 1239 Class B (base)', () =>
    expect(buildPipesItemCode(pipe())).toBe('RM-PIP-IS1239B-50NB-SCH40'));

  it('IS 1239 Class C', () =>
    expect(buildPipesItemCode(pipe({ material_grade: 'IS 1239 Class C' }))).toBe('RM-PIP-IS1239C-50NB-SCH40'));

  it('IS 3589 Fe 330', () =>
    expect(buildPipesItemCode(pipe({ material_grade: 'IS 3589 Fe 330' }))).toBe('RM-PIP-IS3589-330-50NB-SCH40'));

  it('IS 3589 Fe 410', () =>
    expect(buildPipesItemCode(pipe({ material_grade: 'IS 3589 Fe 410' }))).toBe('RM-PIP-IS3589-410-50NB-SCH40'));

  it('SA-106 Gr B', () =>
    expect(buildPipesItemCode(pipe({ material_grade: 'SA-106 Gr B' }))).toBe('RM-PIP-SA106B-50NB-SCH40'));

  it('SA-53 Gr B', () =>
    expect(buildPipesItemCode(pipe({ material_grade: 'SA-53 Gr B' }))).toBe('RM-PIP-SA53B-50NB-SCH40'));

  it('SS304 Pipe', () =>
    expect(buildPipesItemCode(pipe({ material_grade: 'SS304 Pipe' }))).toBe('RM-PIP-SS304-50NB-SCH40'));

  it('SS304L Pipe', () =>
    expect(buildPipesItemCode(pipe({ material_grade: 'SS304L Pipe' }))).toBe('RM-PIP-SS304L-50NB-SCH40'));

  it('SS316 Pipe', () =>
    expect(buildPipesItemCode(pipe({ material_grade: 'SS316 Pipe' }))).toBe('RM-PIP-SS316-50NB-SCH40'));

  it('SS316L Pipe', () =>
    expect(buildPipesItemCode(pipe({ material_grade: 'SS316L Pipe' }))).toBe('RM-PIP-SS316L-50NB-SCH40'));

  it('SA-312 TP304', () =>
    expect(buildPipesItemCode(pipe({ material_grade: 'SA-312 TP304' }))).toBe('RM-PIP-SA312-304-50NB-SCH40'));

  it('SA-312 TP304L', () =>
    expect(buildPipesItemCode(pipe({ material_grade: 'SA-312 TP304L' }))).toBe('RM-PIP-SA312-304L-50NB-SCH40'));

  it('SA-312 TP316', () =>
    expect(buildPipesItemCode(pipe({ material_grade: 'SA-312 TP316' }))).toBe('RM-PIP-SA312-316-50NB-SCH40'));

  it('SA-312 TP316L', () =>
    expect(buildPipesItemCode(pipe({ material_grade: 'SA-312 TP316L' }))).toBe('RM-PIP-SA312-316L-50NB-SCH40'));

  it('Copper Pipe', () =>
    expect(buildPipesItemCode(pipe({ material_grade: 'Copper Pipe' }))).toBe('RM-PIP-CU-50NB-SCH40'));

  it('Aluminium Pipe', () =>
    expect(buildPipesItemCode(pipe({ material_grade: 'Aluminium Pipe' }))).toBe('RM-PIP-AL-50NB-SCH40'));
});

// ── Suite 2: All 13 schedule codes ───────────────────────────────────────────
describe('buildPipesItemCode — all schedules', () => {
  it('SCH 5',   () => expect(buildPipesItemCode(pipe({ schedule: 'SCH 5'   }))).toBe('RM-PIP-IS1239B-50NB-SCH5'));
  it('SCH 5S',  () => expect(buildPipesItemCode(pipe({ schedule: 'SCH 5S'  }))).toBe('RM-PIP-IS1239B-50NB-SCH5S'));
  it('SCH 10',  () => expect(buildPipesItemCode(pipe({ schedule: 'SCH 10'  }))).toBe('RM-PIP-IS1239B-50NB-SCH10'));
  it('SCH 10S', () => expect(buildPipesItemCode(pipe({ schedule: 'SCH 10S' }))).toBe('RM-PIP-IS1239B-50NB-SCH10S'));
  it('SCH 20',  () => expect(buildPipesItemCode(pipe({ schedule: 'SCH 20'  }))).toBe('RM-PIP-IS1239B-50NB-SCH20'));
  it('SCH 40',  () => expect(buildPipesItemCode(pipe({ schedule: 'SCH 40'  }))).toBe('RM-PIP-IS1239B-50NB-SCH40'));
  it('SCH 40S', () => expect(buildPipesItemCode(pipe({ schedule: 'SCH 40S' }))).toBe('RM-PIP-IS1239B-50NB-SCH40S'));
  it('SCH 80',  () => expect(buildPipesItemCode(pipe({ schedule: 'SCH 80'  }))).toBe('RM-PIP-IS1239B-50NB-SCH80'));
  it('SCH 80S', () => expect(buildPipesItemCode(pipe({ schedule: 'SCH 80S' }))).toBe('RM-PIP-IS1239B-50NB-SCH80S'));
  it('SCH 160', () => expect(buildPipesItemCode(pipe({ schedule: 'SCH 160' }))).toBe('RM-PIP-IS1239B-50NB-SCH160'));
  it('XXS',     () => expect(buildPipesItemCode(pipe({ schedule: 'XXS'     }))).toBe('RM-PIP-IS1239B-50NB-XXS'));
  it('STD',     () => expect(buildPipesItemCode(pipe({ schedule: 'STD'     }))).toBe('RM-PIP-IS1239B-50NB-STD'));
  it('XS',      () => expect(buildPipesItemCode(pipe({ schedule: 'XS'      }))).toBe('RM-PIP-IS1239B-50NB-XS'));
});

// ── Suite 3: Engineering spec fields excluded ─────────────────────────────────
describe('buildPipesItemCode — spec fields excluded from code', () => {
  it('end_condition present but absent from code', () => {
    const a = buildPipesItemCode(pipe({ end_condition: 'Plain End (PE)' }));
    const b = buildPipesItemCode(pipe({ end_condition: 'Bevelled End (BE)' }));
    const c = buildPipesItemCode(pipe({ end_condition: 'Threaded & Coupled (T&C)' }));
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a).toBe('RM-PIP-IS1239B-50NB-SCH40');
  });

  it('length present but absent from code', () => {
    const a = buildPipesItemCode(pipe({ length: 'Fixed 6m' }));
    const b = buildPipesItemCode(pipe({ length: 'Fixed 12m' }));
    expect(a).toBe(b);
  });

  it('pipe_standard present but absent from code', () => {
    const a = buildPipesItemCode(pipe({ pipe_standard: 'IS 1239' }));
    const b = buildPipesItemCode(pipe({ pipe_standard: 'ASME Sec. II Part A' }));
    expect(a).toBe(b);
  });

  it('mtr_required present but absent from code', () => {
    const a = buildPipesItemCode(pipe({ mtr_required: 'Yes' }));
    const b = buildPipesItemCode(pipe({ mtr_required: 'No' }));
    expect(a).toBe(b);
  });

  it('surface_condition present but absent from code', () => {
    const a = buildPipesItemCode(pipe({ surface_condition: 'Black (As-rolled)' }));
    const b = buildPipesItemCode(pipe({ surface_condition: 'Hot-Dip Galvanized' }));
    expect(a).toBe(b);
  });
});

// ── Suite 4: Various NB sizes ─────────────────────────────────────────────────
describe('buildPipesItemCode — NB sizes', () => {
  it('15NB',   () => expect(buildPipesItemCode(pipe({ nominal_bore: '15NB'   }))).toBe('RM-PIP-IS1239B-15NB-SCH40'));
  it('100NB',  () => expect(buildPipesItemCode(pipe({ nominal_bore: '100NB'  }))).toBe('RM-PIP-IS1239B-100NB-SCH40'));
  it('300NB',  () => expect(buildPipesItemCode(pipe({ nominal_bore: '300NB'  }))).toBe('RM-PIP-IS1239B-300NB-SCH40'));
  it('1200NB', () => expect(buildPipesItemCode(pipe({ nominal_bore: '1200NB' }))).toBe('RM-PIP-IS1239B-1200NB-SCH40'));
});

// ── Suite 5: Required field validation ───────────────────────────────────────
describe('buildPipesItemCode — required field errors', () => {
  it('throws when material_grade is blank', () =>
    expect(() => buildPipesItemCode(pipe({ material_grade: '' }))).toThrow('Cannot generate Pipe SAP Item Code'));

  it('throws when material_grade is unrecognised', () =>
    expect(() => buildPipesItemCode(pipe({ material_grade: 'Carbon Steel Pipe' }))).toThrow('Cannot generate Pipe SAP Item Code'));

  it('error message names the unrecognised grade', () =>
    expect(() => buildPipesItemCode(pipe({ material_grade: 'Carbon Steel Pipe' }))).toThrow('Carbon Steel Pipe'));

  it('throws when nominal_bore is blank', () =>
    expect(() => buildPipesItemCode(pipe({ nominal_bore: '' }))).toThrow('Cannot generate Pipe SAP Item Code'));

  it('throws when schedule is blank', () =>
    expect(() => buildPipesItemCode(pipe({ schedule: '' }))).toThrow('Cannot generate Pipe SAP Item Code'));

  it('throws when schedule is unrecognised', () =>
    expect(() => buildPipesItemCode(pipe({ schedule: 'SCH 120' }))).toThrow('Cannot generate Pipe SAP Item Code'));

  it('error message names the unrecognised schedule', () =>
    expect(() => buildPipesItemCode(pipe({ schedule: 'SCH 120' }))).toThrow('SCH 120'));

  it('collects multiple missing fields in one error', () =>
    expect(() => buildPipesItemCode({ ...pipe(), material_grade: '', schedule: '' })).toThrow('Cannot generate Pipe SAP Item Code'));
});

// ── Suite 6: User examples and worst-case length ──────────────────────────────
describe('buildPipesItemCode — examples and length', () => {
  it('IS 1239 Class B · 50NB · SCH 40', () =>
    expect(buildPipesItemCode(pipe())).toBe('RM-PIP-IS1239B-50NB-SCH40'));

  it('SA-106 Gr B · 100NB · SCH 80', () =>
    expect(buildPipesItemCode(pipe({ material_grade: 'SA-106 Gr B', nominal_bore: '100NB', schedule: 'SCH 80' }))).toBe('RM-PIP-SA106B-100NB-SCH80'));

  it('SS316L Pipe · 25NB · SCH 10S', () =>
    expect(buildPipesItemCode(pipe({ material_grade: 'SS316L Pipe', nominal_bore: '25NB', schedule: 'SCH 10S' }))).toBe('RM-PIP-SS316L-25NB-SCH10S'));

  it('SA-312 TP316L · 50NB · SCH 40S', () =>
    expect(buildPipesItemCode(pipe({ material_grade: 'SA-312 TP316L', nominal_bore: '50NB', schedule: 'SCH 40S' }))).toBe('RM-PIP-SA312-316L-50NB-SCH40S'));

  it('IS 3589 Fe 410 · 200NB · XS', () =>
    expect(buildPipesItemCode(pipe({ material_grade: 'IS 3589 Fe 410', nominal_bore: '200NB', schedule: 'XS' }))).toBe('RM-PIP-IS3589-410-200NB-XS'));

  it('worst-case: SA312-316L · 1200NB · SCH160 = 32 chars ≤ 50', () => {
    const code = buildPipesItemCode(pipe({
      material_grade: 'SA-312 TP316L',
      nominal_bore:   '1200NB',
      schedule:       'SCH 160',
    }));
    expect(code).toBe('RM-PIP-SA312-316L-1200NB-SCH160');
    expect(code.length).toBe(31);
    expect(code.length).toBeLessThanOrEqual(50);
  });
});
