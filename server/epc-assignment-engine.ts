import { db } from './db';
import { sql } from 'drizzle-orm';

export interface AssignmentResult {
  userId: number | null;
  method: 'primary' | 'fallback' | 'unassigned';
  department: string | null;
  role: string | null;
  ruleId: number | null;
  warningMessage?: string;
}

const ROLE_ORDER = `CASE role
  WHEN 'Manager' THEN 1
  WHEN 'Senior Manager' THEN 2
  WHEN 'General Manager' THEN 3
  WHEN 'Superuser' THEN 4
  ELSE 5
END`;

async function findUserByDeptRole(
  department: string,
  role: string,
  executor: any
): Promise<number | null> {
  const result = await executor.execute(
    sql`SELECT id FROM users
        WHERE department = ${department}
          AND role = ${role}
          AND is_active = true
        ORDER BY id ASC
        LIMIT 1`
  );
  return result.rows.length > 0 ? (result.rows[0] as any).id : null;
}

async function writeAuditLog(params: {
  projectId: number | null;
  workflowCode: string;
  stageGate: string;
  actionType: string;
  ruleId: number | null;
  resolutionMethod: string;
  resolvedDepartment: string | null;
  resolvedRole: string | null;
  resolvedUserId: number | null;
  triggeredBy: string;
  warningMessage: string | null;
}): Promise<void> {
  try {
    await db.execute(
      sql`INSERT INTO epc_assignment_audit_log
          (project_id, workflow_code, stage_gate, action_type, rule_id,
           resolution_method, resolved_department, resolved_role, resolved_user_id,
           triggered_by, warning_message, logged_at)
          VALUES (${params.projectId}, ${params.workflowCode}, ${params.stageGate},
                  ${params.actionType}, ${params.ruleId}, ${params.resolutionMethod},
                  ${params.resolvedDepartment}, ${params.resolvedRole}, ${params.resolvedUserId},
                  ${params.triggeredBy}, ${params.warningMessage}, NOW())`
    );
  } catch (err) {
    console.error(`[EPC-Assignment] Audit log write failed:`, err);
  }
}

export async function resolveEpcAssignee(
  workflowCode: string,
  projectId: number,
  triggeredBy: string,
  tx?: any
): Promise<AssignmentResult> {
  const executor = tx || db;

  let rule: any = null;
  try {
    const ruleResult = await executor.execute(
      sql`SELECT * FROM epc_assignment_rules
          WHERE workflow_code = ${workflowCode}
            AND is_active = true
          ORDER BY id ASC
          LIMIT 1`
    );
    rule = ruleResult.rows.length > 0 ? ruleResult.rows[0] : null;
  } catch (err) {
    console.error(`[EPC-Assignment] Failed to load rule for ${workflowCode}:`, err);
  }

  if (!rule) {
    const warning = `No active assignment rule found for workflow_code='${workflowCode}'`;
    console.warn(`[EPC-Assignment] ${warning}`);
    await writeAuditLog({
      projectId,
      workflowCode,
      stageGate: workflowCode.split('_')[0] || workflowCode,
      actionType: workflowCode.split('_')[1] || 'unknown',
      ruleId: null,
      resolutionMethod: 'unassigned',
      resolvedDepartment: null,
      resolvedRole: null,
      resolvedUserId: null,
      triggeredBy,
      warningMessage: warning,
    });
    return { userId: null, method: 'unassigned', department: null, role: null, ruleId: null, warningMessage: warning };
  }

  const primaryUserId = await findUserByDeptRole(rule.department, rule.role, executor);

  if (primaryUserId !== null) {
    console.log(`[EPC-Assignment] ${workflowCode} → primary match: ${rule.department}/${rule.role} → user #${primaryUserId}`);
    await writeAuditLog({
      projectId,
      workflowCode,
      stageGate: rule.stage_gate,
      actionType: rule.action_type,
      ruleId: rule.id,
      resolutionMethod: 'primary',
      resolvedDepartment: rule.department,
      resolvedRole: rule.role,
      resolvedUserId: primaryUserId,
      triggeredBy,
      warningMessage: null,
    });
    return { userId: primaryUserId, method: 'primary', department: rule.department, role: rule.role, ruleId: rule.id };
  }

  if (rule.fallback_department && rule.fallback_role) {
    const fallbackUserId = await findUserByDeptRole(rule.fallback_department, rule.fallback_role, executor);

    if (fallbackUserId !== null) {
      console.log(`[EPC-Assignment] ${workflowCode} → fallback match: ${rule.fallback_department}/${rule.fallback_role} → user #${fallbackUserId}`);
      await writeAuditLog({
        projectId,
        workflowCode,
        stageGate: rule.stage_gate,
        actionType: rule.action_type,
        ruleId: rule.id,
        resolutionMethod: 'fallback',
        resolvedDepartment: rule.fallback_department,
        resolvedRole: rule.fallback_role,
        resolvedUserId: fallbackUserId,
        triggeredBy,
        warningMessage: null,
      });
      return { userId: fallbackUserId, method: 'fallback', department: rule.fallback_department, role: rule.fallback_role, ruleId: rule.id };
    }
  }

  const warning = `No active user found for ${rule.department}/${rule.role}` +
    (rule.fallback_department ? ` or fallback ${rule.fallback_department}/${rule.fallback_role}` : '');
  console.warn(`[EPC-Assignment] ${workflowCode} → UNASSIGNED: ${warning}`);
  await writeAuditLog({
    projectId,
    workflowCode,
    stageGate: rule.stage_gate,
    actionType: rule.action_type,
    ruleId: rule.id,
    resolutionMethod: 'unassigned',
    resolvedDepartment: null,
    resolvedRole: null,
    resolvedUserId: null,
    triggeredBy,
    warningMessage: warning,
  });
  return { userId: null, method: 'unassigned', department: null, role: null, ruleId: rule.id, warningMessage: warning };
}

