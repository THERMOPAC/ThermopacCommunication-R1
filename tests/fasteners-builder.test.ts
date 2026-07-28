/**
 * tests/fasteners-builder.test.ts
 * Unit tests for buildFastenersItemCode
 *
 * Procurement identity skeletons:
 *   Stud Bolts (FT/2ET) : RM-FST-{TYPE}-{MATL}-{DIA}-{LEN}MM-{THREAD}-{COAT}
 *   Stud Set            : RM-FST-STDS-{BMATL}-{NMATL}-{WMATL}-{DIA}-{LEN}MM-{THREAD}-{COAT}
 *   Hex Bolt (inch)     : RM-FST-HXBT-{MATL}-{DIA}-{LEN}MM-{THREAD}-{COAT}
 *   Hex Bolt (metric,FT): RM-FST-HXBT-FT-{MATL}-{DIA}-{LEN}MM-{THREAD}-{COAT}
 *   Hex Bolt (metric,PT): RM-FST-HXBT-PT-{MATL}-{DIA}-{LEN}MM-{THREAD}-{COAT}
 *   Anchor Bolt         : RM-FST-ANBT-{SUBTYPE}-{MATL}-{DIA}-{TOTLEN}MM-{THRDLEN}MM-{COAT}
 *   Eye Bolt            : RM-FST-EYBT-{SUBTYPE}-{MATL}-{DIA}-{SHANKLEN}MM-{COAT}
 *   U-Bolt              : RM-FST-UBLT-{MATL}-{RODDIA}-{NB}-{LEGLEN}MM-{COAT}
 *   Nuts                : RM-FST-{TYPE}-{MATL}-{DIA}-{THREAD}-{COAT}
 *   Washers             : RM-FST-{TYPE}-{MATL}-{DIA}-{COAT}
 */

import { describe, it, expect } from 'vitest';
import { buildFastenersItemCode } from '../server/buy-catalog-sap-service';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Stud bolt base */
function stud(overrides: Record<string, unknown> = {}) {
  return {
    fastener_type:      'Fully Threaded Stud',
    bolt_material:      'ASTM A193 B7',
    diameter:           'M20',
    length_mm:          '100',
    threading_standard: 'ISO Metric Coarse',
    coating:            'Plain (Uncoated)',
    ...overrides,
  };
}

/** Set base */
function set_(overrides: Record<string, unknown> = {}) {
  return {
    fastener_type:      'Stud + 2 Nut + 2 Washer Set',
    bolt_material:      'ASTM A193 B7',
    nut_material:       'ASTM A194 2H',
    washer_material:    'Carbon Steel (IS 2062)',
    diameter:           'M20',
    length_mm:          '100',
    threading_standard: 'ISO Metric Coarse',
    coating:            'Plain (Uncoated)',
    ...overrides,
  };
}

/** Hex bolt base (inch by default) */
function hex(overrides: Record<string, unknown> = {}) {
  return {
    fastener_type:      'Hex Bolt',
    bolt_material:      'A307',
    diameter:           '1/2"',
    length_mm:          '80',
    threading_standard: 'ASME B1.1 (UNC)',
    coating:            'Plain (Uncoated)',
    ...overrides,
  };
}

/** Anchor bolt base */
function anchor(overrides: Record<string, unknown> = {}) {
  return {
    fastener_type:   'Anchor Bolt',
    anchor_type:     'L-Bolt',
    bolt_material:   'A307',
    diameter:        'M20',
    overall_length:  '600',
    thread_length:   '100',
    coating:         'Hot-Dip Galvanized',
    ...overrides,
  };
}

/** Eye bolt base */
function eye(overrides: Record<string, unknown> = {}) {
  return {
    fastener_type: 'Eye Bolt',
    eye_bolt_type: 'Shoulder (Machinery)',
    bolt_material: 'ASTM A193 B7',
    diameter:      'M16',
    shank_length:  '80',
    coating:       'Plain (Uncoated)',
    ...overrides,
  };
}

/** U-bolt base */
function ubolt(overrides: Record<string, unknown> = {}) {
  return {
    fastener_type: 'U-Bolt',
    bolt_material: 'A307',
    rod_diameter:  'M12',
    pipe_size:     '50NB',
    leg_length:    '150',
    coating:       'Hot-Dip Galvanized',
    ...overrides,
  };
}

