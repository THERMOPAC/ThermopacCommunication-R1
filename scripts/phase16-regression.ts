/**
 * Phase 1.6 – Regression tests for SAP Item Code normalisation fixes
 *
 * Tests:
 *   1. normalizeNominalBore() — all input variants → canonical form
 *   2. normalizeFacingCode()  — all facing values + unknown throws
 *   3. buildPipesItemCode()   — NB variants, code format, length check
 *   4. buildFittingsItemCode()— NB variants, reducing bore, code format
 *   5. buildGasketsItemCode() — facing codes, NB cleanup, no spaces/parens
 *   6. DB round-trip          — identical variants share one master_item_id,
 *                               no spaces/parens in produced codes, ≤50 chars
 */

import { Pool } from 'pg';
import {
  normalizeNominalBore,
  normalizeFacingCode,
  buildPipesItemCode,
  buildFittingsItemCode,
  buildGasketsItemCode,
} from '../server/buy-catalog-sap-service';
import {
  resolvePipesSapItemCode,
  resolveFittingsSapItemCode,
  resolveGasketsSapItemCode,
} from '../server/buy-catalog-sap-service';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label}\n         expected: ${JSON.stringify(expected)}\n         got:      ${JSON.stringify(actual)}`);
  }
}

function assertThrows(label: string, fn: () => unknown) {
  try {
    fn();
    failed++;
    failures.push(`  FAIL: ${label} — expected throw, but no error was thrown`);
  } catch {
    passed++;
  }
}

function assertNoSpaces(label: string, code: string) {
  if (!/\s/.test(code)) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label} — code contains spaces: "${code}"`);
  }
}

function assertNoParens(label: string, code: string) {
  if (!/[()[\]]/.test(code)) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label} — code contains parentheses: "${code}"`);
  }
}

function assertMaxLen(label: string, code: string) {
  if (code.length <= 50) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label} — code length ${code.length} > 50: "${code}"`);
  }
}

// ── 1. normalizeNominalBore ───────────────────────────────────────────────────

console.log('\n── 1. normalizeNominalBore ──');

// Metric forms
assert('plain number',              normalizeNominalBore('50'),       '50');
assert('plain number with space',   normalizeNominalBore(' 50 '),     '50');
assert('NB with space',             normalizeNominalBore('50 NB'),    '50');
assert('NB without space',          normalizeNominalBore('50NB'),     '50');
assert('NB uppercase',              normalizeNominalBore('50 NB'),    '50');
assert('DN prefix no space',        normalizeNominalBore('DN50'),     '50');
assert('DN prefix with space',      normalizeNominalBore('DN 50'),    '50');
assert('DN lowercase',              normalizeNominalBore('dn50'),     '50');
assert('6 NB small bore',           normalizeNominalBore('6 NB'),     '6');
assert('DN150',                     normalizeNominalBore('DN150'),    '150');
assert('300 NB large bore',         normalizeNominalBore('300 NB'),   '300');

// Inch forms
assert('2 IN with space',           normalizeNominalBore('2 IN'),     '2IN');
assert('2IN no space',              normalizeNominalBore('2IN'),      '2IN');
assert('inch symbol 2"',            normalizeNominalBore('2"'),       '2IN');
assert('inch symbol 1/2"',          normalizeNominalBore('1/2"'),     '12IN');
assert('inch symbol 3/4"',          normalizeNominalBore('3/4"'),     '34IN');
assert('mixed fraction 1-1/2"',     normalizeNominalBore('1-1/2"'),   '112IN');
assert('mixed fraction 2-1/2"',     normalizeNominalBore('2-1/2"'),   '212IN');
assert('inch IN upper',             normalizeNominalBore('4 IN'),     '4IN');

// Identity: different forms of same bore → same output
assert('50 NB == 50',               normalizeNominalBore('50 NB'),    normalizeNominalBore('50'));
assert('DN50 == 50',                normalizeNominalBore('DN50'),     normalizeNominalBore('50'));
assert('2" == 2IN',                 normalizeNominalBore('2"'),       normalizeNominalBore('2IN'));
assert('1/2" == 12IN',              normalizeNominalBore('1/2"'),     normalizeNominalBore('12IN'));

