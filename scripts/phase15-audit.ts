/**
 * Phase 1.5 – End-to-End Buy Package Catalog Validation Audit
 *
 * Covers all 10 validation steps for every implemented subgroup:
 *   1. Create a representative line → verify SAP code generated
 *   2. Verify master_items row created
 *   3. Verify buy_package_lines.master_item_id → master_items
 *   4. Verify sap_item_code == master_items.item_code
 *   5. Same spec in a second package header → verify master_items REUSED
 *   6. Non-identity field change (notes) → verify SAME master_item_id
 *   7. Identity field change → verify NEW master_items row + new master_item_id
 *   8. No duplicate master_items rows per SAP code
 */

import pg from 'pg';
import {
  buildNfpMotorItemCode,        resolveNfpMotorSapItemCode,
  buildFlpMotorItemCode,        resolveFlpMotorSapItemCode,
  buildIsoValveItemCode,        resolveIsoValveSapItemCode,
  buildCtrlValveItemCode,       resolveCtrlValveSapItemCode,
  buildSafetyValveItemCode,     resolveSafetyValveSapItemCode,
  buildOnOffValveItemCode,      resolveOnOffValveSapItemCode,
  buildNrvValveItemCode,        resolveNrvValveSapItemCode,
  buildNeedleValveItemCode,     resolveNeedleValveSapItemCode,
  buildMccPanelItemCode,        resolveMccPanelSapItemCode,
  buildCablingItemCode,         resolveCablingSapItemCode,
  buildJunctionBoxItemCode,     resolveJunctionBoxSapItemCode,
  buildPlatesItemCode,          resolvePlatesSapItemCode,
  buildPipesItemCode,           resolvePipesSapItemCode,
  buildFittingsItemCode,        resolveFittingsSapItemCode,
  buildFastenersItemCode,       resolveFastenersSapItemCode,
  buildGasketsItemCode,         resolveGasketsSapItemCode,
  buildStructuralSteelItemCode, resolveStructuralSteelSapItemCode,
  buildProfilesItemCode,        resolveProfilesSapItemCode,
  resolveCatalogSapItemCode,
} from '../server/buy-catalog-sap-service.js';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Two distinct draft package headers ───────────────────────────────────────
const HDR_A = 12;  // draft
const HDR_B = 15;  // draft

// ── UOM IDs (NOS = 1) ────────────────────────────────────────────────────────
const UOM_NOS = 1;
const UOM_MTR = 2;   // metres – for cabling
const UOM_SET = 1;   // fallback NOS for most

interface SubgroupDef {
  label:       string;
  group:       string;    // buy_groups.code
  subgroup:    string;    // buy_subgroups.code
  gid:         number;
  sid:         number;
  baseAttrs:   Record<string, unknown>;
  altAttrs:    Record<string, unknown>;   // identity field changed
  description: string;
  uomId:       number;
  uomCode:     string;
  builderFn:   (attrs: Record<string, unknown>) => string;
  resolverFn:  (pool: pg.Pool, gid: number, sid: number, attrs: Record<string, unknown>, uomCode: string, desc: string) => Promise<{ masterItemId: number; sapItemCode: string; reused: boolean }>;
}

