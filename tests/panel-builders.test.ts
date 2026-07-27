/**
 * Panel SAP Item Code builders — unit tests (all types except MCC)
 * Run: npx tsx --test tests/panel-builders.test.ts
 */
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import {
  buildStarterPanelItemCode,
  buildDbPanelItemCode,
  buildPdpPanelItemCode,
  buildAutomationPanelItemCode,
  buildApfcPanelItemCode,
  buildVfdPanelItemCode,
} from '../server/buy-catalog-sap-service';

// ── helpers ───────────────────────────────────────────────────────────────────
const SA  = { area_classification: 'Safe Area' };
const Z1  = { area_classification: 'Zone 1', explosion_protection: 'Ex d (Flameproof)',  gas_group: 'IIB', temperature_class: 'T4 (135°C)' };
const Z2  = { area_classification: 'Zone 2', explosion_protection: 'Ex ia (Intrinsically Safe)', gas_group: 'IIC', temperature_class: 'T6 (85°C)' };

// ══════════════════════════════════════════════════════════════════════════════
// STARTER PANEL
// ══════════════════════════════════════════════════════════════════════════════
describe('Starter Panel', () => {
  function str(o: object = {}) {
    return { voltage:'415V AC (3Ph)', starter_type:'DOL', fault_level_icw:'25 kA', ip_rating:'IP54', enclosure_material:'CRCA Steel', ...SA, ...o };
  }

  test('DOL safe-area canonical', () => {
    assert.equal(buildStarterPanelItemCode(str()), 'PNL-STR-DOL-415V-25KA-IP54-CRCA-SA');
  });
  test('Star-Delta encodes as SD', () => {
    const code = buildStarterPanelItemCode(str({ starter_type: 'Star-Delta' }));
    assert.ok(code.includes('-SD-'));
  });
  test('Soft Starter encodes as SS', () => {
    const code = buildStarterPanelItemCode(str({ starter_type: 'Soft Starter' }));
    assert.ok(code.includes('-SS-'));
  });
  test('Zone 1 hazardous', () => {
    assert.equal(
      buildStarterPanelItemCode(str({ ...Z1 })),
      'PNL-STR-DOL-415V-25KA-IP54-CRCA-Z1-EXD-IIB-T4',
    );
  });
  test('worst-case ≤ 50 chars', () => {
    const code = buildStarterPanelItemCode(str({ voltage:'415V AC (3Ph)', fault_level_icw:'85 kA', ip_rating:'IP65', enclosure_material:'GRP/FRP', ...Z2 }));
    assert.ok(code.length <= 50, `${code.length}: ${code}`);
  });
  test('missing starter_type throws', () => {
    assert.throws(() => buildStarterPanelItemCode(str({ starter_type: '' })), /Starter Type/);
  });
  test('missing fault_level_icw throws', () => {
    assert.throws(() => buildStarterPanelItemCode(str({ fault_level_icw: '' })), /Panel Fault Level/);
  });
  test('blank area throws', () => {
    assert.throws(() => buildStarterPanelItemCode({ ...str(), area_classification: '' }), /Area Classification/);
  });
  test('DC voltage rejected (3-phase only)', () => {
    assert.throws(() => buildStarterPanelItemCode(str({ voltage: '48V DC' })), /System Voltage/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// DISTRIBUTION BOARD
// ══════════════════════════════════════════════════════════════════════════════
describe('Distribution Board', () => {
  function db(o: object = {}) {
    return { voltage:'415V AC (3Ph)', main_bus_rating:'200A', fault_level_icw:'10 kA', ip_rating:'IP42', enclosure_material:'CRCA Steel', ...SA, ...o };
  }

  test('canonical safe-area', () => {
    assert.equal(buildDbPanelItemCode(db()), 'PNL-DB-415V-200A-10KA-IP42-CRCA-SA');
  });
  test('accepts single-phase voltage', () => {
    const code = buildDbPanelItemCode(db({ voltage: '240V AC (1Ph)' }));
    assert.ok(code.startsWith('PNL-DB-240V-'));
  });
  test('accepts 110V AC single-phase', () => {
    const code = buildDbPanelItemCode(db({ voltage: '110V AC (1Ph)' }));
    assert.ok(code.startsWith('PNL-DB-110V-'));
  });
  test('hazardous Zone 2', () => {
    const code = buildDbPanelItemCode(db({ ...Z2 }));
    assert.ok(code.includes('-Z2-EXIA-IIC-T6'));
  });
  test('worst-case ≤ 50 chars', () => {
    const code = buildDbPanelItemCode(db({ voltage:'415V AC (3Ph)', main_bus_rating:'3200A', fault_level_icw:'85 kA', ip_rating:'IP65', enclosure_material:'SS316', ...Z2 }));
    assert.ok(code.length <= 50, `${code.length}: ${code}`);
  });
  test('missing bus rating throws', () => {
    assert.throws(() => buildDbPanelItemCode(db({ main_bus_rating: '' })), /Main Bus Rating/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POWER DISTRIBUTION PANEL
// ══════════════════════════════════════════════════════════════════════════════
describe('Power Distribution Panel', () => {
  function pdp(o: object = {}) {
    return { voltage:'415V AC (3Ph)', main_bus_rating:'2000A', fault_level_icw:'50 kA', ip_rating:'IP54', enclosure_material:'CRCA Steel', ...SA, ...o };
  }

  test('canonical safe-area', () => {
    assert.equal(buildPdpPanelItemCode(pdp()), 'PNL-PDP-415V-2000A-50KA-IP54-CRCA-SA');
  });
  test('worst-case ≤ 50 chars', () => {
    const code = buildPdpPanelItemCode(pdp({ main_bus_rating:'3200A', fault_level_icw:'85 kA', ip_rating:'IP65', enclosure_material:'SS316', ...Z2 }));
    assert.ok(code.length <= 50, `${code.length}: ${code}`);
  });
  test('single-phase voltage rejected (3-phase only)', () => {
    assert.throws(() => buildPdpPanelItemCode(pdp({ voltage: '240V AC (1Ph)' })), /System Voltage/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// AUTOMATION PANELS (PLC / DCS / SCADA / REL)
// ══════════════════════════════════════════════════════════════════════════════
describe('Automation Panels', () => {
  function auto(panelType: string, o: object = {}) {
    return { panel_type: panelType, voltage:'415V AC (3Ph)', ip_rating:'IP54', enclosure_type:'Floor Standing', enclosure_material:'CRCA Steel', ...SA, ...o };
  }

  test('PLC safe-area canonical', () => {
    assert.equal(buildAutomationPanelItemCode(auto('PLC Panel')), 'PNL-PLC-415V-IP54-FS-CRCA-SA');
  });
  test('DCS type code', () => {
    assert.ok(buildAutomationPanelItemCode(auto('DCS Panel')).startsWith('PNL-DCS-'));
  });
  test('SCADA type code', () => {
    assert.ok(buildAutomationPanelItemCode(auto('SCADA Panel')).startsWith('PNL-SCADA-'));
  });
  test('REL type code', () => {
    assert.ok(buildAutomationPanelItemCode(auto('Relay / Protection Panel')).startsWith('PNL-REL-'));
  });
  test('REL accepts 110V DC', () => {
    const code = buildAutomationPanelItemCode(auto('Relay / Protection Panel', { voltage: '110V DC' }));
    assert.ok(code.startsWith('PNL-REL-110VDC-'));
  });
  test('REL accepts 48V DC', () => {
    const code = buildAutomationPanelItemCode(auto('Relay / Protection Panel', { voltage: '48V DC' }));
    assert.ok(code.startsWith('PNL-REL-48VDC-'));
  });
  test('all enclosure types encode correctly', () => {
    const encMap: Record<string,string> = { 'Floor Standing':'FS','Wall Mounted':'WM','Desktop':'DSK','Rack Mounted':'RM' };
    for (const [stored, seg] of Object.entries(encMap)) {
      const code = buildAutomationPanelItemCode(auto('PLC Panel', { enclosure_type: stored }));
      assert.ok(code.includes(`-${seg}-`), `${stored} → expected ${seg}`);
    }
  });
  test('hazardous Zone 1', () => {
    const code = buildAutomationPanelItemCode(auto('PLC Panel', { ...Z1 }));
    assert.ok(code.includes('-Z1-EXD-IIB-T4'));
  });
  test('SCADA worst-case ≤ 50 chars', () => {
    const code = buildAutomationPanelItemCode(auto('SCADA Panel', { ip_rating:'IP65', enclosure_material:'SS316', ...Z2 }));
    assert.ok(code.length <= 50, `${code.length}: ${code}`);
  });
  test('REL 110VDC worst-case ≤ 50 chars', () => {
    const code = buildAutomationPanelItemCode(auto('Relay / Protection Panel', { voltage:'110V DC', ip_rating:'IP65', enclosure_material:'SS316', ...Z2 }));
    assert.ok(code.length <= 50, `${code.length}: ${code}`);
  });
  test('missing enclosure_type throws', () => {
    assert.throws(() => buildAutomationPanelItemCode(auto('PLC Panel', { enclosure_type: '' })), /Enclosure Type/);
  });
  test('unknown panel type throws', () => {
    assert.throws(() => buildAutomationPanelItemCode(auto('Custom Panel')), /Panel Type/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// APFC PANEL
// ══════════════════════════════════════════════════════════════════════════════
describe('APFC Panel', () => {
  function apfc(o: object = {}) {
    return { voltage:'415V AC (3Ph)', kvar_rating:'100 kVAr', ip_rating:'IP54', enclosure_material:'CRCA Steel', ...SA, ...o };
  }

  test('canonical safe-area', () => {
    assert.equal(buildApfcPanelItemCode(apfc()), 'PNL-APFC-415V-100KVAR-IP54-CRCA-SA');
  });
  test('all kVAr values encode correctly', () => {
    const kvarList = ['25','50','75','100','150','200','250','300','400','500','750','1000'];
    for (const kv of kvarList) {
      const code = buildApfcPanelItemCode(apfc({ kvar_rating: `${kv} kVAr` }));
      assert.ok(code.includes(`-${kv}KVAR-`), `${kv} kVAr → ${kv}KVAR`);
    }
  });
  test('worst-case 1000 kVAr hazardous ≤ 50 chars', () => {
    const code = buildApfcPanelItemCode(apfc({ kvar_rating:'1000 kVAr', ip_rating:'IP65', enclosure_material:'SS316', ...Z2 }));
    assert.ok(code.length <= 50, `${code.length}: ${code}`);
    assert.equal(code, 'PNL-APFC-415V-1000KVAR-IP65-SS316-Z2-EXIA-IIC-T6');
  });
  test('DC voltage rejected (3-phase only)', () => {
    assert.throws(() => buildApfcPanelItemCode(apfc({ voltage: '48V DC' })), /System Voltage/);
  });
  test('missing kvar_rating throws', () => {
    assert.throws(() => buildApfcPanelItemCode(apfc({ kvar_rating: '' })), /kVAr Rating/);
  });
  test('invalid kvar value throws', () => {
    assert.throws(() => buildApfcPanelItemCode(apfc({ kvar_rating: '999 kVAr' })), /kVAr Rating/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// VFD PANEL
// ══════════════════════════════════════════════════════════════════════════════
describe('VFD Panel', () => {
  function vfd(o: object = {}) {
    return { voltage:'415V AC (3Ph)', drive_power_kw:'110 kW', ip_rating:'IP54', enclosure_material:'CRCA Steel', bypass_arrangement:'None', ...SA, ...o };
  }

  test('canonical safe-area no-bypass', () => {
    assert.equal(buildVfdPanelItemCode(vfd()), 'PNL-VFD-415V-110KW-IP54-CRCA-NBY-SA');
  });
  test('mechanical bypass encodes as MBY', () => {
    const code = buildVfdPanelItemCode(vfd({ bypass_arrangement: 'Mechanical Bypass' }));
    assert.ok(code.includes('-MBY-'));
  });
  test('electronic bypass encodes as EBY', () => {
    const code = buildVfdPanelItemCode(vfd({ bypass_arrangement: 'Electronic Bypass' }));
    assert.ok(code.includes('-EBY-'));
  });
  test('all drive kW values encode correctly', () => {
    const kwList = ['11','15','22','30','37','45','55','75','90','110','132','160','200','250','315','400','500','630','800','1000'];
    for (const kw of kwList) {
      const code = buildVfdPanelItemCode(vfd({ drive_power_kw: `${kw} kW` }));
      assert.ok(code.includes(`-${kw}KW-`), `${kw} kW → ${kw}KW`);
    }
  });
  test('hazardous Zone 2', () => {
    const code = buildVfdPanelItemCode(vfd({ ...Z2, bypass_arrangement: 'Electronic Bypass' }));
    assert.ok(code.includes('-Z2-EXIA-IIC-T6'));
  });
  test('worst-case 1000 kW EBY Zone 2 ≤ 50 chars', () => {
    const code = buildVfdPanelItemCode(vfd({ drive_power_kw:'1000 kW', ip_rating:'IP65', enclosure_material:'SS316', bypass_arrangement:'Electronic Bypass', ...Z2 }));
    assert.ok(code.length <= 50, `${code.length}: ${code}`);
    assert.equal(code, 'PNL-VFD-415V-1000KW-IP65-SS316-EBY-Z2-EXIA-IIC-T6');
  });
  test('DC voltage rejected', () => {
    assert.throws(() => buildVfdPanelItemCode(vfd({ voltage: '48V DC' })), /System Voltage/);
  });
  test('single-phase voltage rejected', () => {
    assert.throws(() => buildVfdPanelItemCode(vfd({ voltage: '240V AC (1Ph)' })), /System Voltage/);
  });
  test('missing drive_power_kw throws', () => {
    assert.throws(() => buildVfdPanelItemCode(vfd({ drive_power_kw: '' })), /Drive Power/);
  });
  test('invalid drive kW throws', () => {
    assert.throws(() => buildVfdPanelItemCode(vfd({ drive_power_kw: '100 kW' })), /Drive Power/);
  });
  test('missing bypass throws', () => {
    assert.throws(() => buildVfdPanelItemCode(vfd({ bypass_arrangement: '' })), /Bypass/);
  });
  test('blank area throws', () => {
    assert.throws(() => buildVfdPanelItemCode({ ...vfd(), area_classification: '' }), /Area Classification/);
  });
  test('all standard combinations ≤ 50 chars', () => {
    const volts   = ['415V AC (3Ph)', '380V AC (3Ph)', '690V AC (3Ph)'];
    const drives  = ['110 kW', '1000 kW'];
    const ips     = ['IP54', 'IP65'];
    const mats    = ['CRCA Steel', 'SS316', 'GRP/FRP'];
    const bypasses= ['None', 'Mechanical Bypass', 'Electronic Bypass'];
    for (const v of volts) for (const d of drives) for (const p of ips)
    for (const m of mats) for (const b of bypasses) {
      const code = buildVfdPanelItemCode(vfd({ voltage:v, drive_power_kw:d, ip_rating:p, enclosure_material:m, bypass_arrangement:b, ...Z2 }));
      assert.ok(code.length <= 50, `${code.length}: ${code}`);
    }
  });
});