// ── 2. normalizeFacingCode ────────────────────────────────────────────────────

console.log('\n── 2. normalizeFacingCode ──');

assert('Raised Face (RF)',          normalizeFacingCode('Raised Face (RF)'),      'RF');
assert('Flat Face (FF)',            normalizeFacingCode('Flat Face (FF)'),        'FF');
assert('Ring Type Joint (RTJ)',     normalizeFacingCode('Ring Type Joint (RTJ)'), 'RTJ');
assertThrows('unknown facing throws', () => normalizeFacingCode('Male Face'));

// ── 3. buildPipesItemCode ─────────────────────────────────────────────────────

console.log('\n── 3. buildPipesItemCode ──');

const pipeBase = { material_grade: 'IS 1239 Class A', schedule: 'STD' };

const p50NB    = buildPipesItemCode({ ...pipeBase, nominal_bore: '50 NB' });
const p50DN    = buildPipesItemCode({ ...pipeBase, nominal_bore: 'DN50' });
const p50plain = buildPipesItemCode({ ...pipeBase, nominal_bore: '50' });
const p2in     = buildPipesItemCode({ ...pipeBase, nominal_bore: '2"', material_grade: 'SA-106 Gr B', schedule: 'SCH 40' });
const p80NB    = buildPipesItemCode({ ...pipeBase, nominal_bore: '80 NB' });
const p80DN    = buildPipesItemCode({ ...pipeBase, nominal_bore: 'DN80' });

assert('50 NB == DN50',             p50NB,   p50DN);
assert('50 NB == 50',               p50NB,   p50plain);
assert('DN50 == 50',                p50DN,   p50plain);
assert('pipe 50 NB code',           p50NB,   'RM-PIP-IS1239A-50-STD');
assert('pipe DN50 code',            p50DN,   'RM-PIP-IS1239A-50-STD');
assert('pipe 2" code',              p2in,    'RM-PIP-SA106B-2IN-SCH40');
assert('pipe 80 NB == DN80',        p80NB,   p80DN);
assert('pipe 80 NB code',           p80NB,   'RM-PIP-IS1239A-80-STD');

for (const [lbl, code] of [['pipe-50', p50NB], ['pipe-80', p80NB], ['pipe-2in', p2in]] as [string, string][]) {
  assertNoSpaces(lbl, code);
  assertNoParens(lbl, code);
  assertMaxLen(lbl, code);
}

// ── 4. buildFittingsItemCode ──────────────────────────────────────────────────

console.log('\n── 4. buildFittingsItemCode ──');

const ftgBase = {
  fitting_type: '90° 1.5D Elbow', material_grade: 'A234 WPB',
  schedule: 'SCH 40', end_type: 'Butt Weld (BW)',
};

const ftg50NB    = buildFittingsItemCode({ ...ftgBase, nominal_bore: '50 NB' });
const ftg50DN    = buildFittingsItemCode({ ...ftgBase, nominal_bore: 'DN50' });
const ftg50plain = buildFittingsItemCode({ ...ftgBase, nominal_bore: '50' });
const ftg2in     = buildFittingsItemCode({ ...ftgBase, nominal_bore: '2"',   material_grade: 'A234 WPB' });
const ftg80NB    = buildFittingsItemCode({ ...ftgBase, nominal_bore: '80 NB' });

assert('ftg 50 NB == DN50',         ftg50NB,   ftg50DN);
assert('ftg 50 NB == 50',           ftg50NB,   ftg50plain);
assert('ftg 50 NB code',            ftg50NB,   'RM-FTG-E90-1.5D-A234-WPB-50-SCH40-BW');
assert('ftg DN50 code',             ftg50DN,   'RM-FTG-E90-1.5D-A234-WPB-50-SCH40-BW');
assert('ftg 2" code',               ftg2in,    'RM-FTG-E90-1.5D-A234-WPB-2IN-SCH40-BW');
assert('ftg 80 NB code',            ftg80NB,   'RM-FTG-E90-1.5D-A234-WPB-80-SCH40-BW');