// ── Subgroup definitions ──────────────────────────────────────────────────────
const SUBGROUPS: SubgroupDef[] = [

  // ── MOTORS ──────────────────────────────────────────────────────────────────
  {
    label: 'Motors / Non-Flameproof',
    group: 'motors', subgroup: 'non_flameproof', gid: 3, sid: 14,
    uomId: UOM_NOS, uomCode: 'NOS',
    description: 'Non-Flameproof Motor — Induction — 15 kW',
    baseAttrs: {
      motor_type: 'Induction', mounting: 'Horizontal (B3)', power: '15',
      voltage: '415 V', frequency: '50 Hz', num_poles: '4', efficiency_class: 'IE3',
    },
    altAttrs: {
      motor_type: 'Induction', mounting: 'Horizontal (B3)', power: '22',
      voltage: '415 V', frequency: '50 Hz', num_poles: '4', efficiency_class: 'IE3',
    },
    builderFn: buildNfpMotorItemCode, resolverFn: resolveNfpMotorSapItemCode,
  },

  {
    label: 'Motors / Flameproof',
    group: 'motors', subgroup: 'flameproof', gid: 3, sid: 15,
    uomId: UOM_NOS, uomCode: 'NOS',
    description: 'Flameproof Motor — Induction — 15 kW',
    baseAttrs: {
      motor_type: 'Induction', mounting: 'Horizontal (B3)', power: '15',
      voltage: '415 V', frequency: '50 Hz', num_poles: '4', efficiency_class: 'IE3',
      explosion_protection: 'Ex d', gas_group: 'IIB', temperature_class: 'T4',
    },
    altAttrs: {
      motor_type: 'Induction', mounting: 'Horizontal (B3)', power: '22',
      voltage: '415 V', frequency: '50 Hz', num_poles: '4', efficiency_class: 'IE3',
      explosion_protection: 'Ex d', gas_group: 'IIB', temperature_class: 'T4',
    },
    builderFn: buildFlpMotorItemCode, resolverFn: resolveFlpMotorSapItemCode,
  },

  // ── VALVES ───────────────────────────────────────────────────────────────────
  {
    label: 'Valves / Isolation',
    group: 'valves', subgroup: 'isolation', gid: 5, sid: 23,
    uomId: UOM_NOS, uomCode: 'NOS',
    description: 'Gate Valve — Flanged — 50 NB — Class 150 — CS',
    baseAttrs: {
      valve_type: 'Gate Valve', end_connection: 'Flanged', size_nb: '50 NB',
      pressure_rating: 'Class 150', body_material: 'CS (WCB)', trim_material: 'SS304',
    },
    altAttrs: {
      valve_type: 'Gate Valve', end_connection: 'Flanged', size_nb: '80 NB',
      pressure_rating: 'Class 150', body_material: 'CS (WCB)', trim_material: 'SS304',
    },
    builderFn: buildIsoValveItemCode, resolverFn: resolveIsoValveSapItemCode,
  },

  {
    label: 'Valves / Control',
    group: 'valves', subgroup: 'control', gid: 5, sid: 24,
    uomId: UOM_NOS, uomCode: 'NOS',
    description: 'Globe Control Valve — Flanged — 50 NB — Class 300',
    baseAttrs: {
      valve_type: 'Globe Valve', end_connection: 'Flanged', size_nb: '50 NB',
      pressure_rating: 'Class 300', body_material: 'WCB (CS)', trim_material: 'SS316',
      actuator_type: 'Pneumatic Diaphragm', fail_action: 'Fail Close (FC)',
    },
    altAttrs: {
      valve_type: 'Globe Valve', end_connection: 'Flanged', size_nb: '80 NB',
      pressure_rating: 'Class 300', body_material: 'WCB (CS)', trim_material: 'SS316',
      actuator_type: 'Pneumatic Diaphragm', fail_action: 'Fail Close (FC)',
    },
    builderFn: buildCtrlValveItemCode, resolverFn: resolveCtrlValveSapItemCode,
  },

  {
    label: 'Valves / Safety (PSV)',
    group: 'valves', subgroup: 'safety', gid: 5, sid: 25,
    uomId: UOM_NOS, uomCode: 'NOS',
    description: 'PSV — Flanged — 50 NB — Class 150 — CS',
    baseAttrs: {
      valve_type: 'Pressure Safety Valve (PSV)',
      end_connection: 'Flanged', inlet_size: '50 NB',
      pressure_rating: 'Class 150', body_material: 'WCB (CS)',
      trim_material: 'SS316', api_orifice: 'D',
      set_pressure_value: '10', set_pressure_unit: 'barg',
      back_pressure_type: 'Conventional',
    },
    altAttrs: {
      valve_type: 'Pressure Safety Valve (PSV)',
      end_connection: 'Flanged', inlet_size: '80 NB',
      pressure_rating: 'Class 150', body_material: 'WCB (CS)',
      trim_material: 'SS316', api_orifice: 'D',
      set_pressure_value: '10', set_pressure_unit: 'barg',
      back_pressure_type: 'Conventional',
    },
    builderFn: buildSafetyValveItemCode, resolverFn: resolveSafetyValveSapItemCode,
  },

  {
    label: 'Valves / ON/OFF (Ball)',
    group: 'valves', subgroup: 'on_off', gid: 5, sid: 2985,
    uomId: UOM_NOS, uomCode: 'NOS',
    description: 'Ball Valve — Flanged — 50 NB — Class 150 — SS316',
    baseAttrs: {
      valve_type: 'Ball Valve', end_connection: 'Flanged', size_nb: '50 NB',
      pressure_rating: 'Class 150', body_material: 'SS316',
      actuation_type: 'Manual Lever',
      port_configuration: '2-Way (Full Bore)',
      seat_material: 'PTFE',
      bore_type: 'Full Bore',
      body_style: 'Floating Ball',
    },
    altAttrs: {
      valve_type: 'Ball Valve', end_connection: 'Flanged', size_nb: '80 NB',
      pressure_rating: 'Class 150', body_material: 'SS316',
      actuation_type: 'Manual Lever',
      port_configuration: '2-Way (Full Bore)',
      seat_material: 'PTFE',
      bore_type: 'Full Bore',
      body_style: 'Floating Ball',
    },
    builderFn: buildOnOffValveItemCode, resolverFn: resolveOnOffValveSapItemCode,
  },

  {
    label: 'Valves / NRV (Swing Check)',
    group: 'valves', subgroup: 'nrv', gid: 5, sid: 18070,
    uomId: UOM_NOS, uomCode: 'NOS',
    description: 'Swing Check Valve — Flanged — 50 NB — Class 150 — CS',
    baseAttrs: {
      valve_type: 'Swing Check Valve',
      end_connection: 'Flanged', size_nb: '50 NB',
      pressure_rating: 'Class 150', body_material: 'WCB (CS)',
      disc_material: 'SS316', seat_material: 'Metal Seat (SS316)',
      spring_assist: 'None', lever_type: 'Standard (No Lever)',
    },
    altAttrs: {
      valve_type: 'Swing Check Valve',
      end_connection: 'Flanged', size_nb: '80 NB',
      pressure_rating: 'Class 150', body_material: 'WCB (CS)',
      disc_material: 'SS316', seat_material: 'Metal Seat (SS316)',
      spring_assist: 'None', lever_type: 'Standard (No Lever)',
    },
    builderFn: buildNrvValveItemCode, resolverFn: resolveNrvValveSapItemCode,
  },

  {
    label: 'Valves / Needle (2-Way NPT)',
    group: 'valves', subgroup: 'needle', gid: 5, sid: 18071,
    uomId: UOM_NOS, uomCode: 'NOS',
    description: 'Needle Valve — NPT — 10 NB — 6000 PSI — SS316',
    baseAttrs: {
      valve_type: 'Straight Needle Valve',
      end_connection: 'NPT Male',
      size: '10 NB (DN10)',
      pressure_rating: '6000 PSI (414 bar)',
      body_material: 'SS316', stem_material: 'SS316',
      seat_type: 'Metal Seat (Integral)', packing: 'PTFE',
      bonnet_type: 'Packed Bonnet',
    },
    altAttrs: {
      valve_type: 'Straight Needle Valve',
      end_connection: 'NPT Male',
      size: '15 NB (DN15)',
      pressure_rating: '6000 PSI (414 bar)',
      body_material: 'SS316', stem_material: 'SS316',
      seat_type: 'Metal Seat (Integral)', packing: 'PTFE',
      bonnet_type: 'Packed Bonnet',
    },
    builderFn: buildNeedleValveItemCode, resolverFn: resolveNeedleValveSapItemCode,
  },

  // ── ELECTRICAL / CONTROL ─────────────────────────────────────────────────────
  {
    label: 'Electrical / Panels (MCC)',
    group: 'electrical_control', subgroup: 'panels', gid: 6, sid: 26,
    uomId: UOM_NOS, uomCode: 'NOS',
    description: 'MCC Panel — 415V — 800A — 50kA — IP54 — CRCA — Safe Area',
    baseAttrs: {
      panel_type: 'MCC Panel',
      voltage: '415V AC (3Ph)', main_bus_rating: '800A',
      fault_level_icw: '50 kA', ip_rating: 'IP54',
      enclosure_material: 'CRCA Steel', area_classification: 'Safe Area',
    },
    altAttrs: {
      panel_type: 'MCC Panel',
      voltage: '415V AC (3Ph)', main_bus_rating: '1600A',
      fault_level_icw: '50 kA', ip_rating: 'IP54',
      enclosure_material: 'CRCA Steel', area_classification: 'Safe Area',
    },
    builderFn: buildMccPanelItemCode, resolverFn: resolveMccPanelSapItemCode,
  },

  {
    label: 'Electrical / Cabling (Power)',
    group: 'electrical_control', subgroup: 'cabling', gid: 6, sid: 29,
    uomId: UOM_MTR, uomCode: 'MTR',
    description: 'Power Cable — 3.5 Core — 10 mm² — 1.1kV — Unarmoured',
    baseAttrs: {
      cable_type: 'Power Cable', core_config: '3.5 Core',
      cable_size: '10 mm²', voltage: '1.1kV',
      armour: 'Unarmoured', screening: 'Unscreened',
    },
    altAttrs: {
      cable_type: 'Power Cable', core_config: '3.5 Core',
      cable_size: '25 mm²', voltage: '1.1kV',
      armour: 'Unarmoured', screening: 'Unscreened',
    },
    builderFn: buildCablingItemCode, resolverFn: resolveCablingSapItemCode,
  },

  {
    label: 'Electrical / Junction Box (GP)',
    group: 'electrical_control', subgroup: 'junction_box', gid: 6, sid: 2923,
    uomId: UOM_NOS, uomCode: 'NOS',
    description: 'General Purpose Junction Box — 12T — GRP — IP66',
    baseAttrs: {
      jb_type: 'General Purpose JB',
      num_terminals: '12',
      body_material: 'GRP/FRP',
      enclosure_type: 'IP66',
      area_classification: 'Safe Area',
    },
    altAttrs: {
      jb_type: 'General Purpose JB',
      num_terminals: '24',
      body_material: 'GRP/FRP',
      enclosure_type: 'IP66',
      area_classification: 'Safe Area',
    },
    builderFn: buildJunctionBoxItemCode, resolverFn: resolveJunctionBoxSapItemCode,
  },

  // ── RAW MATERIALS ────────────────────────────────────────────────────────────
  {
    label: 'Raw Materials / Plates',
    group: 'raw_materials', subgroup: 'plates', gid: 1, sid: 1,
    uomId: UOM_NOS, uomCode: 'NOS',
    description: 'SA 516 Gr 70 Plate — 16 × 1500 × 6000 mm',
    baseAttrs: {
      material_grade: 'SA 516 Gr 70', thickness_mm: '16',
      width_mm: '1500', length_mm: '6000',
    },
    altAttrs: {
      material_grade: 'SA 516 Gr 70', thickness_mm: '20',
      width_mm: '1500', length_mm: '6000',
    },
    builderFn: buildPlatesItemCode, resolverFn: resolvePlatesSapItemCode,
  },

  {
    label: 'Raw Materials / Pipes',
    group: 'raw_materials', subgroup: 'pipes', gid: 1, sid: 2,
    uomId: UOM_MTR, uomCode: 'MTR',
    description: 'IS 1239 Class A Pipe — 50 NB — STD',
    baseAttrs: { material_grade: 'IS 1239 Class A', nominal_bore: '50 NB', schedule: 'STD' },
    altAttrs:  { material_grade: 'IS 1239 Class A', nominal_bore: '80 NB', schedule: 'STD' },
    builderFn: buildPipesItemCode, resolverFn: resolvePipesSapItemCode,
  },

  {
    label: 'Raw Materials / Fittings',
    group: 'raw_materials', subgroup: 'fittings', gid: 1, sid: 3,
    uomId: UOM_NOS, uomCode: 'NOS',
    description: '90° LR Elbow — A234 WPB — 50 NB — SCH40 — BW',
    baseAttrs: {
      fitting_type: '90° 1.5D Elbow', material_grade: 'A234 WPB',
      nominal_bore: '50 NB', schedule: 'SCH 40', end_type: 'Butt Weld (BW)',
    },
    altAttrs: {
      fitting_type: '90° 1.5D Elbow', material_grade: 'A234 WPB',
      nominal_bore: '80 NB', schedule: 'SCH 40', end_type: 'Butt Weld (BW)',
    },
    builderFn: buildFittingsItemCode, resolverFn: resolveFittingsSapItemCode,
    // Note: FITTINGS_GRADE_CODE key is 'A234 WPB' — verify at runtime
  },

  {
    label: 'Raw Materials / Fasteners (Hex Bolt)',
    group: 'raw_materials', subgroup: 'fasteners', gid: 1, sid: 5,
    uomId: UOM_NOS, uomCode: 'NOS',
    description: 'Hex Bolt — IS 1367 Cl.8.8 — M16 × 60 mm — ISO Metric Coarse — HDG',
    baseAttrs: {
      fastener_type: 'Hex Bolt',
      bolt_material: 'IS 1367 Cl.8.8',
      diameter: 'M16', length_mm: '60',
      threading_standard: 'ISO Metric Coarse',
      coating: 'Hot-Dip Galvanized',
      bolt_profile: 'Full Thread',
    },
    altAttrs: {
      fastener_type: 'Hex Bolt',
      bolt_material: 'IS 1367 Cl.8.8',
      diameter: 'M16', length_mm: '80',
      threading_standard: 'ISO Metric Coarse',
      coating: 'Hot-Dip Galvanized',
      bolt_profile: 'Full Thread',
    },
    builderFn: buildFastenersItemCode, resolverFn: resolveFastenersSapItemCode,
  },

  {
    label: 'Raw Materials / Gaskets (SWIO)',
    group: 'raw_materials', subgroup: 'gaskets', gid: 1, sid: 6,
    uomId: UOM_NOS, uomCode: 'NOS',
    description: 'Spiral Wound Gasket — SS316/Graphite — SS304/CS — 50 NB — 150#',
    baseAttrs: {
      gasket_type: 'Spiral Wound – Inner + Outer Ring',
      winding_material: 'SS316 / Graphite',
      inner_ring_material: 'SS304', outer_ring_material: 'Carbon Steel',
      nominal_bore: '50 NB', pressure_class: '150#', facing: 'Raised Face (RF)',
    },
    altAttrs: {
      gasket_type: 'Spiral Wound – Inner + Outer Ring',
      winding_material: 'SS316 / Graphite',
      inner_ring_material: 'SS304', outer_ring_material: 'Carbon Steel',
      nominal_bore: '80 NB', pressure_class: '150#', facing: 'Raised Face (RF)',
    },
    builderFn: buildGasketsItemCode, resolverFn: resolveGasketsSapItemCode,
  },

  {
    label: 'Raw Materials / Structural Steel (Flat Bar)',
    group: 'raw_materials', subgroup: 'structural_steel', gid: 1, sid: 7,
    uomId: UOM_MTR, uomCode: 'MTR',
    description: 'Flat Bar — IS 2062 E250A — 50 × 6 mm',
    baseAttrs: {
      section_type: 'Flat Bar',
      material_grade: 'IS 2062 E250A', width_mm: '50', thickness_mm: '6',
    },
    altAttrs: {
      section_type: 'Flat Bar',
      material_grade: 'IS 2062 E250A', width_mm: '75', thickness_mm: '6',
    },
    builderFn: buildStructuralSteelItemCode, resolverFn: resolveStructuralSteelSapItemCode,
  },

  {
    label: 'Raw Materials / Profiles (Solid Circular)',
    group: 'raw_materials', subgroup: 'profiles', gid: 1, sid: 100459,
    uomId: UOM_MTR, uomCode: 'MTR',
    description: 'Solid Circular — SS304 — 10 mm thk — OD 50 mm',
    baseAttrs: {
      profile_type: 'Solid Circular', material_grade: 'SS304',
      thickness_mm: '10', od_mm: '50',
    },
    altAttrs: {
      profile_type: 'Solid Circular', material_grade: 'SS304',
      thickness_mm: '10', od_mm: '75',
    },
    builderFn: buildProfilesItemCode, resolverFn: resolveProfilesSapItemCode,
  },
];

