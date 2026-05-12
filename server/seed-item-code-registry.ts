import { db } from './db';
import { sql } from 'drizzle-orm';

// Baseline v1.3 — Item Code Registry Seed
// All GROUP, UNIT, SEG4, SEG5, SUBGROUP, and TYPE codes.
// scopeGroup='' and scopeSubgroup='' denote global scope entries.

type RegistryEntry = {
  registryType: string;
  scopeGroup: string;
  scopeSubgroup: string;
  entityKey: string;
  abbr: string;
  label: string;
  sortOrder: number;
};

const REGISTRY: RegistryEntry[] = [

  // ─────────────────────────────────────────────────
  // GROUPs  (registryType='group', scope='')
  // ─────────────────────────────────────────────────
  { registryType: 'group', scopeGroup: '', scopeSubgroup: '', entityKey: 'pumps',  abbr: 'PUMPS', label: 'Pumps',                   sortOrder: 10 },
  { registryType: 'group', scopeGroup: '', scopeSubgroup: '', entityKey: 'valve',  abbr: 'VALVE', label: 'Valves',                  sortOrder: 20 },
  { registryType: 'group', scopeGroup: '', scopeSubgroup: '', entityKey: 'motor',  abbr: 'MOTOR', label: 'Motors',                  sortOrder: 30 },
  { registryType: 'group', scopeGroup: '', scopeSubgroup: '', entityKey: 'instr',  abbr: 'INSTR', label: 'Instruments',             sortOrder: 40 },
  { registryType: 'group', scopeGroup: '', scopeSubgroup: '', entityKey: 'elect',  abbr: 'ELECT', label: 'Electrical & Control',    sortOrder: 50 },
  { registryType: 'group', scopeGroup: '', scopeSubgroup: '', entityKey: 'bopkg',  abbr: 'BOPKG', label: 'Bought-out Packages',     sortOrder: 60 },
  { registryType: 'group', scopeGroup: '', scopeSubgroup: '', entityKey: 'plate',  abbr: 'PLATE', label: 'Plates',                  sortOrder: 70 },
  { registryType: 'group', scopeGroup: '', scopeSubgroup: '', entityKey: 'pipes',  abbr: 'PIPES', label: 'Pipes',                   sortOrder: 80 },
  { registryType: 'group', scopeGroup: '', scopeSubgroup: '', entityKey: 'fitng',  abbr: 'FITNG', label: 'Fittings',                sortOrder: 90 },
  { registryType: 'group', scopeGroup: '', scopeSubgroup: '', entityKey: 'flang',  abbr: 'FLANG', label: 'Flanges',                 sortOrder: 100 },
  { registryType: 'group', scopeGroup: '', scopeSubgroup: '', entityKey: 'fastn',  abbr: 'FASTN', label: 'Fasteners',               sortOrder: 110 },
  { registryType: 'group', scopeGroup: '', scopeSubgroup: '', entityKey: 'gaskt',  abbr: 'GASKT', label: 'Gaskets',                 sortOrder: 120 },
  { registryType: 'group', scopeGroup: '', scopeSubgroup: '', entityKey: 'steel',  abbr: 'STEEL', label: 'Structural Steel',        sortOrder: 130 },

  // ─────────────────────────────────────────────────
  // UNITs  (registryType='unit', scope='')
  // ─────────────────────────────────────────────────
  { registryType: 'unit', scopeGroup: '', scopeSubgroup: '', entityKey: 'lph',  abbr: 'LPH',  label: 'LPH',   sortOrder: 10 },
  { registryType: 'unit', scopeGroup: '', scopeSubgroup: '', entityKey: 'm3h',  abbr: 'M3H',  label: 'm³/hr', sortOrder: 20 },
  { registryType: 'unit', scopeGroup: '', scopeSubgroup: '', entityKey: 'lpm',  abbr: 'LPM',  label: 'LPM',   sortOrder: 30 },
  { registryType: 'unit', scopeGroup: '', scopeSubgroup: '', entityKey: 'kw',   abbr: 'KW',   label: 'kW',    sortOrder: 40 },
  { registryType: 'unit', scopeGroup: '', scopeSubgroup: '', entityKey: 'nb',   abbr: 'NB',   label: 'NB',    sortOrder: 50 },
  { registryType: 'unit', scopeGroup: '', scopeSubgroup: '', entityKey: 'bar',  abbr: 'BAR',  label: 'Bar',   sortOrder: 60 },
  { registryType: 'unit', scopeGroup: '', scopeSubgroup: '', entityKey: 'dgc',  abbr: 'DGC',  label: '°C',    sortOrder: 70 },
  { registryType: 'unit', scopeGroup: '', scopeSubgroup: '', entityKey: 'mm',   abbr: 'MM',   label: 'mm',    sortOrder: 80 },
  { registryType: 'unit', scopeGroup: '', scopeSubgroup: '', entityKey: 'mm2',  abbr: 'MM2',  label: 'mm²',   sortOrder: 90 },
  { registryType: 'unit', scopeGroup: '', scopeSubgroup: '', entityKey: 'amp',  abbr: 'AMP',  label: 'A',     sortOrder: 100 },
  { registryType: 'unit', scopeGroup: '', scopeSubgroup: '', entityKey: 'v',    abbr: 'V',    label: 'V',     sortOrder: 110 },
  { registryType: 'unit', scopeGroup: '', scopeSubgroup: '', entityKey: 'tr',   abbr: 'TR',   label: 'TR',    sortOrder: 120 },
  { registryType: 'unit', scopeGroup: '', scopeSubgroup: '', entityKey: 'in',   abbr: 'IN',   label: 'in',    sortOrder: 130 },
  { registryType: 'unit', scopeGroup: '', scopeSubgroup: '', entityKey: 'na',   abbr: 'NA',   label: 'NA',    sortOrder: 999 },

  // ─────────────────────────────────────────────────
  // VALVE SUBGROUPs
  // ─────────────────────────────────────────────────
  { registryType: 'subgroup', scopeGroup: 'VALVE', scopeSubgroup: '', entityKey: 'iso', abbr: 'ISO', label: 'Isolation',    sortOrder: 10 },
  { registryType: 'subgroup', scopeGroup: 'VALVE', scopeSubgroup: '', entityKey: 'ctl', abbr: 'CTL', label: 'Control',      sortOrder: 20 },
  { registryType: 'subgroup', scopeGroup: 'VALVE', scopeSubgroup: '', entityKey: 'saf', abbr: 'SAF', label: 'Safety',       sortOrder: 30 },
  { registryType: 'subgroup', scopeGroup: 'VALVE', scopeSubgroup: '', entityKey: 'chk', abbr: 'CHK', label: 'Check',        sortOrder: 40 },
  { registryType: 'subgroup', scopeGroup: 'VALVE', scopeSubgroup: '', entityKey: 'ndl', abbr: 'NDL', label: 'Needle',       sortOrder: 50 },

  // VALVE-ISO TYPEs
  { registryType: 'type', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: 'bal', abbr: 'BAL', label: 'Ball Valve',       sortOrder: 10 },
  { registryType: 'type', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: 'gtd', abbr: 'GTD', label: 'Gate Valve',       sortOrder: 20 },
  { registryType: 'type', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: 'glb', abbr: 'GLB', label: 'Globe Valve',      sortOrder: 30 },
  { registryType: 'type', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: 'btf', abbr: 'BTF', label: 'Butterfly Valve',  sortOrder: 40 },
  { registryType: 'type', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: 'plg', abbr: 'PLG', label: 'Plug Valve',       sortOrder: 50 },

  // VALVE-ISO SEG4 — Combined Pressure Class + End Connection (4 chars each)
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: '150f', abbr: '150F', label: 'ANSI 150 Flanged',    sortOrder: 10 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: '150t', abbr: '150T', label: 'ANSI 150 Threaded',   sortOrder: 20 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: '150s', abbr: '150S', label: 'ANSI 150 SW',         sortOrder: 30 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: '150b', abbr: '150B', label: 'ANSI 150 BW',         sortOrder: 40 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: '150w', abbr: '150W', label: 'ANSI 150 Wafer',      sortOrder: 50 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: '150l', abbr: '150L', label: 'ANSI 150 Lug',        sortOrder: 60 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: '300f', abbr: '300F', label: 'ANSI 300 Flanged',    sortOrder: 70 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: '300t', abbr: '300T', label: 'ANSI 300 Threaded',   sortOrder: 80 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: '300s', abbr: '300S', label: 'ANSI 300 SW',         sortOrder: 90 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: '300b', abbr: '300B', label: 'ANSI 300 BW',         sortOrder: 100 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: '300w', abbr: '300W', label: 'ANSI 300 Wafer',      sortOrder: 110 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: '600f', abbr: '600F', label: 'ANSI 600 Flanged',    sortOrder: 120 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: '600s', abbr: '600S', label: 'ANSI 600 SW',         sortOrder: 130 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: '600b', abbr: '600B', label: 'ANSI 600 BW',         sortOrder: 140 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: '900f', abbr: '900F', label: 'ANSI 900 Flanged',    sortOrder: 150 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: '900b', abbr: '900B', label: 'ANSI 900 BW',         sortOrder: 160 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: 'p16f', abbr: 'P16F', label: 'PN16 Flanged',        sortOrder: 170 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: 'p40f', abbr: 'P40F', label: 'PN40 Flanged',        sortOrder: 180 },

  // VALVE-ISO SEG5 — Body MOC
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: 'cs',  abbr: 'CS',  label: 'CS Body',                sortOrder: 10 },
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: 'ss3', abbr: 'SS3', label: 'SS316 Body',             sortOrder: 20 },
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: 'ss4', abbr: 'SS4', label: 'SS304 Body',             sortOrder: 30 },
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: 'dss', abbr: 'DSS', label: 'Duplex SS Body',         sortOrder: 40 },
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: 'a20', abbr: 'A20', label: 'Alloy 20 Body',          sortOrder: 50 },
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: 'gci', abbr: 'GCI', label: 'Grey Cast Iron Body',    sortOrder: 60 },
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: 'dci', abbr: 'DCI', label: 'Ductile Cast Iron Body', sortOrder: 70 },
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'ISO', entityKey: 'hac', abbr: 'HAC', label: 'Hastelloy C-276 Body',   sortOrder: 80 },

  // VALVE-CTL TYPEs
  { registryType: 'type', scopeGroup: 'VALVE', scopeSubgroup: 'CTL', entityKey: 'glb', abbr: 'GLB', label: 'Globe Control Valve',     sortOrder: 10 },
  { registryType: 'type', scopeGroup: 'VALVE', scopeSubgroup: 'CTL', entityKey: 'rot', abbr: 'ROT', label: 'Rotary Control Valve',    sortOrder: 20 },
  { registryType: 'type', scopeGroup: 'VALVE', scopeSubgroup: 'CTL', entityKey: 'btf', abbr: 'BTF', label: 'Butterfly Control Valve', sortOrder: 30 },
  { registryType: 'type', scopeGroup: 'VALVE', scopeSubgroup: 'CTL', entityKey: 'bal', abbr: 'BAL', label: 'Ball Control Valve',      sortOrder: 40 },

  // VALVE-CTL SEG4 — Body MOC
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'CTL', entityKey: 'cs',  abbr: 'CS',  label: 'CS Body',              sortOrder: 10 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'CTL', entityKey: 'ss3', abbr: 'SS3', label: 'SS316 Body',           sortOrder: 20 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'CTL', entityKey: 'ss4', abbr: 'SS4', label: 'SS304 Body',           sortOrder: 30 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'CTL', entityKey: 'dss', abbr: 'DSS', label: 'Duplex SS Body',       sortOrder: 40 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'CTL', entityKey: 'a20', abbr: 'A20', label: 'Alloy 20 Body',        sortOrder: 50 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'CTL', entityKey: 'gci', abbr: 'GCI', label: 'Grey Cast Iron Body',  sortOrder: 60 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'CTL', entityKey: 'hac', abbr: 'HAC', label: 'Hastelloy C-276 Body', sortOrder: 70 },

  // VALVE-CTL SEG5 — Trim MOC
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'CTL', entityKey: 'ss3', abbr: 'SS3', label: 'SS316 Trim',           sortOrder: 10 },
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'CTL', entityKey: 'a20', abbr: 'A20', label: 'Alloy 20 Trim',        sortOrder: 20 },
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'CTL', entityKey: 'als', abbr: 'ALS', label: 'Alloy Steel Trim',     sortOrder: 30 },
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'CTL', entityKey: 'stl', abbr: 'STL', label: 'Stellite Trim',        sortOrder: 40 },
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'CTL', entityKey: 'hac', abbr: 'HAC', label: 'Hastelloy C-276 Trim', sortOrder: 50 },
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'CTL', entityKey: 'na',  abbr: 'NA',  label: '',                     sortOrder: 99 },

  // VALVE-SAF TYPEs
  { registryType: 'type', scopeGroup: 'VALVE', scopeSubgroup: 'SAF', entityKey: 'spl', abbr: 'SPL', label: 'Safety Valve', sortOrder: 10 },

  // VALVE-SAF SEG4 — Body MOC
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'SAF', entityKey: 'cs',  abbr: 'CS',  label: 'CS Body',        sortOrder: 10 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'SAF', entityKey: 'ss3', abbr: 'SS3', label: 'SS316 Body',     sortOrder: 20 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'SAF', entityKey: 'ss4', abbr: 'SS4', label: 'SS304 Body',     sortOrder: 30 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'SAF', entityKey: 'dss', abbr: 'DSS', label: 'Duplex SS Body', sortOrder: 40 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'SAF', entityKey: 'a20', abbr: 'A20', label: 'Alloy 20 Body',  sortOrder: 50 },

  // VALVE-SAF SEG5 — Inlet Connection
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'SAF', entityKey: 'flg', abbr: 'FLG', label: 'Flanged Inlet',  sortOrder: 10 },
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'SAF', entityKey: 'thd', abbr: 'THD', label: 'Threaded Inlet', sortOrder: 20 },

  // VALVE-CHK TYPEs
  { registryType: 'type', scopeGroup: 'VALVE', scopeSubgroup: 'CHK', entityKey: 'swg', abbr: 'SWG', label: 'Swing Check Valve',       sortOrder: 10 },
  { registryType: 'type', scopeGroup: 'VALVE', scopeSubgroup: 'CHK', entityKey: 'dul', abbr: 'DUL', label: 'Dual Plate Check Valve',  sortOrder: 20 },
  { registryType: 'type', scopeGroup: 'VALVE', scopeSubgroup: 'CHK', entityKey: 'lft', abbr: 'LFT', label: 'Lift Check Valve',        sortOrder: 30 },

  // VALVE-CHK SEG4 — Combined Pressure Class + End Connection
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'CHK', entityKey: '150f', abbr: '150F', label: 'ANSI 150 Flanged', sortOrder: 10 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'CHK', entityKey: '150w', abbr: '150W', label: 'ANSI 150 Wafer',   sortOrder: 20 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'CHK', entityKey: '150t', abbr: '150T', label: 'ANSI 150 Threaded',sortOrder: 30 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'CHK', entityKey: '150s', abbr: '150S', label: 'ANSI 150 SW',      sortOrder: 40 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'CHK', entityKey: '300f', abbr: '300F', label: 'ANSI 300 Flanged', sortOrder: 50 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'CHK', entityKey: '300w', abbr: '300W', label: 'ANSI 300 Wafer',   sortOrder: 60 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'CHK', entityKey: '600f', abbr: '600F', label: 'ANSI 600 Flanged', sortOrder: 70 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'CHK', entityKey: '600b', abbr: '600B', label: 'ANSI 600 BW',      sortOrder: 80 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'CHK', entityKey: '900f', abbr: '900F', label: 'ANSI 900 Flanged', sortOrder: 90 },

  // VALVE-CHK SEG5 — Body MOC
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'CHK', entityKey: 'cs',  abbr: 'CS',  label: 'CS Body',        sortOrder: 10 },
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'CHK', entityKey: 'ss3', abbr: 'SS3', label: 'SS316 Body',     sortOrder: 20 },
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'CHK', entityKey: 'ss4', abbr: 'SS4', label: 'SS304 Body',     sortOrder: 30 },
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'CHK', entityKey: 'dss', abbr: 'DSS', label: 'Duplex SS Body', sortOrder: 40 },
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'CHK', entityKey: 'a20', abbr: 'A20', label: 'Alloy 20 Body',  sortOrder: 50 },
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'CHK', entityKey: 'gci', abbr: 'GCI', label: 'Cast Iron Body', sortOrder: 60 },

  // VALVE-NDL TYPEs
  { registryType: 'type', scopeGroup: 'VALVE', scopeSubgroup: 'NDL', entityKey: 'na', abbr: 'NA', label: 'Needle Valve', sortOrder: 10 },

  // VALVE-NDL SEG4 — Body MOC
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'NDL', entityKey: 'ss3', abbr: 'SS3', label: 'SS316 Body',           sortOrder: 10 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'NDL', entityKey: 'cs',  abbr: 'CS',  label: 'CS Body',              sortOrder: 20 },
  { registryType: 'seg4', scopeGroup: 'VALVE', scopeSubgroup: 'NDL', entityKey: 'hac', abbr: 'HAC', label: 'Hastelloy C-276 Body', sortOrder: 30 },

  // VALVE-NDL SEG5 — End Connection
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'NDL', entityKey: 'npt', abbr: 'NPT', label: 'NPT Threaded', sortOrder: 10 },
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'NDL', entityKey: 'sw',  abbr: 'SW',  label: 'Socket Weld',  sortOrder: 20 },
  { registryType: 'seg5', scopeGroup: 'VALVE', scopeSubgroup: 'NDL', entityKey: 'flg', abbr: 'FLG', label: 'Flanged',      sortOrder: 30 },

  // ─────────────────────────────────────────────────
  // PUMPS SUBGROUPs
  // ─────────────────────────────────────────────────
  { registryType: 'subgroup', scopeGroup: 'PUMPS', scopeSubgroup: '', entityKey: 'cen', abbr: 'CEN', label: 'Centrifugal', sortOrder: 10 },
  { registryType: 'subgroup', scopeGroup: 'PUMPS', scopeSubgroup: '', entityKey: 'dos', abbr: 'DOS', label: 'Dosing',      sortOrder: 20 },
  { registryType: 'subgroup', scopeGroup: 'PUMPS', scopeSubgroup: '', entityKey: 'gea', abbr: 'GEA', label: 'Gear',        sortOrder: 30 },
  { registryType: 'subgroup', scopeGroup: 'PUMPS', scopeSubgroup: '', entityKey: 'scr', abbr: 'SCR', label: 'Screw',       sortOrder: 40 },
  { registryType: 'subgroup', scopeGroup: 'PUMPS', scopeSubgroup: '', entityKey: 'hnd', abbr: 'HND', label: 'Hand',        sortOrder: 50 },

  // PUMPS-CEN TYPEs
  { registryType: 'type', scopeGroup: 'PUMPS', scopeSubgroup: 'CEN', entityKey: 'hor', abbr: 'HOR', label: 'Centrifugal Pump, Horizontal', sortOrder: 10 },
  { registryType: 'type', scopeGroup: 'PUMPS', scopeSubgroup: 'CEN', entityKey: 'vtl', abbr: 'VTL', label: 'Centrifugal Pump, Vertical',   sortOrder: 20 },
  { registryType: 'type', scopeGroup: 'PUMPS', scopeSubgroup: 'CEN', entityKey: 'mst', abbr: 'MST', label: 'Centrifugal Pump, Multistage', sortOrder: 30 },
  { registryType: 'type', scopeGroup: 'PUMPS', scopeSubgroup: 'CEN', entityKey: 'sub', abbr: 'SUB', label: 'Centrifugal Pump, Submersible',sortOrder: 40 },

  // PUMPS-CEN SEG4 — Wetted MOC
  { registryType: 'seg4', scopeGroup: 'PUMPS', scopeSubgroup: 'CEN', entityKey: 'cs',  abbr: 'CS',  label: 'CS Wetted',              sortOrder: 10 },
  { registryType: 'seg4', scopeGroup: 'PUMPS', scopeSubgroup: 'CEN', entityKey: 'ss3', abbr: 'SS3', label: 'SS316 Wetted',           sortOrder: 20 },
  { registryType: 'seg4', scopeGroup: 'PUMPS', scopeSubgroup: 'CEN', entityKey: 'ss4', abbr: 'SS4', label: 'SS304 Wetted',           sortOrder: 30 },
  { registryType: 'seg4', scopeGroup: 'PUMPS', scopeSubgroup: 'CEN', entityKey: 'dss', abbr: 'DSS', label: 'Duplex SS Wetted',       sortOrder: 40 },
  { registryType: 'seg4', scopeGroup: 'PUMPS', scopeSubgroup: 'CEN', entityKey: 'a20', abbr: 'A20', label: 'Alloy 20 Wetted',        sortOrder: 50 },
  { registryType: 'seg4', scopeGroup: 'PUMPS', scopeSubgroup: 'CEN', entityKey: 'ci',  abbr: 'CI',  label: 'Cast Iron Wetted',       sortOrder: 60 },
  { registryType: 'seg4', scopeGroup: 'PUMPS', scopeSubgroup: 'CEN', entityKey: 'hac', abbr: 'HAC', label: 'Hastelloy C-276 Wetted', sortOrder: 70 },

  // PUMPS-CEN SEG5 — Seal Type
  { registryType: 'seg5', scopeGroup: 'PUMPS', scopeSubgroup: 'CEN', entityKey: 'ms',  abbr: 'MS',  label: 'Mech Seal',     sortOrder: 10 },
  { registryType: 'seg5', scopeGroup: 'PUMPS', scopeSubgroup: 'CEN', entityKey: 'gp',  abbr: 'GP',  label: 'Gland Packing', sortOrder: 20 },
  { registryType: 'seg5', scopeGroup: 'PUMPS', scopeSubgroup: 'CEN', entityKey: 'mag', abbr: 'MAG', label: 'Mag Drive',      sortOrder: 30 },

  // PUMPS-DOS TYPEs
  { registryType: 'type', scopeGroup: 'PUMPS', scopeSubgroup: 'DOS', entityKey: 'dph', abbr: 'DPH', label: 'Dosing Pump, Diaphragm', sortOrder: 10 },
  { registryType: 'type', scopeGroup: 'PUMPS', scopeSubgroup: 'DOS', entityKey: 'pln', abbr: 'PLN', label: 'Dosing Pump, Plunger',   sortOrder: 20 },

  // PUMPS-DOS SEG4 — Head/Wetted MOC
  { registryType: 'seg4', scopeGroup: 'PUMPS', scopeSubgroup: 'DOS', entityKey: 'ss3',  abbr: 'SS3',  label: 'SS316 Head',           sortOrder: 10 },
  { registryType: 'seg4', scopeGroup: 'PUMPS', scopeSubgroup: 'DOS', entityKey: 'pvdf', abbr: 'PVDF', label: 'PVDF Head',             sortOrder: 20 },
  { registryType: 'seg4', scopeGroup: 'PUMPS', scopeSubgroup: 'DOS', entityKey: 'pp',   abbr: 'PP',   label: 'PP Head',               sortOrder: 30 },
  { registryType: 'seg4', scopeGroup: 'PUMPS', scopeSubgroup: 'DOS', entityKey: 'hac',  abbr: 'HAC',  label: 'Hastelloy C-276 Head',  sortOrder: 40 },

  // PUMPS-DOS SEG5 — Diaphragm MOC
  { registryType: 'seg5', scopeGroup: 'PUMPS', scopeSubgroup: 'DOS', entityKey: 'ptfe', abbr: 'PTFE', label: 'PTFE Diaphragm',    sortOrder: 10 },
  { registryType: 'seg5', scopeGroup: 'PUMPS', scopeSubgroup: 'DOS', entityKey: 'pvdf', abbr: 'PVDF', label: 'PVDF Diaphragm',    sortOrder: 20 },
  { registryType: 'seg5', scopeGroup: 'PUMPS', scopeSubgroup: 'DOS', entityKey: 'epd',  abbr: 'EPD',  label: 'EPDM Diaphragm',    sortOrder: 30 },
  { registryType: 'seg5', scopeGroup: 'PUMPS', scopeSubgroup: 'DOS', entityKey: 'hyp',  abbr: 'HYP',  label: 'Hypalon Diaphragm', sortOrder: 40 },
  { registryType: 'seg5', scopeGroup: 'PUMPS', scopeSubgroup: 'DOS', entityKey: 'na',   abbr: 'NA',   label: '',                  sortOrder: 99 },

  // PUMPS-GEA/SCR/HND — TYPE + SEG4 (Wetted MOC) + SEG5 (NA)
  { registryType: 'type', scopeGroup: 'PUMPS', scopeSubgroup: 'GEA', entityKey: 'na', abbr: 'NA', label: 'Gear Pump',  sortOrder: 10 },
  { registryType: 'type', scopeGroup: 'PUMPS', scopeSubgroup: 'SCR', entityKey: 'na', abbr: 'NA', label: 'Screw Pump', sortOrder: 10 },
  { registryType: 'type', scopeGroup: 'PUMPS', scopeSubgroup: 'HND', entityKey: 'na', abbr: 'NA', label: 'Hand Pump',  sortOrder: 10 },

  ...(['GEA', 'SCR', 'HND'] as const).flatMap(sg => [
    { registryType: 'seg4', scopeGroup: 'PUMPS', scopeSubgroup: sg, entityKey: 'cs',  abbr: 'CS',  label: 'CS Wetted',        sortOrder: 10 },
    { registryType: 'seg4', scopeGroup: 'PUMPS', scopeSubgroup: sg, entityKey: 'ss3', abbr: 'SS3', label: 'SS316 Wetted',     sortOrder: 20 },
    { registryType: 'seg4', scopeGroup: 'PUMPS', scopeSubgroup: sg, entityKey: 'ci',  abbr: 'CI',  label: 'Cast Iron Wetted', sortOrder: 30 },
    { registryType: 'seg4', scopeGroup: 'PUMPS', scopeSubgroup: sg, entityKey: 'a20', abbr: 'A20', label: 'Alloy 20 Wetted',  sortOrder: 40 },
    { registryType: 'seg5', scopeGroup: 'PUMPS', scopeSubgroup: sg, entityKey: 'na',  abbr: 'NA',  label: '',                 sortOrder: 10 },
  ]),

  // ─────────────────────────────────────────────────
  // MOTOR SUBGROUPs
  // ─────────────────────────────────────────────────
  { registryType: 'subgroup', scopeGroup: 'MOTOR', scopeSubgroup: '', entityKey: 'flp', abbr: 'FLP', label: 'Flameproof',     sortOrder: 10 },
  { registryType: 'subgroup', scopeGroup: 'MOTOR', scopeSubgroup: '', entityKey: 'nfp', abbr: 'NFP', label: 'Non-Flameproof', sortOrder: 20 },

  // MOTOR TYPEs
  { registryType: 'type', scopeGroup: 'MOTOR', scopeSubgroup: 'FLP', entityKey: 'aci', abbr: 'ACI', label: 'Flameproof Motor, AC Induction',     sortOrder: 10 },
  { registryType: 'type', scopeGroup: 'MOTOR', scopeSubgroup: 'NFP', entityKey: 'aci', abbr: 'ACI', label: 'Non-Flameproof Motor, AC Induction', sortOrder: 10 },

  // MOTOR SEG4 — Voltage Class (shared FLP + NFP)
  ...(['FLP', 'NFP'] as const).flatMap(sg => [
    { registryType: 'seg4', scopeGroup: 'MOTOR', scopeSubgroup: sg, entityKey: 'lv',   abbr: 'LV',   label: '415V',   sortOrder: 10 },
    { registryType: 'seg4', scopeGroup: 'MOTOR', scopeSubgroup: sg, entityKey: 'mv6',  abbr: 'MV6',  label: '6.6 kV', sortOrder: 20 },
    { registryType: 'seg4', scopeGroup: 'MOTOR', scopeSubgroup: sg, entityKey: 'mv11', abbr: 'MV11', label: '11 kV',  sortOrder: 30 },
  ]),

  // MOTOR SEG5 — Pole Count (shared FLP + NFP)
  ...(['FLP', 'NFP'] as const).flatMap(sg => [
    { registryType: 'seg5', scopeGroup: 'MOTOR', scopeSubgroup: sg, entityKey: '2p', abbr: '2P', label: '2-Pole', sortOrder: 10 },
    { registryType: 'seg5', scopeGroup: 'MOTOR', scopeSubgroup: sg, entityKey: '4p', abbr: '4P', label: '4-Pole', sortOrder: 20 },
    { registryType: 'seg5', scopeGroup: 'MOTOR', scopeSubgroup: sg, entityKey: '6p', abbr: '6P', label: '6-Pole', sortOrder: 30 },
    { registryType: 'seg5', scopeGroup: 'MOTOR', scopeSubgroup: sg, entityKey: '8p', abbr: '8P', label: '8-Pole', sortOrder: 40 },
  ]),

  // ─────────────────────────────────────────────────
  // INSTR SUBGROUPs
  // ─────────────────────────────────────────────────
  { registryType: 'subgroup', scopeGroup: 'INSTR', scopeSubgroup: '', entityKey: 'prs', abbr: 'PRS', label: 'Pressure', sortOrder: 10 },
  { registryType: 'subgroup', scopeGroup: 'INSTR', scopeSubgroup: '', entityKey: 'tmp', abbr: 'TMP', label: 'Temperature', sortOrder: 20 },
  { registryType: 'subgroup', scopeGroup: 'INSTR', scopeSubgroup: '', entityKey: 'flw', abbr: 'FLW', label: 'Flow',        sortOrder: 30 },
  { registryType: 'subgroup', scopeGroup: 'INSTR', scopeSubgroup: '', entityKey: 'lvl', abbr: 'LVL', label: 'Level',       sortOrder: 40 },

  // INSTR-PRS TYPEs
  { registryType: 'type', scopeGroup: 'INSTR', scopeSubgroup: 'PRS', entityKey: 'txr', abbr: 'TXR', label: 'Pressure Transmitter', sortOrder: 10 },
  { registryType: 'type', scopeGroup: 'INSTR', scopeSubgroup: 'PRS', entityKey: 'gau', abbr: 'GAU', label: 'Pressure Gauge',       sortOrder: 20 },
  { registryType: 'type', scopeGroup: 'INSTR', scopeSubgroup: 'PRS', entityKey: 'swt', abbr: 'SWT', label: 'Pressure Switch',      sortOrder: 30 },

  // INSTR-PRS SEG4 — Wetted MOC
  { registryType: 'seg4', scopeGroup: 'INSTR', scopeSubgroup: 'PRS', entityKey: 'ss3', abbr: 'SS3', label: 'SS316L Wetted',           sortOrder: 10 },
  { registryType: 'seg4', scopeGroup: 'INSTR', scopeSubgroup: 'PRS', entityKey: 'hac', abbr: 'HAC', label: 'Hastelloy C-276 Wetted',  sortOrder: 20 },
  { registryType: 'seg4', scopeGroup: 'INSTR', scopeSubgroup: 'PRS', entityKey: 'tit', abbr: 'TIT', label: 'Titanium Wetted',         sortOrder: 30 },
  { registryType: 'seg4', scopeGroup: 'INSTR', scopeSubgroup: 'PRS', entityKey: 'dss', abbr: 'DSS', label: 'Duplex SS Wetted',        sortOrder: 40 },
  { registryType: 'seg4', scopeGroup: 'INSTR', scopeSubgroup: 'PRS', entityKey: 'na',  abbr: 'NA',  label: '',                        sortOrder: 99 },

  // INSTR-PRS SEG5 — Process Connection
  { registryType: 'seg5', scopeGroup: 'INSTR', scopeSubgroup: 'PRS', entityKey: 'npt', abbr: 'NPT', label: '1/2" NPT', sortOrder: 10 },
  { registryType: 'seg5', scopeGroup: 'INSTR', scopeSubgroup: 'PRS', entityKey: 'flg', abbr: 'FLG', label: 'Flanged',  sortOrder: 20 },
  { registryType: 'seg5', scopeGroup: 'INSTR', scopeSubgroup: 'PRS', entityKey: 'sw',  abbr: 'SW',  label: 'SW',       sortOrder: 30 },
  { registryType: 'seg5', scopeGroup: 'INSTR', scopeSubgroup: 'PRS', entityKey: 'na',  abbr: 'NA',  label: '',         sortOrder: 99 },

  // INSTR-TMP TYPEs
  { registryType: 'type', scopeGroup: 'INSTR', scopeSubgroup: 'TMP', entityKey: 'tcc', abbr: 'TCC', label: 'Thermocouple', sortOrder: 10 },
  { registryType: 'type', scopeGroup: 'INSTR', scopeSubgroup: 'TMP', entityKey: 'rtd', abbr: 'RTD', label: 'RTD',          sortOrder: 20 },

  // INSTR-TMP SEG4 — Thermowell/Wetted MOC
  { registryType: 'seg4', scopeGroup: 'INSTR', scopeSubgroup: 'TMP', entityKey: 'ss3', abbr: 'SS3', label: 'SS316 Thermowell',          sortOrder: 10 },
  { registryType: 'seg4', scopeGroup: 'INSTR', scopeSubgroup: 'TMP', entityKey: 'dss', abbr: 'DSS', label: 'Duplex SS Thermowell',       sortOrder: 20 },
  { registryType: 'seg4', scopeGroup: 'INSTR', scopeSubgroup: 'TMP', entityKey: 'hac', abbr: 'HAC', label: 'Hastelloy C-276 Thermowell', sortOrder: 30 },
  { registryType: 'seg4', scopeGroup: 'INSTR', scopeSubgroup: 'TMP', entityKey: 'na',  abbr: 'NA',  label: '',                          sortOrder: 99 },

  // INSTR-TMP SEG5 — Process Connection
  { registryType: 'seg5', scopeGroup: 'INSTR', scopeSubgroup: 'TMP', entityKey: 'npt', abbr: 'NPT', label: 'NPT Threaded', sortOrder: 10 },
  { registryType: 'seg5', scopeGroup: 'INSTR', scopeSubgroup: 'TMP', entityKey: 'flg', abbr: 'FLG', label: 'Flanged',      sortOrder: 20 },
  { registryType: 'seg5', scopeGroup: 'INSTR', scopeSubgroup: 'TMP', entityKey: 'na',  abbr: 'NA',  label: '',             sortOrder: 99 },

  // INSTR-FLW TYPEs
  { registryType: 'type', scopeGroup: 'INSTR', scopeSubgroup: 'FLW', entityKey: 'mag', abbr: 'MAG', label: 'Magnetic Flowmeter',   sortOrder: 10 },
  { registryType: 'type', scopeGroup: 'INSTR', scopeSubgroup: 'FLW', entityKey: 'cor', abbr: 'COR', label: 'Coriolis Flowmeter',   sortOrder: 20 },
  { registryType: 'type', scopeGroup: 'INSTR', scopeSubgroup: 'FLW', entityKey: 'vtx', abbr: 'VTX', label: 'Vortex Flowmeter',    sortOrder: 30 },
  { registryType: 'type', scopeGroup: 'INSTR', scopeSubgroup: 'FLW', entityKey: 'usc', abbr: 'USC', label: 'Ultrasonic Flowmeter', sortOrder: 40 },

  // INSTR-FLW SEG4 — Wetted/Liner MOC
  { registryType: 'seg4', scopeGroup: 'INSTR', scopeSubgroup: 'FLW', entityKey: 'ss3',  abbr: 'SS3',  label: 'SS316L Wetted',   sortOrder: 10 },
  { registryType: 'seg4', scopeGroup: 'INSTR', scopeSubgroup: 'FLW', entityKey: 'ptfe', abbr: 'PTFE', label: 'PTFE Lined',       sortOrder: 20 },
  { registryType: 'seg4', scopeGroup: 'INSTR', scopeSubgroup: 'FLW', entityKey: 'hac',  abbr: 'HAC',  label: 'Hastelloy C-276',  sortOrder: 30 },
  { registryType: 'seg4', scopeGroup: 'INSTR', scopeSubgroup: 'FLW', entityKey: 'tit',  abbr: 'TIT',  label: 'Titanium Wetted',  sortOrder: 40 },
  { registryType: 'seg4', scopeGroup: 'INSTR', scopeSubgroup: 'FLW', entityKey: 'na',   abbr: 'NA',   label: 'Clamp-on',         sortOrder: 99 },

  // INSTR-FLW SEG5 — Process Connection
  { registryType: 'seg5', scopeGroup: 'INSTR', scopeSubgroup: 'FLW', entityKey: 'flg', abbr: 'FLG', label: 'Flanged',  sortOrder: 10 },
  { registryType: 'seg5', scopeGroup: 'INSTR', scopeSubgroup: 'FLW', entityKey: 'waf', abbr: 'WAF', label: 'Wafer',    sortOrder: 20 },
  { registryType: 'seg5', scopeGroup: 'INSTR', scopeSubgroup: 'FLW', entityKey: 'na',  abbr: 'NA',  label: '',         sortOrder: 99 },

  // INSTR-LVL TYPEs
  { registryType: 'type', scopeGroup: 'INSTR', scopeSubgroup: 'LVL', entityKey: 'gwr', abbr: 'GWR', label: 'GWR Level Transmitter',         sortOrder: 10 },
  { registryType: 'type', scopeGroup: 'INSTR', scopeSubgroup: 'LVL', entityKey: 'rdr', abbr: 'RDR', label: 'Non-contact Radar Level',       sortOrder: 20 },

  // INSTR-LVL SEG4 — Probe/Wetted MOC
  { registryType: 'seg4', scopeGroup: 'INSTR', scopeSubgroup: 'LVL', entityKey: 'ss3', abbr: 'SS3', label: 'SS316L Probe',          sortOrder: 10 },
  { registryType: 'seg4', scopeGroup: 'INSTR', scopeSubgroup: 'LVL', entityKey: 'hac', abbr: 'HAC', label: 'Hastelloy C-276 Probe', sortOrder: 20 },
  { registryType: 'seg4', scopeGroup: 'INSTR', scopeSubgroup: 'LVL', entityKey: 'dss', abbr: 'DSS', label: 'Duplex SS Probe',       sortOrder: 30 },
  { registryType: 'seg4', scopeGroup: 'INSTR', scopeSubgroup: 'LVL', entityKey: 'na',  abbr: 'NA',  label: 'Non-contact',          sortOrder: 99 },

  // INSTR-LVL SEG5 — Process Connection
  { registryType: 'seg5', scopeGroup: 'INSTR', scopeSubgroup: 'LVL', entityKey: 'flg', abbr: 'FLG', label: 'Flanged',      sortOrder: 10 },
  { registryType: 'seg5', scopeGroup: 'INSTR', scopeSubgroup: 'LVL', entityKey: 'npt', abbr: 'NPT', label: 'NPT Threaded', sortOrder: 20 },
  { registryType: 'seg5', scopeGroup: 'INSTR', scopeSubgroup: 'LVL', entityKey: 'na',  abbr: 'NA',  label: '',             sortOrder: 99 },

  // ─────────────────────────────────────────────────
  // ELECT SUBGROUPs
  // ─────────────────────────────────────────────────
  { registryType: 'subgroup', scopeGroup: 'ELECT', scopeSubgroup: '', entityKey: 'pnl', abbr: 'PNL', label: 'Panels',        sortOrder: 10 },
  { registryType: 'subgroup', scopeGroup: 'ELECT', scopeSubgroup: '', entityKey: 'jbx', abbr: 'JBX', label: 'Junction Boxes', sortOrder: 20 },
  { registryType: 'subgroup', scopeGroup: 'ELECT', scopeSubgroup: '', entityKey: 'cbl', abbr: 'CBL', label: 'Cables',         sortOrder: 30 },
  { registryType: 'subgroup', scopeGroup: 'ELECT', scopeSubgroup: '', entityKey: 'cmp', abbr: 'CMP', label: 'Components',     sortOrder: 40 },

  // ELECT-PNL TYPEs
  { registryType: 'type', scopeGroup: 'ELECT', scopeSubgroup: 'PNL', entityKey: 'mcc', abbr: 'MCC', label: 'MCC Panel',          sortOrder: 10 },
  { registryType: 'type', scopeGroup: 'ELECT', scopeSubgroup: 'PNL', entityKey: 'pcc', abbr: 'PCC', label: 'PCC Panel',          sortOrder: 20 },
  { registryType: 'type', scopeGroup: 'ELECT', scopeSubgroup: 'PNL', entityKey: 'lcs', abbr: 'LCS', label: 'Local Control Station', sortOrder: 30 },
  { registryType: 'type', scopeGroup: 'ELECT', scopeSubgroup: 'PNL', entityKey: 'swb', abbr: 'SWB', label: 'MV Switchboard',     sortOrder: 40 },
  { registryType: 'type', scopeGroup: 'ELECT', scopeSubgroup: 'PNL', entityKey: 'dbd', abbr: 'DBD', label: 'Distribution Board', sortOrder: 50 },

  // ELECT-PNL SEG4 — Voltage Class
  { registryType: 'seg4', scopeGroup: 'ELECT', scopeSubgroup: 'PNL', entityKey: 'lv',   abbr: 'LV',   label: 'LV 415V',   sortOrder: 10 },
  { registryType: 'seg4', scopeGroup: 'ELECT', scopeSubgroup: 'PNL', entityKey: 'mv6',  abbr: 'MV6',  label: 'MV 6.6 kV', sortOrder: 20 },
  { registryType: 'seg4', scopeGroup: 'ELECT', scopeSubgroup: 'PNL', entityKey: 'mv11', abbr: 'MV11', label: 'MV 11 kV',  sortOrder: 30 },
  { registryType: 'seg4', scopeGroup: 'ELECT', scopeSubgroup: 'PNL', entityKey: '24v',  abbr: '24V',  label: '24 VDC',    sortOrder: 40 },

  // ELECT-PNL SEG5 — Enclosure MOC
  { registryType: 'seg5', scopeGroup: 'ELECT', scopeSubgroup: 'PNL', entityKey: 'ms',  abbr: 'MS',  label: 'Mild Steel Enclosure', sortOrder: 10 },
  { registryType: 'seg5', scopeGroup: 'ELECT', scopeSubgroup: 'PNL', entityKey: 'ss3', abbr: 'SS3', label: 'SS316 Enclosure',      sortOrder: 20 },
  { registryType: 'seg5', scopeGroup: 'ELECT', scopeSubgroup: 'PNL', entityKey: 'grp', abbr: 'GRP', label: 'GRP Enclosure',        sortOrder: 30 },
  { registryType: 'seg5', scopeGroup: 'ELECT', scopeSubgroup: 'PNL', entityKey: 'na',  abbr: 'NA',  label: '',                    sortOrder: 99 },

  // ELECT-JBX TYPEs
  { registryType: 'type', scopeGroup: 'ELECT', scopeSubgroup: 'JBX', entityKey: 'fpr', abbr: 'FPR', label: 'Flameproof JB',      sortOrder: 10 },
  { registryType: 'type', scopeGroup: 'ELECT', scopeSubgroup: 'JBX', entityKey: 'wpr', abbr: 'WPR', label: 'Weatherproof JB',    sortOrder: 20 },
  { registryType: 'type', scopeGroup: 'ELECT', scopeSubgroup: 'JBX', entityKey: 'gpr', abbr: 'GPR', label: 'General Purpose JB', sortOrder: 30 },

  // ELECT-JBX SEG4 — Enclosure MOC
  { registryType: 'seg4', scopeGroup: 'ELECT', scopeSubgroup: 'JBX', entityKey: 'alc', abbr: 'ALC', label: 'Die-cast Aluminium', sortOrder: 10 },
  { registryType: 'seg4', scopeGroup: 'ELECT', scopeSubgroup: 'JBX', entityKey: 'grp', abbr: 'GRP', label: 'GRP Enclosure',      sortOrder: 20 },
  { registryType: 'seg4', scopeGroup: 'ELECT', scopeSubgroup: 'JBX', entityKey: 'ss3', abbr: 'SS3', label: 'SS316 Enclosure',    sortOrder: 30 },
  { registryType: 'seg4', scopeGroup: 'ELECT', scopeSubgroup: 'JBX', entityKey: 'ms',  abbr: 'MS',  label: 'Mild Steel',         sortOrder: 40 },

  // ELECT-JBX SEG5 — Mounting
  { registryType: 'seg5', scopeGroup: 'ELECT', scopeSubgroup: 'JBX', entityKey: 'wm', abbr: 'WM', label: 'Wall Mounted',  sortOrder: 10 },
  { registryType: 'seg5', scopeGroup: 'ELECT', scopeSubgroup: 'JBX', entityKey: 'sm', abbr: 'SM', label: 'Stand Mounted', sortOrder: 20 },
  { registryType: 'seg5', scopeGroup: 'ELECT', scopeSubgroup: 'JBX', entityKey: 'na', abbr: 'NA', label: '',              sortOrder: 99 },

  // ELECT-CBL TYPEs
  { registryType: 'type', scopeGroup: 'ELECT', scopeSubgroup: 'CBL', entityKey: 'pwr', abbr: 'PWR', label: 'Power Cable',           sortOrder: 10 },
  { registryType: 'type', scopeGroup: 'ELECT', scopeSubgroup: 'CBL', entityKey: 'ctl', abbr: 'CTL', label: 'Control Cable',         sortOrder: 20 },
  { registryType: 'type', scopeGroup: 'ELECT', scopeSubgroup: 'CBL', entityKey: 'ins', abbr: 'INS', label: 'Instrumentation Cable', sortOrder: 30 },

  // ELECT-CBL SEG4 — Insulation
  { registryType: 'seg4', scopeGroup: 'ELECT', scopeSubgroup: 'CBL', entityKey: 'xlpe', abbr: 'XLPE', label: 'XLPE Insulated',     sortOrder: 10 },
  { registryType: 'seg4', scopeGroup: 'ELECT', scopeSubgroup: 'CBL', entityKey: 'pvc',  abbr: 'PVC',  label: 'PVC Insulated',      sortOrder: 20 },
  { registryType: 'seg4', scopeGroup: 'ELECT', scopeSubgroup: 'CBL', entityKey: 'epr',  abbr: 'EPR',  label: 'EPR Insulated',      sortOrder: 30 },
  { registryType: 'seg4', scopeGroup: 'ELECT', scopeSubgroup: 'CBL', entityKey: 'micc', abbr: 'MICC', label: 'Mineral Insulated',  sortOrder: 40 },

  // ELECT-CBL SEG5 — Armour
  { registryType: 'seg5', scopeGroup: 'ELECT', scopeSubgroup: 'CBL', entityKey: 'swa', abbr: 'SWA', label: 'SWA Armoured', sortOrder: 10 },
  { registryType: 'seg5', scopeGroup: 'ELECT', scopeSubgroup: 'CBL', entityKey: 'una', abbr: 'UNA', label: 'Unarmoured',   sortOrder: 20 },
  { registryType: 'seg5', scopeGroup: 'ELECT', scopeSubgroup: 'CBL', entityKey: 'na',  abbr: 'NA',  label: '',             sortOrder: 99 },

  // ELECT-CMP TYPEs
  { registryType: 'type', scopeGroup: 'ELECT', scopeSubgroup: 'CMP', entityKey: 'vfd', abbr: 'VFD', label: 'VFD Drive',   sortOrder: 10 },
  { registryType: 'type', scopeGroup: 'ELECT', scopeSubgroup: 'CMP', entityKey: 'mcb', abbr: 'MCB', label: 'MCB',         sortOrder: 20 },
  { registryType: 'type', scopeGroup: 'ELECT', scopeSubgroup: 'CMP', entityKey: 'mbk', abbr: 'MBK', label: 'MCCB',        sortOrder: 30 },
  { registryType: 'type', scopeGroup: 'ELECT', scopeSubgroup: 'CMP', entityKey: 'plc', abbr: 'PLC', label: 'PLC / DCS Module', sortOrder: 40 },

  // ELECT-CMP SEG4 — Voltage Class
  { registryType: 'seg4', scopeGroup: 'ELECT', scopeSubgroup: 'CMP', entityKey: 'lv',  abbr: 'LV',  label: 'LV 415V', sortOrder: 10 },
  { registryType: 'seg4', scopeGroup: 'ELECT', scopeSubgroup: 'CMP', entityKey: 'mv6', abbr: 'MV6', label: 'MV 6.6 kV', sortOrder: 20 },
  { registryType: 'seg4', scopeGroup: 'ELECT', scopeSubgroup: 'CMP', entityKey: '24v', abbr: '24V', label: '24 VDC',  sortOrder: 30 },
  { registryType: 'seg4', scopeGroup: 'ELECT', scopeSubgroup: 'CMP', entityKey: 'na',  abbr: 'NA',  label: '',        sortOrder: 99 },

  // ELECT-CMP SEG5 — NA
  { registryType: 'seg5', scopeGroup: 'ELECT', scopeSubgroup: 'CMP', entityKey: 'na', abbr: 'NA', label: '', sortOrder: 10 },

  // ─────────────────────────────────────────────────
  // BOPKG SUBGROUPs
  // ─────────────────────────────────────────────────
  { registryType: 'subgroup', scopeGroup: 'BOPKG', scopeSubgroup: '', entityKey: 'clt', abbr: 'CLT', label: 'Cooling Tower',  sortOrder: 10 },
  { registryType: 'subgroup', scopeGroup: 'BOPKG', scopeSubgroup: '', entityKey: 'gen', abbr: 'GEN', label: 'General Package', sortOrder: 20 },

  { registryType: 'type', scopeGroup: 'BOPKG', scopeSubgroup: 'CLT', entityKey: 'mdt', abbr: 'MDT', label: 'Cooling Tower, Mechanical Draft', sortOrder: 10 },
  { registryType: 'type', scopeGroup: 'BOPKG', scopeSubgroup: 'GEN', entityKey: 'na',  abbr: 'NA',  label: 'General Bought-out Package',     sortOrder: 10 },

  { registryType: 'seg4', scopeGroup: 'BOPKG', scopeSubgroup: 'CLT', entityKey: 'frp', abbr: 'FRP', label: 'FRP Shell',      sortOrder: 10 },
  { registryType: 'seg4', scopeGroup: 'BOPKG', scopeSubgroup: 'CLT', entityKey: 'rcc', abbr: 'RCC', label: 'Concrete Shell',  sortOrder: 20 },
  { registryType: 'seg4', scopeGroup: 'BOPKG', scopeSubgroup: 'CLT', entityKey: 'na',  abbr: 'NA',  label: '',               sortOrder: 99 },
  { registryType: 'seg5', scopeGroup: 'BOPKG', scopeSubgroup: 'CLT', entityKey: 'na',  abbr: 'NA',  label: '',               sortOrder: 10 },

  { registryType: 'seg4', scopeGroup: 'BOPKG', scopeSubgroup: 'GEN', entityKey: 'na', abbr: 'NA', label: '', sortOrder: 10 },
  { registryType: 'seg5', scopeGroup: 'BOPKG', scopeSubgroup: 'GEN', entityKey: 'na', abbr: 'NA', label: '', sortOrder: 10 },

  // ─────────────────────────────────────────────────
  // PLATE SUBGROUPs
  // ─────────────────────────────────────────────────
  { registryType: 'subgroup', scopeGroup: 'PLATE', scopeSubgroup: '', entityKey: 'cs',  abbr: 'CS',  label: 'Carbon Steel',        sortOrder: 10 },
  { registryType: 'subgroup', scopeGroup: 'PLATE', scopeSubgroup: '', entityKey: 'ss3', abbr: 'SS3', label: 'SS316 / SS316L',      sortOrder: 20 },
  { registryType: 'subgroup', scopeGroup: 'PLATE', scopeSubgroup: '', entityKey: 'dss', abbr: 'DSS', label: 'Duplex SS 2205',      sortOrder: 30 },
  { registryType: 'subgroup', scopeGroup: 'PLATE', scopeSubgroup: '', entityKey: 'hac', abbr: 'HAC', label: 'Hastelloy C-276',     sortOrder: 40 },

  ...(['CS', 'SS3', 'DSS', 'HAC'] as const).flatMap(sg => [
    { registryType: 'type',  scopeGroup: 'PLATE', scopeSubgroup: sg, entityKey: 'na', abbr: 'NA', label: sg === 'CS' ? 'CS Plate' : sg === 'SS3' ? 'SS316 Plate' : sg === 'DSS' ? 'Duplex SS Plate' : 'Hastelloy C-276 Plate', sortOrder: 10 },
    { registryType: 'seg4',  scopeGroup: 'PLATE', scopeSubgroup: sg, entityKey: 'hr', abbr: 'HR', label: 'Hot Rolled',  sortOrder: 10 },
    { registryType: 'seg4',  scopeGroup: 'PLATE', scopeSubgroup: sg, entityKey: 'cr', abbr: 'CR', label: 'Cold Rolled', sortOrder: 20 },
    { registryType: 'seg4',  scopeGroup: 'PLATE', scopeSubgroup: sg, entityKey: 'na', abbr: 'NA', label: '',            sortOrder: 99 },
    { registryType: 'seg5',  scopeGroup: 'PLATE', scopeSubgroup: sg, entityKey: 'na', abbr: 'NA', label: '',            sortOrder: 10 },
  ]),

  // ─────────────────────────────────────────────────
  // PIPES SUBGROUPs
  // ─────────────────────────────────────────────────
  { registryType: 'subgroup', scopeGroup: 'PIPES', scopeSubgroup: '', entityKey: 'cs',  abbr: 'CS',  label: 'Carbon Steel',    sortOrder: 10 },
  { registryType: 'subgroup', scopeGroup: 'PIPES', scopeSubgroup: '', entityKey: 's31', abbr: 'S31', label: 'SS316L',          sortOrder: 20 },
  { registryType: 'subgroup', scopeGroup: 'PIPES', scopeSubgroup: '', entityKey: 'dss', abbr: 'DSS', label: 'Duplex SS',       sortOrder: 30 },
  { registryType: 'subgroup', scopeGroup: 'PIPES', scopeSubgroup: '', entityKey: 'hac', abbr: 'HAC', label: 'Hastelloy C-276', sortOrder: 40 },

  ...(['CS', 'S31', 'DSS', 'HAC'] as const).flatMap(sg => [
    { registryType: 'type',  scopeGroup: 'PIPES', scopeSubgroup: sg, entityKey: 'na',   abbr: 'NA',   label: sg === 'CS' ? 'CS Pipe' : sg === 'S31' ? 'SS316L Pipe' : sg === 'DSS' ? 'Duplex SS Pipe' : 'Hastelloy C-276 Pipe', sortOrder: 10 },
    { registryType: 'seg4',  scopeGroup: 'PIPES', scopeSubgroup: sg, entityKey: 'std',  abbr: 'STD',  label: 'Standard Weight', sortOrder: 10 },
    { registryType: 'seg4',  scopeGroup: 'PIPES', scopeSubgroup: sg, entityKey: 's40',  abbr: 'S40',  label: 'Schedule 40',     sortOrder: 20 },
    { registryType: 'seg4',  scopeGroup: 'PIPES', scopeSubgroup: sg, entityKey: 's80',  abbr: 'S80',  label: 'Schedule 80',     sortOrder: 30 },
    { registryType: 'seg4',  scopeGroup: 'PIPES', scopeSubgroup: sg, entityKey: 's160', abbr: 'S160', label: 'Schedule 160',    sortOrder: 40 },
    { registryType: 'seg4',  scopeGroup: 'PIPES', scopeSubgroup: sg, entityKey: 'xh',   abbr: 'XH',   label: 'Extra Heavy',     sortOrder: 50 },
    { registryType: 'seg4',  scopeGroup: 'PIPES', scopeSubgroup: sg, entityKey: 'na',   abbr: 'NA',   label: '',                sortOrder: 99 },
    { registryType: 'seg5',  scopeGroup: 'PIPES', scopeSubgroup: sg, entityKey: 'na',   abbr: 'NA',   label: '',                sortOrder: 10 },
  ]),

  // ─────────────────────────────────────────────────
  // FLANG SUBGROUPs
  // ─────────────────────────────────────────────────
  { registryType: 'subgroup', scopeGroup: 'FLANG', scopeSubgroup: '', entityKey: 'cs',  abbr: 'CS',  label: 'Carbon Steel',    sortOrder: 10 },
  { registryType: 'subgroup', scopeGroup: 'FLANG', scopeSubgroup: '', entityKey: 'ss3', abbr: 'SS3', label: 'SS316 / SS316L',  sortOrder: 20 },
  { registryType: 'subgroup', scopeGroup: 'FLANG', scopeSubgroup: '', entityKey: 'dss', abbr: 'DSS', label: 'Duplex SS 2205',  sortOrder: 30 },
  { registryType: 'subgroup', scopeGroup: 'FLANG', scopeSubgroup: '', entityKey: 'hac', abbr: 'HAC', label: 'Hastelloy C-276', sortOrder: 40 },

  ...(['CS', 'SS3', 'DSS', 'HAC'] as const).flatMap(sg => [
    { registryType: 'type',  scopeGroup: 'FLANG', scopeSubgroup: sg, entityKey: 'na',   abbr: 'NA',   label: sg === 'CS' ? 'CS Flange' : sg === 'SS3' ? 'SS316 Flange' : sg === 'DSS' ? 'Duplex SS Flange' : 'Hastelloy C-276 Flange', sortOrder: 10 },
    { registryType: 'seg4',  scopeGroup: 'FLANG', scopeSubgroup: sg, entityKey: 'c150', abbr: 'C150', label: 'ANSI Class 150', sortOrder: 10 },
    { registryType: 'seg4',  scopeGroup: 'FLANG', scopeSubgroup: sg, entityKey: 'c300', abbr: 'C300', label: 'ANSI Class 300', sortOrder: 20 },
    { registryType: 'seg4',  scopeGroup: 'FLANG', scopeSubgroup: sg, entityKey: 'c600', abbr: 'C600', label: 'ANSI Class 600', sortOrder: 30 },
    { registryType: 'seg4',  scopeGroup: 'FLANG', scopeSubgroup: sg, entityKey: 'c900', abbr: 'C900', label: 'ANSI Class 900', sortOrder: 40 },
    { registryType: 'seg4',  scopeGroup: 'FLANG', scopeSubgroup: sg, entityKey: 'pn16', abbr: 'PN16', label: 'PN 16',          sortOrder: 50 },
    { registryType: 'seg4',  scopeGroup: 'FLANG', scopeSubgroup: sg, entityKey: 'pn40', abbr: 'PN40', label: 'PN 40',          sortOrder: 60 },
    { registryType: 'seg5',  scopeGroup: 'FLANG', scopeSubgroup: sg, entityKey: 'wn',   abbr: 'WN',   label: 'Weld Neck',      sortOrder: 10 },
    { registryType: 'seg5',  scopeGroup: 'FLANG', scopeSubgroup: sg, entityKey: 'sop',  abbr: 'SOP',  label: 'Slip-on',        sortOrder: 20 },
    { registryType: 'seg5',  scopeGroup: 'FLANG', scopeSubgroup: sg, entityKey: 'bln',  abbr: 'BLN',  label: 'Blind',          sortOrder: 30 },
    { registryType: 'seg5',  scopeGroup: 'FLANG', scopeSubgroup: sg, entityKey: 'skt',  abbr: 'SKT',  label: 'Socket Weld',    sortOrder: 40 },
    { registryType: 'seg5',  scopeGroup: 'FLANG', scopeSubgroup: sg, entityKey: 'thd',  abbr: 'THD',  label: 'Threaded',       sortOrder: 50 },
    { registryType: 'seg5',  scopeGroup: 'FLANG', scopeSubgroup: sg, entityKey: 'lj',   abbr: 'LJ',   label: 'Lap Joint',      sortOrder: 60 },
  ]),

  // ─────────────────────────────────────────────────
  // FITNG SUBGROUPs
  // ─────────────────────────────────────────────────
  { registryType: 'subgroup', scopeGroup: 'FITNG', scopeSubgroup: '', entityKey: 'cs',  abbr: 'CS',  label: 'Carbon Steel', sortOrder: 10 },
  { registryType: 'subgroup', scopeGroup: 'FITNG', scopeSubgroup: '', entityKey: 'ss3', abbr: 'SS3', label: 'SS316',        sortOrder: 20 },
  { registryType: 'subgroup', scopeGroup: 'FITNG', scopeSubgroup: '', entityKey: 'dss', abbr: 'DSS', label: 'Duplex SS',    sortOrder: 30 },

  ...(['CS', 'SS3', 'DSS'] as const).flatMap(sg => [
    { registryType: 'type', scopeGroup: 'FITNG', scopeSubgroup: sg, entityKey: 'elb', abbr: 'ELB', label: sg === 'CS' ? 'CS Elbow' : sg === 'SS3' ? 'SS316 Elbow' : 'Duplex SS Elbow', sortOrder: 10 },
    { registryType: 'type', scopeGroup: 'FITNG', scopeSubgroup: sg, entityKey: 'tee', abbr: 'TEE', label: 'Equal Tee',  sortOrder: 20 },
    { registryType: 'type', scopeGroup: 'FITNG', scopeSubgroup: sg, entityKey: 'red', abbr: 'RED', label: 'Reducer',    sortOrder: 30 },
    { registryType: 'type', scopeGroup: 'FITNG', scopeSubgroup: sg, entityKey: 'cap', abbr: 'CAP', label: 'End Cap',    sortOrder: 40 },
    { registryType: 'seg4', scopeGroup: 'FITNG', scopeSubgroup: sg, entityKey: 's40',  abbr: 'S40',  label: 'Schedule 40',     sortOrder: 10 },
    { registryType: 'seg4', scopeGroup: 'FITNG', scopeSubgroup: sg, entityKey: 's80',  abbr: 'S80',  label: 'Schedule 80',     sortOrder: 20 },
    { registryType: 'seg4', scopeGroup: 'FITNG', scopeSubgroup: sg, entityKey: 's160', abbr: 'S160', label: 'Schedule 160',    sortOrder: 30 },
    { registryType: 'seg4', scopeGroup: 'FITNG', scopeSubgroup: sg, entityKey: 'std',  abbr: 'STD',  label: 'Standard Weight', sortOrder: 40 },
    { registryType: 'seg4', scopeGroup: 'FITNG', scopeSubgroup: sg, entityKey: 'c150', abbr: 'C150', label: 'ANSI Class 150',  sortOrder: 50 },
    { registryType: 'seg4', scopeGroup: 'FITNG', scopeSubgroup: sg, entityKey: 'c300', abbr: 'C300', label: 'ANSI Class 300',  sortOrder: 60 },
    { registryType: 'seg5', scopeGroup: 'FITNG', scopeSubgroup: sg, entityKey: 'na',   abbr: 'NA',   label: '',               sortOrder: 10 },
  ]),

  // ─────────────────────────────────────────────────
  // FASTN SUBGROUPs
  // ─────────────────────────────────────────────────
  { registryType: 'subgroup', scopeGroup: 'FASTN', scopeSubgroup: '', entityKey: 'b7', abbr: 'B7', label: 'ASTM A193 B7 Stud',   sortOrder: 10 },
  { registryType: 'subgroup', scopeGroup: 'FASTN', scopeSubgroup: '', entityKey: 'a2', abbr: 'A2', label: 'A2-70 SS Hex',         sortOrder: 20 },
  { registryType: 'subgroup', scopeGroup: 'FASTN', scopeSubgroup: '', entityKey: 'ss', abbr: 'SS', label: 'SS316 Fastener',       sortOrder: 30 },

  ...(['B7', 'A2', 'SS'] as const).flatMap(sg => [
    { registryType: 'type', scopeGroup: 'FASTN', scopeSubgroup: sg, entityKey: 'std', abbr: 'STD', label: 'Stud Bolt', sortOrder: 10 },
    { registryType: 'type', scopeGroup: 'FASTN', scopeSubgroup: sg, entityKey: 'hxb', abbr: 'HXB', label: 'Hex Bolt',  sortOrder: 20 },
    { registryType: 'type', scopeGroup: 'FASTN', scopeSubgroup: sg, entityKey: 'nut', abbr: 'NUT', label: 'Nut',       sortOrder: 30 },
    { registryType: 'seg4', scopeGroup: 'FASTN', scopeSubgroup: sg, entityKey: 'unc', abbr: 'UNC', label: 'UNC Thread',    sortOrder: 10 },
    { registryType: 'seg4', scopeGroup: 'FASTN', scopeSubgroup: sg, entityKey: 'met', abbr: 'MET', label: 'Metric Thread', sortOrder: 20 },
    { registryType: 'seg4', scopeGroup: 'FASTN', scopeSubgroup: sg, entityKey: 'na',  abbr: 'NA',  label: '',             sortOrder: 99 },
    { registryType: 'seg5', scopeGroup: 'FASTN', scopeSubgroup: sg, entityKey: 'na',  abbr: 'NA',  label: '',             sortOrder: 10 },
  ]),

  // ─────────────────────────────────────────────────
  // GASKT SUBGROUPs
  // ─────────────────────────────────────────────────
  { registryType: 'subgroup', scopeGroup: 'GASKT', scopeSubgroup: '', entityKey: 'spwg', abbr: 'SPWG', label: 'Spiral Wound Graphite', sortOrder: 10 },
  { registryType: 'subgroup', scopeGroup: 'GASKT', scopeSubgroup: '', entityKey: 'ptfe', abbr: 'PTFE', label: 'PTFE Sheet',             sortOrder: 20 },
  { registryType: 'subgroup', scopeGroup: 'GASKT', scopeSubgroup: '', entityKey: 'rjnt', abbr: 'RJNT', label: 'RTJ Ring Joint',         sortOrder: 30 },

  ...(['SPWG', 'PTFE', 'RJNT'] as const).flatMap(sg => [
    { registryType: 'type', scopeGroup: 'GASKT', scopeSubgroup: sg, entityKey: 'na',   abbr: 'NA',   label: sg === 'SPWG' ? 'Spiral Wound Graphite Gasket' : sg === 'PTFE' ? 'PTFE Sheet Gasket' : 'RTJ Ring Joint Gasket', sortOrder: 10 },
    { registryType: 'seg4', scopeGroup: 'GASKT', scopeSubgroup: sg, entityKey: 'c150', abbr: 'C150', label: 'ANSI Class 150', sortOrder: 10 },
    { registryType: 'seg4', scopeGroup: 'GASKT', scopeSubgroup: sg, entityKey: 'c300', abbr: 'C300', label: 'ANSI Class 300', sortOrder: 20 },
    { registryType: 'seg4', scopeGroup: 'GASKT', scopeSubgroup: sg, entityKey: 'c600', abbr: 'C600', label: 'ANSI Class 600', sortOrder: 30 },
    { registryType: 'seg4', scopeGroup: 'GASKT', scopeSubgroup: sg, entityKey: 'c900', abbr: 'C900', label: 'ANSI Class 900', sortOrder: 40 },
    { registryType: 'seg4', scopeGroup: 'GASKT', scopeSubgroup: sg, entityKey: 'pn16', abbr: 'PN16', label: 'PN 16',          sortOrder: 50 },
    { registryType: 'seg4', scopeGroup: 'GASKT', scopeSubgroup: sg, entityKey: 'pn40', abbr: 'PN40', label: 'PN 40',          sortOrder: 60 },
    { registryType: 'seg4', scopeGroup: 'GASKT', scopeSubgroup: sg, entityKey: 'na',   abbr: 'NA',   label: '',               sortOrder: 99 },
    { registryType: 'seg5', scopeGroup: 'GASKT', scopeSubgroup: sg, entityKey: 'na',   abbr: 'NA',   label: '',               sortOrder: 10 },
  ]),

  // ─────────────────────────────────────────────────
  // STEEL SUBGROUPs
  // ─────────────────────────────────────────────────
  { registryType: 'subgroup', scopeGroup: 'STEEL', scopeSubgroup: '', entityKey: 'ang', abbr: 'ANG', label: 'Angle Section',  sortOrder: 10 },
  { registryType: 'subgroup', scopeGroup: 'STEEL', scopeSubgroup: '', entityKey: 'ipe', abbr: 'IPE', label: 'I-beam / UB',    sortOrder: 20 },
  { registryType: 'subgroup', scopeGroup: 'STEEL', scopeSubgroup: '', entityKey: 'chl', abbr: 'CHL', label: 'Channel / UC',   sortOrder: 30 },
  { registryType: 'subgroup', scopeGroup: 'STEEL', scopeSubgroup: '', entityKey: 'flt', abbr: 'FLT', label: 'Flat Bar',       sortOrder: 40 },
  { registryType: 'subgroup', scopeGroup: 'STEEL', scopeSubgroup: '', entityKey: 'tbe', abbr: 'TBE', label: 'Structural Tube', sortOrder: 50 },

  ...(['ANG', 'IPE', 'CHL', 'FLT', 'TBE'] as const).flatMap(sg => [
    { registryType: 'type', scopeGroup: 'STEEL', scopeSubgroup: sg, entityKey: 'na',   abbr: 'NA',   label: sg === 'ANG' ? 'Angle Section' : sg === 'IPE' ? 'I-beam' : sg === 'CHL' ? 'Channel' : sg === 'FLT' ? 'Flat Bar' : 'Structural Tube', sortOrder: 10 },
    { registryType: 'seg4', scopeGroup: 'STEEL', scopeSubgroup: sg, entityKey: 's275', abbr: 'S275', label: 'IS 2062 E250', sortOrder: 10 },
    { registryType: 'seg4', scopeGroup: 'STEEL', scopeSubgroup: sg, entityKey: 's350', abbr: 'S350', label: 'IS 2062 E350', sortOrder: 20 },
    { registryType: 'seg4', scopeGroup: 'STEEL', scopeSubgroup: sg, entityKey: 'na',   abbr: 'NA',   label: '',            sortOrder: 99 },
    { registryType: 'seg5', scopeGroup: 'STEEL', scopeSubgroup: sg, entityKey: 'na',   abbr: 'NA',   label: '',            sortOrder: 10 },
  ]),

];

