/**
 * Phase 2A – Regression tests for Raw Materials / Flanges builder
 *
 * Tests:
 *   1.  normalizeFlangeSizeCode() — all input variants
 *   2.  normalizeFlangeSizeCode() — inch-to-DN conversion
 *   3.  normalizeFlangeSizeCode() — error cases
 *   4.  buildFlangesItemCode()    — all flange types
 *   5.  buildFlangesItemCode()    — Standard/Rating compatibility gate
 *   6.  buildFlangesItemCode()    — Reducing flange size segment
 *   7.  buildFlangesItemCode()    — all materials, facing values
 *   8.  buildFlangesItemCode()    — legacy facing aliases
 *   9.  buildFlangesItemCode()    — live data match (10 existing lines)
 *  10.  buildFlangesItemCode()    — code format (no spaces, no parens, ≤50 chars)
 *  11.  DB round-trip             — create, reuse, identity-change, no duplicates
 */

import { Pool } from 'pg';
import {
  normalizeFlangeSizeCode,
  buildFlangesItemCode,
  resolveFlangesSapItemCode,
} from '../server/buy-catalog-sap-service';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Minimal test runner ───────────────────────────────────────────────────────

let passed = 0; let failed = 0;
const failures: string[] = [];

function eq(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) { passed++; }
  else { failed++; failures.push(`  FAIL  ${label}\n         expected: ${JSON.stringify(expected)}\n         got:      ${JSON.stringify(actual)}`); }
}
function ok(label: string, cond: boolean) {
  if (cond) { passed++; } else { failed++; failures.push(`  FAIL  ${label}`); }
}
function throws(label: string, fn: () => unknown) {
  try { fn(); failed++; failures.push(`  FAIL  ${label} — expected throw, no error thrown`); }
  catch { passed++; }
}
function noSpaces(label: string, s: string)  { ok(`${label} no-spaces`, !/\s/.test(s)); }
function noParens(label: string, s: string)  { ok(`${label} no-parens`, !/[()]/.test(s)); }
function maxLen(label: string, s: string)    { ok(`${label} ≤50 chars`, s.length <= 50); }

// ── 1. normalizeFlangeSizeCode — metric variants ──────────────────────────────

console.log('\n── 1. normalizeFlangeSizeCode (metric) ──');
eq('plain number 15',         normalizeFlangeSizeCode('15'),      'DN15');
eq('plain number 50',         normalizeFlangeSizeCode('50'),      'DN50');
eq('plain number 100',        normalizeFlangeSizeCode('100'),     'DN100');
eq('plain number 300',        normalizeFlangeSizeCode('300'),     'DN300');
eq('NB suffix with space',    normalizeFlangeSizeCode('50 NB'),   'DN50');
eq('NB suffix no space',      normalizeFlangeSizeCode('50NB'),    'DN50');
eq('DN prefix',               normalizeFlangeSizeCode('DN50'),    'DN50');
eq('DN prefix with space',    normalizeFlangeSizeCode('DN 50'),   'DN50');
eq('DN prefix lowercase',     normalizeFlangeSizeCode('dn50'),    'DN50');
eq('15 NB',                   normalizeFlangeSizeCode('15 NB'),   'DN15');
eq('DN15',                    normalizeFlangeSizeCode('DN15'),    'DN15');
// Identity: 15 NB == DN15 == 15
eq('15 NB == DN15',           normalizeFlangeSizeCode('15 NB'),   normalizeFlangeSizeCode('DN15'));
eq('15 NB == 15',             normalizeFlangeSizeCode('15 NB'),   normalizeFlangeSizeCode('15'));

// ── 2. normalizeFlangeSizeCode — inch-to-DN conversion ───────────────────────