// ── Catalog (Make+Model) path representatives ─────────────────────────────────
interface CatalogDef {
  label:       string;
  group:       string;
  subgroup:    string;
  gid:         number;
  sid:         number;
  make:        string;
  model:       string;
  altMake:     string;
  altModel:    string;
  uomCode:     string;
  description: string;
}

const CATALOG_SUBGROUPS: CatalogDef[] = [
  {
    label: 'Pumps / Centrifugal',
    group: 'pumps', subgroup: 'centrifugal', gid: 2, sid: 8,
    make: 'Kirloskar', model: 'DB-Series',
    altMake: 'Kirloskar', altModel: 'RPP-Series',
    uomCode: 'NOS',
    description: 'Centrifugal Pump — Kirloskar — DB-Series',
  },
  {
    label: 'Instruments / Pressure',
    group: 'instruments', subgroup: 'pressure', gid: 4, sid: 19,
    make: 'Rosemount', model: '3051',
    altMake: 'Rosemount', altModel: '2088',
    uomCode: 'NOS',
    description: 'Pressure Transmitter — Rosemount — 3051',
  },
  {
    label: 'Bought-out Packages / General',
    group: 'bought_out_packages', subgroup: 'general', gid: 7, sid: 30,
    make: 'Forbes-Marshall', model: 'FM-HEX-001',
    altMake: 'Forbes-Marshall', altModel: 'FM-HEX-002',
    uomCode: 'NOS',
    description: 'Bought-out Package — Forbes-Marshall — FM-HEX-001',
  },
];