export async function testEpcAssignee(workflowCode: string): Promise<{
  rule: any;
  primaryUser: { id: number; username: string; department: string; role: string } | null;
  fallbackUser: { id: number; username: string; department: string; role: string } | null;
  resolution: 'primary' | 'fallback' | 'unassigned';
  message: string;
}> {
  const ruleResult = await db.execute(
    sql`SELECT * FROM epc_assignment_rules
        WHERE workflow_code = ${workflowCode}
          AND is_active = true
        ORDER BY id ASC
        LIMIT 1`
  );

  if (ruleResult.rows.length === 0) {
    return { rule: null, primaryUser: null, fallbackUser: null, resolution: 'unassigned', message: `No active rule for '${workflowCode}'` };
  }

  const rule = ruleResult.rows[0] as any;

  const primaryResult = await db.execute(
    sql`SELECT id, username, department, role FROM users
        WHERE department = ${rule.department}
          AND role = ${rule.role}
          AND is_active = true
        ORDER BY id ASC
        LIMIT 1`
  );
  const primaryUser = primaryResult.rows.length > 0 ? primaryResult.rows[0] as any : null;

  if (primaryUser) {
    return { rule, primaryUser, fallbackUser: null, resolution: 'primary', message: `Will assign to: ${primaryUser.username} (${primaryUser.department} / ${primaryUser.role}) — primary match` };
  }

  let fallbackUser = null;
  if (rule.fallback_department && rule.fallback_role) {
    const fallbackResult = await db.execute(
      sql`SELECT id, username, department, role FROM users
          WHERE department = ${rule.fallback_department}
            AND role = ${rule.fallback_role}
            AND is_active = true
          ORDER BY id ASC
          LIMIT 1`
    );
    fallbackUser = fallbackResult.rows.length > 0 ? fallbackResult.rows[0] as any : null;
  }

  if (fallbackUser) {
    return { rule, primaryUser: null, fallbackUser, resolution: 'fallback', message: `Will assign to: ${fallbackUser.username} (${fallbackUser.department} / ${fallbackUser.role}) — fallback used (no user for ${rule.department}/${rule.role})` };
  }

  return {
    rule,
    primaryUser: null,
    fallbackUser: null,
    resolution: 'unassigned',
    message: `Unassigned — no active user found for ${rule.department}/${rule.role}` +
      (rule.fallback_department ? ` or fallback ${rule.fallback_department}/${rule.fallback_role}` : ''),
  };
}