/** Hex nut base */
function nut(overrides: Record<string, unknown> = {}) {
  return {
    fastener_type:      'Hex Nut',
    nut_material:       'ASTM A194 2H',
    diameter:           'M20',
    threading_standard: 'ISO Metric Coarse',
    coating:            'Plain (Uncoated)',
    ...overrides,
  };
}

/** Flat washer base */
function washer(overrides: Record<string, unknown> = {}) {
  return {
    fastener_type:   'Flat Washer',
    washer_material: 'Carbon Steel (IS 2062)',
    diameter:        'M20',
    coating:         'Plain (Uncoated)',
    ...overrides,
  };
}

function build(attrs: Record<string, unknown>) { return buildFastenersItemCode(attrs); }
function err(attrs: Record<string, unknown>)   { return expect(() => build(attrs)).toThrow(); }
function errMsg(attrs: Record<string, unknown>, msg: string) {
  return expect(() => build(attrs)).toThrow(msg);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. STUD BOLTS
// ─────────────────────────────────────────────────────────────────────────────
describe('Stud Bolts', () => {
  it('Fully Threaded Stud — metric', () => {
    expect(build(stud())).toBe('RM-FST-STDBF-B7-M20-100MM-MC-PLN');
  });
  it('Double-End Stud — metric', () => {
    expect(build(stud({ fastener_type: 'Double-End Stud' }))).toBe('RM-FST-STDBT-B7-M20-100MM-MC-PLN');
  });
  it('Fully Threaded Stud — inch diameter', () => {
    expect(build(stud({ diameter: '3/4"', threading_standard: 'ASME B1.1 (UNC)' })))
      .toBe('RM-FST-STDBF-B7-34IN-100MM-UNC-PLN');
  });
  it('ISO Metric Fine threading', () => {
    expect(build(stud({ threading_standard: 'ISO Metric Fine' })))
      .toBe('RM-FST-STDBF-B7-M20-100MM-MF-PLN');
  });
  it('UNF threading with inch dia', () => {
    expect(build(stud({ diameter: '1"', threading_standard: 'ASME B1.1 (UNF)' })))
      .toBe('RM-FST-STDBF-B7-1IN-100MM-UNF-PLN');
  });
  it('HDG coating', () => {
    expect(build(stud({ coating: 'Hot-Dip Galvanized' }))).toBe('RM-FST-STDBF-B7-M20-100MM-MC-HDG');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ALL BOLT MATERIALS (stud bolt family)
// ─────────────────────────────────────────────────────────────────────────────
describe('Bolt material codes', () => {
  const cases: [string, string][] = [
    ['ASTM A193 B7',          'B7'],
    ['ASTM A193 B7M',         'B7M'],
    ['ASTM A193 B8 (SS304)',  'B8'],
    ['ASTM A193 B8 Class 2',  'B8C2'],
    ['ASTM A193 B8M (SS316)', 'B8M'],
    ['ASTM A193 B8M Class 2', 'B8MC2'],
    ['ASTM A193 B16',         'B16'],
    ['ASTM A320 L7',          'L7'],
    ['IS 1367 Cl.8.8',        'IS88'],
    ['IS 1367 Cl.10.9',       'IS109'],
    ['A307',                  'A307'],
    ['A325',                  'A325'],
    ['A490',                  'A490'],
  ];
  for (const [mat, code] of cases) {
    it(`${mat} → ${code}`, () => {
      expect(build(stud({ bolt_material: mat }))).toContain(`-${code}-`);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ALL METRIC DIAMETER CODES (stud bolt)
// ─────────────────────────────────────────────────────────────────────────────
describe('Metric diameter codes', () => {
  const cases: [string, string][] = [
    ['M8','M8'],['M10','M10'],['M12','M12'],['M14','M14'],
    ['M16','M16'],['M18','M18'],['M20','M20'],['M22','M22'],
    ['M24','M24'],['M27','M27'],['M30','M30'],['M36','M36'],
    ['M42','M42'],['M48','M48'],
  ];
  for (const [dia, code] of cases) {
    it(`${dia} → ${code}`, () => {
      expect(build(stud({ diameter: dia }))).toContain(`-${code}-`);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. ALL INCH DIAMETER CODES (stud bolt with UNC)
// ─────────────────────────────────────────────────────────────────────────────
describe('Inch diameter codes', () => {
  const cases: [string, string][] = [
    ['1/4"','14IN'],['3/8"','38IN'],['1/2"','12IN'],['5/8"','58IN'],
    ['3/4"','34IN'],['7/8"','78IN'],['1"','1IN'],
    ['1-1/4"','114IN'],['1-1/2"','112IN'],['1-3/4"','134IN'],['2"','2IN'],
  ];
  for (const [dia, code] of cases) {
    it(`${dia} → ${code}`, () => {
      expect(build(stud({ diameter: dia, threading_standard: 'ASME B1.1 (UNC)' }))).toContain(`-${code}-`);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. ALL COATING CODES
// ─────────────────────────────────────────────────────────────────────────────
describe('Coating codes', () => {
  const cases: [string, string][] = [
    ['Plain (Uncoated)',      'PLN'],
    ['Hot-Dip Galvanized',   'HDG'],
    ['Zinc Electroplated',   'ZEP'],
    ['Xylan / Fluoropolymer','XYL'],
    ['PTFE Coated',          'PTFE'],
    ['Black Oxide',          'BOX'],
  ];
  for (const [coat, code] of cases) {
    it(`${coat} → ${code}`, () => {
      expect(build(stud({ coating: coat }))).toMatch(new RegExp(`-${code}$`));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. STUD + 2 NUT + 2 WASHER SET
// ─────────────────────────────────────────────────────────────────────────────
describe('Stud + 2 Nut + 2 Washer Set', () => {
  it('basic set — metric', () => {
    expect(build(set_())).toBe('RM-FST-STDS-B7-2H-CS-M20-100MM-MC-PLN');
  });
  it('SS316 nut + SS316 washer', () => {
    expect(build(set_({ nut_material: 'ASTM A194 8M (SS316)', washer_material: 'SS 316' })))
      .toBe('RM-FST-STDS-B7-8M-SS316-M20-100MM-MC-PLN');
  });
  it('B8MC2 stud + 2HM nut + AS washer', () => {
    expect(build(set_({
      bolt_material: 'ASTM A193 B8M Class 2',
      nut_material:  'ASTM A194 2HM',
      washer_material: 'Alloy Steel',
      diameter: 'M48', length_mm: '200',
      threading_standard: 'ISO Metric Fine',
      coating: 'Hot-Dip Galvanized',
    }))).toBe('RM-FST-STDS-B8MC2-2HM-AS-M48-200MM-MF-HDG');
  });
  it('missing washer_material throws', () => {
    errMsg(set_({ washer_material: '' }), 'Washer Material');
  });
  it('missing nut_material throws', () => {
    errMsg(set_({ nut_material: '' }), 'Nut Material');
  });
  it('inch set with UNC', () => {
    expect(build(set_({ diameter: '3/4"', threading_standard: 'ASME B1.1 (UNC)' })))
      .toBe('RM-FST-STDS-B7-2H-CS-34IN-100MM-UNC-PLN');
  });
  it('worst-case length check — stays within 50 chars', () => {
    const code = build(set_({
      bolt_material: 'ASTM A193 B8M Class 2',
      nut_material: 'ASTM A194 8M (SS316)',
      washer_material: 'SS 316',
      diameter: 'M48', length_mm: '200',
      threading_standard: 'ISO Metric Fine',
      coating: 'Hot-Dip Galvanized',
    }));
    expect(code).toBe('RM-FST-STDS-B8MC2-8M-SS316-M48-200MM-MF-HDG');
    expect(code.length).toBeLessThanOrEqual(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. ALL NUT MATERIAL CODES
// ─────────────────────────────────────────────────────────────────────────────
describe('Nut material codes', () => {
  const cases: [string, string][] = [
    ['ASTM A194 2H',        '2H'],
    ['ASTM A194 2HM',       '2HM'],
    ['ASTM A194 8 (SS304)', '8'],
    ['ASTM A194 8M (SS316)','8M'],
    ['ASTM A194 4',         '4'],
    ['ASTM A194 7',         '7'],
    ['ASTM A194 7M',        '7M'],
    ['IS 1367 Cl.8',        'IS8'],
  ];
  for (const [mat, code] of cases) {
    it(`${mat} → ${code}`, () => {
      expect(build(nut({ nut_material: mat }))).toContain(`-${code}-`);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. ALL WASHER MATERIAL CODES
// ─────────────────────────────────────────────────────────────────────────────
describe('Washer material codes', () => {
  const cases: [string, string][] = [
    ['Carbon Steel (IS 2062)', 'CS'],
    ['SS 304',                 'SS304'],
    ['SS 316',                 'SS316'],
    ['Alloy Steel',            'AS'],
  ];
  for (const [mat, code] of cases) {
    it(`${mat} → ${code}`, () => {
      expect(build(washer({ washer_material: mat }))).toContain(`-${code}-`);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. HEX BOLT
// ─────────────────────────────────────────────────────────────────────────────
describe('Hex Bolt', () => {
  it('inch — no bolt_profile segment', () => {
    expect(build(hex())).toBe('RM-FST-HXBT-A307-12IN-80MM-UNC-PLN');
  });
  it('metric — Full Thread', () => {
    expect(build(hex({ diameter: 'M20', threading_standard: 'ISO Metric Coarse', bolt_profile: 'Full Thread' })))
      .toBe('RM-FST-HXBT-FT-A307-M20-80MM-MC-PLN');
  });
  it('metric — Partial Thread', () => {
    expect(build(hex({ diameter: 'M20', threading_standard: 'ISO Metric Coarse', bolt_profile: 'Partial Thread' })))
      .toBe('RM-FST-HXBT-PT-A307-M20-80MM-MC-PLN');
  });
  it('metric — missing bolt_profile throws', () => {
    errMsg(hex({ diameter: 'M20', threading_standard: 'ISO Metric Coarse', bolt_profile: '' }),
      'Bolt Profile');
  });
  it('inch — bolt_profile irrelevant (ignored)', () => {
    // bolt_profile is set but dia is inch — profile segment not emitted
    expect(build(hex({ bolt_profile: 'Full Thread' }))).toBe('RM-FST-HXBT-A307-12IN-80MM-UNC-PLN');
  });
  it('all inch diameter codes produce HXBT codes', () => {
    expect(build(hex({ diameter: '2"', bolt_material: 'A325' }))).toBe('RM-FST-HXBT-A325-2IN-80MM-UNC-PLN');
  });
  it('worst-case metric — within 50 chars', () => {
    const code = build(hex({
      bolt_material: 'ASTM A193 B8M Class 2',
      diameter: 'M48', threading_standard: 'ISO Metric Coarse',
      bolt_profile: 'Full Thread', length_mm: '400',
      coating: 'Plain (Uncoated)',
    }));
    expect(code).toBe('RM-FST-HXBT-FT-B8MC2-M48-400MM-MC-PLN');
    expect(code.length).toBeLessThanOrEqual(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. ANCHOR BOLT
// ─────────────────────────────────────────────────────────────────────────────
describe('Anchor Bolt', () => {
  it('L-Bolt', () => {
    expect(build(anchor())).toBe('RM-FST-ANBT-LBLT-A307-M20-600MM-100MM-HDG');
  });
  it('J-Bolt', () => {
    expect(build(anchor({ anchor_type: 'J-Bolt' }))).toBe('RM-FST-ANBT-JBLT-A307-M20-600MM-100MM-HDG');
  });
  it('Straight', () => {
    expect(build(anchor({ anchor_type: 'Straight' }))).toBe('RM-FST-ANBT-STR-A307-M20-600MM-100MM-HDG');
  });
  it('Headed', () => {
    expect(build(anchor({ anchor_type: 'Headed' }))).toBe('RM-FST-ANBT-HDR-A307-M20-600MM-100MM-HDG');
  });
  it('thread_length >= overall_length throws', () => {
    errMsg(anchor({ overall_length: '100', thread_length: '100' }),
      'Thread Length must be less than Overall Length');
  });
  it('thread_length > overall_length throws', () => {
    errMsg(anchor({ overall_length: '100', thread_length: '200' }),
      'Thread Length must be less than Overall Length');
  });
  it('missing anchor_type throws', () => {
    errMsg(anchor({ anchor_type: '' }), 'Anchor Type');
  });
  it('missing overall_length throws', () => {
    errMsg(anchor({ overall_length: '' }), 'Overall Length');
  });
  it('missing thread_length throws', () => {
    errMsg(anchor({ thread_length: '' }), 'Thread Length');
  });
  it('worst-case — within 50 chars', () => {
    const code = build(anchor({
      anchor_type: 'L-Bolt', bolt_material: 'IS 1367 Cl.10.9',
      diameter: 'M48', overall_length: '1500', thread_length: '200',
      coating: 'Hot-Dip Galvanized',
    }));
    expect(code).toBe('RM-FST-ANBT-LBLT-IS109-M48-1500MM-200MM-HDG');
    expect(code.length).toBeLessThanOrEqual(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. EYE BOLT
// ─────────────────────────────────────────────────────────────────────────────
describe('Eye Bolt', () => {
  it('Shoulder (Machinery)', () => {
    expect(build(eye())).toBe('RM-FST-EYBT-SHD-B7-M16-80MM-PLN');
  });
  it('Plain (Nut Eye)', () => {
    expect(build(eye({ eye_bolt_type: 'Plain (Nut Eye)' }))).toBe('RM-FST-EYBT-PNE-B7-M16-80MM-PLN');
  });
  it('missing eye_bolt_type throws', () => {
    errMsg(eye({ eye_bolt_type: '' }), 'Eye Bolt Type');
  });
  it('missing shank_length throws', () => {
    errMsg(eye({ shank_length: '' }), 'Shank Length');
  });
  it('with coating', () => {
    expect(build(eye({ coating: 'Zinc Electroplated' }))).toBe('RM-FST-EYBT-SHD-B7-M16-80MM-ZEP');
  });
  it('worst-case — within 50 chars', () => {
    const code = build(eye({
      eye_bolt_type: 'Shoulder (Machinery)',
      bolt_material: 'ASTM A193 B8M Class 2',
      diameter: 'M48', shank_length: '200',
      coating: 'Hot-Dip Galvanized',
    }));
    expect(code).toBe('RM-FST-EYBT-SHD-B8MC2-M48-200MM-HDG');
    expect(code.length).toBeLessThanOrEqual(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. U-BOLT
// ─────────────────────────────────────────────────────────────────────────────
describe('U-Bolt', () => {
  it('basic', () => {
    expect(build(ubolt())).toBe('RM-FST-UBLT-A307-M12-50NB-150MM-HDG');
  });
  it('different pipe size', () => {
    expect(build(ubolt({ pipe_size: '100NB' }))).toBe('RM-FST-UBLT-A307-M12-100NB-150MM-HDG');
  });
  it('inch rod diameter', () => {
    expect(build(ubolt({ rod_diameter: '3/4"', coating: 'Zinc Electroplated' })))
      .toBe('RM-FST-UBLT-A307-34IN-50NB-150MM-ZEP');
  });
  it('SS316 material', () => {
    expect(build(ubolt({ bolt_material: 'ASTM A193 B8M (SS316)', coating: 'Plain (Uncoated)' })))
      .toBe('RM-FST-UBLT-B8M-M12-50NB-150MM-PLN');
  });
  it('missing rod_diameter throws', () => {
    errMsg(ubolt({ rod_diameter: '' }), 'Rod Diameter');
  });
  it('missing pipe_size throws', () => {
    errMsg(ubolt({ pipe_size: '' }), 'Pipe Size');
  });
  it('missing leg_length throws', () => {
    errMsg(ubolt({ leg_length: '' }), 'Leg Length');
  });
  it('worst-case — within 50 chars', () => {
    const code = build(ubolt({
      bolt_material: 'ASTM A193 B8M Class 2',
      rod_diameter: 'M36', pipe_size: '1200NB',
      leg_length: '400', coating: 'Hot-Dip Galvanized',
    }));
    expect(code).toBe('RM-FST-UBLT-B8MC2-M36-1200NB-400MM-HDG');
    expect(code.length).toBeLessThanOrEqual(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. NUTS
// ─────────────────────────────────────────────────────────────────────────────
describe('Nuts', () => {
  it('Hex Nut — metric', () => {
    expect(build(nut())).toBe('RM-FST-HXNT-2H-M20-MC-PLN');
  });
  it('Heavy Hex Nut — metric', () => {
    expect(build(nut({ fastener_type: 'Heavy Hex Nut' }))).toBe('RM-FST-HHNT-2H-M20-MC-PLN');
  });
  it('Hex Nut — inch UNF', () => {
    expect(build(nut({ diameter: '3/4"', threading_standard: 'ASME B1.1 (UNF)' })))
      .toBe('RM-FST-HXNT-2H-34IN-UNF-PLN');
  });
  it('all nut materials resolve', () => {
    for (const mat of ['ASTM A194 2H','ASTM A194 2HM','ASTM A194 8 (SS304)',
      'ASTM A194 8M (SS316)','ASTM A194 4','ASTM A194 7','ASTM A194 7M','IS 1367 Cl.8']) {
      expect(() => build(nut({ nut_material: mat }))).not.toThrow();
    }
  });
  it('missing nut_material throws', () => {
    errMsg(nut({ nut_material: '' }), 'Nut Material');
  });
  it('missing threading_standard throws', () => {
    errMsg(nut({ threading_standard: '' }), 'Threading Standard');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. WASHERS
// ─────────────────────────────────────────────────────────────────────────────
describe('Washers', () => {
  it('Flat Washer — CS', () => {
    expect(build(washer())).toBe('RM-FST-FLWSH-CS-M20-PLN');
  });
  it('Spring Washer — SS304', () => {
    expect(build(washer({ fastener_type: 'Spring Washer', washer_material: 'SS 304' })))
      .toBe('RM-FST-SPWSH-SS304-M20-PLN');
  });
  it('Flat Washer — SS316 — HDG', () => {
    expect(build(washer({ washer_material: 'SS 316', coating: 'Hot-Dip Galvanized' })))
      .toBe('RM-FST-FLWSH-SS316-M20-HDG');
  });
  it('Flat Washer — AS', () => {
    expect(build(washer({ washer_material: 'Alloy Steel' }))).toBe('RM-FST-FLWSH-AS-M20-PLN');
  });
  it('missing washer_material throws', () => {
    errMsg(washer({ washer_material: '' }), 'Washer Material');
  });
  it('unrecognised washer_material throws', () => {
    errMsg(washer({ washer_material: 'Bronze' }), '"Bronze"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. DIAMETER – THREADING COMPATIBILITY
// ─────────────────────────────────────────────────────────────────────────────
describe('Diameter-threading compatibility', () => {
  it('metric dia + UNC → throws', () => {
    errMsg(stud({ diameter: 'M20', threading_standard: 'ASME B1.1 (UNC)' }),
      'Metric diameter');
  });
  it('metric dia + UNF → throws', () => {
    errMsg(stud({ diameter: 'M20', threading_standard: 'ASME B1.1 (UNF)' }),
      'Metric diameter');
  });
  it('inch dia + ISO Metric Coarse → throws', () => {
    errMsg(stud({ diameter: '3/4"', threading_standard: 'ISO Metric Coarse' }),
      'Inch diameter');
  });
  it('inch dia + ISO Metric Fine → throws', () => {
    errMsg(stud({ diameter: '3/4"', threading_standard: 'ISO Metric Fine' }),
      'Inch diameter');
  });
  it('same check on nuts', () => {
    errMsg(nut({ diameter: '3/4"', threading_standard: 'ISO Metric Coarse' }), 'Inch diameter');
  });
  it('same check on set', () => {
    errMsg(set_({ diameter: 'M24', threading_standard: 'ASME B1.1 (UNC)' }), 'Metric diameter');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 16. COATING IS MANDATORY — no silent default
// ─────────────────────────────────────────────────────────────────────────────
describe('Coating mandatory', () => {
  it('missing coating throws', () => {
    errMsg(stud({ coating: '' }), 'Coating');
  });
  it('unrecognised coating throws', () => {
    errMsg(stud({ coating: 'Painted Red' }), '"Painted Red"');
  });
  it('missing coating on washer throws', () => {
    errMsg(washer({ coating: '' }), 'Coating');
  });
  it('missing coating on nut throws', () => {
    errMsg(nut({ coating: '' }), 'Coating');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 17. LENGTH VALIDATION
// ─────────────────────────────────────────────────────────────────────────────
describe('Length validation', () => {
  it('length = 0 throws', () => {
    err(stud({ length_mm: '0' }));
  });
  it('length > 2000 throws', () => {
    errMsg(stud({ length_mm: '2001' }), '2000 mm');
  });
  it('length = 2000 is valid', () => {
    expect(() => build(stud({ length_mm: '2000' }))).not.toThrow();
  });
  it('non-integer length throws', () => {
    err(stud({ length_mm: '1.5' }));
  });
  it('negative length throws', () => {
    err(stud({ length_mm: '-10' }));
  });
  it('anchor overall_length > 2000 throws', () => {
    errMsg(anchor({ overall_length: '2001' }), '2000 mm');
  });
  it('leg_length > 2000 throws', () => {
    errMsg(ubolt({ leg_length: '2001' }), '2000 mm');
  });
  it('shank_length > 2000 throws', () => {
    errMsg(eye({ shank_length: '2001' }), '2000 mm');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 18. MISSING FASTENER TYPE
// ─────────────────────────────────────────────────────────────────────────────
describe('Missing or unrecognised fastener type', () => {
  it('empty fastener_type throws', () => {
    errMsg(stud({ fastener_type: '' }), 'Fastener Type');
  });
  it('unrecognised fastener_type throws', () => {
    errMsg(stud({ fastener_type: 'Carriage Bolt' }), '"Carriage Bolt"');
  });
  // Old UI label — now renamed — must fail with helpful message
  it('old label "Stud Bolt (Full Thread)" not recognised', () => {
    errMsg(stud({ fastener_type: 'Stud Bolt (Full Thread)' }), 'not recognised');
  });
  it('old label "Stud Bolt (2-end Thread)" not recognised', () => {
    errMsg(stud({ fastener_type: 'Stud Bolt (2-end Thread)' }), 'not recognised');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 19. CODE LENGTH — all families within 50 chars
// ─────────────────────────────────────────────────────────────────────────────
describe('Code length ≤ 50', () => {
  it('worst-case stud bolt', () => {
    const code = build(stud({ bolt_material: 'ASTM A193 B8M Class 2', diameter: 'M48', length_mm: '400', threading_standard: 'ISO Metric Fine', coating: 'PTFE Coated' }));
    expect(code.length).toBeLessThanOrEqual(50);
  });
  it('worst-case double-end stud inch', () => {
    const code = build(stud({ fastener_type: 'Double-End Stud', diameter: '1-3/4"', threading_standard: 'ASME B1.1 (UNF)', length_mm: '400', coating: 'Hot-Dip Galvanized' }));
    expect(code.length).toBeLessThanOrEqual(50);
  });
  it('worst-case hex bolt metric PT', () => {
    const code = build(hex({ diameter: 'M48', threading_standard: 'ISO Metric Coarse', bolt_profile: 'Partial Thread', length_mm: '400', bolt_material: 'ASTM A193 B8M Class 2', coating: 'PTFE Coated' }));
    expect(code.length).toBeLessThanOrEqual(50);
  });
  it('worst-case anchor bolt', () => {
    const code = build(anchor({ anchor_type: 'L-Bolt', bolt_material: 'IS 1367 Cl.10.9', diameter: 'M48', overall_length: '2000', thread_length: '200', coating: 'Hot-Dip Galvanized' }));
    expect(code.length).toBeLessThanOrEqual(50);
  });
  it('worst-case eye bolt', () => {
    const code = build(eye({ bolt_material: 'ASTM A193 B8M Class 2', diameter: 'M48', shank_length: '200', coating: 'Hot-Dip Galvanized' }));
    expect(code.length).toBeLessThanOrEqual(50);
  });
  it('worst-case U-bolt', () => {
    const code = build(ubolt({ bolt_material: 'ASTM A193 B8M Class 2', rod_diameter: 'M36', pipe_size: '1200NB', leg_length: '400', coating: 'Hot-Dip Galvanized' }));
    expect(code.length).toBeLessThanOrEqual(50);
  });
  it('worst-case nut', () => {
    const code = build(nut({ fastener_type: 'Heavy Hex Nut', nut_material: 'IS 1367 Cl.8', diameter: '1-3/4"', threading_standard: 'ASME B1.1 (UNF)', coating: 'Zinc Electroplated' }));
    expect(code.length).toBeLessThanOrEqual(50);
  });
  it('worst-case washer', () => {
    const code = build(washer({ fastener_type: 'Spring Washer', washer_material: 'SS 316', diameter: 'M48', coating: 'Hot-Dip Galvanized' }));
    expect(code.length).toBeLessThanOrEqual(50);
  });
});