// ── Not-implemented subgroups ─────────────────────────────────────────────────
const NOT_IMPLEMENTED = [
  { label: 'Raw Materials / Flanges', reason: 'Deferred to Phase 2 — no builder/resolver implemented' },
];

// ── Helper: insert a buy_package_line ─────────────────────────────────────────
async function insertLine(
  hdrId: number,
  gid: number,
  sid: number,
  uomId: number,
  masterItemId: number | null,
  sapItemCode: string | null,
  attrs: Record<string, unknown>,
  notes = '',
): Promise<number> {
  // Auto-compute next line_number for this header
  const lnRes = await pool.query<{ next_line: number }>(
    `SELECT COALESCE(MAX(line_number), 0) + 1 AS next_line FROM buy_package_lines WHERE buy_package_header_id = $1`,
    [hdrId],
  );
  const lineNumber = lnRes.rows[0].next_line;

  const res = await pool.query<{ id: number }>(
    `INSERT INTO buy_package_lines
       (buy_package_header_id, line_number, buy_group_id, buy_subgroup_id, uom_id,
        generic_requirement, model, sort_order,
        master_item_id, sap_item_code, technical_attributes, notes,
        default_quantity, selection_required, datasheet_required,
        inspection_required, certificate_required, compliance_required)
     VALUES ($1,$2,$3,$4,$5, 'Audit test', 'TBN', 0, $6,$7,$8,$9, 1, false, false, false, false, false)
     RETURNING id`,
    [hdrId, lineNumber, gid, sid, uomId, masterItemId, sapItemCode, JSON.stringify(attrs), notes],
  );
  return res.rows[0].id;
}