// Reducing fitting — both NB and reducing bore normalized
const ftgRed = buildFittingsItemCode({
  fitting_type: 'Concentric Reducer', material_grade: 'A234 WPB',
  schedule: 'SCH 40', end_type: 'Butt Weld (BW)',
  nominal_bore: '80 NB', reducing_bore: '50 NB',
});
const ftgRedDN = buildFittingsItemCode({
  fitting_type: 'Concentric Reducer', material_grade: 'A234 WPB',
  schedule: 'SCH 40', end_type: 'Butt Weld (BW)',
  nominal_bore: 'DN80', reducing_bore: 'DN50',
});
assert('reducing 80 NB × 50 NB == DN80 × DN50', ftgRed, ftgRedDN);
assert('reducing code',             ftgRed,    'RM-FTG-REDC-A234-WPB-80X50-SCH40-BW');

for (const [lbl, code] of [['ftg-50', ftg50NB], ['ftg-80', ftg80NB], ['ftg-2in', ftg2in], ['ftg-red', ftgRed]] as [string, string][]) {
  assertNoSpaces(lbl, code);
  assertNoParens(lbl, code);
  assertMaxLen(lbl, code);
}

// ── 5. buildGasketsItemCode ───────────────────────────────────────────────────

console.log('\n── 5. buildGasketsItemCode ──');

const swioBase = {
  gasket_type: 'Spiral Wound – Inner + Outer Ring',
  winding_material: 'SS316 / Graphite',
  inner_ring_material: 'SS304', outer_ring_material: 'Carbon Steel',
  pressure_class: '150#',
};

const gskRF_50NB  = buildGasketsItemCode({ ...swioBase, nominal_bore: '50 NB', facing: 'Raised Face (RF)' });
const gskRF_DN50  = buildGasketsItemCode({ ...swioBase, nominal_bore: 'DN50',   facing: 'Raised Face (RF)' });
const gskRF_50    = buildGasketsItemCode({ ...swioBase, nominal_bore: '50',     facing: 'Raised Face (RF)' });
const gskFF_50    = buildGasketsItemCode({ ...swioBase, nominal_bore: '50 NB',  facing: 'Flat Face (FF)' });
const gskRTJ_50   = buildGasketsItemCode({ ...swioBase, nominal_bore: '50 NB',  facing: 'Ring Type Joint (RTJ)' });
const gskRF_80    = buildGasketsItemCode({ ...swioBase, nominal_bore: '80 NB',  facing: 'Raised Face (RF)' });

assert('gsk 50 NB == DN50',         gskRF_50NB, gskRF_DN50);
assert('gsk 50 NB == 50',           gskRF_50NB, gskRF_50);
assert('gsk SWIO RF code',          gskRF_50NB, 'RM-GSK-SWIO-316G-304-CS-50-150-RF');
assert('gsk DN50 RF code',          gskRF_DN50, 'RM-GSK-SWIO-316G-304-CS-50-150-RF');
assert('gsk SWIO FF code',          gskFF_50,   'RM-GSK-SWIO-316G-304-CS-50-150-FF');
assert('gsk SWIO RTJ code',         gskRTJ_50,  'RM-GSK-SWIO-316G-304-CS-50-150-RTJ');
assert('gsk 80 NB code',            gskRF_80,   'RM-GSK-SWIO-316G-304-CS-80-150-RF');

// Flat Sheet Gasket
const fsgRF = buildGasketsItemCode({
  gasket_type: 'Flat Sheet Gasket', sheet_material: 'PTFE', sheet_thickness: '3',
  nominal_bore: '50 NB', pressure_class: '150#', facing: 'Flat Face (FF)',
});
const fsgRF_DN = buildGasketsItemCode({
  gasket_type: 'Flat Sheet Gasket', sheet_material: 'PTFE', sheet_thickness: '3',
  nominal_bore: 'DN50', pressure_class: '150#', facing: 'Flat Face (FF)',
});
assert('fsg 50 NB == DN50',         fsgRF, fsgRF_DN);
assert('fsg code',                  fsgRF, 'RM-GSK-FSG-PTFE-3MM-50-150-FF');

