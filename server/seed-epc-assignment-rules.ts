import { db } from './db';
import { sql } from 'drizzle-orm';

const DEFAULT_RULES: Array<{
  workflowCode: string; stageGate: string; actionType: string;
  department: string; role: string; fallbackDepartment: string; fallbackRole: string;
  executionMode: 'auto' | 'manual'; description: string;
}> = [
  { workflowCode: 'BOM_prepare',      stageGate: 'BOM', actionType: 'prepare', department: 'Design',           role: 'Senior Executive', fallbackDepartment: 'Design',           fallbackRole: 'Manager',          executionMode: 'auto',   description: 'BOM — Prepare Bill of Materials (auto-created on DO activation)' },
  { workflowCode: 'BOM_approve',      stageGate: 'BOM', actionType: 'approve', department: 'Design',           role: 'Manager',          fallbackDepartment: 'Design',           fallbackRole: 'Senior Manager',   executionMode: 'manual', description: 'BOM — Approve Bill of Materials' },
  { workflowCode: 'BOM_release',      stageGate: 'BOM', actionType: 'release', department: 'Design',           role: 'Manager',          fallbackDepartment: 'Design',           fallbackRole: 'Senior Manager',   executionMode: 'manual', description: 'BOM — Release to production/procurement' },
  { workflowCode: 'DWG_prepare',      stageGate: 'DWG', actionType: 'prepare', department: 'Design',           role: 'Senior Executive', fallbackDepartment: 'Design',           fallbackRole: 'Manager',          executionMode: 'auto',   description: 'Drawing — Prepare GA Drawing (auto-created on DO activation)' },
  { workflowCode: 'DWG_approve',      stageGate: 'DWG', actionType: 'approve', department: 'Design',           role: 'Manager',          fallbackDepartment: 'Design',           fallbackRole: 'Senior Manager',   executionMode: 'manual', description: 'Drawing — Approve GA Drawing' },
  { workflowCode: 'DWG_release',      stageGate: 'DWG', actionType: 'release', department: 'Design',           role: 'Senior Manager',   fallbackDepartment: 'Projects',         fallbackRole: 'Manager',          executionMode: 'manual', description: 'Drawing — Release after approval (proc + mfg flags)' },
  { workflowCode: 'PLN_prepare',      stageGate: 'PLN', actionType: 'prepare', department: 'Projects',         role: 'Senior Executive', fallbackDepartment: 'Projects',         fallbackRole: 'Manager',          executionMode: 'manual', description: 'Planning — Prepare Execution Plan' },
  { workflowCode: 'PLN_approve',      stageGate: 'PLN', actionType: 'approve', department: 'Projects',         role: 'Manager',          fallbackDepartment: 'Projects',         fallbackRole: 'Senior Executive', executionMode: 'manual', description: 'Planning — Approve Execution Plan' },
  { workflowCode: 'PLN_release',      stageGate: 'PLN', actionType: 'release', department: 'Projects',         role: 'Manager',          fallbackDepartment: 'Projects',         fallbackRole: 'Senior Executive', executionMode: 'manual', description: 'Planning — Release execution plan (unblocks PO/WO)' },
  { workflowCode: 'PO_prepare',       stageGate: 'PO',  actionType: 'prepare', department: 'Purchase',         role: 'Senior Executive', fallbackDepartment: 'Purchase',         fallbackRole: 'Manager',          executionMode: 'auto',   description: 'Purchase Order — Prepare PO (auto-created on DO approval)' },
  { workflowCode: 'PO_approve',       stageGate: 'PO',  actionType: 'approve', department: 'Purchase',         role: 'Manager',          fallbackDepartment: 'Purchase',         fallbackRole: 'Senior Executive', executionMode: 'manual', description: 'Purchase Order — Approve PO' },
  { workflowCode: 'PO_issue',         stageGate: 'PO',  actionType: 'issue',   department: 'Purchase',         role: 'Senior Manager',   fallbackDepartment: 'Purchase',         fallbackRole: 'Senior Executive', executionMode: 'manual', description: 'Purchase Order — Issue to vendor after approval' },
  { workflowCode: 'WO_prepare',       stageGate: 'WO',  actionType: 'prepare', department: 'Production',       role: 'Senior Executive', fallbackDepartment: 'Production',       fallbackRole: 'Manager',          executionMode: 'auto',   description: 'Work Order — Prepare WO (auto-created on DO approval)' },
  { workflowCode: 'WO_approve',       stageGate: 'WO',  actionType: 'approve', department: 'Production',       role: 'Manager',          fallbackDepartment: 'Production',       fallbackRole: 'Senior Manager',   executionMode: 'manual', description: 'Work Order — Approve WO' },
  { workflowCode: 'WO_release',       stageGate: 'WO',  actionType: 'release', department: 'Production',       role: 'Senior Manager',   fallbackDepartment: 'Production',       fallbackRole: 'Manager',          executionMode: 'manual', description: 'Work Order — Release to shop floor' },
  { workflowCode: 'INS_execute',      stageGate: 'INS', actionType: 'execute', department: 'Quality Control',  role: 'Senior Executive', fallbackDepartment: 'Quality Control',  fallbackRole: 'Manager',          executionMode: 'auto',   description: 'Inspection — Execute Inspection Order (auto-created on PO approval/WO release)' },
  { workflowCode: 'INS_verify',       stageGate: 'INS', actionType: 'verify',  department: 'Quality Control',  role: 'Manager',          fallbackDepartment: 'Quality Control',  fallbackRole: 'Senior Executive', executionMode: 'manual', description: 'Inspection — Verify / Pass or Fail Inspection' },
  { workflowCode: 'DSP_prepare',      stageGate: 'DSP', actionType: 'prepare', department: 'Stores',           role: 'Senior Executive', fallbackDepartment: 'Projects',         fallbackRole: 'Senior Executive', executionMode: 'auto',   description: 'Dispatch — Prepare Dispatch Readiness (auto-created on INS pass)' },
  { workflowCode: 'DSP_confirm',      stageGate: 'DSP', actionType: 'confirm', department: 'Projects',         role: 'Manager',          fallbackDepartment: 'Projects',         fallbackRole: 'Senior Executive', executionMode: 'manual', description: 'Dispatch — Confirm Delivery Complete' },
  { workflowCode: 'COM_execute',      stageGate: 'COM', actionType: 'execute', department: 'After Sales',      role: 'Senior Executive', fallbackDepartment: 'After Sales',      fallbackRole: 'Senior Manager',   executionMode: 'manual', description: 'Commissioning — Execute Site Commissioning' },
  { workflowCode: 'COM_verify',       stageGate: 'COM', actionType: 'verify',  department: 'After Sales',      role: 'Manager',          fallbackDepartment: 'After Sales',      fallbackRole: 'Senior Manager',   executionMode: 'manual', description: 'Commissioning — Verify & Sign Off Handover' },
  { workflowCode: 'INV_prepare',      stageGate: 'INV', actionType: 'prepare', department: 'Accounts',         role: 'Senior Executive', fallbackDepartment: 'Accounts',         fallbackRole: 'Manager',          executionMode: 'auto',   description: 'Invoice — Prepare Invoice (auto-created on dispatch delivery)' },
  { workflowCode: 'INV_approve',      stageGate: 'INV', actionType: 'approve', department: 'Accounts',         role: 'Manager',          fallbackDepartment: 'Accounts',         fallbackRole: 'Senior Manager',   executionMode: 'manual', description: 'Invoice — Approve & Submit Invoice' },
  { workflowCode: 'kickoff_pm',       stageGate: 'PLN', actionType: 'prepare', department: 'Projects',         role: 'Manager',          fallbackDepartment: 'Projects',         fallbackRole: 'Senior Executive', executionMode: 'auto',   description: 'Kickoff — Project Plan & Schedule (PM) auto-assigned on conversion' },
  { workflowCode: 'kickoff_design',   stageGate: 'DWG', actionType: 'prepare', department: 'Design',           role: 'Senior Executive', fallbackDepartment: 'Design',           fallbackRole: 'Manager',          executionMode: 'auto',   description: 'Kickoff — Design Tasks auto-assigned on conversion' },
  { workflowCode: 'kickoff_purchase', stageGate: 'PO',  actionType: 'prepare', department: 'Purchase',         role: 'Senior Executive', fallbackDepartment: 'Purchase',         fallbackRole: 'Manager',          executionMode: 'auto',   description: 'Kickoff — Purchase & Make/Buy Review auto-assigned on conversion' },
  { workflowCode: 'kickoff_qc',       stageGate: 'INS', actionType: 'prepare', department: 'Quality Control',  role: 'Senior Executive', fallbackDepartment: 'Quality Control',  fallbackRole: 'Manager',          executionMode: 'auto',   description: 'Kickoff — Quality Assurance Plan auto-assigned on conversion' },
];