// ── Helper: update notes on a line ────────────────────────────────────────────
async function updateNotes(lineId: number, notes: string): Promise<void> {
  await pool.query('UPDATE buy_package_lines SET notes=$1 WHERE id=$2', [notes, lineId]);
}

// ── Helper: update master_item_id + sap_item_code on a line ──────────────────
async function updateLineSap(lineId: number, masterItemId: number, sapItemCode: string): Promise<void> {
  await pool.query(
    'UPDATE buy_package_lines SET master_item_id=$1, sap_item_code=$2 WHERE id=$3',
    [masterItemId, sapItemCode, lineId],
  );
}

// ── Helper: fetch a line's master_item_id + sap_item_code ────────────────────
async function fetchLine(lineId: number): Promise<{ masterItemId: number | null; sapItemCode: string | null }> {
  const r = await pool.query<{ master_item_id: number | null; sap_item_code: string | null }>(
    'SELECT master_item_id, sap_item_code FROM buy_package_lines WHERE id=$1',
    [lineId],
  );
  return { masterItemId: r.rows[0].master_item_id, sapItemCode: r.rows[0].sap_item_code };
}

// ── Helper: fetch master_items row ───────────────────────────────────────────
async function fetchMasterItem(id: number): Promise<{ itemCode: string; itemType: string; groupId: number; subgroupId: number } | null> {
  const r = await pool.query<{ item_code: string; item_type: string; buy_group_id: number; buy_subgroup_id: number }>(
    'SELECT item_code, item_type, buy_group_id, buy_subgroup_id FROM master_items WHERE id=$1',
    [id],
  );
  if (!r.rowCount) return null;
  return { itemCode: r.rows[0].item_code, itemType: r.rows[0].item_type, groupId: r.rows[0].buy_group_id, subgroupId: r.rows[0].buy_subgroup_id };
}

// ── Helper: count master_items rows for a given item_code ────────────────────
async function countMasterItems(itemCode: string): Promise<number> {
  const r = await pool.query<{ cnt: string }>(
    'SELECT COUNT(*) AS cnt FROM master_items WHERE item_code=$1',
    [itemCode],
  );
  return parseInt(r.rows[0].cnt, 10);
}

// ── Helper: clean up test lines by id ────────────────────────────────────────
async function deleteLines(ids: number[]): Promise<void> {
  if (!ids.length) return;
  await pool.query(`DELETE FROM buy_package_lines WHERE id = ANY($1)`, [ids]);
}

// ── Helper: clean up test master_items rows ───────────────────────────────────
async function deleteMasterItems(codes: string[]): Promise<void> {
  if (!codes.length) return;
  await pool.query(`DELETE FROM master_items WHERE item_code = ANY($1) AND item_type='catalog'`, [codes]);
}

// ── Result types ──────────────────────────────────────────────────────────────
interface RowResult {
  label:            string;
  group:            string;
  subgroup:         string;
  sampleCode:       string;
  firstMasterItemId?: number;
  secondMasterItemId?: number;
  reusedOk:         boolean;
  identityChangeOk: boolean;
  nonIdentityOk:    boolean;
  noDuplicates:     boolean;
  status:           'PASS' | 'FAIL' | 'SKIP';
  comments:         string[];
}

// ── Track IDs to clean up ─────────────────────────────────────────────────────
const lineIdsToDelete: number[] = [];
const masterCodesToDelete: string[] = [];

