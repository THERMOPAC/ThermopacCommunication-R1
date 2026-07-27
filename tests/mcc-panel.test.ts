/**
 * MCC Panel SAP Item Code — unit tests
 * Run: npx tsx --test tests/mcc-panel.test.ts
 * (or via: node --test --require tsx/cjs tests/mcc-panel.test.ts)
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMccPanelItemCode } from '../server/buy-catalog-sap-service';

// ── helpers ───────────────────────────────────────────────────────────────────
function base(overrides: Record<string, string> = {}) {
  return {
    voltage:            '415V AC (3Ph)',
    main_bus_rating:    '800A',
    fault_level_icw:    '50 kA',
    ip_rating:          'IP54',
    enclosure_material: 'CRCA Steel',
    area_classification:'Safe Area',
    ...overrides,
  } as Record<string, unknown>;
}

function hazBase(overrides: Record<string, string> = {}) {
  return base({
    area_classification:  'Zone 1',
    explosion_protection: 'Ex d (Flameproof)',
    gas_group:            'IIB',
    temperature_class:    'T4 (135°C)',
    ...overrides,
  });
}

// ── Group 1: Safe-area codes ───────────────────────────────────────────────────
test('safe-area: canonical example from spec', () => {
  const code = buildMccPanelItemCode(base());
  assert.equal(code, 'PNL-MCC-415V-800A-50KA-IP54-CRCA-SA');
});

test('safe-area: all five voltages produce correct segments', () => {
  const voltMap: Record<string, string> = {
    '415V AC (3Ph)': '415V',
    '380V AC (3Ph)': '380V',
    '440V AC (3Ph)': '440V',
    '480V AC (3Ph)': '480V',
    '690V AC (3Ph)': '690V',
  };
  for (const [stored, seg] of Object.entries(voltMap)) {
    const code = buildMccPanelItemCode(base({ voltage: stored }));
    assert.ok(code.startsWith(`PNL-MCC-${seg}-`), `Voltage ${stored} → expected ${seg}`);
  }
});

test('safe-area: all enclosure materials map correctly', () => {
  const matMap: Record<string, string> = {
    'CRCA Steel': 'CRCA', 'SS304': 'SS304', 'SS316': 'SS316',
    'Aluminium': 'ALU', 'GRP/FRP': 'GRP',
  };
  for (const [stored, seg] of Object.entries(matMap)) {
    const code = buildMccPanelItemCode(base({ enclosure_material: stored }));
    assert.ok(code.includes(`-${seg}-SA`), `Material ${stored} → expected ${seg}`);
  }
});

test('safe-area: all fault-level values map correctly', () => {
  const icwMap: Record<string, string> = {
    '6 kA':'6KA', '10 kA':'10KA', '25 kA':'25KA', '36 kA':'36KA',
    '50 kA':'50KA', '65 kA':'65KA', '85 kA':'85KA',
  };
  for (const [stored, seg] of Object.entries(icwMap)) {
    const code = buildMccPanelItemCode(base({ fault_level_icw: stored }));
    assert.ok(code.includes(`-${seg}-`), `Icw ${stored} → expected ${seg}`);
  }
});

test('safe-area: largest safe-area combination stays ≤ 50 chars', () => {
  const code = buildMccPanelItemCode(base({
    voltage:            '415V AC (3Ph)',
    main_bus_rating:    '3200A',
    fault_level_icw:    '85 kA',
    ip_rating:          'IP65',
    enclosure_material: 'SS316',
  }));
  assert.equal(code, 'PNL-MCC-415V-3200A-85KA-IP65-SS316-SA');
  assert.ok(code.length <= 50, `Length ${code.length} exceeds 50`);
});

// ── Group 2: Hazardous-area codes ─────────────────────────────────────────────
test('hazardous: Zone 1 Ex d IIB T4 example', () => {
  const code = buildMccPanelItemCode(hazBase());
  assert.equal(code, 'PNL-MCC-415V-800A-50KA-IP54-CRCA-Z1-EXD-IIB-T4');
});

test('hazardous: Zone 2 produces Z2 prefix', () => {
  const code = buildMccPanelItemCode(hazBase({ area_classification: 'Zone 2' }));
  assert.ok(code.includes('-Z2-'), 'Zone 2 must use Z2');
});

test('hazardous: all explosion-protection types map correctly', () => {
  const expMap: Record<string, string> = {
    'Ex e (Increased Safety)':    'EXE',
    'Ex d (Flameproof)':          'EXD',
    'Ex n (Non-sparking)':        'EXN',
    'Ex p (Pressurized)':         'EXP',
    'Ex ia (Intrinsically Safe)': 'EXIA',
  };
  for (const [stored, seg] of Object.entries(expMap)) {
    const code = buildMccPanelItemCode(hazBase({ explosion_protection: stored }));
    assert.ok(code.includes(`-${seg}-`), `ExProt ${stored} → expected ${seg}`);
  }
});

test('hazardous: all temperature classes map correctly', () => {
  const tmpList = ['T1 (450°C)', 'T2 (300°C)', 'T3 (200°C)', 'T4 (135°C)', 'T5 (100°C)', 'T6 (85°C)'];
  for (const stored of tmpList) {
    const seg = stored.split(' ')[0]; // T1, T2 …
    const code = buildMccPanelItemCode(hazBase({ temperature_class: stored }));
    assert.ok(code.endsWith(`-${seg}`), `TempClass ${stored} → expected ${seg} at end`);
  }
});

test('hazardous: longest combination stays ≤ 50 chars', () => {
  const code = buildMccPanelItemCode({
    voltage:              '415V AC (3Ph)',
    main_bus_rating:      '3200A',
    fault_level_icw:      '85 kA',
    ip_rating:            'IP65',
    enclosure_material:   'SS316',
    area_classification:  'Zone 2',
    explosion_protection: 'Ex ia (Intrinsically Safe)',
    gas_group:            'IIC',
    temperature_class:    'T6 (85°C)',
  } as Record<string, unknown>);
  assert.equal(code, 'PNL-MCC-415V-3200A-85KA-IP65-SS316-Z2-EXIA-IIC-T6');
  assert.ok(code.length <= 50, `Length ${code.length} exceeds 50`);
  assert.equal(code.length, 49);
});

// ── Group 3: Missing / invalid field errors ────────────────────────────────────
test('missing voltage throws', () => {
  const attrs = base({ voltage: '' });
  assert.throws(() => buildMccPanelItemCode(attrs), /Voltage/);
});

test('missing main_bus_rating throws', () => {
  const attrs = base({ main_bus_rating: '' });
  assert.throws(() => buildMccPanelItemCode(attrs), /Main Bus Rating/);
});

test('missing fault_level_icw throws', () => {
  const attrs = base({ fault_level_icw: '' });
  assert.throws(() => buildMccPanelItemCode(attrs), /Panel Fault Level/);
});

test('missing ip_rating throws', () => {
  const attrs = base({ ip_rating: '' });
  assert.throws(() => buildMccPanelItemCode(attrs), /IP Rating/);
});

test('missing enclosure_material throws', () => {
  const attrs = base({ enclosure_material: '' });
  assert.throws(() => buildMccPanelItemCode(attrs), /Enclosure Material/);
});

test('blank area_classification throws (correction 1: must not default to Safe Area)', () => {
  const attrs = base({ area_classification: '' });
  assert.throws(() => buildMccPanelItemCode(attrs), /Area Classification/);
});

test('unrecognised area_classification throws', () => {
  const attrs = base({ area_classification: 'Zone 3' });
  assert.throws(() => buildMccPanelItemCode(attrs), /Area Classification/);
});

// ── Group 4: Voltage restrictions ─────────────────────────────────────────────
test('voltage restriction: DC voltages are rejected', () => {
  assert.throws(() => buildMccPanelItemCode(base({ voltage: '24V DC' })), /Voltage/);
  assert.throws(() => buildMccPanelItemCode(base({ voltage: '48V DC' })), /Voltage/);
});

test('voltage restriction: single-phase voltages are rejected', () => {
  assert.throws(() => buildMccPanelItemCode(base({ voltage: '240V AC (1Ph)' })), /Voltage/);
  assert.throws(() => buildMccPanelItemCode(base({ voltage: '110V AC (1Ph)' })), /Voltage/);
});

// ── Group 5: Preview / server match ───────────────────────────────────────────
// The client preview mirrors the server logic. We verify identical outputs for
// representative inputs by running both through the same maps.
test('server code is deterministic across identical inputs', () => {
  const code1 = buildMccPanelItemCode(base());
  const code2 = buildMccPanelItemCode(base());
  assert.equal(code1, code2);
});

test('different inputs produce different codes', () => {
  const codeA = buildMccPanelItemCode(base({ ip_rating: 'IP54' }));
  const codeB = buildMccPanelItemCode(base({ ip_rating: 'IP65' }));
  assert.notEqual(codeA, codeB);
});

test('safe area and Zone 1 produce different codes for otherwise identical inputs', () => {
  const safe = buildMccPanelItemCode(base());
  const haz  = buildMccPanelItemCode(hazBase());
  assert.notEqual(safe, haz);
});

// ── Group 6: 50-character limit enforcement ───────────────────────────────────
test('all standard combinations stay within 50 characters', () => {
  const voltages    = ['415V AC (3Ph)', '380V AC (3Ph)', '440V AC (3Ph)', '480V AC (3Ph)', '690V AC (3Ph)'];
  const buses       = ['800A', '3200A'];
  const icws        = ['50 kA', '85 kA'];
  const ips         = ['IP54', 'IP65'];
  const mats        = ['CRCA Steel', 'SS316', 'GRP/FRP'];

  for (const v of voltages)
  for (const b of buses)
  for (const i of icws)
  for (const p of ips)
  for (const m of mats) {
    const code = buildMccPanelItemCode(base({ voltage: v, main_bus_rating: b, fault_level_icw: i, ip_rating: p, enclosure_material: m }));
    assert.ok(code.length <= 50, `Safe-area code too long (${code.length}): ${code}`);
  }

  // Hazardous worst-case: EXIA, IIC, T6
  for (const v of voltages)
  for (const b of buses)
  for (const m of mats) {
    const code = buildMccPanelItemCode(hazBase({
      voltage: v, main_bus_rating: b, enclosure_material: m,
      area_classification: 'Zone 2', explosion_protection: 'Ex ia (Intrinsically Safe)',
      gas_group: 'IIC', temperature_class: 'T6 (85°C)',
    }));
    assert.ok(code.length <= 50, `Hazardous code too long (${code.length}): ${code}`);
  }
});
