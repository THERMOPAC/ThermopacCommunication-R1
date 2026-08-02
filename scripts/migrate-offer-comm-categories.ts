/**
 * scripts/migrate-offer-comm-categories.ts
 *
 * One-time, version-controlled, idempotent migration script.
 * Inserts exactly the 20 approved Communication Categories into offer_comm_categories.
 *
 * Rules:
 *  - Run manually ONCE after drizzle-kit push has created the table.
 *  - Do NOT execute automatically or as a startup seed.
 *  - ON CONFLICT DO NOTHING — safe to re-run.
 *  - Do not add, rename or remove any category outside this script.
 *  - Future additions require a new, separately approved migration.
 *
 * Usage:
 *   npx tsx scripts/migrate-offer-comm-categories.ts
 */

import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const CATEGORIES = [
  { code: 'SALES_CONTRACT_PO',         path: '1_Sales/3_Contract_PO',                                 label: 'Contract / PO',                   section: 'Sales',   sort: 10  },
  { code: 'SALES_LC_BANK',             path: '1_Sales/4_LC_or_Bank',                                  label: 'LC or Bank',                      section: 'Sales',   sort: 20  },
  { code: 'SALES_ORDER_CONFIRMATION',  path: '1_Sales/5_Order_Conformation',                          label: 'Order Confirmation',              section: 'Sales',   sort: 30  },
  { code: 'SALES_DP_PROFORMA',         path: '1_Sales/6_DP_Proforma_Invoice',                         label: 'DP Proforma Invoice',             section: 'Sales',   sort: 40  },
  { code: 'SALES_MOM',                 path: '1_Sales/7_Minutes_of_meeting',                          label: 'Minutes of Meeting',              section: 'Sales',   sort: 50  },
  { code: 'SALES_DOC_SUBMISSION',      path: '1_Sales/8_Document_Submission',                         label: 'Document Submission',             section: 'Sales',   sort: 60  },
  { code: 'DESIGN_BEDD',               path: '2_Design/1_BEDD',                                       label: 'BEDD',                            section: 'Design',  sort: 70  },
  { code: 'DESIGN_STD',                path: '2_Design/2_Relevant_Standards',                         label: 'Relevant Standards',              section: 'Design',  sort: 80  },
  { code: 'DESIGN_PID',                path: '2_Design/3_P_ID',                                       label: 'P&ID',                            section: 'Design',  sort: 90  },
  { code: 'DESIGN_MHB',                path: '2_Design/4_Material_and_heat_balance',                  label: 'Material & Heat Balance',         section: 'Design',  sort: 100 },
  { code: 'DESIGN_HAZOP',              path: '2_Design/5_Hazop',                                      label: 'HAZOP',                           section: 'Design',  sort: 110 },
  { code: 'DESIGN_QAP',                path: '2_Design/6_QAP',                                        label: 'QAP',                             section: 'Design',  sort: 120 },
  { code: 'DESIGN_TIEIN',              path: '2_Design/7_Tiein_points',                               label: 'Tie-in Points',                   section: 'Design',  sort: 130 },
  { code: 'DESIGN_GA',                 path: '2_Design/8_GA',                                         label: 'GA Drawing',                      section: 'Design',  sort: 140 },
  { code: 'DESIGN_FOUNDATION',         path: '2_Design/9_Foundation',                                 label: 'Foundation',                      section: 'Design',  sort: 150 },
  { code: 'DESIGN_ELECTRICAL',         path: '2_Design/10_Electrical',                                label: 'Electrical',                      section: 'Design',  sort: 160 },
  { code: 'DESIGN_PROGRESS',           path: '2_Design/11_Progress_Report/Snaps',                     label: 'Progress Report / Snaps',         section: 'Design',  sort: 170 },
  { code: 'DESIGN_CAUSE_EFFECT',       path: '2_Design/12_Cause_Effect',                              label: 'Cause & Effect',                  section: 'Design',  sort: 180 },
  { code: 'DESIGN_DATA_SHEET',         path: '2_Design/13_Data_sheet_for_approval',                   label: 'Data Sheet for Approval',         section: 'Design',  sort: 190 },
  { code: 'DESIGN_CALC_STRUCTURAL',    path: '2_Design/15_Design_Calculation/Structural_Design',      label: 'Design Calculation / Structural', section: 'Design',  sort: 200 },
] as const;

async function run() {
  const client = await pool.connect();
  try {
    console.log('[migrate-offer-comm-categories] Starting...');

    let inserted = 0;
    let skipped = 0;

    for (const cat of CATEGORIES) {
      const result = await client.query(
        `INSERT INTO offer_comm_categories
           (category_code, category_path, display_label, section, sort_order, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (category_code) DO NOTHING`,
        [cat.code, cat.path, cat.label, cat.section, cat.sort]
      );
      if ((result.rowCount ?? 0) > 0) {
        inserted++;
        console.log(`  ✓ Inserted: ${cat.code}`);
      } else {
        skipped++;
        console.log(`  – Skipped (already exists): ${cat.code}`);
      }
    }

    const verify = await client.query('SELECT COUNT(*) FROM offer_comm_categories');
    console.log(`\n[migrate-offer-comm-categories] Done. Inserted: ${inserted}, Skipped: ${skipped}, Total rows: ${verify.rows[0].count}`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('[migrate-offer-comm-categories] FAILED:', err.message);
  process.exit(1);
});