console.log('\n── 2. normalizeFlangeSizeCode (inch) ──');
eq('1/2"   → DN15',  normalizeFlangeSizeCode('1/2"'),   'DN15');
eq('3/4"   → DN20',  normalizeFlangeSizeCode('3/4"'),   'DN20');
eq('1"     → DN25',  normalizeFlangeSizeCode('1"'),     'DN25');
eq('1-1/4" → DN32',  normalizeFlangeSizeCode('1-1/4"'), 'DN32');
eq('1-1/2" → DN40',  normalizeFlangeSizeCode('1-1/2"'), 'DN40');
eq('2"     → DN50',  normalizeFlangeSizeCode('2"'),     'DN50');
eq('2-1/2" → DN65',  normalizeFlangeSizeCode('2-1/2"'), 'DN65');
eq('3"     → DN80',  normalizeFlangeSizeCode('3"'),     'DN80');
eq('4"     → DN100', normalizeFlangeSizeCode('4"'),     'DN100');
eq('6"     → DN150', normalizeFlangeSizeCode('6"'),     'DN150');
eq('8"     → DN200', normalizeFlangeSizeCode('8"'),     'DN200');
eq('10"    → DN250', normalizeFlangeSizeCode('10"'),    'DN250');
eq('12"    → DN300', normalizeFlangeSizeCode('12"'),    'DN300');
eq('2 IN   → DN50',  normalizeFlangeSizeCode('2 IN'),   'DN50');
eq('2IN    → DN50',  normalizeFlangeSizeCode('2IN'),    'DN50');
// CRITICAL: 1/2" and 12" must NOT produce the same output
ok('1/2" ≠ 12"', normalizeFlangeSizeCode('1/2"') !== normalizeFlangeSizeCode('12"'));
eq('1/2" is DN15, not DN300', normalizeFlangeSizeCode('1/2"'), 'DN15');
eq('12"   is DN300',          normalizeFlangeSizeCode('12"'),  'DN300');
// All three notations for 50 NB are equivalent
eq('2" == 50 NB == DN50',
  normalizeFlangeSizeCode('2"'),
  normalizeFlangeSizeCode('50 NB'));

// ── 3. normalizeFlangeSizeCode — error cases ──────────────────────────────────

console.log('\n── 3. normalizeFlangeSizeCode (errors) ──');
throws('empty string throws',        () => normalizeFlangeSizeCode(''));
throws('garbage string throws',      () => normalizeFlangeSizeCode('FOO-BAR'));
throws('DN with no number throws',   () => normalizeFlangeSizeCode('DN'));
throws('non-standard inch throws',   () => normalizeFlangeSizeCode('7"')); // 7" has no DN equivalent

// ── 4. buildFlangesItemCode — all flange types ────────────────────────────────

console.log('\n── 4. buildFlangesItemCode (flange types) ──');
const base = {
  standard: 'ASME B16.5', pressure: 'Class 150',
  material: 'ASTM A105',  facing: 'RF (Raised Face)',
};
const types: Array<[string, string, string]> = [
  ['Weld Neck (WN)',       'WN',  'RM-FLG-B165-WN-DN50-CL150-A105-RF'],
  ['Slip-On (SO)',         'SO',  'RM-FLG-B165-SO-DN50-CL150-A105-RF'],
  ['Blind (BL)',           'BL',  'RM-FLG-B165-BL-DN50-CL150-A105-RF'],
  ['Socket Weld (SW)',     'SW',  'RM-FLG-B165-SW-DN50-CL150-A105-RF'],
  ['Threaded (TH)',        'TH',  'RM-FLG-B165-TH-DN50-CL150-A105-RF'],
  ['Lap Joint (LJ)',       'LJ',  'RM-FLG-B165-LJ-DN50-CL150-A105-RF'],
  ['Long Weld Neck (LWN)', 'LWN', 'RM-FLG-B165-LWN-DN50-CL150-A105-RF'],
  ['Orifice (ORF)',        'ORF', 'RM-FLG-B165-ORF-DN50-CL150-A105-RF'],
];
for (const [typeLabel, , expected] of types) {
  const code = buildFlangesItemCode({ ...base, flange_type: typeLabel, size_nb: '50 NB' });
  eq(`type ${typeLabel}`, code, expected);
  noSpaces(`type-${typeLabel}`, code); noParens(`type-${typeLabel}`, code); maxLen(`type-${typeLabel}`, code);
}