export async function seedEpcAssignmentRules(adminUserId?: number): Promise<void> {
  for (const rule of DEFAULT_RULES) {
    const exists = await db.execute(
      sql`SELECT id FROM epc_assignment_rules WHERE workflow_code = ${rule.workflowCode} LIMIT 1`
    );
    if (exists.rows.length === 0) {
      await db.execute(
        sql`INSERT INTO epc_assignment_rules
            (workflow_code, stage_gate, action_type, department, role,
             fallback_department, fallback_role, is_active, execution_mode, description, created_by)
            VALUES (${rule.workflowCode}, ${rule.stageGate}, ${rule.actionType},
                    ${rule.department}, ${rule.role},
                    ${rule.fallbackDepartment}, ${rule.fallbackRole},
                    true, ${rule.executionMode}, ${rule.description}, ${adminUserId || null})`
      );
      console.log(`[EPC-Assignment-Seed] Inserted missing rule: ${rule.workflowCode}`);
    } else {
      await db.execute(
        sql`UPDATE epc_assignment_rules
            SET department = ${rule.department},
                role = ${rule.role},
                fallback_department = ${rule.fallbackDepartment},
                fallback_role = ${rule.fallbackRole},
                execution_mode = ${rule.executionMode},
                description = ${rule.description}
            WHERE workflow_code = ${rule.workflowCode}`
      );
    }
  }

  const finalCount = await db.execute(sql`SELECT COUNT(*) as cnt FROM epc_assignment_rules`);
  console.log(`[EPC-Assignment-Seed] Done — ${(finalCount.rows[0] as any).cnt} rules total (${DEFAULT_RULES.length} managed by seed)`);
}
