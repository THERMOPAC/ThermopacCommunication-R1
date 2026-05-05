/**
 * PPPC Centralized Services
 * ─────────────────────────
 * All cross-cutting concerns for the Project Procurement Package Control module:
 *   • Subgroup ↔ Group membership validation  (API-layer only — no DB CHECK)
 *   • GCS object-path construction            (server-only — clients never build paths)
 *   • Idempotent master-data seeding          (buy_groups · buy_subgroups · uom_master)
 *
 * Seed data is taken verbatim from the PPPC approved baseline document.
 */

import { Pool } from '@neondatabase/serverless';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Subgroup membership validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the given subgroup belongs to the given group.
 * Called at API layer before any write that binds a line to a subgroup.
 * No DB CHECK constraint — validation lives here only.
 */
export async function validateSubgroupBelongsToGroup(
  pool: Pool,
  buyGroupId: number,
  buySubgroupId: number,
): Promise<boolean> {
  const result = await pool.query(
    `SELECT id FROM buy_subgroups WHERE id = $1 AND buy_group_id = $2`,
    [buySubgroupId, buyGroupId],
  );
  return result.rowCount !== null && result.rowCount > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. GCS object-path construction  (Baseline §GCS-PATH)
//    Pattern:
//    TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/DATASHEETS/{listNumber}/{tagNo}/{lineId}_ds-rev-{seq}.{ext}
//    Bucket = thermopac_storage  — stored separately, NOT part of the object path.
// ─────────────────────────────────────────────────────────────────────────────

export interface DatasheetGcsPathParams {
  continentCode: string;
  countryCode:   string;
  customerCode:  string;
  fyCode:        string;
  projectSeq:    string;
  listNumber:    string;
  tagNo:         string;
  lineId:        number | string;
  revisionSeq:   number | string;
  ext:           string;
}

export function buildDatasheetGcsPath(p: DatasheetGcsPathParams): string {
  const safeTag = p.tagNo.replace(/[^A-Za-z0-9\-_]/g, '_');
  const safeExt = p.ext.toLowerCase().replace(/^\./, '');
  return (
    `TPEL/${p.continentCode}/${p.countryCode}/${p.customerCode}` +
    `/${p.fyCode}/${p.projectSeq}/PROCUREMENT/DATASHEETS` +
    `/${p.listNumber}/${safeTag}` +
    `/${p.lineId}_ds-rev-${p.revisionSeq}.${safeExt}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Seed data — EXACTLY per approved PPPC baseline
//    buy_groups (7) · buy_subgroups (30) · uom_master (25)
// ─────────────────────────────────────────────────────────────────────────────

interface SeedGroup {
  code: string;
  label: string;
  sortOrder: number;
  subgroups: Array<{ code: string; label: string; sortOrder: number }>;
}

export const PPPC_SEED_GROUPS: SeedGroup[] = [
  // ── 1. Raw Materials ────────────────────────────────────────────────────────
  {
    code: 'raw_materials', label: 'Raw Materials', sortOrder: 1,
    subgroups: [
      { code: 'raw_mat_plates',           label: 'Plates',           sortOrder: 1 },
      { code: 'raw_mat_pipes',            label: 'Pipes',            sortOrder: 2 },
      { code: 'raw_mat_fittings',         label: 'Fittings',         sortOrder: 3 },
      { code: 'raw_mat_flanges',          label: 'Flanges',          sortOrder: 4 },
      { code: 'raw_mat_fasteners',        label: 'Fasteners',        sortOrder: 5 },
      { code: 'raw_mat_gaskets',          label: 'Gaskets',          sortOrder: 6 },
      { code: 'raw_mat_structural_steel', label: 'Structural Steel', sortOrder: 7 },
    ],
  },
  // ── 2. Pumps ─────────────────────────────────────────────────────────────────
  {
    code: 'pumps', label: 'Pumps', sortOrder: 2,
    subgroups: [
      { code: 'pump_centrifugal',      label: 'Centrifugal',        sortOrder: 1 },
      { code: 'pump_gear',             label: 'Gear',               sortOrder: 2 },
      { code: 'pump_screw',            label: 'Screw',              sortOrder: 3 },
      { code: 'pump_multistage',       label: 'Multistage',         sortOrder: 4 },
      { code: 'pump_dosing_metering',  label: 'Dosing / Metering',  sortOrder: 5 },
      { code: 'pump_skid_packages',    label: 'Pump Skid Packages', sortOrder: 6 },
    ],
  },
  // ── 3. Motors ────────────────────────────────────────────────────────────────
  {
    code: 'motors', label: 'Motors', sortOrder: 3,
    subgroups: [
      { code: 'motor_non_flameproof',       label: 'Non-Flameproof',       sortOrder: 1 },
      { code: 'motor_flameproof',           label: 'Flameproof',           sortOrder: 2 },
      { code: 'motor_vertical_horizontal',  label: 'Vertical / Horizontal', sortOrder: 3 },
      { code: 'motor_ie3_ie4',              label: 'IE3/IE4',              sortOrder: 4 },
      { code: 'motor_vfd_compatible',       label: 'VFD Compatible',       sortOrder: 5 },
    ],
  },
  // ── 4. Instruments ───────────────────────────────────────────────────────────
  {
    code: 'instruments', label: 'Instruments', sortOrder: 4,
    subgroups: [
      { code: 'inst_pressure',    label: 'Pressure',    sortOrder: 1 },
      { code: 'inst_temperature', label: 'Temperature', sortOrder: 2 },
      { code: 'inst_flow',        label: 'Flow',        sortOrder: 3 },
      { code: 'inst_level',       label: 'Level',       sortOrder: 4 },
    ],
  },
  // ── 5. Valves ────────────────────────────────────────────────────────────────
  {
    code: 'valves', label: 'Valves', sortOrder: 5,
    subgroups: [
      { code: 'valve_isolation', label: 'Isolation', sortOrder: 1 },
      { code: 'valve_control',   label: 'Control',   sortOrder: 2 },
      { code: 'valve_safety',    label: 'Safety',    sortOrder: 3 },
    ],
  },
  // ── 6. Electrical / Control ──────────────────────────────────────────────────
  {
    code: 'electrical_control', label: 'Electrical / Control', sortOrder: 6,
    subgroups: [
      { code: 'elec_panels',      label: 'Panels',      sortOrder: 1 },
      { code: 'elec_components',  label: 'Components',  sortOrder: 2 },
      { code: 'elec_field_items', label: 'Field Items', sortOrder: 3 },
      { code: 'elec_cabling',     label: 'Cabling',     sortOrder: 4 },
    ],
  },
  // ── 7. Bought-out Packages ───────────────────────────────────────────────────
  {
    code: 'bought_out_packages', label: 'Bought-out Packages', sortOrder: 7,
    subgroups: [
      { code: 'bop_general', label: 'General Bought-out Package', sortOrder: 1 },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 4. Seed data — uom_master (25 rows across 7 categories)
//    Per approved baseline (standard engineering UOMs)
// ─────────────────────────────────────────────────────────────────────────────

export const PPPC_SEED_UOMS: Array<{
  code: string; label: string; category: string; sortOrder: number;
}> = [
  // Mass
  { code: 'KG',  label: 'Kilogram',                 category: 'Mass',     sortOrder:  1 },
  { code: 'MT',  label: 'Metric Tonne',              category: 'Mass',     sortOrder:  2 },
  { code: 'G',   label: 'Gram',                      category: 'Mass',     sortOrder:  3 },
  { code: 'LB',  label: 'Pound',                     category: 'Mass',     sortOrder:  4 },
  // Length / Area / Volume
  { code: 'M',   label: 'Metre',                     category: 'Length',   sortOrder:  5 },
  { code: 'MM',  label: 'Millimetre',                category: 'Length',   sortOrder:  6 },
  { code: 'FT',  label: 'Foot',                      category: 'Length',   sortOrder:  7 },
  { code: 'M2',  label: 'Square Metre',              category: 'Area',     sortOrder:  8 },
  { code: 'M3',  label: 'Cubic Metre',               category: 'Volume',   sortOrder:  9 },
  { code: 'LTR', label: 'Litre',                     category: 'Volume',   sortOrder: 10 },
  // Count / Discrete
  { code: 'NO',  label: 'Number (Count)',            category: 'Count',    sortOrder: 11 },
  { code: 'LOT', label: 'Lot',                       category: 'Count',    sortOrder: 12 },
  { code: 'SET', label: 'Set',                       category: 'Count',    sortOrder: 13 },
  { code: 'PR',  label: 'Pair',                      category: 'Count',    sortOrder: 14 },
  { code: 'PKT', label: 'Packet',                    category: 'Count',    sortOrder: 15 },
  // Time / Service
  { code: 'HR',  label: 'Hour',                      category: 'Time',     sortOrder: 16 },
  { code: 'DAY', label: 'Day',                       category: 'Time',     sortOrder: 17 },
  { code: 'WK',  label: 'Week',                      category: 'Time',     sortOrder: 18 },
  { code: 'MO',  label: 'Month',                     category: 'Time',     sortOrder: 19 },
  { code: 'LS',  label: 'Lump Sum',                  category: 'Service',  sortOrder: 20 },
  // Electrical / Power
  { code: 'KW',  label: 'Kilowatt',                  category: 'Power',    sortOrder: 21 },
  { code: 'KVA', label: 'Kilovolt-Ampere',           category: 'Power',    sortOrder: 22 },
  // Pressure / Flow
  { code: 'BAR', label: 'Bar',                       category: 'Pressure', sortOrder: 23 },
  { code: 'NM3', label: 'Nm³ (Normal Cubic Metre)',  category: 'Flow',     sortOrder: 24 },
  { code: 'M3H', label: 'm³/hr',                     category: 'Flow',     sortOrder: 25 },
];

// ─────────────────────────────────────────────────────────────────────────────
// 5. Idempotent seed runner
//    Called once at application start from pppc-routes.ts
//    Uses ON CONFLICT DO NOTHING — safe to re-run every boot
// ─────────────────────────────────────────────────────────────────────────────

export async function seedPppcMasterData(pool: Pool): Promise<void> {
  try {
    for (const grp of PPPC_SEED_GROUPS) {
      await pool.query(
        `INSERT INTO buy_groups (code, label, sort_order, is_active)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (code) DO NOTHING`,
        [grp.code, grp.label, grp.sortOrder],
      );

      const grpRow = await pool.query(
        `SELECT id FROM buy_groups WHERE code = $1`,
        [grp.code],
      );
      if (!grpRow.rowCount) continue;
      const grpId = grpRow.rows[0].id;

      for (const sub of grp.subgroups) {
        await pool.query(
          `INSERT INTO buy_subgroups (buy_group_id, code, label, sort_order, is_active)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT DO NOTHING`,
          [grpId, sub.code, sub.label, sub.sortOrder],
        );
      }
    }

    for (const uom of PPPC_SEED_UOMS) {
      await pool.query(
        `INSERT INTO uom_master (code, label, category, sort_order, is_active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (code) DO NOTHING`,
        [uom.code, uom.label, uom.category, uom.sortOrder],
      );
    }

    console.log('[PPPC-Seed] ✅ buy_groups, buy_subgroups, uom_master seeded (idempotent).');
  } catch (err) {
    console.error('[PPPC-Seed] ❌ Seed failed:', err);
  }
}