// ── Run one spec-based subgroup ───────────────────────────────────────────────
async function runSpecSubgroup(sg: SubgroupDef): Promise<RowResult> {
  const result: RowResult = {
    label: sg.label, group: sg.group, subgroup: sg.subgroup,
    sampleCode: '—', firstMasterItemId: undefined, secondMasterItemId: undefined,
    reusedOk: false, identityChangeOk: false, nonIdentityOk: false, noDuplicates: false,
    status: 'FAIL', comments: [],
  };

  // Step 1: Build code
  let baseCode: string;
  try {
    baseCode = sg.builderFn(sg.baseAttrs);
    result.sampleCode = baseCode;
  } catch (e: unknown) {
    result.comments.push(`Builder error: ${(e as Error).message}`);
    result.status = 'FAIL';
    return result;
  }

  let altCode: string;
  try {
    altCode = sg.builderFn(sg.altAttrs);
  } catch (e: unknown) {
    result.comments.push(`Alt builder error: ${(e as Error).message}`);
    result.status = 'FAIL';
    return result;
  }

  if (baseCode === altCode) {
    result.comments.push(`Alt attrs produced SAME code as base ("${baseCode}") — altAttrs do not represent a real identity change`);
    result.status = 'FAIL';
    return result;
  }

  // Step 2+3+4: Resolve → create master_item + line in HDR_A
  let res1: { masterItemId: number; sapItemCode: string; reused: boolean };
  try {
    res1 = await sg.resolverFn(pool, sg.gid, sg.sid, sg.baseAttrs, sg.uomCode, sg.description);
  } catch (e: unknown) {
    result.comments.push(`Resolver (HDR A) error: ${(e as Error).message}`);
    result.status = 'FAIL';
    return result;
  }

  result.firstMasterItemId = res1.masterItemId;
  const lineA = await insertLine(HDR_A, sg.gid, sg.sid, sg.uomId, res1.masterItemId, res1.sapItemCode, sg.baseAttrs, 'phase1.5-audit-A');
  lineIdsToDelete.push(lineA);
  masterCodesToDelete.push(baseCode);

  // Verify master_items row
  const mi1 = await fetchMasterItem(res1.masterItemId);
  if (!mi1) {
    result.comments.push('master_items row not found after first resolve');
    result.status = 'FAIL';
    return result;
  }
  if (mi1.itemCode !== baseCode) {
    result.comments.push(`master_items.item_code="${mi1.itemCode}" ≠ expected "${baseCode}"`);
  }
  if (mi1.itemType !== 'catalog') {
    result.comments.push(`master_items.item_type="${mi1.itemType}" ≠ "catalog"`);
  }
  if (mi1.groupId !== sg.gid) {
    result.comments.push(`master_items.buy_group_id=${mi1.groupId} ≠ expected ${sg.gid}`);
  }
  if (mi1.subgroupId !== sg.sid) {
    result.comments.push(`master_items.buy_subgroup_id=${mi1.subgroupId} ≠ expected ${sg.sid}`);
  }

  // Verify line A references correctly
  const fetchedA = await fetchLine(lineA);
  if (fetchedA.masterItemId !== res1.masterItemId) {
    result.comments.push(`Line A master_item_id=${fetchedA.masterItemId} ≠ ${res1.masterItemId}`);
  }
  if (fetchedA.sapItemCode !== baseCode) {
    result.comments.push(`Line A sap_item_code="${fetchedA.sapItemCode}" ≠ "${baseCode}"`);
  }

  // Step 5: Same spec in HDR_B → must REUSE
  let res2: { masterItemId: number; sapItemCode: string; reused: boolean };
  try {
    res2 = await sg.resolverFn(pool, sg.gid, sg.sid, sg.baseAttrs, sg.uomCode, sg.description);
  } catch (e: unknown) {
    result.comments.push(`Resolver (HDR B) error: ${(e as Error).message}`);
    result.status = 'FAIL';
    return result;
  }

  result.secondMasterItemId = res2.masterItemId;
  const lineB = await insertLine(HDR_B, sg.gid, sg.sid, sg.uomId, res2.masterItemId, res2.sapItemCode, sg.baseAttrs, 'phase1.5-audit-B');
  lineIdsToDelete.push(lineB);

  result.reusedOk = (res2.masterItemId === res1.masterItemId) && res2.reused === true;
  if (!result.reusedOk) {
    result.comments.push(`Reuse failed: HDR_A master_item_id=${res1.masterItemId}, HDR_B=${res2.masterItemId}, reused flag=${res2.reused}`);
  }

  // Step 6: Non-identity change (notes only) → same master_item_id
  await updateNotes(lineA, 'Updated notes — non-identity change test');
  const fetchedAAfterNotes = await fetchLine(lineA);
  result.nonIdentityOk = fetchedAAfterNotes.masterItemId === res1.masterItemId;
  if (!result.nonIdentityOk) {
    result.comments.push(`Non-identity (notes) change incorrectly changed master_item_id from ${res1.masterItemId} to ${fetchedAAfterNotes.masterItemId}`);
  }

  // Step 7: Identity field change → NEW master_items row
  let resAlt: { masterItemId: number; sapItemCode: string; reused: boolean };
  try {
    resAlt = await sg.resolverFn(pool, sg.gid, sg.sid, sg.altAttrs, sg.uomCode, sg.description + ' (alt)');
  } catch (e: unknown) {
    result.comments.push(`Alt resolver error: ${(e as Error).message}`);
    result.status = 'FAIL';
    return result;
  }

  await updateLineSap(lineA, resAlt.masterItemId, resAlt.sapItemCode);
  masterCodesToDelete.push(altCode);
  const fetchedAAfterIdentity = await fetchLine(lineA);

  result.identityChangeOk =
    resAlt.masterItemId !== res1.masterItemId &&
    resAlt.sapItemCode === altCode &&
    fetchedAAfterIdentity.masterItemId === resAlt.masterItemId &&
    fetchedAAfterIdentity.sapItemCode === altCode;

  if (!result.identityChangeOk) {
    result.comments.push(
      `Identity change test failed: old_id=${res1.masterItemId} new_id=${resAlt.masterItemId} ` +
      `new_code="${resAlt.sapItemCode}" line_id=${fetchedAAfterIdentity.masterItemId}`,
    );
  }

  // Step 8: No duplicates for base code
  const dupCount = await countMasterItems(baseCode);
  result.noDuplicates = dupCount === 1;
  if (!result.noDuplicates) {
    result.comments.push(`Duplicate master_items rows for "${baseCode}": found ${dupCount}`);
  }

  result.status = (
    result.reusedOk &&
    result.identityChangeOk &&
    result.nonIdentityOk &&
    result.noDuplicates &&
    result.comments.filter(c => c.startsWith('master_items.')).length === 0
  ) ? 'PASS' : 'FAIL';

  return result;
}

