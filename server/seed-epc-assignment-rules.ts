import { db } from './db';
import { sql } from 'drizzle-orm';

const DEFAULT_RULES = [
  { workflowCode: 'BOM_prepare',     stageGate: 'BOM', actionType: 'prepare', department: 'Design',              role: 'Senior Executive', fallbackDepartment: 'Design',              fallbackRole: 'Manager',       description: 'BOM — Prepare Bill of Materials' },
  { workflowCode: 'BOM_approve',     stageGate: 'BOM', actionType: 'approve', department: 'Design',              role: 'Manager',          fallbackDepartment: 'Projects',            fallbackRole: 'Manager',       description: 'BOM — Approve Bill of Materials' },
  { workflowCode: 'DWG_prepare',     stageGate: 'DWG', actionType: 'prepare', department: 'Design',              role: 'Senior Executive', fallbackDepartment: 'Design',              fallbackRole: 'Manager',       description: 'Drawing — Prepare GA Drawing' },
  { workflowCode: 'DWG_approve',     stageGate: 'DWG', actionType: 'approve', department: 'Design',              role: 'Manager',          fallbackDepartment: 'Projects',            fallbackRole: 'Manager',       description: 'Drawing — Approve GA Drawing' },
  { workflowCode: 'PLN_prepare',     stageGate: 'PLN', actionType: 'prepare', department: 'Projects',            role: 'Senior Executive', fallbackDepartment: 'Projects',            fallbackRole: 'Manager',       description: 'Planning — Prepare Execution Plan' },
  { workflowCode: 'PLN_approve',     stageGate: 'PLN', actionType: 'approve', department: 'Projects',            role: 'Manager',          fallbackDepartment: 'Projects',            fallbackRole: 'Senior Manager', description: 'Planning — Approve Execution Plan' },
  { workflowCode: 'PO_prepare',      stageGate: 'PO',  actionType: 'prepare', department: 'Purchase',            role: 'Senior Executive', fallbackDepartment: 'Purchase',            fallbackRole: 'Manager',       description: 'Purchase Order — Prepare PO' },
  { workflowCode: 'PO_approve',      stageGate: 'PO',  actionType: 'approve', department: 'Purchase',            role: 'Manager',          fallbackDepartment: 'Purchase',            fallbackRole: 'Senior Manager', description: 'Purchase Order — Approve PO' },
  { workflowCode: 'WO_prepare',      stageGate: 'WO',  actionType: 'prepare', department: 'Production',          role: 'Senior Executive', fallbackDepartment: 'Production',          fallbackRole: 'Manager',       description: 'Work Order — Prepare WO' },
  { workflowCode: 'WO_approve',      stageGate: 'WO',  actionType: 'approve', department: 'Production',          role: 'Manager',          fallbackDepartment: 'Production',          fallbackRole: 'Senior Manager', description: 'Work Order — Approve WO' },
  { workflowCode: 'INS_execute',     stageGate: 'INS', actionType: 'execute', department: 'Quality Control',     role: 'Senior Executive', fallbackDepartment: 'Quality Control',     fallbackRole: 'Manager',       description: 'Inspection — Execute Inspection Order' },
  { workflowCode: 'INS_verify',      stageGate: 'INS', actionType: 'verify',  department: 'Quality Control',     role: 'Manager',          fallbackDepartment: 'Quality Control',     fallbackRole: 'Senior Manager', description: 'Inspection — Verify / Pass Inspection' },
  { workflowCode: 'DSP_prepare',     stageGate: 'DSP', actionType: 'prepare', department: 'Dispatch & Shipping', role: 'Senior Executive', fallbackDepartment: 'Projects',            fallbackRole: 'Manager',       description: 'Dispatch — Prepare Dispatch Readiness' },
  { workflowCode: 'DSP_confirm',     stageGate: 'DSP', actionType: 'confirm', department: 'Projects',            role: 'Manager',          fallbackDepartment: 'Projects',            fallbackRole: 'Senior Manager', description: 'Dispatch — Confirm Dispatch Complete' },
  { workflowCode: 'COM_execute',     stageGate: 'COM', actionType: 'execute', department: 'Projects',            role: 'Senior Executive', fallbackDepartment: 'Projects',            fallbackRole: 'Manager',       description: 'Commissioning — Execute Site Commissioning' },
  { workflowCode: 'COM_verify',      stageGate: 'COM', actionType: 'verify',  department: 'Projects',            role: 'Manager',          fallbackDepartment: 'Projects',            fallbackRole: 'Senior Manager', description: 'Commissioning — Verify & Sign Off' },
  { workflowCode: 'INV_prepare',     stageGate: 'INV', actionType: 'prepare', department: 'Finance',             role: 'Senior Executive', fallbackDepartment: 'Finance',             fallbackRole: 'Manager',       description: 'Invoice — Prepare Invoice' },
  { workflowCode: 'INV_approve',     stageGate: 'INV', actionType: 'approve', department: 'Finance',             role: 'Manager',          fallbackDepartment: 'Finance',             fallbackRole: 'Senior Manager', description: 'Invoice — Approve & Submit Invoice' },
  { workflowCode: 'kickoff_pm',      stageGate: 'PLN', actionType: 'prepare', department: 'Projects',            role: 'Manager',          fallbackDepartment: 'Projects',            fallbackRole: 'Senior Manager', description: 'Kickoff — Project Plan & Schedule (PM)' },
  { workflowCode: 'kickoff_design',  stageGate: 'DWG', actionType: 'prepare', department: 'Design',              role: 'Senior Executive', fallbackDepartment: 'Design',              fallbackRole: 'Manager',       description: 'Kickoff — Design Tasks' },
  { workflowCode: 'kickoff_purchase',stageGate: 'PO',  actionType: 'prepare', department: 'Purchase',            role: 'Senior Executive', fallbackDepartment: 'Purchase',            fallbackRole: 'Manager',       description: 'Kickoff — Purchase & Make/Buy Review' },
  { workflowCode: 'kickoff_qc',      stageGate: 'INS', actionType: 'prepare', department: 'Quality Control',     role: 'Senior Executive', fallbackDepartment: 'Quality Control',     fallbackRole: 'Manager',       description: 'Kickoff — Quality Assurance Plan' },
];