// ── 5. Standard / Rating compatibility ───────────────────────────────────────

console.log('\n── 5. Standard/Rating compatibility ──');
// Class standards must reject PN ratings
throws('B16.5 + PN 16 throws',    () => buildFlangesItemCode({ ...base, flange_type: 'Blind (BL)', size_nb: '50', pressure: 'PN 16' }));
throws('B16.47A + PN 10 throws',  () => buildFlangesItemCode({ ...base, standard: 'ASME B16.47 Series A', flange_type: 'Weld Neck (WN)', size_nb: '100', pressure: 'PN 10' }));
throws('MSS SP-44 + PN 40 throws',() => buildFlangesItemCode({ ...base, standard: 'MSS SP-44', flange_type: 'Weld Neck (WN)', size_nb: '100', pressure: 'PN 40' }));
// PN standards must reject Class ratings
throws('EN1092 + Class 150 throws', () => buildFlangesItemCode({ ...base, standard: 'BS EN 1092-1', flange_type: 'Slip-On (SO)', size_nb: '50', pressure: 'Class 150' }));
throws('DIN + Class 300 throws',    () => buildFlangesItemCode({ ...base, standard: 'DIN 2573 / 2576', flange_type: 'Slip-On (SO)', size_nb: '50', pressure: 'Class 300' }));
throws('IS6392 + Class 150 throws', () => buildFlangesItemCode({ ...base, standard: 'IS 6392', flange_type: 'Slip-On (SO)', size_nb: '50', pressure: 'Class 150' }));
// Valid pairings
const en16 = buildFlangesItemCode({ ...base, standard: 'BS EN 1092-1', flange_type: 'Slip-On (SO)', size_nb: '50', pressure: 'PN 16' });
eq('EN1092 + PN 16 ok', en16, 'RM-FLG-EN1092-SO-DN50-PN16-A105-RF');
const b1647a = buildFlangesItemCode({ ...base, standard: 'ASME B16.47 Series A', flange_type: 'Weld Neck (WN)', size_nb: '300', pressure: 'Class 900', material: 'ASTM A182 F22', facing: 'RF (Raised Face)' });
eq('B16.47A + CL900 ok', b1647a, 'RM-FLG-B1647A-WN-DN300-CL900-F22-RF');

// ── 6. Reducing flanges ───────────────────────────────────────────────────────

console.log('\n── 6. Reducing flanges ──');
const red100x50 = buildFlangesItemCode({ ...base, flange_type: 'Reducing (RED)', size_nb: '100 NB', reducing_bore: '50 NB' });
eq('reducing DN100XDN50',    red100x50, 'RM-FLG-B165-RED-DN100XDN50-CL150-A105-RF');
const red4x2 = buildFlangesItemCode({ ...base, flange_type: 'Reducing (RED)', size_nb: '4"', reducing_bore: '2"' });
eq('reducing 4" × 2"',       red4x2,   'RM-FLG-B165-RED-DN100XDN50-CL150-A105-RF');
eq('inch reducing == NB reducing', red100x50, red4x2); // identical procurement identity
throws('reducing without reducing_bore throws', () =>
  buildFlangesItemCode({ ...base, flange_type: 'Reducing (RED)', size_nb: '100' }));
noSpaces('reducing', red100x50); noParens('reducing', red100x50); maxLen('reducing', red100x50);

// ── 7. All materials ──────────────────────────────────────────────────────────

