/**
 * seed-folder-templates.ts
 *
 * Idempotent seed for project_folder_templates and project_folder_template_items.
 * Runs on server startup — safe to call multiple times; uses ON CONFLICT DO NOTHING.
 *
 * Source of truth: docs/document-path-folder-template-baseline-v1.md §7A
 * Template code:   EPC_STANDARD_V1
 * Approved paths:  41 (Project Owner approved 2026-07-30)
 */

import { db } from './db';
import { sql } from 'drizzle-orm';

const FOLDERS = [
  '1_Sales',
  '1_Sales/1_Pre_Order_Communication',
  '1_Sales/2_Final_Offer',
  '1_Sales/3_Contract_PO',
  '1_Sales/4_LC_or_Bank',
  '1_Sales/5_Order_Conformation',
  '1_Sales/6_DP_Proforma_Invoice',
  '1_Sales/7_Minutes_of_meeting',
  '1_Sales/8_Document_Submission',
  '1_Sales/9_Non_Compliance_Report',
  '1_Sales/10_Sales_Internal_Memo',
  '2_Design/0_3D_Model_Assembly',
  '2_Design/1_BEDD',
  '2_Design/2_Relevant_Standards',
  '2_Design/3_P_ID',
  '2_Design/4_Material_and_heat_balance',
  '2_Design/5_Hazop',
  '2_Design/6_QAP',
  '2_Design/7_Tiein_points',
  '2_Design/8_GA',
  '2_Design/9_Foundation',
  '2_Design/10_Electrical',
  '2_Design/11_Progress_Report/Snaps',
  '2_Design/12_Cause_Effect',
  '2_Design/13_Data_sheet_for_approval',
  '2_Design/14_Inspection_Reports',
  '2_Design/15_Design_Calculation/Structural_Design',
  '2_Design/16_Operation_Maintenance_Manual',
  '3_Purchase/Purchase_Orders',
  '4_Production/1_Project_Scheduling',
  '4_Production/2_CNC_Cutting',
  '4_Production/3_Production_Drawings',
  '4_Production/4_Asbuilt',
  '4_Production/5_MDR',
  '5_Accounts/Invoice',
  '5_Accounts/Packing_List',
  '5_Accounts/Airway_Bill_BL',
  '5_Accounts/Payment_Receipt',
  '6_After_Sales/PLC/PLC_program',
  '6_After_Sales/Scada/Scada_program',
  '6_After_Sales/Test_Run_Commissioning',
];

export async function seedFolderTemplates(): Promise<void> {
  try {
    // Insert template (idempotent)
    await db.execute(sql`
      INSERT INTO project_folder_templates (template_code, template_name, version, is_active)
      VALUES ('EPC_STANDARD_V1', 'EPC Standard Project Folder Structure v1', 1, true)
      ON CONFLICT DO NOTHING
    `);

    // Get template id
    const result = await db.execute(sql`
      SELECT id FROM project_folder_templates WHERE template_code = 'EPC_STANDARD_V1' LIMIT 1
    `);
    const templateId = (result.rows[0] as any).id;

    // Insert all folder items (idempotent via WHERE NOT EXISTS — no unique constraint on items)
    let inserted = 0;
    for (let i = 0; i < FOLDERS.length; i++) {
      const sortOrder = (i + 1) * 10;
      const res = await db.execute(sql`
        INSERT INTO project_folder_template_items (template_id, relative_path, sort_order, is_active)
        SELECT ${templateId}, ${FOLDERS[i]}, ${sortOrder}, true
        WHERE NOT EXISTS (
          SELECT 1 FROM project_folder_template_items
          WHERE template_id = ${templateId} AND relative_path = ${FOLDERS[i]}
        )
      `);
      if ((res.rowCount ?? 0) > 0) inserted++;
    }

    const total = FOLDERS.length;
    const existing = total - inserted;
    console.log(`[FolderTemplateSeed] EPC_STANDARD_V1: ${inserted} inserted, ${existing} already existed (${total} total)`);
  } catch (err: any) {
    console.error('[FolderTemplateSeed] Seed failed:', err.message);
  }
}