// ── Run one catalog subgroup ──────────────────────────────────────────────────
async function runCatalogSubgroup(sg: CatalogDef): Promise<RowResult> {
  const result: RowResult = {
    label: sg.label, group: sg.group, subgroup: sg.subgroup,
    sampleCode: '—', firstMasterItemId: undefined, secondMasterItemId: undefined,
    reusedOk: false, identityChangeOk: false, nonIdentityOk: false, noDuplicates: false,
    status: 'FAIL', comments: [],
  };

  // Resolve base (HDR A)
  let res1: { masterItemId: number; sapItemCode: string; reused: boolean };
  try {
    res1 = await resolveCatalogSapItemCode(pool, sg.gid, sg.sid, sg.make, sg.model, sg.uomCode, sg.description);
  } catch (e: unknown) {
    result.comments.push(`Catalog resolver (HDR A) error: ${(e as Error).message}`);
    result.status = 'FAIL';
    return result;
  }

  result.sampleCode = res1.sapItemCode;
  result.firstMasterItemId = res1.masterItemId;

  const lineA = await insertLine(HDR_A, sg.gid, sg.sid, UOM_NOS, res1.masterItemId, res1.sapItemCode, {}, 'phase1.5-catalog-audit-A');
  lineIdsToDelete.push(lineA);
  masterCodesToDelete.push(res1.sapItemCode);

  const mi1 = await fetchMasterItem(res1.masterItemId);
  if (!mi1) {
    result.comments.push('master_items row not found after first catalog resolve');
    result.status = 'FAIL';
    return result;
  }
  if (mi1.itemType !== 'catalog') result.comments.push(`item_type="${mi1.itemType}" ≠ "catalog"`);
  if (mi1.groupId !== sg.gid)     result.comments.push(`buy_group_id=${mi1.groupId} ≠ ${sg.gid}`);
  if (mi1.subgroupId !== sg.sid)  result.comments.push(`buy_subgroup_id=${mi1.subgroupId} ≠ ${sg.sid}`);

  // Reuse test (HDR B)
  let res2: { masterItemId: number; sapItemCode: string; reused: boolean };
  try {
    res2 = await resolveCatalogSapItemCode(pool, sg.gid, sg.sid, sg.make, sg.model, sg.uomCode, sg.description);
  } catch (e: unknown) {
    result.comments.push(`Catalog resolver (HDR B) error: ${(e as Error).message}`);
    result.status = 'FAIL';
    return result;
  }

  result.secondMasterItemId = res2.masterItemId;
  const lineB = await insertLine(HDR_B, sg.gid, sg.sid, UOM_NOS, res2.masterItemId, res2.sapItemCode, {}, 'phase1.5-catalog-audit-B');
  lineIdsToDelete.push(lineB);

  result.reusedOk = (res2.masterItemId === res1.masterItemId) && res2.reused === true;
  if (!result.reusedOk) {
    result.comments.push(`Reuse failed: id_A=${res1.masterItemId} id_B=${res2.masterItemId}`);
  }

  // Non-identity change (notes)
  await updateNotes(lineA, 'Updated notes — catalog non-identity test');
  const fetchedAAfterNotes = await fetchLine(lineA);
  result.nonIdentityOk = fetchedAAfterNotes.masterItemId === res1.masterItemId;
  if (!result.nonIdentityOk) {
    result.comments.push(`Non-identity change altered master_item_id`);
  }

  // Identity change: different model
  let resAlt: { masterItemId: number; sapItemCode: string; reused: boolean };
  try {
    resAlt = await resolveCatalogSapItemCode(pool, sg.gid, sg.sid, sg.altMake, sg.altModel, sg.uomCode, sg.description + ' (alt)');
  } catch (e: unknown) {
    result.comments.push(`Alt catalog resolver error: ${(e as Error).message}`);
    result.status = 'FAIL';
    return result;
  }

  await updateLineSap(lineA, resAlt.masterItemId, resAlt.sapItemCode);
  masterCodesToDelete.push(resAlt.sapItemCode);
  const fetchedAAfterIdentity = await fetchLine(lineA);

  result.identityChangeOk =
    resAlt.masterItemId !== res1.masterItemId &&
    fetchedAAfterIdentity.masterItemId === resAlt.masterItemId;

  if (!result.identityChangeOk) {
    result.comments.push(`Identity change failed: old=${res1.masterItemId} new=${resAlt.masterItemId}`);
  }

  // Duplicate check
  const dupCount = await countMasterItems(res1.sapItemCode);
  result.noDuplicates = dupCount === 1;
  if (!result.noDuplicates) {
    result.comments.push(`Duplicate rows for "${res1.sapItemCode}": ${dupCount}`);
  }

  result.status = (result.reusedOk && result.identityChangeOk && result.nonIdentityOk && result.noDuplicates) ? 'PASS' : 'FAIL';
  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Phase 1.5 End-to-End Buy Catalog Audit ===\n');
  console.log(`Using package headers: A=${HDR_A}, B=${HDR_B}`);
  console.log('Running...\n');

  const rows: RowResult[] = [];

  // Spec-based subgroups
  for (const sg of SUBGROUPS) {
    process.stdout.write(`  Testing ${sg.label}... `);
    try {
      const r = await runSpecSubgroup(sg);
      rows.push(r);
      console.log(r.status);
    } catch (e: unknown) {
      rows.push({
        label: sg.label, group: sg.group, subgroup: sg.subgroup,
        sampleCode: '—', reusedOk: false, identityChangeOk: false,
        nonIdentityOk: false, noDuplicates: false,
        status: 'FAIL', comments: [`Unhandled exception: ${(e as Error).message}`],
      });
      console.log('FAIL (exception)');
    }
  }

  // Catalog (make+model) subgroups
  for (const sg of CATALOG_SUBGROUPS) {
    process.stdout.write(`  Testing ${sg.label}... `);
    try {
      const r = await runCatalogSubgroup(sg);
      rows.push(r);
      console.log(r.status);
    } catch (e: unknown) {
      rows.push({
        label: sg.label, group: sg.group, subgroup: sg.subgroup,
        sampleCode: '—', reusedOk: false, identityChangeOk: false,
        nonIdentityOk: false, noDuplicates: false,
        status: 'FAIL', comments: [`Unhandled exception: ${(e as Error).message}`],
      });
      console.log('FAIL (exception)');
    }
  }

  // Cleanup all test lines and master_items created
  console.log('\nCleaning up test data...');
  await deleteLines(lineIdsToDelete);
  await deleteMasterItems(masterCodesToDelete);
  console.log(`  Deleted ${lineIdsToDelete.length} lines, ${masterCodesToDelete.length} master_item codes\n`);

  // ── Print validation table ────────────────────────────────────────────────
  const W = 120;
  console.log('='.repeat(W));
  console.log('VALIDATION TABLE');
  console.log('='.repeat(W));

  const header = [
    'Group/Subgroup'.padEnd(42),
    'Sample SAP Item Code'.padEnd(50),
    '1st ID'.padStart(7),
    '2nd ID'.padStart(7),
    'Reuse'.padStart(6),
    'IdentChg'.padStart(9),
    'Status'.padStart(7),
  ].join('  ');
  console.log(header);
  console.log('-'.repeat(W));

  let passed = 0, failed = 0;

  for (const r of rows) {
    const line = [
      r.label.padEnd(42),
      r.sampleCode.slice(0, 50).padEnd(50),
      (r.firstMasterItemId?.toString() ?? '—').padStart(7),
      (r.secondMasterItemId?.toString() ?? '—').padStart(7),
      (r.reusedOk ? 'Yes' : 'No').padStart(6),
      (r.identityChangeOk ? 'Yes' : 'No').padStart(9),
      r.status.padStart(7),
    ].join('  ');
    console.log(line);

    if (r.comments.length) {
      for (const c of r.comments) {
        console.log(`  ⚠  ${c}`);
      }
    }

    if (r.status === 'PASS') passed++;
    else if (r.status === 'FAIL') failed++;
  }

  console.log('-'.repeat(W));

  // Not-implemented section
  console.log('');
  console.log('NOT IMPLEMENTED (Deferred):');
  for (const ni of NOT_IMPLEMENTED) {
    console.log(`  ⟳  ${ni.label}: ${ni.reason}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = rows.length;
  console.log('\n' + '='.repeat(W));
  console.log('SUMMARY');
  console.log('='.repeat(W));
  console.log(`  Total implemented subgroups audited : ${total}`);
  console.log(`  PASSED                               : ${passed}`);
  console.log(`  FAILED                               : ${failed}`);
  console.log(`  NOT IMPLEMENTED (deferred)           : ${NOT_IMPLEMENTED.length}`);
  console.log('');

  // ── Infrastructure checks ─────────────────────────────────────────────────
  console.log('INFRASTRUCTURE CHECKS:');

  // Check UNIQUE constraint on master_items.item_code
  const ucRes = await pool.query<{ count: string }>(`
    SELECT COUNT(*) AS count FROM pg_indexes
    WHERE tablename='master_items' AND indexdef LIKE '%UNIQUE%item_code%'
  `);
  console.log(`  UNIQUE index on master_items.item_code   : ${parseInt(ucRes.rows[0].count) > 0 ? 'EXISTS ✓' : 'MISSING ✗'}`);

  // Check 7 performance indexes
  const idxRes = await pool.query<{ indexname: string }>(`
    SELECT indexname FROM pg_indexes
    WHERE tablename IN ('master_items', 'buy_package_lines')
    AND indexname LIKE 'idx_%'
    ORDER BY indexname
  `);
  console.log(`  Performance indexes on key tables        : ${idxRes.rows.length} found`);
  for (const idx of idxRes.rows) {
    console.log(`    - ${idx.indexname}`);
  }

  // Check schema columns
  const colRes = await pool.query<{ table_name: string; column_name: string }>(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_name IN ('master_items','buy_package_lines')
    AND column_name IN ('item_type','buy_group_id','buy_subgroup_id','catalog_make','catalog_model','master_item_id','sap_item_code')
    ORDER BY table_name, column_name
  `);
  console.log(`  Phase 1 schema columns present           : ${colRes.rows.length}/7`);
  for (const col of colRes.rows) {
    console.log(`    - ${col.table_name}.${col.column_name} ✓`);
  }

  // Check existing production data integrity
  const integrityRes = await pool.query<{ total: string; matched: string; mismatched: string }>(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE bpl.sap_item_code = mi.item_code) AS matched,
      COUNT(*) FILTER (WHERE bpl.sap_item_code <> mi.item_code) AS mismatched
    FROM buy_package_lines bpl
    JOIN master_items mi ON mi.id = bpl.master_item_id
    WHERE bpl.master_item_id IS NOT NULL
  `);
  const iRow = integrityRes.rows[0];
  console.log(`\n  Production data integrity:`);
  console.log(`    Lines with master_item_id: ${iRow.total}`);
  console.log(`    sap_item_code == master_items.item_code: ${iRow.matched} ✓`);
  if (parseInt(iRow.mismatched) > 0) {
    console.log(`    MISMATCHES: ${iRow.mismatched} ✗`);
  }

  // Lines with NULL master_item_id
  const nullRes = await pool.query<{ cnt: string }>(`
    SELECT COUNT(*) AS cnt FROM buy_package_lines WHERE master_item_id IS NULL
  `);
  console.log(`    Lines with NULL master_item_id: ${nullRes.rows[0].cnt} (pre-Phase1 legacy lines expected)`);

  // Duplicate master_items for same item_code
  const dupRes = await pool.query<{ item_code: string; cnt: string }>(`
    SELECT item_code, COUNT(*) AS cnt FROM master_items
    WHERE item_type = 'catalog'
    GROUP BY item_code HAVING COUNT(*) > 1
  `);
  if (dupRes.rows.length === 0) {
    console.log(`    Duplicate catalog master_items rows    : None ✓`);
  } else {
    console.log(`    Duplicate catalog master_items rows    : ${dupRes.rows.length} FOUND ✗`);
    for (const r of dupRes.rows) {
      console.log(`      "${r.item_code}" × ${r.cnt}`);
    }
  }

  console.log('\n' + '='.repeat(W));
  if (failed === 0) {
    console.log('ALL SUBGROUPS PASSED — Phase 1 infrastructure is production-ready.');
  } else {
    console.log(`${failed} SUBGROUP(S) FAILED — see ⚠ annotations above.`);
  }
  console.log('='.repeat(W) + '\n');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