console.log('\n── 7. All materials ──');
const materials: Array<[string, string]> = [
  ['ASTM A105', 'A105'], ['ASTM A105N', 'A105N'], ['ASTM A350 LF2', 'LF2'],
  ['ASTM A182 F11', 'F11'], ['ASTM A182 F22', 'F22'], ['ASTM A182 F304', 'F304'],
  ['ASTM A182 F304L', 'F304L'], ['ASTM A182 F316', 'F316'], ['ASTM A182 F316L', 'F316L'],
  ['ASTM A182 F321', 'F321'], ['ASTM A182 F347', 'F347'],
  ['ASTM A182 F51 (Duplex)', 'F51'], ['ASTM A182 F53 (Super Duplex)', 'F53'],
  ['ASTM A694 F52', 'F52'], ['ASTM A694 F60', 'F60'],
  ['ASTM A694 F65', 'F65'], ['ASTM A694 F70', 'F70'],
];
for (const [mat, matCode] of materials) {
  const code = buildFlangesItemCode({ ...base, flange_type: 'Blind (BL)', size_nb: '50', material: mat });
  eq(`material ${mat}`, code, `RM-FLG-B165-BL-DN50-CL150-${matCode}-RF`);
  noSpaces(`mat-${matCode}`, code); noParens(`mat-${matCode}`, code); maxLen(`mat-${matCode}`, code);
}

// ── 8. Facing values + legacy aliases ────────────────────────────────────────

console.log('\n── 8. Facing values and legacy aliases ──');
const facingAttrs = { ...base, flange_type: 'Blind (BL)', size_nb: '50' };
eq('RF (Raised Face)',           buildFlangesItemCode({ ...facingAttrs, facing: 'RF (Raised Face)' }),           'RM-FLG-B165-BL-DN50-CL150-A105-RF');
eq('FF (Flat Face)',             buildFlangesItemCode({ ...facingAttrs, facing: 'FF (Flat Face)' }),             'RM-FLG-B165-BL-DN50-CL150-A105-FF');
eq('RTJ (Ring Type Joint)',      buildFlangesItemCode({ ...facingAttrs, facing: 'RTJ (Ring Type Joint)' }),      'RM-FLG-B165-BL-DN50-CL150-A105-RTJ');
eq('TG (Tongue & Groove)',       buildFlangesItemCode({ ...facingAttrs, facing: 'TG (Tongue & Groove)' }),       'RM-FLG-B165-BL-DN50-CL150-A105-TG');
eq('SM (Small Male)',            buildFlangesItemCode({ ...facingAttrs, facing: 'SM (Small Male)' }),            'RM-FLG-B165-BL-DN50-CL150-A105-SM');
eq('SF (Small Female)',          buildFlangesItemCode({ ...facingAttrs, facing: 'SF (Small Female)' }),          'RM-FLG-B165-BL-DN50-CL150-A105-SF');
eq('LG (Large Groove)',          buildFlangesItemCode({ ...facingAttrs, facing: 'LG (Large Groove)' }),          'RM-FLG-B165-BL-DN50-CL150-A105-LG');
// Legacy aliases (gasket form format)
eq('alias: Raised Face (RF)',    buildFlangesItemCode({ ...facingAttrs, facing: 'Raised Face (RF)' }),           'RM-FLG-B165-BL-DN50-CL150-A105-RF');
eq('alias: Flat Face (FF)',      buildFlangesItemCode({ ...facingAttrs, facing: 'Flat Face (FF)' }),             'RM-FLG-B165-BL-DN50-CL150-A105-FF');
eq('alias: Ring Type Joint (RTJ)', buildFlangesItemCode({ ...facingAttrs, facing: 'Ring Type Joint (RTJ)' }),   'RM-FLG-B165-BL-DN50-CL150-A105-RTJ');
// Unknown facing throws
throws('unknown facing throws',  () => buildFlangesItemCode({ ...facingAttrs, facing: 'Male Face' }));

// ── 9. Live data match — all 10 existing flange lines ────────────────────────

console.log('\n── 9. Live data match (10 existing flange lines) ──');
// All 10 live lines have exactly these attributes
const liveAttrs = {
  standard: 'ASME B16.5', flange_type: 'Blind (BL)', size_nb: '15',
  pressure: 'Class 150',  material: 'ASTM A105',     facing: 'RF (Raised Face)',
};
const liveCode = buildFlangesItemCode(liveAttrs);
eq('live line code', liveCode, 'RM-FLG-B165-BL-DN15-CL150-A105-RF');
noSpaces('live', liveCode); noParens('live', liveCode); maxLen('live', liveCode);
// Confirm all notation variants for "15 NB" → same code
eq('15 == DN15 == 15 NB', liveCode,
  buildFlangesItemCode({ ...liveAttrs, size_nb: 'DN15' }));