// Unknown facing throws
assertThrows('SWIO unknown facing throws', () => buildGasketsItemCode({
  ...swioBase, nominal_bore: '50 NB', facing: 'Male Face',
}));

for (const [lbl, code] of [
  ['gsk-RF', gskRF_50NB], ['gsk-FF', gskFF_50], ['gsk-RTJ', gskRTJ_50],
  ['gsk-80', gskRF_80],   ['fsg-RF', fsgRF],
] as [string, string][]) {
  assertNoSpaces(lbl, code);
  assertNoParens(lbl, code);
  assertMaxLen(lbl, code);
}

// ── 6. DB round-trip — identical variants share master_item_id ────────────────

console.log('\n── 6. DB round-trip (identity + reuse) ──');

// Use a known draft header
const HDR_ID = 12;

async function nextLine(): Promise<number> {
  const r = await pool.query<{ n: number }>(
    `SELECT COALESCE(MAX(line_number),0)+1 AS n FROM buy_package_lines WHERE buy_package_header_id=$1`,
    [HDR_ID],
  );
  return r.rows[0].n;
}

async function insertTestLine(masterItemId: number | null, sapItemCode: string, attrs: object, ln: number): Promise<number> {
  const r = await pool.query<{ id: number }>(
    `INSERT INTO buy_package_lines
       (buy_package_header_id, line_number, buy_group_id, buy_subgroup_id, uom_id,
        generic_requirement, model, sort_order,
        master_item_id, sap_item_code, technical_attributes)
     VALUES ($1,$2,1,2,3,'Phase1.6 test','TBN',0,$3,$4,$5)
     RETURNING id`,
    [HDR_ID, ln, masterItemId, sapItemCode, JSON.stringify(attrs)],
  );
  return r.rows[0].id;
}

const insertedLineIds: number[] = [];
const insertedMasterCodes: string[] = [];

