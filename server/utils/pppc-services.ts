/**
 * PPPC Centralized Services
 * ─────────────────────────
 * Cross-cutting concerns for the Project Procurement Package Control module:
 *   • Subgroup ↔ Group membership validation  (API-layer only — no DB CHECK)
 *   • GCS object-path construction            (server-only — clients never build paths)
 *   • Idempotent master-data seeding          (buy_groups · buy_subgroups · uom_master)
 *
 * ALL seed data is taken verbatim from the approved PPPC baseline document.
 * No substitutions, no assumptions, no fabrications.
 */

import { Pool } from '@neondatabase/serverless';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Subgroup membership validation (API-layer only — no DB CHECK constraint)
// ─────────────────────────────────────────────────────────────────────────────

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
// 2. GCS object-path construction  (Baseline §GCS-PATH — server-only)
//    TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/DATASHEETS/{listNumber}/{tagNo}/{lineId}_ds-rev-{seq}.{ext}
//    Bucket = thermopac_storage — stored separately, NOT part of the object path.
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
// 3. Seed data — verbatim from approved PPPC baseline
//    buy_groups  : 7 rows
//    buy_subgroups: 30 rows (codes exactly as baseline — no prefixes)
// ─────────────────────────────────────────────────────────────────────────────

interface SeedGroup {
  code: string;
  label: string;
  sortOrder: number;
  subgroups: Array<{ code: string; label: string; sortOrder: number }>;
}

export const PPPC_SEED_GROUPS: SeedGroup[] = [
  {
    code: 'raw_materials', label: 'Raw Materials', sortOrder: 1,
    subgroups: [
      { code: 'plates',           label: 'Plates',           sortOrder: 1 },
      { code: 'pipes',            label: 'Pipes',            sortOrder: 2 },
      { code: 'fittings',         label: 'Fittings',         sortOrder: 3 },
      { code: 'flanges',          label: 'Flanges',          sortOrder: 4 },
      { code: 'fasteners',        label: 'Fasteners',        sortOrder: 5 },
      { code: 'gaskets',          label: 'Gaskets',          sortOrder: 6 },
      { code: 'structural_steel', label: 'Structural Steel', sortOrder: 7 },
    ],
  },
  {
    code: 'pumps', label: 'Pumps', sortOrder: 2,
    subgroups: [
      { code: 'centrifugal',    label: 'Centrifugal',        sortOrder: 1 },
      { code: 'gear',           label: 'Gear',               sortOrder: 2 },
      { code: 'screw',          label: 'Screw',              sortOrder: 3 },
      { code: 'multistage',     label: 'Multistage',         sortOrder: 4 },
      { code: 'dosing_metering',label: 'Dosing / Metering',  sortOrder: 5 },
      { code: 'pump_skid',      label: 'Pump Skid Packages', sortOrder: 6 },
    ],
  },
  {
    code: 'motors', label: 'Motors', sortOrder: 3,
    subgroups: [
      { code: 'non_flameproof',      label: 'Non-Flameproof',       sortOrder: 1 },
      { code: 'flameproof',          label: 'Flameproof',           sortOrder: 2 },
      { code: 'vertical_horizontal', label: 'Vertical / Horizontal', sortOrder: 3 },
      { code: 'high_efficiency',     label: 'IE3/IE4',                 sortOrder: 4 },
      { code: 'vfd_compatible',      label: 'VFD Compatible',       sortOrder: 5 },
    ],
  },
  {
    code: 'instruments', label: 'Instruments', sortOrder: 4,
    subgroups: [
      { code: 'pressure',    label: 'Pressure',    sortOrder: 1 },
      { code: 'temperature', label: 'Temperature', sortOrder: 2 },
      { code: 'flow',        label: 'Flow',        sortOrder: 3 },
      { code: 'level',       label: 'Level',       sortOrder: 4 },
    ],
  },
  {
    code: 'valves', label: 'Valves', sortOrder: 5,
    subgroups: [
      { code: 'isolation', label: 'Isolation', sortOrder: 1 },
      { code: 'control',   label: 'Control',   sortOrder: 2 },
      { code: 'safety',    label: 'Safety',    sortOrder: 3 },
    ],
  },
  {
    code: 'electrical_control', label: 'Electrical / Control', sortOrder: 6,
    subgroups: [
      { code: 'panels',      label: 'Panels',      sortOrder: 1 },
      { code: 'components',  label: 'Components',  sortOrder: 2 },
      { code: 'field_items', label: 'Field Items', sortOrder: 3 },
      { code: 'cabling',     label: 'Cabling',     sortOrder: 4 },
    ],
  },
  {
    code: 'bought_out_packages', label: 'Bought-out Packages', sortOrder: 7,
    subgroups: [
      { code: 'general', label: 'General Bought-out Package', sortOrder: 1 },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 4. Seed data — uom_master
//    Baseline minimum: NOS, KG, MTR, SET, LOT, LTR, M3, MTRX, PAIR, ROLL
//    No fabricated codes beyond baseline.
// ─────────────────────────────────────────────────────────────────────────────

export const PPPC_SEED_UOMS: Array<{
  code: string; label: string; category: string; sortOrder: number;
}> = [
  { code: 'NOS',  label: 'Numbers',      category: 'Count',  sortOrder:  1 },
  { code: 'KG',   label: 'Kilogram',     category: 'Mass',   sortOrder:  2 },
  { code: 'MTR',  label: 'Metre',        category: 'Length', sortOrder:  3 },
  { code: 'SET',  label: 'Set',          category: 'Count',  sortOrder:  4 },
  { code: 'LOT',  label: 'Lot',          category: 'Count',  sortOrder:  5 },
  { code: 'LTR',  label: 'Litre',        category: 'Volume', sortOrder:  6 },
  { code: 'M3',   label: 'Cubic Metre',  category: 'Volume', sortOrder:  7 },
  { code: 'MTRX', label: 'Metre (Extra)', category: 'Length', sortOrder:  8 },
  { code: 'PAIR', label: 'Pair',         category: 'Count',  sortOrder:  9 },
  { code: 'ROLL', label: 'Roll',         category: 'Count',  sortOrder: 10 },
];

// ─────────────────────────────────────────────────────────────────────────────
// 5. Idempotent seed runner — called once at application start
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
           ON CONFLICT (buy_group_id, code) DO NOTHING`,
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