eq('1/2" → same code', liveCode,
  buildFlangesItemCode({ ...liveAttrs, size_nb: '1/2"' }));

// ── 10. Code format — worst-case lengths ─────────────────────────────────────

console.log('\n── 10. Code format (length, spaces, parens) ──');
const worstCaseAttrs = {
  standard: 'ASME B16.47 Series A', flange_type: 'Long Weld Neck (LWN)',
  size_nb: '300', pressure: 'Class 2500', material: 'ASTM A182 F316L',
  facing: 'RTJ (Ring Type Joint)',
};
const worst = buildFlangesItemCode(worstCaseAttrs);
eq('worst-case code', worst, 'RM-FLG-B1647A-LWN-DN300-CL2500-F316L-RTJ');
noSpaces('worst', worst); noParens('worst', worst); maxLen('worst', worst);
console.log(`  Worst-case code: "${worst}" (${worst.length} chars)`);

// All standards + all rating combinations that are valid
const allValidCodes: string[] = [
  buildFlangesItemCode({ standard: 'ASME B16.5',            flange_type: 'Blind (BL)',        size_nb: '50', pressure: 'Class 150',  material: 'ASTM A105',     facing: 'RF (Raised Face)' }),
  buildFlangesItemCode({ standard: 'ASME B16.47 Series B',  flange_type: 'Weld Neck (WN)',    size_nb: '600',pressure: 'Class 2500', material: 'ASTM A182 F316L',facing: 'RTJ (Ring Type Joint)' }),
  buildFlangesItemCode({ standard: 'MSS SP-44',             flange_type: 'Weld Neck (WN)',    size_nb: '400',pressure: 'Class 900',  material: 'ASTM A694 F70',  facing: 'RF (Raised Face)' }),
  buildFlangesItemCode({ standard: 'BS EN 1092-1',          flange_type: 'Slip-On (SO)',      size_nb: '100',pressure: 'PN 40',      material: 'ASTM A182 F316', facing: 'FF (Flat Face)' }),
  buildFlangesItemCode({ standard: 'DIN 2573 / 2576',       flange_type: 'Slip-On (SO)',      size_nb: '50', pressure: 'PN 16',      material: 'ASTM A105',      facing: 'RF (Raised Face)' }),
  buildFlangesItemCode({ standard: 'IS 6392',               flange_type: 'Blind (BL)',        size_nb: '100',pressure: 'PN 10',      material: 'ASTM A105',      facing: 'FF (Flat Face)' }),
];
for (const [i, code] of allValidCodes.entries()) {
  noSpaces(`all-valid-${i}`, code);
  noParens(`all-valid-${i}`, code);
  maxLen(`all-valid-${i}`, code);
}

// ── 11. DB round-trip ─────────────────────────────────────────────────────────

console.log('\n── 11. DB round-trip ──');
const GID = 1; // raw_materials
const SID = 4; // flanges
const insertedCodes: string[] = [];