try {
  // ── Pipes: "50 NB" and "DN50" must resolve to same master_item
  const pipeAttrs1 = { material_grade: 'IS 1239 Class A', nominal_bore: '50 NB', schedule: 'STD' };
  const pipeAttrs2 = { material_grade: 'IS 1239 Class A', nominal_bore: 'DN50',   schedule: 'STD' };

  const r1 = await resolvePipesSapItemCode(pool, 1, 2, pipeAttrs1, 'MTR', 'IS1239A 50NB STD pipe');
  const r2 = await resolvePipesSapItemCode(pool, 1, 2, pipeAttrs2, 'MTR', 'IS1239A 50NB STD pipe');

  assert('pipe: 50 NB and DN50 same master_item_id', r1.masterItemId, r2.masterItemId);
  assert('pipe: 50 NB reused', r2.reused, true);
  assert('pipe: code = RM-PIP-IS1239A-50-STD', r1.sapItemCode, 'RM-PIP-IS1239A-50-STD');
  assertNoSpaces('pipe-db-code', r1.sapItemCode);
  assertNoParens('pipe-db-code', r1.sapItemCode);
  assertMaxLen('pipe-db-code', r1.sapItemCode);
  insertedMasterCodes.push(r1.sapItemCode);

  // ── Pipes: "80 NB" must create a NEW master_item (identity change)
  const r3 = await resolvePipesSapItemCode(pool, 1, 2, { material_grade: 'IS 1239 Class A', nominal_bore: '80 NB', schedule: 'STD' }, 'MTR', 'IS1239A 80NB STD pipe');
  assert('pipe: 80 NB creates new master_item', r3.masterItemId !== r1.masterItemId, true);
  insertedMasterCodes.push(r3.sapItemCode);

  // ── Fittings: "50 NB" and "DN50" same master_item
  const ftgA1 = { fitting_type: '90° 1.5D Elbow', material_grade: 'A234 WPB', nominal_bore: '50 NB', schedule: 'SCH 40', end_type: 'Butt Weld (BW)' };
  const ftgA2 = { fitting_type: '90° 1.5D Elbow', material_grade: 'A234 WPB', nominal_bore: 'DN50',   schedule: 'SCH 40', end_type: 'Butt Weld (BW)' };

  const f1 = await resolveFittingsSapItemCode(pool, 1, 3, ftgA1, 'NOS', 'A234WPB 90LRE 50NB SCH40 BW');
  const f2 = await resolveFittingsSapItemCode(pool, 1, 3, ftgA2, 'NOS', 'A234WPB 90LRE 50NB SCH40 BW');

  assert('ftg: 50 NB and DN50 same master_item_id', f1.masterItemId, f2.masterItemId);
  assert('ftg: DN50 reused', f2.reused, true);
  assert('ftg: code = RM-FTG-E90-1.5D-A234-WPB-50-SCH40-BW', f1.sapItemCode, 'RM-FTG-E90-1.5D-A234-WPB-50-SCH40-BW');
  assertNoSpaces('ftg-db-code', f1.sapItemCode);
  assertNoParens('ftg-db-code', f1.sapItemCode);
  assertMaxLen('ftg-db-code', f1.sapItemCode);
  insertedMasterCodes.push(f1.sapItemCode);

  // ── Gaskets: "50 NB" and "DN50" same master_item
  const gskA1 = { gasket_type: 'Spiral Wound – Inner + Outer Ring', winding_material: 'SS316 / Graphite', inner_ring_material: 'SS304', outer_ring_material: 'Carbon Steel', nominal_bore: '50 NB', pressure_class: '150#', facing: 'Raised Face (RF)' };
  const gskA2 = { ...gskA1, nominal_bore: 'DN50' };

  const g1 = await resolveGasketsSapItemCode(pool, 1, 6, gskA1, 'NOS', 'SWIO 316G 304 CS 50NB 150 RF');
  const g2 = await resolveGasketsSapItemCode(pool, 1, 6, gskA2, 'NOS', 'SWIO 316G 304 CS 50NB 150 RF');

  assert('gsk: 50 NB and DN50 same master_item_id', g1.masterItemId, g2.masterItemId);
  assert('gsk: DN50 reused', g2.reused, true);
  assert('gsk: SWIO RF code', g1.sapItemCode, 'RM-GSK-SWIO-316G-304-CS-50-150-RF');
  assertNoSpaces('gsk-db-code', g1.sapItemCode);
  assertNoParens('gsk-db-code', g1.sapItemCode);
  assertMaxLen('gsk-db-code', g1.sapItemCode);
  insertedMasterCodes.push(g1.sapItemCode);

  // ── Gaskets: facing change = new master_item
  const g3 = await resolveGasketsSapItemCode(pool, 1, 6, { ...gskA1, facing: 'Flat Face (FF)' }, 'NOS', 'SWIO 316G 304 CS 50NB 150 FF');
  assert('gsk: FF facing creates new master_item', g3.masterItemId !== g1.masterItemId, true);
  insertedMasterCodes.push(g3.sapItemCode);

} finally {
  // Clean up test master_items
  if (insertedMasterCodes.length) {
    const cleaned = await pool.query(
      `DELETE FROM master_items WHERE item_code = ANY($1::text[]) RETURNING item_code`,
      [insertedMasterCodes],
    );
    console.log(`  Cleaned up ${cleaned.rowCount} master_item(s): ${cleaned.rows.map(r => r.item_code).join(', ')}`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n========================================================================');
console.log('PHASE 1.6 REGRESSION RESULTS');
console.log('========================================================================');
if (failures.length) {
  failures.forEach(f => console.log(f));
  console.log('');
}
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log('========================================================================');
if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log('  ALL TESTS PASSED ✓');
  console.log('========================================================================');
}

await pool.end();