export async function seedItemCodeRegistry(): Promise<void> {
  let inserted = 0;
  let updated = 0;

  for (const entry of REGISTRY) {
    const exists = await db.execute(
      sql`SELECT id FROM item_code_registry
          WHERE registry_type  = ${entry.registryType}
            AND scope_group    = ${entry.scopeGroup}
            AND scope_subgroup = ${entry.scopeSubgroup}
            AND entity_key     = ${entry.entityKey}
          LIMIT 1`
    );

    if (exists.rows.length === 0) {
      await db.execute(
        sql`INSERT INTO item_code_registry
              (registry_type, scope_group, scope_subgroup, entity_key, abbr, label, is_active, sort_order)
            VALUES
              (${entry.registryType}, ${entry.scopeGroup}, ${entry.scopeSubgroup},
               ${entry.entityKey}, ${entry.abbr}, ${entry.label}, true, ${entry.sortOrder})`
      );
      inserted++;
    } else {
      await db.execute(
        sql`UPDATE item_code_registry
            SET abbr       = ${entry.abbr},
                label      = ${entry.label},
                sort_order = ${entry.sortOrder}
            WHERE registry_type  = ${entry.registryType}
              AND scope_group    = ${entry.scopeGroup}
              AND scope_subgroup = ${entry.scopeSubgroup}
              AND entity_key     = ${entry.entityKey}`
      );
      updated++;
    }
  }

  const total = await db.execute(sql`SELECT COUNT(*) AS cnt FROM item_code_registry`);
  console.log(
    `[ICR-Seed] Done — ${inserted} inserted, ${updated} updated. ` +
    `${(total.rows[0] as any).cnt} rows total (${REGISTRY.length} managed by seed).`
  );
}