try {
  // A — first save: creates master item
  const a1 = await resolveFlangesSapItemCode(pool, GID, SID,
    { standard: 'ASME B16.5', flange_type: 'Weld Neck (WN)', size_nb: 'DN50',
      pressure: 'Class 150', material: 'ASTM A182 F316', facing: 'RF (Raised Face)' },
    'NOS', 'WN Flange DN50 CL150 F316 RF');
  eq('A1: SAP code', a1.sapItemCode, 'RM-FLG-B165-WN-DN50-CL150-F316-RF');
  eq('A1: not reused', a1.reused, false);
  insertedCodes.push(a1.sapItemCode);

  // B — second save with same spec: reuses master item
  const a2 = await resolveFlangesSapItemCode(pool, GID, SID,
    { standard: 'ASME B16.5', flange_type: 'Weld Neck (WN)', size_nb: '50 NB',   // NB variant
      pressure: 'Class 150', material: 'ASTM A182 F316', facing: 'Raised Face (RF)' }, // alias
    'NOS', 'WN Flange 50NB CL150 F316 RF');
  eq('A2: same master_item_id', a2.masterItemId, a1.masterItemId);
  eq('A2: reused', a2.reused, true);
  eq('A2: same SAP code', a2.sapItemCode, a1.sapItemCode);

  // C — identity change (different type): must create new master item
  const b1 = await resolveFlangesSapItemCode(pool, GID, SID,
    { standard: 'ASME B16.5', flange_type: 'Slip-On (SO)', size_nb: 'DN50',
      pressure: 'Class 150', material: 'ASTM A182 F316', facing: 'RF (Raised Face)' },
    'NOS', 'SO Flange DN50 CL150 F316 RF');
  ok('B: different type → new master_item_id', b1.masterItemId !== a1.masterItemId);
  eq('B: not reused', b1.reused, false);
  insertedCodes.push(b1.sapItemCode);

  // D — identity change (different material): must create new master item
  const c1 = await resolveFlangesSapItemCode(pool, GID, SID,
    { standard: 'ASME B16.5', flange_type: 'Weld Neck (WN)', size_nb: 'DN50',
      pressure: 'Class 150', material: 'ASTM A105', facing: 'RF (Raised Face)' },
    'NOS', 'WN Flange DN50 CL150 A105 RF');
  ok('C: different material → new master_item_id', c1.masterItemId !== a1.masterItemId);
  insertedCodes.push(c1.sapItemCode);

  // E — Reducing flange via inch notation: resolves correctly
  const d1 = await resolveFlangesSapItemCode(pool, GID, SID,
    { standard: 'ASME B16.5', flange_type: 'Reducing (RED)', size_nb: '4"', reducing_bore: '2"',
      pressure: 'Class 150', material: 'ASTM A105', facing: 'RF (Raised Face)' },
    'NOS', 'Reducing Flange DN100XDN50 CL150 A105 RF');
  eq('D: reducing code', d1.sapItemCode, 'RM-FLG-B165-RED-DN100XDN50-CL150-A105-RF');
  insertedCodes.push(d1.sapItemCode);

  // F — Live data match: resolves the same code the 10 existing lines would produce
  const e1 = await resolveFlangesSapItemCode(pool, GID, SID,
    { standard: 'ASME B16.5', flange_type: 'Blind (BL)', size_nb: '15',
      pressure: 'Class 150', material: 'ASTM A105', facing: 'RF (Raised Face)' },
    'NOS', 'Blind Flange DN15 CL150 A105 RF');
  eq('E: live data code', e1.sapItemCode, 'RM-FLG-B165-BL-DN15-CL150-A105-RF');
  insertedCodes.push(e1.sapItemCode);

  // No duplicate master_items rows
  const dupCheck = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM master_items WHERE item_code = ANY($1::text[])`,
    [insertedCodes],
  );
  eq('no duplicate master_items', parseInt(dupCheck.rows[0].cnt), insertedCodes.length);

} finally {
  if (insertedCodes.length) {
    const del = await pool.query(
      `DELETE FROM master_items WHERE item_code = ANY($1::text[]) RETURNING item_code`,
      [insertedCodes],
    );
    console.log(`  Cleaned up ${del.rowCount} master_item(s): ${del.rows.map(r => r.item_code).join(', ')}`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n========================================================================');
console.log('PHASE 2A REGRESSION RESULTS');
console.log('========================================================================');
if (failures.length) { failures.forEach(f => console.log(f)); console.log(''); }
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log('========================================================================');
if (failed > 0) { process.exitCode = 1; }
else { console.log('  ALL TESTS PASSED ✓'); console.log('========================================================================'); }
await pool.end();