export async function seedEpcAssignmentRules(adminUserId?: number): Promise<void> {
  const existing = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM epc_assignment_rules`
  );
  const count = parseInt((existing.rows[0] as any).cnt);

  if (count > 0) {
    console.log(`[EPC-Assignment-Seed] ${count} rules already exist — checking for missing workflow_codes`);
    for (const rule of DEFAULT_RULES) {
      const exists = await db.execute(
        sql`SELECT id FROM epc_assignment_rules WHERE workflow_code = ${rule.workflowCode} LIMIT 1`
      );
      if (exists.rows.length === 0) {
        await db.execute(
          sql`INSERT INTO epc_assignment_rules
              (workflow_code, stage_gate, action_type, department, role,
               fallback_department, fallback_role, is_active, description, created_by)
              VALUES (${rule.workflowCode}, ${rule.stageGate}, ${rule.actionType},
                      ${rule.department}, ${rule.role},
                      ${rule.fallbackDepartment}, ${rule.fallbackRole},
                      true, ${rule.description}, ${adminUserId || null})`
        );
        console.log(`[EPC-Assignment-Seed] Inserted missing rule: ${rule.workflowCode}`);
      }
    }
    return;
  }

  console.log(`[EPC-Assignment-Seed] Seeding ${DEFAULT_RULES.length} default assignment rules`);
  for (const rule of DEFAULT_RULES) {
    await db.execute(
      sql`INSERT INTO epc_assignment_rules
          (workflow_code, stage_gate, action_type, department, role,
           fallback_department, fallback_role, is_active, description, created_by)
          VALUES (${rule.workflowCode}, ${rule.stageGate}, ${rule.actionType},
                  ${rule.department}, ${rule.role},
                  ${rule.fallbackDepartment}, ${rule.fallbackRole},
                  true, ${rule.description}, ${adminUserId || null})`
    );
  }
  console.log(`[EPC-Assignment-Seed] Done — ${DEFAULT_RULES.length} rules seeded`);
}
