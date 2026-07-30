/**
 * seed-folder-templates.ts
 *
 * Idempotent seed for project_folder_templates and project_folder_template_items.
 * Runs on server startup — safe to call multiple times; uses ON CONFLICT DO NOTHING.
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
  '2_Engineering',
  '2_Engineering/1_GA_Drawings',
  '2_Engineering/2_Detail_Drawings',
  '2_Engineering/3_BOM',
  '2_Engineering/4_Datasheets',
  '2_Engineering/5_Calculations',
  '2_Engineering/6_3D_Models',
  '2_Engineering/7_Standards_References',
  '2_Engineering/8_ECR_ECN',
  '3_Procurement',
  '3_Procurement/1_RFQ',
  '3_Procurement/2_Vendor_Offers',
  '3_Procurement/3_Purchase_Orders',
  '3_Procurement/4_Vendor_Documents',
  '3_Procurement/5_Inspection_Reports',
  '4_Production',
  '4_Production/1_Work_Orders',
  '4_Production/2_Material_Traceability',
  '4_Production/3_NC_Reports',
  '4_Production/4_Weld_Records',
  '4_Production/5_Pressure_Test',
  '4_Production/6_Shop_Photos',
  '5_Quality',
  '5_Quality/1_ITP',
  '5_Quality/2_Inspection_Reports',
  '5_Quality/3_Certificates',
  '5_Quality/4_PWHT_Records',
  '5_Quality/5_NDT_Reports',
  '5_Quality/6_Hydrotest',
  '6_Dispatch',
  '6_Dispatch/1_Packing_List',
  '6_Dispatch/2_Delivery_Challan',
  '6_Dispatch/3_Invoice',
  '6_Dispatch/4_LR_BL',
  '6_Dispatch/5_Insurance',
  '7_Site',
  '7_Site/1_Commissioning',
  '7_Site/2_Site_Reports',
  '7_Site/3_Handover',
  '8_Project_Management',
  '8_Project_Management/1_Schedule',
  '8_Project_Management/2_MOM',
];

export async function seedFolderTemplates(): Promise<void> {
  try {
    // Insert template (idempotent)
    await db.execute(sql`
      INSERT INTO project_folder_templates (template_code, template_name, version, is_active)
      VALUES ('STANDARD_EPC', 'Standard EPC Project Folder Structure', 1, true)
      ON CONFLICT DO NOTHING
    `);

    // Get template id
    const result = await db.execute(sql`
      SELECT id FROM project_folder_templates WHERE template_code = 'STANDARD_EPC' LIMIT 1
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
    console.log(`[FolderTemplateSeed] STANDARD_EPC: ${inserted} inserted, ${existing} already existed (${total} total)`);
  } catch (err: any) {
    console.error('[FolderTemplateSeed] Seed failed:', err.message);
  }
}
