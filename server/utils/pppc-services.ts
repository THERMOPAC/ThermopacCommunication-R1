/**
 * PPPC Centralized Services
 * ─────────────────────────
 * All cross-cutting concerns for the Project Procurement Package Control module:
 *   • Subgroup ↔ Group membership validation  (API-layer only — no DB CHECK)
 *   • GCS object-path construction            (server-only — clients never build paths)
 *   • Idempotent master-data seeding          (buy_groups · buy_subgroups · uom_master)
 *
 * Import paths assume this file lives at server/utils/pppc-services.ts
 */

import { Pool } from '@neondatabase/serverless';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Subgroup membership validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the given subgroup belongs to the given group.
 * Should be called before any write that binds a package line to a subgroup.
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
//    Bucket is thermopac_storage and is stored separately — it is NOT part of the object path.
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
// 3. Seed data — buy_groups (7 rows)
// ─────────────────────────────────────────────────────────────────────────────

interface SeedGroup {
  code: string;
  label: string;
  sortOrder: number;
  subgroups: Array<{ code: string; label: string; sortOrder: number }>;
}

export const PPPC_SEED_GROUPS: SeedGroup[] = [
  {
    code: 'MECH', label: 'Mechanical Equipment', sortOrder: 1,
    subgroups: [
      { code: 'MECH-PUMP',    label: 'Pumps & Compressors',      sortOrder: 1 },
      { code: 'MECH-VESSEL',  label: 'Pressure Vessels & Tanks',  sortOrder: 2 },
      { code: 'MECH-PIPE',    label: 'Piping & Fittings',         sortOrder: 3 },
      { code: 'MECH-VALVE',   label: 'Valves & Actuators',        sortOrder: 4 },
      { code: 'MECH-HEX',     label: 'Heat Exchangers',           sortOrder: 5 },
    ],
  },
  {
    code: 'ELEC', label: 'Electrical Equipment', sortOrder: 2,
    subgroups: [
      { code: 'ELEC-PANEL',   label: 'Panels & Switchgear',       sortOrder: 1 },
      { code: 'ELEC-MOTOR',   label: 'Motors & Drives',           sortOrder: 2 },
      { code: 'ELEC-CABLE',   label: 'Cables & Conduits',         sortOrder: 3 },
      { code: 'ELEC-TRANS',   label: 'Transformers',              sortOrder: 4 },
    ],
  },
  {
    code: 'INST', label: 'Instrumentation', sortOrder: 3,
    subgroups: [
      { code: 'INST-FIELD',   label: 'Field Instruments',         sortOrder: 1 },
      { code: 'INST-CTRL',    label: 'Control Systems & DCS',     sortOrder: 2 },
      { code: 'INST-ANLZ',    label: 'Analysers',                 sortOrder: 3 },
    ],
  },
  {
    code: 'CIVIL', label: 'Civil & Structural', sortOrder: 4,
    subgroups: [
      { code: 'CIVIL-STL',    label: 'Structural Steel',          sortOrder: 1 },
      { code: 'CIVIL-CONC',   label: 'Concrete & Formwork',       sortOrder: 2 },
      { code: 'CIVIL-FOUND',  label: 'Foundations & Piling',      sortOrder: 3 },
    ],
  },
  {
    code: 'BULK', label: 'Bulk Materials', sortOrder: 5,
    subgroups: [
      { code: 'BULK-FAST',    label: 'Fasteners & Gaskets',       sortOrder: 1 },
      { code: 'BULK-INSUL',   label: 'Insulation & Cladding',     sortOrder: 2 },
      { code: 'BULK-PAINT',   label: 'Paints & Coatings',         sortOrder: 3 },
      { code: 'BULK-MISC',    label: 'Miscellaneous Bulk',        sortOrder: 4 },
    ],
  },
  {
    code: 'PACK', label: 'Package Units', sortOrder: 6,
    subgroups: [
      { code: 'PACK-SKID',    label: 'Skid-Mounted Packages',     sortOrder: 1 },
      { code: 'PACK-MODULAR', label: 'Modular Packages',          sortOrder: 2 },
    ],
  },
  {
    code: 'SVC', label: 'Services & Third-Party', sortOrder: 7,
    subgroups: [
      { code: 'SVC-INSP',     label: 'Inspection Services',       sortOrder: 1 },
      { code: 'SVC-ENG',      label: 'Engineering Services',      sortOrder: 2 },
      { code: 'SVC-CIVIL',    label: 'Civil Construction Services', sortOrder: 3 },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 4. Seed data — uom_master (25 rows across 5 categories)
// ─────────────────────────────────────────────────────────────────────────────

export const PPPC_SEED_UOMS: Array<{
  code: string; label: string; category: string; sortOrder: number;
}> = [
  // Mass
  { code: 'KG',  label: 'Kilogram',        category: 'Mass',     sortOrder:  1 },
  { code: 'MT',  label: 'Metric Tonne',    category: 'Mass',     sortOrder:  2 },
  { code: 'G',   label: 'Gram',            category: 'Mass',     sortOrder:  3 },
  { code: 'LB',  label: 'Pound',           category: 'Mass',     sortOrder:  4 },
  // Length / Area / Volume
  { code: 'M',   label: 'Metre',           category: 'Length',   sortOrder:  5 },
  { code: 'MM',  label: 'Millimetre',      category: 'Length',   sortOrder:  6 },
  { code: 'FT',  label: 'Foot',            category: 'Length',   sortOrder:  7 },
  { code: 'M2',  label: 'Square Metre',    category: 'Area',     sortOrder:  8 },
  { code: 'M3',  label: 'Cubic Metre',     category: 'Volume',   sortOrder:  9 },
  { code: 'LTR', label: 'Litre',           category: 'Volume',   sortOrder: 10 },
  // Count / Discrete
  { code: 'NO',  label: 'Number (Count)',  category: 'Count',    sortOrder: 11 },
  { code: 'LOT', label: 'Lot',             category: 'Count',    sortOrder: 12 },
  { code: 'SET', label: 'Set',             category: 'Count',    sortOrder: 13 },
  { code: 'PR',  label: 'Pair',            category: 'Count',    sortOrder: 14 },
  { code: 'PKT', label: 'Packet',          category: 'Count',    sortOrder: 15 },
  // Time / Service
  { code: 'HR',  label: 'Hour',            category: 'Time',     sortOrder: 16 },
  { code: 'DAY', label: 'Day',             category: 'Time',     sortOrder: 17 },
  { code: 'WK',  label: 'Week',            category: 'Time',     sortOrder: 18 },
  { code: 'MO',  label: 'Month',           category: 'Time',     sortOrder: 19 },
  { code: 'LS',  label: 'Lump Sum',        category: 'Service',  sortOrder: 20 },
  // Electrical
  { code: 'KW',  label: 'Kilowatt',        category: 'Power',    sortOrder: 21 },
  { code: 'KVA', label: 'Kilovolt-Ampere', category: 'Power',    sortOrder: 22 },
  // Pressure / Flow
  { code: 'BAR', label: 'Bar',             category: 'Pressure', sortOrder: 23 },
  { code: 'NM3', label: 'Nm³ (Normal Cubic Metre)', category: 'Flow', sortOrder: 24 },
  { code: 'M3H', label: 'm³/hr',           category: 'Flow',     sortOrder: 25 },
];

// ─────────────────────────────────────────────────────────────────────────────
// 5. Idempotent seed runner — called once at application start from pppc-routes
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
      if (grpRow.rowCount === 0) continue;
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
